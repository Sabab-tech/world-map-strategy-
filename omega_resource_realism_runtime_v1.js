/* OMEGA RESOURCE REALISM RUNTIME v1.0.0
 * Normalizes unquantified mine-site references, production state, quality semantics,
 * unit-family parsing, multi-commodity streams, logistics, and state authority.
 * SIMULATED values are explicitly synthetic and never replace OBSERVED values.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const FAMILY={
 TONNES:['T','TON','TONS','TONNE','TONNES','MT','MILLION TONNES','METRIC TON','METRIC TONS'],
 TROY_OUNCES:['OZ','OZ.','OZT','TROY OZ','TROY OUNCE','TROY OUNCES'],
 BBL:['BBL','BBLS','BARREL','BARRELS'],
 TCF:['TCF'],BCF:['BCF'],BCM:['BCM'],MCM:['MCM'],MCF:['MCF'],
 PERCENT:['%','PERCENT'],GT:['G/T','G PER T','GRAMS/T','GRAMS PER TONNE'],MG_L:['MG/L'],API:['API','API GRAVITY']
};
const alias={
 crude_oil:['crude_oil','crude oil','petroleum','oil','crude'],natural_gas:['natural_gas','natural gas','gas','lng','associated gas'],
 copper:['copper','cu'],gold:['gold','au'],iron_ore:['iron_ore','iron ore','iron','fe'],bauxite:['bauxite','alumina','aluminum','aluminium'],
 nickel:['nickel','ni'],cobalt:['cobalt','co'],lithium:['lithium'],rare_earth:['rare_earth','rare earth','ree','neodymium','dysprosium'],
 uranium:['uranium','u3o8'],coal:['coal'],phosphate:['phosphate','phosphate rock','p2o5'],potash:['potash','potassium','k2o'],
 limestone:['limestone'],gypsum:['gypsum'],marble:['marble'],chromium:['chromium','chromite'],silica_sand:['silica sand','silica_sand','sand'],
 clay:['clay','kaolin','bentonite'],zeolite:['zeolite'],zircon:['zircon','zirconium']
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
 potash:{unit:'TONNES',min:5000,max:60000,lifeMin:10,lifeMax:40,gradeMin:10,gradeMax:35}
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
function parseReserve(raw,resourceId){
 const r=rid(resourceId),text=typeof raw==='string'?raw:raw?.reserves??raw?.reserve??raw?.geologicalQuantity??'';
 if(r==='crude_oil'){const x=extractMeasure(text,'BBL');return x?{status:'OBSERVED',...x,resourceId:r}:missing(text);}
 if(r==='natural_gas'){
   for(const f of ['TCF','BCF','BCM','MCM','MCF']){const x=extractMeasure(text,f);if(x)return{status:'OBSERVED',...x,resourceId:r};}
   return missing(text);
 }
 if(r==='gold'){for(const f of ['TROY_OUNCES','TONNES']){const x=extractMeasure(text,f);if(x)return{status:'OBSERVED',...x,resourceId:r};}return missing(text);}
 const x=extractMeasure(text,'TONNES');return x?{status:'OBSERVED',...x,resourceId:r}:missing(text);
}
function missing(raw){return{status:'UNOBSERVED',value:null,unitFamily:null,sourceUnit:null,raw:String(raw??'')}}
function commodityText(raw,resourceId){
 if(raw===null||raw===undefined)return null;
 if(typeof raw==='object'&&!Array.isArray(raw)){
   const r=rid(resourceId);
   for(const k of ['commodities','resources','resourceStreams','commodityDeposits'])if(Array.isArray(raw[k])){
     const hit=raw[k].find(x=>rid(typeof x==='string'?x:x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource)===r);
     if(hit!==undefined)return typeof hit==='string'?hit:hit?.reserves??hit?.reserve??hit?.quantity??null;
   }
   const map=raw.reserves||raw.reserve;
   if(map&&typeof map==='object'&&!Array.isArray(map)){
     for(const [k,v] of Object.entries(map))if(rid(k)===r)return typeof v==='string'?v:v?.value??v?.quantity??null;
   }
   return raw.reserves??raw.reserve??null;
 }
 const text=String(raw);
 const tokens=(alias[rid(resourceId)]||[rid(resourceId)]).map(x=>String(x).replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'));
 const marker=tokens.join('|');
 const unitPattern=r=== 'crude_oil'?'(?:trillion|billion|million|thousand)?\\s*(?:BBL|BBLS|BARREL|BARRELS)':r==='natural_gas'?'(?:trillion|billion|million|thousand)?\\s*(?:TCF|BCF|BCM|MCM|MCF)':r==='gold'?'(?:trillion|billion|million|thousand)?\\s*(?:OZ|OZT|TROY\\s+OUNCES?|TONS?|TONNES?)':'(?:trillion|billion|million|thousand)?\\s*(?:T|TONS?|TONNES?|METRIC\\s+TONS?)';
 const m=text.match(new RegExp('([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*'+unitPattern+'(?:\\s*(?:OF|OF\\s+RESOURCE)?\\s*(?:'+marker+'))?','i'));
 return m?m[0]:text;
}
function splitCommodities(raw){
 const out=[];const arr=raw&&typeof raw==='object'&&Array.isArray(raw.commodities)?raw.commodities:[];
 for(const x of arr){const r=rid(typeof x==='string'?x:x?.resourceId||x?.resourceTypeId||x?.resId||x?.resource);if(r)out.push({...((x&&typeof x==='object')?x:{}),resourceId:r});}
 return out;
}
function quality(raw,resourceId){
 const r=rid(resourceId),o=typeof raw==='object'&&raw?raw:{},pick=(...ks)=>{for(const k of ks)if(o[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k];return null};
 const grade=pick('grade'),oreGrade=pick('oreGrade'),conc=pick('concentration'),assay=pick('assay'),metal=pick('metalContent'),purity=pick('purity'),api=pick('APIGravity','apiGravity','api');
 return {grade,oreGrade,concentration:conc,assay,metalContent:metal,purity,APIGravity:api,
   gradeStatus:(grade??oreGrade??conc??assay??metal)!==null?'OBSERVED':'UNOBSERVED',
   purityStatus:purity!==null?'OBSERVED':'UNOBSERVED',apiGravityStatus:api!==null?'OBSERVED':'UNOBSERVED',
   semantics:{grade:'ore_or_feed_composition',oreGrade:'ore_head_grade',concentration:'element_or_compound_concentration',assay:'laboratory_assay',metalContent:'contained_metal_fraction',purity:'refined_or_product_composition',APIGravity:'petroleum_liquid_density_index'},
   resourceId:r};
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
 const name=String(site?.siteName||site?.name||site?.mineName||site?.depositName||site||'').trim(),resourceId=resourceFromSite(site,profile);
 if(!name||!resourceId)return{status:'UNOBSERVED',siteName:name,resourceId:null,authority:'SIMULATED',dataStatus:'UNOBSERVED'};
 const r=ranges[resourceId]||ranges.coal,seed=hash(String(countryId||'')+'|'+name+'|'+resourceId),u=seed/4294967296;
 const nominal=r.min+(r.max-r.min)*(.25+.7*u),minimum=nominal*.55,maximum=nominal*1.3,utilization=.65+.25*((seed>>>8)%100)/100,recovery=.65+.3*((seed>>>16)%100)/100,maintenance=.03+.12*((seed>>>24)%100)/100,decline=.005+.02*((seed>>>4)%100)/100;
 const life=r.lifeMin+(r.lifeMax-r.lifeMin)*u,reserve=nominal*365*life*recovery;
 const grade=r.gradeMin+(r.gradeMax-r.gradeMin)*((seed>>>12)%10000)/10000;
 const gradeField=resourceId==='crude_oil'||resourceId==='natural_gas'?null:grade;
 const api=resourceId==='crude_oil'?20+25*u:null;
 return {status:'READY',siteReferenceKey:site?.siteReferenceKey||null,siteName:name,countryId:String(countryId||'').toUpperCase(),commodityStreams:[{
   resourceId,reserve:{quantity:reserve,unit:r.unit,authority:'SIMULATED',status:'SIMULATED',basis:'production_capacity_x_modeled_asset_life'},
   quality:{grade:gradeField,oreGrade:gradeField,concentration:null,assay:null,metalContent:null,purity:null,APIGravity:api,
     gradeStatus:gradeField===null?'UNOBSERVED':'SIMULATED',purityStatus:'UNOBSERVED',apiGravityStatus:api===null?'UNOBSERVED':'SIMULATED'},
   production:{nominalCapacity:nominal,minimumCapacity:minimum,maximumCapacity:maximum,utilization,recovery,decline,maintenance,
     operatingCost:null,activeRate:nominal*utilization*(1-maintenance)*(1-decline),authority:'SIMULATED',dataStatus:'SIMULATED'}
 }],location:{nodeKey:site?.locationNodeKey||null,status:'UNOBSERVED'},authority:'SIMULATED',stateAuthority:'SIMULATED',
 dataStatus:'SIMULATED',provenance:{sourceAuthority:'RESOURCE_JSON.countryProfiles.mineSites',simulationRuleVersion:VERSION,sourcePath:site?.sourcePath||null}};
}
function authorityRank(v){return String(v||'UNOBSERVED').toUpperCase()==='OBSERVED'?2:String(v||'').toUpperCase()==='SIMULATED'?1:0}
function firewall(existing,incoming){
 if(incoming===undefined)return existing;
 if(existing===undefined)return incoming;
 const er=authorityRank(existing.stateAuthority||existing.authority),ir=authorityRank(incoming.stateAuthority||incoming.authority);
 return er>ir?existing:ir>er?incoming:Object.assign({},existing,incoming);
}
function planRoute(input={}){
 const mode=String(input.mode||'truck').toLowerCase(),m=modes[mode]||modes.truck,qty=Math.max(0,num(input.quantity)||0),distance=Math.max(0,num(input.distanceKm)||m.defaultDistanceKm);
 const tonnageFactor=String(input.unit||'').toUpperCase()==='BBL'?1/7.33:String(input.unit||'').toUpperCase()==='BCM'?136000:1;
 const capacity=m.capacity*tonnageFactor,legs=Math.max(1,Math.ceil(qty/Math.max(capacity,1))),hours=distance/Math.max(m.speedKmh,1),timeDays=hours/24,cost=qty*distance*m.costPerTonneKm;
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
