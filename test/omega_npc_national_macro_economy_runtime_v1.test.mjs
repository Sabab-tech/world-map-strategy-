import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const runtimeSource = readFileSync('omega_npc_national_macro_economy_runtime_v1.js', 'utf8');
const transactionSource = readFileSync('omega_ministry_state_transaction.js', 'utf8');
const rules = JSON.parse(readFileSync('npc_national_macro_economy_rules_v1.json', 'utf8'));
const indexHtml = readFileSync('index.html', 'utf8');
const serverBootstrap = readFileSync('server_bootstrap.js', 'utf8');
const offlineShell = readFileSync('omega-offline-map-sw.js', 'utf8');

function createHarness(options = {}) {
  const state = options.state || {
    simulation: { turn: 3, session: { playerCountryId: 'AAA' } },
    economy: {
      AAA: { productionCapacity: 100, productionAssets: [] },
      BBB: { gdp: 2500000, gdp_growth: 3, inflation: 5, unemployment_rate: 7,
        financialTransmission: { producerCostIndex: 102, cpiIndex: 104 },
        productionCapacity: 275, productionAssets: [{ id: 'asset-1' }, { id: 'asset-2' }] },
      CCC: { productionCapacity: null, productionAssets: [] }
    },
    projects: {
      BBB: { registry: [{ status: 'UNDER_CONSTRUCTION' }, { status: 'COMPLETED' }, { status: 'BLOCKED' }] },
      CCC: { registry: [] }
    },
    resource: {
      BBB: {
        batches: [
          { batchId:'OUTPUT-IRON-1', resourceId:'iron_ore', quantity:10, unit:'TONNES' },
          { batchId:'OUTPUT-COTTON-1', resourceId:'cotton', quantity:500, unit:'KG' }
        ],
        finishedGoodsLedger: [
          { transactionId:'FACTORY-1', status:'AVAILABLE_TO_ECONOMY',
            createdBatchIds:['OUTPUT-IRON-1','OUTPUT-COTTON-1'], turn:3 }
        ]
      }
    },
    foreign: {
      BBB: {
        relations: {
          AAA: { overall:80, trade:90, trust:80, political:75, trade_agreement:true, war_state:false, sanctions:false },
          CCC: { overall:10, trade:5, trust:10, political:5, war_state:true, sanctions:true }
        },
        treaties: { AAA: { status:'ACTIVE', treatyType:'TRADE', activatedTurn:2 } },
        policy: { stance:'COOPERATIVE' }
      }
    },
    trade: {
      BBB: {
        importTariffPct:10,
        policy: { stance:'OPEN_MARKET' },
        importLedger:[{settlementId:'IMPORT-1',requestId:'IMPORT-1',resourceId:'iron_ore',quantity:2,totalValue:200,currency:'LCU',sourceCountryId:'AAA',turn:3}],
        exportLedger:[{settlementId:'EXPORT-1',requestId:'EXPORT-1',resourceId:'cotton',quantity:3,totalValue:300,currency:'LCU',buyerCountryId:'AAA',turn:3}],
        globalTradeLedger: { settlements: [
          { status: 'SETTLED', settlementId: 'SET-1' },
          { status: 'PENDING', settlementId: 'PENDING-1' },
          { status: 'SETTLED', settlementId: 'SET-2' }
        ] }
      }
    },
    finance: {
      BBB: { available: 4000, omegaFinance: { ledger: [{ action: 'EXPENSE' }, { action: 'EXPENSE_REFUND' }] } }
    }
  };
  const profiles = [
    { iso3: 'AAA', countryCode: 'AA', name: 'Alpha', economyKey: 'ALPHA', profileStatus: 'OBSERVED_LOCAL_BASELINE',
      indicators: { gdpCurrentUsd: 1000000, gdpGrowthPct: 2 }, metricAvailability: { gdpCurrentUsd: true, gdpGrowthPct: true },
      provenance: { economicSource: 'economy.json' } },
    { iso3: 'BBB', countryCode: 'BB', name: 'Beta', economyKey: 'BETA', profileStatus: 'OBSERVED_LOCAL_BASELINE',
      indicators: { gdpCurrentUsd: 2500000, gdpGrowthPct: null, inflationRatePct:5,
        unemploymentRatePct:7, grossCapitalFormationPctGdp:25, exchangeRateLocalPerUsd:100 },
      metricAvailability: { gdpCurrentUsd:true, gdpGrowthPct:false, inflationRatePct:true,
        unemploymentRatePct:true, grossCapitalFormationPctGdp:true, exchangeRateLocalPerUsd:true },
      provenance: { economicSource: 'economy.json' } },
    { iso3: 'CCC', countryCode: 'CC', name: 'Gamma', economyKey: 'GAMMA', profileStatus: 'UNAVAILABLE',
      indicators: { gdpCurrentUsd: null, gdpGrowthPct: null }, metricAvailability: { gdpCurrentUsd: false, gdpGrowthPct: false },
      provenance: {} }
  ];
  const metadata = { baselineYear: 2015, economicBaselineSource: 'economy.json',
    provenance: { status: 'EXISTING_GAME_BASELINE_NOT_EXTERNALLY_REVALIDATED' } };
  const manifest = { schemaVersion: '1.0.0', scope: 'fixture roster resolved through canonical country identities',
    counts: { countryEntities: profiles.length }, countries: { AAA: {}, BBB: {}, CCC: {} } };
  const fixtureRules = structuredClone(rules);
  const fixtureInputs = {
    metadata: {
      datasetId: 'OMEGA_NPC_NATIONAL_MACRO_ECONOMY_INPUTS_V1',
      schemaVersion: '1.0.0',
      sourceMode: 'TEST_FIXTURE',
      sourceRegistry: 'country_general_data_registry_v1.json',
      countryCount: profiles.length,
      metricIds: fixtureRules.baseline.metrics.map(rule => rule.id)
    },
    countries: Object.fromEntries(profiles.map(profile => [profile.iso3, {
      metrics: Object.fromEntries(fixtureRules.baseline.metrics.map(rule => {
        const raw = profile.indicators?.[rule.profileMetric];
        const value = typeof raw === 'number' && Number.isFinite(raw) &&
          profile.metricAvailability?.[rule.profileMetric] !== false ? raw : null;
        const isCurrentGdp = profile.iso3 === 'BBB' && rule.id === 'gdpCurrentUsd' && value !== null;
        const available = value !== null;
        return [rule.id, {
          value,
          year: available ? (isCurrentGdp ? 2024 : 2015) : null,
          sourceStatus: isCurrentGdp ? 'WORLD_BANK_API_OBSERVATION' :
            (available ? 'LEGACY_2015_BASELINE_NOT_EXTERNALLY_REVALIDATED' : 'NO_SOURCE_OBSERVATION'),
          sourceId: available ? (isCurrentGdp ? 'WORLD_BANK_WDI' : 'economy.json') : null,
          sourceName: available ? (isCurrentGdp ? 'World Bank Indicators API v2' : 'Legacy country economy profile') : null,
          method: available ? (isCurrentGdp ? 'SOURCE_OBSERVATION' : 'LEGACY_PROFILE_VALUE') : null,
          indicatorCode: null,
          sourceUrl: null,
          confidence: available ? (isCurrentGdp ? 0.92 : 0.46) : null,
          dataGap: available ? (isCurrentGdp ? null : 'LEGACY_SOURCE_NOT_REVALIDATED') : 'MISSING_OBSERVATION',
          note: available ? null : 'No source observation in the fixture.'
        }];
      }))
    }]))
  };
  let generalDataCalls = 0;
  const countryGeneralDataApi = {
    getCountryRecord() { generalDataCalls += 1; return null; }
  };
  const countryHandlers = new Map();
  const commandHandlers = new Map();
  const commands = new Map();
  const events = [];
  const context = {
    console, Math, Number, String, Object, Array, Map, Set, Promise, JSON, WeakMap, Date,
    Game: { state },
    gameState: state,
    Omega: {
      Simulation: { world: { state }, getPlayerCountryId: () => state.simulation?.session?.playerCountryId || null },
      WorldSimulationScheduler: {
        registerCountryHandler(id, handler, opts) {
          countryHandlers.set(id, { handler, opts });
          return () => countryHandlers.delete(id);
        }
      },
      MinistryInteroperability: {
        registerCommandHandler(type, owner, handler) {
          commandHandlers.set(type, { owner, handler });
          return { commandType: type, ownerMinistry: owner };
        },
        dispatchCommand(source, actionId, countryId, payload, options = {}) {
          const commandType = options.commandType || actionId;
          const commandId = options.commandId;
          const prior = commands.get(commandId);
          if (prior) return { ...prior, duplicate: true, idempotentReplay: true };
          const registered = commandHandlers.get(commandType);
          if (!registered) return { status: 'UNHANDLED', reason: 'HANDLER_MISSING' };
          const tx = context.Omega.MinistryStateTransaction.create(registered.owner, countryId,
            options.turn, commandId, state, { commandType });
          try {
            const result = registered.handler({ payload, commandId, commandType }, {
              countryId, simulationTurn: options.turn, stateTransaction: tx,
              emitEvent: (type, body) => events.push({ type, body })
            });
            let transaction = null;
            if (result?.accepted !== false) transaction = tx.commit();
            else tx.rollback();
            const output = { status: result?.accepted === false ? 'FAILED' : 'APPLIED', result, transaction };
            commands.set(commandId, output);
            return output;
          } catch (error) {
            tx.rollback();
            return { status: 'FAILED', reason: String(error?.message || error) };
          }
        }
      },
      CountryGeneralData: countryGeneralDataApi
    },
    OmegaFinanceMinistry: {
      init: async () => ({ initialized: true }),
      getProfiles: () => profiles,
      resolveCountry: id => profiles.find(profile => profile.iso3 === String(id).toUpperCase() ||
        profile.countryCode === String(id).toUpperCase() || profile.economyKey === String(id).toUpperCase()) || null,
      getProfileMetadata: () => metadata
    },
    OmegaCanonicalIdentityRegistry: {
      resolveCountry(value) {
        const profile = profiles.find(row => [row.iso3, row.countryCode, row.economyKey, row.name]
          .some(alias => String(alias).toUpperCase() === String(value).toUpperCase()));
        return profile ? { id: profile.iso3, raw: { raw: profile } } : null;
      }
    },
    __OMEGA_NPC_MACRO_FIXTURES__: { manifest, rules: fixtureRules, inputs: fixtureInputs },
    addEventListener() {}
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(transactionSource, context, { filename: 'omega_ministry_state_transaction.js' });
  vm.runInNewContext(runtimeSource, context, { filename: 'omega_npc_national_macro_economy_runtime_v1.js' });
  return { context, state, profiles, countryHandlers, commandHandlers, commands, events,
    get generalDataCalls() { return generalDataCalls; } };
}

test('NPC macro runtime resolves the manifest dynamically and registers only ACTIVE/MACRO tiers', async () => {
  const h = createHarness();
  const result = await h.context.Omega.NpcNationalMacroEconomy.init();
  assert.equal(result.ready, true);
  assert.equal(result.coreCountryCount, 3);
  assert.equal(result.baselineInputCountryCount, 3);
  assert.equal(result.baselineInputMetricIds.length, 10);
  assert.equal(result.baselineInputSourceRegistry, 'country_general_data_registry_v1.json');
  assert.equal(h.countryHandlers.size, 1);
  const registration = [...h.countryHandlers.values()][0];
  assert.deepEqual(Array.from(registration.opts.tiers), ['ACTIVE', 'MACRO']);
  assert.equal(h.commandHandlers.size, 1);
  assert.equal([...h.commandHandlers.values()][0].owner, 'economy');
});

test('197-country input bundle replaces the bounded lazy cache for all macro baseline metrics', async () => {
  const h = createHarness();
  const diagnostics = await h.context.Omega.NpcNationalMacroEconomy.init();
  assert.equal(diagnostics.baselineInputCountryCount, 3);
  assert.equal(diagnostics.baselineInputMetricIds.length, 10);
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  assert.equal(h.state.economy.BBB.npcMacroEconomy.baseline.metrics.gdpCurrentUsd.year, 2024);
  assert.equal(h.generalDataCalls, 0, 'the six-entry general-data cache must not be consulted for NPC macro baselines');
});

test('NPC macro checkpoint uses live country state and records only SETTLED trade ledger rows', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  const result = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result));
  const checkpoint = h.state.economy.BBB.npcMacroEconomy;
  assert.equal(checkpoint.countryId, 'BBB');
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.value, 2500000);
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.year, 2024);
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.authority, 'COUNTRY_GENERAL_DATA_WORLD_BANK_API_OBSERVATION');
  assert.equal(checkpoint.baseline.metrics.gdpGrowthPct.value, null);
  assert.equal(checkpoint.baseline.metrics.gdpGrowthPct.availability, 'UNAVAILABLE');
  assert.equal(checkpoint.liveActivity.recordedProductionCapacity.value, 275);
  assert.equal(checkpoint.liveActivity.recordedProductionAssetCount.value, 2);
  assert.equal(checkpoint.liveActivity.autonomousProjectStatusCounts.value.active, 1);
  assert.equal(checkpoint.liveActivity.autonomousProjectStatusCounts.value.completed, 1);
  assert.equal(checkpoint.liveActivity.settledInternationalTradeCount.value, 2);
  assert.equal(checkpoint.liveActivity.financeLedgerEntryCount.value, 2);
  assert.equal(checkpoint.liveActivity.treasuryBalanceAvailability.value, true);
  assert.equal(checkpoint.liveActivity.industrialOutputByResourceUnit.availability, 'AVAILABLE');
  assert.deepEqual(Object.keys(checkpoint.liveActivity.industrialOutputByResourceUnit.value.rows).sort(),
    ['cotton|KG','iron_ore|TONNES']);
  assert.equal(checkpoint.liveActivity.settledTradeActivity.value.importSettlementCount, 1);
  assert.equal(checkpoint.liveActivity.settledTradeActivity.value.exportSettlementCount, 1);
  assert.equal(checkpoint.liveActivity.diplomaticPolicyContext.value.playerTradeAgreement, true);
  assert.equal(checkpoint.liveActivity.diplomaticPolicyContext.value.activeTradeTreatyCount, 1);
  assert.equal(checkpoint.liveActivity.diplomaticPolicyContext.value.importTariffPct, 10);
  assert.equal(checkpoint.progression.status, 'PROGRESSION_CALIBRATED');
  assert.equal(checkpoint.progression.industrialOutputIndex, 100);
  assert.equal(checkpoint.progression.investmentBaselineGrossCapitalFormationPctGdp, 25);
  assert.ok(checkpoint.progression.gdpProjectionUsd > 0);
  assert.equal(Object.hasOwn(checkpoint, 'treasuryBalanceUsd'), false);
  assert.equal(Object.keys(checkpoint).some(key => /inventory|batches|shipment/i.test(key)), false);
});

