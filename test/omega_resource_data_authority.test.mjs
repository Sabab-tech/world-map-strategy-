import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

function cleanup(saved){
  for(const [key,value] of Object.entries(saved)){
    if(value===undefined)delete globalThis[key];
    else globalThis[key]=value;
  }
}

test('resource site data is loaded from JSON with explicit capacity provenance', async()=>{
  const siteData=JSON.parse(fs.readFileSync(new URL('../resource_deposits.json',import.meta.url),'utf8'));
  const ruleData=JSON.parse(fs.readFileSync(new URL('../resource_economy_rules.json',import.meta.url),'utf8'));
  const ids=[...new Set(siteData.deposits.map(x=>String(x.resId||'').trim()).filter(Boolean))];
  const resourceTypes=Object.fromEntries(ids.map(id=>[id,{id,name:id,unit:id==='natural_gas'?'bcm':'metric_tons'}]));
  const saved={
    ResourceMinistryEngine:globalThis.ResourceMinistryEngine,
    OmegaResourceDataAuthority:globalThis.OmegaResourceDataAuthority,
    __omegaResourceDataAuthorityPromise:globalThis.__omegaResourceDataAuthorityPromise,
    __OmegaResourceDataAuthorityReady:globalThis.__OmegaResourceDataAuthorityReady,
    __OmegaResourceDataAuthorityDiagnostics:globalThis.__OmegaResourceDataAuthorityDiagnostics,
    fetch:globalThis.fetch
  };
  try{
    globalThis.ResourceMinistryEngine={
      isReady:true,
      deposits:[{id:'LEGACY_HARDCODED_RECORD'}],
      resourceTypes:[],
      normalizeCountryCode(value){return String(value).toUpperCase();}
    };
    globalThis.fetch=async url=>({
      ok:true,
      status:200,
      async json(){
        const name=String(url).split('?')[0];
        if(name==='resources.json')return{resource_types:resourceTypes};
        if(name==='resources_2.json')return{};
        if(name==='resource_deposits.json')return siteData;
        if(name==='resource_economy_rules.json')return ruleData;
        return{};
      }
    });
    await import('../omega_resource_data_authority_v1.js');
    const diagnostics=await globalThis.__omegaResourceDataAuthorityPromise;
    const rows=globalThis.ResourceMinistryEngine.deposits||[];
    assert.equal(diagnostics.status,'READY');
    assert.equal(rows.length,siteData.deposits.length);
    assert.equal(rows.some(x=>x.id==='LEGACY_HARDCODED_RECORD'),false);
    assert.equal(rows.filter(x=>x.countryCode==='BGD').length,4);
    const gas=rows.find(x=>x.id==='dep-bibiyana-gas');
    assert.equal(gas.productionRateStatus,'DERIVED_GAME_RULE');
    assert.ok(gas.productionRatePerDay>0);
    assert.equal(gas.unit,'bcm');
    const api=rows.find(x=>x.id==='dep-ghawar-oil');
    if(api?.grade && /API/i.test(String(api.grade)))assert.equal(api.gradeValue,null);
    const coal=rows.find(x=>x.id==='dep-barapukuria-coal');
    assert.equal(coal.resourceId,'coal');
    assert.equal(coal.sourceDataIntegrityStatus,'VALIDATED');
  }finally{
    cleanup(saved);
  }
});
