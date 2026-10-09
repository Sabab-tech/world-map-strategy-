/* OMEGA STRATEGIC LOGISTICS + AUTOMATIC EXTRACTION SIMULATION v1
 * Gameplay routes are deliberately modeled, not claimed as live GIS data.
 * Route graph edges support war damage, closures, naval blockade, transit diplomacy,
 * capacity, costs, ETA, automatic extraction cycles and deterministic site evolution.
 */
(function(g){
'use strict';
const O=g.Omega||(g.Omega={});
const base=O.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
if(!base){g.OmegaStrategicLogisticsStatus={status:'FAILED',reason:'INDUSTRIAL_RUNTIME_MISSING'};return;}
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const tok=v=>String(v??'').trim().toUpperCase();
const state=()=>g.Game?.state||g.gameState||{};
const turn=()=>n(state().simulation?.turn??state().turn??0);
const country=(c)=>tok(c);
const siteRegistry=()=>g.OmegaResourceSiteMasterResearchData||O.ResourceSiteMasterResearchData||{sites:[]};
const siteById=id=>(siteRegistry().sites||[]).find(s=>String(s.siteId)===String(id));
const net=(c)=>{const s=state();s.transport=s.transport||{};s.transport[c]=s.transport[c]||{};s.transport[c].infrastructure=s.transport[c].infrastructure||{};const i=s.transport[c].infrastructure;i.edges=i.edges||{};i.corridors=i.corridors||{};return i;};
const resource=(c)=>{const s=state();s.resource=s.resource||{};s.resource[c]=s.resource[c]||{};return s.resource[c];};
const event=(name,detail)=>{try{g.dispatchEvent(new CustomEvent(name,{detail}))}catch(_){}};
function allEdges(){
 const out=[];
 for(const [c,v] of Object.entries(state().transport||{})){
  const rows=v?.infrastructure?.edges||{};
  for(const [id,e] of Object.entries(rows))out.push({id,countryId:country(c),...e});
 }
 return out;
}
function routeEdgesForSite(site){
 const routes=Array.isArray(site?.simulation?.transportRoute)?site.simulation.transportRoute:[];
 const out=[];
 for(const [i,r] of routes.entries()){
  const legs=Array.isArray(r.legs)?r.legs:[r];
  let from=String(r.fromNode||('MINE:'+site.countryId+':'+site.siteId));
  for(let j=0;j<legs.length;j++){
   const l=legs[j],to=String(l.toNode||(j===legs.length-1?(r.toNode||('FACTORY:'+r.countryId+':'+(r.factoryId||r.destinationFactoryId||''))):('ROUTE_NODE:'+site.siteId+':'+i+':'+j));
   out.push({id:String(l.edgeId||r.routeId||site.siteId+':'+i+':'+j),countryId:country(l.countryId||r.countryId||site.countryId),fromNode:from,toNode:to,mode:tok(l.mode||l.transportMode||r.mode||r.transportMode||'ROAD'),distanceKm:Math.max(1,n(l.distanceKm??l.distance??r.distanceKm)),capacityPerTurn:Math.max(1,n(l.capacityPerTurn??l.capacity??r.capacityPerTurn)||10000),costPerUnit:Math.max(0,n(l.costPerUnit??r.costPerUnit)||.01),travelDays:Math.max(.1,n(l.travelDays??r.travelDays)||1),status:l.status||r.status||'OPEN',damage:Math.max(0,Math.min(1,n(l.damage??r.damage))),edgeClass:l.edgeClass||'MODELED_CORRIDOR',seaLane:tok(l.mode||r.mode||'').includes('SEA')||tok(l.mode||r.mode||'')==='SHIP',transitCountry:country(l.transitCountry||r.transitCountry||l.countryId||r.countryId||site.countryId),authority:'MODELED'});
   from=to;
  }
 }
 return out;
}
function edgeState(e){
 const all=allEdges().find(x=>String(x.id)===String(e.id));
 return all?{...e,...all}:e;
}
function canUse(e,request){
 const x=edgeState(e),status=tok(x.status||'OPEN');
 if(['BLOCKED','CLOSED','DESTROYED','DISABLED','OCCUPIED'].includes(status)||n(x.damage)>=1)return{ok:false,reason:status==='DESTROYED'||n(x.damage)>=1?'ROUTE_DESTROYED':'ROUTE_CLOSED'};
 if(x.seaLane&&request.navalBlockade){
  const b=request.navalBlockade;
  if(b===true||b===x.id||b===x.edgeClass||Array.isArray(b)&&b.some(v=>v===x.id||v===x.edgeClass))return{ok:false,reason:'NAVAL_BLOCKADE'};
 }
 const remaining=Math.max(0,n(x.capacityPerTurn??x.capacity)-n(x.reservedThisTurn));
 if(remaining<=0)return{ok:false,reason:'ROUTE_CAPACITY_EXHAUSTED'};
 const transit=country(x.transitCountry||x.countryId);
 const owner=country(request.countryId);
 if(transit&&transit!==owner){
  const agreement=(state().diplomacy?.transitAgreements||[]).find(a=>country(a.requesterCountryId)===owner&&country(a.transitCountryId)===transit&&['APPROVED','ACTIVE'].includes(tok(a.status)));
  if(!agreement)return{ok:false,reason:'TRANSIT_RIGHTS_REQUIRED',transitCountryId:transit,agreementRequest:{requesterCountryId:owner,transitCountryId:transit,routeEdgeId:x.id,resourceId:request.resourceId,quantity:request.quantity,status:'REQUESTED'}};
 }
 return{ok:true,edge:x,remaining};
}
function shortestPath(request){
 const edges=[...allEdges(),...routeEdgesForSite(request.site)];
 const start=String(request.fromNode),goal=String(request.toNode);
 const dist=new Map([[start,0]]),prev=new Map(),todo=new Set([start]),rejected={};
 while(todo.size){
  let cur=null,best=Infinity;for(const x of todo){const d=dist.get(x)??Infinity;if(d<best){best=d;cur=x;}}
  if(cur===null||cur===goal)break;todo.delete(cur);
  for(const raw of edges){
   const e=edgeState(raw);if(String(e.fromNode)!==cur)continue;
   const use=canUse(e,request);if(!use.ok){rejected[use.reason]=(rejected[use.reason]||0)+1;continue;}
   const mode=tok(e.mode||'ROAD'),allowed=(request.allowedModes||[]).map(tok);
   if(allowed.length&&!allowed.includes(mode)){rejected.MODE_NOT_ALLOWED=(rejected.MODE_NOT_ALLOWED||0)+1;continue;}
   const next=String(e.toNode),weight=Math.max(.01,n(e.travelDays)||n(e.distanceKm)/60)+Math.max(0,n(e.costPerUnit))*0.0001;
   if(best+weight<(dist.get(next)??Infinity)){dist.set(next,best+weight);prev.set(next,{node:cur,edge:{...e,remainingCapacity:use.remaining}});todo.add(next);}
  }
 }
 if(!dist.has(goal))return{status:'BLOCKED',reason:rejected.NAVAL_BLOCKADE?'NAVAL_BLOCKADE':rejected.ROUTE_DESTROYED?'ROUTE_DESTROYED':rejected.TRANSIT_RIGHTS_REQUIRED?'TRANSIT_RIGHTS_REQUIRED':'NO_CONTIGUOUS_STRATEGIC_ROUTE',rejected};
 const path=[];let cur=goal;while(cur!==start){const p=prev.get(cur);if(!p)return{status:'BLOCKED',reason:'ROUTE_GRAPH_DISCONNECTED'};path.unshift(p.edge);cur=p.node;}
 const quantity=Math.max(0,n(request.quantity)),limiting=path.reduce((v,e)=>Math.min(v,n(e.remainingCapacity)||Infinity),Infinity);
 const dispatch=Math.min(quantity,limiting);
 return{status:dispatch>0?'PLANNED':'BLOCKED',reason:dispatch>0?null:'ROUTE_CAPACITY_EXHAUSTED',routeModel:'STRATEGIC_NETWORK_GRAPH',distanceAuthority:'MODELED',countryId:country(request.countryId),sourceSiteId:request.site?.siteId,destinationFactoryId:request.factoryId,resourceId:request.resourceId,transportMode:path.map(e=>e.mode),legs:path.map(e=>({edgeId:e.id,fromNode:e.fromNode,toNode:e.toNode,mode:e.mode,distanceKm:n(e.distanceKm),travelDays:n(e.travelDays)||n(e.distanceKm)/60,capacityPerTurn:n(e.capacityPerTurn),dispatchCapacity:dispatch,edgeClass:e.edgeClass,status:e.status||'OPEN',damage:n(e.damage),authority:'MODELED',transitCountry:e.transitCountry})),totalDistanceKm:path.reduce((s,e)=>s+n(e.distanceKm),0),travelTimeDays:path.reduce((s,e)=>s+(n(e.travelDays)||n(e.distanceKm)/60),0),dispatchQuantity:dispatch,requestedQuantity:quantity,etaTurn:turn()+Math.max(1,Math.ceil(path.reduce((s,e)=>s+(n(e.travelDays)||n(e.distanceKm)/60),0)/Math.max(1,n(state().simulation?.daysPerTurn)||30))),totalCost:path.reduce((s,e)=>s+quantity*n(e.distanceKm)*n(e.costPerUnit),0),rejectedAlternatives:rejected};
}
function planStrategicRoute(input={}){
 const site=siteById(input.siteId)||input.site;if(!site)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
 const c=country(input.countryId||site.countryId),factoryId=String(input.factoryId||'');
 const assets=state().economy?.[c]?.productionAssets||[];
 const asset=assets.find(a=>String(a.id||a.assetId||a.projectId)===factoryId);
 if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
 const from=String(input.fromNode||('MINE:'+c+':'+site.siteId));
 const to=String(input.toNode||asset.locationNodeKey||('FACTORY:'+c+':'+factoryId));
 return shortestPath({...input,countryId:c,site,fromNode:from,toNode:to,factoryId,quantity:n(input.quantity),resourceId:input.resourceId});
}
function setEdgeCondition(input={}){
 const c=country(input.countryId),i=net(c),id=String(input.edgeId||'');if(!id)return{status:'BLOCKED',reason:'EDGE_ID_REQUIRED'};
 const old=i.edges[id]||{id,fromNode:input.fromNode,toNode:input.toNode,mode:input.mode||'ROAD',distanceKm:n(input.distanceKm)||1,capacityPerTurn:n(input.capacityPerTurn)||10000,transitCountry:c};
 const next={...old,...input,id,countryId:c,updatedTurn:turn()};
 if(input.action==='DESTROY'||input.action==='DESTROY_BRIDGE'||input.action==='DESTROY_RAIL')Object.assign(next,{status:'DESTROYED',damage:1});
 else if(input.action==='REPAIR')Object.assign(next,{status:'OPEN',damage:0});
 else if(input.action==='BLOCKADE')Object.assign(next,{status:'BLOCKED',seaLane:true,blockadeBy:country(input.blockadeBy||c)});
 else if(input.action==='LIFT_BLOCKADE')Object.assign(next,{status:'OPEN',seaLane:true,blockadeBy:null});
 else if(input.action==='DAMAGE')Object.assign(next,{damage:Math.min(.99,Math.max(0,n(input.damage)||.5)),status:'DAMAGED',capacityPerTurn:Math.max(0,n(old.capacityPerTurn)*(1-Math.min(.99,Math.max(0,n(input.damage)||.5))))});
 else if(input.action==='CLOSE')Object.assign(next,{status:'CLOSED'});
 else if(input.action==='OPEN')Object.assign(next,{status:'OPEN'});
 i.edges[id]=next;event('OMEGA_STRATEGIC_ROUTE_CONDITION_CHANGED',clone(next));return{status:'APPLIED',edge:clone(next)};
}
function requestTransitRights(input={}){
 const s=state();s.diplomacy=s.diplomacy||{};s.diplomacy.transitAgreements=s.diplomacy.transitAgreements||[];
 const row={id:'TRANSIT:'+country(input.requesterCountryId)+':'+country(input.transitCountryId)+':'+turn()+':'+Math.abs(String(input.routeEdgeId||'').length),requesterCountryId:country(input.requesterCountryId),transitCountryId:country(input.transitCountryId),routeEdgeId:String(input.routeEdgeId||''),resourceId:String(input.resourceId||''),quantity:Math.max(0,n(input.quantity)),status:'REQUESTED',requestedTurn:turn(),expiresTurn:turn()+Math.max(1,n(input.durationTurns)||12),terms:clone(input.terms||{})};
 const existing=s.diplomacy.transitAgreements.find(x=>x.id===row.id);if(!existing)s.diplomacy.transitAgreements.push(row);event('OMEGA_TRANSIT_RIGHTS_REQUESTED',clone(row));return clone(existing||row);
}
function resolveTransitRights(input={}){
 const rows=state().diplomacy?.transitAgreements||[],row=rows.find(x=>x.id===input.agreementId);if(!row)return{status:'BLOCKED',reason:'TRANSIT_REQUEST_NOT_FOUND'};
 row.status=input.approve?'APPROVED':'DENIED';row.resolvedTurn=turn();row.resolvedBy=country(input.resolvedBy||row.transitCountryId);event('OMEGA_TRANSIT_RIGHTS_RESOLVED',clone(row));return clone(row);
}
function simulateExtractionTurn(input={}){
 const c=country(input.countryId),site=siteById(input.siteId)||input.site;if(!site)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
 const rid=String(input.resourceId||site.real?.resourceId||site.sourceSiteRecord?.resourceId||'').toLowerCase();
 const scenario=O.ResourceScenarioEngineeringData||g.OmegaResourceScenarioEngineeringData;
 const rows=scenario?.records||[],p=rows.find(x=>String(x.siteId)===String(site.siteId)&&String(x.resourceId).toLowerCase()===rid);
 if(!p)return{status:'BLOCKED',reason:'SITE_ENGINEERING_PROFILE_MISSING',siteId:site.siteId};
 const r=resource(c);r.siteProduction=r.siteProduction||{};const key=site.siteId+':'+rid;
 const old=r.siteProduction[key]||{siteId:site.siteId,resourceId:rid,remainingReserve:n(input.reserveQuantity)||n(p.nominalCapacity)*Math.max(1,n(p.scenarioLifeYears))*365,produced:0,lastTurn:turn()-1,shutdown:false};
 if(old.lastTurn===turn())return{status:'BLOCKED',reason:'ALREADY_SIMULATED_THIS_TURN',siteId:site.siteId};
 if(old.shutdown||String(input.action||'').toUpperCase()==='SHUTDOWN'){old.shutdown=true;r.siteProduction[key]=old;return{status:'SHUTDOWN',siteId:site.siteId,turn:turn()};}
 if(String(input.action||'').toUpperCase()==='RESTART')old.shutdown=false;
 const years=Math.max(0,(n(state().simulation?.year)||2015)-2015);
 const decline=Math.max(0,Math.min(.2,n(p.decline)));
 const declineFactor=Math.max(.1,Math.pow(1-decline,years));
 const utilization=Math.max(0,Math.min(1,n(p.utilization)));
 const maintenance=Math.max(0,Math.min(.95,n(p.maintenance)));
 const disruption=Math.max(0,Math.min(.95,n(input.disruption)||0));
 const capacity=Math.max(0,Math.min(n(p.maximumCapacity)||Infinity,Math.max(n(p.minimumCapacity),n(p.nominalCapacity)*utilization*declineFactor*(1-maintenance)*(1-disruption))));
 const recovered=Math.min(n(old.remainingReserve),capacity*Math.max(0,Math.min(1,n(p.recovery)||1)));
 old.remainingReserve=Math.max(0,n(old.remainingReserve)-recovered);old.produced=n(old.produced)+recovered;old.lastTurn=turn();old.lastRate=recovered;old.declineFactor=declineFactor;old.maintenanceFactor=1-maintenance;old.lastDisruption=disruption;
 r.siteProduction[key]=old;
 const warehouse=r.warehouse||(r.warehouse={availableByResource:{},reservedByResource:{}});warehouse.availableByResource=warehouse.availableByResource||{};warehouse.availableByResource[rid]=n(warehouse.availableByResource[rid])+recovered;
 const result={status:recovered>0?'PRODUCED':'DEPLETED',countryId:c,siteId:site.siteId,resourceId:rid,turn:turn(),quantity:recovered,unit:p.unit||'TONNES',remainingReserve:old.remainingReserve,capacity,declineFactor,maintenanceFactor:1-maintenance,disruptionFactor:1-disruption,authority:'SCENARIO_SIMULATION_DATA',automatic:true};
 event('OMEGA_SITE_EXTRACTION_SIMULATED',clone(result));return result;
}
function planShipment(input={}){
 const initial=base.planShipment(input);
 if(initial?.status!=='PLANNED')return initial;
 const route=planStrategicRoute({...input,siteId:initial.siteId,factoryId:initial.factoryId,resourceId:initial.resourceId,quantity:input.quantity||initial.route?.requestedQuantity,allowedModes:input.allowedModes});
 if(route.status!=='PLANNED')return{status:'BLOCKED',reason:route.reason||'NO_CONTIGUOUS_STRATEGIC_ROUTE',siteId:initial.siteId,factoryId:initial.factoryId,route};
 return{...initial,route:{...route,routeId:initial.route?.routeId||('STRATEGIC:'+initial.siteId+':'+initial.factoryId),crossBorderRequired:route.legs.some(l=>country(l.transitCountry)!==country(input.countryId)),crossBorderAllowed:true}};
}
function dispatchShipment(input={}){
 const plan=planShipment(input);if(plan.status!=='PLANNED')return plan;
 const sent=base.dispatchShipment(input);
 if(sent?.status!=='DISPATCHED')return sent;
 sent.shipment.route=clone(plan.route);
 sent.shipment.etaTurn=plan.route.etaTurn;
 sent.shipment.quantity=Math.min(n(sent.shipment.quantity),n(plan.route.dispatchQuantity));
 sent.shipment.provenance={...(sent.shipment.provenance||{}),authority:'MODELED',routeModel:'STRATEGIC_NETWORK_GRAPH'};
 const c=country(input.countryId),edges=net(c).edges;
 for(const leg of plan.route.legs){const e=edges[leg.edgeId];if(e)e.reservedThisTurn=n(e.reservedThisTurn)+n(sent.shipment.quantity);}
 return sent;
}
const api=Object.assign({},base,{
 planShipment,dispatchShipment,
 planStrategicRoute,setEdgeCondition,requestTransitRights,resolveTransitRights,simulateExtractionTurn,
 strategicLogisticsDiagnostics(){return{status:'READY',routeModel:'STRATEGIC_NETWORK_GRAPH',routeModes:['ROAD','RAIL','BRIDGE','PIPELINE','SEA','PORT','BARGE'],supports:['WAR_DAMAGE','ROUTE_DESTRUCTION','NAVAL_BLOCKADE','TRANSIT_RIGHTS','ALTERNATE_ROUTE','CAPACITY','ETA','AUTOMATIC_EXTRACTION'],routeAuthority:'MODELED'};}
});
O.ResourceIndustrialNetwork=api;g.OmegaResourceIndustrialNetwork=api;
g.OmegaStrategicLogisticsStatus={status:'READY',version:'1.0.0',routeModel:'STRATEGIC_NETWORK_GRAPH'};
if(typeof g.addEventListener==='function')g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{
 const rows=siteRegistry().sites||[];
 for(const s of rows){try{simulateExtractionTurn({countryId:s.countryId,siteId:s.siteId});}catch(_){}}
});
})(typeof window!=='undefined'?window:globalThis);
