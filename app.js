"use strict";
const P = Planner;
const KEY = "pape_v3";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
const precise = (n) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(n);
const uid = () => crypto.randomUUID();
const nowMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (m) =>
  new Date(m + "-15T12:00:00").toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
const accountLabel = (t) =>
  ({
    tfsa: "TFSA",
    fhsa: "FHSA",
    rrsp: "RRSP",
    resp: "RESP",
    cash: "Cash & chequing",
    savings: "Savings",
    investments: "Investments",
    other: "Other asset",
  })[t];
const goalLabel = (t) =>
  ({
    savings: "Savings",
    reserve: "Reserve",
    networth: "Net worth",
    income: "Income",
    purchase: "Conditional purchase",
  })[t];
const icons = {
  overview:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  capital:
    '<path d="M3 8h18M5 8v12m5-12v12m4-12v12m5-12v12M3 21h18M3 5l9-3 9 3v3H3z"/>',
  cashflow: '<path d="M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4"/>',
  goals:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  forecast: '<path d="M3 3v18h18M6 16l5-5 4 2 6-8m-5 0h5v5"/>',
};
const icon = (key) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key] || icons.capital}</svg>`;
const pages = [
  ["overview", "Overview"],
  ["capital", "Capital"],
  ["cashflow", "Cash Flow"],
  ["goals", "Goals"],
  ["forecast", "Forecast"],
];
let state = P.defaults(),
  page = "overview",
  selectedMonth = nowMonth(),
  incomeMode = "projected",
  editor = null,
  storageBlocked = false;
let scenario = { withdrawal: 0, monthly: null, delay: 0 };
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.add("hidden"), 4000);
}
function storageAlert(message) {
  $("storage-alert").textContent = message;
  $("storage-alert").classList.remove("hidden");
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = P.validate(JSON.parse(raw));
      return;
    }
    const legacy = localStorage.getItem("vault_v2");
    if (legacy) {
      const migrated = P.migrate(JSON.parse(legacy));
      localStorage.setItem("pape_legacy_backup", legacy);
      localStorage.setItem(KEY, JSON.stringify(migrated));
      state = migrated;
    }
  } catch (e) {
    storageBlocked = true;
    storageAlert(
      "Your saved data could not be loaded. It has not been overwritten. Export the recovery copy in Settings, then restore a valid backup. " +
        e.message,
    );
  }
}
function commit(next) {
  try {
    if (storageBlocked)
      throw new Error(
        "Resolve the saved-data issue in Settings before making changes.",
      );
    const valid = P.validate(next);
    localStorage.setItem(KEY, JSON.stringify(valid));
    state = valid;
    return true;
  } catch (e) {
    toast("Could not save: " + e.message);
    return false;
  }
}
function mutate(fn) {
  const next = structuredClone(state);
  fn(next);
  if (commit(next)) {
    render();
    return true;
  }
  return false;
}
const button = (label, action, id = "", cls = "button secondary") =>
  `<button type="button" class="${cls}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ""}>${label}</button>`;
