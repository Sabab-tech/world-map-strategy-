/* OMEGA RESOURCE SYSTEM HARDENING v1.0.0
 * Canonical runtime bridge for 199 resource sites.
 * Observed source fields remain authoritative; simulation fills gameplay gaps.
 */
(function(g){
'use strict';
if(g.__omegaResourceSystemHardeningV1)return;
g.__omegaResourceSystemHardeningV1=true;
const VERSION='1.0.0',TARGET_HORIZON_YEARS=375,MIN_HORIZON_YEARS=300,MAX_HORIZON_YEARS=500,EPS=1e-9;
const clone=(v,seen)=>{if(v===null||typeof v!=='object')return v;seen=seen||new WeakMap();if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v)){if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;o[k]=clone(v[k],seen);}return o;};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const state=()=>g.Game?.state||g.gameState||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn)??0;
const year=()=>{const d=state()?.simulation?.date;if(d){const y=Number(String(d).slice(0,4));if(Number.isFinite(y))return y;}return num(state()?.simulation?.startYear)??2015;};
const country=v=>{const raw=String(v??'').trim();if(!raw)return null;try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;const r=b?.resolveCountry?.(raw);if(r?.id)return id(r.id);}catch(_){}return id(raw);};
const resourceState=c=>{const root=state().resource||(state().resource={}),cid=country(c);if(!root[cid])root[cid]={};return root[cid];};

function rowsOf(name){
 const d=g[name]||g.Omega?.[name];
 return Array.isArray(d?.sites)?d.sites:Array.isArray(d?.records)?d.records:[];
}
function masterRows(){return rowsOf('OmegaResourceSiteMasterResearchData');}
function scenarioRows(){return rowsOf('OmegaResourceScenarioEngineeringData');}
function reserveRows(){return rowsOf('OmegaResourceSiteReserveSimulationData');}
function findSite(rows,site,resourceId){
 const sid=String(site?.siteId||site?.siteReferenceKey||site?.id||'').trim(),rid=tok(resourceId||site?.resourceId||site?.resourceTypeId||site?.resource);
 if(sid){const x=rows.find(r=>String(r?.siteId||'').trim()===sid&&(!rid||tok(r?.resourceId)===rid));if(x)return x;}
 const c=country(site?.countryId||site?.countryCode||site?.country),n=tok(site?.siteName||site?.name||site?.mineName||site?.depositName);
 return rows.find(r=>country(r?.countryId)===c&&(!rid||tok(r?.resourceId)===rid)&&tok(r?.siteName||r?.name)===n)||null;
}
function resolveSimulation(site,resourceId){
 const m=findSite(masterRows(),site,resourceId),s=findSite(scenarioRows(),site,resourceId),ms=m?.simulation&&typeof m.simulation==='object'?m.simulation:{};
 const pick=(mk,sk)=>{const a=num(ms?.[mk]);if(a!==null&&a>0)return{value:a,authority:'MASTER_SIMULATION'};const b=num(s?.[sk||mk]);if(b!==null&&b>0)return{value:b,authority:'SCENARIO_ENGINEERING_FALLBACK'};return{value:null,authority:'UNOBSERVED'};};
 const out={siteId:m?.siteId||s?.siteId||site?.siteId||null,simulationOnly:ms?.simulationOnly!==false,capacityModel:ms?.capacityModel||'SYNTHETIC_GAMEPLAY_CAPACITY_V1',
  nominalCapacity:pick('nominalDailyCapacity','nominalCapacity'),minimumCapacity:pick('minimumDailyCapacity','minimumCapacity'),maximumCapacity:pick('maximumDailyCapacity','maximumCapacity'),
  utilization:pick('utilization','utilization'),recovery:pick('recoveryFactor','recovery'),decline:pick('annualDeclineRate','decline'),maintenance:pick('maintenanceRate','maintenance'),
  transportCapacityDaily:pick('transportCapacityDaily','transportCapacityDaily'),transportRoute:Array.isArray(ms?.transportRoute)?clone(ms.transportRoute):(Array.isArray(s?.transportRoute)?clone(s.transportRoute):[]),
  scenarioLifeYears:num(s?.scenarioLifeYears),source:Object.keys(ms).length?'MASTER_SIMULATION':'SCENARIO_ENGINEERING_FALLBACK'};
 const rv=findSite(reserveRows(),site,resourceId);
 if(rv?.reserve?.status==='SIMULATED'&&num(rv.reserve.quantity)>0){out.reserveQuantity=num(rv.reserve.quantity);out.reserveUnit=rv.reserve.unit||null;out.reserveSource='SCENARIO_SIMULATION_DATA';}
 return out;
}
function controlFor(site,c){
 const rs=resourceState(c),sid=String(site?.siteId||site?.siteReferenceKey||site?.id||'');
 return rs.siteControls?.[sid]||rs.mineSiteControls?.[sid]||state().geopolitics?.siteControls?.[sid]||state().geopolitical?.siteControls?.[sid]||{};
}
const mod=(o,keys,d=1)=>{for(const k of keys){const v=num(o?.[k]);if(v!==null)return Math.max(0,Math.min(2,v));}return d;};

