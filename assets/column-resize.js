(() => {
  'use strict';

  const WIDTH_KEY='case1-excel-ledger-column-widths-v1';
  const $=s=>document.querySelector(s);
  let refreshRaf=0;
  let active=null;

  function readWidths(){
    try{
      const v=JSON.parse(localStorage.getItem(WIDTH_KEY));
      return v && typeof v==='object' ? v : {};
    }catch(_){ return {}; }
  }

  function saveWidths(widths){
    localStorage.setItem(WIDTH_KEY,JSON.stringify(widths));
  }

  function headerKey(th){
    if(th.dataset.resizeKey) return th.dataset.resizeKey;
    if(th.dataset.payerColumn) return '撥款人';
    const state=JSON.parse(localStorage.getItem('case1-excel-ledger-v1')||'null');
    const idx=Number(th.dataset.col);
    let key=state?.headers?.[idx] || th.textContent.trim();
    if(key==='起租案名/同仁') key='起租案名';
    th.dataset.resizeKey=key;
    return key;
  }

  function applyWidths(){
    const table=$('#sheetGrid');
    if(!table) return;
    const widths=readWidths();
    let style=$('#column-width-rules');
    if(!style){
      style=document.createElement('style');
      style.id='column-width-rules';
      document.head.appendChild(style);
    }
    const rules=[];
    table.querySelectorAll('thead th[data-col], thead th[data-payer-column], thead th[data-business-column]').forEach(th=>{
      const key=headerKey(th);
      const width=Number(widths[key]);
      if(!Number.isFinite(width) || width<56) return;
      const index=th.cellIndex+1;
      rules.push(`#sheetGrid tr > *:nth-child(${index}){width:${width}px!important;min-width:${width}px!important;max-width:${width}px!important;}`);
    });
    style.textContent=rules.join('\n');
  }

  function addHandles(){
    refreshRaf=0;
    const table=$('#sheetGrid');
    if(!table) return;
    table.querySelectorAll('thead th[data-col], thead th[data-payer-column], thead th[data-business-column]').forEach(th=>{
      headerKey(th);
      if(th.querySelector('.col-resize-handle')) return;
      th.classList.add('resizable-header');
      const handle=document.createElement('span');
      handle.className='col-resize-handle';
      handle.setAttribute('aria-hidden','true');
      handle.title='拖曳調整欄寬；雙擊恢復預設';
      handle.addEventListener('pointerdown',startResize);
      handle.addEventListener('dblclick',resetWidth);
      th.appendChild(handle);
    });
    applyWidths();
  }

  function startResize(e){
    e.preventDefault();
    e.stopPropagation();
    const th=e.currentTarget.closest('th');
    if(!th) return;
    const key=headerKey(th);
    active={key,startX:e.clientX,startWidth:th.getBoundingClientRect().width};
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.classList.add('column-resizing');
    window.addEventListener('pointermove',moveResize,{passive:false});
    window.addEventListener('pointerup',endResize,{once:true});
  }

  function moveResize(e){
    if(!active) return;
    e.preventDefault();
    const width=Math.max(64,Math.min(460,Math.round(active.startWidth + e.clientX - active.startX)));
    const widths=readWidths();
    widths[active.key]=width;
    saveWidths(widths);
    applyWidths();
  }

  function endResize(){
    active=null;
    document.body.classList.remove('column-resizing');
    window.removeEventListener('pointermove',moveResize);
  }

  function resetWidth(e){
    e.preventDefault();
    e.stopPropagation();
    const th=e.currentTarget.closest('th');
    if(!th) return;
    const widths=readWidths();
    delete widths[headerKey(th)];
    saveWidths(widths);
    applyWidths();
  }

  function schedule(){
    if(refreshRaf) return;
    refreshRaf=requestAnimationFrame(addHandles);
  }

  function injectStyle(){
    if($('#column-resize-style')) return;
    const style=document.createElement('style');
    style.id='column-resize-style';
    style.textContent=`
      .sheet-grid thead th.resizable-header{position:sticky;}
      .col-resize-handle{position:absolute;top:0;right:-4px;width:9px;height:100%;cursor:col-resize;z-index:8;touch-action:none;}
      .col-resize-handle::after{content:"";position:absolute;top:18%;bottom:18%;left:4px;width:1px;background:transparent;transition:background .12s ease;}
      .resizable-header:hover .col-resize-handle::after,.column-resizing .col-resize-handle::after{background:#8aa4cc;}
      .column-resizing{cursor:col-resize!important;user-select:none!important;}
      .column-resizing *{cursor:col-resize!important;}
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    const table=$('#sheetGrid');
    if(table){
      const observer=new MutationObserver(schedule);
      observer.observe(table,{childList:true});
    }
    schedule();
  }

  init();
})();