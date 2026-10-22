import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const readText=name=>fs.readFileSync(path.join(root,name),'utf8');
const tok=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');

function createRuntime(overrides={}){
  const catalog=readJson('resource_industrial_catalog_v1.json');
  const state={
    simulation:{turn:1,startYear:2015,date:'2015-01-01',daysPerTurn:1},
    resource:{BGD:{inventory:{},warehouse:{warehouseId:'WH-BGD-RAW',availableByResource:{},reservedByResource:{},storedBatchIds:[]},
      processedWarehouse:{warehouseId:'WH-BGD-PROCESSED',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]},
      batches:[],inventoryLots:{},finishedGoodsLedger:[],inventoryLedger:[]}},
    economy:{BGD:{productionAssets:[]}},
    transport:{BGD:{infrastructure:{roads:{capacityPerDay:500000,quality:1},rail:{capacityPerDay:500000,quality:1},
      ports:{capacityPerDay:500000,quality:1},bridges:{capacityPerDay:500000,quality:1},pipelines:{capacityPerDay:500000,quality:1}}}},
    trade:{},finance:{},foreign:{}
  };
  Object.assign(state.resource.BGD,overrides.resource||{});
  Object.assign(state.economy.BGD,overrides.economy||{});
  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
    Game:{state},Omega:{ResourceIndustrialCatalogData:catalog},OmegaResourceIndustrialCatalogData:catalog,
    addEventListener(){},dispatchEvent(){},fetch:async()=>({ok:true,status:200,json:async()=>catalog})
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(readText('omega_resource_industrial_network_v1.js'),context,{filename:'omega_resource_industrial_network_v1.js'});
  return{context,api:context.Omega.ResourceIndustrialNetwork,catalog,state};
}

function inputLot(batchId,resourceId,quantity,sourceBatchId=batchId){
  return{batchId,resourceId,materialIdentity:resourceId,quantity,remainingQuantity:quantity,unit:'TONNES',
    stage:'FACTORY_INPUT',countryId:'BGD',factoryId:'STEEL-1',sourceBatchIds:[sourceBatchId],
    provenance:{authority:'TEST_FIXTURE',sourceAuthority:'TEST_FIXTURE'},status:'AVAILABLE_TO_FACTORY',createdTurn:1};
}
function steelMill(stock={},lots=[]){
  return{id:'STEEL-1',countryId:'BGD',factoryType:'STEEL_AND_ALLOY_MILL',primaryInput:'iron_concentrate',
    recipeResourceId:'iron_concentrate',capacity:1000,status:'OPERATIONAL',inputInventory:{
      iron_concentrate:1000,coal_concentrate:240,limestone:50,...stock
    },inputBatchLots:lots.length?lots:[
      inputLot('IN-IRON','iron_concentrate',1000,'MINE-IRON'),
      inputLot('IN-COAL','coal_concentrate',240,'COAL-PREP'),
      inputLot('IN-LIMESTONE','limestone',50,'MINE-LIMESTONE')
    ],locationNodeKey:'INDUSTRIAL_ZONE:BGD'};
}

test('factory baseline preserves existing raw processing catalogue and defines 20 downstream types',()=>{
  const {catalog}=createRuntime();
  assert.equal(Object.keys(catalog.processingRules||{}).length,39,'existing processing rules remain in place');
  assert.equal(Object.keys(catalog.resourceRules||{}).length,39,'existing resource identities remain in place');
  assert.equal(Object.keys(catalog.manufacturingRules||{}).length,20);
  assert.equal(Object.values(catalog.manufacturingRules).reduce((n,row)=>n+Object.keys(row.recipes||{}).length,0),25);
  assert.equal(catalog.manufacturingBaseline.targetFactoryTypeCount,56);
  for(const [factoryType,profile] of Object.entries(catalog.manufacturingRules)){
    assert.ok(profile.iconId,factoryType+': iconId is required');
    assert.ok(profile.simulationOnly,factoryType+': simulation parameters must not masquerade as observations');
    assert.ok(Object.keys(profile.recipes||{}).length>0,factoryType+': at least one production recipe is required');
    for(const [recipeKey,recipe] of Object.entries(profile.recipes)){
      assert.ok(recipe.primaryInput,factoryType+'/'+recipeKey+': primary input missing');
      assert.ok(Object.keys(recipe.inputs||{}).some(x=>tok(x)===tok(recipe.primaryInput)),factoryType+'/'+recipeKey+': primary input not present');
      assert.ok(Object.entries(recipe.inputs||{}).length>0,factoryType+'/'+recipeKey+': input recipe is empty');
      assert.ok(Object.entries(recipe.inputs).every(([k,v])=>tok(k)&&Number.isFinite(Number(v))&&Number(v)>0),factoryType+'/'+recipeKey+': invalid input coefficient');
      assert.ok(Object.entries(recipe.outputs||{}).length>0,factoryType+'/'+recipeKey+': outputs are empty');
      assert.ok(Object.entries(recipe.outputs).every(([k,v])=>tok(k)&&Number.isFinite(Number(v))&&Number(v)>0),factoryType+'/'+recipeKey+': invalid output coefficient');
      assert.ok(recipe.construction&&Number(recipe.construction.costUsd)>0&&Number(recipe.construction.buildDays)>0&&
        Number(recipe.construction.capacityPerDay)>0&&Number(recipe.construction.workersRequired)>0,
        factoryType+'/'+recipeKey+': explicit simulated construction profile is required');
    }
  }
});

