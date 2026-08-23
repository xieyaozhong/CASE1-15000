(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  let raf = 0;

  const looseNum = value => {
    const n = parseFloat(String(value ?? '').replace(/,/g,'').replace(/[^0-9.+-]/g,''));
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(Math.abs(looseNum(value)));
  const compact = value => {
    const n = looseNum(value);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
  };

  function markRowCells(table, refs){
    const indexes = {
      broker: refs.broker.cellIndex,
      companyPct: refs.companyPct.cellIndex,
      companyAmt: refs.companyAmt.cellIndex,
      refPct: refs.refPct.cellIndex,
      refAmt: refs.refAmt.cellIndex
    };

    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr => {
      if (tr.querySelector('[data-commission-role="broker"]')) return;
      const cells = [...tr.cells];
      const pairs = [
        ['broker',indexes.broker],
        ['companyPct',indexes.companyPct],
        ['companyAmt',indexes.companyAmt],
        ['refPct',indexes.refPct],
        ['refAmt',indexes.refAmt]
      ];
      pairs.forEach(([role,index]) => {
        const td = cells[index];
        if (td) td.dataset.commissionRole = role;
      });
    });
  }

  function deductionCard(td, hiddenAmountTd, label){
    if (!td || !hiddenAmountTd) return;
    td.classList.add('commission-deduction-cell');
    const control = td.querySelector('.inline-profit-control');
    if (control) control.classList.add('commission-deduction-control');

    let amount = td.querySelector('.commission-deduction-amount');
    if (!amount) {
      amount = document.createElement('div');
      amount.className = 'commission-deduction-amount';
      td.appendChild(amount);
    }
    const value = looseNum(hiddenAmountTd.textContent);
    amount.textContent = `−${money(value)}`;
    amount.title = `${label}從投資人原始獲利扣除`;
  }

  function decorateTable(table){
    const refs = {
      broker: table.querySelector('th[data-business-settlement-broker]'),
      companyPct: table.querySelector('th[data-company-pct]'),
      companyAmt: table.querySelector('th[data-company-amt]'),
      refPct: table.querySelector('th[data-referrer-pct]'),
      refAmt: table.querySelector('th[data-referrer-amt]')
    };
    if (Object.values(refs).some(v => !v)) return;

    markRowCells(table, refs);

    refs.broker.textContent = '仲介費';
    refs.refPct.textContent = '仲介人';
    refs.companyPct.textContent = '仲介公司';
    refs.refAmt.style.display = 'none';
    refs.companyAmt.style.display = 'none';

    if (refs.broker.nextElementSibling !== refs.refPct) refs.broker.insertAdjacentElement('afterend',refs.refPct);
    if (refs.refPct.nextElementSibling !== refs.companyPct) refs.refPct.insertAdjacentElement('afterend',refs.companyPct);

    table.querySelectorAll('tbody tr[data-profit-key]').forEach(tr => {
      const broker = tr.querySelector('[data-commission-role="broker"]');
      const refPct = tr.querySelector('[data-commission-role="refPct"]');
      const refAmt = tr.querySelector('[data-commission-role="refAmt"]');
      const companyPct = tr.querySelector('[data-commission-role="companyPct"]');
      const companyAmt = tr.querySelector('[data-commission-role="companyAmt"]');
      if (!broker || !refPct || !refAmt || !companyPct || !companyAmt) return;

      refAmt.style.display = 'none';
      companyAmt.style.display = 'none';
      if (broker.nextElementSibling !== refPct) broker.insertAdjacentElement('afterend',refPct);
      if (refPct.nextElementSibling !== companyPct) refPct.insertAdjacentElement('afterend',companyPct);

      broker.classList.add('commission-total-cell');
      if (!broker.querySelector('input')) {
        const pct = looseNum(broker.textContent);
        broker.textContent = `${compact(pct)}%`;
      }

      deductionCard(refPct,refAmt,'仲介人');
      deductionCard(companyPct,companyAmt,'仲介公司');
    });

    const rate = table.querySelector('.case-rate-input')?.closest('td');
    const amount = table.querySelector('.case-amount-input')?.closest('td');
    if (rate) {
      const th = table.querySelectorAll('thead th')[rate.cellIndex];
      if (th) th.textContent = '原始收益率';
    }
    if (amount) {
      const th = table.querySelectorAll('thead th')[amount.cellIndex];
      if (th) th.textContent = '原始收益';
    }
  }

  function decorate(){
    raf = 0;
    document.querySelectorAll('.per-case-profit-table').forEach(decorateTable);
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
      .commission-total-cell{font-weight:800;color:#b42318;background:#fff7f7!important;white-space:nowrap;}
      .commission-deduction-cell{min-width:128px!important;background:#fffafa!important;vertical-align:middle!important;}
      .commission-deduction-control{border-color:#fecaca!important;background:#fff!important;}
      .commission-deduction-control input{color:#991b1b!important;font-weight:800!important;}
      .commission-deduction-control span{color:#b42318!important;}
      .commission-deduction-amount{margin-top:4px;color:#d92d20;font-size:11px;font-weight:900;line-height:1.2;text-align:right;white-space:nowrap;}
      .commission-deduction-amount::before{content:'扣款 ';font-size:9px;font-weight:700;color:#ef4444;}
      .per-case-profit-table th[data-business-settlement-broker],
      .per-case-profit-table th[data-referrer-pct],
      .per-case-profit-table th[data-company-pct]{background:#fff5f5!important;color:#b42318!important;}
      .net-profit-amount,.net-profit-rate{color:#0f7b55!important;font-weight:900!important;}
    `;
    document.head.appendChild(style);
  }

  function init(){
    injectStyle();
    const box = $('#investorGroups');
    if (box) {
      const observer = new MutationObserver(schedule);
      observer.observe(box,{childList:true,subtree:true});
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
