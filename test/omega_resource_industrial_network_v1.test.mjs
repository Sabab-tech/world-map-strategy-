import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog=JSON.parse(fs.readFileSync('resource_industrial_catalog_v1.json','utf8'));
const context={
  console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Promise,Intl,
  OmegaResourceIndustrialCatalogData:catalog,
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
      simulation:{turn:1,startYear:2015,date:'2015-01-01',daysPerTurn:30},
      resource:{BGD:{inventory:{coal:50000,iron_ore:50000},warehouse:{availableByResource:{coal:50000,iron_ore:50000},reservedByResource:{}},technologyCapabilities:[]}},
      economy:{BGD:{unemploymentCount:600000,laborForce:6000000,unemployment_rate:10,productionAssets:[]}},
      transport:{BGD:{infrastructure:{roads:{capacityPerDay:50000,quality:.9},rail:{capacityPerDay:120000,quality:.8},ports:{capacityPerDay:200000,quality:.9},bridges:{capacityPerDay:50000,quality:.8},pipelines:{capacityPerDay:400000,quality:.8},
        utilitySupply:{electricityMWhPerDay:1000000,waterM3PerDay:1000000,authority:'TEST_FIXTURE',status:'AVAILABLE',simulationOnly:true,assets:[]}}}},
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
assert.equal(plan.route.sourceSiteId,'SITE_BGD_COAL_01','shipment retains the originating mine identity');
assert.equal(plan.route.sourceWarehouseId,'WH-BGD-RAW','factory transport must start from the sovereign raw warehouse');
assert.equal(plan.route.sourceNode,'WAREHOUSE:BGD:RAW','mine-to-warehouse extraction must not be mislabeled as the warehouse-to-factory leg');

const sent=N.dispatchShipment({countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:5000,transportMode:'rail'});
assert.equal(sent.status,'DISPATCHED');
assert.equal(context.Game.state.resource.BGD.warehouse.reservedByResource.coal,5000);

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
    return{status:'APPLIED',result:{accepted:true,records:[record]}};
  }
};
const siteRun=await N.executeSitePipeline({countryId:'BGD',siteId:'SITE_BGD_COPPER_01',resourceId:'copper',autoCommissionFactory:true,transportMode:'rail'});
assert.equal(siteRun.status,'IN_TRANSIT','a selected resource site must commit extraction and dispatch a real shipment record');
assert.equal(siteRun.extractionStatus,'COMMITTED');
assert.equal(siteRun.batchId,'BATCH-E2E-COPPER');
assert.ok(siteRun.extractionPlanId,'industrial extraction planner must be part of the same site action');
assert.ok(siteRun.shipmentId,'shipment must be persisted in the country industrial network');
assert.equal(siteRun.factoryBootstrapStatus,'CREATED_SIMULATION_ONLY','fallback processing capacity must be clearly marked simulation-only');
assert.equal(context.Game.state.resource.BGD.industrialNetwork.siteExecutions[0].siteId,'SITE_BGD_COPPER_01');
advanceToGameTurn(context.Game.state,siteRun.shipment.etaTurn);
const copperDelivery=N.advanceShipments('BGD');
assert.equal(copperDelivery.delivered,1);
assert.equal(copperDelivery.shipments[0].processingStatus,'IN_PROGRESS',
  'site extraction delivery must schedule production instead of bypassing cycle timing');
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
const copperDeliveryRow=context.Game.state.resource.BGD.industrialNetwork.deliveries.find(x=>String(x.shipmentId)===String(siteRun.shipmentId));
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
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironRawBefore+1200,
  'freshly extracted iron is recorded in the country warehouse before transport arrival');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.reservedByResource.iron_ore),1200,
  'the real shipment reserves the raw batch during transit');
advanceToGameTurn(context.Game.state,builtFactoryRun.shipment.etaTurn);
const builtDeliveryResult=N.advanceShipments('BGD');
const builtDelivery=(builtDeliveryResult.shipments||[]).find(row=>String(row.shipmentId)===String(builtFactoryRun.shipmentId));
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
  .find(row=>String(row.shipmentId)===String(builtFactoryRun.shipmentId));
