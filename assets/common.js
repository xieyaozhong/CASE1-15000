// Shared visual theme and page context.
(() => {
  const loadStyle = (href, key) => {
    if (document.querySelector(`link[data-dashboard-style="${key}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.dashboardStyle = key;
    document.head.appendChild(link);
  };
  const isAdmin = /\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash);
  loadStyle('assets/theme-v2.css?v=20260811', 'theme-v2');
  loadStyle('assets/dashboard-insights.css?v=20260811', 'insights');
  if (isAdmin) loadStyle('assets/admin-workspace.css?v=20260811', 'admin-workspace');
  else loadStyle('assets/mobile-tables.css?v=20260811', 'mobile-tables');
  document.body?.classList.add(isAdmin ? 'page-admin' : 'page-client');
})();

window.UI = (() => {
  const money = v => new Intl.NumberFormat('zh-TW', {maximumFractionDigits: 2}).format(Number(v||0));
  const date = v => v ? new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)) : '—';
  const pct = v => `${Number(v||0).toFixed(2)}%`;
  const esc = s => String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const toast = (msg, type='ok') => {
    let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el);}
    el.textContent=msg; el.style.background=type==='error'?'#8e2f2f':'#11243f'; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2800);
  };
  const statusPill = s => {
    const map={paid:['已撥款','success'],pending:['待撥款','pending'],confirmed:['已確認','info'],draft:['草稿','pending'],active:['進行中','success'],closed:['已結束','info']};
    const [label,cls]=map[s]||[s||'—','info']; return `<span class="pill ${cls}">${esc(label)}</span>`;
  };
  return {money,date,pct,esc,toast,statusPill};
})();

// Load optional safety and UX extensions without changing the base GitHub Pages structure.
(() => {
  const load = src => {
    if (document.querySelector(`script[data-extension="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.dataset.extension = src;
    document.head.appendChild(s);
  };
  const isAdmin = /\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash);
  load('assets/hardening.js');
  load('assets/dashboard-insights.js');
  if (isAdmin) {
    load('assets/admin-batches.js');
    load('assets/import-validator.js');
    load('assets/system-health.js');
    load('assets/admin-workspace.js');
  } else {
    load('assets/mobile-tables.js');
  }
})();
