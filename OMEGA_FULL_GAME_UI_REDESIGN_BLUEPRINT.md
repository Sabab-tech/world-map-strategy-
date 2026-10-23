# OMEGA Full-Game UI Redesign Blueprint

> **Document type:** Architecture and design plan only  
> **Status:** Proposed target design; not implemented by this document  
> **Planning date:** 2026-10-24  
> **Repository:** Sabab-tech/world-map-strategy-  
> **Target baseline:** main branch at the time of planning; latest observed commit: 3422b1172c4fe576e0b090b84c865054c5994178

## 1. Purpose and non-negotiable rules

OMEGA needs one coherent command interface, not a collection of screens that happen to share a color palette. This blueprint defines how the whole game should look and navigate after the redesign, how current screens map into the new system, where each domain's data belongs, and how the existing simulation remains authoritative.

This is a design and implementation plan. Adding or updating this document must not change game behavior.

### Non-negotiable rules

1. **Preserve gameplay authority.** The UI reads canonical registries and runtime state. It must not quietly become another source of country, finance, resource, factory, minister, or event truth.
2. **Preserve working engine contracts.** New layouts may change presentation and routing, but commands, validation, save-state, calendar, offline behavior, and engine APIs must remain intact unless a separately reviewed migration proves a change necessary.
3. **One concept, one canonical destination.** Each domain has one home. Overview cards and contextual shortcuts link to it instead of rendering separate copies of the same detail screen.
4. **One click, one outcome.** Every visible button, card, tab, list row, dropdown item, and map marker needs a defined route or command, handler, state/result contract, and test.
5. **Do not invent missing data.** Use “Not recorded” and explain data coverage where useful. Do not fill gaps with plausible-looking numbers, default costs, fake capacities, or fake minister names.
6. **Offline-first and low-end Android.** Core gameplay must work on Android 9 / 3 GB RAM without a required CDN, remote font, remote image, remote JavaScript package, or network request to open core screens.
7. **Mobile-first, not mobile-afterthought.** The same domain routes work across portrait, landscape, and larger screens. Navigation may adapt, but the information architecture does not fork.
8. **Document-only until separately authorized.** This plan does not grant permission to modify game code, assets, data, CI, branches, or runtime behavior.

## 2. Current UI inventory: what the new design replaces

The current main-branch source contains multiple navigation and presentation patterns. This inventory is based on source structure, not a claim that every component is visible or functional at runtime.

| Existing area | Current source pattern | Redesign decision |
|---|---|---|
| World map shell | Map canvas, global status bar, map metric selector, right-side quick tools, notification area and bottom Ministries entry | Retain the world map as a primary destination; consolidate shared status and navigation |
| Country information | Country preview card, selected-country bar, city detail panel and a separate Country Intelligence Operating System modal | Use one compact Country Preview and canonical Overview/City detail routes |
| Country IOS navigation | Horizontal 13-chapter bar: Overview, Government, Military, Economy, Resources, Diplomacy, Intelligence, Infrastructure, Technology, Society, Operations, World Ecosystem & Causal, Strategic Profile | Move content into domain pages; remove the competing 13-tab global navigation in the target design |
| Government | Cabinet window, Executive Ministry / All Ministries navigation, separate Ministry Dashboard | Keep exactly two Government primary buttons; ministry detail becomes a child route |
| Resource controls | World-map resource filter plus a Resource Command Center that declares 16 domain panels | Keep map filters on the map; move resource records and management into Resources; preserve all 16 capabilities by grouping and cross-linking |
| Industry / factory | My Factories, Production Lines, Inventory and Industrial Finance | Keep these four established primary sections; define consistent factory-detail subsections |
| Status and time | Multiple clock, speed, treasury and save/status regions exist in source markup | Consolidate each shared concept into one global header display/control |
| Styling layers | Multiple linked visual, layout, ministry-entry, button and redesign style files | Establish a token and component hierarchy during implementation; avoid another pile of conflicting patches |

### Source anchors inspected for planning