function adjustProduction(site,c,stream,sim){
 const p=stream?.production;if(!p)return p;
 const simulated=String(p.authority||'').toUpperCase()==='SIMULATED'||site?.__omegaSimulationInjected===true||String(sim?.source||'').toUpperCase().includes('SIMULATION'),ctrl=controlFor(site,c);
 const cm=mod(ctrl,['productionMultiplier','outputMultiplier']),im=mod(ctrl,['infrastructureMultiplier','infrastructureFactor']),
       wm=mod(ctrl,['workforceMultiplier','workforceFactor']),em=mod(ctrl,['energyMultiplier','energyFactor']),
       gm=mod(ctrl,['geopoliticalMultiplier','controlMultiplier']),tm=mod(ctrl,['transportMultiplier','routeMultiplier']),
       forced=ctrl.blocked===true||ctrl.closed===true||ctrl.suspended===true;
 let factor=cm*im*wm*em*gm*tm;if(forced)factor=0;
 const age=Math.max(0,year()-(num(sim?.startYear)??2015)),decline=num(p.decline);
 if(simulated&&decline!==null&&decline>0&&age>0)factor*=Math.pow(Math.max(0,1-decline),age);
 const reserve=num(stream?.reserve?.quantity),base=num(p.activeRate??p.nominalCapacity);
 if(simulated&&reserve!==null&&base!==null&&base>0){
   const life=reserve/(base*365); if(life>0)factor*=Math.max(0.000001,life/TARGET_HORIZON_YEARS);
 }
 const out={...p};
 for(const k of ['activeRate','nominalCapacity','minimumCapacity','maximumCapacity']){const v=num(out[k]);if(v!==null)out[k]=Math.max(0,v*factor);}
 out.controlMultipliers={cm,im,wm,em,gm,tm,blocked:forced};
 out.declineFactor=decline!==null?Math.pow(Math.max(0,1-decline),age):1;
 out.gameplayHorizonYears=out.activeRate>0&&reserve!==null?reserve/(out.activeRate*365):null;
 out.gameplayHorizonTargetYears=TARGET_HORIZON_YEARS;
 out.gameplayHorizonBand={minimum:MIN_HORIZON_YEARS,target:TARGET_HORIZON_YEARS,maximum:MAX_HORIZON_YEARS};
 out.simulationResolutionSource=sim.source;
 out.simulationCapacityModel=sim.capacityModel;
 return out;
}