test('every manufacturing iconId exists in the local offline SVG registry and cache manifest',()=>{
  const iconContext={window:{}};
  vm.runInNewContext(readText('omega_icon_system_v1.js'),iconContext,{filename:'omega_icon_system_v1.js'});
  const icons=iconContext.window.OMEGA_ICON_SYSTEM_V1;
  const {catalog}=createRuntime();
  const missing=[...new Set(Object.values(catalog.manufacturingRules).map(x=>x.iconId))].filter(x=>!icons.iconNames.includes(x));
  assert.deepEqual(missing,[]);
  const html=readText('index.html');
  const sw=readText('omega-offline-map-sw.js');
  assert.match(html,/src="omega_resource_industrial_network_v1\.js"/);
  assert.match(html,/src="omega_icon_system_v1\.js"/);
  assert.match(sw,/omega-offline-atlas-shell-v18/);
  for(const asset of ['omega_resource_industrial_network_v1.js','resource_industrial_catalog_v1.json','omega_icon_system_v1.js','omega_icon_system_v1.css'])
    assert.ok(sw.includes('./'+asset),'offline shell must precache '+asset);
});

test('multi-input steelworks consumes the exact recipe quantities and preserves batch lineage',()=>{
  const {api,context}=createRuntime({economy:{productionAssets:[steelMill()]}});
  const result=api.executeFactoryCycle({countryId:'BGD',factoryId:'STEEL-1',resourceId:'iron_concentrate',quantity:1000,unit:'TONNES'});
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.recipeAuthority,'SIMULATED_MANUFACTURING_CATALOG');
  assert.deepEqual({...result.inputQuantities},{iron_concentrate:1000,coal_concentrate:240,limestone:50});
  assert.deepEqual({...result.outputQuantities},{STEEL_INGOT:780,SLAG:300,STEEL_DUST:80});
  const factory=context.Game.state.economy.BGD.productionAssets[0];
  assert.equal(factory.inputInventory.iron_concentrate,0);
  assert.equal(factory.inputInventory.coal_concentrate,0);
  assert.equal(factory.inputInventory.limestone,0);
  assert.ok(factory.inputBatchLots.every(x=>x.remainingQuantity===0));
  assert.deepEqual([...result.sourceBatchIds].sort(),['COAL-PREP','MINE-IRON','MINE-LIMESTONE']);
  const r=context.Game.state.resource.BGD;
  assert.equal(r.processedWarehouse.availableByResource.STEEL_INGOT,780);
  assert.equal(r.processedWarehouse.availableByResource.SLAG,300);
  assert.equal(r.processedWarehouse.availableByResource.STEEL_DUST,80);
  assert.equal(r.inventory.STEEL_INGOT,780);
  assert.equal(r.batches.filter(x=>x.processId===result.transactionId).length,3);
  assert.equal(r.finishedGoodsLedger.at(-1).transactionId,result.transactionId);
});

test('missing secondary input blocks production without partially consuming the other inputs',()=>{
  const mill=steelMill({coal_concentrate:0},[
    inputLot('IN-IRON','iron_concentrate',1000,'MINE-IRON'),
    inputLot('IN-COAL','coal_concentrate',0,'COAL-PREP'),
    inputLot('IN-LIMESTONE','limestone',50,'MINE-LIMESTONE')
  ]);
  const {api,context}=createRuntime({economy:{productionAssets:[mill]}});
  const before=JSON.stringify(context.Game.state.economy.BGD.productionAssets[0]);
  const result=api.executeFactoryCycle({countryId:'BGD',factoryId:'STEEL-1',resourceId:'iron_concentrate',quantity:1000});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'FACTORY_INPUT_SHORTAGE');
  assert.equal(JSON.stringify(context.Game.state.economy.BGD.productionAssets[0]),before,'no ingredient or lot may be debited on a blocked cycle');
  assert.equal(context.Game.state.resource.BGD.batches.length,0,'a blocked cycle must not create output batches');
  const again=api.executeFactoryCycle({countryId:'BGD',factoryId:'STEEL-1',resourceId:'iron_concentrate',quantity:1000});
  assert.equal(again.status,'BLOCKED','blocked attempts must not occupy turn capacity');
});

