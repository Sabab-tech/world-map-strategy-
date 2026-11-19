import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const readText = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('economic baseline coverage is explicitly historical and incomplete', async () => {
  const registry = await readJson('economy_global_profiles_v1.json');
  assert.equal(registry.metadata.baselineYear, 2015);
  assert.equal(registry.metadata.countryCount, 249);
  assert.equal(registry.metadata.mappedEconomicProfiles, 230);
  assert.equal(registry.metadata.mappedPopulationProfiles, 195);
  assert.equal(registry.metadata.coverage.missingEconomicProfileCount, 19);
  assert.match(registry.metadata.provenanceWarning, /not been independently revalidated/i);
  assert.equal(registry.metadata.dataPolicy.includes('no missing national statistics are invented'), true);
});

test('NPC macro remains an evidence projection on the existing bounded scheduler', async () => {
  const rules = await readJson('npc_national_macro_economy_rules_v1.json');
  const runtime = await readText('omega_npc_national_macro_economy_runtime_v1.js');
  assert.equal(rules.baseline.missingValuePolicy, 'NULL_REMAINS_UNOBSERVED');
  assert.equal(rules.scheduler.existingSchedulerOnly, true);
  assert.deepEqual(rules.scheduler.tiers, ['ACTIVE', 'MACRO']);
  assert.equal(rules.scheduler.playerCountryAutomation, false);
  assert.equal(rules.scheduler.perTurnNetworkIo, false);
  assert.equal(rules.persistence.ownerMinistry, 'economy');
  assert.equal(rules.persistence.statePath, 'economy.npcMacroEconomy');
  assert.equal(rules.persistence.sameTurnPolicy, 'ONE_CHECKPOINT_PER_COUNTRY_PER_COMMITTED_TURN');
  assert.match(runtime, /PLAYER_COUNTRY_REMAINS_PLAYER_CONTROLLED/);
  assert.match(runtime, /EVIDENCE_BACKED_MODELLED_PROJECTION_NOT_OFFICIAL_NATIONAL_ACCOUNTS/);
  assert.match(runtime, /PROGRESSION_CALIBRATED/);
});

