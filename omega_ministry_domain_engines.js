/*
 * OMEGA INDEPENDENT 17-MINISTRY DOMAIN ENGINE REGISTRY v1.0.0
 *
 * Each canonical ministry receives its own executable engine instance.
 * Engines are intentionally independent:
 *   - no ministry engine executes another ministry engine
 *   - no legacy ministry_engine.js configuration is required for execution
 *   - inputs are observed from existing runtime state only
 *   - missing data remains missing; no synthetic domain values are invented
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';

  const IDS=Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

  function safeObject(value){
    return value && typeof value==='object' ? value : null;
  }

  function readPath(root,path){
    if(!root || !path) return undefined;
    const parts=String(path).split('.');
    let cursor=root;
    for(const part of parts){
      if(cursor==null) return undefined;
      if(Object.prototype.hasOwnProperty.call(Object(cursor),part)) cursor=cursor[part];
      else return undefined;
    }
    return cursor;
  }

  function cloneValue(value,seen=new WeakMap()){
    if(value==null || typeof value!=='object') return value;
    if(seen.has(value)) return seen.get(value);
    if(Array.isArray(value)){
      const out=[]; seen.set(value,out);
      for(const item of value) out.push(cloneValue(item,seen));
      return out;
    }
    const out={}; seen.set(value,out);
    for(const key of Object.keys(value)){
      if(key==='__proto__' || key==='constructor') continue;
      const v=value[key];
      if(v!==undefined && typeof v!=='function') out[key]=cloneValue(v,seen);
    }
    return out;
  }

  function finiteNumber(value){
    if(typeof value==='number' && Number.isFinite(value)) return value;
    if(typeof value==='string' && value.trim()!=='' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function countLike(value){
    if(Array.isArray(value)) return value.length;
    if(value instanceof Map || value instanceof Set) return value.size;
    if(value && typeof value==='object') return Object.keys(value).length;
    return null;
  }

  function normalizeCountryId(context){
    const raw=context?.countryId ||
      context?.gameState?.countryCode ||
      context?.gameState?.countryId ||
      context?.countryRecord?.code ||
      context?.countryRecord?.id ||
      global.Game?.currentActiveCountry ||
      global.CountryIOS?.activeCountry ||
      global.OmegaCabinetUI?.activeCountry ||
      '';
    return String(raw||'').trim().toUpperCase();
  }

  function pickCountryBucket(context,section){
    const source=context?.gameState?.[section];
    if(!source) return null;
    const id=normalizeCountryId(context);
    if(source[id]!=null) return source[id];
    const raw=context?.countryId;
    if(raw && source[raw]!=null) return source[raw];
    return null;
  }

  function collect(context,paths){
    const observed={};
    const missing=[];
    for(const path of paths){
      const value=readPath(context,path);
      if(value===undefined || value===null){
        missing.push(path);
      }else{
        observed[path]=cloneValue(value);
      }
    }
    return {observed,missing};
  }

  function finiteValues(observed){
    return Object.entries(observed)
      .map(([path,value])=>({path,value:finiteNumber(value)}))
      .filter(x=>x.value!==null);
  }

  function numericSummary(observed){
    const nums=finiteValues(observed);
    if(!nums.length) return {count:0};
    const values=nums.map(x=>x.value);
    return {
      count:values.length,
      min:Math.min(...values),
      max:Math.max(...values),
      total:values.reduce((a,b)=>a+b,0)
    };
  }

  function presenceRatio(observed,missing){
    const total=Object.keys(observed).length+missing.length;
    return total ? Number((Object.keys(observed).length/total).toFixed(4)) : 0;
  }

  function buildGenericDerived(observed,missing){
    return {
      numeric:numericSummary(observed),
      inputCompleteness:presenceRatio(observed,missing),
      hasObjectData:Object.values(observed).some(v=>v && typeof v==='object')
    };
  }

  class IndependentMinistryEngine{
    constructor(config){
      this.id=config.id;
      this.domain=config.domain;
      this.phase=config.phase;
      this.inputs=Object.freeze(config.inputs.slice());
      this._revision=0;
      this._lastExecution=null;
      this.independent=true;
      this.sharedExecutionDependency=null;
    }

    get revision(){ return this._revision; }

    execute(context={}){
      const prepared=context||{};
      const result=this._execute(prepared);
      this._revision+=1;
      const execution={
        engineId:this.id,
        engineVersion:VERSION,
        independent:true,
        sharedExecutionDependency:null,
        domain:this.domain,
        phase:this.phase,
        revision:this._revision,
        countryId:normalizeCountryId(prepared)||null,
        tick:Number.isFinite(prepared.turn)?prepared.turn:null,
        dt:Number.isFinite(prepared.dt)?prepared.dt:null,
        inputContract:this.inputs.slice(),
        ...result
      };
      this._lastExecution=execution;
      return cloneValue(execution);
    }

    _execute(context){
      const {observed,missing}=collect(context,this.inputs);
      return {
        status:'EXECUTED',
        availableInputCount:Object.keys(observed).length,
        requiredInputCount:this.inputs.length,
        missingInputs:missing,
        observedInputs:observed,
        derived:buildGenericDerived(observed,missing)
      };
    }

    diagnostics(){
      return {
        id:this.id,
        engineVersion:VERSION,
        independent:this.independent===true,
        revision:this._revision,
        lastExecution:cloneValue(this._lastExecution)
      };
    }
  }

  class CabinetEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      const policyCount=countLike(context?.store?.policies);
      const decisionCount=countLike(context?.store?.decisions);
      const ministerCount=countLike(context?.ministers);
      return {...base,derived:{
        ...base.derived,
        policyRecords:policyCount,
        decisionRecords:decisionCount,
        ministerRecords:ministerCount
      }};
    }
  }

  class DefenseEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      const budget=finiteNumber(base.observedInputs['economy.budget']);
      const gdp=finiteNumber(base.observedInputs['economy.gdp']);
      return {...base,derived:{
        ...base.derived,
        defenseBudgetToGdp:gdp!==null && budget!==null && gdp!==0 ? Number((budget/gdp).toFixed(6)) : null,
        procurementState:base.observedInputs['defense.procurement']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class MilitaryEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        combatState:base.observedInputs['military.combat']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        readinessState:base.observedInputs['military.readiness']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        forceStructure:base.observedInputs['military.forceStructure']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class FinanceEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      const gdp=finiteNumber(base.observedInputs['economy.gdp']);
      const debt=finiteNumber(base.observedInputs['economy.debt']);
      return {...base,derived:{
        ...base.derived,
        debtToGdp:gdp!==null && debt!==null && gdp!==0 ? Number((debt/gdp).toFixed(6)) : null,
        reserveState:base.observedInputs['finance.reserves']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        taxState:base.observedInputs['finance.taxRevenue']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class EconomyEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        industrialState:base.observedInputs['economy.production']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        inflationState:base.observedInputs['economy.inflation']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        employmentState:base.observedInputs['economy.unemployment']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class TradeEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        relationRecords:countLike(base.observedInputs['trade.relations']),
        tradeBalanceState:base.observedInputs['trade.balance']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class ForeignEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        diplomaticRelationRecords:countLike(base.observedInputs['foreign.relations']),
        treatyState:base.observedInputs['foreign.treaties']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class IntelligenceEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        intelligenceState:base.observedInputs['intelligence.state']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        cyberState:base.observedInputs['intelligence.cyber']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class InteriorEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        stabilityState:base.observedInputs['interior.stability']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        corruptionState:base.observedInputs['interior.corruption']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class TransportEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        infrastructureState:base.observedInputs['transport.infrastructure']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        logisticsState:base.observedInputs['transport.logistics']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class ResourceEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      const resourceState=context?.resourceEngineState||null;
      return {...base,derived:{
        ...base.derived,
        resourceEngineAvailable:!!resourceState,
        resourceRecordCount:countLike(resourceState?.inventory||resourceState?.deposits||resourceState)
      }};
    }
  }

  class HealthEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        populationRecords:countLike(base.observedInputs['population']),
        healthState:base.observedInputs['health.state']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        welfareState:base.observedInputs['health.welfare']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class EducationEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        educationEngineAvailable:!!context?.educationEngine,
        educationState:base.observedInputs['education.state']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        researchLinkState:base.observedInputs['education.research']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class TechnologyEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        researchState:base.observedInputs['technology.research']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        innovationState:base.observedInputs['technology.innovation']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class ProjectsEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        projectRecords:countLike(base.observedInputs['projects.registry']),
        legalState:base.observedInputs['projects.legal']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class CultureEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      return {...base,derived:{
        ...base.derived,
        cultureState:base.observedInputs['culture.state']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        mediaState:base.observedInputs['culture.media']!==undefined ? 'OBSERVED' : 'UNAVAILABLE',
        socialState:base.observedInputs['culture.social']!==undefined ? 'OBSERVED' : 'UNAVAILABLE'
      }};
    }
  }

  class StatisticsEngine extends IndependentMinistryEngine{
    _execute(context){
      const base=super._execute(context);
      const sections=Object.values(base.observedInputs).filter(v=>v && typeof v==='object').length;
      return {...base,derived:{
        ...base.derived,
        observedSectionCount:sections,
        evidenceMode:'OBSERVE_ONLY'
      }};
    }
  }

  function config(id,domain,phase,inputs){
    return {id,domain,phase,inputs};
  }

  const CONFIGS=Object.freeze({
    cabinet:config('cabinet','executive_coordination','COORDINATE',[
      'countryRecord','ministers','store.policies','store.decisions'
    ]),
    defense:config('defense','defense_policy','PLAN',[
      'economy.gdp','economy.budget','defense.procurement','defense.readiness','resourceSummary'
    ]),
    military:config('military','force_readiness','READINESS',[
      'military.combat','military.readiness','military.forceStructure','military.logistics'
    ]),
    finance:config('finance','fiscal_state','FISCAL_REVIEW',[
      'economy.gdp','economy.debt','finance.reserves','finance.taxRevenue','finance.spending'
    ]),
    economy:config('economy','economic_state','MACRO_REVIEW',[
      'economy.gdp','economy.debt','economy.inflation','economy.unemployment','economy.production'
    ]),
    trade:config('trade','commerce_state','COMMERCE_REVIEW',[
      'trade.relations','trade.balance','trade.exports','trade.imports','foreign.relations'
    ]),
    foreign:config('foreign','diplomatic_state','DIPLOMATIC_REVIEW',[
      'foreign.relations','foreign.treaties','foreign.sanctions','foreign.embassies'
    ]),
    intelligence:config('intelligence','intelligence_state','INTELLIGENCE_REVIEW',[
      'intelligence.state','intelligence.cyber','intelligence.threats','intelligence.sources'
    ]),
    interior:config('interior','civil_administration','CIVIL_REVIEW',[
      'interior.stability','interior.corruption','interior.security','population'
    ]),
    transport:config('transport','infrastructure_logistics','INFRASTRUCTURE_REVIEW',[
      'transport.infrastructure','transport.logistics','transport.ports','transport.rail'
    ]),
    resource:config('resource','resource_governance','RESOURCE_REVIEW',[
      'resourceSummary','resourceInventory','resourceDeposits','economy.production'
    ]),
    health:config('health','public_health','HEALTH_REVIEW',[
      'population','health.state','health.welfare','health.hospitals'
    ]),
    education:config('education','human_capital','HUMAN_CAPITAL_REVIEW',[
      'education.state','education.research','education.enrollment','population'
    ]),
    technology:config('technology','science_technology','SCIENCE_REVIEW',[
      'technology.research','technology.innovation','technology.patents','technology.rnd'
    ]),
    projects:config('projects','government_projects','PROJECT_REVIEW',[
      'projects.registry','projects.legal','projects.budget','projects.transport'
    ]),
    culture:config('culture','culture_media','CULTURE_REVIEW',[
      'culture.state','culture.media','culture.social','population'
    ]),
    statistics:config('statistics','national_statistics','STATISTICS_REVIEW',[
      'countryRecord','population','economy','relations','resourceSummary'
    ])
  });

  const CLASS_MAP=Object.freeze({
    cabinet:CabinetEngine,
    defense:DefenseEngine,
    military:MilitaryEngine,
    finance:FinanceEngine,
    economy:EconomyEngine,
    trade:TradeEngine,
    foreign:ForeignEngine,
    intelligence:IntelligenceEngine,
    interior:InteriorEngine,
    transport:TransportEngine,
    resource:ResourceEngine,
    health:HealthEngine,
    education:EducationEngine,
    technology:TechnologyEngine,
    projects:ProjectsEngine,
    culture:CultureEngine,
    statistics:StatisticsEngine
  });

  const registry=new Map();
  for(const id of IDS){
    const Ctor=CLASS_MAP[id];
    if(typeof Ctor!=='function') throw new Error('Missing independent ministry engine class: '+id);
    registry.set(id,Object.freeze(new Ctor(CONFIGS[id])));
  }

  function get(id){ return registry.get(String(id))||null; }

  function execute(id,context){ 
    const engine=get(id);
    if(!engine) throw new Error('Unknown canonical ministry engine: '+id);
    return engine.execute(context);
  }

  function health(){
    const rows=IDS.map(id=>registry.get(id));
    const unique=new Set(rows);
    return {
      version:VERSION,
      count:rows.length,
      independent:rows.filter(e=>e.independent===true).length,
      uniqueInstances:unique.size,
      sharedExecutionDependencies:rows.filter(e=>e.sharedExecutionDependency!==null).length
    };
  }

  const api=Object.freeze({
    version:VERSION,
    ids:IDS,
    registry,
    get,
    execute,
    health
  });

  global.Omega=global.Omega||{};
  global.OmegaMinistryDomainEngines=api;
})(typeof window!=='undefined'?window:globalThis);
