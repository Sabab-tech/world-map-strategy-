# OMEGA LANGUAGE SYSTEM — Batch 01 Deep Semantic Audit Report

**Project:** Global Supreme Commander / World Map Strategy  
**Repository:** `Sabab-tech/world-map-strategy-`  
**Primary system:** `omega_language_system.js`  
**Audit scope:** Canonical game-language ontology, lexical depth, morphology, grammar, semantics, runtime resolution, execution boundary, source integration, regression risk, and roadmap toward the 4,500-concept target.  
**Audit basis:** Current `main` branch files and the language/runtime contracts visible in the repository.

---

## 1. Executive Verdict

### Current verdict: **SEMANTIC FOUNDATION = STRONG, LANGUAGE SYSTEM = NOT YET DEEP ENOUGH FOR 4,500-CONCEPT PRODUCTION MATURITY**

Batch 01 is no longer a superficial word-list. The current `omega_language_system.js` contains a consolidated ontology, bilingual lexical entries, semantic roles, variable compatibility, entity compatibility, action compatibility, relations, construction patterns, paraphrase families, runtime-resolution contracts, grammar metadata, ambiguity policy, and a capability boundary. The runtime also exposes canonical lookup, parsing, action-frame generation, reasoning dispatch, event requests, bounded phrase learning, diagnostics, and context synchronization. fileciteturn5file0 fileciteturn13file0

However, the implementation is still better described as a **deep semantic seed layer** than as the finished language intelligence architecture implied by the 4,500-concept target. The largest limitation is not the number 12 itself. The limitation is that the current 12 anchors do not yet form a sufficiently expressive, typed, compositional semantic graph capable of supporting broad natural-language variation, multi-step intent composition, causality, temporal scope, quantification, negation, conditional policy language, comparison, uncertainty, discourse context, and robust Bengali-English grammatical realization across the entire strategy domain.

The repository itself makes the intended scale explicit: 4,500 canonical concepts, partitioned into 3,200 core game language concepts, 800 advanced strategy concepts, and 500 grammar/discourse/command concepts. The domain target sum is intentionally larger than 4,500, which indicates domain allocation is a capacity planning budget rather than a literal unique-concept count. The report therefore treats **concept IDs as the only canonical countable unit**. Synonyms, aliases, inflections, phrase patterns, or bilingual forms do not inflate the concept total.

### High-level scorecard

| Area | Current assessment | Target for production maturity |
|---|---:|---:|
| Canonical identity model | 8.5/10 | 10/10 |
| Bilingual lexical foundation | 7.5/10 | 10/10 |
| Morphology | 6.5/10 | 9.5/10 |
| Grammar representation | 6.5/10 | 9.5/10 |
| Semantic relations | 8/10 | 10/10 |
| Action semantics | 7.5/10 | 10/10 |
| Runtime resolution | 7.5/10 | 10/10 |
| Entity grounding boundary | 9/10 | 10/10 |
| World-fact separation | 9/10 | 10/10 |
| Compositional meaning | 5.5/10 | 10/10 |
| Causality / dependency semantics | 5/10 | 10/10 |
| Temporal / modal / conditional language | 4.5/10 | 9.5/10 |
| Discourse / conversation semantics | 4.5/10 | 9.5/10 |
| Bengali robustness | 5.5/10 | 9.5/10 |
| Regression / test alignment | 6/10 | 10/10 |
| Overall readiness | **~6.8/10** | **9.5+/10** |

**Bottom line:** Batch 01 is a good architectural lock for the next expansion cycle, but it is not yet a language-complete intelligence layer. Calling it “fully ready” would be premature.

---

## 2. What Has Actually Been Achieved

The current file establishes a single canonical language runtime instead of treating language as a pile of unrelated aliases. The ontology explicitly defines a `concept_id` as the only canonical identity and treats surface forms as realizations. That distinction is fundamental because otherwise a system with 4,500 concepts quickly degenerates into 20,000 strings pretending to be knowledge.

