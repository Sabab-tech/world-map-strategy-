# OMEGA Autonomous Private Investment Decisions V1

## Scope

This layer adds bounded NPC investment selection to the existing five Universal Private Companies and the existing cross-border investment runtime. It does not add a new company identity, factory category, economic ledger, market, scheduler, currency converter or settlement system.

The decision engine is a caller of the existing OmegaPrivateInternationalInvestmentRuntimeV1.invest() API. The investor is a private company wallet, not a national Treasury. A successful transfer credits the same company identity in the host country.

## Country and company scope

- The country roster is read from OmegaPrivateEnterpriseRegistryV1.listCountryIds(). The registry has already validated the canonical 197-country baseline, so this API returns its existing ISO3 keys without a second dataset fetch.
- The engine processes only NPC investor countries. The selected player country is always skipped.
- The company roster is the existing five Universal Private Company IDs. Each country visit considers one company's current available wallet balance, rotating the selected company after a settled transfer.
- The host country may be any other country in the validated core roster, including the player's country, provided the investment screen passes.

## Investment screen

A host is considered only when its current country state contains recorded GDP, GDP growth, inflation and at least one bilateral relationship score. Missing values remain unknown; no synthetic defaults are substituted.

The screen blocks a candidate when either recorded relationship reports war or sanctions, either country is marked in active conflict, either economy is marked in active crisis, host GDP growth is below the configured recession limit, host inflation exceeds the configured limit, or recorded host debt-to-GDP exceeds the configured limit.

Eligible candidates are scored on bilateral relationship quality, GDP growth, inflation stability, market size and (when recorded) debt-to-GDP. Missing debt data is excluded from the weighted denominator; it is not treated as zero debt. Incomplete reciprocal war/sanction flags lower the score. The score is a simulation decision heuristic, not a real-world credit rating, official FDI forecast or investment recommendation. Sector fit is explicitly recorded as not assessed because the current runtime does not expose a comparable live sector-opportunity indicator.

## Capital protection and pacing

- One investment deploys no more than 3% of the selected company's currently available local-currency balance; at least 97% remains available immediately after the transfer reservation.
- One investor country cannot settle another autonomous transfer inside the 120-turn investment cooldown.
- The same investor-country / host-country / company pair has a 360-turn cooldown.
- A host accepts at most six settled autonomous inbound transfers within a rolling 120-turn window under this game policy.
- Each visit screens at most 12 host candidates and runs only in the existing ACTIVE / MACRO scheduler tiers.
- No network fetch, timer, animation loop or second scheduler is introduced by the country decision handler. The rules file is loaded during initialization; a not-ready engine defers without blocking the authoritative turn scheduler.

These are explicit game-balance assumptions, not measurements of actual investment costs or the size of any country's economy.

## Settlement, persistence and recovery

The decision checkpoint is stored under finance.omegaFinance.autonomousPrivateInvestmentDecision through the Finance-owned Ministry StateTransaction command. Before moving money, the engine persists an immutable pending request. It then calls the existing currency-aware, cent-exact, idempotent FDI settlement API. An unfinished request is replayed with the same investor, host, company, amount and request ID until the existing settlement API reports a terminal outcome.

This preserves the existing FDI source-of-truth ledger, escrow, host receipt and reconciliation rules. The engine does not perform a second debit or create an alternate investment ledger.

## Explicit non-effects

A settled investment is company capital only. It does not:
- create or commission a factory;
- approve a host-government permit or investment screening decision;
- reserve materials, create inventory, ship resources or start production;
- modify government Treasury, public debt or government budget;
- bypass the existing company proposal, government decision, supply preflight, construction CAPEX, commissioning or production gates.

## Verification

The focused suite covers scheduler registration, player-country exclusion, score and risk screening, missing-data behavior, host inbound caps, local-currency capital limits, pending-transfer replay/idempotency, cooldowns, pair diversification, and unchanged Treasury / production assets. The shared private-enterprise lifecycle suite and the existing international-investment suite include these tests. Android tests are not run.
