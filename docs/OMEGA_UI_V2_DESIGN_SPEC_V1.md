# OMEGA UI v2 — Full-Game Design, Navigation and Data Contract

**Document status:** UI-v2 implementation contract, initial PR-B work  
**Target:** Android 9 / low-memory WebView, offline-first  
**Preservation rule:** additive-only rollout; do not delete or overwrite legacy/gameplay files  
**Implementation namespace:** `omega_ui_v2/`

## 1. Product goals

OMEGA is a geopolitical strategy game, not a collection of unrelated dashboard pages. The world map stays central, every ministry uses a predictable layout, and real game actions remain owned by canonical runtimes. The new interface must be easy to scan on a small phone without concealing the data that makes the simulation meaningful.

- Premium geopolitical strategy visual style: deep navy/slate, readable warm ivory information surfaces, restrained brass/gold accents, clear typography and status labels.
- Mobile-first: validate at 360×800 and 390×844 CSS pixels, then 320–600 px widths, landscape and larger text. Suggested tokens are a 48–56 px compact top bar, 52–60 px bottom navigation, 12–16 px side gutters and 40–44 px touch controls.
- Offline-first: no boot-critical CDN, remote photos or web-font dependency. Prefer local licensed WebP photos; use lightweight local SVGs for control icons and data-driven vehicle illustrations.
- Performance: one primary vertical scroll region per screen, bounded render batches, lazy images, targeted updates and working Back/Close. No nested vertical scroll traps or full-app rerenders for one metric update.
- Truthfulness: unknown fields remain “Not recorded” or “Unavailable”; modeled game values are distinct from observations; a click or pending request is not a successful game-state mutation.
- Recovery: preserve the exact legacy baseline in a dedicated additive archive PR before implementing UI-v2 in this namespace.

## 2. Global shell and main navigation

### World Map
The map remains the central play surface. The compact header shows selected-country flag/name, game date/turn, and treasury only when sourced from live game state. Keep Search, Events, Pause/Speed and Settings in compact utility controls. Layers/filters reveal countries, resource sites, industrial sites, transport and event overlays only when enabled. Selecting a country opens a compact country sheet with sourced headline figures and links to Government, Country Details and Focus on Map. A selection must not fork a second source of truth.

### Main destinations
The bottom-level destinations are **Map**, **Government**, **Economy**, **Industry**, and **Reports**. Resource and police actions live in their domain context; adding a duplicate global “Mining” or “Recruit Police” entry point would create competing routes.

### Navigation invariants
- Government has exactly two top-level destination buttons: **Executive Ministry** and **All Ministries**.
- Country Overview is the default content inside Executive Ministry. It is never a third Government button or content on All Ministries.
- Global Back/Close restores the immediately previous view and preserves selected country, selected entity and active game session.
- A button must have one known route or canonical action. Unsupported actions are absent/disabled and explain why; they must not pretend to succeed.

## 3. Government screens

### Executive Ministry / Country Overview
The default screen uses the current country context. Render these sections in order:
1. National Snapshot: GDP, population, growth, inflation, unemployment, fiscal balance/debt, trade balance and FX reserves, where sourced.
2. Alerts and pending decisions.
3. Treasury and economic summary.
4. Government, security and public services.
5. Resource/energy and industrial capacity.
6. Diplomacy and international commitments.
7. Society, culture and religion.
8. Active national projects and milestones.
9. Recent simulation events and a data-coverage summary.

Use a two-column KPI grid on phones, one main chart at a time, concise labels, units, date range, source and observation year where available. Do not turn missing values into zeroes or display a trend for a single point. Include “X of Y fields recorded” with an expandable list of gaps. Executive subsystems such as Governance, Meetings/Votes, Directives, Coordination, Intelligence Briefing, Projects, Budget, Crisis, Audits and Strategy are subsections or cards inside Executive Ministry, not extra top-level buttons.

### All Ministries directory
Below the two main destination buttons, add search and compact category filters: Economy & Finance, Security & Defense, Infrastructure, Governance & Law, Social, and Energy & Food. Each card shows a canonical emblem, registered title, selected country, sourced minister/acting status, real operational state and one sourced key metric. Do not show profile-only values as a separate ministry without registry/runtime proof.

**Registry audit gate:** current `ministry_engine.js` visibly includes the special `cabinet_council` record plus 17 regular ministry records, despite the “All Ministries (18)” label. A separate minister-profile key list mentions environment, media, labor and religion without equivalent distinct cards in that visible ministry database. Reconcile the authoritative registry and runtime support before locking the final count. Do not count Executive Ministry twice or add a fake filler card. Preserve the current registered IDs until that audit is complete.

