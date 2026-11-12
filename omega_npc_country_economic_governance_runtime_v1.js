/* OMEGA NPC COUNTRY ECONOMIC GOVERNANCE RUNTIME v1.0.0
 * Bounded, country-scoped fiscal and industrial development for the 196
 * non-player sovereigns. Uses Finance/Economy ministry transactions and the
 * existing OMEGA autonomous project executor; never simulates the player.
 * All opening figures derived from the repository's game baseline are marked
 * as simulation assumptions, not current real-world national accounts.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0';
  const LIMITS=Object.freeze({
    CORE_COUNTRIES:197,
    MAX_FISCAL_ELAPSED_TURNS:90,
    INVESTMENT_INTERVAL_TURNS:120,
    DIPLOMACY_INTERVAL_TURNS:240,
    ANNUAL_TAX_REVENUE_SHARE:0.12,
    DEVELOPMENT_SHARE_OF_REVENUE:0.08,
    RESERVE_SHARE_OF_REVENUE:0.07,
    PUBLIC_SERVICE_SHARE_OF_REVENUE:0.70,
    DEBT_SERVICE_SHARE_OF_REVENUE:0.15,
    OPENING_TREASURY_SHARE_OF_GDP:0.001,
    OPENING_RESERVE_SHARE_OF_GDP:0.003,
    FACTORY_PROJECT_COST_SHARE_OF_GDP:0.0015,
    FACTORY_PROJECT_DURATION_TURNS:4,
    MAX_ACTIVITY_ROWS:256
  });
  if(g.Omega?.NpcCountryEconomicGovernance?.VERSION===VERSION)return;
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],seen);
    return o;
  };
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const id=v=>String(v??'').trim().toUpperCase();
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const state=()=>g.Game?.state||g.gameState||g.Omega?.Simulation?.world?.state||g.Omega?.SimulationRuntime?.world?.state||{};
  const turnOf=ctx=>Math.max(0,Math.floor(num(ctx?.turn??ctx?.simulationTurn??ctx?.state?.simulation?.turn??state()?.simulation?.turn??g.Omega?.Simulation?.clock?.turn)??0));
  const runtime=()=>g.OmegaCountryRuntimeData||g.Omega?.CountryRuntimeData||null;
  const factoryBaseline=()=>g.OmegaCountryFactoryStartingBaselineV1||g.Omega?.CountryFactoryStartingBaselineV1||null;
  const scheduler=()=>g.Omega?.WorldSimulationScheduler||g.OmegaWorldSimulationScheduler||null;
  const autonomy=()=>g.OmegaOpponentAutonomy||g.Omega?.OpponentAutonomy||null;
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  function canonical(value){
    const raw=object(value)?(value.countryCode||value.iso2||value.iso3||value.countryId||value.code||value.id||value.name):value;
    if(raw===null||raw===undefined||String(raw).trim()==='')return '';
    try{const p=runtime()?.resolveCountry?.(raw);if(p?.countryCode)return id(p.countryCode);}catch(_){}
    try{const p=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity)?.resolveCountry?.(raw);if(p?.id)return id(p.id);if(p?.countryCode)return id(p.countryCode);}catch(_){}
    return id(raw);
  }
  function playerCountry(){
    const s=state(),sim=g.Omega?.Simulation||g.Omega?.SimulationRuntime;
    return canonical(s?.simulation?.session?.playerCountryId||s?.playerCountryId||sim?.getPlayerCountryId?.());
  }
  function bucket(root,countryId){
    if(!object(root))return null;
    const wanted=canonical(countryId);
    const key=Object.keys(root).find(k=>canonical(k)===wanted);
    return key===undefined?null:root[key];
  }
  function countryState(domain,countryId){
    const root=state(),byDomain=root?.[domain];
    return bucket(byDomain,countryId);
  }
  function command(owner,action,countryId,payload,turn,commandId){
    const mesh=interop();
    if(!mesh?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{
      return mesh.dispatchCommand(owner,action,countryId,payload,{
        turn,commandType:action,commandId,
        correlationId:payload?.decisionId||payload?.projectId||commandId,
        provenance:{authority:'OMEGA_NPC_COUNTRY_ECONOMIC_GOVERNANCE',simulationOnly:true}
      });
    }catch(error){return{status:'FAILED',reason:String(error?.message||error)};}
  }
  function profileFor(countryId){
    const rt=runtime();if(!rt)return null;
    try{return rt.getProfile?.(countryId)||rt.getProfile?.(rt.resolveCountry?.(countryId)?.iso3)||null;}catch(_){return null;}
  }
  function baselineFor(profile,countryId){
    const api=factoryBaseline();
    if(!api?.getCountryBaseline)return null;
    try{return api.getCountryBaseline(profile?.iso3||countryId)||api.getCountryBaseline(countryId)||null;}catch(_){return null;}
  }
  function sourceEconomy(profile){
    return object(profile?.sourceValues)?profile.sourceValues:{};
  }
  function sourcePopulation(profile){
    return object(profile?.populationValues)?profile.populationValues:{};
  }
  function deriveOpeningGDP(profile,baseline){
    const source=sourceEconomy(profile),observed=num(source.gdp??profile?.indicators?.gdpCurrentUsd);
    if(observed!==null&&observed>0){
      return{gdp:observed,source:'ECONOMY_GLOBAL_PROFILES_V1',baselineYear:2015,simulationAssumption:false};
    }
    const population=num(sourcePopulation(profile).population_2015??sourcePopulation(profile).populationTotal);
    if(population!==null&&population>0){
      return{gdp:Math.max(1000000,population*1200),source:'SIMULATION_BALANCE_PROXY_FROM_POPULATION',baselineYear:2015,simulationAssumption:true};
    }
    const factoryUnits=num(baseline?.totalStartingFactoryUnits);
    if(factoryUnits!==null&&factoryUnits>0){
      return{gdp:Math.max(1000000,factoryUnits*250000),source:'SIMULATION_BALANCE_PROXY_FROM_STARTING_INDUSTRY',baselineYear:2015,simulationAssumption:true};
    }
    return null;
  }
  function growthProfile(profile){
    const growth=num(sourceEconomy(profile).gdp_growth??profile?.indicators?.gdpGrowthPct);
    if(growth===null)return{value:1.5,source:'SIMULATION_DEFAULT_GROWTH_ASSUMPTION'};
    return{value:clamp(growth,-5,8),source:'ECONOMY_GLOBAL_PROFILES_V1'};
  }
  function initialFactoryCapacity(baseline){
    const value=num(baseline?.totalStartingFactoryUnits);
    return value!==null&&value>=0?value:null;
  }
  function selectFactoryType(baseline){
    const counts=object(baseline?.factoryCounts)?baseline.factoryCounts:{};
    return Object.entries(counts)
      .map(([factoryType,count])=>({factoryType:id(factoryType),count:num(count)??0}))
      .filter(row=>row.factoryType&&row.count>0)
      .sort((a,b)=>b.count-a.count||a.factoryType.localeCompare(b.factoryType))[0]?.factoryType||null;
  }
  function activeProjects(countryId){
    const row=countryState('projects',countryId),list=Array.isArray(row?.registry)?row.registry:[];
    return list.filter(p=>p?.autonomy===true&&['UNDER_CONSTRUCTION','COMMISSIONING'].includes(id(p.status)));
  }
  function relationRows(countryId){
    const f=countryState('foreign',countryId),r=countryState('relations',countryId);
    const value=f?.relations||r;
    return object(value)?value:{};
  }
  function relationScore(row){
    if(!object(row)||row.war_state===true||row.sanctions===true)return null;
    const values=[row.overall,row.trust,row.trade,row.political]
      .map(num).filter(x=>x!==null).map(x=>x>1?x/100:x);
    if(!values.length)return null;
    return values.reduce((sum,x)=>sum+x,0)/values.length;
  }
  function chooseDiplomaticPartner(countryId,allowedIds){
    const foreign=countryState('foreign',countryId)||{},relations=relationRows(countryId);
    const existingTreaties=object(foreign.treaties)?foreign.treaties:{};
    const negotiations=object(foreign.negotiations)?foreign.negotiations:{};
    const candidates=[];
    for(const [raw,row] of Object.entries(relations)){
      const target=canonical(raw),score=relationScore(row);
      if(!target||target===countryId||target===playerCountry()||!allowedIds.has(target)||score===null)continue;
      if(row?.war_state===true||row?.sanctions===true)continue;
      const treaty=existingTreaties[target],negotiation=negotiations[target];
      if(['ACTIVE','IMPLEMENTED','RATIFIED','SIGNED'].includes(id(treaty?.status||treaty?.stage)))continue;
      if(negotiation&&['REQUESTED','ACCEPTED','COUNTER_OFFERED','ACTIVE'].includes(id(negotiation.status)))continue;
      candidates.push({countryId:target,score,trade:num(row.trade),trust:num(row.trust),overall:num(row.overall)});
    }
    candidates.sort((a,b)=>b.score-a.score||b.trade-a.trade||a.countryId.localeCompare(b.countryId));
    return candidates[0]||null;
  }
  function fiscalHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),turn=Math.max(0,Math.floor(num(ctx.simulationTurn??p.turn)??0));
    if(!c||c===playerCountry())return{accepted:false,reason:'PLAYER_COUNTRY_AUTONOMY_FORBIDDEN'};
    const gdp=num(p.gdpUsd);
    if(gdp===null||gdp<=0)return{accepted:false,reason:'VALIDATED_GDP_REQUIRED'};
    const previous=ctx.stateTransaction.get('finance.npcEconomicGovernance');
    const ledger=object(previous)?clone(previous):{};
    if(num(ledger.lastFiscalTurn)!==null&&num(ledger.lastFiscalTurn)>=turn)return{accepted:true,duplicate:true,lastFiscalTurn:ledger.lastFiscalTurn};
    const availableRaw=num(ctx.stateTransaction.get('finance.available'));
    const reservesRaw=num(ctx.stateTransaction.get('finance.reserves'));
    const openingAvailable=availableRaw===null?Math.max(10000,gdp*LIMITS.OPENING_TREASURY_SHARE_OF_GDP):availableRaw;
    const openingReserves=reservesRaw===null?Math.max(20000,gdp*LIMITS.OPENING_RESERVE_SHARE_OF_GDP):reservesRaw;
    const priorTurn=num(ledger.lastFiscalTurn);
    const elapsed=priorTurn===null?0:clamp(turn-priorTurn,0,LIMITS.MAX_FISCAL_ELAPSED_TURNS);
    const receipts=gdp*LIMITS.ANNUAL_TAX_REVENUE_SHARE*(elapsed/365);
    const development=receipts*LIMITS.DEVELOPMENT_SHARE_OF_REVENUE;
    const reserveTransfer=receipts*LIMITS.RESERVE_SHARE_OF_REVENUE;
    const publicServices=receipts*LIMITS.PUBLIC_SERVICE_SHARE_OF_REVENUE;
    const debtService=receipts*LIMITS.DEBT_SERVICE_SHARE_OF_REVENUE;
    const nextAvailable=Math.max(0,openingAvailable+development);
    const nextReserves=Math.max(0,openingReserves+reserveTransfer);
    const next={
      schemaVersion:1,simulationOnly:true,provenance:p.gdpSource||'SIMULATION_MODEL_ASSUMPTION',
      baselineYear:2015,currency:'USD_GAME_BASELINE',
      openingTreasury:ledger.openingTreasury??openingAvailable,
      openingReserves:ledger.openingReserves??openingReserves,
      cumulativeTaxReceipts:(num(ledger.cumulativeTaxReceipts)||0)+receipts,
      cumulativeDevelopmentAllocations:(num(ledger.cumulativeDevelopmentAllocations)||0)+development,
      cumulativePublicServices:(num(ledger.cumulativePublicServices)||0)+publicServices,
      cumulativeDebtService:(num(ledger.cumulativeDebtService)||0)+debtService,
      cumulativeReserveTransfers:(num(ledger.cumulativeReserveTransfers)||0)+reserveTransfer,
      lastTaxReceipt:receipts,lastDevelopmentAllocation:development,
      lastPublicServicesAllocation:publicServices,lastDebtServiceAllocation:debtService,
      lastReserveTransfer:reserveTransfer,lastFiscalTurn:turn,
      budgetShares:{taxRevenuePctGDP:LIMITS.ANNUAL_TAX_REVENUE_SHARE*100,
        developmentPctRevenue:LIMITS.DEVELOPMENT_SHARE_OF_REVENUE*100,
        publicServicesPctRevenue:LIMITS.PUBLIC_SERVICE_SHARE_OF_REVENUE*100,
        debtServicePctRevenue:LIMITS.DEBT_SERVICE_SHARE_OF_REVENUE*100,
        reservePctRevenue:LIMITS.RESERVE_SHARE_OF_REVENUE*100},
      elapsedTurns:elapsed
    };
    ctx.stateTransaction.set('finance.available',nextAvailable);
    ctx.stateTransaction.set('finance.reserves',nextReserves);
    ctx.stateTransaction.set('finance.npcEconomicGovernance',next);
    return{accepted:true,treasury:nextAvailable,reserves:nextReserves,taxReceipts:receipts,developmentAllocation:development,
      publicServicesAllocation:publicServices,debtServiceAllocation:debtService,reserveTransfer,elapsedTurns:elapsed,
      simulationOnly:true,stateMutationAuthority:true};
  }
  function economyHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),turn=Math.max(0,Math.floor(num(ctx.simulationTurn??p.turn)??0));
    if(!c||c===playerCountry())return{accepted:false,reason:'PLAYER_COUNTRY_AUTONOMY_FORBIDDEN'};
    const baselineGDP=num(p.baselineGDP),initialCapacity=num(p.initialProductionCapacity);
    const priorRaw=ctx.stateTransaction.get('economy.npcEconomicGovernance');
    const prior=object(priorRaw)?clone(priorRaw):{};
    if(num(prior.lastEconomyTurn)!==null&&num(prior.lastEconomyTurn)>=turn)
      return{accepted:true,duplicate:true,gdp:num(ctx.stateTransaction.get('economy.gdp')),lastEconomyTurn:prior.lastEconomyTurn};
    let gdp=num(ctx.stateTransaction.get('economy.gdp'));
    if(gdp===null||gdp<=0){if(baselineGDP===null||baselineGDP<=0)return{accepted:false,reason:'GDP_BASELINE_UNAVAILABLE'};gdp=baselineGDP;}
    let capacity=num(ctx.stateTransaction.get('economy.productionCapacity'));
    if(capacity===null&&initialCapacity!==null&&initialCapacity>=0)capacity=initialCapacity;
    if(capacity!==null)ctx.stateTransaction.set('economy.productionCapacity',capacity);
    const elapsed=prior.lastEconomyTurn===undefined?0:clamp(turn-(num(prior.lastEconomyTurn)??turn),0,LIMITS.MAX_FISCAL_ELAPSED_TURNS);
    const annualGrowth=num(p.growthPct);
    const previousCapacity=num(prior.lastObservedProductionCapacity);
    const industrialDelta=capacity===null||previousCapacity===null?0:Math.max(0,capacity-previousCapacity);
    const productivityBonusPct=Math.min(0.15,industrialDelta*0.01);
    const appliedGrowthPct=clamp((annualGrowth??1.5)+productivityBonusPct,-5,8);
    const growthFactor=elapsed>0?Math.pow(Math.max(0.01,1+appliedGrowthPct/100),elapsed/365):1;
    const nextGDP=gdp*growthFactor;
    const next={
      schemaVersion:1,simulationOnly:true,baselineYear:2015,
      gdpSource:p.gdpSource||prior.gdpSource||'SIMULATION_MODEL_ASSUMPTION',
      gdpProvenance:p.gdpSimulationAssumption===true?'SIMULATION_BALANCE_PROXY':'ECONOMY_GLOBAL_PROFILES_V1',
      baselineGDP:prior.baselineGDP??baselineGDP??gdp,
      baselineGrowthPct:annualGrowth??1.5,growthSource:p.growthSource||'SIMULATION_DEFAULT_GROWTH_ASSUMPTION',
      appliedGrowthPct,lastGrowthFactor:growthFactor,elapsedTurns:elapsed,
      productionCapacitySource:prior.productionCapacitySource||(initialCapacity!==null?'SIMULATED_COUNTRY_STARTING_INDUSTRY_PROFILE':'EXISTING_COUNTRY_ECONOMY_STATE'),
      initialProductionCapacity:prior.initialProductionCapacity??initialCapacity??capacity,
      lastObservedProductionCapacity:capacity,
      industrialProjectsCompleted:num(prior.industrialProjectsCompleted)||0,
      industrialProductivityBonusPct:productivityBonusPct,
      lastEconomyTurn:turn,
      lastInvestmentTurn:num(prior.lastInvestmentTurn)??-LIMITS.INVESTMENT_INTERVAL_TURNS,
      lastDiplomacyTurn:num(prior.lastDiplomacyTurn)??-LIMITS.DIPLOMACY_INTERVAL_TURNS,
      lastProjectId:prior.lastProjectId||null,lastTreatyTarget:prior.lastTreatyTarget||null
    };
    ctx.stateTransaction.set('economy.gdp',nextGDP);
    ctx.stateTransaction.set('economy.gdpGrowthPct',appliedGrowthPct);
    ctx.stateTransaction.set('economy.npcEconomicGovernance',next);
    return{accepted:true,gdp:nextGDP,previousGDP:gdp,growthPct:appliedGrowthPct,elapsedTurns:elapsed,
      productionCapacity:capacity,productivityBonusPct:productivityBonusPct,simulationOnly:true,stateMutationAuthority:true};
  }
  function activityRecordHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId);
    if(!c||c===playerCountry())return{accepted:false,reason:'PLAYER_COUNTRY_AUTONOMY_FORBIDDEN'};
    const raw=ctx.stateTransaction.get('economy.npcEconomicGovernance');
    const prior=object(raw)?clone(raw):{};
    if(p.activityId&&Array.isArray(prior.activityIds)&&prior.activityIds.includes(p.activityId))
      return{accepted:true,duplicate:true};
    if(p.activityType==='INDUSTRIAL_PROJECT_STARTED'){
      prior.lastInvestmentTurn=Math.max(num(prior.lastInvestmentTurn)??-1,Math.floor(num(p.turn)??0));
      prior.lastProjectId=String(p.projectId||'');
      const rows=Array.isArray(prior.industrialProjectHistory)?prior.industrialProjectHistory:[];
      prior.industrialProjectHistory=rows.concat([{projectId:p.projectId,factoryType:p.factoryType,cost:p.cost,createdTurn:p.turn,status:'UNDER_CONSTRUCTION',simulationOnly:true}]).slice(-LIMITS.MAX_ACTIVITY_ROWS);
    }else if(p.activityType==='DIPLOMATIC_TREATY_REQUESTED'){
      prior.lastDiplomacyTurn=Math.max(num(prior.lastDiplomacyTurn)??-1,Math.floor(num(p.turn)??0));
      prior.lastTreatyTarget=canonical(p.targetCountryId);
      const rows=Array.isArray(prior.diplomaticActivityHistory)?prior.diplomaticActivityHistory:[];
      prior.diplomaticActivityHistory=rows.concat([{targetCountryId:prior.lastTreatyTarget,treatyType:p.treatyType,createdTurn:p.turn,status:'REQUESTED'}]).slice(-LIMITS.MAX_ACTIVITY_ROWS);
    }
    if(p.activityId){
      const keys=Array.isArray(prior.activityIds)?prior.activityIds:[];
      prior.activityIds=keys.concat([String(p.activityId)]).slice(-LIMITS.MAX_ACTIVITY_ROWS);
    }
    prior.simulationOnly=true;
    ctx.stateTransaction.set('economy.npcEconomicGovernance',prior);
    return{accepted:true,activityType:p.activityType||null,stateMutationAuthority:true};
  }
  function registerHandlers(){
    const mesh=interop();if(!mesh?.registerCommandHandler||!mesh?.registerAction)return false;
    const defs=[
      ['OMEGA_NPC_COUNTRY_FISCAL_ADVANCE','finance',fiscalHandler,{affectedStateDomains:['finance']}],
      ['OMEGA_NPC_COUNTRY_ECONOMY_ADVANCE','economy',economyHandler,{affectedStateDomains:['economy']}],
      ['OMEGA_NPC_COUNTRY_ACTIVITY_RECORD','economy',activityRecordHandler,{affectedStateDomains:['economy']}]
    ];
    try{
      for(const [action,owner,handler,definition] of defs){
        mesh.registerAction(action,{actionId:action,stateOwnerMinistry:owner,authority:'OMEGA_NPC_COUNTRY_ECONOMIC_GOVERNANCE',...definition});
        mesh.registerCommandHandler(action,owner,handler);
      }
      handlersReady=true;return true;
    }catch(error){lastError=String(error?.message||error);return false;}
  }
  let handlersReady=false,installed=false,lastError=null,processedCountries=0,failedCountries=0,
      investmentsStarted=0,treatyRequestsStarted=0,lastProcessedCountry=null,lastProcessedTurn=null;
  const roster=new Set();
  function ensureReady(){
    if(readinessPromise)return readinessPromise;
    readinessPromise=Promise.all([
      Promise.resolve(factoryBaseline()?.ready??false),
      Promise.resolve(runtime()?.init?.()??false)
    ]).then(results=>{
      const api=factoryBaseline(),rt=runtime();
      const ids=api?.getCountryIds?.();
      if(results.some(x=>x===false)||!Array.isArray(ids)||ids.length!==LIMITS.CORE_COUNTRIES)
        throw new Error('CANONICAL_197_COUNTRY_FACTORY_BASELINE_NOT_READY');
      const mapped=ids.map(value=>canonical(value)).filter(Boolean);
      if(new Set(mapped).size!==LIMITS.CORE_COUNTRIES)
        throw new Error('CANONICAL_197_COUNTRY_IDENTITY_MAPPING_INVALID');
      roster.clear();for(const cid of mapped)roster.add(cid);
      if(!rt?.getProfile||!rt?.resolveCountry)throw new Error('COUNTRY_RUNTIME_DATA_UNAVAILABLE');
      return true;
    }).catch(error=>{readinessPromise=null;lastError=String(error?.message||error);return false;});
    return readinessPromise;
  }
  let readinessPromise=null;
  function currentGDP(countryId){
    const e=countryState('economy',countryId);
    return num(e?.gdp);
  }
  function dispatchActivity(countryId,turn,payload){
    const activityId=payload.activityId||('NPC-ACTIVITY-'+countryId+'-'+turn+'-'+payload.activityType);
    return command('economy','OMEGA_NPC_COUNTRY_ACTIVITY_RECORD',countryId,{...payload,activityId,turn},turn,activityId);
  }
  function attemptIndustrialDevelopment(countryId,turn,baseline,profile,governance){
    const autonomyApi=autonomy();
    if(!autonomyApi?.dispatch)return{status:'UNAVAILABLE',reason:'AUTONOMY_PROJECT_EXECUTOR_UNAVAILABLE'};
    const projectList=activeProjects(countryId);
    if(projectList.length)return{status:'DEFERRED',reason:'ACTIVE_PROJECT_ALREADY_RUNNING'};
    const lastInvestment=num(governance?.lastInvestmentTurn)??-LIMITS.INVESTMENT_INTERVAL_TURNS;
    if(turn-lastInvestment<LIMITS.INVESTMENT_INTERVAL_TURNS)return{status:'DEFERRED',reason:'INVESTMENT_COOLDOWN'};
    const factoryType=selectFactoryType(baseline);
    if(!factoryType)return{status:'DEFERRED',reason:'NO_OBSERVED_STARTING_FACTORY_SPECIALIZATION'};
    const gdp=currentGDP(countryId);
    if(gdp===null||gdp<=0)return{status:'DEFERRED',reason:'COUNTRY_GDP_UNAVAILABLE'};
    const cost=Math.max(10000,gdp*LIMITS.FACTORY_PROJECT_COST_SHARE_OF_GDP);
    const finance=countryState('finance',countryId)||{};
    const available=num(finance.available);
    if(available===null||available<cost)return{status:'DEFERRED',reason:'DEVELOPMENT_BUDGET_INSUFFICIENT',available,required:cost};
    const decisionId='NPC-INDUSTRY-'+countryId+'-'+turn;
    const route={
      countryId,decisionId,scenarioId:'NPC_COUNTRY_ECONOMIC_DEVELOPMENT',
      selectedAction:'INDUSTRY_BUILD',
      selected:{
        action:'INDUSTRY_BUILD',targetCountryId:null,facilityType,
        plan:{quantity:1,cost,labor:0,materials:{},durationTurns:LIMITS.FACTORY_PROJECT_DURATION_TURNS,facilityType}
      }
    };
    let result;
    try{result=autonomyApi.dispatch('OMEGA_AUTONOMY_BUNDLE',countryId,{countryId,decisionId,route});}
    catch(error){return{status:'FAILED',reason:String(error?.message||error)};}
    if(result?.status!=='APPLIED'||result?.result?.accepted!==true)
      return{status:'FAILED',reason:result?.reason||result?.result?.reason||'INDUSTRIAL_PROJECT_NOT_COMMITTED',detail:result};
    const projectId='AUTO-PROJ-'+turn+'-'+countryId+'-'+decisionId;
    const recorded=dispatchActivity(countryId,turn,{activityType:'INDUSTRIAL_PROJECT_STARTED',projectId,factoryType,cost,decisionId});
    if(recorded?.status!=='APPLIED')return{status:'RECORD_FAILED',reason:recorded?.reason||'INDUSTRIAL_ACTIVITY_RECORD_FAILED',projectId,executor:result};
    investmentsStarted++;
    return{status:'STARTED',projectId,factoryType,cost,executor:result};
  }
  function attemptDiplomacy(countryId,turn,governance,allowedIds){
    const autonomyApi=autonomy();
    if(!autonomyApi?.startTreatyNegotiation)return{status:'UNAVAILABLE',reason:'TREATY_EXECUTOR_UNAVAILABLE'};
    const last=num(governance?.lastDiplomacyTurn)??-LIMITS.DIPLOMACY_INTERVAL_TURNS;
    if(turn-last<LIMITS.DIPLOMACY_INTERVAL_TURNS)return{status:'DEFERRED',reason:'DIPLOMACY_COOLDOWN'};
    const partner=chooseDiplomaticPartner(countryId,allowedIds);
    if(!partner)return{status:'DEFERRED',reason:'NO_OBSERVED_ELIGIBLE_DIPLOMATIC_PARTNER'};
    const decisionId='NPC-TRADE-DIPLOMACY-'+countryId+'-'+partner.countryId+'-'+turn;
    let result;
    try{
      result=autonomyApi.startTreatyNegotiation(countryId,partner.countryId,{
        treatyType:'TRADE_AND_INVESTMENT',
        terms:{tradeCooperation:true,investmentCooperation:true,industrialCooperation:true,reviewIntervalTurns:90},
        decisionId,correlationId:decisionId
      });
    }catch(error){return{status:'FAILED',reason:String(error?.message||error)};}
    if(result?.status!=='APPLIED')return{status:'FAILED',reason:result?.reason||'TREATY_NEGOTIATION_NOT_OPENED',detail:result};
    const recorded=dispatchActivity(countryId,turn,{activityType:'DIPLOMATIC_TREATY_REQUESTED',targetCountryId:partner.countryId,treatyType:'TRADE_AND_INVESTMENT',decisionId});
    if(recorded?.status!=='APPLIED')return{status:'RECORD_FAILED',reason:recorded?.reason||'DIPLOMATIC_ACTIVITY_RECORD_FAILED',executor:result};
    treatyRequestsStarted++;
    return{status:'REQUESTED',targetCountryId:partner.countryId,executor:result};
  }
  async function processCountry(countryId,ctx={}){
    const c=canonical(countryId),turn=turnOf(ctx),player=playerCountry();
    if(!c)return{status:'SKIPPED',reason:'COUNTRY_ID_REQUIRED'};
    if(c===player)return{status:'PLAYER_EXEMPT',countryId:c,turn};
    if(!await ensureReady())return{status:'BLOCKED',reason:lastError||'COUNTRY_BASELINE_NOT_READY',countryId:c,turn};
    if(!roster.has(c))return{status:'SKIPPED',reason:'COUNTRY_NOT_IN_CANONICAL_197_ROSTER',countryId:c};
    const profile=profileFor(c),baseline=baselineFor(profile,c);
    if(!profile||!baseline)return{status:'BLOCKED',reason:'COUNTRY_ECONOMIC_BASELINE_UNAVAILABLE',countryId:c,turn};
    const opening=deriveOpeningGDP(profile,baseline);
    if(!opening)return{status:'BLOCKED',reason:'COUNTRY_GDP_AND_BALANCE_PROXY_UNAVAILABLE',countryId:c,turn};
    const growth=growthProfile(profile),capacity=initialFactoryCapacity(baseline);
    const economyResult=command('economy','OMEGA_NPC_COUNTRY_ECONOMY_ADVANCE',c,{
      turn,baselineGDP:opening.gdp,gdpSource:opening.source,gdpSimulationAssumption:opening.simulationAssumption===true,
      growthPct:growth.value,growthSource:growth.source,initialProductionCapacity:capacity
    },turn,'NPC-ECONOMY-'+c+'-'+turn);
    if(economyResult?.status!=='APPLIED'&&economyResult?.status!=='ACCEPTED')
      {failedCountries++;lastError=economyResult?.reason||economyResult?.result?.reason||'NPC_ECONOMY_ADVANCE_FAILED';return{status:'FAILED',countryId:c,turn,stage:'ECONOMY',reason:lastError};}
    const gdp=currentGDP(c);
    const fiscalResult=command('finance','OMEGA_NPC_COUNTRY_FISCAL_ADVANCE',c,{
      turn,gdpUsd:gdp,gdpSource:opening.source
    },turn,'NPC-FISCAL-'+c+'-'+turn);
    if(fiscalResult?.status!=='APPLIED'&&fiscalResult?.status!=='ACCEPTED')
      {failedCountries++;lastError=fiscalResult?.reason||fiscalResult?.result?.reason||'NPC_FISCAL_ADVANCE_FAILED';return{status:'FAILED',countryId:c,turn,stage:'FISCAL',reason:lastError};}
    let economy=countryState('economy',c)||{},governance=economy.npcEconomicGovernance||{};
    const investment=attemptIndustrialDevelopment(c,turn,baseline,profile,governance);
    const diplomacy=attemptDiplomacy(c,turn,governance,roster);
    processedCountries++;lastProcessedCountry=c;lastProcessedTurn=turn;
    return{status:'PROCESSED',countryId:c,turn,gdp,currentTreasury:num(countryState('finance',c)?.available),reserves:num(countryState('finance',c)?.reserves),
      productionCapacity:num(countryState('economy',c)?.productionCapacity),investment,diplomacy,
      simulationOnly:true};
  }
  function onTreatyStarted(event,ctx){
    const target=canonical(event?.payload?.targetCountryId||event?.targetCountryId);
    if(target&&target!==playerCountry()&&roster.has(target))
      return scheduler()?.activateCountry?.(target,{turn:turnOf(ctx),reason:'NPC_TREATY_COUNTERPARTY_RESPONSE',priority:78,ttlTurns:8})||null;
    return null;
  }
  function install(){
    if(installed)return true;
    const mesh=interop(),world=scheduler();
    if(!registerHandlers()||!world?.registerCountryHandler)return false;
    world.registerCountryHandler('omega.npc-country-economic-governance.v1',
      (countryId,ctx)=>processCountry(countryId,ctx),
      {tiers:['ACTIVE','MACRO'],priority:70});
    if(world.registerEventHandler)
      world.registerEventHandler('OMEGA_TREATY_NEGOTIATION_STARTED','omega.npc-country-economic-governance.treaty-inbox',onTreatyStarted,{priority:20});
    installed=!!mesh;return installed;
  }
  function diagnostics(){
    const schedulerInfo=scheduler()?.diagnostics?.()||{};
    return{
      version:VERSION,installed,handlersReady,ready:!!(roster.size===LIMITS.CORE_COUNTRIES),
      canonicalCountryCount:roster.size,eligibleNpcCountries:Math.max(0,roster.size-(playerCountry()?1:0)),
      playerCountryId:playerCountry()||null,processedCountries,failedCountries,investmentsStarted,treatyRequestsStarted,
      lastProcessedCountry,lastProcessedTurn,lastError,
      execution:{fiscal:'COUNTRY_SCOPED_FINANCE_TRANSACTION',economy:'COUNTRY_SCOPED_ECONOMY_TRANSACTION',
        industrialProjects:'OMEGA_AUTONOMY_BUNDLE_AND_PROJECT_LIFECYCLE',diplomacy:'OMEGA_TREATY_LIFECYCLE'},
      scheduler:{rosterCount:schedulerInfo.rosterCount||0,lastBatchTurn:schedulerInfo.lastTurn??null}
    };
  }
  function getCountryEconomy(countryId){
    const c=canonical(countryId);if(!roster.has(c))return{status:'COUNTRY_NOT_IN_CANONICAL_197_ROSTER'};
    const economy=countryState('economy',c)||{},finance=countryState('finance',c)||{},baseline=profileFor(c);
    if(!economy.npcEconomicGovernance)return{status:c===playerCountry()?'PLAYER_CONTROLLED':'NOT_YET_PROCESSED',countryId:c};
    return{
      status:c===playerCountry()?'PLAYER_CONTROLLED':'NPC_AUTONOMY_ACTIVE',countryId:c,
      gdp:num(economy.gdp),gdpGrowthPct:num(economy.gdpGrowthPct),productionCapacity:num(economy.productionCapacity),
      treasury:num(finance.available),reserves:num(finance.reserves),
      industrialAssets:Array.isArray(economy.productionAssets)?economy.productionAssets.length:0,
      economyGovernance:clone(economy.npcEconomicGovernance),
      fiscalGovernance:clone(finance.npcEconomicGovernance),
      profileStatus:baseline?.profileStatus||null,simulationOnly:true
    };
  }
  const API=Object.freeze({
    VERSION,LIMITS,install,processCountry,diagnostics,getCountryEconomy,
    getCountryIds:()=>[...roster].sort(),
    isReady:()=>roster.size===LIMITS.CORE_COUNTRIES
  });
  g.Omega=g.Omega||{};g.Omega.NpcCountryEconomicGovernance=API;g.OmegaNpcCountryEconomicGovernance=API;
  try{install();}catch(error){lastError=String(error?.message||error);}
  if(typeof g.addEventListener==='function')g.addEventListener('OMEGA_READY',()=>{try{install();}catch(error){lastError=String(error?.message||error);}});
})(typeof window!=='undefined'?window:globalThis);
