const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../assets/settlement-core.js');

function investment(overrides = {}) {
  return {
    id: 'investment-1',
    investor_id: 'investor-1',
    investor_name: '林怡君',
    project_id: 'project-1',
    project_name: '設備租賃 A',
    amount: 1000,
    start_date: '2026-01-31',
    duration_value: 1,
    duration_unit: 'month',
    maturity_date: '2026-02-28',
    interest_rate: 5,
    net_profit: 45,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

test('calendar month duration clamps to the final day of the target month', () => {
  assert.equal(Core.addDuration('2026-01-31', 1, 'month'), '2026-02-28');
  assert.equal(Core.addDuration('2028-01-31', 1, 'month'), '2028-02-29');
  assert.equal(Core.addDuration('2028-02-29', 12, 'month'), '2029-02-28');
});

test('day duration crosses month and leap-year boundaries', () => {
  assert.equal(Core.addDuration('2028-02-28', 1, 'day'), '2028-02-29');
  assert.equal(Core.addDuration('2028-02-29', 365, 'day'), '2029-02-28');
});

test('investment validation rejects blank financial fields instead of coercing them to zero', () => {
  const result = Core.validateInvestment({
    investor_name: '王小明', project_name: '案 A', amount: '', start_date: '2026-08-14',
    duration_value: '', duration_unit: 'month', interest_rate: '', net_profit: ''
  });
  assert.ok(result.errors.some(message => message.includes('投資金額')));
  assert.ok(result.errors.some(message => message.includes('持續時間')));
  assert.ok(result.errors.some(message => message.includes('投資利率')));
  assert.ok(result.errors.some(message => message.includes('投資淨收益')));
});

test('zero and negative net profit are valid settlement amounts', () => {
  const base = { investor_name: '王小明', project_name: '案 A', amount: 1000, start_date: '2026-08-14', duration_value: 1, duration_unit: 'month', interest_rate: 5 };
  assert.deepEqual(Core.validateInvestment({ ...base, net_profit: 0 }).errors, []);
  assert.deepEqual(Core.validateInvestment({ ...base, net_profit: -50 }).errors, []);
});

test('maturity equality is eligible while future and settled records are excluded', () => {
  assert.equal(Core.isMatured(investment(), '2026-02-28'), true);
  assert.equal(Core.isMatured(investment(), '2026-02-27'), false);
  assert.equal(Core.isMatured(investment({ status: 'settled' }), '2026-02-28'), false);
});

test('one batch settles all due records, including two tranches for the same customer and project', () => {
  let sequence = 0;
  const state = {
    investments: [
      investment(),
      investment({ id: 'investment-2', amount: 2000, interest_rate: 10, net_profit: 190 }),
      investment({ id: 'investment-future', maturity_date: '2026-03-01' })
    ],
    settlement_batches: [],
    settlement_entries: []
  };
  const result = Core.createSettlementBatch(state, {
    as_of_date: '2026-02-28',
    settled_at: '2026-02-28T08:00:00.000Z',
    id_factory: prefix => `${prefix}-${++sequence}`
  });
  assert.equal(result.entries.length, 2);
  assert.equal(result.batch.entry_count, 2);
  assert.equal(result.batch.investor_count, 1);
  assert.equal(result.batch.principal_total, 3000);
  assert.equal(result.batch.profit_total, 235);
  assert.equal(result.state.investments.find(row => row.id === 'investment-future').status, 'active');
  assert.equal(state.investments[0].status, 'active', 'source state remains unchanged');
});

test('settled records are idempotently excluded from a second run', () => {
  const first = Core.createSettlementBatch({ investments: [investment()], settlement_batches: [], settlement_entries: [] }, {
    as_of_date: '2026-02-28', settled_at: '2026-02-28T08:00:00.000Z', id_factory: prefix => `${prefix}-first`
  });
  const second = Core.createSettlementBatch(first.state, {
    as_of_date: '2026-02-28', settled_at: '2026-02-28T08:01:00.000Z', id_factory: prefix => `${prefix}-second`
  });
  assert.equal(second.batch, null);
  assert.equal(second.entries.length, 0);
  assert.equal(second.state.settlement_batches.length, 1);
  assert.equal(second.state.settlement_entries.length, 1);
});

test('customer summary uses principal-weighted contract rate and authoritative net profit', () => {
  const grouped = Core.groupEntriesByInvestor([
    { investor_id: 'A', investor_name: 'A', principal_amount: 1000, interest_rate: 5, profit_amount: 45 },
    { investor_id: 'A', investor_name: 'A', principal_amount: 2000, interest_rate: 10, profit_amount: 180 },
    { investor_id: 'B', investor_name: 'B', principal_amount: 500, interest_rate: 4, profit_amount: -10 }
  ]);
  const customerA = grouped.find(row => row.investor_id === 'A');
  assert.equal(customerA.principal_total, 3000);
  assert.equal(customerA.profit_total, 225);
  assert.equal(customerA.weighted_interest_rate, 8.3333);
  assert.equal(customerA.principal_plus_profit, 3225);
});

