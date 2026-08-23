(() => {
  'use strict';

  const STORAGE_KEY='case1-excel-ledger-v1';
  const RETURN_KEY='case1-per-case-returns-v1';
  const ACTIVE_MONTH_KEY='case1-ledger-active-month-v1';
  const LEGACY_PROJECT='起租案名/同仁';
  const SYSTEM_COLUMNS=new Set(['狀態','完成日','持續時間','備註']);
  const bridge=window.LedgerSchemaBridge;
  const $=s=>document.querySelector(s);
  let raf=0;
  let observer=null;

  const clean=v=>String(v ?? '').trim();
  const num=v=>{
    if(typeof v==='number') return Number.isFinite(v)?v:0;
    const n=Number(String(v ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n)?n:0;
  };
  const clampPct=v=>Math.max(0,Math.min(100,num(v)));
  const money=v=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(num(v));
  const esc=v=>String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const monthFromDate=v=>/^\d{4}-\d{2}/.test(clean(v))?clean(v).slice(0,7):'';
  const monthLabel=m=>{
    const hit=/^(\d{4})-(\d{2})$/.exec(m||'');
    return hit?`${hit[1]}年${Number(hit[2])}月`:'總表';
  };

  function virtualState(){
    try{
      const state=JSON.parse(localStorage.getItem(STORAGE_KEY));
      return state && Array.isArray(state.headers) && Array.isArray(state.rows)?state:null;
    }catch(_){ return null; }
  }

  function canonicalState(){
    return bridge?.readCanonical?.() || null;
  }

  function returnStore(){
    try{
      const store=JSON.parse(localStorage.getItem(RETURN_KEY));
      return store && typeof store==='object'?store:{};
    }catch(_){ return {}; }
  }

  function investorColumns(headers){
    const start=headers.indexOf('參與總額')+1;
    if(start<=0) return [];
    const end=headers.findIndex((h,i)=>i>=start && SYSTEM_COLUMNS.has(h));
    return headers.slice(start,end<0?headers.length:end).filter(Boolean);
  }

  function activeMonth(){
    const value=localStorage.getItem(ACTIVE_MONTH_KEY);
    return value==='all'||/^\d{4}-\d{2}$/.test(value||'')?value:'all';
  }

  function settlementDate(row){
    return clean(row?.['最近結算日']) || clean(row?.['完成日']);
  }

  function rowIncluded(row,month){
    return month==='all' || monthFromDate(settlementDate(row))===month;
  }

  function baseCaseKey(row){
    return [
      clean(row?.['日期']),
      clean(row?.[LEGACY_PROJECT]),
      clean(row?.['案源']),
      clean(row?.['案件金額']),
      clean(row?.['完成日']),
      clean(row?.['備註'])
    ].join('|');
  }

  function profitSetting(store,key,invested){
    const raw=store[key];
    if(!raw || typeof raw!=='object') return {rate:6,amount:invested*.06};
    if(raw.basis==='amount'){
      const amount=Math.max(0,num(raw.amount));
      return {amount,rate:invested>0?amount/invested*100:0};
    }
    const rate=Math.max(0,num(raw.rate??6));
    return {rate,amount:invested*rate/100};
  }

  function buildTotals(){
    const virtual=virtualState();
    const canonical=canonicalState();
    if(!virtual?.headers || !canonical?.rows) return {investors:[],month:'all'};

    const names=investorColumns(virtual.headers);
    const totals=new Map(names.map(name=>[name,{name,invested:0,profit:0}]));
    const store=returnStore();
    const month=activeMonth();
    const duplicateCount=new Map();

    canonical.rows.forEach(row=>{
      const base=baseCaseKey(row);
      const occurrence=(duplicateCount.get(base)||0)+1;
      duplicateCount.set(base,occurrence);
      if(!rowIncluded(row,month)) return;
      const caseKey=`${base}#${occurrence}`;
      const broker=clampPct(row?.['仲介費']);

      names.forEach(name=>{
        const invested=num(row?.[name]);
        if(invested<=0) return;
        const entry=totals.get(name);
        entry.invested+=invested;
        const setting=profitSetting(store,`${caseKey}|${name}`,invested);
        entry.profit+=Math.max(0,setting.amount*(1-broker/100));
      });
    });

    return {
      month,
      investors:[...totals.values()].filter(x=>x.invested>0||x.profit>0)
    };
  }

  function ensureUI(){
    if($('#investorOverview')) return;
    const wrap=document.querySelector('.sheet-wrap');
    const caption=wrap?.querySelector('.sheet-caption');
    if(!wrap || !caption) return;
    const section=document.createElement('section');
    section.id='investorOverview';
    section.className='investor-overview';
    section.setAttribute('aria-label','投資人總覽');
    section.innerHTML=`
      <article class="overview-panel">
        <div class="overview-head"><strong>總投資金額</strong><span id="overviewInvestmentScope">總表</span></div>
        <div id="overviewInvestmentList" class="overview-list"></div>
      </article>
      <article class="overview-panel overview-profit-panel">
        <div class="overview-head"><strong>投資人總收益</strong><span id="overviewProfitScope">總表</span></div>
        <div id="overviewProfitList" class="overview-list"></div>
      </article>`;
    caption.insertAdjacentElement('beforebegin',section);
  }

  function personRows(items,key,positive=false){
    if(!items.length) return '<div class="overview-empty">目前沒有資料</div>';
    return items.map(item=>`<div class="overview-item"><span>${esc(item.name)}</span><b class="${positive?'positive':''}">${positive?'+':''}${money(item[key])}</b></div>`).join('');
  }

  function render(){
    raf=0;
    ensureUI();
    const investment=$('#overviewInvestmentList');
    const profit=$('#overviewProfitList');
    if(!investment || !profit) return;

    const {investors,month}=buildTotals();
    const scope=month==='all'?'總表':monthLabel(month);
    const investmentTotal=investors.reduce((sum,x)=>sum+x.invested,0);
    const profitTotal=investors.reduce((sum,x)=>sum+x.profit,0);

    investment.innerHTML=personRows(investors,'invested');
    profit.innerHTML=personRows(investors,'profit',true);
    const invScope=$('#overviewInvestmentScope');
    const profitScope=$('#overviewProfitScope');
    if(invScope) invScope.textContent=`${scope}｜${money(investmentTotal)}`;
    if(profitScope) profitScope.textContent=`${scope}｜+${money(profitTotal)}`;
  }

  function schedule(delay=0){
    if(delay){ setTimeout(schedule,delay); return; }
    if(raf) return;
    raf=requestAnimationFrame(render);
  }

  function injectStyle(){
    if($('#investor-overview-style')) return;
    const style=document.createElement('style');
    style.id='investor-overview-style';
    style.textContent=`
      .investor-overview{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px;}
      .overview-panel{min-width:0;background:#fff;border:1px solid #dce4ef;border-radius:12px;padding:11px 12px;box-shadow:0 3px 12px rgba(16,31,53,.04);}
      .overview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
      .overview-head strong{font-size:13px;color:#1f2937;}
      .overview-head span{font-size:9px;font-weight:800;color:#7b8aa1;white-space:nowrap;}
      .overview-list{display:flex;flex-wrap:wrap;gap:6px;}
      .overview-item{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:5px 8px;border:1px solid #e3e8f0;border-radius:8px;background:#f8fafc;font-size:11px;white-space:nowrap;}
      .overview-item span{color:#64748b;font-weight:700;}
      .overview-item b{color:#1f2937;font-variant-numeric:tabular-nums;}
      .overview-profit-panel .overview-item{background:#f7fbf9;border-color:#d8ebe2;}
      .overview-item b.positive{color:#0f7b55;}
      .overview-empty{font-size:11px;color:#94a3b8;padding:4px 0;}
      @media(max-width:700px){
        .investor-overview{grid-template-columns:1fr;gap:7px;margin-bottom:9px;}
        .overview-panel{padding:9px 10px;border-radius:10px;}
        .overview-head{margin-bottom:6px;}
        .overview-list{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;}
        .overview-item{flex:0 0 auto;}
      }
    `;
    document.head.appendChild(style);
  }

  function bind(){
    const table=$('#sheetGrid');
    if(table){
      observer=new MutationObserver(()=>schedule(20));
      observer.observe(table,{childList:true});
    }
    document.addEventListener('input',e=>{
      if(e.target?.closest?.('#sheetGrid,.per-case-profit-table')) schedule(320);
    },{passive:true});
    document.addEventListener('change',e=>{
      if(e.target?.closest?.('#sheetGrid,.per-case-profit-table')) schedule(260);
    },{passive:true});
    document.addEventListener('click',e=>{
      if(e.target?.closest?.('.month-sheet-tab')) schedule(30);
    });
    window.addEventListener('storage',e=>{
      if([STORAGE_KEY,RETURN_KEY,ACTIVE_MONTH_KEY].includes(e.key)) schedule();
    });
  }

  function init(){
    injectStyle();
    ensureUI();
    bind();
    render();
  }

  init();
})();
