import { getPool } from '../../../lib/db.js';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await getPool().query('select 1');
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
