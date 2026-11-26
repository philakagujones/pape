"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("./planner.js");
const account = (id, balance, extra = {}) => ({
  id,
  name: id,
  balance,
  currency: "CAD",
  type: "cash",
  liquid: true,
  protected: false,
  invested: false,
  ...extra,
});
const goal = (id, target, accountIds, extra = {}) => ({
  id,
  name: id,
  target,
  accountIds,
  type: "savings",
  priority: 1,
  requiredNetWorth: 0,
  requiredIncome: 0,
  maxPricePct: 10,
  requireReserve: true,
  deadline: "",
  ...extra,
});
test("net worth is not the funding pool; protected and non-liquid capital are excluded", () => {
  const s = P.defaults();
  s.accounts = [
    account("cash", 100),
    account("tfsa", 50000, { protected: true, invested: true }),
    account("asset", 5000, { liquid: false }),
  ];
  s.debts = [
    {
      id: "debt",
      name: "debt",
      balance: 60000,
      currency: "CAD",
      interestRate: 5,
    },
  ];
  s.goals = [goal("trip", 500, ["cash", "tfsa", "asset"])];
  assert.equal(P.totals(s).netWorth, -4900);
  assert.equal(P.allocate(s).goals[0].reserved, 100);
});
test("a dollar is reserved only once, even with overlapping funding sources", () => {
  const s = P.defaults();
  s.accounts = [account("a", 100), account("b", 50)];
  s.goals = [
    goal("one", 120, ["a", "b"]),
    goal("two", 80, ["b", "a"], { priority: 2 }),
  ];
  const a = P.allocate(s);
  assert.deepEqual(
    a.goals.map((g) => g.reserved),
    [120, 30],
  );
  assert.equal(a.deployable, 0);
  assert.equal(a.reserved, 150);
});
test("explicit account selection and priority determine reservations", () => {
  const s = P.defaults();
  s.accounts = [account("a", 100), account("b", 500)];
  s.goals = [
    goal("one", 300, ["a"]),
    goal("two", 500, ["b"], { priority: 2 }),
    goal("none", 50, []),
  ];
  assert.deepEqual(
    P.allocate(s).goals.map((g) => g.reserved),
    [100, 0, 500],
  );
  s.goals = [
    goal("low", 100, ["a"], { priority: 2 }),
    goal("high", 80, ["a"], { priority: 1 }),
  ];
  assert.deepEqual(
    P.allocate(s).goals.map((g) => g.reserved),
    [80, 20],
  );
});
test("known obligations reserve before goals and expose shortfalls", () => {
  const s = P.defaults();
  s.accounts = [account("a", 100)];
  s.settings.taxObligation = 60;
  s.settings.otherObligations = 70;
  s.goals = [goal("trip", 50, ["a"])];
  const a = P.allocate(s);
  assert.equal(a.obligations, 100);
  assert.equal(a.obligationShortfall, 30);
  assert.equal(a.goals[0].reserved, 0);
  assert.equal(a.deployable, 0);
});
test("USD is converted consistently for assets, debt, reservations and investments", () => {
  const s = P.defaults();
  s.settings.usdRate = 1.4;
  s.accounts = [account("usd", 100, { currency: "USD", invested: true })];
  s.debts = [
    {
      id: "d",
      name: "USD loan",
      balance: 20,
      currency: "USD",
      interestRate: 5,
    },
  ];
  s.goals = [goal("trip", 120, ["usd"])];
  assert.equal(P.totals(s).netWorth, 112);
  assert.equal(P.totals(s).invested, 140);
  assert.equal(P.allocate(s).deployable, 20);
});
test("legacy balances, debt, names and saved references survive without double counting", () => {
  const old = {
    user: { name: "Example" },
    accounts: {
      cash: 100,
      savings: 200,
      tfsa: 500,
      custom: [{ id: "x", name: "Asset", amount: 50 }],
    },
    debts: [{ name: "Loan", amount: 20 }],
    goals: [{ name: "Trip", target: 500, currentAmount: 250, priority: 1 }],
  };
  const s = P.migrate(old);
  assert.equal(s.user.name, "Example");
  assert.equal(P.totals(s).netWorth, 830);
  assert.equal(s.goals[0].legacySaved, 250);
  assert.equal(P.allocate(s).reserved, 300);
  assert.equal(s.accounts.find((a) => a.name === "Asset").protected, true);
  assert.equal(s.migrationNotice, true);
});
test("reserve goals measure months of expenses and do not complete with unknown expenses", () => {
  const s = P.defaults();
  s.accounts = [account("a", 1500)];
  s.goals = [goal("emergency", 3, ["a"], { type: "reserve" })];
  let a = P.allocate(s);
  assert.equal(P.goalProgress(s, a.goals[0], a, "2026-11").ready, false);
  s.settings.expenses = 500;
  a = P.allocate(s);
  assert.equal(a.goals[0].reserved, 1500);
  assert.equal(P.goalProgress(s, a.goals[0], a, "2026-11").ready, true);
});
test("net worth, income and purchase goals do not reserve assets", () => {
  const s = P.defaults();
  s.accounts = [account("a", 1000)];
  s.goals = ["networth", "income", "purchase"].map((type) =>
    goal(type, 100, ["a"], { type }),
  );
  const a = P.allocate(s);
  assert.equal(a.reserved, 0);
  assert.equal(a.deployable, 1000);
});
test("monthly tax reserve, expenses and splits match the supplied planning example", () => {
  const s = P.defaults();
  s.settings.expenses = 2200;
  s.income = [
    {
      id: "i",
      name: "Business",
      month: "2026-11",
      projected: 6000,
      actual: null,
    },
  ];
  const c = P.incomeMonth(s, "2026-11", "projected");
  assert.equal(c.tax, 1500);
  assert.equal(c.surplus, 2300);
  assert.equal(c.investments, 1495);
  assert.equal(c.business, 506);
  assert.equal(c.lifestyle, 299);
  assert.equal(c.complete, false);
});
test("deficits do not create negative or fictitious allocations", () => {
  const s = P.defaults();
  s.settings.expenses = 2200;
  s.income = [
    { id: "i", name: "Business", month: "2026-11", projected: 1000, actual: 0 },
  ];
  const c = P.incomeMonth(s, "2026-11");
  assert.equal(c.complete, true);
  assert.equal(c.surplus, -2200);
  assert.equal(c.investments + c.business + c.lifestyle, 0);
});
test("rounding preserves every cent without negative allocations", () => {
  const s = P.defaults();
  s.settings.taxRate = 0;
  s.settings.investmentPct = 50;
  s.settings.businessPct = 50;
  s.settings.lifestylePct = 0;
  s.income = [
    { id: "i", name: "Small", month: "2026-11", projected: 0.01, actual: 0.01 },
  ];
  const c = P.incomeMonth(s, "2026-11");
  assert.equal(c.investments + c.business + c.lifestyle, 0.01);
  assert.ok(c.lifestyle >= 0);
});
test("income consistency requires three consecutive complete months and includes recorded zero", () => {
  const s = P.defaults();
  s.income = ["2026-08", "2026-09", "2026-10"].map((month, i) => ({
    id: month,
    name: "Business",
    month,
    projected: 6000,
    actual: i === 1 ? 0 : 6000,
  }));
  let h = P.consistency(s, "2026-11");
  assert.equal(h.complete, true);
  assert.equal(h.floor, 0);
  assert.equal(h.average, 3000);
  s.income[1].actual = null;
  assert.equal(P.consistency(s, "2026-11").complete, false);
  s.income[1].actual = 6000;
  s.income.push({
    id: "missing",
    name: "Job",
    month: "2026-09",
    projected: 1,
    actual: null,
  });
  assert.equal(P.consistency(s, "2026-11").complete, false);
});
test("calendar lookback crosses years correctly", () => {
  assert.equal(P.shiftMonth("2027-01", -3), "2026-10");
});
test("conditional purchase requires all rules and available capital after reserves", () => {
  const s = P.defaults();
  s.settings.expenses = 100;
  s.accounts = [account("a", 10000)];
  s.goals = [
    goal("reserve", 6, ["a"], { type: "reserve" }),
    goal("car", 1000, ["a"], {
      type: "purchase",
      requiredNetWorth: 10000,
      requiredIncome: 100,
      priority: 2,
    }),
  ];
  s.income = ["2026-08", "2026-09", "2026-10"].map((month) => ({
    id: month,
    name: "Income",
    month,
    projected: 1000,
    actual: 1000,
  }));
  let a = P.allocate(s);
  assert.equal(P.goalProgress(s, a.goals[1], a, "2026-11").ready, true);
  s.accounts[0].protected = true;
  a = P.allocate(s);
  assert.equal(P.goalProgress(s, a.goals[1], a, "2026-11").ready, false);
});
test("forecast handles zero return, end-month contributions, withdrawals and pauses", () => {
  assert.equal(P.projection(1000, 100, 0, 2).value, 3400);
  assert.equal(P.projection(1000, 100, 0, 2, 500, 12).value, 1700);
  assert.equal(P.projection(1000, 0, 10, 1).value, 1100);
  assert.equal(P.projection(1000, 100, 0, 1, 0, 12).value, 1000);
});
test("backup round trip retains all planning data and rejects invalid imports", () => {
  const s = P.defaults();
  s.accounts = [account("a", 500)];
  s.goals = [goal("g", 200, ["a"])];
  assert.deepEqual(P.migrate(JSON.parse(JSON.stringify(s))), s);
  for (const mutation of [
    (x) => (x.version = 99),
    (x) => (x.settings.usdRate = 0),
    (x) => (x.settings.businessPct = 99),
    (x) => (x.accounts[0].balance = -1),
    (x) => (x.goals[0].accountIds = ["missing"]),
    (x) => (x.settings.annualReturn = Infinity),
    (x) => x.accounts.push({ ...x.accounts[0] }),
    (x) =>
      (x.income = [
        { id: "x", name: "Bad", month: "2026-13", projected: 1, actual: null },
      ]),
  ]) {
    const x = structuredClone(s);
    mutation(x);
    assert.throws(() => P.validate(x));
  }
});
test("random waterfalls conserve eligible capital across hundreds of overlapping goals", () => {
  let seed = 123;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 250; i++) {
    const s = P.defaults();
    s.accounts = Array.from({ length: 5 }, (_, j) =>
      account("a" + j, P.round(rand() * 10000), {
        currency: j % 2 ? "USD" : "CAD",
        protected: j === 4,
      }),
    );
    s.settings.taxObligation = P.round(rand() * 10000);
    s.goals = Array.from({ length: 10 }, (_, j) =>
      goal(
        "g" + j,
        P.round(rand() * 10000),
        s.accounts.filter(() => rand() > 0.4).map((a) => a.id),
        { priority: j },
      ),
    );
    const a = P.allocate(s);
    assert.equal(
      P.round(a.reserved + a.obligations + a.deployable),
      P.totals(s).eligible,
    );
    assert.ok(Object.values(a.remaining).every((n) => n >= 0));
    a.goals.forEach((g) => assert.ok(g.reserved <= g.target));
  }
});