test('the selected player and countries outside the 197-core source manifest are never NPC-processed', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  assert.equal((await h.context.Omega.NpcNationalMacroEconomy.processCountry('AAA', { turn: 3, state: h.state })).reason,
    'PLAYER_COUNTRY_REMAINS_PLAYER_CONTROLLED');
  assert.equal((await h.context.Omega.NpcNationalMacroEconomy.processCountry('ZZZ', { turn: 3, state: h.state })).reason,
    'COUNTRY_NOT_IN_CORE_GAME_ROSTER');
  assert.equal(h.state.economy.AAA.npcMacroEconomy, undefined);
  assert.equal(h.state.economy.ZZZ, undefined);
});

test('unavailable baseline fields remain null and no modelled value is invented', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('CCC', { turn: 3, state: h.state });
  const checkpoint = h.state.economy.CCC.npcMacroEconomy;
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.value, null);
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.availability, 'UNAVAILABLE');
  assert.equal(checkpoint.baseline.metrics.gdpGrowthPct.value, null);
  assert.equal(checkpoint.baseline.metrics.gdpGrowthPct.availability, 'UNAVAILABLE');
  assert.equal(checkpoint.progression.gdpProjectionUsd, null);
  assert.equal(checkpoint.progression.gdpGrowthProjectionPct, null);
  assert.equal(checkpoint.provenance.progressionStatus, checkpoint.progression.status);
});