The system currently embeds the game-language ontology and bridge inside `omega_language_system.js`. It also declares a source manifest for the existing offline vocabulary, lexicon, semantic knowledge, source inventory, semantic brain, query engine, reasoning dispatcher, cognitive engine, and integrity layer. The embedded boundary is explicitly intended to keep world-state facts in authoritative datasets while allowing the language layer to describe semantic possibilities and operational compatibility. fileciteturn13file0

The source vocabulary also has a strong separation-of-concerns policy: world entities must come from runtime datasets, semantic questions and attributes are vocabulary-driven, and country/resource/asset/answer-fact catalogs are explicitly prohibited from being hardcoded in the language source. fileciteturn10file0

That is the correct direction.

---

## 3. Batch 01: Deep Semantic Examination

### 3.1 `STATE_VARIABLE`

This is the correct semantic root for measurable and changeable simulation state. It is compatible with production, price, demand, supply, capacity, GDP, reserve, readiness, and stability, and it is linked semantically to the more specific state concepts. The runtime contract resolves it through a canonical variable registry instead of manufacturing facts. fileciteturn5file0

#### What is strong

- It distinguishes **state identity** from any particular world entity.
- It creates a reusable semantic anchor for many simulation variables.
- It supports analysis actions such as compare, forecast, analyze, maintain, increase, and decrease.
- It creates an explicit hierarchy instead of treating all state words as synonyms.

#### What is still missing

A mature state-variable ontology needs explicit typed dimensions:

- scalar vs rate vs ratio vs index vs stock vs flow
- instantaneous vs period-based value
- absolute vs normalized value
- local vs national vs global scope
- current vs baseline vs target vs forecast
- nominal vs real value
- observed vs estimated vs projected value
- unit-bearing vs unitless variable

At present the concept contract can store these ideas, but Batch 01 does not yet encode them as a standardized semantic type system. That becomes important when the user asks things like:

> “এই বছরের উৎপাদন গত বছরের তুলনায় ১২% বেশি হলে প্রকৃত বৃদ্ধি কত?”

The language layer must be able to represent comparison, timeframe, percentage, baseline, and measurement semantics before the reasoning layer can reliably answer.

---

### 3.2 `RESOURCE_PRODUCTION`

This is one of the strongest seeds. Production is explicitly connected to resource, quantity, rate, capacity, and directional change, and the runtime refuses to infer a numeric value without game data. fileciteturn5file0

The important conceptual distinction is:

**RESOURCE → PRODUCTION → QUANTITY → RATE → CAPACITY → CHANGE**

That is much more useful than a dictionary entry for “production”.

#### Critical next step

Production should be decomposed into a richer semantic neighborhood:

`production`  
→ gross production  
→ net production  
→ domestic production  
→ industrial production  
→ extraction  
→ processing output  
→ refinery throughput  
→ production rate  
→ daily production  
→ annual production  
→ productive capacity  
→ utilization rate  
→ downtime  
→ recovery factor  
→ efficiency  
→ yield  
→ loss  
→ waste  
→ by-product  
→ bottleneck  
→ marginal output

These must become **distinct concepts where their semantic identity differs**, not merely aliases.

---

### 3.3 `ACTION_INCREASE`

The current action concept is correctly modeled as an operator with semantic roles for actor, target, amount, unit, time horizon, scope, constraint, and condition. The execution boundary correctly states that vocabulary alone does not grant permission to perform an operation. fileciteturn5file0

This is a major architectural improvement because the same action can operate on production, capacity, exports, GDP, energy, population, demand, supply, or price depending on the game capability model.

#### What it still needs

A production-grade action ontology needs at least:

- **change type:** increase-by / increase-to / increase-rate / increase-share
- **magnitude semantics:** absolute / relative / percentage / percentage-point
- **duration:** immediate / temporary / permanent / until-condition
- **agency:** player / ministry / country / facility / AI
- **preconditions:** budget, technology, capacity, diplomacy, law, ownership
- **side effects:** expected, possible, prohibited
- **target cardinality:** one / many / all / category
- **scope:** facility / region / country / alliance / world
- **execution phase:** requested / authorized / scheduled / executing / completed / failed
- **reversibility:** reversible / partially reversible / irreversible

