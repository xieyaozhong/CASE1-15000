const test = require('node:test');
const assert = require('node:assert/strict');

const Legacy = require('../assets/legacy-matrix-import.js');
const Autofill = require('../assets/import-autofill.js');
const Core = require('../assets/settlement-core.js');
const XLSX = require('../assets/vendor/xlsx.full.min.js');

function header() {
  return ['日期','起租案名/同仁','案源','案件金額','參與總額','P1','P2','','','','','','','','','','','','目前總共撥款','合計'];
}

function row({ date = '2025-01-02', project = 'CASE-A', source = 'SRC', caseAmount = 100, total = 30, p1 = 10, p2 = 20, note = '' } = {}) {
  const values = Array(20).fill('');
  Object.assign(values, { 0: date, 1: project, 2: source, 3: caseAmount, 4: total, 5: p1, 6: p2, 14: note, 18: 'P1', 19: 9999 });
  return values;
}

test('detects a horizontal allocation matrix and excludes notes and side summaries', () => {
  const rows = [header(), row(), row({ date: '2025-02-03', project: 'CASE-B', total: 5, p1: 5, p2: '' })];
  const inspection = Legacy.inspect(rows, []);

  assert.ok(inspection);
  assert.equal(inspection.sourceRowCount, 2);
  assert.equal(inspection.investmentCount, 3);
  assert.equal(inspection.investorColumnCount, 2);
  assert.deepEqual(inspection.layout.investorColumns.map(item => item.name), ['P1', 'P2']);
  assert.equal(inspection.layout.noteStartColumn, 7);
  assert.equal(inspection.layout.payoutColumn, 18);
});

