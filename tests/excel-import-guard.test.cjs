const test = require('node:test');
const assert = require('node:assert/strict');

const Guard = require('../assets/excel-import-guard.js');

const layout = {
  headerIndex: 0,
  dateColumn: 0,
  projectColumn: 1,
  caseAmountColumn: 3,
  participationTotalColumn: 4,
  payoutColumn: 14,
  noteEndColumn: 14,
  investorColumns: [{ column: 5 }, { column: 6 }]
};

test('flags legacy financial formulas without a cached value or with an error', () => {
  const sheet = {
    '!ref': 'A1:O3',
    E2: { t: 'n', f: 'SUM(F2:G2)' },
    F2: { t: 'n', f: '1+1', v: 2 },
    G2: { t: 'e', f: '1/0', v: '#DIV/0!' },
    O2: { t: 'n', f: '1+1' }
  };
  const issues = Guard.scanLegacyFormulaCache(sheet, layout);
  assert.deepEqual(issues.map(item => item.address), ['E2', 'G2']);
  assert.deepEqual(issues.map(item => item.reason), ['missing_cache', 'formula_error']);
});

test('accepts cached zero and ignores formulas outside the import columns', () => {
  const sheet = {
    E2: { t: 'n', f: 'SUM(F2:G2)', v: 0 },
    F2: { t: 'n', f: '1-1', v: 0 },
    O2: { t: 'n', f: 'SUM(E2:E2)' }
  };
  assert.deepEqual(Guard.scanLegacyFormulaCache(sheet, layout), []);
});

test('flags a missing-cache formula under a blank header after the investor columns', () => {
  const sheet = { H2: { t: 'n', f: '1+1' }, O2: { t: 'n', f: '2+2' } };
  assert.deepEqual(Guard.scanLegacyFormulaCache(sheet, layout).map(item => item.address), ['H2']);
});
