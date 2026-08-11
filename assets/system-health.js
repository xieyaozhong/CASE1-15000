(() => {
  function init() {
    if (!window.DB || !window.UI) { setTimeout(init, 60); return; }
    if (!/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;
    if (window.__systemHealthLoaded) return;
    window.__systemHealthLoaded = true;

    const { esc } = UI;
    const settings = document.querySelector('.panel[data-panel="settings"] .card-pad');
    if (!settings) return;

    const card = document.createElement('div');
    card.id = 'systemHealth';
    card.style.marginTop = '20px';
    card.innerHTML = `
      <h2>正式上線檢查</h2>
      <div id="healthRows" class="preview-list"><div class="preview-item"><span>檢查中…</span><span>—</span></div></div>
      <div class="form-actions"><button id="healthRefresh" class="btn btn-soft btn-sm" type="button">重新檢查</button></div>`;
    settings.appendChild(card);

    const ok = (name, detail='正常') => `<div class="preview-item"><span><strong>${esc(name)}</strong><br><span class="muted">${esc(detail)}</span></span><span class="pill success">通過</span></div>`;
    const bad = (name, detail) => `<div class="preview-item"><span><strong>${esc(name)}</strong><br><span class="muted">${esc(detail)}</span></span><span class="pill pending">待處理</span></div>`;

    async function check() {
      const rows = document.querySelector('#healthRows');
      if (!rows) return;
      const result = [];
      const cfg = window.APP_CONFIG || {};

      if (!DB.LIVE) {
        result.push(bad('正式資料庫模式', '目前仍是展示模式。正式上線前要填入 Supabase URL / anon key，並將 DEMO_MODE 改為 false。'));
        result.push(ok('GitHub Pages 前端', '展示模式可直接預覽，不會寫入真實客戶資料。'));
        rows.innerHTML = result.join('');
        return;
      }

      result.push(ok('Supabase 設定', `${String(cfg.SUPABASE_URL || '').replace(/^https?:\/\//,'').slice(0,48)}`));

      try {
        const user = await DB.currentUser();
        if (user) result.push(ok('登入狀態', user.email || '已登入'));
        else result.push(bad('登入狀態', '尚未登入管理員帳號。'));
      } catch (e) {
        result.push(bad('Supabase 連線', e.message || '無法取得登入狀態。'));
      }

      try {
        const role = await DB.role();
        if (role === 'admin') result.push(ok('管理員權限', '目前帳號 role = admin'));
        else result.push(bad('管理員權限', `目前 role = ${role || '未設定'}，無法執行正式後台操作。`));
      } catch (e) {
        result.push(bad('管理員權限', e.message || '角色檢查失敗。'));
      }

      try {
        const { error } = await DB.client.from('projects').select('id').limit(1);
        if (error) throw error;
        result.push(ok('核心資料表', 'schema.sql 已可正常讀取。'));
      } catch (e) {
        result.push(bad('核心資料表', '請確認已執行 supabase/schema.sql。'));
      }

      try {
        const { error } = await DB.client.from('audit_logs').select('id').limit(1);
        if (error) throw error;
        result.push(ok('正式安全模組', 'production.sql 已安裝，結算鎖定與稽核可用。'));
      } catch (e) {
        result.push(bad('正式安全模組', '請在 Supabase SQL Editor 執行 supabase/production.sql。'));
      }

      rows.innerHTML = result.join('');
    }

    document.querySelector('#healthRefresh')?.addEventListener('click', check);
    document.querySelector('#adminLoginForm')?.addEventListener('submit', () => setTimeout(check, 800));
    setTimeout(check, 500);
  }
  init();
})();
