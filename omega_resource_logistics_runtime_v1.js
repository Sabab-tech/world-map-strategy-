/* OMEGA RESOURCE LOGISTICS RUNTIME v1.0.0
 * Warehouse -> industry route planning with mode, route, capacity, cost, time and delivery state.
 * This layer plans movement; factory acceptance/consumption remains authoritative elsewhere.
 */
(function(g){
'use strict';
const VERSION='1.0.0',MAX=2048;
const clone=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]));
const interop=()=>g.OmegaMinistryInteroperability||g.Omega?.MinistryInteroperability||null;
const turn=()=>Number(g.Game?.state?.simulation?.turn??g.gameState?.simulation?.turn??0)||0;
const canonical=v=>String(v??'').trim().toUpperCase();
const realism=()=>g.Omega?.ResourceRealism||g.OmegaResourceRealism;
function routeMode(resourceId,destinationType='FACTORY'){
 const r=String(resourceId||'').toLowerCase(); if(/crude_oil|natural_gas/.test(r))return'pipeline';
 if(/coal|iron_ore|bauxite|copper|nickel|cobalt|uranium|phosphate|potash/.test(r))return'rail';
 return'truck';
}
function plan(payload){
 const r=realism();if(!r?.dispatchFromWarehouse)return{status:'UNAVAILABLE',reason:'RESOURCE_REALISM_RUNTIME_UNAVAILABLE'};
 const ids=Array.isArray(payload?.candidateFactoryIds)?payload.candidateFactoryIds.filter(Boolean):[];
 const mode=payload?.transportMode||routeMode(payload?.resourceId);
 const targetIds=ids.length?ids.slice(0,1):[null];
 return targetIds.slice(0,25).map(factoryId=>{
   const x=r.dispatchFromWarehouse({warehouseId:payload?.warehouseId||null,batchId:payload?.batchId||payload?.batch?.batchId||null,resourceId:payload?.resourceId||payload?.batch?.resourceId||null,
     quantity:Number(payload?.quantity)||0,unit:payload?.unit||payload?.batch?.unit||null,sourceNode:payload?.warehouseId||'WAREHOUSE',destinationNode:factoryId||'FACTORY',mode});
   return {...x,factoryId:factoryId||null,resourceId:payload?.resourceId||payload?.batch?.resourceId||null,countryId:canonical(payload?.countryId),stage:'WAREHOUSE_TO_INDUSTRY',deliveryStatus:x.delivery?.status||x.deliveryStatus||'READY_FOR_DELIVERY'};
 });
}
function handler(cmd,ctx){
 const p=cmd?.payload||{},c=canonical(ctx.countryId),rs=clone(ctx.stateTransaction.get('resource')||{}),log=clone(rs.logistics||{});
 const shipments=Array.isArray(log.shipments)?log.shipments:[],plans=plan(p);
 for(const x of plans){
   shipments.push({shipmentId:x.delivery?.shipmentId||null,routeId:x.routeId,warehouseId:x.warehouseId||p.warehouseId||null,batchId:x.batchId||p.batchId||null,
     factoryId:x.factoryId,resourceId:x.resourceId,quantity:x.dispatchQuantity,unit:p.unit||p.batch?.unit||null,transportMode:x.transportMode,
     route:{sourceNode:x.sourceNode,destinationNode:x.destinationNode,distanceKm:x.distanceKm,capacity:x.capacity},
     economics:{costEstimate:x.costEstimate,costUnit:x.costUnit,costAuthority:x.costAuthority},
     timing:{travelTimeDays:x.travelTimeDays,timeAuthority:x.timeAuthority,etaTurn:turn()+Math.max(1,Math.ceil(x.travelTimeDays))},
     status:'PLANNED',deliveryStatus:'READY_FOR_DELIVERY',sourceAuthority:p.sourceAuthority||'OBSERVED',simulationTurn:turn()});
 }
 while(shipments.length>MAX)shipments.shift();
 log.shipments=shipments;log.lastPlanTurn=turn();log.status='OPERATIONAL';log.routeCount=shipments.length;
 ctx.stateTransaction.set('resource.logistics',log);
 return{accepted:true,countryId:c,planned:plans.length,shipments:plans.map(x=>x.delivery?.shipmentId||x.routeId),plans};
}
function install(){
 const m=interop();if(!m?.registerCommandHandler)return false;
 try{
   m.registerAction?.('OMEGA_RESOURCE_LOGISTICS_PLAN',{actionId:'OMEGA_RESOURCE_LOGISTICS_PLAN',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_LOGISTICS_RUNTIME'});
   m.registerCommandHandler('OMEGA_RESOURCE_LOGISTICS_PLAN','resource',handler);return true;
 }catch(_){return false;}
}
function planFromFactoryInput(payload={}){
 const c=canonical(payload.countryId);const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE'};
 try{return m.dispatchCommand('resource','OMEGA_RESOURCE_LOGISTICS_PLAN',c,payload,{turn:turn(),commandType:'LOGISTICS_PLAN',correlationId:payload.extractionId||payload.batchId||null});}
 catch(e){return{status:'FAILED',reason:String(e?.message||e)}}
}
function installEventListener(){return false;}
const API=Object.freeze({VERSION,install,plan,planFromFactoryInput,routeMode});
g.Omega=g.Omega||{};g.Omega.ResourceLogisticsRuntime=API;g.OmegaResourceLogisticsRuntime=API;
install();installEventListener();
})(typeof window!=='undefined'?window:globalThis);
