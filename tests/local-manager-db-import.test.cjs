const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Core = require('../assets/settlement-core.js');
const ImportIdentity = require('../assets/import-identity.js');

function createDb() {
  let id = 0;
  const storage = new Map();
  const context = {
    window: {
      SettlementCore: Core,
      ImportIdentity,
      location: { hostname: 'example.test' },
      dispatchEvent() {}
    },
    crypto: { randomUUID: () => `test-${++id}` },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    CustomEvent: class CustomEvent {},
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Error
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'local-manager-db.js'), 'utf8'), context);
  return context.window.LocalInvestmentDB;
}

function row(sourceRef, amount = 100) {
  return {
    investor_name: 'Customer A', project_name: 'Project A', amount,
    start_date: '2025-01-01', duration_value: 6, duration_unit: 'month',
    maturity_date: '2025-07-01', interest_rate: 5, net_profit: 5,
    _import_source: { file_sha256: 'abc', filename: 'book.xlsx', sheet_name: 'Sheet1', source_ref: sourceRef, source_row: 2, source_column: sourceRef[0] },
    _autofills: [{ field: 'net_profit', label: '投資淨收益', value: 5, method: 'formula', reason: 'estimated', estimated: true, source_ref: sourceRef }]
  };
}

test('source-aware imports preserve identical tranches from different cells and their provenance', async () => {
  const db = createDb();
  const first = await db.importInvestments([row('F2'), row('G2')]);
  assert.equal(first.imported.length, 2);
  assert.equal(db.snapshot().investments.length, 2);
  assert.deepEqual(new Set(db.snapshot().investments.map(item => item.import_source.source_ref)), new Set(['F2', 'G2']));
  assert.ok(db.snapshot().investments.every(item => item.autofill_provenance[0].estimated));

  const repeated = await db.importInvestments([row('F2'), row('G2')]);
  assert.equal(repeated.imported.length, 0);
  assert.equal(repeated.duplicates.length, 2);
});

test('changed content from the same source is a conflict and rolls back the whole batch', async () => {
  const db = createDb();
  await db.importInvestments([row('F2')]);
  await assert.rejects(() => db.importInvestments([row('G2'), row('F2', 200)]), /內容不同/);
  assert.equal(db.snapshot().investments.length, 1);
});

test('editing an imported investment keeps source identity and autofill evidence', async () => {
  const db = createDb();
  const imported = await db.importInvestments([row('F2')]);
  const record = imported.imported[0];
  await db.upsertInvestment({ ...row('F2', 120), _import_source: undefined, _autofills: undefined }, record.id);
  const updated = db.snapshot().investments[0];
  assert.equal(updated.amount, 120);
  assert.equal(updated.import_source.source_ref, 'F2');
  assert.equal(updated.autofill_provenance[0].field, 'net_profit');
  assert.ok(updated.source_modified_at);
});
