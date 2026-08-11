(() => {
  let rendering = false;

  function waitForApp() {
    if (!window.DB || !window.UI || !DB.__hardeningLoaded) { setTimeout(waitForApp, 80); return; }
    render();
    setTimeout(render, 650);
  }

  const pageIsAdmin = () => document.body.classList.contains('page-admin') || /\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash);
  const toNumber = value => Number(value || 0);
  const clamp = value => Math.max(0, Math.min(100, value));

  function weekLabel(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function groupTrend(settlements) {
    const grouped = new Map();
    (settlements || []).forEach(row => {
      const key = row.batch?.week_start || row.week_start || '';
      if (!key) return;
      grouped.set(key, (grouped.get(key) || 0) + toNumber(row.profit_amount));
    });
    return [...grouped.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .slice(-8)
      .map(([week, value]) => ({ week, value }));
  }

  function trendMarkup(rows) {
    if (!rows.length) return '<div class="insight-empty">目前還沒有可繪製的週收益資料</div>';
    const max = Math.max(...rows.map(row => row.value), 1);
    return `<div class="trend-chart" role="img" aria-label="近八週收益趨勢">
      ${rows.map(row => {
        const height = Math.max(8, Math.round(row.value / max * 100));
        return `<div class="trend-item" title="${weekLabel(row.week)}：${UI.money(row.value)}">
          <div class="trend-value">${UI.money(row.value)}</div>
          <div class="trend-column"><span style="height:${height}%"></span></div>
          <div class="trend-label">${weekLabel(row.week)}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function ensureDeck(target) {
    let deck = document.querySelector('#dashboardInsightDeck');
    if (deck) return deck;
    deck = document.createElement('section');
    deck.id = 'dashboardInsightDeck';
    deck.className = 'insight-grid section';
    target.insertAdjacentElement('afterend', deck);
    return deck;
  }

  function renderClient(snapshot) {
    const target = document.querySelector('#appView .kpi-grid');
    if (!target || document.querySelector('#appView')?.style.display === 'none') return;
    const deck = ensureDeck(target);
    const settlements = snapshot?.settlements || [];
    const participations = snapshot?.participations || [];
    const investor = snapshot?.investor || {};
    const trend = groupTrend(settlements);
    const totalProfit = settlements.reduce((sum, row) => sum + toNumber(row.profit_amount), 0);
    const paidProfit = settlements.filter(row => row.payout_status === 'paid').reduce((sum, row) => sum + toNumber(row.profit_amount), 0);
    const pendingProfit = settlements.filter(row => row.payout_status === 'pending').reduce((sum, row) => sum + toNumber(row.profit_amount), 0);
    const openingPaid = toNumber(investor.opening_paid_amount);
    const activeProjects = participations.filter(row => row.status === 'active').length;
    const payoutRate = totalProfit > 0 ? clamp(paidProfit / totalProfit * 100) : 0;

    deck.innerHTML = `
      <article class="card card-pad insight-card insight-wide">
        <div class="insight-head">
          <div><span class="insight-kicker">PERFORMANCE</span><h2>近 8 週收益趨勢</h2><p>以已顯示在帳戶中的週結算收益彙整</p></div>
          <span class="insight-chip">8 WEEKS</span>
        </div>
        ${trendMarkup(trend)}
      </article>
      <article class="card card-pad insight-card">
        <div class="insight-head">
          <div><span class="insight-kicker">PORTFOLIO</span><h2>資產概況</h2><p>快速確認參與與撥款狀態</p></div>
        </div>
        <div class="insight-stat"><span>進行中投資案</span><strong>${activeProjects}</strong></div>
        <div class="insight-stat"><span>待撥款收益</span><strong>${UI.money(pendingProfit)}</strong></div>
        <div class="insight-stat"><span>歷史已撥款起始值</span><strong>${UI.money(openingPaid)}</strong></div>
        <div class="progress-block">
          <div class="progress-copy"><span>本系統收益撥款率</span><strong>${payoutRate.toFixed(0)}%</strong></div>
          <div class="progress-track"><span style="width:${payoutRate}%"></span></div>
        </div>
      </article>`;
  }

  function renderAdmin(snapshot) {
    const target = document.querySelector('#adminApp .kpi-grid');
    if (!target || document.querySelector('#adminApp')?.style.display === 'none') return;
    const deck = ensureDeck(target);
    const settlements = snapshot?.settlements || [];
    const batches = snapshot?.batches || [];
    const trend = groupTrend(settlements);
    const paidRows = settlements.filter(row => row.payout_status === 'paid');
    const pendingRows = settlements.filter(row => row.payout_status === 'pending');
    const paidAmount = paidRows.reduce((sum, row) => sum + toNumber(row.profit_amount), 0);
    const pendingAmount = pendingRows.reduce((sum, row) => sum + toNumber(row.profit_amount), 0);
    const payoutRate = settlements.length ? clamp(paidRows.length / settlements.length * 100) : 0;
    const draftBatches = batches.filter(row => row.status === 'draft').length;
    const lockedBatches = batches.filter(row => row.status === 'confirmed' || row.status === 'paid').length;

    deck.innerHTML = `
      <article class="card card-pad insight-card insight-wide">
        <div class="insight-head">
          <div><span class="insight-kicker">WEEKLY DISTRIBUTION</span><h2>近 8 週收益分配</h2><p>快速辨識每週分配規模與變化</p></div>
          <span class="insight-chip">OPS VIEW</span>
        </div>
        ${trendMarkup(trend)}
      </article>
      <article class="card card-pad insight-card">
        <div class="insight-head">
          <div><span class="insight-kicker">PAYOUT STATUS</span><h2>撥款完成度</h2><p>以目前收益明細筆數計算</p></div>
        </div>
        <div class="insight-stat"><span>待撥款</span><strong>${UI.money(pendingAmount)}</strong></div>
        <div class="insight-stat"><span>已撥款</span><strong>${UI.money(paidAmount)}</strong></div>
        <div class="insight-stat"><span>已鎖定批次 / 草稿</span><strong>${lockedBatches} / ${draftBatches}</strong></div>
        <div class="progress-block">
          <div class="progress-copy"><span>收益明細完成率</span><strong>${payoutRate.toFixed(0)}%</strong></div>
          <div class="progress-track"><span style="width:${payoutRate}%"></span></div>
        </div>
      </article>`;
  }

  async function render() {
    if (rendering || !window.DB || !window.UI || !DB.__hardeningLoaded) return;
    rendering = true;
    try {
      if (pageIsAdmin()) {
        const app = document.querySelector('#adminApp');
        if (!app || app.style.display === 'none') return;
        renderAdmin(await DB.adminSnapshot());
      } else {
        const app = document.querySelector('#appView');
        if (!app || app.style.display === 'none') return;
        renderClient(await DB.myDashboard());
      }
    } catch (_) {
      // Login and RLS failures are already handled by the primary page scripts.
    } finally {
      rendering = false;
    }
  }

  window.addEventListener('settlement-data-changed', () => setTimeout(render, 0));
  window.addEventListener('storage', () => setTimeout(render, 0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  document.querySelector('#refreshBtn')?.addEventListener('click', () => setTimeout(render, 120));
  document.querySelector('#loginForm')?.addEventListener('submit', () => setTimeout(render, 700));
  document.querySelector('#adminLoginForm')?.addEventListener('submit', () => setTimeout(render, 800));

  waitForApp();
})();
