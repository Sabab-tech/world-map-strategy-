# OMEGA Bilateral Trade System v1

## Purpose and boundary

Bilateral Trade is a negotiated sovereign-to-sovereign contract channel alongside, not a replacement for, the Global Commodity Market / Open Market. Open Market continues to discover executable prices and offers. Bilateral Trade creates a private contract between two named countries, records each party's approval, and routes any procurement through the existing Global Trade settlement authority.

The feature does not create commodity identities, mine output, inventory, Treasury cash, FX reserves, route capacity, prices, or shipment arrival times. It does not own a second shipment ledger.

## Four connected stages

1. **On-demand market intelligence.** A user requests a report for one counterparty and an optional commodity. The report stores reportId, timestamp, game turn and deterministic dataVersion. It includes domestic production and consumption, current inventory, import demand, potential exportable surplus, inbound shipments, local price, route capacity, supplier shipment reliability, alternative suppliers, diplomatic relations, sanctions/war status, currency, FX and current bilateral agreements. Reports are generated on demand, not every frame or turn.
2. **Feasibility and evidence assessment.** Every metric is KNOWN, ESTIMATED or UNKNOWN, with a source and qualification. Explicit recorded values are KNOWN; production-minus-consumption estimates are ESTIMATED and disclose what they omit; absent, conflicting or incomplete records are UNKNOWN. A missing shipment ledger is different from an existing empty ledger. Treasury liquidity is not represented as freely transferable FX reserves.
3. **Negotiation and agreement.** The offer records buyer, seller, resource, quantity per shipment, unit price in the seller's local settlement currency, duration and optional delivery/route conditions. This version supports settlement on delivery only; prepaid, credit and net terms are rejected until the authoritative settlement engine supports them. The same agreement ID and terms version are written to each party's Trade state through the existing Ministry State Transaction mesh. An offerer's assent is recorded when the offer is created. A counteroffer increments the terms version; the countering party accepts that version and the other party must explicitly accept it. An agreement is ACTIVE only when both countries hold the same active version and both have accepted that version. Incomplete mirror writes fail closed.
4. **Procurement and settlement.** The buyer can submit an agreed import request only while both agreement mirrors are active, in date, and the requested commodity, quantity and price match the terms. The request goes to OmegaGlobalTrade.createRequest. Counterparty review, seller-stock checks, export policy, logistics, FX, buyer liquidity, physical transfer, Treasury settlement, import/export ledgers and the durable internationalShipmentLedger remain owned by their existing engines.

## State ownership

- Requester's reports: trade.<requesterISO3>.marketIntelligenceReports.
- Bilateral agreement mirror: trade.<partyISO3>.bilateralAgreementLedger.
- Request linkage: trade.<buyerISO3>.importRequests[].bilateralAgreementId.
- Durable international movement: the existing trade.<partyISO3>.internationalShipmentLedger, with shared shipment identity on exporter and importer sides as implemented by the shipment-ledger authority.

The new runtime registers two Trade-owned State Transaction commands. It adds no scheduler, world scan, timer or per-frame loop. Market intelligence is an on-demand snapshot; it is not a live feed and is not silently refreshed after market state changes.

## Failure and evidence rules

- A report is not produced for a self-country or unresolved country-pair request.
- A missing source remains UNKNOWN; no missing quantity becomes zero.
- A present empty shipment ledger supports a zero in-transit count. A missing ledger or conflicting duplicate IDs does not.
- Supplier reliability requires terminal shipment outcomes; pending shipments do not count as success.
- Potential exportable surplus is an estimate before reserves, target stock, existing contracts, inventory changes and route constraints. It is not a promise of deliverable stock.
- Bilateral approval is not a Treasury reservation or a guaranteed shipment. The established settlement engine can still reject an underfunded, blocked, sanctioned, stock-deficient or logistically infeasible trade.
- Duplicate agreement IDs cannot change the original buyer, seller or commodity identity. A request tied to an agreement ID must match its active terms; an unrelated treaty or a generic trade-agreement flag cannot override that exact agreement check.

## Current limits

- Reports use evidence already available in the selected game state; this version does not fetch external official statistics or claim real-time real-world market quotations.
- Requester and counterparty Treasury liquidity are shown in their own national currencies. FX reserve balances are read separately from the existing Finance/FX economy reserve field and are not added to Treasury cash. Reserve baselines can be modeled or legacy-source records; the report does not silently relabel them as current official observations.
- Reliability is a historical game-ledger ratio, not a prediction.
- Exportable surplus does not yet reserve cumulative contract quantities across multiple agreements. The per-shipment quantity and price are checked at procurement; seller inventory, existing reservations and Treasury remain enforced at settlement.
- Multi-turn travel ETA is not estimated unless a separate authoritative route travel-time model exists. Shipment state remains owned by the durable shipment ledger.
