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
 const targetIds=ids.length?ids.slice(0,Math.min(25,MAX)):[null];
 return targetIds.slice(0,25).map(factoryId=>{
   const x=r.dispatchFromWarehouse({warehouseId:payload?.warehouseId||null,batchId:payload?.batchId||payload?.batch?.batchId||null,resourceId:payload?.resourceId||payload?.batch?.resourceId||null,
     quantity:Number(payload?.quantity)||0,unit:payload?.unit||payload?.batch?.unit||null,sourceNode:payload?.warehouseId||'WAREHOUSE',destinationNode:factoryId||'FACTORY',mode});
   return {...x,factoryId:factoryId||null,resourceId:payload?.resourceId||payload?.batch?.resourceId||null,countryId:canonical(payload?.countryId),stage:'ROUTE_PREVIEW_ONLY',deliveryStatus:'NOT_DISPATCHED',dispatchCommitted:false,inventoryReserved:false,shipmentAuthority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1'};
 });
}
function evaluatePlan(payload,countryId){
 const p=payload&&typeof payload==='object'?payload:{},c=canonical(countryId||p.countryId);
 const planned=plan(p);
 if(!Array.isArray(planned))return{accepted:false,countryId:c||null,status:planned?.status||'UNAVAILABLE',
   reason:planned?.reason||'LOGISTICS_PLAN_UNAVAILABLE',dispatchCommitted:false,shipmentAuthority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1'};
 const policy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
 const targetCountry=canonical(p.targetCountryId||p.destinationCountryId||p.factoryCountryId||'');
 const plans=planned.map(x=>{
   if(!policy||typeof policy.isRouteBlocked!=='function')return x;
   const scope={resourceId:x.resourceId,transportMode:x.transportMode||p.transportMode,routeId:x.routeId,
     siteId:p.siteId||null,factoryId:x.factoryId||null};
   const endpoints=[c,targetCountry].filter((v,i,a)=>v&&a.indexOf(v)===i);
   const checks=endpoints.map(countryId=>({countryId,...policy.isRouteBlocked(countryId,scope)}));
   const blockers=checks.flatMap(y=>Array.isArray(y.blockades)?y.blockades:[]);
   if(!blockers.length)return{...x,routePolicy:{status:'ALLOWED',checkedCountries:endpoints,blockades:[]}};
   const reason='RESOURCE_ROUTE_BLOCKADE_ACTIVE';
   return{...x,status:'BLOCKED',reason,dispatchQuantity:0,deliveryStatus:'NOT_DISPATCHED',
     policyDecision:{status:'BLOCKED',reason,checkedCountries:endpoints,blockades:blockers},
     delivery:{...(x.delivery||{}),status:'BLOCKED',quantity:0}};
 });
 return{accepted:true,countryId:c,planned:plans.length,plans,dispatchCommitted:false,
   inventoryReserved:false,sourceWarehouseDebited:false,
   authority:'OMEGA_RESOURCE_LOGISTICS_ROUTE_PREVIEW_V1',
   shipmentAuthority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1'};
}
function handler(cmd,ctx){
 const p=cmd?.payload||{},c=canonical(ctx?.countryId||p.countryId);
 return evaluatePlan(p,c);
}
function advanceHandler(cmd,ctx){
 const c=canonical(ctx?.countryId||cmd?.payload?.countryId),network=g.Omega?.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
 if(!c)return{accepted:false,status:'BLOCKED',reason:'LOGISTICS_COUNTRY_INVALID'};
 if(!network||typeof network.advanceShipments!=='function')
   return{accepted:false,status:'UNAVAILABLE',reason:'CORE_INDUSTRIAL_NETWORK_UNAVAILABLE'};
 const result=network.advanceShipments(c);
 return{...(result||{}),accepted:!!result&&!['BLOCKED','SKIPPED','UNAVAILABLE'].includes(String(result.status||'').toUpperCase()),
   countryId:c,shipmentAuthority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1'};
}
function emitDelivery(c,s){
 const payload={shipmentId:s.shipmentId,routeId:s.routeId,countryId:c,factoryId:s.factoryId,warehouseId:s.warehouseId,batchId:s.batchId,resourceId:s.resourceId,quantity:s.quantity,unit:s.unit,transportMode:s.transportMode,
   costEstimate:s.economics?.costEstimate??null,travelTimeDays:s.timing?.travelTimeDays??null,status:'DELIVERED_TO_FACTORY',sourceAuthority:s.sourceAuthority||'OBSERVED',simulationTurn:turn()};
 try{interop()?.emitEvent?.('OMEGA_RESOURCE_DELIVERY_COMPLETED',c,'resource-logistics-runtime',payload,{turn:turn(),correlationId:s.shipmentId});}catch(_){}
 try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent('OMEGA_RESOURCE_DELIVERY_COMPLETED',{detail:{eventType:'OMEGA_RESOURCE_DELIVERY_COMPLETED',countryId:c,payload,source:'resource-logistics-runtime'}}));}catch(_){}
}
function install(){
 const m=interop();if(!m?.registerCommandHandler)return false;
 try{
   m.registerAction?.('OMEGA_RESOURCE_LOGISTICS_PLAN',{actionId:'OMEGA_RESOURCE_LOGISTICS_PLAN',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_LOGISTICS_ROUTE_PREVIEW_V1'});
   m.registerAction?.('OMEGA_RESOURCE_LOGISTICS_ADVANCE',{actionId:'OMEGA_RESOURCE_LOGISTICS_ADVANCE',stateOwnerMinistry:'resource',authority:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1'});
   m.registerCommandHandler('OMEGA_RESOURCE_LOGISTICS_PLAN','resource',handler);
   m.registerCommandHandler('OMEGA_RESOURCE_LOGISTICS_ADVANCE','resource',advanceHandler);
   return true;
 }catch(_){return false;}
}
function planFromFactoryInput(payload={}){
 const c=canonical(payload.countryId);
 if(!c)return{status:'BLOCKED',reason:'COUNTRY_ID_INVALID',dispatchCommitted:false};
 const result=evaluatePlan(payload,c);
 return result.accepted?{status:'PLANNED',result}:{status:result.status||'UNAVAILABLE',reason:result.reason,result};
}
function installEventListener(){return false;}
function advanceCountry(countryId){
 return advanceHandler({payload:{countryId}}, {countryId});
}
const API=Object.freeze({VERSION,install,plan,planFromFactoryInput,advanceCountry,routeMode});
g.Omega=g.Omega||{};g.Omega.ResourceLogisticsRuntime=API;g.OmegaResourceLogisticsRuntime=API;
install();installEventListener();
})(typeof window!=='undefined'?window:globalThis);
