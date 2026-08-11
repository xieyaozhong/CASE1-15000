(async () => {
  const {money,date,esc,statusPill,toast}=UI;
  const $=s=>document.querySelector(s);
  let snapshot=null;
  const mode=$('#modeChip');
  mode.className=`status-chip ${DB.LIVE?'live':'demo'}`;
  mode.innerHTML=`<span class="status-dot"></span>${DB.LIVE?'正式資料庫':'展示模式'}`;

  async function load(){
    try{
      const user=await DB.currentUser();
      if(DB.LIVE && !user){$('#loginView').style.display='block';$('#appView').style.display='none';return;}
      $('#loginView').style.display='none';$('#appView').style.display='block';$('#logoutBtn').style.display=DB.LIVE?'inline-flex':'none';
      snapshot=await DB.myDashboard(); render();
    }catch(e){toast(e.message||'載入失敗','error');$('#loginView').style.display=DB.LIVE?'block':'none';}
  }
  function render(){
    const {investor,participations,settlements}=snapshot||{investor:null,participations:[],settlements:[]};
    if(!investor){
      $('#welcome').textContent='尚未綁定投資人資料';
      $('#settlementBody').innerHTML='<tr><td colspan="7" class="empty">請聯絡管理員確認你的 Email 已建立於投資人名單。</td></tr>';
      $('#projectBody').innerHTML='<tr><td colspan="6" class="empty">目前沒有可顯示的資料。</td></tr>';return;
    }
    $('#welcome').textContent=`${investor.display_name}｜我的週結算`;
    const today=new Date(), start=new Date(today);start.setDate(today.getDate()-((today.getDay()+6)%7));start.setHours(0,0,0,0);
    const weekProfit=settlements.filter(s=>new Date(s.batch?.week_start||0)>=start).reduce((a,s)=>a+Number(s.profit_amount||0),0);
    const totalProfit=settlements.reduce((a,s)=>a+Number(s.profit_amount||0),0);
    const invested=participations.filter(p=>p.status==='active').reduce((a,p)=>a+Number(p.amount||0),0);
    const paid=Number(investor.opening_paid_amount||0)+settlements.filter(s=>s.payout_status==='paid').reduce((a,s)=>a+Number(s.profit_amount||0),0);
    $('#kpiWeek').textContent=money(weekProfit); $('#kpiProfit').textContent=money(totalProfit); $('#kpiInvested').textContent=money(invested); $('#kpiPaid').textContent=money(paid);
    renderSettlements();
    $('#projectBody').innerHTML=participations.length?participations.map(p=>`<tr><td><strong>${esc(p.project?.name||'—')}</strong><div class="muted">${esc(p.project?.code||'')}</div></td><td>${esc(p.project?.source||'—')}</td><td class="money">${money(p.project?.case_amount)}</td><td class="money">${money(p.amount)}</td><td>${date(p.start_date)}</td><td>${statusPill(p.status)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">目前沒有參與中的投資案。</td></tr>';
  }
  function renderSettlements(){
    const filter=$('#statusFilter').value; const rows=(snapshot?.settlements||[]).filter(s=>!filter||s.payout_status===filter);
    $('#settlementBody').innerHTML=rows.length?rows.map(s=>{const rate=Number(s.invested_amount)?Number(s.profit_amount)/Number(s.invested_amount)*100:0;return `<tr><td>${date(s.batch?.week_start)}－${date(s.batch?.week_end)}</td><td><strong>${esc(s.project?.name||'—')}</strong></td><td class="money">${money(s.invested_amount)}</td><td class="money positive">+${money(s.profit_amount)}</td><td>${rate.toFixed(2)}%</td><td>${statusPill(s.payout_status)}</td><td>${date(s.paid_at)}</td></tr>`}).join(''):'<tr><td colspan="7" class="empty">目前沒有符合條件的結算紀錄。</td></tr>';
  }
  $('#statusFilter').addEventListener('change',renderSettlements);
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await DB.signIn(f.get('email'),f.get('password'));toast('登入成功');await load();}catch(err){toast(err.message,'error');}});
  $('#signupBtn').addEventListener('click',async()=>{const f=new FormData($('#loginForm'));try{await DB.signUp(f.get('email'),f.get('password'));toast('帳號已建立，若有開啟 Email 驗證請先完成驗證。');}catch(err){toast(err.message,'error');}});
  $('#logoutBtn').addEventListener('click',async()=>{await DB.signOut();location.reload();});
  $('#exportBtn').addEventListener('click',()=>{
    const rows=[['週起始','週結束','投資案','參與金額','收益','撥款狀態','撥款日'],...(snapshot?.settlements||[]).map(s=>[s.batch?.week_start||'',s.batch?.week_end||'',s.project?.name||'',s.invested_amount,s.profit_amount,s.payout_status,s.paid_at||''])];
    const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`收益明細_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
  });
  load();
})();
