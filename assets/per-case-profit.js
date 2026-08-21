(() => {
  'use strict';

  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const RETURN_KEY = 'case1-per-case-returns-v1';
  const DEFAULT_RATE = 6;
  const SYSTEM_COLUMNS = new Set(['狀態','完成日','持續時間','備註']);
  const $ = s => document.querySelector(s);
  let currentGroups = [];
  let currentRange = { start:'', end:'' };

  const clean = v => String(v ?? '').trim();
  const num = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = Number(String(v ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const money = v => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(num(v));
  const compactNumber = v => {
    const n = num(v);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function readState(){
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows) ? parsed : null;
    } catch (_) { return null; }
  }

  function readReturns(){
    try {
      const parsed = JSON.parse(localStorage.getItem(RETURN_KEY));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function saveReturns(data){
    localStorage.setItem(RETURN_KEY, JSON.stringify(data));
    const state = $('#saveState');
    if (state) state.textContent = '已自動儲存';
  }

  function investorColumns(headers){
    const start = headers.indexOf('參與總額') + 1;
    if (start <= 0) return [];
    const end = headers.findIndex((h,i)=>i>=start && SYSTEM_COLUMNS.has(h));
    return headers.slice(start,end < 0 ? headers.length : end).filter(Boolean);
  }

  function baseCaseKey(row){
    return [
      clean(row['日期']),
      clean(row['起租案名/同仁']),
      clean(row['案源']),
      clean(row['案件金額']),
      clean(row['完成日']),
      clean(row['備註'])
    ].join('|');
  }

  function getSetting(store,key,invested){
    const raw = store[key];
    if (!raw || typeof raw !== 'object') {
      return { basis:'rate', rate:DEFAULT_RATE, amount:invested * DEFAULT_RATE / 100 };
    }
    if (raw.basis === 'amount') {
      const amount = Math.max(0,num(raw.amount));
      return { basis:'amount', amount, rate:invested > 0 ? amount / invested * 100 : 0 };
    }
    const rate = Math.max(0,num(raw.rate ?? DEFAULT_RATE));
    return { basis:'rate', rate, amount:invested * rate / 100 };
  }

  function buildGroups(){
    const state = readState();
    if (!state) return [];
    const start = $('#rangeStart')?.value || '';
    const end = $('#rangeEnd')?.value || '';
    currentRange = {start,end};
    if (!start || !end || end < start) return [];

    const investors = investorColumns(state.headers);
    const groups = new Map();
    const duplicateCount = new Map();

    state.rows.forEach(row=>{
      const completed = clean(row['完成日']);
      if (!completed || completed < start || completed > end) return;

      const base = baseCaseKey(row);
      const occurrence = (duplicateCount.get(base) || 0) + 1;
      duplicateCount.set(base,occurrence);
      const caseKey = `${base}#${occurrence}`;

      investors.forEach(investor=>{
        const invested = num(row[investor]);
        if (invested <= 0) return;
        const item = {
          key:`${caseKey}|${investor}`,
          investor,
          project:clean(row['起租案名/同仁']) || '未命名投資案',
          source:clean(row['案源']),
          completed,
          duration:row['持續時間'],
          caseAmount:num(row['案件金額']),
          invested
        };
        if (!groups.has(investor)) groups.set(investor,[]);
        groups.get(investor).push(item);
      });
    });

    return [...groups.entries()].map(([investor,items])=>({investor,items}));
  }

  function groupTotals(group,store){
    return group.items.reduce((acc,item)=>{
      const setting = getSetting(store,item.key,item.invested);
      acc.invested += item.invested;
      acc.profit += setting.amount;
      return acc;
    },{invested:0,profit:0});
  }

  function render(){
    const box = $('#investorGroups');
    if (!box) return;
    const groups = buildGroups();
    currentGroups = groups;
    const store = readReturns();

    const rangeText = $('#settlementRangeText');
    if (rangeText && currentRange.start && currentRange.end) {
      const cases = new Set(groups.flatMap(g=>g.items.map(x=>x.key.split('|').slice(0,-1).join('|')))).size;
      rangeText.textContent = `${currentRange.start} ～ ${currentRange.end}｜逐案收益預設 6%，可直接修改百分比或金額`;
    }

    if (!groups.length) {
      box.innerHTML = '<div class="empty-result">這個區間內沒有已設定完成日的投資案。</div>';
      const exportBtn = $('#exportSettlementBtn');
      if (exportBtn) exportBtn.disabled = true;
      return;
    }

    box.innerHTML = groups.map(group=>{
      const totals = groupTotals(group,store);
      return `<article class="investor-group per-case-profit-group" data-investor="${esc(group.investor)}">
        <div class="investor-group-head investor-summary-head per-case-summary">
          <div class="investor-name-block"><span>投資人</span><strong>${esc(group.investor)}</strong></div>
          <div class="investor-metric">完成案數<b>${group.items.length}</b></div>
          <div class="investor-metric">投入合計<b>${money(totals.invested)}</b></div>
          <div class="investor-metric group-profit-total">收益合計<b>+${money(totals.profit)}</b></div>
        </div>
        <div class="investor-projects">
          <table class="result-table per-case-profit-table">
            <thead><tr><th>完成日</th><th>持續時間</th><th>投資案</th><th>案源</th><th class="num">投入金額</th><th class="num">收益率</th><th class="num">收益金額</th></tr></thead>
            <tbody>${group.items.map(item=>{
              const s = getSetting(store,item.key,item.invested);
              return `<tr data-profit-key="${esc(item.key)}" data-invested="${item.invested}">
                <td>${esc(item.completed)}</td>
                <td>${item.duration === '' || item.duration == null ? '—' : `${esc(item.duration)} 天`}</td>
                <td><strong>${esc(item.project)}</strong></td>
                <td>${esc(item.source || '—')}</td>
                <td class="num invested-value">${money(item.invested)}</td>
                <td class="num"><div class="inline-profit-control"><input class="case-rate-input" type="number" min="0" step="0.01" value="${esc(compactNumber(s.rate))}" aria-label="${esc(group.investor)} ${esc(item.project)} 收益率"><span>%</span></div></td>
                <td class="num"><div class="inline-profit-control amount-control"><span>+</span><input class="case-amount-input" type="number" min="0" step="0.01" value="${esc(compactNumber(s.amount))}" aria-label="${esc(group.investor)} ${esc(item.project)} 收益金額"></div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </article>`;
    }).join('');

    bindInputs();
    const exportBtn = $('#exportSettlementBtn');
    if (exportBtn) exportBtn.disabled = false;
  }

  function updateGroupTotal(input){
    const groupEl = input.closest('.per-case-profit-group');
    if (!groupEl) return;
    const total = [...groupEl.querySelectorAll('.case-amount-input')].reduce((sum,el)=>sum+num(el.value),0);
    const b = groupEl.querySelector('.group-profit-total b');
    if (b) b.textContent = `+${money(total)}`;
  }

  function bindInputs(){
    const store = readReturns();
    document.querySelectorAll('.per-case-profit-table tbody tr').forEach(tr=>{
      const key = tr.dataset.profitKey;
      const invested = num(tr.dataset.invested);
      const rateInput = tr.querySelector('.case-rate-input');
      const amountInput = tr.querySelector('.case-amount-input');

      rateInput?.addEventListener('input',()=>{
        const rate = Math.max(0,num(rateInput.value));
        const amount = invested * rate / 100;
        amountInput.value = compactNumber(amount);
        store[key] = {basis:'rate',rate,amount};
        saveReturns(store);
        updateGroupTotal(rateInput);
      });

      amountInput?.addEventListener('input',()=>{
        const amount = Math.max(0,num(amountInput.value));
        const rate = invested > 0 ? amount / invested * 100 : 0;
        rateInput.value = compactNumber(rate);
        store[key] = {basis:'amount',amount,rate};
        saveReturns(store);
        updateGroupTotal(amountInput);
      });
    });
  }

  function exportCustom(e){
    if (!window.XLSX) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!currentGroups.length) render();
    if (!currentGroups.length) return;

    const store = readReturns();
    const summary = [['投資人','完成案數','投入金額合計','收益合計']];
    const detail = [['投資人','完成日','持續時間(天)','投資案','案源','案件金額','投入金額','收益率(%)','收益金額']];

    currentGroups.forEach(group=>{
      const totals = groupTotals(group,store);
      summary.push([group.investor,group.items.length,totals.invested,totals.profit]);
      group.items.forEach(item=>{
        const s = getSetting(store,item.key,item.invested);
        detail.push([group.investor,item.completed,item.duration,item.project,item.source,item.caseAmount,item.invested,s.rate,s.amount]);
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'投資人收益');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),'逐案收益明細');
    XLSX.writeFile(wb,`區間結算_${currentRange.start}_${currentRange.end}.xlsx`);
  }

  function injectStyle(){
    if (document.getElementById('per-case-profit-style')) return;
    const style = document.createElement('style');
    style.id = 'per-case-profit-style';
    style.textContent = `
      .per-case-summary{grid-template-columns:minmax(150px,1.25fr) minmax(90px,.55fr) minmax(120px,.75fr) minmax(140px,.85fr)!important;}
      .group-profit-total b{color:#0f7b55!important;}
      .inline-profit-control{display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;min-width:108px;height:31px;border:1px solid #cbd4e1;border-radius:7px;background:#fff;padding:0 7px;color:#64748b;}
      .inline-profit-control:focus-within{border-color:#6b9df5;box-shadow:0 0 0 2px rgba(11,87,208,.08);}
      .inline-profit-control input{width:72px;border:0;outline:0;background:transparent;text-align:right;font:inherit;color:#1f2937;padding:0;}
      .amount-control{border-color:#b9d7ca;background:#f6fcf9;color:#0f7b55;}
      .amount-control input{color:#0f7b55;font-weight:700;}
      .per-case-profit-table th:nth-last-child(-n+3){min-width:112px;}
      @media(max-width:900px){.per-case-summary{grid-template-columns:1fr 1fr!important;}.per-case-summary .investor-name-block{grid-column:1/-1;}}
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    const settle = $('#settleBtn');
    if (settle) settle.addEventListener('click',()=>queueMicrotask(render));
    const exportBtn = $('#exportSettlementBtn');
    if (exportBtn) exportBtn.addEventListener('click',exportCustom,true);
  }

  init();
})();
