(() => {
  function init() {
    if (!window.DB) { setTimeout(init, 50); return; }
    if (DB.__hardeningLoaded) return;
    DB.__hardeningLoaded = true;

    const LIVE = Boolean(DB.LIVE);
    const STORAGE_KEY = 'case1-weekly-settlement-demo-v2';
    const originalAllocate = DB.allocateWeek;
    const originalDashboard = DB.myDashboard;

    const loadDemo = () => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
      catch (_) { return null; }
    };
    const saveDemo = data => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const changed = () => window.dispatchEvent(new CustomEvent('settlement-data-changed'));

    DB.allocateWeek = async function(input) {
      if (LIVE) {
        const { data, error } = await DB.client.rpc('allocate_project_week_safe', {
          p_week_start: input.week_start,
          p_week_end: input.week_end,
          p_project_id: input.project_id,
          p_gross_profit: Number(input.gross_profit),
          p_fee_amount: Number(input.fee_amount || 0)
        });
        if (error) throw error;
        changed();
        return data;
      }

      const d = loadDemo();
      const batch = d?.batches?.find(b => b.week_start === input.week_start && b.week_end === input.week_end);
      if (batch && batch.status !== 'draft') {
        throw new Error('此週結算已確認鎖定，無法重新計算。');
      }
      const result = await originalAllocate(input);
      changed();
      return result;
    };

    DB.confirmBatch = async function(batchId) {
      if (LIVE) {
        const { data, error } = await DB.client.rpc('confirm_settlement_batch', { p_batch_id: batchId });
        if (error) throw error;
        changed();
        return data;
      }

      const d = loadDemo();
      const batch = d?.batches?.find(b => b.id === batchId);
      if (!batch) throw new Error('找不到結算批次。');
      if (batch.status !== 'draft') return batch;
      if (!d.settlements.some(s => s.batch_id === batchId)) throw new Error('此批次尚無收益分配，不能確認。');
      batch.status = 'confirmed';
      saveDemo(d);
      changed();
      return batch;
    };

    DB.markPaid = async function(settlementId, paid = true) {
      if (LIVE) {
        const { data, error } = await DB.client.rpc('set_settlement_paid', {
          p_settlement_id: settlementId,
          p_paid: Boolean(paid)
        });
        if (error) throw error;
        changed();
        return data;
      }

      const d = loadDemo();
      const row = d?.settlements?.find(s => s.id === settlementId);
      if (!row) throw new Error('找不到收益紀錄。');
      const batch = d.batches.find(b => b.id === row.batch_id);
      if (!batch || batch.status === 'draft') throw new Error('請先確認並鎖定本週結算，再進行撥款。');

      row.payout_status = paid ? 'paid' : 'pending';
      row.paid_at = paid ? new Date().toISOString() : null;
      const pending = d.settlements.some(s => s.batch_id === row.batch_id && s.payout_status !== 'paid');
      batch.status = pending ? 'confirmed' : 'paid';
      saveDemo(d);
      changed();
      return row;
    };

    DB.myDashboard = async function() {
      const result = await originalDashboard();
      if (LIVE || !result) return result;
      const d = loadDemo();
      const finalized = new Set((d?.batches || []).filter(b => b.status === 'confirmed' || b.status === 'paid').map(b => b.id));
      return {
        ...result,
        settlements: (result.settlements || []).filter(s => finalized.has(s.batch_id))
      };
    };

    changed();
  }

  init();
})();
