# OMEGA Phase 3C — Macro-Economic Evidence Matrix v1

**Status:** evidence inventory and implementation boundary recorded; Phase 3C is not closed by this document.  
**Audited source revision:** `8b32b4c6f8df35861732367818b8bcb00968d430` (`main`, 2026-11-19), with the country-scoped FX follow-up `6dd9238ad26473f5f64d923e7bd07f7c8785c524` verified after merge.  
**Scope:** current macro, Finance, FX, trade, industrial-output, National Accounts and world-scheduler authorities.  
**Decision:** do not activate a new Phase 5 stock-flow economy, household/firm agent layer, or GDP formula until Phase 3C evidence/calibration and Phase 4A performance exit criteria are accepted.

## 1. Executive finding

OMEGA already has a deterministic, turn-driven *game economy pipeline* with separate owners for Finance, monetary/FX, industrial production, trade settlement, macro stability, NPC macro progression and National Accounts. It does **not** yet have a complete double-entry national economy with household and firm sector accounts. The National Accounts foundation is a read-only reconciliation checkpoint, not a complete national-account transaction system.

The existing NPC macro runtime is an evidence-aware projection/checkpoint layer. It does not own cash, stock, production, trade settlement or official GDP. It persists a modelled checkpoint through the Economy Ministry. Its presence is not evidence that Phase 5's full national economy is implemented.

The following terms must remain distinct in UI, APIs and saved state:

- **Observed / source-backed game state:** a value read from a source ledger or country data record, with source, unit, period and provenance.
- **Repository-local baseline:** historical data mapped into the game registry, not revalidated as a current official series.
- **Modelled index / projection:** a result calculated from game state and versioned assumptions.
- **Unobserved / unavailable:** a missing source value. It is not zero and must not be imputed as zero.
- **Reconciled:** an accounting identity passed for a stated period, currency and source coverage. It does not, by itself, prove that all national accounts are complete.

## 2. Baseline registry coverage and quality

Source: `economy_global_profiles_v1.json`, `metadata`.

| Registry field | Current value | Interpretation |
|---|---:|---|
| Country / territory profiles | 249 | Broader profile registry, not the 197-country core game roster |
| Mapped economic profiles | 230 | Repository-local economic profiles |
| Profiles without mapped economic data | 19 | Must remain unavailable/unobserved |
| Profiles with GDP baseline | 230 | Historical baseline coverage, not 2026 observed GDP |
| Mapped population profiles | 195 | Population baseline coverage |
| Missing population profiles | 54 | Must remain unavailable/unobserved |
| Baseline year | 2015 | Historical baseline year declared by registry metadata |
| Economic source | `economy.json` | Repository-local source |
| Independent external revalidation | Not recorded | Registry warning explicitly says the baseline has not been independently revalidated against official external statistical sources |

**Rule:** the current 2015 baseline may anchor a clearly labelled game scenario, but it cannot be surfaced as a current observed GDP or used to claim empirical calibration. Derived ratios and custom influence/risk indices remain game indices, not official country rankings or credit ratings.

## 3. Authority and evidence matrix

