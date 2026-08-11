(() => {
  function init() {
    if (!window.DB || !window.UI) { setTimeout(init, 50); return; }
    if (!/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;
    if (window.__batchControlsLoaded) return;
    window.__batchControlsLoaded = true;

    const { money, date, statusPill, toast } = window.UI;

    function ensurePanel() {
      if (document.querySelector('#batchControlCard')) return;
      const app = document.querySelector('#adminApp');
      if (!app) return;
      const kpis = app.querySelector('.kpi-grid');
      if (!kpis) return;

      const wrap = document.createElement('section');
      wrap.className = 'section';
      wrap.id = 'batchControlCard';
      wrap.innerHTML = `
        <div class="section-head">
          <div>
            <h2>週結算批次</h2>
            <p>先試算，確認後鎖定金額；全部撥款完成後批次會自動變成「已撥款」。</p>
          </div>
        </div>
        <div class="notice warn" style="margin-bottom:12px">
          「確認結算」後不能再修改該週既有收益分配。正式營運時，這能避免客戶已看到的收益數字被誤改。
        </div>
        <div class="card table-wrap">
          <table>
            <thead><tr><th>週期</th><th>投資案數</th><th>收益筆數</th><th>本週分配收益</th><th>撥款進度</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody id="batchControlBody"><tr><td colspan="7" class="empty">讀取中…</td></tr></tbody>
          </table>
        </div>`;
      kpis.insertAdjacentElement('afterend', wrap);
    }

    async function render() {
      ensurePanel();
      const body = document.querySelector('#batchControlBody');
      const app = document.querySelector('#adminApp');
      if (!body || !app || app.style.display === 'none') return;
      try {
        const snap = await DB.adminSnapshot();
        const batches = [...(snap.batches || [])].sort((a,b) => String(b.week_start).localeCompare(String(a.week_start)));
        if (!batches.length) {
          body.innerHTML = '<tr><td colspan="7" class="empty">尚無週結算批次</td></tr>';
          return;
        }

        body.innerHTML = batches.map(batch => {
          const rows = (snap.settlements || []).filter(s => s.batch_id === batch.id);
          const projectCount = new Set(rows.map(s => s.project_id)).size;
          const totalProfit = rows.reduce((n,s) => n + Number(s.profit_amount || 0), 0);
          const paidCount = rows.filter(s => s.payout_status === 'paid').length;
          const action = batch.status === 'draft'
            ? `<button class="btn btn-primary btn-sm batch-confirm" data-id="${batch.id}">確認結算並鎖定</button>`
            : '<span class="muted">已鎖定</span>';
          return `<tr>
            <td>${date(batch.week_start)}－${date(batch.week_end)}</td>
            <td>${projectCount}</td>
            <td>${rows.length}</td>
            <td class="money positive">+${money(totalProfit)}</td>
            <td>${paidCount} / ${rows.length}</td>
            <td>${statusPill(batch.status)}</td>
            <td>${action}</td>
          </tr>`;
        }).join('');

        document.querySelectorAll('.batch-confirm').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm('確認後，此週既有收益分配將被鎖定且不能重新計算。確定要確認結算嗎？')) return;
            try {
              await DB.confirmBatch(btn.dataset.id);
              toast('本週結算已確認並鎖定');
              await render();
            } catch (e) {
              toast(e.message || '確認失敗', 'error');
            }
          };
        });
      } catch (e) {
        body.innerHTML = `<tr><td colspan="7" class="empty">${String(e.message || e)}</td></tr>`;
      }
    }

    window.addEventListener('settlement-data-changed', render);
    document.querySelector('#refreshBtn')?.addEventListener('click', () => setTimeout(render, 0));
    document.querySelector('#adminLoginForm')?.addEventListener('submit', () => setTimeout(render, 700));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

    setTimeout(render, 80);
    setTimeout(render, 900);
  }

  init();
})();
