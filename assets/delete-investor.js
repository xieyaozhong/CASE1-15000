(() => {
  'use strict';

  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const RETURN_KEY = 'case1-per-case-returns-v1';
  const SORT_KEY = 'case1-excel-ledger-sort-v1';
  const SYSTEM_COLUMNS = new Set(['狀態','完成日','持續時間','備註']);
  const $ = s => document.querySelector(s);

  const num = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = Number(String(value ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(num(value));

  function readState(){
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return state && Array.isArray(state.headers) && Array.isArray(state.rows) ? state : null;
    } catch (_) { return null; }
  }

  function investorColumns(headers){
    const start = headers.indexOf('參與總額') + 1;
    if (start <= 0) return [];
    const end = headers.findIndex((h,i)=>i >= start && SYSTEM_COLUMNS.has(h));
    return headers.slice(start,end < 0 ? headers.length : end).filter(Boolean);
  }

  function investorStats(state,name){
    let cases = 0;
    let invested = 0;
    state.rows.forEach(row=>{
      const amount = num(row?.[name]);
      if (amount > 0) cases += 1;
      invested += amount;
    });
    return {cases,invested};
  }

  function cleanPerCaseReturns(investor){
    try {
      const store = JSON.parse(localStorage.getItem(RETURN_KEY));
      if (!store || typeof store !== 'object') return;
      const suffix = `|${investor}`;
      let changed = false;
      Object.keys(store).forEach(key=>{
        if (key.endsWith(suffix)) {
          delete store[key];
          changed = true;
        }
      });
      if (changed) localStorage.setItem(RETURN_KEY,JSON.stringify(store));
    } catch (_) {}
  }

  function cleanLegacyProfits(state,investor){
    if (!state.investorProfits || typeof state.investorProfits !== 'object') return;
    const suffix = `|${investor}`;
    Object.keys(state.investorProfits).forEach(key=>{
      if (key.endsWith(suffix)) delete state.investorProfits[key];
    });
  }

  function cleanSort(investor){
    try {
      const sort = JSON.parse(localStorage.getItem(SORT_KEY));
      if (sort?.header === investor) localStorage.removeItem(SORT_KEY);
    } catch (_) {}
  }

  function deleteInvestor(name){
    const state = readState();
    if (!state || !state.headers.includes(name)) return;
    const stats = investorStats(state,name);
    const detail = stats.cases
      ? `\n目前涉及 ${stats.cases} 筆案件，累計投入 ${money(stats.invested)}。`
      : '\n目前沒有投入紀錄。';
    const ok = confirm(`確定刪除投資人「${name}」？${detail}\n\n刪除後會同時移除主表中的這個欄位，以及此投資人的逐案收益設定。`);
    if (!ok) return;

    state.headers = state.headers.filter(h=>h !== name);
    state.rows.forEach(row=>{ if (row && typeof row === 'object') delete row[name]; });
    cleanLegacyProfits(state,name);
    cleanPerCaseReturns(name);
    cleanSort(name);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    location.reload();
  }

  function renderList(){
    const state = readState();
    const box = $('#investorManageList');
    if (!box) return;
    const investors = state ? investorColumns(state.headers) : [];

    if (!investors.length) {
      box.innerHTML = '<div class="investor-manage-empty">目前沒有投資人欄位</div>';
      return;
    }

    box.innerHTML = investors.map(name=>{
      const stats = investorStats(state,name);
      return `<div class="investor-manage-row">
        <div class="investor-manage-info">
          <strong>${esc(name)}</strong>
          <span>${stats.cases} 筆案件 · 投入 ${money(stats.invested)}</span>
        </div>
        <button class="investor-delete-btn" type="button" data-investor="${esc(name)}" aria-label="刪除投資人 ${esc(name)}">刪除</button>
      </div>`;
    }).join('');

    box.querySelectorAll('.investor-delete-btn').forEach(btn=>{
      btn.addEventListener('click',()=>deleteInvestor(btn.dataset.investor));
    });
  }

  function enhanceDialog(){
    const dialog = $('#investorDialog');
    const form = $('#investorForm');
    if (!dialog || !form || $('#investorManageSection')) return;

    const title = form.querySelector('h3');
    if (title) title.textContent = '投資人管理';

    const nameLabel = form.querySelector('label');
    if (nameLabel) {
      const hint = document.createElement('div');
      hint.className = 'investor-add-hint';
      hint.textContent = '新增投資人後會在主工作表建立一個新的投入金額欄位。';
      nameLabel.insertAdjacentElement('afterend',hint);
    }

    const section = document.createElement('section');
    section.id = 'investorManageSection';
    section.className = 'investor-manage-section';
    section.innerHTML = `<div class="investor-manage-head"><strong>現有投資人</strong><span>可直接刪除欄位</span></div><div id="investorManageList"></div>`;
    const actions = form.querySelector('.modal-actions');
    if (actions) actions.insertAdjacentElement('beforebegin',section);
    else form.appendChild(section);

    const openBtn = $('#addInvestorBtn');
    if (openBtn) openBtn.addEventListener('click',()=>requestAnimationFrame(renderList));
    renderList();
  }

  function injectStyle(){
    if ($('#investor-manage-style')) return;
    const style = document.createElement('style');
    style.id = 'investor-manage-style';
    style.textContent = `
      #investorForm{width:min(440px,calc(100vw - 28px));}
      .investor-add-hint{margin:-2px 0 12px;color:#64748b;font-size:11px;line-height:1.45;}
      .investor-manage-section{margin-top:12px;border-top:1px solid #e2e8f0;padding-top:12px;}
      .investor-manage-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;}
      .investor-manage-head strong{font-size:12px;color:#334155;}
      .investor-manage-head span{font-size:10px;color:#94a3b8;}
      #investorManageList{display:grid;gap:6px;max-height:250px;overflow:auto;padding-right:2px;}
      .investor-manage-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 9px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc;}
      .investor-manage-info{min-width:0;display:grid;gap:2px;}
      .investor-manage-info strong{font-size:12px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .investor-manage-info span{font-size:10px;color:#64748b;}
      .investor-delete-btn{flex:0 0 auto;border:1px solid #fecaca;background:#fff;color:#b42318;border-radius:7px;padding:5px 9px;font-size:11px;font-weight:700;cursor:pointer;}
      .investor-delete-btn:hover{background:#fff1f2;border-color:#fda4af;}
      .investor-manage-empty{padding:13px;text-align:center;border:1px dashed #cbd5e1;border-radius:9px;color:#64748b;font-size:11px;}
    `;
    document.head.appendChild(style);
  }

  injectStyle();
  enhanceDialog();
})();
