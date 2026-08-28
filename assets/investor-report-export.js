(() => {
  'use strict';

  let raf = 0;
  let followupRaf = 0;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const safeName = value => clean(value).replace(/[\\/:*?"<>|]/g, '_') || '投資人';

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      decorate();
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

  function getInvestor(article) {
    return clean(article.querySelector('.settlement-group-head > div:first-child strong')?.textContent || '投資人');
  }

  function getPeriod() {
    const inputs = [...document.querySelectorAll('.period-controls input[type="date"]')];
    return {
      start: inputs[0]?.value || '',
      end: inputs[1]?.value || ''
    };
  }

  function getSummary(article) {
    return [...article.querySelectorAll('.settlement-group-head > div')].map(block => ({
      label: clean(block.querySelector('span')?.textContent || ''),
      value: clean(block.querySelector('strong, b')?.textContent || '')
    })).filter(item => item.label || item.value);
  }

  function cellText(cell) {
    if (!cell) return '';

    const gross = cell.querySelector('.gross-rate-input');
    if (gross) {
      const amount = clean(cell.querySelector('.gross-auto-amount')?.textContent || '');
      return `${clean(gross.value)}%${amount ? `\n${amount}` : ''}`;
    }

    const company = cell.querySelector('.investor-settlement-input.company input');
    if (company) {
      const amount = clean(cell.querySelector('.company-deduction')?.textContent || '');
      return `${clean(company.value)}%${amount ? `\n${amount}` : ''}`;
    }

    const personal = cell.querySelector('.investor-settlement-input.personal input');
    if (personal) {
      const amount = clean(cell.querySelector('.personal-deduction')?.textContent || '');
      return `${clean(personal.value)}%${amount ? `\n${amount}` : ''}`;
    }

    const total = cell.querySelector('.broker-total-auto');
    if (total) {
      const rate = clean(total.querySelector('strong')?.textContent || '');
      const amount = clean(total.querySelector('small')?.textContent || '');
      return `${rate}${amount ? `\n${amount}` : ''}`;
    }

    if (cell.classList.contains('net-yield-stack')) {
      const rate = clean(cell.dataset.netRate || '');
      const amount = clean(cell.textContent || '');
      return `${rate}${amount ? `\n${amount}` : ''}`;
    }

    const input = cell.querySelector('input:not([aria-hidden="true"])');
    if (input) return clean(input.value);
    return clean(cell.innerText || cell.textContent || '');
  }

  function getTable(article) {
    const table = article.querySelector('.result-table');
    if (!table) return { headers: [], rows: [] };
    const headers = [...table.querySelectorAll('thead th')].map(th => clean(th.textContent));
    const rows = [...table.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(cellText));
    return { headers, rows };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawRoundedFill(ctx, x, y, w, h, r, fill, stroke = '') {
    roundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function fitText(ctx, text, maxWidth, font, minSize = 14) {
    const match = /(\d+)px/.exec(font);
    const startSize = match ? Number(match[1]) : 20;
    let size = startSize;
    while (size > minSize) {
      const nextFont = font.replace(/\d+px/, `${size}px`);
      ctx.font = nextFont;
      if (ctx.measureText(text).width <= maxWidth) return nextFont;
      size -= 1;
    }
    return font.replace(/\d+px/, `${minSize}px`);
  }

  function drawMultiline(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2, align = 'center') {
    const parts = String(text ?? '').split(/\n+/).map(clean).filter(Boolean);
    const lines = parts.length ? parts : ['-'];
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    lines.slice(0, maxLines).forEach((line, index) => {
      let display = line;
      while (display.length > 1 && ctx.measureText(display).width > maxWidth) {
        display = display.slice(0, -1);
      }
      if (display !== line && display.length > 1) display = `${display.slice(0, -1)}…`;
      ctx.fillText(display, x, y + (index - (Math.min(lines.length, maxLines) - 1) / 2) * lineHeight);
    });
  }

  function columnWeights(headers) {
    return headers.map(label => {
      const text = clean(label);
      if (/投資案|案名/.test(text)) return 1.65;
      if (/日期/.test(text)) return 1.18;
      if (/投入/.test(text)) return 1.06;
      if (/原始收益|淨收益|收益/.test(text)) return 1.2;
      if (/仲介/.test(text)) return 1.13;
      return 1;
    });
  }

  function drawReport(article) {
    const investor = getInvestor(article);
    const summary = getSummary(article);
    const { headers, rows } = getTable(article);
    const { start, end } = getPeriod();

    const width = 1440;
    const margin = 56;
    const contentWidth = width - margin * 2;
    const topHeight = 176;
    const metricGap = 14;
    const metricColumns = Math.min(4, Math.max(1, summary.length));
    const metricRows = Math.ceil(Math.max(summary.length, 1) / metricColumns);
    const metricHeight = 92;
    const summaryHeight = metricRows * metricHeight + Math.max(0, metricRows - 1) * metricGap;
    const tableTopGap = 32;
    const tableHeaderHeight = 58;
    const rowHeight = 78;
    const footerHeight = 86;
    const tableHeight = headers.length ? tableHeaderHeight + Math.max(rows.length, 1) * rowHeight : 120;
    const height = margin + topHeight + 28 + summaryHeight + tableTopGap + tableHeight + footerHeight + margin;

    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = '#f7fafc';
    ctx.fillRect(0, 0, width, height);

    drawRoundedFill(ctx, margin, margin, contentWidth, height - margin * 2, 26, '#ffffff', '#d9e4ee');

    const headerX = margin;
    const headerY = margin;
    ctx.save();
    roundedRect(ctx, headerX, headerY, contentWidth, topHeight, 26);
    ctx.clip();
    const gradient = ctx.createLinearGradient(headerX, headerY, headerX + contentWidth, headerY + topHeight);
    gradient.addColorStop(0, '#dceaf8');
    gradient.addColorStop(0.55, '#e8f2fb');
    gradient.addColorStop(1, '#f4f8fc');
    ctx.fillStyle = gradient;
    ctx.fillRect(headerX, headerY, contentWidth, topHeight);
    ctx.restore();

    const avatarSize = 82;
    const avatarX = margin + 34;
    const avatarY = margin + (topHeight - avatarSize) / 2;
    drawRoundedFill(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2, '#f8fbff', '#a9c5df');
    ctx.fillStyle = '#315f8c';
    ctx.font = '800 30px "PingFang TC","Microsoft JhengHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(investor.slice(0, 1) || '財', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 1);

    const titleX = avatarX + avatarSize + 26;
    ctx.fillStyle = '#284c70';
    ctx.font = fitText(ctx, `${investor}｜財務報表`, 580, '850 34px "PingFang TC","Microsoft JhengHei",sans-serif', 22);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${investor}｜財務報表`, titleX, margin + 76);

    ctx.fillStyle = '#71869a';
    ctx.font = '600 17px "PingFang TC","Microsoft JhengHei",sans-serif';
    const period = start && end ? `${start} ～ ${end}` : '目前結算明細';
    ctx.fillText(period, titleX, margin + 112);

    ctx.fillStyle = '#7f91a3';
    ctx.font = '600 15px "PingFang TC","Microsoft JhengHei",sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('週結算中心', margin + contentWidth - 34, margin + 62);
    ctx.fillText(new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()), margin + contentWidth - 34, margin + 94);

    let y = margin + topHeight + 28;
    const metricWidth = (contentWidth - 68 - metricGap * (metricColumns - 1)) / metricColumns;
    const metricStartX = margin + 34;
    summary.forEach((item, index) => {
      const col = index % metricColumns;
      const row = Math.floor(index / metricColumns);
      const x = metricStartX + col * (metricWidth + metricGap);
      const boxY = y + row * (metricHeight + metricGap);
      drawRoundedFill(ctx, x, boxY, metricWidth, metricHeight, 15, '#fbfdff', '#dbe6f0');
      ctx.fillStyle = '#7a8ea2';
      ctx.font = '700 14px "PingFang TC","Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.label || '資料', x + 18, boxY + 30);
      ctx.fillStyle = /收益/.test(item.label) ? '#27835a' : '#2d5276';
      ctx.font = fitText(ctx, item.value || '-', metricWidth - 36, '850 24px "PingFang TC","Microsoft JhengHei",sans-serif', 16);
      ctx.fillText(item.value || '-', x + 18, boxY + 65);
    });

    y += summaryHeight + tableTopGap;

    if (headers.length) {
      const weights = columnWeights(headers);
      const weightTotal = weights.reduce((sum, n) => sum + n, 0);
      const colWidths = weights.map(weight => contentWidth * weight / weightTotal);
      let x = margin;

      ctx.fillStyle = '#eef5fb';
      ctx.fillRect(margin, y, contentWidth, tableHeaderHeight);
      ctx.strokeStyle = '#d5e1ec';
      ctx.lineWidth = 1;
      ctx.strokeRect(margin, y, contentWidth, tableHeaderHeight);

      headers.forEach((header, index) => {
        const w = colWidths[index];
        if (index > 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + tableHeaderHeight + Math.max(rows.length, 1) * rowHeight);
          ctx.strokeStyle = '#e1e9f1';
          ctx.stroke();
        }
        ctx.fillStyle = '#496985';
        ctx.font = '800 14px "PingFang TC","Microsoft JhengHei",sans-serif';
        drawMultiline(ctx, header || '-', x + w / 2, y + tableHeaderHeight / 2, w - 18, 17, 2);
        x += w;
      });

      const renderRows = rows.length ? rows : [headers.map(() => '-')];
      renderRows.forEach((row, rowIndex) => {
        const rowY = y + tableHeaderHeight + rowIndex * rowHeight;
        ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#fbfcfe';
        ctx.fillRect(margin, rowY, contentWidth, rowHeight);
        ctx.strokeStyle = '#e4ebf2';
        ctx.beginPath();
        ctx.moveTo(margin, rowY + rowHeight);
        ctx.lineTo(margin + contentWidth, rowY + rowHeight);
        ctx.stroke();

        let cellX = margin;
        row.forEach((value, index) => {
          const w = colWidths[index] || contentWidth / headers.length;
          ctx.fillStyle = index === row.length - 1 ? '#27835a' : '#334f69';
          ctx.font = index === row.length - 1
            ? '850 15px "PingFang TC","Microsoft JhengHei",sans-serif'
            : '650 14px "PingFang TC","Microsoft JhengHei",sans-serif';
          drawMultiline(ctx, value || '-', cellX + w / 2, rowY + rowHeight / 2, w - 18, 19, 2);
          cellX += w;
        });
      });
    } else {
      drawRoundedFill(ctx, margin + 34, y, contentWidth - 68, 110, 15, '#fbfdff', '#dbe6f0');
      ctx.fillStyle = '#75899c';
      ctx.font = '700 18px "PingFang TC","Microsoft JhengHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('目前沒有可匯出的結算明細', width / 2, y + 55);
    }

    ctx.fillStyle = '#8797a7';
    ctx.font = '600 13px "PingFang TC","Microsoft JhengHei",sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('本報表依目前畫面結算資料自動產生', margin + contentWidth - 24, height - margin - 24);

    return { canvas, investor, start, end };
  }

  function downloadReport(article, button) {
    if (button?.dataset.exporting === '1') return;
    if (button) {
      button.dataset.exporting = '1';
      button.classList.add('is-exporting');
    }

    try {
      const { canvas, investor, start, end } = drawReport(article);
      const link = document.createElement('a');
      link.download = `${safeName(investor)}_${start || '結算'}_${end || '明細'}_財務報表.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      window.setTimeout(() => {
        if (button) {
          delete button.dataset.exporting;
          button.classList.remove('is-exporting');
        }
      }, 250);
    }
  }

  function ensureAvatar(article) {
    const first = article.querySelector('.settlement-group-head > div:first-child');
    if (!first || first.querySelector(':scope > .investor-report-avatar')) return;
    const investor = getInvestor(article);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'investor-report-avatar';
    button.textContent = investor.slice(0, 1) || '財';
    button.title = '點擊匯出此投資人的財務報表圖';
    button.setAttribute('aria-label', `匯出 ${investor} 財務報表圖`);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      downloadReport(article, button);
    });
    first.classList.add('has-investor-report-avatar');
    first.prepend(button);
  }

  function decorate() {
    document.querySelectorAll('.settlement-group').forEach(ensureAvatar);
  }

  function injectStyle() {
    if (document.getElementById('investor-report-export-style')) return;
    const style = document.createElement('style');
    style.id = 'investor-report-export-style';
    style.textContent = `
      .settlement-group-head>div.has-investor-report-avatar{
        position:relative!important;
        padding-left:68px!important;
      }
      .investor-report-avatar{
        position:absolute;
        left:14px;
        top:50%;
        transform:translateY(-50%);
        display:grid;
        place-items:center;
        width:40px;
        height:40px;
        padding:0;
        border:1px solid #a9c5df;
        border-radius:999px;
        background:rgba(255,255,255,.72);
        color:#315f8c;
        font:850 15px/1 "PingFang TC","Microsoft JhengHei",sans-serif;
        box-shadow:0 2px 7px rgba(51,91,128,.08);
        cursor:pointer;
        touch-action:manipulation;
        transition:transform .14s ease,background .14s ease,box-shadow .14s ease;
        z-index:4;
      }
      .investor-report-avatar:hover{
        background:#fff;
        box-shadow:0 3px 10px rgba(51,91,128,.14);
      }
      .investor-report-avatar:active{
        transform:translateY(-50%) scale(.95);
      }
      .investor-report-avatar.is-exporting{
        opacity:.62;
        cursor:progress;
      }
      @media (max-width:520px){
        .settlement-group-head>div.has-investor-report-avatar{
          padding-left:62px!important;
        }
        .investor-report-avatar{
          left:11px;
          width:36px;
          height:36px;
          font-size:14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bind() {
    document.addEventListener('click', event => {
      const trigger = event.target?.closest?.('.period-controls button,.month-tab-track button');
      const button = event.target?.closest?.('button');
      if (trigger || (button && /結算|新增投資案/.test(clean(button.textContent)))) {
        scheduleAfterReact();
      }
    }, true);

    document.addEventListener('change', event => {
      if (event.target?.closest?.('.period-controls')) scheduleAfterReact();
    }, true);

    window.addEventListener('storage', scheduleAfterReact);
  }

  injectStyle();
  bind();
  scheduleAfterReact();
})();