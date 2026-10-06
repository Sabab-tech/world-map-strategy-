import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const catalog=JSON.parse(readFileSync('resource_technology_catalog_v1.json','utf8'));
globalThis.OmegaResourceTechnologyCatalogData=catalog;
globalThis.Game={state:{
  simulation:{turn:1},
  resource:{
    AAA:{technologyCapabilities:[],technologyResearchProjects:[],technologyTransfers:[]},
    BBB:{technologyCapabilities:[],technologyResearchProjects:[],technologyTransfers:[]}
  },
  technology:{
    AAA:{research:{efficiency:2}},
    BBB:{research:{efficiency:2}}
  },
  foreign:{
    AAA:{relations:{BBB:80}},
    BBB:{relations:{AAA:80}}
  }
}};

const handlers=new Map();
const deepClone=x=>JSON.parse(JSON.stringify(x));
function makeTx(country){
  const state=globalThis.Game.state;
  const base=deepClone(state.resource[country]||{});
  return {
    get(path){
      const key=String(path).replace(/^resource\\./,'');
      if(key==='resource')return deepClone(base);
      if(key==='technology')return deepClone(state.technology?.[country]||{});
      if(key==='foreign')return deepClone(state.foreign?.[country]||{});
      return deepClone(base[key]);
    },
    set(path,value){
      const key=String(path).replace(/^resource\\./,'');
      if(key==='resource')Object.assign(base,deepClone(value)); else base[key]=deepClone(value);
    },
    commit(){state.resource[country]=base;}
  };
}
globalThis.Omega={MinistryInteroperability:{
  registerAction(){},
  registerCommandHandler(type,_owner,handler){handlers.set(type,handler);},
  dispatchCommand(_owner,type,country,payload){
    const tx=makeTx(country);
    const result=handlers.get(type)?.({payload},{countryId:country,stateTransaction:tx});
    tx.commit();
    return result;
  }
}};
await import('../omega_resource_research_runtime_v1.js');
const R=globalThis.Omega.ResourceResearchRuntime;

test('technology catalog is data-driven and has unique definitions',()=>{
  assert.equal(catalog.datasetId,'OMEGA_RESOURCE_TECHNOLOGY_CATALOG_V1');
  assert.equal(catalog.technologies.length,12);
  assert.equal(new Set(catalog.technologies.map(x=>x.technologyId)).size,12);
  assert(catalog.technologies.every(x=>x.authority===undefined||x.authority.includes('SCENARIO')));
});

test('research unlocks a capability and changes site engineering inputs only after completion',()=>{
  const start=R.startResearch('AAA',{technologyId:'DIGITAL_MAINTENANCE',targetSiteId:'SITE_A',targetResourceId:'coal',targetSiteType:'COAL_MINE'});
  assert.equal(start.status,'STARTED');
  for(let i=0;i<4;i++)R.processCountry('AAA');
  const caps=globalThis.Game.state.resource.AAA.technologyCapabilities;
  assert.equal(caps.length,1);
  assert.equal(caps[0].sourceType,'RESEARCH');
  const fx=R.getEngineeringEffect('AAA','SITE_A','coal','COAL_MINE');
  assert.equal(fx.technologies.length,1);
  assert.equal(fx.maintenanceMultiplier,0.88);
  assert.equal(fx.utilizationAdd,0.02);
});

test('technology can be imported from a country that already possesses it',()=>{
  globalThis.Game.state.resource.BBB.technologyCapabilities=[{
    technologyId:'AUTONOMOUS_MINE_HAULAGE',
    targetSiteId:'SITE_B',
    targetResourceId:'coal',
    targetSiteType:'COAL_MINE',
    sourceType:'RESEARCH',
    effects:catalog.technologies.find(x=>x.technologyId==='AUTONOMOUS_MINE_HAULAGE').effects
  }];
  const start=R.importTechnology('AAA',{technologyId:'AUTONOMOUS_MINE_HAULAGE',donorCountryId:'BBB',targetSiteId:'SITE_B',targetResourceId:'coal',targetSiteType:'COAL_MINE'});
  assert.equal(start.status,'STARTED');
  for(let i=0;i<4;i++)R.processCountry('AAA');
  const imported=globalThis.Game.state.resource.AAA.technologyCapabilities.find(x=>x.technologyId==='AUTONOMOUS_MINE_HAULAGE');
  assert.equal(imported?.sourceType,'IMPORTED');
  assert.equal(imported?.donorCountryId,'BBB');
  const fx=R.getEngineeringEffect('AAA','SITE_B','coal','COAL_MINE');
  assert.equal(fx.capacityMultiplier,1.08);
});

test('resource realism consumes researched technology and keeps gold ore tonnes distinct from ounces',async()=>{
  const fs=readFileSync('omega_resource_realism_runtime_v1.js','utf8');
  (0,eval)(fs);
  const model=globalThis.OmegaResourceRealism.siteModel({
    id:'SITE_A',
    siteReferenceKey:'SITE_A',
    siteName:'Test Coal Mine',
    siteType:'COAL_MINE',
    resourceId:'coal',
    productionRate:1000,
    grade:'2%',
    simulationReserveQuantity:100000000,
    simulationReserveUnit:'TONNES'
  },{},'AAA');
  assert.equal(model.commodityStreams[0].production.technologyAdjusted,true);
  assert.equal(model.commodityStreams[0].production.technologyEffects.technologies.length,1);
  assert.equal(model.commodityStreams[0].production.technologyEffects.maintenanceMultiplier,0.88);
  const parsed=globalThis.OmegaResourceRealism.parseReserve('10 million tonnes','gold');
  assert.equal(parsed.value,10000000);
  assert.equal(parsed.unit,'TONNES');
});
