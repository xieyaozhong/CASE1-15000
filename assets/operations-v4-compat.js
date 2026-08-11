(() => {
  let timer = 0;

  function normalizeTable(bodyId) {
    const body = document.querySelector(bodyId);
    const table = body?.closest('table');
    if (!body || !table) return;

    const head = table.querySelector('thead tr');
    if (head && !head.querySelector('.v4-edit-head')) {
      const th = document.createElement('th');
      th.className = 'workspace-select-head v4-edit-head';
      th.textContent = '操作';
      head.appendChild(th);
    }

    [...body.querySelectorAll(':scope > tr')].forEach(row => {
      if (row.querySelector('td.empty')) return;
      const button = row.querySelector('.v4-row-edit');
      if (!button) return;
      let cell = row.querySelector('.v4-edit-cell');
      if (!cell) {
        cell = document.createElement('td');
        cell.className = 'workspace-select-cell v4-edit-cell';
        row.appendChild(cell);
      }
      if (button.parentElement !== cell) cell.appendChild(button);
    });
  }

  function normalize() {
    normalizeTable('#projectAdminBody');
    normalizeTable('#investorBody');
  }

  function schedule(ms = 80) {
    clearTimeout(timer);
    timer = setTimeout(normalize, ms);
  }

  function init() {
    if (!window.DB || !window.UI || !document.querySelector('#adminApp')) { setTimeout(init, 100); return; }
    schedule(320);
    setTimeout(() => schedule(0), 1250);
    window.addEventListener('settlement-data-changed', () => schedule(420));
    document.querySelector('#refreshBtn')?.addEventListener('click', () => schedule(560));
    document.addEventListener('submit', e => {
      if (e.target.matches('#projectForm,#investorForm,#participationForm,#settlementForm,#v4EditForm')) schedule(650);
    });
    document.addEventListener('click', e => {
      if (e.target.closest('.nav-btn,.payout-toggle,.batch-confirm,#doImport,#resetDemo')) schedule(400);
    });
  }

  init();
})();
