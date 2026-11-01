// Invoice OCR on the phone. Preferred: on-device text recognition (Google ML Kit via
// expo-text-extractor) — only the recognised TEXT is sent to the server for parsing.
// Fallback (Expo Go, unsupported device, or the user's choice): upload a downscaled
// photo for server OCR. Photos are never stored by the app or the server.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api } from './api.js';

let extractor = null;
try {
  // Native module; missing in Expo Go. Must not crash the app if absent.
  // eslint-disable-next-line global-require
  extractor = require('expo-text-extractor');
} catch { extractor = null; }

export const deviceOcrAvailable = () => Boolean(extractor?.isSupported);

async function downscale(uri, maxSide = 2000) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: maxSide });           // keeps aspect ratio when only width is given
  const img = await ctx.renderAsync();
  return img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
}

/** @returns {Promise<object>} purchase draft from the server (/ocr/parse or /ocr/invoice) */
export async function scanInvoice(orgId, photo, { preferDevice = true } = {}) {
  const small = await downscale(photo.uri, Math.min(2000, Math.max(photo.width ?? 2000, photo.height ?? 2000)));
  if (preferDevice && deviceOcrAvailable()) {
    try {
      const lines = await extractor.extractTextFromImage(small.uri);
      const text = (lines ?? []).join('\n').trim();
      if (text.length > 20) return api.post(`/orgs/${orgId}/ocr/parse`, { text: text.slice(0, 50_000) });
    } catch { /* fall through to server OCR */ }
  }
  const blob = await (await fetch(small.uri)).blob();
  return api.upload(`/orgs/${orgId}/ocr/invoice`, blob, 'image/jpeg');
}
