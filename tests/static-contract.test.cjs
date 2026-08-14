const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('manager page uses only local script and stylesheet assets', () => {
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//i);
  const assets = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(value => !value.endsWith('.html'));
  assert.ok(assets.length >= 5);
  for (const asset of assets) {
    assert.equal(fs.existsSync(path.join(root, asset)), true, `${asset} should exist`);
  }
});

test('manager page exposes every required investment field and report surface', () => {
  for (const label of ['投資人名','投資案名','投資金額','開始時間','持續時間','投資利率','投資淨收益']) {
    assert.match(html, new RegExp(label));
  }
  for (const id of ['investmentBody','duePreviewBody','customerSummaryBody','batchDetailBody','customerDrawerBody','xlsxInput','heroImportBtn','panel-import','googleDriveImportBtn','driveConfigForm']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('Excel quick entry has a durable import route and Google Drive source', () => {
  const managerJs = fs.readFileSync(path.join(root, 'assets', 'local-manager.js'), 'utf8');
  assert.match(html, /id=["']heroImportBtn["'][^>]+data-open-panel=["']import["']/);
  assert.match(html, /id=["']panel-import["'][^>]+tabindex=["']-1["']/);
  assert.match(html, /從 Google Drive 選取/);
  assert.match(managerJs, /panelFromLocation/);
  assert.match(managerJs, /scrollIntoView/);
  assert.match(managerJs, /DriveImport\.pickFile/);
});

test('vendored Excel parser is present for offline import', () => {
  const vendor = path.join(root, 'assets', 'vendor', 'xlsx.full.min.js');
  assert.ok(fs.statSync(vendor).size > 900000);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'vendor', 'LICENSE.sheetjs.txt')), true);
});

test('manager loads the allocation-matrix adapter before the import controller', () => {
  const adapter = path.join(root, 'assets', 'legacy-matrix-import.js');
  const guard = path.join(root, 'assets', 'excel-import-guard.js');
  const identity = path.join(root, 'assets', 'import-identity.js');
  assert.equal(fs.existsSync(adapter), true);
  assert.equal(fs.existsSync(guard), true);
  assert.equal(fs.existsSync(identity), true);
  assert.match(html, /src=["']assets\/legacy-matrix-import\.js["']/);
  assert.match(html, /src=["']assets\/excel-import-guard\.js["']/);
  assert.match(html, /src=["']assets\/import-identity\.js["']/);
  assert.ok(html.indexOf('assets/legacy-matrix-import.js') < html.indexOf('assets/local-manager.js'));
  assert.ok(html.indexOf('assets/excel-import-guard.js') < html.indexOf('assets/local-manager.js'));
  assert.ok(html.indexOf('assets/import-identity.js') < html.indexOf('assets/local-manager-db.js'));
  assert.match(fs.readFileSync(path.join(root, 'assets', 'local-manager.js'), 'utf8'), /LegacyMatrix\.inspect/);
});

test('public root redirects to the manager and online mode explains browser-only storage', () => {
  assert.match(indexHtml, /url=\.\/admin\.html/i);
  assert.match(indexHtml, /href=["']\.\/admin\.html["']/i);
  assert.match(indexHtml, /src=["']\.\/assets\/redirect\.js["']/i);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'redirect.js')), true);
  assert.match(fs.readFileSync(path.join(root, 'assets', 'local-manager.js'), 'utf8'), /線上瀏覽器模式/);
});

test('local server CSP permits only the Google surfaces required by Drive Picker', () => {
  const server = fs.readFileSync(path.join(root, 'local-server.mjs'), 'utf8');
  for (const origin of ['https://accounts.google.com','https://apis.google.com','https://www.googleapis.com','https://docs.google.com']) {
    assert.match(server, new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(server, /script-src[^;]*'unsafe-inline'/);
});
