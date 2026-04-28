import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapProduct } from '../../../lib/db';

export async function POST(request) {
  try {
    await ensureSchema();
    const payload = await request.json();
    if (!payload.name || !payload.category || !payload.sku) {
      return NextResponse.json({ error: 'name, category and sku are required' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.query(
      `insert into products (id, name, category, sku, cost, price, gst_rate, hsn_code, stock, min_stock, supplier)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        payload.name,
        payload.category,
        payload.sku,
        payload.cost ?? 0,
        payload.price ?? 0,
        payload.gstRate ?? 0,
        payload.hsnCode ?? '',
        payload.stock ?? 0,
        payload.minStock ?? 0,
        payload.supplier ?? '',
      ],
    );

    return NextResponse.json(mapProduct(result.rows[0]), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
