import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const readJson = file => JSON.parse(readFileSync(new URL('../'+file, import.meta.url), 'utf8'));
const readText = file => readFileSync(new URL('../'+file, import.meta.url), 'utf8');

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

class EventTargetMock {
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const rows=this.listeners.get(type)||[];rows.push(fn);this.listeners.set(type,rows);}
  dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}
}
class CustomEventMock {constructor(type,init={}){this.type=type;this.detail=init.detail;}}

function buildContext(){
  const a=readJson('resources.json'),b=readJson('resources_2.json'),ext=readJson('resource_type_extensions_v1.json');
  const profiles={...(a.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{}),...(b.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{})};
  const deposits=[...(a.runtime_deposits||[]),...(b.runtime_deposits||[])];
  const resourceTypes={...(a.resource_types||{}),...(b.resource_types||{}),...(a.GSRSK_Master_Resource_Data_v14?.resource_types||{}),...(b.GSRSK_Master_Resource_Data_v14?.resource_types||{}),...(ext.resource_types||{}),...(ext.GSRSK_Master_Resource_Data_v14?.resource_types||{})};
  const profileRows=Object.entries(profiles);
  const identity={
    resolveCountry(value){
      const raw=String(value??'').trim().toUpperCase();
      const hit=profileRows.find(([key,row])=>{
        const x=row?.identity||row||{};
        return key.toUpperCase()===raw||String(x.iso3||'').toUpperCase()===raw||String(x.iso2||'').toUpperCase()===raw||String(x.name||'').toUpperCase()===raw;
      });
      return hit?{id:String(hit[1]?.identity?.iso3||hit[1]?.identity?.countryId||hit[0]).toUpperCase(),raw:hit[1]?.identity||hit[1]}:(/^[A-Z]{3}$/.test(raw)?{id:raw,raw:{iso3:raw,countryId:raw}}:null);
    },
    list(){return profileRows.map(([key,row])=>String(row?.identity?.iso3||row?.identity?.countryId||key).toUpperCase());}
  };
  const engine={
    isReady:true,countryProfiles:profiles,deposits,resourceTypes:Object.values(resourceTypes),
    mineSiteReferenceCount:profileRows.reduce((sum,[key,row])=>{
      const p=row?.identity||row||{},sites=p?.resource_infrastructure_context?.mineSites||row?.resource_infrastructure_context?.mineSites||row?.infrastructure_context?.mineSites||[];
      return sum+(Array.isArray(sites)?sites.length:0);
    },0),
    getDataLoadReport(){return{authority:'RESOURCE_JSON',countryProfileCount:profileRows.length,depositCount:deposits.length};},
    normalizeCountryCode(value){return identity.resolveCountry(value)?.id||String(value??'').trim().toUpperCase();}
  };
  const state={simulation:{turn:1,startYear:2025,date:'2025-01-01',daysPerTurn:30},resource:{},economy:{},
    finance:{BGD:{available:1000000,reserves:2000000}},trade:{BGD:{marketPrice:{COAL_CONCENTRATE:100,COAL_REJECT:5}}},transport:{},foreign:{}};
  const events=new EventTargetMock(),handlers=new Map();
  function txFactory(countryId){
    return{
      get(path){
        const parts=String(path).split('.'),domain=parts.shift();let cur=state[domain]?.[countryId];
        for(const part of parts){if(cur==null)return undefined;cur=cur[part];}
        return cur===undefined?undefined:cur;
      },
      set(path,value){
        const parts=String(path).split('.'),domain=parts.shift();state[domain]=state[domain]||{};state[domain][countryId]=state[domain][countryId]||{};
        if(!parts.length){state[domain][countryId]=value;return;}
        let cur=state[domain][countryId];
        for(let i=0;i<parts.length-1;i++){if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};cur=cur[parts[i]];}
        cur[parts[parts.length-1]]=value;
      }
    };
  }
  const interop={
    registerAction(){},
    registerCommandHandler(type,_owner,fn){handlers.set(type,fn);},
    dispatchCommand(_owner,type,countryId,payload={}){
      const fn=handlers.get(type);if(!fn)return{status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND',commandId:'TEST-'+type};
      const result=fn({commandId:'TEST-'+type,payload},{countryId,stateTransaction:txFactory(countryId)});
      return{status:result?.accepted===false?'REJECTED':'APPLIED',result,commandId:'TEST-'+type};
    },
    emitEvent(type,countryId,source,payload,meta){
      events.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,source,payload,meta}}));
      return true;
    }
  };
  const fetchLocal=async url=>{
    const clean=String(url).split('?')[0].replace(/^\.\//,'').replace(/^\/+/,'');
    try{
      const data=JSON.parse(readFileSync(new URL('../'+clean,import.meta.url),'utf8'));
      return{ok:true,status:200,json:async()=>data};
    }catch(_){return{ok:false,status:404,json:async()=>{throw new Error('LOCAL_TEST_FIXTURE_NOT_FOUND:'+clean);}};}
  };
  const manifest=readJson('resource_site_reference_expanded_manifest.json');
  const losslessSites=[];
  for(const part of manifest.parts||[]){
    const pack=readJson(part.file);for(const site of pack.sites||[])losslessSites.push(site);
  }
  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,CustomEvent:CustomEventMock,
    fetch:fetchLocal,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    Game:{state},gameState:state,Omega:{MinistryInteroperability:interop,CanonicalIdentity:identity},
    OmegaMinistryInteroperability:interop,OmegaCanonicalIdentityRegistry:identity,ResourceMinistryEngine:engine,
    OmegaResourceSiteMasterResearchData:readJson('resource_site_master_registry_v1.json'),
    OmegaResourceSiteCanonicalCatalogData:readJson('resource_site_canonical_catalog_v1.json'),
    OmegaResourceSiteReserveSimulationData:readJson('resource_site_reserve_simulation_v1.json'),
    OmegaResourceSiteResearchEvidenceData:readJson('resource_site_research_evidence_v1.json'),
    OmegaResourceSiteCountryExpansionData:readJson('resource_site_country_expansion_v1.json'),
    OmegaResourceLosslessReferenceData:{siteCount:losslessSites.length,sites:losslessSites},
    OmegaResourceIndustrialCatalogData:readJson('resource_industrial_catalog_v1.json')
  };
  context.Omega.ResourceSiteMasterResearchData=context.OmegaResourceSiteMasterResearchData;
  context.Omega.ResourceSiteCanonicalCatalogData=context.OmegaResourceSiteCanonicalCatalogData;
  context.Omega.ResourceSiteReserveSimulationData=context.OmegaResourceSiteReserveSimulationData;
  context.Omega.ResourceSiteResearchEvidenceData=context.OmegaResourceSiteResearchEvidenceData;
  context.Omega.ResourceSiteCountryExpansionData=context.OmegaResourceSiteCountryExpansionData;
  context.Omega.ResourceLosslessReferenceData=context.OmegaResourceLosslessReferenceData;
  context.Omega.ResourceIndustrialCatalogData=context.OmegaResourceIndustrialCatalogData;
  context.globalThis=context;
  vm.createContext(context);
  return{context,state,events,identity,engine,handlers};
}

