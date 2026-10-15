import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const readJson=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const readText=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

class EventTargetMock{
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const rows=this.listeners.get(type)||[];rows.push(fn);this.listeners.set(type,rows);}
  dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}
}
class CustomEventMock{constructor(type,init={}){this.type=type;this.detail=init.detail;}}

function makeContext(siteOverride=null){
  const rawResources=readJson('resources.json'),rawResources2=readJson('resources_2.json');
  const profiles={...(rawResources.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{}),...(rawResources2.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{})};
  const engine={isReady:true,countryProfiles:profiles,deposits:[...(rawResources.runtime_deposits||[]),...(rawResources2.runtime_deposits||[])],
    resourceTypes:Object.values({...rawResources.resource_types,...rawResources2.resource_types}),
    normalizeCountryCode(v){return String(v||'').trim().toUpperCase();},
    getDataLoadReport(){return{authority:'RESOURCE_JSON',countryProfileCount:Object.keys(profiles).length};}};
  const defaultSites=[
    {siteId:'SITE_BGD_barapukuria_coal_mine',countryId:'BGD',siteName:'Barapukuria Coal Mine',siteType:'UNDERGROUND_COAL_MINE',
      real:{resourceId:'coal',extractionMethod:'UNDERGROUND_LONGWALL'},identity:{resourceTypeId:'coal',siteType:'UNDERGROUND_COAL_MINE'},
      sourceSiteRecord:{siteId:'SITE_BGD_barapukuria_coal_mine',resourceId:'coal',countryCode:'BGD',commercialExtraction:true},
      operation:{commercialExtraction:true,status:'ACTIVE_PRODUCING'},map:{markerEligible:true},
      simulation:{transportRoute:[{mode:'rail',distanceKm:240,authority:'SITE_SIMULATION_ROUTE',countryIsolationKey:'BGD'}]},
      runtime:{identityAuthority:'CANONICAL_SITE_REGISTRY'}},
    {siteId:'SITE_CHL_collahuasi_copper_mine',countryId:'CHL',siteName:'Collahuasi Copper Mine',siteType:'OPEN_PIT_COPPER_MINE',
      real:{resourceId:'copper',extractionMethod:'OPEN_PIT_DRILL_BLAST'},identity:{resourceTypeId:'copper',siteType:'OPEN_PIT_COPPER_MINE'},
      sourceSiteRecord:{siteId:'SITE_CHL_collahuasi_copper_mine',resourceId:'copper',countryCode:'CHL',commercialExtraction:true},
      operation:{commercialExtraction:true,status:'ACTIVE_PRODUCING'},map:{markerEligible:true},
      simulation:{transportRoute:[{mode:'rail',distanceKm:420,authority:'SITE_SIMULATION_ROUTE',countryIsolationKey:'CHL'}]},
      runtime:{identityAuthority:'LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE'}}
  ];
  const sites=Array.isArray(siteOverride)?siteOverride:defaultSites;
  const state={simulation:{turn:1,startYear:2025,date:'2025-01-01',daysPerTurn:30},resource:{},economy:{},transport:{},foreign:{},trade:{},finance:{}};
  const bus=new EventTargetMock(),handlers=new Map();
  function tx(countryId){
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
      const fn=handlers.get(type);if(!fn)return{status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND'};
      const result=fn({commandId:'TEST-'+type,payload},{countryId,stateTransaction:tx(countryId)});
      return{status:result?.accepted===false?'REJECTED':'APPLIED',result,commandId:'TEST-'+type};
    },
    emitEvent(type,countryId,source,payload,meta){
      bus.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,source,payload,meta}}));
      return true;
    }
  };
  const fetchLocal=async url=>{
    const clean=String(url).split('?')[0].replace(/^\.\//,'').replace(/^\/+/,'');
    try{return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(new URL('../'+clean,import.meta.url),'utf8'))};}
    catch(_){return{ok:false,status:404,json:async()=>{throw new Error('TEST_FIXTURE_NOT_FOUND:'+clean);}};}
  };
  const identity={
    resolveCountry(v){const id=String(v||'').trim().toUpperCase();return{id,raw:{iso3:id,countryId:id}};},
    list(){return Object.keys(profiles);}
  };
  const context={console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,CustomEvent:CustomEventMock,
    fetch:fetchLocal,addEventListener:bus.addEventListener.bind(bus),dispatchEvent:bus.dispatchEvent.bind(bus),
    Game:{state},gameState:state,Omega:{MinistryInteroperability:interop,CanonicalIdentity:identity},
    OmegaMinistryInteroperability:interop,OmegaCanonicalIdentityRegistry:identity,ResourceMinistryEngine:engine,
    OmegaResourceSiteMasterResearchData:{sites},OmegaResourceSiteCanonicalCatalogData:{sites:[]},
    OmegaResourceIndustrialCatalogData:readJson('resource_industrial_catalog_v1.json'),
    OmegaResourceEconomyRules:readJson('resource_economy_rules.json'),
    OmegaResourceSiteIntegrityContractVersion:'1'};
  context.__OmegaResourceEconomyRules=context.OmegaResourceEconomyRules;
  context.Omega.ResourceSiteMasterResearchData=context.OmegaResourceSiteMasterResearchData;
  context.Omega.ResourceSiteCanonicalCatalogData=context.OmegaResourceSiteCanonicalCatalogData;
  context.Omega.ResourceIndustrialCatalogData=context.OmegaResourceIndustrialCatalogData;
  context.globalThis=context;vm.createContext(context);
  for(const cid of new Set(['BGD','CHL',...sites.map(s=>String(s.countryId||'').toUpperCase()).filter(s=>/^[A-Z]{3}$/.test(s))])){
    state.resource[cid]={inventory:{},batches:[],inventoryLots:{},mineStates:{},mineSiteReferences:[],mineSiteControllers:{},
      warehouse:{warehouseId:'WH-'+cid+'-RAW',countryId:cid,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
        locationNodeKey:'WAREHOUSE:'+cid+':RAW',status:'OPERATIONAL',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]}};
    state.economy[cid]={productionAssets:[]};
    state.transport[cid]={infrastructure:{roads:{capacityPerDay:40000,quality:.9},rail:{capacityPerDay:90000,quality:.9},
      ports:{capacityPerDay:180000,quality:.9},bridges:{capacityPerDay:45000,quality:.9},pipelines:{capacityPerDay:350000,quality:.9}}};
    state.trade[cid]={marketPrice:cid==='BGD'?{COAL_CONCENTRATE:100,COAL_REJECT:5}:{COPPER_CONCENTRATE:150,TAILINGS:2},offerBook:[]};
    state.finance[cid]={available:1000000,reserves:2000000};
  }
  return{context,state,bus,sites};
}