Without these, “increase” remains a solid command primitive rather than a full policy operator.

---

### 3.4 `ACTION_DECREASE`

The negative-direction action is correctly separated from increase, and the runtime explicitly prevents arbitrary targets. This is important for safety and model integrity because a natural-language verb should not magically gain permission over any field in the simulation. fileciteturn5file0

The key future distinction is that “decrease” is not always the same semantic operation:

- reduce quantity
- cut budget
- lower rate
- shrink capacity
- suppress demand
- reduce dependency
- lower exposure
- reduce emissions
- phase down
- ration
- restrict access
- halt production

These are behaviorally different and should not collapse into one generic operator.

---

### 3.5 `RESOURCE`

The root resource concept is architecturally correct because actual resource entities remain external to the language layer. The ontology describes resource semantics while authoritative world data determines which actual resources exist. fileciteturn5file0

#### Required expansion tree

A mature resource ontology should distinguish at minimum:

**Identity** → raw resource / processed material / finished good / intermediate input  
**Physical form** → solid / liquid / gas / energy / biological  
**Economic role** → input / output / strategic good / consumer good  
**State** → reserve / deposit / inventory / stockpile / flow  
**Process** → extraction / processing / refining / conversion / transport  
**Market** → demand / supply / price / contract / trade flow  
**Geopolitics** → dependence / concentration / chokepoint / substitute / vulnerability

The current seed starts this graph, but it does not yet finish it.

---

### 3.6 `CAPACITY`

This concept is particularly important because it bridges state variables, production facilities, investment, technology, and upgrades. The runtime explicitly avoids equating capacity with actual production. fileciteturn5file0

That distinction should be enforced throughout the future ontology:

`CAPACITY ≠ PRODUCTION ≠ OUTPUT ≠ UTILIZATION`

A useful semantic model should support relations such as:

`capacity → constrained_by → infrastructure`  
`capacity → bounded_by → technology`  
`capacity → changed_by → investment`  
`production → limited_by → capacity`  
`utilization → measures → production/capacity`

This will become a core bridge into the production-chain simulation.

---

### 3.7 `DEMAND`

The current concept links demand to price, supply, import, production, population, and consumption while correctly refusing to infer causal numeric relationships from the vocabulary alone. fileciteturn5file0

That boundary is correct, but the semantic layer needs more structure around:

- latent vs realized demand
- total demand vs per-capita demand
- domestic vs external demand
- elastic vs inelastic demand
- strategic vs ordinary demand
- demand shock
- seasonal demand
- suppressed demand
- unmet demand
- demand forecast

The future model should also represent the difference between:

**“Demand is 100”** and **“Demand increased by 10%.”**

The first is a state assertion. The second is a temporal change statement.

---

### 3.8 `SUPPLY`

The current concept correctly connects supply with production, imports, exports, stockpile, capacity, and demand. It also explicitly avoids equating supply with production. fileciteturn5file0

This distinction is essential for the simulator because supply may change even when production does not, for example through imports, stockpiles, transport disruption, or export restrictions.

The next semantic stage should add:

`available_supply`  
`deliverable_supply`  
`market_supply`  
`domestic_supply`  
`import_supply`  
`effective_supply`  
`supply_shortage`  
`supply_surplus`  
`supply_gap`

Again, these are not stylistic aliases. They represent different semantic states.

---

### 3.9 `PRICE`

The explicit distinction between price and cost is a good design choice. Price is linked to demand and supply but is not defined as their simple synonym. fileciteturn5file0

The next layer needs a semantic market-price taxonomy:

- spot price
- contract price
- market price
- producer price
- import price
- export price
- wholesale price
- retail price
- nominal price
- real price
- indexed price
- administered price
- premium
- discount

The currency and unit semantics should remain data-driven.

---

### 3.10 `COUNTRY`

This is correctly treated as an **entity type**, not as a country catalog. The current runtime requires authoritative country data and refuses to turn the language layer into a database of countries. fileciteturn5file0