test('factory-type mismatch cannot route a raw mineral into an unrelated downstream plant',()=>{
  const {api}=createRuntime({economy:{productionAssets:[steelMill()]}});
  assert.equal(api.candidateFactories('BGD','iron_ore').length,0);
  assert.equal(api.candidateFactories('BGD','iron_concentrate').length,1);
  const result=api.executeFactoryCycle({countryId:'BGD',factoryId:'STEEL-1',resourceId:'iron_ore',quantity:100});
  assert.equal(result.status,'BLOCKED');
  assert.match(result.reason,/RECIPE|INPUT|FACTORY_TYPE/);
});

test('uppercase finished goods are usable as lowercase downstream recipe inputs without unit guessing',()=>{
  const downstream={
    id:'ALLOY-1',countryId:'BGD',factoryType:'STEEL_AND_ALLOY_MILL',primaryInput:'steel_ingot',recipeResourceId:'steel_ingot',
    capacity:780,status:'OPERATIONAL',inputInventory:{},inputBatchLots:[],locationNodeKey:'INDUSTRIAL_ZONE:BGD'
  };
  const {api,context}=createRuntime({economy:{productionAssets:[downstream]},resource:{
    inventory:{STEEL_INGOT:780,NICKEL_CONCENTRATE:100,CHROMITE_CONCENTRATE:100},
    processedWarehouse:{warehouseId:'WH-BGD-PROCESSED',availableByResource:{STEEL_INGOT:780},reservedByResource:{},storedBatchIds:['OUTPUT:UPSTREAM:STEEL_INGOT']},
    batches:[{batchId:'OUTPUT:UPSTREAM:STEEL_INGOT',resourceId:'STEEL_INGOT',materialIdentity:'STEEL_INGOT',quantity:780,
      remainingQuantity:780,unit:'TONNES',stage:'FINISHED',status:'AVAILABLE',warehouseId:'WH-BGD-PROCESSED',createdTurn:1}],
    inventoryLots:{'OUTPUT:UPSTREAM:STEEL_INGOT':{batchId:'OUTPUT:UPSTREAM:STEEL_INGOT',resourceId:'STEEL_INGOT',quantity:780,
      remainingQuantity:780,unit:'TONNES',stage:'FINISHED',status:'AVAILABLE',warehouseId:'WH-BGD-PROCESSED'}}
  }});
  const result=api.executeFactoryCycle({countryId:'BGD',factoryId:'ALLOY-1',resourceId:'STEEL_INGOT',quantity:780});
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.recipeAuthority,'SIMULATED_MANUFACTURING_CATALOG');
  assert.equal(result.inputQuantities.steel_ingot,780);
  assert.equal(result.inputQuantities.nickel_concentrate,46.8);
  assert.equal(result.inputQuantities.chromite_concentrate,31.2);
  assert.equal(result.outputQuantities.ALLOY_STEEL,709.8);
  assert.ok(result.sourceBatchIds.includes('OUTPUT:UPSTREAM:STEEL_INGOT'));
  const r=context.Game.state.resource.BGD;
  assert.equal(r.processedWarehouse.availableByResource.STEEL_INGOT,0);
  assert.equal(r.inventory.STEEL_INGOT,0);
  assert.equal(r.processedWarehouse.availableByResource.ALLOY_STEEL,709.8);
});

test('construction projects resolve type, icon and capacity from the authoritative manufacturing catalogue',()=>{
  const {api,context}=createRuntime();
  const project=api.startFactoryProject({countryId:'BGD',resourceId:'iron_concentrate',factoryType:'STEEL_AND_ALLOY_MILL'});
  assert.equal(project.status,'UNDER_CONSTRUCTION');
  assert.equal(project.factoryType,'STEEL_AND_ALLOY_MILL');
  assert.equal(project.iconId,'steelworks');
  assert.equal(project.capacityPerDay,1800);
  assert.equal(project.cost,185000000);
  assert.equal(project.durationDays,300);
  assert.equal(project.recipeAuthority,'SIMULATED_MANUFACTURING_CATALOG');
  assert.equal(context.Game.state.resource.BGD.industrialNetwork.projects.length,1);
  const invalid=api.startFactoryProject({countryId:'BGD',resourceId:'iron_ore',factoryType:'STEEL_AND_ALLOY_MILL'});
  assert.equal(invalid.status,'BLOCKED');
  assert.equal(invalid.reason,'FACTORY_TYPE_RESOURCE_MISMATCH');
});
