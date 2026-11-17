# OMEGA NPC National Economy — Phase 1 Architecture & Data Ownership Audit

**Audit baseline:** `main` at `0344b0c88e327404deb773f2c0d5952d0cf60ae4`  
**Audit date:** 17 November 2026  
**Status:** Phase 1 evidence and ownership audit complete; macro-progression design remains gated by the risks below.

## 1. Executive finding

OMEGA already has the first NPC macro-economy runtime slice. PR #477 added a deterministic, bounded country checkpoint handler that captures source-backed baseline metrics and live economic activity. It is registered with the existing World Simulation Scheduler and persists through the Economy ministry's existing state transaction.

That runtime is an **evidence checkpoint**, not a complete national macro-economy simulator. It does not independently calculate GDP growth, national output value, inflation changes, employment changes, or industrial output. The next implementation must reuse the existing financial-transmission, Finance, project, market, trade and identity authorities rather than create parallel ledgers.

**Do not treat this audit as approval to create synthetic GDP, physical inventory, cash, shipments, deposits, factory output, or settled trade.**

## 2. Country scope and data coverage

The game runtime has multiple valid country identity scopes. They are not interchangeable.

| Dataset / authority | Verified scope | Correct use |
| --- | ---: | --- |
| `minister_country_roster_manifest_v1.json` | 197 ISO3 identities | Canonical core-game country roster for the NPC macro handler |
| `countries.json` | 249 country / territory identities | Map and canonical identity coverage; not the NPC macro execution roster |
| `economy_global_profiles_v1.json` | 249 profile rows | Country-level baseline and metric availability |
| Economic profiles with mapped economy data | 230 | Existing local economic baseline records |
| Economic profiles without mapped economy data | 19 | Unknown / unavailable baseline; must remain unknown |
| Population profiles with mapped data | 195 | Existing population baseline records |

The 197-country manifest states that its scope is the ISO3 identities in `resource_country_resource_context_index.json`, resolved through `countries.json`. This is the repository's **core-game roster contract**. It is not a separate legal-sovereignty classification field. Do not silently expand it to all 249 identities or remove roster members that have identity-only source coverage.

The economic profile registry declares a **2015 baseline**, sourced from `economy.json` and `population.json`. Its metadata explicitly says those local values have not been independently revalidated against current official statistical sources. The profile registry is therefore a game baseline with provenance, not a current official economic feed.

Where the country general-data runtime has a metric-level observation, the NPC checkpoint can prefer that value with its year, source, status, confidence and other available provenance. A missing value stays `null`; a missing metric is not zero.

## 3. Authoritative ownership matrix

| Domain | Existing authoritative owner | State / interface boundary | NPC macro runtime rule |
| --- | --- | --- | --- |
| Game-country roster | Country / Minister roster manifest | `minister_country_roster_manifest_v1.json` | Read the 197 ISO3 roster; do not create a second roster |
| Canonical identity | Canonical identity bridge and `countries.json` | Existing identity APIs | Resolve aliases to ISO3; do not rewrite identity data |
| Baseline economic observations | Country General Data and Finance profile registry | `Omega.CountryGeneralData.getCountryRecord`, `FinanceMinistry.getProfiles()` | Read only; preserve metric provenance and unknowns |
| NPC macro checkpoints | `Omega.NpcNationalMacroEconomy` | `economy.<country>.npcMacroEconomy` via Economy-owned Ministry State Transaction | Sole owner of checkpoint history and its source fingerprints |
| Financial transmission | `OmegaEconomicTransmissionRuntime` | `governmentBanking.economicTransmissionByCountry[ISO3]`; latest projection is also mirrored to the country's `economy.financialTransmission` | Consume as an explicitly modelled projection; never relabel as observed GDP |
| Treasury, budget and Finance ledger | Finance Ministry | `finance.<country>.omegaFinance` and Finance APIs | Read through Finance; never mirror or mutate cash/budget in macro state |
| Autonomous project lifecycle | Opponent Autonomy / existing project lifecycle | Country-scoped project registry | Read project state; proposals are not completed investments |
| Market prices and orders | Global Commodity Market | Existing market quote/order state | Do not interpret an offer or match as realized trade |
| International trade | Global Trade and its settlement pipeline | Country trade ledger and settlement handlers | Count only records whose settlement status is `SETTLED` |
| Resource extraction, logistics, inventory and factories | Existing resource / industrial runtimes | Their current country-scoped state and transaction handlers | Do not create an NPC duplicate resource, inventory or factory engine in this milestone |

