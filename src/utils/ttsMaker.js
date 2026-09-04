import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

function tmpFile(ext) {
  return path.join(os.tmpdir(), `wa-tts-${crypto.randomBytes(6).toString('hex')}.${ext}`);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
    proc.on('error', reject);
  });
}

const MAX_CHUNK = 195; // Google Translate TTS endpoint truncates long text; stay safely under its limit

function splitText(text) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf(' ', MAX_CHUNK);
    if (cut <= 0) cut = MAX_CHUNK;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trim();
  }
  return chunks;
}

async function fetchTtsChunk(text, lang) {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}` +
    `&client=tw-ob&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Referer: 'https://translate.google.com/'
    }
  });
  if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
  const arrBuf = await res.arrayBuffer();
  return Buffer.from(arrBuf);
}

/**
 * Convert text into an OGG/Opus buffer ready to send as a WhatsApp voice note.
 * lang: 'en' | 'hi' etc (any Google Translate TTS supported code)
 */
export async function textToSpeechOgg(text, lang = 'en') {
  const chunks = splitText(text);
  const mp3Buffers = [];
  for (const chunk of chunks) {
    mp3Buffers.push(await fetchTtsChunk(chunk, lang));
  }
  const combinedMp3 = Buffer.concat(mp3Buffers);

  const inFile = tmpFile('mp3');
  const outFile = tmpFile('ogg');
  await fs.writeFile(inFile, combinedMp3);
  try {
    await runFfmpeg([
      '-i', inFile,
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-vn',
      '-ar', '48000',
      '-ac', '1',
      outFile
    ]);
    return await fs.readFile(outFile);
  } finally {
    await fs.rm(inFile, { force: true });
    await fs.rm(outFile, { force: true });
  }
}
