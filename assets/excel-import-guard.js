(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExcelImportGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function columnSet(layout) {
    const columns = [
      layout?.dateColumn,
      layout?.projectColumn,
      layout?.caseAmountColumn,
      layout?.participationTotalColumn,
      ...(layout?.investorColumns || []).map(item => item.column)
    ];
    const result = new Set(columns.filter(column => Number.isInteger(column) && column >= 0));
    const allocationStart = Number(layout?.participationTotalColumn) + 1;
    const allocationEnd = Number.isInteger(layout?.payoutColumn) && layout.payoutColumn >= 0
      ? layout.payoutColumn
      : Number(layout?.noteEndColumn);
    if (Number.isInteger(allocationStart) && Number.isInteger(allocationEnd) && allocationEnd > allocationStart) {
      for (let column = allocationStart; column < allocationEnd; column++) result.add(column);
    }
    return result;
  }

  function address(row, column) {
    let value = column + 1;
    let letters = '';
    while (value > 0) {
      value -= 1;
      letters = String.fromCharCode(65 + (value % 26)) + letters;
      value = Math.floor(value / 26);
    }
    return `${letters}${row + 1}`;
  }

  function scanLegacyFormulaCache(sheet, layout) {
    if (!sheet || !layout) return [];
    const columns = columnSet(layout);
    const issues = [];
    for (const key of Object.keys(sheet)) {
      if (key[0] === '!') continue;
      const match = /^([A-Z]+)(\d+)$/.exec(key);
      const cell = sheet[key];
      if (!match || !cell || !cell.f) continue;
      let column = 0;
      for (const char of match[1]) column = column * 26 + char.charCodeAt(0) - 64;
      column -= 1;
      const row = Number(match[2]) - 1;
      if (row <= layout.headerIndex || !columns.has(column)) continue;
      const missing = cell.v == null || cell.v === '' || cell.t === 'e';
      if (missing) issues.push({ address: address(row, column), row: row + 1, column, formula: cell.f, reason: cell.t === 'e' ? 'formula_error' : 'missing_cache' });
    }
    return issues.sort((a, b) => a.row - b.row || a.column - b.column);
  }

  return { address, columnSet, scanLegacyFormulaCache };
});
