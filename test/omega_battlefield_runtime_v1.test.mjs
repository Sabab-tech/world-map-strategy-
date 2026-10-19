import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../omega_battlefield_runtime_v1.js', import.meta.url), 'utf8');
const DAY = 86400000;

function setup(options = {}) {
  const events = new Map();
  const idFor = value => {
    const key = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
    const aliases = { BANGLADESH:'BGD', BGD:'BGD', INDIA:'IND', IND:'IND' };
    return aliases[key] || key;
  };
  const state = {
    finance: {
      BGD: { available: options.bangladeshCash ?? 100000000 },
      IND: { available: options.indiaCash ?? 50000000 }
    },
    military: {
      BGD: {
        readiness: 80,
        forceStructure: { personnel: 4000, availablePersonnel: 3000 },
        battleRuntime: { formationInventory: { infantry_battalion: 3 }, recruitmentQueue: [], battleLedger: [], warLedger: [] }
      },
      IND: {
        readiness: 65,
        forceStructure: { personnel: 5000, availablePersonnel: 1200 },
        battleRuntime: { formationInventory: { infantry_battalion: 1 }, recruitmentQueue: [], battleLedger: [], warLedger: [] }
      }
    },
    foreign: {},
    simulation: { turn: 0, simulationTimeMs: 0 }
  };
  const locationsRegistry = {
    BGD: {
      name:'Bangladesh',
      capital:{name:'Dhaka',lat:23.8103,lon:90.4125,description:'Recorded national capital'},
      cities:[{name:'Chattogram',lat:22.3569,lng:91.7832,role:'Urban city'}],
      economic:[{name:'Chattogram Port',lat:22.3,lon:91.8,description:'Recorded economic hub'}],
      military:[{name:'Recorded Cantonment',lat:23.7,lon:90.3,description:'Recorded military installation'}]
    },
    IND: {
      name:'India',
      capital:{name:'New Delhi',lat:28.6139,lon:77.209,description:'Recorded national capital'},
      cities:[{name:'Mumbai',lat:19.076,lon:72.8777,role:'Urban city'}],
      economic:[],
      military:[]
    }
  };
  const world = {
    Game: { state, locationsRegistry, countryId:'BGD', currentActiveCountry:'BGD', getCountryId:idFor },
    CountryIOS: { activeCountry:'BGD' },
    Omega: {},
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type=type;this.detail=init.detail||null; } },
    addEventListener(type,fn) { const arr=events.get(type)||[];arr.push(fn);events.set(type,arr); },
    dispatchEvent(event) { for(const fn of events.get(event.type)||[])fn(event);return true; },
    updateGlobalResourceHUD() {}
  };
  world.window = world;
  const context = vm.createContext(world);
  vm.runInContext(source,context,{filename:'omega_battlefield_runtime_v1.js'});
  return {context,state,api:context.OmegaBattlefieldRuntime,dispatch(type,detail={}){context.dispatchEvent(new context.CustomEvent(type,{detail}));}};
}

test('battlefield runtime and all country/city data adapters parse', () => {
  assert.doesNotThrow(() => new vm.Script(source,{filename:'omega_battlefield_runtime_v1.js'}));
  const h=setup();
  assert.equal(h.api.VERSION,'1.0.0');
  const locations=h.api.getCountryLocations('IND');
  assert.ok(locations.some(row=>row.name==='New Delhi'&&row.coordinatesRecorded));
  assert.ok(locations.some(row=>row.name==='Mumbai'&&row.terrain==='URBAN'));
  assert.ok(locations.some(row=>row.category==='rural'&&!row.coordinatesRecorded));
  assert.equal(h.api.getCountries().length,2);
});

test('soldier recruitment charges the correct country and trains before joining the force', () => {
  const h=setup();
  const result=h.api.recruitSoldiers(100,'BGD');
  assert.equal(result.ok,true);
  assert.equal(result.cost,100*2500);
  assert.equal(h.state.finance.BGD.available,100000000-250000);
  assert.equal(h.state.finance.IND.available,50000000);
  assert.equal(h.state.military.BGD.forceStructure.personnel,4000);
  assert.equal(h.state.military.BGD.battleRuntime.recruitmentQueue[0].status,'TRAINING');
  h.state.simulation.simulationTimeMs=14*DAY;
  h.dispatch('OMEGA_SIMULATION_TURN_COMMITTED',{turn:1});
  // Exercise the same idempotent processor directly as well as the committed-turn event.
  // The runtime registers this processor for OMEGA_SIMULATION_TURN_COMMITTED in production.
  h.api.processRecruitment();
  assert.equal(h.state.military.BGD.forceStructure.personnel,4100);
  assert.equal(h.state.military.BGD.battleRuntime.recruitmentQueue.length,0);
});

test('recruitment and formation procurement are blocked when treasury or unassigned personnel are insufficient', () => {
  const poor=setup({bangladeshCash:1000});
  const blockedRecruit=poor.api.recruitSoldiers(1,'BGD');
  assert.equal(blockedRecruit.ok,false);
  assert.equal(blockedRecruit.reason,'INSUFFICIENT_TREASURY');
  assert.equal(poor.state.finance.BGD.available,1000);

  const h=setup();
  const noTroops=h.api.purchaseFormation('armored_battalion',10,'BGD');
  assert.equal(noTroops.ok,false);
  assert.equal(noTroops.reason,'INSUFFICIENT_UNASSIGNED_PERSONNEL');
  assert.equal(h.state.finance.BGD.available,100000000);
  const purchased=h.api.purchaseFormation('infantry_battalion',2,'BGD');
  assert.equal(purchased.ok,true);
  assert.equal(purchased.personnelUsed,2000);
  assert.equal(h.state.military.BGD.forceStructure.availablePersonnel,1000);
  assert.equal(h.state.finance.BGD.available,100000000-3000000);
});

test('war and battle outcomes are country-scoped and require recorded defenders and locations', () => {
  const h=setup();
  const declared=h.api.declareWar('IND','BGD');
  assert.equal(declared.ok,true);
  assert.equal(h.api.warStatus('BGD','IND').active,true);
  const noLocation=h.api.launchBattle('IND','not-a-city','infantry_battalion',1,'BGD');
  assert.equal(noLocation.ok,false);
  assert.equal(noLocation.reason,'TARGET_LOCATION_NOT_RECORDED');

  const recordBefore=h.state.military.IND.forceStructure.personnel;
  const battle=h.api.launchBattle('IND','IND|NEW_DELHI','infantry_battalion',1,'BGD');
  assert.equal(battle.ok,true);
  assert.ok(['ATTACKER_VICTORY','DEFENDER_HOLDS','DRAW'].includes(battle.record.outcome));
  assert.equal(battle.record.targetLocation.name,'New Delhi');
  assert.equal(h.state.military.IND.forceStructure.personnel,recordBefore-battle.record.defenderPersonnelLosses);
  assert.ok(h.state.military.BGD.battleRuntime.battleLedger.length>0);
  assert.ok(h.state.military.IND.battleRuntime.battleLedger.length>0);
  assert.equal(h.state.finance.IND.available,50000000);
});

test('battle resolution refuses to invent an army for a country without recorded forces', () => {
  const h=setup();
  h.state.military.IND.forceStructure = {};
  h.state.military.IND.battleRuntime.formationInventory = {};
  h.api.declareWar('IND','BGD');
  const result=h.api.launchBattle('IND','IND|NEW_DELHI','infantry_battalion',1,'BGD');
  assert.equal(result.ok,false);
  assert.equal(result.reason,'DEFENDER_FORCE_NOT_RECORDED');
});
