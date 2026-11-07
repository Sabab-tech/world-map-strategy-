import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const simulationSource = read('omega_simulation_runtime.js');
const lifecycleSource = read('omega_private_enterprise_lifecycle_v1.js');
const COMPANY_IDS = [
  'AURORA_INDUSTRIAL_GROUP',
  'MERIDIAN_ENGINEERING_GROUP',
  'NOVA_CONSUMER_INDUSTRIES',
  'ATLAS_TECHNOLOGY_CORPORATION',
  'TERRA_INFRASTRUCTURE_GROUP'
];

function createHarness() {
  const listeners = new Map();
  const state = {
    simulation: { turn: 0, startYear: 2025, date: '2025-01-01', session: { playerCountryId: 'BGD' } },
    playerCountryId: 'BGD',
    finance: {
      BGD: { available: 1000000, omegaFinance: { ledger: [] } },
      USA: { available: 500000, omegaFinance: { ledger: [] } }
    },
    economy: {
      BGD: { productionAssets: [] },
      USA: { productionAssets: [] }
    },
    resource: {
      BGD: {
        inventory: { iron_ore: 10000, construction_aggregate: 10000 },
        warehouse: {
          availableByResource: { iron_ore: 10000, construction_aggregate: 10000 },
          reservedByResource: {}
        },
        industrialNetwork: { projects: [] }
      },
      USA: {
        inventory: { iron_ore: 5000 },
        warehouse: { availableByResource: { iron_ore: 5000 }, reservedByResource: {} }
      }
    }
  };

  const catalog = {
    factoryProfiles: {
      STEEL_WORKS: {
        factoryType: 'STEEL_WORKS',
        name: 'Steel Works',
        defaultRecipeId: 'STEEL_ROUTE',
        constructionCost: 100,
        constructionDays: 60,
        defaultCapacityPerDay: 10,
        constructionMaterials: { construction_aggregate: 10 },
        workforce: { operators: 4 },
        utilities: { electricityMWhPerDay: 2 },
        unit: 'GAME_CURRENCY_UNITS'
      }
    },
    downstreamFactoryRecipes: {
      STEEL_ROUTE: {
        recipeId: 'STEEL_ROUTE',
        factoryType: 'STEEL_WORKS',
        inputs: { iron_ore: 2 },
        outputs: { steel: 1 },
        cycleDays: 1
      }
    }
  };

  const baseline = {
    ready: Promise.resolve({ status: 'READY' }),
    getCountryBaseline(countryId) {
      if (String(countryId).toUpperCase() !== 'BGD') return null;
      return {
        status: 'READY',
        countryId: 'BGD',
        governmentFactoryCounts: { STEEL_WORKS: 20 },
        factoryCounts: { STEEL_WORKS: 10 },
        totalPrivateFactoryUnits: 10,
        companies: COMPANY_IDS.map(companyId => ({
          companyId,
          factoryCounts: { STEEL_WORKS: 2 }
        }))
      };
    }
  };

  const network = {
    factoryUtilityDiagnostics() {
      return {
        status: 'HEALTHY',
        turn: Number(state.simulation.turn) || 0,
        utilityAuthority: 'LONG_HORIZON_TEST_FIXTURE',
        electricity: { availableThisTurn: 1000 },
        water: { availableThisTurn: 1000 },
        workforce: { unemployedCount: 100000, authority: 'LONG_HORIZON_TEST_FIXTURE' },
        transportCapacity: {
          truck: { availableThisTurn: 100000, unit: 'SIMULATION_RESOURCE_UNITS_PER_TURN' }
        }
      };
    },
    factoryConstructionMaterialQuote(_countryId, profile) {
      return {
        status: 'QUOTED',
        materials: [{
          resourceId: 'construction_aggregate',
          required: profile.constructionMaterials.construction_aggregate,
          available: 10000,
          sufficient: true
        }]
      };
    },
    startFactoryProject() {
      throw new Error('LONG_HORIZON_TEST_MUST_NOT_START_CONSTRUCTION');
    }
  };

  const sandbox = {
    console,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    WeakMap,
    Promise,
    JSON,
    Error,
    TypeError,
    Intl,
    Game: { state, playerCountryId: 'BGD', playerCountry: 'BGD' },
    gameState: state,
    Omega: {
      ResourceIndustrialNetwork: network,
      Simulation: null
    },
    OmegaResourceIndustrialNetwork: network,
    OmegaResourceIndustrialCatalogData: catalog,
    OmegaPrivateEnterpriseRegistryV1: baseline,
    addEventListener(type, listener) {
      const bucket = listeners.get(type) || new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) || [])]) listener.call(sandbox, event);
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
      }
    },
    localStorage: {
      values: new Map(),
      getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; },
      setItem(key, value) { this.values.set(String(key), String(value)); },
      removeItem(key) { this.values.delete(String(key)); }
    }
  };

  vm.runInNewContext(simulationSource, sandbox, { filename: 'omega_simulation_runtime.js', timeout: 15000 });
  const simulation = sandbox.Omega.Simulation;
  simulation.configure({
    state,
    worldEngine: {
      setAuthoritativeState() {},
      processSimulationTick(_dt, turn) {
        return { advanced: true, turn };
      }
    },
    interoperability: {
      advanceTurn() {},
      saveState() { return { authority: 'LONG_HORIZON_TEST' }; },
      loadState(snapshot) {
        assert.equal(snapshot.authority, 'LONG_HORIZON_TEST');
        return true;
      }
    },
    ministryPump() { return null; }
  });

  vm.runInNewContext(lifecycleSource, sandbox, {
    filename: 'omega_private_enterprise_lifecycle_v1.js',
    timeout: 15000
  });

  const session = sandbox.Omega.GameSession.createSession({
    playerCountryId: 'BGD',
    startTurn: 0,
    sessionId: 'SAB42-LONG-HORIZON'
  });

  return {
    state,
    sandbox,
    simulation,
    session,
    sessionApi: sandbox.Omega.GameSession,
    api: sandbox.OmegaPrivateEnterpriseLifecycleV1,
    snapshotStaticState() {
      return {
        inventory: JSON.stringify(state.resource.BGD.inventory),
        warehouse: JSON.stringify(state.resource.BGD.warehouse),
        treasury: state.finance.BGD.available,
        assets: JSON.stringify(state.economy.BGD.productionAssets),
        projects: JSON.stringify(state.resource.BGD.industrialNetwork.projects),
        foreignCountry: JSON.stringify({
          inventory: state.resource.USA.inventory,
          warehouse: state.resource.USA.warehouse,
          treasury: state.finance.USA.available,
          assets: state.economy.USA.productionAssets
        })
      };
    }
  };
}