## 4. Confirmed ministry-domain map

The following map uses the current visible regular ministry IDs. Final directory labels must follow canonical registry data and translated display names, not duplicated hard-coded labels scattered across components.

| Canonical ID | Main sections and information |
| --- | --- |
| `trade` | Imports/exports, recorded partners, tariffs/rules, agreements, routes, commodity flows and trade history |
| `production` | Factories, production lines, recipes/inputs, output batches, workforce, utilization, maintenance, costs and inventory links |
| `taxes` | Tax rules, recorded collections, arrears/compliance, sector revenue and fiscal-period reports |
| `central_bank` | Monetary indicators, FX reference, reserve data and supported policy actions; reference-rate comparisons remain separate from treasury transactions |
| `laws` | Laws/regulations, judiciary capacity, legal reform and recorded outcomes |
| `education` | Schools/universities, student/teacher counts when sourced, spending, programmes, progress and research links |
| `infrastructure` | Roads, rail, ports, airports, routes, bottlenecks, construction and maintenance |
| `science_research` | Research catalogue/tree, technologies, active projects, progress, cost/material requirements and unlocked capabilities |
| `defense` | Readiness, service branches, equipment/inventory, procurement, training, logistics and defense infrastructure; civilian police remains in Home Affairs |
| `foreign_affairs` | Bilateral relations, embassies/missions, treaties, negotiations, aid, consular work and international organizations |
| `energy_mining` | Power/energy supply, individual mines/fields, reserves, extraction, stock, logistics, site reports and recorded environmental indicators |
| `intelligence_cyber` | Intelligence briefs, threat/alert levels, cyber posture, incidents and response status based on registered evidence |
| `agriculture_food` | Crops/yield, growing seasons, grain/food stocks, storage, fertilizer/water needs, shortages and food-security trends |
| `interior_security` | Police staffing/recruitment, the complete 15-tier vehicle catalogue, fleet state, patrol/deployment, facilities, incidents and reports |
| `health_welfare` | Hospitals/clinics, capacity/staffing where sourced, medicine stocks, health events, emergency preparedness and welfare programmes |
| `treasury_finance` | Budget allocation, revenue/expenditure, treasury ledger, public debt, borrowing/repayment, forecast and audit trail |
| `mega_projects` | Projects, milestones, schedules, progress, cost-to-complete, prerequisites and completion evidence |

Environment, media, labor and religion profile keys are not to be promoted into extra top-level ministry cards until the canonical registry and action runtimes confirm their status.

## 5. Common ministry page template

Use a consistent heading with the ministry emblem, selected country, registered minister/acting status, operational state and source-backed budget if available. Standard domain navigation is Dashboard, Operations/Programmes, People & Assets, Budget and Reports. Omit irrelevant sections rather than rendering empty tabs. The primary scroll area contains compact KPI cards, domain-specific cards, clear status text and contextual actions. Use Back to return to the directory with filters and country context retained.

Foreign Affairs owns UN, NATO, WTO, OIC, ASEAN, AU and EU as international-organization subareas; they are not separate ministries. Defense owns military readiness/procurement/logistics; it must not duplicate police staffing or police cars.

## 6. Energy & Mining: site-first resource UI

Mining is a clear subsection within Energy & Mining, not an extra global nav destination. It must be easy to find after opening the ministry.

### Six internal destinations
1. **Dashboard:** registered site counts, operational/developing/closed/unknown states, recent extraction, energy summary, blocked work and tasks needing attention.
2. **Mines & Fields:** every individual registered site keyed by a stable unique `siteId`, filterable by commodity, country/region, site type and operating state.
3. **Reserves:** reported/observed, modeled gameplay, unquantified, not-applicable and unknown values with unit, provenance and year where available.
4. **Stock & Warehouses:** actual inventory by batch, material, quantity/unit, grade if known, location, owner, age and reserved quantity.
5. **Transport & Supply:** in-transit batches, origin site, destination, route mode, fleet/capacity, ETA and provenance status (Observed, Modeled, Blocked).
6. **Reports:** output by site/material/turn, capacity vs actual output, utilization, downtime, reserve-source coverage, logistics blockage and delivery history.

### Mine/site cards
Each site is a separate card/row, not one row per resource type or a generic country-wide aggregate. Show the name, resource, registered location, operation status, reported reserve (with unit/status), current inventory stock, production rate/time unit and capacity/utilization only when present. Actions are View Site and Locate on Map, plus supported construction/extraction/shipment actions. Use the canonical `siteId` for card, map marker, operation and reports. Country filters must run before rendering/cloning records.

