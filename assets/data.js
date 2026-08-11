(() => {
  const cfg = window.APP_CONFIG || {};
  const LIVE = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.DEMO_MODE && window.supabase);
  const client = LIVE ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const STORAGE_KEY = 'case1-weekly-settlement-demo-v2';

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const lastSunday = new Date(lastMonday); lastSunday.setDate(lastMonday.getDate() + 6);

  const demoSeed = () => {
    const investors = [
      { id: uid(), code: 'INV-A', display_name: '投資人 A', email: 'a@example.com', opening_paid_amount: 38.5 },
      { id: uid(), code: 'INV-B', display_name: '投資人 B', email: 'b@example.com', opening_paid_amount: 21 },
      { id: uid(), code: 'INV-C', display_name: '投資人 C', email: 'c@example.com', opening_paid_amount: 12 }
    ];
    const projects = [
      { id: uid(), code: 'P-001', name: '設備租賃 A', source: '業務 A', case_amount: 500, start_date: iso(new Date(now.getFullYear(), now.getMonth()-2, 8)), status: 'active', note: '' },
      { id: uid(), code: 'P-002', name: '商務案 B', source: '合作夥伴', case_amount: 300, start_date: iso(new Date(now.getFullYear(), now.getMonth()-1, 15)), status: 'active', note: '' },
      { id: uid(), code: 'P-003', name: '短期案 C', source: '業務 B', case_amount: 200, start_date: iso(new Date(now.getFullYear(), now.getMonth(), 2)), status: 'active', note: '' }
    ];
    const participations = [
      { id: uid(), project_id: projects[0].id, investor_id: investors[0].id, amount: 80, start_date: projects[0].start_date, status: 'active' },
      { id: uid(), project_id: projects[0].id, investor_id: investors[1].id, amount: 50, start_date: projects[0].start_date, status: 'active' },
      { id: uid(), project_id: projects[1].id, investor_id: investors[0].id, amount: 40, start_date: projects[1].start_date, status: 'active' },
      { id: uid(), project_id: projects[1].id, investor_id: investors[2].id, amount: 60, start_date: projects[1].start_date, status: 'active' },
      { id: uid(), project_id: projects[2].id, investor_id: investors[1].id, amount: 30, start_date: projects[2].start_date, status: 'active' }
    ];
    const batchId = uid();
    const batches = [{ id: batchId, week_start: iso(lastMonday), week_end: iso(lastSunday), status: 'confirmed' }];
    const settlements = [
      { id: uid(), batch_id: batchId, project_id: projects[0].id, investor_id: investors[0].id, invested_amount: 80, profit_amount: 3.2, payout_status: 'paid', paid_at: iso(lastSunday) },
      { id: uid(), batch_id: batchId, project_id: projects[0].id, investor_id: investors[1].id, invested_amount: 50, profit_amount: 2, payout_status: 'paid', paid_at: iso(lastSunday) },
      { id: uid(), batch_id: batchId, project_id: projects[1].id, investor_id: investors[0].id, invested_amount: 40, profit_amount: 1.5, payout_status: 'pending', paid_at: null },
      { id: uid(), batch_id: batchId, project_id: projects[1].id, investor_id: investors[2].id, invested_amount: 60, profit_amount: 2.25, payout_status: 'pending', paid_at: null }
    ];
    return { investors, projects, participations, batches, settlements };
  };

  function loadDemo() {
    let data;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
    if (!data || !data.investors) {
      data = demoSeed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    return data;
  }
  function saveDemo(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function projectById(data, id) { return data.projects.find(x => x.id === id); }
  function investorById(data, id) { return data.investors.find(x => x.id === id); }
  function batchById(data, id) { return data.batches.find(x => x.id === id); }

  async function currentUser() {
    if (!LIVE) return { id: 'demo-investor', email: 'a@example.com', demo: true };
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user;
  }
  async function signIn(email, password) {
    if (!LIVE) return currentUser();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await client.rpc('claim_my_investor');
    return data.user;
  }
  async function signUp(email, password) {
    if (!LIVE) return currentUser();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  }
  async function signOut() { if (LIVE) await client.auth.signOut(); }

  async function role() {
    if (!LIVE) return 'admin';
    const u = await currentUser();
    if (!u) return null;
    const { data, error } = await client.from('app_users').select('role').eq('user_id', u.id).maybeSingle();
    if (error) throw error;
    return data?.role || 'investor';
  }

  async function myDashboard() {
    if (!LIVE) {
      const data = loadDemo();
      const investor = data.investors[0];
      const parts = data.participations.filter(p => p.investor_id === investor.id).map(p => ({...p, project: projectById(data,p.project_id)}));
      const rows = data.settlements.filter(s => s.investor_id === investor.id).map(s => ({...s, project: projectById(data,s.project_id), batch: batchById(data,s.batch_id)}));
      return { investor, participations: parts, settlements: rows };
    }
    const u = await currentUser();
    if (!u) return null;
    await client.rpc('claim_my_investor');
    const { data: investor, error: e1 } = await client.from('investors').select('*').eq('user_id', u.id).maybeSingle();
    if (e1) throw e1;
    if (!investor) return { investor: null, participations: [], settlements: [] };
    const { data: parts, error: e2 } = await client.from('participations').select('*, project:projects(*)').eq('investor_id', investor.id).order('created_at', {ascending:false});
    if (e2) throw e2;
    const { data: rows, error: e3 } = await client.from('weekly_settlements').select('*, project:projects(*), batch:settlement_batches(*)').eq('investor_id', investor.id).order('created_at', {ascending:false});
    if (e3) throw e3;
    return { investor, participations: parts || [], settlements: rows || [] };
  }

  async function adminSnapshot() {
    if (!LIVE) {
      const d = loadDemo();
      return {
        projects: d.projects,
        investors: d.investors,
        participations: d.participations.map(p => ({...p, project: projectById(d,p.project_id), investor: investorById(d,p.investor_id)})),
        batches: d.batches,
        settlements: d.settlements.map(s => ({...s, project: projectById(d,s.project_id), investor: investorById(d,s.investor_id), batch: batchById(d,s.batch_id)}))
      };
    }
    const queries = await Promise.all([
      client.from('projects').select('*').order('created_at',{ascending:false}),
      client.from('investors').select('*').order('created_at',{ascending:false}),
      client.from('participations').select('*, project:projects(*), investor:investors(*)').order('created_at',{ascending:false}),
      client.from('settlement_batches').select('*').order('week_start',{ascending:false}),
      client.from('weekly_settlements').select('*, project:projects(*), investor:investors(*), batch:settlement_batches(*)').order('created_at',{ascending:false}).limit(500)
    ]);
    for (const q of queries) if (q.error) throw q.error;
    return { projects: queries[0].data||[], investors: queries[1].data||[], participations: queries[2].data||[], batches: queries[3].data||[], settlements: queries[4].data||[] };
  }

  async function createProject(v) {
    if (!LIVE) { const d=loadDemo(); const x={id:uid(),...v,status:v.status||'active'}; d.projects.unshift(x); saveDemo(d); return x; }
    const {data,error}=await client.from('projects').insert(v).select().single(); if(error)throw error; return data;
  }
  async function createInvestor(v) {
    if (!LIVE) { const d=loadDemo(); const x={id:uid(),opening_paid_amount:0,...v}; d.investors.unshift(x); saveDemo(d); return x; }
    const {data,error}=await client.from('investors').insert(v).select().single(); if(error)throw error; return data;
  }
  async function createParticipation(v) {
    if (!LIVE) { const d=loadDemo(); const x={id:uid(),status:'active',...v}; d.participations.unshift(x); saveDemo(d); return x; }
    const {data,error}=await client.from('participations').insert(v).select().single(); if(error)throw error; return data;
  }
  async function updateInvestor(id, v) {
    if (!LIVE) { const d=loadDemo(); const i=d.investors.findIndex(x=>x.id===id); d.investors[i]={...d.investors[i],...v}; saveDemo(d); return d.investors[i]; }
    const {data,error}=await client.from('investors').update(v).eq('id',id).select().single(); if(error)throw error; return data;
  }

  async function allocateWeek({week_start, week_end, project_id, gross_profit, fee_amount=0}) {
    if (!LIVE) {
      const d=loadDemo();
      let batch=d.batches.find(b=>b.week_start===week_start && b.week_end===week_end);
      if(!batch){batch={id:uid(),week_start,week_end,status:'draft'};d.batches.unshift(batch);}
      d.settlements=d.settlements.filter(s=>!(s.batch_id===batch.id && s.project_id===project_id));
      const parts=d.participations.filter(p=>p.project_id===project_id && p.status==='active');
      const total=parts.reduce((a,p)=>a+Number(p.amount||0),0);
      const net=Number(gross_profit||0)-Number(fee_amount||0);
      if(total<=0) throw new Error('此投資案目前沒有可分配的參與金額。');
      const allocations=parts.map(p=>({
        id:uid(), batch_id:batch.id, project_id, investor_id:p.investor_id, participation_id:p.id,
        invested_amount:Number(p.amount), profit_amount:Number((net*Number(p.amount)/total).toFixed(4)), payout_status:'pending', paid_at:null
      }));
      d.settlements.push(...allocations); saveDemo(d);
      return allocations;
    }
    const {data,error}=await client.rpc('allocate_project_week',{p_week_start:week_start,p_week_end:week_end,p_project_id:project_id,p_gross_profit:Number(gross_profit),p_fee_amount:Number(fee_amount)});
    if(error) throw error; return data;
  }

  async function markPaid(settlementId, paid=true) {
    const patch={payout_status:paid?'paid':'pending',paid_at:paid?new Date().toISOString():null};
    if(!LIVE){const d=loadDemo();const s=d.settlements.find(x=>x.id===settlementId);Object.assign(s,patch);saveDemo(d);return s;}
    const {data,error}=await client.from('weekly_settlements').update(patch).eq('id',settlementId).select().single();if(error)throw error;return data;
  }

  const legacyCode = name => 'LEG-' + Array.from(String(name)).map(ch=>ch.codePointAt(0).toString(36)).join('').slice(0,28).toUpperCase();
  async function importLegacy(payload) {
    if (!payload?.projects?.length) return {projects:0, investors:0, participations:0};
    if (!LIVE) {
      const d=loadDemo(); const investorMap=new Map(d.investors.map(x=>[x.code,x]));
      for(const inv of payload.investors){
        const code=legacyCode(inv.display_name); let target=investorMap.get(code);
        if(!target){target={id:uid(),code,display_name:inv.display_name,email:null,opening_paid_amount:Number(inv.opening_paid_amount||0)};d.investors.push(target);investorMap.set(code,target);}
        else if(inv.opening_paid_amount!=null) target.opening_paid_amount=Number(inv.opening_paid_amount||0);
      }
      payload.projects.forEach((p,idx)=>{
        const project={id:uid(),code:`LEGACY-${String(d.projects.length+1).padStart(4,'0')}`,name:p.name,source:p.source||'',case_amount:Number(p.case_amount||0),start_date:p.start_date||null,status:'active',note:p.note||''};
        d.projects.push(project);
        p.allocations.forEach(a=>{const inv=investorMap.get(legacyCode(a.investor)); if(inv)d.participations.push({id:uid(),project_id:project.id,investor_id:inv.id,amount:Number(a.amount),start_date:project.start_date,status:'active'});});
      });
      saveDemo(d); return {projects:payload.projects.length,investors:payload.investors.length,participations:payload.projects.reduce((n,p)=>n+p.allocations.length,0)};
    }
    const {data,error}=await client.rpc('import_legacy_payload',{p_payload:payload}); if(error)throw error; return data;
  }

  function resetDemo(){localStorage.removeItem(STORAGE_KEY); return loadDemo();}
  window.DB={LIVE,client,currentUser,signIn,signUp,signOut,role,myDashboard,adminSnapshot,createProject,createInvestor,createParticipation,updateInvestor,allocateWeek,markPaid,importLegacy,resetDemo};
})();
