(() => {
  'use strict';

  const STORAGE_KEY = 'case1-excel-ledger-v1';
  const SYSTEM_COLUMNS = new Set(['狀態','完成日','持續時間','備註']);
  const $ = s => document.querySelector(s);
  const clean = v => String(v ?? '').trim();
  const num = v => {
    const n = Number(String(v ?? '').replace(/,/g,'').trim());
    return Number.isFinite(n) ? n : 0;
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayISO = () => localISO(new Date());

  function readState(){
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return state && Array.isArray(state.headers) && Array.isArray(state.rows) ? state : null;
    } catch (_) { return null; }
  }

  function investorColumns(headers){
    const start = headers.indexOf('參與總額') + 1;
    if (start <= 0) return [];
    const end = headers.findIndex((h,i)=>i >= start && SYSTEM_COLUMNS.has(h));
    return headers.slice(start, end < 0 ? headers.length : end).filter(Boolean);
  }

  function dayNumber(s){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3])) / 86400000;
  }

  function duration(start,end){
    if (!start) return '';
    const d = Math.floor(dayNumber(end || todayISO()) - dayNumber(start));
    return Number.isFinite(d) ? Math.max(0,d) : '';
  }

  function injectStyle(){
    if ($('#quick-project-style')) return;
    const style = document.createElement('style');
    style.id = 'quick-project-style';
    style.textContent = `
      .project-modal{width:min(760px,calc(100vw - 24px));max-height:88vh;overflow:auto;padding:0!important;}
      .project-modal-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e2e8f0;padding:18px 20px 13px;}
      .project-modal-head h3{margin:0 0 4px;font-size:18px;}
      .project-modal-head p{margin:0;color:#64748b;font-size:11px;line-height:1.5;}
      .project-modal-body{padding:16px 20px 4px;display:grid;gap:16px;}
      .project-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;}
      .project-form-grid .wide{grid-column:1/-1;}
      .project-field{display:grid;gap:5px;font-size:11px;font-weight:700;color:#475569;}
      .project-field input,.project-field textarea{width:100%;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;font:inherit;font-size:13px;outline:none;}
      .project-field input{height:39px;padding:0 10px;}
      .project-field input[type=date]{padding:0 7px;}
      .project-field textarea{min-height:70px;padding:9px 10px;resize:vertical;}
      .project-field input:focus,.project-field textarea:focus{border-color:#6b9df5;box-shadow:0 0 0 3px rgba(11,87,208,.08);}
      .project-investor-block{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fbfdff;}
      .project-investor-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;}
      .project-investor-head strong{font-size:12px;}.project-investor-head span{font-size:11px;color:#64748b;}
      .project-investor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:11px;}
      .project-investor-item{display:grid;grid-template-columns:auto minmax(70px,1fr);align-items:center;gap:8px;border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:7px 8px;}
      .project-investor-item b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .project-investor-item input{width:100%;height:31px;border:1px solid #d5dce7;border-radius:7px;padding:0 7px;text-align:right;font:inherit;font-size:12px;outline:none;}
      .project-total-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff;}
      .project-total-row span{font-size:11px;color:#64748b}.project-total-row strong{font-size:18px;color:#0f7b55;}
      .project-modal-actions{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:8px;padding:13px 20px 16px;background:#fff;border-top:1px solid #e2e8f0;}
      .project-empty-investors{padding:18px;text-align:center;color:#64748b;font-size:12px;}
      @media(max-width:680px){.project-form-grid{grid-template-columns:1fr}.project-form-grid .wide{grid-column:auto}.project-investor-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.project-modal-body{padding:13px 14px 4px}.project-modal-head{padding:15px 14px 11px}.project-modal-actions{padding:11px 14px 14px}}
      @media(max-width:430px){.project-investor-grid{grid-template-columns:1fr}.project-investor-item{grid-template-columns:minmax(70px,1fr) 110px}}
    `;
    document.head.appendChild(style);
  }

  function buildButton(){
    if ($('#addProjectBtn')) return;
    const investorBtn = $('#addInvestorBtn');
    if (!investorBtn) return;
    const btn = document.createElement('button');
    btn.id = 'addProjectBtn';
    btn.className = 'mini-btn primary';
    btn.type = 'button';
    btn.textContent = '＋ 新增投資案';
    investorBtn.insertAdjacentElement('afterend',btn);
    btn.addEventListener('click',openDialog);
  }

  function buildDialog(){
    if ($('#projectDialog')) return;
    const wrap = document.createElement('div');
    wrap.id = 'projectDialog';
    wrap.className = 'modal-backdrop';
    wrap.hidden = true;
    wrap.innerHTML = `
      <form id="projectForm" class="mini-modal project-modal">
        <div class="project-modal-head">
          <h3>新增投資案</h3>
          <p>填基本資料，再直接輸入各投資人的投入金額；參與總額會自動加總。</p>
        </div>
        <div class="project-modal-body">
          <div class="project-form-grid">
            <label class="project-field"><span>日期</span><input id="projectStartDate" type="date" required></label>
            <label class="project-field"><span>完成日（可留空）</span><input id="projectCompletedDate" type="date"></label>
            <label class="project-field wide"><span>投資案名稱／同仁</span><input id="projectName" type="text" required placeholder="例如：新案／客戶名稱"></label>
            <label class="project-field"><span>案源</span><input id="projectSource" type="text" placeholder="例如：韓、陳、雋"></label>
            <label class="project-field"><span>案件金額</span><input id="projectCaseAmount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0"></label>
          </div>
          <div class="project-investor-block">
            <div class="project-investor-head"><strong>投資人投入金額</strong><span>只要填有參與的人</span></div>
            <div id="projectInvestorGrid" class="project-investor-grid"></div>
            <div class="project-total-row"><span>參與總額（自動加總）</span><strong id="projectParticipationTotal">0</strong></div>
          </div>
          <label class="project-field"><span>備註</span><textarea id="projectNote" placeholder="選填，例如回款條件、特殊說明"></textarea></label>
        </div>
        <div class="project-modal-actions">
          <button id="cancelProject" class="mini-btn" type="button">取消</button>
          <button class="mini-btn primary" type="submit">建立投資案</button>
        </div>
      </form>`;
    document.body.appendChild(wrap);

    $('#cancelProject').addEventListener('click',closeDialog);
    wrap.addEventListener('click',e=>{ if (e.target === wrap) closeDialog(); });
    $('#projectForm').addEventListener('submit',submitProject);
  }

  function renderInvestors(){
    const state = readState();
    const grid = $('#projectInvestorGrid');
    if (!grid) return;
    const investors = state ? investorColumns(state.headers) : [];
    if (!investors.length) {
      grid.innerHTML = '<div class="project-empty-investors">目前沒有投資人欄位，請先按「＋ 投資人」新增。</div>';
      return;
    }
    grid.innerHTML = investors.map(name=>`<label class="project-investor-item"><b title="${esc(name)}">${esc(name)}</b><input class="project-investor-amount" data-investor="${esc(name)}" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0"></label>`).join('');
    grid.querySelectorAll('.project-investor-amount').forEach(input=>input.addEventListener('input',updateTotal));
    updateTotal();
  }

  function updateTotal(){
    const total = [...document.querySelectorAll('.project-investor-amount')].reduce((sum,input)=>sum+num(input.value),0);
    const el = $('#projectParticipationTotal');
    if (el) el.textContent = new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(total);
    return total;
  }

  function openDialog(){
    const dialog = $('#projectDialog');
    if (!dialog) return;
    $('#projectForm').reset();
    $('#projectStartDate').value = todayISO();
    renderInvestors();
    dialog.hidden = false;
    setTimeout(()=>$('#projectName')?.focus(),30);
  }

  function closeDialog(){
    const dialog = $('#projectDialog');
    if (dialog) dialog.hidden = true;
  }

  function submitProject(e){
    e.preventDefault();
    const state = readState();
    if (!state) return alert('目前工作表資料尚未載入。');

    const start = clean($('#projectStartDate').value);
    const completed = clean($('#projectCompletedDate').value);
    const name = clean($('#projectName').value);
    if (!start || !name) return alert('請填寫日期與投資案名稱。');
    if (completed && completed < start) return alert('完成日不可早於開始日期。');

    const row = Object.fromEntries(state.headers.map(h=>[h,'']));
    row['日期'] = start;
    row['起租案名/同仁'] = name;
    row['案源'] = clean($('#projectSource').value);
    row['案件金額'] = $('#projectCaseAmount').value === '' ? '' : num($('#projectCaseAmount').value);
    row['完成日'] = completed;
    row['狀態'] = completed ? '完成' : '進行中';
    row['持續時間'] = duration(start,completed);
    row['備註'] = clean($('#projectNote').value);

    let total = 0;
    document.querySelectorAll('.project-investor-amount').forEach(input=>{
      const amount = num(input.value);
      const investor = input.dataset.investor;
      if (investor && state.headers.includes(investor)) row[investor] = amount > 0 ? amount : '';
      total += amount;
    });
    row['參與總額'] = total;

    state.rows.push(row);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    closeDialog();
    location.reload();
  }

  function init(){
    injectStyle();
    buildButton();
    buildDialog();
  }

  init();
})();
