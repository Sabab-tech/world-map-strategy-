# OMEGA Milestone B: Complete Resource Gameplay Pipeline

## Baseline gaps closed

The former verification split the Endowment extraction tests and Industrial Network tests across separate harnesses. Passing those isolated tests did not prove that the same extraction batch could pass through transport, factory input, processing, finished stock, market and treasury. The dedicated integration now covers that path and adds separate coverage for many countries and the expanded deposit registry.

## Runtime contract

- **Identity and extraction:** extraction events retain the source country, site/occurrence identity, batch identity, unit, quantity and source authority. Observed and simulated values remain distinguished.
- **Raw inventory and transport:** dispatch requires a physical source batch and lot; shipment quantities are capped to the available balance within the documented rounding tolerance. The sovereign raw warehouse, its aggregate inventory and its reservations are reconciled.
- **Factory input and processing:** received shipments create factory-input lots with the source batch lineage. Input aggregate quantity must reconcile against its lots. Legacy aggregate-only input is represented as an explicitly `UNOBSERVED` lot, never attributed to a made-up mine.
- **Finished goods:** products and coproducts are tracked as their own batches/lots and held in the sovereign processed warehouse, separate from raw stock. Output lots preserve source-batch ancestry.
- **Market:** offers are based on physically available, unreserved warehouse stock. Offer quantities reconcile with batch allocations; offers expose source batch and originating deposit IDs for opponent analysis. Price provenance identifies an observed/runtime/reference quote or a simulated fallback.
- **Economy and treasury:** finished-goods registration is idempotent by transaction identity. Extraction royalty/resource-tax valuation, domestic sales, and international settlements are recorded separately. Import/export settlement moves batch and lot quantities between country inventories and raw/processed warehouses, carries source lineage, and updates buyer/seller trade-account totals.
- **Blocked deposits:** inactive, non-commercial or otherwise unapproved extraction events create a country/site-specific blocked flow record. They do not create an inventory batch, shipment, market offer or treasury receipt.

## Milestone A integrity gate

The existing registry audit remains mandatory. It checks canonical identities, duplicate and alias policies, marker collisions, coordinates, quantitative types/units, provenance, and country/resource/reserve bindings. Simulated values remain labelled `SIMULATED`; missing observed values remain `UNOBSERVED`.

## CI evidence

The dedicated `OMEGA Resource Gameplay Pipeline` workflow runs the registry audit, real Endowment-to-Economy E2E, recipe-coverage gate, autonomous multi-country flow, international trade lineage, inventory reconciliation, authoritative adapter, production realism, state-hardening, industrial-network and transport-logistics tests.

The expanded reference pack contains 199 deposit records across the test fixture; the flow test distinguishes operational/commercial records that must automatically dispatch from non-operational or non-commercial records that must remain explicitly blocked. This prevents a test from making every listed site produce stock just to achieve a green result.

The pipeline test uses real subsystem JavaScript and repository data in a deterministic integration harness. The Android build workflow is a separate CI gate; this evidence does not claim interactive manual gameplay on a physical device. Milestone C systems remain out of this scope.
