import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const recommendationData = JSON.parse(readFileSync(new URL('../omega_home_ministry_police_capability_recommendations_v1.json', import.meta.url), 'utf8'));
const materialRequirementsData = JSON.parse(readFileSync(new URL('../omega_home_ministry_police_capability_material_requirements_v1.json', import.meta.url), 'utf8'));
const engineSource = readFileSync(new URL('../omega_home_ministry_engine_v1.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../omega_home_ministry_police_operations_ui_v1.js', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../omega_home_ministry_police_capability_runtime_v1.js', import.meta.url), 'utf8');
const materialRuntimeSource = readFileSync(new URL('../omega_home_ministry_training_materials_runtime_v1.js', import.meta.url), 'utf8');
const legacyHomeUiSource = readFileSync(new URL('../omega_home_ministry_ui_v1.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorkerSource = readFileSync(new URL('../omega-offline-map-sw.js', import.meta.url), 'utf8');

test('recommendation data covers each baseline country once and keeps levels explicitly modelled', () => {
  const baseline = JSON.parse(readFileSync(new URL('../omega_home_ministry_country_police_baseline_v1.json', import.meta.url), 'utf8'));
  assert.equal(recommendationData.schemaVersion, '1.0.0');
  assert.equal(recommendationData.countryCount, baseline.countries.length);
  assert.equal(recommendationData.countries.length, baseline.countries.length);
  assert.equal(new Set(recommendationData.countries.map(row => row.code)).size, baseline.countries.length);
  for (const row of recommendationData.countries) {
    assert.ok(row.recommendedTrainingLevel >= 1 && row.recommendedTrainingLevel <= 10, row.code);
    assert.ok(row.recommendedRecruitmentLevel >= 1 && row.recommendedRecruitmentLevel <= 10, row.code);
    assert.equal(row.methodology, 'GAME_MODEL_ESTIMATE_NOT_OFFICIAL_COUNTRY_TRAINING_OR_RECRUITMENT_LEVEL');
    assert.ok(row.modelInputs && row.confidence && row.rationale);
  }
  assert.ok(recommendationData.methodology.sources.length >= 3);
  assert.match(recommendationData.methodology.caveats.join(' '), /No universal international numeric police-training or recruitment-level scale/);
  assert.equal(materialRequirementsData.schemaVersion, '1.0.0');
  assert.equal(materialRequirementsData.authority, 'GAME_MODEL_RULE_DATA');
  assert.match(materialRequirementsData.methodology, /not observed reserves/i);
  for (const [category, rows] of Object.entries(materialRequirementsData.requirements)) {
    assert.ok(rows.length > 0, category);
    assert.equal(new Set(rows.map(row => row.resourceId)).size, rows.length, category);
    for (const row of rows) assert.ok(row.resourceId && Number.isFinite(row.quantityPerTargetLevel) && row.quantityPerTargetLevel > 0, category);
  }
});

test('engine, interface and recommendation loader parse and expose the capability upgrade contract', () => {
  assert.doesNotThrow(() => new vm.Script(engineSource));
  assert.doesNotThrow(() => new vm.Script(uiSource));
  assert.doesNotThrow(() => new vm.Script(runtimeSource));
  assert.doesNotThrow(() => new vm.Script(materialRuntimeSource));
  for (const token of ['getPoliceCapabilityUpgradeQuote', 'startPoliceCapabilityUpgrade', 'processCapabilityProjects', 'OMEGA_POLICE_CAPABILITY_UPGRADE_COMPLETED']) {
    assert.ok(engineSource.includes(token), token);
  }
  assert.ok(uiSource.includes("['levels','TRAINING & RECRUITMENT LEVELS']"));
  assert.ok(uiSource.includes('ohpu-capability-upgrade-start'));
  assert.ok(uiSource.includes('data-ohpu-capability-open'));
  assert.ok(uiSource.includes('RESOURCE MATERIALS · LIVE COUNTRY INVENTORY'));
  assert.ok(legacyHomeUiSource.includes('ui.getHomeMinistryRoot = function () { return bodyNode(); }'));
  assert.ok(uiSource.includes('ui.getHomeMinistryRoot()'));
  assert.ok(!uiSource.includes('ohpu-rulebook-head'));
  assert.ok(!uiSource.includes('ohpu-open-rulebook-launch'));
  assert.equal((uiSource.match(/'rulebook','POLICE RULEBOOK'/g) || []).length, 1);
  assert.ok(indexSource.includes('omega_home_ministry_training_materials_runtime_v1.js'));
  assert.ok(indexSource.includes('omega_shared_number_format_v1.js'));
  assert.ok(serviceWorkerSource.includes('omega_home_ministry_training_materials_runtime_v1.js'));
  assert.ok(serviceWorkerSource.includes('omega_shared_number_format_v1.js'));
  assert.ok(serviceWorkerSource.includes('omega_home_ministry_police_capability_material_requirements_v1.json'));
  assert.ok(materialRuntimeSource.includes('omega_home_ministry_police_capability_material_requirements_v1.json'));
  assert.ok(engineSource.includes('runtime.getRequirements(type,target)'));
  assert.ok(!engineSource.includes("resourceId:'CONSTRUCTION_AGGREGATE'"));
  assert.ok(engineSource.includes('INSUFFICIENT_RESOURCE_STOCK'));
  assert.ok(runtimeSource.includes('omega_home_ministry_police_capability_recommendations_v1.json'));
});

test('capability projects require facilities, charge Finance on start, and complete only at the deadline', async () => {
  const events = new Map();
  globalThis.window = globalThis;
  globalThis.Omega = {};
  globalThis.OmegaHomePoliceCapabilityMaterialRequirements = materialRequirementsData;
  globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail || null; } };
  globalThis.addEventListener = (type, fn) => { const listeners = events.get(type) || []; listeners.push(fn); events.set(type, listeners); };
  globalThis.dispatchEvent = event => { for (const fn of events.get(event.type) || []) fn(event); return true; };
  globalThis.updateGlobalResourceHUD = () => {};
  globalThis.Game = { countryId: 'AAA', currentActiveCountry: 'AAA', state: {
    economy: { AAA: { treasury: 12000000, gdp: 1000000000 } },
    finance: { AAA: { available: 12000000, reserves: 0 } },
    population: { AAA: { population: 1000000 } },
    resource: { AAA: {
      inventory: { CONSTRUCTION_AGGREGATE: 1000, COPPER: 1000, BAUXITE_ALUMINUM: 1000, CRUDE_OIL: 1000, IRON_ORE: 1000 },
      tradeAvailability: {}, strategicReserve: { availableByResource: { CONSTRUCTION_AGGREGATE: 995 } }
    } },
    simulation: { turn: 0, simulationTimeMs: 0 }
  } };

  // Minimal authoritative state-transaction adapter for this runtime integration test.
  // State writes are staged and committed only when the registered command accepts.
  const ministryHandlers = new Map();
  const cloneStateValue = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const ministryMesh = {
    registerCommandHandler(commandType, ownerMinistry, handler) {
      if (ministryHandlers.has(commandType)) throw new Error('DUPLICATE_COMMAND_HANDLER');
      ministryHandlers.set(commandType, { ownerMinistry, handler });
      return true;
    },
    dispatchCommand(sourceMinistry, actionId, countryId, payload = {}, options = {}) {
      const commandType = options.commandType || actionId;
      const entry = ministryHandlers.get(commandType);
      if (!entry) return { status: 'REJECTED', result: { reason: 'COMMAND_HANDLER_NOT_FOUND', commandType } };
      const writes = [];
      const stateTransaction = {
        get(path) {
          const bits = String(path || '').split('.');
          if (bits.shift() !== entry.ownerMinistry) return undefined;
          let value = Game.state[entry.ownerMinistry] && Game.state[entry.ownerMinistry][countryId];
          for (const part of bits) value = value == null ? undefined : value[part];
          return cloneStateValue(value);
        },
        set(path, value) {
          const bits = String(path || '').split('.');
          if (bits.shift() !== entry.ownerMinistry || !bits.length) throw new Error('STATE_TRANSACTION_PATH_INVALID');
          writes.push({ owner: entry.ownerMinistry, countryId, bits, value: cloneStateValue(value) });
        }
      };
      const result = entry.handler({ commandType, actionId, countryId, payload: cloneStateValue(payload) }, {
        countryId, stateTransaction, turn: Number(Game.state.simulation.turn) || 0
      });
      if (!result || result.accepted !== true) return { status: 'REJECTED', result: result || { reason: 'COMMAND_REJECTED' } };
      for (const write of writes) {
        if (!Game.state[write.owner] || typeof Game.state[write.owner] !== 'object') Game.state[write.owner] = {};
        if (!Game.state[write.owner][write.countryId] || typeof Game.state[write.owner][write.countryId] !== 'object') Game.state[write.owner][write.countryId] = {};
        let parent = Game.state[write.owner][write.countryId];
        for (const part of write.bits.slice(0, -1)) {
          if (!parent[part] || typeof parent[part] !== 'object') parent[part] = {};
          parent = parent[part];
        }
        parent[write.bits[write.bits.length - 1]] = cloneStateValue(write.value);
      }
      return { status: 'APPLIED', result };
    }
  };
  globalThis.Omega.MinistryInteroperability = ministryMesh;
  globalThis.OmegaMinistryInteroperability = ministryMesh;

  globalThis.CountryIOS = { activeCountry: 'AAA' };
  const financeModel = {
    countryCode: 'AAA', treasuryBalanceUsd: 12000000, revision: 0, fiscalYearIndex: 0, ledger: [],
    allocations: {
      interior: { budgetUsd: 10000000, spentUsd: 0, remainingUsd: 10000000 },
      defense: { budgetUsd: 10000000, spentUsd: 0, remainingUsd: 10000000 }
    }
  };
  let tx = 0;
  let rejectNextExpense = false;
  const finance = {
    diagnostics: () => ({ initialized: true }),
    getPlayerCountry: () => ({ countryCode: 'AAA', name: 'Test Country', iso3: 'AAA' }),
    resolveCountry(value) {
      const key = String(value || '').trim().toUpperCase();
      return key === 'AAA' || key === 'TEST COUNTRY'
        ? { countryCode: 'AAA', countryName: 'Test Country', name: 'Test Country', iso3: 'AAA' }
        : null;
    },
    getFinanceState(value) { return String(value || '').trim().toUpperCase() === 'AAA' ? financeModel : null; },
    applyAction(action) {
      if (action.type !== 'spend-budget') return { ok: false, code: 'UNSUPPORTED_ACTION' };
      if (rejectNextExpense) { rejectNextExpense = false; return { ok: false, code: 'TEST_FINANCE_REJECTION' }; }
      const amount = Number(action.amountUsd), allocation = financeModel.allocations[action.department];
      if (!allocation || !(amount > 0)) return { ok: false, code: 'INVALID_EXPENSE' };
      if (amount > allocation.remainingUsd + 0.01) return { ok: false, code: 'ALLOCATION_LIMIT_EXCEEDED', treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
      if (amount > financeModel.treasuryBalanceUsd + 0.01) return { ok: false, code: 'INSUFFICIENT_TREASURY', treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
      allocation.spentUsd += amount;
      allocation.remainingUsd = Math.max(0, allocation.budgetUsd - allocation.spentUsd);
      financeModel.treasuryBalanceUsd -= amount;
      financeModel.revision += 1;
      const transactionId = 'CAP-' + (++tx);
      financeModel.ledger.push({ transactionId, fiscalYearIndex: financeModel.fiscalYearIndex, action: 'EXPENSE',
        department: action.department, category: action.spendType, amountUsd: amount,
        description: String(action.description || ''), balanceAfterUsd: financeModel.treasuryBalanceUsd });
      Game.state.finance.AAA.available = financeModel.treasuryBalanceUsd;
      Game.state.economy.AAA.treasury = financeModel.treasuryBalanceUsd;
      return { ok: true, code: 'EXPENSE_POSTED', transactionId, treasuryBalanceUsd: financeModel.treasuryBalanceUsd };
    }
  };
  globalThis.OmegaFinanceMinistry = finance;
  globalThis.Omega.FinanceMinistry = finance;

  await import('../omega_home_ministry_engine_v1.js');
  await import('../omega_home_ministry_training_materials_runtime_v1.js');
  const engine = globalThis.OmegaHomeMinistryEngine;
  engine.getState('AAA');
  const plan = {
    personnel: { mode: 'amount', value: 2000000 },
    vehicles: { mode: 'amount', value: 1000000 },
    maintenance: { mode: 'amount', value: 2000000 },
    facilities: { mode: 'amount', value: 2000000 },
    training: { mode: 'amount', value: 2000000 },
    operations: { mode: 'amount', value: 1000000 }
  };
  assert.equal(engine.setHomeBudgetPlan(plan, 'AAA').ok, true);

  const blockedTraining = engine.getPoliceCapabilityUpgradeQuote('training', 'AAA');
  assert.equal(blockedTraining.canStart, false);
  assert.ok(blockedTraining.blockers.some(row => row.code === 'CAPABILITY_RESOURCE_REQUIREMENT_MISSING'));
  assert.ok(blockedTraining.blockers.some(row => row.code === 'INSUFFICIENT_RESOURCE_STOCK'));
  assert.equal(blockedTraining.materials.find(row => row.resourceId === 'CONSTRUCTION_AGGREGATE').availableQuantity, 5);

  const facility = engine.buildFacility('academy', 1, 'AAA');
  assert.equal(facility.ok, true);
  assert.equal(engine.getPoliceCapabilityState('AAA').academyLevel, 2);
  Game.state.resource.AAA.strategicReserve.availableByResource.CONSTRUCTION_AGGREGATE = 0;
  const quote = engine.getPoliceCapabilityUpgradeQuote('training', 'AAA');
  assert.equal(quote.canStart, true);
  assert.equal(quote.currentLevel, 1);
  assert.equal(quote.targetLevel, 2);
  assert.equal(quote.costUsd, 25000);
  assert.ok(quote.durationDays > 0);

  const treasuryBefore = financeModel.treasuryBalanceUsd;
  const start = engine.startPoliceCapabilityUpgrade('training', 'AAA');
  assert.equal(start.ok, true);
  assert.equal(financeModel.treasuryBalanceUsd, treasuryBefore - quote.costUsd);
  assert.equal(engine.getPoliceCapabilityState('AAA').trainingLevel, 1);
  assert.equal(engine.getPoliceCapabilityState('AAA').pendingProjects.length, 1);
  assert.equal(Game.state.resource.AAA.inventory.CONSTRUCTION_AGGREGATE, 984);
  assert.equal(Game.state.resource.AAA.inventory.COPPER, 996);
  assert.equal(Game.state.resource.AAA.inventory.BAUXITE_ALUMINUM, 998);
  assert.equal(start.project.materials.length, 3);
  assert.equal(start.project.materials[0].inventorySource, 'Game.state.resource[country].inventory');
  assert.equal(engine.upgradeTraining(2, 'AAA').reason, 'TRAINING_UPGRADE_ALREADY_IN_PROGRESS');

  Game.state.simulation.simulationTimeMs = start.project.completesAtMs - 1;
  Game.state.simulation.turn += 1;
  dispatchEvent(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED', { detail: { countryId: 'AAA' } }));
  assert.equal(engine.getPoliceCapabilityState('AAA').trainingLevel, 1);

  Game.state.simulation.simulationTimeMs = start.project.completesAtMs;
  Game.state.simulation.turn += 1;
  dispatchEvent(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED', { detail: { countryId: 'AAA' } }));
  assert.equal(engine.getPoliceCapabilityState('AAA').trainingLevel, 2);
  assert.equal(engine.getPoliceCapabilityState('AAA').pendingProjects.length, 0);
  assert.ok(engine.getPoliceCapabilityState('AAA').completedProjects.some(row => row.id === start.project.id && row.status === 'COMPLETED'));

  const recruitmentQuote = engine.getPoliceCapabilityUpgradeQuote('recruitment', 'AAA');
  assert.equal(recruitmentQuote.canStart, true);
  const feeBefore = Number(engine.getPoliceCapabilityState('AAA').recruitmentFeePerOfficerUsd) || 2500;
  const inventoryBeforeRejectedRecruitment = cloneStateValue(Game.state.resource.AAA.inventory);
  const treasuryBeforeRejectedRecruitment = financeModel.treasuryBalanceUsd;
  rejectNextExpense = true;
  const rejectedRecruitment = engine.startPoliceCapabilityUpgrade('recruitment', 'AAA');
  assert.equal(rejectedRecruitment.ok, false);
  assert.equal(rejectedRecruitment.materialRefunded, true);
  assert.deepEqual(Game.state.resource.AAA.inventory, inventoryBeforeRejectedRecruitment);
  assert.equal(financeModel.treasuryBalanceUsd, treasuryBeforeRejectedRecruitment);

  Game.state.simulation.turn += 1;
  const inventoryBeforeRecruitment = cloneStateValue(Game.state.resource.AAA.inventory);
  const recruitmentStart = engine.startPoliceCapabilityUpgrade('recruitment', 'AAA');
  assert.equal(recruitmentStart.ok, true);
  assert.equal(Game.state.resource.AAA.inventory.CRUDE_OIL, inventoryBeforeRecruitment.CRUDE_OIL - 6);
  assert.equal(Game.state.resource.AAA.inventory.COPPER, inventoryBeforeRecruitment.COPPER - 2);
  assert.equal(Game.state.resource.AAA.inventory.IRON_ORE, inventoryBeforeRecruitment.IRON_ORE - 4);
  assert.equal(engine.getPoliceCapabilityState('AAA').recruitmentLevel, 1);
  Game.state.simulation.simulationTimeMs = recruitmentStart.project.completesAtMs;
  Game.state.simulation.turn += 1;
  dispatchEvent(new CustomEvent('OMEGA_SIMULATION_TURN_COMMITTED', { detail: { countryId: 'AAA' } }));
  const after = engine.getPoliceCapabilityState('AAA');
  assert.equal(after.recruitmentLevel, 2);
  assert.ok(after.recruitmentFeePerOfficerUsd < feeBefore);
  assert.equal(after.pendingProjects.length, 0);
});
