(function(){
'use strict';
const KEY='case1-latest-settlement-subtable-v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(Number(n||0));
const pct=n=>`${Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2})}%`;
function normalize(payload){
  const batch=payload?.batch||null;
  const entries=Array.isArray(payload?.entries)?payload.entries:[];
  const asOf=payload?.asOf||batch?.as_of_date||new Date().toISOString().slice(0,10);
  const createdAt=payload?.createdAt||new Date().toISOString();
  const principal=entries.reduce((s,e)=>s+Number(e.principal_amount||0),0);
  const profit=entries.reduce((s,e)=>s+Number(e.profit_amount||0),0);
  const total=principal+profit;
  return {batch,entries,asOf,createdAt,principal,profit,total};
}
function anchor(){
  return document.querySelector('.formula-bar')||document.querySelector('.ribbon')||document.body.firstElementChild||document.body;
}
function ensure(){
  let panel=$('settlementResultSubtable');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='settlementResultSubtable';
  panel.className='settlement-result-subtable';
  anchor().insertAdjacentElement('afterend',panel);
  return panel;
}
function render(payload,options={}){
  const data=normalize(payload);
  const panel=ensure();
  const rows=data.entries.slice().sort((a,b)=>String(a.investor_name||'').localeCompare(String(b.investor_name||''),'zh-TW')||String(a.project_name||'').localeCompare(String(b.project_name||''),'zh-TW'));
  panel.hidden=false;
  panel.innerHTML=`
    <div class="settle-head">
      <div>
        <span class="settle-eyebrow">最新結算子表</span>
        <h2>${esc(data.asOf)} 結算結果</h2>
        <p>一鍵結算完成後自動產生。本表顯示本批結算本金、收益與本利合計。</p>
      </div>
      <div class="settle-actions">
        <button type="button" id="settleExportBtn" class="settle-btn primary">匯出本批子表</button>
        <button type="button" id="settleHideBtn" class="settle-btn">收合</button>
      </div>
    </div>
    <div class="settle-kpis">
      <div><span>結算筆數</span><strong>${rows.length}</strong></div>
      <div><span>本金合計</span><strong>${money(data.principal)}</strong></div>
      <div><span>結算收益</span><strong>${money(data.profit)}</strong></div>
      <div><span>本利合計</span><strong>${money(data.total)}</strong></div>
    </div>
    <div class="settle-scroll">
      <table class="settle-table">
        <thead><tr><th>#</th><th>投資人</th><th>投資案</th><th>本金</th><th>利率</th><th>收益</th><th>本利合計</th><th>開始日</th><th>到期日</th><th>付款狀態</th></tr></thead>
        <tbody>${rows.length?rows.map((e,i)=>`<tr><th>${i+1}</th><td>${esc(e.investor_name)}</td><td>${esc(e.project_name)}</td><td class="num">${money(e.principal_amount)}</td><td class="num">${pct(e.interest_rate)}</td><td class="num profit">${money(e.profit_amount)}</td><td class="num total">${money(Number(e.principal_amount||0)+Number(e.profit_amount||0))}</td><td>${esc(e.start_date||'')}</td><td>${esc(e.maturity_date||'')}</td><td>${esc(e.payout_status==='paid'?'已付款':'待付款')}</td></tr>`).join(''):`<tr><td colspan="10" class="empty">這次沒有結算明細</td></tr>`}</tbody>
        <tfoot><tr><th>Σ</th><th colspan="2">本批合計</th><th class="num">${money(data.principal)}</th><th></th><th class="num profit">${money(data.profit)}</th><th class="num total">${money(data.total)}</th><th colspan="3"></th></tr></tfoot>
      </table>
    </div>`;
  $('settleHideBtn')?.addEventListener('click',()=>panel.classList.toggle('collapsed'));
  $('settleExportBtn')?.addEventListener('click',()=>exportSubtable(data));
  if(!options.skipStore){try{localStorage.setItem(KEY,JSON.stringify({batch:data.batch,entries:data.entries,asOf:data.asOf,createdAt:data.createdAt}));}catch(_){}}
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function exportSubtable(data){
  if(!window.XLSX)return alert('XLSX 套件尚未載入');
  const aoa=[['投資人','投資案','本金','利率','收益','本利合計','開始日','到期日','付款狀態'],...data.entries.map(e=>[e.investor_name,e.project_name,Number(e.principal_amount||0),Number(e.interest_rate||0),Number(e.profit_amount||0),Number(e.principal_amount||0)+Number(e.profit_amount||0),e.start_date||'',e.maturity_date||'',e.payout_status==='paid'?'已付款':'待付款']),[],['本批合計','',data.principal,'',data.profit,data.total,'','','']];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:14},{wch:18},{wch:13},{wch:10},{wch:13},{wch:14},{wch:12},{wch:12},{wch:10}];
  ws['!freeze']={xSplit:0,ySplit:1};
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(1,data.entries.length),c:8}})};
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'最新結算子表');
  XLSX.writeFile(wb,`結算子表_${data.asOf}.xlsx`);
}
function restore(){
  try{
    const stored=JSON.parse(localStorage.getItem(KEY)||'null');
    if(stored&&Array.isArray(stored.entries)&&stored.entries.length)render(stored,{skipStore:true});
  }catch(_){ }
}
window.SettlementResultSubtable={render,restore};
document.addEventListener('DOMContentLoaded',()=>setTimeout(restore,450));
})();
