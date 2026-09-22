/*
 * OMEGA CANONICAL MINISTRY REGISTRY v1.0.0
 *
 * Single registry authority for ministry identity/topology.
 * Domain engines attach to this registry; interoperability consumes it.
 */
(function(global){
  'use strict';
  if(global.OmegaMinistryRegistry?.VERSION==='1.0.0')return;

  const VERSION='1.0.0';
  const definitions=[
    ['cabinet','executive_coordination'],
    ['defense','defense_policy'],
    ['military','force_readiness'],
    ['finance','fiscal_state'],
    ['economy','economic_state'],
    ['trade','commerce_state'],
    ['foreign','diplomatic_state'],
    ['intelligence','intelligence_state'],
    ['interior','civil_administration'],
    ['transport','infrastructure_logistics'],
    ['resource','resource_governance'],
    ['health','public_health'],
    ['education','human_capital'],
    ['technology','science_technology'],
    ['projects','government_projects'],
    ['culture','culture_media'],
    ['statistics','national_statistics']
  ].map(([id,domain])=>Object.freeze({id,domain}));

  const ids=Object.freeze(definitions.map(d=>d.id));
  const byId=new Map(definitions.map(d=>[d.id,d]));

  function get(id){return byId.get(String(id))||null;}
  function has(id){return byId.has(String(id));}
  function list(){return ids.slice();}
  function size(){return ids.length;}

  const api=Object.freeze({
    VERSION,
    definitions:Object.freeze(definitions.slice()),
    ids,
    get,
    has,
    list,
    size
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryRegistry=api;
  global.OmegaMinistryRegistry=api;
})(typeof window!=='undefined'?window:globalThis);
