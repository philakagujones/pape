/* Pure planning calculations. All aggregates and reservations are in CAD. */
(function (root) {
  "use strict";
  const VERSION = 3;
  const TYPES = [
    "cash",
    "savings",
    "investments",
    "tfsa",
    "fhsa",
    "rrsp",
    "resp",
    "other",
  ];
  const GOALS = ["savings", "reserve", "networth", "income", "purchase"];
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const sum = (xs) => round(xs.reduce((a, b) => a + b, 0));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function defaults() {
    return {
      version: VERSION,
      user: { name: "" },
      accounts: [],
      debts: [],
      goals: [],
      income: [],
      snapshots: [],
      settings: {
        usdRate: 1.35,
        expenses: 0,
        taxRate: 25,
        incomeTarget: 4000,
        taxObligation: 0,
        otherObligations: 0,
        investmentPct: 65,
        businessPct: 22,
        lifestylePct: 13,
        currentAge: 25,
        targetAge: 35,
        monthlyContribution: 0,
        annualReturn: 5,
        annualFISpending: 0,
        withdrawalRate: 4,
      },
      milestones: [
        ["Foundation", 10000],
        ["Momentum", 50000],
        ["Six figures", 100000],
        ["Capital builder", 150000],
        ["Quarter millionaire", 250000],
        ["Half millionaire", 500000],
        ["Millionaire", 1000000],
        ["Generational wealth", 10000000],
      ].map(([name, target], i) => ({ id: "milestone-" + i, name, target })),
      migrationNotice: false,
    };
  }
  const assert = (test, message) => {
    if (!test) throw new Error(message);
  };
  function number(n, label, min = 0, max = 1e12) {
    assert(
      typeof n === "number" && Number.isFinite(n) && n >= min && n <= max,
      "Invalid " + label + ".",
    );
  }
  function string(s, label, allowEmpty = false) {
    assert(
      typeof s === "string" &&
        s.length <= 500 &&
        (allowEmpty || s.trim().length > 0),
      "Invalid " + label + ".",
    );
  }
  function list(xs, label) {
    assert(Array.isArray(xs) && xs.length <= 10000, "Invalid " + label + ".");
    const ids = new Set();
    xs.forEach((x) => {
      assert(x && typeof x === "object", "Invalid " + label + ".");
      string(x.id, label + " ID");
      assert(!ids.has(x.id), "Duplicate " + label + " ID.");
      ids.add(x.id);
    });
  }
  function validate(s) {
    assert(
      s && s.version === VERSION,
      "This file is not a supported Pape backup.",
    );
    string(s.user?.name, "profile name", true);
    for (const key of [
      "accounts",
      "debts",
      "goals",
      "income",
      "snapshots",
      "milestones",
    ])
      list(s[key], key);
    const cfg = defaults().settings;
    assert(
      s.settings && typeof s.settings === "object",
      "Missing planning settings.",
    );
    for (const key of Object.keys(cfg)) number(s.settings[key], key);
    number(s.settings.usdRate, "USD exchange rate", 0.01, 100);
    for (const key of [
      "taxRate",
      "investmentPct",
      "businessPct",
      "lifestylePct",
    ])
      number(s.settings[key], key, 0, 100);
    assert(
      Math.abs(
        s.settings.investmentPct +
          s.settings.businessPct +
          s.settings.lifestylePct -
          100,
      ) < 0.001,
      "Allocation percentages must total 100%.",
    );
    number(s.settings.currentAge, "current age", 1, 100);
    number(s.settings.targetAge, "target age", s.settings.currentAge + 1, 110);
    number(s.settings.annualReturn, "annual return", 0, 30);
    number(s.settings.withdrawalRate, "withdrawal rate", 0.1, 20);
    const money = (x) => {
      string(x.name, "name");
      number(x.balance, "balance");
      assert(["CAD", "USD"].includes(x.currency), "Unsupported currency.");
    };
    s.accounts.forEach((a) => {
      money(a);
      assert(TYPES.includes(a.type), "Invalid account type.");
      assert(
        typeof a.liquid === "boolean" && typeof a.protected === "boolean",
        "Invalid account protection.",
      );
      assert(
        typeof a.invested === "boolean",
        "Invalid investment designation.",
      );
      if (a.registered) {
        const r = a.registered;
        number(r.year, "contribution year", 2000, 2200);
        for (const k of ["openingRoom", "contributed", "annualTarget"]) {
          if (r[k] !== null) number(r[k], k);
        }
      }
    });
    s.debts.forEach((d) => {
      money(d);
      number(d.interestRate, "debt interest", 0, 100);
    });
    s.goals.forEach((g) => {
      string(g.name, "goal name");
      assert(GOALS.includes(g.type), "Invalid goal type.");
      number(g.target, "goal target", 0.01);
      number(g.priority, "goal priority");
      assert(
        Array.isArray(g.accountIds) &&
          g.accountIds.every(
            (id) =>
              typeof id === "string" && s.accounts.some((a) => a.id === id),
          ),
        "A goal references an unknown account.",
      );
      assert(
        new Set(g.accountIds).size === g.accountIds.length,
        "A goal cannot list the same funding account twice.",
      );
      number(g.requiredNetWorth, "required net worth");
      number(g.requiredIncome, "required income");
      number(g.maxPricePct, "purchase percentage", 0.01, 100);
      assert(
        typeof g.requireReserve === "boolean",
        "Invalid reserve requirement.",
      );
      if (g.legacySaved !== undefined)
        number(g.legacySaved, "previously saved amount");
      assert(
        g.deadline === "" || /^\d{4}-\d{2}-\d{2}$/.test(g.deadline),
        "Invalid goal deadline.",
      );
    });
    const incomeKeys = new Set();
    s.income.forEach((i) => {
      string(i.name, "income source");
      assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(i.month), "Invalid income month.");
      number(i.projected, "projected income");
      if (i.actual !== null) number(i.actual, "actual income");
      const key = i.month + ":" + i.name.trim().toLowerCase();
      assert(!incomeKeys.has(key), "Duplicate income source in a month.");
      incomeKeys.add(key);
    });
    const snapshotMonths = new Set();
    s.snapshots.forEach((snap) => {
      assert(
        /^\d{4}-(0[1-9]|1[0-2])$/.test(snap.month),
        "Invalid snapshot month.",
      );
      assert(!snapshotMonths.has(snap.month), "Duplicate snapshot month.");
      snapshotMonths.add(snap.month);
      for (const k of ["assets", "debt", "liquid", "invested"])
        number(snap[k], "snapshot " + k);
      number(snap.netWorth, "snapshot net worth", -1e12);
      string(snap.note, "snapshot note", true);
    });
    s.milestones.forEach((m) => {
      string(m.name, "milestone name");
      number(m.target, "milestone target", 0.01);
    });
    return clone(s);
  }
  function migrate(old) {
    if (old?.version === VERSION) return validate(old);
    assert(
      old &&
        old.accounts &&
        !Array.isArray(old.accounts) &&
        Array.isArray(old.goals) &&
        Array.isArray(old.debts),
      "Unrecognized legacy backup.",
    );
    const s = defaults();
    s.user.name = typeof old.user?.name === "string" ? old.user.name : "";
    s.migrationNotice = true;
    const eligible = [];
    const add = (id, name, amount, type) => {
      number(amount ?? 0, "legacy balance");
      const liquid = ["cash", "savings"].includes(type);
      s.accounts.push({
        id,
        name,
        balance: amount ?? 0,
        currency: "CAD",
        type,
        liquid,
        protected: !liquid,
        invested: ["tfsa", "fhsa", "investments", "rrsp"].includes(type),
      });
      if (liquid) eligible.push(id);
    };
    for (const type of ["tfsa", "fhsa", "investments", "savings", "cash"])
      add(
        "legacy-" + type,
        type.length === 4
          ? type.toUpperCase()
          : type[0].toUpperCase() + type.slice(1),
        old.accounts[type],
        type,
      );
    (old.accounts.custom || []).forEach((a, i) =>
      add("legacy-custom-" + i, a.name, a.amount, "other"),
    );
    s.debts = old.debts.map((d, i) => ({
      id: "legacy-debt-" + i,
      name: d.name,
      balance: d.amount,
      currency: "CAD",
      interestRate: 0,
    }));
    s.goals = old.goals.map((g, i) => ({
      id: "legacy-goal-" + i,
      name: g.name,
      type: "savings",
      target: Math.max(0.01, g.target || 0),
      priority: g.priority || i + 1,
      accountIds: [...eligible],
      legacySaved: g.currentAmount || 0,
      requiredNetWorth: 0,
      requiredIncome: 0,
      maxPricePct: 10,
      requireReserve: true,
      deadline: "",
    }));
    return validate(s);
  }
  const cad = (s, a) =>
    round(a.balance * (a.currency === "USD" ? s.settings.usdRate : 1));
  function totals(s) {
    const assets = sum(s.accounts.map((a) => cad(s, a)));
    const debt = sum(s.debts.map((a) => cad(s, a)));
    const liquid = sum(
      s.accounts.filter((a) => a.liquid).map((a) => cad(s, a)),
    );
    const eligible = sum(
      s.accounts.filter((a) => a.liquid && !a.protected).map((a) => cad(s, a)),
    );
    const invested = sum(
      s.accounts.filter((a) => a.invested).map((a) => cad(s, a)),
    );
    return {
      assets,
      debt,
      netWorth: round(assets - debt),
      liquid,
      eligible,
      invested,
      protectedLiquid: round(liquid - eligible),
    };
  }
  const target = (s, g) =>
    g.type === "reserve" ? round(g.target * s.settings.expenses) : g.target;
  function allocate(s) {
    const remaining = Object.fromEntries(
      s.accounts.map((a) => [a.id, a.liquid && !a.protected ? cad(s, a) : 0]),
    );
    function take(amount, ids) {
      let need = amount;
      const sources = [];
      for (const id of ids) {
        const value = round(Math.min(need, remaining[id] || 0));
        if (value > 0) {
          sources.push({ id, amount: value });
          remaining[id] = round(remaining[id] - value);
          need = round(need - value);
        }
      }
      return { amount: round(amount - need), sources };
    }
    const obligationTarget = round(
      s.settings.taxObligation + s.settings.otherObligations,
    );
    const obligations = take(
      obligationTarget,
      s.accounts.map((a) => a.id),
    );
    const goals = [...s.goals]
      .sort((a, b) => a.priority - b.priority)
      .map((g) => {
        const wanted = target(s, g);
        const result = ["savings", "reserve"].includes(g.type)
          ? take(wanted, g.accountIds)
          : { amount: 0, sources: [] };
        return {
          ...g,
          reserved: result.amount,
          sources: result.sources,
          monetaryTarget: wanted,
        };
      });
    return {
      goals,
      remaining,
      obligations: obligations.amount,
      obligationTarget,
      obligationShortfall: round(obligationTarget - obligations.amount),
      reserved: sum(goals.map((g) => g.reserved)),
      deployable: sum(Object.values(remaining)),
    };
  }
  function shiftMonth(month, shift) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + shift, 1));
    return d.toISOString().slice(0, 7);
  }
  function incomeMonth(s, month, mode = "actual") {
    const rows = s.income.filter((i) => i.month === month);
    const complete = rows.length > 0 && rows.every((i) => i.actual !== null);
    const gross = sum(
      rows.map((i) => (mode === "actual" ? (i.actual ?? 0) : i.projected)),
    );
    const tax = round((gross * s.settings.taxRate) / 100);
    const net = round(gross - tax);
    const surplus = round(net - s.settings.expenses);
    const available = Math.max(0, surplus);
    const investments = round((available * s.settings.investmentPct) / 100);
    const business = Math.min(
      round(available - investments),
      round((available * s.settings.businessPct) / 100),
    );
    return {
      gross,
      tax,
      net,
      surplus,
      complete,
      investments,
      business,
      lifestyle: round(available - investments - business),
    };
  }
  function consistency(s, month) {
    const months = [-3, -2, -1].map((offset) => shiftMonth(month, offset));
    const values = months.map((m) => incomeMonth(s, m));
    const complete = values.every((v) => v.complete);
    return {
      months,
      complete,
      average: complete ? round(sum(values.map((v) => v.net)) / 3) : null,
      floor: complete ? Math.min(...values.map((v) => v.net)) : null,
    };
  }
  function goalProgress(s, g, allocation, month) {
    const t = totals(s),
      history = consistency(s, month);
    let value = g.reserved,
      goalTarget = g.monetaryTarget;
    if (g.type === "networth") {
      value = t.netWorth;
      goalTarget = g.target;
    }
    if (g.type === "income") {
      value = history.floor ?? 0;
      goalTarget = g.target;
    }
    let checks = [];
    if (g.type === "purchase") {
      value = sum(g.accountIds.map((id) => allocation.remaining[id] || 0));
      goalTarget = g.target;
      const reserves = allocation.goals.filter((x) => x.type === "reserve");
      checks = [
        {
          label: "Net worth of " + g.requiredNetWorth,
          pass: t.netWorth >= g.requiredNetWorth,
        },
        {
          label:
            "Three-month after-reserve income floor of " + g.requiredIncome,
          pass: history.complete && history.floor >= g.requiredIncome,
        },
        {
          label: "Purchase within " + g.maxPricePct + "% of net worth",
          pass: g.target <= (Math.max(0, t.netWorth) * g.maxPricePct) / 100,
        },
        { label: "Eligible unallocated capital", pass: value >= g.target },
        {
          label: "Outstanding obligations covered",
          pass: allocation.obligationShortfall === 0,
        },
      ];
      if (g.requireReserve)
        checks.push({
          label: "All reserve goals funded",
          pass:
            s.settings.expenses > 0 &&
            reserves.length > 0 &&
            reserves.every((r) => r.reserved >= r.monetaryTarget),
        });
    }
    const ready =
      g.type === "purchase"
        ? checks.every((c) => c.pass)
        : goalTarget > 0 && value >= goalTarget;
    return {
      value,
      target: goalTarget,
      percent:
        goalTarget > 0
          ? Math.max(0, Math.min(100, (value / goalTarget) * 100))
          : 0,
      ready,
      checks,
    };
  }
  function projection(
    start,
    monthly,
    annualReturn,
    years,
    withdrawal = 0,
    delayMonths = 0,
  ) {
    let balance = Math.max(0, start - withdrawal);
    const points = [{ year: 0, value: balance }];
    const r = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
    for (let m = 1; m <= Math.round(years * 12); m++) {
      balance = balance * (1 + r) + (m > delayMonths ? monthly : 0);
      if (m % 12 === 0) points.push({ year: m / 12, value: round(balance) });
    }
    return { value: round(balance), points };
  }
  const api = {
    VERSION,
    TYPES,
    GOALS,
    defaults,
    validate,
    migrate,
    round,
    sum,
    totals,
    cad,
    target,
    allocate,
    shiftMonth,
    incomeMonth,
    consistency,
    goalProgress,
    projection,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
