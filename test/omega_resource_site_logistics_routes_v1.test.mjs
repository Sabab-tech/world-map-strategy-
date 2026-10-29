import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const normalizePlanningUnit=value=>{
 const unit=String(value||'').trim().toUpperCase().replace(/[\\s-]+/g,'_');
 const aliases={RAW_CARGO_TONNES_PER_DAY:'TONNES_PER_DAY',RAW_CARGO_TONS_PER_DAY:'TONNES_PER_DAY',
  METRIC_TONS_PER_DAY:'TONNES_PER_DAY',METRIC_TONNES_PER_DAY:'TONNES_PER_DAY',TONS_PER_DAY:'TONNES_PER_DAY',
  TONNE_PER_DAY:'TONNES_PER_DAY',TONNES_ORE_PER_DAY:'TONNES_PER_DAY',BARREL_PER_DAY:'BARRELS_PER_DAY',BBL_PER_DAY:'BARRELS_PER_DAY'};
 return aliases[unit]||unit;
};

const ds=read('resource_site_logistics_routes_v1.json');
const canonical=read('resource_site_canonical_catalog_v1.json');
const base=read('resource_site_country_mineplay_batch_20261020_v1.json');
const expanded=read('resource_site_country_mineplay_batch_20261024_v1.json');
const critical=read('resource_site_country_mineplay_critical_batch_20261024_v1.json');
const legacy=read('resource_site_legacy_gameplay_expansion_part_6_v1.json');
const iconManifest=read('assets/omega-industrial-icons-v1/manifest.json');
const countryRoster=read('minister_country_roster_manifest_v1.json');
const coreCountryIds=Object.keys(countryRoster.countries||{}).sort();
const routedCountryIds=Object.keys(ds.countryToPart||{}).sort();
const noRouteCountryIds=coreCountryIds.filter(countryId=>ds.countryToPart[countryId]===undefined);
assert.equal(countryRoster.counts.countryEntities,197);
assert.equal(coreCountryIds.length,197,'the core country roster must contain all 197 country identities');
assert.equal(ds.countryFramework?.countryCount,197,'shared logistics framework must cover all 197 core countries');
assert.deepEqual(ds.countryFramework?.countryIds,coreCountryIds,'logistics framework IDs must match the authoritative core-country roster');
assert.equal(ds.countryFramework?.authority,'CORE_COUNTRY_ROSTER_MANIFEST_V1');
assert.deepEqual(routedCountryIds.filter(countryId=>!coreCountryIds.includes(countryId)),[],
  'mine route data must not claim countries outside the core-country roster');
assert.equal(routedCountryIds.length,193,'193 core countries currently have registered eligible mine/site routes');
assert.deepEqual(noRouteCountryIds,['LIE','MCO','SMR','VAT'],
  'countries without eligible sites must remain supported without fake mine routes');
