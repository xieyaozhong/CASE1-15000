(() => {
  'use strict';

  const SPLIT_KEY='case1-broker-split-v1';
  const RETURN_KEY='case1-per-case-returns-v1';
  const BROKER='仲介費';
  const CYCLE='週期';
  const RECENT='最近結算日';
  const LEGACY_PROJECT='起租案名/同仁';
  const SYSTEM_COLUMNS=new Set(['狀態','完成日','持續時間','備註']);
  const bridge=window.LedgerSchemaBridge;
  const $=s=>document.querySelector(s);
  const clean=v=>String(v ?? '').trim();
  const num=v=>{
    if(typeof v==='number') return Number.isFinite(v)?v:0;
    const n=Number(String(v ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n)?n:0;
  };
  const clampPct=v=>Math.max(0,Math.min(100,num(v)));
  const money=v=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(num(v));
  const compact=v=>{
    const n=num(v);
    return Number.isInteger(n)?String(n):String(Number(n.toFixed(4)));
  };
  let splitCache=null;
  let splitSaveTimer=0;
  let decorateRaf=0;
  let mainRaf=0;

  function canonical(){ return bridge?.readCanonical?.(); }

  function virtualState(){
    try{
      const state=JSON.parse(localStorage.getItem('case1-excel-ledger-v1'));
      return state && Array.isArray(state.headers) && Array.isArray(state.rows) ? state : null;
    }catch(_){ return null; }
  }

  function readSplits(){
    if(splitCache) return splitCache;
    try{
      const data=JSON.parse(localStorage.getItem(SPLIT_KEY));
      splitCache=data && typeof data==='object' ? data : {};
    }catch(_){ splitCache={}; }
    return splitCache;
  }

  function persistSplits(){
    clearTimeout(splitSaveTimer);
    splitSaveTimer=0;
    if(!splitCache) return;
    localStorage.setItem(SPLIT_KEY,JSON.stringify(splitCache));
    const state=$('#saveState');
    if(state) state.textContent='已自動儲存';
  }

  function scheduleSplitSave(){
    const state=$('#saveState');
    if(state) state.textContent='儲存中…';
    clearTimeout(splitSaveTimer);
    splitSaveTimer=setTimeout(persistSplits,220);
  }

  function investorColumns(headers){
    const start=headers.indexOf('參與總額')+1;
    if(start<=0) return [];
    const end=headers.findIndex((h,i)=>i>=start && SYSTEM_COLUMNS.has(h));
    return headers.slice(start,end<0?headers.length:end).filter(Boolean);
  }

  function profitBaseKey(row){
    return [
      clean(row?.['日期']),clean(row?.[LEGACY_PROJECT]),clean(row?.['案源']),clean(row?.['案件金額']),
      clean(row?.['完成日']),clean(row?.['備註'])
    ].join('|');
  }

  function splitBaseKey(row){
    return [
      clean(row?.['日期']),clean(row?.[LEGACY_PROJECT]),clean(row?.['案源']),clean(row?.['撥款人']),
      clean(row?.['案件金額']),clean(row?.['參與總額']),clean(row?.['備註'])
    ].join('|');
  }

  function splitKeysByRow(state){
    const counts=new Map();
    return state.rows.map(row=>{
      const base=splitBaseKey(row);
      const occurrence=(counts.get(base)||0)+1;
      counts.set(base,occurrence);
      return `${base}#${occurrence}`;
    });
  }

  function normalizeBrokerDefaults(){
    const state=canonical();
    if(!state?.rows) return;
    let changed=false;
    state.rows.forEach(row=>{
      if(row[BROKER]==='' || row[BROKER]==null || !Number.isFinite(Number(row[BROKER]))){
        row[BROKER]=0;
        changed=true;
      }else{
        const next=clampPct(row[BROKER]);
        if(Number(row[BROKER])!==next){ row[BROKER]=next; changed=true; }
      }
    });
    if(changed) bridge?.rawSetState?.(state);
  }

  function getSplit(store,key,brokerTotal){
    const total=clampPct(brokerTotal);
    const raw=store[key];
    if(!raw || typeof raw!=='object') return {company:0,referrer:total,total};
    let company=clampPct(raw.company);
    let referrer=clampPct(raw.referrer);
    const sum=company+referrer;
    if(sum>100){
      const factor=100/sum;
      company*=factor;
      referrer*=factor;
    }
    return {company,referrer,total:company+referrer};
  }

  function setSplit(key,company,referrer){
    const store=readSplits();
    company=clampPct(company);
    referrer=clampPct(referrer);
    if(company+referrer>100) referrer=Math.max(0,100-company);
    store[key]={company,referrer};
    scheduleSplitSave();
    return {company,referrer,total:company+referrer};
  }

  function scaleSplitToTotal(key,total){
    total=clampPct(total);
    const store=readSplits();
    const current=store[key];
    if(!current || typeof current!=='object'){
      store[key]={company:0,referrer:total};
    }else{
      const company=clampPct(current.company);
      const referrer=clampPct(current.referrer);
      const sum=company+referrer;
      if(total===0) store[key]={company:0,referrer:0};
      else if(sum>0) store[key]={company:total*(company/sum),referrer:total*(referrer/sum)};
      else store[key]={company:0,referrer:total};
    }
    scheduleSplitSave();
  }

  function settlementMap(){
    const state=canonical();
    const virtual=virtualState();
    const start=$('#rangeStart')?.value||'';
    const end=$('#rangeEnd')?.value||'';
    const map=new Map();
    const groups=new Map();
    if(!state?.rows || !virtual?.headers || !start || !end || end<start) return {map,groups,start,end,state};
    const investors=investorColumns(virtual.headers);
    const profitCounts=new Map();
    const splitRowKeys=splitKeysByRow(state);

    state.rows.forEach((row,rowIndex)=>{
      const recent=clean(row?.['完成日']);
      if(!recent || recent<start || recent>end) return;
      const pbase=profitBaseKey(row);
      const occurrence=(profitCounts.get(pbase)||0)+1;
      profitCounts.set(pbase,occurrence);
      const caseKey=`${pbase}#${occurrence}`;
      const splitKey=splitRowKeys[rowIndex];
      investors.forEach(investor=>{
        const invested=num(row?.[investor]);
        if(invested<=0) return;
        const key=`${caseKey}|${investor}`;
        const item={
          key,splitKey,rowIndex,investor,invested,
          project:clean(row?.[LEGACY_PROJECT])||'未命名投資案',source:clean(row?.['案源']),payer:clean(row?.['撥款人']),
          recent,cycle:clean(row?.[CYCLE]),caseAmount:num(row?.['案件金額']),broker:clampPct(row?.[BROKER])
        };
        map.set(key,item);
        if(!groups.has(investor)) groups.set(investor,[]);
        groups.get(investor).push(item);
      });
    });
    return {map,groups,start,end,state};
  }

  function readReturnStore(){
    try{
      const data=JSON.parse(localStorage.getItem(RETURN_KEY));
      return data && typeof data==='object' ? data : {};
    }catch(_){ return {}; }
  }

  function returnSetting(item,store,live){
    if(live?.has(item.key)) return live.get(item.key);
    const raw=store[item.key];
    if(!raw || typeof raw!=='object') return {rate:6,amount:item.invested*.06};
    if(raw.basis==='amount'){
      const amount=Math.max(0,num(raw.amount));
      return {amount,rate:item.invested>0?amount/item.invested*100:0};
    }
    const rate=Math.max(0,num(raw.rate??6));
    return {rate,amount:item.invested*rate/100};
  }

  function liveReturnSettings(){
    const map=new Map();
    document.querySelectorAll('.per-case-profit-table tbody tr[data-profit-key]').forEach(tr=>{
      map.set(tr.dataset.profitKey,{
        rate:Math.max(0,num(tr.querySelector('.case-rate-input')?.value)),
        amount:Math.max(0,num(tr.querySelector('.case-amount-input')?.value))
      });
    });
    return map;
  }

  function commissionMath(grossRate,grossAmount,split){
    const companyAmount=grossAmount*split.company/100;
    const referrerAmount=grossAmount*split.referrer/100;
    const netAmount=Math.max(0,grossAmount-companyAmount-referrerAmount);
    const netRate=Math.max(0,grossRate*(1-split.total/100));
    return {companyAmount,referrerAmount,netAmount,netRate};
  }

  function syncCanonicalBroker(rowIndex,total){
    bridge?.setBusinessByIndex?.(rowIndex,BROKER,clampPct(total));
    const mainInput=$(`#sheetGrid [data-row="${rowIndex}"][data-header="${BROKER}"]`);
    if(mainInput) mainInput.value=compact(clampPct(total));
  }

  function mainBrokerChanged(rowIndex,total){
    const state=canonical();
    if(!state?.rows?.[rowIndex]) return;
    const keys=splitKeysByRow(state);
    const key=keys[rowIndex];
    if(!key) return;
    total=clampPct(total);
    bridge?.setBusinessByIndex?.(rowIndex,BROKER,total);
    scaleSplitToTotal(key,total);
    scheduleDecorate();
  }

  function decorateMainBroker(){
    mainRaf=0;
    const state=canonical();
    const table=$('#sheetGrid');
    if(!state?.rows || !table) return;
    table.querySelectorAll(`[data-header="${BROKER}"]`).forEach(input=>{
      if(!(input instanceof HTMLInputElement)) return;
      const rowIndex=Number(input.dataset.row);
      if(!Number.isFinite(rowIndex) || !state.rows[rowIndex]) return;
      const value=clampPct(state.rows[rowIndex][BROKER]);
      input.type='number';
      input.min='0';
      input.max='100';
      input.step='0.01';
      input.inputMode='decimal';
      input.value=compact(value);
      input.placeholder='0';
      input.title='從投資人原始獲利中抽成的比例，預設 0%';
      const td=input.closest('td');
      if(td) td.classList.add('broker-percent-cell');
      if(!input.dataset.commissionBound){
        input.dataset.commissionBound='1';
        input.addEventListener('change',()=>{
          const next=clampPct(input.value);
          input.value=compact(next);
          mainBrokerChanged(Number(input.dataset.row),next);
        });
      }
    });
    const brokerHeader=table.querySelector(`th[data-business-column="${BROKER}"]`);
    if(brokerHeader){
      const indicator=brokerHeader.querySelector('.sort-indicator');
      brokerHeader.childNodes.forEach(node=>{
        if(node.nodeType===Node.TEXT_NODE) node.nodeValue='仲介費 ';
      });
      brokerHeader.title='仲介費：從投資人原始獲利抽成的百分比';
      if(indicator && indicator.previousSibling?.nodeType!==Node.TEXT_NODE) brokerHeader.insertBefore(document.createTextNode('仲介費 '),indicator);
    }
    enhanceProjectDialog();
  }

  function enhanceProjectDialog(){
    const fee=$('#projectBrokerFee');
    if(!fee) return;
    const label=fee.closest('label')?.querySelector('span');
    if(label) label.textContent='仲介費（%）';
    fee.type='number';
    fee.min='0';
    fee.max='100';
    fee.step='0.01';
    fee.inputMode='decimal';
    fee.placeholder='0';
    if(!fee.dataset.commissionBound){
      fee.dataset.commissionBound='1';
      fee.addEventListener('change',()=>{ fee.value=compact(clampPct(fee.value)); });
      $('#addProjectBtn')?.addEventListener('click',()=>requestAnimationFrame(()=>{
        if(!fee.value) fee.value='0';
      }));
    }
  }

  function addHeaderAfter(ref,label,attr){
    if(!ref) return null;
    const th=document.createElement('th');
    th.className='num commission-detail-head';
    th.dataset[attr]='1';
    th.textContent=label;
    ref.insertAdjacentElement('afterend',th);
    return th;
  }

  function addPercentCellAfter(ref,cls,value,label){
    const td=document.createElement('td');
    td.className='num commission-detail-cell';
    const wrap=document.createElement('div');
    wrap.className='inline-profit-control commission-percent-control';
    const input=document.createElement('input');
    input.className=cls;
    input.type='number';
    input.min='0';
    input.max='100';
    input.step='0.01';
    input.inputMode='decimal';
    input.value=compact(value);
    input.setAttribute('aria-label',label);
    const suffix=document.createElement('span');
    suffix.textContent='%';
    wrap.append(input,suffix);
    td.appendChild(wrap);
    ref.insertAdjacentElement('afterend',td);
    return td;
  }

  function addValueCellAfter(ref,cls,value){
    const td=document.createElement('td');
    td.className=`num commission-detail-cell ${cls}`;
    td.textContent=value;
    ref.insertAdjacentElement('afterend',td);
    return td;
  }

  function enhanceSettlementTable(table,map){
    const brokerTh=table.querySelector('th[data-business-settlement-broker]');
    if(!brokerTh) return;
    brokerTh.textContent='仲介費%';

    let companyPctTh=table.querySelector('th[data-company-pct]');
    if(!companyPctTh){
      companyPctTh=addHeaderAfter(brokerTh,'介紹公司%', 'companyPct');
      const companyAmtTh=addHeaderAfter(companyPctTh,'公司抽成', 'companyAmt');
      const refPctTh=addHeaderAfter(companyAmtTh,'介紹人%', 'referrerPct');
      addHeaderAfter(refPctTh,'介紹人抽成', 'referrerAmt');
    }

    const sampleRate=table.querySelector('.case-rate-input');
    const sampleAmount=table.querySelector('.case-amount-input');
    const rateTh=sampleRate?.closest('td')?.cellIndex!=null ? table.querySelectorAll('thead th')[sampleRate.closest('td').cellIndex] : null;
    const amountTh=sampleAmount?.closest('td')?.cellIndex!=null ? table.querySelectorAll('thead th')[sampleAmount.closest('td').cellIndex] : null;
    if(rateTh) rateTh.textContent='原始收益率';
    if(amountTh) amountTh.textContent='原始收益';
    if(amountTh && !table.querySelector('th[data-net-rate]')){
      const netRateTh=addHeaderAfter(amountTh,'淨收益率','netRate');
      addHeaderAfter(netRateTh,'投資人淨收益','netAmount');
    }

    const store=readSplits();
    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr=>{
      const item=map.get(tr.dataset.profitKey);
      if(!item) return;
      tr.dataset.splitKey=item.splitKey;
      tr.dataset.caseRow=String(item.rowIndex);
      const split=getSplit(store,item.splitKey,item.broker);
      const brokerTd=tr.querySelector('td[data-business-settlement-broker]');
      if(!brokerTd) return;
      brokerTd.textContent=`${compact(split.total)}%`;
      brokerTd.classList.add('broker-total-cell');

      if(!tr.querySelector('.company-split-input')){
        const companyPctTd=addPercentCellAfter(brokerTd,'company-split-input',split.company,`${item.project} 介紹公司抽成`);
        const companyAmtTd=addValueCellAfter(companyPctTd,'company-fee-amount','0');
        const refPctTd=addPercentCellAfter(companyAmtTd,'referrer-split-input',split.referrer,`${item.project} 介紹人抽成`);
        addValueCellAfter(refPctTd,'referrer-fee-amount','0');
      }else{
        tr.querySelector('.company-split-input').value=compact(split.company);
        tr.querySelector('.referrer-split-input').value=compact(split.referrer);
      }

      const amountTd=tr.querySelector('.case-amount-input')?.closest('td');
      if(amountTd && !tr.querySelector('.net-rate-value')){
        addValueCellAfter(amountTd,'net-rate-value','0%');
        addValueCellAfter(tr.querySelector('.net-rate-value'),'net-amount-value','+0');
      }
      recalcRow(tr,item,split);
    });
  }

  function recalcRow(tr,item,splitOverride){
    const store=readSplits();
    const split=splitOverride || getSplit(store,item.splitKey,item.broker);
    const grossRate=Math.max(0,num(tr.querySelector('.case-rate-input')?.value));
    const grossAmount=Math.max(0,num(tr.querySelector('.case-amount-input')?.value));
    const result=commissionMath(grossRate,grossAmount,split);
    const brokerTd=tr.querySelector('.broker-total-cell');
    if(brokerTd) brokerTd.textContent=`${compact(split.total)}%`;
    const companyAmt=tr.querySelector('.company-fee-amount');
    const referrerAmt=tr.querySelector('.referrer-fee-amount');
    const netRate=tr.querySelector('.net-rate-value');
    const netAmount=tr.querySelector('.net-amount-value');
    if(companyAmt) companyAmt.textContent=money(result.companyAmount);
    if(referrerAmt) referrerAmt.textContent=money(result.referrerAmount);
    if(netRate) netRate.textContent=`${compact(result.netRate)}%`;
    if(netAmount) netAmount.textContent=`+${money(result.netAmount)}`;
    tr.dataset.netAmount=String(result.netAmount);
    tr.dataset.netRate=String(result.netRate);
    tr.dataset.companyFeeAmount=String(result.companyAmount);
    tr.dataset.referrerFeeAmount=String(result.referrerAmount);
  }

  function recalcGroup(groupEl){
    if(!groupEl) return;
    const total=[...groupEl.querySelectorAll('tbody tr[data-net-amount]')].reduce((sum,tr)=>sum+num(tr.dataset.netAmount),0);
    const label=groupEl.querySelector('.group-profit-total');
    if(label){
      const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
      if(text) text.nodeValue='淨收益合計';
      const b=label.querySelector('b');
      if(b) b.textContent=`+${money(total)}`;
    }
  }

  function syncRowsForSplit(splitKey,split,map){
    document.querySelectorAll(`tr[data-split-key]`).forEach(tr=>{
      if(tr.dataset.splitKey!==splitKey) return;
      const item=map.get(tr.dataset.profitKey);
      if(!item) return;
      const company=tr.querySelector('.company-split-input');
      const referrer=tr.querySelector('.referrer-split-input');
      if(company) company.value=compact(split.company);
      if(referrer) referrer.value=compact(split.referrer);
      recalcRow(tr,item,split);
      recalcGroup(tr.closest('.per-case-profit-group'));
    });
  }

  function handleSplitInput(input){
    const tr=input.closest('tr[data-profit-key]');
    if(!tr) return;
    const {map}=settlementMap();
    const item=map.get(tr.dataset.profitKey);
    if(!item) return;
    let company=clampPct(tr.querySelector('.company-split-input')?.value);
    let referrer=clampPct(tr.querySelector('.referrer-split-input')?.value);
    if(company+referrer>100){
      if(input.classList.contains('company-split-input')) company=Math.max(0,100-referrer);
      else referrer=Math.max(0,100-company);
    }
    const split=setSplit(item.splitKey,company,referrer);
    syncCanonicalBroker(item.rowIndex,split.total);
    syncRowsForSplit(item.splitKey,split,map);
  }

  function decorateSettlement(){
    decorateRaf=0;
    const box=$('#investorGroups');
    if(!box) return;
    const {map}=settlementMap();
    box.querySelectorAll('.per-case-profit-table').forEach(table=>enhanceSettlementTable(table,map));
    box.querySelectorAll('.per-case-profit-group').forEach(recalcGroup);
  }

  function scheduleDecorate(){
    if(decorateRaf) return;
    decorateRaf=requestAnimationFrame(decorateSettlement);
  }

  function scheduleMain(){
    if(mainRaf) return;
    mainRaf=requestAnimationFrame(decorateMainBroker);
  }

  function exportSettlement(e){
    const target=e.target?.closest?.('#exportSettlementBtn');
    if(!target || !window.XLSX) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    persistSplits();

    const {groups,start,end}=settlementMap();
    if(!groups.size) return;
    const returnStore=readReturnStore();
    const live=liveReturnSettings();
    const splitStore=readSplits();
    const summary=[['投資人','結算案數','投入金額合計','原始收益合計','仲介費合計','投資人淨收益合計']];
    const detail=[['投資人',RECENT,CYCLE,'起租案名','案源','撥款人','案件金額','投入金額','仲介費總比例(%)','介紹公司抽成(%)','介紹公司抽成金額','介紹人抽成(%)','介紹人抽成金額','原始收益率(%)','原始收益金額','淨收益率(%)','投資人淨收益金額']];

    groups.forEach((items,investor)=>{
      let investedTotal=0,grossTotal=0,feeTotal=0,netTotal=0;
      items.forEach(item=>{
        const gross=returnSetting(item,returnStore,live);
        const split=getSplit(splitStore,item.splitKey,item.broker);
        const calc=commissionMath(gross.rate,gross.amount,split);
        investedTotal+=item.invested;
        grossTotal+=gross.amount;
        feeTotal+=calc.companyAmount+calc.referrerAmount;
        netTotal+=calc.netAmount;
        detail.push([
          investor,item.recent,item.cycle,item.project,item.source,item.payer,item.caseAmount,item.invested,split.total,
          split.company,calc.companyAmount,split.referrer,calc.referrerAmount,gross.rate,gross.amount,calc.netRate,calc.netAmount
        ]);
      });
      summary.push([investor,items.length,investedTotal,grossTotal,feeTotal,netTotal]);
    });

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'投資人收益');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),'逐案收益明細');
    XLSX.writeFile(wb,`區間結算_${start}_${end}.xlsx`);
  }

  function injectStyle(){
    if($('#commission-split-style')) return;
    const style=document.createElement('style');
    style.id='commission-split-style';
    style.textContent=`
      .broker-percent-cell{position:relative!important;padding-right:20px!important;}
      .broker-percent-cell::after{content:"%";position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;color:#64748b;pointer-events:none;}
      .commission-detail-head{min-width:112px!important;white-space:nowrap;}
      .commission-detail-cell{white-space:nowrap;}
      .commission-percent-control{min-width:94px!important;}
      .commission-percent-control input{width:58px!important;}
      .company-fee-amount,.referrer-fee-amount{color:#b45309;font-weight:700;}
      .net-rate-value,.net-amount-value{color:#0f7b55;font-weight:800;background:#f4fbf7;}
      .broker-total-cell{font-weight:800;color:#7c3aed;}
      @media(max-width:700px){.commission-detail-head{min-width:104px!important;}}
    `;
    document.head.appendChild(style);
  }

  function bind(){
    const table=$('#sheetGrid');
    if(table){
      const observer=new MutationObserver(scheduleMain);
      observer.observe(table,{childList:true});
    }
    const box=$('#investorGroups');
    if(box){
      const observer=new MutationObserver(scheduleDecorate);
      observer.observe(box,{childList:true,subtree:false});
      box.addEventListener('input',e=>{
        const input=e.target;
        if(input?.classList?.contains('company-split-input') || input?.classList?.contains('referrer-split-input')){
          handleSplitInput(input);
          return;
        }
        if(input?.classList?.contains('case-rate-input') || input?.classList?.contains('case-amount-input')){
          requestAnimationFrame(()=>{
            const {map}=settlementMap();
            const tr=input.closest('tr[data-profit-key]');
            const item=tr ? map.get(tr.dataset.profitKey) : null;
            if(item){ recalcRow(tr,item); recalcGroup(tr.closest('.per-case-profit-group')); }
          });
        }
      });
    }
    window.addEventListener('click',exportSettlement,true);
    window.addEventListener('pagehide',persistSplits,{passive:true});
  }

  function init(){
    injectStyle();
    normalizeBrokerDefaults();
    bind();
    enhanceProjectDialog();
    scheduleMain();
    scheduleDecorate();
  }

  init();
})();
