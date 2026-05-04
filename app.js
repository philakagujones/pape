/* ════════════════════════════════════════════════════════════
   VAULT — Financial Tracker
   Application Logic

   GOAL ALLOCATION LOGIC
   ─────────────────────
   pool = max(0, netWorth)            ← only positive net worth counts

   For each goal sorted by priority:
     cur    = goal.currentAmount       ← what the user has actually saved
     needed = max(0, target - cur)     ← gap remaining to fully fund this goal

     if cur >= target:
       status = 'complete'
       allocFromPool = 0              ← already funded, pool unchanged

     elif pool >= needed:
       status = 'covered'
       allocFromPool = needed
       pool -= needed

     elif pool > 0:
       status = 'partial'
       allocFromPool = pool           ← use whatever remains
       pool = 0

     else:
       status = 'not-started'
       allocFromPool = 0

   Displayed "saved" = cur + allocFromPool
   Displayed remaining = max(0, target - displaySaved)
   Progress % = displaySaved / target * 100
════════════════════════════════════════════════════════════ */

'use strict';

/* ════ DEFAULT STATE ════════════════════════════════════════ */
const DEFAULT_STATE = {
  user:     { name: '', avatar: '💎' },
  accounts: { tfsa:0, fhsa:0, investments:0, savings:0, cash:0, custom:[] },
  debts:    [],
  goals:    []
};

let state;