function patchSiteModel(){
 const r=g.Omega?.ResourceRealism||g.OmegaResourceRealism;if(!r?.siteModel||r.__resourceSystemHardeningSiteModel)return false;
 const original=r.siteModel;
 r.siteModel=function(site,profile,countryId){
   const s=clone(site||{}),c=country(countryId||s.countryId);
   const multiCommodity=Array.isArray(s.commodities)&&s.commodities.length>0;
   const siteResource=s.resourceId||s.resourceTypeId||s.resource;
   const sim=resolveSimulation(s,siteResource);
   const observed=k=>s[k]!==undefined&&s[k]!==null&&s[k]!=='';
   const inject=(k,e)=>{if(!observed(k)&&e?.value!==null){s[k]=e.value;s.__omegaSimulationInjected=true;}};
   if(!multiCommodity&&sim){
     inject('nominalCapacity',sim.nominalCapacity);inject('minimumCapacity',sim.minimumCapacity);inject('maximumCapacity',sim.maximumCapacity);
     inject('utilization',sim.utilization);inject('recovery',sim.recovery);inject('decline',sim.decline);inject('maintenance',sim.maintenance);
     if(!observed('simulationReserveQuantity')&&sim.reserveQuantity!==undefined)s.simulationReserveQuantity=sim.reserveQuantity;
     if(!observed('simulationReserveUnit')&&sim.reserveUnit)s.simulationReserveUnit=sim.reserveUnit;
   }
   const master=findSite(masterRows(),s,siteResource),ms=master?.simulation||{};
   if(Array.isArray(ms.commodityStreams)&&!Array.isArray(s.commodities))s.commodities=clone(ms.commodityStreams);
   if(Array.isArray(s.commodities)){
     s.commodities=s.commodities.map(stream=>{
       const rid=stream?.resourceId||stream?.resourceTypeId||stream?.resource;
       const ss=resolveSimulation(s,rid);
       const out=clone(stream||{});
       if(!observed.call(out,'simulationReserveQuantity')&&ss.reserveQuantity!==undefined)out.simulationReserveQuantity=ss.reserveQuantity;
       if(!out.simulationReserveUnit&&ss.reserveUnit)out.simulationReserveUnit=ss.reserveUnit;
       if(out.nominalCapacity===undefined&&ss.nominalCapacity?.value!==null)out.nominalCapacity=ss.nominalCapacity.value;
       if(out.minimumCapacity===undefined&&ss.minimumCapacity?.value!==null)out.minimumCapacity=ss.minimumCapacity.value;
       if(out.maximumCapacity===undefined&&ss.maximumCapacity?.value!==null)out.maximumCapacity=ss.maximumCapacity.value;
       if(out.utilization===undefined&&ss.utilization?.value!==null)out.utilization=ss.utilization.value;
       if(out.recovery===undefined&&ss.recovery?.value!==null)out.recovery=ss.recovery.value;
       if(out.decline===undefined&&ss.decline?.value!==null)out.decline=ss.decline.value;
       if(out.maintenance===undefined&&ss.maintenance?.value!==null)out.maintenance=ss.maintenance.value;
       if(out.simulationReserveQuantity!==undefined)out.__omegaSimulationInjected=true;
       return out;
     });
   }
   const result=original(s,profile,countryId);if(!result?.commodityStreams)return result;
   const streams=result.commodityStreams.map(x=>{const streamSim=resolveSimulation(s,x?.resourceId||s.resourceId||s.resourceTypeId||s.resource);const y={...x,production:adjustProduction(s,c,x,streamSim)};if(s.__omegaSimulationInjected||String(x?.production?.authority||'').toUpperCase()==='SIMULATED'){y.production.authority='SIMULATED';y.production.dataStatus='SIMULATED';y.production.observedRate=x.production.observedRate??null;}return y;});
   return{...result,commodityStreams:streams,simulationProfile:{siteId:sim.siteId,source:sim.source,capacityModel:sim.capacityModel,scenarioLifeYears:sim.scenarioLifeYears,
     nominalCapacity:sim.nominalCapacity,minimumCapacity:sim.minimumCapacity,maximumCapacity:sim.maximumCapacity,utilization:sim.utilization,recovery:sim.recovery,
     decline:sim.decline,maintenance:sim.maintenance,transportCapacityDaily:sim.transportCapacityDaily,transportRoute:sim.transportRoute,reserveQuantity:sim.reserveQuantity,reserveUnit:sim.reserveUnit}};
 };
 r.siteModel.__resourceSystemHardeningSiteModel=true;
 r.__resourceSystemHardeningSiteModel=true;
 return true;
}

