/* ============================================================================
 * OMEGA RESOURCE PART 04 - CANONICAL MINE / DEPOSIT IDENTITY RUNTIME
 *
 * Purpose:
 *   Build one authoritative occurrence registry directly from RESOURCE_JSON
 *   runtime_deposits. No country is selected by the player here.
 *   Every occurrence carries its sovereign country identity.
 * ========================================================================== */
(function(g){
  'use strict';

  const VERSION='1.0.0';

  function clone(v,seen){
    if(v===null||typeof v!=='object')return v;
    seen=seen||new WeakMap();
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v)){
      if(k==='__proto__'||k==='constructor'||typeof v[k]==='function'||v[k]===undefined)continue;
      o[k]=clone(v[k],seen);
    }
    return o;
  }

  function id(v){return String(v??'').trim().toUpperCase();}
  function tok(v){return String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}

  function canonicalCountry(v){
    const raw=String(v??'').trim();
    if(!raw)return null;
    try{
      const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
      const hit=bridge?.resolveCountry?.(raw);
      if(hit?.id)return id(hit.id);
    }catch(_){}
    return id(raw);
  }

  function engine(){
    return g.ResourceMinistryEngine||null;
  }

  function sourceDeposits(){
    const e=engine();
    return Array.isArray(e?.deposits)?e.deposits:[];
  }

  function depositKeyFor(row,index){
    return String(row?.id||row?.depositId||row?.mineId||('DEP-'+index+'-'+tok(row?.name||row?.resId||'unknown'))).trim();
  }

  function compileIdentities(){
    const deposits=sourceDeposits();
    const byCountry=new Map(),byDeposit=new Map(),rows=[];
    deposits.forEach(function(raw,index){
      const countryId=canonicalCountry(raw?.countryCode||raw?.countryIso3||raw?.countryId||raw?.iso3||raw?.country);
      const resourceId=String(raw?.resourceTypeId||raw?.resourceTypeKey||raw?.resId||raw?.resourceId||'').replace(/^RES_TYPE:/i,'').trim().toLowerCase();
      const depositKey=depositKeyFor(raw,index);
      if(!countryId||!resourceId)return;
      const occurrenceKey='OCC:'+countryId+':'+depositKey;
      const occurrence={
        occurrenceKey,
        depositKey,
        depositRawName:String(raw?.name||depositKey),
        resourceTypeId:resourceId,
        resourceTypeKey:resourceId,
        countryId,
        countryCode:countryId,
        ownerKey:String(raw?.owner||raw?.ownerKey||'').trim()||null,
        operatorKey:String(raw?.operator||raw?.operatorKey||'').trim()||null,
        locationNodeKey:'MINE:'+countryId+':'+depositKey,
        status:String(raw?.status||'UNKNOWN').trim().toUpperCase(),
        sourceDatasetId:raw?.sourceDatasetId||raw?.provenance?.sourceDatasetId||'resources.json',
        rawDeposit:clone(raw)
      };
      rows.push(occurrence);
      byDeposit.set(depositKey,occurrence);
      if(!byCountry.has(countryId))byCountry.set(countryId,[]);
      byCountry.get(countryId).push(occurrence);
    });

    const registry={
      version:VERSION,
      authority:'RESOURCE_JSON',
      occurrenceCount:rows.length,
      getOccurrencesByCountry:function(countryId){return clone(byCountry.get(canonicalCountry(countryId))||[]);},
      getDeposit:function(depositKey){
        const hit=byDeposit.get(String(depositKey||'').trim());
        if(!hit)return null;
        const out=clone(hit);
        out.resourceTypeId=hit.resourceTypeId;
        out.resourceTypeKey=hit.resourceTypeKey;
        out.depositRawName=hit.depositRawName;
        out.locationNodeKey=hit.rawDeposit?.locationNodeKey||hit.locationNodeKey;
        return out;
      },
      listOccurrences:function(){return clone(rows);}
    };
    return{status:'READY',registry,occurrenceCount:rows.length};
  }

  const API=Object.freeze({
    VERSION,
    compileIdentities
  });

  g.Omega=g.Omega||{};
  g.GSRSK_Part04=API;
  g.GSRSK_ResourceIdentityEngine=API;
  g.Omega.ResourcePart04IdentityRuntime=API;
  g.OmegaResourcePart04IdentityRuntime=API;
})(typeof window!=='undefined'?window:globalThis);
