import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const readJson = file => JSON.parse(readFileSync(new URL('../'+file, import.meta.url), 'utf8'));
const readText = file => readFileSync(new URL('../'+file, import.meta.url), 'utf8');

class EventTargetMock {
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const rows=this.listeners.get(type)||[];rows.push(fn);this.listeners.set(type,rows);}
  dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}
}
class CustomEventMock {constructor(type,init={}){this.type=type;this.detail=init.detail;}}

function buildContext(){
  const a=readJson('resources.json'),b=readJson('resources_2.json');
  const profiles={...(a.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{}),...(b.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{})};
  const deposits=[...(a.runtime_deposits||[]),...(b.runtime_deposits||[])];
  const resourceTypes={...(a.resource_types||{}),...(b.resource_types||{}),...(a.GSRSK_Master_Resource_Data_v14?.resource_types||{}),...(b.GSRSK_Master_Resource_Data_v14?.resource_types||{})};
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
  const run=await industry.executeSitePipeline({countryId:'BGD',siteId:site.siteId,resourceId:'coal',autoCommissionFactory:true,transportMode:'rail'});
  assert.equal(run.status,'IN_TRANSIT',JSON.stringify(run));
  assert.equal(run.extractionStatus,'COMMITTED');
  assert.ok(run.batchId&&run.shipmentId&&run.extractionPlanId);
  const resource=state.resource.BGD;
  assert.ok(resource,'raw resource state must be committed to Bangladesh');
  const sourceBatch=resource.batches.find(x=>String(x.batchId)===String(run.batchId));
  assert.ok(sourceBatch,'extraction must create a real central batch');
  assert.ok(resource.inventoryLots[run.batchId],'extraction must create a real inventory lot');
  assert.equal(sourceBatch.countryId,'BGD');
  assert.equal(sourceBatch.warehouseId,'WH-BGD-RAW');
  assert.equal(resource.warehouse.countryId,'BGD');
  const initialSourceQuantity=Number(sourceBatch.remainingQuantity);
  assert.ok(initialSourceQuantity+1e-6>=Number(run.quantity));
  const rawStockBeforeDelivery=Number(resource.inventory.coal)||0;
  const rawWarehouseBeforeDelivery=Number(resource.warehouse.availableByResource.coal)||0;
  const rawReservationBeforeDelivery=Number(resource.warehouse.reservedByResource.coal)||0;
  const inTransitBeforeDelivery=new Set((resource.industrialNetwork?.shipments||[])
    .filter(x=>String(x.resourceId)==='coal'&&String(x.status)==='IN_TRANSIT').map(x=>String(x.shipmentId)));
  assert.ok(rawStockBeforeDelivery+1e-6>=Number(run.shipment.quantity));
  assert.ok(rawWarehouseBeforeDelivery+1e-6>=Number(run.shipment.quantity));
  assert.ok(rawReservationBeforeDelivery+1e-6>=Number(run.shipment.quantity));
  state.simulation.turn=run.shipment.etaTurn;
  const advanced=industry.advanceShipments('BGD');
  assert.ok(advanced.delivered>=1,JSON.stringify(advanced));
  const delivery=advanced.shipments.find(item=>String(item.shipmentId)===String(run.shipmentId)||String(item.batchId)===String(run.batchId));
  assert.ok(delivery,'the specific E2E shipment must reach its factory during the global country delivery tick');
  assert.equal(delivery.status,'DELIVERED');
  assert.equal(delivery.processingStatus,'PROCESSED',JSON.stringify(delivery.processing));
  assert.equal(delivery.batchId,run.batchId);
  assert.equal(delivery.destinationStatus,'FACTORY_RECEIVED');
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
  assert.ok(Number(delivery.processing?.inputQuantity)>0,
    'the delivery turn must process up to factory throughput and produce a transaction');
  let followupTurns=0;
  while(inputBalance()>1e-6&&followupTurns<10){
    state.simulation.turn+=1;
    const followup=industry.processPendingFactoryInputs('BGD');
    assert.ok(followup.processedCount>=1,JSON.stringify({followup,inputBalance:inputBalance(),factoryId:factory.id}));
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
  assert.ok(resource.finishedGoodsLedger.some(x=>x.transactionId===delivery.processingTransactionId),'processing transaction must persist to the finished-goods ledger');
  assert.ok((state.economy.BGD.industrialRuntime?.finishedGoodsLedger||[]).some(x=>x.transactionId===delivery.processingTransactionId),'finished goods event must register in Economy Runtime');
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