test('expands merged notes before deriving explicit duration and rate terms', () => {
  const rows = [
    header(),
    row({ project: 'CASE-A', total: 10, p1: 10, p2: '', note: 'contract 3個月 6%' }),
    row({ date: '2025-01-03', project: 'CASE-A', total: 5, p1: 5, p2: '', note: '' })
  ];
  const inspection = Legacy.inspect(rows, [{ s: { r: 1, c: 14 }, e: { r: 2, c: 14 } }]);
  const result = Legacy.convert(inspection, {
    amount_scale: 1,
    duration_value: 9,
    duration_unit: 'month',
    interest_rate: 4,
    use_note_terms: true,
    start_dates: {},
    accept_mismatches: true
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 2);
  assert.ok(result.records.every(item => item.duration_value === 3));
  assert.ok(result.records.every(item => item.interest_rate === 6));
  assert.ok(result.records.every(item => item.note.includes('contract')));
});

test('note terms remain candidates until the import profile explicitly opts in', () => {
  const inspection = Legacy.inspect([header(), row({ total: 10, p1: 10, p2: '', note: '3個月 6%' })], []);
  const result = Legacy.convert(inspection, {
    amount_scale: 1, duration_value: 9, duration_unit: 'month', interest_rate: 4,
    use_note_terms: false, start_dates: {}, accept_mismatches: true
  });
  assert.equal(result.records[0].duration_value, 9);
  assert.equal(result.records[0].interest_rate, 4);
  assert.ok(result.records[0].autofills.some(item => item.method === 'batch_default' && /候選未採用/.test(item.reason)));
});

test('requires explicit defaults, amount unit, missing dates, and mismatch acknowledgement', () => {
  const rows = [header(), row({ date: '', project: 'CASE-X', total: 4, p1: 5, p2: '' })];
  const inspection = Legacy.inspect(rows, []);

  assert.deepEqual(inspection.missingStartRows.map(item => item.row), [2]);
  assert.deepEqual(inspection.mismatches.map(item => item.row), [2]);

  const missing = Legacy.convert(inspection, {});
  assert.ok(missing.errors.length >= 4);
  assert.equal(missing.records.length, 0);

  const unconfirmed = Legacy.convert(inspection, {
    amount_scale: 10000,
    duration_value: 6,
    duration_unit: 'month',
    interest_rate: 5,
    start_dates: { 2: '2025-03-04' },
    accept_mismatches: false
  });
  assert.match(unconfirmed.errors[0].message, /參與總額/);

  const converted = Legacy.convert(inspection, {
    amount_scale: 10000,
    duration_value: 6,
    duration_unit: 'month',
    interest_rate: 5,
    start_dates: { 2: '2025-03-04' },
    accept_mismatches: true
  });
  assert.equal(converted.errors.length, 0);
  assert.equal(converted.warnings.length, 1);
  assert.equal(converted.records[0].amount, 50000);
  assert.equal(converted.records[0].start_raw, '2025-03-04');
  assert.ok(converted.records[0].autofills.some(item => item.field === 'amount'));
  assert.ok(converted.records[0].autofills.some(item => item.field === 'start_date'));
});

test('converted records become valid investments after the shared financial autofill', () => {
  const inspection = Legacy.inspect([header(), row({ total: 12.5, p1: 12.5, p2: '', note: '' })], []);
  const converted = Legacy.convert(inspection, {
    amount_scale: 1000,
    duration_value: 2,
    duration_unit: 'month',
    interest_rate: 4,
    start_dates: {},
    accept_mismatches: true
  });
  const completed = Autofill.autofillRow({
    ...converted.records[0],
    start_date: converted.records[0].start_raw
  }, { carry: {} });
  const checked = Core.validateInvestment(completed.value);

  assert.deepEqual(checked.errors, []);
  assert.equal(checked.value.amount, 12500);
  assert.equal(checked.value.net_profit, 500);
  assert.ok(completed.autofills.some(item => item.field === 'net_profit' && item.estimated));
});

test('rejects duplicate investor headers and invalid allocation cells', () => {
  const duplicate = header();
  duplicate[6] = ' P1 ';
  const bad = row({ p1: 10, p2: 'oops', total: 10 });
  const inspection = Legacy.inspect([duplicate, bad], []);
  const converted = Legacy.convert(inspection, {
    amount_scale: 1,
    duration_value: 1,
    duration_unit: 'month',
    interest_rate: 0,
    start_dates: {},
    accept_mismatches: true
  });

  assert.equal(inspection.duplicateHeaders.length, 1);
  assert.equal(inspection.invalidAllocations.length, 1);
  assert.ok(converted.errors.some(item => /欄名重複/.test(item.message)));
  assert.ok(converted.errors.some(item => /必須是大於 0 的數字/.test(item.message)));
});

test('flags amounts after a header gap and totals that have no investor allocations', () => {
  const gapHeader = header();
  gapHeader[8] = 'P3';
  const gapRow = row({ total: 15, p1: 10, p2: '' });
  gapRow[8] = 5;
  const orphanInspection = Legacy.inspect([gapHeader, gapRow], []);
  assert.equal(orphanInspection.orphanAllocationColumns.length, 1);

  const blankHeaderValue = header();
  const blankHeaderRow = row({ total: 30, p1: 10, p2: 20 });
  blankHeaderRow[7] = 5;
  const blankHeaderInspection = Legacy.inspect([blankHeaderValue, blankHeaderRow], []);
  assert.equal(blankHeaderInspection.orphanAllocationColumns.length, 1);
  assert.equal(blankHeaderInspection.orphanAllocationColumns[0].missing_header, true);

  const emptyAllocation = row({ total: 9, p1: '', p2: '' });
  const emptyInspection = Legacy.inspect([header(), emptyAllocation], []);
  assert.equal(emptyInspection.sourceRowCount, 1);
  assert.equal(emptyInspection.unallocatedRows.length, 1);

  const converted = Legacy.convert(emptyInspection, {
    amount_scale: 1, duration_value: 1, duration_unit: 'month', interest_rate: 0,
    start_dates: {}, accept_mismatches: true
  });
  assert.ok(converted.errors.some(item => /沒有任何投資人分配/.test(item.message)));
});

test('never duplicates principal from a merge inside investor allocation columns', () => {
  const rows = [
    header(),
    row({ total: 10, p1: 10, p2: '' }),
    row({ date: '2025-02-03', project: 'CASE-B', total: 0, p1: '', p2: '' })
  ];
  const inspection = Legacy.inspect(rows, [{ s: { r: 1, c: 5 }, e: { r: 2, c: 5 } }]);
  assert.equal(inspection.investmentCount, 1);
});

test('invalid nonblank dates are offered for an explicit row-level replacement', () => {
  const inspection = Legacy.inspect([header(), row({ date: 'not-a-date', total: 10, p1: 10, p2: '' })], []);
  assert.equal(inspection.missingStartRows[0].issue, 'invalid');
  const converted = Legacy.convert(inspection, {
    amount_scale: 1, duration_value: 1, duration_unit: 'month', interest_rate: 0,
    start_dates: { 2: '2025-04-05' }, accept_mismatches: true
  });
  assert.equal(converted.errors.length, 0);
  assert.equal(converted.records[0].start_raw, '2025-04-05');
});

test('numeric dates must fit the valid Excel serial range', () => {
  assert.equal(Legacy.isValidStart(45293), true);
  assert.equal(Legacy.isValidStart(20250102), false);
  assert.equal(Legacy.isValidStart(2958466), false);
  const inspection = Legacy.inspect([header(), row({ date: 20250102, total: 10, p1: 10, p2: '' })], []);
  assert.equal(inspection.missingStartRows[0].issue, 'invalid');
});

test('SheetJS binary round-trip preserves dates, cached formulas, notes, merges, and side-summary exclusion', () => {
  const matrixHeader = ['日期','起租案名/同仁','案源','案件金額','參與總額','P1','P2','P3','P4','P5','P6','P7','P8','P9','','','','','目前總共撥款','合計'];
  const sourceRows = [
    matrixHeader,
    [new Date(2025, 0, 2),'CASE-A','SRC',100,30,10,20,'','','','','','','','3個月 6%','','','','P1',30],
    ['', 'CASE-B','SRC',80,5,5,'','','','','','','','','','','','','P2',20]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sourceRows);
  sheet.E2 = { t: 'n', v: 30, f: 'SUM(F2:N2)' };
  sheet.F2 = { t: 'n', v: 10, f: '5+5' };
  sheet.T1 = { t: 'n', v: 50, f: 'SUM(F2:N3)' };
  sheet['!merges'] = [{ s: { r: 1, c: 14 }, e: { r: 2, c: 14 } }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Matrix');

  const parsed = XLSX.read(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer', cellDates: true, cellNF: true });
  const parsedSheet = parsed.Sheets.Matrix;
  const parsedRows = XLSX.utils.sheet_to_json(parsedSheet, { header: 1, raw: true, defval: '' });
  const inspection = Legacy.inspect(parsedRows, parsedSheet['!merges']);

  assert.ok(parsedSheet.A2.v instanceof Date);
  assert.equal(parsedSheet.F2.v, 10);
  assert.equal(inspection.layout.investorColumns.length, 9);
  assert.equal(inspection.layout.payoutColumn, 18);
  assert.equal(inspection.investmentCount, 3);
  assert.equal(inspection.missingStartRows[0].row, 3);

  const converted = Legacy.convert(inspection, {
    amount_scale: 10000, duration_value: 6, duration_unit: 'month', interest_rate: 5,
    start_dates: { 3: '2025-02-03' }, accept_mismatches: true
  });
  assert.equal(converted.errors.length, 0);
  assert.equal(converted.records.length, 3);
  assert.ok(converted.records.every(item => !/^S|^T/.test(item.source_ref)));
  assert.ok(converted.records.find(item => item.source_ref === 'F2').note.includes('3個月'));
  assert.ok(converted.records.find(item => item.source_ref === 'F3').note.includes('3個月'));
});
