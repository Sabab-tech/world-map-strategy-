/* OMEGA INDIVIDUAL ROUTE FAIL-CLOSED GUARD v1
 * Prevents the industrial runtime's deterministic corridor-distance fallback from
 * being treated as a usable physical route for a specific mine-to-factory shipment.
 * A route is executable only when the selected site's own simulation route explicitly
 * names the destination factory and transport mode. Missing mapping is BLOCKED, not guessed.
 */
(function(g){
'use strict';
const O=g.Omega||(g.Omega={});
const original=O.ResourceIndustrialNetwork||g.OmegaResourceIndustrialNetwork;
if(!original||typeof original.planShipment!=='function'||typeof original.dispatchShipment!=='function'){
  g.OmegaIndividualRouteGuardStatus={status:'FAILED',reason:'INDUSTRIAL_RUNTIME_UNAVAILABLE'};
  return;
}
const hasExactRoute=(site,factoryId,mode)=>{
  const rows=Array.isArray(site?.simulation?.transportRoute)?site.simulation.transportRoute:[];
  return rows.some(r=>{
    const target=String(r?.factoryId??r?.destinationFactoryId??r?.targetFactoryId??'').trim();
    const routeMode=String(r?.mode??r?.transportMode??'').trim().toLowerCase();
    const legs=Array.isArray(r?.legs)?r.legs:[];
    const legMode=legs.some(l=>String(l?.mode??l?.transportMode??'').trim().toLowerCase()===String(mode||'').trim().toLowerCase());
    return target!==''&&target===String(factoryId)&&(!mode||routeMode===String(mode).trim().toLowerCase()||legMode);
  });
};
const siteFor=input=>{
  const id=String(input?.siteId??'').trim();
  const data=g.OmegaResourceSiteMasterResearchData||O.ResourceSiteMasterResearchData;
  return Array.isArray(data?.sites)?data.sites.find(s=>String(s?.siteId??'').trim()===id)||input?.site||null:input?.site||null;
};
const check=(input,planned)=>{
  if(planned?.status!=='PLANNED')return planned;
  const site=siteFor(input);
  const factoryId=String(planned.factoryId||planned.route?.destinationFactoryId||'');
  const mode=String(input?.transportMode||planned.route?.transportMode||'');
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND_FOR_ROUTE_VALIDATION',siteId:input?.siteId||null};
  if(!hasExactRoute(site,factoryId,mode)){
    return{status:'BLOCKED',reason:'SITE_SPECIFIC_FACTORY_ROUTE_MISSING',siteId:site.siteId,countryId:site.countryId,resourceId:planned.resourceId,factoryId,requestedMode:mode,routeAuthority:planned.route?.distanceAuthority||'UNKNOWN',details:'No site-owned route explicitly binds this site to this factory and transport mode. No shipment was dispatched.'};
  }
  if(!Array.isArray(planned.route?.legs)||planned.route.legs.length===0){
    return{status:'BLOCKED',reason:'ROUTE_LEG_PROVENANCE_MISSING',siteId:site.siteId,factoryId,details:'An individual route requires explicit route legs.'};
  }
  const exact=site.simulation.transportRoute.find(r=>String(r?.factoryId??r?.destinationFactoryId??r?.targetFactoryId??'').trim()===factoryId);
  const authority=String(exact?.authority||exact?.routeAuthority||'MODELED').toUpperCase();
  if(!['OBSERVED','MODELED','BLOCKED'].includes(authority))return{status:'BLOCKED',reason:'ROUTE_PROVENANCE_INVALID',siteId:site.siteId,factoryId,authority};
  planned.route.distanceAuthority=authority;
  planned.route.legs=planned.route.legs.map(l=>({...l,routeAuthority:authority}));
  return planned;
};
const wrapped=Object.assign({},original,{
  planShipment(input={}){
    const planned=original.planShipment(input);
    return check(input,planned);
  },
  dispatchShipment(input={}){
    const planned=original.planShipment(input);
    const verified=check(input,planned);
    if(verified?.status!=='PLANNED')return verified;
    return original.dispatchShipment(input);
  },
  routeGuardDiagnostics(){
    return{status:'READY',policy:'FAIL_CLOSED_SITE_TO_FACTORY_ROUTE',requiresExactSiteFactoryModeBinding:true,blocksSyntheticCorridorFallback:true};
  }
});
O.ResourceIndustrialNetwork=wrapped;
g.OmegaResourceIndustrialNetwork=wrapped;
g.OmegaIndividualRouteGuardStatus={status:'READY',version:'1.0.0',policy:'FAIL_CLOSED_SITE_TO_FACTORY_ROUTE'};
})(typeof window!=='undefined'?window:globalThis);
