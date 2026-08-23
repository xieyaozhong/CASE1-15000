(() => {
  'use strict';

  const PAYER='撥款人';
  const LEGACY_PROJECT='起租案名/同仁';
  const SORT_KEY='case1-excel-ledger-sort-v1';
  const bridge=window.LedgerSchemaBridge;
  const $=s=>document.querySelector(s);
  const clean=v=>String(v ?? '').trim();
  let payerSaveTimer=0;
  let refreshRaf=0;

  function readCanonical(){ return bridge?.readCanonical?.(); }

  function renameProjectHeader(table){
    const state=JSON.parse(localStorage.getItem('case1-excel-ledger-v1')||'null');
    if(!state?.headers) return;
    const idx=state.headers.indexOf(LEGACY_PROJECT);
    const th=idx>=0 ? table.querySelector(`thead th[data-col="${idx}"]`) : null;
    if(!th) return;
    const text=[...th.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
    if(text) text.nodeValue='起租案名';
    else th.insertBefore(document.createTextNode('起租案名'),th.firstChild);
    th.title='點擊依「起租案名」排序';
    th.dataset.resizeKey='起租案名';
  }

  function payerSortDirection(){
    try {
      const s=JSON.parse(localStorage.getItem(SORT_KEY));
      return s?.header===PAYER ? s.direction : null;
    } catch(_){ return null; }
  }

  function sortByPayer(){
    const state=readCanonical();
    if(!state?.rows) return;
    const current=payerSortDirection();
    const direction=current==='asc'?'desc':'asc';
    const collator=new Intl.Collator('zh-Hant-TW',{numeric:true,sensitivity:'base'});
    const indexed=state.rows.map((row,index)=>({row,index}));
    indexed.sort((a,b)=>{
      const av=clean(a.row?.[PAYER]),bv=clean(b.row?.[PAYER]);
      const ae=!av,be=!bv;
      if(ae!==be) return ae?1:-1;
      if(ae&&be) return a.index-b.index;
      const base=collator.compare(av,bv);
      return base===0 ? a.index-b.index : (direction==='desc'?-base:base);
    });
    state.rows=indexed.map(x=>x.row);
    bridge.rawSetState(state);
    localStorage.setItem(SORT_KEY,JSON.stringify({header:PAYER,direction}));
    location.reload();
  }

  function buildPayerHeader(table,sourceTh){
    if(table.querySelector('thead th[data-payer-column]')) return;
    const th=document.createElement('th');
    th.className='key-col sortable-header payer-header';
    th.dataset.payerColumn='1';
    th.dataset.resizeKey=PAYER;
    th.title='點擊依「撥款人」排序';
    const direction=payerSortDirection();
    th.setAttribute('aria-sort',direction==='asc'?'ascending':direction==='desc'?'descending':'none');
    th.innerHTML=`${PAYER}<span class="sort-indicator">${direction==='asc'?'▲':direction==='desc'?'▼':'↕'}</span>`;
    th.addEventListener('click',e=>{
      if(e.target.closest('.col-resize-handle')) return;
      sortByPayer();
    });
    sourceTh.insertAdjacentElement('afterend',th);
  }

  function schedulePayerSave(index,value){
    clearTimeout(payerSaveTimer);
    payerSaveTimer=setTimeout(()=>bridge?.setPayerByIndex?.(index,value),220);
  }

  function insertPayerCells(table,sourceIndex){
    const canonical=readCanonical();
    if(!canonical?.rows) return;
    table.querySelectorAll('tbody tr').forEach((tr,rowIndex)=>{
      if(tr.querySelector('td[data-payer-cell]')) return;
      const sourceInput=tr.querySelector(`[data-header="案源"]`);
      const sourceTd=sourceInput?.closest('td');
      if(!sourceTd) return;
      const td=document.createElement('td');
      td.dataset.payerCell='1';
      const input=document.createElement('input');
      input.className='cell-input payer-input';
      input.type='text';
      input.value=canonical.rows[rowIndex]?.[PAYER] ?? '';
      input.placeholder='撥款人';
      input.dataset.row=String(rowIndex);
      input.dataset.header=PAYER;
      input.addEventListener('input',()=>schedulePayerSave(rowIndex,input.value));
      input.addEventListener('change',()=>bridge?.setPayerByIndex?.(rowIndex,input.value));
      td.appendChild(input);
      sourceTd.insertAdjacentElement('afterend',td);
    });
  }

  function decorateTable(){
    refreshRaf=0;
    const table=$('#sheetGrid');
    if(!table) return;
    renameProjectHeader(table);
    const state=JSON.parse(localStorage.getItem('case1-excel-ledger-v1')||'null');
    if(!state?.headers) return;
    const sourceIndex=state.headers.indexOf('案源');
    const sourceTh=sourceIndex>=0 ? table.querySelector(`thead th[data-col="${sourceIndex}"]`) : null;
    if(!sourceTh) return;
    buildPayerHeader(table,sourceTh);
    insertPayerCells(table,sourceIndex);
  }

  function scheduleDecorate(){
    if(refreshRaf) return;
    refreshRaf=requestAnimationFrame(decorateTable);
  }

  function enhanceProjectDialog(){
    const form=$('#projectForm');
    if(!form || $('#projectPayer')) return;
    const labels=[...form.querySelectorAll('.project-field')];
    const nameLabel=labels.find(l=>l.querySelector('span')?.textContent.includes('投資案名稱'));
    if(nameLabel) nameLabel.querySelector('span').textContent='投資案名稱';
    const sourceLabel=labels.find(l=>l.querySelector('span')?.textContent.trim()==='案源');
    if(sourceLabel){
      const label=document.createElement('label');
      label.className='project-field';
      label.innerHTML='<span>撥款人</span><input id="projectPayer" type="text" placeholder="例如：王先生">';
      sourceLabel.insertAdjacentElement('afterend',label);
    }
    form.addEventListener('submit',()=>{
      bridge?.setPendingPayer?.($('#projectPayer')?.value||'');
    },true);
  }

  function exportCanonical(e){
    if(!window.XLSX || !bridge) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const state=readCanonical();
    if(!state?.headers) return;
    const headers=state.headers.map(h=>h===LEGACY_PROJECT?'起租案名':h);
    const aoa=[headers,...state.rows.map(row=>state.headers.map(h=>row?.[h]??''))];
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'收益結算表');
    const d=new Date();
    const stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    XLSX.writeFile(wb,`收益結算表_${stamp}.xlsx`);
  }

  function injectStyle(){
    if($('#payer-column-style')) return;
    const style=document.createElement('style');
    style.id='payer-column-style';
    style.textContent=`
      .payer-header{white-space:nowrap;}
      .payer-input{min-width:88px;}
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    enhanceProjectDialog();
    const table=$('#sheetGrid');
    if(table){
      const observer=new MutationObserver(scheduleDecorate);
      observer.observe(table,{childList:true});
    }
    const exportBtn=$('#exportBtn');
    if(exportBtn) exportBtn.addEventListener('click',exportCanonical,true);
    scheduleDecorate();
  }

  init();
})();