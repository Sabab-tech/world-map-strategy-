# OMEGA NPC Economy Execution — 197-Country World Runtime

## Scope

The world simulation keeps the selected player country under the detailed, interactive player runtime. The other countries in the canonical 197-country game roster are managed by the existing opponent-country decision engine and the bounded world scheduler. NPC decisions are not a second parallel economy: they use the existing country-scoped ministry state, treasury, market evidence, project lifecycle, diplomacy and settlement handlers.

## Turn execution

- The world scheduler excludes the player country from NPC evaluation.
- NPC countries are selected by a persisted, starvation-free round-robin macro cursor; event-driven active countries receive higher-frequency turns.
- Desktop macro throughput is capped at eight countries per turn. Constrained/mobile throughput is capped at four macro countries per turn; active-country work is separately capped. Work yields between country evaluations and remains inside the scheduler's existing device time budget.
- The Opponent Autonomy project lifecycle is registered for PLAYER, ACTIVE and MACRO tiers. Newly activated NPC countries advance their projects on active turns; macro turns continue to progress countries that are not currently active.
- Repeated callbacks for one turn remain serialized by the existing scheduler and project commands remain idempotent.

## Government investment and accounting

NPC development projects use the same Finance-owned country model at `finance.<country>.omegaFinance` as the Finance Ministry. Project categories map to existing appropriation sectors:

| Project kind | Appropriation sector |
| --- | --- |
| Factory / industrial capacity | Industrial Development |
| Housing | Construction |
| Infrastructure | Transport |
| Military facility | Defense |

A capital-expenditure command is accepted only when it identifies an existing country-owned autonomous project and its expected sector. The executor checks the country treasury, the project's ministry appropriation and the minimum reserve floor. It then commits the Treasury debit, sector spend, committed amount and auditable Finance ledger rows in the same country-scoped Finance transaction.

When the selected appropriation is insufficient, the NPC budget executor may move unspent appropriation from Culture, Financial Services, Cabinet or Environment. Each donor retains at least the higher of its existing spend and 50% of its preserved original baseline appropriation. Transfers create paired incoming/outgoing ledger rows and preserve the country's total annual budget envelope and total allocation share. No cash, budget envelope, natural resource or inventory is created. If the Treasury or protected budget headroom is insufficient, the project remains blocked and its material reservation is restored.

If asset commissioning fails after Finance settlement, the corresponding Finance and material entries are refunded. Transaction identifiers prevent repeat callbacks from spending or refunding twice.

Sector baselines are game-rule allocations derived from the Finance registry; they are not representations of observed official national budgets. Each country retains its own Finance model and ledger.

## Sanctions and diplomacy

Sanction evidence continues to be recorded by the country that owns the relevant notification, exposure, national decision, recovery plan and investigation. The selected NPC response now activates the affected country in the world scheduler and invalidates its cached decision context so the country's own rules are re-evaluated using its current market, supply, production and fiscal evidence.

When the evidence-weighted target-country decision selects a waiver or renegotiation, the Sanction Response runtime submits a real country-owned treaty-negotiation request through Opponent Autonomy. It contains the policy key and affected product references. The existing bilateral treaty lifecycle then records the counterparty's accept, counter-offer or rejection; starting a negotiation does not assume that the other country accepts it.

Player-country responses remain under player control. NPC automation does not spend the player's budget, change the player's industrial plan, or initiate diplomacy for the selected player country.

## Boundaries retained

- No synthetic money, inventories, deposits, shipments, completed production or settled contracts.
- Existing resource identities, factory types and country profiles remain authoritative.
- A national project becomes an operating production upgrade only after the existing project material, Finance and factory commissioning checks succeed.
- The existing private-company opening-capital / private production safety gate is intentionally unchanged until its separate full mine-to-finished-goods save/load validation is complete.
- Legal market redirection remains subject to verified supplier quantity, pricing and the existing trade execution handlers; a recovery recommendation is not treated as a settled contract.
- Unavailable evidence remains unknown. The game-model budget and macro estimates are not presented as observed national statistics.

## Regression coverage

The Finance and Opponent Autonomy tests verify preserved budget baselines, donor floors, paired budget transfers, Treasury and appropriation debits, duplicate-command idempotency, refunds, project ownership checks and country isolation. Sanction tests verify real waiver-request handoff, target-country activation and player-country diplomatic isolation. Existing world-scheduler tests continue to exercise roster rotation and bounded player-excluded NPC evaluation.
