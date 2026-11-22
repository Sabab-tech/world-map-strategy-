# OMEGA Government Investment & International Development V1

## Purpose

The Sovereign Investment system lets each country's government allocate its own Treasury capital to domestic public projects and approved projects in other countries. It is separate from Private Enterprise capital and private-company wallets. It reuses the existing Finance, FX, Resource Industrial Network, Mine construction, Factory construction, Infrastructure construction and project state lifecycles.

The runtime is omega_government_international_investment_runtime_v1.js; the Finance Ministry interface is omega_government_international_investment_ui_v1.js.

## Investment instruments

- **Equity** — a government takes a recorded project-level equity position. Distributions are possible only when the host Finance ledger contains posted, project-linked distributable net-profit evidence.
- **Government joint venture** — an equity arrangement with an explicit ownership share. Additional co-investors are subject to a project-level aggregate equity ceiling in the NPC screening rules.
- **Sovereign project loan** — a host government records a liability and the investor records a receivable. The schedule uses quarterly installments, an agreed annual rate, duration and optional grace period. A missed Treasury payment records arrears; it does not silently create cash.
- **Development grant** — non-equity development capital. A grant does not create an equity claim or guaranteed return.
- **Domestic public CAPEX** — a separate same-country instrument for a government investing its own Treasury funds in its own public project. It is not foreign equity or external FDI.

## Countries, Treasury and risk limits

Country identity is resolved to ISO3 before a transaction is authorized. Player actions are restricted to the canonical active player country; NPC actions require the runtime's internal authority marker.

The investment budget is calculated from the country's Finance-owned available Treasury balance, less:
1. the protected reserve determined by Finance's configured reserve percentage of annual spending; and
2. mandatory debt service currently due.

When annual spending or reserve policy data is missing, the runtime uses a conservative 10% cash buffer and labels the budget basis. The maximum single proposal is 35% of the resulting available investment budget. These are gameplay risk controls, not assertions about any country's real-world fiscal law.

No proposal is accepted if the investor Treasury, FX rate, country identity or project funding evidence is unavailable. Current FX rates are read from OmegaForexMonetaryEngine; both investor and host currency codes/rates are snapshotted with the proposal. Historical contracts are not repriced silently when the current exchange rate changes.

## Proposal, approval and settlement lifecycle

1. Validate investor/host country, player/NPC authority, instrument, amount, project and current FX.
2. Record the proposal in the host Finance register and, for cross-border transactions, in the investor Finance register.
3. Require host-government approval for an incoming foreign proposal. A player-host proposal is never auto-approved by an NPC.
4. Reserve the investor Treasury amount through a Finance-owned state transaction.
5. Record the host's restricted-fund receipt, settle the investor reservation and confirm the host receipt.
6. Apply approved CAPEX only through the matching project lifecycle. Failed project creation is recorded for reconciliation; unspent restricted funds can be refunded through matching transaction IDs.

The transfer, receipt, settlement, refund and CAPEX entries use idempotency keys. The Finance ledger stores balanced debit/credit journal evidence. A duplicate request cannot debit the same transfer twice.

## Eligible project uses

### Mine

A Mine must exist in the canonical site catalogue and pass the current Mine project quote: required materials, staffing and commissioning readiness. The host Treasury and investor contribution together must cover the canonical Mine construction cost. The existing Mine runtime remains responsible for the actual project start, material consumption, construction and commissioning. The investment ledger records the foreign investor's contribution separately from any host Treasury co-funding.

### Factory

The target must be one of the existing Factory categories in the industrial catalogue, and its construction material quote must be ready. The catalogue's construction cost unit is preserved exactly as authored (currently GAME_CURRENCY_UNITS in the inspected Factory profiles). It is not relabelled or converted to USD without an authoritative conversion rule. The government's USD contribution is separately recorded as the investment contract amount; the existing Factory project runtime owns the construction and commissioning process.

### Infrastructure

The project requires an explicit infrastructure type, distance, daily capacity, build duration and USD funding amount. It is submitted to the existing Infrastructure project API. The investment runtime does not claim a new logistics or utility benefit unless the relevant project/runtime subsequently records it.

### Existing project capital

Only a project with an observed positive costUsd and a supported active/completed state is eligible. The contribution is capped at 25% of the recorded project CAPEX. It is reserved as project working capital and linked to that project. The current operating runtime does not yet consume this earmarked working-capital record, so this option does **not** assert an immediate production, capacity or employment increase.

## Returns and repayment

Equity profit distribution requires all of the following:
- an existing host project with a matching investor position and share;
- a posted Finance ledger record for the exact project ID;
- a positive distributableNetProfitUsd field on that record; and
- sufficient host Treasury cash to make the distribution.

Gross sales, gross production value, a simulated estimate or a project's construction budget are not treated as distributable profit. Expected annual return and payback remain unavailable until suitable project cash-flow evidence exists. No ROI, employment or production benefit is fabricated by the investment runtime.

Loan installments are calculated from the principal, contract rate, remaining installments and grace period. The host Treasury is debited and the investor Treasury credited under separate idempotent payment IDs. Pending credit failures can be reconciled without creating a second borrower debit.

## NPC autonomy and performance

NPC government investment screening runs at a bounded interval of 30 game turns. One cycle considers at most 4 investor countries, 3 host countries, 12 new proposals and up to 2 pending host decisions per host. The active player country can be selected as a host, but it is excluded from the NPC investor pool. The remaining candidate countries rotate across cycles rather than testing all 197 × 196 country pairs every turn.

NPC screening currently considers existing Resource Industrial Network projects with observed costUsd and available public macro evidence. A host with missing GDP/debt evidence is left for review; it is not auto-approved. Host exposure limits reject oversized proposals. NPC investors do not receive simulated guaranteed returns.

## Finance data ownership and safeguards

All investment transactions, proposals, restrictions, loan positions and country ledgers are written through Finance-owned ministry commands and OmegaMinistryStateTransaction. The runtime does not change the active player-country identity to move another country's money and does not use Government Treasury funds as Private Company capital.

Resource Industrial Network remains the source of truth for project construction and operational state. Finance remains the source of truth for sovereign cash, reservations, receipts, debt and investment journals. A shared project ID connects the two without creating a second Factory or Mine runtime.

## Known boundaries in V1

- The system is fully scoped to available canonical countries and FX profiles, but only supported project types can be funded.
- Existing-project working capital is earmarked, not yet consumed by the operating runtime.
- Equity distributions require a project-linked Finance net-profit evidence record. Where current production/sales accounting does not emit that exact evidence, distributions remain blocked.
- Factory catalogue construction units are not presumed to be USD.
- NPC autonomy is deliberately bounded and currently co-invests in qualifying existing projects rather than inventing new sector needs or constructing unapproved projects.
- Project employment, production, mining output, utility effects, logistics capacity and tax revenue must be produced by their existing runtime evidence, not by the investment record alone.

## Verification

Focused tests are in test/omega_government_international_investment_runtime_v1.test.mjs, run with:

npm run test:government-investment

The GitHub Actions workflow .github/workflows/omega-government-investment.yml additionally runs the Finance Treasury, FX, Mine management and Private Enterprise lifecycle regression suites. Android testing is intentionally excluded.
