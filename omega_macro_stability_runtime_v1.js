/* OMEGA Macro Stability Runtime v1.0.0.
 * Additive extension for the existing Finance Ministry and Forex/Monetary Engine.
 * Raw observations and tuning limits are loaded from JSON.
 */
(function(global){
'use strict';
const VERSION='1.0.0';
if(global.OmegaMacroStabilityRuntime&&global.OmegaMacroStabilityRuntime.VERSION===VERSION)return;
let registry=null,rules=null,profiles=[],initialized=false,initPromise=null,observer=null,uiBound=false,lastTurn=null;
const rawByIso=new Map(),rawByCode=new Map();
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const copy=v=>{if(v===undefined)return undefined;try{return JSON.parse(JSON.stringify(v));}catch(_){return v;}};
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function norm(v){return String(v==null?'':v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');}
function dispatch(type,detail){try{if(global.dispatchEvent&&global.CustomEvent)global.dispatchEvent(new global.CustomEvent(type,{detail:copy(detail)}));}catch(_){}}
function fetchJSON(path){if(typeof global.fetchResilient==='function')return global.fetchResilient(path);return global.fetch(path+'?v='+encodeURIComponent(VERSION)).then(r=>{if(!r||r.ok===false)throw new Error('DATA_FETCH_FAILED:'+path);return r.json();});}
function stateCandidates(){const a=[global.Omega&&global.Omega.Simulation&&global.Omega.Simulation.world&&global.Omega.Simulation.world.state,global.Omega&&global.Omega.World&&global.Omega.World.state,global.Game&&global.Game.state,global.gameState];return a.filter((s,i)=>isObj(s)&&a.indexOf(s)===i);}
function rootState(){const all=stateCandidates(),r=all.find(s=>isObj(s.economy)&&Object.keys(s.economy).length);if(r)return r;if(all.length)return all[0];global.gameState=global.gameState||{economy:{},finance:{},simulation:{turn:0}};return global.gameState;}
function financeApi(){return global.OmegaFinanceMinistry||global.Omega&&global.Omega.FinanceMinistry||null;}
function resolveProfile(v){const api=financeApi();if(api&&typeof api.resolveCountry==='function'){const p=api.resolveCountry(v);if(p)return p;}const s=String(v==null?'':v).trim(),n=norm(s);return profiles.find(p=>[p.iso3,p.countryCode,p.numericCode,p.name,p.economyKey].some(x=>String(x||'').toUpperCase()===s.toUpperCase()||norm(x)===n))||null;}
function resolveRaw(p){if(!p)return null;return rawByIso.get(String(p.iso3||'').toUpperCase())||rawByCode.get(String(p.countryCode||'').toUpperCase())||null;}
function playerProfile(){const api=financeApi();if(api&&typeof api.getPlayerCountry==='function'){const p=api.getPlayerCountry();if(p)return p;}const s=rootState(),id=s.simulation&&((s.simulation.session&&s.simulation.session.playerCountryId)||s.simulation.playerCountryId);return resolveProfile(id)||resolveProfile('USA');}
function playerCode(){const p=playerProfile();return p?String(p.iso3||p.countryCode).toUpperCase():null;}
function currentTurn(){const s=rootState(),a=[s.simulation&&s.simulation.turn,s.simulation&&s.simulation.currentTurn,s.turn,global.Omega&&global.Omega.Simulation&&global.Omega.Simulation.clock&&global.Omega.Simulation.clock.turn];for(const v of a){const n=num(v);if(n!==null)return n;}return 0;}
function financeBucket(root,p,create){const f=isObj(root.finance)?root.finance:(create?(root.finance={}):null);if(!f)return null;for(const k of [p.iso3,p.countryCode,p.economyKey,norm(p.name)].filter(Boolean).map(String))if(isObj(f[k]))return f[k];if(!create)return null;return f[p.iso3||p.countryCode]={};}
function economyRecord(root,p,r,create){if(!isObj(root.economy)){if(!create)return null;root.economy={};}if(p.economyKey&&isObj(root.economy[p.economyKey]))return root.economy[p.economyKey];if(create&&p.economyKey&&isObj(p.sourceValues)&&num(r&&r.rawIndicators&&r.rawIndicators.nominalGdpUsd)!==null){root.economy[p.economyKey]=copy(p.sourceValues);return root.economy[p.economyKey];}return null;}
function fxData(p){const fx=global.OmegaForexMonetaryEngine;if(!fx)return{currencyCode:null,inflationTargetPct:null,moneySupplyGrowthPct:null,currencyRegime:null};const code=typeof fx.getCurrencyCode==='function'?fx.getCurrencyCode(p):null,pol=code&&typeof fx.getPolicy==='function'?fx.getPolicy(code):null;return{currencyCode:code||null,inflationTargetPct:num(pol&&pol.inflationTargetPct),moneySupplyGrowthPct:num(pol&&pol.moneySupplyGrowthPct),currencyRegime:pol&&(pol.currencyRegime||pol.regime)||null};}
function ensureModel(p,root){
 root=root||rootState();const r=resolveRaw(p),fb=financeBucket(root,p,true);if(!fb)return null;
 const e=economyRecord(root,p,r,true),fm=isObj(fb.omegaFinance)?fb.omegaFinance:null,m=isObj(fb.macroStability)?fb.macroStability:(fb.macroStability={}),raw=r&&r.rawIndicators||{};
 if(m.schemaVersion!==VERSION){
  const gdp=num(e&&e.gdp)??num(raw.nominalGdpUsd),bal=num(e&&e.budget_balance)??num(raw.governmentBudgetBalanceUsd),tax=num(fm&&fm.policy&&fm.policy.taxRatePct)??18;
  let spend=num(fm&&fm.fiscalModel&&fm.fiscalModel.spendingToGdpPct);
  if(spend===null&&gdp!==null&&gdp>0)spend=bal!==null?tax-bal/gdp*100:tax+3;
  m.schemaVersion=VERSION;m.countryCode=p.iso3||p.countryCode;m.countryName=p.name;m.baselineYear=(r&&r.baselineYear)||2015;
  m.dataStatus=gdp!==null&&gdp>0?'ACTIVE':'DATA_UNAVAILABLE';
  m.baseline={gdpGrowthAnnualPct:num(e&&e.gdp_growth)??num(raw.gdpGrowthAnnualPct),unemploymentRatePct:num(e&&e.unemployment_rate)??num(raw.unemploymentRatePct),spendingToGdpPct:spend===null?null:clamp(spend,0,100)};
  m.policy={stance:'neutral',growthAdjustmentPct:0,spendingAdjustmentPct:0,targetInflationPct:Number(rules.defaultTargetInflationPct||3),targetDebtToGdpPct:Number(rules.defaultTargetDebtToGdpPct||100),targetUnemploymentPct:Number(rules.defaultTargetUnemploymentPct||6)};
  m.automatic={enabled:!!rules.model.automaticStabilizersEnabledByDefault,growthAdjustmentPct:0,spendingAdjustmentPct:0};
  m.lastProcessedTurn=null;m.lastAppliedGrowthPct=null;m.lastAppliedGrowthAdjustmentPct=0;m.lastAppliedSpendingSharePct=null;m.lastAppliedSpendingAdjustmentPct=0;m.revision=0;m.initializedTurn=currentTurn();
 }else{
  if(!isObj(m.policy))m.policy={stance:'neutral',growthAdjustmentPct:0,spendingAdjustmentPct:0,targetInflationPct:Number(rules.defaultTargetInflationPct||3),targetDebtToGdpPct:Number(rules.defaultTargetDebtToGdpPct||100),targetUnemploymentPct:Number(rules.defaultTargetUnemploymentPct||6)};
  if(!isObj(m.automatic))m.automatic={enabled:true,growthAdjustmentPct:0,spendingAdjustmentPct:0};
  if(typeof m.automatic.enabled!=='boolean')m.automatic.enabled=!!rules.model.automaticStabilizersEnabledByDefault;
 }
 return{state:m,bucket:fb,raw:r,rawIndicators:raw,economy:e,finance:fm};
}
function indicators(p){
 const x=ensureModel(p,rootState());if(!x)return null;const m=x.state,e=x.economy||{},raw=x.rawIndicators||{},fm=x.finance||{},fx=fxData(p);
 const gdp=num(e.gdp)??num(raw.nominalGdpUsd),growth=num(e.gdp_growth)??num(m.baseline.gdpGrowthAnnualPct),infl=num(e.inflation)??num(raw.inflationAnnualPct),
  unemployment=num(e.unemployment_rate)??num(m.baseline.unemploymentRatePct),debt=num(e.debt)??num(raw.publicDebtUsd),balance=num(e.budget_balance)??num(raw.governmentBudgetBalanceUsd),
  reserves=num(raw.foreignExchangeReservesUsd),cash=num(fm.treasuryBalanceUsd)??num(x.bucket.available),rate=num(fm.policy&&fm.policy.interestRateAnnualPct),
  spending=num(fm.fiscalModel&&fm.fiscalModel.annualSpendingUsd),revenue=num(fm.fiscalModel&&fm.fiscalModel.annualRevenueUsd),
  debtPct=debt!==null&&gdp!==null&&gdp>0?debt/gdp*100:null,balancePct=balance!==null&&gdp!==null&&gdp>0?balance/gdp*100:null;
 const targetInfl=fx.inflationTargetPct??num(m.policy.targetInflationPct),targetDebt=num(m.policy.targetDebtToGdpPct),targetU=num(m.policy.targetUnemploymentPct),w=rules.stabilityWeights||{},f=[];
 if(debtPct!==null&&targetDebt!==null&&targetDebt>0)f.push([clamp(debtPct/targetDebt*100,0,100),num(w.debt)||0]);
 if(infl!==null&&targetInfl!==null)f.push([clamp(Math.abs(infl-targetInfl)/Math.max(Math.abs(targetInfl),2)*100,0,100),num(w.inflationGap)||0]);
 if(unemployment!==null&&targetU!==null&&targetU>0)f.push([clamp(unemployment/targetU*100,0,100),num(w.unemployment)||0]);
 if(balancePct!==null)f.push([clamp(Math.max(0,-balancePct)/Number(rules.stabilityDeficitLimitPct||20)*100,0,100),num(w.budgetDeficit)||0]);
 const totalWeight=f.reduce((s,a)=>s+a[1],0),score=f.length&&totalWeight>0?Number((100-f.reduce((s,a)=>s+a[0]*a[1],0)/totalWeight).toFixed(2)):null;
 const fields=rules.coverageFields||[],present=fields.filter(k=>raw[k]!==null&&raw[k]!==undefined).length,status=score===null?'INSUFFICIENT_DATA':score>=75?'STABLE':score>=50?'WATCH':'STRESSED';
 return{countryCode:p.iso3||p.countryCode,countryName:p.name,dataStatus:m.dataStatus,baselineYear:m.baselineYear,gdpUsd:gdp,gdpGrowthAnnualPct:growth,inflationAnnualPct:infl,inflationTargetPct:targetInfl,unemploymentRatePct:unemployment,publicDebtUsd:debt,debtToGdpPct:debtPct,annualBudgetBalanceUsd:balance,budgetBalanceToGdpPct:balancePct,foreignExchangeReservesUsd:reserves,treasuryBalanceUsd:cash,policyInterestRateAnnualPct:rate,annualSpendingUsd:spending,annualRevenueUsd:revenue,targetDebtToGdpPct:targetDebt,targetUnemploymentPct:targetU,stabilityScore:score,stabilityStatus:status,rawBaselineFieldsPresent:present,rawBaselineFieldsTotal:fields.length,rawBaselineCoveragePct:fields.length?Number((present/fields.length*100).toFixed(1)):0,policyStance:m.policy.stance,automaticStabilizersEnabled:!!m.automatic.enabled,lastProcessedTurn:m.lastProcessedTurn,currencyCode:fx.currencyCode,currencyRegime:fx.currencyRegime,moneySupplyGrowthPct:fx.moneySupplyGrowthPct};
}
function applyAction(action){
 action=isObj(action)?action:{};const type=String(action.type||'').toLowerCase().replace(/_/g,'-'),p=resolveProfile(action.countryId||action.countryCode)||selectedProfile();
 if(!p)return{ok:false,code:'COUNTRY_NOT_FOUND'};if(String(p.iso3||p.countryCode).toUpperCase()!==playerCode())return{ok:false,code:'PLAYER_COUNTRY_SCOPE_VIOLATION'};
 const x=ensureModel(p,rootState());if(!x)return{ok:false,code:'MACRO_STATE_UNAVAILABLE'};const m=x.state;
 if(type==='set-policy'||type==='set-macro-policy'){const stance=String(action.policy||action.stance||'').toLowerCase();if(!own(rules.policies,stance))return{ok:false,code:'MACRO_POLICY_INVALID'};m.policy.stance=stance;}
 else if(type==='set-controls'||type==='set-targets'){
  const fields=[['growthAdjustmentPct','minimumGrowthAdjustmentPct','maximumGrowthAdjustmentPct'],['spendingAdjustmentPct','minimumSpendingAdjustmentPct','maximumSpendingAdjustmentPct'],['targetDebtToGdpPct','minimumTargetDebtToGdpPct','maximumTargetDebtToGdpPct'],['targetUnemploymentPct','minimumTargetUnemploymentPct','maximumTargetUnemploymentPct']];
  for(const[field,min,max]of fields){if(action[field]===undefined||action[field]===null||action[field]==='')continue;const v=num(action[field]);if(v===null||v<Number(rules[min])||v>Number(rules[max]))return{ok:false,code:'MACRO_CONTROL_OUT_OF_RANGE',field};m.policy[field]=v;}
  if(action.automaticStabilizersEnabled!==undefined){const v=action.automaticStabilizersEnabled;m.automatic.enabled=!(v===false||String(v).toLowerCase()==='false'||String(v).toLowerCase()==='off'||String(v)==='0'||String(v)==='');if(!m.automatic.enabled){m.automatic.growthAdjustmentPct=0;m.automatic.spendingAdjustmentPct=0;}}
 }else if(type==='enable-stabilizers')m.automatic.enabled=true;
 else if(type==='disable-stabilizers'){m.automatic.enabled=false;m.automatic.growthAdjustmentPct=0;m.automatic.spendingAdjustmentPct=0;}
 else return{ok:false,code:'MACRO_ACTION_UNKNOWN'};
 m.revision=(num(m.revision)||0)+1;dispatch('OMEGA_MACRO_STABILITY_STATE_UPDATED',{countryCode:p.iso3||p.countryCode,action:type,revision:m.revision});refreshPanel();
 return{ok:true,code:'MACRO_STATE_UPDATED',countryCode:p.iso3||p.countryCode,policy:copy(m.policy),automaticStabilizersEnabled:m.automatic.enabled};
}
function advanceTurn(turn,stepMs){
 if(!initialized)return{ok:false,code:'MACRO_RUNTIME_NOT_INITIALIZED',processed:0};
 const t=num(turn)??currentTurn()+1,dt=Math.max(0,num(stepMs)??Number(rules.simulationTurnDurationMs||3600000)),years=dt/Number(rules.annualizationMs||31536000000),root=rootState();let processed=0,unavailable=0;const updated=[];
 for(const p of profiles){
  const x=ensureModel(p,root);if(!x)continue;const m=x.state,e=x.economy,raw=x.rawIndicators,fm=x.finance;
  if(num(m.lastProcessedTurn)!==null&&t<=num(m.lastProcessedTurn))continue;
  if(!e||num(e.gdp)===null||num(e.gdp)<=0||num(raw.nominalGdpUsd)===null){m.dataStatus='DATA_UNAVAILABLE';m.lastProcessedTurn=t;unavailable++;continue;}
  if(years<=0){m.lastProcessedTurn=t;continue;}
  const preset=rules.policies[m.policy.stance]||rules.policies.neutral;
  let baselineGrowth=num(m.baseline.gdpGrowthAnnualPct)??num(raw.gdpGrowthAnnualPct)??num(e.gdp_growth)??0;
  const previous=num(m.lastAppliedGrowthPct),current=num(e.gdp_growth);
  if(previous!==null&&current!==null&&Math.abs(current-previous)>0.00001){baselineGrowth=current-(num(m.lastAppliedGrowthAdjustmentPct)||0);m.baseline.gdpGrowthAnnualPct=baselineGrowth;}
  const policyGrowth=(num(preset.growthAdjustmentPct)||0)+(num(m.policy.growthAdjustmentPct)||0),autoGrowth=m.automatic.enabled?(num(m.automatic.growthAdjustmentPct)||0):0;
  const growth=clamp(baselineGrowth+policyGrowth+autoGrowth,Number(rules.minimumEffectiveGrowthPct||-25),Number(rules.maximumEffectiveGrowthPct||25));
  e.gdp_growth=growth;m.lastAppliedGrowthPct=growth;m.lastAppliedGrowthAdjustmentPct=policyGrowth+autoGrowth;
  const oldUnemployment=num(e.unemployment_rate)??num(m.baseline.unemploymentRatePct)??num(raw.unemploymentRatePct);
  if(oldUnemployment!==null){const response=-(growth-baselineGrowth)*Number(rules.model.unemploymentGrowthSensitivity||0),change=clamp((num(preset.unemploymentChangePpPerYear)||0)+response,-Number(rules.model.maximumUnemploymentChangePpPerYear||2),Number(rules.model.maximumUnemploymentChangePpPerYear||2))*years;e.unemployment_rate=clamp(oldUnemployment+change,0,100);}
  const gdp=num(e.gdp),debt=num(e.debt)??num(raw.publicDebtUsd),inflation=num(e.inflation)??num(raw.inflationAnnualPct),unemployment=num(e.unemployment_rate)??oldUnemployment,
    debtPct=debt!==null&&gdp>0?debt/gdp*100:null,targetInfl=fxData(p).inflationTargetPct??num(m.policy.targetInflationPct),
    targetDebt=num(m.policy.targetDebtToGdpPct),targetU=num(m.policy.targetUnemploymentPct),mod=rules.model;
  if(m.automatic.enabled){
   const spendStep=Number(mod.automaticStabilizerSpendingStepPctGdpPerYear||0)*years,weakGrowth=growth<=Number(mod.recessionGrowthTriggerPct||-1),
    highUnemployment=unemployment!==null&&targetU!==null&&unemployment>=targetU+Number(mod.automaticUnemploymentGapPp||2),
    inflationSafe=inflation===null||targetInfl===null||inflation<=targetInfl+Number(mod.inflationHeadroomPp||2),
    fiscalSafe=debtPct===null||targetDebt===null||debtPct<=targetDebt*1.5;
   if((weakGrowth||highUnemployment)&&inflationSafe&&fiscalSafe){
    m.automatic.spendingAdjustmentPct=clamp((num(m.automatic.spendingAdjustmentPct)||0)+spendStep,0,Number(mod.maximumAutomaticSpendingAdjustmentPctGdp||3));
    m.automatic.growthAdjustmentPct=clamp((num(m.automatic.growthAdjustmentPct)||0)+Number(mod.automaticStabilizerGrowthStepPpPerYear||0)*years,0,Number(mod.maximumAutomaticGrowthAdjustmentPct||2));
   }else if((inflation!==null&&targetInfl!==null&&inflation>targetInfl+Number(mod.inflationHeadroomPp||2))||(debtPct!==null&&targetDebt!==null&&debtPct>targetDebt*1.5)){
    m.automatic.spendingAdjustmentPct=clamp((num(m.automatic.spendingAdjustmentPct)||0)-spendStep,-Number(mod.maximumAutomaticSpendingAdjustmentPctGdp||3),0);
    m.automatic.growthAdjustmentPct=clamp((num(m.automatic.growthAdjustmentPct)||0)-Number(mod.automaticStabilizerGrowthStepPpPerYear||0)*years,-Number(mod.maximumAutomaticGrowthAdjustmentPct||2),Number(mod.maximumAutomaticGrowthAdjustmentPct||2));
   }else{const decay=Math.max(0,1-Number(mod.recoveryDecayPerYear||0)*years);m.automatic.spendingAdjustmentPct=(num(m.automatic.spendingAdjustmentPct)||0)*decay;m.automatic.growthAdjustmentPct=(num(m.automatic.growthAdjustmentPct)||0)*decay;}
  }
  if(fm&&isObj(fm.fiscalModel)){
   const oldShare=num(fm.fiscalModel.spendingToGdpPct);
   if(num(m.lastAppliedSpendingSharePct)!==null&&oldShare!==null&&Math.abs(oldShare-num(m.lastAppliedSpendingSharePct))>0.001)m.baseline.spendingToGdpPct=clamp(oldShare-(num(m.lastAppliedSpendingAdjustmentPct)||0),0,100);
   const baseSpend=num(m.baseline.spendingToGdpPct);
   if(baseSpend!==null){const adjustment=(num(preset.spendingAdjustmentPct)||0)+(num(m.policy.spendingAdjustmentPct)||0)+(m.automatic.enabled?(num(m.automatic.spendingAdjustmentPct)||0):0),
      share=clamp(baseSpend+adjustment,0,100),currentGdp=num(e.gdp)??num(raw.nominalGdpUsd);
    fm.fiscalModel.spendingToGdpPct=share;
    if(currentGdp!==null&&currentGdp>0){fm.fiscalModel.annualSpendingUsd=currentGdp*share/100;
     const revenue=num(fm.fiscalModel.annualRevenueUsd)??currentGdp*(num(fm.policy&&fm.policy.taxRatePct)??18)/100;
     fm.fiscalModel.annualRevenueUsd=revenue;fm.fiscalModel.annualBudgetBalanceUsd=revenue-fm.fiscalModel.annualSpendingUsd;
     fm.fiscalModel.macroStabilityAdjustmentPctGdp=share-baseSpend;e.budget_balance=fm.fiscalModel.annualBudgetBalanceUsd;}
    m.lastAppliedSpendingSharePct=share;m.lastAppliedSpendingAdjustmentPct=adjustment;
   }
  }
  m.dataStatus='ACTIVE_SIMULATION';m.lastProcessedTurn=t;m.revision=(num(m.revision)||0)+1;m.lastMetrics=indicators(p);updated.push(p.iso3||p.countryCode);processed++;
 }
 lastTurn=t;const fx=global.OmegaForexMonetaryEngine;if(fx&&typeof fx.syncGovernmentBanking==='function'){try{fx.syncGovernmentBanking();}catch(_){}}
 dispatch('OMEGA_MACRO_STABILITY_TURN_PROCESSED',{turn:t,processed,unavailable,playerCountryCode:playerCode(),updatedCountryCodes:updated});refreshPanel();
 return{ok:true,turn:t,processed,unavailable};
}
function money(v){
  const n=num(v);if(n===null)return'N/A';
  const format=global.OmegaNumberFormat;
  if(format&&typeof format.money==='function')return format.money(n,{unavailable:'N/A'});
  const abs=Math.abs(n);
  const scale=abs>=1e12?{value:1e12,label:'trillion'}:abs>=1e9?{value:1e9,label:'billion'}:abs>=1e6?{value:1e6,label:'million'}:abs>=1e3?{value:1e3,label:'thousand'}:null;
  if(scale){let amount;try{amount=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(abs/scale.value);}catch(_){amount=(abs/scale.value).toFixed(2).replace(/\\.?0+$/,'');}return(n<0?'-':'')+'$'+amount+' '+scale.label;}
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);}catch(_){return(n<0?'-':'')+'$'+Math.round(abs).toLocaleString('en-US');}
}
function pct(v){const n=num(v);return n===null?'N/A':n.toFixed(2)+'%';}
function nfmt(v,d){
  const n=num(v);if(n===null)return'N/A';
  const format=global.OmegaNumberFormat;
  return format&&typeof format.compact==='function'?format.compact(n,{maximumFractionDigits:d===undefined?2:d}):n.toLocaleString('en-US',{maximumFractionDigits:d===undefined?2:d});
}
function selectedProfile(){const doc=global.document,sel=doc&&doc.getElementById&&doc.getElementById('ofm-country-select');return(sel&&sel.value&&resolveProfile(sel.value))||playerProfile();}
function panelHTML(p){
 const x=ensureModel(p,rootState()),m=x&&x.state||{},v=indicators(p)||{},fx=fxData(p),editable=String(p.iso3||p.countryCode).toUpperCase()===playerCode(),stance=m.policy&&m.policy.stance||'neutral';
 const options=Object.keys(rules.policies||{}).map(k=>'<option value="'+esc(k)+'"'+(stance===k?' selected':'')+'>'+esc(rules.policies[k].label||k)+'</option>').join('');
 const controls=editable?'<div class="omss-forms"><form data-omss-action="set-policy"><label>Macroeconomic policy<select name="policy">'+options+'</select></label><button type="submit">Apply stance</button></form><form data-omss-action="set-controls"><div class="omss-grid-input">'+
 '<label>GDP growth adjustment (pp/year)<input type="number" name="growthAdjustmentPct" min="'+Number(rules.minimumGrowthAdjustmentPct)+'" max="'+Number(rules.maximumGrowthAdjustmentPct)+'" step="0.1" value="'+esc(m.policy.growthAdjustmentPct)+'"></label>'+
 '<label>Public spending adjustment (% GDP)<input type="number" name="spendingAdjustmentPct" min="'+Number(rules.minimumSpendingAdjustmentPct)+'" max="'+Number(rules.maximumSpendingAdjustmentPct)+'" step="0.1" value="'+esc(m.policy.spendingAdjustmentPct)+'"></label>'+
 '<label>Debt/GDP target (%)<input type="number" name="targetDebtToGdpPct" min="'+Number(rules.minimumTargetDebtToGdpPct)+'" max="'+Number(rules.maximumTargetDebtToGdpPct)+'" step="1" value="'+esc(m.policy.targetDebtToGdpPct)+'"></label>'+
 '<label>Unemployment target (%)<input type="number" name="targetUnemploymentPct" min="'+Number(rules.minimumTargetUnemploymentPct)+'" max="'+Number(rules.maximumTargetUnemploymentPct)+'" step="0.1" value="'+esc(m.policy.targetUnemploymentPct)+'"></label>'+
 '<label class="omss-check"><input type="hidden" name="automaticStabilizersEnabled" value="false"><input type="checkbox" name="automaticStabilizersEnabled" value="true"'+(m.automatic.enabled?' checked':'')+'> Automatic stabilizers</label></div><button type="submit">Save macro controls</button></form></div>':'<p class="omss-readonly">READ-ONLY COUNTRY PROFILE. Macro controls are restricted to the active player country.</p>';
 return'<section id="omss-panel" class="omss-panel" data-country-code="'+esc(p.iso3||p.countryCode)+'"><header class="omss-header"><div><span class="omss-eyebrow">OMEGA / NATIONAL ECONOMIC CONTROL</span><h3>Macroeconomic Stability</h3><p>'+esc(p.name)+' · baseline '+esc((x&&x.raw&&x.raw.baselineYear)||2015)+' · '+esc(v.dataStatus||'DATA UNAVAILABLE')+'</p></div><span class="omss-status '+esc(String(v.stabilityStatus||'INSUFFICIENT_DATA').toLowerCase())+'">'+esc(v.stabilityStatus||'INSUFFICIENT DATA')+'</span></header><div class="omss-kpis">'+
 '<div><span>GDP</span><strong>'+money(v.gdpUsd)+'</strong><small>Finance simulation state</small></div><div><span>GDP growth</span><strong>'+pct(v.gdpGrowthAnnualPct)+'</strong><small>Baseline and policy adjustments</small></div><div><span>Inflation</span><strong>'+pct(v.inflationAnnualPct)+'</strong><small>Target '+pct(v.inflationTargetPct)+' · monetary engine</small></div><div><span>Unemployment</span><strong>'+pct(v.unemploymentRatePct)+'</strong><small>Modeled turn-to-turn change</small></div><div><span>Public debt/GDP</span><strong>'+pct(v.debtToGdpPct)+'</strong><small>Target '+pct(v.targetDebtToGdpPct)+'</small></div><div><span>Annual budget balance</span><strong>'+money(v.annualBudgetBalanceUsd)+'</strong><small>'+pct(v.budgetBalanceToGdpPct)+' of GDP</small></div><div><span>Treasury cash</span><strong>'+money(v.treasuryBalanceUsd)+'</strong><small>Existing Finance ledger</small></div><div><span>FX reserves</span><strong>'+money(v.foreignExchangeReservesUsd)+'</strong><small>Source baseline if available</small></div><div><span>Stability score</span><strong>'+nfmt(v.stabilityScore,1)+'/100</strong><small>Game model, not a credit rating</small></div></div>'+
 '<div class="omss-meta"><span>Raw baseline coverage: <strong>'+nfmt(v.rawBaselineFieldsPresent,0)+' / '+nfmt(v.rawBaselineFieldsTotal,0)+'</strong> ('+pct(v.rawBaselineCoveragePct)+')</span><span>Policy: <strong>'+esc((rules.policies[stance]&&rules.policies[stance].label)||stance)+'</strong> · stabilizers <strong>'+(m.automatic.enabled?'ON':'OFF')+'</strong></span><span>Currency: <strong>'+esc(fx.currencyCode||'N/A')+'</strong> · regime <strong>'+esc(fx.currencyRegime||'N/A')+'</strong></span></div>'+controls+
 '<p class="omss-note">The existing Forex/Monetary Authority controls money supply and inflation targets. This panel adds GDP-growth, spending and employment policy. Historical data use the repository 2015 baseline; missing values remain unavailable, not zero.</p></section>';
}
function injectPanel(){const doc=global.document,host=doc&&doc.getElementById&&doc.getElementById('ministry-dashboard-content');if(!host||typeof host.querySelector!=='function')return;const dashboard=host.querySelector('.ofm-dashboard'),mount=dashboard&&dashboard.querySelector('[data-omss-container]');if(!dashboard||!mount)return;const sel=host.querySelector('#ofm-country-select'),p=(sel&&resolveProfile(sel.value))||playerProfile();if(!p)return;const old=mount.querySelector('#omss-panel'),code=String(p.iso3||p.countryCode);if(old&&old.getAttribute('data-country-code')===code)return;if(old&&old.parentNode)old.parentNode.removeChild(old);const el=doc.createElement('div');el.innerHTML=panelHTML(p);if(el.firstElementChild)mount.appendChild(el.firstElementChild);}
function refreshPanel(){const doc=global.document,host=doc&&doc.getElementById&&doc.getElementById('ministry-dashboard-content');if(!host||typeof host.querySelector!=='function')return;const dashboard=host.querySelector('.ofm-dashboard'),mount=dashboard&&dashboard.querySelector('[data-omss-container]');if(!mount)return;const old=mount.querySelector('#omss-panel');if(!old){injectPanel();return;}const p=resolveProfile(old.getAttribute('data-country-code'));if(!p)return;const el=doc.createElement('div');el.innerHTML=panelHTML(p);if(el.firstElementChild&&old.parentNode)old.parentNode.replaceChild(el.firstElementChild,old);}
function attachUI(){if(uiBound)return;uiBound=true;const doc=global.document,host=doc&&doc.getElementById&&doc.getElementById('ministry-dashboard-content');if(host&&host.addEventListener)host.addEventListener('submit',function(event){const form=event.target,action=form&&form.getAttribute&&form.getAttribute('data-omss-action');if(!action)return;event.preventDefault();const p=selectedProfile(),payload={type:action,countryId:p&&p.iso3};for(const input of Array.from(form.elements||[])){if(!input.name)continue;if(String(input.type).toLowerCase()==='checkbox'&&!input.checked)continue;payload[input.name]=input.value;}const result=applyAction(payload);if(!result.ok&&global.console&&global.console.warn)global.console.warn('[OMEGA MACRO STABILITY]',result.code);refreshPanel();});global.addEventListener&&global.addEventListener('OMEGA_MACRO_STABILITY_STATE_UPDATED',refreshPanel);global.addEventListener&&global.addEventListener('OMEGA_FINANCE_STATE_UPDATED',refreshPanel);if(doc&&typeof global.MutationObserver==='function'){const target=doc.getElementById('ministry-dashboard-content');if(target){observer=new global.MutationObserver(()=>injectPanel());observer.observe(target,{childList:true,subtree:true});}}injectPanel();}
async function init(){if(initialized)return diagnostics();if(initPromise)return initPromise;initPromise=(async function(){const finance=financeApi();if(finance&&typeof finance.init==='function')await finance.init();const v=await Promise.all([fetchJSON('economy_raw_financial_data_v2.json'),fetchJSON('finance_macro_stability_rules_v1.json')]);registry=v[0];rules=v[1];if(!Array.isArray(registry.countries)||!registry.countries.length)throw new Error('RAW_FINANCIAL_REGISTRY_INVALID');const real=finance&&typeof finance.getProfiles==='function'?finance.getProfiles():[];profiles=real.length?real:registry.countries.map(r=>({countryCode:r.countryCode,iso3:r.iso3,numericCode:r.numericCode,name:r.name,economyKey:r.economyKey,profileStatus:r.profileStatus,sourceValues:r.rawSourceRecords.economy,indicators:{gdpCurrentUsd:r.rawIndicators.nominalGdpUsd}}));for(const r of registry.countries){rawByIso.set(String(r.iso3||'').toUpperCase(),r);rawByCode.set(String(r.countryCode||'').toUpperCase(),r);rawByCode.set(String(r.numericCode||'').toUpperCase(),r);}for(const p of profiles)ensureModel(p,rootState());initialized=true;attachUI();global.Omega=global.Omega||{};global.Omega.MacroStabilityRuntime=api;dispatch('OMEGA_MACRO_STABILITY_RUNTIME_READY',diagnostics());return diagnostics();})();try{return await initPromise;}finally{if(!initialized)initPromise=null;}}
function diagnostics(){const rows=registry&&registry.countries||[];return{version:VERSION,initialized,countryCount:rows.length,profileCount:profiles.length,sourceEconomyRecordCount:rows.filter(r=>!!r.rawSourceRecords.economy).length,sourcePopulationRecordCount:rows.filter(r=>!!r.rawSourceRecords.population).length,profilesWithGDP:rows.filter(r=>num(r.rawIndicators.nominalGdpUsd)!==null).length,unavailableGDPProfiles:rows.filter(r=>num(r.rawIndicators.nominalGdpUsd)===null).length,rawFieldCount:registry&&registry.metadata&&registry.metadata.rawFieldCount||0,simulationTurn:lastTurn,playerCountryCode:playerCode(),actions:['set-policy','set-controls','enable-stabilizers','disable-stabilizers']};}
const api={VERSION,init,diagnostics,resolveCountry:resolveProfile,getRawProfile:v=>copy(resolveRaw(resolveProfile(v))),getMacroState:v=>{const p=resolveProfile(v)||playerProfile(),x=ensureModel(p,rootState());return x?copy(x.state):null;},getIndicators:v=>{const p=resolveProfile(v)||playerProfile();return p?copy(indicators(p)):null;},applyAction,advanceTurn,refreshPanel};
global.OmegaMacroStabilityRuntime=api;
if(global.document){global.addEventListener&&global.addEventListener('OMEGA_FINANCE_RUNTIME_READY',()=>init().catch(e=>global.console&&global.console.error&&global.console.error('[OMEGA MACRO INIT]',e)));global.addEventListener&&global.addEventListener('OMEGA_FX_MONETARY_RUNTIME_READY',()=>init().catch(e=>global.console&&global.console.error&&global.console.error('[OMEGA MACRO INIT]',e)));global.addEventListener&&global.addEventListener('OMEGA_READY',()=>init().catch(e=>global.console&&global.console.error&&global.console.error('[OMEGA MACRO INIT]',e)));if(global.OmegaFinanceMinistry)Promise.resolve().then(()=>init().catch(e=>global.console&&global.console.error&&global.console.error('[OMEGA MACRO INIT]',e)));else global.document.addEventListener&&global.document.addEventListener('DOMContentLoaded',()=>init().catch(e=>global.console&&global.console.error&&global.console.error('[OMEGA MACRO INIT]',e)),{once:true});global.addEventListener&&global.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',event=>{const d=event&&event.detail||{},turn=num(d.simulationTurn)??num(d.payload&&d.payload.turn)??num(d.turn),duration=num(global.Omega&&global.Omega.Simulation&&global.Omega.Simulation.clock&&global.Omega.Simulation.clock.stepDurationMs)??Number(rules&&rules.simulationTurnDurationMs||3600000);init().then(()=>advanceTurn(turn,duration)).catch(e=>global.console&&global.console.error&&global.console.error('[OMEGA MACRO TURN]',e));});}
})(typeof window!=='undefined'?window:globalThis);
