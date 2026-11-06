/* OMEGA PRIVATE ENTERPRISE LIFECYCLE v1.0.0
 * Country-scoped proposal -> approval -> finance -> construction -> commissioning.
 * Reuses Finance's omegaFinance ledger and the canonical Industrial Network project registry.
 * Private production remains fail-closed until verified SAB-34 browser/save-load evidence exists.
 */
(function(g){
  'use strict';
  var VERSION='1.0.0';
  var COMPANY_IDS=['AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES','ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'];
  var COMPANY_NAMES={
    AURORA_INDUSTRIAL_GROUP:'Aurora Industrial Group',
    MERIDIAN_ENGINEERING_GROUP:'Meridian Engineering Group',
    NOVA_CONSUMER_INDUSTRIES:'Nova Consumer Industries',
    ATLAS_TECHNOLOGY_CORPORATION:'Atlas Technology Corporation',
    TERRA_INFRASTRUCTURE_GROUP:'Terra Infrastructure Group'
  };
  var MAX_PROPOSALS=250,MAX_EVENTS=600,MAX_PROJECTS_PER_PROPOSAL=25;
  var NETWORK_EVENT='OMEGA_FACTORY_CAPACITY_CHANGED';
  function obj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&k!=='constructor')o[k]=clone(v[k]);});return o;}
  function num(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return Number.isFinite(n)?n:null;}
  function id(v){return String(v==null?'':v).trim().toUpperCase();}
  function token(v){return String(v==null?'':v).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function state(){return g.Game&&g.Game.state?g.Game.state:(g.gameState||null);}
  function turn(){var s=state()||{};return num(s.simulation&&s.simulation.turn)??num(s.turn)??num(s.simulationTurn)??0;}
  function canonicalCountry(v){
    var raw=id(v);if(!raw)return '';
    var registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    try{var resolved=registry&&registry.resolveCountry?registry.resolveCountry(v):null;if(resolved){var value=resolved.raw?.raw||resolved.raw||{};var iso3=value.iso3||value.iso3Code||value.ISO_A3||value.iso_a3||resolved.iso3||resolved.iso3Code;var code=id(iso3||resolved.id||resolved.canonicalId);if(/^[A-Z]{3}$/.test(code))return code;}}catch(_){}
    return raw;
  }
  function playerCountry(){
    var s=state()||{},sim=g.Omega&&g.Omega.Simulation||null,candidates=[];
    try{if(sim&&typeof sim.getPlayerCountryId==='function')candidates.push(sim.getPlayerCountryId());}catch(_){}
    candidates.push(s.simulation&&s.simulation.session&&s.simulation.session.playerCountryId);
    candidates.push(s.simulation&&s.simulation.playerCountryId,s.playerCountryId,s.playerCountryCode);
    candidates.push(g.Game&&(g.Game.playerCountryId||g.Game.playerCountryCode||g.Game.playerCountry));
    candidates.push(g.OMEGA_PLAYER_COUNTRY_ID);
    for(var i=0;i<candidates.length;i++){var raw=candidates[i]&&typeof candidates[i]==='object'?(candidates[i].iso3||candidates[i].countryCode||candidates[i].countryId||candidates[i].code||candidates[i].id):candidates[i];var cid=canonicalCountry(raw);if(/^[A-Z]{3}$/.test(cid))return cid;}
    return '';
  }
  function countryBucket(domain,country,create){
    var s=state();if(!s)return null;
    if(!obj(s[domain])){if(!create)return null;s[domain]={};}
    var root=s[domain],cid=canonicalCountry(country),keys=Object.keys(root),key=keys.find(function(k){return canonicalCountry(k)===cid;});
    if(!key&&create)key=cid;
    if(!key)return null;
    if(!obj(root[key])){if(!create)return null;root[key]={};}
    return root[key];
  }
  function runtime(country,create){
    var econ=countryBucket('economy',country,create);if(!econ)return null;
    if(!obj(econ.privateEnterpriseLifecycle)&&create)econ.privateEnterpriseLifecycle={schemaVersion:VERSION,nextProposalSequence:1,proposals:[],events:[]};
    var r=econ.privateEnterpriseLifecycle;
    if(!obj(r))return null;
    if(!Array.isArray(r.proposals))r.proposals=[];
    if(!Array.isArray(r.events))r.events=[];
    if(!Number.isInteger(r.nextProposalSequence)||r.nextProposalSequence<1)r.nextProposalSequence=1;
    return r;
  }
  function financeBucket(country,create){
    return countryBucket('finance',country,create);
  }
  function financeRoot(country,create){
    var bucket=financeBucket(country,create);if(!bucket)return null;
    if(!obj(bucket.omegaFinance)&&create)bucket.omegaFinance={};
    return obj(bucket.omegaFinance)?bucket.omegaFinance:null;
  }
  function capitalAccounts(country,create){
    var root=financeRoot(country,create);if(!root)return null;
    if(!obj(root.companyCapitalAccounts)&&create)root.companyCapitalAccounts={};
    return obj(root.companyCapitalAccounts)?root.companyCapitalAccounts:null;
  }
  function capitalAccount(country,company,create){
    var all=capitalAccounts(country,create);if(!all)return null;
    if(!obj(all[company])&&create)all[company]={companyId:company,currency:'GAME_CURRENCY_UNITS',availableBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
    return obj(all[company])?all[company]:null;
  }
  function financeLedger(country,create){
    var root=financeRoot(country,create);if(!root)return null;
    if(!Array.isArray(root.ledger)&&create)root.ledger=[];
    return Array.isArray(root.ledger)?root.ledger:null;
  }
  function financeTreasury(country){
    var bucket=financeBucket(country,false),economy=countryBucket('economy',country,false);
    if(bucket){
      if(num(bucket.available)!==null)return{bucket:bucket,field:'available',balance:num(bucket.available),authority:'Game.state.finance.'+canonicalCountry(country)+'.available'};
      if(num(bucket.omegaFinance?.treasuryBalanceUsd)!==null)return{bucket:bucket,field:'omegaFinance.treasuryBalanceUsd',balance:num(bucket.omegaFinance.treasuryBalanceUsd),authority:'Game.state.finance.'+canonicalCountry(country)+'.omegaFinance.treasuryBalanceUsd'};
    }
    if(economy&&num(economy.treasury)!==null)return{bucket:economy,field:'treasury',balance:num(economy.treasury),authority:'Game.state.economy.'+canonicalCountry(country)+'.treasury'};
    return{bucket:null,field:null,balance:null,authority:'UNAVAILABLE'};
  }
  function setTreasuryBalance(source,amount){
    if(!source||!source.bucket||!source.field)return false;
    source.bucket[source.field]=amount;
    if(source.field==='available'&&obj(source.bucket.omegaFinance)&&num(source.bucket.omegaFinance.treasuryBalanceUsd)!==null)source.bucket.omegaFinance.treasuryBalanceUsd=amount;
    if(source.field==='omegaFinance.treasuryBalanceUsd')source.bucket.available=amount;
    return true;
  }
  function recordEvent(country,type,payload){
    var r=runtime(country,true);if(!r)return;
    r.events.push({eventId:'PE-EVENT:'+canonicalCountry(country)+':T'+turn()+':'+r.events.length+':'+type,type:type,countryId:canonicalCountry(country),turn:turn(),payload:clone(payload||{})});
    if(r.events.length>MAX_EVENTS)r.events.splice(0,r.events.length-MAX_EVENTS);
    try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent('OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_CHANGED',{detail:{countryId:canonicalCountry(country),eventType:type,payload:clone(payload||{})}}));}catch(_){}
  }
  function network(){return g.OmegaResourceIndustrialNetwork||(g.Omega&&g.Omega.ResourceIndustrialNetwork)||null;}
  function catalog(){return g.OmegaResourceIndustrialCatalogData||(g.Omega&&g.Omega.ResourceIndustrialCatalogData)||null;}
  function baseline(country){
    var api=g.OmegaPrivateEnterpriseRegistryV1||(g.Omega&&g.Omega.PrivateEnterpriseRegistryV1);
    try{return api&&typeof api.getCountryBaseline==='function'?api.getCountryBaseline(country):null;}catch(_){return null;}
  }
  function privateAssets(country){
    var econ=countryBucket('economy',country,false)||{};
    return(Array.isArray(econ.productionAssets)?econ.productionAssets:[]).filter(function(a){return COMPANY_IDS.indexOf(id(a&& (a.ownerCompanyId||a.ownerId||a.companyId)))>=0;});
  }
  function recipeFor(factoryType,profile){
    var c=catalog()||{},routes=c.downstreamFactoryRecipes||{},preferred=String(profile&&profile.defaultRecipeId||'');
    if(preferred&&routes[preferred])return routes[preferred];
    var keys=Object.keys(routes);
    for(var i=0;i<keys.length;i++)if(id(routes[keys[i]]&&routes[keys[i]].factoryType)===factoryType)return routes[keys[i]];
    return null;
  }
  function resourceAvailable(country,resourceId){
    var bucket=countryBucket('resource',country,false)||{},inv=obj(bucket.inventory)?bucket.inventory:{},warehouse=obj(bucket.warehouse)?bucket.warehouse:{};
    var inventoryKey=Object.prototype.hasOwnProperty.call(inv,resourceId)?resourceId:Object.keys(inv).find(function(k){return token(k)===token(resourceId);});
    var rows=obj(warehouse.availableByResource)?warehouse.availableByResource:{};
    var warehouseKey=Object.prototype.hasOwnProperty.call(rows,resourceId)?resourceId:Object.keys(rows).find(function(k){return token(k)===token(resourceId);});
    var invAmount=inventoryKey==null?null:Math.max(0,num(inv[inventoryKey])||0);
    var warehouseAmount=warehouseKey==null?null:Math.max(0,num(rows[warehouseKey])||0);
    var reserved=Math.max(0,num(warehouse.reservedByResource&&warehouse.reservedByResource[warehouseKey||resourceId])||0);
    var warehouseFree=warehouseAmount===null?null:Math.max(0,warehouseAmount-reserved);
    var amount=invAmount!==null&&warehouseFree!==null?Math.min(invAmount,warehouseFree):warehouseFree!==null?warehouseFree:invAmount;
    return{resourceId:resourceId,available:amount===null?null:amount,reserved:reserved,authority:amount===null?'UNOBSERVED':invAmount!==null&&warehouseFree!==null?'INVENTORY_AND_WAREHOUSE_LEDGER':warehouseFree!==null?'RAW_WAREHOUSE_LEDGER':'LEGACY_INVENTORY_AGGREGATE'};
  }
  function inputForecast(country,profile,recipe,quantity){
    var inputs=recipe&&recipe.inputs||{},capacity=Math.max(1,num(profile&&profile.defaultCapacityPerDay)||1)*quantity,rows=[];
    Object.keys(inputs).forEach(function(resourceId){
      var perUnit=num(inputs[resourceId]);if(perUnit===null||perUnit<=0)return;
      var needed=perUnit*capacity*30,stock=resourceAvailable(country,resourceId);
      rows.push({resourceId:resourceId,perUnit:perUnit,forecast30Day:needed,available:stock.available,shortfall:stock.available===null?null:Math.max(0,needed-stock.available),authority:stock.authority,reserved:stock.reserved});
    });
    return rows;
  }
  function previewFor(proposal){
    var cid=proposal.countryId,base=baseline(cid),c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType],recipe=recipeFor(proposal.factoryType,profile);
    if(!base||base.status!=='READY')return{status:'BLOCKED',reason:'PRIVATE_AND_GOVERNMENT_BASELINES_NOT_READY'};
    if(!profile||!recipe)return{status:'BLOCKED',reason:'CANONICAL_FACTORY_PROFILE_OR_RECIPE_UNAVAILABLE'};
    var governmentCount=num(base.governmentFactoryCounts&&base.governmentFactoryCounts[proposal.factoryType])||0;
    var openingPrivate=num(base.factoryCounts&&base.factoryCounts[proposal.factoryType])||0;
    var livePrivate=privateAssets(cid).filter(function(a){return id(a.factoryType||a.type)===proposal.factoryType;}).length;
    var maximumPrivate=Math.floor(governmentCount*.60+1e-9);
    var maxAdditional=Math.max(0,maximumPrivate-openingPrivate-livePrivate);
    var inputs=inputForecast(cid,profile,recipe,proposal.quantity);
    var deficits=inputs.filter(function(x){return x.shortfall!==null&&x.shortfall>1e-9;});
    var unobserved=inputs.filter(function(x){return x.available===null;});
    var capacity=profile.defaultCapacityPerDay===undefined?null:num(profile.defaultCapacityPerDay)*proposal.quantity;
    var constructionQuote=null;
    try{var n=network();if(n&&typeof n.factoryConstructionMaterialQuote==='function')constructionQuote=n.factoryConstructionMaterialQuote(cid,profile);}catch(_){}
    return{
      status:proposal.quantity<=maxAdditional?'READY':'BLOCKED',
      reason:proposal.quantity<=maxAdditional?null:'PRIVATE_EXPANSION_LIMIT_REACHED',
      countryId:cid,factoryType:proposal.factoryType,requestedQuantity:proposal.quantity,
      governmentFactoryCount:governmentCount,openingPrivateAllocation:openingPrivate,commissionedPrivateCount:livePrivate,
      maximumPrivateUnits:maximumPrivate,maximumAdditionalUnits:maxAdditional,
      requestedDailyCapacity:capacity,constructionCostPerFactory:num(profile.constructionCost),capitalRequired:num(profile.constructionCost)===null?null:num(profile.constructionCost)*proposal.quantity,
      inputForecastDays:30,inputRequirements:inputs,shortages:deficits,unobservedInputs:unobserved,
      constructionMaterials:constructionQuote,
      sourcingPolicy:proposal.sourcingPolicy,
      stateSupportRequested:proposal.stateSupportRequested===true,
      warnings:deficits.map(function(x){return{resourceId:x.resourceId,quantity:x.shortfall,forecastDays:30,reason:'INPUT_SUPPLY_DEFICIT'};}),
      authority:'CANONICAL_PRIVATE_ENTERPRISE_PROPOSAL_PREVIEW'
    };
  }
  function existingProposal(country,requestId){
    var r=runtime(country,false);return r&&r.proposals.find(function(p){return p.requestId&&p.requestId===requestId;})||null;
  }
  function createProposal(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),player=playerCountry();
    if(!/^[A-Z]{3}$/.test(cid)||!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_NOT_RESOLVED'};
    if(cid!==player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY',countryId:cid,playerCountryId:player};
    var company=id(input.companyId),factoryType=id(input.factoryType),quantity=num(input.quantity);
    if(COMPANY_IDS.indexOf(company)<0)return{status:'BLOCKED',reason:'UNKNOWN_CANONICAL_COMPANY'};
    if(!/^[A-Z0-9_]{3,96}$/.test(factoryType))return{status:'BLOCKED',reason:'CANONICAL_FACTORY_TYPE_REQUIRED'};
    if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>MAX_PROJECTS_PER_PROPOSAL)return{status:'BLOCKED',reason:'PROPOSAL_QUANTITY_OUT_OF_RANGE',minimum:1,maximum:MAX_PROJECTS_PER_PROPOSAL};
    var c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[factoryType],recipe=recipeFor(factoryType,profile);
    if(!profile||!recipe)return{status:'BLOCKED',reason:'FACTORY_PROFILE_OR_RECIPE_NOT_REGISTERED',factoryType:factoryType};
    var sourcePolicy=String(input.sourcingPolicy||'DOMESTIC_ONLY').toUpperCase();
    if(['DOMESTIC_ONLY','COMPANY_FUNDED_IMPORTS','MIXED'].indexOf(sourcePolicy)<0)return{status:'BLOCKED',reason:'INVALID_INPUT_SOURCING_POLICY'};
    var requestId=String(input.requestId||'').trim();
    if(requestId){var old=existingProposal(cid,requestId);if(old)return Object.assign({idempotent:true},clone(old));}
    var r=runtime(cid,true),sequence=r.nextProposalSequence++,proposalId='PE-PROPOSAL:'+cid+':'+sequence;
    var proposal={
      proposalId:proposalId,requestId:requestId||proposalId,countryId:cid,companyId:company,companyName:COMPANY_NAMES[company],
      factoryType:factoryType,factoryName:profile.name||factoryType,quantity:quantity,
      recipeId:recipe.recipeId||profile.defaultRecipeId||null,sourcingPolicy:sourcePolicy,
      stateSupportRequested:input.stateSupportRequested===true,
      capitalRequired:num(profile.constructionCost)===null?null:num(profile.constructionCost)*quantity,
      capitalUnit:profile.unit||'GAME_CURRENCY_UNITS',
      workforcePerFactory:clone(profile.workforce||{}),utilitiesPerFactory:clone(profile.utilities||{}),
      forecastOutputPerDay:(num(profile.defaultCapacityPerDay)||0)*quantity,
      expectedInputRequirements:inputForecast(cid,profile,recipe,quantity),
      ownership:{ownerCompanyId:company,operatorCompanyId:company},
      stateControlRights:{licensingAndPermits:true,fiscalRegulation:true,labourSafetyEnvironmentalRegulation:true,strategicSupplyOversight:true,competitionOversight:true,foreignOwnershipReview:true,emergencyIntervention:true,operationalControl:'PRIVATE_OPERATOR_UNDER_STATE_POLICY'},
      status:'PROPOSED',createdTurn:turn(),updatedTurn:turn(),decision:null,projectIds:[],commissionedFactoryIds:[],
      productionEnabled:false,provenance:{source:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1',simulationOnly:true,realWorldCompany:false}
    };
    r.proposals.push(proposal);if(r.proposals.length>MAX_PROPOSALS)r.proposals.splice(0,r.proposals.length-MAX_PROPOSALS);
    recordEvent(cid,'COMPANY_PROPOSAL_SUBMITTED',{proposalId:proposalId,companyId:company,factoryType:factoryType,quantity:quantity});
    return Object.assign({status:'PROPOSED'},clone(proposal));
  }
  function getProposal(country,proposalId){
    var r=runtime(country,false);var p=r&&r.proposals.find(function(x){return x.proposalId===String(proposalId||'');});return p?clone(p):null;
  }
  function decideProposal(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),player=playerCountry();
    if(cid!==player||!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var r=runtime(cid,false),proposal=r&&r.proposals.find(function(p){return p.proposalId===String(input.proposalId||'');});
    if(!proposal)return{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};
    if(proposal.status!=='PROPOSED')return{status:'BLOCKED',reason:'PROPOSAL_ALREADY_DECIDED',currentStatus:proposal.status};
    var decision=String(input.decision||'').toUpperCase();
    if(['APPROVE','DENY','DEFER'].indexOf(decision)<0)return{status:'BLOCKED',reason:'INVALID_GOVERNMENT_DECISION'};
    var preview=previewFor(proposal);
    if(decision==='APPROVE'&&preview.status!=='READY')return{status:'BLOCKED',reason:preview.reason||'APPROVAL_PREVIEW_BLOCKED',preview:preview};
    if(decision==='APPROVE'&&proposal.sourcingPolicy==='DOMESTIC_ONLY'&&preview.shortages.length)
      return{status:'BLOCKED',reason:'DOMESTIC_INPUT_SHORTAGE',shortages:clone(preview.shortages),preview:preview};
    var stateSupport=decision==='APPROVE'&&input.allowStateSupport===true&&proposal.stateSupportRequested===true;
    proposal.status=decision==='APPROVE'?'APPROVED_AWAITING_FUNDING':decision==='DENY'?'DENIED':'DEFERRED';
    proposal.decision={decision:decision,decisionId:'PE-DECISION:'+proposal.proposalId+':T'+turn(),turn:turn(),
      reviewer:'PLAYER_GOVERNMENT',reason:String(input.reason||'').slice(0,1000),conditions:clone(input.conditions||{}),
      approvedQuantity:decision==='APPROVE'?proposal.quantity:0,allowStateSupport:stateSupport,
      domesticInputCeiling:proposal.sourcingPolicy==='COMPANY_FUNDED_IMPORTS'?0:preview.inputRequirements.reduce(function(s,x){return s+(x.available===null?0:Math.min(x.available,x.forecast30Day));},0),
      importSharePolicy:proposal.sourcingPolicy==='DOMESTIC_ONLY'?0:proposal.sourcingPolicy==='COMPANY_FUNDED_IMPORTS'?100:'REMAINDER_AFTER_DOMESTIC_ALLOCATION',
      preview:clone(preview),reviewTurn:turn(),expiryTurn:num(input.expiryTurn)||turn()+30};
    proposal.updatedTurn=turn();
    recordEvent(cid,'COMPANY_PROPOSAL_DECIDED',{proposalId:proposal.proposalId,decision:decision,decisionId:proposal.decision.decisionId,allowStateSupport:stateSupport});
    return{status:proposal.status,proposal:clone(proposal),preview:preview};
  }
  function ledgerHasTransaction(country,transactionId){
    var bucket=financeBucket(country,false);if(!bucket)return null;
    var arrays=[bucket.omegaFinance&&bucket.omegaFinance.ledger,bucket.ledger,bucket.journal,bucket.transactions];
    for(var i=0;i<arrays.length;i++){
      var rows=Array.isArray(arrays[i])?arrays[i]:[];
      for(var j=0;j<rows.length;j++){
        var row=rows[j]||{},key=String(row.transactionId||row.transaction_id||row.id||row.referenceId||'');
        if(key===transactionId)return row;
      }
    }
    return null;
  }
  function recordCompanyCapitalReceipt(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),company=id(input.companyId),transactionId=String(input.sourceTransactionId||'').trim(),amount=num(input.amount);
    if(cid!==playerCountry()||!cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    if(COMPANY_IDS.indexOf(company)<0||!transactionId||amount===null||amount<=0)return{status:'BLOCKED',reason:'CAPITAL_RECEIPT_FIELDS_INVALID'};
    var source=ledgerHasTransaction(cid,transactionId);
    if(!source)return{status:'BLOCKED',reason:'CAPITAL_RECEIPT_NOT_VERIFIED_IN_FINANCE_LEDGER'};
    var sourceStatus=String(source.status||source.settlementStatus||'').toUpperCase();
    var sourceType=String(source.type||source.transactionType||source.action||'').toUpperCase();
    var direction=String(source.direction||source.entryType||'').toUpperCase();
    var sourceCompany=id(source.companyId||source.beneficiaryCompanyId||source.counterpartyCompanyId);
    var sourceAmount=num(source.amountUsd!=null?source.amountUsd:(source.amount!=null?source.amount:source.value));
    if(['SETTLED','POSTED','COMPLETED','PAID'].indexOf(sourceStatus)<0||
       !/(EQUITY|INVESTMENT|LOAN|CAPITAL|RETAINED_EARNINGS)/.test(sourceType)||
       !['CREDIT','INFLOW','DEPOSIT'].includes(direction)||
       (sourceCompany&&sourceCompany!==company)||
       sourceAmount===null||Math.abs(sourceAmount-amount)>1e-6)
      return{status:'BLOCKED',reason:'CAPITAL_SOURCE_TRANSACTION_NOT_A_VERIFIED_COMPANY_CREDIT',sourceTransactionId:transactionId};
    var account=capitalAccount(cid,company,true),existing=ledgerHasTransaction(cid,'PE-CAPITAL-RECEIPT:'+transactionId);
    if(existing)return{status:'DUPLICATE',reason:'CAPITAL_RECEIPT_ALREADY_POSTED',sourceTransactionId:transactionId};
    account.availableBalance+=amount;account.capitalRaised+=amount;account.revision++;
    var ledger=financeLedger(cid,true);ledger.push({transactionId:'PE-CAPITAL-RECEIPT:'+transactionId,type:'PRIVATE_COMPANY_CAPITAL_RECEIPT',
      sourceTransactionId:transactionId,companyId:company,amount:amount,currency:source.currency||'GAME_CURRENCY_UNITS',
      direction:'CREDIT',status:'POSTED',turn:turn(),balanceAfter:account.availableBalance,authority:'EXISTING_FINANCE_LEDGER_VERIFIED_SOURCE'});
    if(ledger.length>4096)ledger.splice(0,ledger.length-4096);
    recordEvent(cid,'COMPANY_CAPITAL_RECEIVED',{companyId:company,sourceTransactionId:transactionId,amount:amount});
    return{status:'POSTED',companyId:company,amount:amount,balance:account.availableBalance,sourceTransactionId:transactionId};
  }
  function fundProposal(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),player=playerCountry(),proposalId=String(input.proposalId||'');
    if(cid!==player||!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var r=runtime(cid,false),proposal=r&&r.proposals.find(function(p){return p.proposalId===proposalId;});
    if(!proposal)return{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};
    if(proposal.status==='FUNDED'||proposal.status==='UNDER_CONSTRUCTION'||proposal.status==='PARTIALLY_UNDER_CONSTRUCTION'||proposal.status==='COMMISSIONED_PRODUCTION_GATED')return{status:'DUPLICATE',proposal:clone(proposal)};
    if(proposal.status!=='APPROVED_AWAITING_FUNDING')return{status:'BLOCKED',reason:'PROPOSAL_NOT_APPROVED'};
    var amount=num(input.amount);if(amount===null||amount<=0||proposal.capitalRequired===null||Math.abs(amount-proposal.capitalRequired)>1e-6)
      return{status:'BLOCKED',reason:'FULL_CAPITAL_COMMITMENT_REQUIRED',required:proposal.capitalRequired,provided:amount};
    var sourceType=String(input.sourceType||'COMPANY_CAPITAL').toUpperCase(),account=capitalAccount(cid,proposal.companyId,true);
    var transactionId='PE-FUNDING:'+proposal.proposalId+':'+proposal.decision.decisionId;
    var ledger=financeLedger(cid,true);
    if(ledger.some(function(x){return x.transactionId===transactionId;}))return{status:'DUPLICATE',reason:'FUNDING_ALREADY_POSTED'};
    if(sourceType==='GOVERNMENT_GRANT'){
      if(!proposal.decision.allowStateSupport)return{status:'BLOCKED',reason:'GOVERNMENT_SUPPORT_NOT_AUTHORIZED_IN_APPROVAL'};
      var treasury=financeTreasury(cid);
      if(treasury.balance===null)return{status:'BLOCKED',reason:'TREASURY_BALANCE_UNAVAILABLE'};
      if(treasury.balance+1e-9<amount)return{status:'BLOCKED',reason:'INSUFFICIENT_TREASURY_BALANCE',available:treasury.balance,required:amount};
      setTreasuryBalance(treasury,treasury.balance-amount);
      account.availableBalance+=amount;account.capitalRaised+=amount;account.revision++;
      ledger.push({transactionId:transactionId,type:'PRIVATE_ENTERPRISE_GOVERNMENT_GRANT',proposalId:proposalId,companyId:proposal.companyId,
        amount:amount,currency:proposal.capitalUnit,direction:'TRANSFER',debitAccount:'SOVEREIGN_TREASURY',creditAccount:'COMPANY_CAPITAL:'+proposal.companyId,
        treasuryBalanceAfter:treasury.balance-amount,companyBalanceAfter:account.availableBalance,status:'POSTED',turn:turn(),authority:treasury.authority});
    }else if(sourceType==='COMPANY_CAPITAL'){
      if(account.availableBalance+1e-9<amount)return{status:'BLOCKED',reason:'INSUFFICIENT_COMPANY_CAPITAL',available:account.availableBalance,required:amount};
      ledger.push({transactionId:transactionId,type:'PRIVATE_COMPANY_CAPITAL_COMMITMENT',proposalId:proposalId,companyId:proposal.companyId,
        amount:amount,currency:proposal.capitalUnit,direction:'MEMO',companyBalanceBefore:account.availableBalance,status:'POSTED',turn:turn(),authority:'COMPANY_FINANCE_SUBLEDGER'});
    }else return{status:'BLOCKED',reason:'UNSUPPORTED_FUNDING_SOURCE'};
    proposal.funding={transactionId:transactionId,sourceType:sourceType,amount:amount,currency:proposal.capitalUnit,companyId:proposal.companyId,
      fundedTurn:turn(),status:'FUNDED',companyCapitalBalance:account.availableBalance};
    proposal.status='FUNDED';proposal.updatedTurn=turn();
    recordEvent(cid,'COMPANY_PROPOSAL_FUNDED',{proposalId:proposalId,companyId:proposal.companyId,amount:amount,sourceType:sourceType,transactionId:transactionId});
    return{status:'FUNDED',proposal:clone(proposal),capitalAccount:clone(account)};
  }
  function startConstruction(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),player=playerCountry(),proposalId=String(input.proposalId||'');
    if(cid!==player||!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var r=runtime(cid,false),proposal=r&&r.proposals.find(function(p){return p.proposalId===proposalId;});
    if(!proposal)return{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};
    if(proposal.status==='UNDER_CONSTRUCTION'||proposal.status==='PARTIALLY_UNDER_CONSTRUCTION'||proposal.status==='COMMISSIONED_PRODUCTION_GATED')return{status:'DUPLICATE',proposal:clone(proposal)};
    if(proposal.status!=='FUNDED')return{status:'BLOCKED',reason:'PROPOSAL_NOT_FUNDED'};
    var n=network(),c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType];
    if(!n||typeof n.startFactoryProject!=='function'||!profile)return{status:'BLOCKED',reason:'CANONICAL_FACTORY_CONSTRUCTION_RUNTIME_UNAVAILABLE'};
    if(proposal.sourcingPolicy==='DOMESTIC_ONLY'){
      var latest=previewFor(proposal);if(latest.status!=='READY'||latest.shortages.length)return{status:'BLOCKED',reason:'DOMESTIC_INPUT_SUPPLY_RECHECK_FAILED',preview:latest};
    }
    var quote=null;
    try{if(typeof n.factoryConstructionMaterialQuote==='function')quote=n.factoryConstructionMaterialQuote(cid,profile);}catch(e){return{status:'BLOCKED',reason:'CONSTRUCTION_BOM_QUOTE_FAILED',detail:String(e&&e.message||e)};}
    if(!quote||quote.status!=='QUOTED')return{status:'BLOCKED',reason:quote&&quote.reason||'CONSTRUCTION_MATERIAL_PREFLIGHT_FAILED',quote:quote};
    var unitCost=num(profile.constructionCost);if(unitCost===null||unitCost<=0)return{status:'BLOCKED',reason:'CANONICAL_CONSTRUCTION_COST_UNAVAILABLE'};
    var account=capitalAccount(cid,proposal.companyId,false);if(!account||account.availableBalance+1e-9<unitCost*proposal.quantity)
      return{status:'BLOCKED',reason:'COMPANY_CAPITAL_INSUFFICIENT_AT_CONSTRUCTION',available:account?account.availableBalance:0,required:unitCost*proposal.quantity};
    // Aggregate BOM preflight prevents a partial build caused by known material shortages.
    for(var m=0;m<quote.materials.length;m++){
      var row=quote.materials[m],required=num(row.required)*proposal.quantity,available=num(row.available);
      if(available===null||available+1e-9<required)return{status:'BLOCKED',reason:'AGGREGATE_CONSTRUCTION_MATERIAL_SHORTAGE',resourceId:row.resourceId,required:required,available:available===null?0:available};
    }
    var started=[],failures=[];
    for(var i=0;i<proposal.quantity;i++){
      var requestId=proposal.proposalId+':UNIT:'+String(i+1);
      var result=n.startFactoryProject({countryId:cid,factoryType:proposal.factoryType,recipeId:proposal.recipeId,
        requestId:requestId,cost:unitCost,capacityPerDay:num(profile.defaultCapacityPerDay)||1,
        contractorType:'DOMESTIC_EPC',companyId:proposal.companyId,ownerCompanyId:proposal.companyId,ownerId:proposal.companyId,
        operatorCompanyId:proposal.companyId,operatorId:proposal.companyId,ownerType:'PRIVATE_ENTERPRISE',operatorType:'PRIVATE_COMPANY_OPERATOR',
        stateControlRights:clone(proposal.ownership&&proposal.ownership.stateControlRights||proposal.stateControlRights),
        sourcePrivateProposalId:proposal.proposalId,sourcePrivateDecisionId:proposal.decision&&proposal.decision.decisionId,
        sourcePrivateFundingId:proposal.funding&&proposal.funding.transactionId,privateCompanyId:proposal.companyId,
        constructionFinanceAuthority:'OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL',
        requirePrivateCommissioningGate:true});
      if(!result||String(result.status||'').toUpperCase()!=='UNDER_CONSTRUCTION'){
        failures.push({unit:i+1,result:clone(result||{status:'BLOCKED',reason:'CONSTRUCTION_NOT_STARTED'})});break;
      }
      result.ownerCompanyId=proposal.companyId;result.ownerId=proposal.companyId;result.operatorCompanyId=proposal.companyId;result.operatorId=proposal.companyId;
      result.ownerType='PRIVATE_ENTERPRISE';result.operatorType='PRIVATE_COMPANY_OPERATOR';
      result.sourcePrivateProposalId=proposal.proposalId;result.sourcePrivateDecisionId=proposal.decision.decisionId;
      result.sourcePrivateFundingId=proposal.funding.transactionId;result.privateCompanyId=proposal.companyId;
      result.stateControlRights=clone(proposal.ownership.stateControlRights);
      started.push(result);proposal.projectIds.push(result.projectId);
      account.availableBalance-=unitCost;account.capitalSpent+=unitCost;account.revision++;
      var ledger=financeLedger(cid,true),transactionId='PE-CAPEX:'+result.projectId;
      if(!ledger.some(function(x){return x.transactionId===transactionId;})){
        ledger.push({transactionId:transactionId,type:'PRIVATE_ENTERPRISE_FACTORY_CAPEX',proposalId:proposal.proposalId,projectId:result.projectId,
          companyId:proposal.companyId,amount:unitCost,currency:proposal.capitalUnit,direction:'TRANSFER',
          debitAccount:'COMPANY_CAPITAL:'+proposal.companyId,creditAccount:'FACTORY_CONSTRUCTION:'+result.projectId,
          balanceAfter:account.availableBalance,status:'POSTED',turn:turn(),authority:'OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL'});
      }
    }
    proposal.status=failures.length?(started.length?'PARTIALLY_UNDER_CONSTRUCTION':'FUNDED'):'UNDER_CONSTRUCTION';
    proposal.updatedTurn=turn();
    proposal.construction={startedCount:started.length,requestedCount:proposal.quantity,unitCost:unitCost,projectIds:proposal.projectIds.slice(),failures:failures};
    recordEvent(cid,'COMPANY_CONSTRUCTION_STARTED',{proposalId:proposal.proposalId,companyId:proposal.companyId,startedCount:started.length,requestedCount:proposal.quantity,projectIds:proposal.projectIds.slice()});
    return{status:proposal.status,started:started.map(clone),failures:clone(failures),proposal:clone(proposal)};
  }
  function productionProofReady(){
    var proof=g.OmegaPrivateEnterprisePipelineProof||g.__OMEGA_SAB34_PIPELINE_PROOF||null;
    return !!(proof&&proof.status==='VERIFIED'&&proof.siteSelection===true&&proof.extraction===true&&
      proof.logisticsReceipt===true&&proof.factoryInput===true&&proof.finishedGoods===true&&proof.saveLoad===true&&
      typeof proof.exactMainSha==='string'&&proof.exactMainSha.length>=7);
  }
  function applyCommissionedAsset(country,project){
    if(!project||!project.sourcePrivateProposalId)return null;
    var cid=canonicalCountry(country),econ=countryBucket('economy',cid,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
    var asset=assets.find(function(a){return String(a.id||a.factoryId||'')===String(project.factoryId||'');});
    if(!asset)return null;
    var company=id(project.privateCompanyId||project.ownerCompanyId||project.companyId);
    if(COMPANY_IDS.indexOf(company)<0)return null;
    var productionReady=productionProofReady();
    asset.ownerId=company;asset.ownerCompanyId=company;asset.ownerType='PRIVATE_ENTERPRISE';
    asset.operatorId=company;asset.operatorCompanyId=company;asset.operatorType='PRIVATE_COMPANY_OPERATOR';
    asset.companyId=company;asset.stateControlRights=clone(project.stateControlRights||{});
    asset.ownershipStatus='PRIVATE_COMPANY_OWNED';asset.operatorStatus='PRIVATE_COMPANY_OPERATED';
    asset.sourcePrivateProposalId=project.sourcePrivateProposalId;asset.sourcePrivateDecisionId=project.sourcePrivateDecisionId||null;
    asset.sourcePrivateFundingId=project.sourcePrivateFundingId||null;asset.constructionProjectId=project.projectId;
    asset.productionEnabled=productionReady;
    if(!productionReady){
      asset.status='BLOCKED';asset.productionStatus='STRATEGIC_SUPPLY_PIPELINE_PROOF_REQUIRED';
      asset.productionHealth={status:'STOPPED',productivityPct:0,reason:'SAB34_PIPELINE_PROOF_REQUIRED',updatedTurn:turn(),authority:'OMEGA_PRIVATE_ENTERPRISE_PIPELINE_GATE'};
      asset.blockedReason='SAB34_PIPELINE_PROOF_REQUIRED';
    }
    var resource=countryBucket('resource',cid,false)||{},projects=resource.industrialNetwork&&resource.industrialNetwork.projects||[];
    var proposal=runtime(cid,false)?.proposals.find(function(p){return p.proposalId===project.sourcePrivateProposalId;});
    if(proposal){
      if(!Array.isArray(proposal.commissionedFactoryIds))proposal.commissionedFactoryIds=[];
      if(proposal.commissionedFactoryIds.indexOf(asset.id)<0)proposal.commissionedFactoryIds.push(asset.id);
      var all=proposal.projectIds.every(function(projectId){var row=projects.find(function(x){return x.projectId===projectId;});return row&&row.status==='COMPLETED';});
      if(all&&proposal.commissionedFactoryIds.length>=proposal.projectIds.length){
        proposal.status=productionReady?'COMMISSIONED':'COMMISSIONED_PRODUCTION_GATED';
        proposal.updatedTurn=turn();proposal.productionEnabled=productionReady;
        proposal.commissioning={status:proposal.status,productionEnabled:productionReady,commissionedFactoryIds:proposal.commissionedFactoryIds.slice(),turn:turn()};
      }else proposal.status='UNDER_CONSTRUCTION';
    }
    recordEvent(cid,'PRIVATE_FACTORY_COMMISSIONED',{projectId:project.projectId,proposalId:project.sourcePrivateProposalId,factoryId:asset.id,companyId:company,productionEnabled:productionReady,blockedReason:productionReady?null:'SAB34_PIPELINE_PROOF_REQUIRED'});
    return asset;
  }
  function onFactoryCapacityChanged(event){
    var detail=event&&event.detail||{},payload=detail.payload||detail,projectId=String(payload.projectId||'');
    if(!projectId)return;
    var cid=canonicalCountry(detail.countryId||payload.countryId||playerCountry());
    if(cid!==playerCountry())return;
    var resource=countryBucket('resource',cid,false)||{},projects=resource.industrialNetwork&&resource.industrialNetwork.projects||[];
    var project=projects.find(function(p){return p.projectId===projectId&&p.projectType==='FACTORY_CONSTRUCTION'&&p.sourcePrivateProposalId;});
    if(project)applyCommissionedAsset(cid,project);
  }
  function getCountryDashboard(country){
    var cid=canonicalCountry(country||playerCountry()),r=runtime(cid,false),f=financeBucket(cid,false),omega=f&&f.omegaFinance||{},accounts=omega.companyCapitalAccounts||{};
    return{version:VERSION,countryId:cid,playerCountryId:playerCountry(),activeCountry:cid===playerCountry(),
      proposals:r?clone(r.proposals):[],events:r?clone(r.events):[],capitalAccounts:clone(accounts),
      companyIds:COMPANY_IDS.slice(),productionEnabled:productionProofReady(),
      pipelineGate:productionProofReady()?'VERIFIED':'BLOCKED_SAB34_PROOF_REQUIRED'};
  }
  function getCompanyCapitalSummary(country,company){
    var a=capitalAccount(country,id(company),false);return a?clone(a):{companyId:id(company),currency:'GAME_CURRENCY_UNITS',availableBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
  }
  function diagnostics(){
    var cid=playerCountry(),dash=cid?getCountryDashboard(cid):null;
    return{version:VERSION,status:cid?'READY':'PLAYER_COUNTRY_UNRESOLVED',playerCountryId:cid||null,
      proposalCount:dash?dash.proposals.length:0,productionEnabled:productionProofReady(),
      pipelineGate:productionProofReady()?'VERIFIED':'BLOCKED_SAB34_PROOF_REQUIRED',
      financeAuthority:'Game.state.finance[country].omegaFinance.ledger',
      constructionAuthority:'OmegaResourceIndustrialNetwork.startFactoryProject / advanceProjects',
      assetAuthority:'Game.state.economy[country].productionAssets',
      runtimeScope:'ACTIVE_PLAYER_COUNTRY_ONLY'};
  }
  function listFactoryTypes(){
    var c=catalog()||{},profiles=c.factoryProfiles||{};
    return Object.keys(profiles).map(function(type){return{id:type,name:profiles[type].name||type};});
  }
  function renderPanel(root,options){
    if(!root||!root.querySelector)return;
    var tab=root.__omegaV2IndustryTab||options&&options.tab||'factories';
    if(tab!=='production-lines')return;
    var shell=root.querySelector('.omega-v2-factory-command')||root.querySelector('.omega-v2-industry-command')||root;
    if(!shell||!shell.insertAdjacentHTML)return;
    var country=canonicalCountry(options&&options.countryId||root.__omegaV2IndustryCountryId||playerCountry());
    if(country!==playerCountry())return;
    var dash=getCountryDashboard(country),types=listFactoryTypes(),baselineRow=baseline(country);
    var capitalByCompany=dash.capitalAccounts||{};
    var companyOptions=COMPANY_IDS.map(function(company){var balance=capitalByCompany[company]&&num(capitalByCompany[company].availableBalance)||0;return'<option value="'+company+'">'+COMPANY_NAMES[company]+' · capital '+balance.toLocaleString('en-US')+'</option>';}).join('');
    var typeOptions=types.map(function(type){return'<option value="'+type.id+'">'+String(type.name).replace(/[&<>"]/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]);})+'</option>';}).join('');
    var cards=dash.proposals.slice().reverse().map(function(p){
      var account=capitalByCompany[p.companyId]||{},balance=num(account.availableBalance)||0;
      var buttons='';
      if(p.status==='PROPOSED')buttons='<button type="button" data-pe-action="approve" data-pe-proposal="'+p.proposalId+'">Approve</button><button type="button" data-pe-action="defer" data-pe-proposal="'+p.proposalId+'">Defer</button><button type="button" data-pe-action="deny" data-pe-proposal="'+p.proposalId+'">Reject</button>';
      else if(p.status==='APPROVED_AWAITING_FUNDING'){
        if(balance+1e-9>=num(p.capitalRequired))buttons+='<button type="button" data-pe-action="fund-company" data-pe-proposal="'+p.proposalId+'">Fund from company capital</button>';
        if(p.decision&&p.decision.allowStateSupport)buttons+='<button type="button" data-pe-action="fund-grant" data-pe-proposal="'+p.proposalId+'">Authorize Treasury grant</button>';
      }else if(p.status==='FUNDED')buttons='<button type="button" data-pe-action="construct" data-pe-proposal="'+p.proposalId+'">Start construction</button>';
      var shortages=(p.expectedInputRequirements||[]).filter(function(x){return x.shortfall!==null&&x.shortfall>0;}).map(function(x){return'<span class="pe-warning">'+x.resourceId+': projected shortfall '+Number(x.shortfall).toLocaleString('en-US')+'</span>';}).join('');
      var progress=(p.projectIds||[]).length+'/'+p.quantity+' projects';
      var facts='<div class="pe-facts"><span>Factory: '+p.factoryName+'</span><span>Quantity: '+p.quantity+'</span><span>Capital: '+(p.capitalRequired===null?'Unquoted':Number(p.capitalRequired).toLocaleString('en-US')+' '+p.capitalUnit)+'</span><span>Company capital: '+balance.toLocaleString('en-US')+'</span><span>Source: '+p.sourcingPolicy.replace(/_/g,' ')+'</span><span>Projects: '+progress+'</span></div>';
      return'<article class="pe-proposal"><header><strong>'+p.companyName+'</strong><span>'+p.status.replace(/_/g,' ')+'</span></header>'+facts+shortages+'<div class="pe-actions">'+buttons+'</div></article>';
    }).join('')||'<div class="pe-empty">No company expansion proposal has been submitted for this country.</div>';
    var message=root.__omegaPrivateEnterpriseMessage?'<p class="pe-message" role="status">'+escapeHtml(root.__omegaPrivateEnterpriseMessage)+'</p>':'';
    var grantHelp='<small>State grant support is a real Treasury outflow and requires an explicit request plus approval. No company cash is assumed from the static opening allocation.</small>';
    var markup='<section class="omega-private-lifecycle" data-omega-private-company-lifecycle="v1"><header class="pe-head"><div><small>PRODUCTION LINES / NATIONAL INDUSTRY POLICY</small><h3>Company expansion proposals</h3><p>Government decides; firms own and operate approved private assets.</p></div><span class="pe-gate">'+(dash.productionEnabled?'PRIVATE PRODUCTION ENABLED':'PRODUCTION GATED BY SAB-34')+'</span></header>'+
      '<div class="pe-overview"><span>Companies <b>5</b></span><span>Proposals <b>'+dash.proposals.length+'</b></span><span>Opening baseline <b>'+(baselineRow&&baselineRow.status==='READY'?baselineRow.totalPrivateFactoryUnits.toLocaleString('en-US'):'Unavailable')+'</b></span><span>Finance <b>'+Object.keys(capitalByCompany).length+' capital accounts</b></span></div>'+
      '<form class="pe-form" data-pe-proposal-form><label>Company<select name="companyId">'+companyOptions+'</select></label><label>Factory type<select name="factoryType">'+typeOptions+'</select></label><label>Quantity<input name="quantity" type="number" min="1" max="'+MAX_PROJECTS_PER_PROPOSAL+'" step="1" value="1" required></label><label>Input sourcing<select name="sourcingPolicy"><option value="DOMESTIC_ONLY">Domestic inputs</option><option value="COMPANY_FUNDED_IMPORTS">Company-funded imports</option><option value="MIXED">Mixed sourcing</option></select></label><label class="pe-checkbox"><input name="stateSupportRequested" type="checkbox"> Request possible Treasury grant support</label><button type="submit">Submit company proposal</button></form>'+grantHelp+message+
      '<div class="pe-proposals"><h4>Government decision queue</h4>'+cards+'</div>'+
      '<p class="pe-footnote">Opening allocations are not operating factories. Construction uses the existing industrial project registry and bill of materials. Completed private factories remain production-blocked until the SAB-34 live supply-chain and save/load proof is verified.</p></section>';
    var old=shell.querySelector('[data-omega-private-company-lifecycle]');
    if(old&&old.remove)old.remove();
    shell.insertAdjacentHTML('beforeend',markup);
    bindUi(root);
  }
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);});}
  function refresh(root,country){
    root.__omegaPrivateEnterpriseMessage='';
    var api=g.OmegaUIV2Industry,opts=Object.assign({},root.__omegaV2IndustryOptions||{},{countryId:country,tab:'production-lines'});
    if(api&&typeof api.render==='function')api.render(root,opts);
  }
  function bindUi(root){
    if(root.__omegaPrivateEnterpriseUiBound||typeof root.addEventListener!=='function')return;
    root.addEventListener('submit',function(event){
      var form=event.target;if(!form||!form.matches||!form.matches('[data-pe-proposal-form]'))return;
      if(event.preventDefault)event.preventDefault();
      var data=new FormData(form),result=createProposal({countryId:root.__omegaV2IndustryCountryId||playerCountry(),
        companyId:data.get('companyId'),factoryType:data.get('factoryType'),quantity:data.get('quantity'),
        sourcingPolicy:data.get('sourcingPolicy'),stateSupportRequested:data.get('stateSupportRequested')==='on'});
      root.__omegaPrivateEnterpriseMessage=result.status==='PROPOSED'?'Proposal submitted. It has no factory, stock or cash effect until the government decision and funding stages.':('Proposal blocked: '+(result.reason||result.status));
      refresh(root,root.__omegaV2IndustryCountryId||playerCountry());
    });
    root.addEventListener('click',function(event){
      var target=event.target,button=target&&target.closest?target.closest('[data-pe-action]'):null;if(!button)return;
      var proposalId=button.getAttribute('data-pe-proposal'),action=button.getAttribute('data-pe-action'),country=root.__omegaV2IndustryCountryId||playerCountry();
      var result;
      if(action==='approve')result=decideProposal({countryId:country,proposalId:proposalId,decision:'APPROVE',allowStateSupport:true,conditions:{allowStateSupport:true}});
      else if(action==='defer')result=decideProposal({countryId:country,proposalId:proposalId,decision:'DEFER',reason:'Deferred by player government'});
      else if(action==='deny')result=decideProposal({countryId:country,proposalId:proposalId,decision:'DENY',reason:'Rejected by player government'});
      else if(action==='fund-company'){var p=getProposal(country,proposalId);result=p?fundProposal({countryId:country,proposalId:proposalId,sourceType:'COMPANY_CAPITAL',amount:p.capitalRequired}):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};}
      else if(action==='fund-grant'){var p2=getProposal(country,proposalId);result=p2?fundProposal({countryId:country,proposalId:proposalId,sourceType:'GOVERNMENT_GRANT',amount:p2.capitalRequired}):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};}
      else if(action==='construct')result=startConstruction({countryId:country,proposalId:proposalId});
      else return;
      root.__omegaPrivateEnterpriseMessage=result&&['APPROVED_AWAITING_FUNDING','DENIED','DEFERRED','FUNDED','UNDER_CONSTRUCTION','PARTIALLY_UNDER_CONSTRUCTION','COMMISSIONED_PRODUCTION_GATED'].indexOf(result.status)>=0
        ?'Lifecycle updated: '+result.status.replace(/_/g,' ').toLowerCase()+'.'
        :'Action blocked: '+String(result&& (result.reason||result.status)||'UNKNOWN').replace(/_/g,' ').toLowerCase()+'.';
      refresh(root,country);
    });
    root.__omegaPrivateEnterpriseUiBound=true;
  }
  function installIndustryHook(){
    var screen=g.OmegaUIV2Industry;if(!screen||typeof screen.render!=='function'||screen.__privateLifecycleWrapped)return false;
    var original=screen.render;
    var wrapped=function(root,options){
      var result=original(root,options);
      if(result&&result.ok)renderPanel(root,options||{});
      return result;
    };
    g.OmegaUIV2Industry=Object.freeze(Object.assign({},screen,{render:wrapped,__privateLifecycleWrapped:true}));
    return true;
  }
  if(typeof g.addEventListener==='function'){
    g.addEventListener(NETWORK_EVENT,onFactoryCapacityChanged);
    g.addEventListener('OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_CHANGED',function(){});
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',function(){
      // No global or per-frame company AI. Only keep the selected country's display in sync.
      var country=playerCountry(),root=g.document&&g.document.querySelector&&g.document.querySelector('[data-omega-private-company-lifecycle]');
      if(root&&country&&root.closest){var host=root.closest('.omega-v2-factory-command, .omega-v2-industry-command');if(host&&host.parentNode){var mount=host.parentNode;var panel=mount.querySelector('[data-omega-private-company-lifecycle]');if(panel&&panel.isConnected){panel.setAttribute('data-last-turn',String(turn()));}}}
    });
  }
  installIndustryHook();
  var API=Object.freeze({
    VERSION:VERSION,companyIds:COMPANY_IDS.slice(),companyNames:clone(COMPANY_NAMES),
    createProposal:createProposal,decideProposal:decideProposal,previewProposal:function(country,id){var p=getProposal(country,id);return p?previewFor(p):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};},
    fundProposal:fundProposal,startConstruction:startConstruction,recordCompanyCapitalReceipt:recordCompanyCapitalReceipt,
    getProposal:getProposal,getCountryDashboard:getCountryDashboard,getCompanyCapitalSummary:getCompanyCapitalSummary,
    diagnostics:diagnostics,productionProofReady:productionProofReady
  });
  g.OmegaPrivateEnterpriseLifecycleV1=API;g.Omega=g.Omega||{};g.Omega.PrivateEnterpriseLifecycleV1=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
