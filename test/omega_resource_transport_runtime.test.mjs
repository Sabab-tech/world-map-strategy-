import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

class EventTargetMock{
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const a=this.listeners.get(type)||[];a.push(fn);this.listeners.set(type,a);}
  removeEventListener(type,fn){const a=this.listeners.get(type)||[];this.listeners.set(type,a.filter(x=>x!==fn));}
  dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}
}
class CustomEventMock{constructor(type,opts={}){this.type=type;this.detail=opts.detail;}}
function contextFor(state){
  const events=new EventTargetMock(),handlers=new Map();
  const identity={resolveCountry(v){return{id:String(v).toUpperCase()};},list(){return Object.keys(state.resource||{});}};
  const interoperability={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,owner,handler){handlers.set(type,{owner,handler});},
    dispatchCommand(owner,type,countryId,payload){
      const h=handlers.get(type);
      if(!h)return{status:'UNHANDLED',reason:'HANDLER_NOT_FOUND'};
      const tx={
        get(path){let cur=state;for(const p of path.split('.')){if(cur==null)return undefined;cur=cur[p];}return structuredClone(cur);},
        set(path,value){const ps=path.split('.');let cur=state;for(let i=0;i<ps.length-1;i++){if(!cur[ps[i]]||typeof cur[ps[i]]!=='object')cur[ps[i]]={};cur=cur[ps[i]];}cur[ps.at(-1)]=structuredClone(value);}
      };
      const result=h.handler({commandId:'TEST-'+type,commandType:type,payload},{countryId:String(countryId).toUpperCase(),stateTransaction:tx});
      return{status:result?.accepted===false?'FAILED':'APPLIED',result};
    },
    emitEvent(type,countryId,source,payload){events.dispatchEvent(new CustomEventMock(type,{detail:{eventType:type,countryId,payload,source}}));return true;}
  };
  const context={
    console,Math,Number,String,Object,Array,Set,Map,Date,Promise,Intl,JSON,structuredClone,
    fetch:async()=>({ok:true,async json(){return{
      schemaVersion:'test',
      defaultMode:'ROAD',
      modes:{
        PIPELINE:{capacityPerTurn:500000,defaultTravelTurns:1,costPerUnit:0.004},
        RAIL:{capacityPerTurn:100000,defaultTravelTurns:1,costPerUnit:0.006},
        ROAD:{capacityPerTurn:50000,defaultTravelTurns:1,costPerUnit:0.01},
        PORT:{capacityPerTurn:250000,defaultTravelTurns:2,costPerUnit:0.008},
        SEA:{capacityPerTurn:500000,defaultTravelTurns:2,costPerUnit:0.003},
        AIR:{capacityPerTurn:5000,defaultTravelTurns:1,costPerUnit:0.08}
      },
      nodeCapacityDefault:1000000000,maxShipments:16384,maxLedgerEntries:4096,sameCountryDefaultMode:'RAIL',tradeDefaultMode:'SEA'
    };}}),
    CustomEvent:CustomEventMock,
    addEventListener:events.addEventListener.bind(events),
    removeEventListener:events.removeEventListener.bind(events),
    dispatchEvent:events.dispatchEvent.bind(events),
    Game:{state:state},
    gameState:state,
    OmegaCanonicalIdentityRegistry:identity,
    Omega:{MinistryInteroperability:interoperability,CanonicalIdentity:identity}
  };
  context.globalThis=context;
  return context;
}

test('resource batches move from exact mine node to a country-owned refinery without global pooling',async()=>{
  const state={
    simulation:{turn:1},
    resource:{
      BGD:{
        inventory:{iron_ore:100},
        batches:[{batchId:'M1-B1',resourceId:'iron_ore',quantity:100,remainingQuantity:100,stage:'RAW',ownerCountryCode:'BGD',ownerCompanyId:'MINER',locationNodeId:'MINE:M1',occurrenceKey:'M1'}],
        facilityInventory:{},
        mines:[{occurrenceKey:'M1',resourceId:'iron_ore',depositName:'Test Mine',rawDeposit:{lat:24,lng:90}}]
      }
    }
  };
  const ctx=contextFor(state);
  vm.runInNewContext(readFileSync('omega_resource_transport_runtime.js','utf8'),ctx,{filename:'omega_resource_transport_runtime.js'});
  await ctx.OmegaResourceTransport.initialize();
  state.economy={BGD:{productionAssets:[{id:'REF-1',stage:'PROCESSING',capacity:40,inputCoefficients:{iron_ore:1},outputProfile:{iron_intermediate:.8}}]}};
  const planned=ctx.OmegaResourceTransport.planFacilityInputs('BGD');
  assert.equal(planned.length,1);
  assert.equal(state.resource.BGD.inventory.iron_ore,60);
  assert.equal(state.transport.BGD.resourceShipments[0].status,'IN_TRANSIT');
  assert.equal(state.resource.BGD.batches[0].remainingQuantity,60);
  assert.equal(state.resource.BGD.batches[0].inTransitQuantity,40);
  assert.equal(state.resource.BGD.facilityInventory['REF-1'],undefined);
  const advanced=ctx.OmegaResourceTransport.advanceCountry('BGD');
  assert.equal(advanced.arrived.length,1);
  assert.equal(state.resource.BGD.inventory.iron_ore,100);
  assert.equal(state.resource.BGD.facilityInventory['REF-1'].iron_ore,40);
  const delivered=state.resource.BGD.batches.find(x=>x.transportShipmentId===planned[0].shipmentId);
  assert.ok(delivered);
  assert.equal(delivered.remainingQuantity,40);
  assert.equal(delivered.locationNodeId,'FACILITY:REF-1');
});

test('cross-border resource shipment preserves seller/buyer country scope and creates inbound mirror',async()=>{
  const state={
    simulation:{turn:1},
    resource:{
      USA:{inventory:{crude_oil:100},batches:[{batchId:'USA-OIL-1',resourceId:'crude_oil',quantity:100,remainingQuantity:100,stage:'RAW',ownerCountryCode:'USA',locationNodeId:'STOCKPILE:USA'}]},
      BGD:{inventory:{crude_oil:0},batches:[]}
    }
  };
  const ctx=contextFor(state);
  vm.runInNewContext(readFileSync('omega_resource_transport_runtime.js','utf8'),ctx,{filename:'omega_resource_transport_runtime.js'});
  await ctx.OmegaResourceTransport.initialize();
  const result=ctx.OmegaResourceTransport.createShipment({sourceCountryId:'USA',destinationCountryId:'BGD',resourceId:'crude_oil',quantity:30,sourceNodeId:'STOCKPILE:USA',destinationNodeId:'STOCKPILE:BGD',purpose:'TRADE',mode:'SEA',settlementId:'SET-1',requestId:'IMP-1',unitPrice:10,totalValue:300,buyerValue:300});
  assert.equal(result.accepted,true);
  assert.equal(state.resource.USA.inventory.crude_oil,70);
  assert.equal(state.resource.BGD.inventory.crude_oil,0);
  assert.equal(state.transport.BGD.inboundResourceShipments.length,1);
  assert.equal(state.transport.BGD.inboundResourceShipments[0].status,'IN_TRANSIT');
  ctx.OmegaResourceTransport.advanceCountry('USA');
  assert.equal(state.resource.BGD.inventory.crude_oil,30);
  assert.equal(state.transport.BGD.inboundResourceShipments[0].status,'DELIVERED');
  assert.ok(state.resource.BGD.batches.some(x=>x.transportShipmentId===result.shipment.shipmentId));
});