### Site detail
Use a representative or exact licensed site photograph (16:9 hero) with a clear distinction: an image is exact-site photography only when provenance confirms it; otherwise label it representative/illustrative. Show identity/location, coordinates if recorded, current state, reserve, stock, production and capacity. Follow with Site Details, Operations, Stock & Output, Route & Destination, History & Sources.

The visible flow is **Site → Extraction → Raw Batch → Warehouse → Transport → Factory/Market**. Each stage has its own state. No delivery is displayed as complete until the canonical game state confirms receipt; absent site-specific routing stays blocked. “Develop”, “Start/Stop Extraction”, “Upgrade Capacity” and “Send Batch” controls exist only when their actual authoritative handlers, eligibility/cost checks and refresh path are available.

### Quantity truth boundary
- **Reported reserve:** source-reported underground quantity, not current stock.
- **Modeled reserve:** a simulation input/seed, visibly labeled as modeled.
- **Stock/inventory:** physical/gameplay material available in the warehouse/batch ledger.
- **Production rate:** flow per specified day/turn/year; never add a rate to a stock quantity.
- **Capacity/utilization:** nominal permitted production capability and calculated use.
Different unit families (tonnes, barrels, cubic metres, energy) must not be summed into one meaningless “total resource” value.

## 7. Home Affairs and Police

### Ministry emblem and layout
Use an original understated civic-security emblem: deep navy shield, fine brass rim and a simple civic gate/protective mark. It must not copy an actual country seal, police badge or third-party trademark. Use a clean local SVG for the small control/icon representation and locally stored imagery for larger entity cards.

### Eight internal destinations
1. **Dashboard:** sourced staffing, fleet readiness, deployments, incident alerts, facilities, allocated budget and recent reports.
2. **Budget & Expenditure:** Finance-linked annual Interior allocation, national Treasury balance, six Home Affairs sub-budgets, fiscal-year spending and category remainders. Read values from `getHomeBudgetSnapshot`; edit only through `setHomeBudgetPlan`. Missing Finance values remain unavailable, and foreign-country budgets are read-only.
3. **Personnel:** staffing by rank/role, trained/active/reserve states, vacancies, recruitment and recruitment history. Keep one primary Recruit Police action here.
4. **Fleet:** all 15 vehicle tiers, owned/ready/deployed/in-repair/ordered states and filters.
5. **Patrols & Deployment:** mission, real region/location, shift, eligible assigned staff/vehicle, route and mission status.
6. **Facilities & Equipment:** police stations, garages, training sites, capacity, equipment and upgrade status.
7. **Incidents & Reports:** recorded incident ledger, trends, staffing/fleet coverage, responses and spending history. Response-time claims only appear if the runtime calculates them.
8. **Laws & Sections:** show only law/act, section/article, provision text, status and source records supplied by the selected country's canonical legal data. Missing provisions remain explicitly unavailable; do not invent laws or penalties.

### Complete canonical 15-tier hangar
The canonical engine already contains 15 individually designed local SVG vehicle profiles and capability data. UI-v2 must display all records in `OmegaHomeMinistryEngine.VEHICLES` rather than cloning a second vehicle catalogue or stopping after six generic vehicle types. Keep all existing IDs, tier numbers, unique SVG silhouettes, costs, maintenance values, capabilities, terrain/environment fits, route-risk and wear rules, ownership state, acquisition history and sequential 180-simulation-day procurement rules. Do not fabricate a fixed number of owned vehicles per country.

The existing 15 profile names/IDs are:
1. `cityline-compact` — Cityline Patrol Compact
2. `falcon-rs` — Falcon Rapid Response Sedan
3. `ranger-suv` — Ranger Tactical SUV
4. `sentinel-van` — Sentinel Personnel Transport Van
5. `bastion-armored` — Bastion Armored Patrol Vehicle
6. `interceptor-xr` — Interceptor XR Highway Unit
7. `terraguard-at` — TerraGuard All-Terrain SUV
8. `beacon-command` — Beacon Mobile Command Cruiser
9. `civic-shield` — CivicShield Public-Order Carrier
10. `ironwall-hs` — Ironwall Heavy Security Truck
11. `aegis-smart-ev` — Aegis Smart Patrol EV
12. `nexus-tactical` — Nexus Tactical Network Unit
13. `viper-elite` — Viper Elite Response Coupe
14. `guardian-national` — Guardian National Security SUV
15. `sovereign-mkxv` — Sovereign Guardian MK-XV

