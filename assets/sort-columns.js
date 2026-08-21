(() => {
  'use strict';

  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const SORT_KEY = 'case1-excel-ledger-sort-v1';
  const $ = s => document.querySelector(s);
  const collator = new Intl.Collator('zh-Hant-TW', { numeric: true, sensitivity: 'base' });
  const DATE_COLUMNS = new Set(['日期','完成日']);
  const NUMERIC_COLUMNS = new Set(['案件金額','參與總額','持續時間']);
  const SYSTEM_COLUMNS = new Set(['狀態','完成日','持續時間','備註']);

  function readState(){
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return state && Array.isArray(state.headers) && Array.isArray(state.rows) ? state : null;
    } catch (_) { return null; }
  }

  function readSort(){
    try {
      const s = JSON.parse(localStorage.getItem(SORT_KEY));
      return s && typeof s.header === 'string' && (s.direction === 'asc' || s.direction === 'desc') ? s : null;
    } catch (_) { return null; }
  }

  function investorColumns(headers){
    const start = headers.indexOf('參與總額') + 1;
    if (start <= 0) return [];
    const end = headers.findIndex((h,i)=>i >= start && SYSTEM_COLUMNS.has(h));
    return headers.slice(start,end < 0 ? headers.length : end).filter(Boolean);
  }

  function isEmpty(value){
    return value === '' || value == null || (typeof value === 'string' && value.trim() === '');
  }

  function numberValue(value){
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = Number(String(value ?? '').replace(/,/g,'').replace(/\s*天\s*$/,'').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function dateValue(value){
    const s = String(value ?? '').trim();
    if (!s) return 0;
    const t = Date.parse(s.length === 10 ? `${s}T00:00:00` : s);
    return Number.isFinite(t) ? t : 0;
  }

  function compareValues(a,b,header,numericSet){
    const av = a?.[header];
    const bv = b?.[header];
    const ae = isEmpty(av), be = isEmpty(bv);
    if (ae && be) return 0;
    if (ae) return 1;
    if (be) return -1;
    if (DATE_COLUMNS.has(header)) return dateValue(av) - dateValue(bv);
    if (numericSet.has(header)) return numberValue(av) - numberValue(bv);
    return collator.compare(String(av),String(bv));
  }

  function sortBy(header,direction){
    const state = readState();
    if (!state || !state.headers.includes(header)) return;
    const numericSet = new Set([...NUMERIC_COLUMNS,...investorColumns(state.headers)]);
    const indexed = state.rows.map((row,index)=>({row,index}));
    indexed.sort((x,y)=>{
      const base = compareValues(x.row,y.row,header,numericSet);
      if (base === 0) return x.index - y.index;
      return direction === 'desc' ? -base : base;
    });

    // 空白資料固定放最後，不受升降冪方向影響。
    const filled = indexed.filter(x=>!isEmpty(x.row?.[header]));
    const empty = indexed.filter(x=>isEmpty(x.row?.[header]));
    state.rows = [...filled,...empty].map(x=>x.row);

    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    localStorage.setItem(SORT_KEY,JSON.stringify({header,direction}));
    location.reload();
  }

  function decorateHeaders(){
    const table = $('#sheetGrid');
    const state = readState();
    if (!table || !state) return;
    const active = readSort();
    table.querySelectorAll('thead th[data-col]').forEach(th=>{
      const col = Number(th.dataset.col);
      const header = state.headers[col];
      if (!header) return;
      th.classList.add('sortable-header');
      th.dataset.sortHeader = header;
      th.title = `點擊依「${header}」排序`;
      th.setAttribute('role','columnheader');
      const isActive = active?.header === header;
      th.setAttribute('aria-sort', isActive ? (active.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      let icon = th.querySelector('.sort-indicator');
      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'sort-indicator';
        th.appendChild(icon);
      }
      icon.textContent = isActive ? (active.direction === 'asc' ? '▲' : '▼') : '↕';
    });
  }

  function bind(){
    const table = $('#sheetGrid');
    if (!table) return;
    table.addEventListener('click',e=>{
      const th = e.target.closest('thead th[data-col]');
      if (!th || !table.contains(th)) return;
      const state = readState();
      if (!state) return;
      const header = state.headers[Number(th.dataset.col)];
      if (!header) return;
      const current = readSort();
      const direction = current?.header === header && current.direction === 'asc' ? 'desc' : 'asc';
      sortBy(header,direction);
    });

    const observer = new MutationObserver(()=>decorateHeaders());
    observer.observe(table,{childList:true,subtree:true});
    decorateHeaders();
  }

  function injectStyle(){
    if ($('#sortable-columns-style')) return;
    const style = document.createElement('style');
    style.id = 'sortable-columns-style';
    style.textContent = `
      .sheet-grid thead th.sortable-header{cursor:pointer;user-select:none;transition:background .15s ease,color .15s ease;}
      .sheet-grid thead th.sortable-header:hover{filter:brightness(.97);color:#0b57d0;}
      .sort-indicator{display:inline-block;margin-left:6px;font-size:9px;line-height:1;color:#8a99ad;vertical-align:1px;}
      .sheet-grid thead th[aria-sort="ascending"] .sort-indicator,.sheet-grid thead th[aria-sort="descending"] .sort-indicator{color:#0b57d0;}
    `;
    document.head.appendChild(style);
  }

  injectStyle();
  bind();
})();