- index.html: app shell, status areas, drawers, map controls, country preview, 13 Country IOS chapters, ministry entry and runtime script loading.
- country-ios.js: country-chapter rendering and navigation.
- ministry_engine.js and cabinet_engine.js: ministry/cabinet entry points.
- omega_country_overview_ministry_ui_v1.js: Country Overview ownership behavior.
- omega_resource_command_center_ui_v1.js: 16 existing Resource Command Center panels.
- resource_industrial_catalog_v1.json: authoritative industrial rules and the four known factory UI sections.
- omega_ui_system_redesign_v1.css: current additive responsive redesign layer.
- Existing tests for country overview, ministry interaction, factory production, resource pipeline, visual catalog and UI redesign are evidence inputs for the later implementation plan.

The inventory above is not a replacement for a full runtime walk-through. Before coding, every old route, handler, data file and engine API must be inventoried and traced.

## 3. Visual direction: Atlas Command

The target is a premium geopolitical command interface: sober, legible, data-dense where useful, and visually calm. It should not look like a neon arcade HUD, a spreadsheet pasted over a map, or a generic stack of glass cards.

### 3.1 Visual system

- **Base:** deep navy / slate surfaces with sufficient separation between app background, workspace and raised panels.
- **Accent:** restrained steel blue and cyan for selected navigation, links and active controls.
- **Status colors:** red for critical danger, amber/gold for warning or pending decisions, green for healthy state. Never use color as the only signal.
- **Typography:** highly readable sans-serif for general text, compact numeric styling for telemetry, consistent weights and line heights. Essential text must not depend on remote fonts.
- **Borders and elevation:** subtle outlines and limited shadows. Do not put every statistic in its own glowing box.
- **Real-world imagery:** use locally bundled, licensed photography for meaningful country, ministry, mine, factory, infrastructure and organization cards. Image selection must match the actual subject. Preserve author/source/license/attribution metadata. Small controls use optimized local line icons rather than photographs.
- **Map:** map remains visually dominant on the World route. Controls sit in predictable margins and never block country selection or trap gestures.
- **Language:** use a consistent product language and stable terminology across routes. Localization can be added through the language system; do not hardcode alternate labels in unrelated engines.
- **No misleading chrome:** do not show fake live indicators, fake completeness percentages, default values or “success” banners unsupported by a runtime result.

### 3.2 Layout measurements and responsive rules

Design reference viewport: **360 × 800 dp**, with responsive support across **320–600 dp** wide phones and larger tablets/desktop.

- Safe-area aware, bounded app viewport.
- App bar target: about 56 dp.
- Mobile bottom navigation target: about 64 dp plus safe inset.
- Main content gutter: about 12 dp.
- Section spacing: about 16 dp.
- Standard card radius: about 14 dp.
- Hero imagery: around 16:9 where it adds context.
- Minimum useful tap target: 44–48 dp.
- Only one main vertical scroll owner per page. Sticky headers/tabs may remain fixed, but avoid deeply nested scrolling surfaces.
- On narrow screens, data grids collapse to one or two columns; tables become readable cards or horizontally scroll only when necessary.
- Use lazy rendering and bounded lists for countries, sites, factories, batches and events. Do not render every record simultaneously.

These are starting design tokens, to be tuned by device screenshots and measurement rather than treated as immutable physics.

## 4. Target global app shell

### 4.1 One global header

The header is the single owner of global session status:

- selected country flag and name; leader only when recorded;
- current game date and day/turn;
- pause/resume and one speed selector;
- compact treasury/status indicator;
- notifications and critical alerts;
- save/autosave state;
- search, help and settings access.

On narrow screens, lower-priority status data moves into a collapsible summary. Do not render parallel clock, speed and treasury widgets inside each module. The map metric selector exists only within World Map.

### 4.2 Primary navigation

**Mobile bottom bar:** World · Overview · Government · Economy · More.

**Wide screens:** the same destinations appear in a side navigation rail or expanded navigation. Do not invent separate routes for mobile and desktop.

The More destination contains: Resources, Industry, Logistics & Trade, Foreign Affairs, Defense, Intelligence & Research, Society & Infrastructure, Events & Projects, and Settings.

### 4.3 Content workspace

- A page title and selected-country/context line.
- Optional summary and current alerts.
- Domain tabs for local sections only.
- Main content with bounded internal scrolling.
- A contextual details side panel on wide screens or an in-flow detail view on mobile.
- A breadcrumb/back control that returns to the actual parent and restores the prior selection/scroll when appropriate.

