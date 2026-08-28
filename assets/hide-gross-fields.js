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
      if(label === '收益率' || label === '原始收益率'){
        th.dataset.legacyGrossRateHead = '1';
        hardHide(th);
      }else if(label === '收益金額' || label === '原始收益'){
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

      html,body.ledger-page{max-width:100%;overflow-x:hidden!important;}
      body.ledger-page main,
      body.ledger-page .settlement-section,
      body.ledger-page .investor-groups,
      body.ledger-page .investor-group,
      body.ledger-page .investor-group-head{min-width:0!important;max-width:100%!important;}
      body.ledger-page .investor-group{width:100%!important;overflow:hidden!important;}
      body.ledger-page .investor-projects{
        display:block!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        -webkit-overflow-scrolling:touch!important;
        overscroll-behavior-x:contain!important;
      }
      body.ledger-page .per-case-profit-table{
        width:max-content!important;
        min-width:980px!important;
        max-width:none!important;
        table-layout:auto!important;
        border-collapse:separate!important;
        border-spacing:0!important;
      }
      body.ledger-page .per-case-profit-table th,
      body.ledger-page .per-case-profit-table td{
        box-sizing:border-box!important;
        height:auto!important;
        min-height:44px!important;
        padding-top:10px!important;
        padding-bottom:10px!important;
        line-height:1.35!important;
        vertical-align:middle!important;
        border-top:0!important;
        border-bottom:1px solid #edf0f4!important;
        background-clip:padding-box!important;
      }
      body.ledger-page .per-case-profit-table thead th{
        padding-top:9px!important;
        padding-bottom:9px!important;
        line-height:1.3!important;
      }
      body.ledger-page .per-case-profit-table tbody tr:last-child td{
        border-bottom:0!important;
      }
      body.ledger-page .per-case-profit-table .inline-profit-control{
        height:34px!important;
        min-height:34px!important;
        margin:1px 0!important;
        line-height:1!important;
        vertical-align:middle!important;
      }
      body.ledger-page .per-case-profit-table input{
        line-height:1.2!important;
        vertical-align:middle!important;
      }
      body.ledger-page .commission-deduction-amount{
        line-height:1.3!important;
        margin-top:6px!important;
        padding-bottom:1px!important;
      }
      body.ledger-page .investor-group-head>*,
      body.ledger-page .per-case-summary>*{min-width:0!important;}
      @media(max-width:700px){
        body.ledger-page .settlement-section{
          width:calc(100% - 20px)!important;
          max-width:calc(100% - 20px)!important;
        }
        body.ledger-page .investor-projects{margin-left:0!important;margin-right:0!important;}
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
