/* OMEGA RESOURCE PRODUCTION MODEL v2.0.0
 * Stateful production, explicit units, quality semantics, multi-commodity deposits,
 * and OBSERVED/SIMULATED authority separation.
 */
(function(g){
'use strict';
const VERSION='2.0.0',DAY=24,HORIZON=150000;
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
   const resource=rid(resourceId),detectedUnit=String(x.unit||'').toUpperCase();
   const target=String(targetUnit||(
     resource==='natural_gas'?'BCM':
     (['gold','silver','platinum'].includes(resource)?'TROY_OZ':detectedUnit)
   )).toUpperCase();
   const convert=(value,source,target)=>{
     const v=Number(value);if(!Number.isFinite(v))return null;
     if(source===target)return v;
     if(source==='TCF'&&target==='BCM')return v*28.316846592;
     if(source==='BCF'&&target==='BCM')return v*0.028316846592;
     if(source==='MCM'&&target==='BCM')return v*0.001;
     if(source==='MCF'&&target==='BCM')return v*0.000000028316846592;
     if((source==='TONNES'||source==='METRIC_TONS')&&target==='TROY_OZ')return v*32150.74656862745;
     if((source==='TROY_OZ'||source==='TROY_OUNCES')&&target==='TONNES')return v/32150.74656862745;
     return v;
   };
   return{...x,value:convert(x.value,detectedUnit,target),unit:target,targetUnit:target};
 }}
 const r=rid(resourceId),t=String(text??''),u=r==='crude_oil'?UNITS.BBL:r==='natural_gas'?[...UNITS.TCF,...UNITS.BCF,...UNITS.BCM,...UNITS.MCM,...UNITS.MCF]:['gold','silver','platinum'].includes(r)?[...UNITS.TROY_OZ,...UNITS.TONNES]:UNITS.TONNES;
 const x=measure(t,u);if(x.status!=='OBSERVED')return{status:'UNOBSERVED',value:null,unit:targetUnit||null,raw:t};
 const target=targetUnit||(r==='natural_gas'?'BCM':(['gold','silver','platinum'].includes(r)?'TROY_OZ':x.unit));
 return{...x,value:convertReserveValue(x.value,x.unit,target),unit:target,targetUnit:target};
}
function convertReserveValue(value,source,target){
 const v=Number(value);if(!Number.isFinite(v)||source===target)return v;
 if(source==='TCF'&&target==='BCM')return v*28.316846592;
 if(source==='BCF'&&target==='BCM')return v*0.028316846592;
 if(source==='MCM'&&target==='BCM')return v*0.001;
 if(source==='MCF'&&target==='BCM')return v*0.000000028316846592;
 if(source==='TONNES'&&target==='TROY_OZ')return v*32150.74656862745;
 if(source==='TROY_OZ'&&target==='TONNES')return v/32150.74656862745;
 return v;
}
const pick=(o,keys)=>{for(const k of keys)if(o?.[k]!==undefined&&o?.[k]!==null&&o?.[k]!=='')return o[k];return null};
const frac=v=>{const n=num(v);return n===null?null:n>1?n/100:n};
function productionModel(raw,reserve,resourceId){
 const p=raw?.productionModel&&typeof raw.productionModel==='object'?raw.productionModel:{};
 const targetResourceId=rid(resourceId??raw?.resourceId??raw?.resourceTypeId??raw?.resourceTypeKey??raw?.resId);
 const petroleum=targetResourceId==='crude_oil'||targetResourceId==='natural_gas';
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
 const technology=g.Omega?.ResourceResearchRuntime?.getEngineeringEffect?.(raw?.countryId||raw?.countryCode||null,raw?.siteId||raw?.siteReferenceKey||raw?.id||null,rid(resourceId),raw?.siteType||raw?.assetType||null)||{capacityMultiplier:1,recoveryAdd:0,utilizationAdd:0,maintenanceMultiplier:1,declineMultiplier:1,outputMultiplier:1,technologies:[]};
 const clamp01=v=>Math.min(1,Math.max(0,Number(v)||0));
 const finalUtilization=clamp01(utilization+(Number(technology.utilizationAdd)||0));
 const finalRecovery=clamp01(recovery+(Number(technology.recoveryAdd)||0));
 const finalMaintenance=clamp01(maintenance*Math.max(.1,Number(technology.maintenanceMultiplier)||1));
 const finalDecline=clamp01(decline*Math.max(.1,Number(technology.declineMultiplier)||1));
 const capacityFactor=Math.max(.1,Number(technology.capacityMultiplier)||1),outputFactor=Math.max(.1,Number(technology.outputMultiplier)||1);
 const baseNominal=nominal??observedRate??simulatedRate;
 const finalNominal=baseNominal===null?null:baseNominal*capacityFactor;
 const derivedMinBase=min!==null?min:(observedRate!==null?observedRate*.55:(nominalBase!==null?nominalBase*.55:null));
 const derivedMaxBase=max!==null?max:(observedRate!==null?observedRate*1.25:(nominalBase!==null?nominalBase*1.3:null));
 const finalMin=derivedMinBase===null?null:derivedMinBase*capacityFactor;
 const finalMax=derivedMaxBase===null?null:derivedMaxBase*capacityFactor;
 const utilizationRatio=utilization>0?finalUtilization/utilization:1;
 const recoveryRatio=recovery>0?finalRecovery/recovery:1;
 const maintenanceRatio=maintenance<1?(1-finalMaintenance)/(1-maintenance):1;
 const declineRatio=decline<1?(1-finalDecline)/(1-decline):1;
 const baselineRate=observedRate!==null?observedRate*capacityFactor*outputFactor*utilizationRatio*recoveryRatio*maintenanceRatio*declineRatio:(finalNominal===null?null:Math.max(0,finalNominal*finalUtilization*(1-finalMaintenance)*(1-finalDecline)));
 const activeRate=baselineRate;
 return{nominalCapacity:finalNominal,minimumCapacity:finalMin,maximumCapacity:finalMax,utilization:finalUtilization,recovery:finalRecovery,decline:finalDecline,maintenance:finalMaintenance,operatingCost:cost,observedRate,simulatedRate,activeRate,authority:observed?'OBSERVED':'SIMULATED',dataStatus:observed?'AVAILABLE':'UNOBSERVED',rangeDataStatus:min!==null&&max!==null?'OBSERVED':observedRate!==null?'DERIVED_FROM_OBSERVED_RATE':'UNOBSERVED',simulationHorizonDays:horizon,modelVersion:VERSION,declinePolicy:petroleum?'FIELD_SPECIFIC_DECLINE':'SITE_ENGINEERING_CAPACITY_DEPLETION',universalDeclineRateAllowed:false,classificationFramework:petroleum?'SPE_PRMS_2018':'CRIRSCO_STYLE',technologyAdjusted:Array.isArray(technology.technologies)&&technology.technologies.length>0,technologyEffects:clone(technology)};
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
 // Do not infer a second physical commodity merely because its name appears in free-form reserve text.
 // Multi-commodity physical execution requires an explicit structured stream declaration.
 // This preserves genuine polymetallic deposits when they are explicitly represented while
 // preventing one canonical deposit from becoming two physical execution assets by text matching.
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