## OMEGA Phase 4A — National Accounts Foundation

Phase 4A adds a country-scoped, read-only national-account checkpoint. It establishes an accounting contract for later industrial, labour, capital, fiscal and monetary integrations. It is not a GDP generator and does not replace Finance, Trade, Resource, Factory, Market or NPC macro runtimes.

The core simulation roster remains the 197 ISO3 identities in the minister country roster manifest. Wider country and territory registries are not silently added to the NPC runtime scope.

### Authority boundaries

| Domain | Existing authority | Phase 4A behaviour |
|---|---|---|
| Country identity | Canonical country registry and core-country manifest | Read and validate the ISO3 roster |
| Treasury and fiscal ledger | Finance Ministry and country Finance state | Read balance, provenance and bounded ledger summary only |
| Cross-border trade | Ministry interoperability and Global Trade settlement handlers | Count SETTLED rows only; retain currency in value observations |
| Physical resources | Resource Economy and Resource Industrial Network | Read batch identity and closing stock by resource plus unit |
| Factory activity | Country industrialRuntime production ledger | Count completed execution records; never price unknown output |
| GDP baseline | Finance-owned economy record and source profile | Display only as a modelled reference |
| National-account checkpoint | Economy Ministry State Transaction | The only state Phase 4A writes |

The reader does not call mutating Finance reconciliation APIs. It does not post ledger rows, debit or credit Treasury, add or remove goods, execute factories, or treat a market offer or import request as settled trade.

### Accounting contracts

Treasury conservation is Opening cash + inflows - outflows = closing cash. All four components must exist for the same country, currency and game-time period. Current live integration exposes a closing balance and transaction ledger but not a complete period opening-and-flow set; status therefore remains CLOSING_BALANCE_ONLY.

Goods conservation is Opening stock + production + imports - consumption - exports - losses = closing stock. Checks are grouped by resource identity and unit. Different units are never added. Missing components yield PARTIAL, absent records yield UNOBSERVED and a failed equation yields UNRECONCILED.

GDP is reconciled only when production, expenditure and income approaches are complete for the same currency and period and agree within tolerance. Production measures gross output less intermediate consumption plus product taxes less subsidies. Expenditure measures household consumption + gross capital formation + government final consumption + exports - imports. Income measures employee compensation + gross operating surplus + mixed income + production taxes - subsidies. Current gameplay GDP progression is retained only as a labelled modelled reference, not copied into these three approaches.

### Mobile and execution budget

- Uses the existing World Simulation Scheduler; no wall-clock interval, worker, polling, background browser loop or full-world per-turn scan.
- One selected country handler executes at a time in the existing PLAYER, ACTIVE or MACRO tier, after existing financial and NPC macro handlers at priority 40.
- Reads are bounded: Finance ledger 500 rows, Trade ledger 512 rows, inventory batches 4,096 rows, factory production ledger 2,048 rows and stock identities 96 rows.
- Checkpoint history is capped at 12 compact snapshots. Raw source ledgers are not copied into Economy state.
- No DOM work or cross-country aggregation. Cadence comes only from game turns. Runtime and rules are included in the offline shell, with its cache version advanced.

### Delivered and remaining

Delivered: 197-country roster validation, authority/provenance envelope, read-only evidence snapshot, Finance ledger classification, settled-trade filtering, currency-separated trade values, per-unit closing-stock grouping, idempotent Economy-owned checkpoint, Treasury/goods/GDP invariant helpers, bounded mobile execution and regression tests.

Not yet delivered: complete Treasury roll-forward; full physical goods flows across mines, factories, households and losses; transaction-time FX conversion and consistent valuation; complete GDP components for all three approaches. These are not guessed or filled with zero. Phase 4B onward must attach evidence to existing authoritative engines before accounts can be marked reconciled.

### Quality gates

- Same country and same game turn is idempotent.
- A checkpoint writes only Economy-owned nationalAccounts state through Ministry State Transaction.
- Finance, Trade and Resource state is unchanged by the accounting reader.
- Pending trade requests are excluded and currency values remain grouped by currency.
- Goods quantities remain grouped by resource identity and unit.
- Missing values remain UNOBSERVED, not zero.
