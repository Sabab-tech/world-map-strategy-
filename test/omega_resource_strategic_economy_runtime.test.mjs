import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const readJson=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const readText=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

class EventBus{
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const a=this.listeners.get(type)||[];a.push(fn);this.listeners.set(type,a);}
  dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}
}
class CustomEventMock{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
class MemoryStorage{
  constructor(){this.data=new Map();}
  get length(){return this.data.size;}
  key(i){return [...this.data.keys()][i]??null;}
  getItem(k){return this.data.has(String(k))?this.data.get(String(k)):null;}
  setItem(k,v){this.data.set(String(k),String(v));}
  removeItem(k){this.data.delete(String(k));}
}

function harness(){
  const bus=new EventBus(),storage=new MemoryStorage();
  const state={
    simulation:{turn:1,startYear:2015,date:'2015-01-01'},
    resource:{BGD:{inventory:{coal:1000},batches:[{batchId:'BATCH-OPEN-1',resourceId:'coal',quantity:1000,remainingQuantity:1000,unit:'TONNES',countryId:'BGD'}],
      inventoryLots:{'BATCH-OPEN-1':{batchId:'BATCH-OPEN-1',remainingQuantity:1000}},mineStates:{SITE_BGD_A:{residualQuantity:50000,unit:'TONNES'}}}},
    economy:{BGD:{currency_code:'BDT'}},
    finance:{BGD:{available:100000000000,currencyCode:'BDT'}},
    trade:{BGD:{marketPrice:{coal:100}}},
    transport:{BGD:{}},
    foreign:{BGD:{}}
  };
  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
    CustomEvent:CustomEventMock,localStorage:storage,
    Game:{state},gameState:state,
    OmegaResourceEnvironmentalRulesData:readJson('resource_environmental_rules_v1.json'),
    addEventListener:bus.addEventListener.bind(bus),dispatchEvent:bus.dispatchEvent.bind(bus)
  };
  context.Omega={ResourceEnvironmentalRulesData:context.OmegaResourceEnvironmentalRulesData};
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(readText('omega_resource_strategic_economy_runtime_v1.js'),context,{filename:'omega_resource_strategic_economy_runtime_v1.js'});
  return{context,state,storage,bus,api:context.OmegaResourceStrategicEconomyRuntime};
}
const event=(type,countryId,payload)=>new CustomEventMock(type,{detail:{eventType:type,countryId,payload}});

test('environment impacts are data-driven, idempotent, persisted, and constrain later extraction/processing',async()=>{
  const h=harness(),{api,state}=h;
  const first={countryId:'BGD',extractionId:'EXT-BGD-1',siteReferenceKey:'SITE_BGD_barapukuria_coal_mine',
    resourceId:'coal',quantity:1000,unit:'TONNES',batch:{batchId:'BATCH-BGD-1',resourceId:'coal',quantity:1000,unit:'TONNES'}};
  h.context.dispatchEvent(event('OMEGA_RESOURCE_EXTRACTION_COMPLETED','BGD',first));
  await api.flushPending();
  let impact=state.environment.BGD.resourceImpact;
  assert.equal(impact.ledger.length,1);
  assert.equal(impact.ledger[0].status,'MODELED');
  assert.equal(impact.ledger[0].authority,'SIMULATED_GAMEPLAY_RULES');
  assert.equal(impact.ledger[0].impacts.ghgTCO2e,18);
  assert.equal(impact.ledger[0].impacts.waterUseM3,420);
  assert.equal(impact.ledger[0].sourceBatchIds[0],'BATCH-BGD-1');
  const liability=impact.cumulative.remediationLiabilityUnits;
  h.context.dispatchEvent(event('OMEGA_RESOURCE_EXTRACTION_COMPLETED','BGD',first));
  await api.flushPending();
  assert.equal(state.environment.BGD.resourceImpact.ledger.length,1,'duplicate extraction event must not add impact twice');
  assert.equal(state.environment.BGD.resourceImpact.cumulative.remediationLiabilityUnits,liability);

  state.simulation.turn=2;
  const large={...first,extractionId:'EXT-BGD-2',siteReferenceKey:'SITE_BGD_barapukuria_coal_mine',
    quantity:20000000,batch:{batchId:'BATCH-BGD-2',resourceId:'coal',quantity:20000000,unit:'TONNES'}};
  h.context.dispatchEvent(event('OMEGA_RESOURCE_EXTRACTION_COMPLETED','BGD',large));
  await api.flushPending();
  impact=state.environment.BGD.resourceImpact;
  assert.equal(impact.environmentalStatus,'CRITICAL');
  assert.equal(api.getExtractionMultiplier('BGD'),0.65);
  assert.equal(state.resource.BGD.environmentalControls.productionCapacityMultiplier,0.65);

  const availableBefore=state.finance.BGD.available;
  const turnResult=api.processTurn();
  assert.equal(turnResult.status,'COMPLETED');
  assert.ok(state.finance.BGD.available<availableBefore,'remediation must have a real, ledgered treasury cost');
  assert.ok(state.finance.BGD.environmentalLedger.some(x=>x.paid>0));
  assert.ok(state.finance.BGD.environmentalRemediationLiabilityUnits>0);
  const afterFirstRemediation=state.finance.BGD.available;
  api.processTurn();
  assert.equal(state.finance.BGD.available,afterFirstRemediation,'re-running remediation during one turn must not charge twice');
  assert.equal(state.finance.BGD.environmentalLedger.filter(x=>x.turn===2).length,1,'one remediation receipt per country per turn');

  h.context.dispatchEvent(event('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE','BGD',{
    countryId:'BGD',transactionId:'FACTORY-TXN-1',sourceBatchIds:['BATCH-BGD-2'],
    outputQuantities:{COAL_CONCENTRATE:10,COAL_REJECT:2},unit:'TONNES'
  }));
  await api.flushPending();
  impact=state.environment.BGD.resourceImpact;
  assert.ok(impact.ledger.some(x=>x.eventId==='PROCESSING:FACTORY-TXN-1:coal_concentrate'&&x.status==='MODELED'));
  assert.ok(impact.ledger.some(x=>x.eventId==='PROCESSING:FACTORY-TXN-1:coal_reject'&&x.status==='MODELED'));
  assert.ok(api.diagnostics().environment.modeledCountries>=1);
});