async function advanceWithDeadline(session, turns, timeoutMs = 30000) {
  let timer;
  const started = performance.now();
  try {
    const result = await Promise.race([
      session.advance(turns),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('LONG_HORIZON_ADVANCE_TIMEOUT:' + turns)), timeoutMs);
      })
    ]);
    return { result, elapsedMs: performance.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function flushLifecycleMicrotasks() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function assertNoEconomicSideEffects(h, before, checkpoint) {
  const now = h.snapshotStaticState();
  assert.equal(now.inventory, before.inventory, checkpoint + ': proposal AI must not consume or create inventory');
  assert.equal(now.warehouse, before.warehouse, checkpoint + ': proposal AI must not reserve or create warehouse stock');
  assert.equal(now.treasury, before.treasury, checkpoint + ': proposal AI must not move Treasury cash');
  assert.equal(now.assets, before.assets, checkpoint + ': proposal AI must not create factory assets');
  assert.equal(now.projects, before.projects, checkpoint + ': proposal AI must not create construction projects');
  assert.equal(now.foreignCountry, before.foreignCountry, checkpoint + ': another country must remain untouched');
}

test('canonical game clock survives 30, 100, 180 and 365 in-game days without hang, duplicate proposal, or cross-country mutation', {
  timeout: 120000
}, async () => {
  const h = createHarness();
  const before = h.snapshotStaticState();
  const expectedCompanies = COMPANY_IDS.slice();
  const checkpoints = [
    { day: 30, expectedProposals: 1 },
    { day: 100, expectedProposals: 3 },
    { day: 180, expectedProposals: 5 },
    { day: 365, expectedProposals: 5 }
  ];
  let previousTurn = 0;
  const stageMetrics = [];

  for (const point of checkpoints) {
    const stepCount = point.day - previousTurn;
    const advanced = await advanceWithDeadline(h.sessionApi, stepCount, 30000);
    assert.equal(advanced.result.status, 'READY', 'game clock must remain READY at day ' + point.day);
    assert.equal(advanced.result.steps, stepCount, 'every requested game day must commit exactly once');
    previousTurn = point.day;
    await flushLifecycleMicrotasks();

    const state = h.state.simulation;
    assert.equal(Number(state.turn), point.day, 'canonical Game.state turn must equal day ' + point.day);
    assert.equal(h.simulation.clock.turn, point.day, 'canonical clock must equal day ' + point.day);
    assert.equal(h.simulation.clock.stepDurationMs, 86400000,
      'one committed turn must remain exactly one in-game calendar day');
    const expectedDate = new Date(Date.UTC(2015, 0, 1) + point.day * 86400000).toISOString().slice(0, 10);
    assert.equal(String(state.date).slice(0, 10), expectedDate, 'calendar date must advance without drift at day ' + point.day);
    const participantFailures = (state.lastTurnParticipantResults || []).filter(row => row.status === 'FAILED');
    assert.deepEqual(JSON.parse(JSON.stringify(participantFailures)), [], 'no turn participant may fail at day ' + point.day);
    assert.equal(h.sessionApi.diagnostics().authoritativeState.worldStateLinked, true,
      'Game.state must remain the one authoritative state root');
    assert.equal(h.sessionApi.diagnostics().status, 'READY');
    assert.equal(h.sessionApi.diagnostics().lastError, null);

    const dashboard = h.api.getCountryDashboard('BGD');
    assert.equal(dashboard.proposals.length, point.expectedProposals,
      'only one bounded autonomous proposal is allowed per 30-day period at day ' + point.day);
    assert.deepEqual(
      JSON.parse(JSON.stringify(dashboard.proposals.map(row => row.companyId))),
      expectedCompanies.slice(0, point.expectedProposals),
      'five company identities must rotate deterministically in order'
    );
    assert.ok(dashboard.proposals.every(row =>
      row.status === 'PROPOSED' && row.productionEnabled === false &&
      row.submissionMode === 'AUTONOMOUS_COMPANY_TURN_CYCLE'
    ));
    assert.equal(dashboard.productionEnabled, false, 'private production remains fail-closed before SAB-34 proof');
    assert.equal(dashboard.pipelineGate, 'BLOCKED_PRIVATE_FACTORY_PRODUCTION_RUNTIME_UNAVAILABLE');
    assert.ok(dashboard.events.length <= 600, 'lifecycle audit history must remain bounded');

    if (point.day === 30 || point.day === 100 || point.day === 180 || point.day === 365) {
      const snapshot = h.simulation.saveState({ includeDiagnostics: false });
      assert.equal(snapshot.clock.turn, point.day);
      assert.equal(snapshot.worldState.simulation.turn, point.day);
      assert.equal(snapshot.checksum.length, 8);
      const savedProposals = dashboard.proposals.map(row => row.proposalId);
      h.state.economy.BGD.privateEnterpriseLifecycle.proposals.length = 0;
      h.state.resource.BGD.inventory.iron_ore = 0;
      h.state.finance.BGD.available = 0;
      const restored = h.simulation.loadState(snapshot);
      assert.equal(restored.lastLoadIntegrity, 'VERIFIED');
      assert.equal(restored.authoritativeState.worldStateLinked, true);
      await flushLifecycleMicrotasks();
      assert.equal(h.api.getCountryDashboard('BGD').proposals.length, point.expectedProposals,
        'proposal lifecycle records must survive canonical save/load at day ' + point.day);
      assert.deepEqual(
        h.api.getCountryDashboard('BGD').proposals.map(row => row.proposalId),
        savedProposals
      );
      assert.equal(h.state.resource.BGD.inventory.iron_ore, 10000,
        'inventory must restore from the authoritative snapshot at day ' + point.day);
      assert.equal(h.state.finance.BGD.available, 1000000,
        'Treasury must restore from the authoritative snapshot at day ' + point.day);
      assert.equal(h.simulation.clock.turn, point.day);
    }

    assertNoEconomicSideEffects(h, before, 'DAY_' + point.day);
    stageMetrics.push({
      day: point.day,
      committedTurns: advanced.result.steps,
      elapsedMs: Number(advanced.elapsedMs.toFixed(2)),
      totalProposals: dashboard.proposals.length,
      totalLifecycleEvents: dashboard.events.length,
      saveLoadVerified: true
    });
  }

  // Replay the final autonomous period repeatedly. The already consumed period must
  // stay idempotent after save/load and must never submit a sixth duplicate company request.
  assert.equal(h.api.advanceAutonomousProposalCycle().status, 'DUPLICATE');
  assert.equal(h.api.getCountryDashboard('BGD').proposals.length, 5);
  assertNoEconomicSideEffects(h, before, 'FINAL_REPLAY');

  const diagnostics = h.simulation.diagnostics();
  assert.equal(diagnostics.clock.turn, 365);
  assert.equal(diagnostics.authoritativeState.worldStateLinked, true);
  assert.equal(diagnostics.status, 'READY');
  assert.ok(h.simulation.stepCount >= 365);
  console.log('OMEGA PRIVATE ENTERPRISE LONG-HORIZON PASS ' + JSON.stringify(stageMetrics));
});
