(async()=>{
  const {money,date,esc,statusPill,toast}=UI,$=s=>document.querySelector(s); let snap=null,importPayload=null;
  const mode=$('#modeChip');mode.className=`status-chip ${DB.LIVE?'live':'demo'}`;mode.innerHTML=`<span class="status-dot"></span>${DB.LIVE?'正式資料庫':'展示模式'}`;
  function iso(d){return new Date(d).toISOString().slice(0,10)}
  const today=new Date(),mon=new Date(today);mon.setDate(today.getDate()-((today.getDay()+6)%7));const sun=new Date(mon);sun.setDate(mon.getDate()+6);$('#weekStart').value=iso(mon);$('#weekEnd').value=iso(sun);

  async function boot(){
    try{
      if(DB.LIVE){const u=await DB.currentUser();if(!u){showLogin();return;}const r=await DB.role();if(r!=='admin'){showLogin('此帳號不是管理員，無法進入後台。');return;}}
      $('#adminLogin').style.display='none';$('#adminApp').style.display='block';$('#logoutBtn').style.display=DB.LIVE?'inline-flex':'none';await refresh();
    }catch(e){showLogin(e.message);}
  }
  function showLogin(msg=''){$('#adminLogin').style.display='block';$('#adminApp').style.display='none';if(msg)toast(msg,'error');}
  async function refresh(){snap=await DB.adminSnapshot();render();}
  function render(){
    const activeParts=snap.participations.filter(p=>p.status==='active');
    $('#admInvestors').textContent=snap.investors.length;$('#admProjects').textContent=snap.projects.filter(p=>p.status==='active').length;$('#admPrincipal').textContent=money(activeParts.reduce((a,p)=>a+Number(p.amount||0),0));$('#admPending').textContent=money(snap.settlements.filter(s=>s.payout_status==='pending').reduce((a,s)=>a+Number(s.profit_amount||0),0));
    const projOpts=snap.projects.filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${esc(p.code)}｜${esc(p.name)}</option>`).join('');$('#settleProject').innerHTML=projOpts;$('#partProject').innerHTML=projOpts;
    $('#partInvestor').innerHTML=snap.investors.map(i=>`<option value="${i.id}">${esc(i.code)}｜${esc(i.display_name)}</option>`).join('');
    $('#projectAdminBody').innerHTML=snap.projects.length?snap.projects.map(p=>`<tr><td>${esc(p.code)}</td><td><strong>${esc(p.name)}</strong></td><td>${esc(p.source||'—')}</td><td class="money">${money(p.case_amount)}</td><td>${statusPill(p.status)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">尚無投資案</td></tr>';
    $('#investorBody').innerHTML=snap.investors.length?snap.investors.map(i=>`<tr><td>${esc(i.code)}</td><td><strong>${esc(i.display_name)}</strong></td><td>${esc(i.email||'尚未設定')}</td><td class="money">${money(i.opening_paid_amount)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">尚無投資人</td></tr>';
    $('#participationBody').innerHTML=snap.participations.length?snap.participations.map(p=>`<tr><td>${esc(p.investor?.display_name||'—')}</td><td>${esc(p.project?.name||'—')}</td><td class="money">${money(p.amount)}</td><td>${date(p.start_date)}</td><td>${statusPill(p.status)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">尚無參與紀錄</td></tr>';
    $('#payoutBody').innerHTML=snap.settlements.length?snap.settlements.map(s=>`<tr><td>${date(s.batch?.week_start)}－${date(s.batch?.week_end)}</td><td>${esc(s.investor?.display_name||'—')}</td><td>${esc(s.project?.name||'—')}</td><td class="money positive">+${money(s.profit_amount)}</td><td>${statusPill(s.payout_status)}</td><td><button class="btn btn-sm ${s.payout_status==='paid'?'btn-soft':'btn-success'} payout-toggle" data-id="${s.id}" data-paid="${s.payout_status==='paid'}">${s.payout_status==='paid'?'改為待撥':'標記已撥款'}</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">尚無結算資料</td></tr>';
    document.querySelectorAll('.payout-toggle').forEach(b=>b.onclick=async()=>{try{await DB.markPaid(b.dataset.id,b.dataset.paid!=='true');toast('撥款狀態已更新');await refresh();}catch(e){toast(e.message,'error')}});
    $('#settingMode').innerHTML=DB.LIVE?'目前為 <strong>正式資料庫模式</strong>，資料會寫入 Supabase。':'目前為 <strong>展示模式</strong>，資料只存在這台裝置的 localStorage。';
  }
  document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.panel));});
  $('#refreshBtn').onclick=refresh;
  $('#adminLoginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await DB.signIn(f.get('email'),f.get('password'));await boot();}catch(err){toast(err.message,'error')}};
  $('#logoutBtn').onclick=async()=>{await DB.signOut();location.reload()};
  $('#projectForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));f.case_amount=Number(f.case_amount);f.start_date=f.start_date||null;f.source=f.source||null;f.note=f.note||null;try{await DB.createProject(f);e.currentTarget.reset();toast('投資案已新增');await refresh();}catch(err){toast(err.message,'error')}};
  $('#investorForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));f.email=f.email||null;f.opening_paid_amount=Number(f.opening_paid_amount||0);try{await DB.createInvestor(f);e.currentTarget.reset();toast('投資人已新增');await refresh();}catch(err){toast(err.message,'error')}};
  $('#participationForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));f.amount=Number(f.amount);try{await DB.createParticipation(f);e.currentTarget.reset();toast('參與紀錄已新增');await refresh();}catch(err){toast(err.message,'error')}};
  $('#settlementForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{const rows=await DB.allocateWeek(f);toast(`已完成 ${rows?.length||0} 筆收益分配`);await refresh();const enriched=(snap.settlements||[]).filter(s=>s.batch?.week_start===f.week_start&&s.project_id===f.project_id);$('#latestAllocation').innerHTML=`<div class="card table-wrap"><table><thead><tr><th>投資人</th><th>參與金額</th><th>本週收益</th><th>狀態</th></tr></thead><tbody>${enriched.map(s=>`<tr><td>${esc(s.investor?.display_name||'—')}</td><td class="money">${money(s.invested_amount)}</td><td class="money positive">+${money(s.profit_amount)}</td><td>${statusPill(s.payout_status)}</td></tr>`).join('')}</tbody></table></div>`;}catch(err){toast(err.message,'error')}};

  function excelDate(v){if(!v)return null;if(v instanceof Date)return iso(v);if(typeof v==='number'&&window.XLSX){const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}const dt=new Date(v);return isNaN(dt)?null:iso(dt)}
  async function parseFile(file){
    const ab=await file.arrayBuffer();const wb=XLSX.read(ab,{cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});if(rows.length<2)throw new Error('Excel 沒有可匯入的資料。');
    const h=rows[0].map(x=>String(x??'').trim());const idxTotal=h.indexOf('參與總額'),idxPayout=h.indexOf('目前總共撥款');if(idxTotal<0)throw new Error('找不到「參與總額」欄位。');
    const investorCols=[];for(let i=idxTotal+1;i<h.length;i++){if(idxPayout>=0&&i>=idxPayout)break;if(!h[i])break;investorCols.push([i,h[i]]);}if(!investorCols.length)throw new Error('找不到參與人欄位。');
    const projects=[];for(let r=1;r<rows.length;r++){const row=rows[r];const name=row[1];const caseAmt=Number(row[3]||0);if(!name||!caseAmt)continue;const allocations=investorCols.map(([i,n])=>({investor:n,amount:Number(row[i]||0)})).filter(x=>x.amount>0);const notes=[];const noteStart=investorCols[investorCols.length-1][0]+1;const noteEnd=idxPayout>0?idxPayout:row.length;for(let i=noteStart;i<noteEnd;i++)if(row[i]!=null&&String(row[i]).trim())notes.push(String(row[i]).trim());projects.push({name:String(name),source:String(row[2]??''),case_amount:caseAmt,participated_total:Number(row[idxTotal]||0),start_date:excelDate(row[0]),note:notes.join(' / '),allocations});}
    const payoutMap=new Map();if(idxPayout>=0){for(let r=1;r<rows.length;r++){const n=rows[r][idxPayout],v=rows[r][idxPayout+1];if(n!=null&&v!=null&&Number(v)>=0)payoutMap.set(String(n).trim(),Number(v));}}
    const names=[...new Set(investorCols.map(x=>x[1]))];const investors=names.map(display_name=>({display_name,opening_paid_amount:payoutMap.get(display_name)??0}));return {projects,investors};
  }
  async function previewFile(file){try{importPayload=await parseFile(file);const partCount=importPayload.projects.reduce((n,p)=>n+p.allocations.length,0);$('#importPreview').innerHTML=`<div class="notice">辨識完成：${importPayload.projects.length} 筆投資案、${importPayload.investors.length} 位投資人、${partCount} 筆參與紀錄。</div><div class="preview-list">${importPayload.projects.slice(0,12).map(p=>`<div class="preview-item"><span><strong>${esc(p.name)}</strong><br><span class="muted">${date(p.start_date)} · ${esc(p.source||'無案源')}</span></span><span class="money">${money(p.case_amount)}</span></div>`).join('')}</div><div class="form-actions"><button id="doImport" class="btn btn-primary">確認匯入</button></div>`;$('#doImport').onclick=async()=>{try{const res=await DB.importLegacy(importPayload);toast(`匯入完成：${res.projects||0} 筆投資案`);await refresh();}catch(e){toast(e.message,'error')}};}catch(e){toast(e.message,'error')}}
  $('#xlsxInput').onchange=e=>e.target.files[0]&&previewFile(e.target.files[0]);const dz=$('#dropzone');['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>e.dataTransfer.files[0]&&previewFile(e.dataTransfer.files[0]));
  $('#resetDemo').onclick=()=>{if(!DB.LIVE&&confirm('確定重設展示資料？')){DB.resetDemo();refresh();toast('展示資料已重設')}};
  boot();
})();
