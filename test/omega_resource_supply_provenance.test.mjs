import assert from 'node:assert/strict';

globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent {
  constructor(type, init = {}) { this.type = String(type); this.detail = init.detail; }
};
if (typeof globalThis.dispatchEvent !== 'function') {
  const target = new EventTarget();
  globalThis.dispatchEvent = target.dispatchEvent.bind(target);
  globalThis.addEventListener = target.addEventListener.bind(target);
  globalThis.removeEventListener = target.removeEventListener.bind(target);
}

globalThis.Game = {
  state: {
    simulation: { turn: 1, simulationTurn: 1 },
    finance: { BD: { available: 100000, reserves: 120000, committed: 1000 }, SA: { available: 200000, reserves: 300000 } },
    economy: { BD: { gdp: 460000, debt: 210000, production: 500, productionCapacity: 600 }, SA: { gdp: 650000, debt: 120000 } },
    resource: { BD: { inventory: { steel: 10000 }, production: { steel: 500 }, consumption: { steel: 400 }, reserves: { steel: 20000 }, demandRuntime: { playerSupplyLifeline: { policyId: 'PLAYER-SUPPLY-LIFELINE-BD-1', countryId: 'BD', approved: true, status: 'ACTIVE', termDays: 100, elapsedGameDays: 0, lastAdvancedTurn: 1, remainingGameDays: 100 } } } },
    relations: { BD: { SA: { overall: 75, trade: 80, trust: 70, trade_agreement: true, sanctions: false, war_state: false } } },
    foreign: { BD: { relations: { SA: { overall: 75, trade: 80, trust: 70, trade_agreement: true, sanctions: false, war_state: false } }, treaties: {} } },
    trade: {
      BD: { relations: { SA: { overall: 75, trade: 80, trust: 70 } }, marketPrice: { crude_oil: 80 }, offerBook: { crude_oil: { unitPrice: 80 } }, routeCapacity: { crude_oil: 2000000 } },
      SA: { offerBook: { crude_oil: { unitPrice: 78 } } }
    }
  }
};

await import('../omega_country_semantic_bridge.js');
const countryBridge = globalThis.OmegaCanonicalIdentityRegistry || globalThis.OmegaCountrySemanticBridge;
assert.equal(await countryBridge.init(), true, 'canonical country registry must initialize');

globalThis.ResourceMinistryEngine = {
  getIntegratedResourceState(countryId) {
    return { countryId, inventory: { crude_oil: 1000000 }, production: { crude_oil: 500000 }, reserves: { crude_oil: 5000000 } };
  },
  getCountryResourceProfile(countryId) {
    return { countryId, market: { prices: { crude_oil: countryId === 'SA' ? 78 : 120 } } };
  },
  deposits: [{ countryCode: 'SA', resourceId: 'crude_oil' }]
};

await import('../omega_ministry_registry.js');
await import('../omega_ministry_state_provider.js');
await import('../omega_ministry_information_policy.js');
await import('../omega_ministry_decision_framework.js');
await import('../omega_ministry_state_transaction.js');
await import('../omega_ministry_interoperability_system.js');
await import('../omega_simulation_runtime.js');
await import('../omega_opponent_autonomy_system.js');

const autonomy = globalThis.OmegaOpponentAutonomy;
assert(autonomy, 'autonomy API missing');

const payload = {
  requestId: 'SUPPLY-WINDOW-IMP-1',
  decisionId: 'SUPPLY-WINDOW-DEC-1',
  resourceId: 'crude_oil',
  targetCountryId: 'SA',
  quantity: 1000,
  unitPrice: 80,
  reservationId: 'SUPPLY-WINDOW-RES-1',
  supplyWindowId: 'PLAYER-SUPPLY-LIFELINE-BD-1',
  supplyWindowTermDays: 100,
  supplyWindowRemainingDaysAtRequest: 72,
  supplyWindowTargetCoverageDays: 100
};
const result = autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST', 'BD', payload);
assert.equal(result.status, 'APPLIED', 'initial approved import failed: ' + JSON.stringify(result));
const requests = globalThis.Game.state.trade.BD.importRequests;
assert.equal(requests.length, 1);
assert.equal(requests[0].requestId, payload.requestId);
assert.equal(requests[0].status, 'SENT');
assert.equal(requests[0].stage, 'COUNTERPARTY_DECISION_PENDING');
assert.equal(requests[0].supplyWindowId, payload.supplyWindowId);
assert.equal(requests[0].supplyWindowTermDays, 100);
assert.equal(requests[0].supplyWindowRemainingDaysAtRequest, 72);
assert.equal(requests[0].supplyWindowTargetCoverageDays, 100);

// A decision that was queued while active must be rejected if dispatched after
// the 100-day authorization has elapsed, even if its last stored status is stale.
globalThis.Game.state.simulation.turn = 101;
const late = autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST', 'BD', {
  ...payload, requestId: 'SUPPLY-WINDOW-IMP-LATE-1', decisionId: 'SUPPLY-WINDOW-DEC-LATE-1'
});
assert.equal(late.status, 'FAILED', 'a stale queued import must be rejected by the final command authority');
assert.equal(late.result?.reason || late.reason, 'PLAYER_SUPPLY_WINDOW_EXPIRED');
assert.equal(globalThis.Game.state.trade.BD.importRequests.length, 1,
  'expired supply windows must not create a new import request');

// A retry for the already-created request remains idempotent after expiry.
const retryAfterExpiry = autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST', 'BD', payload);
assert.equal(retryAfterExpiry.status, 'APPLIED');
assert.equal(globalThis.Game.state.trade.BD.importRequests.length, 1);
assert.equal(globalThis.Game.state.trade.BD.importRequests[0].quantity, 1000);

// Retrying the same request ID is idempotent and does not create duplicate import records.
const retry = autonomy.dispatch('OMEGA_AUTO_RESOURCE_IMPORT_REQUEST', 'BD', { ...payload, quantity: 9999 });
assert.equal(retry.status, 'APPLIED');
assert.equal(globalThis.Game.state.trade.BD.importRequests.length, 1);
assert.equal(globalThis.Game.state.trade.BD.importRequests[0].quantity, 1000);
console.log('PLAYER SUPPLY WINDOW IMPORT PROVENANCE: PASS');
