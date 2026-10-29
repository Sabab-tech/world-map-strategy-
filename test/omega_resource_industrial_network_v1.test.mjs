import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog=JSON.parse(fs.readFileSync('resource_industrial_catalog_v1.json','utf8'));
const testSiteLogisticsRoutes=[
  ['SITE_BGD_COAL_01','coal'],
  ['SITE_BGD_IRON_01','iron_ore'],
  ['SITE_BGD_IRON_02','iron_ore'],
  ['SITE_BGD_COPPER_01','copper']
].map(([siteId,resourceId])=>({
  countryId:'BGD',siteId,resourceId,routeId:'TEST_MINE_ROUTE:'+siteId,
  routePlan:{
    routeStatus:'TEST_FIXTURE_SIMULATION_ONLY',
    capacityBottleneckPerDay:120000,
    estimatedRouteDistanceKm:100,
    plannedTransitDays:1,
    minimumTransitDays:1,
    legs:[{transportMode:'rail',estimatedDistanceKm:100,estimatedTravelHours:24,
      designCapacityPerDay:120000,designCapacityUnit:'tonnes'}]
  },
  quantityUnitBridge:{sourceProductionUnit:'tonnes',cargoCapacityUnit:'tonnes'},
  provenance:{authority:'TEST_FIXTURE_SIMULATION_ONLY'}
}));
const context={
  console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise,Intl,
  OmegaResourceIndustrialCatalogData:catalog,
  OmegaResourceSiteLogisticsRoutesManifestData:{
    schemaVersion:'1.0.0',datasetId:'TEST_SITE_LOGISTICS_ROUTES_BGD',
    authority:'TEST_FIXTURE_SIMULATION_ONLY',
    countryToPart:{BGD:1},
    parts:[{part:1,file:'test_resource_site_logistics_routes_bgd.json',routeCount:4,countries:['BGD']}]
  },
  fetch:async()=>({ok:true,json:async()=>({schemaVersion:'1.0.0',routes:testSiteLogisticsRoutes})}),
  OmegaCanonicalIdentityRegistry:{
    resolveCountry(value){
      const key=String(value??'').trim().toUpperCase();
      if(key==='KUWAIT'||key==='KW'||key==='KWT')return{id:'KW',raw:{iso3:'KWT',iso2:'KW',name:'Kuwait'}};
      return null;
    }
  },
  OmegaResourceSiteMasterResearchData:{
    siteCount:4,
    sites:[
      {siteId:'SITE_BGD_COAL_01',countryId:'BGD',siteName:'Test Coal Mine',real:{resourceId:'coal'},sourceSiteRecord:{id:'SITE_BGD_COAL_01',resourceId:'coal',commercialExtraction:true},simulation:{transportRoute:[]},siteType:'COAL_MINE'},
      {siteId:'SITE_BGD_IRON_01',countryId:'BGD',siteName:'Test Iron Mine',real:{resourceId:'iron_ore'},sourceSiteRecord:{id:'SITE_BGD_IRON_01',resourceId:'iron_ore',commercialExtraction:true},simulation:{transportRoute:[]},siteType:'OPEN_PIT_MINE'},
      {siteId:'SITE_BGD_IRON_02',countryId:'BGD',siteName:'Test Iron Mine 02',real:{resourceId:'iron_ore'},sourceSiteRecord:{id:'SITE_BGD_IRON_02',resourceId:'iron_ore',commercialExtraction:true},simulation:{transportRoute:[]},siteType:'OPEN_PIT_MINE'},
      {siteId:'SITE_BGD_COPPER_01',countryId:'BGD',siteName:'Test Copper Mine',real:{resourceId:'copper'},sourceSiteRecord:{id:'SITE_BGD_COPPER_01',resourceId:'copper',commercialExtraction:true},simulation:{transportRoute:[]},siteType:'OPEN_PIT_MINE'}
    ]
  },
  OmegaResourceScenarioEngineeringData:{
    records:[
      {siteId:'SITE_BGD_COAL_01',countryId:'BGD',resourceId:'coal',unit:'TONNES',nominalCapacity:1000,minimumCapacity:500,maximumCapacity:1300,utilization:.8,recovery:.85,decline:.01,maintenance:.03,scenarioLifeYears:375},
      {siteId:'SITE_BGD_IRON_01',countryId:'BGD',resourceId:'iron_ore',unit:'TONNES',nominalCapacity:2000,minimumCapacity:1000,maximumCapacity:2600,utilization:.8,recovery:.9,decline:.01,maintenance:.03,scenarioLifeYears:375},
      {siteId:'SITE_BGD_IRON_02',countryId:'BGD',resourceId:'iron_ore',unit:'TONNES',nominalCapacity:2000,minimumCapacity:1000,maximumCapacity:2600,utilization:.8,recovery:.9,decline:.01,maintenance:.03,scenarioLifeYears:375},
      {siteId:'SITE_BGD_COPPER_01',countryId:'BGD',resourceId:'copper',unit:'TONNES',nominalCapacity:1500,minimumCapacity:800,maximumCapacity:2000,utilization:.8,recovery:.85,decline:.01,maintenance:.03,scenarioLifeYears:375}
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
      simulation:{turn:1,startYear:2015,date:'2015-01-01',daysPerTurn:30,playerCountryId:'BGD'},
      resource:{BGD:{inventory:{coal:50000,iron_ore:50000},warehouse:{availableByResource:{coal:50000,iron_ore:50000},reservedByResource:{}},technologyCapabilities:[]}},
      economy:{BGD:{unemploymentCount:600000,laborForce:6000000,unemployment_rate:10,productionAssets:[]}},
      transport:{BGD:{infrastructure:{roads:{capacityPerDay:50000,quality:.9},rail:{capacityPerDay:120000,quality:.8},ports:{capacityPerDay:200000,quality:.9},bridges:{capacityPerDay:50000,quality:.8},pipelines:{capacityPerDay:400000,quality:.8},
        utilitySupply:{electricityMWhPerDay:1000000,waterM3PerDay:1000000,authority:'TEST_FIXTURE',status:'AVAILABLE',simulationOnly:true,assets:[]}}}},
      foreign:{BGD:{relations:{USA:80}}}
    }
  }
};
context.globalThis=context;
// Mirror the game runtime's extraction event bridge so the test exercises real mine-haul dispatch.
const browserEventHandlers=new Map();
context.addEventListener=(type,handler)=>{
  const listeners=browserEventHandlers.get(type)||[];
  listeners.push(handler);
  browserEventHandlers.set(type,listeners);
};
context.dispatchEvent=(event)=>{
  for(const handler of browserEventHandlers.get(event?.type)||[])handler.call(context,event);
  return true;
};
context.CustomEvent=class CustomEvent{
  constructor(type,options={}){this.type=type;this.detail=options.detail||null;}
};
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
function advanceOneGameTurn(state){
  const sim=state.simulation||(state.simulation={});
  const step=Math.max(1,Math.round(Number(sim.daysPerTurn)||1));
  const base=String(sim.date||String(Number(sim.startYear)||2015)+'-01-01');
  const date=new Date(base+'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate()+step);
  sim.date=date.toISOString().slice(0,10);
  sim.turn=(Number(sim.turn)||1)+1;
}
function advanceToGameTurn(state,targetTurn){
  const target=Math.max(1,Number(targetTurn)||1);
  let guard=0;
  while((Number(state.simulation?.turn)||1)<target){
    advanceOneGameTurn(state);
    if(++guard>10000)throw new Error('TEST_GAME_CLOCK_TURN_GUARD');
  }
}
function advanceToCycleFinish(state,cycle){
  const sim=state.simulation||(state.simulation={});
  if(!sim.date)sim.date=String(cycle?.startDate||String(Number(sim.startYear)||2015)+'-01-01');
  const currentTurn=Number(sim.turn)||1;
  const targetTurn=Math.max(currentTurn+1,Number(cycle?.finishTurn)||currentTurn+1);
  const targetDate=cycle?.finishDate?new Date(String(cycle.finishDate)+'T00:00:00.000Z'):null;
  let guard=0;
  while((Number(sim.turn)||1)<targetTurn||(targetDate&&new Date(String(sim.date)+'T00:00:00.000Z')<targetDate)){
    advanceOneGameTurn(state);
    if(++guard>10000)throw new Error('TEST_FACTORY_CYCLE_CLOCK_GUARD');
  }
}

// Older save states may persist a partial industrial-network object without the extraction ledger.
context.Game.state.resource.BGD.industrialNetwork={
  schemaVersion:'1.0.0',shipments:[],projects:[],reservations:{},deliveries:[],siteFlowLedger:[],
  infrastructure:{nodes:{},edges:{},corridors:{}},events:[],factoryRuntime:{},technologyContracts:[]
};
const extraction=N.planExtraction({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:2000});
assert.ok(Array.isArray(context.Game.state.resource.BGD.industrialNetwork.extractions),
  'legacy network state must initialize its extraction ledger before appending a plan');
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
assert.equal(Number(plan.route.legs.reduce((sum,leg)=>sum+(Number(leg.distanceKm)||0),0).toFixed(6)),
  Number(plan.route.totalDistanceKm.toFixed(6)),
  'the sum of every truck/train leg must equal the complete route distance');
assert.ok(Math.abs(plan.route.legs.reduce((sum,leg)=>sum+(Number(leg.travelDays)||0),0)-plan.route.travelTimeDays)<0.00001,
  'route time must reconcile with calculated per-leg travel, loading and unloading time within rounding tolerance');
assert.ok(plan.route.vehiclesByMode.truck>0&&plan.route.vehiclesByMode.rail>0,
  'multi-modal route must report the per-mode vehicle count from payload capacity');
assert.ok(plan.route.vehiclePlan.every(x=>x.units===Math.ceil(plan.route.requestedQuantity/Math.max(.001,Number(x.payloadTonnes)||1))),
  'planned vehicles must be derived from each mode load capacity');
assert.equal(plan.route.crossBorderRequired,false);
assert.equal(plan.route.sourceSiteId,'SITE_BGD_COAL_01','shipment retains the originating mine identity');
assert.equal(plan.route.sourceWarehouseId,'WH-BGD-RAW','factory transport must start from the sovereign raw warehouse');
assert.equal(plan.route.sourceNode,'WAREHOUSE:BGD:RAW','mine-to-warehouse extraction must not be mislabeled as the warehouse-to-factory leg');

const sent=N.dispatchShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:5000,transportMode:'rail'});
assert.equal(sent.status,'DISPATCHED');
assert.equal(context.Game.state.resource.BGD.warehouse.reservedByResource.coal,5000);

