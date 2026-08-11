(() => {
  if (!/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;

  const configs = [
    { name:'payout', panel:'payout', body:'payoutBody', placeholder:'搜尋週期、投資人、投資案或狀態', selectable:true },
    { name:'projects', panel:'projects', body:'projectAdminBody', placeholder:'搜尋案號、投資案、案源或狀態', detail:'project' },
    { name:'investors', panel:'investors', body:'investorBody', placeholder:'搜尋代碼、名稱或 Email', detail:'investor' },
    { name:'participations', panel:'participations', body:'participationBody', placeholder:'搜尋投資人、投資案或狀態' }
  ];

  const states = new Map();
  const selectedPayouts = new Set();
  let decorating = false;
  let timer = 0;
  let snapshotCache = null;
  let snapshotAt = 0;

  const getState = name => {
    if (!states.has(name)) states.set(name,{query:'',page:1,pageSize:10,sortIndex:-1,sortDir:''});
    return states.get(name);
  };
  const schedule = (ms=60) => { clearTimeout(timer); timer=setTimeout(decorateAll,ms); };
  const logicalCells = row => [...row.children].filter(cell=>!cell.classList.contains('workspace-select-cell'));
  const rowsFor = body => [...body.querySelectorAll(':scope > tr')].filter(row=>!row.querySelector('td.empty'));

  async function getSnapshot(force=false){
    const now=Date.now();
    if(!force && snapshotCache && now-snapshotAt<1200) return snapshotCache;
    snapshotCache=await DB.adminSnapshot(); snapshotAt=now; return snapshotCache;
  }

  function createToolbar(cfg,panel){
    let bar=panel.querySelector(`.workspace-toolbar[data-workspace="${cfg.name}"]`);
    if(bar) return bar;
    bar=document.createElement('div');
    bar.className='workspace-toolbar';
    bar.dataset.workspace=cfg.name;
    bar.innerHTML=`<div class="workspace-tools">
      <label class="workspace-search"><input type="search" autocomplete="off" placeholder="${UI.esc(cfg.placeholder)}" aria-label="搜尋資料"></label>
      <select class="workspace-page-size" aria-label="每頁筆數"><option value="10">10 筆 / 頁</option><option value="20">20 筆 / 頁</option><option value="50">50 筆 / 頁</option><option value="100">100 筆 / 頁</option></select>
      ${cfg.selectable?'<button class="btn btn-sm workspace-batch-action" type="button" disabled>批次標記已撥款 <span class="batch-count">0</span></button>':''}
    </div><div class="workspace-meta"><span class="workspace-count">0 筆</span><div class="workspace-pagination"><button class="btn btn-soft btn-sm workspace-page-btn workspace-prev" type="button">‹</button><span class="workspace-page-label">1 / 1</span><button class="btn btn-soft btn-sm workspace-page-btn workspace-next" type="button">›</button></div></div>`;
    panel.insertBefore(bar,panel.firstElementChild);
    const st=getState(cfg.name), input=bar.querySelector('input'), size=bar.querySelector('select');
    input.value=st.query; size.value=String(st.pageSize);
    input.oninput=()=>{st.query=input.value.trim().toLocaleLowerCase('zh-TW');st.page=1;applyTableState(cfg)};
    size.onchange=()=>{st.pageSize=Number(size.value)||10;st.page=1;applyTableState(cfg)};
    bar.querySelector('.workspace-prev').onclick=()=>{if(st.page>1){st.page--;applyTableState(cfg)}};
    bar.querySelector('.workspace-next').onclick=()=>{st.page++;applyTableState(cfg)};
    if(cfg.selectable) bar.querySelector('.workspace-batch-action').onclick=runBatchPayout;
    return bar;
  }

  function sortableValue(text){
    const raw=String(text||'').trim();
    const numeric=raw.replace(/[,$+%\s，]/g,'');
    if(/^-?\d+(?:\.\d+)?$/.test(numeric)) return {type:'number',value:Number(numeric)};
    const dt=Date.parse(raw); if(!Number.isNaN(dt)&&/\d{4}/.test(raw)) return {type:'number',value:dt};
    return {type:'text',value:raw.toLocaleLowerCase('zh-TW')};
  }

  function bindSorting(cfg,table){
    const st=getState(cfg.name);
    [...table.querySelectorAll('thead th')].filter(th=>!th.classList.contains('workspace-select-head')).forEach((th,index)=>{
      th.classList.add('workspace-sortable');
      if(th.dataset.workspaceSortBound===cfg.name) return;
      th.dataset.workspaceSortBound=cfg.name;
      th.onclick=e=>{
        if(e.target.closest('input,button,a,select')) return;
        if(st.sortIndex===index) st.sortDir=st.sortDir==='asc'?'desc':'asc'; else {st.sortIndex=index;st.sortDir='asc'}
        st.page=1; applyTableState(cfg);
      };
    });
  }

  function sortIndicators(cfg,table){
    const st=getState(cfg.name);
    [...table.querySelectorAll('thead th')].filter(th=>!th.classList.contains('workspace-select-head')).forEach((th,index)=>{
      if(index===st.sortIndex&&st.sortDir) th.dataset.sortDir=st.sortDir; else delete th.dataset.sortDir;
    });
  }

  function ensurePayoutSelection(table,body){
    const head=table.querySelector('thead tr');
    if(head&&!head.querySelector('.workspace-select-head')){
      const th=document.createElement('th'); th.className='workspace-select-head'; th.innerHTML='<input class="workspace-checkbox workspace-select-all" type="checkbox" aria-label="選取本頁待撥款">'; head.insertBefore(th,head.firstElementChild);
      th.querySelector('input').onchange=e=>{
        body.querySelectorAll('tr:not(.workspace-hidden) .workspace-checkbox[data-payout-id]:not(:disabled)').forEach(box=>{box.checked=e.target.checked;box.checked?selectedPayouts.add(box.dataset.payoutId):selectedPayouts.delete(box.dataset.payoutId)});
        updateBatchButton();
      };
    }
    rowsFor(body).forEach(row=>{
      if(row.querySelector('.workspace-select-cell')) return;
      const toggle=row.querySelector('.payout-toggle'), id=toggle?.dataset.id, paid=toggle?.dataset.paid==='true';
      const td=document.createElement('td'); td.className='workspace-select-cell';
      if(id){
        td.innerHTML=`<input class="workspace-checkbox" type="checkbox" data-payout-id="${UI.esc(id)}" ${paid?'disabled':''} ${selectedPayouts.has(id)&&!paid?'checked':''} aria-label="選取撥款">`;
        const box=td.querySelector('input'); box.onchange=()=>{box.checked?selectedPayouts.add(id):selectedPayouts.delete(id);updateBatchButton()};
      }
      row.insertBefore(td,row.firstElementChild);
    });
    const pending=new Set([...body.querySelectorAll('.workspace-checkbox[data-payout-id]:not(:disabled)')].map(box=>box.dataset.payoutId));
    [...selectedPayouts].forEach(id=>{if(!pending.has(id))selectedPayouts.delete(id)});
    updateBatchButton();
  }

  function applyTableState(cfg){
    const panel=document.querySelector(`.panel[data-panel="${cfg.panel}"]`), body=document.querySelector(`#${cfg.body}`), table=body?.closest('table');
    if(!panel||!body||!table) return;
    const bar=createToolbar(cfg,panel), st=getState(cfg.name);
    if(cfg.selectable) ensurePayoutSelection(table,body);
    bindSorting(cfg,table); sortIndicators(cfg,table);
    let rows=rowsFor(body);
    if(st.sortIndex>=0&&st.sortDir){
      rows.sort((a,b)=>{const av=sortableValue(logicalCells(a)[st.sortIndex]?.textContent),bv=sortableValue(logicalCells(b)[st.sortIndex]?.textContent);let r=av.type==='number'&&bv.type==='number'?av.value-bv.value:String(av.value).localeCompare(String(bv.value),'zh-Hant');return st.sortDir==='desc'?-r:r});
      rows.forEach(row=>body.appendChild(row));
    }
    const matched=rows.filter(row=>!st.query||row.textContent.toLocaleLowerCase('zh-TW').includes(st.query));
    const pages=Math.max(1,Math.ceil(matched.length/st.pageSize)); st.page=Math.min(Math.max(1,st.page),pages);
    const visible=new Set(matched.slice((st.page-1)*st.pageSize,st.page*st.pageSize));
    rows.forEach(row=>row.classList.toggle('workspace-hidden',!visible.has(row)));
    bar.querySelector('.workspace-count').textContent=st.query?`${matched.length} / ${rows.length} 筆`:`${rows.length} 筆`;
    bar.querySelector('.workspace-page-label').textContent=`${st.page} / ${pages}`;
    bar.querySelector('.workspace-prev').disabled=st.page<=1; bar.querySelector('.workspace-next').disabled=st.page>=pages;
    if(cfg.selectable){
      const selectAll=table.querySelector('.workspace-select-all'), boxes=[...body.querySelectorAll('tr:not(.workspace-hidden) .workspace-checkbox[data-payout-id]:not(:disabled)')];
      if(selectAll){selectAll.checked=boxes.length>0&&boxes.every(b=>b.checked);selectAll.indeterminate=boxes.some(b=>b.checked)&&!selectAll.checked}
    }
  }

  function updateBatchButton(progress=null){
    const btn=document.querySelector('.workspace-toolbar[data-workspace="payout"] .workspace-batch-action'); if(!btn)return;
    const count=selectedPayouts.size; btn.disabled=count===0||btn.dataset.running==='true';
    btn.innerHTML=progress?`處理中 ${progress.done}/${progress.total}<span class="workspace-progress"><span style="width:${progress.total?progress.done/progress.total*100:0}%"></span></span>`:`批次標記已撥款 <span class="batch-count">${count}</span>`;
  }

  async function runBatchPayout(){
    const ids=[...selectedPayouts]; if(!ids.length||!confirm(`確定要將選取的 ${ids.length} 筆收益標記為已撥款？`))return;
    const btn=document.querySelector('.workspace-batch-action'); if(!btn)return; btn.dataset.running='true';
    let done=0,failed=0; updateBatchButton({done,total:ids.length});
    for(const id of ids){try{await DB.markPaid(id,true);selectedPayouts.delete(id)}catch(_){failed++}done++;updateBatchButton({done,total:ids.length})}
    btn.dataset.running='false'; snapshotCache=null;
    UI.toast(failed?`批次處理完成，${failed} 筆未成功`:`已完成 ${done} 筆撥款標記`,failed?'error':'ok');
    document.querySelector('#refreshBtn')?.click(); schedule(420);
  }

  function ensureDrawer(){
    let overlay=document.querySelector('#workspaceDetailOverlay'); if(overlay)return overlay;
    overlay=document.createElement('div'); overlay.id='workspaceDetailOverlay'; overlay.className='detail-overlay';
    overlay.innerHTML='<aside class="detail-drawer" role="dialog" aria-modal="true"><div class="detail-drawer-head"><div><p>QUICK VIEW</p><h2 id="detailDrawerTitle">資料詳情</h2></div><button class="detail-close" type="button" aria-label="關閉">×</button></div><div id="detailDrawerBody" class="detail-body"></div></aside>';
    document.body.appendChild(overlay); overlay.onclick=e=>{if(e.target===overlay)closeDrawer()}; overlay.querySelector('.detail-close').onclick=closeDrawer;
    return overlay;
  }
  function closeDrawer(){document.querySelector('#workspaceDetailOverlay')?.classList.remove('open');document.body.style.overflow=''}
  function openDrawer(title,html){const overlay=ensureDrawer();overlay.querySelector('#detailDrawerTitle').textContent=title;overlay.querySelector('#detailDrawerBody').innerHTML=html;overlay.classList.add('open');document.body.style.overflow='hidden'}
  const metric=(label,value)=>`<div class="detail-metric"><span>${UI.esc(label)}</span><strong>${UI.esc(value)}</strong></div>`;

  function projectDetail(project,snap){
    const parts=(snap.participations||[]).filter(r=>r.project_id===project.id), settlements=(snap.settlements||[]).filter(r=>r.project_id===project.id);
    const active=parts.filter(r=>r.status==='active'), participated=active.reduce((n,r)=>n+Number(r.amount||0),0), profit=settlements.reduce((n,r)=>n+Number(r.profit_amount||0),0);
    const investors=parts.slice().sort((a,b)=>Number(b.amount||0)-Number(a.amount||0)), recent=settlements.slice().sort((a,b)=>String(b.batch?.week_start||'').localeCompare(String(a.batch?.week_start||''))).slice(0,8);
    return `<div class="detail-hero"><span class="detail-code">${UI.esc(project.code||'PROJECT')}</span><h3>${UI.esc(project.name||'未命名投資案')}</h3><p>${UI.esc(project.source||'未設定案源')} · ${UI.date(project.start_date)}</p></div>
    <div class="detail-metrics">${metric('案件金額',UI.money(project.case_amount))}${metric('目前參與總額',UI.money(participated))}${metric('參與人數',String(new Set(parts.map(r=>r.investor_id)).size))}${metric('累計分配收益',UI.money(profit))}</div>
    <section class="detail-section"><h4>參與投資人</h4><div class="detail-list">${investors.length?investors.map(r=>`<div class="detail-list-row"><span>${UI.esc(r.investor?.display_name||'—')}</span><strong>${UI.money(r.amount)}</strong></div>`).join(''):'<div class="detail-empty">尚無參與紀錄</div>'}</div></section>
    <section class="detail-section"><h4>最近收益分配</h4><div class="detail-list">${recent.length?recent.map(r=>`<div class="detail-list-row"><span>${UI.date(r.batch?.week_start)} · ${UI.esc(r.investor?.display_name||'—')}</span><strong>+${UI.money(r.profit_amount)}</strong></div>`).join(''):'<div class="detail-empty">尚無收益紀錄</div>'}</div></section>
    ${project.note?`<section class="detail-section"><h4>案件備註</h4><div class="detail-note">${UI.esc(project.note)}</div></section>`:''}`;
  }

  function investorDetail(investor,snap){
    const parts=(snap.participations||[]).filter(r=>r.investor_id===investor.id), settlements=(snap.settlements||[]).filter(r=>r.investor_id===investor.id);
    const invested=parts.filter(r=>r.status==='active').reduce((n,r)=>n+Number(r.amount||0),0), profit=settlements.reduce((n,r)=>n+Number(r.profit_amount||0),0), pending=settlements.filter(r=>r.payout_status==='pending').reduce((n,r)=>n+Number(r.profit_amount||0),0), paid=Number(investor.opening_paid_amount||0)+settlements.filter(r=>r.payout_status==='paid').reduce((n,r)=>n+Number(r.profit_amount||0),0);
    const projects=parts.slice().sort((a,b)=>Number(b.amount||0)-Number(a.amount||0));
    return `<div class="detail-hero"><span class="detail-code">${UI.esc(investor.code||'INVESTOR')}</span><h3>${UI.esc(investor.display_name||'未命名投資人')}</h3><p>${UI.esc(investor.email||'尚未設定登入 Email')}</p></div>
    <div class="detail-metrics">${metric('目前投入',UI.money(invested))}${metric('累計收益',UI.money(profit))}${metric('待撥款收益',UI.money(pending))}${metric('累計已撥款',UI.money(paid))}</div>
    <section class="detail-section"><h4>參與投資案</h4><div class="detail-list">${projects.length?projects.map(r=>`<div class="detail-list-row"><span>${UI.esc(r.project?.name||'—')}<br><span class="muted">${UI.esc(r.project?.code||'')}</span></span><strong>${UI.money(r.amount)}</strong></div>`).join(''):'<div class="detail-empty">尚無參與紀錄</div>'}</div></section>
    <section class="detail-section"><h4>帳戶資訊</h4><div class="detail-list"><div class="detail-list-row"><span>登入 Email</span><strong>${UI.esc(investor.email||'尚未設定')}</strong></div><div class="detail-list-row"><span>歷史已撥款起始值</span><strong>${UI.money(investor.opening_paid_amount)}</strong></div><div class="detail-list-row"><span>投資案數</span><strong>${new Set(parts.map(r=>r.project_id)).size}</strong></div></div></section>`;
  }

  async function bindDetails(cfg){
    if(!cfg.detail)return; const body=document.querySelector(`#${cfg.body}`); if(!body)return;
    let snap; try{snap=await getSnapshot()}catch(_){return}
    const entities=cfg.detail==='project'?(snap.projects||[]):(snap.investors||[]), map=new Map(entities.map(e=>[String(e.code||'').trim(),e]));
    rowsFor(body).forEach(row=>{const entity=map.get(logicalCells(row)[0]?.textContent.trim());if(!entity)return;row.classList.add('workspace-row-detail');row.title='點擊查看快速詳情';row.onclick=async e=>{if(e.target.closest('button,input,a,select,textarea'))return;const latest=await getSnapshot(true).catch(()=>snap);openDrawer(cfg.detail==='project'?'投資案詳情':'投資人詳情',cfg.detail==='project'?projectDetail(entity,latest):investorDetail(entity,latest))}});
  }

  async function renderNavCounts(){
    let snap; try{snap=await getSnapshot()}catch(_){return}
    const counts={settlement:(snap.batches||[]).filter(r=>r.status==='draft').length,payout:(snap.settlements||[]).filter(r=>r.payout_status==='pending').length,projects:(snap.projects||[]).filter(r=>r.status==='active').length,investors:(snap.investors||[]).length,participations:(snap.participations||[]).filter(r=>r.status==='active').length};
    document.querySelectorAll('.nav-btn[data-panel]').forEach(btn=>{const value=counts[btn.dataset.panel];let badge=btn.querySelector('.nav-count');if(value==null){badge?.remove();return}if(!badge){badge=document.createElement('span');badge.className='nav-count';btn.appendChild(badge)}if(badge.textContent!==String(value))badge.textContent=String(value)});
  }

  async function decorateAll(){
    if(decorating||!window.DB||!window.UI||!DB.__hardeningLoaded)return; const app=document.querySelector('#adminApp');if(!app||app.style.display==='none')return;
    decorating=true; try{for(const cfg of configs){applyTableState(cfg);await bindDetails(cfg)}await renderNavCounts()}finally{decorating=false}
  }

  function init(){
    if(!window.DB||!window.UI||!DB.__hardeningLoaded){setTimeout(init,80);return}
    ensureDrawer();
    window.addEventListener('settlement-data-changed',()=>{snapshotCache=null;schedule(220)});
    document.querySelector('#refreshBtn')?.addEventListener('click',()=>{snapshotCache=null;schedule(300)});
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>schedule(30)));
    document.addEventListener('submit',e=>{if(e.target.matches('#projectForm,#investorForm,#participationForm,#settlementForm,#adminLoginForm')){snapshotCache=null;schedule(e.target.id==='adminLoginForm'?900:500)}});
    document.addEventListener('click',e=>{if(e.target.closest('.payout-toggle,.batch-confirm,#doImport,#resetDemo')){snapshotCache=null;schedule(600)}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
    schedule(120); setTimeout(()=>schedule(0),950);
  }

  init();
})();