/* ════ PERSISTENCE ══════════════════════════════════════════ */
function loadState() {
  try {
    const raw = localStorage.getItem('vault_v2');
    if (!raw) return clone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    p.accounts        = p.accounts        || {};
    p.accounts.custom = p.accounts.custom || [];
    p.debts           = p.debts           || [];
    p.goals           = p.goals           || [];
    p.user            = p.user            || { name:'', avatar:'💎' };
    return p;
  } catch {
    return clone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem('vault_v2', JSON.stringify(state));
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function uid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ════ COMPUTED VALUES ══════════════════════════════════════ */
function getTotalAssets() {
  const a = state.accounts;
  const base   = (a.tfsa||0)+(a.fhsa||0)+(a.investments||0)+(a.savings||0)+(a.cash||0);
  const custom = (a.custom||[]).reduce((s,c)=>s+(c.amount||0),0);
  return base + custom;
}

function getTotalDebts() {
  return (state.debts||[]).reduce((s,d)=>s+(d.amount||0),0);
}

function getNetWorth() {
  return getTotalAssets() - getTotalDebts();
}

/**
 * Returns goals sorted by priority with allocation computed.
 *
 * Each goal gets:
 *   displaySaved    — how much is "covered" (own savings + allocated from pool)
 *   displayRemaining— how much is still unfunded after allocation
 *   displayPct      — progress % based on displaySaved
 *   allocFromPool   — how much net-worth pool was assigned to this goal
 *   status          — 'complete' | 'covered' | 'partial' | 'not-started'
 */
function getGoalsWithAllocation() {
  const nw   = getNetWorth();
  let pool   = Math.max(0, nw);   // only positive net worth is usable

  const sorted = clone(state.goals||[]).sort((a,b)=>(a.priority||0)-(b.priority||0));

  return sorted.map(g => {
    const cur    = g.currentAmount || 0;
    const tgt    = g.target        || 0;
    const needed = Math.max(0, tgt - cur);   // gap to fully fund

    let allocFromPool = 0;
    let status;

    if (tgt === 0 || cur >= tgt) {
      /* ── Already complete ── pool unchanged */
      status = 'complete';
      allocFromPool = 0;

    } else if (pool >= needed) {
      /* ── Fully covered by pool ── */
      status = 'covered';
      allocFromPool = needed;
      pool -= needed;

    } else if (pool > 0) {
      /* ── Partially covered ── pool exhausted after this goal */
      status = 'partial';
      allocFromPool = pool;
      pool = 0;

    } else {
      /* ── Nothing left in pool ── */
      status = 'not-started';
      allocFromPool = 0;
    }

    const displaySaved     = cur + allocFromPool;
    const displayRemaining = Math.max(0, tgt - displaySaved);
    const displayPct       = tgt > 0 ? Math.min(100, Math.round((displaySaved / tgt) * 100)) : 100;

    return { ...g, needed, status, allocFromPool, displaySaved, displayRemaining, displayPct };
  });
}

/* ════ WEALTH LEVELS ════════════════════════════════════════ */
function getWealthLevel() {
  const nw = getNetWorth();
  const tiers = [
    { level:0, title:'Starting Out',      emoji:'🌱', color:'#94a3b8', bg:'#F1F5F9', min:-Infinity, max:0        },
    { level:1, title:'Building Base',     emoji:'🔨', color:'#60a5fa', bg:'#EFF6FF', min:0,         max:10000    },
    { level:2, title:'Gaining Momentum',  emoji:'🚀', color:'#a78bfa', bg:'#F5F3FF', min:10000,     max:50000    },
    { level:3, title:'Growing Wealth',    emoji:'📈', color:'#34d399', bg:'#ECFDF5', min:50000,     max:150000   },
    { level:4, title:'Wealth Builder',    emoji:'💼', color:'#fbbf24', bg:'#FFFBEB', min:150000,    max:500000   },
    { level:5, title:'Financial Freedom', emoji:'🏔️', color:'#f97316', bg:'#FFF7ED', min:500000,    max:Infinity },
  ];
  const cur  = tiers.find(t => nw >= t.min && nw < t.max) || tiers[0];
  const next = cur.level < 5 ? tiers[cur.level + 1] : null;
  let progress = 0;
  if (next && isFinite(cur.min)) {
    progress = Math.max(0, Math.min(100, ((nw - cur.min) / (next.min - cur.min)) * 100));
  } else if (!next) {
    progress = 100;
  }
  return { ...cur, next, progress };
}

/* ════ FINANCIAL SCORE ══════════════════════════════════════ */
function getFinancialScore() {
  let score = 0;
  const nw     = getNetWorth();
  const assets = getTotalAssets();
  const debts  = getTotalDebts();
  const goals  = state.goals || [];

  // Net worth positivity (0–30)
  if (nw > 0) score += Math.min(30, Math.round((nw / 500000) * 30));

  // Goal completion (0–30)
  if (goals.length > 0) {
    const done = goals.filter(g => (g.currentAmount||0) >= (g.target||0) && (g.target||0) > 0).length;
    score += Math.round((done / goals.length) * 30);
  }

  // Debt-to-asset ratio (0–25)
  if (assets > 0) {
    const r = debts / assets;
    score += r === 0 ? 25 : r < 0.1 ? 22 : r < 0.3 ? 17 : r < 0.5 ? 11 : r < 0.8 ? 5 : 0;
  } else if (debts === 0) {
    score += 15;
  }

  // Goals set (0–15)
  if      (goals.length >= 3) score += 15;
  else if (goals.length >= 1) score += Math.round((goals.length / 3) * 15);

  return Math.min(100, Math.max(0, score));
}

/* ════ FORMATTING ═══════════════════════════════════════════ */
const CAD = new Intl.NumberFormat('en-CA', {
  style:'currency', currency:'CAD', minimumFractionDigits:0, maximumFractionDigits:0
});

function fmt(n, compact=false) {
  if (n == null || isNaN(n)) return '$0';
  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n<0?'-':'')+'$'+(abs/1_000_000).toFixed(1)+'M';
    if (abs >= 10_000)    return (n<0?'-':'')+'$'+(abs/1_000).toFixed(1)+'K';
  }
  return CAD.format(n);
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', {weekday:'long',month:'long',day:'numeric'});
}

/* ════ NAVIGATION ═══════════════════════════════════════════ */
let currentScreen = 'home';

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  // Update both bottom nav tabs AND sidebar tabs
  document.querySelectorAll('.nav-tab, .sidebar-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.screen === screen)
  );
  const se = document.getElementById('screen-' + screen);
  if (se) se.classList.add('active');
  currentScreen = screen;
  window._vaultScreen = screen;
  renderScreen(screen);
}

function renderScreen(s) {
  switch (s) {
    case 'home':     renderHome();     break;
    case 'accounts': renderAccounts(); break;
    case 'goals':    renderGoals();    break;
    case 'settings': renderSettings(); break;
  }
  renderSidebarSummary();
}

/* ════ SIDEBAR SUMMARY ══════════════════════════════════════ */
function renderSidebarSummary() {
  const nw = getNetWorth();
  setText('sidebar-nw',     fmt(nw, true));
  setText('sidebar-avatar', state.user.avatar || '💎');
}

