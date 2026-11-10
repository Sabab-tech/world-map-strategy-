/* OMEGA PRIVATE ENTERPRISE LIFECYCLE v1.0.0
 * Country-scoped proposal -> approval -> finance -> construction -> commissioning.
 * Reuses Finance's omegaFinance ledger and the canonical Industrial Network project registry.
 * Private production is enabled only when the canonical extraction, logistics, factory-cycle and output runtime is mounted and commissioning records verify.
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
  var MAX_PROPOSALS=250,MAX_EVENTS=600,MAX_PROJECTS_PER_PROPOSAL=25,MAX_TRADE_HISTORY=4096;
  var MAX_UNIVERSAL_RESOURCE_EVALUATIONS_PER_COMPANY_TURN=8;
  var NETWORK_EVENT='OMEGA_FACTORY_CAPACITY_CHANGED';
  function obj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){if(k!=='__proto__'&&k!=='constructor')o[k]=clone(v[k]);});return o;}
  function num(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return Number.isFinite(n)?n:null;}
  function id(v){return String(v==null?'':v).trim().toUpperCase();}
  function token(v){return String(v==null?'':v).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function state(){
    // The simulation world owns the live root after boot, session changes and save/load.
    // Legacy Game.state remains the compatibility surface, not a second authority.
    var simulation=g.Omega&&(g.Omega.SimulationRuntime||g.Omega.Simulation);
    var authoritative=simulation&&simulation.world&&simulation.world.state;
    if(obj(authoritative))return authoritative;
    var omegaWorld=g.Omega&&g.Omega.World&&g.Omega.World.state;
    if(obj(omegaWorld))return omegaWorld;
    return g.Game&&obj(g.Game.state)?g.Game.state:(obj(g.gameState)?g.gameState:null);
  }
  function turn(){var s=state()||{};return num(s.simulation&&s.simulation.turn)??num(s.turn)??num(s.simulationTurn)??0;}
  function canonicalCountry(v){
    var raw=id(v);if(!raw)return '';
    // Live country-domain state uses ISO-3 keys. Preserve an incoming ISO-3 directly
    // instead of allowing an alias resolver's ISO-2 display identity to redirect reads.
    if(/^[A-Z]{3}$/.test(raw))return raw;
    var registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    try{var resolved=registry&&registry.resolveCountry?registry.resolveCountry(v):null;if(resolved){var value=resolved.raw?.raw||resolved.raw||{};var identity=value.identity||{};var iso3=value.iso3||value.iso3Code||value.ISO_A3||value.iso_a3||identity.iso3||identity.iso3Code||resolved.iso3||resolved.iso3Code;var code=id(iso3||resolved.id||resolved.canonicalId);if(/^[A-Z]{3}$/.test(code))return code;}}catch(_){}
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
  function countryAliasKeys(country){
    var registry=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    if(!registry||typeof registry.resolveCountry!=='function')return [];
    for(var i=0,candidates=[country,String(country==null?'':country).replace(/[_-]+/g,' ')];i<candidates.length;i++){
      try{
        var hit=registry.resolveCountry(candidates[i]);if(!hit||!hit.id)continue;
        var row=hit.raw&&hit.raw.raw||hit.raw||{};
        return Array.from(new Set([
          row.iso3,row.iso3Code,row.ISO_A3,row.iso_a3,row.iso2,row.code,
          hit.id,hit.canonicalId,row.name,row.officialName
        ].concat(Array.isArray(row.aliases)?row.aliases:[])
          .filter(Boolean).map(function(value){return id(value);})));
      }catch(_){}
    }
    return [];
  }
  function countryBucket(domain,country,create){
    var s=state();if(!s)return null;
    if(!obj(s[domain])){if(!create)return null;s[domain]={};}
    var root=s[domain],raw=id(country),cid=/^[A-Z]{3}$/.test(raw)?raw:canonicalCountry(country),
      keys=Object.keys(root),aliases=new Set([raw,cid].concat(countryAliasKeys(country)).map(function(value){return id(value);}));
    var key=Object.prototype.hasOwnProperty.call(root,cid)?cid:
      keys.find(function(k){
        var normalized=id(k);
        return aliases.has(normalized)||canonicalCountry(k)===cid||
          countryAliasKeys(k).some(function(alias){return aliases.has(id(alias));});
      });
    if(!key&&create)key=cid;
    if(!key)return null;
    if(!obj(root[key])){if(!create)return null;root[key]={};}
    return root[key];
  }
  function lifecycleRecordIdentity(row){
    if(!obj(row))return JSON.stringify(row);
    var fields=['proposalId','eventId','jointVentureId','caseId','restructuringCaseId',
      'procurementRecordId','recordId','settlementId','entryId','sourceEventId','transactionId','periodId','id'];
    for(var i=0;i<fields.length;i++){
      var value=row[fields[i]];
      if(value!==undefined&&value!==null&&String(value)!=='')return fields[i]+':'+String(value);
    }
    return JSON.stringify(row);
  }
  function mergeLifecycleRuntime(target,source){
    if(!obj(target)||!obj(source)||target===source)return target;
    var listKeys=['proposals','events','financialPeriods','jointVentures','restructuringCases','governmentInvitations',
      'procurementRecords','privateCompanyProcurementRecords','operatingCostEntries',
      'unpricedOperatingCostEvents','inputConsumptionEntries','marketResearchRequests'];
    listKeys.forEach(function(key){
      if(!Array.isArray(target[key]))target[key]=[];
      var rows=Array.isArray(source[key])?source[key]:[],seen=new Set(target[key].map(lifecycleRecordIdentity));
      rows.forEach(function(row){
        var identity=lifecycleRecordIdentity(row);
        if(!seen.has(identity)){target[key].push(row);seen.add(identity);}
      });
    });
    Object.keys(source).forEach(function(key){
      if(listKeys.indexOf(key)>=0)return;
      var from=source[key],to=target[key];
      if(to===undefined||to===null){target[key]=from;return;}
      if(obj(to)&&obj(from)&&!Array.isArray(to)&&!Array.isArray(from)){
        Object.keys(from).forEach(function(child){
          if(to[child]===undefined||to[child]===null)to[child]=from[child];
        });
      }
    });
    target.nextProposalSequence=Math.max(1,Number(target.nextProposalSequence)||1,Number(source.nextProposalSequence)||1);
    target.nextJointVentureSequence=Math.max(1,Number(target.nextJointVentureSequence)||1,Number(source.nextJointVentureSequence)||1);
    target.nextInvitationSequence=Math.max(1,Number(target.nextInvitationSequence)||1,Number(source.nextInvitationSequence)||1);
    return target;
  }
  function runtime(country,create){
    var cid=canonicalCountry(country),economyRoot=(state()||{}).economy||{},
      econ=countryBucket('economy',country,create);if(!econ)return null;
    // A canonical ISO-3 bucket can appear after older saves already placed the
    // same country's lifecycle under a display-name/ISO-2 alias (for example,
    // BANGLADESH). Prefer the populated lifecycle and merge unique ledger rows
    // before returning, rather than letting an empty BGD bucket hide settled data.
    var aliases=new Set([cid].concat(countryAliasKeys(country)).map(function(value){return id(value);}));
    var iso2Aliases=new Set(countryAliasKeys(country).filter(function(value){return /^[A-Z]{2}$/.test(value);}));
    var aliasEconomies=Object.keys(economyRoot).filter(function(key){
      var candidate=economyRoot[key];
      if(!obj(candidate)||candidate===econ)return false;
      var normalized=id(key);
      // An existing ISO-3 runtime is authoritative over a competing ISO-2 key.
      // Display-name legacy buckets (BANGLADESH) still need migration, but a
      // two-letter alias must not be merged into an already materialized BGD bucket.
      if(iso2Aliases.has(normalized))return false;
      return aliases.has(normalized)||canonicalCountry(key)===cid||
        countryAliasKeys(key).some(function(alias){return aliases.has(id(alias));});
    }).map(function(key){return economyRoot[key];});
    var aliasRuntimes=aliasEconomies.map(function(bucket){return bucket.privateEnterpriseLifecycle;})
      .filter(function(value){return obj(value);});
    var r=obj(econ.privateEnterpriseLifecycle)?econ.privateEnterpriseLifecycle:null;
    if(!r&&aliasRuntimes.length){
      aliasRuntimes.sort(function(left,right){
        function count(value){return ['proposals','events','financialPeriods','jointVentures','procurementRecords',
          'privateCompanyProcurementRecords','operatingCostEntries','unpricedOperatingCostEvents','inputConsumptionEntries']
          .reduce(function(total,key){return total+(Array.isArray(value[key])?value[key].length:0);},0);}
        return count(right)-count(left);
      });
      r=aliasRuntimes[0];
      econ.privateEnterpriseLifecycle=r;
    }
    if(r){
      aliasRuntimes.forEach(function(aliasRuntime){mergeLifecycleRuntime(r,aliasRuntime);});
      // Keep legacy alias readers connected to the same live lifecycle object.
      aliasEconomies.forEach(function(bucket){bucket.privateEnterpriseLifecycle=r;});
    }
    if(!r&&create){
      r={schemaVersion:VERSION,nextProposalSequence:1,nextJointVentureSequence:1,nextInvitationSequence:1,
        proposals:[],events:[],financialPeriods:[],jointVentures:[],governmentInvitations:[],marketResearchRequests:[]};
      econ.privateEnterpriseLifecycle=r;
    }
    if(!obj(r))return null;
    if(!Array.isArray(r.proposals))r.proposals=[];
    if(!Array.isArray(r.events))r.events=[];
    if(!Array.isArray(r.financialPeriods))r.financialPeriods=[];
    if(!Array.isArray(r.jointVentures))r.jointVentures=[];
    if(!Array.isArray(r.governmentInvitations))r.governmentInvitations=[];
    if(!Array.isArray(r.marketResearchRequests))r.marketResearchRequests=[];
    if(!Array.isArray(r.restructuringCases))r.restructuringCases=[];
    if(!obj(r.companyStatuses))r.companyStatuses={};
    if(!Array.isArray(r.procurementRecords))r.procurementRecords=[];
    if(!Array.isArray(r.privateCompanyProcurementRecords))r.privateCompanyProcurementRecords=[];
    if(!Array.isArray(r.operatingCostEntries))r.operatingCostEntries=[];
    if(!Array.isArray(r.unpricedOperatingCostEvents))r.unpricedOperatingCostEvents=[];
    if(!Array.isArray(r.inputConsumptionEntries))r.inputConsumptionEntries=[];
    if(!Number.isInteger(r.nextProposalSequence)||r.nextProposalSequence<1)r.nextProposalSequence=1;
    if(!Number.isInteger(r.nextJointVentureSequence)||r.nextJointVentureSequence<1)r.nextJointVentureSequence=1;
    if(!Number.isInteger(r.nextInvitationSequence)||r.nextInvitationSequence<1)r.nextInvitationSequence=1;
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
    if(!obj(all[company])&&create)all[company]={companyId:company,currency:observedCompanyCurrency(country)||'GAME_CURRENCY_UNITS',availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
    if(!obj(all[company]))return null;
    normalizeCapitalReservation(country,company,all[company]);
    return all[company];
  }
  function reconcileCapitalCurrency(country,company,expectedCurrency,create){
    var account=capitalAccount(country,company,!!create);
    var expected=id(expectedCurrency||observedCompanyCurrency(country)||'GAME_CURRENCY_UNITS');
    if(!account)return{ok:true,account:null,currency:expected};
    var actual=id(account.currency||'GAME_CURRENCY_UNITS');
    if(actual!==expected){
      var nonZeroBalance=['availableBalance','reservedBalance','capitalRaised','capitalSpent','retainedEarningsBalance']
        .some(function(key){return Math.abs(num(account[key])||0)>1e-9;});
      if(nonZeroBalance)return{ok:false,reason:'COMPANY_CAPITAL_CURRENCY_MISMATCH',
        companyId:id(company),expectedCurrency:expected,actualCurrency:actual};
      account.currency=expected;
      account.revision=(num(account.revision)||0)+1;
    }
    return{ok:true,account:account,currency:expected};
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
  function recipeFor(factoryType,profile,processingResourceId){
    var c=catalog()||{},routes=c.downstreamFactoryRecipes||{},preferred=String(profile&&profile.defaultRecipeId||'');
    if(preferred&&routes[preferred])return routes[preferred];
    if(factoryType==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'){
      var processing=c.processingRules||{},requested=token(processingResourceId||'');
      if(!requested)return null;
      var processingKey=Object.keys(processing).find(function(key){return token(key)===requested;});
      var processingRule=processingKey&&processing[processingKey];
      if(!processingRule||id(processingRule.factoryType)!==factoryType)return null;
      return Object.assign({},processingRule,{recipeId:'PROCESSING:'+processingKey,resourceId:processingKey,recipeMode:'DYNAMIC_PROCESSING'});
    }
    var keys=Object.keys(routes);
    for(var i=0;i<keys.length;i++)if(id(routes[keys[i]]&&routes[keys[i]].factoryType)===factoryType)return routes[keys[i]];
    return null;
  }
  function resourceReadSnapshot(country){
    var source=countryBucket('resource',country,false)||{},
      warehouse=source.warehouse&&typeof source.warehouse==='object'&&!Array.isArray(source.warehouse)?source.warehouse:{},
      strategic=source.strategicReserve&&typeof source.strategicReserve==='object'&&!Array.isArray(source.strategicReserve)
        ?source.strategicReserve:{};
    // Copy only the ledgers used by the input forecast. Avoid cloning unrelated
    // shipment batches, projects, capacity metadata or other large mobile state.
    return{
      inventory:clone(obj(source.inventory)?source.inventory:{}),
      warehouse:{
        availableByResource:clone(obj(warehouse.availableByResource)?warehouse.availableByResource:{}),
        reservedByResource:clone(obj(warehouse.reservedByResource)?warehouse.reservedByResource:{})
      },
      demandRuntime:obj(source.demandRuntime)?clone(source.demandRuntime):null,
      strategicReserve:{
        availableByResource:clone(obj(strategic.availableByResource)?strategic.availableByResource:{}),
        protectedByResource:clone(obj(strategic.protectedByResource)?strategic.protectedByResource:{}),
        minimumByResource:clone(obj(strategic.minimumByResource)?strategic.minimumByResource:{})
      },
      protectedStockByResource:clone(obj(source.protectedStockByResource)?source.protectedStockByResource:{}),
      minimumStockByResource:clone(obj(source.minimumStockByResource)?source.minimumStockByResource:{})
    };
  }
  function resourceAvailable(country,resourceId,resourceSnapshot){
    // Read every input from the same caller-captured country snapshot. Re-resolving
    // state per material can mix a stale/rotated country bucket into one preview.
    var bucket=resourceSnapshot&&typeof resourceSnapshot==='object'&&!Array.isArray(resourceSnapshot)
      ?resourceSnapshot:(countryBucket('resource',country,false)||{}),
      inv=bucket.inventory&&typeof bucket.inventory==='object'&&!Array.isArray(bucket.inventory)?bucket.inventory:{},
      warehouse=bucket.warehouse&&typeof bucket.warehouse==='object'&&!Array.isArray(bucket.warehouse)?bucket.warehouse:{};
    var inventoryKey=Object.prototype.hasOwnProperty.call(inv,resourceId)?resourceId:Object.keys(inv).find(function(k){return token(k)===token(resourceId);});
    var rows=obj(warehouse.availableByResource)?warehouse.availableByResource:{};
    var warehouseKey=Object.prototype.hasOwnProperty.call(rows,resourceId)?resourceId:Object.keys(rows).find(function(k){return token(k)===token(resourceId);});
    var invAmount=inventoryKey==null?null:Math.max(0,num(inv[inventoryKey])||0);
    var warehouseAmount=warehouseKey==null?null:Math.max(0,num(rows[warehouseKey])||0);
    var reserved=Math.max(0,num(warehouse.reservedByResource&&warehouse.reservedByResource[warehouseKey||resourceId])||0);
    var warehouseFree=warehouseAmount===null?null:Math.max(0,warehouseAmount-reserved);
    var amount=invAmount!==null&&warehouseFree!==null?Math.min(invAmount,warehouseFree):warehouseFree!==null?warehouseFree:invAmount;
    var strategic=bucket.strategicReserve&&typeof bucket.strategicReserve==='object'&&!Array.isArray(bucket.strategicReserve)
      ?bucket.strategicReserve:{};
    var protectedMap=strategic.availableByResource&&typeof strategic.availableByResource==='object'&&!Array.isArray(strategic.availableByResource)
      ?strategic.availableByResource:
      strategic.protectedByResource&&typeof strategic.protectedByResource==='object'&&!Array.isArray(strategic.protectedByResource)
        ?strategic.protectedByResource:
      strategic.minimumByResource&&typeof strategic.minimumByResource==='object'&&!Array.isArray(strategic.minimumByResource)
        ?strategic.minimumByResource:
      bucket.protectedStockByResource&&typeof bucket.protectedStockByResource==='object'?bucket.protectedStockByResource:
      bucket.minimumStockByResource&&typeof bucket.minimumStockByResource==='object'?bucket.minimumStockByResource:{};
    var protectedValue=null;
    Object.keys(protectedMap).some(function(key){if(token(key)!==token(resourceId))return false;protectedValue=Math.max(0,num(protectedMap[key])||0);return true;});
    var protectedQty=protectedValue===null?0:protectedValue;
    var availableAfterProtection=amount===null?null:Math.max(0,amount-protectedQty);
    var demandRuntime=bucket.demandRuntime&&typeof bucket.demandRuntime==='object'&&!Array.isArray(bucket.demandRuntime)
      ?bucket.demandRuntime:{};
    var rawDemandRows=demandRuntime.byResource;
    var byResource=rawDemandRows&&typeof rawDemandRows==='object'&&!Array.isArray(rawDemandRows)?rawDemandRows:{};
    var demandRow=null;
    Object.keys(byResource).some(function(key){if(token(key)!==token(resourceId))return false;demandRow=byResource[key];return true;});
    var resourceRoot=(state()||{}).resource||{};
    var matchingCountryKeys=Object.keys(resourceRoot).filter(function(key){return canonicalCountry(key)===canonicalCountry(country);});
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
      demandSnapshotTurn:num(demandRuntime.lastTurn),demandEvaluationTurn:turn(),demandRowObserved:!!demandRow,
      demandRuntimePresent:obj(bucket.demandRuntime),demandRuntimeResourceKeys:Object.keys(byResource),resourceBucketKeys:Object.keys(bucket),
      resourceCountryKeys:Object.keys(resourceRoot),matchingCountryKeys:matchingCountryKeys,
      authority:amount===null?'UNOBSERVED':invAmount!==null&&warehouseFree!==null?'INVENTORY_AND_WAREHOUSE_LEDGER':warehouseFree!==null?'RAW_WAREHOUSE_LEDGER':'LEGACY_INVENTORY_AGGREGATE'};
  }
  function inputForecast(country,profile,recipe,quantity,resourceSnapshot){
    var inputs=recipe&&recipe.inputs||{},capacity=Math.max(1,num(profile&&profile.defaultCapacityPerDay)||1)*quantity,rows=[],
      snapshot=obj(resourceSnapshot)?resourceSnapshot:resourceReadSnapshot(country);
    Object.keys(inputs).forEach(function(resourceId){
      var perUnit=num(inputs[resourceId]);if(perUnit===null||perUnit<=0)return;
      var needed=perUnit*capacity*30,stock=resourceAvailable(country,resourceId,snapshot);
      rows.push({resourceId:resourceId,perUnit:perUnit,forecast30Day:needed,available:stock.available,physicalAvailable:stock.physicalAvailable,
        protectedStock:stock.protectedStock,nationalDemandPerDay:stock.nationalDemandPerDay,consumerDemandPerDay:stock.consumerDemandPerDay,
        existingFactoryInputDemandPerDay:stock.existingFactoryInputDemandPerDay,existingDemand30Day:stock.existingDemand30Day,
        confirmedInboundNotCounted:stock.confirmedInboundNotCounted,demandStatus:stock.demandStatus,
        demandSnapshotTurn:stock.demandSnapshotTurn,demandEvaluationTurn:stock.demandEvaluationTurn,demandRowObserved:stock.demandRowObserved,demandRuntimePresent:stock.demandRuntimePresent,demandRuntimeResourceKeys:stock.demandRuntimeResourceKeys,resourceBucketKeys:stock.resourceBucketKeys,
        shortfall:stock.available===null?null:Math.max(0,needed-stock.available),authority:stock.authority,reserved:stock.reserved,
        snapshotDemandLastTurn:num(snapshot.demandRuntime&&snapshot.demandRuntime.lastTurn),
        snapshotDemandResourceKeys:Object.keys(obj(snapshot.demandRuntime&&snapshot.demandRuntime.byResource)?snapshot.demandRuntime.byResource:{}),
        snapshotDemandRuntimeOwnKeys:Object.keys(obj(snapshot.demandRuntime)?snapshot.demandRuntime:{} ),
        snapshotStrategicResourceKeys:Object.keys(snapshot.strategicReserve?.availableByResource||{}),
        snapshotStrategicReserveKeys:Object.keys(snapshot.strategicReserve||{})});
    });
    return rows;
  }
  function applicationText(value){return String(value==null?'':value).replace(/\r\n/g,'\n').trim();}
  function observedMarketPrice(country,resourceId){
    var trade=countryBucket('trade',country,false)||{},prices=obj(trade.marketPrice)?trade.marketPrice:{},keys=Object.keys(prices),key=keys.find(function(row){return token(row)===token(resourceId);});
    if(!key)return null;
    var price=num(prices[key]);if(price===null||price<0)return null;
    return{resourceId:resourceId,unitPrice:price,currency:String(trade.currencyCode||trade.currency||'').trim()||null,authority:'COUNTRY_TRADE_MARKET_PRICE'};
  }

  function currentMarketEvidence(country,resourceId,marketApi){
    var quote=null;
    try{if(marketApi&&typeof marketApi.quote==='function')quote=marketApi.quote(resourceId);}catch(_){}
    quote=quote||{};
    var current=num(quote.generatedTurn)===turn(),
      cleared=current&&String(quote.status||'').toUpperCase()==='CLEARED'&&
        String(quote.priceDiscovery||'').toUpperCase()==='ORDER_BOOK_CROSSING'&&num(quote.clearingPriceUsd)!==null,
      matches=Array.isArray(quote.matches)?quote.matches:[],
      cid=canonicalCountry(country),foreignExports=0,foreignImports=0,foreignBuyerMatches=0;
    matches.forEach(function(row){
      var buyer=canonicalCountry(row&&row.buyerCountryId),seller=canonicalCountry(row&&row.sellerCountryId),
        quantity=Math.max(0,num(row&&row.quantity)||0);
      if(!buyer||!seller||quantity<=0)return;
      if(seller===cid&&buyer!==cid)foreignExports+=quantity;
      if(buyer===cid&&seller!==cid)foreignImports+=quantity;
      if(buyer!==cid)foreignBuyerMatches+=quantity;
    });
    var bidDepth=current?num(quote.bidDepth):null,askDepth=current?num(quote.askDepth):null,
      matched=num(quote.matchedQuantity),
      unmatchedBidDepth=bidDepth===null||matched===null?null:Math.max(0,bidDepth-matched),
      unmatchedAskDepth=askDepth===null||matched===null?null:Math.max(0,askDepth-matched),
      unmatchedDemandSupplyGap=unmatchedBidDepth===null||unmatchedAskDepth===null?null:unmatchedBidDepth-unmatchedAskDepth;
    return{resourceId:resourceId,generatedTurn:num(quote.generatedTurn),currentTurn:current,
      status:current?String(quote.status||'UNAVAILABLE'):'STALE_OR_UNOBSERVED',
      priceDiscovery:current?String(quote.priceDiscovery||'UNAVAILABLE'):'UNAVAILABLE',
      clearingPriceUsd:cleared?num(quote.clearingPriceUsd):null,
      matchedQuantity:current?matched:null,bidDepth:bidDepth,askDepth:askDepth,
      globalUnmatchedBidDepth:unmatchedBidDepth,globalUnmatchedAskDepth:unmatchedAskDepth,
      globalUnmatchedDemandSupplyGap:unmatchedDemandSupplyGap,
      foreignBuyerMatchedQuantity:current&&Array.isArray(quote.matches)?foreignBuyerMatches:null,
      matchedExportsFromCountry:current&&Array.isArray(quote.matches)?foreignExports:null,
      matchedImportsIntoCountry:current&&Array.isArray(quote.matches)?foreignImports:null,
      demandPressureStatus:!current?'UNOBSERVED':unmatchedBidDepth===null?'UNOBSERVED':
        unmatchedBidDepth>0?'GLOBAL_UNMATCHED_BUY_ORDERS':'NO_UNMATCHED_BUY_ORDERS_OBSERVED',
      quoteAuthority:'OMEGA_GLOBAL_MARKET_CURRENT_TURN_ORDER_BOOK',
      matchesObserved:current&&Array.isArray(quote.matches)};
  }
  function currentDomesticDemandEvidence(country,resourceId){
    var bucket=countryBucket('resource',country,false)||{},snapshot=bucket.demandRuntime||null;
    if(!obj(snapshot))return{status:'UNOBSERVED',resourceId:resourceId,demandPerDay:null};
    if(num(snapshot.lastTurn)!==turn())return{status:'STALE',resourceId:resourceId,demandPerDay:null,
      snapshotTurn:num(snapshot.lastTurn),evaluationTurn:turn()};
    var rows=obj(snapshot.byResource)?snapshot.byResource:{},key=Object.keys(rows).find(function(k){return token(k)===token(resourceId);}),
      row=key?rows[key]:null;
    if(!obj(row)||num(row.demandPerDay)===null)return{status:'UNOBSERVED',resourceId:resourceId,
      snapshotTurn:num(snapshot.lastTurn),demandPerDay:null};
    return{status:'CURRENT_TURN',resourceId:resourceId,demandPerDay:Math.max(0,num(row.demandPerDay)),
      consumerDemandPerDay:num(row.consumerDemandPerDay),activeFactoryInputDemandPerDay:num(row.activeFactoryInputDemandPerDay),
      inventoryAfter:num(row.inventoryAfter),snapshotTurn:num(snapshot.lastTurn),
      authority:'OMEGA_RESOURCE_NATIONAL_DEMAND_RUNTIME_V1'};
  }
  function currentDomesticOutputEvidence(country,resourceId){
    var econ=countryBucket('economy',country,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:null;
    if(!assets)return{status:'UNOBSERVED',resourceId:resourceId,existingOutputPerDay:null,activeFactoryCount:null};
    var c=catalog()||{},total=0,matched=0,unknown=0;
    assets.forEach(function(asset){
      if(!obj(asset)||asset.productionEnabled===false)return;
      var status=String(asset.status||'').toUpperCase();
      if(status!=='OPERATIONAL'&&asset.productionEnabled!==true)return;
      var type=id(asset.factoryType||asset.type),profile=c.factoryProfiles&&c.factoryProfiles[type];
      if(!profile){unknown++;return;}
      var processing=asset.processingResourceId||asset.resourceId||null,
        recipe=recipeFor(type,profile,processing),outputs=recipe&&obj(recipe.outputs)?recipe.outputs:{},
        outputKey=Object.keys(outputs).find(function(k){return token(k)===token(resourceId);});
      if(!outputKey)return;
      matched++;
      var coefficient=num(outputs[outputKey]),capacity=num(asset.capacityPerDay)??num(asset.capacity)??num(profile.defaultCapacityPerDay),
        cycleDays=num(recipe.cycleDays)??num(profile.cycleDays)??1;
      if(coefficient===null||capacity===null||cycleDays<=0){unknown++;return;}
      total+=Math.max(0,coefficient*capacity/cycleDays);
    });
    if(unknown)return{status:'PARTIALLY_OBSERVED',resourceId:resourceId,existingOutputPerDay:matched?total:null,
      activeFactoryCount:matched,unresolvedFactoryCount:unknown};
    return{status:matched?'OBSERVED_ACTIVE_FACTORY_OUTPUT':'NO_ACTIVE_OUTPUT_RECORDS',
      resourceId:resourceId,existingOutputPerDay:matched?Number(total.toFixed(6)):0,
      activeFactoryCount:matched,authority:'SELECTED_COUNTRY_OPERATIONAL_FACTORY_ASSETS_AND_CANONICAL_RECIPES'};
  }
  function currentProcessedStockEvidence(country,resourceId){
    var bucket=countryBucket('resource',country,false)||{},warehouse=bucket.processedWarehouse;
    if(!obj(warehouse)||!obj(warehouse.availableByResource))
      return{status:'UNOBSERVED',available:null,reserved:null,free:null};
    var key=Object.keys(warehouse.availableByResource).find(function(k){return token(k)===token(resourceId);}),
      reservedRows=obj(warehouse.reservedByResource)?warehouse.reservedByResource:{},
      reservedKey=Object.keys(reservedRows).find(function(k){return token(k)===token(resourceId);});
    var available=key===undefined?0:Math.max(0,num(warehouse.availableByResource[key])||0),
      reserved=reservedKey===undefined?0:Math.max(0,num(reservedRows[reservedKey])||0);
    return{status:'OBSERVED',available:available,reserved:reserved,free:Math.max(0,available-reserved),
      warehouseId:warehouse.warehouseId||null,authority:'SELECTED_COUNTRY_PROCESSED_WAREHOUSE'};
  }
  function companyMarketOpportunityAnalysis(proposal,outputs,inputs,marketApi){
    var cid=proposal.countryId,domestic=[],international=[],processing=[];
    (outputs||[]).forEach(function(row){
      var demand=currentDomesticDemandEvidence(cid,row.resourceId),
        supply=currentDomesticOutputEvidence(cid,row.resourceId),stock=currentProcessedStockEvidence(cid,row.resourceId),
        need30=demand.status==='CURRENT_TURN'?demand.demandPerDay*30:null,
        supply30=(supply.status==='OBSERVED_ACTIVE_FACTORY_OUTPUT'||supply.status==='NO_ACTIVE_OUTPUT_RECORDS')&&supply.existingOutputPerDay!==null?supply.existingOutputPerDay*30:null,
        freeStock=stock.free,
        gap=need30!==null&&supply30!==null&&freeStock!==null?Math.max(0,need30-supply30-freeStock):null,
        market=currentMarketEvidence(cid,row.resourceId,marketApi);
      domestic.push({resourceId:row.resourceId,demandPerDay:demand.demandPerDay,
        consumerDemandPerDay:demand.consumerDemandPerDay,existingOutputPerDay:supply.existingOutputPerDay,
        processedStockAvailable:stock.free,unmetDomesticDemand30Day:gap,
        status:gap===null?'UNOBSERVED':gap>0?'DOMESTIC_DEMAND_GAP':'NO_DOMESTIC_GAP_OBSERVED',
        demandEvidenceStatus:demand.status,outputEvidenceStatus:supply.status,stockEvidenceStatus:stock.status,
        authority:'CURRENT_TURN_DEMAND_PLUS_SELECTED_COUNTRY_OUTPUT_AND_PROCESSED_STOCK'});
      international.push({resourceId:row.resourceId,
        globalMatchedDemand:market.foreignBuyerMatchedQuantity,
        matchedExportsFromCountry:market.matchedExportsFromCountry,
        globalUnmatchedBuyOrderDepth:market.globalUnmatchedBidDepth,
        globalUnmatchedSellOfferDepth:market.globalUnmatchedAskDepth,
        unmatchedDemandSupplyGap:market.globalUnmatchedDemandSupplyGap,
        globalBidDepth:market.bidDepth,globalAskDepth:market.askDepth,
        demandPressureStatus:market.demandPressureStatus,
        demandSupplyStatus:market.globalUnmatchedDemandSupplyGap===null?'UNOBSERVED':
          market.globalUnmatchedDemandSupplyGap>0?'BUYER_DEMAND_EXCEEDS_SELLER_SUPPLY':
          market.globalUnmatchedDemandSupplyGap<0?'SELLER_SUPPLY_EXCEEDS_BUYER_DEMAND':'BALANCED_OPEN_ORDER_DEPTH',
        marketTurn:market.generatedTurn,
        evidenceStatus:market.currentTurn?'CURRENT_TURN_ORDER_BOOK':'UNOBSERVED_OR_STALE',
        note:'Global order-book pressure is not a country-specific sales contract.'});
    });
    (inputs||[]).forEach(function(row){
      var market=currentMarketEvidence(cid,row.resourceId,marketApi);
      processing.push({resourceId:row.resourceId,required30Day:num(row.forecast30Day),
        domesticUncommittedAvailable:num(row.available),matchedRawMaterialExportsFromCountry:market.matchedExportsFromCountry,
        internationalBuyerMatches:market.foreignBuyerMatchedQuantity,
        status:!market.currentTurn||!market.matchesObserved||market.matchedExportsFromCountry===null
          ?'UNOBSERVED_OR_STALE':
          market.matchedExportsFromCountry>0?'CURRENT_TURN_DOMESTIC_RAW_EXPORTS_OBSERVED':'NO_MATCHED_RAW_EXPORTS_IN_CURRENT_SNAPSHOT',
        opportunity:'A processing company may add domestic value before export; matched export quantity is evidence of trade, not a secured input contract.',
        marketTurn:market.generatedTurn});
    });
    return{domesticDemand:domestic,internationalDemand:international,
      exportProcessingOpportunities:processing,
      evidencePolicy:'Only current-turn observed demand, active output capacity, processed stock and executed market matches are quantified. Missing evidence is UNOBSERVED.'};
  }
  function scenarioPrice(country,resourceId,kind,marketApi){
    var local=observedMarketPrice(country,resourceId),market=currentMarketEvidence(country,resourceId,marketApi);
    if(kind==='INTERNATIONAL'){
      var executable=market.currentTurn&&market.status==='CLEARED'&&
        market.priceDiscovery==='ORDER_BOOK_CROSSING'&&market.clearingPriceUsd!==null&&
        marketApi&&typeof marketApi.localPrice==='function';
      if(executable){
        var converted=null;
        try{converted=num(marketApi.localPrice(country,resourceId));}catch(_){}
        if(converted!==null)return{unitPrice:converted,
          currency:observedCompanyCurrency(country)||null,
          source:'CURRENT_TURN_CLEARED_INTERNATIONAL_ORDER_BOOK',
          marketTurn:market.generatedTurn,marketStatus:market.status,marketSnapshotCurrent:true};
      }
      return{unitPrice:null,currency:null,
        source:market.currentTurn?'NO_EXECUTABLE_INTERNATIONAL_CLEARING':'INTERNATIONAL_MARKET_UNOBSERVED_OR_STALE',
        marketTurn:market.generatedTurn,marketStatus:market.status,marketSnapshotCurrent:market.currentTurn};
    }
    if(local)return{unitPrice:local.unitPrice,currency:local.currency,
      source:'COUNTRY_RECORDED_DOMESTIC_TRADE_PRICE',
      marketTurn:market.generatedTurn,marketStatus:market.status,marketSnapshotCurrent:market.currentTurn};
    return{unitPrice:null,currency:null,source:'DOMESTIC_PRICE_UNOBSERVED',
      marketTurn:market.generatedTurn,marketStatus:market.status,marketSnapshotCurrent:market.currentTurn};
  }
  function companyUnitEconomics(proposal,preview,assessment,marketApi){
    var profile=(catalog()||{}).factoryProfiles&&catalog().factoryProfiles[proposal.factoryType],
      recipe=recipeFor(proposal.factoryType,profile,proposal.processingResourceId),
      outputs=recipe&&obj(recipe.outputs)?recipe.outputs:{},
      opportunity=companyMarketOpportunityAnalysis(proposal,
        Object.keys(outputs).map(function(resourceId){return{resourceId:resourceId};}),
        preview.inputRequirements||[],marketApi),
      domesticByResource=Object.create(null),internationalByResource=Object.create(null);
    opportunity.domesticDemand.forEach(function(row){domesticByResource[token(row.resourceId)]=row;});
    opportunity.internationalDemand.forEach(function(row){internationalByResource[token(row.resourceId)]=row;});
    var outputRows=Object.keys(outputs).map(function(resourceId){
      var coefficient=num(outputs[resourceId]),capacity=num(preview.requestedDailyCapacity),
        projected=coefficient===null||capacity===null?null:Number((coefficient*capacity*30).toFixed(6)),
        domestic=domesticByResource[token(resourceId)]||{},
        international=internationalByResource[token(resourceId)]||{},
        domesticPrice=scenarioPrice(proposal.countryId,resourceId,'DOMESTIC',marketApi),
        internationalPrice=scenarioPrice(proposal.countryId,resourceId,'INTERNATIONAL',marketApi),
        domesticDemandQuantity=num(domestic.unmetDomesticDemand30Day),
        exportDemandQuantity=num(international.globalUnmatchedBuyOrderDepth),
        domesticSaleQuantity=projected===null||domesticDemandQuantity===null?null:
          Math.min(projected,Math.max(0,domesticDemandQuantity)),
        exportSaleQuantity=projected===null||exportDemandQuantity===null?null:
          Math.min(projected,Math.max(0,exportDemandQuantity)),
        domesticRevenue=domesticSaleQuantity===null?null:domesticSaleQuantity<=0?0:
          domesticPrice.unitPrice===null?null:Number((domesticSaleQuantity*domesticPrice.unitPrice).toFixed(2)),
        exportRevenue=exportSaleQuantity===null?null:exportSaleQuantity<=0?0:
          internationalPrice.unitPrice===null?null:Number((exportSaleQuantity*internationalPrice.unitPrice).toFixed(2));
      return{resourceId:resourceId,projected30DayQuantity:projected,
        domesticUnmetDemand30Day:domesticDemandQuantity,domesticSaleQuantity:domesticSaleQuantity,
        domesticUnitPrice:domesticPrice.unitPrice,domesticPriceSource:domesticPrice.source,
        domesticCurrency:domesticPrice.currency,domesticGrossRevenue:domesticRevenue,
        internationalUnmatchedBuyOrderDepth:exportDemandQuantity,exportSaleQuantity:exportSaleQuantity,
        internationalUnitPrice:internationalPrice.unitPrice,internationalPriceSource:internationalPrice.source,
        internationalCurrency:internationalPrice.currency,internationalGrossRevenue:exportRevenue,
        internationalDemandSupplyGap:num(international.unmatchedDemandSupplyGap),
        internationalDemandSupplyStatus:international.demandSupplyStatus||'UNOBSERVED',
        marketTurn:international.marketTurn??domestic.marketTurn,
        demandEvidenceStatus:domestic.status||'UNOBSERVED'};
    });
    var inputRows=(preview.inputRequirements||[]).map(function(row){
      var required=num(row.forecast30Day),available=num(row.available),
        domesticQuantity=required===null||available===null?null:Math.min(required,Math.max(0,available)),
        importQuantity=required===null||available===null?null:Math.max(0,required-domesticQuantity),
        domesticPrice=scenarioPrice(proposal.countryId,row.resourceId,'DOMESTIC',marketApi),
        importPrice=scenarioPrice(proposal.countryId,row.resourceId,'INTERNATIONAL',marketApi),
        domesticCost=domesticQuantity===null?null:domesticQuantity<=0?0:
          domesticPrice.unitPrice===null?null:Number((domesticQuantity*domesticPrice.unitPrice).toFixed(2)),
        importCommodityCost=importQuantity===null?null:importQuantity<=0?0:
          importPrice.unitPrice===null?null:Number((importQuantity*importPrice.unitPrice).toFixed(2)),
        totalSourced=required===null||domesticQuantity===null||importQuantity===null?null:domesticQuantity+importQuantity;
      return{resourceId:row.resourceId,required30Day:required,domesticAvailable:available,
        domesticQuantity:domesticQuantity,importQuantity:importQuantity,
        domesticUnitPrice:domesticPrice.unitPrice,domesticPriceSource:domesticPrice.source,
        domesticCurrency:domesticPrice.currency,domesticCost:domesticCost,
        importUnitPrice:importPrice.unitPrice,importPriceSource:importPrice.source,
        importCurrency:importPrice.currency,importCommodityCost:importCommodityCost,
        domesticSharePct:totalSourced===null||totalSourced<=0?null:Number((domesticQuantity/totalSourced*100).toFixed(2)),
        importSharePct:totalSourced===null||totalSourced<=0?null:Number((importQuantity/totalSourced*100).toFixed(2)),
        importLandedCost:null,
        importLandedCostStatus:importQuantity===null?'UNOBSERVED':
          importQuantity>0?'FREIGHT_TARIFF_AND_INSURANCE_UNOBSERVED':'NOT_REQUIRED',
        sourcingDecision:domesticQuantity===null?'SOURCE_AVAILABILITY_UNOBSERVED':
          importQuantity>0&&domesticQuantity>0?'DOMESTIC_PLUS_IMPORTED_INPUTS':
          importQuantity>0?'IMPORTED_INPUTS':'DOMESTIC_INPUTS_ONLY'};
    });
    function revenueTotal(rows,key){
      if(!rows.length||rows.some(function(row){return row[key]===null;}))return null;
      return Number(rows.reduce(function(sum,row){return sum+row[key];},0).toFixed(2));
    }
    function currencyOf(rows,key){
      var values=Array.from(new Set(rows.map(function(row){return row[key];}).filter(Boolean)));
      return values.length===1?values[0]:null;
    }
    var domesticRevenue=revenueTotal(outputRows,'domesticGrossRevenue'),
      exportRevenue=revenueTotal(outputRows,'internationalGrossRevenue'),
      domesticCurrency=currencyOf(outputRows,'domesticCurrency'),
      exportCurrency=currencyOf(outputRows,'internationalCurrency'),
      domesticDemandComplete=outputRows.length>0&&outputRows.every(function(row){
        return row.domesticSaleQuantity!==null;
      }),
      exportDemandComplete=outputRows.length>0&&outputRows.every(function(row){
        return row.exportSaleQuantity!==null;
      }),
      domesticInputsFeasible=inputRows.length>0&&inputRows.every(function(row){
        return row.domesticQuantity!==null&&row.importQuantity===0;
      }),
      inputQuantitiesKnown=inputRows.length>0&&inputRows.every(function(row){
        return row.domesticQuantity!==null&&row.importQuantity!==null;
      }),
      domesticCostsComplete=inputRows.length>0&&inputRows.every(function(row){
        return row.domesticQuantity===0||row.domesticCost!==null;
      }),
      allCommodityCostsComplete=inputRows.length>0&&inputRows.every(function(row){
        return row.domesticCost!==null&&row.importCommodityCost!==null;
      }),
      domesticInputCost=domesticCostsComplete?Number(inputRows.reduce(function(sum,row){
        return sum+(row.domesticCost||0);
      },0).toFixed(2)):null,
      combinedCommodityCost=allCommodityCostsComplete?Number(inputRows.reduce(function(sum,row){
        return sum+(row.domesticCost||0)+(row.importCommodityCost||0);
      },0).toFixed(2)):null,
      policy=companyOperatingCostPolicy(proposal.countryId),
      policyCurrency=String(policy.currency||'').trim(),
      operating=num(assessment&&assessment.financialForecast&&assessment.financialForecast.operatingCostEstimate),
      domesticCurrencyConsistent=!!domesticCurrency&&!!policyCurrency&&domesticCurrency===policyCurrency&&
        inputRows.every(function(row){return row.domesticQuantity===0||row.domesticCurrency===policyCurrency;}),
      exportCurrencyConsistent=!!exportCurrency&&!!policyCurrency&&exportCurrency===policyCurrency&&
        inputRows.every(function(row){
          return (row.domesticQuantity===0||row.domesticCurrency===policyCurrency)&&
            (row.importQuantity===0||row.importCurrency===policyCurrency);
        }),
      domesticCalculated=domesticDemandComplete&&domesticInputsFeasible&&domesticCostsComplete&&
        domesticRevenue!==null&&operating!==null&&domesticCurrencyConsistent,
      domesticInputExportCalculated=exportDemandComplete&&domesticInputsFeasible&&domesticCostsComplete&&
        exportRevenue!==null&&operating!==null&&exportCurrencyConsistent,
      importedInputExportCalculated=exportDemandComplete&&inputQuantitiesKnown&&allCommodityCostsComplete&&
        exportRevenue!==null&&operating!==null&&exportCurrencyConsistent,
      domesticNet=domesticCalculated?Number((domesticRevenue-domesticInputCost-operating).toFixed(2)):null,
      domesticInputExportNet=domesticInputExportCalculated
        ?Number((exportRevenue-domesticInputCost-operating).toFixed(2)):null,
      importedInputExportNet=importedInputExportCalculated
        ?Number((exportRevenue-combinedCommodityCost-operating).toFixed(2)):null,
      domesticMargin=domesticNet!==null&&domesticRevenue>0?Number((domesticNet/domesticRevenue*100).toFixed(2)):null,
      domesticLossMargin=domesticMargin===null?null:Math.max(0,Number((-domesticMargin).toFixed(2))),
      domesticExportMargin=domesticInputExportNet!==null&&exportRevenue>0
        ?Number((domesticInputExportNet/exportRevenue*100).toFixed(2)):null,
      importedPreLandedMargin=importedInputExportNet!==null&&exportRevenue>0
        ?Number((importedInputExportNet/exportRevenue*100).toFixed(2)):null,
      importsUsed=inputRows.some(function(row){return num(row.importQuantity)>0;});
    return{
      horizonDays:30,currency:policyCurrency||null,outputs:outputRows,inputs:inputRows,
      domesticProduction:{status:domesticCalculated?'CALCULATED':
          !domesticDemandComplete?'DOMESTIC_DEMAND_OR_PRICE_UNOBSERVED':
          !domesticInputsFeasible?'DOMESTIC_INPUT_SUPPLY_INSUFFICIENT_OR_UNOBSERVED':
          'INCOMPLETE_DOMESTIC_COST_OR_CURRENCY_DATA',
        grossSalesCeiling:domesticRevenue,domesticInputCost:domesticInputCost,operatingCost:operating,
        netOperatingResult:domesticNet,profitMarginPct:domesticMargin,lossMarginPct:domesticLossMargin,
        resultType:domesticNet===null?'UNRESOLVED':domesticNet>=0?'PROFIT_ON_OBSERVED_DOMESTIC_DEMAND':'LOSS_ON_OBSERVED_DOMESTIC_DEMAND'},
      domesticInputExport:{status:domesticInputExportCalculated?'CALCULATED':
          !exportDemandComplete?'INTERNATIONAL_DEMAND_OR_PRICE_UNOBSERVED':
          !domesticInputsFeasible?'DOMESTIC_INPUT_SUPPLY_INSUFFICIENT_OR_UNOBSERVED':
          'INCOMPLETE_EXPORT_COST_OR_CURRENCY_DATA',
        grossExportRevenue:exportRevenue,domesticInputCost:domesticInputCost,operatingCost:operating,
        netOperatingResult:domesticInputExportNet,profitMarginPct:domesticExportMargin},
      importedInputProduction:{status:!importsUsed?'NO_IMPORT_REQUIRED':
          importedInputExportCalculated?'COMMODITY_COST_ONLY_LANDED_COST_UNOBSERVED':
          'INTERNATIONAL_DEMAND_INPUT_PRICE_OR_LANDED_COST_UNOBSERVED',
        grossExportRevenue:exportRevenue,domesticInputCost:inputRows.some(function(row){return row.domesticCost===null;})?null:
          Number(inputRows.reduce(function(sum,row){return sum+(row.domesticCost||0);},0).toFixed(2)),
        importedCommodityCost:inputRows.some(function(row){return row.importCommodityCost===null;})?null:
          Number(inputRows.reduce(function(sum,row){return sum+(row.importCommodityCost||0);},0).toFixed(2)),
        freightTariffInsuranceCost:null,landedImportCost:null,
        netBeforeLandedImportCosts:importedInputExportNet,
        preLandedMarginCeilingPct:importedPreLandedMargin,
        actualProfitOrLoss:null,actualProfitMarginPct:null,
        limitation:'Imported input prices require current cleared international trades. Freight, insurance, tariff, route and delivery charges remain unobserved, so final landed-cost profit/loss is unresolved.'},
      authority:'RUNTIME_COMPANY_MARKET_AND_COST_EVIDENCE',
      limitation:'Domestic sales are capped by observed unmet national demand. Export sales are capped by the current unmatched international buyer order book. Neither is a sales contract. Missing values remain null.'
    };
  }
  function submitCompanyMarketResearchRequest(proposal){
    var c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType],
      recipe=recipeFor(proposal.factoryType,profile,proposal.processingResourceId),
      outputIds=recipe&&obj(recipe.outputs)?Object.keys(recipe.outputs):[],
      inputRows=Array.isArray(proposal.expectedInputRequirements)?proposal.expectedInputRequirements:[],
      inputIds=inputRows.map(function(row){return row.resourceId;}).filter(Boolean),
      requestId='PE-MARKET-RESEARCH:'+proposal.proposalId,
      marketApi=g.Omega&&(g.Omega.GlobalMarket||g.Omega.globalMarket)||g.OmegaGlobalMarket||null,
      requestedCapacity=num(profile&&profile.defaultCapacityPerDay)===null?null:
        num(profile.defaultCapacityPerDay)*Math.max(1,num(proposal.quantity)||1),
      outputRequirements=outputIds.map(function(resourceId){
        var coefficient=num(recipe.outputs[resourceId]),
          projected=coefficient===null||requestedCapacity===null?null:
            Number((coefficient*requestedCapacity*30).toFixed(6)),
          demand=currentDomesticDemandEvidence(proposal.countryId,resourceId),
          supply=currentDomesticOutputEvidence(proposal.countryId,resourceId),
          stock=currentProcessedStockEvidence(proposal.countryId,resourceId),
          demand30=demand.status==='CURRENT_TURN'?demand.demandPerDay*30:null,
          supply30=(supply.status==='OBSERVED_ACTIVE_FACTORY_OUTPUT'||supply.status==='NO_ACTIVE_OUTPUT_RECORDS')&&supply.existingOutputPerDay!==null?supply.existingOutputPerDay*30:null,
          unmet=demand30===null||supply30===null||stock.free===null?null:
            Math.max(0,demand30-supply30-stock.free),
          market=currentMarketEvidence(proposal.countryId,resourceId,marketApi);
        return{resourceId:resourceId,projectedProduction30Day:projected,
          unmetDomesticDemand30Day:unmet,
          globalUnmatchedBuyOrderDepth:market.currentTurn?market.globalUnmatchedBidDepth:null,
          globalUnmatchedSellOfferDepth:market.currentTurn?market.globalUnmatchedAskDepth:null,
          domesticDemandEvidenceStatus:demand.status,
          domesticOutputEvidenceStatus:supply.status,
          processedStockEvidenceStatus:stock.status,
          internationalMarketEvidenceStatus:market.currentTurn?'CURRENT_TURN':'UNOBSERVED_OR_STALE',
          marketTurn:market.generatedTurn};
      }),
      inputRequirements=inputRows.map(function(row){
        var required=num(row.forecast30Day),available=num(row.available),
          gap=required===null||available===null?null:Math.max(0,required-Math.max(0,available)),
          market=currentMarketEvidence(proposal.countryId,row.resourceId,marketApi);
        return{resourceId:row.resourceId,requiredQuantity30Day:required,
          domesticUncommittedAvailable:available,expectedImportQuantity:gap,
          matchedRawMaterialExportsFromCountry:market.currentTurn?market.matchedExportsFromCountry:null,
          demandEvidenceStatus:row.demandStatus||'UNOBSERVED',
          internationalMarketEvidenceStatus:market.currentTurn?'CURRENT_TURN':'UNOBSERVED_OR_STALE',
          sourcingDecision:gap===null?'SOURCE_AVAILABILITY_UNOBSERVED':
            gap>0&&available>0?'DOMESTIC_PLUS_IMPORTED_INPUTS':
            gap>0?'IMPORTED_INPUTS':'DOMESTIC_INPUTS_ONLY'};
      }),
      payload={requestId:requestId,companyId:proposal.companyId,companyName:proposal.companyName,
        factoryType:proposal.factoryType,factoryCount:proposal.quantity,
        outputResources:outputIds,inputResources:inputIds,
        outputRequirements:outputRequirements,inputRequirements:inputRequirements,
        plannedDailyCapacity:requestedCapacity,marketScopes:['DOMESTIC','INTERNATIONAL'],
        analysisHorizonDays:30,
        requestPurpose:'Assess quantities for domestic unmet demand, domestic input supply and raw-material export-processing opportunities, plus international buyer demand, seller depth and import sourcing.'},
      result=null,status='QUEUED_LOCAL_MARKET_HANDOFF';
    try{
      if(marketApi&&typeof marketApi.requestCompanyResearch==='function'){
        result=marketApi.requestCompanyResearch(proposal.countryId,payload);
        if(result&&(result.accepted===true||result.duplicate===true))status='SUBMITTED_TO_GLOBAL_MARKET';
      }
    }catch(error){result={accepted:false,reason:String(error&&error.message||error)};}
    var row={requestId:requestId,proposalId:proposal.proposalId,companyId:proposal.companyId,
      countryId:proposal.countryId,submittedTurn:turn(),status:status,
      responseStatus:'AWAITING_MARKET_EVIDENCE',request:payload,
      marketQueueResult:clone(result||null),
      dataPolicy:'QUANTITIES_ARE_RUNTIME_FORECASTS;MISSING_MARKET_EVIDENCE_REMAINS_NULL'};
    var r=runtime(proposal.countryId,true);
    if(r){
      if(!Array.isArray(r.marketResearchRequests))r.marketResearchRequests=[];
      var existing=r.marketResearchRequests.find(function(item){return item&&item.requestId===requestId;});
      if(!existing){r.marketResearchRequests.push(row);if(r.marketResearchRequests.length>MAX_PROPOSALS*2)r.marketResearchRequests.splice(0,r.marketResearchRequests.length-MAX_PROPOSALS*2);}
      else row=existing;
    }
    proposal.marketResearchRequestId=requestId;
    proposal.marketResearchRequest=clone(row);
    if(proposal.companyCase&&proposal.companyCase.marketAnalysis)
      proposal.companyCase.marketAnalysis.researchRequest=clone(row);
    recordEvent(proposal.countryId,'COMPANY_MARKET_RESEARCH_REQUEST_SUBMITTED',{
      proposalId:proposal.proposalId,requestId:requestId,companyId:proposal.companyId,marketStatus:status});
    try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')
      g.dispatchEvent(new g.CustomEvent('OMEGA_COMPANY_MARKET_RESEARCH_REQUESTED',{detail:clone(row)}));}catch(_){}
    return clone(row);
  }
  function proposalDecisionAssessment(proposal,preview){
    preview=preview||previewFor(proposal);
    var c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType],
      recipe=recipeFor(proposal.factoryType,profile,proposal.processingResourceId),
      dailyCapacity=num(preview.requestedDailyCapacity),horizonDays=30,trade=countryBucket('trade',proposal.countryId,false)||{};
    var outputs=recipe&&obj(recipe.outputs)?recipe.outputs:{},outputRows=Object.keys(outputs).map(function(resourceId){
      var perUnit=num(outputs[resourceId]),quantity=perUnit===null||dailyCapacity===null?null:perUnit*dailyCapacity*horizonDays,
        price=observedMarketPrice(proposal.countryId,resourceId);
      return{resourceId:resourceId,perUnit:perUnit,projectedQuantity:quantity,marketPrice:price};
    });
    var inputs=(preview.inputRequirements||[]).map(function(row){
      var price=observedMarketPrice(proposal.countryId,row.resourceId);
      return{resourceId:row.resourceId,projectedQuantity:num(row.forecast30Day),marketPrice:price,
        projectedCost:price&&num(row.forecast30Day)!==null?Number((price.unitPrice*row.forecast30Day).toFixed(2)):null};
    });
    var outputPricesComplete=outputRows.length>0&&outputRows.every(function(row){return row.marketPrice&&row.projectedQuantity!==null;});
    var inputPricesComplete=inputs.length>0&&inputs.every(function(row){return row.marketPrice&&row.projectedCost!==null;});
    var currencies=[];outputRows.concat(inputs).forEach(function(row){if(row.marketPrice&&row.marketPrice.currency)currencies.push(row.marketPrice.currency);});
    var uniqueCurrencies=Array.from(new Set(currencies)),currencyConsistent=uniqueCurrencies.length<=1&&
      (!uniqueCurrencies.length||!trade.currencyCode&&!trade.currency||uniqueCurrencies[0]===String(trade.currencyCode||trade.currency));
    var grossSalesCeiling=outputPricesComplete&&currencyConsistent
      ?Number(outputRows.reduce(function(total,row){return total+row.projectedQuantity*row.marketPrice.unitPrice;},0).toFixed(2)):null;
    var inputCostEstimate=inputPricesComplete&&currencyConsistent
      ?Number(inputs.reduce(function(total,row){return total+row.projectedCost;},0).toFixed(2)):null;
    var costPolicy=companyOperatingCostPolicy(proposal.countryId),rates=costPolicy.rates||{},utilities=profile&&profile.utilities||{},workforce=profile&&profile.workforce||{};
    var coreCrew=num(profile&&profile.employment&&profile.employment.coreOperatingCrew);
    if(coreCrew===null)coreCrew=(num(workforce.operators)||0)+(num(workforce.engineers)||0);
    var costBases={electricityPerMWh:(num(utilities.electricityMWhPerDay)||0)*proposal.quantity*horizonDays,
      waterPerM3:(num(utilities.waterM3PerDay)||0)*proposal.quantity*horizonDays,
      laborPerWorkerDay:Math.max(0,coreCrew||0)*proposal.quantity*horizonDays,
      maintenancePerFactoryDay:proposal.quantity*horizonDays,
      overheadPerFactoryDay:proposal.quantity*horizonDays,
      depreciationPerFactoryDay:proposal.quantity*horizonDays};
    var costRows=[],missingCostRates=[];
    Object.keys(costBases).forEach(function(key){
      var basis=costBases[key],rate=num(rates[key]);
      if(basis<=0)return;
      if(rate===null){missingCostRates.push(key);return;}
      costRows.push({category:key,basis:basis,rate:rate,amount:Number((basis*rate).toFixed(2)),currency:costPolicy.currency||null});
    });
    var operatingCostEstimate=missingCostRates.length===0
      ?Number(costRows.reduce(function(total,row){return total+row.amount;},0).toFixed(2)):null;
    var policyCurrency=String(costPolicy.currency||'').trim(),marketCurrency=uniqueCurrencies.length===1?uniqueCurrencies[0]:null;
    var costCurrencyMatches=!!policyCurrency&&!!marketCurrency&&policyCurrency===marketCurrency;
    var allFinancialInputsObserved=grossSalesCeiling!==null&&inputCostEstimate!==null&&operatingCostEstimate!==null&&costCurrencyMatches;
    var operational=preview.operationalReadiness||{},shortageCount=(preview.shortages||[]).length+
      (operational.requirements||[]).filter(function(row){return row.status==='SHORTFALL';}).length;
    var unknownCount=(preview.unobservedInputs||[]).length+
      (operational.requirements||[]).filter(function(row){return row.status==='UNOBSERVED';}).length;
    var riskFlags=[];
    if(shortageCount)riskFlags.push({severity:'HIGH',code:'INPUT_OR_UTILITY_SHORTFALL',count:shortageCount});
    if(unknownCount)riskFlags.push({severity:'UNRESOLVED',code:'UNOBSERVED_INPUT_OR_UTILITY_DATA',count:unknownCount});
    if(!outputPricesComplete)riskFlags.push({severity:'UNRESOLVED',code:'OUTPUT_MARKET_PRICE_UNOBSERVED'});
    if(!inputPricesComplete)riskFlags.push({severity:'UNRESOLVED',code:'INPUT_MARKET_PRICE_UNOBSERVED'});
    if(missingCostRates.length)riskFlags.push({severity:'UNRESOLVED',code:'OPERATING_COST_POLICY_INCOMPLETE',missingRates:missingCostRates});
    if(!costCurrencyMatches)riskFlags.push({severity:'UNRESOLVED',code:'FINANCIAL_CURRENCY_NOT_RECONCILED'});
    riskFlags.push({severity:'CONDITIONAL',code:'CUSTOMER_DEMAND_AND_SETTLED_SALES_NOT_GUARANTEED'});
    var riskStatus=shortageCount?'HIGH_RISK':unknownCount||riskFlags.length>1?'UNRESOLVED':'CONDITIONAL';
    return{
      status:'REVIEW_REQUIRED',horizonDays:horizonDays,reviewTurn:turn(),riskStatus:riskStatus,riskFlags:riskFlags,
      applicant:{requestReason:proposal.requestReason,expectedBenefit:proposal.expectedBenefit,riskForecast:proposal.riskForecast},
      capacity:{dailyProcessingCapacity:dailyCapacity,projected30DayProcessingCapacity:dailyCapacity===null?null:Number((dailyCapacity*horizonDays).toFixed(2)),
        authority:'CANONICAL_FACTORY_PROFILE_CAPACITY_NOT_A_SALES_COMMITMENT'},
      inputForecast:inputs,outputForecast:outputRows,
      financialForecast:{status:allFinancialInputsObserved?'CAPACITY_CEILING_ONLY':'INCOMPLETE_OBSERVATIONS',
        currency:costCurrencyMatches?policyCurrency:null,
        grossSalesCeilingAtFullSellThrough:grossSalesCeiling,
        inputPurchaseCostEstimate:inputCostEstimate,operatingCostEstimate:operatingCostEstimate,
        netOperatingResultAtFullSellThrough:allFinancialInputsObserved?Number((grossSalesCeiling-inputCostEstimate-operatingCostEstimate).toFixed(2)):null,
        netResultUnavailableReason:allFinancialInputsObserved?null:'Requires observed output/input prices, confirmed shared currency, and every applicable explicit operating-cost rate. A capacity ceiling is not confirmed customer sales.'},
      operationalReadiness:{status:operational.status||'UNOBSERVED',requirements:clone(operational.requirements||[]),
        shortages:clone(preview.shortages||[]),unobservedInputs:clone(preview.unobservedInputs||[]),
        maximumSafeDomesticFactoryQuantity:preview.maximumSafeDomesticFactoryQuantity},
      capitalExposure:{required:proposal.capitalRequired,currency:proposal.capitalUnit,authority:'CANONICAL_FACTORY_CONSTRUCTION_QUOTE'},
      authority:'OMEGA_PRIVATE_ENTERPRISE_APPROVAL_ASSESSMENT_V1',simulationOnly:true
    };
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
    var cid=proposal.countryId,resourceSnapshot=resourceReadSnapshot(cid),
      base=baseline(cid),c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType],
      recipe=recipeFor(proposal.factoryType,profile,proposal.processingResourceId);
    if(!base||base.status!=='READY')return{status:'BLOCKED',reason:'PRIVATE_AND_GOVERNMENT_BASELINES_NOT_READY'};
    if(!profile||!recipe)return{status:'BLOCKED',reason:'CANONICAL_FACTORY_PROFILE_OR_RECIPE_UNAVAILABLE'};
    var governmentCount=num(base.governmentFactoryCounts&&base.governmentFactoryCounts[proposal.factoryType])||0;
    var openingPrivate=num(base.factoryCounts&&base.factoryCounts[proposal.factoryType])||0;
    var livePrivate=privateAssets(cid).filter(function(a){return id(a.factoryType||a.type)===proposal.factoryType;}).length;
    var maximumPrivate=Math.floor(governmentCount*.60+1e-9);
    var maxAdditional=Math.max(0,maximumPrivate-openingPrivate-livePrivate);
    var inputs=inputForecast(cid,profile,recipe,proposal.quantity,resourceSnapshot);
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
      countryId:cid,factoryType:proposal.factoryType,processingResourceId:proposal.processingResourceId||null,requestedQuantity:proposal.quantity,
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
  function companyBusinessCase(proposal){
    var preview=previewFor(proposal),assessment=proposalDecisionAssessment(proposal,preview),
      profile=(catalog()||{}).factoryProfiles&&catalog().factoryProfiles[proposal.factoryType],
      marketSource=g.Omega&&(g.Omega.GlobalMarket||g.Omega.globalMarket)||g.OmegaGlobalMarket||null,
      marketQuoteCache=Object.create(null),marketApi=marketSource?Object.create(null):null,
      account=capitalAccount(proposal.countryId,proposal.companyId,false),
      cash=account?num(account.availableBalance):null,required=num(proposal.capitalRequired),
      inputs=(preview.inputRequirements||[]).map(function(row){
        var need=num(row.forecast30Day),available=num(row.available),covered=need!==null&&available!==null&&available+1e-9>=need,
          shortfall=need===null||available===null?null:Math.max(0,need-available),suppliers=[],privateSuppliers=[];
        if(shortfall!==null&&shortfall>1e-9&&marketApi){
          try{if(typeof marketApi.suppliers==='function'){var found=marketApi.suppliers(row.resourceId,shortfall,proposal.countryId);suppliers=Array.isArray(found)?found:[];}}catch(_){}
          try{if(typeof marketApi.privateCompanySuppliers==='function'){var privateFound=marketApi.privateCompanySuppliers(row.resourceId,shortfall,proposal.countryId);privateSuppliers=Array.isArray(privateFound)?privateFound:[];}}catch(_){}
        }
        return{resourceId:row.resourceId,required30Day:need,domesticUncommittedAvailable:available,
          currentDemandPerDay:num(row.nationalDemandPerDay),shortfall:shortfall,
          domesticCoverage:covered?'COVERED':shortfall===null?'UNVERIFIED':'SHORTFALL',
          potentialExternalSuppliers:suppliers.slice(0,5).map(function(x){return{
            countryId:x.countryId,available:num(x.available),status:'POTENTIAL_NOT_CONTRACTED',
            authority:x.authority||'EXTERNAL_MARKET_AVAILABILITY'};}),
          potentialPrivateCompanySuppliers:privateSuppliers.slice(0,5).map(function(x){return{
            countryId:x.countryId,companyId:x.companyId,companyName:x.companyName,available:num(x.available),
            sourceBatchIds:clone(x.sourceBatchIds||[]),sourceFactoryIds:clone(x.sourceFactoryIds||[]),
            status:'POTENTIAL_NOT_CONTRACTED',authority:x.authority||'EXACT_PRIVATE_BATCH_AND_WAREHOUSE_STOCK'};})
          };
      }),
      outputs=(assessment.outputForecast||[]).map(function(row){
        var quote=null;
        try{if(marketApi&&typeof marketApi.quote==='function')quote=marketApi.quote(row.resourceId);}catch(_){}
        quote=quote||{};
        var marketSnapshotCurrent=num(quote.generatedTurn)===turn(),
          cleared=marketSnapshotCurrent&&String(quote.status||'').toUpperCase()==='CLEARED'&&
          String(quote.priceDiscovery||'').toUpperCase()==='ORDER_BOOK_CROSSING'&&num(quote.clearingPriceUsd)!==null;
        return{resourceId:row.resourceId,projected30DayQuantity:num(row.projectedQuantity),
          localMarketPrice:clone(row.marketPrice||null),marketStatus:quote.status||'UNAVAILABLE',
          marketGeneratedTurn:num(quote.generatedTurn),marketSnapshotCurrent:marketSnapshotCurrent,
          priceDiscovery:quote.priceDiscovery||'UNAVAILABLE',clearingPriceUsd:cleared?num(quote.clearingPriceUsd):null,
          referencePriceUsd:num(quote.referencePriceUsd===undefined?quote.referencePrice:quote.referencePriceUsd),
          bestBidUsd:num(quote.bestBidUsd),bestAskUsd:num(quote.bestAskUsd),
          matchedQuantity:num(quote.matchedQuantity),bidDepth:num(quote.bidDepth),askDepth:num(quote.askDepth),
          evidenceStatus:!marketSnapshotCurrent?'STALE_OR_UNVERIFIED_MARKET_SNAPSHOT':cleared?'VERIFIED_CURRENT_TURN_ORDER_BOOK_CLEARING':
            quote.referencePrice!==undefined&&quote.referencePrice!==null?'REFERENCE_ONLY_NOT_A_SETTLED_MARKET_PRICE':'MARKET_PRICE_UNVERIFIED'};
      }),
      allDomesticCovered=inputs.length>0&&inputs.every(function(row){return row.domesticCoverage==='COVERED';}),
      allInputsObserved=inputs.length>0&&inputs.every(function(row){return row.domesticCoverage!=='UNVERIFIED';}),
      fundingGap=cash===null||required===null?null:Math.max(0,required-cash),
      defaultPreference=cash!==null&&required!==null&&cash+1e-9>=required?'PRIVATE_COMPANY_CAPITAL':
        proposal.stateSupportRequested?'GOVERNMENT_GRANT_REQUEST':'PRIVATE_SHAREHOLDERS_OR_CORPORATE_FINANCE',
      preference=String(proposal.financingPreference||defaultPreference).toUpperCase(),
      workforce=proposal.workforcePerFactory||{},
      jobs=Object.keys(workforce).reduce(function(sum,key){return sum+Math.max(0,num(workforce[key])||0);},0)*proposal.quantity,
      opportunityAnalysis=companyMarketOpportunityAnalysis(proposal,outputs,inputs,marketApi),
      unitEconomics=companyUnitEconomics(proposal,preview,assessment,marketApi),
      partnerEquityRequested=['PRIVATE_SHAREHOLDERS','JOINT_VENTURE','PRIVATE_EQUITY','PRIVATE_SHAREHOLDERS_OR_CORPORATE_FINANCE'].indexOf(preference)>=0,
      requestedPartnerShareBps=num(proposal.requestedPrivateShareholdingBps)??
        (partnerEquityRequested&&fundingGap!==null&&required!==null&&required>0?
          Math.max(0,Math.min(10000,Math.round(fundingGap/required*10000))):null),
      affordableFactoryUnits=num(profile&&profile.constructionCost)===null||cash===null?null:
        Math.max(0,Math.floor((cash+1e-9)/num(profile.constructionCost)));
    if(marketApi){
      marketApi.quote=function(resourceId){
        var key=token(resourceId);
        if(!Object.prototype.hasOwnProperty.call(marketQuoteCache,key)){
          try{marketQuoteCache[key]=typeof marketSource.quote==='function'
            ?marketSource.quote(resourceId)||{}:{};}catch(_){marketQuoteCache[key]={};}
        }
        return marketQuoteCache[key];
      };
      ['localPrice','suppliers','privateCompanySuppliers'].forEach(function(method){
        if(typeof marketSource[method]==='function')
          marketApi[method]=function(){return marketSource[method].apply(marketSource,arguments);};
      });
    }
    var maximumAdditionalUnits=num(preview.maximumAdditionalUnits),
      expansionLimit=maximumAdditionalUnits===null?null:Math.min(MAX_PROJECTS_PER_PROPOSAL,Math.max(0,Math.floor(maximumAdditionalUnits))),
      constructionCostPerFactory=num(profile&&profile.constructionCost),scaleQuantities=[];
    function addScaleQuantity(value){
      var quantity=num(value);
      if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>MAX_PROJECTS_PER_PROPOSAL||
         expansionLimit===null||quantity>expansionLimit||scaleQuantities.indexOf(quantity)>=0)return;
      scaleQuantities.push(quantity);
    }
    addScaleQuantity(1);
    addScaleQuantity(Math.floor((num(proposal.quantity)||1)/2));
    addScaleQuantity(proposal.quantity);
    addScaleQuantity(affordableFactoryUnits===null?null:Math.min(expansionLimit,affordableFactoryUnits));
    addScaleQuantity(expansionLimit);
    scaleQuantities.sort(function(a,b){return a-b;});
    var scaleAlternatives=scaleQuantities.map(function(quantity){
      var capital=constructionCostPerFactory===null?null:Number((constructionCostPerFactory*quantity).toFixed(2)),
        gap=capital===null||cash===null?null:Math.max(0,Number((capital-cash).toFixed(2))),
        dailyCapacity=num(profile&&profile.defaultCapacityPerDay);
      return{factoryCount:quantity,
        dailyCapacityForecast:dailyCapacity===null?null:Number((dailyCapacity*quantity).toFixed(6)),
        thirtyDayCapacityCeiling:dailyCapacity===null?null:Number((dailyCapacity*quantity*30).toFixed(6)),
        constructionCapitalRequired:capital,companyCashAvailable:cash,fundingGap:gap,
        canSelfFinance:capital===null||cash===null?null:cash+1e-9>=capital,
        withinCurrentExpansionCeiling:true,selected:quantity===num(proposal.quantity),
        authority:'CANONICAL_FACTORY_PROFILE_AND_RECORDED_COMPANY_CAPITAL'};
    });
    var equitySharePct=requestedPartnerShareBps===null?null:Number((requestedPartnerShareBps/100).toFixed(2)),
      grantRequest=proposal.stateSupportRequested===true&&preference==='GOVERNMENT_GRANT'
        ?Math.min(fundingGap===null?(required||0):fundingGap,
          num(proposal.requestedGovernmentGrantAmount)===null?(fundingGap===null?(required||0):fundingGap):num(proposal.requestedGovernmentGrantAmount)):0,
      financingAlternatives=[
        {structure:'COMPANY_CAPITAL',status:cash===null||required===null?'UNOBSERVED':
          cash+1e-9>=required?'SUFFICIENT_RECORDED_CASH':'INSUFFICIENT_RECORDED_CASH',
          companyCashAvailable:cash,projectCapitalRequired:required,fundingGap:fundingGap},
        {structure:'PRIVATE_EQUITY_PARTNER',status:fundingGap===null?'UNOBSERVED':
          fundingGap>0?'PARTNER_AND_VALUATION_REQUIRED':'NOT_REQUIRED',
          requestedSharePct:equitySharePct,fundingGap:fundingGap,binding:false},
        {structure:'JOINT_VENTURE',status:'COUNTERPARTY_AND_SEPARATE_APPROVED_CHARTER_REQUIRED',
          binding:false},
        {structure:'CORPORATE_LOAN',status:'LENDER_CREDIT_CAPACITY_AND_INTEREST_TERMS_UNOBSERVED',
          requestedAmount:fundingGap,binding:false},
        {structure:'GOVERNMENT_GRANT',status:grantRequest>0?'REQUESTED_NOT_APPROVED':
          proposal.stateSupportRequested===true?'PUBLIC_SUPPORT_TYPE_NOT_A_GRANT':'NOT_REQUESTED',
          requestedAmount:grantRequest,binding:false},
        {structure:'PHASED_INVESTMENT',status:scaleAlternatives.length>1
          ?'ALTERNATIVE_SCALES_CALCULATED':'NO_ADDITIONAL_SCALE_VERIFIED',binding:false}
      ],
      domesticRows=opportunityAnalysis.domesticDemand||[],
      internationalRows=opportunityAnalysis.internationalDemand||[],
      exportRows=opportunityAnalysis.exportProcessingOpportunities||[],
      orderBookObserved=internationalRows.filter(function(row){return row.evidenceStatus==='CURRENT_TURN_ORDER_BOOK';}).length,
      domesticObserved=domesticRows.filter(function(row){
        return row.demandEvidenceStatus==='CURRENT_TURN'&&
          (row.outputEvidenceStatus==='OBSERVED_ACTIVE_FACTORY_OUTPUT'||row.outputEvidenceStatus==='NO_ACTIVE_OUTPUT_RECORDS')&&
          row.stockEvidenceStatus==='OBSERVED';
      }).length,
      exportObserved=exportRows.filter(function(row){
        return row.status==='CURRENT_TURN_DOMESTIC_RAW_EXPORTS_OBSERVED'||
          row.status==='NO_MATCHED_RAW_EXPORTS_IN_CURRENT_SNAPSHOT';
      }).length,
      inputAvailabilityObserved=inputs.filter(function(row){return row.domesticCoverage!=='UNVERIFIED';}).length,
      priceObserved=(unitEconomics.outputs||[]).filter(function(row){
        return row.domesticUnitPrice!==null||row.internationalUnitPrice!==null;
      }).length+(unitEconomics.inputs||[]).filter(function(row){
        return row.domesticUnitPrice!==null||row.importUnitPrice!==null;
      }).length,
      evidenceObserved=orderBookObserved+domesticObserved+exportObserved+inputAvailabilityObserved+priceObserved,
      evidenceTotal=internationalRows.length+domesticRows.length+exportRows.length+inputs.length+
        (unitEconomics.outputs||[]).length+(unitEconomics.inputs||[]).length,
      evidenceCoveragePct=evidenceTotal?Number((evidenceObserved/evidenceTotal*100).toFixed(2)):null,
      confidenceStatus=evidenceCoveragePct===null?'NO_EVIDENCE':evidenceCoveragePct>=75?'HIGH':
        evidenceCoveragePct>=40?'MODERATE':'LIMITED',
      dataConfidence={status:confidenceStatus,observedEvidenceCount:evidenceObserved,
        possibleEvidenceCount:evidenceTotal,coveragePct:evidenceCoveragePct,
        currentTurnOrderBook:{observed:orderBookObserved,total:internationalRows.length},
        domesticDemandAndSupply:{observed:domesticObserved,total:domesticRows.length},
        rawMaterialExportSignals:{observed:exportObserved,total:exportRows.length},
        inputAvailability:{observed:inputAvailabilityObserved,total:inputs.length},
        currentPriceObservations:{observed:priceObserved,
          total:(unitEconomics.outputs||[]).length+(unitEconomics.inputs||[]).length},
        policy:'DATA_COVERAGE_ONLY; UNKNOWN_EVIDENCE_IS_NOT_ZERO_AND_DOES_NOT_BLOCK_SUBMISSION'};
    return{
      schemaVersion:1,submittedBy:proposal.companyId,companyName:proposal.companyName,
      submittedTurn:proposal.createdTurn,proposalOrigin:proposal.proposalOrigin||'COMPANY_INITIATED',
      companyStatement:proposal.requestReason,expectedBenefit:proposal.expectedBenefit,riskStatement:proposal.riskForecast,
      projectOffer:{factoryType:proposal.factoryType,factoryName:proposal.factoryName,
        requestedFactoryCount:proposal.quantity,dailyCapacityForecast:num(preview.requestedDailyCapacity),
        thirtyDayCapacityCeiling:num(preview.requestedDailyCapacity)===null?null:Number((num(preview.requestedDailyCapacity)*30).toFixed(2)),
        constructionDurationDays:num(proposal.constructionDurationDays)??num(profile&&profile.constructionDays)??num(profile&&profile.buildDays),
        projectedCommissioningTurn:(num(proposal.constructionDurationDays)??num(profile&&profile.constructionDays)??num(profile&&profile.buildDays))===null
          ?null:turn()+(num(proposal.constructionDurationDays)??num(profile&&profile.constructionDays)??num(profile&&profile.buildDays)),
        operatingHorizonDays:num(proposal.operatingHorizonDays)??num(profile&&profile.operatingHorizonDays),
        workforceForecast:jobs,utilitiesPerFactory:clone(proposal.utilitiesPerFactory||{}),
        operatorCompanyId:proposal.operatorCompanyId||proposal.companyId},
      marketAnalysis:{horizonDays:30,outputs:outputs,
        domesticDemand:opportunityAnalysis.domesticDemand,
        internationalDemand:opportunityAnalysis.internationalDemand,
        exportProcessingOpportunities:opportunityAnalysis.exportProcessingOpportunities,
        demandStatus:'CUSTOMER_ORDERS_AND_SETTLED_SALES_NOT_GUARANTEED',
        authority:'LIVE_GLOBAL_ORDER_BOOK_AND_COUNTRY_TRADE_PRICE_WHERE_AVAILABLE',
        limitations:['A reference quote is not a cleared trade.','Production capacity is not customer demand.',
          'Only settled deliveries and paid sales establish realized revenue.']},
      supplyChainProof:{horizonDays:30,inputs:inputs,
        sourcingPolicy:proposal.sourcingPolicy,
        companyPlan:proposal.companyStrategy&&proposal.companyStrategy.supplyPlan||null,
        domesticCoverageStatus:allDomesticCovered?'ALL_INPUTS_COVERED_BY_CURRENT_DOMESTIC_SURPLUS':
          allInputsObserved?'DOMESTIC_SHORTFALL_POTENTIAL_IMPORTS_NOT_CONTRACTS':'INPUT_STOCK_OR_DEMAND_UNVERIFIED',
        domesticSurplusCouldCoverNeed:allDomesticCovered,
        securedAtSubmission:false,
        securedSupplyEvidenceStatus:'NO_SIGNED_CONTRACT_OR_RESERVED_SUPPLY_RECORD',
        externalSupplierStatus:'AVAILABILITY_IS_NOT_A_SIGNED_CONTRACT_OR_DELIVERY',
        authority:'CURRENT_TURN_UNCOMMITTED_DOMESTIC_STOCK_AND_AVAILABLE_EXTERNAL_SUPPLY'},
      financingOffer:{preferredStructure:preference,
        companyCapitalAccountStatus:account?'RECORDED_COMPANY_CAPITAL_ACCOUNT':'NO_VERIFIED_COMPANY_CAPITAL_ACCOUNT',
        companyCashAvailable:cash,companyCapitalOffer:cash===null||required===null?null:Math.min(cash,required),
        constructionCapitalRequired:required,fundingGap:fundingGap,
        privateShareholdingRequested:['PRIVATE_SHAREHOLDERS','JOINT_VENTURE','PRIVATE_EQUITY','PRIVATE_SHAREHOLDERS_OR_CORPORATE_FINANCE'].indexOf(preference)>=0,
        requestedExternalFundingAmount:fundingGap===null?required:fundingGap,
        fundingGapStatus:fundingGap===null?'COMPANY_CASH_UNOBSERVED_REQUIRES_DUE_DILIGENCE':'CALCULATED_FROM_RECORDED_COMPANY_CAPITAL',
        requestedGovernmentGrant:proposal.stateSupportRequested===true&&preference==='GOVERNMENT_GRANT'
          ?Math.min(fundingGap===null?(required||0):fundingGap,
            num(proposal.requestedGovernmentGrantAmount)===null?(fundingGap===null?(required||0):fundingGap):num(proposal.requestedGovernmentGrantAmount)):0,
        requestedGovernmentEquityBps:num(proposal.requestedGovernmentEquityBps),
        requestedLoanAmount:num(proposal.requestedLoanAmount),
        requestedLoanGuarantee:proposal.requestedLoanGuarantee===true,
        requestedLoanGuaranteeStatus:proposal.requestedLoanGuarantee===true?'REQUESTED_NOT_APPROVED':'NOT_REQUESTED',
        settlementStatus:'PROPOSAL_ONLY_NOT_SETTLED',
        requestedPrivateShareholdingBps:requestedPartnerShareBps,
        requestedPrivateShareholdingPct:requestedPartnerShareBps===null?null:Number((requestedPartnerShareBps/100).toFixed(2)),
        privateShareholdingBasis:requestedPartnerShareBps===null?'UNOBSERVED_OR_REQUIRES_COMPANY_TERMS':
          'FUNDING_GAP_AS_SHARE_OF_PROJECT_CAPITAL_NOT_ENTERPRISE_VALUATION',
        privateShareholdingTermsStatus:requestedPartnerShareBps===null?
          (partnerEquityRequested?'PERCENTAGE_UNOBSERVED_REQUIRES_BUDGET_OR_NEGOTIATION':'NOT_REQUESTED'):
          'INDICATIVE_PARTNER_SHARE_REQUIRES_VALUATION_AND_NEGOTIATION',
        companyCapitalBudget:{currency:account&&account.currency||proposal.capitalUnit||null,
          totalCapitalRaised:num(account&&account.capitalRaised),availableNow:cash,
          reservedCapital:num(account&&account.reservedBalance),capitalAlreadySpent:num(account&&account.capitalSpent),
          constructionCapitalRequired:required,fundingGap:fundingGap,
          maximumAffordableFactoryUnits:affordableFactoryUnits,
          canAffordRequestedProject:cash===null||required===null?null:cash+1e-9>=required,
          budgetEvidenceStatus:account?'RECORDED_COMPANY_CAPITAL_ACCOUNT':'COMPANY_BUDGET_UNOBSERVED'},
        limitation:'Private equity, loans, guarantees and public support are requests only until a matching verified Finance ledger settlement exists. An indicated financing percentage is not an enterprise valuation or binding ownership issue.'},
      companyExpectations:{governmentPermit:true,
        publicInfrastructureRequested:proposal.publicInfrastructureRequested===true,
        utilitySupportRequested:proposal.utilitySupportRequested===true,
        governmentOfftakeRequested:proposal.governmentOfftakeRequested===true,
        requestedConditions:clone(proposal.companyRequestedConditions||[]),
        supportRequestStatus:proposal.publicInfrastructureRequested||proposal.utilitySupportRequested||
          proposal.governmentOfftakeRequested?'COMPANY_REQUESTS_PUBLIC_SUPPORT':'NO_ADDITIONAL_PUBLIC_SUPPORT_REQUESTED'},
      unitEconomics:unitEconomics,
      investmentOptions:{proposedFactoryCount:proposal.quantity,
        maximumPolicyCompliantFactoryCount:expansionLimit,
        maximumAffordableFactoryCount:affordableFactoryUnits,
        maximumSelfFinancedFactoryCount:affordableFactoryUnits===null||expansionLimit===null?null:
          Math.min(affordableFactoryUnits,expansionLimit),
        scaleAlternatives:scaleAlternatives,financingAlternatives:financingAlternatives,
        selectedFinancingStructure:preference,
        requestedPrivateShareholdingPct:equitySharePct,
        authority:'RUNTIME_COMPANY_BUDGET_AND_CANONICAL_FACTORY_CAPITAL'},
      dataConfidence:dataConfidence,
      companyDecision:clone(proposal.companyStrategy||null),
      governmentInvitationId:proposal.governmentInvitationId||null,
      authority:'OMEGA_COMPANY_ORIGINATED_BUSINESS_CASE_V1',simulationOnly:true
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
    var currentCompanyStatus=(runtime(cid,false)||{}).companyStatuses||{};
    var companyStatus=String(currentCompanyStatus[company]||'ACTIVE').toUpperCase();
    if(['INSOLVENT','RESTRUCTURING','CLOSED'].indexOf(companyStatus)>=0)
      return{status:'BLOCKED',reason:'COMPANY_STATUS_RESTRICTS_NEW_PROPOSALS',companyId:company,companyStatus:companyStatus};
    if(COMPANY_IDS.indexOf(operatorCompany)<0)return{status:'BLOCKED',reason:'UNKNOWN_PRIVATE_OPERATOR_COMPANY'};
    if(!/^[A-Z0-9_]{3,96}$/.test(factoryType))return{status:'BLOCKED',reason:'CANONICAL_FACTORY_TYPE_REQUIRED'};
    if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>MAX_PROJECTS_PER_PROPOSAL)return{status:'BLOCKED',reason:'PROPOSAL_QUANTITY_OUT_OF_RANGE',minimum:1,maximum:MAX_PROJECTS_PER_PROPOSAL};
    var c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[factoryType],
      processingResourceId=factoryType==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'?token(input.processingResourceId||''):null,
      recipe=recipeFor(factoryType,profile,processingResourceId);
    if(!profile)return{status:'BLOCKED',reason:'FACTORY_PROFILE_NOT_REGISTERED',factoryType:factoryType};
    if(factoryType==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'&&!processingResourceId)
      return{status:'BLOCKED',reason:'UNIVERSAL_PROCESSING_RESOURCE_REQUIRED',factoryType:factoryType};
    if(!recipe)return{status:'BLOCKED',reason:'FACTORY_PROFILE_OR_RECIPE_NOT_REGISTERED',factoryType:factoryType,processingResourceId:processingResourceId||null};
    var sourcePolicy=String(input.sourcingPolicy||'DOMESTIC_ONLY').toUpperCase();
    if(['DOMESTIC_ONLY','COMPANY_FUNDED_IMPORTS','MIXED'].indexOf(sourcePolicy)<0)return{status:'BLOCKED',reason:'INVALID_INPUT_SOURCING_POLICY'};
    var requestReason=applicationText(input.requestReason),expectedBenefit=applicationText(input.expectedBenefit),riskForecast=applicationText(input.riskForecast);
    if(requestReason.length<12)return{status:'BLOCKED',reason:'COMPANY_REQUEST_REASON_REQUIRED',field:'requestReason',minimumLength:12};
    if(requestReason.length>1000)return{status:'BLOCKED',reason:'COMPANY_REQUEST_REASON_TOO_LONG',field:'requestReason',maximumLength:1000};
    if(expectedBenefit.length<12)return{status:'BLOCKED',reason:'COMPANY_EXPECTED_BENEFIT_REQUIRED',field:'expectedBenefit',minimumLength:12};
    if(expectedBenefit.length>1000)return{status:'BLOCKED',reason:'COMPANY_EXPECTED_BENEFIT_TOO_LONG',field:'expectedBenefit',maximumLength:1000};
    if(riskForecast.length<12)return{status:'BLOCKED',reason:'COMPANY_RISK_FORECAST_REQUIRED',field:'riskForecast',minimumLength:12};
    if(riskForecast.length>1000)return{status:'BLOCKED',reason:'COMPANY_RISK_FORECAST_TOO_LONG',field:'riskForecast',maximumLength:1000};
    var requestedPrivateShareholdingBps=num(input.requestedPrivateShareholdingBps),
      requestedGovernmentEquityBps=num(input.requestedGovernmentEquityBps),
      requestedLoanAmount=num(input.requestedLoanAmount),requestedGovernmentGrantAmount=num(input.requestedGovernmentGrantAmount),
      constructionDurationDays=num(input.constructionDurationDays),operatingHorizonDays=num(input.operatingHorizonDays),
      companyStrategy=obj(input.companyStrategy)?clone(input.companyStrategy):null;
    if(requestedPrivateShareholdingBps!==null&&(!Number.isInteger(requestedPrivateShareholdingBps)||requestedPrivateShareholdingBps<0||requestedPrivateShareholdingBps>10000))
      return{status:'BLOCKED',reason:'PRIVATE_SHAREHOLDING_REQUEST_OUT_OF_RANGE'};
    if(requestedGovernmentEquityBps!==null&&(!Number.isInteger(requestedGovernmentEquityBps)||requestedGovernmentEquityBps<0||requestedGovernmentEquityBps>10000))
      return{status:'BLOCKED',reason:'GOVERNMENT_EQUITY_REQUEST_OUT_OF_RANGE'};
    if(requestedLoanAmount!==null&&requestedLoanAmount<0)return{status:'BLOCKED',reason:'COMPANY_LOAN_REQUEST_INVALID'};
    if(requestedGovernmentGrantAmount!==null&&requestedGovernmentGrantAmount<0)return{status:'BLOCKED',reason:'COMPANY_GRANT_REQUEST_INVALID'};
    if(constructionDurationDays!==null&&(!Number.isInteger(constructionDurationDays)||constructionDurationDays<1||constructionDurationDays>3650))
      return{status:'BLOCKED',reason:'COMPANY_CONSTRUCTION_DURATION_INVALID'};
    if(operatingHorizonDays!==null&&(!Number.isInteger(operatingHorizonDays)||operatingHorizonDays<1||operatingHorizonDays>36500))
      return{status:'BLOCKED',reason:'COMPANY_OPERATING_HORIZON_INVALID'};
    var requestId=String(input.requestId||'').trim();
    if(requestId){
      var old=existingProposal(cid,requestId);
      if(old){
        var same=id(old.companyId)===company&&
          id(old.operatorCompanyId||old.companyId)===operatorCompany&&
          id(old.factoryType)===factoryType&&
          token(old.processingResourceId||'')===token(processingResourceId||'')&&
          Number(old.quantity)===quantity&&
          String(old.sourcingPolicy||'DOMESTIC_ONLY').toUpperCase()===sourcePolicy&&
          (old.stateSupportRequested===true)===(input.stateSupportRequested===true)&&
          num(old.requestedPrivateShareholdingBps)===requestedPrivateShareholdingBps&&
          num(old.requestedGovernmentEquityBps)===requestedGovernmentEquityBps&&
          num(old.requestedLoanAmount)===requestedLoanAmount&&
          num(old.requestedGovernmentGrantAmount)===requestedGovernmentGrantAmount&&
          num(old.constructionDurationDays)===constructionDurationDays&&
          num(old.operatingHorizonDays)===operatingHorizonDays&&
          JSON.stringify(old.companyStrategy||null)===JSON.stringify(companyStrategy||null)&&
          applicationText(old.requestReason)===requestReason&&
          applicationText(old.expectedBenefit)===expectedBenefit&&
          applicationText(old.riskForecast)===riskForecast;
        if(!same)return{status:'BLOCKED',reason:'PROPOSAL_REQUEST_IDEMPOTENCY_COLLISION',proposalId:old.proposalId};
        return Object.assign({idempotent:true},clone(old));
      }
    }
    var r=runtime(cid,true),sequence=r.nextProposalSequence++,proposalId='PE-PROPOSAL:'+cid+':'+sequence;
    var proposal={
      proposalId:proposalId,requestId:requestId||proposalId,countryId:cid,companyId:company,companyName:COMPANY_NAMES[company],
      factoryType:factoryType,factoryName:profile.name||factoryType,quantity:quantity,
      processingResourceId:recipe.resourceId||processingResourceId||null,
      recipeId:recipe.recipeId||profile.defaultRecipeId||null,sourcingPolicy:sourcePolicy,
      requestReason:requestReason,expectedBenefit:expectedBenefit,riskForecast:riskForecast,
      stateSupportRequested:input.stateSupportRequested===true,
      capitalRequired:num(profile.constructionCost)===null?null:num(profile.constructionCost)*quantity,
      capitalUnit:profile.unit||'GAME_CURRENCY_UNITS',
      workforcePerFactory:clone(profile.workforce||{}),utilitiesPerFactory:clone(profile.utilities||{}),
      forecastOutputPerDay:(num(profile.defaultCapacityPerDay)||0)*quantity,
      expectedInputRequirements:inputForecast(cid,profile,recipe,quantity),
      operatorCompanyId:operatorCompany,
      submittedBy:company,proposalOrigin:String(input.proposalOrigin||'COMPANY_INITIATED').toUpperCase(),
      governmentInvitationId:String(input.governmentInvitationId||'').trim()||null,
      financingPreference:String(input.financingPreference||'').toUpperCase()||null,
      requestedPrivateShareholdingBps:requestedPrivateShareholdingBps,
      requestedGovernmentEquityBps:requestedGovernmentEquityBps,
      requestedLoanAmount:requestedLoanAmount,requestedGovernmentGrantAmount:requestedGovernmentGrantAmount,
      constructionDurationDays:constructionDurationDays,operatingHorizonDays:operatingHorizonDays,
      companyStrategy:companyStrategy,
      requestedLoanGuarantee:input.requestedLoanGuarantee===true,
      publicInfrastructureRequested:input.publicInfrastructureRequested===true,
      utilitySupportRequested:input.utilitySupportRequested===true,
      governmentOfftakeRequested:input.governmentOfftakeRequested===true,
      companyRequestedConditions:Array.isArray(input.companyRequestedConditions)?clone(input.companyRequestedConditions):[],
      ownership:{ownerCompanyId:company,operatorCompanyId:operatorCompany,stateControlRights:{strategicOversight:true,licensingAndPermits:true,fiscalRegulation:true,labourSafetyEnvironmentalRegulation:true,strategicSupplyOversight:true,strategicContracts:true,domesticSupplyDirection:true,exportControl:true,publicProcurement:true,competitionOversight:true,foreignOwnershipReview:true,emergencyIntervention:true,operationalControl:'STATE_POLICY_ONLY',authority:'OMEGA_STATE_CONTROL_RIGHTS_V1',simulationOnly:true}},
      stateControlRights:{strategicOversight:true,licensingAndPermits:true,fiscalRegulation:true,labourSafetyEnvironmentalRegulation:true,strategicSupplyOversight:true,strategicContracts:true,domesticSupplyDirection:true,exportControl:true,publicProcurement:true,competitionOversight:true,foreignOwnershipReview:true,emergencyIntervention:true,operationalControl:'STATE_POLICY_ONLY',authority:'OMEGA_STATE_CONTROL_RIGHTS_V1',simulationOnly:true},
      status:'PROPOSED',createdTurn:turn(),updatedTurn:turn(),decision:null,projectIds:[],commissionedFactoryIds:[],
      productionEnabled:false,provenance:{source:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1',simulationOnly:true,realWorldCompany:false}
    };
    proposal.companyCase=companyBusinessCase(proposal);
    r.proposals.push(proposal);if(r.proposals.length>MAX_PROPOSALS)r.proposals.splice(0,r.proposals.length-MAX_PROPOSALS);
    submitCompanyMarketResearchRequest(proposal);
    // Rebuild after the request link is attached so the persisted case and proposal stay consistent.
    proposal.companyCase=companyBusinessCase(proposal);
    if(proposal.marketResearchRequest&&proposal.companyCase.marketAnalysis)
      proposal.companyCase.marketAnalysis.researchRequest=clone(proposal.marketResearchRequest);
    recordEvent(cid,'COMPANY_PROPOSAL_SUBMITTED',{proposalId:proposalId,companyId:company,factoryType:factoryType,
      processingResourceId:proposal.processingResourceId,quantity:quantity,applicationFieldsProvided:true});
    return Object.assign({status:'PROPOSED'},clone(proposal));
  }
  function getProposal(country,proposalId){
    var r=runtime(country,false);var p=r&&r.proposals.find(function(x){return x.proposalId===String(proposalId||'');});return p?clone(p):null;
  }
  function activeCompetitionExpansionRestriction(country,company,resourceId,proposal){
    var cid=canonicalCountry(country),trade=countryBucket('trade',cid,false)||{},
      competition=trade.marketCompetition||{},rows=Array.isArray(competition.activeRestrictions)?competition.activeRestrictions:[],
      relevantResources=[];
    if(resourceId)relevantResources.push(token(resourceId));
    if(proposal&&Array.isArray(proposal.expectedInputRequirements))proposal.expectedInputRequirements.forEach(function(row){
      if(row&&row.resourceId)relevantResources.push(token(row.resourceId));
    });
    relevantResources=[...new Set(relevantResources.filter(Boolean))];
    // Do not block unrelated industries when the application has no verified
    // resource link to the concentrated market.
    if(!relevantResources.length)return null;
    return rows.find(function(row){
      return row&&String(row.status||'').toUpperCase()==='ACTIVE'&&
        row.authority==='OMEGA_STATE_CONTROL_RIGHTS_V1'&&row.restrictionType==='PRIVATE_FACTORY_EXPANSION_HOLD'&&
        canonicalCountry(row.countryId||cid)===cid&&id(row.companyId)===id(company)&&
        relevantResources.indexOf(token(row.resourceId))>=0&&
        (num(row.startsTurn)===null||turn()>=num(row.startsTurn));
    })||null;
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
    var oldQuantity=proposal.quantity,oldCapital=proposal.capitalRequired,oldForecast=proposal.expectedInputRequirements,
      oldProcessingResourceId=proposal.processingResourceId,oldRecipeId=proposal.recipeId;
    if(quantity>oldQuantity){
      var competitionRestriction=activeCompetitionExpansionRestriction(cid,proposal.companyId,proposal.processingResourceId,proposal);
      if(competitionRestriction)return{status:'BLOCKED',reason:'ANTITRUST_EXPANSION_RESTRICTION_ACTIVE',
        competitionCaseId:competitionRestriction.caseId,restriction:clone(competitionRestriction)};
    }
    var profile=(catalog()||{}).factoryProfiles&&catalog().factoryProfiles[proposal.factoryType],
      nextProcessingResourceId=proposal.factoryType==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'
        ?token(input.processingResourceId||proposal.processingResourceId||''):null,
      nextRecipe=recipeFor(proposal.factoryType,profile,nextProcessingResourceId);
    if(!nextRecipe)return{status:'BLOCKED',reason:proposal.factoryType==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'
      ?'UNIVERSAL_PROCESSING_RESOURCE_REQUIRED':'FACTORY_PROFILE_OR_RECIPE_NOT_REGISTERED'};
    proposal.quantity=quantity;proposal.processingResourceId=nextRecipe.resourceId||nextProcessingResourceId||null;
    proposal.recipeId=nextRecipe.recipeId||profile.defaultRecipeId||null;
    proposal.capitalRequired=profile&&num(profile.constructionCost)!==null?num(profile.constructionCost)*quantity:null;
    proposal.expectedInputRequirements=inputForecast(cid,profile,nextRecipe,quantity);
    var preview=previewFor(proposal);
    if(preview.status!=='READY'){
      proposal.quantity=oldQuantity;proposal.capitalRequired=oldCapital;proposal.expectedInputRequirements=oldForecast;
      proposal.processingResourceId=oldProcessingResourceId;proposal.recipeId=oldRecipeId;
      return{status:'BLOCKED',reason:preview.reason||'ADJUSTED_QUANTITY_EXCEEDS_POLICY_CAP',preview:preview};
    }
    proposal.updatedTurn=turn();
    recordEvent(cid,'COMPANY_PROPOSAL_QUANTITY_ADJUSTED',{proposalId:proposal.proposalId,previousQuantity:oldQuantity,approvedQuantity:quantity});
    return{status:'PROPOSED',proposal:clone(proposal),preview:preview};
  }
  function previewCompanyExpansion(country,companyId,factoryType,quantity,processingResourceId){
    var cid=canonicalCountry(country||playerCountry()),company=id(companyId),type=id(factoryType),
      base=baseline(cid),row=base&&Array.isArray(base.companies)?base.companies.find(function(item){
        return id(item.companyId||item.id)===company;
      }):null,count=num(row&&row.factoryCounts&&row.factoryCounts[type])||0,
      c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[type],
      processing=type==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'?token(processingResourceId||''):null;
    if(COMPANY_IDS.indexOf(company)<0)return{status:'BLOCKED',reason:'UNKNOWN_CANONICAL_COMPANY'};
    if(!profile)return{status:'BLOCKED',reason:'FACTORY_PROFILE_NOT_REGISTERED'};
    if(count<1)return{status:'BLOCKED',reason:'COMPANY_HAS_NO_OPENING_ALLOCATION_FOR_FACTORY_TYPE',companyId:company,factoryType:type};
    var recipe=recipeFor(type,profile,processing);
    if(!recipe)return{status:'BLOCKED',reason:'FACTORY_PROFILE_OR_RECIPE_NOT_REGISTERED'};
    var preview=previewFor({countryId:cid,companyId:company,factoryType:type,quantity:num(quantity)||1,
      processingResourceId:processing,sourcingPolicy:'MIXED',stateSupportRequested:false});
    return Object.assign({companyId:company,companyOpeningAllocation:count},preview);
  }
  function createGovernmentInvitation(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),player=playerCountry();
    if(cid!==player||!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var factoryType=id(input.factoryType),quantity=num(input.quantity),r=runtime(cid,true),
      c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[factoryType],
      rationale=applicationText(input.governmentRationale),requestId=String(input.requestId||'').trim(),
      supportType=String(input.supportType||'NO_PUBLIC_FINANCING').toUpperCase(),
      allowed=['NO_PUBLIC_FINANCING','CAPITAL_GRANT','GOVERNMENT_EQUITY','LOAN_GUARANTEE',
        'OFFTAKE_CONTRACT','INFRASTRUCTURE_SUPPORT','UTILITY_SUPPORT'];
    if(!profile)return{status:'BLOCKED',reason:'FACTORY_PROFILE_NOT_REGISTERED'};
    if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>MAX_PROJECTS_PER_PROPOSAL)
      return{status:'BLOCKED',reason:'INVITATION_QUANTITY_OUT_OF_RANGE'};
    if(rationale.length<12)return{status:'BLOCKED',reason:'GOVERNMENT_INVITATION_RATIONALE_REQUIRED'};
    if(rationale.length>1000)return{status:'BLOCKED',reason:'GOVERNMENT_INVITATION_RATIONALE_TOO_LONG'};
    if(!requestId)return{status:'BLOCKED',reason:'GOVERNMENT_INVITATION_REFERENCE_REQUIRED'};
    if(allowed.indexOf(supportType)<0)return{status:'BLOCKED',reason:'UNSUPPORTED_GOVERNMENT_SUPPORT_OFFER'};
    var prior=r.governmentInvitations.find(function(row){return row&&row.requestId===requestId;});
    if(prior)return prior.factoryType===factoryType&&prior.quantity===quantity&&prior.governmentRationale===rationale
      ?{status:'DUPLICATE',invitation:clone(prior)}:{status:'BLOCKED',reason:'INVITATION_REQUEST_IDEMPOTENCY_COLLISION'};
    var maxContribution=num(input.maxGovernmentContribution);
    if(maxContribution===null)maxContribution=0;
    if(maxContribution<0)return{status:'BLOCKED',reason:'GOVERNMENT_SUPPORT_AMOUNT_INVALID'};
    if(supportType==='CAPITAL_GRANT'&&maxContribution<=0)return{status:'BLOCKED',reason:'CAPITAL_GRANT_AMOUNT_REQUIRED'};
    var treasury=financeTreasury(cid);
    if(supportType==='CAPITAL_GRANT'&&maxContribution>0&&
       (treasury.balance===null||treasury.balance+1e-9<maxContribution))
      return{status:'BLOCKED',reason:'INSUFFICIENT_TREASURY_BALANCE',available:treasury.balance,requested:maxContribution};
    var equityBps=num(input.governmentEquityBps);
    if(equityBps===null)equityBps=0;
    if(!Number.isInteger(equityBps)||equityBps<0||equityBps>10000)
      return{status:'BLOCKED',reason:'GOVERNMENT_EQUITY_SHARE_OUT_OF_RANGE'};
    var expiry=num(input.expiresAfterTurns);
    if(expiry===null)expiry=90;
    if(!Number.isInteger(expiry)||expiry<30||expiry>900)
      return{status:'BLOCKED',reason:'INVITATION_EXPIRY_OUT_OF_RANGE'};
    var idValue='PE-INVITATION:'+cid+':'+r.nextInvitationSequence++;
    var row={invitationId:idValue,requestId:requestId,countryId:cid,factoryType:factoryType,
      factoryName:profile.name||factoryType,quantity:quantity,governmentRationale:rationale,
      supportOffer:{type:supportType,maxGovernmentContribution:maxContribution,
        governmentEquityBps:equityBps,settlementStatus:'OFFER_ONLY_NOT_SETTLED'},
      invitedCompanies:COMPANY_IDS.slice(),responses:[],status:'OPEN',
      createdTurn:turn(),expiresAtTurn:turn()+expiry,createdBy:'PLAYER_GOVERNMENT',
      authority:'OMEGA_GOVERNMENT_INDUSTRIAL_INVITATION_V1',simulationOnly:true};
    r.governmentInvitations.push(row);
    if(r.governmentInvitations.length>MAX_PROPOSALS)r.governmentInvitations.splice(0,r.governmentInvitations.length-MAX_PROPOSALS);
    recordEvent(cid,'GOVERNMENT_COMPANY_INVITATION_ISSUED',{invitationId:idValue,
      factoryType:factoryType,quantity:quantity,supportType:supportType});
    return{status:'OPEN',invitation:clone(row)};
  }
  function closeGovernmentInvitation(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),r=runtime(cid,false);
    if(cid!==playerCountry()||!r)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var row=r.governmentInvitations.find(function(item){return item&&item.invitationId===String(input.invitationId||'');});
    if(!row)return{status:'BLOCKED',reason:'GOVERNMENT_INVITATION_NOT_FOUND'};
    if(row.status!=='OPEN')return{status:'DUPLICATE',invitation:clone(row)};
    row.status='CLOSED';row.closedTurn=turn();row.closedBy='PLAYER_GOVERNMENT';
    row.closureReason=String(input.reason||'Closed by the government.').slice(0,500);
    recordEvent(cid,'GOVERNMENT_COMPANY_INVITATION_CLOSED',{invitationId:row.invitationId});
    return{status:'CLOSED',invitation:clone(row)};
  }
  function respondToGovernmentCounterOffer(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),r=runtime(cid,false),
      proposal=r&&r.proposals.find(function(row){return row&&row.proposalId===String(input.proposalId||'');}),
      actor=id(input.actorCompanyId);
    if(cid!==playerCountry()||!proposal)return{status:'BLOCKED',reason:proposal?'PLAYER_COUNTRY_SCOPE_ONLY':'PROPOSAL_NOT_FOUND'};
    if(actor!==id(proposal.companyId))return{status:'BLOCKED',reason:'COMPANY_ACTOR_MISMATCH'};
    if(proposal.status!=='NEGOTIATION_PENDING_COMPANY'||!proposal.governmentCounterOffer)
      return{status:'BLOCKED',reason:'COMPANY_COUNTER_OFFER_NOT_PENDING'};
    var response=String(input.response||'').toUpperCase();
    if(response==='REJECT'){
      proposal.status='NEGOTIATION_DECLINED_BY_COMPANY';
      proposal.governmentCounterOffer.companyResponse='REJECTED';
      proposal.governmentCounterOffer.respondedTurn=turn();
      recordEvent(cid,'COMPANY_DECLINED_GOVERNMENT_COUNTER_OFFER',{proposalId:proposal.proposalId,companyId:actor});
      return{status:proposal.status,proposal:clone(proposal)};
    }
    if(response!=='ACCEPT')return{status:'BLOCKED',reason:'INVALID_COMPANY_COUNTER_OFFER_RESPONSE'};
    var counter=proposal.governmentCounterOffer,quantity=num(counter.quantity),
      profile=catalog()?.factoryProfiles?.[proposal.factoryType],unitCost=num(profile&&profile.constructionCost),
      required=unitCost===null||quantity===null?null:unitCost*quantity,
      account=capitalAccount(cid,actor,false),available=account?num(account.availableBalance):null,
      fundingGap=required===null?null:Math.max(0,required-(available===null?0:available)),
      grantAvailable=String(counter.supportType||'').toUpperCase()==='CAPITAL_GRANT'&&
        num(counter.maxGovernmentContribution)!==null&&fundingGap!==null&&
        num(counter.maxGovernmentContribution)+1e-9>=fundingGap,
      companyCanFund=available!==null&&required!==null&&available+1e-9>=required;
    if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>proposal.quantity||required===null)
      return{status:'BLOCKED',reason:'GOVERNMENT_COUNTER_OFFER_QUANTITY_OR_COST_INVALID'};
    if(!grantAvailable&&!companyCanFund){
      proposal.governmentCounterOffer.companyResponse='REJECTED_INSUFFICIENT_SETTLED_FINANCE';
      proposal.governmentCounterOffer.respondedTurn=turn();
      proposal.status='NEGOTIATION_DECLINED_BY_COMPANY';
      recordEvent(cid,'COMPANY_DECLINED_UNFUNDED_COUNTER_OFFER',{proposalId:proposal.proposalId,companyId:actor,required:required,available:available});
      return{status:proposal.status,reason:'COUNTER_OFFER_HAS_NO_SETTLED_EXECUTABLE_FUNDING',proposal:clone(proposal)};
    }
    var candidate=Object.assign({},proposal,{quantity:quantity,capitalRequired:required,
      expectedInputRequirements:inputForecast(cid,profile,
        recipeFor(proposal.factoryType,profile,proposal.processingResourceId),quantity)});
    var preview=previewFor(candidate);
    if(preview.status!=='READY'){
      return{status:'BLOCKED',reason:preview.reason||'COUNTER_OFFER_NO_LONGER_FEASIBLE',preview:preview};
    }
    proposal.quantity=quantity;proposal.capitalRequired=required;
    proposal.expectedInputRequirements=clone(candidate.expectedInputRequirements);
    proposal.negotiatedFundingSource=grantAvailable?'GOVERNMENT_GRANT':'COMPANY_CAPITAL';
    if(grantAvailable){
      proposal.stateSupportRequested=true;
      proposal.financingPreference='GOVERNMENT_GRANT';
      proposal.requestedGovernmentGrantAmount=fundingGap;
    }
    proposal.governmentCounterOffer.companyResponse='ACCEPTED';
    proposal.governmentCounterOffer.respondedTurn=turn();
    proposal.governmentCounterOffer.settlementStatus='NOT_SETTLED_REQUIRES_SEPARATE_APPROVAL_AND_FUNDING';
    proposal.status='PROPOSED';proposal.updatedTurn=turn();proposal.decision=null;proposal.permit=null;
    proposal.governmentReview=null;
    proposal.companyCase=companyBusinessCase(proposal);
    recordEvent(cid,'COMPANY_ACCEPTED_GOVERNMENT_COUNTER_OFFER',{proposalId:proposal.proposalId,
      companyId:actor,quantity:quantity,fundingSource:proposal.negotiatedFundingSource});
    return{status:'PROPOSED',proposal:clone(proposal),preview:preview};
  }
  function decideProposal(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),player=playerCountry();
    if(cid!==player||!player)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    var r=runtime(cid,false),proposal=r&&r.proposals.find(function(p){return p.proposalId===String(input.proposalId||'');});
    if(!proposal)return{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};
    var decision=String(input.decision||'').toUpperCase();
    if(decision==='RESUME'){
      if(proposal.status!=='ON_HOLD')return{status:'BLOCKED',reason:'PROPOSAL_NOT_ON_GOVERNMENT_HOLD'};
      proposal.status='PROPOSED';proposal.updatedTurn=turn();
      var resumedPreview=previewFor(proposal);
      proposal.governmentReview={reviewer:'PLAYER_GOVERNMENT',reviewedTurn:turn(),outcome:'RESUMED_FOR_REVIEW',
        assessment:proposalDecisionAssessment(proposal,resumedPreview),
        evidenceAuthority:'LIVE_SELECTED_COUNTRY_MARKET_SUPPLY_UTILITY_WORKFORCE_AND_FINANCE'};
      proposal.governmentActions=Array.isArray(proposal.governmentActions)?proposal.governmentActions:[];
      proposal.governmentActions.push({action:'RESUME',turn:turn(),reviewer:'PLAYER_GOVERNMENT',reason:String(input.reason||'Resumed for further review.').slice(0,1000)});
      recordEvent(cid,'GOVERNMENT_RESUMED_COMPANY_PROPOSAL',{proposalId:proposal.proposalId});
      return{status:'PROPOSED',proposal:clone(proposal)};
    }
    if(proposal.status!=='PROPOSED'&&!(proposal.status==='ON_HOLD'&&decision==='DENY'))
      return{status:'BLOCKED',reason:'PROPOSAL_ALREADY_DECIDED',currentStatus:proposal.status};
    if(decision==='HOLD'){
      var holdPreview=previewFor(proposal);
      proposal.governmentReview={reviewer:'PLAYER_GOVERNMENT',reviewedTurn:turn(),outcome:'PAUSED_FOR_FURTHER_REVIEW',
        assessment:proposalDecisionAssessment(proposal,holdPreview),
        evidenceAuthority:'LIVE_SELECTED_COUNTRY_MARKET_SUPPLY_UTILITY_WORKFORCE_AND_FINANCE'};
      proposal.status='ON_HOLD';proposal.updatedTurn=turn();
      proposal.governmentActions=Array.isArray(proposal.governmentActions)?proposal.governmentActions:[];
      proposal.governmentActions.push({action:'HOLD',turn:turn(),reviewer:'PLAYER_GOVERNMENT',reason:String(input.reason||'Government review placed on hold.').slice(0,1000)});
      recordEvent(cid,'GOVERNMENT_HELD_COMPANY_PROPOSAL',{proposalId:proposal.proposalId});
      return{status:'ON_HOLD',proposal:clone(proposal)};
    }
    if(decision==='COUNTER_OFFER'){
      var terms=input.counterOffer||{},quantity=num(terms.quantity===undefined?proposal.quantity:terms.quantity),
        supportType=String(terms.supportType||'NO_PUBLIC_FINANCING').toUpperCase(),
        maxContribution=num(terms.maxGovernmentContribution);
      if(quantity===null||!Number.isInteger(quantity)||quantity<1||quantity>proposal.quantity)
        return{status:'BLOCKED',reason:'COUNTER_OFFER_QUANTITY_OUT_OF_RANGE'};
      if(['NO_PUBLIC_FINANCING','CAPITAL_GRANT','GOVERNMENT_EQUITY','LOAN_GUARANTEE',
          'OFFTAKE_CONTRACT','INFRASTRUCTURE_SUPPORT','UTILITY_SUPPORT'].indexOf(supportType)<0)
        return{status:'BLOCKED',reason:'UNSUPPORTED_GOVERNMENT_COUNTER_OFFER'};
      if(maxContribution===null)maxContribution=0;
      if(maxContribution<0)return{status:'BLOCKED',reason:'COUNTER_OFFER_SUPPORT_AMOUNT_INVALID'};
      if(supportType==='CAPITAL_GRANT'){
        if(maxContribution<=0)return{status:'BLOCKED',reason:'CAPITAL_GRANT_AMOUNT_REQUIRED'};
        var treasury=financeTreasury(cid);
        if(treasury.balance===null||treasury.balance+1e-9<maxContribution)
          return{status:'BLOCKED',reason:'INSUFFICIENT_TREASURY_BALANCE',available:treasury.balance,requested:maxContribution};
      }
      var equity=num(terms.governmentEquityBps);
      if(equity===null)equity=0;
      if(!Number.isInteger(equity)||equity<0||equity>10000)return{status:'BLOCKED',reason:'COUNTER_OFFER_EQUITY_OUT_OF_RANGE'};
      var counterPreview=previewFor(proposal);
      proposal.governmentReview={reviewer:'PLAYER_GOVERNMENT',reviewedTurn:turn(),outcome:'COUNTER_OFFER_ISSUED',
        assessment:proposalDecisionAssessment(proposal,counterPreview),
        evidenceAuthority:'LIVE_SELECTED_COUNTRY_MARKET_SUPPLY_UTILITY_WORKFORCE_AND_FINANCE'};
      proposal.governmentCounterOffer={quantity:quantity,supportType:supportType,
        maxGovernmentContribution:maxContribution,governmentEquityBps:equity,
        conditions:String(terms.conditions||'').slice(0,1000),
        reason:String(terms.reason||input.reason||'Government counter-offer.').slice(0,1000),
        issuedTurn:turn(),issuedBy:'PLAYER_GOVERNMENT',companyResponse:'PENDING',
        settlementStatus:'OFFER_ONLY_NOT_SETTLED'};
      proposal.status='NEGOTIATION_PENDING_COMPANY';proposal.updatedTurn=turn();
      proposal.governmentActions=Array.isArray(proposal.governmentActions)?proposal.governmentActions:[];
      proposal.governmentActions.push({action:'COUNTER_OFFER',turn:turn(),reviewer:'PLAYER_GOVERNMENT',
        terms:clone(proposal.governmentCounterOffer)});
      recordEvent(cid,'GOVERNMENT_COUNTER_OFFERED_COMPANY_PROPOSAL',{proposalId:proposal.proposalId,
        quantity:quantity,supportType:supportType,maxGovernmentContribution:maxContribution});
      return{status:'NEGOTIATION_PENDING_COMPANY',proposal:clone(proposal)};
    }
    if(['APPROVE','DENY','DEFER'].indexOf(decision)<0)return{status:'BLOCKED',reason:'INVALID_GOVERNMENT_DECISION'};
    if(decision==='APPROVE'){
      var competitionRestriction=activeCompetitionExpansionRestriction(cid,proposal.companyId,proposal.processingResourceId,proposal);
      if(competitionRestriction)return{status:'BLOCKED',reason:'ANTITRUST_EXPANSION_RESTRICTION_ACTIVE',
        competitionCaseId:competitionRestriction.caseId,restriction:clone(competitionRestriction)};
    }
    var preview=previewFor(proposal),independentAssessment=proposalDecisionAssessment(proposal,preview);
    if(decision==='APPROVE'&&(!applicationText(proposal.requestReason)||!applicationText(proposal.expectedBenefit)||!applicationText(proposal.riskForecast)))
      return{status:'BLOCKED',reason:'COMPANY_APPLICATION_DISCLOSURE_REQUIRED'};
    if(decision==='APPROVE'&&preview.status!=='READY')return{status:'BLOCKED',reason:preview.reason||'APPROVAL_PREVIEW_BLOCKED',preview:preview};
    if(decision==='APPROVE'&&proposal.sourcingPolicy==='DOMESTIC_ONLY'&&(preview.shortages.length||preview.unobservedInputs.length||
       preview.maximumSafeDomesticFactoryQuantity===null||proposal.quantity>preview.maximumSafeDomesticFactoryQuantity))
      return{status:'BLOCKED',reason:preview.shortages.length?'DOMESTIC_INPUT_SHORTAGE':'DOMESTIC_INPUT_STOCK_UNOBSERVED',
        shortages:clone(preview.shortages),unobservedInputs:clone(preview.unobservedInputs),maximumSafeDomesticFactoryQuantity:preview.maximumSafeDomesticFactoryQuantity,preview:preview};
    var stateSupport=decision==='APPROVE'&&input.allowStateSupport===true&&proposal.stateSupportRequested===true;
    var approvalAssessment=decision==='APPROVE'?independentAssessment:null;
    proposal.governmentReview={reviewer:'PLAYER_GOVERNMENT',reviewedTurn:turn(),outcome:decision,
      assessment:clone(independentAssessment),
      evidenceAuthority:'LIVE_SELECTED_COUNTRY_MARKET_SUPPLY_UTILITY_WORKFORCE_AND_FINANCE'};
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
      companyApplication:{requestReason:proposal.requestReason,expectedBenefit:proposal.expectedBenefit,riskForecast:proposal.riskForecast},
      approvalAssessment:clone(approvalAssessment),
      preview:clone(preview),reviewTurn:turn(),expiryTurn:num(input.expiryTurn)||turn()+30};
    proposal.approvalAssessment=clone(approvalAssessment);
    proposal.permit=permit;
    proposal.updatedTurn=turn();
    recordEvent(cid,'COMPANY_PROPOSAL_DECIDED',{proposalId:proposal.proposalId,decision:decision,decisionId:proposal.decision.decisionId,
      allowStateSupport:stateSupport,assessmentStatus:approvalAssessment&&approvalAssessment.status||null,
      riskStatus:approvalAssessment&&approvalAssessment.riskStatus||null});
    return{status:proposal.status,proposal:clone(proposal),preview:preview};
  }
  function advanceAutonomousProposalCycle(){
    var cid=playerCountry(),period=Math.floor(turn()/30);
    if(!cid||period<1)return{status:'WAITING',reason:'AUTONOMOUS_PROPOSAL_REVIEW_NOT_DUE'};
    var r=runtime(cid,true),cycle=r.autonomousProposalCycle;
    if(!obj(cycle)||num(cycle.period)!==period){
      // Saves created by the previous one-company-per-month scheduler used this
      // marker to mean "the entire period is consumed". Preserve that meaning once
      // during migration; new cycles use the explicit cursor below.
      if(num(r.lastAutonomousProposalPeriod)===period)return{status:'DUPLICATE',period:period};
      cycle={schemaVersion:1,period:period,nextCompanyIndex:0,lastProcessedTurn:null,
        processedCompanyIds:[],status:'RUNNING',startedTurn:turn(),completedTurn:null};
      r.autonomousProposalCycle=cycle;
    }
    if(cycle.status==='COMPLETE'||num(cycle.nextCompanyIndex)>=COMPANY_IDS.length){
      cycle.status='COMPLETE';cycle.completedTurn=cycle.completedTurn||turn();
      r.lastAutonomousProposalPeriod=period;
      return{status:'DUPLICATE',period:period,reason:'AUTONOMOUS_COMPANY_CYCLE_COMPLETE'};
    }
    if(num(cycle.lastProcessedTurn)===turn())
      return{status:'DUPLICATE',period:period,reason:'COMPANY_ALREADY_REVIEWED_THIS_TURN'};
    var base=baseline(cid);
    if(!base||base.status!=='READY')return{status:'WAITING',reason:'PRIVATE_BASELINE_NOT_READY',period:period};
    var companyIndex=Math.max(0,Math.min(COMPANY_IDS.length-1,Math.floor(num(cycle.nextCompanyIndex)||0))),
      company=COMPANY_IDS[(period-1+companyIndex)%COMPANY_IDS.length];
    // The cursor is durable and advances before the company is evaluated. A failed
    // opportunity is not rescanned repeatedly, and no turn evaluates more than one
    // company's portfolio. This bounds main-thread work and makes event replay safe.
    cycle.lastProcessedTurn=turn();
    cycle.nextCompanyIndex=companyIndex+1;
    if(!Array.isArray(cycle.processedCompanyIds))cycle.processedCompanyIds=[];
    cycle.processedCompanyIds.push(company);
    if(cycle.processedCompanyIds.length>COMPANY_IDS.length)
      cycle.processedCompanyIds.splice(0,cycle.processedCompanyIds.length-COMPANY_IDS.length);
    if(cycle.nextCompanyIndex>=COMPANY_IDS.length){
      cycle.status='COMPLETE';cycle.completedTurn=turn();r.lastAutonomousProposalPeriod=period;
    }else cycle.status='RUNNING';
    var pendingNegotiation=r.proposals.find(function(row){return row&&row.companyId===company&&row.status==='NEGOTIATION_PENDING_COMPANY';});
    if(pendingNegotiation){
      var counter=pendingNegotiation.governmentCounterOffer||{},
        account=capitalAccount(cid,company,false),cash=account?num(account.availableBalance):null,
        profile=catalog()?.factoryProfiles?.[pendingNegotiation.factoryType],
        required=num(profile&&profile.constructionCost)===null?null:num(profile.constructionCost)*num(counter.quantity||pendingNegotiation.quantity),
        gap=required===null?null:Math.max(0,required-(cash===null?0:cash)),
        grant=String(counter.supportType||'').toUpperCase()==='CAPITAL_GRANT'&&
          gap!==null&&num(counter.maxGovernmentContribution)!==null&&num(counter.maxGovernmentContribution)+1e-9>=gap,
        companyCanFund=cash!==null&&required!==null&&cash+1e-9>=required;
      var response=respondToGovernmentCounterOffer({countryId:cid,proposalId:pendingNegotiation.proposalId,
        actorCompanyId:company,response:grant||companyCanFund?'ACCEPT':'REJECT'});
      return{status:'NEGOTIATION_RESPONSE',companyId:company,period:period,response:response};
    }
    var active=r.proposals.some(function(p){return p.companyId===company&&
      ['PROPOSED','ON_HOLD','NEGOTIATION_PENDING_COMPANY','APPROVED_AWAITING_FUNDING','FUNDED','UNDER_CONSTRUCTION',
       'PARTIALLY_UNDER_CONSTRUCTION','COMMISSIONED_PRODUCTION_GATED'].indexOf(p.status)>=0;});
    if(active)return{status:'WAITING',reason:'COMPANY_HAS_ACTIVE_PROPOSAL',companyId:company,period:period};
    var companyRow=(base.companies||[]).find(function(row){return id(row.companyId||row.id)===company;});
    var counts=companyRow&&companyRow.factoryCounts||{};
    var invitations=r.governmentInvitations.filter(function(row){
      if(!row||row.status!=='OPEN')return false;
      if(num(row.expiresAtTurn)!==null&&turn()>num(row.expiresAtTurn)){row.status='EXPIRED';row.expiredTurn=turn();return false;}
      return row.invitedCompanies.indexOf(company)>=0&&
        !row.responses.some(function(response){return response.companyId===company;});
    });
    var invitation=invitations.find(function(row){return Number(counts[row.factoryType]||0)>0;})||null;
    var eligible=invitation?[id(invitation.factoryType)]:Object.keys(counts).filter(function(type){
      return Number.isInteger(num(counts[type]))&&num(counts[type])>0;
    }).map(id).sort();
    if(!eligible.length)return{status:invitation?'INVITATION_NOT_FEASIBLE':'NO_COMPANY_FACTORY_ALLOCATION',
      companyId:company,period:period,invitationId:invitation&&invitation.invitationId||null};
    if(eligible.length>1){
      var rotation=companyIndex%eligible.length;
      eligible=eligible.slice(rotation).concat(eligible.slice(0,rotation));
    }
    var selectionOrder=Object.create(null);
    eligible.forEach(function(type,index){selectionOrder[type]=index;});
    var marketSource=g.Omega&&(g.Omega.GlobalMarket||g.Omega.globalMarket)||g.OmegaGlobalMarket||null,
      marketQuoteCache=Object.create(null),marketApi=marketSource?Object.create(null):null;
    if(marketApi){
      // A cycle evaluates a bounded number of categories/resources. Reuse each
      // current-turn quote rather than querying the order book once per scenario.
      marketApi.quote=function(resourceId){
        var key=token(resourceId);
        if(!Object.prototype.hasOwnProperty.call(marketQuoteCache,key)){
          try{marketQuoteCache[key]=typeof marketSource.quote==='function'
            ?marketSource.quote(resourceId)||{}:{};}catch(_){marketQuoteCache[key]={};}
        }
        return marketQuoteCache[key];
      };
      ['localPrice','suppliers','privateCompanySuppliers'].forEach(function(method){
        if(typeof marketSource[method]==='function')
          marketApi[method]=function(){return marketSource[method].apply(marketSource,arguments);};
      });
    }
    function quote(resourceId){
      try{return marketApi&&typeof marketApi.quote==='function'?marketApi.quote(resourceId)||{}:{};}catch(_){return{};}
    }
    function evaluate(type,requestedProcessingResourceId){
      var profile=(catalog()||{}).factoryProfiles&&catalog().factoryProfiles[type];
      if(!profile)return null;
      var processingResourceId=null;
      if(type==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'){
        processingResourceId=invitation&&invitation.processingResourceId||requestedProcessingResourceId||null;
        if(!processingResourceId)return null;
      }
      var recipe=recipeFor(type,profile,processingResourceId);
      if(!recipe)return null;
      var one=previewFor({countryId:cid,companyId:company,factoryType:type,quantity:1,
        processingResourceId:processingResourceId,sourcingPolicy:'MIXED',stateSupportRequested:false});
      if(one.status!=='READY'||num(one.maximumAdditionalUnits)===null||one.maximumAdditionalUnits<1)return null;
      var maximum=Math.min(MAX_PROJECTS_PER_PROPOSAL,Math.floor(one.maximumAdditionalUnits));
      var dailyCapacity=num(profile.defaultCapacityPerDay)||0,outputs=recipe.outputs||{},marketSignals=[],demandSupportedUnits=1,
        clock=g.Omega&&g.Omega.Simulation&&g.Omega.Simulation.clock||{},
        daysPerTurn=num(clock.gameDaysPerTurn??clock.daysPerTurn??state()?.simulation?.daysPerTurn??state()?.simulation?.turnDays);
      if(daysPerTurn===null||daysPerTurn<=0)daysPerTurn=1;
      Object.keys(outputs).forEach(function(resourceId){
        var row=quote(resourceId)||{},currentTurnEvidence=num(row.generatedTurn)===turn(),
          matched=currentTurnEvidence?Math.max(0,num(row.matchedQuantity)||0):0,
          bidDepth=currentTurnEvidence?Math.max(0,num(row.bidDepth)||0):0,
          askDepth=currentTurnEvidence?Math.max(0,num(row.askDepth)||0):0,
          price=observedMarketPrice(cid,resourceId),
          referencePrice=num(row.referencePriceUsd===undefined?row.referencePrice:row.referencePriceUsd),
          perUnit=num(outputs[resourceId]),
          oneFactoryTurn=perUnit===null?null:perUnit*dailyCapacity*daysPerTurn,
          oneFactory30Day=perUnit===null?null:perUnit*dailyCapacity*30,
          domesticDemand=currentDomesticDemandEvidence(cid,resourceId),
          domesticOutput=currentDomesticOutputEvidence(cid,resourceId),
          domesticStock=currentProcessedStockEvidence(cid,resourceId),
          domesticNeed30=domesticDemand.status==='CURRENT_TURN'?domesticDemand.demandPerDay*30:null,
          domesticSupply30=(domesticOutput.status==='OBSERVED_ACTIVE_FACTORY_OUTPUT'||domesticOutput.status==='NO_ACTIVE_OUTPUT_RECORDS')&&domesticOutput.existingOutputPerDay!==null?domesticOutput.existingOutputPerDay*30:null,
          unmetDomesticDemand30=domesticNeed30===null||domesticSupply30===null||domesticStock.free===null
            ?null:Math.max(0,domesticNeed30-domesticSupply30-domesticStock.free),
          unmatchedBuyerOrderDepth=currentTurnEvidence&&bidDepth!==null&&matched!==null
            ?Math.max(0,bidDepth-matched):null,
          domesticScaleUnits=unmetDomesticDemand30===null||oneFactory30Day===null||oneFactory30Day<=0
            ?0:Math.ceil(unmetDomesticDemand30/oneFactory30Day),
          orderBookScaleUnits=unmatchedBuyerOrderDepth===null||oneFactoryTurn===null||oneFactoryTurn<=0
            ?0:Math.ceil(unmatchedBuyerOrderDepth/oneFactoryTurn),
          matchedScaleUnits=currentTurnEvidence&&oneFactoryTurn!==null&&oneFactoryTurn>0
            ?Math.ceil(matched/oneFactoryTurn):0,
          signal='UNOBSERVED_OR_STALE',score=-5;
        demandSupportedUnits=Math.max(demandSupportedUnits,domesticScaleUnits,orderBookScaleUnits,matchedScaleUnits);
        if(currentTurnEvidence&&matched>0){
          signal='CURRENT_TURN_MATCHED_ORDER_VOLUME';score=32;
        }else if(currentTurnEvidence&&unmatchedBuyerOrderDepth!==null&&unmatchedBuyerOrderDepth>0){
          signal='CURRENT_TURN_OPEN_BUY_ORDER_DEPTH';score=22;
        }else if(currentTurnEvidence&&((price&&price.unitPrice>0)||(referencePrice!==null&&referencePrice>0))){
          signal='CURRENT_TURN_REFERENCE_PRICE_ONLY';score=8;
        }
        else if(currentTurnEvidence){signal='NO_VERIFIED_MARKET_SIGNAL';score=-4;}
        marketSignals.push({resourceId:resourceId,signal:signal,marketStatus:row.status||'UNAVAILABLE',
          priceDiscovery:row.priceDiscovery||'UNAVAILABLE',generatedTurn:num(row.generatedTurn),
          evaluatedTurn:turn(),currentTurnEvidence:currentTurnEvidence,matchedQuantity:matched,bidDepth:bidDepth,
          askDepth:askDepth,unmatchedBuyerOrderDepth:unmatchedBuyerOrderDepth,
          unmetDomesticDemand30Day:unmetDomesticDemand30,domesticDemandEvidenceStatus:domesticDemand.status,
          domesticOutputEvidenceStatus:domesticOutput.status,processedStockEvidenceStatus:domesticStock.status,
          domesticScaleUnits:domesticScaleUnits,orderBookScaleUnits:orderBookScaleUnits,
          bestBidUsd:num(row.bestBidUsd),bestAskUsd:num(row.bestAskUsd),
          referencePriceUsd:referencePrice,localMarketPrice:price,score:score,
          capacityPerFactoryPerTurn:oneFactoryTurn,capacityPerFactory30Day:oneFactory30Day,
          gameDaysPerTurn:daysPerTurn});
      });
      var quantity=Math.min(maximum,Math.max(1,Math.floor(demandSupportedUnits)));
      var firstInputs=inputForecast(cid,profile,recipe,quantity),
        allDomesticCovered=firstInputs.length>0&&firstInputs.every(function(row){
          return row.available!==null&&row.available+1e-9>=row.forecast30Day;
        }),
        anyDomesticCovered=firstInputs.some(function(row){
          return row.available!==null&&row.available+1e-9>=row.forecast30Day;
        }),
        sourcingPolicy=allDomesticCovered?'DOMESTIC_ONLY':
          anyDomesticCovered?'MIXED':'COMPANY_FUNDED_IMPORTS',
        preview=previewFor({countryId:cid,companyId:company,factoryType:type,quantity:quantity,
          processingResourceId:processingResourceId,sourcingPolicy:sourcingPolicy,stateSupportRequested:false});
      if(preview.status!=='READY')return null;
      var inputRows=preview.inputRequirements||[],marketOpportunity=companyMarketOpportunityAnalysis({countryId:cid},
        Object.keys(outputs).map(function(resourceId){return{resourceId:resourceId};}),inputRows,marketApi),
        domesticDemandScore=marketOpportunity.domesticDemand.reduce(function(score,row){
          return score+(row.status==='DOMESTIC_DEMAND_GAP'?18:row.status==='NO_DOMESTIC_GAP_OBSERVED'?0:-2);
        },0),
        internationalDemandScore=marketOpportunity.internationalDemand.reduce(function(score,row){
          return score+(num(row.globalUnmatchedBuyOrderDepth)>0?10:0)+
            (num(row.unmatchedDemandSupplyGap)>0?8:0)+(num(row.globalMatchedDemand)>0?4:0);
        },0),
        processingOpportunityScore=marketOpportunity.exportProcessingOpportunities.reduce(function(score,row){
          return score+(num(row.matchedRawMaterialExportsFromCountry)>0?8:0);
        },0),
        covered=inputRows.filter(function(row){
        return row.available!==null&&row.available+1e-9>=row.forecast30Day;
      }).length,unobserved=inputRows.filter(function(row){return row.available===null||row.nationalDemandPerDay===null;}).length,
        shortfalls=inputRows.filter(function(row){return row.shortfall!==null&&row.shortfall>1e-9;}).length,
        supplyScore=inputRows.length===0?-6:covered===inputRows.length?20:
          covered>0?8:unobserved>0?-5:-12;
      var operational=preview.operationalReadiness||{},
        operationalScore=operational.status==='READY'?15:operational.status==='SHORTFALL'?-12:-5,
        capital=capitalAccount(cid,company,false),cash=capital?num(capital.availableBalance):null,
        capitalRequired=num(profile.constructionCost)===null?null:num(profile.constructionCost)*quantity,
        capitalScore=cash===null?-4:capitalRequired===null?-2:
          cash+1e-9>=capitalRequired?15:cash>0?7:-2,
        marketScore=marketSignals.length?marketSignals.reduce(function(total,row){return total+row.score;},0)/marketSignals.length:-5,
        duration=num(profile.constructionDays)||num(profile.buildDays),durationScore=duration===null?0:duration<=60?5:duration>=240?-5:0,
        invitationScore=invitation?5:0,
        assessment=proposalDecisionAssessment({countryId:cid,companyId:company,factoryType:type,
          quantity:quantity,processingResourceId:processingResourceId,sourcingPolicy:sourcingPolicy,
          capitalRequired:capitalRequired,capitalUnit:profile.unit||'GAME_CURRENCY_UNITS'},preview),
        unitEconomics=companyUnitEconomics({countryId:cid,factoryType:type,processingResourceId:processingResourceId},
          preview,assessment,marketApi),
        // Investment ranking may use only fully calculated net operating results.
        // A pre-landed imported-input ceiling is not profit until freight, insurance,
        // tariff and route charges are observed and reconciled.
        returnCandidates=[
          unitEconomics.domesticProduction&&unitEconomics.domesticProduction.status==='CALCULATED'
            ?unitEconomics.domesticProduction.netOperatingResult:null,
          unitEconomics.domesticInputExport&&unitEconomics.domesticInputExport.status==='CALCULATED'
            ?unitEconomics.domesticInputExport.netOperatingResult:null,
          unitEconomics.importedInputProduction&&unitEconomics.importedInputProduction.status==='CALCULATED'
            ?unitEconomics.importedInputProduction.actualProfitOrLoss:null
        ].filter(function(value){return num(value)!==null;}).map(function(value){
          return capitalRequired!==null&&capitalRequired>0?Number((num(value)/capitalRequired*100).toFixed(2)):null;
        }).filter(function(value){return value!==null;}),
        bestObserved30DayReturnOnProjectCapitalPct=returnCandidates.length?Math.max.apply(null,returnCandidates):null,
        profitabilityScore=bestObserved30DayReturnOnProjectCapitalPct===null?-3:
          Math.max(-20,Math.min(20,bestObserved30DayReturnOnProjectCapitalPct/5)),
        totalScore=marketScore+supplyScore+operationalScore+capitalScore+durationScore+invitationScore+
          domesticDemandScore+internationalDemandScore+processingOpportunityScore+profitabilityScore;
      return{factoryType:type,factoryName:profile.name||type,processingResourceId:processingResourceId,
        quantity:quantity,maximumAvailableQuantity:maximum,capitalRequired:capitalRequired,
        constructionDurationDays:duration,marketSignals:marketSignals,marketScore:marketScore,
        supplyScore:supplyScore,supplyStatus:allDomesticCovered?'DOMESTIC_INPUTS_COVERED':
          unobserved?'INPUT_DATA_UNOBSERVED':shortfalls?'INPUT_SHORTFALL':'PARTIAL_INPUT_COVERAGE',
        operationalStatus:operational.status||'UNOBSERVED',operationalScore:operationalScore,
        companyCashAvailable:cash,capitalScore:capitalScore,durationScore:durationScore,
        invitationScore:invitationScore,domesticDemandScore:domesticDemandScore,
        internationalDemandScore:internationalDemandScore,processingOpportunityScore:processingOpportunityScore,
        marketOpportunity:marketOpportunity,unitEconomics:unitEconomics,
        bestObserved30DayReturnOnProjectCapitalPct:bestObserved30DayReturnOnProjectCapitalPct,
        profitabilityScore:profitabilityScore,totalScore:totalScore,preview:preview,
        assessment:assessment,sourcingPolicy:sourcingPolicy,
        demandSupportedUnits:demandSupportedUnits};
    }
    var candidates=[],candidateOrder=0,universalEvaluated=0;
    eligible.forEach(function(type){
      if(type==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'){
        var resources=listUniversalProcessingResources();
        if(invitation&&invitation.processingResourceId){
          resources=resources.filter(function(row){return id(row.id)===id(invitation.processingResourceId);});
        }else if(resources.length>MAX_UNIVERSAL_RESOURCE_EVALUATIONS_PER_COMPANY_TURN){
          var offset=((period-1)*MAX_UNIVERSAL_RESOURCE_EVALUATIONS_PER_COMPANY_TURN+companyIndex)%resources.length,
            bounded=[];
          for(var ri=0;ri<MAX_UNIVERSAL_RESOURCE_EVALUATIONS_PER_COMPANY_TURN;ri++)
            bounded.push(resources[(offset+ri)%resources.length]);
          resources=bounded;
        }
        resources.forEach(function(resource){
          universalEvaluated++;
          var candidate=evaluate(type,resource.id);
          if(candidate){candidate.evaluationOrder=candidateOrder++;candidates.push(candidate);}
        });
      }else{
        var candidate=evaluate(type,null);
        if(candidate){candidate.evaluationOrder=candidateOrder++;candidates.push(candidate);}
      }
    });
    if(!candidates.length)return{status:invitation?'INVITATION_NOT_FEASIBLE':'NO_FEASIBLE_COMPANY_INVESTMENT',
      companyId:company,period:period,invitationId:invitation&&invitation.invitationId||null,
      cycleProgress:{processedCompanies:cycle.processedCompanyIds.slice(),remainingCompanies:Math.max(0,COMPANY_IDS.length-cycle.nextCompanyIndex)}};
    candidates.sort(function(a,b){return b.totalScore-a.totalScore||a.evaluationOrder-b.evaluationOrder;});
    var selected=candidates[0],selectedProfile=(catalog()||{}).factoryProfiles[selected.factoryType],
      capital=capitalAccount(cid,company,false),cash=capital?num(capital.availableBalance):null,
      required=selected.capitalRequired,fundingGap=cash===null?null:Math.max(0,(required||0)-cash),
      tenderOffer=invitation&&invitation.supportOffer||{},tenderType=String(tenderOffer.type||'NO_PUBLIC_FINANCING').toUpperCase(),
      tenderMaximum=Math.max(0,num(tenderOffer.maxGovernmentContribution)||0),
      requestedExternalFunding=fundingGap===null?(required||0):fundingGap,
      financingPreference='PRIVATE_SHAREHOLDERS_OR_CORPORATE_FINANCE';
    if(cash!==null&&required!==null&&cash+1e-9>=required)financingPreference='PRIVATE_COMPANY_CAPITAL';
    else if(invitation&&tenderType==='CAPITAL_GRANT'&&tenderMaximum+1e-9>=requestedExternalFunding)
      financingPreference='GOVERNMENT_GRANT';
    else if(invitation&&tenderType==='GOVERNMENT_EQUITY')financingPreference='GOVERNMENT_EQUITY';
    else if(invitation&&tenderType==='LOAN_GUARANTEE')financingPreference='LOAN_GUARANTEE';
    var supportRequested=financingPreference==='GOVERNMENT_GRANT'||
      financingPreference==='GOVERNMENT_EQUITY'||financingPreference==='LOAN_GUARANTEE'||
      !!(invitation&&['INFRASTRUCTURE_SUPPORT','UTILITY_SUPPORT','OFFTAKE_CONTRACT'].indexOf(tenderType)>=0);
    var readiness=selected.preview.operationalReadiness||{},
      utilityShortfall=(readiness.requirements||[]).some(function(row){
        return['ELECTRICITY','WATER'].indexOf(row.type)>=0&&row.status==='SHORTFALL';
      }),
      infrastructureRequested=(readiness.infrastructure||[]).length>0||
        !!(invitation&&tenderType==='INFRASTRUCTURE_SUPPORT'),
      utilitySupportRequested=utilityShortfall||(invitation&&tenderType==='UTILITY_SUPPORT'),
      marketUnproven=selected.marketSignals.every(function(row){
        return['NO_VERIFIED_MARKET_SIGNAL','UNOBSERVED','UNOBSERVED_OR_STALE','CURRENT_TURN_REFERENCE_PRICE_ONLY'].indexOf(row.signal)>=0;
      }),
      offtakeRequested=marketUnproven||(invitation&&tenderType==='OFFTAKE_CONTRACT'),
      inputs=selected.preview.inputRequirements||[],
      gaps=inputs.filter(function(row){return row.shortfall===null||row.shortfall>1e-9;}),
      marketReason=selected.marketSignals.map(function(row){
        return row.resourceId+': '+row.signal.toLowerCase().replace(/_/g,' ');
      }).join('; ')||'no output market evidence is currently recorded',
      supplyReason=inputs.length?inputs.map(function(row){
        return row.resourceId+' '+(row.available===null?'stock/demand unobserved':
          row.shortfall>0?'shortfall '+Number(row.shortfall).toLocaleString('en-US'):'domestic surplus covers forecast');
      }).join('; '):'recipe input evidence unavailable',
      capacityPerDay=selected.preview.requestedDailyCapacity,
      buildDays=selected.constructionDurationDays,
      requestReason=COMPANY_NAMES[company]+' selected '+selected.quantity+' '+selected.factoryName+
        ' unit(s) after comparing its eligible factory opportunities against current output-market signals, '+
        '30-day input availability, utility/workforce readiness and its own recorded capital. '+
        'The observed output-market evidence is '+marketReason+'. The company is submitting its own investment case for an independent government decision.',
      expectedBenefit='The company offers '+Number(capacityPerDay||0).toLocaleString('en-US')+
        ' units/day of modeled capacity ('+Number((Number(capacityPerDay||0)*30).toFixed(2)).toLocaleString('en-US')+
        ' units over 30 days) from '+selected.quantity+' factory unit(s). Its proposed construction duration is '+
        (buildDays===null?'not recorded':buildDays+' days')+'. This is production capacity, not guaranteed customer demand or settled sales.',
      riskForecast='The company accepts the following disclosed exposures: '+supplyReason+
        '. Supply policy: '+selected.sourcingPolicy+'. No supplier is treated as contracted or physically secured until an actual signed commitment, paid shipment and warehouse receipt are recorded. '+
        (gaps.length?'Input gaps or unknown supply remain the company’s responsibility to source and fund. ':'Current stock covers the modeled input forecast, but future replenishment is not guaranteed. ')+
        (readiness.status==='SHORTFALL'?'The company also faces an observed utility/workforce readiness shortfall. ':
          readiness.status==='UNOBSERVED'?'Some utility/workforce evidence is unobserved. ':'')+
        (marketUnproven?'Customer demand and a cleared selling price are not verified; the company may request a public offtake discussion. ':'')+
        (fundingGap===null?'Company cash is not verified and the funding gap remains unresolved. ':
          fundingGap>0?'Recorded company capital leaves a funding gap of '+fundingGap+' '+(selectedProfile.unit||'GAME_CURRENCY_UNITS')+'. ':'')+
        'The company will not treat forecasts, supplier listings or requested public support as settled commitments.',
      strategy={
        schemaVersion:1,actorCompanyId:company,decision:'SUBMIT_COMPANY_INITIATED_INVESTMENT',
        decisionTurn:turn(),selectionMethod:'HIGHEST_CURRENT_MARKET_SUPPLY_OPERATIONAL_AND_CAPITAL_SCORE_WITH_DOMESTIC_DEMAND_GAP_EXPORT_PROCESSING_INTERNATIONAL_ORDER_BOOK_FINANCIAL_FEASIBILITY_AND_PROFITABILITY_EVIDENCE',
        confidence:selected.totalScore>=45?'HIGH':selected.totalScore>=20?'MEDIUM':'LOW',
        horizonDays:30,selectedOpportunity:{factoryType:selected.factoryType,factoryName:selected.factoryName,
          processingResourceId:selected.processingResourceId||null,
          requestedFactoryCount:selected.quantity,totalScore:selected.totalScore,
          marketScore:selected.marketScore,supplyScore:selected.supplyScore,
          domesticDemandScore:selected.domesticDemandScore,internationalDemandScore:selected.internationalDemandScore,
          processingOpportunityScore:selected.processingOpportunityScore,
          operationalScore:selected.operationalScore,capitalScore:selected.capitalScore,
          profitabilityScore:selected.profitabilityScore,
          bestObserved30DayReturnOnProjectCapitalPct:selected.bestObserved30DayReturnOnProjectCapitalPct,
          unitEconomics:clone(selected.unitEconomics),
          marketSignals:clone(selected.marketSignals),marketOpportunity:clone(selected.marketOpportunity),supplyStatus:selected.supplyStatus,
          operationalStatus:selected.operationalStatus,capitalRequired:selected.capitalRequired,
          companyCashAvailable:selected.companyCashAvailable},
        alternativesEvaluated:{factoryCategoryCount:eligible.length,
          universalProcessingResourceCount:universalEvaluated,
          universalProcessingResourceLimit:MAX_UNIVERSAL_RESOURCE_EVALUATIONS_PER_COMPANY_TURN,
          totalCandidateCount:candidates.length},
        alternativesConsidered:candidates.map(function(row){return{factoryType:row.factoryType,
          processingResourceId:row.processingResourceId||null,
          requestedFactoryCount:row.quantity,totalScore:row.totalScore,marketScore:row.marketScore,
          supplyScore:row.supplyScore,domesticDemandScore:row.domesticDemandScore,
          internationalDemandScore:row.internationalDemandScore,processingOpportunityScore:row.processingOpportunityScore,
          operationalScore:row.operationalScore,capitalScore:row.capitalScore,
          profitabilityScore:row.profitabilityScore,
          bestObserved30DayReturnOnProjectCapitalPct:row.bestObserved30DayReturnOnProjectCapitalPct,
          marketSignals:clone(row.marketSignals),marketOpportunity:clone(row.marketOpportunity),supplyStatus:row.supplyStatus,
          operationalStatus:row.operationalStatus};}),
        supplyPlan:{policy:selected.sourcingPolicy,inputs:clone(inputs),
          action:'COMPANY_TO_ARRANGE_DOMESTIC_PURCHASES_OR_COMPANY_FUNDED_IMPORTS',
          proofStatus:selected.supplyStatus,securedAtSubmission:false,
          supplierAvailabilityEvidence:'SEE_COMPANY_SUPPLY_CHAIN_PROOF_AND_LIVE_PRIVATE_BATCH_SOURCES',
          governmentTenderRequest:invitation?{invitationId:invitation.invitationId,
            requestedFactoryCount:num(invitation.quantity),supportOffered:clone(invitation.supportOffer||{})}:null,
          companyOfferedFactoryCount:selected.quantity},
        financingDecision:{preferredStructure:financingPreference,companyCashAvailable:cash,
          capitalRequired:required,fundingGap:fundingGap,externalFundingRequested:requestedExternalFunding,
          privateShareholdingRequested:financingPreference==='PRIVATE_SHAREHOLDERS_OR_CORPORATE_FINANCE',
          requestedPrivateShareholdingBps:fundingGap===null||required===null||required<=0?null:
            Math.max(0,Math.min(10000,Math.round(fundingGap/required*10000))),
          privateShareholdingTerms:'INDICATIVE_PROJECT_FUNDING_SHARE_SUBJECT_TO_COMPANY_VALUATION_AND_NEGOTIATION',
          governmentSupportRequested:supportRequested,tenderInvitationId:invitation&&invitation.invitationId||null},
        governmentTender:invitation?{requestedFactoryCount:num(invitation.quantity),companyOfferedFactoryCount:selected.quantity,
          supportOffer:clone(tenderOffer)}:null,
        reasons:[selected.bestObserved30DayReturnOnProjectCapitalPct===null
          ?'A comparable 30-day return on project capital is not available from current observed prices, demand and cost policy; the company still submits a conservative proposal.'
          :'The company compared its best evidence-backed 30-day net operating return against the construction capital required.',
          selected.marketOpportunity.domesticDemand.some(function(row){return row.status==='DOMESTIC_DEMAND_GAP';})
          ?'The proposal targets an output with an observed domestic demand gap.'
          :'Domestic unmet demand is not fully verified in the current country snapshot.',
          selected.marketOpportunity.exportProcessingOpportunities.some(function(row){return num(row.matchedRawMaterialExportsFromCountry)>0;})
            ?'Current-turn raw-material exports indicate a possible domestic downstream-processing opportunity.'
            :'No current-turn raw-material export-processing signal is verified.',
          selected.marketOpportunity.internationalDemand.some(function(row){return num(row.globalUnmatchedBuyOrderDepth)>0;})
            ?'The global order book shows unmatched buyer-side demand pressure for an output.'
            :'International unmatched buyer demand is unobserved or not material in the current snapshot.',
          selected.marketSignals.some(function(row){return row.signal==='CURRENT_TURN_MATCHED_ORDER_VOLUME'||row.signal==='CURRENT_TURN_OPEN_BUY_ORDER_DEPTH';})
          ?'Selected using observed buyer-side order-book activity.':'No strong buyer-side order-book evidence; research is still requested and project scale remains conservative.',
          selected.supplyStatus==='DOMESTIC_INPUTS_COVERED'?'Current domestic input surplus covers the modeled 30-day requirement.':
            'The company identifies supply gaps or unobserved inputs and submits a sourcing plan instead of claiming secured supply.',
          readiness.status==='READY'?'Recorded utility/workforce diagnostics show operational readiness.':
            'Utility/workforce readiness contains a shortfall or unobserved evidence and is disclosed for government review.'],
        limitations:['A market quote or order-book depth is not a guaranteed future sale.',
          'Potential suppliers are not contracts or delivery commitments.',
          'Share percentages require a defensible valuation before they can be offered as binding terms.']
      };
    var created=createProposal({countryId:cid,companyId:company,operatorCompanyId:company,
      factoryType:selected.factoryType,processingResourceId:selected.processingResourceId,
      quantity:selected.quantity,sourcingPolicy:selected.sourcingPolicy,
      requestReason:requestReason,expectedBenefit:expectedBenefit,riskForecast:riskForecast,
      stateSupportRequested:supportRequested,financingPreference:financingPreference,
      requestedPrivateShareholdingBps:fundingGap===null||required===null||required<=0?null:
        Math.max(0,Math.min(10000,Math.round(fundingGap/required*10000))),
      requestedGovernmentEquityBps:financingPreference==='GOVERNMENT_EQUITY'?
        Math.max(0,num(tenderOffer.governmentEquityBps)||0):0,
      requestedLoanGuarantee:financingPreference==='LOAN_GUARANTEE',
      requestedLoanAmount:financingPreference==='LOAN_GUARANTEE'?requestedExternalFunding:null,
      requestedGovernmentGrantAmount:financingPreference==='GOVERNMENT_GRANT'?
        Math.min(requestedExternalFunding,tenderMaximum||requestedExternalFunding):0,
      publicInfrastructureRequested:infrastructureRequested,
      utilitySupportRequested:utilitySupportRequested===true,
      governmentOfftakeRequested:offtakeRequested===true,
      companyRequestedConditions:[
        'Government permit and any public support must be separately approved and recorded before construction.',
        'Company-funded imports and domestic supply must be paid, dispatched and physically received before construction consumes them.',
        'Any private shareholding percentage remains subject to a defensible company valuation and negotiated shareholder terms.'
      ],
      constructionDurationDays:buildDays,operatingHorizonDays:num(selectedProfile.operatingHorizonDays),
      companyStrategy:strategy,proposalOrigin:invitation?'GOVERNMENT_INVITATION_RESPONSE':'COMPANY_INITIATED',
      governmentInvitationId:invitation&&invitation.invitationId||null,
      requestId:'PE-AUTO:'+cid+':PERIOD:'+period+':'+company});
    if(created.status!=='PROPOSED')return{status:'BLOCKED',reason:created.reason||created.status,companyId:company,period:period};
    var stored=r.proposals.find(function(p){return p.proposalId===created.proposalId;});
    if(stored){
      stored.submissionMode='AUTONOMOUS_COMPANY_TURN_CYCLE';
      stored.submittedBy=company;
      stored.proposalPeriod=period;
      stored.expectedDemandSnapshot=clone(selected.preview.inputRequirements||[]);
      stored.provenance=Object.assign({},stored.provenance||{},{source:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1',
        actor:'AUTONOMOUS_PRIVATE_COMPANY',period:period,simulationOnly:true});
      stored.companyCase=companyBusinessCase(stored);
      if(stored.marketResearchRequest&&stored.companyCase.marketAnalysis)
        stored.companyCase.marketAnalysis.researchRequest=clone(stored.marketResearchRequest);
    }
    if(invitation){
      invitation.responses.push({companyId:company,companyName:COMPANY_NAMES[company],
        proposalId:created.proposalId,status:'PROPOSED',submittedTurn:turn(),
        requestedQuantity:selected.quantity,companyFinancingPreference:financingPreference,
        authority:'AUTONOMOUS_PRIVATE_COMPANY_RESPONSE'});
      recordEvent(cid,'COMPANY_RESPONDED_TO_GOVERNMENT_INVITATION',{invitationId:invitation.invitationId,
        proposalId:created.proposalId,companyId:company});
    }
    recordEvent(cid,'AUTONOMOUS_COMPANY_PROPOSAL_SUBMITTED',{proposalId:created.proposalId,companyId:company,
      factoryType:selected.factoryType,quantity:selected.quantity,selectionScore:selected.totalScore,
      period:period,invitationId:invitation&&invitation.invitationId||null});
    return{status:'PROPOSED',proposal:getProposal(cid,created.proposalId),period:period,
      invitationId:invitation&&invitation.invitationId||null,companyDecision:clone(strategy),
      cycleProgress:{processedCompanies:cycle.processedCompanyIds.slice(),
        completedCompanies:cycle.nextCompanyIndex,remainingCompanies:Math.max(0,COMPANY_IDS.length-cycle.nextCompanyIndex),
        status:cycle.status},
      authority:'SELECTED_COUNTRY_COMPANY_INVESTMENT_DECISION_ENGINE'};
  }
  function scheduleAutonomousProposalCycle(){
    var cid=playerCountry(),period=Math.floor(turn()/30);
    if(!cid||period<1)return;
    var r=runtime(cid,true),cycle=r.autonomousProposalCycle,scheduledTurn=turn();
    if(r.lastAutonomousProposalPeriod===period||
       (obj(cycle)&&num(cycle.period)===period&&
        (cycle.status==='COMPLETE'||num(cycle.nextCompanyIndex)>=COMPANY_IDS.length||
         num(cycle.lastProcessedTurn)===scheduledTurn))||
       num(r.pendingAutonomousProposalTurn)===scheduledTurn)return;
    r.pendingAutonomousProposalTurn=scheduledTurn;
    // Clear the old period-scoped marker when migrating a saved session from the
    // previous scheduler. The new in-flight guard is turn-scoped.
    if(num(r.pendingAutonomousProposalPeriod)===period)r.pendingAutonomousProposalPeriod=null;
    var registry=g.OmegaPrivateEnterpriseRegistryV1||(g.Omega&&g.Omega.PrivateEnterpriseRegistryV1);
    var ready;
    try{ready=registry&&registry.ready;}catch(error){ready=Promise.reject(error);}
    Promise.resolve(ready).then(function(){
      var current=runtime(cid,true);
      if(current&&num(current.pendingAutonomousProposalTurn)===scheduledTurn)
        current.pendingAutonomousProposalTurn=null;
      if(playerCountry()!==cid||turn()!==scheduledTurn||Math.floor(turn()/30)!==period)return;
      advanceAutonomousProposalCycle();
    }).catch(function(){
      var current=runtime(cid,true);
      if(current&&num(current.pendingAutonomousProposalTurn)===scheduledTurn)
        current.pendingAutonomousProposalTurn=null;
    });
  }
  function onCommittedSimulationTurn(event){
    // Construction completion is emitted during SIMULATE, before the authoritative
    // world state is committed. Reconcile private assets again after COMMIT so the
    // lifecycle never relies on a pre-commit factory-array snapshot.
    var detail=event&&event.detail?event.detail:(event||{}),cid=canonicalCountry(
      detail.countryId||detail.playerCountryId||playerCountry()),active=playerCountry();
    if(!cid||cid!==active)return;
    var resource=countryBucket('resource',cid,false)||{},
      projects=resource.industrialNetwork&&Array.isArray(resource.industrialNetwork.projects)
        ?resource.industrialNetwork.projects:[],
      economy=countryBucket('economy',cid,false)||{},
      assets=Array.isArray(economy.productionAssets)?economy.productionAssets:[],
      r=runtime(cid,false);
    if(r&&Array.isArray(r.proposals)&&projects.length&&assets.length){
      projects.forEach(function(project){
        if(!project||project.projectType!=='FACTORY_CONSTRUCTION'||
           String(project.status||'').toUpperCase()!=='COMPLETED'||
           !project.sourcePrivateProposalId)return;
        var proposal=r.proposals.find(function(row){return row&&row.proposalId===project.sourcePrivateProposalId;});
        if(!proposal||['DENIED','DEFERRED','CLOSED'].indexOf(String(proposal.status||'').toUpperCase())>=0)return;
        var factoryId=String(project.factoryId||'');
        var asset=assets.find(function(row){return row&&String(row.id||row.factoryId||row.assetId||'')===factoryId;});
        if(!asset||asset.productionEnabled===true||
           asset.blockedReason!=='PRIVATE_FACTORY_PRODUCTION_RUNTIME_UNAVAILABLE')return;
        // This call rechecks the permit, approval, settled funding, capex ledger,
        // construction project, owner/operator and all sovereign control rights.
        applyCommissionedAsset(cid,project);
      });
    }
    scheduleAutonomousProposalCycle();
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
    if((num(account.availableBalance)||0)<=1e-9&&(num(account.reservedBalance)||0)<=1e-9&&
       (num(account.capitalRaised)||0)<=1e-9&&(num(account.capitalSpent)||0)<=1e-9){
      account.currency=expectedCurrency;
    }else if(id(account.currency)!==expectedCurrency){
      return{status:'BLOCKED',reason:'COMPANY_CAPITAL_ACCOUNT_CURRENCY_MISMATCH',accountCurrency:account.currency||null,sourceCurrency:expectedCurrency};
    }
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
    var competitionRestriction=activeCompetitionExpansionRestriction(cid,proposal.companyId,proposal.processingResourceId,proposal);
    if(competitionRestriction)return{status:'BLOCKED',reason:'ANTITRUST_EXPANSION_RESTRICTION_ACTIVE',
      competitionCaseId:competitionRestriction.caseId,restriction:clone(competitionRestriction)};
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
    var competitionRestriction=activeCompetitionExpansionRestriction(cid,proposal.companyId,proposal.processingResourceId,proposal);
    if(competitionRestriction)return{status:'BLOCKED',reason:'ANTITRUST_EXPANSION_RESTRICTION_ACTIVE',
      competitionCaseId:competitionRestriction.caseId,restriction:clone(competitionRestriction)};
    var permit=proposal.permit;
    if(!permit||permit.status!=='ACTIVE'||permit.permitId!==proposal.decision?.permitId)
      return{status:'BLOCKED',reason:'ACTIVE_GOVERNMENT_PERMIT_REQUIRED'};
    if(turn()>(num(permit.expiresAtTurn)||0))return{status:'BLOCKED',reason:'GOVERNMENT_PERMIT_EXPIRED',permitId:permit.permitId,expiresAtTurn:permit.expiresAtTurn};
    if(num(permit.quantity)!==proposal.quantity||permit.companyId!==proposal.companyId||
       permit.operatorCompanyId!==(proposal.operatorCompanyId||proposal.companyId))
      return{status:'BLOCKED',reason:'GOVERNMENT_PERMIT_SCOPE_MISMATCH'};
    var n=network(),c=catalog()||{},profile=c.factoryProfiles&&c.factoryProfiles[proposal.factoryType];
    if(!n||typeof n.startFactoryProject!=='function'||!profile)return{status:'BLOCKED',reason:'CANONICAL_FACTORY_CONSTRUCTION_RUNTIME_UNAVAILABLE'};
    var preflightResource=countryBucket('resource',cid,false)||{};
    var preflightDemand=obj(preflightResource.demandRuntime)?clone(preflightResource.demandRuntime):null;
    var preflightRecipe=recipeFor(proposal.factoryType,(catalog()||{}).factoryProfiles&&catalog().factoryProfiles[proposal.factoryType],proposal.processingResourceId);
    var preflightResourceId=Object.keys(preflightRecipe&&preflightRecipe.inputs||{})[0]||'';
    var preflightStockProbe=preflightResourceId?resourceAvailable(cid,preflightResourceId,preflightResource):null;
    var latest=previewFor(proposal);
    var postflightResource=countryBucket('resource',cid,false)||{};
    var postflightDemand=obj(postflightResource.demandRuntime)?clone(postflightResource.demandRuntime):null;
    var demandEvidence={countryId:cid,proposalCountryId:proposal.countryId,turn:turn(),
      before:preflightDemand,stockProbe:preflightStockProbe,after:postflightDemand};
    if(latest.status!=='READY')
      return{status:'BLOCKED',reason:latest.reason||'PRIVATE_FACTORY_PRECONSTRUCTION_PREVIEW_BLOCKED',preview:latest,demandEvidence:demandEvidence};
    if(latest.unobservedInputs&&latest.unobservedInputs.length)
      return{status:'BLOCKED',reason:'FACTORY_INPUT_STOCK_OR_DEMAND_UNOBSERVED',unobservedInputs:clone(latest.unobservedInputs),preview:latest,demandEvidence:demandEvidence};
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
    if(remainingQuantity===0&&unsettledExisting===0){
      // Preserve the public idempotent contract once all requested units and CAPEX receipts exist.
      return{status:'DUPLICATE',started:[],failures:[],proposal:clone(proposal)};
    }
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
        resourceId:proposal.processingResourceId||undefined,
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
    var competitionRestriction=activeCompetitionExpansionRestriction(cid,company,proposal.processingResourceId,proposal);
    if(competitionRestriction)return{status:'BLOCKED',reason:'ANTITRUST_EXPANSION_RESTRICTION_ACTIVE',
      competitionCaseId:competitionRestriction.caseId,restriction:clone(competitionRestriction)};
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
       (proposal.processingResourceId&&token(input.resourceId||'')!==token(proposal.processingResourceId))||
       (proposal.recipeId&&String(input.recipeId||'')!==String(proposal.recipeId))||
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
  function productionRuntimeCapabilityReady(){
    var industrial=network(),catalogue=catalog();
    var requiredRuntimeMethods=[
      'loadCatalog','executeSitePipeline','advanceShipments','advanceProjects',
      'startFactoryProductionCycle','executeFactoryCycle','processPendingFactoryInputs'
    ];
    if(!industrial||!requiredRuntimeMethods.every(function(name){return typeof industrial[name]==='function';}))return false;
    var profiles=catalogue&&catalogue.factoryProfiles;
    var recipes=catalogue&&(catalogue.processingRules||catalogue.downstreamFactoryRecipes);
    return !!(obj(profiles)&&Object.keys(profiles).length>0&&obj(recipes)&&Object.keys(recipes).length>0);
  }
  function sab34LiveBrowserProofAccepted(){
    var proof=g.OmegaSAB34LiveBrowserProofV1||(g.Omega&&g.Omega.SAB34LiveBrowserProofV1);
    if(!proof||proof.schemaVersion!==1||proof.status!=='VERIFIED'||
       proof.authority!=='SAB34_LIVE_BROWSER_ACCEPTANCE_CERTIFICATE_V1'||
       proof.workflow!=='OMEGA Private Enterprise Real Browser E2E'||proof.browser!=='Chromium'||
       !/^[a-f0-9]{40}$/i.test(String(proof.proofCommitSha||'')))return false;
    var runId=String(proof.workflowRunId||'');
    if(!/^[0-9]+$/.test(runId)||
       String(proof.workflowRunUrl||'')!=='https://github.com/Sabab-tech/world-map-strategy-/actions/runs/'+runId||
       !proof.verifiedAt||!Number.isFinite(Date.parse(String(proof.verifiedAt))))return false;
    var stages=proof.stages||{};
    var requiredStages=[
      'realAppBoot','siteMarkerSelection','siteExtractionAndMineDispatch','mineReceiptAndFactoryDispatch',
      'factoryReceiptAndInputLot','finishedGoodsAndMarketLineage','selectedCountryIsolation','indexedDbSaveLoadReplay'
    ];
    return requiredStages.every(function(stage){return stages[stage]===true;});
  }
  function productionGateReason(){
    if(!productionRuntimeCapabilityReady())return'PRIVATE_FACTORY_PRODUCTION_RUNTIME_UNAVAILABLE';
    if(!sab34LiveBrowserProofAccepted())return'SAB34_LIVE_BROWSER_SITE_TO_FACTORY_PROOF_NOT_ACCEPTED';
    return null;
  }
  function productionProofReady(){return productionGateReason()===null;}
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
    var competitionRestriction=activeCompetitionExpansionRestriction(cid,company,proposal.processingResourceId,proposal);
    if(competitionRestriction){
      asset.productionEnabled=false;asset.status='BLOCKED';
      asset.productionStatus='ANTITRUST_EXPANSION_RESTRICTION_ACTIVE';
      asset.blockedReason='ANTITRUST_EXPANSION_RESTRICTION_ACTIVE';
      asset.competitionCaseId=competitionRestriction.caseId;
      asset.productionHealth={status:'STOPPED',productivityPct:0,reason:'ANTITRUST_EXPANSION_RESTRICTION_ACTIVE',
        updatedTurn:turn(),authority:'OMEGA_PRIVATE_MARKET_COMPETITION_RUNTIME'};
      return null;
    }
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
    asset.ownerId=company;asset.ownerCompanyId=company;asset.ownerType='PRIVATE_ENTERPRISE';
    asset.operatorId=operatorCompany;asset.operatorCompanyId=operatorCompany;asset.operatorType='PRIVATE_COMPANY_OPERATOR';
    asset.companyId=operatorCompany;asset.stateControlRights=clone(project.stateControlRights||{});
    asset.privatePermitId=permit.permitId;asset.privatePermitStatus=permit.status;asset.privatePermitAuthority=permit.authority;
    asset.ownershipStatus='PRIVATE_COMPANY_OWNED';asset.operatorStatus='PRIVATE_COMPANY_OPERATED';
    asset.sourcePrivateProposalId=project.sourcePrivateProposalId;asset.sourcePrivateDecisionId=project.sourcePrivateDecisionId||null;
    asset.sourcePrivateFundingId=project.sourcePrivateFundingId||null;asset.constructionProjectId=project.projectId;
    var resource=countryBucket('resource',cid,false)||{},projects=resource.industrialNetwork&&resource.industrialNetwork.projects||[];
    var canonicalProject=projects.find(function(row){return row&&row.projectId===project.projectId;});
    if(!privateCommissioningRecordVerified(cid,proposal,canonicalProject,asset)){
      asset.productionEnabled=false;asset.status='BLOCKED';
      asset.productionStatus='PRIVATE_FACTORY_PROVENANCE_VERIFICATION_FAILED';
      asset.blockedReason='PRIVATE_FACTORY_PROVENANCE_VERIFICATION_FAILED';
      asset.productionHealth={status:'STOPPED',productivityPct:0,reason:'PRIVATE_FACTORY_PROVENANCE_VERIFICATION_FAILED',
        updatedTurn:turn(),authority:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1'};
      return null;
    }
    var gateReason=productionGateReason(),productionReady=!gateReason;
    var runtimeStatus=String(asset.privateCommissionedStatus||asset.status||'OPERATIONAL').toUpperCase();
    if(!asset.privateCommissionedStatus)asset.privateCommissionedStatus=runtimeStatus;
    asset.productionEnabled=productionReady&&runtimeStatus==='OPERATIONAL';
    if(gateReason){
      asset.status='BLOCKED';asset.productionStatus=gateReason;
      asset.productionHealth={status:'STOPPED',productivityPct:0,reason:gateReason,updatedTurn:turn(),authority:'OMEGA_PRIVATE_ENTERPRISE_PIPELINE_GATE'};
      asset.blockedReason=gateReason;
    }else if(runtimeStatus!=='OPERATIONAL'){
      asset.productionStatus='FACTORY_RUNTIME_REQUIREMENTS_PENDING';asset.blockedReason='FACTORY_RUNTIME_REQUIREMENTS_PENDING';
    }else{
      asset.status=runtimeStatus;asset.productionStatus='READY_FOR_EXISTING_FACTORY_OPERATION_GATES';asset.blockedReason=null;
    }
    if(proposal){
      if(!Array.isArray(proposal.commissionedFactoryIds))proposal.commissionedFactoryIds=[];
      if(proposal.commissionedFactoryIds.indexOf(asset.id)<0)proposal.commissionedFactoryIds.push(asset.id);
      var all=proposal.projectIds.every(function(projectId){var row=projects.find(function(x){return x.projectId===projectId;});return row&&row.status==='COMPLETED';});
      if(all&&proposal.commissionedFactoryIds.length>=proposal.projectIds.length){
        proposal.status=productionReady&&asset.productionEnabled?'COMMISSIONED':'COMMISSIONED_PRODUCTION_GATED';
        proposal.updatedTurn=turn();proposal.productionEnabled=productionReady&&asset.productionEnabled;
        proposal.commissioning={status:proposal.status,productionEnabled:proposal.productionEnabled,
          gateReason:gateReason||null,
          commissionedFactoryIds:proposal.commissionedFactoryIds.slice(),turn:turn()};
      }else proposal.status='UNDER_CONSTRUCTION';
    }
    recordEvent(cid,'PRIVATE_FACTORY_COMMISSIONED',{projectId:project.projectId,proposalId:project.sourcePrivateProposalId,factoryId:asset.id,companyId:company,
      productionEnabled:asset.productionEnabled,blockedReason:asset.blockedReason||null});
    return asset;
  }
  function refreshCommissionedProductionGate(country,factoryId){
    var cid=canonicalCountry(country||playerCountry());
    var gateReason=productionGateReason();
    if(cid!==playerCountry())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    if(gateReason)return{status:'BLOCKED',reason:gateReason};
    var econ=countryBucket('economy',cid,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],
      target=assets.find(function(a){return String(a.id||a.factoryId||'')===String(factoryId||'');});
    var owner=target&&id(target.ownerCompanyId||target.ownerId),operator=target&&id(target.operatorCompanyId||target.operatorId||target.companyId);
    var companyStatuses=(runtime(cid,false)||{}).companyStatuses||{};
    var ownerStatus=String(companyStatuses[owner]||'ACTIVE').toUpperCase(),operatorStatus=String(companyStatuses[operator]||'ACTIVE').toUpperCase();
    if(['INSOLVENT','CLOSED'].indexOf(ownerStatus)>=0||['INSOLVENT','CLOSED'].indexOf(operatorStatus)>=0)
      return{status:'BLOCKED',reason:'PRIVATE_COMPANY_STATUS_BLOCKS_FACTORY_OPERATION',ownerCompanyStatus:ownerStatus,operatorCompanyStatus:operatorStatus};
    if(!target||COMPANY_IDS.indexOf(owner)<0||COMPANY_IDS.indexOf(operator)<0||
       String(target.ownerType||'').toUpperCase()!=='PRIVATE_ENTERPRISE')return{status:'BLOCKED',reason:'PRIVATE_FACTORY_NOT_FOUND'};
    var proposal=runtime(cid,false)?.proposals.find(function(p){return p.proposalId===target.sourcePrivateProposalId;});
    if(!proposal)return{status:'BLOCKED',reason:'PRIVATE_PROPOSAL_NOT_FOUND'};
    var targetProject=(countryBucket('resource',cid,false)||{}).industrialNetwork?.projects||[];
    var targetProjectRow=targetProject.find(function(row){return row&&row.projectId===target.constructionProjectId;});
    if(!privateCommissioningRecordVerified(cid,proposal,targetProjectRow,target))
      return{status:'BLOCKED',reason:'PRIVATE_FACTORY_PERMIT_FINANCE_OR_CONSTRUCTION_PROVENANCE_NOT_VERIFIED'};
    var restored=[];
    // Validate and restore only the factory whose operation gate requested this check.
    // Restoring every sibling here makes N asset checks repeatedly scan N assets and N ledger rows.
    if(privateCommissioningRecordVerified(cid,proposal,targetProjectRow,target)&&
       ['PRIVATE_FACTORY_PRODUCTION_RUNTIME_UNAVAILABLE','SAB34_LIVE_BROWSER_SITE_TO_FACTORY_PROOF_NOT_ACCEPTED'].indexOf(target.blockedReason)>=0){
      var original=String(target.privateCommissionedStatus||'OPERATIONAL').toUpperCase();
      target.status=original;target.productionEnabled=original==='OPERATIONAL';
      target.productionStatus=target.productionEnabled?'READY_FOR_EXISTING_FACTORY_OPERATION_GATES':'FACTORY_RUNTIME_REQUIREMENTS_PENDING';
      target.blockedReason=target.productionEnabled?null:'FACTORY_RUNTIME_REQUIREMENTS_PENDING';
      if(target.productionEnabled)target.productionHealth={status:'STOPPED',productivityPct:0,reason:'NO_FACTORY_INPUTS',updatedTurn:turn(),authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'};
      restored.push(String(target.id||target.factoryId));
    }
    const commissionedIds=Array.isArray(proposal.commissionedFactoryIds)?proposal.commissionedFactoryIds:[];
    const assetById=new Map(assets.map(function(asset){return[String(asset.id||asset.factoryId||''),asset];}));
    var allReady=commissionedIds.length===proposal.quantity&&commissionedIds.every(function(assetId){
      var asset=assetById.get(String(assetId));
      return asset&&String(asset.status||'').toUpperCase()==='OPERATIONAL'&&asset.productionEnabled===true;
    });
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
      proposals:r?clone(r.proposals):[],governmentInvitations:r?clone(r.governmentInvitations||[]):[],
      marketResearchRequests:r?clone(r.marketResearchRequests||[]):[],
      events:r?clone(r.events):[],capitalAccounts:clone(accounts),
      companyIds:COMPANY_IDS.slice(),productionEnabled:productionProofReady(),
      pipelineGate:productionGateReason()||'VERIFIED',productionGateReason:productionGateReason()};
  }
  function getCompanyCapitalSummary(country,company){
    var a=capitalAccount(country,id(company),false);return a?clone(a):{companyId:id(company),currency:'GAME_CURRENCY_UNITS',
      availableBalance:0,reservedBalance:0,capitalRaised:0,capitalSpent:0,revision:0};
  }

  function companyFlowAccount(country,company){
    var econ=countryBucket('economy',country,false)||{},accounts=obj(econ.companyAccounts)?econ.companyAccounts:{};
    return obj(accounts[company])?accounts[company]:null;
  }

  function observedCompanyCurrency(country){
    var finance=financeBucket(country,false)||{},econ=countryBucket('economy',country,false)||{},trade=countryBucket('trade',country,false)||{};
    return id(trade.settlementCurrency||finance.currencyCode||econ.currency_code||econ.currencyCode||'')||null;
  }
  function privateCompanyWallet(country,company,currency,create){
    var expected=id(currency),account=capitalAccount(country,company,create);
    if(!account)return{ok:false,reason:'COMPANY_WALLET_UNAVAILABLE'};
    if(!expected)return{ok:false,reason:'COMPANY_WALLET_CURRENCY_UNOBSERVED'};
    var funds=(num(account.availableBalance)||0)+(num(account.reservedBalance)||0)+(num(account.capitalRaised)||0)+(num(account.capitalSpent)||0);
    if(funds<=1e-9&&(num(account.availableBalance)||0)<=1e-9&&(num(account.reservedBalance)||0)<=1e-9){
      account.currency=expected;
    }else if(id(account.currency)!==expected){
      return{ok:false,reason:'COMPANY_WALLET_CURRENCY_MISMATCH',accountCurrency:account.currency||null,expectedCurrency:expected};
    }
    return{ok:true,account:account,currency:expected};
  }
  function reservePrivateCompanyImport(input){
    input=input||{};
    var buyerCountry=canonicalCountry(input.buyerCountryId||playerCountry()),sellerCountry=canonicalCountry(input.sellerCountryId),
      buyerCompany=id(input.buyerCompanyId),sellerCompany=id(input.sellerCompanyId),settlementId=String(input.settlementId||'').trim(),
      buyerAmount=num(input.buyerAmount),sellerAmount=num(input.sellerAmount),quantity=num(input.quantity),
      buyerCurrency=id(input.buyerCurrency),sellerCurrency=id(input.sellerCurrency),
      buyerPurchaseAmount=num(input.buyerPurchaseAmount)??num(input.buyerAmount),buyerTariffAmount=num(input.buyerTariffAmount)??0;
    if(buyerCountry!==playerCountry()||!sellerCountry||sellerCountry===buyerCountry)
      return{status:'BLOCKED',reason:'PRIVATE_IMPORT_COUNTRY_SCOPE_INVALID'};
    if(COMPANY_IDS.indexOf(buyerCompany)<0||COMPANY_IDS.indexOf(sellerCompany)<0)
      return{status:'BLOCKED',reason:'PRIVATE_IMPORT_COMPANY_ID_INVALID'};
    var buyerLifecycle=runtime(buyerCountry,false)||{},sellerLifecycle=runtime(sellerCountry,false)||{},
      buyerCompanyStatus=String((buyerLifecycle.companyStatuses||{})[buyerCompany]||'ACTIVE').toUpperCase(),
      sellerCompanyStatus=String((sellerLifecycle.companyStatuses||{})[sellerCompany]||'ACTIVE').toUpperCase(),
      buyerSolvency=evaluateCompanySolvency(buyerCountry,buyerCompany);
    if(buyerCompanyStatus!=='ACTIVE'||buyerSolvency.status==='INSOLVENT')
      return{status:'BLOCKED',reason:'BUYER_COMPANY_STATUS_BLOCKS_NEW_IMPORT',
        companyStatus:buyerCompanyStatus,solvencyStatus:buyerSolvency.status,solvencyReason:buyerSolvency.reason};
    if(sellerCompanyStatus==='CLOSED')return{status:'BLOCKED',reason:'SELLER_COMPANY_CLOSED'};
    if(!settlementId||buyerAmount===null||buyerAmount<=0||sellerAmount===null||sellerAmount<=0||
       buyerPurchaseAmount===null||buyerPurchaseAmount<=0||buyerTariffAmount===null||buyerTariffAmount<0||
       Math.abs(buyerPurchaseAmount+buyerTariffAmount-buyerAmount)>1e-6||quantity===null||quantity<=0||!buyerCurrency||!sellerCurrency)
      return{status:'BLOCKED',reason:'PRIVATE_IMPORT_PAYMENT_FIELDS_INVALID'};
    if(buyerCurrency!==observedCompanyCurrency(buyerCountry)||sellerCurrency!==observedCompanyCurrency(sellerCountry))
      return{status:'BLOCKED',reason:'PRIVATE_IMPORT_COUNTRY_CURRENCY_NOT_RECONCILED',
        observedBuyerCurrency:observedCompanyCurrency(buyerCountry),observedSellerCurrency:observedCompanyCurrency(sellerCountry)};
    var wallet=privateCompanyWallet(buyerCountry,buyerCompany,buyerCurrency,true);
    if(!wallet.ok)return{status:'BLOCKED',reason:wallet.reason,details:wallet};
    var root=financeRoot(buyerCountry,true),reservations=obj(root.companyTradeReservations)?root.companyTradeReservations:{};
    var prior=reservations[settlementId];
    var payload={settlementId:settlementId,buyerCountryId:buyerCountry,sellerCountryId:sellerCountry,
      buyerCompanyId:buyerCompany,sellerCompanyId:sellerCompany,buyerAmount:Number(buyerAmount.toFixed(2)),
      buyerPurchaseAmount:Number(buyerPurchaseAmount.toFixed(2)),buyerTariffAmount:Number(buyerTariffAmount.toFixed(2)),
      sellerAmount:Number(sellerAmount.toFixed(2)),buyerCurrency:buyerCurrency,sellerCurrency:sellerCurrency,
      requestId:String(input.requestId||'').trim()||null,
      quantity:Number(quantity.toFixed(6)),resourceId:String(input.resourceId||''),unitPrice:num(input.unitPrice),
      status:'RESERVED',createdTurn:turn(),authority:'OMEGA_PRIVATE_COMPANY_TRADE_CASH_V1'};
    if(prior){
      var same=prior.buyerCountryId===buyerCountry&&prior.sellerCountryId===sellerCountry&&
        prior.buyerCompanyId===buyerCompany&&prior.sellerCompanyId===sellerCompany&&
        Math.abs((num(prior.buyerAmount)||0)-buyerAmount)<=1e-8&&
        Math.abs(((num(prior.buyerPurchaseAmount)??num(prior.buyerAmount))||0)-buyerPurchaseAmount)<=1e-8&&
        Math.abs((num(prior.buyerTariffAmount)||0)-buyerTariffAmount)<=1e-8&&
        Math.abs((num(prior.sellerAmount)||0)-sellerAmount)<=1e-8&&prior.buyerCurrency===buyerCurrency&&prior.sellerCurrency===sellerCurrency&&
        Math.abs((num(prior.quantity)||0)-quantity)<=1e-8&&prior.resourceId===payload.resourceId;
      return same?{status:prior.status==='RESERVED'?'DUPLICATE':prior.status,reservation:clone(prior)}:
        {status:'BLOCKED',reason:'PRIVATE_IMPORT_SETTLEMENT_ID_COLLISION'};
    }
    var held=Object.keys(reservations).reduce(function(sum,key){
      var row=reservations[key];
      return sum+((row&&row.buyerCompanyId===buyerCompany&&row.status==='RESERVED')?Math.max(0,num(row.buyerAmount)||0):0);
    },0);
    // Capital construction reservations are already removed from availableBalance by fundProposal().
    // Only subtract outstanding private-trade reservations here, or capex is reserved twice.
    var available=Math.max(0,(num(wallet.account.availableBalance)||0)-held);
    if(available+1e-8<buyerAmount)return{status:'BLOCKED',reason:'INSUFFICIENT_PRIVATE_COMPANY_IMPORT_CASH',
      companyId:buyerCompany,available:available,required:buyerAmount,currency:buyerCurrency};
    reservations[settlementId]=payload;root.companyTradeReservations=reservations;
    recordEvent(buyerCountry,'PRIVATE_COMPANY_IMPORT_CASH_RESERVED',{settlementId:settlementId,buyerCompanyId:buyerCompany,
      sellerCountryId:sellerCountry,sellerCompanyId:sellerCompany,buyerAmount:payload.buyerAmount,currency:buyerCurrency});
    return{status:'RESERVED',reservation:clone(payload),availableAfterReservation:Number((available-buyerAmount).toFixed(2))};
  }
  function cancelPrivateCompanyImport(input){
    input=input||{};
    var cid=canonicalCountry(input.buyerCountryId||playerCountry()),settlementId=String(input.settlementId||'').trim(),
      root=financeRoot(cid,false),reservations=root&&root.companyTradeReservations||{},row=reservations[settlementId];
    if(cid!==playerCountry()||!row)return{status:'BLOCKED',reason:'PRIVATE_IMPORT_RESERVATION_NOT_FOUND'};
    if(row.status==='CANCELLED')return{status:'DUPLICATE',reservation:clone(row)};
    if(row.status==='FAILED')return{status:'DUPLICATE',reason:'PRIVATE_IMPORT_RESERVATION_ALREADY_FAILED',reservation:clone(row)};
    if(row.status!=='RESERVED')return{status:'BLOCKED',reason:'PRIVATE_IMPORT_RESERVATION_ALREADY_FINALIZED',currentStatus:row.status};
    row.status='CANCELLED';row.cancelledTurn=turn();row.cancellationReason=String(input.reason||'TRADE_SETTLEMENT_ABORTED');
    recordEvent(cid,'PRIVATE_COMPANY_IMPORT_CASH_RELEASED',{settlementId:settlementId,buyerCompanyId:row.buyerCompanyId,reason:row.cancellationReason});
    return{status:'CANCELLED',reservation:clone(row)};
  }
  function postPrivateTradeCashFlow(country,company,input){
    var econ=countryBucket('economy',country,true),accounts=obj(econ.companyAccounts)?econ.companyAccounts:{};
    var co=id(company),account=obj(accounts[co])?accounts[co]:null;
    if(!account)account={companyId:co,openingCashStatus:'UNKNOWN',runtimeNetCashFlow:0,grossRevenue:0,
      paymentsReceived:0,paymentsMade:0,taxPaid:0,workerIncomePaid:0,transportPaid:0,supplierRevenue:0,lastTurn:turn()};
    var entries=Array.isArray(account.cashFlowEntries)?account.cashFlowEntries:[];
    var entryId=String(input.entryId||''),amount=num(input.amount),direction=String(input.direction||'').toUpperCase(),
      category=String(input.category||'').toUpperCase(),currency=id(input.currency),sourceId=String(input.sourceId||'');
    if(!entryId||amount===null||amount<=0||!['CREDIT','DEBIT'].includes(direction)||!category||!currency||!sourceId)
      return{status:'BLOCKED',reason:'PRIVATE_TRADE_CASHFLOW_FIELDS_INVALID'};
    var prior=entries.find(function(row){return row&&row.entryId===entryId;});
    if(prior){
      if(String(prior.status||'').toUpperCase()==='REVERSED')
        return{status:'BLOCKED',reason:'PRIVATE_TRADE_CASHFLOW_ENTRY_PREVIOUSLY_REVERSED',entry:clone(prior)};
      var same=Math.abs((num(prior.amount)||0)-amount)<=1e-8&&prior.direction===direction&&
        prior.category===category&&id(prior.currency)===currency&&String(prior.sourceId||'')===sourceId;
      return same?{status:'DUPLICATE',entry:clone(prior)}:{status:'BLOCKED',reason:'PRIVATE_TRADE_CASHFLOW_IDEMPOTENCY_COLLISION'};
    }
    account.runtimeNetCashFlow=(num(account.runtimeNetCashFlow)||0)+(direction==='CREDIT'?amount:-amount);
    if(direction==='CREDIT'){
      account.paymentsReceived=(num(account.paymentsReceived)||0)+amount;
      account.grossRevenue=(num(account.grossRevenue)||0)+amount;
      account.supplierRevenue=(num(account.supplierRevenue)||0)+amount;
    }else account.paymentsMade=(num(account.paymentsMade)||0)+amount;
    if(account.cashFlowJournalStartedAtTurn===undefined||account.cashFlowJournalStartedAtTurn===null)
      account.cashFlowJournalStartedAtTurn=turn();
    account.cashFlowJournalVersion=1;
    var row={entryId:entryId,companyId:co,amount:Number(amount.toFixed(2)),direction:direction,
      category:category,currency:currency,sourceId:sourceId,turn:turn(),status:'POSTED',
      authority:'OMEGA_PRIVATE_COMPANY_TRADE_CASH_V1'};
    entries.push(row);
    while(entries.length>2048){
      var dropped=entries.shift(),droppedTurn=num(dropped&&dropped.turn);
      account.cashFlowJournalDroppedEntries=(num(account.cashFlowJournalDroppedEntries)||0)+1;
      if(droppedTurn!==null){
        var earliest=num(account.cashFlowJournalEarliestDroppedTurn);
        account.cashFlowJournalEarliestDroppedTurn=earliest===null?droppedTurn:Math.min(earliest,droppedTurn);
      }
    }
    account.cashFlowEntries=entries;account.lastTurn=turn();accounts[co]=account;econ.companyAccounts=accounts;
    return{status:'POSTED',entry:clone(row)};
  }
  function completePrivateCompanyImport(input){
    input=input||{};
    var buyerCountry=canonicalCountry(input.buyerCountryId||playerCountry()),sellerCountry=canonicalCountry(input.sellerCountryId),
      settlementId=String(input.settlementId||'').trim(),buyerCompany=id(input.buyerCompanyId),sellerCompany=id(input.sellerCompanyId),
      buyerAmount=num(input.buyerAmount),sellerAmount=num(input.sellerAmount),quantity=num(input.quantity),
      buyerCurrency=id(input.buyerCurrency),sellerCurrency=id(input.sellerCurrency),
      buyerPurchaseAmount=num(input.buyerPurchaseAmount)??num(input.buyerAmount),buyerTariffAmount=num(input.buyerTariffAmount)??0,
      transfers=Array.isArray(input.batchTransfers)?input.batchTransfers:[];
    if(buyerCountry!==playerCountry()||!settlementId)return{status:'BLOCKED',reason:'PRIVATE_IMPORT_COMPLETION_SCOPE_INVALID'};
    var buyerLifecycle=runtime(buyerCountry,false)||{},sellerLifecycle=runtime(sellerCountry,false)||{},
      buyerStatus=String((buyerLifecycle.companyStatuses||{})[buyerCompany]||'ACTIVE').toUpperCase(),
      sellerStatus=String((sellerLifecycle.companyStatuses||{})[sellerCompany]||'ACTIVE').toUpperCase();
    if(['INSOLVENT','CLOSED'].indexOf(buyerStatus)>=0)
      return{status:'BLOCKED',reason:'BUYER_COMPANY_STATUS_BLOCKS_IMPORT_COMPLETION',companyStatus:buyerStatus};
    if(sellerStatus==='CLOSED')return{status:'BLOCKED',reason:'SELLER_COMPANY_CLOSED'};
    var root=financeRoot(buyerCountry,true),reservations=root.companyTradeReservations||{},reservation=reservations[settlementId];
    if(!reservation)return{status:'BLOCKED',reason:'PRIVATE_IMPORT_RESERVATION_NOT_FOUND'};
    if(reservation.status==='SETTLED')return{status:'DUPLICATE',record:clone(reservation.procurementRecord||null)};
    if(reservation.status!=='RESERVED')return{status:'BLOCKED',reason:'PRIVATE_IMPORT_RESERVATION_NOT_ACTIVE'};
    var failImport=function(reason,detail){
      reservation.status='FAILED';reservation.failedTurn=turn();reservation.failureReason=reason;
      reservation.failureDetail=detail?clone(detail):null;
      recordEvent(buyerCountry,'PRIVATE_COMPANY_IMPORT_SETTLEMENT_FAILED',{settlementId:settlementId,
        buyerCompanyId:buyerCompany,reason:reason});
      return{status:'BLOCKED',reason:reason,detail:detail||null};
    };
    if(reservation.buyerCompanyId!==buyerCompany||reservation.sellerCompanyId!==sellerCompany||
       Math.abs((num(reservation.buyerAmount)||0)-(buyerAmount||0))>1e-8||
       Math.abs(((num(reservation.buyerPurchaseAmount)??num(reservation.buyerAmount))||0)-(buyerPurchaseAmount||0))>1e-8||
       Math.abs((num(reservation.buyerTariffAmount)||0)-(buyerTariffAmount||0))>1e-8||
       Math.abs((num(reservation.sellerAmount)||0)-(sellerAmount||0))>1e-8||
       reservation.buyerCurrency!==buyerCurrency||reservation.sellerCurrency!==sellerCurrency||
       Math.abs((num(reservation.quantity)||0)-(quantity||0))>1e-8)
      return{status:'BLOCKED',reason:'PRIVATE_IMPORT_SETTLEMENT_RESERVATION_MISMATCH'};
    var transferred=transfers.reduce(function(sum,row){return sum+Math.max(0,num(row&&row.quantity)||0);},0);
    if(!transfers.length||Math.abs(transferred-(quantity||0))>1e-6)
      return{status:'BLOCKED',reason:'PRIVATE_IMPORT_SOURCE_BATCH_QUANTITY_MISMATCH',expected:quantity,actual:transferred};
    for(var i=0;i<transfers.length;i++){
      var transfer=transfers[i]||{},owner=id(transfer.ownerCompanyId),operator=id(transfer.operatorCompanyId),
        ownerStatus=String(transfer.ownerAttributionStatus||'').toUpperCase();
      if(owner!==sellerCompany||COMPANY_IDS.indexOf(operator)<0||
         ['NOT_RECORDED','OWNER_NOT_RECORDED','UNASSIGNED','UNKNOWN_SOURCE','LEGACY_COMPANY_ATTRIBUTION_ROLE_UNCLASSIFIED'].indexOf(ownerStatus)>=0)
        return{status:'BLOCKED',reason:'PRIVATE_IMPORT_SELLER_BATCH_OWNER_NOT_VERIFIED',batchId:transfer.sourceBatchId||null,
          expectedSellerCompanyId:sellerCompany,observedOwnerCompanyId:owner||null,ownerAttributionStatus:ownerStatus||'NOT_RECORDED'};
    }
    var buyerWallet=privateCompanyWallet(buyerCountry,buyerCompany,buyerCurrency,false),
      sellerWallet=privateCompanyWallet(sellerCountry,sellerCompany,sellerCurrency,true);
    if(!buyerWallet.ok||!sellerWallet.ok)return failImport('PRIVATE_IMPORT_COMPANY_WALLET_CURRENCY_INVALID',
      {buyerWallet:buyerWallet,sellerWallet:sellerWallet});
    var otherHeldReservations=Object.keys(reservations).reduce(function(sum,key){
      var row=reservations[key];
      return sum+(key!==settlementId&&row&&row.buyerCompanyId===buyerCompany&&row.status==='RESERVED'
        ?Math.max(0,num(row.buyerAmount)||0):0);
    },0);
    if((num(buyerWallet.account.availableBalance)||0)-otherHeldReservations+1e-8<(num(reservation.buyerAmount)||0))
      return failImport('PRIVATE_IMPORT_BUYER_CASH_BECAME_UNAVAILABLE',{
        availableAfterOtherReservations:Math.max(0,(num(buyerWallet.account.availableBalance)||0)-otherHeldReservations),
        required:num(reservation.buyerAmount)||0});
    var debit=postPrivateTradeCashFlow(buyerCountry,buyerCompany,{
      entryId:'PE-PRIVATE-IMPORT-PAYMENT:'+settlementId,sourceId:settlementId,
      amount:buyerPurchaseAmount,direction:'DEBIT',category:'FACTORY_INPUT_PURCHASE',currency:buyerCurrency
    });
    if(!['POSTED','DUPLICATE'].includes(debit.status))return failImport('PRIVATE_IMPORT_BUYER_CASHFLOW_POST_FAILED',debit);
    var tariffDebit=buyerTariffAmount>1e-9?postPrivateTradeCashFlow(buyerCountry,buyerCompany,{
      entryId:'PE-PRIVATE-IMPORT-TARIFF:'+settlementId,sourceId:settlementId,
      amount:buyerTariffAmount,direction:'DEBIT',category:'IMPORT_TARIFF',currency:buyerCurrency
    }):{status:'DUPLICATE'};
    if(!['POSTED','DUPLICATE'].includes(tariffDebit.status)){
      if(['POSTED','DUPLICATE'].indexOf(debit.status)>=0){
        var rollbackAccount=companyFlowAccount(buyerCountry,buyerCompany),rollbackRows=rollbackAccount&&rollbackAccount.cashFlowEntries||[];
        var rollbackEntry=rollbackRows.find(function(row){return row&&row.entryId==='PE-PRIVATE-IMPORT-PAYMENT:'+settlementId;});
        if(rollbackEntry&&rollbackEntry.status==='POSTED'){
          rollbackEntry.status='REVERSED';rollbackEntry.reversedTurn=turn();rollbackEntry.reversalReason='PRIVATE_IMPORT_TARIFF_CASHFLOW_POST_FAILED';
          rollbackAccount.runtimeNetCashFlow=(num(rollbackAccount.runtimeNetCashFlow)||0)+buyerPurchaseAmount;
          rollbackAccount.paymentsMade=Math.max(0,(num(rollbackAccount.paymentsMade)||0)-buyerPurchaseAmount);}
      }
      return failImport('PRIVATE_IMPORT_TARIFF_CASHFLOW_POST_FAILED',tariffDebit);
    }
    var credit=postPrivateTradeCashFlow(sellerCountry,sellerCompany,{
      entryId:'PE-PRIVATE-IMPORT-RECEIPT:'+settlementId,sourceId:settlementId,
      amount:sellerAmount,direction:'CREDIT',category:'PRIVATE_COMPANY_EXPORT_SALE',currency:sellerCurrency
    });
    if(!['POSTED','DUPLICATE'].includes(credit.status)){
      if(['POSTED','DUPLICATE'].indexOf(debit.status)>=0){
        var buyerAccount=companyFlowAccount(buyerCountry,buyerCompany),entries=buyerAccount&&buyerAccount.cashFlowEntries||[];
        var posted=entries.find(function(row){return row&&row.entryId==='PE-PRIVATE-IMPORT-PAYMENT:'+settlementId;});
        if(posted&&posted.status==='POSTED'){
          posted.status='REVERSED';posted.reversedTurn=turn();posted.reversalReason='SELLER_COMPANY_CASHFLOW_POST_FAILED';
          buyerAccount.runtimeNetCashFlow=(num(buyerAccount.runtimeNetCashFlow)||0)+buyerPurchaseAmount;
          buyerAccount.paymentsMade=Math.max(0,(num(buyerAccount.paymentsMade)||0)-buyerPurchaseAmount);
        }
        if(['POSTED','DUPLICATE'].indexOf(tariffDebit.status)>=0){
          var postedTariff=entries.find(function(row){return row&&row.entryId==='PE-PRIVATE-IMPORT-TARIFF:'+settlementId;});
          if(postedTariff&&postedTariff.status==='POSTED'){postedTariff.status='REVERSED';postedTariff.reversedTurn=turn();
            buyerAccount.runtimeNetCashFlow=(num(buyerAccount.runtimeNetCashFlow)||0)+buyerTariffAmount;
            buyerAccount.paymentsMade=Math.max(0,(num(buyerAccount.paymentsMade)||0)-buyerTariffAmount);}
        }
      }
      return failImport('PRIVATE_IMPORT_SELLER_CASHFLOW_POST_FAILED',credit);
    }
    var buyerRoot=financeRoot(buyerCountry,true),sellerRoot=financeRoot(sellerCountry,true),
      buyerLedger=financeLedger(buyerCountry,true),sellerLedger=financeLedger(sellerCountry,true),
      buyerWalletAccount=buyerWallet.account,sellerWalletAccount=sellerWallet.account;
    buyerWalletAccount.availableBalance=Number(Math.max(0,(num(buyerWalletAccount.availableBalance)||0)-buyerAmount).toFixed(2));
    buyerWalletAccount.revision=(num(buyerWalletAccount.revision)||0)+1;
    var buyerTransaction='PE-PRIVATE-IMPORT-PAYMENT:'+settlementId,
      sellerTransaction='PE-PRIVATE-IMPORT-RECEIPT:'+settlementId;
    if(!buyerLedger.some(function(row){return row&&row.transactionId===buyerTransaction;}))
      buyerLedger.push({transactionId:buyerTransaction,type:'PRIVATE_COMPANY_IMPORT_PAYMENT',companyId:buyerCompany,
        counterpartyCountryId:sellerCountry,counterpartyCompanyId:sellerCompany,resourceId:input.resourceId,
        quantity:quantity,amount:buyerAmount,currency:buyerCurrency,direction:'DEBIT',status:'POSTED',turn:turn(),
        settlementId:settlementId,authority:'OMEGA_PRIVATE_COMPANY_TRADE_CASH_V1'});
    if(!sellerLedger.some(function(row){return row&&row.transactionId===sellerTransaction;}))
      sellerLedger.push({transactionId:sellerTransaction,type:'PRIVATE_COMPANY_EXPORT_RECEIPT',companyId:sellerCompany,
        counterpartyCountryId:buyerCountry,counterpartyCompanyId:buyerCompany,resourceId:input.resourceId,
        quantity:quantity,amount:sellerAmount,currency:sellerCurrency,direction:'CREDIT',status:'POSTED',turn:turn(),
        settlementId:settlementId,authority:'OMEGA_PRIVATE_COMPANY_TRADE_CASH_V1'});
    buyerRoot.ledger=buyerLedger.slice(-4096);sellerRoot.ledger=sellerLedger.slice(-4096);
    sellerWalletAccount.availableBalance=Number(((num(sellerWalletAccount.availableBalance)||0)+sellerAmount).toFixed(2));
    sellerWalletAccount.revision=(num(sellerWalletAccount.revision)||0)+1;
    var buyerLifecycle=runtime(buyerCountry,true),record={
      settlementId:settlementId,countryId:buyerCountry,sellerCountryId:sellerCountry,
      buyerCompanyId:buyerCompany,sellerCompanyId:sellerCompany,resourceId:String(input.resourceId||''),
      quantity:Number(quantity.toFixed(6)),buyerAmount:Number(buyerAmount.toFixed(2)),
      buyerPurchaseAmount:Number(buyerPurchaseAmount.toFixed(2)),buyerTariffAmount:Number(buyerTariffAmount.toFixed(2)),sellerAmount:Number(sellerAmount.toFixed(2)),
      buyerCurrency:buyerCurrency,sellerCurrency:sellerCurrency,batchTransfers:clone(transfers),
      sourceBatchIds:Array.from(new Set(transfers.flatMap(function(row){return [...(row.sourceBatchIds||[]),row.sourceBatchId].filter(Boolean).map(String);}))),
      createdBatchIds:Array.isArray(input.createdBatchIds)?input.createdBatchIds.map(String):[],
      deliveryReceiptIds:Array.isArray(input.deliveryReceiptIds)?input.deliveryReceiptIds.map(String):[],
      turn:turn(),status:'SETTLED',authority:'OMEGA_PRIVATE_COMPANY_PROCUREMENT_V1'
    };
    buyerLifecycle.privateCompanyProcurementRecords.push(record);
    if(buyerLifecycle.privateCompanyProcurementRecords.length>4096)
      buyerLifecycle.privateCompanyProcurementRecords.splice(0,buyerLifecycle.privateCompanyProcurementRecords.length-4096);
    reservation.status='SETTLED';reservation.settledTurn=turn();reservation.procurementRecord=clone(record);
    recordEvent(buyerCountry,'PRIVATE_COMPANY_PROCUREMENT_SETTLED',{settlementId:settlementId,buyerCompanyId:buyerCompany,
      sellerCountryId:sellerCountry,sellerCompanyId:sellerCompany,quantity:quantity,buyerAmount:buyerAmount,sellerAmount:sellerAmount});
    return{status:'SETTLED',record:clone(record)};
  }
  var OPERATING_COST_RATE_KEYS=['electricityPerMWh','waterPerM3','laborPerWorkerDay','maintenancePerFactoryDay','overheadPerFactoryDay','depreciationPerFactoryDay'];
  function companyOperatingCostPolicy(country){
    var cid=canonicalCountry(country||playerCountry()),econ=countryBucket('economy',cid,false)||{},
      finance=financeBucket(cid,false)||{},fiscal=econ.privateEnterpriseFiscalPolicy||{},
      policy=fiscal.operatingCostPolicy||(finance.omegaFinance&&finance.omegaFinance.privateEnterpriseOperatingCostPolicy)||null;
    return obj(policy)?clone(policy):{status:'NOT_CONFIGURED',countryId:cid,currency:'GAME_CURRENCY_UNITS',rates:{}};
  }
  function setCompanyOperatingCostPolicy(input){
    input=input||{};var cid=canonicalCountry(input.countryId||playerCountry()),policyId=String(input.policyId||'').trim(),
      rates=obj(input.rates)?input.rates:{},clean={};
    if(!cid||cid!==playerCountry())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    if(!policyId||policyId.length>160)return{status:'BLOCKED',reason:'OPERATING_COST_POLICY_ID_REQUIRED'};
    OPERATING_COST_RATE_KEYS.forEach(function(key){
      var raw=Object.prototype.hasOwnProperty.call(rates,key)?rates[key]:null;
      if(raw===null||raw===undefined||raw===''){clean[key]=null;return;}
      var value=num(raw);clean[key]=value===null||value<0?NaN:Number(value.toFixed(6));
    });
    var invalid=OPERATING_COST_RATE_KEYS.find(function(key){return Number.isNaN(clean[key]);});
    if(invalid)return{status:'BLOCKED',reason:'OPERATING_COST_RATE_INVALID',field:invalid};
    if(!OPERATING_COST_RATE_KEYS.some(function(key){return clean[key]!==null;}))
      return{status:'BLOCKED',reason:'AT_LEAST_ONE_OPERATING_COST_RATE_REQUIRED'};
    var econ=countryBucket('economy',cid,true),fiscal=obj(econ.privateEnterpriseFiscalPolicy)?econ.privateEnterpriseFiscalPolicy:{},
      prior=obj(fiscal.operatingCostPolicy)?fiscal.operatingCostPolicy:null;
    if(prior&&prior.policyId===policyId){
      if(JSON.stringify(prior.rates||{})!==JSON.stringify(clean))
        return{status:'BLOCKED',reason:'OPERATING_COST_POLICY_IDEMPOTENCY_COLLISION',policyId:policyId};
      return{status:'DUPLICATE',policy:clone(prior)};
    }
    var policy={policyId:policyId,countryId:cid,currency:String(input.currency||'GAME_CURRENCY_UNITS'),
      rates:clean,effectiveTurn:turn(),status:'ACTIVE',source:'PLAYER_GOVERNMENT_OPERATING_COST_POLICY',
      authority:'OMEGA_PRIVATE_ENTERPRISE_OPERATING_COST_V1',simulationOnly:true};
    fiscal.operatingCostPolicy=policy;econ.privateEnterpriseFiscalPolicy=fiscal;
    recordEvent(cid,'COMPANY_OPERATING_COST_POLICY_UPDATED',policy);
    return{status:'UPDATED',policy:clone(policy)};
  }
  function privateFactoryForCostEvent(country,factoryId,ownerValue,operatorValue){
    var cid=canonicalCountry(country),econ=countryBucket('economy',cid,false)||{},
      assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],
      asset=assets.find(function(row){return row&&String(row.id||row.factoryId||row.assetId||row.projectId||'')===String(factoryId||'');});
    if(!asset||String(asset.ownerType||'').toUpperCase()!=='PRIVATE_ENTERPRISE')return{ok:false};
    var owner=id(asset.ownerCompanyId||asset.ownerId),operator=id(asset.operatorCompanyId||asset.operatorId||asset.companyId);
    if(COMPANY_IDS.indexOf(owner)<0||COMPANY_IDS.indexOf(operator)<0||
       (ownerValue&&id(ownerValue)!==owner)||(operatorValue&&id(operatorValue)!==operator))return{ok:false};
    if(String(asset.status||'').toUpperCase()!=='OPERATIONAL'&&asset.productionEnabled!==true)return{ok:false};
    return{ok:true,asset:asset,ownerCompanyId:owner,operatorCompanyId:operator};
  }
  function appendUnpricedOperatingCost(country,input){
    var cid=canonicalCountry(country),r=runtime(cid,true),source=String(input.sourceEventId||'').trim(),
      company=id(input.companyId),category=String(input.category||'OTHER').toUpperCase();
    if(!source||COMPANY_IDS.indexOf(company)<0)return{status:'BLOCKED'};
    var key='PE-UNPRICED-COST:'+cid+':'+source+':'+company+':'+category;
    if(r.unpricedOperatingCostEvents.some(function(row){return row&&row.entryId===key;}))return{status:'DUPLICATE',entryId:key};
    r.unpricedOperatingCostEvents.push({entryId:key,countryId:cid,companyId:company,factoryId:String(input.factoryId||''),
      sourceEventId:source,category:category,quantity:num(input.quantity),unit:String(input.unit||''),
      reason:String(input.reason||'COST_RATE_NOT_RECORDED'),turn:num(input.turn)??turn(),status:'UNPRICED',
      authority:'OMEGA_PRIVATE_ENTERPRISE_OPERATING_COST_V1'});
    if(r.unpricedOperatingCostEvents.length>4096)r.unpricedOperatingCostEvents.splice(0,r.unpricedOperatingCostEvents.length-4096);
    recordEvent(cid,'COMPANY_OPERATING_COST_UNPRICED',{entryId:key,companyId:company,factoryId:input.factoryId,category:category,reason:input.reason});
    return{status:'UNPRICED',entryId:key};
  }
  function recordAccruedOperatingCost(country,input){
    var cid=canonicalCountry(country),r=runtime(cid,true),company=id(input.companyId),
      category=String(input.category||'OTHER').toUpperCase(),amount=num(input.amount),source=String(input.sourceEventId||'').trim(),
      factoryId=String(input.factoryId||'');
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(company)<0||!source||amount===null||amount<0)return{status:'BLOCKED',reason:'OPERATING_COST_ENTRY_INVALID'};
    var entryId='PE-OPERATING-COST:'+cid+':'+source+':'+company+':'+category,
      prior=r.operatingCostEntries.find(function(row){return row&&row.entryId===entryId;});
    if(prior){
      if(Math.abs((num(prior.amount)||0)-amount)>1e-8||prior.factoryId!==factoryId||
         prior.currency!==String(input.currency||'GAME_CURRENCY_UNITS'))return{status:'BLOCKED',reason:'OPERATING_COST_IDEMPOTENCY_COLLISION'};
      return{status:'DUPLICATE',entryId:entryId};
    }
    var row={entryId:entryId,countryId:cid,companyId:company,factoryId:factoryId,sourceEventId:source,
      category:category,quantity:num(input.quantity),unit:String(input.unit||''),unitRate:num(input.unitRate),
      amount:Number(amount.toFixed(2)),currency:String(input.currency||'GAME_CURRENCY_UNITS'),
      turn:num(input.turn)??turn(),status:'POSTED',basis:'ACCRUAL_COST',
      settledAmount:0,outstandingAmount:Number(amount.toFixed(2)),settlementStatus:'UNPAID',settlementEntries:[],
      workforceEvidence:obj(input.workforceEvidence)?clone(input.workforceEvidence):null,
      authority:'OMEGA_PRIVATE_ENTERPRISE_OPERATING_COST_V1'};
    r.operatingCostEntries.push(row);if(r.operatingCostEntries.length>4096)r.operatingCostEntries.splice(0,r.operatingCostEntries.length-4096);
    var ledger=financeLedger(cid,true),existing=ledger.find(function(x){return x&&x.transactionId===entryId;});
    if(!existing)ledger.push({transactionId:entryId,type:'PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL',
      companyId:company,factoryId:factoryId,sourceEventId:source,category:category,amount:row.amount,currency:row.currency,
      direction:'EXPENSE_ACCRUAL',debitAccount:'COMPANY_OPERATING_EXPENSE:'+category,
      creditAccount:'COMPANY_ACCRUED_EXPENSES_PAYABLE:'+company,status:'POSTED',turn:row.turn,
      authority:'OMEGA_PRIVATE_ENTERPRISE_OPERATING_COST_V1'});
    if(ledger.length>4096)ledger.splice(0,ledger.length-4096);
    return{status:'POSTED',entry:clone(row)};
  }

  function recordPrivateFactoryInputConsumption(country,input){
    var cid=canonicalCountry(country),company=id(input.companyId),r=runtime(cid,true),
      batchId=String(input.batchId||'').trim(),resourceId=String(input.resourceId||'').trim(),
      cycleId=String(input.cycleId||'').trim(),quantity=num(input.quantity),
      roots=Array.isArray(input.sourceBatchIds)?Array.from(new Set(input.sourceBatchIds.map(function(x){return String(x||'').trim();}).filter(Boolean))):[];
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(company)<0||!cycleId||quantity===null||quantity<=0)
      return{status:'BLOCKED',reason:'FACTORY_INPUT_CONSUMPTION_INVALID'};
    var sourceToken=roots.length?roots.slice().sort().join(','):(batchId||'UNTRACKED'),
      entryId='PE-INPUT-CONSUMPTION:'+cid+':'+cycleId+':'+company+':'+sourceToken,
      prior=r.inputConsumptionEntries.find(function(row){return row&&row.entryId===entryId;});
    if(prior){
      if(Math.abs((num(prior.quantity)||0)-quantity)>1e-8||prior.resourceId!==resourceId)
        return{status:'BLOCKED',reason:'FACTORY_INPUT_CONSUMPTION_IDEMPOTENCY_COLLISION',entryId:entryId};
      return{status:'DUPLICATE',entryId:entryId};
    }
    if(!roots.length||String(input.stage||'').toUpperCase()==='LEGACY_UNALLOCATED'){
      appendUnpricedOperatingCost(cid,{sourceEventId:entryId,companyId:company,factoryId:input.factoryId,
        category:'FACTORY_INPUT',quantity:quantity,unit:input.unit||'',reason:'FACTORY_INPUT_SOURCE_BATCH_NOT_RECORDED',turn:input.turn});
      return{status:'UNPRICED',entryId:entryId,reason:'FACTORY_INPUT_SOURCE_BATCH_NOT_RECORDED'};
    }
    var trade=countryBucket('trade',cid,false)||{},sales=Array.isArray(trade.domesticSales)?trade.domesticSales:[],
      cashAccount=companyFlowAccount(cid,company),cashRows=cashAccount&&Array.isArray(cashAccount.cashFlowEntries)?cashAccount.cashFlowEntries:[],
      matchedSales=[],unmatchedRoots=roots.slice();
    sales.forEach(function(wrapper){
      var sale=wrapper&&wrapper.sale&&typeof wrapper.sale==='object'?wrapper.sale:wrapper;
      if(!sale||String(sale.status||'').toUpperCase()!=='SETTLED'||
         String(sale.paymentStatus||'').toUpperCase()!=='SETTLED'||
         id(sale.buyerCompanyId)!==company)return;
      var saleRoots=Array.isArray(sale.sourceBatchIds)?sale.sourceBatchIds.map(String):[];
      var overlap=roots.filter(function(root){return saleRoots.indexOf(root)>=0;});
      if(!overlap.length)return;
      var cashEntry=cashRows.find(function(row){
        return row&&String(row.status||'').toUpperCase()==='POSTED'&&
          String(row.direction||'').toUpperCase()==='DEBIT'&&
          String(row.category||'').toUpperCase()==='FACTORY_INPUT_PURCHASE'&&
          String(row.sourceId||'')===String(sale.saleId||'');
      });
      if(!cashEntry)return;
      matchedSales.push({saleId:String(sale.saleId),cashEntryId:String(cashEntry.entryId),sourceBatchIds:overlap});
      unmatchedRoots=unmatchedRoots.filter(function(root){return overlap.indexOf(root)<0;});
    });
    var procurements=(runtime(cid,false)||{}).privateCompanyProcurementRecords||[];
    procurements.forEach(function(procurement){
      if(!procurement||procurement.buyerCompanyId!==company||procurement.status!=='SETTLED')return;
      var procurementRoots=[...(procurement.createdBatchIds||[]),...(procurement.sourceBatchIds||[])].map(String);
      var overlap=roots.filter(function(root){return procurementRoots.indexOf(root)>=0;});
      if(!overlap.length)return;
      var payment=cashRows.find(function(row){return row&&String(row.status||'').toUpperCase()==='POSTED'&&
        String(row.direction||'').toUpperCase()==='DEBIT'&&String(row.category||'').toUpperCase()==='FACTORY_INPUT_PURCHASE'&&
        String(row.sourceId||'')===String(procurement.settlementId||'');});
      if(!payment)return;
      matchedSales.push({saleId:String(procurement.settlementId),cashEntryId:String(payment.entryId),sourceBatchIds:overlap});
      unmatchedRoots=unmatchedRoots.filter(function(root){return overlap.indexOf(root)<0;});
    });
    if(unmatchedRoots.length||!matchedSales.length){
      appendUnpricedOperatingCost(cid,{sourceEventId:entryId,companyId:company,factoryId:input.factoryId,
        category:'FACTORY_INPUT',quantity:quantity,unit:input.unit||'',
        reason:'FACTORY_INPUT_ACQUISITION_COST_NOT_LINKED_TO_SETTLED_COMPANY_PURCHASE',
        turn:input.turn});
      return{status:'UNPRICED',entryId:entryId,unmatchedSourceBatchIds:unmatchedRoots};
    }
    var row={entryId:entryId,countryId:cid,companyId:company,factoryId:String(input.factoryId||''),
      cycleId:cycleId,batchId:batchId,resourceId:resourceId,quantity:quantity,unit:String(input.unit||''),
      sourceBatchIds:roots,recognizedSaleIds:matchedSales.map(function(x){return x.saleId;}),
      recognizedCashEntryIds:matchedSales.map(function(x){return x.cashEntryId;}),
      costTreatment:'PURCHASE_CASH_ALREADY_RECOGNIZED',amount:null,currency:'GAME_CURRENCY_UNITS',
      turn:num(input.turn)??turn(),status:'RECONCILED',
      authority:'OMEGA_PRIVATE_ENTERPRISE_INPUT_COST_RECONCILIATION_V1'};
    r.inputConsumptionEntries.push(row);
    if(r.inputConsumptionEntries.length>4096)r.inputConsumptionEntries.splice(0,r.inputConsumptionEntries.length-4096);
    var ledger=financeLedger(cid,true);
    if(!ledger.some(function(x){return x&&x.transactionId===entryId;})){
      ledger.push({transactionId:entryId,type:'PRIVATE_ENTERPRISE_INPUT_CONSUMPTION_RECONCILED',
        companyId:company,factoryId:row.factoryId,cycleId:cycleId,batchId:batchId,resourceId:resourceId,
        quantity:quantity,unit:row.unit,recognizedSaleIds:row.recognizedSaleIds,
        recognizedCashEntryIds:row.recognizedCashEntryIds,amount:0,currency:row.currency,
        direction:'MEMO',status:'POSTED',turn:row.turn,
        authority:'OMEGA_PRIVATE_ENTERPRISE_INPUT_COST_RECONCILIATION_V1'});
      if(ledger.length>4096)ledger.splice(0,ledger.length-4096);
    }
    return{status:'RECONCILED',entry:clone(row)};
  }

  function settleAccruedOperatingCosts(country,company,availableCash,settlementTurn){
    var cid=canonicalCountry(country),co=id(company),r=runtime(cid,true),
      account=companyFlowAccount(cid,co),ledger=financeLedger(cid,true),cash=Math.max(0,num(availableCash)||0),
      totalSettled=0,totalOutstanding=0,settlementCount=0;
    if(cid!==playerCountry()||!account||!Array.isArray(account.cashFlowEntries))
      return{status:'BLOCKED',reason:'COMPANY_OPERATING_CASH_JOURNAL_UNAVAILABLE',settled:0,outstanding:0};
    var rows=r.operatingCostEntries.filter(function(row){
      return row&&row.companyId===co&&row.status==='POSTED'&&(num(row.amount)||0)>0;
    }).sort(function(a,b){return(num(a.turn)||0)-(num(b.turn)||0)||String(a.entryId).localeCompare(String(b.entryId));});
    rows.forEach(function(row){
      var amount=Math.max(0,num(row.amount)||0),sourceId=String(row.entryId||'');
      var journalPayments=account.cashFlowEntries.filter(function(entry){
        return entry&&entry.category==='OPERATING_COST_SETTLEMENT'&&entry.sourceId===sourceId&&
          String(entry.status||'').toUpperCase()==='POSTED';
      });
      var journalSettled=journalPayments.reduce(function(sum,entry){return sum+Math.max(0,num(entry.amount)||0);},0);
      var financePayments=ledger.filter(function(entry){
        return entry&&entry.type==='PRIVATE_ENTERPRISE_OPERATING_COST_SETTLEMENT'&&entry.sourceEntryId===sourceId&&
          String(entry.status||'').toUpperCase()==='POSTED';
      });
      var financeSettled=financePayments.reduce(function(sum,entry){return sum+Math.max(0,num(entry.amount)||0);},0);
      var settled=Math.min(amount,Math.max(journalSettled,financeSettled,num(row.settledAmount)||0));
      row.settledAmount=Number(settled.toFixed(2));
      row.outstandingAmount=Number(Math.max(0,amount-settled).toFixed(2));
      row.settlementEntries=Array.isArray(row.settlementEntries)?row.settlementEntries:[];
      var missingFinance=journalPayments.filter(function(payment){
        return !financePayments.some(function(financeEntry){return financeEntry.transactionId===payment.entryId;});
      });
      missingFinance.forEach(function(payment){
        ledger.push({transactionId:payment.entryId,type:'PRIVATE_ENTERPRISE_OPERATING_COST_SETTLEMENT',
          sourceEntryId:sourceId,companyId:co,factoryId:row.factoryId,category:row.category,
          amount:payment.amount,currency:payment.currency||row.currency,direction:'TRANSFER',
          debitAccount:'COMPANY_ACCRUED_EXPENSES_PAYABLE:'+co,creditAccount:'COMPANY_OPERATING_CASH:'+co,
          status:'POSTED',turn:payment.turn,authority:'OMEGA_PRIVATE_ENTERPRISE_CASH_SETTLEMENT_V1'});
      });
      var outstanding=Math.max(0,amount-settled);
      if(outstanding<=1e-8){row.settlementStatus='PAID';return;}
      if(cash<=1e-8){totalOutstanding+=outstanding;row.settlementStatus=settled>0?'PARTIALLY_PAID':'UNPAID';return;}
      var paymentAmount=Number(Math.min(cash,outstanding).toFixed(2));
      if(paymentAmount<=0){totalOutstanding+=outstanding;row.settlementStatus=settled>0?'PARTIALLY_PAID':'UNPAID';return;}
      var seq=financePayments.length+missingFinance.length+1,
        settlementId='PE-OPERATING-COST-SETTLEMENT:'+sourceId+':S'+seq;
      var existingJournal=account.cashFlowEntries.find(function(entry){return entry&&entry.entryId===settlementId;});
      if(existingJournal){
        var already=Math.max(0,num(existingJournal.amount)||0);
        paymentAmount=Math.min(cash,outstanding,already);
        settled=Math.min(amount,settled+paymentAmount);
        row.settledAmount=Number(settled.toFixed(2));
        row.outstandingAmount=Number(Math.max(0,amount-settled).toFixed(2));
        row.settlementStatus=row.outstandingAmount<=1e-8?'PAID':'PARTIALLY_PAID';
        totalSettled+=paymentAmount;cash=Math.max(0,cash-paymentAmount);settlementCount++;
        return;
      }
      var payment={entryId:settlementId,companyId:co,amount:paymentAmount,direction:'DEBIT',
        category:'OPERATING_COST_SETTLEMENT',currency:row.currency||'GAME_CURRENCY_UNITS',
        sourceId:sourceId,turn:num(settlementTurn)??turn(),status:'POSTED',
        authority:'OMEGA_PRIVATE_ENTERPRISE_CASH_SETTLEMENT_V1'};
      account.cashFlowEntries.push(payment);
      account.runtimeNetCashFlow=(num(account.runtimeNetCashFlow)||0)-paymentAmount;
      account.paymentsMade=(num(account.paymentsMade)||0)+paymentAmount;
      ledger.push({transactionId:settlementId,type:'PRIVATE_ENTERPRISE_OPERATING_COST_SETTLEMENT',
        sourceEntryId:sourceId,companyId:co,factoryId:row.factoryId,category:row.category,
        amount:paymentAmount,currency:payment.currency,direction:'TRANSFER',
        debitAccount:'COMPANY_ACCRUED_EXPENSES_PAYABLE:'+co,creditAccount:'COMPANY_OPERATING_CASH:'+co,
        status:'POSTED',turn:payment.turn,authority:'OMEGA_PRIVATE_ENTERPRISE_CASH_SETTLEMENT_V1'});
      row.settledAmount=Number((settled+paymentAmount).toFixed(2));
      row.outstandingAmount=Number(Math.max(0,amount-row.settledAmount).toFixed(2));
      row.settlementStatus=row.outstandingAmount<=1e-8?'PAID':'PARTIALLY_PAID';
      row.settlementEntries.push({transactionId:settlementId,amount:paymentAmount,turn:payment.turn});
      totalSettled+=paymentAmount;cash=Math.max(0,cash-paymentAmount);settlementCount++;
    });
    totalOutstanding=rows.reduce(function(sum,row){return sum+Math.max(0,num(row.outstandingAmount)??(num(row.amount)||0)-(num(row.settledAmount)||0));},0);
    return{status:'RECONCILED',settled:Number(totalSettled.toFixed(2)),outstanding:Number(totalOutstanding.toFixed(2)),
      availableCashRemaining:Number(cash.toFixed(2)),settlementCount:settlementCount};
  }

  function onPrivateFactoryFreightDelivered(event){
    var d=event&&event.detail||{},cid=canonicalCountry(d.countryId||d.country||playerCountry());
    if(cid!==playerCountry()||String(d.status||'').toUpperCase()!=='DELIVERED_TO_FACTORY')return;
    var factory=privateFactoryForCostEvent(cid,d.factoryId,d.ownerCompanyId,d.operatorCompanyId);
    if(!factory.ok)return;
    var shipment=String(d.shipmentId||'').trim();if(!shipment)return;
    var amount=num(d.freightCost),currency=String(d.freightCurrency||'');
    if(d.freightCostAuthority!=='SIMULATED_ROUTE_TOTAL_COST'||currency!=='GAME_CURRENCY_UNITS'||amount===null||amount<0){
      appendUnpricedOperatingCost(cid,{sourceEventId:'FREIGHT:'+shipment,companyId:factory.operatorCompanyId,
        factoryId:d.factoryId,category:'FREIGHT',quantity:1,unit:'SHIPMENT',
        reason:'PRIVATE_FACTORY_FREIGHT_COST_NOT_OBSERVED',turn:d.turn});
      return;
    }
    recordAccruedOperatingCost(cid,{sourceEventId:'FREIGHT:'+shipment,companyId:factory.operatorCompanyId,
      factoryId:d.factoryId,category:'FREIGHT',quantity:1,unit:'SHIPMENT',unitRate:amount,amount:amount,
      currency:currency,turn:d.turn});
  }

  function onPrivateFactoryUtilityConsumed(event){
    var d=event&&event.detail||{},cid=canonicalCountry(d.countryId||d.country||playerCountry());
    if(cid!==playerCountry()||d.authority!=='SIMULATED_UTILITY_CONSUMPTION_LEDGER')return;
    var factory=privateFactoryForCostEvent(cid,d.factoryId,d.ownerCompanyId,d.operatorCompanyId);
    if(!factory.ok)return;
    var policy=companyOperatingCostPolicy(cid),rates=policy.rates||{},source=String(d.transactionId||'');if(!source)return;
    [{field:'electricityMWh',rate:'electricityPerMWh',category:'ELECTRICITY',unit:'MWh'},
     {field:'waterM3',rate:'waterPerM3',category:'INDUSTRIAL_WATER',unit:'M3'}].forEach(function(item){
      var quantity=num(d[item.field]);if(quantity===null||quantity<=0)return;
      var rate=num(rates[item.rate]);
      if(rate===null){appendUnpricedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,
        factoryId:d.factoryId,category:item.category,quantity:quantity,unit:item.unit,reason:'COUNTRY_UTILITY_COST_RATE_NOT_CONFIGURED',turn:d.turn});return;}
      recordAccruedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,factoryId:d.factoryId,
        category:item.category,quantity:quantity,unit:item.unit,unitRate:rate,amount:quantity*rate,currency:policy.currency,turn:d.turn});
    });
  }
  function onPrivateFactoryCycleCompleted(event){
    var d=event&&event.detail||{},cid=canonicalCountry(d.countryId||d.country||playerCountry());
    if(cid!==playerCountry())return;
    var factory=privateFactoryForCostEvent(cid,d.factoryId,d.ownerCompanyId,d.operatorCompanyId);
    if(!factory.ok)return;
    var policy=companyOperatingCostPolicy(cid),rates=policy.rates||{},source=String(d.cycleId||d.transactionId||'');
    if(!source)return;
    var cycleDays=num(d.cycleDays);
    if(cycleDays===null||cycleDays<=0){appendUnpricedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,
      factoryId:d.factoryId,category:'CYCLE_DURATION',reason:'FACTORY_CYCLE_DURATION_NOT_RECORDED',turn:d.turn});return;}
    var consumed=Array.isArray(d.consumedInputs)?d.consumedInputs:[],
      declaredInputs=obj(d.inputQuantities)?d.inputQuantities:{},
      declaredInputCount=Object.keys(declaredInputs).filter(function(key){return(num(declaredInputs[key])||0)>1e-9;}).length;
    if(declaredInputCount&&!consumed.length){
      appendUnpricedOperatingCost(cid,{sourceEventId:'INPUTS:'+source,companyId:factory.operatorCompanyId,
        factoryId:d.factoryId,category:'FACTORY_INPUT',reason:'FACTORY_INPUT_CONSUMPTION_DETAIL_NOT_RECORDED',turn:d.turn});
    }else{
      consumed.forEach(function(row,index){
        recordPrivateFactoryInputConsumption(cid,{companyId:factory.operatorCompanyId,factoryId:d.factoryId,
          cycleId:source,batchId:row&&row.batchId,resourceId:row&&row.resourceId,quantity:row&&row.quantity,
          unit:row&&row.unit,stage:row&&row.stage,sourceBatchIds:row&&row.sourceBatchIds,turn:d.turn,index:index});
      });
    }
    function addDaily(category,rateKey,quantity,unit){
      if(quantity===null||quantity<=0)return;
      var rate=num(rates[rateKey]);
      if(rate===null){appendUnpricedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,
        factoryId:d.factoryId,category:category,quantity:quantity,unit:unit,reason:'COUNTRY_OPERATING_COST_RATE_NOT_CONFIGURED',turn:d.turn});return;}
      recordAccruedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,factoryId:d.factoryId,
        category:category,quantity:quantity,unit:unit,unitRate:rate,amount:quantity*rate,currency:policy.currency,turn:d.turn});
    }
    var econ=countryBucket('economy',cid,false)||{},employment=econ.factoryEmployment||{},
      employmentRow=obj(d.workforce)?d.workforce:(employment.factories&&employment.factories[String(d.factoryId)]||factory.asset.employment||{}),
      workers=num(employmentRow.jobsFilled),supported=num(employmentRow.jobsSupported);
    if(workers===null)appendUnpricedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,
      factoryId:d.factoryId,category:'LABOR',reason:'FACTORY_EMPLOYMENT_COST_BASIS_NOT_RECORDED',turn:d.turn});
    else if(supported!==null&&supported>0&&workers<=0)
      appendUnpricedOperatingCost(cid,{sourceEventId:source,companyId:factory.operatorCompanyId,
        factoryId:d.factoryId,category:'LABOR',quantity:supported,unit:'WORKERS',
        reason:'PRIVATE_FACTORY_HAS_NO_ASSIGNED_WORKERS',turn:d.turn});
    else if(workers>0)addDaily('LABOR','laborPerWorkerDay',workers*cycleDays,'WORKER_DAYS');
    addDaily('MAINTENANCE','maintenancePerFactoryDay',cycleDays,'FACTORY_DAYS');
    addDaily('OVERHEAD','overheadPerFactoryDay',cycleDays,'FACTORY_DAYS');
    addDaily('DEPRECIATION','depreciationPerFactoryDay',cycleDays,'FACTORY_DAYS');
  }

  function getCompanyFinanceSummary(country,company){
    var cid=canonicalCountry(country||playerCountry()),co=id(company);
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0)
      return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    var account=companyFlowAccount(cid,co),capital=capitalAccount(cid,co,false),
      rows=financeLedger(cid,false)||[],runtimeRows=account&&Array.isArray(account.cashFlowEntries)?account.cashFlowEntries:[],
      capexRows=rows.filter(function(row){return row&&id(row.companyId)===co&&row.type==='PRIVATE_ENTERPRISE_FACTORY_CAPEX'&&String(row.status||'').toUpperCase()==='POSTED';}),
      capex=capexRows.reduce(function(sum,row){return sum+(num(row.amount)||0);},0);
    var currentRuntime=runtime(cid,false)||{},costEntries=(currentRuntime.operatingCostEntries||[]).filter(function(row){return row&&row.companyId===co&&row.status==='POSTED';}),
      unpricedCostEntries=(currentRuntime.unpricedOperatingCostEvents||[]).filter(function(row){return row&&row.companyId===co&&row.status==='UNPRICED';}),accruedCostByCategory={};
    costEntries.forEach(function(row){var k=String(row.category||'OTHER').toUpperCase();accruedCostByCategory[k]=(accruedCostByCategory[k]||0)+(num(row.amount)||0);});
    var accruedOperatingCosts=costEntries.reduce(function(sum,row){return sum+(num(row.amount)||0);},0);
    var revenue=0,cost=0,tax=0,worker=0,transport=0,inputMaterials=0,other=0,operatingCostSettlementPayments=0;
    runtimeRows.forEach(function(row){
      if(!row||String(row.status||'').toUpperCase()!=='POSTED')return;
      var amount=num(row.amount);if(amount===null||amount<0)return;
      var direction=String(row.direction||'').toUpperCase(),category=String(row.category||'OTHER').toUpperCase();
      if(direction==='CREDIT')revenue+=amount;
      else if(direction==='DEBIT'){
        if(category==='TAX'||category==='CORPORATE_PROFIT_TAX')tax+=amount;
        else if(category==='OPERATING_COST_SETTLEMENT')operatingCostSettlementPayments+=amount;
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
    var cashFlowKnown=!!(account&&account.cashFlowJournalVersion===1&&Array.isArray(account.cashFlowEntries)),
      droppedTotal=account?(num(account.cashFlowJournalDroppedEntries)||0):0,
      droppedAtLastClose=capital?(num(capital.cashFlowJournalDroppedEntriesAtClose)||0):0,
      openPeriodDroppedEntries=Math.max(0,droppedTotal-droppedAtLastClose);
    return{
      status:account?'RECORDED':'NO_COMPANY_CASHFLOW_RECORD',
      countryId:cid,companyId:co,companyName:COMPANY_NAMES[co],
      currency:capital&&capital.currency||'GAME_CURRENCY_UNITS',
      grossRevenue:account&&num(account.grossRevenue)!==null?num(account.grossRevenue):null,
      paymentsReceived:account&&num(account.paymentsReceived)!==null?num(account.paymentsReceived):null,
      paymentsMade:account&&num(account.paymentsMade)!==null?num(account.paymentsMade):null,
      runtimeNetCashFlow:account&&num(account.runtimeNetCashFlow)!==null?num(account.runtimeNetCashFlow):null,
      journal:{status:!cashFlowKnown?'LEGACY_OR_NOT_RECORDED':
          openPeriodDroppedEntries>0?'JOURNAL_TRUNCATED':'VERIFIED_RUNTIME_JOURNAL',
        version:cashFlowKnown?1:null,startedAtTurn:account&&num(account.cashFlowJournalStartedAtTurn),
        entryCount:runtimeRows.length,droppedEntryCount:droppedTotal,
        droppedEntriesSinceLastClose:openPeriodDroppedEntries,
        earliestDroppedTurn:account?num(account.cashFlowJournalEarliestDroppedTurn):null,
        recordedRevenue:cashFlowKnown?revenue:null,
        recordedOperatingCosts:cashFlowKnown?cost:null,recordedTaxPayments:cashFlowKnown?tax:null,
        operatingCostSettlementPayments:cashFlowKnown?operatingCostSettlementPayments:null,
        workerCosts:cashFlowKnown?worker:null,transportCosts:cashFlowKnown?transport:null,
        inputMaterialCosts:cashFlowKnown?inputMaterials:null,otherRecordedCosts:cashFlowKnown?other:null,
        currentCashBasisResult:cashFlowKnown?revenue-cost-operatingCostSettlementPayments:null,recordedAccruedOperatingCosts:cashFlowKnown?accruedOperatingCosts:null,
         accruedCostByCategory:cashFlowKnown?clone(accruedCostByCategory):null,unpricedOperatingCostCount:unpricedCostEntries.length,
         unpricedOperatingCostCategories:Array.from(new Set(unpricedCostEntries.map(function(row){return row.category;})))},
      constructionCapex:{amount:capex,transactionCount:capexRows.length,authority:'EXISTING_FINANCE_LEDGER'},
      capital:{availableBalance:capital?num(capital.availableBalance):null,
        reservedBalance:capital?num(capital.reservedBalance):null,
        capitalRaised:capital?num(capital.capitalRaised):null,
        capitalSpent:capital?num(capital.capitalSpent):null,
        retainedEarningsBalance:capital&&num(capital.retainedEarningsBalance)!==null?num(capital.retainedEarningsBalance):0},
      lastClosedPeriod:lastPeriod,
      accountingProfit:cashFlowKnown&&unpricedCostEntries.length===0?Number((revenue-cost-accruedOperatingCosts).toFixed(2)):null,
      netProfit:cashFlowKnown&&unpricedCostEntries.length===0?Number((revenue-cost-accruedOperatingCosts-tax).toFixed(2)):null,
      netProfitStatus:!cashFlowKnown?'CASH_FLOW_JOURNAL_NOT_VERIFIED':unpricedCostEntries.length?'INCOMPLETE_UNPRICED_OPERATING_COSTS':'POSTED_REVENUE_LESS_RECOGNIZED_EXPENSES_AND_TAX',
      accountingProfitStatus:!cashFlowKnown?'CASH_FLOW_JOURNAL_NOT_VERIFIED':unpricedCostEntries.length?'INCOMPLETE_UNPRICED_OPERATING_COSTS':'CASH_FLOW_PLUS_RECORDED_OPERATING_COST_ACCRUALS',
       operatingCostPolicy:companyOperatingCostPolicy(cid),
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
    var droppedEntries=num(company.cashFlowJournalDroppedEntries)||0,
      droppedAtLastClose=num(capital.cashFlowJournalDroppedEntriesAtClose)||0,
      earliestDroppedTurn=num(company.cashFlowJournalEarliestDroppedTurn);
    if(droppedEntries>droppedAtLastClose)
      return{status:'BLOCKED',reason:'COMPANY_FINANCIAL_PERIOD_JOURNAL_TRUNCATED',
        periodStartTurn:startTurn,periodEndTurn:endTurn,droppedEntriesSinceLastClose:droppedEntries-droppedAtLastClose,
        earliestDroppedTurn:earliestDroppedTurn};
    var periodId='PE-FINANCIAL-PERIOD:'+cid+':'+co+':T'+endTurn;
    var financeRows=financeLedger(cid,true);
    var prior=financeRows.find(function(row){return row&&row.transactionId===periodId;});
    if(prior)return{status:'DUPLICATE',reason:'FINANCIAL_PERIOD_ALREADY_CLOSED',transactionId:periodId,period:prior.period||null};
    if(previousClose!==null&&endTurn<=previousClose)
      return{status:'DUPLICATE',reason:'FINANCIAL_PERIOD_ALREADY_CLOSED',periodEndTurn:previousClose};
    var allEntries=company.cashFlowEntries.filter(function(row){
      var t=num(row&&row.turn);return row&&String(row.status||'').toUpperCase()==='POSTED'&&t!==null&&t>=startTurn&&t<=endTurn;
    });
    var lifecycleRuntime=runtime(cid,true),periodCosts=lifecycleRuntime.operatingCostEntries.filter(function(row){var t=num(row&&row.turn);return row&&row.companyId===co&&row.status==='POSTED'&&t!==null&&t>=startTurn&&t<=endTurn;}),
      periodUnpriced=lifecycleRuntime.unpricedOperatingCostEvents.filter(function(row){var t=num(row&&row.turn);return row&&row.companyId===co&&row.status==='UNPRICED'&&t!==null&&t>=startTurn&&t<=endTurn;});
    if(periodUnpriced.length)return{status:'BLOCKED',reason:'COMPANY_OPERATING_COSTS_UNPRICED',unpricedCostCount:periodUnpriced.length,
      unpricedCategories:Array.from(new Set(periodUnpriced.map(function(row){return row.category;})))};
    if(!allEntries.length&&!periodCosts.length)return{status:'WAITING',reason:'NO_POSTED_COMPANY_FINANCIAL_ACTIVITY_IN_OPEN_PERIOD',periodStartTurn:startTurn,periodEndTurn:endTurn};
    var revenue=0,cost=0,existingTax=0,operatingCostSettlementPayments=0,seen=Object.create(null);
    allEntries.forEach(function(row){
      var key=String(row.entryId||'');if(!key||seen[key])return;seen[key]=true;
      var amount=num(row.amount);if(amount===null||amount<0)return;
      var direction=String(row.direction||'').toUpperCase(),category=String(row.category||'OTHER').toUpperCase();
      if(direction==='CREDIT')revenue+=amount;
      else if(direction==='DEBIT'){
        if(category==='TAX'||category==='CORPORATE_PROFIT_TAX')existingTax+=amount;
        else if(category==='OPERATING_COST_SETTLEMENT')operatingCostSettlementPayments+=amount;
        else cost+=amount;
      }
    });
    var accruedOperatingCosts=periodCosts.reduce(function(sum,row){return sum+(num(row.amount)||0);},0);
    var profitBeforeTax=revenue-cost-accruedOperatingCosts,carried=num(capital.retainedEarningsBalance)||0;
    var taxableProfit=Math.max(0,profitBeforeTax+Math.min(0,carried));
    var policy=companyTaxRate(cid),rate=policy.rate;
    if(rate===null||rate<0||rate>0.60)return{status:'BLOCKED',reason:'CORPORATE_PROFIT_TAX_RATE_INVALID',rate:rate};
    var grossTaxLiability=Number((taxableProfit*rate).toFixed(2));
    var taxDue=Number(Math.max(0,grossTaxLiability-existingTax).toFixed(2));
    var periodNetCash=revenue-cost-operatingCostSettlementPayments-existingTax;
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
    var retainedAfter=carried+profitBeforeTax-existingTax-taxDue;
    capital.retainedEarningsBalance=Number(retainedAfter.toFixed(2));
    capital.retainedEarningsCurrency=capital.currency||'GAME_CURRENCY_UNITS';
    capital.lastFinancialCloseTurn=endTurn;
    capital.lastFinancialPeriodId=periodId;
    capital.cashFlowJournalDroppedEntriesAtClose=droppedEntries;
    capital.revision=(num(capital.revision)||0)+1;
    company.lastFinancialCloseTurn=endTurn;
    company.lastTurn=endTurn;
    var closed={
      transactionId:periodId,companyId:co,companyName:COMPANY_NAMES[co],
      periodStartTurn:startTurn,periodEndTurn:endTurn,postedEntryCount:allEntries.length,
      grossReceipts:Number(revenue.toFixed(2)),operatingCosts:Number((cost+accruedOperatingCosts).toFixed(2)),
      cashOperatingCosts:Number(cost.toFixed(2)),operatingCostSettlementPayments:Number(operatingCostSettlementPayments.toFixed(2)),
      cashAvailableAfterOutflowsBeforeTax:Number(periodNetCash.toFixed(2)),accruedOperatingCosts:Number(accruedOperatingCosts.toFixed(2)),
      accruedCostByCategory:periodCosts.reduce(function(out,row){var key=String(row.category||'OTHER').toUpperCase();out[key]=(out[key]||0)+(num(row.amount)||0);return out;},{}),
      grossTaxLiability:Number(grossTaxLiability.toFixed(2)),otherTaxPaidBeforeClose:Number(existingTax.toFixed(2)),
      totalTaxPaidAfterClose:Number((existingTax+taxDue).toFixed(2)),
      profitBeforeTax:Number(profitBeforeTax.toFixed(2)),netProfitAfterTax:Number((profitBeforeTax-existingTax-taxDue).toFixed(2)),
      taxableProfit:Number(taxableProfit.toFixed(2)),corporateTaxRate:rate,taxRateSource:policy.source,corporateTaxPaid:taxDue,
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
    var requestId=String(input.requestId||'').trim(),r=runtime(cid,true),
      name=String(input.name||'Strategic Industrial Joint Venture').trim().slice(0,100),
      factoryIds=Array.isArray(input.factoryIds)?input.factoryIds.map(function(x){return String(x||'').trim();}).filter(Boolean):[];
    var ventureCurrency=observedCompanyCurrency(cid)||'GAME_CURRENCY_UNITS';
    if(factoryIds.some(function(x,index){return factoryIds.indexOf(x)!==index;}))
      return{status:'BLOCKED',reason:'JV_FACTORY_ID_DUPLICATE'};
    if(requestId){
      var previous=r.jointVentures.find(function(x){return x&&x.requestId===requestId;});
      if(previous){
        var same=String(previous.name||'')===name&&id(previous.managingCompanyId)===manager&&
          JSON.stringify(previous.shareholders||[])===JSON.stringify(validated.shareholders)&&
          JSON.stringify(previous.factoryIds||[])===JSON.stringify(factoryIds);
        if(!same)return{status:'BLOCKED',reason:'JV_REQUEST_IDEMPOTENCY_COLLISION',jointVentureId:previous.jointVentureId};
        return{status:'DUPLICATE',idempotent:true,jointVenture:clone(previous)};
      }
    }
    for(var shareholderIndex=0;shareholderIndex<validated.shareholders.length;shareholderIndex++){
      var shareholderCurrency=reconcileCapitalCurrency(cid,validated.shareholders[shareholderIndex].companyId,ventureCurrency,false);
      if(!shareholderCurrency.ok)return{status:'BLOCKED',reason:'JV_SHAREHOLDER_CURRENCY_MISMATCH',
        details:shareholderCurrency};
    }
    var jv={
      jointVentureId:'PE-JV:'+cid+':'+r.nextJointVentureSequence++,
      requestId:requestId||null,countryId:cid,name:name,
      shareholders:validated.shareholders,managingCompanyId:manager,factoryIds:factoryIds,
      status:'PROPOSED',createdTurn:turn(),updatedTurn:turn(),retainedEarningsBalance:0,currency:ventureCurrency,
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
    if(type==='DIVIDEND'&&(amount===null||amount<=0||Math.abs(amount*100-Math.round(amount*100))>1e-7||
       amount>num(jv.retainedEarningsBalance)||amount>Math.max(0,num(jv.retainedEarningsBalance)||0)))
      return{status:'BLOCKED',reason:amount!==null&&Math.abs(amount*100-Math.round(amount*100))>1e-7?
        'JV_DIVIDEND_CURRENCY_PRECISION_EXCEEDED':'JV_DIVIDEND_EXCEEDS_CONTRIBUTED_RETAINED_EARNINGS',
        available:Math.max(0,num(jv.retainedEarningsBalance)||0),requested:amount};
    var threshold=num(input.requiredApprovalBps);
    if(threshold===null)threshold=(type==='DIVIDEND'||type==='DISSOLUTION')?6667:5001;
    if(!Number.isInteger(threshold)||threshold<5001||threshold>10000)
      return{status:'BLOCKED',reason:'JV_VOTING_THRESHOLD_OUT_OF_RANGE'};
    var resolution={
      resolutionId:'PE-JV-RESOLUTION:'+jv.jointVentureId+':'+(jv.resolutions.length+1),
      type:type,amount:amount,currency:jv.currency||'GAME_CURRENCY_UNITS',
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
    if(!member||amount===null||amount<=0||Math.abs(amount*100-Math.round(amount*100))>1e-7||!requestId)
      return{status:'BLOCKED',reason:amount!==null&&Math.abs(amount*100-Math.round(amount*100))>1e-7?
        'JV_CONTRIBUTION_CURRENCY_PRECISION_EXCEEDED':'JV_CONTRIBUTION_FIELDS_INVALID'};
    var tx='PE-JV-CONTRIBUTION:'+jv.jointVentureId+':'+requestId,ledger=financeLedger(cid,true);
    var prior=ledger.find(function(x){return x&&x.transactionId===tx;});
    if(prior){
      var sameContribution=id(prior.companyId)===company&&Math.abs((num(prior.amount)||0)-amount)<1e-9&&
        prior.jointVentureId===jv.jointVentureId&&prior.type==='PRIVATE_ENTERPRISE_JV_RETAINED_EARNINGS_CONTRIBUTION';
      if(!sameContribution)return{status:'BLOCKED',reason:'JV_CONTRIBUTION_REQUEST_IDEMPOTENCY_COLLISION',transactionId:tx};
      return{status:'DUPLICATE',transactionId:tx,jointVenture:clone(jv)};
    }
    var capitalCurrency=reconcileCapitalCurrency(cid,company,jv.currency||'GAME_CURRENCY_UNITS',true);
    if(!capitalCurrency.ok)return{status:'BLOCKED',reason:'JV_SHAREHOLDER_CURRENCY_MISMATCH',details:capitalCurrency};
    var capital=capitalCurrency.account,retained=num(capital.retainedEarningsBalance)||0;
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
    if(!resolution||resolution.type!=='DIVIDEND')return{status:'BLOCKED',reason:'JV_DIVIDEND_RESOLUTION_REQUIRED'};
    var tx='PE-JV-DIVIDEND:'+resolution.resolutionId,ledger=financeLedger(cid,true),
      prior=ledger.find(function(x){return x&&x.transactionId===tx;});
    if(prior)return{status:'DUPLICATE',transactionId:tx,distribution:clone(prior.distribution||[])};
    if(resolution.status!=='APPROVED')return{status:'BLOCKED',reason:'APPROVED_JV_DIVIDEND_RESOLUTION_REQUIRED'};
    var amount=num(resolution.amount);
    if(amount===null||amount<=0||(num(jv.retainedEarningsBalance)||0)+1e-9<amount)
      return{status:'BLOCKED',reason:'JV_RETAINED_EARNINGS_INSUFFICIENT',available:num(jv.retainedEarningsBalance)||0,required:amount};
    var ventureCurrency=id(jv.currency||resolution.currency||'GAME_CURRENCY_UNITS');
    if(id(resolution.currency||ventureCurrency)!==ventureCurrency)
      return{status:'BLOCKED',reason:'JV_DIVIDEND_CURRENCY_MISMATCH',
        expectedCurrency:ventureCurrency,resolutionCurrency:resolution.currency||null};
    var memberCapitalAccounts=[];
    for(var memberIndex=0;memberIndex<jv.shareholders.length;memberIndex++){
      var memberCurrency=reconcileCapitalCurrency(cid,jv.shareholders[memberIndex].companyId,ventureCurrency,true);
      if(!memberCurrency.ok)return{status:'BLOCKED',reason:'JV_SHAREHOLDER_CURRENCY_MISMATCH',details:memberCurrency};
      memberCapitalAccounts.push(memberCurrency.account);
    }
    var amountCents=Math.round(amount*100),allocations=jv.shareholders.map(function(member,index){
      var raw=amountCents*member.shareBps/10000,floor=Math.floor(raw);
      return{index:index,companyId:member.companyId,shareBps:member.shareBps,cents:floor,remainder:raw-floor};
    });
    var centsAllocated=allocations.reduce(function(sum,row){return sum+row.cents;},0),
      centsRemaining=amountCents-centsAllocated;
    allocations.slice().sort(function(a,b){return b.remainder-a.remainder||a.index-b.index;})
      .slice(0,centsRemaining).forEach(function(row){
        allocations[row.index].cents+=1;
      });
    var distribution=[];
    for(var i=0;i<jv.shareholders.length;i++){
      var member=jv.shareholders[i],payout=allocations[i].cents/100;
      var capital=memberCapitalAccounts[i];
      if(payout<0||!Number.isFinite(payout))return{status:'BLOCKED',reason:'JV_DIVIDEND_ALLOCATION_INVALID'};
      capital.availableBalance=(num(capital.availableBalance)||0)+payout;
      capital.dividendsReceived=(num(capital.dividendsReceived)||0)+payout;
      capital.revision=(num(capital.revision)||0)+1;
      distribution.push({companyId:member.companyId,shareBps:member.shareBps,amount:payout,currency:ventureCurrency});
      ledger.push({transactionId:tx+':'+member.companyId,type:'PRIVATE_ENTERPRISE_JV_DIVIDEND',
        companyId:member.companyId,jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,
        amount:payout,currency:ventureCurrency,direction:'CREDIT',
        debitAccount:'JV_RETAINED_EARNINGS:'+jv.jointVentureId,
        creditAccount:'COMPANY_CAPITAL:'+member.companyId,status:'POSTED',turn:turn(),
        authority:'OMEGA_PRIVATE_ENTERPRISE_JV_V1'});
    }
    jv.retainedEarningsBalance=Number(((num(jv.retainedEarningsBalance)||0)-amount).toFixed(2));
    resolution.status='PAID';resolution.paidTurn=turn();resolution.distribution=clone(distribution);
    jv.updatedTurn=turn();
    var aggregate={transactionId:tx,type:'PRIVATE_ENTERPRISE_JV_DIVIDEND_DISTRIBUTION',
      jointVentureId:jv.jointVentureId,resolutionId:resolution.resolutionId,amount:amount,
      currency:ventureCurrency,direction:'TRANSFER',status:'POSTED',turn:turn(),
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
  function getPrivateMarketConcentration(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),cohort=runtime(cid,false),
      trade=countryBucket('trade',cid,false)||{},rows=Array.isArray(trade.domesticSales)?trade.domesticSales:[],
      resourceFilter=String(input.resourceId||'').trim(),lookback=num(input.lookbackTurns);
    if(cid!==playerCountry())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    if(lookback===null)lookback=365;
    if(!Number.isInteger(lookback)||lookback<1||lookback>3650)return{status:'BLOCKED',reason:'LOOKBACK_TURNS_OUT_OF_RANGE'};
    var fromTurn=Math.max(0,turn()-lookback+1),totalAttributedValue=0,privateValue=0,unattributedSales=0,
      verifiedSales=0,privateExportValue=0,verifiedPrivateExportReceipts=0,
      byCompany=Object.create(null),byResource=Object.create(null),financeRows=financeLedger(cid,false)||[];
    COMPANY_IDS.forEach(function(company){byCompany[company]={companyId:company,companyName:COMPANY_NAMES[company],
      salesValue:0,quantity:0,saleCount:0,exportReceiptValue:0,exportQuantity:0,exportReceiptCount:0};});
    rows.forEach(function(wrapper){
      var sale=wrapper&&wrapper.sale&&typeof wrapper.sale==='object'?wrapper.sale:wrapper,
        t=num(wrapper&&wrapper.turn)??num(sale&&sale.simulationTurn);
      if(!sale||String(sale.status||'').toUpperCase()!=='SETTLED'||
         String(sale.paymentStatus||'').toUpperCase()!=='SETTLED'||
         String(sale.ownerAllocationStatus||'').toUpperCase()!=='RECONCILED'||
         t===null||t<fromTurn||t>turn())return;
      if(resourceFilter&&String(sale.resourceId||'').toLowerCase()!==resourceFilter.toLowerCase())return;
      var allocations=obj(sale.supplierAllocations)?sale.supplierAllocations:{},
        totalQty=Object.keys(allocations).reduce(function(sum,key){return sum+Math.max(0,num(allocations[key])||0);},0),
        gross=num(sale.totalValue),resourceId=String(sale.resourceId||'');
      if(totalQty<=0||gross===null||gross<0){unattributedSales++;return;}
      totalAttributedValue+=gross;verifiedSales++;
      byResource[resourceId]=(byResource[resourceId]||0)+gross;
      Object.keys(allocations).forEach(function(companyId){
        var quantity=Math.max(0,num(allocations[companyId])||0),value=gross*(quantity/totalQty);
        if(COMPANY_IDS.indexOf(id(companyId))>=0){
          byCompany[id(companyId)].salesValue+=value;byCompany[id(companyId)].quantity+=quantity;
          byCompany[id(companyId)].saleCount++;
          privateValue+=value;
        }
      });
    });
    financeRows.forEach(function(entry){
      if(!entry||entry.type!=='PRIVATE_COMPANY_EXPORT_RECEIPT'||String(entry.status||'').toUpperCase()!=='POSTED')return;
      var companyId=id(entry.companyId),amount=num(entry.amount),t=num(entry.turn),resourceId=String(entry.resourceId||''),
        settlementId=String(entry.settlementId||'').trim();
      if(COMPANY_IDS.indexOf(companyId)<0||amount===null||amount<=0||t===null||t<fromTurn||t>turn()||!settlementId)return;
      if(resourceFilter&&resourceId.toLowerCase()!==resourceFilter.toLowerCase())return;
      var account=companyFlowAccount(cid,companyId),journal=account&&Array.isArray(account.cashFlowEntries)?account.cashFlowEntries:[],
        journalEntry=journal.find(function(row){return row&&row.entryId==='PE-PRIVATE-IMPORT-RECEIPT:'+settlementId&&
          row.status==='POSTED'&&row.direction==='CREDIT'&&row.category==='PRIVATE_COMPANY_EXPORT_SALE'&&
          String(row.sourceId||'')===settlementId&&Math.abs((num(row.amount)||0)-amount)<=1e-8&&
          id(row.currency)===id(entry.currency);});
      if(!journalEntry)return;
      byCompany[companyId].exportReceiptValue+=amount;
      byCompany[companyId].exportQuantity+=Math.max(0,num(entry.quantity)||0);
      byCompany[companyId].exportReceiptCount++;
      privateExportValue+=amount;verifiedPrivateExportReceipts++;
    });
    var firms=COMPANY_IDS.map(function(companyId){
      var row=byCompany[companyId],privateShare=privateValue>0?row.salesValue/privateValue*100:0,
        totalShare=totalAttributedValue>0?row.salesValue/totalAttributedValue*100:0,
        exportMixShare=privateExportValue>0?row.exportReceiptValue/privateExportValue*100:0;
      return{companyId:companyId,companyName:COMPANY_NAMES[companyId],
        settledSalesValue:Number(row.salesValue.toFixed(2)),quantity:Number(row.quantity.toFixed(6)),
        saleCount:row.saleCount,privateSectorSharePct:Number(privateShare.toFixed(4)),
        totalAttributedMarketSharePct:Number(totalShare.toFixed(4)),
        settledPrivateExportReceiptValue:Number(row.exportReceiptValue.toFixed(2)),
        privateExportQuantity:Number(row.exportQuantity.toFixed(6)),privateExportReceiptCount:row.exportReceiptCount,
        privateExportMixSharePct:Number(exportMixShare.toFixed(4))};
    }).sort(function(a,b){return b.settledSalesValue-a.settledSalesValue||a.companyId.localeCompare(b.companyId);});
    var privateHhi=privateValue>0?firms.reduce(function(sum,row){return sum+Math.pow(row.privateSectorSharePct,2);},0):null,
      privateExportHhi=privateExportValue>0?firms.reduce(function(sum,row){return sum+Math.pow(row.privateExportMixSharePct,2);},0):null;
    var privateSharePct=totalAttributedValue>0?privateValue/totalAttributedValue*100:null;
    return{status:verifiedSales?'AVAILABLE':'NO_VERIFIED_PRIVATE_SALES',countryId:cid,resourceId:resourceFilter||null,
      lookbackTurns:lookback,fromTurn:fromTurn,toTurn:turn(),verifiedSettledSaleCount:verifiedSales,
      privateSectorSettledSalesValue:Number(privateValue.toFixed(2)),totalAttributedSettledMarketValue:Number(totalAttributedValue.toFixed(2)),
      privateSectorMarketSharePct:privateSharePct===null?null:Number(privateSharePct.toFixed(4)),
      privateCompanyHhi:privateHhi===null?null:Number(privateHhi.toFixed(2)),
      concentration:privateHhi===null?'UNAVAILABLE':privateHhi>=2500?'HIGH':privateHhi>=1500?'MODERATE':'LOW',
      privateCompanyExportReceiptsValue:Number(privateExportValue.toFixed(2)),
      verifiedPrivateCompanyExportReceiptCount:verifiedPrivateExportReceipts,
      privateCompanyExportHhi:privateExportHhi===null?null:Number(privateExportHhi.toFixed(2)),
      privateExportConcentration:privateExportHhi===null?'UNAVAILABLE':privateExportHhi>=2500?'HIGH':privateExportHhi>=1500?'MODERATE':'LOW',
      firms:firms,unattributedOrUnvaluedSalesCount:unattributedSales,
      coverage:{status:'DOMESTIC_SETTLED_SALES_PLUS_SEPARATE_VERIFIED_PRIVATE_EXPORT_RECEIPT_MIX',includesPrivateCompanyAttribution:true,
        crossBorderCompanySales:'PRIVATE_EXPORT_RECEIPTS_REPORTED_SEPARATELY_NOT_MIXED_INTO_DOMESTIC_MARKET_SHARE',
        referenceOnlyQuotesExcluded:true,unsoldInventoryExcluded:true,productionCapacityExcluded:true,
        thresholds:'MODEL_INDICATORS_NOT_LEGAL_COMPETITION_FINDINGS'},
      authority:'OMEGA_PRIVATE_ENTERPRISE_MARKET_CONCENTRATION_V1',simulationOnly:true};
  }
  function evaluateCompanySolvency(country,company){
    var cid=canonicalCountry(country||playerCountry()),co=id(company);
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0)
      return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    var capital=capitalAccount(cid,co,false),r=runtime(cid,false)||{},financeRows=financeLedger(cid,false)||[],
      operating=(r.operatingCostEntries||[]).filter(function(row){return row&&row.companyId===co&&row.status==='POSTED';}),
      unpriced=(r.unpricedOperatingCostEvents||[]).filter(function(row){return row&&row.companyId===co&&row.status==='UNPRICED';});
    var accruedPayables=operating.reduce(function(sum,row){
      return sum+Math.max(0,(num(row.amount)||0)-(num(row.settledAmount)||0));
    },0);
    var debtRows=financeRows.filter(function(row){
      return row&&id(row.companyId)===co&&/PRIVATE_COMPANY_(LOAN|DEBT)|PRIVATE_ENTERPRISE_(LOAN|DEBT)/.test(String(row.type||''))&&
        String(row.status||'').toUpperCase()==='POSTED';
    });
    var debtOutstanding=debtRows.reduce(function(sum,row){
      return sum+Math.max(0,num(row.outstandingPrincipal)||num(row.outstandingAmount)||0);
    },0);
    var cash=capital?num(capital.availableBalance):null,reserved=capital?num(capital.reservedBalance):null,
      retained=capital?num(capital.retainedEarningsBalance)||0:null,liabilities=accruedPayables+debtOutstanding,
      companyStatus=String((r.companyStatuses||{})[co]||'ACTIVE').toUpperCase();
    var status='UNKNOWN',reason='COMPANY_CASH_OR_LIABILITY_EVIDENCE_NOT_AVAILABLE';
    if(unpriced.length){status='UNASSESSED';reason='UNPRICED_OPERATING_COSTS_PREVENT_SOLVENCY_ASSESSMENT';}
    else if(cash!==null){
      if(liabilities>cash+1e-8){status='INSOLVENT';reason='VERIFIED_CURRENT_LIABILITIES_EXCEED_AVAILABLE_COMPANY_CASH';}
      else if((retained!==null&&retained<0)||cash-liabilities<Math.max(1,reserved||0)){
        status='AT_RISK';reason='NEGATIVE_RETAINED_EARNINGS_OR_LOW_UNENCUMBERED_LIQUIDITY';
      }else{status='SOLVENT';reason='AVAILABLE_CASH_COVERS_RECORDED_CURRENT_LIABILITIES';}
    }
    return{status:status,reason:reason,countryId:cid,companyId:co,companyName:COMPANY_NAMES[co],
      companyStatus:companyStatus,currency:capital&&capital.currency||'GAME_CURRENCY_UNITS',
      availableCash:cash,reservedCash:reserved,retainedEarnings:retained,
      accruedOperatingPayables:Number(accruedPayables.toFixed(2)),recordedDebtOutstanding:Number(debtOutstanding.toFixed(2)),
      totalRecordedCurrentLiabilities:Number(liabilities.toFixed(2)),liquiditySurplus:cash===null?null:Number((cash-liabilities).toFixed(2)),
      unpricedOperatingCostCount:unpriced.length,recognizedOperatingCostEntryCount:operating.length,
      debtEvidenceStatus:debtRows.length?'RECORDED_DEBT_LEDGER':'NO_RECORDED_PRIVATE_COMPANY_DEBT_ENTRIES',
      limitation:'Cash-flow insolvency indicator only. Unvalued fixed assets, unrecorded creditors and unpriced costs cannot be assumed away.',
      authority:'OMEGA_PRIVATE_ENTERPRISE_SOLVENCY_V1',simulationOnly:true};
  }
  function openCompanyInsolvencyCase(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),co=id(input.companyId),
      requestId=String(input.requestId||'').trim(),reason=applicationText(input.reason),r=runtime(cid,true);
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    if(!requestId||reason.length<12||reason.length>1000)return{status:'BLOCKED',reason:'INSOLVENCY_CASE_REASON_AND_REQUEST_ID_REQUIRED'};
    var solvency=evaluateCompanySolvency(cid,co);
    if(solvency.status!=='INSOLVENT')return{status:'BLOCKED',reason:'VERIFIED_COMPANY_CASH_INSOLVENCY_REQUIRED',solvency:solvency};
    if(String(r.companyStatuses[co]||'ACTIVE').toUpperCase()==='CLOSED')return{status:'BLOCKED',reason:'COMPANY_ALREADY_CLOSED'};
    r.insolvencyCases=Array.isArray(r.insolvencyCases)?r.insolvencyCases:[];
    var prior=r.insolvencyCases.find(function(row){return row&&row.requestId===requestId;});
    if(prior)return prior.companyId===co&&prior.reason===reason
      ?{status:'DUPLICATE',case:clone(prior)}:{status:'BLOCKED',reason:'INSOLVENCY_REQUEST_IDEMPOTENCY_COLLISION'};
    var row={caseId:'PE-INSOLVENCY:'+cid+':'+co+':'+requestId,requestId:requestId,
      countryId:cid,companyId:co,reason:reason,solvencySnapshot:clone(solvency),
      status:'OPEN',openedTurn:turn(),authority:'OMEGA_PRIVATE_ENTERPRISE_INSOLVENCY_V1'};
    r.insolvencyCases.push(row);r.companyStatuses[co]='INSOLVENT';
    recordEvent(cid,'PRIVATE_COMPANY_INSOLVENCY_OPENED',{caseId:row.caseId,companyId:co,
      totalRecordedCurrentLiabilities:solvency.totalRecordedCurrentLiabilities,
      availableCash:solvency.availableCash});
    return{status:'OPEN',case:clone(row)};
  }
  function proposeCompanyRestructuring(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),co=id(input.companyId),requestId=String(input.requestId||'').trim(),
      reason=applicationText(input.reason),actions=Array.isArray(input.actions)?clone(input.actions):[];
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    if(!requestId)return{status:'BLOCKED',reason:'RESTRUCTURING_REQUEST_ID_REQUIRED'};
    if(reason.length<12||reason.length>1000)return{status:'BLOCKED',reason:'RESTRUCTURING_REASON_LENGTH_INVALID'};
    var solvency=evaluateCompanySolvency(cid,co),r=runtime(cid,true);
    if(['CLOSED','RESTRUCTURING'].indexOf(String(r.companyStatuses[co]||'ACTIVE').toUpperCase())>=0)
      return{status:'BLOCKED',reason:'COMPANY_ALREADY_RESTRUCTURING_OR_CLOSED'};
    var prior=r.restructuringCases.find(function(row){return row&&row.requestId===requestId;});
    if(prior){
      var same=prior.companyId===co&&prior.reason===reason&&JSON.stringify(prior.actions||[])===JSON.stringify(actions);
      return same?{status:'DUPLICATE',case:clone(prior)}:{status:'BLOCKED',reason:'RESTRUCTURING_REQUEST_IDEMPOTENCY_COLLISION'};
    }
    if(actions.some(function(action){return !action||['SUSPEND_FACTORY','UPDATE_OPERATING_COST_POLICY','VERIFY_CAPITAL_RECEIPT'].indexOf(String(action.type||'').toUpperCase())<0;}))
      return{status:'BLOCKED',reason:'RESTRUCTURING_ACTION_UNSUPPORTED'};
    var row={caseId:'PE-RESTRUCTURE:'+cid+':'+co+':'+requestId,requestId:requestId,
      countryId:cid,companyId:co,reason:reason,solvencySnapshot:clone(solvency),
      actions:actions,status:'PROPOSED',createdTurn:turn(),updatedTurn:turn(),
      authority:'OMEGA_PRIVATE_ENTERPRISE_RESTRUCTURING_V1'};
    r.restructuringCases.push(row);if(r.restructuringCases.length>256)r.restructuringCases.shift();
    recordEvent(cid,'PRIVATE_COMPANY_RESTRUCTURING_PROPOSED',{caseId:row.caseId,companyId:co,solvencyStatus:solvency.status});
    return{status:'PROPOSED',case:clone(row)};
  }
  function decideCompanyRestructuring(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),co=id(input.companyId),caseId=String(input.caseId||''),
      r=runtime(cid,false),row=r&&r.restructuringCases.find(function(x){return x&&x.caseId===caseId&&x.companyId===co;});
    if(cid!==playerCountry()||!row||COMPANY_IDS.indexOf(co)<0)return{status:'BLOCKED',reason:'RESTRUCTURING_CASE_NOT_FOUND'};
    if(row.status!=='PROPOSED')return{status:'BLOCKED',reason:'RESTRUCTURING_CASE_ALREADY_DECIDED',currentStatus:row.status};
    var decision=String(input.decision||'').toUpperCase();
    if(['APPROVE','DENY','DEFER'].indexOf(decision)<0)return{status:'BLOCKED',reason:'RESTRUCTURING_DECISION_INVALID'};
    row.status=decision==='APPROVE'?'APPROVED':decision==='DENY'?'DENIED':'DEFERRED';
    row.governmentDecision={decision:decision,reason:String(input.governmentReason||'').slice(0,1000),
      reviewer:'PLAYER_GOVERNMENT',turn:turn()};
    row.updatedTurn=turn();
    if(decision==='APPROVE')r.companyStatuses[co]='RESTRUCTURING';
    recordEvent(cid,'PRIVATE_COMPANY_RESTRUCTURING_DECIDED',{caseId:caseId,companyId:co,decision:decision});
    return{status:row.status,case:clone(row),companyStatus:r.companyStatuses[co]||'ACTIVE'};
  }
  function applyCompanyRestructuring(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),co=id(input.companyId),caseId=String(input.caseId||''),
      r=runtime(cid,false),row=r&&r.restructuringCases.find(function(x){return x&&x.caseId===caseId&&x.companyId===co;});
    if(cid!==playerCountry()||!row||row.status!=='APPROVED')return{status:'BLOCKED',reason:'APPROVED_RESTRUCTURING_CASE_REQUIRED'};
    var econ=countryBucket('economy',cid,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],
      results=[],failed=[];
    (row.actions||[]).forEach(function(action){
      var type=String(action.type||'').toUpperCase();
      if(type==='SUSPEND_FACTORY'){
        var factoryId=String(action.factoryId||''),asset=assets.find(function(a){return a&&String(a.id||a.factoryId||'')===factoryId;});
        var owner=id(asset&& (asset.ownerCompanyId||asset.ownerId)),operator=id(asset&&(asset.operatorCompanyId||asset.operatorId||asset.companyId));
        if(!asset||(owner!==co&&operator!==co)){failed.push({type:type,factoryId:factoryId,reason:'COMPANY_FACTORY_NOT_FOUND'});return;}
        if(!['CLOSED','DESTROYED','DECOMMISSIONED'].includes(String(asset.status||'').toUpperCase())){
          asset.status='MAINTENANCE';asset.productionEnabled=false;asset.productionStatus='SUSPENDED_FOR_RESTRUCTURING';
          asset.restructuringCaseId=caseId;asset.restructuringTurn=turn();
        }
        results.push({type:type,factoryId:factoryId,status:'SUSPENDED'});
      }else if(type==='UPDATE_OPERATING_COST_POLICY'){
        var policyResult=setCompanyOperatingCostPolicy({countryId:cid,companyId:co,policyId:action.policyId,
          rates:action.rates,currency:action.currency});
        if(policyResult.status!=='UPDATED'&&policyResult.status!=='DUPLICATE'){failed.push({type:type,reason:policyResult.reason||policyResult.status});return;}
        results.push({type:type,status:policyResult.status,policyId:action.policyId});
      }else if(type==='VERIFY_CAPITAL_RECEIPT'){
        var receipt=recordCompanyCapitalReceipt({countryId:cid,companyId:co,sourceTransactionId:action.sourceTransactionId,
          amount:action.amount,currency:action.currency});
        if(receipt.status!=='POSTED'&&receipt.status!=='DUPLICATE'){failed.push({type:type,reason:receipt.reason||receipt.status});return;}
        results.push({type:type,status:receipt.status,amount:action.amount});
      }
    });
    row.appliedActions=results;row.failedActions=failed;row.updatedTurn=turn();
    row.status=failed.length?'PARTIALLY_IMPLEMENTED':'IMPLEMENTED';
    recordEvent(cid,'PRIVATE_COMPANY_RESTRUCTURING_APPLIED',{caseId:caseId,companyId:co,
      appliedCount:results.length,failedCount:failed.length});
    return{status:row.status,appliedActions:clone(results),failedActions:clone(failed)};
  }
  function closePrivateCompany(input){
    input=input||{};
    var cid=canonicalCountry(input.countryId||playerCountry()),co=id(input.companyId),reason=applicationText(input.reason),
      requestId=String(input.requestId||'').trim(),r=runtime(cid,false);
    if(cid!==playerCountry()||COMPANY_IDS.indexOf(co)<0||!r)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_OR_COMPANY_SCOPE_INVALID'};
    if(reason.length<12||!requestId)return{status:'BLOCKED',reason:'CLOSURE_REASON_AND_REQUEST_ID_REQUIRED'};
    var current=String((r.companyStatuses||{})[co]||'ACTIVE').toUpperCase();
    if(current==='CLOSED')return{status:'DUPLICATE',reason:'COMPANY_ALREADY_CLOSED'};
    if(!['RESTRUCTURING','INSOLVENT'].includes(current))return{status:'BLOCKED',reason:'COMPANY_MUST_BE_INSOLVENT_OR_IN_RESTRUCTURING'};
    var econ=countryBucket('economy',cid,true),assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],
      account=capitalAccount(cid,co,true),closedAssets=[],cancelledImports=[];
    var financeRootBucket=financeRoot(cid,true),privateReservations=obj(financeRootBucket.companyTradeReservations)?financeRootBucket.companyTradeReservations:{};
    Object.keys(privateReservations).forEach(function(settlementId){
      var reservation=privateReservations[settlementId];
      if(reservation&&reservation.buyerCompanyId===co&&reservation.status==='RESERVED'){
        reservation.status='CANCELLED';reservation.cancelledTurn=turn();reservation.cancellationReason='BUYER_COMPANY_CLOSED';
        cancelledImports.push(settlementId);
      }
    });
    var tradeBucket=countryBucket('trade',cid,true),requests=Array.isArray(tradeBucket.importRequests)?tradeBucket.importRequests:[];
    requests.forEach(function(request){
      if(!request||String(request.status||'').toUpperCase()==='SETTLED'||
         String(request.status||'').toUpperCase()==='REJECTED'||String(request.status||'').toUpperCase()==='FAILED')return;
      if(request.buyerCompanyId!==co&&request.sellerCompanyId!==co)return;
      request.status='CANCELLED';request.stage='COMPANY_CLOSED';request.cancelledTurn=turn();
      request.cancellationReason='PRIVATE_COMPANY_CLOSED';cancelledImports.push(String(request.requestId||''));
    });
    tradeBucket.importRequests=requests;
    tradeBucket.globalTradeLedger=tradeBucket.globalTradeLedger||{requests:[],decisions:[],settlements:[]};
    tradeBucket.globalTradeLedger.requests=Array.isArray(tradeBucket.globalTradeLedger.requests)?tradeBucket.globalTradeLedger.requests:[];
    cancelledImports.forEach(function(reference){tradeBucket.globalTradeLedger.requests.push({requestId:reference,status:'CANCELLED',reason:'PRIVATE_COMPANY_CLOSED',simulationTurn:turn()});});
    tradeBucket.globalTradeLedger.requests=tradeBucket.globalTradeLedger.requests.slice(-MAX_TRADE_HISTORY);
    assets.forEach(function(asset){
      var owner=id(asset&& (asset.ownerCompanyId||asset.ownerId)),operator=id(asset&&(asset.operatorCompanyId||asset.operatorId||asset.companyId));
      if(owner!==co&&operator!==co)return;
      asset.status='CLOSED';asset.productionEnabled=false;asset.productionStatus='COMPANY_CLOSED';
      asset.closedTurn=turn();asset.closureRequestId=requestId;closedAssets.push(String(asset.id||asset.factoryId||''));
    });
    var released=Math.max(0,num(account.reservedBalance)||0);
    account.availableBalance=(num(account.availableBalance)||0)+released;account.reservedBalance=0;
    account.revision=(num(account.revision)||0)+1;
    var proposals=r.proposals.filter(function(p){return p&&p.companyId===co&&
      ['PROPOSED','APPROVED_AWAITING_FUNDING','FUNDED','UNDER_CONSTRUCTION','PARTIALLY_UNDER_CONSTRUCTION'].includes(String(p.status||'').toUpperCase());});
    proposals.forEach(function(p){p.status='CANCELLED';p.cancelledTurn=turn();p.cancellationReason='COMPANY_CLOSED';});
    var resource=countryBucket('resource',cid,false)||{},projects=resource.industrialNetwork&&resource.industrialNetwork.projects||[];
    projects.forEach(function(project){
      if(!project||!project.sourcePrivateProposalId)return;
      var proposal=r.proposals.find(function(p){return p&&p.proposalId===project.sourcePrivateProposalId;});
      if(proposal&&proposal.companyId===co&&String(project.status||'').toUpperCase()!=='COMPLETED'){
        project.status='CANCELLED';project.cancelledTurn=turn();project.cancellationReason='COMPANY_CLOSED';
      }
    });
    r.companyStatuses[co]='CLOSED';
    r.companyClosures=r.companyClosures||{};
    r.companyClosures[co]={companyId:co,requestId:requestId,reason:reason,turn:turn(),
      closedFactoryIds:closedAssets,releasedReservedCash:Number(released.toFixed(2)),
      cancelledPrivateTradeReservations:Array.from(new Set(cancelledImports)),
      remainingOperatingPayables:(r.operatingCostEntries||[]).filter(function(row){return row&&row.companyId===co&&row.status==='POSTED';})
        .reduce(function(sum,row){return sum+Math.max(0,(num(row.amount)||0)-(num(row.settledAmount)||0));},0),
      noAssetRecordsDeleted:true,authority:'OMEGA_PRIVATE_ENTERPRISE_CLOSURE_V1'};
    recordEvent(cid,'PRIVATE_COMPANY_CLOSED',r.companyClosures[co]);
    return{status:'CLOSED',closure:clone(r.companyClosures[co])};
  }
  function diagnostics(){
    var cid=playerCountry(),dash=cid?getCountryDashboard(cid):null;
    var resource=cid?countryBucket('resource',cid,false):null;
    var demand=resource&&obj(resource.demandRuntime)?resource.demandRuntime:{};
    var demandRows=obj(demand.byResource)?demand.byResource:{};
    return{version:VERSION,status:cid?'READY':'PLAYER_COUNTRY_UNRESOLVED',playerCountryId:cid||null,
      resourceBucketFound:!!resource,demandSnapshotTurn:num(demand.lastTurn),
      demandRuntimeResourceKeys:Object.keys(demandRows),
      proposalCount:dash?dash.proposals.length:0,productionEnabled:productionProofReady(),
      pipelineGate:productionGateReason()||'VERIFIED',productionGateReason:productionGateReason(),
      financeAuthority:'Game.state.finance[country].omegaFinance.ledger',
      constructionAuthority:'OmegaResourceIndustrialNetwork.startFactoryProject / advanceProjects',
      assetAuthority:'Game.state.economy[country].productionAssets',
      runtimeScope:'ACTIVE_PLAYER_COUNTRY_ONLY'};
  }
  function listFactoryTypes(){
    var c=catalog()||{},profiles=c.factoryProfiles||{};
    return Object.keys(profiles).map(function(type){return{id:type,name:profiles[type].name||type};});
  }
  function listUniversalProcessingResources(){
    var rules=(catalog()||{}).processingRules||{};
    return Object.keys(rules).filter(function(resourceId){
      return id(rules[resourceId]&&rules[resourceId].factoryType)==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT';
    }).map(function(resourceId){
      return{id:resourceId,name:String(resourceId).replace(/_/g,' ').replace(/\b[a-z]/g,function(ch){return ch.toUpperCase();})};
    });
  }
  var stylesInstalled=false;
  function ensureStyles(){
    if(stylesInstalled||!g.document||!g.document.createElement)return;
    var style=g.document.createElement('style');
    style.id='omega-private-enterprise-lifecycle-styles-v1';
    style.textContent='.omega-private-lifecycle{margin:12px 0;padding:12px;border:1px solid rgba(0,225,255,.28);border-radius:14px;background:linear-gradient(145deg,rgba(7,24,39,.97),rgba(3,12,25,.96));color:#e8f7ff;font:12px/1.45 system-ui,sans-serif}.omega-private-lifecycle .pe-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.omega-private-lifecycle .pe-head small{color:#67dfff;letter-spacing:.08em;font-size:9px}.omega-private-lifecycle h3{margin:3px 0;font-size:16px}.omega-private-lifecycle p{margin:4px 0;color:#9db9cc}.omega-private-lifecycle .pe-gate{font-size:9px;color:#ffd88a;border:1px solid rgba(255,216,138,.4);border-radius:20px;padding:5px 8px}.omega-private-lifecycle .pe-overview{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.omega-private-lifecycle .pe-overview span{padding:5px 8px;background:rgba(0,0,0,.25);border:1px solid rgba(125,190,220,.15);border-radius:7px;color:#9bb8ca}.omega-private-lifecycle .pe-overview b{color:#fff;margin-left:4px}.omega-private-lifecycle .pe-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px;background:rgba(0,0,0,.22);border:1px solid rgba(100,180,220,.16);border-radius:10px}.omega-private-lifecycle .pe-form label{display:flex;flex-direction:column;gap:4px;color:#a9c5d7;font-size:10px;min-width:0}.omega-private-lifecycle input,.omega-private-lifecycle select{width:100%;min-width:0;box-sizing:border-box;padding:8px;border-radius:6px;background:#0b1c2b;border:1px solid rgba(88,182,220,.3);color:#edfaff;font:12px system-ui,sans-serif}.omega-private-lifecycle .pe-checkbox{grid-column:1/-1;flex-direction:row;align-items:center}.omega-private-lifecycle .pe-checkbox input{width:16px;height:16px}.omega-private-lifecycle [data-pe-universal-resource-field][hidden]{display:none!important}.omega-private-lifecycle button{border:1px solid rgba(0,225,255,.35);border-radius:7px;background:linear-gradient(135deg,#0b5470,#12334e);color:#eaffff;padding:8px 10px;font-size:10px;font-weight:700;cursor:pointer}.omega-private-lifecycle .pe-capital-form{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(90px,.8fr) auto;gap:6px;align-items:end;margin:8px 0;padding:8px;border:1px solid rgba(115,195,220,.18);border-radius:8px;background:rgba(0,0,0,.2)}.omega-private-lifecycle .pe-capital-form label{display:flex;flex-direction:column;gap:3px;min-width:0;color:#a9c5d7;font-size:9px}.omega-private-lifecycle .pe-capital-form input{width:100%;min-width:0;box-sizing:border-box;padding:7px;border-radius:6px;background:#0b1c2b;border:1px solid rgba(88,182,220,.3);color:#edfaff;font:11px system-ui,sans-serif}@media(max-width:520px){.omega-private-lifecycle .pe-capital-form{grid-template-columns:1fr 1fr}.omega-private-lifecycle .pe-capital-form button{grid-column:1/-1}}.omega-private-lifecycle .pe-proposals{margin-top:12px}.omega-private-lifecycle h4{font-size:12px;margin:0 0 8px;color:#9deaff}.omega-private-lifecycle .pe-proposal{padding:9px;margin:7px 0;border:1px solid rgba(103,183,220,.18);border-radius:9px;background:rgba(0,0,0,.2)}.omega-private-lifecycle .pe-proposal header{display:flex;justify-content:space-between;gap:8px;color:#b8edff}.omega-private-lifecycle .pe-proposal header span{font-size:9px;color:#ffe0a0}.omega-private-lifecycle .pe-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:7px 0;color:#a8bdce;font-size:10px}.omega-private-lifecycle .pe-warning{display:block;color:#ffc56a;font-size:10px;margin:3px 0}.omega-private-lifecycle .pe-info{display:block;color:#91c8db;font-size:10px;margin:3px 0}.omega-private-lifecycle .pe-adjust{display:inline-flex;align-items:center;gap:5px;max-width:190px;color:#a9c5d7;font-size:10px}.omega-private-lifecycle .pe-adjust input{width:65px}.omega-private-lifecycle .pe-input-forecast{display:grid;gap:5px;padding:8px;margin:7px 0;border-radius:8px;background:rgba(5,25,40,.55);border:1px solid rgba(100,180,220,.13)}.omega-private-lifecycle .pe-input-forecast>strong{font-size:10px;color:#a6eaff}.omega-private-lifecycle .pe-input-row{display:grid;grid-template-columns:minmax(0,1.1fr) repeat(3,minmax(0,1fr));gap:5px;color:#91adbf;font-size:9px}.omega-private-lifecycle .pe-input-row span{min-width:0;overflow-wrap:anywhere}.omega-private-lifecycle .pe-input-row b{color:#e3f6ff;font-weight:600}@media(max-width:520px){.omega-private-lifecycle .pe-input-row{grid-template-columns:1fr 1fr}}.omega-private-lifecycle .pe-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.omega-private-lifecycle .pe-empty{padding:10px;color:#91a8bb;border:1px dashed rgba(120,180,210,.2);border-radius:8px}.omega-private-lifecycle .pe-message{padding:7px 9px;background:rgba(0,225,255,.08);border-left:2px solid #20cfff;color:#bceeff}.omega-private-lifecycle .pe-footnote,.omega-private-lifecycle>small{display:block;margin-top:9px;font-size:9px;color:#809aaa}.omega-private-lifecycle .pe-footnote{line-height:1.5}@media(max-width:520px){.omega-private-lifecycle{padding:9px}.omega-private-lifecycle .pe-form{grid-template-columns:1fr}.omega-private-lifecycle .pe-facts{grid-template-columns:1fr}.omega-private-lifecycle .pe-head{display:block}.omega-private-lifecycle .pe-gate{display:inline-block;margin-top:5px}}';
    style.textContent += '.omega-private-lifecycle .pe-offer-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:9px 0;padding:9px;border:1px solid rgba(0,225,255,.25);border-radius:10px;background:linear-gradient(120deg,rgba(0,107,139,.16),rgba(0,0,0,.18))}.omega-private-lifecycle .pe-offer-summary>div{min-width:0;padding:5px 7px;border-left:2px solid rgba(0,225,255,.35)}.omega-private-lifecycle .pe-offer-summary small{display:block;color:#81cfe3;font-size:8px;text-transform:uppercase;letter-spacing:.06em}.omega-private-lifecycle .pe-offer-summary strong{display:block;color:#f1fbff;font-size:12px;overflow-wrap:anywhere}.omega-private-lifecycle .pe-case-details{margin:8px 0;border:1px solid rgba(115,190,220,.16);border-radius:9px;background:rgba(0,0,0,.14)}.omega-private-lifecycle .pe-case-details>summary{cursor:pointer;padding:9px;color:#a6eaff;font-size:10px;font-weight:700}.omega-private-lifecycle .pe-case-details[open]>summary{border-bottom:1px solid rgba(115,190,220,.13)}.omega-private-lifecycle .pe-case-details .pe-case-body{padding:7px}.omega-private-lifecycle .pe-government-actions{margin-top:9px;padding:9px;border:1px solid rgba(255,196,105,.2);border-radius:9px;background:rgba(60,35,5,.12)}.omega-private-lifecycle .pe-government-actions>strong{display:block;color:#ffe0a0;font-size:11px;margin-bottom:6px}@media(max-width:680px){.omega-private-lifecycle .pe-offer-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}';
    (g.document.head||g.document.documentElement).appendChild(style);
    stylesInstalled=true;
  }
  function companyFinanceCardsMarkup(country,capitalByCompany){
    return COMPANY_IDS.map(function(companyId){
      var statement=getCompanyFinanceSummary(country,companyId),period=statement.lastClosedPeriod||null,
        currency=statement.currency||'GAME_CURRENCY_UNITS';
      function amount(value){return value===null||value===undefined?'Not recorded':Number(value).toLocaleString('en-US',{maximumFractionDigits:2})+' '+currency;}
      var taxLabel=period?'Cash-basis tax '+amount(period.corporateTaxPaid)+' at '+(period.corporateTaxRate*100).toFixed(2)+'%':'Not assessed: close a journalled cash-flow period first';
      var journalWarning=(statement.journal.droppedEntryCount||0)>0?
        'Tax close blocked when this open period contains pruned entries ('+statement.journal.droppedEntryCount+' dropped).':'',
        accrued=statement.journal.accruedCostByCategory||{};
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(statement.companyName||companyId)+'</strong><span>'+escapeHtml(statement.journal.status)+'</span></header>'+
        '<div class="pe-facts"><span>Recorded receipts <b>'+amount(statement.grossRevenue)+'</b></span>'+
        '<span>Cash operating costs <b>'+amount(statement.journal.recordedOperatingCosts)+'</b></span>'+
        '<span>Accrued factory operating costs <b>'+amount(statement.journal.recordedAccruedOperatingCosts)+'</b></span>'+
        '<span>Current accounting profit <b>'+(statement.accountingProfit===null?'Not verifiable':amount(statement.accountingProfit))+'</b></span>'+
        '<span>Net profit after posted taxes <b>'+(statement.netProfit===null?'Not verifiable':amount(statement.netProfit))+'</b></span>'+
        '<span>Net profit status <b>'+escapeHtml(statement.netProfitStatus||'NOT_RECORDED')+'</b></span>'+
        '<span>Last closed-period net profit after tax <b>'+amount(period&&period.netProfitAfterTax)+'</b></span>'+
        '<span>Unpriced cost items <b>'+Number(statement.journal.unpricedOperatingCostCount||0).toLocaleString('en-US')+'</b></span>'+
        '<span>Input materials (cash) <b>'+amount(statement.journal.inputMaterialCosts)+'</b></span>'+
        '<span>Worker costs (cash) <b>'+amount(statement.journal.workerCosts)+'</b></span>'+
        '<span>Transport costs (cash) <b>'+amount(statement.journal.transportCosts)+'</b></span>'+
        '<span>Other recorded costs <b>'+amount(statement.journal.otherRecordedCosts)+'</b></span>'+
        '<span>Electricity accrued <b>'+amount(accrued.ELECTRICITY)+'</b></span>'+
        '<span>Industrial water accrued <b>'+amount(accrued.INDUSTRIAL_WATER)+'</b></span>'+
        '<span>Labor accrued <b>'+amount(accrued.LABOR)+'</b></span>'+
        '<span>Freight accrued <b>'+amount(accrued.FREIGHT)+'</b></span>'+
        '<span>Maintenance accrued <b>'+amount(accrued.MAINTENANCE)+'</b></span>'+
        '<span>Overhead accrued <b>'+amount(accrued.OVERHEAD)+'</b></span>'+
        '<span>Depreciation accrued <b>'+amount(accrued.DEPRECIATION)+'</b></span>'+
        '<span>Recorded tax payments <b>'+amount(statement.journal.recordedTaxPayments)+'</b></span>'+
        '<span>Net cash flow <b>'+amount(statement.runtimeNetCashFlow)+'</b></span>'+
        '<span>Factory CAPEX (separate) <b>'+amount(statement.constructionCapex.amount)+'</b></span>'+
        '<span>Retained earnings <b>'+amount(statement.capital.retainedEarningsBalance)+'</b></span>'+
        '<span>Tax status <b>'+escapeHtml(taxLabel)+'</b></span></div>'+
        '<p class="pe-footnote">Cash receipts and paid costs are taken from the shared company cash-flow journal. Factory utility, labor, maintenance, overhead and depreciation are accrued from completed operating events only where an explicit country rate is configured. Missing costs remain unpriced. '+escapeHtml(journalWarning)+'</p>'+
        '<div class="pe-actions"><button type="button" data-pe-action="close-finance" data-pe-company="'+companyId+'">Close cash-flow period / assess profit tax</button></div></article>';
    }).join('');
  }

  function privateMarketConcentrationMarkup(country){
    var cid=canonicalCountry(country),trade=countryBucket('trade',cid,false)||{},
      sales=Array.isArray(trade.domesticSales)?trade.domesticSales:[],seen=Object.create(null);
    var resourceIds=[];
    sales.forEach(function(wrapper){
      var sale=wrapper&&wrapper.sale&&typeof wrapper.sale==='object'?wrapper.sale:wrapper;
      if(!sale||String(sale.status||'').toUpperCase()!=='SETTLED'||
         String(sale.paymentStatus||'').toUpperCase()!=='SETTLED'||
         String(sale.ownerAllocationStatus||'').toUpperCase()!=='RECONCILED')return;
      var resourceId=String(sale.resourceId||'').trim();
      if(resourceId&&!seen[resourceId]){seen[resourceId]=true;resourceIds.push(resourceId);}
    });
    var summaries=resourceIds.map(function(resourceId){
      return getPrivateMarketConcentration({countryId:cid,resourceId:resourceId,lookbackTurns:365});
    }).filter(function(row){return row&&row.status==='AVAILABLE';})
      .sort(function(a,b){return (num(b.totalAttributedSettledMarketValue)||0)-(num(a.totalAttributedSettledMarketValue)||0);})
      .slice(0,12);
    if(!summaries.length)return'<div class="pe-empty">No verified, settled private-company sales are recorded for this country in the current market ledger.</div>';
    function pct(value){return value===null||value===undefined?'Not available':Number(value).toFixed(2)+'%';}
    function amount(value){return value===null||value===undefined?'Not available':Number(value).toLocaleString('en-US',{maximumFractionDigits:2});}
    return summaries.map(function(row){
      var leaders=row.firms.filter(function(firm){return (num(firm.settledSalesValue)||0)>0;})
        .map(function(firm){return'<div class="pe-input-row"><span><b>'+escapeHtml(firm.companyName)+'</b></span>'+
          '<span>Private-sector share<br><b>'+pct(firm.privateSectorSharePct)+'</b></span>'+
          '<span>Total-market share<br><b>'+pct(firm.totalAttributedMarketSharePct)+'</b></span>'+
          '<span>Settled sales<br><b>'+amount(firm.settledSalesValue)+'</b></span></div>';}).join('');
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(row.resourceId)+'</strong><span>'+escapeHtml(row.concentration)+' concentration</span></header>'+
        '<div class="pe-facts"><span>Private-sector share of attributed sales <b>'+pct(row.privateSectorMarketSharePct)+'</b></span>'+
        '<span>Private-company HHI <b>'+amount(row.privateCompanyHhi)+'</b></span>'+
        '<span>Verified settled sales <b>'+Number(row.verifiedSettledSaleCount||0).toLocaleString('en-US')+'</b></span>'+
        '<span>Total attributed market value <b>'+amount(row.totalAttributedSettledMarketValue)+'</b></span>'+
        '<span>Private export receipts <b>'+amount(row.privateCompanyExportReceiptsValue)+'</b></span>'+
        '<span>Export concentration / HHI <b>'+escapeHtml(row.privateExportConcentration)+' / '+amount(row.privateCompanyExportHhi)+'</b></span></div>'+
        (leaders?'<div class="pe-input-forecast"><strong>Company market positions</strong>'+leaders+'</div>':'<p class="pe-empty">No attributable private-company sales for this resource.</p>')+
        '<small class="pe-footnote">Only paid, settled and owner-attributed sales are included. Quotes, unsold inventory and production capacity are excluded. Export receipts are shown separately. HHI bands are game indicators, not legal competition findings.</small></article>';
    }).join('');
  }

  function privateCompanyGovernanceMarkup(country){
    var cid=canonicalCountry(country),r=runtime(cid,false)||{},statuses=r.companyStatuses||{},
      econ=countryBucket('economy',cid,false)||{},assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[],
      insolvencies=Array.isArray(r.insolvencyCases)?r.insolvencyCases:[],
      restructurings=Array.isArray(r.restructuringCases)?r.restructuringCases:[];
    function amount(value,currency){return value===null||value===undefined?'Not recorded':Number(value).toLocaleString('en-US',{maximumFractionDigits:2})+' '+(currency||'GAME_CURRENCY_UNITS');}
    var companies=COMPANY_IDS.map(function(companyId){
      var solvency=evaluateCompanySolvency(cid,companyId),companyStatus=String(statuses[companyId]||'ACTIVE').toUpperCase(),
        currency=solvency.currency||'GAME_CURRENCY_UNITS',
        companyAssets=assets.filter(function(asset){
          if(!asset||['CLOSED','DESTROYED','DECOMMISSIONED'].includes(String(asset.status||'').toUpperCase()))return false;
          return id(asset.ownerCompanyId||asset.ownerId)===companyId||
            id(asset.operatorCompanyId||asset.operatorId||asset.companyId)===companyId;
        });
      var factoryOptions=companyAssets.map(function(asset){
        var factoryId=String(asset.id||asset.factoryId||'');
        return factoryId?'<option value="'+escapeHtml(factoryId)+'">'+escapeHtml(factoryId)+' · '+escapeHtml(asset.factoryType||asset.name||'Factory')+'</option>':'';
      }).join('');
      var insolvencyForm=solvency.status==='INSOLVENT'&&companyStatus!=='CLOSED'
        ?'<form class="pe-form" data-pe-insolvency-form data-pe-company="'+companyId+'">'+
          '<label>Insolvency case reference<input name="requestId" maxlength="100" required></label>'+
          '<label>Recorded reason<textarea name="reason" minlength="12" maxlength="1000" required placeholder="Explain the verified cash shortfall and unpaid obligations."></textarea></label>'+
          '<button type="submit">Open insolvency case</button></form>':'';
      var canRestructure=['INSOLVENT','AT_RISK'].includes(solvency.status)&&
        !['RESTRUCTURING','CLOSED'].includes(companyStatus)&&companyAssets.length>0;
      var restructureForm=canRestructure
        ?'<form class="pe-form" data-pe-restructure-form data-pe-company="'+companyId+'">'+
          '<label>Restructuring reference<input name="requestId" maxlength="100" required></label>'+
          '<label>Factory to suspend<select name="factoryId" required>'+factoryOptions+'</select></label>'+
          '<label>Restructuring reason<textarea name="reason" minlength="12" maxlength="1000" required placeholder="Explain how suspending this loss-making line protects liquidity and creditors."></textarea></label>'+
          '<button type="submit">Propose restructuring plan</button></form>':'';
      var closureForm=['INSOLVENT','RESTRUCTURING'].includes(companyStatus)
        ?'<form class="pe-form" data-pe-closure-form data-pe-company="'+companyId+'">'+
          '<label>Closure reference<input name="requestId" maxlength="100" required></label>'+
          '<label>Closure reason<textarea name="reason" minlength="12" maxlength="1000" required placeholder="Explain why the company cannot continue or recover."></textarea></label>'+
          '<button type="submit">Close company and preserve asset history</button></form>':'';
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(COMPANY_NAMES[companyId]||companyId)+'</strong><span>'+escapeHtml(companyStatus)+' · '+escapeHtml(solvency.status)+'</span></header>'+
        '<div class="pe-facts"><span>Available company cash <b>'+amount(solvency.availableCash,currency)+'</b></span>'+
        '<span>Recorded current liabilities <b>'+amount(solvency.totalRecordedCurrentLiabilities,currency)+'</b></span>'+
        '<span>Accrued operating payables <b>'+amount(solvency.accruedOperatingPayables,currency)+'</b></span>'+
        '<span>Recorded debt outstanding <b>'+amount(solvency.recordedDebtOutstanding,currency)+'</b></span>'+
        '<span>Debt evidence <b>'+escapeHtml(solvency.debtEvidenceStatus||'NOT_RECORDED')+'</b></span>'+
        '<span>Retained earnings <b>'+amount(solvency.retainedEarnings,currency)+'</b></span>'+
        '<span>Liquidity surplus <b>'+amount(solvency.liquiditySurplus,currency)+'</b></span></div>'+
        '<small class="pe-footnote">'+escapeHtml(solvency.reason||'Solvency evidence unavailable')+'. '+escapeHtml(solvency.limitation||'')+'</small>'+
        insolvencyForm+restructureForm+closureForm+'</article>';
    }).join('');
    var caseMarkup=restructurings.slice().reverse().slice(0,24).map(function(row){
      var actions='';
      if(row.status==='PROPOSED')actions='<button type="button" data-pe-action="restructure-approve" data-pe-company="'+escapeHtml(row.companyId)+'" data-pe-case="'+escapeHtml(row.caseId)+'">Approve plan</button>'+
        '<button type="button" data-pe-action="restructure-defer" data-pe-company="'+escapeHtml(row.companyId)+'" data-pe-case="'+escapeHtml(row.caseId)+'">Defer</button>'+
        '<button type="button" data-pe-action="restructure-deny" data-pe-company="'+escapeHtml(row.companyId)+'" data-pe-case="'+escapeHtml(row.caseId)+'">Reject</button>';
      else if(row.status==='APPROVED')actions='<button type="button" data-pe-action="restructure-apply" data-pe-company="'+escapeHtml(row.companyId)+'" data-pe-case="'+escapeHtml(row.caseId)+'">Apply approved plan</button>';
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(row.companyId)+' · '+escapeHtml(row.caseId)+'</strong><span>'+escapeHtml(row.status)+'</span></header>'+
        '<p>'+escapeHtml(row.reason||'No reason recorded')+'</p><div class="pe-actions">'+actions+'</div>'+
        (row.failedActions&&row.failedActions.length?'<small class="pe-warning">Failed actions: '+escapeHtml(row.failedActions.map(function(x){return x.reason||x.type;}).join(', '))+'</small>':'')+
        '</article>';
    }).join('');
    var insolvencyHistory=insolvencies.slice().reverse().slice(0,12).map(function(row){
      return'<span class="pe-info">'+escapeHtml(row.companyId)+' · '+escapeHtml(row.status)+' · '+escapeHtml(row.reason)+'</span>';
    }).join('');
    return'<div class="pe-proposals"><h4>Company solvency and current liabilities</h4>'+companies+'</div>'+
      '<div class="pe-proposals"><h4>Government restructuring decisions</h4>'+
      (caseMarkup||'<div class="pe-empty">No restructuring proposals are recorded.</div>')+'</div>'+
      '<div class="pe-proposals"><h4>Insolvency case history</h4>'+
      (insolvencyHistory||'<div class="pe-empty">No insolvency cases are recorded.</div>')+'</div>'+
      '<p class="pe-footnote">Insolvency is assessed only from recorded company cash and priced current liabilities. Unknown balances or unpriced costs remain unresolved. Closing a company stops its private assets and cancels open private trade requests without deleting the historical asset records or creditor balances.</p>';
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
    var previousPanel=shell.querySelector('[data-omega-private-company-lifecycle]');
    var financeWasOpen=!!(previousPanel&&previousPanel.querySelector('[data-pe-finance-details]')&&
      previousPanel.querySelector('[data-pe-finance-details]').open);
    var marketWasOpen=!!(previousPanel&&previousPanel.querySelector('[data-pe-market-details]')&&
      previousPanel.querySelector('[data-pe-market-details]').open);
    var oversightWasOpen=!!(previousPanel&&previousPanel.querySelector('[data-pe-oversight-details]')&&
      previousPanel.querySelector('[data-pe-oversight-details]').open);
    if(previousPanel&&previousPanel.remove)previousPanel.remove();
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
      // Company agents, not the government player, prepare and submit business cases.
      // Keep the loading state informational; do not mount an application form on behalf
      // of a company before the authoritative country baselines have been validated.
      shell.insertAdjacentHTML('beforeend','<section class="omega-private-lifecycle" data-omega-private-company-lifecycle="v1" data-pe-baseline-status="'+(loadFailed?'blocked':'loading')+'"><h3>Private company proposals</h3><p>'+loadMessage+'</p>'+retry+'<p class="pe-footnote">Companies independently prepare their market analysis, input sourcing plan, financing offer, expected benefits and risks. The government reviews and negotiates their submissions after the country baselines load. No proposal, stock, factory or cash changes while loading.</p></section>');
      bindUi(root);
      return;
    }
    var dash=getCountryDashboard(country),types=listFactoryTypes(),universalResources=listUniversalProcessingResources();
    var capitalByCompany=dash.capitalAccounts||{};
    var companyOptions=COMPANY_IDS.map(function(company){var balance=capitalByCompany[company]&&num(capitalByCompany[company].availableBalance)||0;return'<option value="'+company+'">'+COMPANY_NAMES[company]+' · capital '+balance.toLocaleString('en-US')+'</option>';}).join('');
    var typeOptions=types.map(function(type){return'<option value="'+type.id+'">'+String(type.name).replace(/[&<>"]/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]);})+'</option>';}).join('');
    var universalResourceOptions=universalResources.map(function(row){return'<option value="'+escapeHtml(row.id)+'">'+escapeHtml(row.name)+'</option>';}).join('');
    var universalResourceField='<label data-pe-universal-resource-field'+(types[0]&&types[0].id==='UNIVERSAL_MATERIALS_ELEMENTS_PROCESSING_PLANT'?'':' hidden')+'>Universal Materials processing resource<select name="processingResourceId">'+universalResourceOptions+'</select><small>Required only for the Universal Materials plant; uses the catalog processing rule.</small></label>';
    var cards=dash.proposals.slice().reverse().map(function(p){
      var account=capitalByCompany[p.companyId]||{},balance=num(account.availableBalance)||0;
      var buttons='';
      if(p.status==='PROPOSED')buttons='<button type="button" data-pe-action="approve" data-pe-proposal="'+p.proposalId+'">Approve</button><button type="button" data-pe-action="hold" data-pe-proposal="'+p.proposalId+'">Hold</button><button type="button" data-pe-action="defer" data-pe-proposal="'+p.proposalId+'">Defer</button><button type="button" data-pe-action="deny" data-pe-proposal="'+p.proposalId+'">Reject</button>';
      else if(p.status==='ON_HOLD')buttons='<button type="button" data-pe-action="resume" data-pe-proposal="'+p.proposalId+'">Resume review</button><button type="button" data-pe-action="deny" data-pe-proposal="'+p.proposalId+'">Reject</button>';
      else if(p.status==='NEGOTIATION_PENDING_COMPANY')buttons='<span class="pe-info">Counter-offer sent · awaiting company response</span>';
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
      var assessment=p.governmentReview&&p.governmentReview.assessment||p.approvalAssessment||proposalDecisionAssessment(p,preview);
      var applicationMarkup='<div class="pe-input-forecast"><strong>Company-authored business case · submitted by '+escapeHtml(COMPANY_NAMES[p.submittedBy||p.companyId]||p.submittedBy||p.companyId)+'</strong>'+
        '<p><b>Why the company wants to build</b><br>'+escapeHtml(p.requestReason||'Not recorded')+'</p>'+
        '<p><b>What the company offers and expects</b><br>'+escapeHtml(p.expectedBenefit||'Not recorded')+'</p>'+
        '<p><b>Risks disclosed by the company</b><br>'+escapeHtml(p.riskForecast||'Not recorded')+'</p></div>';
      var companyCase=p.companyCase||{};
      var caseMarketRows=companyCase.marketAnalysis&&companyCase.marketAnalysis.outputs||[];
      var caseSupplyRows=companyCase.supplyChainProof&&companyCase.supplyChainProof.inputs||[];
      function caseAmount(value){return value===null||value===undefined?'Not verified':Number(value).toLocaleString('en-US',{maximumFractionDigits:2});}
      var marketOpportunity=companyCase.marketAnalysis||{},domesticOpportunityRows=marketOpportunity.domesticDemand||[],
        internationalOpportunityRows=marketOpportunity.internationalDemand||[],processingOpportunityRows=marketOpportunity.exportProcessingOpportunities||[],
        researchRequest=marketOpportunity.researchRequest||p.marketResearchRequest||{};
      var companyOpportunityMarkup='<div class="pe-input-forecast"><strong>Domestic demand and export-processing opportunities</strong>'+ 
        (domesticOpportunityRows.length?domesticOpportunityRows.map(function(row){return'<div class="pe-input-row"><span><b>'+escapeHtml(row.resourceId)+'</b></span><span>Domestic demand/day<br><b>'+caseAmount(row.demandPerDay)+'</b></span><span>Existing output/day<br><b>'+caseAmount(row.existingOutputPerDay)+'</b></span><span>30-day unmet demand<br><b>'+caseAmount(row.unmetDomesticDemand30Day)+'</b></span><span>'+escapeHtml(row.status||'UNOBSERVED')+'</span></div>';}).join(''):'<span class="pe-info">No current domestic demand snapshot is available.</span>')+
        '<strong>International demand and supply</strong>'+
        (internationalOpportunityRows.length?internationalOpportunityRows.map(function(row){return'<div class="pe-input-row"><span><b>'+escapeHtml(row.resourceId)+'</b></span><span>Unmatched buy orders<br><b>'+caseAmount(row.globalUnmatchedBuyOrderDepth)+'</b></span><span>Unmatched sell offers<br><b>'+caseAmount(row.globalUnmatchedSellOfferDepth)+'</b></span><span>Demand vs supply gap<br><b>'+caseAmount(row.unmatchedDemandSupplyGap)+'</b></span><span>'+escapeHtml(row.demandSupplyStatus||'UNOBSERVED')+'</span></div>';}).join(''):'<span class="pe-info">International buyer-side evidence is not currently available.</span>')+
        '<strong>Raw-material export to domestic processing</strong>'+
        (processingOpportunityRows.length?processingOpportunityRows.map(function(row){return'<div class="pe-input-row"><span><b>'+escapeHtml(row.resourceId)+'</b></span><span>Raw material needed<br><b>'+caseAmount(row.required30Day)+'</b></span><span>Domestic uncommitted supply<br><b>'+caseAmount(row.domesticUncommittedAvailable)+'</b></span><span>Observed export matches<br><b>'+caseAmount(row.matchedRawMaterialExportsFromCountry)+'</b></span><span>'+escapeHtml(row.status||'UNOBSERVED')+'</span></div>';}).join(''):'<span class="pe-info">No input export-processing opportunity is verified.</span>')+
        '<small>Market research request: '+escapeHtml(researchRequest.status||'NOT_RECORDED')+' · '+escapeHtml(researchRequest.responseStatus||'AWAITING_MARKET_EVIDENCE')+' · '+escapeHtml(researchRequest.requestId||'No request ID')+'. Missing market data does not prevent company submission.</small></div>';
      var companyMarketMarkup='<div class="pe-input-forecast"><strong>Company market analysis · 30-day output scenario</strong>'+
        (caseMarketRows.length?caseMarketRows.map(function(row){return'<div class="pe-input-row"><span><b>'+escapeHtml(row.resourceId)+'</b><br>Output '+caseAmount(row.projected30DayQuantity)+'</span><span>Market signal<br><b>'+escapeHtml(row.priceDiscovery||'UNAVAILABLE')+'</b></span><span>Clearing price<br><b>'+(row.clearingPriceUsd===null?'Not cleared':caseAmount(row.clearingPriceUsd)+' USD')+'</b></span><span>Matched quantity<br><b>'+caseAmount(row.matchedQuantity)+'</b></span></div><small>Order-book snapshot: turn '+caseAmount(row.marketGeneratedTurn)+' · '+(row.marketSnapshotCurrent?'CURRENT TURN':'STALE / UNVERIFIED')+'</small><small>'+escapeHtml(row.evidenceStatus||'MARKET_EVIDENCE_UNAVAILABLE')+'</small>';}).join(''):'<span class="pe-info">No output market quote is verified.</span>')+
        '<small>Reference prices are not cleared trades. Capacity is not demand, and projected production is not guaranteed sales.</small></div>';
      var companySupplyMarkup='<div class="pe-input-forecast"><strong>Company supply-chain evidence · '+escapeHtml(companyCase.supplyChainProof&&companyCase.supplyChainProof.domesticCoverageStatus||'UNVERIFIED')+'</strong>'+
        (caseSupplyRows.length?caseSupplyRows.map(function(row){return'<div class="pe-input-row"><span><b>'+escapeHtml(row.resourceId)+'</b><br>30-day need '+caseAmount(row.required30Day)+'</span><span>Domestic surplus<br><b>'+caseAmount(row.domesticUncommittedAvailable)+'</b></span><span>Coverage<br><b>'+escapeHtml(row.domesticCoverage)+'</b></span><span>Gap<br><b>'+caseAmount(row.shortfall)+'</b></span></div>'+
          (row.potentialExternalSuppliers&&row.potentialExternalSuppliers.length?'<small>Potential external sources: '+row.potentialExternalSuppliers.map(function(x){return escapeHtml(x.countryId)+' ('+caseAmount(x.available)+')';}).join(', ')+' · not contracted</small>':'')+
          (row.potentialPrivateCompanySuppliers&&row.potentialPrivateCompanySuppliers.length?'<small>Potential company sources: '+row.potentialPrivateCompanySuppliers.map(function(x){return escapeHtml(x.companyName||x.companyId)+' / '+escapeHtml(x.countryId)+' ('+caseAmount(x.available)+')';}).join(', ')+' · not contracted</small>':'');
        }).join(''):'<span class="pe-info">Input stock or demand evidence has not been verified.</span>')+
        '<small>The company must provide supplier contracts, deliverable volumes, sourcing routes and logistics evidence. The government independently verifies the supplier evidence submitted by the company. Potential suppliers are not secured supply; no signed contract or reserved supply is recorded in this proposal.</small></div>';
      var economics=companyCase.unitEconomics||{},domesticEconomics=economics.domesticProduction||{},
        importedEconomics=economics.importedInputProduction||{};
      var economicsInputMarkup=(economics.inputs||[]).map(function(row){return'<div class="pe-input-row"><span><b>'+escapeHtml(row.resourceId)+'</b><br>30-day need '+caseAmount(row.required30Day)+'</span><span>Domestic quantity<br><b>'+caseAmount(row.domesticQuantity)+'</b></span><span>Imported quantity<br><b>'+caseAmount(row.importQuantity)+'</b></span><span>Source mix<br><b>'+caseAmount(row.domesticSharePct)+'% / '+caseAmount(row.importSharePct)+'%</b></span><span>Domestic input cost<br><b>'+caseAmount(row.domesticCost)+'</b></span><span>Import commodity cost<br><b>'+caseAmount(row.importCommodityCost)+'</b></span><span>Import landed cost<br><b>'+escapeHtml(row.importLandedCostStatus||'UNOBSERVED')+'</b></span><span>Sourcing decision<br><b>'+escapeHtml(row.sourcingDecision||'UNOBSERVED')+'</b></span></div>';}).join('');
      var companyUnitEconomicsMarkup='<div class="pe-input-forecast"><strong>Company profitability scenarios · '+escapeHtml(economics.horizonDays||30)+' days</strong>'+
        '<div class="pe-facts"><span>Domestic input scenario · gross sales <b>'+caseAmount(domesticEconomics.grossSalesCeiling)+'</b></span>'+
        '<span>Domestic input cost <b>'+caseAmount(domesticEconomics.domesticInputCost)+'</b></span>'+
        '<span>Operating cost <b>'+caseAmount(domesticEconomics.operatingCost)+'</b></span>'+
        '<span>Net operating result <b>'+caseAmount(domesticEconomics.netOperatingResult)+'</b></span>'+
        '<span>Profit margin <b>'+caseAmount(domesticEconomics.profitMarginPct)+'%</b></span>'+
        '<span>Loss margin <b>'+caseAmount(domesticEconomics.lossMarginPct)+'%</b></span>'+
        '<span>Domestic scenario status <b>'+escapeHtml(domesticEconomics.status||'UNRESOLVED')+'</b></span>'+
        '<span>Domestic input export result <b>'+caseAmount((economics.domesticInputExport||{}).netOperatingResult)+'</b></span>'+
        '<span>Domestic-input export margin <b>'+caseAmount((economics.domesticInputExport||{}).profitMarginPct)+'%</b></span>'+
        '<span>Imported input commodity cost <b>'+caseAmount(importedEconomics.importedCommodityCost)+'</b></span>'+
        '<span>Import freight / tariff / insurance <b>'+caseAmount(importedEconomics.freightTariffInsuranceCost)+'</b></span>'+
        '<span>Imported-input net before landed costs <b>'+caseAmount(importedEconomics.netBeforeLandedImportCosts)+'</b></span>'+
        '<span>Pre-landed margin ceiling <b>'+caseAmount(importedEconomics.preLandedMarginCeilingPct)+'%</b></span>'+
        '<span>Final imported-input profit/loss <b>'+caseAmount(importedEconomics.actualProfitOrLoss)+'</b></span></div>'+
        (economicsInputMarkup?'<strong>Input sourcing plan and cost by resource</strong>'+economicsInputMarkup:'<span class="pe-info">No recipe input cost rows are available.</span>')+
        '<small>'+escapeHtml(importedEconomics.limitation||'Profit/loss remains unresolved where input prices or landed import costs are unavailable.')+'</small>'+
        '<small>All figures are runtime scenarios using observed prices and the configured operating-cost policy. Full-capacity sell-through is not a guaranteed sale; unknown values are not estimated.</small></div>';
      var financing=companyCase.financingOffer||{};
      var investmentOptions=companyCase.investmentOptions||{},dataConfidence=companyCase.dataConfidence||{};
      var scaleOptionMarkup=(investmentOptions.scaleAlternatives||[]).map(function(row){
        return'<div class="pe-input-row"><span><b>'+Number(row.factoryCount||0).toLocaleString('en-US')+' factories</b>'+
          (row.selected?' · proposed':'')+'</span><span>Daily capacity<br><b>'+caseAmount(row.dailyCapacityForecast)+'</b></span>'+
          '<span>Construction capital<br><b>'+caseAmount(row.constructionCapitalRequired)+'</b></span>'+
          '<span>Company cash<br><b>'+caseAmount(row.companyCashAvailable)+'</b></span>'+
          '<span>Funding gap<br><b>'+caseAmount(row.fundingGap)+'</b></span>'+
          '<span>Self-financed<br><b>'+(row.canSelfFinance===null?'UNOBSERVED':row.canSelfFinance?'YES':'NO')+'</b></span></div>';
      }).join('');
      var financingPathMarkup=(investmentOptions.financingAlternatives||[]).map(function(row){
        return'<div class="pe-input-row"><span><b>'+escapeHtml(row.structure)+'</b></span>'+
          '<span>Status<br><b>'+escapeHtml(row.status)+'</b></span>'+
          '<span>Amount / gap<br><b>'+caseAmount(row.requestedAmount!==undefined?row.requestedAmount:row.fundingGap)+'</b></span>'+
          (row.requestedSharePct!==undefined?'<span>Indicative share<br><b>'+caseAmount(row.requestedSharePct)+'%</b></span>':'')+
        '</div>';
      }).join('');
      var companyOptionsMarkup='<div class="pe-input-forecast"><strong>Flexible investment scale and financing alternatives</strong>'+
        '<div class="pe-facts"><span>Proposed factories <b>'+caseAmount(investmentOptions.proposedFactoryCount)+'</b></span>'+
        '<span>Policy expansion ceiling <b>'+caseAmount(investmentOptions.maximumPolicyCompliantFactoryCount)+'</b></span>'+
        '<span>Budget-affordable factories <b>'+caseAmount(investmentOptions.maximumAffordableFactoryCount)+'</b></span>'+
        '<span>Maximum self-financed factories <b>'+caseAmount(investmentOptions.maximumSelfFinancedFactoryCount)+'</b></span></div>'+
        (scaleOptionMarkup||'<span class="pe-info">Alternative scale cannot be calculated from the currently recorded capital/expansion data.</span>')+
        '<strong>Funding routes the company considered</strong>'+
        (financingPathMarkup||'<span class="pe-info">No financing alternative could be calculated.</span>')+
        '<strong>Evidence coverage: '+escapeHtml(dataConfidence.status||'UNOBSERVED')+' · '+caseAmount(dataConfidence.coveragePct)+'%</strong>'+
        '<div class="pe-facts"><span>Current order books <b>'+caseAmount(dataConfidence.currentTurnOrderBook&&dataConfidence.currentTurnOrderBook.observed)+' / '+caseAmount(dataConfidence.currentTurnOrderBook&&dataConfidence.currentTurnOrderBook.total)+'</b></span>'+
        '<span>Domestic demand/supply <b>'+caseAmount(dataConfidence.domesticDemandAndSupply&&dataConfidence.domesticDemandAndSupply.observed)+' / '+caseAmount(dataConfidence.domesticDemandAndSupply&&dataConfidence.domesticDemandAndSupply.total)+'</b></span>'+
        '<span>Raw export signals <b>'+caseAmount(dataConfidence.rawMaterialExportSignals&&dataConfidence.rawMaterialExportSignals.observed)+' / '+caseAmount(dataConfidence.rawMaterialExportSignals&&dataConfidence.rawMaterialExportSignals.total)+'</b></span>'+
        '<span>Input availability <b>'+caseAmount(dataConfidence.inputAvailability&&dataConfidence.inputAvailability.observed)+' / '+caseAmount(dataConfidence.inputAvailability&&dataConfidence.inputAvailability.total)+'</b></span>'+
        '<span>Observed prices <b>'+caseAmount(dataConfidence.currentPriceObservations&&dataConfidence.currentPriceObservations.observed)+' / '+caseAmount(dataConfidence.currentPriceObservations&&dataConfidence.currentPriceObservations.total)+'</b></span></div>'+
        '<small>Evidence coverage describes recorded observations only. Missing prices, demand, supplier capacity or import landed costs stay unresolved; they never become zero or assumed profit.</small></div>';
      var companyFinanceOfferMarkup='<div class="pe-input-forecast"><strong>Company financing offer / request</strong>'+
        '<div class="pe-facts"><span>Preferred structure <b>'+escapeHtml(financing.preferredStructure||'NOT_STATED')+'</b></span>'+
        '<span>Company cash available <b>'+caseAmount(financing.companyCashAvailable)+'</b></span>'+
        '<span>Company capital offered <b>'+caseAmount(financing.companyCapitalOffer)+'</b></span>'+
        '<span>Total company capital raised <b>'+caseAmount(financing.companyCapitalBudget&&financing.companyCapitalBudget.totalCapitalRaised)+'</b></span>'+
        '<span>Reserved company capital <b>'+caseAmount(financing.companyCapitalBudget&&financing.companyCapitalBudget.reservedCapital)+'</b></span>'+
        '<span>Capital already spent <b>'+caseAmount(financing.companyCapitalBudget&&financing.companyCapitalBudget.capitalAlreadySpent)+'</b></span>'+
        '<span>Maximum affordable factory units <b>'+caseAmount(financing.companyCapitalBudget&&financing.companyCapitalBudget.maximumAffordableFactoryUnits)+'</b></span>'+
        '<span>Can afford requested project <b>'+escapeHtml(financing.companyCapitalBudget&&financing.companyCapitalBudget.canAffordRequestedProject===null?'UNOBSERVED':financing.companyCapitalBudget&&financing.companyCapitalBudget.canAffordRequestedProject?'YES':'NO')+'</b></span>'+
        '<span>Indicative partner share requested <b>'+(financing.requestedPrivateShareholdingPct===null?'Not calculated':caseAmount(financing.requestedPrivateShareholdingPct)+'%')+'</b></span>'+
        '<span>Capital required <b>'+caseAmount(financing.constructionCapitalRequired)+'</b></span>'+
        '<span>Funding gap <b>'+caseAmount(financing.fundingGap)+'</b></span>'+
        '<span>Government grant requested <b>'+caseAmount(financing.requestedGovernmentGrant)+'</b></span>'+
        '<span>Government equity requested <b>'+caseAmount(financing.requestedGovernmentEquityBps)+' bps</b></span>'+
        '<span>Private shareholding <b>'+(financing.privateShareholdingRequested?'Requested':'Not requested')+'</b></span>'+
        '<span>Shareholding terms <b>'+escapeHtml(financing.privateShareholdingTermsStatus||'NOT_STATED')+'</b></span>'+
        '<span>Loan guarantee <b>'+(financing.requestedLoanGuarantee?'Requested':'Not requested')+'</b></span>'+
        '<span>Public infrastructure <b>'+(companyCase.companyExpectations&&companyCase.companyExpectations.publicInfrastructureRequested?'Requested':'Not requested')+'</b></span>'+
        '<span>Utility support <b>'+(companyCase.companyExpectations&&companyCase.companyExpectations.utilitySupportRequested?'Requested':'Not requested')+'</b></span>'+
        '<span>Government offtake <b>'+(companyCase.companyExpectations&&companyCase.companyExpectations.governmentOfftakeRequested?'Requested':'Not requested')+'</b></span></div>'+
        '<small>Share percentage basis: '+escapeHtml(financing.privateShareholdingBasis||'NOT_STATED')+'. It is an indicative project funding share, not a binding company valuation.</small>'+
        '<small>'+escapeHtml(financing.companyCapitalAccountStatus||'CAPITAL_NOT_VERIFIED')+' · '+escapeHtml(financing.settlementStatus||'PROPOSAL_ONLY_NOT_SETTLED')+'. Requests are not funds until a matching Finance ledger transaction is verified.</small>'+
        '<small>Company-requested conditions: '+escapeHtml((companyCase.companyExpectations&&companyCase.companyExpectations.requestedConditions||[]).join('; ')||'None stated')+'</small></div>';
      var financial=assessment.financialForecast||{};
      function forecastAmount(value){return value===null||value===undefined?'Not observed':Number(value).toLocaleString('en-US',{maximumFractionDigits:2})+(financial.currency?' '+escapeHtml(financial.currency):'');}
      var riskMarkup='<div class="pe-input-forecast"><strong>Independent government assessment · 30-day benefit / risk · '+escapeHtml(assessment.riskStatus||'UNRESOLVED')+'</strong>'+
        '<div class="pe-input-row"><span>Daily processing capacity<br><b>'+forecastAmount(assessment.capacity&&assessment.capacity.dailyProcessingCapacity)+'</b></span>'+
        '<span>30-day processing capacity<br><b>'+forecastAmount(assessment.capacity&&assessment.capacity.projected30DayProcessingCapacity)+'</b></span>'+
        '<span>Gross sales ceiling<br><b>'+forecastAmount(financial.grossSalesCeilingAtFullSellThrough)+'</b></span>'+
        '<span>Input cost estimate<br><b>'+forecastAmount(financial.inputPurchaseCostEstimate)+'</b></span></div>'+
        '<p>Net operating result: <b>'+forecastAmount(financial.netOperatingResultAtFullSellThrough)+'</b>. '+escapeHtml(financial.netResultUnavailableReason||'Capacity-only scenario, not a guarantee of customer sales.')+'</p>'+
        (assessment.riskFlags||[]).map(function(flag){return'<span class="'+(flag.severity==='HIGH'?'pe-warning':'pe-info')+'">'+escapeHtml(flag.severity)+' · '+escapeHtml(flag.code.replace(/_/g,' '))+(flag.count?' ('+flag.count+')':'')+'</span>';}).join('')+
        '<small>Unobserved market prices, demand and operating costs are not converted into revenue or assumed profit. Only settled sales enter company revenue.</small></div>';
      var progress=(p.projectIds||[]).length+'/'+p.quantity+' projects';
      var projectOffer=companyCase.projectOffer||{},buildDays=projectOffer.constructionDurationDays;
      var externalFunding=financing.requestedExternalFundingAmount;
      var privateEquityTerms=financing.privateShareholdingRequested
        ?(financing.requestedPrivateShareholdingBps===null?'Percentage to be negotiated after valuation':Number(financing.requestedPrivateShareholdingBps/100).toFixed(2)+'% offered')
        :'Not requested';
      var offerSummaryMarkup='<div class="pe-offer-summary" data-pe-offer-summary="'+escapeHtml(p.proposalId)+'">'+
        '<div><small>Company wants to build</small><strong>'+Number(projectOffer.requestedFactoryCount||p.quantity).toLocaleString('en-US')+' × '+escapeHtml(p.factoryName)+'</strong></div>'+
        '<div><small>Construction period</small><strong>'+(buildDays===null||buildDays===undefined?'Not recorded':Number(buildDays).toLocaleString('en-US')+' days')+'</strong></div>'+
        '<div><small>Company capital offer</small><strong>'+caseAmount(financing.companyCapitalOffer)+' '+escapeHtml(p.capitalUnit||'')+'</strong></div>'+
        '<div><small>External funding asked</small><strong>'+caseAmount(externalFunding)+' '+escapeHtml(p.capitalUnit||'')+'</strong></div>'+
        '<div><small>Preferred finance</small><strong>'+escapeHtml(financing.preferredStructure||'Not stated')+'</strong></div>'+
        '<div><small>Private shareholding</small><strong>'+escapeHtml(privateEquityTerms)+'</strong></div>'+
        '<div><small>Government grant asked</small><strong>'+caseAmount(financing.requestedGovernmentGrant)+' '+escapeHtml(p.capitalUnit||'')+'</strong></div>'+
        '<div><small>Company risk disclosure</small><strong>'+escapeHtml(assessment.riskStatus||'UNRESOLVED')+'</strong></div></div>';
      var companyCaseDetails='<details class="pe-case-details" data-pe-company-case-details><summary>Company business case · market, supply chain, benefits and financing offer</summary><div class="pe-case-body">'+
        applicationMarkup+companyOpportunityMarkup+companyMarketMarkup+companySupplyMarkup+companyUnitEconomicsMarkup+companyFinanceOfferMarkup+companyOptionsMarkup+'</div></details>';
      var governmentReviewDetails='<details class="pe-case-details" data-pe-government-review-details><summary>Independent government assessment · market reality, national supply and public risk</summary><div class="pe-case-body">'+
        riskMarkup+readinessMarkup+inputDetails+shortages+unknown+'</div></details>';
      var facts='<div class="pe-facts"><span>Asset owner: '+escapeHtml(COMPANY_NAMES[p.companyId]||p.companyId)+'</span><span>Operator: '+escapeHtml(COMPANY_NAMES[p.operatorCompanyId||p.companyId]||(p.operatorCompanyId||p.companyId))+'</span><span>Factory: '+escapeHtml(p.factoryName)+'</span><span>Quantity: '+p.quantity+'</span><span>Capital: '+(p.capitalRequired===null?'Unquoted':Number(p.capitalRequired).toLocaleString('en-US')+' '+escapeHtml(p.capitalUnit))+'</span><span>Company capital: '+balance.toLocaleString('en-US')+'</span><span>Government factories: '+Number(preview.governmentFactoryCount||0).toLocaleString('en-US')+'</span><span>Private opening allocation: '+Number(preview.openingPrivateAllocation||0).toLocaleString('en-US')+'</span><span>Additional policy ceiling: '+Number(preview.maximumAdditionalUnits||0).toLocaleString('en-US')+'</span><span>Max safe domestic-input factories: '+(preview.maximumSafeDomesticFactoryQuantity===null?'Not observed':Number(preview.maximumSafeDomesticFactoryQuantity).toLocaleString('en-US'))+'</span><span>Daily capacity forecast: '+Number(preview.requestedDailyCapacity||0).toLocaleString('en-US')+'</span><span>Source: '+p.sourcingPolicy.replace(/_/g,' ')+'</span><span>Permit: '+(p.permit?escapeHtml(p.permit.permitId)+' · expires T'+Number(p.permit.expiresAtTurn).toLocaleString('en-US'):'Not issued')+'</span><span>Projects: '+progress+'</span></div>';
      if(p.status==='PROPOSED')buttons='<label class="pe-adjust">Decision quantity <input type="number" min="1" max="'+MAX_PROJECTS_PER_PROPOSAL+'" step="1" value="'+p.quantity+'" data-pe-adjust-quantity="'+p.proposalId+'"></label><button type="button" data-pe-action="adjust" data-pe-proposal="'+p.proposalId+'">Update quantity</button>'+buttons;
      var capitalReceiptForm=p.status==='APPROVED_AWAITING_FUNDING'&&balance+1e-9<(num(p.capitalRequired)||0)
        ?'<form class="pe-capital-form" data-pe-capital-form data-pe-company="'+escapeHtml(p.companyId)+'" data-pe-proposal="'+escapeHtml(p.proposalId)+'"><label>Finance receipt transaction ID<input name="sourceTransactionId" type="text" maxlength="160" autocomplete="off" required></label><label>Settled amount ('+escapeHtml(p.capitalUnit)+')<input name="amount" type="number" min="0.01" step="any" inputmode="decimal" required></label><button type="submit">Verify company capital</button></form>'
        :'';
      var counterOfferForm=p.status==='PROPOSED'
        ?'<form class="pe-form" data-pe-counter-form data-pe-proposal="'+escapeHtml(p.proposalId)+'"><strong>Government negotiation / counter-offer</strong>'+
          '<label>Permitted quantity<input name="quantity" type="number" min="1" max="'+p.quantity+'" step="1" value="'+p.quantity+'" required></label>'+
          '<label>Government offer type<select name="supportType"><option value="NO_PUBLIC_FINANCING">No public financing</option><option value="CAPITAL_GRANT">Capital grant</option><option value="GOVERNMENT_EQUITY">Government equity (terms only)</option><option value="LOAN_GUARANTEE">Loan guarantee (terms only)</option><option value="OFFTAKE_CONTRACT">Public purchase / offtake</option><option value="INFRASTRUCTURE_SUPPORT">Infrastructure support</option><option value="UTILITY_SUPPORT">Utility support</option></select></label>'+
          '<label>Maximum grant amount<input name="maxGovernmentContribution" type="number" min="0" step="any" value="0"></label>'+
          '<label>Government equity (basis points)<input name="governmentEquityBps" type="number" min="0" max="10000" step="1" value="0"></label>'+
          '<label>Government conditions<textarea name="conditions" maxlength="1000" placeholder="Conditions the company must accept"></textarea></label>'+
          '<label>Government reason<textarea name="reason" minlength="12" maxlength="1000" required placeholder="Explain the counter-offer and public-interest conditions"></textarea></label>'+
          '<button type="submit">Send counter-offer to company</button></form>':'';
      return'<article class="pe-proposal" data-pe-decision-card="'+escapeHtml(p.proposalId)+'"><header><strong>'+escapeHtml(p.companyName)+'</strong><span>'+p.status.replace(/_/g,' ')+'</span></header>'+facts+offerSummaryMarkup+
        companyCaseDetails+governmentReviewDetails+
        (p.governmentCounterOffer?'<div class="pe-input-forecast"><strong>Government counter-offer · company response '+escapeHtml(p.governmentCounterOffer.companyResponse||'PENDING')+'</strong><p>'+escapeHtml(p.governmentCounterOffer.reason||'')+'</p><small>Terms: '+escapeHtml(p.governmentCounterOffer.supportType)+' · quantity '+Number(p.governmentCounterOffer.quantity||0)+' · maximum public contribution '+caseAmount(p.governmentCounterOffer.maxGovernmentContribution)+' · '+escapeHtml(p.governmentCounterOffer.settlementStatus||'OFFER ONLY')+'</small></div>':'')+
        '<div class="pe-government-actions"><strong>Government decision · review the company offer, verify the facts, then decide</strong>'+counterOfferForm+capitalReceiptForm+'<div class="pe-actions">'+buttons+'</div></div></article>';
    }).join('')||'<div class="pe-empty">No company expansion proposal has been submitted for this country.</div>';
    var activeCostPolicy=companyOperatingCostPolicy(country),activeCostRates=activeCostPolicy.rates||{};
    function costRateField(key,label,unit){
      var raw=num(activeCostRates[key]),value=raw===null?'':String(raw);
      return '<label>'+label+' ('+unit+')<input name="'+key+'" type="number" min="0" step="any" inputmode="decimal" value="'+escapeHtml(value)+'" placeholder="Not configured"></label>';
    }
    var costPolicyForm='<form class="pe-form" data-pe-cost-policy-form>'+
      '<p class="pe-footnote">Set explicit game-economy rates for this country. Blank rates remain unpriced and block financial close; zero is an explicit zero-cost policy.</p>'+
      '<label>New policy reference<input name="policyId" type="text" maxlength="160" required placeholder="BGD-OPERATING-COST-V2"></label>'+
      '<label>Currency<input name="currency" type="text" maxlength="40" value="'+escapeHtml(activeCostPolicy.currency||'GAME_CURRENCY_UNITS')+'" required></label>'+
      costRateField('electricityPerMWh','Electricity','per MWh')+
      costRateField('waterPerM3','Industrial water','per m³')+
      costRateField('laborPerWorkerDay','Labor','per worker-day')+
      costRateField('maintenancePerFactoryDay','Maintenance','per factory-day')+
      costRateField('overheadPerFactoryDay','Overhead','per factory-day')+
      costRateField('depreciationPerFactoryDay','Depreciation','per factory-day')+
      '<button type="submit">Save country operating cost policy</button></form>';
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
    var invitationRows=dash.governmentInvitations||[];
    var invitationCards=invitationRows.slice().reverse().map(function(row){
      var responses=(row.responses||[]).map(function(response){
        return'<span class="pe-info">'+escapeHtml(response.companyName||response.companyId)+' · '+escapeHtml(response.status)+' · '+escapeHtml(response.proposalId)+'</span>';
      }).join('');
      var close=row.status==='OPEN'?'<button type="button" data-pe-action="close-invitation" data-pe-invitation="'+escapeHtml(row.invitationId)+'">Close invitation</button>':'';
      return'<article class="pe-proposal"><header><strong>'+escapeHtml(row.factoryName)+' · '+Number(row.quantity).toLocaleString('en-US')+' unit(s)</strong><span>'+escapeHtml(row.status)+'</span></header>'+
        '<p>'+escapeHtml(row.governmentRationale)+'</p><small>Government support offer: '+escapeHtml(row.supportOffer&&row.supportOffer.type||'NO_PUBLIC_FINANCING')+
        ' · Maximum contribution '+Number(row.supportOffer&&row.supportOffer.maxGovernmentContribution||0).toLocaleString('en-US')+
        ' · Equity '+Number(row.supportOffer&&row.supportOffer.governmentEquityBps||0)/100+'%</small>'+
        '<div>'+ (responses||'<span class="pe-empty">No company has responded yet.</span>') +'</div><div class="pe-actions">'+close+'</div></article>';
    }).join('')||'<div class="pe-empty">The government has not issued an invitation. Companies can still submit independent proposals.</div>';
    var invitationSection='<section class="pe-proposals"><h4>Optional government tender · a separate invitation to private companies</h4>'+
      '<p class="pe-footnote">Use this only when the state has a documented capacity or funding gap. The government states the public need and any support it can offer. Each company must independently assess the market, choose its own quantity, disclose risks and submit its own investment terms. Publishing a tender does not create a company proposal, spend Treasury money or reserve resources.</p>'+
      '<form class="pe-form" data-pe-invitation-form><label>Factory category<select name="factoryType" required>'+typeOptions+'</select></label>'+
      '<label>Requested quantity<input name="quantity" type="number" min="1" max="'+MAX_PROJECTS_PER_PROPOSAL+'" step="1" value="1" required></label>'+
      '<label>Government support offered<select name="supportType"><option value="NO_PUBLIC_FINANCING">No public financing · company funds it</option><option value="CAPITAL_GRANT">Capital grant</option><option value="GOVERNMENT_EQUITY">Government equity (terms only)</option><option value="LOAN_GUARANTEE">Loan guarantee (terms only)</option><option value="OFFTAKE_CONTRACT">Public purchase / offtake</option><option value="INFRASTRUCTURE_SUPPORT">Infrastructure support</option><option value="UTILITY_SUPPORT">Utility support</option></select></label>'+
      '<label>Maximum government contribution<input name="maxGovernmentContribution" type="number" min="0" step="any" value="0"></label>'+
      '<label>Government equity target (basis points)<input name="governmentEquityBps" type="number" min="0" max="10000" step="1" value="0"></label>'+
      '<label>Invitation validity (turns)<input name="expiresAfterTurns" type="number" min="30" max="900" step="1" value="90"></label>'+
      '<label>Invitation reference<input name="requestId" type="text" maxlength="100" required placeholder="BGD-INDUSTRIAL-TENDER-001"></label>'+
      '<label>Government requirement / public-interest reason<textarea name="governmentRationale" minlength="12" maxlength="1000" required placeholder="Explain the capacity gap, strategic requirement and public conditions."></textarea></label>'+
      '<button type="submit">Publish government invitation</button></form>'+invitationCards+'</section>';
    var markup='<section class="omega-private-lifecycle" data-omega-private-company-lifecycle="v1"><header class="pe-head"><div><small>PRODUCTION LINES / NATIONAL INDUSTRY POLICY</small><h3>Private Company Investment</h3><p>Companies evaluate, offer and submit investments. Government independently reviews, negotiates, permits or rejects them.</p></div><span class="pe-gate">'+(dash.productionEnabled?'PRIVATE PRODUCTION ENABLED':'PRODUCTION GATED BY SAB-34')+'</span></header>'+
      '<div class="pe-overview"><span>Companies <b>5</b></span><span>Proposals <b>'+dash.proposals.length+'</b></span><span>Opening baseline <b>'+(baselineRow&&baselineRow.status==='READY'?baselineRow.totalPrivateFactoryUnits.toLocaleString('en-US'):'Unavailable')+'</b></span><span>Finance <b>'+Object.keys(capitalByCompany).length+' capital accounts</b></span></div>'+
      invitationSection+message+
      '<div class="pe-proposals"><h4>Government decision inbox · proposals submitted by private companies</h4>'+cards+'</div>'+
      '<details class="pe-proposals" data-pe-finance-details '+(financeWasOpen?'open':'')+'><summary><strong>Corporate Finance / Profit / Tax / Cost</strong></summary><p class="pe-footnote">Shared Finance journal + factory-event cost accruals. Financial close is blocked when required operating costs are unpriced. Factory CAPEX remains separate.</p>'+costPolicyForm+'<div data-pe-finance-card-host data-loaded="'+(financeWasOpen?'true':'false')+'">'+(financeWasOpen?companyFinanceCardsMarkup(country,capitalByCompany):'<p class="pe-empty">Open this section to load company financial statements.</p>')+'</div></details>'+
      '<section class="pe-proposals"><h4>Joint ventures / shareholder voting / dividends</h4>'+
      '<form class="pe-form" data-pe-jv-form><label>JV name<input name="name" type="text" maxlength="100" value="Strategic Industrial Joint Venture" required></label>'+
      '<label>Managing company / shareholder A<select name="companyA" required>'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder A equity (%)<input name="shareA" type="number" min="0.01" max="99.99" step="0.01" value="50" required></label>'+
      '<label>Shareholder B<select name="companyB"><option value="">Not participating</option>'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder B equity (%)<input name="shareB" type="number" min="0" max="99.99" step="0.01" value="0"></label>'+
      '<label>Shareholder C<select name="companyC"><option value="">Not participating</option>'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder C equity (%)<input name="shareC" type="number" min="0" max="99.99" step="0.01" value="0"></label>'+
      '<label>Shareholder D<select name="companyD"><option value="">Not participating</option>'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder D equity (%)<input name="shareD" type="number" min="0" max="99.99" step="0.01" value="0"></label>'+
      '<label>Shareholder E<select name="companyE"><option value="">Not participating</option>'+jvCompanyOptions+'</select></label>'+
      '<label>Shareholder E equity (%)<input name="shareE" type="number" min="0" max="99.99" step="0.01" value="0"></label>'+
      '<label>Exact factory IDs (comma separated, optional)<input name="factoryIds" type="text" maxlength="1200"></label>'+
      '<label>Unique charter reference<input name="requestId" type="text" maxlength="100" required></label>'+
      '<button type="submit">Submit JV charter for government approval</button></form>'+jvCards+'</section>'+
      '<details class="pe-proposals" data-pe-market-details '+(marketWasOpen?'open':'')+'><summary><strong>Private market share / concentration</strong></summary><p class="pe-footnote">Lazy-loaded from verified settled sales and separately verified export receipts. Unsold stock and quotes are not market share.</p><div data-pe-market-host data-loaded="false"><p class="pe-empty">Open this section to calculate observed private-sector market positions.</p></div></details>'+
      '<details class="pe-proposals" data-pe-oversight-details '+(oversightWasOpen?'open':'')+'><summary><strong>Company solvency / insolvency / restructuring / closure</strong></summary><div data-pe-oversight-host data-loaded="false"><p class="pe-empty">Open this section to inspect recorded liabilities and government company-resolution actions.</p></div></details>'+
      '<p class="pe-footnote">JV assets retain their canonical owner/operator and state-control fields. Shareholder voting changes only corporate decisions. Dividends require post-tax retained earnings contributed to the JV and an approved weighted vote. The state keeps strategic oversight and permits. Private factory operation remains blocked until SAB-34 proof is verified.</p>'+
      '<p class="pe-footnote">Approval creates no stock reservation or import. Domestic inputs are checked against observed uncommitted inventory; company-funded imports require the existing paid Trade dispatch and confirmed warehouse receipt. Opening allocations are not operating factories. Construction uses the existing industrial project registry and bill of materials. Completed private factories remain production-blocked until the SAB-34 live supply-chain and save/load proof is verified.</p></section>';
    var old=shell.querySelector('[data-omega-private-company-lifecycle]');
    if(old&&old.remove)old.remove();
    shell.insertAdjacentHTML('beforeend',markup);
    bindUi(root);
    // Finance statements scan company cash-flow entries, accrued operating-cost
    // records and the shared Finance ledger. They are not part of the visible
    // proposal queue, so defer that work until the user opens Corporate Finance.
    function attachLazyDetails(detailsSelector,hostSelector,render){
      var details=shell.querySelector(detailsSelector),host=details&&details.querySelector(hostSelector);
      if(!details||!host||typeof details.addEventListener!=='function')return;
      var load=function(){
        if(!details.open||host.getAttribute('data-loaded')==='true')return;
        host.innerHTML=render();
        host.setAttribute('data-loaded','true');
      };
      details.addEventListener('toggle',load);
      if(details.open)load();
    }
    attachLazyDetails('[data-pe-market-details]','[data-pe-market-host]',function(){return privateMarketConcentrationMarkup(country);});
    attachLazyDetails('[data-pe-oversight-details]','[data-pe-oversight-host]',function(){return privateCompanyGovernanceMarkup(country);});
    var financeDetails=shell.querySelector('[data-pe-finance-details]');
    if(financeDetails&&typeof financeDetails.addEventListener==='function'){
      var financeHost=financeDetails.querySelector('[data-pe-finance-card-host]');
      if(financeHost){
        var loadFinanceCards=function(){
          if(!financeDetails.open||financeHost.getAttribute('data-loaded')==='true')return;
          financeHost.innerHTML=companyFinanceCardsMarkup(country,capitalByCompany);
          financeHost.setAttribute('data-loaded','true');
        };
        financeDetails.addEventListener('toggle',loadFinanceCards);
        if(financeDetails.open)loadFinanceCards();
      }
    }
  }
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);});}
  function refresh(root,country){
    // Keep the result message written by the action handler. Clearing it here
    // erased both success and rejection feedback immediately before the panel
    // re-rendered, leaving a submit that was rejected indistinguishable from a
    // submit handler that never ran.
    var api=g.OmegaUIV2Industry,opts=Object.assign({},root.__omegaV2IndustryOptions||{},{countryId:country,tab:'production-lines'});
    if(api&&typeof api.render==='function')api.render(root,opts);
  }
  function shellInput(root,selector){
    try{return root.querySelector(selector);}catch(_){return null;}
  }
  function bindUi(root){
    if(root.__omegaPrivateEnterpriseUiBound||typeof root.addEventListener!=='function')return;
    // Keep an already-open government Production Lines panel in sync when a
    // company agent submits or updates a proposal. The proposal and its market
    // brief are committed before the lifecycle event is emitted; defer one
    // render so multiple related events coalesce into a single UI refresh.
    if(typeof g.addEventListener==='function'){
      g.addEventListener('OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_CHANGED',function(event){
        var detail=event&&event.detail||{},eventType=String(detail.eventType||'').toUpperCase(),
          country=canonicalCountry(detail.countryId||''),
          active=canonicalCountry(root.__omegaV2IndustryCountryId||playerCountry());
        if(!country||country!==active||active!==playerCountry())return;
        if(['COMPANY_MARKET_RESEARCH_REQUEST_SUBMITTED','COMPANY_PROPOSAL_SUBMITTED',
          'AUTONOMOUS_COMPANY_PROPOSAL_SUBMITTED','COMPANY_RESPONDED_TO_GOVERNMENT_INVITATION',
          'COMPANY_PROPOSAL_DECIDED'].indexOf(eventType)<0)return;
        // The mounted private-enterprise panel is authoritative: the tab state can
        // be temporarily absent while the Industry screen restores its route.
        // Refresh only while this panel is actually visible, not on hidden screens.
        if(!root.querySelector('[data-omega-private-company-lifecycle]')||
           root.__omegaPrivateLifecycleRefreshPending)return;
        root.__omegaPrivateLifecycleRefreshPending=true;
        var schedule=typeof g.setTimeout==='function'?g.setTimeout:function(fn){Promise.resolve().then(fn);};
        schedule.call(g,function(){
          root.__omegaPrivateLifecycleRefreshPending=false;
          if(!root.querySelector('[data-omega-private-company-lifecycle]'))return;
          var current=g.OmegaUIV2Industry,options=root.__omegaV2IndustryOptions||{};
          if(current&&typeof current.render==='function')current.render(root,Object.assign({},options,{
            countryId:root.__omegaV2IndustryCountryId||playerCountry(),tab:'production-lines'}));
        },0);
      });
    }
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
      if(form.matches('[data-pe-cost-policy-form]')){
        if(event.preventDefault)event.preventDefault();
        var costData=new FormData(form),rates={};
        OPERATING_COST_RATE_KEYS.forEach(function(key){
          var raw=String(costData.get(key)||'').trim();
          rates[key]=raw===''?null:Number(raw);
        });
        var costPolicyResult=setCompanyOperatingCostPolicy({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),
          policyId:costData.get('policyId'),currency:costData.get('currency'),rates:rates
        });
        root.__omegaPrivateEnterpriseMessage=costPolicyResult.status==='UPDATED'
          ?'Country operating cost policy saved. Unpriced historical costs remain flagged; new matching factory events use this policy.'
          :costPolicyResult.status==='DUPLICATE'?'This operating cost policy is already active.':
          'Operating cost policy blocked: '+String(costPolicyResult.reason||costPolicyResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-insolvency-form]')){
        if(event.preventDefault)event.preventDefault();
        var insolvencyData=new FormData(form),insolvencyResult=openCompanyInsolvencyCase({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),companyId:form.getAttribute('data-pe-company'),
          requestId:insolvencyData.get('requestId'),reason:insolvencyData.get('reason')});
        root.__omegaPrivateEnterpriseMessage=insolvencyResult.status==='OPEN'||insolvencyResult.status==='DUPLICATE'
          ?'Insolvency case recorded: '+insolvencyResult.status+'.'
          :'Insolvency case blocked: '+String(insolvencyResult.reason||insolvencyResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-restructure-form]')){
        if(event.preventDefault)event.preventDefault();
        var restructureData=new FormData(form),restructureResult=proposeCompanyRestructuring({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),companyId:form.getAttribute('data-pe-company'),
          requestId:restructureData.get('requestId'),reason:restructureData.get('reason'),
          actions:[{type:'SUSPEND_FACTORY',factoryId:restructureData.get('factoryId')}]});
        root.__omegaPrivateEnterpriseMessage=restructureResult.status==='PROPOSED'||restructureResult.status==='DUPLICATE'
          ?'Restructuring plan submitted for government approval.'
          :'Restructuring proposal blocked: '+String(restructureResult.reason||restructureResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-closure-form]')){
        if(event.preventDefault)event.preventDefault();
        var closureData=new FormData(form),closureResult=closePrivateCompany({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),companyId:form.getAttribute('data-pe-company'),
          requestId:closureData.get('requestId'),reason:closureData.get('reason')});
        root.__omegaPrivateEnterpriseMessage=closureResult.status==='CLOSED'||closureResult.status==='DUPLICATE'
          ?'Company closure recorded. Factory history and unpaid creditor balances are preserved.'
          :'Company closure blocked: '+String(closureResult.reason||closureResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-jv-form]')){
        if(event.preventDefault)event.preventDefault();
        var jvData=new FormData(form),shareholders=[],shareholderLetters=['A','B','C','D','E'];
        shareholderLetters.forEach(function(letter){
          var companyId=String(jvData.get('company'+letter)||'').trim(),
            shareValue=String(jvData.get('share'+letter)||'').trim();
          if(!companyId&&(!shareValue||Number(shareValue)===0))return;
          shareholders.push({companyId:companyId,shareBps:shareValue?Math.round(Number(shareValue)*100):0});
        });
        var factoryIds=String(jvData.get('factoryIds')||'').split(',').map(function(value){return value.trim();}).filter(Boolean);
        var jvResult=createJointVenture({countryId:root.__omegaV2IndustryCountryId||playerCountry(),
          name:jvData.get('name'),requestId:jvData.get('requestId'),managingCompanyId:jvData.get('companyA'),
          shareholders:shareholders,factoryIds:factoryIds});
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
      if(form.matches('[data-pe-invitation-form]')){
        if(event.preventDefault)event.preventDefault();
        var invitationData=new FormData(form),invitationResult=createGovernmentInvitation({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),factoryType:invitationData.get('factoryType'),
          quantity:invitationData.get('quantity'),supportType:invitationData.get('supportType'),
          maxGovernmentContribution:invitationData.get('maxGovernmentContribution'),
          governmentEquityBps:invitationData.get('governmentEquityBps'),
          expiresAfterTurns:invitationData.get('expiresAfterTurns'),
          requestId:invitationData.get('requestId'),governmentRationale:invitationData.get('governmentRationale')});
        root.__omegaPrivateEnterpriseLastInvitationResult=clone(invitationResult);
        root.__omegaPrivateEnterpriseMessage=invitationResult.status==='OPEN'||invitationResult.status==='DUPLICATE'
          ?'Government invitation published. Companies now decide whether and how to respond.'
          :'Government invitation blocked: '+String(invitationResult.reason||invitationResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      if(form.matches('[data-pe-counter-form]')){
        if(event.preventDefault)event.preventDefault();
        var counterData=new FormData(form),counterResult=decideProposal({
          countryId:root.__omegaV2IndustryCountryId||playerCountry(),
          proposalId:form.getAttribute('data-pe-proposal'),decision:'COUNTER_OFFER',
          counterOffer:{quantity:counterData.get('quantity'),supportType:counterData.get('supportType'),
            maxGovernmentContribution:counterData.get('maxGovernmentContribution'),
            governmentEquityBps:counterData.get('governmentEquityBps'),
            conditions:counterData.get('conditions'),reason:counterData.get('reason')}});
        root.__omegaPrivateEnterpriseMessage=counterResult.status==='NEGOTIATION_PENDING_COMPANY'
          ?'Counter-offer sent. The company must accept or reject the terms before the government can issue a permit.'
          :'Counter-offer blocked: '+String(counterResult.reason||counterResult.status).replace(/_/g,' ').toLowerCase()+'.';
        refresh(root,root.__omegaV2IndustryCountryId||playerCountry());return;
      }
      return;
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
      if(action==='close-invitation'){
        result=closeGovernmentInvitation({countryId:country,invitationId:button.getAttribute('data-pe-invitation')});
      }else if(action==='close-finance'){
        result=closeCompanyFinancialPeriod({countryId:country,companyId:button.getAttribute('data-pe-company')});
      }else if(action==='restructure-approve'||action==='restructure-deny'||action==='restructure-defer'){
        result=decideCompanyRestructuring({countryId:country,companyId:button.getAttribute('data-pe-company'),
          caseId:button.getAttribute('data-pe-case'),
          decision:action==='restructure-approve'?'APPROVE':action==='restructure-deny'?'DENY':'DEFER',
          governmentReason:'Player-government decision recorded in the Production Lines company oversight panel.'});
      }else if(action==='restructure-apply'){
        result=applyCompanyRestructuring({countryId:country,companyId:button.getAttribute('data-pe-company'),
          caseId:button.getAttribute('data-pe-case')});
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
      else if(action==='hold')result=decideProposal({countryId:country,proposalId:proposalId,decision:'HOLD',reason:'Government review placed this proposal on hold.'});
      else if(action==='resume')result=decideProposal({countryId:country,proposalId:proposalId,decision:'RESUME',reason:'Government resumed its review.'});
      else if(action==='defer')result=decideProposal({countryId:country,proposalId:proposalId,decision:'DEFER',reason:'Deferred by player government'});
      else if(action==='deny')result=decideProposal({countryId:country,proposalId:proposalId,decision:'DENY',reason:'Rejected by player government'});
      else if(action==='fund-company'){var p=getProposal(country,proposalId);result=p?fundProposal({countryId:country,proposalId:proposalId,sourceType:'COMPANY_CAPITAL',amount:p.capitalRequired}):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};}
      else if(action==='fund-grant'){var p2=getProposal(country,proposalId);result=p2?fundProposal({countryId:country,proposalId:proposalId,sourceType:'GOVERNMENT_GRANT',amount:p2.capitalRequired}):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};}
      else if(action==='construct')result=startConstruction({countryId:country,proposalId:proposalId});
      else return;
      root.__omegaPrivateEnterpriseMessage=result&&['PROPOSED','ON_HOLD','NEGOTIATION_PENDING_COMPANY','APPROVED_AWAITING_FUNDING','DENIED','DEFERRED','CLOSED','FUNDED','UNDER_CONSTRUCTION','PARTIALLY_UNDER_CONSTRUCTION','COMMISSIONED_PRODUCTION_GATED'].indexOf(result.status)>=0
        ?'Lifecycle updated: '+result.status.replace(/_/g,' ').toLowerCase()+'.'
        :'Action blocked: '+String(result&& (result.reason||result.status)||'UNKNOWN').replace(/_/g,' ').toLowerCase()+'.';
      refresh(root,country);
    });
    root.__omegaPrivateEnterpriseUiBound=true;
  }
  function bindIndustryTabRefresh(root){
    if(!root||root.__omegaPrivateTabRefreshBound||typeof root.addEventListener!=='function')return;
    root.addEventListener('click',function(event){
      var target=event&&event.target,tab=target&&typeof target.closest==='function'
        ?target.closest('[data-omega-v2-industry-tab]'):null;
      if(!tab||(typeof root.contains==='function'&&!root.contains(tab)))return;
      if(tab.getAttribute('data-omega-v2-industry-tab')!=='production-lines')return;
      var scheduler=typeof g.setTimeout==='function'?g.setTimeout:function(fn){Promise.resolve().then(fn);};
      scheduler.call(g,function(){
        if(root.__omegaV2IndustryTab!=='production-lines')return;
        var current=g.OmegaUIV2Industry;
        if(!current||typeof current.render!=='function')return;
        var currentOptions=root.__omegaV2IndustryOptions||{};
        current.render(root,Object.assign({},currentOptions,{
          countryId:root.__omegaV2IndustryCountryId||currentOptions.countryId||playerCountry(),
          tab:'production-lines'
        }));
      },0);
    });
    root.__omegaPrivateTabRefreshBound=true;
  }
  function installIndustryHook(){
    var screen=g.OmegaUIV2Industry;if(!screen||typeof screen.render!=='function'||screen.__privateLifecycleWrapped)return false;
    var original=screen.render;
    var wrapped=function(root,options){
      options=options||{};
      var renderOptions=options;
      var scheduler=options.onScheduleRender;
      // Industry tab controls use the screen module's local scheduleRender()
      // helper, which invokes its private render() function instead of the
      // exported OmegaUIV2Industry.render hook. Wrap that scheduler callback so
      // the private-company panel is refreshed after every deferred tab/action
      // render, not only after the first route mount.
      if(typeof scheduler==='function'&&!options.__omegaPrivateLifecycleScheduleWrapped){
        renderOptions=Object.assign({},options,{__omegaPrivateLifecycleScheduleWrapped:true});
        renderOptions.onScheduleRender=function(callback,label,screenRoot){
          var target=screenRoot||root;
          return scheduler(function(){
            var result=typeof callback==='function'?callback():null;
            if(result&&result.ok&&!(callback&&callback.__omegaPrivateLifecycleHandled)){
              var currentOptions=target&&target.__omegaV2IndustryOptions||renderOptions;
              renderPanel(target,Object.assign({},currentOptions,{
                countryId:target&&target.__omegaV2IndustryCountryId||currentOptions.countryId||playerCountry(),
                tab:target&&target.__omegaV2IndustryTab||currentOptions.tab||'factories'
              }));
            }
            return result;
          },label,screenRoot);
        };
      }
      var result=original(root,renderOptions);
      if(result&&result.ok){
        var activeOptions=root&&root.__omegaV2IndustryOptions||renderOptions;
        if(typeof activeOptions.onScheduleRender!=='function')bindIndustryTabRefresh(root);
        renderPanel(root,renderOptions);
      }
      return result;
    };
    g.OmegaUIV2Industry=Object.freeze(Object.assign({},screen,{render:wrapped,__privateLifecycleWrapped:true}));
    return true;
  }
  if(typeof g.addEventListener==='function'){
    g.addEventListener(NETWORK_EVENT,onFactoryCapacityChanged);
    g.addEventListener('OMEGA_FACTORY_UTILITY_CONSUMED',onPrivateFactoryUtilityConsumed);
    g.addEventListener('OMEGA_RESOURCE_DELIVERY_COMPLETED',onPrivateFactoryFreightDelivered);
    g.addEventListener('OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED',onPrivateFactoryCycleCompleted);
    // UI refresh is event/navigation-driven. Proposal submissions are bounded to one active-country review per 30 committed game turns.
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onCommittedSimulationTurn);
  }
  installIndustryHook();
  var API=Object.freeze({
    VERSION:VERSION,companyIds:COMPANY_IDS.slice(),companyNames:clone(COMPANY_NAMES),
    createProposal:createProposal,adjustProposal:adjustProposal,advanceAutonomousProposalCycle:advanceAutonomousProposalCycle,decideProposal:decideProposal,previewProposal:function(country,id){var p=getProposal(country,id);return p?previewFor(p):{status:'BLOCKED',reason:'PROPOSAL_NOT_FOUND'};},
    fundProposal:fundProposal,startConstruction:startConstruction,authorizeFactoryProjectConstruction:authorizeFactoryProjectConstruction,
    recordCompanyCapitalReceipt:recordCompanyCapitalReceipt,refreshCommissionedProductionGate:refreshCommissionedProductionGate,
    getProposal:getProposal,getCountryDashboard:getCountryDashboard,getCompanyCapitalSummary:getCompanyCapitalSummary,
    getCompanyBusinessCase:function(country,proposalId){var p=getProposal(country,proposalId);return p?clone(p.companyCase||companyBusinessCase(p)):null;},
    getCompanyMarketResearchRequests:function(country,companyId){var r=runtime(country||playerCountry(),false),rows=r&&Array.isArray(r.marketResearchRequests)?r.marketResearchRequests:[],target=id(companyId);return clone(rows.filter(function(row){return !target||id(row.companyId)===target;}));},
    createGovernmentInvitation:createGovernmentInvitation,closeGovernmentInvitation:closeGovernmentInvitation,
    previewCompanyExpansion:previewCompanyExpansion,respondToGovernmentCounterOffer:respondToGovernmentCounterOffer,
    getCompanyFinanceSummary:getCompanyFinanceSummary,closeCompanyFinancialPeriod:closeCompanyFinancialPeriod,
    setCompanyOperatingCostPolicy:setCompanyOperatingCostPolicy,getCompanyOperatingCostPolicy:companyOperatingCostPolicy,
    createJointVenture:createJointVenture,decideJointVenture:decideJointVenture,
    reservePrivateCompanyImport:reservePrivateCompanyImport,cancelPrivateCompanyImport:cancelPrivateCompanyImport,
    completePrivateCompanyImport:completePrivateCompanyImport,
    createJointVentureResolution:createJointVentureResolution,voteJointVentureResolution:voteJointVentureResolution,
    contributeJointVentureRetainedEarnings:contributeJointVentureRetainedEarnings,
    distributeJointVentureDividend:distributeJointVentureDividend,getJointVentureDashboard:getJointVentureDashboard,
    getPrivateMarketConcentration:getPrivateMarketConcentration,evaluateCompanySolvency:evaluateCompanySolvency,
    openCompanyInsolvencyCase:openCompanyInsolvencyCase,proposeCompanyRestructuring:proposeCompanyRestructuring,decideCompanyRestructuring:decideCompanyRestructuring,
    applyCompanyRestructuring:applyCompanyRestructuring,closePrivateCompany:closePrivateCompany,
    diagnostics:diagnostics,productionProofReady:productionProofReady,productionGateReason:productionGateReason,renderIndustryPanel:renderPanel
  });
  g.OmegaPrivateEnterpriseLifecycleV1=API;g.Omega=g.Omega||{};g.Omega.PrivateEnterpriseLifecycleV1=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof globalThis!=='undefined'?globalThis:window);