| Domain / signal | Authoritative owner and source | Unit / period | Current trust level | Allowed use | Not allowed |
|---|---|---|---|---|---|
| Baseline nominal GDP, GDP growth, inflation, unemployment, debt, budget balance, trade balance, FX reserves, GCF | Country General Data metadata where present; otherwise `economy_global_profiles_v1.json` local profile | Explicitly declared metric units; historical baseline year 2015 | Source-backed historical baseline or `UNAVAILABLE`; local profile is not externally revalidated | Baseline context, scenario initialization with provenance | Present as current official statistics or claim calibration |
| Current nominal GDP and GDP growth | Finance-owned country economy state, read by NPC macro rules | USD current / percent per year | Game runtime state; modelled by game economy | NPC macro projection baseline with Finance authority retained | Duplicate GDP owner, rewrite Finance GDP from National Accounts or label official observed GDP |
| Inflation and unemployment | Current country economy state / Finance and labour runtime, when present | Percent; period is game turn / annualized rule basis | Game runtime input; missing is `UNOBSERVED` | Evidence input to explicitly modelled projection | Invent defaults for missing country values or treat projection as labour survey data |
| CPI and producer-cost index | Economic Transmission runtime | Index (opening model baseline = 100) | Modelled derived signal | Price-transmission / shock sensitivity input | Call official CPI/PPI observation |
| Real GDP index and household purchasing-power index | Economic Transmission runtime | Index | Modelled derived index | Scenario feedback and UI when labelled modelled | Treat as observed real GDP, household survey, or national-account component |
| Factory output | Resource Industrial Network `finishedGoodsLedger` and referenced batch records | `resourceId + declared unit`; game turn | Committed in-game production, with `SIMULATED_PROCESSING_YIELD` authority | Output quantity and like-for-like output progression for the same country, identity, unit and interval | Sum unlike resources/units, infer monetary GDP without prices/value-added, or claim real-world factory census |
| International trade | Country `trade.importLedger` and `trade.exportLedger`; Global Trade emits `SETTLED` events | Native buyer or seller currency, settlement turn | Settled game transaction | Country import/export activity after transaction-level currency and settlement identity checks | Count pending offers/orders/matches as trade; sum seller and buyer mirror records as one country's flow |
| FX | Forex Monetary Engine currency registry and simulation/reference rate stores | Local currency per USD or pair conversion | Game FX reference/simulation rate | Convert a transaction using its recorded settlement FX and currency | Revalue historic settlements at a later current rate without an explicit restatement policy |
| Treasury cash and fiscal flows | Finance Ministry fiscal-period account and Treasury ledger | USD in the current fiscal account | Finance-owned game ledger; Phase 4B conservation | Reconcile opening cash + inflows − outflows = closing cash | NPC macro or National Accounts writing Finance cash or manufacturing missing flows |
| Inventory / physical stocks | Resource country batches, warehouses and stock ledgers | Resource identity + declared unit | Game stock ledger; source coverage varies by country and period | Reconcile goods stock flow when opening, production, imports, consumption, exports, losses and closing are all present | Add unlike units or infer missing openings/flows as zero |
| Investment | Baseline gross capital formation (GCF) where present; project lifecycle status counts | GCF: percent of GDP; project records: count | Historical baseline / project-count proxy | Display project activity separately; use monetary investment only when actual CAPEX ledger entries exist | Treat completed-project count as monetary CAPEX or actual GCF |
| Policy / diplomacy | Observed country policy and treaty/war/sanction state | Categorical values, rates, country counts | Game policy state | Versioned game-rule sensitivity; shock context | Claim the multipliers are country-specific empirical estimates |
| NPC macro checkpoint | NPC National Macro-Economy runtime, persisted by Economy Ministry command | Per-country, per committed turn | Deterministic model output plus source snapshot | Save/replay/debug projection lineage | Mutate Finance, trade, resource or official national-account ledgers |

### Current model input contract

`npc_national_macro_economy_rules_v1.json` declares a baseline metric list and live signals. Its policy effects explicitly identify themselves as global ruleset assumptions, and its purpose states that projections do not create cash, stock, production, settlements or official national-account observations.

Missing baselines stay null. The runtime records a source fingerprint, model version, last processed turn, provenance and up to 24 snapshots under `economy.npcMacroEconomy`. It skips the player-controlled country and uses the existing world scheduler's `ACTIVE` / `MACRO` tiers. A checkpoint is committed through the Economy Ministry interoperability command; the NPC macro runtime is not an independent state writer.

## 4. National Accounts: what is already implemented and what is not

The Phase 4A National Accounts rules define a **read-only** per-country checkpoint with explicit limits:

- Finance ledger rows: 500.
- Inventory batch rows: 4,096.
- Production ledger rows: 2,048.
- Trade ledger rows: 512.
- Pending import request rows: 512.
- Maximum stock-identity rows: 96.

The current reconciliation primitives enforce:

1. Treasury: `openingCash + inflows - outflows = closingCash`.
2. Goods: identity is `resourceId + unit`; unlike units are not combined.
3. GDP: production, expenditure **and** income approaches must all be complete for the same currency and period. Otherwise the result is `UNOBSERVED`, `PARTIAL` or `UNRECONCILED`, not a synthesized GDP.

This is the correct fail-closed foundation. However, a complete sectoral stock-flow model still requires authoritative, time-bounded sources for household income/consumption/saving/tax, firm value-added/wages/profits/investment/inventories, government revenue/expenditure/transfers, and external current/capital flows. Those complete source ledgers are not currently established by the National Accounts checkpoint. Do not manufacture them from top-level GDP or aggregate balances.

