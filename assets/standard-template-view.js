(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const columns=[
  {key:'date',title:'日期',type:'date',required:true,prompt:'必填：投資日期，例如 2025-08-18'},
  {key:'project',title:'投資案',required:true,prompt:'必填：填入案件或投資案名稱'},
  {key:'source',title:'案源',prompt:'建議填寫：來源或介紹人'},
  {key:'caseAmount',title:'案件金額',type:'number',prompt:'建議填寫：整個案件總金額'},
  {key:'participationTotal',title:'參與總額',type:'number',prompt:'建議填寫：本案所有投資人合計'},
  {key:'investor',title:'投資人',required:true,prompt:'必填：投資人姓名'},
  {key:'amount',title:'參與金額',type:'number',required:true,prompt:'必填：此投資人的參與金額'},
  {key:'duration',title:'期間',required:true,prompt:'必填：例如 1月、30天'},
  {key:'rate',title:'利率',type:'number',required:true,prompt:'必填：例如 6 代表 6%'},
  {key:'netProfit',title:'淨收益',type:'number',prompt:'建議填寫：可依本金 × 利率計算'},
  {key:'maturityDate',title:'到期日',type:'date',prompt:'建議填寫：例如 2025-09-18'},
  {key:'note',title:'備註',prompt:'可選填：回款、扣款、特殊說明'},
  {key:'status',title:'資料狀態',readonly:true,prompt:'系統自動檢查'}
];
function cellText(td){return (td?.textContent||'').trim()}
function toNum(v){const s=String(v??'').replace(/[,$，%％\s]/g,'');if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null}
function validDate(v){if(!String(v||'').trim())return false;const d=new Date(String(v).replace(/\//g,'-')+'T00:00:00');return !Number.isNaN(d.getTime())}
function parseMatrix(){const table=$('matrixTable');if(!table)return [];
  const trs=[...table.querySelectorAll('tbody tr')];if(trs.length<2)return [];
  const head=[...trs[0].querySelectorAll('td')].map(cellText);
  const participantCols=[];
  for(let c=5;c<=13;c++){const name=head[c];if(name)participantCols.push({col:c,name});}
  const out=[];
  for(let r=1;r<trs.length;r++){
    const tds=[...trs[r].querySelectorAll('td')];
    if(!tds.length)continue;
    const base={date:cellText(tds[0]),project:cellText(tds[1]),source:cellText(tds[2]),caseAmount:cellText(tds[3]),participationTotal:cellText(tds[4]),note:cellText(tds[14]),sourceRow:r+1};
    let made=false;
    for(const p of participantCols){const amount=cellText(tds[p.col]);if(amount){out.push({...base,investor:p.name,amount,duration:'',rate:'',netProfit:'',maturityDate:''});made=true;}}
    if(!made && Object.values(base).some(v=>String(v||'').trim()))out.push({...base,investor:'',amount:'',duration:'',rate:'',netProfit:'',maturityDate:''});
  }
  return out;
}
function validateRow(row){const problems=[];
  for(const col of columns){if(col.readonly)continue;const v=String(row[col.key]??'').trim();
    if(col.required && !v)problems.push({key:col.key,level:'error',msg:col.prompt});
    else if(v && col.type==='number' && (toNum(v)==null || toNum(v)<0))problems.push({key:col.key,level:'error',msg:'格式錯：請輸入 0 以上數字'});
    else if(v && col.type==='date' && !validDate(v))problems.push({key:col.key,level:'error',msg:'格式錯：日期請用 YYYY-MM-DD'});
  }
  const warnKeys=['caseAmount','participationTotal','netProfit','maturityDate','source'];
  for(const key of warnKeys){if(!String(row[key]??'').trim()){const col=columns.find(c=>c.key===key);problems.push({key,level:'warn',msg:col.prompt});}}
  return problems;
}
function stamp(row){const issues=validateRow(row);const errors=issues.filter(x=>x.level==='error').length;const warns=issues.filter(x=>x.level==='warn').length;return errors?`缺 ${errors} 個必填`:(warns?`建議補 ${warns} 格`:'完整');}
function buildPanel(){if($('standardTemplatePanel'))return $('standardTemplatePanel');const panel=document.createElement('section');panel.id='standardTemplatePanel';panel.className='standard-template-panel';panel.innerHTML=`<div class="std-head"><div><h2>完整標準範本表格</h2><p>系統會把匯入資料轉成固定欄位；缺項保持空白，並用顏色提示該填什麼。</p></div><div class="std-actions"><button id="stdRefreshBtn" class="std-btn">重新產生</button><button id="stdBlankBtn" class="std-btn">下載空白範本</button><button id="stdExportBtn" class="std-btn primary">匯出目前範本</button></div></div><div id="stdLegend" class="std-legend"><span class="std-dot error"></span>紅色＝必填缺漏或格式錯 <span class="std-dot warn"></span>黃色＝建議補齊 <span class="std-dot ok"></span>綠色＝可匯入</div><div id="stdSummary" class="std-summary">等待矩陣資料</div><div class="std-scroll"><table id="standardTemplateTable" class="standard-template-table"></table></div>`;
  const anchor=$('matrixWorkbookPanel')||document.querySelector('.summary-strip')||document.body;anchor.insertAdjacentElement('afterend',panel);return panel;
}
function render(){buildPanel();const rows=parseMatrix();const table=$('standardTemplateTable');let error=0,warn=0,ok=0;
  table.innerHTML=`<thead><tr><th>#</th>${columns.map(c=>`<th>${esc(c.title)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>{const issues=validateRow(row);if(issues.some(x=>x.level==='error'))error++;else if(issues.length){warn++;}else ok++;row.status=stamp(row);const issueByKey=new Map(issues.map(x=>[x.key,x]));return `<tr data-row="${i}"><th>${i+1}</th>${columns.map(col=>{const issue=issueByKey.get(col.key);const value=col.key==='status'?row.status:(row[col.key]??'');const cls=col.readonly?'readonly':(issue?issue.level:'ok');const prompt=issue?.msg||col.prompt||'';return `<td contenteditable="${col.readonly?'false':'true'}" data-key="${col.key}" data-prompt="${esc(prompt)}" class="${cls}" title="${esc(prompt)}">${esc(value)}</td>`}).join('')}</tr>`}).join('')}</tbody>`;
  $('stdSummary').innerHTML=`共 ${rows.length} 筆標準列｜<strong class="std-error">${error}</strong> 筆有必填錯誤｜<strong class="std-warn">${warn}</strong> 筆建議補齊｜<strong class="std-ok">${ok}</strong> 筆完整`;
  table.querySelectorAll('td[contenteditable="true"]').forEach(td=>td.addEventListener('input',()=>refreshRow(td.closest('tr'))));
}
function rowObj(tr){const obj={};tr.querySelectorAll('td[data-key]').forEach(td=>{const key=td.dataset.key;if(key!=='status')obj[key]=td.textContent.trim();});return obj;}
function refreshRow(tr){const row=rowObj(tr),issues=validateRow(row),issueByKey=new Map(issues.map(x=>[x.key,x]));tr.querySelectorAll('td[data-key]').forEach(td=>{const key=td.dataset.key;if(key==='status'){td.textContent=stamp(row);td.className='readonly';return;}const issue=issueByKey.get(key);td.className=issue?issue.level:'ok';td.dataset.prompt=issue?.msg||columns.find(c=>c.key===key)?.prompt||'';td.title=td.dataset.prompt;});updateSummaryFromDom();}
function updateSummaryFromDom(){let error=0,warn=0,ok=0;document.querySelectorAll('#standardTemplateTable tbody tr').forEach(tr=>{if(tr.querySelector('td.error'))error++;else if(tr.querySelector('td.warn'))warn++;else ok++;});$('stdSummary').innerHTML=`共 ${error+warn+ok} 筆標準列｜<strong class="std-error">${error}</strong> 筆有必填錯誤｜<strong class="std-warn">${warn}</strong> 筆建議補齊｜<strong class="std-ok">${ok}</strong> 筆完整`;}
function rowsFromTemplate(){return [...document.querySelectorAll('#standardTemplateTable tbody tr')].map(tr=>columns.filter(c=>c.key!=='status').map(c=>tr.querySelector(`td[data-key="${c.key}"]`)?.textContent.trim()||''));}
function makeWorkbook(rows,blank){if(!window.XLSX)return alert('XLSX 套件尚未載入');const headers=columns.filter(c=>c.key!=='status').map(c=>c.title);const aoa=[headers,...rows];const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=headers.map(h=>({wch:Math.max(12,h.length*2+4)}));ws['!freeze']={xSplit:0,ySplit:1};ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(1,aoa.length-1),c:headers.length-1}})};
  for(let c=0;c<headers.length;c++){const col=columns[c];const addr=XLSX.utils.encode_cell({r:0,c});if(ws[addr])ws[addr].c=[{t:col.required?`必填欄位：${col.prompt}`:`${col.prompt||'可選填'}`,a:'CASE1'}];}
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'標準範本');XLSX.writeFile(wb,`${blank?'投資資料_空白標準範本':'投資資料_標準範本'}_${today()}.xlsx`);}
function exportCurrent(){const rows=rowsFromTemplate();if(!rows.length)return alert('目前沒有標準範本資料。');makeWorkbook(rows,false);}
function exportBlank(){const empty=Array.from({length:10},()=>columns.filter(c=>c.key!=='status').map(()=>''));makeWorkbook(empty,true);}
function start(){render();$('stdRefreshBtn')?.addEventListener('click',render);$('stdExportBtn')?.addEventListener('click',exportCurrent);$('stdBlankBtn')?.addEventListener('click',exportBlank);const matrix=$('matrixTable');if(matrix){new MutationObserver(()=>{clearTimeout(window.__stdRender);window.__stdRender=setTimeout(render,250);}).observe(matrix,{childList:true,subtree:true,characterData:true});}}
document.addEventListener('DOMContentLoaded',()=>setTimeout(start,120));
})();
