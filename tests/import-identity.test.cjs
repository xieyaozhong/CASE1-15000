const test = require('node:test');
const assert = require('node:assert/strict');

const Identity = require('../assets/import-identity.js');

const investment = {
  investor_name: 'Customer A', project_name: 'Project A', amount: 100,
  start_date: '2025-01-01', duration_value: 6, duration_unit: 'month',
  interest_rate: 5, net_profit: 5
};
const source = { file_sha256: 'abc', filename: 'book.xlsx', sheet_name: 'Sheet1', source_ref: 'F2', source_row: 2, source_column: 'F' };

test('creates a stable SHA-256 fingerprint independent of the filename', async () => {
  const bytes = new TextEncoder().encode('abc');
  assert.equal(await Identity.fingerprintArrayBuffer(bytes), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('same source and values is a duplicate while changed values is a conflict', () => {
  const existing = [{ ...investment, import_source: source }];
  assert.equal(Identity.classify(existing, investment, source).status, 'duplicate');
  assert.equal(Identity.classify(existing, { ...investment, amount: 200 }, source).status, 'conflict');
});

test('display filename does not change the persistent source identity', () => {
  assert.equal(Identity.sourceKey(source), Identity.sourceKey({ ...source, filename: 'renamed.xlsx' }));
  assert.notEqual(Identity.sourceKey(source), Identity.sourceKey({ ...source, source_ref: 'G2' }));
});

test('a re-saved same-name local file becomes an explicit ambiguity instead of a silent duplicate', () => {
  const existing = [{ ...investment, import_source: source }];
  const resaved = { ...source, file_sha256: 'different-hash' };
  assert.equal(Identity.classify(existing, investment, resaved).status, 'conflict');
  assert.equal(Identity.classify(existing, investment, resaved).reason, 'ambiguous_local_file');
  assert.equal(Identity.classify(existing, { ...investment, amount: 200 }, resaved).status, 'conflict');
});

test('Google Drive file id remains stable across exports, hashes, and renames', () => {
  const driveSource = { ...source, provider: 'google_drive', document_id: 'drive-123' };
  const existing = [{ ...investment, import_source: driveSource }];
  const nextExport = { ...driveSource, file_sha256: 'new-export-hash', filename: 'renamed.xlsx' };
  assert.equal(Identity.classify(existing, investment, nextExport).status, 'duplicate');
  assert.equal(Identity.classify(existing, { ...investment, interest_rate: 6 }, nextExport).status, 'conflict');
});

test('different Drive document ids keep identical binary copies independent', () => {
  const first = { ...source, provider: 'google_drive', document_id: 'drive-123' };
  const second = { ...source, provider: 'google_drive', document_id: 'drive-456' };
  assert.notEqual(Identity.sourceKey(first), Identity.sourceKey(second));
  assert.equal(Identity.classify([{ ...investment, import_source: first }], investment, second).status, 'new');
});

test('identical tranches from different source cells remain separate investments', () => {
  const existing = [{ ...investment, import_source: source }];
  assert.equal(Identity.classify(existing, investment, { ...source, source_ref: 'G2', source_column: 'G' }).status, 'new');
});

test('source-aware imports surface an ambiguous match against a legacy record', () => {
  assert.equal(Identity.classify([investment], investment, source).status, 'conflict');
  assert.equal(Identity.classify([investment], investment, source).reason, 'legacy_record_match');
  assert.equal(Identity.classify([investment], { ...investment, amount: 101 }, source).status, 'new');
  assert.equal(Identity.classify([investment], investment, null).status, 'duplicate');
});
