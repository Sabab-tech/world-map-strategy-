import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function loadJson(path){
  return JSON.parse(readFileSync(path,'utf8'));
}

function buildResourceEngine(){
  const a=loadJson('resources.json');
  const b=loadJson('resources_2.json');
  const profiles={
    ...(a.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{}),
    ...(b.GSRSK_Master_CountryProfiles_v14?.countryProfiles||{})
  };
  const deposits=[...(a.runtime_deposits||[]),...(b.runtime_deposits||[])];
  const resourceTypes={
    ...(a.resource_types||{}),
    ...(b.resource_types||{}),
    ...(a.GSRSK_Master_Resource_Data_v14?.resource_types||{}),
    ...(b.GSRSK_Master_Resource_Data_v14?.resource_types||{})
  };
  return{
    isReady:true,
    countryProfiles:profiles,
    deposits,
    resourceTypes:Object.values(resourceTypes),
    normalizeCountryCode(value){return String(value||'').trim().toUpperCase();},
    getDataLoadReport(){
      return{
        status:'READY',
        authority:'RESOURCE_JSON',
        countryProfileCount:Object.keys(profiles).length,
        depositCount:deposits.length
      };
    }
  };
}

test('199 profile site references and structured deposits expose one canonical asset schema',()=>{
  const engine=buildResourceEngine();
  const identity={
    resolveCountry(value){
      const raw=String(value||'').trim().toUpperCase();
      for(const [key,profile] of Object.entries(engine.countryProfiles)){
        const i=profile?.identity||profile;
        if(
          String(key).toUpperCase()===raw ||
          String(i.iso3||'').toUpperCase()===raw ||
          String(i.iso2||'').toUpperCase()===raw ||
          String(i.name||'').toUpperCase()===raw
        )return{id:key};
      }
      return{id:raw};
    }
  };

  const context={
    console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,Intl,
    OmegaCanonicalIdentityRegistry:identity,
    ResourceMinistryEngine:engine,
    Omega:{CanonicalIdentity:identity}
  };
  context.globalThis=context;
  vm.createContext(context);

  vm.runInContext(
    readFileSync('omega_resource_part04_identity_runtime.js','utf8'),
    context,
    {filename:'omega_resource_part04_identity_runtime.js'}
  );

  const compiled=context.GSRSK_Part04.compileIdentities();
  assert.equal(compiled.status,'READY');

  const structuredCount=engine.deposits.length;
  const siteReferenceCount=compiled.siteReferenceCount;
  const unifiedAssets=compiled.registry.listUnifiedAssets();

  assert.equal(structuredCount,43,'Expected 43 source-backed structured deposit records');
  assert.equal(siteReferenceCount,199,'Expected 199 country-profile mine/site references');
  assert.equal(unifiedAssets.length,structuredCount+siteReferenceCount,'Unified asset count must equal structured deposits + profile site references');

  const firstKeys=Object.keys(unifiedAssets[0]||{}).sort();
  assert.ok(firstKeys.length>0,'Unified asset schema must not be empty');
  for(const asset of unifiedAssets)assert.deepEqual(Object.keys(asset).sort(),firstKeys);
  assert.equal(new Set(unifiedAssets.map(asset=>asset.assetId)).size,unifiedAssets.length,'Unified asset IDs must be unique');

  const structured=unifiedAssets.filter(asset=>asset.assetType==='STRUCTURED_DEPOSIT');
  const profileRefs=unifiedAssets.filter(asset=>asset.assetType==='PROFILE_SITE_REFERENCE');

  assert.equal(structured.length,structuredCount);
  assert.equal(profileRefs.length,siteReferenceCount);
  assert.ok(structured.every(asset=>asset.execution.extractionExecutable===true));
  assert.ok(profileRefs.every(asset=>asset.assetId.startsWith('ASSET:SITE:')));
  assert.ok(profileRefs.every(asset=>asset.siteReferenceKey));
  assert.ok(profileRefs.every(asset=>{
    const hasObservedQuantitative=asset.dataAuthority.resourceType==='OBSERVED'&&asset.dataAuthority.reserve==='OBSERVED';
    return asset.execution.quantitativeDataAvailable===hasObservedQuantitative;
  }));
  assert.ok(profileRefs.every(asset=>{
    const incomplete=asset.dataAuthority.resourceType!=='OBSERVED'||asset.dataAuthority.reserve!=='OBSERVED'||asset.dataAuthority.production!=='OBSERVED';
    return asset.execution.simulationEligible===incomplete;
  }));

  const sample=profileRefs[0];
  const byCountry=compiled.registry.getUnifiedAssetsByCountry(sample.countryId);
  assert.ok(byCountry.some(asset=>asset.assetId===sample.assetId));

  for(const ref of compiled.registry.listMineSiteReferences()){
    const unified=compiled.registry.getUnifiedAsset('ASSET:SITE:'+String(ref.siteReferenceKey).toUpperCase());
    assert(unified,'Every site reference must resolve to the same canonical asset registry');
    assert.equal(unified.siteReferenceKey,ref.siteReferenceKey);
    assert.equal(unified.countryId,ref.countryId);
    assert.equal(unified.siteName,ref.siteName);
    assert.equal(unified.dataAuthority.resourceType, unified.resourceType.id ? 'OBSERVED' : 'UNOBSERVED');
    assert.equal(unified.dataAuthority.reserve, unified.reserve.declared!=null ? 'OBSERVED' : 'UNOBSERVED');
    assert.equal(unified.dataAuthority.production, unified.production.ratePerDay!=null || unified.production.currentProduction!=null || unified.production.nominalCapacity!=null ? 'OBSERVED' : 'UNOBSERVED');
  }

  const schemaFingerprint=firstKeys.join('|');
  console.log('OMEGA UNIFIED RESOURCE ASSET TEST PASSED');
  console.log(JSON.stringify({
    certificate:'OMEGA-UNIFIED-RESOURCE-ASSET',
    status:'VERIFIED',
    structuredDepositCount:structuredCount,
    profileSiteReferenceCount:siteReferenceCount,
    canonicalUnifiedAssetCount:unifiedAssets.length,
    unifiedSchemaFingerprint:schemaFingerprint,
    sameSchemaForStructuredAndProfileAssets:true,
    realDataAuthorityPreserved:true,
    simulatedExecutionEligibilityExplicit:true
  },null,2));
});
