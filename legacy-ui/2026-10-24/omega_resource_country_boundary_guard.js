/* ============================================================================
 * OMEGA RESOURCE COUNTRY BOUNDARY GUARD v1.0.0
 *
 * Sovereign resource-state invariant:
 *   mine origin country == owning resource country == receiving warehouse country
 *
 * Cross-border movement is allowed only through explicit trade/transport
 * settlement code, never through extraction, batch creation, inventory
 * reconciliation, factory processing, or local stockpile actions.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';

  function id(v){return String(v??'').trim().toUpperCase();}
  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||new WeakMap();
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],seen);
    return o;
  }

  function canonicalCountry(value){
    const raw=String(value??'').trim();
    if(!raw)return null;
    try{
      const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
      const hit=bridge?.resolveCountry?.(raw);
      if(hit?.id)return id(hit.id);
      if(hit?.canonicalId)return id(hit.canonicalId);
    }catch(_){}
    try{
      const engine=g.ResourceMinistryEngine;
      const resolved=engine?.normalizeCountryCode?.(raw);
      if(resolved)return id(resolved);
    }catch(_){}
    return id(raw).replace(/\s+/g,'_');
  }

  function countryFromWarehouse(warehouseId){
    const raw=String(warehouseId??'').trim().toUpperCase();
    const m=raw.match(/^WH-([A-Z0-9_]+)-(?:RAW|PROCESSED|SPR)$/);
    return m?canonicalCountry(m[1]):null;
  }

  function countryFromLocation(locationNodeKey){
    const raw=String(locationNodeKey??'').trim().toUpperCase();
    const m=raw.match(/^WAREHOUSE:([^:]+):(RAW|PROCESSED|SPR)$/);
    return m?canonicalCountry(m[1]):null;
  }

  function collectDeclaredCountries(row){
    const out=[];
    const fields=['countryId','countryCode','countryIso3','iso3','ownerCountryCode','sourceCountryId','originCountryId','hostCountryIso3','hostCountryId'];
    for(const field of fields){
      const value=canonicalCountry(row?.[field]);
      if(value&&out.indexOf(value)<0)out.push(value);
    }
    return out;
  }

  function validateLocalBatch(batch,countryId,options={}){
    const c=canonicalCountry(countryId);
    if(!c)return{ok:false,reason:'RESOURCE_COUNTRY_REQUIRED'};
    if(!batch||typeof batch!=='object')return{ok:false,reason:'RESOURCE_BATCH_REQUIRED',countryId:c};

    const declared=collectDeclaredCountries(batch);
    for(const source of declared){
      if(source!==c && !options.allowExplicitTransfer){
        return{ok:false,reason:'CROSS_COUNTRY_RESOURCE_BREACH',countryId:c,foreignCountryId:source,batchId:batch.batchId||null};
      }
    }

    const warehouseCountry=countryFromWarehouse(batch.warehouseId);
    if(warehouseCountry&&warehouseCountry!==c){
      return{ok:false,reason:'CROSS_COUNTRY_WAREHOUSE_BREACH',countryId:c,warehouseCountryId:warehouseCountry,batchId:batch.batchId||null};
    }

    const locationCountry=countryFromLocation(batch.locationNodeKey);
    if(locationCountry&&locationCountry!==c){
      return{ok:false,reason:'CROSS_COUNTRY_LOCATION_BREACH',countryId:c,locationCountryId:locationCountry,batchId:batch.batchId||null};
    }

    if(!options.allowExplicitTransfer){
      if(batch.destinationCountryId&&canonicalCountry(batch.destinationCountryId)!==c){
        return{ok:false,reason:'UNAUTHORIZED_CROSS_COUNTRY_DESTINATION',countryId:c,destinationCountryId:canonicalCountry(batch.destinationCountryId),batchId:batch.batchId||null};
      }
      if(batch.transferType&&['IMPORT','EXPORT','CROSS_BORDER','TRADE'].includes(String(batch.transferType).toUpperCase())){
        return{ok:false,reason:'LOCAL_RESOURCE_HANDLER_REJECTS_CROSS_BORDER_TRANSFER',countryId:c,batchId:batch.batchId||null};
      }
    }

    return{ok:true,countryId:c};
  }

  function validateWarehouse(warehouse,countryId){
    const c=canonicalCountry(countryId);
    if(!warehouse||typeof warehouse!=='object')return{ok:true,countryId:c};
    if(warehouse.countryId&&canonicalCountry(warehouse.countryId)!==c)return{ok:false,reason:'CROSS_COUNTRY_WAREHOUSE_STATE',countryId:c,warehouseCountryId:canonicalCountry(warehouse.countryId)};
    const wc=countryFromWarehouse(warehouse.warehouseId);
    if(wc&&wc!==c)return{ok:false,reason:'CROSS_COUNTRY_WAREHOUSE_ID',countryId:c,warehouseCountryId:wc};
    const lc=countryFromLocation(warehouse.locationNodeKey);
    if(lc&&lc!==c)return{ok:false,reason:'CROSS_COUNTRY_WAREHOUSE_LOCATION',countryId:c,warehouseCountryId:lc};
    return{ok:true,countryId:c};
  }

  function validateResourceCollection(rows,countryId){
    const c=canonicalCountry(countryId),foreign=[];
    for(const row of Array.isArray(rows)?rows:[]){
      const check=validateLocalBatch(row,c);
      if(!check.ok)foreign.push(check);
    }
    return{ok:foreign.length===0,countryId:c,violations:foreign.slice(0,64)};
  }

  function stampLocalBatch(batch,countryId){
    const c=canonicalCountry(countryId);
    return{
      ...clone(batch),
      countryId:c,
      ownerCountryCode:c,
      custodianKey:c,
      destinationCountryId:c,
      warehouseId:batch?.warehouseId||'WH-'+c+'-RAW',
      locationNodeKey:batch?.locationNodeKey||'WAREHOUSE:'+c+':RAW'
    };
  }

  const API=Object.freeze({
    VERSION,
    canonicalCountry,
    countryFromWarehouse,
    countryFromLocation,
    validateLocalBatch,
    validateWarehouse,
    validateResourceCollection,
    stampLocalBatch
  });

  g.Omega=g.Omega||{};
  g.Omega.ResourceCountryBoundaryGuard=API;
  g.OmegaResourceCountryBoundaryGuard=API;
})(typeof window!=='undefined'?window:globalThis);
