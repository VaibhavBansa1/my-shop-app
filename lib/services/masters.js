// Masters: account groups, ledgers, units, stock items. All run under withOrg (RLS).
import { withOrg } from '../db.js';
import { audit } from './audit.js';
import { toPaise, toMilli, paiseToStr, milliToStr, num } from '../money.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { decryptField as dec, encryptField as enc } from '../crypto.js';
import { imageUrls } from '../images.js';
import { emitEvent } from '../events.js';

// ---------- groups ----------
export const mapGroup = (r) => ({ id: r.id, name: r.name, code: r.code, parentId: r.parent_id, nature: r.nature,
  affectsGrossProfit: r.affects_gross_profit, isSystem: r.is_system });

export async function listGroups(db) {
  return withOrg(db, async (c) => (await c.query('select * from account_groups order by name')).rows.map(mapGroup));
}

export async function createGroup(db, { name, parentId }) {
  return withOrg(db, async (c) => {
    const p = await c.query('select * from account_groups where id = $1', [parentId]);
    if (!p.rowCount) throw notFound('Parent group not found.');
    const { rows } = await c.query(
      `insert into account_groups (org_id, name, parent_id, nature, affects_gross_profit)
       values ($1, $2, $3, $4, $5) returning *`,
      [db.orgId, name, parentId, p.rows[0].nature, p.rows[0].affects_gross_profit]);
    await audit(c, db, 'group.create', 'account_group', rows[0].id, { name });
    return mapGroup(rows[0]);
  });
}

// ---------- ledgers ----------
export const mapLedger = (r) => ({
  id: r.id, name: r.name, code: r.code, groupId: r.group_id, groupName: r.group_name, groupCode: r.group_code,
  nature: r.nature, openingBalance: num(r.opening_balance), gstin: r.gstin, stateCode: r.state_code,
  phone: dec(r.phone), email: dec(r.email), address: dec(r.address), isSystem: r.is_system, isActive: r.is_active,
});

const LEDGER_SELECT = `select l.*, g.name as group_name, g.code as group_code, g.nature
  from ledgers l join account_groups g on g.id = l.group_id`;

export async function listLedgers(db, { q, groupCode } = {}) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      `${LEDGER_SELECT}
        where ($1::text is null or l.name ilike '%' || $1 || '%')
          and ($2::text is null or g.code = $2 or g.parent_id in (select id from account_groups where code = $2))
        order by l.name limit 1000`,
      [q || null, groupCode || null]);
    return rows.map(mapLedger);
  });
}

export async function getLedger(db, id) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(`${LEDGER_SELECT} where l.id = $1`, [id]);
    if (!rows.length) throw notFound('Ledger not found.');
    return mapLedger(rows[0]);
  });
}