Do not open a new full-screen modal for every drill-down. A modal is reserved for short, focused tasks that require modal behavior, such as confirmation.

## 5. Canonical route map and detailed page plans

### 5.1 World Map

**Route:** World → World Map.

**Page contents**
1. World map canvas.
2. Map metric and overlay selector.
3. Map-layer controls and geographic-region selector.
4. Global search for registered countries, capitals, cities, resource sites and other entities.
5. Event and situation markers.
6. Selected-entity preview panel.

**Country flow:** select country → Country Preview → View Overview or open a specific domain. The preview contains identity and a few reliable indicators, not a second full dashboard.

**City flow:** select city marker → City Detail → relevant Society & Infrastructure section.

**Resource-site flow:** select site marker → Resource Site Detail → Reserve, Extraction or Route. Preserve the canonical site ID through every link.

Map display filters do not own or rewrite domain data. Switching a map metric changes the rendered overlay, not the country's financial record.

### 5.2 Overview

**Purpose:** a cross-domain command briefing, not a duplicate copy of every detail page.

Recommended order:

1. **Country identity:** flag, canonical name, capital, government/leader where recorded.
2. **Session status:** date, day/turn, treasury summary, save status and active alerts.
3. **Economy:** GDP and macro indicators with units, period and source caveats.
4. **Government:** executive priorities, ministry vacancies and pending decisions.
5. **Resources & Industry:** site/extraction overview, inventory/transport warnings, factories and production bottlenecks.
6. **Defense:** readiness, supply or procurement warnings, using the proper canonical values.
7. **Foreign Affairs:** major relationship changes, negotiations and treaty actions.
8. **Society & Infrastructure:** population/service/infrastructure summaries when available.
9. **Research & Projects:** current queues and completion events.
10. **Recent events:** a short event/action feed.

Each card has one clear route into its canonical domain. Detailed Country Overview belongs in Government → Executive Ministry, as defined below. Avoid two different full country reports.

### 5.3 Government

The Government page has **exactly two primary navigation buttons**:

1. **Executive Ministry**
2. **All Ministries**

No third Overview button at the Government top level. No Overview item repeated inside each ministry.

#### Executive Ministry

**Route:** Government → Executive Ministry.

Body order:
1. Full Country Overview / national briefing.
2. Executive priorities and active national mandates.
3. Ministry status and vacancies.
4. Pending decisions, policies and authorizations.
5. Cross-ministry performance and warnings.
6. Recent executive decisions and history.

Tiles link to canonical ministry, finance, policy, personnel or event records. The Overview is content of Executive Ministry, not a third primary tab.

#### All Ministries

**Route:** Government → All Ministries → Ministry Detail.

The source currently expects 18 ministry entries, but the rendered list must be built from the canonical ministry registry. Do not hardcode ministry names or the expected count in presentation logic.

The registry-backed list supports search/filter and groups ministry cards consistently. A card opens exactly one Ministry Detail route.

#### Ministry Detail

Common sections, where supported by the ministry's actual capability definition:

- Overview / mandate
- Minister & Personnel
- Budget & Finance
- Policies & Programs
- Operations & Services
- Assets & Inventory
- Performance & Reports
- Decisions & Activity History

Use capability metadata to hide unsupported sections, rather than showing dead controls on every ministry.

**Minister flow:** ministry → personnel list → minister profile → Recruit/Fire/appoint action → validated command result → refreshed staff list and history.

Recruit must not display a null minister or claim success if the engine/registry is missing. The button label and availability follow canonical personnel state and engine capability, not a local UI toggle.

**Organizations:** UN, NATO, WTO, OIC, ASEAN, AU, EU and similar organizations belong under Foreign Affairs as subsections/filters, not duplicate ministries. Home Affairs and Police responsibilities follow the ministry registry and must not produce duplicate actions/cards.

### 5.4 Economy

**Route:** Economy.

Primary sections, in order:

1. **National Accounts:** GDP, GDP per capita, growth and national economic baseline.
2. **Treasury & Budget:** current balance, revenue, expenditure, budget allocations, debt and ledger history.
3. **Monetary & Banking:** currency, exchange rates, inflation and monetary indicators.
4. **Employment & Production:** labor participation/employment and sector output.
5. **Markets & Prices:** domestic goods and commodity-price state.
6. **Trade & External Balance:** imports, exports, tariffs, contracts and settlement links.
7. **Reports & Data Quality:** time series, comparison, known gaps and data periods.