/* ════ RENDER: HOME ═════════════════════════════════════════ */
function renderHome() {
  const nw     = getNetWorth();
  const assets = getTotalAssets();
  const debts  = getTotalDebts();
  const level  = getWealthLevel();
  const score  = getFinancialScore();
  const allGoalsAlloc = getGoalsWithAllocation();
  const goals  = allGoalsAlloc.slice(0, 3);

  // Mobile greeting
  setText('home-greeting-time', getGreeting() + ',');
  setText('home-greeting-name', state.user.name || 'Friend');
  setText('home-avatar',        state.user.avatar || '💎');

  // Desktop greeting
  setText('desktop-greeting', `${getGreeting()}, ${state.user.name || 'Friend'}`);
  setText('desktop-subline',  'Here\'s your financial overview');

  // Net worth card
  setText('home-nw',     fmt(nw));
  setText('home-assets', fmt(assets, true));
  setText('home-debts',  fmt(debts, true));

  // Level
  const badge = document.getElementById('home-level-badge');
  if (badge) { badge.textContent = level.emoji; badge.style.background = level.bg; }
  setText('home-level-num',   'Level ' + level.level);
  setText('home-level-title', level.title);
  setText('home-level-next',  level.next ? 'Next: ' + level.next.title : 'Maximum level reached 🎉');
  setText('home-level-pct',   Math.round(level.progress) + '%');
  const fp = document.getElementById('home-level-fill');
  const lp = document.getElementById('home-level-pct');
  if (fp) { fp.style.width = level.progress + '%'; fp.style.background = level.color; }
  if (lp) lp.style.color = level.color;

  // Score ring  (r=26, circumference=163.36)
  const C   = 2 * Math.PI * 26;
  const off = C - (score / 100) * C;
  const ring = document.getElementById('home-score-ring');
  if (ring) {
    ring.setAttribute('stroke-dasharray',  C);
    ring.setAttribute('stroke-dashoffset', off);
    ring.setAttribute('stroke', score >= 70 ? '#34d399' : score >= 40 ? '#a78bfa' : '#f59e0b');
  }
  setText('home-score-num', score);
  setText('home-score-desc',
    score >= 80 ? 'Excellent financial health! Keep it up.' :
    score >= 60 ? 'Good progress — reduce debt to level up.' :
    score >= 40 ? 'Building momentum. Set more goals!' :
                  'Add accounts and goals to improve your score.'
  );

  // % of Life Funded
  const totalAllocated = allGoalsAlloc.reduce((s, g) => s + g.displaySaved, 0);
  const totalTarget    = allGoalsAlloc.reduce((s, g) => s + (g.target || 0), 0);
  const lifeFundedPct  = totalTarget > 0 ? Math.round((totalAllocated / totalTarget) * 100) : 0;
  setText('home-life-funded-pct', lifeFundedPct + '%');
  const lfFill = document.getElementById('home-life-funded-fill');
  if (lfFill) lfFill.style.width = Math.min(100, lifeFundedPct) + '%';
  setText('home-life-funded-sub', `${fmt(totalAllocated, true)} of ${fmt(totalTarget, true)} funded`);

  // Top goals (uses allocation-aware display)
  const gc = document.getElementById('home-goals');
  if (!gc) return;
  gc.innerHTML = goals.length === 0
    ? `<div class="empty"><div class="empty-icon">🎯</div>
         <div class="empty-title">No goals yet</div>
         <div class="empty-desc">Head to Goals to add your first target.</div>
       </div>`
    : goals.map(g => goalCardHTML(g, false)).join('');
}

/* ════ RENDER: ACCOUNTS ═════════════════════════════════════ */
const ACC_META = {
  tfsa:        { label:'TFSA',        desc:'Tax-Free Savings Account',   icon:'🏦', bg:'#EFF6FF' },
  fhsa:        { label:'FHSA',        desc:'First Home Savings Account', icon:'🏠', bg:'#ECFDF5' },
  investments: { label:'Investments', desc:'Stocks, ETFs, Crypto',       icon:'📈', bg:'#F5F3FF' },
  savings:     { label:'Savings',     desc:'High-interest savings',      icon:'💰', bg:'#FFFBEB' },
  cash:        { label:'Cash',        desc:'Chequing & cash on hand',    icon:'💵', bg:'#FFF7ED' },
};