/** Cashiers may only create customer/supplier ledgers (party.create). */
/** Insert one ledger inside an existing transaction (used by createLedger and CSV import). */
export async function insertLedger(c, db, input, { partyOnly = false, auditIt = true } = {}) {
  const g = await c.query('select code, parent_id from account_groups where id = $1', [input.groupId]);
  if (!g.rowCount) throw notFound('Group not found.');
  if (partyOnly && !['sundry_debtors', 'sundry_creditors'].includes(g.rows[0].code)) {
    throw forbidden('You can only create customer or supplier ledgers.');
  }
  const { rows } = await c.query(
    `insert into ledgers (org_id, group_id, name, opening_balance, gstin, state_code, phone, email, address, is_active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [db.orgId, input.groupId, input.name, paiseToStr(toPaise(input.openingBalance ?? 0, 'opening balance')),
     input.gstin || null, input.stateCode || (input.gstin ? input.gstin.slice(0, 2) : null),
     enc(input.phone ?? ''), enc(input.email ?? ''), enc(input.address ?? ''), input.isActive ?? true]);
  if (auditIt) await audit(c, db, 'ledger.create', 'ledger', rows[0].id, { name: input.name });
  return rows[0].id;
}

export async function createLedger(db, input, opts = {}) {
  return withOrg(db, async (c) => {
    const id = await insertLedger(c, db, input, opts);
    const out = await c.query(`${LEDGER_SELECT} where l.id = $1`, [id]);
    return mapLedger(out.rows[0]);
  });
}

export async function updateLedger(db, id, input) {
  return withOrg(db, async (c) => {
    const cur = await c.query('select * from ledgers where id = $1 for update', [id]);
    if (!cur.rowCount) throw notFound('Ledger not found.');
    const l = cur.rows[0];
    const gstin = input.gstin !== undefined ? input.gstin : l.gstin;
    const state = input.stateCode !== undefined ? input.stateCode : l.state_code;
    if (gstin && state && gstin.slice(0, 2) !== state) throw badRequest(`State code ${state} does not match the GSTIN (which starts with ${gstin.slice(0, 2)}).`);
    if (l.is_system && (input.groupId !== undefined || input.name !== undefined || input.isActive === false)) {
      throw badRequest('Built-in ledgers cannot be renamed, moved or deactivated.');
    }
    const cols = { name: 'name', groupId: 'group_id', gstin: 'gstin', stateCode: 'state_code', phone: 'phone',
      email: 'email', address: 'address', isActive: 'is_active' };
    const sets = []; const vals = [];
    for (const [k, col] of Object.entries(cols)) {
      if (input[k] !== undefined) { vals.push(['phone', 'email', 'address'].includes(col) ? enc(input[k]) : input[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (input.openingBalance !== undefined) {
      vals.push(paiseToStr(toPaise(input.openingBalance, 'opening balance'))); sets.push(`opening_balance = $${vals.length}`);
    }
    if (sets.length) {
      vals.push(id);
      await c.query(`update ledgers set ${sets.join(', ')} where id = $${vals.length}`, vals);
      await audit(c, db, 'ledger.update', 'ledger', id, input);
    }
    const out = await c.query(`${LEDGER_SELECT} where l.id = $1`, [id]);
    return mapLedger(out.rows[0]);
  });
}

// ---------- units ----------
export const mapUnit = (r) => ({ id: r.id, symbol: r.symbol, name: r.name, decimals: r.decimals });
export async function listUnits(db) {
  return withOrg(db, async (c) => (await c.query('select * from units order by symbol')).rows.map(mapUnit));
}
export async function createUnit(db, input) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query('insert into units (org_id, symbol, name, decimals) values ($1,$2,$3,$4) returning *',
      [db.orgId, input.symbol, input.name, input.decimals]);
    await audit(c, db, 'unit.create', 'unit', rows[0].id, input);
    return mapUnit(rows[0]);
  });
}

// ---------- stock items ----------
export const mapItem = (r) => ({
  id: r.id, name: r.name, sku: r.sku, unitId: r.unit_id, unitSymbol: r.unit_symbol, unitDecimals: r.unit_decimals,
  hsnCode: r.hsn_code, gstRate: num(r.gst_rate), salePrice: num(r.sale_price), purchasePrice: num(r.purchase_price),
  reorderLevel: num(r.reorder_level), openingQty: num(r.opening_qty), openingRate: num(r.opening_rate),
  isActive: r.is_active, stockQty: r.stock_qty == null ? undefined : num(r.stock_qty),
  imageId: r.image_id ?? null, image: r.image_variants ? imageUrls(r.image_variants) : null,
});

const ITEM_SELECT = `select i.*, u.symbol as unit_symbol, u.decimals as unit_decimals,
    (select im.variants from images im where im.id = i.image_id) as image_variants,
    i.opening_qty + coalesce((select sum(vi.stock_qty) from voucher_items vi join vouchers v on v.id = vi.voucher_id
                              where vi.stock_item_id = i.id and v.status = 'posted'), 0) as stock_qty
  from stock_items i join units u on u.id = i.unit_id`;

export async function listItems(db, { q } = {}) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      `${ITEM_SELECT} where ($1::text is null or i.name ilike '%' || $1 || '%' or i.sku ilike '%' || $1 || '%')
       order by i.name limit 2000`, [q || null]);
    return rows.map(mapItem);
  });
}

function itemValues(input) {
  // Opening stock without a cost would be valued at zero and distort profit; default to purchase price.
  if (Number(input.openingQty || 0) > 0 && Number(input.openingRate || 0) === 0 && Number(input.purchasePrice || 0) > 0) {
    input = { ...input, openingRate: input.purchasePrice };
  }
  if (toMilli(input.openingQty ?? 0, 'opening quantity') < 0) throw new RangeError('Opening quantity cannot be negative');
  if (toMilli(input.reorderLevel ?? 0, 'reorder level') < 0) throw new RangeError('Reorder level cannot be negative');
  const gstBp = toPaise(input.gstRate ?? 0, 'GST rate');
  if (gstBp < 0 || gstBp > 10000) throw new RangeError('GST rate must be between 0 and 100');
  return {
    gst: paiseToStr(gstBp),
    sale: paiseToStr(toPaise(input.salePrice ?? 0, 'sale price')),
    purchase: paiseToStr(toPaise(input.purchasePrice ?? 0, 'purchase price')),
    reorder: milliToStr(toMilli(input.reorderLevel ?? 0, 'reorder level')),
    openingQty: milliToStr(toMilli(input.openingQty ?? 0, 'opening quantity')),
    openingRate: paiseToStr(toPaise(input.openingRate ?? 0, 'opening rate')),
  };
}

/** Insert one stock item inside an existing transaction (used by createItem and CSV import). */
export async function insertItem(c, db, input, { auditIt = true } = {}) {
  const v = itemValues(input);
  const { rows } = await c.query(
    `insert into stock_items (org_id, name, sku, unit_id, hsn_code, gst_rate, sale_price, purchase_price,
       reorder_level, opening_qty, opening_rate, is_active, image_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [db.orgId, input.name, input.sku ?? '', input.unitId, input.hsnCode ?? '', v.gst, v.sale, v.purchase, v.reorder,
     v.openingQty, v.openingRate, input.isActive ?? true, input.imageId ?? null]);
  if (auditIt) await audit(c, db, 'item.create', 'stock_item', rows[0].id, { name: input.name });
  await emitEvent(c, db, 'item.created', { stockItemId: rows[0].id, name: input.name, sku: input.sku ?? '', hsn: input.hsnCode ?? '', gstRate: v.gst, salePrice: v.sale });
  return rows[0].id;
}

export async function createItem(db, input) {
  return withOrg(db, async (c) => {
    const id = await insertItem(c, db, input);
    return mapItem((await c.query(`${ITEM_SELECT} where i.id = $1`, [id])).rows[0]);
  });
}

export async function updateItem(db, id, input) {
  return withOrg(db, async (c) => {
    const cur = await c.query('select * from stock_items where id = $1 for update', [id]);
    if (!cur.rowCount) throw notFound('Item not found.');
    const merged = {
      gstRate: input.gstRate ?? cur.rows[0].gst_rate, salePrice: input.salePrice ?? cur.rows[0].sale_price,
      purchasePrice: input.purchasePrice ?? cur.rows[0].purchase_price, reorderLevel: input.reorderLevel ?? cur.rows[0].reorder_level,
      openingQty: input.openingQty ?? cur.rows[0].opening_qty, openingRate: input.openingRate ?? cur.rows[0].opening_rate,
    };
    const v = itemValues(merged);
    await c.query(
      `update stock_items set name = coalesce($2, name), sku = coalesce($3, sku), unit_id = coalesce($4, unit_id),
         hsn_code = coalesce($5, hsn_code), gst_rate = $6, sale_price = $7, purchase_price = $8, reorder_level = $9,
         opening_qty = $10, opening_rate = $11, is_active = coalesce($12, is_active),
         image_id = case when $13::boolean then $14::uuid else image_id end where id = $1`,
      [id, input.name ?? null, input.sku ?? null, input.unitId ?? null, input.hsnCode ?? null, v.gst, v.sale,
       v.purchase, v.reorder, v.openingQty, v.openingRate, input.isActive ?? null, input.imageId !== undefined, input.imageId ?? null]);
    await audit(c, db, 'item.update', 'stock_item', id, input);
    return mapItem((await c.query(`${ITEM_SELECT} where i.id = $1`, [id])).rows[0]);
  });
}