const selectedPlayerBeforePause=context.Game.state.simulation.playerCountryId;
delete context.Game.state.simulation.playerCountryId;
const paused=N.advanceShipments('BGD');
assert.equal(paused.status,'SKIPPED','logistics must not advance any country without a selected player');
assert.equal(context.Game.state.resource.BGD.industrialNetwork.shipments.find(x=>x.shipmentId===sent.shipment.shipmentId)?.status,'IN_TRANSIT',
  'a missing player selection must not deliver an in-transit shipment');
context.Game.state.simulation.playerCountryId=selectedPlayerBeforePause;
advanceToGameTurn(context.Game.state,sent.shipment.etaTurn);
const advanced=N.advanceShipments('BGD');
assert.equal(advanced.delivered,1);
assert.equal(advanced.shipments[0].destinationStatus,'FACTORY_RECEIVED');
assert.equal(advanced.shipments[0].processingStatus,'IN_PROGRESS',
  'delivery should schedule production, not synchronously commit finished goods');
assert.equal(context.Game.state.resource.BGD.warehouse.availableByResource.coal,45000,'delivered raw stock must leave the sovereign warehouse');
assert.equal(context.Game.state.resource.BGD.warehouse.reservedByResource.coal,0,'shipment reservation must be released on delivery');
assert.equal(context.Game.state.resource.BGD.inventory.coal,45000,'raw inventory must be debited once when the shipment is delivered');
const factory=context.Game.state.economy.BGD.productionAssets[0];
const cycle=context.Game.state.resource.BGD.industrialNetwork.factoryProductionCycles[factory.id];
assert.ok(cycle&&cycle.status==='IN_PROGRESS','factory receipt must create a dated production cycle');
assert.ok(cycle.finishDate,'factory cycle must expose its authoritative finish date');
assert.equal(context.Game.state.resource.BGD.inventory.COAL_CONCENTRATE||0,0,'finished goods must not exist on the delivery tick');
assert.equal(context.Game.state.resource.BGD.inventory.COAL_REJECT||0,0,'processing coproduct must not exist before cycle completion');
assert.equal(factory.inputInventory.coal,5000,'all delivered material stays recorded at the factory until the cycle finishes');
assert.equal(context.Game.state.resource.BGD.processedWarehouse,undefined,
  'the processed warehouse must not be fabricated before there is production output');

context.Game.state.simulation.turn=Math.max(Number(context.Game.state.simulation.turn)||0,Number(cycle.finishTurn)||0);
context.Game.state.simulation.date=cycle.finishDate;
const completed=N.processPendingFactoryInputs('BGD');
assert.equal(completed.completedCount,1,JSON.stringify(completed));
assert.equal(completed.completed[0].status,'COMPLETED');
assert.equal(context.Game.state.resource.BGD.inventory.COAL_CONCENTRATE,820,'completed factory output must enter the resource inventory');
assert.equal(context.Game.state.resource.BGD.inventory.COAL_REJECT,180,'processing coproduct must be recorded on completion');
assert.equal(factory.inputInventory.coal,4000,'only the completed cycle input should be debited from factory input stock');
assert.equal(context.Game.state.resource.BGD.processedWarehouse.availableByResource.COAL_CONCENTRATE,820);
assert.equal(context.Game.state.resource.BGD.processedWarehouse.availableByResource.COAL_REJECT,180);
assert.ok(context.Game.state.resource.BGD.batches.some(x=>x.stage==='FINISHED'&&x.resourceId==='COAL_CONCENTRATE'));
assert.ok(Object.values(context.Game.state.resource.BGD.inventoryLots).some(x=>x.stage==='FINISHED'&&x.resourceId==='COAL_REJECT'));
assert.equal(factory.inputBatchLots.reduce((sum,x)=>sum+(Number(x.remainingQuantity)||0),0),4000);