Never mix annual estimates, modeled daily fiscal flows, and current treasury balance without explicitly identifying the measurement period and unit. Keep game-economy state separate from any user/personal finance functionality.

### 5.5 Natural Resources

**Route:** More → Resources.

Primary tabs:

1. Resource Overview
2. Deposits & Sites
3. Reserves
4. Mines & Extraction
5. Resource Inventory
6. Logistics & Shipments
7. Commodity Market & Contracts
8. Research, Evidence & Data Quality

#### Resource Site Detail

- canonical site identity, name, country and coordinates;
- commodity ID, unit and classification;
- reserve quantity, reserve type/status and provenance;
- extraction method, equipment/crew requirements and capacity where defined;
- current operating status, output and depletion;
- raw-material batches and current warehouse;
- active shipments, routes and destination;
- downstream factory consumers;
- source, evidence, missing fields and data-quality status.

Do not substitute the player's country when a queried country/site cannot be resolved. Do not confuse ISO3 country codes with numeric registry IDs.

#### Preserve all 16 current Resource Command Center capabilities

Group the existing domain panels into the following navigation areas. Grouping is a navigation change, not a proposal to delete the underlying capability.

| New group | Existing panel capabilities |
|---|---|
| Registry & Standards | Unit standards & metrology; Commodity ontology; Deposit registry |
| Reserves & Extraction | Reserves & in-situ ledger; Extraction & depletion |
| Material Flow | Strategic reserve inventory; Transport corridors; Industrial value chain |
| Processing | Processing & smelting; link into canonical factory recipes/production |
| Markets & Fiscal Value | Commodity market; Supply contracts & tariffs; Resource rent & sovereign wealth |
| Power & Environment | Power systems & energy projects; Circular industry & environmental controls |
| Advanced Analysis | Cascade disruption sandbox; Cognitive decision gate |

The implementation inventory must trace every panel's existing handler, data contract, and engine owner before migration. Do not let Resource UI and Factory UI run competing production simulations.

### 5.6 Industry & Factories

**Route:** More → Industry.

Keep the four established primary tabs:

1. My Factories
2. Production Lines
3. Inventory
4. Industrial Finance

**My Factories**
- commissioned facilities and planned construction projects;
- facility identity/type/location and visual;
- construction/operating/maintenance status;
- staffing, capacity, utilities and alerts.

**Production Lines**
- registered recipe and recipe authority;
- canonical inputs and required quantities/units;
- cycle duration, expected yield, output unit and next cycle;
- available inputs, reservations and bottlenecks.

**Inventory**
- raw material, work-in-progress and finished goods;
- batch/lot IDs, source, quantity/unit, current location;
- quality/status, reservations and intended destination.

**Industrial Finance**
- construction, operating, staffing, energy and material costs;
- sales/revenue and settlement;
- links to the authoritative national finance ledger.

**Factory flow:** Industry → My Factories → Factory Detail → Production Lines / Inputs & Outputs / Workforce / Utilities / Maintenance / Finance / History.

The catalog is authoritative for factory types, categories, recipes and processing rules. Do not add arbitrary fallback cost/capacity values or present generic recipe fallbacks as factual data. Construction progress and commissioning use the central simulation calendar, with clear start/expected completion/current state.

### 5.7 Logistics & Trade

**Route:** More → Logistics & Trade.

Tabs: Routes & Corridors; Fleet / Transport Assets; Shipments; Warehouses & Transfers; Trade Contracts; Customs / Tariffs; Delays & Disruptions; History.

This is the canonical owner for shipments/routes/contracts. Other pages may show contextual links to the same records.

**Required resource/production lineage**

Site or Mine → Extraction Batch → Raw-Material Warehouse → Shipment / Route / Fleet → Factory Input Reservation → Factory Production Cycle → Output Batch → Finished-Goods Inventory → Market / Trade / Economy Ledger.

Entity IDs, quantities, units, origin and status must remain traceable across each step. Never silently clone a shipment or inventory batch because two screens need to show it.

### 5.8 Foreign Affairs

