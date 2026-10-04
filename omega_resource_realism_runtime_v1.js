/* OMEGA RESOURCE REALISM RUNTIME v1.0.0
 * Normalizes unquantified mine-site references, production state, quality semantics,
 * unit-family parsing, multi-commodity streams, logistics, and state authority.
 * SIMULATED values are explicitly synthetic and never replace OBSERVED values.
 */
(function(g){
'use strict';
const VERSION='2.0.1';
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
const GAME_CAPACITY_MULTIPLIER={crude_oil:8,natural_gas:6,gold:10,copper:10,iron_ore:8,bauxite:8,nickel:10,cobalt:10,lithium:10,rare_earth:8,uranium:8,coal:8,phosphate:8,potash:8,graphite:10,rutile:8,manganese:8,diamond:8,tin:10,tungsten:10,chromite:8,silver:8,zinc:8,platinum:8,basalt:6,construction_aggregate:6,coral_aggregate:6,salt:8,dolomite:8,magnesite:8,oil_shale:8,marble:6,boron:8,aragonite:6,granite:6,ilmenite:8,diatomite:8};
const GAME_HORIZON_YEARS={crude_oil:[420,720],natural_gas:[420,720],gold:[350,650],copper:[360,680],iron_ore:[350,650],bauxite:[340,620],nickel:[340,620],cobalt:[330,600],lithium:[330,620],rare_earth:[340,640],uranium:[360,700],coal:[360,700],phosphate:[350,650],potash:[350,650],graphite:[330,620],rutile:[340,620],manganese:[350,650],diamond:[330,600],tin:[330,620],tungsten:[330,620],chromite:[340,630],silver:[330,620],zinc:[330,620],platinum:[340,640],basalt:[240,480],construction_aggregate:[240,480],coral_aggregate:[220,440],salt:[300,560],dolomite:[280,520],magnesite:[300,560],oil_shale:[320,600],marble:[260,500],boron:[320,600],aragonite:[220,440],granite:[240,480],ilmenite:[340,620],diatomite:[300,560]};
const GAME_QUALITY={crude_oil:{grade:[25,45],gradeUnit:'API',purity:[.84,.98],recovery:[.82,.95],gradeSemantics:'API_GRAVITY'},natural_gas:{grade:[88,99.5],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.85,.98],gradeSemantics:'METHANE_OR_GAS_CONTENT_PERCENT'},gold:{grade:[.5,8],gradeUnit:'GT',purity:[.90,.9999],recovery:[.80,.96],gradeSemantics:'ORE_HEAD_GRADE_G_PER_TONNE'},copper:{grade:[.3,4.5],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.80,.96],gradeSemantics:'COPPER_CONTENT_PERCENT'},iron_ore:{grade:[30,68],gradeUnit:'PERCENT',purity:[.85,.98],recovery:[.75,.95],gradeSemantics:'FE_CONTENT_PERCENT'},bauxite:{grade:[30,60],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.78,.95],gradeSemantics:'AL2O3_CONTENT_PERCENT'},nickel:{grade:[.8,4],gradeUnit:'PERCENT',purity:[.85,.97],recovery:[.75,.93],gradeSemantics:'NI_CONTENT_PERCENT'},cobalt:{grade:[.05,1.5],gradeUnit:'PERCENT',purity:[.84,.97],recovery:[.70,.92],gradeSemantics:'CO_CONTENT_PERCENT'},lithium:{grade:[.5,6],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.72,.92],gradeSemantics:'LI_OR_LI2O_CONTENT_PERCENT'},rare_earth:{grade:[1,12],gradeUnit:'PERCENT',purity:[.80,.96],recovery:[.68,.90],gradeSemantics:'REO_CONTENT_PERCENT'},uranium:{grade:[.03,.5],gradeUnit:'PERCENT',purity:[.75,.96],recovery:[.65,.90],gradeSemantics:'U3O8_OR_U_CONTENT_PERCENT'},coal:{grade:[45,85],gradeUnit:'PERCENT',purity:[.75,.95],recovery:[.65,.90],gradeSemantics:'COMBUSTIBLE_OR_CARBON_QUALITY_PERCENT'},phosphate:{grade:[15,35],gradeUnit:'PERCENT',purity:[.78,.95],recovery:[.72,.92],gradeSemantics:'P2O5_CONTENT_PERCENT'},potash:{grade:[10,35],gradeUnit:'PERCENT',purity:[.80,.96],recovery:[.75,.93],gradeSemantics:'K2O_CONTENT_PERCENT'},graphite:{grade:[70,98],gradeUnit:'PERCENT',purity:[.82,.995],recovery:[.72,.94],gradeSemantics:'GRAPHITIC_CARBON_PERCENT'},rutile:{grade:[.3,2],gradeUnit:'PERCENT',purity:[.85,.98],recovery:[.70,.92],gradeSemantics:'TIO2_MINERAL_CONTENT_PERCENT'},manganese:{grade:[20,55],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.72,.93],gradeSemantics:'MN_CONTENT_PERCENT'},diamond:{grade:[.05,2],gradeUnit:'CARATS_PER_TONNE',purity:[.80,.98],recovery:[.65,.90],gradeSemantics:'CARAT_GRADE'},tin:{grade:[.1,5],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.70,.92],gradeSemantics:'SN_CONTENT_PERCENT'},tungsten:{grade:[.1,2],gradeUnit:'PERCENT',purity:[.80,.96],recovery:[.68,.90],gradeSemantics:'WO3_CONTENT_PERCENT'},chromite:{grade:[20,55],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.72,.93],gradeSemantics:'CR2O3_CONTENT_PERCENT'},silver:{grade:[20,500],gradeUnit:'GT',purity:[.90,.999],recovery:[.75,.95],gradeSemantics:'ORE_GRADE_G_PER_TONNE'},zinc:{grade:[2,20],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.72,.93],gradeSemantics:'ZN_CONTENT_PERCENT'},platinum:{grade:[1,10],gradeUnit:'GT',purity:[.88,.999],recovery:[.72,.93],gradeSemantics:'PGM_G_PER_TONNE'},basalt:{grade:[90,99],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.80,.96],gradeSemantics:'MATERIAL_QUALITY_PERCENT'},construction_aggregate:{grade:[90,99],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.80,.96],gradeSemantics:'MATERIAL_QUALITY_PERCENT'},coral_aggregate:{grade:[88,98],gradeUnit:'PERCENT',purity:[.88,.98],recovery:[.78,.94],gradeSemantics:'MATERIAL_QUALITY_PERCENT'},salt:{grade:[80,99.5],gradeUnit:'PERCENT',purity:[.85,.999],recovery:[.78,.95],gradeSemantics:'NACL_CONTENT_PERCENT'},dolomite:{grade:[70,98],gradeUnit:'PERCENT',purity:[.84,.98],recovery:[.76,.94],gradeSemantics:'CARBONATE_CONTENT_PERCENT'},magnesite:{grade:[70,95],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.74,.93],gradeSemantics:'MGCO3_CONTENT_PERCENT'},oil_shale:{grade:[1,20],gradeUnit:'PERCENT',purity:[.75,.93],recovery:[.62,.88],gradeSemantics:'ORGANIC_CONTENT_PERCENT'},marble:{grade:[90,99.5],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.82,.97],gradeSemantics:'CACO3_OR_STONE_QUALITY_PERCENT'},boron:{grade:[10,50],gradeUnit:'PERCENT',purity:[.80,.96],recovery:[.72,.92],gradeSemantics:'B2O3_CONTENT_PERCENT'},aragonite:{grade:[90,99],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.80,.95],gradeSemantics:'CACO3_CONTENT_PERCENT'},granite:{grade:[90,99],gradeUnit:'PERCENT',purity:[.90,.995],recovery:[.80,.96],gradeSemantics:'STONE_QUALITY_PERCENT'},ilmenite:{grade:[20,65],gradeUnit:'PERCENT',purity:[.82,.97],recovery:[.72,.93],gradeSemantics:'TIO2_CONTENT_PERCENT'},diatomite:{grade:[50,95],gradeUnit:'PERCENT',purity:[.80,.98],recovery:[.70,.92],gradeSemantics:'SILICA_DIATOM_CONTENT_PERCENT'}};
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function valueRange(pair,u){const a=Number(pair?.[0]),b=Number(pair?.[1]);return Number.isFinite(a)&&Number.isFinite(b)?a+(b-a)*clamp(u,0,1):null;}
function countrySimulationScale(profile,resourceId,siteName){
  const p=profile||{},identity=p?.identity||p,sites=Array.isArray(p?.resource_infrastructure_context?.mineSites)?p.resource_infrastructure_context.mineSites:[];
  const sameResource=sites.filter(s=>rid(s?.resourceId||s?.resourceTypeId||s?.resId||s?.resource||'')===rid(resourceId)).length;
  const known=[...(Array.isArray(p?.resource_domain?.knownResourceTypes)?p.resource_domain.knownResourceTypes:[]),...(Array.isArray(p?.resource_endowment?.known)?p.resource_endowment.known:[])].map(rid).filter(Boolean);
  const knownCount=new Set(known).size,area=Number(identity?.areaKm2??identity?.area_km2??identity?.area);
  const areaFactor=Number.isFinite(area)&&area>0?clamp(.90+.10*Math.log10(Math.max(area,1000)/1000),.90,1.22):1;
  const presenceFactor=clamp(.92+.11*Math.max(0,sameResource-1),.92,1.55);
  const diversityFactor=clamp(1+.018*Math.max(0,knownCount-3),1,1.16);
  const text=String(siteName||'').toLowerCase();
  const tier=/supergiant|giant|mega|world[- ]class/.test(text)?1.45:/complex|basin|block|district|operations|deposit/.test(text)?1.22:/quarry zone|aggregate sites|zone/.test(text)?0.82:1;
  return clamp(areaFactor*presenceFactor*diversityFactor*tier,.75,1.85);
}
function simulationQuality(resourceId,u){
  const r=rid(resourceId),q=GAME_QUALITY[r]||{grade:[1,100],gradeUnit:'PERCENT',purity:[.80,.98],recovery:[.70,.92],gradeSemantics:'GENERIC_RESOURCE_QUALITY'};
  const grade=valueRange(q.grade,u),purity=valueRange(q.purity,clamp(u*.83+.08,0,1)),recovery=valueRange(q.recovery,clamp(u*.71+.14,0,1));
  return{grade,oreGrade:grade,gradeUnit:q.gradeUnit,gradeSemantics:q.gradeSemantics,concentration:resourceId==='natural_gas'?grade:null,concentrationStatus:resourceId==='natural_gas'?'SIMULATED':'UNOBSERVED',assay:null,metalContent:null,purity,purityStatus:'SIMULATED',recovery,recoveryStatus:'SIMULATED',APIGravity:resourceId==='crude_oil'?grade:null,apiGravityStatus:resourceId==='crude_oil'?'SIMULATED':'UNOBSERVED',gradeStatus:'SIMULATED',assayStatus:'UNOBSERVED',metalContentStatus:'UNOBSERVED',normalized:{gradeValue:grade,gradeUnitFamily:q.gradeUnit,gradePercent:q.gradeUnit==='PERCENT'?grade:null,concentrationValue:resourceId==='natural_gas'?grade:null,concentrationUnitFamily:resourceId==='natural_gas'?'PERCENT':null,concentrationPercent:resourceId==='natural_gas'?grade:null,purityFraction:purity,APIGravity:resourceId==='crude_oil'?grade:null},semantics:{grade:q.gradeSemantics,oreGrade:q.gradeSemantics,concentration:'element_or_compound_concentration',assay:'laboratory_assay',metalContent:'contained_metal_fraction',purity:'refined_or_product_composition',APIGravity:'petroleum_liquid_density_index',recovery:'recoverable_share_of_geological_quantity'},resourceId:r,authority:'SIMULATED'};
}
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
 if((sourceFamily==='TCF'||sourceFamily==='TCF')&&(targetFamily==='BCM'||targetFamily==='GAS'))return v*28.316846592;
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
 const targetFamily=spec.family==='GOLD'?'TROY_OUNCES':(spec.family==='GAS'?'BCM':(unitFamily(spec.unit)||spec.family));
 const value=convertReserve(x.value,x.unitFamily,targetFamily);
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
   const r=ranges[resourceId]||{unit:'TONNES',min:250,max:5000,lifeMin:220,lifeMax:480,gradeMin:1,gradeMax:50};
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
   const utilization=utilRaw===undefined?(.66+.22*((seed>>>8)%100)/100):Number(utilRaw)>1?Number(utilRaw)/100:Number(utilRaw);
   const simQuality=simulationQuality(resourceId,u);
   const recovery=recoveryRaw===undefined?simQuality.recovery:(Number(recoveryRaw)>1?Number(recoveryRaw)/100:Number(recoveryRaw));
   const decline=declineRaw===undefined?(.004+.012*((seed>>>4)%100)/100):(Number(declineRaw)>1?Number(declineRaw)/100:Number(declineRaw));
   const maintenance=maintenanceRaw===undefined?(.025+.08*((seed>>>24)%100)/100):(Number(maintenanceRaw)>1?Number(maintenanceRaw)/100:Number(maintenanceRaw));
   const countryScale=countrySimulationScale(profile,resourceId,name);
   const capacityMultiplier=GAME_CAPACITY_MULTIPLIER[resourceId]??8;
   const modeledNominal=(r.min+(r.max-r.min)*(.25+.7*u))*capacityMultiplier*countryScale;
   const effectiveObservedRate=observedRate??annualRate;
   const nominal=nominalObs??effectiveObservedRate??modeledNominal;
   const minimum=minObs??(effectiveObservedRate!==null?effectiveObservedRate*.55:nominal*.55);
   const maximum=maxObs??(effectiveObservedRate!==null?effectiveObservedRate*1.25:nominal*1.3);
   const activeRate=effectiveObservedRate!==null?effectiveObservedRate:Math.max(0,nominal*utilization*(1-maintenance)*(1-decline));
   const horizon=GAME_HORIZON_YEARS[resourceId]||[280,520];
   const life=horizon[0]+(horizon[1]-horizon[0])*u;
   const observedReserve=num(src?.reserveQuantity??src?.geologicalQuantity??src?.reservesQuantity);
   const reserveAuthority=observedReserve!==null?'OBSERVED':'SIMULATED';
   const targetRecoverableQuantity=activeRate*365*life;
   const geologicalQuantity=observedReserve!==null?observedReserve:targetRecoverableQuantity/Math.max(recovery,.01);
   const recoverableQuantity=observedReserve!==null?Math.max(0,geologicalQuantity*recovery):targetRecoverableQuantity;
   const reserveQuantity=geologicalQuantity;
   const rawGrade=src?.grade??src?.oreGrade??site?.grade??null;
   const gradeNumeric=rawGrade===null?null:(Number(String(rawGrade).match(/[-+]?\d+(?:\.\d+)?/)?.[0]));
   const grade=Number.isFinite(gradeNumeric)?gradeNumeric:simQuality.grade;
   const gradeAuthority=rawGrade!==null?'OBSERVED':'SIMULATED';
   const purityRaw=src?.purity??site?.purity??null;
   const purity=purityRaw===null?simQuality.purity:purityRaw;
   const apiRaw=src?.APIGravity??src?.apiGravity??site?.APIGravity??null;
   const api=apiRaw===null?(resourceId==='crude_oil'?simQuality.APIGravity:null):Number(apiRaw);
   const productionObserved=nominalObs!==null||observedRate!==null||annualRate!==null||minObs!==null||maxObs!==null;
   const streamAuthority=productionObserved||reserveAuthority==='OBSERVED'||rawGrade!==null||costObs!==null?'OBSERVED':'SIMULATED';
   return{
     resourceId,
     reserve:{quantity:reserveQuantity,geologicalQuantity,recoverableQuantity,unit:r.unit,authority:reserveAuthority,status:reserveAuthority,basis:reserveAuthority==='OBSERVED'?'RESOURCE_JSON_SITE_FIELD':'SIMULATION_CAPACITY_X_MULTICENTURY_HORIZON',fieldAuthority:reserveAuthority,recoverableAuthority:observedReserve!==null?'DERIVED_FROM_OBSERVED_RESERVE':'SIMULATED',simulationHorizonYears:life},
     quality:{
       grade:rawGrade??grade,oreGrade:src?.oreGrade??rawGrade??grade,gradeUnit:GAME_QUALITY[resourceId]?.gradeUnit||simQuality.gradeUnit,gradeSemantics:GAME_QUALITY[resourceId]?.gradeSemantics||simQuality.gradeSemantics,
       concentration:src?.concentration??simQuality.concentration,assay:src?.assay??null,metalContent:src?.metalContent??null,purity,
       recovery,recoveryStatus:recoveryRaw!==undefined?'OBSERVED':'SIMULATED',APIGravity:api,
       gradeStatus:gradeAuthority,concentrationStatus:src?.concentration!=null?'OBSERVED':simQuality.concentrationStatus,assayStatus:src?.assay!=null?'OBSERVED':'UNOBSERVED',metalContentStatus:src?.metalContent!=null?'OBSERVED':'UNOBSERVED',
       purityStatus:purityRaw!==null?'OBSERVED':'SIMULATED',apiGravityStatus:apiRaw!==null?'OBSERVED':simQuality.apiGravityStatus,qualityAuthority:gradeAuthority==='OBSERVED'||purityRaw!==null?'OBSERVED':'SIMULATED',
       normalized:{gradeValue:grade,gradeUnitFamily:GAME_QUALITY[resourceId]?.gradeUnit||simQuality.gradeUnit,gradePercent:(GAME_QUALITY[resourceId]?.gradeUnit||simQuality.gradeUnit)==='PERCENT'?grade:null,concentrationPercent:resourceId==='natural_gas'?grade:null,purityFraction:purity===null?null:(Number(purity)>1?Number(purity)/100:Number(purity)),APIGravity:api},
       semantics:{grade:GAME_QUALITY[resourceId]?.gradeSemantics||simQuality.gradeSemantics,oreGrade:GAME_QUALITY[resourceId]?.gradeSemantics||simQuality.gradeSemantics,concentration:'element_or_compound_concentration',assay:'laboratory_assay',metalContent:'contained_metal_fraction',purity:'refined_or_product_composition',APIGravity:'petroleum_liquid_density_index',recovery:'recoverable_share_of_geological_quantity'},
       resourceId,authority:gradeAuthority==='OBSERVED'||purityRaw!==null?'OBSERVED':'SIMULATED'
     },
     production:{nominalCapacity:nominal,minimumCapacity:minimum,maximumCapacity:maximum,utilization,recovery,decline,maintenance,operatingCost:costObs??null,activeRate,observedRate,
       authority:productionObserved?'OBSERVED':'SIMULATED',dataStatus:productionObserved?'AVAILABLE':'SIMULATED',
       annualProduction:src?.annualProduction??productionInput?.annualProduction??null,
       rangeDataStatus:minObs!==null&&maxObs!==null?'OBSERVED':productionObserved?'DERIVED_FROM_OBSERVED_RATE':'SIMULATED',
       operatingCostStatus:costObs!==null?'OBSERVED':'UNOBSERVED',
       capacityScaleFactor:productionObserved?1:capacityMultiplier*countryScale,countryScaleFactor:countryScale,simulationHorizonYears:life,
       depletionHorizonYears:Math.max(1,recoverableQuantity/Math.max(activeRate*365,1))},
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
