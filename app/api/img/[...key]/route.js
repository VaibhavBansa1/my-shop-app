// Serves image variants by signed URL. Cacheable by browsers and any CDN in front of the app:
// keys are content-addressed (a new picture gets a new key) and the signature expiry is in the URL.
import { verifySignature } from '../../../../lib/images.js';
import { getObject, isValidKey } from '../../../../lib/storage.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const key = (await params).key.join('/');
  const u = new URL(request.url);
  const exp = u.searchParams.get('e'); const sig = u.searchParams.get('s');
  if (!isValidKey(key) || !verifySignature(key, exp, sig)) return new Response('not found', { status: 404 });
  const etag = `"${key.split('/').pop().replace('.webp', '')}"`;
  const maxAge = Math.max(60, Number(exp) - Math.floor(Date.now() / 1000));
  const headers = {
    'content-type': 'image/webp', etag,
    'cache-control': `public, max-age=${maxAge}, immutable`,
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    'cross-origin-resource-policy': 'same-site',
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const body = await getObject(key);
  if (!body) return new Response('not found', { status: 404 });
  return new Response(body, { status: 200, headers: { ...headers, 'content-length': String(body.length) } });
}
