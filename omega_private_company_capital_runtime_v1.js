/* OMEGA PRIVATE COMPANY OPENING CAPITAL RUNTIME v1.0.0
 * Selected-country, local-currency opening capital allocation for the five canonical companies.
 * Uses the existing country economy, private factory allocation and Finance-owned capital accounts.
 */
(function(g){
'use strict';
var VERSION='1.0.0';
var COMPANY_IDS=[
 'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
 'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
];
var CAPITAL_INTENSITY={
 UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT:1.4,
 STEEL_AND_ALLOY_WORKS:2.4,
 NON_FERROUS_METAL_SMELTER:2.5,
 PETROCHEMICAL_POLYMER_PLANT:2.8,
 FERTILIZER_CHEMICAL_PLANT:1.5,
 INDUSTRIAL_CHEMICALS_GAS_PLANT:1.9,
 CEMENT_CONCRETE_PLANT:1,
 GLASS_CERAMICS_PLANT:1.1,
 PAPER_PACKAGING_MILL:1,
 FOOD_PROCESSING_COLD_CHAIN:.9,
 TEXTILE_GARMENT_MILL:1,
 INDUSTRIAL_MACHINERY_MACHINE_TOOLS:2.5,
 GRID_EQUIPMENT_FACTORY:2.2,
 ELECTRONICS_SEMICONDUCTOR_FAB:3,
 BATTERY_ENERGY_STORAGE_PLANT:2.5,
 VEHICLE_TRUCK_BUS_ASSEMBLY:2,
 SHIP_RAIL_EQUIPMENT_YARD:2,
 AEROSPACE_EQUIPMENT_PLANT:3.5,
 PHARMA_MEDICAL_SUPPLIES_PLANT:2.4,
 DEFENSE_EQUIPMENT_FACTORY:1.8,
 RECYCLING_WASTE_PROCESSING_PLANT:.8
};
var TYPE_OWNER={
 UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT:'AURORA_INDUSTRIAL_GROUP',
 STEEL_AND_ALLOY_WORKS:'AURORA_INDUSTRIAL_GROUP',
 NON_FERROUS_METAL_SMELTER:'AURORA_INDUSTRIAL_GROUP',
 PETROCHEMICAL_POLYMER_PLANT:'AURORA_INDUSTRIAL_GROUP',
 FERTILIZER_CHEMICAL_PLANT:'AURORA_INDUSTRIAL_GROUP',
 INDUSTRIAL_CHEMICALS_GAS_PLANT:'AURORA_INDUSTRIAL_GROUP',
 CEMENT_CONCRETE_PLANT:'TERRA_INFRASTRUCTURE_GROUP',
 GLASS_CERAMICS_PLANT:'TERRA_INFRASTRUCTURE_GROUP',
 PAPER_PACKAGING_MILL:'NOVA_CONSUMER_INDUSTRIES',
 FOOD_PROCESSING_COLD_CHAIN:'NOVA_CONSUMER_INDUSTRIES',
 TEXTILE_GARMENT_MILL:'NOVA_CONSUMER_INDUSTRIES',
 INDUSTRIAL_MACHINERY_MACHINE_TOOLS:'MERIDIAN_ENGINEERING_GROUP',
 GRID_EQUIPMENT_FACTORY:'ATLAS_TECHNOLOGY_CORPORATION',
 ELECTRONICS_SEMICONDUCTOR_FAB:'ATLAS_TECHNOLOGY_CORPORATION',
 BATTERY_ENERGY_STORAGE_PLANT:'ATLAS_TECHNOLOGY_CORPORATION',
 VEHICLE_TRUCK_BUS_ASSEMBLY:'MERIDIAN_ENGINEERING_GROUP',
 SHIP_RAIL_EQUIPMENT_YARD:'MERIDIAN_ENGINEERING_GROUP',
 AEROSPACE_EQUIPMENT_PLANT:'MERIDIAN_ENGINEERING_GROUP',
 PHARMA_MEDICAL_SUPPLIES_PLANT:'ATLAS_TECHNOLOGY_CORPORATION',
 DEFENSE_EQUIPMENT_FACTORY:'MERIDIAN_ENGINEERING_GROUP',
 RECYCLING_WASTE_PROCESSING_PLANT:'TERRA_INFRASTRUCTURE_GROUP'
};
var CAP_PER_GDP=.0000025,REFERENCE_FACTORY_COST=15500;
var inflight=new Map(),completed=new Map(),lastError=null,lastPlan=null,sequence=0,activationRequested=false,activationScheduled=false;
function obj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function num(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return Number.isFinite(n)?n:null;}
function id(v){return String(v==null?'':v).trim().toUpperCase();}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function roundMoney(v){return Math.round((Number(v)||0)*100)/100;}
function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&k!=='constructor')o[k]=clone(v[k]);});return o;}
function playerCountry(){
 var s=worldState()||{},sim=g.Omega&&(g.Omega.SimulationRuntime||g.Omega.Simulation),values=[];
 try{if(sim&&typeof sim.getPlayerCountryId==='function')values.push(sim.getPlayerCountryId());}catch(_){}
 values.push(s.simulation&&s.simulation.session&&s.simulation.session.playerCountryId,
  s.simulation&&s.simulation.playerCountryId,s.playerCountryId,s.playerCountryCode);
 values.push(g.Game&&(g.Game.playerCountryId||g.Game.playerCountryCode||g.Game.playerCountry));
 for(var i=0;i<values.length;i++){
  var raw=values[i]&&typeof values[i]==='object'?(values[i].iso3||values[i].countryCode||values[i].countryId||values[i].code||values[i].id):values[i];
  var code=id(raw);if(/^[A-Z]{3}$/.test(code))return code;
  try{var hit=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega&&g.Omega.CanonicalIdentity)?.resolveCountry?.(raw);
   var rawHit=hit&&((hit.raw&&hit.raw.raw)||hit.raw||{}),iso3=id(rawHit.iso3||rawHit.iso3Code||rawHit.ISO_A3||hit&&hit.iso3||hit&&hit.iso3Code);
   if(/^[A-Z]{3}$/.test(iso3))return iso3;
  }catch(_){}
 }
 return '';
}
function worldState(){
 var sim=g.Omega&&(g.Omega.SimulationRuntime||g.Omega.Simulation);
 if(obj(sim&&sim.world&&sim.world.state))return sim.world.state;
 if(obj(g.Omega&&g.Omega.World&&g.Omega.World.state))return g.Omega.World.state;
 return g.Game&&obj(g.Game.state)?g.Game.state:(obj(g.gameState)?g.gameState:null);
}
function metric(record,key){
 var value=num(record&&record.metrics&&record.metrics[key]);
 if(value!==null)return value;
 return null;
}
function macroValue(gov,key,general){
 var fromGeneral=metric(general,key);if(fromGeneral!==null)return fromGeneral;
 var context=gov&&gov.economicSectorContext||{},shares=context.valueAddedShares||{},row=shares[key];
 return num(row&&row.value);
}
function estimatePrivateShare(gov,privateRow,general){
 var archetype=String((privateRow&&privateRow.industryArchetype)||(gov&&gov.industryArchetype)||'').toLowerCase();
 var credit=metric(general,'domesticCreditPrivateSectorPctGdp');
 var services=macroValue(gov,'servicesValueAddedPctGdp',general);
 var industry=macroValue(gov,'industryValueAddedPctGdp',general);
 var manufacturing=macroValue(gov,'manufacturingValueAddedPctGdp',general);
 var agricultureEmployment=macroValue(gov,'agricultureEmploymentPct',general);
 var privateUnits=Math.max(0,num(privateRow&&privateRow.totalPrivateFactoryUnits)||0);
 var governmentUnits=Math.max(0,num(privateRow&&privateRow.totalGovernmentFactoryUnits)||0);
 var ratio=privateUnits+governmentUnits>0?privateUnits/(privateUnits+governmentUnits)*100:null;
 var observedCount=[credit,services,industry,manufacturing,agricultureEmployment].filter(function(v){return v!==null;}).length;
 var share=69;
 if(observedCount===0){
  if(/extract|resource|petroleum|mineral/.test(archetype))share=62;
  else if(/agricultur|agro|food/.test(archetype))share=70;
  else if(/service|finance|touris|trade/.test(archetype))share=79;
  else if(/manufactur|industrial|engineering|technology|electronics/.test(archetype))share=77;
 }else{
  if(credit!==null){
   var depth=Math.log1p(Math.max(0,credit))/Math.log1p(180);
   share+=(clamp(depth,0,1)-.5)*14;
  }
  if(services!==null)share+=clamp((services-55)*.07,-3.5,3.5);
  if(manufacturing!==null)share+=clamp((manufacturing-15)*.11,-2.5,3.5);
  if(industry!==null)share+=clamp((industry-25)*.04,-1.5,1.5);
  if(agricultureEmployment!==null)share+=clamp((agricultureEmployment-20)*.04,-1,1.5);
 }
 if(ratio!==null)share+=clamp((ratio-20)*.05,-1,1.5);
 if(/extract|resource-led/.test(archetype))share-=3;
 if(/advanced manufacturing|technology|engineering/.test(archetype))share+=2;
 if(/services-led/.test(archetype))share+=2;
 if(/agriculture-led/.test(archetype))share+=1;
 return{
  contributionSharePct:Number(clamp(share,52,90).toFixed(2)),
  evidenceStatus:observedCount?'COUNTRY_MACRO_AND_PRIVATE_INDUSTRY_CONTEXT':'COUNTRY_INDUSTRY_ARCHETYPE_FALLBACK',
  evidenceCount:observedCount,privateCreditToGDP:credit,
  servicesValueAddedPctGdp:services,industryValueAddedPctGdp:industry,
  manufacturingValueAddedPctGdp:manufacturing,agricultureEmploymentPct:agricultureEmployment,
  privateFactoryToGovernmentFactoryPct:ratio,
  privateCreditObservationYear:num(general&&general.metricMetadata&&general.metricMetadata.domesticCreditPrivateSectorPctGdp&&general.metricMetadata.domesticCreditPrivateSectorPctGdp.year),
  archetype:archetype||null
 };
}
function estimateEconomy(country,gov,profile,financeIndicators,forex){
 var source=profile&&profile.sourceValues||{},ind=profile&&profile.indicators||{};
 var gdp=num(financeIndicators&&financeIndicators.gdpCurrentUsd);
 if(gdp===null)gdp=num(ind.gdpCurrentUsd);
 if(gdp===null)gdp=num(source.gdp);
 var population=num(profile&&profile.populationValues&&profile.populationValues.population_2015);
 if(population===null)population=num(ind.population2015);
 var archetype=String(gov&&gov.industryArchetype||'').toLowerCase();
 var gdpSource='OBSERVED_ECONOMIC_PROFILE';
 if(gdp===null&&num(ind.gdpPerCapitaUsd)!==null&&population!==null){
  gdp=num(ind.gdpPerCapitaUsd)*population;gdpSource='DERIVED_GDP_PER_CAPITA_TIMES_POPULATION';
 }
 if(gdp===null&&population!==null){
  var perCapita=/extract|resource/.test(archetype)?4200:
   /manufactur|industrial|engineering|technology/.test(archetype)?7200:
   /service|finance|touris/.test(archetype)?6200:2400;
  gdp=population*perCapita;gdpSource='POPULATION_AND_INDUSTRY_PROFILE_ESTIMATE';
 }
 if(gdp===null){
  var count=Math.max(1,num(gov&&gov.totalStartingFactoryUnits)||num(gov&&gov.totalGovernmentFactoryUnits)||1);
  gdp=Math.max(100000000,count*25000000);gdpSource='INDUSTRIAL_BASELINE_ECONOMY_ESTIMATE';
 }
 var iso3=id(profile&&profile.iso3)||id(country);
 var currency=id(source.currency_code||source.currencyCode||
  (Array.isArray(profile&&profile.generalFacts&&profile.generalFacts.currencyCodes)?profile.generalFacts.currencyCodes[0]:''));
 if(!currency&&forex&&profile&&typeof forex.getCurrencyCode==='function'){
  try{currency=id(forex.getCurrencyCode(profile));}catch(_){}
 }
 var currencySource=currency?'COUNTRY_CURRENCY_PROFILE':'COUNTRY_LOCAL_UNIT_FALLBACK';
 if(!currency)currency='LOC-'+iso3;
 var rate=num(forex&&typeof forex.getRate==='function'?forex.getRate(currency,'SIMULATION'):null);
 if(!(rate>0))rate=num(ind.exchangeRateLocalPerUsd);
 if(!(rate>0))rate=num(source.exchange_rate_usd);
 var rateStatus=rate>0?'RECORDED_OR_SIMULATED_FX_RATE':'LOCAL_UNIT_PARITY_FALLBACK';
 if(!(rate>0))rate=1;
 if(currency==='USD')rate=1;
 return{gdpUsd:gdp,gdpSource:gdpSource,population:population,
  currencyCode:currency,currencySource:currencySource,localPerUsd:rate,fxStatus:rateStatus,
  gdpLocal:gdp*rate};
}
function allocationScores(privateRow,governmentRow){
 var companies=Array.isArray(privateRow&&privateRow.companies)?privateRow.companies:[];
 var government=privateRow&&privateRow.governmentFactoryCounts||governmentRow&&governmentRow.factoryCounts||{};
 var byId={};
 companies.forEach(function(company){byId[id(company.companyId)]={company:company,score:0,privateUnits:0,weightedUnits:0};});
 COMPANY_IDS.forEach(function(company){if(!byId[company])byId[company]={company:null,score:0,privateUnits:0,weightedUnits:0};});
 var types=Object.keys(CAPITAL_INTENSITY);
 COMPANY_IDS.forEach(function(company){
  var row=byId[company],counts=row.company&&row.company.factoryCounts||{};
  types.forEach(function(type){
   var n=Math.max(0,num(counts[type])||0),weight=CAPITAL_INTENSITY[type]||1;
   row.privateUnits+=n;row.weightedUnits+=n*weight;
   row.score+=n*weight;
  });
  row.score+=.35;
 });
 if(COMPANY_IDS.every(function(company){return byId[company].privateUnits===0;})){
  COMPANY_IDS.forEach(function(company){
   var row=byId[company];
   types.forEach(function(type){
    var n=Math.max(0,num(government[type])||0),weight=CAPITAL_INTENSITY[type]||1;
    if(n>0)row.score+=n*weight*(TYPE_OWNER[type]===company?1.4:.14);
   });
  });
 }
 var sum=COMPANY_IDS.reduce(function(total,company){return total+byId[company].score;},0);
 return{byId:byId,totalWeight:sum};
}
function allocate(total,weights){
 var sum=weights.reduce(function(a,b){return a+b;},0);
 var rows=weights.map(function(w,index){var exact=total*w/sum;return{index,amount:Math.floor(exact),remainder:exact-Math.floor(exact)};});
 var assigned=rows.reduce(function(a,b){return a+b.amount;},0);
 rows.slice().sort(function(a,b){return b.remainder-a.remainder||a.index-b.index;})
  .forEach(function(row,index){if(index<total-assigned)rows[row.index].amount++;});
 rows.sort(function(a,b){return a.index-b.index;});
 return rows.map(function(row){return row.amount;});
}
function buildPlan(country,privateRow,governmentRow,profile,financeIndicators,general,forex){
 var economy=estimateEconomy(country,governmentRow,profile,financeIndicators,forex);
 var share=estimatePrivateShare(governmentRow,privateRow,general);
 var privateGDP=economy.gdpLocal*share.contributionSharePct/100;
 var privateUnits=Math.max(0,num(privateRow&&privateRow.totalPrivateFactoryUnits)||0);
 var governmentUnits=Math.max(0,num(privateRow&&privateRow.totalGovernmentFactoryUnits)||0);
 var factoryFloor=Math.max(1,privateUnits,Math.round(governmentUnits*.08))*REFERENCE_FACTORY_COST*2;
 var gdpCapital=privateGDP*CAP_PER_GDP;
 var total=Math.max(25000,factoryFloor,gdpCapital);
 total=Math.min(9000000000000000,Math.round(total));
 var scores=allocationScores(privateRow,governmentRow);
 var weights=COMPANY_IDS.map(function(company){return scores.byId[company].score;});
 var amounts=allocate(total,weights);
 var rows=COMPANY_IDS.map(function(company,index){
  var score=scores.byId[company],amount=amounts[index];
  return{companyId:company,amount:amount,sharePct:Number((amount/total*100).toFixed(2)),
   privateFactoryUnits:score.privateUnits,capitalWeightedFactoryUnits:Number(score.weightedUnits.toFixed(3))};
 });
 return{
  baselineId:'OMEGA_PRIVATE_COMPANY_OPENING_CAPITAL_V1',countryId:country,countryName:privateRow.countryName||governmentRow.countryName||null,
  currencyCode:economy.currencyCode,currencySource:economy.currencySource,fxLocalPerUsd:economy.localPerUsd,
  fxStatus:economy.fxStatus,gdpUsd:economy.gdpUsd,gdpLocal:economy.gdpLocal,gdpSource:economy.gdpSource,
  privateSectorContributionPct:share.contributionSharePct,privateSectorShareEvidence:share,
  privateSectorValueLocal:privateGDP,totalOpeningCapital:total,
  capitalRateOfPrivateSectorValue:.0000025,capitalRateFloor:factoryFloor,
  privateFactoryUnits:privateUnits,governmentFactoryUnits:governmentUnits,
  companyAllocations:rows,authority:'OMEGA_PRIVATE_COMPANY_CAPITAL_ALLOCATION_V1',
  turnScope:'SELECTED_PLAYER_COUNTRY_ONLY',createdFrom:'COUNTRY_ECONOMY_AND_PRIVATE_FACTORY_BASELINE'
 };
}
function getActiveDependencies(){
 return{
  lifecycle:g.OmegaPrivateEnterpriseLifecycleV1||(g.Omega&&g.Omega.PrivateEnterpriseLifecycleV1),
  privateRegistry:g.OmegaPrivateEnterpriseRegistryV1||(g.Omega&&g.Omega.PrivateEnterpriseRegistryV1),
  governmentRegistry:g.OmegaCountryFactoryStartingBaselineV1||(g.Omega&&g.Omega.CountryFactoryStartingBaselineV1),
  countryRuntime:g.OmegaCountryRuntimeData,
  generalRuntime:g.OmegaCountryGeneralDataRuntime||(g.Omega&&g.Omega.CountryGeneralData),
  finance:g.OmegaFinanceMinistry||(g.Omega&&g.Omega.FinanceMinistry),
  forex:g.OmegaForexMonetaryEngine||(g.Omega&&g.Omega.ForexMonetaryEngine)
 };
}
function ensureCountryInitialized(country){
 var cid=id(country||playerCountry()),active=playerCountry();
 if(!cid||cid!==active)return Promise.resolve({status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY',countryId:cid||null});
 activationRequested=true;
 if(completed.has(cid))return Promise.resolve(clone(completed.get(cid)));
 if(inflight.has(cid))return inflight.get(cid);
 var token=++sequence,deps=getActiveDependencies();
 if(!deps.lifecycle||typeof deps.lifecycle.initializeOpeningCompanyCapital!=='function'||
    !deps.privateRegistry||!deps.governmentRegistry||!deps.countryRuntime||!deps.finance)
  return Promise.resolve({status:'WAITING',reason:'PRIVATE_COMPANY_CAPITAL_DEPENDENCIES_NOT_READY',countryId:cid});
 var task=(async function(){
  try{
   var waits=await Promise.all([
    Promise.resolve(deps.privateRegistry.ready).catch(function(){return null;}),
    Promise.resolve(deps.governmentRegistry.ready).catch(function(){return null;}),
    Promise.resolve(deps.countryRuntime.ready).catch(function(){return false;}),
    Promise.resolve(deps.finance.init&&deps.finance.init()).catch(function(){return null;}),
    Promise.resolve(true)
   ]);
   if(token!==sequence||playerCountry()!==cid)return{status:'STALE_COUNTRY_RESULT',countryId:cid};
   var privateRow=deps.privateRegistry.getCountryBaseline(cid);
   var governmentRow=deps.governmentRegistry.getCountryBaseline(cid);
   if(!privateRow||privateRow.status!=='READY'||!governmentRow)
    return{status:'WAITING',reason:'COUNTRY_FACTORY_BASELINES_NOT_READY',countryId:cid};
   var profile=deps.countryRuntime.getProfile(cid)||null;
   var indicators=deps.finance.getIndicators(cid)||{};
   var general=deps.generalRuntime&&typeof deps.generalRuntime.getCountryRecord==='function'
    ?deps.generalRuntime.getCountryRecord(cid):null;
   var plan=buildPlan(cid,privateRow,governmentRow,profile,indicators,general,deps.forex);
   if(token!==sequence||playerCountry()!==cid)return{status:'STALE_COUNTRY_RESULT',countryId:cid};
   lastPlan=plan;lastError=null;
   var result=deps.lifecycle.initializeOpeningCompanyCapital({
    countryId:cid,currencyCode:plan.currencyCode,totalCapital:plan.totalOpeningCapital,
    baselineId:plan.baselineId,privateSectorContributionPct:plan.privateSectorContributionPct,
    gdpUsd:plan.gdpUsd,gdpLocal:plan.gdpLocal,fxLocalPerUsd:plan.fxLocalPerUsd,
    companyAllocations:plan.companyAllocations,model:clone(plan)
   });
   if(result&&['INITIALIZED','ALREADY_INITIALIZED','PARTIALLY_INITIALIZED'].indexOf(result.status)>=0){
    completed.set(cid,clone(result));return result;
   }
   return result||{status:'BLOCKED',reason:'PRIVATE_COMPANY_CAPITAL_INITIALIZATION_FAILED',countryId:cid};
  }catch(error){
   lastError=String(error&&error.message||error);
   return{status:'BLOCKED',reason:lastError,countryId:cid};
  }finally{
   inflight.delete(cid);
  }
 })();
 inflight.set(cid,task);return task;
}
function requestActiveCountry(){
 var cid=playerCountry();if(!cid)return;
 ensureCountryInitialized(cid).then(function(result){
  if(result&&result.status==='INITIALIZED'){
   try{g.dispatchEvent&&g.CustomEvent&&g.dispatchEvent(new g.CustomEvent('OMEGA_PRIVATE_COMPANY_OPENING_CAPITAL_READY',{detail:clone(result)}));}catch(_){}
  }
 }).catch(function(error){lastError=String(error&&error.message||error);});
}
function diagnostics(){
 return{version:VERSION,status:lastError?'DEGRADED':completed.size?'READY':'IDLE',reason:lastError,
  activationRequested:activationRequested,startupPolicy:'LAZY_PRIVATE_ENTERPRISE_OPEN',
  initializedCountries:Array.from(completed.keys()),inFlightCountries:Array.from(inflight.keys()),
  lastPlan:clone(lastPlan),currencyPolicy:'COUNTRY_LOCAL_CURRENCY',financeAuthority:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_FINANCE_CAPITAL_ACCOUNTS'};
}
var API=Object.freeze({VERSION:VERSION,ensureCountryInitialized:ensureCountryInitialized,
 requestActiveCountry:requestActiveCountry,diagnostics:diagnostics,buildPlan:buildPlan});
g.OmegaPrivateCompanyCapitalRuntimeV1=API;g.Omega=g.Omega||{};g.Omega.PrivateCompanyCapitalRuntimeV1=API;
function scheduleAfterBootIdle(){
 if(activationScheduled)return;
 activationScheduled=true;
 var run=function(){activationScheduled=false;requestActiveCountry();};
 if(typeof g.requestIdleCallback==='function'){
  try{g.requestIdleCallback(run,{timeout:1800});return;}catch(_){}
 }
 if(typeof g.setTimeout==='function'){
  g.setTimeout(run,900);return;
 }
 Promise.resolve().then(run);
}
function handleRuntimeEvent(type){
 var panelEvent=type==='OMEGA_PRIVATE_ENTERPRISE_BASELINE_READY'||type==='OMEGA_PRIVATE_ENTERPRISE_PANEL_OPENED';
 if(panelEvent){activationRequested=true;requestActiveCountry();return;}
 if(type==='OMEGA_READY'||type==='OMEGA_GAME_SESSION_STARTED'){
  activationRequested=true;scheduleAfterBootIdle();return;
 }
 if(activationRequested&&['OMEGA_PLAYER_COUNTRY_CHANGED','COUNTRY_CHANGED','COUNTRY_SELECTED','OMEGA_COUNTRY_SELECTED']
  .indexOf(type)>=0)scheduleAfterBootIdle();
}
if(typeof g.addEventListener==='function'){
 ['OMEGA_PRIVATE_ENTERPRISE_BASELINE_READY','OMEGA_PRIVATE_ENTERPRISE_PANEL_OPENED',
  'OMEGA_READY','OMEGA_GAME_SESSION_STARTED',
  'OMEGA_PLAYER_COUNTRY_CHANGED','COUNTRY_CHANGED','COUNTRY_SELECTED','OMEGA_COUNTRY_SELECTED']
  .forEach(function(type){g.addEventListener(type,function(){handleRuntimeEvent(type);});});
}
// Wait for the game/session-ready signal, then run in an idle slice so the
// opening map render is not competing with the optional 197-country baseline.

if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
