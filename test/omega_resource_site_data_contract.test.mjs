import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const base = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const expansion = JSON.parse(read('resource_site_country_expansion_v1.json'));
const overlay = JSON.parse(read('resource_site_research_facts_overlay_v1.json'));
const runtime = read('omega_resource_endowment_runtime.js');
const network = read('omega_resource_industrial_network_v1.js');

const integrityContext=vm.createContext({console,Math,Number,String,Object,Array,Set,Map,WeakMap,JSON,Date,globalThis:null});
integrityContext.globalThis=integrityContext;
new vm.Script(read('omega_resource_site_integrity_v1.js'),{filename:'omega_resource_site_integrity_v1.js'}).runInContext(integrityContext);
const integrity=integrityContext.Omega.ResourceSiteIntegrity;
const normalizedRows=rows.map(site=>integrity.normalizeSiteRecord(site));

const rows = base.sites;
assert.equal(base.siteCount, 315);
assert.equal(rows.length, 315);
assert.equal(new Set(rows.map(s => s.siteId)).size, 315);
assert.equal(expansion.siteCount, 0);
assert.equal(expansion.records.length, 0);
assert.equal(expansion.migratedSiteCount, 51);
assert.equal(overlay.siteCount, 0);
assert.equal(overlay.records.length, 0);
assert.equal(overlay.migratedSiteCount, 51);
const migratedIds = new Set(expansion.migratedSiteIds);
const statuslessRawFields=rows.flatMap(site=>fields.filter(field=>!site.quantitative?.[field]?.status).map(field=>({siteId:site.siteId,field,source:site.quantitative?.[field]||{}})));
for(const missing of statuslessRawFields){
  const normalized=normalizedRows.find(site=>site.siteId===missing.siteId)?.quantitative?.[missing.field];
  assert(normalized&&typeof normalized.status==='string',missing.siteId+': missing source status must be normalized explicitly');
  if(['UNOBSERVED','UNQUANTIFIED','UNKNOWN','NOT_APPLICABLE'].includes(normalized.status)){
    for(const key of ['quantity','value','annual','rate','nominal','minimum','maximum'])
      if(Object.prototype.hasOwnProperty.call(normalized,key))assert.equal(normalized[key],null,missing.siteId+': statusless '+missing.field+'.'+key+' must remain null');
  }
}
assert.equal(migratedIds.size, 51);
assert.ok([...migratedIds].every(id => rows.some(s => s.siteId === id)), 'all migrated IDs must live in canonical catalog');

const fields = ['reserve','production','grade','recovery','throughput','purity','capacity'];
for (const site of normalizedRows) {
  assert.ok(site.siteId, 'site ID required');
  assert.match(String(site.countryId || site.identity?.countryIso3 || ''), /^[A-Z]{3}$/);
  for (const field of fields) {
    const value = site.quantitative?.[field];
    assert.ok(value && typeof value === 'object', site.siteId + ': quantitative.' + field + ' shape required');
    assert.ok(typeof value.status === 'string' && value.status.length > 0, site.siteId + ': quantitative.' + field + ' status required');
  }
  const coords = site.location?.coordinates || {};
  assert.ok(Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lng)), site.siteId + ': coordinates required');
}
for (const site of rows.filter(s => migratedIds.has(s.siteId))) {
  assert.equal(site.runtime?.identityAuthority, 'CANONICAL_CATALOG');
  assert.equal(site.runtime?.quantityAuthority, 'SIMULATION_RUNTIME');
  assert.ok(site.researchFacts, site.siteId + ': overlay facts must be integrated in canonical row');
  assert.ok(site.sourceReference.evidence.some(e => /^https:\/\//.test(e.url)), site.siteId + ': source reference required');
}
assert.match(runtime, /function normalizeSiteQuantitative\(row\)/);
assert.match(runtime, /const normalizedRows=rows\.map\(normalizeSiteRecord\)/);
assert.match(runtime, /g\.OmegaResourceSiteDataContract=/);
assert.match(network, /quantitative:clone\(row\?\.quantitative\|\|\{\}\)/);
assert.match(network, /function quantitativeEngineAdapter\(site, quantitative\)/);
assert.match(network, /productionModel\.productionRate=dailyRate/);
assert.match(network, /observedStatus\(p\)&&perDay\(p\.unit\)/);
assert.match(network, /distanceStatus:'UNOBSERVED'/);

test('all 315 canonical records share a typed runtime contract with explicit authority states', () => {
  for (const site of normalizedRows) {
    for (const field of fields) {
      const v = site.quantitative[field];
      if (v.status && ['UNOBSERVED','UNQUANTIFIED'].includes(v.status)) {
        for (const key of ['value','quantity','annual','rate','nominal','minimum','maximum']) {
          if (Object.prototype.hasOwnProperty.call(v,key)) assert.equal(v[key], null, site.siteId + ': unknown ' + field + '.' + key + ' must remain null');
        }
      }
    }
  }
});
console.log('OMEGA SITE DATA CONTRACT: PASS - 315 canonical rows; 51 original migration IDs; seven fields checked for every record.');
