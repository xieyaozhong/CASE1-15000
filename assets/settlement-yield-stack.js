(() => {
  'use strict';

  const OVERRIDE_KEY = 'case1-investor-settlement-overrides-v2';
  let raf = 0;

  const num = value => {
    const n = Number(String(value ?? '').replaceAll(',', '').replace(/[+%]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const floor2 = value => Math.floor((num(value) + Number.EPSILON) * 100) / 100;
  const compact = value => {
    const n = num(value);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
  };
  const money = value => num(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

  function readOverrides() {
    try {
      const data = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (_) {
      return {};
    }
  }

  function writeOverride(key, patch) {
    if (!key) return;
    const store = readOverrides();
    const current = store[key] && typeof store[key] === 'object' ? store[key] : {};
    store[key] = { ...current, ...patch };
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(store));
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      decorate();
    });
  }

  function ensureGrossStack(tr, invested) {
    const cell = tr.cells[3];
    const wrap = cell?.querySelector('.investor-settlement-input.earnings');
    if (!cell || !wrap || invested <= 0) return null;

    let source = wrap.querySelector('input.gross-amount-source');
    if (!source) {
      source = wrap.querySelector('input');
      if (!source) return null;
      source.classList.add('gross-amount-source');
      source.setAttribute('aria-hidden', 'true');
      source.tabIndex = -1;
    }

    let rateInput = wrap.querySelector('input.gross-rate-input');
    let suffix = wrap.querySelector('em.gross-rate-suffix');
    let amount = wrap.querySelector('small.gross-auto-amount');

    if (!rateInput) {
      rateInput = document.createElement('input');
      rateInput.type = 'number';
      rateInput.min = '0';
      rateInput.step = '0.01';
      rateInput.inputMode = 'decimal';
      rateInput.autocomplete = 'off';
      rateInput.className = 'gross-rate-input';
      rateInput.setAttribute('aria-label', '原始收益率');
      rateInput.addEventListener('input', event => {
        event.stopPropagation();
        const rate = Math.max(0, num(event.target.value));
        const grossAmount = floor2(invested * rate / 100);
        source.value = compact(grossAmount);
        const key = tr.dataset.investorOverrideKey;
        writeOverride(key, { profitAmount: String(grossAmount) });
        source.dispatchEvent(new Event('input', { bubbles: true }));
        if (amount) amount.textContent = `+${money(grossAmount)}`;
        schedule();
      });
      wrap.appendChild(rateInput);
    }

    if (!suffix) {
      suffix = document.createElement('em');
      suffix.className = 'gross-rate-suffix';
      suffix.textContent = '%';
      wrap.appendChild(suffix);
    }

    if (!amount) {
      amount = document.createElement('small');
      amount.className = 'gross-auto-amount';
      wrap.appendChild(amount);
    }

    wrap.classList.add('gross-yield-stack');
    const gross = Math.max(0, num(source.value));
    const grossRate = invested > 0 ? gross / invested * 100 : 0;
    if (document.activeElement !== rateInput && rateInput.value !== compact(grossRate)) {
      rateInput.value = compact(grossRate);
    }
    amount.textContent = `+${money(gross)}`;
    return { gross, grossRate };
  }

  function decorateNet(tr, invested, gross) {
    const cell = tr.cells[7];
    if (!cell || invested <= 0) return;

    const companyRate = Math.max(0, num(tr.querySelector('.investor-settlement-input.company input')?.value));
    const personalRate = Math.max(0, num(tr.querySelector('.investor-settlement-input.personal input')?.value));
    const totalRate = Math.min(100, companyRate + personalRate);
    const netAmount = floor2(Math.max(0, gross * (1 - totalRate / 100)));
    const netRate = invested > 0 ? netAmount / invested * 100 : 0;

    cell.classList.add('net-yield-stack');
    cell.dataset.netRate = `${compact(netRate)}%`;
    const expectedAmount = `+${money(netAmount)}`;
    if (cell.textContent !== expectedAmount) cell.textContent = expectedAmount;
  }

  function decorate() {
    document.querySelectorAll('.result-table tbody tr').forEach(tr => {
      if (tr.cells.length < 8) return;
      const invested = Math.max(0, num(tr.cells[2]?.textContent));
      if (invested <= 0) return;
      const gross = ensureGrossStack(tr, invested);
      if (!gross) return;
      decorateNet(tr, invested, gross.gross);
    });
  }

  function injectStyle() {
    if (document.getElementById('settlement-yield-stack-style')) return;
    const style = document.createElement('style');
    style.id = 'settlement-yield-stack-style';
    style.textContent = `
      .investor-settlement-input.earnings.gross-yield-stack{
        display:grid!important;
        grid-template-columns:minmax(52px,68px) auto;
        align-items:center!important;
        justify-content:end!important;
        gap:1px 3px!important;
        min-width:94px!important;
        height:auto!important;
        min-height:46px!important;
        padding:4px 7px!important;
      }
      .gross-yield-stack .gross-amount-source{
        display:none!important;
        width:0!important;
        min-width:0!important;
        height:0!important;
        padding:0!important;
        border:0!important;
      }
      .gross-yield-stack .gross-rate-input{
        display:block!important;
        width:64px!important;
        min-width:0!important;
        height:24px!important;
        padding:0!important;
        border:0!important;
        background:transparent!important;
        text-align:right!important;
        font:inherit!important;
        font-weight:800!important;
        color:#1f4f82!important;
        outline:0!important;
      }
      .gross-yield-stack .gross-rate-suffix{
        display:block!important;
        font-style:normal!important;
        color:#64748b!important;
        font-size:11px!important;
      }
      .gross-yield-stack .gross-auto-amount{
        grid-column:1 / -1;
        display:block!important;
        color:#1f4f82!important;
        font-size:10px!important;
        font-weight:800!important;
        line-height:1.15!important;
        text-align:right!important;
        white-space:nowrap!important;
      }
      .result-table td.net-yield-stack{
        vertical-align:middle!important;
        color:#15803d!important;
        font-weight:800!important;
        line-height:1.15!important;
        white-space:nowrap!important;
      }
      .result-table td.net-yield-stack::before{
        content:attr(data-net-rate);
        display:block;
        margin-bottom:4px;
        color:#15803d;
        font-size:12px;
        font-weight:900;
        line-height:1.1;
      }
    `;
    document.head.appendChild(style);
  }

  function bind() {
    const root = document.getElementById('root');
    if (root) new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
    document.addEventListener('input', event => {
      if (event.target?.closest?.('.investor-settlement-input.company,.investor-settlement-input.personal')) {
        setTimeout(schedule, 0);
      }
    }, true);
    document.addEventListener('click', () => setTimeout(schedule, 30), true);
    window.addEventListener('storage', event => {
      if (event.key === OVERRIDE_KEY) schedule();
    });
  }

  injectStyle();
  bind();
  schedule();
})();