That is exactly the right boundary for the project’s broader architecture.

The ontology should eventually distinguish:

`COUNTRY`  
→ sovereign state  
→ territory  
→ government  
→ market  
→ polity  
→ alliance member  
→ trading partner  
→ military actor

Those are not interchangeable.

The language system also needs explicit entity-scope semantics so that “দেশ”, “সরকার”, “রাষ্ট্র”, “বাংলাদেশের অর্থনীতি”, and “বাংলাদেশের সরকার” can resolve to different entity types even when they refer to the same geopolitical context.

---

### 3.11 `PRODUCTION_FACILITY`

The facility concept creates a critical bridge between physical infrastructure and economic state. It is connected to production, capacity, investment, upgrading, country location, and resource output. fileciteturn5file0

The future expansion should distinguish:

- mine
- well
- field
- refinery
- smelter
- power plant
- factory
- processing plant
- storage terminal
- pipeline hub
- port facility
- distribution node
- grid node

Actual facilities remain data entities; the ontology defines the semantic classes and relations.

---

### 3.12 `INVESTMENT`

Investment is the correct first mechanism/process concept because it allows the language layer to represent policy and intervention rather than merely describe state.

The current semantic frame links investment to capital, budget, capacity, production, development, actor, amount, unit, time horizon, purpose, constraint, and funding source. The numeric effect is intentionally delegated to game data. fileciteturn5file0

The next level must distinguish:

- fixed investment
- public investment
- private investment
- foreign investment
- capacity expansion investment
- maintenance investment
- strategic investment
- research investment
- infrastructure investment
- emergency investment
- sunk investment
- committed vs executed investment
- investment pipeline
- investment return
- opportunity cost

That is where “language understanding” starts becoming “strategy understanding.”

---

## 4. The Most Important Missing Layer: Compositional Semantics

The current system has concepts and patterns, but the 4,500-concept objective ultimately requires a compositional semantic grammar.

A mature parse should be able to transform a sentence into a typed frame similar to:

```text
INTENT: POLICY_ACTION
ACTOR: PLAYER
ACTION: INCREASE
TARGET_ENTITY: COUNTRY_ID
TARGET_VARIABLE: RESOURCE_PRODUCTION
TARGET_RESOURCE: RESOURCE_ID
AMOUNT: 15
AMOUNT_TYPE: RELATIVE_PERCENT
TIME_HORIZON: 24_MONTHS
CONDITION: IF_DEMAND > THRESHOLD
CONSTRAINT: BUDGET <= LIMIT
PURPOSE: REDUCE_IMPORT_DEPENDENCY
CONFIDENCE: ...
EVIDENCE_REQUIRED: true
EXECUTABLE: capability_registry.decision
```

The existing action roles are a good beginning, but the semantic graph must become capable of representing nested and coordinated clauses.

For example:

> “আগামী দুই বছরে গ্যাস উৎপাদন ১৫% বাড়াও, কিন্তু বাজেট সীমা অতিক্রম করো না।”

This is not one concept. It is:

1. time scope
2. target resource
3. target variable
4. positive change
5. percentage amount
6. duration
7. conjunction
8. negative constraint
9. budget state variable
10. threshold relation
11. policy execution request

The language layer needs to preserve all of that before reasoning begins.

---

## 5. Grammar Depth: Current State vs Required State

The current ontology declares Universal Dependencies-compatible feature names and a compact dependency inventory, including person, number, case, tense, aspect, mood, voice, polarity, degree, verb form, and relations such as subject, object, oblique, adverbial modifier, auxiliary, marker, conjunction, and nominal modifier. fileciteturn5file0

That is a sound metadata layer.

It is not yet a full grammar engine.

### Bengali needs additional explicit treatment

The Bengali side should eventually encode:

- case-like postpositional relations
- honorificity
- person-sensitive verb agreement behavior where relevant
- tense/aspect/mood combinations
- participles
- verbal nouns
- causatives
- passive constructions
- negation scope
- compound verbs
- light-verb constructions
- reduplication where semantically relevant
- classifier/count expressions
- numeral interpretation
- postposition attachment
- colloquial spellings
- orthographic normalization