Tabs:
- Relations
- Treaties & Agreements
- International Organizations
- Diplomatic Actions
- Sanctions & Aid
- Missions & Negotiations
- Trade & External Relations
- Diplomatic History

International organizations are subsections, not ministries. Every action declares the target, requirements/cost, confirmation needs, command outcome and history event. A bilateral relation has one canonical state even when shown on Overview, country detail and Foreign Affairs.

### 5.9 Defense

Tabs:
- Readiness
- Forces & Personnel
- Equipment
- Procurement
- Logistics & Supply
- Bases & Infrastructure
- Budget
- Threat Assessment
- Operations & History

Defense owns administrative readiness, equipment, procurement, supplies, staffing and bases. Operational command remains a distinct route with authorization and lifecycle. A readiness score is not a troop count, and an inventory listing is not proof of deployment.

### 5.10 Intelligence & Research

Tabs:
- Intelligence Reports
- Collection & Sources
- Threat Assessments
- Research Queue
- Technology Tree
- Projects
- Discoveries & Outcomes

Research prerequisites, duration, cost and outcomes come from the authoritative research/project system. AI may explain evidence or recommend a next action, but its generated text cannot directly overwrite world state.

### 5.11 Society & Infrastructure

Tabs:
- Population & Demographics
- Health
- Education
- Energy & Utilities
- Transport Infrastructure
- Cities
- Housing & Welfare, when modeled
- Environment
- Public Services

Overview displays only summaries. Detailed facts and actionable management belong to canonical pages. City markers open the correct city/infrastructure record, not a parallel country dashboard.

### 5.12 Events & Projects

Tabs:
- Active Events
- National Directives
- Construction Projects
- Policy Timelines
- Notifications & Decisions
- Event History

Every event shows its source, scope, time window/status, affected entity IDs and resulting effects. Projects owned by factories, research, infrastructure or government link to the owning record instead of creating separate competing progress/cost data.

### 5.13 Global Search, Notifications, Settings and Help

- **Search:** typed results are categorized (country, city, resource site, ministry, factory, batch, shipment, project, event). Selecting a result opens its canonical destination.
- **Notifications:** opens the relevant event/action; it must not create a second event record.
- **Settings:** preferences, language, map settings, accessibility, save controls and diagnostics as applicable.
- **Help:** contextual usage, controls and current capability notes. Do not expose internal module/engine labels in ordinary player-facing copy.

## 6. Old-to-new screen migration table

| Current screen / control | Target route | Migration rule |
|---|---|---|
| 13 Country IOS chapters | Shared domain navigation | Map each chapter into canonical domains; remove the parallel chapter bar in the final target |
| Country IOS Overview / Strategic Profile | Overview summary + Government → Executive Ministry detail | Summary vs full report have separate, explicit purposes |
| Government chapter / Cabinet window | Government → Executive Ministry or All Ministries | Exactly two primary Government buttons |
| Ministry Dashboard | Government → All Ministries → Ministry Detail | Preserve engine contract, selected country and ministry identity |
| Military chapter | Defense | Readiness/equipment/procurement in Defense; operations remain separate |
| Economy chapter | Economy | Consolidate finance and macroeconomic sections |
| Resources chapter / resource filter drawer | Resources and World Map layers | Map filtering stays on World; data and management stay in Resources |
| Infrastructure / Society chapters | Society & Infrastructure | Canonical city/assets routes |
| Diplomacy chapter | Foreign Affairs | Organization views are subsections |
| Intelligence chapter / AI Advisor | Intelligence & Research + contextual advisor | Advisor follows current page; commands still pass through validation |
| Technology chapter | Intelligence & Research → Technology Tree / Research Queue | One research/project authority |
| Operations chapter | Domain-specific operations route | Do not create a generic duplicate owner of domain state |
| World Ecosystem & Causal chapter | Events & Projects and cross-domain event history | Show traceable source and effects |
| Country Info Card / selected-country bar | Country Preview | Identity + a few useful metrics + canonical links |
| City Detail panel | Society & Infrastructure → Cities / City Detail | One city record and one detail destination |
| Top-bar MENU / map metric dropdown | Map metric selector + global More menu | Map metrics are not the global navigation system |
| Quick Search / Events / Layers | Global Search / Notifications / Map Layers | Keep quick entry points, standardize open/close/back behavior |
| Factory UI | Industry & Factories | Preserve four primary factory tabs; standardize nested detail pages |
| Duplicate time/speed/treasury strips | One global header | Each global value/control rendered once |

