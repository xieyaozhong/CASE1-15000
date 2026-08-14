(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GoogleDriveImport = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const STORAGE_KEY = 'case1-google-drive-config-v1';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GSI_SRC = 'https://accounts.google.com/gsi/client';
  const GAPI_SRC = 'https://apis.google.com/js/api.js';
  const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XLS_MIME = 'application/vnd.ms-excel';
  const SUPPORTED_MIME_TYPES = [SHEETS_MIME, XLSX_MIME, XLS_MIME];
  const FORBIDDEN_CONFIG_KEYS = ['client_secret', 'access_token', 'refresh_token', 'token'];
  const scriptPromises = new Map();
  let pickerPromise = null;
  let tokenState = { accessToken: '', expiresAt: 0 };

  function codedError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function normalizeConfig(input = {}) {
    return {
      client_id: String(input.client_id || '').trim(),
      api_key: String(input.api_key || '').trim(),
      app_id: String(input.app_id || '').trim()
    };
  }

  function validateConfig(input = {}) {
    const config = normalizeConfig(input);
    const errors = [];
    const forbidden = FORBIDDEN_CONFIG_KEYS.filter(key => Object.prototype.hasOwnProperty.call(input, key) && input[key]);
    if (forbidden.length) errors.push({ field: forbidden[0], message: '不得保存 Client Secret 或 Google 登入權杖。' });
    if (!config.client_id) errors.push({ field: 'client_id', message: '請填寫 OAuth Web Client ID。' });
    else if (!/\.apps\.googleusercontent\.com$/i.test(config.client_id)) errors.push({ field: 'client_id', message: 'OAuth Client ID 格式不正確。' });
    if (!config.api_key) errors.push({ field: 'api_key', message: '請填寫 Browser API Key。' });
    if (!config.app_id) errors.push({ field: 'app_id', message: '請填寫 Cloud Project Number。' });
    else if (!/^\d+$/.test(config.app_id)) errors.push({ field: 'app_id', message: 'Cloud Project Number 必須是純數字。' });
    return { valid: errors.length === 0, errors, config };
  }

  function localStorageHandle() {
    try { return root.localStorage || null; }
    catch (error) { throw codedError('STORAGE_UNAVAILABLE', '瀏覽器不允許保存 Google Drive 設定。', error); }
  }

  function loadConfig() {
    const storage = localStorageHandle();
    if (!storage) return normalizeConfig();
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return normalizeConfig();
    try { return normalizeConfig(JSON.parse(raw)); }
    catch (error) { throw codedError('CONFIG_INVALID', '已保存的 Google Drive 設定損壞，請清除後重新填寫。', error); }
  }

  function saveConfig(input) {
    const validation = validateConfig(input);
    if (!validation.valid) throw codedError('CONFIG_INVALID', validation.errors.map(error => error.message).join(' '));
    const storage = localStorageHandle();
    if (!storage) throw codedError('STORAGE_UNAVAILABLE', '此環境無法保存 Google Drive 設定。');
    storage.setItem(STORAGE_KEY, JSON.stringify(validation.config));
    return validation.config;
  }

  function clearConfig() {
    const storage = localStorageHandle();
    if (storage) storage.removeItem(STORAGE_KEY);
    tokenState = { accessToken: '', expiresAt: 0 };
  }

  function loadScript(name, src, ready) {
    if (ready()) return Promise.resolve();
    if (!root.document) return Promise.reject(codedError('BROWSER_REQUIRED', 'Google Drive 選檔只能在瀏覽器中使用。'));
    if (scriptPromises.has(name)) return scriptPromises.get(name);
    const promise = new Promise((resolve, reject) => {
      const selector = `script[data-drive-library="${name}"]`;
      root.document.querySelector(selector)?.remove();
      const script = root.document.createElement('script');
      const done = () => ready() ? resolve() : reject(codedError('LIBRARY_LOAD_FAILED', `Google ${name} 元件載入後仍無法使用。`));
      script.addEventListener('load', done, { once: true });
      script.addEventListener('error', () => reject(codedError('LIBRARY_LOAD_FAILED', `無法載入 Google ${name} 元件，請檢查網路或內容封鎖設定。`)), { once: true });
      if (!script.isConnected) {
        script.src = src;
        script.async = true;
        script.defer = true;
        script.dataset.driveLibrary = name;
        script.referrerPolicy = 'origin';
        root.document.head.appendChild(script);
      }
    }).catch(error => {
      scriptPromises.delete(name);
      throw error;
    });
    scriptPromises.set(name, promise);
    return promise;
  }

  async function ensureGoogleLibraries() {
    await Promise.all([
      loadScript('Identity Services', GSI_SRC, () => Boolean(root.google?.accounts?.oauth2)),
      loadScript('API Loader', GAPI_SRC, () => Boolean(root.gapi?.load))
    ]);
    if (!pickerPromise) {
      pickerPromise = new Promise((resolve, reject) => {
        let finished = false;
        const timer = root.setTimeout(() => {
          if (finished) return;
          finished = true;
          reject(codedError('LIBRARY_LOAD_FAILED', 'Google Picker 載入逾時，請重試。'));
        }, 15000);
        const finish = callback => value => {
          if (finished) return;
          finished = true;
          root.clearTimeout(timer);
          callback(value);
        };
        root.gapi.load('picker', {
          callback: finish(resolve),
          onerror: finish(() => reject(codedError('LIBRARY_LOAD_FAILED', '無法載入 Google Picker。')))
        });
      }).catch(error => {
        pickerPromise = null;
        throw error;
      });
    }
    await pickerPromise;
  }

  function tokenIsFresh() {
    return Boolean(tokenState.accessToken && Date.now() < tokenState.expiresAt - 60000);
  }

  async function requestAccessToken(config) {
    await ensureGoogleLibraries();
    if (tokenIsFresh()) return tokenState.accessToken;
    return new Promise((resolve, reject) => {
      const tokenClient = root.google.accounts.oauth2.initTokenClient({
        client_id: config.client_id,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response?.error || !response?.access_token) {
            const cancelled = ['access_denied', 'popup_closed_by_user'].includes(response?.error);
            reject(codedError(cancelled ? 'AUTH_CANCELLED' : 'AUTH_FAILED', cancelled ? '已取消 Google 登入。' : 'Google 授權失敗，請重試。'));
            return;
          }
          tokenState = {
            accessToken: response.access_token,
            expiresAt: Date.now() + Math.max(0, Number(response.expires_in || 0)) * 1000
          };
          resolve(tokenState.accessToken);
        },
        error_callback: response => {
          const cancelled = response?.type === 'popup_closed';
          reject(codedError(cancelled ? 'AUTH_CANCELLED' : 'AUTH_FAILED', cancelled ? '已取消 Google 登入。' : '無法開啟 Google 登入視窗，請允許彈出式視窗後重試。'));
        }
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function pickDocument(config, accessToken) {
    return new Promise((resolve, reject) => {
      const pickerApi = root.google.picker;
      const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(pickerApi.DocsViewMode.LIST)
        .setMimeTypes(SUPPORTED_MIME_TYPES.join(','));
      const picker = new pickerApi.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(config.api_key)
        .setAppId(config.app_id)
        .setOrigin(root.location.origin)
        .setCallback(data => {
          const action = data[pickerApi.Response.ACTION];
          if (action === pickerApi.Action.CANCEL) return reject(codedError('PICKER_CANCELLED', '已取消 Google Drive 選檔。'));
          if (action !== pickerApi.Action.PICKED) return;
          const document = (data[pickerApi.Response.DOCUMENTS] || [])[0];
          if (!document) return reject(codedError('PICKER_EMPTY', 'Google Drive 沒有回傳選取的檔案。'));
          resolve({
            id: document[pickerApi.Document.ID],
            name: document[pickerApi.Document.NAME],
            mimeType: document[pickerApi.Document.MIME_TYPE]
          });
        })
        .build();
      picker.setVisible(true);
    });
  }

  function isSupportedFile(file = {}) {
    const mimeType = String(file.mimeType || '');
    const name = String(file.name || '').toLowerCase();
    return SUPPORTED_MIME_TYPES.includes(mimeType) || /\.(xlsx|xls)$/.test(name);
  }

  function metadataUrl(fileId) {
    const fields = encodeURIComponent('id,name,mimeType,size,capabilities(canDownload)');
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`;
  }

  function ensureExtension(name, extension) {
    const cleaned = String(name || 'Google Drive 試算表').replace(/[\\/:*?"<>|]/g, '_');
    return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned.replace(/\.[^.]+$/, '')}${extension}`;
  }

  function downloadSpec(file = {}) {
    if (!file.id) throw codedError('PICKER_EMPTY', 'Google Drive 檔案缺少識別碼。');
    if (!isSupportedFile(file)) throw codedError('UNSUPPORTED_FILE', '僅支援 Google 試算表、.xlsx 與 .xls 檔案。');
    const id = encodeURIComponent(file.id);
    if (file.mimeType === SHEETS_MIME) {
      return {
        url: `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
        name: ensureExtension(file.name, '.xlsx'),
        mimeType: XLSX_MIME
      };
    }
    const isLegacy = file.mimeType === XLS_MIME || String(file.name || '').toLowerCase().endsWith('.xls');
    return {
      url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      name: ensureExtension(file.name, isLegacy ? '.xls' : '.xlsx'),
      mimeType: isLegacy ? XLS_MIME : XLSX_MIME
    };
  }

  async function driveFetch(url, accessToken) {
    const response = await root.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.ok) return response;
    let details = '';
    try { details = (await response.json())?.error?.message || ''; }
    catch (_) { /* The response is not JSON. */ }
    if (response.status === 401) tokenState = { accessToken: '', expiresAt: 0 };
    throw codedError('DRIVE_API_ERROR', details || `Google Drive 讀取失敗（HTTP ${response.status}）。`);
  }

  async function downloadSelectedFile(selected, accessToken) {
    const metadataResponse = await driveFetch(metadataUrl(selected.id), accessToken);
    const metadata = await metadataResponse.json();
    if (metadata.capabilities?.canDownload === false) throw codedError('DOWNLOAD_FORBIDDEN', '這個 Google Drive 檔案不允許下載。');
    const file = { ...selected, ...metadata };
    const spec = downloadSpec(file);
    const contentResponse = await driveFetch(spec.url, accessToken);
    const buffer = await contentResponse.arrayBuffer();
    const FileClass = root.File || globalThis.File;
    if (!FileClass) throw codedError('BROWSER_REQUIRED', '目前瀏覽器無法建立 Excel 檔案。');
    const downloaded = new FileClass([buffer], spec.name, { type: spec.mimeType, lastModified: Date.now() });
    Object.defineProperties(downloaded, {
      _import_provider: { value: 'google_drive', enumerable: false },
      _import_document_id: { value: String(file.id), enumerable: false }
    });
    return downloaded;
  }

  async function pickFile(inputConfig) {
    const config = inputConfig ? normalizeConfig(inputConfig) : loadConfig();
    const validation = validateConfig(config);
    if (!validation.valid) {
      const missing = !config.client_id && !config.api_key && !config.app_id;
      throw codedError(missing ? 'CONFIG_MISSING' : 'CONFIG_INVALID', validation.errors.map(error => error.message).join(' '));
    }
    const accessToken = await requestAccessToken(validation.config);
    const selected = await pickDocument(validation.config, accessToken);
    return downloadSelectedFile(selected, accessToken);
  }

  return {
    STORAGE_KEY,
    DRIVE_SCOPE,
    SHEETS_MIME,
    XLSX_MIME,
    XLS_MIME,
    SUPPORTED_MIME_TYPES: [...SUPPORTED_MIME_TYPES],
    normalizeConfig,
    validateConfig,
    loadConfig,
    saveConfig,
    clearConfig,
    isSupportedFile,
    metadataUrl,
    downloadSpec,
    downloadSelectedFile,
    pickFile
  };
});
