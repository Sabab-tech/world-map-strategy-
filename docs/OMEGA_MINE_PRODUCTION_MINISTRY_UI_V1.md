# OMEGA Mine Production Ministry UI v1

## Screen layout

- Atlas Command header: Mine Production Ministry, active country ISO3 and registered-site count.
- National Resource Command panel: opens the existing canonical mine management runtime for the player country.
- Dashboard KPIs: registered sites, known operational tags, unknown statuses, projects, inventory rows and site-flow rows.
- Tabs: Dashboard, Mines & Fields, Reserves, Stock & Warehouses, Transport & Supply, Reports.
- Mine cards: stable siteId, resource, country, location, observed reserve, modeled reserve (explicitly labeled), warehouse stock, measured production, coordinates and provenance.

## Interaction contract

- **Start / manage production** opens the existing mine-management runtime in the player-country view. The existing runtime owns production execution and reports the real outcome.
- **Develop mine** opens the existing site directory/construction flow. Canonical runtime rules remain responsible for requirements, costs, workforce and construction.
- No new fake extraction, inventory, delivery or daily-output values are created by the UI.
- The resource screen uses the selected country scope before deduplication and presentation. If country identity is missing, it does not enumerate a world-wide site list.
- Missing source data remains Not recorded / Unavailable. Modeled reserve is never presented as observed reserve.

## Mobile visual system

Dark navy (#071321), raised navy panels, cyan-blue actions and restrained gold emphasis. Controls retain at least 42px touch targets, wrap on small screens and use local CSS only.

## Validation gates

Run `npm run test:omega-ui-v2`, `npm run test:ui-visual`, `npm run test:resource-mine-management` and the repository build on the PR head. Android 9 runtime smoke and actual device performance cannot be inferred from source-level tests; verify those separately before claiming full device acceptance.
