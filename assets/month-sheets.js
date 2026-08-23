(() => {
  'use strict';

  const ACTIVE_KEY='case1-ledger-active-month-v1';
  const MANUAL_KEY='case1-ledger-manual-months-v1';
  const bridge=window.LedgerSchemaBridge;
  const $=s=>document.querySelector(s);
  let active='all';
  let refreshRaf=0;

  const clean=v=>String(v ?? '').trim();
  const monthFromDate=v=>/^\d{4}-\d{2}/.test(clean(v)) ? clean(v).slice(0,7) : '';
  const nowMonth=()=>{
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const monthLabel=m=>{
    const match=/^(\d{4})-(\d{2})$/.exec(m||'');
    return match ? `${match[1]}年${Number(match[2])}月` : m;
  };

  function readState(){
    const canonical=bridge?.readCanonical?.();
    if(canonical?.rows) return canonical;
    try{
      const parsed=JSON.parse(localStorage.getItem('case1-excel-ledger-v1'));
      return parsed && Array.isArray(parsed.rows) ? parsed : null;
    }catch(_){ return null; }
  }

  function readManual(){
    try{
      const value=JSON.parse(localStorage.getItem(MANUAL_KEY));
      return Array.isArray(value) ? value.filter(m=>/^\d{4}-\d{2}$/.test(m)) : [];
    }catch(_){ return []; }
  }

  function writeManual(months){
    localStorage.setItem(MANUAL_KEY,JSON.stringify([...new Set(months)].sort().reverse()));
  }

  function monthCounts(){
    const counts=new Map();
    const state=readState();
    state?.rows?.forEach(row=>{
      const m=monthFromDate(row?.['日期']);
      if(m) counts.set(m,(counts.get(m)||0)+1);
    });
    return counts;
  }

  function allMonths(){
    const set=new Set([nowMonth(),...readManual()]);
    monthCounts().forEach((_,m)=>set.add(m));
    if(active!=='all' && /^\d{4}-\d{2}$/.test(active)) set.add(active);
    return [...set].sort().reverse();
  }

  function ensureUI(){
    if($('#monthSheetBar')) return;
    const viewport=$('#gridViewport');
    if(!viewport) return;

    const bar=document.createElement('div');
    bar.id='monthSheetBar';
    bar.className='month-sheet-bar';
    bar.innerHTML='<div id="monthSheetTabs" class="month-sheet-tabs" role="tablist" aria-label="月份工作表"></div><button id="addMonthSheet" class="month-sheet-add" type="button">＋ 月份</button>';
    viewport.insertAdjacentElement('afterend',bar);

    const dialog=document.createElement('div');
    dialog.id='monthSheetDialog';
    dialog.className='modal-backdrop month-sheet-dialog';
    dialog.hidden=true;
    dialog.innerHTML=`<form id="monthSheetForm" class="mini-modal month-sheet-modal">
      <h3>新增月份工作表</h3>
      <p>可以先建立空月份，之後在這個分頁新增案件。</p>
      <label>月份<input id="monthSheetInput" class="compact-input" type="month" required></label>
      <div class="modal-actions"><button id="cancelMonthSheet" class="mini-btn" type="button">取消</button><button class="mini-btn primary" type="submit">建立月份</button></div>
    </form>`;
    document.body.appendChild(dialog);

    $('#addMonthSheet').addEventListener('click',()=>{
      $('#monthSheetInput').value=active!=='all'?active:nowMonth();
      dialog.hidden=false;
      setTimeout(()=>$('#monthSheetInput')?.focus(),20);
    });
    $('#cancelMonthSheet').addEventListener('click',()=>{dialog.hidden=true;});
    dialog.addEventListener('click',e=>{if(e.target===dialog) dialog.hidden=true;});
    $('#monthSheetForm').addEventListener('submit',e=>{
      e.preventDefault();
      const month=$('#monthSheetInput').value;
      if(!/^\d{4}-\d{2}$/.test(month)) return;
      const manual=readManual();
      if(!manual.includes(month)) manual.push(month);
      writeManual(manual);
      active=month;
      localStorage.setItem(ACTIVE_KEY,active);
      dialog.hidden=true;
      renderTabs();
      applyFilter();
    });
  }

  function renderTabs(){
    ensureUI();
    const tabs=$('#monthSheetTabs');
    if(!tabs) return;
    const counts=monthCounts();
    const months=allMonths();
    const total=[...counts.values()].reduce((sum,n)=>sum+n,0);
    tabs.innerHTML='';

    const make=(value,label,count)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='month-sheet-tab';
      btn.dataset.month=value;
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected',String(active===value));
      if(active===value) btn.classList.add('active');
      btn.innerHTML=`<span>${label}</span><b>${count}</b>`;
      btn.addEventListener('click',()=>{
        active=value;
        localStorage.setItem(ACTIVE_KEY,active);
        renderTabs();
        applyFilter();
      });
      return btn;
    };

    tabs.appendChild(make('all','總表',total));
    months.forEach(m=>tabs.appendChild(make(m,monthLabel(m),counts.get(m)||0)));
    requestAnimationFrame(()=>tabs.querySelector('.month-sheet-tab.active')?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}));
  }

  function applyFilter(){
    const table=$('#sheetGrid');
    if(!table) return;
    let shown=0,total=0;
    table.querySelectorAll('tbody tr').forEach(tr=>{
      total++;
      const dateInput=tr.querySelector('[data-header="日期"]');
      const match=active==='all' || monthFromDate(dateInput?.value)===active;
      tr.style.display=match?'':'none';
      if(match) shown++;
    });

    const count=$('#rowCount');
    if(count) count.textContent=active==='all' ? `${total} 筆` : `${shown} 筆｜${monthLabel(active)}`;
    const caption=document.querySelector('.sheet-caption strong');
    if(caption) caption.textContent=active==='all'?'總表':monthLabel(active);
    const bar=$('#monthSheetBar');
    if(bar) bar.dataset.activeMonth=active;
  }

  function refresh(){
    refreshRaf=0;
    renderTabs();
    applyFilter();
  }

  function scheduleRefresh(){
    if(refreshRaf) return;
    refreshRaf=requestAnimationFrame(refresh);
  }

  function primeNewRowForMonth(){
    if(active==='all') return;
    requestAnimationFrame(()=>{
      const rows=[...document.querySelectorAll('#sheetGrid tbody tr')];
      const tr=rows.at(-1);
      const input=tr?.querySelector('[data-header="日期"]');
      if(!input || input.value) return;
      input.value=`${active}-01`;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      scheduleRefresh();
    });
  }

  function primeProjectDialog(){
    if(active==='all') return;
    requestAnimationFrame(()=>{
      const input=$('#projectStartDate');
      if(!input) return;
      const current=nowMonth();
      if(active===current){
        const d=new Date();
        input.value=`${active}-${String(d.getDate()).padStart(2,'0')}`;
      }else{
        input.value=`${active}-01`;
      }
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }

  function injectStyle(){
    if($('#month-sheet-style')) return;
    const style=document.createElement('style');
    style.id='month-sheet-style';
    style.textContent=`
      .month-sheet-bar{display:flex;align-items:flex-end;gap:8px;padding:7px 8px 0;border:1px solid #dce4ef;border-top:0;background:#f3f6fb;overflow:hidden;}
      .month-sheet-tabs{display:flex;align-items:flex-end;gap:3px;min-width:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;flex:1;padding-bottom:0;}
      .month-sheet-tab,.month-sheet-add{border:1px solid #cfd9e7;background:#e9eef6;color:#526178;font:inherit;font-size:11px;font-weight:800;white-space:nowrap;cursor:pointer;}
      .month-sheet-tab{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:7px 11px 6px;border-radius:8px 8px 0 0;border-bottom-color:#b9c7da;}
      .month-sheet-tab b{display:grid;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#d7e0ec;color:#64748b;font-size:9px;}
      .month-sheet-tab.active{background:#fff;color:#0b57d0;border-color:#b9cae4;border-bottom-color:#fff;box-shadow:0 -2px 8px rgba(16,31,53,.04);position:relative;z-index:1;}
      .month-sheet-tab.active b{background:#e9f1ff;color:#0b57d0;}
      .month-sheet-add{flex:0 0 auto;min-height:31px;margin-bottom:3px;padding:6px 10px;border-radius:8px;background:#fff;}
      .month-sheet-modal{width:min(360px,calc(100vw - 28px));}
      .month-sheet-modal p{margin:-3px 0 13px;color:#64748b;font-size:11px;line-height:1.5;}
      .month-sheet-modal label{display:grid;gap:6px;color:#475569;font-size:11px;font-weight:800;}
      @media(max-width:620px){
        .month-sheet-bar{padding-left:4px;padding-right:4px;gap:5px;}
        .month-sheet-tab{min-height:32px;padding:6px 9px 5px;font-size:10px;}
        .month-sheet-add{padding:5px 8px;font-size:10px;}
      }
    `;
    document.head.appendChild(style);
  }

  function bind(){
    const table=$('#sheetGrid');
    if(table){
      const observer=new MutationObserver(scheduleRefresh);
      observer.observe(table,{childList:true});
      table.addEventListener('change',e=>{
        if(e.target?.dataset?.header==='日期') scheduleRefresh();
      });
    }
    $('#addRowBtn')?.addEventListener('click',primeNewRowForMonth);
    $('#addProjectBtn')?.addEventListener('click',primeProjectDialog);
  }

  function init(){
    injectStyle();
    const saved=localStorage.getItem(ACTIVE_KEY);
    active=saved==='all'||/^\d{4}-\d{2}$/.test(saved||'') ? saved : 'all';
    ensureUI();
    bind();
    refresh();
  }

  init();
})();