const factoryBuildProfile=catalog.factoryProfiles.UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT
for(const [materialId,requiredQty] of Object.entries(factoryBuildProfile.constructionMaterials||{})){
  context.Game.state.resource.BGD.inventory[materialId]=(Number(context.Game.state.resource.BGD.inventory[materialId])||0)+Number(requiredQty);
  context.Game.state.resource.BGD.warehouse.availableByResource[materialId]=(Number(context.Game.state.resource.BGD.warehouse.availableByResource[materialId])||0)+Number(requiredQty);
}
const factoryProject=N.startFactoryProject({countryId:'BGD',resourceId:'iron_ore',capacityPerDay:1500,buildDays:60,requiredTechnologyIds:['DIGITAL_MAINTENANCE']});
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
for(let turn=13;turn<=42;turn++){context.Game.state.simulation.turn=turn;N.advanceProjects('BGD');}
assert.equal(context.Game.state.resource.BGD.industrialNetwork.infrastructure.corridors.PADMA_EAST_WEST.status,'OPERATIONAL');

// Full runtime integration: canonical site identity -> exact occurrence -> extraction batch -> country warehouse
// -> site-specific shipment -> factory input inventory -> processed output. The endowment fixture mirrors the
// committed endowment API contract; the existing global-pipeline suite independently exercises the real endowment engine.
context.Omega.ResourceEndowmentRuntime={
  async initialize(){return{status:'READY'};},
  async hydrateCountry(countryId){
    const rs=context.Game.state.resource[countryId]||(context.Game.state.resource[countryId]={inventory:{},warehouse:{availableByResource:{},reservedByResource:{}},mineSiteControllers:{}});
    rs.mineSiteControllers=rs.mineSiteControllers||{};
    rs.mineSiteControllers.SITE_BGD_COPPER_01={siteReferenceKey:'SITE_BGD_COPPER_01',linkedOccurrenceKeys:['SITE_OCC:BGD:SITE_BGD_COPPER_01'],controllerStatus:'RUNNING'};
    rs.mineSiteControllers.SITE_BGD_IRON_01={siteReferenceKey:'SITE_BGD_IRON_01',linkedOccurrenceKeys:['SITE_OCC:BGD:SITE_BGD_IRON_01'],controllerStatus:'RUNNING'};
    rs.mineSiteControllers.SITE_BGD_IRON_02={siteReferenceKey:'SITE_BGD_IRON_02',linkedOccurrenceKeys:['SITE_OCC:BGD:SITE_BGD_IRON_02'],controllerStatus:'RUNNING'};
    rs.mineStates=rs.mineStates||{};
    rs.mineStates['SITE_OCC:BGD:SITE_BGD_COPPER_01']={resourceId:'copper',countryId};
    rs.mineStates['SITE_OCC:BGD:SITE_BGD_IRON_01']={resourceId:'iron_ore',countryId};
    rs.mineStates['SITE_OCC:BGD:SITE_BGD_IRON_02']={resourceId:'iron_ore',countryId};
    return{status:'APPLIED',result:{accepted:true,countryId}};
  },
  async extractCountry(countryId,occurrenceKeys){
    assert.equal(occurrenceKeys.length,1,'execution must use one exact controller-linked occurrence key, not a display siteId');
    const rs=context.Game.state.resource[countryId],quantity=1200;
    const occurrenceKey=occurrenceKeys[0];
    const resourceId=occurrenceKey.includes('IRON_')?'iron_ore':'copper';
    const batchId=occurrenceKey.includes('IRON_02')?'BATCH-E2E-IRON-02':resourceId==='iron_ore'?'BATCH-E2E-IRON':'BATCH-E2E-COPPER';
    rs.inventory[resourceId]=(Number(rs.inventory[resourceId])||0)+quantity;
    rs.warehouse.availableByResource[resourceId]=(Number(rs.warehouse.availableByResource[resourceId])||0)+quantity;
    rs.warehouse.warehouseId='WH-'+countryId+'-RAW';rs.warehouse.countryId=countryId;rs.warehouse.locationNodeKey='WAREHOUSE:'+countryId+':RAW';
    rs.warehouse.storedBatchIds=rs.warehouse.storedBatchIds||[];rs.batches=rs.batches||[];rs.inventoryLots=rs.inventoryLots||{};
    const trackedBatch={batchId,resourceId,materialIdentity:resourceId,quantity,remainingQuantity:quantity,unit:'TONNES',
      stage:'RAW_EXTRACTED',countryId,sourceCountryId:countryId,originCountryId:countryId,ownerCountryCode:countryId,destinationCountryId:countryId,
      warehouseId:'WH-'+countryId+'-RAW',locationNodeKey:'WAREHOUSE:'+countryId+':RAW',occurrenceKey:occurrenceKeys[0],sourceBatchIds:[],
      provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE'}};
    rs.batches.push(trackedBatch);rs.inventoryLots[batchId]={...trackedBatch,status:'AVAILABLE'};rs.warehouse.storedBatchIds.push(batchId);
    const record={occurrenceKey:occurrenceKeys[0],countryId,resourceId,approvedQuantity:quantity,
      producedBatch:{batchId,quantity,unit:'TONNES',warehouseId:'WH-'+countryId+'-RAW'}};
    context.dispatchEvent(new context.CustomEvent('OMEGA_RESOURCE_EXTRACTION_COMPLETED',{detail:{
      eventType:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',countryId,
      payload:{countryId,resourceId,quantity,occurrenceKey:occurrenceKeys[0],batch:trackedBatch,
        sourceAuthority:'SIMULATED_TEST_FIXTURE'}
    }}));
    return{status:'APPLIED',result:{accepted:true,records:[record]}};
  }
};
const siteRun=await N.executeSitePipeline({countryId:'BGD',siteId:'SITE_BGD_COPPER_01',resourceId:'copper',autoCommissionFactory:true,transportMode:'rail'});
assert.equal(siteRun.status,'IN_TRANSIT','a selected resource site must commit extraction and dispatch a real shipment record: '+JSON.stringify(siteRun));
assert.equal(siteRun.extractionStatus,'COMMITTED');
assert.equal(siteRun.batchId,'BATCH-E2E-COPPER');
assert.ok(siteRun.shipment.route.travelTimeDays>0&&siteRun.shipment.route.travelTimeDays<1,
  'mine-haul transit time must be calculated from distance/speed plus loading/unloading, not the manifest 1-day estimate');
assert.equal(Number(siteRun.shipment.route.legs.reduce((sum,leg)=>sum+(Number(leg.distanceKm)||0),0).toFixed(6)),
  Number(siteRun.shipment.route.totalDistanceKm.toFixed(6)),
  'mine-haul distance must reconcile exactly to the stored route legs');
assert.equal(siteRun.shipment.route.vehicleCount,Math.ceil(1200/5000),
  'the test rail formation uses one train load for 1200 tonnes');
assert.ok(siteRun.extractionPlanId,'industrial extraction planner must be part of the same site action');
assert.ok(siteRun.shipmentId,'shipment must be persisted in the country industrial network');
assert.equal(siteRun.factoryBootstrapStatus,'CREATED_SIMULATION_ONLY','fallback processing capacity must be clearly marked simulation-only');
assert.equal(context.Game.state.resource.BGD.industrialNetwork.siteExecutions[0].siteId,'SITE_BGD_COPPER_01');
const copperMineShipment=siteRun.shipment;
assert.equal(copperMineShipment.shipmentType,'MINE_TO_WAREHOUSE');
advanceToGameTurn(context.Game.state,copperMineShipment.etaTurn);
const copperMineArrival=N.advanceShipments('BGD');
assert.equal(copperMineArrival.mineDelivered,1,JSON.stringify(copperMineArrival));
assert.equal(copperMineArrival.delivered,0,'a mine receipt is not a factory delivery');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.copper)||0,1200,
  'raw copper must enter the sovereign warehouse only after the mine-haul ETA');
