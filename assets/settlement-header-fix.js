(() => {
  'use strict';

  function injectStyle() {
    const existing = document.getElementById('settlement-header-fix-style');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'settlement-header-fix-style';
    style.textContent = `
      .settlement-group{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        overflow:hidden!important;
      }

      .settlement-group-head{
        box-sizing:border-box!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        height:auto!important;
        min-height:74px!important;
        grid-template-columns:minmax(160px,1.35fr) repeat(3,minmax(112px,1fr))!important;
        align-items:stretch!important;
        gap:0!important;
        padding:0!important;
        overflow:hidden!important;
        background:linear-gradient(135deg,#dceaf8 0%,#e8f2fb 54%,#f2f7fc 100%)!important;
        border:1px solid #cfdeed!important;
        border-bottom-color:#c7d8e9!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.72)!important;
      }

      .settlement-group-head>div{
        box-sizing:border-box!important;
        min-width:0!important;
        max-width:100%!important;
        padding:13px 14px!important;
        display:flex!important;
        flex-direction:column!important;
        justify-content:center!important;
        overflow:hidden!important;
        border-right:1px solid rgba(92,128,164,.15)!important;
      }

      .settlement-group-head>div:last-child{
        border-right:0!important;
      }

      .settlement-group-head span{
        display:block!important;
        max-width:100%!important;
        margin:0!important;
        color:#6d8298!important;
        font-size:10px!important;
        font-weight:750!important;
        line-height:1.25!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
      }

      .settlement-group-head strong,
      .settlement-group-head b{
        display:block!important;
        max-width:100%!important;
        margin:4px 0 0!important;
        color:#294d73!important;
        line-height:1.18!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
        word-break:break-word!important;
        font-variant-numeric:tabular-nums!important;
        text-overflow:clip!important;
        overflow:visible!important;
      }

      .settlement-group-head strong{
        font-size:17px!important;
        font-weight:850!important;
      }

      .settlement-group-head b{
        text-align:right!important;
        font-size:14px!important;
        font-weight:850!important;
      }

      .settlement-group-head .net-profit b{
        color:#27835a!important;
      }

      .settlement-group .result-scroll{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
      }

      @media (max-width:900px){
        .settlement-group-head{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
        }
        .settlement-group-head>div{
          min-height:66px!important;
          border-bottom:1px solid rgba(92,128,164,.13)!important;
        }
        .settlement-group-head>div:nth-child(2n){
          border-right:0!important;
        }
        .settlement-group-head>div:nth-last-child(-n+2){
          border-bottom:0!important;
        }
      }

      @media (max-width:520px){
        .settlement-group-head{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
        }
        .settlement-group-head>div{
          min-height:62px!important;
          padding:10px 11px!important;
        }
        .settlement-group-head>div:first-child{
          grid-column:1 / -1!important;
          min-height:64px!important;
          border-right:0!important;
        }
        .settlement-group-head>div:nth-child(3){
          border-right:0!important;
        }
        .settlement-group-head>div:nth-child(2){
          border-bottom:1px solid rgba(92,128,164,.13)!important;
        }
        .settlement-group-head b{
          text-align:left!important;
          font-size:13px!important;
        }
        .settlement-group-head strong{
          font-size:16px!important;
        }
      }

      @media (max-width:360px){
        .settlement-group-head{
          grid-template-columns:1fr!important;
        }
        .settlement-group-head>div,
        .settlement-group-head>div:first-child{
          grid-column:1!important;
          border-right:0!important;
          border-bottom:1px solid rgba(92,128,164,.13)!important;
        }
        .settlement-group-head>div:last-child{
          border-bottom:0!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  injectStyle();
})();