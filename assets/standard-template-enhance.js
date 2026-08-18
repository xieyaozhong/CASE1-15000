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

(function(){
'use strict';
const STORE='case1-latest-standard-settlement-result-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(Number(n||0));
const pct=n=>`${Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2})}%`;
const today=()=>new Date().toISOString().slice(0,10);
const $=sel=>document.querySelector(sel);
function injectStyle(){if(document.getElementById('settleSubtableStyle'))return;const style=document.createElement('style');style.id='settleSubtableStyle';style.textContent='.settlement-result-subtable{margin:12px;border:1px solid #9bc3a8;border-radius:12px;background:linear-gradient(180deg,#f4fff7 0%,#ffffff 72%);box-shadow:0 14px 36px rgba(24,92,55,.13);padding:12px;position:relative;z-index:12}.settle-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid #d6e7dc;padding-bottom:10px;margin-bottom:10px}.settle-eyebrow{display:inline-flex;background:#217346;color:#fff;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;margin-bottom:6px}.settle-head h2{margin:0;color:#185c37;font-size:19px}.settle-head p{margin:5px 0 0;color:#52675a;font-size:12px;line-height:1.5}.settle-actions{display:flex;gap:8px;flex-wrap:wrap}.settle-btn{border:1px solid #9bc3a8;background:#fff;color:#185c37;border-radius:6px;padding:7px 10px;font:inherit;font-size:12px;cursor:pointer}.settle-btn.primary{background:#217346;color:#fff;border-color:#217346;font-weight:700}.settle-kpis{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:9px;margin-bottom:10px}.settle-kpis div{background:#fff;border:1px solid #d5e6da;border-radius:8px;padding:10px 12px}.settle-kpis span{display:block;color:#66756b;font-size:12px;margin-bottom:3px}.settle-kpis strong{font-size:20px;color:#17291e}.settle-scroll{max-height:340px;overflow:auto;border:1px solid #cfddd4;border-radius:8px;background:#fff}.settle-table{border-collapse:separate;border-spacing:0;width:100%;min-width:1050px;font-size:12px}.settle-table th,.settle-table td{border-right:1px solid #dedede;border-bottom:1px solid #dedede;padding:6px 8px;height:31px;white-space:nowrap}.settle-table thead th{position:sticky;top:0;background:#dff0e5;color:#173f27;z-index:2;text-align:left;border-bottom:2px solid #9bc3a8}.settle-table tbody th,.settle-table tfoot th:first-child{background:#f3f3f3;text-align:center;color:#666}.settle-table .num{text-align:right}.settle-table .profit{color:#17613a;font-weight:700}.settle-table .total{color:#0e3f25;font-weight:800}.settle-table tfoot th,.settle-table tfoot td{position:sticky;bottom:0;background:#e2f0d9;font-weight:800}.settlement-result-subtable.collapsed .settle-kpis,.settlement-result-subtable.collapsed .settle-scroll{display:none}@media(max-width:760px){.settlement-result-subtable{margin:8px 0;border-radius:0}.settle-head{flex-direction:column}.settle-kpis{grid-template-columns:1fr 1fr}.settle-scroll{max-height:260px}}';document.head.appendChild(style);}
function dateOnly(v){const s=String(v??'').trim().replace(/\//g,'-').replace(/\./g,'-');if(!s)return'';if(window.SettlementCore?.dateOnly)return window.SettlementCore.dateOnly(s)||'';const d=new Date(`${s}T00:00:00`);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function toNum(v){const raw=String(v??'').replace(/[,$，%％\s]/g,'');if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function parseDuration(v){const s=String(v??'').trim();const m=s.match(/(\d+)/);if(!m)return null;const value=Number(m[1]);return Number.isInteger(value)&&value>0?{value,unit:/天|日|day|d/i.test(s)?'day':'month'}:null}
function td(tr,key){return tr.querySelector(`td[data-key="${key}"]`)}
function text(tr,key){return (td(tr,key)?.textContent||'').trim()}
function mark(tr,key,msg){const cell=td(tr,key);if(cell){cell.classList.remove('ok','warn');cell.classList.add('error','master-blocked');cell.dataset.prompt=msg;cell.title=msg;}}
function readStandardRows(){const rows=[],errors=[],warnings=[];document.querySelectorAll('#standardTemplateTable tbody tr').forEach((tr,i)=>{const rowNo=i+1;const data={date:text(tr,'date'),project:text(tr,'project'),source:text(tr,'source'),caseAmount:text(tr,'caseAmount'),participationTotal:text(tr,'participationTotal'),investor:text(tr,'investor'),amount:text(tr,'amount'),duration:text(tr,'duration'),rate:text(tr,'rate'),netProfit:text(tr,'netProfit'),note:text(tr,'note')};if(Object.values(data).every(v=>!v))return;let bad=false;[['date','日期'],['project','投資案'],['investor','投資人'],['amount','參與金額'],['duration','期間'],['rate','利率']].forEach(([k,label])=>{if(!data[k]){bad=true;errors.push(`第 ${rowNo} 列缺少${label}`);mark(tr,k,`必填：請補上${label}`)}});const start=dateOnly(data.date);if(data.date&&!start){bad=true;errors.push(`第 ${rowNo} 列日期格式錯誤`);mark(tr,'date','日期請用 YYYY-MM-DD')};const amount=toNum(data.amount);if(data.amount&&(amount==null||amount<=0)){bad=true;errors.push(`第 ${rowNo} 列參與金額需大於 0`);mark(tr,'amount','請輸入大於 0 的數字')};const duration=parseDuration(data.duration);if(data.duration&&!duration){bad=true;errors.push(`第 ${rowNo} 列期間格式錯誤`);mark(tr,'duration','請填 1月、30天 這類格式')};let rate=toNum(data.rate);if(data.rate&&(rate==null||rate<0)){bad=true;errors.push(`第 ${rowNo} 列利率格式錯誤`);mark(tr,'rate','請填 6 或 6%')};if(rate!=null&&rate>0&&rate<=1)rate*=100;let profit=toNum(data.netProfit);if(!data.netProfit&&amount!=null&&rate!=null){profit=Number((amount*rate/100).toFixed(2));warnings.push(`第 ${rowNo} 列淨收益空白，系統會估算 ${money(profit)}`)}if(!bad&&start&&amount!=null&&duration&&rate!=null){rows.push({investor_name:data.investor,project_name:data.project,amount,start_date:start,duration_value:duration.value,duration_unit:duration.unit,interest_rate:rate,net_profit:profit==null?0:profit,note:[data.note,`標準範本第 ${rowNo} 列`,data.source?`案源：${data.source}`:'',data.caseAmount?`案件金額：${data.caseAmount}`:'',data.participationTotal?`參與總額：${data.participationTotal}`:''].filter(Boolean).join('；'),_import_source:{provider:'standard-template',file_name:'CASE1-15000 標準範本',sheet_name:'標準範本',source_ref:`STD-${rowNo}-${data.date}-${data.project}-${data.investor}`,fingerprint:[data.date,data.project,data.investor,amount,duration.value,duration.unit,rate,profit||0].join('|')}})}});return{rows,errors,warnings};}
function ensurePanel(){injectStyle();let panel=document.getElementById('settlementResultSubtable');if(panel)return panel;panel=document.createElement('section');panel.id='settlementResultSubtable';panel.className='settlement-result-subtable';const anchor=document.querySelector('.formula-bar')||document.querySelector('.ribbon')||document.body.firstElementChild||document.body;anchor.insertAdjacentElement('afterend',panel);return panel;}
function renderSubtable(payload,store=true){const entries=Array.isArray(payload.entries)?payload.entries:[];const asOf=payload.asOf||payload.batch?.as_of_date||today();const principal=entries.reduce((s,e)=>s+Number(e.principal_amount||0),0);const profit=entries.reduce((s,e)=>s+Number(e.profit_amount||0),0);const total=principal+profit;const rows=entries.slice().sort((a,b)=>String(a.investor_name||'').localeCompare(String(b.investor_name||''),'zh-TW'));const panel=ensurePanel();panel.hidden=false;panel.innerHTML=`<div class="settle-head"><div><span class="settle-eyebrow">最新結算子表</span><h2>${esc(asOf)} 結算結果</h2><p>一鍵結算完成後自動產生，顯示本批本金、收益與本利合計。</p></div><div class="settle-actions"><button type="button" id="settleExportBtn" class="settle-btn primary">匯出本批子表</button><button type="button" id="settleHideBtn" class="settle-btn">收合</button></div></div><div class="settle-kpis"><div><span>結算筆數</span><strong>${rows.length}</strong></div><div><span>本金合計</span><strong>${money(principal)}</strong></div><div><span>結算收益</span><strong>${money(profit)}</strong></div><div><span>本利合計</span><strong>${money(total)}</strong></div></div><div class="settle-scroll"><table class="settle-table"><thead><tr><th>#</th><th>投資人</th><th>投資案</th><th>本金</th><th>利率</th><th>收益</th><th>本利合計</th><th>開始日</th><th>到期日</th></tr></thead><tbody>${rows.map((e,i)=>`<tr><th>${i+1}</th><td>${esc(e.investor_name)}</td><td>${esc(e.project_name)}</td><td class="num">${money(e.principal_amount)}</td><td class="num">${pct(e.interest_rate)}</td><td class="num profit">${money(e.profit_amount)}</td><td class="num total">${money(Number(e.principal_amount||0)+Number(e.profit_amount||0))}</td><td>${esc(e.start_date||'')}</td><td>${esc(e.maturity_date||'')}</td></tr>`).join('')}</tbody><tfoot><tr><th>Σ</th><th colspan="2">本批合計</th><th class="num">${money(principal)}</th><th></th><th class="num profit">${money(profit)}</th><th class="num total">${money(total)}</th><th colspan="2"></th></tr></tfoot></table></div>`;document.getElementById('settleHideBtn')?.addEventListener('click',()=>panel.classList.toggle('collapsed'));document.getElementById('settleExportBtn')?.addEventListener('click',()=>exportSubtable(rows,asOf,principal,profit,total));if(store){try{localStorage.setItem(STORE,JSON.stringify({entries,asOf,batch:payload.batch||null}))}catch(_){}}panel.scrollIntoView({behavior:'smooth',block:'start'});}
function exportSubtable(rows,asOf,principal,profit,total){if(!window.XLSX)return alert('XLSX 套件尚未載入');const aoa=[['投資人','投資案','本金','利率','收益','本利合計','開始日','到期日'],...rows.map(e=>[e.investor_name,e.project_name,Number(e.principal_amount||0),Number(e.interest_rate||0),Number(e.profit_amount||0),Number(e.principal_amount||0)+Number(e.profit_amount||0),e.start_date||'',e.maturity_date||'']),[],['本批合計','',principal,'',profit,total,'','']];const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:14},{wch:18},{wch:13},{wch:10},{wch:13},{wch:14},{wch:12},{wch:12}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'最新結算子表');XLSX.writeFile(wb,`結算子表_${asOf}.xlsx`)}
function firstProblem(){const el=document.querySelector('#standardTemplateTable td.error');if(el){el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});el.focus?.();}}
async function run(e){const btn=e.target.closest('#dailyRunBtn,#settleBtn');if(!btn)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();if(btn.disabled)return;btn.disabled=true;try{const parsed=readStandardRows();if(parsed.errors.length){alert(`標準表格還有 ${parsed.errors.length} 個必填或格式問題，請先補齊。\n\n${parsed.errors.slice(0,6).join('\n')}`);firstProblem();return}if(!parsed.rows.length){alert('標準表格沒有可結算的完整資料列。');return}if(parsed.warnings.length&&!confirm(`標準表格有 ${parsed.warnings.length} 個建議補齊項目。\n\n${parsed.warnings.slice(0,6).join('\n')}\n\n仍要繼續嗎？`))return;await window.LocalInvestmentDB.init();await window.LocalInvestmentDB.importInvestments(parsed.rows);const asOf=document.getElementById('asOfDate')?.value||today();const due=window.LocalInvestmentDB.due(asOf);if(!due.length){alert('標準表格已寫入投資明細；目前沒有到期可結算資料。');return}if(!confirm(`以標準表格為主，截至 ${asOf} 找到 ${due.length} 筆到期資料。\n\n確定要一鍵結算並產生最上方子表嗎？`))return;const settled=await window.LocalInvestmentDB.settleDue(asOf);renderSubtable({entries:settled.entries,batch:settled.batch,asOf});window.dispatchEvent(new CustomEvent('local-manager-data-changed',{detail:{reason:'standard_settlement_subtable',settled}}));}catch(err){alert(err.message||'結算失敗')}finally{btn.disabled=false;}}
function restore(){try{const stored=JSON.parse(localStorage.getItem(STORE)||'null');if(stored?.entries?.length)renderSubtable(stored,false)}catch(_){}}
document.addEventListener('click',run,true);document.addEventListener('DOMContentLoaded',()=>setTimeout(restore,800));
})();
