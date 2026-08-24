(() => {
  'use strict';

  let raf = 0;

  function hardHide(el){
    if(!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden','true');
    el.classList.add('gross-field-hidden');
  }

  function markGrossDataCells(table){
    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr=>{
      const rateTd = tr.querySelector('.case-rate-input')?.closest('td');
      if(rateTd && !rateTd.dataset.settlementDisplayCell){
        rateTd.dataset.legacyGrossRateCell = '1';
        hardHide(rateTd);
      }

      const legacyAmountTd = tr.querySelector('td[data-legacy-gross-amount-cell]');
      if(legacyAmountTd) hardHide(legacyAmountTd);

      const amountTd = tr.querySelector('.case-amount-input')?.closest('td');
      if(amountTd && !amountTd.dataset.settlementDisplayCell){
        amountTd.dataset.legacyGrossAmountCell = '1';
        hardHide(amountTd);
      }
    });
  }

  function markGrossHeaders(table){
    table.querySelectorAll('thead th').forEach(th=>{
      if(th.dataset.settlementDisplay) return;
      const label = String(th.textContent || '').trim();
      if(label === '收益率'){
        th.dataset.legacyGrossRateHead = '1';
        hardHide(th);
      }else if(label === '收益金額'){
        th.dataset.legacyGrossAmountHead = '1';
        hardHide(th);
      }
    });
  }

  function hideTable(table){
    markGrossDataCells(table);
    markGrossHeaders(table);

    table.querySelectorAll(
      'th[data-legacy-gross-rate-head],th[data-legacy-gross-amount-head],td[data-legacy-gross-rate-cell],td[data-legacy-gross-amount-cell],th[data-settlement-display="rate"],td[data-settlement-display-cell="rate"]'
    ).forEach(hardHide);
  }

  function apply(){
    raf = 0;
    document.querySelectorAll('.per-case-profit-table').forEach(hideTable);
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(apply);
  }

  function injectStyle(){
    if(document.getElementById('gross-field-hidden-style')) return;
    const style = document.createElement('style');
    style.id = 'gross-field-hidden-style';
    style.textContent = `
      .gross-field-hidden,
      th[data-legacy-gross-rate-head],
      th[data-legacy-gross-amount-head],
      td[data-legacy-gross-rate-cell],
      td[data-legacy-gross-amount-cell],
      th[data-settlement-display="rate"],
      td[data-settlement-display-cell="rate"]{
        display:none!important;
        visibility:hidden!important;
        width:0!important;
        min-width:0!important;
        max-width:0!important;
        padding:0!important;
        border:0!important;
      }
      td[data-settlement-display-cell="earnings"]{
        display:table-cell!important;
        visibility:visible!important;
      }
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    const box = document.getElementById('investorGroups');
    if(box){
      const observer = new MutationObserver(schedule);
      observer.observe(box,{childList:true,subtree:true});
    }
    document.getElementById('settleBtn')?.addEventListener('click',()=>{
      requestAnimationFrame(schedule);
      setTimeout(schedule,80);
    });
    schedule();
  }

  init();
})();
