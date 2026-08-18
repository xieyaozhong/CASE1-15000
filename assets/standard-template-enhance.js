(function(){
'use strict';
const $=sel=>document.querySelector(sel);
const $$=sel=>Array.from(document.querySelectorAll(sel));
const PERIOD_OPTIONS=['7天','14天','15天','30天','45天','60天','90天','1月','2月','3月','6月','12月'];
const RATE_OPTIONS=['0%','3%','5%','6%','8%','10%','12%','15%','18%','20%'];
let activeCell=null;
let menu=null;

function clean(v){return String(v||'').replace(/\s+/g,'').trim();}
function isBlank(cell){return !clean(cell?.textContent) || /^必填|^建議/.test(clean(cell.textContent));}
function dispatchEdit(cell,value){
  if(!cell)return;
  cell.textContent=value;
  cell.classList.remove('error','warn');
  cell.classList.add('ok','quick-filled');
  cell.setAttribute('data-last-quickfill',value);
  cell.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
  cell.dispatchEvent(new Event('change',{bubbles:true}));
  cell.dispatchEvent(new Event('blur',{bubbles:true}));
  flash(cell);
  window.dispatchEvent(new CustomEvent('case1-standard-template-updated',{detail:{value}}));
}
function flash(cell){cell.classList.add('just-filled');setTimeout(()=>cell.classList.remove('just-filled'),850);}
function headerInfo(){
  const table=$('.standard-template-table');
  if(!table)return null;
  const headers=Array.from(table.querySelectorAll('thead th')).map(th=>clean(th.textContent));
  const durationIndex=headers.findIndex(t=>/期間|期限|天期/.test(t));
  const rateIndex=headers.findIndex(t=>/利率|報酬率|收益率/.test(t));
  const profitIndex=headers.findIndex(t=>/淨收益|收益/.test(t));
  const dateIndex=headers.findIndex(t=>/^日期|投資日/.test(t));
  return {table,headers,durationIndex,rateIndex,profitIndex,dateIndex};
}
function cellAt(row,index){return index>=0?row.children[index]||null:null;}
function buildQuickbar(panel){
  if(panel.querySelector('.std-enhance-bar'))return;
  const bar=document.createElement('div');
  bar.className='std-enhance-bar';
  bar.innerHTML=`
    <div class="std-enhance-title">
      <strong>快速補齊</strong>
      <span>選取期間或利率格，也可批次補空白</span>
    </div>
    <div class="std-quick-group">
      <label>期間<select id="stdDurationPreset">${PERIOD_OPTIONS.map(v=>`<option>${v}</option>`).join('')}</select></label>
      <button id="stdFillDurationCell" type="button">填入選取格</button>
      <button id="stdFillDurationBlanks" type="button">補齊空白期間</button>
    </div>
    <div class="std-quick-group">
      <label>利率<select id="stdRatePreset">${RATE_OPTIONS.map(v=>`<option>${v}</option>`).join('')}</select></label>
      <button id="stdFillRateCell" type="button">填入選取格</button>
      <button id="stdFillRateBlanks" type="button">補齊空白利率</button>
    </div>
    <div class="std-quick-note">紅格是必填缺漏，黃格是建議補齊；快捷填入後會觸發原本的儲存與檢查流程。</div>`;
  const head=panel.querySelector('.std-head');
  (head||panel.firstElementChild||panel).insertAdjacentElement('afterend',bar);
  bindQuickbar();
}
function bindQuickbar(){
  document.getElementById('stdFillDurationCell')?.addEventListener('click',()=>fillSelected('duration'));
  document.getElementById('stdFillRateCell')?.addEventListener('click',()=>fillSelected('rate'));
  document.getElementById('stdFillDurationBlanks')?.addEventListener('click',()=>fillBlanks('duration'));
  document.getElementById('stdFillRateBlanks')?.addEventListener('click',()=>fillBlanks('rate'));
}
function preset(kind){return kind==='duration'?document.getElementById('stdDurationPreset')?.value||'1月':document.getElementById('stdRatePreset')?.value||'6%';}
function fillSelected(kind){
  const info=headerInfo(); if(!info||!activeCell){alert('請先點選一個標準範本中的儲存格。');return;}
  const idx=Array.from(activeCell.parentElement.children).indexOf(activeCell);
  const target=kind==='duration'?info.durationIndex:info.rateIndex;
  if(idx!==target){alert(kind==='duration'?'請先點選「期間」欄位的格子。':'請先點選「利率」欄位的格子。');return;}
  dispatchEdit(activeCell,preset(kind));
}
function fillBlanks(kind){
  const info=headerInfo(); if(!info)return;
  const target=kind==='duration'?info.durationIndex:info.rateIndex;
  if(target<0){alert(kind==='duration'?'找不到期間欄位。':'找不到利率欄位。');return;}
  const value=preset(kind);
  let count=0;
  info.table.querySelectorAll('tbody tr').forEach(row=>{
    const cell=cellAt(row,target);
    if(cell && cell.matches('td') && !cell.classList.contains('readonly') && isBlank(cell)){
      dispatchEdit(cell,value); count++;
    }
  });
  alert(`已補齊 ${count} 個空白${kind==='duration'?'期間':'利率'}欄位。`);
}
function markShortcutCells(){
  const info=headerInfo(); if(!info)return;
  info.table.querySelectorAll('tbody tr').forEach(row=>{
    const d=cellAt(row,info.durationIndex), r=cellAt(row,info.rateIndex);
    if(d&&d.matches('td'))decorateShortcutCell(d,'duration');
    if(r&&r.matches('td'))decorateShortcutCell(r,'rate');
  });
}
function decorateShortcutCell(cell,kind){
  if(cell.dataset.shortcutReady==='1')return;
  cell.dataset.shortcutReady='1';
  cell.dataset.shortcutKind=kind;
  cell.classList.add('shortcut-cell');
  cell.setAttribute('data-shortcut-label',kind==='duration'?'期間選單':'利率選單');
  cell.addEventListener('click',()=>{activeCell=cell;cell.closest('table')?.querySelectorAll('.active-quick-cell').forEach(x=>x.classList.remove('active-quick-cell'));cell.classList.add('active-quick-cell');});
  cell.addEventListener('dblclick',ev=>{ev.preventDefault();showMenu(cell,kind);});
  cell.addEventListener('keydown',ev=>{if((ev.altKey&&ev.key==='ArrowDown')||ev.key==='F4'){ev.preventDefault();showMenu(cell,kind);}});
}
function showMenu(cell,kind){
  closeMenu();
  const options=kind==='duration'?PERIOD_OPTIONS:RATE_OPTIONS;
  menu=document.createElement('div');
  menu.className='std-shortcut-menu';
  menu.innerHTML=`<div class="std-shortcut-menu-title">${kind==='duration'?'選擇期間':'選擇利率'}</div>${options.map(v=>`<button type="button" data-value="${v}">${v}</button>`).join('')}<button type="button" class="custom" data-value="__custom">自訂輸入…</button>`;
  document.body.appendChild(menu);
  const rect=cell.getBoundingClientRect();
  menu.style.left=Math.min(rect.left,window.innerWidth-220)+'px';
  menu.style.top=Math.min(rect.bottom+4,window.innerHeight-260)+'px';
  menu.addEventListener('click',ev=>{
    const btn=ev.target.closest('button'); if(!btn)return;
    let value=btn.dataset.value;
    if(value==='__custom'){
      value=prompt(kind==='duration'?'請輸入期間，例如 45天、2月':'請輸入利率，例如 7.5% 或 7.5',cell.textContent.trim());
      if(value==null)return;
      if(kind==='rate'&&!/%$/.test(value.trim()))value=value.trim()+'%';
    }
    dispatchEdit(cell,value);
    closeMenu();
  });
  setTimeout(()=>document.addEventListener('click',outsideClose,{once:true}),0);
}
function outsideClose(ev){if(menu&&!menu.contains(ev.target))closeMenu();}
function closeMenu(){if(menu){menu.remove();menu=null;}}
function optimizeLayout(panel){
  panel.classList.add('standard-template-optimized');
  const scroll=panel.querySelector('.std-scroll');
  if(scroll && !scroll.dataset.optimizeHint){
    scroll.dataset.optimizeHint='1';
    const tip=document.createElement('div');
    tip.className='std-table-tip';
    tip.textContent='提示：雙擊期間／利率欄可開啟快捷選單，Alt + ↓ 也可以開啟。';
    scroll.insertAdjacentElement('beforebegin',tip);
  }
}
function enhance(){
  const panel=$('.standard-template-panel');
  const table=$('.standard-template-table');
  if(!panel||!table)return;
  buildQuickbar(panel);
  optimizeLayout(panel);
  markShortcutCells();
}
const mo=new MutationObserver(()=>enhance());
document.addEventListener('DOMContentLoaded',()=>{
  enhance();
  mo.observe(document.body,{childList:true,subtree:true});
});
})();
