# OMEGA Finance Ministry Runtime v1.1

## Interactive control-room layout
Finance is split into icon-based tabs: Overview; Budget Sectors; Income & Industry; Treasury & Debt; Reports. Detailed balances and indicators are only rendered inside the relevant tab, instead of filling one long screen. The 249-country macroeconomic register is lazy-loaded from the Reports tab to reduce startup work on lower-end phones.

## Budget distribution
`finance_sector_registry_v1.json` defines 22 budget sectors including defense, internal security, education, healthcare, infrastructure, technology/R&D, chemicals, engineering/manufacturing, energy, resources/mining, agriculture, trade/logistics, public administration, social protection, environment, debt service, emergency reserves, industrial development, construction, financial services, culture/tourism and national projects. Initial sector shares sum to 100%. The player can edit each share or annual amount. The runtime rejects allocations above the annual budget envelope and expenses above either their sector ceiling or the actual available treasury.

A budget allocation is a ceiling, not a payment. Sector expenses are posted only when the player submits an expense. The transaction records category, sector, purpose, simulation turn and balance after payment. A configurable minimum cash-reserve policy can block non-emergency spending below a safety floor.

## Income and economic sectors
`finance_sector_registry_v1.json` separately defines 15 economic-output categories. Estimated industry output is current in-game GDP multiplied by the configurable sector mix. Projected public receipts are allocated from the modeled annual tax-revenue forecast using the configured receipt shares. Both are explicitly marked as model estimates rather than country-specific observed sector accounts.

Finance reads actual receipts from the existing finance and Resource Economy runtime when available. Resource sales/current-turn receipts, recorded cumulative resource contributions, recorded tax receipts and all recorded revenue are shown with evidence labels. Missing customs, state-enterprise, fee or transfer income remains unavailable unless a specific live game field exists.

## Cash, debt and simulation integration
- Player identity is resolved from the active OMEGA game session. Profiles for other countries are read-only; every financial command is checked against the active player's country.
- Simulated time accrues modeled tax receipts and sovereign-debt interest. Tax receipts are synchronized to the existing `finance.taxRevenue`, `finance.revenue` and `finance.available` fields.
- Manual expenses deduct actual Treasury cash and update the sector allocation and spending ledger. Borrowing raises cash and public debt; principal repayment reduces both. Borrow transactions are limited by the configured per-transaction GDP cap and total modeled debt-to-GDP ceiling.
- Cash changes posted by existing ministries or the resource engine are reconciled from the existing `finance.available` field and recorded as external credits/debits when the originating category cannot be identified safely.
- Planned annual spending is not automatically deducted from cash. The plan is an authorized ceiling; actual cash moves only from recorded revenue, explicit expenses, outside subsystem cashflows and debt-interest accrual.
- Sector allocation, industry-output and forecast-receipt shares are game rules, not official economic statistics. The existing source data files remain unchanged.

## Automated validation
`test:finance` validates full roster coverage, sector-share math, budget ceilings, recorded income, live treasury sync, actual spending, debt repayment, player-country boundaries, UI tab navigation and lazy reports rendering.

## Combined economic and fiscal rows
Each of the 15 modeled economic-output categories is mapped to the closest budget-planning sector. The Income & Industry table shows estimated output, projected sector receipts, the linked annual allocation, fiscal-year spending and remaining ceiling side by side. Industry figures are configurable game estimates; budget and spending values are taken from the player's Finance plan and ledger.

Emergency expenses are restricted to the Emergency & Strategic Reserve sector, and debt-service expenses must use the Debt Service & Financial Stability sector. These checks prevent other sectors from using these categories to bypass the configured minimum Treasury reserve.

## Fiscal-year industry receipts
Each simulation-time tax collection is split across the 15 configurable economic-sector receipt shares and accumulated in `finance.<country>.omegaFinance.currentYearSectorReceiptsUsd`. The Income & Industry row displays this as **Collected this FY**, beside the annual modeled forecast. On the tested default registry, sector receipt shares sum to 100%, so all sector rows reconcile to the modeled current-year tax receipts (within floating-point rounding). These values are in-game fiscal estimates, not real-world sector tax records.

## FX & Government Banking tab
The Finance dashboard includes a sixth icon tab, **FX & Banking**. The existing FX runtime is mounted inside a dedicated `data-ofx-container` slot only when this tab is selected. This keeps the currency conversion, monetary-policy, intervention, rate charts, Government Banking registry and FX clearing ledger out of the other Finance tabs. The FX runtime remains a separate engine and still delegates policy interest-rate actions to Finance's player-country guard.
