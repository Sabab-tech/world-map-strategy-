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
const siteRegistry=()=>g.OmegaResourceSiteMasterResearchData||O.ResourceSiteMasterResearchData||g.OmegaResourceSiteCanonicalCatalogData||O.ResourceSiteCanonicalCatalogData||{sites:[]};
const routeMap=()=>g.OmegaResourceSiteFactoryRouteMapData||O.ResourceSiteFactoryRouteMapData||{records:[]};
const routeRecord=id=>(routeMap().records||[]).find(s=>String(s.siteId)===String(id));
const siteById=id=>{
 const master=(siteRegistry().sites||[]).find(s=>String(s.siteId)===String(id));
 if(master)return master;
 const s=(g.OmegaResourceSiteCanonicalCatalogData||O.ResourceSiteCanonicalCatalogData)?.sites?.find(x=>String(x.siteId)===String(id));
 return s?{...s,real:{resourceId:s.identity?.resourceTypeId},sourceSiteRecord:{resourceId:s.identity?.resourceTypeId,commercialExtraction:s.operation?.commercialExtraction===true},simulation:{transportRoute:[]}}:null;
};
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const modeToken=v=>({TRUCK:'ROAD',ROAD:'ROAD',RAIL:'RAIL',SHIP:'SEA',SEA:'SEA',BARGE:'BARGE',PIPELINE:'PIPELINE',PORT:'PORT',BRIDGE:'BRIDGE'}[tok(v)]||tok(v)||'ROAD');
const distanceBetween=(a,b,seed)=>{
 const ac=a?.sourceCoordinates||a?.location?.coordinates||a?.coordinates,bc=b?.coordinates||b?.location?.coordinates;
 if(Number.isFinite(Number(ac?.lat))&&Number.isFinite(Number(ac?.lng))&&Number.isFinite(Number(bc?.lat))&&Number.isFinite(Number(bc?.lng))){
  const rad=x=>x*Math.PI/180,lat1=rad(Number(ac.lat)),lat2=rad(Number(bc.lat)),dlat=lat2-lat1,dlng=rad(Number(bc.lng)-Number(ac.lng));
  const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;
  return Math.max(15,Math.round(6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))));
 }
 return 40+(hash(seed)%1960);
};
function ensureIndividualRouteEdges(site,asset,input={}){
 const m=routeRecord(site.siteId);if(!m||!m.commercialExtraction||!m.factoryBinding)return{status:'BLOCKED',reason:'INDIVIDUAL_SITE_FACTORY_BINDING_MISSING',siteId:site.siteId};
 const rid=String(input.resourceId||m.resourceId||'').toLowerCase();
 if(!rid||rid!==String(m.resourceId||'').toLowerCase())return{status:'BLOCKED',reason:'SITE_FACTORY_RESOURCE_BINDING_MISMATCH',siteId:site.siteId,resourceId:rid};
 const c=country(m.countryId),factoryId=String(asset.id||asset.assetId||asset.projectId||'');
 const mode=modeToken(input.transportMode||m.routeModel?.primaryMode||'ROAD');
 const d=distanceBetween(m,asset,site.siteId+'|'+factoryId+'|'+mode);
 const i=net(c),baseId='SITE_ROUTE:'+site.siteId+':'+factoryId+':'+mode;
 const specs=mode==='SEA'?[
  {suffix:'MINE_ACCESS',from:'MINE:'+c+':'+site.siteId,to:'PORT_NODE:'+c+':'+site.siteId,mode:'ROAD',distanceKm:Math.max(5,Math.round(d*.12)),days:1,seaLane:false},
  {suffix:'SEA_LANE',from:'PORT_NODE:'+c+':'+site.siteId,to:'FACTORY_PORT:'+c+':'+factoryId,mode:'SEA',distanceKm:Math.max(50,Math.round(d*.8)),days:Math.max(2,Math.ceil(d*.8/500)),seaLane:true},
  {suffix:'FACTORY_ACCESS',from:'FACTORY_PORT:'+c+':'+factoryId,to:String(asset.locationNodeKey||'FACTORY:'+c+':'+factoryId),mode:'ROAD',distanceKm:Math.max(5,Math.round(d*.08)),days:1,seaLane:false}
 ]:[{suffix:'DIRECT',from:'MINE:'+c+':'+site.siteId,to:String(asset.locationNodeKey||'FACTORY:'+c+':'+factoryId),mode,distanceKm:d,days:Math.max(1,Math.ceil(d/(mode==='RAIL'?500:mode==='PIPELINE'?300:60))),seaLane:false}];
 const edges=[];
 for(const spec of specs){
  const id=baseId+':'+spec.suffix;
  const edge={id,countryId:c,fromNode:spec.from,toNode:spec.to,mode:spec.mode,distanceKm:spec.distanceKm,capacityPerTurn:Math.max(1000,n(asset.capacity)||100000),costPerUnit:mode==='SEA'?.025:.01,travelDays:spec.days,status:'OPEN',damage:0,edgeClass:spec.suffix,seaLane:spec.seaLane,transitCountry:c,authority:'MODELED',sourceSiteId:site.siteId,destinationFactoryId:factoryId,resourceId:rid,routeMapId:m.siteId};
  if(!i.edges[id])i.edges[id]=edge;
  edges.push(i.edges[id]);
 }
 return{status:'READY',edges,routeMap:m};
}
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
   const l=legs[j],factoryId=String(r.factoryId||r.destinationFactoryId||''),assets=state().economy?.[country(site.countryId)]?.productionAssets||[],asset=assets.find(a=>String(a.id||a.assetId||a.projectId)===factoryId),to=String(l.toNode||(j===legs.length-1?(r.toNode||asset?.locationNodeKey||('FACTORY:'+site.countryId+':'+factoryId)):('ROUTE_NODE:'+site.siteId+':'+i+':'+j)));
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
 const rid=String(input.resourceId||routeRecord(site.siteId)?.resourceId||site.real?.resourceId||site.sourceSiteRecord?.resourceId||'').toLowerCase();
 const binding=ensureIndividualRouteEdges(site,asset,{...input,resourceId:rid});
 if(binding.status!=='READY')return binding;
 const from=String(input.fromNode||('MINE:'+c+':'+site.siteId));
 const to=String(input.toNode||asset.locationNodeKey||('FACTORY:'+c+':'+factoryId));
 return shortestPath({...input,countryId:c,site,fromNode:from,toNode:to,factoryId,quantity:n(input.quantity),resourceId:rid});
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
 const mapping=routeRecord(site.siteId);
 const rid=String(input.resourceId||mapping?.resourceId||site.real?.resourceId||site.sourceSiteRecord?.resourceId||site.identity?.resourceTypeId||'').toLowerCase();
 if((mapping&&!mapping.commercialExtraction)||site.sourceSiteRecord?.commercialExtraction===false||site.operation?.commercialExtraction===false||!mapping?.factoryBinding||!rid||['n/a','na','none','unknown'].includes(rid))return{status:'BLOCKED',reason:'NON_COMMERCIAL_OR_UNMAPPED_SITE',siteId:site.siteId,resourceId:rid};
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
 const daysPerTurn=Math.max(1,n(state().simulation?.daysPerTurn)||30);
 const dailyCapacity=Math.max(0,Math.min(n(p.maximumCapacity)||Infinity,Math.max(n(p.minimumCapacity),n(p.nominalCapacity)*utilization*declineFactor*(1-maintenance)*(1-disruption))));
 const capacity=dailyCapacity*daysPerTurn;
 const recovered=Math.min(n(old.remainingReserve),capacity*Math.max(0,Math.min(1,n(p.recovery)||1)));
 old.remainingReserve=Math.max(0,n(old.remainingReserve)-recovered);old.produced=n(old.produced)+recovered;old.lastTurn=turn();old.lastRate=recovered;old.declineFactor=declineFactor;old.maintenanceFactor=1-maintenance;old.lastDisruption=disruption;
 r.siteProduction[key]=old;
 const warehouse=r.warehouse||(r.warehouse={availableByResource:{},reservedByResource:{}});warehouse.availableByResource=warehouse.availableByResource||{};warehouse.availableByResource[rid]=n(warehouse.availableByResource[rid])+recovered;
 const result={status:recovered>0?'PRODUCED':'DEPLETED',countryId:c,siteId:site.siteId,resourceId:rid,turn:turn(),quantity:recovered,unit:p.unit||'TONNES',remainingReserve:old.remainingReserve,capacity,dailyCapacity,daysPerTurn,declineFactor,maintenanceFactor:1-maintenance,disruptionFactor:1-disruption,authority:'SCENARIO_SIMULATION_DATA',automatic:true};
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
 const requested=Math.max(0,n(plan.route.dispatchQuantity));
 const sent=base.dispatchShipment({...input,quantity:requested});
 if(sent?.status!=='DISPATCHED')return sent;
 const actual=Math.min(n(sent.shipment.quantity),requested);
 sent.shipment.route=clone({...plan.route,dispatchQuantity:actual,requestedQuantity:n(input.quantity)||requested});
 sent.shipment.etaTurn=plan.route.etaTurn;
 sent.shipment.quantity=actual;
 sent.shipment.provenance={...(sent.shipment.provenance||{}),authority:'MODELED',routeModel:'STRATEGIC_NETWORK_GRAPH',siteRouteMapId:routeRecord(input.siteId)?.siteId||null};
 const c=country(input.countryId),edges=net(c).edges;
 for(const leg of plan.route.legs){const e=edges[leg.edgeId];if(e)e.reservedThisTurn=n(e.reservedThisTurn)+actual;}
 return sent;
}
function advanceShipments(countryId){
 const c=country(countryId),r=resource(c),nstate=r.industrialNetwork;
 if(nstate&&Array.isArray(nstate.shipments)){
  for(const shipment of nstate.shipments){
   if(shipment.status!=='IN_TRANSIT'||!Array.isArray(shipment.route?.legs))continue;
   const blocked=shipment.route.legs.find(leg=>{
    const edge=allEdges().find(e=>String(e.id)===String(leg.edgeId));
    return edge&&(['BLOCKED','CLOSED','DESTROYED','DISABLED','OCCUPIED'].includes(tok(edge.status))||n(edge.damage)>=1);
   });
   if(blocked){shipment.routeDisruption={edgeId:blocked.edgeId,reason:tok(blocked.status)==='DESTROYED'?'ROUTE_DESTROYED':'ROUTE_BLOCKED',observedTurn:turn()};shipment.etaTurn=Math.max(n(shipment.etaTurn),turn()+1);}
  }
 }
 const result=base.advanceShipments(c);
 for(const delivered of (result?.shipments||[])){
  const live=(r.industrialNetwork?.shipments||[]).find(s=>s.shipmentId===delivered.shipmentId);
  if(!live||live.strategicSettlementApplied)continue;
  const qty=Math.max(0,n(live.quantity)),rid=String(live.resourceId||'').toLowerCase(),wh=r.warehouse||(r.warehouse={availableByResource:{},reservedByResource:{}});
  wh.availableByResource=wh.availableByResource||{};wh.reservedByResource=wh.reservedByResource||{};
  wh.availableByResource[rid]=Math.max(0,n(wh.availableByResource[rid])-qty);
  wh.reservedByResource[rid]=Math.max(0,n(wh.reservedByResource[rid])-qty);
  r.inventory=r.inventory||{};r.inventory[rid]=n(r.inventory[rid])+qty;
  live.strategicSettlementApplied=true;live.factoryInputDelivered=qty;live.deliveryTurn=turn();
  event('OMEGA_STRATEGIC_FACTORY_INPUT_DELIVERED',{countryId:c,siteId:live.siteId,factoryId:live.factoryId,resourceId:rid,quantity:qty,turn:turn()});
 }
 return result;
}
const api=Object.assign({},base,{
 planShipment,dispatchShipment,advanceShipments,
 planStrategicRoute,setEdgeCondition,requestTransitRights,resolveTransitRights,simulateExtractionTurn,
 strategicLogisticsDiagnostics(){return{status:'READY',routeModel:'STRATEGIC_NETWORK_GRAPH',routeModes:['ROAD','RAIL','BRIDGE','PIPELINE','SEA','PORT','BARGE'],supports:['WAR_DAMAGE','ROUTE_DESTRUCTION','NAVAL_BLOCKADE','TRANSIT_RIGHTS','ALTERNATE_ROUTE','CAPACITY','ETA','AUTOMATIC_EXTRACTION'],routeAuthority:'MODELED'};}
});
O.ResourceIndustrialNetwork=api;g.OmegaResourceIndustrialNetwork=api;
g.OmegaStrategicLogisticsStatus={status:'READY',version:'1.0.0',routeModel:'STRATEGIC_NETWORK_GRAPH'};
function settleDeliveryEvent(detail){
 const p=detail?.payload||detail||{},c=country(p.countryId||detail?.countryId),r=resource(c),id=String(p.shipmentId||'');
 const live=(r.industrialNetwork?.shipments||[]).find(s=>String(s.shipmentId)===id);
 if(!live||live.strategicSettlementApplied)return false;
 const qty=Math.max(0,n(live.quantity)),rid=String(live.resourceId||p.resourceId||'').toLowerCase(),wh=r.warehouse||(r.warehouse={availableByResource:{},reservedByResource:{}});
 wh.availableByResource=wh.availableByResource||{};wh.reservedByResource=wh.reservedByResource||{};
 wh.availableByResource[rid]=Math.max(0,n(wh.availableByResource[rid])-qty);
 wh.reservedByResource[rid]=Math.max(0,n(wh.reservedByResource[rid])-qty);
 r.inventory=r.inventory||{};r.inventory[rid]=n(r.inventory[rid])+qty;
 live.strategicSettlementApplied=true;live.factoryInputDelivered=qty;live.deliveryTurn=turn();
 event('OMEGA_STRATEGIC_FACTORY_INPUT_DELIVERED',{countryId:c,siteId:live.siteId,factoryId:live.factoryId,resourceId:rid,quantity:qty,turn:turn()});
 return true;
}
function preflightCommittedTurn(){
 for(const [c,r] of Object.entries(state().resource||{})){
  for(const shipment of (r.industrialNetwork?.shipments||[])){
   if(shipment.status!=='IN_TRANSIT'||shipment.route?.routeModel!=='STRATEGIC_NETWORK_GRAPH')continue;
   const blocked=(shipment.route.legs||[]).find(leg=>{const edge=allEdges().find(e=>String(e.id)===String(leg.edgeId));return edge&&(['BLOCKED','CLOSED','DESTROYED','DISABLED','OCCUPIED'].includes(tok(edge.status))||n(edge.damage)>=1);});
   if(blocked){shipment.routeDisruption={edgeId:blocked.edgeId,reason:tok(blocked.status)==='DESTROYED'?'ROUTE_DESTROYED':'ROUTE_BLOCKED',observedTurn:turn()};shipment.etaTurn=Math.max(n(shipment.etaTurn),turn()+1);}
  }
 }
}
if(typeof g.addEventListener==='function'){
 g.addEventListener('OMEGA_RESOURCE_DELIVERY_COMPLETED',e=>settleDeliveryEvent(e?.detail));
 // Capture phase runs before the industrial runtime's normal turn listener.
 g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',preflightCommittedTurn,true);
}
if(typeof g.addEventListener==='function')g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{
 const rows=siteRegistry().sites||[];
 for(const s of rows){try{simulateExtractionTurn({countryId:s.countryId,siteId:s.siteId});}catch(_){}}
});
})(typeof window!=='undefined'?window:globalThis);
