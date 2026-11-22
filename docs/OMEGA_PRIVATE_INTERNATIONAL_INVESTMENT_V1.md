# OMEGA Private International Investment Runtime v1

## Scope

The runtime enables the five canonical Universal Private Companies to transfer private capital between any two countries in the canonical 197-country ISO3 roster.

The runtime does not create a second factory registry. Government-owned and private-owned factories continue to use the existing country `economy.productionAssets` pool and the existing Resource Industrial Network, construction, commissioning, production and employment systems.

## Universal companies

The only accepted company IDs are:

- `AURORA_INDUSTRIAL_GROUP`
- `MERIDIAN_ENGINEERING_GROUP`
- `NOVA_CONSUMER_INDUSTRIES`
- `ATLAS_TECHNOLOGY_CORPORATION`
- `TERRA_INFRASTRUCTURE_GROUP`

A company identity is shared across countries. Investor country and host country are stored separately on every investment receipt and capital lot.

## API

The browser/server runtime is exposed as:

- `Omega.PrivateInternationalInvestmentRuntimeV1`
- `OmegaPrivateInternationalInvestmentRuntimeV1`

Example:

```js
const result = await Omega.PrivateInternationalInvestmentRuntimeV1.invest({
  investorCountryId: 'BGD',
  hostCountryId: 'USA',
  companyId: 'AURORA_INDUSTRIAL_GROUP',
  requestId: 'BGD-USA-AURORA-FACTORY-001',
  amount: 11000
});
```

Country IDs must resolve to canonical ISO3 identities. `amount` is denominated in the investor company's local wallet currency and must be cent-exact. The runtime uses the current OMEGA simulation FX rates to convert the capital into the host country's company-account currency. It does not execute a real-world currency exchange.

A request ID is an idempotency key. Replaying the same investor, host, company, request ID and amount does not create another credit or debit. A different amount under the same transfer ID is rejected.

## Settlement and ownership

Each transfer runs through the existing Finance Ministry StateTransaction boundary, one country at a time:

1. Reserve the investor company's available capital in its Finance-owned escrow balance.
2. Credit the host country's matching Universal Private Company wallet and create a foreign-capital lot.
3. Debit the investor escrow and record the investor-side settlement.
4. Confirm the host receipt as settled.

Each step has a transfer-specific command and ledger identity. If host credit fails, the investor reservation is refunded. If a later settlement step is interrupted, the transfer is marked pending and can be resumed with `reconcileTransfer({ investorCountryId, hostCountryId, companyId, requestId })`.

The runtime never debits or credits sovereign Treasury balances. The foreign-capital lot records the investor country, company, transfer ID, host country, local amount and currency.

## Factory, production and employment effects

An investment receipt alone is not a factory. The host-country company must use its funded wallet in the existing Private Enterprise lifecycle. Its normal proposal, government decision/permit, input-supply preflight, construction CAPEX, commissioning and production-gate requirements still apply.

When foreign capital funds a proposal, the lifecycle carries the investment-lot provenance to the construction project and then to the commissioned factory asset. The asset remains in the same `economy[country].productionAssets` pool as other factories. Its existing production and factory-employment reconciliation controls actual output and jobs.

The NPC national macro runtime reads only settled foreign-investment receipts and FDI-attributed operational/commissioned factory assets. It exposes received investment, newly commissioned FDI capital expenditure, foreign-funded factories and the jobs supported/filled by those factories. Its GDP/investment progression uses explicitly configured model sensitivities; it does not overwrite Finance-owned GDP or manufacture national-account transactions.

## All-country and boot behavior

The five-company identity set and 197-country private-factory ownership baseline are pre-existing authoritative data. Investor wallets are initialized lazily from each country's existing local-currency private-company capital plan; this is allowed for a foreign investor without changing the selected player country. Ordinary non-player private-enterprise panel operations remain player-country-scoped.

The runtime is loaded through the browser index, server-generated index and offline service-worker shell. The offline shell generation is incremented with the added asset.

## Current boundary

The runtime provides an explicit cross-border investment action and reconciliation API for all canonical countries. It does not autonomously choose investment destinations or issue NPC investment decisions. NPC investments require an explicit caller/decision policy to invoke `invest`; this avoids inventing investment intent, budgets, country risk decisions or factory approvals.
