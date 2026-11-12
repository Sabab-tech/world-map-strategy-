# OMEGA Black Market — Country Participation and Intelligence Model

## Design rule

The Black Market is a country-by-country shadow-trade system, not a permanent list of countries labelled as criminals. A country participates only when the existing game state supplies a credible reason, a canonical product, a tradeable seller stock position, and a viable bilateral relationship/route. Participation is recalculated from game evidence. Iran is an inspiration for one state-linked participation archetype, not a hard-coded permanent participant.

## Who may participate

A country can take one or more roles. Roles are attached to a transaction, not to a permanent national stereotype.

- **Buyer:** recorded unmet demand, low stock-coverage days, active factory input demand, energy or food security pressure, an import restriction, weak foreign-reserve coverage, or a strategic procurement priority.
- **Seller:** verified tradeable surplus, an active state supply directive/export restriction, state-linked trading capacity, foreign-currency pressure, or a private broker's observed commercial margin.
- **State-linked actor:** an observed state trading network, state-owned/public enterprise, government entity, or active state supply directive. A resource embargo alone is policy context, not proof that the government is a covert trader.
- **Private actor:** a private importer, exporter, broker, or intermediary where no state-actor evidence is available.
- **Intermediary / logistics hub:** a third country may be used only where the existing relationship, sanction/war and route checks permit it. Being a hub does not automatically mean its government sponsors a transaction.

A country can be a buyer for one commodity, a seller for another, and uninvolved in every other deal.

## Motive and commodity rules

The engine reads the existing canonical market catalog and current inventory. It may offer only the existing `RAW_RESOURCE`, `FACTORY_PRODUCT`, and `FOOD_PRODUCT` catalog entries. It must not invent resources, factory types, stock, reserves, or cash.

Examples of evidence-to-motive mapping:

| Evidence in game state | Possible buyer motive | Possible seller motive |
|---|---|---|
| Active factory input demand and unmet supply | Industrial input shortage | Supply a verified exportable input |
| Energy demand / low stock coverage | Energy security | Monetise verified energy surplus |
| Food / fertiliser demand gap | Food and agricultural stability | Monetise verified food or agricultural surplus |
| Active embargo or export directive | Restricted access / policy pressure | State-directed export revenue, only if seller evidence supports it |
| Low foreign-reserve coverage | Foreign-exchange pressure | Earn foreign currency |
| State trading network / public enterprise | State procurement | State-linked commodity monetisation |
| No matching demand or policy evidence | Do not invent a motive | Private broker margin is only a residual possibility, not proof of state involvement |

### Country archetypes (conditional examples, not hard-coded assignments)

- **Iran-like state-linked channel:** when the game records restricted access, an energy/petrochemical surplus, FX pressure, an industrial input gap, and state-linked trading evidence, a state-linked actor may sell canonical energy or industrial products and buy canonical factory inputs, machinery products, food, or agricultural inputs that actually exist in the catalog and are demanded. If those signals are absent, this country should not automatically join.
- **Russia-like resource and industrial channel:** a recorded surplus in energy, metals, fertiliser/chemical or other catalogued goods can create a seller role; export restrictions, FX pressure or industrial input gaps can also create a buyer role. State involvement requires state-policy or ownership evidence.
- **Large industrial-demand country:** a country with substantial recorded factory input demand and low stock coverage may seek metals, energy, chemicals or other catalogued inputs. Its size alone must never trigger a covert purchase.
- **Third-country commercial hub:** a country with usable trade relationships, route capacity and financial/commercial links may appear as a broker or transit hub. It is not labelled a government participant without its own state-actor evidence.
- **Food- or energy-stressed country:** observed shortage and import dependency may create a buyer. It should not buy an unrelated commodity simply because the country is in a particular region.

These are decision templates. Country names are resolved from the canonical country registry; national behavior comes from each turn's data and policy evidence.

## Iran-inspired abstraction

Iran provides a useful strategic example of the *types* of pressures and actors a game can model: state-linked trading entities, restricted energy exports, foreign-currency needs, procurement of constrained industrial inputs, commercial intermediaries, and multi-country shipping/settlement exposure. In OMEGA these become abstract gameplay variables and evidence flags. The game does not reproduce real-world evasion instructions or assume that every intermediary country is government-sponsored.

The design is consistent with public descriptions of Iranian shadow-fleet and shadow-banking networks from official financial authorities. Those reports are used only as high-level inspiration for the existence of state-linked commercial actors, intermediaries, logistics exposure and opaque financial relationships; they are not used as an operational playbook.

## What the player knows

1. A player can see offers that pass the existing stock, policy, relationship, route and pricing checks. Each seller is shown with its canonical country name and ISO-2 flag (or country-code fallback).
2. An offer shows why that seller may sell and why the buyer may want the commodity, but it does not assert a national shortage when no matching demand evidence exists.
3. NPC network reports are stored in the discovering player's Intelligence record only. They are not copied to every country's intelligence state.
4. **LOW confidence:** an unusual covert supply channel is suspected; no counterparties are named.
5. **MEDIUM confidence:** a corridor or at least one participant may be identified; motives remain broad.
6. **HIGH confidence:** participant identities, actor class, policy evidence, motive and possible intermediary candidates may be shown.
7. A country participating in its own transaction knows its own deal. Other countries do not receive automatic omniscient access. They can discover evidence independently through their own customs, trade-surveillance and intelligence capability, or become exposed through a route/checkpoint or investigation.

Country flags and full names are presentation only; the underlying canonical country identity and country-scoped state remain authoritative.

## State involvement and attribution

The engine distinguishes:

- direct government entity evidence;
- state-owned enterprise evidence;
- state-directed trade-policy evidence;
- state-linked trading network evidence;
- policy context only (for example, an embargo);
- private actor with no state link established.

A state policy or embargo can shape a transaction without proving that a ministry or government-owned company is the trader. Intelligence attribution is confidence-gated; a detected shipment is not automatically proof of state sponsorship.

## Runtime and safety invariants

- The player-country committed turn is the only event that advances the autonomous planner.
- At most one new autonomous NPC deal is created per player turn; up to the existing bounded number of pending deals may progress. Do not raise this cap as a substitute for fixing logic.
- Demand, stock, seller inventory, warehouse availability, prices, FX and settlement stay under the existing resource, market, finance and global-trade authorities.
- No covert permit overrides war, blocked routes, missing inventory, protected stock, or authoritative settlement.
- Detection, seizure and fines remain game estimates and bounded enforcement effects.
- UI rendering reads only the selected country's existing deal, case, response and intelligence records. It must not scan or simulate every country's economy at render time.

## Verification focus

The Black Market tests should cover: country display and safe HTML escaping; evidence-based buyer/seller motives; distinction between a state actor and a country that merely has an embargo; state-to-state and state-directed transaction types; player-only intelligence storage; confidence-gated disclosure; and continued stock, permit, route, settlement and performance boundaries.
