(() => {
  'use strict';

  const STORAGE_KEY = 'case1-safe-column-widths-v1';
  const MIN_COLUMN = 54;
  const HANDLE_WIDTH = 14;
  let raf = 0;
  let measureCanvas = null;
  let measureContext = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const px = value => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };

  function readWidths() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (_) {
      return {};
    }
  }

  function writeWidths(widths) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  }

  function tableType(table) {
    if (table?.classList.contains('sheet-grid')) return 'sheet';
    if (table?.classList.contains('result-table')) return 'settlement';
    return '';
  }

  function headerLabel(table, index) {
    const th = table?.tHead?.rows?.[0]?.cells?.[index];
    if (!th) return `col-${index}`;
    return clean(th.textContent)
      .replace(/[↕▲▼]/g, '')
      .replace(/AUTO/g, '')
      .trim() || `col-${index}`;
  }

  function columnKey(table, index) {
    return `${tableType(table)}:${index}:${headerLabel(table, index)}`;
  }

  function matchingTables(table) {
    const type = tableType(table);
    if (type === 'settlement') return [...document.querySelectorAll('table.result-table')];
    if (type === 'sheet') {
      const main = document.querySelector('table.sheet-grid');
      return main ? [main] : [];
    }
    return table ? [table] : [];
  }

  function ensureMeasureContext() {
    if (!measureCanvas) {
      measureCanvas = document.createElement('canvas');
      measureContext = measureCanvas.getContext('2d');
    }
    return measureContext;
  }

  function textWidth(text, element) {
    const value = clean(text);
    if (!value) return 0;
    const context = ensureMeasureContext();
    if (!context) return value.length * 8;
    const style = getComputedStyle(element);
    context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return context.measureText(value).width;
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function measureCell(cell) {
    if (!cell || !visible(cell)) return MIN_COLUMN;
    const style = getComputedStyle(cell);
    const chrome = px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
    let needed = MIN_COLUMN;

    const naturalText = clean(cell.innerText);
    if (naturalText) needed = Math.max(needed, textWidth(naturalText, cell) + chrome + 18);

    cell.querySelectorAll('input, textarea, select').forEach(input => {
      if (!visible(input) || input.getAttribute('aria-hidden') === 'true') return;
      const inputStyle = getComputedStyle(input);
      const inputChrome = px(inputStyle.paddingLeft) + px(inputStyle.paddingRight) + px(inputStyle.borderLeftWidth) + px(inputStyle.borderRightWidth);
      const value = input.value || input.placeholder || '';
      let width = textWidth(value || '0', input) + inputChrome + 30;

      const wrap = input.closest('.investor-settlement-input, .has-suffix');
      if (wrap) {
        const suffix = [...wrap.querySelectorAll('em')].filter(visible).map(el => clean(el.textContent)).join(' ');
        if (suffix) width += textWidth(suffix, wrap) + 12;
        const sublines = [...wrap.querySelectorAll('small')].filter(visible).map(el => clean(el.textContent));
        sublines.forEach(line => {
          width = Math.max(width, textWidth(line, wrap) + 18);
        });
      }
      needed = Math.max(needed, width + chrome + 8);
    });

    cell.querySelectorAll('button').forEach(button => {
      if (!visible(button)) return;
      const buttonStyle = getComputedStyle(button);
      const buttonChrome = px(buttonStyle.paddingLeft) + px(buttonStyle.paddingRight) + px(buttonStyle.borderLeftWidth) + px(buttonStyle.borderRightWidth);
      const width = textWidth(button.textContent, button) + buttonChrome + chrome + HANDLE_WIDTH + 12;
      needed = Math.max(needed, width);
    });

    return Math.ceil(needed);
  }

  function measureColumnMin(table, index) {
    const tables = matchingTables(table);
    let min = MIN_COLUMN;
    tables.forEach(current => {
      const head = current.tHead?.rows?.[0]?.cells?.[index];
      if (head) min = Math.max(min, measureCell(head));
      [...(current.tBodies?.[0]?.rows || [])].forEach(row => {
        const cell = row.cells?.[index];
        if (cell) min = Math.max(min, measureCell(cell));
      });
    });
    return Math.ceil(min);
  }

  function applyWidth(table, index, width) {
    const safeWidth = Math.max(MIN_COLUMN, Math.ceil(width));
    matchingTables(table).forEach(current => {
      current.classList.add('safe-resizable-table');
      [...current.rows].forEach(row => {
        const cell = row.cells?.[index];
        if (!cell) return;
        cell.style.setProperty('width', `${safeWidth}px`, 'important');
        cell.style.setProperty('min-width', `${safeWidth}px`, 'important');
        cell.style.setProperty('max-width', 'none', 'important');
      });
    });
    return safeWidth;
  }

  function persistWidth(table, index, width) {
    const widths = readWidths();
    widths[columnKey(table, index)] = Math.ceil(width);
    writeWidths(widths);
  }

  function ensureColumn(table, index, persistExpansion = true) {
    if (!table || index < 0) return;
    const widths = readWidths();
    const key = columnKey(table, index);
    const min = measureColumnMin(table, index);
    const head = table.tHead?.rows?.[0]?.cells?.[index];
    const current = Math.ceil(head?.getBoundingClientRect().width || min);
    const saved = Number(widths[key]);
    const desired = Math.max(min, Number.isFinite(saved) && saved > 0 ? saved : current);
    const applied = applyWidth(table, index, desired);
    if (persistExpansion && (!Number.isFinite(saved) || saved < applied)) {
      widths[key] = applied;
      writeWidths(widths);
    }
  }

  function beginResize(event, handle) {
    if (event.button !== undefined && event.button !== 0) return;
    const th = handle.closest('th');
    const table = handle.closest('table');
    if (!th || !table) return;

    event.preventDefault();
    event.stopPropagation();

    const index = th.cellIndex;
    const min = measureColumnMin(table, index);
    const startX = event.clientX;
    const startWidth = Math.max(min, th.getBoundingClientRect().width);
    let lastWidth = startWidth;
    document.body.classList.add('is-column-resizing');
    th.classList.add('is-resizing-column');

    try { handle.setPointerCapture?.(event.pointerId); } catch (_) {}

    const onMove = moveEvent => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const next = Math.max(min, startWidth + (moveEvent.clientX - startX));
      lastWidth = applyWidth(table, index, next);
    };

    const onUp = upEvent => {
      upEvent?.preventDefault?.();
      upEvent?.stopPropagation?.();
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      document.body.classList.remove('is-column-resizing');
      th.classList.remove('is-resizing-column');
      persistWidth(table, index, Math.max(min, lastWidth));
      schedule();
    };

    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', onUp, { capture: true, passive: false });
  }

  function autoFit(event, handle) {
    event.preventDefault();
    event.stopPropagation();
    const th = handle.closest('th');
    const table = handle.closest('table');
    if (!th || !table) return;
    const width = measureColumnMin(table, th.cellIndex);
    applyWidth(table, th.cellIndex, width);
    persistWidth(table, th.cellIndex, width);
  }

  function ensureHandle(th) {
    if (!th || th.querySelector(':scope > .safe-col-resizer')) return;
    const handle = document.createElement('span');
    handle.className = 'safe-col-resizer';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `${clean(th.textContent) || '欄位'} 欄寬調整`);
    handle.title = '拖曳調整欄寬；雙擊自動符合內容';
    handle.addEventListener('pointerdown', event => beginResize(event, handle));
    handle.addEventListener('dblclick', event => autoFit(event, handle));
    handle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    th.appendChild(handle);
  }

  function decorate() {
    raf = 0;
    const tables = [
      ...document.querySelectorAll('table.sheet-grid'),
      ...document.querySelectorAll('table.result-table')
    ];
    const processed = new Set();

    tables.forEach(table => {
      table.classList.add('safe-resizable-table');
      const headers = [...(table.tHead?.rows?.[0]?.cells || [])];
      headers.forEach((th, index) => {
        th.classList.add('safe-resizable-head');
        ensureHandle(th);
        const key = columnKey(table, index);
        if (processed.has(key)) return;
        processed.add(key);
        ensureColumn(table, index, true);
      });
    });
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(decorate);
  }

  function injectStyle() {
    if (document.getElementById('safe-column-resize-style')) return;
    const style = document.createElement('style');
    style.id = 'safe-column-resize-style';
    style.textContent = `
      .grid-viewport,.result-scroll{max-width:100%!important;overflow-x:auto!important;overflow-y:visible!important;-webkit-overflow-scrolling:touch;}
      table.safe-resizable-table{width:max-content!important;min-width:100%!important;table-layout:auto!important;}
      table.safe-resizable-table th,table.safe-resizable-table td{box-sizing:border-box!important;overflow:visible!important;text-overflow:clip!important;}
      table.safe-resizable-table td input,table.safe-resizable-table td textarea,table.safe-resizable-table td select{box-sizing:border-box!important;max-width:100%!important;}
      table.safe-resizable-table .safe-resizable-head{position:relative!important;}
      .safe-col-resizer{position:absolute;top:0;right:-7px;width:14px;height:100%;z-index:30;cursor:col-resize;touch-action:none;user-select:none;-webkit-user-select:none;}
      .safe-col-resizer::after{content:'';position:absolute;top:18%;bottom:18%;left:6px;width:2px;border-radius:2px;background:transparent;transition:background .12s ease;}
      .safe-resizable-head:hover>.safe-col-resizer::after,.safe-resizable-head.is-resizing-column>.safe-col-resizer::after{background:rgba(33,115,70,.48);}
      body.is-column-resizing,body.is-column-resizing *{cursor:col-resize!important;user-select:none!important;-webkit-user-select:none!important;}
      @media (max-width:720px){.safe-col-resizer{right:-9px;width:18px}.safe-col-resizer::after{left:8px}.grid-viewport,.result-scroll{overscroll-behavior-x:contain}}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    const root = document.getElementById('root');
    if (root) new MutationObserver(schedule).observe(root, { childList: true, subtree: true });

    document.addEventListener('input', event => {
      const table = event.target?.closest?.('table.sheet-grid,table.result-table');
      const cell = event.target?.closest?.('td,th');
      if (!table || !cell) return;
      window.setTimeout(() => ensureColumn(table, cell.cellIndex, true), 0);
    }, true);

    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) schedule();
    });
  }

  injectStyle();
  bind();
  schedule();
})();