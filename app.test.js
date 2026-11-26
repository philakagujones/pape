"use strict";
// Browser-independent integration tests: real application code with a small DOM/storage harness.
// These verify state and rendering contracts, not browser layout or native form validation.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const P = require("./planner");
const source = fs.readFileSync(require.resolve("./app.js"), "utf8");
function app(seed = {}) {
  const saved = new Map(Object.entries(seed)),
    nodes = new Map(),
    events = {},
    downloads = [];
  let quota = false,
    confirmed = true;
  const makeNode = () => ({
    innerHTML: "",
    textContent: "",
    value: "",
    hidden: false,
    open: false,
    disabled: false,
    classList: { add() {}, remove() {} },
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    click() {},
    parentElement: {
      querySelector() {
        return {};
      },
    },
  });
  const getNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, makeNode());
    return nodes.get(id);
  };
  getNode("editor").elements = new Proxy(
    {},
    {
      get(target, key) {
        if (!target[key]) target[key] = makeNode();
        return target[key];
      },
    },
  );
  class FormData {
    constructor(form) {
      this.entries = form.values || {};
    }
    get(key) {
      return this.entries[key] ?? null;
    }
    has(key) {
      return key in this.entries;
    }
    getAll(key) {
      const v = this.entries[key];
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    }
  }
  const context = vm.createContext({
    Planner: P,
    Intl,
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    Math,
    Set,
    Map,
    Error,
    RegExp,
    console,
    structuredClone,
    crypto: webcrypto,
    FormData,
    Blob,
    URL,
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    localStorage: {
      getItem: (k) => saved.get(k) ?? null,
      setItem(k, v) {
        if (quota) throw new Error("Quota exceeded");
        saved.set(k, v);
      },
    },
    location: { hash: "" },
    confirm: () => confirmed,
    prompt: () => "1",
    document: {
      getElementById: getNode,
      addEventListener() {},
      createElement() {
        return makeNode();
      },
    },
    window: {
      addEventListener(name, fn) {
        events[name] = fn;
      },
    },
  });
  vm.runInContext(source, context);
  return {
    saved,
    nodes,
    events,
    run: (code) => vm.runInContext(code, context),
    get state() {
      return JSON.parse(vm.runInContext("JSON.stringify(state)", context));
    },
    form(kind, values, id = "") {
      getNode("editor").elements.type.value = values.type || "savings";
      context.testKind = kind;
      context.testId = id;
      vm.runInContext("openDialog(testKind,testId)", context);
      getNode("editor").values = values;
      vm.runInContext("submitEditor({preventDefault(){}})", context);
    },
    setQuota(v) {
      quota = v;
    },
    setConfirm(v) {
      confirmed = v;
    },
    page: (name) => {
      context.testPage = name;
      return vm.runInContext(
        'page=testPage;render();document.getElementById("page").innerHTML',
        context,
      );
    },
  };
}
test("all five screens and every editor render in an empty workspace", () => {
  const a = app();
  for (const page of ["overview", "capital", "cashflow", "goals", "forecast"])
    assert.ok(a.page(page).length > 500);
  for (const kind of [
    "account",
    "debt",
    "income",
    "rules",
    "obligations",
    "forecast-settings",
    "milestones",
    "review",
    "settings",
  ])
    assert.doesNotThrow(() => a.run(`openDialog('${kind}')`));
  a.nodes.get("editor").elements.type.value = "savings";
  assert.doesNotThrow(() => a.run("openDialog('goal')"));
  assert.equal(a.saved.size, 0);
});
test("account, debt, goal and income edits persist and render together", () => {
  const a = app();
  a.form("account", {
    name: "Test cash",
    balance: "10000",
    currency: "CAD",
    type: "cash",
    liquid: "on",
  });
  assert.equal(a.state.accounts.length, 1);
  const id = a.state.accounts[0].id;
  a.form("debt", {
    name: "Test loan",
    balance: "500",
    currency: "CAD",
    interestRate: "5",
  });
  a.form("goal", {
    name: "Trip",
    target: "2000",
    type: "savings",
    accountIds: [id],
    deadline: "",
  });
  a.form("income", {
    name: "Test income",
    month: "2026-11",
    projected: "6000",
    actual: "5000",
  });
  assert.equal(a.state.goals.length, 1);
  assert.equal(a.state.income[0].actual, 5000);
  assert.equal(P.allocate(a.state).deployable, 8000);
  assert.equal(P.totals(a.state).netWorth, 9500);
  for (const page of ["overview", "capital", "cashflow", "goals", "forecast"])
    assert.doesNotThrow(() => a.page(page));
  const reload = app(Object.fromEntries(a.saved));
  assert.deepEqual(reload.state, a.state);
});
test("user-provided HTML is escaped in cards, forms and profile rendering", () => {
  const a = app();
  a.form("account", {
    name: "<img src=x onerror=alert(1)>",
    balance: "1",
    currency: "CAD",
    type: "cash",
    liquid: "on",
  });
  const html = a.page("capital");
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img src=x"));
  a.run(`openDialog('account', state.accounts[0].id)`);
  assert.ok(a.nodes.get("dialog-body").innerHTML.includes("&lt;img"));
});
test("invalid allocation rules keep state and expose an inline error", () => {
  const a = app();
  a.form("rules", {
    taxRate: "25",
    expenses: "1000",
    incomeTarget: "4000",
    investmentPct: "80",
    businessPct: "40",
    lifestylePct: "10",
  });
  assert.equal(a.state.settings.expenses, 0);
  assert.match(a.nodes.get("form-error").textContent, /100%/);
});
test("quota errors do not silently change in-memory or persisted data", () => {
  const a = app();
  a.setQuota(true);
  a.form("account", {
    name: "Test",
    balance: "100",
    currency: "CAD",
    type: "cash",
    liquid: "on",
  });
  assert.equal(a.state.accounts.length, 0);
  assert.equal(a.saved.size, 0);
  assert.match(a.nodes.get("toast").textContent, /Could not save/);
});
test("startup migrates legacy data while retaining two original recovery copies", () => {
  const raw = JSON.stringify({
    user: { name: "Test" },
    accounts: { cash: 200 },
    goals: [{ name: "Trip", target: 400, currentAmount: 100 }],
    debts: [],
  });
  const a = app({ vault_v2: raw });
  assert.equal(a.saved.get("vault_v2"), raw);
  assert.equal(a.saved.get("pape_legacy_backup"), raw);
  assert.equal(a.state.version, 3);
  assert.equal(P.allocate(a.state).reserved, 200);
});
test("corrupted data remains untouched and blocks writes", () => {
  const a = app({ pape_v3: "{broken" });
  assert.equal(a.run("storageBlocked"), true);
  assert.match(
    a.nodes.get("storage-alert").textContent,
    /not been overwritten/,
  );
  a.form("account", {
    name: "Test",
    balance: "10",
    currency: "CAD",
    type: "cash",
    liquid: "on",
  });
  assert.equal(a.saved.get("pape_v3"), "{broken");
});
test("restore validates first, preserves old workspace, and supports recovery envelopes", async () => {
  const a = app();
  a.form("account", {
    name: "Original",
    balance: "100",
    currency: "CAD",
    type: "cash",
    liquid: "on",
  });
  const old = a.saved.get("pape_v3");
  const next = P.defaults();
  next.user.name = "Restored";
  a.run(
    `globalThis.fixture=${JSON.stringify(JSON.stringify({ state: next }))}`,
  );
  await a.run("restoreFile({size:100,text:async()=>fixture})");
  assert.equal(a.state.user.name, "Restored");
  assert.equal(a.saved.get("pape_before_restore"), old);
  a.run(
    `globalThis.fixture=${JSON.stringify(JSON.stringify({ app: "pape-recovery", copies: { pape_v3: old } }))}`,
  );
  await a.run("restoreFile({size:100,text:async()=>fixture})");
  assert.equal(a.state.accounts[0].name, "Original");
  await a.run('restoreFile({size:100,text:async()=>"{bad"})');
  assert.equal(a.state.accounts[0].name, "Original");
  assert.match(a.nodes.get("toast").textContent, /Restore failed/);
});
test("snapshot replacement and account deletion update only intended records", () => {
  const a = app();
  a.form("account", {
    name: "Cash",
    balance: "100",
    currency: "CAD",
    type: "cash",
    liquid: "on",
  });
  const id = a.state.accounts[0].id;
  a.form("goal", {
    name: "Goal",
    type: "savings",
    target: "50",
    accountIds: [id],
    deadline: "",
  });
  a.form("review", { month: "2026-01", note: "First" });
  assert.equal(a.state.snapshots[0].netWorth, 100);
  a.form("review", { month: "2026-01", note: "Updated" });
  assert.equal(a.state.snapshots.length, 1);
  assert.equal(a.state.snapshots[0].note, "Updated");
  a.run("openDialog('account',state.accounts[0].id);deleteItem()");
  assert.equal(a.state.accounts.length, 0);
  assert.deepEqual(a.state.goals[0].accountIds, []);
  assert.equal(a.state.snapshots[0].netWorth, 100);
});
test("registered totals are shared per type and do not alter account balances", () => {
  const a = app();
  for (let i = 0; i < 2; i++)
    a.form("account", {
      name: "TFSA " + i,
      balance: "5000",
      currency: "CAD",
      type: "tfsa",
      protected: "on",
      invested: "on",
    });
  a.form(
    "registered",
    { openingRoom: "10000", contributed: "3000", annualTarget: "8000" },
    "tfsa",
  );
  assert.deepEqual(
    a.state.accounts[0].registered,
    a.state.accounts[1].registered,
  );
  assert.equal(P.totals(a.state).assets, 10000);
  assert.ok(a.page("capital").includes("$7,000"));
});
test("another tab changing the workspace blocks stale saves", () => {
  const a = app();
  a.events.storage({ key: "pape_v3" });
  assert.equal(a.run("storageBlocked"), true);
  assert.match(a.nodes.get("storage-alert").textContent, /another tab/);
});
