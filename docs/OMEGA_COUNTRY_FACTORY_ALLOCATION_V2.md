# OMEGA Country Factory Allocation V2

## Purpose

This update fixes the uniform one-unit pattern in country starting factory profiles. The game still uses one shared canonical catalog of 21 factory types and exactly 197 core countries. The existing per-country starting-unit total is conserved except for three documented small-budget exceptions (JOR, SMR and SWZ), which each receive one additional simulated unit so every source-backed specialization can have a differentiated quantity. The 21-category catalog and Universal Materials umbrella quantity remain unchanged. Four previously conservative profiles now receive evidence-only specializations; when macro observations are not comparable, only documented categories are allocated and no macro-ranked category is invented.

This is a simulation allocation model. It is not a physical factory census and must never be displayed as the number of real facilities in a country.

## What changes

- Rebalance only profiles whose positive factory counts were all exactly one.
- Preserve all pre-existing differentiated country distributions.
- Keep every canonical factory type key in every country, including explicit zero values.
- Keep the existing specialization IDs and require every listed specialization to retain a positive allocation.
- Use comparable broad economic-sector observations to rank factory categories for countries without a specific specialization.
- Use the existing specialization map as a stronger priority signal for countries that already have one.
- Keep country totalStartingFactoryUnits unchanged for 194 countries. Jordan, San Marino and Eswatini each receive one additional game-only unit because their source-backed specialization count equalled the entire original starting budget.

## Inputs and evidence policy

The rebalancer reads the embedded economicSectorContext already attached to each country from the country general-data registry. Agriculture, industry and services shares are used only when at least two observations share the same comparison year. Manufacturing value added and agriculture employment are included only when their observation years are within three years of that comparison year. Missing and non-comparable values contribute no fabricated observation.

Existing specializations plus twelve source-evidence updates are represented in this pass. The eight earlier evidence updates remain: Ghana, Mongolia, Papua New Guinea, Botswana, Western Sahara, Nauru, North Korea and Somalia. Four additional macro-comparable profiles now have source-backed specialization: Costa Rica (medical devices), Serbia (automotive, metalworking, machinery and food), Lithuania (machinery and computer/electronics), and Uganda (agro-processing, light manufacturing, pharmaceuticals and vehicle assembly). Twenty-nine country specialization profiles now have source-backed mapping evidence (21 HIGH-confidence and 8 MODERATE-confidence); the other 79 existing specialization profiles remain explicitly game-modelled. A source can support the presence or mapping of a sector, but it does not justify translating the source's enterprises, export share or production output into a literal game factory count.

The current UNIDO INDSTAT establishment registry reports zero usable country-level observations in its latest refresh recorded on 2026-10-30. Its missing values are deliberately not used as zero and are not filled from GDP, reserves or other proxies. The resource-context registry is also excluded as a quantitative weight because many current entries are not sufficiently differentiated across countries.

## Allocation method

For profiles eligible for rebalancing:

1. Existing specialization types are selected first.
2. Remaining category slots are ranked using fixed game-model weights.
3. For comparable macro profiles, the active-category budget is the smaller of the country's starting units and the larger of its specialization count or max(2, round(totalStartingFactoryUnits × 0.64)). For a source-backed profile without comparable macro observations, the active set is exactly its evidenced specialization list.
4. Each selected category receives one unit first.
5. When a source-backed specialization set has enough remaining units, each of its specialization types receives one additional unit.
6. Remaining units are distributed proportionally by the category weights using the largest-remainder method. Ties use the stable canonical catalog order.

The raw score formulas use broad macro indicators as model weights, not as probability or percentage claims:

