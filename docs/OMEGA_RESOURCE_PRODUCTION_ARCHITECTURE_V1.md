# OMEGA Resource Production Architecture v1

## Purpose and non-goals

This is a system-level change. It does not append, replace, regenerate, or edit mine-site records. Existing canonical identities, coordinates, reserve records, and map bindings remain the data authorities. The architecture changes how a site is resolved into production, extracted output, stock, transport, processing, and economic effects.

The shared executable contract is `omega_resource_production_capacity_contract_v1.js`. It is the common calculation and provenance boundary used by the reserve/production model and the site realism model. It is loaded before both runtimes by the browser/server boot chain.

## Runtime flow

1. **Identity and authority:** the canonical site catalog determines the site ID, country, commodity, and stored map location. Alias records do not create duplicate commercial extraction identities.
2. **Quantitative contract:** reserve, production, grade, recovery, throughput, purity, and capacity retain their own values, units, statuses, and provenance. An unknown number remains `null`; it is not converted into zero and not labelled observed just because it is numeric somewhere else.
3. **Operational factors:** production resolves equipment availability, power availability, input/consumables availability, and technology efficiency. Values may be supplied by site operational state or the optional `Omega.ResourceAvailabilityRuntime` / `Omega.ResourceOperationsAvailabilityProvider` adapter. Research-capacity and research-output effects remain separate, explicit multipliers.
4. **Capacity and production:** the shared contract calculates a traceable daily rate and the capacity available for the selected time window. The output includes the formula branch, factor values, factor statuses, sources, and final rate.
5. **Extraction authorization:** extraction is still limited by requested quantity, remaining recoverable reserve, and capacity for the tick. Capacity is not permission to extract more than the remaining reserve.
6. **Batch and raw warehouse:** approved extraction creates a batch and writes country-scoped inventory/ledger events. The country boundary guard remains authoritative; a batch cannot silently move to another country's raw warehouse.
7. **Strategic logistics:** dispatch plans, transport capacity, blockades, sanctions, cost, and ETA govern movement from warehouse to factory. A blocked road/route does not erase a geological reserve or retroactively change the mine's rated capacity.
8. **Factory and economy:** delivery is accepted as factory input, processing consumes input lots according to the processing model, and output enters the applicable inventory/economic transaction. Each stage needs an event/correlation ID so it can be traced back to the site and extraction batch.

## Production equations

All operational factors are normalized to a defined range. Availability factors accept a fraction (0 to 1) or a percentage (0 to 100). Technology efficiency accepts a fraction/percentage, or a bounded multiplier up to 1.5.

For a modeled/simulated stream:

`effectiveRate = ratedCapacity × equipmentAvailability × powerAvailability × inputAvailability × technologyEfficiency × utilization × recovery × (1 − maintenance) × (1 − decline)`

`windowCapacity = effectiveRate × windowHours / 24`

For a source that contains a reported production rate, that rate remains visible as `observedRate`. The active modeled rate applies the operational-factor product and existing, relative production/research adjustments; an explicitly provided rated capacity remains a ceiling. The system does not apply utilization/recovery a second time to a reported actual rate, because that rate may already include those conditions. If only capacity is known, the capacity-factor equation is used instead.

Extraction approval is:

`approvedQuantity = min(requestedQuantity, remainingRecoverableReserve, windowCapacity)`

Transport capacity is a later constraint and is not multiplied into mine extraction capacity. This avoids conflating “the mine can produce” with “the country can currently deliver it.”

## Factor sources and data truth

Factor source precedence is: runtime operations provider, current operational factors, site/production-model factor fields, then a runtime default. Each factor is accompanied by a status and source.

- Explicit factual inputs can be marked `OBSERVED`.
- Scenario/site simulation values remain `SIMULATED`.
- An absent factual factor receives a neutral value for an observed-rate baseline and stays `UNOBSERVED`.
- When a simulated site has no factor input, the runtime derives deterministic, site-specific factors from the stable site identity. These are simulation policy values, not new geological facts and not edits to mine JSON.
- An optional live availability provider can be connected through `Omega.ResourceAvailabilityRuntime.resolveSiteFactors`, `resolveOperationalFactors`, or `forSite`. Without such a provider, this release uses site state where present and deterministic runtime defaults for simulated sites. It does not claim to simulate the national electrical grid or actual consumables inventory yet.

The observed reserve/production data itself remains separate from calculated active production. A calculated rate with simulated factors is reported as simulated even when the underlying site identity or some source metrics are observed.

## Required output contract

Every production resolution returns:
- Rated capacity and input rate, with the original unit context retained by the caller.
- Active daily production rate and time-window capacity.
- Equipment, power, input, and technology-efficiency factors.
- Factor statuses and source names, including which defaults were used.
- Utilization, recovery, maintenance, decline, and the combined multipliers.
- Formula/model version and a calculation trace suitable for logs, tests, debugging, and future UI diagnostics.
- Authority metadata that cannot promote simulated operational output to observed data.

## Acceptance gates

The architecture change is acceptable only when:
- The shared calculation is loaded before both consumers.
- Percent/fraction normalization, explicit zero availability, null handling, deterministic defaults, observed-rate preservation, capacity ceilings, and 24/48-hour window scaling are tested.
- Both production and site-realism tests prove that the returned active rate and trace come from the shared contract.
- The extraction pipeline still obeys reserve and country-boundary guards.
- Resource-map and canonically stored site records are unchanged by the system-level change.
- CI and Android packaging validate the new script's inclusion in the boot chain.

## Explicitly out of scope for this release

This contract creates the extension point and calculation trace, but it does not by itself implement a full power-grid network, mine-specific machinery inventory, workforce rostering, dynamic spare-parts supply, route-aware production shutdown, or a new UI panel. Those systems can publish factors through the defined interface when they have authoritative runtime state. Their absence must remain visible rather than being disguised as real data.
