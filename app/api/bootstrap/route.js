import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapAdjustment, mapExpense, mapInvoice, mapInvoiceItem, mapProduct, mapPurchase, mapSale } from '../../../lib/db';

export async function GET() {
  try {
    await ensureSchema();
    const db = getDb();
    const [products, purchases, sales, adjustments, expenses, invoices, invoiceItems] = await Promise.all([
      db.query('select * from products order by created_at asc'),
      db.query('select * from purchases order by date desc'),
      db.query('select * from sales order by date desc'),
      db.query('select * from adjustments order by date desc'),
      db.query('select * from expenses order by date desc'),
      db.query('select * from invoices order by invoice_date desc, created_at desc'),
      db.query('select * from invoice_items order by id desc'),
    ]);

    return NextResponse.json({
      products: products.rows.map(mapProduct),
      purchases: purchases.rows.map(mapPurchase),
      sales: sales.rows.map(mapSale),
      adjustments: adjustments.rows.map(mapAdjustment),
      expenses: expenses.rows.map(mapExpense),
      invoices: invoices.rows.map(mapInvoice),
      invoiceItems: invoiceItems.rows.map(mapInvoiceItem),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}
