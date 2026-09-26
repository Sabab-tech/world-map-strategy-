/* OMEGA RESOURCE PRODUCTION MODEL v2.0.0
 * Stateful production, explicit units, quality semantics, multi-commodity deposits,
 * and OBSERVED/SIMULATED authority separation.
 */
(function(g){
'use strict';
const VERSION='2.0.0',DAY=24,HORIZON=100000;
const UNITS={
 TONNES:['T','TON','TONS','TONNE','TONNES','MT','METRIC_TON','METRIC_TONS'],
 KG:['KG','KILOGRAM','KILOGRAMS'],GRAMS:['G','GRAM','GRAMS'],
 TROY_OZ:['OZ','OZT','OUNCE','OUNCES','TROY_OZ','TROY_OUNCE','TROY_OUNCES'],
 BBL:['BBL','BBLS','BARREL','BARRELS'],TCF:['TCF'],BCF:['BCF'],BCM:['BCM'],MCM:['MCM'],MCF:['MCF'],
 PERCENT:['%','PERCENT'],PPM:['PPM'],MG_L:['MG/L'],G_T:['G/T'],API_GRAVITY:['API','API_GRAVITY']
};
const clone=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).filter(([k])=>k!=='__proto__'&&k!=='constructor').map(([k,x])=>[k,clone(x)]));
const num=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;const m=String(v??'').replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const rid=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
const cid=v=>String(v??'').trim().toUpperCase();
const unit=u=>{const x=String(u??'').trim().toUpperCase();for(const[k,a]of Object.entries(UNITS))if(a.includes(x))return k;return null};
const scale=s=>{const x=String(s||'').toLowerCase();return x.includes('trillion')?1e12:x.includes('billion')?1e9:x.includes('million')?1e6:x.includes('thousand')?1e3:1};
function measure(text,allowed){const m=String(text??'').match(new RegExp('([0-9]+(?:\\.[0-9]+)?)\\s*(trillion|billion|million|thousand)?\\s*('+allowed.join('|')+')\\b','i'));if(!m)return{status:'UNOBSERVED',value:null,unit:null,raw:String(text??'')};return{status:'OBSERVED',value:Number(m[1])*scale(m[2]),unit:unit(m[3]),sourceUnit:m[3].toUpperCase(),raw:String(text??'')}}
function parseReserve(text,resourceId,targetUnit){
 const external=g.Omega?.ResourceRealism?.parseReserve;
 if(typeof external==='function'){const x=external(text,resourceId);if(x?.status){
   const family=x.unitFamily||x.sourceUnit||null;
   const target=targetUnit||family;
   let value=x.value;
   if(family==='TCF'&&target==='BCM')value=Number(x.value)*28.316846592;
   else if(family==='BCF'&&target==='BCM')value=Number(x.value)*0.028316846592;
   else if(family==='MCM'&&target==='BCM')value=Number(x.value)*0.001;
   else if(family==='MCF'&&target==='BCM')value=Number(x.value)*0.000000028316846592;
   else if(family==='TONNES'&&target==='TROY_OZ')value=Number(x.value)*32150.74656862745;
   return{...x,value,unit:target,targetUnit:target};
 }}
 const r=rid(resourceId),t=String(text??''),u=r==='crude_oil'?UNITS.BBL:r==='natural_gas'?[...UNITS.TCF,...UNITS.BCF,...UNITS.BCM,...UNITS.MCM,...UNITS.MCF]:r==='gold'?[...UNITS.TROY_OZ,...UNITS.TONNES]:UNITS.TONNES;
 const x=measure(t,u);if(x.status!=='OBSERVED')return{status:'UNOBSERVED',value:null,unit:targetUnit||null,raw:t};
 const target=targetUnit||(r==='natural_gas'?'BCM':r==='gold'?'TROY_OZ':x.unit);
 let value=x.value;
 if(x.unit==='TCF'&&target==='BCM')value*=28.316846592;
 else if(x.unit==='BCF'&&target==='BCM')value*=0.028316846592;
 else if(x.unit==='MCM'&&target==='BCM')value*=0.001;
 else if(x.unit==='MCF'&&target==='BCM')value*=0.000000028316846592;
 else if(x.unit==='TONNES'&&target==='TROY_OZ')value*=32150.74656862745;
 return{...x,value,unit:target,targetUnit:target};
}
const pick=(o,keys)=>{for(const k of keys)if(o?.[k]!==undefined&&o?.[k]!==null&&o?.[k]!=='')return o[k];return null};
const frac=v=>{const n=num(v);return n===null?null:n>1?n/100:n};
function productionModel(raw,reserve){
 const p=raw?.productionModel&&typeof raw.productionModel==='object'?raw.productionModel:{};
 const read=(scope,keys)=>pick(scope,keys);
 const nominal= num(read(p,['nominalRate','nominalCapacity'])??read(raw,['nominalRate','nominalCapacity']));
 const observedRate=num(read(p,['productionRate','dailyRate','outputRate'])??read(raw,['productionRate','dailyRate','outputRate']));
 const min=num(read(p,['minimumRate','minimumCapacity','minRate','minCapacity'])??read(raw,['minimumRate','minimumCapacity','minRate','minCapacity']));
 const max=num(read(p,['maximumRate','maximumCapacity','maxRate','maxCapacity'])??read(raw,['maximumRate','maximumCapacity','maxRate','maxCapacity']));
 const utilization=frac(read(p,['utilization','utilisation'])??read(raw,['utilization','utilisation']))??.85;
 const recovery=frac(read(p,['recovery'])??read(raw,['recovery']))??1;
 const decline=frac(read(p,['decline','declineRate'])??read(raw,['decline','declineRate']))??0;
 const maintenance=frac(read(p,['maintenance','maintenanceFraction','maintenanceRate'])??read(raw,['maintenance','maintenanceFraction','maintenanceRate']))??0;
 const cost=num(read(p,['operatingCost','operatingCostPerUnit'])??read(raw,['operatingCost','operatingCostPerUnit']));
 const horizon=num(read(p,['simulationHorizonDays'])??read(raw,['simulationHorizonDays']))||HORIZON;
 const observed=nominal!==null||observedRate!==null||min!==null||max!==null;
 const simulatedRate=reserve>0?reserve/horizon:null;
 const nominalBase=nominal??observedRate??simulatedRate;
 const activeRate=observedRate!==null?observedRate:(nominalBase===null?null:Math.max(0,nominalBase*utilization*(1-maintenance)*(1-decline)));
 const derivedMin=min!==null?min:(observedRate!==null?observedRate*.55:(nominalBase!==null?nominalBase*.55:null));
 const derivedMax=max!==null?max:(observedRate!==null?observedRate*1.25:(nominalBase!==null?nominalBase*1.3:null));
 return{nominalCapacity:nominal??observedRate??simulatedRate,minimumCapacity:derivedMin,maximumCapacity:derivedMax,utilization,recovery,decline,maintenance,operatingCost:cost,observedRate,simulatedRate,activeRate,authority:observed?'OBSERVED':'SIMULATED',dataStatus:observed?'AVAILABLE':'UNOBSERVED',rangeDataStatus:min!==null&&max!==null?'OBSERVED':observedRate!==null?'DERIVED_FROM_OBSERVED_RATE':'UNOBSERVED',simulationHorizonDays:horizon,modelVersion:VERSION};
}
function quality(raw,resourceId){
 const external=g.Omega?.ResourceRealism?.quality;
 if(typeof external==='function'){const q=external(raw,resourceId);if(q)return q;}
 return{grade:pick(raw,['grade']),oreGrade:pick(raw,['oreGrade']),concentration:pick(raw,['concentration']),assay:pick(raw,['assay']),metalContent:pick(raw,['metalContent']),purity:pick(raw,['purity']),APIGravity:pick(raw,['APIGravity','apiGravity','api']),gradeStatus:pick(raw,['grade','oreGrade','concentration','assay','metalContent'])===null?'UNOBSERVED':'OBSERVED',purityStatus:pick(raw,['purity'])===null?'UNOBSERVED':'OBSERVED',apiGravityStatus:pick(raw,['APIGravity','apiGravity','api'])===null?'UNOBSERVED':'OBSERVED',semantics:{resourceId:rid(resourceId),grade:'ORE_OR_FEED_COMPOSITION',purity:'REFINED_OR_PRODUCT_COMPOSITION',APIGravity:'PETROLEUM_LIQUID_PROPERTY'}}
}
function normalizeIdentityRegistry(identity){
 if(identity?.listOccurrences)return identity;
 const advanced=identity?.occurrences instanceof Map?identity:null;
 if(!advanced)return identity;
 const e=g.ResourceMinistryEngine;
 const rawDeposits=Array.isArray(e?.deposits)?e.deposits:[];
 const toOccurrence=occ=>{
   const o=typeof occ?.toJSON==='function'?occ.toJSON():clone(occ);
   const dep=advanced.getDeposit?.(o.depositKey);
   const depObj=dep&&typeof dep.toJSON==='function'?dep.toJSON():clone(dep||{});
   const countryId=String(depObj?.hostCountryIso3||o?.provenance?.hostCountryIso3||o?.hostCountryIso3||'').trim().toUpperCase();
   const name=String(depObj?.depositRawName||o?.provenance?.depositRawName||o?.depositName||o?.name||o?.depositKey||'').trim();
   const raw=rawDeposits.find(x=>String(x?.name||'').trim().toUpperCase()===name.toUpperCase() && String(x?.countryCode||x?.country||'').trim().toUpperCase()===countryId) || null;
   return {...o,depositRawName:name,countryId,countryCode:countryId,locationNodeKey:depObj?.locationNodeKey||o?.locationNodeKey||null,rawDeposit:clone(raw)};
 };
 const wrapper=Object.create(Object.getPrototypeOf(advanced));
 Object.assign(wrapper,advanced);
 wrapper.listOccurrences=()=>Array.from(advanced.occurrences.values()).map(toOccurrence);
 wrapper.getOccurrencesByCountry=(countryId)=>advanced.getOccurrencesByCountry?advanced.getOccurrencesByCountry(countryId).map(toOccurrence):wrapper.listOccurrences().filter(x=>String(x.countryId).toUpperCase()===String(countryId).toUpperCase());
 wrapper.getDeposit=(key)=>{
   const dep=advanced.getDeposit?.(key); if(!dep)return null;
   const out=typeof dep.toJSON==='function'?dep.toJSON():clone(dep);
   const raw=rawDeposits.find(x=>String(x?.name||'').trim().toUpperCase()===String(out?.depositRawName||'').trim().toUpperCase() && String(x?.countryCode||x?.country||'').trim().toUpperCase()===String(out?.hostCountryIso3||'').trim().toUpperCase());
   return {...out,depositRawName:out?.depositRawName||out?.canonicalName||key,rawDeposit:clone(raw),locationNodeKey:out?.locationNodeKey||null};
 };
 wrapper.getMineSiteReferencesByCountry=(countryId)=>{
   const wanted=String(countryId||'').trim().toUpperCase(),profiles=e?.countryProfiles&&typeof e.countryProfiles==='object'?e.countryProfiles:{},out=[];
   for(const [profileKey,profile] of Object.entries(profiles)){
     const identity=profile?.identity||profile||{},cid=String(identity.countryId||identity.iso3||profileKey).trim().toUpperCase();
     if(cid!==wanted)continue;
     const sites=profile?.resource_infrastructure_context?.mineSites||profile?.infrastructure_context?.mineSites||profile?.resourceInfrastructureContext?.mineSites||[];
     if(!Array.isArray(sites))continue;
     sites.forEach((site,index)=>{
       const name=String(typeof site==='string'?site:site?.name||site?.siteName||site?.mineName||site?.depositName||'').trim();if(!name)return;
       out.push({...((site&&typeof site==='object')?clone(site):{}),siteReferenceKey:'SITE:'+cid+':'+String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_'),countryId:cid,countryCode:cid,profileKey:String(profileKey),siteName:name,status:'ACTIVE_SITE_REFERENCE',activationState:'ACTIVE_REFERENCE',sourceAuthority:'RESOURCE_JSON',sourceDatasetId:'RESOURCE_JSON.countryProfiles',sourcePath:'GSRSK_Master_CountryProfiles_v14.countryProfiles.'+String(profileKey)+'.resource_infrastructure_context.mineSites['+index+']'});
     });
   }
   return out;
 };
 wrapper.listMineSiteReferences=()=>Object.keys(e?.countryProfiles||{}).flatMap(cid=>wrapper.getMineSiteReferencesByCountry(cid));
 return wrapper;
}
function commodities(occ,typeMap=new Map()){
 const raw=occ?.rawDeposit||{},out=[];
 const arr=pick(raw,['commodities','resources','resourceStreams','commodityDeposits']);
 if(Array.isArray(arr))for(const x of arr)out.push(typeof x==='string'?{resourceId:rid(x)}:{...clone(x),resourceId:rid(x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource)});
 if(!out.length&&g.Omega?.ResourceRealism?.splitCommodities){
   const ids=[...typeMap.keys()].filter(Boolean);
   for(const x of g.Omega.ResourceRealism.splitCommodities(raw,ids))if(x?.resourceId)out.push(clone(x));
 }
 const primary=rid(occ?.resourceTypeId||occ?.resourceTypeKey||raw.resId||raw.resourceId||raw.resourceType);
 if(primary&&!out.some(x=>x.resourceId===primary))out.unshift({resourceId:primary});
 return [...new Map(out.filter(x=>x.resourceId).map(x=>[x.resourceId,x])).values()];
}
function patch(){const old=g.GSRSK_Part05||g.GSRSK_ResourceReserveExtractionEngine;if(!old||old.__productionModelV2)return false;
const compileReserves=(identity,_unused,knowledge)=>{identity=normalizeIdentityRegistry(identity);if(!identity?.listOccurrences)return{status:'FAILED',reason:'RESOURCE_IDENTITY_REGISTRY_REQUIRED'};const types=new Map((knowledge?.sovereignEntities?.resourceTypes||[]).map(x=>[rid(x?.id),x]));const reserves=new Map(),capacities=new Map(),lifecycles=new Map(),accessibility=new Map(),commodityDeposits=new Map();for(const occ of identity.listOccurrences()){const list=commodities(occ,types),single=list.length===1;for(const c of list){const baseRaw=clone(occ.rawDeposit||{});if(list.length>1){delete baseRaw.reserves;delete baseRaw.reserve;delete baseRaw.geologicalQuantity;delete baseRaw.recoverableQuantity;delete baseRaw.residualQuantity;delete baseRaw.productionModel;delete baseRaw.productionRate;delete baseRaw.dailyRate;delete baseRaw.outputRate;delete baseRaw.nominalCapacity;delete baseRaw.nominalRate;delete baseRaw.minimumCapacity;delete baseRaw.maximumCapacity;delete baseRaw.minCapacity;delete baseRaw.maxCapacity;delete baseRaw.grade;delete baseRaw.oreGrade;delete baseRaw.concentration;delete baseRaw.assay;delete baseRaw.metalContent;delete baseRaw.purity;delete baseRaw.APIGravity;delete baseRaw.apiGravity;}const raw={...baseRaw,...clone(c)},resourceId=rid(c.resourceId),parsed=parseReserve(raw.reserves??raw.reserve??raw.geologicalQuantity,resourceId,raw.unit||types.get(resourceId)?.unit);if(parsed.status!=='OBSERVED'||!(parsed.value>0))continue;const key=single?String(occ.occurrenceKey):String(occ.occurrenceKey)+':COM:'+resourceId;const recoverable=num(raw.recoverableQuantity)??parsed.value,model=productionModel(raw,recoverable),q=quality(raw,resourceId),status=String(raw.status||occ.status||'');const active=/ACTIVE|PRODUCING|OPERATING|RUNNING/i.test(status)&&!/SUSPEND|BLOCK|CLOSED|ABANDON/i.test(status);const reserve=new old.ReserveState({occurrenceKey:key,parentOccurrenceKey:occ.occurrenceKey,countryId:cid(occ.countryId),depositKey:occ.depositKey,resourceId,geologicalQuantity:parsed.value,recoverableQuantity:recoverable,residualQuantity:num(raw.residualQuantity)??recoverable,unit:parsed.targetUnit||parsed.unit||types.get(resourceId)?.unit||null,operationalStatus:active?'ACTIVE_EXTRACTION':'BLOCKED',stateVersion:1,quality:q,productionModel:model,provenance:{sourceAuthority:'RESOURCE_JSON',sourceDatasetId:raw.sourceDatasetId||occ.sourceDatasetId||'resources.json',reserveText:String(raw.reserves??raw.reserve??''),quantityAuthority:'OBSERVED',productionAuthority:model.authority}});const CapacityCtor=old.Capacity||old.ExtractionCapacity;if(typeof CapacityCtor!=='function')throw new Error('RESOURCE_CAPACITY_CONSTRUCTOR_UNAVAILABLE');const cap=new CapacityCtor({
  occurrenceKey:key,assetReference:'MINE:'+occ.occurrenceKey+':'+resourceId,unit:reserve.unit||'TONNES',period:old.TemporalWindowUnit?.PER_DAY||'PER_DAY',
  nominalRate:model.activeRate??model.nominalCapacity??0,effectiveRate:model.activeRate??model.nominalCapacity??0,
  availabilityFactor:1,maintenanceFactor:1,technologyFactor:1,nominalCapacity:model.nominalCapacity,minimumCapacity:model.minimumCapacity,maximumCapacity:model.maximumCapacity,
  utilization:model.utilization,recovery:model.recovery,decline:model.decline,maintenance:model.maintenance,operatingCost:model.operatingCost,simulatedRate:model.simulatedRate,
  activeRate:model.activeRate,dailyRate:model.activeRate,effortUtilization:model.utilization,authority:model.authority,dataStatus:model.dataStatus,
  stateAuthority:model.authority,productionAuthority:model.authority,simulationHorizonDays:model.simulationHorizonDays
});Object.assign(cap,{parentOccurrenceKey:occ.occurrenceKey,countryId:cid(occ.countryId),resourceId,nominalCapacity:model.nominalCapacity,minimumCapacity:model.minimumCapacity,maximumCapacity:model.maximumCapacity,
  utilization:model.utilization,recovery:model.recovery,decline:model.decline,maintenance:model.maintenance,operatingCost:model.operatingCost,simulatedRate:model.simulatedRate,
  activeRate:model.activeRate,dailyRate:model.activeRate,effortUtilization:model.utilization,authority:model.authority,dataStatus:model.dataStatus,stateAuthority:model.authority,productionAuthority:model.authority,
  simulationHorizonDays:model.simulationHorizonDays});reserves.set(key,reserve);capacities.set(key,cap);lifecycles.set(key,{occurrenceKey:key,parentOccurrenceKey:occ.occurrenceKey,countryId:cid(occ.countryId),status:reserve.operationalStatus,mode:'STATEFUL_PRODUCTION_MODEL',authority:model.authority});accessibility.set(key,{state:model.dataStatus==='AVAILABLE'?'AVAILABLE':'UNOBSERVED',sourceAuthority:model.authority});commodityDeposits.set(key,{occurrenceKey:occ.occurrenceKey,commodityKey:key,resourceId,countryId:cid(occ.countryId),quality:q,productionModel:model})}}const registry={VERSION,reserveStates:reserves,capacities,lifecycles,accessibilityStates:accessibility,commodityDeposits,getReserveState:k=>reserves.get(String(k||''))||null,registerReserveState:v=>{if(v?.occurrenceKey)reserves.set(String(v.occurrenceKey),v);return v},getCapacityForOccurrence:k=>capacities.get(String(k||''))||null,getRecoverabilityModelForResource:k=>{const c=capacities.get(String(k||''));return c?{recovery:c.recovery,authority:c.authority}:null},listReserveStates:()=>[...reserves.values()].map(x=>clone(x.toJSON?.()||x))};return{status:'READY',registry,occurrenceCount:identity.listOccurrences().length,reserveCount:reserves.size,capacityCount:capacities.size,commodityCount:commodityDeposits.size}};
const executeExtraction=(request,reserve,options={})=>{if(!reserve||!options?.capacity)return old.executeExtraction(request,reserve,options);const cap=options.capacity,hours=num(request?.timeWindowDurationHours)??DAY,window=Math.max(0,num(cap.activeRate??cap.nominalRate)??0)*Math.max(0,hours)/DAY,requested=Math.max(0,num(request?.requestedQuantity)??0),remaining=Math.max(0,num(reserve.residualQuantity)??0),q=Math.min(requested,remaining,window);if(q<=0)return{status:'BLOCKED',diagnostics:[{message:'EXTRACTION_QUANTITY_ZERO'}]};const before=new old.ReserveState(reserve.toJSON?.()||reserve),after=new old.ReserveState({...before,residualQuantity:remaining-q,stateVersion:(before.stateVersion||1)+1,operationalStatus:remaining-q<=0?'EXHAUSTED':'DEPLETING'}),qb=before.quality||{};return{status:q<requested?'PARTIALLY_APPROVED':'APPROVED',approvedQuantity:q,reserveBefore:before,reserveAfter:after,producedBatch:{batchId:'P5:'+String(before.occurrenceKey).replace(/[^A-Z0-9:_-]/gi,'')+':T'+String(request?.simulationTick||0),unit:before.unit||cap.unit||null,grade:qb.grade??null,purity:qb.purity??null,qualityState:clone(qb)},calculationTrace:{requestedQuantity:requested,approvedQuantity:q,capacity:clone(cap),reserveBefore:remaining,reserveAfter:after.residualQuantity,productionModel:clone(before.productionModel)},transition:{from:before.operationalStatus,to:after.operationalStatus},provenance:{sourceAuthority:'RESOURCE_JSON',productionAuthority:cap.authority,quantityAuthority:cap.authority==='OBSERVED'?'OBSERVED':'SIMULATED',modelVersion:VERSION}}};
const api={...old,VERSION,parseReserve,canonicalUnit:unit,unitFamily:unit,productionModel,qualityModel:quality,compileReserves,executeExtraction,normalizeIdentityRegistry,__productionModelV2:true};g.GSRSK_Part05=api;g.GSRSK_ResourceReserveExtractionEngine=api;g.Omega=g.Omega||{};g.Omega.ResourcePart05ReserveExtractionRuntime=api;g.OmegaResourcePart05ReserveExtractionRuntime=api;return true}
g.Omega=g.Omega||{};g.Omega.ResourceProductionModelV2={VERSION,patch};g.OmegaResourceProductionModelV2={VERSION,patch};patch();
})(typeof window!=='undefined'?window:globalThis);