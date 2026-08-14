const test = require('node:test');
const assert = require('node:assert/strict');
const Autofill = require('../assets/import-autofill.js');

const complete = overrides => ({
  investor_name: '王小明', project_name: '案 A', amount: 1000,
  start_date: '2026-08-01', duration_value: 1, duration_unit: 'month',
  interest_rate: 5, net_profit: 45, ...overrides
});

test('zero and negative values are not treated as missing', () => {
  assert.equal(Autofill.isMissing(0), false);
  assert.equal(Autofill.isMissing(-20), false);
  assert.equal(Autofill.isMissing('0%'), false);
  assert.equal(Autofill.isMissing('N/A'), true);
});

test('header validation accepts fields that can be derived', () => {
  assert.deepEqual(Autofill.headerIssues({
    investor_name: 0, project_name: 1, amount: 2, start_date: 3,
    maturity_date: 4, net_profit: 5
  }), []);
  assert.deepEqual(Autofill.headerIssues({
    investor_name: 0, project_name: 1, amount: 2, start_date: 3,
    duration_value: 4
  }), ['投資利率或投資淨收益']);
});

test('fill-down copies contextual fields but never principal or profit', () => {
  const first = Autofill.autofillRow(complete(), { carry: {} });
  const second = Autofill.autofillRow({
    investor_name: '', project_name: '', amount: '', start_date: '',
    duration_value: '', duration_unit: 'month', interest_rate: '', net_profit: ''
  }, { carry: first.carry });
  assert.equal(second.value.investor_name, '王小明');
  assert.equal(second.value.project_name, '案 A');
  assert.equal(second.value.start_date, '2026-08-01');
  assert.equal(second.value.duration_value, 1);
  assert.equal(second.value.interest_rate, 5);
  assert.equal(Autofill.isMissing(second.value.amount), true);
  assert.equal(Autofill.isMissing(second.value.net_profit), true);
});

test('a changed project resets contextual values instead of guessing', () => {
  const first = Autofill.autofillRow(complete(), { carry: {} });
  const changed = Autofill.autofillRow(complete({
    investor_name: '', project_name: '案 B', start_date: '', duration_value: '', interest_rate: '', net_profit: 20
  }), { carry: first.carry });
  assert.equal(Autofill.isMissing(changed.value.investor_name), true);
  assert.equal(Autofill.isMissing(changed.value.start_date), true);
  assert.equal(Autofill.isMissing(changed.value.duration_value), true);
  assert.equal(changed.value.interest_rate, 2);
});

test('missing net profit is estimated from principal and rate', () => {
  const result = Autofill.autofillRow(complete({ amount: 1234.56, interest_rate: 5, net_profit: '' }), { carry: {} });
  assert.equal(result.value.net_profit, 61.73);
  assert.equal(result.autofills[0].field, 'net_profit');
  assert.equal(result.autofills[0].estimated, true);
});

test('missing rate is inferred as effective return from principal and profit', () => {
  const result = Autofill.autofillRow(complete({ amount: 2000, interest_rate: '', net_profit: -50 }), { carry: {} });
  assert.equal(result.value.interest_rate, -2.5);
  assert.match(result.autofills[0].reason, /等效利率/);
});

test('zero profit derives a real zero rate instead of remaining blank', () => {
  const result = Autofill.autofillRow(complete({ interest_rate: '', net_profit: 0 }), { carry: {} });
  assert.equal(result.value.interest_rate, 0);
  assert.equal(Autofill.isMissing(result.value.interest_rate), false);
});

test('duration can be derived from start and maturity dates', () => {
  const result = Autofill.autofillRow(complete({
    start_date: '2026-08-14', maturity_date: '2026-09-13', duration_value: '', duration_unit: ''
  }), { carry: {} });
  assert.equal(result.value.duration_value, 30);
  assert.equal(result.value.duration_unit, 'day');
});

test('blank separator resets fill-down context', () => {
  const { results } = Autofill.autofillRows([
    complete(),
    { __blank: true },
    complete({ investor_name: '', project_name: '', start_date: '', duration_value: '', interest_rate: '', net_profit: 10 })
  ]);
  assert.equal(Autofill.isMissing(results[2].value.investor_name), true);
  assert.equal(Autofill.isMissing(results[2].value.project_name), true);
});

test('autofill never mutates the input object', () => {
  const input = complete({ net_profit: '' });
  Autofill.autofillRow(input, { carry: {} });
  assert.equal(input.net_profit, '');
});