const copperFactoryDispatch=N.advanceShipments('BGD');
const copperFactoryShipment=(context.Game.state.resource.BGD.industrialNetwork.shipments||[]).find(row=>
  String(row.batchId)===String(siteRun.batchId)&&row.shipmentType==='RAW_TO_FACTORY'&&row.status==='IN_TRANSIT');
assert.ok(copperFactoryShipment,'warehouse receipt must start a separate timed warehouse-to-factory shipment: '+JSON.stringify(copperFactoryDispatch));
assert.notEqual(copperFactoryShipment.shipmentId,copperMineShipment.shipmentId,
  'the two logistics legs require distinct shipment identities');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.copper)||0,1200,
  'reserved raw cargo remains in the warehouse ledger during the second leg');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.reservedByResource.copper)||0,1200,
  'the factory leg reserves the warehouse stock exactly once');
advanceToGameTurn(context.Game.state,copperFactoryShipment.etaTurn);
const copperDeliveryResult=N.advanceShipments('BGD');
const copperDelivery=(copperDeliveryResult.shipments||[]).find(row=>String(row.shipmentId)===String(copperFactoryShipment.shipmentId));
assert.ok(copperDelivery,'the second-leg shipment must reach the factory: '+JSON.stringify(copperDeliveryResult));
assert.equal(copperDeliveryResult.delivered,1);
assert.equal(copperDelivery.processingStatus,'IN_PROGRESS',
  'factory receipt must schedule production instead of bypassing cycle timing');
assert.equal(Number(context.Game.state.resource.BGD.inventory.COPPER_CONCENTRATE)||0,0,
  'copper output must not be committed on the delivery tick');
const copperFactory=context.Game.state.economy.BGD.productionAssets.find(x=>String(x.id||x.assetId||x.projectId)===String(siteRun.factoryId));
const copperCycle=context.Game.state.resource.BGD.industrialNetwork.factoryProductionCycles[copperFactory.id];
assert.ok(copperCycle&&copperCycle.finishDate,'auto-commissioned copper processing must have a dated production cycle');
context.Game.state.simulation.turn=Math.max(Number(context.Game.state.simulation.turn)||0,Number(copperCycle.finishTurn)||0);
context.Game.state.simulation.date=copperCycle.finishDate;
const copperCompleted=N.processPendingFactoryInputs('BGD');
assert.equal(copperCompleted.completedCount,1,JSON.stringify(copperCompleted));
assert.ok(context.Game.state.resource.BGD.inventory.COPPER_CONCENTRATE>0,'completed site output must be persisted in the country inventory');
assert.ok(context.Game.state.resource.BGD.inventory.TAILINGS>0,'completed processing by-product must be persisted too');
assert.equal(context.Game.state.resource.BGD.warehouse.availableByResource.copper,0,'raw shipment quantity must be removed from warehouse exactly once');
assert.equal(context.Game.state.resource.BGD.warehouse.reservedByResource.copper,0,'site shipment reservation must be cleared');
const copperDeliveryRow=context.Game.state.resource.BGD.industrialNetwork.deliveries.find(x=>String(x.shipmentId)===String(copperFactoryShipment.shipmentId));
assert.equal(copperDeliveryRow.processingStatus,'PROCESSED','delivery record must reconcile when its cycle commits');
assert.ok(context.Game.state.resource.BGD.industrialNetwork.events.some(x=>x.transactionId&&x.status==='COMPLETED'),
  'factory processing must be written to the runtime event ledger');

// A constructed and commissioned factory must receive a mine batch through the normal
// country warehouse and transport path; this action does not opt into simulation bootstrap.
const builtFactoryId=String(factoryProject.factoryId);
const builtFactory=context.Game.state.economy.BGD.productionAssets.find(asset=>String(asset.id)===builtFactoryId);
assert.ok(builtFactory,'the commissioned factory project must exist as a production asset');
assert.equal(builtFactory.status,'OPERATIONAL');
const factoryStatusSnapshot=context.Game.state.economy.BGD.productionAssets.map(asset=>asset.status);
context.Game.state.economy.BGD.productionAssets.forEach(asset=>{
  asset.status=String(asset.id)===builtFactoryId?'OPERATIONAL':'CLOSED';
});
const ironRawBefore=Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore)||0;
const builtFactoryRun=await N.executeSitePipeline({
  countryId:'BGD',siteId:'SITE_BGD_IRON_02',resourceId:'iron_ore',transportMode:'rail'
});
assert.equal(builtFactoryRun.status,'IN_TRANSIT',JSON.stringify(builtFactoryRun));
assert.equal(builtFactoryRun.factoryId,builtFactoryId,
  'normal mine execution must route the batch to the real commissioned compatible factory');
assert.equal(builtFactoryRun.batchId,'BATCH-E2E-IRON-02');
assert.notEqual(builtFactoryRun.factoryBootstrapStatus,'CREATED_SIMULATION_ONLY',
  'using a constructed factory must not silently create a second simulation-only factory');
assert.equal(builtFactoryRun.shipment.shipmentType,'MINE_TO_WAREHOUSE');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironRawBefore,
  'newly extracted iron is debited from warehouse availability while physically at the mine');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.reservedByResource.iron_ore)||0,0,
  'mine-to-warehouse cargo is not reserved as a factory shipment');
advanceToGameTurn(context.Game.state,builtFactoryRun.shipment.etaTurn);
const builtMineArrival=N.advanceShipments('BGD');
assert.equal(builtMineArrival.mineDelivered,1,JSON.stringify(builtMineArrival));
assert.equal(builtMineArrival.delivered,0,'the first leg must not count as a factory delivery');
const builtFactoryShipment=(context.Game.state.resource.BGD.industrialNetwork.shipments||[]).find(row=>
  String(row.batchId)===String(builtFactoryRun.batchId)&&row.shipmentType==='RAW_TO_FACTORY'&&row.status==='IN_TRANSIT');
assert.ok(builtFactoryShipment,'a warehouse receipt must create a separate factory-bound shipment');
assert.notEqual(builtFactoryShipment.shipmentId,builtFactoryRun.shipment.shipmentId);
assert.equal(builtFactoryShipment.factoryId,builtFactoryId);
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironRawBefore+1200,
  'received iron is available in the warehouse while the factory shipment is in transit');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.reservedByResource.iron_ore),1200,
  'only the factory leg reserves the warehouse batch');
