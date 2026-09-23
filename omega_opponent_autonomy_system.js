/* OMEGA OPPONENT AUTONOMY SYSTEM v1.0.0
 * Canonical country routing, multi-factor decision gating, domain executors and
 * deterministic autonomous action orchestration.
 *
 * Design rule:
 *   identity -> subject route -> authoritative evidence -> constraints ->
 *   decision contract -> resource reservation -> domain executor -> event ->
 *   re-evaluation.
 *
 * This layer does not create simulation facts. It only consumes existing state
 * and existing resource/country registries. Missing data remains BLOCKED/UNKNOWN.
 */
(function(g){
  'use strict';

  const VERSION='1.0.0';
  if(g.OmegaOpponentAutonomy?.VERSION===VERSION)return;

  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k],seen);
    return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);
    return null;
  };
  const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const read=(root,path)=>{
    let cur=root;
    for(const p of String(path||'').split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),p))return undefined;
      cur=cur[p];
    }
    return cur;
  };
  const clamp=(v,a=0,b=1)=>{
    const n=num(v);if(n===null)return null;
    return Math.max(a,Math.min(b,n));
  };
  const pct=v=>{
    const n=num(v);if(n===null)return null;
    return n>1.5?n/100:n;
  };

  const MINISTRIES=Object.freeze({
    CABINET:'cabinet',DEFENSE:'defense',MILITARY:'military',FINANCE:'finance',
    ECONOMY:'economy',TRADE:'trade',FOREIGN:'foreign',INTELLIGENCE:'intelligence',
    INTERIOR:'interior',TRANSPORT:'transport',RESOURCE:'resource',HEALTH:'health',
    EDUCATION:'education',TECHNOLOGY:'technology',PROJECTS:'projects',
    CULTURE:'culture',STATISTICS:'statistics'
  });

  /*
   * One subject has one primary owner. Cross-domain dependencies are explicit.
   * This is the routing authority used by evidence collection and execution.
   */
  const SUBJECT_ROUTES=Object.freeze({
    treasury:{primary:'finance',depends:['economy']},
    liquidity:{primary:'finance',depends:['economy']},
    budget:{primary:'finance',depends:['economy','projects']},
    debt:{primary:'finance',depends:['economy']},
    revenue:{primary:'finance',depends:['economy']},
    labor:{primary:'economy',depends:['population','education','projects']},
    skilledLabor:{primary:'economy',depends:['population','education','technology']},
    materials:{primary:'resource',depends:['economy','projects']},
    resources:{primary:'resource',depends:['trade','finance','foreign']},
    energy:{primary:'resource',depends:['transport','economy']},
    production:{primary:'economy',depends:['resource','labor','technology','transport']},
    industry:{primary:'economy',depends:['resource','labor','finance','transport','projects']},
    factory:{primary:'economy',depends:['resource','labor','finance','transport','projects']},
    housing:{primary:'interior',depends:['population','projects','transport','finance','resource']},
    cities:{primary:'interior',depends:['population','transport','projects']},
    infrastructure:{primary:'transport',depends:['finance','resource','labor','projects']},
    logistics:{primary:'transport',depends:['resource','trade','infrastructure']},
    trade:{primary:'trade',depends:['finance','resource','foreign','transport']},
    import:{primary:'trade',depends:['finance','resource','foreign','transport']},
    export:{primary:'trade',depends:['resource','finance','foreign','transport']},
    relations:{primary:'foreign',depends:['trade','intelligence']},
    treaties:{primary:'foreign',depends:['trade','defense','finance']},
    diplomacy:{primary:'foreign',depends:['trade','intelligence','relations']},
    threat:{primary:'intelligence',depends:['defense','military','foreign','trade']},
    intelligence:{primary:'intelligence',depends:['foreign','defense']},
    defense:{primary:'defense',depends:['finance','resource','foreign','military']},
    military:{primary:'military',depends:['defense','finance','resource','labor','technology']},
    recruitment:{primary:'military',depends:['labor','finance','defense']},
    training:{primary:'military',depends:['labor','education','finance']},
    equipment:{primary:'military',depends:['resource','finance','defense','industry']},
    health:{primary:'health',depends:['finance','population','education']},
    education:{primary:'education',depends:['finance','labor','technology','population']},
    technology:{primary:'technology',depends:['finance','education','industry','resource']},
    projects:{primary:'projects',depends:['finance','resource','labor','transport']},
    population:{primary:'interior',depends:['health','education','labor','housing']},
    culture:{primary:'culture',depends:['interior','population']},
    statistics:{primary:'statistics',depends:['finance','economy','population','resource']}
  });

  /*
   * Explicit file routing. A route is metadata, not simulation data.
   * No generic "scan every JSON and take the first field" path exists here.
   */
  const FILE_ROUTES=Object.freeze({
    country:{files:['countries.json'],recordKeys:['code','iso2','iso3','name','officialName']},
    economy:{files:['economy.json'],recordKeys:['country key','gdp','gdp_growth','inflation','unemployment_rate','budget_balance','debt','trade_balance','reserves']},
    population:{files:['population.json'],recordKeys:['country key','population_2015','annual_growth_rate','birth_rate','death_rate','migration_rate','urbanization_rate']},
    cities:{files:['cities.json'],recordKeys:['countries[]','name','capital','cities','economic','military','secret']},
    relations:{files:['relations.json'],recordKeys:['country -> target','overall','trade','political','military','intelligence','trust','dependency','border_tension','trade_agreement','defense_pact','alliance','sanctions','war_state']},
    resources:{files:['resources_2.json','resources.json'],recordKeys:['resource_types','GSRSK_Master_CountryProfiles_v14.countryProfiles','srie_database']},
    finance:{files:['Game.state only'],recordKeys:['finance.*']},
    industry:{files:['Game.state only'],recordKeys:['economy.production','economy.productionCapacity','industry.*']},
    infrastructure:{files:['Game.state only'],recordKeys:['transport.*','infrastructure.*']},
    military:{files:['Game.state only'],recordKeys:['military.*','defense.*']},
    intelligence:{files:['Game.state only'],recordKeys:['intelligence.*']}
  });

  const DECISION_WEIGHTS=Object.freeze({
    needPressure:0.20,
    treasury:0.14,
    labor:0.10,
    materials:0.12,
    debt:0.09,
    existingProjects:0.08,
    strategicPriority:0.10,
    time:0.07,
    risk:0.06,
    relations:0.04
  });

  const EVENT_ROUTES=Object.freeze({
    OMEGA_AUTONOMY_DECISION_CREATED:{owner:'cabinet',domains:['cabinet','statistics']},
    OMEGA_AUTONOMY_EVIDENCE_COLLECTED:{owner:'cabinet',domains:['statistics']},
    OMEGA_AUTONOMY_PLAN_CREATED:{owner:'cabinet',domains:['cabinet','projects']},
    OMEGA_AUTONOMY_RESERVATION_CREATED:{owner:'cabinet',domains:['finance','projects','resource','labor']},
    OMEGA_AUTONOMY_RESERVATION_RELEASED:{owner:'cabinet',domains:['finance','projects','resource','labor']},
    OMEGA_AUTONOMY_ACTION_DISPATCHED:{owner:'cabinet',domains:['cabinet']},
    OMEGA_RESOURCE_IMPORT_REQUEST_SENT:{owner:'trade',domains:['trade','resource','foreign','finance']},
    OMEGA_PROJECT_CONSTRUCTION_STARTED:{owner:'projects',domains:['projects']},
    OMEGA_PROJECT_CONSTRUCTION_PROGRESS:{owner:'projects',domains:['projects']},
    OMEGA_PROJECT_CONSTRUCTION_COMPLETED:{owner:'projects',domains:['projects','economy','interior','military']},
    OMEGA_HOUSING_CAPACITY_CHANGED:{owner:'interior',domains:['interior','cities']},
    OMEGA_FACTORY_CAPACITY_CHANGED:{owner:'economy',domains:['economy']},
    OMEGA_MILITARY_RECRUITMENT_APPLIED:{owner:'military',domains:['military']},
    OMEGA_MILITARY_TRAINING_APPLIED:{owner:'military',domains:['military','education']},
    OMEGA_MILITARY_EQUIPMENT_APPLIED:{owner:'military',domains:['military','resource','finance']},
    OMEGA_FORCE_STRUCTURE_CHANGED:{owner:'military',domains:['military','defense']},
    OMEGA_TREATY_NEGOTIATION_STARTED:{owner:'foreign',domains:['foreign','trade']},
    OMEGA_THREAT_ASSESSMENT_CREATED:{owner:'intelligence',domains:['intelligence','foreign','defense','military']}
  });

  function event(type,country,payload={},causationId=null,correlationId=null){
    const inter=g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability;
    const route=EVENT_ROUTES[type];
    const body={...clone(payload),countryId:id(country),eventType:type,causationId:causationId?String(causationId):null,correlationId:correlationId?String(correlationId):null};
    try{
      if(inter?.emitEvent && route){
        const created=inter.emitEvent(type,id(country),route.owner,body,{causationId,correlationId,turn:turn()});
        return created;
      }
    }catch(_){}
    try{g.dispatchEvent?.(new CustomEvent(type,{detail:body}));}catch(_){}
    return body;
  }

  function turn(){
    const s=g.Game?.state||g.gameState||{};
    for(const x of [s?.simulation?.turn,s?.turn,s?.simulationTurn,g.Omega?.Simulation?.clock?.turn]){
      const n=num(x);if(n!==null)return n;
    }
    return 0;
  }

  function canonicalCountry(value){
    const bridge=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    try{const hit=bridge?.resolveCountry?.(value);if(hit?.id)return{id:id(hit.id),raw:clone(hit.raw||null),authority:'OMEGA_CANONICAL_COUNTRY_IDENTITY'};}catch(_){}
    const direct=id(value);
    return direct?{id:direct,raw:null,authority:'UNVERIFIED_INPUT'}:null;
  }

  function surfaces(countryId){
    const c=canonicalCountry(countryId),r=c?.raw||{};
    return [...new Set([c?.id,r.code,r.countryCode,r.iso2,r.iso3,r.id,r.name,r.countryName,r.officialName,r.shortName].filter(Boolean).flatMap(x=>[String(x),id(x),token(x)]))];
  }

  function datasetRows(raw){
    if(Array.isArray(raw))return raw;
    if(Array.isArray(raw?.countries))return raw.countries;
    if(Array.isArray(raw?.data))return raw.data;
    if(raw&&typeof raw==='object')return Object.entries(raw).map(([k,v])=>v&&typeof v==='object'?({...v,__sourceKey:k}):({id:k,value:v,__sourceKey:k}));
    return[];
  }

  function datasetCountryRecord(raw,countryId){
    const keys=surfaces(countryId);
    const rows=datasetRows(raw);
    for(const row of rows){
      const vals=[row?.id,row?.code,row?.countryCode,row?.iso2,row?.iso3,row?.country_id,row?.countryId,row?.name,row?.countryName,row?.officialName,row?.__sourceKey]
        .filter(Boolean).flatMap(x=>[String(x),id(x),token(x)]);
      if(vals.some(x=>keys.includes(x)))return row;
    }
    return null;
  }

  function readState(countryId,path){
    const provider=g.Omega?.MinistryStateProvider?.instance||g.OmegaMinistryStateProvider?.instance;
    const cid=id(countryId);
    if(provider?.describe){
      try{
        const d=provider.describe(cid,path);
        return {value:d?.value,availability:d?.availability||'UNOBSERVED',sourceType:d?.provenance?.sourceType||'AUTHORITATIVE_RUNTIME_STATE',source:d?.provenance?.source||'Game.state',path,authority:true};
      }catch(_){}
    }
    const state=g.Game?.state||g.gameState||{};
    const parts=String(path).split('.');
    const domain=parts.shift();
    let bucket=state?.[domain];
    if(bucket&&bucket[cid]!==undefined)bucket=bucket[cid];
    else if(bucket&&typeof bucket==='object'){
      const k=Object.keys(bucket).find(x=>id(x)===cid);
      bucket=k!==undefined?bucket[k]:undefined;
    }else bucket=undefined;
    const v=read(bucket,parts.join('.'));
    return {value:v,availability:v===undefined?'UNAVAILABLE':'AVAILABLE',sourceType:'AUTHORITATIVE_RUNTIME_STATE',source:'Game.state',path,authority:true};
  }

  function resourceRuntime(countryId){
    const cid=id(countryId);
    try{
      const engine=g.ResourceMinistryEngine;
      if(engine?.getIntegratedResourceState){
        const x=engine.getIntegratedResourceState(cid);
        if(x)return{value:clone(x),availability:'AVAILABLE',sourceType:'RESOURCE_ENGINE',source:'ResourceMinistryEngine',path:'getIntegratedResourceState',authority:true};
      }
    }catch(_){}
    const provider=g.Omega?.MinistryStateProvider?.instance||g.OmegaMinistryStateProvider?.instance;
    try{
      const x=provider?.get?.(cid,'resourceEngineState');
      if(x!==undefined)return{value:clone(x),availability:'AVAILABLE',sourceType:'AUTHORITATIVE_RUNTIME_STATE',source:'Game.state/resource',path:'resourceEngineState',authority:true};
    }catch(_){}
    return{value:undefined,availability:'UNAVAILABLE',sourceType:'RESOURCE_ENGINE',source:'ResourceMinistryEngine',path:'getIntegratedResourceState',authority:false};
  }

  function resourceBridge(){
    return g.OmegaResourceSemanticBridge||g.Omega?.ResourceSemanticBridge||null;
  }

  function relationRecord(countryId,targetId){
    const a=id(countryId),b=id(targetId);
    const exact=[
      readState(a,'foreign.relations')?.value?.[b],
      readState(a,'trade.relations')?.value?.[b],
      readState(a,'relations')?.value?.[b],
      readState(a,'foreign.treaties')?.value?.[b]
    ].find(x=>x!==undefined);
    if(exact!==undefined)return exact;
    const rt=g.Omega?.OpponentCountryRuntime?.instance;
    try{
      const raw=rt?.gw?.get('relations');
      const source=raw?.[a]||raw?.[String(a)]||null;
      if(source){
        const k=Object.keys(source).find(x=>id(x)===b||token(x)===token(b));
        if(k!==undefined)return source[k];
      }
    }catch(_){}
    return undefined;
  }

  function existingReservations(countryId){
    const cid=id(countryId);
    const state=g.Game?.state||g.gameState||{};
    const ledger=state?.cabinet?.[cid]?.autonomyReservations;
    if(!Array.isArray(ledger))return[];
    return ledger.filter(x=>String(x.status||'ACTIVE').toUpperCase()!=='RELEASED'&&String(x.status||'ACTIVE').toUpperCase()!=='COMPLETED');
  }

  function activeProjects(countryId){
    const cid=id(countryId);
    const state=g.Game?.state||g.gameState||{};
    const r=state?.projects?.[cid]?.registry;
    if(Array.isArray(r))return r.filter(x=>!['COMPLETED','CANCELLED','BLOCKED'].includes(String(x.status||'').toUpperCase()));
    return[];
  }

  function sourceFor(subject,countryId,targetId=null){
    const route=SUBJECT_ROUTES[subject];
    if(!route)return{subject,known:false,reason:'SUBJECT_ROUTE_NOT_REGISTERED'};
    const paths={
      finance:['finance.available','finance.budget','finance.reserves','finance.committed','finance.encumbered','finance.spending','economy.debt','economy.gdp'],
      economy:['economy.production','economy.productionCapacity','economy.inflation','economy.unemployment','economy.debt'],
      labor:['population.labor.available','population.labor.skilled','population.labor','economy.labor.available','economy.unemployment'],
      materials:['resourceEngineState','resource.inventory','resource.production','resource.consumption','resource.reserves'],
      resources:['resourceEngineState','resource.inventory','resource.production','resource.consumption','resource.reserves'],
      housing:['cities.housing.required','cities.housing.available','cities.housing.stock','population.housing.required','population.housing.stock'],
      factory:['economy.production','economy.productionCapacity','industry.capacity','industry.output','industry.inputs.available'],
      industry:['economy.production','economy.productionCapacity','industry.capacity','industry.output','industry.inputs.available'],
      infrastructure:['transport.infrastructure','transport.logistics','transport.ports','transport.rail','infrastructure.capacity'],
      trade:['trade.relations','trade.balance','trade.exports','trade.imports','trade.marketPrice','trade.routeCapacity'],
      import:['trade.relations','trade.marketPrice','trade.routeCapacity','foreign.relations','foreign.treaties','finance.available','finance.reserves'],
      export:['trade.relations','trade.exports','trade.routeCapacity','finance.revenue','resource.inventory','foreign.sanctions'],
      relations:['foreign.relations','relations'],
      treaties:['foreign.treaties','foreign.negotiations','foreign.relations','relations'],
      diplomacy:['foreign.relations','foreign.treaties','foreign.sanctions','relations'],
      threat:['intelligence.threats','intelligence.sources','intelligence.state','foreign.relations','defense.readiness','military.forceStructure'],
      intelligence:['intelligence.threats','intelligence.sources','intelligence.state','intelligence.cyber'],
      military:['military.combat','military.readiness','military.forceStructure','military.logistics'],
      recruitment:['military.forceStructure','population.labor.available','finance.available','defense.readiness'],
      training:['military.forceStructure','education.state','finance.available'],
      equipment:['military.forceStructure','defense.procurement','resourceEngineState','finance.available'],
      education:['education.state','education.research','education.enrollment','population'],
      health:['health.state','health.welfare','health.hospitals','population'],
      technology:['technology.research','technology.innovation','technology.patents','technology.rnd'],
      projects:['projects.registry','projects.legal','projects.budget','projects.transport'],
      population:['population','interior.stability','health.state','education.state'],
      culture:['culture.state','culture.media','culture.social','population'],
      statistics:['countryRecord','population','economy','relations','resourceEngineState']
    };
    const list=paths[subject]||[];
    const exact=[];
    for(const p of list){
      if(p==='resourceEngineState'){
        const x=resourceRuntime(countryId);exact.push(x);continue;
      }
      const x=readState(countryId,p);
      exact.push(x);
    }
    return{subject,primary:route.primary,dependencies:route.depends.slice(),countryId:id(countryId),targetCountryId:targetId?id(targetId):null,checks:exact,files:[...(FILE_ROUTES[route.primary]?.files||[])]};
  }

  function collectEvidence(countryId,subjects=[],targetId=null){
    const out={countryId:id(countryId),targetCountryId:targetId?id(targetId):null,subjects:{},generatedTurn:turn()};
    for(const subject of subjects)out.subjects[subject]=sourceFor(subject,countryId,targetId);
    event('OMEGA_AUTONOMY_EVIDENCE_COLLECTED',countryId,{
      targetCountryId:out.targetCountryId,
      subjects:[...subjects],
      availableSubjects:Object.entries(out.subjects).filter(([,x])=>(x.checks||[]).some(y=>y?.availability==='AVAILABLE')).map(([k])=>k)
    },null,'EVIDENCE-'+id(countryId)+'-'+turn());
    return out;
  }

  function valueFromEvidence(evidence,subject,paths){
    const x=evidence?.subjects?.[subject];
    if(!x)return{value:null,availability:'UNOBSERVED',source:null};
    for(const c of x.checks||[]){
      if(paths?.includes(c.path)&&c.value!==undefined&&c.availability==='AVAILABLE')return{value:c.value,availability:c.availability,source:c.source,path:c.path};
    }
    for(const c of x.checks||[])if(c.value!==undefined&&c.availability==='AVAILABLE')return{value:c.value,availability:c.availability,source:c.source,path:c.path};
    return{value:null,availability:'UNAVAILABLE',source:null};
  }

  function scalar(v){
    if(v&&typeof v==='object'){
      for(const k of ['value','available','effective','total','amount','quantity','reserve','reserves','capacity','required','demand','supply']){const n=num(v[k]);if(n!==null)return n;}
    }
    return num(v);
  }

  function routeFinancial(countryId){
    const paths=['finance.available','finance.reserves','finance.liquidity','finance.committed','finance.encumbered','finance.budget'];
    const values={};
    for(const p of paths){const r=readState(countryId,p);if(r.value!==undefined)values[p]=scalar(r.value);}
    const debt=scalar(readState(countryId,'economy.debt').value);
    const gdp=scalar(readState(countryId,'economy.gdp').value);
    const liquidity=values['finance.available']??values['finance.liquidity']??values['finance.reserves']??null;
    return{values,debt,gdp,debtToGdp:gdp!==null&&gdp!==0?debt/gdp:null,liquidity};
  }

  function routeLabor(countryId){
    const candidates=['population.labor.available','economy.labor.available'];
    for(const p of candidates){const r=readState(countryId,p);if(r.value!==undefined)return{available:scalar(r.value),path:p,raw:r.value};}
    return{available:null,path:null,raw:null};
  }

  function routeMaterials(countryId,resourceId=null){
    const rs=resourceRuntime(countryId),v=rs.value||{};
    const inv=v?.inventory||null,prod=v?.production||null,resv=v?.reserves||null;
    if(resourceId){
      return{resourceId:id(resourceId),inventory:scalar(inv?.[resourceId]??inv?.[String(resourceId).toLowerCase()]),production:scalar(prod?.[resourceId]??prod?.[String(resourceId).toLowerCase()]),reserve:scalar(resv?.[resourceId]??resv?.[String(resourceId).toLowerCase()]),source:rs.source};
    }
    return{inventory:inv,production:prod,reserves:resv,source:rs.source};
  }

  function priorityFor(decision){
    const scenario=String(decision?.scenarioId||'').toUpperCase();
    const goal=String(decision?.goal?.priorityClass||'').toUpperCase();
    if(/SHORTAGE|DEFICIT|THREAT|EMERGENCY|CRISIS|DISASTER/.test(scenario))return 1;
    if(goal==='PRESSURE')return .9;
    if(/EXPANSION|OPPORTUNITY/.test(scenario)||goal==='OPPORTUNITY')return .65;
    return .5;
  }

  function needPressure(decision){
    const m=decision?.runtimeMeasurement||decision?.measurement;
    const gap=scalar(m?.gap);
    const req=scalar(m?.required);
    if(gap!==null&&req!==null&&req!==0)return clamp(Math.abs(gap)/Math.abs(req),0,1);
    const scenario=String(decision?.scenarioId||'').toUpperCase();
    return /SHORTAGE|DEFICIT|THREAT|EMERGENCY/.test(scenario)?1:null;
  }

  function riskScore(countryId,decision){
    const threat=scalar(readState(countryId,'defense.threatLevel').value);
    const threatAlt=scalar(readState(countryId,'intelligence.threatLevel').value);
    const concentration=scalar(readState(countryId,'trade.supplierConcentration').value);
    const sanctions=String(readState(countryId,'foreign.sanctions').value?.status||'').toUpperCase();
    const evidence=[];
    if(threat!==null)evidence.push(clamp(threat>1?threat/100:threat));
    else if(threatAlt!==null)evidence.push(clamp(threatAlt>1?threatAlt/100:threatAlt));
    if(concentration!==null)evidence.push(clamp(concentration>1?concentration/100:concentration));
    if(sanctions==='ACTIVE'||sanctions==='TRUE')evidence.push(1);
    if(!evidence.length)return null;
    const exposure=evidence.reduce((a,v)=>a+v,0)/evidence.length;
    return 1-clamp(exposure,0,1);
  }

  function relationScore(countryId,targetId){
    if(!targetId)return null;
    const r=relationRecord(countryId,targetId);
    if(!r)return null;
    if(r.war_state===true||r.sanctions===true)return 0;
    const overall=num(r.overall);
    const trust=num(r.trust);
    const trade=num(r.trade);
    const base=overall!==null?overall:(trust!==null?trust:trade);
    return base===null?null:clamp(base>1?base/100:base);
  }

  function actionSubject(action){
    const a=String(action||'').toUpperCase();
    if(['IMPORT','EXPORT','SUPPLIER_CHANGE'].includes(a))return a==='IMPORT'?'import':'trade';
    if(['HOUSING_BUILD'].includes(a))return'housing';
    if(['INDUSTRY_BUILD','DOMESTIC_EXPANSION','PROCESSING_EXPANSION'].includes(a))return'industry';
    if(['SECURITY_PREPARATION','MILITARY_RECRUIT','MILITARY_TRAIN','MILITARY_ORGANIZE','MILITARY_EQUIP','MILITARY_FACILITY_BUILD'].includes(a))return'military';
    if(['DEBT_MANAGEMENT','FINANCIAL_TRANSACTION','PROJECT_INVESTMENT'].includes(a))return'finance';
    if(['INFRASTRUCTURE_EXPANSION','MAINTENANCE','REPAIR'].includes(a))return'infrastructure';
    if(['DIPLOMATIC_ADJUSTMENT','TREATY_NEGOTIATION'].includes(a))return'diplomacy';
    if(['EDUCATION_INVESTMENT','TRAINING'].includes(a))return'education';
    if(['R_AND_D','MODERNIZATION'].includes(a))return'technology';
    if(['RESERVE_RELEASE','RESERVE_BUILD','SUBSTITUTION','EFFICIENCY'].includes(a))return'resources';
    return'projects';
  }

  function candidateActions(decision){
    const sc=String(decision?.scenarioId||'').toUpperCase();
    const registry=g.OmegaOpponentCountryRules?.SCENARIO_REGISTRY||g.Omega?.OpponentCountryRules?.SCENARIO_REGISTRY||[];
    const found=registry.find(x=>String(x.id).toUpperCase()===sc);
    const base=found?.actions||decision?.candidateActions?.map(x=>x.action)||decision?.selectedActions||[];
    if(base.length)return[...new Set(base.map(String))];
    const defaults={
      RESOURCE_DEFICIT:['IMPORT','DOMESTIC_EXPANSION','RESERVE_RELEASE','SUBSTITUTION','EFFICIENCY','SUPPLIER_CHANGE'],
      ENERGY_SHORTAGE:['IMPORT','DOMESTIC_EXPANSION','RESERVE_RELEASE','EFFICIENCY'],
      FOOD_SHORTAGE:['IMPORT','DOMESTIC_EXPANSION','RESERVE_RELEASE','EFFICIENCY'],
      HOUSING_SHORTAGE:['HOUSING_BUILD','INFRASTRUCTURE_EXPANSION','MIGRATION_POLICY'],
      FACTORY_EXPANSION:['DOMESTIC_EXPANSION','INDUSTRY_BUILD','PROCESSING_EXPANSION','EFFICIENCY'],
      SECURITY_PREPARATION:['MILITARY_FACILITY_BUILD','MILITARY_RECRUIT','MILITARY_TRAIN','MILITARY_ORGANIZE','MILITARY_EQUIP','SECURITY_PREPARATION'],
      PUBLIC_SERVICE_SHORTAGE:['INFRASTRUCTURE_EXPANSION','PROJECT_INVESTMENT','POLICY_REVIEW']
    };
    return defaults[sc]||['POLICY_REVIEW'];
  }

  function extractPlanInputs(decision,action){
    const selected=decision?.selected||decision?.selectedEvaluations?.find?.(x=>x.action===action);
    const m=decision?.runtimeMeasurement||decision?.measurement||{};
    const quantity=scalar(selected?.quantity??m?.selected?.quantity??m?.gap??m?.required);
    const cost=scalar(selected?.cost??m?.cost);
    const labor=scalar(selected?.labor??m?.labor??m?.requiredLabor);
    const materials=selected?.materials??m?.materials??null;
    const duration=scalar(selected?.durationTurns??m?.durationTurns??m?.time);
    const personnelPerUnit=scalar(selected?.personnelPerUnit??m?.personnelPerUnit??m?.selected?.personnelPerUnit);
    const readinessDelta=num(selected?.readinessDelta??m?.readinessDelta??m?.selected?.readinessDelta);
    const item=selected?.item??m?.item??m?.selected?.item??null;
    return{quantity,cost,labor,materials:materials&&typeof materials==='object'?clone(materials):null,durationTurns:duration,personnelPerUnit,readinessDelta,item};
  }

  function activeReservationTotals(countryId){
    const reservations=existingReservations(countryId);
    let money=0,labor=0,count=0;
    const materials={};
    for(const r of reservations){
      money+=num(r.money)||0;
      labor+=num(r.labor)||0;
      count+=1;
      for(const [k,v] of Object.entries(r.materials||{}))materials[k]=(materials[k]||0)+(num(v)||0);
    }
    return{money,labor,count,materials};
  }

  function materialRequirementFactor(countryId,requirements,reserved={}){
    if(!requirements||typeof requirements!=='object'||Object.keys(requirements).length===0)return 1;
    const rs=resourceRuntime(countryId),inv=rs.value?.inventory;
    if(!inv||typeof inv!=='object')return null;
    let ratios=[];
    for(const [rid,rawAmount] of Object.entries(requirements)){
      const amount=num(rawAmount);if(amount===null||amount<=0)return null;
      const key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(x=>id(x)===id(rid));
      if(!key)return null;
      const available=scalar(inv[key]);if(available===null)return null;
      const reservedAmount=num(reserved[rid])||num(reserved[id(rid)])||0;
      ratios.push(clamp((available-reservedAmount)/amount,0,1));
    }
    return ratios.length?Math.min(...ratios):1;
  }

  function candidateEvaluate(countryId,decision,action){
    const a=String(action||'').toUpperCase();
    const financial=routeFinancial(countryId);
    const labor=routeLabor(countryId);
    const reservation=activeReservationTotals(countryId);
    const plan=extractPlanInputs(decision,a);
    const material=routeMaterials(countryId,decision?.runtimeMeasurement?.resourceId||decision?.measurement?.resourceId||null);
    let importSupplier=null;
    const duration=plan.durationTurns;
    const need=needPressure(decision);
    const priority=priorityFor(decision);
    const risk=riskScore(countryId,decision);

    let targetCountryId=null;
    let relations=null;
    let status='READY';
    const reasons=[];
    if(['IMPORT'].includes(a)){
      const supplier=chooseImportSupplier(countryId,decision);
      importSupplier=supplier;
      targetCountryId=supplier?.countryId||null;
      relations=supplier?.relationScore??null;
      if(!supplier?.countryId){status='WAIT_DATA';reasons.push(supplier?.reason||'SUPPLIER_NOT_IDENTIFIED');}
      else if(supplier.relationAvailable!==true){status='WAIT_DATA';reasons.push('FOREIGN_RELATION_NOT_OBSERVED');}
      else if(supplier.priceAvailable!==true){status='WAIT_DATA';reasons.push('SUPPLIER_PRICE_NOT_OBSERVED');}
      else if(financial.liquidity===null){status='WAIT_DATA';reasons.push('TREASURY_LIQUIDITY_NOT_OBSERVED');}
      else if(plan.quantity===null){status='WAIT_DATA';reasons.push('IMPORT_QUANTITY_NOT_OBSERVED');}
      else {
        const estimatedCost=plan.cost!==null?plan.cost:(supplier.unitPrice!==null?plan.quantity*supplier.unitPrice:null);
        plan.unitPrice=supplier.unitPrice;
        plan.cost=estimatedCost;
        if(estimatedCost===null){status='WAIT_DATA';reasons.push('IMPORT_COST_NOT_OBSERVED');}
        else if(financial.liquidity-reservation.money<estimatedCost){status='BLOCKED';reasons.push('INSUFFICIENT_UNRESERVED_TREASURY');}
      }
    }
    if(['HOUSING_BUILD','INDUSTRY_BUILD','DOMESTIC_EXPANSION','PROCESSING_EXPANSION','INFRASTRUCTURE_EXPANSION','MILITARY_FACILITY_BUILD'].includes(a)){
      if(plan.quantity===null){status='WAIT_DATA';reasons.push('PROJECT_QUANTITY_NOT_OBSERVED');}
      if(plan.cost===null){status='WAIT_DATA';reasons.push('PROJECT_COST_NOT_OBSERVED');}
      if(plan.durationTurns===null){status='WAIT_DATA';reasons.push('PROJECT_DURATION_NOT_OBSERVED');}
      if(labor.available===null&&plan.labor!==null){status='WAIT_DATA';reasons.push('LABOR_CAPACITY_NOT_OBSERVED');}
      if(labor.available!==null&&plan.labor!==null&&labor.available-reservation.labor<plan.labor){status='BLOCKED';reasons.push('INSUFFICIENT_UNRESERVED_LABOR');}
      if(plan.materials&&Object.keys(plan.materials).length){
        const materialRatio=materialRequirementFactor(countryId,plan.materials,reservation.materials);
        if(materialRatio===null){status='WAIT_DATA';reasons.push('MATERIAL_AVAILABILITY_NOT_OBSERVED');}
        else if(materialRatio<1){status='BLOCKED';reasons.push('INSUFFICIENT_UNRESERVED_MATERIALS');}
      }
      if(financial.liquidity===null){status='WAIT_DATA';reasons.push('TREASURY_LIQUIDITY_NOT_OBSERVED');}
      if(plan.cost!==null&&financial.liquidity!==null&&financial.liquidity-reservation.money<plan.cost){status='BLOCKED';reasons.push('INSUFFICIENT_UNRESERVED_TREASURY');}
    }

    if(['MILITARY_RECRUIT','MILITARY_TRAIN','MILITARY_EQUIP'].includes(a)){
      if(financial.liquidity===null){status='WAIT_DATA';reasons.push('TREASURY_LIQUIDITY_NOT_OBSERVED');}
    }

    const treasuryFactor=plan.cost!==null&&financial.liquidity!==null
      ? clamp((financial.liquidity-reservation.money)/Math.max(plan.cost,1),0,1)
      : financial.liquidity===null?null:clamp((financial.liquidity-reservation.money)/Math.max(Math.abs(financial.liquidity),1),0,1);
    const laborFactor=plan.labor!==null&&labor.available!==null?clamp((labor.available-reservation.labor)/Math.max(plan.labor,1),0,1):(labor.available===null?null:clamp(labor.available>0?1:0));
    const materialFactor=plan.materials
      ? materialRequirementFactor(countryId,plan.materials,reservation.materials)
      : (material.inventory===null?null:1);
    const debtService=scalar(readState(countryId,'finance.debtServicePressure').value);
    const debtFactor=debtService!==null?1-clamp(debtService>1?debtService/100:debtService,0,1):
      (financial.debtToGdp===null?null:1-clamp(financial.debtToGdp,0,1));
    const projectFactor=clamp(1-activeProjects(countryId).length/10,0,1);
    const timeFactor=duration===null?null:clamp(1-duration/20,0,1);
    const relationFactor=relations;

    const factors={
      needPressure:need,
      treasury:treasuryFactor,
      labor:laborFactor,
      materials:materialFactor,
      debt:debtFactor,
      existingProjects:projectFactor,
      strategicPriority:priority,
      time:timeFactor,
      risk,
      relations:relationFactor
    };
    let score=0,totalWeight=0;
    for(const [k,w] of Object.entries(DECISION_WEIGHTS)){
      const v=factors[k];
      if(v===null)continue;
      score+=w*v;totalWeight+=w;
    }
    score=totalWeight?score/totalWeight:0;
    return{
      action:a,status,reason:reasons.join('|')||null,score:Number(score.toFixed(6)),
      targetCountryId,
      unitPrice:importSupplier?.unitPrice??null,
      supplier:importSupplier?clone(importSupplier):null,
      plan,
      factors,
      financial:{liquidity:financial.liquidity,debt:financial.debt,debtToGdp:financial.debtToGdp,reservedMoney:reservation.money},
      labor:{available:labor.available,reserved:lreservation(reservation.labor)},
      reservations:reservation,
      material,
      relationScore:relations
    };
  }

  function lreservation(v){return num(v)??0;}

  function findResourceSuppliers(resourceId){
    const rid=String(resourceId||'').trim();
    if(!rid)return[];
    const bridge=resourceBridge();
    const out=[];
    try{
      if(bridge?.queryResource){
        const q=bridge.queryResource({resourceId:rid,operation:'LOCATE',worldwide:true});
        for(const x of q?.records||[]){
          const cid=id(x.countryId);
          if(cid&&!out.some(y=>y.countryId===cid))out.push({countryId:cid,source:x.source,recordId:x.id});
        }
      }
    }catch(_){}
    try{
      const engine=g.ResourceMinistryEngine;
      for(const dep of Array.isArray(engine?.deposits)?engine.deposits:[]){
        const candidate=id(dep.countryCode||dep.country||dep.countryId);
        const tags=[dep.resourceId,dep.resId,dep.resourceTypeId,dep.resource,dep.name].filter(Boolean).map(token);
        if(candidate&&tags.some(x=>x===token(rid)||x.includes(token(rid))))if(!out.some(y=>y.countryId===candidate))out.push({countryId:candidate,source:'ResourceMinistryEngine',recordId:dep.resId||dep.id||null});
      }
    }catch(_){}
    return out;
  }

  function supplierPrice(countryId,resourceId){
    const target=id(countryId),rid=String(resourceId||'').trim();
    const explicitCandidates=[
      readState(target,'trade.marketPrices.'+rid).value,
      readState(target,'trade.marketPrice.'+rid).value,
      readState(target,'trade.offers.'+rid+'.unitPrice').value,
      readState(target,'trade.offers.'+rid+'.price').value,
      readState(target,'trade.offerBook.'+rid+'.unitPrice').value,
      readState(target,'trade.offerBook.'+rid+'.price').value
    ];
    for(const x of explicitCandidates){const n=scalar(x);if(n!==null)return n;}
    const engine=g.ResourceMinistryEngine;
    try{
      const profile=engine?.getCountryResourceProfile?.(id(countryId));
      const found=read(profile,'market')||read(profile,'resource_market')||read(profile,'market_context');
      const candidates=[
        read(found,'prices.'+resourceId),read(found,'price.'+resourceId),read(found,'unitPrice.'+resourceId),
        read(profile,'marketPrice.'+resourceId),read(profile,'market_price.'+resourceId)
      ];
      for(const x of candidates){const n=scalar(x);if(n!==null)return n;}
    }catch(_){}
    const bridge=resourceBridge();
    try{
      const q=bridge?.queryResource?.({resourceId,countryId:id(countryId),operation:'LOCATE'});
      const first=q?.records?.[0];
      const raw=first?.raw||null;
      const candidates=[read(raw,'marketPrice'),read(raw,'market_price'),read(raw,'price'),read(raw,'unitPrice'),read(raw,'unit_price'),read(raw,'pricing.unitPrice')];
      for(const x of candidates){const n=scalar(x);if(n!==null)return n;}
    }catch(_){}
    return null;
  }

  function chooseImportSupplier(countryId,decision){
    const m=decision?.runtimeMeasurement||decision?.measurement||{};
    const resourceId=m?.resourceId||m?.resource||null;
    if(!resourceId)return{countryId:null,reason:'RESOURCE_ID_NOT_OBSERVED'};
    const suppliers=findResourceSuppliers(resourceId).filter(x=>id(x.countryId)!==id(countryId));
    if(!suppliers.length)return{countryId:null,reason:'NO_RESOURCE_SUPPLIER_RECORD'};
    const rows=suppliers.map(x=>{
      const rel=relationRecord(countryId,x.countryId);
      const relationScore=relationScoreFor(rel);
      const relationAvailable=!!rel;
      const unitPrice=supplierPrice(x.countryId,resourceId);
      const priceAvailable=unitPrice!==null;
      const rs=resourceRuntime(x.countryId);
      const inv=rs.value?.inventory,prod=rs.value?.production,resv=rs.value?.reserves;
      const lookup=k=>scalar(inv?.[k]??inv?.[String(k).toLowerCase()]);
      const currentSupply=lookup(resourceId)??scalar(prod?.[resourceId]??prod?.[String(resourceId).toLowerCase()])??scalar(resv?.[resourceId]??resv?.[String(resourceId).toLowerCase()]);
      const supplyObserved=currentSupply!==null;
      const hasSupply=supplyObserved?currentSupply>0:true;
      const legalAccess=relationAvailable&&rel.war_state!==true&&rel.sanctions!==true&&hasSupply;
      return{...x,relationAvailable,relationScore,unitPrice,priceAvailable,legalAccess,supplyObserved,supply:currentSupply};
    }).filter(x=>x.legalAccess);
    if(!rows.length){
      return{countryId:null,reason:'NO_SUPPLIER_WITH_OBSERVED_FOREIGN_ACCESS'};
    }
    const priced=rows.filter(x=>x.priceAvailable);
    if(!priced.length){
      return{countryId:null,reason:'SUPPLIER_PRICE_NOT_OBSERVED'};
    }
    priced.sort((a,b)=>(a.unitPrice-b.unitPrice)||((b.relationScore??0)-(a.relationScore??0))||a.countryId.localeCompare(b.countryId));
    const best=priced[0];
    return{...best};
  }

  function relationScoreFor(r){
    if(!r)return null;
    if(r.war_state===true||r.sanctions===true)return 0;
    const vals=[num(r.overall),num(r.trust),num(r.trade)].filter(x=>x!==null);
    if(!vals.length)return null;
    return clamp((vals[0]>1?vals[0]/100:vals[0]));
  }

  function decide(decision){
    const countryId=id(decision?.countryId);
    const candidates=candidateActions(decision);
    const evaluations=candidates.map(a=>candidateEvaluate(countryId,decision,a));
    const ready=evaluations.filter(x=>x.status==='READY');
    ready.sort((a,b)=>b.score-a.score||a.action.localeCompare(b.action));
    const selected=ready[0]||null;
    const routed={
      ...clone(decision),
      autonomyVersion:VERSION,
      decisionOrigin:'OMEGA_AUTONOMY_ORCHESTRATOR',
      selectedAction:selected?.action||null,
      selected:clone(selected),
      candidateEvaluations:clone(evaluations),
      deferredActions:evaluations.filter(x=>!selected||x.action!==selected.action).map(x=>({action:x.action,status:x.status,reason:x.reason,score:x.score})),
      factorModel:DECISION_WEIGHTS,
      dataRouting:collectEvidence(countryId,[...new Set(candidates.map(actionSubject))],selected?.targetCountryId||null)
    };
    routed.status=selected?'ROUTED':'WAITING_FOR_EVIDENCE';
    event('OMEGA_AUTONOMY_PLAN_CREATED',countryId,{
      decisionId:routed.decisionId||decision?.decisionId||null,
      scenarioId:routed.scenarioId||decision?.scenarioId||null,
      selectedAction:selected?.action||null,
      status:routed.status,
      candidateCount:evaluations.length,
      factorSnapshot:selected?.factors||null
    },routed.decisionId||decision?.decisionId||null,routed.decisionId||decision?.decisionId||null);
    event('OMEGA_AUTONOMY_DECISION_CREATED',countryId,{
      decisionId:decision?.decisionId||null,scenarioId:decision?.scenarioId||null,selectedAction:selected?.action||null,
      candidateCount:evaluations.length,status:routed.status
    },decision?.decisionId||null,decision?.decisionId||null);
    return routed;
  }

  function getSimulation(){
    return g.Omega?.Simulation||g.Omega?.SimulationRuntime||null;
  }
  function interop(){
    return g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  }

  function dispatch(owner,action,countryId,payload,correlationId){
    const mesh=interop();
    if(!mesh?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{
      return mesh.dispatchCommand(owner,action,id(countryId),payload,{
        turn:turn(),commandType:action,correlationId:correlationId||null
      });
    }catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }

  function registerAction(actionId,owner,definition){
    const mesh=interop();
    try{
      mesh?.registerAction?.(actionId,{actionId,stateOwnerMinistry:owner,authority:'OMEGA_AUTONOMY',...definition});
      mesh?.registerCommandHandler?.(actionId,owner,handlerFor(actionId));
      return true;
    }catch(_){return false;}
  }

  function stateArray(state,domain,countryId,key){
    const root=state?.[domain]?.[id(countryId)];
    const existing=root?.[key];
    return Array.isArray(existing)?existing:[];
  }

  function reserveHandler(cmd,ctx){
    const c=id(ctx.countryId),d=cmd?.payload||{},res=existingReservations(c);
    if(res.some(x=>x.reservationId===d.reservationId))return{accepted:true,reservationId:d.reservationId,duplicate:true};
    const active=activeReservationTotals(c);
    const money=num(d.money)||0;
    const laborRequired=num(d.labor)||0;
    const financeAvailable=scalar(ctx.stateTransaction.get('finance.available'));
    const financeReserves=scalar(ctx.stateTransaction.get('finance.reserves'));
    const treasuryBase=financeAvailable!==null?financeAvailable:financeReserves;
    if(money>0&&treasuryBase===null)return{accepted:false,reason:'TREASURY_STATE_UNAVAILABLE'};
    if(money>0&&treasuryBase-active.money<money)return{accepted:false,reason:'INSUFFICIENT_UNRESERVED_TREASURY'};
    const laborAvailable=scalar(ctx.stateTransaction.get('population.labor.available'));
    if(laborRequired>0&&laborAvailable===null)return{accepted:false,reason:'LABOR_STATE_UNAVAILABLE'};
    if(laborRequired>0&&laborAvailable-active.labor<laborRequired)return{accepted:false,reason:'INSUFFICIENT_UNRESERVED_LABOR'};
    const materials=clone(d.materials||{});
    if(Object.keys(materials).length){
      const inv=ctx.stateTransaction.get('resource.inventory');
      if(!inv||typeof inv!=='object')return{accepted:false,reason:'MATERIAL_INVENTORY_UNAVAILABLE'};
      for(const [rid,amountRaw] of Object.entries(materials)){
        const amount=num(amountRaw);
        if(amount===null||amount<0)return{accepted:false,reason:'MATERIAL_REQUIREMENT_INVALID:'+rid};
        const key=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(x=>id(x)===id(rid));
        if(!key)return{accepted:false,reason:'MATERIAL_NOT_OBSERVED:'+rid};
        const available=scalar(inv[key]);
        const reserved=num(active.materials[id(rid)])||num(active.materials[rid])||0;
        if(available===null)return{accepted:false,reason:'MATERIAL_AVAILABILITY_UNKNOWN:'+rid};
        if(available-reserved<amount)return{accepted:false,reason:'INSUFFICIENT_UNRESERVED_MATERIAL:'+rid};
      }
    }
    const ledger=Array.isArray(ctx.stateTransaction.get('cabinet.autonomyReservations'))?ctx.stateTransaction.get('cabinet.autonomyReservations'):res;
    const row={
      reservationId:String(d.reservationId||('RES-'+turn()+'-'+c+'-'+String(d.decisionId||'AUTO'))),
      countryId:c,decisionId:d.decisionId||null,scenarioId:d.scenarioId||null,
      status:'ACTIVE',createdTurn:turn(),expiresTurn:d.expiresTurn??turn()+32,
      money:num(d.money)||0,labor:num(d.labor)||0,materials:clone(d.materials||{}),
      action:d.action||null,executor:d.executor||null
    };
    ctx.stateTransaction.set('cabinet.autonomyReservations',ledger.concat([row]).slice(-512));
    event('OMEGA_AUTONOMY_RESERVATION_CREATED',c,row,cmd.commandId,d.correlationId||d.decisionId||null);
    return{accepted:true,reservation:row,eventType:null};
  }

  function releaseHandler(cmd,ctx){
    const c=id(ctx.countryId),rid=String(cmd?.payload?.reservationId||'');
    const ledger=Array.isArray(ctx.stateTransaction.get('cabinet.autonomyReservations'))?ctx.stateTransaction.get('cabinet.autonomyReservations'):[];
    const next=ledger.map(x=>x.reservationId===rid?{...x,status:'RELEASED',releasedTurn:turn()}:x);
    ctx.stateTransaction.set('cabinet.autonomyReservations',next);
    event('OMEGA_AUTONOMY_RESERVATION_RELEASED',c,{reservationId:rid,status:'RELEASED'},cmd.commandId,cmd?.payload?.correlationId||rid);
    return{accepted:true,reservationId:rid};
  }

  function importHandler(cmd,ctx){
    const c=id(ctx.countryId),p=cmd?.payload||{};
    const target=id(p.targetCountryId);
    if(!target)return{accepted:false,reason:'TARGET_COUNTRY_REQUIRED'};
    const relation=relationRecord(c,target);
    if(!relation)return{accepted:false,reason:'FOREIGN_RELATION_NOT_OBSERVED'};
    if(relation.war_state===true||relation.sanctions===true)return{accepted:false,reason:'SUPPLIER_ACCESS_BLOCKED'};
    const qty=num(p.quantity);
    if(qty===null||qty<=0)return{accepted:false,reason:'IMPORT_QUANTITY_INVALID'};
    const price=num(p.unitPrice);
    if(price===null||price<0)return{accepted:false,reason:'SUPPLIER_PRICE_NOT_OBSERVED'};
    const existing=Array.isArray(ctx.stateTransaction.get('trade.importRequests'))?ctx.stateTransaction.get('trade.importRequests'):[];
    const request={
      requestId:String(p.requestId||('IMP-REQ-'+turn()+'-'+c+'-'+target+'-'+String(p.decisionId||''))),
      countryId:c,targetCountryId:target,resourceId:String(p.resourceId),quantity:qty,
      unitPrice:price,totalValue:qty*price,currency:p.currency||null,
      status:'SENT',stage:'COUNTERPARTY_DECISION_PENDING',createdTurn:turn(),
      decisionId:p.decisionId||null,reservationId:p.reservationId||null,
      relationSnapshot:clone(relation),agreementStatus:relation.trade_agreement===true?'EXISTS':'NOT_OBSERVED_OR_NOT_CONCLUDED'
    };
    ctx.stateTransaction.set('trade.importRequests',existing.concat([request]).slice(-256));
    event('OMEGA_RESOURCE_IMPORT_REQUEST_SENT',c,request,cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,request,executionState:'COUNTERPARTY_DECISION_PENDING'};
  }

  function readProjectRegistry(tx){
    const x=tx.get('projects.registry');
    return Array.isArray(x)?x:[];
  }

  function projectCreateHandler(cmd,ctx){
    const c=id(ctx.countryId),p=cmd?.payload||{};
    const reservationId=String(p.reservationId||'');
    if(!reservationId)return{accepted:false,reason:'RESERVATION_REQUIRED'};
    const projects=readProjectRegistry(ctx.stateTransaction);
    const existing=projects.find(x=>x.projectId===p.projectId);
    if(existing)return{accepted:true,project:existing,duplicate:true};
    const quantity=num(p.quantity),cost=num(p.cost),duration=num(p.durationTurns);
    if(quantity===null||quantity<=0)return{accepted:false,reason:'PROJECT_QUANTITY_INVALID'};
    if(cost===null||cost<0)return{accepted:false,reason:'PROJECT_COST_REQUIRED'};
    if(duration===null||duration<=0)return{accepted:false,reason:'PROJECT_DURATION_REQUIRED'};
    const project={
      projectId:String(p.projectId||('AUTO-PROJ-'+turn()+'-'+c)),
      countryId:c,actionType:String(p.action||''),
      scenarioId:p.scenarioId||null,decisionId:p.decisionId||null,reservationId,
      kind:String(p.kind||'GENERAL').toUpperCase(),status:'UNDER_CONSTRUCTION',
      phase:'CONSTRUCTION',progress:0,createdTurn:turn(),startTurn:turn(),
      quantity,cost,spent:0,currency:p.currency||null,
      laborRequired:num(p.labor)||0,materials:clone(p.materials||{}),
      durationTurns:Math.floor(duration),
      progressPerTurn:1/Math.floor(duration),
      completionTurn:turn()+Math.floor(duration),
      linkedMinistries:clone(p.linkedMinistries||[]),dependencies:clone(p.dependencies||[]),
      autonomy:true,executionBoundary:'OMEGA_PROJECT_EXECUTOR',stateMutationAuthority:true
    };
    ctx.stateTransaction.set('projects.registry',projects.concat([project]).slice(-512));
    event('OMEGA_PROJECT_CONSTRUCTION_STARTED',c,project,cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,project};
  }

  function updateProjectList(tx,updater){
    const projects=readProjectRegistry(tx);
    let changed=false;
    const next=projects.map(p=>{
      const r=updater(clone(p));
      if(r!==p)changed=true;
      return r;
    });
    if(changed)tx.set('projects.registry',next);
    return next;
  }

  function financeCommit(countryId,amount,decisionId,correlationId){
    const x=num(amount);
    if(x===null||x<0)return{status:'FAILED',reason:'FINANCE_COMMIT_AMOUNT_INVALID'};
    return dispatch('finance','OMEGA_AUTO_FINANCE_COMMIT',countryId,{amount:x,decisionId,correlationId},correlationId);
  }

  function resourceConsume(countryId,materials,decisionId,correlationId){
    if(!materials||typeof materials!=='object')return{status:'APPLIED',skipped:true};
    return dispatch('resource','OMEGA_AUTO_RESOURCE_CONSUME',countryId,{materials,decisionId,correlationId},correlationId);
  }

  function projectTickHandler(cmd,ctx){
    const c=id(ctx.countryId),state=g.Game?.state||g.gameState||{},projects=readProjectRegistry(ctx.stateTransaction);
    const active=projects.filter(p=>p.autonomy&&['UNDER_CONSTRUCTION','COMMISSIONING'].includes(String(p.status||'').toUpperCase()));
    let completed=[];
    const next=projects.map(p=>{
      if(!p.autonomy||!['UNDER_CONSTRUCTION','COMMISSIONING'].includes(String(p.status||'').toUpperCase()))return p;
      const q={...p,progress:Math.min(1,(num(p.progress)||0)+(num(p.progressPerTurn)||0.1)),lastProgressTurn:turn()};
      event('OMEGA_PROJECT_CONSTRUCTION_PROGRESS',c,{projectId:q.projectId,previousProgress:num(p.progress)||0,progress:q.progress,status:q.status},cmd.commandId,q.decisionId||q.projectId);
      if(q.progress>=1){q.progress=1;q.status='COMMISSIONING';q.phase='COMMISSIONING';}
      if(q.status==='COMMISSIONING'&&turn()>=Number(q.completionTurn||turn())){
        const materials=q.materials&&typeof q.materials==='object'?q.materials:{};
        const resourceResult=Object.keys(materials).length?dispatch('resource','OMEGA_AUTO_RESOURCE_CONSUME',c,{materials,decisionId:q.decisionId,correlationId:q.projectId},q.projectId):{status:'APPLIED',skipped:true};
        if(resourceResult?.status!=='APPLIED'){
          q.status='COMMISSIONING';q.phase='SETTLEMENT_BLOCKED';q.blocker=resourceResult?.reason||'RESOURCE_SETTLEMENT_FAILED';return q;
        }
        const financeResult=q.cost>0?dispatch('finance','OMEGA_AUTO_FINANCE_COMMIT',c,{amount:q.cost,decisionId:q.decisionId,correlationId:q.projectId},q.projectId):{status:'APPLIED',skipped:true};
        if(financeResult?.status!=='APPLIED'){
          if(Object.keys(materials).length)dispatch('resource','OMEGA_AUTO_RESOURCE_RESTORE',c,{materials,correlationId:q.projectId},q.projectId);
          q.status='COMMISSIONING';q.phase='SETTLEMENT_BLOCKED';q.blocker=financeResult?.reason||'FINANCE_SETTLEMENT_FAILED';return q;
        }
        q.spent=q.cost;q.status='COMPLETED';q.phase='OPERATIONAL';q.commissionedTurn=turn();completed.push(q);
      }
      return q;
    });
    if(active.length)ctx.stateTransaction.set('projects.registry',next);
    for(const p of completed){
      const action=String(p.kind||'').toUpperCase()==='HOUSING'?'OMEGA_AUTO_HOUSING_COMMISSION':
        String(p.kind||'').toUpperCase()==='FACTORY'?'OMEGA_AUTO_FACTORY_COMMISSION':
        String(p.kind||'').toUpperCase()==='MILITARY_FACILITY'?'OMEGA_AUTO_MILITARY_FACILITY_COMMISSION':
        String(p.kind||'').toUpperCase()==='INFRASTRUCTURE'?'OMEGA_AUTO_INFRASTRUCTURE_COMMISSION':null;
      if(action){
        const owner=action.includes('HOUSING')?'interior':action.includes('FACTORY')?'economy':action.includes('INFRASTRUCTURE')?'transport':'military';
        dispatch(owner,action,c,{project:p,reservationId:p.reservationId,decisionId:p.decisionId,correlationId:p.decisionId||p.projectId},p.decisionId||p.projectId);
      }
      event('OMEGA_PROJECT_CONSTRUCTION_COMPLETED',c,{project:p},cmd.commandId,p.decisionId||p.projectId);
      const release=dispatch('cabinet','OMEGA_AUTO_RELEASE_RESERVATION',c,{reservationId:p.reservationId,correlationId:p.decisionId||p.projectId},p.decisionId||p.projectId);
      if(release?.status==='FAILED')void release;
    }
    return{accepted:true,activeCount:active.length,completed:completed.map(x=>x.projectId)};
  }

  function housingCommission(cmd,ctx){
    const p=cmd?.payload?.project||{},q=scalar(p.quantity);
    if(q===null||q<=0)return{accepted:false,reason:'HOUSING_CAPACITY_QUANTITY_INVALID'};
    const rawExisting=ctx.stateTransaction.get('cities.housing.available');
    const existing=scalar(rawExisting);
    if(existing===null)return{accepted:false,reason:'HOUSING_CAPACITY_STATE_UNAVAILABLE'};
    ctx.stateTransaction.set('cities.housing.available',existing+q);
    const assets=Array.isArray(ctx.stateTransaction.get('interior.housingAssets'))?ctx.stateTransaction.get('interior.housingAssets'):[];
    ctx.stateTransaction.set('interior.housingAssets',assets.concat([{projectId:p.projectId,quantity:q,commissionedTurn:turn()}]).slice(-256));
    event('OMEGA_HOUSING_CAPACITY_CHANGED',ctx.countryId,{projectId:p.projectId,delta:q,newValue:existing+q},cmd.commandId,p.decisionId||p.projectId);
    return{accepted:true,delta:q,newHousingCapacity:existing+q,stateMutationAuthority:true};
  }

  function factoryCommission(cmd,ctx){
    const p=cmd?.payload?.project||{},q=scalar(p.quantity);
    if(q===null||q<=0)return{accepted:false,reason:'FACTORY_CAPACITY_QUANTITY_INVALID'};
    const rawExisting=ctx.stateTransaction.get('economy.productionCapacity');
    const existing=scalar(rawExisting);
    if(existing===null)return{accepted:false,reason:'PRODUCTION_CAPACITY_STATE_UNAVAILABLE'};
    ctx.stateTransaction.set('economy.productionCapacity',existing+q);
    const assets=Array.isArray(ctx.stateTransaction.get('economy.productionAssets'))?ctx.stateTransaction.get('economy.productionAssets'):[];
    ctx.stateTransaction.set('economy.productionAssets',assets.concat([{projectId:p.projectId,capacity:q,commissionedTurn:turn()}]).slice(-256));
    event('OMEGA_FACTORY_CAPACITY_CHANGED',ctx.countryId,{projectId:p.projectId,delta:q,newCapacity:existing+q},cmd.commandId,p.decisionId||p.projectId);
    return{accepted:true,delta:q,newProductionCapacity:existing+q,stateMutationAuthority:true};
  }

  function infrastructureCommission(cmd,ctx){
    const p=cmd?.payload?.project||{},q=scalar(p.quantity);
    if(q===null||q<=0)return{accepted:false,reason:'INFRASTRUCTURE_CAPACITY_QUANTITY_INVALID'};
    const raw=ctx.stateTransaction.get('transport.infrastructure.capacity');
    const existing=scalar(raw);
    if(existing===null)return{accepted:false,reason:'TRANSPORT_CAPACITY_STATE_UNAVAILABLE'};
    ctx.stateTransaction.set('transport.infrastructure.capacity',existing+q);
    event('OMEGA_AUTONOMY_ACTION_DISPATCHED',ctx.countryId,{action:'INFRASTRUCTURE_COMMISSION',projectId:p.projectId,delta:q,newCapacity:existing+q},cmd.commandId,p.decisionId||p.projectId);
    return{accepted:true,delta:q,newInfrastructureCapacity:existing+q,stateMutationAuthority:true};
  }

  function militaryFacilityCommission(cmd,ctx){
    const p=cmd?.payload?.project||{},q=scalar(p.quantity);
    if(q===null||q<=0)return{accepted:false,reason:'MILITARY_FACILITY_QUANTITY_INVALID'};
    const facilities=Array.isArray(ctx.stateTransaction.get('military.facilities'))?ctx.stateTransaction.get('military.facilities'):[];
    const row={projectId:p.projectId,quantity:q,kind:'MILITARY_FACILITY',commissionedTurn:turn()};
    ctx.stateTransaction.set('military.facilities',facilities.concat([row]).slice(-256));
    event('OMEGA_FORCE_STRUCTURE_CHANGED',ctx.countryId,{projectId:p.projectId,facilityAdded:q},cmd.commandId,p.decisionId||p.projectId);
    return{accepted:true,facility:row,stateMutationAuthority:true};
  }

  function financeCommitHandler(cmd,ctx){
    const amount=num(cmd?.payload?.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'FINANCE_AMOUNT_INVALID'};
    const available=scalar(ctx.stateTransaction.get('finance.available'));
    const reserves=scalar(ctx.stateTransaction.get('finance.reserves'));
    const base=available!==null?available:reserves;
    if(base===null)return{accepted:false,reason:'FINANCE_STATE_UNAVAILABLE'};
    if(base<amount)return{accepted:false,reason:'INSUFFICIENT_TREASURY'};
    if(available!==null)ctx.stateTransaction.set('finance.available',available-amount);
    else ctx.stateTransaction.set('finance.reserves',reserves-amount);
    const committed=scalar(ctx.stateTransaction.get('finance.committed'))||0;
    ctx.stateTransaction.set('finance.committed',committed+amount);
    return{accepted:true,spent:amount,stateMutationAuthority:true};
  }

  function financeRefundHandler(cmd,ctx){
    const amount=num(cmd?.payload?.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'FINANCE_REFUND_AMOUNT_INVALID'};
    const available=scalar(ctx.stateTransaction.get('finance.available'));
    const reserves=scalar(ctx.stateTransaction.get('finance.reserves'));
    if(available===null&&reserves===null)return{accepted:false,reason:'FINANCE_STATE_UNAVAILABLE'};
    if(available!==null)ctx.stateTransaction.set('finance.available',available+amount);else ctx.stateTransaction.set('finance.reserves',reserves+amount);
    const committed=scalar(ctx.stateTransaction.get('finance.committed'));
    if(committed!==null)ctx.stateTransaction.set('finance.committed',Math.max(0,committed-amount));
    return{accepted:true,refunded:amount,stateMutationAuthority:true};
  }

  function resourceConsumeHandler(cmd,ctx){
    const materials=cmd?.payload?.materials||{};
    const inventory=ctx.stateTransaction.get('resource.inventory');
    if(!inventory||typeof inventory!=='object')return{accepted:false,reason:'RESOURCE_INVENTORY_STATE_UNAVAILABLE'};
    const next=clone(inventory);
    for(const [rid,amountRaw] of Object.entries(materials)){
      const amount=num(amountRaw);
      if(amount===null||amount<0)return{accepted:false,reason:'RESOURCE_AMOUNT_INVALID:'+rid};
      const key=Object.prototype.hasOwnProperty.call(next,rid)?rid:Object.keys(next).find(x=>id(x)===id(rid));
      if(!key)return{accepted:false,reason:'RESOURCE_NOT_IN_INVENTORY:'+rid};
      const available=scalar(next[key]);
      if(available===null||available<amount)return{accepted:false,reason:'RESOURCE_INVENTORY_INSUFFICIENT:'+rid};
      if(next[key]&&typeof next[key]==='object'&&!Array.isArray(next[key])){
        const copy=clone(next[key]);
        const field=['quantity','amount','value','available','total'].find(k=>Object.prototype.hasOwnProperty.call(copy,k))||'quantity';
        copy[field]=available-amount;
        next[key]=copy;
      }else next[key]=available-amount;
    }
    ctx.stateTransaction.set('resource.inventory',next);
    event('OMEGA_AUTONOMY_ACTION_DISPATCHED',ctx.countryId,{action:'RESOURCE_CONSUME',materials},cmd.commandId,cmd?.payload?.correlationId||null);
    return{accepted:true,inventory:next,stateMutationAuthority:true};
  }

  function resourceRestoreHandler(cmd,ctx){
    const materials=cmd?.payload?.materials||{};
    const inventory=ctx.stateTransaction.get('resource.inventory');
    if(!inventory||typeof inventory!=='object')return{accepted:false,reason:'RESOURCE_INVENTORY_STATE_UNAVAILABLE'};
    const next=clone(inventory);
    for(const [rid,amountRaw] of Object.entries(materials)){
      const amount=num(amountRaw);
      if(amount===null||amount<0)return{accepted:false,reason:'RESOURCE_AMOUNT_INVALID:'+rid};
      const key=Object.prototype.hasOwnProperty.call(next,rid)?rid:Object.keys(next).find(x=>id(x)===id(rid));
      if(!key)return{accepted:false,reason:'RESOURCE_NOT_IN_INVENTORY:'+rid};
      const current=scalar(next[key]);
      if(current===null)return{accepted:false,reason:'RESOURCE_INVENTORY_VALUE_INVALID:'+rid};
      if(next[key]&&typeof next[key]==='object'&&!Array.isArray(next[key])){
        const copy=clone(next[key]);const field=['quantity','amount','value','available','total'].find(k=>Object.prototype.hasOwnProperty.call(copy,k))||'quantity';copy[field]=current+amount;next[key]=copy;
      }else next[key]=current+amount;
    }
    ctx.stateTransaction.set('resource.inventory',next);
    return{accepted:true,restored:clone(materials),stateMutationAuthority:true};
  }

  function recruitmentHandler(cmd,ctx){
    const p=cmd?.payload||{},q=num(p.quantity);
    if(q===null||q<=0)return{accepted:false,reason:'RECRUITMENT_QUANTITY_INVALID'};
    const structure=ctx.stateTransaction.get('military.forceStructure');
    if(!structure||typeof structure!=='object')return{accepted:false,reason:'FORCE_STRUCTURE_STATE_UNAVAILABLE'};
    const personnelKey=structure.personnel!==undefined?'personnel':structure.activePersonnel!==undefined?'activePersonnel':structure.manpower!==undefined?'manpower':null;
    const current=personnelKey?scalar(structure[personnelKey]):null;
    if(current===null)return{accepted:false,reason:'FORCE_STRUCTURE_PERSONNEL_FIELD_UNAVAILABLE'};
    const next=clone(structure);next[personnelKey]=current+q;
    ctx.stateTransaction.set('military.forceStructure',next);
    const queue=Array.isArray(ctx.stateTransaction.get('military.recruitmentQueue'))?ctx.stateTransaction.get('military.recruitmentQueue'):[];
    const row={recruitmentId:String(p.recruitmentId||('REC-'+turn()+'-'+ctx.countryId)),quantity:q,status:'RECRUITED',createdTurn:turn(),decisionId:p.decisionId||null};
    ctx.stateTransaction.set('military.recruitmentQueue',queue.concat([row]).slice(-256));
    event('OMEGA_MILITARY_RECRUITMENT_APPLIED',ctx.countryId,{...row,newPersonnel:current+q,personnelField:personnelKey},cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,recruitment:row,newPersonnel:current+q,personnelField:personnelKey,stateMutationAuthority:true};
  }

  function trainingHandler(cmd,ctx){
    const p=cmd?.payload||{},q=num(p.quantity);
    if(q===null||q<=0)return{accepted:false,reason:'TRAINING_QUANTITY_INVALID'};
    const queue=Array.isArray(ctx.stateTransaction.get('military.trainingQueue'))?ctx.stateTransaction.get('military.trainingQueue'):[];
    const duration=num(p.durationTurns);
    if(duration===null||duration<=0)return{accepted:false,reason:'TRAINING_DURATION_REQUIRED'};
    const row={trainingId:String(p.trainingId||('TRAIN-'+turn()+'-'+ctx.countryId)),quantity:q,status:'IN_TRAINING',createdTurn:turn(),completionTurn:turn()+duration,durationTurns:Math.floor(duration),decisionId:p.decisionId||null,readinessDelta:num(p.readinessDelta)};
    ctx.stateTransaction.set('military.trainingQueue',queue.concat([row]).slice(-256));
    event('OMEGA_MILITARY_TRAINING_APPLIED',ctx.countryId,row,cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,training:row,stateMutationAuthority:true};
  }

  function equipmentHandler(cmd,ctx){
    const p=cmd?.payload||{},q=num(p.quantity),item=String(p.item||'').trim();
    const cost=num(p.cost),materials=p.materials&&typeof p.materials==='object'?clone(p.materials):{};
    if(q===null||q<=0)return{accepted:false,reason:'EQUIPMENT_QUANTITY_INVALID'};
    if(!item)return{accepted:false,reason:'EQUIPMENT_ITEM_REQUIRED'};
    if(cost===null||cost<0)return{accepted:false,reason:'EQUIPMENT_COST_REQUIRED'};
    const finAvail=scalar(ctx.stateTransaction.get('finance.available'));
    const finRes=scalar(ctx.stateTransaction.get('finance.reserves'));
    const financeBase=finAvail!==null?finAvail:finRes;
    if(financeBase===null)return{accepted:false,reason:'FINANCE_STATE_UNAVAILABLE'};
    if(financeBase<cost)return{accepted:false,reason:'INSUFFICIENT_TREASURY'};
    if(Object.keys(materials).length){
      const inventoryRaw=ctx.stateTransaction.get('resource.inventory');
      if(!inventoryRaw||typeof inventoryRaw!=='object')return{accepted:false,reason:'MATERIAL_INVENTORY_UNAVAILABLE'};
      for(const [rid,rawAmount] of Object.entries(materials)){
        const amount=num(rawAmount);if(amount===null||amount<0)return{accepted:false,reason:'EQUIPMENT_MATERIAL_INVALID:'+rid};
        const key=Object.keys(inventoryRaw).find(x=>id(x)===id(rid));
        if(!key)return{accepted:false,reason:'EQUIPMENT_MATERIAL_NOT_OBSERVED:'+rid};
        const available=scalar(inventoryRaw[key]);
        if(available===null||available<amount)return{accepted:false,reason:'EQUIPMENT_MATERIAL_INSUFFICIENT:'+rid};
      }
    }
    const committed=dispatch('finance','OMEGA_AUTO_FINANCE_COMMIT',ctx.countryId,{amount:cost,decisionId:p.decisionId,correlationId:p.correlationId||p.decisionId},p.correlationId||p.decisionId);
    if(committed?.status!=='APPLIED')return{accepted:false,reason:'EQUIPMENT_FINANCE_COMMIT_FAILED',detail:committed};
    let consumed={status:'APPLIED',skipped:true};
    if(Object.keys(materials).length){
      consumed=dispatch('resource','OMEGA_AUTO_RESOURCE_CONSUME',ctx.countryId,{materials,decisionId:p.decisionId,correlationId:p.correlationId||p.decisionId},p.correlationId||p.decisionId);
      if(consumed?.status!=='APPLIED'){
        dispatch('finance','OMEGA_AUTO_FINANCE_REFUND',ctx.countryId,{amount:cost,decisionId:p.decisionId,correlationId:p.correlationId||p.decisionId},p.correlationId||p.decisionId);
        return{accepted:false,reason:'EQUIPMENT_MATERIAL_COMMIT_FAILED',detail:consumed};
      }
    }
    const inventoryRaw=ctx.stateTransaction.get('military.equipmentInventory');
    const inventory=inventoryRaw&&typeof inventoryRaw==='object'?clone(inventoryRaw):{};
    const key=Object.keys(inventory).find(x=>id(x)===id(item))||item;
    const current=scalar(inventory[key])??0;
    inventory[key]=current+q;
    ctx.stateTransaction.set('military.equipmentInventory',inventory);
    const queue=Array.isArray(ctx.stateTransaction.get('military.equipmentQueue'))?ctx.stateTransaction.get('military.equipmentQueue'):[];
    const row={equipmentId:String(p.equipmentId||('EQUIP-'+turn()+'-'+ctx.countryId)),quantity:q,item,status:'EQUIPPED',cost,materials,createdTurn:turn(),decisionId:p.decisionId||null};
    ctx.stateTransaction.set('military.equipmentQueue',queue.concat([row]).slice(-256));
    event('OMEGA_MILITARY_EQUIPMENT_APPLIED',ctx.countryId,{...row,equipmentInventory:inventory},cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,equipment:row,newInventory:inventory,stateMutationAuthority:true};
  }

  function militaryTickHandler(cmd,ctx){
    const p=cmd?.payload||{},turnNow=turn();
    const train=Array.isArray(ctx.stateTransaction.get('military.trainingQueue'))?ctx.stateTransaction.get('military.trainingQueue'):[];
    const nextTrain=train.map(x=>{
      if(x.status!=='IN_TRAINING'||turnNow<Number(x.completionTurn||Infinity))return x;
      const completed={...x,status:'COMPLETED',completedTurn:turnNow};
      const delta=num(x.readinessDelta);
      if(delta!==null){
        const readiness=scalar(ctx.stateTransaction.get('military.readiness'));
        if(readiness!==null)completed.readinessApplied=Math.max(0,Math.min(100,readiness+delta))-readiness;
      }
      return completed;
    });
    ctx.stateTransaction.set('military.trainingQueue',nextTrain);
    const completedForReadiness=nextTrain.filter(x=>x.status==='COMPLETED'&&x.completedTurn===turnNow&&num(x.readinessApplied)!==null);
    for(const x of completedForReadiness){
      const raw=ctx.stateTransaction.get('military.readiness'),current=scalar(raw);
      if(current===null)continue;
      const delta=num(x.readinessApplied);
      const next=Math.max(0,Math.min(100,current+delta));
      ctx.stateTransaction.set('military.readiness',next);
      event('OMEGA_FORCE_STRUCTURE_CHANGED',c,{trainingId:x.trainingId,readinessBefore:current,readinessAfter:next,delta},cmd.commandId,x.decisionId||x.trainingId);
    }
    return{accepted:true,completedTraining:nextTrain.filter(x=>x.status==='COMPLETED'&&x.completedTurn===turnNow).length};
  }

  function threatFusion(countryId,targetCountryId=null){
    const cid=id(countryId),target=targetCountryId?id(targetCountryId):null;
    const raw=target?relationRecord(cid,target):null;
    const threats=readState(cid,'intelligence.threats').value;
    const sources=readState(cid,'intelligence.sources').value;
    const stateInfo=readState(cid,'intelligence.state').value;
    const targetForce=target?readState(target,'military.forceStructure').value:null;
    const targetReadiness=target?scalar(readState(target,'military.readiness').value):null;
    const targetDefense=target?scalar(readState(target,'defense.threatLevel').value):null;
    const evidence=[];
    const pushEvidence=(factor,value,source)=>{
      if(value===undefined||value===null)return;
      const n=scalar(value);
      evidence.push({factor,value:n===null?clone(value):n,source});
    };
    const threatValue=target&&threats&&typeof threats==='object'?scalar(threats[target]):scalar(threats);
    pushEvidence('THREAT_SIGNAL',threatValue,'intelligence.threats');
    pushEvidence('RELATION_MILITARY_THREAT',raw?.military_threat,'relations');
    pushEvidence('TARGET_READINESS',targetReadiness,'target.military.readiness');
    pushEvidence('TARGET_DEFENSE_SIGNAL',targetDefense,'target.defense.threatLevel');

    const sourceRows=Array.isArray(sources)?sources:
      (sources&&typeof sources==='object'?Object.entries(sources).map(([sourceId,row])=>({sourceId,...(row&&typeof row==='object'?row:{value:row})})):[]);
    const reliabilityValues=sourceRows.map(x=>scalar(x.reliability??x.reliabilityScore??x.confidence??x.quality??x.weight)).filter(v=>v!==null);
    const sourceReliability=reliabilityValues.length
      ?reliabilityValues.reduce((a,v)=>a+clamp(v>1?v/100:v),0)/reliabilityValues.length
      :null;
    const evidenceCoverage=clamp(evidence.length/4);
    const confidence=sourceReliability===null?evidenceCoverage:evidenceCoverage*(0.5+0.5*sourceReliability);
    const vectorsRaw=stateInfo?.possibleAttackVectors||stateInfo?.vectors||targetDefense?.possibleAttackVectors;
    const vectors=Array.isArray(vectorsRaw)?clone(vectorsRaw):[];
    const intent=raw?.military_threat!==undefined?
      (num(raw.military_threat)!==null&&num(raw.military_threat)>70?'HOSTILE_PRESSURE':
       num(raw.military_threat)!==null&&num(raw.military_threat)>40?'ELEVATED_PRESSURE':'LOW_PRESSURE')
      :'UNKNOWN';
    const horizonRaw=stateInfo?.timeHorizon??stateInfo?.horizonTurns??(threats?.[target]?.timeHorizon);
    const assessment={
      countryId:cid,targetCountryId:target,simulationTurn:turn(),
      threatLevel:threatValue===null?'UNKNOWN':(threatValue>70?'HIGH':threatValue>40?'MEDIUM':'LOW'),
      confidence:Number((confidence??0).toFixed(6)),
      sourceReliability:sourceReliability===null?'UNKNOWN':Number(sourceReliability.toFixed(6)),
      sourceCoverage:sourceRows.length,
      intent,capability:targetForce?clone(targetForce):null,
      timeHorizon:horizonRaw??'UNKNOWN',
      possibleVectors:vectors,
      uncertainty:Number((1-(confidence??0)).toFixed(6)),
      evidence
    };
    event('OMEGA_THREAT_ASSESSMENT_CREATED',cid,assessment,null,'THREAT-'+cid+'-'+String(target||'SELF')+'-'+turn());
    return assessment;
  }

  function treatyNegotiationStart(countryId,targetCountryId,details={}){
    const c=id(countryId),target=id(targetCountryId);
    if(!target)return{accepted:false,reason:'TARGET_COUNTRY_REQUIRED'};
    const relation=relationRecord(c,target);
    if(!relation)return{accepted:false,reason:'FOREIGN_RELATION_NOT_OBSERVED'};
    if(relation.war_state===true)return{accepted:false,reason:'COUNTRIES_IN_WAR_STATE'};
    return dispatch('foreign','OMEGA_AUTO_TREATY_NEGOTIATION_START',c,{
      targetCountryId:target,treatyType:details.treatyType||'BILATERAL_AGREEMENT',
      terms:clone(details.terms||{}),decisionId:details.decisionId||null,correlationId:details.correlationId||null
    },details.correlationId||details.decisionId||null);
  }

  function militaryOrganizeHandler(cmd,ctx){
    const p=cmd?.payload||{},structure=ctx.stateTransaction.get('military.forceStructure');
    if(!structure||typeof structure!=='object')return{accepted:false,reason:'FORCE_STRUCTURE_STATE_UNAVAILABLE'};
    const personnelKey=structure.personnel!==undefined?'personnel':structure.activePersonnel!==undefined?'activePersonnel':structure.manpower!==undefined?'manpower':null;
    if(!personnelKey)return{accepted:false,reason:'PERSONNEL_FIELD_UNAVAILABLE'};
    const organizedKey=structure.organizedPersonnel!==undefined?'organizedPersonnel':structure.organized_personnel!==undefined?'organized_personnel':structure.assignedPersonnel!==undefined?'assignedPersonnel':'organizedPersonnel';
    const unitsKey=structure.units!==undefined?'units':structure.unitCount!==undefined?'unitCount':'units';
    const current=scalar(structure[personnelKey]);
    if(current===null)return{accepted:false,reason:'PERSONNEL_VALUE_UNAVAILABLE'};
    const already=scalar(structure[organizedKey])??0;
    const available=Math.max(0,current-already);
    const quantity=Math.min(available,Math.max(0,num(p.quantity)??available));
    if(quantity<=0)return{accepted:false,reason:'NO_UNORGANIZED_PERSONNEL'};
    const perUnit=scalar(p.personnelPerUnit??structure.personnelPerUnit??structure.personnel_per_unit);
    if(perUnit===null||perUnit<=0)return{accepted:false,reason:'PERSONNEL_PER_UNIT_REQUIRED'};
    const unitsAdded=Math.floor(quantity/perUnit);
    if(unitsAdded<=0)return{accepted:false,reason:'INSUFFICIENT_PERSONNEL_FOR_UNIT'};
    const next=clone(structure);
    next[organizedKey]=already+unitsAdded*perUnit;
    const units=scalar(structure[unitsKey]);
    next[unitsKey]=(units===null?units:units+unitsAdded);
    ctx.stateTransaction.set('military.forceStructure',next);
    const row={organizationId:String(p.organizationId||('ORG-'+turn()+'-'+ctx.countryId)),personnel:unitsAdded*perUnit,unitsAdded,status:'ORGANIZED',createdTurn:turn(),decisionId:p.decisionId||null};
    const q=Array.isArray(ctx.stateTransaction.get('military.organizationQueue'))?ctx.stateTransaction.get('military.organizationQueue'):[];
    ctx.stateTransaction.set('military.organizationQueue',q.concat([row]).slice(-256));
    event('OMEGA_FORCE_STRUCTURE_CHANGED',ctx.countryId,{...row,forceStructure:next},cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,organization:row,newForceStructure:next,stateMutationAuthority:true};
  }

  function militaryReadinessHandler(cmd,ctx){
    const p=cmd?.payload||{},raw=ctx.stateTransaction.get('military.readiness');
    const readiness=scalar(raw),delta=num(p.readinessDelta);
    if(readiness===null)return{accepted:false,reason:'MILITARY_READINESS_STATE_UNAVAILABLE'};
    if(delta===null)return{accepted:false,reason:'READINESS_DELTA_REQUIRED'};
    const next=Math.max(0,Math.min(100,readiness+delta));
    ctx.stateTransaction.set('military.readiness',next);
    event('OMEGA_FORCE_STRUCTURE_CHANGED',ctx.countryId,{readinessBefore:readiness,readinessAfter:next,delta},cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,readinessBefore:readiness,readinessAfter:next,stateMutationAuthority:true};
  }

  function treatyHandler(cmd,ctx){
    const c=id(ctx.countryId),p=cmd?.payload||{},target=id(p.targetCountryId);
    if(!target)return{accepted:false,reason:'TARGET_COUNTRY_REQUIRED'};
    const relation=relationRecord(c,target);
    if(!relation)return{accepted:false,reason:'FOREIGN_RELATION_NOT_OBSERVED'};
    if(relation.war_state===true)return{accepted:false,reason:'COUNTRIES_IN_WAR_STATE'};
    const negotiations=ctx.stateTransaction.get('foreign.negotiations');
    const next=negotiations&&typeof negotiations==='object'?clone(negotiations):{};
    next[target]={status:'REQUESTED',stage:'NEGOTIATION_OPENED',targetCountryId:target,treatyType:p.treatyType||'BILATERAL_AGREEMENT',terms:clone(p.terms||{}),createdTurn:turn(),counterpartyDecision:'PENDING'};
    ctx.stateTransaction.set('foreign.negotiations',next);
    event('OMEGA_TREATY_NEGOTIATION_STARTED',c,{targetCountryId:target,negotiation:next[target]},cmd.commandId,p.correlationId||p.decisionId||null);
    return{accepted:true,negotiation:next[target],executionState:'COUNTERPARTY_DECISION_PENDING',stateMutationAuthority:true};
  }

  function bundleHandler(cmd){
    const p=cmd?.payload||{},c=id(p.countryId||cmd?.countryId),route=p.route;
    if(!route?.selected)return{accepted:false,reason:'AUTONOMY_ROUTE_MISSING'};
    const selected=route.selected,a=String(selected.action||'').toUpperCase(),decisionId=route.decisionId||p.decisionId||null;
    const reservationId='RES-'+turn()+'-'+c+'-'+String(decisionId||a).replace(/[^A-Z0-9_-]/gi,'');
    const plan=route.selected;
    const reservation={
      reservationId,decisionId,scenarioId:route.scenarioId,action:a,
      money:num(plan.plan?.cost)||(a==='IMPORT'&&plan.plan?.quantity!==null&&plan.targetCountryId&&plan.unitPrice!==null?plan.plan.quantity*plan.unitPrice:0),
      labor:num(plan.plan?.labor)||0,materials:clone(plan.plan?.materials||{}),executor:a==='IMPORT'?'trade':actionSubject(a),expiresTurn:turn()+64
    };
    const reserve=dispatch('cabinet','OMEGA_AUTO_RESERVE',c,reservation,decisionId);
    if(reserve?.status!=='APPLIED'){
      return{accepted:false,reason:'RESERVATION_FAILED',detail:reserve};
    }

    let result;
    if(a==='IMPORT'){
      result=dispatch('trade','OMEGA_AUTO_RESOURCE_IMPORT_REQUEST',c,{
        resourceId:route.resourceId||route.decision?.runtimeMeasurement?.resourceId||route.decision?.measurement?.resourceId,
        targetCountryId:plan.targetCountryId,quantity:plan.plan.quantity,unitPrice:plan.unitPrice,
        reservationId,decisionId,correlationId:decisionId
      },decisionId);
    }else if(['HOUSING_BUILD','INDUSTRY_BUILD','DOMESTIC_EXPANSION','PROCESSING_EXPANSION','INFRASTRUCTURE_EXPANSION'].includes(a)){
      const kind=a==='HOUSING_BUILD'?'HOUSING':a.includes('INDUSTRY')||a==='DOMESTIC_EXPANSION'||a==='PROCESSING_EXPANSION'?'FACTORY':'INFRASTRUCTURE';
      result=dispatch('projects','OMEGA_AUTO_PROJECT_CREATE',c,{
        projectId:'AUTO-PROJ-'+turn()+'-'+c+'-'+String(decisionId||a),
        action:a,kind,scenarioId:route.scenarioId,decisionId,
        reservationId,quantity:plan.plan.quantity,cost:plan.plan.cost,labor:plan.plan.labor,materials:plan.plan.materials,
        durationTurns:plan.plan.durationTurns,currency:null,dependencies:SUBJECT_ROUTES[actionSubject(a)]?.depends||[],
        linkedMinistries:Object.values(SUBJECT_ROUTES[actionSubject(a)]?.depends||{})
      },decisionId);
    }else if(a==='MILITARY_FACILITY_BUILD'){
      result=dispatch('projects','OMEGA_AUTO_PROJECT_CREATE',c,{projectId:'AUTO-MILFAC-'+turn()+'-'+c+'-'+String(decisionId||a),action:a,kind:'MILITARY_FACILITY',scenarioId:route.scenarioId,decisionId,reservationId,quantity:plan.plan.quantity,cost:plan.plan.cost,labor:plan.plan.labor,materials:plan.plan.materials,durationTurns:plan.plan.durationTurns,dependencies:SUBJECT_ROUTES.military.depends,linkedMinistries:SUBJECT_ROUTES.military.depends},decisionId);
    }else if(a==='MILITARY_RECRUIT'){
      result=dispatch('military','OMEGA_AUTO_MILITARY_RECRUIT',c,{quantity:plan.plan.quantity,reservationId,decisionId,correlationId:decisionId},decisionId);
    }else if(a==='MILITARY_ORGANIZE'){
      result=dispatch('military','OMEGA_AUTO_MILITARY_ORGANIZE',c,{quantity:plan.plan.quantity,personnelPerUnit:plan.plan.personnelPerUnit,reservationId,decisionId,correlationId:decisionId},decisionId);
    }else if(a==='MILITARY_TRAIN'){
      result=dispatch('military','OMEGA_AUTO_MILITARY_TRAIN',c,{quantity:plan.plan.quantity,durationTurns:plan.plan.durationTurns,reservationId,decisionId,readinessDelta:plan.plan.readinessDelta},decisionId);
    }else if(a==='MILITARY_EQUIP'){
      result=dispatch('military','OMEGA_AUTO_MILITARY_EQUIP',c,{quantity:plan.plan.quantity,item:plan.plan.item,reservationId,decisionId,correlationId:decisionId},decisionId);
    }else if(a==='TREATY_NEGOTIATION'){
      result=dispatch('foreign','OMEGA_AUTO_TREATY_NEGOTIATION_START',c,{targetCountryId:plan.targetCountryId,reservationId,decisionId},decisionId);
    }else{
      result={status:'FAILED',reason:'NO_AUTONOMY_EXECUTOR_FOR_ACTION:'+a};
    }

    if(result?.status!=='APPLIED'){
      dispatch('cabinet','OMEGA_AUTO_RELEASE_RESERVATION',c,{reservationId,correlationId:decisionId},decisionId);
      return{accepted:false,reason:'EXECUTOR_FAILED',detail:result,reservationId};
    }
    event('OMEGA_AUTONOMY_ACTION_DISPATCHED',c,{decisionId,action:a,reservationId,executorResult:clone(result)},cmd.commandId,decisionId);
    return{accepted:true,decisionId,action:a,reservationId,executorResult:clone(result),executionState:'APPLIED_OR_REQUESTED'};
  }

  function handlerFor(actionId){
    const m={
      OMEGA_AUTO_RESERVE:reserveHandler,
      OMEGA_AUTO_RELEASE_RESERVATION:releaseHandler,
      OMEGA_AUTO_RESOURCE_IMPORT_REQUEST:importHandler,
      OMEGA_AUTO_PROJECT_CREATE:projectCreateHandler,
      OMEGA_AUTO_PROJECT_TICK:projectTickHandler,
      OMEGA_AUTO_HOUSING_COMMISSION:housingCommission,
      OMEGA_AUTO_FACTORY_COMMISSION:factoryCommission,
      OMEGA_AUTO_MILITARY_FACILITY_COMMISSION:militaryFacilityCommission,
      OMEGA_AUTO_FINANCE_COMMIT:financeCommitHandler,
      OMEGA_AUTO_FINANCE_REFUND:financeRefundHandler,
      OMEGA_AUTO_RESOURCE_CONSUME:resourceConsumeHandler,
      OMEGA_AUTO_RESOURCE_RESTORE:resourceRestoreHandler,
      OMEGA_AUTO_INFRASTRUCTURE_COMMISSION:infrastructureCommission,
      OMEGA_AUTO_MILITARY_RECRUIT:recruitmentHandler,
      OMEGA_AUTO_MILITARY_TRAIN:trainingHandler,
      OMEGA_AUTO_MILITARY_ORGANIZE:militaryOrganizeHandler,
      OMEGA_AUTO_MILITARY_EQUIP:equipmentHandler,
      OMEGA_AUTO_MILITARY_READY:militaryReadinessHandler,
      OMEGA_AUTO_MILITARY_TICK:militaryTickHandler,
      OMEGA_AUTO_TREATY_NEGOTIATION_START:treatyHandler,
      OMEGA_AUTONOMY_BUNDLE:bundleHandler
    };
    return m[actionId]||(()=>({accepted:false,reason:'AUTONOMY_HANDLER_UNREGISTERED:'+actionId}));
  }

  function installHandlers(){
    const mesh=interop();
    try{
      if(mesh&&(!Array.isArray(mesh.ids)||mesh.ids.length===0))mesh.configure({
        registry:g.OmegaMinistryRegistry||g.Omega?.MinistryRegistry,
        provider:g.OmegaMinistryStateProvider?.instance||g.Omega?.MinistryStateProvider?.instance,
        stateTransaction:g.OmegaMinistryStateTransaction||g.Omega?.MinistryStateTransaction
      });
    }catch(_){}
    const defs=[
      ['OMEGA_AUTO_RESERVE','cabinet',{}],
      ['OMEGA_AUTO_RELEASE_RESERVATION','cabinet',{}],
      ['OMEGA_AUTO_RESOURCE_IMPORT_REQUEST','trade',{affectedMinistries:['finance','resource','foreign','trade']}],
      ['OMEGA_AUTO_PROJECT_CREATE','projects',{affectedMinistries:['finance','resource','economy'] }],
      ['OMEGA_AUTO_PROJECT_TICK','projects',{}],
      ['OMEGA_AUTO_HOUSING_COMMISSION','interior',{affectedStateDomains:['cities','interior']}],
      ['OMEGA_AUTO_FACTORY_COMMISSION','economy',{affectedStateDomains:['economy']}],
      ['OMEGA_AUTO_MILITARY_FACILITY_COMMISSION','military',{affectedStateDomains:['military']}],
      ['OMEGA_AUTO_FINANCE_COMMIT','finance',{affectedStateDomains:['finance']}],
      ['OMEGA_AUTO_FINANCE_REFUND','finance',{affectedStateDomains:['finance']}],
      ['OMEGA_AUTO_RESOURCE_CONSUME','resource',{affectedStateDomains:['resource']}],
      ['OMEGA_AUTO_RESOURCE_RESTORE','resource',{affectedStateDomains:['resource']}],
      ['OMEGA_AUTO_INFRASTRUCTURE_COMMISSION','transport',{affectedStateDomains:['transport']}],
      ['OMEGA_AUTO_MILITARY_RECRUIT','military',{affectedStateDomains:['military']}],
      ['OMEGA_AUTO_MILITARY_TRAIN','military',{affectedStateDomains:['military']}],
      ['OMEGA_AUTO_MILITARY_ORGANIZE','military',{affectedStateDomains:['military']}],
      ['OMEGA_AUTO_MILITARY_EQUIP','military',{affectedStateDomains:['military']}],
      ['OMEGA_AUTO_MILITARY_READY','military',{affectedStateDomains:['military']}],
      ['OMEGA_AUTO_MILITARY_TICK','military',{}],
      ['OMEGA_AUTO_TREATY_NEGOTIATION_START','foreign',{affectedStateDomains:['foreign']}],
      ['OMEGA_AUTONOMY_BUNDLE','cabinet',{affectedMinistries:['finance','resource','trade','foreign','projects','economy','military']}]
    ];
    for(const [a,o,d] of defs)registerAction(a,o,d);
    return defs.length;
  }

  function enqueue(route,t){
    const sim=getSimulation();
    if(!sim?.enqueueCommand)return null;
    const country=id(route.countryId);
    const command={
      commandId:'OAS-'+String(t)+'-'+country+'-'+String(route.decisionId||route.scenarioId||'AUTO'),
      commandType:'OMEGA_AUTONOMY_BUNDLE',
      actionId:'OMEGA_AUTONOMY_BUNDLE',
      sourceMinistryId:'cabinet',
      countryId:country,
      payload:{countryId:country,decisionId:route.decisionId||null,route},
      options:{origin:'OMEGA_AUTONOMY_ORCHESTRATOR',scenarioId:route.scenarioId||null,correlationId:route.decisionId||null}
    };
    try{sim.enqueueCommand(command);return command;}catch(_){return null;}
  }

  function installQueueBridge(){
    const rt=g.Omega?.OpponentCountryRuntime?.instance;
    if(!rt||rt.__omegaAutonomyQueueBridgeV1)return false;
    const original=rt.queue;
    if(typeof original!=='function')return false;
    rt.__omegaAutonomyOriginalQueue=original.bind(rt);
    rt.queue=function(decision,t){
      const routed=decide(clone(decision));
      if(routed.selectedAction){
        const c=enqueue(routed,t??turn());
        if(c)return c;
      }
      return null;
    };
    rt.__omegaAutonomyQueueBridgeV1=true;
    return true;
  }

  function tickProjects(){
    const sim=getSimulation();
    const state=g.Game?.state||g.gameState||{};
    const projects=state?.projects||{};
    for(const country of Object.keys(projects)){
      const list=Array.isArray(projects[country]?.registry)?projects[country].registry:[];
      if(list.some(p=>p?.autonomy&&['UNDER_CONSTRUCTION','COMMISSIONING'].includes(String(p.status||'').toUpperCase()))){
        try{sim?.enqueueCommand?.({
          commandId:'OAS-TICK-'+turn()+'-'+id(country),
          commandType:'OMEGA_AUTO_PROJECT_TICK',actionId:'OMEGA_AUTO_PROJECT_TICK',
          sourceMinistryId:'projects',countryId:id(country),payload:{countryId:id(country)},options:{origin:'OMEGA_AUTONOMY_PROJECT_CLOCK'}
        });}catch(_){}
      }
      if(Array.isArray(state?.military?.[id(country)]?.trainingQueue)&&state.military[id(country)].trainingQueue.some(x=>x.status==='IN_TRAINING')){
        try{sim?.enqueueCommand?.({
          commandId:'OAS-MIL-TICK-'+turn()+'-'+id(country),
          commandType:'OMEGA_AUTO_MILITARY_TICK',actionId:'OMEGA_AUTO_MILITARY_TICK',
          sourceMinistryId:'military',countryId:id(country),payload:{countryId:id(country)},options:{origin:'OMEGA_AUTONOMY_MILITARY_CLOCK'}
        });}catch(_){}
      }
    }
  }

  function diagnostics(){
    const rt=g.Omega?.OpponentCountryRuntime?.instance;
    return{
      version:VERSION,
      queueBridgeInstalled:!!rt?.__omegaAutonomyQueueBridgeV1,
      canonicalIdentityAvailable:!!(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge),
      ministryRegistryAvailable:!!(g.OmegaMinistryRegistry||g.Omega?.MinistryRegistry),
      stateProviderAvailable:!!(g.Omega?.MinistryStateProvider||g.OmegaMinistryStateProvider),
      interoperabilityAvailable:!!interop(),
      resourceBridgeAvailable:!!resourceBridge(),
      resourceEngineAvailable:!!g.ResourceMinistryEngine?.getIntegratedResourceState,
      projectExecutor:true,
      housingExecutor:true,
      factoryExecutor:true,
      militaryRecruitmentExecutor:true,
      militaryTrainingExecutor:true,
      militaryEquipmentExecutor:true,
      treatyInitiator:true,
      counterpartyResponse:false,
      threatFusion:true,
      reservationLedger:true,
      decisionWeights:clone(DECISION_WEIGHTS),
      routeCount:Object.keys(SUBJECT_ROUTES).length,
      eventRouteCount:Object.keys(EVENT_ROUTES).length
    };
  }

  function resolveEventRoute(eventType,countryId=null){
    const type=String(eventType||'').trim().toUpperCase(),route=EVENT_ROUTES[type]||null;
    return route?{eventType:type,countryId:countryId?id(countryId):null,owner:route.owner,domains:clone(route.domains),canonical:true}:{
      eventType:type,countryId:countryId?id(countryId):null,canonical:false,reason:'EVENT_ROUTE_NOT_REGISTERED'
    };
  }
  function findDataSources(subject,countryId,targetId=null){
    const route=sourceFor(String(subject),countryId,targetId);
    return{subject:String(subject),countryId:id(countryId),targetCountryId:targetId?id(targetId):null,primaryMinistry:route.primary||null,dependentMinistries:route.dependencies||[],authoritativePaths:(route.checks||[]).filter(x=>x?.authority||x?.availability==='AVAILABLE').map(x=>({path:x.path,source:x.source,availability:x.availability})),files:route.files||[],routeStatus:route.primary?'REGISTERED':'UNKNOWN'};
  }

  function apiRouteSubject(subject,countryId,targetId=null){return clone(sourceFor(String(subject),countryId,targetId));}
  function apiPlanDecision(decision){return clone(decide(clone(decision||{})));}
  function apiRouteDecision(decision,t=turn()){
    const r=decide(clone(decision||{}));
    if(r.selectedAction)return{status:'READY_TO_QUEUE',route:r,command:enqueue(r,t)};
    return{status:r.status,route:r,command:null};
  }
  function apiImportPlan(countryId,resourceId,quantity){
    const d={decisionId:'MANUAL-IMPORT-'+turn()+'-'+id(countryId),countryId:id(countryId),scenarioId:'RESOURCE_DEFICIT',
      runtimeMeasurement:{resourceId,required:num(quantity),available:0,gap:num(quantity),selected:{action:'IMPORT',quantity:num(quantity)}}};
    return apiPlanDecision(d);
  }
  function apiStartTreaty(countryId,targetCountryId,details={}){return treatyNegotiationStart(countryId,targetCountryId,details);}
  function apiThreat(countryId,targetCountryId=null){return threatFusion(countryId,targetCountryId);}
  function apiDispatch(action,countryId,payload={}){const a=String(action||'').toUpperCase();const c=id(countryId);const owner=
    a==='OMEGA_AUTO_HOUSING_COMMISSION'?'interior':
    a==='OMEGA_AUTO_FACTORY_COMMISSION'?'economy':
    a==='OMEGA_AUTO_MILITARY_FACILITY_COMMISSION'?'military':
    a.includes('TREATY')?'foreign':
    a.includes('MILITARY')||a.includes('RECRUIT')||a.includes('TRAIN')||a.includes('EQUIP')?'military':
    a.includes('PROJECT')?'projects':
    a.includes('IMPORT')?'trade':
    a.includes('FINANCE')?'finance':
    a.includes('RESOURCE')?'resource':'cabinet';
    return dispatch(owner,a,c,payload,payload?.correlationId||payload?.decisionId||null);}
  
  function init(){
    installHandlers();
    installQueueBridge();
    if(typeof g.addEventListener==='function'){
      g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>tickProjects());
      g.addEventListener('OMEGA_READY',()=>{installHandlers();installQueueBridge();});
      g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{installHandlers();installQueueBridge();});
    }
    return diagnostics();
  }

  const API=Object.freeze({
    VERSION,
    MINISTRIES:clone(MINISTRIES),
    SUBJECT_ROUTES:clone(SUBJECT_ROUTES),
    FILE_ROUTES:clone(FILE_ROUTES),
    EVENT_ROUTES:clone(EVENT_ROUTES),
    DECISION_WEIGHTS:clone(DECISION_WEIGHTS),
    diagnostics,
    canonicalCountry,
    routeSubject:apiRouteSubject,
    resolveEventRoute,
    findDataSources,
    collectEvidence:(countryId,subjects,targetId)=>collectEvidence(countryId,subjects,targetId),
    planDecision:apiPlanDecision,
    routeDecision:apiRouteDecision,
    importPlan:apiImportPlan,
    startTreatyNegotiation:apiStartTreaty,
    assessThreat:apiThreat,
    dispatch:apiDispatch,
    activeProjects,
    existingReservations,
    resourceSuppliers:findResourceSuppliers,
    chooseImportSupplier:(countryId,decision)=>clone(chooseImportSupplier(countryId,decision))
  });

  g.Omega=g.Omega||{};
  g.Omega.OpponentAutonomy=API;
  g.OmegaOpponentAutonomy=API;
  try{init();}catch(e){g.OmegaOpponentAutonomyError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
