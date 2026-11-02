// Image helpers for the app: absolute URLs for server images and photo upload (resized on the phone).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getServerUrl } from './config.js';
import { api } from './api.js';

let serverUrl = '';
getServerUrl().then((u) => { serverUrl = u; });

/** Server image URLs are relative (/api/img/…) unless a CDN host is configured. */
export const absUrl = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : `${serverUrl}${u}`);

/** Resize to <= 1600 px JPEG on the phone, then upload; returns {id, urls}. */
export async function uploadPhoto(orgId, asset, kind = 'item') {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? 0) > 1600 || (asset.height ?? 0) > 1600) ctx.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const blob = await (await fetch(out.uri)).blob();
  return api.upload(`/orgs/${orgId}/images?kind=${kind}`, blob, 'image/jpeg');
}
