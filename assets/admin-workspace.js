(() => {
  if (!/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;

  const states = new Map();
  const selectedPayouts = new Set();
  let observer = null;
  let decorating = false;
  let timer = 0;
  let snapshotCache = null;
  let snapshotAt = 0;

  const configs = [
    { name: 'payout', panel: 'payout', body: 'payoutBody', placeholder: '搜尋週期、投資人、投資案或狀態', selectable: true },
    { name: 'projects', panel: 'projects', body: 'projectAdminBody', placeholder: '搜尋案號、投資案、案源或狀態', detail: 'project' },
    { name: 'investors', panel: 'investors', body: 'investorBody', placeholder: '搜尋代碼、名稱或 Email', detail: 'investor' },
    { name: 'participations', panel: 'participations', body: 'participationBody', placeholder: '搜尋投資人、投資案或狀態' }
  ];

  function stateFor(name) {
    if (!states.has(name)) states.set(name, { query: '', page: 1, pageSize: 10, sortIndex: -1, sortDir: '' });
    return states.get(name);
  }

  function schedule(ms = 40) {
    clearTimeout(timer);
    timer = setTimeout(decorateAll, ms);
  }

  async function getSnapshot(force = false) {
    if (!window.DB) return null;
    const now = Date.now();
    if (!force && snapshotCache && now - snapshotAt < 1200) return snapshotCache;
    snapshotCache = await DB.adminSnapshot();
    snapshotAt = now;
    return snapshotCache;
  }

  function createToolbar(cfg, panel) {
    let toolbar = panel.querySelector(`.workspace-toolbar[data-workspace="${cfg.name}"]`);
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.className = 'workspace-toolbar';
    toolbar.dataset.workspace = cfg.name;
    toolbar.innerHTML = `
      <div class="workspace-tools">
        <label class="workspace-search" aria-label="搜尋資料">
          <input type="search" autocomplete="off" placeholder="${UI.esc(cfg.placeholder)}">
        </label>
        <select class="workspace-page-size" aria-label="每頁筆數">
          <option value="10">10 筆 / 頁</option>
          <option value="20">20 筆 / 頁</option>
          <option value="50">50 筆 / 頁</option>
          <option value="100">100 筆 / 頁</option>
        </select>
        ${cfg.selectable ? '<button class="btn btn-sm workspace-batch-action" type="button" disabled>批次標記已撥款 <span class="batch-count">0</span></button>' : ''}
      </div>
      <div class="workspace-meta">
        <span class="workspace-count">0 筆</span>
        <div class="workspace-pagination">
          <button class="btn btn-soft btn-sm workspace-page-btn workspace-prev" type="button" aria-label="上一頁">‹</button>
          <span class="workspace-page-label">1 / 1</span>
          <button class="btn btn-soft btn-sm workspace-page-btn workspace-next" type="button" aria-label="下一頁">›</button>
        </div>
      </div>`;

    panel.insertBefore(toolbar, panel.firstElementChild);
    const st = stateFor(cfg.name);
    const search = toolbar.querySelector('input[type="search"]');
    const size = toolbar.querySelector('.workspace-page-size');
    search.value = st.query;
    size.value = String(st.pageSize);

    search.addEventListener('input', () => {
      st.query = search.value.trim().toLocaleLowerCase('zh-TW');
      st.page = 1;
      applyTableState(cfg);
    });
    size.addEventListener('change', () => {
      st.pageSize = Number(size.value) || 10;
      st.page = 1;
      applyTableState(cfg);
    });
    toolbar.querySelector('.workspace-prev').addEventListener('click', () => {
      if (st.page > 1) { st.page -= 1; applyTableState(cfg); }
    });
    toolbar.querySelector('.workspace-next').addEventListener('click', () => {
      st.page += 1;
      applyTableState(cfg);
    });

    if (cfg.selectable) {
      toolbar.querySelector('.workspace-batch-action').addEventListener('click', runBatchPayout);
    }
    return toolbar;
  }

  function logicalCells(row) {
    return [...row.children].filter(cell => !cell.classList.contains('workspace-select-cell'));
  }

  function sortableValue(text) {
    const normalized = String(text || '').replace(/[,$+%\s]/g, '').replace(/，/g, '');
    if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return { type: 'number', value: Number(normalized) };
    const date = Date.parse(String(text || '').trim());
    if (!Number.isNaN(date) && /\d{4}/.test(String(text || ''))) return { type: 'number', value: date };
    return { type: 'text', value: String(text || '').trim().toLocaleLowerCase('zh-TW') };
  }

  function addSorting(cfg, table) {
    const headers = [...table.querySelectorAll('thead th')].filter(th => !th.classList.contains('workspace-select-head'));
    const st = stateFor(cfg.name);
    headers.forEach((th, index) => {
      if (th.dataset.workspaceSortBound === cfg.name) return;
      th.dataset.workspaceSortBound = cfg.name;
      th.classList.add('workspace-sortable');
      th.addEventListener('click', event => {
        if (event.target.closest('input,button,a,select')) return;
        if (st.sortIndex === index) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
        else { st.sortIndex = index; st.sortDir = 'asc'; }
        st.page = 1;
        applyTableState(cfg);
      });
    });
  }

  function applySortIndicators(cfg, table) {
    const st = stateFor(cfg.name);
    [...table.querySelectorAll('thead th')].filter(th => !th.classList.contains('workspace-select-head')).forEach((th, index) => {
      if (index === st.sortIndex && st.sortDir) th.dataset.sortDir = st.sortDir;
      else delete th.dataset.sortDir;
    });
  }

  function ensurePayoutSelection(table, body) {
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('.workspace-select-head')) {
      const th = document.createElement('th');
      th.className = 'workspace-select-head';
      th.innerHTML = '<input class="workspace-checkbox workspace-select-all" type="checkbox" aria-label="選取本頁待撥款">';
      headerRow.insertBefore(th, headerRow.firstElementChild);
      th.querySelector('input').addEventListener('change', event => {
        body.querySelectorAll('tr:not(.workspace-hidden) .workspace-checkbox[data-payout-id]:not(:disabled)').forEach(box => {
          box.checked = event.target.checked;
          if (box.checked) selectedPayouts.add(box.dataset.payoutId);
          else selectedPayouts.delete(box.dataset.payoutId);
        });
        updateBatchButton();
      });
    }

    body.querySelectorAll('tr').forEach(row => {
      if (row.querySelector('td.empty') || row.querySelector('.workspace-select-cell')) return;
      const toggle = row.querySelector('.payout-toggle');
      const id = toggle?.dataset.id;
      const paid = toggle?.dataset.paid === 'true';
      const td = document.createElement('td');
      td.className = 'workspace-select-cell';
      if (id) {
        td.innerHTML = `<input class="workspace-checkbox" type="checkbox" data-payout-id="${UI.esc(id)}" aria-label="選取撥款" ${paid ? 'disabled' : ''} ${selectedPayouts.has(id) && !paid ? 'checked' : ''}>`;
        const box = td.querySelector('input');
        box.addEventListener('change', () => {
          if (box.checked) selectedPayouts.add(id); else selectedPayouts.delete(id);
          updateBatchButton();
        });
      }
      row.insertBefore(td, row.firstElementChild);
    });

    const currentPending = new Set([...body.querySelectorAll('.workspace-checkbox[data-payout-id]:not(:disabled)')].map(box => box.dataset.payoutId));
    [...selectedPayouts].forEach(id => { if (!currentPending.has(id)) selectedPayouts.delete(id); });
    updateBatchButton();
  }

  function rowsFor(body) {
    return [...body.querySelectorAll(':scope > tr')].filter(row => !row.querySelector('td.empty'));
  }

  function applyTableState(cfg) {
    const panel = document.querySelector(`.panel[data-panel="${cfg.panel}"]`);
    const body = document.querySelector(`#${cfg.body}`);
    const table = body?.closest('table');
    if (!panel || !body || !table) return;
    const toolbar = createToolbar(cfg, panel);
    const st = stateFor(cfg.name);

    if (cfg.selectable) ensurePayoutSelection(table, body);
    addSorting(cfg, table);
    applySortIndicators(cfg, table);

    let rows = rowsFor(body);
    if (st.sortIndex >= 0 && st.sortDir) {
      rows.sort((a, b) => {
        const av = sortableValue(logicalCells(a)[st.sortIndex]?.textContent || '');
        const bv = sortableValue(logicalCells(b)[st.sortIndex]?.textContent || '');
        let result;
        if (av.type === 'number' && bv.type === 'number') result = av.value - bv.value;
        else result = String(av.value).localeCompare(String(bv.value), 'zh-Hant');
        return st.sortDir === 'desc' ? -result : result;
      });
      rows.forEach(row => body.appendChild(row));
    }

    const matched = rows.filter(row => !st.query || row.textContent.toLocaleLowerCase('zh-TW').includes(st.query));
    const pages = Math.max(1, Math.ceil(matched.length / st.pageSize));
    st.page = Math.min(Math.max(1, st.page), pages);
    const start = (st.page - 1) * st.pageSize;
    const end = start + st.pageSize;
    const matchedSet = new Set(matched.slice(start, end));

    rows.forEach(row => row.classList.toggle('workspace-hidden', !matchedSet.has(row)));
    toolbar.querySelector('.workspace-count').textContent = st.query ? `${matched.length} / ${rows.length} 筆` : `${rows.length} 筆`;
    toolbar.querySelector('.workspace-page-label').textContent = `${st.page} / ${pages}`;
    toolbar.querySelector('.workspace-prev').disabled = st.page <= 1;
    toolbar.querySelector('.workspace-next').disabled = st.page >= pages;

    if (cfg.selectable) {
      const selectAll = table.querySelector('.workspace-select-all');
      const visible = [...body.querySelectorAll('tr:not(.workspace-hidden) .workspace-checkbox[data-payout-id]:not(:disabled)')];
      if (selectAll) {
        selectAll.checked = visible.length > 0 && visible.every(box => box.checked);
        selectAll.indeterminate = visible.some(box => box.checked) && !selectAll.checked;
      }
    }
  }

  function updateBatchButton(progress = null) {
    const btn = document.querySelector('.workspace-toolbar[data-workspace="payout"] .workspace-batch-action');
    if (!btn) return;
    const count = selectedPayouts.size;
    btn.disabled = count === 0 || btn.dataset.running === 'true';
    if (progress) {
      btn.innerHTML = `處理中 ${progress.done}/${progress.total}<span class="workspace-progress"><span style="width:${progress.total ? progress.done / progress.total * 100 : 0}%"></span></span>`;
    } else {
      btn.innerHTML = `批次標記已撥款 <span class="batch-count">${count}</span>`;
    }
  }

  async function runBatchPayout() {
    if (!selectedPayouts.size || !window.DB) return;
    const ids = [...selectedPayouts];
    if (!confirm(`確定要將選取的 ${ids.length} 筆收益標記為已撥款？`)) return;
    const btn = document.querySelector('.workspace-batch-action');
    if (!btn) return;
    btn.dataset.running = 'true';
    let done = 0;
    let failed = 0;
    updateBatchButton({ done, total: ids.length });
    for (const id of ids) {
      try {
        await DB.markPaid(id, true);
        selectedPayouts.delete(id);
      } catch (_) {
        failed += 1;
      }
      done += 1;
      updateBatchButton({ done, total: ids.length });
    }
    btn.dataset.running = 'false';
    snapshotCache = null;
    UI.toast(failed ? `批次處理完成，${failed} 筆未成功` : `已完成 ${done} 筆撥款標記`, failed ? 'error' : 'ok');
    document.querySelector('#refreshBtn')?.click();
    schedule(350);
  }

  function ensureDrawer() {
    let overlay = document.querySelector('#workspaceDetailOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'workspaceDetailOverlay';
    overlay.className = 'detail-overlay';
    overlay.innerHTML = `
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="資料詳情">
        <div class="detail-drawer-head">
          <div><p>QUICK VIEW</p><h2 id="detailDrawerTitle">資料詳情</h2></div>
          <button class="detail-close" type="button" aria-label="關閉">×</button>
        </div>
        <div id="detailDrawerBody" class="detail-body"></div>
      </aside>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDrawer(); });
    overlay.querySelector('.detail-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
    return overlay;
  }

  function closeDrawer() {
    document.querySelector('#workspaceDetailOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function openDrawer(title, html) {
    const overlay = ensureDrawer();
    overlay.querySelector('#detailDrawerTitle').textContent = title;
    overlay.querySelector('#detailDrawerBody').innerHTML = html;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function detailMetric(label, value) {
    return `<div class="detail-metric"><span>${UI.esc(label)}</span><strong>${UI.esc(value)}</strong></div>`;
  }

  function projectDetail(project, snap) {
    const parts = (snap.participations || []).filter(row => row.project_id === project.id);
    const settlements = (snap.settlements || []).filter(row => row.project_id === project.id);
    const totalParticipated = parts.filter(row => row.status === 'active').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalProfit = settlements.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0);
    const investors = parts.slice().sort((a,b) => Number(b.amount || 0) - Number(a.amount || 0));
    const recent = settlements.slice().sort((a,b) => String(b.batch?.week_start || '').localeCompare(String(a.batch?.week_start || ''))).slice(0, 8);
    return `
      <div class="detail-hero"><span class="detail-code">${UI.esc(project.code || 'PROJECT')}</span><h3>${UI.esc(project.name || '未命名投資案')}</h3><p>${UI.esc(project.source || '未設定案源')} · ${UI.date(project.start_date)}</p></div>
      <div class="detail-metrics">
        ${detailMetric('案件金額', UI.money(project.case_amount))}
        ${detailMetric('目前參與總額', UI.money(totalParticipated))}
        ${detailMetric('參與人數', String(new Set(parts.map(row => row.investor_id)).size))}
        ${detailMetric('累計分配收益', UI.money(totalProfit))}
      </div>
      <section class="detail-section"><h4>參與投資人</h4><div class="detail-list">
        ${investors.length ? investors.map(row => `<div class="detail-list-row"><span>${UI.esc(row.investor?.display_name || '—')}</span><strong>${UI.money(row.amount)}</strong></div>`).join('') : '<div class="detail-empty">尚無參與紀錄</div>'}
      </div></section>
      <section class="detail-section"><h4>最近收益分配</h4><div class="detail-list">
        ${recent.length ? recent.map(row => `<div class="detail-list-row"><span>${UI.date(row.batch?.week_start)} · ${UI.esc(row.investor?.display_name || '—')}</span><strong>+${UI.money(row.profit_amount)}</strong></div>`).join('') : '<div class="detail-empty">尚無收益紀錄</div>'}
      </div></section>
      ${project.note ? `<section class="detail-section"><h4>案件備註</h4><div class="detail-note">${UI.esc(project.note)}</div></section>` : ''}`;
  }

  function investorDetail(investor, snap) {
    const parts = (snap.participations || []).filter(row => row.investor_id === investor.id);
    const settlements = (snap.settlements || []).filter(row => row.investor_id === investor.id);
    const activeInvested = parts.filter(row => row.status === 'active').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalProfit = settlements.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0);
    const pendingProfit = settlements.filter(row => row.payout_status === 'pending').reduce((sum, row) => sum + Number(row.profit_amount || 0), 0);
    const paidProfit = Number(investor.opening_paid_amount || 0) + settlements.filter(row => row.payout_status === 'paid').reduce((sum, row) => sum + Number(row.profit_amount || 0), 0);
    const projects = parts.slice().sort((a,b) => Number(b.amount || 0) - Number(a.amount || 0));
    return `
      <div class="detail-hero"><span class="detail-code">${UI.esc(investor.code || 'INVESTOR')}</span><h3>${UI.esc(investor.display_name || '未命名投資人')}</h3><p>${UI.esc(investor.email || '尚未設定登入 Email')}</p></div>
      <div class="detail-metrics">
        ${detailMetric('目前投入', UI.money(activeInvested))}
        ${detailMetric('累計收益', UI.money(totalProfit))}
        ${detailMetric('待撥款收益', UI.money(pendingProfit))}
        ${detailMetric('累計已撥款', UI.money(paidProfit))}
      </div>
      <section class="detail-section"><h4>參與投資案</h4><div class="detail-list">
        ${projects.length ? projects.map(row => `<div class="detail-list-row"><span>${UI.esc(row.project?.name || '—')}<br><span class="muted">${UI.esc(row.project?.code || '')}</span></span><strong>${UI.money(row.amount)}</strong></div>`).join('') : '<div class="detail-empty">尚無參與紀錄</div>'}
      </div></section>
      <section class="detail-section"><h4>帳戶資訊</h4><div class="detail-list">
        <div class="detail-list-row"><span>登入 Email</span><strong>${UI.esc(investor.email || '尚未設定')}</strong></div>
        <div class="detail-list-row"><span>歷史已撥款起始值</span><strong>${UI.money(investor.opening_paid_amount)}</strong></div>
        <div class="detail-list-row"><span>投資案數</span><strong>${new Set(parts.map(row => row.project_id)).size}</strong></div>
      </div></section>`;
  }

  async function bindDetailRows(cfg) {
    if (!cfg.detail) return;
    const body = document.querySelector(`#${cfg.body}`);
    if (!body) return;
    let snap;
    try { snap = await getSnapshot(); } catch (_) { return; }
    const entities = cfg.detail === 'project' ? snap.projects || [] : snap.investors || [];
    const keyOf = entity => String(cfg.detail === 'project' ? entity.code : entity.code).trim();
    const map = new Map(entities.map(entity => [keyOf(entity), entity]));

    rowsFor(body).forEach(row => {
      const first = logicalCells(row)[0]?.textContent.trim();
      const entity = map.get(first);
      if (!entity) return;
      row.classList.add('workspace-row-detail');
      row.title = '點擊查看快速詳情';
      row.onclick = async event => {
        if (event.target.closest('button,input,a,select,textarea')) return;
        const latest = await getSnapshot(true).catch(() => snap);
        if (cfg.detail === 'project') openDrawer('投資案詳情', projectDetail(entity, latest));
        else openDrawer('投資人詳情', investorDetail(entity, latest));
      };
    });
  }

  async function renderNavCounts() {
    let snap;
    try { snap = await getSnapshot(); } catch (_) { return; }
    const counts = {
      payout: (snap.settlements || []).filter(row => row.payout_status === 'pending').length,
      projects: (snap.projects || []).filter(row => row.status === 'active').length,
      investors: (snap.investors || []).length,
      participations: (snap.participations || []).filter(row => row.status === 'active').length,
      settlement: (snap.batches || []).filter(row => row.status === 'draft').length
    };
    document.querySelectorAll('.nav-btn[data-panel]').forEach(btn => {
      const value = counts[btn.dataset.panel];
      let badge = btn.querySelector('.nav-count');
      if (value == null) { badge?.remove(); return; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-count'; btn.appendChild(badge); }
      badge.textContent = String(value);
      badge.title = btn.dataset.panel === 'payout' ? '待撥款筆數' : '目前筆數';
    });
  }

  async function decorateAll() {
    if (decorating || !window.DB || !window.UI || !DB.__hardeningLoaded) return;
    const app = document.querySelector('#adminApp');
    if (!app || app.style.display === 'none') return;
    decorating = true;
    try {
      for (const cfg of configs) {
        applyTableState(cfg);
        await bindDetailRows(cfg);
      }
      await renderNavCounts();
    } finally {
      decorating = false;
    }
  }

  function init() {
    if (!window.DB || !window.UI || !DB.__hardeningLoaded) { setTimeout(init, 80); return; }
    const app = document.querySelector('#adminApp');
    if (!app) { setTimeout(init, 80); return; }
    ensureDrawer();
    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.type === 'childList' && mutation.addedNodes.length)) schedule(80);
    });
    observer.observe(app, { childList: true, subtree: true });
    window.addEventListener('settlement-data-changed', () => { snapshotCache = null; schedule(180); });
    document.querySelector('#refreshBtn')?.addEventListener('click', () => { snapshotCache = null; schedule(260); });
    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => schedule(30)));
    schedule(100);
    setTimeout(() => schedule(0), 900);
  }

  init();
})();
