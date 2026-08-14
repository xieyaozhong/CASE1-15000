(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LegacyMatrixImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isMissing(value) {
    return value == null || (typeof value === 'string' && value.trim() === '');
  }

  function normalize(value) {
    return String(value ?? '').trim().toLocaleLowerCase('zh-TW').replace(/[\s_（）()／/]/g, '');
  }

  function numberValue(value) {
    if (typeof value === 'number') return value;
    const cleaned = String(value ?? '').trim().replace(/[,$，＄NTD元]/gi, '');
    return cleaned === '' ? NaN : Number(cleaned);
  }

  function isValidStart(value) {
    if (value instanceof Date) return !Number.isNaN(value.getTime());
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value < 2958466;
    const match = String(value ?? '').trim().replace(/[/.]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const checked = new Date(Date.UTC(year, month - 1, day));
    return checked.getUTCFullYear() === year && checked.getUTCMonth() === month - 1 && checked.getUTCDate() === day;
  }

  function findColumn(header, aliases) {
    const wanted = aliases.map(normalize);
    return header.findIndex(value => wanted.includes(normalize(value)));
  }

  function detect(rows) {
    let best = null;
    for (let rowIndex = 0; rowIndex < Math.min((rows || []).length, 20); rowIndex++) {
      const header = rows[rowIndex] || [];
      const dateColumn = findColumn(header, ['日期', '開始日期']);
      const projectColumn = findColumn(header, ['起租案名/同仁', '起租案名／同仁', '起租案名', '案名']);
      const sourceColumn = findColumn(header, ['案源']);
      const caseAmountColumn = findColumn(header, ['案件金額', '案件總額']);
      const participationTotalColumn = findColumn(header, ['參與總額']);
      const payoutColumn = findColumn(header, ['目前總共撥款']);
      if (dateColumn < 0 || projectColumn < 0 || caseAmountColumn < 0 || participationTotalColumn < 0) continue;

      const investorColumns = [];
      let firstGapColumn = null;
      for (let column = participationTotalColumn + 1; column < header.length; column++) {
        if (payoutColumn >= 0 && column >= payoutColumn) break;
        const label = String(header[column] ?? '').trim();
        if (!label) { firstGapColumn = column; break; }
        investorColumns.push({ column, name: label });
      }
      if (investorColumns.length < 2) continue;

      const positiveCells = (rows || []).slice(rowIndex + 1).reduce((count, row) => count + investorColumns.reduce((sum, item) => {
        const value = numberValue((row || [])[item.column]);
        return sum + (Number.isFinite(value) && value > 0 ? 1 : 0);
      }, 0), 0);
      const orphanAllocationColumns = [];
      const scanEnd = payoutColumn >= 0 ? payoutColumn : header.length;
      const orphanScanStart = firstGapColumn ?? (investorColumns[investorColumns.length - 1].column + 1);
      for (let column = orphanScanStart; column < scanEnd; column++) {
        const label = String(header[column] ?? '').trim();
        const hasNumericData = (rows || []).slice(rowIndex + 1).some(row => {
          const value = numberValue((row || [])[column]);
          return Number.isFinite(value) && value !== 0;
        });
        if (hasNumericData) orphanAllocationColumns.push({ column, name: label, missing_header: !label });
      }

      const candidate = {
        headerIndex: rowIndex,
        dateColumn,
        projectColumn,
        sourceColumn,
        caseAmountColumn,
        participationTotalColumn,
        payoutColumn,
        investorColumns,
        noteStartColumn: investorColumns[investorColumns.length - 1].column + 1,
        noteEndColumn: payoutColumn >= 0 ? payoutColumn : header.length,
        orphanAllocationColumns,
        positiveCells
      };
      if (!best || candidate.positiveCells > best.positiveCells) best = candidate;
    }
    return best;
  }

  function expandMergedCells(rows, merges, allowedColumns) {
    const output = (rows || []).map(row => [...(row || [])]);
    for (const range of merges || []) {
      if (allowedColumns && Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => range.s.c + index).some(column => !allowedColumns.has(column))) continue;
      const source = output[range.s.r]?.[range.s.c];
      if (isMissing(source)) continue;
      for (let row = range.s.r; row <= range.e.r; row++) {
        output[row] ||= [];
        for (let column = range.s.c; column <= range.e.c; column++) {
          if (isMissing(output[row][column])) output[row][column] = source;
        }
      }
    }
    return output;
  }

  function parseTerms(note) {
    const text = String(note ?? '');
    const duration = text.match(/(\d+(?:\.\d+)?)\s*(個月|天)/i);
    const rate = text.match(/([+-]?\d+(?:\.\d+)?)\s*[%％]/);
    const durationUnit = duration && /天|日/.test(duration[2]) ? 'day' : 'month';
    return {
      duration_value: duration ? Number(duration[1]) : null,
      duration_unit: duration ? durationUnit : null,
      interest_rate: rate ? Number(rate[1]) : null
    };
  }

  function noteForRow(row, layout) {
    const values = [];
    for (let column = layout.noteStartColumn; column < layout.noteEndColumn; column++) {
      const value = String((row || [])[column] ?? '').trim();
      if (value && !values.includes(value)) values.push(value);
    }
    return values.join(' / ');
  }

  function rowDetails(rows, layout) {
    const details = [];
    const seenInvestorNames = new Map();
    const duplicateHeaders = [];
    for (const item of layout.investorColumns) {
      const key = normalize(item.name);
      if (seenInvestorNames.has(key)) duplicateHeaders.push({ first: seenInvestorNames.get(key), second: item.column, name: item.name });
      else seenInvestorNames.set(key, item.column);
    }

    for (let rowIndex = layout.headerIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const projectName = String(row[layout.projectColumn] ?? '').trim();
      const allocations = [];
      const invalidAllocations = [];
      for (const item of layout.investorColumns) {
        const raw = row[item.column];
        if (isMissing(raw) || numberValue(raw) === 0) continue;
        const amount = numberValue(raw);
        if (!Number.isFinite(amount) || amount < 0) invalidAllocations.push({ column: item.column, investor_name: item.name, value: raw });
        else allocations.push({ column: item.column, investor_name: item.name, amount });
      }
      if (!projectName && !allocations.length && !invalidAllocations.length) continue;

      const statedTotal = numberValue(row[layout.participationTotalColumn]);
      const allocationTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
      const mismatch = Number.isFinite(statedTotal) && Math.abs(statedTotal - allocationTotal) > 0.01;
      const note = noteForRow(row, layout);
      details.push({
        rowIndex,
        source_row: rowIndex + 1,
        project_name: projectName,
        start_raw: row[layout.dateColumn],
        source: layout.sourceColumn >= 0 ? String(row[layout.sourceColumn] ?? '').trim() : '',
        case_amount: layout.caseAmountColumn >= 0 ? numberValue(row[layout.caseAmountColumn]) : NaN,
        stated_total: statedTotal,
        allocation_total: allocationTotal,
        allocations,
        invalid_allocations: invalidAllocations,
        mismatch,
        note,
        terms: parseTerms(note)
      });
    }
    return { details, duplicateHeaders };
  }

  function inspect(rows, merges) {
    const layout = detect(rows);
    if (!layout) return null;
    const noteColumns = new Set(Array.from({ length: Math.max(0, layout.noteEndColumn - layout.noteStartColumn) }, (_, index) => layout.noteStartColumn + index));
    const expandedRows = expandMergedCells(rows, merges, noteColumns);
    const { details, duplicateHeaders } = rowDetails(expandedRows, layout);
    const activeRows = details.filter(item => item.allocations.length || item.invalid_allocations.length || (Number.isFinite(item.stated_total) && item.stated_total > 0));
    return {
      layout,
      rows: expandedRows,
      sourceRowCount: activeRows.length,
      investmentCount: activeRows.reduce((sum, item) => sum + item.allocations.length, 0),
      investorColumnCount: layout.investorColumns.length,
      usedInvestorColumnCount: new Set(activeRows.flatMap(item => item.allocations.map(allocation => allocation.column))).size,
      missingStartRows: activeRows.filter(item => !isValidStart(item.start_raw)).map(item => ({ row: item.source_row, project_name: item.project_name, issue: isMissing(item.start_raw) ? 'missing' : 'invalid' })),
      missingDurationRows: activeRows.filter(item => item.terms.duration_value == null).map(item => item.source_row),
      missingRateRows: activeRows.filter(item => item.terms.interest_rate == null).map(item => item.source_row),
      mismatches: activeRows.filter(item => item.mismatch).map(item => ({ row: item.source_row, stated_total: item.stated_total, allocation_total: item.allocation_total })),
      invalidAllocations: activeRows.flatMap(item => item.invalid_allocations.map(allocation => ({ row: item.source_row, column: allocation.column, value: allocation.value }))),
      unallocatedRows: activeRows.filter(item => !item.allocations.length && Number.isFinite(item.stated_total) && item.stated_total > 0).map(item => ({ row: item.source_row, stated_total: item.stated_total })),
      orphanAllocationColumns: layout.orphanAllocationColumns || [],
      duplicateHeaders
    };
  }

  function columnName(index) {
    let value = Number(index) + 1;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function fill(field, value, method, reason, estimated, durationUnit) {
    return { field, value, method, reason, estimated: Boolean(estimated), duration_unit: durationUnit };
  }

  function convert(inspection, options) {
    if (!inspection?.layout) throw new Error('找不到可轉換的案件分配表。');
    const settings = options || {};
    const durationValue = numberValue(settings.duration_value);
    const durationUnit = settings.duration_unit === 'day' ? 'day' : 'month';
    const interestRate = numberValue(settings.interest_rate);
    const amountScale = numberValue(settings.amount_scale);
    const useNoteTerms = settings.use_note_terms === true;
    const errors = [];
    const warnings = [];

    if (!Number.isInteger(durationValue) || durationValue <= 0) errors.push({ row: inspection.layout.headerIndex + 1, message: '請設定大於 0 的整數預設持續時間。' });
    if (!Number.isFinite(interestRate)) errors.push({ row: inspection.layout.headerIndex + 1, message: '請設定預設整期投資利率。' });
    if (![1, 1000, 10000].includes(amountScale)) errors.push({ row: inspection.layout.headerIndex + 1, message: '請確認金額單位。' });
    if (inspection.duplicateHeaders.length) errors.push({ row: inspection.layout.headerIndex + 1, message: '投資人欄名重複，請先修正 Excel 表頭。' });
    if (inspection.orphanAllocationColumns.length) errors.push({ row: inspection.layout.headerIndex + 1, message: `投資人欄區段的 ${inspection.orphanAllocationColumns.map(item => columnName(item.column)).join('、')} 欄有未納入的數字資料，為避免漏匯請補齊投資人欄名並整理表頭。` });
    for (const item of inspection.invalidAllocations) errors.push({ row: item.row, message: `投資人分配格 ${columnName(item.column)}${item.row} 必須是大於 0 的數字。` });
    for (const item of inspection.unallocatedRows) errors.push({ row: item.row, message: `參與總額為 ${item.stated_total}，但沒有任何投資人分配金額。` });
    if (inspection.mismatches.length && !settings.accept_mismatches) errors.push({ row: inspection.mismatches[0].row, message: '參與總額與投資人分配合計不一致，請確認以投資人明細為準。' });
    if (errors.length) return { records: [], errors, warnings };

    const records = [];
    const overrides = settings.start_dates || {};
    const { details } = rowDetails(inspection.rows, inspection.layout);
    for (const detail of details) {
      if (!detail.allocations.length) continue;
      const needsStartOverride = !isValidStart(detail.start_raw);
      const startRaw = needsStartOverride ? overrides[detail.source_row] : detail.start_raw;
      if (!isValidStart(startRaw)) {
        errors.push({ row: detail.source_row, message: '開始日期缺失且無法由同案其他資料唯一推斷，請在轉換設定指定日期。' });
        continue;
      }
      const useNoteDuration = useNoteTerms && detail.terms.duration_value != null;
      const useNoteRate = useNoteTerms && detail.terms.interest_rate != null;
      const rowDuration = useNoteDuration ? detail.terms.duration_value : durationValue;
      const rowDurationUnit = useNoteDuration ? detail.terms.duration_unit : durationUnit;
      const rowRate = useNoteRate ? detail.terms.interest_rate : interestRate;
      if (!Number.isInteger(rowDuration) || rowDuration <= 0) {
        errors.push({ row: detail.source_row, message: '備註中的持續時間不是大於 0 的整數，請修正原始資料。' });
        continue;
      }
      if (detail.mismatch) warnings.push({ row: detail.source_row, message: `參與總額 ${detail.stated_total} 與投資人明細合計 ${detail.allocation_total} 不一致；已依確認使用投資人明細。` });

      for (const allocation of detail.allocations) {
        const amount = allocation.amount * amountScale;
        const autofills = [];
        if (amountScale !== 1) autofills.push(fill('amount', amount, 'amount_scale', `依確認的金額單位換算 × ${amountScale.toLocaleString('en-US')}`, false));
        if (needsStartOverride) autofills.push(fill('start_date', startRaw, 'manual_override', `依本次設定補齊 Excel 第 ${detail.source_row} 列缺漏或無效日期`, false));
        autofills.push(useNoteDuration
          ? fill('duration_value', rowDuration, 'note', '依使用者確認，採用原始備註中的期間文字', true, rowDurationUnit)
          : fill('duration_value', rowDuration, 'batch_default', detail.terms.duration_value == null ? '依本次舊版表格預設期間補齊' : '依本批預設期間補齊；原備註候選未採用', false, rowDurationUnit));
        autofills.push(useNoteRate
          ? fill('interest_rate', rowRate, 'note', '依使用者確認，採用原始備註中的百分比', true)
          : fill('interest_rate', rowRate, 'batch_default', detail.terms.interest_rate == null ? '依本次舊版表格預設利率補齊' : '依本批預設利率補齊；原備註候選未採用', false));

        const metadata = [];
        if (detail.source) metadata.push(`案源：${detail.source}`);
        if (Number.isFinite(detail.case_amount)) metadata.push(`案件金額（原表）：${detail.case_amount}`);
        if (Number.isFinite(detail.stated_total)) metadata.push(`參與總額（原表）：${detail.stated_total}`);
        if (detail.note) metadata.push(`原備註：${detail.note}`);
        records.push({
          investor_name: allocation.investor_name,
          project_name: detail.project_name,
          amount,
          start_raw: startRaw,
          duration_value: rowDuration,
          duration_unit: rowDurationUnit,
          interest_rate: rowRate,
          net_profit: NaN,
          note: metadata.join('；'),
          source_row: detail.source_row,
          source_column: columnName(allocation.column),
          source_ref: `${columnName(allocation.column)}${detail.source_row}`,
          autofills
        });
      }
    }
    return { records, errors, warnings };
  }

  return { isMissing, isValidStart, normalize, numberValue, detect, expandMergedCells, parseTerms, inspect, convert, columnName };
});