function renderAccounts() {
  const a      = state.accounts;
  const assets = getTotalAssets();
  const debts  = getTotalDebts();
  const nw     = getNetWorth();

  setText('acc-total-val',  fmt(assets));
  setText('debt-total-val2',fmt(debts));
  setText('acc-nw-val',     fmt(nw));

  // Standard accounts
  const sl = document.getElementById('standard-list');
  if (sl) {
    sl.innerHTML = Object.entries(ACC_META).map(([key, m]) => `
      <div class="acc-row" onclick="openEditAccount('${key}')">
        <div class="acc-icon" style="background:${m.bg}">${m.icon}</div>
        <div class="acc-info">
          <div class="acc-name">${m.label}</div>
          <div class="acc-desc">${m.desc}</div>
        </div>
        <div class="acc-amount">${fmt(a[key]||0, true)}</div>
        <div class="acc-arrow">›</div>
      </div>`).join('');
  }

  // Custom accounts
  const custom = a.custom || [];
  const cs = document.getElementById('custom-section');
  const cl = document.getElementById('custom-list');
  const ca = document.getElementById('custom-add-row');
  if (cs && cl) {
    if (custom.length > 0) {
      cs.classList.remove('hidden');
      if (ca) ca.style.display = 'none';
      cl.innerHTML = custom.map(c => `
        <div class="acc-row" onclick="openEditCustom('${c.id}')">
          <div class="acc-icon" style="background:#F8F7F5">🗂️</div>
          <div class="acc-info">
            <div class="acc-name">${c.name}</div>
            <div class="acc-desc">Custom account</div>
          </div>
          <div class="acc-amount">${fmt(c.amount||0, true)}</div>
          <div class="acc-arrow">›</div>
        </div>`).join('');
    } else {
      cs.classList.add('hidden');
      if (ca) ca.style.display = '';
    }
  }

  // Debts
  const dl = document.getElementById('debt-list');
  if (dl) {
    dl.innerHTML = state.debts.length === 0
      ? `<div class="empty" style="padding:20px"><div class="empty-icon">✅</div>
           <div class="empty-title">No debts!</div>
         </div>`
      : state.debts.map(d => `
        <div class="acc-row" onclick="openEditDebt('${d.id}')">
          <div class="acc-icon" style="background:#FEF2F2">💳</div>
          <div class="acc-info">
            <div class="acc-name">${d.name}</div>
            <div class="acc-desc">Liability</div>
          </div>
          <div class="acc-amount debt">−${fmt(d.amount||0, true)}</div>
          <div class="acc-arrow">›</div>
        </div>`).join('');
  }
}

/* ════ RENDER: GOALS ════════════════════════════════════════ */
const GOAL_CATS = ['Emergency Fund','Investments','Purchase','Travel','Education','Retirement','Other'];

