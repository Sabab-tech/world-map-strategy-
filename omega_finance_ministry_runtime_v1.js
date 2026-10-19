/* OMEGA GLOBAL FINANCE MINISTRY + MACROECONOMIC RUNTIME v1.0.0 */
(function(global){
  'use strict';
  if(global.OmegaFinanceMinistry&&global.OmegaFinanceMinistry.VERSION==='1.0.0')return;
  const VERSION='1.0.0', YEAR_MS=31536000000, HOUR_MS=3600000;
  const BASE_RULES={annualizationMs:YEAR_MS,simulationTurnDurationMs:HOUR_MS,startingTreasuryPercentOfGDP:2,
    defaultTaxRatePct:18,defaultPolicyInterestRatePct:3,defaultDeficitPercentOfGDPWhenUnobserved:3,
    minimumTaxRatePct:0,maximumTaxRatePct:60,minimumPolicyInterestRatePct:0,maximumPolicyInterestRatePct:40,
    maximumBorrowTransactionPercentOfGDP:5,maximumDebtToGDPForNewBorrowingPct:300,maximumLedgerEntries:500,
    influenceWeights:{gdp:.55,population:.20,foreignExchangeReserves:.15,tradeBalanceToGDP:.10},
    fiscalRiskBounds:{debtToGDPPercent:300,inflationPercent:25,unemploymentPercent:35,deficitToGDPPercent:20}};
  const DEPARTMENTS=Object.freeze([
    ['cabinet','Executive Cabinet'],['defense','Defense'],['military','Military'],['interior','Home / Interior'],
    ['health','Health'],['education','Education'],['resource','Resources'],['transport','Transport'],['technology','Technology'],
    ['projects','Projects'],['foreign','Foreign Affairs'],['trade','Trade'],['economy','Economy'],['statistics','Statistics'],['culture','Culture']
  ]);
  let profiles=[],byCountryId=new Map(),rules=JSON.parse(JSON.stringify(BASE_RULES)),initialized=false,initPromise=null;
  let selectedCountryCode=null,uiHooksAttached=false,uiContainer=null;
  const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  function finite(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);return null;}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function clone(v){if(v===undefined)return undefined;try{return JSON.parse(JSON.stringify(v));}catch(_){return v;}}
  function norm(v){return String(v==null?'':v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' AND ').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');}
  function escapeHTML(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function fmtMoney(v){const n=finite(v);if(n===null)return 'N/A';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);}catch(_){return '$'+Math.round(n).toLocaleString('en-US');}}
  function fmtNumber(v,digits){const n=finite(v);return n===null?'N/A':n.toLocaleString('en-US',{maximumFractionDigits:digits===undefined?2:digits});}
  function fmtPct(v){const n=finite(v);return n===null?'N/A':n.toFixed(2)+'%';}
  function ensureObject(parent,key){if(!isObject(parent[key]))parent[key]={};return parent[key];}
  function stateCandidates(){
    const raw=[global.Omega&&global.Omega.Simulation&&global.Omega.Simulation.world&&global.Omega.Simulation.world.state,
      global.Omega&&global.Omega.World&&global.Omega.World.state,global.Game&&global.Game.state,global.gameState];
    const out=[];for(const s of raw)if(isObject(s)&&!out.includes(s))out.push(s);return out;
  }
  function rootState(){
    const candidates=stateCandidates();const primary=candidates.find(s=>isObject(s.economy)&&Object.keys(s.economy).length>0);
    if(primary)return primary;if(candidates.length)return candidates[0];
    global.gameState=global.gameState||{economy:{},population:{},finance:{},simulation:{turn:0}};return global.gameState;
  }
  async function fetchJSON(path){
    if(typeof global.fetchResilient==='function'){const d=await global.fetchResilient(path);if(d&&typeof d==='object')return d;}
    if(typeof global.fetch!=='function')throw new Error('FETCH_UNAVAILABLE:'+path);
    const response=await global.fetch(path+'?v='+encodeURIComponent(VERSION));
    if(!response||response.ok===false)throw new Error('DATA_FETCH_FAILED:'+path);return response.json();
  }
  function indexProfiles(){
    byCountryId=new Map();for(const p of profiles){
      const keys=[p.countryCode,p.iso3,p.numericCode,p.name,p.economyKey,norm(p.name),norm(p.economyKey)].filter(Boolean);
      for(const k of keys){byCountryId.set(String(k).toUpperCase(),p);byCountryId.set(norm(k),p);}
    }
  }
  function resolveProfile(value){
    if(value&&typeof value==='object')value=value.iso3||value.countryCode||value.code||value.id||value.name;
    const raw=String(value==null?'':value).trim();if(!raw)return null;
    return byCountryId.get(raw.toUpperCase())||byCountryId.get(norm(raw))||null;
  }
  function playerCountryProfile(){
    const sim=global.Omega&&global.Omega.Simulation,root=rootState();let value=null;
    try{if(typeof sim?.getPlayerCountryId==='function')value=sim.getPlayerCountryId();}catch(_){}
    value=value||root?.simulation?.session?.playerCountryId||root?.simulation?.playerCountryId||
      global.CountryIOS?.activeCountry||global.Game?.currentActiveCountry||global.currentActiveCountry||'USA';
    return resolveProfile(value)||resolveProfile('USA')||profiles[0]||null;
  }
  function viewedCountryProfile(){return resolveProfile(selectedCountryCode)||playerCountryProfile();}
  function isPlayable(p){return !!p&&p.profileStatus!=='UNAVAILABLE'&&finite(p.indicators?.gdpCurrentUsd)>0;}
  function currentTurn(){
    const s=rootState(),vals=[s?.simulation?.turn,s?.simulation?.currentTurn,s?.turn,global.Omega?.Simulation?.clock?.turn];
    for(const v of vals){const n=finite(v);if(n!==null)return n;}return 0;
  }
  function getEconomyRecord(p){
    if(!p||!p.economyKey)return null;
    for(const s of stateCandidates()){const e=s?.economy?.[p.economyKey];if(isObject(e))return e;}
    return isObject(p.sourceValues)?p.sourceValues:null;
  }
  function modelProfileIndicators(p,e){
    const base=p?.indicators||{};e=e||p?.sourceValues||{};
    const gdp=finite(e.gdp)??finite(base.gdpCurrentUsd),growth=finite(e.gdp_growth)??finite(base.gdpGrowthPct);
    const inflation=finite(e.inflation)??finite(base.inflationRatePct),unemployment=finite(e.unemployment_rate)??finite(base.unemploymentRatePct);
    const debt=finite(e.debt)??finite(base.publicDebtUsd),balance=finite(e.budget_balance)??finite(base.governmentBudgetBalanceUsd);
    const trade=finite(e.trade_balance)??finite(base.tradeBalanceUsd),reserves=finite(e.reserves)??finite(base.foreignExchangeReservesUsd);
    const pop=finite(p?.populationValues?.population_2015)??finite(base.population2015);
    const pct=(a,b)=>a!==null&&b!==null&&b>0?Number((a/b*100).toFixed(4)):null;
    const per=(a,b)=>a!==null&&b!==null&&b>0?Number((a/b).toFixed(2)):null;
    return {gdpCurrentUsd:gdp,gdpGrowthPct:growth,inflationRatePct:inflation,unemploymentRatePct:unemployment,
      governmentBudgetBalanceUsd:balance,publicDebtUsd:debt,tradeBalanceUsd:trade,foreignExchangeReservesUsd:reserves,
      exchangeRateLocalPerUsd:finite(e.exchange_rate_usd)??finite(base.exchangeRateLocalPerUsd),population2015:pop,
      gdpPerCapitaUsd:per(gdp,pop),publicDebtToGdpPct:pct(debt,gdp),budgetBalanceToGdpPct:pct(balance,gdp),
      tradeBalanceToGdpPct:pct(trade,gdp),reservesToGdpPct:pct(reserves,gdp),debtPerCapitaUsd:per(debt,pop),
      policyInterestRatePct:null,taxRevenueUsd:null,governmentRevenueUsd:null,governmentExpenditureUsd:null,
      exportsUsd:null,importsUsd:null,currentAccountBalanceUsd:null,currentAccountToGdpPct:null};
  }
  function ensureFinanceState(p,root){
    if(!p)return null;root=root||rootState();const financeRoot=ensureObject(root,'finance'),id=p.iso3||p.countryCode;
    const bucket=ensureObject(financeRoot,id);const model=ensureObject(bucket,'omegaFinance');
    const e=getEconomyRecord(p)||{},gdp=finite(e.gdp)??finite(p.indicators?.gdpCurrentUsd);
    if(model.version!==VERSION){
      model.version=VERSION;model.countryCode=id;model.countryName=p.name;
      model.status=gdp!==null&&gdp>0?'ACTIVE':'DATA_UNAVAILABLE';model.initializedTurn=currentTurn();model.lastProcessedTurn=null;
      model.treasuryBalanceUsd=model.treasuryBalanceUsd!==undefined?finite(model.treasuryBalanceUsd):(gdp>0?Math.max(0,finite(e.treasury)??(gdp*Number(rules.startingTreasuryPercentOfGDP||2)/100)):0);
      if(model.treasuryBalanceUsd===null)model.treasuryBalanceUsd=0;
      model.treasurySource=finite(e.treasury)!==null?'EXISTING_RUNTIME_TREASURY':'GAME_RULE_ESTIMATE';
      model.policy=isObject(model.policy)?model.policy:{};
      if(finite(model.policy.taxRatePct)===null)model.policy.taxRatePct=Number(rules.defaultTaxRatePct||18);
      if(finite(model.policy.interestRateAnnualPct)===null)model.policy.interestRateAnnualPct=Number(rules.defaultPolicyInterestRatePct||3);
      if(!model.policy.taxRateSource)model.policy.taxRateSource='GAME_MODEL_DEFAULT_NOT_OBSERVED';
      if(!model.policy.interestRateSource)model.policy.interestRateSource='GAME_MODEL_DEFAULT_NOT_OBSERVED';
      model.fiscalModel=isObject(model.fiscalModel)?model.fiscalModel:{};
      const revenue=gdp>0?gdp*model.policy.taxRatePct/100:0;
      const observedBalance=finite(e.budget_balance)??finite(p.indicators?.governmentBudgetBalanceUsd);
      const balance=observedBalance!==null?observedBalance:-(gdp>0?gdp*Number(rules.defaultDeficitPercentOfGDPWhenUnobserved||3)/100:0);
      const spending=gdp>0?Math.max(0,revenue-balance):0;
      if(finite(model.fiscalModel.annualRevenueUsd)===null)model.fiscalModel.annualRevenueUsd=revenue;
      if(finite(model.fiscalModel.annualSpendingUsd)===null)model.fiscalModel.annualSpendingUsd=spending;
      if(finite(model.fiscalModel.spendingToGdpPct)===null)model.fiscalModel.spendingToGdpPct=gdp>0?model.fiscalModel.annualSpendingUsd/gdp*100:0;
      if(finite(model.fiscalModel.annualBudgetBalanceUsd)===null)model.fiscalModel.annualBudgetBalanceUsd=model.fiscalModel.annualRevenueUsd-model.fiscalModel.annualSpendingUsd;
      model.fiscalModel.balanceBaselineSource=observedBalance!==null?'EXISTING_GAME_DATASET':'GAME_RULE_ESTIMATE';
      for(const k of ['cumulativeRevenueUsd','cumulativeSpendingUsd','cumulativeInterestUsd','cumulativeBorrowingUsd'])if(finite(model[k])===null)model[k]=0;
      model.priceIndex=finite(model.priceIndex)??100;model.allocations=isObject(model.allocations)?model.allocations:{};
      if(!Array.isArray(model.ledger))model.ledger=[];model.revision=finite(model.revision)??0;
    }else{
      model.policy=isObject(model.policy)?model.policy:{taxRatePct:Number(rules.defaultTaxRatePct||18),interestRateAnnualPct:Number(rules.defaultPolicyInterestRatePct||3)};
      model.fiscalModel=isObject(model.fiscalModel)?model.fiscalModel:{};
      model.allocations=isObject(model.allocations)?model.allocations:{};
      if(!Array.isArray(model.ledger))model.ledger=[];
    }
    return model;
  }
  function ensureStateInitialized(){
    const root=rootState();ensureObject(root,'economy');ensureObject(root,'finance');
    for(const p of profiles)if(p.economyKey&&isObject(p.sourceValues)&&!isObject(root.economy[p.economyKey]))root.economy[p.economyKey]=clone(p.sourceValues);
    for(const p of profiles)ensureFinanceState(p,root);syncAllStates();return root;
  }
  function totalReserved(model,exceptDepartment){
    let total=0;for(const [dept,a] of Object.entries(model?.allocations||{})){
      if(dept===exceptDepartment||!isObject(a))continue;total+=Math.max(0,finite(a.remainingUsd)??0);
    }return total;
  }
  function currentMetrics(p,root){
    root=root||rootState();const e=getEconomyRecord(p)||{},m=modelProfileIndicators(p,e),fm=ensureFinanceState(p,root);
    m.treasuryBalanceUsd=fm?finite(fm.treasuryBalanceUsd):null;
    m.availableTreasuryUsd=fm?Math.max(0,(finite(fm.treasuryBalanceUsd)??0)-totalReserved(fm)):null;
    m.taxRatePct=fm?finite(fm.policy?.taxRatePct):null;m.policyInterestRatePct=fm?finite(fm.policy?.interestRateAnnualPct):null;
    m.annualRevenueUsd=fm?finite(fm.fiscalModel?.annualRevenueUsd):null;
    m.annualSpendingUsd=fm?finite(fm.fiscalModel?.annualSpendingUsd):null;
    m.currentBudgetBalanceUsd=fm?finite(fm.fiscalModel?.annualBudgetBalanceUsd):m.governmentBudgetBalanceUsd;
    m.priceIndex=fm?finite(fm.priceIndex):null;return m;
  }
  function percentileMap(rows,key,transform){
    const vals=[];for(const r of rows){const v=finite(r.metrics[key]);if(v!==null)vals.push({code:r.profile.countryCode,value:transform?transform(v):v});}
    vals.sort((a,b)=>a.value-b.value);const out=new Map();let i=0;
    while(i<vals.length){let j=i+1;while(j<vals.length&&vals[j].value===vals[i].value)j++;
      const score=vals.length<2?100:Number((((i+j-1)/2)/(vals.length-1)*100).toFixed(2));
      for(let k=i;k<j;k++)out.set(vals[k].code,score);i=j;}return out;
  }
  function worldSnapshot(){
    const root=rootState(),rows=profiles.map(p=>({profile:p,metrics:currentMetrics(p,root)}));
    const gdp=percentileMap(rows,'gdpCurrentUsd'),population=percentileMap(rows,'population2015'),
      reserves=percentileMap(rows,'foreignExchangeReservesUsd'),trade=percentileMap(rows,'tradeBalanceToGdpPct');
    const ranked=rows.filter(r=>finite(r.metrics.gdpCurrentUsd)!==null)
      .sort((a,b)=>b.metrics.gdpCurrentUsd-a.metrics.gdpCurrentUsd||a.profile.name.localeCompare(b.profile.name));
    const rank=new Map(ranked.map((r,i)=>[r.profile.countryCode,i+1])),byCode=new Map();
    for(const row of rows){
      const p=row.profile,m=row.metrics,factors=[];
      if(finite(m.gdpCurrentUsd)!==null&&gdp.has(p.countryCode))factors.push([gdp.get(p.countryCode),Number(rules.influenceWeights?.gdp??.55)]);
      if(population.has(p.countryCode))factors.push([population.get(p.countryCode),Number(rules.influenceWeights?.population??.20)]);
      if(reserves.has(p.countryCode))factors.push([reserves.get(p.countryCode),Number(rules.influenceWeights?.foreignExchangeReserves??.15)]);
      if(trade.has(p.countryCode))factors.push([trade.get(p.countryCode),Number(rules.influenceWeights?.tradeBalanceToGDP??.10)]);
      const ws=factors.reduce((s,x)=>s+x[1],0);
      m.economicInfluenceIndex=finite(m.gdpCurrentUsd)!==null&&ws>0?Number((factors.reduce((s,x)=>s+x[0]*x[1],0)/ws).toFixed(2)):null;
      const risk=[];
      if(finite(m.publicDebtToGdpPct)!==null)risk.push([clamp(m.publicDebtToGdpPct/Number(rules.fiscalRiskBounds?.debtToGDPPercent||300)*100,0,100),.40]);
      if(finite(m.inflationRatePct)!==null)risk.push([clamp(Math.max(0,m.inflationRatePct)/Number(rules.fiscalRiskBounds?.inflationPercent||25)*100,0,100),.25]);
      if(finite(m.unemploymentRatePct)!==null)risk.push([clamp(Math.max(0,m.unemploymentRatePct)/Number(rules.fiscalRiskBounds?.unemploymentPercent||35)*100,0,100),.20]);
      if(finite(m.budgetBalanceToGdpPct)!==null)risk.push([clamp(Math.max(0,-m.budgetBalanceToGdpPct)/Number(rules.fiscalRiskBounds?.deficitToGDPPercent||20)*100,0,100),.15]);
      const rw=risk.reduce((s,x)=>s+x[1],0);
      m.fiscalRiskIndex=rw?Number((risk.reduce((s,x)=>s+x[0]*x[1],0)/rw).toFixed(2)):null;
      m.fiscalHealthIndex=m.fiscalRiskIndex===null?null:Number((100-m.fiscalRiskIndex).toFixed(2));
      m.gdpWorldRank=rank.get(p.countryCode)??null;m.sourceStatus=p.profileStatus;byCode.set(p.countryCode,m);
    }
    return {byCode,rows:rows.map(r=>({profile:r.profile,metrics:byCode.get(r.profile.countryCode)}))};
  }
  function safeDispatch(type,detail){try{if(typeof global.dispatchEvent==='function'&&typeof global.CustomEvent==='function')global.dispatchEvent(new global.CustomEvent(type,{detail:clone(detail)}));}catch(_){}}
  function syncEconomyRecord(p,model,root){
    const e=root.economy?.[p.economyKey]||null,debt=finite(e?.debt)??finite(p.indicators?.publicDebtUsd),
      gdp=finite(e?.gdp)??finite(p.indicators?.gdpCurrentUsd),balance=finite(model?.fiscalModel?.annualBudgetBalanceUsd);
    if(e){
      e.treasury=finite(model?.treasuryBalanceUsd)??0;if(debt!==null)e.debt=debt;if(gdp!==null)e.gdp=gdp;
      if(balance!==null)e.budget_balance=balance;
      if(finite(model?.fiscalModel?.annualRevenueUsd)!==null)e.revenue=model.fiscalModel.annualRevenueUsd;
      if(finite(model?.fiscalModel?.annualSpendingUsd)!==null)e.expenditure=model.fiscalModel.annualSpendingUsd;
      if(finite(model?.policy?.interestRateAnnualPct)!==null)e.policy_interest_rate_model_pct=model.policy.interestRateAnnualPct;
    }
    const id=p.iso3||p.countryCode;
    for(const s of stateCandidates()){
      if(s!==root&&p.economyKey&&isObject(s.economy?.[p.economyKey])){
        const other=s.economy[p.economyKey];other.treasury=finite(model?.treasuryBalanceUsd)??0;
        if(debt!==null)other.debt=debt;if(gdp!==null)other.gdp=gdp;if(balance!==null)other.budget_balance=balance;
        if(finite(model?.fiscalModel?.annualRevenueUsd)!==null)other.revenue=model.fiscalModel.annualRevenueUsd;
        if(finite(model?.fiscalModel?.annualSpendingUsd)!==null)other.expenditure=model.fiscalModel.annualSpendingUsd;
        if(finite(model?.policy?.interestRateAnnualPct)!==null)other.policy_interest_rate_model_pct=model.policy.interestRateAnnualPct;
      }
      const fb=ensureObject(ensureObject(s,'finance'),id);
      if(s!==root)fb.omegaFinance=clone(model);
      if(!isObject(fb.ministryAllocations))fb.ministryAllocations={};
      for(const [dept,a] of Object.entries(model?.allocations||{})){
        if(!own(fb.ministryAllocations,dept)||fb.ministryAllocations[dept]?.source==='OMEGA_FINANCE_MINISTRY')
          fb.ministryAllocations[dept]={allocatedUsd:a.budgetUsd,spentUsd:a.spentUsd,remainingUsd:a.remainingUsd,source:'OMEGA_FINANCE_MINISTRY'};
      }
    }
  }
  function syncAllStates(){const root=rootState();for(const p of profiles)syncEconomyRecord(p,ensureFinanceState(p,root),root);}
  function getPlayerCode(){return playerCountryProfile()?.countryCode||null;}
  function applyAction(action){
    action=isObject(action)?action:{};const type=String(action.type||'').toLowerCase().replace(/_/g,'-');
    const p=resolveProfile(action.countryId||action.countryCode||selectedCountryCode)||playerCountryProfile();
    if(!p)return {ok:false,code:'COUNTRY_NOT_FOUND',message:'Country profile is not available.'};
    if(p.countryCode!==getPlayerCode())return {ok:false,code:'PLAYER_COUNTRY_SCOPE_VIOLATION',message:'Finance commands are restricted to the active player country.'};
    if(!isPlayable(p))return {ok:false,code:'ECONOMIC_BASELINE_UNAVAILABLE',message:'No GDP baseline exists. Fiscal actions are disabled rather than fabricated.'};
    const root=rootState(),fm=ensureFinanceState(p,root),e=root.economy?.[p.economyKey]||getEconomyRecord(p);
    if(!e)return {ok:false,code:'ECONOMY_STATE_UNAVAILABLE',message:'Authoritative economy state is unavailable.'};
    let amount=finite(action.amountUsd??action.amount),result=null;
    if(type==='set-tax-rate'||type==='tax-rate'){
      const value=finite(action.value??action.ratePct);
      if(value===null||value<Number(rules.minimumTaxRatePct??0)||value>Number(rules.maximumTaxRatePct??60))return {ok:false,code:'TAX_RATE_OUT_OF_RANGE',message:'Tax rate is outside the configured game-rule limits.'};
      fm.policy.taxRatePct=value;fm.policy.taxRateSource='PLAYER_POLICY';fm.policy.revision=(finite(fm.policy.revision)||0)+1;
      fm.fiscalModel.annualRevenueUsd=(finite(e.gdp)||0)*value/100;
      fm.fiscalModel.annualBudgetBalanceUsd=fm.fiscalModel.annualRevenueUsd-(finite(fm.fiscalModel.annualSpendingUsd)||0);
      fm.revision+=1;result={ok:true,code:'TAX_RATE_UPDATED',message:'Tax policy updated. Annual revenue is a modeled projection.'};
    }else if(type==='set-interest-rate'||type==='interest-rate'){
      const value=finite(action.value??action.ratePct);
      if(value===null||value<Number(rules.minimumPolicyInterestRatePct??0)||value>Number(rules.maximumPolicyInterestRatePct??40))return {ok:false,code:'POLICY_RATE_OUT_OF_RANGE',message:'Interest rate is outside the configured game-rule limits.'};
      fm.policy.interestRateAnnualPct=value;fm.policy.interestRateSource='PLAYER_POLICY';fm.policy.revision=(finite(fm.policy.revision)||0)+1;
      fm.revision+=1;result={ok:true,code:'POLICY_RATE_UPDATED',message:'Modeled policy rate updated. Future debt-interest accrual will use it.'};
    }else if(type==='set-allocation'||type==='allocate-budget'){
      const dep=String(action.department||action.ministryId||'').toLowerCase();
      if(!DEPARTMENTS.some(x=>x[0]===dep))return {ok:false,code:'MINISTRY_INVALID',message:'Choose a supported government department.'};
      if(amount===null||amount<=0)return {ok:false,code:'ALLOCATION_AMOUNT_INVALID',message:'Allocation must be greater than zero.'};
      const prior=isObject(fm.allocations[dep])?fm.allocations[dep]:{budgetUsd:0,spentUsd:0,remainingUsd:0};
      if(amount<(finite(prior.spentUsd)||0))return {ok:false,code:'ALLOCATION_BELOW_SPENT',message:'Allocation cannot be below money already spent.'};
      const reserved=totalReserved(fm,dep),remaining=amount-(finite(prior.spentUsd)||0),cash=finite(fm.treasuryBalanceUsd)||0;
      if(reserved+remaining>cash)return {ok:false,code:'INSUFFICIENT_UNCOMMITTED_TREASURY',message:'Insufficient uncommitted treasury. Release another allocation or reduce this amount.'};
      fm.allocations[dep]={department:dep,budgetUsd:amount,spentUsd:finite(prior.spentUsd)||0,remainingUsd:remaining,updatedTurn:currentTurn(),source:'PLAYER_ALLOCATION'};
      fm.revision+=1;result={ok:true,code:'BUDGET_ALLOCATED',message:'Department budget ceiling reserved; funds have not yet been spent.'};
    }else if(type==='spend-budget'||type==='spend'||type==='pay-expense'){
      const dep=String(action.department||action.ministryId||'').toLowerCase(),category=String(action.spendType||action.category||'general').toLowerCase();
      const validTypes=['salary','purchase','maintenance','general'],a=fm.allocations[dep];
      if(!DEPARTMENTS.some(x=>x[0]===dep))return {ok:false,code:'MINISTRY_INVALID',message:'Choose a supported government department.'};
      if(!validTypes.includes(category))return {ok:false,code:'EXPENSE_CATEGORY_INVALID',message:'Expense must be salary, purchase, maintenance or general.'};
      if(amount===null||amount<=0)return {ok:false,code:'EXPENSE_AMOUNT_INVALID',message:'Expense amount must be greater than zero.'};
      if(!isObject(a))return {ok:false,code:'BUDGET_ALLOCATION_REQUIRED',message:'Allocate a department budget before spending.'};
      if(amount>(finite(a.remainingUsd)||0))return {ok:false,code:'ALLOCATION_LIMIT_EXCEEDED',message:'Expense exceeds the department budget remaining.'};
      if(amount>(finite(fm.treasuryBalanceUsd)||0))return {ok:false,code:'INSUFFICIENT_TREASURY',message:'Insufficient treasury; expense rejected.'};
      a.spentUsd=(finite(a.spentUsd)||0)+amount;a.remainingUsd=(finite(a.remainingUsd)||0)-amount;fm.treasuryBalanceUsd-=amount;
      fm.ledger.push({turn:currentTurn(),countryCode:p.countryCode,department:dep,action:'EXPENSE',category,amountUsd:amount,
        description:String(action.description||'').slice(0,160),balanceAfterUsd:fm.treasuryBalanceUsd});
      fm.revision+=1;result={ok:true,code:'EXPENSE_POSTED',message:'Expense posted and charged to the department allocation.'};
    }else if(type==='borrow'||type==='take-loan'){
      if(amount===null||amount<=0)return {ok:false,code:'LOAN_AMOUNT_INVALID',message:'Loan principal must be greater than zero.'};
      const gdp=finite(e.gdp)||0,debt=finite(e.debt)||0;
      if(amount>gdp*Number(rules.maximumBorrowTransactionPercentOfGDP??5)/100)return {ok:false,code:'LOAN_TRANSACTION_LIMIT',message:'Loan exceeds the configured per-transaction GDP limit.'};
      if(debt+amount>gdp*Number(rules.maximumDebtToGDPForNewBorrowingPct??300)/100)return {ok:false,code:'DEBT_CEILING_REACHED',message:'Loan rejected by the modeled debt-to-GDP ceiling.'};
      e.debt=debt+amount;fm.treasuryBalanceUsd=(finite(fm.treasuryBalanceUsd)||0)+amount;
      fm.cumulativeBorrowingUsd=(finite(fm.cumulativeBorrowingUsd)||0)+amount;
      fm.ledger.push({turn:currentTurn(),countryCode:p.countryCode,department:'finance',action:'BORROW',category:'sovereign_debt',
        amountUsd:amount,description:String(action.description||'Sovereign borrowing').slice(0,160),balanceAfterUsd:fm.treasuryBalanceUsd});
      fm.revision+=1;result={ok:true,code:'BORROW_POSTED',message:'Loan posted to treasury and national debt. Interest accrues in future simulation turns.'};
    }else return {ok:false,code:'UNKNOWN_FINANCE_ACTION',message:'Unknown Finance Ministry command.'};
    fm.ledger=fm.ledger.slice(-Number(rules.maximumLedgerEntries||500));syncEconomyRecord(p,fm,root);
    safeDispatch('OMEGA_FINANCE_STATE_UPDATED',{countryCode:p.countryCode,action:type,turn:currentTurn(),revision:fm.revision});
    return Object.assign(result,{countryCode:p.countryCode,treasuryBalanceUsd:fm.treasuryBalanceUsd,revision:fm.revision});
  }
  function recalculateFiscal(p,fm,e){
    const gdp=finite(e?.gdp)??finite(p.indicators?.gdpCurrentUsd);if(gdp===null||gdp<=0)return;
    fm.fiscalModel.annualRevenueUsd=gdp*(finite(fm.policy?.taxRatePct)??Number(rules.defaultTaxRatePct||18))/100;
    fm.fiscalModel.annualSpendingUsd=gdp*(finite(fm.fiscalModel.spendingToGdpPct)??0)/100;
    fm.fiscalModel.annualBudgetBalanceUsd=fm.fiscalModel.annualRevenueUsd-fm.fiscalModel.annualSpendingUsd;
  }
  function advanceTurn(turn,stepDurationMs){
    if(!initialized)return {ok:false,reason:'NOT_INITIALIZED',processed:0};
    const turnNumber=finite(turn)??currentTurn()+1,dt=Math.max(0,finite(stepDurationMs)??Number(rules.simulationTurnDurationMs||HOUR_MS));
    const years=dt/Number(rules.annualizationMs||YEAR_MS);if(years<=0)return {ok:true,turn:turnNumber,processed:0};
    const root=rootState();let processed=0;
    for(const p of profiles){
      if(!isPlayable(p))continue;const fm=ensureFinanceState(p,root);
      if(finite(fm.lastProcessedTurn)!==null&&turnNumber<=fm.lastProcessedTurn)continue;
      const e=root.economy?.[p.economyKey]||getEconomyRecord(p);if(!isObject(e))continue;
      const gdpBefore=finite(e.gdp)??finite(p.indicators?.gdpCurrentUsd);if(gdpBefore===null||gdpBefore<=0)continue;
      const growth=clamp(finite(e.gdp_growth)??finite(p.indicators?.gdpGrowthPct)??0,-99,100);
      const gdpAfter=Math.max(0,gdpBefore*Math.pow(1+growth/100,years));e.gdp=gdpAfter;
      const debtBefore=Math.max(0,finite(e.debt)??finite(p.indicators?.publicDebtUsd)??0);
      const rate=clamp(finite(fm.policy?.interestRateAnnualPct)??Number(rules.defaultPolicyInterestRatePct||3),0,100);
      const interest=debtBefore*(Math.pow(1+rate/100,years)-1),debtAfter=debtBefore+interest;
      recalculateFiscal(p,fm,e);
      const income=(finite(fm.fiscalModel.annualRevenueUsd)||0)*years,expenses=(finite(fm.fiscalModel.annualSpendingUsd)||0)*years;
      const cash=(finite(fm.treasuryBalanceUsd)||0)+income-expenses-interest;
      fm.treasuryBalanceUsd=Math.max(0,cash);
      fm.cumulativeRevenueUsd=(finite(fm.cumulativeRevenueUsd)||0)+income;
      fm.cumulativeSpendingUsd=(finite(fm.cumulativeSpendingUsd)||0)+expenses;
      fm.cumulativeInterestUsd=(finite(fm.cumulativeInterestUsd)||0)+interest;
      const inflation=finite(e.inflation)??finite(p.indicators?.inflationRatePct)??0;
      fm.priceIndex=(finite(fm.priceIndex)||100)*Math.pow(Math.max(.0001,1+inflation/100),years);
      fm.lastProcessedTurn=turnNumber;fm.revision=(finite(fm.revision)||0)+1;
      e.debt=debtAfter;e.budget_balance=fm.fiscalModel.annualBudgetBalanceUsd;
      e.revenue=fm.fiscalModel.annualRevenueUsd;e.expenditure=fm.fiscalModel.annualSpendingUsd;
      syncEconomyRecord(p,fm,root);processed+=1;
    }
    safeDispatch('OMEGA_FINANCE_STATE_UPDATED',{countryCode:getPlayerCode(),turn:turnNumber,processed,revision:VERSION});
    refreshVisibleMetrics();return {ok:true,turn:turnNumber,processed};
  }
  function departmentOptions(selected){return DEPARTMENTS.map(d=>'<option value="'+escapeHTML(d[0])+'"'+(selected===d[0]?' selected':'')+'>'+escapeHTML(d[1])+'</option>').join('');}
  function metricCard(label,value,key,sub){return '<article class="ofm-kpi"><div class="ofm-kpi-label">'+escapeHTML(label)+'</div><div class="ofm-kpi-value"'+(key?' data-ofm-live="'+escapeHTML(key)+'"':'')+'>'+escapeHTML(value)+'</div><div class="ofm-kpi-sub">'+escapeHTML(sub||'')+'</div></article>';}
  function renderCountryOptions(){return profiles.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>'<option value="'+escapeHTML(p.countryCode)+'"'+(selectedCountryCode===p.countryCode?' selected':'')+'>'+escapeHTML(p.name)+' ('+escapeHTML(p.iso3)+')'+(p.profileStatus==='UNAVAILABLE'?' · DATA N/A':'')+'</option>').join('');}
  function renderAllocationRows(fm){
    const keys=Object.keys(fm?.allocations||{});if(!keys.length)return '<tr><td colspan="5" class="ofm-empty">No department budgets allocated.</td></tr>';
    return keys.sort().map(key=>{const a=fm.allocations[key],d=DEPARTMENTS.find(x=>x[0]===key);
      return '<tr><td>'+escapeHTML(d?d[1]:key)+'</td><td>'+fmtMoney(a.budgetUsd)+'</td><td>'+fmtMoney(a.spentUsd)+'</td><td>'+fmtMoney(a.remainingUsd)+'</td><td>'+escapeHTML(String(a.updatedTurn??'—'))+'</td></tr>';}).join('');
  }
  function renderLedgerRows(fm){
    const rows=(fm?.ledger||[]).slice(-12).reverse();if(!rows.length)return '<tr><td colspan="5" class="ofm-empty">No transactions recorded.</td></tr>';
    return rows.map(x=>'<tr><td>'+escapeHTML(String(x.turn??'—'))+'</td><td>'+escapeHTML(String(x.action||''))+'</td><td>'+escapeHTML(String(x.department||''))+'</td><td>'+fmtMoney(x.amountUsd)+'</td><td>'+escapeHTML(String(x.category||x.description||''))+'</td></tr>').join('');
  }
  function topCountryRows(rows,count){return rows.filter(r=>finite(r.metrics.gdpCurrentUsd)!==null).sort((a,b)=>b.metrics.gdpCurrentUsd-a.metrics.gdpCurrentUsd).slice(0,count);}
  function renderTopRows(rows){const hits=topCountryRows(rows,12);if(!hits.length)return '<tr><td colspan="4" class="ofm-empty">GDP data unavailable.</td></tr>';
    return hits.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+escapeHTML(r.profile.name)+'</td><td>'+fmtMoney(r.metrics.gdpCurrentUsd)+'</td><td>'+fmtNumber(r.metrics.economicInfluenceIndex,1)+'</td></tr>').join('');}
  function renderFullWorldTable(rows){
    const sorted=rows.slice().sort((a,b)=>{const x=finite(a.metrics.gdpCurrentUsd),y=finite(b.metrics.gdpCurrentUsd);if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;return (y||0)-(x||0)||a.profile.name.localeCompare(b.profile.name);});
    return '<div class="ofm-table-scroll"><table class="ofm-table"><thead><tr><th>GDP rank</th><th>Country / area</th><th>GDP (USD)</th><th>Growth</th><th>Inflation</th><th>Unemployment</th><th>Debt / GDP</th><th>Budget balance</th><th>Trade balance</th><th>FX reserves</th><th>Economic influence</th><th>Fiscal risk</th><th>Data status</th></tr></thead><tbody>'+
      sorted.map(r=>'<tr><td>'+escapeHTML(r.metrics.gdpWorldRank??'—')+'</td><td>'+escapeHTML(r.profile.name)+'</td><td>'+fmtMoney(r.metrics.gdpCurrentUsd)+'</td><td>'+fmtPct(r.metrics.gdpGrowthPct)+'</td><td>'+fmtPct(r.metrics.inflationRatePct)+'</td><td>'+fmtPct(r.metrics.unemploymentRatePct)+'</td><td>'+fmtPct(r.metrics.publicDebtToGdpPct)+'</td><td>'+fmtMoney(r.metrics.currentBudgetBalanceUsd??r.metrics.governmentBudgetBalanceUsd)+'</td><td>'+fmtMoney(r.metrics.tradeBalanceUsd)+'</td><td>'+fmtMoney(r.metrics.foreignExchangeReservesUsd)+'</td><td>'+fmtNumber(r.metrics.economicInfluenceIndex,1)+'</td><td>'+fmtNumber(r.metrics.fiscalRiskIndex,1)+'</td><td>'+escapeHTML(r.profile.profileStatus)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  function dashboardHTML(p,m,fm,rows,notice){
    const player=playerCountryProfile(),isPlayer=!!player&&player.countryCode===p.countryCode,editable=isPlayer&&isPlayable(p),disabled=editable?'':' disabled';
    const status=isPlayable(p)?'ACTIVE GAME MODEL':'ECONOMIC BASELINE UNAVAILABLE';
    const balance=m.currentBudgetBalanceUsd??m.governmentBudgetBalanceUsd,cash=fm?fm.treasuryBalanceUsd:null;
    const freeCash=fm?Math.max(0,(finite(cash)||0)-totalReserved(fm)):null;
    let out='<div class="ofm-dashboard" data-ofm-root><div class="ofm-hero"><div><div class="ofm-eyebrow">OMEGA / SOVEREIGN FISCAL SYSTEM</div><h2>Finance Ministry</h2><p>National accounts, monetary policy, debt service and controlled government spending.</p></div><div class="ofm-status">'+escapeHTML(status)+'</div></div>';
    out+='<div class="ofm-toolbar"><label for="ofm-country-select">Country profile</label><select id="ofm-country-select">'+renderCountryOptions()+'</select><span class="ofm-baseline">Reference baseline: 2015 · USD unless stated</span></div>';
    if(notice)out+='<div class="ofm-notice '+(notice.ok?'is-ok':'is-error')+'" role="status">'+escapeHTML(notice.message||'')+'</div>';
    if(!isPlayer)out+='<div class="ofm-readonly">READ-ONLY PROFILE. Financial controls apply only to the active player country ('+escapeHTML(player?.name||'not selected')+').</div>';
    if(p.profileStatus==='UNAVAILABLE')out+='<div class="ofm-warning">No matching economy baseline exists for this country/area. Missing statistics remain unavailable and financial actions are disabled.</div>';
    else if(p.profileStatus==='PARTIAL_LOCAL_BASELINE')out+='<div class="ofm-warning">Partial baseline data. Derived indicators appear only where their source values exist.</div>';
    out+='<section class="ofm-kpi-grid">'+
      metricCard('GDP (current USD)',fmtMoney(m.gdpCurrentUsd),'gdpCurrentUsd','Local baseline; runtime growth applied')+
      metricCard('Annual GDP growth',fmtPct(m.gdpGrowthPct),'gdpGrowthPct','Annualized baseline rate')+
      metricCard('Inflation rate',fmtPct(m.inflationRatePct),'inflationRatePct','Price index compounds each turn')+
      metricCard('Public debt / GDP',fmtPct(m.publicDebtToGdpPct),'publicDebtToGdpPct','Derived ratio')+
      metricCard('Economic influence index',fmtNumber(m.economicInfluenceIndex,1),'economicInfluenceIndex','Custom game index; 0–100')+
      metricCard('Fiscal risk index',fmtNumber(m.fiscalRiskIndex,1),'fiscalRiskIndex','Higher means higher modeled risk')+
      metricCard('Treasury balance',fmtMoney(cash),'treasuryBalanceUsd',fm?.treasurySource||'Unavailable')+
      metricCard('Uncommitted treasury',fmtMoney(freeCash),'availableTreasuryUsd','Cash not reserved for ministry budgets')+'</section>';
    out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Macroeconomic indicators</h3><span>Baseline values plus derived ratios</span></div><div class="ofm-indicator-grid">';
    const cells=[
      ['Global GDP rank',m.gdpWorldRank===null?'N/A':'#'+m.gdpWorldRank],['GDP per capita',fmtMoney(m.gdpPerCapitaUsd)],
      ['National debt',fmtMoney(m.publicDebtUsd)],['Budget balance (annualized)',fmtMoney(balance)],
      ['Budget balance / GDP',fmtPct(m.budgetBalanceToGdpPct)],['Trade balance',fmtMoney(m.tradeBalanceUsd)],
      ['Trade balance / GDP',fmtPct(m.tradeBalanceToGdpPct)],['Foreign-exchange reserves',fmtMoney(m.foreignExchangeReservesUsd)],
      ['FX reserves / GDP',fmtPct(m.reservesToGdpPct)],['Debt per capita',fmtMoney(m.debtPerCapitaUsd)],
      ['Unemployment rate',fmtPct(m.unemploymentRatePct)],['Exchange rate (local / USD)',m.exchangeRateLocalPerUsd===null?'N/A':fmtNumber(m.exchangeRateLocalPerUsd,4)],
      ['Modeled policy interest rate',fm?fmtPct(fm.policy?.interestRateAnnualPct):'N/A'],['Modeled tax rate',fm?fmtPct(fm.policy?.taxRatePct):'N/A'],
      ['Modeled annual revenue',fmtMoney(fm?.fiscalModel?.annualRevenueUsd)],['Modeled annual expenditure',fmtMoney(fm?.fiscalModel?.annualSpendingUsd)],
      ['Price index (100 at start)',fmtNumber(fm?.priceIndex,3)],['Fiscal health index',fmtNumber(m.fiscalHealthIndex,1)]
    ];
    out+=cells.map(x=>'<div class="ofm-indicator"><span>'+escapeHTML(x[0])+'</span><strong>'+escapeHTML(x[1])+'</strong></div>').join('');
    out+='</div><p class="ofm-data-note">Policy rate, tax rate, revenue, expenditure and opening treasury are game-model values unless a runtime value already existed. They are not verified real-world statistics.</p></section>';
    if(editable){
      out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Fiscal and monetary policy</h3><span>Changes affect future simulation turns</span></div><div class="ofm-action-grid">';
      out+='<form class="ofm-form" data-ofm-action="set-tax-rate"><h4>Set tax policy</h4><label>Tax rate (%)<input type="number" name="value" min="'+Number(rules.minimumTaxRatePct??0)+'" max="'+Number(rules.maximumTaxRatePct??60)+'" step="0.1" value="'+escapeHTML(String(fm.policy.taxRatePct))+'" required></label><p>Updates modeled annual revenue and fiscal balance.</p><button type="submit">Apply tax rate</button></form>';
      out+='<form class="ofm-form" data-ofm-action="set-interest-rate"><h4>Set policy interest rate</h4><label>Annual rate (%)<input type="number" name="value" min="'+Number(rules.minimumPolicyInterestRatePct??0)+'" max="'+Number(rules.maximumPolicyInterestRatePct??40)+'" step="0.1" value="'+escapeHTML(String(fm.policy.interestRateAnnualPct))+'" required></label><p>Updates future modeled interest on public debt.</p><button type="submit">Apply policy rate</button></form></div></section>';
      out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Department budget allocation</h3><span>Allocation reserves cash; it does not spend it</span></div>';
      out+='<form class="ofm-form ofm-form-wide" data-ofm-action="set-allocation"><label>Department<select name="department">'+departmentOptions('interior')+'</select></label><label>Total budget ceiling (USD)<input type="number" name="amountUsd" min="1" step="1" placeholder="e.g. 3000000" required></label><button type="submit">Reserve department budget</button></form>';
      out+='<div class="ofm-table-scroll"><table class="ofm-table"><thead><tr><th>Department</th><th>Allocated</th><th>Spent</th><th>Remaining</th><th>Updated turn</th></tr></thead><tbody>'+renderAllocationRows(fm)+'</tbody></table></div></section>';
      out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Execute a funded expense</h3><span>Insufficient funds or allocation causes rejection</span></div>';
      out+='<form class="ofm-form ofm-form-wide" data-ofm-action="spend-budget"><label>Department<select name="department">'+departmentOptions('interior')+'</select></label><label>Expense type<select name="spendType"><option value="salary">Salary</option><option value="purchase">Purchase / procurement</option><option value="maintenance">Repair / maintenance</option><option value="general">General expense</option></select></label><label>Amount (USD)<input type="number" name="amountUsd" min="1" step="1" placeholder="e.g. 4000000" required></label><label>Purpose<input type="text" name="description" maxlength="160" placeholder="Salary, vehicles, repairs" required></label><button type="submit">Execute payment</button></form></section>';
      out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Sovereign borrowing</h3><span>Debt ceilings and interest accrual apply</span></div>';
      out+='<form class="ofm-form ofm-form-wide" data-ofm-action="borrow"><label>Loan principal (USD)<input type="number" name="amountUsd" min="1" step="1" placeholder="e.g. 500000000" required></label><label>Purpose<input type="text" name="description" maxlength="160" placeholder="Emergency financing / infrastructure" required></label><button type="submit">Issue sovereign loan</button><p class="ofm-data-note">Loan size and national debt are checked against configured limits.</p></form></section>';
    }else out+='<section class="ofm-section"><h3>Finance controls locked</h3><p>Fiscal commands are enabled only for the selected player country.</p></section>';
    out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Recent financial ledger</h3><span>Last 12 transactions</span></div><div class="ofm-table-scroll"><table class="ofm-table"><thead><tr><th>Turn</th><th>Action</th><th>Department</th><th>Amount</th><th>Category / purpose</th></tr></thead><tbody>'+renderLedgerRows(fm)+'</tbody></table></div></section>';
    out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Largest economies in this baseline</h3><span>Ranked by available GDP</span></div><div class="ofm-table-scroll"><table class="ofm-table"><thead><tr><th>Rank</th><th>Country</th><th>GDP</th><th>Influence</th></tr></thead><tbody>'+renderTopRows(rows)+'</tbody></table></div></section>';
    out+='<details class="ofm-section ofm-world-register" id="ofm-world-register"><summary>GLOBAL ECONOMIC REGISTER · '+profiles.length+' COUNTRY / AREA PROFILES</summary><p class="ofm-data-note">Missing values show N/A. Baseline values and modeled values are intentionally distinguished.</p><div id="ofm-world-register-content"><span class="ofm-empty">Expand to render the full register.</span></div></details></div>';
    return out;
  }
  function renderDashboard(ministryId,notice){
    const p=viewedCountryProfile();if(!p)return false;
    const modal=global.document?.getElementById?.('ministry-dashboard-view'),content=global.document?.getElementById?.('ministry-dashboard-content');
    if(!content)return false;
    const root=rootState(),fm=ensureFinanceState(p,root),snap=worldSnapshot(),m=snap.byCode.get(p.countryCode)||currentMetrics(p,root);
    if(modal){modal.className='omega-modal theme-finance';modal.style.display='flex';}
    const crumb=global.document.getElementById('dash-crumb-title'),status=global.document.getElementById('dash-layer-status');
    if(crumb)crumb.textContent='WORLD / '+p.name+' / FINANCE MINISTRY';
    if(status)status.textContent='FINANCE & TREASURY CONTROL ROOM';
    if(global.OmegaCabinetUI)global.OmegaCabinetUI.currentDashboardMinistryId='treasury_finance';
    content.innerHTML=dashboardHTML(p,m,fm,snap.rows,notice);uiContainer=content;bindDashboardEvents(content);return true;
  }
  function bindDashboardEvents(content){
    if(!content||content.__omegaFinanceBound)return;content.__omegaFinanceBound=true;
    content.addEventListener('change',function(event){
      if(event.target&&event.target.id==='ofm-country-select'){selectedCountryCode=event.target.value;renderDashboard('finance');}
    });
    content.addEventListener('submit',function(event){
      const form=event.target,action=form?.getAttribute?.('data-ofm-action');if(!action)return;
      event.preventDefault();const payload={type:action,countryId:selectedCountryCode||getPlayerCode()};
      for(const el of Array.from(form.elements||[]))if(el.name)payload[el.name]=el.value;
      if(payload.amountUsd!==undefined)payload.amountUsd=finite(payload.amountUsd);
      if(payload.value!==undefined)payload.value=finite(payload.value);
      renderDashboard('finance',applyAction(payload));
    });
    content.addEventListener('click',function(event){
      const summary=event.target?.closest?.('#ofm-world-register > summary');if(!summary)return;
      const holder=content.querySelector('#ofm-world-register-content');
      if(holder&&holder.dataset.loaded!=='true')setTimeout(function(){
        const details=content.querySelector('#ofm-world-register');
        if(details&&details.open){holder.innerHTML=renderFullWorldTable(worldSnapshot().rows);holder.dataset.loaded='true';}
      },0);
    });
  }
  function refreshVisibleMetrics(){
    const content=uiContainer||global.document?.getElementById?.('ministry-dashboard-content');if(!content||!content.querySelectorAll)return;
    const p=viewedCountryProfile();if(!p)return;const m=worldSnapshot().byCode.get(p.countryCode);if(!m)return;
    const vals={gdpCurrentUsd:fmtMoney(m.gdpCurrentUsd),gdpGrowthPct:fmtPct(m.gdpGrowthPct),inflationRatePct:fmtPct(m.inflationRatePct),
      publicDebtToGdpPct:fmtPct(m.publicDebtToGdpPct),economicInfluenceIndex:fmtNumber(m.economicInfluenceIndex,1),
      fiscalRiskIndex:fmtNumber(m.fiscalRiskIndex,1),treasuryBalanceUsd:fmtMoney(m.treasuryBalanceUsd),availableTreasuryUsd:fmtMoney(m.availableTreasuryUsd)};
    for(const n of content.querySelectorAll('[data-ofm-live]')){const k=n.getAttribute('data-ofm-live');if(own(vals,k))n.textContent=vals[k];}
  }
  function isFinanceMinistryId(id){return ['finance','treasury_finance','central_bank','taxes','finance_ministry','ministry_of_finance'].includes(String(id||'').toLowerCase().replace(/[\s-]+/g,'_'));}
  function attachUiBridge(){
    if(uiHooksAttached)return;uiHooksAttached=true;
    global.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',function(event){
      const d=event?.detail||{},turn=finite(d.simulationTurn)??finite(d.payload?.turn)??finite(d.turn);
      const duration=finite(global.Omega?.Simulation?.clock?.stepDurationMs)??Number(rules.simulationTurnDurationMs||HOUR_MS);
      advanceTurn(turn,duration);
    });
    global.addEventListener?.('OMEGA_READY',function(){if(!initialized)init().catch(error=>console.error('[OMEGA FINANCE INIT]',error));});
    global.addEventListener?.('MINISTRY_SELECTED',function(event){const d=event?.detail||{};const id=d.ministryId||d.id||d.ministry;if(isFinanceMinistryId(id))renderDashboard(id);});
    global.document?.addEventListener?.('click',function(event){
      const target=event.target?.closest?.('[data-ministry-id],[data-ministry]');if(!target)return;
      const id=target.getAttribute('data-ministry-id')||target.getAttribute('data-ministry');if(!isFinanceMinistryId(id))return;
      setTimeout(function(){renderDashboard(id);},0);
    },true);
    const cabinet=global.OmegaCabinetUI;
    if(cabinet&&typeof cabinet.renderMinistryDashboard==='function'&&!cabinet.renderMinistryDashboard.__omegaFinanceWrapped){
      const original=cabinet.renderMinistryDashboard;
      const wrapped=function(id){if(isFinanceMinistryId(id))return renderDashboard(id);return original.apply(this,arguments);};
      wrapped.__omegaFinanceWrapped=true;cabinet.renderMinistryDashboard=wrapped;
    }
  }
  async function init(){
    if(initialized)return diagnostics();if(initPromise)return initPromise;
    initPromise=(async function(){
      const data=await fetchJSON('economy_global_profiles_v1.json');
      if(!Array.isArray(data?.countries)||!data.countries.length)throw new Error('ECONOMIC_PROFILE_REGISTRY_INVALID');
      profiles=data.countries;
      const loadedRules=await fetchJSON('finance_runtime_rules_v1.json').catch(()=>null);
      if(isObject(loadedRules))rules=Object.assign({},JSON.parse(JSON.stringify(BASE_RULES)),loadedRules);
      indexProfiles();const player=playerCountryProfile();selectedCountryCode=selectedCountryCode||(player&&player.countryCode)||'US';
      ensureStateInitialized();initialized=true;attachUiBridge();
      global.Omega=global.Omega||{};global.Omega.FinanceMinistry=api;global.OMEGA_FINANCE_DIAGNOSTICS=diagnostics;
      safeDispatch('OMEGA_FINANCE_RUNTIME_READY',diagnostics());return diagnostics();
    })();
    try{return await initPromise;}finally{if(!initialized)initPromise=null;}
  }
  function diagnostics(){const root=rootState();return {version:VERSION,initialized,profileCount:profiles.length,
    economicProfiles:profiles.filter(p=>!!p.sourceValues).length,profilesWithGDP:profiles.filter(p=>finite(p.indicators?.gdpCurrentUsd)!==null).length,
    dataUnavailable:profiles.filter(p=>p.profileStatus==='UNAVAILABLE').length,playerCountryCode:getPlayerCode(),simulationTurn:currentTurn(),
    activeCountryCode:selectedCountryCode,hasAuthoritativeEconomy:isObject(root.economy),hasFinanceState:isObject(root.finance),
    transactionTypes:['set-tax-rate','set-interest-rate','set-allocation','spend-budget','borrow']};}
  const api={VERSION,init,diagnostics,resolveCountry:resolveProfile,getProfiles:()=>profiles.slice(),getPlayerCountry:playerCountryProfile,
    getIndicators:function(v){const p=resolveProfile(v)||playerCountryProfile();return p?worldSnapshot().byCode.get(p.countryCode)||null:null;},
    getFinanceState:function(v){const p=resolveProfile(v)||playerCountryProfile();return p?clone(ensureFinanceState(p,rootState())):null;},
    selectCountry:function(v){const p=resolveProfile(v);if(!p)return {ok:false,code:'COUNTRY_NOT_FOUND'};selectedCountryCode=p.countryCode;renderDashboard('finance');return {ok:true,countryCode:p.countryCode};},
    applyAction,advanceTurn,renderDashboard,isFinanceMinistryId};
  global.OmegaFinanceMinistry=api;
  if(global.document){
    global.addEventListener?.('load',function(){init().catch(error=>console.error('[OMEGA FINANCE INIT]',error));},{once:true});
    global.addEventListener?.('OMEGA_READY',function(){init().catch(error=>console.error('[OMEGA FINANCE INIT]',error));},{once:true});
    if(global.document.readyState==='complete'||global.document.readyState==='interactive')Promise.resolve().then(()=>init().catch(()=>{}));
    else global.document.addEventListener?.('DOMContentLoaded',function(){init().catch(()=>{});},{once:true});
  }
})(typeof window!=='undefined'?window:globalThis);
