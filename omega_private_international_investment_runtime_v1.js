/* OMEGA PRIVATE INTERNATIONAL INVESTMENT RUNTIME v1.0.0
 * Country-to-country private capital settlement using the existing five-company
 * registry, company-capital accounts, Finance StateTransaction and shared factory pool.
 * No sovereign treasury is debited and no factory/output is fabricated by an investment.
 */
(function(global){
  'use strict';
  var VERSION='1.0.0';
  var AUTHORITY='OMEGA_PRIVATE_CROSS_BORDER_INVESTMENT_RUNTIME_V1';
  var COMPANY_IDS=[
    'AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES',
    'ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'
  ];
  var HANDLERS={
    reserve:'OMEGA_PRIVATE_FDI_RESERVE_CAPITAL',
    receive:'OMEGA_PRIVATE_FDI_RECEIVE_CAPITAL',
    settle:'OMEGA_PRIVATE_FDI_SETTLE_CAPITAL',
    refund:'OMEGA_PRIVATE_FDI_REFUND_CAPITAL',
    confirm:'OMEGA_PRIVATE_FDI_CONFIRM_RECEIPT'
  };
  var ready=false,initPromise=null,lastError=null,registered=false,settledCount=0,pendingCount=0;
  function obj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function num(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;var n=Number(v);return Number.isFinite(n)?n:null;}
  function id(v){return String(v==null?'':v).trim().toUpperCase();}
  function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k]);});return o;}
  function round(v,d){var p=Math.pow(10,d||2);return Math.round((v+Number.EPSILON)*p)/p;}
  function turn(){var s=global.Game&&global.Game.state||global.gameState||global.Omega&&global.Omega.World&&global.Omega.World.state||{};return Math.max(0,Math.floor(num(s.simulation&&s.simulation.turn)||num(s.turn)||num(global.Omega&&global.Omega.Simulation&&global.Omega.Simulation.clock&&global.Omega.Simulation.clock.turn)||0));}
  function canonicalCountry(v){
    var raw=id(v&&typeof v==='object'?(v.iso3||v.iso3Code||v.countryCode||v.countryId||v.code||v.id):v);
    if(/^[A-Z]{3}$/.test(raw))return raw;
    var registry=global.OmegaCanonicalIdentityRegistry||global.OmegaCountrySemanticBridge||global.Omega&&global.Omega.CanonicalIdentity;
    try{var hit=registry&&registry.resolveCountry?registry.resolveCountry(String(v||'')):null;var row=hit&&hit.raw&& (hit.raw.raw||hit.raw);return id(row&&(row.iso3||row.iso3Code)||hit&&hit.id);}
    catch(_){return '';}
  }
  function dependencies(){
    return{
      capital:global.OmegaPrivateCompanyCapitalRuntimeV1||global.Omega&&global.Omega.PrivateCompanyCapitalRuntimeV1,
      privateRegistry:global.OmegaPrivateEnterpriseRegistryV1||global.Omega&&global.Omega.PrivateEnterpriseRegistryV1,
      countryRuntime:global.OmegaCountryRuntimeData,
      forex:global.OmegaForexMonetaryEngine||global.Omega&&global.Omega.ForexMonetaryEngine,
      interop:global.OmegaMinistryInteroperability||global.Omega&&global.Omega.MinistryInteroperability,
      state:global.Omega&&global.Omega.Simulation&&global.Omega.Simulation.world&&global.Omega.Simulation.world.state||
        global.Omega&&global.Omega.World&&global.Omega.World.state||global.Game&&global.Game.state||global.gameState
    };
  }
  function financeBucket(root,country){return obj(root&&root.finance&&root.finance[country])?root.finance[country]:null;}
  function financeRoot(root,country){var b=financeBucket(root,country);return obj(b&&b.omegaFinance)?b.omegaFinance:null;}
  function currencyFor(country,deps){
    var profile=null,code=null,rate=null;
    try{profile=deps.countryRuntime&&deps.countryRuntime.getProfile?deps.countryRuntime.getProfile(country):null;}catch(_){}
    try{code=id(deps.forex&&deps.forex.getCurrencyCode?deps.forex.getCurrencyCode(profile||country):profile&& (profile.currencyCode||profile.currency)||'');}catch(_){}
    if(!code&&profile)code=id(profile.currencyCode||profile.currency);
    if(!code)return{status:'UNOBSERVED',reason:'COUNTRY_CURRENCY_UNAVAILABLE',countryId:country};
    if(code==='USD')rate=1;
    else try{rate=num(deps.forex&&deps.forex.getRate?deps.forex.getRate(code,'SIMULATION'):null);}catch(_){}
    if(rate===null||rate<=0)return{status:'UNOBSERVED',reason:'SIMULATION_FX_RATE_UNAVAILABLE',countryId:country,currencyCode:code};
    return{status:'READY',countryId:country,currencyCode:code,localPerUsd:rate};
  }
  function ledgerPush(root,row){
    if(!Array.isArray(root.ledger))root.ledger=[];
    root.ledger.push(row);if(root.ledger.length>4096)root.ledger.splice(0,root.ledger.length-4096);
  }
  function readRoot(ctx){var r=ctx.stateTransaction.get('finance.omegaFinance');return obj(r)?r:{};}
  function writeRoot(ctx,root){ctx.stateTransaction.set('finance.omegaFinance',root);}
  function findRecord(root,transferId){
    var rows=Array.isArray(root.internationalInvestmentTransactions)?root.internationalInvestmentTransactions:[];
    return rows.find(function(row){return row&&row.transferId===transferId;})||null;
  }
  function saveRecord(root,row){
    if(!Array.isArray(root.internationalInvestmentTransactions))root.internationalInvestmentTransactions=[];
    var i=root.internationalInvestmentTransactions.findIndex(function(x){return x&&x.transferId===row.transferId;});
    if(i>=0)root.internationalInvestmentTransactions[i]=row;else root.internationalInvestmentTransactions.push(row);
    if(root.internationalInvestmentTransactions.length>2048)root.internationalInvestmentTransactions.splice(0,root.internationalInvestmentTransactions.length-2048);
  }
  function validCompany(company){return COMPANY_IDS.indexOf(id(company))>=0;}
  function reserveHandler(command,ctx){
    var p=command.payload||{},root=readRoot(ctx),company=id(p.companyId),transferId=String(p.transferId||'').trim(),
      amount=num(p.amount),currency=id(p.currencyCode),host=id(p.hostCountryId),existing=findRecord(root,transferId);
    if(!validCompany(company)||!transferId||!currency||!/^([A-Z]{3})$/.test(host)||amount===null||amount<=0)
      return{accepted:false,reason:'FDI_RESERVATION_FIELDS_INVALID'};
    if(existing){
      if(existing.companyId!==company||existing.hostCountryId!==host||existing.currencyCode!==currency||
         Math.abs((num(existing.amount)||0)-amount)>.01)
        return{accepted:false,reason:'FDI_TRANSFER_IDEMPOTENCY_COLLISION'};
      if(existing.status==='RESERVED'||existing.status==='SETTLED')return{accepted:true,duplicate:true,transferId,status:existing.status};
      return{accepted:false,reason:'FDI_TRANSFER_NOT_RESERVABLE',status:existing.status};
    }
    var accounts=obj(root.companyCapitalAccounts)?root.companyCapitalAccounts:{},account=accounts[company];
    if(!obj(account))return{accepted:false,reason:'INVESTOR_COMPANY_CAPITAL_ACCOUNT_UNAVAILABLE'};
    if(id(account.currency)!==currency)return{accepted:false,reason:'INVESTOR_COMPANY_CURRENCY_MISMATCH',accountCurrency:account.currency||null,expectedCurrency:currency};
    var available=Math.max(0,num(account.availableBalance)||0);
    if(available+1e-9<amount)return{accepted:false,reason:'INSUFFICIENT_INVESTOR_COMPANY_CAPITAL',availableBalance:available,required:amount};
    account.availableBalance=round(available-amount,2);
    account.internationalInvestmentEscrowBalance=round(Math.max(0,num(account.internationalInvestmentEscrowBalance)||0)+amount,2);
    account.revision=(num(account.revision)||0)+1;
    saveRecord(root,{transferId:transferId,companyId:company,investorCountryId:ctx.countryId,hostCountryId:host,
      amount:amount,currencyCode:currency,status:'RESERVED',createdTurn:ctx.simulationTurn,updatedTurn:ctx.simulationTurn,
      authority:AUTHORITY});
    ledgerPush(root,{transactionId:transferId+':RESERVE',type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_RESERVATION',
      transferId:transferId,companyId:company,investorCountryId:ctx.countryId,hostCountryId:host,amount:amount,
      currency:currency,direction:'RESERVE',status:'POSTED',turn:ctx.simulationTurn,
      balanceAfter:account.availableBalance,escrowAfter:account.internationalInvestmentEscrowBalance,authority:AUTHORITY});
    writeRoot(ctx,root);return{accepted:true,transferId,status:'RESERVED',availableBalance:account.availableBalance};
  }
  function receiveHandler(command,ctx){
    var p=command.payload||{},root=readRoot(ctx),company=id(p.companyId),transferId=String(p.transferId||'').trim(),
      investor=id(p.investorCountryId),currency=id(p.currencyCode),amount=num(p.amount),amountUsd=num(p.amountUsd),
      existing=findRecord(root,transferId);
    if(!validCompany(company)||!transferId||!/^([A-Z]{3})$/.test(investor)||!currency||
       amount===null||amount<=0||amountUsd===null||amountUsd<=0)
      return{accepted:false,reason:'FDI_RECEIPT_FIELDS_INVALID'};
    if(existing){
      if(existing.companyId!==company||existing.investorCountryId!==investor||
         existing.currencyCode!==currency||Math.abs((num(existing.amount)||0)-amount)>.01)
        return{accepted:false,reason:'FDI_RECEIPT_IDEMPOTENCY_COLLISION'};
      if(existing.status==='RECEIVED'||existing.status==='SETTLED')return{accepted:true,duplicate:true,transferId,status:existing.status};
      return{accepted:false,reason:'FDI_RECEIPT_ALREADY_EXISTS',status:existing.status};
    }
    var accounts=obj(root.companyCapitalAccounts)?root.companyCapitalAccounts:(root.companyCapitalAccounts={}),
      account=accounts[company];
    if(!obj(account)){
      account=accounts[company]={companyId:company,currency:currency,availableBalance:0,reservedBalance:0,
        capitalRaised:0,capitalSpent:0,revision:0};
    }
    var currentCurrency=id(account.currency||currency);
    var accountHistory=['availableBalance','reservedBalance','capitalRaised','capitalSpent','retainedEarningsBalance']
      .some(function(k){return Math.abs(num(account[k])||0)>1e-9;});
    if(currentCurrency!==currency&&accountHistory)
      return{accepted:false,reason:'HOST_COMPANY_CURRENCY_MISMATCH',accountCurrency:currentCurrency,expectedCurrency:currency};
    account.currency=currency;
    account.availableBalance=round(Math.max(0,num(account.availableBalance)||0)+amount,2);
    account.capitalRaised=round(Math.max(0,num(account.capitalRaised)||0)+amount,2);
    account.foreignCapitalLots=Array.isArray(account.foreignCapitalLots)?account.foreignCapitalLots:[];
    account.foreignCapitalLots.push({transferId:transferId,investorCountryId:investor,investorCompanyId:company,
      hostCountryId:ctx.countryId,currencyCode:currency,amount:amount,availableBalance:amount,reservedBalance:0,
      spentBalance:0,createdTurn:ctx.simulationTurn,authority:AUTHORITY});
    account.foreignInvestmentReceivedLocal=round((num(account.foreignInvestmentReceivedLocal)||0)+amount,2);
    account.revision=(num(account.revision)||0)+1;
    var receipt={transferId:transferId,companyId:company,investorCompanyId:company,investorCountryId:investor,
      hostCountryId:ctx.countryId,amount:amount,amountUsd:amountUsd,currencyCode:currency,
      investorAmount:num(p.investorAmount),investorCurrencyCode:id(p.investorCurrencyCode),
      investorLocalPerUsd:num(p.investorLocalPerUsd),hostLocalPerUsd:num(p.hostLocalPerUsd),
      status:'RECEIVED',turn:ctx.simulationTurn,authority:AUTHORITY};
    saveRecord(root,receipt);
    if(!Array.isArray(root.foreignInvestmentLedger))root.foreignInvestmentLedger=[];
    root.foreignInvestmentLedger.push(clone(receipt));
    if(root.foreignInvestmentLedger.length>2048)root.foreignInvestmentLedger.splice(0,root.foreignInvestmentLedger.length-2048);
    ledgerPush(root,{transactionId:transferId+':RECEIVE',type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_RECEIPT',
      transferId:transferId,companyId:company,investorCountryId:investor,hostCountryId:ctx.countryId,
      amount:amount,amountUsd:amountUsd,currency:currency,direction:'CREDIT',status:'POSTED',turn:ctx.simulationTurn,
      balanceAfter:account.availableBalance,authority:AUTHORITY});
    writeRoot(ctx,root);return{accepted:true,transferId,status:'RECEIVED',hostAmount:amount,currencyCode:currency};
  }
  function confirmHandler(command,ctx){
    var p=command.payload||{},root=readRoot(ctx),transferId=String(p.transferId||'').trim(),
      record=findRecord(root,transferId),company=id(p.companyId);
    if(!record||record.companyId!==company||record.investorCountryId!==id(p.investorCountryId))
      return{accepted:false,reason:'FDI_HOST_RECEIPT_NOT_FOUND'};
    if(record.status==='SETTLED')return{accepted:true,duplicate:true,transferId,status:'SETTLED'};
    if(record.status!=='RECEIVED')return{accepted:false,reason:'FDI_HOST_RECEIPT_NOT_SETTLEABLE',status:record.status};
    record.status='SETTLED';record.settledTurn=ctx.simulationTurn;record.updatedTurn=ctx.simulationTurn;saveRecord(root,record);
    if(Array.isArray(root.foreignInvestmentLedger)){
      var row=root.foreignInvestmentLedger.find(function(x){return x&&x.transferId===transferId;});
      if(row){row.status='SETTLED';row.settledTurn=ctx.simulationTurn;}
    }
    ledgerPush(root,{transactionId:transferId+':CONFIRM',type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_SETTLEMENT_CONFIRMATION',
      transferId:transferId,companyId:company,investorCountryId:record.investorCountryId,hostCountryId:ctx.countryId,
      amount:record.amount,currency:record.currencyCode,direction:'MEMO',status:'POSTED',turn:ctx.simulationTurn,authority:AUTHORITY});
    writeRoot(ctx,root);return{accepted:true,transferId,status:'SETTLED'};
  }
  function settleHandler(command,ctx){
    var p=command.payload||{},root=readRoot(ctx),transferId=String(p.transferId||'').trim(),
      record=findRecord(root,transferId),company=id(p.companyId);
    if(!record||record.companyId!==company||record.hostCountryId!==id(p.hostCountryId))
      return{accepted:false,reason:'FDI_INVESTOR_RESERVATION_NOT_FOUND'};
    if(record.status==='SETTLED')return{accepted:true,duplicate:true,transferId,status:'SETTLED'};
    if(record.status!=='RESERVED')return{accepted:false,reason:'FDI_INVESTOR_RESERVATION_NOT_SETTLED',status:record.status};
    var account=(root.companyCapitalAccounts||{})[company];
    if(!obj(account))return{accepted:false,reason:'INVESTOR_COMPANY_CAPITAL_ACCOUNT_UNAVAILABLE'};
    var amount=num(record.amount),escrow=Math.max(0,num(account.internationalInvestmentEscrowBalance)||0);
    if(amount===null||escrow+1e-9<amount)return{accepted:false,reason:'FDI_ESCROW_BALANCE_MISMATCH'};
    account.internationalInvestmentEscrowBalance=round(escrow-amount,2);
    account.capitalSpent=round(Math.max(0,num(account.capitalSpent)||0)+amount,2);
    account.revision=(num(account.revision)||0)+1;record.status='SETTLED';record.settledTurn=ctx.simulationTurn;record.updatedTurn=ctx.simulationTurn;
    saveRecord(root,record);
    ledgerPush(root,{transactionId:transferId+':DEBIT',type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_DEBIT',
      transferId:transferId,companyId:company,investorCountryId:ctx.countryId,hostCountryId:record.hostCountryId,
      amount:amount,currency:record.currencyCode,direction:'DEBIT',status:'POSTED',turn:ctx.simulationTurn,
      balanceAfter:account.availableBalance,escrowAfter:account.internationalInvestmentEscrowBalance,authority:AUTHORITY});
    writeRoot(ctx,root);return{accepted:true,transferId,status:'SETTLED',capitalSpent:amount};
  }
  function refundHandler(command,ctx){
    var p=command.payload||{},root=readRoot(ctx),transferId=String(p.transferId||'').trim(),
      record=findRecord(root,transferId),company=id(p.companyId);
    if(!record||record.companyId!==company)return{accepted:false,reason:'FDI_INVESTOR_RESERVATION_NOT_FOUND'};
    if(record.status==='REFUNDED')return{accepted:true,duplicate:true,transferId,status:'REFUNDED'};
    if(record.status!=='RESERVED')return{accepted:false,reason:'FDI_RESERVATION_CANNOT_BE_REFUNDED',status:record.status};
    var account=(root.companyCapitalAccounts||{})[company],amount=num(record.amount);
    if(!obj(account)||amount===null)return{accepted:false,reason:'FDI_ESCROW_BALANCE_MISMATCH'};
    var escrow=Math.max(0,num(account.internationalInvestmentEscrowBalance)||0);
    if(escrow+1e-9<amount)return{accepted:false,reason:'FDI_ESCROW_BALANCE_MISMATCH'};
    account.internationalInvestmentEscrowBalance=round(escrow-amount,2);
    account.availableBalance=round(Math.max(0,num(account.availableBalance)||0)+amount,2);
    account.revision=(num(account.revision)||0)+1;record.status='REFUNDED';record.refundedTurn=ctx.simulationTurn;record.updatedTurn=ctx.simulationTurn;
    saveRecord(root,record);
    ledgerPush(root,{transactionId:transferId+':REFUND',type:'PRIVATE_COMPANY_FOREIGN_INVESTMENT_REFUND',
      transferId:transferId,companyId:company,investorCountryId:ctx.countryId,hostCountryId:record.hostCountryId,
      amount:amount,currency:record.currencyCode,direction:'CREDIT',status:'POSTED',turn:ctx.simulationTurn,
      balanceAfter:account.availableBalance,authority:AUTHORITY});
    writeRoot(ctx,root);return{accepted:true,transferId,status:'REFUNDED',availableBalance:account.availableBalance};
  }
  function dispatch(deps,type,country,payload,transferId){
    var commandId=transferId+':'+type;
    var result=deps.interop.dispatchCommand('finance',type,country,payload,{
      turn:turn(),commandId:commandId,commandType:type,ownerMinistry:'finance',
      correlationId:transferId,provenance:{source:AUTHORITY,version:VERSION}
    });
    var body=result&&result.result||result||{};
    if(!result||result.status!=='APPLIED'||body.accepted===false)
      return{ok:false,status:result&&result.status||'FAILED',reason:body.reason||result&&result.reason||'FDI_FINANCE_COMMAND_FAILED',result:body};
    return{ok:true,status:body.status||'APPLIED',duplicate:body.duplicate===true,result:body};
  }
  function registerHandlers(deps){
    if(registered)return true;
    if(!deps.interop||typeof deps.interop.registerCommandHandler!=='function'||
       typeof deps.interop.dispatchCommand!=='function')throw new Error('FDI_FINANCE_INTEROPERABILITY_UNAVAILABLE');
    deps.interop.registerCommandHandler(HANDLERS.reserve,'finance',reserveHandler);
    deps.interop.registerCommandHandler(HANDLERS.receive,'finance',receiveHandler);
    deps.interop.registerCommandHandler(HANDLERS.settle,'finance',settleHandler);
    deps.interop.registerCommandHandler(HANDLERS.refund,'finance',refundHandler);
    deps.interop.registerCommandHandler(HANDLERS.confirm,'finance',confirmHandler);
    registered=true;return true;
  }
  async function init(){
    if(ready)return diagnostics();
    if(initPromise)return initPromise;
    initPromise=(async function(){
      var d=dependencies();
      if(!d.capital||typeof d.capital.ensureCountryInitializedForInvestment!=='function')
        throw new Error('FDI_PRIVATE_COMPANY_CAPITAL_RUNTIME_UNAVAILABLE');
      if(!d.privateRegistry||!d.privateRegistry.ready||!d.countryRuntime||!d.forex||!d.state)
        throw new Error('FDI_COUNTRY_OR_FX_DEPENDENCY_UNAVAILABLE');
      await Promise.resolve(d.privateRegistry.ready);
      var readyResult=registerHandlers(d);
      if(!readyResult)throw new Error('FDI_HANDLER_REGISTRATION_FAILED');
      ready=true;lastError=null;return diagnostics();
    })();
    try{return await initPromise;}catch(e){lastError=String(e&&e.message||e);initPromise=null;throw e;}
  }
  async function invest(input){
    input=input||{};
    try{if(!ready)await init();}catch(e){return{status:'WAITING',reason:String(e&&e.message||e)};}
    var d=dependencies(),investor=canonicalCountry(input.investorCountryId),host=canonicalCountry(input.hostCountryId),
      company=id(input.companyId),requestId=String(input.requestId||'').trim(),amount=num(input.amount);
    if(!investor||!host||investor===host)return{status:'BLOCKED',reason:'DISTINCT_INVESTOR_AND_HOST_COUNTRIES_REQUIRED'};
    if(!validCompany(company))return{status:'BLOCKED',reason:'UNIVERSAL_PRIVATE_COMPANY_REQUIRED',companyIds:COMPANY_IDS.slice()};
    if(!/^[A-Z0-9:_-]{6,100}$/i.test(requestId))return{status:'BLOCKED',reason:'FDI_REQUEST_ID_INVALID'};
    if(amount===null||amount<=0||amount>9e15)return{status:'BLOCKED',reason:'FDI_AMOUNT_OUT_OF_RANGE'};
    var investorBase=d.privateRegistry.getCountryBaseline(investor),hostBase=d.privateRegistry.getCountryBaseline(host);
    if(!investorBase||investorBase.status!=='READY'||!hostBase||hostBase.status!=='READY')
      return{status:'WAITING',reason:'PRIVATE_COMPANY_COUNTRY_BASELINE_NOT_READY',investorCountryId:investor,hostCountryId:host};
    var opening=await d.capital.ensureCountryInitializedForInvestment(investor);
    if(!opening||['INITIALIZED','ALREADY_INITIALIZED','PARTIALLY_INITIALIZED'].indexOf(opening.status)<0)
      return{status:'WAITING',reason:opening&&opening.reason||'INVESTOR_COMPANY_CAPITAL_NOT_READY',openingCapital:opening||null};
    var root=d.state,investorFinance=financeRoot(root,investor),account=investorFinance&&investorFinance.companyCapitalAccounts&&investorFinance.companyCapitalAccounts[company];
    if(!obj(account))return{status:'BLOCKED',reason:'INVESTOR_COMPANY_CAPITAL_ACCOUNT_UNAVAILABLE'};
    var investorCurrency=id(account.currency),investorFx=currencyFor(investor,d),hostFx=currencyFor(host,d);
    if(investorFx.status!=='READY'||hostFx.status!=='READY')
      return{status:'BLOCKED',reason:'CROSS_BORDER_FX_RATE_UNAVAILABLE',investorFx:investorFx,hostFx:hostFx};
    if(investorCurrency!==investorFx.currencyCode)
      return{status:'BLOCKED',reason:'INVESTOR_WALLET_AND_COUNTRY_CURRENCY_MISMATCH',walletCurrency:investorCurrency,countryCurrency:investorFx.currencyCode};
    var amountUsd=round(amount/investorFx.localPerUsd,6),hostAmount=round(amountUsd*hostFx.localPerUsd,2);
    if(amountUsd<=0||hostAmount<=0)return{status:'BLOCKED',reason:'FDI_FX_CONVERSION_ROUNDED_TO_ZERO'};
    var transferId='FDI:'+investor+':'+host+':'+company+':'+requestId;
    if(transferId.length>220)return{status:'BLOCKED',reason:'FDI_TRANSFER_ID_TOO_LONG'};
    var payload={transferId:transferId,companyId:company,investorCountryId:investor,hostCountryId:host,
      amount:amount,currencyCode:investorCurrency,amountUsd:amountUsd,hostAmount:hostAmount,hostCurrencyCode:hostFx.currencyCode};
    var reserved=dispatch(d,HANDLERS.reserve,investor,{transferId:transferId,companyId:company,hostCountryId:host,
      amount:amount,currencyCode:investorCurrency},transferId);
    if(!reserved.ok)return{status:'BLOCKED',reason:reserved.reason,stage:'INVESTOR_RESERVATION',detail:reserved.result};
    var received=dispatch(d,HANDLERS.receive,host,{transferId:transferId,companyId:company,investorCountryId:investor,
      amount:hostAmount,amountUsd:amountUsd,currencyCode:hostFx.currencyCode,investorAmount:amount,
      investorCurrencyCode:investorCurrency,investorLocalPerUsd:investorFx.localPerUsd,hostLocalPerUsd:hostFx.localPerUsd},transferId);
    if(!received.ok){
      var refund=dispatch(d,HANDLERS.refund,investor,{transferId:transferId,companyId:company},transferId);
      return{status:refund.ok?'REFUNDED':'RECONCILIATION_REQUIRED',reason:received.reason,stage:'HOST_RECEIPT',
        refundStatus:refund.status,refundReason:refund.reason||null,transferId:transferId};
    }
    var settled=dispatch(d,HANDLERS.settle,investor,{transferId:transferId,companyId:company,hostCountryId:host},transferId);
    if(!settled.ok){
      pendingCount++;return{status:'SETTLEMENT_PENDING',reason:settled.reason,transferId:transferId,
        investorCountryId:investor,hostCountryId:host,investorAmount:amount,investorCurrencyCode:investorCurrency,
        hostAmount:hostAmount,hostCurrencyCode:hostFx.currencyCode,amountUsd:amountUsd,
        hostReceiptStatus:received.status,retryable:true};
    }
    var confirmed=dispatch(d,HANDLERS.confirm,host,{transferId:transferId,companyId:company,investorCountryId:investor},transferId);
    if(!confirmed.ok){pendingCount++;return{status:'SETTLEMENT_PENDING',reason:confirmed.reason,transferId:transferId,
      investorCountryId:investor,hostCountryId:host,investorAmount:amount,investorCurrencyCode:investorCurrency,
      hostAmount:hostAmount,hostCurrencyCode:hostFx.currencyCode,amountUsd:amountUsd,retryable:true};}
    settledCount++;return{status:'SETTLED',transferId:transferId,investorCountryId:investor,hostCountryId:host,
      companyId:company,investorAmount:amount,investorCurrencyCode:investorCurrency,
      hostAmount:hostAmount,hostCurrencyCode:hostFx.currencyCode,amountUsd:amountUsd,
      investorDebitStatus:settled.status,hostReceiptStatus:confirmed.status,governmentTreasuryChanged:false,
      authority:AUTHORITY};
  }
  function reconcileTransfer(input){
    input=input||{};if(!ready)return{status:'WAITING',reason:'FDI_RUNTIME_NOT_READY'};
    var d=dependencies(),investor=canonicalCountry(input.investorCountryId),host=canonicalCountry(input.hostCountryId),
      company=id(input.companyId),requestId=String(input.requestId||'').trim(),transferId='FDI:'+investor+':'+host+':'+company+':'+requestId;
    if(!investor||!host||!validCompany(company)||!requestId)return{status:'BLOCKED',reason:'FDI_RECONCILIATION_FIELDS_INVALID'};
    var hostRoot=financeRoot(d.state,host),receipt=findRecord(hostRoot||{},transferId);
    if(!receipt||!['RECEIVED','SETTLED'].includes(receipt.status))return{status:'WAITING',reason:'HOST_FDI_RECEIPT_NOT_FOUND',transferId:transferId};
    var result=dispatch(d,HANDLERS.settle,investor,{transferId:transferId,companyId:company,hostCountryId:host},transferId);
    if(!result.ok)return{status:'SETTLEMENT_PENDING',reason:result.reason,transferId:transferId};
    var confirmed=dispatch(d,HANDLERS.confirm,host,{transferId:transferId,companyId:company,investorCountryId:investor},transferId);
    if(!confirmed.ok)return{status:'SETTLEMENT_PENDING',reason:confirmed.reason,transferId:transferId};
    settledCount++;return{status:'SETTLED',transferId:transferId,investorCountryId:investor,hostCountryId:host,authority:AUTHORITY};
  }
  function getCountryLedger(countryValue){
    var cid=canonicalCountry(countryValue),d=dependencies(),root=cid&&financeRoot(d.state,cid);
    return clone(root&&Array.isArray(root.foreignInvestmentLedger)?root.foreignInvestmentLedger:[]);
  }
  function getCompanyCapital(countryValue,companyValue){
    var cid=canonicalCountry(countryValue),company=id(companyValue),d=dependencies(),root=cid&&financeRoot(d.state,cid);
    var account=root&&root.companyCapitalAccounts&&root.companyCapitalAccounts[company];
    if(!account)return null;
    return{countryId:cid,companyId:company,currency:account.currency||null,availableBalance:num(account.availableBalance)||0,
      reservedBalance:num(account.reservedBalance)||0,capitalSpent:num(account.capitalSpent)||0,
      foreignInvestmentReceivedLocal:num(account.foreignInvestmentReceivedLocal)||0,
      foreignCapitalLots:clone(account.foreignCapitalLots||[])};
  }
  function diagnostics(){
    return{version:VERSION,ready:ready,error:lastError,registered,handlerCount:registered?5:0,
      companyCount:COMPANY_IDS.length,canonicalCompanyIds:COMPANY_IDS.slice(),settledCount:settledCount,
      pendingReconciliationCount:pendingCount,capitalAuthority:'EXISTING_PRIVATE_COMPANY_CAPITAL_ACCOUNTS',
      financeAuthority:'OMEGA_MINISTRY_STATE_TRANSACTION',treasuryDebit:false,
      productionAuthority:'EXISTING_SHARED_ECONOMY_PRODUCTION_ASSETS_POOL',
      countryScope:'CANONICAL_197_COUNTRY_ROSTER'};
  }
  var API=Object.freeze({VERSION:VERSION,AUTHORITY:AUTHORITY,COMPANY_IDS:COMPANY_IDS.slice(),
    init:init,invest:invest,reconcileTransfer:reconcileTransfer,getCountryLedger:getCountryLedger,
    getCompanyCapital:getCompanyCapital,diagnostics:diagnostics});
  global.Omega=global.Omega||{};global.Omega.PrivateInternationalInvestmentRuntimeV1=API;
  global.OmegaPrivateInternationalInvestmentRuntimeV1=API;
  if(typeof global.addEventListener==='function')global.addEventListener('OMEGA_READY',function(){init().catch(function(e){lastError=String(e&&e.message||e);});});
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
