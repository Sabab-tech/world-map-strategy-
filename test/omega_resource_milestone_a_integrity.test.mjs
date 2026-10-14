import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const readText=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

const canonical=read('resource_site_canonical_catalog_v1.json');
const master=read('resource_site_master_registry_v1.json');
const reserves=read('resource_site_reserve_simulation_v1.json');
const countryExpansion=read('resource_site_country_expansion_v1.json');
const researchOverlay=read('resource_site_research_facts_overlay_v1.json');
const legacyParts=[1,2,3,4,5,6].map(n=>read('resource_site_legacy_gameplay_expansion_part_'+n+'_v1.json'));
const allLegacy=legacyParts.flatMap(p=>p.records);
const part6=legacyParts[5];
const aliasMap={
 SITE_AUS_olympic_dam_uranium_copper:'SITE_AUS_olympic_dam_mine',
 SITE_BRA_carajas_iron_ore_mine_legacy2:'SITE_BRA_carajas_iron_ore_mine',
 SITE_CHL_escondida_copper_mine_legacy2:'SITE_CHL_escondida_copper_mine',
 SITE_IDN_grasberg_copper_gold_mine:'SITE_IDN_grasberg_mine',
 SITE_COD_tenke_fungurume_copper_cobalt_complex:'SITE_COD_tenke_fungurume_mine',
 SITE_COD_kibali_gold_mine_complex:'SITE_COD_kibali_gold_mine'
};
const norm=v=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const countryOf=x=>String(x?.countryId||x?.identity?.countryIso3||x?.countryCode||'').toUpperCase();
const resourceOf=x=>String(x?.resourceId||x?.identity?.resourceTypeId||x?.resourceTypeId||x?.resourceTypeKey||'').toLowerCase().replace(/^res_type:/,'');
const aliasOf=x=>x?.runtime?.aliasOfSiteId||x?.map?.aliasOfSiteId||x?.identity?.aliasOfSiteId||aliasMap[x?.siteId]||null;

assert.equal(canonical.siteCount,315);
assert.equal(canonical.sites.length,315);
assert.equal(new Set(canonical.sites.map(x=>x.siteId)).size,315,'canonical site IDs must be unique');
assert.equal(master.siteCount,250);
assert.equal(master.sites.length,250);
assert.equal(reserves.siteCount,250);
assert.equal(reserves.records.length,250);
assert.equal(countryExpansion.records.length,0);
assert.equal(countryExpansion.migratedSiteCount,51);
assert.equal(researchOverlay.records.length,0);
assert.equal(researchOverlay.migratedSiteCount,51);
assert.deepEqual(legacyParts.map(p=>p.records.length),[13,13,13,13,13,50]);
assert.equal(allLegacy.length,115);
assert.equal(new Set(allLegacy.map(x=>x.siteId)).size,115,'source expansion IDs must be unique across all six packs');
const canonicalIds=new Set(canonical.sites.map(x=>x.siteId));
const legacyIds=new Set(allLegacy.map(x=>x.siteId));
assert.equal(allLegacy.filter(x=>canonicalIds.has(x.siteId)).length,65,'the initial 65 expansion records must remain canonical');
assert.equal(allLegacy.filter(x=>!canonicalIds.has(x.siteId)).length,50,'the next 50 records must be additive');
assert.equal(part6.records.filter(x=>canonicalIds.has(x.siteId)).length,0,'Part 6 must not overwrite canonical identity rows');

const base250=canonical.sites.slice(0,250);
const baseById=new Map(base250.map(x=>[x.siteId,x]));
const reserveById=new Map(reserves.records.map(x=>[x.siteId,x]));
assert.equal(baseById.size,250);
assert.equal(reserveById.size,250);
for(const site of base250){
  const reserve=reserveById.get(site.siteId);
  assert(reserve,site.siteId+': reserve binding missing');
  assert.equal(reserve.countryId,countryOf(site),site.siteId+': country mismatch');
  assert.equal(resourceOf(reserve),resourceOf(site),site.siteId+': resource mismatch');
  assert.equal(reserve.siteName,site.siteName,site.siteId+': name mismatch');
  assert.equal(reserve.provenance?.authority,'SCENARIO_SIMULATION_DATA',site.siteId+': reserve authority must remain simulated');
}