The current suffix lists are useful but far from sufficient for production-grade Bengali morphology. fileciteturn10file0

A system intended to understand real player language cannot assume that users will politely type textbook Bengali. Humanity has never respected such agreements.

---

## 6. Lexical Depth Is Not Concept Depth

The source inventory shows an earlier lexical inventory with **17 concepts, 332 raw surface entries, and 226 unique normalized surface entries**. It also includes concepts such as GDP growth, inflation, foreign exchange, oil, gas, drilling, refinery, import, tariff, “how”, necessity modality, and a country-specific entity record. fileciteturn7file0

That inventory is valuable historical source material, but the current canonical Batch 01 has intentionally reduced the semantic seed set to 12 deeper anchors.

This is not necessarily a loss. It is a sign that the architecture has begun shifting from **surface inventory** toward **canonical ontology**.

However, the migration is not complete.

The source inventory contains semantic content that should not disappear merely because the new architecture uses different canonical IDs. Concepts such as inflation, GDP, foreign exchange, tariff, drilling, refinery, import, modality, and question operators should be systematically mapped into the new ontology as canonical descendants, operators, or discourse concepts.

A migration matrix is therefore required:

`legacy_concept_id → canonical_concept_id → relation type → migration status → lexical preservation status`

Without that matrix, the project risks quietly losing useful vocabulary during ontology consolidation.

---

## 7. Runtime Architecture Review

The current runtime exposes a useful public API around loading, configuration, source access, concept lookup, analysis, parsing, resolution, intent execution, realization, running, reasoning dispatch, event creation, phrase learning, candidate retrieval, diagnostics, validation, ontology access, and context synchronization. fileciteturn15file2

This is a much stronger foundation than a simple dictionary interface.

### Major strength: execution boundary

The language system explicitly maintains the rule:

**semantic compatibility ≠ execution permission**

The event request path delegates actual capability to the game capability/event engine. This is exactly the correct boundary because a parser should never be allowed to invent capabilities merely because it recognized a verb. fileciteturn5file0

### Major architectural risk

The runtime source manifest declares the cognitive engine and AI integrity layer as required architectural dependencies, but `loadSources()` directly loads only the semantic brain, query engine, and reasoning dispatcher. The cognitive engine and integrity layer are listed as source dependencies rather than actively loaded in the same pathway. fileciteturn13file0

This may be intentional because other boot layers load them. It must, however, be documented and tested as an explicit integration contract. A declared dependency that is not loaded by the owner is a classic source of “works on one boot sequence, fails on another boot sequence” bugs.

---

## 8. Context Synchronization

The universal AI runtime explicitly synchronizes live country, minister, ministry, and game-state context into the language system before semantic parsing. This is a valuable improvement because semantic interpretation without current game context is insufficient for a strategy game. fileciteturn9file0

The correct architecture is now conceptually:

**Player language**  
→ **Language normalization**  
→ **Canonical concepts**  
→ **Semantic frame**  
→ **Live context binding**  
→ **World-state evidence**  
→ **Capability check**  
→ **Reasoning**  
→ **Answer / event request**

That sequence should become a formally documented invariant.

---

## 9. Regression and Test-System Findings

There is an important test-alignment issue in the repository.

The current `scripts/validate_game_language_ontology.cjs` has already been updated to expect the current consolidated ontology contract: schema `1.1.0`, 12 seed concepts, 4,500 canonical target, 17 domains, domain-target total 5,250, and bridge version `1.0.2`. fileciteturn16file0

However, `scripts/test_omega_language_hybrid.cjs` still asserts an older ontology contract: schema `1.0.0`, only 3 seed concepts, 17 domains totaling 5,200, bridge `1.0.1`, and diagnostics version `1.2.0`. It also expects older parse behavior for example questions. fileciteturn17file0

This is a real regression risk because `package.json` still includes that hybrid test in the normal `test` and `test:semantic` scripts. fileciteturn18file0

### Consequence