## 7. Data ownership and traceability model

The UI is a read projection of authoritative game state. The command pipeline is:

**User Intent → Route/Command Validation → Deterministic Domain Engine → Canonical World State → Event/Save Record → UI Projection → Optional AI Explanation**

AI-generated explanations do not become state unless converted into a validated, authorized command with a deterministic result.

### Required canonical data domains

1. Country identity: canonical ID, aliases, ISO codes, name, flag, capital, region and coordinates.
2. Country profile/general data: demographics, government, leader, economic indicators, society and source/coverage metadata.
3. Ministry registry: IDs, display names, mandates and capability map.
4. Minister/personnel: person/profile IDs, eligibility, appointments, dismissals, assignments and effects.
5. World state/calendar: player country, date/day/turn, pause/speed, events and save version.
6. Finance/economy: treasury ledger, budgets, revenue/expenditure, GDP baseline/projection, debt, inflation, FX, labor and prices; each field has a unit/period.
7. Resource ontology/catalog: commodity IDs, aliases, units, classification and processing rules.
8. Resource sites/reserves: site ID, country ID, coordinates, resource ID, reserve amount/unit, status, provenance and evidence.
9. Extraction: methods, equipment, staffing, capacity, schedule, output and depletion.
10. Inventory/batches: batch ID, material, quantity/unit, quality/status, origin, location and reservation state.
11. Logistics: route/shipment IDs, assets, mode, origin/destination, amount/unit, ETA, state and cost.
12. Factories/industry: factory ID/type/location/status, recipe authority, inputs/outputs, staffing, capacity, maintenance and cycle events.
13. Markets/trade: prices, contracts, tariffs, settlements and trade history.
14. Foreign Affairs: relation IDs, treaties, organization membership, actions and history.
15. Defense: force/equipment registry, readiness, procurement, supply, bases and operations.
16. Intelligence/research/projects: report/evidence IDs, threat assessments, tech nodes, prerequisites, cost, progress and outcomes.
17. Society/infrastructure: demographic records, city IDs, services, assets and utilities.
18. Events/directives/notifications: event ID, source, scope, severity, duration, command result and affected IDs.
19. Maps/assets: geometry, layers, markers, icon IDs, local images and image license/attribution metadata.
20. Save/settings/diagnostics: save/load state, preferences, capabilities, errors, performance and test evidence.

### Field-level data dictionary

Before implementation, produce a data matrix with one row per visible field:

| Field | Required definition |
|---|---|
| UI label and route | Where the value appears |
| Canonical entity type and ID | Which record it describes |
| Authority/source field | Which registry or runtime owns the value |
| Unit and time basis | Currency/unit, per-day/per-year, current/baseline/estimate |
| Freshness/provenance | When/source of evidence where available |
| Missing-data behavior | “Not recorded” plus optional coverage explanation |
| Derived-value rule | Deterministic formula and its inputs, if applicable |
| Owning engine/API | Read interface and allowed write command |
| Verification | Test/evidence proving the field maps to the correct source |

No value is “complete” merely because it appears in a UI. Unknown or unavailable fields must not be silently populated by demo defaults or data belonging to another country.

## 8. Button Registry and interaction contract

Before coding, inventory every primary/secondary button, tab, card, list row, menu item, map marker and inline link.

Required Button Registry columns:

- control ID and visible label;
- parent route/panel;
- destination route or domain command;
- canonical entity type and ID;
- handler and owning engine/API;
- read-only vs state-changing;
- validation and preconditions;
- confirmation requirements;
- loading, empty, unavailable and error states;
- expected world-state change / returned result;
- resulting route and scroll/selection restoration;
- automated test and manual evidence reference.

### Interaction rules

