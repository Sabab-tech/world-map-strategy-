'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const stateSource = fs.readFileSync(path.join(root, 'omega_minister_state_system.js'), 'utf8');
const recruitmentSource = fs.readFileSync(path.join(root, 'minister_recruitment_engine.js'), 'utf8');
const rawMinisters = JSON.parse(fs.readFileSync(path.join(root, 'ministers.json'), 'utf8'));
const ministers = rawMinisters.ministers_database || rawMinisters.ministers || rawMinisters;

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || {};
  }
}

function buildRuntime() {
  const ministryDatabase = {
    interior_security: { id: 'interior_security', ministerName: null },
    trade: { id: 'trade', ministerName: null },
    treasury_finance: { id: 'treasury_finance', ministerName: null }
  };
  const ui = {
    activeCountry: 'BGD',
    currentDashboardMinistryId: 'interior_security',
    ministriesDatabase: ministryDatabase,
    renderMinistryDashboard(ministryId) {
      this.currentDashboardMinistryId = ministryId;
    },
    renderCabinet() {}
  };
  const sandbox = {
    console,
    CustomEvent: TestCustomEvent,
    dispatchEvent() { return true; },
    addEventListener() {},
    setInterval() { return 1; },
    clearInterval() {},
    localStorage: {
      getItem() { return null; },
      setItem() {}
    },
    document: {
      head: null,
      readyState: 'complete',
      getElementById() { return null; },
      querySelector() { return null; },
      createElement() { throw new Error('Unexpected DOM creation in state lifecycle test'); }
    },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) }),
    OmegaMinistersDB: ministers,
    OmegaCabinetUI: ui,
    Game: { currentActiveCountry: 'USA', gameTime: 123 }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(stateSource, sandbox, { filename: 'omega_minister_state_system.js' });
  vm.runInNewContext(recruitmentSource, sandbox, { filename: 'minister_recruitment_engine.js' });
  return { sandbox, ui, ministryDatabase, api: sandbox.OmegaMinisterRecruitment };
}

(async () => {
  const { sandbox, ui, ministryDatabase, api } = buildRuntime();
  assert.ok(api, 'Recruitment API must be exposed');

  const interiorRoster = await api.fetchRoster('interior_security', 'BGD');
  assert.equal(interiorRoster.length, 5, 'Interior ministry must receive five profiles');
  assert.ok(interiorRoster.every(candidate => candidate.ministryCategory === 'Home_Affairs'),
    'Interior ministry must use Home_Affairs profiles, not arbitrary categories');

  const tradeRoster = await api.fetchRoster('trade', 'BGD');
  assert.ok(tradeRoster.every(candidate => candidate.ministryCategory === 'Economy_Commerce'),
    'Trade ministry must use Economy_Commerce profiles');

  const treasuryRoster = await api.fetchRoster('treasury_finance', 'BGD');
  assert.ok(treasuryRoster.every(candidate => candidate.ministryCategory === 'Finance'),
    'Treasury ministry must use Finance profiles');

  assert.equal(api.primaryActionLabel('interior_security', 'BGD'), 'Recruit Minister',
    'A vacant ministry must offer recruitment');

  const candidate = interiorRoster[0];
  const recruited = await api.recruit('interior_security', candidate, 'BGD');
  const active = sandbox.OmegaMinisterStateRegistry.getActiveMinister('BGD', 'interior_security');

  assert.equal(active.ministerId, candidate.id, 'Recruitment must assign the selected minister');
  assert.equal(active.runtimeState.status, 'ACTIVE', 'Recruited minister must be active');
  assert.equal(active.staticProfile.baseAge, Number(candidate.age), 'Profile details must enter canonical state');
  assert.ok(Object.keys(active.staticProfile.baseStats || {}).length > 0,
    'Minister base skill data must be retained');
  assert.ok(Object.keys(active.staticProfile.efficiencyProfile || {}).length > 0,
    'Minister efficiency data must be retained');
  assert.equal(ministryDatabase.interior_security.ministerId, candidate.id,
    'Ministry data must expose the recruited minister ID');
  assert.equal(ministryDatabase.interior_security.ministerName,
    candidate.displayName || candidate.name || candidate.regional_names?.south_asia || candidate.id,
    'Ministry header data must expose the recruited minister name');
  assert.equal(api.primaryActionLabel('interior_security', 'BGD'), 'Fire Minister',
    'An occupied ministry must offer firing');
  assert.equal(sandbox.OmegaMinisterStateRegistry.consistencyCheck().ok, true,
    'Canonical assignments must remain consistent after recruitment');

  await api.fire('interior_security', { id: candidate.id, name: candidate.displayName || candidate.name }, 'BGD');
  assert.equal(sandbox.OmegaMinisterStateRegistry.getActiveMinister('BGD', 'interior_security'), null,
    'Firing must vacate the ministry');
  assert.equal(sandbox.OmegaMinisterStateRegistry.getMinister(candidate.id).runtimeState.status, 'FIRED',
    'Fired minister must retain a FIRED lifecycle status');
  assert.equal(ministryDatabase.interior_security.ministerName, null,
    'A vacant ministry must clear its active minister name');
  assert.equal(api.primaryActionLabel('interior_security', 'BGD'), 'Recruit Minister',
    'A fired minister must return the ministry to recruitment state');
  assert.equal(sandbox.OmegaMinisterStateRegistry.consistencyCheck().ok, true,
    'Canonical assignments must remain consistent after firing');

  // The ministry panel country is authoritative over a stale Game country.
  assert.equal(api.activeId('interior_security', 'BGD'), null);
  assert.equal(sandbox.OmegaMinisterStateRegistry.getActiveMinister('USA', 'interior_security'), null,
    'Recruitment must not accidentally assign to the stale Game country');

  console.log('OMEGA MINISTER RECRUITMENT LIFECYCLE: PASS');
  console.log('Ministry-specific rosters and selected-country binding: PASS');
  console.log('Recruitment, profile activation and ministry name synchronization: PASS');
  console.log('Fire, vacancy restoration and canonical consistency: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
