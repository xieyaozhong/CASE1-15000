(() => {
  'use strict';

  const CYCLE='週期';
  const RECENT='最近結算日';
  const DEFAULT_DAYS=28;
  const bridge=window.LedgerSchemaBridge;
  const $=s=>document.querySelector(s);
  let refreshRaf=0;

  const clean=v=>String(v ?? '').trim();
  const localISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  function parseCycle(value){
    const match=clean(value).match(/\d+(?:\.\d+)?/);
    const n=match ? Number(match[0]) : DEFAULT_DAYS;
    return Number.isFinite(n) && n>0 ? Math.max(1,Math.round(n)) : DEFAULT_DAYS;
  }

  function dayNumber(value){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
    if(!m) return NaN;
    return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))/86400000;
  }

  function isoFromDay(day){
    if(!Number.isFinite(day)) return '';
    const d=new Date(day*86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  function nextSettlement(start,cycleDays){
    const startDay=dayNumber(start);
    if(!Number.isFinite(startDay)) return '';
    const days=parseCycle(cycleDays);
    // 起始日當天算第 1 天，所以 28 天週期的第一個結算日 = 起始日 + 27 天。
    const firstDue=startDay+(days-1);
    const todayDay=dayNumber(localISO(new Date()));
    if(!Number.isFinite(todayDay) || todayDay<=firstDue) return isoFromDay(firstDue);
    const steps=Math.ceil((todayDay-firstDue)/days);
    return isoFromDay(firstDue+steps*days);
  }

  function normalizeStoredRows(){
    const state=bridge?.readCanonical?.();
    if(!state?.rows) return;
    let changed=false;
    state.rows.forEach(row=>{
      const days=parseCycle(row?.[CYCLE]);
      if(clean(row?.[CYCLE])!==String(days)){
        row[CYCLE]=String(days);
        changed=true;
      }
      const due=nextSettlement(row?.['日期'],days);
      if(clean(row?.['完成日'])!==due){
        row['完成日']=due;
        changed=true;
      }
    });
    if(changed) bridge?.rawSetState?.(state);
  }

  function syncRow(rowIndex){
    const table=$('#sheetGrid');
    if(!table) return;
    const tr=table.querySelector(`tbody tr:nth-child(${rowIndex+1})`);
    if(!tr) return;

    const startInput=tr.querySelector('[data-header="日期"]');
    const cycleInput=tr.querySelector(`[data-header="${CYCLE}"]`);
    const recentInput=tr.querySelector(`[data-header="${RECENT}"]`);
    const hiddenCompleted=tr.querySelector('[data-header="完成日"]');
    if(!cycleInput || !recentInput) return;

    const days=parseCycle(cycleInput.value);
    cycleInput.type='number';
    cycleInput.min='1';
    cycleInput.step='1';
    cycleInput.inputMode='numeric';
    cycleInput.value=String(days);
    cycleInput.placeholder=String(DEFAULT_DAYS);
    cycleInput.title='單位：天；預設 28 天；起始日當天算第 1 天';

    const due=nextSettlement(startInput?.value,days);
    recentInput.value=due;
    recentInput.readOnly=true;
    recentInput.title='依起始日與週期自動計算；起始日當天算第 1 天';
    recentInput.classList.add('auto-recent-date');

    bridge?.setBusinessByIndex?.(rowIndex,CYCLE,String(days));

    if(hiddenCompleted && hiddenCompleted.value!==due){
      hiddenCompleted.value=due;
      hiddenCompleted.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function syncAll(){
    refreshRaf=0;
    const table=$('#sheetGrid');
    if(!table) return;
    table.querySelectorAll('tbody tr').forEach((_,i)=>syncRow(i));
  }

  function scheduleSync(){
    if(refreshRaf) return;
    refreshRaf=requestAnimationFrame(syncAll);
  }

  function bindTable(){
    const table=$('#sheetGrid');
    if(!table || table.dataset.autoCycleBound) return;
    table.dataset.autoCycleBound='1';
    table.addEventListener('change',e=>{
      const input=e.target.closest?.('.grid-cell,.business-input');
      if(!input) return;
      const header=input.dataset.header;
      if(header!=='日期' && header!==CYCLE) return;
      const rowIndex=Number(input.dataset.row);
      if(Number.isFinite(rowIndex)) requestAnimationFrame(()=>syncRow(rowIndex));
    });
    const observer=new MutationObserver(scheduleSync);
    observer.observe(table,{childList:true});
  }

  function enhanceProjectDialog(){
    const form=$('#projectForm');
    const cycle=$('#projectCycle');
    const start=$('#projectStartDate');
    const recent=$('#projectCompletedDate');
    if(!form || !cycle || !start || !recent) return;

    const cycleLabel=cycle.closest('label')?.querySelector('span');
    if(cycleLabel) cycleLabel.textContent='週期（天）';
    const recentLabel=recent.closest('label')?.querySelector('span');
    if(recentLabel) recentLabel.textContent='最近結算日（自動）';

    cycle.type='number';
    cycle.min='1';
    cycle.step='1';
    cycle.inputMode='numeric';
    cycle.title='起始日當天算第 1 天';
    recent.readOnly=true;
    recent.title='依起始日與週期自動計算；起始日當天算第 1 天';

    const refresh=()=>{
      const days=parseCycle(cycle.value);
      cycle.value=String(days);
      recent.value=nextSettlement(start.value,days);
    };

    if(!form.dataset.autoCycleBound){
      form.dataset.autoCycleBound='1';
      cycle.addEventListener('change',refresh);
      start.addEventListener('change',refresh);
      $('#addProjectBtn')?.addEventListener('click',()=>requestAnimationFrame(()=>{
        cycle.value=String(DEFAULT_DAYS);
        refresh();
      }));
    }
    if(!cycle.value) cycle.value=String(DEFAULT_DAYS);
    refresh();
  }

  function injectStyle(){
    if($('#auto-cycle-style')) return;
    const style=document.createElement('style');
    style.id='auto-cycle-style';
    style.textContent=`
      .auto-recent-date{background:#f6f8fb!important;color:#526178!important;cursor:default;}
      [data-business-column="${RECENT}"]::after{content:" AUTO";font-size:8px;color:#7890b8;font-weight:800;margin-left:4px;}
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    normalizeStoredRows();
    bindTable();
    enhanceProjectDialog();
    scheduleSync();
  }

  init();
})();