Default Fleet screen lists all 15, including locked tiers with an explicit lock/status; filters may narrow the visible list but may not remove records from the full catalogue. The selected tier shows its existing local SVG, class/specialty, top speed, acceleration, capacity, durability, range, duty endurance, purchase and per-day upkeep, strengths/trade-off, special equipment and terrain fits, all from the canonical engine. Do not duplicate these values in a UI-owned hard-coded database.

### Police actions
- **Inspect / order** routes into the existing authoritative vehicle detail/procurement screen for that same level.
- Purchase remains a paid procurement request, gated by the current tier unlock, treasury and Finance's approved Interior vehicle envelope; an order becomes delivered only after simulation-time settlement.
- **Select for Mission**/deployment is distinct from procurement and requires an already owned, available unit plus valid staffing/location/route.
- Existing maintenance APIs require the unit not be committed to an incompatible deployment and validate repair cost.
- Never show selection as ownership, pending order as delivered inventory, or click as successful dispatch.

### Recruitment
Personnel → Recruit Police → choose role/rank and quantity → show recruitment cost, payroll impact, required training/equipment/facility capacity and remaining approved budget → validate → confirm → authoritative runtime mutation → refreshed people/treasury state. If an API/check is missing, keep the input and show the diagnostic reason. Do not recruit directly from Dashboard and do not add a duplicate second recruitment button inside the fleet card. Recruited staff must still pass training/availability and vehicle eligibility before deployment.

## 8. Economy, Industry and Reports

### Economy
Economy is a convenient view of the existing Treasury, Taxes, Central Bank and Trade domains, not a parallel financial ledger. Organize Finance into Overview, Treasury & Ledger, Budget, Debt & Fiscal, Monetary & FX, and Trade & Revenue tabs. Display recorded cash, revenue/expenditure, appropriations, debt, trade balance, FX reference and forecasts with units and source periods. A reference currency exchange rate is not a treasury transfer. Banking data is separate from game cash unless the canonical simulation explicitly links the two.

### Industry
Industry displays factories, production lines, recipes, required input batches, delivered input, workforce, build stage/duration, operational capacity, output batches, inventory and industrial finance. Map each factory type to the canonical industrial catalogue and its existing locally cached visual. Do not make up factory costs/capacities if the canonical catalogue lacks them. A factory input is available only when the authoritative batch/warehouse delivery has settled.

### Reports
Global Reports is the cross-ministry index for National Snapshot, Economy/Finance, Resources/Mining, Industry, Security, Diplomacy, Society, Projects and Data Quality. Each report deep-links to the owning ministry/site/project; it never becomes a second data authority. Reports shown within an individual ministry remain context-filtered. Every chart names its metric, unit, period, source and last-updated turn/date where available. Tables can scroll horizontally only when they are truly tabular; cards should stack on phone.

## 9. Society, culture and religious imagery

Culture/religion is a Country Overview Society subsection unless the canonical registry proves a distinct ministry with real runtime support. Use respectful and accurate category imagery: Islam (mosque/crescent), Christianity (church/cross), Hinduism (mandir/Om), Buddhism (temple/Dharma wheel), Judaism (synagogue/Star of David), Sikhism (gurdwara/Khanda), and properly sourced motifs or neutral cultural architecture for other/traditional communities. Use a neutral globe or text-only mark when identity/demographics are unrecorded. Do not infer religious composition, use caricatures, decorate with sacred text or repurpose one faith’s symbol for another. Religious population values require a source and year; an icon is a category marker, not proof about individual belief.

## 10. Image and offline asset contract

Prefer generated representative scene art or exact works with a verified license that allows this distribution. Discover via sources such as Openverse or Wikimedia Commons, but verify each file's specific license, attribution and reuse conditions. Unsplash/Pexels content also requires checking the individual file's rights and restrictions plus third-party trademarks/personality rights. Do not scrape a website or treat a site's general policy as universal clearance for logos or depicted persons.

Add an asset manifest with stable asset ID, purpose/category/siteId, creator, source URL, exact license, attribution, download date, modification notes, dimensions and hash. Keep optimized WebP or compact SVG assets local; do not load from remote URLs during game runtime. Deterministic mappings are required:
- `siteId` → exact-site or clearly representative mine art
- canonical vehicle `id`/tier → existing vehicle SVG profile
- canonical factory type → factory visual catalog
- canonical ministry ID → original emblem
Never randomize image assignments between renders. When a genuine photo is missing or license status is unclear, use a neutral labeled placeholder/representative illustration rather than a copyrighted or deceptive image.

