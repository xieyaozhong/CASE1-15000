(() => {
  const STORAGE_KEY = 'case1-weekly-settlement-demo-v2';

  function init() {
    if (!window.DB || typeof DB.updateInvestor !== 'function') { setTimeout(init, 90); return; }
    if (DB.__v4InvestorEditHardened) return;
    DB.__v4InvestorEditHardened = true;

    DB.updateInvestor = async (id, values) => {
      const patch = {
        code: String(values.code || '').trim(),
        display_name: String(values.display_name || '').trim(),
        email: String(values.email || '').trim() || null,
        opening_paid_amount: Number(values.opening_paid_amount || 0)
      };
      if (!patch.code || !patch.display_name) throw new Error('投資人代碼與顯示名稱不能空白。');
      if (patch.opening_paid_amount < 0) throw new Error('歷史已撥款起始值不能小於 0。');

      if (!DB.LIVE) {
        let store;
        try { store = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
        const row = store?.investors?.find(item => item.id === id);
        if (!row) throw new Error('找不到投資人。');
        if (store.investors.some(item => item.id !== id && item.code === patch.code)) throw new Error('投資人代碼已被使用。');
        if (patch.email && store.investors.some(item => item.id !== id && String(item.email || '').toLowerCase() === patch.email.toLowerCase())) throw new Error('此 Email 已被其他投資人使用。');
        Object.assign(row, patch);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        window.dispatchEvent(new CustomEvent('settlement-data-changed'));
        return row;
      }

      const { data, error } = await DB.client
        .from('investors')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      window.dispatchEvent(new CustomEvent('settlement-data-changed'));
      return data;
    };
  }

  init();
})();
