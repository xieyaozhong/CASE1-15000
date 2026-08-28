(() => {
  'use strict';

  if (document.getElementById('ledger-layout-stability-style')) return;

  const style = document.createElement('style');
  style.id = 'ledger-layout-stability-style';
  style.textContent = `
    html, body.ledger-page {
      max-width: 100%;
      overflow-x: hidden !important;
    }

    body.ledger-page main,
    body.ledger-page .settlement-section,
    body.ledger-page .investor-groups,
    body.ledger-page .investor-group,
    body.ledger-page .investor-group-head {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    body.ledger-page .investor-group {
      width: 100% !important;
      overflow: hidden !important;
    }

    body.ledger-page .investor-projects {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-x: contain !important;
    }

    body.ledger-page .per-case-profit-table {
      width: max-content !important;
      min-width: 980px !important;
      max-width: none !important;
      table-layout: auto !important;
    }

    body.ledger-page .investor-group-head > *,
    body.ledger-page .per-case-summary > * {
      min-width: 0 !important;
    }

    @media (max-width: 700px) {
      body.ledger-page .settlement-section {
        width: calc(100% - 20px) !important;
        max-width: calc(100% - 20px) !important;
      }

      body.ledger-page .investor-projects {
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
    }
  `;

  document.head.appendChild(style);
})();