advanceToGameTurn(context.Game.state,builtFactoryShipment.etaTurn);
const builtDeliveryResult=N.advanceShipments('BGD');
const builtDelivery=(builtDeliveryResult.shipments||[]).find(row=>String(row.shipmentId)===String(builtFactoryShipment.shipmentId));
assert.ok(builtDelivery,'the constructed-factory shipment must settle by its own shipment ID');
assert.equal(builtDelivery.factoryId,builtFactoryId,'delivered shipment must retain its selected factory ID');
assert.equal(builtDelivery.destinationStatus,'FACTORY_RECEIVED');
assert.equal(builtDelivery.processingStatus,'IN_PROGRESS',
  'receiving input must schedule a dated cycle, not create finished goods immediately');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironRawBefore,
  'raw warehouse stock must be debited when the shipment is actually delivered');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.reservedByResource.iron_ore)||0,0,
  'delivery must release the shipment reservation exactly once');
const ironCycle=context.Game.state.resource.BGD.industrialNetwork.factoryProductionCycles[builtFactoryId];
assert.ok(ironCycle&&ironCycle.finishDate,'the built factory must have an authoritative production finish date');
assert.equal(Number(builtFactory.inputInventory.iron_ore)||0,1200,
  'all delivered iron must be recorded as factory input before cycle completion');
assert.equal(Number(context.Game.state.resource.BGD.inventory.IRON_CONCENTRATE)||0,0,
  'finished iron concentrate must not appear before the processing date');
advanceToCycleFinish(context.Game.state,ironCycle);
const builtFactoryCycleResult=N.processPendingFactoryInputs('BGD');
assert.equal(builtFactoryCycleResult.completedCount,1,JSON.stringify(builtFactoryCycleResult));
assert.equal(Number(builtFactory.inputInventory.iron_ore)||0,0,
  'the commissioned factory must consume the complete input batch only on cycle completion');
assert.ok(Number(context.Game.state.resource.BGD.inventory.IRON_CONCENTRATE)>0,
  'completed factory output must reach national inventory');
assert.ok(Number(context.Game.state.resource.BGD.inventory.ORE_TAILINGS)>0,
  'the recipe coproduct must be reconciled in national inventory');
assert.ok(context.Game.state.resource.BGD.processedWarehouse?.availableByResource?.IRON_CONCENTRATE>0,
  'finished goods must reach the processed warehouse');
const builtOutputBatch=context.Game.state.resource.BGD.batches.find(row=>
  row.stage==='FINISHED'&&row.resourceId==='IRON_CONCENTRATE'&&
  (row.sourceBatchIds||[]).includes('BATCH-E2E-IRON-02'));
assert.ok(builtOutputBatch,'finished product batch must retain lineage to the mine-produced source batch');
const builtDeliveryAfterCycle=(context.Game.state.resource.BGD.industrialNetwork.deliveries||[])
  .find(row=>String(row.shipmentId)===String(builtFactoryShipment.shipmentId));
assert.ok(builtDeliveryAfterCycle,'the persisted delivered-input ledger row must survive cycle completion');
assert.equal(builtDeliveryAfterCycle.processingStatus,'PROCESSED',
  'the delivered input record must reconcile with the actual factory cycle');
context.Game.state.economy.BGD.productionAssets.forEach((asset,index)=>{
  if(factoryStatusSnapshot[index]===undefined)delete asset.status;
  else asset.status=factoryStatusSnapshot[index];
});

// A normal gameplay site action must not manufacture a free simulation factory.
// It commits extraction to a timed mine-to-warehouse leg; with all compatible factories
// closed, the receipt remains raw inventory and no factory shipment is dispatched.
context.Game.state.simulation.turn=Number(context.Game.state.simulation.turn||0)+1;
const assetsBeforeWaiting=context.Game.state.economy.BGD.productionAssets.length;
const factoriesForWaiting=context.Game.state.economy.BGD.productionAssets;
const originalFactoryStatuses=factoriesForWaiting.map(asset=>asset.status);
factoriesForWaiting.forEach(asset=>{asset.status='CLOSED';});
const ironWarehouseBefore=Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore)||0;
const waitingForFactory=await N.executeSitePipeline({
  countryId:'BGD',siteId:'SITE_BGD_IRON_01',resourceId:'iron_ore',transportMode:'rail'
});
assert.equal(waitingForFactory.status,'IN_TRANSIT',JSON.stringify(waitingForFactory));
assert.equal(waitingForFactory.shipment?.shipmentType,'MINE_TO_WAREHOUSE');
assert.equal(waitingForFactory.batchId,'BATCH-E2E-IRON');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironWarehouseBefore,
  'raw stock is held at the mine until the first-leg receipt');
advanceToGameTurn(context.Game.state,waitingForFactory.shipment.etaTurn);
const waitingMineArrival=N.advanceShipments('BGD');
assert.equal(waitingMineArrival.mineDelivered,1,JSON.stringify(waitingMineArrival));
assert.equal(waitingMineArrival.delivered,0);
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironWarehouseBefore+1200,
  'unrouted extracted raw material reaches the sovereign warehouse once');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.reservedByResource.iron_ore)||0,0,
  'no factory leg is reserved while every compatible factory is unavailable');
assert.equal(context.Game.state.economy.BGD.productionAssets.length,assetsBeforeWaiting,
  'a missing compatible factory must not be fabricated by a normal mine action');
assert.ok(!context.Game.state.resource.BGD.industrialNetwork.shipments.some(row=>
  String(row.batchId)==='BATCH-E2E-IRON'&&row.shipmentType==='RAW_TO_FACTORY'&&row.status==='IN_TRANSIT'),
  'warehouse receipt must wait for a commissioned factory rather than send cargo to a closed one');
assert.ok(!context.Game.state.economy.BGD.productionAssets.some(x=>String(x.id||'').startsWith('FAC-SIM:BGD:SITE_BGD_IRON_01')),
  'normal mine actions must not create an unapproved simulation-only factory');
factoriesForWaiting.forEach((asset,index)=>{
  if(originalFactoryStatuses[index]===undefined)delete asset.status;
  else asset.status=originalFactoryStatuses[index];
});

const kuwaitProject=N.startInfrastructureProject({
  countryId:'Kuwait',infrastructureType:'road',distanceKm:10,capacityPerDay:100,cost:100
});
assert.equal(kuwaitProject.countryId,'KWT','country alias must canonicalize to runtime ISO-3, not ISO-2 display ID');
assert.ok(context.Game.state.resource.KWT.industrialNetwork.projects.some(x=>x.projectId===kuwaitProject.projectId),
  'country-scoped industrial state must remain under the matching ISO-3 resource bucket');
assert.equal(context.Game.state.resource.KW?.industrialNetwork?.projects?.some(x=>x.projectId===kuwaitProject.projectId)||false,false,
  'country alias resolution must not silently create a competing ISO-2 bucket');

// The authoritative daily clock overrides stale 30-day-per-turn hints from older saves.
context.Omega.Simulation={clock:{turn:42,stepDurationMs:86400000}};
assert.equal(N.diagnostics().daysPerTurn,1,'industrial route ETAs and construction progress must follow one day per clock turn');

const diag=N.diagnostics();
assert.equal(diag.siteCount,4,'diagnostics must include the added constructed-factory source site');
assert.equal(diag.extractionPlans,4,'diagnostics must include the additional mine extraction planned for the commissioned-factory path');
assert.equal(diag.targetArchitecture,'SITE -> EXTRACTION -> WAREHOUSE -> ROUTE -> FACTORY -> PROCESS -> OUTPUT');

