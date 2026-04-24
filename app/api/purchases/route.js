import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapPurchase } from '../../../lib/db';

export async function POST(request) {
  const db = getDb();
  const client = await db.connect();

  try {
    await ensureSchema();
    const payload = await request.json();

    if (!payload.productId || !payload.quantity) {
      return NextResponse.json({ error: 'productId and quantity are required' }, { status: 400 });
    }

    await client.query('begin');
    await client.query('update products set stock = stock + $1 where id = $2', [payload.quantity, payload.productId]);
    const result = await client.query(
      `insert into purchases (id, product_id, quantity, cost, reference, notes)
       values (gen_random_uuid(), $1, $2, $3, $4, $5)
       returning *`,
      [payload.productId, payload.quantity, payload.cost ?? 0, payload.reference ?? '', payload.notes ?? ''],
    );
    await client.query('commit');

    return NextResponse.json(mapPurchase(result.rows[0]), { status: 201 });
  } catch (error) {
    await client.query('rollback');
    return NextResponse.json({ error: 'Failed to record purchase' }, { status: 500 });
  } finally {
    client.release();
  }
}