function seedExtractedBatch(state,site,resourceId,batchId,occurrenceKey,quantity){
  const c=site.countryId,rs=state.resource[c];
  const batch={batchId,resourceId,materialIdentity:resourceId,quantity,remainingQuantity:quantity,unit:'TONNES',stage:'RAW_EXTRACTED',
    countryId:c,sourceCountryId:c,originCountryId:c,ownerCountryCode:c,destinationCountryId:c,
    siteReferenceKey:site.siteId,occurrenceKey,warehouseId:'WH-'+c+'-RAW',locationNodeKey:'WAREHOUSE:'+c+':RAW',
    sourceBatchIds:[],provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE',quantityAuthority:'SIMULATED'}};
  rs.inventory[resourceId]=(Number(rs.inventory[resourceId])||0)+quantity;
  rs.batches.push(batch);
  rs.inventoryLots[batchId]={...batch,status:'AVAILABLE'};
  rs.warehouse.availableByResource[resourceId]=(Number(rs.warehouse.availableByResource[resourceId])||0)+quantity;rs.warehouse.storedBatchIds.push(batchId);
  rs.mineStates[occurrenceKey]={countryId:c,resourceId,siteReferenceKey:site.siteId,depositName:site.siteName};
  rs.mineSiteReferences.push({siteReferenceKey:site.siteId,siteId:site.siteId,countryId:c,siteName:site.siteName,resourceId});
  rs.mineSiteControllers[site.siteId]={siteReferenceKey:site.siteId,siteName:site.siteName,countryId:c,linkedOccurrenceKeys:[occurrenceKey],controllerStatus:'RUNNING'};
  return batch;
}

test('every committed deposit event is routed country-by-country through factory, market and treasury',async()=>{
  const h=makeContext(),g=h.context,state=h.state;
  for(const f of ['omega_resource_country_boundary_guard.js','omega_resource_industrial_network_v1.js','omega_resource_economy_runtime_v2.js'])
    vm.runInContext(readText(f),g,{filename:f});
  const industry=g.Omega.ResourceIndustrialNetwork,economy=g.Omega.ResourceEconomy;
  assert.ok(industry&&economy,'industrial and economy runtimes must be active');
  const fixtures=[
    {site:h.sites[0],resourceId:'coal',batchId:'BATCH-BGD-AUTO-COAL',occurrenceKey:'SITE_OCC:BGD:SITE_BGD_barapukuria_coal_mine',quantity:1200,output:'COAL_CONCENTRATE'},
    {site:h.sites[1],resourceId:'copper',batchId:'BATCH-CHL-AUTO-COPPER',occurrenceKey:'SITE_OCC:CHL:SITE_CHL_collahuasi_copper_mine',quantity:1500,output:'COPPER_CONCENTRATE'}
  ];
  for(const f of fixtures){
    seedExtractedBatch(state,f.site,f.resourceId,f.batchId,f.occurrenceKey,f.quantity);
    g.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_EXTRACTION_COMPLETED',{detail:{eventType:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
      countryId:f.site.countryId,payload:{countryId:f.site.countryId,siteReferenceKey:f.site.siteId,siteName:f.site.siteName,
        occurrenceKey:f.occurrenceKey,resourceId:f.resourceId,quantity:f.quantity,
        batch:{batchId:f.batchId,resourceId:f.resourceId,quantity:f.quantity,remainingQuantity:f.quantity,unit:'TONNES',
          warehouseId:'WH-'+f.site.countryId+'-RAW',occurrenceKey:f.occurrenceKey,siteReferenceKey:f.site.siteId}}}}));
  }
  const first=industry.gameplayPipelineDiagnostics();
  assert.equal(first.countryCount,2);
  assert.equal(first.flowCount,2);
  const flowDebug=['BGD','CHL'].map(c=>({countryId:c,flows:state.resource[c].industrialNetwork.siteFlowLedger}));
  assert.equal(first.dispatched,2,"one new shipment must be dispatched for each country's committed extraction batch: "+JSON.stringify({first,flowDebug}));
  for(const f of fixtures){
    const c=f.site.countryId,rs=state.resource[c],network=rs.industrialNetwork;
    assert.equal(network.shipments.filter(x=>x.batchId===f.batchId&&x.status==='IN_TRANSIT').length,1);
    assert.equal(network.siteFlowLedger.filter(x=>x.batchId===f.batchId).length,1);
    const originalReserved=Number(rs.warehouse.reservedByResource[f.resourceId])||0;
    assert.ok(originalReserved>0,"shipment reservation must be held in the producing country's raw warehouse");
    // A duplicate notification must not reserve or dispatch the same batch a second time.
    g.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_EXTRACTION_COMPLETED',{detail:{eventType:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
      countryId:c,payload:{countryId:c,siteReferenceKey:f.site.siteId,siteName:f.site.siteName,occurrenceKey:f.occurrenceKey,
        resourceId:f.resourceId,quantity:f.quantity,batch:{batchId:f.batchId,resourceId:f.resourceId,quantity:f.quantity,
          unit:'TONNES',warehouseId:'WH-'+c+'-RAW',occurrenceKey:f.occurrenceKey,siteReferenceKey:f.site.siteId}}}}));
    assert.equal(network.shipments.filter(x=>x.batchId===f.batchId&&x.status==='IN_TRANSIT').length,1);
    assert.equal(Number(rs.warehouse.reservedByResource[f.resourceId])||0,originalReserved);
  }
  for(const f of fixtures){
    const c=f.site.countryId,rs=state.resource[c];
    const shipment=rs.industrialNetwork.shipments.find(x=>x.batchId===f.batchId&&x.status==='IN_TRANSIT');
    state.simulation.turn=shipment.etaTurn;
    const advanced=industry.advanceShipments(c);
    assert.equal(advanced.delivered,1,JSON.stringify(advanced));
    const result=advanced.shipments[0];
    assert.equal(result.processingStatus,'PROCESSED',JSON.stringify(result.processing));
    assert.equal(result.destinationStatus,'FACTORY_RECEIVED');
    assert.ok(Number(rs.inventory[f.output])>0,"finished product quantity must increase in its own country's inventory");
    assert.ok(Number(rs.processedWarehouse.availableByResource[f.output])>0,'finished product must be allocated to its own country processed warehouse');
    const flow=rs.industrialNetwork.siteFlowLedger.find(x=>x.batchId===f.batchId);
    assert.ok(flow.stages.some(x=>x.stage==='PROCESSING'&&x.status==='COMPLETED'));
    assert.ok(flow.createdBatchIds.length>0);
    assert.equal(flow.countryId,c);
    assert.ok((state.trade[c].offerBook||[]).some(x=>x.resourceId===f.output&&x.quantity>0),JSON.stringify(state.trade[c].offerBook));
    g.dispatchEvent(new CustomEventMock('OMEGA_TRADE_SETTLEMENT_COMPLETED',{detail:{eventType:'OMEGA_TRADE_SETTLEMENT_COMPLETED',countryId:c,payload:{
      settlementId:'AUTO-SETTLEMENT-'+c+'-'+f.output,sellerCountryId:c,resourceId:f.output,quantity:Number(rs.inventory[f.output]),
      totalValue:50000,batchTransfers:[{sourceBatchId:f.batchId,sourceBatchIds:[f.batchId]}]
    }}}));
    assert.ok(Number(state.finance[c].resourceFiscal?.thisTurn?.total)>0,'country-specific treasury must receive fiscal receipts from its own settlement');
    assert.ok((flow.treasurySettlements||[]).some(x=>x.settlementId==='AUTO-SETTLEMENT-'+c+'-'+f.output),
      'settlement ancestry must be traceable back to the originating deposit batch');
    assert.ok(flow.stages.some(x=>x.stage==='MARKET'&&x.status==='PUBLISHED'));
    assert.ok(flow.stages.some(x=>x.stage==='TREASURY'&&x.status==='RECEIPT_POSTED'));
  }
  const final=industry.gameplayPipelineDiagnostics();
  assert.equal(final.processed,2);
  assert.equal(final.marketPublished,2);
  assert.equal(final.treasuryReceipts,2);
  assert.equal(final.blocked,0,JSON.stringify(final.perCountry));
  console.log('OMEGA AUTONOMOUS MULTI-COUNTRY RESOURCE FLOW PASSED');
});


