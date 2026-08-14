const test = require('node:test');
const assert = require('node:assert/strict');

const Drive = require('../assets/google-drive-import.js');

const validConfig = {
  client_id: '123456789-example.apps.googleusercontent.com',
  api_key: 'AIza-example-browser-key',
  app_id: '123456789012'
};

test('Google Drive configuration accepts only public browser identifiers', () => {
  const validation = Drive.validateConfig(validConfig);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.config, validConfig);

  const forbidden = Drive.validateConfig({ ...validConfig, client_secret: 'must-not-be-stored' });
  assert.equal(forbidden.valid, false);
  assert.match(forbidden.errors.map(error => error.message).join(' '), /不得保存/);
  assert.equal(Drive.validateConfig({ ...validConfig, app_id: 'project-name' }).valid, false);
});

test('saved configuration excludes unrelated values and never stores a token', () => {
  const values = new Map();
  const previousStorage = global.localStorage;
  global.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  try {
    Drive.saveConfig({ ...validConfig, note: 'ignored' });
    const saved = JSON.parse(values.get(Drive.STORAGE_KEY));
    assert.deepEqual(saved, validConfig);
    assert.equal('access_token' in saved, false);
    assert.deepEqual(Drive.loadConfig(), validConfig);
    Drive.clearConfig();
    assert.equal(values.has(Drive.STORAGE_KEY), false);
  } finally {
    if (previousStorage === undefined) delete global.localStorage;
    else global.localStorage = previousStorage;
  }
});

test('Google Sheets export and native Excel download use the correct Drive endpoints', () => {
  const sheet = Drive.downloadSpec({ id: 'sheet/id', name: '收益總表', mimeType: Drive.SHEETS_MIME });
  assert.match(sheet.url, /files\/sheet%2Fid\/export\?mimeType=/);
  assert.equal(sheet.name, '收益總表.xlsx');
  assert.equal(sheet.mimeType, Drive.XLSX_MIME);

  const excel = Drive.downloadSpec({ id: 'excel-id', name: '投資.xlsx', mimeType: Drive.XLSX_MIME });
  assert.equal(excel.url, 'https://www.googleapis.com/drive/v3/files/excel-id?alt=media&supportsAllDrives=true');
  assert.equal(excel.name, '投資.xlsx');

  const legacy = Drive.downloadSpec({ id: 'legacy', name: '舊資料.xls', mimeType: Drive.XLS_MIME });
  assert.equal(legacy.name, '舊資料.xls');
  assert.equal(legacy.mimeType, Drive.XLS_MIME);
});

test('file filters reject unsupported Drive documents', () => {
  assert.equal(Drive.isSupportedFile({ name: '投資.xlsx', mimeType: Drive.XLSX_MIME }), true);
  assert.equal(Drive.isSupportedFile({ name: '舊資料.xls', mimeType: 'application/octet-stream' }), true);
  assert.equal(Drive.isSupportedFile({ name: '說明.pdf', mimeType: 'application/pdf' }), false);
  assert.throws(() => Drive.downloadSpec({ id: 'pdf', name: '說明.pdf', mimeType: 'application/pdf' }), error => error.code === 'UNSUPPORTED_FILE');
});

test('Drive download checks capabilities and sends the bearer token only in headers', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Response(JSON.stringify({ id: 'file-1', name: '投資.xlsx', mimeType: Drive.XLSX_MIME, capabilities: { canDownload: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(new Uint8Array([80, 75, 3, 4]), { status: 200, headers: { 'content-type': Drive.XLSX_MIME } });
  };
  try {
    const file = await Drive.downloadSelectedFile({ id: 'file-1' }, 'short-lived-token');
    assert.equal(file.name, '投資.xlsx');
    assert.equal(file._import_provider, 'google_drive');
    assert.equal(file._import_document_id, 'file-1');
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer short-lived-token'));
    assert.ok(calls.every(call => !call.url.includes('short-lived-token')));
    assert.match(decodeURIComponent(calls[0].url), /capabilities\(canDownload\)/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('Drive download refuses files whose owner disabled downloading', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ id: 'locked', name: 'locked.xlsx', mimeType: Drive.XLSX_MIME, capabilities: { canDownload: false } }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(() => Drive.downloadSelectedFile({ id: 'locked' }, 'token'), error => error.code === 'DOWNLOAD_FORBIDDEN');
  } finally {
    global.fetch = previousFetch;
  }
});
