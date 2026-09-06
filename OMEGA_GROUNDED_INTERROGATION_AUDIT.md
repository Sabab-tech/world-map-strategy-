# OMEGA Grounded Interrogation Audit

## Problem verified on baseline

The minister interrogation UI could classify a resource question, but the final response path could still be supplied by the legacy cognitive speech generator. That generator contains a mine/resource response template which can emit a country label, mine count, capacity language, confidence and macro impact without an authoritative queried record.

The observed failure mode is therefore not merely "bad wording". It is an authority-routing failure:

`PLAYER QUERY -> SEMANTIC/COGNITIVE ROUTER -> LEGACY RESPONSE TEMPLATE -> UI`

instead of:

`PLAYER QUERY -> LANGUAGE NORMALIZATION -> COUNTRY RESOLUTION -> RESOURCE RESOLUTION -> INTENT -> DATA RECORD LOOKUP -> EVIDENCE -> ANSWER CONTRACT -> UI`

## Canonical factual path after this change

`interrogation-input`
→ `OmegaUniversalAIRuntime`
→ `OmegaGroundedQueryEngine`
→ runtime datasets
→ structured answer contract
→ `omega-ai-answer-text`

For resource/country factual queries, this path bypasses Gemini/server synthesis and the legacy cognitive speech response generator.

## Current structured stages

### 1. Language normalization
Unicode normalization, punctuation normalization and whitespace normalization are performed before matching.

### 2. Country resolution
Explicit country text is resolved first. Active UI country is used only when the question has no explicit country. An explicit `India` therefore cannot silently inherit the active `Bangladesh` context.

### 3. Resource resolution
Resource names are resolved against runtime resource metadata plus bounded language aliases. Resource identity is separate from mine/deposit/field/facility terminology.

### 4. Intent / operation resolution
Implemented deterministic operation families include:

- `QUANTITY`
- `RESERVE`
- `PRODUCTION`
- `CONSUMPTION`
- `IMPORT`
- `EXPORT`
- `PRICE`
- `CAPACITY`
- `COUNT_MINE`
- `COUNT_DEPOSIT`
- `COUNT_FIELD`
- `COUNT_FACILITY`
- `LOCATE_*`

### 5. Data retrieval
Country-resource records are searched inside the supplied runtime datasets. Numeric answers are emitted only when a matching data field exists.

### 6. Epistemic answer state
The executor distinguishes:

- `KNOWN`
- `ZERO`
- `UNKNOWN`
- `UNRESOLVED`
- `AMBIGUOUS`
- `UNSUPPORTED`

No numeric value is generated for `UNKNOWN`.

### 7. Evidence
Every returned direct fact carries the matched record path and the operation/metric used to obtain it.

### 8. Presentation
The UI receives sections for direct answer, facts, data record and uncertainty. Factual queries do not receive unrelated ministerial recommendations or strategic speech.

## Existing language vocabulary on baseline

`offline_language_vocabulary.json` is a language-source file rather than a world-fact database. It has separate English and Bengali sections. Each language currently contains `question`, `operators`, `assets`, `attributes`, and `pronouns` groups. It also contains morphology and a semantic-policy section.

The broader offline semantic brain also has phrase lists and part-of-speech groupings in JavaScript. That means vocabulary is currently split across a data vocabulary file and runtime code. This remains a consolidation target.

## Existing cognitive machinery that still exists

`omega_cognitive_engine.js` still contains a large cognitive/strategy subsystem including provenance objects, formulas, ontology handling, causal/decision structures and minister cognition. It must not be treated as the factual source for direct resource quantities until its data authority is aligned with the grounded contract.

`offline_query_engine.js` and `offline_semantic_brain.js` remain useful subsystems, but the new factual owner deliberately does not let their legacy answer formatting override the grounded record lookup.

## Remaining architectural gaps

### A. 18-resource master registry
The repository currently contains multiple resource universes. A single authoritative 18-resource registry still needs to be explicitly locked. This change does not invent the missing identities.

### B. Full world-state schema
Country/resource numeric records are heterogeneous across files. A normalized world-state adapter is still required so reserve, production, consumption, stock, capacity and trade metrics have stable contracts.

### C. Entity ontology completeness
Geological entity classes are present in vocabulary and code, but country-resource entity datasets are not yet normalized into one authoritative mine/deposit/field/facility registry.

### D. Supplier ranking
Trade-risk, transport, contract, price, sanctions, currency, political and concentration dimensions need a unified data-backed supplier model before supplier recommendations can be called authoritative.

### E. FACT vs CALCULATION vs INFERENCE vs RECOMMENDATION
The grounded resource path currently prioritizes direct facts. The next decision layer should preserve separate answer types so calculations and recommendations cannot overwrite facts.

### F. Minister decision layer
Minister resource exposure/objectives/policy/risk/dependency/priorities exist conceptually in the project, but their resource-state inputs must be bound to the same canonical resource and world-state contracts before minister recommendations can be trusted.

## Regression rules

1. An explicit country must override active UI country context.
2. An unresolved country must never default to Bangladesh.
3. An unresolved resource must never be assigned a fabricated resource identity.
4. A missing quantity must return `UNKNOWN`, not zero and not an invented number.
5. Factual resource answers must not contain legacy canned phrases such as `Macro Impact`, `Central sovereign resource zone active`, or fabricated confidence percentages.
6. A strategic recommendation must never appear in a direct factual count/quantity answer unless the user explicitly asks for recommendation/strategy.

## Current implementation scope

This repair intentionally fixes the authority-routing problem first. It does not claim that every one of the long-term 18-resource, world-state, industrial, trade, security, minister and simulation capabilities is now fully data-backed. Those capabilities still require their own contracts and evidence adapters.
