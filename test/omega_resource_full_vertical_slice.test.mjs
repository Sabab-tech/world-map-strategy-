import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class EventTargetMock {
  constructor(){ this.listeners=new Map(); }
  addEventListener(type,fn){ const a=this.listeners.get(type)||[]; a.push(fn); this.listeners.set(type,a); }
  removeEventListener(type,fn){ const a=this.listeners.get(type)||[]; this.listeners.set(type,a.filter(x=>x!==fn)); }
  dispatchEvent(evt){ for(const fn of this.listeners.get(evt.type)||[]) fn(evt); return true; }
}
class CustomEventMock {
  constructor(type,opts={}){ this.type=type; this.detail=opts.detail; }
}
function deepGet(root,path){
  let cur=root;
  for(const p of path.split('.')){ if(cur==null)return undefined; cur=cur[p]; }
  return cur;
}
function deepSet(root,path,value){
  const parts=path.split('.');
  let cur=root;
  for(let i=0;i<parts.length-1;i++){ if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={}; cur=cur[parts[i]]; }
  cur[parts[parts.length-1]]=value;
}
function makeContext(){
  const events=new EventTargetMock();
  const worldState={
    simulation:{turn:1},
    resource:{
      BGD:{
        mines:[{
          occurrenceKey:'MINE_1',depositName:'Test Iron Mine',resourceId:'iron_ore',
          operatorKey:'MINER_CO',reserveState:{residualQuantity:1000,geologicalQuantity:1000,unit:'TONNES'},operationalStatus:'ACTIVE_EXTRACTION'
        }],
        mineOutputs:{MINE_1:{status:'APPROVED',producedQuantity:0,reserveBefore:{residualQuantity:1000},reserveAfter:{residualQuantity:1000}}},
        inventory:{iron_ore:100},
        batches:[{
          batchId:'MINE-BATCH-1',resourceId:'iron_ore',materialIdentity:'iron_ore',
          quantity:100,remainingQuantity:100,stage:'RAW',ownerCountryCode:'BGD',ownerCompanyId:'MINER_CO',sourceBatchIds:[]
        }]
      }
    },
    economy:{
      BGD:{
        productionAssets:[{
          id:'PROC_1',stage:'PROCESSING',capacity:50,
          inputCoefficients:{iron_ore:1},outputProfile:{iron_intermediate:0.8},companyId:'PROCESS_CO'
        }]
      }
    },
    finance:{BGD:{available:1000,reserves:2000,revenue:0,taxRevenue:0}},
    trade:{BGD:{marketPrice:{iron_ore:10,iron_intermediate:12},offerBook:[]}},
    transport:{BGD:{resourceRouteCapacity:{iron_ore:50,iron_intermediate:50}}}
  };
  const handlers=new Map();
  const stateTx=(countryId)=>({
    get(path){ return deepGet(worldState,path); },
    set(path,value){ deepSet(worldState,path,value); },
    _countryId:countryId
  });
  const interoperability={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,owner,handler){ handlers.set(type,{owner,handler}); },
    dispatchCommand(owner,type,countryId,payload){
      const item=handlers.get(type);
      if(!item)return {status:'UNAVAILABLE',reason:'HANDLER_NOT_FOUND'};
      const result=item.handler({commandId:'TEST-'+type,commandType:type,payload},{countryId,stateTransaction:stateTx(countryId)});
      return {status:'APPLIED',result};
    },
    emitEvent(type,countryId,source,payload,meta){
      events.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,payload,source,meta}}));
      return true;
    }
  };
  const countryRegistry={resolveCountry(v){return{id:String(v).toUpperCase()};},list(){return['BGD'];}};
  const document={
    readyState:'complete',
    head:{appendChild(){}},
    createElement(){return {id:'',textContent:''};},
    getElementById(id){
      if(id==='resource-summary-count')return{textContent:''};
      return null;
    }
  };
  const context={
    console,Math,Number,String,Object,Array,Set,Map,Date,Promise,Intl,JSON,
    fetch:async(url)=>({ok:true,async json(){return String(url).includes('resource_ontology.json')?{COMMODITY_ONTOLOGIES:{}}:{
      schemaVersion:'test',inventory:{legacyOpeningBalancePolicy:'PRESERVE_AND_MARK',batchConsumptionPolicy:'FIFO',sellableSurplusPolicy:'OBSERVED_INVENTORY_ONLY'},
      fiscal:{royaltyRate:0.02,resourceTaxRate:0.01,corporateTaxRate:0.20,exportDutyRate:0,otherReceiptRate:0},
      operatingAllocation:{workerIncomeRate:0.12,transportRevenueRate:0.05},
      runtime:{maxLedgerEntries:2048,maxBatches:8192},
      market:{offerFractionOfObservedInventory:0.25,minOfferQuantity:1}
    };}}),
    CustomEvent:CustomEventMock,
    addEventListener:events.addEventListener.bind(events),
    removeEventListener:events.removeEventListener.bind(events),
    dispatchEvent:events.dispatchEvent.bind(events),
    document, Game:{state:worldState}, gameState:worldState,
    OmegaCanonicalIdentityRegistry:countryRegistry,
    CountryIOS:{activeChapter:5,switchChapter(){},renderChapter5_Resources(){return'<original>';}},
    Omega:{MinistryInteroperability:interoperability},
    OmegaGlobalMarket:{localPrice(_c,rid){return worldState.trade.BGD.marketPrice[rid]??null;},rebuild(){}},
    OmegaGlobalTrade:{processAll(){}}
  };
  context.globalThis=context;
  return {context,worldState,events,handlers};
}

