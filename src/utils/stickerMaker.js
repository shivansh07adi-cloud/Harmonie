import sharp from 'sharp';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import webpmux from 'node-webpmux';

function tmpFile(ext) {
  return path.join(os.tmpdir(), `wa-${crypto.randomBytes(6).toString('hex')}.${ext}`);
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

/**
 * Convert a static image buffer into a WhatsApp-ready webp sticker buffer.
 */
export async function imageToWebp(buffer) {
  return sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 85 })
    .toBuffer();
}

/**
 * Convert a video/gif buffer into an animated WhatsApp-ready webp sticker buffer.
 * WhatsApp animated stickers must be <= ~6s and reasonably small.
 */
export async function videoToWebp(buffer, { seconds = 6 } = {}) {
  const inFile = tmpFile('input');
  const outFile = tmpFile('webp');
  await fs.writeFile(inFile, buffer);
  try {
    await runFfmpeg([
      '-i', inFile,
      '-t', String(seconds),
      '-vf', "scale='if(gt(iw,ih),512,-1)':'if(gt(iw,ih),-1,512)',fps=15",
      '-loop', '0',
      '-preset', 'default',
      '-an',
      '-vsync', '0',
      '-c:v', 'libwebp',
      outFile
    ]);
    return await fs.readFile(outFile);
  } finally {
    await fs.rm(inFile, { force: true });
    await fs.rm(outFile, { force: true });
  }
}

/**
 * Write pack/author EXIF metadata into a webp sticker buffer (WhatsApp sticker metadata).
 */
export async function addStickerMetadata(webpBuffer, { packName = '', authorName = '' } = {}) {
  const img = new webpmux.Image();
  await img.load(webpBuffer);
  const json = {
    'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
    'sticker-pack-name': packName || '',
    'sticker-pack-publisher': authorName || '',
    emojis: ['🤖']
  };
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  img.exif = exif;
  return img.save(null);
}

/**
 * Extract the sticker-pack/author metadata already embedded in an incoming webp, if any.
 */
export async function readStickerMetadata(webpBuffer) {
  try {
    const img = new webpmux.Image();
    await img.load(webpBuffer);
    if (!img.exif) return null;
    const jsonStart = 22; // skip the fixed EXIF/TIFF header we write above
    const raw = img.exif.slice(jsonStart).toString('utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
