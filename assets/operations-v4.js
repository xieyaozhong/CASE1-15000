(() => {
  if (!/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;

  const STORAGE_KEY = 'case1-weekly-settlement-demo-v2';
  let snapshot = null;
  let snapshotAt = 0;
  let timer = 0;

  const esc = value => UI.esc(value ?? '');
  const isoToday = () => new Date().toISOString().slice(0, 10);

  function loadDemo() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
    catch (_) { return null; }
  }
  function saveDemo(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function changed() { window.dispatchEvent(new CustomEvent('settlement-data-changed')); }

  function extendDB() {
    if (typeof DB.updateProject !== 'function') {
      DB.updateProject = async (id, patch) => {
        const payload = {
          code: String(patch.code || '').trim(),
          name: String(patch.name || '').trim(),
          source: String(patch.source || '').trim() || null,
          case_amount: Number(patch.case_amount || 0),
          start_date: patch.start_date || null,
          note: String(patch.note || '').trim() || null
        };
        if (!payload.code || !payload.name) throw new Error('案號與投資案名稱不能空白。');
        if (payload.case_amount < 0) throw new Error('案件金額不能小於 0。');

        if (!DB.LIVE) {
          const data = loadDemo();
          const row = data?.projects?.find(item => item.id === id);
          if (!row) throw new Error('找不到投資案。');
          if (data.projects.some(item => item.id !== id && item.code === payload.code)) throw new Error('案號已被其他投資案使用。');
          Object.assign(row, payload);
          saveDemo(data);
          changed();
          return row;
        }
        const { data, error } = await DB.client.from('projects').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        changed();
        return data;
      };
    }

    if (typeof DB.closeProject !== 'function') {
      DB.closeProject = async id => {
        if (!DB.LIVE) {
          const data = loadDemo();
          const row = data?.projects?.find(item => item.id === id);
          if (!row) throw new Error('找不到投資案。');
          row.status = 'closed';
          (data.participations || []).forEach(part => {
            if (part.project_id === id && part.status === 'active') {
              part.status = 'closed';
              part.end_date = part.end_date || isoToday();
            }
          });
          saveDemo(data);
          changed();
          return row;
        }
        const { data: partData, error: partError } = await DB.client
          .from('participations')
          .update({ status: 'closed', end_date: isoToday() })
          .eq('project_id', id)
          .eq('status', 'active')
          .select('id');
        if (partError) throw partError;
        const { data, error } = await DB.client
          .from('projects')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        changed();
        return { project: data, closed_participations: partData?.length || 0 };
      };
    }
  }

  async function getSnapshot(force = false) {
    const now = Date.now();
    if (!force && snapshot && now - snapshotAt < 1200) return snapshot;
    snapshot = await DB.adminSnapshot();
    snapshotAt = now;
    return snapshot;
  }

  function schedule(ms = 80) {
    clearTimeout(timer);
    timer = setTimeout(enhance, ms);
  }

  function ensureModal() {
    let overlay = document.querySelector('#v4EditOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'v4EditOverlay';
    overlay.className = 'v4-modal-overlay';
    overlay.innerHTML = `
      <section class="v4-modal" role="dialog" aria-modal="true" aria-labelledby="v4ModalTitle">
        <div class="v4-modal-head">
          <div><span>EDIT RECORD</span><h2 id="v4ModalTitle">編輯資料</h2></div>
          <button type="button" class="v4-modal-close" aria-label="關閉">×</button>
        </div>
        <form id="v4EditForm" class="v4-edit-form"></form>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('.v4-modal-close').onclick = closeModal;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    return overlay;
  }

  function closeModal() {
    document.querySelector('#v4EditOverlay')?.classList.remove('open');
    if (!document.querySelector('#workspaceDetailOverlay.open')) document.body.style.overflow = '';
  }

  function openProjectEditor(project) {
    const overlay = ensureModal();
    overlay.querySelector('#v4ModalTitle').textContent = '編輯投資案';
    const form = overlay.querySelector('#v4EditForm');
    form.dataset.type = 'project';
    form.dataset.id = project.id;
    form.innerHTML = `
      <div class="v4-record-strip"><div><span>${esc(project.code)}</span><strong>${esc(project.name)}</strong></div>${UI.statusPill(project.status)}</div>
      <div class="form-grid">
        <div class="field"><label>案號</label><input class="input" name="code" required value="${esc(project.code)}"></div>
        <div class="field"><label>起始日</label><input class="input" type="date" name="start_date" value="${esc(project.start_date || '')}"></div>
        <div class="field full"><label>投資案名稱</label><input class="input" name="name" required value="${esc(project.name)}"></div>
        <div class="field"><label>案源</label><input class="input" name="source" value="${esc(project.source || '')}"></div>
        <div class="field"><label>案件金額</label><input class="input" type="number" min="0" step="0.01" name="case_amount" value="${Number(project.case_amount || 0)}"></div>
        <div class="field full"><label>備註</label><textarea name="note">${esc(project.note || '')}</textarea></div>
      </div>
      <div class="v4-modal-actions">
        <div>${project.status === 'active' ? '<button type="button" class="btn btn-danger v4-close-project">結束此投資案</button>' : '<span class="muted">此投資案已結束</span>'}</div>
        <div><button type="button" class="btn btn-soft v4-cancel">取消</button><button class="btn btn-primary">儲存修改</button></div>
      </div>`;
    form.querySelector('.v4-cancel').onclick = closeModal;
    form.querySelector('.v4-close-project')?.addEventListener('click', async () => {
      if (!confirm('結束投資案後，所有仍在進行中的參與紀錄也會同步結束。確定繼續？')) return;
      try {
        await DB.closeProject(project.id);
        UI.toast('投資案與進行中的參與紀錄已結束');
        closeModal();
        snapshot = null;
        document.querySelector('#refreshBtn')?.click();
        schedule(500);
      } catch (e) { UI.toast(e.message || '結束投資案失敗', 'error'); }
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      try {
        await DB.updateProject(project.id, values);
        UI.toast('投資案資料已更新');
        closeModal(); snapshot = null;
        document.querySelector('#refreshBtn')?.click(); schedule(500);
      } catch (err) { UI.toast(err.message || '更新失敗', 'error'); }
    };
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function openInvestorEditor(investor) {
    const overlay = ensureModal();
    overlay.querySelector('#v4ModalTitle').textContent = '編輯投資人';
    const form = overlay.querySelector('#v4EditForm');
    form.dataset.type = 'investor'; form.dataset.id = investor.id;
    form.innerHTML = `
      <div class="v4-record-strip"><div><span>${esc(investor.code)}</span><strong>${esc(investor.display_name)}</strong></div><span class="v4-record-kind">INVESTOR</span></div>
      <div class="form-grid">
        <div class="field"><label>投資人代碼</label><input class="input" name="code" required value="${esc(investor.code)}"></div>
        <div class="field"><label>顯示名稱</label><input class="input" name="display_name" required value="${esc(investor.display_name)}"></div>
        <div class="field full"><label>登入 Email</label><input class="input" type="email" name="email" value="${esc(investor.email || '')}"></div>
        <div class="field full"><label>歷史已撥款起始值</label><input class="input" type="number" min="0" step="0.01" name="opening_paid_amount" value="${Number(investor.opening_paid_amount || 0)}"></div>
      </div>
      <div class="notice warn">若此投資人已綁定登入帳號，修改 Email 不會自動改變 Supabase Auth 帳號本身的 Email。</div>
      <div class="v4-modal-actions v4-modal-actions-end"><button type="button" class="btn btn-soft v4-cancel">取消</button><button class="btn btn-primary">儲存修改</button></div>`;
    form.querySelector('.v4-cancel').onclick = closeModal;
    form.onsubmit = async e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      values.email = String(values.email || '').trim() || null;
      values.opening_paid_amount = Number(values.opening_paid_amount || 0);
      try {
        await DB.updateInvestor(investor.id, values);
        changed();
        UI.toast('投資人資料已更新');
        closeModal(); snapshot = null;
        document.querySelector('#refreshBtn')?.click(); schedule(500);
      } catch (err) { UI.toast(err.message || '更新失敗', 'error'); }
    };
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  async function decorateEditButtons() {
    const snap = await getSnapshot();
    const configs = [
      { body: '#projectAdminBody', items: snap.projects || [], type: 'project' },
      { body: '#investorBody', items: snap.investors || [], type: 'investor' }
    ];
    configs.forEach(cfg => {
      const body = document.querySelector(cfg.body); if (!body) return;
      const byCode = new Map(cfg.items.map(item => [String(item.code || '').trim(), item]));
      [...body.querySelectorAll(':scope > tr')].forEach(row => {
        if (row.querySelector('td.empty') || row.querySelector('.v4-row-edit')) return;
        const first = [...row.children].find(td => !td.classList.contains('workspace-select-cell'));
        const code = first?.childNodes?.[0]?.textContent?.trim() || first?.textContent?.trim();
        const item = byCode.get(code);
        if (!item || !first) return;
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'v4-row-edit'; btn.textContent = '編輯';
        btn.onclick = e => { e.stopPropagation(); cfg.type === 'project' ? openProjectEditor(item) : openInvestorEditor(item); };
        first.appendChild(btn);
      });
    });
  }

  function batchLabel(batch, rows) {
    const amount = rows.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0);
    return `${UI.date(batch?.week_start)}－${UI.date(batch?.week_end)} · ${rows.length} 筆 · ${UI.money(amount)}`;
  }

  async function ensureWeekQuickSelect() {
    const toolbar = document.querySelector('.workspace-toolbar[data-workspace="payout"] .workspace-tools');
    if (!toolbar) return;
    let group = toolbar.querySelector('.v4-week-select');
    if (!group) {
      group = document.createElement('div');
      group.className = 'v4-week-select';
      group.innerHTML = '<select aria-label="選擇待撥款週次"></select><button type="button" class="btn btn-soft btn-sm v4-select-week">選取此週</button><button type="button" class="v4-clear-selection">清除</button>';
      const batchAction = toolbar.querySelector('.workspace-batch-action');
      toolbar.insertBefore(group, batchAction || null);
      group.querySelector('.v4-select-week').onclick = () => selectWeek(group.querySelector('select').value);
      group.querySelector('.v4-clear-selection').onclick = clearSelections;
    }
    const snap = await getSnapshot();
    const pending = (snap.settlements || []).filter(row => row.payout_status === 'pending');
    const map = new Map();
    pending.forEach(row => {
      if (!map.has(row.batch_id)) map.set(row.batch_id, []);
      map.get(row.batch_id).push(row);
    });
    const select = group.querySelector('select');
    const current = select.value;
    const options = [...map.entries()].sort((a,b) => String(b[1][0]?.batch?.week_start || '').localeCompare(String(a[1][0]?.batch?.week_start || '')));
    select.innerHTML = options.length ? options.map(([id, rows]) => `<option value="${esc(id)}">${esc(batchLabel(rows[0]?.batch, rows))}</option>`).join('') : '<option value="">目前沒有待撥款週次</option>';
    if (options.some(([id]) => id === current)) select.value = current;
    group.querySelector('.v4-select-week').disabled = !options.length;
  }

  async function selectWeek(batchId) {
    if (!batchId) return;
    const snap = await getSnapshot(true);
    const ids = new Set((snap.settlements || []).filter(row => row.batch_id === batchId && row.payout_status === 'pending').map(row => String(row.id)));
    let selected = 0;
    document.querySelectorAll('#payoutBody .workspace-checkbox[data-payout-id]').forEach(box => {
      const should = ids.has(String(box.dataset.payoutId));
      if (box.checked !== should && !box.disabled) {
        box.checked = should;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (should && !box.disabled) selected += 1;
    });
    UI.toast(`已選取此週 ${selected} 筆待撥款`);
  }

  function clearSelections() {
    document.querySelectorAll('#payoutBody .workspace-checkbox[data-payout-id]:checked').forEach(box => {
      box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
  function downloadCSV(filename, rows) {
    const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function ensureExportPanel() {
    const sidebar = document.querySelector('.sidebar');
    const host = document.querySelector('.admin-layout > div');
    if (!sidebar || !host) return;
    let nav = sidebar.querySelector('.nav-btn[data-panel="exports"]');
    if (!nav) {
      nav = document.createElement('button'); nav.className = 'nav-btn'; nav.dataset.panel = 'exports'; nav.textContent = '報表匯出';
      const settings = sidebar.querySelector('.nav-btn[data-panel="settings"]'); sidebar.insertBefore(nav, settings || null);
      nav.onclick = () => {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn === nav));
        document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === 'exports'));
        populateExportPanel(true);
      };
    }
    let panel = host.querySelector('.panel[data-panel="exports"]');
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'panel'; panel.dataset.panel = 'exports';
      panel.innerHTML = `
        <div class="v4-export-hero"><div><span>REPORT CENTER</span><h2>報表匯出中心</h2><p>把營運資料整理成可交付、對帳與保存的 CSV。</p></div><div class="v4-export-date"></div></div>
        <div class="v4-export-grid">
          <article class="card card-pad v4-export-card"><span class="v4-export-icon">週</span><h3>週結算撥款清冊</h3><p>依單一週次匯出投資人、案件、收益與撥款狀態。</p><select id="v4ExportBatch"></select><button class="btn btn-primary v4-export-batch" type="button">匯出週結算 CSV</button></article>
          <article class="card card-pad v4-export-card"><span class="v4-export-icon">人</span><h3>投資人對帳明細</h3><p>匯出單一投資人的參與案件與歷次收益紀錄。</p><select id="v4ExportInvestor"></select><button class="btn btn-primary v4-export-investor" type="button">匯出投資人 CSV</button></article>
          <article class="card card-pad v4-export-card"><span class="v4-export-icon">案</span><h3>投資案營運總覽</h3><p>匯出全部案件的本金、參與人數、累計收益與待撥款。</p><div class="v4-export-spacer"></div><button class="btn btn-dark v4-export-projects" type="button">匯出案件總覽 CSV</button></article>
        </div>`;
      host.appendChild(panel);
      panel.querySelector('.v4-export-batch').onclick = exportBatch;
      panel.querySelector('.v4-export-investor').onclick = exportInvestor;
      panel.querySelector('.v4-export-projects').onclick = exportProjects;
    }
    panel.querySelector('.v4-export-date').textContent = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'long' }).format(new Date());
  }

  async function populateExportPanel(force = false) {
    const panel = document.querySelector('.panel[data-panel="exports"]'); if (!panel) return;
    const snap = await getSnapshot(force);
    const batch = panel.querySelector('#v4ExportBatch'), investor = panel.querySelector('#v4ExportInvestor');
    if (batch) {
      const old = batch.value;
      batch.innerHTML = (snap.batches || []).map(item => `<option value="${esc(item.id)}">${esc(UI.date(item.week_start))}－${esc(UI.date(item.week_end))} · ${esc(item.status)}</option>`).join('') || '<option value="">尚無週結算</option>';
      if ((snap.batches || []).some(item => item.id === old)) batch.value = old;
    }
    if (investor) {
      const old = investor.value;
      investor.innerHTML = (snap.investors || []).map(item => `<option value="${esc(item.id)}">${esc(item.code)}｜${esc(item.display_name)}</option>`).join('') || '<option value="">尚無投資人</option>';
      if ((snap.investors || []).some(item => item.id === old)) investor.value = old;
    }
  }

  async function exportBatch() {
    const id = document.querySelector('#v4ExportBatch')?.value; if (!id) return;
    const snap = await getSnapshot(true), batch = (snap.batches || []).find(item => item.id === id);
    const rows = (snap.settlements || []).filter(item => item.batch_id === id);
    downloadCSV(`週結算_${batch?.week_start || 'batch'}.csv`, [
      ['週起始','週結束','投資人代碼','投資人','投資案代碼','投資案','參與金額','收益','撥款狀態','撥款日'],
      ...rows.map(row => [batch?.week_start || '', batch?.week_end || '', row.investor?.code || '', row.investor?.display_name || '', row.project?.code || '', row.project?.name || '', row.invested_amount, row.profit_amount, row.payout_status, row.paid_at || ''])
    ]);
    UI.toast(`已匯出 ${rows.length} 筆週結算資料`);
  }

  async function exportInvestor() {
    const id = document.querySelector('#v4ExportInvestor')?.value; if (!id) return;
    const snap = await getSnapshot(true), investor = (snap.investors || []).find(item => item.id === id);
    const parts = (snap.participations || []).filter(item => item.investor_id === id);
    const settlements = (snap.settlements || []).filter(item => item.investor_id === id);
    const rows = [['類型','日期／週期','投資案代碼','投資案','金額','收益','狀態','撥款日']];
    parts.forEach(row => rows.push(['參與', row.start_date || '', row.project?.code || '', row.project?.name || '', row.amount, '', row.status, '']));
    settlements.forEach(row => rows.push(['收益', `${row.batch?.week_start || ''}~${row.batch?.week_end || ''}`, row.project?.code || '', row.project?.name || '', row.invested_amount, row.profit_amount, row.payout_status, row.paid_at || '']));
    downloadCSV(`投資人對帳_${investor?.code || 'investor'}_${isoToday()}.csv`, rows);
    UI.toast(`已匯出 ${investor?.display_name || '投資人'} 對帳明細`);
  }

  async function exportProjects() {
    const snap = await getSnapshot(true);
    const rows = [['案號','投資案','案源','案件金額','起始日','狀態','目前參與總額','參與人數','累計分配收益','待撥款收益']];
    (snap.projects || []).forEach(project => {
      const parts = (snap.participations || []).filter(item => item.project_id === project.id && item.status === 'active');
      const settlements = (snap.settlements || []).filter(item => item.project_id === project.id);
      rows.push([project.code, project.name, project.source || '', project.case_amount, project.start_date || '', project.status,
        parts.reduce((n,item) => n + Number(item.amount || 0), 0), new Set(parts.map(item => item.investor_id)).size,
        settlements.reduce((n,item) => n + Number(item.profit_amount || 0), 0), settlements.filter(item => item.payout_status === 'pending').reduce((n,item) => n + Number(item.profit_amount || 0), 0)]);
    });
    downloadCSV(`投資案營運總覽_${isoToday()}.csv`, rows);
    UI.toast(`已匯出 ${Math.max(0, rows.length - 1)} 筆投資案`);
  }

  function relocateBatchControls() {
    const card = document.querySelector('#batchControlCard');
    const panel = document.querySelector('.panel[data-panel="settlement"]');
    if (!card || !panel || card.parentElement === panel) return;
    card.classList.add('v4-batch-workspace');
    panel.appendChild(card);
  }

  function ensureSettlementGuide() {
    const panel = document.querySelector('.panel[data-panel="settlement"]');
    if (!panel || panel.querySelector('.v4-flow-guide')) return;
    const guide = document.createElement('div'); guide.className = 'v4-flow-guide';
    guide.innerHTML = '<div><span>1</span><strong>試算收益</strong><small>輸入本週案件收益</small></div><i>→</i><div><span>2</span><strong>確認鎖定</strong><small>確認後客戶才看得到</small></div><i>→</i><div><span>3</span><strong>完成撥款</strong><small>逐筆或批次標記</small></div>';
    panel.insertBefore(guide, panel.firstElementChild);
  }

  async function enhance() {
    if (!window.DB || !window.UI || !DB.__hardeningLoaded) return;
    const app = document.querySelector('#adminApp'); if (!app || app.style.display === 'none') return;
    try {
      extendDB(); ensureModal(); ensureExportPanel(); ensureSettlementGuide(); relocateBatchControls();
      await decorateEditButtons(); await ensureWeekQuickSelect();
      if (document.querySelector('.panel[data-panel="exports"].active')) await populateExportPanel();
    } catch (_) {}
  }

  function init() {
    if (!window.DB || !window.UI || !DB.__hardeningLoaded) { setTimeout(init, 90); return; }
    extendDB();
    window.addEventListener('settlement-data-changed', () => { snapshot = null; schedule(250); });
    document.querySelector('#refreshBtn')?.addEventListener('click', () => { snapshot = null; schedule(420); });
    document.addEventListener('submit', e => { if (e.target.matches('#projectForm,#investorForm,#participationForm,#settlementForm,#adminLoginForm')) { snapshot = null; schedule(700); } });
    document.addEventListener('click', e => { if (e.target.closest('.payout-toggle,.batch-confirm,#doImport,#resetDemo,.nav-btn')) schedule(280); });
    schedule(160); setTimeout(() => schedule(0), 1100);
  }

  init();
})();