The checkpoint's live signals deliberately record Finance ledger entry counts and Treasury-balance availability, not copies of Finance cash balances. The settled-trade counter filters the authoritative settlement ledger by `SETTLED`. These boundaries must remain intact.

## 4. Current NPC macro checkpoint contract

The merged runtime `omega_npc_national_macro_economy_runtime_v1.js` is configured by `npc_national_macro_economy_rules_v1.json`.

Its current contract is:

- One country checkpoint per committed game turn, keyed by canonical ISO3.
- Country eligibility comes from the 197-country core-game roster manifest.
- The selected player country is excluded from NPC automation.
- The handler is registered on the existing scheduler's `ACTIVE` and `MACRO` tiers; it creates no new clock, scheduler, worker or periodic timer.
- The command is committed through Ministry Interoperability and the Economy-owned Ministry State Transaction.
- The persistent path is `economy.<country>.npcMacroEconomy`.
- The checkpoint stores source baseline values with metric-level provenance, live activity values, fingerprints, comparable-unit deltas, bounded snapshots and progression-status metadata.
- Same-country / same-turn replay is idempotent. Snapshot history is limited by the versioned rules file.
- The handler performs no per-turn network request and does not become an owner of Finance, trade, market, resource or factory state.

The current `progressionStatus` is `EVIDENCE_CHECKPOINT_ONLY_NO_MACRO_PROGRESSION_FORMULA`. This is accurate and must not be changed until a calibrated model is implemented and tested.

## 5. Dependency and turn flow

```text
Canonical 197-country manifest
        |
        v
Existing country identity + Finance profile resolution
        |
        v
Existing World Simulation Scheduler (ACTIVE / MACRO)
        |
        v
NPC National Macro-Economy checkpoint handler
        |
        +---- Country General Data: metric observations and provenance (read-only)
        +---- Financial Transmission: derived model outputs (read-only)
        +---- Finance: ledger / Treasury availability (read-only)
        +---- Projects: actual lifecycle records (read-only)
        +---- Global Trade: SETTLED records only (read-only)
        |
        v
Ministry Interoperability
        |
        v
Economy-owned Ministry State Transaction
        |
        v
economy.<country>.npcMacroEconomy
```

Static HTML, server bootstrap and offline shell already load the rules and runtime. Preserve those integration points and the established script dependency order.

## 6. Critical architecture risk discovered

`omega_economic_transmission_runtime_v1.js` is already the owner of the game's modeled financial-transmission outputs, including CPI, real-wage and household purchasing-power indices, producer/import cost indices, a real-GDP **index proxy**, and economic-stability / pressure indices.

However, its current `OMEGA_SIMULATION_TURN_COMMITTED` listener calls `step()`, and `step()` iterates the complete Finance profile list before updating per-country transmission state. This full-profile pass is separate from the bounded ACTIVE / MACRO handler in the World Simulation Scheduler.

Consequences:

1. Adding another all-country progression loop would duplicate work and undermine the bounded-runtime objective.
2. The existing `realGDPIndex` is a modelled nominal-GDP-versus-CPI index, not a measurement of national real output or factory production.
3. The transmission engine uses explicit game-model assumptions when source fields are unavailable. Those assumptions must remain labelled as assumptions.
4. A future progression slice must not claim that the existing transmission index proves GDP growth or industrial output growth.

**Phase 2 prerequisite:** decide and test how the existing financial-transmission work is brought under a bounded execution contract, or otherwise measured and justified against the scheduler budget. Reuse its outputs and state owner; do not add a second copy of its formulas.