function renderGoals() {
  const goals = getGoalsWithAllocation();
  const nw    = getNetWorth();
  setText('goals-nw-val', fmt(nw, true));

  const gc = document.getElementById('goals-list');
  if (!gc) return;

  if (goals.length === 0) {
    gc.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">🎯</div>
      <div class="empty-title">No goals yet</div>
      <div class="empty-desc">Tap + to add your first financial goal.</div>
    </div>`;
    renderAllocationBar([]);
    return;
  }

  gc.innerHTML = goals.map((g, i) => goalCardHTML(g, true, i, goals.length)).join('');
  renderAllocationBar(goals);
}

function renderAllocationBar(goals) {
  const bar    = document.getElementById('alloc-bar');
  const legend = document.getElementById('alloc-legend');
  if (!bar || !legend) return;

  if (goals.length === 0) {
    bar.innerHTML    = `<div class="alloc-seg" style="width:100%;background:#e2e8f0"></div>`;
    legend.innerHTML = `<div class="alloc-item text-muted">Add goals to see allocation</div>`;
    return;
  }

  const colors = {
    complete:    '#34d399',
    covered:     '#a78bfa',
    partial:     '#f59e0b',
    'not-started':'#e2e8f0'
  };
  const totalTarget = goals.reduce((s,g)=>s+(g.target||0),0) || 1;

  bar.innerHTML = goals.map(g => {
    const pct = Math.max(1, Math.round(((g.target||0)/totalTarget)*100));
    return `<div class="alloc-seg" style="width:${pct}%;background:${colors[g.status]||'#e2e8f0'}" title="${g.name}: ${g.status}"></div>`;
  }).join('');

  const labels = { complete:'✅ Complete', covered:'💜 Covered', partial:'🔶 Partial', 'not-started':'⭕ Not funded' };
  legend.innerHTML = goals.map(g => `
    <div class="alloc-item">
      <div class="alloc-dot" style="background:${colors[g.status]}"></div>
      <span>${g.name} · ${labels[g.status]||''}</span>
    </div>`).join('');
}

/* ════ GOAL CARD HTML ═══════════════════════════════════════ */
function goalCardHTML(g, showControls=false, idx=0, total=1) {
  /*
   * IMPORTANT: Use allocation-computed display values, NOT raw g.currentAmount.
   * g.displaySaved, g.displayRemaining, g.displayPct come from getGoalsWithAllocation().
   * Falls back gracefully if called from home (no allocation context).
   */
  const displaySaved      = g.displaySaved      ?? (g.currentAmount||0);
  const displayRemaining  = g.displayRemaining  ?? Math.max(0,(g.target||0)-(g.currentAmount||0));
  const displayPct        = g.displayPct        ?? (g.target>0 ? Math.min(100,Math.round(((g.currentAmount||0)/(g.target||0))*100)) : 0);

  const badgeMap = {
    complete:     { cls:'badge-complete', label:'✅ Complete'   },
    covered:      { cls:'badge-covered',  label:'💜 Covered'    },
    partial:      { cls:'badge-partial',  label:'🔶 Partial'    },
    'not-started':{ cls:'badge-pending',  label:'⭕ Not funded' },
  };
  const badge = badgeMap[g.status] || badgeMap['not-started'];

  const fillCls = {
    complete:     'prog-success',
    covered:      '',
    partial:      'prog-warn',
    'not-started':'prog-neutral',
  }[g.status] || '';

  const arrows = showControls ? `
    <div class="pri-arrows">
      <button class="pri-btn" onclick="event.stopPropagation();movePriority('${g.id}',-1)" ${idx===0?'disabled':''} title="Move up">▲</button>
      <button class="pri-btn" onclick="event.stopPropagation();movePriority('${g.id}',1)"  ${idx===total-1?'disabled':''} title="Move down">▼</button>
    </div>` : '';

  const rankBadge = showControls ? `<div class="goal-rank">${g.priority||idx+1}</div>` : '';

  const remainTxt = displayRemaining === 0
    ? 'Fully funded 🎉'
    : `${fmt(displayRemaining, true)} remaining`;

  const onclick = showControls ? `onclick="openEditGoal('${g.id}')"` : '';

  return `
    <div class="goal-card" ${onclick}>
      <div class="goal-head">
        ${rankBadge}
        <div class="goal-meta">
          <div class="goal-name">${g.name}</div>
          <div class="goal-cat">${g.category||''}</div>
        </div>
        <span class="badge ${badge.cls}">${badge.label}</span>
        ${arrows}
      </div>
      <div class="goal-amounts">
        <span class="goal-current">${fmt(displaySaved, true)}</span>
        <span class="goal-of-target">of ${fmt(g.target||0, true)}</span>
      </div>
      <div class="prog-track">
        <div class="prog-fill ${fillCls}" style="width:${displayPct}%"></div>
      </div>
      <div class="goal-footer">
        <span class="goal-pct">${displayPct}% saved</span>
        <span class="goal-remain">${remainTxt}</span>
      </div>
    </div>`;
}

/* ════ RENDER: SETTINGS ═════════════════════════════════════ */
function renderSettings() {
  val('settings-name', state.user.name || '');
  document.querySelectorAll('.avatar-opt').forEach(opt =>
    opt.classList.toggle('selected', opt.dataset.emoji === (state.user.avatar||'💎'))
  );
}

/* ════ MODAL SYSTEM ═════════════════════════════════════════ */
let _editId  = null;
let _editKey = null;

function showModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const m = document.getElementById(id);
  if (m) m.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  _editId = null; _editKey = null;
}

/* ── Account modals ── */
function openEditAccount(key) {
  _editKey = key; _editId = null;
  const meta = ACC_META[key];
  setText('acc-modal-title', 'Edit ' + meta.label);
  setText('acc-modal-label', meta.label + ' balance');
  val('acc-modal-amount', state.accounts[key] || 0);
  hide('acc-modal-del');
  showModal('modal-account');
  setTimeout(() => document.getElementById('acc-modal-amount').select(), 80);
}

function openEditCustom(id) {
  const acc = (state.accounts.custom||[]).find(c=>c.id===id);
  if (!acc) return;
  _editId = id; _editKey = null;
  setText('acc-modal-title', 'Edit ' + acc.name);
  setText('acc-modal-label', acc.name + ' balance');
  val('acc-modal-amount', acc.amount||0);
  show('acc-modal-del');
  showModal('modal-account');
  setTimeout(() => document.getElementById('acc-modal-amount').select(), 80);
}

function openAddCustom() {
  _editId = null; _editKey = null;
  val('custom-name', ''); val('custom-amount', '');
  showModal('modal-custom');
}

function saveAccountEdit() {
  const amount = parseFloat(document.getElementById('acc-modal-amount').value)||0;
  if (_editKey) {
    state.accounts[_editKey] = amount;
  } else if (_editId) {
    const acc = state.accounts.custom.find(c=>c.id===_editId);
    if (acc) acc.amount = amount;
  }
  saveState(); closeModal(); renderAccounts();
  if (currentScreen === 'home') renderHome();
  renderSidebarSummary();
}

function deleteCustomAccount() {
  if (!_editId) return;
  state.accounts.custom = state.accounts.custom.filter(c=>c.id!==_editId);
  saveState(); closeModal(); renderAccounts();
  renderSidebarSummary();
}

function saveCustomAccount() {
  const name   = document.getElementById('custom-name').value.trim();
  const amount = parseFloat(document.getElementById('custom-amount').value)||0;
  if (!name) { flash('custom-name'); return; }
  state.accounts.custom.push({ id:uid(), name, amount });
  saveState(); closeModal(); renderAccounts();
  renderSidebarSummary();
}

/* ── Debt modals ── */
function openAddDebt() {
  _editId = null;
  setText('debt-modal-title','Add Debt');
  val('debt-name',''); val('debt-amount','');
  hide('debt-modal-del');
  showModal('modal-debt');
}

function openEditDebt(id) {
  const d = state.debts.find(d=>d.id===id);
  if (!d) return;
  _editId = id;
  setText('debt-modal-title','Edit Debt');
  val('debt-name', d.name); val('debt-amount', d.amount);
  show('debt-modal-del');
  showModal('modal-debt');
}

function saveDebt() {
  const name   = document.getElementById('debt-name').value.trim();
  const amount = parseFloat(document.getElementById('debt-amount').value)||0;
  if (!name) { flash('debt-name'); return; }
  if (_editId) {
    const d = state.debts.find(d=>d.id===_editId);
    if (d) { d.name=name; d.amount=amount; }
  } else {
    state.debts.push({ id:uid(), name, amount });
  }
  saveState(); closeModal(); renderAccounts();
  if (currentScreen==='home') renderHome();
  renderSidebarSummary();
}

function deleteDebt() {
  if (!_editId) return;
  state.debts = state.debts.filter(d=>d.id!==_editId);
  saveState(); closeModal(); renderAccounts();
  renderSidebarSummary();
}

/* ── Goal modals ── */
function openAddGoal() {
  _editId = null;
  setText('goal-modal-title','Add Goal');
  val('goal-name',''); val('goal-target',''); val('goal-current','');
  setSelect('goal-category', GOAL_CATS[0]);
  hide('goal-modal-del');
  showModal('modal-goal');
  setTimeout(()=>document.getElementById('goal-name').focus(), 80);
}

function openEditGoal(id) {
  const g = state.goals.find(g=>g.id===id);
  if (!g) return;
  _editId = id;
  setText('goal-modal-title','Edit Goal');
  val('goal-name',    g.name);
  val('goal-target',  g.target);
  val('goal-current', g.currentAmount||0);
  setSelect('goal-category', g.category);
  show('goal-modal-del');
  showModal('modal-goal');
}

function saveGoal() {
  const name    = document.getElementById('goal-name').value.trim();
  const target  = parseFloat(document.getElementById('goal-target').value)||0;
  const current = parseFloat(document.getElementById('goal-current').value)||0;
  const cat     = document.getElementById('goal-category').value;
  if (!name)   { flash('goal-name');   return; }
  if (!target) { flash('goal-target'); return; }

  if (_editId) {
    const g = state.goals.find(g=>g.id===_editId);
    if (g) { g.name=name; g.target=target; g.currentAmount=current; g.category=cat; }
  } else {
    const maxPri = state.goals.length>0 ? Math.max(...state.goals.map(g=>g.priority||0)) : 0;
    state.goals.push({ id:uid(), name, target, currentAmount:current, category:cat, priority:maxPri+1 });
  }
  saveState(); closeModal(); renderGoals();
  if (currentScreen==='home') renderHome();
}

function deleteGoal() {
  if (!_editId) return;
  state.goals = state.goals.filter(g=>g.id!==_editId);
  normalizePriorities();
  saveState(); closeModal(); renderGoals();
  if (currentScreen==='home') renderHome();
}

function movePriority(id, dir) {
  const goals = [...state.goals].sort((a,b)=>(a.priority||0)-(b.priority||0));
  const idx   = goals.findIndex(g=>g.id===id);
  const nIdx  = idx + dir;
  if (nIdx < 0 || nIdx >= goals.length) return;
  const tmp = goals[idx].priority;
  goals[idx].priority  = goals[nIdx].priority;
  goals[nIdx].priority = tmp;
  state.goals = goals;
  saveState(); renderGoals();
  if (currentScreen==='home') renderHome();
}

function normalizePriorities() {
  state.goals
    .sort((a,b)=>(a.priority||0)-(b.priority||0))
    .forEach((g,i)=>g.priority=i+1);
}

/* ════ SETTINGS ═════════════════════════════════════════════ */
function saveSettings() {
  const name = document.getElementById('settings-name').value.trim();
  if (name) state.user.name = name;
  saveState();
  const btn = document.getElementById('settings-save-btn');
  if (btn) { const t=btn.textContent; btn.textContent='✅ Saved!'; setTimeout(()=>btn.textContent=t, 1600); }
  renderSidebarSummary();
  if (currentScreen==='home') renderHome();
}

function selectAvatar(emoji) {
  state.user.avatar = emoji;
  saveState();
  document.querySelectorAll('.avatar-opt').forEach(o=>o.classList.toggle('selected', o.dataset.emoji===emoji));
  setText('home-avatar', emoji);
  renderSidebarSummary();
}

function resetData() {
  if (confirm('⚠️ Erase all data? This cannot be undone.')) {
    localStorage.removeItem('vault_v2');
    location.reload();
  }
}

/* ════ ONBOARDING ════════════════════════════════════════════ */
function completeOnboarding() {
  const name = document.getElementById('ob-name').value.trim();
  if (!name) { flash('ob-name'); return; }
  state.user.name = name;
  saveState();
  document.getElementById('onboarding').classList.remove('active');
  document.getElementById('app-shell').classList.remove('hidden');
  navigate('home');
}

/* ════ DOM HELPERS ══════════════════════════════════════════ */
function setText(id, text) { const el=document.getElementById(id); if(el) el.textContent=text; }
function val(id, v)        { const el=document.getElementById(id); if(el) el.value=v; }
function show(id)          { const el=document.getElementById(id); if(el) el.classList.remove('hidden'); }
function hide(id)          { const el=document.getElementById(id); if(el) el.classList.add('hidden'); }
function setSelect(id, v)  {
  const el=document.getElementById(id); if(!el) return;
  for(const o of el.options) if(o.value===v){el.value=v;return;}
}
function flash(id) {
  const el=document.getElementById(id); if(!el) return;
  el.style.borderColor='var(--danger)'; el.focus();
  setTimeout(()=>el.style.borderColor='',1200);
}

/* ════ INIT ═════════════════════════════════════════════════ */
function init() {
  state = loadState();

  // Bind all nav tabs (bottom nav + sidebar)
  document.querySelectorAll('.nav-tab, .sidebar-tab').forEach(tab =>
    tab.addEventListener('click', ()=> navigate(tab.dataset.screen))
  );

  // Close modal on backdrop click
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target===this) closeModal();
  });

  // Populate goal category select
  const catSel = document.getElementById('goal-category');
  if (catSel) catSel.innerHTML = GOAL_CATS.map(c=>`<option value="${c}">${c}</option>`).join('');

  // Enter key on onboarding name input
  const obInput = document.getElementById('ob-name');
  if (obInput) obInput.addEventListener('keydown', e=>{if(e.key==='Enter') completeOnboarding();});

  // Show app or onboarding
  if (!state.user.name) {
    document.getElementById('onboarding').classList.add('active');
    document.getElementById('app-shell').classList.add('hidden');
  } else {
    document.getElementById('onboarding').classList.remove('active');
    document.getElementById('app-shell').classList.remove('hidden');
    navigate('home');
  }
}

document.addEventListener('DOMContentLoaded', init);
