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

test('NPC macro uses one source-aware 197-country input bundle, not the six-record lazy country cache', async () => {
  const rules = await readJson('npc_national_macro_economy_rules_v1.json');
  const runtime = await readText('omega_npc_national_macro_economy_runtime_v1.js');
  const builder = await readText('scripts/build_npc_national_macro_economy_inputs_v1.mjs');
  assert.equal(rules.baseline.inputsPath, 'npc_national_macro_economy_inputs_v1.json');
  assert.equal(rules.baseline.source, 'country_general_data_registry_v1.json');
  assert.match(runtime, /baselineInputsByIso3/);
  assert.match(runtime, /NPC_MACRO_INPUT_BUNDLE_ROSTER_OR_SCHEMA_MISMATCH/);
  assert.doesNotMatch(runtime, /g\.Omega\?\.CountryGeneralData/);
  assert.match(builder, /country_general_data_registry_v1\.json/);
  assert.match(builder, /Object\.keys\(outputCountries\)\.length !== 197/);
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