assert.ok(builtDeliveryAfterCycle,'the persisted delivered-input ledger row must survive cycle completion');
assert.equal(builtDeliveryAfterCycle.processingStatus,'PROCESSED',
  'the delivered input record must reconcile with the actual factory cycle');
context.Game.state.economy.BGD.productionAssets.forEach((asset,index)=>{
  if(factoryStatusSnapshot[index]===undefined)delete asset.status;
  else asset.status=factoryStatusSnapshot[index];
});

// A normal gameplay site action must not manufacture a free simulation factory.
// It commits the extracted batch to the sovereign raw warehouse and reports that the
// country needs a real commissioned compatible factory.
context.Game.state.simulation.turn=Number(context.Game.state.simulation.turn||0)+1;
const assetsBeforeWaiting=context.Game.state.economy.BGD.productionAssets.length;
const factoriesForWaiting=context.Game.state.economy.BGD.productionAssets;
const originalFactoryStatuses=factoriesForWaiting.map(asset=>asset.status);
factoriesForWaiting.forEach(asset=>{asset.status='CLOSED';});
const ironWarehouseBefore=Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore)||0;
const waitingForFactory=await N.executeSitePipeline({
  countryId:'BGD',siteId:'SITE_BGD_IRON_01',resourceId:'iron_ore',transportMode:'rail'
});
assert.equal(waitingForFactory.status,'EXTRACTED_AWAITING_FACTORY',JSON.stringify(waitingForFactory));
assert.equal(waitingForFactory.batchId,'BATCH-E2E-IRON');
assert.equal(Number(context.Game.state.resource.BGD.warehouse.availableByResource.iron_ore),ironWarehouseBefore+1200,
  'unrouted extracted raw material remains in the sovereign warehouse and is credited exactly once');
assert.equal(context.Game.state.economy.BGD.productionAssets.length,assetsBeforeWaiting,
  'a missing compatible factory must not be fabricated by a normal mine action');
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
context.Omega.Simulation.clock.turn=43;
// Industrial ledgers use the shared Game simulation state as the canonical turn source.
context.Game.state.simulation.turn=43;
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
const sharedTransport=context.Game.state.resource.BGD.industrialNetwork.transportCapacityLedger.turns['43'];
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

// Mixed-case legacy ledger regression: reserve and delivery must use the existing
// warehouse key, debit exactly once, and never create a duplicate lowercase bucket.
const caseState=context.Game.state.resource.BGD;
const caseWarehouse=caseState.warehouse;
const caseQuantity=137.25;
const sumAndRekey=(map,canonicalKey)=>{
  const keys=Object.keys(map).filter(key=>String(key).toLowerCase()===canonicalKey.toLowerCase());
  const total=keys.reduce((sum,key)=>sum+(Number(map[key])||0),0);
  for(const key of keys)delete map[key];
  map[canonicalKey]=total;
  return total;
};
caseWarehouse.availableByResource=caseWarehouse.availableByResource||{};
caseWarehouse.reservedByResource=caseWarehouse.reservedByResource||{};
const coalAvailableBefore=sumAndRekey(caseWarehouse.availableByResource,'COAL');
const coalReservedBefore=sumAndRekey(caseWarehouse.reservedByResource,'COAL');
const padding=coalReservedBefore+caseQuantity+1;
caseWarehouse.availableByResource.COAL=coalAvailableBefore+padding;
caseState.inventory=caseState.inventory||{};
caseState.inventory.coal=(Number(caseState.inventory.coal)||0)+padding;
const caseBatchId='BATCH:CASE-INSENSITIVE-WAREHOUSE';
const caseBatch={
  batchId:caseBatchId,siteId:'SITE_BGD_COAL_01',countryId:'BGD',resourceId:'coal',
  quantity:caseQuantity,remainingQuantity:caseQuantity,unit:'TONNES',
  warehouseId:'WH-BGD-RAW',stage:'RAW_EXTRACTED',status:'AVAILABLE',
  occurrenceKey:'TEST:CASE-INSENSITIVE-WAREHOUSE',
  provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE',simulationOnly:true}
};
caseState.batches=Array.isArray(caseState.batches)?caseState.batches:[];
caseState.batches.push(caseBatch);
caseState.inventoryLots=caseState.inventoryLots||{};
caseState.inventoryLots[caseBatchId]={...caseBatch};
caseWarehouse.storedBatchIds=Array.isArray(caseWarehouse.storedBatchIds)?caseWarehouse.storedBatchIds:[];
caseWarehouse.storedBatchIds.push(caseBatchId);
// Keep this regression isolated from the shared-turn capacity already consumed by prior tests;
// the production capacity guard remains enabled and unchanged.
context.Game.state.simulation.turn=(Number(context.Game.state.simulation.turn)||1)+1;
const caseRun=N.dispatchShipment({
  countryId:'BGD',siteId:'SITE_BGD_COAL_01',resourceId:'coal',quantity:caseQuantity,
  transportMode:'rail',batchId:caseBatchId,occurrenceKey:caseBatch.occurrenceKey,warehouseId:'WH-BGD-RAW'
});
assert.equal(caseRun.status,'DISPATCHED',JSON.stringify(caseRun));
assert.equal(caseRun.shipment.quantity,caseQuantity);
assert.equal(caseWarehouse.reservedByResource.COAL,coalReservedBefore+caseQuantity,
  'mixed-case dispatch must reserve against the existing canonical resource key');
