'use client';
// Tiny fetch wrapper for the /api/v1 REST API (same API the native app will use).
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = `/api/v1${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...qs].length) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Upload a Blob as the raw request body (used for invoice photos). */
export async function apiUpload(path, blob) {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Downscale a photo in the browser to at most `max` px on the long side, as JPEG. */
export async function shrinkImage(file, max = 2000, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image.'))), 'image/jpeg', quality));
}