## 5. Macro formula audit and calibration status

The current NPC macro progression code is deterministic, configured in the versioned rules JSON, and explicitly labelled as a modelled projection. Its existing signals include:

- Like-for-like finished-goods output by resource identity and declared unit.
- Settled imports and exports in the current checkpoint interval.
- Project lifecycle counts.
- Observed diplomacy / trade-policy context.
- Finance-owned current GDP, growth, inflation and unemployment when available.
- Existing modelled CPI / producer-cost / financial-transmission indices.

Important limitations:

1. The current `industrialOutputGrowthPct` is an unweighted arithmetic mean of available annualized resource-unit growth rates. It is not a calibrated value-added or production-weighted industry aggregate. Preserve per-resource/per-unit quantities; do not use the mean as a national GDP contribution until an evidenced weighting method exists.
2. A project count is not CAPEX. The code already marks the no-monetary-CAPEX path as `PROJECT_COUNT_PROXY_ONLY_NO_MONETARY_CAPEX`; keep it as a project activity proxy.
3. Trade rows retain buyer/seller native currencies and settlement FX in the settlement path. The NPC interval aggregation currently normalizes ledger totals using the country's FX rate available at checkpoint time rather than the booked transaction FX. That can revalue historical flows when rates move. Do not elevate this trade contribution into an official external-sector GDP component until the model uses the booked transaction FX / currency basis consistently and is tested against mirrored settlement IDs.
4. `PROGRESSION_CALIBRATED` currently means the GDP and GDP-growth input fields were available to calculate a projection. It does **not** demonstrate empirical model calibration, fit, or forecast accuracy. UI and technical documentation must not infer those stronger meanings from that status label.
5. The current GDP projection compounds the Finance-owned nominal GDP input with projected growth. It is a game-model projection, not the output of a fully reconciled production/expenditure/income national-account system.

### First safe progression signal

The first defensible source-backed operational signal is **committed same-country finished output, grouped by canonical resource identity and declared unit, measured over a known game-turn interval**. It is suitable for a product-level operational output index. It is not by itself a national industrial value-added aggregate or GDP. Keep unlike commodities separate and retain the exact batch / ledger provenance.

No new aggregate GDP coefficient, consumption function, Taylor rule, household propensity, labour multiplier, or country-specific calibration constant is approved by this audit. Existing coefficients remain versioned game-rule assumptions until an empirical calibration data set, units, coverage and validation window are recorded.

## 6. Scheduler, determinism and mobile execution

The existing `Omega.WorldSimulationScheduler` is the only country-turn scheduler. Country handlers are sorted by priority and sequence and awaited in a stable order; the scheduler applies active/macro country selection and yields between work slices under its configured time budget.

Current macro execution order is:

| Priority | Handler | Owner / responsibility |
|---:|---|---|
| 10 | Macro Stability | Country stability signals and automatic stabilizer actions |
| 15 | Finance Ministry | Fiscal progression, Treasury and Finance ledger |
| 20 | Economic Transmission | Modelled financial / price / household purchasing-power indices |
| 30 | NPC National Macro-Economy | Evidence snapshot and modelled macro projection checkpoint |
| 40 | National Accounts | Read-only accounting evidence reconciliation |

Do not add a second tick loop, per-frame GDP update, per-country browser timer, or unconditional 197-country production simulation. New Phase 5 work must register with the existing scheduler, observe the same country identity/session authority, use the game turn as its time basis, batch bounded work and yield within mobile budgets.

The NPC macro checkpoint uses stable input fingerprints, a one-checkpoint-per-country-per-turn rule and Ministry-owned state transactions. This is useful deterministic infrastructure, but it is not yet a complete save/load/replay harness for a full stock-flow economy. Random shocks must not be introduced until their seed, ordering, save state and replay contract are explicit.

Global loops must be classified rather than blindly removed:

- Forex's initial registry hydration, market/rate refresh and world banking summary remain world-level projections; keep them distinct from country-scoped Finance update work. PR #481 is merged as `6dd9238ad26473f5f64d923e7bd07f7c8785c524`; exact-head Finance, Ministry, Daily Clock, Android Build, Country Registry, Resource Certificate and Language checks all passed.
- The world scheduler selects bounded active/macro countries; it is not intended to execute all detailed country systems every turn.
- Resource Economy's world mine totals are a cached aggregate/diagnostic, not permission to run every country's full production engine.
- Trade / market world summaries are aggregation or price-discovery views; a price-discovery match is not a settled transaction.

