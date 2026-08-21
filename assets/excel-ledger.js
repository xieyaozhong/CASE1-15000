(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const SYSTEM_COLUMNS = ['本案收益','費用','可分配收益','狀態','完成日','備註'];
  const BASE_COLUMNS = ['日期','起租案名/同仁','案源','案件金額','參與總額'];
  const numericColumns = new Set(['案件金額','參與總額','本案收益','費用']);
  const dateColumns = new Set(['日期','完成日']);
  let state = { headers:[...BASE_COLUMNS,...SYSTEM_COLUMNS], rows:[] };
  let lastSettlement = [];

  const money = value => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(Number(value||0));
  const num = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const n = Number(String(value ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iso = value => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    if (typeof value === 'number' && window.XLSX) {
      const d = XLSX.SSF.parse_date_code(value);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    const s = clean(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return Number.isNaN(d.valueOf()) ? '' : d.toISOString().slice(0,10);
  };
  const todayISO = () => new Date().toISOString().slice(0,10);

  function defaultPeriod(){
    const now = new Date();
    const mon = new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7));
    const sun = new Date(mon); sun.setDate(mon.getDate()+6);
    $('#rangeStart').value = mon.toISOString().slice(0,10);
    $('#rangeEnd').value = sun.toISOString().slice(0,10);
  }

  function investorColumns(){
    const start = state.headers.indexOf('參與總額') + 1;
    const sys = state.headers.findIndex((h,i) => i >= start && SYSTEM_COLUMNS.includes(h));
    const end = sys < 0 ? state.headers.length : sys;
    return state.headers.slice(start,end).filter(Boolean);
  }

  function ensureColumns(headers){
    const normalized = headers.map(h => clean(h));
    const out = [];
    for (const h of BASE_COLUMNS) if (!out.includes(h)) out.push(h);
    const start = normalized.indexOf('參與總額');
    if (start >= 0) {
      for (let i=start+1;i<normalized.length;i++) {
        const h = normalized[i];
        if (!h || h === '目前總共撥款' || SYSTEM_COLUMNS.includes(h)) break;
        if (!out.includes(h)) out.push(h);
      }
    }
    for (const h of SYSTEM_COLUMNS) if (!out.includes(h)) out.push(h);
    return out;
  }

  function investorColumnsFor(headers){
    const start = headers.indexOf('參與總額') + 1;
    const sys = headers.findIndex((h,i)=>i>=start && SYSTEM_COLUMNS.includes(h));
    return headers.slice(start, sys < 0 ? headers.length : sys).filter(Boolean);
  }

  function mapImportedRows(rawHeaders, rawRows, headers){
    const rawMap = new Map(rawHeaders.map((h,i)=>[clean(h),i]));
    const investors = investorColumnsFor(headers);
    return rawRows.map(row => {
      const obj = {};
      for (const h of headers) {
        const idx = rawMap.has(h) ? rawMap.get(h) : -1;
        let v = idx >= 0 ? row[idx] : '';
        if (dateColumns.has(h)) v = iso(v);
        if (numericColumns.has(h) || investors.includes(h)) v = v == null || v === '' ? '' : num(v);
        obj[h] = v ?? '';
      }
      if (!obj['狀態']) obj['狀態'] = '';
      return obj;
    }).filter(row => BASE_COLUMNS.some(h => clean(row[h]) !== '') || investors.some(h => num(row[h]) !== 0));
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const el = $('#saveState');
    el.textContent = '已自動儲存';
  }
  function markDirty(){
    $('#saveState').textContent = '儲存中…';
    clearTimeout(markDirty._t);
    markDirty._t = setTimeout(save,220);
  }
  function load(){
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.headers?.length && Array.isArray(saved.rows)) state = saved;
    } catch (_) {}
  }

  function blankRow(){
    return Object.fromEntries(state.headers.map(h => [h, '']));
  }
  function computed(row, header){
    if (header === '可分配收益') return Math.max(0, num(row['本案收益']) - num(row['費用']));
    return row[header] ?? '';
  }

  function renderGrid(focusTarget){
    const table = $('#sheetGrid');
    const headerHtml = state.headers.map((h,i)=>{
      const cls = BASE_COLUMNS.includes(h) ? 'key-col' : SYSTEM_COLUMNS.includes(h) ? 'system-col' : 'investor-col';
      return `<th class="${cls}" data-col="${i}">${esc(h)}</th>`;
    }).join('');
    table.innerHTML = `<thead><tr><th class="row-no">#</th>${headerHtml}<th class="delete-cell"></th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    state.rows.forEach((row,r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<th class="row-no">${r+1}</th>` + state.headers.map((h,c)=>cellHTML(row,h,r,c)).join('') + `<td class="delete-cell"><button class="delete-row" title="刪除此列" data-row="${r}">×</button></td>`;
      tbody.appendChild(tr);
    });
    $('#rowCount').textContent = `${state.rows.length} 筆`;
    bindGrid();
    if (focusTarget) requestAnimationFrame(()=>table.querySelector(`[data-row="${focusTarget.r}"][data-col="${focusTarget.c}"]`)?.focus());
  }

  function cellHTML(row,h,r,c){
    if (h === '可分配收益') return `<td class="computed-cell" data-computed="1">${money(computed(row,h))}</td>`;
    if (h === '狀態') {
      const v = clean(row[h]);
      return `<td><select class="cell-select grid-cell" data-row="${r}" data-col="${c}" data-header="${esc(h)}"><option value="" ${!v?'selected':''}>—</option><option value="進行中" ${v==='進行中'?'selected':''}>進行中</option><option value="完成" ${v==='完成'?'selected':''}>完成</option><option value="取消" ${v==='取消'?'selected':''}>取消</option></select></td>`;
    }
    const investors = investorColumns();
    const type = dateColumns.has(h) ? 'date' : (numericColumns.has(h) || investors.includes(h)) ? 'number' : 'text';
    const step = type === 'number' ? ' step="0.01"' : '';
    return `<td><input class="cell-input grid-cell" data-row="${r}" data-col="${c}" data-header="${esc(h)}" type="${type}"${step} value="${esc(type==='date'?iso(row[h]):row[h]??'')}"></td>`;
  }

  function bindGrid(){
    document.querySelectorAll('.grid-cell').forEach(el => {
      const update = () => {
        const r = Number(el.dataset.row), h = el.dataset.header;
        state.rows[r][h] = el.type === 'number' ? (el.value === '' ? '' : num(el.value)) : el.value;
        if (h === '本案收益' || h === '費用') refreshComputedRow(r);
        markDirty();
      };
      el.addEventListener('change',update);
      el.addEventListener('input',()=>{ if (el.tagName === 'INPUT' && el.type !== 'date') update(); });
      el.addEventListener('keydown',handleKeyNav);
      el.addEventListener('paste',handlePaste);
    });
    document.querySelectorAll('.delete-row').forEach(btn => btn.onclick = () => {
      const r = Number(btn.dataset.row);
      if (confirm(`刪除第 ${r+1} 列？`)) { state.rows.splice(r,1); save(); renderGrid(); }
    });
  }

  function refreshComputedRow(r){
    const c = state.headers.indexOf('可分配收益');
    if (c < 0) return;
    const td = $('#sheetGrid tbody')?.rows[r]?.cells[c+1];
    if (td) td.textContent = money(computed(state.rows[r],'可分配收益'));
  }

  function focusCell(r,c){
    const rows = state.rows.length;
    const cols = state.headers.length;
    if (r < 0 || c < 0 || c >= cols) return;
    if (r >= rows) { state.rows.push(blankRow()); renderGrid({r:rows,c}); markDirty(); return; }
    $('#sheetGrid').querySelector(`[data-row="${r}"][data-col="${c}"]`)?.focus();
  }

  function handleKeyNav(e){
    const r=Number(e.currentTarget.dataset.row), c=Number(e.currentTarget.dataset.col);
    if (e.key === 'Enter') { e.preventDefault(); focusCell(r+1,c); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusCell(r+1,c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(r-1,c); }
    else if (e.key === 'ArrowRight' && e.currentTarget.tagName === 'INPUT' && e.currentTarget.selectionStart === e.currentTarget.value.length) { focusCell(r,c+1); }
    else if (e.key === 'ArrowLeft' && e.currentTarget.tagName === 'INPUT' && e.currentTarget.selectionStart === 0) { focusCell(r,c-1); }
  }

  function handlePaste(e){
    const text = e.clipboardData?.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    e.preventDefault();
    const startR=Number(e.currentTarget.dataset.row), startC=Number(e.currentTarget.dataset.col);
    const matrix = text.replace(/\r/g,'').split('\n').filter((line,i,a)=>!(i===a.length-1 && line==='')).map(line=>line.split('\t'));
    while (state.rows.length < startR + matrix.length) state.rows.push(blankRow());
    matrix.forEach((cells,rr)=>cells.forEach((v,cc)=>{
      const c = startC+cc; if (c >= state.headers.length) return;
      const h = state.headers[c]; if (h === '可分配收益') return;
      state.rows[startR+rr][h] = dateColumns.has(h) ? iso(v) : (numericColumns.has(h)||investorColumns().includes(h)) ? (clean(v)===''?'':num(v)) : clean(v);
    }));
    save(); renderGrid({r:startR,c:startC});
  }

  function addRow(){
    state.rows.push(blankRow());
    save(); renderGrid({r:state.rows.length-1,c:0});
    $('#gridViewport').scrollTop = $('#gridViewport').scrollHeight;
  }

  function openInvestorDialog(){
    $('#investorDialog').hidden = false;
    $('#investorName').value='';
    setTimeout(()=>$('#investorName').focus(),20);
  }
  function closeInvestorDialog(){ $('#investorDialog').hidden = true; }
  function addInvestor(name){
    const n = clean(name);
    if (!n) return;
    if (state.headers.includes(n)) throw new Error('這個欄位已存在。');
    const insertAt = state.headers.findIndex(h=>SYSTEM_COLUMNS.includes(h));
    state.headers.splice(insertAt<0?state.headers.length:insertAt,0,n);
    state.rows.forEach(r=>r[n]='');
    save(); renderGrid();
  }

  async function importExcel(file){
    if (!window.XLSX) throw new Error('Excel 元件尚未載入。');
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab,{cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
    if (!data.length) throw new Error('Excel 沒有資料。');
    const rawHeaders = data[0].map(h=>clean(h));
    const headers = ensureColumns(rawHeaders);
    state = {headers,rows:mapImportedRows(rawHeaders,data.slice(1),headers)};
    save(); renderGrid();
    lastSettlement=[]; resetSettlementView();
  }

  function exportExcel(){
    if (!window.XLSX) return;
    const aoa = [state.headers,...state.rows.map(row=>state.headers.map(h=>h==='可分配收益'?computed(row,h):row[h]??''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'收益結算表');
    XLSX.writeFile(wb,`收益結算表_${todayISO()}.xlsx`);
  }

  function completedRows(start,end){
    if (!start || !end) throw new Error('請先選擇結算日期區間。');
    if (end < start) throw new Error('結束日不可早於起始日。');
    return state.rows.filter(row => clean(row['狀態'])==='完成' && iso(row['完成日']) >= start && iso(row['完成日']) <= end);
  }

  function buildSettlement(){
    const start=$('#rangeStart').value,end=$('#rangeEnd').value;
    let rows;
    try { rows=completedRows(start,end); } catch(e){ alert(e.message); return; }
    const investors=investorColumns(), groups=new Map();
    let principal=0, profit=0;
    for (const row of rows) {
      const total=num(row['參與總額']);
      const distributable=Math.max(0,num(row['本案收益'])-num(row['費用']));
      principal += total; profit += distributable;
      for (const investor of investors) {
        const invested=num(row[investor]);
        if (invested<=0) continue;
        const investorProfit = total>0 ? distributable*invested/total : 0;
        if (!groups.has(investor)) groups.set(investor,[]);
        groups.get(investor).push({
          investor,
          project:clean(row['起租案名/同仁'])||'未命名投資案',
          source:clean(row['案源']),
          completed:iso(row['完成日']),
          caseAmount:num(row['案件金額']),
          total,
          invested,
          ratio:total>0?invested/total:0,
          profit:investorProfit
        });
      }
    }
    lastSettlement=[...groups.entries()].map(([investor,items])=>({investor,items}));
    $('#periodSummary').hidden=false;
    $('#summaryProjects').textContent=rows.length;
    $('#summaryInvestors').textContent=groups.size;
    $('#summaryPrincipal').textContent=money(principal);
    $('#summaryProfit').textContent=money(profit);
    $('#settlementRangeText').textContent=`${start} ～ ${end}｜共 ${rows.length} 筆完成投資案`;
    renderSettlementGroups(lastSettlement);
    $('#exportSettlementBtn').disabled = !lastSettlement.length;
  }

  function renderSettlementGroups(groups){
    const box=$('#investorGroups');
    if (!groups.length) { box.innerHTML='<div class="empty-result">這個區間內沒有符合「狀態＝完成」且有完成日的投資案。</div>'; return; }
    box.innerHTML=groups.map(group=>{
      const invested=group.items.reduce((n,x)=>n+x.invested,0);
      const profit=group.items.reduce((n,x)=>n+x.profit,0);
      return `<article class="investor-group">
        <div class="investor-group-head"><strong>${esc(group.investor)}</strong><div class="investor-metric">完成案數<b>${group.items.length}</b></div><div class="investor-metric">參與金額<b>${money(invested)}</b></div><div class="investor-metric">區間收益<b class="profit">+${money(profit)}</b></div></div>
        <div class="investor-projects"><table class="result-table"><thead><tr><th>完成日</th><th>投資案</th><th>案源</th><th class="num">案件金額</th><th class="num">參與額</th><th class="num">占比</th><th class="num">應分收益</th></tr></thead><tbody>${group.items.map(x=>`<tr><td>${esc(x.completed)}</td><td><strong>${esc(x.project)}</strong></td><td>${esc(x.source||'—')}</td><td class="num">${money(x.caseAmount)}</td><td class="num">${money(x.invested)}</td><td class="num">${(x.ratio*100).toFixed(2)}%</td><td class="num profit">+${money(x.profit)}</td></tr>`).join('')}</tbody></table></div>
      </article>`;
    }).join('');
  }

  function resetSettlementView(){
    $('#periodSummary').hidden=true;
    $('#settlementRangeText').textContent='選擇日期區間後按「結算」，完成的投資案會依投資人分組。';
    $('#investorGroups').innerHTML='<div class="empty-result">尚未執行區間結算</div>';
    $('#exportSettlementBtn').disabled=true;
  }

  function exportSettlement(){
    if (!lastSettlement.length || !window.XLSX) return;
    const rows=[['投資人','完成日','投資案','案源','案件金額','參與額','參與占比','應分收益']];
    lastSettlement.forEach(g=>g.items.forEach(x=>rows.push([g.investor,x.completed,x.project,x.source,x.caseAmount,x.invested,x.ratio,x.profit])));
    const ws=XLSX.utils.aoa_to_sheet(rows);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'區間結算');
    XLSX.writeFile(wb,`區間結算_${$('#rangeStart').value}_${$('#rangeEnd').value}.xlsx`);
  }

  function clearAll(){
    if (!confirm('確定清空目前工作表？這會清除這台裝置已儲存的工作表資料。')) return;
    state={headers:[...BASE_COLUMNS,...SYSTEM_COLUMNS],rows:[]};
    localStorage.removeItem(STORAGE_KEY); renderGrid(); resetSettlementView(); save();
  }

  $('#addRowBtn').addEventListener('click',addRow);
  $('#addInvestorBtn').addEventListener('click',openInvestorDialog);
  $('#cancelInvestor').addEventListener('click',closeInvestorDialog);
  $('#investorDialog').addEventListener('click',e=>{if(e.target===$('#investorDialog'))closeInvestorDialog();});
  $('#investorForm').addEventListener('submit',e=>{e.preventDefault();try{addInvestor($('#investorName').value);closeInvestorDialog();}catch(err){alert(err.message);}});
  $('#excelInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await importExcel(file);}catch(err){alert(err.message);}finally{e.target.value='';}});
  $('#exportBtn').addEventListener('click',exportExcel);
  $('#settleBtn').addEventListener('click',buildSettlement);
  $('#exportSettlementBtn').addEventListener('click',exportSettlement);
  $('#clearBtn').addEventListener('click',clearAll);

  load(); defaultPeriod(); renderGrid();
  if (!state.rows.length) { state.rows.push(blankRow()); renderGrid(); save(); }
})();
