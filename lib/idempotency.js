// Idempotency-Key support (like Stripe): the same key + same request body returns the first response;
// a parallel duplicate gets 409 "still processing"; the same key with a different body is refused.
import { createHash } from 'node:crypto';
import { withOrg } from './db.js';
import { AppError, badRequest, conflict } from './errors.js';

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export async function idempotent(request, db, body, run) {
  const key = request.headers.get('idempotency-key');
  if (!key) return { status: 201, data: await run(), replayed: false };
  if (!KEY_RE.test(key)) throw badRequest('Idempotency-Key must be 8-100 letters, digits, _ or -.');
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  // Claim the key in its own committed transaction so parallel duplicates see it.
  const claim = await withOrg(db, async (c) => {
    const ins = await c.query(
      `insert into idempotency_keys (org_id, user_id, key, request_hash) values ($1, $2, $3, $4)
       on conflict do nothing returning key`, [db.orgId, db.userId, key, hash]);
    if (ins.rowCount) return { fresh: true };
    const { rows } = await c.query('select request_hash, status, response from idempotency_keys where org_id = $1 and user_id = $2 and key = $3', [db.orgId, db.userId, key]);
    return { fresh: false, row: rows[0] };
  });
  if (!claim.fresh) {
    if (claim.row.request_hash !== hash) throw new AppError(422, 'idempotency_mismatch', 'This Idempotency-Key was already used for a different request.');
    if (claim.row.status == null) throw conflict('The same request is still being processed. Please wait a moment.');
    return { status: claim.row.status, data: claim.row.response, replayed: true };
  }
  try {
    // The stored response is written inside the same transaction as the bill (run passes it as beforeCommit),
    // so a crash can never leave a saved bill with a key stuck in "still processing".
    const store = (c, result) => c.query('update idempotency_keys set status = 201, response = $4 where org_id = $1 and user_id = $2 and key = $3', [db.orgId, db.userId, key, result]);
    let stored = false;
    const data = await run(async (c, result) => { await store(c, result); stored = true; });
    if (!stored) await withOrg(db, (c) => store(c, data));   // callers that cannot pass it through
    return { status: 201, data, replayed: false };
  } catch (e) {
    // Failed requests release the key so the client can fix the problem and retry with it.
    await withOrg(db, (c) => c.query('delete from idempotency_keys where org_id = $1 and user_id = $2 and key = $3', [db.orgId, db.userId, key])).catch(() => {});
    throw e;
  }
}
