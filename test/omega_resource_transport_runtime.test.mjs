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
  handlers.set('OMEGA_RESOURCE_TRANSPORT_RESERVE_CARGO',{owner:'resource',handler:(cmd,ctx)=>{
    const p=cmd.payload||{},rid=String(p.resourceId),q=Number(p.quantity),node=String(p.sourceNodeId||''),inv=structuredClone(state.resource[ctx.countryId].inventory||{});
    if((Number(inv[rid])||0)<q)return{accepted:false,reason:'TRANSPORT_SOURCE_INVENTORY_INSUFFICIENT'};
    const batches=structuredClone(state.resource[ctx.countryId].batches||[]),allocations=[];let rem=q;
    for(const b of batches){
      if(rem<=1e-9||String(b.resourceId)!==rid)continue;
      if(node&&String(b.locationNodeId||'')!==node)continue;
      const free=Number(b.remainingQuantity)||0;if(free<=0)continue;
      const take=Math.min(free,rem);b.remainingQuantity=free-take;b.inTransitQuantity=(Number(b.inTransitQuantity)||0)+take;rem-=take;
      allocations.push({batchId:b.batchId,quantity:take,sourceNodeId:b.locationNodeId,ownerCompanyId:b.ownerCompanyId,stage:b.stage});
    }
    if(rem>1e-9)return{accepted:false,reason:'TRANSPORT_SOURCE_BATCH_LINEAGE_INSUFFICIENT'};
    inv[rid]-=q;state.resource[ctx.countryId].inventory=inv;state.resource[ctx.countryId].batches=batches;
    return{accepted:true,allocations};
  }});
  handlers.set('OMEGA_RESOURCE_TRANSPORT_CREDIT_DELIVERY',{owner:'resource',handler:(cmd,ctx)=>{
    const p=cmd.payload||{},rid=String(p.resourceId),q=Number(p.quantity),rs=state.resource[ctx.countryId],inv=structuredClone(rs.inventory||{}),batches=structuredClone(rs.batches||[]);
    inv[rid]=(Number(inv[rid])||0)+q;
    batches.push({batchId:'TRANSIT-'+p.shipmentId,resourceId:rid,quantity:q,remainingQuantity:q,stage:'RAW',locationNodeId:p.destinationNodeId,facilityId:p.targetFacilityId||null,transportShipmentId:p.shipmentId,sourceBatchIds:p.sourceBatchIds||[]});
    rs.inventory=inv;rs.batches=batches;
    if(p.targetFacilityId){rs.facilityInventory=rs.facilityInventory||{};rs.facilityInventory[p.targetFacilityId]=rs.facilityInventory[p.targetFacilityId]||{};rs.facilityInventory[p.targetFacilityId][rid]=(Number(rs.facilityInventory[p.targetFacilityId][rid])||0)+q;}
    return{accepted:true,batchId:'TRANSIT-'+p.shipmentId};
  }});
  handlers.set('OMEGA_RESOURCE_TRANSPORT_RELEASE_CARGO',{owner:'resource',handler:(cmd,ctx)=>{
    const rs=state.resource[ctx.countryId],batches=structuredClone(rs.batches||[]);
    for(const a of cmd.payload?.allocations||[]){const b=batches.find(x=>String(x.batchId)===String(a.batchId));if(b)b.inTransitQuantity=Math.max(0,(Number(b.inTransitQuantity)||0)-(Number(a.quantity)||0));}
    rs.batches=batches;return{accepted:true};
  }});

  const interoperability={
    commandHandlers:handlers,
    registerAction(){},
    registerCommandHandler(type,owner,handler){handlers.set(type,{owner,handler});},
    dispatchCommand(owner,type,countryId,payload){
      const h=handlers.get(type);
      if(!h)return{status:'UNHANDLED',reason:'HANDLER_NOT_FOUND'};
      const tx={
        get(path){
          const ps=path.split('.'),domain=ps.shift();
          let cur=state;
          cur=cur&&typeof cur==='object'?cur[domain]:undefined;
          if(['resource','transport','economy','finance','trade'].includes(domain)){
            cur=cur&&typeof cur==='object'?(cur[String(countryId).toUpperCase()]||{}):undefined;
          }
          for(const p of ps){if(cur==null)return undefined;cur=cur[p];}
          return structuredClone(cur);
        },
        set(path,value){
          const ps=path.split('.'),domain=ps.shift();
          if(['resource','transport','economy','finance','trade'].includes(domain)){
            if(!state[domain]||typeof state[domain]!=='object')state[domain]={};
            const country=String(countryId).toUpperCase();
            if(!state[domain][country]||typeof state[domain][country]!=='object')state[domain][country]={};
            let cur=state[domain][country];
            for(const p of ps.slice(0,-1)){if(!cur[p]||typeof cur[p]!=='object')cur[p]={};cur=cur[p];}
            cur[ps.at(-1)]=structuredClone(value);
            return;
          }
          let cur=state;
          for(const p of ps.slice(0,-1)){if(!cur[p]||typeof cur[p]!=='object')cur[p]={};cur=cur[p];}
          cur[ps.at(-1)]=structuredClone(value);
        }
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
  assert.equal(state.resource.BGD.facilityInventory['REF-1'].iron_ore||0,0);
  const firstAdvance=ctx.OmegaResourceTransport.advanceCountry('BGD');
  assert.equal(firstAdvance.arrived.length,0);
  assert.equal(state.transport.BGD.resourceShipments[0].status,'IN_TRANSIT');
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
  const first=ctx.OmegaResourceTransport.advanceCountry('USA');
  assert.equal(first.arrived.length,0);
  assert.equal(state.resource.BGD.inventory.crude_oil,0);
  const second=ctx.OmegaResourceTransport.advanceCountry('USA');
  assert.equal(second.arrived.length,1);
  assert.equal(state.resource.BGD.inventory.crude_oil,30);
  assert.equal(state.transport.BGD.inboundResourceShipments[0].status,'DELIVERED');
  assert.ok(state.resource.BGD.batches.some(x=>x.transportShipmentId===result.shipment.shipmentId));
});