assert.deepEqual(ds.countryFramework?.countriesWithoutMineSiteRoutes,noRouteCountryIds);
const eligible=canonical.sites.filter(s=>!s.runtime?.aliasOfSiteId&&s.map?.markerEligible!==false&&Boolean(String(s.real?.resourceId||s.identity?.resourceTypeId||s.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||'').trim()));
const source=[...eligible,...base.records,...expanded.records,...critical.records,...legacy.records];
const sid=s=>String(s.siteId||s.id||s.sourceSiteRecord?.id||'').trim();
const cid=s=>String(s.countryId||s.identity?.countryIso3||s.sourceSiteRecord?.countryCode||s.sourceSiteRecord?.country||'').trim().toUpperCase();
const rid=s=>String(s.real?.resourceId||s.identity?.resourceTypeId||s.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||'').trim().toLowerCase();
const sourceById=new Map(source.map(s=>[sid(s),{countryId:cid(s),resourceId:rid(s)}]));
const resourceIcons=new Map(iconManifest.resources.map(i=>[i.id,i]));
assert.equal(eligible.length,301);assert.equal(base.records.length,44);assert.equal(expanded.records.length,108);assert.equal(critical.records.length,58);assert.equal(legacy.records.length,50);
assert.equal(source.length,561);assert.equal(sourceById.size,561);assert.equal(ds.recordCount,561);assert.equal(ds.uniqueSiteCount,561);assert.equal(ds.parts.length,6);assert.equal(ds.countryCount,193);
assert.equal(ds.datasetId,'OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1');assert.equal(ds.authority,'SCENARIO_LOGISTICS_DESIGN_ONLY');assert.equal(ds.simulationOnly,true);
assert.equal(ds.resourceIconCoverage.canonicalExactMatches,561);assert.equal(ds.resourceIconCoverage.missingResourceAssets,0);
const all=[];const seen=new Set();const modes=new Set(['truck','rail','ship','barge','pipeline']);
for(const partInfo of ds.parts){
 const part=read(partInfo.file);assert.equal(part.datasetId,ds.datasetId);assert.equal(part.part,partInfo.part);assert.equal(part.partCount,6);assert.equal(part.routeCount,partInfo.routeCount);assert.equal(part.routes.length,partInfo.routeCount);
 for(const r of part.routes){
  assert.ok(!seen.has(r.siteId),'duplicate site route '+r.siteId);seen.add(r.siteId);all.push(r);
  const src=sourceById.get(r.siteId);assert.ok(src,'source site missing '+r.siteId);assert.equal(r.countryId,src.countryId);assert.equal(r.resourceId,src.resourceId);
  assert.equal(ds.countryToPart[r.countryId],partInfo.part);
  const icon=resourceIcons.get(r.resourceIconKey);assert.ok(icon,r.siteId+': canonical resource icon key missing');
  assert.equal(r.resourceIconKey,r.resourceId,r.siteId+': SVG ID must use exact resource ontology ID');
  assert.equal(r.resourceIconAssetPath,'assets/omega-industrial-icons-v1/'+icon.file);
  assert.equal(r.resourceIconStatus,'EXACT_MATCH_TO_EXISTING_RESOURCE_SVG_MANIFEST');
  assert.ok(fs.existsSync(path.join(root,r.resourceIconAssetPath)),'resource SVG missing: '+r.resourceIconAssetPath);
  assert.ok(r.routeId&&r.siteName&&r.sourceRegistryPath);
  assert.ok(Number.isFinite(r.sourceCoordinate.lat)&&Number.isFinite(r.sourceCoordinate.lng));
  assert.equal(r.destination.warehouseId,'WH-'+r.countryId+'-RAW');assert.equal(r.destination.physicalWarehouseCoordinates,null);assert.equal(r.destination.locationStatus,'LOGICAL_INVENTORY_NODE_NOT_GEOCODED');
  assert.equal(r.routePlan.routeStatus,'SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING');assert.equal(r.routePlan.dispatchStatus,'NOT_DISPATCHABLE_DATA_ONLY_PHASE');
  assert.equal(r.routePlan.sameCountryOnly,true);assert.equal(r.routePlan.allowAutomaticForeignTerritoryTransit,false);assert.equal(r.routePlan.noInventoryPreCredit,true);assert.equal(r.routePlan.noDuplicateBatchReceipt,true);
  assert.ok(r.routePlan.estimatedRouteDistanceKm>0&&r.routePlan.estimatedTravelHours>0);assert.ok(r.routePlan.minimumTransitDays>=1&&r.routePlan.plannedTransitDays>=r.routePlan.minimumTransitDays&&r.routePlan.conservativeTransitDays>=r.routePlan.plannedTransitDays);
  assert.ok(r.routePlan.legs.length>=1&&r.routePlan.legs.length<=3);assert.equal(r.routePlan.legs[0].fromNodeId,r.siteId);assert.equal(r.routePlan.legs.at(-1).toNodeId,r.destination.warehouseId);
  assert.equal(r.routePlan.actualBoundFleetUnits,null);assert.equal(r.routePlan.actualWorkingFleetUnits,null);assert.equal(r.routePlan.actualAssetStatus,'UNKNOWN_UNTIL_TRANSPORT_MINISTRY_ASSET_DATA_IS_LINKED');
  assert.equal(r.quantityUnitBridge.dispatchGate,'ENGINE_MUST_VALIDATE_BATCH_UNIT_AND_COMMODITY_CONVERSION_BEFORE_RESERVATION');
  assert.equal(r.provenance.simulationOnly,true);assert.equal(r.provenance.observedRoutePromoted,false);assert.equal(r.provenance.observedTransportAssetsPromoted,false);assert.equal(r.provenance.measuredWarehouseCoordinatesPromoted,false);assert.equal(r.provenance.actualVehicleAvailabilityAssumed,false);
  for(let i=0;i<r.routePlan.legs.length;i++){
   const l=r.routePlan.legs[i];assert.ok(modes.has(l.transportMode));assert.equal(l.sequence,i+1);
   assert.ok(l.estimatedDistanceKm>0&&l.estimatedTravelHours>0&&l.designCapacityPerDay>0&&l.designCapacityUnit);
   assert.ok(r.routePlan.capacityBottleneckPerDay<=l.designCapacityPerDay);
   const planningRate=r.planningProduction&&Number.isFinite(Number(r.planningProduction.rate))?Number(r.planningProduction.rate):null;
   const planningUnit=normalizePlanningUnit(r.planningProduction&&r.planningProduction.unit);
   const legMode=String(l.transportMode||'').toLowerCase();
   const explicitLineCapacity=Number(l.designCapacityPerLinePerDay??l.capacityPerLinePerDay??l.lineCapacityPerDay);
   const perDesignCapacity=legMode==='pipeline'
     ? (Number.isFinite(explicitLineCapacity)&&explicitLineCapacity>0?explicitLineCapacity:null)
     : Number(l.designCapacityPerDay);
   const perDesignUnit=normalizePlanningUnit(legMode==='pipeline'
     ? (l.designCapacityPerLineUnit||l.capacityPerLineUnit||l.lineCapacityUnit||l.designCapacityUnit||l.capacityUnit)
     : l.designCapacityUnit);
   const expectedRequired=planningRate!==null&&planningRate>=0&&planningUnit&&Number.isFinite(perDesignCapacity)&&
     perDesignCapacity>0&&perDesignUnit&&planningUnit===perDesignUnit
     ? Math.max(0,Math.ceil(planningRate/perDesignCapacity)):null;
   assert.equal(l.requiredDesignFleetSlots,expectedRequired,'required fleet need must be calculated from compatible site output and mode capacity, with pipeline lines requiring explicit per-line capacity');
   assert.equal(l.designFleetCalculation?.requiredUnits,expectedRequired);
   assert.equal(l.designFleetCalculation?.status,expectedRequired===null?'UNAVAILABLE':'CALCULATED');
   assert.equal(l.actualBoundFleetUnits,null);assert.equal(l.assetBindingStatus,'NOT_YET_LINKED_TO_TRANSPORT_MINISTRY');assert.equal(l.status,'DESIGN_ONLY_NOT_DISPATCHABLE');
   assert.equal(l.transportIconAssetPath,ds.transportIconAssets[l.transportMode].path);assert.equal(l.transportIconKey,ds.transportIconAssets[l.transportMode].assetId);
   const svg=fs.readFileSync(path.join(root,l.transportIconAssetPath),'utf8');assert.match(svg,/^<svg\b/);assert.ok(svg.includes('data-omega-icon-kind="transport"'));
   if(i>0)assert.equal(l.fromNodeId,r.routePlan.legs[i-1].toNodeId);
  }
  const expectedRouteRequired=r.routePlan.legs.every(l=>l.requiredDesignFleetSlots!==null&&Number.isFinite(l.requiredDesignFleetSlots))
    ?r.routePlan.legs.reduce((sum,l)=>sum+l.requiredDesignFleetSlots,0):null;
  assert.equal(r.routePlan.designFleetSlots,expectedRouteRequired,'route total must remain unknown if any leg demand is unknown');
  assert.equal(r.routePlan.designFleetCalculation?.totalRequiredUnits,expectedRouteRequired);
  assert.equal(r.routePlan.designFleetCalculation?.status,expectedRouteRequired===null?'PARTIAL_OR_UNAVAILABLE':'CALCULATED');
 }
}
assert.equal(all.filter(r=>r.planningProduction&&Number.isFinite(Number(r.planningProduction.rate))).length,305,
 'simulation-only mine output baselines must be preserved across all registered site routes');
const everyLeg=all.flatMap(r=>r.routePlan.legs);
assert.equal(everyLeg.filter(l=>Number.isFinite(l.requiredDesignFleetSlots)).length,540,
 'only compatible production units and transport capacity may produce a numeric design need');
assert.equal(everyLeg.filter(l=>l.requiredDesignFleetSlots===null).length,820,
 'unit gaps and unknown pipeline line capacity must remain explicitly uncalculated');
assert.equal(all.length,561);assert.deepEqual([...seen].sort(),[...sourceById.keys()].sort());assert.equal(Object.keys(ds.countryToPart).length,ds.countryCount);
assert.ok(ds.routeCountByMode.truck>=561);for(const m of ['rail','ship','barge','pipeline'])assert.ok(ds.routeCountByMode[m]>0,m+' routes should exist');
assert.equal(Object.keys(ds.transportIconAssets).length,5);
console.log('OMEGA RESOURCE SITE LOGISTICS ROUTES PASS: 561 unique routes, exact resource SVGs and five local transport SVGs verified.');