function auditCountry(c){
 const cid=country(c),rs=resourceState(cid),states=rs.mineStates&&typeof rs.mineStates==='object'?rs.mineStates:{},ledger=Array.isArray(rs.mineProductionLedger)?rs.mineProductionLedger:[],totals=rs.mineOutputTotals&&typeof rs.mineOutputTotals==='object'?rs.mineOutputTotals:{};
 const a={status:'PASS',countryId:cid,checked:0,violations:[],updatedTurn:turn()};
 for(const [key,row] of Object.entries(states)){
   const residual=num(row?.residualQuantity),recoverable=num(row?.recoverableQuantity);if(residual===null||recoverable===null)continue;
   const extracted=Math.max(0,recoverable-residual),recorded=ledger.filter(x=>String(x?.mineId||'')===key).reduce((s,x)=>s+(num(x?.quantity)||0),0),cumulative=num(totals[key]?.cumulativeQuantity);
   if(Math.abs(recorded-extracted)>Math.max(EPS,recoverable*1e-8)||(cumulative!==null&&Math.abs(cumulative-extracted)>Math.max(EPS,recoverable*1e-8))){a.status='FAIL';a.violations.push({occurrenceKey:key,recoverable,residual,extracted,recorded,cumulative});}
   row.initialRecoverableQuantity=recoverable;row.extractedToDate=extracted;row.remainingRecoverableQuantity=residual;row.depletionFraction=recoverable>0?Math.min(1,Math.max(0,extracted/recoverable)):1;row.depletionStatus=residual<=EPS?'EXHAUSTED':(extracted>0?'DEPLETING':'AVAILABLE');row.depletionAuditTurn=turn();a.checked++;
 }
 rs.mineStates=states;rs.depletionIntegrity=a;return a;
}
function patchExtraction(){
 const rt=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;if(!rt||rt.__resourceSystemHardeningExtraction)return false;
 const all=rt.extractAll,countryExtract=rt.extractCountry;
 rt.extractCountry=async(c,keys)=>{const r=await countryExtract(c,keys);auditCountry(c);return r;};
 rt.extractAll=async()=>{const r=await all();for(const x of r?.results||[])auditCountry(x?.countryId);return r;};
 rt.__resourceSystemHardeningExtraction=true;return true;
}

function ontology(){return g.__OmegaResourceEconomyOntology||{};}
function processModel(resourceId){
 const rid=tok(resourceId),o=ontology(),row=o[rid]||o[String(resourceId).toUpperCase()]||o[resourceId],outs=Array.isArray(row?.refinedOutputs)?row.refinedOutputs.filter(Boolean):[];
 if(!row)return{resourceId:rid,inputCoefficient:1,outputs:{},wasteFraction:0,energyPerInput:0,waterPerInput:0,authority:'UNOBSERVED_ONTOLOGY_RULE'};
 const share=outs.length?0.88/outs.length:0;
 return{resourceId:rid,inputCoefficient:1,outputs:Object.fromEntries(outs.map(x=>[tok(x),share])),wasteFraction:outs.length?0.12:0,energyPerInput:0.03,waterPerInput:0.015,
   upstreamProcess:row.upstreamProcess||null,midstreamProcess:row.midstreamProcess||null,authority:'SIMULATION_RULES_FROM_CANONICAL_ONTOLOGY'};
}
function ensureFactoryRecipes(){
 const root=state().economy||{},changed=[];
 for(const [c,econ] of Object.entries(root)){
   if(!econ||!Array.isArray(econ.productionAssets))continue;let n=0;
   econ.productionAssets=econ.productionAssets.map(asset=>{const a=clone(asset),rid=tok(a.resourceId||a.inputResourceId||a.inputResource||a.feedstockResourceId||a.feedstock);if(!rid)return a;const m=processModel(rid);
     if((!a.inputCoefficients||!Object.keys(a.inputCoefficients).length)&&m.inputCoefficient>0){a.inputCoefficients={[rid]:m.inputCoefficient};a.processModelAuthority=m.authority;n++;}
     if((!a.outputProfile||!Object.keys(a.outputProfile).length)&&Object.keys(m.outputs).length){a.outputProfile=clone(m.outputs);a.processModelAuthority=m.authority;n++;}
     if(!a.processModel)a.processModel=clone(m);return a;});
   if(n)changed.push({countryId:country(c),changed:n});
 }
 return changed;
}

function logisticsConstraints(p={}){
 const t=Math.max(.1,Math.min(1,num(p.terrainMultiplier??p.terrainFactor)??1)),i=Math.max(.1,Math.min(1,num(p.infrastructureMultiplier??p.infrastructureFactor)??1)),
       border=p.borderOpen===false?0:1,war=Math.max(.1,Math.min(1,num(p.warMultiplier)??(p.atWar===true?.65:1))),
       sanc=Math.max(.1,Math.min(1,num(p.sanctionMultiplier)??(p.sanctioned===true?.55:1))),
       block=Math.max(0,Math.min(1,num(p.blockadeMultiplier)??(p.blockaded===true?0:1))),damage=Math.max(.1,Math.min(1,num(p.damageMultiplier)??1)),
       maint=Math.max(.1,Math.min(1,num(p.maintenanceMultiplier)??1));
 return{terrain:t,infrastructure:i,border,war,sanctions:sanc,blockade:block,damage,maintenance:maint,totalMultiplier:t*i*border*war*sanc*block*damage*maint};
}
function constrainedLogisticsPlan(payload={}){
 const rt=g.Omega?.ResourceLogisticsRuntime||g.OmegaResourceLogisticsRuntime,base=rt?.plan?rt.plan(payload):null;
 const route=base||{status:'UNAVAILABLE',requestedQuantity:num(payload.quantity)||0,dispatchQuantity:0,capacity:0},lc=logisticsConstraints(payload),baseCap=num(route.capacity)||0,req=Math.max(0,num(route.requestedQuantity??payload.quantity)||0),cap=Math.max(0,baseCap*lc.totalMultiplier);
 return{...clone(route),requestedQuantity:req,capacity:cap,dispatchQuantity:Math.min(req,cap),deliveryStatus:Math.min(req,cap)<=0&&req>0?'BLOCKED_BY_ROUTE':(Math.min(req,cap)<req?'PARTIAL_ROUTE_CAPACITY':'READY'),logisticsConstraints:lc};
}