// Every route segment shares a per-turn transport ledger across shipments.
const capacityLedgerTurns=Object.keys(context.Game.state.resource.BGD.industrialNetwork.transportCapacityLedger?.turns||{})
  .map(Number).filter(Number.isFinite);
const capacityLedgerTurn=Math.max(
  Number(context.Game.state.simulation.turn)||0,
  Number(context.Omega.Simulation.clock.turn)||0,
  ...capacityLedgerTurns,
  42
)+1;
context.Omega.Simulation.clock.turn=capacityLedgerTurn;
// Industrial ledgers use the shared Game simulation state as the canonical turn source.
context.Game.state.simulation.turn=capacityLedgerTurn;
context.Game.state.transport.BGD.infrastructure.roads.capacityPerDay=11000;
context.Game.state.transport.BGD.infrastructure.roads.quality=1;
const firstCapacityShipment=N.dispatchShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:5000,transportMode:'rail'});
assert.equal(firstCapacityShipment.status,'DISPATCHED',JSON.stringify(firstCapacityShipment));
const secondCapacityShipment=N.dispatchShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:1000,transportMode:'rail'});
assert.equal(secondCapacityShipment.status,'DISPATCHED',JSON.stringify(secondCapacityShipment));
assert.equal(secondCapacityShipment.shipment.quantity,500,'shared capacity across both truck legs must cap the second shipment');
assert.ok(secondCapacityShipment.shipment.route.vehiclePlan.every(leg =>
  leg.units === Math.ceil(500 / Math.max(.001, Number(leg.payloadTonnes) || 1))),
  'vehicle count must be recalculated from the actual shared-capacity-limited shipment');
assert.ok(secondCapacityShipment.shipment.route.vehiclePlan.every(leg => leg.dispatchQuantity === 500),
  'every route leg must report the same adjusted dispatch quantity');
const sharedTransport=context.Game.state.resource.BGD.industrialNetwork.transportCapacityLedger.turns[String(capacityLedgerTurn)];
assert.equal(sharedTransport.usedByMode.truck,11000,'truck capacity must be counted jointly for all route legs in one turn');
assert.equal(sharedTransport.shipments.length,2);

// Selected-country UI diagnostics must not walk every country's industrial ledger.
context.Game.state.resource.SAU={
  inventory:{oil:1000},
  industrialNetwork:{
    siteFlowLedger:[{siteId:'SITE_SAU_TEST',resourceId:'oil',status:'BLOCKED',
      stages:[{stage:'EXTRACTION',status:'BLOCKED'}]}],
    shipments:[]
  }
};
const scopedPipeline=N.gameplayPipelineDiagnostics('BGD');
assert.equal(scopedPipeline.diagnosticScope,'BGD');
assert.equal(scopedPipeline.countryCount,1);
assert.equal(Array.from(scopedPipeline.perCountry, row=>row.countryId).join(','),'BGD');
assert.equal(
  scopedPipeline.perCountry[0].blockedFlows.some((row) => row.siteId === 'SITE_SAU_TEST'),
  false,
  'selected-country diagnostics must not read or report another country\'s flow ledger'
);
const globalPipeline=N.gameplayPipelineDiagnostics();
assert.equal(globalPipeline.diagnosticScope,'GLOBAL',
  'no-argument diagnostics must preserve the global aggregate contract');
assert.ok(globalPipeline.countryCount>1,
  'world-level verification must continue to include multiple countries');
const unresolvedPipeline=N.gameplayPipelineDiagnostics('NOT A REAL COUNTRY');
assert.equal(unresolvedPipeline.diagnosticScope,'UNRESOLVED');
assert.equal(unresolvedPipeline.countryCount,0,
  'an invalid explicit country scope must not silently start the global scan');

// Capacity exhaustion is queued for a later turn instead of being reported as a permanent route blockade.
const industrialRuntimeSource=fs.readFileSync('omega_resource_industrial_network_v1.js','utf8');
assert.match(industrialRuntimeSource,/waitForCapacity=String\(reason\)\.toUpperCase\(\)==='TRANSPORT_CAPACITY_EXHAUSTED'/);
assert.match(industrialRuntimeSource,/flow\.blockReason=null;flow\.lastResidualBlockReason=null;flow\.transportQueueReason=null;/);
assert.match(industrialRuntimeSource,/awaitingTransportCapacity/);

// Decommissioning is an explicit, country-scoped action that stops future cycles
// while preserving the physical asset record and historical production ledgers.
const decommissionAsset = {
  id:'FAC-DECOMMISSION-TEST',
  factoryType:'STEEL_AND_ALLOY_WORKS',
  status:'OPERATIONAL',
  capacityPerDay:100,
  inputBatchLots:[{
    batchId:'INPUT:DECOMMISSION-TEST',
    resourceId:'iron_ore',
    quantity:20,
    remainingQuantity:20,
    status:'AVAILABLE',
    cycleReservationId:'CYCLE-DECOMMISSION-TEST',
    cycleReservedQuantity:20,
    cycleReservedResourceId:'iron_ore',
    cycleReservedTurn:43
  }]
};
context.Game.state.economy.BGD.productionAssets.push(decommissionAsset);
const decommissionNetwork = context.Game.state.resource.BGD.industrialNetwork;
decommissionNetwork.factoryProductionCycles = decommissionNetwork.factoryProductionCycles || {};
decommissionNetwork.factoryProductionCycleHistory = decommissionNetwork.factoryProductionCycleHistory || [];
decommissionNetwork.factoryProductionCycles[decommissionAsset.id] = {
  cycleId:'CYCLE-DECOMMISSION-TEST',
  countryId:'BGD',
  factoryId:decommissionAsset.id,
  status:'IN_PROGRESS',
  productionQuantity:20,
  startTurn:43
};
decommissionAsset.activeProductionCycleId = 'CYCLE-DECOMMISSION-TEST';
const confirmation = N.decommissionFactory({countryId:'BGD',factoryId:decommissionAsset.id});
assert.equal(confirmation.status,'CONFIRMATION_REQUIRED');
assert.equal(decommissionAsset.status,'OPERATIONAL','missing confirmation must not alter the factory');
const decommissionResult = N.decommissionFactory({
  countryId:'BGD',factoryId:decommissionAsset.id,confirmed:true
});
assert.equal(decommissionResult.status,'DECOMMISSIONED');
assert.equal(decommissionAsset.status,'DECOMMISSIONED');
assert.equal(decommissionAsset.productionHealth.status,'STOPPED');
assert.equal(decommissionAsset.productionHealth.reason,'FACTORY_DECOMMISSIONED_BY_PLAYER');
assert.equal(decommissionAsset.activeProductionCycleId,null);
assert.equal(decommissionNetwork.factoryProductionCycles[decommissionAsset.id],undefined,
  'an active cycle must not remain eligible after decommissioning');
assert.equal(decommissionNetwork.factoryProductionCycleHistory.at(-1).status,'CANCELLED');
assert.equal(decommissionAsset.inputBatchLots[0].cycleReservationId,undefined,
  'reserved input batches must be released when a cycle is cancelled');
assert.equal(decommissionAsset.inputBatchLots[0].remainingQuantity,20,
  'decommissioning preserves the unconsumed input quantity');
