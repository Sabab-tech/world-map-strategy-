import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog=JSON.parse(fs.readFileSync('resource_industrial_catalog_v1.json','utf8'));
const context={
  console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise,Intl,
  OmegaResourceIndustrialCatalogData:catalog,
  OmegaResourceSiteMasterResearchData:{
    siteCount:2,
    sites:[
      {siteId:'SITE_BGD_COAL_01',countryId:'BGD',siteName:'Test Coal Mine',real:{resourceId:'coal'},sourceSiteRecord:{id:'SITE_BGD_COAL_01',resourceId:'coal',commercialExtraction:true},simulation:{transportRoute:[]},siteType:'COAL_MINE'},
      {siteId:'SITE_BGD_IRON_01',countryId:'BGD',siteName:'Test Iron Mine',real:{resourceId:'iron_ore'},sourceSiteRecord:{id:'SITE_BGD_IRON_01',resourceId:'iron_ore',commercialExtraction:true},simulation:{transportRoute:[]},siteType:'OPEN_PIT_MINE'}
    ]
  },
  OmegaResourceScenarioEngineeringData:{
    records:[
      {siteId:'SITE_BGD_COAL_01',countryId:'BGD',resourceId:'coal',unit:'TONNES',nominalCapacity:1000,minimumCapacity:500,maximumCapacity:1300,utilization:.8,recovery:.85,decline:.01,maintenance:.03,scenarioLifeYears:375},
      {siteId:'SITE_BGD_IRON_01',countryId:'BGD',resourceId:'iron_ore',unit:'TONNES',nominalCapacity:2000,minimumCapacity:1000,maximumCapacity:2600,utilization:.8,recovery:.9,decline:.01,maintenance:.03,scenarioLifeYears:375}
    ]
  },
  Omega:{
    ResourceRealism:{
      siteModel(site,_profile,countryId){
        const s=(context.OmegaResourceScenarioEngineeringData.records||[]).find(x=>x.siteId===site.siteId&&x.resourceId===site.resourceId)||{};
        return {commodityStreams:[{resourceId:site.resourceId,reserve:{quantity:500000,unit:'TONNES',authority:'SIMULATED'},production:{activeRate:s.nominalCapacity||1000,nominalCapacity:s.nominalCapacity||1000,recovery:s.recovery||.8}}]};
      }
    }
  },
  Game:{
    state:{
      simulation:{turn:1,startYear:2015,date:'2015-01-01',daysPerTurn:30},
      resource:{BGD:{warehouse:{availableByResource:{coal:50000,iron_ore:50000}},technologyCapabilities:[]}},
      economy:{BGD:{productionAssets:[]}},
      transport:{BGD:{infrastructure:{roads:{capacityPerDay:50000,quality:.9},rail:{capacityPerDay:120000,quality:.8},ports:{capacityPerDay:200000,quality:.9},bridges:{capacityPerDay:50000,quality:.8},pipelines:{capacityPerDay:400000,quality:.8}}}},
      foreign:{BGD:{relations:{USA:80}}}
    }
  }
};
context.globalThis=context;
const handlers=new Map();
context.Omega.MinistryInteroperability={
  registerAction(){},
  registerCommandHandler(type,_owner,handler){handlers.set(type,handler)},
  dispatchCommand(_owner,type,country,payload){return handlers.get(type)?.({payload},{countryId:country,stateTransaction:{get:()=>null,set(){}}})||{status:'UNAVAILABLE'}},
  emitEvent(){return true}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('omega_resource_industrial_network_v1.js','utf8'),context,{filename:'omega_resource_industrial_network_v1.js'});
const N=context.Omega.ResourceIndustrialNetwork;

const extraction=N.planExtraction({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:2000});
assert.equal(extraction.status,'PLANNED');
assert.equal(extraction.method,'UNDERGROUND_LONGWALL');
assert.ok(extraction.totalDurationDays>0);
assert.ok(extraction.crewRequired>0);
assert.ok(extraction.equipmentRequired.length>0);

const none=N.planShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:5000});
assert.equal(none.status,'BLOCKED');
assert.equal(none.reason,'NO_MATCHING_FACTORY');

