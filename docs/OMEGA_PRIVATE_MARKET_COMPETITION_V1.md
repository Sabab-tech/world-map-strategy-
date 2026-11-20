# OMEGA Private Market Competition Runtime V1

## Purpose

The competition runtime turns verified private-market concentration into an auditable, country-scoped state response. It is a simulation rule set, not a legal assessment of any real company or jurisdiction.

## Evidence boundary

A market observation is built only from domestic sales whose sale status and payment status are both `SETTLED`, and whose supplier ownership allocation is `RECONCILED`. Reference quotes, unsold inventory, incomplete transfers, unpaid sales and unallocated owner revenue are not counted. Cross-border export receipts remain separate from domestic market share.

The concentration input is the existing private-enterprise lifecycle calculation. Total-market share is read from each company's attributed settled sales as a percentage of all attributed sales for that resource. The private-company HHI is a private-sector-only indicator and must not be described as a full-market HHI.

## Gameplay thresholds

| Stage | Trigger |
|---|---|
| Watch | Private-company HHI >= 1,500 **or** leading private company's total attributed market share >= 30% |
| Investigation | Private-company HHI >= 2,500 **or** leading private company's total attributed market share >= 40% |
| Expansion intervention | Leading company total attributed market share >= 50%, **or** private-company HHI >= 5,000 and leader total share >= 40% |

These thresholds are explicit, deterministic OMEGA gameplay values. They are not statutory thresholds and do not claim that a high HHI alone proves unlawful conduct.

## State intervention

The intervention is a company-and-resource scoped `PRIVATE_FACTORY_EXPANSION_HOLD`. It blocks new private permit approval, increases to a proposed project quantity, construction authorisation and commissioning for the affected company/resource when the proposal is linked to that resource. Existing settled sales are never reversed. Already-operational output is not automatically shut down; this first remedy targets further concentration without deleting assets, cancelling completed contracts or rewriting history.

Before a new expansion hold can be imposed, every recorded private production asset owned by the target company must contain the complete `OMEGA_STATE_CONTROL_RIGHTS_V1` set, including competition oversight, licensing and permits, emergency intervention and `operationalControl: STATE_POLICY_ONLY`, and must carry an active private permit. Missing or incomplete rights produce an auditable `BLOCKED_STATE_CONTROL` case and no active restriction.

A hold remains active while the market remains at least in the watch band. It is released only after three consecutive committed turns below both watch triggers. A same-turn replay is idempotent. Processing is limited to the selected player country.

## Persistence and audit

The trade-domain record is stored at `Game.state.trade[country].marketCompetition`, through the Ministry Interoperability trade command boundary. It records turn, lookback window, observed HHI/share, evidence counts, stage changes, state-control proof, intervention status and resolution reason. The runtime does not mutate the sales ledger, factory outputs, finance ledger or treasury.

## Verification

Run:

```sh
npm run test:private-market-competition
npm run test:private-enterprise-lifecycle
npm run test:private-enterprise-baseline
```

The tests cover settled-evidence filtering, HHI/share thresholds, committed-turn execution, same-turn idempotency, state-control verification, expansion holds and three-turn release.