test('real site extraction flows through raw warehouse, transport, factory, finished goods, market and treasury',async()=>{
  const h=buildContext(),g=h.context,state=h.state;
  const modules=[
    'omega_resource_part04_identity_runtime.js',
    'omega_resource_part05_reserve_extraction_runtime.js',
    'omega_resource_production_model_v2.js',
    'omega_resource_site_integrity_v1.js',
    'omega_resource_scenario_engineering_data_v1.js',
    'omega_resource_realism_runtime_v1.js',
    'omega_resource_country_boundary_guard.js',
    'omega_resource_endowment_runtime.js',
    'omega_resource_industrial_network_v1.js',
    'omega_resource_economy_runtime_v2.js'
  ];
  for(const file of modules)vm.runInContext(readText(file),g,{filename:file});
  const endowment=g.OmegaResourceEndowmentRuntime||g.Omega?.ResourceEndowmentRuntime;
  const industry=g.OmegaResourceIndustrialNetwork||g.Omega?.ResourceIndustrialNetwork;
  const economy=g.OmegaResourceEconomy||g.Omega?.ResourceEconomy;
  assert.ok(endowment&&industry&&economy,'real Endowment, Industrial and Economy runtimes must load');
  const init=await endowment.initialize();
  assert.equal(init.status,'READY',JSON.stringify(init));
  const canonical=g.OmegaResourceSiteCanonicalCatalogData;
  const eligible=(canonical.sites||[]).filter(x=>{
    const country=String(x.countryId||x.identity?.countryIso3||'').toUpperCase();
    const resource=String(x.identity?.resourceTypeId||x.real?.resourceId||x.sourceSiteRecord?.resourceId||'').toLowerCase();
    return country==='BGD'&&resource.includes('coal')&&x.map?.markerEligible!==false&&!x.runtime?.aliasOfSiteId&&x.operation?.commercialExtraction!==false;
  });
  const site=eligible.find(x=>/barapukuria/i.test(String(x.siteName||'')))||eligible[0];
  assert.ok(site,'canonical Bangladesh coal site must be present and executable');
  const hydration=await endowment.hydrateCountry('BGD');
  assert.equal(hydration.status,'APPLIED',JSON.stringify(hydration));
  assert.notEqual(hydration.result?.accepted,false,JSON.stringify(hydration));
  // Explicit simulation fixture: workforce and utility supply must be recorded before production.
  state.economy.BGD=state.economy.BGD||{productionAssets:[]};
  state.economy.BGD.unemploymentCount=100000;
  state.economy.BGD.laborForce=1000000;
  state.economy.BGD.unemployment_rate=10;
  state.transport.BGD=state.transport.BGD||{};
  state.transport.BGD.infrastructure=state.transport.BGD.infrastructure||{
    roads:{capacityPerDay:40000,quality:.9},rail:{capacityPerDay:90000,quality:.9},
    ports:{capacityPerDay:180000,quality:.9},bridges:{capacityPerDay:45000,quality:.9},
    pipelines:{capacityPerDay:350000,quality:.9}
  };
  state.transport.BGD.infrastructure.utilitySupply={electricityMWhPerDay:1000000,waterM3PerDay:1000000,
    authority:'TEST_FIXTURE',status:'AVAILABLE',simulationOnly:true,assets:[]};
  state.simulation.playerCountryId='BGD';
  const countryRouteLoad=await industry.loadSiteLogisticsRoutes('BGD');
  assert.equal(countryRouteLoad.status,'READY',JSON.stringify(countryRouteLoad));
  assert.equal(countryRouteLoad.routeCount,4,'only Bangladesh route shard should be loaded');
  const siteRuntimes=state.resource.BGD.industrialNetwork.siteLogisticsBySiteId;
  assert.equal(Object.keys(siteRuntimes).length,4,'every site in the selected-country shard gets an independent runtime ledger');
  assert.ok(Object.values(siteRuntimes).every(row=>row.status==='IDLE'&&row.runtimeActive===false),
    'route registration must not automatically run every mine');
  const foreignStateBeforeTick=state.resource.KWT;
  const foreignTick=industry.advanceShipments('KWT');
  assert.equal(foreignTick.status,'SKIPPED','a non-selected country must not advance logistics');
  assert.equal(state.resource.KWT,foreignStateBeforeTick,'the non-selected country must not be hydrated or mutated');
  const rawInventoryBeforeMinePipeline=Number(state.resource.BGD?.inventory?.coal)||0;
  const rawWarehouseBeforeMinePipeline=Number(state.resource.BGD?.warehouse?.availableByResource?.coal)||0;
  const run=await industry.executeSitePipeline({countryId:'BGD',siteId:site.siteId,resourceId:'coal',autoCommissionFactory:true,transportMode:'rail'});
  assert.equal(run.status,'IN_TRANSIT',JSON.stringify(run));
  assert.equal(run.extractionStatus,'COMMITTED');
  assert.ok(run.batchId&&run.shipmentId&&run.extractionPlanId);
  assert.equal(run.shipment.shipmentType,'MINE_TO_WAREHOUSE','mine output must travel as a separate first-leg shipment');
  const resource=state.resource.BGD;
  assert.ok(resource,'raw resource state must be committed to Bangladesh');
  const sourceBatch=resource.batches.find(x=>String(x.batchId)===String(run.batchId));
  assert.ok(sourceBatch,'extraction must create a real central batch');
  assert.ok(resource.inventoryLots[run.batchId],'extraction must create a real inventory lot');
  assert.equal(sourceBatch.countryId,'BGD');
  assert.equal(sourceBatch.destinationWarehouseId,'WH-BGD-RAW');
  assert.equal(sourceBatch.warehouseId,null,'a mine-haul batch must not claim warehouse location before receipt');
  assert.equal(resource.warehouse.countryId,'BGD');
  const initialSourceQuantity=Number(sourceBatch.remainingQuantity);
  assert.ok(initialSourceQuantity+1e-6>=Number(run.quantity));
  assert.equal(sourceBatch.stage,'MINE_TO_WAREHOUSE_IN_TRANSIT');
  assert.equal(resource.inventoryLots[run.batchId].stage,'MINE_TO_WAREHOUSE_IN_TRANSIT');
  assert.equal(resource.industrialNetwork.siteLogisticsBySiteId[site.siteId].status,'IN_TRANSIT_TO_WAREHOUSE');
  assert.equal(resource.industrialNetwork.siteLogisticsBySiteId[site.siteId].runtimeActive,true,'the selected mine runtime must be active while its haul is moving');
  const initialFlow=resource.industrialNetwork.siteFlowLedger.find(row=>String(row.batchId)===String(run.batchId));
  assert.ok(initialFlow,'the mine flow must have its own authoritative batch ledger row');
  assert.ok(Math.abs((Number(initialFlow.mineHeldQuantity)||0)-(initialSourceQuantity-Number(run.shipment.quantity)))<1e-5,
    'unshipped batch balance must remain reserved at the mine, not in warehouse availability');
  assert.ok(Math.abs((Number(resource.inventory.coal)||0)-rawInventoryBeforeMinePipeline)<1e-5,
    'the whole batch must leave country inventory exactly once at first-leg dispatch');
  assert.ok(Math.abs((Number(resource.warehouse.availableByResource.coal)||0)-rawWarehouseBeforeMinePipeline)<1e-5,
    'the whole batch must leave raw-warehouse availability until its individual arrival receipts');
  assert.equal(resource.industrialNetwork.siteLogisticsBySiteId[site.siteId].activeShipmentId,run.shipmentId);
  const mineDispatchQuantity=Number(run.shipment.quantity);
  const rawStockBeforeMineArrival=Number(resource.inventory.coal)||0;
  const rawWarehouseBeforeMineArrival=Number(resource.warehouse.availableByResource.coal)||0;
  assert.ok(rawStockBeforeMineArrival+1e-6<mineDispatchQuantity,
    'cargo must not remain available in the source inventory while the mine haul is in transit');
  assert.ok(rawWarehouseBeforeMineArrival+1e-6<mineDispatchQuantity,
    'cargo must not be pre-credited to raw warehouse inventory before the mine receipt');
  state.simulation.playerCountryId=null;
  const noPlayerTick=industry.advanceShipments('BGD');
  assert.equal(noPlayerTick.status,'SKIPPED','mine logistics must pause when no player country is selected');
  assert.equal(resource.industrialNetwork.shipments.find(x=>String(x.shipmentId)===String(run.shipmentId))?.status,'IN_TRANSIT',
    'an unselected-country tick must not advance a mine shipment');
  state.simulation.playerCountryId='BGD';
  advanceToGameTurn(state,run.shipment.etaTurn);
  const mineAdvanced=await industry.advanceShipments('BGD');
  assert.ok(mineAdvanced.mineDelivered>=1,JSON.stringify(mineAdvanced));
  const mineReceipt=resource.warehouse.receipts.find(x=>String(x.receiptId)==='MINE-WH-REC:'+String(run.shipmentId));
  assert.ok(mineReceipt,'mine shipment must post an idempotent raw-warehouse receipt');
  assert.equal(mineReceipt.receivedFrom,'MINE_SITE_LOGISTICS');
  assert.equal(mineReceipt.status,'RECEIVED');
  const flowAfterMineReceipt=resource.industrialNetwork.siteFlowLedger.find(row=>String(row.batchId)===String(run.batchId));
  if((Number(flowAfterMineReceipt?.mineHeldQuantity)||0)>1e-6){
    assert.equal(sourceBatch.stage,'PARTIALLY_IN_RAW_INVENTORY');
    assert.equal(sourceBatch.warehouseId,null,'a batch split between mine-held and warehouse stock has no single warehouse location');
    assert.equal(resource.inventoryLots[run.batchId].stage,'PARTIALLY_IN_RAW_INVENTORY');
  }else{
    assert.equal(sourceBatch.stage,'RAW_INVENTORY');
    assert.equal(sourceBatch.warehouseId,'WH-BGD-RAW');
    assert.equal(resource.inventoryLots[run.batchId].stage,'RAW_INVENTORY');
  }
  const factoryShipment=(resource.industrialNetwork.shipments||[]).find(x=>String(x.batchId)===String(run.batchId)&&
    x.shipmentType==='RAW_TO_FACTORY'&&String(x.status)==='IN_TRANSIT');
  assert.ok(factoryShipment,'factory shipment must only start after the mine haul receipt');
  assert.equal(factoryShipment.siteId,site.siteId);
  const siteRuntime=resource.industrialNetwork.siteLogisticsBySiteId[site.siteId];
  assert.equal(siteRuntime.runtimeActive,true,'the same mine runtime must transition to its factory-bound haul');
  assert.equal(siteRuntime.activeShipmentId,factoryShipment.shipmentId);
  const rawStockBeforeDelivery=Number(resource.inventory.coal)||0;
  const rawWarehouseBeforeDelivery=Number(resource.warehouse.availableByResource.coal)||0;
  const rawReservationBeforeDelivery=Number(resource.warehouse.reservedByResource.coal)||0;
  const inTransitBeforeDelivery=new Set((resource.industrialNetwork?.shipments||[])
    .filter(x=>String(x.resourceId)==='coal'&&String(x.status)==='IN_TRANSIT').map(x=>String(x.shipmentId)));
  assert.ok(rawStockBeforeDelivery+1e-6>=Number(factoryShipment.quantity));
  assert.ok(rawWarehouseBeforeDelivery+1e-6>=Number(factoryShipment.quantity));
  assert.ok(rawReservationBeforeDelivery+1e-6>=Number(factoryShipment.quantity));
  advanceToGameTurn(state,factoryShipment.etaTurn);
  const advanced=await industry.advanceShipments('BGD');
  assert.ok(advanced.delivered>=1,JSON.stringify(advanced));
  const delivery=advanced.shipments.find(item=>String(item.shipmentId)===String(factoryShipment.shipmentId)||String(item.batchId)===String(run.batchId));
  assert.ok(delivery,'the exact second-leg shipment must reach its factory after the authoritative ETA');
  assert.equal(delivery.status,'DELIVERED');
  assert.equal(delivery.processingStatus,'IN_PROGRESS',JSON.stringify(delivery.processing));
  assert.equal(delivery.batchId,run.batchId);
  assert.equal(delivery.destinationStatus,'FACTORY_RECEIVED');
  assert.equal(siteRuntime.runtimeActive,false,'the mine logistics runtime must become idle after factory receipt');
  assert.equal(siteRuntime.activeShipmentId,null);
  assert.equal(siteRuntime.currentStage,'FACTORY_RECEIVED');
  const sameResourceDeliveryQuantity=advanced.shipments.filter(x=>String(x.resourceId)==='coal')
    .reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
  assert.equal(Number(resource.inventory.coal)||0,rawStockBeforeDelivery-sameResourceDeliveryQuantity,'raw inventory must debit the combined same-resource deliveries exactly once');
  assert.equal(Number(resource.warehouse.availableByResource.coal)||0,rawWarehouseBeforeDelivery-sameResourceDeliveryQuantity,'raw warehouse must debit the combined same-resource deliveries exactly once');
  const newlyReservedCoal=(resource.industrialNetwork?.shipments||[])
    .filter(x=>String(x.resourceId)==='coal'&&String(x.status)==='IN_TRANSIT'&&!inTransitBeforeDelivery.has(String(x.shipmentId)))
    .reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
  assert.ok(Math.abs((Number(resource.warehouse.reservedByResource.coal)||0)-
    (rawReservationBeforeDelivery-sameResourceDeliveryQuantity+newlyReservedCoal))<1e-5,
    'delivery must release its own reservation once while keeping other deposit shipments reserved');
  assert.equal(resource.industrialNetwork?.reservations?.[delivery.reservationId]?.status,'DELIVERED',
    'the exact delivered shipment reservation must close');
  assert.equal(Number(sourceBatch.remainingQuantity)||0,initialSourceQuantity-Number(delivery.quantity));
  assert.equal(resource.inventoryLots[run.batchId].remainingQuantity,sourceBatch.remainingQuantity);
  const factory=state.economy.BGD.productionAssets.find(x=>String(x.id||x.assetId||x.projectId)===String(run.factoryId));
  assert.ok(factory,'receiving factory must be in the country economy state');
  const targetInputLot=factory.inputBatchLots.find(x=>String(x.batchId)===String(delivery.factoryInputBatchId));
  assert.ok(targetInputLot,'delivery must create a tracked factory-input lot');
  assert.ok(targetInputLot.sourceBatchIds.includes(run.batchId),'factory input lot must preserve the exact extraction batch lineage');
  const inputBalance=()=>Number(factory.inputInventory.coal)||0;
  const inputLotsBalance=()=>factory.inputBatchLots.filter(x=>String(x.resourceId)==='coal')
    .reduce((sum,x)=>sum+(Number(x.remainingQuantity)||0),0);
  assert.ok(inputBalance()>0,'a shipment larger than one turn of factory throughput must preserve unprocessed input');
  assert.ok(Math.abs(inputBalance()-inputLotsBalance())<1e-5,
    'factory input aggregate must equal its batch-lot remaining quantities after partial processing');
  assert.ok(Number(delivery.processing?.productionQuantity)>0&&delivery.processing?.finishDate,
    'the delivery turn must schedule a tracked production quantity and explicit finish date');
  let followupTurns=0,lastCompletedCycle=null;
  while(inputBalance()>1e-6&&followupTurns<10){
    advanceOneGameTurn(state);
    const followup=industry.processPendingFactoryInputs('BGD');
    assert.ok((Number(followup.completedCount)||0)+(Number(followup.startedCount)||0)>=1,
      JSON.stringify({followup,inputBalance:inputBalance(),factoryId:factory.id}));
    if((followup.completed||[]).length)lastCompletedCycle=followup.completed[followup.completed.length-1];
    assert.ok(Math.abs(inputBalance()-inputLotsBalance())<1e-5,
      'every later factory processing turn must keep aggregate input and batch lineage reconciled');
    followupTurns+=1;
  }
  assert.ok(followupTurns>0,'remaining factory input must resume processing on later simulation turns');
  assert.equal(inputBalance(),0,'the full delivered lot must eventually be processed across throughput-limited turns');
  assert.equal(inputLotsBalance(),0,'all factory-input lots must close once the delivered quantity is processed');
  const finished=(resource.batches||[]).filter(x=>x.stage==='FINISHED'&&x.sourceBatchIds?.includes(run.batchId));
  assert.ok(finished.length>=2,'recipe product and coproduct must have traceable output batches');
  for(const b of finished){
    assert.equal(b.countryId,'BGD');
    assert.equal(b.ownerCountryCode,'BGD');
    assert.equal(b.warehouseId,'WH-BGD-PROCESSED');
    assert.equal(resource.inventoryLots[b.batchId].remainingQuantity,b.remainingQuantity);
    assert.equal(Number(resource.processedWarehouse.availableByResource[b.resourceId])||0,Number(resource.inventory[b.resourceId])||0);
  }
  assert.ok(lastCompletedCycle?.transactionId,'the full multi-turn processing cycle must return its committed transaction ID');
  assert.ok(resource.finishedGoodsLedger.some(x=>x.transactionId===lastCompletedCycle.transactionId),'processing transaction must persist to the finished-goods ledger');
  assert.ok((state.economy.BGD.industrialRuntime?.finishedGoodsLedger||[]).some(x=>x.transactionId===lastCompletedCycle.transactionId),'finished goods event must register in Economy Runtime');
  const concentrateOffer=(state.trade.BGD.offerBook||[]).find(x=>x.resourceId==='COAL_CONCENTRATE'&&x.quantity>0);
  assert.ok(concentrateOffer,'priced finished goods must be published into the actual market offer book');
  assert.ok(Array.isArray(concentrateOffer.batchAllocations)&&concentrateOffer.batchAllocations.length>0,
    'every offer must retain the batch-level allocation list needed for opponent analysis');
  const concentrateOfferQuantity=concentrateOffer.batchAllocations.reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
  assert.ok(Math.abs(concentrateOfferQuantity-Number(concentrateOffer.quantity))<1e-5,
    'market offer quantity must equal the sum of its source batch allocations');
  assert.ok(concentrateOffer.sourceBatchIds.includes(run.batchId),
    'market offer must carry ancestry back to the source mine extraction batch');
  assert.ok(concentrateOffer.sourceSiteIds.includes(site.siteId),
    'market offer must expose the originating deposit site to opponent analysis');
  const originAllocation=concentrateOffer.batchAllocations.find(x=>x.originatingBatchId===run.batchId);
  assert.ok(originAllocation&&originAllocation.siteReferenceKey===site.siteId&&originAllocation.occurrenceKey===run.occurrenceKey,
    'offer lineage must preserve canonical site and occurrence identity');
  const reconciliation=g.OmegaResourceEconomy.reconcileCountry('BGD');
  assert.equal(reconciliation.status,'APPLIED',JSON.stringify(reconciliation));
  assert.equal(reconciliation.result.status,'HEALTHY',JSON.stringify(reconciliation.result));
  assert.equal(Number(resource.warehouse.availableByResource.coal)||0,Number(resource.inventory.coal)||0);
  assert.equal(Number(resource.processedWarehouse.availableByResource.COAL_CONCENTRATE)||0,Number(resource.inventory.COAL_CONCENTRATE)||0);
  assert.equal(Number(resource.processedWarehouse.availableByResource.COAL_REJECT)||0,Number(resource.inventory.COAL_REJECT)||0);
  const cashBeforeExtractionFiscal=Number(state.finance.BGD.available)||0;
  const pendingExtractionFiscal=(state.finance.BGD.resourceExtractionFiscalLedger||[]).find(x=>String(x.batchId)===String(run.batchId));
  assert.ok(pendingExtractionFiscal,'extraction must register a fiscal pending row keyed by its real batch');
  const fiscalProcess=economy.processCountry('BGD');
  assert.ok(fiscalProcess.extractionFiscal.posted>=1,JSON.stringify(fiscalProcess.extractionFiscal));
  const valuedExtraction=(state.finance.BGD.resourceExtractionFiscalLedger||[]).find(x=>String(x.batchId)===String(run.batchId));
  assert.ok(valuedExtraction?.valuationComplete&&valuedExtraction.cashPosted);
  assert.ok(valuedExtraction.marketValue>0&&valuedExtraction.unitPrice>0);
  assert.ok(['COUNTRY_MARKET_PRICE','GLOBAL_MARKET_QUOTE','RESOURCE_REFERENCE_PRICE','SIMULATED_FROM_SOURCE_COMMODITY','SIMULATED_FALLBACK'].includes(valuedExtraction.priceAuthority));
  assert.ok((state.finance.BGD.resourceFiscalLedger||[]).some(x=>x.receiptId===valuedExtraction.receiptId));
  assert.ok(Number(state.finance.BGD.available)>cashBeforeExtractionFiscal,"the extracted resource royalty/tax must credit its own country treasury");
  const cashAfterExtractionFiscal=Number(state.finance.BGD.available)||0;
  const repeatFiscalProcess=economy.processCountry('BGD');
  assert.equal(repeatFiscalProcess.extractionFiscal.posted,0,'reprocessing the same batch must not post extraction fiscal twice');
  assert.equal(Number(state.finance.BGD.available)||0,cashAfterExtractionFiscal,'treasury balance must remain stable on repeated fiscal processing');
  const treasuryBefore=cashAfterExtractionFiscal;
  g.dispatchEvent(new CustomEventMock('OMEGA_TRADE_SETTLEMENT_COMPLETED',{detail:{eventType:'OMEGA_TRADE_SETTLEMENT_COMPLETED',countryId:'BGD',payload:{
    settlementId:'SETTLEMENT-E2E-COAL-1',sellerCountryId:'BGD',resourceId:'COAL_CONCENTRATE',totalValue:100000
  }}}));
  assert.ok((state.finance.BGD.resourceFiscalLedger||[]).some(x=>x.settlementId==='SETTLEMENT-E2E-COAL-1'),'trade settlement must create a treasury fiscal ledger row');
  assert.ok(Number(state.finance.BGD.resourceFiscal?.thisTurn?.total)>0,'resource taxes and royalties must post to the treasury');
  assert.ok(Number(state.finance.BGD.available)>treasuryBefore-100000,'fiscal receipts must change treasury cash');
  assert.equal(industry.diagnostics('BGD').targetArchitecture,'SITE -> EXTRACTION -> WAREHOUSE -> ROUTE -> FACTORY -> PROCESS -> OUTPUT');
  console.log('OMEGA TRUE RESOURCE GAMEPLAY PIPELINE PASSED');
});
