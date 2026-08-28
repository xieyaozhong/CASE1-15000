(() => {
  'use strict';

  const APP_KEY = 'settlement-ledger-v1';
  const OVERRIDE_KEY = 'case1-investor-settlement-overrides-v2';
  const DAY = 86400000;
  let raf = 0;
  let followupRaf = 0;

  const clean = value => String(value ?? '').trim();
  const num = value => {
    const n = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const pct = value => Math.max(0, Math.min(100, num(value)));
  const floor2 = value => Math.floor((num(value) + Number.EPSILON) * 100) / 100;
  const money = value => num(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

  function readApp() {
    try {
      const data = JSON.parse(localStorage.getItem(APP_KEY) || 'null');
      return data && Array.isArray(data.rows) && Array.isArray(data.investors) ? data : null;
    } catch (_) {
      return null;
    }
  }

  function readOverrides() {
    try {
      const data = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (_) {
      return {};
    }
  }

  function settlementDate(row) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(row?.date))) return '';
    const start = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return '';
    const cycle = Math.max(1, Math.round(num(row.cycle) || 28));
    const first = start.getTime() + (cycle - 1) * DAY;
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const steps = first < today ? Math.ceil((today - first) / (cycle * DAY)) : 0;
    return new Date(first + steps * cycle * DAY).toISOString().slice(0, 10);
  }

  function baseGross(row, investor, invested) {
    const setting = row?.profitOverrides?.[investor];
    if (setting?.basis === 'amount') return floor2(Math.max(0, num(setting.amount)));
    const rate = setting?.basis === 'rate' ? num(setting.rate) : num(row?.profitRate);
    return floor2(invested * rate / 100);
  }

  function resolved(row, investor, invested, store = readOverrides()) {
    const raw = store[`${row.id}|${investor}`] || {};
    const gross = raw.profitAmount === undefined || raw.profitAmount === ''
      ? baseGross(row, investor, invested)
      : floor2(Math.max(0, num(raw.profitAmount)));

    let companyRate = raw.company === undefined || raw.company === '' ? pct(row.companyCommission) : pct(raw.company);
    let personalRate = raw.personal === undefined || raw.personal === '' ? pct(row.personalCommission) : pct(raw.personal);
    const sum = companyRate + personalRate;
    if (sum > 100) {
      const factor = 100 / sum;
      companyRate *= factor;
      personalRate *= factor;
    }

    const totalRate = floor2(companyRate + personalRate);
    const companyFee = floor2(gross * companyRate / 100);
    const personalFee = floor2(gross * personalRate / 100);
    const totalFee = floor2(companyFee + personalFee);
    const profit = floor2(Math.max(0, gross - totalFee));
    return { gross, companyRate, personalRate, totalRate, companyFee, personalFee, totalFee, profit };
  }

  function clampFeeInput(input) {
    if (!(input instanceof HTMLInputElement)) return;
    const commissionWrap = input.closest('.investor-settlement-input.company,.investor-settlement-input.personal');
    if (commissionWrap) {
      const tr = input.closest('tr');
      if (!tr) return;
      const isCompany = commissionWrap.classList.contains('company');
      const other = tr.querySelector(isCompany ? '.investor-settlement-input.personal input' : '.investor-settlement-input.company input');
      const max = Math.max(0, 100 - pct(other?.value));
      if (pct(input.value) > max) input.value = String(max);
      return;
    }

    const td = input.closest('.sheet-grid td');
    const tr = td?.parentElement;
    const table = input.closest('.sheet-grid');
    if (!td || !tr || !table) return;
    const headers = [...table.querySelectorAll('thead th')].map(th => clean(th.textContent).replace(/[↕▲▼AUTO]/g, '').trim());
    const companyIndex = headers.findIndex(label => label.startsWith('公司仲介費'));
    const personalIndex = headers.findIndex(label => label.startsWith('個人仲介費'));
    if (companyIndex < 0 || personalIndex < 0) return;
    const cellIndex = td.cellIndex;
    if (cellIndex !== companyIndex && cellIndex !== personalIndex) return;
    const otherIndex = cellIndex === companyIndex ? personalIndex : companyIndex;
    const other = tr.cells[otherIndex]?.querySelector('input');
    const max = Math.max(0, 100 - pct(other?.value));
    if (pct(input.value) > max) input.value = String(max);
  }

  function replaceFirstText(button, text) {
    if (!button) return;
    const node = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (node && node.nodeValue !== text) node.nodeValue = text;
  }

  function relabel() {
    document.querySelectorAll('.result-table').forEach(table => {
      const th = table.querySelectorAll('thead th');
      if (th[3] && th[3].textContent !== '原始收益') th[3].textContent = '原始收益';
      if (th[7] && th[7].textContent !== '收益') th[7].textContent = '收益';
    });

    document.querySelectorAll('.settlement-group-head .net-profit span').forEach(el => {
      if (el.textContent !== '收益') el.textContent = '收益';
    });

    document.querySelectorAll('.sheet-grid thead .sort-button').forEach(button => {
      const label = clean(button.textContent).replace(/[↕▲▼]/g, '').trim();
      if (label === '收益' || label === '收益AUTO') replaceFirstText(button, '原始收益率');
    });

    const pill = document.querySelector('.period-rule-pill');
    if (pill && pill.textContent !== '逐案原始收益預設 6%，可個別輸入') {
      pill.textContent = '逐案原始收益預設 6%，可個別輸入';
    }

    document.querySelectorAll('.project-modal label').forEach(label => {
      const text = clean(label.childNodes[0]?.textContent);
      if (text.startsWith('收益（%）')) label.childNodes[0].textContent = '原始收益率（%）';
    });
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      relabel();
    });
  }

  function scheduleAfterReact() {
    if (followupRaf) cancelAnimationFrame(followupRaf);
    followupRaf = requestAnimationFrame(() => {
      followupRaf = requestAnimationFrame(() => {
        followupRaf = 0;
        schedule();
      });
    });
  }

  function currentRange() {
    const inputs = [...document.querySelectorAll('.period-controls input[type="date"]')];
    return { start: inputs[0]?.value || '', end: inputs[1]?.value || '' };
  }

  function buildGroups() {
    const app = readApp();
    const { start, end } = currentRange();
    const groups = new Map();
    if (!app || !start || !end || end < start) return { groups, start, end };
    app.rows.forEach(row => {
      if (row.badDebt) return;
      const date = settlementDate(row);
      if (!date || date < start || date > end) return;
      app.investors.forEach(investor => {
        const invested = num(row.allocations?.[investor]);
        if (invested <= 0) return;
        if (!groups.has(investor)) groups.set(investor, []);
        groups.get(investor).push({ row, investor, invested, date });
      });
    });
    return { groups, start, end };
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadCsv(name, rows) {
    const text = '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportNetSettlement(event) {
    const button = event.target?.closest?.('.settlement-section button');
    if (!button || button.disabled || !clean(button.textContent).includes('匯出結算表')) return;
    const { groups, start, end } = buildGroups();
    if (!groups.size) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const store = readOverrides();
    const rows = [[
      '投資人','最近結算日','起租案名','投入金額','原始收益','仲介費(%)','仲介費金額',
      '公司仲介費(%)','公司仲介費金額','個人仲介費(%)','個人仲介費金額','收益'
    ]];

    groups.forEach((items, investor) => {
      items.forEach(item => {
        const calc = resolved(item.row, investor, item.invested, store);
        rows.push([
          investor,item.date,item.row.project,item.invested,calc.gross,calc.totalRate,calc.totalFee,
          calc.companyRate,calc.companyFee,calc.personalRate,calc.personalFee,calc.profit
        ]);
      });
    });

    downloadCsv(`投資人結算_${start}_${end}.csv`, rows);
  }

  document.addEventListener('input', event => {
    clampFeeInput(event.target);
    if (event.target?.closest?.('.sheet-grid,.project-modal,.investor-settlement-input')) schedule();
  }, true);

  document.addEventListener('click', exportNetSettlement, true);
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    if (button.closest('.period-controls,.toolbar-actions') || clean(button.textContent).includes('新增投資案')) {
      scheduleAfterReact();
    }
  }, true);

  schedule();
})();