context.Game.state.economy.BGD.productionAssets.push({
  id:'FAC-COAL-PREP',countryId:'BGD',stage:'PROCESSING',factoryType:'COAL_PREPARATION_PLANT',
  capacity:1000,inputCoefficients:{coal:1},outputProfile:{COAL_CONCENTRATE:.82,COAL_REJECT:.18},
  transportAccess:['rail','road'],locationNodeKey:'INDUSTRIAL_ZONE:BGD'
});

const plan=N.planShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:5000,transportMode:'rail'});
assert.equal(plan.status,'PLANNED');
assert.equal(plan.route.transportMode,'rail');
assert.ok(plan.route.vehiclePlan.some(x=>x.mode==='rail'));
assert.ok(plan.route.totalDistanceKm>0);
assert.ok(plan.route.travelTimeDays>0);
assert.ok(plan.route.vehiclePlan.every(x=>x.units>=1));
assert.equal(plan.route.crossBorderRequired,false);

const sent=N.dispatchShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:5000,transportMode:'rail'});
assert.equal(sent.status,'DISPATCHED');
assert.equal(context.Game.state.resource.BGD.warehouse.reservedByResource.coal,5000);

context.Game.state.simulation.turn=sent.shipment.etaTurn;
const advanced=N.advanceShipments('BGD');
assert.equal(advanced.delivered,1);
assert.equal(advanced.shipments[0].destinationStatus,'FACTORY_RECEIVED');

const factoryProject=N.startFactoryProject({countryId:'BGD',resourceId:'iron_ore',capacityPerDay:750,buildDays:60,requiredTechnologyIds:['DIGITAL_MAINTENANCE']});
assert.equal(factoryProject.status,'UNDER_CONSTRUCTION');
context.Game.state.simulation.turn=2;
N.advanceProjects('BGD');
context.Game.state.simulation.turn=3;
let projectAdvance=N.advanceProjects('BGD');
assert.equal(projectAdvance.status,'ADVANCED');
const locked=context.Game.state.economy.BGD.productionAssets.find(x=>x.id===factoryProject.factoryId);
assert.equal(locked.status,'TECHNOLOGY_LOCKED');

context.Game.state.simulation.turn=4;
const tech=N.startTechnologyProject({countryId:'BGD',technologyId:'DIGITAL_MAINTENANCE',mode:'RESEARCH'});
assert.equal(tech.status,'IN_PROGRESS');
context.Game.state.simulation.turn=8;
N.advanceProjects('BGD');
assert(context.Game.state.resource.BGD.technologyCapabilities.some(x=>x.technologyId==='DIGITAL_MAINTENANCE'));
const fx=context.Game.state.economy.BGD.productionAssets.find(x=>x.id===factoryProject.factoryId);
assert.equal(fx.status,'OPERATIONAL');

const importCapability={technologyId:'AUTONOMOUS_MINE_HAULAGE',targetSiteId:'*',targetResourceId:'coal',targetSiteType:'*',status:'COMPLETE',effects:catalog.technologyProjects.AUTONOMOUS_MINE_HAULAGE.effects};
context.Game.state.resource.USA={technologyCapabilities:[importCapability]};
const imported=N.startTechnologyProject({countryId:'BGD',technologyId:'AUTONOMOUS_MINE_HAULAGE',mode:'IMPORT',donorCountryId:'USA',targetSiteId:'SITE_BGD_COAL_01',resourceId:'coal'});
assert.equal(imported.status,'IN_PROGRESS');
context.Game.state.simulation.turn=12;
N.advanceProjects('BGD');
assert(context.Game.state.resource.BGD.technologyCapabilities.some(x=>x.technologyId==='AUTONOMOUS_MINE_HAULAGE'&&x.sourceType==='IMPORTED'));

const padma=N.startPadmaCorridorProject({countryId:'BGD'});
assert.equal(padma.infrastructureType,'bridge');
context.Game.state.simulation.turn=42;
N.advanceProjects('BGD');
assert.equal(context.Game.state.resource.BGD.industrialNetwork.infrastructure.corridors.PADMA_EAST_WEST.status,'OPERATIONAL');

const diag=N.diagnostics();
assert.equal(diag.siteCount,2);
assert.equal(diag.extractionPlans,2);
assert.equal(diag.targetArchitecture,'SITE -> EXTRACTION -> WAREHOUSE -> ROUTE -> FACTORY -> PROCESS -> OUTPUT');

console.log('OMEGA RESOURCE INDUSTRIAL NETWORK V1 TEST PASSED');
