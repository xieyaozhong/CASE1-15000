import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, 'data');
await mkdir(dataDir, { recursive: true });

const databasePath = path.join(dataDir, 'investment-manager.db');
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const emptyState = () => ({
  version: 1,
  investors: [],
  projects: [],
  investments: [],
  settlement_batches: [],
  settlement_entries: [],
  meta: { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
});

const findState = database.prepare('SELECT revision, payload, updated_at FROM app_state WHERE id = 1');
const insertState = database.prepare('INSERT INTO app_state (id, revision, payload, updated_at) VALUES (1, 0, ?, ?)');
const updateState = database.prepare('UPDATE app_state SET revision = ?, payload = ?, updated_at = ? WHERE id = 1 AND revision = ?');
const insertLog = database.prepare('INSERT INTO change_log (revision, reason, created_at) VALUES (?, ?, ?)');

if (!findState.get()) {
  const timestamp = new Date().toISOString();
  insertState.run(JSON.stringify(emptyState()), timestamp);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function readRequestBody(request, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  return ['investors', 'projects', 'investments', 'settlement_batches', 'settlement_entries']
    .every(key => Array.isArray(state[key]));
}

function currentStatePayload() {
  const row = findState.get();
  return {
    revision: Number(row.revision),
    updated_at: row.updated_at,
    state: JSON.parse(row.payload)
  };
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon']
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true, storage: 'sqlite', database: path.basename(databasePath) });
      return;
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      sendJson(response, 200, currentStatePayload());
      return;
    }

    if (url.pathname === '/api/state' && request.method === 'PUT') {
      let payload;
      try { payload = JSON.parse(await readRequestBody(request)); }
      catch (_) {
        sendJson(response, 400, { error: 'JSON 格式不正確或檔案過大。' });
        return;
      }
      if (!validState(payload.state) || !Number.isInteger(Number(payload.revision))) {
        sendJson(response, 422, { error: '資料結構不正確。' });
        return;
      }

      const expectedRevision = Number(payload.revision);
      const nextRevision = expectedRevision + 1;
      const timestamp = new Date().toISOString();
      const reason = String(payload.reason || 'update').slice(0, 80);
      database.exec('BEGIN IMMEDIATE');
      try {
        const current = findState.get();
        if (Number(current.revision) !== expectedRevision) {
          database.exec('ROLLBACK');
          sendJson(response, 409, { error: '資料版本衝突。', revision: Number(current.revision) });
          return;
        }
        const result = updateState.run(nextRevision, JSON.stringify(payload.state), timestamp, expectedRevision);
        if (Number(result.changes) !== 1) throw new Error('state update failed');
        insertLog.run(nextRevision, reason, timestamp);
        database.exec('COMMIT');
        sendJson(response, 200, { ok: true, revision: nextRevision, updated_at: timestamp });
      } catch (error) {
        try { database.exec('ROLLBACK'); } catch (_) {}
        throw error;
      }
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method || '')) {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '') || 'admin.html';
    const filePath = path.resolve(rootDir, relative);
    if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
      sendJson(response, 403, { error: 'Forbidden' });
      return;
    }

    if (!existsSync(filePath)) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    const resolvedPath = filePath;
    const contents = await readFile(resolvedPath);
    response.writeHead(200, {
      'Content-Type': mime.get(path.extname(resolvedPath).toLowerCase()) || 'application/octet-stream',
      'Content-Length': contents.length,
      'Cache-Control': path.extname(resolvedPath) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    });
    if (request.method === 'HEAD') response.end();
    else response.end(contents);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: '本機伺服器發生錯誤。' });
  }
});

const requestedPort = Number(process.env.PORT || 4173);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 4173;
const host = '127.0.0.1';

server.on('error', error => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`連接埠 ${port} 已被使用。系統可能已在執行，請開啟 http://${host}:${port}/admin.html`);
    database.close();
    process.exit(1);
  }
  throw error;
});

server.listen(port, host, () => {
  const address = `http://${host}:${port}/admin.html`;
  console.log(`投資結算系統已啟動：${address}`);
  console.log(`本機資料庫：${databasePath}`);
  console.log('按 Ctrl+C 可停止系統。');
  if (process.argv.includes('--open')) {
    const opener = process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', address], { detached: true, stdio: 'ignore', windowsHide: true })
      : process.platform === 'darwin'
        ? spawn('open', [address], { detached: true, stdio: 'ignore' })
        : spawn('xdg-open', [address], { detached: true, stdio: 'ignore' });
    opener.unref();
  }
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
