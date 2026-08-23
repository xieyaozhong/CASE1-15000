(() => {
  'use strict';

  const STORAGE_KEY='case1-excel-ledger-v1';
  const SORT_KEY='case1-excel-ledger-sort-v1';
  const RETURN_KEY='case1-per-case-returns-v1';
  const LEGACY_PROJECT='起租案名/同仁';
  const HIDDEN_FIELDS=['狀態','完成日','持續時間'];
  const CYCLE='週期';
  const RECENT='最近結算日';
  const BROKER='仲介費';
  const bridge=window.LedgerSchemaBridge;
  const $=s=>document.querySelector(s);
  const clean=v=>String(v ?? '').trim();
  const num=v=>{
    if(typeof v==='number') return Number.isFinite(v)?v:0;
    const n=Number(String(v ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n)?n:0;
  };
  const money=v=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(num(v));
  let refreshRaf=0;
  let settlementRaf=0;

  function virtualState(){
    try{
      const state=JSON.parse(localStorage.getItem(STORAGE_KEY));
      return state && Array.isArray(state.headers) && Array.isArray(state.rows) ? state : null;
    }catch(_){ return null; }
  }

  function canonicalState(){ return bridge?.readCanonical?.(); }

  function investorColumns(){
    const state=virtualState();
    if(!state?.headers) return [];
    const start=state.headers.indexOf('參與總額')+1;
    const end=state.headers.findIndex((h,i)=>i>=start && HIDDEN_FIELDS.includes(h));
    return state.headers.slice(start,end<0?state.headers.length:end).filter(Boolean);
  }

  function currentSort(field){
    try{
      const s=JSON.parse(localStorage.getItem(SORT_KEY));
      return s?.header===field ? s.direction : null;
    }catch(_){ return null; }
  }

  function hideLegacyColumns(table){
    const state=virtualState();
    if(!state) return;
    HIDDEN_FIELDS.forEach(field=>{
      const col=state.headers.indexOf(field);
      const th=col>=0 ? table.querySelector(`thead th[data-col="${col}"]`) : null;
      if(th) th.style.display='none';
      table.querySelectorAll(`tbody [data-header="${field}"]`).forEach(input=>{
        const td=input.closest('td');
        if(td) td.style.display='none';
      });
    });
  }

  function makeHeader(field,label,type){
    const th=document.createElement('th');
    th.className='system-col sortable-header business-header';
    th.dataset.businessColumn=field;
    th.dataset.resizeKey=label;
    th.dataset.businessType=type;
    const direction=currentSort(field);
    th.setAttribute('aria-sort',direction==='asc'?'ascending':direction==='desc'?'descending':'none');
    th.title=`點擊依「${label}」排序`;
    th.innerHTML=`${label}<span class="sort-indicator">${direction==='asc'?'▲':direction==='desc'?'▼':'↕'}</span>`;
    th.addEventListener('click',e=>{
      if(e.target.closest('.col-resize-handle')) return;
      sortBusiness(field,type);
    });
    return th;
  }

  function businessValue(row,field){
    if(field===RECENT) return clean(row?.['完成日']);
    if(field===CYCLE) return clean(row?.[CYCLE]);
    if(field===BROKER) return row?.[BROKER] ?? '';
    return '';
  }

  function saveBusiness(rowIndex,field,value){
    if(field===RECENT){
      const hidden=$(`#sheetGrid [data-row="${rowIndex}"][data-header="完成日"]`);
      if(hidden){
        hidden.value=value;
        hidden.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return;
    }
    bridge?.setBusinessByIndex?.(rowIndex,field,value);
    const state=$('#saveState');
    if(state) state.textContent='已自動儲存';
  }

  function makeCell(rowIndex,field,type,value){
    const td=document.createElement('td');
    td.dataset.businessCell=field;
    const input=document.createElement('input');
    input.className='cell-input business-input';
    input.dataset.row=String(rowIndex);
    input.dataset.header=field;
    input.type=type;
    if(type==='number'){
      input.step='0.01';
      input.min='0';
      input.inputMode='decimal';
    }
    input.value=value ?? '';
    input.addEventListener('change',()=>saveBusiness(rowIndex,field,input.value));
    if(field===CYCLE) input.placeholder='例如：每月 / 30天';
    if(field===BROKER) input.placeholder='0';
    td.appendChild(input);
    return td;
  }

  function insertBusinessColumns(table){
    if(table.querySelector('thead th[data-business-column]')) return;
    const canonical=canonicalState();
    const virtual=virtualState();
    if(!canonical?.rows || !virtual?.headers) return;
    const noteIndex=virtual.headers.indexOf('備註');
    const noteTh=noteIndex>=0 ? table.querySelector(`thead th[data-col="${noteIndex}"]`) : null;
    if(!noteTh) return;

    [
      makeHeader(CYCLE,CYCLE,'text'),
      makeHeader(RECENT,RECENT,'date'),
      makeHeader(BROKER,BROKER,'number')
    ].forEach(th=>noteTh.insertAdjacentElement('beforebegin',th));

    table.querySelectorAll('tbody tr').forEach((tr,rowIndex)=>{
      const noteInput=tr.querySelector('[data-header="備註"]');
      const noteTd=noteInput?.closest('td');
      if(!noteTd) return;
      const row=canonical.rows[rowIndex] || {};
      [
        makeCell(rowIndex,CYCLE,'text',businessValue(row,CYCLE)),
        makeCell(rowIndex,RECENT,'date',businessValue(row,RECENT)),
        makeCell(rowIndex,BROKER,'number',businessValue(row,BROKER))
      ].forEach(td=>noteTd.insertAdjacentElement('beforebegin',td));
    });
  }

  function compare(a,b,field,type){
    const av=businessValue(a.row,field),bv=businessValue(b.row,field);
    const ae=av===''||av==null,be=bv===''||bv==null;
    if(ae!==be) return ae?1:-1;
    if(ae&&be) return a.index-b.index;
    let base=0;
    if(type==='number') base=num(av)-num(bv);
    else if(type==='date') base=String(av).localeCompare(String(bv));
    else base=String(av).localeCompare(String(bv),'zh-Hant-TW',{numeric:true,sensitivity:'base'});
    return base===0 ? a.index-b.index : base;
  }

  function sortBusiness(field,type){
    const state=canonicalState();
    if(!state?.rows) return;
    const current=currentSort(field);
    const direction=current==='asc'?'desc':'asc';
    const indexed=state.rows.map((row,index)=>({row,index}));
    indexed.sort((a,b)=>{
      const result=compare(a,b,field,type);
      const av=businessValue(a.row,field),bv=businessValue(b.row,field);
      const empty=(av===''||av==null)||(bv===''||bv==null);
      if(empty) return result;
      return direction==='desc'?-result:result;
    });
    state.rows=indexed.map(x=>x.row);
    bridge?.rawSetState?.(state);
    localStorage.setItem(SORT_KEY,JSON.stringify({header:field,direction}));
    location.reload();
  }

  function renameProjectInDialog(){
    const form=$('#projectForm');
    if(!form) return;
    const name=$('#projectName')?.closest('label');
    const nameSpan=name?.querySelector('span');
    if(nameSpan) nameSpan.textContent='起租案名';
    if($('#projectName')) $('#projectName').placeholder='例如：新案／客戶名稱';

    const completed=$('#projectCompletedDate')?.closest('label');
    const completedSpan=completed?.querySelector('span');
    if(completedSpan) completedSpan.textContent='最近結算日（可留空）';

    if(!$('#projectCycle')){
      const cycle=document.createElement('label');
      cycle.className='project-field';
      cycle.innerHTML='<span>週期</span><input id="projectCycle" type="text" placeholder="例如：每月 / 30天">';
      completed?.insertAdjacentElement('afterend',cycle);
    }
    if(!$('#projectBrokerFee')){
      const fee=document.createElement('label');
      fee.className='project-field';
      fee.innerHTML='<span>仲介費</span><input id="projectBrokerFee" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0">';
      $('#projectCycle')?.closest('label')?.insertAdjacentElement('afterend',fee);
    }
    if(!form.dataset.businessSubmitBound){
      form.dataset.businessSubmitBound='1';
      form.addEventListener('submit',()=>{
        bridge?.setPendingBusiness?.({
          [CYCLE]:$('#projectCycle')?.value || '',
          [BROKER]:$('#projectBrokerFee')?.value || ''
        });
      },true);
    }
  }

  function exportBusiness(e){
    if(!window.XLSX || !bridge) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const canonical=canonicalState();
    const investors=investorColumns();
    if(!canonical?.rows) return;
    const headers=['日期','起租案名','案源','撥款人','案件金額','參與總額',...investors,CYCLE,RECENT,BROKER,'備註'];
    const rows=canonical.rows.map(row=>[
      row['日期']??'',row[LEGACY_PROJECT]??'',row['案源']??'',row['撥款人']??'',row['案件金額']??'',row['參與總額']??'',
      ...investors.map(name=>row[name]??''),row[CYCLE]??'',row['完成日']??'',row[BROKER]??'',row['備註']??''
    ]);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,...rows]),'收益結算表');
    const d=new Date();
    const stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    XLSX.writeFile(wb,`收益結算表_${stamp}.xlsx`);
  }

  function baseCaseKey(row){
    return [clean(row?.['日期']),clean(row?.[LEGACY_PROJECT]),clean(row?.['案源']),clean(row?.['案件金額']),clean(row?.['完成日']),clean(row?.['備註'])].join('|');
  }

  function settlementItems(){
    const state=canonicalState();
    const investors=investorColumns();
    const start=$('#rangeStart')?.value || '';
    const end=$('#rangeEnd')?.value || '';
    const map=new Map();
    const groups=new Map();
    const duplicates=new Map();
    if(!state?.rows || !start || !end) return {map,groups,start,end};

    state.rows.forEach(row=>{
      const recent=clean(row?.['完成日']);
      if(!recent || recent<start || recent>end) return;
      const base=baseCaseKey(row);
      const occurrence=(duplicates.get(base)||0)+1;
      duplicates.set(base,occurrence);
      const caseKey=`${base}#${occurrence}`;
      investors.forEach(investor=>{
        const invested=num(row?.[investor]);
        if(invested<=0) return;
        const key=`${caseKey}|${investor}`;
        const item={
          key,investor,recent,cycle:row?.[CYCLE]??'',broker:row?.[BROKER]??'',project:clean(row?.[LEGACY_PROJECT])||'未命名投資案',
          source:clean(row?.['案源']),payer:clean(row?.['撥款人']),caseAmount:num(row?.['案件金額']),invested
        };
        map.set(key,item);
        if(!groups.has(investor)) groups.set(investor,[]);
        groups.get(investor).push(item);
      });
    });
    return {map,groups,start,end};
  }

  function decorateSettlement(){
    settlementRaf=0;
    const box=$('#investorGroups');
    if(!box) return;
    const {map}=settlementItems();
    box.querySelectorAll('.per-case-profit-table').forEach(table=>{
      const ths=table.querySelectorAll('thead th');
      if(ths[0]) ths[0].textContent=RECENT;
      if(ths[1]) ths[1].textContent=CYCLE;
      if(ths[4] && !table.querySelector('th[data-business-settlement-broker]')){
        const th=document.createElement('th');
        th.className='num';
        th.dataset.businessSettlementBroker='1';
        th.textContent=BROKER;
        ths[4].insertAdjacentElement('afterend',th);
      }
      table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr=>{
        const item=map.get(tr.dataset.profitKey);
        if(!item) return;
        const cells=tr.querySelectorAll('td');
        if(cells[1]) cells[1].textContent=clean(item.cycle)||'—';
        if(!tr.querySelector('td[data-business-settlement-broker]') && cells[4]){
          const td=document.createElement('td');
          td.className='num';
          td.dataset.businessSettlementBroker='1';
          td.textContent=item.broker===''||item.broker==null?'—':money(item.broker);
          cells[4].insertAdjacentElement('afterend',td);
        }
      });
    });
    box.querySelectorAll('.investor-metric').forEach(el=>{
      if(el.firstChild?.nodeType===Node.TEXT_NODE && el.firstChild.nodeValue?.trim()==='完成案數') el.firstChild.nodeValue='結算案數';
    });
  }

  function scheduleSettlement(){
    if(settlementRaf) return;
    settlementRaf=requestAnimationFrame(decorateSettlement);
  }

  function readReturnStore(){
    try{
      const store=JSON.parse(localStorage.getItem(RETURN_KEY));
      return store && typeof store==='object' ? store : {};
    }catch(_){ return {}; }
  }

  function liveReturnSettings(){
    const map=new Map();
    document.querySelectorAll('.per-case-profit-table tbody tr[data-profit-key]').forEach(tr=>{
      map.set(tr.dataset.profitKey,{rate:num(tr.querySelector('.case-rate-input')?.value),amount:num(tr.querySelector('.case-amount-input')?.value)});
    });
    return map;
  }

  function returnSetting(item,store,live){
    if(live.has(item.key)) return live.get(item.key);
    const raw=store[item.key];
    if(!raw || typeof raw!=='object') return {rate:6,amount:item.invested*.06};
    if(raw.basis==='amount'){
      const amount=Math.max(0,num(raw.amount));
      return {amount,rate:item.invested>0?amount/item.invested*100:0};
    }
    const rate=Math.max(0,num(raw.rate ?? 6));
    return {rate,amount:item.invested*rate/100};
  }

  function exportSettlementBusiness(e){
    if(!window.XLSX) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const {groups,start,end}=settlementItems();
    if(!groups.size) return;
    const store=readReturnStore();
    const live=liveReturnSettings();
    const summary=[['投資人','結算案數','投入金額合計','收益合計']];
    const detail=[['投資人',RECENT,CYCLE,'起租案名','案源','撥款人','案件金額','投入金額',BROKER,'收益率(%)','收益金額']];
    groups.forEach((items,investor)=>{
      let invested=0,profit=0;
      items.forEach(item=>{
        const setting=returnSetting(item,store,live);
        invested+=item.invested;
        profit+=setting.amount;
        detail.push([investor,item.recent,item.cycle,item.project,item.source,item.payer,item.caseAmount,item.invested,item.broker,setting.rate,setting.amount]);
      });
      summary.push([investor,items.length,invested,profit]);
    });
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'投資人收益');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),'逐案收益明細');
    XLSX.writeFile(wb,`區間結算_${start}_${end}.xlsx`);
  }

  function decorateTable(){
    refreshRaf=0;
    const table=$('#sheetGrid');
    if(!table) return;
    hideLegacyColumns(table);
    insertBusinessColumns(table);
  }

  function scheduleDecorate(){
    if(refreshRaf) return;
    refreshRaf=requestAnimationFrame(decorateTable);
  }

  function injectStyle(){
    if($('#business-columns-style')) return;
    const style=document.createElement('style');
    style.id='business-columns-style';
    style.textContent=`
      .business-header{white-space:nowrap;cursor:pointer;user-select:none;}
      .business-input{min-width:92px;}
      [data-business-column="${CYCLE}"]{min-width:105px;}
      [data-business-column="${RECENT}"]{min-width:132px;}
      [data-business-column="${BROKER}"]{min-width:95px;}
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    renameProjectInDialog();
    const table=$('#sheetGrid');
    if(table){
      const observer=new MutationObserver(scheduleDecorate);
      observer.observe(table,{childList:true});
    }
    const settlement=$('#investorGroups');
    if(settlement){
      const observer=new MutationObserver(scheduleSettlement);
      observer.observe(settlement,{childList:true});
    }
    const exportBtn=$('#exportBtn');
    if(exportBtn) exportBtn.addEventListener('click',exportBusiness,true);
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#exportSettlementBtn')) exportSettlementBusiness(e);
    },true);
    scheduleDecorate();
    scheduleSettlement();
  }

  init();
})();