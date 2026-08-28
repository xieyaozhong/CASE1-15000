(() => {
  'use strict';

  let followupRaf = 0;

  function keepSelectedVisible() {
    const track = document.querySelector('.month-tab-track');
    const active = track?.querySelector('button[aria-selected="true"], button.active');
    if (!track || !active) return;

    const trackRect = track.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const pad = 10;

    if (activeRect.left < trackRect.left + pad) {
      track.scrollLeft += activeRect.left - trackRect.left - pad;
    } else if (activeRect.right > trackRect.right - pad) {
      track.scrollLeft += activeRect.right - trackRect.right + pad;
    }
  }

  function refreshAfterReact() {
    if (followupRaf) cancelAnimationFrame(followupRaf);
    followupRaf = requestAnimationFrame(() => {
      followupRaf = requestAnimationFrame(() => {
        followupRaf = 0;
        keepSelectedVisible();
      });
    });
  }

  function injectStyle() {
    if (document.getElementById('month-bad-debt-ui-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'month-bad-debt-ui-fix-style';
    style.textContent = `
      .sheet-wrap .month-tabs{
        box-sizing:border-box!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        display:grid!important;
        grid-template-columns:minmax(0,1fr) auto!important;
        align-items:center!important;
        gap:10px!important;
        margin:0!important;
        padding:9px 10px!important;
        overflow:hidden!important;
        background:#f8fafc!important;
        border-top:1px solid #dfe7ef!important;
        border-bottom:1px solid #dfe7ef!important;
        isolation:isolate!important;
      }

      .sheet-wrap .month-tab-track{
        box-sizing:border-box!important;
        display:flex!important;
        flex-wrap:nowrap!important;
        align-items:center!important;
        gap:6px!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        overflow-x:auto!important;
        overflow-y:hidden!important;
        padding:2px 2px 4px!important;
        margin:0!important;
        scroll-behavior:auto!important;
        scroll-snap-type:x proximity!important;
        overscroll-behavior-x:contain!important;
        -webkit-overflow-scrolling:touch!important;
        scrollbar-width:thin!important;
        scrollbar-color:#cbd5df transparent!important;
      }

      .sheet-wrap .month-tab-track::-webkit-scrollbar{height:4px!important;}
      .sheet-wrap .month-tab-track::-webkit-scrollbar-track{background:transparent!important;}
      .sheet-wrap .month-tab-track::-webkit-scrollbar-thumb{background:#cbd5df!important;border-radius:999px!important;}

      .sheet-wrap .month-tab-track>button{
        box-sizing:border-box!important;
        flex:0 0 auto!important;
        min-width:max-content!important;
        height:34px!important;
        margin:0!important;
        padding:0 11px!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:6px!important;
        white-space:nowrap!important;
        border:1px solid #d6dee8!important;
        border-radius:9px!important;
        background:#fff!important;
        color:#526174!important;
        font-size:11px!important;
        font-weight:760!important;
        line-height:1!important;
        box-shadow:0 1px 1px rgba(15,23,42,.025)!important;
        cursor:pointer!important;
        scroll-snap-align:nearest!important;
        transition:background .12s ease,border-color .12s ease,color .12s ease,box-shadow .12s ease!important;
      }

      .sheet-wrap .month-tab-track>button:hover{
        background:#f4f8f6!important;
        border-color:#bfd0c6!important;
        color:#315f49!important;
      }

      .sheet-wrap .month-tab-track>button b{
        display:inline-grid!important;
        place-items:center!important;
        min-width:20px!important;
        height:20px!important;
        margin:0!important;
        padding:0 6px!important;
        border-radius:999px!important;
        background:#edf1f5!important;
        color:#617083!important;
        font-size:9px!important;
        font-weight:850!important;
        line-height:1!important;
        font-variant-numeric:tabular-nums!important;
      }

      .sheet-wrap .month-tab-track>button.active,
      .sheet-wrap .month-tab-track>button[aria-selected="true"]{
        background:#edf6f1!important;
        border-color:#a9cbb8!important;
        color:#286347!important;
        box-shadow:0 0 0 1px rgba(71,126,95,.05),0 2px 5px rgba(38,99,71,.07)!important;
      }

      .sheet-wrap .month-tab-track>button.active b,
      .sheet-wrap .month-tab-track>button[aria-selected="true"] b{
        background:#dceee4!important;
        color:#286347!important;
      }

      .sheet-wrap .month-tab-track>.bad-debt-tab{
        color:#83545a!important;
        border-color:#e4d3d6!important;
        background:#fffdfd!important;
      }

      .sheet-wrap .month-tab-track>.bad-debt-tab:hover{
        color:#943c47!important;
        border-color:#dfbcc1!important;
        background:#fff7f8!important;
      }

      .sheet-wrap .month-tab-track>.bad-debt-tab.active,
      .sheet-wrap .month-tab-track>.bad-debt-tab[aria-selected="true"]{
        color:#963c47!important;
        border-color:#e1b8bd!important;
        background:#fff0f2!important;
        box-shadow:0 0 0 1px rgba(150,60,71,.04),0 2px 5px rgba(150,60,71,.06)!important;
      }

      .sheet-wrap .month-tab-track>.bad-debt-tab.active b,
      .sheet-wrap .month-tab-track>.bad-debt-tab[aria-selected="true"] b{
        color:#963c47!important;
        background:#f7dfe2!important;
      }

      .sheet-wrap .month-tab-actions{
        box-sizing:border-box!important;
        display:flex!important;
        flex:0 0 auto!important;
        align-items:center!important;
        justify-content:flex-end!important;
        gap:6px!important;
        min-width:max-content!important;
        margin:0!important;
        padding:0!important;
      }

      .sheet-wrap .month-tab-actions>button{
        box-sizing:border-box!important;
        height:34px!important;
        min-height:34px!important;
        margin:0!important;
        padding:0 10px!important;
        border-radius:9px!important;
        white-space:nowrap!important;
        font-size:10px!important;
        font-weight:800!important;
        line-height:1!important;
        cursor:pointer!important;
      }

      .sheet-wrap .month-tab-actions>.manage-bad-debt{
        border:1px solid #e1c5c9!important;
        background:#fff8f9!important;
        color:#93414b!important;
      }

      .sheet-wrap .month-tab-actions>.add-month{
        border:1px solid #bdd1c4!important;
        background:#f2f8f4!important;
        color:#35634b!important;
      }

      .sheet-wrap .sheet-hint{
        box-sizing:border-box!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        margin:0!important;
        padding:8px 12px!important;
        background:#fbfcfd!important;
        border-bottom:1px solid #e6ebf0!important;
        color:#7a8797!important;
        font-size:10px!important;
        line-height:1.45!important;
      }

      @media (max-width:620px){
        .sheet-wrap .month-tabs{
          grid-template-columns:minmax(0,1fr)!important;
          gap:7px!important;
          padding:8px!important;
        }
        .sheet-wrap .month-tab-track{
          padding-bottom:3px!important;
        }
        .sheet-wrap .month-tab-track>button{
          height:36px!important;
          padding:0 10px!important;
          font-size:11px!important;
        }
        .sheet-wrap .month-tab-actions{
          width:100%!important;
          min-width:0!important;
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
        }
        .sheet-wrap .month-tab-actions>button{
          width:100%!important;
          height:35px!important;
        }
        .sheet-wrap .sheet-hint{
          padding:8px 10px!important;
          font-size:9.5px!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bind() {
    document.addEventListener('click', event => {
      if (event.target?.closest?.('.month-tab-track button,.month-tab-actions button')) {
        refreshAfterReact();
      }
    }, true);

    window.addEventListener('resize', refreshAfterReact, { passive: true });
  }

  injectStyle();
  bind();
  refreshAfterReact();
})();