1. One control, one defined outcome. No decorative controls pretending to be functional.
2. Back returns to the real parent route and restores relevant selection/scroll. Close closes only the active surface; neither resets the campaign.
3. State-changing operations validate permissions, data and prerequisites before execution.
4. High-impact actions show an explicit summary and confirmation.
5. Prevent double submission and duplicate ledger/batch/shipment transactions.
6. Show the authoritative engine result. Never fabricate optimistic success.
7. Preserve form input and explain unavailable dependencies.
8. Contextual links open the canonical entity and carry its real ID; they do not clone a record.
9. Search and marker routing is type-aware.
10. All actions preserve selected country and campaign context unless the action explicitly changes them.

## 9. Navigation and screen-state model

Use a single route/layer state model with explicit parent relationships. Define the minimum route contract before implementation:

- route ID;
- parent route ID;
- selected country/entity ID;
- local tab;
- scroll restoration key;
- modal/confirmation state;
- pending command state;
- load/error state.

Do not let multiple unrelated systems independently decide which modal is open or which panel owns the back button.

**Expected examples**
- World → Country Preview → Overview → Government → Executive Ministry.
- Government → All Ministries → Ministry Detail → Minister Profile → Recruit/Fire result.
- Resources → Deposits & Sites → Site Detail → Extraction → Batch → Shipment Detail.
- Industry → My Factories → Factory Detail → Production Line → Input Batch / Output Batch.
- Industry → Factory Project → Construction status → Commissioned Factory.
- Foreign Affairs → Organization or Relation → Action Review → Confirmation → Outcome / History.

Back and close behavior must be defined for every edge before implementation. A page that cannot be exited is a release blocker.

## 10. Performance, Android and offline design constraints

- Core boot and navigation must not depend on remote CDN fonts, images, React/chart bundles, Gemini, Express or a remote map tile source.
- Use bundled/optimized local images and lightweight local icons. Preserve licensing evidence for photographs.
- Keep high-resolution photos out of repetitive list rows; load details imagery on demand.
- Bound cache sizes and long event timelines. Avoid unbounded DOM nodes or high-frequency full-screen rerenders.
- Load heavy domain panels on entry when possible, while preserving their existing registered script dependencies.
- Keep map interactions responsive during incremental map rendering.
- Use internal scroll containers with explicit max-height/viewport rules; do not set up nested scroll traps.
- Ensure old Android WebView syntax/API compatibility or provide tested local polyfills.
- Offline first launch, offline cold start and opening each core domain must be verified without assuming a prior online visit.
- Portrait should be a supported usable layout; landscape may improve map work but should not be required for ordinary browsing or core management.
- Record measured startup/route-open time, memory, long tasks, scroll and map interaction results on the target device. Do not call performance “fast” without measured results.

Numeric performance thresholds should be agreed before implementation based on a baseline device run; do not invent a pass result now.

## 11. Phased implementation plan

### Phase 0 — Baseline capture
Record current main SHA, current screenshots, core routes, script/engine dependencies, data files, save-state behavior and latest test outcomes. Historical audits are context, not current evidence.

**Deliverable:** baseline packet with known-good behavior, known failures, current route inventory and evidence links.

### Phase 1 — UI and contract inventory
Enumerate routes, DOM IDs, click handlers, scripts, style layers, engine APIs, datasets, and offline assets. Build the current-to-target migration table and Button Registry. Flag duplicate controls, dead buttons, orphan panels and unclear ownership.

**Exit condition:** each existing visible control and core panel has an owner and target destination, or is explicitly marked for retirement with compatibility reasoning.

### Phase 2 — Data truth matrix
Map every new page/field to canonical source, unit, time basis, engine API and known coverage. Validate country/ministry/resource/factory registries and missing-data handling.

**Exit condition:** no planned UI field lacks a data owner or an honest missing state.

### Phase 3 — Visual prototype and interaction specification
Create static wireframes for:
- World Map;
- Overview;
- Government → Executive Ministry;
- All Ministries and Ministry Detail;
- Economy;
- Resource Site Detail;
- My Factories and Factory Detail;
- Foreign Affairs;
- Defense;
- mobile navigation, drawers and confirmations.

**Exit condition:** approve hierarchy, navigation, page scroll behavior, content density, image usage and button placement before coding.

### Phase 4 — Route and compatibility layer plan
Map each old UI entry point to a new route while retaining the currently authoritative runtime and commands. Determine how selected country, selected entity, active tab, save state and back stack survive migration.

**Exit condition:** all core user flows can be described end-to-end with no ambiguous navigation edge.