function patchLogistics(){
 const m=g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability;if(!m?.registerCommandHandler)return false;
 try{m.registerCommandHandler('OMEGA_RESOURCE_LOGISTICS_PLAN','resource',(cmd,ctx)=>{const p=cmd?.payload||{},plan=constrainedLogisticsPlan(p),c=country(ctx.countryId),rs=clone(ctx.stateTransaction.get('resource')||{}),log=clone(rs.logistics||{}),shipments=Array.isArray(log.shipments)?log.shipments:[];if(plan.dispatchQuantity>0){const sid=plan.delivery?.shipmentId||('SHIP:'+turn()+':'+c+':'+tok(p.batchId||p.resourceId||'RESOURCE'));if(!shipments.some(s=>String(s?.shipmentId)===String(sid)))shipments.push({shipmentId:sid,countryId:c,batchId:p.batchId||null,resourceId:p.resourceId||null,warehouseId:p.warehouseId||null,factoryId:p.factoryId||null,quantity:plan.dispatchQuantity,unit:p.unit||null,transportMode:plan.transportMode,route:{sourceNode:plan.sourceNode,destinationNode:plan.destinationNode,distanceKm:plan.distanceKm,capacity:plan.capacity},constraints:plan.logisticsConstraints,status:'IN_TRANSIT',createdTurn:turn()});}log.shipments=shipments.slice(-2048);log.lastPlanTurn=turn();log.status='OPERATIONAL';ctx.stateTransaction.set('resource.logistics',log);return{accepted:true,countryId:c,plan};});return true;}catch(_){return false;}
}

function diagnostics(){
 const master=masterRows(),scenario=scenarioRows(),reserve=reserveRows(),commercial=master.filter(x=>x?.sourceSiteRecord?.commercialExtraction===true),playable=commercial.filter(s=>{const sim=resolveSimulation(s,s?.sourceSiteRecord?.resourceId||s?.real?.resourceId);return num(sim.nominalCapacity?.value)>0&&num(sim.reserveQuantity)>0;});
 return{version:VERSION,masterSiteCount:master.length,scenarioSiteCount:scenario.length,reserveSiteCount:reserve.length,commercialSiteCount:commercial.length,playableCommercialSimulationCount:playable.length,
   blockedCommercialSimulationCount:commercial.length-playable.length,targetGameplayHorizonYears:TARGET_HORIZON_YEARS,horizonBand:{minimum:MIN_HORIZON_YEARS,maximum:MAX_HORIZON_YEARS},
   siteModelPatched:!!g.Omega?.ResourceRealism?.__resourceSystemHardeningSiteModel,extractionPatched:!!g.Omega?.ResourceEndowmentRuntime?.__resourceSystemHardeningExtraction};
}
function apply(){patchSiteModel();patchExtraction();ensureFactoryRecipes();patchLogistics();g.Omega=g.Omega||{};g.Omega.ResourceSystemHardening={VERSION,TARGET_HORIZON_YEARS,MIN_HORIZON_YEARS,MAX_HORIZON_YEARS,resolveSimulation,processModel,ensureFactoryRecipes,logisticsConstraints,constrainedLogisticsPlan,auditCountry,diagnostics};g.OmegaResourceSystemHardening=g.Omega.ResourceSystemHardening;}
try{apply();}catch(e){g.OmegaResourceSystemHardeningError=String(e?.message||e);}
try{g.addEventListener?.('OMEGA_READY',apply);g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',apply);g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',()=>{try{ensureFactoryRecipes();}catch(_){} });}catch(_){}
})(typeof window!=='undefined'?window:globalThis);
