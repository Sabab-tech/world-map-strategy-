# OMEGA Black Market — Universal Country Participation v3

## Design rule

Every canonical country in `countries.json` is eligible to act as a buyer, seller, export-exposed supplier, intermediary candidate, state-linked actor, private commercial actor, or sanctions issuer. There is no permanent participation list and no country is assigned a covert role merely because of its real-world identity. Participation is commodity-, turn-, evidence-, stock-, relationship- and policy-dependent.

The player country is not used as an autonomous NPC buyer or seller. Its player-facing Black Market remains manually controlled; NPC countries can participate autonomously in the background planner.

## Country decision model

A country can be a buyer when its own saved game state shows at least one relevant condition:

- An active import ban, embargo or sanction blocks a recorded input.
- Active factory input demand or domestic unmet demand exceeds verified supply.
- Stock coverage is below the recorded target.
- Import dependence is recorded for the commodity.
- Import tariffs are at least 20% and there is recorded demand.
- Energy, food, strategic procurement or foreign-currency pressure is supported by the existing runtime data.

A country can be a seller only when the existing Global Market / Trade / Resource authorities expose a valid offer and verified available stock. The offer cannot consume protected strategic reserves, invent stock, create a new resource identity, or skip route/blockade rules. Export restrictions and sanctions are captured as policy evidence, not treated as proof that a state owns the seller.

An exporter can seek a replacement customer when a recorded bilateral export relationship is exposed to a sanction. This is evaluated in both directions:

1. A sanction targets the exporter.
2. A sanction targets the exporter’s major customer, so the exporter loses access to that destination even though it is not itself sanctioned.

The primary evidence source is the seller country’s existing Global Trade `trade.exportLedger`, which records completed settlement IDs, resource IDs, buyer country, quantity, value and turn. When this ledger is unavailable, the engine can use an existing seller bilateral-export/dependence record or an explicit relationship export metric; it does not infer exports from a country name or a political archetype. Exposure share is calculated against the seller’s recorded exports of the selected commodity. A recorded product export share of 15% or more creates a persistent export-market shock record. At 25% or more, the model elevates the lost-customer motive and uses the `LOST_PRIMARY_EXPORT_MARKET_REDIRECTION` tactic. Below 25%, a recorded but smaller customer exposure can still produce a `SANCTIONED_CUSTOMER_ACCESS_LOSS` motive. Export value and quantity are recorded as *at risk*, not as realized losses or cash debits.

The same country may buy copper, sell food, and stay outside a different commodity market. State involvement requires evidence such as a government entity, state-owned company, state trading network, or active state supply directive. An embargo by itself is only policy context; it is not proof of covert government participation.

## Tariffs and private companies

An import tariff of 20% or more can create a commercial incentive when the country has recorded demand. At 35% or more, the offer pricing model applies a stronger tariff-related risk/penalty increment. The player sees the tariff, import-dependence signal, expected landed cost, detection estimate and penalty estimate.

When the country already has a matching company or enterprise record, the intelligence profile can identify the strongest matching buyer or seller company and ownership class. Only existing `economy.companies`, `economy.enterprises` and `finance.stateOwnedEnterprises` records are read. The planner does not create company names, share registers, company cash, private wallets or funding.

The current company account runtime is an aggregate cash-flow summary, not a fully funded corporate wallet. Therefore this version does not pretend that an individually named company has paid or received money unless an authoritative company settlement system is present. Company-to-company private trade can be wired to the future large-company system when its legal identity, funded wallets, balance checks and settlement authority are available.

## Intelligence and secrecy

The autonomous planner advances once per committed player-country turn. It writes discovered network reports into the selected player country’s Intelligence state only. A country participating in its own deal can know its own transaction; unrelated NPC countries do not receive universal, omniscient reports. The game does not run a separate passive Intelligence simulation for all 197 countries every player turn.

Report confidence is evidence-based:

- **LOW** — suspicious market activity; counterparties are withheld.
- **MEDIUM** — a corridor or at least one participating country is identified.
- **HIGH** — transaction, broker and actor-profile evidence is strong enough to expose country motives and state-link evidence.

A country being sanctioned, having a high tariff, or appearing as an intermediary candidate does not prove state sponsorship. State attribution is marked `NOT_ESTABLISHED` until there is direct evidence.

## Detection, quantity bands and enforcement

Shipment exposure is measured against the seller’s verified *free tradable stock*, after protected reserves and existing reservations. The exposure thresholds are:

