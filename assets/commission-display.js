(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  let raf = 0;

  const looseNum = value => {
    const n = parseFloat(String(value ?? '').replace(/,/g,'').replace(/[^0-9.+-]/g,''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(Math.abs(looseNum(value)));

  function makeHeader(label,role,kind='normal'){
    const th=document.createElement('th');
    th.className=`num settlement-display-head ${kind==='fee'?'settlement-fee-head':kind==='net'?'settlement-net-head':kind==='earning'?'settlement-earning-head':''}`.trim();
    th.dataset.settlementDisplay=role;
    th.textContent=label;
    return th;
  }

  function makeCell(role,kind='normal'){
    const td=document.createElement('td');
    td.className=`num settlement-display-cell ${kind==='fee'?'settlement-fee-cell':kind==='net'?'settlement-net-cell':kind==='earning'?'settlement-earning-cell':''}`.trim();
    td.dataset.settlementDisplayCell=role;
    return td;
  }

  function findRefs(table){
    const sample=table.querySelector('tbody tr[data-profit-key]');
    if(!sample) return null;
    const invested=sample.querySelector('.invested-value');
    const rateInput=sample.querySelector('.case-rate-input');
    const amountInput=sample.querySelector('.case-amount-input');
    const legacyRateTd=sample.querySelector('td[data-legacy-gross-rate-cell]') || rateInput?.closest('td');
    const legacyAmountTd=sample.querySelector('td[data-legacy-gross-amount-cell]') || amountInput?.closest('td');
    const broker=sample.querySelector('td[data-business-settlement-broker]');
    const companyPct=sample.querySelector('.company-split-input')?.closest('td');
    const companyAmt=sample.querySelector('.company-fee-amount');
    const refPct=sample.querySelector('.referrer-split-input')?.closest('td');
    const refAmt=sample.querySelector('.referrer-fee-amount');
    const netRate=sample.querySelector('.net-rate-value');
    const netAmount=sample.querySelector('.net-amount-value');
    if(!invested || !rateInput || !amountInput || !legacyRateTd || !legacyAmountTd || !broker || !companyPct || !companyAmt || !refPct || !refAmt || !netRate || !netAmount) return null;
    const ths=[...table.querySelectorAll('thead th')];
    return {
      sample,
      invested,
      investedTh:ths[invested.cellIndex],
      rateTh:table.querySelector('th[data-legacy-gross-rate-head]') || [...table.querySelectorAll('thead th')].find(th=>String(th.textContent||'').trim()==='收益率'),
      amountTh:table.querySelector('th[data-legacy-gross-amount-head]') || [...table.querySelectorAll('thead th')].find(th=>String(th.textContent||'').trim()==='收益金額'),
      brokerTh:table.querySelector('th[data-business-settlement-broker]'),
      companyPctTh:table.querySelector('th[data-company-pct]'),
      companyAmtTh:table.querySelector('th[data-company-amt]'),
      refPctTh:table.querySelector('th[data-referrer-pct]'),
      refAmtTh:table.querySelector('th[data-referrer-amt]'),
      netRateTh:table.querySelector('th[data-net-rate]'),
      netAmountTh:table.querySelector('th[data-net-amount]')
    };
  }

  function hideLegacyHeaders(refs){
    if(refs.rateTh){ refs.rateTh.dataset.legacyGrossRateHead='1'; refs.rateTh.style.display='none'; }
    if(refs.amountTh){ refs.amountTh.dataset.legacyGrossAmountHead='1'; refs.amountTh.style.display='none'; }
    [refs.brokerTh,refs.companyPctTh,refs.companyAmtTh,refs.refPctTh,refs.refAmtTh,refs.netRateTh,refs.netAmountTh]
      .filter(Boolean).forEach(th=>{ th.style.display='none'; });
  }

  function removeOldGrossDisplay(table){
    table.querySelectorAll('th[data-settlement-display="rate"],td[data-settlement-display-cell="rate"]').forEach(el=>el.remove());
  }

  function placeAfter(anchor,el){
    if(!anchor || !el) return;
    if(anchor.nextElementSibling!==el) anchor.insertAdjacentElement('afterend',el);
  }

  function ensureDisplayHeaders(table,refs){
    const order=[
      ['earnings','收益','earning'],
      ['broker','仲介費','fee'],
      ['company','仲介公司','fee'],
      ['referrer','仲介人','fee'],
      ['netRate','淨收益率','net'],
      ['netAmount','淨收益金額','net']
    ];
    let anchor=refs.investedTh;
    order.forEach(([role,label,kind])=>{
      let th=table.querySelector(`th[data-settlement-display="${role}"]`);
      if(!th) th=makeHeader(label,role,kind);
      placeAfter(anchor,th);
      anchor=th;
    });
  }

  function moveControl(sourceTd,targetTd,ariaLabel,extraClass=''){
    if(!sourceTd || !targetTd) return;
    const control=sourceTd.querySelector('.inline-profit-control') || targetTd.querySelector('.inline-profit-control');
    if(control && !targetTd.contains(control)) targetTd.appendChild(control);
    if(control && extraClass) control.classList.add(extraClass);
    const input=targetTd.querySelector('input');
    if(input) input.setAttribute('aria-label',ariaLabel);
  }

  function ensureEarningsInput(tr,targetTd){
    if(!tr || !targetTd) return;
    const source=tr.querySelector('.case-amount-input');
    if(!source) return;

    let input=targetTd.querySelector('.settlement-earnings-input');
    if(!input){
      const wrap=document.createElement('div');
      wrap.className='inline-profit-control amount-control settlement-earning-control';
      const prefix=document.createElement('span');
      prefix.textContent='+';
      input=document.createElement('input');
      input.className='settlement-earnings-input';
      input.type='number';
      input.min='0';
      input.step='0.01';
      input.inputMode='decimal';
      input.autocomplete='off';
      input.setAttribute('aria-label','收益金額');
      wrap.append(prefix,input);
      targetTd.appendChild(wrap);

      const syncToSource=()=>{
        source.value=input.value;
        source.dispatchEvent(new Event('input',{bubbles:true}));
        requestAnimationFrame(schedule);
      };
      input.addEventListener('input',syncToSource);
      input.addEventListener('change',syncToSource);
    }

    if(document.activeElement!==input && input.value!==source.value) input.value=source.value;
  }

  function updateDeduction(targetTd,amountTd,label){
    if(!targetTd || !amountTd) return;
    let amount=targetTd.querySelector('.commission-deduction-amount');
    if(!amount){
      amount=document.createElement('div');
      amount.className='commission-deduction-amount';
      targetTd.appendChild(amount);
    }
    const text=`扣款 −${money(amountTd.textContent)}`;
    if(amount.textContent!==text) amount.textContent=text;
    amount.title=`${label}從投資人收益扣除`;
  }

  function updateValue(targetTd,sourceTd,suffix=''){
    if(!targetTd || !sourceTd) return;
    const value=String(sourceTd.textContent ?? '').trim();
    const next=value || suffix;
    if(targetTd.textContent!==next) targetTd.textContent=next;
  }

  function ensureDisplayCells(tr){
    const invested=tr.querySelector('.invested-value');
    if(!invested) return null;
    const order=[['earnings','earning'],['broker','fee'],['company','fee'],['referrer','fee'],['netRate','net'],['netAmount','net']];
    let anchor=invested;
    const out={};
    order.forEach(([role,kind])=>{
      let td=tr.querySelector(`td[data-settlement-display-cell="${role}"]`);
      if(!td) td=makeCell(role,kind);
      placeAfter(anchor,td);
      anchor=td;
      out[role]=td;
    });
    return out;
  }

  function prepareRow(tr,cells){
    const rateInput=tr.querySelector('.case-rate-input');
    const amountInput=tr.querySelector('.case-amount-input');
    const rateTd=tr.querySelector('td[data-legacy-gross-rate-cell]') || rateInput?.closest('td');
    const amountTd=tr.querySelector('td[data-legacy-gross-amount-cell]') || amountInput?.closest('td');
    const brokerTd=tr.querySelector('td[data-business-settlement-broker]');
    const companyPctTd=tr.querySelector('.company-split-input')?.closest('td');
    const companyAmtTd=tr.querySelector('.company-fee-amount');
    const refPctTd=tr.querySelector('.referrer-split-input')?.closest('td');
    const refAmtTd=tr.querySelector('.referrer-fee-amount');
    const netRateTd=tr.querySelector('.net-rate-value');
    const netAmountTd=tr.querySelector('.net-amount-value');
    if(!rateTd || !amountTd || !brokerTd || !companyPctTd || !companyAmtTd || !refPctTd || !refAmtTd || !netRateTd || !netAmountTd) return;

    rateTd.dataset.legacyGrossRateCell='1';
    amountTd.dataset.legacyGrossAmountCell='1';
    [rateTd,amountTd,brokerTd,companyPctTd,companyAmtTd,refPctTd,refAmtTd,netRateTd,netAmountTd].forEach(td=>{
      if(!td.matches('[data-settlement-display-cell]')) td.style.display='none';
    });

    ensureEarningsInput(tr,cells.earnings);
    const brokerText=String(brokerTd.textContent ?? '').trim() || '0%';
    if(cells.broker.textContent!==brokerText) cells.broker.textContent=brokerText;
    moveControl(companyPctTd,cells.company,'仲介公司抽成比例','commission-deduction-control');
    moveControl(refPctTd,cells.referrer,'仲介人抽成比例','commission-deduction-control');
    updateDeduction(cells.company,companyAmtTd,'仲介公司');
    updateDeduction(cells.referrer,refAmtTd,'仲介人');
    updateValue(cells.netRate,netRateTd,'0%');
    updateValue(cells.netAmount,netAmountTd,'0');
  }

  function refreshTable(table){
    const refs=findRefs(table);
    if(!refs || !refs.investedTh) return;
    hideLegacyHeaders(refs);
    removeOldGrossDisplay(table);
    ensureDisplayHeaders(table,refs);
    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr=>{
      const cells=ensureDisplayCells(tr);
      if(cells) prepareRow(tr,cells);
    });
  }

  function simplifySummary(){
    document.querySelectorAll('.per-case-profit-group .group-profit-total').forEach(label=>{
      const text=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
      if(text && text.nodeValue!=='收益合計') text.nodeValue='收益合計';
    });
  }

  function decorate(){
    raf=0;
    document.querySelectorAll('.per-case-profit-table').forEach(refreshTable);
    simplifySummary();
  }

  function schedule(){
    if(raf) return;
    raf=requestAnimationFrame(decorate);
  }

  function injectStyle(){
    if($('#commission-display-style')) return;
    const style=document.createElement('style');
    style.id='commission-display-style';
    style.textContent=`
      .investor-projects{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain;}
      .per-case-profit-table{width:max-content!important;min-width:100%!important;table-layout:auto!important;}
      .settlement-display-head{min-width:108px!important;white-space:nowrap!important;text-align:center!important;}
      .settlement-display-cell{min-width:108px!important;width:108px!important;vertical-align:middle!important;padding:8px 10px!important;white-space:nowrap!important;}
      .settlement-earning-head{background:#f7faff!important;color:#315b92!important;}
      .settlement-earning-cell{background:#fbfdff!important;}
      .settlement-earning-control{min-width:96px!important;border-color:#bfd0e5!important;background:#fff!important;pointer-events:auto!important;position:relative!important;z-index:2!important;}
      .settlement-earning-control input{width:66px!important;color:#1f4f82!important;font-weight:800!important;pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;position:relative!important;z-index:3!important;}
      .settlement-fee-head{background:#fff5f5!important;color:#b42318!important;}
      .settlement-fee-cell{background:#fffafa!important;color:#b42318!important;}
      .settlement-fee-cell[data-settlement-display-cell="broker"]{font-weight:900!important;text-align:center!important;}
      .commission-deduction-control{min-width:98px!important;border-color:#fecaca!important;background:#fff!important;}
      .commission-deduction-control input{width:60px!important;color:#991b1b!important;font-weight:800!important;}
      .commission-deduction-control span{color:#b42318!important;}
      .commission-deduction-amount{margin-top:5px;color:#d92d20;font-size:11px;font-weight:900;line-height:1.2;text-align:right;white-space:nowrap;}
      .settlement-net-head{background:#f2fbf6!important;color:#0f7b55!important;}
      .settlement-net-cell{background:#f5fcf8!important;color:#0f7b55!important;font-weight:900!important;text-align:right!important;}
      @media(max-width:700px){
        .investor-projects{margin-left:0!important;margin-right:0!important;}
        .per-case-profit-table{min-width:980px!important;}
        .settlement-display-head,.settlement-display-cell{min-width:104px!important;width:104px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    const box=$('#investorGroups');
    if(box){
      const observer=new MutationObserver(schedule);
      observer.observe(box,{childList:true,subtree:false});
      box.addEventListener('input',e=>{
        if(e.target?.classList?.contains('settlement-earnings-input')) return;
        schedule();
      },{passive:true});
      box.addEventListener('change',e=>{
        if(e.target?.classList?.contains('settlement-earnings-input')) return;
        schedule();
      },{passive:true});
    }
    $('#settleBtn')?.addEventListener('click',()=>{
      requestAnimationFrame(schedule);
      setTimeout(schedule,60);
      setTimeout(schedule,160);
    });
    schedule();
  }

  init();
})();
