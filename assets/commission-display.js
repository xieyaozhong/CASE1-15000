(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  let raf = 0;

  const looseNum = value => {
    const n = parseFloat(String(value ?? '').replace(/,/g,'').replace(/[^0-9.+-]/g,''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(Math.abs(looseNum(value)));

  function markLegacyCells(table, refs){
    if (table.dataset.commissionLegacyMarked === '1') return;
    const indexes = {
      companyPct: refs.companyPct.cellIndex,
      companyAmt: refs.companyAmt.cellIndex,
      refPct: refs.refPct.cellIndex,
      refAmt: refs.refAmt.cellIndex
    };

    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr => {
      const cells = [...tr.cells];
      Object.entries(indexes).forEach(([role,index]) => {
        const td = cells[index];
        if (td) td.dataset.commissionLegacy = role;
      });
    });
    table.dataset.commissionLegacyMarked = '1';
  }

  function makeDisplayHeader(label,role){
    const th = document.createElement('th');
    th.className = 'num commission-display-head';
    th.dataset.commissionDisplay = role;
    th.textContent = label;
    return th;
  }

  function makeDisplayCell(role){
    const td = document.createElement('td');
    td.className = 'num commission-display-cell';
    td.dataset.commissionDisplayCell = role;
    return td;
  }

  function moveControl(sourceTd,targetTd,role){
    if (!sourceTd || !targetTd) return;
    const control = sourceTd.querySelector('.inline-profit-control');
    if (control && !targetTd.contains(control)) targetTd.appendChild(control);
    if (control) control.classList.add('commission-deduction-control');
    const input = targetTd.querySelector('input');
    if (input) input.setAttribute('aria-label', role === 'referrer' ? '仲介人抽成比例' : '仲介公司抽成比例');
  }

  function updateDeduction(targetTd,amountTd,label){
    if (!targetTd || !amountTd) return;
    let amount = targetTd.querySelector('.commission-deduction-amount');
    if (!amount) {
      amount = document.createElement('div');
      amount.className = 'commission-deduction-amount';
      targetTd.appendChild(amount);
    }
    const text = `扣款 −${money(amountTd.textContent)}`;
    if (amount.textContent !== text) amount.textContent = text;
    amount.title = `${label}從投資人原始獲利扣除`;
  }

  function hideNetColumns(table){
    table.querySelectorAll('th[data-net-rate],th[data-net-amount],td.net-rate-value,td.net-amount-value').forEach(el => {
      el.style.display = 'none';
    });
  }

  function simplifySummary(){
    document.querySelectorAll('.per-case-profit-group .group-profit-total').forEach(label => {
      const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
      if (text && text.nodeValue !== '收益合計') text.nodeValue = '收益合計';
    });
  }

  function buildStableDisplay(table,refs){
    markLegacyCells(table,refs);

    refs.companyPct.style.display = 'none';
    refs.companyAmt.style.display = 'none';
    refs.refPct.style.display = 'none';
    refs.refAmt.style.display = 'none';
    refs.broker.textContent = '仲介費';
    refs.broker.classList.add('commission-display-head','commission-broker-head');

    let refHead = table.querySelector('th[data-commission-display="referrer"]');
    let companyHead = table.querySelector('th[data-commission-display="company"]');
    if (!refHead) {
      refHead = makeDisplayHeader('仲介人','referrer');
      refs.broker.insertAdjacentElement('afterend',refHead);
    }
    if (!companyHead) {
      companyHead = makeDisplayHeader('仲介公司','company');
      refHead.insertAdjacentElement('afterend',companyHead);
    }

    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr => {
      const broker = tr.querySelector('td[data-business-settlement-broker]');
      const legacyCompanyPct = tr.querySelector('td[data-commission-legacy="companyPct"]');
      const legacyCompanyAmt = tr.querySelector('td[data-commission-legacy="companyAmt"]');
      const legacyRefPct = tr.querySelector('td[data-commission-legacy="refPct"]');
      const legacyRefAmt = tr.querySelector('td[data-commission-legacy="refAmt"]');
      if (!broker || !legacyCompanyPct || !legacyCompanyAmt || !legacyRefPct || !legacyRefAmt) return;

      [legacyCompanyPct,legacyCompanyAmt,legacyRefPct,legacyRefAmt].forEach(td => { td.style.display = 'none'; });
      broker.classList.add('commission-total-cell');

      let refCell = tr.querySelector('td[data-commission-display-cell="referrer"]');
      let companyCell = tr.querySelector('td[data-commission-display-cell="company"]');
      if (!refCell) {
        refCell = makeDisplayCell('referrer');
        broker.insertAdjacentElement('afterend',refCell);
      }
      if (!companyCell) {
        companyCell = makeDisplayCell('company');
        refCell.insertAdjacentElement('afterend',companyCell);
      }

      moveControl(legacyRefPct,refCell,'referrer');
      moveControl(legacyCompanyPct,companyCell,'company');
      updateDeduction(refCell,legacyRefAmt,'仲介人');
      updateDeduction(companyCell,legacyCompanyAmt,'仲介公司');
    });

    table.dataset.commissionDisplayReady = '1';
  }

  function refreshTable(table){
    const refs = {
      broker: table.querySelector('th[data-business-settlement-broker]'),
      companyPct: table.querySelector('th[data-company-pct]'),
      companyAmt: table.querySelector('th[data-company-amt]'),
      refPct: table.querySelector('th[data-referrer-pct]'),
      refAmt: table.querySelector('th[data-referrer-amt]')
    };
    if (Object.values(refs).some(v => !v)) return;

    if (table.dataset.commissionDisplayReady !== '1') buildStableDisplay(table,refs);
    hideNetColumns(table);

    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr => {
      const refCell = tr.querySelector('td[data-commission-display-cell="referrer"]');
      const companyCell = tr.querySelector('td[data-commission-display-cell="company"]');
      const refAmt = tr.querySelector('td[data-commission-legacy="refAmt"]');
      const companyAmt = tr.querySelector('td[data-commission-legacy="companyAmt"]');
      updateDeduction(refCell,refAmt,'仲介人');
      updateDeduction(companyCell,companyAmt,'仲介公司');
    });
  }

  function decorate(){
    raf = 0;
    document.querySelectorAll('.per-case-profit-table').forEach(refreshTable);
    simplifySummary();
  }

  function schedule(){
    if (raf) return;
    raf = requestAnimationFrame(decorate);
  }

  function injectStyle(){
    if ($('#commission-display-style')) return;
    const style = document.createElement('style');
    style.id = 'commission-display-style';
    style.textContent = `
      .investor-projects{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain;}
      .per-case-profit-table{width:max-content!important;min-width:100%!important;table-layout:auto!important;}
      .commission-display-head{min-width:124px!important;white-space:nowrap!important;background:#fff5f5!important;color:#b42318!important;text-align:center!important;}
      .commission-broker-head{min-width:88px!important;}
      .commission-total-cell{font-weight:900!important;color:#b42318!important;background:#fff7f7!important;white-space:nowrap!important;text-align:center!important;}
      .commission-display-cell{min-width:124px!important;width:124px!important;background:#fffafa!important;vertical-align:middle!important;padding:8px 10px!important;}
      .commission-deduction-control{min-width:102px!important;border-color:#fecaca!important;background:#fff!important;}
      .commission-deduction-control input{width:64px!important;color:#991b1b!important;font-weight:800!important;}
      .commission-deduction-control span{color:#b42318!important;}
      .commission-deduction-amount{margin-top:5px;color:#d92d20;font-size:11px;font-weight:900;line-height:1.2;text-align:right;white-space:nowrap;}
      @media(max-width:700px){
        .investor-projects{margin-left:0!important;margin-right:0!important;}
        .per-case-profit-table{min-width:900px!important;}
        .commission-display-head,.commission-display-cell{min-width:116px!important;width:116px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    const box = $('#investorGroups');
    if (box) {
      const observer = new MutationObserver(schedule);
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
