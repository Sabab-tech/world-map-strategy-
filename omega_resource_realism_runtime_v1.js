/* OMEGA RESOURCE REALISM RUNTIME v1.0.0
 * Normalizes unquantified mine-site references, production state, quality semantics,
 * unit-family parsing, multi-commodity streams, logistics, and state authority.
 * SIMULATED values are explicitly synthetic and never replace OBSERVED values.
 */
(function(g){
'use strict';
const VERSION='1.1.0';
const FAMILY={
 TONNES:['T','TON','TONS','TONNE','TONNES','MT','MILLION TONNES','METRIC TON','METRIC TONS'],
 TROY_OUNCES:['OZ','OZ.','OZT','TROY OZ','TROY OUNCE','TROY OUNCES'],
 BBL:['BBL','BBLS','BARREL','BARRELS'],
 TCF:['TCF'],BCF:['BCF'],BCM:['BCM'],MCM:['MCM'],MCF:['MCF'],
 PERCENT:['%','PERCENT'],GT:['G/T','G PER T','GRAMS/T','GRAMS PER TONNE'],MG_L:['MG/L'],API:['API','API GRAVITY'],CARATS:['CARAT','CARATS','CT']
};
const alias={
 crude_oil:['crude_oil','crude oil','petroleum','oil','crude'],natural_gas:['natural_gas','natural gas','gas','lng','associated gas'],
 copper:['copper','cu'],gold:['gold','au'],iron_ore:['iron_ore','iron ore','iron','fe'],bauxite:['bauxite','alumina','aluminum','aluminium'],
 nickel:['nickel','ni'],cobalt:['cobalt','co'],lithium:['lithium'],rare_earth:['rare_earth','rare earth','ree','neodymium','dysprosium'],
 uranium:['uranium','u3o8'],coal:['coal'],phosphate:['phosphate','phosphate rock','p2o5'],potash:['potash','potassium','k2o'],
 limestone:['limestone'],gypsum:['gypsum'],marble:['marble'],chromium:['chromium','chromite'],silica_sand:['silica sand','silica_sand','sand'],
 clay:['clay','kaolin','bentonite'],zeolite:['zeolite'],zircon:['zircon','zirconium'],
 graphite:['graphite'],rutile:['rutile','titanium mineral'],manganese:['manganese'],diamond:['diamond'],tin:['tin','cassiterite'],tungsten:['tungsten','wolfram'],
 chromite:['chromite','chromium'],silver:['silver','ag'],zinc:['zinc','zn'],platinum:['platinum','pgm'],basalt:['basalt'],construction_aggregate:['aggregate','sand','gravel','crushed stone'],
 coral_aggregate:['coral aggregate','coral'],salt:['salt','brine'],dolomite:['dolomite'],magnesite:['magnesite'],oil_shale:['oil shale'],marble:['marble'],boron:['boron','borate'],aragonite:['aragonite'],granite:['granite'],ilmenite:['ilmenite','titanium'],diatomite:['diatomite','diatomaceous earth']
};
const ranges={
 crude_oil:{unit:'BBL',min:5000,max:50000,lifeMin:12,lifeMax:35,gradeMin:20,gradeMax:50},
 natural_gas:{unit:'BCM',min:.005,max:.08,lifeMin:15,lifeMax:40,gradeMin:85,gradeMax:99},
 gold:{unit:'TROY_OUNCES',min:100,max:2500,lifeMin:10,lifeMax:30,gradeMin:.5,gradeMax:8},
 copper:{unit:'TONNES',min:500,max:5000,lifeMin:12,lifeMax:35,gradeMin:.2,gradeMax:4},
 iron_ore:{unit:'TONNES',min:5000,max:50000,lifeMin:10,lifeMax:40,gradeMin:25,gradeMax:68},
 bauxite:{unit:'TONNES',min:3000,max:30000,lifeMin:10,lifeMax:35,gradeMin:25,gradeMax:55},
 nickel:{unit:'TONNES',min:500,max:8000,lifeMin:10,lifeMax:35,gradeMin:.8,gradeMax:4},
 cobalt:{unit:'TONNES',min:50,max:1200,lifeMin:8,lifeMax:25,gradeMin:.05,gradeMax:1.5},
 lithium:{unit:'TONNES',min:500,max:7000,lifeMin:8,lifeMax:30,gradeMin:.3,gradeMax:3},
 rare_earth:{unit:'TONNES',min:200,max:4000,lifeMin:10,lifeMax:30,gradeMin:1,gradeMax:12},
 uranium:{unit:'TONNES',min:100,max:2500,lifeMin:10,lifeMax:30,gradeMin:.03,gradeMax:.5},
 coal:{unit:'TONNES',min:5000,max:70000,lifeMin:10,lifeMax:45,gradeMin:35,gradeMax:85},
 phosphate:{unit:'TONNES',min:5000,max:60000,lifeMin:10,lifeMax:40,gradeMin:15,gradeMax:35},
 potash:{unit:'TONNES',min:5000,max:60000,lifeMin:10,lifeMax:40,gradeMin:10,gradeMax:35},
 graphite:{unit:'TONNES',min:100,max:5000,lifeMin:8,lifeMax:30,gradeMin:70,gradeMax:98},
 rutile:{unit:'TONNES',min:1000,max:100000,lifeMin:10,lifeMax:40,gradeMin:.3,gradeMax:2},
 manganese:{unit:'TONNES',min:5000,max:200000,lifeMin:10,lifeMax:40,gradeMin:20,gradeMax:55},
 diamond:{unit:'CARATS',min:100000,max:2000000,lifeMin:8,lifeMax:25,gradeMin:0,gradeMax:1},
 tin:{unit:'TONNES',min:100,max:10000,lifeMin:8,lifeMax:30,gradeMin:.1,gradeMax:5},
 tungsten:{unit:'TONNES',min:100,max:10000,lifeMin:8,lifeMax:30,gradeMin:.1,gradeMax:2},
 chromite:{unit:'TONNES',min:1000,max:100000,lifeMin:10,lifeMax:35,gradeMin:20,gradeMax:55},
 silver:{unit:'TROY_OUNCES',min:100000,max:10000000,lifeMin:8,lifeMax:30,gradeMin:20,gradeMax:500},
 zinc:{unit:'TONNES',min:1000,max:100000,lifeMin:8,lifeMax:30,gradeMin:2,gradeMax:20},
 platinum:{unit:'TROY_OUNCES',min:100000,max:5000000,lifeMin:8,lifeMax:35,gradeMin:1,gradeMax:10},
 basalt:{unit:'TONNES',min:10000,max:500000,lifeMin:5,lifeMax:25,gradeMin:90,gradeMax:99},
 construction_aggregate:{unit:'TONNES',min:10000,max:500000,lifeMin:5,lifeMax:25,gradeMin:90,gradeMax:99},
 coral_aggregate:{unit:'TONNES',min:10000,max:300000,lifeMin:5,lifeMax:20,gradeMin:90,gradeMax:99},
 salt:{unit:'TONNES',min:10000,max:1000000,lifeMin:10,lifeMax:40,gradeMin:80,gradeMax:99},
 dolomite:{unit:'TONNES',min:10000,max:500000,lifeMin:10,lifeMax:30,gradeMin:70,gradeMax:98},
 magnesite:{unit:'TONNES',min:1000,max:100000,lifeMin:10,lifeMax:30,gradeMin:70,gradeMax:95},
 oil_shale:{unit:'TONNES',min:10000,max:500000,lifeMin:10,lifeMax:40,gradeMin:1,gradeMax:20},
 marble:{unit:'TONNES',min:5000,max:100000,lifeMin:10,lifeMax:30,gradeMin:90,gradeMax:99},
 boron:{unit:'TONNES',min:5000,max:100000,lifeMin:10,lifeMax:40,gradeMin:10,gradeMax:50},
 aragonite:{unit:'TONNES',min:10000,max:500000,lifeMin:5,lifeMax:20,gradeMin:90,gradeMax:99},
 granite:{unit:'TONNES',min:10000,max:500000,lifeMin:5,lifeMax:25,gradeMin:90,gradeMax:99},
 ilmenite:{unit:'TONNES',min:1000,max:100000,lifeMin:10,lifeMax:35,gradeMin:20,gradeMax:65},
 diatomite:{unit:'TONNES',min:1000,max:100000,lifeMin:10,lifeMax:35,gradeMin:50,gradeMax:95}
};
const modes={
 truck:{capacity:25000,speedKmh:55,costPerTonneKm:.055,defaultDistanceKm:120},
 rail:{capacity:150000,speedKmh:45,costPerTonneKm:.022,defaultDistanceKm:650},
 pipeline:{capacity:500000,speedKmh:30,costPerTonneKm:.012,defaultDistanceKm:800},
 ship:{capacity:200000,costPerTonneKm:.009,defaultDistanceKm:1800,speedKmh:28}
};
const num=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;const m=String(v??'').replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const rid=v=>String(v??'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
const clean=v=>String(v??'').normalize?.('NFKC').trim().toLowerCase()||'';
function hash(seed){let h=2166136261;for(const ch of String(seed||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0}
const fracHash=(s)=>hash(s)/4294967296;
const scale=s=>{const x=clean(s);return x.includes('trillion')?1e12:x.includes('billion')?1e9:x.includes('million')?1e6:x.includes('thousand')?1e3:1};
function unitFamily(unit){
 const u=clean(unit).toUpperCase(); for(const[k,vals] of Object.entries(FAMILY))if(vals.some(v=>String(v).toUpperCase()===u))return k; return null;
}
function resourceFamily(resourceId){
 const r=rid(resourceId); if(r==='crude_oil')return 'BBL'; if(r==='natural_gas')return 'GAS'; if(r==='gold')return 'GOLD'; return 'SOLID';
}
function extractMeasure(text,family){
 const vals=FAMILY[family]||[];if(!vals.length)return null;
 const pattern=vals.map(x=>String(x).replace(/[.*+?^{}()|[\]\\]/g,'\\$&')).join('|');
 const m=String(text??'').match(new RegExp('([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(trillion|billion|million|thousand)?\\s*('+pattern+')\\b','i'));
 if(!m)return null;
 return{value:Number(m[1].replace(/,/g,''))*scale(m[2]),unitFamily:unitFamily(m[3]),sourceUnit:m[3].toUpperCase(),raw:String(text??'')};
}
function canonicalReserveSpec(resourceId){const r=rid(resourceId);if(r==='crude_oil')return{family:'BBL',unit:'BBL'};if(r==='natural_gas')return{family:'GAS',unit:'BCM'};if(r==='gold'||r==='silver'||r==='platinum')return{family:'GOLD',unit:'TROY_OUNCES'};if(r==='diamond')return{family:'CARATS',unit:'CARATS'};return{family:'TONNES',unit:'TONNES'}}
function convertReserve(value,sourceFamily,targetFamily){
 const v=Number(value);if(!Number.isFinite(v))return null;
 if(sourceFamily===targetFamily||sourceFamily===null||targetFamily===null)return v;
 if(sourceFamily==='TCF'&&targetFamily==='BCM')return v*28.316846592;
 if(sourceFamily==='BCF'&&targetFamily==='BCM')return v*0.028316846592;
 if(sourceFamily==='MCM'&&targetFamily==='BCM')return v*0.001;
 if(sourceFamily==='MCF'&&targetFamily==='BCM')return v*0.000000028316846592;
 if(sourceFamily==='TONNES'&&targetFamily==='TROY_OUNCES')return v*32150.74656862745;
 if(sourceFamily==='TROY_OUNCES'&&targetFamily==='TONNES')return v/32150.74656862745;
 return v;
}
function parseReserve(raw,resourceId){
 const spec=canonicalReserveSpec(resourceId),r=rid(resourceId),text=typeof raw==='string'?raw:raw?.reserves??raw?.reserve??raw?.geologicalQuantity??'';
 let x=null;
 if(r==='crude_oil')x=extractMeasure(text,'BBL');
 else if(r==='natural_gas'){for(const f of ['TCF','BCF','BCM','MCM','MCF']){x=extractMeasure(text,f);if(x)break;}}
 else if(r==='gold'){for(const f of ['TROY_OUNCES','TONNES']){x=extractMeasure(text,f);if(x)break;}}
 else x=extractMeasure(text,'TONNES');
 if(!x)return missing(text);
 const value=convertReserve(x.value,x.unitFamily,spec.family);
 if(value===null)return missing(text);
 return{status:'OBSERVED',value,unit:spec.unit,unitFamily:spec.family,sourceUnit:x.sourceUnit,sourceUnitFamily:x.unitFamily,raw:x.raw,resourceId:r};
}
function missing(raw){return{status:'UNOBSERVED',value:null,unitFamily:null,sourceUnit:null,raw:String(raw??'')}}
function commodityText(raw,resourceId){
 if(raw===null||raw===undefined)return null;
 const target=rid(resourceId);
 if(typeof raw==='object'&&!Array.isArray(raw)){
   for(const k of ['commodities','resources','resourceStreams','commodityDeposits'])if(Array.isArray(raw[k])){
     const hit=raw[k].find(x=>rid(typeof x==='string'?x:x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource)===target);
     if(hit!==undefined)return typeof hit==='string'?hit:hit?.reserves??hit?.reserve??hit?.quantity??null;
   }
   const map=raw.reserves||raw.reserve;
   if(map&&typeof map==='object'&&!Array.isArray(map))for(const [k,v] of Object.entries(map))if(rid(k)===target)return typeof v==='string'?v:v?.value??v?.quantity??null;
   return raw.reserves??raw.reserve??null;
 }
 const text=String(raw),words=(alias[target]||[target]).map(clean).filter(Boolean);
 const families=target==='crude_oil'?['BBL']:target==='natural_gas'?['TCF','BCF','BCM','MCM','MCF']:target==='gold'?['TROY_OUNCES','TONNES']:['TONNES'];
 for(const family of families){
   const vals=FAMILY[family]||[],pat=vals.map(x=>String(x).replace(/[.*+?^{}()|[\]\\]/g,'\\$&')).join('|');
   const re=new RegExp('([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(trillion|billion|million|thousand)?\\s*('+pat+')\\b','ig');
   let m;while((m=re.exec(text))){
     const context=text.slice(Math.max(0,m.index-90),Math.min(text.length,m.index+m[0].length+90)).toLowerCase();
     if(words.some(w=>context.includes(w)))return m[0];
   }
 }
 const matches=[];for(const family of families){const vals=FAMILY[family]||[],pat=vals.map(x=>String(x).replace(/[.*+?^{}()|[\]\\]/g,'\\$&')).join('|');const re=new RegExp('([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(trillion|billion|million|thousand)?\\s*('+pat+')\\b','ig');let m;while((m=re.exec(text)))matches.push(m[0]);}
 return matches.length===1?matches[0]:null;
}
function splitCommodities(raw,resourceIds=[]){
 const out=[],arr=raw&&typeof raw==='object'&&Array.isArray(raw.commodities)?raw.commodities:[];
 for(const x of arr){const r=rid(typeof x==='string'?x:x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource);if(r)out.push({...((x&&typeof x==='object')?x:{}),resourceId:r});}
 if(!out.length){
   for(const candidate of Array.isArray(resourceIds)?resourceIds:[]){const r=rid(candidate),snippet=commodityText(raw?.reserves??raw?.reserve??raw,r);if(r&&snippet)out.push({resourceId:r,reserves:snippet});}
 }
 return [...new Map(out.filter(x=>x.resourceId).map(x=>[x.resourceId,x])).values()];
}
function quality(raw,resourceId){
 const r=rid(resourceId),o=typeof raw==='object'&&raw?raw:{},pick=(...ks)=>{for(const k of ks)if(o[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k];return null};
 const grade=pick('grade'),oreGrade=pick('oreGrade'),concentrationRaw=pick('concentration'),assay=pick('assay'),metalContent=pick('metalContent'),purity=pick('purity'),APIGravity=pick('APIGravity','apiGravity','api');
 const gradeText=String(oreGrade??grade??''),pct=s=>{const m=String(s??'').match(/([0-9]+(?:\.[0-9]+)?)\s*%/);return m?Number(m[1]):null};
 const unitMatch=s=>{const t=String(s??'');if(/g\s*\/\s*t/i.test(t))return{value:Number(t.match(/[-+]?[0-9]+(?:\.[0-9]+)?/)?.[0]),family:'GT'};if(/ppm/i.test(t))return{value:Number(t.match(/[-+]?[0-9]+(?:\.[0-9]+)?/)?.[0]),family:'PPM'};if(/mg\s*\/\s*l/i.test(t))return{value:Number(t.match(/[-+]?[0-9]+(?:\.[0-9]+)?/)?.[0]),family:'MG_L'};if(pct(t)!==null)return{value:pct(t),family:'PERCENT'};const n=Number(t);return Number.isFinite(n)?{value:n,family:'UNKNOWN'}:null};
 const gradeParsed=unitMatch(gradeText),numeric=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
 const concentrationParsed=unitMatch(concentrationRaw);
 const gradePercent=gradeParsed?.family==='PERCENT'?gradeParsed.value:null;
 const purityFraction=purity===null?null:(pct(purity)!==null?pct(purity)/100:numeric(purity));
 const apiValue=APIGravity===null?null:numeric(APIGravity);
 let concentration=concentrationRaw,concentrationPercent=concentrationParsed?.family==='PERCENT'?concentrationParsed.value:null;
 let concentrationValue=concentrationParsed?.value??null,concentrationUnitFamily=concentrationParsed?.family??null;
 if(concentration===null&&r==='natural_gas'&&/[0-9]+(?:\.[0-9]+)?\s*%[^,;]*(?:\bmethane\b|\bgas\b)/i.test(gradeText)){concentration=gradeText;concentrationPercent=pct(gradeText);concentrationValue=concentrationPercent;concentrationUnitFamily='PERCENT'}
 return{grade,oreGrade,concentration,assay,metalContent,purity,APIGravity,
   gradeStatus:(grade??oreGrade)!==null?'OBSERVED':'UNOBSERVED',concentrationStatus:concentration!==null?'OBSERVED':'UNOBSERVED',
   assayStatus:assay!==null?'OBSERVED':'UNOBSERVED',metalContentStatus:metalContent!==null?'OBSERVED':'UNOBSERVED',
   purityStatus:purity!==null?'OBSERVED':'UNOBSERVED',apiGravityStatus:APIGravity!==null?'OBSERVED':'UNOBSERVED',
   normalized:{gradeValue:gradeParsed?.value??null,gradeUnitFamily:gradeParsed?.family??null,gradePercent,concentrationValue,concentrationUnitFamily,concentrationPercent,purityFraction,APIGravity:apiValue},
   semantics:{grade:'ore_or_feed_composition',oreGrade:'ore_head_grade',concentration:'element_or_compound_concentration',assay:'laboratory_assay',metalContent:'contained_metal_fraction',purity:'refined_or_product_composition',APIGravity:'petroleum_liquid_density_index'},resourceId:r};
}
function resourceFromSite(site,profile){
 const explicit=rid(site?.resourceId||site?.resourceTypeId||site?.resId||site?.resource||'');
 if(explicit)return explicit;
 const s=clean(site?.siteName||site?.name||site?.mineName||site?.depositName||site);
 for(const [r,words] of Object.entries(alias))if(words.some(w=>s.includes(clean(w))))return r;
 const candidates=[];
 const add=v=>{for(const z of Array.isArray(v)?v:[v]){const r=rid(z);if(r&&!candidates.includes(r)&&ranges[r])candidates.push(r)}};
 const p=profile||{};add(p?.resource_domain?.knownResourceTypes);add(p?.resource_endowment?.known);
 const m=p?.mineral_resource_base||{};for(const k of ['metallic','nonMetallic','industrialMinerals','preciousMetals','rareEarths','criticalMinerals'])add(m[k]);
 if(Array.isArray(p?.hydrocarbon_resource_base?.oil))add('crude_oil');
 if(Array.isArray(p?.hydrocarbon_resource_base?.naturalGas))add('natural_gas');
 if(Array.isArray(p?.hydrocarbon_resource_base?.coal))add('coal');
 return candidates.length?candidates[hash(site?.siteName||site)%candidates.length]:null;
}
function siteModel(site,profile,countryId){
 const name=String(site?.siteName||site?.name||site?.mineName||site?.depositName||site||'').trim();
 if(!name)return{status:'UNOBSERVED',siteName:'',resourceId:null,authority:'SIMULATED',stateAuthority:'SIMULATED',dataStatus:'UNOBSERVED'};
 const explicitStreams=Array.isArray(site?.commodities)?site.commodities:Array.isArray(site?.resources)?site.resources:Array.isArray(site?.resourceStreams)?site.resourceStreams:[];
 const requested=explicitStreams.length?explicitStreams.map(x=>rid(typeof x==='string'?x:x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource)).filter(Boolean):[resourceFromSite(site,profile)];
 const unique=[...new Set(requested.filter(Boolean))];
 const productionInput=site?.productionModel&&typeof site.productionModel==='object'?site.productionModel:site||{};
 const streams=unique.map((resourceId,index)=>{
   const matchedStream=explicitStreams.find(x=>rid(typeof x==='string'?x:x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource)===resourceId);const src=matchedStream&&typeof matchedStream==='object'?matchedStream:site||{};
   const r=ranges[resourceId]||{unit:'TONNES',min:250,max:5000,lifeMin:8,lifeMax:30,gradeMin:1,gradeMax:50};
   const seed=hash(String(countryId||'')+'|'+name+'|'+resourceId),u=seed/4294967296;
   const nominalObs=num(src?.nominalCapacity??src?.nominalRate??productionInput?.nominalCapacity??productionInput?.nominalRate);
   const observedRate=num(src?.productionRate??src?.dailyRate??src?.outputRate??productionInput?.productionRate??productionInput?.dailyRate??productionInput?.outputRate);
   const annualValue=num(src?.annualProduction?.value??productionInput?.annualProduction?.value);
   const annualRate=annualValue!==null?annualValue/365:null;
   const minObs=num(src?.minimumCapacity??src?.minimumRate??productionInput?.minimumCapacity??productionInput?.minimumRate);
   const maxObs=num(src?.maximumCapacity??src?.maximumRate??productionInput?.maximumCapacity??productionInput?.maximumRate);
   const utilRaw=src?.utilization??src?.utilisation??productionInput?.utilization??productionInput?.utilisation;
   const recoveryRaw=src?.recovery??productionInput?.recovery;
   const declineRaw=src?.decline??src?.declineRate??productionInput?.decline??productionInput?.declineRate;
   const maintenanceRaw=src?.maintenance??src?.maintenanceRate??productionInput?.maintenance??productionInput?.maintenanceRate;
   const costObs=num(src?.operatingCost??src?.operatingCostPerUnit??productionInput?.operatingCost??productionInput?.operatingCostPerUnit);
   const utilization=utilRaw===undefined?(.65+.25*((seed>>>8)%100)/100):Number(utilRaw)>1?Number(utilRaw)/100:Number(utilRaw);
   const recovery=recoveryRaw===undefined?(.65+.3*((seed>>>16)%100)/100):Number(recoveryRaw)>1?Number(recoveryRaw)/100:Number(recoveryRaw);
   const decline=declineRaw===undefined?(.005+.02*((seed>>>4)%100)/100):Number(declineRaw)>1?Number(declineRaw)/100:Number(declineRaw);
   const maintenance=maintenanceRaw===undefined?(.03+.12*((seed>>>24)%100)/100):Number(maintenanceRaw)>1?Number(maintenanceRaw)/100:Number(maintenanceRaw);
   const modeledNominal=r.min+(r.max-r.min)*(.25+.7*u);
   const effectiveObservedRate=observedRate??annualRate;
   const nominal=nominalObs??effectiveObservedRate??modeledNominal;
   const minimum=minObs??(effectiveObservedRate!==null?effectiveObservedRate*.55:nominal*.55);
   const maximum=maxObs??(effectiveObservedRate!==null?effectiveObservedRate*1.25:nominal*1.3);
   const activeRate=effectiveObservedRate!==null?effectiveObservedRate:Math.max(0,nominal*utilization*(1-maintenance)*(1-decline));
   const life=r.lifeMin+(r.lifeMax-r.lifeMin)*u;
   const observedReserve=num(src?.reserveQuantity??src?.geologicalQuantity??src?.reservesQuantity);
   const reserveQuantity=observedReserve!==null?observedReserve:nominal*365*life*recovery;
   const reserveAuthority=observedReserve!==null?'OBSERVED':'SIMULATED';
   const rawGrade=src?.grade??src?.oreGrade??site?.grade??null;
   const gradeNumeric=rawGrade===null?null:(Number(String(rawGrade).match(/[-+]?\d+(?:\.\d+)?/)?.[0]));
   const grade=Number.isFinite(gradeNumeric)?gradeNumeric:(resourceId==='crude_oil'||resourceId==='natural_gas'?null:r.gradeMin+(r.gradeMax-r.gradeMin)*((seed>>>12)%10000)/10000);
   const gradeAuthority=rawGrade!==null?'OBSERVED':'SIMULATED';
   const purity=src?.purity??site?.purity??null,apiRaw=src?.APIGravity??src?.apiGravity??site?.APIGravity??null;
   const api=apiRaw===null?(resourceId==='crude_oil'?20+25*u:null):Number(apiRaw);
   const productionObserved=nominalObs!==null||observedRate!==null||annualRate!==null||minObs!==null||maxObs!==null;
   const streamAuthority=productionObserved||reserveAuthority==='OBSERVED'||rawGrade!==null||costObs!==null?'OBSERVED':'SIMULATED';
   return{
     resourceId,
     reserve:{quantity:reserveQuantity,unit:r.unit,authority:reserveAuthority,status:reserveAuthority,basis:reserveAuthority==='OBSERVED'?'RESOURCE_JSON_SITE_FIELD':'production_capacity_x_modeled_asset_life',fieldAuthority:reserveAuthority},
     quality:{grade:rawGrade??grade,oreGrade:src?.oreGrade??rawGrade??grade,concentration:src?.concentration??null,assay:src?.assay??null,metalContent:src?.metalContent??null,purity,
       APIGravity:api,gradeStatus:gradeAuthority,concentrationStatus:src?.concentration!=null?'OBSERVED':'UNOBSERVED',assayStatus:src?.assay!=null?'OBSERVED':'UNOBSERVED',metalContentStatus:src?.metalContent!=null?'OBSERVED':'UNOBSERVED',
       purityStatus:purity!==null?'OBSERVED':'UNOBSERVED',apiGravityStatus:apiRaw!==null?'OBSERVED':'SIMULATED',
       normalized:{gradePercent:grade,concentrationPercent:null,purityFraction:purity===null?null:(Number(purity)>1?Number(purity)/100:Number(purity)),APIGravity:api},
       resourceId},
     production:{nominalCapacity:nominal,minimumCapacity:minimum,maximumCapacity:maximum,utilization,recovery,decline,maintenance,operatingCost:costObs??null,activeRate,observedRate,
       authority:productionObserved?'OBSERVED':'SIMULATED',dataStatus:productionObserved?'AVAILABLE':'SIMULATED',
       annualProduction:src?.annualProduction??productionInput?.annualProduction??null,
       rangeDataStatus:minObs!==null&&maxObs!==null?'OBSERVED':productionObserved?'DERIVED_FROM_OBSERVED_RATE':'SIMULATED',
       operatingCostStatus:costObs!==null?'OBSERVED':'UNOBSERVED'}
   };
 });
 if(!streams.length)return{status:'UNOBSERVED',siteName:name,resourceId:null,authority:'SIMULATED',stateAuthority:'SIMULATED',dataStatus:'UNOBSERVED'};
 const allObserved=streams.every(s=>s.reserve.authority==='OBSERVED'&&s.production.authority==='OBSERVED');
 return{status:'READY',siteReferenceKey:site?.siteReferenceKey||null,siteName:name,countryId:String(countryId||'').toUpperCase(),commodityStreams:streams,
   location:{nodeKey:site?.locationNodeKey||null,status:site?.locationNodeKey?'OBSERVED':'UNOBSERVED'},
   authority:allObserved?'OBSERVED':'SIMULATED',stateAuthority:allObserved?'OBSERVED':'SIMULATED',
   dataStatus:allObserved?'OBSERVED':'SIMULATED',
   provenance:{sourceAuthority:'RESOURCE_JSON.countryProfiles.mineSites',simulationRuleVersion:VERSION,sourcePath:site?.sourcePath||null,
     fieldAuthority:{reserve:streams.map(s=>s.reserve.authority),production:streams.map(s=>s.production.authority),quality:streams.map(s=>s.quality.gradeStatus)}}};
}
function authorityRank(v){return String(v||'UNOBSERVED').toUpperCase()==='OBSERVED'?2:String(v||'').toUpperCase()==='SIMULATED'?1:0}
function firewall(existing,incoming){
 if(incoming===undefined)return existing;
 if(existing===undefined)return incoming;
 if(typeof existing!=='object'||typeof incoming!=='object'||Array.isArray(existing)||Array.isArray(incoming)){
   return authorityRank(existing?.stateAuthority||existing?.authority)>authorityRank(incoming?.stateAuthority||incoming?.authority)?existing:incoming;
 }
 const out=JSON.parse(JSON.stringify(existing));
 const objectExisting=authorityRank(existing.stateAuthority||existing.authority),objectIncoming=authorityRank(incoming.stateAuthority||incoming.authority);
 for(const [k,v] of Object.entries(incoming)){
   if(k==='__proto__'||k==='constructor')continue;
   const exists=Object.prototype.hasOwnProperty.call(existing,k);
   if(!exists){out[k]=JSON.parse(JSON.stringify(v));continue;}
   if(k==='stateAuthority'||k==='authority'){
     out[k]=authorityRank(existing[k])>=authorityRank(v)?existing[k]:v;continue;
   }
   const fa=authorityRank(existing[k+'StateAuthority']||existing[k+'Authority']||existing.stateAuthority||existing.authority);
   const ia=authorityRank(incoming[k+'StateAuthority']||incoming[k+'Authority']||incoming.stateAuthority||incoming.authority);
   if(ia>fa)out[k]=JSON.parse(JSON.stringify(v));
   else if(ia===fa&&ia<2&&v&&typeof v==='object'&&existing[k]&&typeof existing[k]==='object')out[k]=firewall(existing[k],v);
 }
 if(objectExisting>=objectIncoming)out.stateAuthority=existing.stateAuthority||existing.authority||out.stateAuthority;
 else out.stateAuthority=incoming.stateAuthority||incoming.authority||out.stateAuthority;
 out.authority=out.stateAuthority||out.authority;
 return out;
}
function planRoute(input={}){
 const mode=String(input.mode||'truck').toLowerCase(),m=modes[mode]||modes.truck,qty=Math.max(0,num(input.quantity)||0),distance=Math.max(0,num(input.distanceKm)||m.defaultDistanceKm);
 const tonnageFactor=String(input.unit||'').toUpperCase()==='BBL'?1/7.33:String(input.unit||'').toUpperCase()==='BCM'?136000:1;
 const tonnageEquivalent=qty*tonnageFactor,capacity=m.capacity*tonnageFactor,legs=Math.max(1,Math.ceil(qty/Math.max(capacity,1))),hours=distance/Math.max(m.speedKmh,1),timeDays=hours/24,cost=tonnageEquivalent*distance*m.costPerTonneKm;
 return {status:'PLANNED',transportMode:mode,routeId:'ROUTE:'+String(input.sourceNode||'SRC')+'>'+String(input.destinationNode||'DST')+':'+mode,
  sourceNode:input.sourceNode||null,destinationNode:input.destinationNode||null,distanceKm:distance,capacity,requestedQuantity:qty,dispatchQuantity:Math.min(qty,capacity),
  legs,travelTimeDays:timeDays,costEstimate:cost,costUnit:'SIMULATED_CURRENCY',capacityAuthority:'SIMULATED',costAuthority:'SIMULATED',timeAuthority:'SIMULATED',
  routeAuthority:'SIMULATED',deliveryStatus:qty<=capacity?'READY':'MULTI_LEG_REQUIRED'};
}
function planFactoryRoutes(input={}){
 const ids=Array.isArray(input.factoryIds)?input.factoryIds.filter(Boolean):[];
 return ids.map((factoryId,index)=>dispatchFromWarehouse({...input,destinationNode:String(factoryId),quantity:index===0?input.quantity:0})).filter(x=>x.requestedQuantity>0||ids.length===1);
}
function dispatchFromWarehouse(input={}){
 const route=planRoute(input);return {...route,delivery:{shipmentId:'SHIP:'+hash(JSON.stringify(input)+'|'+route.routeId),warehouseId:input.warehouseId||null,batchId:input.batchId||null,stage:'WAREHOUSE_DISPATCH',status:'READY_FOR_DELIVERY',quantity:route.dispatchQuantity}};
}
const API={VERSION,unitFamily,resourceFamily,parseReserve,commodityText,splitCommodities,quality,siteModel,firewall,authorityRank,planRoute,dispatchFromWarehouse,planFactoryRoutes,transportModes:modes};
g.Omega=g.Omega||{};g.Omega.ResourceRealism=API;g.OmegaResourceRealism=API;
})(typeof window!=='undefined'?window:globalThis);
