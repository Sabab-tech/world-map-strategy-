/* OMEGA GLOBAL FINANCE MINISTRY + MACROECONOMIC RUNTIME v1.0.0 */
(function(global){
  'use strict';
  if(global.OmegaFinanceMinistry&&global.OmegaFinanceMinistry.VERSION==='1.1.0')return;
  const VERSION='1.1.0', YEAR_MS=31536000000, DAY_MS=86400000;
  const BASE_RULES={annualizationMs:YEAR_MS,simulationTurnDurationMs:DAY_MS,startingTreasuryPercentOfGDP:2,
    defaultTaxRatePct:18,defaultPolicyInterestRatePct:3,defaultDeficitPercentOfGDPWhenUnobserved:3,
    minimumTaxRatePct:0,maximumTaxRatePct:60,minimumPolicyInterestRatePct:0,maximumPolicyInterestRatePct:40,
    maximumBorrowTransactionPercentOfGDP:5,maximumDebtToGDPForNewBorrowingPct:300,maximumLedgerEntries:500,
    influenceWeights:{gdp:.55,population:.20,foreignExchangeReserves:.15,tradeBalanceToGDP:.10},
    fiscalRiskBounds:{debtToGDPPercent:300,inflationPercent:25,unemploymentPercent:35,deficitToGDPPercent:20}};
  let DEPARTMENTS=[
    ['cabinet','Executive Cabinet'],['defense','Defense'],['military','Military'],['interior','Home / Interior'],
    ['health','Health'],['education','Education'],['resource','Resources'],['transport','Transport'],['technology','Technology'],
    ['projects','Government Projects'],['foreign','Foreign Affairs'],['trade','Trade'],['economy','Economy'],
    ['statistics','Statistics'],['culture','Culture'],['finance','Finance']
  ];
  let sectorRegistry={schemaVersion:'0.0.0',budgetSectors:[],economicSectors:[],revenueStreams:[]};
  let profiles=[],byCountryId=new Map(),rules=JSON.parse(JSON.stringify(BASE_RULES)),initialized=false,initPromise=null;
  let selectedCountryCode=null,uiHooksAttached=false,uiContainer=null,activeTab='overview';
  const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  function finite(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);return null;}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function clone(v){if(v===undefined)return undefined;try{return JSON.parse(JSON.stringify(v));}catch(_){return v;}}
  function norm(v){return String(v==null?'':v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' AND ').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');}
  function escapeHTML(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function fmtMoney(v){
  const n=finite(v);if(n===null)return 'N/A';
  const abs=Math.abs(n);
  const scale=abs>=1e12?{value:1e12,label:'trillion'}:abs>=1e9?{value:1e9,label:'billion'}:abs>=1e6?{value:1e6,label:'million'}:abs>=1e3?{value:1e3,label:'thousand'}:null;
  if(scale){
    let amount;
    try{amount=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(abs/scale.value);}
    catch(_){amount=(abs/scale.value).toFixed(2).replace(/\.?0+$/,'');}
    return (n<0?'-':'')+'$'+amount+' '+scale.label;
  }
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);}
  catch(_){return (n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0});}
}
  function fmtNumber(v,digits){const n=finite(v);return n===null?'N/A':n.toLocaleString('en-US',{maximumFractionDigits:digits===undefined?2:digits});}
  function fmtPct(v){const n=finite(v);return n===null?'N/A':n.toFixed(2)+'%';}
  function ensureObject(parent,key){if(!isObject(parent[key]))parent[key]={};return parent[key];}
  function financeBucketFor(state,profile,create){
    if(!isObject(state)||!profile)return null;
    const finance=isObject(state.finance)?state.finance:(create?ensureObject(state,'finance'):null);
    if(!finance)return null;
    const keys=[profile.iso3,profile.countryCode,profile.economyKey,norm(profile.name)].filter(Boolean).map(String);
    for(const key of keys)if(isObject(finance[key]))return finance[key];
    if(!create)return null;
    return ensureObject(finance,profile.iso3||profile.countryCode);
  }
  function observedFinanceCash(profile,root){
    const candidates=[root,...stateCandidates().filter(s=>s!==root)];
    for(const state of candidates){
      const cash=finite(financeBucketFor(state,profile,false)?.available);
      if(cash!==null)return Math.max(0,cash);
    }
    return null;
  }
  function reconcileExternalTreasury(profile,model,root){
    if(!profile||!model)return false;
    root=root||rootState();
    const available=finite(financeBucketFor(root,profile,false)?.available);
    const last=finite(model.lastSyncedTreasuryBalanceUsd);
    if(available===null||last===null||Math.abs(available-last)<=0.0001)return false;
    const delta=available-last;
    model.treasuryBalanceUsd=Math.max(0,available);
    model.treasurySource='EXISTING_RUNTIME_FINANCE_AVAILABLE';
    if(Math.abs(delta)>0.01){
      const incoming=delta>0;
      const absAmount=Math.abs(delta);
      model.cumulativeExternalInflowUsd=(finite(model.cumulativeExternalInflowUsd)||0)+(incoming?absAmount:0);
      model.cumulativeExternalOutflowUsd=(finite(model.cumulativeExternalOutflowUsd)||0)+(incoming?0:absAmount);
      model.currentYearExternalInflowUsd=(finite(model.currentYearExternalInflowUsd)||0)+(incoming?absAmount:0);
      model.currentYearExternalOutflowUsd=(finite(model.currentYearExternalOutflowUsd)||0)+(incoming?0:absAmount);
      if(!Array.isArray(model.ledger))model.ledger=[];
      model.ledger.push({turn:currentTurn(),countryCode:profile.countryCode,department:'external-runtime',
        action:incoming?'EXTERNAL_TREASURY_CREDIT':'EXTERNAL_TREASURY_DEBIT',category:'unclassified_external_cashflow',
        amountUsd:absAmount,balanceAfterUsd:available,source:'EXISTING_GAME_SUBSYSTEM',description:incoming?'Cash received from another game subsystem':'Cash spent by another game subsystem'});
      model.ledger=model.ledger.slice(-Number(rules.maximumLedgerEntries||500));
    }
    model.lastSyncedTreasuryBalanceUsd=available;
    return true;
  }
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
  function viewedCountryProfile(){
    const contextual=resolveProfile(global.OmegaMinistryViewCountry);
    if(contextual){selectedCountryCode=contextual.countryCode;return contextual;}
    return resolveProfile(selectedCountryCode)||playerCountryProfile();
  }
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
  function budgetSectorById(id){return (sectorRegistry.budgetSectors||[]).find(s=>s.id===String(id))||null;}
  function initializeSectorAllocations(model){
    if(!model)return;
    if(!isObject(model.allocations))model.allocations={};
    const sectors=Array.isArray(sectorRegistry.budgetSectors)?sectorRegistry.budgetSectors:[];
    if(!sectors.length)return;
    const envelope=Math.max(0,finite(model.fiscalModel?.annualSpendingUsd)??0);
    let present=[];
    for(const s of sectors){
      const a=model.allocations[s.id];
      if(!isObject(a))continue;
      let share=finite(a.sharePct);
      if(share===null){
        const oldBudget=finite(a.budgetUsd);
        share=envelope>0&&oldBudget!==null?Math.max(0,oldBudget/envelope*100):Number(s.defaultSharePct)||0;
        a.sharePct=share;
      }
      a.department=s.id;
      a.spentUsd=Math.max(0,finite(a.spentUsd)||0);
      present.push({id:s.id,sharePct:Math.max(0,share),priorBudget:finite(a.budgetUsd)});
    }
    const presentIds=new Set(present.map(x=>x.id));
    const currentShare=present.reduce((n,x)=>n+x.sharePct,0);
    const missing=sectors.filter(s=>!presentIds.has(s.id));
    const defaultTotal=missing.reduce((n,s)=>n+(Number(s.defaultSharePct)||0),0);
    const unassigned=Math.max(0,100-currentShare);
    for(const s of missing){
      const share=defaultTotal>0?unassigned*(Number(s.defaultSharePct)||0)/defaultTotal:0;
      model.allocations[s.id]={department:s.id,sharePct:share,budgetUsd:envelope*share/100,spentUsd:0,
        remainingUsd:envelope*share/100,updatedTurn:currentTurn(),source:'OMEGA_DEFAULT_BUDGET_PLAN'};
    }
    for(const s of sectors){
      const a=model.allocations[s.id];
      if(!isObject(a))continue;
      const share=Math.max(0,finite(a.sharePct)||0);
      a.sharePct=share;
      a.budgetUsd=Math.max(0,envelope*share/100);
      a.remainingUsd=Math.max(0,a.budgetUsd-(finite(a.spentUsd)||0));
    }
    if(finite(model.minimumReserveTargetUsd)===null)model.minimumReserveTargetUsd=0;
  }
  function budgetTotals(model){
    const rows=(sectorRegistry.budgetSectors||[]).map(s=>{
      const a=model?.allocations?.[s.id]||{};
      return {id:s.id,name:s.name,icon:s.icon,sharePct:Math.max(0,finite(a.sharePct)||0),
        budgetUsd:Math.max(0,finite(a.budgetUsd)||0),spentUsd:Math.max(0,finite(a.spentUsd)||0),
        remainingUsd:Math.max(0,finite(a.remainingUsd)||0),defaultSharePct:Number(s.defaultSharePct)||0,
        description:s.description,updatedTurn:a.updatedTurn??null};
    });
    const totalSharePct=rows.reduce((n,x)=>n+x.sharePct,0);
    const envelope=Math.max(0,finite(model?.fiscalModel?.annualSpendingUsd)||0);
    const totalAllocatedUsd=rows.reduce((n,x)=>n+x.budgetUsd,0);
    const totalSpentUsd=rows.reduce((n,x)=>n+x.spentUsd,0);
    return {rows,envelopeUsd:envelope,totalSharePct,unallocatedSharePct:Math.max(0,100-totalSharePct),
      overAllocatedSharePct:Math.max(0,totalSharePct-100),totalAllocatedUsd,totalSpentUsd,
      totalRemainingUsd:rows.reduce((n,x)=>n+x.remainingUsd,0),unallocatedBudgetUsd:Math.max(0,envelope-totalAllocatedUsd)};
  }
  function revenueState(p,model,metrics,root){
    root=root||rootState();
    const fb=financeBucketFor(root,p,false)||{};
    const resourceFiscal=isObject(fb.resourceFiscal)?fb.resourceFiscal:{};
    const cumulativeFiscal=isObject(resourceFiscal.cumulative)?resourceFiscal.cumulative:{};
    const currentFiscal=isObject(resourceFiscal.thisTurn)?resourceFiscal.thisTurn:{};
    const recordedRevenue=finite(fb.revenue);
    const recordedTax=finite(fb.taxRevenue);
    const recordedResourceCurrent=finite(fb.resourceBudgetContributionThisTurn)??finite(currentFiscal.total);
    const recordedResourceCumulative=finite(fb.resourceBudgetContribution)??finite(cumulativeFiscal.total);
    const resourceCumulativeSafe=recordedResourceCumulative===null?null:Math.max(0,recordedResourceCumulative);
    const nonTax=recordedRevenue!==null&&recordedTax!==null?
      Math.max(0,recordedRevenue-recordedTax-(resourceCumulativeSafe??0)):null;
    const extraCandidates=[
      ['tradeDuties','Trade duties and customs',[fb.tradeTariffRevenue,fb.customsRevenue,fb.tradeDutyRevenue]],
      ['stateEnterprise','State-owned enterprise dividends',[fb.stateEnterpriseRevenue,fb.dividendsReceived]],
      ['fees','Licences, fees and service charges',[fb.serviceFeeRevenue,fb.licenceRevenue]],
      ['foreignTransfers','Grants and external transfers',[fb.externalTransfers,fb.grantsReceived,fb.foreignAidRevenue]]
    ];
    const rows=[
      {id:'tax',name:'Modeled public tax receipts',type:'MODELED',amountUsd:finite(model?.fiscalModel?.annualRevenueUsd),basis:'Annual projection',available:finite(model?.fiscalModel?.annualRevenueUsd)!==null},
      {id:'resourceCurrent',name:'Recorded resource receipts this turn',type:'RECORDED_RUNTIME',amountUsd:recordedResourceCurrent,basis:'Current simulation turn',available:recordedResourceCurrent!==null},
      {id:'resourceCumulative',name:'Recorded resource receipts cumulative',type:'RECORDED_RUNTIME',amountUsd:resourceCumulativeSafe,basis:'Runtime cumulative total',available:resourceCumulativeSafe!==null},
      {id:'recordedTax',name:'Tax receipts recorded to date',type:'RECORDED_RUNTIME',amountUsd:recordedTax,basis:'finance.taxRevenue',available:recordedTax!==null},
      {id:'recordedRevenue',name:'All recorded government revenue',type:'RECORDED_RUNTIME',amountUsd:recordedRevenue,basis:'finance.revenue',available:recordedRevenue!==null},
      {id:'otherRecorded',name:'Other recorded non-tax revenue',type:'RECORDED_RUNTIME',amountUsd:nonTax,basis:'Recorded total less tax and resource receipts',available:nonTax!==null},
      ...extraCandidates.map(([id,name,candidates])=>{
        const found=candidates.map(finite).find(v=>v!==null)??null;
        return {id,name,type:'RECORDED_RUNTIME',amountUsd:found,basis:'Existing runtime field only',available:found!==null};
      })
    ];
    const industries=(sectorRegistry.economicSectors||[]).map(s=>{
      const output=finite(metrics?.gdpCurrentUsd)===null?null:metrics.gdpCurrentUsd*(Number(s.outputSharePct)||0)/100;
      const tax=finite(model?.fiscalModel?.annualRevenueUsd)===null?null:model.fiscalModel.annualRevenueUsd*(Number(s.taxReceiptSharePct)||0)/100;
      return {id:s.id,name:s.name,icon:s.icon,budgetSectorId:s.budgetSectorId||null,
        outputSharePct:Number(s.outputSharePct)||0,taxReceiptSharePct:Number(s.taxReceiptSharePct)||0,
        estimatedOutputUsd:output,projectedTaxReceiptUsd:tax,
        collectedTaxReceiptsUsd:Math.max(0,finite(model?.currentYearSectorReceiptsUsd?.[s.id])||0),type:'MODELED_ESTIMATE'};
    });
    return {rows,industries,recordedRevenueUsd:recordedRevenue,recordedTaxRevenueUsd:recordedTax,
      recordedResourceCurrentUsd:recordedResourceCurrent,recordedResourceCumulativeUsd:resourceCumulativeSafe,
      modelRevenueUsd:finite(model?.fiscalModel?.annualRevenueUsd),modelTaxTakePct:finite(model?.policy?.taxRatePct)};
  }
  function actualCashflow(model){
    return (finite(model?.currentYearTaxRevenueUsd)||0)+(finite(model?.currentYearExternalInflowUsd)||0)
      -(finite(model?.currentYearSpendingUsd)||0)-(finite(model?.currentYearExternalOutflowUsd)||0)
      -(finite(model?.currentYearInterestUsd)||0);
  }
  function fiscalYearIndexFor(turn,stepMs){
    const n=Math.max(0,finite(turn)||0),dt=Math.max(0,finite(stepMs)||Number(rules.simulationTurnDurationMs||DAY_MS));
    return Math.floor(n*dt/Number(rules.annualizationMs||YEAR_MS));
  }
  function ensureFinanceState(p,root){
    if(!p)return null;root=root||rootState();const bucket=financeBucketFor(root,p,true);if(!bucket)return null;
    const id=p.iso3||p.countryCode;
    const model=ensureObject(bucket,'omegaFinance');
    const e=getEconomyRecord(p)||{},gdp=finite(e.gdp)??finite(p.indicators?.gdpCurrentUsd),existingCash=observedFinanceCash(p,root);
    if(model.version!==VERSION){
      model.version=VERSION;model.countryCode=id;model.countryName=p.name;
      model.status=gdp!==null&&gdp>0?'ACTIVE':'DATA_UNAVAILABLE';model.initializedTurn=currentTurn();model.lastProcessedTurn=null;
      model.treasuryBalanceUsd=model.treasuryBalanceUsd!==undefined?finite(model.treasuryBalanceUsd):Math.max(0,existingCash??finite(e.treasury)??(gdp>0?gdp*Number(rules.startingTreasuryPercentOfGDP||2)/100:0));
      if(model.treasuryBalanceUsd===null)model.treasuryBalanceUsd=0;
      model.treasurySource=existingCash!==null?'EXISTING_RUNTIME_FINANCE_AVAILABLE':(finite(e.treasury)!==null?'EXISTING_RUNTIME_TREASURY':'GAME_RULE_ESTIMATE');
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
      for(const k of ['cumulativeRevenueUsd','cumulativeSpendingUsd','cumulativeInterestUsd','cumulativeBorrowingUsd',
        'cumulativeExternalInflowUsd','cumulativeExternalOutflowUsd','currentYearTaxRevenueUsd','currentYearSpendingUsd',
        'currentYearInterestUsd','currentYearExternalInflowUsd','currentYearExternalOutflowUsd'])if(finite(model[k])===null)model[k]=0;
      model.fiscalYearIndex=finite(model.fiscalYearIndex)??fiscalYearIndexFor(currentTurn(),Number(rules.simulationTurnDurationMs||DAY_MS));
      model.priceIndex=finite(model.priceIndex)??100;model.allocations=isObject(model.allocations)?model.allocations:{};
      if(!Array.isArray(model.ledger))model.ledger=[];model.revision=finite(model.revision)??0;
    }else{
      model.policy=isObject(model.policy)?model.policy:{taxRatePct:Number(rules.defaultTaxRatePct||18),interestRateAnnualPct:Number(rules.defaultPolicyInterestRatePct||3)};
      model.fiscalModel=isObject(model.fiscalModel)?model.fiscalModel:{};
      model.allocations=isObject(model.allocations)?model.allocations:{};
      if(!Array.isArray(model.ledger))model.ledger=[];
    }
    if(finite(model.lastSyncedTreasuryBalanceUsd)===null)model.lastSyncedTreasuryBalanceUsd=finite(model.treasuryBalanceUsd)??0;
    for(const k of ['cumulativeExternalInflowUsd','cumulativeExternalOutflowUsd','currentYearTaxRevenueUsd','currentYearSpendingUsd',
      'currentYearInterestUsd','currentYearExternalInflowUsd','currentYearExternalOutflowUsd'])if(finite(model[k])===null)model[k]=0;
    if(finite(model.fiscalYearIndex)===null)model.fiscalYearIndex=fiscalYearIndexFor(currentTurn(),Number(rules.simulationTurnDurationMs||DAY_MS));
    if(!isObject(model.currentYearSectorReceiptsUsd))model.currentYearSectorReceiptsUsd={};
    for(const s of sectorRegistry.economicSectors||[])if(finite(model.currentYearSectorReceiptsUsd[s.id])===null)model.currentYearSectorReceiptsUsd[s.id]=0;
    initializeSectorAllocations(model);
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
    if(fm&&reconcileExternalTreasury(p,fm,root))syncEconomyRecord(p,fm,root);
    m.treasuryBalanceUsd=fm?finite(fm.treasuryBalanceUsd):null;
    m.availableTreasuryUsd=fm?Math.max(0,finite(fm.treasuryBalanceUsd)??0):null;
    m.taxRatePct=fm?finite(fm.policy?.taxRatePct):null;m.policyInterestRatePct=fm?finite(fm.policy?.interestRateAnnualPct):null;
    m.annualRevenueUsd=fm?finite(fm.fiscalModel?.annualRevenueUsd):null;
    m.annualSpendingUsd=fm?finite(fm.fiscalModel?.annualSpendingUsd):null;
    m.currentBudgetBalanceUsd=fm?finite(fm.fiscalModel?.annualBudgetBalanceUsd):m.governmentBudgetBalanceUsd;
    m.priceIndex=fm?finite(fm.priceIndex):null;m.actualCashflowUsd=fm?actualCashflow(fm):null;return m;
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
    root=root||rootState();
    reconcileExternalTreasury(p,model,root);
    const previousSync=finite(model?.lastSyncedTreasuryBalanceUsd);
    const cash=Math.max(0,finite(model?.treasuryBalanceUsd)??0);
    const e=root.economy?.[p.economyKey]||null;
    const debt=finite(e?.debt)??finite(p.indicators?.publicDebtUsd);
    const gdp=finite(e?.gdp)??finite(p.indicators?.gdpCurrentUsd);
    const balance=finite(model?.fiscalModel?.annualBudgetBalanceUsd);
    if(e){
      e.treasury=cash;
      if(debt!==null)e.debt=debt;
      if(gdp!==null)e.gdp=gdp;
      if(balance!==null)e.budget_balance=balance;
      if(finite(model?.fiscalModel?.annualRevenueUsd)!==null)e.revenue=model.fiscalModel.annualRevenueUsd;
      if(finite(model?.fiscalModel?.annualSpendingUsd)!==null)e.expenditure=model.fiscalModel.annualSpendingUsd;
      if(finite(model?.policy?.interestRateAnnualPct)!==null)e.policy_interest_rate_model_pct=model.policy.interestRateAnnualPct;
    }
    const candidates=stateCandidates();
    for(const s of candidates){
      if(s!==root&&p.economyKey&&isObject(s.economy?.[p.economyKey])){
        const other=s.economy[p.economyKey];
        other.treasury=cash;
        if(debt!==null)other.debt=debt;
        if(gdp!==null)other.gdp=gdp;
        if(balance!==null)other.budget_balance=balance;
        if(finite(model?.fiscalModel?.annualRevenueUsd)!==null)other.revenue=model.fiscalModel.annualRevenueUsd;
        if(finite(model?.fiscalModel?.annualSpendingUsd)!==null)other.expenditure=model.fiscalModel.annualSpendingUsd;
        if(finite(model?.policy?.interestRateAnnualPct)!==null)other.policy_interest_rate_model_pct=model.policy.interestRateAnnualPct;
      }
      const fb=financeBucketFor(s,p,true);
      if(!fb)continue;
      if(s===root)fb.available=cash;
      else{
        const current=finite(fb.available);
        if(current===null||previousSync===null||Math.abs(current-previousSync)<=0.0001)fb.available=cash;
      }
      if(!own(fb,'ministryAllocations'))fb.ministryAllocations={};
      if(isObject(fb.ministryAllocations)){
        for(const [dept,a] of Object.entries(model?.allocations||{})){
          if(!own(fb.ministryAllocations,dept)||fb.ministryAllocations[dept]?.source==='OMEGA_FINANCE_MINISTRY')
            fb.ministryAllocations[dept]={allocatedUsd:a.budgetUsd,spentUsd:a.spentUsd,remainingUsd:a.remainingUsd,source:'OMEGA_FINANCE_MINISTRY'};
        }
      }
    }
    model.lastSyncedTreasuryBalanceUsd=cash;
    for(const s of candidates){if(s!==root){const fb=financeBucketFor(s,p,false);if(fb)fb.omegaFinance=clone(model);}}
  }
  function syncAllStates(){
    const root=rootState();
    for(const p of profiles)syncEconomyRecord(p,ensureFinanceState(p,root),root);
  }
  function getPlayerCode(){return playerCountryProfile()?.countryCode||null;}
  function postLedger(model,profile,entry){
    model.ledger=Array.isArray(model.ledger)?model.ledger:[];
    const row=Object.assign({turn:currentTurn(),countryCode:profile.countryCode,
      balanceAfterUsd:finite(model.treasuryBalanceUsd)||0,fiscalYearIndex:Math.max(0,Math.floor(finite(model.fiscalYearIndex)||0))},entry);
    if(!row.transactionId)row.transactionId='FIN-'+profile.countryCode+'-'+currentTurn()+'-'+String((finite(model.revision)||0)+1)+'-'+String(model.ledger.length+1);
    model.ledger.push(row);
    model.ledger=model.ledger.slice(-Number(rules.maximumLedgerEntries||500));
    return clone(row);
  }
  function applyAction(action){
    action=isObject(action)?action:{};
    const type=String(action.type||'').toLowerCase().replace(/_/g,'-');
    const p=resolveProfile(action.countryId||action.countryCode||selectedCountryCode)||playerCountryProfile();
    if(!p)return {ok:false,code:'COUNTRY_NOT_FOUND',message:'Country profile is not available.'};
    if(p.countryCode!==getPlayerCode())return {ok:false,code:'PLAYER_COUNTRY_SCOPE_VIOLATION',message:'Finance commands are restricted to the active player country.'};
    if(!isPlayable(p))return {ok:false,code:'ECONOMIC_BASELINE_UNAVAILABLE',message:'No GDP baseline exists. Fiscal actions are disabled rather than fabricated.'};
    const root=rootState(),fm=ensureFinanceState(p,root);
    reconcileExternalTreasury(p,fm,root);
    const e=root.economy?.[p.economyKey]||getEconomyRecord(p);
    if(!e)return {ok:false,code:'ECONOMY_STATE_UNAVAILABLE',message:'Authoritative economy state is unavailable.'};
    let amount=finite(action.amountUsd??action.amount),result=null;
    if(type==='set-tax-rate'||type==='tax-rate'){
      const value=finite(action.value??action.ratePct);
      if(value===null||value<Number(rules.minimumTaxRatePct??0)||value>Number(rules.maximumTaxRatePct??60))
        return {ok:false,code:'TAX_RATE_OUT_OF_RANGE',message:'Tax take must remain within the configured game-rule limits.'};
      fm.policy.taxRatePct=value;fm.policy.taxRateSource='PLAYER_POLICY';fm.policy.revision=(finite(fm.policy.revision)||0)+1;
      recalculateFiscal(p,fm,e);initializeSectorAllocations(fm);fm.revision+=1;
      postLedger(fm,p,{department:'finance',action:'TAX_POLICY_CHANGED',category:'tax_take_pct_gdp',amountUsd:0,description:'New tax take: '+value+'% of GDP'});
      result={ok:true,code:'TAX_RATE_UPDATED',message:'Tax policy updated. Its revenue is a modeled projection.'};
    }else if(type==='set-interest-rate'||type==='interest-rate'){
      const value=finite(action.value??action.ratePct);
      if(value===null||value<Number(rules.minimumPolicyInterestRatePct??0)||value>Number(rules.maximumPolicyInterestRatePct??40))
        return {ok:false,code:'POLICY_RATE_OUT_OF_RANGE',message:'Policy interest rate is outside the configured limits.'};
      fm.policy.interestRateAnnualPct=value;fm.policy.interestRateSource='PLAYER_POLICY';fm.policy.revision=(finite(fm.policy.revision)||0)+1;
      fm.revision+=1;
      postLedger(fm,p,{department:'finance',action:'POLICY_RATE_CHANGED',category:'annual_interest_rate',amountUsd:0,description:'New modeled policy rate: '+value+'%'});
      result={ok:true,code:'POLICY_RATE_UPDATED',message:'Modeled policy interest rate updated. Future debt-interest accrual will use it.'};
    }else if(type==='set-reserve-target'){
      const value=finite(action.value??action.sharePct);
      if(value===null||value<0||value>60)return {ok:false,code:'RESERVE_TARGET_OUT_OF_RANGE',message:'Reserve target must be between 0% and 60% of the annual spending plan.'};
      fm.policy.minimumReservePctOfAnnualSpending=value;fm.policy.minimumReserveSource='PLAYER_POLICY';fm.revision+=1;
      postLedger(fm,p,{department:'finance',action:'RESERVE_POLICY_CHANGED',category:'cash_reserve_target',amountUsd:0,description:'Minimum treasury reserve target: '+value+'% of annual budget'});
      result={ok:true,code:'RESERVE_POLICY_UPDATED',message:'Minimum treasury reserve policy updated.'};
    }else if(type==='set-sector-share'){
      const dep=String(action.sectorId||action.department||'').toLowerCase(),sector=budgetSectorById(dep);
      const share=finite(action.sharePct??action.value);
      if(!sector)return {ok:false,code:'BUDGET_SECTOR_INVALID',message:'Select a valid budget sector.'};
      if(share===null||share<0||share>100)return {ok:false,code:'BUDGET_SHARE_OUT_OF_RANGE',message:'Sector share must be between 0% and 100%.'};
      const otherShare=(sectorRegistry.budgetSectors||[]).filter(s=>s.id!==dep)
        .reduce((sum,s)=>sum+Math.max(0,finite(fm.allocations?.[s.id]?.sharePct)||0),0);
      if(otherShare+share>100.00001)return {ok:false,code:'BUDGET_SHARES_EXCEED_100',message:'Total sector allocations cannot exceed 100%. Reduce another sector first.'};
      const envelope=Math.max(0,finite(fm.fiscalModel.annualSpendingUsd)||0);
      const budget=envelope*share/100,prior=fm.allocations[dep]||{spentUsd:0};
      const spent=Math.max(0,finite(prior.spentUsd)||0);
      if(budget+0.01<spent)return {ok:false,code:'ALLOCATION_BELOW_SPENT',message:'New annual allocation cannot be below money already spent in this fiscal year.'};
      fm.allocations[dep]=Object.assign({},prior,{department:dep,sharePct:share,budgetUsd:budget,spentUsd:spent,remainingUsd:Math.max(0,budget-spent),updatedTurn:currentTurn(),source:'PLAYER_BUDGET_DISTRIBUTION'});
      fm.revision+=1;
      postLedger(fm,p,{department:dep,action:'BUDGET_SHARE_CHANGED',category:'annual_budget_share',amountUsd:budget,description:'New share: '+share+'%; annual ceiling: '+Math.round(budget)});
      result={ok:true,code:'BUDGET_SHARE_UPDATED',message:sector.name+' set to '+share+'% of the annual budget plan.'};
    }else if(type==='set-allocation'||type==='allocate-budget'){
      const dep=String(action.department||action.ministryId||'').toLowerCase(),sector=budgetSectorById(dep);
      if(!DEPARTMENTS.some(x=>x[0]===dep))return {ok:false,code:'MINISTRY_INVALID',message:'Choose a supported government department or budget sector.'};
      if(amount===null||amount<=0)return {ok:false,code:'ALLOCATION_AMOUNT_INVALID',message:'Allocation must be greater than zero.'};
      const prior=isObject(fm.allocations[dep])?fm.allocations[dep]:{budgetUsd:0,spentUsd:0,remainingUsd:0};
      if(amount<(finite(prior.spentUsd)||0))return {ok:false,code:'ALLOCATION_BELOW_SPENT',message:'The new allocation cannot be below money already spent.'};
      if(sector){
        const envelope=Math.max(0,finite(fm.fiscalModel.annualSpendingUsd)||0);
        if(envelope<=0)return {ok:false,code:'BUDGET_ENVELOPE_UNAVAILABLE',message:'The annual expenditure plan is unavailable.'};
        const share=amount/envelope*100;
        const otherShare=(sectorRegistry.budgetSectors||[]).filter(s=>s.id!==dep).reduce((sum,s)=>sum+(finite(fm.allocations?.[s.id]?.sharePct)||0),0);
        if(otherShare+share>100.00001)return {ok:false,code:'BUDGET_SHARES_EXCEED_100',message:'Total sector budgets cannot exceed the annual expenditure plan.'};
        fm.allocations[dep]=Object.assign({},prior,{department:dep,sharePct:share,budgetUsd:amount,spentUsd:finite(prior.spentUsd)||0,
          remainingUsd:amount-(finite(prior.spentUsd)||0),updatedTurn:currentTurn(),source:'PLAYER_BUDGET_DISTRIBUTION'});
      }else{
        const cash=Math.max(0,finite(fm.treasuryBalanceUsd)||0);
        if(amount>cash)return {ok:false,code:'INSUFFICIENT_TREASURY',message:'Legacy ministry ceiling cannot exceed the current treasury balance.'};
        fm.allocations[dep]={department:dep,budgetUsd:amount,spentUsd:finite(prior.spentUsd)||0,
          remainingUsd:amount-(finite(prior.spentUsd)||0),updatedTurn:currentTurn(),source:'PLAYER_ALLOCATION'};
      }
      fm.revision+=1;result={ok:true,code:'BUDGET_ALLOCATED',message:'Annual budget ceiling updated; this action does not spend cash.'};
    }else if(type==='spend-budget'||type==='spend'||type==='pay-expense'){
      const dep=String(action.department||action.ministryId||'').toLowerCase(),category=String(action.spendType||action.category||'general').toLowerCase();
      const validTypes=['salary','purchase','maintenance','general','investment','emergency','debt_service'];
      const allocation=fm.allocations[dep];
      if(!DEPARTMENTS.some(x=>x[0]===dep))return {ok:false,code:'MINISTRY_INVALID',message:'Choose a supported government sector.'};
      if(!validTypes.includes(category))return {ok:false,code:'EXPENSE_CATEGORY_INVALID',message:'Choose salary, purchase, maintenance, general, investment, emergency or debt service.'};
      if(category==='emergency'&&dep!=='emergency_reserve')return {ok:false,code:'EMERGENCY_SECTOR_REQUIRED',message:'Emergency spending must use the Emergency & Strategic Reserve sector.'};
      if(category==='debt_service'&&dep!=='debt_service')return {ok:false,code:'DEBT_SERVICE_SECTOR_REQUIRED',message:'Debt-service spending must use the Debt Service & Financial Stability sector.'};
      if(amount===null||amount<=0)return {ok:false,code:'EXPENSE_AMOUNT_INVALID',message:'Expense amount must be greater than zero.'};
      if(!isObject(allocation))return {ok:false,code:'BUDGET_ALLOCATION_REQUIRED',message:'This sector has no budget allocation. Distribute the budget before spending.'};
      if(amount>(finite(allocation.remainingUsd)||0))return {ok:false,code:'ALLOCATION_LIMIT_EXCEEDED',message:'Expense exceeds this sector’s remaining fiscal-year allocation.'};
      const cash=Math.max(0,finite(fm.treasuryBalanceUsd)||0);
      if(amount>cash)return {ok:false,code:'INSUFFICIENT_TREASURY',message:'Insufficient treasury balance; expense rejected.'};
      const reservePct=Math.max(0,finite(fm.policy.minimumReservePctOfAnnualSpending)||0);
      const reserveFloor=Math.max(0,finite(fm.fiscalModel.annualSpendingUsd)||0)*reservePct/100;
      if(category!=='emergency'&&category!=='debt_service'&&cash-amount+0.01<reserveFloor)
        return {ok:false,code:'MINIMUM_RESERVE_FLOOR',message:'This expense would breach the configured minimum treasury reserve. Use the emergency category only for an authorized emergency.'};
      allocation.spentUsd=(finite(allocation.spentUsd)||0)+amount;
      allocation.remainingUsd=Math.max(0,(finite(allocation.budgetUsd)||0)-allocation.spentUsd);
      fm.treasuryBalanceUsd=cash-amount;
      fm.cumulativeSpendingUsd=(finite(fm.cumulativeSpendingUsd)||0)+amount;
      fm.currentYearSpendingUsd=(finite(fm.currentYearSpendingUsd)||0)+amount;
      const fb=financeBucketFor(root,p,true);
      fb.spending=(finite(fb.spending)||0)+amount;
      fb.operatingExpenditure=(finite(fb.operatingExpenditure)||0)+amount;
      if(category==='purchase'||category==='investment')fb.capitalExpenditure=(finite(fb.capitalExpenditure)||0)+amount;
      const expenseEntry=postLedger(fm,p,{department:dep,action:'EXPENSE',category,amountUsd:amount,description:String(action.description||'').slice(0,160)});
      fm.revision+=1;result={ok:true,code:'EXPENSE_POSTED',transactionId:expenseEntry.transactionId,message:'Expense posted, charged to the sector ceiling and deducted from available treasury.'};
    }else if(type==='rollback-home-ministry-expense'){
      const transactionId=String(action.transactionId||'').trim();
      const original=fm.ledger.find(row=>row&&String(row.transactionId||'')===transactionId);
      const originalDepartment=String(original&&original.department||''),originalDescription=String(original&&original.description||'');
      const homeExpense=originalDepartment==='interior'&&originalDescription.startsWith('OMEGA_HOME_BUDGET:');
      const militaryExpense=originalDepartment==='defense'&&originalDescription.startsWith('OMEGA_MILITARY_BUDGET:');
      if(!original||original.action!=='EXPENSE'||(!homeExpense&&!militaryExpense))
        return{ok:false,code:'MINISTRY_EXPENSE_ROLLBACK_REFERENCE_INVALID',message:'Only an identifiable Home or Defense Ministry expense can be reversed.'};
      if(original.reversedBy)return{ok:false,code:'HOME_EXPENSE_ALREADY_REVERSED',message:'This expense has already been reversed.'};
      if(Math.floor(finite(original.fiscalYearIndex)||0)!==Math.floor(finite(fm.fiscalYearIndex)||0))
        return{ok:false,code:'HOME_EXPENSE_ROLLBACK_FISCAL_YEAR_MISMATCH',message:'A prior fiscal-year expense cannot be reversed by this rollback.'};
      const allocation=fm.allocations?.[originalDepartment],refund=finite(original.amountUsd);
      if(!isObject(allocation)||refund===null||refund<=0||Math.max(0,finite(allocation.spentUsd)||0)+0.01<refund)
        return{ok:false,code:'HOME_EXPENSE_ROLLBACK_LEDGER_MISMATCH',message:'Finance ledger and ministry allocation do not permit a safe rollback.'};
      original.reversedBy='ROLLBACK-'+String((finite(fm.revision)||0)+1)+'-'+currentTurn();
      allocation.spentUsd=Math.max(0,(finite(allocation.spentUsd)||0)-refund);
      allocation.remainingUsd=Math.max(0,(finite(allocation.budgetUsd)||0)-allocation.spentUsd);
      fm.treasuryBalanceUsd=Math.max(0,(finite(fm.treasuryBalanceUsd)||0)+refund);
      fm.currentYearSpendingUsd=Math.max(0,(finite(fm.currentYearSpendingUsd)||0)-refund);
      fm.cumulativeSpendingUsd=Math.max(0,(finite(fm.cumulativeSpendingUsd)||0)-refund);
      const fb=financeBucketFor(root,p,true);
      fb.spending=Math.max(0,(finite(fb.spending)||0)-refund);
      if(['purchase','investment'].includes(String(original.category||'')))fb.capitalExpenditure=Math.max(0,(finite(fb.capitalExpenditure)||0)-refund);
      else fb.operatingExpenditure=Math.max(0,(finite(fb.operatingExpenditure)||0)-refund);
      const reversal=postLedger(fm,p,{department:'interior',action:'EXPENSE_ROLLBACK',category:original.category,
        amountUsd:-refund,description:'OMEGA_HOME_BUDGET_ROLLBACK:'+transactionId,referenceTransactionId:transactionId});
      fm.revision+=1;
      result={ok:true,code:'HOME_EXPENSE_ROLLED_BACK',transactionId:reversal.transactionId,reversedTransactionId:transactionId,
        message:'The Home Ministry expense and its Finance allocation were rolled back.'};
    }else if(type==='borrow'||type==='take-loan'){
      if(amount===null||amount<=0)return {ok:false,code:'LOAN_AMOUNT_INVALID',message:'Loan principal must be greater than zero.'};
      const gdp=finite(e.gdp)||0,debt=Math.max(0,finite(e.debt)||0);
      if(amount>gdp*Number(rules.maximumBorrowTransactionPercentOfGDP??5)/100)return {ok:false,code:'LOAN_TRANSACTION_LIMIT',message:'Loan exceeds the configured per-transaction GDP limit.'};
      if(debt+amount>gdp*Number(rules.maximumDebtToGDPForNewBorrowingPct??300)/100)return {ok:false,code:'DEBT_CEILING_REACHED',message:'Loan rejected by the modeled debt-to-GDP ceiling.'};
      e.debt=debt+amount;fm.treasuryBalanceUsd=(finite(fm.treasuryBalanceUsd)||0)+amount;
      fm.cumulativeBorrowingUsd=(finite(fm.cumulativeBorrowingUsd)||0)+amount;
      const fb=financeBucketFor(root,p,true);fb.borrowingProceeds=(finite(fb.borrowingProceeds)||0)+amount;
      postLedger(fm,p,{department:'finance',action:'BORROW',category:'sovereign_debt',amountUsd:amount,description:String(action.description||'Sovereign borrowing').slice(0,160)});
      fm.revision+=1;result={ok:true,code:'BORROW_POSTED',message:'Loan posted to treasury and national debt. Interest accrues in future simulation turns.'};
    }else if(type==='repay-debt'){
      const debt=Math.max(0,finite(e.debt)||0),cash=Math.max(0,finite(fm.treasuryBalanceUsd)||0);
      if(amount===null||amount<=0)return {ok:false,code:'REPAY_AMOUNT_INVALID',message:'Debt repayment must be greater than zero.'};
      if(amount>cash)return {ok:false,code:'INSUFFICIENT_TREASURY',message:'Insufficient treasury balance for this repayment.'};
      if(amount>debt)return {ok:false,code:'REPAY_EXCEEDS_DEBT',message:'Repayment cannot exceed outstanding public debt.'};
      e.debt=debt-amount;fm.treasuryBalanceUsd=cash-amount;
      fm.cumulativeDebtRepaymentUsd=(finite(fm.cumulativeDebtRepaymentUsd)||0)+amount;
      const fb=financeBucketFor(root,p,true);fb.debtRepayments=(finite(fb.debtRepayments)||0)+amount;
      postLedger(fm,p,{department:'finance',action:'DEBT_REPAYMENT',category:'sovereign_debt',amountUsd:amount,description:String(action.description||'Principal repayment').slice(0,160)});
      fm.revision+=1;result={ok:true,code:'DEBT_REPAID',message:'Principal repaid; both treasury and outstanding public debt were reduced.'};
    }else return {ok:false,code:'UNKNOWN_FINANCE_ACTION',message:'Unknown Finance Ministry command.'};
    fm.ledger=fm.ledger.slice(-Number(rules.maximumLedgerEntries||500));
    syncEconomyRecord(p,fm,root);
    safeDispatch('OMEGA_FINANCE_STATE_UPDATED',{countryCode:p.countryCode,action:type,turn:currentTurn(),revision:fm.revision});
    return Object.assign(result,{countryCode:p.countryCode,treasuryBalanceUsd:fm.treasuryBalanceUsd,revision:fm.revision});
  }
  function recalculateFiscal(p,fm,e){
    const gdp=finite(e?.gdp)??finite(p.indicators?.gdpCurrentUsd);if(gdp===null||gdp<=0)return;
    fm.fiscalModel.annualRevenueUsd=gdp*(finite(fm.policy?.taxRatePct)??Number(rules.defaultTaxRatePct||18))/100;
    fm.fiscalModel.annualSpendingUsd=gdp*(finite(fm.fiscalModel.spendingToGdpPct)??0)/100;
    fm.fiscalModel.annualBudgetBalanceUsd=fm.fiscalModel.annualRevenueUsd-fm.fiscalModel.annualSpendingUsd;
    initializeSectorAllocations(fm);
  }
  function advanceTurn(turn,stepDurationMs){
    if(!initialized)return {ok:false,reason:'NOT_INITIALIZED',processed:0};
    const turnNumber=finite(turn)??currentTurn()+1;
    const dt=Math.max(0,finite(stepDurationMs)??Number(rules.simulationTurnDurationMs||DAY_MS));
    const years=dt/Number(rules.annualizationMs||YEAR_MS);if(years<=0)return {ok:true,turn:turnNumber,processed:0};
    const root=rootState();let processed=0;
    const newYearIndex=fiscalYearIndexFor(turnNumber,dt);
    for(const p of profiles){
      if(!isPlayable(p))continue;
      const fm=ensureFinanceState(p,root);
      const externalTreasuryChanged=reconcileExternalTreasury(p,fm,root);
      if(finite(fm.lastProcessedTurn)!==null&&turnNumber<=fm.lastProcessedTurn){if(externalTreasuryChanged)syncEconomyRecord(p,fm,root);continue;}
      const e=root.economy?.[p.economyKey]||getEconomyRecord(p);if(!isObject(e))continue;
      if(newYearIndex>(finite(fm.fiscalYearIndex)||0)){
        fm.fiscalYearIndex=newYearIndex;
        fm.currentYearTaxRevenueUsd=0;fm.currentYearSpendingUsd=0;fm.currentYearInterestUsd=0;
        fm.currentYearExternalInflowUsd=0;fm.currentYearExternalOutflowUsd=0;
        fm.currentYearSectorReceiptsUsd={};
        for(const sector of sectorRegistry.economicSectors||[])fm.currentYearSectorReceiptsUsd[sector.id]=0;
        for(const s of sectorRegistry.budgetSectors||[]){
          const a=fm.allocations?.[s.id];if(!isObject(a))continue;
          a.spentUsd=0;a.remainingUsd=Math.max(0,finite(a.budgetUsd)||0);a.updatedTurn=turnNumber;
        }
        postLedger(fm,p,{department:'finance',action:'FISCAL_YEAR_ROLLOVER',category:'fiscal_year',
          amountUsd:0,description:'New modeled fiscal year: '+(Number(rules.baselineYear||2015)+newYearIndex)});
      }
      const gdpBefore=finite(e.gdp)??finite(p.indicators?.gdpCurrentUsd);if(gdpBefore===null||gdpBefore<=0)continue;
      const growth=clamp(finite(e.gdp_growth)??finite(p.indicators?.gdpGrowthPct)??0,-99,100);
      const gdpAfter=Math.max(0,gdpBefore*Math.pow(1+growth/100,years));e.gdp=gdpAfter;
      const debtBefore=Math.max(0,finite(e.debt)??finite(p.indicators?.publicDebtUsd)??0);
      const rate=clamp(finite(fm.policy?.interestRateAnnualPct)??Number(rules.defaultPolicyInterestRatePct||3),0,100);
      const interest=debtBefore*(Math.pow(1+rate/100,years)-1),debtAfter=debtBefore+interest;
      recalculateFiscal(p,fm,e);
      const income=(finite(fm.fiscalModel.annualRevenueUsd)||0)*years;
      fm.treasuryBalanceUsd=Math.max(0,(finite(fm.treasuryBalanceUsd)||0)+income-interest);
      fm.cumulativeRevenueUsd=(finite(fm.cumulativeRevenueUsd)||0)+income;
      fm.cumulativeInterestUsd=(finite(fm.cumulativeInterestUsd)||0)+interest;
      fm.currentYearTaxRevenueUsd=(finite(fm.currentYearTaxRevenueUsd)||0)+income;
      fm.currentYearInterestUsd=(finite(fm.currentYearInterestUsd)||0)+interest;
      if(!isObject(fm.currentYearSectorReceiptsUsd))fm.currentYearSectorReceiptsUsd={};
      for(const sector of sectorRegistry.economicSectors||[]){
        const receipt=income*(Number(sector.taxReceiptSharePct)||0)/100;
        fm.currentYearSectorReceiptsUsd[sector.id]=(finite(fm.currentYearSectorReceiptsUsd[sector.id])||0)+receipt;
      }
      const fb=financeBucketFor(root,p,true);
      fb.taxRevenue=(finite(fb.taxRevenue)||0)+income;
      fb.revenue=(finite(fb.revenue)||0)+income;
      const inflation=finite(e.inflation)??finite(p.indicators?.inflationRatePct)??0;
      fm.priceIndex=(finite(fm.priceIndex)||100)*Math.pow(Math.max(.0001,1+inflation/100),years);
      fm.lastProcessedTurn=turnNumber;fm.revision=(finite(fm.revision)||0)+1;
      e.debt=debtAfter;e.budget_balance=fm.fiscalModel.annualBudgetBalanceUsd;
      e.revenue=finite(fb.revenue)??fm.fiscalModel.annualRevenueUsd;
      e.expenditure=finite(fb.spending)??fm.fiscalModel.annualSpendingUsd;
      syncEconomyRecord(p,fm,root);processed+=1;
    }
    safeDispatch('OMEGA_FINANCE_STATE_UPDATED',{countryCode:getPlayerCode(),turn:turnNumber,processed,revision:VERSION});
    refreshVisibleMetrics();return {ok:true,turn:turnNumber,processed};
  }
  function departmentOptions(selected){
    const options=(sectorRegistry.budgetSectors&&sectorRegistry.budgetSectors.length)?sectorRegistry.budgetSectors.map(s=>[s.id,s.name]):DEPARTMENTS;
    return options.map(d=>'<option value="'+escapeHTML(d[0])+'"'+(d[0]===selected?' selected':'')+'>'+escapeHTML(d[1])+'</option>').join('');
  }
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
  function budgetRows(fm){
    return budgetTotals(fm).rows;
  }
  function renderBudgetBarRows(fm,limit,showAmounts){
    const rows=budgetRows(fm).slice().sort((a,b)=>b.sharePct-a.sharePct).slice(0,limit||8);
    const max=Math.max(1,...rows.map(r=>r.sharePct));
    const showMoney=showAmounts!==false;
    return '<div class="ofm-sector-bars">'+rows.map(r=>'<div class="ofm-sector-bar-row"><div class="ofm-sector-bar-meta"><span class="ofm-sector-glyph">'+escapeHTML(r.icon)+'</span><span class="ofm-sector-bar-name">'+escapeHTML(r.name)+'</span><strong>'+fmtPct(r.sharePct)+'</strong></div><div class="ofm-bar-track"><span style="width:'+clamp(r.sharePct/max*100,0,100)+'%"></span></div><div class="ofm-sector-bar-money">'+(showMoney?fmtMoney(r.budgetUsd):fmtPct(r.sharePct))+'</div></div>').join('')+'</div>';
  }
  function renderBudgetTable(fm,editable){
    const rows=budgetRows(fm);
    return '<div class="ofm-table-scroll"><table class="ofm-table ofm-budget-table"><thead><tr><th>Sector</th><th>Share of plan</th><th>Annual ceiling</th><th>Spent this year</th><th>Remaining</th><th>Budget action</th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td><span class="ofm-sector-cell"><span class="ofm-sector-glyph">'+escapeHTML(r.icon)+'</span><span><strong>'+escapeHTML(r.name)+'</strong><small>'+escapeHTML(r.description||'')+'</small></span></span></td>'+
        '<td>'+ (editable?'<form class="ofm-share-form" data-ofm-action="set-sector-share"><input type="hidden" name="sectorId" value="'+escapeHTML(r.id)+'"><input aria-label="'+escapeHTML(r.name)+' budget share percentage" name="sharePct" type="number" min="0" max="100" step="0.1" value="'+escapeHTML(String(Number(r.sharePct.toFixed(2))) )+'" required><span>%</span><button type="submit">Apply</button></form>':fmtPct(r.sharePct))+'</td>'+
        '<td>'+fmtMoney(r.budgetUsd)+'</td><td>'+fmtMoney(r.spentUsd)+'</td><td>'+fmtMoney(r.remainingUsd)+'</td>'+
        '<td>'+(editable?'<form class="ofm-share-form ofm-amount-form" data-ofm-action="set-allocation"><input type="hidden" name="department" value="'+escapeHTML(r.id)+'"><input aria-label="'+escapeHTML(r.name)+' annual budget amount" name="amountUsd" type="number" min="0" step="1" value="'+escapeHTML(String(Math.round(r.budgetUsd)))+'" required><button type="submit">Set amount</button></form>':'READ ONLY')+'</td></tr>').join('')+
      '</tbody></table></div>';
  }
  function renderBudgetTab(p,m,fm,editable){
    const totals=budgetTotals(fm);
    let out='<section class="ofm-section"><div class="ofm-section-heading"><h3>Annual distribution plan</h3><span>Share total must stay at or below 100%</span></div>'+
      '<div class="ofm-kpi-grid ofm-kpi-grid-three">'+
      metricCard('Annual spending plan',fmtMoney(totals.envelopeUsd),null,'Modeled government expenditure ceiling')+
      metricCard('Allocated sectors',fmtPct(totals.totalSharePct),null,fmtMoney(totals.totalAllocatedUsd)+' distributed')+
      metricCard('Undistributed',fmtPct(totals.unallocatedSharePct),null,fmtMoney(totals.unallocatedBudgetUsd)+' unassigned')+'</div>';
    if(totals.overAllocatedSharePct>0.01)out+='<div class="ofm-warning">Existing allocations exceed the planned envelope by '+fmtPct(totals.overAllocatedSharePct)+'. Reduce one or more sectors before increasing another.</div>';
    out+='<p class="ofm-data-note">Change one sector and apply it. Sector shares are validated mathematically; raising one share may require lowering another first. Spending is recorded only after you submit a funded expense.</p>';
    out+=renderBudgetTable(fm,editable)+'</section>';
    if(editable){
      out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Execute a funded expense</h3><span>Sector allocation and treasury balance are both checked</span></div>'+
        '<form class="ofm-form ofm-form-wide" data-ofm-action="spend-budget"><label>Sector<select name="department">'+departmentOptions('defense')+'</select></label>'+
        '<label>Expense type<select name="spendType"><option value="salary">Salary / payroll</option><option value="purchase">Procurement</option><option value="maintenance">Repair / maintenance</option><option value="investment">Capital investment</option><option value="general">General operations</option><option value="debt_service">Debt service</option><option value="emergency">Authorized emergency</option></select></label>'+
        '<label>Amount (USD)<input name="amountUsd" type="number" min="1" step="1" placeholder="e.g. 3000000" required></label>'+
        '<label>Purpose / transaction note<input name="description" type="text" maxlength="160" placeholder="Payroll, vehicles, equipment, repairs..." required></label>'+
        '<button type="submit">Execute & post expense</button></form></section>';
    }
    return out;
  }
  function renderRevenueTable(p,m,fm,root){
    const r=revenueState(p,fm,m,root);
    const rows=r.rows.map(x=>'<tr><td><strong>'+escapeHTML(x.name)+'</strong><small>'+escapeHTML(x.basis||'')+'</small></td><td><span class="ofm-data-status '+(x.type==='MODELED'?'is-modeled':(x.available?'is-recorded':'is-unavailable'))+'">'+escapeHTML(x.type==='MODELED'?'MODELLED':(x.available?'RECORDED':'NOT AVAILABLE'))+'</span></td><td>'+fmtMoney(x.amountUsd)+'</td></tr>').join('');
    return {snapshot:r,html:'<div class="ofm-table-scroll"><table class="ofm-table"><thead><tr><th>Revenue stream</th><th>Evidence type</th><th>Amount / projection</th></tr></thead><tbody>'+rows+'</tbody></table></div>'};
  }
  function renderEconomicSectorTable(p,m,fm,root){
    const data=revenueState(p,fm,m,root),rows=data.industries;
    return '<div class="ofm-table-scroll"><table class="ofm-table ofm-budget-table ofm-industry-ledger"><thead><tr><th>Industry / sector</th><th>GDP mix</th><th>Estimated output</th><th>Receipt mix</th><th>Projected public receipts / year</th><th>Collected this FY</th><th>Budget sector</th><th>Annual budget</th><th>Spent</th><th>Remaining</th></tr></thead><tbody>'+
      rows.map(r=>{
        const plan=r.budgetSectorId?fm?.allocations?.[r.budgetSectorId]:null;
        const sector=r.budgetSectorId?budgetSectorById(r.budgetSectorId):null;
        return '<tr><td><span class="ofm-sector-cell"><span class="ofm-sector-glyph">'+escapeHTML(r.icon)+'</span><span><strong>'+escapeHTML(r.name)+'</strong><small>Game-model output; simulated receipt accrual</small></span></span></td>'+
          '<td>'+fmtPct(r.outputSharePct)+'</td><td>'+fmtMoney(r.estimatedOutputUsd)+'</td><td>'+fmtPct(r.taxReceiptSharePct)+'</td><td>'+fmtMoney(r.projectedTaxReceiptUsd)+'</td><td>'+fmtMoney(r.collectedTaxReceiptsUsd)+'</td>'+
          '<td>'+escapeHTML(sector?.name||'No linked budget sector')+'</td><td>'+fmtMoney(plan?plan.budgetUsd:null)+'</td><td>'+fmtMoney(plan?plan.spentUsd:null)+'</td><td>'+fmtMoney(plan?plan.remainingUsd:null)+'</td></tr>';
      }).join('')+
      '</tbody></table></div><p class="ofm-data-note">Output and annual public-receipt forecasts are game-model estimates. “Collected this FY” is modeled tax revenue accrued by simulation time, split by the configured receipt mix. Budget and spending columns are live Finance plan values; none of these are portrayed as observed national industrial accounts.</p>';
  }
  function renderOverviewTab(p,m,fm,rows,editable,root){
    const totals=budgetTotals(fm);
    const planStatus=totals.overAllocatedSharePct>0.01?'OVER-ALLOCATED':
      (totals.unallocatedSharePct>0.01?'UNDER-ALLOCATED':'FULLY ALLOCATED');
    const reservePct=Math.max(0,finite(fm.policy?.minimumReservePctOfAnnualSpending)||0);
    let out='<section class="ofm-kpi-grid ofm-kpi-grid-four">'+
      metricCard('Budget plan status',planStatus,null,totals.overAllocatedSharePct>0.01?'Reduce sector shares before increasing another':(totals.unallocatedSharePct>0.01?'Some annual budget share remains unassigned':'All planned shares fit within 100%'))+
      metricCard('Share distributed',fmtPct(totals.totalSharePct),null,'Percentage of the annual expenditure plan')+
      metricCard('Fiscal risk index',fmtNumber(m.fiscalRiskIndex,1),null,'Higher means higher modeled fiscal risk')+
      metricCard('GDP growth',fmtPct(m.gdpGrowthPct),null,'Country economic reference indicator')+
      '</section>';
    out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Budget distribution at a glance</h3><span>'+fmtPct(totals.totalSharePct)+' of plan distributed</span></div>'+
      renderBudgetBarRows(fm,8,false)+
      '</section>';
    out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Fiscal control checks</h3><span>Operational overview, no transaction amounts</span></div>'+
      '<div class="ofm-indicator-grid">'+
      '<div class="ofm-indicator"><span>Annual fiscal model</span><strong>'+(finite(fm.fiscalModel?.annualSpendingUsd)!==null&&finite(fm.fiscalModel?.annualRevenueUsd)!==null?'ACTIVE':'UNAVAILABLE')+'</strong></div>'+
      '<div class="ofm-indicator"><span>Minimum reserve rule</span><strong>'+fmtPct(reservePct)+' of annual spending plan</strong></div>'+
      '<div class="ofm-indicator"><span>Financial action scope</span><strong>'+(editable?'PLAYER COUNTRY CONTROL':'READ ONLY')+'</strong></div>'+
      '<div class="ofm-indicator"><span>Recorded receipt coverage</span><strong>'+(finite(financeBucketFor(root,p,false)?.taxRevenue)!==null?'TAX RECEIPTS RECORDED':'WAITING FOR RECORDED RECEIPTS')+'</strong></div>'+
      '</div><p class="ofm-data-note">Cash, income, expenses, borrowing and sector-specific monetary values are kept inside their dedicated tabs so this overview remains light and readable.</p></section>';
    if(!editable)out+='<div class="ofm-readonly">READ-ONLY country profile. Finance actions can only be executed for the country selected as the active player in the game.</div>';
    if(p.profileStatus==='UNAVAILABLE')out+='<div class="ofm-warning">GDP baseline unavailable for this country. Financial controls remain disabled.</div>';
    return out;
  }
  function renderIncomeTab(p,m,fm,editable,root){
    const r=revenueState(p,fm,m,root);
    return '<section class="ofm-section"><div class="ofm-section-heading"><h3>Industry output & tax contribution</h3><span>Computed using the current in-game GDP</span></div>'+
      renderEconomicSectorTable(p,m,fm,root)+'</section>'+
      '<section class="ofm-section"><div class="ofm-section-heading"><h3>Revenue sources</h3><span>Source-aware accounting</span></div>'+
      renderRevenueTable(p,m,fm,root).html+
      '<p class="ofm-data-note">“NOT AVAILABLE” means no matching live game field exists. No default figure is fabricated for customs, state-owned enterprise dividends, fees or foreign transfers.</p></section>'+
      (editable?'<section class="ofm-section"><div class="ofm-section-heading"><h3>Tax policy</h3><span>Effects occur through simulation-time revenue collection</span></div>'+
      '<form class="ofm-form ofm-form-wide" data-ofm-action="set-tax-rate"><label>Tax take as % of GDP<input type="number" name="value" min="'+Number(rules.minimumTaxRatePct??0)+'" max="'+Number(rules.maximumTaxRatePct??60)+'" step="0.1" value="'+escapeHTML(String(fm.policy.taxRatePct))+'" required></label>'+
      '<div class="ofm-data-note">This is the game’s aggregate public-revenue take relative to GDP, not a personal income-tax bracket.</div><button type="submit">Apply tax policy</button></form></section>':'');
  }
  function renderTreasuryTab(p,m,fm,editable,root){
    const fb=financeBucketFor(root,p,false)||{},cash=Math.max(0,finite(fm.treasuryBalanceUsd)||0);
    const debt=Math.max(0,finite(m.publicDebtUsd)||0),rate=finite(fm.policy.interestRateAnnualPct)||0;
    const reserves=finite(fb.reserves),reservePct=Math.max(0,finite(fm.policy.minimumReservePctOfAnnualSpending)||0);
    const minimum= Math.max(0,finite(fm.fiscalModel.annualSpendingUsd)||0)*reservePct/100;
    let out='<section class="ofm-kpi-grid ofm-kpi-grid-four">'+
      metricCard('Treasury cash',fmtMoney(cash),null,'finance.available synchronised with Finance runtime')+
      metricCard('Recorded foreign reserves',fmtMoney(reserves),null,'N/A when no reserve field exists')+
      metricCard('Public debt',fmtMoney(debt),null,'Current game-state principal')+
      metricCard('Estimated annual interest',fmtMoney(debt*rate/100),null,'Debt × modeled policy interest rate')+
      '</section><section class="ofm-section"><div class="ofm-section-heading"><h3>Cash safety policy</h3><span>Optional minimum treasury floor</span></div>'+
      '<div class="ofm-indicator-grid"><div class="ofm-indicator"><span>Minimum reserve policy</span><strong>'+fmtPct(reservePct)+'</strong></div>'+
      '<div class="ofm-indicator"><span>Reserve floor amount</span><strong>'+fmtMoney(minimum)+'</strong></div>'+
      '<div class="ofm-indicator"><span>Debt / GDP</span><strong>'+fmtPct(m.publicDebtToGdpPct)+'</strong></div></div>'+
      (editable?'<form class="ofm-form ofm-form-wide" data-ofm-action="set-reserve-target"><label>Minimum Treasury reserve (% of annual plan)<input type="number" name="value" min="0" max="60" step="0.5" value="'+escapeHTML(String(reservePct))+'" required></label><p>Ordinary expenses that breach this target are rejected; authorized emergency and debt-service payments can bypass the floor.</p><button type="submit">Apply reserve target</button></form>':'')+'</section>';
    if(editable){
      out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Borrowing and repayment</h3><span>Debt caps and cash checks are enforced in runtime</span></div><div class="ofm-action-grid">'+
        '<form class="ofm-form" data-ofm-action="borrow"><h4>Issue sovereign loan</h4><label>Principal (USD)<input type="number" name="amountUsd" min="1" step="1" placeholder="500000000" required></label><label>Purpose<input type="text" name="description" maxlength="160" placeholder="Infrastructure / emergency finance" required></label><button type="submit">Issue loan</button><p>Limit: '+fmtPct(Number(rules.maximumBorrowTransactionPercentOfGDP??5))+' of GDP per transaction; modeled total debt cap applies.</p></form>'+
        '<form class="ofm-form" data-ofm-action="repay-debt"><h4>Repay debt principal</h4><label>Principal payment (USD)<input type="number" name="amountUsd" min="1" step="1" placeholder="10000000" required></label><label>Purpose<input type="text" name="description" maxlength="160" placeholder="Scheduled principal repayment" required></label><button type="submit">Repay principal</button><p>Payment reduces both debt outstanding and Treasury cash by the same amount.</p></form></div>'+
        '<form class="ofm-form ofm-form-wide" data-ofm-action="set-interest-rate"><label>Modeled policy interest rate (% per year)<input type="number" name="value" min="'+Number(rules.minimumPolicyInterestRatePct??0)+'" max="'+Number(rules.maximumPolicyInterestRatePct??40)+'" step="0.1" value="'+escapeHTML(String(rate))+'" required></label><p>Changes future debt-interest accrual; it is a game policy rate, not a verified real-world central-bank rate.</p><button type="submit">Apply policy rate</button></form></section>';
    }
    return out;
  }
  function renderReportsTab(p,m,fm,rows,editable,root){
    const cells=[
      ['GDP (current baseline)',fmtMoney(m.gdpCurrentUsd)],['Annual GDP growth',fmtPct(m.gdpGrowthPct)],
      ['Inflation',fmtPct(m.inflationRatePct)],['Unemployment',fmtPct(m.unemploymentRatePct)],
      ['GDP per capita',fmtMoney(m.gdpPerCapitaUsd)],['Public debt / GDP',fmtPct(m.publicDebtToGdpPct)],
      ['Budget balance / GDP',fmtPct(m.budgetBalanceToGdpPct)],['Trade balance / GDP',fmtPct(m.tradeBalanceToGdpPct)],
      ['Foreign-exchange reserves',fmtMoney(m.foreignExchangeReservesUsd)],['FX reserves / GDP',fmtPct(m.reservesToGdpPct)],
      ['Economic influence index',fmtNumber(m.economicInfluenceIndex,1)],['Fiscal risk index',fmtNumber(m.fiscalRiskIndex,1)],
      ['Fiscal health index',fmtNumber(m.fiscalHealthIndex,1)],['GDP world rank',m.gdpWorldRank===null?'N/A':'#'+m.gdpWorldRank],
      ['Modeled price index',fmtNumber(fm.priceIndex,3)],['Fiscal year',String(Number(rules.baselineYear||2015)+(finite(fm.fiscalYearIndex)||0))]
    ];
    return '<section class="ofm-section"><div class="ofm-section-heading"><h3>Country economic indicators</h3><span>Baseline data and runtime estimates are separated</span></div><div class="ofm-indicator-grid">'+
      cells.map(x=>'<div class="ofm-indicator"><span>'+escapeHTML(x[0])+'</span><strong>'+escapeHTML(x[1])+'</strong></div>').join('')+
      '</div><p class="ofm-data-note">The baseline dataset is a game reference, not a live market feed. Derived and custom indices are labelled accordingly.</p></section>'+
      '<section class="ofm-section"><div class="ofm-section-heading"><h3>Financial transaction ledger</h3><span>Most recent 20 transactions</span></div>'+
      '<div class="ofm-table-scroll"><table class="ofm-table"><thead><tr><th>Turn</th><th>Action</th><th>Sector / owner</th><th>Amount</th><th>Category / note</th></tr></thead><tbody>'+renderLedgerRows(fm)+'</tbody></table></div></section>'+
      '<details class="ofm-section ofm-world-register" id="ofm-world-register"><summary>GLOBAL ECONOMIC REGISTER · '+profiles.length+' COUNTRY / AREA PROFILES</summary>'+
      '<p class="ofm-data-note">Expand only when needed; the full table is built on demand to protect low-end mobile performance. Missing values remain N/A.</p>'+
      '<div id="ofm-world-register-content"><span class="ofm-empty">Expand to load country rows.</span></div></details>';
  }
  function dashboardHTML(p,m,fm,rows,notice,root){
    const player=playerCountryProfile(),isPlayer=!!player&&player.countryCode===p.countryCode,editable=isPlayer&&isPlayable(p);
    const totals=budgetTotals(fm);
    const tabs=[
      {id:'overview',glyph:'◫',label:'Overview',sub:'Fiscal snapshot'},
      {id:'budget',glyph:'⊞',label:'Budget sectors',sub:'Distribute & spend'},
      {id:'income',glyph:'↗',label:'Income & industry',sub:'Output and receipts'},
      {id:'treasury',glyph:'◇',label:'Treasury & debt',sub:'Cash and borrowing'},
      {id:'reports',glyph:'≡',label:'Reports',sub:'Indicators & ledger'},
      {id:'fx',glyph:'FX',label:'FX & Banking',sub:'Currency & central bank'},
      {id:'macro',glyph:'MS',label:'Macro Stability',sub:'Growth, inflation & jobs'},
      {id:'analytics',glyph:'∿',label:'Analytics & graphs',sub:'30-day model & raw data'}
    ];
    let out='<div class="ofm-dashboard" data-ofm-root><div class="ofm-hero"><div><div class="ofm-eyebrow">OMEGA / SOVEREIGN FISCAL CONTROL</div><h2>Finance Ministry</h2><p>Budget distribution, state income, recorded Treasury flows and controlled public spending.</p></div><div class="ofm-status">'+escapeHTML(isPlayable(p)?'RUNTIME MODEL ACTIVE':'BASELINE UNAVAILABLE')+'</div></div>';
    out+='<div class="ofm-toolbar"><label for="ofm-country-select">Country profile</label><select id="ofm-country-select">'+renderCountryOptions()+'</select><span class="ofm-baseline">Game baseline '+Number(rules.baselineYear||2015)+' · USD reference</span></div>';
    if(notice)out+='<div class="ofm-notice '+(notice.ok?'is-ok':'is-error')+'" role="status">'+escapeHTML(notice.message||'')+'</div>';
    if(!isPlayer)out+='<div class="ofm-readonly">READ-ONLY PROFILE. Finance actions are restricted to the active player country ('+escapeHTML(player?.name||'not selected')+').</div>';
    if(p.profileStatus==='UNAVAILABLE')out+='<div class="ofm-warning">No GDP baseline is available for this country/area. Missing financial data remain N/A and fiscal commands are disabled.</div>';
    out+='<nav class="ofm-icon-nav" aria-label="Finance Ministry sections">'+tabs.map(t=>'<button type="button" class="ofm-icon-tab'+(activeTab===t.id?' is-active':'')+'" data-ofm-tab="'+escapeHTML(t.id)+'" aria-selected="'+(activeTab===t.id?'true':'false')+'"><span class="ofm-icon-glyph">'+escapeHTML(t.glyph)+'</span><strong>'+escapeHTML(t.label)+'</strong><small>'+escapeHTML(t.sub)+'</small></button>').join('')+'</nav>';
    out+='<div class="ofm-tab-content" data-ofm-active-tab="'+escapeHTML(activeTab)+'">';
    if(activeTab==='budget')out+=renderBudgetTab(p,m,fm,editable);
    else if(activeTab==='income')out+=renderIncomeTab(p,m,fm,editable,root);
    else if(activeTab==='treasury')out+=renderTreasuryTab(p,m,fm,editable,root);
    else if(activeTab==='reports')out+=renderReportsTab(p,m,fm,rows,editable,root);
    else if(activeTab==='fx')out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Foreign Exchange & Government Banking</h3><span>Reference quotes, simulation rates and central-bank actions</span></div><p class="ofm-data-note">Currency conversion is an in-game clearing calculation, not a real bank transfer. Policy and reserve interventions apply only to the active player country. Reference rates may be unavailable offline; cached reference and simulation rates are labelled separately.</p><div data-ofx-container></div></section>';
    else if(activeTab==='macro')out+='<section class="ofm-section"><div class="ofm-section-heading"><h3>Macroeconomic Stability</h3><span>Policy stance, stability indicators and automatic stabilizers</span></div><p class="ofm-data-note">This panel combines the available baseline with modeled policies for growth, spending, inflation, debt and employment. It is a game model, not a credit rating or a real-world forecast. Missing baseline observations remain unavailable.</p><div data-omss-container></div></section>';
    else if(activeTab==='analytics')out+='<section class="ofm-section"><div data-ofa-container></div></section>';
    else out+=renderOverviewTab(p,m,fm,rows,editable,root);
    out+='</div><footer class="ofm-footer"><span>Country state: '+escapeHTML(p.countryCode)+' / '+escapeHTML(p.iso3)+'</span><span>Turn '+escapeHTML(String(currentTurn()))+'</span><span>Budget plan is not cash already spent.</span></footer></div>';
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
    content.innerHTML=dashboardHTML(p,m,fm,snap.rows,notice,root);uiContainer=content;bindDashboardEvents(content);return true;
  }
  function bindDashboardEvents(content){
    if(!content||content.__omegaFinanceBound)return;content.__omegaFinanceBound=true;
    content.addEventListener('click',function(event){
      const tab=event.target?.closest?.('[data-ofm-tab]');
      if(tab){const id=String(tab.getAttribute('data-ofm-tab')||'overview');if(['overview','budget','income','treasury','reports','fx','macro','analytics'].includes(id)){activeTab=id;renderDashboard('finance');return;}}
      const summary=event.target?.closest?.('#ofm-world-register > summary');
      if(summary){setTimeout(function(){const details=content.querySelector?.('#ofm-world-register');const holder=content.querySelector?.('#ofm-world-register-content');if(details&&details.open&&holder&&holder.dataset.loaded!=='true'){holder.innerHTML=renderFullWorldTable(worldSnapshot().rows);holder.dataset.loaded='true';}},0);}
    });
    content.addEventListener('change',function(event){
      if(event.target&&event.target.id==='ofm-country-select'){
        selectedCountryCode=event.target.value;
        global.OmegaMinistryViewCountry=selectedCountryCode;
        if(global.OmegaCabinetUI)global.OmegaCabinetUI.activeCountry=selectedCountryCode;
        renderDashboard('finance');
      }
    });
    content.addEventListener('submit',function(event){
      const form=event.target,action=form?.getAttribute?.('data-ofm-action');if(!action)return;
      event.preventDefault();const payload={type:action,countryId:selectedCountryCode||getPlayerCode()};
      for(const el of Array.from(form.elements||[]))if(el.name)payload[el.name]=el.value;
      if(payload.amountUsd!==undefined)payload.amountUsd=finite(payload.amountUsd);
      if(payload.value!==undefined)payload.value=finite(payload.value);
      if(payload.sharePct!==undefined)payload.sharePct=finite(payload.sharePct);
      renderDashboard('finance',applyAction(payload));
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
      const duration=finite(global.Omega?.Simulation?.clock?.stepDurationMs)??Number(rules.simulationTurnDurationMs||DAY_MS);
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
      const loadedSectors=await fetchJSON('finance_sector_registry_v1.json').catch(()=>null);
      if(isObject(loadedSectors)&&Array.isArray(loadedSectors.budgetSectors)&&Array.isArray(loadedSectors.economicSectors)){
        sectorRegistry=loadedSectors;
        DEPARTMENTS=[...DEPARTMENTS.filter(d=>!sectorRegistry.budgetSectors.some(s=>s.id===d[0])),
          ...sectorRegistry.budgetSectors.map(s=>[s.id,s.name])];
      }
      indexProfiles();const player=playerCountryProfile();
      const contextual=resolveProfile(global.OmegaMinistryViewCountry);
      selectedCountryCode=(contextual&&contextual.countryCode)||selectedCountryCode||(player&&player.countryCode)||'US';
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
    getFinanceState:function(v){const p=resolveProfile(v)||playerCountryProfile();if(!p)return null;const root=rootState(),fm=ensureFinanceState(p,root);if(reconcileExternalTreasury(p,fm,root))syncEconomyRecord(p,fm,root);return clone(fm);},
    selectCountry:function(v){
      const p=resolveProfile(v);if(!p)return {ok:false,code:'COUNTRY_NOT_FOUND'};
      selectedCountryCode=p.countryCode;global.OmegaMinistryViewCountry=p.countryCode;
      if(global.OmegaCabinetUI)global.OmegaCabinetUI.activeCountry=p.countryCode;
      renderDashboard('finance');return {ok:true,countryCode:p.countryCode};
    },
    selectTab:function(v){const tab=String(v||'overview');if(!['overview','budget','income','treasury','reports','fx','macro','analytics'].includes(tab))return {ok:false,code:'FINANCE_TAB_INVALID'};activeTab=tab;renderDashboard('finance');return {ok:true,tab};},
    getBudgetSnapshot:function(v){const p=resolveProfile(v)||playerCountryProfile();if(!p)return null;const fm=ensureFinanceState(p,rootState());return {countryCode:p.countryCode,...budgetTotals(fm)};},
    getRevenueSnapshot:function(v){const p=resolveProfile(v)||playerCountryProfile();if(!p)return null;const fm=ensureFinanceState(p,rootState()),m=worldSnapshot().byCode.get(p.countryCode)||currentMetrics(p);return revenueState(p,fm,m,rootState());},
    applyAction,advanceTurn,renderDashboard,isFinanceMinistryId};
  global.OmegaFinanceMinistry=api;
  if(global.document){
    global.addEventListener?.('load',function(){init().catch(error=>console.error('[OMEGA FINANCE INIT]',error));},{once:true});
    global.addEventListener?.('OMEGA_READY',function(){init().catch(error=>console.error('[OMEGA FINANCE INIT]',error));},{once:true});
    if(global.document.readyState==='complete'||global.document.readyState==='interactive')Promise.resolve().then(()=>init().catch(()=>{}));
    else global.document.addEventListener?.('DOMContentLoaded',function(){init().catch(()=>{});},{once:true});
  }
})(typeof window!=='undefined'?window:globalThis);