{
  const {context,worldState,events,handlers}=makeContext();
  vm.runInNewContext(readFileSync('omega_resource_transport_runtime_v1.js','utf8'),context,{filename:'omega_resource_transport_runtime_v1.js'});
  vm.runInNewContext(readFileSync('omega_resource_economy_runtime_v2.js','utf8'),context,{filename:'omega_resource_economy_runtime_v2.js'});
  assert(context.OmegaResourceTransport);
  assert(context.OmegaResourceEconomy);

  events.dispatchEvent(new CustomEventMock('OMEGA_RESOURCE_EXTRACTION_COMPLETED',{detail:{countryId:'BGD',payload:{
    countryId:'BGD',resourceId:'iron_ore',producedBatch:{
      batchId:'EXTRACT-BATCH-1',resourceId:'iron_ore',materialIdentity:'iron_ore',quantity:100,remainingQuantity:100,stage:'RAW',
      ownerCountryCode:'BGD',ownerCompanyId:'MINER_CO',sourceBatchIds:[]
    },extractionId:'EXT-1'
  }}}));

  const shipments=context.OmegaResourceTransport.getCountryShipments('BGD');
  console.log('TRANSPORT_EVENT_DEBUG',JSON.stringify({
    shipments,
    transportState:context.Game.state.transport.BGD,
    handlerKeys:[...handlers.keys()],
    transportDiagnostics:context.OmegaResourceTransport.diagnostics()
  }));
  assert.equal(shipments.filter(x=>x.batchId==='EXTRACT-BATCH-1').length,1);
  assert.equal(shipments[0].resourceId,'iron_ore');

  await context.OmegaResourceEconomy.runTurn();

  const rs=worldState.resource.BGD;
  assert.equal(rs.inventory.iron_ore,50);
  assert.equal(rs.inventory.iron_intermediate,40);
  const processed=rs.batches.find(x=>x.resourceId==='iron_intermediate');
  assert(processed);
  assert.equal(processed.remainingQuantity,40);

  const dash=context.OmegaResourceEconomy.getCountryDashboard('BGD');
  assert.equal(dash.industry.refiningInput.iron_ore,50);
  assert.equal(dash.industry.refiningOutput.iron_intermediate,40);
  assert(dash.transport.shipmentCount>=2);
  assert.equal(dash.transport.inTransit,0);

  const html=context.CountryIOS.renderChapter5_Resources('BGD');
  assert.match(html,/REFINERY \/ PROCESSING LIVE FLOW/);
  assert.match(html,/INPUT INTO REFINERY/);
  assert.match(html,/OUTPUT FROM REFINERY \/ FACTORY/);
  assert.match(html,/RESOURCE TRANSPORTATION/);
  assert.match(html,/LOCAL COLLECTION/);
}

