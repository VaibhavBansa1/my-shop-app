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

export async function PATCH(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const payload = await request.json();
    if (!payload.name || !payload.category || !payload.sku) {
      return NextResponse.json({ error: 'name, category and sku are required' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.query(
      `update products
       set name = $1,
           category = $2,
           sku = $3,
           cost = $4,
           price = $5,
           gst_rate = $6,
           hsn_code = $7,
           stock = $8,
           min_stock = $9,
           supplier = $10
       where id = $11
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
        productId,
      ],
    );

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(mapProduct(result.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'SKU already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.query('delete from products where id = $1 returning id', [productId]);
    if (!result.rows.length) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Product is used in transactions and cannot be deleted' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
