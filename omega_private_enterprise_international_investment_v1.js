/* OMEGA PRIVATE ENTERPRISE INTERNATIONAL INVESTMENT RUNTIME v1.0.0
 * Country-wide five-company capital seeding and reviewed cross-border private equity.
 *
 * Foreign capital enters the host country's existing companyCapitalAccounts. It does not
 * create a parallel factory simulator, debit sovereign Treasury, or fabricate production
 * and employment. A host company must use the existing proposal -> government permit ->
 * company funding -> construction -> verified commissioning pipeline before output begins.
 */
(function(g){
'use strict';
var VERSION='1.0.0',HANDLER_ID='omega.private-enterprise-international-investment.v1';
var COMPANY_IDS=[
 'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
 'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
];
var inflight=new Map(),initialized=new Map(),lastError=null,unregister=null,registered=false,initScheduled=false,listenersBound=false;
var MAX_INVESTMENT_PROPOSALS=500,MAX_INVESTMENT_HISTORY=1000;
function obj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function num(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return Number.isFinite(n)?n:null;}
function id(v){return String(v==null?'':v).trim().toUpperCase();}
function roundMoney(v){return Math.round((Number(v)||0)*100)/100;}
function centExact(v){var n=num(v);return n!==null&&Number.isSafeInteger(Math.round(n*100))&&Math.abs(n-Math.round(n*100)/100)<=1e-7;}
function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&k!=='constructor')o[k]=clone(v[k]);});return o;}
function canonicalCountry(v){
 var raw=id(v);if(/^[A-Z]{3}$/.test(raw))return raw;
 var registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega&&g.Omega.CanonicalIdentity;
 try{
  var hit=registry&&registry.resolveCountry?registry.resolveCountry(v):null;
  var row=hit&&((hit.raw&&hit.raw.raw)||hit.raw||{});
  var code=id(row.iso3||row.iso3Code||row.ISO_A3||row.iso_a3||hit&&hit.iso3||hit&&hit.iso3Code);
  if(/^[A-Z]{3}$/.test(code))return code;
 }catch(_){}
 return raw;
}
function worldState(){
 var sim=g.Omega&&(g.Omega.SimulationRuntime||g.Omega.Simulation);
 if(obj(sim&&sim.world&&sim.world.state))return sim.world.state;
 if(obj(g.Omega&&g.Omega.World&&g.Omega.World.state))return g.Omega.World.state;
 return g.Game&&obj(g.Game.state)?g.Game.state:(obj(g.gameState)?g.gameState:null);
}
function playerCountry(){
 var s=worldState()||{},sim=g.Omega&&(g.Omega.SimulationRuntime||g.Omega.Simulation),values=[];
 try{if(sim&&typeof sim.getPlayerCountryId==='function')values.push(sim.getPlayerCountryId());}catch(_){}
 values.push(s.simulation&&s.simulation.session&&s.simulation.session.playerCountryId,
  s.simulation&&s.simulation.playerCountryId,s.playerCountryId,s.playerCountryCode,
  g.Game&&(g.Game.playerCountryId||g.Game.playerCountryCode||g.Game.playerCountry));
 for(var i=0;i<values.length;i++){var cid=canonicalCountry(values[i]);if(/^[A-Z]{3}$/.test(cid))return cid;}
 return '';
}
function countryBucket(domain,country,create){
 var s=worldState();if(!s)return null;
 if(!obj(s[domain])){if(!create)return null;s[domain]={};}
 var root=s[domain],cid=canonicalCountry(country),key=Object.prototype.hasOwnProperty.call(root,cid)?cid:null;
 if(!key){
  var keys=Object.keys(root);
  for(var i=0;i<keys.length;i++)if(canonicalCountry(keys[i])===cid){key=keys[i];break;}
 }
 if(!key&&create)key=cid;
 if(!key)return null;
 if(!obj(root[key])){if(!create)return null;root[key]={};}
 return root[key];
}
function dependencies(){
 return{
  capital:g.OmegaPrivateCompanyCapitalRuntimeV1||(g.Omega&&g.Omega.PrivateCompanyCapitalRuntimeV1),
  lifecycle:g.OmegaPrivateEnterpriseLifecycleV1||(g.Omega&&g.Omega.PrivateEnterpriseLifecycleV1),
  privateRegistry:g.OmegaPrivateEnterpriseRegistryV1||(g.Omega&&g.Omega.PrivateEnterpriseRegistryV1),
  governmentRegistry:g.OmegaCountryFactoryStartingBaselineV1||(g.Omega&&g.Omega.CountryFactoryStartingBaselineV1),
  countryRuntime:g.OmegaCountryRuntimeData,
  generalRuntime:g.OmegaCountryGeneralDataRuntime||(g.Omega&&g.Omega.CountryGeneralData),
  finance:g.OmegaFinanceMinistry||(g.Omega&&g.Omega.FinanceMinistry),
  forex:g.OmegaForexMonetaryEngine||(g.Omega&&g.Omega.ForexMonetaryEngine),
  scheduler:g.OmegaWorldSimulationScheduler||(g.Omega&&g.Omega.WorldSimulationScheduler)
 };
}
var deps=null,dependenciesPromise=null;
function readyDependencies(){
 if(dependenciesPromise)return dependenciesPromise;
 deps=dependencies();
 if(!deps.capital||typeof deps.capital.buildPlan!=='function'||
    !deps.privateRegistry||!deps.governmentRegistry||!deps.countryRuntime||!deps.finance)
  return Promise.resolve({status:'WAITING',reason:'PRIVATE_ENTERPRISE_GLOBAL_DEPENDENCIES_NOT_READY'});
 dependenciesPromise=Promise.all([
  Promise.resolve(deps.privateRegistry.ready).catch(function(){return null;}),
  Promise.resolve(deps.governmentRegistry.ready).catch(function(){return null;}),
  Promise.resolve(deps.countryRuntime.ready).catch(function(){return false;}),
  Promise.resolve(deps.finance.init&&deps.finance.init()).catch(function(){return null;})
 ]).then(function(){return{status:'READY'};}).catch(function(error){
  dependenciesPromise=null;lastError=String(error&&error.message||error);
  return{status:'BLOCKED',reason:lastError};
 });
 return dependenciesPromise;
}
function financeRoot(country,create){
 var bucket=countryBucket('finance',country,create);if(!bucket)return null;
 if(!obj(bucket.omegaFinance)&&create)bucket.omegaFinance={};
 var root=obj(bucket.omegaFinance)?bucket.omegaFinance:null;
 if(root&&create&&!Array.isArray(root.ledger))root.ledger=[];
 return root;
}
function capitalAccounts(country,create){
 var root=financeRoot(country,create);if(!root)return null;
 if(!obj(root.companyCapitalAccounts)&&create)root.companyCapitalAccounts={};
 return obj(root.companyCapitalAccounts)?root.companyCapitalAccounts:null;
}
function companyAccount(country,company,create){
 var accounts=capitalAccounts(country,create);if(!accounts)return null;
 var key=id(company);
 if(!obj(accounts[key])&&create)accounts[key]={companyId:key,currency:'GAME_CURRENCY_UNITS',
  availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
 return obj(accounts[key])?accounts[key]:null;
}
function accountHasHistory(account,ledger,company){
 if(['availableBalance','reservedBalance','capitalRaised','capitalSpent','retainedEarningsBalance']
  .some(function(key){return Math.abs(num(account&&account[key])||0)>1e-9;}))return true;
 return (Array.isArray(ledger)?ledger:[]).some(function(row){
  return row&&id(row.companyId)===company&&String(row.status||'').toUpperCase()==='POSTED'&&
   !/OPENING_CAPITAL/.test(String(row.type||''));
 });
}
function initializeNpcCompanyCapital(country,plan){
 var cid=canonicalCountry(country),root=financeRoot(cid,true),ledger=root&&(Array.isArray(root.ledger)?root.ledger:(root.ledger=[])),
  accounts=capitalAccounts(cid,true),seeded=[],preserved=[],duplicates=[];
 if(!root||!ledger||!accounts)return{status:'BLOCKED',reason:'COUNTRY_COMPANY_FINANCE_STATE_UNAVAILABLE',countryId:cid};
 if(!plan||plan.countryId!==cid||!id(plan.currencyCode)||!Array.isArray(plan.companyAllocations)||
    plan.companyAllocations.length!==COMPANY_IDS.length||!centExact(plan.totalOpeningCapital))
  return{status:'BLOCKED',reason:'COUNTRY_COMPANY_OPENING_PLAN_INVALID',countryId:cid};
 var allocations=new Map(),sum=0;
 plan.companyAllocations.forEach(function(row){
  var company=id(row.companyId),amount=num(row.amount);
  if(COMPANY_IDS.indexOf(company)<0||allocations.has(company)||amount===null||amount<=0||!centExact(amount))
   throw Error('COUNTRY_COMPANY_OPENING_ALLOCATION_INVALID:'+company);
  allocations.set(company,row);sum+=amount;
 });
 if(COMPANY_IDS.some(function(company){return !allocations.has(company);})||Math.abs(sum-plan.totalOpeningCapital)>.02)
  return{status:'BLOCKED',reason:'COUNTRY_COMPANY_OPENING_TOTAL_MISMATCH',countryId:cid};
 for(var i=0;i<COMPANY_IDS.length;i++){
  var company=COMPANY_IDS[i],allocation=allocations.get(company),amount=num(allocation.amount),
   tx='PRIVATE-OPENING-CAPITAL-V1:'+cid+':'+company,
   existing=ledger.find(function(row){return row&&String(row.transactionId||'')===tx;}),
   account=companyAccount(cid,company,true);
  if(existing){
   if(id(existing.companyId)!==company||id(existing.currency)!==id(plan.currencyCode)||
      num(existing.amount)===null||Math.abs(num(existing.amount)-amount)>.02)
    return{status:'BLOCKED',reason:'OPENING_CAPITAL_IDEMPOTENCY_COLLISION',countryId:cid,companyId:company};
   duplicates.push(company);continue;
  }
  if(accountHasHistory(account,ledger,company)){preserved.push(company);continue;}
  var oldCurrency=id(account.currency);
  if(oldCurrency&&oldCurrency!=='GAME_CURRENCY_UNITS'&&oldCurrency!==id(plan.currencyCode)&&
     ['availableBalance','reservedBalance','capitalRaised','capitalSpent'].some(function(k){return Math.abs(num(account[k])||0)>1e-9;}))
   return{status:'BLOCKED',reason:'OPENING_COMPANY_CURRENCY_MISMATCH',countryId:cid,companyId:company};
  account.currency=id(plan.currencyCode);account.availableBalance=amount;
  account.capitalRaised=(num(account.capitalRaised)||0)+amount;
  account.openingCapitalAmount=amount;account.openingCapitalBaselineId=plan.baselineId;
  account.openingCapitalCountrySharePct=num(plan.privateSectorContributionPct);
  account.openingCapitalTurn=currentTurn();account.revision=(num(account.revision)||0)+1;
  ledger.push({transactionId:tx,type:'PRIVATE_COMPANY_OPENING_CAPITAL',companyId:company,
   amount:amount,currency:id(plan.currencyCode),direction:'CREDIT',status:'POSTED',turn:currentTurn(),
   balanceAfter:account.availableBalance,capitalRaisedAfter:account.capitalRaised,
   baselineId:plan.baselineId,privateSectorContributionPct:num(plan.privateSectorContributionPct),
   companySharePct:num(allocation.sharePct),privateFactoryUnits:num(allocation.privateFactoryUnits)||0,
   capitalWeightedFactoryUnits:num(allocation.capitalWeightedFactoryUnits)||0,
   sourceModel:'COUNTRY_PRIVATE_SECTOR_AND_FACTORY_STRUCTURE',
   authority:'OMEGA_PRIVATE_COMPANY_CAPITAL_ALLOCATION_V1',
   publicTreasuryDebit:0,publicTreasuryCredit:0,affectsGovernmentTreasury:false});
  seeded.push(company);
 }
 if(ledger.length>4096)ledger.splice(0,ledger.length-4096);
 var status=seeded.length?(preserved.length||duplicates.length?'PARTIALLY_INITIALIZED':'INITIALIZED'):'ALREADY_INITIALIZED';
 return{status:status,countryId:cid,currency:id(plan.currencyCode),totalCapital:plan.totalOpeningCapital,
  seededCompanies:seeded,preservedCompanies:preserved,duplicateCompanies:duplicates,companyCount:5,
  publicTreasuryChanged:false,authority:'OMEGA_PRIVATE_COMPANY_CAPITAL_ALLOCATION_V1',
  initializationScope:'NON_PLAYER_COUNTRY_GLOBAL_BASELINE'};
}
function currentTurn(){
 var s=worldState()||{};return Math.max(0,Math.floor(num(s.simulation&&s.simulation.turn)??num(s.turn)??num(s.simulationTurn)??0));
}
async function ensureCountryCapital(country){
 var cid=canonicalCountry(country);
 if(!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'COUNTRY_ID_INVALID'};
 if(initialized.has(cid))return clone(initialized.get(cid));
 if(inflight.has(cid))return inflight.get(cid);
 var task=(async function(){
  try{
   var ready=await readyDependencies();if(ready.status!=='READY')return{status:ready.status,reason:ready.reason,countryId:cid};
   var active=playerCountry();
   if(cid===active&&typeof deps.capital.ensureCountryInitialized==='function'){
    var playerResult=await deps.capital.ensureCountryInitialized(cid);
    if(playerResult&&['INITIALIZED','ALREADY_INITIALIZED','PARTIALLY_INITIALIZED'].indexOf(playerResult.status)>=0){
     initialized.set(cid,clone(playerResult));return playerResult;
    }
    return playerResult||{status:'BLOCKED',reason:'PLAYER_COMPANY_CAPITAL_INITIALIZATION_FAILED',countryId:cid};
   }
   var privateRow=deps.privateRegistry.getCountryBaseline(cid),
    governmentRow=deps.governmentRegistry.getCountryBaseline(cid);
   if(!privateRow||privateRow.status!=='READY'||!governmentRow)
    return{status:'WAITING',reason:'COUNTRY_PRIVATE_OR_GOVERNMENT_FACTORY_BASELINE_UNAVAILABLE',countryId:cid};
   var profile=deps.countryRuntime.getProfile(cid)||null;
   if(!profile)return{status:'WAITING',reason:'COUNTRY_ECONOMIC_PROFILE_UNAVAILABLE',countryId:cid};
   var indicators=deps.finance.getIndicators(cid)||{},
    general=deps.generalRuntime&&typeof deps.generalRuntime.getCountryRecord==='function'
     ?deps.generalRuntime.getCountryRecord(cid):null,
    plan=deps.capital.buildPlan(cid,privateRow,governmentRow,profile,indicators,general,deps.forex);
   var result=initializeNpcCompanyCapital(cid,plan);
   if(result&&['INITIALIZED','ALREADY_INITIALIZED','PARTIALLY_INITIALIZED'].indexOf(result.status)>=0)
    initialized.set(cid,clone(result));
   return result;
  }catch(error){lastError=String(error&&error.message||error);return{status:'BLOCKED',reason:lastError,countryId:cid};}
  finally{inflight.delete(cid);}
 })();
 inflight.set(cid,task);return task;
}
function investmentBucket(country,create){
 var economy=countryBucket('economy',country,create);if(!economy)return null;
 if(!obj(economy.privateEnterpriseInternationalInvestment)&&create)
  economy.privateEnterpriseInternationalInvestment={schemaVersion:1,proposals:[],inboundInvestments:[],outboundInvestments:[],lastProcessedTurn:null};
 var bucket=economy.privateEnterpriseInternationalInvestment;
 if(!obj(bucket))return null;
 if(!Array.isArray(bucket.proposals))bucket.proposals=[];
 if(!Array.isArray(bucket.inboundInvestments))bucket.inboundInvestments=[];
 if(!Array.isArray(bucket.outboundInvestments))bucket.outboundInvestments=[];
 return bucket;
}
function bilateralRelation(from,to){
 var foreign=countryBucket('foreign',from,false)||{},relations=obj(foreign.relations)?foreign.relations:{};
 var direct=relations[to]||Object.keys(relations).map(function(k){return relations[k];}).find(function(row){return canonicalCountry(row&& (row.countryId||row.countryCode||row.partnerCountryId))===to;});
 return obj(direct)?direct:null;
}
function investmentRestricted(from,to){
 var a=bilateralRelation(from,to),b=bilateralRelation(to,from);
 return !!([a,b].filter(Boolean).some(function(row){
  return row.war_state===true||row.warState===true||row.sanctions===true||row.sanctioned===true||
   ['EMBARGO','INVESTMENT_BAN','TOTAL_SANCTIONS'].indexOf(id(row.investmentPolicy||row.tradePolicy||row.status))>=0;
 }));
}
function fxForCountry(country,account){
 var cid=canonicalCountry(country),profile=deps.countryRuntime&&deps.countryRuntime.getProfile?deps.countryRuntime.getProfile(cid):null,
  forex=deps.forex,code=id(account&&account.currency),rate=null;
 if(code==='USD')return{currencyCode:'USD',localPerUsd:1,source:'USD_PARITY'};
 if(!code||code.indexOf('LOC-')===0||code==='GAME_CURRENCY_UNITS')
  return{currencyCode:code||null,localPerUsd:null,source:'ACCOUNT_CURRENCY_NOT_CONVERTIBLE'};
 try{
  if(forex&&typeof forex.getCurrencyCode==='function'){
   var profileCode=id(forex.getCurrencyCode(profile));
   if(profileCode&&profileCode!==code)return{currencyCode:code,localPerUsd:null,source:'COMPANY_ACCOUNT_CURRENCY_PROFILE_MISMATCH'};
  }
 }catch(_){}
 try{rate=num(forex&&typeof forex.getRate==='function'?forex.getRate(code,'SIMULATION'):null);}catch(_){}
 if(!(rate>0))return{currencyCode:code,localPerUsd:null,source:'CURRENT_SIMULATION_FX_RATE_UNAVAILABLE'};
 return{currencyCode:code,localPerUsd:rate,source:'OMEGA_FOREX_SIMULATION_RATE'};
}
function appendBounded(rows,row,limit){rows.push(row);if(rows.length>limit)rows.splice(0,rows.length-limit);}
function findProposal(host,proposalId){
 var bucket=investmentBucket(host,false);
 return bucket&&bucket.proposals.find(function(row){return row&&row.proposalId===proposalId;})||null;
}
async function submitInvestmentProposal(input){
 input=input||{};
 var investor=canonicalCountry(input.investorCountryId),host=canonicalCountry(input.hostCountryId),
  investorCompany=id(input.investorCompanyId),hostCompany=id(input.hostCompanyId),
  requestId=String(input.requestId||'').trim(),amount=num(input.amount),
  equityBps=num(input.equityBps),quantity=num(input.quantity),factoryType=id(input.factoryType);
 if(!/^[A-Z]{3}$/.test(investor)||!/^[A-Z]{3}$/.test(host)||investor===host)
  return{status:'BLOCKED',reason:'CROSS_BORDER_COUNTRY_PAIR_INVALID'};
 if(COMPANY_IDS.indexOf(investorCompany)<0||COMPANY_IDS.indexOf(hostCompany)<0)
  return{status:'BLOCKED',reason:'UNKNOWN_UNIVERSAL_PRIVATE_COMPANY'};
 if(!requestId||requestId.length>120)return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_REQUEST_ID_REQUIRED'};
 if(amount===null||amount<=0||!centExact(amount))return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_AMOUNT_INVALID'};
 if(equityBps===null||!Number.isInteger(equityBps)||equityBps<1||equityBps>10000)
  return{status:'BLOCKED',reason:'FOREIGN_EQUITY_SHARE_OUT_OF_RANGE'};
 if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>25)
  return{status:'BLOCKED',reason:'FOREIGN_FACTORY_QUANTITY_OUT_OF_RANGE'};
 var ready=await readyDependencies();if(ready.status!=='READY')return{status:ready.status,reason:ready.reason};
 var hostBaseline=deps.privateRegistry.getCountryBaseline(host);
 if(!hostBaseline||hostBaseline.status!=='READY'||!obj(hostBaseline.factoryCounts)||
    !Object.prototype.hasOwnProperty.call(hostBaseline.factoryCounts,factoryType))
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_FACTORY_TYPE_NOT_REGISTERED'};
 if(investmentRestricted(investor,host))
  return{status:'BLOCKED',reason:'BILATERAL_SANCTIONS_OR_WAR_BLOCK_FOREIGN_INVESTMENT'};
 var capitalResults=await Promise.all([ensureCountryCapital(investor),ensureCountryCapital(host)]);
 if(capitalResults.some(function(row){return !row||['INITIALIZED','ALREADY_INITIALIZED','PARTIALLY_INITIALIZED'].indexOf(row.status)<0;}))
  return{status:'BLOCKED',reason:'INVESTOR_OR_HOST_COMPANY_CAPITAL_NOT_READY',capitalResults:capitalResults};
 var source=companyAccount(investor,investorCompany,false),target=companyAccount(host,hostCompany,false);
 if(!source||!target)return{status:'BLOCKED',reason:'INVESTOR_OR_HOST_COMPANY_ACCOUNT_UNAVAILABLE'};
 if(id(input.currencyCode)&&id(input.currencyCode)!==id(source.currency))
  return{status:'BLOCKED',reason:'INVESTOR_CURRENCY_MISMATCH'};
 if((num(source.availableBalance)||0)+1e-9<amount)
  return{status:'BLOCKED',reason:'INSUFFICIENT_UNRESERVED_INVESTOR_COMPANY_CAPITAL',
   available:num(source.availableBalance)||0,required:amount};
 var bucket=investmentBucket(host,true),proposalId='PE-FDI:'+investor+':'+investorCompany+':'+host+':'+hostCompany+':'+requestId,
  existing=bucket.proposals.find(function(row){return row&&row.proposalId===proposalId;});
 if(existing){
  var same=existing.investorCountryId===investor&&existing.investorCompanyId===investorCompany&&
   existing.hostCompanyId===hostCompany&&existing.factoryType===factoryType&&num(existing.amount)===amount&&
   num(existing.equityBps)===equityBps&&num(existing.quantity)===quantity;
  return same?Object.assign({status:'DUPLICATE'},clone(existing)):
   {status:'BLOCKED',reason:'FOREIGN_INVESTMENT_REQUEST_IDEMPOTENCY_COLLISION',proposalId:proposalId};
 }
 if(bucket.proposals.length>=MAX_INVESTMENT_PROPOSALS)
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_PROPOSAL_CAPACITY_REACHED'};
 var proposal={proposalId:proposalId,requestId:requestId,
  investorCountryId:investor,investorCompanyId:investorCompany,
  hostCountryId:host,hostCompanyId:hostCompany,
  amount:roundMoney(amount),currencyCode:id(source.currency),equityBps:equityBps,
  quantity:quantity,factoryType:factoryType,status:'PROPOSED',
  createdTurn:currentTurn(),updatedTurn:currentTurn(),
  approvalAuthority:'HOST_COUNTRY_GOVERNMENT_REVIEW',
  productionStatus:'AWAITING_HOST_APPROVAL_AND_EXISTING_FACTORY_LIFECYCLE',
  simulationOnly:true};
 bucket.proposals.push(proposal);
 if(bucket.proposals.length>MAX_INVESTMENT_PROPOSALS)bucket.proposals.splice(0,bucket.proposals.length-MAX_INVESTMENT_PROPOSALS);
 return Object.assign({status:'PROPOSED'},clone(proposal));
}
function reviewInvestmentProposal(input){
 input=input||{};
 var host=canonicalCountry(input.hostCountryId||playerCountry()),player=playerCountry(),
  proposal=findProposal(host,String(input.proposalId||'')),decision=id(input.decision);
 if(!host||host!==player)return{status:'BLOCKED',reason:'HOST_GOVERNMENT_PLAYER_COUNTRY_SCOPE_ONLY'};
 if(!proposal)return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_PROPOSAL_NOT_FOUND'};
 if(['APPROVE','REJECT'].indexOf(decision)<0)return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_DECISION_INVALID'};
 if(proposal.status!=='PROPOSED')return{status:'DUPLICATE',reason:'FOREIGN_INVESTMENT_ALREADY_REVIEWED',proposal:clone(proposal)};
 if(investmentRestricted(proposal.investorCountryId,host))
  return{status:'BLOCKED',reason:'BILATERAL_SANCTIONS_OR_WAR_BLOCK_FOREIGN_INVESTMENT'};
 proposal.status=decision==='APPROVE'?'APPROVED':'REJECTED';
 proposal.reviewedBy='HOST_COUNTRY_GOVERNMENT';proposal.reviewedTurn=currentTurn();proposal.updatedTurn=currentTurn();
 proposal.reviewReason=String(input.reason||'').slice(0,1000)||null;
 return{status:proposal.status,proposal:clone(proposal),authority:'HOST_COUNTRY_GOVERNMENT_REVIEW'};
}
function shareholderBps(account,investorCountry,investorCompany){
 var rows=Array.isArray(account&&account.foreignShareholders)?account.foreignShareholders:[];
 return rows.reduce(function(total,row){
  return total+(row&&row.investorCountryId===investorCountry&&row.investorCompanyId===investorCompany?Math.max(0,Math.floor(num(row.shareBps)||0)):0);
 },0);
}
function totalForeignShareBps(account){
 return(Array.isArray(account&&account.foreignShareholders)?account.foreignShareholders:[])
  .reduce(function(total,row){return total+Math.max(0,Math.floor(num(row&&row.shareBps)||0));},0);
}
function settleApprovedProposal(host,proposal){
 var investor=proposal.investorCountryId,investorCompany=proposal.investorCompanyId,hostCompany=proposal.hostCompanyId,
  amount=num(proposal.amount),source=companyAccount(investor,investorCompany,false),
  target=companyAccount(host,hostCompany,false),sourceRoot=financeRoot(investor,false),
  hostRoot=financeRoot(host,false);
 if(!source||!target||!sourceRoot||!hostRoot||!Array.isArray(sourceRoot.ledger)||!Array.isArray(hostRoot.ledger))
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_FINANCE_LEDGER_UNAVAILABLE'};
 var transactionId='PE-FDI-SETTLEMENT:'+proposal.proposalId,
  sourceExisting=sourceRoot.ledger.find(function(row){return row&&row.transactionId===transactionId;}),
  hostExisting=hostRoot.ledger.find(function(row){return row&&row.transactionId===transactionId;});
 if(sourceExisting||hostExisting){
  if(sourceExisting&&hostExisting&&sourceExisting.direction==='DEBIT'&&hostExisting.direction==='CREDIT'&&
     Math.abs((num(sourceExisting.amount)||0)-amount)<.01&&Math.abs((num(hostExisting.usdAmount)||0)-(num(sourceExisting.usdAmount)||0))<.01)
   return{status:'DUPLICATE',proposal:clone(proposal),transactionId:transactionId};
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_PAIRED_LEDGER_INCONSISTENT',transactionId:transactionId};
 }
 if((num(source.availableBalance)||0)+1e-9<amount)
  return{status:'BLOCKED',reason:'INVESTOR_COMPANY_CAPITAL_CHANGED_BEFORE_SETTLEMENT',
   available:num(source.availableBalance)||0,required:amount};
 var fxSource=fxForCountry(investor,source),fxHost=fxForCountry(host,target);
 if(!(fxSource.localPerUsd>0)||!(fxHost.localPerUsd>0))
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_FX_RATE_UNAVAILABLE',
   investorFx:fxSource,hostFx:fxHost};
 var usdAmount=roundMoney(amount/fxSource.localPerUsd),
  hostAmount=roundMoney(usdAmount*fxHost.localPerUsd);
 if(!(usdAmount>0)||!(hostAmount>0)||!centExact(hostAmount))
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_FX_CONVERSION_INVALID'};
 var already=totalForeignShareBps(target),existingShare=shareholderBps(target,investor,investorCompany),
  newShare=existingShare+proposal.equityBps;
 if(already+proposal.equityBps>10000)
  return{status:'BLOCKED',reason:'HOST_COMPANY_FOREIGN_EQUITY_LIMIT_EXCEEDED',
   existingForeignShareBps:already,requestedEquityBps:proposal.equityBps};
 if(!Array.isArray(target.foreignCapitalLots))target.foreignCapitalLots=[];
 if(target.foreignCapitalLots.some(function(row){return row&&String(row.transferId||'')==='PE-FDI-SETTLEMENT:'+proposal.proposalId;}))
  return{status:'BLOCKED',reason:'FOREIGN_CAPITAL_LOT_IDEMPOTENCY_COLLISION'};
 var sourceBalance=roundMoney((num(source.availableBalance)||0)-amount),
  targetBalance=roundMoney((num(target.availableBalance)||0)+hostAmount);
 // Both countries' account balances and paired finance ledger entries are committed synchronously
 // in one JavaScript turn. No async operation occurs between the validation and these writes.
 source.availableBalance=sourceBalance;source.capitalSpent=roundMoney((num(source.capitalSpent)||0)+amount);
 source.foreignInvestmentDeployed=roundMoney((num(source.foreignInvestmentDeployed)||0)+amount);
 source.revision=(num(source.revision)||0)+1;
 target.currency=id(fxHost.currencyCode);target.availableBalance=targetBalance;
 target.capitalRaised=roundMoney((num(target.capitalRaised)||0)+hostAmount);
 target.foreignEquityReceived=roundMoney((num(target.foreignEquityReceived)||0)+hostAmount);
 target.foreignInvestmentReceivedLocal=roundMoney((num(target.foreignInvestmentReceivedLocal)||0)+hostAmount);
 target.revision=(num(target.revision)||0)+1;
 // The established Private Enterprise funding lifecycle consumes this canonical lot:
 // fundProposal -> investmentSources -> construction CAPEX -> commissioned productionAssets.
 target.foreignCapitalLots.push({transferId:transactionId,investorCountryId:investor,
  investorCompanyId:investorCompany,hostCountryId:host,currencyCode:fxHost.currencyCode,
  amount:hostAmount,availableBalance:hostAmount,reservedBalance:0,spentBalance:0,
  createdTurn:currentTurn(),investmentId:'PE-FDI-PROJECT:'+proposal.proposalId});
 if(!Array.isArray(target.foreignShareholders))target.foreignShareholders=[];
 var shareRow=target.foreignShareholders.find(function(row){
  return row&&row.investorCountryId===investor&&row.investorCompanyId===investorCompany;
 });
 if(shareRow){shareRow.shareBps=newShare;shareRow.investedAmountLocal=roundMoney((num(shareRow.investedAmountLocal)||0)+hostAmount);}
 else target.foreignShareholders.push({investorCountryId:investor,investorCompanyId:investorCompany,
  shareBps:proposal.equityBps,investedAmountLocal:hostAmount,currencyCode:fxHost.currencyCode,createdTurn:currentTurn()});
 var common={transactionId:transactionId,proposalId:proposal.proposalId,
  investorCountryId:investor,investorCompanyId:investorCompany,
  hostCountryId:host,hostCompanyId:hostCompany,amount:amount,usdAmount:usdAmount,
  settlementCurrency:fxHost.currencyCode,foreignEquityBps:proposal.equityBps,
  factoryType:proposal.factoryType,factoryQuantity:proposal.quantity,turn:currentTurn(),status:'POSTED',
  authority:'OMEGA_PRIVATE_ENTERPRISE_INTERNATIONAL_INVESTMENT_V1'};
 sourceRoot.ledger.push(Object.assign({},common,{type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_OUTFLOW',
  companyId:investorCompany,currency:fxSource.currencyCode,direction:'DEBIT',
  companyBalanceAfter:sourceBalance,publicTreasuryDebit:0,publicTreasuryCredit:0,affectsGovernmentTreasury:false}));
 hostRoot.ledger.push(Object.assign({},common,{type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_INFLOW',
  companyId:hostCompany,currency:fxHost.currencyCode,direction:'CREDIT',
  hostAmount:hostAmount,amount:hostAmount,companyBalanceAfter:targetBalance,
  counterpartyCountryId:investor,counterpartyCompanyId:investorCompany,
  publicTreasuryDebit:0,publicTreasuryCredit:0,affectsGovernmentTreasury:false}));
 if(sourceRoot.ledger.length>4096)sourceRoot.ledger.splice(0,sourceRoot.ledger.length-4096);
 if(hostRoot.ledger.length>4096)hostRoot.ledger.splice(0,hostRoot.ledger.length-4096);
 var hostBucket=investmentBucket(host,true),investorBucket=investmentBucket(investor,true),
  investmentId='PE-FDI-PROJECT:'+proposal.proposalId;
 var record={investmentId:investmentId,transactionId:transactionId,
  investorCountryId:investor,investorCompanyId:investorCompany,hostCountryId:host,hostCompanyId:hostCompany,
  amountInvestorLocal:amount,investorCurrency:fxSource.currencyCode,amountHostLocal:hostAmount,
  hostCurrency:fxHost.currencyCode,usdAmount:usdAmount,equityBps:proposal.equityBps,
  factoryType:proposal.factoryType,quantity:proposal.quantity,settledTurn:currentTurn(),
  productionStatus:'AWAITING_HOST_PRIVATE_FACTORY_PROPOSAL',factoryProposalId:null,factoryIds:[],
  employmentStatus:'NOT_YET_COMMISSIONED',authority:'OMEGA_PRIVATE_ENTERPRISE_INTERNATIONAL_INVESTMENT_V1'};
 appendBounded(hostBucket.inboundInvestments,clone(record),MAX_INVESTMENT_HISTORY);
 appendBounded(investorBucket.outboundInvestments,clone(record),MAX_INVESTMENT_HISTORY);
 proposal.status='SETTLED';proposal.transactionId=transactionId;proposal.investmentId=investmentId;
 proposal.settledTurn=currentTurn();proposal.settlement={usdAmount:usdAmount,hostAmount:hostAmount,
  hostCurrency:fxHost.currencyCode,investorCurrency:fxSource.currencyCode};
 proposal.productionStatus=record.productionStatus;proposal.updatedTurn=currentTurn();
 try{g.dispatchEvent&&g.CustomEvent&&g.dispatchEvent(new g.CustomEvent('OMEGA_PRIVATE_ENTERPRISE_FOREIGN_INVESTMENT_SETTLED',{detail:clone(record)}));}catch(_){}
 return{status:'SETTLED',proposal:clone(proposal),investment:clone(record),
  sourceBalanceAfter:sourceBalance,hostCompanyBalanceAfter:targetBalance,
  publicTreasuryChanged:false,authority:'OMEGA_PRIVATE_ENTERPRISE_INTERNATIONAL_INVESTMENT_V1'};
}
function settleInvestmentProposal(input){
 input=input||{};
 var host=canonicalCountry(input.hostCountryId||playerCountry()),player=playerCountry(),
  proposal=findProposal(host,String(input.proposalId||''));
 if(!host||host!==player)return{status:'BLOCKED',reason:'HOST_COUNTRY_SETTLEMENT_PLAYER_SCOPE_ONLY'};
 if(!proposal)return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_PROPOSAL_NOT_FOUND'};
 if(proposal.status==='SETTLED')return{status:'DUPLICATE',proposal:clone(proposal)};
 if(proposal.status!=='APPROVED')return{status:'BLOCKED',reason:'HOST_GOVERNMENT_APPROVAL_REQUIRED'};
 if(investmentRestricted(proposal.investorCountryId,host))
  return{status:'BLOCKED',reason:'BILATERAL_SANCTIONS_OR_WAR_BLOCK_FOREIGN_INVESTMENT'};
 return settleApprovedProposal(host,proposal);
}
function linkInvestmentToFactoryProposal(input){
 input=input||{};
 var host=canonicalCountry(input.hostCountryId||playerCountry()),player=playerCountry(),
  investmentId=String(input.investmentId||''),proposalId=String(input.factoryProposalId||'');
 if(!host||host!==player)return{status:'BLOCKED',reason:'HOST_COUNTRY_FACTORY_LIFECYCLE_PLAYER_SCOPE_ONLY'};
 var bucket=investmentBucket(host,false),investment=bucket&&bucket.inboundInvestments.find(function(row){return row&&row.investmentId===investmentId;});
 if(!investment)return{status:'BLOCKED',reason:'SETTLED_FOREIGN_INVESTMENT_NOT_FOUND'};
 var economy=countryBucket('economy',host,false)||{},lifecycle=obj(economy.privateEnterpriseLifecycle)?economy.privateEnterpriseLifecycle:null,
  proposals=lifecycle&&Array.isArray(lifecycle.proposals)?lifecycle.proposals:[],
  proposal=proposals.find(function(row){return row&&row.proposalId===proposalId;});
 if(!proposal)return{status:'BLOCKED',reason:'HOST_PRIVATE_FACTORY_PROPOSAL_NOT_FOUND'};
 if(id(proposal.companyId)!==investment.hostCompanyId||id(proposal.factoryType)!==investment.factoryType||
    num(proposal.quantity)!==num(investment.quantity))
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_FACTORY_PROPOSAL_SCOPE_MISMATCH'};
 if(investment.factoryProposalId&&investment.factoryProposalId!==proposalId)
  return{status:'BLOCKED',reason:'FOREIGN_INVESTMENT_ALREADY_LINKED_TO_ANOTHER_FACTORY_PROPOSAL'};
 investment.factoryProposalId=proposalId;investment.productionStatus='FACTORY_PROPOSAL_LINKED';
 investment.linkedTurn=currentTurn();investment.updatedTurn=currentTurn();
 proposal.foreignInvestmentId=investmentId;proposal.foreignInvestorCountryId=investment.investorCountryId;
 proposal.foreignInvestorCompanyId=investment.investorCompanyId;
 return{status:'LINKED',investment:clone(investment),factoryProposalId:proposalId,
  authority:'EXISTING_PRIVATE_ENTERPRISE_LIFECYCLE'};
}
function reconcileCountry(country){
 var cid=canonicalCountry(country),bucket=investmentBucket(cid,false);
 if(!bucket)return{status:'IDLE',countryId:cid,linked:0};
 var economy=countryBucket('economy',cid,false)||{},assets=Array.isArray(economy.productionAssets)?economy.productionAssets:[],
  linked=0,rows=[];
 bucket.inboundInvestments.forEach(function(investment){
  if(!investment||!investment.factoryProposalId)return;
  var asset=assets.find(function(row){
   if(!row||id(row.ownerCompanyId||row.ownerId)!==investment.hostCompanyId||
      id(row.factoryType||row.type)!==investment.factoryType)return false;
   var sources=Array.isArray(row.foreignInvestmentSources)?row.foreignInvestmentSources:[];
   return sources.some(function(source){return source&&String(source.transferId||'')===String(investment.transactionId)&&
    canonicalCountry(source.investorCountryId)===investment.investorCountryId&&
    id(source.investorCompanyId)===investment.investorCompanyId;});
  });
  if(!asset)return;
  investment.factoryProposalId=investment.factoryProposalId||asset.sourcePrivateProposalId||null;
  investment.factoryIds=Array.isArray(investment.factoryIds)?investment.factoryIds:[];
  var factoryId=String(asset.id||asset.factoryId||'');
  if(factoryId&&investment.factoryIds.indexOf(factoryId)<0)investment.factoryIds.push(factoryId);
  investment.foreignCapitalUsedLocal=roundMoney((Array.isArray(asset.foreignInvestmentSources)?asset.foreignInvestmentSources:[])
   .filter(function(source){return source&&String(source.transferId||'')===String(investment.transactionId);})
   .reduce(function(total,source){return total+(num(source.amount)||0);},0));
  investment.foreignCapitalParticipationPct=num(asset.foreignCapitalParticipationPct);
  investment.productionStatus=asset.productionEnabled===true?'OPERATIONAL':
   String(asset.status||'').toUpperCase()==='BLOCKED'?'BLOCKED':'COMMISSIONED_PRODUCTION_GATED';
  investment.employmentStatus=obj(asset.employment)?'RECORDED_IN_EXISTING_FACTORY_RUNTIME':
   obj(asset.workforce)?'RECORDED_IN_EXISTING_FACTORY_RUNTIME':'AWAITING_EXISTING_FACTORY_WORKFORCE_RECORD';
  investment.observedEmployment= num(asset.employment&& (asset.employment.total||asset.employment.workers)||
   asset.workforce&& (asset.workforce.total||asset.workforce.workers));
  investment.productionUpdatedTurn=currentTurn();investment.updatedTurn=currentTurn();linked++;
  rows.push({investmentId:investment.investmentId,factoryId:factoryId,productionStatus:investment.productionStatus,
   employmentStatus:investment.employmentStatus,observedEmployment:investment.observedEmployment});
 });
 return{status:'RECONCILED',countryId:cid,linked:linked,investments:rows};
}
function autoReviewNpcProposals(country){
 var cid=canonicalCountry(country),player=playerCountry();
 if(!cid||cid===player)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_MANUAL_REVIEW_REQUIRED'};
 var bucket=investmentBucket(cid,false);if(!bucket)return{status:'IDLE',reviewed:0};
 if(num(bucket.lastProcessedTurn)===currentTurn())return{status:'DUPLICATE',reviewed:0};
 var reviewed=0,settled=0,blocked=0;
 bucket.proposals.filter(function(row){return row&&row.status==='PROPOSED';})
  .sort(function(a,b){return num(a.createdTurn)-num(b.createdTurn)||String(a.proposalId).localeCompare(String(b.proposalId));})
  .slice(0,1).forEach(function(proposal){
   // NPC governments apply a conservative 49% foreign-equity ceiling and retain
   // the same sanctions/war block used by the human host-country review.
   if(proposal.equityBps>4900||investmentRestricted(proposal.investorCountryId,cid)){
    proposal.status='REJECTED';proposal.reviewedBy='NPC_HOST_GOVERNMENT_POLICY';
    proposal.reviewReason=proposal.equityBps>4900?'NPC_FOREIGN_EQUITY_LIMIT':'BILATERAL_SANCTIONS_OR_WAR';
    proposal.reviewedTurn=currentTurn();proposal.updatedTurn=currentTurn();reviewed++;return;
   }
   proposal.status='APPROVED';proposal.reviewedBy='NPC_HOST_GOVERNMENT_POLICY';
   proposal.reviewedTurn=currentTurn();proposal.updatedTurn=currentTurn();reviewed++;
   var result=settleApprovedProposal(cid,proposal);
   if(result.status==='SETTLED'||result.status==='DUPLICATE')settled++;else{blocked++;proposal.settlementBlocker=result.reason||result.status;}
  });
 bucket.lastProcessedTurn=currentTurn();
 return{status:'PROCESSED',reviewed:reviewed,settled:settled,blocked:blocked};
}
async function processCountry(country,context){
 var cid=canonicalCountry(country),player=playerCountry();
 if(!cid)return{status:'SKIPPED',reason:'COUNTRY_ID_INVALID'};
 var capital=await ensureCountryCapital(cid);
 if(!capital||['INITIALIZED','ALREADY_INITIALIZED','PARTIALLY_INITIALIZED'].indexOf(capital.status)<0)
  return{status:'DEFERRED',reason:capital&&capital.reason||capital&&capital.status||'COMPANY_CAPITAL_NOT_READY',countryId:cid};
 var review=cid===player?{status:'SKIPPED',reason:'PLAYER_HOST_REVIEW_REQUIRES_EXPLICIT_APPROVAL'}:autoReviewNpcProposals(cid);
 var reconciliation=reconcileCountry(cid);
 return{status:'PROCESSED',countryId:cid,capital:capital,foreignInvestmentReview:review,
  productionReconciliation:reconciliation,tier:context&&context.tier||null};
}
function registerScheduler(){
 if(registered)return true;
 var scheduler=deps&&deps.scheduler||g.OmegaWorldSimulationScheduler||g.Omega&&g.Omega.WorldSimulationScheduler;
 if(!scheduler||typeof scheduler.registerCountryHandler!=='function')return false;
 unregister=scheduler.registerCountryHandler(HANDLER_ID,processCountry,{tiers:['MACRO'],priority:42});
 registered=true;return true;
}
function bindRuntimeEvents(){
 if(listenersBound||typeof g.addEventListener!=='function')return;
 listenersBound=true;
 ['OMEGA_PRIVATE_FACTORY_COMMISSIONED','OMEGA_FACTORY_CAPACITY_CHANGED','OMEGA_PRIVATE_ENTERPRISE_FOREIGN_INVESTMENT_SETTLED']
  .forEach(function(type){g.addEventListener(type,function(event){
   var cid=canonicalCountry(event&&event.detail&&(event.detail.countryId||event.detail.hostCountryId||event.detail.country));
   if(cid)reconcileCountry(cid);
  });});
}
async function init(){
 var ready=await readyDependencies();if(ready.status!=='READY')return ready;
 registerScheduler();bindRuntimeEvents();
 return diagnostics();
}
function scheduleInit(){
 if(initScheduled)return;
 initScheduled=true;
 var run=function(){initScheduled=false;init().catch(function(error){lastError=String(error&&error.message||error);});};
 if(typeof g.requestIdleCallback==='function'){
  try{g.requestIdleCallback(run,{timeout:1800});return;}catch(_){}
 }
 if(typeof g.setTimeout==='function'){g.setTimeout(run,900);return;}
 Promise.resolve().then(run);
}
function diagnostics(){
 return{version:VERSION,status:lastError?'DEGRADED':registered?'READY':'DEPENDENCIES_READY',
  reason:lastError,companyCount:COMPANY_IDS.length,globalCountryCapitalCount:initialized.size,
  initializedCountries:Array.from(initialized.keys()),inFlightCountries:Array.from(inflight.keys()),
  schedulerRegistered:registered,handlerId:HANDLER_ID,scheduledTier:'MACRO',
  capitalAuthority:'OMEGA_PRIVATE_COMPANY_CAPITAL_RUNTIME_V1',
  investmentAuthority:'OMEGA_PRIVATE_ENTERPRISE_INTERNATIONAL_INVESTMENT_V1',
  settlementPolicy:'PAIRED_COUNTRY_FINANCE_LEDGER_AND_HOST_COMPANY_EQUITY',
  factoryPolicy:'EXISTING_PRIVATE_ENTERPRISE_GOVERNMENT_PERMIT_CONSTRUCTION_AND_COMMISSIONING_ONLY',
  productionPolicy:'NO_SYNTHETIC_OUTPUT_OR_EMPLOYMENT'};
}
var API=Object.freeze({VERSION,init,ensureCountryCapital,processCountry,
 submitInvestmentProposal,reviewInvestmentProposal,settleInvestmentProposal,
 linkInvestmentToFactoryProposal,reconcileCountry,diagnostics,
 getCountryInvestments:function(country){var bucket=investmentBucket(canonicalCountry(country),false);return bucket?clone(bucket):null;}});
g.OmegaPrivateEnterpriseInternationalInvestmentV1=API;
g.Omega=g.Omega||{};g.Omega.PrivateEnterpriseInternationalInvestmentV1=API;
if(typeof g.addEventListener==='function'){
 ['OMEGA_READY','OMEGA_GAME_SESSION_STARTED'].forEach(function(type){
  g.addEventListener(type,scheduleInit);
 });
}
if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
