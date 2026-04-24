import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapExpense } from '../../../lib/db';

export async function POST(request) {
  try {
    await ensureSchema();
    const payload = await request.json();
    if (!payload.label || !payload.category || payload.amount === undefined) {
      return NextResponse.json({ error: 'label, category and amount are required' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.query(
      `insert into expenses (id, label, category, amount, notes)
       values (gen_random_uuid(), $1, $2, $3, $4)
       returning *`,
      [payload.label, payload.category, payload.amount, payload.notes ?? ''],
    );

    return NextResponse.json(mapExpense(result.rows[0]), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