const progress = (pct, cls = "") =>
  `<div class="progress ${cls}" role="progressbar" aria-label="Progress" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
const empty = (title, detail, action, label) =>
  `<div class="empty"><span class="empty-mark">＋</span><h3>${title}</h3><p>${detail}</p>${action ? button(label, action) : ""}</div>`;
const metric = (label, value, note, cls = "") =>
  `<article class="metric ${cls}"><div class="eyebrow">${label}</div><div class="metric-value">${value}</div><p>${note}</p></article>`;
const sectionHead = (title, sub = "", action = "") =>
  `<div class="section-heading"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${action}</div>`;
function pageHead(kicker, title, subtitle, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow accent">${kicker}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function render() {
  $("navigation").innerHTML = pages
    .map(
      ([key, label]) =>
        `<a class="nav-link ${page === key ? "active" : ""}" href="#${key}" ${page === key ? 'aria-current="page"' : ""}>${icon(key)}<span>${label}</span>${page === key ? '<span class="nav-indicator"></span>' : ""}</a>`,
    )
    .join("");
  $("breadcrumb").textContent =
    "Workspace / " + pages.find((x) => x[0] === page)[1];
  $("profile-name").textContent = state.user.name || "Your workspace";
  $("avatar").textContent = (state.user.name || "P").slice(0, 1).toUpperCase();
  $("page").innerHTML = {
    overview: overviewPage,
    capital: capitalPage,
    cashflow: cashflowPage,
    goals: goalsPage,
    forecast: forecastPage,
  }[page]();
}
function chart(series, labels, forecast = false) {
  const all = series.flatMap((s) => s.values);
  if (!all.length) return "";
  const low = Math.min(0, ...all),
    high = Math.max(1, ...all),
    range = high - low;
  const x = (i) => 12 + (i / Math.max(1, labels.length - 1)) * 676;
  const y = (v) => 174 - ((v - low) / range) * 155;
  return `<div class="chart"><svg viewBox="0 0 700 190" role="img" aria-label="${forecast ? "Illustrative investment projections" : "Recorded net worth history"}"><title>${forecast ? "Illustrative investment projections" : "Recorded net worth history"}</title>${[0, 0.5, 1].map((f) => `<line x1="12" y1="${19 + f * 155}" x2="688" y2="${19 + f * 155}" stroke="var(--line)" stroke-dasharray="3 5"/>`).join("")}${series.map((s) => `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="${s.main ? 3 : 2}" ${s.dashed ? 'stroke-dasharray="5 5"' : ""}/>${s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${s.main ? 3 : 2}" fill="${s.color}"><title>${esc(labels[i])}: ${money(v)}</title></circle>`).join("")}`).join("")}</svg><div class="chart-labels"><span>${esc(labels[0])}</span><span>${money(high)}</span><span>${esc(labels.at(-1))}</span></div></div>`;
}
function overviewPage() {
  const t = P.totals(state),
    a = P.allocate(state),
    history = P.consistency(state, nowMonth());
  const reserve = P.sum(
    a.goals.filter((g) => g.type === "reserve").map((g) => g.reserved),
  );
  const milestones = [...state.milestones].sort((a, b) => a.target - b.target);
  const next = milestones.find((m) => m.target > t.netWorth);
  const achieved = milestones.filter((m) => m.target <= t.netWorth).at(-1);
  const snaps = [...state.snapshots].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  let notice = state.migrationNotice
    ? `<div class="notice"><div><strong>Your previous workspace is preserved.</strong><p>Balances and goals have been migrated. Review account protection and goal funding sources. Old saved amounts remain as reference only; they are not added to your assets.</p></div>${button("Reviewed", "dismiss-migration")}</div>`
    : "";
  let setup = !state.accounts.length
    ? `<div class="setup-strip"><div><span class="eyebrow">START WITH WHAT YOU HAVE</span><h3>A clearer plan starts with your capital.</h3><p>Add an account, set your living costs, then give your money a purpose.</p></div>${button("Add your first account ↗", "account", "", "button primary")}</div>`
    : "";
  const cards = [
    metric(
      "Liquid capital",
      money(t.liquid),
      `${money(a.deployable)} unallocated after reservations`,
    ),
    metric(
      "Reserve runway",
      state.settings.expenses > 0
        ? (reserve / state.settings.expenses).toFixed(1) +
            " <small>months</small>"
        : "—",
      state.settings.expenses > 0
        ? "From funded reserve goals"
        : "Set monthly living expenses",
    ),
    metric(
      "Monthly income floor",
      history.complete ? money(history.floor) : "—",
      history.complete
        ? `Three completed months · target ${money(state.settings.incomeTarget)}`
        : "Add actuals for the previous three months",
    ),
    metric(
      "Long-term investments",
      money(t.invested),
      t.assets > 0
        ? `${((t.invested / t.assets) * 100).toFixed(1)}% of total assets`
        : "Accounts marked as invested",
    ),
  ].join("");
  const priorities = [];
  if (a.obligationShortfall > 0)
    priorities.push({
      name: "Cover outstanding obligations",
      detail: money(a.obligationShortfall) + " still uncovered",
      action: "obligations",
    });
  const underfunded = a.goals.filter(
    (g) =>
      ["reserve", "savings"].includes(g.type) && g.reserved < g.monetaryTarget,
  );
  underfunded
    .slice(0, 2)
    .forEach((g) =>
      priorities.push({
        name: g.name,
        detail: money(g.monetaryTarget - g.reserved) + " to reserve",
        action: "goal",
        id: g.id,
      }),
    );
  if (!history.complete || history.floor < state.settings.incomeTarget)
    priorities.push({
      name: "Build a consistent income floor",
      detail: `${money(state.settings.incomeTarget)}/month after tax reserve`,
      action: "go-cashflow",
    });
  return (
    pageHead(
      monthLabel(nowMonth()),
      "Your money, with direction.",
      `${state.user.name ? esc(state.user.name) + ", here" : "Here"}’s the bigger picture. Make your next move intentional.`,
      button("↓ Backup", "export") +
        button("Monthly review ↗", "review", "", "button primary"),
    ) +
    notice +
    setup +
    `<div class="overview-top"><section class="networth-card"><div class="eyebrow">TOTAL NET WORTH <span class="tag">CAD</span></div><div class="hero-value">${money(t.netWorth)}</div><p class="hero-note">Everything you own, less what you owe.</p><div class="hero-split"><div><span>Total assets</span><strong>${money(t.assets)}</strong></div><div><span>Liabilities</span><strong>${money(t.debt)}</strong></div></div><div class="hero-decoration" aria-hidden="true">↗</div></section><section class="panel history-panel">${sectionHead("The long view", "Your recorded monthly net worth", button("+ Snapshot", "review", "", "text-button"))}${
      snaps.length
        ? chart(
            [
              {
                values: snaps.map((s) => s.netWorth),
                color: "#b16b46",
                main: true,
              },
            ],
            snaps.map((s) => monthLabel(s.month)),
          )
        : `<div class="chart-empty"><span>Every journey starts somewhere.</span><p>Save your first monthly snapshot to begin your history.</p><div class="empty-chart-line"></div></div>`
    }</section></div>
    <div class="metrics-grid">${cards}</div>
    <div class="two-columns"><section class="panel">${sectionHead("Next milestones", "A little perspective on how far you’re going.", button("Customize", "milestones", "", "text-button"))}<div class="level-label"><span class="mini-symbol">↗</span><div><span class="eyebrow">CURRENT CHAPTER</span><h3>${esc(achieved?.name || "Building your foundation")}</h3></div></div>${
      milestones
        .filter((m) => m.target > t.netWorth)
        .slice(0, 3)
        .map(
          (m, i) =>
            `<div class="milestone-row"><div class="row-between"><strong>${esc(m.name)}</strong><span>${money(m.target)}</span></div>${progress(Math.max(0, Math.min(100, (t.netWorth / m.target) * 100)), i ? "subtle" : "")}<div class="row-between muted small"><span>${Math.max(0, (t.netWorth / m.target) * 100).toFixed(1)}% of the way</span><span>${money(Math.max(0, m.target - t.netWorth))} to go</span></div></div>`,
        )
        .join("") ||
      "<p>All your current milestones are reached. Set your next chapter.</p>"
    }<p class="footnote">Milestones are motivation. Financial independence is measured separately in Forecast.</p></section><section class="panel">${sectionHead("Your next moves", "Focus on what moves you forward.")}<div class="priority-list">${priorities.length ? priorities.map((p, i) => `<button class="priority-row" data-action="${p.action}" ${p.id ? `data-id="${esc(p.id)}"` : ""}><span class="priority-number">0${i + 1}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.detail)}</small></span><span>↗</span></button>`).join("") : '<p class="muted">Your current priorities are covered. Set a new goal when you’re ready.</p>'}</div><div class="quote-card"><span class="eyebrow">THE MONTHLY RITUAL</span><h3>15 minutes. A clearer future.</h3><p>Update balances. Review income. Allocate capital. Check your trajectory.</p>${button("Review this month →", "review", "", "text-button")}</div></section></div>`
  );
}
function capitalPage() {
  const t = P.totals(state),
    a = P.allocate(state);
  const eligible = state.accounts.filter((x) => x.liquid && !x.protected);
  const reservedGoals = a.goals.filter((g) =>
    ["savings", "reserve"].includes(g.type),
  );
  const segments = [
    { label: "Protected", value: t.protectedLiquid, color: "#c9cec6" },
    { label: "Obligations", value: a.obligations, color: "#777e70" },
    ...reservedGoals.map((g, i) => ({
      label: g.name,
      value: g.reserved,
      color: ["#b16b46", "#698076", "#bb9b66", "#8b88a3"][i % 4],
    })),
    { label: "Unallocated", value: a.deployable, color: "#d9e3cf" },
  ];
  return (
    pageHead(
      "GIVE EVERY DOLLAR A PURPOSE",
      "Capital, allocated.",
      "Separate what you own from what you can put to work.",
      button("+ Liability", "debt") +
        button("+ Account", "account", "", "button primary"),
    ) +
    `<div class="metrics-grid">${metric("Liquid capital", money(t.liquid), "All accounts marked liquid")}${metric("Protected liquidity", money(t.protectedLiquid), "Excluded from the funding pool")}${metric("Reserved capital", money(a.reserved + a.obligations), "Goals + known obligations")}${metric("Deployable capital", money(a.deployable), "Unallocated eligible cash", "highlight")}</div>
    <section class="panel allocation-panel">${sectionHead("Your capital map", "Reservations are a plan, not transfers or new assets.", button("Edit obligations", "obligations", "", "text-button"))}<div class="allocation-bar">${
      segments
        .filter((x) => x.value > 0)
        .map(
          (x) =>
            `<span style="flex:${x.value};background:${x.color}" title="${esc(x.label)}: ${precise(x.value)}"></span>`,
        )
        .join("") || '<span style="flex:1;background:var(--line)"></span>'
    }</div><div class="legend">${
      segments
        .filter((x) => x.value > 0)
        .map(
          (x) =>
            `<span><i style="background:${x.color}"></i>${esc(x.label)} <strong>${money(x.value)}</strong></span>`,
        )
        .join("") || "<span>Add a liquid account to begin.</span>"
    }</div>${a.obligationShortfall > 0 ? `<p class="inline-warning">${money(a.obligationShortfall)} in obligations remains uncovered.</p>` : ""}<p class="footnote">Known taxes and other obligations reserve first, using eligible accounts in the order below. Goals follow their priority and selected funding sources.</p></section>
    <div class="two-columns wide-left"><section class="panel">${sectionHead("Accounts", `${state.accounts.length} accounts · balances shown in CAD`, button("FX settings", "settings", "", "text-button"))}${state.accounts.length ? `<div class="account-list">${state.accounts.map((ac) => `<button class="account-row" data-action="account" data-id="${esc(ac.id)}"><span class="account-icon">${icon(ac.invested ? "forecast" : "capital")}</span><span class="account-info"><strong>${esc(ac.name)}</strong><small>${accountLabel(ac.type)} · ${ac.currency}${ac.protected ? " · Protected" : ac.liquid ? " · Available" : " · Non-liquid"}</small></span><span class="account-balance"><strong>${precise(P.cad(state, ac))}</strong>${ac.currency === "USD" ? `<small>US ${precise(ac.balance)}</small>` : `<small>${ac.liquid && !ac.protected ? precise(a.remaining[ac.id]) + " free" : "Excluded from allocation"}</small>`}</span><span class="muted">↗</span></button>`).join("")}</div>` : empty("Start with your accounts", "Cash, savings, investments, or other assets.", "account", "Add account")}<div class="section-divider"></div>${sectionHead("Liabilities", `${money(t.debt)} outstanding`)}${state.debts.map((d) => `<button class="account-row" data-action="debt" data-id="${esc(d.id)}"><span class="account-icon debt">−</span><span class="account-info"><strong>${esc(d.name)}</strong><small>${d.interestRate}% annual interest · ${d.currency}</small></span><span class="account-balance"><strong>${precise(P.cad(state, d))}</strong></span><span>↗</span></button>`).join("") || '<p class="muted small">No liabilities recorded.</p>'}</section>
    <section class="panel">${sectionHead("Priority waterfall", "One pool. No double counting.", button("Manage →", "go-goals", "", "text-button"))}${reservedGoals.length ? reservedGoals.map((g, i) => `<div class="waterfall-row"><div class="row-between"><span><span class="rank">${i + 1}</span><strong>${esc(g.name)}</strong></span><strong>${money(g.reserved)}</strong></div>${progress(g.monetaryTarget > 0 ? Math.min(100, (g.reserved / g.monetaryTarget) * 100) : 0)}<p>${g.sources.length ? g.sources.map((x) => esc(state.accounts.find((a) => a.id === x.id)?.name) + ": " + precise(x.amount)).join(" · ") : "No eligible capital reserved"}${g.type === "reserve" && !state.settings.expenses ? " · Set living expenses to calculate target" : ""}</p></div>`).join("") : empty("Give your capital a direction", "Add a savings or reserve goal and select its funding accounts.", "goal", "Create goal")}<div class="allocation-total"><span>Unallocated</span><strong>${precise(a.deployable)}</strong></div><p class="footnote">${eligible.length} accounts eligible. Protected and non-liquid accounts never fund the waterfall.</p></section></div>${registeredSection()}`
  );
}
function registeredSection() {
  const types = ["tfsa", "fhsa", "rrsp", "resp"];
  const rows = types
    .filter((type) => state.accounts.some((a) => a.type === type))
    .map((type) => {
      const accounts = state.accounts.filter((a) => a.type === type),
        data = accounts.find((a) => a.registered)?.registered;
      const year = new Date().getFullYear(),
        current = data?.year === year;
      return `<tr><td><strong>${accountLabel(type)}</strong><small>${accounts.length} account${accounts.length !== 1 ? "s" : ""}</small></td><td>${money(P.sum(accounts.map((a) => P.cad(state, a))))}</td><td>${current && data.contributed !== null ? money(data.contributed) : "Not entered"}</td><td>${current && data.openingRoom !== null && data.contributed !== null ? money(data.openingRoom - data.contributed) : "Not entered"}</td><td>${current && data.annualTarget !== null ? money(data.annualTarget) : "Not entered"}</td><td>${button("Update", "registered", type, "text-button")}</td></tr>`;
    });
  return `<section class="panel">${sectionHead("Registered contributions", `Manual tracking for ${new Date().getFullYear()} · Shared across accounts of the same type`)}${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Account type</th><th>Balance</th><th>Contributed</th><th>Remaining room</th><th>Annual target</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : '<p class="muted">Add a TFSA, FHSA, RRSP, or RESP account to track contributions.</p>'}<p class="footnote">Balances are not contributions. Enter your confirmed opening room and contributions separately; no automatic eligibility, withdrawals, or carry-forward calculations. New years require updated figures.</p></section>`;
}
function cashflowPage() {
  const c = P.incomeMonth(state, selectedMonth, incomeMode),
    h = P.consistency(state, selectedMonth);
  const rows = state.income.filter((i) => i.month === selectedMonth);
  const a = P.allocate(state),
    reserveGap = P.sum(
      a.goals
        .filter((g) => g.type === "reserve")
        .map((g) => Math.max(0, g.monetaryTarget - g.reserved)),
    );
  return (
    pageHead(
      "MONTHLY PLANNING",
      "Make your income intentional.",
      "A simple plan for variable income. No transaction tracking.",
      `<input aria-label="Planning month" type="month" id="planning-month" value="${selectedMonth}">` +
        button("+ Income source", "income", "", "button primary"),
    ) +
    `<div class="two-columns wide-left"><section class="panel">${sectionHead("Income sources", monthLabel(selectedMonth))}<div class="table-scroll"><table><thead><tr><th>Source</th><th>Projected</th><th>Actual</th><th></th></tr></thead><tbody>${rows.map((i) => `<tr><td><strong>${esc(i.name)}</strong><small>Pre-tax · CAD</small></td><td>${money(i.projected)}</td><td>${i.actual === null ? '<span class="muted">Not entered</span>' : money(i.actual)}</td><td>${button("Edit", "income", i.id, "text-button")}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Add your business profit, employment, or other income.</td></tr>'}</tbody></table></div><div class="income-totals row-between"><span>Monthly total</span><strong>${money(c.gross)}</strong></div><div class="section-divider"></div>${sectionHead("Consistency over intensity", "Previous three completed months, after the current tax reserve rate.")}<div class="history-months">${h.months
      .map((m) => {
        const v = P.incomeMonth(state, m);
        return `<button data-action="month" data-id="${m}" class="month-tile"><span>${esc(monthLabel(m))}</span><strong>${v.complete ? money(v.net) : "—"}</strong><small>${v.complete ? "Actual income" : "Enter all actuals"} ↗</small></button>`;
      })
      .join(
        "",
      )}</div><div class="row-between consistency-total"><span>Rolling three-month average</span><strong>${h.complete ? money(h.average) : "Incomplete"}</strong></div><div class="row-between small muted"><span>Monthly floor (lowest month)</span><span>${h.complete ? money(h.floor) : "Three full months needed"}</span></div></section>
    <section class="panel income-plan">${sectionHead("Your monthly plan", "Based on the selected income view.")}<div class="segmented"><button data-action="income-mode" data-id="projected" class="${incomeMode === "projected" ? "selected" : ""}">Projected</button><button data-action="income-mode" data-id="actual" class="${incomeMode === "actual" ? "selected" : ""}">Actual</button></div>${incomeMode === "actual" && !c.complete ? '<p class="inline-warning">Actual income is incomplete. Totals include only amounts entered.</p>' : ""}<div class="plan-hero"><span class="eyebrow">${c.surplus < 0 ? "MONTHLY SHORTFALL" : "AFTER TAX RESERVE & LIVING COSTS"}</span><strong class="${c.surplus < 0 ? "negative" : ""}">${money(c.surplus)}</strong></div><div class="plan-lines">${[
      ["Pre-tax income", c.gross],
      ["Tax reserve · " + state.settings.taxRate + "%", c.tax],
      ["Living expenses", state.settings.expenses],
      ["Investments · " + state.settings.investmentPct + "%", c.investments],
      [
        "Business opportunities · " + state.settings.businessPct + "%",
        c.business,
      ],
      ["Lifestyle · " + state.settings.lifestylePct + "%", c.lifestyle],
    ]
      .map(
        ([l, v]) =>
          `<div class="row-between"><span>${l}</span><strong>${precise(v)}</strong></div>`,
      )
      .join(
        "",
      )}</div>${button("Adjust allocation rules", "rules", "", "button secondary full")}<p class="footnote">${reserveGap > 0 ? money(reserveGap) + " of reserve goals is still unfunded. " : ""}These splits assume reserves and obligations are funded. They do not change balances or reserve cash.</p><div class="annual-card"><span>Annual investment pace</span><strong>${money(c.investments * 12)}</strong><small>If this month repeats for a year.</small></div></section></div><p class="footnote">Income is entered as pre-tax profit, not business revenue. Tax reserve is a configurable planning estimate, not a tax calculation. The current rate is applied consistently to historical income.</p>`
  );
}
function goalCard(g, a, index) {
  const p = P.goalProgress(state, g, a, nowMonth());
  const status =
    g.type === "purchase"
      ? p.ready
        ? "Eligible"
        : "Not yet eligible"
      : p.ready
        ? g.type === "savings" || g.type === "reserve"
          ? "Fully reserved"
          : "Reached"
        : g.type === "income" && !P.consistency(state, nowMonth()).complete
          ? "Needs actuals"
          : "In progress";
  const allocationType = ["savings", "reserve", "purchase"].includes(g.type);
  return `<article class="goal-card panel"><div class="goal-top"><span class="goal-type">${icon(g.type === "income" ? "cashflow" : g.type === "networth" ? "forecast" : "goals")}${goalLabel(g.type)}</span><span class="badge ${p.ready ? "positive" : ""}">${status}</span></div><div class="goal-title-row"><h2>${esc(g.name)}</h2>${button("↗", "goal", g.id, "icon-button")}</div><div class="goal-value">${money(p.value)} <span>/ ${money(p.target)}${g.type === "income" ? " per month" : ""}</span></div>${progress(p.percent)}<div class="row-between small muted"><span>${p.percent.toFixed(0)}% ${g.type === "purchase" ? "capital available" : g.type === "networth" ? "of target" : g.type === "income" ? "of income floor" : "reserved"}</span><span>${g.type === "reserve" ? g.target + " months of expenses" : money(Math.max(0, p.target - p.value)) + " to go"}</span></div>${g.type === "purchase" ? `<ul class="checklist">${p.checks.map((c) => `<li class="${c.pass ? "checked" : ""}"><span>${c.pass ? "✓" : "○"}</span>${esc(c.label)}</li>`).join("")}</ul><p class="footnote">Net worth rule price cap: ${money((Math.max(0, P.totals(state).netWorth) * g.maxPricePct) / 100)}. This goal checks eligibility without reserving money; other purchase goals may use the same free capital.</p>` : ""}${g.type === "reserve" && !state.settings.expenses ? '<p class="inline-warning">Set monthly living expenses to calculate this reserve.</p>' : ""}${g.legacySaved > 0 ? `<p class="legacy-note">Previous saved amount: ${money(g.legacySaved)}. Reference only; reconcile with account balances.</p>` : ""}<div class="goal-bottom"><span>${g.deadline ? "Target " + esc(g.deadline) : allocationType ? g.accountIds.length + " funding sources" : "Measured automatically"}</span><div><button class="icon-button" data-action="priority-up" data-id="${esc(g.id)}" aria-label="Move ${esc(g.name)} up" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-button" data-action="priority-down" data-id="${esc(g.id)}" aria-label="Move ${esc(g.name)} down" ${index === a.goals.length - 1 ? "disabled" : ""}>↓</button></div></div></article>`;
}
function goalsPage() {
  const a = P.allocate(state);
  return (
    pageHead(
      "MAKE ROOM FOR WHAT MATTERS",
      "Goals with a purpose.",
      "Save for something. Build a reserve. Earn the right to your next big move.",
      button("+ New goal", "goal", "", "button primary"),
    ) +
    `<div class="info-strip"><span class="mini-symbol">◎</span><p><strong>Different goals. Different measures.</strong> Savings and reserves allocate capital in priority order. Net worth, income, and purchase goals track readiness.</p></div>` +
    (a.goals.length
      ? `<div class="goals-grid">${a.goals.map((g, i) => goalCard(g, a, i)).join("")}</div>`
      : `<section class="panel">${empty("What are you building toward?", "Start with an emergency reserve, a trip, or your next net worth milestone.", "goal", "Create your first goal")}</section>`)
  );
}
function forecastPage() {
  const s = state.settings,
    t = P.totals(state),
    years = s.targetAge - s.currentAge;
  const base = P.projection(
    t.invested,
    s.monthlyContribution,
    s.annualReturn,
    years,
  );
  const low = P.projection(
    t.invested,
    s.monthlyContribution * 0.5,
    s.annualReturn,
    years,
  );
  const high = P.projection(
    t.invested,
    s.monthlyContribution * 2,
    s.annualReturn,
    years,
  );
  const fi =
    s.annualFISpending > 0 ? s.annualFISpending / (s.withdrawalRate / 100) : 0;
  const sc = P.projection(
    t.invested,
    scenario.monthly ?? s.monthlyContribution,
    s.annualReturn,
    years,
    scenario.withdrawal,
    scenario.delay,
  );
  return (
    pageHead(
      "THE BIGGER PICTURE",
      "Your future, in perspective.",
      "Explore how today’s choices could shape tomorrow.",
      button("Edit assumptions", "forecast-settings", "", "button primary"),
    ) +
    `<div class="forecast-layout"><section class="panel"><div class="forecast-heading"><div><span class="eyebrow">PROJECTED PORTFOLIO AT AGE ${s.targetAge}</span><div class="hero-value">${money(base.value)}</div><p class="muted">Starting with ${money(t.invested)} invested · ${years} years ahead</p></div><span class="badge">Illustrative</span></div>${chart(
      [
        {
          values: low.points.map((p) => p.value),
          color: "#b7bdb0",
          dashed: true,
        },
        {
          values: high.points.map((p) => p.value),
          color: "#7d8e78",
          dashed: true,
        },
        {
          values: base.points.map((p) => p.value),
          color: "#b16b46",
          main: true,
        },
      ],
      base.points.map((p) => "Age " + (s.currentAge + p.year)),
      true,
    )}<div class="scenario-cards">${[
      ["Conservative", low, 0.5],
      ["Base case", base, 1],
      ["Optimistic", high, 2],
    ]
      .map(
        ([label, result, factor]) =>
          `<div class="scenario-card ${factor === 1 ? "base" : ""}"><span>${label}</span><strong>${money(result.value)}</strong><small>${money(s.monthlyContribution * factor)}/month</small></div>`,
      )
      .join(
        "",
      )}</div><p class="footnote">${s.annualReturn}% effective annual return, compounded monthly. Contributions at month-end. Nominal estimates exclude inflation, fees, taxes, and withdrawals; returns are not guaranteed.</p></section><section class="panel"><span class="eyebrow">FINANCIAL INDEPENDENCE</span><h2>Freedom has its own number.</h2><p class="muted">Based on investments, separately from net worth.</p><div class="fi-value">${fi ? money(fi) : "Set your target"}</div>${progress(fi ? Math.min(100, (t.invested / fi) * 100) : 0)}<div class="row-between small"><span>${fi ? ((t.invested / fi) * 100).toFixed(1) + "% invested" : "Enter annual spending"}</span><span>${money(t.invested)} today</span></div><div class="section-divider"></div><div class="plan-lines"><div class="row-between"><span>Annual spending</span><strong>${money(s.annualFISpending)}</strong></div><div class="row-between"><span>Withdrawal assumption</span><strong>${s.withdrawalRate}%</strong></div><div class="row-between"><span>Base projection gap</span><strong>${fi ? money(Math.max(0, fi - base.value)) : "—"}</strong></div></div>${button("Set your FI assumptions", "forecast-settings", "", "text-button")}<p class="footnote">Spending ÷ withdrawal rate is a planning target, not a guarantee of sustainable retirement income.</p></section></div>
    <section class="panel">${sectionHead("What if you changed the plan?", "Model a purchase, an income change, or a pause in investing. Scenario inputs are temporary.")}<div class="what-if"><form id="scenario-form" class="scenario-form">${field("withdrawal", "One-time portfolio withdrawal (CAD)", scenario.withdrawal, "number", 'min="0" step="100" max="' + t.invested + '"')}${field("monthly", "New monthly contribution (CAD)", scenario.monthly ?? s.monthlyContribution, "number", 'min="0" max="100000000" step="50"')}${field("delay", "Pause contributions (months)", scenario.delay, "number", `min="0" max="${years * 12}" step="1"`)}<button class="button secondary" type="submit">Compare scenario →</button></form><div class="scenario-result"><span class="eyebrow">YOUR SCENARIO AT AGE ${s.targetAge}</span><strong>${money(sc.value)}</strong><p class="${sc.value < base.value ? "negative" : "accent"}">${sc.value >= base.value ? "+" : "−"}${money(Math.abs(sc.value - base.value))} versus the base case</p><small>Withdrawal happens today; contributions resume after the pause.</small></div></div></section>`
  );
}
function field(name, label, value = "", type = "text", attrs = "") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs} ${type === "text" ? 'maxlength="100"' : ""}></label>`;
}
function select(name, label, options, value) {
  return `<label class="field"><span>${label}</span><select name="${name}">${options.map(([k, l]) => `<option value="${esc(k)}" ${k === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}
function check(name, label, checked, detail = "") {
  return `<label class="check-field"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}><span><strong>${label}</strong>${detail ? `<small>${detail}</small>` : ""}</span></label>`;
}
function openDialog(kind, id = "") {
  editor = { kind, id };
  let title = "",
    body = "",
    actions = "",
    item = null;
  const s = state.settings,
    cash = state.accounts.filter((a) => a.liquid && !a.protected);
  if (kind === "account" || kind === "debt") {
    item = state[kind === "account" ? "accounts" : "debts"].find(
      (a) => a.id === id,
    );
    const a = item || {
      name: "",
      balance: 0,
      currency: "CAD",
      type: "cash",
      liquid: true,
      protected: false,
      invested: false,
      interestRate: 0,
    };
    title =
      (item ? "Edit " : "Add ") +
      (kind === "account" ? "account" : "liability");
    body =
      field("name", "Name", a.name, "text", 'required autocomplete="off"') +
      `<div class="form-grid">${field("balance", "Current balance", a.balance, "number", 'min="0" max="1000000000000" step="0.01" required')}${select(
        "currency",
        "Currency",
        [
          ["CAD", "CAD · Canadian dollar"],
          ["USD", "USD · US dollar"],
        ],
        a.currency,
      )}</div>`;
    if (kind === "account")
      body +=
        select(
          "type",
          "Account type",
          P.TYPES.map((t) => [t, accountLabel(t)]),
          a.type,
        ) +
        check(
          "liquid",
          "Liquid capital",
          a.liquid,
          "Cash available without selling an asset.",
        ) +
        check(
          "protected",
          "Protected capital",
          a.protected,
          "Exclude this account from every reservation and purchase check.",
        ) +
        check(
          "invested",
          "Include in investment portfolio",
          a.invested,
          "Used for wealth forecasts and financial independence.",
        ) +
        '<p class="footnote">Registered and investment accounts default to protected. Only liquid, unprotected accounts can fund goals.</p>';
    else
      body +=
        field(
          "interestRate",
          "Annual interest rate (%)",
          a.interestRate,
          "number",
          'min="0" max="100" step="0.01" required',
        ) +
        '<p class="footnote">Liabilities reduce net worth. Add near-term payments under obligations to reserve cash for them. Interest is recorded, not automatically accrued.</p>';
  }
  if (kind === "goal") {
    item = state.goals.find((g) => g.id === id);
    const g = item || {
      name: "",
      type: "savings",
      target: 0,
      accountIds: cash.map((a) => a.id),
      requiredNetWorth: 0,
      requiredIncome: 0,
      maxPricePct: 10,
      requireReserve: true,
      deadline: "",
    };
    title = item ? "Edit goal" : "Create a goal";
    body =
      field("name", "Goal name", g.name, "text", "required") +
      select(
        "type",
        "Goal type",
        P.GOALS.map((t) => [t, goalLabel(t)]),
        g.type,
      ) +
      `<div class="form-grid">${field("target", "Target (CAD)", g.target || "", "number", 'min="0.01" max="1000000000000" step="0.01" required')}${field("deadline", "Target date (optional)", g.deadline, "date")}</div><p id="goal-help" class="footnote"></p><fieldset id="funding-fields"><legend>Eligible funding accounts</legend><p class="footnote">Select specific accounts. No selection means no funding. New accounts are not added automatically.</p>${cash.length ? cash.map((a) => `<label class="check-field"><input type="checkbox" name="accountIds" value="${esc(a.id)}" ${g.accountIds.includes(a.id) ? "checked" : ""}><span>${esc(a.name)} <small>${money(P.cad(state, a))} CAD</small></span></label>`).join("") : '<p class="inline-warning">Add a liquid, unprotected account in Capital first.</p>'}</fieldset><div id="purchase-fields"><div class="form-grid">${field("requiredNetWorth", "Required net worth (CAD)", g.requiredNetWorth, "number", 'min="0" step="100" required')}${field("requiredIncome", "Required monthly income floor (CAD)", g.requiredIncome, "number", 'min="0" step="100" required')}</div>${field("maxPricePct", "Maximum price as % of net worth", g.maxPricePct, "number", 'min="0.01" max="100" step="0.01" required')}${check("requireReserve", "Require all reserve goals to be funded", g.requireReserve)}</div>${g.legacySaved > 0 ? `<p class="notice small">Previously saved: ${money(g.legacySaved)}. This reference does not add money to the funding pool.</p>` : ""}`;
  }
  if (kind === "income") {
    item = state.income.find((i) => i.id === id);
    const i = item || {
      name: "",
      month: selectedMonth,
      projected: 0,
      actual: null,
    };
    title = item ? "Edit income source" : "Add income source";
    body =
      field(
        "name",
        "Source name",
        i.name,
        "text",
        'required list="source-suggestions"',
      ) +
      `<datalist id="source-suggestions">${[...new Set(state.income.map((x) => x.name))].map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>` +
      field("month", "Month", i.month, "month", "required") +
      `<div class="form-grid">${field("projected", "Projected pre-tax profit (CAD)", i.projected, "number", 'min="0" max="1000000000000" step="0.01" required')}${field("actual", "Actual pre-tax profit (CAD)", i.actual ?? "", "number", 'min="0" max="1000000000000" step="0.01"')}</div><p class="footnote">Leave actual blank until known. Enter 0 to record a month with no income. Each source can appear once per month.</p>`;
  }
  if (kind === "rules") {
    title = "Monthly allocation rules";
    body = `<div class="form-grid">${field("taxRate", "Tax reserve (%)", s.taxRate, "number", 'min="0" max="100" step="0.1" required')}${field("expenses", "Monthly living expenses (CAD)", s.expenses, "number", 'min="0" step="0.01" required')}</div>${field("incomeTarget", "Monthly income floor target (CAD)", s.incomeTarget, "number", 'min="0" step="100" required')}<h3>Split the remaining surplus</h3><div class="form-grid thirds">${field("investmentPct", "Investments (%)", s.investmentPct, "number", 'min="0" max="100" step="0.1" required')}${field("businessPct", "Business (%)", s.businessPct, "number", 'min="0" max="100" step="0.1" required')}${field("lifestylePct", "Lifestyle (%)", s.lifestylePct, "number", 'min="0" max="100" step="0.1" required')}</div><p class="footnote">These three percentages must total 100%. A deficit produces no allocations. Tax reserve is a planning estimate applied to all income sources.</p>`;
  }
  if (kind === "obligations") {
    title = "Protect your obligations";
    body =
      field(
        "taxObligation",
        "Outstanding tax obligations (CAD)",
        s.taxObligation,
        "number",
        'min="0" step="0.01" required',
      ) +
      field(
        "otherObligations",
        "Other known obligations (CAD)",
        s.otherObligations,
        "number",
        'min="0" step="0.01" required',
      ) +
      '<p class="footnote">Include tuition, upcoming payments, or other committed spending. These amounts reserve eligible cash before goals. Do not also create a goal for the same obligation.</p>';
  }
  if (kind === "registered") {
    const accounts = state.accounts.filter((a) => a.type === id);
    const year = new Date().getFullYear();
    const existing = accounts.find((a) => a.registered)?.registered;
    const r =
      existing?.year === year
        ? existing
        : { openingRoom: null, contributed: null, annualTarget: null };
    title = accountLabel(id) + " contributions · " + year;
    body =
      field(
        "openingRoom",
        "Confirmed room at start of year (CAD)",
        r.openingRoom ?? "",
        "number",
        'min="0" step="0.01"',
      ) +
      field(
        "contributed",
        "Total contributions this year (CAD)",
        r.contributed ?? "",
        "number",
        'min="0" step="0.01"',
      ) +
      field(
        "annualTarget",
        "Annual contribution target (CAD)",
        r.annualTarget ?? "",
        "number",
        'min="0" step="0.01"',
      ) +
      '<p class="footnote">These figures apply across all your ' +
      accountLabel(id) +
      " accounts. Blank means unknown, not zero. Contributions do not update account balances.</p>";
  }
  if (kind === "forecast-settings") {
    title = "Forecast assumptions";
    body = `<div class="form-grid">${field("currentAge", "Current age", s.currentAge, "number", 'min="1" max="100" step="1" required')}${field("targetAge", "Target age", s.targetAge, "number", 'min="2" max="110" step="1" required')}</div><div class="form-grid">${field("monthlyContribution", "Monthly investment (CAD)", s.monthlyContribution, "number", 'min="0" max="100000000" step="50" required')}${field("annualReturn", "Assumed annual return (%)", s.annualReturn, "number", 'min="0" max="30" step="0.1" required')}</div><h3>Financial independence</h3><div class="form-grid">${field("annualFISpending", "Annual spending (CAD)", s.annualFISpending, "number", 'min="0" step="100" required')}${field("withdrawalRate", "Withdrawal rate (%)", s.withdrawalRate, "number", 'min="0.1" max="20" step="0.1" required')}</div><p class="footnote">Assumptions are editable examples, not predictions. The portfolio starts from your accounts marked as invested.</p>`;
  }
  if (kind === "milestones") {
    title = "Your wealth milestones";
    body =
      '<p class="footnote">One milestone per line: name, CAD target. These measure net worth. Blank lines are ignored.</p><label class="field"><span>Milestones</span><textarea name="milestones" rows="10" required>' +
      esc(state.milestones.map((m) => m.name + ", " + m.target).join("\n")) +
      "</textarea></label>";
  }
  if (kind === "review") {
    title = "Your monthly review";
    const existing = state.snapshots.find((s) => s.month === nowMonth());
    body = `<div class="review-steps"><p><strong>01</strong> Update account balances in Capital.</p><p><strong>02</strong> Record this month’s actual income.</p><p><strong>03</strong> Review your goal priorities and funding.</p><p><strong>04</strong> Save a snapshot of where you stand today.</p></div>${field("month", "Snapshot month", nowMonth(), "month", 'required max="' + nowMonth() + '"')}<label class="field"><span>Monthly reflection (optional)</span><textarea name="note" rows="3" maxlength="500" placeholder="What changed? What’s your focus next month?">${esc(existing?.note || "")}</textarea></label><p class="footnote">Saves current balances, not historical estimates. A second snapshot for the same month replaces the first after confirmation.</p>${
      state.snapshots.length
        ? `<details><summary>Previous reviews (${state.snapshots.length})</summary>${[
            ...state.snapshots,
          ]
            .sort((a, b) => b.month.localeCompare(a.month))
            .map(
              (s) =>
                `<div class="review-history"><strong>${esc(monthLabel(s.month))} · ${money(s.netWorth)}</strong><p>${esc(s.note || "No reflection recorded.")}</p>${button("Delete snapshot", "delete-snapshot", s.id, "text-button danger")}</div>`,
            )
            .join("")}</details>`
        : ""
    }`;
  }
  if (kind === "settings") {
    title = "Your workspace";
    body =
      field("name", "Your name (optional)", state.user.name) +
      field(
        "usdRate",
        "USD → CAD exchange rate",
        s.usdRate,
        "number",
        'min="0.01" max="100" step="0.0001" required',
      ) +
      '<p class="footnote">CAD is the planning currency. The default FX rate is a placeholder; set your own rate. FX updates change CAD totals and reservations. No market data is fetched.</p>' +
      `<div class="settings-tools">${button("Living costs & allocation rules", "rules")}${button("Export JSON backup", "export")}${button("Restore JSON backup", "import")}${button("Export recovery copies", "recovery")}</div><p class="footnote">Data lives in this browser on this device. Back up before changing browsers or clearing site data. Restoring replaces the current workspace and first retains a local recovery copy.</p>`;
    if (storageBlocked)
      body +=
        '<p class="inline-warning">Saved data needs recovery. Export recovery copies before restoring.</p>';
  }
  $("dialog-title").textContent = title;
  $("dialog-body").innerHTML = body;
  $("form-error").textContent = "";
  actions =
    (item ? button("Delete", "delete", id, "text-button danger") : "") +
    '<span class="spacer"></span>' +
    button("Cancel", "close") +
    `<button type="submit" class="button primary">${kind === "review" ? "Save snapshot" : "Save changes"}</button>`;
  $("dialog-actions").innerHTML = actions;
  if (kind === "goal") updateGoalFields();
  if (!$("dialog").open) $("dialog").showModal();
}
function updateGoalFields() {
  const form = $("editor"),
    type = form.elements.type.value;
  const targetInput = form.elements.target;
  targetInput.parentElement.querySelector("span").textContent =
    type === "reserve"
      ? "Months of living expenses"
      : type === "income"
        ? "Monthly income floor (CAD)"
        : "Target (CAD)";
  $("funding-fields").hidden = !["savings", "reserve", "purchase"].includes(
    type,
  );
  $("purchase-fields").hidden = type !== "purchase";
  $("purchase-fields")
    .querySelectorAll("input")
    .forEach((i) => (i.disabled = type !== "purchase"));
  $("goal-help").textContent = {
    savings:
      "Reserves eligible cash according to priority. Balances stay unchanged.",
    reserve:
      "Target = months × monthly living expenses. Set living costs in Cash Flow.",
    networth:
      "Tracks total assets minus liabilities. Does not reserve capital.",
    income:
      "Uses the lowest after-tax-reserve income of the previous three complete months.",
    purchase:
      "Checks conditions and free capital without reserving money today.",
  }[type];
}
function closeDialog() {
  $("dialog").close();
  editor = null;
}
function formObject(form) {
  const data = new FormData(form);
  return {
    data,
    text: (k) => String(data.get(k) || "").trim(),
    num: (k) => Number(data.get(k)),
    nullable: (k) => (data.get(k) === "" ? null : Number(data.get(k))),
    checked: (k) => data.has(k),
  };
}
function submitEditor(event) {
  event.preventDefault();
  if (!editor) return;
  const { kind, id } = editor,
    f = formObject($("editor")),
    next = structuredClone(state);
  try {
    if (kind === "account" || kind === "debt") {
      const key = kind === "account" ? "accounts" : "debts",
        old = next[key].find((a) => a.id === id);
      const record = {
        ...old,
        id: id || uid(),
        name: f.text("name"),
        balance: f.num("balance"),
        currency: f.text("currency"),
      };
      if (kind === "account")
        Object.assign(record, {
          type: f.text("type"),
          liquid: f.checked("liquid"),
          protected: f.checked("protected"),
          invested: f.checked("invested"),
        });
      else record.interestRate = f.num("interestRate");
      if (kind === "account" && old?.type !== record.type)
        delete record.registered;
      if (old) next[key][next[key].findIndex((a) => a.id === id)] = record;
      else next[key].push(record);
    }
    if (kind === "goal") {
      const old = next.goals.find((g) => g.id === id),
        type = f.text("type");
      const record = {
        ...old,
        id: id || uid(),
        name: f.text("name"),
        type,
        target: f.num("target"),
        deadline: f.text("deadline"),
        accountIds: ["savings", "reserve", "purchase"].includes(type)
          ? f.data.getAll("accountIds")
          : [],
        priority: old?.priority ?? next.goals.length + 1,
        requiredNetWorth: type === "purchase" ? f.num("requiredNetWorth") : 0,
        requiredIncome: type === "purchase" ? f.num("requiredIncome") : 0,
        maxPricePct: type === "purchase" ? f.num("maxPricePct") : 10,
        requireReserve:
          type === "purchase" ? f.checked("requireReserve") : true,
      };
      if (old) next.goals[next.goals.findIndex((g) => g.id === id)] = record;
      else next.goals.push(record);
    }
    if (kind === "income") {
      const record = {
        id: id || uid(),
        name: f.text("name"),
        month: f.text("month"),
        projected: f.num("projected"),
        actual: f.nullable("actual"),
      };
      if (id) next.income[next.income.findIndex((i) => i.id === id)] = record;
      else next.income.push(record);
    }
    const settingsFields = {
      rules: [
        "taxRate",
        "expenses",
        "incomeTarget",
        "investmentPct",
        "businessPct",
        "lifestylePct",
      ],
      obligations: ["taxObligation", "otherObligations"],
      "forecast-settings": [
        "currentAge",
        "targetAge",
        "monthlyContribution",
        "annualReturn",
        "annualFISpending",
        "withdrawalRate",
      ],
    };
    if (settingsFields[kind])
      for (const k of settingsFields[kind]) next.settings[k] = f.num(k);
    if (kind === "registered") {
      const record = {
        year: new Date().getFullYear(),
        openingRoom: f.nullable("openingRoom"),
        contributed: f.nullable("contributed"),
        annualTarget: f.nullable("annualTarget"),
      };
      next.accounts
        .filter((a) => a.type === id)
        .forEach((a) => (a.registered = record));
    }
    if (kind === "milestones") {
      next.milestones = f
        .text("milestones")
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => {
          const comma = line.lastIndexOf(",");
          if (comma < 1)
            throw new Error(
              "Use a name and numeric target separated by a comma on each line.",
            );
          return {
            id: uid(),
            name: line.slice(0, comma).trim(),
            target: Number(line.slice(comma + 1).trim()),
          };
        });
      if (!next.milestones.length)
        throw new Error("Add at least one milestone.");
    }
    if (kind === "review") {
      const month = f.text("month");
      if (month > nowMonth())
        throw new Error("Choose the current month or an earlier month.");
      if (
        next.snapshots.some((s) => s.month === month) &&
        !confirm(
          "Replace the saved snapshot for " +
            monthLabel(month) +
            " with today’s balances?",
        )
      )
        return;
      next.snapshots = next.snapshots.filter((s) => s.month !== month);
      next.snapshots.push({
        id: uid(),
        month,
        note: f.text("note"),
        ...P.totals(next),
      });
    }
    if (kind === "settings") {
      next.user.name = f.text("name");
      next.settings.usdRate = f.num("usdRate");
    }
    P.validate(next);
    if (commit(next)) {
      if (kind === "income") selectedMonth = f.text("month");
      closeDialog();
      render();
      toast(
        kind === "review"
          ? "Monthly snapshot saved."
          : "Changes saved on this device.",
      );
    }
  } catch (e) {
    $("form-error").textContent = e.message;
  }
}
function download(name, contents) {
  const blob = new Blob([contents], { type: "application/json" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  if (storageBlocked) {
    exportRecovery();
    return;
  }
  download(
    "pape-backup-" + nowMonth() + ".json",
    JSON.stringify(
      { app: "pape", exportedAt: new Date().toISOString(), state },
      null,
      2,
    ),
  );
  toast("Backup downloaded. Keep it somewhere safe.");
}
function exportRecovery() {
  try {
    const recovery = {};
    for (const k of [
      KEY,
      "vault_v2",
      "pape_legacy_backup",
      "pape_before_restore",
    ]) {
      const raw = localStorage.getItem(k);
      if (raw) recovery[k] = raw;
    }
    if (!Object.keys(recovery).length) {
      toast("No recovery copies found.");
      return;
    }
    download(
      "pape-recovery-" + nowMonth() + ".json",
      JSON.stringify({ app: "pape-recovery", copies: recovery }, null, 2),
    );
  } catch (e) {
    toast("Recovery export failed: " + e.message);
  }
}
async function restoreFile(file) {
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Backup is too large (maximum 5 MB).");
    let parsed = JSON.parse(await file.text());
    if (parsed.app === "pape-recovery") {
      const copies = parsed.copies || {};
      const valid = [];
      for (const key of [
        KEY,
        "pape_before_restore",
        "pape_legacy_backup",
        "vault_v2",
      ]) {
        if (copies[key]) {
          try {
            valid.push({ key, state: P.migrate(JSON.parse(copies[key])) });
          } catch {}
        }
      }
      if (!valid.length)
        throw new Error("No valid workspace found in the recovery file.");
      const choice =
        valid.length === 1
          ? "1"
          : prompt(
              "Which recovery copy should be restored?\n" +
                valid
                  .map(
                    (v, i) =>
                      `${i + 1}. ${v.key} (${v.state.accounts.length} accounts)`,
                  )
                  .join("\n"),
              "1",
            );
      if (choice === null) return;
      const found = valid[Number(choice) - 1];
      if (!found) throw new Error("Choose a listed recovery copy.");
      parsed = found.state;
    }
    const imported = P.migrate(parsed.state || parsed);
    if (
      !confirm(
        `Restore this backup (${imported.accounts.length} accounts, ${imported.goals.length} goals)? It will replace the current workspace. A recovery copy will be kept on this device.`,
      )
    )
      return;
    const current = localStorage.getItem(KEY);
    if (current) localStorage.setItem("pape_before_restore", current);
    localStorage.setItem(KEY, JSON.stringify(imported));
    state = imported;
    storageBlocked = false;
    $("storage-alert").classList.add("hidden");
    closeDialog();
    render();
    toast("Backup restored.");
  } catch (e) {
    toast("Restore failed: " + e.message);
  }
}
function deleteItem() {
  if (!editor?.id) return;
  const { kind, id } = editor;
  const key = {
    account: "accounts",
    debt: "debts",
    goal: "goals",
    income: "income",
  }[kind];
  if (!key) return;
  const item = state[key].find((i) => i.id === id);
  if (!item) return;
  if (
    !confirm(
      `Delete “${item.name}”?${kind === "account" ? " Its balance will be removed and goal reservations will recalculate." : ""}`,
    )
  )
    return;
  if (
    mutate((next) => {
      next[key] = next[key].filter((i) => i.id !== id);
      if (kind === "account")
        next.goals.forEach(
          (g) => (g.accountIds = g.accountIds.filter((a) => a !== id)),
        );
    })
  )
    closeDialog();
}
function navigate(key) {
  location.hash = key;
}
function handleAction(event) {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action,
    id = el.dataset.id || "";
  if (
    [
      "account",
      "debt",
      "goal",
      "income",
      "rules",
      "obligations",
      "registered",
      "forecast-settings",
      "milestones",
      "review",
      "settings",
    ].includes(action)
  ) {
    openDialog(action, id);
    return;
  }
  if (action === "close") closeDialog();
  if (action === "delete") deleteItem();
  if (action === "export") exportBackup();
  if (action === "recovery") exportRecovery();
  if (action === "import") $("import-file").click();
  if (action === "dismiss-migration")
    mutate((s) => (s.migrationNotice = false));
  if (action === "go-goals") navigate("goals");
  if (action === "go-cashflow") navigate("cashflow");
  if (action === "income-mode") {
    incomeMode = id;
    render();
  }
  if (action === "month") {
    selectedMonth = id;
    render();
  }
  if (action === "priority-up" || action === "priority-down")
    mutate((s) => {
      s.goals.sort((a, b) => a.priority - b.priority);
      const i = s.goals.findIndex((g) => g.id === id),
        j = i + (action === "priority-up" ? -1 : 1);
      if (i >= 0 && j >= 0 && j < s.goals.length) {
        [s.goals[i], s.goals[j]] = [s.goals[j], s.goals[i]];
        s.goals.forEach((g, n) => (g.priority = n + 1));
      }
    });
  if (
    action === "delete-snapshot" &&
    confirm("Delete this monthly snapshot?")
  ) {
    if (mutate((s) => (s.snapshots = s.snapshots.filter((x) => x.id !== id))))
      openDialog("review");
  }
}
function route() {
  const hash = location.hash.slice(1);
  page = pages.some((p) => p[0] === hash) ? hash : "overview";
  render();
}
document.addEventListener("click", handleAction);
$("editor").addEventListener("submit", submitEditor);
$("editor").addEventListener("change", (event) => {
  if (editor?.kind === "goal" && event.target.name === "type")
    updateGoalFields();
  if (editor?.kind === "account" && event.target.name === "type") {
    const invested = ["tfsa", "fhsa", "rrsp", "resp", "investments"].includes(
        event.target.value,
      ),
      liquid = ["cash", "savings"].includes(event.target.value);
    $("editor").elements.liquid.checked = liquid;
    $("editor").elements.protected.checked = !liquid;
    $("editor").elements.invested.checked = invested;
  }
});
$("dialog").addEventListener("click", (e) => {
  if (e.target === $("dialog")) {
    const r = $("dialog").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
$("dialog").addEventListener("close", () => (editor = null));
$("import-file").addEventListener("change", (e) => {
  if (e.target.files[0]) restoreFile(e.target.files[0]);
  e.target.value = "";
});
document.addEventListener("change", (e) => {
  if (
    e.target.id === "planning-month" &&
    /^\d{4}-\d{2}$/.test(e.target.value)
  ) {
    selectedMonth = e.target.value;
    render();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "scenario-form") return;
  e.preventDefault();
  const f = formObject(e.target);
  scenario = {
    withdrawal: f.num("withdrawal"),
    monthly: f.num("monthly"),
    delay: f.num("delay"),
  };
  render();
});
window.addEventListener("hashchange", route);
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    storageBlocked = true;
    storageAlert(
      "This workspace changed in another tab. Reload this page before editing to avoid overwriting those changes.",
    );
  }
});
load();
route();