A repository can contain a newer validator and a stale regression test at the same time. This is more dangerous than an obvious syntax error because it creates uncertainty about what “passing” means.

### Required action

The hybrid test should be migrated to the current canonical contract, not deleted. The test suite should validate the new behavior rather than preserve obsolete expectations.

The minimum assertions should cover:

- 12 Batch 01 canonical concepts
- canonical concept uniqueness
- bilingual lexical availability
- relation integrity
- grammar feature integrity
- ambiguity threshold behavior
- unresolved entity behavior
- unknown-fact policy
- event request capability boundary
- bounded learning confidence threshold
- context synchronization
- legacy vocabulary preservation
- semantic brain bridge behavior
- query-engine integration

---

## 10. Required Concept-Graph Architecture for the 4,500 Target

The target should not be pursued by simply adding 4,488 more dictionary records.

The 4,500 concepts should form a structured semantic graph.

### Recommended concept strata

**Tier A — Core state ontology**

Variables, measurements, quantities, units, rates, stocks, flows, capacities, balances, ratios, indexes.

**Tier B — Economic ontology**

GDP, inflation, employment, monetary conditions, fiscal policy, trade balance, exchange rate, budget, debt, investment, consumption, productivity.

**Tier C — Resource ontology**

Resource identity, reserve, deposit, extraction, production, processing, refining, storage, transport, substitution, scarcity, strategic importance.

**Tier D — Infrastructure ontology**

Facilities, networks, logistics nodes, pipelines, ports, grids, roads, rail, storage, chokepoints, maintenance, utilization.

**Tier E — Military ontology**

Forces, readiness, logistics, equipment, production, deployment, posture, threat, deterrence, defense, procurement, mobilization.

**Tier F — Diplomacy and politics**

Relations, alliances, sanctions, treaties, negotiations, recognition, influence, legitimacy, government, ministries, political actors.

**Tier G — Society and population**

Population, labor, demographics, migration, welfare, education, health, public sentiment, inequality, cohesion, unrest.

**Tier H — Strategy and reasoning**

Cause, effect, trade-off, dependency, uncertainty, scenario, forecast, risk, opportunity, sensitivity, resilience, vulnerability, counterfactual.

**Tier I — Game command operators**

Start, stop, build, upgrade, allocate, import, export, negotiate, sanction, appoint, remove, prioritize, pause, resume, inspect.

**Tier J — Language-control and discourse**

Question operators, modality, negation, conditionals, comparisons, quantifiers, time expressions, discourse markers, correction, clarification, confirmation.

The architecture should then connect concepts with typed relations instead of a flat list.

---

## 11. Minimum Relationship Vocabulary

The relation system should be expanded beyond `child_of`, `related_to`, and basic compatibility.

Recommended typed relations:

- `is_a`
- `instance_of`
- `part_of`
- `contains`
- `measured_by`
- `measured_as`
- `has_unit`
- `has_rate`
- `has_capacity`
- `constrained_by`
- `depends_on`
- `causes`
- `contributes_to`
- `reduces`
- `increases`
- `substitutes_for`
- `competes_with`
- `requires`
- `produces`
- `consumes`
- `stores`
- `transports`
- `located_in`
- `owned_by`
- `controlled_by`
- `traded_as`
- `exported_to`
- `imported_from`
- `governed_by`
- `affected_by`
- `triggered_by`
- `precondition_of`
- `outcome_of`
- `alternative_to`
- `contrasts_with`
- `temporal_precedes`
- `temporal_overlaps`
- `conditional_on`

These should be typed and validated, not just stored as arbitrary strings.

---

## 12. Semantic Evidence and Epistemic States

The current unknown-fact policy is already correct: the language layer should not invent facts. The next step is to make evidence status first-class.

Recommended epistemic statuses:

- `OBSERVED`
- `AUTHORITATIVE`
- `CALCULATED`
- `DERIVED`
- `ESTIMATED`
- `FORECAST`
- `ASSUMED`
- `UNKNOWN`
- `CONFLICTED`
- `STALE`

Then an answer frame can represent not only “what is the value?” but also “how do we know it?”

