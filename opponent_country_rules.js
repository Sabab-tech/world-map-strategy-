/**
 * OMEGA OPPONENT COUNTRY RULES RUNTIME v1.0.0
 *
 * Canonical runtime decision layer for non-player countries.
 *
 * Authority:
 *   - reads authoritative world/game state
 *   - reads canonical country identity
 *   - connects to raw JSON datasets through the dataset gateway
 *   - evaluates declarative rule definitions
 *   - produces deterministic opponent intents
 *   - queues routable intents through OMEGA Simulation Runtime
 *
 * Non-responsibilities:
 *   - no country fact catalog
 *   - no duplicate world database
 *   - no fabricated economic/resource/military values
 *   - no direct UI control
 *   - no real-world clock dependence
 *
 * Execution:
 *   committed turn -> evaluate opponents -> queue intents -> next INPUT phase
 *   -> existing ministry/domain engines -> authoritative state -> next turn
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
  const SCHEMA_VERSION=1;
  const DEFAULT_COUNTRY_DATASET='countries';
  const MAX_DECISION_HISTORY=1000;
  const MAX_COUNTRY_QUEUE=400;
  const DATA_CACHE_TTL_TURNS=24;

  const DATASETS=Object.freeze({
    countries:Object.freeze({id:'countries',path:'countries.json',role:'country identity and canonical country records',required:true}),
    economy:Object.freeze({id:'economy',path:'economy.json',role:'macro-economic inputs',required:false}),
    population:Object.freeze({id:'population',path:'population.json',role:'demographic inputs',required:false}),
    resources:Object.freeze({id:'resources',path:'resources.json',role:'resource inventories, deposits, production and demand',required:false}),
    cities:Object.freeze({id:'cities',path:'cities.json',role:'city and infrastructure observations',required:false}),
    world:Object.freeze({id:'world',path:'world.json',role:'world geography metadata',required:false})
  });

  const MINISTRY_IDS=Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

  const SIGNALS=Object.freeze({
    GDP:{sources:[['state','economy.gdp'],['dataset:economy','gdp']]},
    GDP_GROWTH:{sources:[['state','economy.gdp_growth'],['dataset:economy','gdp_growth']]},
    INFLATION:{sources:[['state','economy.inflation'],['dataset:economy','inflation']]},
    DEBT:{sources:[['state','finance.debt'],['state','economy.debt'],['dataset:economy','debt']]},
    TRADE_BALANCE:{sources:[['state','economy.trade_balance'],['dataset:economy','trade_balance']]},
    POPULATION:{sources:[['state','population.population'],['state','population.population_2015'],['dataset:population','population_2015'],['dataset:population','population']]},
    POPULATION_GROWTH:{sources:[['state','population.annual_growth_rate'],['state','population.growth_rate'],['dataset:population','annual_growth_rate'],['dataset:population','growth_rate']]},
    STABILITY:{sources:[['state','interior.stability'],['state','interior.state.stability']]},
    CORRUPTION:{sources:[['state','interior.corruption']]},
    MILITARY_READINESS:{sources:[['state','military.readiness'],['state','defense.readiness']]},
    DEFENSE_THREAT:{sources:[['state','defense.threatLevel'],['state','intelligence.threatLevel'],['state','relations.securityThreat']]},
    FOREIGN_TENSION:{sources:[['state','relations.foreignTension'],['state','relations.tension'],['state','foreign.tension']]},
    TECHNOLOGY_CAPABILITY:{sources:[['state','technology.capability'],['state','technology.readiness'],['state','technology.score']]},
    HEALTH_PRESSURE:{sources:[['state','health.pressure'],['state','health.crisisLevel']]},
    EDUCATION_CAPACITY:{sources:[['state','education.capacity'],['state','education.quality']]},
    TRANSPORT_STRESS:{sources:[['state','transport.stress'],['state','transport.capacityPressure']]},
    RESOURCE_OIL_STOCK:{sources:[['state','resource.inventory.oil'],['state','resource.inventory.crude_oil']]},
    RESOURCE_OIL_DEMAND:{sources:[['state','resource.demand.oil'],['state','resource.demand.crude_oil']]},
    RESOURCE_ENERGY_BALANCE:{sources:[['state','resource.energy.balance'],['state','resource.energy.net']]}
  });

  const RULES=Object.freeze([
    {id:'DOMESTIC_STABILITY_RESPONSE',domain:'domestic_stability',priority:90,trigger:{signal:'STABILITY',operator:'LT',value:45},ministryId:'interior',actionId:'OPPONENT_INTERNAL_STABILIZATION_REVIEW',downstream:['finance','education','health','economy'],cooldownTurns:2},
    {id:'FISCAL_STRESS_RESPONSE',domain:'fiscal',priority:88,trigger:{derived:'debtToGdp',operator:'GTE',value:0.8},ministryId:'finance',actionId:'OPPONENT_FISCAL_POLICY_REVIEW',downstream:['economy','projects','defense','social'],cooldownTurns:3},
    {id:'INFLATION_RESPONSE',domain:'macro_stability',priority:87,trigger:{signal:'INFLATION',operator:'GTE',value:8},ministryId:'finance',actionId:'OPPONENT_INFLATION_RESPONSE',downstream:['economy','trade','resource'],cooldownTurns:2},
    {id:'RECESSION_RESPONSE',domain:'growth',priority:86,trigger:{signal:'GDP_GROWTH',operator:'LT',value:0},ministryId:'economy',actionId:'OPPONENT_GROWTH_POLICY_REVIEW',downstream:['finance','trade','projects','education'],cooldownTurns:3},
    {id:'TRADE_BALANCE_DEFICIT_RESPONSE',domain:'external_economy',priority:74,trigger:{derived:'tradeBalanceToGdp',operator:'LTE',value:-0.05},ministryId:'trade',actionId:'OPPONENT_TRADE_DIVERSIFICATION_REVIEW',downstream:['foreign','economy','transport','resource'],cooldownTurns:4},
    {id:'RESOURCE_SECURITY_RESPONSE',domain:'strategic_resources',priority:89,trigger:{derived:'oilCoverageDays',operator:'LT',value:45},ministryId:'resource',actionId:'OPPONENT_RESOURCE_SECURITY_REVIEW',downstream:['trade','foreign','economy','transport'],cooldownTurns:2},
    {id:'MILITARY_READINESS_RESPONSE',domain:'national_defense',priority:83,trigger:{signal:'MILITARY_READINESS',operator:'LT',value:60},ministryId:'defense',actionId:'OPPONENT_DEFENSE_READINESS_REVIEW',downstream:['military','finance','technology','projects'],cooldownTurns:3},
    {id:'FOREIGN_TENSION_RESPONSE',domain:'foreign_relations',priority:84,trigger:{signal:'FOREIGN_TENSION',operator:'GTE',value:70},ministryId:'foreign',actionId:'OPPONENT_DIPLOMATIC_TENSION_RESPONSE',downstream:['defense','intelligence','trade','economy'],cooldownTurns:1},
    {id:'SECURITY_THREAT_RESPONSE',domain:'national_security',priority:92,trigger:{signal:'DEFENSE_THREAT',operator:'GTE',value:75},ministryId:'cabinet',actionId:'OPPONENT_NATIONAL_SECURITY_REVIEW',downstream:['defense','military','intelligence','foreign','interior'],cooldownTurns:1},
    {id:'TECHNOLOGY_CAPACITY_RESPONSE',domain:'technology',priority:67,trigger:{signal:'TECHNOLOGY_CAPABILITY',operator:'LT',value:50},ministryId:'technology',actionId:'OPPONENT_TECHNOLOGY_CAPABILITY_REVIEW',downstream:['education','economy','defense','projects'],cooldownTurns:6},
    {id:'HEALTH_PRESSURE_RESPONSE',domain:'public_health',priority:80,trigger:{signal:'HEALTH_PRESSURE',operator:'GTE',value:70},ministryId:'health',actionId:'OPPONENT_PUBLIC_HEALTH_RESPONSE',downstream:['finance','education','interior','transport'],cooldownTurns:2},
    {id:'EDUCATION_CAPACITY_RESPONSE',domain:'human_capital',priority:61,trigger:{signal:'EDUCATION_CAPACITY',operator:'LT',value:50},ministryId:'education',actionId:'OPPONENT_EDUCATION_CAPACITY_REVIEW',downstream:['finance','technology','economy','projects'],cooldownTurns:8},
    {id:'TRANSPORT_STRESS_RESPONSE',domain:'infrastructure',priority:64,trigger:{signal:'TRANSPORT_STRESS',operator:'GTE',value:75},ministryId:'transport',actionId:'OPPONENT_TRANSPORT_CAPACITY_REVIEW',downstream:['projects','economy','resource','trade'],cooldownTurns:4},
    {id:'NEGATIVE_POPULATION_GROWTH_RESPONSE',domain:'demography',priority:58,trigger:{signal:'POPULATION_GROWTH',operator:'LT',value:0},ministryId:'statistics',actionId:'OPPONENT_DEMOGRAPHIC_RISK_REVIEW',downstream:['health','education','economy','interior'],cooldownTurns:12},
    {id:'MULTI_DOMAIN_CRISIS_RESPONSE',domain:'cross_domain_crisis',priority:100,trigger:{derived:'criticalPressureCount',operator:'GTE',value:3},ministryId:'cabinet',actionId:'OPPONENT_CROSS_DOMAIN_CRISIS_REVIEW',downstream:['finance','economy','resource','foreign','defense','interior','health','transport','technology'],cooldownTurns:1}
  ].map(Object.freeze));

  const ACTION_DEFINITIONS=Object.freeze(RULES.map(rule=>Object.freeze({
    actionId:rule.actionId,
    ownerMinistry:rule.ministryId,
    stateOwnerMinistry:rule.ministryId,
    ruleId:rule.id,
    affectedMinistries:rule.downstream,
    expectedOutputs:['MINISTRY_OWNED_OPPONENT_INTENT'],
    downstreamEffects:rule.downstream.map(ministryId=>({ministryId,mode:'REQUEST_OR_CAUSAL_INPUT'}))
  })));

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    if(value instanceof Map){const out={};seen.set(value,out);for(const [k,v] of value.entries())out[String(k)]=clone(v,seen);return out;}
    const out={};seen.set(value,out);
    for(const key of Object.keys(value)){if(key==='__proto__'||key==='constructor')continue;const v=value[key];if(v!==undefined&&typeof v!=='function')out[key]=clone(v,seen);}
    return out;
  }

  function number(value){const n=Number(value);return Number.isFinite(n)?n:null;}
  function normalizeId(value){return String(value??'').trim().toUpperCase();}
  function compare(actual,operator,expected){
    const a=number(actual),e=number(expected);
    switch(String(operator||'').toUpperCase()){
      case 'EQ':return actual===expected||(a!==null&&e!==null&&a===e);
      case 'NEQ':return !(actual===expected||(a!==null&&e!==null&&a===e));
      case 'GT':return a!==null&&e!==null&&a>e;
      case 'GTE':return a!==null&&e!==null&&a>=e;
      case 'LT':return a!==null&&e!==null&&a<e;
      case 'LTE':return a!==null&&e!==null&&a<=e;
      case 'TRUTHY':return !!actual;
      case 'FALSY':return !actual;
      default:return null;
    }
  }
  function deepRead(root,path){
    if(root==null)return undefined;
    let cur=root;
    for(const part of String(path||'').split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
      cur=cur[part];
    }
    return cur;
  }
  function countryMatch(row,countryId){
    const wanted=normalizeId(countryId);
    if(!row||typeof row!=='object')return false;
    return ['id','code','iso2','iso3','countryId','countryCode','key','name','country','countryName'].some(key=>{
      const value=deepRead(row,key);
      return value!=null&&normalizeId(value)===wanted;
    });
  }
  function unwrapDataset(raw){
    if(Array.isArray(raw))return raw;
    if(!raw||typeof raw!=='object')return raw;
    for(const key of ['countries','countryProfiles','data','records','items','rows']){
      if(Array.isArray(raw[key]))return raw[key];
      if(raw[key]&&typeof raw[key]==='object')return raw[key];
    }
    return raw;
  }
  function getDatasetCountryRecord(raw,countryId){
    const data=unwrapDataset(raw);
    if(Array.isArray(data))return clone(data.find(row=>countryMatch(row,countryId))||null);
    if(data&&typeof data==='object'){
      const wanted=normalizeId(countryId);
      const direct=data[countryId]??data[wanted];
      if(direct!==undefined)return clone(direct);
      const key=Object.keys(data).find(k=>normalizeId(k)===wanted);
      if(key!==undefined)return clone(data[key]);
      for(const [entryKey,row] of Object.entries(data)){if(countryMatch(row,countryId)||normalizeId(entryKey)===wanted)return clone(row);}
    }
    return null;
  }
  function getStateRoot(){return global.Game?.state||global.gameState||global.Omega?.AuthoritativeWorldState?.state||{};}
  function getSimulationRuntime(){return global.Omega?.Simulation||global.Omega?.SimulationRuntime||null;}
  function getInterop(){return global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null;}
  function getCountryRegistry(){return global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||null;}
  function getCurrentTurn(){
    const state=getStateRoot(),runtime=getSimulationRuntime();
    for(const value of [state.simulation?.turn,state.simulationTurn,state.turn,runtime?.clock?.turn]){
      const n=number(value);if(n!==null)return n;
    }
    return 0;
  }
  function getPlayerCountryId(){
    const runtime=getSimulationRuntime(),state=getStateRoot();
    for(const value of [runtime?.getPlayerCountryId?.(),state.simulation?.session?.playerCountryId,state.playerCountryId,global.OmegaCabinetUI?.activeCountry,global.CountryIOS?.activeCountry,global.Game?.currentActiveCountry,state.countryCode,state.countryId]){
      const id=normalizeId(value);if(id)return id;
    }
    return null;
  }

  class DatasetGateway{
    constructor(options={}){
      this.version=VERSION;
      this.manifest={...DATASETS,...clone(options.manifest||{})};
      this.cache=new Map();
      this.pending=new Map();
      this.loadedTurn=new Map();
      this.basePath=String(options.basePath||'').trim();
      this.fetchImpl=options.fetchImpl||global.fetch?.bind(global)||null;
    }
    descriptor(id){return clone(this.manifest[String(id)]);}
    set(id,data,turn=getCurrentTurn()){const key=String(id);this.cache.set(key,clone(data));this.loadedTurn.set(key,number(turn)??0);return true;}
    get(id){const value=this.cache.get(String(id));return value===undefined?undefined:clone(value);}
    async load(id,options={}){
      const key=String(id||'');
      if(!key)throw new Error('OPPONENT_DATASET_ID_REQUIRED');
      const cached=this.cache.get(key),loadedAt=this.loadedTurn.get(key),now=number(options.turn)??getCurrentTurn();
      if(cached!==undefined&&loadedAt!==undefined&&now-loadedAt<=DATA_CACHE_TTL_TURNS)return clone(cached);
      if(this.pending.has(key))return clone(await this.pending.get(key));
      const descriptor=this.manifest[key];
      if(!descriptor)throw new Error('OPPONENT_DATASET_NOT_REGISTERED:'+key);
      if(!this.fetchImpl)throw new Error('OPPONENT_DATASET_FETCH_UNAVAILABLE:'+key);
      const url=this.basePath?this.basePath.replace(/\/$/,'')+'/'+descriptor.path:descriptor.path;
      const task=(async()=>{
        const response=await this.fetchImpl(url,{cache:'no-store'});
        if(!response?.ok)throw new Error('OPPONENT_DATASET_FETCH_FAILED:'+key);
        const json=await response.json();
        this.set(key,json,now);
        return clone(json);
      })();
      this.pending.set(key,task);
      try{return clone(await task);}finally{this.pending.delete(key);}
    }
    async loadRequired(ids,turn){const out={};for(const id of ids||[])out[id]=await this.load(id,{turn});return out;}
    status(){
      const result={};
      for(const [id,descriptor] of Object.entries(this.manifest)){
        result[id]={path:descriptor.path,required:descriptor.required===true,loaded:this.cache.has(id),loadedTurn:this.loadedTurn.get(id)??null,role:descriptor.role};
      }
      return result;
    }
    saveState(){
      const datasets={};for(const [id,data] of this.cache.entries())datasets[id]=clone(data);
      return {schemaVersion:1,datasets,loadedTurn:Object.fromEntries(this.loadedTurn.entries())};
    }
    restoreState(snapshot){
      this.cache=new Map(Object.entries(snapshot?.datasets||{}).map(([k,v])=>[k,clone(v)]));
      this.loadedTurn=new Map(Object.entries(snapshot?.loadedTurn||{}).map(([k,v])=>[k,number(v)??0]));
      this.pending.clear();
      return true;
    }
  }

  class OpponentCountryRulesRuntime{
    constructor(options={}){
      this.version=VERSION;
      this.schemaVersion=SCHEMA_VERSION;
      this.rules=RULES.map(clone);
      this.actions=ACTION_DEFINITIONS.map(clone);
      this.gateway=options.gateway||new DatasetGateway(options);
      this.decisionHistory=[];
      this.countryState=new Map();
      this.initialized=false;
      this.running=true;
      this.evaluating=false;
      this.lastTurn=null;
      this.lastError=null;
      this.listeners=new Set();
      this.registeredActions=new Set();
      this.attached=false;
    }
    configure(options={}){
      if(options.gateway)this.gateway=options.gateway;
      if(options.manifest)this.gateway.manifest={...this.gateway.manifest,...clone(options.manifest)};
      if(options.running!==undefined)this.running=Boolean(options.running);
      if(typeof options.onDecision==='function')this.listeners.add(options.onDecision);
      return this.diagnostics();
    }
    registerRule(rule){
      if(!rule?.id)throw new Error('OPPONENT_RULE_ID_REQUIRED');
      const copy=clone(rule);this.rules.push(copy);return clone(copy);
    }
    attachToSimulation(){
      if(this.attached)return true;
      if(typeof global.addEventListener!=='function')return false;
      global.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',event=>{
        const turn=number(event?.detail?.payload?.turn??event?.detail?.turn)??getCurrentTurn();
        void this.onTurnCommitted(turn);
      });
      this.attached=true;
      return true;
    }
    async initialize(options={}){
      this.ensureRuntimeBindings();
      if(options.fetchCountries!==false){
        try{await this.gateway.load(DEFAULT_COUNTRY_DATASET,{turn:options.turn??getCurrentTurn()});}
        catch(error){this.lastError=String(error?.message||error);}
      }
      this.initialized=true;
      return this.diagnostics();
    }
    ensureRuntimeBindings(){
      const interop=getInterop();
      if(!interop?.registerAction||!interop?.registerCommandHandler)return {status:'UNAVAILABLE',reason:'INTEROPERABILITY_BINDING_API_UNAVAILABLE'};

      const results=[];
      for(const definition of this.actions){
        const actionId=String(definition.actionId||'');
        const owner=String(definition.ownerMinistry||'');
        if(!actionId||!MINISTRY_IDS.includes(owner))continue;
        if(this.registeredActions.has(actionId))continue;

        try{
          const existing=interop.instance?.decisionFramework?.getAction?.(actionId) ||
            global.OmegaMinistryDecisionFramework?.instance?.getAction?.(actionId) || null;
          if(!existing){
            interop.registerAction(actionId,{
              actionId,
              stateOwnerMinistry:owner,
              authority:'OMEGA_OPPONENT_COUNTRY_RULES',
              affectedMinistries:clone(definition.affectedMinistries||[]),
              expectedOutputs:clone(definition.expectedOutputs||[]),
              downstreamEffects:clone(definition.downstreamEffects||[]),
              requirements:[],
              optionalRequirements:[],
              blockingConditions:[],
              warningConditions:[]
            });
          }

          interop.registerCommandHandler(actionId,owner,(command,{stateTransaction,emitEvent,simulationTurn})=>{
            const decision=command?.payload?.opponentRuleDecision||{};
            const queuePath=owner+'.opponentIntentQueue';
            const existingQueue=stateTransaction.get(queuePath);
            const queue=Array.isArray(existingQueue)?existingQueue.slice(-31):[];
            queue.push({
              commandId:command.commandId,
              decisionId:decision.decisionId||null,
              ruleId:decision.ruleId||definition.ruleId||null,
              actionId,
              countryId:command.countryId,
              simulationTurn,
              priority:Number(decision.priority||0),
              severity:Number(decision.severity||0),
              evidence:clone(decision.evidence||null),
              affectedMinistries:clone(decision.affectedMinistries||definition.affectedMinistries||[])
            });
            stateTransaction.set(queuePath,queue);
            stateTransaction.set(owner+'.opponentLastIntent',queue[queue.length-1]);
            emitEvent?.('OMEGA_OPPONENT_RULE_INTENT_APPLIED',{
              actionId,ruleId:decision.ruleId||definition.ruleId||null,decisionId:decision.decisionId||null
            });
            return {
              accepted:true,
              eventType:'OMEGA_OPPONENT_RULE_INTENT_APPLIED',
              eventPayload:{actionId,ruleId:decision.ruleId||definition.ruleId||null},
              provenance:{runtime:'OMEGA_OPPONENT_COUNTRY_RULES',runtimeVersion:VERSION}
            };
          });

          this.registeredActions.add(actionId);
          results.push({actionId,status:'BOUND',ownerMinistry:owner});
        }catch(error){
          results.push({actionId,status:'FAILED',ownerMinistry:owner,error:String(error?.message||error)});
        }
      }
      return {status:'READY',results};
    }

    async onTurnCommitted(turn=getCurrentTurn()){
      if(!this.running||this.evaluating)return {status:'SKIPPED',reason:'NOT_RUNNING_OR_BUSY',turn};
      this.evaluating=true;this.lastError=null;
      try{
        this.ensureRuntimeBindings();
        const currentTurn=number(turn)??getCurrentTurn();
        const playerCountryId=getPlayerCountryId();
        const countryIds=await this.listCountryIds(currentTurn);
        const opponents=countryIds.filter(id=>!playerCountryId||id!==playerCountryId);
        const decisions=[];
        for(const countryId of opponents.slice(0,MAX_COUNTRY_QUEUE)){
          const result=await this.evaluateCountry(countryId,currentTurn);
          decisions.push(...result.decisions);
        }
        const queued=decisions.map(decision=>this.queueIntent(decision,currentTurn));
        this.recordDecisions(currentTurn,decisions,queued);
        this.lastTurn=currentTurn;this.initialized=true;
        this.emit({eventType:'OMEGA_OPPONENT_COUNTRY_DECISIONS_READY',simulationTurn:currentTurn,opponentCountries:opponents.length,decisions:decisions.length,queued:queued.filter(x=>x.status==='QUEUED').length});
        return {status:'COMPLETE',turn:currentTurn,opponents:opponents.length,decisions:decisions.length,queued};
      }catch(error){
        this.lastError=String(error?.message||error);
        this.emit({eventType:'OMEGA_OPPONENT_COUNTRY_RUNTIME_ERROR',simulationTurn:number(turn)??getCurrentTurn(),error:this.lastError});
        return {status:'ERROR',turn:number(turn)??getCurrentTurn(),error:this.lastError};
      }finally{this.evaluating=false;}
    }
    async listCountryIds(turn){
      const registry=getCountryRegistry();
      try{
        const exported=registry?.exportData?.();
        if(Array.isArray(exported?.countries)&&exported.countries.length){
          return [...new Set(exported.countries.map(row=>normalizeId(row?.id||row?.code)).filter(Boolean))].sort();
        }
      }catch(_){}
      let raw=this.gateway.get(DEFAULT_COUNTRY_DATASET);
      if(raw===undefined)raw=await this.gateway.load(DEFAULT_COUNTRY_DATASET,{turn});
      const data=unwrapDataset(raw),rows=[];
      if(Array.isArray(data)){
        for(const row of data){const id=normalizeId(row?.id||row?.code||row?.iso3||row?.countryCode);if(id)rows.push(id);}
      }else if(data&&typeof data==='object'){
        for(const [key,row] of Object.entries(data)){const id=normalizeId(row?.id||row?.code||row?.iso3||key);if(id)rows.push(id);}
      }
      return [...new Set(rows)].sort();
    }
    async evaluateCountry(countryId,turn=getCurrentTurn()){
      const id=normalizeId(countryId);if(!id)return {countryId:null,turn,decisions:[],signals:{}};
      const context=await this.buildContext(id,turn),cooldowns=this.countryState.get(id)?.cooldowns||{},decisions=[];
      for(const rule of this.rules.slice().sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.id).localeCompare(String(b.id)))){
        const lastTurn=number(cooldowns[rule.id]);
        if(lastTurn!==null&&Number(turn)-lastTurn<Number(rule.cooldownTurns||0))continue;
        const evaluation=this.evaluateTrigger(rule.trigger,context);
        if(evaluation.state!=='TRUE')continue;
        decisions.push({
          decisionId:'OCR-'+String(turn)+'-'+id+'-'+String(rule.id),
          simulationTurn:Number(turn),countryId:id,ruleId:rule.id,domain:rule.domain,
          priority:Number(rule.priority||0),severity:this.severityFor(rule,evaluation,context),
          sourceMinistryId:rule.ministryId,actionId:rule.actionId,
          affectedMinistries:clone(rule.downstream||[]),evidence:clone(evaluation.evidence||{}),
          signals:clone(context.signals),
          provenance:{runtime:'OMEGA_OPPONENT_COUNTRY_RULES',runtimeVersion:VERSION,dataSources:clone(context.sourcesUsed),ruleId:rule.id},
          status:'CANDIDATE'
        });
      }
      const selected=this.selectDecisions(decisions,context);
      const state=this.countryState.get(id)||{cooldowns:{},lastDecisionTurn:null};
      for(const decision of selected)state.cooldowns[decision.ruleId]=Number(turn);
      state.lastDecisionTurn=Number(turn);this.countryState.set(id,state);
      return {countryId:id,turn:Number(turn),decisions:selected,signals:context.signals};
    }
    async buildContext(countryId,turn){
      const state=getStateRoot(),countryRecord=this.getCountryRecord(countryId),signals={},sourcesUsed=[];
      for(const key of Object.keys(SIGNALS)){
        const result=await this.resolveSignal(key,countryId,turn,state,countryRecord);
        signals[key]=result;if(result.status==='AVAILABLE')sourcesUsed.push(result.source);
      }
      const derived={
        debtToGdp:this.safeRatio(signals.DEBT?.value,signals.GDP?.value),
        tradeBalanceToGdp:this.safeRatio(signals.TRADE_BALANCE?.value,signals.GDP?.value),
        oilCoverageDays:this.safeRatio(signals.RESOURCE_OIL_STOCK?.value,signals.RESOURCE_OIL_DEMAND?.value),
        criticalPressureCount:this.countCriticalPressures(signals)
      };
      return {countryId,turn,state,countryRecord,signals,derived,sourcesUsed,policyHints:this.extractPolicyHints(countryRecord)};
    }
    getCountryRecord(countryId){
      const registry=getCountryRegistry();
      try{
        const hit=registry?.resolveCountry?.(countryId);
        if(hit?.id&&normalizeId(hit.id)===normalizeId(countryId))return clone(hit.raw||hit);
      }catch(_){}
      const raw=this.gateway.get(DEFAULT_COUNTRY_DATASET);
      return raw===undefined?null:getDatasetCountryRecord(raw,countryId);
    }
    async resolveSignal(signalId,countryId,turn,state,countryRecord){
      const def=SIGNALS[signalId];if(!def)return {signalId,status:'UNAVAILABLE',value:null,reason:'SIGNAL_NOT_DEFINED'};
      for(const [kind,path] of def.sources){
        if(kind==='state'){
          const value=this.readCountryState(state,countryId,path),usable=this.usableValue(value);
          if(usable)return {signalId,status:'AVAILABLE',value:number(value)??value,source:'STATE:'+path,path};
        }else if(kind.startsWith('dataset:')){
          const datasetId=kind.slice(8);
          const raw=this.gateway.get(datasetId)??await this.tryLoad(datasetId,turn);
          const record=getDatasetCountryRecord(raw,countryId),value=deepRead(record,path),usable=this.usableValue(value);
          if(usable)return {signalId,status:'AVAILABLE',value:number(value)??value,source:'DATASET:'+datasetId+'.'+path,path};
        }
      }
      return {signalId,status:'UNAVAILABLE',value:null,reason:'NO_USABLE_SOURCE'};
    }
    async tryLoad(datasetId,turn){
      try{return await this.gateway.load(datasetId,{turn});}
      catch(error){if(this.gateway.descriptor(datasetId)?.required===true)throw error;return null;}
    }
    readCountryState(state,countryId,path){
      const parts=String(path).split('.'),domain=parts.shift(),section=state?.[domain];
      if(section==null)return undefined;
      let bucket=section?.[countryId];
      if(bucket===undefined){
        const key=Object.keys(section||{}).find(k=>normalizeId(k)===normalizeId(countryId));
        if(key!==undefined)bucket=section[key];
      }
      if(bucket===undefined&&domain==='population'&&section?.countryId===countryId)bucket=section;
      return bucket===undefined?undefined:deepRead(bucket,parts.join('.'));
    }
    usableValue(value){
      if(value===undefined||value===null)return false;
      return typeof value==='number'?Number.isFinite(value):number(value)!==null;
    }
    safeRatio(numerator,denominator){
      const a=number(numerator),b=number(denominator);
      return a===null||b===null||b===0?null:a/b;
    }
    countCriticalPressures(signals){
      return [
        compare(signals.INFLATION?.value,'GTE',8),
        compare(signals.GDP_GROWTH?.value,'LT',0),
        compare(signals.STABILITY?.value,'LT',50),
        compare(signals.MILITARY_READINESS?.value,'LT',60),
        compare(signals.FOREIGN_TENSION?.value,'GTE',70),
        compare(signals.DEFENSE_THREAT?.value,'GTE',75),
        compare(signals.HEALTH_PRESSURE?.value,'GTE',70),
        compare(signals.TRANSPORT_STRESS?.value,'GTE',75)
      ].filter(Boolean).length;
    }
    evaluateTrigger(trigger,context){
      if(trigger?.signal){
        const signal=context.signals?.[trigger.signal];
        if(signal?.status!=='AVAILABLE')return {state:'UNKNOWN',reason:'SIGNAL_UNAVAILABLE',evidence:{signal}};
        const result=compare(signal.value,trigger.operator,trigger.value);
        return {state:result===null?'UNKNOWN':result?'TRUE':'FALSE',evidence:{trigger:clone(trigger),signal:clone(signal)}};
      }
      if(trigger?.derived){
        const value=context.derived?.[trigger.derived];
        if(value===null||value===undefined)return {state:'UNKNOWN',reason:'DERIVED_SIGNAL_UNAVAILABLE',evidence:{derived:trigger.derived}};
        const result=compare(value,trigger.operator,trigger.value);
        return {state:result===null?'UNKNOWN':result?'TRUE':'FALSE',evidence:{trigger:clone(trigger),derivedValue:value}};
      }
      if(Array.isArray(trigger?.all)){
        const parts=trigger.all.map(item=>this.evaluateTrigger(item,context));
        if(parts.some(item=>item.state==='UNKNOWN'))return {state:'UNKNOWN',evidence:parts};
        return {state:parts.every(item=>item.state==='TRUE')?'TRUE':'FALSE',evidence:parts};
      }
      if(Array.isArray(trigger?.any)){
        const parts=trigger.any.map(item=>this.evaluateTrigger(item,context));
        if(parts.some(item=>item.state==='TRUE'))return {state:'TRUE',evidence:parts};
        if(parts.every(item=>item.state==='FALSE'))return {state:'FALSE',evidence:parts};
        return {state:'UNKNOWN',evidence:parts};
      }
      return {state:'UNKNOWN',reason:'EMPTY_TRIGGER'};
    }
    severityFor(rule,evaluation,context){
      const evidence=evaluation?.evidence||{},value=number(evidence.signal?.value??evidence.derivedValue),threshold=number(rule?.trigger?.value);
      let magnitude=1;
      if(value!==null&&threshold!==null)magnitude=Math.min(10,1+Math.abs(value-threshold)/(Math.abs(threshold)||1));
      const pressureCount=number(context.derived?.criticalPressureCount);
      if(rule.id==='MULTI_DOMAIN_CRISIS_RESPONSE'&&pressureCount!==null)magnitude=Math.min(10,pressureCount*2);
      return Number(magnitude.toFixed(3));
    }
    selectDecisions(decisions){
      return decisions.slice().sort((a,b)=>
        Number(b.priority)-Number(a.priority)||
        Number(b.severity)-Number(a.severity)||
        String(a.actionId).localeCompare(String(b.actionId))
      ).slice(0,2);
    }
    extractPolicyHints(countryRecord){
      if(!countryRecord||typeof countryRecord!=='object')return {};
      const hints={};
      for(const key of ['government','governmentType','ideology','politicalSystem','economicSystem','militaryDoctrine']){
        const value=deepRead(countryRecord,key);
        if(value!==undefined&&value!==null)hints[key]=clone(value);
      }
      return hints;
    }
    queueIntent(decision,turn){
      const runtime=getSimulationRuntime();
      if(!runtime?.enqueueCommand)return {status:'NOT_QUEUED',reason:'SIMULATION_RUNTIME_UNAVAILABLE',decisionId:decision.decisionId};
      const sourceMinistryId=String(decision.sourceMinistryId||'');
      if(!MINISTRY_IDS.includes(sourceMinistryId))return {status:'NOT_QUEUED',reason:'UNKNOWN_MINISTRY',decisionId:decision.decisionId};
      const interop=getInterop();
      const actionStatus=interop?.evaluateAction?.(sourceMinistryId,decision.actionId,{countryId:normalizeId(decision.countryId),currentTurn:turn});
      if(actionStatus?.status==='UNKNOWN')return {status:'NOT_QUEUED',reason:'ACTION_NOT_REGISTERED',decisionId:decision.decisionId};
      const command={
        commandId:'OCR-CMD-'+String(turn)+'-'+normalizeId(decision.countryId)+'-'+String(decision.ruleId),
        commandType:decision.actionId,actionId:decision.actionId,sourceMinistryId,
        countryId:normalizeId(decision.countryId),
        payload:{
          opponentRuleDecision:clone(decision),
          executionMode:'OPPONENT_COUNTRY_RULE_INTENT',
          simulationTurn:Number(turn),evidence:clone(decision.evidence),
          signals:clone(decision.signals),affectedMinistries:clone(decision.affectedMinistries)
        },
        options:{origin:'OMEGA_OPPONENT_COUNTRY_RULES',ruleId:decision.ruleId,causationId:'OMEGA-TURN-'+String(turn),correlationId:decision.decisionId}
      };
      try{runtime.enqueueCommand(command);return {status:'QUEUED',decisionId:decision.decisionId,commandId:command.commandId};}
      catch(error){return {status:'NOT_QUEUED',reason:String(error?.message||error),decisionId:decision.decisionId};}
    }
    recordDecisions(turn,decisions,queued){
      const row={simulationTurn:Number(turn),decisions:clone(decisions),queued:clone(queued)};
      this.decisionHistory.push(row);
      if(this.decisionHistory.length>MAX_DECISION_HISTORY)this.decisionHistory.splice(0,this.decisionHistory.length-MAX_DECISION_HISTORY);
      const state=getStateRoot();
      state.simulation=state.simulation&&typeof state.simulation==='object'?state.simulation:{};
      state.simulation.domains=state.simulation.domains&&typeof state.simulation.domains==='object'?state.simulation.domains:{};
      const domain=state.simulation.domains.opponentCountryRules=state.simulation.domains.opponentCountryRules&&typeof state.simulation.domains.opponentCountryRules==='object'?state.simulation.domains.opponentCountryRules:{};
      domain.schemaVersion=SCHEMA_VERSION;domain.runtimeVersion=VERSION;domain.lastEvaluatedTurn=Number(turn);domain.countryCount=this.countryState.size;
      domain.decisionHistory=this.decisionHistory.slice(-200);domain.datasetStatus=this.gateway.status();
    }
    emit(detail){
      const payload=clone(detail);
      for(const listener of [...this.listeners]){try{listener(payload);}catch(error){try{console.error('[OMEGA OPPONENT RULE]',error);}catch(_){}}}
      try{global.dispatchEvent?.(new CustomEvent(payload.eventType,{detail:{eventId:'OMEGA-OCR-'+String(payload.simulationTurn||0),eventType:payload.eventType,simulationTurn:payload.simulationTurn,payload}}));}catch(_){}
    }
    saveState(){
      return {
        schemaVersion:SCHEMA_VERSION,version:VERSION,initialized:this.initialized,running:this.running,
        lastTurn:this.lastTurn,lastError:this.lastError,decisionHistory:clone(this.decisionHistory),
        countryState:Object.fromEntries([...this.countryState.entries()].map(([id,row])=>[id,clone(row)])),
        datasets:this.gateway.saveState()
      };
    }
    loadState(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_OPPONENT_RULES_SAVE');
      if(Number(snapshot.schemaVersion)!==SCHEMA_VERSION)throw new Error('OPPONENT_RULES_SCHEMA_MISMATCH');
      this.initialized=Boolean(snapshot.initialized);this.running=Boolean(snapshot.running);
      this.lastTurn=number(snapshot.lastTurn);this.lastError=snapshot.lastError||null;
      this.decisionHistory=Array.isArray(snapshot.decisionHistory)?clone(snapshot.decisionHistory).slice(-MAX_DECISION_HISTORY):[];
      this.countryState=new Map(Object.entries(snapshot.countryState||{}).map(([id,row])=>[normalizeId(id),clone(row)]));
      if(snapshot.datasets)this.gateway.restoreState(snapshot.datasets);
      return this.diagnostics();
    }
    diagnostics(){
      return {
        version:VERSION,schemaVersion:SCHEMA_VERSION,initialized:this.initialized,running:this.running,
        attached:this.attached,evaluating:this.evaluating,lastTurn:this.lastTurn,lastError:this.lastError,
        rules:this.rules.length,actions:this.actions.length,countriesTracked:this.countryState.size,
        decisionsRecorded:this.decisionHistory.reduce((sum,row)=>sum+(row.decisions?.length||0),0),
        queuedCommands:this.decisionHistory.reduce((sum,row)=>sum+(row.queued||[]).filter(x=>x.status==='QUEUED').length,0),
        datasetStatus:this.gateway.status()
      };
    }
  }

  const runtime=new OpponentCountryRulesRuntime();
  const api=Object.freeze({
    VERSION,SCHEMA_VERSION,DATASETS:clone(DATASETS),SIGNALS:clone(SIGNALS),RULES:clone(RULES),ACTION_DEFINITIONS:clone(ACTION_DEFINITIONS),
    instance:runtime,
    configure:options=>runtime.configure(options),
    initialize:options=>runtime.initialize(options),
    attachToSimulation:()=>runtime.attachToSimulation(),
    onTurnCommitted:turn=>runtime.onTurnCommitted(turn),
    evaluateCountry:(countryId,turn)=>runtime.evaluateCountry(countryId,turn),
    listCountryIds:turn=>runtime.listCountryIds(turn??getCurrentTurn()),
    registerRule:rule=>runtime.registerRule(rule),
    loadDataset:(id,options)=>runtime.gateway.load(id,options||{}),
    setDataset:(id,data,turn)=>runtime.gateway.set(id,data,turn),
    getDataset:id=>runtime.gateway.get(id),
    saveState:()=>runtime.saveState(),
    loadState:state=>runtime.loadState(state),
    diagnostics:()=>runtime.diagnostics()
  });

  global.Omega=global.Omega||{};
  global.Omega.OpponentCountryRules=api;
  global.Omega.OpponentCountryRuntime=api;
  global.OmegaOpponentCountryRules=api;

  try{runtime.attachToSimulation();}catch(error){runtime.lastError=String(error?.message||error);}
  if(typeof global.addEventListener==='function'){
    global.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{void runtime.initialize({turn:getCurrentTurn()});});
  }else{
    void runtime.initialize({turn:getCurrentTurn()});
  }
})(typeof window!=='undefined'?window:globalThis);