test('unit mismatch is explicit and does not invent an environmental quantity',async()=>{
  const h=harness(),{api,state}=h;
  h.context.dispatchEvent(event('OMEGA_RESOURCE_EXTRACTION_COMPLETED','BGD',{
    countryId:'BGD',resourceId:'coal',quantity:5,unit:'BARRELS',
    batch:{batchId:'BAD-UNIT-BATCH',resourceId:'coal',quantity:5,unit:'BARRELS'}
  }));
  await api.flushPending();
  const row=state.environment.BGD.resourceImpact.ledger[0];
  assert.equal(row.status,'BLOCKED');
  assert.equal(row.reason,'RESOURCE_UNIT_DOES_NOT_MATCH_ENVIRONMENT_RULE');
  assert.equal(row.impacts.ghgTCO2e,0);
  assert.equal(state.environment.BGD.resourceImpact.cumulative.ghgTCO2e,0);
});

test('save/load round trip preserves reserve, inventory, batch lineage and fiscal state; checksum corruption is rejected',()=>{
  const h=harness(),{api,state}=h;
  state.simulation.turn=73;
  state.resource.BGD.mineStates.SITE_BGD_A.residualQuantity=12345;
  state.resource.BGD.batches[0].remainingQuantity=700;
  state.resource.BGD.inventory.coal=700;
  state.finance.BGD.available=987654321;
  const exported=api.createSaveEnvelope();
  assert.equal(exported.status,'READY');
  assert.equal(api.validateSave(exported.envelope).status,'VALID');
  const save=api.save('milestone-c-checkpoint');
  assert.equal(save.status,'SAVED');
  state.simulation.turn=999;
  state.resource.BGD.mineStates.SITE_BGD_A.residualQuantity=1;
  state.resource.BGD.batches.push({batchId:'UNSAVED',quantity:9,remainingQuantity:9});
  state.finance.BGD.available=0;
  const loaded=api.load('milestone-c-checkpoint');
  assert.equal(loaded.status,'RESTORED',JSON.stringify(loaded));
  assert.equal(state.simulation.turn,73);
  assert.equal(state.resource.BGD.mineStates.SITE_BGD_A.residualQuantity,12345);
  assert.equal(state.resource.BGD.batches.length,1);
  assert.equal(state.resource.BGD.batches[0].remainingQuantity,700);
  assert.equal(state.resource.BGD.inventory.coal,700);
  assert.equal(state.finance.BGD.available,987654321);
  assert.equal(api.listSlots().slots.join(','),'milestone-c-checkpoint');

  const corrupt=api.createSaveEnvelope().envelope;
  corrupt.state.simulation.turn=1000;
  assert.equal(api.validateSave(corrupt).status,'INVALID');
  assert.equal(api.validateSave(corrupt).reason,'SAVE_CHECKSUM_MISMATCH');
  assert.equal(state.simulation.turn,73,'invalid save must not mutate live game state');
});

test('automatic turn autosave writes one stable slot and state audit identifies identity breaches',()=>{
  const h=harness(),{api,state,storage,context}=h;
  state.simulation.turn=8;
  context.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_ECONOMY_UPDATED',{detail:{countryId:'BGD'}}));
  assert.ok(storage.getItem('omega.resource.save.v1:autosave'));
  const first=storage.getItem('omega.resource.save.v1:autosave');
  context.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_ECONOMY_UPDATED',{detail:{countryId:'BGD'}}));
  assert.equal(storage.getItem('omega.resource.save.v1:autosave'),first,'same turn must not produce duplicate autosave writes');
  state.resource.BGD.batches.push({batchId:'CROSS-OWNER',resourceId:'coal',quantity:1,remainingQuantity:1,countryId:'SAU'});
  assert.equal(api.auditState().status,'DEGRADED');
  assert.ok(api.auditState().issues.some(x=>x.type==='CROSS_COUNTRY_BATCH_OWNER'));
});

test('save loader rejects semantically inconsistent state even when checksum is recomputed',()=>{
  const h=harness(),{api,state}=h;
  const exported=api.createSaveEnvelope();
  assert.equal(exported.status,'READY');
  const invalid=exported.envelope;
  invalid.state.resource.BGD.batches[0].countryId='SAU';
  const body={schema:invalid.schema,schemaVersion:invalid.schemaVersion,metadata:invalid.metadata||{},state:invalid.state};
  invalid.checksum=api.checksum(body);
  const validation=api.validateSave(invalid);
  assert.equal(validation.status,'INVALID');
  assert.equal(validation.reason,'SAVE_STATE_INTEGRITY_FAILED');
  assert.ok(validation.integrity.issues.some(x=>x.type==='CROSS_COUNTRY_BATCH_OWNER'));
  const turnBefore=state.simulation.turn;
  const restored=api.restoreSave(invalid);
  assert.equal(restored.status,'REJECTED');
  assert.equal(state.simulation.turn,turnBefore,'semantically invalid save must not mutate live state');
});
