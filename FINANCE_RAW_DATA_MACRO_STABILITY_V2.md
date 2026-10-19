# OMEGA Raw Financial Data and Macro Stability Runtime v2

## Added modules
- \`economy_raw_financial_data_v2.json\`: a consistent 68-field raw financial schema for all 249 country/territory identities in the repository. Existing \`economy.json\` and \`population.json\` source records are copied without rewriting them. Derived ratios are separated.
- \`finance_macro_stability_rules_v1.json\`: JSON-configured policy presets, control limits, stability-score weights, and automatic stabilizer thresholds.
- \`omega_macro_stability_runtime_v1.js\`: additive runtime for GDP growth and public spending policy, unemployment response, automatic stabilizers, and country-specific stability indicators.
- \`omega_macro_stability_v1.css\`: responsive Finance Ministry macro-control panel.
- \`test/omega_macro_stability_runtime_v1.test.mjs\`: registry, policy isolation, preservation, and duplicate-turn tests.

## Data caveat
The source baseline remains 2015, mapped from the repository's existing \`economy.json\` and \`population.json\` via \`economy_global_profiles_v1.json\`. Current repository coverage has 230 economy records and 195 population records among the 249 identities. This commit does not independently validate historical values against current World Bank, IMF, or national central-bank datasets. Additional fields for tax receipts, spending, debt composition, M2, sector output, current account, policy rates, and banking capital/NPLs are present in every country schema but stay \`null\` until a real source observation is available. Null never means zero.

## Runtime ownership
The existing Finance Ministry remains responsible for Treasury transactions, revenue collection, borrowing, debt repayment, and sector budget allocation. The existing Forex/Monetary Engine remains responsible for currency markets, FX settlement, exchange regime, money-supply policy, and inflation targets. This extension adds GDP-growth/spending policy presets and counter-cyclical stabilizers, uses the existing simulation turn, and stores state under each country's existing Finance bucket without deleting unrelated fields. User-facing financial actions are restricted to the active player country.

The stability score and policy response are game mechanics, not official national accounts, forecasts, or sovereign credit ratings.
