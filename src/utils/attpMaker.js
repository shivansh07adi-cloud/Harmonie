import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

function tmpFile(ext) {
  return path.join(os.tmpdir(), `wa-attp-${crypto.randomBytes(6).toString('hex')}.${ext}`);
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

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '\u2019')
    .slice(0, 60);
}

/**
 * Build an animated, colour-cycling text sticker (classic "attp"-style meme sticker).
 */
export async function textToAnimatedSticker(text) {
  const outFile = tmpFile('webp');
  const safeText = escapeDrawtext(text || 'wow');
  const fontFile = FONT_PATH.replace(/:/g, '\\:');

  const source = 'color=c=black:s=512x512:d=2:r=15';
  const filterComplex =
    `[0:v]drawtext=fontfile='${fontFile}':text='${safeText}':fontcolor=white:fontsize=64:` +
    `x=(w-text_w)/2:y=(h-text_h)/2:box=0,hue='H=2*PI*t:s=1'[out]`;

  try {
    await runFfmpeg([
      '-f', 'lavfi',
      '-i', source,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-loop', '0',
      '-an',
      '-vsync', '0',
      '-c:v', 'libwebp',
      outFile
    ]);
    return await fs.readFile(outFile);
  } finally {
    await fs.rm(outFile, { force: true });
  }
}
