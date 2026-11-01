// GST line and invoice computation in integer paise.
import { divRound } from './money.js';

/**
 * @param {{qtyMilli:number, ratePaise:number, discountPaise:number, gstRateBp:number}} line
 *   gstRateBp = GST rate in basis points (18% -> 1800)
 * @param {boolean} interState
 */
export function computeLine({ qtyMilli, ratePaise, discountPaise = 0, gstRateBp = 0 }, interState) {
  const gross = divRound(BigInt(qtyMilli) * BigInt(ratePaise), 1000);
  if (discountPaise > gross) throw new RangeError('discount is larger than the line amount');
  const taxable = gross - discountPaise;
  const tax = divRound(BigInt(taxable) * BigInt(gstRateBp), 10000);
  let cgst = 0, sgst = 0, igst = 0;
  if (interState) igst = tax;
  else {
    cgst = Math.floor(tax / 2);
    sgst = tax - cgst;
  }
  return { gross, taxable, cgst, sgst, igst, tax };
}

/**
 * @param {Array} lines  computeLine inputs
 * @param {{interState:boolean, roundToRupee?:boolean}} opts
 */
export function computeInvoice(lines, { interState, roundToRupee = true }) {
  const computed = lines.map((l) => computeLine(l, interState));
  const sum = (k) => computed.reduce((a, c) => a + c[k], 0);
  const taxable = sum('taxable');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  const exact = taxable + cgst + sgst + igst;
  const total = roundToRupee ? divRound(exact, 100) * 100 : exact;
  return { lines: computed, taxable, cgst, sgst, igst, tax: cgst + sgst + igst, roundOff: total - exact, total };
}

/** Indian GST state codes (for place of supply). */
export const GST_STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};
