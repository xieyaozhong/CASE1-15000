(function(){
'use strict';
const $=id=>document.getElementById(id);
const $$=sel=>Array.from(document.querySelectorAll(sel));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const money=n=>Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});
function cell(tr,key){return tr.querySelector(`td[data-key="${key}"]`)}
function txt(tr,key){return (cell(tr,key)?.textContent||'').trim()}
function toNum(v){const raw=String(v??'').replace(/[,$，%％\s]/g,'');if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null}
function dateOnly(v){const s=String(v??'').trim().replace(/\//g,'-').replace(/\./g,'-');if(!s)return'';if(window.SettlementCore?.dateOnly)return window.SettlementCore.dateOnly(s)||'';const d=new Date(`${s}T00:00:00`);if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseDuration(v){const s=String(v??'').trim();if(!s)return null;const m=s.match(/(\d+)/);if(!m)return null;const value=Number(m[1]);if(!Number.isInteger(value)||value<=0)return null;const unit=/天|日|day|d/i.test(s)?'day':'month';return{value,unit}}
function markCell(td,level,msg){if(!td)return;td.classList.remove('ok','warn','error');td.classList.add(level);td.dataset.prompt=msg;td.title=msg;}
function clearMasterMarks(){ $$('#standardTemplateTable td.master-blocked').forEach(td=>td.classList.remove('master-blocked')); }
function readStandardRows(){clearMasterMarks();const trs=$$('#standardTemplateTable tbody tr');const errors=[],warnings=[],rows=[];trs.forEach((tr,index)=>{const rowNo=index+1;const row={date:txt(tr,'date'),project:txt(tr,'project'),source:txt(tr,'source'),caseAmount:txt(tr,'caseAmount'),participationTotal:txt(tr,'participationTotal'),investor:txt(tr,'investor'),amount:txt(tr,'amount'),duration:txt(tr,'duration'),rate:txt(tr,'rate'),netProfit:txt(tr,'netProfit'),maturityDate:txt(tr,'maturityDate'),note:txt(tr,'note')};const empty=Object.values(row).every(v=>!String(v||'').trim());if(empty)return;const required=[['date','日期'],['project','投資案'],['investor','投資人'],['amount','參與金額'],['duration','期間'],['rate','利率']];for(const [key,label] of required){if(!row[key]){const msg=`第 ${rowNo} 列缺少${label}`;errors.push(msg);markCell(cell(tr,key),'error',`必填：請補上${label}`);}}
const start=dateOnly(row.date);if(row.date&&!start){errors.push(`第 ${rowNo} 列日期格式錯誤`);markCell(cell(tr,'date'),'error','格式錯：日期請用 YYYY-MM-DD');}
const amount=toNum(row.amount);if(row.amount&&(amount==null||amount<=0)){errors.push(`第 ${rowNo} 列參與金額需大於 0`);markCell(cell(tr,'amount'),'error','格式錯：請輸入大於 0 的數字');}
const duration=parseDuration(row.duration);if(row.duration&&!duration){errors.push(`第 ${rowNo} 列期間格式錯誤`);markCell(cell(tr,'duration'),'error','格式錯：請填 1月、30天 這類格式');}
let rate=toNum(row.rate);if(row.rate&&(rate==null||rate<0)){errors.push(`第 ${rowNo} 列利率格式錯誤`);markCell(cell(tr,'rate'),'error','格式錯：請填 6 或 6%');}
if(rate!=null&&rate>0&&rate<=1)rate*=100;
let profit=toNum(row.netProfit);if(row.netProfit&&(profit==null||profit<0)){warnings.push(`第 ${rowNo} 列淨收益格式需確認`);markCell(cell(tr,'netProfit'),'warn','建議：請填 0 以上數字，或留空讓系統估算');}
if(!row.netProfit&&amount!=null&&rate!=null){profit=Number((amount*rate/100).toFixed(2));warnings.push(`第 ${rowNo} 列淨收益空白，將依參與金額 × 利率估算為 ${money(profit)}`);}
if(!row.maturityDate)warnings.push(`第 ${rowNo} 列到期日空白，將由開始日 + 期間自動計算`);
if(!row.source)warnings.push(`第 ${rowNo} 列案源空白`);
if(!errors.length||true){if(start&&amount!=null&&amount>0&&duration&&rate!=null){rows.push({
 investor_name:row.investor,
 project_name:row.project,
 amount,
 start_date:start,
 duration_value:duration.value,
 duration_unit:duration.unit,
 interest_rate:rate,
 net_profit:profit==null?0:profit,
 note:[row.note,`標準範本第 ${rowNo} 列`,row.source?`案源：${row.source}`:'',row.caseAmount?`案件金額：${row.caseAmount}`:'',row.participationTotal?`參與總額：${row.participationTotal}`:''].filter(Boolean).join('；'),
 _import_source:{provider:'standard-template',file_name:'CASE1-15000 標準範本',sheet_name:'標準範本',source_ref:`STD-${rowNo}-${row.date}-${row.project}-${row.investor}`,fingerprint:[row.date,row.project,row.investor,amount,duration.value,duration.unit,rate,profit||0].join('|')}
});}}
});return{rows,errors,warnings,total:trs.length};}
function ensureNotice(){let el=$('standardMasterNotice');if(el)return el;const std=$('standardTemplatePanel');el=document.createElement('div');el.id='standardMasterNotice';el.className='standard-master-notice';el.innerHTML='<strong>標準表格主流程</strong><span>一鍵作業會先讀取上方標準範本表格，再寫入投資明細與結算。</span>';if(std)std.insertBefore(el,std.firstChild);return el;}
function setNotice(type,msg){const el=ensureNotice();el.className=`standard-master-notice ${type||''}`;el.innerHTML=`<strong>${type==='error'?'請先補齊標準表格':type==='ok'?'標準表格已完成':'標準表格主流程'}</strong><span>${esc(msg)}</span>`;}
function focusFirstProblem(){const td=document.querySelector('#standardTemplateTable td.error, #standardTemplateTable td.warn');if(td){td.classList.add('master-blocked');td.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});td.focus?.();}}
async function importFromStandard(){const parsed=readStandardRows();if(!parsed.rows.length){setNotice('error','標準表格沒有可轉入的完整資料列。');focusFirstProblem();throw new Error('標準表格沒有可轉入的完整資料列。');}
if(parsed.errors.length){setNotice('error',`目前有 ${parsed.errors.length} 個必填或格式問題，已標在表格內。`);focusFirstProblem();throw new Error(parsed.errors.slice(0,6).join('\n'));}
if(parsed.warnings.length){const ok=confirm(`標準表格有 ${parsed.warnings.length} 個建議補齊項目。\n\n${parsed.warnings.slice(0,8).join('\n')}\n\n仍要依目前標準表格繼續嗎？`);if(!ok)throw new Error('已取消標準表格轉入。');}
await window.LocalInvestmentDB.init();const result=await window.LocalInvestmentDB.importInvestments(parsed.rows);setNotice('ok',`已依標準表格轉入 ${result.imported.length} 筆，略過重複 ${result.duplicates.length} 筆。`);return result;}
async function runStandardSettlement(mode){if(!window.LocalInvestmentDB){alert('資料庫尚未載入');return;}try{const btn=mode==='daily'?$('dailyRunBtn'):$('settleBtn');if(btn)btn.disabled=true;await importFromStandard();const asOf=$('asOfDate')?.value||today();const due=window.LocalInvestmentDB.due(asOf);if(!due.length){alert('標準表格已寫入投資明細；目前沒有到期可結算資料。');window.dispatchEvent(new CustomEvent('local-manager-data-changed',{detail:{reason:'standard_master_no_due'}}));return;}
const ok=confirm(`以標準表格為準，截至 ${asOf} 找到 ${due.length} 筆到期資料。\n\n確定要執行一鍵結算嗎？`);if(!ok)return;const settled=await window.LocalInvestmentDB.settleDue(asOf);alert(`完成：已依標準表格結算 ${settled.entries.length} 筆到期資料。`);window.dispatchEvent(new CustomEvent('local-manager-data-changed',{detail:{reason:'standard_master_settled'}}));setTimeout(()=>location.reload(),250);}catch(err){if(err?.message&&!/已取消/.test(err.message))alert(err.message);}finally{const btn=mode==='daily'?$('dailyRunBtn'):$('settleBtn');if(btn)btn.disabled=false;}}
function relayout(){const std=$('standardTemplatePanel'),matrix=$('matrixWorkbookPanel'),hint=$('actionHint')||document.querySelector('.summary-strip');if(std&&hint&&std.previousElementSibling!==hint)hint.insertAdjacentElement('afterend',std);if(matrix&&std&&matrix.previousElementSibling!==std)std.insertAdjacentElement('afterend',matrix);if(std){std.classList.add('standard-primary-panel');ensureNotice();}if(matrix){matrix.classList.add('matrix-secondary-panel');const title=matrix.querySelector('.matrix-head h2');if(title&&!/下方參考/.test(title.textContent))title.textContent='下方參考匯入表：活頁簿1(1).xlsx';}const daily=$('dailyRunBtn'),settle=$('settleBtn');if(daily&&!daily.dataset.standardMaster){daily.dataset.standardMaster='1';daily.querySelector('span:last-child').textContent='標準表一鍵結算';daily.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();runStandardSettlement('daily');},true);}if(settle&&!settle.dataset.standardMaster){settle.dataset.standardMaster='1';settle.querySelector('span:last-child').textContent='依標準表結算';settle.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();runStandardSettlement('settle');},true);} }
function boot(){relayout();let tries=0;const timer=setInterval(()=>{relayout();if(++tries>20&&$('standardTemplatePanel'))clearInterval(timer);},250);new MutationObserver(()=>relayout()).observe(document.body,{childList:true,subtree:true});}
document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,300));
})();