This is particularly important for strategy answers. A forecast must never silently appear as a current fact, and a derived value must not masquerade as an authoritative dataset field.

---

## 13. Ambiguity Resolution Must Become Multi-Stage

The current canonical candidate logic uses exact and fuzzy surface matching with a confidence and second-best margin threshold. fileciteturn13file0

That is useful, but lexical similarity alone is not enough.

A mature resolution pipeline should be:

**surface candidate**  
→ **language candidate**  
→ **morphological candidate**  
→ **POS candidate**  
→ **semantic-domain candidate**  
→ **entity-type candidate**  
→ **context candidate**  
→ **variable compatibility**  
→ **action compatibility**  
→ **evidence availability**  
→ **final canonical resolution**

For example, “capacity” in a power-grid question should not resolve the same way as “capacity” in a refinery question merely because the word is identical.

---

## 14. Bengali-English Parity Requirement

The project is bilingual, but parity should not mean “same number of aliases in English and Bengali.”

True parity means:

- same canonical concept identity
- equivalent semantic roles
- equivalent action compatibility
- equivalent ambiguity behavior
- equivalent temporal interpretation
- equivalent negation handling
- equivalent number/quantity interpretation
- equivalent entity grounding
- equivalent confidence policy

The Bengali lexical data already covers the core vocabulary and question operators, but the morphology, colloquial variation, compound verbs, and clause-level grammar still need significant depth before the language system can claim robust natural Bengali command understanding. fileciteturn10file0

---

## 15. Recommended Batch Structure After Batch 01

Do not immediately create hundreds of disconnected concepts.

### Batch 02 — Measurement & Quantification

Quantity, amount, unit, rate, ratio, percentage, absolute change, relative change, average, median, minimum, maximum, threshold, range, variance, growth, decline, per-capita, total, subtotal, balance.

### Batch 03 — Time & Temporal Semantics

Current, previous, next, duration, deadline, annual, monthly, daily, before, after, during, until, since, over, projected, historical, scheduled, temporary, permanent.

### Batch 04 — Production Chain

Extraction, input, processing, conversion, intermediate, output, yield, efficiency, throughput, bottleneck, downtime, maintenance, utilization, storage, waste, by-product.

### Batch 05 — Market System

Demand, supply, price, cost, margin, shortage, surplus, market, contract, spot, premium, discount, price shock, elasticity, substitution.

### Batch 06 — Trade & Logistics

Import, export, tariff, quota, embargo, route, port, shipping, freight, customs, stockpile, transit, corridor, chokepoint, disruption.

### Batch 07 — Government & Policy

Budget, taxation, subsidy, regulation, legislation, spending, allocation, procurement, reform, nationalization, privatization, licensing.

### Batch 08 — Strategy & Causality

Cause, effect, driver, dependency, trade-off, risk, opportunity, vulnerability, resilience, sensitivity, scenario, counterfactual, second-order effect.

### Batch 09 — Military & Security

Readiness, mobilization, deployment, logistics, procurement, deterrence, threat, intelligence, defense capacity, industrial mobilization.

### Batch 10 — Diplomacy & Geopolitics

Alliance, treaty, sanction, negotiation, recognition, influence, relation, dispute, cooperation, escalation, de-escalation.

### Batch 11 — Population & Society

Population, workforce, migration, employment, welfare, education, inequality, cohesion, unrest, sentiment, demographic structure.

### Batch 12 — Language Control

Questions, negation, conditionals, modality, comparison, correction, clarification, uncertainty, emphasis, discourse markers, reference tracking.

---

## 16. Required Golden Rules for Future Expansion

### Rule 1 — Never count lexical surface forms as concepts

One canonical concept ID means one concept.

### Rule 2 — Never encode world facts in the language file

Countries, resources, facilities, numeric values, ownership, production quantities, prices, and minister identities stay in authoritative runtime datasets.

### Rule 3 — Never use synonyms to hide missing concepts

If two terms have different semantic behavior, they need different concept IDs.

### Rule 4 — Never allow vocabulary to grant capability

