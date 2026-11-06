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
    if(!obj(econ.privateEnterpriseLifecycle)&&create)econ.privateEnterpriseLifecycle={schemaVersion:VERSION,nextProposalSequence:1,nextJointVentureSequence:1,proposals:[],events:[],financialPeriods:[],jointVentures:[]};
    var r=econ.privateEnterpriseLifecycle;
    if(!obj(r))return null;
    if(!Array.isArray(r.proposals))r.proposals=[];
    if(!Array.isArray(r.events))r.events=[];
    if(!Array.isArray(r.financialPeriods))r.financialPeriods=[];
    if(!Array.isArray(r.jointVentures))r.jointVentures=[];
    if(!Number.isInteger(r.nextProposalSequence)||r.nextProposalSequence<1)r.nextProposalSequence=1;
    if(!Number.isInteger(r.nextJointVentureSequence)||r.nextJointVentureSequence<1)r.nextJointVentureSequence=1;
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
  function estimateCompanyCapitalReservation(country,company){
    var r=runtime(country,false),rows=financeLedger(country,false)||[],reserved=0;
    (r&&Array.isArray(r.proposals)?r.proposals:[]).forEach(function(proposal){
      if(id(proposal.companyId)!==id(company)||!proposal.funding||proposal.funding.status!=='FUNDED'||
         ['FUNDED','UNDER_CONSTRUCTION','PARTIALLY_UNDER_CONSTRUCTION'].indexOf(proposal.status)<0)return;
      var committed=Math.max(0,num(proposal.funding.amount)||0);
      var spent=rows.filter(function(row){return row&&row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'&&
        row.proposalId===proposal.proposalId&&id(row.companyId)===id(company)&&String(row.status||'').toUpperCase()==='POSTED';})
        .reduce(function(total,row){return total+Math.max(0,num(row.amount)||0);},0);
      reserved+=Math.max(0,committed-spent);
    });
    return reserved;
  }
  function normalizeCapitalReservation(country,company,account){
    if(!account)return 0;
    if(num(account.reservedBalance)===null){
      var migrated=estimateCompanyCapitalReservation(country,company);
      account.reservedBalance=migrated;
      if(migrated>0){
        account.availableBalance=Math.max(0,(num(account.availableBalance)||0)-migrated);
        account.revision=(num(account.revision)||0)+1;
      }
    }
    return Math.max(0,num(account.reservedBalance)||0);
  }
  function capitalAccount(country,company,create){
    var all=capitalAccounts(country,create);if(!all)return null;
    if(!obj(all[company])&&create)all[company]={companyId:company,currency:'GAME_CURRENCY_UNITS',availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
    if(!obj(all[company]))return null;
    normalizeCapitalReservation(country,company,all[company]);
    return all[company];
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
    if(source.field==='omegaFinance.treasuryBalanceUsd'){
      source.bucket.omegaFinance=source.bucket.omegaFinance||{};
      source.bucket.omegaFinance.treasuryBalanceUsd=amount;
      source.bucket.available=amount;
    }else{
      source.bucket[source.field]=amount;
      if(source.field==='available'&&obj(source.bucket.omegaFinance)&&num(source.bucket.omegaFinance.treasuryBalanceUsd)!==null)source.bucket.omegaFinance.treasuryBalanceUsd=amount;
    }
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
    var strategic=obj(bucket.strategicReserve)||{},protectedMap=strategic.availableByResource||strategic.protectedByResource||strategic.minimumByResource||
      bucket.protectedStockByResource||bucket.minimumStockByResource||{};
    var protectedValue=null;
    Object.keys(protectedMap).some(function(key){if(token(key)!==token(resourceId))return false;protectedValue=Math.max(0,num(protectedMap[key])||0);return true;});
    var protectedQty=protectedValue===null?0:protectedValue;
    var availableAfterProtection=amount===null?null:Math.max(0,amount-protectedQty);
    var demandRuntime=obj(bucket.demandRuntime)||{},byResource=obj(demandRuntime.byResource)||{},demandRow=null;
    Object.keys(byResource).some(function(key){if(token(key)!==token(resourceId))return false;demandRow=byResource[key];return true;});
    var demandFresh=num(demandRuntime.lastTurn)===turn(),demandPerDay=demandFresh&&demandRow?num(demandRow.demandPerDay):null;
    var consumerDemandPerDay=demandFresh&&demandRow?num(demandRow.consumerDemandPerDay):null;
    var factoryDemandPerDay=demandFresh&&demandRow?num(demandRow.activeFactoryInputDemandPerDay):null;
    var existingDemand30Day=demandPerDay===null?null:demandPerDay*30;
    var availableForProposal=availableAfterProtection===null?null:
      demandPerDay===null?availableAfterProtection:Math.max(0,availableAfterProtection-existingDemand30Day);
    var confirmedInbound=demandFresh&&demandRow?Math.max(0,num(demandRow.pendingImportQuantity)||0):0;
    return{resourceId:resourceId,available:availableForProposal,physicalAvailable:amount,availableAfterProtection:availableAfterProtection,
      reserved:reserved,protectedStock:protectedQty,nationalDemandPerDay:demandPerDay,consumerDemandPerDay:consumerDemandPerDay,
      existingFactoryInputDemandPerDay:factoryDemandPerDay,existingDemand30Day:existingDemand30Day,
      confirmedInboundNotCounted:confirmedInbound,demandStatus:demandPerDay===null?'UNOBSERVED_OR_STALE':'CURRENT_TURN_SNAPSHOT',
      authority:amount===null?'UNOBSERVED':invAmount!==null&&warehouseFree!==null?'INVENTORY_AND_WAREHOUSE_LEDGER':warehouseFree!==null?'RAW_WAREHOUSE_LEDGER':'LEGACY_INVENTORY_AGGREGATE'};
  }
  function inputForecast(country,profile,recipe,quantity){
    var inputs=recipe&&recipe.inputs||{},capacity=Math.max(1,num(profile&&profile.defaultCapacityPerDay)||1)*quantity,rows=[];
    Object.keys(inputs).forEach(function(resourceId){
      var perUnit=num(inputs[resourceId]);if(perUnit===null||perUnit<=0)return;
      var needed=perUnit*capacity*30,stock=resourceAvailable(country,resourceId);
      rows.push({resourceId:resourceId,perUnit:perUnit,forecast30Day:needed,available:stock.available,physicalAvailable:stock.physicalAvailable,
        protectedStock:stock.protectedStock,nationalDemandPerDay:stock.nationalDemandPerDay,consumerDemandPerDay:stock.consumerDemandPerDay,
        existingFactoryInputDemandPerDay:stock.existingFactoryInputDemandPerDay,existingDemand30Day:stock.existingDemand30Day,
        confirmedInboundNotCounted:stock.confirmedInboundNotCounted,demandStatus:stock.demandStatus,
        shortfall:stock.available===null?null:Math.max(0,needed-stock.available),authority:stock.authority,reserved:stock.reserved});
    });
    return rows;
  }
  function operationalCapacityPreview(country,profile,quantity){
    var n=network(),diagnostic=null;
    try{if(n&&typeof n.factoryUtilityDiagnostics==='function')diagnostic=n.factoryUtilityDiagnostics(country);}catch(_){}
    var utilities=profile&&profile.utilities||{},rows=[];
    function add(label,required,available,unit){
      required=num(required);available=num(available);
      if(required===null||required<=0)return;
      rows.push({type:label,required:required,available:available,unit:unit,
        status:available===null?'UNOBSERVED':available+1e-9>=required?'AVAILABLE':'SHORTFALL',
        shortfall:available===null?null:Math.max(0,required-available),
        authority:diagnostic&&diagnostic.utilityAuthority||'NOT_RECORDED'});
    }
    add('ELECTRICITY',num(utilities.electricityMWhPerDay)===null?null:num(utilities.electricityMWhPerDay)*quantity,
      diagnostic&&diagnostic.electricity&&diagnostic.electricity.availableThisTurn,'MWh/day');
    add('WATER',num(utilities.waterM3PerDay)===null?null:num(utilities.waterM3PerDay)*quantity,
      diagnostic&&diagnostic.water&&diagnostic.water.availableThisTurn,'m3/day');
    var workforce=diagnostic&&diagnostic.workforce||{},core=num(profile&&profile.employment&&profile.employment.coreOperatingCrew);
    if(core===null)core=(num(profile&&profile.workforce&&profile.workforce.operators)||0)+(num(profile&&profile.workforce&&profile.workforce.engineers)||0);
    if(core>0)rows.push({type:'WORKFORCE',required:core*quantity,
      available:num(workforce.unemployedCount),unit:'workers',
      status:num(workforce.unemployedCount)===null?'UNOBSERVED':num(workforce.unemployedCount)+1e-9>=core*quantity?'AVAILABLE':'SHORTFALL',
      shortfall:num(workforce.unemployedCount)===null?null:Math.max(0,core*quantity-num(workforce.unemployedCount)),
      authority:workforce.authority||'NOT_RECORDED'});
    var resource=countryBucket('resource',country,false)||{},rawWarehouse=resource.warehouse||{};
    var storageCapacity=rawWarehouse.capacityByResource||rawWarehouse.storageCapacityByResource||null;
    var transport=diagnostic&&diagnostic.transportCapacity||{};
    return{
      status:rows.some(function(row){return row.status==='SHORTFALL';})?'SHORTFALL':rows.some(function(row){return row.status==='UNOBSERVED';})?'UNOBSERVED':'READY',
      requirements:rows,
      infrastructure:clone(profile&&profile.requiredInfrastructure||[]),
      transportCapacity:Object.keys(transport).map(function(mode){var row=transport[mode]||{};return{mode:mode,availableThisTurn:num(row.availableThisTurn),unit:row.unit||null,authority:row.authority||'UNOBSERVED'};}),
      storage:{status:storageCapacity?'CAPACITY_DATA_RECORDED':'CAPACITY_NOT_RECORDED',capacityByResource:storageCapacity?clone(storageCapacity):null,
        warehouseId:rawWarehouse.warehouseId||null,authority:storageCapacity?'COUNTRY_RAW_WAREHOUSE_STATE':'UNOBSERVED'},
      diagnosticTurn:num(diagnostic&&diagnostic.turn),utilityStatus:diagnostic&&diagnostic.status||'NOT_RECORDED',
      authority:'EXISTING_INDUSTRIAL_NETWORK_UTILITY_AND_EMPLOYMENT_DIAGNOSTICS',simulationOnly:true
    };
  }
  function maximumDomesticQuantity(inputs,profile,limit){
    var max=Math.max(0,Math.floor(num(limit)||0)),capacity=num(profile&&profile.defaultCapacityPerDay);
    if(capacity===null||capacity<=0||!Array.isArray(inputs)||!inputs.length)return{quantity:0,status:'UNOBSERVED',reason:'CANONICAL_RECIPE_INPUT_RATE_UNAVAILABLE'};
    for(var i=0;i<inputs.length;i++){
      var row=inputs[i];
      if(row.available===null||row.nationalDemandPerDay===null)return{quantity:null,status:'UNOBSERVED',resourceId:row.resourceId};
      var perFactory=Math.max(0,num(row.perUnit)||0)*capacity*30;
      if(perFactory>0)max=Math.min(max,Math.floor((Math.max(0,num(row.available)||0)+1e-9)/perFactory));
    }
    return{quantity:max,status:'MEASURED',horizonDays:30};
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
    var unobserved=inputs.filter(function(x){return x.available===null||x.nationalDemandPerDay===null;});
    var operationalReadiness=operationalCapacityPreview(cid,profile,proposal.quantity);
    var safeDomestic=maximumDomesticQuantity(inputs,profile,maxAdditional);
    var capacity=profile.defaultCapacityPerDay===undefined?null:num(profile.defaultCapacityPerDay)*proposal.quantity;
    var constructionQuote=null;
    try{var n=network();if(n&&typeof n.factoryConstructionMaterialQuote==='function')constructionQuote=n.factoryConstructionMaterialQuote(cid,profile);}catch(_){}
    return{
      status:proposal.quantity<=maxAdditional?'READY':'BLOCKED',
      reason:proposal.quantity<=maxAdditional?null:'PRIVATE_EXPANSION_LIMIT_REACHED',
      countryId:cid,factoryType:proposal.factoryType,requestedQuantity:proposal.quantity,
      governmentFactoryCount:governmentCount,openingPrivateAllocation:openingPrivate,commissionedPrivateCount:livePrivate,
      maximumPrivateUnits:maximumPrivate,maximumAdditionalUnits:maxAdditional,
      maximumSafeDomesticFactoryQuantity:safeDomestic.quantity,domesticQuantityAuthority:safeDomestic.status,
      maximumRequestedAdditionalFactoryQuantity:Math.min(maxAdditional,proposal.quantity),
      requestedDailyCapacity:capacity,constructionCostPerFactory:num(profile.constructionCost),capitalRequired:num(profile.constructionCost)===null?null:num(profile.constructionCost)*proposal.quantity,
      inputForecastDays:30,inputRequirements:inputs,shortages:deficits,unobservedInputs:unobserved,
      constructionMaterials:constructionQuote,operationalReadiness:operationalReadiness,
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
    var company=id(input.companyId),operatorCompany=id(input.operatorCompanyId||input.companyId),factoryType=id(input.factoryType),quantity=num(input.quantity);
    if(COMPANY_IDS.indexOf(company)<0)return{status:'BLOCKED',reason:'UNKNOWN_CANONICAL_COMPANY'};
    if(COMPANY_IDS.indexOf(operatorCompany)<0)return{status:'BLOCKED',reason:'UNKNOWN_PRIVATE_OPERATOR_COMPANY'};
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
      operatorCompanyId:operatorCompany,
      ownership:{ownerCompanyId:company,operatorCompanyId:operatorCompany,stateControlRights:{strategicOversight:true,licensingAndPermits:true,fiscalRegulation:true,labourSafetyEnvironmentalRegulation:true,strategicSupplyOversight:true,strategicContracts:true,domesticSupplyDirection:true,exportControl:true,publicProcurement:true,competitionOversight:true,foreignOwnershipReview:true,emergencyIntervention:true,operationalControl:'STATE_POLICY_ONLY',authority:'OMEGA_STATE_CONTROL_RIGHTS_V1',simulationOnly:true}},
      stateControlRights:{strategicOversight:true,licensingAndPermits:true,fiscalRegulation:true,labourSafetyEnvironmentalRegulation:true,strategicSupplyOversight:true,strategicContracts:true,domesticSupplyDirection:true,exportControl:true,publicProcurement:true,competitionOversight:true,foreignOwnershipReview:true,emergencyIntervention:true,operationalControl:'STATE_POLICY_ONLY',authority:'OMEGA_STATE_CONTROL_RIGHTS_V1',simulationOnly:true},
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
  function adjustProposal(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry());
    if(cid!==playerCountry()||!cid)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var r=runtime(cid,false),proposal=r&&r.proposals.find(function(p){return p.proposalId===String(input.proposalId||'');});
    if(!proposal)return{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};
    if(proposal.status!=='PROPOSED')return{status:'BLOCKED',reason:'PROPOSAL_ALREADY_DECIDED'};
    var quantity=num(input.quantity);
    if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>MAX_PROJECTS_PER_PROPOSAL)
      return{status:'BLOCKED',reason:'PROPOSAL_QUANTITY_OUT_OF_RANGE',minimum:1,maximum:MAX_PROJECTS_PER_PROPOSAL};
    var oldQuantity=proposal.quantity,oldCapital=proposal.capitalRequired,oldForecast=proposal.expectedInputRequirements;
    var profile=(catalog()||{}).factoryProfiles&&catalog().factoryProfiles[proposal.factoryType];
    proposal.quantity=quantity;
    proposal.capitalRequired=profile&&num(profile.constructionCost)!==null?num(profile.constructionCost)*quantity:null;
    proposal.expectedInputRequirements=inputForecast(cid,profile,recipeFor(proposal.factoryType,profile),quantity);
    var preview=previewFor(proposal);
    if(preview.status!=='READY'){
      proposal.quantity=oldQuantity;proposal.capitalRequired=oldCapital;proposal.expectedInputRequirements=oldForecast;
      return{status:'BLOCKED',reason:preview.reason||'ADJUSTED_QUANTITY_EXCEEDS_POLICY_CAP',preview:preview};
    }
    proposal.updatedTurn=turn();
    recordEvent(cid,'COMPANY_PROPOSAL_QUANTITY_ADJUSTED',{proposalId:proposal.proposalId,previousQuantity:oldQuantity,approvedQuantity:quantity});
    return{status:'PROPOSED',proposal:clone(proposal),preview:preview};
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
    if(decision==='APPROVE'&&proposal.sourcingPolicy==='DOMESTIC_ONLY'&&(preview.shortages.length||preview.unobservedInputs.length||
       preview.maximumSafeDomesticFactoryQuantity===null||proposal.quantity>preview.maximumSafeDomesticFactoryQuantity))
      return{status:'BLOCKED',reason:preview.shortages.length?'DOMESTIC_INPUT_SHORTAGE':'DOMESTIC_INPUT_STOCK_UNOBSERVED',
        shortages:clone(preview.shortages),unobservedInputs:clone(preview.unobservedInputs),maximumSafeDomesticFactoryQuantity:preview.maximumSafeDomesticFactoryQuantity,preview:preview};
    var stateSupport=decision==='APPROVE'&&input.allowStateSupport===true&&proposal.stateSupportRequested===true;
    proposal.status=decision==='APPROVE'?'APPROVED_AWAITING_FUNDING':decision==='DENY'?'DENIED':'DEFERRED';
    var decisionId='PE-DECISION:'+proposal.proposalId+':T'+turn();
    var permit=decision==='APPROVE'?{
      permitId:'PE-PERMIT:'+proposal.proposalId+':T'+turn(),
      countryId:cid,companyId:proposal.companyId,operatorCompanyId:proposal.operatorCompanyId||proposal.companyId,
      factoryType:proposal.factoryType,quantity:proposal.quantity,status:'ACTIVE',
      issuedBy:'PLAYER_GOVERNMENT',issuedTurn:turn(),expiresAtTurn:num(input.expiryTurn)||turn()+30,
      conditions:clone(input.conditions||{}),stateControlRights:clone(proposal.stateControlRights),
      authority:'OMEGA_PRIVATE_ENTERPRISE_LICENSING_V1'
    }:null;
    proposal.decision={decision:decision,decisionId:decisionId,turn:turn(),
      reviewer:'PLAYER_GOVERNMENT',reason:String(input.reason||'').slice(0,1000),conditions:clone(input.conditions||{}),
      approvedQuantity:decision==='APPROVE'?proposal.quantity:0,allowStateSupport:stateSupport,
      permitId:permit&&permit.permitId||null,
      domesticInputCeiling:proposal.sourcingPolicy==='COMPANY_FUNDED_IMPORTS'?0:preview.inputRequirements.reduce(function(s,x){return s+(x.available===null||x.nationalDemandPerDay===null?0:Math.min(x.available,x.forecast30Day));},0),
      importSharePolicy:proposal.sourcingPolicy==='DOMESTIC_ONLY'?0:proposal.sourcingPolicy==='COMPANY_FUNDED_IMPORTS'?100:'REMAINDER_AFTER_DOMESTIC_ALLOCATION',
      preview:clone(preview),reviewTurn:turn(),expiryTurn:num(input.expiryTurn)||turn()+30};
    proposal.permit=permit;
    proposal.updatedTurn=turn();
    recordEvent(cid,'COMPANY_PROPOSAL_DECIDED',{proposalId:proposal.proposalId,decision:decision,decisionId:proposal.decision.decisionId,allowStateSupport:stateSupport});
    return{status:proposal.status,proposal:clone(proposal),preview:preview};
  }
  function advanceAutonomousProposalCycle(){
    var cid=playerCountry(),period=Math.floor(turn()/30);
    if(!cid||period<1)return{status:'WAITING',reason:'AUTONOMOUS_PROPOSAL_REVIEW_NOT_DUE'};
    var r=runtime(cid,true);
    if(r.lastAutonomousProposalPeriod===period)return{status:'DUPLICATE',period:period};
    var base=baseline(cid);
    if(!base||base.status!=='READY')return{status:'WAITING',reason:'PRIVATE_BASELINE_NOT_READY',period:period};
    r.lastAutonomousProposalPeriod=period;
    var companyIndex=(period-1)%COMPANY_IDS.length,company=COMPANY_IDS[companyIndex];
    var active=r.proposals.some(function(p){return p.companyId===company&&
      ['PROPOSED','APPROVED_AWAITING_FUNDING','FUNDED','UNDER_CONSTRUCTION','PARTIALLY_UNDER_CONSTRUCTION','COMMISSIONED_PRODUCTION_GATED'].indexOf(p.status)>=0;});
    if(active)return{status:'WAITING',reason:'COMPANY_HAS_ACTIVE_PROPOSAL',companyId:company,period:period};
    var companyRow=(base.companies||[]).find(function(row){return id(row.companyId||row.id)===company;});
    var counts=companyRow&&companyRow.factoryCounts||{};
    var eligible=Object.keys(counts).filter(function(type){return Number.isInteger(num(counts[type]))&&num(counts[type])>0;}).sort();
    var selected=null,selectedPreview=null;
    for(var i=0;i<eligible.length;i++){
      var type=id(eligible[i]),candidate={countryId:cid,factoryType:type,quantity:1};
      var preview=previewFor(candidate);
      if(preview.status==='READY'){selected=type;selectedPreview=preview;break;}
    }
    if(!selected)return{status:'NO_ELIGIBLE_CANONICAL_EXPANSION',companyId:company,period:period};
    var requestId='PE-AUTO:'+cid+':PERIOD:'+period+':'+company;
    var created=createProposal({countryId:cid,companyId:company,factoryType:selected,quantity:1,
      sourcingPolicy:'MIXED',stateSupportRequested:true,requestId:requestId});
    if(created.status!=='PROPOSED')return{status:'BLOCKED',reason:created.reason||created.status,companyId:company,period:period};
    var stored=r.proposals.find(function(p){return p.proposalId===created.proposalId;});
    if(stored){
      stored.submissionMode='AUTONOMOUS_COMPANY_TURN_CYCLE';
      stored.submittedBy=company;
      stored.proposalPeriod=period;
      stored.expectedDemandSnapshot=clone(selectedPreview.inputRequirements||[]);
      stored.provenance=Object.assign({},stored.provenance||{},{source:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1',
        actor:'AUTONOMOUS_PRIVATE_COMPANY',period:period,simulationOnly:true});
    }
    recordEvent(cid,'AUTONOMOUS_COMPANY_PROPOSAL_SUBMITTED',{proposalId:created.proposalId,companyId:company,factoryType:selected,period:period});
    return{status:'PROPOSED',proposal:getProposal(cid,created.proposalId),period:period,authority:'DETERMINISTIC_SELECTED_COUNTRY_TURN_CYCLE'};
  }
  function scheduleAutonomousProposalCycle(){
    var cid=playerCountry(),period=Math.floor(turn()/30);
    if(!cid||period<1)return;
    var r=runtime(cid,true);
    if(r.lastAutonomousProposalPeriod===period||r.pendingAutonomousProposalPeriod===period)return;
    r.pendingAutonomousProposalPeriod=period;
    var registry=g.OmegaPrivateEnterpriseRegistryV1||(g.Omega&&g.Omega.PrivateEnterpriseRegistryV1);
    var ready;
    try{ready=registry&&registry.ready;}catch(error){ready=Promise.reject(error);}
    Promise.resolve(ready).then(function(){
      var current=runtime(cid,true);
      if(current&&current.pendingAutonomousProposalPeriod===period)current.pendingAutonomousProposalPeriod=null;
      if(playerCountry()!==cid||Math.floor(turn()/30)!==period)return;
      advanceAutonomousProposalCycle();
    }).catch(function(){
      var current=runtime(cid,true);
      if(current&&current.pendingAutonomousProposalPeriod===period)current.pendingAutonomousProposalPeriod=null;
    });
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
    var sourceCurrency=id(source.currency||source.currencyCode||source.unit);
    var expectedCurrency=id(input.currency||'GAME_CURRENCY_UNITS');
    if(sourceCurrency!==expectedCurrency)
      return{status:'BLOCKED',reason:'CAPITAL_SOURCE_CURRENCY_MISMATCH_OR_UNOBSERVED',sourceCurrency:sourceCurrency||'UNOBSERVED',expectedCurrency:expectedCurrency};
    if(['SETTLED','POSTED','COMPLETED','PAID'].indexOf(sourceStatus)<0||
       !/(EQUITY|INVESTMENT|LOAN|CAPITAL|RETAINED_EARNINGS)/.test(sourceType)||
       !['CREDIT','INFLOW','DEPOSIT'].includes(direction)||
       sourceCompany!==company||
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
    if(proposal.status==='FUNDED'||proposal.status==='UNDER_CONSTRUCTION'||proposal.status==='PARTIALLY_UNDER_CONSTRUCTION'||proposal.status==='COMMISSIONED_PRODUCTION_GATED'||proposal.status==='COMMISSIONED')return{status:'DUPLICATE',proposal:clone(proposal)};
    if(proposal.status!=='APPROVED_AWAITING_FUNDING')return{status:'BLOCKED',reason:'PROPOSAL_NOT_APPROVED'};
    var amount=num(input.amount);if(amount===null||amount<=0||proposal.capitalRequired===null||Math.abs(amount-proposal.capitalRequired)>1e-6)
      return{status:'BLOCKED',reason:'FULL_CAPITAL_COMMITMENT_REQUIRED',required:proposal.capitalRequired,provided:amount};
    var permit=proposal.permit;
    if(!permit||permit.status!=='ACTIVE'||!proposal.decision||permit.permitId!==proposal.decision.permitId)
      return{status:'BLOCKED',reason:'ACTIVE_GOVERNMENT_PERMIT_REQUIRED'};
    if(num(permit.expiresAtTurn)===null||turn()>num(permit.expiresAtTurn))
      return{status:'BLOCKED',reason:'GOVERNMENT_PERMIT_EXPIRED',permitId:permit.permitId,expiresAtTurn:permit.expiresAtTurn};
    var sourceType=String(input.sourceType||'COMPANY_CAPITAL').toUpperCase(),account=capitalAccount(cid,proposal.companyId,true);
    var transactionId='PE-FUNDING:'+proposal.proposalId+':'+proposal.decision.decisionId;
    var ledger=financeLedger(cid,true);
    if(ledger.some(function(x){return x.transactionId===transactionId;}))return{status:'DUPLICATE',reason:'FUNDING_ALREADY_POSTED'};
    if(sourceType==='GOVERNMENT_GRANT'){
      if(!proposal.decision.allowStateSupport)return{status:'BLOCKED',reason:'GOVERNMENT_SUPPORT_NOT_AUTHORIZED_IN_APPROVAL'};
      var treasury=financeTreasury(cid);
      if(treasury.balance===null)return{status:'BLOCKED',reason:'TREASURY_BALANCE_UNAVAILABLE'};
      if(treasury.balance+1e-9<amount)return{status:'BLOCKED',reason:'INSUFFICIENT_TREASURY_BALANCE',available:treasury.balance,required:amount};
      if(!setTreasuryBalance(treasury,treasury.balance-amount))
        return{status:'BLOCKED',reason:'TREASURY_DEBIT_FAILED'};
      account.availableBalance+=amount;account.capitalRaised+=amount;
      ledger.push({transactionId:transactionId,type:'PRIVATE_ENTERPRISE_GOVERNMENT_GRANT',proposalId:proposalId,companyId:proposal.companyId,
        amount:amount,currency:proposal.capitalUnit,direction:'TRANSFER',debitAccount:'SOVEREIGN_TREASURY',creditAccount:'COMPANY_CAPITAL:'+proposal.companyId,
        treasuryBalanceAfter:treasury.balance-amount,status:'POSTED',turn:turn(),authority:treasury.authority});
    }else if(sourceType==='COMPANY_CAPITAL'){
      if(account.availableBalance+1e-9<amount)return{status:'BLOCKED',reason:'INSUFFICIENT_UNRESERVED_COMPANY_CAPITAL',available:account.availableBalance,required:amount};
      ledger.push({transactionId:transactionId,type:'PRIVATE_COMPANY_CAPITAL_COMMITMENT',proposalId:proposalId,companyId:proposal.companyId,
        amount:amount,currency:proposal.capitalUnit,direction:'MEMO',companyBalanceBefore:account.availableBalance,status:'POSTED',turn:turn(),authority:'COMPANY_FINANCE_SUBLEDGER'});
    }else return{status:'BLOCKED',reason:'UNSUPPORTED_FUNDING_SOURCE'};
    if(account.availableBalance+1e-9<amount)
      return{status:'BLOCKED',reason:'INSUFFICIENT_UNRESERVED_COMPANY_CAPITAL',available:account.availableBalance,required:amount};
    account.availableBalance=Math.max(0,account.availableBalance-amount);
    account.reservedBalance=normalizeCapitalReservation(cid,proposal.companyId,account)+amount;
    account.revision=(num(account.revision)||0)+1;
    var fundingEntry=ledger.find(function(row){return row.transactionId===transactionId;});
    if(fundingEntry){fundingEntry.companyBalanceAfter=account.availableBalance;fundingEntry.companyReservedAfter=account.reservedBalance;}
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
    if(proposal.status==='UNDER_CONSTRUCTION'||proposal.status==='COMMISSIONED_PRODUCTION_GATED'||proposal.status==='COMMISSIONED')return{status:'DUPLICATE',proposal:clone(proposal)};
    if(proposal.status!=='FUNDED'&&proposal.status!=='PARTIALLY_UNDER_CONSTRUCTION')return{status:'BLOCKED',reason:'PROPOSAL_NOT_FUNDED'};
    var permit=proposal.permit;
    if(!permit||permit.status!=='ACTIVE'||permit.permitId!==proposal.decision?.permitId)
      return{status:'BLOCKED',reason:'ACTIVE_GOVERNMENT_PERMIT_REQUIRED'};
    if(turn()>(num(permit.expiresAtTurn)||0))return{status:'BLOCKED',reason:'GOVERNMENT_PERMIT_EXPIRED',permitId:permit.permitId,expiresAtTurn:permit.expiresAtTurn};
    if(num(permit.quantity)!==proposal.quantity||permit.companyId!==proposal.companyId||
       permit.operatorCompanyId!==(proposal.operatorCompanyId||proposal.companyId))
      return{status:'BLOCKED',reason:'GOVERNMENT_PERMIT_SCOPE_MISMATCH'};
    var n=network(),c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType];
    if(!n||typeof n.startFactoryProject!=='function'||!profile)return{status:'BLOCKED',reason:'CANONICAL_FACTORY_CONSTRUCTION_RUNTIME_UNAVAILABLE'};
    var latest=previewFor(proposal);
    if(latest.status!=='READY')
      return{status:'BLOCKED',reason:latest.reason||'PRIVATE_FACTORY_PRECONSTRUCTION_PREVIEW_BLOCKED',preview:latest};
    if(latest.unobservedInputs&&latest.unobservedInputs.length)
      return{status:'BLOCKED',reason:'FACTORY_INPUT_STOCK_OR_DEMAND_UNOBSERVED',unobservedInputs:clone(latest.unobservedInputs),preview:latest};
    if(latest.shortages&&latest.shortages.length)
      return{status:'BLOCKED',reason:'FACTORY_INPUT_STOCK_SHORTAGE',shortages:clone(latest.shortages),preview:latest};
    var unitCost=num(profile.constructionCost);if(unitCost===null||unitCost<=0)return{status:'BLOCKED',reason:'CANONICAL_CONSTRUCTION_COST_UNAVAILABLE'};
    var resourceState=countryBucket('resource',cid,false)||{},projectRows=resourceState.industrialNetwork&&Array.isArray(resourceState.industrialNetwork.projects)
      ?resourceState.industrialNetwork.projects:[],ledger=financeLedger(cid,true),account=capitalAccount(cid,proposal.companyId,false);
    if(!account)return{status:'BLOCKED',reason:'COMPANY_CAPITAL_ACCOUNT_UNAVAILABLE'};
    var canonicalProjects=[],byRequest={};
    for(var unit=1;unit<=proposal.quantity;unit++){
      var expectedRequest=proposal.proposalId+':UNIT:'+String(unit),matches=projectRows.filter(function(row){
        return row&&row.projectType==='FACTORY_CONSTRUCTION'&&String(row.requestId||'')===expectedRequest;
      });
      if(matches.length>1)return{status:'BLOCKED',reason:'PRIVATE_CONSTRUCTION_REQUEST_ID_COLLISION',
        requestId:expectedRequest,projectIds:matches.map(function(x){return x.projectId;})};
      if(!matches.length)continue;
      var existing=matches[0];
      if(existing.sourcePrivateProposalId!==proposal.proposalId||
         String(existing.ownerCompanyId||existing.ownerId||'').toUpperCase()!==proposal.companyId||
         String(existing.operatorCompanyId||existing.operatorId||'').toUpperCase()!==(proposal.operatorCompanyId||proposal.companyId)||
         String(existing.privatePermitId||existing.permitId||'')!==String(permit.permitId)||
         String(existing.sourcePrivateFundingId||'')!==String(proposal.funding&&proposal.funding.transactionId||'')||
         String(existing.factoryType||'').toUpperCase()!==proposal.factoryType||
         !['UNDER_CONSTRUCTION','COMPLETED'].includes(String(existing.status||'').toUpperCase()))
        return{status:'BLOCKED',reason:'EXISTING_PRIVATE_CONSTRUCTION_PROVENANCE_MISMATCH',requestId:expectedRequest,projectId:existing.projectId};
      canonicalProjects.push(existing);byRequest[expectedRequest]=existing;
    }
    // The canonical project registry, not a possibly half-saved proposal pointer list, decides which units exist.
    proposal.projectIds=Array.from(new Set(canonicalProjects.map(function(row){return String(row.projectId);}).filter(Boolean)));
    var remainingQuantity=Math.max(0,proposal.quantity-canonicalProjects.length);
    var unsettledExisting=canonicalProjects.filter(function(project){
      return !ledger.some(function(row){return row&&row.transactionId==='PE-CAPEX:'+project.projectId;});
    }).length;
    var reservedCapital=normalizeCapitalReservation(cid,proposal.companyId,account);
    var capitalRequired=(remainingQuantity+unsettledExisting)*unitCost;
    if(reservedCapital+1e-9<capitalRequired)
      return{status:'BLOCKED',reason:'COMPANY_CAPITAL_NOT_RESERVED_FOR_CONSTRUCTION',reserved:reservedCapital,required:capitalRequired,
        newFactoryUnits:remainingQuantity,existingProjectsMissingCapex:unsettledExisting};
    var quote=null;
    if(remainingQuantity>0){
      try{if(typeof n.factoryConstructionMaterialQuote==='function')quote=n.factoryConstructionMaterialQuote(cid,profile);}
      catch(e){return{status:'BLOCKED',reason:'CONSTRUCTION_BOM_QUOTE_FAILED',detail:String(e&&e.message||e)};}
      if(!quote||quote.status!=='QUOTED')return{status:'BLOCKED',reason:quote&&quote.reason||'CONSTRUCTION_MATERIAL_PREFLIGHT_FAILED',quote:quote};
      // Existing projects have already issued construction materials. Only quote inputs for missing units.
      for(var m=0;m<quote.materials.length;m++){
        var row=quote.materials[m],requiredUnit=num(row.required),available=num(row.available);
        if(requiredUnit===null||requiredUnit<0||available===null||available+1e-9<requiredUnit*remainingQuantity)
          return{status:'BLOCKED',reason:'AGGREGATE_CONSTRUCTION_MATERIAL_SHORTAGE',resourceId:row.resourceId,
            required:requiredUnit===null?null:requiredUnit*remainingQuantity,available:available===null?0:available};
      }
    }
    var started=[],failures=[];
    function settleUnitCapex(project,unitNumber){
      if(!project||!project.projectId||String(project.requestId||'')!==proposal.proposalId+':UNIT:'+String(unitNumber)||
         project.sourcePrivateProposalId!==proposal.proposalId||
         String(project.ownerCompanyId||project.ownerId||'').toUpperCase()!==proposal.companyId||
         String(project.operatorCompanyId||project.operatorId||'').toUpperCase()!==(proposal.operatorCompanyId||proposal.companyId)||
         String(project.factoryType||'').toUpperCase()!==proposal.factoryType||
         String(project.privatePermitId||project.permitId||'')!==String(permit.permitId)||
         String(project.sourcePrivateFundingId||'')!==String(proposal.funding&&proposal.funding.transactionId||'')||
         Math.abs((num(project.cost)||0)-unitCost)>1e-6||project.requirePrivateCommissioningGate!==true)
        return{accepted:false,reason:'PRIVATE_CONSTRUCTION_PROJECT_PROVENANCE_MISMATCH'};
      var transactionId='PE-CAPEX:'+project.projectId,prior=ledger.find(function(row){return row&&row.transactionId===transactionId;});
      if(prior){
        if(prior.type!=='PRIVATE_ENTERPRISE_FACTORY_CAPEX'||prior.proposalId!==proposal.proposalId||
           prior.projectId!==project.projectId||prior.companyId!==proposal.companyId||
           Math.abs((num(prior.amount)||0)-unitCost)>1e-6||String(prior.status||'').toUpperCase()!=='POSTED')
          return{accepted:false,reason:'PRIVATE_CONSTRUCTION_CAPEX_LEDGER_COLLISION',transactionId:transactionId};
        return{accepted:true,duplicate:true,transactionId:transactionId};
      }
      var reserveNow=normalizeCapitalReservation(cid,proposal.companyId,account);
      if(reserveNow+1e-9<unitCost)return{accepted:false,reason:'PRIVATE_CONSTRUCTION_UNIT_CAPITAL_NOT_RESERVED',reserved:reserveNow,required:unitCost};
      account.reservedBalance=Math.max(0,reserveNow-unitCost);account.capitalSpent+=unitCost;account.revision++;
      ledger.push({transactionId:transactionId,type:'PRIVATE_ENTERPRISE_FACTORY_CAPEX',proposalId:proposal.proposalId,
        projectId:project.projectId,companyId:proposal.companyId,amount:unitCost,currency:proposal.capitalUnit,direction:'TRANSFER',
        debitAccount:'COMPANY_CAPITAL_RESERVED:'+proposal.companyId,creditAccount:'FACTORY_CONSTRUCTION:'+project.projectId,
        balanceAfter:account.availableBalance,reservedBalanceAfter:account.reservedBalance,status:'POSTED',turn:turn(),
        authority:'OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL'});
      return{accepted:true,transactionId:transactionId};
    }
    for(var i=1;i<=proposal.quantity;i++){
      var requestId=proposal.proposalId+':UNIT:'+String(i),existingProject=byRequest[requestId]||null,result=null;
      if(existingProject){
        var reconciled=settleUnitCapex(existingProject,i);
        if(!reconciled.accepted){failures.push({unit:i,result:reconciled});break;}
        started.push(Object.assign({idempotent:true,capexReconciled:!reconciled.duplicate},existingProject));
        if(proposal.projectIds.indexOf(existingProject.projectId)<0)proposal.projectIds.push(existingProject.projectId);
        if(String(existingProject.status||'').toUpperCase()==='COMPLETED')applyCommissionedAsset(cid,existingProject);
        continue;
      }
      result=n.startFactoryProject({countryId:cid,factoryType:proposal.factoryType,recipeId:proposal.recipeId,
        requestId:requestId,cost:unitCost,capacityPerDay:num(profile.defaultCapacityPerDay)||1,
        contractorType:'DOMESTIC_EPC',companyId:proposal.companyId,ownerCompanyId:proposal.companyId,ownerId:proposal.companyId,
        operatorCompanyId:proposal.operatorCompanyId||proposal.companyId,operatorId:proposal.operatorCompanyId||proposal.companyId,
        ownerType:'PRIVATE_ENTERPRISE',operatorType:'PRIVATE_COMPANY_OPERATOR',
        stateControlRights:clone(proposal.ownership&&proposal.ownership.stateControlRights||proposal.stateControlRights),
        permitId:permit.permitId,permitAuthority:permit.authority,permitExpiryTurn:permit.expiresAtTurn,
        sourcePrivateProposalId:proposal.proposalId,sourcePrivateDecisionId:proposal.decision&&proposal.decision.decisionId,
        sourcePrivateFundingId:proposal.funding&&proposal.funding.transactionId,privateCompanyId:proposal.companyId,
        constructionFinanceAuthority:'OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL',requirePrivateCommissioningGate:true});
      if(!result||String(result.status||'').toUpperCase()!=='UNDER_CONSTRUCTION'){
        failures.push({unit:i,result:clone(result||{status:'BLOCKED',reason:'CONSTRUCTION_NOT_STARTED'})});break;
      }
      var settled=settleUnitCapex(result,i);
      if(!settled.accepted){failures.push({unit:i,result:settled});break;}
      started.push(result);
      if(proposal.projectIds.indexOf(result.projectId)<0)proposal.projectIds.push(result.projectId);
      byRequest[requestId]=result;
    }
    var allCompleted=proposal.projectIds.length===proposal.quantity&&proposal.projectIds.every(function(projectId){
      var row=projectRows.find(function(project){return project&&project.projectId===projectId;})||
        Object.keys(byRequest).map(function(key){return byRequest[key];}).find(function(project){return project&&project.projectId===projectId;});
      return row&&String(row.status||'').toUpperCase()==='COMPLETED';
    });
    if(failures.length)proposal.status=proposal.projectIds.length?'PARTIALLY_UNDER_CONSTRUCTION':'FUNDED';
    else if(allCompleted&&proposal.commissionedFactoryIds&&proposal.commissionedFactoryIds.length>=proposal.quantity)
      proposal.status=proposal.productionEnabled?'COMMISSIONED':'COMMISSIONED_PRODUCTION_GATED';
    else proposal.status='UNDER_CONSTRUCTION';
    proposal.updatedTurn=turn();
    proposal.construction={startedCount:proposal.projectIds.length,requestedCount:proposal.quantity,remainingCount:Math.max(0,proposal.quantity-proposal.projectIds.length),
      unitCost:unitCost,projectIds:proposal.projectIds.slice(),failures:failures};
    recordEvent(cid,'COMPANY_CONSTRUCTION_STARTED',{proposalId:proposal.proposalId,companyId:proposal.companyId,startedCount:started.length,requestedCount:proposal.quantity,projectIds:proposal.projectIds.slice()});
    return{status:proposal.status,started:started.map(clone),failures:clone(failures),proposal:clone(proposal)};
  }
  function authorizeFactoryProjectConstruction(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),company=id(input.ownerCompanyId||input.ownerId),
      operator=id(input.operatorCompanyId||input.operatorId),factoryType=id(input.factoryType),
      proposal=getProposal(cid,input.sourcePrivateProposalId),permit=proposal&&proposal.permit,
      funding=proposal&&proposal.funding,decision=proposal&&proposal.decision;
    if(!cid||cid!==playerCountry())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    if(!proposal)return{status:'BLOCKED',reason:'PRIVATE_PROPOSAL_NOT_FOUND'};
    if(['FUNDED','PARTIALLY_UNDER_CONSTRUCTION'].indexOf(proposal.status)<0)
      return{status:'BLOCKED',reason:'PRIVATE_PROPOSAL_NOT_FUNDED'};
    if(!permit||permit.status!=='ACTIVE'||!decision||decision.decision!=='APPROVE'||
       permit.permitId!==input.permitId||permit.permitId!==decision.permitId||
       permit.authority!=='OMEGA_PRIVATE_ENTERPRISE_LICENSING_V1'||
       decision.decisionId!==input.sourcePrivateDecisionId)
      return{status:'BLOCKED',reason:'PRIVATE_GOVERNMENT_PERMIT_NOT_VERIFIED'};
    if(num(permit.expiresAtTurn)===null||turn()>num(permit.expiresAtTurn)||
       num(input.permitExpiryTurn)!==num(permit.expiresAtTurn))
      return{status:'BLOCKED',reason:'GOVERNMENT_PERMIT_EXPIRED_OR_MISMATCHED'};
    var rights=input.stateControlRights&&typeof input.stateControlRights==='object'?input.stateControlRights:{};
    var requiredStateRights=['strategicOversight','licensingAndPermits','fiscalRegulation','labourSafetyEnvironmentalRegulation',
      'strategicSupplyOversight','strategicContracts','domesticSupplyDirection','exportControl','publicProcurement',
      'competitionOversight','foreignOwnershipReview','emergencyIntervention'];
    var missingStateRights=requiredStateRights.filter(function(key){return rights[key]!==true;});
    if(permit.countryId!==cid||permit.companyId!==company||permit.operatorCompanyId!==operator||
       permit.factoryType!==factoryType||num(permit.quantity)!==num(proposal.quantity)||
       id(proposal.companyId)!==company||id(proposal.operatorCompanyId||proposal.companyId)!==operator||
       id(proposal.factoryType)!==factoryType||id(input.privateCompanyId)!==company||
       id(input.companyId)!==company||String(input.ownerType||'').toUpperCase()!=='PRIVATE_ENTERPRISE'||
       String(input.operatorType||'').toUpperCase()!=='PRIVATE_COMPANY_OPERATOR'||
       String(rights.operationalControl||'').toUpperCase()!=='STATE_POLICY_ONLY'||
       rights.authority!=='OMEGA_STATE_CONTROL_RIGHTS_V1'||missingStateRights.length)
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_PERMIT_SCOPE_MISMATCH',missingStateRights:missingStateRights};
    var requestId=String(input.requestId||''),prefix=proposal.proposalId+':UNIT:';
    var unitIndex=requestId.indexOf(prefix)===0?Number(requestId.slice(prefix.length)):NaN;
    if(!Number.isInteger(unitIndex)||unitIndex<1||unitIndex>proposal.quantity)
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_APPROVED_UNIT_ID_REQUIRED'};
    if(input.requirePrivateCommissioningGate!==true||
       input.constructionFinanceAuthority!=='OMEGA_FINANCE_PRIVATE_ENTERPRISE_CAPITAL'||
       String(input.permitAuthority||'')!==String(permit.authority||''))
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_COMMISSIONING_GATE_REQUIRED'};
    if(!funding||funding.status!=='FUNDED'||funding.transactionId!==input.sourcePrivateFundingId||
       id(funding.companyId)!==company||Math.abs((num(funding.amount)||0)-(num(proposal.capitalRequired)||0))>1e-6)
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_FUNDING_RECEIPT_NOT_VERIFIED'};
    var rows=financeLedger(cid,false)||[],fundingEntry=rows.find(function(row){
      return row&&row.transactionId===funding.transactionId&&row.proposalId===proposal.proposalId&&
        id(row.companyId)===company&&String(row.status||'').toUpperCase()==='POSTED';
    });
    if(!fundingEntry)return{status:'BLOCKED',reason:'PRIVATE_FACTORY_FINANCE_LEDGER_ENTRY_MISSING'};
    var account=capitalAccount(cid,company,false),reserved=account?normalizeCapitalReservation(cid,company,account):0;
    var unitCost=num(input.cost),profile=catalog()?.factoryProfiles?.[factoryType]||{},canonicalUnitCost=num(profile.constructionCost);
    if(unitCost===null||unitCost<=0||canonicalUnitCost===null||Math.abs(unitCost-canonicalUnitCost)>1e-6)
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_CANONICAL_CONSTRUCTION_COST_MISMATCH',provided:unitCost,expected:canonicalUnitCost};
    if(reserved+1e-9<unitCost)
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_CAPITAL_NOT_RESERVED',reserved:reserved,required:unitCost};
    return{status:'AUTHORIZED',countryId:cid,proposalId:proposal.proposalId,unitIndex:unitIndex,
      permitId:permit.permitId,fundingTransactionId:funding.transactionId,authority:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1'};
  }
  function productionProofReady(){
    var proof=g.OmegaPrivateEnterprisePipelineProof||g.__OMEGA_SAB34_PIPELINE_PROOF||null;
    return !!(proof&&proof.status==='VERIFIED'&&proof.siteSelection===true&&proof.extraction===true&&
      proof.logisticsReceipt===true&&proof.factoryInput===true&&proof.finishedGoods===true&&proof.saveLoad===true&&
      typeof proof.exactMainSha==='string'&&/^[a-f0-9]{40}$/i.test(proof.exactMainSha));
  }
  function privateCommissioningRecordVerified(country,proposal,project,asset){
    var cid=canonicalCountry(country),company=id(project&& (project.ownerCompanyId||project.ownerId||project.privateCompanyId||project.companyId)),
      operator=id(project&& (project.operatorCompanyId||project.operatorId||company)),permit=proposal&&proposal.permit,
      decision=proposal&&proposal.decision,funding=proposal&&proposal.funding;
    if(!cid||!proposal||!project||!asset||COMPANY_IDS.indexOf(company)<0||COMPANY_IDS.indexOf(operator)<0)return false;
    var rights=project.stateControlRights||{},assetRights=asset.stateControlRights||{};
    var required=['strategicOversight','licensingAndPermits','fiscalRegulation','labourSafetyEnvironmentalRegulation',
      'strategicSupplyOversight','strategicContracts','domesticSupplyDirection','exportControl','publicProcurement',
      'competitionOversight','foreignOwnershipReview','emergencyIntervention'];
    var fullRights=required.every(function(key){return rights[key]===true&&assetRights[key]===true;});
    var financeRows=financeLedger(cid,false)||[];
    var fundingEntry=financeRows.find(function(row){return row&&row.transactionId===funding?.transactionId&&
      row.proposalId===proposal.proposalId&&id(row.companyId)===company&&String(row.status||'').toUpperCase()==='POSTED';});
    var capexEntry=financeRows.find(function(row){return row&&row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'&&
      row.proposalId===proposal.proposalId&&row.projectId===project.projectId&&id(row.companyId)===company&&
      Math.abs((num(row.amount)||0)-(num(project.cost)||0))<1e-6&&String(row.status||'').toUpperCase()==='POSTED';});
    return !!(permit&&permit.status==='ACTIVE'&&permit.authority==='OMEGA_PRIVATE_ENTERPRISE_LICENSING_V1'&&
      permit.permitId===project.permitId&&permit.permitId===project.privatePermitId&&
      project.privatePermitAuthority===permit.authority&&project.privatePermitStatus==='ACTIVE'&&
      permit.countryId===cid&&permit.companyId===company&&permit.operatorCompanyId===operator&&
      id(proposal.companyId)===company&&id(proposal.operatorCompanyId||proposal.companyId)===operator&&
      proposal.factoryType===project.factoryType&&decision&&decision.decision==='APPROVE'&&
      decision.decisionId===project.sourcePrivateDecisionId&&decision.permitId===permit.permitId&&
      funding&&funding.status==='FUNDED'&&funding.transactionId===project.sourcePrivateFundingId&&
      id(funding.companyId)===company&&fundingEntry&&capexEntry&&
      project.sourcePrivateProposalId===proposal.proposalId&&project.status==='COMPLETED'&&
      project.requirePrivateCommissioningGate===true&&String(project.ownerType).toUpperCase()==='PRIVATE_ENTERPRISE'&&
      String(project.operatorType).toUpperCase()==='PRIVATE_COMPANY_OPERATOR'&&
      rights.authority==='OMEGA_STATE_CONTROL_RIGHTS_V1'&&assetRights.authority==='OMEGA_STATE_CONTROL_RIGHTS_V1'&&
      String(rights.operationalControl).toUpperCase()==='STATE_POLICY_ONLY'&&
      String(assetRights.operationalControl).toUpperCase()==='STATE_POLICY_ONLY'&&fullRights&&
      String(asset.ownerType||'').toUpperCase()==='PRIVATE_ENTERPRISE'&&
      id(asset.ownerCompanyId||asset.ownerId)===company&&
      String(asset.operatorType||'').toUpperCase()==='PRIVATE_COMPANY_OPERATOR'&&
      id(asset.operatorCompanyId||asset.operatorId||asset.companyId)===operator&&
      asset.privatePermitId===permit.permitId&&asset.privatePermitStatus==='ACTIVE'&&
      asset.privatePermitAuthority===permit.authority&&
      asset.sourcePrivateProposalId===proposal.proposalId&&asset.sourcePrivateDecisionId===decision.decisionId&&
      asset.sourcePrivateFundingId===funding.transactionId&&asset.constructionProjectId===project.projectId);
  }
  function applyCommissionedAsset(country,project){
    if(!project||!project.sourcePrivateProposalId)return null;
    var cid=canonicalCountry(country),econ=countryBucket('economy',cid,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
    var asset=assets.find(function(a){return String(a.id||a.factoryId||'')===String(project.factoryId||'');});
    if(!asset)return null;
    var company=id(project.ownerCompanyId||project.ownerId||project.privateCompanyId||project.companyId);
    var operatorCompany=id(project.operatorCompanyId||project.operatorId||company);
    if(COMPANY_IDS.indexOf(company)<0||COMPANY_IDS.indexOf(operatorCompany)<0)return null;
    var proposal=runtime(cid,false)?.proposals.find(function(p){return p.proposalId===project.sourcePrivateProposalId;});
    var permit=proposal&&proposal.permit;
    if(!permit||permit.permitId!==project.permitId||permit.status!=='ACTIVE'||permit.companyId!==company||
       permit.operatorCompanyId!==operatorCompany)return null;
    var decision=proposal.decision,funding=proposal.funding,rows=financeLedger(cid,false)||[];
    var fundingEntry=rows.find(function(row){return row&&row.transactionId===funding?.transactionId&&
      row.proposalId===proposal.proposalId&&id(row.companyId)===company&&String(row.status||'').toUpperCase()==='POSTED';});
    var capexEntry=rows.find(function(row){return row&&row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'&&
      row.projectId===project.projectId&&row.proposalId===proposal.proposalId&&id(row.companyId)===company&&
      Math.abs((num(row.amount)||0)-(num(project.cost)||0))<1e-6&&String(row.status||'').toUpperCase()==='POSTED';});
    if(!decision||decision.decision!=='APPROVE'||decision.decisionId!==project.sourcePrivateDecisionId||
       !funding||funding.status!=='FUNDED'||funding.transactionId!==project.sourcePrivateFundingId||
       !fundingEntry||!capexEntry||project.status!=='COMPLETED'||project.requirePrivateCommissioningGate!==true||
       project.privatePermitId!==permit.permitId||project.privatePermitStatus!=='ACTIVE'||
       project.privatePermitAuthority!==permit.authority||
       String(project.stateControlRights?.operationalControl||'').toUpperCase()!=='STATE_POLICY_ONLY'||
       project.stateControlRights?.authority!=='OMEGA_STATE_CONTROL_RIGHTS_V1')return null;
    var productionReady=productionProofReady();
    asset.ownerId=company;asset.ownerCompanyId=company;asset.ownerType='PRIVATE_ENTERPRISE';
    asset.operatorId=operatorCompany;asset.operatorCompanyId=operatorCompany;asset.operatorType='PRIVATE_COMPANY_OPERATOR';
    asset.companyId=operatorCompany;asset.stateControlRights=clone(project.stateControlRights||{});
    asset.privatePermitId=permit.permitId;asset.privatePermitStatus=permit.status;asset.privatePermitAuthority=permit.authority;
    asset.ownershipStatus='PRIVATE_COMPANY_OWNED';asset.operatorStatus='PRIVATE_COMPANY_OPERATED';
    asset.sourcePrivateProposalId=project.sourcePrivateProposalId;asset.sourcePrivateDecisionId=project.sourcePrivateDecisionId||null;
    asset.sourcePrivateFundingId=project.sourcePrivateFundingId||null;asset.constructionProjectId=project.projectId;
    var runtimeStatus=String(asset.privateCommissionedStatus||asset.status||'OPERATIONAL').toUpperCase();
    if(!asset.privateCommissionedStatus)asset.privateCommissionedStatus=runtimeStatus;
    asset.productionEnabled=productionReady&&runtimeStatus==='OPERATIONAL';
    if(!productionReady){
      asset.status='BLOCKED';asset.productionStatus='STRATEGIC_SUPPLY_PIPELINE_PROOF_REQUIRED';
      asset.productionHealth={status:'STOPPED',productivityPct:0,reason:'SAB34_PIPELINE_PROOF_REQUIRED',updatedTurn:turn(),authority:'OMEGA_PRIVATE_ENTERPRISE_PIPELINE_GATE'};
      asset.blockedReason='SAB34_PIPELINE_PROOF_REQUIRED';
    }else if(runtimeStatus!=='OPERATIONAL'){
      asset.productionStatus='FACTORY_RUNTIME_REQUIREMENTS_PENDING';
      asset.blockedReason='FACTORY_RUNTIME_REQUIREMENTS_PENDING';
    }else{
      asset.status=runtimeStatus;asset.productionStatus='READY_FOR_EXISTING_FACTORY_OPERATION_GATES';
      asset.blockedReason=null;
    }
    var resource=countryBucket('resource',cid,false)||{},projects=resource.industrialNetwork&&resource.industrialNetwork.projects||[];
    var proposal=runtime(cid,false)?.proposals.find(function(p){return p.proposalId===project.sourcePrivateProposalId;});
    if(proposal){
      if(!Array.isArray(proposal.commissionedFactoryIds))proposal.commissionedFactoryIds=[];
      if(proposal.commissionedFactoryIds.indexOf(asset.id)<0)proposal.commissionedFactoryIds.push(asset.id);
      var all=proposal.projectIds.every(function(projectId){var row=projects.find(function(x){return x.projectId===projectId;});return row&&row.status==='COMPLETED';});
      if(all&&proposal.commissionedFactoryIds.length>=proposal.projectIds.length){
        proposal.status=productionReady&&asset.productionEnabled?'COMMISSIONED':'COMMISSIONED_PRODUCTION_GATED';
        proposal.updatedTurn=turn();proposal.productionEnabled=productionReady&&asset.productionEnabled;
        proposal.commissioning={status:proposal.status,productionEnabled:proposal.productionEnabled,
          gateReason:productionReady?(asset.blockedReason||null):'SAB34_PIPELINE_PROOF_REQUIRED',
          commissionedFactoryIds:proposal.commissionedFactoryIds.slice(),turn:turn()};
      }else proposal.status='UNDER_CONSTRUCTION';
    }
    recordEvent(cid,'PRIVATE_FACTORY_COMMISSIONED',{projectId:project.projectId,proposalId:project.sourcePrivateProposalId,factoryId:asset.id,companyId:company,
      productionEnabled:asset.productionEnabled,blockedReason:asset.blockedReason||null});
    return asset;
  }
  function refreshCommissionedProductionGate(country,factoryId){
    var cid=canonicalCountry(country||playerCountry());
    if(cid!==playerCountry()||!productionProofReady())return{status:'BLOCKED',reason:'SAB34_PIPELINE_PROOF_REQUIRED'};
    var econ=countryBucket('economy',cid,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],
      target=assets.find(function(a){return String(a.id||a.factoryId||'')===String(factoryId||'');});
    var owner=target&&id(target.ownerCompanyId||target.ownerId),operator=target&&id(target.operatorCompanyId||target.operatorId||target.companyId);
    if(!target||COMPANY_IDS.indexOf(owner)<0||COMPANY_IDS.indexOf(operator)<0||
       String(target.ownerType||'').toUpperCase()!=='PRIVATE_ENTERPRISE')return{status:'BLOCKED',reason:'PRIVATE_FACTORY_NOT_FOUND'};
    var proposal=runtime(cid,false)?.proposals.find(function(p){return p.proposalId===target.sourcePrivateProposalId;});
    if(!proposal)return{status:'BLOCKED',reason:'PRIVATE_PROPOSAL_NOT_FOUND'};
    var targetProject=(countryBucket('resource',cid,false)||{}).industrialNetwork?.projects||[];
    var targetProjectRow=targetProject.find(function(row){return row&&row.projectId===target.constructionProjectId;});
    if(!privateCommissioningRecordVerified(cid,proposal,targetProjectRow,target))
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_PERMIT_FINANCE_OR_CONSTRUCTION_PROVENANCE_NOT_VERIFIED'};
    var restored=[];
    (proposal.commissionedFactoryIds||[]).forEach(function(assetId){
      var asset=assets.find(function(row){return String(row.id||row.factoryId||'')===String(assetId);});
      if(!asset)return;
      var projects=(countryBucket('resource',cid,false)||{}).industrialNetwork?.projects||[];
      var project=projects.find(function(row){return row&&row.projectId===asset.constructionProjectId;});
      if(!privateCommissioningRecordVerified(cid,proposal,project,asset))return;
      if(asset.blockedReason==='SAB34_PIPELINE_PROOF_REQUIRED'){
        var original=String(asset.privateCommissionedStatus||'OPERATIONAL').toUpperCase();
        asset.status=original;asset.productionEnabled=original==='OPERATIONAL';
        asset.productionStatus=asset.productionEnabled?'READY_FOR_EXISTING_FACTORY_OPERATION_GATES':'FACTORY_RUNTIME_REQUIREMENTS_PENDING';
        asset.blockedReason=asset.productionEnabled?null:'FACTORY_RUNTIME_REQUIREMENTS_PENDING';
        if(asset.productionEnabled)asset.productionHealth={status:'STOPPED',productivityPct:0,reason:'NO_FACTORY_INPUTS',updatedTurn:turn(),authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'};
        restored.push(String(asset.id||asset.factoryId));
      }
    });
    var allReady=(proposal.commissionedFactoryIds||[]).length===proposal.quantity&&
      proposal.commissionedFactoryIds.every(function(assetId){var asset=assets.find(function(row){return String(row.id||row.factoryId||'')===String(assetId);});return asset&&asset.status==='OPERATIONAL'&&asset.productionEnabled===true;});
    if(allReady){
      proposal.status='COMMISSIONED';proposal.productionEnabled=true;proposal.updatedTurn=turn();
      proposal.commissioning={status:'COMMISSIONED',productionEnabled:true,gateReason:null,commissionedFactoryIds:proposal.commissionedFactoryIds.slice(),turn:turn()};
      recordEvent(cid,'PRIVATE_PRODUCTION_GATE_VERIFIED',{proposalId:proposal.proposalId,companyId:proposal.companyId,factoryIds:restored});
    }
    return{status:allReady?'READY':'PARTIALLY_READY',restoredFactoryIds:restored,proposalStatus:proposal.status};
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
    var a=capitalAccount(country,id(company),false);return a?clone(a):{companyId:id(company),currency:'GAME_CURRENCY_UNITS',
      availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
  }

  function companyFlowAccount(country,company){
    var econ=countryBucket('economy',country,false)||{},accounts=obj(econ.companyAccounts)?econ.companyAccounts:{};
    return obj(accounts[company])?accounts[company]:null;
  }
  function getCompanyFinanceSummary(country,company){
    var cid=canonicalCountry(country||playerCountry()),co=id(company);
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0)
      return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    var account=companyFlowAccount(cid,co),capital=capitalAccount(cid,co,false),
      rows=financeLedger(cid,false)||[],runtimeRows=account&&Array.isArray(account.cashFlowEntries)?account.cashFlowEntries:[],
      capexRows=rows.filter(function(row){return row&&id(row.companyId)===co&&row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'&&String(row.status||'').toUpperCase()==='POSTED';}),
      capex=capexRows.reduce(function(sum,row){return sum+(num(row.amount)||0);},0);
    var revenue=0,cost=0,tax=0,worker=0,transport=0,inputMaterials=0,other=0;
    runtimeRows.forEach(function(row){
      if(!row||String(row.status||'').toUpperCase()!=='POSTED')return;
      var amount=num(row.amount);if(amount===null||amount<0)return;
      var direction=String(row.direction||'').toUpperCase(),category=String(row.category||'OTHER').toUpperCase();
      if(direction==='CREDIT')revenue+=amount;
      else if(direction==='DEBIT'){
        if(category==='TAX'||category==='CORPORATE_PROFIT_TAX')tax+=amount;
        else{
          cost+=amount;
          if(category==='WORKER_INCOME')worker+=amount;
          else if(category==='TRANSPORT')transport+=amount;
          else if(category==='FACTORY_INPUT_PURCHASE')inputMaterials+=amount;
          else other+=amount;
        }
      }
    });
    var lastPeriod=null,r=runtime(cid,false);
    if(r)for(var i=r.financialPeriods.length-1;i>=0;i--){
      if(r.financialPeriods[i]&&r.financialPeriods[i].companyId===co){lastPeriod=clone(r.financialPeriods[i]);break;}
    }
    var cashFlowKnown=!!(account&&account.cashFlowJournalVersion===1&&Array.isArray(account.cashFlowEntries));
    return{
      status:account?'RECORDED':'NO_COMPANY_CASHFLOW_RECORD',
      countryId:cid,companyId:co,companyName:COMPANY_NAMES[co],
      currency:capital&&capital.currency||'GAME_CURRENCY_UNITS',
      grossRevenue:account&&num(account.grossRevenue)!==null?num(account.grossRevenue):null,
      paymentsReceived:account&&num(account.paymentsReceived)!==null?num(account.paymentsReceived):null,
      paymentsMade:account&&num(account.paymentsMade)!==null?num(account.paymentsMade):null,
      runtimeNetCashFlow:account&&num(account.runtimeNetCashFlow)!==null?num(account.runtimeNetCashFlow):null,
      journal:{status:cashFlowKnown?'VERIFIED_RUNTIME_JOURNAL':'LEGACY_OR_NOT_RECORDED',
        version:cashFlowKnown?1:null,startedAtTurn:account&&num(account.cashFlowJournalStartedAtTurn),
        entryCount:runtimeRows.length,recordedRevenue:cashFlowKnown?revenue:null,
        recordedOperatingCosts:cashFlowKnown?cost:null,recordedTaxPayments:cashFlowKnown?tax:null,
        workerCosts:cashFlowKnown?worker:null,transportCosts:cashFlowKnown?transport:null,
        inputMaterialCosts:cashFlowKnown?inputMaterials:null,otherRecordedCosts:cashFlowKnown?other:null,
        currentCashBasisResult:cashFlowKnown?revenue-cost:null},
      constructionCapex:{amount:capex,transactionCount:capexRows.length,authority:'EXISTING_FINANCE_LEDGER'},
      capital:{availableBalance:capital?num(capital.availableBalance):null,
        reservedBalance:capital?num(capital.reservedBalance):null,
        capitalRaised:capital?num(capital.capitalRaised):null,
        capitalSpent:capital?num(capital.capitalSpent):null,
        retainedEarningsBalance:capital&&num(capital.retainedEarningsBalance)!==null?num(capital.retainedEarningsBalance):0},
      lastClosedPeriod:lastPeriod,
      accountingProfit:null,
      accountingProfitStatus:'NOT_ACCRUAL_ACCOUNTING_CASH_BASIS_ONLY',
      note:'Only posted company cash-flow events are counted. Construction CAPEX is reported separately. Unsold inventory, depreciation and unrecorded input cost are not invented.'
    };
  }
  function companyTaxRate(country){
    var econ=countryBucket('economy',country,false)||{},finance=financeBucket(country,false)||{},
      omega=finance.omegaFinance||{},policy=econ.privateEnterpriseFiscalPolicy||econ.fiscalPolicy||omega.privateEnterpriseFiscalPolicy||{};
    var rate=num(policy.corporateProfitTaxRate);
    if(rate===null)rate=num(policy.corporateTaxRate);
    var source=rate===null?'RESOURCE_ECONOMY_DEFAULT': 'COUNTRY_PRIVATE_ENTERPRISE_FISCAL_POLICY';
    if(rate===null){
      var rules=g.__OmegaResourceEconomyRules||g.OmegaResourceEconomyRules||{};
      rate=num(rules.fiscal&&rules.fiscal.corporateTaxRate);
    }
    if(rate===null){rate=0.20;source='OMEGA_SIMULATION_DEFAULT_20_PERCENT';}
    return{rate:rate,source:source};
  }
  function closeCompanyFinancialPeriod(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),co=id(input.companyId);
    if(!cid||cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0)
      return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    var company=companyFlowAccount(cid,co);
    if(!company||company.cashFlowJournalVersion!==1||!Array.isArray(company.cashFlowEntries))
      return{status:'BLOCKED',reason:'COMPANY_CASH_FLOW_JOURNAL_NOT_READY'};
    var capital=capitalAccount(cid,co,true),endTurn=turn(),previousClose=num(capital.lastFinancialCloseTurn),
      startTurn=previousClose===null?num(company.cashFlowJournalStartedAtTurn):previousClose+1;
    if(startTurn===null)return{status:'BLOCKED',reason:'COMPANY_JOURNAL_START_TURN_UNKNOWN'};
    var periodId='PE-FINANCIAL-PERIOD:'+cid+':'+co+':T'+endTurn;
    var financeRows=financeLedger(cid,true);
    var prior=financeRows.find(function(row){return row&&row.transactionId===periodId;});
    if(prior)return{status:'DUPLICATE',reason:'FINANCIAL_PERIOD_ALREADY_CLOSED',transactionId:periodId,period:prior.period||null};
    if(previousClose!==null&&endTurn<=previousClose)
      return{status:'DUPLICATE',reason:'FINANCIAL_PERIOD_ALREADY_CLOSED',periodEndTurn:previousClose};
    var allEntries=company.cashFlowEntries.filter(function(row){
      var t=num(row&&row.turn);return row&&String(row.status||'').toUpperCase()==='POSTED'&&t!==null&&t>=startTurn&&t<=endTurn;
    });
    if(!allEntries.length)return{status:'WAITING',reason:'NO_POSTED_CASHFLOW_IN_OPEN_PERIOD',periodStartTurn:startTurn,periodEndTurn:endTurn};
    var revenue=0,cost=0,existingTax=0,seen=Object.create(null);
    allEntries.forEach(function(row){
      var key=String(row.entryId||'');if(!key||seen[key])return;seen[key]=true;
      var amount=num(row.amount);if(amount===null||amount<0)return;
      var direction=String(row.direction||'').toUpperCase(),category=String(row.category||'OTHER').toUpperCase();
      if(direction==='CREDIT')revenue+=amount;
      else if(direction==='DEBIT'){
        if(category==='TAX'||category==='CORPORATE_PROFIT_TAX')existingTax+=amount;
        else cost+=amount;
      }
    });
    var profitBeforeTax=revenue-cost,carried=num(capital.retainedEarningsBalance)||0;
    var taxableProfit=Math.max(0,profitBeforeTax+Math.min(0,carried));
    var policy=companyTaxRate(cid),rate=policy.rate;
    if(rate===null||rate<0||rate>0.60)return{status:'BLOCKED',reason:'CORPORATE_PROFIT_TAX_RATE_INVALID',rate:rate};
    var taxDue=Number((taxableProfit*rate).toFixed(2));
    var periodNetCash=revenue-cost-existingTax;
    if(taxDue>periodNetCash+1e-9)
      return{status:'BLOCKED',reason:'INSUFFICIENT_REALIZED_COMPANY_CASH_FOR_TAX',available:periodNetCash,required:taxDue};
    var treasury=financeTreasury(cid);
    if(taxDue>0&&treasury.balance===null)
      return{status:'BLOCKED',reason:'SOVEREIGN_TREASURY_LEDGER_UNAVAILABLE',requiredTax:taxDue};
    if(taxDue>0&&!setTreasuryBalance(treasury,treasury.balance+taxDue))
      return{status:'BLOCKED',reason:'SOVEREIGN_TREASURY_CREDIT_FAILED',requiredTax:taxDue};
    if(taxDue>0){
      var treasuryFinance=financeBucket(cid,true);
      treasuryFinance.taxRevenue=(num(treasuryFinance.taxRevenue)||0)+taxDue;
      treasuryFinance.revenue=(num(treasuryFinance.revenue)||0)+taxDue;
    }
    var taxTransactionId='PE-CORPORATE-TAX:'+cid+':'+co+':T'+endTurn;
    if(taxDue>0){
      financeRows.push({transactionId:taxTransactionId,type:'PRIVATE_ENTERPRISE_CORPORATE_PROFIT_TAX',
        companyId:co,amount:taxDue,currency:capital.currency||'GAME_CURRENCY_UNITS',
        direction:'TRANSFER',debitAccount:'COMPANY_OPERATING_CASH:'+co,creditAccount:'SOVEREIGN_TREASURY',
        status:'POSTED',turn:endTurn,taxRate:rate,taxableProfit:taxableProfit,
        authority:'OMEGA_PRIVATE_ENTERPRISE_CASH_BASIS_TAX_V1'});
      company.runtimeNetCashFlow=(num(company.runtimeNetCashFlow)||0)-taxDue;
      company.paymentsMade=(num(company.paymentsMade)||0)+taxDue;
      company.taxPaid=(num(company.taxPaid)||0)+taxDue;
      company.cashFlowEntries.push({entryId:taxTransactionId,companyId:co,amount:taxDue,direction:'DEBIT',
        category:'CORPORATE_PROFIT_TAX',currency:capital.currency||'GAME_CURRENCY_UNITS',
        sourceId:periodId,turn:endTurn,status:'POSTED',authority:'OMEGA_PRIVATE_ENTERPRISE_CASH_BASIS_TAX_V1'});
    }
    var retainedAfter=carried+profitBeforeTax-taxDue;
    capital.retainedEarningsBalance=Number(retainedAfter.toFixed(2));
    capital.retainedEarningsCurrency=capital.currency||'GAME_CURRENCY_UNITS';
    capital.lastFinancialCloseTurn=endTurn;
    capital.lastFinancialPeriodId=periodId;
    capital.revision=(num(capital.revision)||0)+1;
    company.lastFinancialCloseTurn=endTurn;
    company.lastTurn=endTurn;
    var closed={
      transactionId:periodId,companyId:co,companyName:COMPANY_NAMES[co],
      periodStartTurn:startTurn,periodEndTurn:endTurn,postedEntryCount:allEntries.length,
      grossReceipts:Number(revenue.toFixed(2)),operatingCosts:Number(cost.toFixed(2)),
      otherTaxPaidBeforeClose:Number(existingTax.toFixed(2)),
      profitBeforeTax:Number(profitBeforeTax.toFixed(2)),taxableProfit:Number(taxableProfit.toFixed(2)),
      corporateTaxRate:rate,taxRateSource:policy.source,corporateTaxPaid:taxDue,
      retainedEarningsAfter:capital.retainedEarningsBalance,
      currency:capital.currency||'GAME_CURRENCY_UNITS',basis:'CASH_BASIS_SIMULATION',
      status:'CLOSED',turn:endTurn,authority:'OMEGA_PRIVATE_ENTERPRISE_FINANCIAL_CLOSE_V1'
    };
    var r=runtime(cid,true);r.financialPeriods.push(closed);
    if(r.financialPeriods.length>256)r.financialPeriods.splice(0,r.financialPeriods.length-256);
    financeRows.push({transactionId:periodId,type:'PRIVATE_ENTERPRISE_FINANCIAL_PERIOD_CLOSE',
      companyId:co,amount:0,currency:closed.currency,direction:'MEMO',status:'POSTED',
      period:clone(closed),turn:endTurn,authority:'OMEGA_PRIVATE_ENTERPRISE_FINANCIAL_CLOSE_V1'});
    if(financeRows.length>4096)financeRows.splice(0,financeRows.length-4096);
    company.cashFlowEntries=company.cashFlowEntries.slice(-2048);
    recordEvent(cid,'COMPANY_FINANCIAL_PERIOD_CLOSED',closed);
    return{status:'CLOSED',period:clone(closed),companyFinance:getCompanyFinanceSummary(cid,co)};
  }
  function jointVentureList(country){
    var r=runtime(country,false);return r&&Array.isArray(r.jointVentures)?r.jointVentures:[];
  }
  function getJointVenture(country,jointVentureId){
    var cid=canonicalCountry(country||playerCountry()),jvId=String(jointVentureId||'');
    var row=jointVentureList(cid).find(function(x){return x&&x.jointVentureId===jvId;});
    return row?clone(row):null;
  }
  function validateJointVentureShareholders(rows){
    if(!Array.isArray(rows)||rows.length<2||rows.length>COMPANY_IDS.length)
      return{ok:false,reason:'JV_REQUIRES_TWO_TO_FIVE_CANONICAL_COMPANIES'};
    var seen=Object.create(null),sum=0,out=[];
    for(var i=0;i<rows.length;i++){
      var company=id(rows[i]&&rows[i].companyId),share=num(rows[i]&&rows[i].shareBps);
      if(COMPANY_IDS.indexOf(company)<0||seen[company]||share===null||!Number.isInteger(share)||share<1||share>9999)
        return{ok:false,reason:'JV_SHAREHOLDER_OR_SHARE_INVALID',index:i};
      seen[company]=true;sum+=share;out.push({companyId:company,companyName:COMPANY_NAMES[company],shareBps:share});
    }
    if(sum!==10000)return{ok:false,reason:'JV_EQUITY_SHARES_MUST_SUM_TO_10000_BPS',sumBps:sum};
    return{ok:true,shareholders:out};
  }
  function validateJointVentureAssets(country,jv){
    var econ=countryBucket('economy',country,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
    var shareholders=(jv.shareholders||[]).map(function(x){return x.companyId;}),checked=[];
    for(var i=0;i<(jv.factoryIds||[]).length;i++){
      var factoryId=String(jv.factoryIds[i]||''),asset=assets.find(function(row){return row&&String(row.id||row.factoryId||'')===factoryId;});
      if(!asset)return{ok:false,reason:'JV_FACTORY_ASSET_NOT_FOUND',factoryId:factoryId};
      var owner=id(asset.ownerCompanyId||asset.ownerId),operator=id(asset.operatorCompanyId||asset.operatorId||asset.companyId);
      if(String(asset.ownerType||'').toUpperCase()!=='PRIVATE_ENTERPRISE'||
         COMPANY_IDS.indexOf(owner)<0||COMPANY_IDS.indexOf(operator)<0||
         shareholders.indexOf(owner)<0||shareholders.indexOf(operator)<0)
        return{ok:false,reason:'JV_FACTORY_OWNER_OPERATOR_MUST_BE_SHAREHOLDERS',factoryId:factoryId,ownerCompanyId:owner,operatorCompanyId:operator};
      if(asset.jointVentureId&&asset.jointVentureId!==jv.jointVentureId)
        return{ok:false,reason:'JV_FACTORY_ALREADY_ASSIGNED_TO_ANOTHER_VENTURE',factoryId:factoryId};
      checked.push(asset);
    }
    return{ok:true,assets:checked};
  }
  function createJointVenture(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry());
    if(!cid||cid!==playerCountry())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var validated=validateJointVentureShareholders(input.shareholders);
    if(!validated.ok)return{status:'BLOCKED',reason:validated.reason,details:validated};
    var manager=id(input.managingCompanyId||'');
    if(validated.shareholders.every(function(x){return x.companyId!==manager;}))
      return{status:'BLOCKED',reason:'JV_MANAGING_COMPANY_MUST_BE_A_SHAREHOLDER'};
    var requestId=String(input.requestId||'').trim(),r=runtime(cid,true);
    if(requestId){
      var previous=r.jointVentures.find(function(x){return x&&x.requestId===requestId;});
      if(previous)return{status:'DUPLICATE',idempotent:true,jointVenture:clone(previous)};
    }
    var factoryIds=Array.isArray(input.factoryIds)?input.factoryIds.map(function(x){return String(x||'').trim();}).filter(Boolean):[];
    if(factoryIds.some(function(x,index){return factoryIds.indexOf(x)!==index;}))
      return{status:'BLOCKED',reason:'JV_FACTORY_ID_DUPLICATE'};
    var jv={
      jointVentureId:'PE-JV:'+cid+':'+r.nextJointVentureSequence++,
      requestId:requestId||null,countryId:cid,name:String(input.name||'Strategic Industrial Joint Venture').trim().slice(0,100),
      shareholders:validated.shareholders,managingCompanyId:manager,factoryIds:factoryIds,
      status:'PROPOSED',createdTurn:turn(),updatedTurn:turn(),retainedEarningsBalance:0,
      resolutions:[],contributions:[],stateControlRights:{
        sovereignStrategicOversight:true,licensingAndPermits:true,fiscalRegulation:true,
        exportControl:true,competitionOversight:true,operationalControl:'STATE_POLICY_ONLY',
        authority:'OMEGA_STATE_CONTROL_RIGHTS_V1',simulationOnly:true
      },
      provenance:{source:'OMEGA_PRIVATE_ENTERPRISE_JV_V1',simulationOnly:true}
    };
    r.jointVentures.push(jv);if(r.jointVentures.length>128)r.jointVentures.shift();
    recordEvent(cid,'JOINT_VENTURE_PROPOSED',{jointVentureId:jv.jointVentureId,shareholders:jv.shareholders,factoryIds:factoryIds});
    return{status:'PROPOSED',jointVenture:clone(jv)};
  }
  function decideJointVenture(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),jv=getJointVenture(cid,input.jointVentureId);
    if(cid!==playerCountry()||!jv)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_JV_NOT_FOUND'};
    var stored=jointVentureList(cid).find(function(x){return x.jointVentureId===jv.jointVentureId;});
    if(stored.status!=='PROPOSED')return{status:'BLOCKED',reason:'JV_ALREADY_DECIDED',currentStatus:stored.status};
    var decision=String(input.decision||'').toUpperCase();
    if(['APPROVE','DENY','DEFER'].indexOf(decision)<0)return{status:'BLOCKED',reason:'JV_GOVERNMENT_DECISION_INVALID'};
    if(decision==='APPROVE'){
      var check=validateJointVentureAssets(cid,stored);
      if(!check.ok)return{status:'BLOCKED',reason:check.reason,details:check};
      check.assets.forEach(function(asset){asset.jointVentureId=stored.jointVentureId;
        asset.jointVentureShareholders=clone(stored.shareholders);
        asset.jointVentureManagingCompanyId=stored.managingCompanyId;});
    }
    stored.status=decision==='APPROVE'?'ACTIVE':decision==='DENY'?'DENIED':'DEFERRED';
    stored.governmentDecision={decision:decision,reviewer:'PLAYER_GOVERNMENT',turn:turn(),
      reason:String(input.reason||'').slice(0,1000),conditions:clone(input.conditions||{}),
      stateControlRights:clone(stored.stateControlRights)};
    stored.updatedTurn=turn();
    recordEvent(cid,'JOINT_VENTURE_GOVERNMENT_DECISION',{jointVentureId:stored.jointVentureId,decision:decision});
    return{status:stored.status,jointVenture:clone(stored)};
  }
  function createJointVentureResolution(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),r=runtime(cid,false),
      jv=r&&r.jointVentures.find(function(x){return x&&x.jointVentureId===String(input.jointVentureId||'');});
    if(cid!==playerCountry()||!jv||jv.status!=='ACTIVE')return{status:'BLOCKED',reason:'ACTIVE_PLAYER_COUNTRY_JV_REQUIRED'};
    var type=String(input.type||'').toUpperCase();
    if(['OPERATING_BUDGET','CAPEX','DIVIDEND','DISSOLUTION'].indexOf(type)<0)
      return{status:'BLOCKED',reason:'JV_RESOLUTION_TYPE_NOT_SUPPORTED'};
    var amount=type==='DIVIDEND'?num(input.amount):null;
    if(type==='DIVIDEND'&&(amount===null||amount<=0||amount>num(jv.retainedEarningsBalance)||amount>Math.max(0,num(jv.retainedEarningsBalance)||0)))
      return{status:'BLOCKED',reason:'JV_DIVIDEND_EXCEEDS_CONTRIBUTED_RETAINED_EARNINGS',
        available:Math.max(0,num(jv.retainedEarningsBalance)||0),requested:amount};
    var threshold=num(input.requiredApprovalBps);
    if(threshold===null)threshold=(type==='DIVIDEND'||type==='DISSOLUTION')?6667:5001;
    if(!Number.isInteger(threshold)||threshold<5001||threshold>10000)
      return{status:'BLOCKED',reason:'JV_VOTING_THRESHOLD_OUT_OF_RANGE'};
    var resolution={
      resolutionId:'PE-JV-RESOLUTION:'+jv.jointVentureId+':'+(jv.resolutions.length+1),
      type:type,amount:amount,currency:'GAME_CURRENCY_UNITS',
      description:String(input.description||type.replace(/_/g,' ')).slice(0,500),
      requiredApprovalBps:threshold,createdTurn:turn(),expiresAtTurn:num(input.expiresAtTurn)||turn()+30,
      status:'VOTING',votes:[]
    };
    jv.resolutions.push(resolution);jv.updatedTurn=turn();
    recordEvent(cid,'JOINT_VENTURE_RESOLUTION_SUBMITTED',{jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,type:type,amount:amount});
    return{status:'VOTING',resolution:clone(resolution)};
  }
  function voteJointVentureResolution(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),r=runtime(cid,false),
      jv=r&&r.jointVentures.find(function(x){return x&&x.jointVentureId===String(input.jointVentureId||'');});
    if(cid!==playerCountry()||!jv||jv.status!=='ACTIVE')return{status:'BLOCKED',reason:'ACTIVE_PLAYER_COUNTRY_JV_REQUIRED'};
    var resolution=jv.resolutions.find(function(x){return x&&x.resolutionId===String(input.resolutionId||'');});
    if(!resolution||resolution.status!=='VOTING')return{status:'BLOCKED',reason:'JV_RESOLUTION_NOT_OPEN'};
    if(turn()>num(resolution.expiresAtTurn))return{status:'BLOCKED',reason:'JV_RESOLUTION_VOTING_EXPIRED'};
    var company=id(input.companyId),member=jv.shareholders.find(function(x){return x.companyId===company;});
    if(!member)return{status:'BLOCKED',reason:'JV_VOTER_NOT_A_SHAREHOLDER'};
    var vote=String(input.vote||'').toUpperCase();
    if(['FOR','AGAINST','ABSTAIN'].indexOf(vote)<0)return{status:'BLOCKED',reason:'JV_VOTE_INVALID'};
    var old=resolution.votes.find(function(x){return x.companyId===company;});
    if(old)return{status:'DUPLICATE',reason:'JV_SHAREHOLDER_ALREADY_VOTED',vote:clone(old)};
    resolution.votes.push({companyId:company,shareBps:member.shareBps,vote:vote,turn:turn()});
    var yes=0,no=0,cast=resolution.votes.length;
    resolution.votes.forEach(function(x){if(x.vote==='FOR')yes+=x.shareBps;else if(x.vote==='AGAINST')no+=x.shareBps;});
    var threshold=resolution.requiredApprovalBps;
    if(yes>=threshold)resolution.status='APPROVED';
    else if(no>10000-threshold||cast===jv.shareholders.length)resolution.status='REJECTED';
    resolution.updatedTurn=turn();jv.updatedTurn=turn();
    recordEvent(cid,'JOINT_VENTURE_VOTE_CAST',{jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,
      companyId:company,vote:vote,shareBps:member.shareBps,result:resolution.status});
    return{status:resolution.status==='VOTING'?'VOTE_RECORDED':resolution.status,
      resolution:clone(resolution),tally:{forBps:yes,againstBps:no,castShareholderCount:cast,totalShareholderCount:jv.shareholders.length}};
  }
  function contributeJointVentureRetainedEarnings(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),r=runtime(cid,false),
      jv=r&&r.jointVentures.find(function(x){return x&&x.jointVentureId===String(input.jointVentureId||'');});
    if(cid!==playerCountry()||!jv||jv.status!=='ACTIVE')return{status:'BLOCKED',reason:'ACTIVE_PLAYER_COUNTRY_JV_REQUIRED'};
    var company=id(input.companyId),member=jv.shareholders.find(function(x){return x.companyId===company;}),
      amount=num(input.amount),requestId=String(input.requestId||'').trim();
    if(!member||amount===null||amount<=0||!requestId)return{status:'BLOCKED',reason:'JV_CONTRIBUTION_FIELDS_INVALID'};
    var tx='PE-JV-CONTRIBUTION:'+jv.jointVentureId+':'+requestId,ledger=financeLedger(cid,true);
    var prior=ledger.find(function(x){return x&&x.transactionId===tx;});
    if(prior)return{status:'DUPLICATE',transactionId:tx,jointVenture:clone(jv)};
    var capital=capitalAccount(cid,company,true),retained=num(capital.retainedEarningsBalance)||0;
    if(retained+1e-9<amount)return{status:'BLOCKED',reason:'INSUFFICIENT_POST_TAX_RETAINED_EARNINGS',available:retained,required:amount};
    capital.retainedEarningsBalance=Number((retained-amount).toFixed(2));
    capital.revision=(num(capital.revision)||0)+1;
    jv.retainedEarningsBalance=Number(((num(jv.retainedEarningsBalance)||0)+amount).toFixed(2));
    jv.contributions.push({transactionId:tx,companyId:company,amount:amount,currency:capital.currency||'GAME_CURRENCY_UNITS',turn:turn(),status:'POSTED'});
    ledger.push({transactionId:tx,type:'PRIVATE_ENTERPRISE_JV_RETAINED_EARNINGS_CONTRIBUTION',
      companyId:company,jointVentureId:jv.jointVentureId,amount:amount,currency:capital.currency||'GAME_CURRENCY_UNITS',
      direction:'TRANSFER',debitAccount:'COMPANY_RETAINED_EARNINGS:'+company,
      creditAccount:'JV_RETAINED_EARNINGS:'+jv.jointVentureId,status:'POSTED',turn:turn(),
      authority:'OMEGA_PRIVATE_ENTERPRISE_JV_V1'});
    jv.updatedTurn=turn();recordEvent(cid,'JOINT_VENTURE_EARNINGS_CONTRIBUTED',{jointVentureId:jv.jointVentureId,companyId:company,amount:amount,transactionId:tx});
    return{status:'POSTED',transactionId:tx,amount:amount,jointVenture:clone(jv)};
  }
  function distributeJointVentureDividend(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),r=runtime(cid,false),
      jv=r&&r.jointVentures.find(function(x){return x&&x.jointVentureId===String(input.jointVentureId||'');});
    if(cid!==playerCountry()||!jv||jv.status!=='ACTIVE')return{status:'BLOCKED',reason:'ACTIVE_PLAYER_COUNTRY_JV_REQUIRED'};
    var resolution=jv.resolutions.find(function(x){return x&&x.resolutionId===String(input.resolutionId||'');});
    if(!resolution||resolution.type!=='DIVIDEND'||resolution.status!=='APPROVED')
      return{status:'BLOCKED',reason:'APPROVED_JV_DIVIDEND_RESOLUTION_REQUIRED'};
    var amount=num(resolution.amount),tx='PE-JV-DIVIDEND:'+resolution.resolutionId,
      ledger=financeLedger(cid,true),prior=ledger.find(function(x){return x&&x.transactionId===tx;});
    if(prior)return{status:'DUPLICATE',transactionId:tx,distribution:clone(prior.distribution||[])};
    if(amount===null||amount<=0||(num(jv.retainedEarningsBalance)||0)+1e-9<amount)
      return{status:'BLOCKED',reason:'JV_RETAINED_EARNINGS_INSUFFICIENT',available:num(jv.retainedEarningsBalance)||0,required:amount};
    var remaining=Number(amount.toFixed(2)),distribution=[];
    for(var i=0;i<jv.shareholders.length;i++){
      var member=jv.shareholders[i],payout=i===jv.shareholders.length-1?remaining:Number((amount*member.shareBps/10000).toFixed(2));
      if(payout<0||payout>remaining+1e-9)return{status:'BLOCKED',reason:'JV_DIVIDEND_ALLOCATION_INVALID'};
      var capital=capitalAccount(cid,member.companyId,true);
      capital.availableBalance=(num(capital.availableBalance)||0)+payout;
      capital.dividendsReceived=(num(capital.dividendsReceived)||0)+payout;
      capital.revision=(num(capital.revision)||0)+1;
      remaining=Number((remaining-payout).toFixed(2));
      distribution.push({companyId:member.companyId,shareBps:member.shareBps,amount:payout,currency:capital.currency||'GAME_CURRENCY_UNITS'});
      ledger.push({transactionId:tx+':'+member.companyId,type:'PRIVATE_ENTERPRISE_JV_DIVIDEND',
        companyId:member.companyId,jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,
        amount:payout,currency:capital.currency||'GAME_CURRENCY_UNITS',direction:'CREDIT',
        debitAccount:'JV_RETAINED_EARNINGS:'+jv.jointVentureId,
        creditAccount:'COMPANY_CAPITAL:'+member.companyId,status:'POSTED',turn:turn(),
        authority:'OMEGA_PRIVATE_ENTERPRISE_JV_V1'});
    }
    jv.retainedEarningsBalance=Number(((num(jv.retainedEarningsBalance)||0)-amount).toFixed(2));
    resolution.status='PAID';resolution.paidTurn=turn();resolution.distribution=clone(distribution);
    jv.updatedTurn=turn();
    var aggregate={transactionId:tx,type:'PRIVATE_ENTERPRISE_JV_DIVIDEND_DISTRIBUTION',
      jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,amount:amount,
      currency:'GAME_CURRENCY_UNITS',direction:'TRANSFER',status:'POSTED',turn:turn(),
      distribution:clone(distribution),authority:'OMEGA_PRIVATE_ENTERPRISE_JV_V1'};
    ledger.push(aggregate);
    recordEvent(cid,'JOINT_VENTURE_DIVIDEND_DISTRIBUTED',{jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,amount:amount,distribution:distribution});
    return{status:'PAID',transactionId:tx,amount:amount,distribution:clone(distribution),jointVenture:clone(jv)};
  }
  function getJointVentureDashboard(country){
    var cid=canonicalCountry(country||playerCountry()),r=runtime(cid,false);
    return{countryId:cid,activeCountry:cid===playerCountry(),jointVentures:r?clone(r.jointVentures):[],
      stateAuthority:'OMEGA_STATE_CONTROL_RIGHTS_V1',financeAuthority:'Game.state.finance[country].omegaFinance.ledger'};
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
  var stylesInstalled=false;
  function ensureStyles(){
    if(stylesInstalled||!g.document||!g.document.createElement)return;
    var style=g.document.createElement('style');
    style.id='omega-private-enterprise-lifecycle-styles-v1';
    style.textContent='.omega-private-lifecycle{margin:12px 0;padding:12px;border:1px solid rgba(0,225,255,.28);border-radius:14px;background:linear-gradient(145deg,rgba(7,24,39,.97),rgba(3,12,25,.96));color:#e8f7ff;font:12px/1.45 system-ui,sans-serif}.omega-private-lifecycle .pe-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.omega-private-lifecycle .pe-head small{color:#67dfff;letter-spacing:.08em;font-size:9px}.omega-private-lifecycle h3{margin:3px 0;font-size:16px}.omega-private-lifecycle p{margin:4px 0;color:#9db9cc}.omega-private-lifecycle .pe-gate{font-size:9px;color:#ffd88a;border:1px solid rgba(255,216,138,.4);border-radius:20px;padding:5px 8px}.omega-private-lifecycle .pe-overview{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.omega-private-lifecycle .pe-overview span{padding:5px 8px;background:rgba(0,0,0,.25);border:1px solid rgba(125,190,220,.15);border-radius:7px;color:#9bb8ca}.omega-private-lifecycle .pe-overview b{color:#fff;margin-left:4px}.omega-private-lifecycle .pe-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px;background:rgba(0,0,0,.22);border:1px solid rgba(100,180,220,.16);border-radius:10px}.omega-private-lifecycle .pe-form label{display:flex;flex-direction:column;gap:4px;color:#a9c5d7;font-size:10px;min-width:0}.omega-private-lifecycle input,.omega-private-lifecycle select{width:100%;min-width:0;box-sizing:border-box;padding:8px;border-radius:6px;background:#0b1c2b;border:1px solid rgba(88,182,220,.3);color:#edfaff;font:12px system-ui,sans-serif}.omega-private-lifecycle .pe-checkbox{grid-column:1/-1;flex-direction:row;align-items:center}.omega-private-lifecycle .pe-checkbox input{width:16px;height:16px}.omega-private-lifecycle button{border:1px solid rgba(0,225,255,.35);border-radius:7px;background:linear-gradient(135deg,#0b5470,#12334e);color:#eaffff;padding:8px 10px;font-size:10px;font-weight:700;cursor:pointer}.omega-private-lifecycle .pe-capital-form{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(90px,.8fr) auto;gap:6px;align-items:end;margin:8px 0;padding:8px;border:1px solid rgba(115,195,220,.18);border-radius:8px;background:rgba(0,0,0,.2)}.omega-private-lifecycle .pe-capital-form label{display:flex;flex-direction:column;gap:3px;min-width:0;color:#a9c5d7;font-size:9px}.omega-private-lifecycle .pe-capital-form input{width:100%;min-width:0;box-sizing:border-box;padding:7px;border-radius:6px;background:#0b1c2b;border:1px solid rgba(88,182,220,.3);color:#edfaff;font:11px system-ui,sans-serif}@media(max-width:520px){.omega-private-lifecycle .pe-capital-form{grid-template-columns:1fr 1fr}.omega-private-lifecycle .pe-capital-form button{grid-column:1/-1}}.omega-private-lifecycle .pe-proposals{margin-top:12px}.omega-private-lifecycle h4{font-size:12px;margin:0 0 8px;color:#9deaff}.omega-private-lifecycle .pe-proposal{padding:9px;margin:7px 0;border:1px solid rgba(103,183,220,.18);border-radius:9px;background:rgba(0,0,0,.2)}.omega-private-lifecycle .pe-proposal header{display:flex;justify-content:space-between;gap:8px;color:#b8edff}.omega-private-lifecycle .pe-proposal header span{font-size:9px;color:#ffe0a0}.omega-private-lifecycle .pe-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:7px 0;color:#a8bdce;font-size:10px}.omega-private-lifecycle .pe-warning{display:block;color:#ffc56a;font-size:10px;margin:3px 0}.omega-private-lifecycle .pe-info{display:block;color:#91c8db;font-size:10px;margin:3px 0}.omega-private-lifecycle .pe-adjust{display:inline-flex;align-items:center;gap:5px;max-width:190px;color:#a9c5d7;font-size:10px}.omega-private-lifecycle .pe-adjust input{width:65px}.omega-private-lifecycle .pe-input-forecast{display:grid;gap:5px;padding:8px;margin:7px 0;border-radius:8px;background:rgba(5,25,40,.55);border:1px solid rgba(100,180,220,.13)}.omega-private-lifecycle .pe-input-forecast>strong{font-size:10px;color:#a6eaff}.omega-private-lifecycle .pe-input-row{display:grid;grid-template-columns:minmax(0,1.1fr) repeat(3,minmax(0,1fr));gap:5px;color:#91adbf;font-size:9px}.omega-private-lifecycle .pe-input-row span{min-width:0;overflow-wrap:anywhere}.omega-private-lifecycle .pe-input-row b{color:#e3f6ff;font-weight:600}@media(max-width:520px){.omega-private-lifecycle .pe-input-row{grid-template-columns:1fr 1fr}}.omega-private-lifecycle .pe-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.omega-private-lifecycle .pe-empty{padding:10px;color:#91a8bb;border:1px dashed rgba(120,180,210,.2);border-radius:8px}.omega-private-lifecycle .pe-message{padding:7px 9px;background:rgba(0,225,255,.08);border-left:2px solid #20cfff;color:#bceeff}.omega-private-lifecycle .pe-footnote,.omega-private-lifecycle>small{display:block;margin-top:9px;font-size:9px;color:#809aaa}.omega-private-lifecycle .pe-footnote{line-height:1.5}@media(max-width:520px){.omega-private-lifecycle{padding:9px}.omega-private-lifecycle .pe-form{grid-template-columns:1fr}.omega-private-lifecycle .pe-facts{grid-template-columns:1fr}.omega-private-lifecycle .pe-head{display:block}.omega-private-lifecycle .pe-gate{display:inline-block;margin-top:5px}}';
    (g.document.head||g.document.documentElement).appendChild(style);
    stylesInstalled=true;
  }
  function renderPanel(root,options){
    if(!root||!root.querySelector)return;
    ensureStyles();
    var tab=root.__omegaV2IndustryTab||options&&options.tab||'factories';
    if(tab!=='production-lines')return;
    var shell=root.querySelector('.omega-v2-factory-command')||root.querySelector('.omega-v2-industry-command')||root;
    if(!shell||!shell.insertAdjacentHTML)return;
    var country=canonicalCountry(options&&options.countryId||root.__omegaV2IndustryCountryId||playerCountry());
    if(country!==playerCountry())return;
    var registry=g.OmegaPrivateEnterpriseRegistryV1||(g.Omega&&g.Omega.PrivateEnterpriseRegistryV1);
    var baselineRow=baseline(country);
    if(!baselineRow||baselineRow.status!=='READY'){
      var pendingCountry=root.__omegaPrivateBaselinePendingCountry||'';
      var failedCountry=root.__omegaPrivateBaselineLoadFailedCountry||'';
      if(pendingCountry!==country&&failedCountry!==country){
        root.__omegaPrivateBaselinePendingCountry=country;
        var readiness;
        try{readiness=registry&&registry.ready;}catch(error){readiness=Promise.reject(error);}
        Promise.resolve(readiness).then(function(result){
          if(root.__omegaPrivateBaselinePendingCountry!==country)return;
          root.__omegaPrivateBaselinePendingCountry='';
          var loadedRow=null;
          try{loadedRow=baseline(country);}catch(_){}
          if(!result||result.status!=='READY'||!loadedRow||loadedRow.status!=='READY')root.__omegaPrivateBaselineLoadFailedCountry=country;
          else root.__omegaPrivateBaselineLoadFailedCountry='';
          if(root.__omegaV2IndustryTab==='production-lines'){
            var current=g.OmegaUIV2Industry;
            if(current&&typeof current.render==='function')current.render(root,Object.assign({},root.__omegaV2IndustryOptions||options||{},{countryId:country,tab:'production-lines'}));
          }
        }).catch(function(error){
          if(root.__omegaPrivateBaselinePendingCountry!==country)return;
          root.__omegaPrivateBaselinePendingCountry='';
          root.__omegaPrivateBaselineLoadFailedCountry=country;
          root.__omegaPrivateBaselineError=String(error&&error.message||error);
          if(root.__omegaV2IndustryTab==='production-lines'){
            var current=g.OmegaUIV2Industry;
            if(current&&typeof current.render==='function')current.render(root,Object.assign({},root.__omegaV2IndustryOptions||options||{},{countryId:country,tab:'production-lines'}));
          }
        });
      }
      var oldPanel=shell.querySelector('[data-omega-private-company-lifecycle]');
      if(oldPanel&&oldPanel.remove)oldPanel.remove();
      var loadStatus=registry&&registry.diagnostics?registry.diagnostics():null;
      var loadFailed=failedCountry===country||loadStatus&&loadStatus.status==='BLOCKED';
      var loadMessage=loadFailed
        ?'Private factory baseline unavailable: '+escapeHtml(root.__omegaPrivateBaselineError||loadStatus&&loadStatus.reason||'DATA_UNAVAILABLE')
        :'Loading private company opening baseline…';
      var retry=loadFailed?'<button type="button" data-pe-baseline-retry>Retry baseline load</button>':'';
      shell.insertAdjacentHTML('beforeend','<section class="omega-private-lifecycle" data-omega-private-company-lifecycle="v1"><h3>Company expansion proposals</h3><p>'+loadMessage+'</p>'+retry+'<p class="pe-footnote">The government and private baseline must load before the proposal approval preview can be calculated.</p></section>');
      return;
    }
    var dash=getCountryDashboard(country),types=listFactoryTypes();
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
      }else if(p.status==='FUNDED'||p.status==='PARTIALLY_UNDER_CONSTRUCTION')buttons='<button type="button" data-pe-action="construct" data-pe-proposal="'+p.proposalId+'">'+(p.status==='FUNDED'?'Start construction':'Resume remaining construction')+'</button>';
      var preview=previewFor(p);
      var shortages=(preview.shortages||[]).map(function(x){return'<span class="pe-warning">'+escapeHtml(x.resourceId)+': projected 30-day shortfall '+Number(x.shortfall).toLocaleString('en-US')+'</span>';}).join('');
      var unknown=(preview.unobservedInputs||[]).map(function(x){return'<span class="pe-info">'+(x.available===null?'Stock not observed: ':'Current demand forecast not observed: ')+escapeHtml(x.resourceId)+'; no quantity assumed</span>';}).join('');
      var readinessRows=preview.operationalReadiness&&preview.operationalReadiness.requirements||[];
      var readinessMarkup='<div class="pe-input-forecast"><strong>Construction and operating readiness · '+escapeHtml(preview.operationalReadiness&&preview.operationalReadiness.status||'UNOBSERVED')+'</strong>'+
        readinessRows.map(function(x){return'<div class="pe-input-row"><span><b>'+escapeHtml(x.type)+'</b></span><span>Required<br><b>'+Number(x.required).toLocaleString('en-US')+' '+escapeHtml(x.unit)+'</b></span><span>Available<br><b>'+(x.available===null?'Not observed':Number(x.available).toLocaleString('en-US'))+'</b></span><span>Status<br><b>'+escapeHtml(x.status)+'</b></span></div>';}).join('')+
        '<span class="pe-info">Infrastructure: '+escapeHtml((preview.operationalReadiness&&preview.operationalReadiness.infrastructure||[]).join(', ')||'Not recorded')+'</span>'+
        '<span class="pe-info">Storage: '+escapeHtml(preview.operationalReadiness&&preview.operationalReadiness.storage&&preview.operationalReadiness.storage.status||'NOT_RECORDED')+'</span></div>';
      var inputDetails='<div class="pe-input-forecast"><strong>30-day input and domestic-supply preview</strong>'+(preview.inputRequirements||[]).map(function(x){
        var availableLabel=x.nationalDemandPerDay===null?'Available after protection · demand unobserved':'Domestic surplus after existing demand';
        var availableValue=x.available===null?'Not observed':Number(x.available).toLocaleString('en-US',{maximumFractionDigits:2});
        var neededValue=Number(x.forecast30Day||0).toLocaleString('en-US',{maximumFractionDigits:2});
        var demandValue=x.nationalDemandPerDay===null?'Not observed':Number(x.nationalDemandPerDay).toLocaleString('en-US',{maximumFractionDigits:2})+'/day';
        var gapValue=x.shortfall===null?'Not calculated':Number(x.shortfall).toLocaleString('en-US',{maximumFractionDigits:2});
        return'<div class="pe-input-row"><span><b>'+escapeHtml(x.resourceId)+'</b><br>30-day need '+neededValue+'</span><span>'+availableLabel+'<br><b>'+availableValue+'</b></span><span>Current demand<br><b>'+demandValue+'</b></span><span>Shortfall<br><b>'+gapValue+'</b></span></div>';
      }).join('')+'</div>';
      var progress=(p.projectIds||[]).length+'/'+p.quantity+' projects';
      var facts='<div class="pe-facts"><span>Asset owner: '+escapeHtml(COMPANY_NAMES[p.companyId]||p.companyId)+'</span><span>Operator: '+escapeHtml(COMPANY_NAMES[p.operatorCompanyId||p.companyId]||(p.operatorCompanyId||p.companyId))+'</span><span>Factory: '+escapeHtml(p.factoryName)+'</span><span>Quantity: '+p.quantity+'</span><span>Capital: '+(p.capitalRequired===null?'Unquoted':Number(p.capitalRequired).toLocaleString('en-US')+' '+escapeHtml(p.capitalUnit))+'</span><span>Company capital: '+balance.toLocaleString('en-US')+'</span><span>Government factories: '+Number(preview.governmentFactoryCount||0).toLocaleString('en-US')+'</span><span>Private opening allocation: '+Number(preview.openingPrivateAllocation||0).toLocaleString('en-US')+'</span><span>Additional policy ceiling: '+Number(preview.maximumAdditionalUnits||0).toLocaleString('en-US')+'</span><span>Max safe domestic-input factories: '+(preview.maximumSafeDomesticFactoryQuantity===null?'Not observed':Number(preview.maximumSafeDomesticFactoryQuantity).toLocaleString('en-US'))+'</span><span>Daily capacity forecast: '+Number(preview.requestedDailyCapacity||0).toLocaleString('en-US')+'</span><span>Source: '+p.sourcingPolicy.replace(/_/g,' ')+'</span><span>Permit: '+(p.permit?escapeHtml(p.permit.permitId)+' · expires T'+Number(p.permit.expiresAtTurn).toLocaleString('en-US'):'Not issued')+'</span><span>Projects: '+progress+'</span></div>';
      if(p.status==='PROPOSED')buttons='<label class="pe-adjust">Decision quantity <input type="number" min="1" max="'+MAX_PROJECTS_PER_PROPOSAL+'" step="1" value="'+p.quantity+'" data-pe-adjust-quantity="'+p.proposalId+'"></label><button type="button" data-pe-action="adjust" data-pe-proposal="'+p.proposalId+'">Update quantity</button>'+buttons;
      var capitalReceiptForm=p.status==='APPROVED_AWAITING_FUNDING'&&balance+1e-9<(num(p.capitalRequired)||0)
        ?'<form class="pe-capital-form" data-pe-capital-form data-pe-company="'+escapeHtml(p.companyId)+'" data-pe-proposal="'+escapeHtml(p.proposalId)+'"><label>Finance receipt transaction ID<input name="sourceTransactionId" type="text" maxlength="160" autocomplete="off" required></label><label>Settled amount ('+escapeHtml(p.capitalUnit)+')<input name="amount" type="number" min="0.01" step="any" inputmode="decimal" required></label><button type="submit">Verify company capital</button></form>'
        :'';
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(p.companyName)+'</strong><span>'+p.status.replace(/_/g,' ')+'</span></header>'+facts+readinessMarkup+inputDetails+shortages+unknown+capitalReceiptForm+'<div class="pe-actions">'+buttons+'</div></article>';
    }).join('')||'<div class="pe-empty">No company expansion proposal has been submitted for this country.</div>';
    var financeCards=COMPANY_IDS.map(function(companyId){
      var statement=getCompanyFinanceSummary(country,companyId),period=statement.lastClosedPeriod||null,
        currency=statement.currency||'GAME_CURRENCY_UNITS';
      function amount(value){return value===null||value===undefined?'Not recorded':Number(value).toLocaleString('en-US',{maximumFractionDigits:2})+' '+currency;}
      var taxLabel=period?'Cash-basis tax '+amount(period.corporateTaxPaid)+' at '+(period.corporateTaxRate*100).toFixed(2)+'%':'Not assessed: close a journalled cash-flow period first';
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(statement.companyName||companyId)+'</strong><span>'+escapeHtml(statement.journal.status)+'</span></header>'+
        '<div class="pe-facts"><span>Recorded receipts <b>'+amount(statement.grossRevenue)+'</b></span><span>Recorded payments <b>'+amount(statement.paymentsMade)+'</b></span>'+
        '<span>Net cash flow <b>'+amount(statement.runtimeNetCashFlow)+'</b></span><span>Factory CAPEX <b>'+amount(statement.constructionCapex.amount)+'</b></span>'+
        '<span>Retained earnings <b>'+amount(statement.capital.retainedEarningsBalance)+'</b></span><span>Tax status <b>'+escapeHtml(taxLabel)+'</b></span></div>'+
        '<p class="pe-footnote">Profit is cash-basis simulation accounting. Unobserved inventory valuation, depreciation and missing production costs are not treated as zero.</p>'+
        '<div class="pe-actions"><button type="button" data-pe-action="close-finance" data-pe-company="'+companyId+'">Close cash-flow period / assess profit tax</button></div></article>';
    }).join('');
    var jvDashboard=getJointVentureDashboard(country);
    var jvCards=jvDashboard.jointVentures.slice(-12).reverse().map(function(jv){
      var shareholderText=jv.shareholders.map(function(member){return escapeHtml(member.companyName)+' '+(member.shareBps/100).toFixed(2)+'%';}).join(' · ');
      var actions=jv.status==='PROPOSED'
        ?'<button type="button" data-pe-action="jv-approve" data-pe-jv="'+escapeHtml(jv.jointVentureId)+'">Government approve charter</button><button type="button" data-pe-action="jv-deny" data-pe-jv="'+escapeHtml(jv.jointVentureId)+'">Reject charter</button>'
        :'';
      var resolutions=jv.resolutions.slice(-6).reverse().map(function(resolution){
        var votes=resolution.votes||[];
        var voteMarkup='';
        if(jv.status==='ACTIVE'&&resolution.status==='VOTING'){
          voteMarkup=jv.shareholders.map(function(member){
            var voted=votes.some(function(vote){return vote.companyId===member.companyId;});
            return voted?'<span>'+escapeHtml(member.companyName)+' · VOTED</span>':
              '<span>'+escapeHtml(member.companyName)+' · '+(member.shareBps/100).toFixed(2)+'% '+
              '<button type="button" data-pe-action="jv-vote-for" data-pe-jv="'+escapeHtml(jv.jointVentureId)+'" data-pe-resolution="'+escapeHtml(resolution.resolutionId)+'" data-pe-company="'+member.companyId+'">FOR</button>'+
              '<button type="button" data-pe-action="jv-vote-against" data-pe-jv="'+escapeHtml(jv.jointVentureId)+'" data-pe-resolution="'+escapeHtml(resolution.resolutionId)+'" data-pe-company="'+member.companyId+'">AGAINST</button></span>';
          }).join('');
        }
        var pay=resolution.type==='DIVIDEND'&&resolution.status==='APPROVED'
          ?'<button type="button" data-pe-action="jv-pay-dividend" data-pe-jv="'+escapeHtml(jv.jointVentureId)+'" data-pe-resolution="'+escapeHtml(resolution.resolutionId)+'">Pay approved dividend</button>':'';
        return'<article class="pe-proposal"><header><strong>'+escapeHtml(resolution.type)+' · '+escapeHtml(resolution.resolutionId)+'</strong><span>'+escapeHtml(resolution.status)+'</span></header>'+
          '<p>Amount '+(resolution.amount===null?'Not applicable':Number(resolution.amount).toLocaleString('en-US')+' '+escapeHtml(resolution.currency))+
          ' · Required yes votes '+(resolution.requiredApprovalBps/100).toFixed(2)+'%</p>'+
          (votes.length?'<small>'+votes.map(function(v){return escapeHtml(v.companyId)+' '+escapeHtml(v.vote)+' '+(v.shareBps/100).toFixed(2)+'%';}).join(' · ')+'</small>':'')+
          '<div class="pe-actions">'+voteMarkup+pay+'</div></article>';
      }).join('')||'<div class="pe-empty">No shareholder resolutions have been submitted.</div>';
      var activeControls=jv.status==='ACTIVE'
        ?'<form class="pe-form" data-pe-jv-resolution-form data-pe-jv="'+escapeHtml(jv.jointVentureId)+'"><label>Resolution<select name="type"><option value="OPERATING_BUDGET">Operating budget</option><option value="CAPEX">Capital expenditure</option><option value="DIVIDEND">Dividend</option><option value="DISSOLUTION">Dissolution</option></select></label><label>Amount for dividend<input name="amount" type="number" min="0.01" step="any" inputmode="decimal"></label><label>Description<input name="description" type="text" maxlength="500"></label><button type="submit">Submit shareholder resolution</button></form>'+
         '<form class="pe-form" data-pe-jv-contribution-form data-pe-jv="'+escapeHtml(jv.jointVentureId)+'"><label>Contributing shareholder<select name="companyId">'+companyOptions+'</select></label><label>Post-tax retained earnings<input name="amount" type="number" min="0.01" step="any" inputmode="decimal" required></label><label>Contribution reference<input name="requestId" type="text" maxlength="100" required></label><button type="submit">Contribute retained earnings</button></form>':'';
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(jv.name)+'</strong><span>'+escapeHtml(jv.status)+'</span></header>'+
        '<p>Manager: '+escapeHtml(jv.managingCompanyId)+' · Shares: '+shareholderText+'</p>'+
        '<p>Linked factories: '+(jv.factoryIds.length?jv.factoryIds.map(escapeHtml).join(', '):'Company-level agreement; no factory linked yet')+
        ' · JV retained earnings: '+Number(jv.retainedEarningsBalance||0).toLocaleString('en-US')+' GAME_CURRENCY_UNITS</p>'+
        '<div class="pe-actions">'+actions+'</div>'+activeControls+'<div class="pe-proposals"><h4>Voting / dividend resolutions</h4>'+resolutions+'</div></article>';
    }).join('')||'<div class="pe-empty">No joint ventures have been proposed for this country.</div>';
    var jvCompanyOptions=companyOptions;
    var message=root.__omegaPrivateEnterpriseMessage?'<p class="pe-message" role="status">'+escapeHtml(root.__omegaPrivateEnterpriseMessage)+'</p>':'';
    var grantHelp='<small>State grant support is a real Treasury outflow and requires an explicit request plus approval. No company cash is assumed from the static opening allocation.</small>';
    var markup='<section class="omega-private-lifecycle" data-omega-private-company-lifecycle="v1"><header class="pe-head"><div><small>PRODUCTION LINES / NATIONAL INDUSTRY POLICY</small><h3>Company expansion proposals</h3><p>Government decides; firms own and operate approved private assets.</p></div><span class="pe-gate">'+(dash.productionEnabled?'PRIVATE PRODUCTION ENABLED':'PRODUCTION GATED BY SAB-34')+'</span></header>'+
      '<div class="pe-overview"><span>Companies <b>5</b></span><span>Proposals <b>'+dash.proposals.length+'</b></span><span>Opening baseline <b>'+(baselineRow&&baselineRow.status==='READY'?baselineRow.totalPrivateFactoryUnits.toLocaleString('en-US'):'Unavailable')+'</b></span><span>Finance <b>'+Object.keys(capitalByCompany).length+' capital accounts</b></span></div>'+
      '<form class="pe-form" data-pe-proposal-form><label>Private asset owner<select name="companyId">'+companyOptions+'</select></label><label>Private operator<select name="operatorCompanyId">'+companyOptions+'</select></label><label>Factory type<select name="factoryType">'+typeOptions+'</select></label><label>Quantity<input name="quantity" type="number" min="1" max="'+MAX_PROJECTS_PER_PROPOSAL+'" step="1" value="1" required></label><label>Input sourcing<select name="sourcingPolicy"><option value="DOMESTIC_ONLY">Domestic inputs</option><option value="COMPANY_FUNDED_IMPORTS">Company-funded imports</option><option value="MIXED">Mixed sourcing</option></select></label><label class="pe-checkbox"><input name="stateSupportRequested" type="checkbox"> Request possible Treasury grant support</label><button type="submit">Submit company proposal</button></form>'+grantHelp+message+
      '<div class="pe-proposals"><h4>Government decision queue</h4>'+cards+'</div>'+
      '<details class="pe-proposals"><summary><strong>Corporate Finance / Profit / Tax / Cost</strong></summary><p class="pe-footnote">Committed company cash flows are journalled. A period close assesses tax only against recorded positive cash-basis operating profit. Factory CAPEX remains separate from operating cost; accrual inventory valuation is not fabricated.</p>'+financeCards+'</details>'+
      '<section class="pe-proposals"><h4>Joint ventures / shareholder voting / dividends</h4>'+
      '<form class="pe-form" data-pe-jv-form><label>JV name<input name="name" type="text" maxlength="100" value="Strategic Industrial Joint Venture" required></label>'+
      '<label>Managing company / shareholder A<select name="companyA">'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder B<select name="companyB">'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder A equity (%)<input name="shareA" type="number" min="1" max="99" step="1" value="50" required></label>'+
      '<label>Exact factory IDs (comma separated, optional)<input name="factoryIds" type="text" maxlength="1200"></label>'+
      '<label>Unique charter reference<input name="requestId" type="text" maxlength="100" required></label>'+
      '<button type="submit">Submit JV charter for government approval</button></form>'+jvCards+'</section>'+
      '<p class="pe-footnote">JV assets retain their canonical owner/operator and state-control fields. Shareholder voting changes only corporate decisions. Dividends require post-tax retained earnings contributed to the JV and an approved weighted vote. The state keeps strategic oversight and permits. Private factory operation remains blocked until SAB-34 proof is verified.</p>'+
      '<p class="pe-footnote">Approval creates no stock reservation or import. Domestic inputs are checked against observed uncommitted inventory; company-funded imports require the existing paid Trade dispatch and confirmed warehouse receipt. Opening allocations are not operating factories. Construction uses the existing industrial project registry and bill of materials. Completed private factories remain production-blocked until the SAB-34 live supply-chain and save/load proof is verified.</p></section>';
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
  function shellInput(root,selector){
    try{return root.querySelector(selector);}catch(_){return null;}
  }
  function bindUi(root){
    if(root.__omegaPrivateEnterpriseUiBound||typeof root.addEventListener!=='function')return;
    root.addEventListener('submit',function(event){
      var form=event.target;if(!form||!form.matches)return;
      if(form.matches('[data-pe-capital-form]')){
        if(event.preventDefault)event.preventDefault();
        var capitalData=new FormData(form),capitalResult=recordCompanyCapitalReceipt({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),
          companyId:form.getAttribute('data-pe-company'),
          sourceTransactionId:capitalData.get('sourceTransactionId'),
          amount:capitalData.get('amount'),
          currency:(getProposal(root.__omegaV2IndustryCountryId||playerCountry(),form.getAttribute('data-pe-proposal'))||{}).capitalUnit
        });
        root.__omegaPrivateEnterpriseMessage=capitalResult.status==='POSTED'
          ?'Verified company capital receipt posted. Balance: '+Number(capitalResult.balance).toLocaleString('en-US')+'.'
          :'Capital receipt rejected: '+String(capitalResult.reason||capitalResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());
        return;
      }
      if(form.matches('[data-pe-jv-form]')){
        if(event.preventDefault)event.preventDefault();
        var jvData=new FormData(form),shareA=Number(jvData.get('shareA')),shareABps=Math.round(shareA*100);
        var factoryIds=String(jvData.get('factoryIds')||'').split(',').map(function(value){return value.trim();}).filter(Boolean);
        var jvResult=createJointVenture({countryId:root.__omegaV2IndustryCountryId||playerCountry(),
          name:jvData.get('name'),requestId:jvData.get('requestId'),managingCompanyId:jvData.get('companyA'),
          shareholders:[{companyId:jvData.get('companyA'),shareBps:shareABps},
            {companyId:jvData.get('companyB'),shareBps:10000-shareABps}],factoryIds:factoryIds});
        root.__omegaPrivateEnterpriseMessage=jvResult.status==='PROPOSED'?'JV charter submitted for government approval.':'JV charter blocked: '+String(jvResult.reason||jvResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-jv-contribution-form]')){
        if(event.preventDefault)event.preventDefault();
        var contributionData=new FormData(form),contribution=contributeJointVentureRetainedEarnings({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),jointVentureId:form.getAttribute('data-pe-jv'),
          companyId:contributionData.get('companyId'),amount:contributionData.get('amount'),requestId:contributionData.get('requestId')});
        root.__omegaPrivateEnterpriseMessage=contribution.status==='POSTED'?'Post-tax retained earnings contributed to the JV.':'JV contribution blocked: '+String(contribution.reason||contribution.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-jv-resolution-form]')){
        if(event.preventDefault)event.preventDefault();
        var resolutionData=new FormData(form),resolutionType=resolutionData.get('type'),resolutionAmount=resolutionData.get('amount');
        var resolutionResult=createJointVentureResolution({countryId:root.__omegaV2IndustryCountryId||playerCountry(),
          jointVentureId:form.getAttribute('data-pe-jv'),type:resolutionType,amount:resolutionAmount,
          description:resolutionData.get('description')});
        root.__omegaPrivateEnterpriseMessage=resolutionResult.status==='VOTING'?'JV resolution submitted for weighted shareholder voting.':'JV resolution blocked: '+String(resolutionResult.reason||resolutionResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(!form.matches('[data-pe-proposal-form]'))return;
      if(event.preventDefault)event.preventDefault();
      var data=new FormData(form),result=createProposal({countryId:root.__omegaV2IndustryCountryId||playerCountry(),
        companyId:data.get('companyId'),operatorCompanyId:data.get('operatorCompanyId'),factoryType:data.get('factoryType'),quantity:data.get('quantity'),
        sourcingPolicy:data.get('sourcingPolicy'),stateSupportRequested:data.get('stateSupportRequested')==='on'});
      root.__omegaPrivateEnterpriseMessage=result.status==='PROPOSED'?'Proposal submitted. It has no factory, stock or cash effect until the government decision and funding stages.':('Proposal blocked: '+(result.reason||result.status));
      refresh(root,root.__omegaV2IndustryCountryId||playerCountry());
    });
    root.addEventListener('click',function(event){
      var target=event.target,retry=target&&target.closest?target.closest('[data-pe-baseline-retry]'):null;
      if(retry){
        if(event.preventDefault)event.preventDefault();
        var retryCountry=root.__omegaV2IndustryCountryId||playerCountry();
        root.__omegaPrivateBaselineLoadFailedCountry='';
        root.__omegaPrivateBaselinePendingCountry='';
        root.__omegaPrivateBaselineError='';
        renderPanel(root,Object.assign({},root.__omegaV2IndustryOptions||{},{countryId:retryCountry,tab:'production-lines'}));
        return;
      }
      var button=target&&target.closest?target.closest('[data-pe-action]'):null;if(!button)return;
      var proposalId=button.getAttribute('data-pe-proposal'),action=button.getAttribute('data-pe-action'),country=root.__omegaV2IndustryCountryId||playerCountry();
      var result;
      if(action==='close-finance'){
        result=closeCompanyFinancialPeriod({countryId:country,companyId:button.getAttribute('data-pe-company')});
      }else if(action==='jv-approve'||action==='jv-deny'){
        result=decideJointVenture({countryId:country,jointVentureId:button.getAttribute('data-pe-jv'),decision:action==='jv-approve'?'APPROVE':'DENY'});
      }else if(action==='jv-vote-for'||action==='jv-vote-against'){
        result=voteJointVentureResolution({countryId:country,jointVentureId:button.getAttribute('data-pe-jv'),
          resolutionId:button.getAttribute('data-pe-resolution'),companyId:button.getAttribute('data-pe-company'),
          vote:action==='jv-vote-for'?'FOR':'AGAINST'});
      }else if(action==='jv-pay-dividend'){
        result=distributeJointVentureDividend({countryId:country,jointVentureId:button.getAttribute('data-pe-jv'),
          resolutionId:button.getAttribute('data-pe-resolution')});
      }else
      if(action==='adjust'){
        var input=shellInput(root,'[data-pe-adjust-quantity="'+proposalId+'"]');
        result=adjustProposal({countryId:country,proposalId:proposalId,quantity:input&&input.value});
      }else if(action==='approve')result=decideProposal({countryId:country,proposalId:proposalId,decision:'APPROVE',allowStateSupport:true,conditions:{allowStateSupport:true}});
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
    // UI refresh is event/navigation-driven. Proposal submissions are bounded to one active-country review per 30 committed game turns.
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',scheduleAutonomousProposalCycle);
  }
  installIndustryHook();
  var API=Object.freeze({
    VERSION:VERSION,companyIds:COMPANY_IDS.slice(),companyNames:clone(COMPANY_NAMES),
    createProposal:createProposal,adjustProposal:adjustProposal,advanceAutonomousProposalCycle:advanceAutonomousProposalCycle,decideProposal:decideProposal,previewProposal:function(country,id){var p=getProposal(country,id);return p?previewFor(p):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};},
    fundProposal:fundProposal,startConstruction:startConstruction,authorizeFactoryProjectConstruction:authorizeFactoryProjectConstruction,
    recordCompanyCapitalReceipt:recordCompanyCapitalReceipt,refreshCommissionedProductionGate:refreshCommissionedProductionGate,
    getProposal:getProposal,getCountryDashboard:getCountryDashboard,getCompanyCapitalSummary:getCompanyCapitalSummary,
    getCompanyFinanceSummary:getCompanyFinanceSummary,closeCompanyFinancialPeriod:closeCompanyFinancialPeriod,
    createJointVenture:createJointVenture,decideJointVenture:decideJointVenture,
    createJointVentureResolution:createJointVentureResolution,voteJointVentureResolution:voteJointVentureResolution,
    contributeJointVentureRetainedEarnings:contributeJointVentureRetainedEarnings,
    distributeJointVentureDividend:distributeJointVentureDividend,getJointVentureDashboard:getJointVentureDashboard,
    diagnostics:diagnostics,productionProofReady:productionProofReady
  });
  g.OmegaPrivateEnterpriseLifecycleV1=API;g.Omega=g.Omega||{};g.Omega.PrivateEnterpriseLifecycleV1=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