for(const row of allLegacy){
  const country=countryOf(row),resource=resourceOf(row),target=aliasOf(row);
  assert.match(row.siteId,/^SITE_[A-Z]{3}_[A-Za-z0-9][A-Za-z0-9_-]*$/,row.siteId+': malformed stable site ID');
  assert.match(country,/^[A-Z]{3}$/,row.siteId+': invalid ISO-3');
  assert.equal(row.identity?.countryIso3,country,row.siteId+': identity country mismatch');
  assert.ok(resource,row.siteId+': resource ID missing');
  if(row.resourceId)assert.equal(resource, String(row.resourceId).toLowerCase(),row.siteId+': top-level resource differs from identity');
  const c=row.location?.coordinates||{};
  assert(Number.isFinite(c.lat)&&c.lat>=-90&&c.lat<=90,row.siteId+': invalid latitude');
  assert(Number.isFinite(c.lng)&&c.lng>=-180&&c.lng<=180,row.siteId+': invalid longitude');
  assert.equal(row.location?.countryBoundaryKey,country,row.siteId+': location boundary mismatch');
  assert.equal(row.map?.countryIsolationKey,country,row.siteId+': map country isolation mismatch');
  assert.equal(row.logistics?.warehouseCountryId,country,row.siteId+': warehouse country mismatch');
  assert.equal(row.logistics?.transport?.originCountryId,country,row.siteId+': route origin country mismatch');
  assert.equal(row.logistics?.transport?.destinationCountryId,country,row.siteId+': route destination country mismatch');
  assert.equal(row.simulation?.factoryBinding?.countryId,country,row.siteId+': factory country mismatch');
  assert.equal(row.simulation?.factoryBinding?.requiresSameCountryWarehouse,true,row.siteId+': factory country guard missing');
  for(const field of ['reserve','production','grade','recovery','throughput','purity','capacity']){
    const q=row.quantitative?.[field];
    assert(q&&typeof q==='object',row.siteId+': '+field+' quantity object missing');
    assert.equal(q.status,'SIMULATED',row.siteId+': '+field+' must state simulation status');
    assert(q.unit,row.siteId+': '+field+' unit missing');
  }
  const q=row.quantitative;
  assert(Number.isFinite(q.reserve.quantity)&&q.reserve.quantity>0,row.siteId+': reserve invalid');
  assert(Number.isFinite(q.production.rate)&&q.production.rate>0,row.siteId+': production rate invalid');
  assert(Number.isFinite(q.production.annual)&&q.production.annual>0,row.siteId+': annual production invalid');
  assert(Number.isFinite(q.grade.value)&&q.grade.value>0,row.siteId+': grade invalid');
  assert(Number.isFinite(q.purity.value)&&q.purity.value>0&&q.purity.value<=100,row.siteId+': purity invalid');
  assert(Number.isFinite(q.recovery.value)&&q.recovery.value>0&&q.recovery.value<=100,row.siteId+': recovery invalid');
  assert(Number.isFinite(q.throughput.value)&&q.throughput.value>0,row.siteId+': throughput invalid');
  assert(q.capacity.minimum>0&&q.capacity.minimum<=q.capacity.nominal&&q.capacity.nominal<=q.capacity.maximum,row.siteId+': capacity order invalid');
  assert.equal(q.quantitativeProvenance?.authority?.includes('SIMULATION')||q.quantitativeProvenance?.authority==='SCENARIO_SIMULATION_DATA',true,row.siteId+': simulated provenance missing');
  assert.equal(q.quantitativeProvenance?.externalMeasuredValuePromotion,false,row.siteId+': simulation cannot be promoted to observation');
  for(const field of ['reserve','production','grade','recovery','throughput','purity','capacity'])
    assert.equal(q.completeness?.[field],q[field].status,row.siteId+': completeness/status mismatch for '+field);
  const alias=Boolean(target);
  if(alias){
    assert.equal(row.operation?.commercialExtraction,false,row.siteId+': alias must be non-executable');
    assert.equal(row.map?.markerEligible,false,row.siteId+': alias must not create an independent marker');
    assert(legacyIds.has(target)||canonicalIds.has(target),row.siteId+': alias target missing: '+target);
  }
}
const legacyAliasRows=allLegacy.filter(x=>aliasOf(x));
assert.equal(legacyAliasRows.length,10,'aliases must be explicit and enumerable');
assert.equal(legacyAliasRows.filter(x=>x.map?.markerEligible===false).length,10,'aliases cannot create a duplicate map marker');
assert.equal(part6.records.every(x=>x.operation?.commercialExtraction===true&&x.map?.markerEligible===true&&!aliasOf(x)),true,'all Part 6 sites are distinct executable map candidates');
for(const row of allLegacy.filter(x=>canonicalIds.has(x.siteId))){
  const c=canonical.sites.find(y=>y.siteId===row.siteId);
  assert.equal(countryOf(c),countryOf(row),row.siteId+': source overlap has country disagreement');
  assert.equal(resourceOf(c),resourceOf(row),row.siteId+': source overlap has resource disagreement');
  assert.equal(norm(c.siteName),norm(row.siteName),row.siteId+': source overlap has name disagreement');
  assert.equal(c.location?.coordinates?.lat,row.location?.coordinates?.lat,row.siteId+': source overlap has latitude disagreement');
  assert.equal(c.location?.coordinates?.lng,row.location?.coordinates?.lng,row.siteId+': source overlap has longitude disagreement');
}