Parsing “build refinery” must not itself authorize refinery construction.

### Rule 5 — Never let a forecast masquerade as a fact

Evidence status is part of the semantic result.

### Rule 6 — Never let linguistic ambiguity silently become game state

Ambiguous target resolution must remain unresolved until context or explicit user disambiguation makes it safe.

### Rule 7 — Every concept must be executable at the semantic level

A concept is not complete merely because it has a lemma and aliases. It must have its semantic type, relations, roles, compatibility, grammar behavior, and runtime resolution contract.

### Rule 8 — Every batch must ship with tests

Ontology growth without regression tests is just accumulating future archaeology.

---

## 17. Completion Definition for a Concept

A concept should be considered **LOCKED** only when all of these are present:

1. canonical ID
2. domain
3. subdomain
4. semantic type
5. English lemma
6. Bengali lemma
7. English lexical variants
8. Bengali lexical variants
9. POS metadata
10. derivational family
11. morphological behavior
12. grammar features
13. semantic roles
14. compatible variables
15. compatible entity types
16. allowed semantic actions
17. typed relations
18. construction patterns
19. phrase patterns
20. paraphrase family
21. ambiguity notes
22. runtime resolution strategy
23. evidence requirements
24. capability boundary
25. regression tests

That should be the project’s actual definition of “deep concept”, not simply “it appears in JSON.”

---

## 18. Final Assessment

The present language architecture has crossed an important threshold. It is no longer merely a bilingual command dictionary. It has the beginnings of a canonical semantic runtime with explicit boundaries between language, world state, reasoning, and executable capability. The 12 Batch 01 concepts are materially deeper than their surface word count suggests. The repository also preserves the correct philosophy that authoritative world data must remain outside the language ontology. fileciteturn5file0 fileciteturn10file0

But the architecture should **not yet be declared complete**.

The decisive missing capability is compositional semantic depth. The system needs to understand how concepts combine into structured propositions, actions, conditions, comparisons, temporal statements, constraints, causal explanations, strategic trade-offs, and multi-clause commands. Bengali grammar and morphology also require a much deeper implementation than the current suffix-and-feature layer.

Most importantly, the project should now stop thinking of the remaining work as “adding thousands of words”. The real task is:

> **build a typed semantic graph of ~4,500 canonical game-language concepts, with bilingual lexical realization, compositional grammar, evidence-aware resolution, context binding, and strict execution boundaries.**

That is the architecture capable of supporting the game’s intended AI layer.

### Final readiness labels

**Batch 01 semantic design:** LOCKED FOUNDATION  
**Batch 01 lexical completeness:** PARTIAL  
**Grammar completeness:** NOT READY  
**Compositional semantics:** NOT READY  
**World-state separation:** READY  
**Capability boundary:** READY IN PRINCIPLE  
**Regression suite:** NEEDS MIGRATION  
**4,500-concept production target:** NOT YET READY  
**Next phase:** expand the ontology by semantic dependency order, not by alphabetical vocabulary collection.

---

## 19. Evidence Files Reviewed

- `omega_language_system.js` — canonical consolidated language runtime and embedded Batch 01 ontology. fileciteturn5file0
- `omega_game_language_source_inventory.json` — historical source inventory showing 17 source concepts, 332 raw surface entries, and 226 unique normalized surface entries. fileciteturn7file0
- `offline_language_vocabulary.json` — bilingual lexical source and semantic separation policy. fileciteturn10file0
- `omega_universal_ai_runtime.js` — live context bridge and language/runtime orchestration. fileciteturn9file0
- `scripts/validate_game_language_ontology.cjs` — updated canonical ontology validator. fileciteturn16file0
- `scripts/test_omega_language_hybrid.cjs` — existing hybrid regression test, currently carrying an older ontology contract. fileciteturn17file0
- `package.json` — test/build scripts showing the hybrid regression test remains part of the normal test path. fileciteturn18file0

---

**Audit conclusion:** The project has a credible semantic foundation. The next leap is not more aliases; it is a richer ontology graph, compositional grammar, evidence semantics, and end-to-end regression coverage.
