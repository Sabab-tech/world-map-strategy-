import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const runtimeSource = readFileSync('omega_npc_national_macro_economy_runtime_v1.js', 'utf8');
const transactionSource = readFileSync('omega_ministry_state_transaction.js', 'utf8');
const rules = JSON.parse(readFileSync('npc_national_macro_economy_rules_v1.json', 'utf8'));

function createHarness(options = {}) {
  const state = options.state || {
    simulation: { turn: 3, session: { playerCountryId: 'AAA' } },
    economy: {
      AAA: { productionCapacity: 100, productionAssets: [] },
      BBB: { productionCapacity: 275, productionAssets: [{ id: 'asset-1' }, { id: 'asset-2' }] },
      CCC: { productionCapacity: null, productionAssets: [] }
    },
    projects: {
      BBB: { registry: [{ status: 'UNDER_CONSTRUCTION' }, { status: 'COMPLETED' }, { status: 'BLOCKED' }] },
      CCC: { registry: [] }
    },
    trade: {
      BBB: { globalTradeLedger: { settlements: [
        { status: 'SETTLED', settlementId: 'SET-1' },
        { status: 'PENDING', settlementId: 'PENDING-1' },
        { status: 'SETTLED', settlementId: 'SET-2' }
      ] } }
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
      indicators: { gdpCurrentUsd: 2500000, gdpGrowthPct: null }, metricAvailability: { gdpCurrentUsd: true, gdpGrowthPct: false },
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
      CountryGeneralData: options.generalDataApi || { getCountryRecord: () => null }
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
    __OMEGA_NPC_MACRO_FIXTURES__: { manifest, rules: fixtureRules },
    addEventListener() {}
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(transactionSource, context, { filename: 'omega_ministry_state_transaction.js' });
  vm.runInNewContext(runtimeSource, context, { filename: 'omega_npc_national_macro_economy_runtime_v1.js' });
  return { context, state, profiles, countryHandlers, commandHandlers, commands, events };
}

test('NPC macro runtime resolves the manifest dynamically and registers only ACTIVE/MACRO tiers', async () => {
  const h = createHarness();
  const result = await h.context.Omega.NpcNationalMacroEconomy.init();
  assert.equal(result.ready, true);
  assert.equal(result.coreCountryCount, 3);
  assert.equal(h.countryHandlers.size, 1);
  const registration = [...h.countryHandlers.values()][0];
  assert.deepEqual(Array.from(registration.opts.tiers), ['ACTIVE', 'MACRO']);
  assert.equal(h.commandHandlers.size, 1);
  assert.equal([...h.commandHandlers.values()][0].owner, 'economy');
});

test('NPC macro checkpoint uses live country state and records only SETTLED trade ledger rows', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  const result = await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  assert.equal(result.status, 'CHECKPOINTED', JSON.stringify(result));
  const checkpoint = h.state.economy.BBB.npcMacroEconomy;
  assert.equal(checkpoint.countryId, 'BBB');
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.value, 2500000);
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.year, 2015);
  assert.equal(checkpoint.baseline.metrics.gdpCurrentUsd.authority, 'LOCAL_BASELINE_NOT_EXTERNALLY_REVALIDATED');
  assert.equal(checkpoint.baseline.metrics.gdpGrowthPct.value, null);
  assert.equal(checkpoint.baseline.metrics.gdpGrowthPct.availability, 'UNAVAILABLE');
  assert.equal(checkpoint.liveActivity.recordedProductionCapacity.value, 275);
  assert.equal(checkpoint.liveActivity.recordedProductionAssetCount.value, 2);
  assert.equal(checkpoint.liveActivity.autonomousProjectStatusCounts.value.active, 1);
  assert.equal(checkpoint.liveActivity.autonomousProjectStatusCounts.value.completed, 1);
  assert.equal(checkpoint.liveActivity.settledInternationalTradeCount.value, 2);
  assert.equal(checkpoint.liveActivity.financeLedgerEntryCount.value, 2);
  assert.equal(checkpoint.liveActivity.treasuryBalanceAvailability.value, true);
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
  assert.equal(checkpoint.provenance.progressionStatus, 'EVIDENCE_CHECKPOINT_ONLY_NO_MACRO_PROGRESSION_FORMULA');
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
});

test('checkpoint deltas never aggregate different resource or physical units', async () => {
  const h = createHarness();
  await h.context.Omega.NpcNationalMacroEconomy.init();
  await h.context.Omega.NpcNationalMacroEconomy.processCountry('BBB', { turn: 3, state: h.state });
  const first = h.state.economy.BBB.npcMacroEconomy;
  assert.equal(Object.keys(first.liveActivity).some(key => /inventory|commodityTotal|resourceTotal/i.test(key)), false);
  assert.equal(first.liveActivity.recordedProductionCapacity.unit, null);
});
