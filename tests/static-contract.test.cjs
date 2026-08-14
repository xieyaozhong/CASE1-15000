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
  for (const id of ['investmentBody','duePreviewBody','customerSummaryBody','batchDetailBody','customerDrawerBody','xlsxInput']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('vendored Excel parser is present for offline import', () => {
  const vendor = path.join(root, 'assets', 'vendor', 'xlsx.full.min.js');
  assert.ok(fs.statSync(vendor).size > 900000);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'vendor', 'LICENSE.sheetjs.txt')), true);
});

test('public root redirects to the manager and online mode explains browser-only storage', () => {
  assert.match(indexHtml, /url=\.\/admin\.html/i);
  assert.match(indexHtml, /href=["']\.\/admin\.html["']/i);
  assert.match(fs.readFileSync(path.join(root, 'assets', 'local-manager.js'), 'utf8'), /線上瀏覽器模式/);
});
