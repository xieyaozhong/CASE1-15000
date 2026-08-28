(() => {
  'use strict';

  const APP_KEY = 'settlement-ledger-v1';
  const OVERRIDE_KEY = 'case1-investor-settlement-overrides-v2';
  const DAY = 86400000;
  let raf = 0;
  let followupRaf = 0;

  const num = value => {
    const n = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const pct = value => Math.max(0, Math.min(100, num(value)));
  const floor2 = value => Math.floor((num(value) + Number.EPSILON) * 100) / 100;
  const compact = value => {
    const n = num(value);
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
  };
  const money = value => num(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const clean = value => String(value ?? '').trim();

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

  function writeOverrides(data) {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(data));
  }

  function overrideKey(rowId, investor) {
    return `${rowId}|${investor}`;
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
    const raw = store[overrideKey(row.id, investor)] || {};
    const gross = raw.profitAmount === undefined || raw.profitAmount === ''
      ? baseGross(row, investor, invested)
      : floor2(Math.max(0, num(raw.profitAmount)));
    const companyRate = raw.company === undefined || raw.company === '' ? pct(row.companyCommission) : pct(raw.company);
    const personalRate = raw.personal === undefined || raw.personal === '' ? pct(row.personalCommission) : pct(raw.personal);
    const totalRate = floor2(companyRate + personalRate);
    const companyFee = floor2(gross * companyRate / 100);
    const personalFee = floor2(gross * personalRate / 100);
    const totalFee = floor2(companyFee + personalFee);
    const net = floor2(Math.max(0, gross - totalFee));
    return { gross, companyRate, personalRate, totalRate, companyFee, personalFee, totalFee, net };
  }

  function currentRange() {
    const inputs = [...document.querySelectorAll('.period-controls input[type="date"]')];
    return { start: inputs[0]?.value || '', end: inputs[1]?.value || '' };
  }

  function buildGroups() {
    const app = readApp();
    const { start, end } = currentRange();
    const groups = new Map();
    if (!app || !start || !end || end < start) return { app, groups, start, end };
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
    return { app, groups, start, end };
  }

  function saveOverride(row, investor, patch) {
    const store = readOverrides();
    const key = overrideKey(row.id, investor);
    const current = store[key] && typeof store[key] === 'object' ? store[key] : {};
    store[key] = { ...current, ...patch };
    writeOverrides(store);
    schedule();
  }

  function makeNumberInput(className, value, suffix, onInput, aria) {
    const wrap = document.createElement('div');
    wrap.className = `investor-settlement-input ${className}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.01';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = compact(value);
    input.setAttribute('aria-label', aria);
    input.addEventListener('input', event => {
      event.stopPropagation();
      onInput(event.target.value);
    });
    input.addEventListener('change', event => event.stopPropagation());
    wrap.appendChild(input);
    if (suffix) {
      const em = document.createElement('em');
      em.textContent = suffix;
      wrap.appendChild(em);
    }
    return wrap;
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function decorateSettlement() {
    const { groups } = buildGroups();
    if (!groups.size) return;
    const store = readOverrides();

    document.querySelectorAll('.settlement-group').forEach(article => {
      const investor = clean(article.querySelector('.settlement-group-head strong')?.textContent);
      const entries = groups.get(investor) || [];
      const rows = [...article.querySelectorAll('.result-table tbody tr')];
      let groupNet = 0;

      rows.forEach((tr, index) => {
        const entry = entries[index];
        if (!entry) return;
        const cells = tr.cells;
        if (cells.length < 8) return;
        const calc = resolved(entry.row, investor, entry.invested, store);
        groupNet += calc.net;
        tr.dataset.investorOverrideKey = overrideKey(entry.row.id, investor);

        let earnings = cells[3].querySelector('.investor-settlement-input.earnings');
        if (!earnings) {
          cells[3].textContent = '';
          earnings = makeNumberInput('earnings', calc.gross, '', value => {
            saveOverride(entry.row, investor, { profitAmount: String(Math.max(0, num(value))) });
          }, `${investor} ${entry.row.project || '投資案'} 收益`);
          cells[3].appendChild(earnings);
        } else {
          const input = earnings.querySelector('input');
          if (document.activeElement !== input && input.value !== compact(calc.gross)) input.value = compact(calc.gross);
        }

        const totalCell = cells[4];
        let totalBox = totalCell.querySelector('.broker-total-auto');
        if (!totalBox) {
          totalCell.textContent = '';
          totalBox = document.createElement('div');
          totalBox.className = 'broker-total-auto';
          totalBox.innerHTML = '<strong></strong><small></small>';
          totalCell.appendChild(totalBox);
        }
        setText(totalBox.querySelector('strong'), `${compact(calc.totalRate)}%`);
        setText(totalBox.querySelector('small'), `-${money(calc.totalFee)}`);

        let company = cells[5].querySelector('.investor-settlement-input.company');
        if (!company) {
          cells[5].textContent = '';
          company = makeNumberInput('company', calc.companyRate, '%', value => {
            saveOverride(entry.row, investor, { company: String(pct(value)) });
          }, `${investor} ${entry.row.project || '投資案'} 公司仲介費`);
          const small = document.createElement('small');
          small.className = 'fee-deduction company-deduction';
          cells[5].append(company, small);
        }
        const companyInput = company.querySelector('input');
        if (document.activeElement !== companyInput && companyInput.value !== compact(calc.companyRate)) companyInput.value = compact(calc.companyRate);
        setText(cells[5].querySelector('.company-deduction'), `-${money(calc.companyFee)}`);

        let personal = cells[6].querySelector('.investor-settlement-input.personal');
        if (!personal) {
          cells[6].textContent = '';
          personal = makeNumberInput('personal', calc.personalRate, '%', value => {
            saveOverride(entry.row, investor, { personal: String(pct(value)) });
          }, `${investor} ${entry.row.project || '投資案'} 個人仲介費`);
          const small = document.createElement('small');
          small.className = 'fee-deduction personal-deduction';
          cells[6].append(personal, small);
        }
        const personalInput = personal.querySelector('input');
        if (document.activeElement !== personalInput && personalInput.value !== compact(calc.personalRate)) personalInput.value = compact(calc.personalRate);
        setText(cells[6].querySelector('.personal-deduction'), `-${money(calc.personalFee)}`);

        setText(cells[7], `+${money(calc.net)}`);
        cells[7].classList.add('positive');
      });

      const groupNetEl = article.querySelector('.settlement-group-head .net-profit b');
      setText(groupNetEl, `+${money(groupNet)}`);
    });
  }

  function activeRows(app) {
    if (!app) return [];
    const active = document.querySelector('.month-tab-track button[aria-selected="true"]');
    const label = clean(active?.textContent);
    if (label.startsWith('呆帳')) return app.rows.filter(row => row.badDebt);
    if (label.startsWith('總表') || !label) return app.rows.filter(row => !row.badDebt);
    const hit = /(\d{4})年(\d{1,2})月/.exec(label);
    if (!hit) return app.rows.filter(row => !row.badDebt);
    const month = `${hit[1]}-${String(Number(hit[2])).padStart(2, '0')}`;
    return app.rows.filter(row => !row.badDebt && settlementDate(row).startsWith(month));
  }

  function decorateOverview() {
    const app = readApp();
    const card = document.querySelector('.overview-card.profit-card');
    if (!app || !card) return;
    const rows = activeRows(app);
    const store = readOverrides();
    const values = app.investors.map(investor => {
      let profit = 0;
      rows.forEach(row => {
        const invested = num(row.allocations?.[investor]);
        if (invested <= 0) return;
        profit += resolved(row, investor, invested, store).net;
      });
      return { investor, profit: floor2(profit) };
    }).filter(item => item.profit !== 0 || rows.some(row => num(row.allocations?.[item.investor]) > 0));
    const total = floor2(values.reduce((sum, item) => sum + item.profit, 0));
    const heading = card.querySelector('.overview-heading span');
    if (heading) {
      const scope = clean(heading.textContent).split('｜')[0] || '總表';
      setText(heading, `${scope}｜+${money(total)}`);
    }
    const pills = card.querySelector('.investor-pills');
    if (pills) {
      const signature = values.map(item => `${item.investor}:${item.profit}`).join('|');
      if (pills.dataset.netSignature !== signature) {
        pills.dataset.netSignature = signature;
        pills.innerHTML = values.map(item => `<span><b>${escapeHtml(item.investor)}</b>+${money(item.profit)}</span>`).join('');
      }
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function headerIndex(label) {
    const headers = [...document.querySelectorAll('.sheet-grid thead th')];
    return headers.findIndex(th => clean(th.querySelector('.sort-button')?.firstChild?.textContent || th.textContent) === label);
  }

  const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  function setReactValue(input, value) {
    if (!input) return;
    const next = String(value);
    if (String(input.value) === next) return;
    if (nativeValueSetter) nativeValueSetter.call(input, next);
    else input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function decorateMainFees() {
    const table = document.querySelector('.sheet-grid');
    if (!table) return;
    const totalIndex = headerIndex('仲介費');
    const companyIndex = headerIndex('公司仲介費');
    const personalIndex = headerIndex('個人仲介費');
    if (totalIndex < 0 || companyIndex < 0 || personalIndex < 0) return;
    table.querySelectorAll('tbody tr').forEach(tr => {
      const totalInput = tr.cells[totalIndex]?.querySelector('input');
      const companyInput = tr.cells[companyIndex]?.querySelector('input');
      const personalInput = tr.cells[personalIndex]?.querySelector('input');
      if (!totalInput || !companyInput || !personalInput) return;
      totalInput.readOnly = true;
      totalInput.tabIndex = -1;
      totalInput.title = '仲介費 = 公司仲介費 + 個人仲介費；結算時可依投資人個別調整';
      totalInput.closest('td')?.classList.add('auto-total-fee-cell');
      const total = floor2(pct(companyInput.value) + pct(personalInput.value));
      if (Math.abs(num(totalInput.value) - total) > 1e-9) setReactValue(totalInput, compact(total));
    });
  }

  function findModalInput(label) {
    const labels = [...document.querySelectorAll('.project-modal label')];
    const el = labels.find(item => clean(item.childNodes[0]?.textContent).startsWith(label));
    return el?.querySelector('input') || null;
  }

  function decorateProjectModal() {
    const modal = document.querySelector('.project-modal');
    if (!modal) return;
    const totalInput = findModalInput('仲介費（%）');
    const companyInput = findModalInput('公司仲介費（%）');
    const personalInput = findModalInput('個人仲介費（%）');
    if (!totalInput || !companyInput || !personalInput) return;
    totalInput.readOnly = true;
    totalInput.tabIndex = -1;
    const total = floor2(pct(companyInput.value) + pct(personalInput.value));
    if (Math.abs(num(totalInput.value) - total) > 1e-9) setReactValue(totalInput, compact(total));
    const fieldset = modal.querySelector('.financial-fields');
    const help = fieldset?.querySelector('p');
    setText(help, '仲介費會自動等於「公司仲介費 + 個人仲介費」；結算時可針對同一投資案的不同投資人個別調整收益與仲介費。');
  }

  function decorate() {
    raf = 0;
    decorateMainFees();
    decorateProjectModal();
    decorateSettlement();
    decorateOverview();
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(decorate);
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

  function interceptSettlementExport(event) {
    const button = event.target?.closest?.('.settlement-section button');
    if (!button || !clean(button.textContent).includes('匯出結算表') || button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { groups, start, end } = buildGroups();
    if (!groups.size) return;
    const store = readOverrides();
    const rows = [[
      '投資人','最近結算日','起租案名','投入金額','收益','仲介費(%)','仲介費金額',
      '公司仲介費(%)','公司仲介費金額','個人仲介費(%)','個人仲介費金額','淨收益'
    ]];
    groups.forEach((items, investor) => {
      items.forEach(item => {
        const calc = resolved(item.row, investor, item.invested, store);
        rows.push([
          investor,item.date,item.row.project,item.invested,calc.gross,calc.totalRate,calc.totalFee,
          calc.companyRate,calc.companyFee,calc.personalRate,calc.personalFee,calc.net
        ]);
      });
    });
    downloadCsv(`投資人結算_${start}_${end}.csv`, rows);
  }

  function injectStyle() {
    if (document.getElementById('investor-settlement-overrides-style')) return;
    const style = document.createElement('style');
    style.id = 'investor-settlement-overrides-style';
    style.textContent = `
      .auto-total-fee-cell input[readonly]{background:#f6f8fb!important;color:#475569!important;font-weight:800!important;cursor:default!important;}
      .investor-settlement-input{display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;min-width:92px;height:34px;padding:0 7px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;}
      .investor-settlement-input input{width:66px!important;min-width:0!important;border:0!important;outline:0!important;background:transparent!important;text-align:right!important;font:inherit!important;font-weight:800!important;color:#1f2937!important;padding:0!important;}
      .investor-settlement-input em{font-style:normal;color:#64748b;font-size:11px;}
      .investor-settlement-input.earnings{border-color:#bfd0e5;background:#fbfdff;}
      .investor-settlement-input.earnings input{color:#1f4f82!important;}
      .investor-settlement-input.company,.investor-settlement-input.personal{border-color:#fecaca;background:#fffafa;}
      .investor-settlement-input.company input,.investor-settlement-input.personal input{color:#991b1b!important;}
      .broker-total-auto{display:grid;justify-items:end;gap:2px;min-width:84px;}
      .broker-total-auto strong{color:#7c3aed;font-size:12px;}
      .broker-total-auto small,.fee-deduction{display:block;margin-top:3px;color:#d92d20;font-size:10px;font-weight:800;text-align:right;white-space:nowrap;}
      .result-table td:nth-child(4),.result-table td:nth-child(5),.result-table td:nth-child(6),.result-table td:nth-child(7){vertical-align:middle;}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    document.addEventListener('input', event => {
      if (event.target?.closest?.('.sheet-grid,.project-modal')) schedule();
    }, true);

    document.addEventListener('click', event => {
      const monthOrSettlement = event.target?.closest?.('.month-tab-track button,.period-controls button');
      const button = event.target?.closest?.('button');
      if (monthOrSettlement || (button && clean(button.textContent).includes('新增投資案'))) {
        scheduleAfterReact();
      }
    }, true);

    document.addEventListener('click', interceptSettlementExport, true);
    window.addEventListener('storage', event => {
      if ([APP_KEY, OVERRIDE_KEY].includes(event.key)) scheduleAfterReact();
    });
  }

  injectStyle();
  bind();
  schedule();
})();