test('same-turn replay is idempotent and a later turn persists deterministic deltas', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  const first = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  const repeat = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  assert.equal(first.status, 'CHECKPOINTED');
  assert.equal(repeat.status, 'ALREADY_PROCESSED');
  assert.equal(h.state.economy.BBB.npcMacroEconomy.snapshots.length, 1);
  h.state.simulation.turn = 4;
  h.state.economy.BBB.productionCapacity = 300;
  const next = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 4, state: h.state });
  assert.equal(next.status, 'CHECKPOINTED');
  const checkpoint = h.state.economy.BBB.npcMacroEconomy;
  assert.equal(checkpoint.snapshots.length, 2);
  assert.equal(checkpoint.snapshots[1].deltasFromPrevious.recordedProductionCapacity.value, 25);
  assert.equal(checkpoint.lastProcessedTurn, 4);
});


test('NPC macro progression uses same-unit output, settled trade, investment and observed bilateral policy without mutating Finance accounts', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn:3, state:h.state, stepDurationMs:86400000 });
  const first = h.state.economy.BBB.npcMacroEconomy.progression;
  assert.equal(first.industrialOutputIndex, 100);
  assert.equal(first.evidenceAvailability.settledTrade, 'AVAILABLE');
  assert.equal(first.observedPolicy.playerTradeAgreement, true);
  assert.equal(first.observedPolicy.importTariffPct, 10);
  assert.equal(first.observedPolicy.tradeDisruptionCountryCount, 1,
    'a country at war and under sanctions is counted once in exposure');
  assert.equal(first.observedPolicy.activeTradePartnerCount, 1);
  assert.equal(first.observedPolicy.tradePolicy, 'OPEN_MARKET');
  assert.ok(first.policyEffects.tradePolicyFactor > 1);
  assert.ok(first.policyEffects.foreignPolicyFactor > 1);
  assert.ok(first.policyEffects.policyAccessMultiplier <= 1.25);
  assert.ok(first.gdpProjectionUsd > 0);
  assert.equal(first.investmentActivityIndex, 100);

  h.state.simulation.turn = 4;
  h.state.resource.BBB.batches.push({ batchId:'OUTPUT-IRON-2', resourceId:'iron_ore', quantity:2, unit:'TONNES' });
  h.state.resource.BBB.finishedGoodsLedger.push({
    transactionId:'FACTORY-2', status:'AVAILABLE_TO_ECONOMY', createdBatchIds:['OUTPUT-IRON-2'], turn:4
  });
  h.state.trade.BBB.importLedger.push({
    settlementId:'IMPORT-2', requestId:'IMPORT-2', resourceId:'iron_ore', quantity:1,
    totalValue:250, currency:'LCU', sourceCountryId:'AAA', turn:4
  });
  h.state.trade.BBB.exportLedger.push({
    settlementId:'EXPORT-2', requestId:'EXPORT-2', resourceId:'cotton', quantity:2,
    totalValue:400, currency:'LCU', buyerCountryId:'AAA', turn:4
  });
  h.state.projects.BBB.registry.push({ status:'COMPLETED' });
  h.state.economy.BBB.financialTransmission.producerCostIndex = 104;
  const result = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', {
    turn:4, state:h.state, stepDurationMs:86400000
  });
  assert.equal(result.status, 'CHECKPOINTED');
  const next = h.state.economy.BBB.npcMacroEconomy.progression;
  assert.ok(next.industrialOutputGrowthPct > 0);
  assert.ok(next.industrialOutputGrowthPct <= 18);
  assert.ok(next.industrialOutputIndex > first.industrialOutputIndex);
  assert.ok(next.investmentActivityIndex > first.investmentActivityIndex);
  assert.ok(next.gdpProjectionUsd > first.gdpProjectionUsd);
  assert.ok(next.inflationProjectionPct > next.inflationBaselinePct);
  assert.ok(next.unemploymentProjectionPct !== null);
  assert.equal(next.evidenceAvailability.industrialOutput, 'AVAILABLE');
  assert.equal(h.state.economy.BBB.gdp, 2500000,
    'NPC projection must not mutate Finance-owned nominal GDP');
  assert.equal(h.state.finance.BBB.available, 4000,
    'NPC progression must not create, debit or credit Treasury funds');
});