| Factory type | Model weight |
|---|---|
| Universal materials | 0.45 + 0.012 × industry share |
| Steel and alloys | 0.25 + 0.030 × industry share |
| Non-ferrous metals | 0.20 + 0.018 × industry share |
| Petrochemicals and polymers | 0.20 + 0.022 × industry share |
| Fertilizer and agrochemicals | 0.35 + 0.030 × agriculture share + 0.010 × agriculture employment |
| Industrial chemicals and gases | 0.18 + 0.012 × industry share |
| Cement and concrete | 0.45 + 0.015 × industry share |
| Glass and ceramics | 0.18 + 0.008 × industry share |
| Paper and packaging | 0.35 + 0.010 × agriculture share + 0.005 × services share |
| Food processing and cold chain | 0.80 + 0.045 × agriculture share + 0.015 × agriculture employment |
| Textile and garment | 0.40 + 0.015 × agriculture employment + 0.025 × manufacturing share |
| Industrial machinery and machine tools | 0.15 + 0.025 × manufacturing share |
| Grid and electrical equipment | 0.15 + 0.020 × manufacturing share |
| Electronics and semiconductor | 0.12 + 0.022 × manufacturing share |
| Battery and energy storage | 0.10 + 0.012 × manufacturing share |
| Vehicle, truck and bus assembly | 0.13 + 0.018 × manufacturing share |
| Shipbuilding and rail equipment | 0.08 + 0.008 × industry share |
| Aerospace and aircraft equipment | 0.05 + 0.009 × manufacturing share |
| Pharmaceuticals and medical supplies | 0.15 + 0.012 × manufacturing share + 0.002 × services share |
| Defence equipment | 0.08 + 0.005 × industry share |
| Recycling and waste processing | 0.15 + 0.010 × services share |

For comparable macro profiles, existing specializations multiply the corresponding category weight by 2.5 for game-modelled profiles and 2.8 for source-backed mapping profiles. These multipliers encode design priority, not an empirical facility ratio. A small existing-active-category prior keeps the old category selection from being discarded without reason. For source-backed profiles with no comparable macro observations, all evidenced categories receive equal relative priority and all remaining units are distributed only among those categories; these rows use the SOURCE_BACKED_SPECIALIZATION_ONLY basis.

## Expected coverage on the current baseline

- 147 profiles are evaluated by the allocation model; 143 have a changed uniform-count distribution, with twelve source-evidence refreshes applied across previously macro-only or conservative profiles.
- 49 already differentiated country distributions are preserved.
- 1 profile with neither comparable macro data nor a defensible factory specialization retains its former distribution.
- 1 country (Vatican City) remains an all-one profile because its documented economic activities are commercial, administrative and service-oriented rather than a supported manufacturing specialization; no factory category is invented.
- 4 source-backed profiles (Western Sahara, Nauru, North Korea and Somalia) use evidence-only allocation because their macro-sector observations are not comparable; their original country budgets are preserved.
- 3 small countries with source-backed specialization lists that consumed all original units receive one additional simulated unit each; the exception is stored in each country's diagnostics.
- Four newly specialized countries have their prior conservative data-gap allocation refreshed without changing their total starting units.
- Four newly specialized macro-comparable countries (Costa Rica, Serbia, Lithuania and Uganda) replace broad macro-only category selection with evidence-backed industry mappings while preserving their starting-unit budgets.

## Validation

The allocation generator has a check-only mode. CI validates:

- 197 country identities × 21 canonical factory types;
- non-negative integer category quantities;
- exact country total conservation;
- all existing specialization categories remain positive;
- no country has a missing or extra factory category;
- already differentiated country profiles remain unchanged;
- model output is deterministic and idempotent;
- the residual all-one profiles do not exceed the documented constraint threshold.

Run locally:

\`\`\`sh
node scripts/rebalance_country_factory_starting_baseline_v1.mjs
node --test test/omega_country_factory_allocation_v2.test.mjs
node scripts/rebalance_country_factory_starting_baseline_v1.mjs --check
\`\`\`

Final coverage contains 29 source-backed specialization countries (21 HIGH-confidence and 8 MODERATE-confidence), 79 game-modelled specialization countries, 88 broad macro-only countries and 1 deliberately preserved incomparable profile. Four countries use the SOURCE_BACKED_SPECIALIZATION_ONLY allocation basis. The world game allocation is 1,592 units, up from 1,589 solely because of the three recorded one-unit exceptions. This is still not a real-world factory census. Obtaining reliable country-by-country establishment data remains a separate data-ingestion task.
