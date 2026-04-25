import { Pool } from 'pg';

let pool;
let schemaReady;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();
      const client = await db.connect();
      try {
        await client.query(`
          create extension if not exists pgcrypto;

          create table if not exists products (
            id uuid primary key,
            name text not null,
            category text not null,
            sku text not null unique,
            cost numeric(12,2) not null default 0,
            price numeric(12,2) not null default 0,
            gst_rate numeric(5,2) not null default 0,
            hsn_code text not null default '',
            stock integer not null default 0,
            min_stock integer not null default 0,
            supplier text not null default '',
            created_at timestamptz not null default now()
          );

          create table if not exists purchases (
            id uuid primary key,
            date timestamptz not null default now(),
            product_id uuid not null references products(id) on delete cascade,
            quantity integer not null,
            cost numeric(12,2) not null,
            reference text not null default '',
            notes text not null default ''
          );

          create table if not exists sales (
            id uuid primary key,
            date timestamptz not null default now(),
            product_id uuid not null references products(id) on delete cascade,
            quantity integer not null,
            price numeric(12,2) not null,
            channel text not null default '',
            notes text not null default ''
          );

          create table if not exists invoices (
            id uuid primary key,
            invoice_number text not null unique,
            invoice_date timestamptz not null default now(),
            customer_name text not null default '',
            customer_phone text not null default '',
            customer_gstin text not null default '',
            payment_mode text not null default '',
            source text not null default 'manual',
            place_of_supply_code text not null default 'MH',
            is_interstate boolean not null default false,
            subtotal numeric(12,2) not null default 0,
            cgst_amount numeric(12,2) not null default 0,
            sgst_amount numeric(12,2) not null default 0,
            igst_amount numeric(12,2) not null default 0,
            total_tax numeric(12,2) not null default 0,
            total_amount numeric(12,2) not null default 0,
            notes text not null default '',
            created_at timestamptz not null default now()
          );

          create table if not exists invoice_items (
            id uuid primary key,
            invoice_id uuid not null references invoices(id) on delete cascade,
            product_id uuid not null references products(id) on delete restrict,
            product_name text not null,
            hsn_code text not null default '',
            quantity integer not null,
            rate numeric(12,2) not null,
            gst_rate numeric(5,2) not null default 0,
            taxable_amount numeric(12,2) not null default 0,
            cgst_amount numeric(12,2) not null default 0,
            sgst_amount numeric(12,2) not null default 0,
            igst_amount numeric(12,2) not null default 0,
            line_total numeric(12,2) not null default 0
          );

          create table if not exists adjustments (
            id uuid primary key,
            date timestamptz not null default now(),
            product_id uuid not null references products(id) on delete cascade,
            delta integer not null,
            reason text not null,
            notes text not null default ''
          );

          create table if not exists expenses (
            id uuid primary key,
            date timestamptz not null default now(),
            label text not null,
            category text not null,
            amount numeric(12,2) not null,
            notes text not null default ''
          );

          alter table products add column if not exists gst_rate numeric(5,2) not null default 0;
          alter table products add column if not exists hsn_code text not null default '';
        `);

        const countResult = await client.query('select count(*)::int as count from products');
        if (countResult.rows[0].count === 0) {
          await client.query(`
            insert into products (id, name, category, sku, cost, price, gst_rate, hsn_code, stock, min_stock, supplier)
            values
              (gen_random_uuid(), 'Basmati Rice 5kg', 'Grocery', 'RICE-5KG', 420, 510, 5, '1006', 24, 8, 'Annapurna Traders'),
              (gen_random_uuid(), 'Mustard Oil 1L', 'Essentials', 'OIL-1L', 145, 170, 5, '1514', 30, 12, 'Shree Distributors'),
              (gen_random_uuid(), 'Detergent Powder 1kg', 'Household', 'DET-1KG', 72, 89, 18, '3402', 18, 10, 'CleanHome Supplies')
          `);
        }
      } finally {
        client.release();
      }
    })();
  }

  return schemaReady;
}

export function getDb() {
  return getPool();
}

export function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sku: row.sku,
    cost: Number(row.cost),
    price: Number(row.price),
    gstRate: Number(row.gst_rate),
    hsnCode: row.hsn_code,
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    supplier: row.supplier,
  };
}

export function mapPurchase(row) {
  return {
    id: row.id,
    date: row.date,
    productId: row.product_id,
    quantity: Number(row.quantity),
    cost: Number(row.cost),
    reference: row.reference,
    notes: row.notes,
  };
}

export function mapSale(row) {
  return {
    id: row.id,
    date: row.date,
    productId: row.product_id,
    quantity: Number(row.quantity),
    price: Number(row.price),
    channel: row.channel,
    notes: row.notes,
  };
}

export function mapAdjustment(row) {
  return {
    id: row.id,
    date: row.date,
    productId: row.product_id,
    delta: Number(row.delta),
    reason: row.reason,
    notes: row.notes,
  };
}

export function mapExpense(row) {
  return {
    id: row.id,
    date: row.date,
    label: row.label,
    category: row.category,
    amount: Number(row.amount),
    notes: row.notes,
  };
}

export function mapInvoice(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerGstin: row.customer_gstin,
    paymentMode: row.payment_mode,
    source: row.source,
    placeOfSupplyCode: row.place_of_supply_code,
    isInterstate: row.is_interstate,
    subtotal: Number(row.subtotal),
    cgstAmount: Number(row.cgst_amount),
    sgstAmount: Number(row.sgst_amount),
    igstAmount: Number(row.igst_amount),
    totalTax: Number(row.total_tax),
    totalAmount: Number(row.total_amount),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapInvoiceItem(row) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    productId: row.product_id,
    productName: row.product_name,
    hsnCode: row.hsn_code,
    quantity: Number(row.quantity),
    rate: Number(row.rate),
    gstRate: Number(row.gst_rate),
    taxableAmount: Number(row.taxable_amount),
    cgstAmount: Number(row.cgst_amount),
    sgstAmount: Number(row.sgst_amount),
    igstAmount: Number(row.igst_amount),
    lineTotal: Number(row.line_total),
  };
}
