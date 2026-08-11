(() => {
  function init() {
    if (!window.XLSX || !window.UI) { setTimeout(init, 80); return; }
    if (!/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;
    if (window.__legacyValidatorLoaded) return;
    window.__legacyValidatorLoaded = true;

    const input = document.querySelector('#xlsxInput');
    const preview = document.querySelector('#importPreview');
    if (!input || !preview) return;

    async function validate(file) {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      if (!rows.length) return { errors: ['Excel 沒有資料。'], warnings: [] };

      const h = rows[0].map(x => String(x ?? '').trim());
      const idxTotal = h.indexOf('參與總額');
      const idxPayout = h.indexOf('目前總共撥款');
      if (idxTotal < 0) return { errors: ['找不到「參與總額」欄位。'], warnings: [] };

      const investorCols = [];
      for (let i = idxTotal + 1; i < h.length; i++) {
        if (idxPayout >= 0 && i >= idxPayout) break;
        if (!h[i]) break;
        investorCols.push([i, h[i]]);
      }
      if (!investorCols.length) return { errors: ['找不到投資人參與欄位。'], warnings: [] };

      const errors = [], warnings = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = String(row[1] ?? '').trim();
        if (!name) continue;
        const caseAmount = Number(row[3] || 0);
        const statedTotal = Number(row[idxTotal] || 0);
        const allocations = investorCols
          .map(([i, investor]) => ({ investor, amount: Number(row[i] || 0) }))
          .filter(x => x.amount !== 0);
        const allocationTotal = allocations.reduce((n, x) => n + x.amount, 0);
        const sheetRow = r + 1;

        if (allocationTotal > 0 && caseAmount <= 0) {
          errors.push(`第 ${sheetRow} 列「${name}」有參與金額 ${allocationTotal}，但案件金額為空白或 0。`);
        }
        if (Math.abs(statedTotal - allocationTotal) > 0.01) {
          errors.push(`第 ${sheetRow} 列「${name}」參與總額為 ${statedTotal}，但投資人欄位加總為 ${allocationTotal}。`);
        }
        if (caseAmount > 0 && statedTotal > caseAmount) {
          warnings.push(`第 ${sheetRow} 列「${name}」參與總額 ${statedTotal} 高於案件金額 ${caseAmount}，請確認是否正確。`);
        }
      }
      return { errors, warnings };
    }

    function show(result) {
      document.querySelector('#legacyValidationBox')?.remove();
      const box = document.createElement('div');
      box.id = 'legacyValidationBox';
      box.style.marginTop = '12px';
      if (!result.errors.length && !result.warnings.length) {
        box.className = 'notice';
        box.innerHTML = '<strong>資料檢查通過。</strong> 參與總額與各投資人欄位加總一致，可進行匯入。';
      } else {
        box.className = result.errors.length ? 'notice warn' : 'notice';
        const errors = result.errors.map(x => `<li>${UI.esc(x)}</li>`).join('');
        const warnings = result.warnings.map(x => `<li>${UI.esc(x)}</li>`).join('');
        box.innerHTML = `${result.errors.length ? `<strong>發現 ${result.errors.length} 個必須先修正的資料問題：</strong><ul>${errors}</ul>` : ''}${result.warnings.length ? `<strong>另有 ${result.warnings.length} 個提醒：</strong><ul>${warnings}</ul>` : ''}`;
      }
      preview.prepend(box);

      const button = document.querySelector('#doImport');
      if (button) {
        button.disabled = result.errors.length > 0;
        button.title = result.errors.length ? '請先修正 Excel 中的資料問題再匯入。' : '';
        if (result.errors.length) button.textContent = '請先修正 Excel';
      }
    }

    async function run(file) {
      if (!file) return;
      try {
        const result = await validate(file);
        // admin.js also parses asynchronously; wait for its preview/button to exist.
        setTimeout(() => show(result), 120);
        setTimeout(() => show(result), 450);
      } catch (e) {
        UI.toast(e.message || 'Excel 檢查失敗', 'error');
      }
    }

    input.addEventListener('change', e => run(e.target.files?.[0]));
    document.querySelector('#dropzone')?.addEventListener('drop', e => run(e.dataTransfer?.files?.[0]));
  }

  init();
})();
