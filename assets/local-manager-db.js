(function () {
  'use strict';

  const STORAGE_KEY = 'case1-local-investment-manager-v1';
  const Core = window.SettlementCore;

  function uid(prefix) {
    const value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyState() {
    return {
      version: 1,
      investors: [],
      projects: [],
      investments: [],
      settlement_batches: [],
      settlement_entries: [],
      meta: { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    };
  }

  function normalizeState(input) {
    const state = input && typeof input === 'object' ? clone(input) : emptyState();
    state.version = 1;
    for (const key of ['investors', 'projects', 'investments', 'settlement_batches', 'settlement_entries']) {
      if (!Array.isArray(state[key])) state[key] = [];
    }
    state.meta ||= {};
    state.meta.created_at ||= new Date().toISOString();
    state.meta.updated_at ||= state.meta.created_at;
    return state;
  }

  function normalizedName(value) {
    return String(value || '').trim().toLocaleLowerCase('zh-TW');
  }

  function nextCode(items, prefix) {
    let max = 0;
    for (const item of items) {
      const match = String(item.code || '').match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  function decorate(state) {
    const investors = new Map(state.investors.map(item => [item.id, item]));
    const projects = new Map(state.projects.map(item => [item.id, item]));
    const batches = new Map(state.settlement_batches.map(item => [item.id, item]));
    return {
      ...clone(state),
      investments: state.investments.map(item => ({
        ...clone(item),
        investor: clone(investors.get(item.investor_id) || null),
        project: clone(projects.get(item.project_id) || null)
      })),
      settlement_entries: state.settlement_entries.map(item => ({
        ...clone(item),
        batch: clone(batches.get(item.batch_id) || null)
      }))
    };
  }

  class LocalManagerDB {
    constructor() {
      this.state = emptyState();
      this.revision = 0;
      this.backend = 'browser';
      this.ready = false;
    }

    async init() {
      try {
        if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
          throw new Error('online browser storage');
        }
        const response = await fetch('/api/state', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('local api unavailable');
        const payload = await response.json();
        this.state = normalizeState(payload.state);
        this.revision = Number(payload.revision || 0);
        this.backend = 'sqlite';
      } catch (_) {
        let stored;
        try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
        this.state = normalizeState(stored);
        this.backend = 'browser';
      }
      this.ready = true;
      return this.snapshot();
    }

    snapshot() {
      return decorate(this.state);
    }

    async persist(reason) {
      this.state.meta.updated_at = new Date().toISOString();
      if (this.backend === 'sqlite') {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: this.state, revision: this.revision, reason })
        });
        if (response.status === 409) {
          await this.init();
          throw new Error('資料已在其他視窗更新，系統已重新載入；請再操作一次。');
        }
        if (!response.ok) throw new Error('本機資料庫儲存失敗。');
        const payload = await response.json();
        this.revision = Number(payload.revision || this.revision + 1);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
      window.dispatchEvent(new CustomEvent('local-manager-data-changed', { detail: { reason } }));
      return this.snapshot();
    }

    findOrCreateInvestor(name, timestamp) {
      const key = normalizedName(name);
      let investor = this.state.investors.find(item => normalizedName(item.display_name) === key);
      if (!investor) {
        investor = {
          id: uid('investor'),
          code: nextCode(this.state.investors, 'INV'),
          display_name: String(name).trim(),
          created_at: timestamp,
          updated_at: timestamp
        };
        this.state.investors.push(investor);
      }
      return investor;
    }

    findOrCreateProject(name, timestamp) {
      const key = normalizedName(name);
      let project = this.state.projects.find(item => normalizedName(item.name) === key);
      if (!project) {
        project = {
          id: uid('project'),
          code: nextCode(this.state.projects, 'PRJ'),
          name: String(name).trim(),
          created_at: timestamp,
          updated_at: timestamp
        };
        this.state.projects.push(project);
      }
      return project;
    }

    buildInvestment(input, current) {
      const checked = Core.validateInvestment(input);
      if (checked.errors.length) throw new Error(checked.errors.join('\n'));
      const value = checked.value;
      const timestamp = new Date().toISOString();
      const investor = this.findOrCreateInvestor(value.investor_name, timestamp);
      const project = this.findOrCreateProject(value.project_name, timestamp);
      return {
        id: current?.id || uid('investment'),
        investor_id: investor.id,
        investor_name: investor.display_name,
        project_id: project.id,
        project_name: project.name,
        amount: Number(value.amount),
        start_date: value.start_date,
        duration_value: Number(value.duration_value),
        duration_unit: value.duration_unit,
        maturity_date: value.maturity_date,
        interest_rate: Number(value.interest_rate),
        net_profit: Number(value.net_profit),
        note: String(value.note || '').trim(),
        status: current?.status || 'active',
        created_at: current?.created_at || timestamp,
        updated_at: timestamp
      };
    }

    async upsertInvestment(input, id) {
      const index = id ? this.state.investments.findIndex(item => item.id === id) : -1;
      const current = index >= 0 ? this.state.investments[index] : null;
      if (id && !current) throw new Error('找不到要編輯的投資資料。');
      if (current?.status === 'settled') throw new Error('已結算資料已鎖定，請由歷史報表查閱。');
      const record = this.buildInvestment(input, current);
      if (index >= 0) this.state.investments[index] = record;
      else this.state.investments.unshift(record);
      await this.persist(index >= 0 ? 'update_investment' : 'create_investment');
      return clone(record);
    }

    async deleteInvestment(id) {
      const record = this.state.investments.find(item => item.id === id);
      if (!record) return false;
      if (record.status === 'settled') throw new Error('已結算資料不能刪除。');
      this.state.investments = this.state.investments.filter(item => item.id !== id);
      await this.persist('delete_investment');
      return true;
    }

    isDuplicate(input) {
      const checked = Core.validateInvestment(input);
      if (checked.errors.length) return false;
      const value = checked.value;
      return this.state.investments.some(item =>
        normalizedName(item.investor_name) === normalizedName(value.investor_name) &&
        normalizedName(item.project_name) === normalizedName(value.project_name) &&
        item.start_date === value.start_date &&
        Number(item.amount) === Number(value.amount) &&
        Number(item.duration_value) === Number(value.duration_value) &&
        item.duration_unit === value.duration_unit &&
        Number(item.interest_rate) === Number(value.interest_rate) &&
        Number(item.net_profit) === Number(value.net_profit)
      );
    }

    async importInvestments(rows) {
      const imported = [];
      const duplicates = [];
      for (const input of rows || []) {
        if (this.isDuplicate(input)) {
          duplicates.push(input);
          continue;
        }
        const record = this.buildInvestment(input, null);
        this.state.investments.unshift(record);
        imported.push(record);
      }
      if (imported.length) await this.persist('import_excel');
      return { imported: clone(imported), duplicates: clone(duplicates) };
    }

    due(asOfDate) {
      return Core.dueInvestments(this.state, asOfDate).map(item => clone(item));
    }

    async settleDue(asOfDate) {
      const result = Core.createSettlementBatch(this.state, {
        as_of_date: asOfDate,
        settled_at: new Date().toISOString(),
        id_factory: uid
      });
      if (!result.batch) return { batch: null, entries: [] };
      this.state = normalizeState(result.state);
      await this.persist('settle_due_investments');
      return { batch: clone(result.batch), entries: clone(result.entries) };
    }

    batchReport(batchId) {
      const batch = this.state.settlement_batches.find(item => item.id === batchId) || null;
      const entries = this.state.settlement_entries.filter(item => item.batch_id === batchId);
      return {
        batch: clone(batch),
        entries: clone(entries),
        customers: Core.groupEntriesByInvestor(entries)
      };
    }

    investorHistory(investorId, currentBatchId) {
      const investor = this.state.investors.find(item => item.id === investorId) || null;
      const investments = this.state.investments.filter(item => item.investor_id === investorId);
      const entries = this.state.settlement_entries
        .filter(item => item.investor_id === investorId)
        .sort((a, b) => String(b.settled_at).localeCompare(String(a.settled_at)));
      return {
        investor: clone(investor),
        investments: clone(investments),
        history: clone(entries),
        current: clone(entries.filter(item => item.batch_id === currentBatchId))
      };
    }

    backup() {
      return clone(this.state);
    }

    async restore(payload) {
      const restored = normalizeState(payload);
      for (const investment of restored.investments) {
        const checked = Core.validateInvestment(investment);
        if (checked.errors.length) throw new Error(`備份中的投資資料格式不正確：${checked.errors[0]}`);
      }
      this.state = restored;
      await this.persist('restore_backup');
      return this.snapshot();
    }

    async clearAll() {
      this.state = emptyState();
      await this.persist('clear_all_data');
      return this.snapshot();
    }

    async loadDemo() {
      const today = new Date();
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const iso = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      const monthsAgo = count => {
        const value = new Date(day);
        value.setMonth(value.getMonth() - count);
        return iso(value);
      };
      this.state = emptyState();
      const samples = [
        { investor_name: '林怡君', project_name: '設備租賃 A', amount: 800000, start_date: monthsAgo(6), duration_value: 6, duration_unit: 'month', interest_rate: 4, net_profit: 32000, note: '示範到期資料' },
        { investor_name: '陳志明', project_name: '設備租賃 A', amount: 500000, start_date: monthsAgo(6), duration_value: 6, duration_unit: 'month', interest_rate: 4, net_profit: 20000, note: '示範到期資料' },
        { investor_name: '林怡君', project_name: '商務週轉 B', amount: 400000, start_date: monthsAgo(2), duration_value: 6, duration_unit: 'month', interest_rate: 3.75, net_profit: 15000, note: '尚未到期' },
        { investor_name: '王家豪', project_name: '短期專案 C', amount: 300000, start_date: monthsAgo(1), duration_value: 30, duration_unit: 'day', interest_rate: 2.5, net_profit: 7500, note: '依日期可能已到期' }
      ];
      for (const sample of samples) this.state.investments.push(this.buildInvestment(sample, null));
      await this.persist('load_demo_data');
      return this.snapshot();
    }
  }

  window.LocalInvestmentDB = new LocalManagerDB();
})();
