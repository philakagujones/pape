# pape.

Build wealth with intention. A local-first financial planning and capital allocation workspace, built with plain HTML, CSS, and JavaScript. No backend, bank connections, build step, or committed financial data.

## Run

Serve the repository with `python3 -m http.server 8080`, then open `http://localhost:8080`. Existing GitHub Pages hosting can serve the same files. Storage belongs to the exact browser and origin; export a backup before switching hosts or browsers.

Run calculation and application integration tests with `node --test planner.test.js app.test.js`.

## Workspace

- **Overview:** net worth, liquid capital, reserve runway, income floor, investments, customizable milestones, and real monthly snapshots.
- **Capital:** CAD/USD accounts, manual FX rate, protection and liquidity settings, liabilities and interest rates, obligations, account-backed reservations, and manual registered contribution tracking.
- **Cash Flow:** projected and actual pre-tax profit by month and source, tax reserve, living costs, surplus allocation, and the previous three completed months of income consistency.
- **Goals:** savings, reserves measured in months, net worth, consistent income, and conditional purchases.
- **Forecast:** portfolio projections, financial independence assumptions, contribution comparisons, and temporary withdrawal/pause scenarios.

## Accounting rules

Net worth is assets minus liabilities; it is never used as the funding pool. Only liquid, unprotected accounts may fund reservations. Obligations reserve first in account order. Savings and reserve goals follow priority, drawing only from the selected accounts. Each CAD cent can be reserved once. Account balances remain unchanged; reservations are not transfers or new assets. Conditional purchase, income, and net worth goals do not reserve funds. Conditional purchases are evaluated separately and may reference the same free capital.

All planning totals are CAD. USD balances use the editable USD→CAD rate (the initial rate is an example, not live market data). Interest is informational and does not accrue automatically. Reserved money still belongs to its account and remains part of net worth. Reserve runway sums funded reserve goals, divided by monthly living expenses.

Tax is a configurable reserve estimate, not a tax engine. Income consistency uses the lowest month and average of the three calendar months preceding the selected month. Every recorded source in each month must have an actual value; blank is unknown and zero is a known zero. The current tax reserve rate is applied to all months. Income and purchase goals use the three months preceding today. Surplus splits assume reserves and obligations are funded; the income planner does not move or reserve money.

Registered room is recorded once per account type across all matching accounts. Remaining room is confirmed opening room minus entered contributions; account growth does not consume room. Figures must be updated for each new year. Withdrawals, statutory limits, eligibility and carry-forward are not calculated.

Forecasts use effective annual return converted to a monthly rate and end-of-month contributions. They exclude fees, taxes, inflation and withdrawals unless entered in the temporary scenario. FI target = annual spending ÷ assumed withdrawal rate. All projections are illustrative.

## Persistence and recovery

The current workspace is stored under `pape_v3`. On first load, a valid `vault_v2` workspace migrates automatically, leaving the original untouched and writing an additional `pape_legacy_backup` recovery copy. Standard cash and savings accounts are eligible. Investments and unclassified custom assets start protected. Old saved goal amounts remain reference metadata, never additional assets. Review funding sources after migration.

Settings exports a versioned JSON backup and validates a restore before replacing current data. A restore retains the previous raw workspace under `pape_before_restore`. Recovery exports contain exact saved strings and can be imported to choose a valid copy. Invalid storage is not silently overwritten. Failed writes keep the prior in-memory state; changes in another tab block editing until reload. Snapshots contain real entered totals and notes; there is no invented history or seeded personal financial data.

## Files

- `planner.js`: pure calculations, migration and schema validation (also usable in Node tests).
- `app.js`: rendering, editing, navigation, browser persistence, import/export.
- `index.html`, `style.css`: accessible app shell and responsive interface.
- `planner.test.js`: allocation invariants, currencies, migration, income, purchases, forecasts and backup validation.
- `app.test.js`: browser-independent rendering, editing, persistence, recovery and restore checks. These do not replace a visual browser check.

The UI requests optional Google Fonts; system fonts are used offline. No financial data is sent to a server.