### Phase 5 — Vertical gameplay slices
Plan and later verify the highest-risk complete user journeys:
1. Country select → Overview → Executive Ministry / All Ministries → Ministry Detail.
2. Minister profile → Recruit/Fire → validated outcome → updated personnel/history.
3. Resource site → reserve → extraction batch → warehouse → transport → factory input → production output → inventory/market/finance.
4. Factory construction → simulation calendar progress → commissioning → production cycle.
5. Foreign Affairs / Defense / Research action → validation and confirmation → authoritative result → event history.

**Exit condition:** source IDs and resulting state remain consistent across UI, engine and save-state.

### Phase 6 — Incremental redesign implementation
Implement only after route, data and interaction contracts are approved. Prefer replacing presentation composition behind known stable engine contracts, rather than mass-rewriting engines for visual convenience. Use small, reviewable changes with screenshots and targeted regression evidence.

**Exit condition:** each domain migration is functional and independently reviewable before moving to the next.

### Phase 7 — Android, offline, accessibility and performance
Validate portrait/landscape, 320–600 dp layout, Android 9 WebView, 3 GB RAM constraints, offline cold starts, local assets, taps, focus, contrast, internal scrolling and map responsiveness.

**Exit condition:** metrics meet agreed thresholds on real target hardware and core tasks work offline.

### Phase 8 — Full regression and release decision
Run route tests, button coverage, data-lineage tests, save/load tests, country selection tests, ministry recruitment tests, resource/factory end-to-end tests, screenshot review, offline/Android smoke flows and a complete manual campaign pass.

**Exit condition:** no unresolved release-blocking freeze, dead primary control, fake state mutation, cross-country data leak, duplicate authoritative record or unverified critical gameplay path. Any skipped test must be recorded as skipped with risk; it does not count as passed.

## 12. Test and evidence matrix

| Test area | Minimum evidence |
|---|---|
| Route reachability | Every primary route opens and every child route returns to its true parent |
| Back / Close | No modal or domain panel traps; campaign state is preserved |
| UI controls | Every registered button has positive, negative and unavailable-path tests as relevant |
| Country identity | Alias/canonical ID resolves the same country across map, Overview and domain pages |
| Missing data | Missing values display honest “Not recorded” handling; no wrong-country/default fallback |
| Ministry/personnel | Recruit/Fire state, profile, command outcome, effects and history stay consistent |
| Finance | Units, period, currency and ledger ownership are correct; no duplicate debit/credit |
| Resource lineage | Site/reserve → extraction batch → warehouse → shipment → factory input uses consistent IDs |
| Factory | Recipe/capacity authority, time progression, input consumption, output creation and finance linkage verified |
| Save / load | Selected campaign, calendar, domain state and in-progress projects survive reload |
| UI / scroll | No frozen screen, unbounded panel, broken close control or hidden bottom content |
| Android / offline | Core flow works on Android 9 with network disabled; local assets and scripts are available |
| Performance | Recorded cold start, route-open, memory and map interaction metrics |
| Visual design | Screenshots at 320, 360, 412, 600 dp and a wide layout; light/dark status and long-content checks as applicable |

## 13. Definition of done for the redesign plan

The design is ready for implementation only when:

- there is one canonical route tree and one navigation ownership model;
- every old screen has a documented migration destination or retirement rationale;
- Government contains exactly Executive Ministry and All Ministries as primary controls;
- all 16 current Resource Command Center capabilities have a target location and owner;
- the four established factory tabs remain represented;
- every data field is mapped to a canonical source, unit, time basis and missing-data state;
- every control appears in the Button Registry;
- every high-risk gameplay journey has defined expected state transitions and tests;
- current known UI freezes and back/close failures are explicitly covered;
- Android 9 / offline-first limitations are designed for and testable;
- visual prototypes are reviewed before production implementation;
- test results and screenshots are attached to later implementation PRs, with failures honestly reported.

## 14. Scope and status log

This file records the intended target architecture only. It is not proof that any UI change, engine behavior, asset update, runtime test or performance target has been completed.

Adding this plan to main is documentation-only. It does not itself change game code, data files, assets, CI workflows, saved games, routes or user-visible runtime behavior. The actual redesign must be implemented in later, reviewed steps using the traceability and release gates above.
