import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers=new Map(),events=[],dispatchCalls=[];
const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise};
context.globalThis=context;
const legacyShipment={shipmentId:'LEGACY-PLAN-1',batchId:'B-OLD',status:'IN_TRANSIT',deliveryStatus:'IN_TRANSIT'};
const state={resource:{logistics:{shipments:[legacyShipment]}}};
context.Game={state:{simulation:{turn:1},resource:{BGD:state.resource}}};
context.OmegaMinistryInteroperability={
  registerAction(){},
  registerCommandHandler(id,_owner,fn){handlers.set(id,fn);},
  dispatchCommand(...args){dispatchCalls.push(args);return{status:'UNEXPECTED_DISPATCH'};},
  emitEvent(type,country,source,payload){events.push({type,country,source,payload});return true;}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('omega_resource_realism_runtime_v1.js','utf8'),context,{filename:'omega_resource_realism_runtime_v1.js'});
vm.runInContext(fs.readFileSync('omega_resource_logistics_runtime_v1.js','utf8'),context,{filename:'omega_resource_logistics_runtime_v1.js'});

const L=context.Omega.ResourceLogisticsRuntime;

const economySource=fs.readFileSync('omega_resource_economy_runtime_v2.js','utf8');
const eventHandlerStart=economySource.indexOf('function factoryInputEventHandler(cmd,ctx){');
const eventHandlerEnd=economySource.indexOf('\n  function ',eventHandlerStart+20);
assert.ok(eventHandlerStart>=0&&eventHandlerEnd>eventHandlerStart,'factory input event handler is present');
const factoryInputEventHandler=economySource.slice(eventHandlerStart,eventHandlerEnd);
assert.doesNotMatch(factoryInputEventHandler,/ResourceLogisticsRuntime|planFromFactoryInput|\.plan\(/,
  'an extraction event must not schedule a second pre-warehouse logistics plan');
assert.match(factoryInputEventHandler,/PENDING_RAW_WAREHOUSE_RECEIPT/,
  'factory readiness is pending until the raw warehouse has a committed receipt');
assert.match(factoryInputEventHandler,/OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1/,
  'material movement is owned by the Industrial Network');

assert.equal(L.routeMode('crude_oil'),'pipeline');
assert.equal(L.routeMode('iron_ore'),'rail');
assert.equal(L.routeMode('gold'),'truck');

const route=L.plan({countryId:'BGD',warehouseId:'WH-BGD-RAW',batchId:'B1',resourceId:'iron_ore',quantity:10000,unit:'TONNES',candidateFactoryIds:['FACTORY-1','FACTORY-2']});
assert.equal(route.length,2,'all compatible factory candidates receive a route preview');
assert.equal(route[0].transportMode,'rail');
assert.ok(route[0].routeId);
assert.ok(route[0].capacity>0);
assert.ok(route[0].costEstimate>0);
assert.ok(route[0].travelTimeDays>0);
assert.equal(route[0].stage,'ROUTE_PREVIEW_ONLY');
assert.equal(route[0].deliveryStatus,'NOT_DISPATCHED');
assert.equal(route[0].dispatchCommitted,false);
assert.equal(route[0].inventoryReserved,false);

let writes=0;
const tx={get(){throw new Error('route preview must not read/mutate a separate shipment ledger');},set(){writes++;}};
const planHandler=handlers.get('OMEGA_RESOURCE_LOGISTICS_PLAN');
assert.equal(typeof planHandler,'function');
const planned=planHandler({payload:{countryId:'BGD',warehouseId:'WH-BGD-RAW',batchId:'B1',resourceId:'iron_ore',
  quantity:10000,unit:'TONNES',candidateFactoryIds:['FACTORY-1']}},{countryId:'BGD',stateTransaction:tx});
assert.equal(planned.accepted,true);
assert.equal(planned.dispatchCommitted,false);
assert.equal(planned.sourceWarehouseDebited,false);
assert.equal(planned.plans[0].deliveryStatus,'NOT_DISPATCHED');
assert.equal(writes,0);
assert.deepEqual(state.resource.logistics.shipments,[legacyShipment],
  'preview commands must preserve old records and must not write pretend in-transit rows');

const directPreview=L.planFromFactoryInput({countryId:'BGD',warehouseId:'WH-BGD-RAW',batchId:'B1',
  resourceId:'iron_ore',quantity:10000,unit:'TONNES',candidateFactoryIds:['FACTORY-1']});
assert.equal(directPreview.status,'PLANNED');
assert.equal(directPreview.result.dispatchCommitted,false);
assert.equal(dispatchCalls.length,0,'manual route preview must not dispatch a legacy state-changing command');

context.OmegaResourceStrategicPolicyRuntime={
  isRouteBlocked(countryId,scope){
    const blocked=countryId==='BGD'&&scope.transportMode==='rail'&&scope.resourceId==='iron_ore';
    return{blocked,reason:blocked?'RESOURCE_ROUTE_BLOCKADE_ACTIVE':null,
      blockades:blocked?[{policyId:'TEST-RAIL-BLOCKADE',modes:['rail']}]:[]};
  }
};
const blockedPlan=planHandler({payload:{
  countryId:'BGD',targetCountryId:'SAU',warehouseId:'WH-BGD-RAW',batchId:'B2',resourceId:'iron_ore',
  quantity:500,unit:'TONNES',candidateFactoryIds:['FACTORY-BLOCKED']
}},{countryId:'BGD',stateTransaction:tx});
assert.equal(blockedPlan.accepted,true);
assert.equal(blockedPlan.plans[0].status,'BLOCKED');
assert.equal(blockedPlan.plans[0].reason,'RESOURCE_ROUTE_BLOCKADE_ACTIVE');
assert.equal(blockedPlan.plans[0].deliveryStatus,'NOT_DISPATCHED');
assert.deepEqual(state.resource.logistics.shipments,[legacyShipment],
  'a blocked route preview must not create a blocked shipment transaction');

const advances=[];
context.Omega={ResourceIndustrialNetwork:{
  advanceShipments(countryId){
    advances.push(countryId);
    return{status:'COMPLETED',countryId,delivered:1,shipments:[{shipmentId:'CORE-SHIP-1',status:'DELIVERED'}]};
  }
}};
const advanced=L.advanceCountry('BGD');
assert.equal(advanced.status,'COMPLETED');
assert.equal(advanced.delivered,1);
assert.deepEqual(advances,['BGD'],'advanceCountry must delegate to the authoritative Industrial Network');
const advanceHandler=handlers.get('OMEGA_RESOURCE_LOGISTICS_ADVANCE');
assert.equal(typeof advanceHandler,'function');
const commandAdvanced=advanceHandler({payload:{countryId:'BGD'}},{countryId:'BGD',stateTransaction:tx});
assert.equal(commandAdvanced.shipmentAuthority,'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1');
assert.equal(advances.length,2);
assert.equal(writes,0);
assert.equal(events.length,0,'the adapter must not publish delivery without a core-network receipt');
assert.deepEqual(state.resource.logistics.shipments,[legacyShipment]);

const industrialSource=fs.readFileSync('omega_resource_industrial_network_v1.js','utf8');
const transferStart=industrialSource.indexOf('function transferFactoryInputsFromWarehouse(');
const transferEnd=industrialSource.indexOf('\nfunction factoryCycleDue',transferStart+30);
assert.ok(transferStart>=0&&transferEnd>transferStart,'core factory input transfer function is present');
const transferFunction=industrialSource.slice(transferStart,transferEnd);
assert.match(transferFunction,/siteFlowBatchIds/,
  'site-backed extraction batches are classified separately from generic warehouse stock');
assert.match(transferFunction,/!siteFlowBatchIds\.has\(String\(batch\?\.batchId\|\|''\)\)/,
  'the immediate internal transfer must exclude mine batches with physical site-flow records');
assert.match(transferFunction,/SITE_BATCH_REQUIRES_RAW_TO_FACTORY_LOGISTICS/,
  'mine batches awaiting route delivery expose an explicit logistics gate');

console.log('OMEGA RESOURCE LOGISTICS ADAPTER AUTHORITY TEST PASSED');