## 7. Phase 5 entry gate and implementation order

Phase 5 core runtime remains blocked until all of these are true:

- [ ] **Phase 3C:** every macro input used for progression has source owner, field path, unit, time basis, missing-value semantics, provenance and model/observation classification; disputed formulas are accepted or excluded.
- [ ] **Phase 4A:** Android 9 packaged WebView instrumentation actually executes the National Accounts test; test count is non-zero, zero failures and zero skipped tests; all existing p95 synchronous CPU, maximum synchronous segment, frame count and maximum frame-gap assertions pass; no waiver substitutes for measurement.
- [ ] **Physical-device QA:** at least the supported low-memory Android/WebView target passes startup, dirty-country accounting and unchanged-country cache checks without a frame drop or renderer crash.
- [ ] **PR #481:** country-scoped FX / Government Banking synchronization passes exact-head Finance, Ministry and regression checks, then merges.
- [ ] **Authority lock:** Finance remains the sole cash/fiscal writer; Resource Industrial remains the physical output writer; Global Trade remains the settlement writer; FX remains the currency-conversion authority; National Accounts remains read-only until all source-ledger coverage is complete.

After those gates close, implement in this order:

1. **Sector ledger coverage:** add missing, append-only, idempotent household/firm/government/external journal sources through their owning systems. Every posting has country, actor, account, amount, currency, turn/period, source event, counter-entry and settlement/correlation ID. Do not backfill by inventing transactions.
2. **Stock-flow reconciliation:** build account identities and opening/closing stocks per currency/resource-unit; reconcile period flows and preserve explicit partial/unobserved results.
3. **GDP approaches:** derive production, expenditure and income from the same committed journal window. Publish GDP only if all three approaches reconcile for the same period/currency and the accepted valuation basis.
4. **Policy agents:** connect Government and Central Bank actions to the owning Finance / monetary systems. Start with bounded, versioned rules; do not add a second treasury, debt, money-supply or FX authority.
5. **Shock and replay harness:** inject seeded, timestamped shocks through the event queue; persist seed, event sequence, rule/model versions and checkpoints; prove save/load/replay equality.
6. **Scale profile:** use existing scheduler budgets and country tiers; measure dirty vs unchanged country cost on low-end WebView; no optimisation may change accounting outputs.
7. **UI only after engine acceptance:** expose GDP with accounting status, inflation, unemployment, fiscal balances and FX with source period, currency, provenance and `MODELLED` / `OBSERVED` / `UNOBSERVED` labels.

**Exit rule:** numerical reconciliation, deterministic replay, and measured mobile budget all pass on the same versioned scenario before the next Phase 5 layer is enabled.

## 8. Source files audited

- `economy_global_profiles_v1.json` — historical baseline registry and coverage metadata.
- `npc_national_macro_economy_rules_v1.json` — versioned macro source, missing-value, scheduler and progression rules.
- `omega_npc_national_macro_economy_runtime_v1.js` — baseline/live evidence, output/trade/diplomacy signals, progression and checkpoint.
- `omega_national_accounts_runtime_v1.js` / `national_accounts_rules_v1.json` — read-only Treasury, goods and GDP reconciliation.
- `omega_finance_ministry_runtime_v1.js` — Finance/Treasury authority and scheduled fiscal progression.
- `omega_macro_stability_runtime_v1.js` — stability signals and automatic stabilizer policy.
- `omega_economic_transmission_runtime_v1.js` — CPI, producer-cost, real-GDP and household purchasing-power indices.
- `omega_forex_monetary_engine_v1.js` — currency registry, rates and Government Banking FX projection.
- `omega_global_trade_system.js` — accepted/settled trade and country import/export ledgers.
- `omega_resource_industrial_network_v1.js` / `omega_resource_economy_runtime_v2.js` — committed resource/factory output and stock movement.
- `omega_world_simulation_scheduler_v1.js` — bounded country/event scheduling, priority order and cooperative yielding.

**Audit conclusion:** the repository has a useful, bounded macro projection and a read-only accounting foundation. It does not yet satisfy the Phase 5 description of a complete sectoral stock-flow economy. The correct implementation now is to lock evidence semantics and the quality gates, then add missing ledgers only through their existing domain owners. Do not ship a second economic engine or promote a projection to GDP.