| Share of verified seller free stock | Shipment band | Added detection risk | Added fine rate | Added post-settlement seizure rate |
|---:|---|---:|---:|---:|
| Up to 1% | Micro | +0 pp | +0 pp | +0 pp |
| Above 1% to 3% | Small | +2 pp | +0 pp | +1 pp |
| Above 3% to 8% | Moderate | +5 pp | +1 pp | +3 pp |
| Above 8% to 15% | Large | +10 pp | +3 pp | +6 pp |
| Above 15% | Critical | +18 pp | +6 pp | +10 pp |

Base detection probability starts at 5.5%. The risk model adds evidence for embargo (+18 pp), export restriction (+13 pp), sanctions (+16 pp), absence of a trade agreement (+9 pp), weak diplomatic relations (+6 pp), buyer Trade Surveillance (up to +5 pp), buyer Customs coverage (up to +4 pp), shipment size and repeat attempts. The result is bounded; the final probability is capped at 88%. Late discovery is modelled separately at 18% of the current detection probability.

Repeat attempts over the previous ten game turns increase scrutiny. Three attempts add 3 pp to the completed-trade fine and 3 pp to the seizure rate; five or more add 5 pp and 6 pp respectively. Detection risk also rises with the number of attempts and same-resource repeats, capped at a +16 pp increment.

Completed-trade fine rate is 6% baseline plus relevant additions: embargo +8 pp, export restriction +4 pp, sanctions +7 pp, tariff incentive +4 pp at 20–34.99% or +7 pp at 35%+, shipment size and repeat behaviour. The completed-trade fine is capped at 35% of the verified buyer-side settlement value. If a shipment is intercepted before dispatch/import, the attempt fine is 45% of that deal’s completed-trade rate, bounded to 2.5–16%, and is calculated against the recorded attempted transaction value.

If a covert shipment is discovered after authoritative settlement, cargo seizure is calculated from the imported quantity using the saved offer’s seizure rate, capped at 55%. Only unsold, available batches that can be traced to that settlement are eligible. Sold, consumed, transferred, depleted, reserved or unprovenanced stock is not seized. If it is intercepted before import, the cargo is stopped and no buyer inventory is seized. Fines that cannot be paid immediately remain outstanding and retry through the existing enforcement process; they are not silently written off.

These are tunable game-balance values, not claims about real-world customs probabilities or legal penalty schedules.

## Political and diplomatic consequences

A detected case is shared with the buyer and seller’s own case files. The issuer of the evidenced sanction receives its foreign-response record. The response targets the country that breached the sanction:

- **MODERATE:** −5 diplomatic relation points.
- **HIGH:** −8 points.
- **CRITICAL:** −12 points.
- **LOW:** −2 points.

Where a second country was directly involved as the supply-side partner, it can also receive a secondary association adjustment equal to 35% of the primary penalty (minimum −1 point). The sanction issuer is not penalized against itself. All adjustments are recorded as evidence-linked foreign-relation entries rather than being represented as an immediate declaration of war. Repeated detections can trigger a stronger response in subsequent decisions.

Potential wider effects are represented through persistent case, export-shock and relation-adjustment records. The model does not fabricate a fall in GDP, a company bankruptcy, or a Treasury loss unless the relevant economic runtime records the resulting settlement, company flow or macroeconomic update.

## Runtime limits and authorities

- Every country’s demand evidence is scanned, but the engine does **not** simulate every country’s full economy.
- Up to 24 country/product market queries run per committed player-country turn: 12 priority slots plus 12 rotating slots. This lets lower-ranked countries and commodities enter the market review over successive turns instead of being permanently excluded.
- At most one autonomous NPC deal is created per player turn; pending network processing is capped at six.
- The market query uses the existing Global Market, verified inventory, policy, stock and route authorities. A deal still needs the existing Global Trade review, inspection and settlement path.
- Only existing catalog products in `RAW_RESOURCE`, `FACTORY_PRODUCT` or `FOOD_PRODUCT` lanes are eligible.
- War and active route/blockade constraints remain hard stops. Black Market permits can authorize only the specific policy bypasses supported by the persisted deal; they never create stock or bypass route safety.
- All money, inventory, reserve, batch, warehouse and settlement changes remain under the existing finance and resource authorities.

The bounded rotating market-query scheduler is deliberate: it lets all countries qualify without causing a full 197-country, all-commodity, all-seller runtime scan on mobile devices.
