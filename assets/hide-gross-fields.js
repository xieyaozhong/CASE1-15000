(() => {
  'use strict';

  let raf = 0;

  function hardHide(el){
    if(!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden','true');
    el.classList.add('gross-field-hidden');
  }

  function hideTable(table){
    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr=>{
      const rateTd = tr.querySelector('.case-rate-input')?.closest('td');
      const amountTd = tr.querySelector('.case-amount-input')?.closest('td');
      [rateTd,amountTd].forEach(hardHide);

      const ths = [...table.querySelectorAll('thead th')];
      if(rateTd && ths[rateTd.cellIndex]) hardHide(ths[rateTd.cellIndex]);
      if(amountTd && ths[amountTd.cellIndex]) hardHide(ths[amountTd.cellIndex]);
    });

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
