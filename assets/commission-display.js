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
    th.className=`num settlement-display-head ${kind==='fee'?'settlement-fee-head':kind==='net'?'settlement-net-head':''}`.trim();
    th.dataset.settlementDisplay=role;
    th.textContent=label;
    return th;
  }

  function makeCell(role,kind='normal'){
    const td=document.createElement('td');
    td.className=`num settlement-display-cell ${kind==='fee'?'settlement-fee-cell':kind==='net'?'settlement-net-cell':''}`.trim();
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
      rateTh:table.querySelector('th[data-legacy-gross-rate-head]') || ths[legacyRateTd.cellIndex],
      amountTh:table.querySelector('th[data-legacy-gross-amount-head]') || ths[legacyAmountTd.cellIndex],
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

  function ensureDisplayHeaders(table,refs){
    const order=[
      ['rate','收益率','normal'],
      ['broker','仲介費','fee'],
      ['company','仲介公司','fee'],
      ['referrer','仲介人','fee'],
      ['netRate','淨收益率','net'],
      ['netAmount','淨收益金額','net']
    ];
    let anchor=refs.investedTh;
    order.forEach(([role,label,kind])=>{
      let th=table.querySelector(`th[data-settlement-display="${role}"]`);
      if(!th){ th=makeHeader(label,role,kind); }
      anchor.insertAdjacentElement('afterend',th);
      anchor=th;
    });
  }

  function moveControl(sourceTd,targetTd,ariaLabel,extraClass=''){
    if(!sourceTd || !targetTd) return;
    const control=sourceTd.querySelector('.inline-profit-control');
    if(control && !targetTd.contains(control)) targetTd.appendChild(control);
    if(control && extraClass) control.classList.add(extraClass);
    const input=targetTd.querySelector('input');
    if(input) input.setAttribute('aria-label',ariaLabel);
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
    amount.title=`${label}從投資人原始獲利扣除`;
  }

  function updateValue(targetTd,sourceTd,suffix=''){
    if(!targetTd || !sourceTd) return;
    const value=String(sourceTd.textContent ?? '').trim();
    targetTd.textContent=value || suffix;
  }

  function ensureDisplayCells(tr){
    const invested=tr.querySelector('.invested-value');
    if(!invested) return null;
    const order=[['rate','normal'],['broker','fee'],['company','fee'],['referrer','fee'],['netRate','net'],['netAmount','net']];
    let anchor=invested;
    const out={};
    order.forEach(([role,kind])=>{
      let td=tr.querySelector(`td[data-settlement-display-cell="${role}"]`);
      if(!td) td=makeCell(role,kind);
      anchor.insertAdjacentElement('afterend',td);
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

    moveControl(rateTd,cells.rate,'收益率');
    cells.rate.querySelector('.inline-profit-control')?.classList.add('settlement-rate-control');

    cells.broker.textContent=String(brokerTd.textContent ?? '').trim() || '0%';
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
      .settlement-rate-control{min-width:96px!important;}
      .settlement-rate-control input{width:58px!important;}
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
      observer.observe(box,{childList:true,subtree:true,characterData:true});
      box.addEventListener('input',schedule,{passive:true});
      box.addEventListener('change',schedule,{passive:true});
    }
    $('#settleBtn')?.addEventListener('click',()=>{
      requestAnimationFrame(schedule);
      setTimeout(schedule,60);
    });
    schedule();
  }

  init();
})();
