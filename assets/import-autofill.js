(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImportAutofill = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LABELS = {
    investor_name: '投資人名',
    project_name: '投資案名',
    amount: '投資金額',
    start_date: '開始時間',
    maturity_date: '到期日',
    duration_value: '持續時間',
    interest_rate: '投資利率',
    net_profit: '投資淨收益'
  };

  function isMissing(value) {
    if (value == null) return true;
    if (typeof value === 'number') return Number.isNaN(value);
    const normalized = String(value).trim().toLocaleLowerCase('en');
    return normalized === '' || ['-', '—', 'n/a', 'na', 'null'].includes(normalized);
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function daysBetween(startDate, maturityDate) {
    const match = value => String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const start = match(startDate);
    const end = match(maturityDate);
    if (!start || !end) return null;
    const startTime = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
    const endTime = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]));
    const days = (endTime - startTime) / 86400000;
    return Number.isInteger(days) && days > 0 ? days : null;
  }

  function emptyCarry() {
    return {};
  }

  function headerIssues(map) {
    const columns = map || {};
    const issues = [];
    for (const [field, label] of [
      ['investor_name', '投資人名'],
      ['project_name', '投資案名'],
      ['amount', '投資金額'],
      ['start_date', '開始時間']
    ]) {
      if (columns[field] == null) issues.push(label);
    }
    if (columns.duration_value == null && columns.maturity_date == null) issues.push('持續時間或到期日');
    if (columns.interest_rate == null && columns.net_profit == null) issues.push('投資利率或投資淨收益');
    return issues;
  }

  function addFill(autofills, field, value, method, reason, estimated) {
    autofills.push({ field, label: LABELS[field] || field, value, method, reason, estimated: Boolean(estimated) });
  }

  function sameText(left, right) {
    return !isMissing(left) && !isMissing(right) && String(left).trim().toLocaleLowerCase('zh-TW') === String(right).trim().toLocaleLowerCase('zh-TW');
  }

  function autofillRow(input, options) {
    const original = { ...(input || {}) };
    const value = { ...original };
    const carry = { ...((options && options.carry) || {}) };
    const autofills = [];

    if (isMissing(value.project_name) && !isMissing(carry.project_name)) {
      value.project_name = carry.project_name;
      addFill(autofills, 'project_name', value.project_name, 'carry', '沿用上一列明確值', false);
    }
    const sharesProject = sameText(value.project_name, carry.project_name);
    if (sharesProject && isMissing(value.investor_name) && !isMissing(carry.investor_name)) {
      value.investor_name = carry.investor_name;
      addFill(autofills, 'investor_name', value.investor_name, 'carry', '同一投資案沿用上一列明確值', false);
    }
    for (const field of ['start_date', 'maturity_date']) {
      if (sharesProject && isMissing(value[field]) && !isMissing(carry[field])) {
        value[field] = carry[field];
        addFill(autofills, field, value[field], 'carry', '同一投資案沿用上一列明確值', false);
      }
    }

    if (sharesProject && isMissing(value.duration_value) && !isMissing(carry.duration_value)) {
      value.duration_value = carry.duration_value;
      value.duration_unit = carry.duration_unit || 'month';
      addFill(autofills, 'duration_value', value.duration_value, 'carry', '沿用上一列明確期間', false);
    }

    if (isMissing(value.duration_value) && !isMissing(value.start_date) && !isMissing(value.maturity_date)) {
      const days = daysBetween(value.start_date, value.maturity_date);
      if (days != null) {
        value.duration_value = days;
        value.duration_unit = 'day';
        addFill(autofills, 'duration_value', days, 'date_range', '依開始日與到期日換算天數', false);
      }
    }

    const amount = Number(value.amount);
    const profit = Number(value.net_profit);
    if (isMissing(value.interest_rate) && Number.isFinite(amount) && amount > 0 && !isMissing(value.net_profit) && Number.isFinite(profit)) {
      value.interest_rate = round(profit / amount * 100, 4);
      addFill(autofills, 'interest_rate', value.interest_rate, 'formula', '依淨收益 ÷ 本金推算等效利率', true);
    }

    if (sharesProject && isMissing(value.interest_rate) && !isMissing(carry.interest_rate)) {
      value.interest_rate = carry.interest_rate;
      addFill(autofills, 'interest_rate', value.interest_rate, 'carry', '沿用上一列明確利率', false);
    }

    const rate = Number(value.interest_rate);
    if (isMissing(value.net_profit) && Number.isFinite(amount) && amount > 0 && !isMissing(value.interest_rate) && Number.isFinite(rate)) {
      value.net_profit = round(amount * rate / 100, 2);
      addFill(autofills, 'net_profit', value.net_profit, 'formula', '依本金 × 利率估算', true);
    }

    const projectChanged = !isMissing(original.project_name) && !isMissing(carry.project_name) && !sameText(original.project_name, carry.project_name);
    const nextCarry = projectChanged ? {} : { ...carry };
    for (const field of ['investor_name', 'project_name', 'start_date', 'maturity_date', 'interest_rate']) {
      if (!isMissing(original[field])) nextCarry[field] = original[field];
    }
    if (!isMissing(original.duration_value) && Number.isInteger(Number(original.duration_value)) && Number(original.duration_value) > 0) {
      nextCarry.duration_value = original.duration_value;
      nextCarry.duration_unit = original.duration_unit === 'day' ? 'day' : 'month';
    }

    return { value, autofills, carry: nextCarry };
  }

  function autofillRows(rows) {
    let carry = emptyCarry();
    let total = 0;
    const results = [];
    for (const row of rows || []) {
      if (!row || row.__blank) {
        carry = emptyCarry();
        results.push({ value: row, autofills: [], carry: { ...carry } });
        continue;
      }
      const result = autofillRow(row, { carry });
      carry = result.carry;
      total += result.autofills.length;
      results.push(result);
    }
    return { results, total_filled: total };
  }

  return { LABELS, isMissing, daysBetween, emptyCarry, headerIssues, autofillRow, autofillRows };
});
