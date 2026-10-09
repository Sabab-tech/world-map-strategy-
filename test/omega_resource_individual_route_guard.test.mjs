import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../omega_resource_individual_route_guard_v1.js',import.meta.url),'utf8');
const site={siteId:'SITE_BGD_TEST_MINE',countryId:'BGD',simulation:{transportRoute:[]}};
const calls={plan:0,dispatch:0};
const original={
  planShipment(input){calls.plan++;return{status:'PLANNED',siteId:input.siteId,countryId:'BGD',resourceId:'coal',factoryId:'FAC-BGD-COAL',route:{destinationFactoryId:'FAC-BGD-COAL',transportMode:'rail',distanceAuthority:'SIMULATED_CORRIDOR_MODEL',legs:[{mode:'rail',sourceAuthority:'SIMULATED_CORRIDOR_MODEL'}]}};},
  dispatchShipment(){calls.dispatch++;return{status:'DISPATCHED'};}
};
const context={Omega:{ResourceIndustrialNetwork:original,ResourceSiteMasterResearchData:{sites:[site]}},OmegaResourceSiteMasterResearchData:{sites:[site]}};
context.globalThis=context;vm.createContext(context);vm.runInContext(source,context);
const api=context.Omega.ResourceIndustrialNetwork;
const blocked=api.planShipment({siteId:site.siteId,countryId:'BGD',resourceId:'coal',transportMode:'rail'});
assert.equal(blocked.status,'BLOCKED');
assert.equal(blocked.reason,'SITE_SPECIFIC_FACTORY_ROUTE_MISSING');
const blockedDispatch=api.dispatchShipment({siteId:site.siteId,countryId:'BGD',resourceId:'coal',transportMode:'rail'});
assert.equal(blockedDispatch.status,'BLOCKED');
assert.equal(calls.dispatch,0,'unmapped route must never dispatch');
site.simulation.transportRoute=[{factoryId:'FAC-BGD-COAL',mode:'rail',distanceKm:140,authority:'MODELED'}];
const accepted=api.planShipment({siteId:site.siteId,countryId:'BGD',resourceId:'coal',transportMode:'rail'});
assert.equal(accepted.status,'PLANNED');
assert.equal(accepted.route.distanceAuthority,'MODELED');
assert.ok(accepted.route.legs.every(l=>l.routeAuthority==='MODELED'));
console.log('OMEGA INDIVIDUAL ROUTE GUARD TEST PASSED');
console.log('Missing exact site/factory/mode route blocks plan and dispatch; mapped route requires provenance.');