// Load and execute the production registry contract used by the app.
const context=vm.createContext({console,globalThis:null,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date});
context.globalThis=context;
new vm.Script(readText('omega_resource_site_integrity_v1.js'),{filename:'omega_resource_site_integrity_v1.js'}).runInContext(context);
const I=context.Omega.ResourceSiteIntegrity;
assert.equal(I.VERSION,'1.0.0');

const knownIds=new Set([...canonicalIds,...legacyIds]);
const fullRuntimeRegistry=canonical.sites.concat(part6.records);
const audit=I.auditRegistry(fullRuntimeRegistry,{aliasMap,allowExternalAliasTargets:knownIds});
console.log(JSON.stringify({
  certificate:'OMEGA-MILESTONE-A-RESOURCE-INTEGRITY',
  status:audit.status,
  canonicalSites:canonical.sites.length,
  additivePart6Sites:part6.records.length,
  registrySites:fullRuntimeRegistry.length,
  uniqueSiteIds:audit.uniqueSiteIdCount,
  physicalMarkers:audit.markerEligibleCount,
  aliasCount:audit.aliasCount,
  quantitativeCoverage:audit.metricCoverage,
  annualUnitChecks:audit.metricCoverage.annualUnitChecks,
  duplicateIdentityGroups:audit.duplicateIdentityGroups.length,
  markerCollisionGroups:audit.markerCollisionGroups.length,
  errors:audit.errorCount,
  warnings:audit.warningCount,
  errorCounts:audit.errors.reduce((acc,error)=>{acc[error.code]=(acc[error.code]||0)+1;return acc;},{}),
  errorSample:audit.errors.slice(0,120)
},null,2));
assert.equal(audit.status,'PASS','integrity audit failed: '+JSON.stringify(audit.errors.slice(0,20)));
assert.equal(audit.siteCount,365);
assert.equal(audit.uniqueSiteIdCount,365);
assert.equal(audit.aliasTargetsNotFound.length,0);
assert.equal(audit.markerCollisionGroups.length,1,'the only same-coordinate marker overlap must be explicitly reviewed');
assert.equal(audit.markerCollisionGroups[0].intentional,true,'Geita regional point collision must be a declared cluster, not silently deduplicated');
assert.deepEqual([...audit.markerCollisionGroups[0].siteIds].sort(),['SITE_TZA_geita_gold_mine','SITE_TZA_geita_gold_mine_super_pit'].sort());

// All six expansion packs have unique identity records; exact duplicate coordinates must be explicitly declared, not silently hidden.
const expansionAudit=I.auditRegistry(allLegacy,{aliasMap,allowExternalAliasTargets:knownIds});
assert.equal(expansionAudit.status,'PASS','expansion integrity audit failed: '+JSON.stringify(expansionAudit.errors.slice(0,20)));
assert.equal(expansionAudit.siteCount,115);
assert.equal(expansionAudit.uniqueSiteIdCount,115);
assert.equal(expansionAudit.aliasCount,10);
assert.equal(expansionAudit.aliasTargetsNotFound.length,0);

for(const file of ['index.html','server_bootstrap.js']){
  const source=readText(file);
  assert(source.includes('omega_resource_site_integrity_v1.js'),file+': shared integrity contract must be in the boot chain');
}
const endowmentSource=readText('omega_resource_endowment_runtime.js');
assert(endowmentSource.includes('OmegaResourceSiteIntegrity'), 'endowment runtime must consume the site integrity contract');
assert(endowmentSource.includes('OMEGA_RESOURCE_SITE_INTEGRITY_FAILED'), 'registry integrity failure must be visible in runtime diagnostics');

console.log('OMEGA MILESTONE A RESOURCE INTEGRITY TEST PASSED');
