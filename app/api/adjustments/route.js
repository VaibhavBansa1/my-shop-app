import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapAdjustment } from '../../../lib/db';

export async function POST(request) {
  const db = getDb();
  const client = await db.connect();

  try {
    await ensureSchema();
    const payload = await request.json();

    if (!payload.productId || payload.delta === undefined || !payload.reason) {
      return NextResponse.json({ error: 'productId, delta and reason are required' }, { status: 400 });
    }

    await client.query('begin');
    await client.query('update products set stock = stock + $1 where id = $2', [payload.delta, payload.productId]);
    const result = await client.query(
      `insert into adjustments (id, product_id, delta, reason, notes)
       values (gen_random_uuid(), $1, $2, $3, $4)
       returning *`,
      [payload.productId, payload.delta, payload.reason, payload.notes ?? ''],
    );
    await client.query('commit');

    return NextResponse.json(mapAdjustment(result.rows[0]), { status: 201 });
  } catch (error) {
    await client.query('rollback');
    return NextResponse.json({ error: 'Failed to record adjustment' }, { status: 500 });
  } finally {
    client.release();
  }
}
