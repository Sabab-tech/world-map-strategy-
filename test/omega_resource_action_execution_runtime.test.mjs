import test from 'node:test';
import assert from 'node:assert/strict';

function makeHarness(turn=1){
  const state={
    simulation:{turn},
    resource:{
      BGD:{
        inventory:{iron_ore:100},
        consumption:{iron_ore:5},
        production:{iron_ore:0},
        reserves:{iron_ore:1000},
        tradeAvailability:{iron_ore:100},
        warehouse:{
          warehouseId:'WH-BGD-RAW',
          countryId:'BGD',
          type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
          locationNodeKey:'WAREHOUSE:BGD:RAW',
          status:'OPERATIONAL',
          availableByResource:{iron_ore:100},
          storedBatchIds:['RAW-1','RAW-2'],
          receipts:[]
        },
        batches:[
          {batchId:'RAW-1',resourceId:'iron_ore',materialIdentity:'iron_ore',quantity:40,remainingQuantity:40,unit:'METRIC_TONS',stage:'RAW_EXTRACTED',warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW',purity:.62,grade:62,quality:.62,qualityState:{purity:.62,purityStatus:'OBSERVED',gradePercent:62},sourceBatchIds:[],provenance:{source:'RESOURCE_JSON'}},
          {batchId:'RAW-2',resourceId:'iron_ore',materialIdentity:'iron_ore',quantity:60,remainingQuantity:60,unit:'METRIC_TONS',stage:'RAW_EXTRACTED',warehouseId:'WH-BGD-RAW',locationNodeKey:'WAREHOUSE:BGD:RAW',purity:.58,grade:58,quality:.58,qualityState:{purity:.58,purityStatus:'OBSERVED',gradePercent:58},sourceBatchIds:[],provenance:{source:'RESOURCE_JSON'}}
        ],
        surveyRequests:[],
        surveyResults:[],
        reserveBufferRequests:[]
      }
    },
    economy:{
      BGD:{
        productionCapacity:100,
        productionAssets:[{
          id:'FAC-IRON',
          resourceId:'iron_ore',
          capacity:100,
          stage:'FACTORY',
          facilityType:'IRON_PROCESSING_FACTORY',
          inputCoefficients:{iron_ore:1},
          outputProfile:{steel:1}
        }],
        capacityUpgradeRequests:[]
      }
    },
    finance:{BGD:{available:5000,reserves:10000}},
    population:{BGD:{labor:{available:1000}}}
  };

  const handlers=new Map();
  const makeTx=(owner,country)=>{
    const paths=[
      ['resource',state.resource[country]||={}],
      ['economy',state.economy[country]||={}],
      ['finance',state.finance[country]||{}],
      ['population',state.population[country]||{}],
      ['projects',state.projects?.[country]||{}],
      ['cabinet',state.cabinet?.[country]||{}]
    ];
    function parts(path){return String(path).split('.');}
    return {
      get(path){
        const p=parts(path);
        if(p[0]==='resource')return p.slice(1).reduce((o,k)=>o?.[k],state.resource[country])??null;
        if(p[0]==='economy')return p.slice(1).reduce((o,k)=>o?.[k],state.economy[country])??null;
        if(p[0]==='finance')return p.slice(1).reduce((o,k)=>o?.[k],state.finance[country])??null;
        if(p[0]==='population')return p.slice(1).reduce((o,k)=>o?.[k],state.population[country])??null;
        if(p[0]==='projects')return state.projects?.[country]?.[p[1]]??null;
        if(p[0]==='cabinet')return state.cabinet?.[country]?.[p[1]]??null;
        return null;
      },
      set(path,value){
        const p=parts(path);
        let root;
        if(p[0]==='resource')root=state.resource[country];
        else if(p[0]==='economy')root=state.economy[country];
        else if(p[0]==='finance')root=state.finance[country];
        else if(p[0]==='population')root=state.population[country];
        else if(p[0]==='projects')root=(state.projects??= {}, state.projects[country]??=( {} ));
        else if(p[0]==='cabinet')root=(state.cabinet??= {}, state.cabinet[country]??=( {} ));
        else throw new Error('UNKNOWN_DOMAIN');
        for(let i=1;i<p.length-1;i++)root=root[p[i]]??=( {});
        root[p[p.length-1]]=structuredClone(value);
      }
    };
  };

  function dispatch(owner,action,country,payload={}){
    if(action==='OMEGA_AUTO_RESERVE'){
      state.cabinet??= {};
      state.cabinet[country]??= {};
      const current=Array.isArray(state.cabinet[country].autonomyReservations)?state.cabinet[country].autonomyReservations:[];
      state.cabinet[country].autonomyReservations=current.concat([{...payload,status:'ACTIVE'}]);
      return {status:'APPLIED'};
    }
    if(action==='OMEGA_AUTO_PROJECT_CREATE'){
      state.projects??={};
      state.projects[country]??={};
      const current=Array.isArray(state.projects[country].registry)?state.projects[country].registry:[];
      state.projects[country].registry=current.concat([{
        projectId:payload.projectId,
        kind:payload.kind,
        status:'UNDER_CONSTRUCTION',
        phase:'CONSTRUCTION',
        progress:0,
        quantity:payload.quantity,
        cost:payload.cost,
        durationTurns:payload.durationTurns,
        completionTurn:turn+payload.durationTurns,
        reservationId:payload.reservationId,
        facilityType:payload.facilityType,
        inputCoefficients:payload.inputCoefficients,
        outputProfile:payload.outputProfile
      }]);
      return {status:'APPLIED'};
    }
    if(action==='OMEGA_AUTO_PROJECT_FINALIZE'){
      return {status:'APPLIED'};
    }
    if(action==='OMEGA_AUTO_FACTORY_COMMISSION'){
      const project=payload.project;
      const existing=state.economy[country].productionCapacity;
      state.economy[country].productionCapacity=existing+project.quantity;
      state.economy[country].productionAssets.push({
        projectId:project.projectId,
        capacity:project.quantity,
        facilityType:project.facilityType,
        siteId:project.siteId||null,
        inputCoefficients:project.inputCoefficients,
        outputProfile:project.outputProfile
      });
      return {status:'APPLIED'};
    }
    if(action==='OMEGA_AUTO_RELEASE_RESERVATION')return {status:'APPLIED'};
    if(action==='OMEGA_AUTO_RESOURCE_CONSUME')return {status:'APPLIED'};
    if(action==='OMEGA_AUTO_FINANCE_COMMIT'){
      const a=Number(payload.amount)||0;
      state.finance[country].available-=a;
      return {status:'APPLIED'};
    }
    if(action==='OMEGA_AUTO_FINANCE_REFUND'){
      state.finance[country].available+=(Number(payload.amount)||0);
      return {status:'APPLIED'};
    }
    const handler=handlers.get(action);
    if(!handler)throw new Error('NO_HANDLER:'+action);
    const tx=makeTx(owner,country);
    const result=handler({payload,countryId:country,commandId:'TEST-'+action},{countryId:country,stateTransaction:tx});
    return result?.accepted===false?{status:'REJECTED',...result}:{status:'APPLIED',...result};
  }

  globalThis.Game={state};
  globalThis.Omega={MinistryInteroperability:{
    registerAction(){},
    registerCommandHandler(action,_owner,handler){handlers.set(action,handler);},
    dispatchCommand:(owner,action,country,payload)=>dispatch(owner,action,country,payload),
    emitEvent(){return true;}
  }};
  globalThis.OmegaMinistryInteroperability=globalThis.Omega.MinistryInteroperability;
  globalThis.__OmegaResourceEconomyRules={
    schemaVersion:'1.0.0',
    actions:{
      survey:{durationTurns:2,maxResultRecords:64},
      facilityExpansion:{capacityIncreaseFraction:.25,durationTurns:4,budgetUnitsPerCapacityUnit:10,reservationExpiresAfterTurns:64},
      strategicBuffer:{targetDays:10,maxTransferBatches:128}
    }
  };
  globalThis.ResourceMinistryEngine={
    resourceTypes:[{id:'iron_ore',name:'Iron Ore'}],
    deposits:[{
      id:'dep-barapukuria-coal',
      countryCode:'BGD',
      resourceId:'iron_ore',
      name:'Bangladesh Iron Record',
      grade:'62% Fe',
      sourceAuthority:'RESOURCE_JSON'
    }],
    getCountryResourceProfile(c){return {identity:{name:c==='BGD'?'Bangladesh':c}};}
  };
  globalThis.OmegaResourceActionExecutionRuntime=undefined;
  globalThis.__omegaResourceActionExecutionHandlers=false;
  return {state,handlers,makeTx,dispatch};
}

async function loadRuntime(){
  await import('../omega_resource_action_execution_runtime.js?test='+Date.now()+Math.random());
}

test('survey progresses and completes from authoritative deposit records only',async()=>{
  const h=makeHarness(1);
  await loadRuntime();
  h.state.resource.BGD.surveyRequests=[{
    requestId:'REQ-SURVEY-1',countryId:'BGD',resourceId:'iron_ore',status:'REQUESTED',requestedTurn:1
  }];
  h.dispatch('resource','OMEGA_RESOURCE_ACTION_TICK','BGD',{});
  assert.equal(h.state.resource.BGD.surveyRequests[0].status,'IN_PROGRESS');
  assert.equal(h.state.resource.BGD.surveyRequests[0].progress,0);

  h.state.simulation.turn=2;
  h.dispatch('resource','OMEGA_RESOURCE_ACTION_TICK','BGD',{});
  assert.equal(h.state.resource.BGD.surveyRequests[0].status,'IN_PROGRESS');

  h.state.simulation.turn=3;
  h.dispatch('resource','OMEGA_RESOURCE_ACTION_TICK','BGD',{});
  const req=h.state.resource.BGD.surveyRequests[0];
  assert.equal(req.status,'COMPLETED');
  assert.equal(req.progress,100);
  assert.equal(h.state.resource.BGD.surveyResults.length,1);
  assert.equal(h.state.resource.BGD.surveyResults[0].records[0].id,'dep-barapukuria-coal');
  assert.equal(h.state.resource.BGD.inventory.iron_ore,100);
  assert.equal(h.state.resource.BGD.reserves.iron_ore,1000);
});

test('capacity expansion becomes a real project and preserves factory blueprint',async()=>{
  const h=makeHarness(1);
  await loadRuntime();
  h.state.economy.BGD.capacityUpgradeRequests=[{
    requestId:'REQ-CAP-1',countryId:'BGD',resourceId:'iron_ore',status:'REQUESTED'
  }];
  h.dispatch('resource','OMEGA_RESOURCE_ACTION_TICK','BGD',{});
  const req=h.state.economy.BGD.capacityUpgradeRequests[0];
  assert.equal(req.status,'UNDER_CONSTRUCTION');
  assert.equal(req.capacityBefore,100);
  assert.equal(req.capacityDelta,25);
  assert.equal(req.projectId!=null,true);
  const project=h.state.projects.BGD.registry[0];
  assert.equal(project.kind,'FACTORY');
  assert.equal(project.quantity,25);
  assert.equal(project.facilityType,'IRON_PROCESSING_FACTORY');
  assert.deepEqual(project.inputCoefficients,{iron_ore:1});
  assert.deepEqual(project.outputProfile,{steel:1});
  assert.equal(h.state.economy.BGD.productionCapacity,100);

  project.status='COMPLETED';
  project.progress=1;
  h.state.simulation.turn=5;
  h.dispatch('resource','OMEGA_RESOURCE_ACTION_TICK','BGD',{});
  assert.equal(h.state.economy.BGD.capacityUpgradeRequests[0].status,'COMPLETED');
});

test('SPR buffer transfers observed batches without changing aggregate inventory and protects stock from trade',async()=>{
  const h=makeHarness(1);
  await loadRuntime();
  h.state.resource.BGD.strategicReserve={
    warehouseId:'WH-BGD-SPR',
    countryId:'BGD',
    type:'STRATEGIC_RESERVE_STOCKPILE',
    locationNodeKey:'WAREHOUSE:BGD:SPR',
    status:'OPERATIONAL',
    availableByResource:{iron_ore:0},
    storedBatchIds:[],
    receipts:[],
    transfers:[]
  };
  h.state.resource.BGD.reserveBufferRequests=[{
    requestId:'REQ-SPR-1',countryId:'BGD',resourceId:'iron_ore',status:'REQUESTED'
  }];
  const inventoryBefore=h.state.resource.BGD.inventory.iron_ore;
  h.dispatch('resource','OMEGA_RESOURCE_ACTION_TICK','BGD',{});
  const spr=h.state.resource.BGD.strategicReserve;
  const raw=h.state.resource.BGD.warehouse;
  assert.equal(inventoryBefore,h.state.resource.BGD.inventory.iron_ore);
  assert.equal(spr.availableByResource.iron_ore,50);
  assert.equal(raw.availableByResource.iron_ore,50);
  assert.equal(h.state.resource.BGD.tradeAvailability.iron_ore,50);
  assert.equal(h.state.resource.BGD.reserveBufferRequests[0].status,'COMPLETED');
  const child=h.state.resource.BGD.batches.find(x=>x.batchId.startsWith('SPR-BATCH-'));
  assert(child);
  assert.equal(child.quantity,10);
  assert.equal(child.remainingQuantity,10);
  assert.equal(child.purity,.58);
  assert.equal(child.warehouseId,'WH-BGD-SPR');
  assert.equal(h.state.resource.BGD.batches.find(x=>x.batchId==='RAW-2').remainingQuantity,50);
  assert.equal(raw.storedBatchIds.includes('RAW-2'),true);
});