assert.ok(decommissionNetwork.factoryDecommissionHistory.some(row=>row.factoryId===decommissionAsset.id),
  'decommissioning must be auditable without deleting the factory asset record');
assert.equal(N.decommissionFactory({countryId:'BGD',factoryId:decommissionAsset.id,confirmed:true}).idempotent,true,
  'repeated decommission calls must be safe and idempotent');
assert.equal(N.factoryProductionStatus('BGD',decommissionAsset.id).health.status,'STOPPED');


// Mine decommissioning stops future extraction while preserving the site, batches and history.
context.Game.state.simulation.session = { playerCountryId:'BGD' };
const foreignMineAsset = {
  id:'MINE-FOREIGN-DECOMMISSION-TEST',
  siteId:'SITE_USA_COAL_01',
  resourceId:'coal',
  status:'OPERATIONAL'
};
context.Game.state.resource.USA = { mineAssets:[foreignMineAsset] };
const foreignDecommission = N.decommissionMine({
  countryId:'USA',siteId:'SITE_USA_COAL_01',confirmed:true
});
assert.equal(foreignDecommission.status,'BLOCKED');
assert.equal(foreignDecommission.reason,'PLAYER_COUNTRY_SCOPE_VIOLATION');
assert.equal(foreignMineAsset.status,'OPERATIONAL','a view/action for another country must not mutate its mine');
const mineAssetForDecommission = {
  id:'MINE-DECOMMISSION-TEST',
  siteId:'SITE_BGD_COAL_01',
  resourceId:'coal',
  status:'OPERATIONAL',
  workersCommitted:240,
  constructionCostUsd:48000000
};
context.Game.state.resource.BGD.mineAssets = [mineAssetForDecommission];
const mineRawStockBefore = context.Game.state.resource.BGD.warehouse.availableByResource.coal;
const mineDecommissionConfirmation = N.decommissionMine({
  countryId:'BGD',siteId:'SITE_BGD_COAL_01'
});
assert.equal(mineDecommissionConfirmation.status,'CONFIRMATION_REQUIRED');
assert.equal(mineAssetForDecommission.status,'OPERATIONAL','missing confirmation must not alter the mine');
const mineDecommissionResult = N.decommissionMine({
  countryId:'BGD',siteId:'SITE_BGD_COAL_01',confirmed:true
});
assert.equal(mineDecommissionResult.status,'DECOMMISSIONED');
assert.equal(mineAssetForDecommission.status,'DECOMMISSIONED');
assert.equal(mineAssetForDecommission.productionStatus,'STOPPED');
assert.equal(context.Game.state.resource.BGD.mineAssets.length,1,'the physical mine asset record must be retained');
assert.equal(context.Game.state.resource.BGD.warehouse.availableByResource.coal,mineRawStockBefore,
  'mine demolition must not delete raw warehouse stock');
assert.ok(context.Game.state.resource.BGD.industrialNetwork.mineDecommissionHistory.some(row=>row.siteId==='SITE_BGD_COAL_01'),
  'mine shutdown must be auditable');
assert.equal(N.decommissionMine({countryId:'BGD',siteId:'SITE_BGD_COAL_01',confirmed:true}).idempotent,true,
  'repeated demolition is safe and idempotent');
const decommissionedSource = fs.readFileSync('omega_resource_industrial_network_v1.js','utf8');
assert.match(decommissionedSource,/reason:'MINE_DECOMMISSIONED'/);
const endowmentDecommissionGuard = fs.readFileSync('omega_resource_endowment_runtime.js','utf8');
assert.match(endowmentDecommissionGuard,/decommissionedSiteIds/,'selected-country production must skip decommissioned mine sites');

// Android 9 regression: lazily initialize turn-scoped utility and transport ledgers
// without relying on object-spread behavior in the WebView compatibility path.
context.Game.state.simulation.turn = Math.max(1, Number(context.Game.state.simulation.turn) || 1);
const utilityCountryState = context.Game.state.resource.USA;
utilityCountryState.industrialNetwork = {
  utilityLedger: { schemaVersion:'1.0.0', turns:{} },
  transportCapacityLedger: { schemaVersion:'1.0.0', turns:{} }
};
assert.doesNotThrow(() => N.factoryUtilityDiagnostics('USA'),
  'factory utility diagnostics must initialize empty turn ledgers safely');
assert.equal(utilityCountryState.industrialNetwork.infrastructure.baselineInitialized, true,
  'diagnostics must restore a missing infrastructure bucket without discarding the turn ledgers');
assert.ok(utilityCountryState.industrialNetwork.infrastructure.nodes &&
  utilityCountryState.industrialNetwork.infrastructure.edges &&
  utilityCountryState.industrialNetwork.infrastructure.corridors,
  'partial infrastructure state must regain the canonical nested route ledgers');
const utilityTurnKey = String(context.Game.state.simulation.turn);
const utilityLedgerTurn = utilityCountryState.industrialNetwork.utilityLedger.turns[utilityTurnKey];
const transportLedgerTurn = utilityCountryState.industrialNetwork.transportCapacityLedger.turns[utilityTurnKey];
assert.ok(utilityLedgerTurn, 'the current utility ledger turn must be created');
assert.equal(utilityLedgerTurn.used.electricityMWh, 0);
assert.equal(utilityLedgerTurn.used.waterM3, 0);
assert.equal(utilityLedgerTurn.transactions.length, 0);
assert.ok(transportLedgerTurn, 'the current transport ledger turn must be created');
assert.equal(Object.keys(transportLedgerTurn.usedByMode).length, 0);
assert.equal(transportLedgerTurn.shipments.length, 0);

console.log('OMEGA RESOURCE INDUSTRIAL NETWORK V1 TEST PASSED');


