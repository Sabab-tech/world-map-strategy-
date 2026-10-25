import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const canonical=read('resource_site_canonical_catalog_v1.json');
const reserve=read('resource_site_reserve_simulation_v1.json');
const completion=read('resource_site_quantity_completion_v1.json');
const mineplayBase=read('resource_site_country_mineplay_batch_20261020_v1.json');
const mineplayExpanded=read('resource_site_country_mineplay_batch_20261024_v1.json');
const mineplayCritical=read('resource_site_country_mineplay_critical_batch_20261024_v1.json');
const legacy=Array.from({length:6},(_,i)=>read('resource_site_legacy_gameplay_expansion_part_'+(i+1)+'_v1.json')).flatMap(x=>x.records||[]);
const resources1=read('resources.json'),resources2=read('resources_2.json'),industrial=read('resource_industrial_catalog_v1.json');

const aliases=new Set([
 'SITE_AUS_olympic_dam_uranium_copper','SITE_BRA_carajas_iron_ore_mine_legacy2',
 'SITE_CHL_escondida_copper_mine_legacy2','SITE_IDN_grasberg_copper_gold_mine',
 'SITE_COD_tenke_fungurume_copper_cobalt_complex','SITE_COD_kibali_gold_mine_complex',
 'SITE_CAN_voiseys_bay_nickel_mine','SITE_GBR_boulby_mine','SITE_SWE_kiruna_iron_ore_mine',
 'SITE_PRK_musan_iron_ore_mine'
]);
const validCoordinates=row=>{
 const country=String(row?.countryId||row?.identity?.countryIso3||'').trim().toUpperCase();
 const lat=Number(row?.location?.coordinates?.lat),lng=Number(row?.location?.coordinates?.lng);
 return /^[A-Z]{3}$/.test(country)&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&Number.isFinite(lng)&&lng>=-180&&lng<=180;
};
const byId=new Map((canonical.sites||[]).map(site=>[String(site.siteId),site]));
for(const site of legacy){
 const id=String(site?.siteId||'').trim();
 if(!id||site?.runtime?.aliasOfSiteId||aliases.has(id)||byId.has(id)||!validCoordinates(site))continue;
 byId.set(id,site);
}
const uniqueMineplay=[...new Map([...mineplayBase.records,...mineplayExpanded.records,...mineplayCritical.records]
 .filter(site=>site?.siteId).map(site=>[String(site.siteId),site])).values()];
for(const site of uniqueMineplay){
 const id=String(site?.siteId||'').trim();
 if(!id||site?.runtime?.aliasOfSiteId||site?.map?.markerEligible===false||byId.has(id)||!validCoordinates(site))continue;
 byId.set(id,site);
}
const resourceId=site=>String(site?.identity?.resourceTypeId||site?.real?.resourceId||site?.resourceId||
 site?.resourceTypeId||site?.sourceSiteRecord?.resourceId||site?.sourceSiteRecord?.resourceTypeId||'').toLowerCase().trim();
const eligible=site=>{
 const id=String(site?.siteId||'').trim();
 return !!id&&!!resourceId(site)&&site?.map?.markerEligible!==false&&!site?.map?.aliasOfSiteId&&
  !site?.runtime?.aliasOfSiteId&&site?.commercialExtraction!==false&&site?.operation?.commercialExtraction!==false&&
  String(site?.operation?.status||site?.status||'').toUpperCase()!=='NOT_APPLICABLE';
};
const baseIds=new Set(reserve.records.map(row=>String(row.siteId)));
const completionIds=(completion.records||[]).map(row=>String(row.siteId));
const completionSet=new Set(completionIds);
const eligibleSites=[...byId.values()].filter(eligible);
const missingBase=eligibleSites.filter(site=>!baseIds.has(String(site.siteId)));

assert.equal(reserve.siteCount,250,'historical base reserve contract must remain unchanged');
assert.equal(reserve.records.length,250,'base reserve records must remain lossless');
assert.equal(completion.datasetId,'OMEGA_RESOURCE_SITE_QUANTITY_COMPLETION_V1');
assert.equal(completion.recordCount,completion.records.length);
assert.equal(completionIds.length,completionSet.size,'completion rows must have unique site IDs');
assert.equal(missingBase.length,305,'every eligible site outside the base reserve authority must be accounted for');
assert.equal(completionIds.length,missingBase.length,'supplement must cover all and only eligible sites missing from the base reserve file');
assert.ok(missingBase.every(site=>completionSet.has(String(site.siteId))),'missing reserve records must be filled by site ID');
assert.ok(completion.records.every(row=>row.reserve?.status==='SIMULATED'&&Number(row.reserve.quantity)>0&&row.resourceId),
 'completion quantities must be positive, explicitly simulated and resource-bound');
assert.ok(completion.records.every(row=>row.provenance?.simulationOnly===true&&row.provenance?.gameplayHorizonYears===400),
 'completion rows must identify simulation-only provenance and the gameplay horizon');

const definitions=new Set();
for(const file of [resources1,resources2]){
 for(const key of Object.keys(file.resource_types||{}))definitions.add(String(key).toLowerCase());
 for(const key of Object.keys(file.GSRSK_Master_Resource_Data_v14?.resource_types||{}))definitions.add(String(key).toLowerCase());
}
assert.equal(definitions.size,41,'master resource definitions must include the 41 catalogued resource types');
const siteResources=new Set(eligibleSites.map(resourceId));
assert.ok([...siteResources].every(id=>definitions.has(id)),'every eligible site resource ID must have a master definition');
assert.ok([...siteResources].every(id=>industrial.resourceRules?.[id]),'every eligible site resource ID must have extraction rules');
assert.ok([...siteResources].every(id=>industrial.processingRules?.[id]),'every eligible site resource ID must have processing rules');

console.log('PASS resource quantity completion: '+eligibleSites.length+' eligible sites, '+completion.records.length+' additive reserve rows, 41 resource definitions, and unit/provenance contracts.');