function normalizeExpandedSite(raw){
  const pkg=raw?.siteDataPackage||{},src=raw?.sourceSiteRecord||{},identity=raw?.siteIdentity||pkg.identity||raw?.identity||{};
  const siteId=String(raw?.siteId||pkg.siteId||src.id||'').trim();
  const countryId=String(raw?.countryId||identity.countryIso3||src.countryCode||src.country||'').trim().toUpperCase();
  const resourceId=String(raw?.resourceIdentity?.resourceTypeId||identity.resourceTypeId||src.resourceTypeId||src.resourceId||raw?.resourceId||'').trim().toLowerCase();
  if(!siteId||!/^[A-Z]{3}$/.test(countryId))return null;
  const commercial=raw?.operation?.commercialExtraction??pkg.operation?.commercialExtraction??src.commercialExtraction??raw?.commercialExtraction;
  if(raw?.runtime?.aliasOfSiteId||raw?.aliasOfSiteId)return null;
  const siteType=String(raw?.siteType||identity.siteType||src.siteType||'RESOURCE_SITE');
  const operationalStatus=String(raw?.currentStatus||raw?.status||pkg.operation?.status||src.status||'UNKNOWN').trim().toUpperCase();
  return {
    ...raw,siteId,countryId,siteName:String(raw?.siteName||pkg.siteName||src.siteName||src.name||siteId),siteType,
    real:{...(raw?.real||{}),resourceId:resourceId||null,extractionMethod:raw?.real?.extractionMethod||pkg.operation?.extractionMethod||src.extractionMethod||null},
    identity:{...identity,countryIso3:countryId,resourceTypeId:resourceId||null,siteType},
    sourceSiteRecord:{...src,siteId,resourceId:resourceId||src.resourceId||null,countryCode:countryId,commercialExtraction:commercial===true,status:operationalStatus},
    operation:{...(raw?.operation||pkg.operation||{}),commercialExtraction:commercial===true,status:operationalStatus},
    map:{...(raw?.map||{}),markerEligible:true,countryIsolationKey:countryId},
    simulation:{...(raw?.simulation||{}),transportRoute:Array.isArray(raw?.simulation?.transportRoute)?raw.simulation.transportRoute:[]},
    runtime:{...(raw?.runtime||{}),identityAuthority:raw?.runtime?.identityAuthority||'EXPANDED_SITE_REGISTRY'}
  };
}
function loadExpandedSites(){
  const manifest=readJson('resource_site_reference_expanded_manifest.json');
  const rows=(manifest.parts||[]).flatMap(part=>readJson(part.file).sites||[]);
  const nonAliases=rows.filter(raw=>!raw?.runtime?.aliasOfSiteId&&!raw?.aliasOfSiteId);
  const malformed=nonAliases.filter(raw=>{
    const pkg=raw?.siteDataPackage||{},src=raw?.sourceSiteRecord||{},identity=raw?.siteIdentity||pkg.identity||raw?.identity||{};
    return !String(raw?.siteId||pkg.siteId||src.id||'').trim()||
      !/^[A-Z]{3}$/.test(String(raw?.countryId||identity.countryIso3||src.countryCode||src.country||'').trim().toUpperCase());
  });
  assert.deepEqual(malformed.map(x=>x.siteId||x.siteName||x.sourceSiteRecord?.name),[],
    'every non-alias expanded site must have a country and stable site ID');
  const byId=new Map();
  for(const raw of rows){const site=normalizeExpandedSite(raw);if(site&&!byId.has(site.siteId))byId.set(site.siteId,site);}
  const uniqueExpected=new Set(nonAliases.map(raw=>String(raw.siteId||raw.siteDataPackage?.siteId||raw.sourceSiteRecord?.id||'').trim()));
  assert.equal(byId.size,uniqueExpected.size,'non-alias site rows may only be omitted through a duplicate canonical identity');
  return [...byId.values()];
}