// Regression: a factory commissioned for one mine must not drain older, same-resource
// stock from another mine just because the country warehouse is FIFO-sorted.
{
  const countryId='NPL';
  const boundSiteId='SITE_NPL_BOUND_IRON_MINE';
  const unrelatedSiteId='SITE_NPL_UNRELATED_IRON_MINE';
  const unrelatedBatchId='BATCH-NPL-UNRELATED-IRON';
  const boundBatchId='BATCH-NPL-BOUND-IRON';
  const makeBatch=(batchId,siteId,quantity,createdTurn)=>({
    batchId,resourceId:'iron_ore',quantity,remainingQuantity:quantity,unit:'TONNES',
    stage:'RAW_EXTRACTED',status:'AVAILABLE',countryId,sourceCountryId:countryId,
    warehouseId:'WH-'+countryId+'-RAW',siteReferenceKey:siteId,
    occurrenceKey:'SITE_RUNTIME:'+countryId+':'+siteId+':iron_ore',
    sourceBatchIds:[],createdTurn
  });
  const unrelated=makeBatch(unrelatedBatchId,unrelatedSiteId,10,1);
  const bound=makeBatch(boundBatchId,boundSiteId,5,2);
  context.Game.state.resource[countryId]={
    inventory:{iron_ore:15},
    warehouse:{warehouseId:'WH-'+countryId+'-RAW',countryId,
      availableByResource:{iron_ore:15},reservedByResource:{iron_ore:0},
      storedBatchIds:[unrelatedBatchId,boundBatchId]},
    batches:[unrelated,bound],
    inventoryLots:{
      [unrelatedBatchId]:{...unrelated,status:'AVAILABLE'},
      [boundBatchId]:{...bound,status:'AVAILABLE'}
    },
    industrialNetwork:{
      siteFlowLedger:[
        {batchId:unrelatedBatchId,siteId:unrelatedSiteId,countryId,resourceId:'iron_ore'},
        {batchId:boundBatchId,siteId:boundSiteId,countryId,resourceId:'iron_ore'}
      ],
      shipments:[],deliveries:[],factoryInputTransfers:[],factoryProductionCycles:{}
    }
  };
  const boundFactory={
    id:'FAC-SIM:'+countryId+':'+boundSiteId+':iron_ore',countryId,
    sourceSiteId:boundSiteId,factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',
    capacityPerDay:5,inputCoefficients:{iron_ore:1},inputInventory:{},inputBatchLots:[],
    status:'OPERATIONAL'
  };
  const recipe={inputs:{iron_ore:1},outputs:{IRON_CONCENTRATE:.8},inputUnit:'TONNES'};
  const boundTransfer=N.transferFactoryInputsFromWarehouse(countryId,boundFactory,recipe);
  assert.equal(boundTransfer.transferCount,1,'source-bound factory should receive one matching mine batch');
  assert.equal(boundTransfer.transfers[0].sourceBatchId,boundBatchId,
    'source-bound factory must not pull older stock from a different mine');
  assert.equal(unrelated.remainingQuantity,10,'unrelated mine batch must remain untouched');
  assert.equal(bound.remainingQuantity,0,'the destination mine batch should be transferred once');
  assert.equal(boundFactory.inputBatchLots.length,1);
  assert.deepEqual(Array.from(boundFactory.inputBatchLots[0].sourceBatchIds),[boundBatchId]);
  assert.equal(context.Game.state.resource[countryId].inventory.iron_ore,10);
  assert.equal(context.Game.state.resource[countryId].warehouse.availableByResource.iron_ore,10);

  // Non-bound factories continue using the shared sovereign warehouse.
  const pooledFactory={
    id:'FAC-POOL:'+countryId+':iron_ore',countryId,
    factoryType:'UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT',
    capacityPerDay:5,inputCoefficients:{iron_ore:1},inputInventory:{},inputBatchLots:[],
    status:'OPERATIONAL'
  };
  const pooledTransfer=N.transferFactoryInputsFromWarehouse(countryId,pooledFactory,recipe);
  assert.equal(pooledTransfer.transferCount,1,'generic factory must retain shared warehouse behavior');
  assert.equal(pooledTransfer.transfers[0].sourceBatchId,unrelatedBatchId);
  assert.equal(unrelated.remainingQuantity,5);
  console.log('OMEGA MINE-BOUND FACTORY INPUT ISOLATION PASSED');
}


{
  // Fleet identity is aggregate country + mine/site + transport mode + count.
  // No registration/plate/individual vehicle IDs are ever persisted.
  const fleetCountry='BGD',fleetSiteId='SITE_FLEET_DYNAMIC_TEST';
  const fleetSite={siteId:fleetSiteId,countryId:fleetCountry,real:{resourceId:'coal'},simulation:{transportRoute:[]}};
  const fleetFactory={id:'FAC-FLEET-DYNAMIC-TEST',countryId:fleetCountry,transportAccess:['truck'],
    inputCoefficients:{coal:1},outputProfile:{COAL_CONCENTRATE:0.85,COAL_REJECT:0.15}};
  const input={countryId:fleetCountry,sourceSiteId:fleetSiteId,transportMode:'truck',unit:'TONNES'};
  const baseline=N.buildRoute(fleetSite,fleetFactory,'coal',50000,input);
  assert.equal(baseline.status,'PLANNED');
  assert.equal(baseline.vehiclePlan[0].fleetCountConfigured,false,
    'missing aggregate fleet must preserve the explicit simulated-capacity fallback');
  const first=N.addTransportFleet({countryId:fleetCountry,siteId:fleetSiteId,transportMode:'truck',count:1});
  assert.equal(first.status,'UPDATED');
  const oneTruck=N.buildRoute(fleetSite,fleetFactory,'coal',50000,input);
  assert.equal(oneTruck.vehiclePlan[0].fleetCountConfigured,true);
  assert.equal(oneTruck.vehiclePlan[0].fleetTotalUnits,1);
  assert.ok(oneTruck.dispatchQuantity<baseline.dispatchQuantity,
    'one recorded truck must constrain dispatch capacity versus the unconfigured simulated fallback');
  assert.ok(oneTruck.travelTimeDays>baseline.travelTimeDays,
    'finite truck count must increase trip waves and calculated travel time');
  const added=N.addTransportFleet({countryId:fleetCountry,siteId:fleetSiteId,transportMode:'truck',count:3});
  assert.equal(added.status,'UPDATED');
  const fourTrucks=N.buildRoute(fleetSite,fleetFactory,'coal',50000,input);
  assert.equal(fourTrucks.vehiclePlan[0].fleetTotalUnits,4);
  assert.equal(fourTrucks.vehiclePlan[0].loadsRequired,
    Math.ceil(50000/Math.max(0.001,Number(fourTrucks.vehiclePlan[0].payloadTonnes)||1)));
  assert.ok(fourTrucks.dispatchQuantity>oneTruck.dispatchQuantity,
    'adding aggregate vehicles must raise recalculated per-turn dispatch capacity');
  assert.ok(fourTrucks.travelTimeDays<oneTruck.travelTimeDays,
    'adding aggregate vehicles must reduce trip waves and transit duration for future route plans');
  const status=N.transportFleetStatus(fleetCountry,fleetSiteId);
  assert.equal(status.modes.truck.totalUnits,4);
  assert.equal(status.vehicleIdentifiersStored,false);
  assert.doesNotMatch(JSON.stringify(status),/\"(?:registrationNumber|registrationId|vehicleId|licensePlate)\"/i,
    'aggregate fleet records must not contain individual vehicle registration fields');
  const removed=N.removeTransportFleet({countryId:fleetCountry,siteId:fleetSiteId,transportMode:'truck',count:4});
  assert.equal(removed.status,'UPDATED');
  const zeroFleet=N.buildRoute(fleetSite,fleetFactory,'coal',50000,input);
  assert.equal(zeroFleet.status,'BLOCKED','an explicitly configured empty fleet must block dispatch');
  assert.equal(zeroFleet.dispatchQuantity,0);
  assert.equal(N.transportFleetStatus(fleetCountry,fleetSiteId).modes.truck.totalUnits,0);
  console.log('OMEGA AGGREGATE TRANSPORT FLEET DYNAMIC CAPACITY PASSED');
}


{
  const siteId='SITE_FLEET_NOT_CONFIGURED_REMOVE_TEST';
  assert.equal(N.transportFleetStatus('BGD',siteId).status,'UNCONFIGURED');
  const removal=N.removeTransportFleet({countryId:'BGD',siteId,transportMode:'truck',count:1});
  assert.equal(removal.status,'BLOCKED');
  assert.equal(removal.reason,'FLEET_NOT_CONFIGURED');
  assert.equal(N.transportFleetStatus('BGD',siteId).status,'UNCONFIGURED',
    'a rejected removal must not turn unknown simulated capacity into a configured zero-unit fleet');
}
