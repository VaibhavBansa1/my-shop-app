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

export async function PATCH(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get('expenseId');
    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 });
    }

    const payload = await request.json();
    if (!payload.label || !payload.category || payload.amount === undefined) {
      return NextResponse.json({ error: 'label, category and amount are required' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.query(
      `update expenses
       set label = $1,
           category = $2,
           amount = $3,
           notes = $4
       where id = $5
       returning *`,
      [payload.label, payload.category, payload.amount, payload.notes ?? '', expenseId],
    );

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    return NextResponse.json(mapExpense(result.rows[0]));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get('expenseId');
    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.query('delete from expenses where id = $1 returning id', [expenseId]);
    if (!result.rows.length) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
