/**
 * OMEGA AUTONOMOUS WORLD SIMULATION / OPPONENT COUNTRY RULES RUNTIME v2.0.0
 *
 * This file is an EXECUTABLE runtime layer, not a documentation catalog.
 *
 * Design contract:
 *   DATA -> STATE -> OBSERVATION -> NEED/GAP/PRESSURE -> SCENARIO
 *   -> CANDIDATE ACTION -> FEASIBILITY -> DECISION -> COMMAND INTENT
 *   -> EXISTING EXECUTION ENGINES -> CONSEQUENCE -> NEW STATE -> LOOP
 *
 * Important:
 *   - Rules do not encode country-specific facts.
 *   - Rules do not encode numeric country thresholds.
 *   - Numeric values may exist in runtime DATA, but rule semantics are expressed
 *     through direction, status and relational conditions.
 *   - This runtime never becomes the authoritative database.
 *   - This runtime never performs direct domain state mutation.
 */
(function(global){
  'use strict';

  const VERSION='2.0.0';
  const SCHEMA_VERSION=2;
  const DEFAULT_COUNTRY_DATASET='countries';
  const MAX_DECISION_HISTORY=2000;
  const MAX_COUNTRY_QUEUE=400;
  const DATA_CACHE_TTL_TURNS=24;

  const MINISTRY_IDS=Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

  /*
   * DATA CATALOG
   * The runtime can consume these datasets when they exist. Optional datasets
   * are not fabricated when absent.
   */
  const DATASETS=Object.freeze({
    countries:Object.freeze({
      id:'countries',
      path:'countries.json',
      required:true,
      role:'canonical country identity and base country records'
    }),
    economy:Object.freeze({
      id:'economy',
      path:'economy.json',
      required:false,
      role:'economic state, production, prices, revenue, expenditure and trade'
    }),
    population:Object.freeze({
      id:'population',
      path:'population.json',
      required:false,
      role:'population and demographic observations'
    }),
    resources:Object.freeze({
      id:'resources',
      path:'resources.json',
      required:false,
      role:'resource deposits, production, stock, demand and reserves'
    }),
    cities:Object.freeze({
      id:'cities',
      path:'cities.json',
      required:false,
      role:'cities, housing and physical infrastructure observations'
    }),
    world:Object.freeze({
      id:'world',
      path:'world.json',
      required:false,
      role:'geography, routes and world topology'
    }),
    industry:Object.freeze({
      id:'industry',
      path:'industry.json',
      required:false,
      role:'facilities, inputs, outputs, capacity and utilization'
    }),
    infrastructure:Object.freeze({
      id:'infrastructure',
      path:'infrastructure.json',
      required:false,
      role:'power, transport, logistics, utilities and network capacity'
    }),
    finance:Object.freeze({
      id:'finance',
      path:'finance.json',
      required:false,
      role:'liquidity, capital, debt, revenue and spending state'
    }),
    projects:Object.freeze({
      id:'projects',
      path:'projects.json',
      required:false,
      role:'project lifecycle, commitments and construction state'
    }),
    relations:Object.freeze({
      id:'relations',
      path:'relations.json',
      required:false,
      role:'foreign relationships, dependencies and external shocks'
    })
  });

  /*
   * STATE DIRECTION REGISTRY
   *
   * This is the first foundation requested for the autonomous system:
   * it tells the runtime whether an observed directional change is normally
   * a pressure, an opportunity, or neutral context.
   *
   * "problemWhen" intentionally contains no numeric threshold.
   */
  const STATE_DIRECTION_REGISTRY=Object.freeze({
    POPULATION:{problemWhen:'CONTEXT',driverWhen:'RISING',notes:'Rising population increases future demand and labour potential; it becomes a problem only when downstream capacity gaps appear.'},
    POPULATION_GROWTH:{problemWhen:'CONTEXT',driverWhen:'RISING',notes:'Growth is a demand driver; falling growth can become a demographic pressure depending on labour and welfare state.'},
    FOOD_DEMAND:{problemWhen:'RISING',notes:'Rising demand creates pressure when effective food supply/capacity does not keep pace.'},
    FOOD_SUPPLY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Supply direction is evaluated against requirement and reserve state.'},
    HOUSING_DEMAND:{problemWhen:'RISING',notes:'Demand pressure exists when required housing exceeds effective available housing.'},
    HOUSING_SUPPLY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Housing supply is meaningful relative to housing requirement.'},
    ENERGY_DEMAND:{problemWhen:'RISING',notes:'Demand pressure exists when effective energy supply or grid capacity cannot satisfy load.'},
    ENERGY_SUPPLY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Supply direction is interpreted relative to demand and infrastructure capacity.'},
    RESOURCE_DEMAND:{problemWhen:'RISING',notes:'Rising demand becomes pressure when effective supply, imports and reserves cannot cover it.'},
    RESOURCE_STOCK:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Stock is not inherently good or bad; reserve target and demand determine pressure.'},
    RESOURCE_RESERVE:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Reserve decline can create forecasted future shortage.'},
    PRODUCTION_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Installed capacity is distinct from actual output.'},
    EFFECTIVE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Effective capacity accounts for infrastructure and operational constraints.'},
    CAPACITY_UTILIZATION:{problemWhen:'RISING',notes:'High utilization can signal expansion or bottleneck pressure; low utilization can signal weak demand or excess capacity.'},
    INPUT_AVAILABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Input shortage constrains production.'},
    OUTPUT:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Output decline can affect revenue, employment and supply.'},
    PRODUCTIVITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Lower productivity raises resource and labour intensity.'},
    LABOR_AVAILABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Shortage matters when labour required exceeds available labour.'},
    UNEMPLOYMENT:{problemWhen:'RISING',notes:'Employment pressure can feed income, welfare and political stability systems.'},
    WAGE_PRESSURE:{problemWhen:'RISING',notes:'Persistent labour cost pressure can affect production and prices.'},
    INFLATION:{problemWhen:'RISING',notes:'Inflation pressure affects purchasing power, finance and policy constraints.'},
    GDP_GROWTH:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Growth direction is a macro signal, not a fixed target.'},
    REVENUE:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Revenue pressure matters relative to committed expenditure.'},
    EXPENDITURE:{problemWhen:'RISING',notes:'Spending pressure matters relative to available revenue and finance.'},
    LIQUIDITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Liquidity shortage constrains transactions and projects.'},
    CAPITAL_AVAILABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Capital availability determines feasible investment.'},
    DEBT_SERVICE_PRESSURE:{problemWhen:'RISING',notes:'Debt service pressure competes with other fiscal needs.'},
    TRADE_DEFICIT_PRESSURE:{problemWhen:'RISING',notes:'External financing and import dependence can intensify.'},
    FOREIGN_CURRENCY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Foreign-currency availability constrains imports and external payments.'},
    TRADE_ROUTE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Physical route capacity can constrain otherwise available supply.'},
    LOGISTICS_CONGESTION:{problemWhen:'RISING',notes:'Congestion prevents supply from reaching demand.'},
    INFRASTRUCTURE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Capacity must be compared to network load.'},
    MAINTENANCE_BACKLOG:{problemWhen:'RISING',notes:'Backlog creates capacity decay and failure risk.'},
    PROJECT_DELAY:{problemWhen:'RISING',notes:'Delay changes future capacity and commitment pressure.'},
    STABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Low stability creates domestic governance pressure.'},
    CORRUPTION:{problemWhen:'RISING',notes:'Higher corruption can reduce delivery efficiency and fiscal effectiveness.'},
    SECURITY_THREAT:{problemWhen:'RISING',notes:'Threat increases security and preparedness pressure.'},
    FOREIGN_TENSION:{problemWhen:'RISING',notes:'Tension can trigger diplomatic, economic and defense responses.'},
    MILITARY_READINESS:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Readiness pressure is driven by threat, commitments and doctrine.'},
    TECHNOLOGY_CAPABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Capability gap can reduce productivity, resilience and strategic autonomy.'},
    HEALTH_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Capacity shortage becomes welfare and mortality pressure when demand exceeds service.'},
    HEALTH_PRESSURE:{problemWhen:'RISING',notes:'Pressure can propagate into labour, finance and mobility.'},
    EDUCATION_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Capacity affects future human capital and technology.'},
    TRANSPORT_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING',notes:'Capacity must be compared with movement demand.'},
    MIGRATION_PRESSURE:{problemWhen:'RISING',notes:'Migration pressure changes population, labour and welfare demand.'},
    DISASTER_DAMAGE:{problemWhen:'RISING',notes:'Damage reduces effective capacity and can displace population.'},
    FORECAST_SHORTFALL:{problemWhen:'RISING',notes:'Forecasted shortfall is a future pressure signal, not a fabricated current value.'}
  });

  const ACTION_TYPES=Object.freeze({
    IMPORT:'IMPORT',
    EXPORT:'EXPORT',
    DOMESTIC_EXPANSION:'DOMESTIC_EXPANSION',
    RESERVE_RELEASE:'RESERVE_RELEASE',
    RESERVE_BUILD:'RESERVE_BUILD',
    SUBSTITUTION:'SUBSTITUTION',
    EFFICIENCY:'EFFICIENCY',
    SUPPLIER_CHANGE:'SUPPLIER_CHANGE',
    DEMAND_MANAGEMENT:'DEMAND_MANAGEMENT',
    PROCESSING_EXPANSION:'PROCESSING_EXPANSION',
    HOUSING_BUILD:'HOUSING_BUILD',
    INDUSTRY_BUILD:'INDUSTRY_BUILD',
    PROJECT_INVESTMENT:'PROJECT_INVESTMENT',
    FINANCIAL_TRANSACTION:'FINANCIAL_TRANSACTION',
    DEBT_MANAGEMENT:'DEBT_MANAGEMENT',
    INFRASTRUCTURE_EXPANSION:'INFRASTRUCTURE_EXPANSION',
    MAINTENANCE:'MAINTENANCE',
    REPAIR:'REPAIR',
    MODERNIZATION:'MODERNIZATION',
    R_AND_D:'R_AND_D',
    EDUCATION_INVESTMENT:'EDUCATION_INVESTMENT',
    TRAINING:'TRAINING',
    MIGRATION_POLICY:'MIGRATION_POLICY',
    DIPLOMATIC_ADJUSTMENT:'DIPLOMATIC_ADJUSTMENT',
    SECURITY_PREPARATION:'SECURITY_PREPARATION',
    EMERGENCY_RESPONSE:'EMERGENCY_RESPONSE',
    POLICY_REVIEW:'POLICY_REVIEW'
  });

  /*
   * SCENARIO REGISTRY
   *
   * These are reusable scenario definitions, not country scripts.
   * A scenario may be triggered by:
   *   - a semantic state direction
   *   - a relational condition
   *   - an event
   *   - a forecast signal
   */
  const SCENARIO_REGISTRY=Object.freeze([
    {id:'RESOURCE_DEFICIT',domain:'resources',kind:'PRESSURE',trigger:{relation:'DEMAND_EXCEEDS_EFFECTIVE_SUPPLY'},requiredCapabilities:['RESOURCE_DEMAND','RESOURCE_STOCK','RESOURCE_PRODUCTION'],actions:[ACTION_TYPES.IMPORT,ACTION_TYPES.DOMESTIC_EXPANSION,ACTION_TYPES.RESERVE_RELEASE,ACTION_TYPES.SUBSTITUTION,ACTION_TYPES.EFFICIENCY,ACTION_TYPES.SUPPLIER_CHANGE,ACTION_TYPES.RESERVE_BUILD],executionType:'MIXED',reevaluation:'STATE_CHANGE_OR_COMMITMENT'},
    {id:'RESOURCE_SURPLUS',domain:'resources',kind:'OPPORTUNITY',trigger:{relation:'SUPPLY_EXCEEDS_TOTAL_REQUIREMENT'},requiredCapabilities:['RESOURCE_DEMAND','RESOURCE_STOCK','RESOURCE_PRODUCTION'],actions:[ACTION_TYPES.EXPORT,ACTION_TYPES.PROCESSING_EXPANSION,ACTION_TYPES.RESERVE_BUILD,ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.PROJECT_INVESTMENT],executionType:'MIXED',reevaluation:'STATE_CHANGE_OR_MARKET_CHANGE'},
    {id:'POPULATION_DEMAND_EXPANSION',domain:'population',kind:'DRIVER',trigger:{signal:'POPULATION_GROWTH',direction:'RISING'},requiredCapabilities:['POPULATION','FOOD_DEMAND','HOUSING_DEMAND','EDUCATION_CAPACITY','HEALTH_CAPACITY','LABOR_AVAILABILITY'],actions:[ACTION_TYPES.HOUSING_BUILD,ACTION_TYPES.DOMESTIC_EXPANSION,ACTION_TYPES.EDUCATION_INVESTMENT,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.TRAINING],executionType:'MIXED',reevaluation:'DEPENDENCY_CHANGE'},
    {id:'HOUSING_SHORTAGE',domain:'housing',kind:'PRESSURE',trigger:{relation:'HOUSING_REQUIRED_EXCEEDS_EFFECTIVE_AVAILABLE'},requiredCapabilities:['HOUSING_DEMAND','HOUSING_SUPPLY','INFRASTRUCTURE_CAPACITY','CAPITAL_AVAILABILITY','LABOR_AVAILABILITY'],actions:[ACTION_TYPES.HOUSING_BUILD,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.PROJECT_INVESTMENT],executionType:'PROJECT',reevaluation:'PROJECT_OR_DEMAND_CHANGE'},
    {id:'FOOD_SHORTAGE',domain:'food',kind:'PRESSURE',trigger:{relation:'FOOD_DEMAND_EXCEEDS_EFFECTIVE_SUPPLY'},requiredCapabilities:['FOOD_DEMAND','FOOD_SUPPLY','RESOURCE_STOCK','TRADE_ROUTE_CAPACITY'],actions:[ACTION_TYPES.DOMESTIC_EXPANSION,ACTION_TYPES.IMPORT,ACTION_TYPES.RESERVE_RELEASE,ACTION_TYPES.PROCESSING_EXPANSION,ACTION_TYPES.MAINTENANCE,ACTION_TYPES.TRANSPORT_CAPACITY],executionType:'MIXED',reevaluation:'SUPPLY_OR_DEMAND_CHANGE'},
    {id:'ENERGY_SHORTAGE',domain:'energy',kind:'PRESSURE',trigger:{relation:'ENERGY_DEMAND_EXCEEDS_EFFECTIVE_AVAILABLE'},requiredCapabilities:['ENERGY_DEMAND','ENERGY_SUPPLY','INFRASTRUCTURE_CAPACITY','RESOURCE_STOCK'],actions:[ACTION_TYPES.DOMESTIC_EXPANSION,ACTION_TYPES.IMPORT,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.EFFICIENCY,ACTION_TYPES.SUBSTITUTION],executionType:'MIXED',reevaluation:'CAPACITY_OR_DEMAND_CHANGE'},
    {id:'INDUSTRIAL_INPUT_SHORTAGE',domain:'industry',kind:'PRESSURE',trigger:{relation:'INPUT_REQUIREMENT_EXCEEDS_INPUT_AVAILABILITY'},requiredCapabilities:['INPUT_AVAILABILITY','PRODUCTION_CAPACITY','OUTPUT'],actions:[ACTION_TYPES.IMPORT,ACTION_TYPES.SUBSTITUTION,ACTION_TYPES.SUPPLIER_CHANGE,ACTION_TYPES.RESERVE_BUILD,ACTION_TYPES.DOMESTIC_EXPANSION],executionType:'MIXED',reevaluation:'INPUT_OR_PRODUCTION_CHANGE'},
    {id:'FACTORY_EXPANSION',domain:'industry',kind:'OPPORTUNITY',trigger:{relation:'PRODUCT_DEMAND_EXCEEDS_EFFECTIVE_CAPACITY'},requiredCapabilities:['OUTPUT','PRODUCTION_CAPACITY','EFFECTIVE_CAPACITY','CAPITAL_AVAILABILITY','LABOR_AVAILABILITY','INPUT_AVAILABILITY'],actions:[ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.PROJECT_INVESTMENT,ACTION_TYPES.IMPORT,ACTION_TYPES.MODERNIZATION,ACTION_TYPES.EFFICIENCY],executionType:'PROJECT_OR_TRANSACTION',reevaluation:'MARKET_OR_CAPACITY_CHANGE'},
    {id:'INVESTMENT_OPPORTUNITY',domain:'investment',kind:'OPPORTUNITY',trigger:{status:'INVESTMENT_SIGNAL_ATTRACTIVE'},requiredCapabilities:['CAPITAL_AVAILABILITY','PRODUCTIVITY','OUTPUT','INFRASTRUCTURE_CAPACITY'],actions:[ACTION_TYPES.PROJECT_INVESTMENT,ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.R_AND_D],executionType:'PROJECT',reevaluation:'CAPITAL_OR_MARKET_CHANGE'},
    {id:'CAPITAL_SURPLUS',domain:'finance',kind:'OPPORTUNITY',trigger:{relation:'CAPITAL_AVAILABLE_EXCEEDS_OPERATIONAL_REQUIREMENT'},requiredCapabilities:['CAPITAL_AVAILABILITY','LIQUIDITY'],actions:[ACTION_TYPES.PROJECT_INVESTMENT,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.R_AND_D,ACTION_TYPES.RESERVE_BUILD,ACTION_TYPES.DEBT_MANAGEMENT],executionType:'MIXED',reevaluation:'FINANCE_CHANGE'},
    {id:'FISCAL_DEFICIT',domain:'finance',kind:'PRESSURE',trigger:{relation:'EXPENDITURE_EXCEEDS_REVENUE'},requiredCapabilities:['REVENUE','EXPENDITURE','LIQUIDITY','PROJECT_DELAY'],actions:[ACTION_TYPES.DEBT_MANAGEMENT,ACTION_TYPES.FINANCIAL_TRANSACTION,ACTION_TYPES.PROJECT_INVESTMENT,ACTION_TYPES.DEMAND_MANAGEMENT],executionType:'TRANSACTION_OR_POLICY',reevaluation:'FISCAL_CHANGE'},
    {id:'TRADE_DEFICIT',domain:'trade',kind:'PRESSURE',trigger:{relation:'IMPORT_VALUE_EXCEEDS_EXPORT_VALUE'},requiredCapabilities:['FOREIGN_CURRENCY','TRADE_ROUTE_CAPACITY','OUTPUT'],actions:[ACTION_TYPES.DOMESTIC_EXPANSION,ACTION_TYPES.EXPORT,ACTION_TYPES.SUPPLIER_CHANGE,ACTION_TYPES.SUBSTITUTION,ACTION_TYPES.DEMAND_MANAGEMENT],executionType:'MIXED',reevaluation:'TRADE_CHANGE'},
    {id:'EXPORT_OPPORTUNITY',domain:'trade',kind:'OPPORTUNITY',trigger:{all:[{relation:'DOMESTIC_SURPLUS_EXISTS'},{relation:'EXTERNAL_DEMAND_EXISTS'},{relation:'ROUTE_CAPACITY_AVAILABLE'}]},requiredCapabilities:['OUTPUT','TRADE_ROUTE_CAPACITY','RESOURCE_STOCK'],actions:[ACTION_TYPES.EXPORT,ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.PROCESSING_EXPANSION,ACTION_TYPES.INFRASTRUCTURE_EXPANSION],executionType:'TRANSACTION_OR_PROJECT',reevaluation:'MARKET_OR_ROUTE_CHANGE'},
    {id:'EMPLOYMENT_PRESSURE',domain:'labor',kind:'PRESSURE',trigger:{signal:'UNEMPLOYMENT',direction:'RISING'},requiredCapabilities:['UNEMPLOYMENT','OUTPUT','LABOR_AVAILABILITY','CAPITAL_AVAILABILITY'],actions:[ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.TRAINING,ACTION_TYPES.PROJECT_INVESTMENT],executionType:'MIXED',reevaluation:'LABOR_OR_OUTPUT_CHANGE'},
    {id:'LABOR_SHORTAGE',domain:'labor',kind:'PRESSURE',trigger:{relation:'LABOR_REQUIRED_EXCEEDS_AVAILABLE'},requiredCapabilities:['LABOR_AVAILABILITY','OUTPUT','PRODUCTIVITY'],actions:[ACTION_TYPES.TRAINING,ACTION_TYPES.MIGRATION_POLICY,ACTION_TYPES.MODERNIZATION,ACTION_TYPES.R_AND_D],executionType:'MIXED',reevaluation:'LABOR_OR_PRODUCTIVITY_CHANGE'},
    {id:'INFRASTRUCTURE_BOTTLENECK',domain:'infrastructure',kind:'PRESSURE',trigger:{relation:'LOAD_EXCEEDS_INFRASTRUCTURE_CAPACITY'},requiredCapabilities:['INFRASTRUCTURE_CAPACITY','TRANSPORT_CAPACITY','ENERGY_SUPPLY'],actions:[ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.EFFICIENCY,ACTION_TYPES.DEMAND_MANAGEMENT],executionType:'PROJECT_OR_POLICY',reevaluation:'CAPACITY_OR_LOAD_CHANGE'},
    {id:'LOGISTICS_BOTTLENECK',domain:'logistics',kind:'PRESSURE',trigger:{relation:'SUPPLY_EXISTS_BUT_REACHABILITY_IS_CONSTRAINED'},requiredCapabilities:['TRADE_ROUTE_CAPACITY','LOGISTICS_CONGESTION','TRANSPORT_CAPACITY'],actions:[ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.SUPPLIER_CHANGE,ACTION_TYPES.TRANSPORT_CAPACITY,ACTION_TYPES.RESERVE_BUILD],executionType:'PROJECT_OR_TRANSACTION',reevaluation:'ROUTE_CHANGE'},
    {id:'TECHNOLOGY_GAP',domain:'technology',kind:'PRESSURE',trigger:{signal:'TECHNOLOGY_CAPABILITY',direction:'FALLING'},requiredCapabilities:['TECHNOLOGY_CAPABILITY','PRODUCTIVITY','EDUCATION_CAPACITY'],actions:[ACTION_TYPES.R_AND_D,ACTION_TYPES.MODERNIZATION,ACTION_TYPES.TRAINING,ACTION_TYPES.PROJECT_INVESTMENT],executionType:'MIXED',reevaluation:'CAPABILITY_CHANGE'},
    {id:'RESOURCE_RESERVE_DECLINE',domain:'resources',kind:'PRESSURE',trigger:{signal:'RESOURCE_RESERVE',direction:'FALLING'},requiredCapabilities:['RESOURCE_RESERVE','RESOURCE_DEMAND','FORECAST_SHORTFALL'],actions:[ACTION_TYPES.RESERVE_BUILD,ACTION_TYPES.IMPORT,ACTION_TYPES.DOMESTIC_EXPANSION,ACTION_TYPES.SUBSTITUTION,ACTION_TYPES.SUPPLIER_CHANGE],executionType:'MIXED',reevaluation:'RESERVE_OR_FORECAST_CHANGE'},
    {id:'EXTERNAL_SHOCK',domain:'external',kind:'PRESSURE',trigger:{event:'EXTERNAL_SHOCK_ACTIVE'},requiredCapabilities:['FOREIGN_TENSION','TRADE_ROUTE_CAPACITY','RESOURCE_DEMAND','FORECAST_SHORTFALL'],actions:[ACTION_TYPES.IMPORT,ACTION_TYPES.RESERVE_RELEASE,ACTION_TYPES.DIPLOMATIC_ADJUSTMENT,ACTION_TYPES.EMERGENCY_RESPONSE,ACTION_TYPES.SUPPLIER_CHANGE],executionType:'MIXED',reevaluation:'EVENT_LIFECYCLE'},
    {id:'MIGRATION_PRESSURE',domain:'population',kind:'PRESSURE',trigger:{signal:'MIGRATION_PRESSURE',direction:'RISING'},requiredCapabilities:['MIGRATION_PRESSURE','UNEMPLOYMENT','HOUSING_DEMAND','HEALTH_CAPACITY'],actions:[ACTION_TYPES.HOUSING_BUILD,ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.MIGRATION_POLICY,ACTION_TYPES.INFRASTRUCTURE_EXPANSION],executionType:'MIXED',reevaluation:'POPULATION_OR_WELFARE_CHANGE'},
    {id:'STRATEGIC_RESERVE_MANAGEMENT',domain:'resources',kind:'GOVERNANCE',trigger:{any:[{relation:'RESERVE_BELOW_TARGET'},{relation:'RESERVE_ABOVE_TARGET'}]},requiredCapabilities:['RESOURCE_RESERVE','RESOURCE_DEMAND','RESOURCE_STOCK'],actions:[ACTION_TYPES.RESERVE_BUILD,ACTION_TYPES.RESERVE_RELEASE,ACTION_TYPES.IMPORT],executionType:'TRANSACTION_OR_POLICY',reevaluation:'RESERVE_OR_TARGET_CHANGE'},
    {id:'MAINTENANCE_CAPACITY_DECAY',domain:'assets',kind:'PRESSURE',trigger:{signal:'MAINTENANCE_BACKLOG',direction:'RISING'},requiredCapabilities:['MAINTENANCE_BACKLOG','PRODUCTION_CAPACITY','EFFECTIVE_CAPACITY'],actions:[ACTION_TYPES.MAINTENANCE,ACTION_TYPES.REPAIR,ACTION_TYPES.MODERNIZATION],executionType:'PROJECT_OR_TRANSACTION',reevaluation:'ASSET_STATE_CHANGE'},
    {id:'DISASTER_RESPONSE',domain:'disaster',kind:'PRESSURE',trigger:{signal:'DISASTER_DAMAGE',direction:'RISING'},requiredCapabilities:['DISASTER_DAMAGE','INFRASTRUCTURE_CAPACITY','POPULATION'],actions:[ACTION_TYPES.EMERGENCY_RESPONSE,ACTION_TYPES.REPAIR,ACTION_TYPES.IMPORT,ACTION_TYPES.RESERVE_RELEASE,ACTION_TYPES.PROJECT_INVESTMENT],executionType:'MIXED',reevaluation:'DAMAGE_OR_RECOVERY_CHANGE'},
    {id:'GROWTH_OPPORTUNITY',domain:'development',kind:'OPPORTUNITY',trigger:{all:[{relation:'UNUSED_CAPACITY_EXISTS'},{relation:'MARKET_DEMAND_EXISTS'},{relation:'CAPITAL_FEASIBLE'}]},requiredCapabilities:['EFFECTIVE_CAPACITY','CAPITAL_AVAILABILITY','OUTPUT','PRODUCTIVITY'],actions:[ACTION_TYPES.INDUSTRY_BUILD,ACTION_TYPES.INFRASTRUCTURE_EXPANSION,ACTION_TYPES.R_AND_D,ACTION_TYPES.PROJECT_INVESTMENT],executionType:'PROJECT_OR_TRANSACTION',reevaluation:'MARKET_OR_CAPITAL_CHANGE'}
  ].map((row,index)=>Object.freeze({...row,registryIndex:index})));

  const RULES=Object.freeze(SCENARIO_REGISTRY.map((scenario,index)=>Object.freeze({
    id:'SCENARIO_RULE_'+scenario.id,
    scenarioId:scenario.id,
    domain:scenario.domain,
    kind:scenario.kind,
    priority:scenario.kind==='PRESSURE'?100-index:50-index,
    trigger:scenario.trigger,
    ministryId:scenario.domain==='resources'?'resource':
      scenario.domain==='finance'?'finance':
      scenario.domain==='trade'?'trade':
      scenario.domain==='technology'?'technology':
      scenario.domain==='infrastructure'||scenario.domain==='logistics'?'transport':
      scenario.domain==='labor'||scenario.domain==='population'?'economy':
      scenario.domain==='defense'?'defense':
      scenario.domain==='external'?'foreign':'cabinet',
    actionTypes:scenario.actions,
    requiredCapabilities:scenario.requiredCapabilities,
    executionType:scenario.executionType,
    reevaluation:scenario.reevaluation
  })));

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    if(value instanceof Map){const out={};seen.set(value,out);for(const [k,v] of value.entries())out[String(k)]=clone(v,seen);return out;}
    if(value instanceof Set){const out=[];seen.set(value,out);for(const v of value.values())out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const key of Object.keys(value)){if(key==='__proto__'||key==='constructor')continue;const v=value[key];if(v!==undefined&&typeof v!=='function')out[key]=clone(v,seen);}
    return out;
  }

  function number(value){
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }

  function normalizeId(value){return String(value??'').trim().toUpperCase();}

  function deepRead(root,path){
    if(root==null)return undefined;
    let cur=root;
    for(const part of String(path||'').split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
      cur=cur[part];
    }
    return cur;
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

  function countryMatch(row,countryId){
    const wanted=normalizeId(countryId);
    if(!row||typeof row!=='object')return false;
    return ['id','code','iso2','iso3','countryId','countryCode','key','name','country','countryName'].some(key=>{
      const value=deepRead(row,key);
      return value!=null&&normalizeId(value)===wanted;
    });
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
      for(const [entryKey,row] of Object.entries(data)){
        if(countryMatch(row,countryId)||normalizeId(entryKey)===wanted)return clone(row);
      }
    }
    return null;
  }

  function getStateRoot(){
    return global.Game?.state||global.gameState||global.Omega?.AuthoritativeWorldState?.state||{};
  }

  function getSimulationRuntime(){
    return global.Omega?.Simulation||global.Omega?.SimulationRuntime||null;
  }

  function getInterop(){
    return global.Omega?.MinistryInteroperability||global.OmegaMinistryInteroperability||null;
  }

  function getCountryRegistry(){
    return global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||null;
  }

  function getCurrentTurn(){
    const state=getStateRoot(),runtime=getSimulationRuntime();
    for(const value of [state.simulation?.turn,state.simulationTurn,state.turn,runtime?.clock?.turn]){
      const n=number(value);if(n!==null)return n;
    }
    return 0;
  }

  function getPlayerCountryId(){
    const runtime=getSimulationRuntime(),state=getStateRoot();
    for(const value of [
      runtime?.getPlayerCountryId?.(),
      state.simulation?.session?.playerCountryId,
      state.playerCountryId,
      global.OmegaCabinetUI?.activeCountry,
      global.CountryIOS?.activeCountry,
      global.Game?.currentActiveCountry,
      state.countryCode,
      state.countryId
    ]){
      const id=normalizeId(value);if(id)return id;
    }
    return null;
  }

  function directionFromObservation(observation){
    if(observation==null)return null;
    if(typeof observation==='string'){
      const v=observation.trim().toUpperCase();
      if(['RISING','INCREASING','UP','GROWING'].includes(v))return 'RISING';
      if(['FALLING','DECREASING','DOWN','DECLINING'].includes(v))return 'FALLING';
      if(['HIGH','LOW','CRITICAL','STABLE','NORMAL','SURPLUS','DEFICIT'].includes(v))return v;
      return null;
    }
    if(typeof observation==='object'){
      for(const key of ['problemDirection','direction','trend','status','condition','state']){
        const hit=directionFromObservation(observation[key]);
        if(hit)return hit;
      }
    }
    return null;
  }

  function unwrapObservedValue(observation){
    if(observation==null)return {value:null,raw:null,direction:null};
    if(typeof observation==='object' && Object.prototype.hasOwnProperty.call(observation,'value')){
      return {value:observation.value,raw:clone(observation),direction:directionFromObservation(observation)};
    }
    return {value:observation,raw:clone(observation),direction:directionFromObservation(observation)};
  }

  /*
   * QUALITATIVE PROBLEM EVALUATION
   *
   * No threshold is invented here.
   * Direct directional triggers require the incoming source to carry a semantic
   * status/trend/direction. Relational triggers compare two data facts.
   */
  function evaluateDirection(signalId,observation,expectedDirection){
    const definition=STATE_DIRECTION_REGISTRY[signalId];
    if(!definition)return {state:'UNKNOWN',reason:'SIGNAL_DIRECTION_NOT_REGISTERED',signalId};
    const actual=directionFromObservation(observation);
    if(!actual)return {state:'UNKNOWN',reason:'SEMANTIC_DIRECTION_NOT_OBSERVED',signalId,problemWhen:definition.problemWhen};
    const expected=String(expectedDirection||definition.problemWhen||'').toUpperCase();
    if(expected==='CONTEXT')return {state:'FALSE',reason:'CONTEXT_SIGNAL_ONLY',actual,signalId};
    if(expected==='LOW_IS_PRESSURE')return {state:actual==='LOW'?'TRUE':'FALSE',actual,signalId};
    if(expected==='HIGH_IS_PRESSURE')return {state:['HIGH','CRITICAL'].includes(actual)?'TRUE':'FALSE',actual,signalId};
    if(expected==='RISING')return {state:actual==='RISING'?'TRUE':'FALSE',actual,signalId};
    if(expected==='FALLING')return {state:actual==='FALLING'?'TRUE':'FALSE',actual,signalId};
    if(expected==='LOW')return {state:actual==='LOW'?'TRUE':'FALSE',actual,signalId};
    if(expected==='HIGH')return {state:['HIGH','CRITICAL'].includes(actual)?'TRUE':'FALSE',actual,signalId};
    return {state:'UNKNOWN',reason:'UNSUPPORTED_DIRECTION',signalId,expected,actual};
  }

  function readCountryPath(state,countryId,path){
    const parts=String(path||'').split('.');
    const domain=parts.shift();
    if(!domain)return undefined;
    const section=state?.[domain];
    if(section==null)return undefined;
    let bucket=section?.[countryId];
    if(bucket===undefined){
      const key=Object.keys(section||{}).find(k=>normalizeId(k)===normalizeId(countryId));
      if(key!==undefined)bucket=section[key];
    }
    if(bucket===undefined&&section?.countryId&&normalizeId(section.countryId)===normalizeId(countryId))bucket=section;
    return bucket===undefined?undefined:deepRead(bucket,parts.join('.'));
  }

  function resolveSignalPath(signalId){
    const map={
      POPULATION:['population.population','population.population_2015'],
      POPULATION_GROWTH:['population.annual_growth_rate','population.growth_rate'],
      FOOD_DEMAND:['resource.demand.food','economy.foodDemand'],
      FOOD_SUPPLY:['resource.supply.food','resource.production.food','economy.foodSupply'],
      HOUSING_DEMAND:['cities.housing.required','population.housing.required'],
      HOUSING_SUPPLY:['cities.housing.available','infrastructure.housing.available'],
      ENERGY_DEMAND:['resource.demand.energy','economy.energyDemand'],
      ENERGY_SUPPLY:['resource.supply.energy','resource.production.energy','infrastructure.energy.available'],
      RESOURCE_DEMAND:['resource.demand','resource.totalDemand'],
      RESOURCE_STOCK:['resource.inventory','resource.stock'],
      RESOURCE_RESERVE:['resource.reserve','resource.reserves'],
      PRODUCTION_CAPACITY:['industry.capacity','economy.productionCapacity'],
      EFFECTIVE_CAPACITY:['industry.effectiveCapacity','economy.effectiveCapacity'],
      CAPACITY_UTILIZATION:['industry.utilization','economy.capacityUtilization'],
      INPUT_AVAILABILITY:['industry.inputs.available','resource.inputAvailability'],
      OUTPUT:['industry.output','economy.production'],
      PRODUCTIVITY:['industry.productivity','economy.productivity'],
      LABOR_AVAILABILITY:['population.labor.available','economy.labor.available'],
      UNEMPLOYMENT:['economy.unemployment','population.unemployment'],
      WAGE_PRESSURE:['economy.wagePressure'],
      INFLATION:['economy.inflation'],
      GDP_GROWTH:['economy.gdp_growth','economy.growth'],
      REVENUE:['finance.revenue','economy.revenue'],
      EXPENDITURE:['finance.expenditure','economy.expenditure'],
      LIQUIDITY:['finance.liquidity','finance.cash'],
      CAPITAL_AVAILABILITY:['finance.capitalAvailable','finance.investableCapital'],
      DEBT_SERVICE_PRESSURE:['finance.debtServicePressure'],
      TRADE_DEFICIT_PRESSURE:['trade.deficitPressure','economy.tradeDeficitPressure'],
      FOREIGN_CURRENCY:['finance.foreignCurrency','economy.reserves'],
      TRADE_ROUTE_CAPACITY:['transport.routeCapacity','trade.routeCapacity'],
      LOGISTICS_CONGESTION:['transport.logisticsCongestion','trade.logisticsCongestion'],
      INFRASTRUCTURE_CAPACITY:['infrastructure.capacity','transport.infrastructure.capacity'],
      MAINTENANCE_BACKLOG:['projects.maintenanceBacklog','industry.maintenanceBacklog','infrastructure.maintenanceBacklog'],
      PROJECT_DELAY:['projects.delay','projects.scheduleVariance'],
      STABILITY:['interior.stability','interior.state.stability'],
      CORRUPTION:['interior.corruption'],
      SECURITY_THREAT:['defense.threatLevel','intelligence.threatLevel','relations.securityThreat'],
      FOREIGN_TENSION:['relations.foreignTension','relations.tension','foreign.tension'],
      MILITARY_READINESS:['military.readiness','defense.readiness'],
      TECHNOLOGY_CAPABILITY:['technology.capability','technology.readiness','technology.score'],
      HEALTH_CAPACITY:['health.capacity','health.state.capacity'],
      HEALTH_PRESSURE:['health.pressure','health.crisisLevel'],
      EDUCATION_CAPACITY:['education.capacity','education.quality'],
      TRANSPORT_CAPACITY:['transport.capacity','infrastructure.transport.capacity'],
      MIGRATION_PRESSURE:['population.migrationPressure','population.migration_pressure'],
      DISASTER_DAMAGE:['infrastructure.disasterDamage','projects.disasterDamage','population.displacementPressure'],
      FORECAST_SHORTFALL:['forecasts.shortfall','forecast.shortfall','projects.forecastShortfall']
    };
    return map[signalId]||[];
  }

  function hasSemanticCapability(signalId,observation){
    const unwrapped=unwrapObservedValue(observation);
    if(unwrapped.raw&&typeof unwrapped.raw==='object'){
      if(directionFromObservation(unwrapped.raw))return true;
      const raw=unwrapped.raw;
      if(['required','available','demand','supply','capacity','load','target','expected'].some(k=>raw[k]!==undefined))return true;
    }
    return unwrapped.value!==null&&unwrapped.value!==undefined;
  }

  function getObservationForSignal(context,signalId){
    const candidates=resolveSignalPath(signalId);
    for(const path of candidates){
      const value=readCountryPath(context.state,context.countryId,path);
      if(hasSemanticCapability(signalId,value))return {signalId,path,...unwrapObservedValue(value),status:'AVAILABLE',source:'STATE:'+path};
    }
    const raw=context.countryRecord;
    const fallbackPaths={
      POPULATION:['population'],
      POPULATION_GROWTH:['populationGrowth','growth'],
      INFLATION:['inflation'],
      GDP_GROWTH:['gdp_growth','gdpGrowth'],
      STABILITY:['stability'],
      TECHNOLOGY_CAPABILITY:['technologyCapability'],
      MILITARY_READINESS:['militaryReadiness']
    };
    for(const path of fallbackPaths[signalId]||[]){
      const value=deepRead(raw,path);
      if(hasSemanticCapability(signalId,value))return {signalId,path,...unwrapObservedValue(value),status:'AVAILABLE',source:'COUNTRY_RECORD:'+path};
    }
    return {signalId,value:null,raw:null,direction:null,status:'UNAVAILABLE',reason:'NO_OBSERVED_SOURCE'};
  }

  function relationOperands(context,relation){
    const state=context.state,countryId=context.countryId;
    const paths={
      DEMAND_EXCEEDS_EFFECTIVE_SUPPLY:[
        [['resource.demand.total','economy.demand.total'],['resource.supply.effective','resource.production.effective','economy.supply.effective']],
        [['resource.demand','economy.totalDemand'],['resource.supply','resource.production']]
      ],
      SUPPLY_EXCEEDS_TOTAL_REQUIREMENT:[
        [['resource.supply','resource.production'],['resource.demand.total','economy.demand.total','resource.reserve.target']]
      ],
      HOUSING_REQUIRED_EXCEEDS_EFFECTIVE_AVAILABLE:[
        [['cities.housing.required','population.housing.required'],['cities.housing.available','infrastructure.housing.available']]
      ],
      FOOD_DEMAND_EXCEEDS_EFFECTIVE_SUPPLY:[
        [['resource.demand.food','economy.foodDemand'],['resource.supply.food','resource.production.food','economy.foodSupply']]
      ],
      ENERGY_DEMAND_EXCEEDS_EFFECTIVE_AVAILABLE:[
        [['resource.demand.energy','economy.energyDemand'],['resource.supply.energy','resource.production.energy','infrastructure.energy.available']]
      ],
      INPUT_REQUIREMENT_EXCEEDS_INPUT_AVAILABILITY:[
        [['industry.inputs.required','industry.inputRequirement'],['industry.inputs.available','resource.inputAvailability']]
      ],
      PRODUCT_DEMAND_EXCEEDS_EFFECTIVE_CAPACITY:[
        [['industry.demand','economy.productDemand'],['industry.effectiveCapacity','industry.capacity']]
      ],
      CAPITAL_AVAILABLE_EXCEEDS_OPERATIONAL_REQUIREMENT:[
        [['finance.capitalAvailable','finance.liquidity'],['finance.operationalRequirement','finance.requiredOperatingCapital']]
      ],
      EXPENDITURE_EXCEEDS_REVENUE:[
        [['finance.expenditure','economy.expenditure'],['finance.revenue','economy.revenue']]
      ],
      IMPORT_VALUE_EXCEEDS_EXPORT_VALUE:[
        [['trade.imports','economy.imports'],['trade.exports','economy.exports']]
      ],
      DOMESTIC_SURPLUS_EXISTS:[
        [['economy.outputSurplus','resource.surplus'],['economy.internalRequirement','resource.domesticRequirement']]
      ],
      EXTERNAL_DEMAND_EXISTS:[
        [['trade.externalDemand','economy.externalDemand'],['trade.exportDemand','trade.marketDemand']]
      ],
      ROUTE_CAPACITY_AVAILABLE:[
        [['trade.routeCapacity','transport.routeCapacity'],['trade.routeLoad','transport.routeLoad']]
      ],
      LABOR_REQUIRED_EXCEEDS_AVAILABLE:[
        [['industry.labor.required','economy.laborRequired'],['population.labor.available','economy.laborAvailable']]
      ],
      LOAD_EXCEEDS_INFRASTRUCTURE_CAPACITY:[
        [['infrastructure.load','transport.load','resource.gridLoad'],['infrastructure.capacity','transport.capacity','resource.gridCapacity']]
      ],
      RESERVE_BELOW_TARGET:[
        [['resource.reserve','resource.reserves'],['resource.reserveTarget','resource.targetReserve']]
      ],
      RESERVE_ABOVE_TARGET:[
        [['resource.reserve','resource.reserves'],['resource.reserveTarget','resource.targetReserve']]
      ],
      UNUSED_CAPACITY_EXISTS:[
        [['industry.effectiveCapacity','economy.effectiveCapacity'],['industry.currentOutput','economy.output']]
      ],
      MARKET_DEMAND_EXISTS:[
        [['economy.demand','trade.marketDemand','industry.demand'],['economy.output','industry.output']]
      ],
      CAPITAL_FEASIBLE:[
        [['finance.capitalAvailable','finance.liquidity'],['projects.requiredCapital','finance.requiredInvestmentCapital']]
      ]
    };

    const pairSet=paths[relation]||[];
    for(const pair of pairSet){
      const leftPaths=pair[0],rightPaths=pair[1];
      let left,right,leftPath,rightPath;
      for(const p of leftPaths){
        const value=readCountryPath(state,countryId,p);
        if(value!==undefined&&value!==null){left=unwrapObservedValue(value).value;leftPath=p;break;}
      }
      for(const p of rightPaths){
        const value=readCountryPath(state,countryId,p);
        if(value!==undefined&&value!==null){right=unwrapObservedValue(value).value;rightPath=p;break;}
      }
      const a=number(left),b=number(right);
      if(a!==null&&b!==null)return {left:a,right:b,leftPath,rightPath};
      if(typeof left==='object'&&typeof right==='object'){
        const leftAvailable=number(left.available),leftRequired=number(left.required);
        const rightAvailable=number(right.available),rightRequired=number(right.required);
        if(leftAvailable!==null&&rightAvailable!==null)return {left:leftAvailable,right:rightAvailable,leftPath,rightPath};
        if(leftRequired!==null&&rightRequired!==null)return {left:leftRequired,right:rightRequired,leftPath,rightPath};
      }
    }
    return null;
  }

  function evaluateRelation(context,relation){
    const operands=relationOperands(context,relation);
    if(!operands)return {state:'UNKNOWN',reason:'RELATION_DATA_UNAVAILABLE',relation};
    if(relation==='RESERVE_ABOVE_TARGET'||relation==='CAPITAL_AVAILABLE_EXCEEDS_OPERATIONAL_REQUIREMENT'||relation==='SUPPLY_EXCEEDS_TOTAL_REQUIREMENT'||relation==='ROUTE_CAPACITY_AVAILABLE'||relation==='DOMESTIC_SURPLUS_EXISTS'||relation==='EXTERNAL_DEMAND_EXISTS'||relation==='UNUSED_CAPACITY_EXISTS'||relation==='MARKET_DEMAND_EXISTS'||relation==='CAPITAL_FEASIBLE'){
      if(relation==='ROUTE_CAPACITY_AVAILABLE')return {state:operands.left>=operands.right?'TRUE':'FALSE',operands};
      return {state:operands.left>operands.right?'TRUE':'FALSE',operands};
    }
    if(relation==='RESERVE_BELOW_TARGET'||relation==='LOAD_EXCEEDS_INFRASTRUCTURE_CAPACITY'||relation==='LABOR_REQUIRED_EXCEEDS_AVAILABLE'||relation==='IMPORT_VALUE_EXCEEDS_EXPORT_VALUE'||relation==='EXPENDITURE_EXCEEDS_REVENUE'||relation==='PRODUCT_DEMAND_EXCEEDS_EFFECTIVE_CAPACITY'||relation==='CAPITAL_AVAILABLE_EXCEEDS_OPERATIONAL_REQUIREMENT'||relation==='INPUT_REQUIREMENT_EXCEEDS_INPUT_AVAILABILITY'||relation==='ENERGY_DEMAND_EXCEEDS_EFFECTIVE_AVAILABLE'||relation==='FOOD_DEMAND_EXCEEDS_EFFECTIVE_SUPPLY'||relation==='HOUSING_REQUIRED_EXCEEDS_EFFECTIVE_AVAILABLE'||relation==='DEMAND_EXCEEDS_EFFECTIVE_SUPPLY'){
      return {state:operands.left>operands.right?'TRUE':'FALSE',operands};
    }
    return {state:operands.left>operands.right?'TRUE':'FALSE',operands};
  }

  function evaluateTrigger(trigger,context){
    if(!trigger)return {state:'UNKNOWN',reason:'TRIGGER_MISSING'};
    if(trigger.signal){
      const observation=getObservationForSignal(context,trigger.signal);
      if(observation.status!=='AVAILABLE')return {state:'UNKNOWN',reason:'SIGNAL_UNAVAILABLE',evidence:observation};
      return {...evaluateDirection(trigger.signal,observation.raw,trigger.direction),evidence:observation};
    }
    if(trigger.relation)return {...evaluateRelation(context,trigger.relation),evidence:{relation:trigger.relation}};
    if(trigger.status){
      const value=deepRead(context.state,trigger.status);
      if(value===undefined||value===null)return {state:'UNKNOWN',reason:'STATUS_UNAVAILABLE',evidence:{path:trigger.status}};
      const status=directionFromObservation(value);
      return {state:status===String(trigger.value||'').toUpperCase()?'TRUE':'FALSE',evidence:{status}};
    }
    if(trigger.event){
      const events=context.state?.events||context.state?.simulation?.events;
      const active=Array.isArray(events)&&events.some(e=>String(e?.eventType||e?.type||'').toUpperCase()===String(trigger.event).toUpperCase()&&!e?.resolved);
      return {state:active?'TRUE':'FALSE',evidence:{event:trigger.event}};
    }
    if(Array.isArray(trigger.all)){
      const parts=trigger.all.map(item=>evaluateTrigger(item,context));
      if(parts.some(item=>item.state==='UNKNOWN'))return {state:'UNKNOWN',evidence:parts};
      return {state:parts.every(item=>item.state==='TRUE')?'TRUE':'FALSE',evidence:parts};
    }
    if(Array.isArray(trigger.any)){
      const parts=trigger.any.map(item=>evaluateTrigger(item,context));
      if(parts.some(item=>item.state==='TRUE'))return {state:'TRUE',evidence:parts};
      if(parts.every(item=>item.state==='FALSE'))return {state:'FALSE',evidence:parts};
      return {state:'UNKNOWN',evidence:parts};
    }
    return {state:'UNKNOWN',reason:'UNSUPPORTED_TRIGGER'};
  }

  function buildSignalSnapshot(context){
    const result={},sources=[];
    for(const signalId of Object.keys(STATE_DIRECTION_REGISTRY)){
      const observation=getObservationForSignal(context,signalId);
      result[signalId]=observation;
      if(observation.status==='AVAILABLE')sources.push(observation.source);
    }
    return {signals:result,sources};
  }

  function getCountryRecordFromContext(context,countryId){
    const registry=getCountryRegistry();
    try{
      const hit=registry?.resolveCountry?.(countryId);
      if(hit?.id&&normalizeId(hit.id)===normalizeId(countryId))return clone(hit.raw||hit);
    }catch(_){}
    if(context.countryRecord)return clone(context.countryRecord);
    return null;
  }

  class DatasetGateway{
    constructor(options={}){
      this.version=VERSION;
      this.manifest={...DATASETS,...clone(options.manifest||{})};
      this.cache=new Map();
      this.pending=new Map();
      this.loadedTurn=new Map();
      this.failedTurn=new Map();
      this.basePath=String(options.basePath||'').trim();
      this.fetchImpl=options.fetchImpl||global.fetch?.bind(global)||null;
    }
    descriptor(id){return clone(this.manifest[String(id)]);}
    set(id,data,turn=getCurrentTurn()){
      const key=String(id);
      this.cache.set(key,clone(data));
      this.loadedTurn.set(key,number(turn)??0);
      this.failedTurn.delete(key);
      return true;
    }
    get(id){
      const value=this.cache.get(String(id));
      return value===undefined?undefined:clone(value);
    }
    async load(id,options={}){
      const key=String(id||'');
      if(!key)throw new Error('OPPONENT_DATASET_ID_REQUIRED');
      const cached=this.cache.get(key),loadedAt=this.loadedTurn.get(key),now=number(options.turn)??getCurrentTurn();
      if(cached!==undefined&&loadedAt!==undefined&&now-loadedAt<=DATA_CACHE_TTL_TURNS)return clone(cached);
      if(this.pending.has(key))return clone(await this.pending.get(key));
      const failedAt=this.failedTurn.get(key);
      if(failedAt!==undefined&&now-failedAt<=DATA_CACHE_TTL_TURNS)throw new Error('OPPONENT_DATASET_CACHED_UNAVAILABLE:'+key);
      const descriptor=this.manifest[key];
      if(!descriptor)throw new Error('OPPONENT_DATASET_NOT_REGISTERED:'+key);
      if(!this.fetchImpl)throw new Error('OPPONENT_DATASET_FETCH_UNAVAILABLE:'+key);
      const url=this.basePath?this.basePath.replace(/\/$/,'')+'/'+descriptor.path:descriptor.path;
      const task=(async()=>{
        try{
          const response=await this.fetchImpl(url,{cache:'no-store'});
          if(!response?.ok)throw new Error('OPPONENT_DATASET_FETCH_FAILED:'+key);
          const json=await response.json();
          this.set(key,json,now);
          return clone(json);
        }catch(error){
          if(descriptor.required!==true)this.failedTurn.set(key,now);
          throw error;
        }
      })();
      this.pending.set(key,task);
      try{return clone(await task);}finally{this.pending.delete(key);}
    }
    status(){
      const result={};
      for(const [id,descriptor] of Object.entries(this.manifest)){
        result[id]={
          path:descriptor.path,
          required:descriptor.required===true,
          loaded:this.cache.has(id),
          loadedTurn:this.loadedTurn.get(id)??null,
          unavailableTurn:this.failedTurn.get(id)??null,
          role:descriptor.role
        };
      }
      return result;
    }
    saveState(){
      const datasets={};
      for(const [id,data] of this.cache.entries())datasets[id]=clone(data);
      return {
        schemaVersion:1,
        datasets,
        loadedTurn:Object.fromEntries(this.loadedTurn.entries()),
        failedTurn:Object.fromEntries(this.failedTurn.entries())
      };
    }
    restoreState(snapshot){
      this.cache=new Map(Object.entries(snapshot?.datasets||{}).map(([k,v])=>[k,clone(v)]));
      this.loadedTurn=new Map(Object.entries(snapshot?.loadedTurn||{}).map(([k,v])=>[k,number(v)??0]));
      this.failedTurn=new Map(Object.entries(snapshot?.failedTurn||{}).map(([k,v])=>[k,number(v)??0]));
      this.pending.clear();
      return true;
    }
  }

  class OpponentCountryRulesRuntime{
    constructor(options={}){
      this.version=VERSION;
      this.schemaVersion=SCHEMA_VERSION;
      this.rules=RULES.map(clone);
      this.scenarios=SCENARIO_REGISTRY.map(clone);
      this.stateDirections=clone(STATE_DIRECTION_REGISTRY);
      this.actionTypes=clone(ACTION_TYPES);
      this.gateway=options.gateway||new DatasetGateway(options);
      this.decisionHistory=[];
      this.countryState=new Map();
      this.initialized=false;
      this.running=true;
      this.evaluating=false;
      this.lastTurn=null;
      this.lastError=null;
      this.listeners=new Set();
      this.attached=false;
      this.initializationPromise=null;
      this.registeredActions=new Set();
    }

    configure(options={}){
      if(options.gateway)this.gateway=options.gateway;
      if(options.manifest)this.gateway.manifest={...this.gateway.manifest,...clone(options.manifest)};
      if(options.running!==undefined)this.running=Boolean(options.running);
      if(typeof options.onDecision==='function')this.listeners.add(options.onDecision);
      return this.diagnostics();
    }

    registerScenario(scenario){
      if(!scenario?.id)throw new Error('OPPONENT_SCENARIO_ID_REQUIRED');
      const copy=clone(scenario);
      this.scenarios.push(copy);
      return copy;
    }

    registerRule(rule){
      if(!rule?.id)throw new Error('OPPONENT_RULE_ID_REQUIRED');
      const copy=clone(rule);
      this.rules.push(copy);
      return copy;
    }

    ensureRuntimeBindings(){
      const interop=getInterop();
      if(!interop?.registerAction||!interop?.registerCommandHandler)return {status:'UNAVAILABLE',reason:'INTEROPERABILITY_BINDING_API_UNAVAILABLE'};
      const results=[];
      for(const rule of this.rules){
        const actionTypes=Array.isArray(rule.actionTypes)?rule.actionTypes:[];
        const actionId='OCR_SCENARIO_'+String(rule.scenarioId||rule.id).toUpperCase();
        const owner=String(rule.ministryId||'cabinet');
        if(!MINISTRY_IDS.includes(owner))continue;
        if(this.registeredActions.has(actionId))continue;
        try{
          const existing=interop.instance?.decisionFramework?.getAction?.(actionId) ||
            global.OmegaMinistryDecisionFramework?.instance?.getAction?.(actionId) || null;
          if(!existing){
            interop.registerAction(actionId,{
              actionId,
              stateOwnerMinistry:owner,
              authority:'OMEGA_OPPONENT_COUNTRY_RULES',
              scenarioId:rule.scenarioId,
              scenarioKind:rule.kind,
              candidateActionTypes:clone(actionTypes),
              requiredCapabilities:clone(rule.requiredCapabilities||[]),
              executionType:rule.executionType||'MIXED',
              reevaluation:rule.reevaluation||'STATE_CHANGE',
              requirements:[],
              optionalRequirements:[],
              blockingConditions:[],
              warningConditions:[],
              affectedMinistries:[owner],
              expectedOutputs:['OPPONENT_DECISION_INTENT']
            });
          }
          interop.registerCommandHandler(actionId,owner,(command,{stateTransaction,emitEvent,simulationTurn})=>{
            const payload=command?.payload||{};
            const decision=payload.opponentRuleDecision||{};
            const queuePath=owner+'.opponentIntentQueue';
            const current=stateTransaction.get(queuePath);
            const queue=Array.isArray(current)?current.slice(-31):[];
            const intent={
              commandId:command.commandId,
              decisionId:decision.decisionId||null,
              scenarioId:decision.scenarioId||rule.scenarioId||null,
              actionId,
              candidateActionTypes:clone(decision.candidateActionTypes||actionTypes),
              countryId:command.countryId,
              simulationTurn,
              priority:Number(decision.priority||0),
              pressureType:decision.pressureType||rule.kind,
              evidence:clone(decision.evidence||null),
              sourceSignals:clone(decision.signals||null),
              executionType:rule.executionType||'MIXED',
              status:'INTENT_APPLIED'
            };
            queue.push(intent);
            stateTransaction.set(queuePath,queue);
            stateTransaction.set(owner+'.opponentLastIntent',intent);
            emitEvent?.('OMEGA_OPPONENT_RULE_INTENT_APPLIED',{scenarioId:intent.scenarioId,actionId,decisionId:intent.decisionId});
            return {
              accepted:true,
              eventType:'OMEGA_OPPONENT_RULE_INTENT_APPLIED',
              eventPayload:{scenarioId:intent.scenarioId,actionId,decisionId:intent.decisionId},
              provenance:{runtime:'OMEGA_OPPONENT_COUNTRY_RULES',runtimeVersion:VERSION}
            };
          });
          this.registeredActions.add(actionId);
          results.push({actionId,status:'BOUND',ownerMinistry:owner,scenarioId:rule.scenarioId});
        }catch(error){
          results.push({actionId,status:'FAILED',ownerMinistry:owner,scenarioId:rule.scenarioId,error:String(error?.message||error)});
        }
      }
      return {status:'READY',results};
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

    async onTurnCommitted(turn=getCurrentTurn()){
      if(!this.running||this.evaluating)return {status:'SKIPPED',reason:'NOT_RUNNING_OR_BUSY',turn};
      this.evaluating=true;
      this.lastError=null;
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
        this.lastTurn=currentTurn;
        this.initialized=true;
        this.emit({
          eventType:'OMEGA_OPPONENT_COUNTRY_DECISIONS_READY',
          simulationTurn:currentTurn,
          opponentCountries:opponents.length,
          decisions:decisions.length,
          queued:queued.filter(x=>x.status==='QUEUED').length
        });
        return {status:'COMPLETE',turn:currentTurn,opponents:opponents.length,decisions:decisions.length,queued};
      }catch(error){
        this.lastError=String(error?.message||error);
        this.emit({
          eventType:'OMEGA_OPPONENT_COUNTRY_RUNTIME_ERROR',
          simulationTurn:number(turn)??getCurrentTurn(),
          error:this.lastError
        });
        return {status:'ERROR',turn:number(turn)??getCurrentTurn(),error:this.lastError};
      }finally{
        this.evaluating=false;
      }
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
        for(const row of data){
          const id=normalizeId(row?.id||row?.code||row?.iso3||row?.countryCode);
          if(id)rows.push(id);
        }
      }else if(data&&typeof data==='object'){
        for(const [key,row] of Object.entries(data)){
          const id=normalizeId(row?.id||row?.code||row?.iso3||key);
          if(id)rows.push(id);
        }
      }
      return [...new Set(rows)].sort();
    }

    async evaluateCountry(countryId,turn=getCurrentTurn()){
      const id=normalizeId(countryId);
      if(!id)return {countryId:null,turn,decisions:[],signals:{}};
      const context=await this.buildContext(id,turn);
      const state=this.countryState.get(id)||{cooldowns:{},lastDecisionTurn:null};
      const decisions=[];
      const ordered=this.rules.slice().sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.id).localeCompare(String(b.id)));
      for(const rule of ordered){
        const lastTurn=number(state.cooldowns[rule.scenarioId||rule.id]);
        if(lastTurn!==null&&Number(turn)-lastTurn<Number(rule.cooldownTurns||0))continue;
        const evaluation=evaluateTrigger(rule.trigger,context);
        if(evaluation.state!=='TRUE')continue;
        decisions.push({
          decisionId:'OCR-'+String(turn)+'-'+id+'-'+String(rule.scenarioId||rule.id),
          simulationTurn:Number(turn),
          countryId:id,
          scenarioId:rule.scenarioId||rule.id,
          ruleId:rule.id,
          domain:rule.domain,
          kind:rule.kind,
          priority:Number(rule.priority||0),
          pressureType:rule.kind,
          sourceMinistryId:rule.ministryId,
          candidateActionTypes:clone(rule.actionTypes||[]),
          executionType:rule.executionType||'MIXED',
          reevaluation:rule.reevaluation||'STATE_CHANGE',
          requiredCapabilities:clone(rule.requiredCapabilities||[]),
          evidence:clone(evaluation.evidence||{}),
          signals:clone(context.signals),
          provenance:{
            runtime:'OMEGA_OPPONENT_COUNTRY_RULES',
            runtimeVersion:VERSION,
            scenarioId:rule.scenarioId||rule.id,
            sourcePaths:clone(context.sourcesUsed)
          },
          status:'CANDIDATE'
        });
      }
      const selected=this.selectDecisions(decisions);
      for(const decision of selected)state.cooldowns[decision.scenarioId]=Number(turn);
      state.lastDecisionTurn=Number(turn);
      state.lastSignalSnapshot=clone(context.signals);
      this.countryState.set(id,state);
      return {countryId:id,turn:Number(turn),decisions:selected,signals:context.signals,scenarioCount:this.scenarios.length};
    }

    async buildContext(countryId,turn){
      const state=getStateRoot();
      const countryRecord=getCountryRecordFromContext({countryRecord:this.getCountryRecord(countryId)},countryId);
      const context={countryId,turn,state,countryRecord};
      const signalPack=buildSignalSnapshot(context);
      const derived={
        observedSignalCount:Object.values(signalPack.signals).filter(x=>x.status==='AVAILABLE').length
      };
      return {
        countryId,
        turn,
        state,
        countryRecord,
        signals:signalPack.signals,
        derived,
        sourcesUsed:signalPack.sources,
        capabilities:Object.keys(signalPack.signals).filter(key=>signalPack.signals[key].status==='AVAILABLE')
      };
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

    selectDecisions(decisions){
      return decisions.slice().sort((a,b)=>
        Number(b.priority)-Number(a.priority) ||
        String(a.scenarioId).localeCompare(String(b.scenarioId))
      ).slice(0,3);
    }

    queueIntent(decision,turn){
      const runtime=getSimulationRuntime();
      if(!runtime?.enqueueCommand)return {status:'NOT_QUEUED',reason:'SIMULATION_RUNTIME_UNAVAILABLE',decisionId:decision.decisionId};
      const sourceMinistryId=String(decision.sourceMinistryId||'');
      if(!MINISTRY_IDS.includes(sourceMinistryId))return {status:'NOT_QUEUED',reason:'UNKNOWN_MINISTRY',decisionId:decision.decisionId};
      const interop=getInterop();
      const actionId='OCR_SCENARIO_'+String(decision.scenarioId||decision.ruleId).toUpperCase();
      const actionStatus=interop?.evaluateAction?.(sourceMinistryId,actionId,{countryId:normalizeId(decision.countryId),currentTurn:turn});
      if(actionStatus?.status==='UNKNOWN')return {status:'NOT_QUEUED',reason:'ACTION_NOT_REGISTERED',decisionId:decision.decisionId};
      const command={
        commandId:'OCR-CMD-'+String(turn)+'-'+normalizeId(decision.countryId)+'-'+String(decision.scenarioId||decision.ruleId),
        commandType:actionId,
        actionId,
        sourceMinistryId,
        countryId:normalizeId(decision.countryId),
        payload:{
          opponentRuleDecision:clone(decision),
          executionMode:'OPPONENT_COUNTRY_SCENARIO_INTENT',
          simulationTurn:Number(turn),
          evidence:clone(decision.evidence),
          signals:clone(decision.signals),
          candidateActionTypes:clone(decision.candidateActionTypes),
          requiredCapabilities:clone(decision.requiredCapabilities),
          executionType:decision.executionType
        },
        options:{
          origin:'OMEGA_OPPONENT_COUNTRY_RULES',
          scenarioId:decision.scenarioId,
          causationId:'OMEGA-TURN-'+String(turn),
          correlationId:decision.decisionId
        }
      };
      try{
        runtime.enqueueCommand(command);
        return {status:'QUEUED',decisionId:decision.decisionId,commandId:command.commandId};
      }catch(error){
        return {status:'NOT_QUEUED',reason:String(error?.message||error),decisionId:decision.decisionId};
      }
    }

    recordDecisions(turn,decisions,queued){
      const row={simulationTurn:Number(turn),decisions:clone(decisions),queued:clone(queued)};
      this.decisionHistory.push(row);
      if(this.decisionHistory.length>MAX_DECISION_HISTORY)this.decisionHistory.splice(0,this.decisionHistory.length-MAX_DECISION_HISTORY);
      const state=getStateRoot();
      state.simulation=state.simulation&&typeof state.simulation==='object'?state.simulation:{};
      state.simulation.domains=state.simulation.domains&&typeof state.simulation.domains==='object'?state.simulation.domains:{};
      const domain=state.simulation.domains.opponentCountryRules=state.simulation.domains.opponentCountryRules&&typeof state.simulation.domains.opponentCountryRules==='object'?state.simulation.domains.opponentCountryRules:{};
      domain.schemaVersion=SCHEMA_VERSION;
      domain.runtimeVersion=VERSION;
      domain.lastEvaluatedTurn=Number(turn);
      domain.scenarioCount=this.scenarios.length;
      domain.countryCount=this.countryState.size;
      domain.decisionHistory=this.decisionHistory.slice(-200);
      domain.datasetStatus=this.gateway.status();
    }

    emit(detail){
      const payload=clone(detail);
      for(const listener of [...this.listeners]){
        try{listener(payload);}catch(error){try{console.error('[OMEGA OPPONENT RULE]',error);}catch(_){}}
      }
      try{
        global.dispatchEvent?.(new CustomEvent(payload.eventType,{detail:{
          eventId:'OMEGA-OCR-'+String(payload.simulationTurn||0),
          eventType:payload.eventType,
          simulationTurn:payload.simulationTurn,
          payload
        }}));
      }catch(_){}
    }

    saveState(){
      return {
        schemaVersion:SCHEMA_VERSION,
        version:VERSION,
        initialized:this.initialized,
        running:this.running,
        lastTurn:this.lastTurn,
        lastError:this.lastError,
        decisionHistory:clone(this.decisionHistory),
        countryState:Object.fromEntries([...this.countryState.entries()].map(([id,row])=>[id,clone(row)])),
        datasets:this.gateway.saveState()
      };
    }

    loadState(snapshot){
      if(!snapshot||typeof snapshot!=='object')throw new Error('INVALID_OPPONENT_RULES_SAVE');
      if(Number(snapshot.schemaVersion)!==SCHEMA_VERSION)throw new Error('OPPONENT_RULES_SCHEMA_MISMATCH');
      this.initialized=Boolean(snapshot.initialized);
      this.running=Boolean(snapshot.running);
      this.lastTurn=number(snapshot.lastTurn);
      this.lastError=snapshot.lastError||null;
      this.decisionHistory=Array.isArray(snapshot.decisionHistory)?clone(snapshot.decisionHistory).slice(-MAX_DECISION_HISTORY):[];
      this.countryState=new Map(Object.entries(snapshot.countryState||{}).map(([id,row])=>[normalizeId(id),clone(row)]));
      if(snapshot.datasets)this.gateway.restoreState(snapshot.datasets);
      return this.diagnostics();
    }

    diagnostics(){
      const directionProblems=Object.entries(this.stateDirections).filter(([,d])=>d.problemWhen&&d.problemWhen!=='CONTEXT').length;
      return {
        version:VERSION,
        schemaVersion:SCHEMA_VERSION,
        initialized:this.initialized,
        running:this.running,
        attached:this.attached,
        evaluating:this.evaluating,
        lastTurn:this.lastTurn,
        lastError:this.lastError,
        scenarios:this.scenarios.length,
        rules:this.rules.length,
        actionTypes:Object.keys(this.actionTypes).length,
        directionalSignals:Object.keys(this.stateDirections).length,
        directionalProblemDefinitions:directionProblems,
        countriesTracked:this.countryState.size,
        decisionsRecorded:this.decisionHistory.reduce((sum,row)=>sum+(row.decisions?.length||0),0),
        queuedCommands:this.decisionHistory.reduce((sum,row)=>sum+(row.queued||[]).filter(x=>x.status==='QUEUED').length,0),
        datasetStatus:this.gateway.status()
      };
    }
  }

  const runtime=new OpponentCountryRulesRuntime();
  const api=Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    DATASETS:clone(DATASETS),
    STATE_DIRECTION_REGISTRY:clone(STATE_DIRECTION_REGISTRY),
    ACTION_TYPES:clone(ACTION_TYPES),
    SCENARIO_REGISTRY:clone(SCENARIO_REGISTRY),
    RULES:clone(RULES),
    instance:runtime,
    configure:options=>runtime.configure(options),
    initialize:options=>runtime.initialize(options),
    attachToSimulation:()=>runtime.attachToSimulation(),
    onTurnCommitted:turn=>runtime.onTurnCommitted(turn),
    evaluateCountry:(countryId,turn)=>runtime.evaluateCountry(countryId,turn),
    listCountryIds:turn=>runtime.listCountryIds(turn??getCurrentTurn()),
    registerScenario:scenario=>runtime.registerScenario(scenario),
    registerRule:rule=>runtime.registerRule(rule),
    evaluateDirection:(signalId,observation,expectedDirection)=>evaluateDirection(signalId,observation,expectedDirection),
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
