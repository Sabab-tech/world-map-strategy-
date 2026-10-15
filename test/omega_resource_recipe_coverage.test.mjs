import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const readJson=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const readText=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const tok=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');

function rowsOf(data){
  if(Array.isArray(data))return data;
  if(Array.isArray(data?.sites))return data.sites;
  if(Array.isArray(data?.records))return data.records;
  if(data?.sitesById&&typeof data.sitesById==='object')return Object.values(data.sitesById);
  return [];
}
function resourceOf(site){
  return site?.identity?.resourceTypeId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId||
    site?.resourceId||site?.resourceTypeId||site?.resource?.id||null;
}
function makeRuntime(catalog){
  const bus={listeners:new Map(),addEventListener(type,fn){const a=this.listeners.get(type)||[];a.push(fn);this.listeners.set(type,a);},
    dispatchEvent(evt){for(const fn of this.listeners.get(evt.type)||[])fn(evt);return true;}};
  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,Promise,JSON,Date,Intl,
    Game:{state:{simulation:{turn:1,startYear:2025,date:'2025-01-01',daysPerTurn:30},resource:{},economy:{},transport:{},trade:{},finance:{},foreign:{}}},
    Omega:{ResourceIndustrialCatalogData:catalog},
    OmegaResourceIndustrialCatalogData:catalog,
    ResourceMinistryEngine:{resourceTypes:[]},
    addEventListener:bus.addEventListener.bind(bus),dispatchEvent:bus.dispatchEvent.bind(bus),
    fetch:async()=>({ok:true,status:200,json:async()=>catalog})
  };
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(readText('omega_resource_industrial_network_v1.js'),context,{filename:'omega_resource_industrial_network_v1.js'});
  return context.Omega.ResourceIndustrialNetwork;
}

test('every catalog resource and every registered deposit resource has an executable factory recipe',()=>{
  const catalog=readJson('resource_industrial_catalog_v1.json');
  const api=makeRuntime(catalog);
  assert.ok(api&&typeof api.recipeFor==='function','Industrial Network must expose its authoritative recipe resolver');
  const catalogResources=Object.keys(catalog.resourceRules||{});
  const processRules=catalog.processingRules||{};
  const missing=catalogResources.filter(rid=>!processRules[tok(rid)]);
  assert.deepEqual(missing,[],'every known extractable resource must have an explicit processing rule');
  for(const rid of catalogResources){
    const recipe=api.recipeFor(rid,{});
    assert.ok(Object.keys(recipe.inputs||{}).some(x=>tok(x)===tok(rid)),rid+': recipe must consume its source commodity');
    assert.ok(Object.keys(recipe.outputs||{}).length>0,rid+': recipe must produce at least one output');
    for(const [output,ratio] of Object.entries(recipe.outputs)){
      assert.ok(Number.isFinite(Number(ratio))&&Number(ratio)>0,rid+': invalid output coefficient for '+output);
    }
    assert.equal(recipe.recipeAuthority,'INDUSTRIAL_CATALOG_RULE',rid+': catalog-defined resources must not silently use the generic fallback');
  }

  const manifest=readJson('resource_site_reference_expanded_manifest.json');
  const dataFiles=[
    'resource_site_canonical_catalog_v1.json',
    'resource_site_master_registry_v1.json',
    ...(manifest.parts||[]).map(x=>x.file)
  ];
  const allSites=[];
  const seen=new Set();
  for(const name of dataFiles){
    let data;
    try{data=readJson(name);}catch(error){throw new Error('Cannot load authoritative site source '+name+': '+error.message);}
    for(const site of rowsOf(data)){
      const id=String(site?.siteId||site?.id||'').trim();
      if(!id||seen.has(id))continue;
      seen.add(id);allSites.push(site);
    }
  }
  const siteResourceIds=[...new Set(allSites.map(resourceOf).filter(Boolean).map(tok))];
  assert.ok(allSites.length>0,'canonical/master/legacy registry must supply deposit records');
  assert.ok(siteResourceIds.length>0,'deposit resource identifiers must be available');
  const unusable=[];
  for(const rid of siteResourceIds){
    const recipe=api.recipeFor(rid,{});
    if(!Object.keys(recipe.inputs||{}).some(x=>tok(x)===rid)||!Object.keys(recipe.outputs||{}).length)
      unusable.push({resourceId:rid,recipe});
  }
  assert.deepEqual(unusable,[],'every currently registered deposit resource must resolve through the same factory recipe contract');
  
  const future='future_strategic_metal';
  const fallback=api.recipeFor(future,{});
  assert.equal(fallback.recipeAuthority,'SIMULATED_GENERIC_FALLBACK');
  assert.ok(Object.keys(fallback.inputs).some(x=>tok(x)===tok(future)));
  assert.ok(Object.keys(fallback.outputs).includes('FUTURE_STRATEGIC_METAL_PROCESSED'));
  assert.ok(Object.keys(fallback.outputs).includes('PROCESSING_RESIDUE'));
  assert.ok(Object.values(fallback.outputs).every(x=>Number(x)>0&&Number.isFinite(Number(x))));
  console.log(JSON.stringify({catalogResources:catalogResources.length,explicitRecipes:Object.keys(processRules).length,
    registeredUniqueSites:allSites.length,registeredResourceTypes:siteResourceIds.length,futureResourceFallback:'SIMULATED_GENERIC_FALLBACK'}));
});
