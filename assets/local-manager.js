(async function () {
  'use strict';

  const DB = window.LocalInvestmentDB;
  const Core = window.SettlementCore;
  const Autofill = window.ImportAutofill;
  const LegacyMatrix = window.LegacyMatrixImport;
  const ExcelGuard = window.ExcelImportGuard;
  const DriveImport = window.GoogleDriveImport;
  const ImportIdentity = window.ImportIdentity;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const moneyFormat = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 });
  const numberFormat = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
  const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  let snapshot;
  let activeBatchId = null;
  let parsedImport = null;
  let pendingImportFile = null;
  let legacyProfileOptions = null;
  let appReady = false;
  const panelNames = new Set($$('.panel[data-panel]').map(panel => panel.dataset.panel));

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function money(value) { return moneyFormat.format(Number(value || 0)); }
  function number(value) { return numberFormat.format(Number(value || 0)); }
  function pct(value) { return `${numberFormat.format(Number(value || 0))}%`; }

  function todayLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function displayDate(value) {
    const date = Core.dateOnly(value);
    if (!date) return '—';
    const [year, month, day] = date.split('-');
    return `${year}/${month}/${day}`;
  }

  function displayDateTime(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : dateTimeFormat.format(parsed);
  }

  function durationLabel(record) {
    return `${number(record.duration_value)} ${record.duration_unit === 'day' ? '天' : '個月'}`;
  }

  function investmentViewStatus(record, asOf = todayLocal()) {
    if (record.status === 'settled') return 'settled';
    if (record.start_date > asOf) return 'scheduled';
    return record.maturity_date <= asOf ? 'due' : 'active';
  }

  function statusPill(status) {
    const map = {
      active: ['進行中', 'active'], scheduled: ['尚未開始', 'active'], due: ['已到期', 'due'], settled: ['已結算', 'settled']
    };
    const [label, className] = map[status] || [status, 'active'];
    return `<span class="status-pill ${className}">${esc(label)}</span>`;
  }

  function emptyRow(columns, title, text = '') {
    return `<tr><td colspan="${columns}"><div class="empty-state"><strong>${esc(title)}</strong>${esc(text)}</div></td></tr>`;
  }

  function emptyBlock(title, text = '') {
    return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(text)}</div>`;
  }

  function toast(message, type = 'ok') {
    const element = $('#toast');
    element.textContent = message;
    element.style.background = type === 'error' ? '#9b3434' : '#112b44';
    element.classList.add('show');
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.remove('show'), 3200);
  }

  function showNotice(message, type = 'info') {
    const notice = $('#appNotice');
    notice.hidden = false;
    notice.className = `notice manager-notice${type === 'error' ? ' error' : type === 'warn' ? ' warn' : ''}`;
    notice.textContent = message;
  }

  function clearNotice() { $('#appNotice').hidden = true; }

  function confirmAction(title, message, confirmLabel = '確認') {
    const modal = $('#confirmModal');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    $('#confirmOkBtn').textContent = confirmLabel;
    modal.inert = false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    return new Promise(resolve => {
      const finish = value => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        modal.inert = true;
        document.body.style.overflow = '';
        $('#confirmOkBtn').onclick = null;
        $('#confirmCancelBtn').onclick = null;
        modal.onclick = null;
        resolve(value);
      };
      $('#confirmOkBtn').onclick = () => finish(true);
      $('#confirmCancelBtn').onclick = () => finish(false);
      modal.onclick = event => { if (event.target === modal) finish(false); };
      setTimeout(() => $('#confirmOkBtn').focus(), 30);
    });
  }

  function panelFromLocation() {
    let name = '';
    try { name = decodeURIComponent(window.location.hash.replace(/^#/, '')); }
    catch (_) { return 'overview'; }
    return panelNames.has(name) ? name : 'overview';
  }

  function updatePanelUrl(name, replace = false) {
    const url = new URL(window.location.href);
    url.hash = name === 'overview' ? '' : name;
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    window.history[replace ? 'replaceState' : 'pushState']({ panel: name }, '', next);
  }

  function switchPanel(name, options = {}) {
    if (!panelNames.has(name)) name = 'overview';
    const { updateUrl = true, replaceUrl = false, focus = false, scroll = true } = options;
    $$('.nav-btn[data-panel]').forEach(button => button.classList.toggle('active', button.dataset.panel === name));
    $$('.panel[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
    if (snapshot && name === 'settlement') renderDuePreview();
    if (snapshot && name === 'reports') renderReports();
    if (updateUrl) updatePanelUrl(name, replaceUrl);
    if (!scroll) return;
    const panel = $(`.panel[data-panel="${name}"]`);
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (name === 'import' || name === 'settings') panel?.scrollIntoView({ behavior: 'auto', block: 'start' });
    else window.scrollTo({ top: 0, behavior });
    if (focus) panel?.focus({ preventScroll: true });
  }

  function updateStorageStatus() {
    const sqlite = DB.backend === 'sqlite';
    const chip = $('#storageChip');
    chip.className = `status-chip ${sqlite ? 'live' : 'demo'}`;
    chip.innerHTML = `<span class="status-dot"></span>${sqlite ? '本機 SQLite' : '瀏覽器儲存'}`;
    $('#storageDescription').textContent = sqlite
      ? '本機模式：資料寫入專案 data 資料夾內的 SQLite 檔案，關閉瀏覽器或重新開機後仍會保留。'
      : '線上模式：資料只保存在目前瀏覽器，不會上傳到公開網站，也不會自動同步到其他裝置。';
    if (!sqlite) showNotice('目前為線上瀏覽器模式：資料只保存在這個瀏覽器。請定期下載 JSON 備份；需要本機 SQLite 時可使用 start-local.cmd。', 'info');
  }

  function renderKpis() {
    const today = todayLocal();
    const active = snapshot.investments.filter(item => item.status !== 'settled');
    const due = active.filter(item => Core.isMatured(item, today));
    const settledProfit = snapshot.settlement_entries.reduce((sum, row) => sum + Number(row.profit_amount || 0), 0);
    $('#kpiInvestors').textContent = number(snapshot.investors.length);
    $('#kpiPrincipal').textContent = money(active.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    $('#kpiDue').textContent = number(due.length);
    $('#kpiDueMeta').textContent = due.length ? `涉及 ${new Set(due.map(row => row.investor_id)).size} 位顧客` : '目前沒有待結算資料';
    $('#kpiProfit').textContent = money(settledProfit);
    $('#navDueBadge').textContent = due.length;
    $('#navInvestmentBadge').textContent = snapshot.investments.length;
    $('#navReportBadge').textContent = snapshot.settlement_batches.length;
  }

  function renderOverview() {
    const today = todayLocal();
    const due = DB.due(today).sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));
    const future = snapshot.investments
      .filter(item => item.status !== 'settled')
      .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));
    $('#overviewDueTitle').textContent = due.length ? `${due.length} 筆投資已到期，等待結算` : '今天沒有待結算資料';
    $('#overviewDueText').textContent = due.length
      ? `到期本金 ${money(due.reduce((sum, row) => sum + Number(row.amount), 0))}，預計淨收益 ${money(due.reduce((sum, row) => sum + Number(row.net_profit), 0))}。`
      : '新增或匯入投資資料後，系統會依到期日自動整理。';
    $('#overviewSettleBtn').disabled = !due.length;

    $('#overviewDueList').innerHTML = future.length
      ? future.slice(0, 5).map(row => `<div class="compact-row"><div><strong>${esc(row.investor_name)} · ${esc(row.project_name)}</strong><span>${displayDate(row.maturity_date)} 到期 ${Core.isMatured(row, today) ? '· 等待結算' : ''}</span></div><div class="compact-value"><strong>${money(row.net_profit)}</strong><span>${money(row.amount)} 本金</span></div></div>`).join('')
      : emptyBlock('尚無投資資料', '可手動新增或由 Excel 匯入。');

    const batches = snapshot.settlement_batches.slice().sort((a, b) => b.settled_at.localeCompare(a.settled_at));
    $('#overviewBatchList').innerHTML = batches.length
      ? batches.slice(0, 5).map(batch => `<div class="compact-row"><div><strong>${displayDateTime(batch.settled_at)}</strong><span>基準日 ${displayDate(batch.as_of_date)} · ${batch.investor_count} 位顧客</span></div><div class="compact-value"><strong>${money(batch.profit_total)}</strong><span>${batch.entry_count} 筆</span></div></div>`).join('')
      : emptyBlock('尚無結算批次', '到期資料結算後會顯示在這裡。');
  }

  function renderInvestments() {
    const query = $('#investmentSearch').value.trim().toLocaleLowerCase('zh-TW');
    const filter = $('#investmentStatusFilter').value;
    const today = todayLocal();
    const rows = snapshot.investments
      .slice()
      .sort((a, b) => a.status === b.status ? b.created_at.localeCompare(a.created_at) : (a.status === 'settled' ? 1 : -1))
      .filter(row => {
        const status = investmentViewStatus(row, today);
        const filterMatch = !filter || (filter === 'active' ? ['active', 'scheduled'].includes(status) : status === filter);
        const queryMatch = !query || `${row.investor_name} ${row.project_name}`.toLocaleLowerCase('zh-TW').includes(query);
        return filterMatch && queryMatch;
      });
    $('#investmentCount').textContent = `${rows.length} / ${snapshot.investments.length} 筆`;
    $('#investmentBody').innerHTML = rows.length ? rows.map(row => {
      const status = investmentViewStatus(row, today);
      const locked = row.status === 'settled';
      const profitClass = Number(row.net_profit) < 0 ? 'profit-negative' : 'profit-positive';
      return `<tr>
        <td><strong>${esc(row.investor_name)}</strong><div class="muted">${esc(row.investor?.code || '')}</div></td>
        <td><strong>${esc(row.project_name)}</strong><div class="muted">${esc(row.project?.code || '')}</div></td>
        <td class="money">${money(row.amount)}</td><td>${displayDate(row.start_date)}</td><td>${durationLabel(row)}</td><td>${displayDate(row.maturity_date)}</td>
        <td>${pct(row.interest_rate)}</td><td class="${profitClass}">${money(row.net_profit)}</td><td>${statusPill(status)}</td>
        <td><div class="row-actions">${locked ? `<button class="btn btn-soft" type="button" data-customer="${esc(row.investor_id)}">歷史</button>` : `<button class="btn btn-soft" type="button" data-edit="${esc(row.id)}">編輯</button><button class="btn btn-danger" type="button" data-delete="${esc(row.id)}">刪除</button>`}</div></td>
      </tr>`;
    }).join('') : emptyRow(10, '沒有符合條件的投資資料', '請調整搜尋條件或新增一筆資料。');
  }

  function renderDuePreview() {
    const asOf = $('#settlementAsOf').value || todayLocal();
    const due = DB.due(asOf).sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));
    $('#dueCount').textContent = number(due.length);
    $('#dueInvestors').textContent = number(new Set(due.map(row => row.investor_id)).size);
    $('#duePrincipal').textContent = money(due.reduce((sum, row) => sum + Number(row.amount), 0));
    $('#dueProfit').textContent = money(due.reduce((sum, row) => sum + Number(row.net_profit), 0));
    $('#runSettlementBtn').disabled = !due.length;
    $('#duePreviewBody').innerHTML = due.length ? due.map(row => `<tr><td><strong>${esc(row.investor_name)}</strong></td><td>${esc(row.project_name)}</td><td>${displayDate(row.maturity_date)}</td><td class="money">${money(row.amount)}</td><td>${pct(row.interest_rate)}</td><td class="${Number(row.net_profit) < 0 ? 'profit-negative' : 'profit-positive'}">${money(row.net_profit)}</td></tr>`).join('') : emptyRow(6, '基準日前沒有到期資料', '變更基準日或先新增投資資料。');
  }

  function renderReports() {
    const batches = snapshot.settlement_batches.slice().sort((a, b) => b.settled_at.localeCompare(a.settled_at));
    const select = $('#batchSelect');
    if (!batches.length) {
      activeBatchId = null;
      select.innerHTML = '<option value="">尚無結算批次</option>';
      select.disabled = true;
      $('#exportBatchBtn').disabled = true;
      $('#reportBatchMeta').innerHTML = '';
      $('#customerSummaryBody').innerHTML = emptyRow(6, '尚無結算總表', '完成一鍵結算後即可查看。');
      $('#batchDetailBody').innerHTML = emptyRow(7, '尚無逐筆明細');
      return;
    }
    if (!activeBatchId || !batches.some(batch => batch.id === activeBatchId)) activeBatchId = batches[0].id;
    select.disabled = false;
    select.innerHTML = batches.map(batch => `<option value="${esc(batch.id)}" ${batch.id === activeBatchId ? 'selected' : ''}>${displayDateTime(batch.settled_at)}｜${batch.entry_count} 筆｜${money(batch.profit_total)}</option>`).join('');
    $('#exportBatchBtn').disabled = false;
    const report = DB.batchReport(activeBatchId);
    const batch = report.batch;
    $('#reportBatchMeta').innerHTML = `<div class="report-stat"><span>結算時間戳</span><strong>${displayDateTime(batch.settled_at)}</strong></div><div class="report-stat"><span>結算基準日</span><strong>${displayDate(batch.as_of_date)}</strong></div><div class="report-stat"><span>本金合計</span><strong>${money(batch.principal_total)}</strong></div><div class="report-stat"><span>淨收益合計</span><strong>${money(batch.profit_total)}</strong></div>`;
    $('#customerSummaryBody').innerHTML = report.customers.map(customer => {
      const effectiveRate = customer.principal_total ? customer.profit_total / customer.principal_total * 100 : 0;
      return `<tr><td><button class="customer-link" type="button" data-customer="${esc(customer.investor_id)}">${esc(customer.investor_name)}</button></td><td>${customer.entry_count}</td><td class="money">${money(customer.principal_total)}</td><td>${pct(customer.weighted_interest_rate)}</td><td class="${customer.profit_total < 0 ? 'profit-negative' : 'profit-positive'}">${money(customer.profit_total)}</td><td>${pct(effectiveRate)}</td></tr>`;
    }).join('') || emptyRow(6, '本批次沒有顧客資料');
    $('#batchDetailBody').innerHTML = report.entries.map(row => `<tr><td><button class="customer-link" type="button" data-customer="${esc(row.investor_id)}">${esc(row.investor_name)}</button></td><td>${esc(row.project_name)}</td><td>${displayDate(row.start_date)}</td><td>${displayDate(row.maturity_date)}</td><td class="money">${money(row.principal_amount)}</td><td>${pct(row.interest_rate)}</td><td class="${Number(row.profit_amount) < 0 ? 'profit-negative' : 'profit-positive'}">${money(row.profit_amount)}</td></tr>`).join('') || emptyRow(7, '本批次沒有明細');
  }

  function renderSettings() {
    $('#settingsUpdatedAt').textContent = displayDateTime(snapshot.meta.updated_at);
    $('#settingsInvestmentCount').textContent = `${snapshot.investments.length} 筆`;
    $('#settingsBatchCount').textContent = `${snapshot.settlement_batches.length} 批`;
    $('#lastSavedAt').textContent = `最後儲存 ${displayDateTime(snapshot.meta.updated_at)}`;
  }

  function renderDatalists() {
    $('#investorOptions').innerHTML = snapshot.investors.slice().sort((a, b) => a.display_name.localeCompare(b.display_name, 'zh-Hant')).map(item => `<option value="${esc(item.display_name)}"></option>`).join('');
    $('#projectOptions').innerHTML = snapshot.projects.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')).map(item => `<option value="${esc(item.name)}"></option>`).join('');
  }

  function renderAll() {
    renderKpis();
    renderOverview();
    renderInvestments();
    renderDuePreview();
    renderReports();
    renderSettings();
    renderDatalists();
  }

  async function refresh() {
    snapshot = DB.snapshot();
    renderAll();
  }

  function openInvestmentModal(record) {
    const form = $('#investmentForm');
    form.reset();
    $('#investmentId').value = record?.id || '';
    $('#investmentModalTitle').textContent = record ? '編輯投資資料' : '新增投資資料';
    $('#investorName').value = record?.investor_name || '';
    $('#projectName').value = record?.project_name || '';
    $('#investmentAmount').value = record?.amount ?? '';
    $('#investmentStart').value = record?.start_date || todayLocal();
    $('#durationValue').value = record?.duration_value ?? 1;
    $('#durationUnit').value = record?.duration_unit || 'month';
    $('#interestRate').value = record?.interest_rate ?? '';
    $('#netProfit').value = record?.net_profit ?? '';
    $('#investmentNote').value = record?.note || '';
    updateFormCalculations();
    const modal = $('#investmentModal');
    modal.inert = false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#investorName').focus(), 60);
  }

  function closeInvestmentModal() {
    const modal = $('#investmentModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modal.inert = true;
    document.body.style.overflow = '';
  }

  function updateFormCalculations() {
    const maturity = Core.addDuration($('#investmentStart').value, Number($('#durationValue').value), $('#durationUnit').value);
    $('#maturityPreview').textContent = maturity ? displayDate(maturity) : '—';
    const amount = Number($('#investmentAmount').value);
    const rate = Number($('#interestRate').value);
    const profitRaw = $('#netProfit').value;
    const hint = $('#rateHint');
    if (Number.isFinite(amount) && amount > 0 && Number.isFinite(rate) && profitRaw !== '') {
      const expected = amount * rate / 100;
      const actual = Number(profitRaw);
      const effective = amount ? actual / amount * 100 : 0;
      hint.textContent = `利率推算收益 ${money(expected)}；目前輸入淨收益 ${money(actual)}（有效報酬率 ${pct(effective)}）。結算以輸入淨收益為準。`;
      hint.classList.toggle('warning', Math.abs(expected - actual) > 0.01);
    } else {
      hint.textContent = '投資淨收益是實際結算金額；利率只作契約與歷史顯示，不會覆蓋淨收益。';
      hint.classList.remove('warning');
    }
  }

  async function saveInvestment(event) {
    event.preventDefault();
    const button = $('#saveInvestmentBtn');
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form.entries());
    const id = $('#investmentId').value || null;
    button.disabled = true;
    try {
      await DB.upsertInvestment(input, id);
      await refresh();
      closeInvestmentModal();
      toast(id ? '投資資料已更新。' : '投資資料已新增。');
    } catch (error) {
      toast(error.message || '儲存失敗。', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deleteInvestment(id) {
    const record = snapshot.investments.find(item => item.id === id);
    if (!record) return;
    if (!await confirmAction('刪除投資資料', `確定刪除「${record.investor_name}｜${record.project_name}」這筆尚未結算的資料？`, '確認刪除')) return;
    try {
      await DB.deleteInvestment(id);
      await refresh();
      toast('投資資料已刪除。');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function runSettlement() {
    const asOf = $('#settlementAsOf').value;
    const due = DB.due(asOf);
    if (!due.length) { toast('這個基準日前沒有待結算資料。', 'error'); return; }
    const principal = due.reduce((sum, row) => sum + Number(row.amount), 0);
    const profit = due.reduce((sum, row) => sum + Number(row.net_profit), 0);
    if (!await confirmAction('確認一鍵結算', `將結算 ${due.length} 筆到期資料，涉及 ${new Set(due.map(row => row.investor_id)).size} 位顧客。\n本金合計：${money(principal)}\n淨收益合計：${money(profit)}\n\n完成後財務欄位會鎖定。`, '確認結算')) return;
    const button = $('#runSettlementBtn');
    button.disabled = true;
    button.textContent = '結算處理中…';
    try {
      const result = await DB.settleDue(asOf);
      if (!result.batch) { toast('資料已被其他操作結算，沒有新增批次。', 'error'); return; }
      activeBatchId = result.batch.id;
      await refresh();
      $('#settlementResult').innerHTML = `<div class="settlement-success"><h3>結算完成</h3><p>${displayDateTime(result.batch.settled_at)} 已建立 ${result.batch.entry_count} 筆不可變收益快照，淨收益合計 ${money(result.batch.profit_total)}。</p><div class="toolbar"><button class="btn btn-success" type="button" data-view-report>查看顧客收益總表</button><button class="btn btn-soft" type="button" data-export-current>匯出 Excel</button></div></div>`;
      toast('所有到期資料已完成結算。');
    } catch (error) { toast(error.message || '結算失敗。', 'error'); }
    finally { button.textContent = '一鍵結算全部到期資料'; renderDuePreview(); }
  }

  function openCustomerDrawer(investorId) {
    const report = DB.investorHistory(investorId, activeBatchId);
    if (!report.investor) return;
    const currentPrincipal = report.current.reduce((sum, row) => sum + Number(row.principal_amount), 0);
    const currentProfit = report.current.reduce((sum, row) => sum + Number(row.profit_amount), 0);
    const totalProfit = report.history.reduce((sum, row) => sum + Number(row.profit_amount), 0);
    const active = report.investments.filter(item => item.status !== 'settled');
    $('#customerDrawerTitle').textContent = `${report.investor.display_name}｜顧客歷史`;
    $('#customerDrawerBody').innerHTML = `
      <section class="customer-hero"><span>${esc(report.investor.code || 'CUSTOMER')}</span><h3>${esc(report.investor.display_name)}</h3><p>${report.history.length} 筆歷史結算 · ${active.length} 筆未結算投資</p></section>
      <div class="drawer-metrics"><div class="drawer-metric"><span>本次結算本金</span><strong>${money(currentPrincipal)}</strong></div><div class="drawer-metric"><span>本次淨收益</span><strong>${money(currentProfit)}</strong></div><div class="drawer-metric"><span>歷史累計淨收益</span><strong>${money(totalProfit)}</strong></div></div>
      <section class="drawer-section"><h4>目前結算報表</h4>${report.current.length ? `<div class="timeline">${report.current.map(row => timelineItem(row)).join('')}</div>` : emptyBlock('此顧客不在目前選取的結算批次')}</section>
      <section class="drawer-section"><h4>歷史結算時間軸</h4>${report.history.length ? `<div class="timeline">${report.history.map(row => timelineItem(row)).join('')}</div>` : emptyBlock('尚無歷史結算紀錄')}</section>
      <section class="drawer-section"><h4>尚未結算投資</h4>${active.length ? active.map(row => `<div class="compact-row"><div><strong>${esc(row.project_name)}</strong><span>${displayDate(row.start_date)} → ${displayDate(row.maturity_date)} · ${pct(row.interest_rate)}</span></div><div class="compact-value"><strong>${money(row.net_profit)}</strong><span>${money(row.amount)} 本金</span></div></div>`).join('') : emptyBlock('目前沒有未結算投資')}</section>`;
    const drawer = $('#customerDrawer');
    drawer.inert = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function timelineItem(row) {
    const effective = Number(row.principal_amount) ? Number(row.profit_amount) / Number(row.principal_amount) * 100 : 0;
    return `<div class="timeline-item"><div class="timeline-time">${displayDateTime(row.settled_at)}</div><div class="timeline-card"><div><strong>${esc(row.project_name)}</strong><span>${displayDate(row.start_date)} → ${displayDate(row.maturity_date)} · 合約利率 ${pct(row.interest_rate)} · 有效 ${pct(effective)}</span></div><div class="timeline-money"><strong class="${Number(row.profit_amount) < 0 ? 'profit-negative' : 'profit-positive'}">${money(row.profit_amount)}</strong><span>本金 ${money(row.principal_amount)}</span></div></div></div>`;
  }

  function closeCustomerDrawer() {
    const drawer = $('#customerDrawer');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    document.body.style.overflow = '';
  }

  function downloadBlob(contents, filename, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    const stamp = todayLocal().replaceAll('-', '');
    downloadBlob(`\ufeff${JSON.stringify(DB.backup(), null, 2)}`, `投資結算完整備份_${stamp}.json`, 'application/json;charset=utf-8');
    toast('完整備份已下載。');
  }

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const payload = JSON.parse((await file.text()).replace(/^\ufeff/, ''));
      if (!await confirmAction('還原完整備份', `將以「${file.name}」取代目前所有資料。此操作會覆蓋現有資料。`, '確認還原')) return;
      await DB.restore(payload);
      activeBatchId = null;
      await refresh();
      toast('備份已完整還原。');
    } catch (error) { toast(error.message || '備份檔案無法讀取。', 'error'); }
    finally { $('#restoreInput').value = ''; }
  }

  function exportBatchExcel() {
    if (!activeBatchId) return;
    const report = DB.batchReport(activeBatchId);
    if (!window.XLSX) { exportBatchCsv(report); return; }
    const summary = report.customers.map(row => ({
      顧客: row.investor_name,
      投資筆數: row.entry_count,
      本金合計: row.principal_total,
      '本金加權利率(%)': row.weighted_interest_rate,
      本次淨收益: row.profit_total,
      '有效報酬率(%)': row.principal_total ? row.profit_total / row.principal_total * 100 : 0,
      結算時間戳: displayDateTime(report.batch.settled_at)
    }));
    const details = report.entries.map(row => ({
      顧客: row.investor_name, 投資案: row.project_name, 投資本金: row.principal_amount,
      開始日: row.start_date, 到期日: row.maturity_date, '投資利率(%)': row.interest_rate,
      投資淨收益: row.profit_amount, 結算時間戳: displayDateTime(row.settled_at)
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), '顧客收益總表');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(details), '逐筆明細');
    XLSX.writeFile(workbook, `收益結算總表_${report.batch.as_of_date}_${report.batch.id.slice(-6)}.xlsx`);
  }

  function exportBatchCsv(report) {
    const rows = [['顧客','投資筆數','本金合計','本金加權利率(%)','本次淨收益','有效報酬率(%)'], ...report.customers.map(row => [row.investor_name,row.entry_count,row.principal_total,row.weighted_interest_rate,row.profit_total,row.principal_total ? row.profit_total / row.principal_total * 100 : 0])];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    downloadBlob(csv, `收益結算總表_${report.batch.as_of_date}.csv`, 'text/csv;charset=utf-8');
  }

  function downloadTemplate() {
    if (!window.XLSX) { toast('Excel 元件未載入，請重新啟動本機系統。', 'error'); return; }
    const rows = [{
      投資人名: '王小明', 投資案名: '設備租賃 A', 投資金額: 500000, 開始時間: todayLocal(), 持續時間: '6個月', '投資利率(%)': 5, 投資淨收益: 25000, 備註: '範例資料，匯入前請刪除或修改'
    }];
    const sheet = XLSX.utils.json_to_sheet(rows, { header: ['投資人名','投資案名','投資金額','開始時間','持續時間','投資利率(%)','投資淨收益','備註'] });
    sheet['!cols'] = [{wch:16},{wch:22},{wch:14},{wch:14},{wch:12},{wch:16},{wch:16},{wch:34}];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, '投資資料');
    XLSX.writeFile(workbook, '投資資料匯入範本.xlsx');
  }

  function normalizeHeader(value) {
    return String(value || '').trim().toLocaleLowerCase('zh-TW').replace(/[\s_（）()％%]/g, '');
  }

  const headerAliases = {
    investor_name: ['投資人名','投資人','顧客名稱','客戶名稱','investor','investorname'],
    project_name: ['投資案名','投資案','案名','專案名稱','project','projectname'],
    amount: ['投資金額','投入金額','本金','principal','amount'],
    start_date: ['開始時間','開始日期','起始日','投資日','startdate','start'],
    duration_value: ['持續時間','持續天數','持續月數','期間','duration','durationdays','durationmonths'],
    maturity_date: ['到期日','到期時間','結束日期','結束時間','maturitydate','enddate'],
    interest_rate: ['投資利率','利率','合約利率','interestrate','rate'],
    net_profit: ['投資淨收益','淨收益','淨獲利','投資獲利','netprofit','profit'],
    note: ['備註','說明','note','memo']
  };

  const normalizedAliases = Object.fromEntries(Object.entries(headerAliases).map(([key, values]) => [key, values.map(normalizeHeader)]));

  function columnMap(header) {
    const normalized = header.map(normalizeHeader);
    const result = {};
    for (const [field, aliases] of Object.entries(normalizedAliases)) {
      const index = normalized.findIndex(value => aliases.includes(value));
      if (index >= 0) result[field] = index;
    }
    return result;
  }

  function excelDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    if (typeof value === 'number' && window.XLSX) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const direct = String(value || '').trim().replace(/[/.]/g, '-');
    const match = direct.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return match ? Core.dateOnly(`${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`) : Core.dateOnly(direct);
  }

  function numeric(value) {
    if (typeof value === 'number') return value;
    const cleaned = String(value ?? '').trim().replace(/[,$，＄NTD元]/gi, '');
    return cleaned === '' ? NaN : Number(cleaned);
  }

  function parseDuration(value, headerText) {
    const text = String(value ?? '').trim();
    const match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*(個月|月|months?|天|日|days?)?$/i);
    if (!match) return { value: NaN, unit: 'month' };
    const header = normalizeHeader(headerText);
    const marker = String(match[2] || '');
    const unit = /天|日|day/i.test(marker) || /持續天數|durationdays/.test(header) ? 'day' : 'month';
    return { value: Number(match[1]), unit };
  }

  function parseRate(value, cell) {
    if (typeof value === 'string' && value.includes('%')) return numeric(value.replace('%',''));
    const parsed = numeric(value);
    return typeof value === 'number' && cell && /%/.test(String(cell.z || '')) ? parsed * 100 : parsed;
  }

  const mergeFillFields = new Set(['investor_name','project_name','start_date','maturity_date','duration_value','interest_rate']);

  function readImportValue(chosen, row, rowIndex, field) {
    const columnIndex = chosen.map[field];
    if (columnIndex == null) return { value: '', cell: null, merged: false };
    const cell = chosen.sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] || null;
    const direct = row[columnIndex];
    if (!Autofill.isMissing(direct) || !mergeFillFields.has(field)) return { value: direct, cell, merged: false };
    const merge = (chosen.sheet['!merges'] || []).find(range =>
      range.s.c === columnIndex && range.e.c === columnIndex && rowIndex >= range.s.r && rowIndex <= range.e.r
    );
    if (!merge) return { value: direct, cell, merged: false };
    const sourceCell = chosen.sheet[XLSX.utils.encode_cell(merge.s)] || null;
    if (!sourceCell || Autofill.isMissing(sourceCell.v)) return { value: direct, cell, merged: false };
    return { value: sourceCell.v, cell: sourceCell, merged: true };
  }

  function importAutofillValue(item) {
    if (item.field === 'start_date' || item.field === 'maturity_date') return displayDate(item.value);
    if (item.field === 'amount') return money(item.value);
    if (item.field === 'duration_value') return `${number(item.value)} ${item.duration_unit === 'day' ? '天' : '個月'}`;
    if (item.field === 'interest_rate') return pct(item.value);
    if (item.field === 'net_profit') return money(item.value);
    return String(item.value ?? '');
  }

  function renderImportCell(row, field, displayValue) {
    const fill = (row._autofills || []).find(item => item.field === field);
    const badges = {
      amount_scale: '已換算',
      batch_default: '套用本批預設',
      note: '備註辨識候選',
      formula: '估算值',
      manual_override: '手動補齊',
      merged_cell: '合併格展開',
      carry: '沿用明確值',
      date_range: '日期推算'
    };
    const badge = fill ? badges[fill.method] || '已補齊' : '';
    return `<td${fill ? ' class="is-autofilled"' : ''}>${displayValue}${fill ? `<span class="autofill-badge">${esc(badge)}</span><small class="autofill-reason">${esc(fill.reason)}</small>` : ''}</td>`;
  }

  function announceImport(message) {
    const region = $('#importAnnouncement');
    if (region) region.textContent = message;
  }

  async function sha256Hex(buffer) {
    if (!ImportIdentity) throw new Error('匯入來源識別元件未載入，請重新整理後再試。');
    try { return await ImportIdentity.fingerprintArrayBuffer(buffer); }
    catch (_) { throw new Error('目前瀏覽器無法建立安全的匯入檔案指紋，請改用新版瀏覽器或本機模式。'); }
  }

  function importConflictMessage(status) {
    if (status?.reason === 'ambiguous_local_file') {
      return '同名本機檔案的來源位置曾匯入，但檔案內容已重存或變更。若是同一份檔案請勿重匯；若是另一份同名檔，請先改名再匯入。';
    }
    if (status?.reason === 'legacy_record_match') {
      return '系統內已有相同內容、但沒有 Excel 來源識別的舊資料；請先核對該筆是否已匯入，系統不會自動略過或新增。';
    }
    return '此來源曾匯入，但本次換算內容不同；請核對金額單位、期間、利率及日期。';
  }

  function legacyProfileResult(file, candidate) {
    const inspection = candidate.inspection;
    return {
      filename: file.name,
      sheetName: candidate.sheetName,
      format: 'legacy_matrix',
      needsProfile: true,
      valid: [],
      errors: [],
      duplicates: [],
      autofills: [],
      warnings: [],
      legacy: {
        sourceRowCount: inspection.sourceRowCount,
        investmentCount: inspection.investmentCount,
        investorColumnCount: inspection.investorColumnCount,
        usedInvestorColumnCount: inspection.usedInvestorColumnCount,
        missingStartRows: inspection.missingStartRows,
        missingDurationCount: inspection.missingDurationRows.length,
        missingRateCount: inspection.missingRateRows.length,
        durationCandidateCount: Math.max(0, inspection.sourceRowCount - inspection.missingDurationRows.length),
        rateCandidateCount: Math.max(0, inspection.sourceRowCount - inspection.missingRateRows.length),
        mismatches: inspection.mismatches,
        invalidAllocationCount: inspection.invalidAllocations.length,
        unallocatedCount: inspection.unallocatedRows.length,
        orphanAllocationColumnCount: inspection.orphanAllocationColumns.length,
        duplicateHeaderCount: inspection.duplicateHeaders.length
      }
    };
  }

  function parseLegacyCandidate(file, candidate, options, fileFingerprint) {
    if (!options) return legacyProfileResult(file, candidate);
    const converted = LegacyMatrix.convert(candidate.inspection, options);
    const valid = [], duplicates = [], autofills = [];
    const errors = [...converted.errors];
    const warnings = [...converted.warnings];
    const seen = new Set();

    for (const record of converted.records) {
      const rawInput = {
        investor_name: record.investor_name,
        project_name: record.project_name,
        amount: record.amount,
        start_date: excelDate(record.start_raw),
        duration_value: record.duration_value,
        duration_unit: record.duration_unit,
        maturity_date: '',
        interest_rate: record.interest_rate,
        net_profit: record.net_profit,
        note: record.note
      };
      const completed = Autofill.autofillRow(rawInput, { carry: Autofill.emptyCarry() });
      const input = completed.value;
      const rowAutofills = [...record.autofills, ...completed.autofills].map(item => ({
        ...item,
        label: Autofill.LABELS[item.field] || item.field,
        row: record.source_row,
        source_ref: record.source_ref,
        duration_unit: item.duration_unit || input.duration_unit
      }));
      autofills.push(...rowAutofills);
      const checked = Core.validateInvestment(input);
      if (checked.errors.length) {
        errors.push({ row: record.source_row, source_ref: record.source_ref, message: checked.errors.join('、') });
        continue;
      }
      const normalizedInput = checked.value;
      const importSource = {
        file_sha256: fileFingerprint,
        filename: file.name,
        provider: file._import_provider || 'local_file',
        document_id: file._import_document_id || '',
        sheet_name: candidate.sheetName,
        source_ref: record.source_ref,
        source_row: record.source_row,
        source_column: record.source_column
      };
      const sourceKey = `${candidate.sheetName}|${record.source_ref}`;
      if (seen.has(sourceKey)) {
        errors.push({ row: record.source_row, source_ref: record.source_ref, message: '同一來源儲存格重複產生多筆資料，已阻擋整批匯入。' });
        continue;
      }
      seen.add(sourceKey);
      const importStatus = DB.importStatus(normalizedInput, importSource);
      if (importStatus.status === 'conflict') {
        errors.push({ row: record.source_row, source_ref: record.source_ref, message: importConflictMessage(importStatus) });
        continue;
      }
      if (importStatus.status === 'duplicate') {
        duplicates.push({ row: record.source_row, source_ref: record.source_ref, input: normalizedInput });
        continue;
      }
      valid.push({ ...normalizedInput, source_row: record.source_row, source_column: record.source_column, source_ref: record.source_ref, _import_source: importSource, _autofills: rowAutofills });
    }
    return {
      filename: file.name,
      sheetName: candidate.sheetName,
      format: 'legacy_matrix',
      needsProfile: false,
      valid,
      errors,
      duplicates,
      autofills,
      warnings,
      legacy: { ...legacyProfileResult(file, candidate).legacy, amountScale: Number(options.amount_scale), useNoteTerms: options.use_note_terms === true }
    };
  }

  async function parseWorkbook(file, legacyOptions) {
    if (!window.XLSX) throw new Error('Excel 元件未載入，請確認 assets/vendor/xlsx.full.min.js 存在。');
    if (!Autofill) throw new Error('自動補齊元件未載入，請重新整理後再試。');
    if (!ExcelGuard) throw new Error('Excel 安全檢查元件未載入，請重新整理後再試。');
    const workbookBuffer = await file.arrayBuffer();
    const fileFingerprint = await sha256Hex(workbookBuffer);
    const workbook = XLSX.read(workbookBuffer, { cellDates: true, cellNF: true });
    let chosen = null;
    let legacyChosen = null;
    const standardCandidates = [];
    const legacyCandidates = [];
    const recognized = Object.keys(headerAliases);
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      let sheetChosen = null;
      if (LegacyMatrix) {
        const inspection = LegacyMatrix.inspect(rows, sheet['!merges'] || []);
        if (inspection) {
          const formulaIssues = ExcelGuard.scanLegacyFormulaCache(sheet, inspection.layout);
          if (inspection.sourceRowCount || formulaIssues.length) legacyCandidates.push({ sheetName, sheet, rows, inspection, formulaIssues });
        }
      }
      for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex++) {
        const map = columnMap(rows[rowIndex]);
        const score = recognized.filter(field => map[field] != null).length;
        const candidate = { sheetName, sheet, rows, headerIndex: rowIndex, map, score };
        if (!sheetChosen || score > sheetChosen.score) sheetChosen = candidate;
        if (!chosen || score > chosen.score) chosen = candidate;
      }
      if (sheetChosen && !Autofill.headerIssues(sheetChosen.map).length) standardCandidates.push(sheetChosen);
    }
    const importCandidates = [
      ...standardCandidates.map(candidate => `標準格式「${candidate.sheetName}」`),
      ...legacyCandidates.map(candidate => `案件分配表「${candidate.sheetName}」`)
    ];
    if (importCandidates.length > 1) {
      throw new Error(`偵測到多個可匯入工作表：${importCandidates.join('、')}。為避免漏匯或重複，請將要匯入的工作表另存成單一活頁簿後再試。`);
    }
    if (standardCandidates.length === 1) chosen = standardCandidates[0];
    if (legacyCandidates.length === 1) legacyChosen = legacyCandidates[0];
    if (legacyChosen?.formulaIssues.length) {
      const locations = legacyChosen.formulaIssues.slice(0, 8).map(item => item.address).join('、');
      const extra = legacyChosen.formulaIssues.length > 8 ? `等 ${legacyChosen.formulaIssues.length} 格` : '';
      throw new Error(`工作表「${legacyChosen.sheetName}」的 ${locations}${extra} 含公式但沒有可讀取的計算結果。請先用 Excel 或 Google 試算表開啟、重新計算並儲存後再匯入。`);
    }
    if (!chosen) throw new Error('Excel 沒有可讀取的工作表。');
    const headerIssues = Autofill.headerIssues(chosen.map);
    if (headerIssues.length && legacyChosen) return parseLegacyCandidate(file, legacyChosen, legacyOptions, fileFingerprint);
    if (headerIssues.length) throw new Error(`缺少無法自動推斷的欄位：${headerIssues.join('、')}。請下載範本確認格式。`);

    const valid = [], errors = [], duplicates = [], autofills = [];
    const seen = new Set();
    const header = chosen.rows[chosen.headerIndex];
    let carry = Autofill.emptyCarry();
    for (let index = chosen.headerIndex + 1; index < chosen.rows.length; index++) {
      const row = chosen.rows[index];
      if (!row.some(value => !Autofill.isMissing(value))) { carry = Autofill.emptyCarry(); continue; }
      const cells = Object.fromEntries(recognized.map(field => [field, readImportValue(chosen, row, index, field)]));
      const duration = parseDuration(cells.duration_value.value, chosen.map.duration_value == null ? '' : header[chosen.map.duration_value]);
      const rawInput = {
        investor_name: String(cells.investor_name.value || '').trim(),
        project_name: String(cells.project_name.value || '').trim(),
        amount: numeric(cells.amount.value),
        start_date: excelDate(cells.start_date.value),
        duration_value: duration.value,
        duration_unit: duration.unit,
        maturity_date: excelDate(cells.maturity_date.value),
        interest_rate: parseRate(cells.interest_rate.value, cells.interest_rate.cell),
        net_profit: numeric(cells.net_profit.value),
        note: chosen.map.note == null ? '' : String(cells.note.value || '').trim()
      };
      const completed = Autofill.autofillRow(rawInput, { carry });
      carry = completed.carry;
      const input = completed.value;
      const mergedFills = recognized.filter(field => cells[field].merged).map(field => ({
        field,
        label: Autofill.LABELS[field] || field,
        value: input[field],
        method: 'merged_cell',
        reason: '展開 Excel 合併儲存格',
        estimated: false
      }));
      const sourceRef = `ROW${index + 1}`;
      const rowAutofills = [...mergedFills, ...completed.autofills].map(item => ({ ...item, row: index + 1, source_ref: sourceRef, duration_unit: input.duration_unit }));
      autofills.push(...rowAutofills);
      if (!Autofill.isMissing(input.maturity_date) && !Autofill.isMissing(input.duration_value)) {
        const computedMaturity = Core.addDuration(input.start_date, input.duration_value, input.duration_unit);
        if (computedMaturity && computedMaturity !== input.maturity_date) {
          errors.push({ row: index + 1, message: `到期日 ${input.maturity_date} 與開始日加持續時間所得 ${computedMaturity} 不一致。` });
          continue;
        }
      }
      const checked = Core.validateInvestment(input);
      if (checked.errors.length) {
        errors.push({ row: index + 1, message: checked.errors.join('、') });
        continue;
      }
      const normalizedInput = checked.value;
      const importSource = {
        file_sha256: fileFingerprint,
        filename: file.name,
        provider: file._import_provider || 'local_file',
        document_id: file._import_document_id || '',
        sheet_name: chosen.sheetName,
        source_ref: sourceRef,
        source_row: index + 1,
        source_column: ''
      };
      const sourceKey = `${chosen.sheetName}|${sourceRef}`;
      if (seen.has(sourceKey)) {
        errors.push({ row: index + 1, message: '同一來源列重複產生資料，已阻擋整批匯入。' });
        continue;
      }
      seen.add(sourceKey);
      const importStatus = DB.importStatus(normalizedInput, importSource);
      if (importStatus.status === 'conflict') {
        errors.push({ row: index + 1, message: importConflictMessage(importStatus) });
        continue;
      }
      if (importStatus.status === 'duplicate') {
        duplicates.push({ row: index + 1, source_ref: sourceRef, input: normalizedInput });
        continue;
      }
      valid.push({ ...normalizedInput, source_row: index + 1, source_ref: sourceRef, _import_source: importSource, _autofills: rowAutofills });
    }
    return { filename: file.name, sheetName: chosen.sheetName, format: 'standard', valid, errors, duplicates, autofills, warnings: [] };
  }

  function renderLegacyProfile(result) {
    parsedImport = null;
    const legacy = result.legacy;
    const defaults = legacyProfileOptions || {};
    const mismatchRows = legacy.mismatches.map(item => item.row).join('、');
    const unresolved = legacy.invalidAllocationCount + legacy.unallocatedCount + legacy.orphanAllocationColumnCount + legacy.duplicateHeaderCount;
    const selectedScale = value => Number(defaults.amount_scale) === value ? 'selected' : '';
    const selectedUnit = value => (defaults.duration_unit || 'month') === value ? 'selected' : '';
    $('#importPreview').innerHTML = `
      <div id="legacyDetectedCard" class="legacy-detected" tabindex="-1">
        <div><span class="status-pill active">已辨識舊版案件分配表</span><h3>${legacy.sourceRowCount} 個來源列將展開為 ${legacy.investmentCount} 筆投資</h3><p>${esc(result.filename)}｜工作表「${esc(result.sheetName)}」<br>投資人取自橫向欄名，投資金額取各投資人分配格；旁邊的撥款彙總區已排除。</p></div>
        <dl><div><dt>投資人欄</dt><dd>${legacy.investorColumnCount}</dd></div><div><dt>有配置欄</dt><dd>${legacy.usedInvestorColumnCount}</dd></div><div><dt>來源列缺期間</dt><dd>${legacy.missingDurationCount}</dd></div><div><dt>來源列缺利率</dt><dd>${legacy.missingRateCount}</dd></div></dl>
      </div>
      ${unresolved ? `<div class="notice error" role="alert">原表另有 ${unresolved} 個投資人欄名或分配格問題，套用設定後會列出精確位置。</div>` : ''}
      <form id="legacyImportProfile" class="legacy-profile">
        <div class="legacy-profile-head"><div><h3>一次補齊轉換設定</h3><p>以下設定皆為必填。系統會套用到缺值並估算淨收益；備註中的期間或百分比只會列為候選，除非您在下方明確選擇採用。</p></div></div>
        <div class="form-grid legacy-profile-grid">
          <div class="field"><label for="legacyAmountScale">原表金額單位</label><select id="legacyAmountScale" required><option value="">請選擇</option><option value="1" ${selectedScale(1)}>原值／元（× 1）</option><option value="1000" ${selectedScale(1000)}>千元（× 1,000）</option><option value="10000" ${selectedScale(10000)}>萬元（× 10,000）</option></select></div>
          <div class="field"><label for="legacyDurationValue">缺值的預設持續時間</label><div class="input-pair"><input id="legacyDurationValue" class="input" type="number" min="1" step="1" value="${esc(defaults.duration_value ?? '')}" required><select id="legacyDurationUnit" aria-label="持續時間單位"><option value="month" ${selectedUnit('month')}>個月</option><option value="day" ${selectedUnit('day')}>天</option></select></div></div>
          <div class="field"><label for="legacyInterestRate">缺值的預設整期利率（%）</label><div class="input-suffix"><input id="legacyInterestRate" class="input" type="number" step="0.0001" value="${esc(defaults.interest_rate ?? '')}" required><span>%</span></div></div>
          ${legacy.missingStartRows.map(item => `<div class="field"><label for="legacyStart${item.row}">Excel 第 ${item.row} 列${item.issue === 'invalid' ? '日期格式無效' : '缺少開始日期'}</label><input id="legacyStart${item.row}" class="input" type="date" data-legacy-start-row="${item.row}" value="${esc(defaults.start_dates?.[item.row] ?? '')}" aria-describedby="legacyStartHelp${item.row}" required><small id="legacyStartHelp${item.row}">${esc(item.project_name)} 沒有可安全採用的日期，因此需由您指定。</small></div>`).join('')}
        </div>
        ${legacy.durationCandidateCount || legacy.rateCandidateCount ? `<label class="legacy-confirm note-candidate-confirm"><input id="legacyNoteTerms" type="checkbox" ${defaults.use_note_terms ? 'checked' : ''}><span>優先採用備註辨識候選（期間 ${legacy.durationCandidateCount} 列、利率 ${legacy.rateCandidateCount} 列）；未勾選時一律使用本批預設。候選仍會在預覽標示，請逐筆核對。</span></label>` : ''}
        <label class="legacy-confirm"><input id="legacyMappingAck" type="checkbox" ${defaults.accept_mapping ? 'checked' : ''} required><span>我確認 F:N 橫向欄名代表正式投資人名稱，B 欄「起租案名/同仁」可作為正式投資案名；若原表使用縮寫，請先回 Excel 補成要在歷史報表顯示的名稱。</span></label>
        ${legacy.mismatches.length ? `<section class="legacy-reconciliation" aria-labelledby="legacyReconciliationTitle"><h4 id="legacyReconciliationTitle">需確認的原表差異</h4><div class="legacy-reconciliation-scroll" tabindex="0" role="region" aria-label="參與總額差異明細"><table><thead><tr><th>Excel 列</th><th>原參與總額</th><th>投資人明細合計</th><th>差額（明細－總額）</th></tr></thead><tbody>${legacy.mismatches.map(item => `<tr><td>${item.row}</td><td>${number(item.stated_total)}</td><td>${number(item.allocation_total)}</td><td>${number(item.allocation_total - item.stated_total)}</td></tr>`).join('')}</tbody></table></div></section><label class="legacy-confirm"><input id="legacyMismatchAck" type="checkbox" ${defaults.accept_mismatches ? 'checked' : ''} required><span>我確認第 ${mismatchRows} 列以各投資人分配格為匯入依據，不自動攤平差額。</span></label>` : ''}
        <div class="notice warn">請核對來源日期與預設期間；已屆滿的資料匯入後會出現在「到期未結算」清單，但仍需另按一鍵結算才會建立收益報表。</div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">套用設定並產生 ${legacy.investmentCount} 筆預覽</button></div>
      </form>`;
    announceImport(`已辨識案件分配表，${legacy.sourceRowCount} 個來源列可展開為 ${legacy.investmentCount} 筆投資，請完成轉換設定。`);
    requestAnimationFrame(() => $('#legacyDetectedCard')?.focus({ preventScroll: true }));
    $('#legacyImportProfile').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity() || !pendingImportFile) return;
      const startDates = {};
      $$('[data-legacy-start-row]').forEach(input => { startDates[input.dataset.legacyStartRow] = input.value; });
      const options = {
        amount_scale: Number($('#legacyAmountScale').value),
        duration_value: Number($('#legacyDurationValue').value),
        duration_unit: $('#legacyDurationUnit').value,
        interest_rate: $('#legacyInterestRate').value,
        use_note_terms: Boolean($('#legacyNoteTerms')?.checked),
        accept_mapping: $('#legacyMappingAck').checked,
        start_dates: startDates,
        accept_mismatches: !legacy.mismatches.length || $('#legacyMismatchAck').checked
      };
      legacyProfileOptions = options;
      announceImport('正在展開投資人欄、補齊資料並重新驗證。');
      $('#importPreview').innerHTML = '<div class="notice" role="status">正在展開投資人欄、補齊資料並重新驗證…</div>';
      try { renderImportPreview(await parseWorkbook(pendingImportFile, options)); }
      catch (error) {
        const message = error.message || 'Excel 轉換失敗。';
        announceImport(message);
        $('#importPreview').innerHTML = `<div class="notice error" role="alert">${esc(message)}</div>`;
      }
    });
  }

  function renderImportPreview(result) {
    if (result.needsProfile) { renderLegacyProfile(result); return; }
    parsedImport = result;
    const blocked = result.errors.length > 0 || result.valid.length === 0;
    const fills = result.autofills || [];
    const autofillRows = new Set(fills.map(item => item.source_ref || `row-${item.row}`)).size;
    const warnings = result.warnings || [];
    const isLegacy = result.format === 'legacy_matrix';
    const principalTotal = result.valid.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const profitTotal = result.valid.reduce((sum, row) => sum + Number(row.net_profit || 0), 0);
    const dueCount = result.valid.filter(row => Core.isMatured({ ...row, status: 'active' }, todayLocal())).length;
    const previewRows = isLegacy ? result.valid : result.valid.slice(0, 12);
    const visibleCount = previewRows.length;
    const noticeClass = result.errors.length ? 'error' : fills.length || warnings.length || dueCount ? 'warn' : '';
    const noticeText = result.errors.length
      ? '仍有無法補齊的資料，請先修正；系統不會部分匯入。'
      : warnings.length && fills.length
        ? `已自動補齊 ${autofillRows} 筆投資、${fills.length} 個欄位，另有 ${warnings.length} 個警告；請全部核對後再匯入。`
        : warnings.length
          ? `格式可匯入，但仍有 ${warnings.length} 個警告需要核對。`
          : fills.length
            ? `已自動補齊 ${autofillRows} 筆投資、${fills.length} 個欄位，請核對橘色標示後再匯入。`
            : '格式檢查通過，沒有需要補齊的欄位。';
    $('#importPreview').innerHTML = `<div class="import-summary"><div class="import-stat"><span>可匯入</span><strong>${result.valid.length}</strong></div><div class="import-stat"><span>自動補齊欄位</span><strong>${fills.length}</strong></div><div class="import-stat"><span>重複略過</span><strong>${result.duplicates.length}</strong></div><div class="import-stat"><span>仍需修正</span><strong>${result.errors.length}</strong></div></div>
      ${isLegacy ? `<div class="legacy-financial-summary"><div><span>轉換後本金合計</span><strong>${money(principalTotal)}</strong></div><div><span>估算淨收益合計</span><strong>${money(profitTotal)}</strong></div><div class="${dueCount ? 'is-due' : ''}"><span>匯入後已到期</span><strong>${dueCount} 筆</strong></div></div>` : ''}
      <div id="importResultNotice" class="notice ${noticeClass}" tabindex="-1">${esc(result.filename)}｜工作表「${esc(result.sheetName)}」${isLegacy ? '｜案件分配表已展開' : ''}：${noticeText}</div>
      ${dueCount && isLegacy ? `<div class="notice warn"><strong>${dueCount} 筆在今天以前已到期。</strong> 匯入不會自動結算；請先核對日期、期間與淨收益，再到一鍵結算頁操作。</div>` : ''}
      ${result.errors.length ? `<ul class="import-errors" tabindex="0" role="region" aria-label="匯入錯誤">${result.errors.map(error => `<li>${error.source_ref ? esc(error.source_ref) : `第 ${error.row} 列`}：${esc(error.message)}</li>`).join('')}</ul>` : ''}
      ${warnings.length ? `<ul class="import-warnings" tabindex="0" role="region" aria-label="匯入警告">${warnings.map(warning => `<li>第 ${warning.row} 列：${esc(warning.message)}</li>`).join('')}</ul>` : ''}
      ${result.valid.length ? `<p class="preview-count">${isLegacy ? `目前顯示全部 ${visibleCount} 筆轉換明細` : `目前顯示前 ${visibleCount} 筆，共 ${result.valid.length} 筆`}；補齊來源可在下方展開查看。</p><div class="import-preview-table" tabindex="0" role="region" aria-label="投資匯入預覽，可左右捲動"><table><thead><tr><th>Excel 位置</th><th>投資人</th><th>投資案</th><th>金額</th><th>開始</th><th>期間</th><th>到期</th><th>利率</th><th>淨收益</th><th>匯入後狀態</th></tr></thead><tbody>${previewRows.map(row => `<tr><td>${esc(row.source_ref || row.source_row)}</td>${renderImportCell(row,'investor_name',esc(row.investor_name))}${renderImportCell(row,'project_name',esc(row.project_name))}${renderImportCell(row,'amount',money(row.amount))}${renderImportCell(row,'start_date',displayDate(row.start_date))}${renderImportCell(row,'duration_value',durationLabel(row))}<td>${displayDate(row.maturity_date)}</td>${renderImportCell(row,'interest_rate',pct(row.interest_rate))}${renderImportCell(row,'net_profit',money(row.net_profit))}<td>${statusPill(investmentViewStatus(row))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${fills.length ? `<details class="import-autofill-details"><summary>查看全部 ${fills.length} 個自動補齊項目</summary><ul tabindex="0">${fills.map(item => `<li>${item.source_ref ? esc(item.source_ref) : `第 ${item.row} 列`}・${esc(item.label)}：${esc(importAutofillValue(item))}（${esc(item.reason)}）${item.estimated ? '－請核對候選或估算值' : ''}</li>`).join('')}</ul></details>` : ''}
      ${isLegacy && result.valid.length && !result.errors.length ? `<label class="legacy-confirm final-confirm"><input id="legacyFinalAck" type="checkbox" required><span>我已核對金額單位、預設期間、預設利率、${result.legacy?.useNoteTerms ? '已採用的備註辨識值' : '本批未採用備註候選'}、估算淨收益與 ${dueCount} 筆已到期狀態，確認以目前預覽匯入。</span></label>` : ''}
      <div class="form-actions">${isLegacy ? '<button id="modifyLegacySettings" class="btn btn-soft" type="button">修改轉換設定</button>' : ''}<button id="confirmImportBtn" class="btn btn-primary" type="button" ${blocked || isLegacy ? 'disabled' : ''}>${fills.length ? '確認補齊並' : '確認'}匯入 ${result.valid.length} 筆</button></div>`;
    if (isLegacy) {
      const acknowledgement = $('#legacyFinalAck');
      const confirmButton = $('#confirmImportBtn');
      acknowledgement?.addEventListener('change', () => { confirmButton.disabled = blocked || !acknowledgement.checked; });
      $('#modifyLegacySettings')?.addEventListener('click', async () => {
        announceImport('正在返回案件分配表轉換設定。');
        try { renderImportPreview(await parseWorkbook(pendingImportFile)); }
        catch (error) { toast(error.message || '無法重新載入轉換設定。', 'error'); }
      });
    }
    const announcement = result.errors.length
      ? `Excel 預覽仍有 ${result.errors.length} 個錯誤。`
      : `Excel 預覽完成，可匯入 ${result.valid.length} 筆，${warnings.length} 個警告，匯入後 ${dueCount} 筆已到期。`;
    announceImport(announcement);
    requestAnimationFrame(() => $('#importResultNotice')?.focus({ preventScroll: true }));
  }

  async function previewExcel(file) {
    if (!file) return;
    pendingImportFile = file;
    legacyProfileOptions = null;
    announceImport('正在解析與檢查 Excel。');
    $('#importPreview').innerHTML = '<div class="notice" role="status">正在解析與檢查 Excel…</div>';
    try { renderImportPreview(await parseWorkbook(file)); }
    catch (error) {
      parsedImport = null;
      const message = error.message || 'Excel 解析失敗。';
      announceImport(message);
      $('#importPreview').innerHTML = `<div class="notice error" role="alert">${esc(message)}</div>`;
    }
  }

  function driveConfigValidation(config) {
    if (!DriveImport) return { valid: false, errors: ['Google Drive 匯入模組未載入。'] };
    const result = DriveImport.validateConfig(config || {});
    if (result === true) return { valid: true, errors: [] };
    if (Array.isArray(result)) return { valid: result.length === 0, errors: result };
    return { valid: Boolean(result?.valid), errors: result?.errors || [] };
  }

  function driveValidationMessage(validation) {
    return (validation.errors || []).map(error => typeof error === 'string' ? error : error.message).filter(Boolean).join(' ');
  }

  function setDriveImportStatus(message, state = '') {
    const status = $('#driveImportStatus');
    status.className = `drive-status${state ? ` ${state}` : ''}`;
    status.textContent = message;
  }

  function setDriveConfigStatus(message, state = '') {
    const status = $('#driveConfigStatus');
    status.className = `drive-config-status${state ? ` ${state}` : ''}`;
    status.textContent = message;
  }

  function loadDriveConfigIntoForm() {
    if (!DriveImport) {
      setDriveConfigStatus('Google Drive 匯入模組未載入，請重新整理頁面。', 'error');
      setDriveImportStatus('Google Drive 匯入目前無法使用；仍可從電腦選取 Excel。', 'error');
      return;
    }
    try {
      const config = DriveImport.loadConfig();
      $('#driveClientId').value = config.client_id || '';
      $('#driveApiKey').value = config.api_key || '';
      $('#driveAppId').value = config.app_id || '';
      const validation = driveConfigValidation(config);
      if (validation.valid) {
        setDriveConfigStatus('連線設定已儲存在這個瀏覽器。登入權杖只會暫存在記憶體。', 'success');
        setDriveImportStatus('Google Drive 已完成設定；點擊按鈕登入並選取試算表。', 'success');
      } else {
        setDriveConfigStatus('尚未完成設定。三個欄位都必須填寫。');
        setDriveImportStatus('Google Drive 需先完成連線設定；從電腦匯入則不需要網路。');
      }
    } catch (error) {
      setDriveConfigStatus(error.message || '無法讀取 Google Drive 設定。', 'error');
      setDriveImportStatus('無法讀取 Google Drive 設定；仍可從電腦選取 Excel。', 'error');
    }
  }

  function openDriveSettings() {
    switchPanel('settings');
    $('#googleDriveSettings').scrollIntoView({ behavior: 'auto', block: 'start' });
    $('#driveClientId').focus({ preventScroll: true });
  }

  function saveDriveConfig(event) {
    event.preventDefault();
    if (!DriveImport) return setDriveConfigStatus('Google Drive 匯入模組未載入。', 'error');
    const config = {
      client_id: $('#driveClientId').value.trim(),
      api_key: $('#driveApiKey').value.trim(),
      app_id: $('#driveAppId').value.trim()
    };
    const validation = driveConfigValidation(config);
    if (!validation.valid) return setDriveConfigStatus(driveValidationMessage(validation) || '請完整填寫三個連線欄位。', 'error');
    try {
      DriveImport.saveConfig(config);
      loadDriveConfigIntoForm();
      toast('Google Drive 連線設定已儲存。');
      switchPanel('import', { focus: true });
    } catch (error) {
      setDriveConfigStatus(error.message || '無法儲存 Google Drive 設定。', 'error');
    }
  }

  function clearDriveConfig() {
    if (!DriveImport) return;
    try {
      DriveImport.clearConfig();
      loadDriveConfigIntoForm();
      toast('Google Drive 連線設定已清除。');
    } catch (error) { setDriveConfigStatus(error.message || '無法清除設定。', 'error'); }
  }

  async function importFromGoogleDrive() {
    if (!DriveImport) return setDriveImportStatus('Google Drive 匯入模組未載入，請重新整理頁面。', 'error');
    let config;
    try { config = DriveImport.loadConfig(); }
    catch (error) { return setDriveImportStatus(error.message || '無法讀取 Google Drive 設定。', 'error'); }
    const validation = driveConfigValidation(config);
    if (!validation.valid) {
      setDriveImportStatus('請先完成 Google Drive 連線設定。', 'error');
      openDriveSettings();
      return;
    }
    if (!navigator.onLine) return setDriveImportStatus('目前沒有網路連線；可改用下方的本機 Excel 匯入。', 'error');
    const button = $('#googleDriveImportBtn');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '正在連線…';
    setDriveImportStatus('正在取得 Google 授權並開啟雲端硬碟選檔器…', 'busy');
    try {
      const file = await DriveImport.pickFile(config);
      switchPanel('import', { updateUrl: true, focus: true });
      setDriveImportStatus(`已讀取「${file.name}」，正在進行 Excel 預覽與自動補齊。`, 'success');
      await previewExcel(file);
    } catch (error) {
      if (['AUTH_CANCELLED','PICKER_CANCELLED'].includes(error.code)) setDriveImportStatus('已取消 Google Drive 選檔，資料沒有變更。');
      else if (error.code === 'CONFIG_MISSING') { setDriveImportStatus('Google Drive 設定不完整，請重新設定。', 'error'); openDriveSettings(); }
      else setDriveImportStatus(error.message || '無法從 Google Drive 讀取檔案。', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function confirmImport() {
    if (!parsedImport || parsedImport.errors.length || !parsedImport.valid.length) return;
    if (parsedImport.format === 'legacy_matrix' && !$('#legacyFinalAck')?.checked) {
      toast('請先核對轉換摘要並勾選確認。', 'error');
      return;
    }
    const button = $('#confirmImportBtn');
    button.disabled = true;
    button.textContent = '匯入中…';
    try {
      const autofillFieldCount = parsedImport.autofills?.length || 0;
      const autofillRowCount = new Set((parsedImport.autofills || []).map(item => item.source_ref || `row-${item.row}`)).size;
      const result = await DB.importInvestments(parsedImport.valid);
      await refresh();
      $('#importPreview').innerHTML = `<div class="settlement-success"><h3>Excel 匯入完成</h3><p>已新增 ${result.imported.length} 筆；另有 ${result.duplicates.length + parsedImport.duplicates.length} 筆重複資料被安全略過。${autofillFieldCount ? `其中 ${autofillRowCount} 筆資料共自動補齊 ${autofillFieldCount} 個欄位。` : ''}</p><div class="toolbar"><button class="btn btn-success" type="button" data-open-panel="investments">查看投資資料</button></div></div>`;
      $('#xlsxInput').value = '';
      parsedImport = null;
      pendingImportFile = null;
      legacyProfileOptions = null;
      toast(`已匯入 ${result.imported.length} 筆投資資料。`);
    } catch (error) { toast(error.message || '匯入失敗。', 'error'); button.disabled = false; button.textContent = '確認匯入'; }
  }

  document.addEventListener('click', event => {
    const panelButton = event.target.closest('[data-open-panel]');
    if (panelButton) switchPanel(panelButton.dataset.openPanel, { focus: panelButton.id === 'heroImportBtn' });
    const editButton = event.target.closest('[data-edit]');
    if (editButton) openInvestmentModal(snapshot.investments.find(item => item.id === editButton.dataset.edit));
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) deleteInvestment(deleteButton.dataset.delete);
    const customerButton = event.target.closest('[data-customer]');
    if (customerButton) openCustomerDrawer(customerButton.dataset.customer);
    if (event.target.closest('[data-view-report]')) switchPanel('reports');
    if (event.target.closest('[data-export-current]')) exportBatchExcel();
    if (event.target.closest('#confirmImportBtn')) confirmImport();
  });

  $$('.nav-btn[data-panel]').forEach(button => button.addEventListener('click', () => switchPanel(button.dataset.panel, { focus: button.dataset.panel === 'import' })));
  window.addEventListener('hashchange', () => {
    if (appReady) switchPanel(panelFromLocation(), { updateUrl: false, focus: panelFromLocation() === 'import' });
  });
  $('#heroAddBtn').addEventListener('click', () => openInvestmentModal());
  $('#tableAddBtn').addEventListener('click', () => openInvestmentModal());
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', closeInvestmentModal));
  $('#investmentModal').addEventListener('click', event => { if (event.target === $('#investmentModal')) closeInvestmentModal(); });
  $('#investmentForm').addEventListener('submit', saveInvestment);
  ['investmentAmount','investmentStart','durationValue','durationUnit','interestRate','netProfit'].forEach(id => $(`#${id}`).addEventListener('input', updateFormCalculations));
  $('#investmentSearch').addEventListener('input', renderInvestments);
  $('#investmentStatusFilter').addEventListener('change', renderInvestments);
  $('#settlementAsOf').addEventListener('change', renderDuePreview);
  $('#runSettlementBtn').addEventListener('click', runSettlement);
  $('#overviewSettleBtn').addEventListener('click', () => switchPanel('settlement'));
  $('#batchSelect').addEventListener('change', event => { activeBatchId = event.target.value; renderReports(); });
  $('#exportBatchBtn').addEventListener('click', exportBatchExcel);
  $('#downloadTemplateBtn').addEventListener('click', downloadTemplate);
  $('#googleDriveImportBtn').addEventListener('click', importFromGoogleDrive);
  $('#openDriveSettingsBtn').addEventListener('click', openDriveSettings);
  $('#driveConfigForm').addEventListener('submit', saveDriveConfig);
  $('#clearDriveConfigBtn').addEventListener('click', clearDriveConfig);
  $('#quickBackupBtn').addEventListener('click', exportBackup);
  $('#exportBackupBtn').addEventListener('click', exportBackup);
  $('#restoreInput').addEventListener('change', event => restoreBackup(event.target.files?.[0]));
  $('#loadDemoBtn').addEventListener('click', async () => {
    if (snapshot.investments.length && !await confirmAction('載入示範資料', '載入示範資料會取代目前所有投資與結算歷史。', '確認載入')) return;
    try { await DB.loadDemo(); activeBatchId = null; await refresh(); toast('示範資料已載入。'); switchPanel('overview'); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#clearAllBtn').addEventListener('click', async () => {
    if (!await confirmAction('清空所有資料', '所有投資、顧客與結算歷史都會被刪除，且無法復原。建議先下載完整備份。', '確認清空')) return;
    try { await DB.clearAll(); activeBatchId = null; await refresh(); toast('所有資料已清空。'); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#closeCustomerDrawer').addEventListener('click', closeCustomerDrawer);
  $('#customerDrawer').addEventListener('click', event => { if (event.target === $('#customerDrawer')) closeCustomerDrawer(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if ($('#confirmModal').classList.contains('open')) $('#confirmCancelBtn').click();
    else { closeInvestmentModal(); closeCustomerDrawer(); }
  });

  const dropzone = $('#dropzone');
  ['dragenter','dragover'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', event => previewExcel(event.dataTransfer?.files?.[0]));
  $('#xlsxInput').addEventListener('change', event => previewExcel(event.target.files?.[0]));

  $('#settlementAsOf').value = todayLocal();
  loadDriveConfigIntoForm();
  try {
    await DB.init();
    snapshot = DB.snapshot();
    updateStorageStatus();
    renderAll();
    appReady = true;
    const initialPanel = panelFromLocation();
    switchPanel(initialPanel, { updateUrl: false, focus: initialPanel === 'import', scroll: initialPanel !== 'overview' });
    if (DB.backend === 'sqlite') clearNotice();
  } catch (error) {
    showNotice(error.message || '系統初始化失敗。', 'error');
  }
})();