## 7. Gaps that remain open

| Capability | Current evidence | What is still required |
| --- | --- | --- |
| National GDP / output progression | Baseline GDP and a financial-transmission real-GDP index proxy | A calibrated, unit-consistent model that is distinct from the historical baseline and does not invent output values |
| Industrial development | Recorded production capacity and asset/project counts where available | A comparable country-local capacity baseline and evidence-backed changes; never infer physical output from an untyped capacity field |
| Investment | Finance ledger and project lifecycle evidence | Classify real completed project expenditure / commissioning without double-counting reservations, proposals or refunds |
| Fiscal position | Finance-owned modeled budget and live ledger | Read Finance projections and actual ledger events separately; no second Treasury |
| Inflation / stability | Existing financial-transmission model outputs | Reuse as labelled model outputs; preserve inputs, assumptions, units, turn and version |
| International trade | Global Trade settlement records | Use only completed settlements for realized trade values |
| Inventory / resources | Existing detailed player-country resource runtime | No NPC physical inventory until an authoritative, bounded aggregate source is designed |
| Global comparison UI | Existing country / Finance data surfaces | Add only after projection semantics, source status and unavailable values are stable |

PR #463 remains a separate, divergent implementation branch for autonomous project financing and sanction diplomacy. It is not a replacement for the macro-economy ledger and must not be merged wholesale without a fresh current-main review. Selective reuse, if needed, belongs in a later isolated change with its own Finance and diplomacy regression checks.

## 8. Phase 2 implementation constraints

1. Extend the existing NPC macro-economy checkpoint contract only after the transmission execution boundary is resolved.
2. Keep observed baseline metrics immutable and separate from `MODELLED_GAMEPLAY_ESTIMATE` outputs.
3. Every model output must identify formula/model version, input fingerprint, source authority, units, elapsed game turns and assumptions.
4. When a required input is absent or units are incomparable, return an explicit unavailable state; never substitute zero or fabricate a value.
5. Investment must derive from Finance-owned ledger entries and actual project lifecycle/commissioning evidence. A proposal, reservation or failed/refunded project is not completed investment.
6. Trade realized values must come from completed settlement evidence, not offers, bids, open requests or market quotes.
7. Do not invent new resource or factory identities, deposits, cash, inventory, shipment, capacity units or national statistical observations.
8. Use the existing game clock, country roster, ACTIVE / MACRO scheduler tiers, Ministry Interoperability and Economy state transaction. No second scheduler, clock, worker, timer or per-turn network fetch.
9. Keep per-country history bounded and make same-turn replay deterministic and idempotent.
10. No browser E2E project is required for this backend milestone. Use focused Node unit/integration/regression tests and existing runtime workflows; UI verification belongs to the later dashboard phase.

## 9. Phase 1 acceptance result

- [x] Verified the current `main` base and PR #477 merge commit.
- [x] Verified the core-game 197-country manifest separately from the 249 canonical country/territory registry.
- [x] Verified baseline profile coverage and the 2015 local-baseline provenance warning.
- [x] Mapped the owners of macro checkpoints, Finance, financial transmission, projects, market, trade and resource / industrial systems.
- [x] Recorded the current checkpoint state contract and existing bounded scheduler integration.
- [x] Identified the full-profile Financial Transmission turn pass as a bounded-execution prerequisite.
- [ ] Implement calibrated country macro progression and long-horizon behavioural effects (Phase 2; not claimed complete here).
- [ ] Add the Global Economy dashboard (Phase 4; not part of this audit).

## 10. Merged foundation reference

PR #477 — [bounded NPC macro-economy checkpoint runtime](https://github.com/Sabab-tech/world-map-strategy-/pull/477) merged as `0344b0c88e327404deb773f2c0d5952d0cf60ae4`. Its dedicated `OMEGA NPC National Macro-Economy Runtime` workflow passed on the PR head and on the merge commit. This verifies the checkpoint foundation; it does not verify macro progression or a long-duration economy simulation.
