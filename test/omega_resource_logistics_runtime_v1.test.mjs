import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers=new Map(),events=[];
const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise};
context.globalThis=context;
context.Game={state:{simulation:{turn:1},resource:{BGD:{}}}};
context.OmegaMinistryInteroperability={
  registerAction(){},
  registerCommandHandler(id,_owner,fn){handlers.set(id,fn);},
  dispatchCommand(owner,id,country,payload){return handlers.get(id)?.({payload,commandId:'CMD-1'},{countryId:country,stateTransaction:{
    get(){return null;},set(){},
  }});},
  emitEvent(type,country,source,payload){events.push({type,country,source,payload});return true;}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('omega_resource_realism_runtime_v1.js','utf8'),context,{filename:'omega_resource_realism_runtime_v1.js'});
vm.runInContext(fs.readFileSync('omega_resource_logistics_runtime_v1.js','utf8'),context,{filename:'omega_resource_logistics_runtime_v1.js'});

const L=context.Omega.ResourceLogisticsRuntime;
assert.equal(L.routeMode('crude_oil'),'pipeline');
assert.equal(L.routeMode('iron_ore'),'rail');
assert.equal(L.routeMode('gold'),'truck');

const route=L.plan({countryId:'BGD',warehouseId:'WH-BGD-RAW',batchId:'B1',resourceId:'iron_ore',quantity:10000,unit:'TONNES',candidateFactoryIds:['FACTORY-1','FACTORY-2']});
assert.equal(route.length,1);
assert.equal(route[0].transportMode,'rail');
assert.ok(route[0].routeId);
assert.ok(route[0].capacity>0);
assert.ok(route[0].costEstimate>0);
assert.ok(route[0].travelTimeDays>0);
assert.equal(route[0].deliveryStatus,'READY_FOR_DELIVERY');
assert.equal(route[0].legCount,1);
assert.equal(route[0].legIndex,1);
assert.equal(route[0].networkAuthority,'SIMULATED');
assert.equal(route[0].realWorldCapacityVerified,false);
assert.equal(route[0].realWorldRouteVerified,false);
assert.equal(route[0].deliveryExecutionMode,'SIMULATED_GAME_QUEUE');

const multi=Logistics.plan({countryId:'BGD',warehouseId:'WH-BGD-RAW',batchId:'BATCH-2',resourceId:'iron_ore',quantity:320000,unit:'TONNES',candidateFactoryIds:['FACTORY-BGD-01']});
assert.equal(multi.length,3);
assert.equal(multi[0].legCount,3);
assert.equal(multi[2].legIndex,3);
assert.equal(multi.reduce((sum,x)=>sum+Number(x.legQuantity||0),0),320000);
assert.equal(new Set(multi.map(x=>x.shipmentGroupId)).size,1);
assert.ok(multi.every(x=>x.networkAuthority==='SIMULATED'&&x.realWorldCapacityVerified===false));

const state={resource:{logistics:{shipments:[]}}};
const tx={get(path){return path==='resource'?state.resource:null;},set(path,value){if(path==='resource.logistics')state.resource.logistics=value;}};
const planned=handlers.get('OMEGA_RESOURCE_LOGISTICS_PLAN')({payload:{countryId:'BGD',warehouseId:'WH-BGD-RAW',batchId:'B1',resourceId:'iron_ore',quantity:10000,unit:'TONNES',candidateFactoryIds:['FACTORY-1']}},{countryId:'BGD',stateTransaction:tx});
assert.equal(planned.accepted,true);
assert.equal(state.resource.logistics.shipments.length,1);
assert.equal(state.resource.logistics.shipments[0].status,'IN_TRANSIT');
assert.equal(state.resource.logistics.shipments[0].networkAuthority,'SIMULATED');
assert.equal(state.resource.logistics.shipments[0].realWorldCapacityVerified,false);

context.Game.state.simulation.turn=3;
const advanced=handlers.get('OMEGA_RESOURCE_LOGISTICS_ADVANCE')({payload:{countryId:'BGD'}},{countryId:'BGD',stateTransaction:tx});
assert.equal(advanced.accepted,true);
assert.equal(advanced.delivered,1);
assert.equal(state.resource.logistics.shipments[0].deliveryStatus,'DELIVERED_TO_FACTORY');
assert(events.some(x=>x.type==='OMEGA_RESOURCE_DELIVERY_COMPLETED'));

console.log('OMEGA RESOURCE LOGISTICS V1 TEST PASSED');