test('all expanded deposits receive explicit flow status; active sites dispatch and inactive sites are blocked',async()=>{
  const sites=loadExpandedSites();
  assert.equal(sites.length,199,'expanded registry test must include every non-alias record from the current pack: '+sites.length);
  const isOperational=status=>{
    const normalized=String(status||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    const explicitlyInactive=/(^|_)(INACTIVE|NOT_ACTIVE|HISTORICAL|HISTORICALLY|CARE_AND_MAINTENANCE|SUSPEND|SUSPENDED|BLOCKED|CLOSED|ABANDON|ABANDONED|DEPLETED|DEVELOPMENT|RESTARTING|CESSATION_OF_PRODUCTION|DISRUPTED|NOT_APPLICABLE|NO_CURRENT_CONCESSION|PERMIT_PROCESSING|RESOURCE_IDENTITY_UNVERIFIED|DISPUTED_OPERATION|RESTRICTED)(_|$)/.test(normalized);
    return !explicitlyInactive&&/(^|_)(ACTIVE_EXTRACTION|ACTIVE_PRODUCING|ACTIVE|DEPLETING|RESERVE_DEPLETING|OPERATING|RUNNING|PRODUCING)(_|$)/.test(normalized);
  };
  const activeSites=sites.filter(s=>s.operation.commercialExtraction===true&&isOperational(s.operation.status)&&Boolean(s.real.resourceId));
  const activeIds=new Set(activeSites.map(s=>s.siteId));
  const blockedSites=sites.filter(s=>!activeIds.has(s.siteId));
  assert.equal(activeSites.length+blockedSites.length,sites.length);
  const h=makeContext(sites),g=h.context,state=h.state;
  for(const f of ['omega_resource_country_boundary_guard.js','omega_resource_industrial_network_v1.js','omega_resource_economy_runtime_v2.js'])
    vm.runInContext(readText(f),g,{filename:f});
  const industry=g.Omega.ResourceIndustrialNetwork,economy=g.Omega.ResourceEconomy;
  assert.ok(industry,'Industrial Network must be active before extraction notifications');
  assert.ok(economy,'Economy Runtime must be active before factory output so market offers are created from actual finished-goods events');
  let committed=0,failedActive=[],expectedBatchIds=[],expectedBlockedFlowIds=[];
  for(let index=0;index<sites.length;index++){
    const site=sites[index],rid=site.real.resourceId,cid=site.countryId;
    const occurrenceKey='SITE_OCC:'+cid+':'+site.siteId.toLowerCase();
    if(!activeIds.has(site.siteId)){
      const flowId='SITE-FLOW-BLOCKED:'+cid+':'+occurrenceKey+':T1';
      expectedBlockedFlowIds.push(flowId);
      g.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_EXTRACTION_BLOCKED',{detail:{eventType:'OMEGA_RESOURCE_EXTRACTION_BLOCKED',
        countryId:cid,payload:{countryId:cid,siteReferenceKey:site.siteId,siteName:site.siteName,siteType:site.siteType,
          occurrenceKey,resourceId:rid,reason:site.operation.commercialExtraction!==true?'NON_COMMERCIAL_SITE':
            !rid?'RESOURCE_IDENTITY_UNVERIFIED':'MINE_NOT_OPERATIONAL',
          operationalStatus:site.operation.status,sourceStatus:site.sourceSiteRecord.status,sourceAuthority:'EXPANDED_SITE_REGISTRY',simulationTurn:1}}}));
      continue;
    }
    const batchId='BATCH-ALL-SITE:'+site.siteId,quantity=100+(index%17);
    seedExtractedBatch(state,site,rid,batchId,occurrenceKey,quantity);
    expectedBatchIds.push(batchId);
    g.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_EXTRACTION_COMPLETED',{detail:{eventType:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
      countryId:cid,payload:{countryId:cid,siteReferenceKey:site.siteId,siteName:site.siteName,siteType:site.siteType,
        occurrenceKey,resourceId:rid,quantity,sourceAuthority:'SIMULATED_TEST_FIXTURE',
        batch:{batchId,resourceId:rid,quantity,remainingQuantity:quantity,unit:'TONNES',warehouseId:'WH-'+cid+'-RAW',
          occurrenceKey,siteReferenceKey:site.siteId,provenance:{sourceAuthority:'SIMULATED_TEST_FIXTURE',quantityAuthority:'SIMULATED'}}}}}));
    const flow=state.resource[cid].industrialNetwork?.siteFlowLedger?.find(x=>String(x.batchId)===batchId);
    if(flow?.status==='BLOCKED'||flow?.status==='EXTRACTED_AWAITING_ROUTE'||flow?.status==='EXTRACTED_AWAITING_FACTORY')
      failedActive.push({siteId:site.siteId,countryId:cid,resourceId:rid,status:flow.status,reason:flow.blockReason||null,
        stages:(flow.stages||[]).filter(x=>/BLOCKED/.test(x.status)).map(x=>({stage:x.stage,reason:x.reason,detail:x.detail||null}))});
    if(flow&&flow.stages.some(x=>x.stage==='TRANSPORT'&&['IN_TRANSIT','DELIVERED'].includes(x.status)))committed++;
  }
  const expected=new Set(expectedBatchIds),actual=new Set(),actualBlocked=new Set();
  let totalFlows=0,untracked=[];
  for(const [cid,rs] of Object.entries(state.resource)){
    for(const flow of rs.industrialNetwork?.siteFlowLedger||[]){
      totalFlows++;if(expected.has(String(flow.batchId)))actual.add(String(flow.batchId));
      if(expectedBlockedFlowIds.includes(String(flow.flowId))){
        actualBlocked.add(String(flow.flowId));
        assert.equal(flow.status,'BLOCKED_EXTRACTION','inactive/non-commercial/unverified flow must retain its blocked current state');
        const blockedSite=blockedSites.find(site=>String(site.siteId)===String(flow.siteId));
        assert.ok(blockedSite,'blocked flow must retain its originating registry site');
        assert.equal((rs.batches||[]).some(batch=>String(batch.siteReferenceKey||'')===String(blockedSite.siteId)),false,
          'blocked site must not create any production batch');
        assert.equal((rs.industrialNetwork?.shipments||[]).some(shipment=>String(shipment.siteId||'')===String(blockedSite.siteId)),false,
          'blocked site must not create any shipment');
      }
    }
    for(const batch of rs.batches||[])if(expected.has(String(batch.batchId))&&String(batch.countryId)!==cid)
      untracked.push({batchId:batch.batchId,registryCountry:cid,batchCountry:batch.countryId});
  }
  assert.equal(totalFlows,sites.length,'each expanded deposit needs exactly one active or blocked site-flow ledger row');
  assert.equal(actual.size,activeSites.length,'every operational deposit must have a batch-level flow row');
  assert.equal(actualBlocked.size,blockedSites.length,'every inactive/non-commercial deposit must have an explicit blocked flow row');
  assert.equal(untracked.length,0,'resource batches must remain in their sovereign country inventory');
  assert.equal(failedActive.length,0,'every operational commercial deposit must auto-route without hidden blocks: '+JSON.stringify(failedActive.slice(0,20)));
  assert.equal(committed,activeSites.length,'each operational commercial deposit must automatically create a shipment');
  const diag=industry.gameplayPipelineDiagnostics();
  assert.equal(diag.flowCount,sites.length);
  assert.equal(diag.blocked,blockedSites.length,JSON.stringify(diag.perCountry.filter(x=>x.blocked>0).slice(0,20)));

  // End-to-end requirement for every operational deposit in this 199-site pack:
  // do not stop at "shipment created". Advance sovereign deliveries, process every
  // remaining factory-input lot over later turns, publish batch-backed offers, and
  // settle those offers so the original mine flow receives a treasury-lineage record.
  const countryIds=[...new Set(sites.map(site=>String(site.countryId||'').toUpperCase()).filter(cid=>/^[A-Z]{3}$/.test(cid)))];
  const activeCountByCountry=new Map();
  for(const site of activeSites)activeCountByCountry.set(site.countryId,(activeCountByCountry.get(site.countryId)||0)+1);
  const maxActivePerCountry=Math.max(1,...activeCountByCountry.values());
  const expectedRawBatchIds=new Set(expectedBatchIds);
  const allInitialShipments=countryIds.flatMap(cid=>(state.resource[cid]?.industrialNetwork?.shipments||[])
    .filter(shipment=>expectedRawBatchIds.has(String(shipment.batchId))));
  assert.equal(allInitialShipments.length,activeSites.length,
    'every active deposit must have exactly one source-batch shipment before delivery');
  const lastEta=Math.max(1,...allInitialShipments.map(shipment=>Number(shipment.etaTurn)||1));
  const processingTurnLimit=lastEta+maxActivePerCountry+5;
  for(let simulationTurn=1;simulationTurn<=processingTurnLimit;simulationTurn++){
    state.simulation.turn=simulationTurn;
    for(const cid of countryIds)industry.processPendingFactoryInputs(cid);
    for(const cid of countryIds)industry.advanceShipments(cid);
  }

  const endToEndFailures=[];
  for(const site of activeSites){
    const cid=site.countryId,rs=state.resource[cid],rawBatchId='BATCH-ALL-SITE:'+site.siteId;
    const flow=(rs?.industrialNetwork?.siteFlowLedger||[]).find(row=>String(row.batchId||'')===rawBatchId);
    const batch=rs?.batches?.find(row=>String(row.batchId||'')===rawBatchId);
    const outputRows=(flow?.createdBatchIds||[]).map(id=>(rs?.batches||[]).find(row=>String(row.batchId||'')===String(id))).filter(Boolean);
    const linkedFinished=outputRows.filter(output=>
      String(output.stage||'').toUpperCase()==='FINISHED'&&
      (output.sourceBatchIds||[]).map(String).includes(rawBatchId));
    const inputLots=(state.economy[cid]?.productionAssets||[]).flatMap(factory=>
      (factory.inputBatchLots||[]).filter(lot=>(lot.sourceBatchIds||[]).map(String).includes(rawBatchId)));
    const failures=[];
    if(!flow)failures.push('SITE_FLOW_MISSING');
    if(!batch)failures.push('RAW_BATCH_MISSING');
    if(!flow?.stages?.some(stage=>stage.stage==='TRANSPORT'&&stage.status==='DELIVERED'))failures.push('TRANSPORT_NOT_DELIVERED');
    if(!flow?.stages?.some(stage=>stage.stage==='FACTORY_INPUT'&&stage.status==='RECEIVED'))failures.push('FACTORY_INPUT_NOT_RECEIVED');
    if(!flow?.stages?.some(stage=>stage.stage==='PROCESSING'&&stage.status==='COMPLETED'))failures.push('PROCESSING_NOT_COMPLETED');
    if(!flow?.stages?.some(stage=>stage.stage==='FINISHED_GOODS'&&stage.status==='AVAILABLE'))failures.push('FINISHED_GOODS_NOT_REGISTERED');
    if(!linkedFinished.length)failures.push('FINISHED_BATCH_LINEAGE_MISSING');
    if(inputLots.some(lot=>Math.max(0,Number(lot.remainingQuantity)||0)>1e-6))failures.push('FACTORY_INPUT_REMAINS_UNPROCESSED');
    if(!flow?.stages?.some(stage=>stage.stage==='MARKET'&&stage.status==='PUBLISHED'))failures.push('MARKET_NOT_PUBLISHED');
    if(!Array.isArray(rs?.batches)||!rs.batches.some(output=>
      String(output.stage||'').toUpperCase()==='FINISHED'&&
      (output.sourceBatchIds||[]).map(String).includes(rawBatchId)))failures.push('NO_FINISHED_GOODS_WITH_SOURCE_BATCH_LINEAGE');
    if(failures.length)endToEndFailures.push({siteId:site.siteId,countryId:cid,batchId:rawBatchId,failures,
      flow:flow?{status:flow.status,blockReason:flow.blockReason,stages:flow.stages}:null});
  }
  assert.deepEqual(endToEndFailures,[],
    'every active expanded deposit must complete shipment -> factory input -> processing -> finished goods -> market: '+
    JSON.stringify(endToEndFailures.slice(0,20)));

  // Final per-country market book must expose positive, physically backed offers.
  const activeCountryIds=new Set(activeSites.map(site=>String(site.countryId||'').toUpperCase()));
  const offerSourceRootsByCountry=new Map();
  for(const cid of countryIds){
    economy.processCountry(cid);
    const rs=state.resource[cid],offers=(state.trade[cid]?.offerBook||[]).filter(offer=>
      offer?.source==='OMEGA_RESOURCE_ECON_AUTO_OFFER'&&Number(offer.quantity)>0);
    if(!activeCountryIds.has(cid)){
      assert.equal(offers.length,0,cid+': a country with only blocked/non-operational sites must not receive synthetic market stock');
      offerSourceRootsByCountry.set(cid,new Set());
      continue;
    }
    assert.ok(offers.length>0,cid+': active producing country must publish at least one positive finished/raw market offer');
    const roots=new Set();
    for(const offer of offers){
      assert.ok(Array.isArray(offer.batchAllocations)&&offer.batchAllocations.length>0,
        cid+': each offer must have physical batch allocations '+offer.resourceId);
      const allocationTotal=offer.batchAllocations.reduce((sum,row)=>sum+(Number(row.quantity)||0),0);
      assert.ok(Math.abs(allocationTotal-Number(offer.quantity))<1e-5,
        cid+': offer quantity must reconcile to its batch allocations '+offer.resourceId);
      for(const allocation of offer.batchAllocations){
        for(const id of [allocation.originatingBatchId,...(allocation.sourceBatchIds||[])])
          if(expectedRawBatchIds.has(String(id)))roots.add(String(id));
      }
    }
    offerSourceRootsByCountry.set(cid,roots);
  }
  const missingMarketRoots=activeSites.filter(site=>!offerSourceRootsByCountry.get(site.countryId)?.has('BATCH-ALL-SITE:'+site.siteId))
    .map(site=>({siteId:site.siteId,countryId:site.countryId,batchId:'BATCH-ALL-SITE:'+site.siteId}));
  assert.deepEqual(missingMarketRoots,[],
    'market batch allocations must preserve lineage to every active deposit batch: '+JSON.stringify(missingMarketRoots.slice(0,20)));

  // Clear actual published quantities through the treasury settlement event contract.
  // This asserts fiscal posting and source-deposit lineage, not merely a UI offer count.
  for(const cid of countryIds){
    const offers=(state.trade[cid]?.offerBook||[]).filter(offer=>
      offer?.source==='OMEGA_RESOURCE_ECON_AUTO_OFFER'&&Number(offer.quantity)>0&&Number(offer.price)>0);
    for(const offer of offers){
      const allocations=Array.isArray(offer.batchAllocations)?offer.batchAllocations:[];
      const transfers=allocations.map(allocation=>{
        const roots=[...new Set([allocation.originatingBatchId,...(allocation.sourceBatchIds||[])].map(String).filter(Boolean))];
        const quantity=Math.max(0,Number(allocation.quantity)||0),unitPrice=Math.max(0,Number(offer.price)||0);
        return{sourceBatchId:allocation.originatingBatchId||allocation.batchId||null,sourceBatchIds:roots,
          siteId:allocation.siteId||null,siteReferenceKey:allocation.siteReferenceKey||allocation.siteId||null,
          occurrenceKey:allocation.occurrenceKey||null,resourceId:offer.resourceId,
          quantity,unitPrice,totalValue:quantity*unitPrice};
      }).filter(transfer=>transfer.sourceBatchId||transfer.sourceBatchIds.length);
      const sourceBatchIds=[...new Set(transfers.flatMap(transfer=>[transfer.sourceBatchId,...transfer.sourceBatchIds].filter(Boolean).map(String)))];
      if(!sourceBatchIds.some(id=>expectedRawBatchIds.has(id)))continue;
      const totalValue=Number(offer.quantity)*Number(offer.price);
      assert.ok(totalValue>0,cid+': settlement value must be positive for '+offer.resourceId);
      g.dispatchEvent(new CustomEventMock('OMEGA_TRADE_SETTLEMENT_COMPLETED',{detail:{
        eventType:'OMEGA_TRADE_SETTLEMENT_COMPLETED',countryId:cid,payload:{
          settlementId:'EXPANDED-SITE-SETTLEMENT:'+cid+':'+String(offer.offerId),
          sellerCountryId:cid,resourceId:offer.resourceId,quantity:Number(offer.quantity),totalValue,
          sourceBatchIds,batchTransfers:transfers
        }
      }}));
    }
  }

  const missingTreasuryRoots=[];
  for(const site of activeSites){
    const cid=site.countryId,rawBatchId='BATCH-ALL-SITE:'+site.siteId,rs=state.resource[cid];
    const flow=(rs?.industrialNetwork?.siteFlowLedger||[]).find(row=>String(row.batchId||'')===rawBatchId);
    if(!flow?.treasurySettlements?.length||!flow.stages?.some(stage=>stage.stage==='TREASURY'&&stage.status==='RECEIPT_POSTED'))
      missingTreasuryRoots.push({siteId:site.siteId,countryId:cid,batchId:rawBatchId,receipts:flow?.treasurySettlements||[],stages:flow?.stages||[]});
  }
  assert.deepEqual(missingTreasuryRoots,[],
    'every active deposit whose finished goods were published must receive a country-local treasury settlement lineage: '+
    JSON.stringify(missingTreasuryRoots.slice(0,20)));
  for(const cid of activeCountryIds){
    assert.ok(Number(state.finance[cid]?.resourceFiscal?.thisTurn?.total)>0,
      cid+': settled resource offers must credit a country-local fiscal receipt');
    assert.ok((state.finance[cid]?.resourceFiscalLedger||[]).some(row=>String(row.settlementId||'').startsWith('EXPANDED-SITE-SETTLEMENT:'+cid+':')),
      cid+': treasury ledger must record market settlement receipts');
  }

  const finalDiag=industry.gameplayPipelineDiagnostics();
  assert.equal(finalDiag.flowCount,sites.length);
  assert.equal(finalDiag.blocked,blockedSites.length,JSON.stringify(finalDiag.perCountry.filter(x=>x.blocked>0).slice(0,20)));
  console.log('OMEGA ALL-EXPANDED-DEPOSIT END-TO-END PASSED: '+activeSites.length+' active / '+blockedSites.length+
    ' correctly blocked / '+sites.length+' total across '+countryIds.length+' countries');
});
