(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SettlementCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateOnly(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      const direct = value.trim().match(DATE_RE);
      if (direct) {
        const year = Number(direct[1]);
        const month = Number(direct[2]);
        const day = Number(direct[3]);
        const check = new Date(Date.UTC(year, month - 1, day));
        if (
          check.getUTCFullYear() === year &&
          check.getUTCMonth() === month - 1 &&
          check.getUTCDate() === day
        ) return `${year}-${pad(month)}-${pad(day)}`;
        return null;
      }
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  function addDuration(startDate, durationValue, durationUnit) {
    const start = dateOnly(startDate);
    const amount = Number(durationValue);
    const unit = durationUnit === 'day' ? 'day' : 'month';
    if (!start || !Number.isInteger(amount) || amount <= 0) return null;

    const [year, month, day] = start.split('-').map(Number);
    if (unit === 'day') {
      const result = new Date(Date.UTC(year, month - 1, day));
      result.setUTCDate(result.getUTCDate() + amount);
      return `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
    }

    const targetMonthIndex = month - 1 + amount;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`;
  }

  function normalizeInvestment(input) {
    const amount = Number(input.amount);
    const interestRate = Number(input.interest_rate);
    const netProfit = Number(input.net_profit);
    const durationValue = Number(input.duration_value);
    const durationUnit = input.duration_unit === 'day' ? 'day' : 'month';
    const startDate = dateOnly(input.start_date);
    const maturityDate = addDuration(startDate, durationValue, durationUnit);
    return {
      ...input,
      investor_name: String(input.investor_name || '').trim(),
      project_name: String(input.project_name || '').trim(),
      amount,
      start_date: startDate,
      duration_value: durationValue,
      duration_unit: durationUnit,
      maturity_date: maturityDate,
      interest_rate: interestRate,
      net_profit: netProfit
    };
  }

  function validateInvestment(input) {
    const value = normalizeInvestment(input || {});
    const errors = [];
    const missing = field => input == null || input[field] == null || String(input[field]).trim() === '';
    if (!value.investor_name) errors.push('請輸入投資人名。');
    if (!value.project_name) errors.push('請輸入投資案名。');
    if (missing('amount') || !Number.isFinite(value.amount) || value.amount <= 0) errors.push('投資金額必須大於 0。');
    if (!value.start_date) errors.push('開始時間格式不正確。');
    if (missing('duration_value') || !Number.isInteger(value.duration_value) || value.duration_value <= 0) errors.push('持續時間必須是大於 0 的整數。');
    if (!value.maturity_date) errors.push('無法計算到期日。');
    if (missing('interest_rate') || !Number.isFinite(value.interest_rate)) errors.push('投資利率必須是數字。');
    if (missing('net_profit') || !Number.isFinite(value.net_profit)) errors.push('投資淨收益必須是數字。');
    return { value, errors };
  }

  function isMatured(investment, asOfDate) {
    const asOf = dateOnly(asOfDate);
    const maturity = dateOnly(investment.maturity_date) || addDuration(
      investment.start_date,
      Number(investment.duration_value),
      investment.duration_unit
    );
    return Boolean(
      asOf && maturity &&
      investment.status !== 'settled' &&
      investment.status !== 'cancelled' &&
      maturity <= asOf
    );
  }

  function dueInvestments(state, asOfDate) {
    return (state.investments || []).filter(item => isMatured(item, asOfDate));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultId(prefix) {
    const random = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function createSettlementBatch(state, options) {
    const next = clone(state || {});
    next.investments ||= [];
    next.settlement_batches ||= [];
    next.settlement_entries ||= [];

    const asOfDate = dateOnly(options && options.as_of_date);
    if (!asOfDate) throw new Error('結算基準日格式不正確。');
    const settledAt = (options && options.settled_at) || new Date().toISOString();
    const makeId = (options && options.id_factory) || defaultId;
    const due = dueInvestments(next, asOfDate);
    if (!due.length) return { state: next, batch: null, entries: [] };

    const batchId = makeId('batch');
    const entries = due.map(item => ({
      id: makeId('settlement'),
      batch_id: batchId,
      investment_id: item.id,
      investor_id: item.investor_id,
      investor_name: item.investor_name,
      project_id: item.project_id,
      project_name: item.project_name,
      principal_amount: Number(item.amount),
      interest_rate: Number(item.interest_rate),
      profit_amount: Number(item.net_profit),
      start_date: item.start_date,
      maturity_date: item.maturity_date,
      settled_at: settledAt,
      payout_status: 'pending'
    }));

    const principalTotal = entries.reduce((sum, row) => sum + row.principal_amount, 0);
    const profitTotal = entries.reduce((sum, row) => sum + row.profit_amount, 0);
    const batch = {
      id: batchId,
      as_of_date: asOfDate,
      settled_at: settledAt,
      status: 'completed',
      entry_count: entries.length,
      investor_count: new Set(entries.map(row => row.investor_id)).size,
      principal_total: Number(principalTotal.toFixed(4)),
      profit_total: Number(profitTotal.toFixed(4)),
      principal_plus_profit: Number((principalTotal + profitTotal).toFixed(4))
    };

    const dueIds = new Set(due.map(item => item.id));
    next.investments = next.investments.map(item => dueIds.has(item.id) ? {
      ...item,
      status: 'settled',
      settlement_batch_id: batchId,
      settled_at: settledAt,
      updated_at: settledAt
    } : item);
    next.settlement_batches.unshift(batch);
    next.settlement_entries.unshift(...entries);
    return { state: next, batch, entries };
  }

  function groupEntriesByInvestor(entries) {
    const groups = new Map();
    for (const row of entries || []) {
      const key = row.investor_id || row.investor_name;
      if (!groups.has(key)) {
        groups.set(key, {
          investor_id: row.investor_id,
          investor_name: row.investor_name,
          entry_count: 0,
          principal_total: 0,
          profit_total: 0,
          principal_plus_profit: 0,
          weighted_interest_rate: 0,
          entries: []
        });
      }
      const group = groups.get(key);
      group.entry_count += 1;
      group.principal_total += Number(row.principal_amount || 0);
      group.profit_total += Number(row.profit_amount || 0);
      group.weighted_interest_rate += Number(row.principal_amount || 0) * Number(row.interest_rate || 0);
      group.entries.push(row);
    }
    return [...groups.values()].map(group => ({
      ...group,
      principal_total: Number(group.principal_total.toFixed(4)),
      profit_total: Number(group.profit_total.toFixed(4)),
      principal_plus_profit: Number((group.principal_total + group.profit_total).toFixed(4)),
      weighted_interest_rate: group.principal_total
        ? Number((group.weighted_interest_rate / group.principal_total).toFixed(4))
        : 0
    })).sort((a, b) => b.profit_total - a.profit_total || a.investor_name.localeCompare(b.investor_name, 'zh-Hant'));
  }

  return {
    dateOnly,
    addDuration,
    normalizeInvestment,
    validateInvestment,
    isMatured,
    dueInvestments,
    createSettlementBatch,
    groupEntriesByInvestor
  };
});
