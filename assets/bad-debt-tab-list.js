(() => {
  'use strict';

  const APP_KEY = 'settlement-ledger-v1';
  let requested = false;
  let raf = 0;
  let followupRaf = 0;

  const clean = value => String(value ?? '').trim();
  const money = value => {
    const n = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  function readBadDebts() {
    try {
      const state = JSON.parse(localStorage.getItem(APP_KEY) || 'null');
      if (!state || !Array.isArray(state.rows)) return [];
      return state.rows.filter(row => row && row.badDebt === true);
    } catch (_) {
      return [];
    }
  }

  function activeTab() {
    return document.querySelector('.bad-debt-tab');
  }

  function isReactBadDebtActive() {
    const tab = activeTab();
    return !!tab && (tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true');
  }

  function ensurePanel(viewport) {
    let panel = viewport.querySelector(':scope > .bad-debt-list-fallback');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'bad-debt-list-fallback';
      panel.setAttribute('aria-live', 'polite');
      viewport.appendChild(panel);
    }
    return panel;
  }

  function renderFallback(panel, rows) {
    if (!rows.length) {
      if (panel.dataset.signature === 'empty') return;
      panel.dataset.signature = 'empty';
      panel.innerHTML = `
        <div class="bad-debt-empty-state">
          <strong>目前沒有呆帳案件</strong>
          <span>可使用「＋ 呆帳」新增，或將案件狀態標記為呆帳。</span>
        </div>`;
      return;
    }

    const signature = rows.map(row => [row.id, row.date, row.project, row.source, row.amount, row.notes].join('|')).join('||');
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    panel.innerHTML = `
      <div class="bad-debt-list-title">
        <strong>呆帳案件列表</strong>
        <span>${rows.length} 筆</span>
      </div>
      <div class="bad-debt-list-body">
        ${rows.map((row, index) => `
          <article class="bad-debt-list-item">
            <span class="bad-debt-list-no">${index + 1}</span>
            <div class="bad-debt-list-main">
              <strong>${escapeHtml(clean(row.project) || '未命名案件')}</strong>
              <small>${escapeHtml(clean(row.date) || '尚未填日期')} · ${escapeHtml(clean(row.source) || '尚未填案源')}</small>
            </div>
            <div class="bad-debt-list-meta">
              <span>案件金額</span>
              <b>${money(row.amount)}</b>
            </div>
            <div class="bad-debt-list-status">呆帳</div>
          </article>`).join('')}
      </div>`;
  }

  function clearFallback(viewport, sheetWrap) {
    sheetWrap?.classList.remove('bad-debt-list-mode');
    viewport?.classList.remove('bad-debt-force-view');
    viewport?.querySelector(':scope > .bad-debt-list-fallback')?.remove();
  }

  function decorate() {
    raf = 0;
    const tab = activeTab();
    const viewport = document.querySelector('.grid-viewport');
    const tbody = document.querySelector('.sheet-grid tbody');
    const sheetWrap = document.querySelector('.sheet-wrap');
    if (!tab || !viewport || !tbody || !sheetWrap) return;

    const reactActive = isReactBadDebtActive();
    const inBadDebtMode = requested || reactActive;
    if (!inBadDebtMode) {
      clearFallback(viewport, sheetWrap);
      return;
    }

    sheetWrap.classList.add('bad-debt-list-mode');
    viewport.classList.add('bad-debt-force-view');

    const existingPanel = viewport.querySelector(':scope > .bad-debt-list-fallback');
    const renderedBadRows = tbody.querySelectorAll('tr.bad-debt-row');
    const renderedOtherRow = tbody.querySelector('tr:not(.bad-debt-row)');

    if (reactActive) {
      if (renderedBadRows.length > 0 && !renderedOtherRow) {
        existingPanel?.remove();
        return;
      }
      const panel = existingPanel || ensurePanel(viewport);
      renderFallback(panel, []);
      return;
    }

    const panel = existingPanel || ensurePanel(viewport);
    renderFallback(panel, readBadDebts());
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

  function injectStyle() {
    if (document.getElementById('bad-debt-tab-list-style')) return;
    const style = document.createElement('style');
    style.id = 'bad-debt-tab-list-style';
    style.textContent = `
      .sheet-wrap.bad-debt-list-mode .sheet-caption strong{color:#9f3340;}
      .grid-viewport.bad-debt-force-view tbody tr:not(.bad-debt-row){display:none!important;}
      .bad-debt-list-fallback{box-sizing:border-box;width:100%;min-width:0;padding:14px;background:#fffafa;border-top:1px solid #f1d6d9;}
      .bad-debt-list-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;color:#8f2f3a;}
      .bad-debt-list-title strong{font-size:13px;}
      .bad-debt-list-title span{font-size:11px;font-weight:800;background:#fbeaec;border:1px solid #efcdd1;border-radius:999px;padding:3px 8px;white-space:nowrap;}
      .bad-debt-list-body{display:grid;gap:7px;}
      .bad-debt-list-item{display:grid;grid-template-columns:28px minmax(150px,1fr) minmax(90px,auto) auto;align-items:center;gap:10px;min-width:0;padding:10px 12px;border:1px solid #eadadd;border-radius:10px;background:#fff;}
      .bad-debt-list-no{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:#f7edef;color:#8f3f48;font-size:10px;font-weight:800;}
      .bad-debt-list-main{display:grid;gap:3px;min-width:0;}
      .bad-debt-list-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#243247;font-size:12px;}
      .bad-debt-list-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7a8799;font-size:10px;}
      .bad-debt-list-meta{display:grid;justify-items:end;gap:2px;white-space:nowrap;}
      .bad-debt-list-meta span{color:#8793a4;font-size:9px;}
      .bad-debt-list-meta b{color:#334155;font-size:12px;}
      .bad-debt-list-status{color:#a73737;background:#fff1f2;border:1px solid #efb4b9;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;white-space:nowrap;}
      .bad-debt-empty-state{display:grid;place-items:center;gap:6px;min-height:126px;padding:24px;text-align:center;border:1px dashed #e4c5c9;border-radius:10px;background:#fff;}
      .bad-debt-empty-state strong{color:#8f3f48;font-size:13px;}
      .bad-debt-empty-state span{color:#7c8796;font-size:11px;line-height:1.5;}
      @media (max-width:620px){
        .bad-debt-list-fallback{padding:10px;}
        .bad-debt-list-item{grid-template-columns:24px minmax(0,1fr) auto;gap:8px;padding:9px;}
        .bad-debt-list-meta{grid-column:2;grid-row:2;justify-items:start;display:flex;align-items:center;gap:6px;}
        .bad-debt-list-status{grid-column:3;grid-row:1 / span 2;}
      }
    `;
    document.head.appendChild(style);
  }

  function bind() {
    document.addEventListener('click', event => {
      const badDebtTab = event.target?.closest?.('.bad-debt-tab');
      if (badDebtTab) {
        requested = true;
        const viewport = document.querySelector('.grid-viewport');
        if (viewport) {
          viewport.scrollTop = 0;
          viewport.scrollLeft = 0;
        }
        scheduleAfterReact();
        return;
      }

      const otherTab = event.target?.closest?.('.month-tab-track button:not(.bad-debt-tab)');
      if (otherTab) {
        requested = false;
        scheduleAfterReact();
        return;
      }

      if (event.target?.closest?.('.bad-debt-chip,.bad-debt-modal,.manage-bad-debt')) {
        scheduleAfterReact();
      }
    }, true);

    document.addEventListener('change', event => {
      if (event.target?.closest?.('.bad-debt-modal')) scheduleAfterReact();
    }, true);

    window.addEventListener('storage', event => {
      if (event.key === APP_KEY) scheduleAfterReact();
    });
  }

  injectStyle();
  bind();
  schedule();
})();