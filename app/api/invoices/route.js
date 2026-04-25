import { NextResponse } from 'next/server';
import { ensureSchema, getDb, mapInvoice, mapInvoiceItem } from '../../../lib/db';

const SHOP_STATE_CODE = 'MH';

function toMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

function parseItemsFromText(linesText) {
  const rows = String(linesText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return rows.map((line, index) => {
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length < 4) {
      throw new Error(`Invalid row ${index + 1}. Use: item,qty,rate,gst%,hsn(optional)`);
    }

    const [name, quantityRaw, rateRaw, gstRateRaw, hsnCodeRaw] = parts;
    const quantity = Number(quantityRaw);
    const rate = Number(rateRaw);
    const gstRate = Number(gstRateRaw);

    if (!name) {
      throw new Error(`Invalid row ${index + 1}. Item name is required.`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid row ${index + 1}. Quantity must be a whole number > 0.`);
    }
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error(`Invalid row ${index + 1}. Rate must be >= 0.`);
    }
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 28) {
      throw new Error(`Invalid row ${index + 1}. GST must be between 0 and 28.`);
    }

    return {
      name,
      quantity,
      rate,
      gstRate,
      hsnCode: hsnCodeRaw || '',
    };
  });
}

export async function GET() {
  try {
    await ensureSchema();
    const db = getDb();
    const [invoices, items] = await Promise.all([
      db.query('select * from invoices order by invoice_date desc, created_at desc'),
      db.query('select * from invoice_items order by id desc'),
    ]);

    return NextResponse.json({
      invoices: invoices.rows.map(mapInvoice),
      invoiceItems: items.rows.map(mapInvoiceItem),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}

export async function POST(request) {
  const db = getDb();
  const client = await db.connect();

  try {
    await ensureSchema();
    const payload = await request.json();

    const invoiceNumber = String(payload.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      return NextResponse.json({ error: 'invoiceNumber is required' }, { status: 400 });
    }

    const items = Array.isArray(payload.items) && payload.items.length
      ? payload.items
      : parseItemsFromText(payload.linesText);

    if (!items.length) {
      return NextResponse.json({ error: 'At least one invoice line is required' }, { status: 400 });
    }

    const placeOfSupplyCode = String(payload.placeOfSupplyCode || SHOP_STATE_CODE).trim().toUpperCase();
    const isInterstate = placeOfSupplyCode !== SHOP_STATE_CODE;
    const invoiceDate = payload.invoiceDate || new Date().toISOString();
    const affectStock = Boolean(payload.affectStock);

    await client.query('begin');

    let subtotal = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    const invoiceResult = await client.query(
      `insert into invoices (
         id, invoice_number, invoice_date, customer_name, customer_phone, customer_gstin,
         payment_mode, source, place_of_supply_code, is_interstate, notes
       )
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        invoiceNumber,
        invoiceDate,
        payload.customerName || '',
        payload.customerPhone || '',
        payload.customerGstin || '',
        payload.paymentMode || '',
        payload.source || 'digitized',
        placeOfSupplyCode,
        isInterstate,
        payload.notes || '',
      ],
    );

    const invoice = invoiceResult.rows[0];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const lineTaxable = toMoney(item.quantity * item.rate);
      const lineTax = toMoney((lineTaxable * Number(item.gstRate || 0)) / 100);
      const lineCgst = isInterstate ? 0 : toMoney(lineTax / 2);
      const lineSgst = isInterstate ? 0 : toMoney(lineTax / 2);
      const lineIgst = isInterstate ? lineTax : 0;
      const lineTotal = toMoney(lineTaxable + lineTax);

      subtotal += lineTaxable;
      cgstAmount += lineCgst;
      sgstAmount += lineSgst;
      igstAmount += lineIgst;

      const productLookup = await client.query(
        'select * from products where lower(name) = lower($1) limit 1',
        [item.name],
      );

      let product = productLookup.rows[0];

      if (!product) {
        const sku = `DIGI-${Date.now()}-${index + 1}`;
        const productInsert = await client.query(
          `insert into products (id, name, category, sku, cost, price, gst_rate, hsn_code, stock, min_stock, supplier)
           values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 0, 0, $8)
           returning *`,
          [item.name, payload.defaultCategory || 'Digitized', sku, item.rate, item.rate, item.gstRate || 0, item.hsnCode || '', 'Legacy Invoice Import'],
        );
        product = productInsert.rows[0];
      }

      await client.query(
        `insert into invoice_items (
           id, invoice_id, product_id, product_name, hsn_code, quantity, rate,
           gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
         )
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          invoice.id,
          product.id,
          item.name,
          item.hsnCode || '',
          item.quantity,
          item.rate,
          item.gstRate || 0,
          lineTaxable,
          lineCgst,
          lineSgst,
          lineIgst,
          lineTotal,
        ],
      );

      await client.query(
        `insert into sales (id, date, product_id, quantity, price, channel, notes)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [invoiceDate, product.id, item.quantity, item.rate, payload.paymentMode || '', `Invoice ${invoiceNumber}`],
      );

      if (affectStock) {
        await client.query('update products set stock = stock - $1 where id = $2', [item.quantity, product.id]);
      }
    }

    const subtotalFinal = toMoney(subtotal);
    const cgstFinal = toMoney(cgstAmount);
    const sgstFinal = toMoney(sgstAmount);
    const igstFinal = toMoney(igstAmount);
    const totalTax = toMoney(cgstFinal + sgstFinal + igstFinal);
    const totalAmount = toMoney(subtotalFinal + totalTax);

    const updatedInvoiceResult = await client.query(
      `update invoices
       set subtotal = $1,
           cgst_amount = $2,
           sgst_amount = $3,
           igst_amount = $4,
           total_tax = $5,
           total_amount = $6
       where id = $7
       returning *`,
      [subtotalFinal, cgstFinal, sgstFinal, igstFinal, totalTax, totalAmount, invoice.id],
    );

    const createdItems = await client.query(
      'select * from invoice_items where invoice_id = $1 order by product_name asc',
      [invoice.id],
    );

    await client.query('commit');

    return NextResponse.json(
      {
        invoice: mapInvoice(updatedInvoiceResult.rows[0]),
        invoiceItems: createdItems.rows.map(mapInvoiceItem),
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query('rollback');

    if (error.code === '23505') {
      return NextResponse.json({ error: 'Invoice number already exists' }, { status: 409 });
    }

    return NextResponse.json({ error: error.message || 'Failed to create invoice' }, { status: 500 });
  } finally {
    client.release();
  }
}
