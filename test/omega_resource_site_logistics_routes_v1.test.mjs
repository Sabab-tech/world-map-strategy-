import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const manifest=read('resource_site_logistics_routes_v1.json');
const canonical=read('resource_site_canonical_catalog_v1.json');
const base=read('resource_site_country_mineplay_batch_20261020_v1.json');
const expanded=read('resource_site_country_mineplay_batch_20261024_v1.json');
const critical=read('resource_site_country_mineplay_critical_batch_20261024_v1.json');
const legacy=read('resource_site_legacy_gameplay_expansion_part_6_v1.json');
const eligible=canonical.sites.filter(s=>!s.runtime?.aliasOfSiteId&&s.map?.markerEligible!==false&&Boolean(String(s.real?.resourceId||s.identity?.resourceTypeId||s.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||'').trim()));
const source=[...eligible,...base.records,...expanded.records,...critical.records,...legacy.records];
const sid=s=>String(s.siteId||s.id||s.sourceSiteRecord?.id||'').trim();
const cid=s=>String(s.countryId||s.identity?.countryIso3||s.sourceSiteRecord?.countryCode||s.sourceSiteRecord?.country||'').trim().toUpperCase();
const rid=s=>String(s.real?.resourceId||s.identity?.resourceTypeId||s.resourceId||s.sourceSiteRecord?.resourceId||s.sourceSiteRecord?.resourceTypeId||'').trim().toLowerCase();
const sourceById=new Map(source.map(s=>[sid(s),{countryId:cid(s),resourceId:rid(s)}]));
assert.equal(eligible.length,301);assert.equal(base.records.length,44);assert.equal(expanded.records.length,108);assert.equal(critical.records.length,58);assert.equal(legacy.records.length,50);
assert.equal(source.length,561);assert.equal(sourceById.size,561);assert.equal(manifest.recordCount,561);assert.equal(manifest.uniqueSiteCount,561);assert.equal(manifest.parts.length,6);
assert.equal(manifest.datasetId,'OMEGA_RESOURCE_SITE_LOGISTICS_ROUTES_V1');assert.equal(manifest.authority,'SCENARIO_LOGISTICS_DESIGN_ONLY');assert.equal(manifest.simulationOnly,true);
const all=[];const seen=new Set();const allowed=new Set(['truck','rail','ship','barge','pipeline']);
for(const p of manifest.parts){
 const part=read(p.file);assert.equal(part.datasetId,manifest.datasetId);assert.equal(part.part,p.part);assert.equal(part.partCount,6);assert.equal(part.routeCount,p.routeCount);assert.equal(part.routes.length,p.routeCount);
 for(const r of part.routes){
  assert.ok(!seen.has(r.siteId),'duplicate site route '+r.siteId);seen.add(r.siteId);all.push(r);
  const sourceRow=sourceById.get(r.siteId);assert.ok(sourceRow,'site missing from source roster '+r.siteId);assert.equal(r.countryId,sourceRow.countryId);assert.equal(r.resourceId,sourceRow.resourceId);
  assert.equal(manifest.countryToPart[r.countryId],p.part,'a country must not be split across data parts');
  assert.ok(r.routeId&&r.siteName&&r.sourceRegistryPath&&r.resourceIconKey);assert.ok(Number.isFinite(r.sourceCoordinate.lat)&&Number.isFinite(r.sourceCoordinate.lng));
  assert.equal(r.destination.warehouseId,'WH-'+r.countryId+'-RAW');assert.equal(r.destination.physicalWarehouseCoordinates,null);assert.equal(r.destination.locationStatus,'LOGICAL_INVENTORY_NODE_NOT_GEOCODED');
  assert.equal(r.routePlan.routeStatus,'SIMULATED_PLAN_COMPLETE_ENGINE_BINDING_PENDING');assert.equal(r.routePlan.dispatchStatus,'NOT_DISPATCHABLE_DATA_ONLY_PHASE');
  assert.equal(r.routePlan.sameCountryOnly,true);assert.equal(r.routePlan.allowAutomaticForeignTerritoryTransit,false);assert.equal(r.routePlan.noInventoryPreCredit,true);assert.equal(r.routePlan.noDuplicateBatchReceipt,true);
  assert.ok(r.routePlan.estimatedRouteDistanceKm>0&&r.routePlan.estimatedTravelHours>0);assert.ok(r.routePlan.minimumTransitDays>=1&&r.routePlan.plannedTransitDays>=r.routePlan.minimumTransitDays&&r.routePlan.conservativeTransitDays>=r.routePlan.plannedTransitDays);
  assert.ok(r.routePlan.legs.length>=1&&r.routePlan.legs.length<=3);assert.equal(r.routePlan.legs[0].fromNodeId,r.siteId);assert.equal(r.routePlan.legs.at(-1).toNodeId,r.destination.warehouseId);
  assert.equal(r.routePlan.actualBoundFleetUnits,null);assert.equal(r.routePlan.actualWorkingFleetUnits,null);assert.equal(r.routePlan.actualAssetStatus,'UNKNOWN_UNTIL_TRANSPORT_MINISTRY_ASSET_DATA_IS_LINKED');
  assert.equal(r.quantityUnitBridge.dispatchGate,'ENGINE_MUST_VALIDATE_BATCH_UNIT_AND_COMMODITY_CONVERSION_BEFORE_RESERVATION');
  assert.equal(r.provenance.simulationOnly,true);assert.equal(r.provenance.observedRoutePromoted,false);assert.equal(r.provenance.observedTransportAssetsPromoted,false);assert.equal(r.provenance.measuredWarehouseCoordinatesPromoted,false);assert.equal(r.provenance.actualVehicleAvailabilityAssumed,false);
  assert.ok(r.siteEligibilityGate.status);
  for(let i=0;i<r.routePlan.legs.length;i++){const l=r.routePlan.legs[i];assert.ok(allowed.has(l.transportMode));assert.equal(l.sequence,i+1);assert.ok(l.estimatedDistanceKm>0&&l.estimatedTravelHours>0&&l.designCapacityPerDay>0&&l.designCapacityUnit);assert.ok(r.routePlan.capacityBottleneckPerDay<=l.designCapacityPerDay);assert.equal(l.requiredDesignFleetSlots,1);assert.equal(l.actualBoundFleetUnits,null);assert.equal(l.assetBindingStatus,'NOT_YET_LINKED_TO_TRANSPORT_MINISTRY');assert.equal(l.status,'DESIGN_ONLY_NOT_DISPATCHABLE');if(i>0)assert.equal(l.fromNodeId,r.routePlan.legs[i-1].toNodeId);}
 }
}
assert.equal(all.length,561);assert.deepEqual([...seen].sort(),[...sourceById.keys()].sort());assert.equal(Object.keys(manifest.countryToPart).length,manifest.countryCount);
assert.ok(manifest.routeCountByMode.truck>=561);for(const mode of ['rail','ship','barge','pipeline'])assert.ok(manifest.routeCountByMode[mode]>0,mode+' routes should be represented');
console.log('OMEGA RESOURCE SITE LOGISTICS ROUTES PASS: '+all.length+' unique routes / '+manifest.countryCount+' countries in '+manifest.parts.length+' country-grouped parts.');