## 11. Loading, responsiveness and failure states

- The initial shell must render before non-critical pictures and long reports.
- Render large catalogues in bounded chunks/virtualized lists where measured; apply selected-country and type filters before creating nodes.
- Use one primary scroll container and preserve scroll position when switching a subtab where possible.
- Back, Close and country-switch behavior must be tested on 320–600 px screens and Android WebView; no trapped overview or modal.
- Use explicit pending/blocked/error/unknown/empty states. Never convert fetch failure to an empty authoritative registry and never display fabricated zeroes.
- Color encoding: teal/green confirmed operational, amber attention/in-progress, muted red blocked/failure, gray unknown/not recorded; every color also has a text label.
- Disable unsupported actions with a reason; no inert decorative button, duplicate event handler, full-shell re-render on every tick, or success toast before state mutation.

## 12. Preservation, implementation and test order

1. Merge PR A (legacy snapshot) only after required CI checks complete successfully on the exact archive head.
2. Work in `omega_ui_v2/` only; preserve current live root files, engines, registry, datasets and saved-state schema. Never delete or replace important files as UI cleanup.
3. Lock all ministry cards and buttons against the canonical registry/runtime inventory. Resolve ministry-count ambiguity before finalizing the directory.
4. Build shared design tokens, accessible cards/tabs, navigation registry, engine adapters, screen modules and the local asset manifest.
5. Implement/test the full existing 15-tier police hangar without creating a parallel vehicle catalogue. Keep recruitment, selection, purchase, maintenance and deployment distinct.
6. Implement resource site cards bound one-to-one with stable `siteId`; keep reserve/stock/rate/capacity and provenance separate. Validate a same-session route from site selection through extraction, batch, warehouse, transport, factory receipt/output and save/load where supported.
7. Test UI visual/button contracts, responsive navigation/Back/scroll, current-country refresh, every dynamic dialog, no duplicate action, all 15 police tiers, recruitment and fleet actions.
8. Run factory/resource integration, performance/hang regression, offline service worker, asset-manifest checks, Android build and Android 9 smoke on the exact final PR head.
9. Do not weaken or skip a failing required test. Replace an invalid check only with a justified equivalent that retains coverage. Only claim complete after checks pass and real app actions update authoritative state.

## 13. Navigation map

```text
World Map → Select Country → Country Quick Sheet
  ├─ Government → [Executive Ministry | All Ministries]
  │    ├─ Executive Ministry → Country Overview + cabinet subsystems
  │    └─ All Ministries → search/filter → canonical ministry → domain sections
  ├─ Economy → Treasury / Taxes / Central Bank / Trade views
  ├─ Industry → Factory catalogue / lines / inventory / production
  └─ Reports → domain report → source ministry/site/project

All Ministries → Energy & Mining → Mines & Fields → Site
  ├─ Site Details / Locate Map
  ├─ Extraction → Batch → Warehouse
  └─ Transport → Factory/Market → receipt confirmed by game state

All Ministries → Interior & Security → Fleet → all 15 tiers
  ├─ Inspect / Order → existing tier detail and Finance-gated procurement
  ├─ Fleet Health → unit condition, mileage and service state
  └─ Patrols & Deployment → eligible owned vehicle + staff + real location

Interior & Security → Personnel → Recruit Police → Validate → Confirm → state refresh
Reports → source-linked chart/table → relevant ministry/site/project
```

## 14. Acceptance gates

- [ ] The legacy UI archive is intact and restore instructions work.
- [ ] Exactly two Government top destinations; Overview appears only inside Executive Ministry.
- [ ] Canonical ministry count and IDs are reconciled without duplicate/filler records.
- [ ] All 15 canonical police vehicles appear in Fleet with unique tier/name/visual; hidden tiers show locked status but remain inspectable.
- [ ] Purchase, maintenance, recruitment and deployment call their real existing handlers; budget/country/location guards remain enforced.
- [ ] Mine list is site-level, filtered by country before render, and maps card/marker/action/report using the same siteId.
- [ ] Reserve, modeled reserve, stock, production and capacity are distinct and unit/provenance-aware.
- [ ] Country-specific UI refreshes on country switch; missing data stays missing.
- [ ] Report charts have units/time range/source and no fake trend.
- [ ] Image assets have manifest/license/attribution evidence and no runtime network dependency.
- [ ] No scroll trap, stale country data, hidden button, duplicate action or success claim without state proof.
- [ ] UI/resource/factory/performance/offline/Android 9 tests pass on the exact PR head.