test('save/load round-trip retains checkpoint and prevents replaying a committed turn', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  const restoredState = JSON.parse(JSON.stringify(h.state));
  const restored = createHarness({ state: restoredState });
  await restored.context.Omega.NpcNationalMacroEconomy.init();
  assert.equal(restored.context.Omega.NpcNationalMacroEconomy.getSnapshot('BBB').lastProcessedTurn, 3);
  const repeat = await restored.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: restored.state });
  assert.equal(repeat.status, 'ALREADY_PROCESSED');
  assert.equal(restored.state.economy.BBB.npcMacroEconomy.snapshots.length, 1);
});

test('general-data observations override local baseline only with metric-level provenance', async () => {
  const generalDataApi = {
    getCountryRecord: id => id === 'BBB' ? {
      datasetId: 'COUNTRY_GENERAL_DATA',
      metrics: { gdpCurrentUsd: 2800000 },
      metricMetadata: { gdpCurrentUsd: { year: 2024, status: 'WORLD_BANK_API_OBSERVATION',
        sourceName: 'World Bank API', sourceUrl: 'https://example.invalid/source', confidence: 0.9 } }
    } : null
  };
  const h = createHarness({ generalDataApi });
  await h.context.Omega.NpcNationalMacroEconomy.init();
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  const metric = h.state.economy.BBB.npcMacroEconomy.baseline.metrics.gdpCurrentUsd;
  assert.equal(metric.value, 2800000);
  assert.equal(metric.year, 2024);
  assert.equal(metric.source, 'World Bank API');
  assert.match(metric.authority, /WORLD_BANK_API_OBSERVATION/);
  assert.equal(metric.sourceUrl, 'https://example.invalid/source');
  assert.equal(metric.method, null);
});