{
  const events=new EventTargetMock();
  const markers=[];
  const layers={clearLayers(){markers.length=0;},addLayer(m){markers.push(m);}};
  const context={
    console,Math,Number,String,Object,Array,Set,Map,JSON,
    EventTarget,CustomEvent:CustomEventMock,
    addEventListener:events.addEventListener.bind(events),
    removeEventListener:events.removeEventListener.bind(events),
    dispatchEvent:events.dispatchEvent.bind(events),
    document:{getElementById(id){return id==='resource-summary-count'?{textContent:''}:null;}},
    Game:{
      currentActiveCountry:'BGD',
      state:{resource:{BGD:{
        mines:[
          {occurrenceKey:'M1',depositName:'Mine One',resourceId:'iron_ore',rawDeposit:null,locationNodeKey:'LOC1',reserveState:{geologicalQuantity:1000,residualQuantity:800,unit:'TONNES',operationalStatus:'ACTIVE_EXTRACTION'}},
          {occurrenceKey:'M2',depositName:'Mine Two',resourceId:'copper',rawDeposit:null,locationNodeKey:'LOC2',reserveState:{geologicalQuantity:500,residualQuantity:250,unit:'TONNES',operationalStatus:'DEPLETING'}},
          {occurrenceKey:'M3',depositName:'Mine Three',resourceId:'gold',rawDeposit:null,locationNodeKey:'LOC3',reserveState:{geologicalQuantity:300,residualQuantity:0,unit:'OZT',operationalStatus:'EXHAUSTED_DEPLETED'}}
        ]}},transport:{BGD:{}},economy:{BGD:{}}
      },
      Map:{
        resourceState:{enabled:true,scope:'NATION',selectedResources:new Set(['iron_ore','copper','gold'])},
        resourceCatalog:[
          {id:'iron_ore',name:'Iron Ore',icon:'FE',color:'#aaa'},
          {id:'copper',name:'Copper',icon:'CU',color:'#bbb'},
          {id:'gold',name:'Gold',icon:'AU',color:'#ccc'}
        ],
        resourceDepositsLayer:layers,
        hubsGroupLayer:{clearLayers(){}},
        map:{}
      },
      locationsRegistry:{BGD:{capital:{lat:24,lng:91}}}
    },
    OmegaResourceEndowmentRuntime:{countryMines(){return this._mines||[]}},
    __OmegaResourceIdentityRegistry:{locations:new Map([
      ['LOC1',{lat:24,lng:91}],['LOC2',{lat:24,lng:91}],['LOC3',{lat:24,lng:91}]
    ])},
    L:{
      layerGroup(){return layers;},
      divIcon(opts){return opts;},
      marker(pos){return{pos,bindPopup(html){this.popup=html;},addTo(){return this;}};}
    }
  };
  context.globalThis=context;
  context.OmegaResourceEndowmentRuntime.countryMines=(c)=>context.Game.state.resource[c].mines;
  vm.runInNewContext(readFileSync('omega_resource_map_authority_v1.js','utf8'),context,{filename:'omega_resource_map_authority_v1.js'});
  context.OmegaResourceMapAuthority.render();
  assert.equal(markers.length,3);
  const positions=markers.map(x=>x.pos.map(v=>Number(v.toFixed(6))));
  assert.equal(new Set(positions.map(x=>x.join(','))).size,3);
  assert(markers.some(x=>/LIVE STATUS/.test(x.popup)));
  assert(markers.some(x=>/DEPL/.test(x.popup)));
  assert(markers.some(x=>/OUT/.test(x.popup)));
}

console.log('OMEGA RESOURCE FULL VERTICAL SLICE TEST PASSED');
