import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../shared/csv.js';

test('CSV escaping and formula-injection guard', () => {
  assert.equal(csvCell('Ramesh Traders'), 'Ramesh Traders');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
  assert.equal(csvCell('+91 98765'), "'+91 98765");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-cmd|calc'), "'-cmd|calc");
  assert.equal(csvCell('-250.50'), '-250.50', 'negative numbers stay numbers');
  assert.equal(csvCell(-12.5), '-12.5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(Number.NaN), '');
  const out = toCsv([['Name', 'Amount'], ['A', 1]]);
  assert.ok(out.startsWith('﻿Name,Amount\r\nA,1'));
});