assert.equal(caseWarehouse.reservedByResource.coal,undefined,
  'dispatch must not create a duplicate lowercase reservation key');
const caseBeforeDeliveryAvailable=Number(caseWarehouse.availableByResource.COAL)||0;
const caseBeforeDeliveryReserved=Number(caseWarehouse.reservedByResource.COAL)||0;
const caseTurnShipments=new Set((caseState.industrialNetwork?.shipments||[])
  .filter(row=>String(row.status)==='IN_TRANSIT').map(row=>String(row.shipmentId)));
advanceToGameTurn(context.Game.state,caseRun.shipment.etaTurn);
const caseDeliveryResult=N.advanceShipments('BGD');
const caseDelivery=(caseDeliveryResult.shipments||[]).find(row=>String(row.shipmentId)===String(caseRun.shipment.shipmentId));
assert.ok(caseDelivery,'mixed-case shipment must be delivered by its shipment ID');
assert.equal(caseDelivery.destinationStatus,'FACTORY_RECEIVED');
const caseAfterDeliveryAvailable=Number(caseWarehouse.availableByResource.COAL)||0;
const caseAfterDeliveryReserved=Number(caseWarehouse.reservedByResource.COAL)||0;
const caseNewCoalDeliveries=(caseDeliveryResult.shipments||[]).filter(row=>
  String(row.resourceId||'').toLowerCase()==='coal'&&String(row.destinationStatus||'').toUpperCase()==='FACTORY_RECEIVED')
  .reduce((sum,row)=>sum+(Number(row.quantity)||0),0);
assert.ok(Math.abs((caseBeforeDeliveryAvailable-caseAfterDeliveryAvailable)-caseNewCoalDeliveries)<1e-5,
  'warehouse available balance must reconcile against all coal deliveries on this turn');
const caseNewInTransitCoal=(caseState.industrialNetwork?.shipments||[]).filter(row=>
  String(row.resourceId||'').toLowerCase()==='coal'&&String(row.status)==='IN_TRANSIT'&&
  !caseTurnShipments.has(String(row.shipmentId)))
  .reduce((sum,row)=>sum+(Number(row.quantity)||0),0);
assert.ok(Math.abs(caseAfterDeliveryReserved-
  (caseBeforeDeliveryReserved-caseNewCoalDeliveries+caseNewInTransitCoal))<1e-5,
  'reserved balance must release delivered stock exactly once while retaining new in-transit reservations');
assert.equal(Number(caseState.batches.find(row=>row.batchId===caseBatchId)?.remainingQuantity),0);
assert.equal(Number(caseState.inventoryLots[caseBatchId]?.remainingQuantity),0);
assert.equal(Object.keys(caseWarehouse.availableByResource).filter(key=>String(key).toLowerCase()==='coal').length,1,
  'the delivery must not create a duplicate case-variant available-stock key');
assert.equal(Object.keys(caseWarehouse.reservedByResource).filter(key=>String(key).toLowerCase()==='coal').length,1,
  'the delivery must not create a duplicate case-variant reserved-stock key');

console.log('OMEGA RESOURCE INDUSTRIAL NETWORK V1 TEST PASSED');
