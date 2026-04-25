import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapSale } from '../../../lib/db';

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
    await client.query('update products set stock = stock - $1 where id = $2', [payload.quantity, payload.productId]);
    const result = await client.query(
      `insert into sales (id, product_id, quantity, price, channel, notes)
       values (gen_random_uuid(), $1, $2, $3, $4, $5)
       returning *`,
      [payload.productId, payload.quantity, payload.price ?? 0, payload.channel ?? '', payload.notes ?? ''],
    );
    await client.query('commit');

    return NextResponse.json(mapSale(result.rows[0]), { status: 201 });
  } catch (error) {
    await client.query('rollback');
    return NextResponse.json({ error: 'Failed to record sale' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request) {
  const db = getDb();
  const client = await db.connect();

  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    if (!saleId) {
      return NextResponse.json({ error: 'saleId is required' }, { status: 400 });
    }

    const payload = await request.json();
    if (!payload.productId || !payload.quantity) {
      return NextResponse.json({ error: 'productId and quantity are required' }, { status: 400 });
    }

    await client.query('begin');
    const existing = await client.query('select * from sales where id = $1 limit 1', [saleId]);
    if (!existing.rows.length) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const oldSale = existing.rows[0];
    await client.query('update products set stock = stock + $1 where id = $2', [oldSale.quantity, oldSale.product_id]);
    await client.query('update products set stock = stock - $1 where id = $2', [payload.quantity, payload.productId]);

    const result = await client.query(
      `update sales
       set product_id = $1,
           quantity = $2,
           price = $3,
           channel = $4,
           notes = $5
       where id = $6
       returning *`,
      [payload.productId, payload.quantity, payload.price ?? 0, payload.channel ?? '', payload.notes ?? '', saleId],
    );

    await client.query('commit');
    return NextResponse.json(mapSale(result.rows[0]));
  } catch (error) {
    await client.query('rollback');
    return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request) {
  const db = getDb();
  const client = await db.connect();

  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');
    if (!saleId) {
      return NextResponse.json({ error: 'saleId is required' }, { status: 400 });
    }

    await client.query('begin');
    const existing = await client.query('select * from sales where id = $1 limit 1', [saleId]);
    if (!existing.rows.length) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const oldSale = existing.rows[0];
    await client.query('update products set stock = stock + $1 where id = $2', [oldSale.quantity, oldSale.product_id]);
    await client.query('delete from sales where id = $1', [saleId]);

    await client.query('commit');
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query('rollback');
    return NextResponse.json({ error: 'Failed to delete sale' }, { status: 500 });
  } finally {
    client.release();
  }
}