test('checkpoint deltas never aggregate different resource or physical units', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  const first = h.state.economy.BBB.npcMacroEconomy;
  assert.equal(Object.keys(first.liveActivity).some(key => /inventory|commodityTotal|resourceTotal/i.test(key)), false);
  assert.equal(first.liveActivity.recordedProductionCapacity.unit, null);
});


test('static shell, server bootstrap and offline cache load the same runtime/config',()=>{
  const staticIndex=indexHtml.indexOf('omega_npc_national_macro_economy_runtime_v1.js');
  const staticTrade=indexHtml.indexOf('omega_global_trade_system.js');
  const staticBilateral=indexHtml.indexOf('omega_bilateral_trade_agreement_system_v1.js');
  const staticAutonomousTrade=indexHtml.indexOf('omega_autonomous_national_trade_decision_engine_v1.js');
  const serverRuntime=serverBootstrap.indexOf("'omega_npc_national_macro_economy_runtime_v1.js'");
  const serverTrade=serverBootstrap.indexOf("'omega_global_trade_system.js'");
  const serverBilateral=serverBootstrap.indexOf("'omega_bilateral_trade_agreement_system_v1.js'");
  const serverAutonomousTrade=serverBootstrap.indexOf("'omega_autonomous_national_trade_decision_engine_v1.js'");
  assert.ok(staticRuntimeAfterTrade(staticIndex,staticTrade));
  assert.ok(staticBilateral>staticTrade,'browser boot must load Bilateral Trade after its Global Trade dependency');
  assert.ok(staticAutonomousTrade>staticBilateral,'browser boot must load the decision orchestrator after Bilateral Trade');
  assert.ok(serverRuntime>serverTrade);
  assert.ok(serverBilateral>serverTrade,'server boot must load the same Bilateral Trade runtime');
  assert.ok(serverAutonomousTrade>serverBilateral,'server boot must load the decision orchestrator after Bilateral Trade');
  const shellCacheMatch = offlineShell.match(/CACHE_NAME = "omega-offline-atlas-shell-v([0-9]+)"/);
  assert.ok(shellCacheMatch && Number(shellCacheMatch[1]) > 129,
    'the offline shell must include the current runtime generation');
  assert.match(offlineShell,/omega_bilateral_trade_agreement_system_v1\.js/);
  assert.match(offlineShell,/omega_autonomous_national_trade_decision_engine_v1\.js/);
  assert.match(offlineShell,/omega_autonomous_national_trade_decision_rules_v1\.json/);
  assert.match(indexHtml,/omega_national_accounts_runtime_v1\.js/);
  assert.match(serverBootstrap,/omega_national_accounts_runtime_v1\.js/);
  assert.match(offlineShell,/\.\/national_accounts_rules_v1\.json/);
  assert.match(offlineShell,/\.\/omega_national_accounts_runtime_v1\.js/);
  assert.match(offlineShell,/\.\/npc_national_macro_economy_rules_v1\.json/);
  assert.match(offlineShell,/\.\/omega_npc_national_macro_economy_runtime_v1\.js/);
  assert.match(runtimeSource,/registerCountryHandler/);
  assert.doesNotMatch(runtimeSource,/setInterval|requestAnimationFrame|new Worker\s*\(/);
});
function staticRuntimeAfterTrade(runtimeIndex,tradeIndex){return runtimeIndex>tradeIndex&&runtimeIndex>=0&&tradeIndex>=0;}


test('NPC macro trade planning has a read-only per-country resource-demand source', () => {
  const macro = readFileSync('omega_npc_national_macro_economy_runtime_v1.js', 'utf8');
  const demand = readFileSync('omega_resource_national_demand_runtime_v1.js', 'utf8');
  assert.match(macro, /demandApi\.evaluateDemand\(countryId\)/);
  assert.match(demand, /evaluateDemand:\s*evaluateDemand/);
  const start = demand.indexOf('function evaluateDemand(countryId)');
  const end = demand.indexOf('function diagnostics()', start);
  assert.ok(start >= 0 && end > start);
  const readOnly = demand.slice(start, end);
  assert.doesNotMatch(readOnly, /dispatch\(|dispatchCommand\(|stateTransaction\.set|\.inventory\s*=/);
  assert.match(readOnly, /mode:\s*'READ_ONLY'/);
  assert.match(readOnly, /stateMutation:\s*false/);
});