test('factory output evidence keeps resource identities and declared units separate', async () => {
  const runtime = await readText('omega_npc_national_macro_economy_runtime_v1.js');
  const industrial = await readText('omega_resource_industrial_network_v1.js');
  assert.match(runtime, /resource\.finishedGoodsLedger/);
  assert.match(runtime, /record\.createdBatchIds/);
  assert.match(runtime, /resourceId\s*\+\s*['"]\|['"]\s*\+\s*unit/);
  assert.match(runtime, /UNOBSERVED/);
  assert.match(industrial, /SIMULATED_PROCESSING_YIELD/);
  assert.match(industrial, /AVAILABLE_TO_ECONOMY/);
});

test('trade evidence is based on settled country ledgers, not pending orders', async () => {
  const runtime = await readText('omega_npc_national_macro_economy_runtime_v1.js');
  const trade = await readText('omega_global_trade_system.js');
  const nationalRules = await readJson('national_accounts_rules_v1.json');
  assert.match(runtime, /countryRecord\(root, 'trade', profile, countryId\)/);
  assert.match(runtime, /trade\?\.importLedger/);
  assert.match(runtime, /trade\?\.exportLedger/);
  assert.match(runtime, /rowTurn\s*>\s*previousTurn/);
  assert.match(trade, /status:'SETTLED'/);
  assert.match(trade, /buyerCurrency/);
  assert.match(trade, /sellerCurrency/);
  assert.equal(nationalRules.accounting.pendingTradePolicy, 'EXCLUDE_UNSETTLED');
  assert.equal(nationalRules.accounting.currencyPolicy, 'NEVER_SUM_ACROSS_CURRENCIES');
});

test('National Accounts fails closed unless production, expenditure and income share period and currency', async () => {
  const accounts = await readText('omega_national_accounts_runtime_v1.js');
  const rules = await readJson('national_accounts_rules_v1.json');
  assert.match(accounts, /names=\['production','expenditure','income'\]/);
  assert.match(accounts, /ALL_THREE_APPROACHES_REQUIRED/);
  assert.match(accounts, /GDP_APPROACH_BASIS_MISMATCH/);
  assert.equal(rules.accounting.gdpRequiresAllThreeApproaches, true);
  assert.equal(rules.accounting.missingValuePolicy, 'UNOBSERVED_NOT_ZERO');
});

test('Treasury and goods stock-flow checks preserve source identities and do not fabricate missing flows', async () => {
  const accounts = await readText('omega_national_accounts_runtime_v1.js');
  assert.match(accounts, /opening\+inflows-outflows/);
  assert.match(accounts, /TREASURY_STOCK_FLOW_MISMATCH/);
  assert.match(accounts, /resourceId/);
  assert.match(accounts, /unit/);
  assert.match(accounts, /OPENING_OR_FLOW_COMPONENTS_UNOBSERVED/);
});

test('the Phase 3C matrix calls out modeled-versus-observed boundaries and open Phase 4 gates', async () => {
  const matrix = await readText('docs/OMEGA_PHASE3C_MACRO_EVIDENCE_MATRIX_V1.md');
  assert.match(matrix, /not externally revalidated/i);
  assert.match(matrix, /does \*\*not\*\* demonstrate empirical model calibration/i);
  assert.match(matrix, /transaction FX/i);
  assert.match(matrix, /Phase 4A/i);
  assert.match(matrix, /zero skipped tests/i);
  assert.match(matrix, /Physical-device QA/i);
});


test('Phase 3C function-level ownership map pins the live ledgers and scheduled handlers', async () => {
  const [
    finance,
    macro,
    transmission,
    fx,
    trade,
    industrial,
    resourceEconomy,
    npc,
    accounts,
    transaction,
    scheduler,
    npcRules,
    accountRules
  ] = await Promise.all([
    readText('omega_finance_ministry_runtime_v1.js'),
    readText('omega_macro_stability_runtime_v1.js'),
    readText('omega_economic_transmission_runtime_v1.js'),
    readText('omega_forex_monetary_engine_v1.js'),
    readText('omega_global_trade_system.js'),
    readText('omega_resource_industrial_network_v1.js'),
    readText('omega_resource_economy_runtime_v2.js'),
    readText('omega_npc_national_macro_economy_runtime_v1.js'),
    readText('omega_national_accounts_runtime_v1.js'),
    readText('omega_ministry_state_transaction.js'),
    readText('omega_world_simulation_scheduler_v1.js'),
    readJson('npc_national_macro_economy_rules_v1.json'),
    readJson('national_accounts_rules_v1.json')
  ]);

  // Finance remains the sole fiscal-period and Treasury cash authority.
  assert.match(finance, /function ensureFinanceState\(/);
  assert.match(finance, /function fiscalFlowComponents\(model\)/);
  assert.match(finance, /currentYearTaxRevenueUsd/);
  assert.match(finance, /function advanceFinanceProfile\(/);
  assert.match(finance, /registerCountryHandler\('omega-finance-ministry',[\s\S]*?priority:15/);

  // Country macro and transmission remain model projections on the same scheduler.
  assert.match(macro, /function advanceProfile\(p,t,dt,years,root\)/);
  assert.match(macro, /financeBucket\(root,p,true\)/);
  assert.match(macro, /registerCountryHandler\('omega-macro-stability',[\s\S]*?priority:10/);
  assert.match(transmission, /function updateOne\(profile, turnNumber, dt, globalInflationPct, simDay\)/);
  assert.match(transmission, /economicTransmissionByCountry/);
  assert.match(transmission, /registerCountryHandler\('omega-economic-transmission',[\s\S]*?priority: 20/);

  // FX retains a central currency tick and separate targeted / full country projections.
  assert.match(fx, /function simulationTick\(turn, durationMs\)/);
  assert.match(fx, /function syncCountry\(countryValue\)/);
  assert.match(fx, /function syncAllCountries\(\)/);
  assert.match(fx, /OMEGA_FINANCE_STATE_UPDATED/);

  // Trade only posts settled seller records and preserves settlement identity and currency.
  assert.match(trade, /function settleRequest\(req\)/);
  assert.match(trade, /function sellerLedgerHandler\(cmd,ctx\)/);
  assert.match(trade, /SELLER_SETTLEMENT_ID_REQUIRED/);
  assert.match(trade, /ledgerType:'SELLER_SETTLEMENT'/);
  assert.match(trade, /buyerCurrency/);
  assert.match(trade, /sellerCurrency/);
  assert.match(trade, /function processScheduledCountry\(countryId,context=\{\}\)/);

  // Physical output is committed once in Resource; Economy holds an event-driven mirror.
  assert.match(industrial, /function commitFactoryCycleImmediately\(/);
  assert.match(industrial, /r\.finishedGoodsLedger\.push\(\{transactionId,countryId:cid/);
  assert.match(industrial, /authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE_TO_ECONOMY'/);
  assert.match(resourceEconomy, /function finishedGoodsEventHandler\(e\)/);
  assert.match(resourceEconomy, /scope\.finishedGoodsRows\.push\(row\)/);
  assert.match(resourceEconomy, /function publishTurnPublication\(scope,publication\)/);
  assert.match(resourceEconomy, /function economyPublishHandler\(cmd,ctx\)/);

  // NPC macro reads source evidence and checkpoints through the Economy-owned transaction.
  assert.match(npc, /function buildIndustrialOutputEvidence\(/);
  assert.match(npc, /function buildSettledTradeEvidence\(/);
  assert.match(npc, /function deriveProgression\(/);
  assert.match(npc, /context\.stateTransaction\.set\(runtime\.rules\.persistence\.statePath, checkpoint\)/);
  assert.equal(npcRules.persistence.ownerMinistry, 'economy');
  assert.equal(npcRules.persistence.statePath, 'economy.npcMacroEconomy');
  assert.equal(npcRules.scheduler.priority, 30);

  // National Accounts reads the source domains but writes only its own country checkpoint.
  assert.match(accounts, /function buildStatement\(countryId,profile,root,turn\)/);
  assert.match(accounts, /const gdp=reconcileGDP\(\),goods=reconcileGoodsFlow\(\[\]\)/);
  assert.match(accounts, /context\.stateTransaction\.set\(path,saved\)/);
  assert.equal(accountRules.persistence.ownerMinistry, 'economy');
  assert.equal(accountRules.persistence.statePath, 'economy.nationalAccounts');
  assert.equal(accountRules.scheduler.priority, 40);
  assert.equal(accountRules.accounting.ledgerPolicy, 'READ_ONLY_NO_REPOST');

  // State transactions scope a domain path to the handler's canonical country.
  assert.match(transaction, /_countryContainer\(path,create\)/);
  assert.match(transaction, /countryBucketKey\(this\.state\[domain\],this\.countryId\)/);
  assert.match(transaction, /STATE_PATH_NOT_OWNED_BY_MINISTRY/);

  // One scheduler orders country handlers and bounds active/macro work.
  assert.match(scheduler, /function registerCountryHandler\(id,handler,options=\{\}\)/);
  assert.match(scheduler, /function runHandlers\(cid,tier,ctx\)/);
  assert.match(scheduler, /function selectMacro\(ids,meta,turn,player/);
  assert.match(scheduler, /MACRO_COUNTRIES_PER_TURN:8/);
  assert.match(scheduler, /MOBILE_TURN_BUDGET_MS:28/);
  assert.match(scheduler, /DESKTOP_TURN_BUDGET_MS:52/);
});
