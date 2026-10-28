function commissionMineProject(cid,p){
  const rs=resourceState(cid);
  rs.mineAssets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
  let asset=rs.mineAssets.find(x=>String(x?.mineId||x?.id||'')===String(p.mineId||''));
  if(!asset){
    const sameSiteCount=rs.mineAssets.filter(x=>String(x?.siteId||'')===String(p.siteId)&&String(x?.status||'').toUpperCase()==='OPERATIONAL').length;
    asset={mineId:p.mineId,id:p.mineId,siteId:p.siteId,siteName:p.siteName,resourceId:p.resourceId,countryId:cid,ownerCountryId:cid,
      status:'OPERATIONAL',buildProjectId:p.projectId,commissionedTurn:turn(),capacityMultiplier:Math.min(1.60,1+0.12*(sameSiteCount+1)),
      workersRequired:p.workersRequired,workersCommitted:p.workersCommitted,constructionCostUsd:p.costUsd,commissioningLevel:sameSiteCount+1,
      sourceSiteStatus:p.sourceSiteStatus||'UNOBSERVED',siteIdentityAuthority:p.siteIdentityAuthority||'CANONICAL_SITE_REGISTRY',
      authority:'SIMULATED_PLAYER_MINE_ASSET',productionStatus:'READY_FOR_EXTRACTION',lastProductionTurn:null};
    rs.mineAssets.push(asset);rs.mineAssets=rs.mineAssets.slice(-1024);
  }
  rs.mineConstructionLedger=Array.isArray(rs.mineConstructionLedger)?rs.mineConstructionLedger:[];
  const ledger=rs.mineConstructionLedger.find(x=>String(x.projectId||'')===String(p.projectId));
  if(ledger){ledger.status='MINE_COMMISSIONED';ledger.commissionedTurn=turn();ledger.mineId=asset.mineId;}
  emit('OMEGA_RESOURCE_MINE_COMMISSIONED',cid,{projectId:p.projectId,siteId:p.siteId,mineId:asset.mineId,resourceId:p.resourceId,
    siteName:p.siteName,status:asset.status,commissionedTurn:turn(),capacityMultiplier:asset.capacityMultiplier,
    sourceSiteStatus:asset.sourceSiteStatus,authority:'SIMULATED_PLAYER_MINE_ASSET'});
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId:p.siteId,mineId:asset.mineId,capacityMultiplier:asset.capacityMultiplier,
    commissioningLevel:asset.commissioningLevel,status:asset.status});
  return asset;
}

function startFactoryProject(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_INVALID'};
  const n=netState(cid);
  if(input.requestId){const prior=n.projects.find(row=>row.projectType==='FACTORY_CONSTRUCTION'&&String(row.requestId||'')===String(input.requestId));if(prior)return{...clone(prior),idempotent:true};}
  if(input.factoryId){const prior=n.projects.find(row=>row.projectType==='FACTORY_CONSTRUCTION'&&String(row.factoryId||'')===String(input.factoryId)&&['UNDER_CONSTRUCTION','COMPLETED'].includes(String(row.status||'')));if(prior)return{...clone(prior),idempotent:true};}
  const requestedType=normalizeFactoryType(input.factoryType);
  const profiles=cat()?.factoryProfiles||{},profile=requestedType?profiles[requestedType]||null:null;
  const downstream=cat()?.downstreamFactoryRecipes||{};
  const requestedRecipeId=String(input.recipeId||'').trim();
  let selected=requestedRecipeId?downstream[requestedRecipeId]||null:null;
  let rid=tok(input.resourceId);
  if(!selected&&requestedType){
    const candidates=Object.values(downstream).filter(row=>String(row?.factoryType||'').toUpperCase()===requestedType);
    selected=candidates.find(row=>rid&&Object.keys(row?.inputs||{}).some(key=>tok(key)===rid))||
      candidates.find(row=>String(row?.recipeId||'')===String(profile?.defaultRecipeId||''))||candidates[0]||null;
  }
  let rule;
  if(selected){
    if(requestedType&&String(selected.factoryType||'').toUpperCase()!==requestedType)
      return{status:'BLOCKED',reason:'FACTORY_RECIPE_TYPE_MISMATCH',factoryType:requestedType,recipeId:selected.recipeId};
    const recipeInputs=Object.keys(selected.inputs||{}).map(tok);
    if(rid&&!recipeInputs.includes(rid))
      return{status:'BLOCKED',reason:'FACTORY_RECIPE_RESOURCE_MISMATCH',factoryType:selected.factoryType,recipeId:selected.recipeId,resourceId:rid,acceptedInputs:recipeInputs};
    rid=rid||recipeInputs[0]||'';
    rule={...clone(selected),recipeAuthority:selected.recipeAuthority||'SIMULATED_GAMEPLAY_RULE',
      recipeMode:recipeInputs.length>1?'MULTI_INPUT':'SINGLE_INPUT'};
  }else{
    if(!rid)return{status:'BLOCKED',reason:'FACTORY_RESOURCE_REQUIRED'};
    rule=recipeFor(rid,{});
    if(requestedType&&String(rule.factoryType||'').toUpperCase()!==requestedType)
      return{status:'BLOCKED',reason:'FACTORY_TYPE_RESOURCE_MISMATCH',requestedFactoryType:requestedType,expectedFactoryType:rule.factoryType,resourceId:rid};
    if(rule.recipeAuthority==='SIMULATED_GENERIC_FALLBACK'&&!input.allowSimulationFallback)
      return{status:'BLOCKED',reason:'UNVERIFIED_GENERIC_RECIPE_REQUIRES_EXPLICIT_SIMULATION_OPT_IN',resourceId:rid};
  }
  if(!Object.keys(rule.inputs||{}).length||!Object.keys(rule.outputs||{}).length)
    return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  const factoryType=String(rule.factoryType||requestedType||'').trim().toUpperCase();
  const typeProfile=profiles[factoryType]||profile||{};
  const catalogProfile=Object.prototype.hasOwnProperty.call(profiles,factoryType);
  let constructionMaterialQuote=null;
  if(catalogProfile){
    constructionMaterialQuote=factoryConstructionMaterialQuote(cid,typeProfile);
    if(constructionMaterialQuote.status!=='QUOTED')return{...constructionMaterialQuote,status:'BLOCKED',projectType:'FACTORY_CONSTRUCTION'};
  }
  const contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||cat()?.contractorTypes?.DOMESTIC_EPC;
  const profileDays=num(typeProfile.constructionDays),requestedDays=num(input.buildDays),requestedMonths=num(input.buildMonths);
  const projectStartDate=factoryCurrentGameDate();
  const exactMonthTarget=requestedMonths!==null&&requestedMonths>0&&projectStartDate
    ?factoryAddCalendarMonths(projectStartDate,Math.max(1,Math.round(requestedMonths))):null;
  const exactMonthDays=exactMonthTarget?factoryCalendarDaysBetween(projectStartDate,exactMonthTarget):null;
  const baseDays=exactMonthDays!==null&&exactMonthDays>0?exactMonthDays:Math.max(30,requestedDays||profileDays||Number(rule.cycleDays||1)*60+90);
  const constructionBonus=num(cr?.constructionBonus)||0;
  const days=baseDays*(1-constructionBonus);
  const estimatedCompletionDate=exactMonthTarget&&constructionBonus===0?exactMonthTarget:
    (projectStartDate?factoryAddGameDays(projectStartDate,Math.ceil(days-1e-9)):null);
  const configuredCost=num(typeProfile.constructionCost),requestedCost=num(input.cost);
  const configuredCapacity=num(typeProfile.defaultCapacityPerDay),requestedCapacity=num(input.capacityPerDay??input.throughputPerDay);
  const technologyIds=Array.isArray(input.requiredTechnologyIds)?input.requiredTechnologyIds.map(x=>String(x).toUpperCase()):
    (Array.isArray(typeProfile.requiredTechnologyIds)?typeProfile.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[]);
  const project={projectId:'FACTORY:'+cid+':'+factoryType+':'+(rule.recipeId||rid)+':T'+turn()+':'+h32(JSON.stringify(input)),
    projectType:'FACTORY_CONSTRUCTION',countryId:cid,resourceId:rid,factoryType,
    recipeId:rule.recipeId||requestedRecipeId||null,recipeMode:rule.recipeMode|| (Object.keys(rule.inputs||{}).length>1?'MULTI_INPUT':'SINGLE_INPUT'),
    recipeAuthority:rule.recipeAuthority||'INDUSTRIAL_CATALOG_RULE',factoryProfile:clone(typeProfile),
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid),
    cost:Math.max(1,requestedCost||configuredCost||1000),costUnit:typeProfile.unit||'GAME_CURRENCY_UNITS',
    durationDays:Number(days.toFixed(2)),durationMonthsRequested:exactMonthTarget?Math.max(1,Math.round(requestedMonths)):null,
    startDate:projectStartDate,estimatedCompletionDate,estimatedCommissioningDate:estimatedCompletionDate,
    startTurn:turn(),progressDays:0,status:'UNDER_CONSTRUCTION',
    capacityPerDay:Math.max(1,requestedCapacity||configuredCapacity||500),recipe:clone(rule),
    factoryId:String(input.factoryId||('FAC:'+cid+':'+factoryType+':T'+turn()+':P'+n.projects.length+':'+h32(String(turn())+'|'+(rule.recipeId||rid)+'|'+n.projects.length))),
    targetLocationNodeKey:input.locationNodeKey||('INDUSTRIAL_ZONE:'+cid),foreignContract:contractor!=='DOMESTIC_EPC',
    requiredTechnologyIds:technologyIds,technologyPackage:clone(input.technologyPackage||null),
    constructionMaterialsAuthority:constructionMaterialQuote?.authority||'SIMULATED_GENERIC_FACTORY_RECIPE_WITHOUT_CATALOG_BOM',
    constructionMaterialUnit:constructionMaterialQuote?.unit||typeProfile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
    materialsRequired:constructionMaterialQuote?clone(constructionMaterialQuote.materials.map(row=>({resourceId:row.resourceId,quantity:row.required,unit:row.unit}))):[],
    materialAllocations:[],constructionMaterialsStatus:constructionMaterialQuote?'PENDING_CONSUMPTION':'NOT_APPLICABLE',
    employmentProfile:clone(typeProfile.employment||null),requestId:String(input.requestId||''),
    authority:'SIMULATED_FACTORY_CONSTRUCTION_PROJECT',simulationOnly:true};
  if(constructionMaterialQuote){
    const materialAllocations=[];
    for(const material of constructionMaterialQuote.materials)
      materialAllocations.push(...consumeFactoryConstructionMaterial(cid,material.resourceId,material.required,project.projectId,constructionMaterialQuote.unit));
    project.materialAllocations=clone(materialAllocations);project.constructionMaterialsStatus='CONSUMED';project.constructionMaterialsConsumedTurn=turn();
  }
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);
  emit('OMEGA_FACTORY_PROJECT_STARTED',cid,project);return project;
}
function startInfrastructureProject(input={}){
  const cid=canonicalCountry(input.countryId),type=tok(input.infrastructureType||'road'),ir=infraRules()[type];
  if(!cid)return{status:'BLOCKED',reason:'INFRASTRUCTURE_COUNTRY_INVALID'};
  if(!ir)return{status:'BLOCKED',reason:'INFRASTRUCTURE_TYPE_UNDEFINED'};
  const n=netState(cid),requestId=String(input.requestId||'').trim();
  if(requestId){const previous=n.projects.find(row=>row.projectType==='INFRASTRUCTURE'&&String(row.requestId||'')===requestId&&['UNDER_CONSTRUCTION','COMPLETED'].includes(String(row.status||'')));if(previous)return{...clone(previous),idempotent:true};}
  const utilityType=type==='power'||type==='water';
  const distance=utilityType?0:Math.max(0,num(input.distanceKm)||1),contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||{};
  const requestedDays=input.buildDays==null?null:num(input.buildDays);
  const days=Math.max(30,utilityType?Math.max(0,requestedDays||num(ir.buildDays)||180):
    (num(ir.buildDays)||180)*(distance/Math.max(1,num(input.distanceReferenceKm)||10))*(1-(num(cr?.constructionBonus)||0)));
  const requestedCapacity=input.capacityPerDay==null?null:num(input.capacityPerDay);
  const capacityAdd=requestedCapacity===null?num(ir.capacityPerDay):requestedCapacity;
  if(capacityAdd===null||!Number.isFinite(capacityAdd)||capacityAdd<=0)
    return{status:'BLOCKED',reason:'INFRASTRUCTURE_CAPACITY_MUST_BE_POSITIVE',infrastructureType:type,capacityPerDay:input.capacityPerDay};
  const fixed=num(ir.costFixed)||0,perKm=num(ir.costPerKm)||0,requestedCost=input.cost==null?null:num(input.cost);
  const project={projectId:'INFRA:'+cid+':'+type+':T'+turn()+':'+h32(JSON.stringify(input)),requestId:requestId||null,
    projectType:'INFRASTRUCTURE',countryId:cid,infrastructureType:type,distanceKm:distance,capacityAddPerDay:capacityAdd,
    capacityUnit:ir.capacityUnit||'SIMULATION_RESOURCE_UNITS_PER_DAY',
    cost:Math.max(1,requestedCost==null?(perKm*distance+fixed):requestedCost),durationDays:Number(days.toFixed(2)),
    progressDays:0,startTurn:turn(),status:'UNDER_CONSTRUCTION',simulationOnly:true,
    authority:utilityType?'SIMULATED_UTILITY_INFRASTRUCTURE_PROJECT':'SIMULATED_TRANSPORT_INFRASTRUCTURE_PROJECT',
    fromNode:input.fromNode||null,toNode:input.toNode||null,corridorId:input.corridorId||null,
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid)};
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);emit('OMEGA_INFRASTRUCTURE_PROJECT_STARTED',cid,project);return project;
}
function startPadmaCorridorProject(input={}){
  if(canonicalCountry(input.countryId)!=='BGD')return{status:'BLOCKED',reason:'PADMA_CORRIDOR_IS_BGD_SPECIFIC'};
  return startInfrastructureProject({...input,countryId:'BGD',infrastructureType:'bridge',distanceKm:num(input.distanceKm)||6.15,capacityPerDay:num(input.capacityPerDay)||60000,corridorId:'PADMA_EAST_WEST',fromNode:input.fromNode||'PADMA_WEST_GATEWAY',toNode:input.toNode||'PADMA_EAST_GATEWAY',contractorType:input.contractorType||'DOMESTIC_EPC'});
}
function advanceProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),completed=[],technologyCompleted=advanceTechnologyProjects(cid);
  for(const p of n.projects){
    if(p.status!=='UNDER_CONSTRUCTION')continue;
    const step=daysPerTurn()*(p.contractorType==='FOREIGN_EPC'?1.10:1);
    p.progressDays=Math.min(num(p.durationDays)||1,(num(p.progressDays)||0)+step);
    p.progressPct=(p.progressDays/(num(p.durationDays)||1));
    if(p.progressPct<1)continue;
    p.status='COMPLETED';p.completedTurn=turn();p.actualCompletionDate=factoryCurrentGameDate()||p.estimatedCompletionDate;completed.push(clone(p));
    if(p.projectType==='MINE_CONSTRUCTION'){
      const asset=commissionMineProject(cid,p);
      p.mineAssetId=asset.mineId;p.commissionedTurn=turn();p.assetStatus=asset.status;
    }else if(p.projectType==='FACTORY_CONSTRUCTION'){
      const econ=econState(cid);econ.productionAssets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
      const techReady=(p.requiredTechnologyIds||[]).every(t=>resourceState(cid).technologyCapabilities?.some(x=>tok(x?.technologyId).toUpperCase()===tok(t)));
      const assetStatus=techReady?'OPERATIONAL':'TECHNOLOGY_LOCKED';
      const factoryProfile=p.factoryProfile||cat()?.factoryProfiles?.[normalizeFactoryType(p.factoryType)]||{};
      econ.productionAssets.push({id:p.factoryId,countryId:cid,stage:'PROCESSING',factoryType:p.factoryType,
        recipeId:p.recipeId||p.recipe?.recipeId||null,recipeMode:p.recipeMode||p.recipe?.recipeMode||'SINGLE_INPUT',
        recipeAuthority:p.recipeAuthority||p.recipe?.recipeAuthority||'INDUSTRIAL_CATALOG_RULE',
        capacity:inputCapacityFromFactory(p),capacityPerDay:inputCapacityFromFactory(p),locationNodeKey:p.targetLocationNodeKey,status:assetStatus,
        inputCoefficients:p.recipe.inputs,outputProfile:p.recipe.outputs,cycleDays:p.recipe.cycleDays,
        inputInventory:{},inputBatchLots:[],inputUnit:p.recipe?.inputUnit||factoryProfile.inputUnit||null,
        productionHealth:{status:'STOPPED',productivityPct:0,reason:'NO_FACTORY_INPUTS',missingInputs:Object.keys(p.recipe?.inputs||{}),updatedTurn:turn(),authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'},
        outputUnit:p.recipe?.outputUnit||factoryProfile.outputUnit||null,
        requireTrackedInputs:p.recipeMode==='MULTI_INPUT'||factoryProfile.requireTrackedInputs===true,
        workforce:clone(factoryProfile.workforce||{}),employmentProfile:clone(factoryProfile.employment||p.employmentProfile||null),
        utilityRequirements:clone(factoryProfile.utilities||{}),
        requiredInfrastructure:clone(factoryProfile.requiredInfrastructure||[]),companyId:'EPC_FACTORY_OWNER',
        simulationOnly:true,authority:'SIMULATED_FACTORY_ASSET',transportAccess:['road','rail','ship'],commissionedTurn:turn(),
        requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
      emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:p.factoryId,capacity:inputCapacityFromFactory(p),projectId:p.projectId,status:assetStatus});
      if(assetStatus==='TECHNOLOGY_LOCKED')emit('OMEGA_FACTORY_TECHNOLOGY_BLOCKED',cid,{factoryId:p.factoryId,requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
    }else if(p.infrastructureType==='power'||p.infrastructureType==='water'){
      const ts=transportState(cid);ts.infrastructure=ts.infrastructure||{};
      const supply=ts.infrastructure.utilitySupply&&typeof ts.infrastructure.utilitySupply==='object'?ts.infrastructure.utilitySupply:
        (ts.infrastructure.utilitySupply={electricityMWhPerDay:0,waterM3PerDay:0,assets:[],authority:'SIMULATED_COMPLETED_UTILITY_PROJECTS',status:'AVAILABLE',simulationOnly:true});
      if(!Array.isArray(supply.assets))supply.assets=[];
      const amount=Math.max(0,num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='power')supply.electricityMWhPerDay=Number(((num(supply.electricityMWhPerDay)||0)+amount).toFixed(6));
      else supply.waterM3PerDay=Number(((num(supply.waterM3PerDay)||0)+amount).toFixed(6));
      supply.authority='SIMULATED_COMPLETED_UTILITY_PROJECTS';supply.status='AVAILABLE';supply.lastUpdatedTurn=turn();
      supply.assets.push({projectId:p.projectId,infrastructureType:p.infrastructureType,capacityPerDay:amount,capacityUnit:p.capacityUnit,
        completedTurn:turn(),status:'OPERATIONAL',authority:'SIMULATED_INFRASTRUCTURE_PROJECT',simulationOnly:true});
      while(supply.assets.length>512)supply.assets.shift();
      const key=p.infrastructureType==='power'?'powers':'waters';
      ts.infrastructure[key]=ts.infrastructure[key]||{capacityPerDay:0};
      ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+amount;
      ts.infrastructure[key].status='OPERATIONAL';ts.infrastructure[key].capacityUnit=p.capacityUnit;
      emit('OMEGA_INDUSTRIAL_UTILITY_SUPPLY_CHANGED',cid,{projectId:p.projectId,infrastructureType:p.infrastructureType,
        capacityPerDay:amount,capacityUnit:p.capacityUnit,supply:clone(supply),status:'AVAILABLE',simulationOnly:true});
    }else{
      const ts=transportState(cid),ir=infraRules()[p.infrastructureType]||{};ts.infrastructure=ts.infrastructure||{};
      const key=p.infrastructureType+'s';ts.infrastructure[key]=ts.infrastructure[key]||{};ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='bridge'){ts.infrastructure.bridges=ts.infrastructure.bridges||{};ts.infrastructure.bridges.capacityPerDay=(num(ts.infrastructure.bridges.capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);}
      if(p.corridorId)n.infrastructure.corridors[p.corridorId]={status:'OPERATIONAL',fromNode:p.fromNode,toNode:p.toNode,capacityPerDay:p.capacityAddPerDay,infrastructureType:p.infrastructureType};
      emit('OMEGA_TRANSPORT_INFRASTRUCTURE_COMPLETED',cid,p);
    }
    emit('OMEGA_PROJECT_COMPLETED',cid,p);
  }
  const employment=reconcileFactoryEmployment(cid);
  return{status:'ADVANCED',countryId:cid,completed,technologyCompleted,employment};
}
function inputCapacityFromFactory(p){
  return Math.max(1,num(p.capacityPerDay)||num(p.capacity)||1000);
}

function startTechnologyProject(input={}){
  const cid=canonicalCountry(input.countryId),technologyId=tok(input.technologyId).toUpperCase(),spec=techRules()[technologyId];
  if(!spec)return{status:'BLOCKED',reason:'TECHNOLOGY_PROJECT_UNDEFINED'};
  const mode=String(input.mode||'RESEARCH').toUpperCase(),donor=canonicalCountry(input.donorCountryId||input.contractorCountryId),contractor=String(input.contractorType||'DOMESTIC_EPC');
  if(mode==='IMPORT'&&!donor&&contractor!=='SPECIALIST_FOREIGN_TECH_VENDOR')return{status:'BLOCKED',reason:'DONOR_COUNTRY_OR_VENDOR_REQUIRED'};
  const donorCaps=donor?Array.isArray(resourceState(donor).technologyCapabilities)?resourceState(donor).technologyCapabilities:[]:[];
  if(mode==='IMPORT'&&!donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===technologyId)&&contractor!=='SPECIALIST_FOREIGN_TECH_VENDOR')return{status:'BLOCKED',reason:'DONOR_TECHNOLOGY_NOT_AVAILABLE'};
  const donorCapabilityVerified=mode==='IMPORT'&&(contractor==='SPECIALIST_FOREIGN_TECH_VENDOR'||donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===technologyId));
  const contract={projectId:'TECH:'+cid+':'+technologyId+':T'+turn()+':'+h32(JSON.stringify(input)),countryId:cid,technologyId,mode,
    durationTurns:mode==='IMPORT'?spec.importTurns:spec.researchTurns,cost:mode==='IMPORT'?spec.importCost:spec.researchCost,donorCountryId:donor||null,
    contractorType:contractor,status:'IN_PROGRESS',startTurn:turn(),targetSiteId:input.targetSiteId||'*',targetResourceId:tok(input.resourceId||'*'),
    targetSiteType:input.siteType||'*',effects:clone(spec.effects||{}),donorCapabilityVerified};
  netState(cid).technologyContracts.push(contract);emit('OMEGA_RESOURCE_TECHNOLOGY_PROJECT_STARTED',cid,contract);return contract;
}
function refreshTechnologyGatedFactories(c){
  const cid=canonicalCountry(c),caps=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[],
    available=new Set(caps.map(x=>tok(x?.technologyId).toUpperCase()).filter(Boolean));
  for(const asset of factoryAssets(cid)){
    if(String(asset.status).toUpperCase()!=='TECHNOLOGY_LOCKED')continue;
    const req=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds.map(x=>tok(x).toUpperCase()).filter(Boolean):[];
    if(req.length&&req.every(t=>caps.some(row=>tok(row?.technologyId).toUpperCase()===t&&technologyCapabilityAvailable(row)))){
      asset.status='OPERATIONAL';asset.technologyUnlockedTurn=turn();
      emit('OMEGA_FACTORY_TECHNOLOGY_UNLOCKED',cid,{factoryId:asset.id,requiredTechnologyIds:clone(req)});
    }
  }
}
function advanceTechnologyProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),r=resourceState(cid),completed=[];
  r.technologyCapabilities=Array.isArray(r.technologyCapabilities)?r.technologyCapabilities:[];
  for(const p of n.technologyContracts){
    if(String(p.status).toUpperCase()!=='IN_PROGRESS')continue;
    const elapsed=turn()-Number(p.startTurn||turn());
    if(elapsed<Number(p.durationTurns||1))continue;
    if(p.mode==='IMPORT'&&!p.donorCapabilityVerified){p.status='BLOCKED';p.blockReason='DONOR_CAPABILITY_NOT_VERIFIED';continue;}
    const capability={technologyId:p.technologyId,targetSiteId:p.targetSiteId,targetResourceId:p.targetResourceId,targetSiteType:p.targetSiteType,
      sourceType:p.mode==='IMPORT'?'IMPORTED':'RESEARCH',donorCountryId:p.donorCountryId||null,effects:clone(p.effects),status:'COMPLETE',completedTurn:turn()};
    if(!r.technologyCapabilities.some(x=>tok(x?.technologyId).toUpperCase()===tok(p.technologyId)&&String(x?.targetResourceId||'*')===String(p.targetResourceId||'*'))){
      r.technologyCapabilities.push(capability);
    }
    p.status='COMPLETE';p.completedTurn=turn();completed.push(clone(capability));
    refreshTechnologyGatedFactories(cid);
    emit('OMEGA_RESOURCE_TECHNOLOGY_COMPLETED',cid,capability);
  }
  return completed;
}

function currentTurnLedgerBucket(countryId,ledgerName,initialBucket){
  const network=netState(countryId);
  let ledger=network[ledgerName];
  if(!ledger||typeof ledger!=='object'||Array.isArray(ledger))ledger=network[ledgerName]={schemaVersion:VERSION,turns:{}};
  if(!ledger.turns||typeof ledger.turns!=='object'||Array.isArray(ledger.turns))ledger.turns={};
  const currentTurn=Math.max(0,Number(turn())||0),key=String(currentTurn);
  for(const oldKey of Object.keys(ledger.turns)){
    const oldTurn=Number(oldKey);
    if(Number.isFinite(oldTurn)&&oldTurn<currentTurn-30)delete ledger.turns[oldKey];
  }
  let bucket=ledger.turns[key];
  if(!bucket||typeof bucket!=='object'||Array.isArray(bucket)){
    // Avoid object-spread initialization here: the Android 9 WebView path can throw
    // from the transpiled spread helper while the utility ledger is first created.
    const defaults=clone(initialBucket||{});
    bucket=defaults&&typeof defaults==='object'&&!Array.isArray(defaults)?defaults:{};
    bucket.turn=currentTurn;
    ledger.turns[key]=bucket;
  }
  bucket.turn=currentTurn;
  return bucket;
}
function utilityTurnBucket(countryId){
  const bucket=currentTurnLedgerBucket(countryId,'utilityLedger',{used:{electricityMWh:0,waterM3:0},transactions:[]});
  bucket.used=bucket.used&&typeof bucket.used==='object'?bucket.used:{};
  bucket.used.electricityMWh=Math.max(0,num(bucket.used.electricityMWh)||0);
  bucket.used.waterM3=Math.max(0,num(bucket.used.waterM3)||0);
  bucket.transactions=Array.isArray(bucket.transactions)?bucket.transactions:[];
  return bucket;
}
function transportTurnBucket(countryId){
  const bucket=currentTurnLedgerBucket(countryId,'transportCapacityLedger',{usedByMode:{},shipments:[]});
  bucket.usedByMode=bucket.usedByMode&&typeof bucket.usedByMode==='object'?bucket.usedByMode:{};
  bucket.shipments=Array.isArray(bucket.shipments)?bucket.shipments:[];
  return bucket;
}
function technologyCapabilityAvailable(row){
  return ['COMPLETE','COMPLETED','AVAILABLE','UNLOCKED','OPERATIONAL','ACTIVE'].includes(String(row?.status||'').trim().toUpperCase());
}
function utilitySupplyValues(countryId){
  const infra=transportState(countryId).infrastructure||{};
  const supply=infra.utilitySupply&&typeof infra.utilitySupply==='object'?infra.utilitySupply:{};
  const power=supply.electricityMWhPerDay==null?null:num(supply.electricityMWhPerDay);
  const water=supply.waterM3PerDay==null?null:num(supply.waterM3PerDay);
  return{power:power!==null&&power>=0?power:null,water:water!==null&&water>=0?water:null,
    authority:supply.authority||null,status:supply.status||'NOT_RECORDED',assets:Array.isArray(supply.assets)?supply.assets:[]};
}
function previewFactoryUtilityUse(countryId,asset,productionQuantity){
  const cid=canonicalCountry(countryId),factoryId=String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||'');
  const type=normalizeFactoryType(asset?.factoryType||asset?.type||asset?.facilityType||'');
  const profile=(cat()?.factoryProfiles||{})[type]||{};
  const utilities=asset?.utilityRequirements&&typeof asset.utilityRequirements==='object'&&
    (asset.utilityRequirements.electricityMWhPerDay!=null||asset.utilityRequirements.waterM3PerDay!=null)
      ?asset.utilityRequirements:profile.utilities;
  const powerDaily=utilities?.electricityMWhPerDay==null?null:num(utilities.electricityMWhPerDay);
  const waterDaily=utilities?.waterM3PerDay==null?null:num(utilities.waterM3PerDay);
  if(powerDaily===null||waterDaily===null||powerDaily<0||waterDaily<0)
    return{status:'BLOCKED',reason:'FACTORY_UTILITY_PROFILE_NOT_RECORDED',countryId:cid,factoryId, factoryType:type};
  const capacityRaw=asset?.capacityPerDay??asset?.capacity??asset?.productionCapacity??asset?.throughput;
  const capacity=capacityRaw==null?null:num(capacityRaw);
  const quantity=num(productionQuantity);
  if(capacity===null||capacity<=0||quantity===null||quantity<=0)
    return{status:'BLOCKED',reason:'FACTORY_UTILITY_CAPACITY_INVALID',countryId:cid,factoryId,capacity,productionQuantity};
  const fraction=Math.min(1,quantity/capacity);
  const required={electricityMWh:Number((powerDaily*fraction).toFixed(6)),waterM3:Number((waterDaily*fraction).toFixed(6))};
  const supply=utilitySupplyValues(cid),bucket=utilityTurnBucket(cid);
  const used={electricityMWh:bucket.used.electricityMWh,waterM3:bucket.used.waterM3};
  const checks=[
    {key:'electricityMWh',label:'ELECTRICITY',supply:supply.power,unit:'MWh',required:required.electricityMWh,used:used.electricityMWh},
    {key:'waterM3',label:'INDUSTRIAL_WATER',supply:supply.water,unit:'M3',required:required.waterM3,used:used.waterM3}
  ];
  const missing=checks.filter(x=>x.required>1e-9&&x.supply===null);
  if(missing.length)return{status:'BLOCKED',reason:'FACTORY_UTILITY_SUPPLY_NOT_RECORDED',countryId:cid,factoryId,
    missingUtilities:missing.map(x=>x.label),required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water}};
  const shortages=checks.filter(x=>x.required>1e-9&&x.supply!==null&&x.supply-x.used+1e-9<x.required);
  if(shortages.length)return{status:'BLOCKED',reason:'FACTORY_UTILITY_SHORTAGE',countryId:cid,factoryId,
    shortages:shortages.map(x=>({utility:x.label,required:x.required,available:Math.max(0,x.supply-x.used),supply:x.supply,used:x.used,unit:x.unit})),
    required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water}};
  return{status:'READY',countryId:cid,factoryId,factoryType:type,turn:turn(),capacity,productionQuantity,
    utilizationFraction:fraction,required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water},
    supplyAuthority:supply.authority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE'};
}
function commitFactoryUtilityUse(countryId,asset,preview,transactionId){
  const cid=canonicalCountry(countryId),bucket=utilityTurnBucket(cid);
  bucket.used.electricityMWh=Number((bucket.used.electricityMWh+preview.required.electricityMWh).toFixed(6));
  bucket.used.waterM3=Number((bucket.used.waterM3+preview.required.waterM3).toFixed(6));
  const row={transactionId:String(transactionId),factoryId:String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||''),
    countryId:cid,turn:turn(),electricityMWh:preview.required.electricityMWh,waterM3:preview.required.waterM3,
    electricityUnit:'MWh',waterUnit:'M3',authority:'SIMULATED_UTILITY_CONSUMPTION_LEDGER',
    supplyAuthority:preview.supplyAuthority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE'};
  bucket.transactions.push(row);while(bucket.transactions.length>1024)bucket.transactions.shift();
  asset.lastUtilityConsumptionTurn=turn();asset.lastUtilityConsumptionTransactionId=String(transactionId);
  emit('OMEGA_FACTORY_UTILITY_CONSUMED',cid,row);
  return clone(row);
}
function previewTransportCapacity(countryId,route,requestedQuantity){
  const cid=canonicalCountry(countryId),quantity=num(requestedQuantity);
  if(quantity===null||quantity<=0)return{status:'BLOCKED',reason:'TRANSPORT_QUANTITY_INVALID',requestedQuantity};
  const legs=Array.isArray(route?.legs)?route.legs:(Array.isArray(route?.vehiclePlan)?route.vehiclePlan:[]);
  const modes=legs.map(row=>tok(row?.mode||row?.transportMode)).filter(Boolean);
  if(!modes.length)return{status:'BLOCKED',reason:'TRANSPORT_ROUTE_HAS_NO_LEGS',routeId:route?.routeId||null};
  const counts={};for(const mode of modes)counts[mode]=(counts[mode]||0)+1;
  const bucket=transportTurnBucket(cid),constraints=[];
  let allowed=quantity;
  for(const [mode,count] of Object.entries(counts)){
    const infra=infraQuality(cid,mode),capacity=Math.max(0,infra.capacityPerDay*infra.quality);
    const used=Math.max(0,num(bucket.usedByMode[mode])||0),remaining=Math.max(0,capacity-used);
    const modeAllowed=count>0?remaining/count:0;allowed=Math.min(allowed,modeAllowed);
    constraints.push({mode,legs:count,capacityPerTurn:capacity,usedThisTurn:used,availableThisTurn:remaining,
      maximumQuantityForRoute:modeAllowed,unit:'SIMULATION_RESOURCE_UNITS_PER_TURN'});
  }
  allowed=Number(Math.max(0,allowed).toFixed(6));
  if(allowed<=1e-9)return{status:'BLOCKED',reason:'TRANSPORT_CAPACITY_EXHAUSTED',countryId:cid,turn:turn(),
    routeId:route?.routeId||null,requestedQuantity:quantity,allowedQuantity:0,constraints};
  return{status:'READY',countryId:cid,turn:turn(),routeId:route?.routeId||null,requestedQuantity:quantity,
    allowedQuantity:allowed,adjusted:allowed+1e-6<quantity,constraints,
    authority:'SIMULATED_SHARED_TRANSPORT_CAPACITY_LEDGER'};
}
function commitTransportCapacity(countryId,route,quantity,shipmentId){
  const cid=canonicalCountry(countryId),bucket=transportTurnBucket(cid);
  const legs=Array.isArray(route?.legs)?route.legs:(Array.isArray(route?.vehiclePlan)?route.vehiclePlan:[]);
  const counts={};for(const row of legs){const mode=tok(row?.mode||row?.transportMode);if(mode)counts[mode]=(counts[mode]||0)+1;}
  for(const [mode,count] of Object.entries(counts))
    bucket.usedByMode[mode]=Number(((num(bucket.usedByMode[mode])||0)+quantity*count).toFixed(6));
  const row={shipmentId:String(shipmentId),countryId:cid,turn:turn(),quantity,
    useByMode:Object.fromEntries(Object.entries(counts).map(([mode,count])=>[mode,Number((quantity*count).toFixed(6))])),
    authority:'SIMULATED_SHARED_TRANSPORT_CAPACITY_LEDGER'};
  bucket.shipments.push(row);while(bucket.shipments.length>1024)bucket.shipments.shift();
  return clone(row);
}
function factoryUtilityDiagnostics(countryId){
  const cid=canonicalCountry(countryId);if(!cid)return{status:'BLOCKED',reason:'FACTORY_UTILITY_COUNTRY_INVALID'};
  const supply=utilitySupplyValues(cid),bucket=utilityTurnBucket(cid),transport=transportTurnBucket(cid);
  const utility=(value,used,unit)=>({supply:value,usedThisTurn:used,availableThisTurn:value===null?null:Math.max(0,value-used),unit,
    status:value===null?'NOT_RECORDED':(value-used<=1e-9?'DEPLETED_THIS_TURN':'AVAILABLE'),
    authority:supply.authority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE',simulationOnly:true});
  const transportCapacity={};
  for(const mode of ['truck','rail','ship','barge','pipeline']){
    const q=infraQuality(cid,mode),capacity=Math.max(0,q.capacityPerDay*q.quality),used=Math.max(0,num(transport.usedByMode[mode])||0);
    transportCapacity[mode]={capacityPerTurn:capacity,usedThisTurn:used,availableThisTurn:Math.max(0,capacity-used),
      unit:'SIMULATION_RESOURCE_UNITS_PER_TURN',quality:q.quality,authority:'SIMULATED_INFRASTRUCTURE_MODEL'};
  }
  const employment=econState(cid).factoryEmployment||null;
  return{status:supply.power===null||supply.water===null?'DEGRADED':'HEALTHY',countryId:cid,turn:turn(),
    electricityMWhPerDay:supply.power,electricity:utility(supply.power,bucket.used.electricityMWh,'MWh/day'),
    waterM3PerDay:supply.water,water:utility(supply.water,bucket.used.waterM3,'m3/day'),
    utilityAuthority:supply.authority||'NOT_RECORDED',utilityAssets:clone(supply.assets),
    transportCapacity,transportShipmentsThisTurn:transport.shipments.length,
    workforce:employment?{status:employment.status,unemployedCount:employment.unemployedCount,
      jobsSupported:employment.jobsSupported,jobsFilled:employment.jobsFilled,vacancies:employment.vacancies,
      authority:employment.authority||'NOT_RECORDED'}:{status:'NOT_RECORDED',authority:'NOT_RECORDED'},
    simulationOnly:true};
}

function factoryOperationGate(countryId,asset){
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const cid=canonicalCountry(countryId),factoryId=String(asset.id||asset.assetId||asset.factoryId||asset.projectId||'');
  const status=String(asset.status||'OPERATIONAL').toUpperCase();
  if(['CLOSED','DECOMMISSIONED','TECHNOLOGY_LOCKED','BLOCKED','UNDER_CONSTRUCTION','MAINTENANCE'].includes(status))
    return{status:'BLOCKED',reason:'FACTORY_NOT_OPERATIONAL',factoryId,factoryStatus:status};
  const required=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[];
  const capabilities=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[];
  const missing=required.filter(id=>!capabilities.some(row=>String(row?.technologyId||'').trim().toUpperCase()===id&&technologyCapabilityAvailable(row)));
  if(missing.length)return{status:'BLOCKED',reason:'FACTORY_TECHNOLOGY_REQUIREMENT_NOT_MET',factoryId,missingTechnologyIds:missing};
  const employmentSummary=reconcileFactoryEmployment(cid);
  const employmentModel=econState(cid).factoryEmployment||{};
  const employment=employmentModel.factories?.[factoryId]||asset.employment||{};
  if(employmentSummary?.baselineUnemployedCount==null||employmentModel.status==='UNEMPLOYMENT_HEADCOUNT_UNAVAILABLE')
    return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_NOT_RECORDED',factoryId,
      requiredWorkers:num((cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||'')]?.employment?.coreOperatingCrew)||null,
      authority:employmentModel.unemploymentSource||'NOT_RECORDED'};
  const profile=(cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||asset.facilityType||'')]||{};
  const requiredCrew=Math.max(1,num(profile.employment?.coreOperatingCrew)||
    ((num(profile.workforce?.operators)||0)+(num(profile.workforce?.engineers)||0))||
    (num(asset.workforce?.operators)||0)+(num(asset.workforce?.engineers)||0));
  const workersFilled=num(employment.jobsFilled);
  if(workersFilled===null)return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_NOT_RECORDED',factoryId,requiredWorkers:requiredCrew};
  if(workersFilled<requiredCrew)return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_SHORTAGE',factoryId,
    requiredWorkers:requiredCrew,workersAvailable:workersFilled,vacancies:num(employment.vacancies)??Math.max(0,requiredCrew-workersFilled)};
  return{status:'READY',factoryId,factoryStatus:status,requiredWorkers:requiredCrew,workersAvailable:workersFilled,
    workforceAuthority:employment.authority||employmentModel.authority||'SIMULATED_FACTORY_EMPLOYMENT_RECONCILIATION'};
}
function commitFactoryCycleImmediately(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||''),assets=factoryAssets(cid),asset=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const gate=factoryOperationGate(cid,asset);
  if(gate.status!=='READY')return gate;
  const requestedRecipe=recipeFor(input.resourceId||Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId,asset);
  if(asset.recipeMode==='MULTI_INPUT'||requestedRecipe.recipeMode==='MULTI_INPUT'||Object.keys(requestedRecipe.inputs||{}).length>1)
    return commitMultiInputFactoryCycleImmediately(input);
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const rid=tok(input.resourceId),recipe=recipeFor(rid,asset),r=resourceState(cid);r.inventory=r.inventory||{};
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const factoryAvailable=Math.max(0,num(factoryStock[rid])||0),countryAvailable=Math.max(0,num(r.inventory[rid])||0);
  const inputCoefficient=Math.max(1e-9,num(recipe.inputs[rid])||1);
  const cycleCapacity=Math.max(0,num(input.maxCycleQuantity)||num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  const requestedLimit=Math.min(Math.max(0,num(input.quantity)||cycleCapacity),cycleCapacity||Number.MAX_SAFE_INTEGER);
  const availableInputStock=factoryAvailable>1e-9?factoryAvailable:countryAvailable;
  const requested=Math.min(requestedLimit,availableInputStock/inputCoefficient);
  const need=requested*inputCoefficient;
  if(!(requested>1e-9))return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available:availableInputStock,source:factoryAvailable>1e-9?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const fromFactoryInput=factoryAvailable>1e-9&&factoryAvailable+1e-9>=need,available=fromFactoryInput?factoryAvailable:countryAvailable;
  if(available+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available,source:fromFactoryInput?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const inputLots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const trackedForResource=inputLots.filter(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&Math.max(0,num(x?.remainingQuantity!=null?x.remainingQuantity:x?.quantity)||0)>1e-9&&(!input.factoryCycleId||String(x?.cycleReservationId||'')===String(input.factoryCycleId)));
  const trackedQuantity=trackedForResource.reduce((sum,x)=>sum+Math.max(0,num(x.remainingQuantity!=null?x.remainingQuantity:x.quantity)||0),0);
  if(fromFactoryInput&&trackedForResource.length&&trackedQuantity+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,trackedInputQuantity:trackedQuantity,factoryInputInventory:factoryAvailable};
  const carbonPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const carbonUnit=trackedForResource.find(x=>x?.unit)?.unit||
    (Array.isArray(r.batches)?r.batches.find(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&x?.unit)?.unit:null)||
    (Array.isArray(g.ResourceMinistryEngine?.resourceTypes)?g.ResourceMinistryEngine.resourceTypes.find(x=>tok(x?.id||x?.resourceId)===rid)?.unit:null);
  const utilityPreview=input.prepaidUtilityConsumption?{status:'READY',required:{electricityMWh:0,waterM3:0},prepaid:true}:previewFactoryUtilityUse(cid,asset,requested);
  if(utilityPreview.status!=='READY')return utilityPreview;
  const carbonGate=carbonPolicy?.previewCarbonActivity?.(cid,rid,need,carbonUnit,'RESOURCE_PROCESSING',null,{
    activityId:'FACTORYRUN:'+cid+':'+fid+':T'+turn(),factoryId:fid,
    siteId:trackedForResource.find(x=>x?.siteId)?.siteId||null,
    sourceId:trackedForResource.find(x=>x?.batchId)?.batchId||fid
  });
  if(carbonGate&&carbonGate.allowed===false)return{status:'BLOCKED',reason:carbonGate.reason||'CARBON_QUOTA_POLICY_BLOCKED_PROCESSING',carbonGate};
  const output={};for(const k of Object.keys(recipe.outputs))output[k]=requested*(num(recipe.outputs[k])||0);
  const sourceBatchIds=[],consumedInputs=[];let inputTrackingStatus='UNTRACKED_LEGACY_INPUT';
  if(fromFactoryInput){
    factoryStock[rid]=Math.max(0,factoryAvailable-need);
    if(trackedForResource.length){
      let remaining=need;inputTrackingStatus='TRACKED_FACTORY_INPUT_LOTS';
      for(const lot of trackedForResource){
        if(remaining<=1e-9)break;
        const prior=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0),take=Math.min(prior,remaining);
        if(take<=0)continue;
        lot.remainingQuantity=Math.max(0,prior-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';
        lot.lastMovementType='PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();
        const roots=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:(String(lot?.authority||lot?.provenance?.authority||'').includes('UNOBSERVED')||String(lot?.batchId||'').startsWith('CYCLE-LEGACY:')?[]:[lot.batchId]);
        roots.filter(Boolean).forEach(x=>sourceBatchIds.push(String(x)));
        consumedInputs.push({batchId:lot.batchId,quantity:take,sourceBatchIds:roots.filter(Boolean),stage:'FACTORY_INPUT'});remaining-=take;
      }
      if(remaining>1e-9)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,unallocated:remaining};
    }
  }else{
    let remaining=need,rawDebit=0,processedDebit=0;const batches=Array.isArray(r.batches)?r.batches:[],lots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{};
    for(const batch of batches){
      if(remaining<=1e-9)break;
      if(tok(batch?.resourceId||batch?.materialIdentity)!==rid)continue;
      const stage=String(batch?.stage||'RAW').toUpperCase();
      if(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY'].includes(stage))continue;
      const prior=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);if(prior<=0)continue;
      const take=Math.min(prior,remaining);batch.remainingQuantity=Math.max(0,prior-take);
      batch.status=batch.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';batch.lastMovementType='PROCESSING_CONSUMPTION';batch.lastMovementTurn=turn();
      if(['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage))processedDebit+=take;else rawDebit+=take;
      const lot=lots[batch.batchId];if(lot){lot.remainingQuantity=batch.remainingQuantity;lot.status=batch.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';lot.lastMovementType='PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();}
      if(batch.batchId)sourceBatchIds.push(String(batch.batchId));consumedInputs.push({batchId:batch.batchId,quantity:take,sourceBatchIds:[batch.batchId].filter(Boolean),stage:stage});remaining-=take;
    }
    if(remaining>1e-9){
      inputTrackingStatus='PARTIAL_TRACKING_WITH_LEGACY_BALANCE';
      const rawAvailable=Math.max(0,num(r.warehouse?.availableByResource?.[rid])||0),rawTake=Math.min(rawAvailable,remaining);rawDebit+=rawTake;remaining-=rawTake;
      const processedAvailable=Math.max(0,num(r.processedWarehouse?.availableByResource?.[rid])||0),processedTake=Math.min(processedAvailable,remaining);processedDebit+=processedTake;remaining-=processedTake;
      if(remaining>1e-9)consumedInputs.push({batchId:null,quantity:remaining,stage:'LEGACY_UNALLOCATED',sourceBatchIds:[]});
    }
    const rawWarehouse=r.warehouse||{};if(rawWarehouse.availableByResource)rawWarehouse.availableByResource[rid]=Math.max(0,(num(rawWarehouse.availableByResource[rid])||0)-rawDebit);
    if(r.processedWarehouse?.availableByResource)r.processedWarehouse.availableByResource[rid]=Math.max(0,(num(r.processedWarehouse.availableByResource[rid])||0)-processedDebit);
    r.warehouse=rawWarehouse;r.batches=batches;r.inventoryLots=lots;r.inventory[rid]=Math.max(0,countryAvailable-need);
  }
  asset.inputInventory=factoryStock;
  const sequence=Math.max(0,Number(n.factoryRunSequence)||0)+1;n.factoryRunSequence=sequence;
  const transactionId='FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+sequence;
  const finishedWarehouse=r.processedWarehouse||(r.processedWarehouse={warehouseId:'WH-'+cid+'-PROCESSED',countryId:cid,type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]});
  finishedWarehouse.availableByResource=finishedWarehouse.availableByResource||{};finishedWarehouse.storedBatchIds=Array.isArray(finishedWarehouse.storedBatchIds)?finishedWarehouse.storedBatchIds:[];
  finishedWarehouse.receipts=Array.isArray(finishedWarehouse.receipts)?finishedWarehouse.receipts:[];
  const batches=Array.isArray(r.batches)?r.batches:[],inventoryLots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{},created=[];
  for(const outputId of Object.keys(output)){
    const outQty=output[outputId];if(!(outQty>0))continue;
    r.inventory[outputId]=(num(r.inventory[outputId])||0)+outQty;
    const batchId='OUTPUT:'+transactionId+':'+outputId,roots=[...new Set(sourceBatchIds.filter(Boolean))],unit=input.unit||inputLots.find(x=>tok(x.resourceId)===rid)?.unit||'TONNES';
    const row={batchId,resourceId:outputId,materialIdentity:outputId,quantity:outQty,remainingQuantity:outQty,unit,stage:'FINISHED',countryId:cid,
      sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),
      sourceBatchIds:roots,sourceFactoryId:fid,warehouseId:'WH-'+cid+'-PROCESSED',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',processId:transactionId,
      provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_PROCESSING_YIELD',processingAuthority:'SIMULATED',status:'FINISHED_GOODS_CREATED',transactionId,sourceBatchIds:roots,simulationTurn:turn()}};
    batches.push(row);created.push(row);
    inventoryLots[batchId]={batchId,resourceId:outputId,quantity:outQty,remainingQuantity:outQty,unit,stage:'FINISHED',countryId:cid,warehouseId:row.warehouseId,
      locationNodeKey:row.locationNodeKey,ownerCompanyId:row.ownerCompanyId,sourceBatchIds:roots,status:'AVAILABLE',provenance:clone(row.provenance),createdTurn:turn()};
    finishedWarehouse.availableByResource[outputId]=(num(finishedWarehouse.availableByResource[outputId])||0)+outQty;
    if(!finishedWarehouse.storedBatchIds.includes(batchId))finishedWarehouse.storedBatchIds.push(batchId);
    finishedWarehouse.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:row.warehouseId,countryId:cid,batchId,resourceId:outputId,quantity:outQty,unit,simulationTurn:turn(),status:'RECEIVED'});
  }
  while(finishedWarehouse.receipts.length>2048)finishedWarehouse.receipts.shift();while(batches.length>8192)batches.shift();
  const record={transactionId,countryId:cid,factoryId:fid,companyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),resourceId:rid,
    inputQuantity:need,inputQuantities:{[rid]:need},requestedProduction:requested,outputs:output,outputQuantities:clone(output),recipe:clone(recipe),
    cycleDays:recipe.cycleDays,turn:turn(),authority:'INDUSTRIAL_NETWORK_SIMULATION',status:'COMPLETED',inputSource:fromFactoryInput?'DELIVERED_SHIPMENT':'CENTRAL_INVENTORY',
    inputTrackingStatus,consumedInputs:clone(consumedInputs),sourceBatchIds:[...new Set(sourceBatchIds.filter(Boolean))],createdBatchIds:created.map(x=>x.batchId)};
  record.utilityConsumption=input.prepaidUtilityConsumption?clone(input.prepaidUtilityConsumption):commitFactoryUtilityUse(cid,asset,utilityPreview,transactionId);
  asset.lastProductionTurn=turn();asset.lastProductionTransactionId=transactionId;
  r.batches=batches;r.inventoryLots=inventoryLots;r.processedWarehouse=finishedWarehouse;
  processedTurns[fid]=turn();n.factoryProcessingTurns=processedTurns;
  r.finishedGoodsLedger=Array.isArray(r.finishedGoodsLedger)?r.finishedGoodsLedger:[];
  r.finishedGoodsLedger.push({transactionId,countryId:cid,factoryId:fid,companyId:record.companyId,sourceBatchIds:record.sourceBatchIds,outputQuantities:clone(output),
    createdBatchIds:record.createdBatchIds,turn:turn(),authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE_TO_ECONOMY'});
  while(r.finishedGoodsLedger.length>2048)r.finishedGoodsLedger.shift();
  const inventoryLedger=Array.isArray(r.inventoryLedger)?r.inventoryLedger:[];
  inventoryLedger.push({type:'FACTORY_PROCESSING_COMMITTED',transactionId,factoryId:fid,resourceId:rid,inputQuantity:need,outputs:clone(output),sourceBatchIds:record.sourceBatchIds,createdBatchIds:record.createdBatchIds,turn:turn()});
  while(inventoryLedger.length>2048)inventoryLedger.shift();r.inventoryLedger=inventoryLedger;
  n.factoryRuntime[fid]=record;n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);
  emit('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',cid,{transactionId,countryId:cid,factoryId:fid,companyId:record.companyId,outputs:clone(output),
    outputQuantities:clone(output),sourceBatchIds:record.sourceBatchIds,createdBatchIds:record.createdBatchIds,turn:turn(),
    authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE'});
  return record;
}
function commitMultiInputFactoryCycleImmediately(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const asset=factoryAssets(cid).find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const fallbackResource=Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'';
  const requestedResource=tok(input.resourceId||fallbackResource);
  const recipe=recipeFor(requestedResource,asset),entries=Object.entries(recipe.inputs||{}).map(([id,coefficient])=>[tok(id),num(coefficient)]);
  if(entries.length<2)return{status:'BLOCKED',reason:'MULTI_INPUT_RECIPE_REQUIRED',factoryId:fid,recipeId:recipe.recipeId||null};
  if(!entries.some(([id])=>id===requestedResource))return{status:'BLOCKED',reason:'FACTORY_INPUT_NOT_IN_RECIPE',resourceId:requestedResource,recipeId:recipe.recipeId||null};
  if(entries.some(([id,coefficient])=>!id||coefficient===null||coefficient<=0))
    return{status:'BLOCKED',reason:'FACTORY_RECIPE_COEFFICIENT_INVALID',recipeId:recipe.recipeId||null};
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const capacity=Math.max(0,num(input.maxCycleQuantity)||num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  if(!(capacity>1e-9))return{status:'BLOCKED',reason:'PRODUCTION_CAPACITY_UNAVAILABLE',factoryId:fid,capacity};
  const inputLimit=Math.max(0,num(input.quantity)||capacity),limit=Math.min(capacity,inputLimit);
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const inactiveLotStatuses=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  const activeSourceLots=lots.filter(l=>{
    const status=String(l?.status||'').toUpperCase();
    return Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0)>1e-9&&!inactiveLotStatuses.has(status);
  });
  const globalBatchIds=activeSourceLots.map(l=>String(l?.batchId||'').trim()).filter(Boolean);
  if(new Set(globalBatchIds).size!==globalBatchIds.length)
    return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_ID',factoryId:fid,recipeId:recipe.recipeId||null};
  const availability=[];
  const seenRecipeInputs=new Set();
  for(const [resourceId,coefficient] of entries){
    if(seenRecipeInputs.has(resourceId))
      return{status:'BLOCKED',reason:'FACTORY_DUPLICATE_NORMALIZED_INPUT',factoryId:fid,resourceId,recipeId:recipe.recipeId||null};
    seenRecipeInputs.add(resourceId);
    const matchingStockKeys=Object.keys(factoryStock).filter(key=>tok(key)===resourceId);
    if(matchingStockKeys.length>1)
      return{status:'BLOCKED',reason:'DUPLICATE_NORMALIZED_FACTORY_STOCK_KEYS',factoryId:fid,resourceId,keys:matchingStockKeys};
    const stockKey=matchingStockKeys[0]||resourceId;
    const quantity=Math.max(0,num(factoryStock[stockKey])||0);
    const eligibleLots=lots.filter(l=>{
      const status=String(l?.status||'').toUpperCase();
      const remaining=Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0);
      return tok(l?.resourceId||l?.materialIdentity)===resourceId&&String(l?.batchId||'').trim()!==''&&
        remaining>1e-9&&!inactiveLotStatuses.has(status)&&(!input.factoryCycleId||String(l?.cycleReservationId||'')===String(input.factoryCycleId));
    });
    const batchIds=eligibleLots.map(l=>String(l?.batchId||'').trim()).filter(Boolean);
    if(new Set(batchIds).size!==batchIds.length)
      return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_ID',factoryId:fid,resourceId};
    const lotQuantity=eligibleLots.reduce((sum,l)=>sum+Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0),0);
    availability.push({resourceId,coefficient,stockKey,eligibleLots,available:quantity,tracked:lotQuantity,possibleProduction:quantity/coefficient});
  }
  const productionQuantity=Math.min(limit,...availability.map(x=>x.possibleProduction));
  if(!(productionQuantity>1e-9)){
    const missing=availability.filter(x=>x.available+1e-9<x.coefficient*Math.min(limit,1));
    return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:fid,recipeId:recipe.recipeId||null,
      requiredForOneUnit:availability.map(x=>({resourceId:x.resourceId,required:x.coefficient,available:x.available})),missingInputs:missing.map(x=>x.resourceId)};
  }
  const needs=availability.map(x=>({...x,required:productionQuantity*x.coefficient}));
  const mismatches=needs.filter(x=>x.tracked+1e-6<x.required);
  if(mismatches.length)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',factoryId:fid,recipeId:recipe.recipeId||null,
    mismatches:mismatches.map(x=>({resourceId:x.resourceId,required:x.required,tracked:x.tracked,available:x.available}))};
  for(const need of needs){
    let remaining=need.required;
    need.lotAllocations=[];
    const ordered=need.eligibleLots.slice().sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    for(const lot of ordered){
      if(remaining<=1e-9)break;
      const prior=Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0);
      const take=Math.min(prior,remaining);
      if(take>1e-9){need.lotAllocations.push({lot,quantity:take});remaining-=take;}
    }
    if(remaining>1e-6)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',factoryId:fid,resourceId:need.resourceId,
      required:need.required,tracked:need.tracked,unallocated:remaining};
  }
  const outputEntries=Object.entries(recipe.outputs||{}).map(([outputId,ratio])=>({outputId,token:tok(outputId),ratio:num(ratio)}));
  if(!outputEntries.length||outputEntries.some(x=>!x.token||x.ratio===null||x.ratio<=0)||
    new Set(outputEntries.map(x=>x.token)).size!==outputEntries.length)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_PROFILE_INVALID',factoryId:fid,recipeId:recipe.recipeId||null};
  const outputTotal=outputEntries.reduce((sum,row)=>sum+row.ratio,0);
  if(!Number.isFinite(outputTotal)||Math.abs(outputTotal-1)>1e-6)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_BALANCE_INVALID',factoryId:fid,recipeId:recipe.recipeId||null,outputCoefficientTotal:outputTotal};
  const output={};
  for(const row of outputEntries){
    const quantity=Number((productionQuantity*row.ratio).toFixed(6));
    if(quantity>1e-9)output[row.outputId]=quantity;
  }
  if(!Object.keys(output).length)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_ROUNDED_TO_ZERO',factoryId:fid,recipeId:recipe.recipeId||null};
  const utilityPreview=input.prepaidUtilityConsumption?{status:'READY',required:{electricityMWh:0,waterM3:0},prepaid:true}:previewFactoryUtilityUse(cid,asset,productionQuantity);
  if(utilityPreview.status!=='READY')return utilityPreview;
  const r=resourceState(cid);
  r.inventory=r.inventory&&typeof r.inventory==='object'?r.inventory:{};
  const finishedMap=r.processedWarehouse?.availableByResource||{};
  const outputInventoryKeys={},outputWarehouseKeys={};
  for(const row of outputEntries){
    const invKeys=Object.keys(r.inventory).filter(key=>tok(key)===row.token);
    const warehouseKeys=Object.keys(finishedMap).filter(key=>tok(key)===row.token);
    if(invKeys.length>1||warehouseKeys.length>1)
      return{status:'BLOCKED',reason:'DUPLICATE_NORMALIZED_OUTPUT_LEDGER_KEYS',factoryId:fid,resourceId:row.outputId,
        inventoryKeys:invKeys,warehouseKeys};
    outputInventoryKeys[row.outputId]=invKeys[0]||row.outputId;
    outputWarehouseKeys[row.outputId]=warehouseKeys[0]||row.outputId;
  }
  const policy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  for(const need of needs){
    const first=lots.find(l=>tok(l?.resourceId||l?.materialIdentity)===need.resourceId&&Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0)>1e-9);
    const unit=first?.unit||recipe.inputUnit||asset.inputUnit||'SIMULATION_TONNE_EQUIVALENT';
    const gate=policy?.previewCarbonActivity?.(cid,need.resourceId,need.required,unit,'RESOURCE_PROCESSING',null,{
      activityId:'FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+need.resourceId,factoryId:fid,
      siteId:first?.siteId||null,sourceId:first?.batchId||fid
    });
    if(gate&&gate.allowed===false)return{status:'BLOCKED',reason:gate.reason||'CARBON_QUOTA_POLICY_BLOCKED_PROCESSING',resourceId:need.resourceId,carbonGate:gate};
  }
  const sourceBatchIds=[],sourceSiteIds=[],consumedInputs=[];
  for(const need of needs){
    factoryStock[need.stockKey]=Math.max(0,need.available-need.required);
    for(const allocation of need.lotAllocations){
      const lot=allocation.lot,take=allocation.quantity;
      const prior=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      lot.remainingQuantity=Math.max(0,prior-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';
      lot.lastMovementType='MULTI_INPUT_PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();
      const lineage=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId].filter(Boolean);
      if(lot.batchId&&!String(lot?.authority||lot?.provenance?.authority||'').includes('UNOBSERVED')&&!String(lot.batchId).startsWith('CYCLE-LEGACY:'))sourceBatchIds.push(String(lot.batchId));
      lineage.filter(Boolean).forEach(x=>sourceBatchIds.push(String(x)));
      (Array.isArray(lot.sourceSiteIds)?lot.sourceSiteIds:[]).filter(Boolean).forEach(x=>sourceSiteIds.push(String(x)));
      consumedInputs.push({batchId:lot.batchId||null,resourceId:need.resourceId,quantity:take,
        sourceBatchIds:lineage.filter(Boolean).map(String),stage:'FACTORY_INPUT'});
    }
  }
  const sequence=Math.max(0,Number(n.factoryRunSequence)||0)+1;n.factoryRunSequence=sequence;
  const transactionId='FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+sequence;
  const finished=r.processedWarehouse||(r.processedWarehouse={warehouseId:'WH-'+cid+'-PROCESSED',countryId:cid,
    type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',status:'OPERATIONAL',
    availableByResource:{},storedBatchIds:[],receipts:[]});
  finished.availableByResource=finished.availableByResource||{};
  finished.storedBatchIds=Array.isArray(finished.storedBatchIds)?finished.storedBatchIds:[];
  finished.receipts=Array.isArray(finished.receipts)?finished.receipts:[];
  const batches=Array.isArray(r.batches)?r.batches:(r.batches=[]);
  const inventoryLots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:(r.inventoryLots={});
  const roots=[...new Set(sourceBatchIds.filter(Boolean))],sites=[...new Set(sourceSiteIds.filter(Boolean))],created=[];
  const companyId=String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid));
  const outputUnit=recipe.outputUnit||asset.outputUnit||'SIMULATION_TONNE_EQUIVALENT';
  for(const [outputId,outQty] of Object.entries(output)){
    if(!(outQty>1e-9))continue;
    const inventoryKey=outputInventoryKeys[outputId]||outputId;
    r.inventory[inventoryKey]=(num(r.inventory[inventoryKey])||0)+outQty;
    const batchId='OUTPUT:'+transactionId+':'+outputId;
    const row={batchId,resourceId:outputId,materialIdentity:outputId,quantity:outQty,remainingQuantity:outQty,unit:outputUnit,
      stage:'FINISHED',countryId:cid,sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,
      ownerCompanyId:companyId,sourceBatchIds:roots,sourceSiteIds:sites,sourceFactoryId:fid,warehouseId:'WH-'+cid+'-PROCESSED',
      locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',processId:transactionId,
      provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_DOWNSTREAM_RECIPE',status:'FINISHED_GOODS_CREATED',
        transactionId,recipeId:recipe.recipeId||null,factoryType:asset.factoryType,sourceBatchIds:roots,sourceSiteIds:sites,simulationTurn:turn()}};
    batches.push(row);created.push(row);
    inventoryLots[batchId]={batchId,resourceId:outputId,quantity:outQty,remainingQuantity:outQty,unit:outputUnit,stage:'FINISHED',
      countryId:cid,warehouseId:row.warehouseId,locationNodeKey:row.locationNodeKey,ownerCompanyId:companyId,
      sourceBatchIds:roots,sourceSiteIds:sites,status:'AVAILABLE',provenance:clone(row.provenance),createdTurn:turn()};
    const warehouseKey=outputWarehouseKeys[outputId]||outputId;
    finished.availableByResource[warehouseKey]=(num(finished.availableByResource[warehouseKey])||0)+outQty;
    if(!finished.storedBatchIds.includes(batchId))finished.storedBatchIds.push(batchId);
    finished.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:row.warehouseId,countryId:cid,batchId,resourceId:outputId,
      quantity:outQty,unit:outputUnit,simulationTurn:turn(),status:'RECEIVED'});
  }
  while(finished.receipts.length>2048)finished.receipts.shift();
  while(batches.length>8192)batches.shift();
  const inputQuantities=Object.fromEntries(needs.map(x=>[x.resourceId,x.required]));
  const totalInput=needs.reduce((sum,x)=>sum+x.required,0);
  const record={transactionId,countryId:cid,factoryId:fid,factoryType:asset.factoryType||recipe.factoryType||null,
    recipeId:recipe.recipeId||asset.recipeId||null,recipeMode:'MULTI_INPUT',companyId,resourceId:requestedResource,
    inputQuantity:totalInput,inputQuantities,requestedProduction:productionQuantity,outputs:clone(output),outputQuantities:clone(output),
    recipe:clone(recipe),cycleDays:recipe.cycleDays,turn:turn(),authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'COMPLETED',
    inputSource:'TRACKED_FACTORY_INPUT',inputTrackingStatus:'TRACKED_FACTORY_INPUT_LOTS',
    consumedInputs:clone(consumedInputs),sourceBatchIds:roots,sourceSiteIds:sites,createdBatchIds:created.map(x=>x.batchId)};
  record.utilityConsumption=input.prepaidUtilityConsumption?clone(input.prepaidUtilityConsumption):commitFactoryUtilityUse(cid,asset,utilityPreview,transactionId);
  asset.inputInventory=factoryStock;asset.lastProductionTurn=turn();asset.lastProductionTransactionId=transactionId;
  r.batches=batches;r.inventoryLots=inventoryLots;r.processedWarehouse=finished;
  processedTurns[fid]=turn();n.factoryProcessingTurns=processedTurns;
  r.finishedGoodsLedger=Array.isArray(r.finishedGoodsLedger)?r.finishedGoodsLedger:[];
  r.finishedGoodsLedger.push({transactionId,countryId:cid,factoryId:fid,companyId,sourceBatchIds:roots,sourceSiteIds:sites,
    outputQuantities:clone(output),createdBatchIds:record.createdBatchIds,turn:turn(),authority:'SIMULATED_DOWNSTREAM_PRODUCTION',
    recipeId:record.recipeId,status:'AVAILABLE_TO_ECONOMY'});
  while(r.finishedGoodsLedger.length>2048)r.finishedGoodsLedger.shift();
  r.inventoryLedger=Array.isArray(r.inventoryLedger)?r.inventoryLedger:[];
  r.inventoryLedger.push({type:'FACTORY_MULTI_INPUT_PROCESSING_COMMITTED',transactionId,factoryId:fid,recipeId:record.recipeId,
    inputQuantities:clone(inputQuantities),outputs:clone(output),sourceBatchIds:roots,createdBatchIds:record.createdBatchIds,turn:turn()});
  while(r.inventoryLedger.length>2048)r.inventoryLedger.shift();
  n.factoryRuntime=n.factoryRuntime||{};n.factoryRuntime[fid]=record;
  n.events=Array.isArray(n.events)?n.events:[];n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);
  emit('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',cid,{transactionId,countryId:cid,factoryId:fid,companyId,outputs:clone(output),
    outputQuantities:clone(output),sourceBatchIds:roots,sourceSiteIds:sites,createdBatchIds:record.createdBatchIds,turn:turn(),
    authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'AVAILABLE'});
  return record;
}


/**
 * Stable public entry point for delivery completion and per-turn production.
 * Keep external callers independent of the internal immediate-commit method name.
 */
function executeFactoryCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const active=factoryCycleStore(cid).factoryProductionCycles[fid];
  if(factoryCycleActive(active)&&String(input.factoryCycleId||'')!==String(active.cycleId))
    return{status:'BLOCKED',reason:'FACTORY_CYCLE_ALREADY_RUNNING',factoryId:fid,activeCycleId:active.cycleId,
      finishDate:active.finishDate};
  return commitFactoryCycleImmediately(input);
}

function factoryCycleStore(countryId){
  const n=netState(countryId);
  if(!n.factoryProductionCycles||typeof n.factoryProductionCycles!=='object'||Array.isArray(n.factoryProductionCycles))
    n.factoryProductionCycles={};
  if(!Array.isArray(n.factoryProductionCycleHistory))n.factoryProductionCycleHistory=[];
  return n;
}
function factoryCycleActive(cycle){
  return !!cycle&&['IN_PROGRESS','PAUSED'].includes(String(cycle.status||'').toUpperCase());
}
function factorySetProductionHealth(asset,status,quantity,capacity,detail={}){
  const cap=Math.max(0,num(capacity)||0),q=Math.max(0,num(quantity)||0);
  const pct=cap>0?Math.max(0,Math.min(100,Number((q/cap*100).toFixed(2)))):0;
  asset.productionHealth={status,productivityPct:pct,productionUnitsPerCycle:q,capacityPerDay:cap,
    missingInputs:Array.isArray(detail.missingInputs)?detail.missingInputs:[],
    reason:detail.reason||null,detail:clone(detail),updatedTurn:turn(),
    cycleId:detail.cycleId||null,authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'};
  asset.productionStatus=status;
  return asset.productionHealth;
}
function factoryProductionMetrics(asset,recipe,factoryCycleId=null){
  const cap=Math.max(0,num(asset?.capacityPerDay??asset?.capacity??asset?.productionCapacity??asset?.throughput)||0);
  const stock=asset?.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const lots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  const inactive=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  const inputs=[],missing=[];
  let possible=cap;
  for(const [rawId,rawCoefficient] of Object.entries(recipe?.inputs||{})){
    const rid=tok(rawId),coefficient=num(rawCoefficient),stockKey=quantityObjectKey(stock,rid);
    const quantity=stockKey===null?0:Math.max(0,num(stock[stockKey])||0);
    const eligible=lots.filter(lot=>tok(lot?.resourceId||lot?.materialIdentity)===rid&&
      !inactive.has(String(lot?.status||'').toUpperCase())&&
      (!lot?.cycleReservationId||String(lot.cycleReservationId)===String(factoryCycleId||''))&&
      Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0)>1e-9);
    const tracked=eligible.reduce((sum,lot)=>sum+Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0),0);
    const ids=eligible.map(lot=>String(lot.batchId||'').trim()).filter(Boolean);
    const duplicateBatchIds=new Set(ids).size!==ids.length;
    const requiredPerUnit=coefficient!==null&&coefficient>0?coefficient:null;
    if(!rid||requiredPerUnit===null||duplicateBatchIds){
      missing.push({resourceId:rid||rawId,reason:duplicateBatchIds?'DUPLICATE_FACTORY_INPUT_BATCH_ID':'INVALID_RECIPE_COEFFICIENT'});
      inputs.push({resourceId:rid,coefficient,available:quantity,tracked,possibleProduction:0,eligibleLots:eligible});
      possible=0;continue;
    }
    const byStock=quantity/requiredPerUnit,byTrace=tracked/requiredPerUnit;
    possible=Math.min(possible,byStock,byTrace);
    if(quantity<=1e-9)missing.push({resourceId:rid,requiredPerProductionUnit:requiredPerUnit,available:0,reason:'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY'});
    else if(tracked<=1e-9)missing.push({resourceId:rid,requiredTrackedQuantity:quantity,tracked,reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'});
    inputs.push({resourceId:rid,coefficient:requiredPerUnit,stockKey,available:quantity,tracked,possibleProduction:Math.min(byStock,byTrace),eligibleLots:eligible});
  }
  return{capacity:cap,possibleProduction:Math.max(0,Math.min(cap,possible)),inputs,missingInputs:missing,
    recipeInputCount:Object.keys(recipe?.inputs||{}).length};
}
function reserveFactoryCycleInputs(asset,metrics,inputQuantities,cycleId){
  const lots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  const reservations=[];
  for(const row of metrics.inputs||[]){
    let remaining=Math.max(0,num(inputQuantities[row.resourceId])||0);
    const candidates=(row.eligibleLots||[]).slice().sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    for(const lot of candidates){
      if(remaining<=1e-9)break;
      const existing=String(lot?.cycleReservationId||'');
      if(existing&&existing!==String(cycleId))continue;
      const available=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      const take=Math.min(available,remaining);
      if(take>1e-9){
        reservations.push({resourceId:row.resourceId,batchId:String(lot.batchId||''),quantity:Number(take.toFixed(6)),
          sourceBatchIds:(Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId]).filter(Boolean).map(String),lot});
        remaining=Number(Math.max(0,remaining-take).toFixed(6));
      }
    }
    if(remaining>1e-6)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_RESERVATION_FAILED',
      resourceId:row.resourceId,required:inputQuantities[row.resourceId],unreserved:remaining};
  }
  const seen=new Set();
  for(const reservation of reservations){
    if(!reservation.batchId||seen.has(reservation.batchId))
      return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_RESERVATION',batchId:reservation.batchId||null};
    seen.add(reservation.batchId);
  }
  for(const reservation of reservations){
    reservation.lot.cycleReservationId=String(cycleId);
    reservation.lot.cycleReservedQuantity=reservation.quantity;
    reservation.lot.cycleReservedResourceId=reservation.resourceId;
    reservation.lot.cycleReservedTurn=turn();
    delete reservation.lot;
  }
  return{status:'RESERVED',reservations};
}
function releaseFactoryCycleReservations(asset,cycleId){
  const wanted=String(cycleId||'');
  if(!wanted)return 0;
  let released=0;
  for(const lot of Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[]){
    if(String(lot?.cycleReservationId||'')!==wanted)continue;
    delete lot.cycleReservationId;
    delete lot.cycleReservedQuantity;
    delete lot.cycleReservedResourceId;
    delete lot.cycleReservedTurn;
    released++;
  }
  return released;
}
function factorySourceWarehouse(rs,batch){
  const declared=String(batch?.warehouseId||'').toUpperCase();
  const stage=String(batch?.stage||'RAW').toUpperCase();
  if(declared.includes('PROCESSED')||declared.includes('FINISHED')||
     ['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage))
    return{kind:'PROCESSED',warehouse:rs.processedWarehouse||(rs.processedWarehouse={warehouseId:'WH-'+canonicalCountry(batch?.countryId||'' )+'-PROCESSED',availableByResource:{},reservedByResource:{}})};
  return{kind:'RAW',warehouse:rs.warehouse||(rs.warehouse={warehouseId:'WH-'+canonicalCountry(batch?.countryId||'')+'-RAW',availableByResource:{},reservedByResource:{}})};
}
function batchBelongsToBoundFactorySite(rs,batch,sourceSiteId,flowSiteByBatchId){
  const wanted=String(sourceSiteId||'').trim();
  if(!wanted)return true;
  const batchId=String(batch?.batchId||'').trim();
  const flowSite=flowSiteByBatchId.get(batchId);
  // A recorded site-flow entry is the strongest source identity for extracted batches.
  if(flowSite)return flowSite===wanted;
  const directIds=[batch?.siteReferenceKey,batch?.siteId,batch?.sourceSiteId,batch?.originSiteId,
    batch?.provenance?.siteId,batch?.provenance?.sourceSiteId]
    .map(value=>String(value||'').trim()).filter(Boolean);
  if(directIds.includes(wanted))return true;
  const occurrence=String(batch?.occurrenceKey||batch?.sourceOccurrenceKey||batch?.provenance?.occurrenceKey||'').trim();
  if(occurrence===wanted||occurrence.includes(':'+wanted+':'))return true;
  return false;
}
function transferFactoryInputsFromWarehouse(countryId,asset,recipe){
  const cid=canonicalCountry(countryId),rs=resourceState(cid),n=netState(cid);
  const stock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:(asset.inputInventory={});
  const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:(asset.inputBatchLots=[]);
  const capacity=Math.max(0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  const transfers=[],blocked=[];
  if(!(capacity>1e-9))return{status:'BLOCKED',reason:'PRODUCTION_CAPACITY_UNAVAILABLE',transfers,blocked};
  const batches=Array.isArray(rs.batches)?rs.batches:[];
  const nonTransferable=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  // Mine-bound simulation factories must not silently consume a different mine's
  // same-resource stock just because it is older in the national warehouse FIFO.
  // Generic factories without a source-site binding retain normal pooled-warehouse behavior.
  const boundSourceSiteId=String(asset?.sourceSiteId||asset?.siteId||'').trim();
  const siteFlowRows=Array.isArray(rs.industrialNetwork?.siteFlowLedger)?rs.industrialNetwork.siteFlowLedger:[];
  const flowSiteByBatchId=new Map(siteFlowRows.filter(row=>row?.batchId&&row?.siteId)
    .map(row=>[String(row.batchId),String(row.siteId)]));
  for(const [rawId,rawCoefficient] of Object.entries(recipe?.inputs||{})){
    const rid=tok(rawId),coefficient=num(rawCoefficient);
    if(!rid||coefficient===null||coefficient<=0){blocked.push({resourceId:rid||rawId,reason:'FACTORY_RECIPE_COEFFICIENT_INVALID'});continue;}
    const currentKey=quantityObjectKey(stock,rid),current=currentKey===null?0:Math.max(0,num(stock[currentKey])||0);
    const target=Math.max(0,capacity*coefficient-current);
    if(target<=1e-9)continue;
    const inTransit=n.shipments.filter(row=>String(row?.shipmentType||'')==='FACTORY_INPUT'&&
      String(row?.factoryId||'')===String(asset.id||asset.assetId||asset.projectId)&&tok(row?.resourceId)===rid&&
      ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||'')))
      .reduce((sum,row)=>sum+Math.max(0,num(row?.targetQuantity)||0),0);
    let remaining=Math.max(0,target-inTransit);
    if(remaining<=1e-9)continue;
    const candidates=batches.filter(batch=>tok(batch?.resourceId||batch?.materialIdentity)===rid&&
      !nonTransferable.has(String(batch?.status||'').toUpperCase())&&
      Math.max(0,num(batch?.remainingQuantity!=null?batch.remainingQuantity:batch?.quantity)||0)>1e-9&&
      batchBelongsToBoundFactorySite(rs,batch,boundSourceSiteId,flowSiteByBatchId))
      .sort((a,b)=>(num(a?.createdTurn)||0)-(num(b?.createdTurn)||0));
    for(const batch of candidates){
      if(remaining<=1e-9)break;
      const batchId=String(batch?.batchId||'').trim();if(!batchId)continue;
      const source=factorySourceWarehouse(rs,batch),wh=source.warehouse;
      wh.availableByResource=wh.availableByResource||{};wh.reservedByResource=wh.reservedByResource||{};
      const availableKey=quantityObjectKey(wh.availableByResource,rid),reservedKey=quantityObjectKey(wh.reservedByResource,rid);
      if(availableKey===null)continue;
      const warehouseAvailable=Math.max(0,num(wh.availableByResource[availableKey])||0);
      const reserved=reservedKey===null?0:Math.max(0,num(wh.reservedByResource[reservedKey])||0);
      const sourceRemaining=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
      const sourceLot=rs.inventoryLots&&rs.inventoryLots[batchId]||null;
      const lotRemaining=sourceLot?Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0):sourceRemaining;
      const invKey=quantityObjectKey(rs.inventory||{},rid),countryAvailable=invKey===null?0:Math.max(0,num(rs.inventory[invKey])||0);
      const sourceUnit=String(batch.unit||sourceLot?.unit||'').trim();
      const targetUnit=recipe.inputUnit||asset.inputUnit||cat()?.factoryCatalogPolicy?.unitNormalization?.targetUnit||'';
      const bridge=factoryUnitBridge(sourceUnit,targetUnit);
      if(!bridge){blocked.push({batchId,resourceId:rid,reason:'FACTORY_INPUT_UNIT_BRIDGE_NOT_DECLARED',sourceUnit:sourceUnit||'NOT_RECORDED',targetUnit:targetUnit||'NOT_RECORDED'});continue;}
      const amount=Math.min(remaining/bridge.factor,Math.max(0,warehouseAvailable-reserved),sourceRemaining,lotRemaining,countryAvailable);
      if(amount<=1e-9)continue;
      const targetAmount=Number((amount*bridge.factor).toFixed(6));
      if(!(targetAmount>1e-9))continue;
      const transferSequence=(Number(n.factoryInputTransferSequence)||0)+1;n.factoryInputTransferSequence=transferSequence;
      const transferId='FACTORY-WH-TRANSFER:'+cid+':'+String(asset.id||asset.assetId||asset.projectId)+':T'+turn()+':'+transferSequence;
      const rootIds=[batchId,...(Array.isArray(batch.sourceBatchIds)?batch.sourceBatchIds:[])].filter(Boolean).map(String);
      wh.availableByResource[availableKey]=Number(Math.max(0,warehouseAvailable-amount).toFixed(6));
      batch.remainingQuantity=Number(Math.max(0,sourceRemaining-amount).toFixed(6));
      batch.status=batch.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
      batch.lastMovementType='WAREHOUSE_TO_FACTORY_INPUT_TRANSFER';batch.lastMovementTurn=turn();
      if(sourceLot){
        sourceLot.remainingQuantity=Number(Math.max(0,lotRemaining-amount).toFixed(6));
        sourceLot.status=sourceLot.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
        sourceLot.lastMovementType='WAREHOUSE_TO_FACTORY_INPUT_TRANSFER';sourceLot.lastMovementTurn=turn();
      }
      if(batch.remainingQuantity<=1e-9&&Array.isArray(wh.storedBatchIds))wh.storedBatchIds=wh.storedBatchIds.filter(id=>String(id)!==batchId);
      if(invKey!==null)rs.inventory[invKey]=Number(Math.max(0,countryAvailable-amount).toFixed(6));
      const destKey=quantityObjectKey(stock,rid)||rid;
      stock[destKey]=Number(((num(stock[destKey])||0)+targetAmount).toFixed(6));
      const inputBatchId='INPUT:'+transferId;
      const inputLot={batchId:inputBatchId,resourceId:rid,materialIdentity:rid,quantity:targetAmount,remainingQuantity:targetAmount,
        unit:bridge.targetUnit,stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,
        ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),
        sourceBatchIds:rootIds,sourceSiteIds:[...(Array.isArray(batch.sourceSiteIds)?batch.sourceSiteIds:[])],
        sourceFactoryId:batch.sourceFactoryId||null,sourceWarehouseId:wh.warehouseId||('WH-'+cid+'-'+source.kind),
        factoryId:String(asset.id||asset.assetId||asset.projectId),locationNodeKey:'FACTORY:'+cid+':'+String(asset.id||asset.assetId||asset.projectId),
        createdTurn:turn(),status:'AVAILABLE_TO_FACTORY',lastMovementType:'WAREHOUSE_TO_FACTORY_INPUT_TRANSFER',lastMovementTurn:turn(),
        provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:bridge.authority,unitBridge:bridge,
          sourceBatchId:batchId,sourceBatchIds:rootIds,transferId,simulationOnly:true,simulationTurn:turn()}};
      lots.push(inputLot);
      if(!rs.inventoryLots||typeof rs.inventoryLots!=='object')rs.inventoryLots={};
      rs.inventoryLots[inputBatchId]={...clone(inputLot),createdTurn:turn()};
      const row={transferId,countryId:cid,factoryId:String(asset.id||asset.assetId||asset.projectId),resourceId:rid,
        quantity:amount,targetQuantity:targetAmount,sourceUnit,targetUnit:bridge.targetUnit,sourceBatchId:batchId,
        inputBatchId,sourceWarehouseId:wh.warehouseId||('WH-'+cid+'-'+source.kind),destinationNode:'FACTORY:'+cid+':'+String(asset.id||asset.assetId||asset.projectId),
        routeType:'INTERNAL_WAREHOUSE_TO_FACTORY',status:'DELIVERED',turn:turn(),sourceBatchIds:rootIds,
        authority:'SIMULATED_WAREHOUSE_TO_FACTORY_TRANSFER',simulationOnly:true};
      n.factoryInputTransfers=Array.isArray(n.factoryInputTransfers)?n.factoryInputTransfers:[];
      n.factoryInputTransfers.push(row);n.factoryInputTransfers=n.factoryInputTransfers.slice(-MAX_EVENTS);
      const inventoryLedger=Array.isArray(rs.inventoryLedger)?rs.inventoryLedger:[];
      inventoryLedger.push({type:'FACTORY_WAREHOUSE_INPUT_TRANSFER',...clone(row)});
      rs.inventoryLedger=inventoryLedger.slice(-2048);
      emit('OMEGA_FACTORY_WAREHOUSE_INPUT_TRANSFERRED',cid,row);
      transfers.push(row);remaining=Math.max(0,remaining-targetAmount);
    }
    if(remaining>1e-6)blocked.push({resourceId:rid,reason:'INSUFFICIENT_TRACKED_WAREHOUSE_STOCK',required:remaining+Math.max(0,target-remaining),transferred:target-remaining,remaining});
  }
  asset.inputInventory=stock;asset.inputBatchLots=lots;
  return{status:blocked.length?'DEGRADED':'TRANSFERRED',countryId:cid,factoryId:String(asset.id||asset.assetId||asset.projectId),turn:turn(),transferCount:transfers.length,transfers,blocked};
}
function factoryCycleDue(cycle){
  const now=factoryCurrentGameDate();
  if(cycle?.finishDate&&now)return factoryDateReached(now,cycle.finishDate);
  return turn()>=Math.max(0,num(cycle?.finishTurn)||Number.MAX_SAFE_INTEGER);
}
function startFactoryProductionCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const asset=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND',factoryId:fid};
  const n=factoryCycleStore(cid),existing=n.factoryProductionCycles[fid];
  if(factoryCycleActive(existing))return{status:existing.status==='PAUSED'?'PAUSED':'IN_PROGRESS',cycleId:existing.cycleId,
    factoryId:fid,finishDate:existing.finishDate,productionQuantity:existing.productionQuantity,productivityPct:existing.productivityPct,idempotent:true};
  const gate=factoryOperationGate(cid,asset);
  if(gate.status!=='READY'){
    factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity),{reason:gate.reason,gate});
    return gate;
  }
  const first=tok(input.resourceId||Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'');
  const recipe=recipeFor(first,asset),metrics=factoryProductionMetrics(asset,recipe);
  const requested=Math.max(0,num(input.quantity)||metrics.capacity);
  let quantity=Math.min(metrics.capacity,requested,metrics.possibleProduction);
  if(metrics.missingInputs.length){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_OR_BATCH_SHORTAGE',missingInputs:metrics.missingInputs});
    return{status:'BLOCKED',reason:'FACTORY_INPUT_OR_BATCH_SHORTAGE',factoryId:fid,missingInputs:clone(metrics.missingInputs),capacity:metrics.capacity};
  }
  if(!(quantity>1e-9)){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',missingInputs:metrics.inputs.filter(row=>row.available<=1e-9).map(row=>({resourceId:row.resourceId,reason:'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY'}))});
    return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:fid};
  }
  const utilityProfile=(cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||'')]?.utilities||asset.utilityRequirements||{};
  let utilityPreview=previewFactoryUtilityUse(cid,asset,quantity);
  if(utilityPreview.status==='BLOCKED'&&utilityPreview.reason==='FACTORY_UTILITY_SHORTAGE'){
    for(const shortage of utilityPreview.shortages||[]){
      const daily=shortage.utility==='ELECTRICITY'?num(utilityProfile.electricityMWhPerDay):num(utilityProfile.waterM3PerDay);
      const rate=daily!==null&&metrics.capacity>0?daily/metrics.capacity:0;
      if(rate>1e-9)quantity=Math.min(quantity,Math.max(0,num(shortage.available)||0)/rate);
    }
    if(quantity>1e-9)utilityPreview=previewFactoryUtilityUse(cid,asset,quantity);
  }
  if(utilityPreview.status!=='READY'||!(quantity>1e-9)){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:utilityPreview.reason||'FACTORY_UTILITY_SHORTAGE',utility:utilityPreview});
    return{status:'BLOCKED',reason:utilityPreview.reason||'FACTORY_UTILITY_SHORTAGE',factoryId:fid,utility:utilityPreview};
  }
  // Recheck batch attribution for the final utility-constrained quantity before scheduling.
  const inputQuantities={};
  for(const row of metrics.inputs){
    const need=Number((row.coefficient*quantity).toFixed(6));
    inputQuantities[row.resourceId]=need;
    if(row.available+1e-6<need||row.tracked+1e-6<need){
      const detail={resourceId:row.resourceId,required:need,available:row.available,tracked:row.tracked,reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'};
      factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:detail.reason,missingInputs:[detail]});
      return{status:'BLOCKED',reason:detail.reason,factoryId:fid,missingInputs:[detail]};
    }
  }
  const startDate=factoryCurrentGameDate(),cycleDays=Math.max(1,num(recipe.cycleDays)||1),durationDays=Math.max(1,Math.ceil(cycleDays-1e-9));
  const finishDate=startDate?factoryAddGameDays(startDate,durationDays):null;
  const finishTurn=turn()+Math.max(1,Math.ceil(durationDays/Math.max(daysPerTurn(),1/86400000)));
  const cycleSequence=(Number(n.factoryProductionCycleSequence)||0)+1;n.factoryProductionCycleSequence=cycleSequence;
  const cycle={cycleId:'FACTORYCYCLE:'+cid+':'+fid+':T'+turn()+':'+cycleSequence,countryId:cid,factoryId:fid,
    factoryType:String(asset.factoryType||asset.type||'').toUpperCase(),recipeId:recipe.recipeId||asset.recipeId||null,
    recipeMode:recipe.recipeMode||'SINGLE_INPUT',primaryInputResourceId:first,productionQuantity:Number(quantity.toFixed(6)),
    capacityPerDay:metrics.capacity,productivityPct:Number((quantity/metrics.capacity*100).toFixed(2)),
    inputQuantities,expectedOutputs:Object.fromEntries(Object.entries(recipe.outputs||{}).map(([id,value])=>[id,Number((quantity*(num(value)||0)).toFixed(6))])),
    sourceBatchIds:[],
    inputBatchReservations:[],
    startDate,finishDate,cycleDays:durationDays,startTurn:turn(),finishTurn,status:'IN_PROGRESS',
    authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1',simulationOnly:true};
  const reserved=reserveFactoryCycleInputs(asset,metrics,inputQuantities,cycle.cycleId);
  if(reserved.status!=='RESERVED'){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:reserved.reason,detail:reserved});
    return{status:'BLOCKED',reason:reserved.reason,factoryId:fid,detail:reserved};
  }
  cycle.inputBatchReservations=reserved.reservations;
  cycle.sourceBatchIds=[...new Set(reserved.reservations.map(row=>String(row.batchId||'')).filter(Boolean))];
  n.factoryProductionCycles[fid]=cycle;
  n.factoryProductionCycleHistory.push(clone(cycle));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
  factorySetProductionHealth(asset,quantity+1e-6<metrics.capacity?'REDUCED':'RUNNING',quantity,metrics.capacity,{cycleId:cycle.cycleId});
  asset.activeProductionCycleId=cycle.cycleId;
  emit('OMEGA_FACTORY_PRODUCTION_CYCLE_STARTED',cid,cycle);
  return{status:'IN_PROGRESS',...clone(cycle)};
}
function completeFactoryProductionCycle(countryId,asset,cycle,result){
  const cid=canonicalCountry(countryId),n=netState(cid);
  if(result?.status!=='COMPLETED'){
    cycle.status='PAUSED';cycle.lastBlockedReason=result?.reason||'FACTORY_PRODUCTION_COMPLETION_BLOCKED';
    cycle.lastBlockedDetail=clone(result);cycle.pausedTurn=turn();
    factorySetProductionHealth(asset,'STOPPED',0,cycle.capacityPerDay,{reason:cycle.lastBlockedReason,cycleId:cycle.cycleId,detail:result});
    emit('OMEGA_FACTORY_PRODUCTION_CYCLE_PAUSED',cid,{cycleId:cycle.cycleId,factoryId:cycle.factoryId,
      reason:cycle.lastBlockedReason,detail:result,turn:turn()});
    return{status:'PAUSED',cycleId:cycle.cycleId,reason:cycle.lastBlockedReason,detail:result};
  }
  cycle.status='COMPLETED';cycle.completedTurn=turn();cycle.actualCompletionDate=factoryCurrentGameDate()||cycle.finishDate;
  const actualProduction=Math.max(0,num(result.requestedProduction)||cycle.productionQuantity);
  cycle.actualProductionQuantity=Number(actualProduction.toFixed(6));
  cycle.productivityPct=cycle.capacityPerDay>0?Number((actualProduction/cycle.capacityPerDay*100).toFixed(2)):0;
  cycle.transactionId=result.transactionId;cycle.outputQuantities=clone(result.outputQuantities||result.outputs||{});
  cycle.createdBatchIds=clone(result.createdBatchIds||[]);cycle.lastBlockedReason=null;
  releaseFactoryCycleReservations(asset,cycle.cycleId);
  asset.activeProductionCycleId=null;asset.lastProductionCycleId=cycle.cycleId;asset.lastProductionCycleCompletedDate=cycle.actualCompletionDate;
  factorySetProductionHealth(asset,cycle.productivityPct<99.999?'REDUCED':'READY',actualProduction,cycle.capacityPerDay,{cycleId:cycle.cycleId});
  n.factoryProductionCycleHistory.push(clone(cycle));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
  // Batch lineage from the committed transaction is the only source of truth for
  // which sites and shipments were consumed by this cycle. Input-lot IDs (for example,
  // INPUT:SHIP:...) are not site-flow batch IDs, so reconcile each consumed input lot's
  // recorded upstream lineage before updating mine/site flow records.
  // Never infer completion from factory/cycle identity alone.
  const rootsSet=new Set((result.sourceBatchIds||[]).map(String).filter(Boolean));
  const consumedInputIds=new Set((result.consumedInputs||[]).map(row=>String(row?.batchId||'')).filter(Boolean));
  const inputLots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  for(const lot of inputLots){
    const inputBatchId=String(lot?.batchId||'').trim();
    if(!inputBatchId)continue;
    if(consumedInputIds.has(inputBatchId)||rootsSet.has(inputBatchId)){
      rootsSet.add(inputBatchId);
      for(const sourceId of Array.isArray(lot?.sourceBatchIds)?lot.sourceBatchIds:[]){
        const id=String(sourceId||'').trim();
        if(id)rootsSet.add(id);
      }
    }
  }
  const roots=[...rootsSet];
  for(const sourceBatchId of roots){
    updateSiteFlow(cid,sourceBatchId,row=>{
      row.processingTransactionIds=[...new Set([...(row.processingTransactionIds||[]),String(result.transactionId)])];
      row.processingTransactionId=String(result.transactionId);
      row.createdBatchIds=[...new Set([...(row.createdBatchIds||[]),...(result.createdBatchIds||[])])];
      row.outputQuantities=row.outputQuantities||{};
      for(const [outputId,amount] of Object.entries(result.outputQuantities||{}))
        row.outputQuantities[outputId]=(num(row.outputQuantities[outputId])||0)+(num(amount)||0);
      row.lastProcessingTurn=turn();row.status='PROCESSED';
      addFlowStage(row,'PROCESSING','COMPLETED',{transactionId:result.transactionId,inputQuantity:result.inputQuantity,productionCycleId:cycle.cycleId});
      addFlowStage(row,'FINISHED_GOODS','AVAILABLE',{transactionId:result.transactionId,createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},productionCycleId:cycle.cycleId});
    });
    for(const shipment of n.shipments.filter(row=>String(row.batchId||'')===sourceBatchId)){
      shipment.processingStatus='PROCESSED';shipment.processingTransactionId=result.transactionId;
      shipment.processing=clone(result);shipment.processedTurn=turn();
      shipment.createdBatchIds=[...new Set([...(shipment.createdBatchIds||[]),...(result.createdBatchIds||[])])];
    }
    for(const delivery of n.deliveries.filter(row=>String(row.batchId||'')===sourceBatchId)){
      delivery.processingStatus='PROCESSED';delivery.processingTransactionId=result.transactionId;
      delivery.processing=clone(result);delivery.processedTurn=turn();
      delivery.createdBatchIds=[...new Set([...(delivery.createdBatchIds||[]),...(result.createdBatchIds||[])])];
    }
    emit('OMEGA_RESOURCE_SITE_FLOW_PROCESSED',cid,{siteId:siteFlowRows(cid).find(row=>String(row.batchId)===sourceBatchId)?.siteId||null,
      batchId:sourceBatchId,resourceId:cycle.primaryInputResourceId,transactionId:result.transactionId,
      createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},turn:turn(),status:'PROCESSED'});
  }
  emit('OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED',cid,{cycleId:cycle.cycleId,transactionId:result.transactionId,
    factoryId:cycle.factoryId,outputQuantities:cycle.outputQuantities,finishDate:cycle.finishDate,actualCompletionDate:cycle.actualCompletionDate});
  return{status:'COMPLETED',cycleId:cycle.cycleId,transactionId:result.transactionId,outputQuantities:cycle.outputQuantities};
}
function processPendingFactoryInputs(countryId){
  const cid=canonicalCountry(countryId),n=factoryCycleStore(cid),assets=factoryAssets(cid),completed=[],started=[],blocked=[],transfers=[];
  const completedThisTurn=new Set();
  // First finish any cycle whose date has arrived. Output is not posted before this point.
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||''),cycle=n.factoryProductionCycles[fid];
    if(!fid||!asset||!factoryCycleActive(cycle)||cycle.status==='PAUSED'||!factoryCycleDue(cycle))continue;
    const result=executeFactoryCycle({countryId:cid,factoryId:fid,factoryCycleId:cycle.cycleId,
      resourceId:cycle.primaryInputResourceId,quantity:cycle.productionQuantity,unit:asset.inputUnit||null});
    const outcome=completeFactoryProductionCycle(cid,asset,cycle,result);
    if(outcome.status==='COMPLETED'){completed.push(outcome);completedThisTurn.add(fid);}
    else if(outcome.status!=='PAUSED')blocked.push({factoryId:fid,reason:outcome.reason||'FACTORY_PRODUCTION_CYCLE_PAUSED',detail:outcome});
  }
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||'');
    if(!fid||!asset||completedThisTurn.has(fid))continue;
    const prior=n.factoryProductionCycles[fid];
    if(factoryCycleActive(prior)){
      if(prior.status==='PAUSED'&&factoryCycleDue(prior)){
        // Pause is not a dead end: fetch any newly delivered/available required feedstock before
        // deciding whether this facility remains red/stopped or can resume at reduced productivity.
        const pausedRecipe=recipeFor(prior.primaryInputResourceId,asset);
        const feeder=transferFactoryInputsFromWarehouse(cid,asset,pausedRecipe);
        transfers.push(...(feeder.transfers||[]));
        const resumedMetrics=factoryProductionMetrics(asset,pausedRecipe,prior.cycleId);
        const resumeMissing=resumedMetrics.inputs.filter(row=>row.available<=1e-9||row.tracked<=1e-9)
          .map(row=>({resourceId:row.resourceId,available:row.available,tracked:row.tracked,
            reason:row.available<=1e-9?'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY':'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'}));
        if(resumedMetrics.possibleProduction<=1e-9||resumeMissing.length){
          factorySetProductionHealth(asset,'STOPPED',0,resumedMetrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',
            missingInputs:resumeMissing.length?resumeMissing:resumedMetrics.missingInputs,cycleId:prior.cycleId});
          blocked.push({factoryId:fid,reason:'FACTORY_INPUT_SHORTAGE',
            missingInputs:resumeMissing.length?resumeMissing:resumedMetrics.missingInputs,warehouseTransferStatus:feeder.status});
          continue;
        }
        releaseFactoryCycleReservations(asset,prior.cycleId);
        prior.status='RESCHEDULED_AFTER_INPUT_SHORTAGE';prior.resumedTurn=turn();prior.resumedByCycleSequence=(Number(n.factoryProductionCycleSequence)||0)+1;
        n.factoryProductionCycleHistory.push(clone(prior));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
        delete n.factoryProductionCycles[fid];asset.activeProductionCycleId=null;
        // Continue through the normal operation, utility and workforce gates below. The replacement
        // cycle uses currently recorded batches and a newly calculated productivity percentage.
      }else{
        factorySetProductionHealth(asset,prior.productivityPct<99.999?'REDUCED':'RUNNING',
          prior.productionQuantity,prior.capacityPerDay,{cycleId:prior.cycleId});
        continue;
      }
    }
    const gate=factoryOperationGate(cid,asset);
    if(gate.status!=='READY'){
      factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity),{reason:gate.reason,gate});
      blocked.push({factoryId:fid,reason:gate.reason,detail:gate});continue;
    }
    const first=tok(Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'');
    const recipe=recipeFor(first,asset);
    const transfer=transferFactoryInputsFromWarehouse(cid,asset,recipe);
    transfers.push(...(transfer.transfers||[]));
    const metrics=factoryProductionMetrics(asset,recipe);
    const missing=metrics.inputs.filter(row=>row.available<=1e-9||row.tracked<=1e-9)
      .map(row=>({resourceId:row.resourceId,available:row.available,tracked:row.tracked,reason:row.available<=1e-9?'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY':'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'}));
    if(metrics.possibleProduction<=1e-9||missing.length){
      factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',missingInputs:missing.length?missing:metrics.missingInputs});
      blocked.push({factoryId:fid,reason:'FACTORY_INPUT_SHORTAGE',missingInputs:missing.length?missing:metrics.missingInputs,
        warehouseTransferStatus:transfer.status});continue;
    }
    const result=startFactoryProductionCycle({countryId:cid,factoryId:fid,resourceId:first,quantity:metrics.possibleProduction});
    if(result.status==='IN_PROGRESS')started.push({factoryId:fid,cycleId:result.cycleId,productionQuantity:result.productionQuantity,
      productivityPct:result.productivityPct,finishDate:result.finishDate});
    else blocked.push({factoryId:fid,reason:result.reason||result.status,detail:result});
  }
  return{status:blocked.length?'DEGRADED':'COMPLETED',countryId:cid,turn:turn(),completedCount:completed.length,processedCount:completed.length,completed,processed:completed,
    startedCount:started.length,started,warehouseTransferCount:transfers.length,transfers,blocked};
}

function ensureSimulationFactory(cid,site,resourceId,quantity,options={}){
  const economy=econState(cid);if(!Array.isArray(economy.productionAssets))economy.productionAssets=[];
  const assets=economy.productionAssets,siteId=String(site?.siteId||'');
  const factoryId='FAC-SIM:'+cid+':'+String(siteId).replace(/[^A-Za-z0-9_-]/g,'_')+':'+tok(resourceId);
  const compatible=candidateFactories(cid,resourceId);
  // Explicit auto-commissioning binds a new deposit to a source-site factory when possible.
  // Otherwise retain the legacy shared-factory fallback for callers that do not request it.
  const siteFactory=compatible.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===siteId);
  if(siteFactory)return{status:'EXISTING_SITE',factory:siteFactory.asset};
  let factory=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===factoryId);
  if(factory&&assetCanAccept(factory,resourceId))return{status:'EXISTING_SITE',factory};
  if(options.siteSpecific!==true&&compatible.length)return{status:'EXISTING',factory:compatible[0].asset};
  const recipe=recipeFor(resourceId,{});
  if(!Object.keys(recipe.inputs||{}).length||!Object.keys(recipe.outputs||{}).length)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  if(!factory){
    factory={id:factoryId,countryId:cid,siteId:null,sourceSiteId:siteId,stage:'PROCESSING',factoryType:recipe.factoryType||'RESOURCE_PROCESSING_PLANT',
      status:'OPERATIONAL',capacity:Math.max(1,num(quantity)||1),inputCoefficients:clone(recipe.inputs),outputProfile:clone(recipe.outputs),
      inputInventory:{},inputBatchLots:[],companyId:'SIM-COMPANY:'+cid,ownerCompanyId:'SIM-COMPANY:'+cid,
      transportAccess:['truck','rail','ship','pipeline'],locationNodeKey:'FACTORY:'+cid+':'+siteId,
      simulationOnly:true,authority:'SIMULATED_GAMEPLAY_BOOTSTRAP',
      bootstrapReason:options.siteSpecific===true?'SOURCE_SITE_FACTORY_REQUIRED':'NO_EXISTING_COMPATIBLE_FACTORY'};
    assets.push(factory);
  }
  return{status:'CREATED_SIMULATION_ONLY',factory};
}
async function executeSitePipeline(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISSING'};
  const endowment=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
  if(!endowment?.initialize||!endowment?.hydrateCountry||!endowment?.extractCountry)return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_RUNTIME_UNAVAILABLE'};
  const initialized=await endowment.initialize();
  if(initialized?.status!=='READY')return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_NOT_READY',detail:initialized};
  const site=siteById(input.siteId);
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
  if(canonicalCountry(site.countryId)!==cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISMATCH',siteCountryId:site.countryId,requestedCountryId:cid};
  const registeredAssets=Array.isArray(state()?.resource?.[cid]?.mineAssets)?state().resource[cid].mineAssets:[];
  const latestMineAsset=registeredAssets.slice().reverse().find(row=>String(row?.siteId||'')===String(site.siteId));
  if(latestMineAsset&&/DECOMMISSIONED|DESTROYED|STOPPED/.test(String(latestMineAsset.status||'').toUpperCase()))
    return{status:'BLOCKED',reason:'MINE_DECOMMISSIONED',siteId:site.siteId,countryId:cid};
  const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const siteGate=strategicPolicy?.siteAvailableForExtraction?.(cid,site.siteId,site);
  if(siteGate&&!siteGate.allowed)return{status:'BLOCKED',reason:siteGate.reason||'SITE_EXPLORATION_GATE_BLOCKED',siteId:site.siteId,countryId:cid};
  const rid=tok(input.resourceId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId||site?.identity?.resourceTypeId);
  if(!rid)return{status:'BLOCKED',reason:'RESOURCE_ID_MISSING'};
  const loaded=await loadCatalog();if(loaded?.status==='FAILED')return{status:'BLOCKED',reason:'INDUSTRIAL_CATALOG_UNAVAILABLE',detail:loaded};
  const hydrated=await endowment.hydrateCountry(cid);
  if(hydrated?.status!=='APPLIED'||hydrated?.result?.accepted===false)return{status:'BLOCKED',reason:'COUNTRY_HYDRATION_NOT_COMMITTED',detail:hydrated};
  const extractionPlan=planExtraction({countryId:cid,siteId:site.siteId,resourceId:rid,quantity:input.quantity,remainingReserve:input.remainingReserve});
  if(extractionPlan?.status!=='PLANNED')return{status:'BLOCKED',reason:'INDUSTRIAL_EXTRACTION_PLAN_BLOCKED',siteId:site.siteId,detail:extractionPlan};
  const countryState=state()?.resource?.[cid]||{},controllers=countryState.mineSiteControllers||{};
  const siteKey=String(site.siteId),controller=controllers[siteKey]||Object.values(controllers).find(x=>String(x?.siteReferenceKey||'')===siteKey);
  const linkedKeys=Array.isArray(controller?.linkedOccurrenceKeys)?controller.linkedOccurrenceKeys.map(String).filter(Boolean):[];
  const mineStates=countryState.mineStates&&typeof countryState.mineStates==='object'?countryState.mineStates:{};
  const siteReference=(Array.isArray(countryState.mineSiteReferences)?countryState.mineSiteReferences:[]).find(x=>String(x?.siteReferenceKey||x?.siteId||'')===siteKey);
  const matchingKeys=linkedKeys.filter(key=>tok(mineStates[key]?.resourceId||mineStates[key]?.resourceTypeId)===rid);
  const stateBoundKeys=Object.entries(mineStates).filter(([key,row])=>{
    const rowSite=String(row?.siteReferenceKey||row?.siteId||row?.sourceSiteId||'');
    return rowSite===siteKey&&tok(row?.resourceId||row?.resourceTypeId)===rid&&key;
  }).map(([key])=>String(key));
  // Some legacy occurrence keys predate per-key resourceId persistence or controller materialization.
  // Reuse a mine-state key only when its own site identity and commodity both match exactly.
  const referenceResource=tok(siteReference?.resourceId||siteReference?.resourceTypeId||siteReference?.rawSiteReference?.resourceId||siteReference?.rawSiteReference?.resourceTypeId);
  const dedicatedGameplaySite=site?.runtime?.identityAuthority==='LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE'&&site?.map?.markerEligible!==false&&!site?.runtime?.aliasOfSiteId;
  const dedicatedSiteKeys=dedicatedGameplaySite?linkedKeys.filter(key=>String(key).startsWith('SITE_OCC:'+cid+':')&&tok(mineStates[key]?.resourceId||mineStates[key]?.resourceTypeId)===rid):[];
  // Prefer a structured source occurrence only when its source deposit name is the
  // same physical site, not merely a fuzzy-linked region with the same commodity.
  // Example: "Barapukuria Coal Mine" matches exactly; "Pilbara Hamersley Province"
  // must not swallow the distinct "Pilbara Iron Ore Range" gameplay site.
  const identityWords=value=>{
    const ignored=new Set(['site','mine','field','quarry','facility','deposit','orebody','area','zone','complex','project']);
    return [...new Set(String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ')
      .trim().split(/\s+/).filter(x=>x.length>1&&!ignored.has(x)))].sort().join(' ');
  };
  const depositRows=Array.isArray((g.ResourceMinistryEngine||g.OmegaResourceMinistryEngine||g.Omega?.ResourceMinistryEngine)?.deposits)?
    (g.ResourceMinistryEngine||g.OmegaResourceMinistryEngine||g.Omega?.ResourceMinistryEngine).deposits:[];
  const exactSiteName=identityWords(site.siteName);
  const sourceDepositKeys=matchingKeys.filter(key=>{
    const row=mineStates[key]||{},depositKey=String(row.depositKey||'').trim();
    if(!String(key).startsWith('OCC:')||!depositKey||/^SIM(?:_|$)/i.test(depositKey))return false;
    const source=depositRows.find(x=>[x?.id,x?.depositId,x?.mineId].some(v=>String(v||'').trim()===depositKey));
    const sourceName=source?.name||source?.depositName||row.siteName||row.depositName||'';
    return !!exactSiteName&&identityWords(sourceName)===exactSiteName;
  });
  const keys=sourceDepositKeys.length?sourceDepositKeys:
    (dedicatedSiteKeys.length?dedicatedSiteKeys:(stateBoundKeys.length?stateBoundKeys:(matchingKeys.length?matchingKeys:(referenceResource===rid?linkedKeys:[]))));
  if(!keys.length)return{status:'BLOCKED',reason:linkedKeys.length?'SITE_RESOURCE_OCCURRENCE_NOT_FOUND':'SITE_HAS_NO_EXECUTABLE_OCCURRENCE',siteId:site.siteId,countryId:cid,resourceId:rid,controllerStatus:controller?.controllerStatus||null,linkedOccurrenceCount:linkedKeys.length,siteStateOccurrenceCount:stateBoundKeys.length,referenceResource:referenceResource||null};
  const already=netState(cid).siteExecutions||[];
  const duplicate=already.find(x=>x.siteId===site.siteId&&Number(x.turn)===turn()&&x.status!=='FAILED');
  if(duplicate)return{status:'BLOCKED',reason:'SITE_ALREADY_EXECUTED_THIS_TURN',existingExecutionId:duplicate.executionId,siteId:site.siteId};
  // Prepare an explicitly requested source-site factory before the extraction event fires.
  // The extraction callback dispatches synchronously, so it must see the intended destination.
  let preparedFactory=null,preparedFactoryBootstrap=null;
  if(input.autoCommissionFactory===true){
    preparedFactoryBootstrap=ensureSimulationFactory(cid,site,rid,
      Math.max(1,num(extractionPlan.approvedQuantity)||num(input.quantity)||1),{siteSpecific:true});
    preparedFactory=preparedFactoryBootstrap.factory||null;
    if(!preparedFactory)return{status:'BLOCKED',reason:'SITE_FACTORY_BOOTSTRAP_BLOCKED',detail:preparedFactoryBootstrap};
  }
  const extraction=await endowment.extractCountry(cid,keys);
  const records=extraction?.result?.records||extraction?.records||[];
  const record=records.find(x=>keys.includes(String(x?.occurrenceKey||''))&&canonicalCountry(x?.countryId||cid)===cid&&x?.producedBatch);
  if(extraction?.status!=='APPLIED'||extraction?.result?.accepted===false||!record){
    return{status:'BLOCKED',reason:'SITE_EXTRACTION_NOT_COMMITTED',siteId:site.siteId,occurrenceKeys:keys,extractionStatus:extraction?.status||null,detail:extraction?.reason||extraction?.detail||extraction?.result?.error||extraction?.result?.blocked||extraction?.result?.reason||null};
  }
  const batch=record.producedBatch,quantity=Math.max(0,num(record.approvedQuantity)||num(batch.quantity)||num(record.quantity)||0);
  if(quantity<=0)return{status:'BLOCKED',reason:'EXTRACTION_BATCH_QUANTITY_INVALID',siteId:site.siteId,occurrenceKey:record.occurrenceKey};
  const candidates=candidateFactories(cid,rid);
  let factoryBootstrap=preparedFactoryBootstrap||null;
  let factoryChoice=preparedFactory||
    candidates.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===String(site.siteId))?.asset||
    candidates[0]?.asset||null;
  // A missing factory must never be silently fabricated during normal gameplay.
  // Scenario/test callers may opt in explicitly with autoCommissionFactory:true.
  if(!factoryChoice&&input.autoCommissionFactory===true){
    factoryBootstrap=ensureSimulationFactory(cid,site,rid,quantity,{siteSpecific:true});
    factoryChoice=factoryBootstrap.factory||null;
  }
  if(!factoryChoice)return{status:'EXTRACTED_AWAITING_FACTORY',siteId:site.siteId,countryId:cid,resourceId:rid,quantity,unit:batch.unit||'TONNES',occurrenceKey:record.occurrenceKey,batchId:batch.batchId,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW'),reason:'NO_MATCHING_FACTORY'};
  const sent=dispatchShipment({countryId:cid,siteId:site.siteId,resourceId:rid,quantity,unit:batch.unit||'TONNES',transportMode:input.transportMode,
    factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),batchId:batch.batchId,occurrenceKey:record.occurrenceKey,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW')});
  const dispatchedQuantity=sent.status==='DISPATCHED'?Math.max(0,num(sent.shipment?.quantity)||0):quantity;
  const execution={executionId:'SITE-PIPELINE:'+cid+':'+site.siteId+':T'+turn(),siteId:site.siteId,countryId:cid,resourceId:rid,occurrenceKey:record.occurrenceKey,batchId:batch.batchId,
    quantity:dispatchedQuantity,extractedQuantity:quantity,unit:batch.unit||'TONNES',turn:turn(),factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),factoryBootstrapStatus:factoryBootstrap?.status||'EXISTING',
    extractionStatus:'COMMITTED',extractionPlanId:extractionPlan.planId,shipmentStatus:sent.status,shipmentId:sent.shipment?.shipmentId||null,route:clone(sent.shipment?.route||sent.plan?.route||null),status:sent.status==='DISPATCHED'?'IN_TRANSIT':sent.status};
  const ledger=netState(cid);ledger.siteExecutions=Array.isArray(ledger.siteExecutions)?ledger.siteExecutions:[];ledger.siteExecutions.push(clone(execution));ledger.siteExecutions=ledger.siteExecutions.slice(-MAX_EVENTS);
  if(sent.status!=='DISPATCHED')return{...execution,status:'EXTRACTED_AWAITING_ROUTE',reason:sent.reason||'SHIPMENT_DISPATCH_BLOCKED',shipment:sent};
  emit('OMEGA_RESOURCE_SITE_PIPELINE_STARTED',cid,execution);
  return{...execution,status:'IN_TRANSIT',shipment:sent.shipment,factoryBootstrap:factoryBootstrap?{status:factoryBootstrap.status,factoryId:factoryChoice.id}:null};
}

function diagnostics(countryId){
  const cid=countryId?canonicalCountry(countryId):null,sites=cid?masterSites().filter(s=>canonicalCountry(s?.countryId)===cid):masterSites();
  const byReason={}, extraction=sites.map(s=>{const rid=tok(s?.real?.resourceId||s?.sourceSiteRecord?.resourceId);const p=planExtraction({countryId:s.countryId,siteId:s.siteId,resourceId:rid,quantity:1});if(p.status!=='PLANNED')byReason[p.reason]=(byReason[p.reason]||0)+1;return p});
  const countries=[...new Set(masterSites().map(s=>canonicalCountry(s.countryId)).filter(Boolean))];
  let factoryCount=0,networkShipmentCount=0,projectCount=0;
  for(const c of countries){factoryCount+=factoryAssets(c).length;const n=netState(c);networkShipmentCount+=n.shipments.length;projectCount+=n.projects.length}
  const methods={};for(const x of extraction)if(x?.method)methods[x.method]=(methods[x.method]||0)+1;
  return{version:VERSION,siteCount:sites.length,commercialSiteCount:sites.filter(s=>s?.sourceSiteRecord?.commercialExtraction===true).length,
    extractionPlans:extraction.length,blockedExtractionReasons:byReason,methodCoverage:methods,factoryAssetCount:factoryCount,shipmentCount:networkShipmentCount,projectCount,
    catalogLoaded:!!cat(),daysPerTurn:daysPerTurn(),targetArchitecture:'SITE -> EXTRACTION -> WAREHOUSE -> ROUTE -> FACTORY -> PROCESS -> OUTPUT',countryIsolation:'ENFORCED_BY_COUNTRY_SCOPED_STATE_AND_CROSS_BORDER_CONTRACT'};
}


function finiteCount(value){if(value===null||value===undefined||value==='')return null;const n=num(value);return n!==null&&n>=0?n:null;}
function countryPopulationRecord(cid,econ){
  const s=state()||{},keys=[cid,String(cid||'').toUpperCase()];
  const resolver=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
  try{
    const identity=resolver?.resolveCountry?.(cid),raw=identity?.raw?.raw||identity?.raw?.datasets?.['countries.json']||identity?.raw||{};
    for(const name of [identity?.name,identity?.countryName,identity?.canonicalName,raw?.name,raw?.countryName,raw?.officialName]){
      if(name){keys.push(String(name));keys.push(String(name).toUpperCase().replace(/[^A-Z0-9]+/g,'_'));}
    }
  }catch(_){}
  const directRows=[econ?.populationRecord,econ?.demographics,econ?.population,s.population?.[cid],s.populations?.[cid],
    s.demographics?.[cid],s.society?.[cid],s.populationByCountry?.[cid],s.countryProfiles?.[cid],s.countries?.[cid]];
  const globals=[s.population,s.populations,s.populationByCountry,g.OmegaPopulationData,g.Omega?.PopulationData,g.populationData,
    g.PopulationData,g.POPULATION_DATA,g.OmegaCountryPopulationData,g.countryPopulationData,g.COUNTRY_POPULATION_DATA];
  for(const source of globals){
    if(!source||typeof source!=='object')continue;
    for(const key of keys){const row=source[key];if(row&&typeof row==='object'){directRows.push(row);break;}}
    if(source.data&&typeof source.data==='object')for(const key of keys){const row=source.data[key];if(row&&typeof row==='object'){directRows.push(row);break;}}
  }
  const populationFields=['populationTotal','population_total','totalPopulation','total_population','population','population_2015','population2015',
    'populationCurrent','population_current','populationCount','population_count','laborForce','labor_force','laborForceSize','labor_force_size',
    'totalLaborForce','total_labor_force','labourForce','labour_force'];
  for(const row of directRows){
    if(row&&typeof row==='object'&&populationFields.some(key=>row[key]!==undefined&&row[key]!==null&&row[key]!==''))return row;
    if(typeof row==='number'&&Number.isFinite(row)&&row>0)return{population:row};
  }
  return null;
}
function resolveFactoryLabourForce(cid,econ){
  const s=state()||{},record=countryPopulationRecord(cid,econ);
  const directCandidates=[econ.laborForce,econ.labor_force,econ.laborForceSize,econ.labor_force_size,econ.totalLaborForce,econ.total_labor_force,
    econ.population?.laborForce,econ.demographics?.laborForce,s.population?.[cid]?.laborForce,s.population?.[cid]?.labor_force,
    record?.laborForce,record?.labor_force,record?.labor_force_total,record?.laborForceTotal,record?.labourForce,record?.labour_force];
  for(const value of directCandidates){const n=finiteCount(value);if(n!==null&&n>0)return{value:n,authority:'RECORDED_LABOUR_FORCE',simulationOnly:false};}
  const popCandidates=[econ.populationTotal,econ.population_total,econ.population_2015,econ.population2015,econ.populationSize,
    typeof econ.population==='number'?econ.population:null,record?.populationTotal,record?.population_total,record?.population_2015,
    record?.population2015,record?.totalPopulation,record?.total_population,record?.population,record?.population_count,
    record?.populationCurrent,record?.population_current,record?.populationCount,record?.total];
  let population=null;for(const value of popCandidates){const n=finiteCount(value);if(n!==null&&n>0){population=n;break;}}
  if(population===null)return{value:null,authority:'NOT_RECORDED',simulationOnly:true};
  const participationCandidates=[econ.laborForceParticipationPct,econ.labor_force_participation_pct,econ.laborParticipationRatePct,
    record?.laborForceParticipationPct,record?.labor_force_participation_pct,record?.labor_force_participation_rate];
  let participation=null;
  for(const value of participationCandidates){const n=num(value);if(n!==null&&n>0&&n<=100){participation=n;break;}}
  if(participation===null)participation=60;
  return{value:Math.max(1,Math.round(population*participation/100)),authority:participation===60&&participationCandidates.every(v=>num(v)===null)?
    'SIMULATED_POPULATION_LABOUR_FORCE_PROXY_60_PERCENT':'RECORDED_PARTICIPATION_RATE_PROXY',
    simulationOnly:participationCandidates.every(v=>num(v)===null),population,participationRatePct:participation};
}
function readUnemploymentCount(econ){
  for(const key of ['unemploymentCount','unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount']){
    const value=finiteCount(econ?.[key]);if(value!==null)return{value,key};
  }
  return{value:null,key:null};
}
function readUnemploymentRate(econ){
  for(const key of ['unemployment_rate','unemploymentRatePct','unemploymentRate','unemployment_rate_pct']){
    const value=num(econ?.[key]);if(value!==null&&value>=0&&value<=100)return{value,key};
  }
  return{value:null,key:null};
}
function reconcileFactoryEmployment(countryId){
  const cid=canonicalCountry(countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_EMPLOYMENT_COUNTRY_INVALID'};
  const econ=econState(cid),profiles=cat()?.factoryProfiles||{},assets=factoryAssets(cid);
  let model=econ.factoryEmployment;
  if(!model||typeof model!=='object'||Array.isArray(model)){
    model={schemaVersion:'1.0.0',model:'SIMULATED_FACTORY_EMPLOYMENT_V1',baselineUnemployedCount:null,
      labourForce:null,labourForceAuthority:'NOT_RECORDED',unemploymentSource:'NOT_RECORDED',factories:{},jobsSupported:0,jobsFilled:0,
      vacancies:0,unemployedCount:null,unemploymentRatePct:null,lastAppliedUnemployedCount:null,lastAppliedUnemploymentRatePct:null,
      lastUpdatedTurn:null,simulationOnly:true};
    econ.factoryEmployment=model;
  }
  if(!model.factories||typeof model.factories!=='object'||Array.isArray(model.factories))model.factories={};
  const labour=resolveFactoryLabourForce(cid,econ),direct=readUnemploymentCount(econ),rate=readUnemploymentRate(econ);
  const priorFilled=Math.max(0,num(model.jobsFilled)||0);
  let baseline=finiteCount(model.baselineUnemployedCount);
  const lastCount=finiteCount(model.lastAppliedUnemployedCount),lastRate=num(model.lastAppliedUnemploymentRatePct);
  const directChanged=direct.value!==null&&lastCount!==null&&Math.abs(direct.value-lastCount)>1e-6;
  const rateChanged=rate.value!==null&&lastRate!==null&&Math.abs(rate.value-lastRate)>1e-7;
  if(baseline===null){
    if(direct.value!==null){baseline=direct.value;model.unemploymentSource='RECORDED_UNEMPLOYED_HEADCOUNT';}
    else if(rate.value!==null&&labour.value!==null){
      baseline=Math.max(0,Math.round(labour.value*rate.value/100));model.unemploymentSource='RECORDED_UNEMPLOYMENT_RATE_X_LABOUR_FORCE';
    }
  }else if(directChanged){
    baseline=direct.value+priorFilled;model.unemploymentSource='UPDATED_LIVE_UNEMPLOYED_HEADCOUNT_PLUS_EXISTING_FACTORY_HIRES';
  }else if(rateChanged&&labour.value!==null){
    baseline=Math.max(0,Math.round(labour.value*rate.value/100))+priorFilled;
    model.unemploymentSource='UPDATED_LIVE_UNEMPLOYMENT_RATE_PLUS_EXISTING_FACTORY_HIRES';
  }
  if(baseline!==null)model.baselineUnemployedCount=baseline;
  model.labourForce=labour.value;model.labourForceAuthority=labour.authority;model.labourForceSimulationOnly=labour.simulationOnly;
  model.factories={};
  const operational=assets.filter(asset=>String(asset?.status||'OPERATIONAL').toUpperCase()==='OPERATIONAL'&&
    (asset?.commissionedTurn!==undefined||asset?.factoryType||asset?.type));
  operational.sort((a,b)=>(num(a.commissionedTurn)??num(a.createdTurn)??0)-(num(b.commissionedTurn)??num(b.createdTurn)??0)||
    String(a.id||a.assetId||a.factoryId||a.projectId||'').localeCompare(String(b.id||b.assetId||b.factoryId||b.projectId||'')));
  let totalSupported=0,totalFilled=0,remaining=baseline;
  for(const asset of operational){
    const id=String(asset.id||asset.assetId||asset.factoryId||asset.projectId||'').trim();if(!id)continue;
    const type=String(asset.factoryType||asset.type||asset.facilityType||'').toUpperCase(),profile=profiles[type]||{};
    const jobsRaw=num(profile.employment?.jobsPerFactory??asset.employmentProfile?.jobsPerFactory??asset.employment?.jobsSupported);
    const supported=jobsRaw!==null&&jobsRaw>0?Math.floor(jobsRaw):0;
    const filled=remaining===null?0:Math.min(supported,Math.max(0,Math.floor(remaining))),open=supported-filled;
    remaining=remaining===null?null:Math.max(0,remaining-filled);totalSupported+=supported;totalFilled+=filled;
    const record={factoryId:id,factoryType:type,jobsSupported:supported,jobsFilled:filled,vacancies:open,
      status:supported===0?'EMPLOYMENT_PROFILE_MISSING':open===0?'FULLY_STAFFED':'PARTIALLY_STAFFED',
      authority:profile.employmentAuthority||profile.employment?.authority||'UNDECLARED',simulationOnly:true,lastReconciledTurn:turn()};
    model.factories[id]=record;
    asset.employment={...(asset.employment&&typeof asset.employment==='object'?asset.employment:{}),jobsSupported:supported,jobsFilled:filled,
      vacancies:open,coreOperatingCrew:num(profile.employment?.coreOperatingCrew),additionalDirectStaffSlots:num(profile.employment?.additionalDirectStaffSlots),
      jobScope:profile.employment?.jobScope||'DIRECT_FACTORY_JOBS_SCOPE_NOT_RECORDED',jobBreakdown:clone(profile.employment?.jobBreakdown||{}),
      status:record.status,model:'SIMULATED_FACTORY_EMPLOYMENT_V1',authority:record.authority,simulationOnly:true,lastReconciledTurn:turn()};
  }
  model.jobsSupported=totalSupported;model.jobsFilled=totalFilled;model.vacancies=Math.max(0,totalSupported-totalFilled);
  model.unemployedCount=baseline===null?null:Math.max(0,baseline-totalFilled);
  model.unemploymentRatePct=model.unemployedCount!==null&&labour.value!==null&&labour.value>0?
    Number((model.unemployedCount/labour.value*100).toFixed(4)):null;
  model.status=model.unemployedCount===null?'UNEMPLOYMENT_HEADCOUNT_UNAVAILABLE':'ACTIVE';
  model.authority='SIMULATED_FACTORY_EMPLOYMENT_RECONCILIATION';model.simulationOnly=true;model.lastUpdatedTurn=turn();
  if(model.unemployedCount!==null){
    econ.unemploymentCount=model.unemployedCount;
    for(const key of ['unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount'])
      if(Object.prototype.hasOwnProperty.call(econ,key))econ[key]=model.unemployedCount;
    if(model.unemploymentRatePct!==null){
      econ.unemployment_rate=model.unemploymentRatePct;
      for(const key of ['unemploymentRatePct','unemploymentRate','unemployment_rate_pct'])
        if(Object.prototype.hasOwnProperty.call(econ,key))econ[key]=model.unemploymentRatePct;
      model.lastAppliedUnemploymentRatePct=model.unemploymentRatePct;
    }
    model.lastAppliedUnemployedCount=model.unemployedCount;
  }
  model.baselineUnemployedCount=baseline;
  model.lastUpdateSourceFields={unemployedCountKey:direct.key,unemploymentRateKey:rate.key};
  return{status:model.status,countryId:cid,turn:turn(),baselineUnemployedCount:baseline,labourForce:model.labourForce,
    labourForceAuthority:model.labourForceAuthority,unemployedCount:model.unemployedCount,unemploymentRatePct:model.unemploymentRatePct,
    jobsSupported:model.jobsSupported,jobsFilled:model.jobsFilled,vacancies:model.vacancies,operationalFactoryCount:operational.length,
    source:model.unemploymentSource,simulationOnly:true};
}

function factoryProductionRequirements(factoryType, recipeId){
  const catalog=cat()||{},profiles=catalog.factoryProfiles||{},processing=catalog.processingRules||{},
    downstream=catalog.downstreamFactoryRecipes||{};
  const requestedType=normalizeFactoryType(factoryType);
  let key=String(recipeId||'').trim(),resourceId=null,recipe=null,kind=null;
  if(/^PROCESSING:/i.test(key)){resourceId=key.replace(/^PROCESSING:/i,'').trim();key=resourceId;}
  if(key&&downstream[key]){recipe=downstream[key];kind='DOWNSTREAM';key=String(recipe.recipeId||key);}
  else if(key&&processing[key]){resourceId=key;recipe=processing[key];kind='PROCESSING';}
  if(!recipe&&!key){
    const profile=profiles[requestedType]||{};
    const preferred=profile.defaultRecipeId||((profile.recipeIds||[]).find(id=>downstream[id])||null);
    if(preferred&&downstream[preferred]){key=preferred;recipe=downstream[preferred];kind='DOWNSTREAM';}
    if(!recipe){
      const found=Object.entries(processing).find(([,row])=>String(row?.factoryType||'').toUpperCase()===requestedType);
      if(found){resourceId=found[0];key=found[0];recipe=found[1];kind='PROCESSING';}
    }
    if(!recipe){
      const found=Object.entries(downstream).find(([,row])=>String(row?.factoryType||'').toUpperCase()===requestedType);
      if(found){key=found[0];recipe=found[1];kind='DOWNSTREAM';}
    }
  }
  const resolvedType=String(recipe?.factoryType||requestedType).trim().toUpperCase();
  const profile=profiles[resolvedType];
  if(!recipe||!profile)return{status:'NOT_FOUND',reason:!recipe?'FACTORY_RECIPE_NOT_FOUND':'FACTORY_PROFILE_NOT_FOUND',
    factoryType:resolvedType,recipeId:key||null};
  const capacity=num(profile.defaultCapacityPerDay);
  if(capacity===null||capacity<=0)return{status:'BLOCKED',reason:'FACTORY_CAPACITY_NOT_RECORDED',
    factoryType:resolvedType,recipeId:recipe.recipeId||key||null};
  const inputs=recipe.inputs&&typeof recipe.inputs==='object'?recipe.inputs:{};
  const outputs=recipe.outputs&&typeof recipe.outputs==='object'?recipe.outputs:{};
  const scaleRows=(source,scale)=>{
    const result={};
    for(const [id,value] of Object.entries(source)){
      const quantity=num(value);
      result[id]=quantity===null?null:Number((quantity*scale).toFixed(6));
    }
    return result;
  };
  const utilities=profile.utilities&&typeof profile.utilities==='object'?profile.utilities:{};
  const power=num(utilities.electricityMWhPerDay),water=num(utilities.waterM3PerDay);
  const employment=profile.employment&&typeof profile.employment==='object'?profile.employment:{};
  const workforce=profile.workforce&&typeof profile.workforce==='object'?profile.workforce:{};
  return{
    status:'READY',
    contract:'OMEGA_FACTORY_PRODUCTION_REQUIREMENTS_V1',
    factoryType:resolvedType,
    factoryName:profile.name||resolvedType,
    recipeId:recipe.recipeId||((kind==='PROCESSING')?'PROCESSING:'+resourceId:key),
    recipeKind:kind,
    resourceId:resourceId,
    inputsPerProductionUnit:clone(inputs),
    outputsPerProductionUnit:clone(outputs),
    inputUnit:recipe.inputUnit||'SIMULATION_RESOURCE_UNIT',
    outputUnit:recipe.outputUnit||'SIMULATION_RESOURCE_UNIT',
    quantityBasis:recipe.quantityBasis||catalog.factoryCatalogPolicy?.quantityBasis||'PER_SIMULATION_PRODUCTION_UNIT',
    ratedCapacityPerDay:capacity,
    ratedDailyInputs:scaleRows(inputs,capacity),
    ratedDailyOutputs:scaleRows(outputs,capacity),
    processing:{cycleDays:num(recipe.cycleDays),cycleTimeUnit:recipe.cycleTimeUnit||catalog.factoryCatalogPolicy?.recipeTimeUnit||'IN_GAME_DAYS',
      runtimeTimingMode:catalog.factoryCatalogPolicy?.recipeTimingRuntimeBehavior||'GAME_CALENDAR_DELAYED_COMPLETION',
      durationEnforced:true},
    workforce:{
      operators:num(workforce.operators),engineers:num(workforce.engineers),
      coreOperatingCrew:num(employment.coreOperatingCrew)??((num(workforce.operators)||0)+(num(workforce.engineers)||0)),
      additionalDirectStaffSlots:num(employment.additionalDirectStaffSlots),totalDirectJobs:num(employment.jobsPerFactory),
      jobBreakdown:clone(employment.jobBreakdown||{})
    },
    utilities:{
      electricityMWhPerDay:power,waterM3PerDay:water,
      electricityMWhPerProductionUnit:power===null?null:Number((power/capacity).toFixed(6)),
      waterM3PerProductionUnit:water===null?null:Number((water/capacity).toFixed(6))
    },
    construction:{
      cost:num(profile.constructionCost),timeDays:num(profile.constructionDays),materials:clone(profile.constructionMaterials||{}),
      materialUnit:profile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
      requiredInfrastructure:clone(profile.requiredInfrastructure||[]),requiredTechnologyIds:clone(profile.requiredTechnologyIds||[])
    },
    authority:recipe.recipeAuthority||recipe.authority||'SIMULATED_GAMEPLAY_RULE',
    profileAuthority:profile.authority||'NOT_RECORDED',
    simulationOnly:true
  };
}

function factoryProductionStatus(countryId,factoryId){
  const cid=canonicalCountry(countryId),assets=factoryAssets(cid),asset=assets.find(row=>String(row?.id||row?.assetId||row?.projectId)===String(factoryId||''));
  if(!asset)return{status:'NOT_FOUND',reason:'FACTORY_NOT_FOUND',countryId:cid,factoryId:String(factoryId||'')};
  const n=factoryCycleStore(cid),cycle=n.factoryProductionCycles[String(factoryId)]||null;
  return{status:'READY',countryId:cid,factoryId:String(factoryId),health:clone(asset.productionHealth||{status:'NOT_RECORDED'}),
    cycle:clone(cycle),lastProductionCycleId:asset.lastProductionCycleId||null,updatedTurn:turn()};
}
function decommissionFactory(input={}) {
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'').trim();
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_INVALID',factoryId:fid};
  if(!fid)return{status:'BLOCKED',reason:'FACTORY_ID_REQUIRED',countryId:cid};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'FACTORY_DECOMMISSION_CONFIRMATION_REQUIRED',countryId:cid,factoryId:fid};
  const asset=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId||'')===fid);
  if(!asset)return{status:'NOT_FOUND',reason:'FACTORY_NOT_FOUND',countryId:cid,factoryId:fid};
  const previousStatus=String(asset.status||'NOT_RECORDED').trim().toUpperCase();
  if(['DECOMMISSIONED','DESTROYED'].includes(previousStatus))
    return{status:'DECOMMISSIONED',countryId:cid,factoryId:fid,idempotent:true,productionStatus:'STOPPED'};
  const network=netState(cid);
  const cycleMap=factoryCycleStore(cid).factoryProductionCycles;
  const cycle=cycleMap[fid]||null;
  if(factoryCycleActive(cycle)){
    cycle.status='CANCELLED';
    cycle.cancelReason='FACTORY_DECOMMISSIONED_BY_PLAYER';
    cycle.cancelledTurn=turn();
    cycle.cancelledDate=factoryCurrentGameDate();
    cycle.decommissionedByPlayer=true;
    releaseFactoryCycleReservations(asset,cycle.cycleId);
    network.factoryProductionCycleHistory.push(clone(cycle));
    network.factoryProductionCycleHistory=network.factoryProductionCycleHistory.slice(-MAX_EVENTS);
    delete cycleMap[fid];
  }
  asset.status='DECOMMISSIONED';
  asset.decommissionedTurn=turn();
  asset.decommissionedDate=factoryCurrentGameDate();
  asset.decommissionedByPlayer=true;
  asset.activeProductionCycleId=null;
  const health=factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity),{
    reason:'FACTORY_DECOMMISSIONED_BY_PLAYER',
    priorStatus:previousStatus,
    cancelledCycleId:cycle?.cycleId||null
  });
  const record={status:'DECOMMISSIONED',countryId:cid,factoryId:fid,factoryType:String(asset.factoryType||asset.type||''),turn:turn(),
    date:asset.decommissionedDate,priorStatus:previousStatus,cancelledCycleId:cycle?.cycleId||null,
    productionHealth:clone(health),authority:'OMEGA_FACTORY_DECOMMISSION_API_V1',historyPreserved:true};
  network.factoryDecommissionHistory=Array.isArray(network.factoryDecommissionHistory)?network.factoryDecommissionHistory:[];
  network.factoryDecommissionHistory.push(clone(record));
  network.factoryDecommissionHistory=network.factoryDecommissionHistory.slice(-MAX_EVENTS);
  network.events=Array.isArray(network.events)?network.events:[];
  network.events.push(clone(record));network.events=network.events.slice(-MAX_EVENTS);
  emit('OMEGA_FACTORY_DECOMMISSIONED',cid,record);
  emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:fid,status:'DECOMMISSIONED',turn:turn()});
  return record;
}

function decommissionMine(input={}) {
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'MINE_COUNTRY_INVALID',siteId:siteId||null};
  const activePlayerCountry=playerSimulationCountryId();
  if(!activePlayerCountry)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_NOT_SELECTED',countryId:cid,siteId:siteId||null};
  if(cid!==activePlayerCountry)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:activePlayerCountry,siteId:siteId||null};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_ID_REQUIRED',countryId:cid};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'MINE_DECOMMISSION_CONFIRMATION_REQUIRED',countryId:cid,siteId};
  const resource=resourceState(cid),assets=Array.isArray(resource.mineAssets)?resource.mineAssets:[];
  const asset=assets.slice().reverse().find(row=>String(row?.siteId||'')===siteId);
  if(!asset)return{status:'NOT_FOUND',reason:'PLAYER_MINE_ASSET_NOT_FOUND',countryId:cid,siteId};
  const previousStatus=String(asset.status||'NOT_RECORDED').trim().toUpperCase();
  if(['DECOMMISSIONED','DESTROYED'].includes(previousStatus))
    return{status:'DECOMMISSIONED',countryId:cid,siteId,idempotent:true,productionStatus:'STOPPED',historyPreserved:true};
  asset.status='DECOMMISSIONED';
  asset.operationalStatus='STOPPED';
  asset.productionStatus='STOPPED';
  asset.decommissionedTurn=turn();
  asset.decommissionedDate=factoryCurrentGameDate();
  asset.decommissionedByPlayer=true;
  asset.activeProductionCycleId=null;
  asset.productionHealth={...(asset.productionHealth||{}),status:'STOPPED',currentOutput:0,
    reason:'MINE_DECOMMISSIONED_BY_PLAYER',updatedTurn:turn()};
  const network=netState(cid);
  network.mineDecommissionHistory=Array.isArray(network.mineDecommissionHistory)?network.mineDecommissionHistory:[];
  const record={status:'DECOMMISSIONED',countryId:cid,siteId,resourceId:String(asset.resourceId||''),
    mineAssetId:String(asset.id||asset.assetId||siteId),turn:turn(),date:asset.decommissionedDate,
    priorStatus:previousStatus,productionStatus:'STOPPED',historyPreserved:true,
    stockPreserved:true,authority:'OMEGA_MINE_DECOMMISSION_API_V1'};
  network.mineDecommissionHistory.push(clone(record));
  network.mineDecommissionHistory=network.mineDecommissionHistory.slice(-MAX_EVENTS);
  network.events=Array.isArray(network.events)?network.events:[];
  network.events.push(clone(record));
  network.events=network.events.slice(-MAX_EVENTS);
  emit('OMEGA_RESOURCE_MINE_DECOMMISSIONED',cid,record);
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId,resourceId:record.resourceId,status:'DECOMMISSIONED',turn:turn()});
  return record;
}

function factoryCatalogDiagnostics(){
  const catalog=cat()||{},profiles=catalog.factoryProfiles||{},downstream=catalog.downstreamFactoryRecipes||{};
  const processing=processRules(),profileTypes=new Set(Object.keys(profiles));
  const allTypes=new Set([...Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase()),...Object.keys(profiles),
    ...Object.values(downstream).map(x=>String(x?.factoryType||'').toUpperCase())].filter(Boolean));
  const issues=[];
  for(const [type,profile] of Object.entries(profiles)){
    if(!profile?.iconId)issues.push({code:'FACTORY_ICON_ID_MISSING',factoryType:type});
    if(!(num(profile?.defaultCapacityPerDay)>0))issues.push({code:'FACTORY_CAPACITY_INVALID',factoryType:type});
    if(!(num(profile?.constructionCost)>0)||!(num(profile?.constructionDays)>0))issues.push({code:'FACTORY_CONSTRUCTION_PROFILE_INVALID',factoryType:type});
    if(profile?.authority!=='SIMULATED_GAMEPLAY_PROFILE'||profile?.simulationOnly!==true)issues.push({code:'FACTORY_PROFILE_PROVENANCE_MISSING',factoryType:type});
    const bom=profile?.constructionMaterials;
    if(!bom||typeof bom!=='object'||Array.isArray(bom)||!Object.keys(bom).length)issues.push({code:'FACTORY_CONSTRUCTION_BOM_MISSING',factoryType:type});
    else for(const [material,quantity] of Object.entries(bom)){
      if(!Object.keys(catalog.resourceRules||{}).some(key=>tok(key)===tok(material)))issues.push({code:'FACTORY_CONSTRUCTION_RESOURCE_UNREGISTERED',factoryType:type,resourceId:material});
      if(!(num(quantity)>0))issues.push({code:'FACTORY_CONSTRUCTION_MATERIAL_QUANTITY_INVALID',factoryType:type,resourceId:material,quantity});
    }
    const employment=profile?.employment;
    if(!(num(employment?.jobsPerFactory)>0)||employment?.simulationOnly!==true||!employment?.hiringSource)
      issues.push({code:'FACTORY_EMPLOYMENT_PROFILE_INVALID',factoryType:type});
    if(!num(profile?.constructionDays)||num(profile?.constructionDays)<=0)issues.push({code:'FACTORY_CONSTRUCTION_DURATION_INVALID',factoryType:type});
    const utilities=profile?.utilities;
    if(!utilities||num(utilities.electricityMWhPerDay)===null||num(utilities.waterM3PerDay)===null||
      num(utilities.electricityMWhPerDay)<0||num(utilities.waterM3PerDay)<0||
      !(num(utilities.electricityMWhPerDay)>0)&&!(num(utilities.waterM3PerDay)>0))
      issues.push({code:'FACTORY_UTILITY_PROFILE_INVALID',factoryType:type});
    if(!Array.isArray(profile?.requiredInfrastructure)||!profile.requiredInfrastructure.some(x=>tok(x)==='power'))
      issues.push({code:'FACTORY_POWER_INFRASTRUCTURE_REQUIREMENT_MISSING',factoryType:type});
    const jobMix=employment?.jobBreakdown;
    const jobMixTotal=jobMix&&typeof jobMix==='object'&&!Array.isArray(jobMix)?Object.values(jobMix).reduce((sum,value)=>sum+(num(value)||0),0):null;
    if(jobMixTotal===null||Math.abs(jobMixTotal-(num(employment?.jobsPerFactory)||0))>1e-6||
      Math.abs((num(employment?.coreOperatingCrew)||0)+(num(employment?.additionalDirectStaffSlots)||0)-(num(employment?.jobsPerFactory)||0))>1e-6)
      issues.push({code:'FACTORY_EMPLOYMENT_ROLE_BREAKDOWN_MISMATCH',factoryType:type,jobMixTotal,jobsPerFactory:employment?.jobsPerFactory});
    for(const tech of profile?.requiredTechnologyIds||[])if(!techRules()[String(tech).toUpperCase()])issues.push({code:'FACTORY_TECHNOLOGY_UNDEFINED',factoryType:type,technologyId:tech});
  }
  for(const [resourceId,rule] of Object.entries(processing)){
    if(!(num(rule?.cycleDays)>0))issues.push({code:'PROCESSING_CYCLE_TIME_INVALID',resourceId,cycleDays:rule?.cycleDays});
    if(rule?.quantityBasis!=='PER_SIMULATION_PRODUCTION_UNIT'||rule?.cycleTimeUnit!=='IN_GAME_DAYS')
      issues.push({code:'PROCESSING_REQUIREMENT_CONTRACT_MISSING',resourceId});
    if(rule?.requiresAllInputs!==true||rule?.missingInputPolicy!=='BLOCK_CYCLE')
      issues.push({code:'PROCESSING_ATOMIC_INPUT_POLICY_MISSING',resourceId});
    for(const [inputId,coefficient] of Object.entries(rule?.inputs||{}))
      if(!tok(inputId)||!(num(coefficient)>0))issues.push({code:'PROCESSING_INPUT_COEFFICIENT_INVALID',resourceId,inputId,coefficient});
    for(const [outputId,coefficient] of Object.entries(rule?.outputs||{}))
      if(!tok(outputId)||!(num(coefficient)>0))issues.push({code:'PROCESSING_OUTPUT_COEFFICIENT_INVALID',resourceId,outputId,coefficient});
  }
  for(const type of new Set(Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase()).filter(Boolean)))
    if(!profileTypes.has(type))issues.push({code:'PROCESSING_FACTORY_PROFILE_MISSING',factoryType:type});
  for(const [id,recipe] of Object.entries(downstream)){
    const inputs=recipe?.inputs||{},outputs=recipe?.outputs||{};
    if(String(recipe?.recipeId||'')!==id)issues.push({code:'RECIPE_ID_KEY_MISMATCH',recipeId:id});
    if(!(num(recipe?.cycleDays)>0))issues.push({code:'DOWNSTREAM_CYCLE_TIME_INVALID',recipeId:id,cycleDays:recipe?.cycleDays});
    if(recipe?.quantityBasis!=='PER_SIMULATION_PRODUCTION_UNIT'||recipe?.cycleTimeUnit!=='IN_GAME_DAYS')
      issues.push({code:'DOWNSTREAM_REQUIREMENT_CONTRACT_MISSING',recipeId:id});
    if(!profiles[String(recipe?.factoryType||'').toUpperCase()])issues.push({code:'DOWNSTREAM_FACTORY_PROFILE_MISSING',recipeId:id,factoryType:recipe?.factoryType});
    if(Object.keys(inputs).length<2||Object.keys(outputs).length<1)issues.push({code:'DOWNSTREAM_RECIPE_SHAPE_INVALID',recipeId:id});
    for(const [resourceId,coefficient] of Object.entries(inputs))if(!tok(resourceId)||!(num(coefficient)>0))issues.push({code:'RECIPE_INPUT_COEFFICIENT_INVALID',recipeId:id,resourceId,coefficient});
    for(const [resourceId,coefficient] of Object.entries(outputs))if(!tok(resourceId)||!(num(coefficient)>0))issues.push({code:'RECIPE_OUTPUT_COEFFICIENT_INVALID',recipeId:id,resourceId,coefficient});
    const inputTotal=Object.values(inputs).reduce((sum,x)=>sum+(num(x)||0),0);
    const outputTotal=Object.values(outputs).reduce((sum,x)=>sum+(num(x)||0),0);
    if(Math.abs(inputTotal-outputTotal)>1e-6)issues.push({code:'RECIPE_SIMULATION_MASS_BALANCE_MISMATCH',recipeId:id,inputTotal,outputTotal});
    if(recipe?.simulationOnly!==true||recipe?.recipeAuthority!=='SIMULATED_GAMEPLAY_RULE')issues.push({code:'RECIPE_PROVENANCE_MISSING',recipeId:id});
  }
  const producerIds=new Set([
    ...Object.values(processing).flatMap(rule=>Object.keys(rule?.outputs||{})),
    ...Object.values(downstream).flatMap(rule=>Object.keys(rule?.outputs||{}))
  ].map(tok));
  const knownRawIds=new Set([
    ...Object.keys(catalog.resourceRules||{}),
    ...Object.values(processing).flatMap(rule=>Object.keys(rule?.inputs||{}))
  ].map(tok));
  const declaredExternalIds=new Set(Object.keys(catalog.externalInputSources||{}).map(tok));
  for(const [recipeId,recipe] of Object.entries(downstream)){
    for(const resourceId of Object.keys(recipe?.inputs||{})){
      const rid=tok(resourceId);
      if(!producerIds.has(rid)&&!knownRawIds.has(rid)&&!declaredExternalIds.has(rid))
        issues.push({code:'RECIPE_INPUT_SOURCE_UNREGISTERED',recipeId,resourceId});
      const external=Object.keys(catalog.externalInputSources||{}).find(key=>tok(key)===rid);
      if(external&&catalog.externalInputSources[external]?.requiresRecordedBatch!==true)
        issues.push({code:'EXTERNAL_RECIPE_INPUT_MUST_REQUIRE_RECORDED_STOCK',recipeId,resourceId});
      if(external&&catalog.externalInputSources[external]?.autoGenerateStock===true)
        issues.push({code:'EXTERNAL_RECIPE_INPUT_MUST_NOT_AUTOFABRICATE_STOCK',recipeId,resourceId});
    }
  }
  for(const [type,profile] of Object.entries(profiles)){
    if(profile?.defaultRecipeId&&!downstream[profile.defaultRecipeId])issues.push({code:'FACTORY_DEFAULT_RECIPE_MISSING',factoryType:type,recipeId:profile.defaultRecipeId});
  }
  return{status:issues.length?'DEGRADED':'HEALTHY',factoryTypeCount:allTypes.size,processingRuleCount:Object.keys(processing).length,
    legacyProcessingFactoryTypeCount:new Set(Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase())).size,
    profileCount:Object.keys(profiles).length,downstreamRecipeCount:Object.keys(downstream).length,categoryCount:(catalog.factoryCatalogPolicy?.categoryOrder||[]).length,
    issues};
}
function gameplayPipelineDiagnostics(countryScope){
  const sites=masterSites();
  // UI callers that inspect one selected country must not synchronously scan every
  // country's ledger on the WebView main thread. Keep the no-argument global contract
  // intact for world diagnostics and aggregate pipeline verification.
  const scopeText=countryScope==null?'':String(countryScope).trim();
  const hasScope=scopeText.length>0;
  const resolvedScope=hasScope?canonicalCountry(scopeText):null;
  const scopedCountry=resolvedScope&&/^[A-Z]{3}$/.test(resolvedScope)?resolvedScope:null;
  // A supplied but unresolvable scope must fail closed instead of silently reverting
  // to the expensive global scan.
  const countries=hasScope?(scopedCountry?[scopedCountry]:[]):runtimeCountryIds();
  const siteCounts=Object.create(null);
  for(const site of sites){
    const cid=canonicalCountry(site?.countryId);
    if(cid)siteCounts[cid]=(siteCounts[cid]||0)+1;
  }
  const isCurrentlyBlocked=flow=>{
    const status=String(flow?.status||'').toUpperCase();
    return status.includes('BLOCKED')||status==='PUBLICATION_ATTEMPTED'||
      status==='EXTRACTED_AWAITING_ROUTE'||status==='EXTRACTED_AWAITING_FACTORY';
  };
  const perCountry=countries.map(c=>{
    const flows=siteFlowRows(c),network=netState(c),stages={};
    let dispatched=0,processed=0,marketPublished=0,treasuryReceipts=0,blocked=0,awaitingTransportCapacity=0;
    const blockedFlows=[],awaitingCapacityFlows=[];
    for(const flow of flows){
      const flowStages=Array.isArray(flow?.stages)?flow.stages:[];
      let hasDispatched=false,hasProcessed=false,hasMarketPublication=false;
      for(const step of flowStages){
        stages[step.stage]=(stages[step.stage]||0)+1;
        const stage=String(step.stage||'').toUpperCase(),status=String(step.status||'').toUpperCase();
        if(stage==='TRANSPORT'&&['IN_TRANSIT','DELIVERED'].includes(status))hasDispatched=true;
        if(stage==='PROCESSING'&&status==='COMPLETED')hasProcessed=true;
        if(stage==='MARKET'&&status==='PUBLISHED')hasMarketPublication=true;
      }
      if(hasDispatched)dispatched++;
      if(hasProcessed)processed++;
      if(hasMarketPublication)marketPublished++;
      treasuryReceipts+=(Array.isArray(flow?.treasurySettlements)?flow.treasurySettlements.length:0);
      if(String(flow?.status||'').toUpperCase()==='AWAITING_CAPACITY'){
        awaitingTransportCapacity++;
        awaitingCapacityFlows.push({siteId:flow.siteId,resourceId:flow.resourceId,batchId:flow.batchId,
          reason:flow.transportQueueReason||'TRANSPORT_CAPACITY_EXHAUSTED'});
      }
      if(isCurrentlyBlocked(flow)){
        blocked++;
        blockedFlows.push({siteId:flow.siteId,resourceId:flow.resourceId,batchId:flow.batchId,status:flow.status,
          blockReason:flow.blockReason||flow.lastResidualBlockReason||null,
          stages:flowStages.filter(s=>['BLOCKED','RESIDUAL_BLOCKED'].includes(s.status))
            .map(s=>({stage:s.stage,status:s.status,reason:s.reason||null,detail:s.detail||null}))});
      }
    }
    const shipments=Array.isArray(network.shipments)?network.shipments:[];
    return{countryId:c,registrySiteCount:siteCounts[c]||0,extractionFlows:flows.length,dispatched,processed,marketPublished,
      treasuryReceipts,blocked,blockedFlows,awaitingTransportCapacity,awaitingCapacityFlows,shipmentCount:shipments.length,stages};
  });
  return{contract:'OMEGA_SITE_FLOW_PIPELINE_V1',version:VERSION,turn:turn(),registrySiteCount:sites.length,
    diagnosticScope:scopedCountry||(hasScope?'UNRESOLVED':'GLOBAL'),countryCount:countries.length,
    flowCount:perCountry.reduce((n,x)=>n+x.extractionFlows,0),dispatched:perCountry.reduce((n,x)=>n+x.dispatched,0),
    processed:perCountry.reduce((n,x)=>n+x.processed,0),marketPublished:perCountry.reduce((n,x)=>n+x.marketPublished,0),
    treasuryReceipts:perCountry.reduce((n,x)=>n+x.treasuryReceipts,0),blocked:perCountry.reduce((n,x)=>n+x.blocked,0),
    awaitingTransportCapacity:perCountry.reduce((n,x)=>n+x.awaitingTransportCapacity,0),perCountry};
}
function api(){
  return Object.freeze({VERSION,loadCatalog,planExtraction,planShipment,dispatchShipment,dispatchFactoryInputShipment,advanceShipments,quoteMineProject,startMineProject,startFactoryProject,startInfrastructureProject,startPadmaCorridorProject,advanceProjects,startTechnologyProject,executeFactoryCycle,executeSitePipeline,diagnostics,gameplayPipelineDiagnostics,factoryCatalogDiagnostics,factoryProductionRequirements,factoryProductionStatus,decommissionFactory,decommissionMine,startFactoryProductionCycle,transferFactoryInputsFromWarehouse,processPendingFactoryInputs,factoryUtilityDiagnostics,factoryConstructionMaterialQuote,reconcileFactoryEmployment,normalizeInfrastructure,candidateFactories,recipeFor,processPendingFactoryInputs,resourceMethod,buildRoute});
}
g.Omega=g.Omega||{};g.Omega.ResourceIndustrialNetwork=api();g.OmegaResourceIndustrialNetwork=g.Omega.ResourceIndustrialNetwork;

function boot(){
  loadCatalog().then(()=>{emit('OMEGA_RESOURCE_INDUSTRIAL_NETWORK_READY','GLOBAL',{version:VERSION,catalogResourceRules:Object.keys(rules()).length,factoryRules:Object.keys(processRules()).length})}).catch(()=>{});
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',async()=>{
      const countryId=playerSimulationCountryId();
      if(!countryId)return {status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
      await loadCatalog();
      try{
        await advanceShipments(countryId);
        await advanceProjects(countryId);
        await processPendingFactoryInputs(countryId);
        reconcileFactoryEmployment(countryId);
        return {status:'COMPLETED',countryId,turn:turn()};
      }catch(error){
        throw new Error('INDUSTRIAL_TURN_FAILED:'+countryId+':'+String(error?.message||error));
      }
    });
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',onExtractionCommitted);
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_BLOCKED',onExtractionBlocked);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',onFinishedGoodsRegistered);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED',onEconomyMarketPublication);
    g.addEventListener('OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',onDomesticSaleSettled);
    g.addEventListener('OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',onExtractionFiscalPosted);
    g.addEventListener('OMEGA_RESOURCE_TRADE_RECONCILED',onTreasurySettlement);
    g.addEventListener('OMEGA_READY',()=>loadCatalog());
    g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>loadCatalog());
  }
}
boot();

})(typeof window!=='undefined'?window:globalThis);
function commissionMineProject(cid,p){
  const rs=resourceState(cid);
  rs.mineAssets=Array.isArray(rs.mineAssets)?rs.mineAssets:[];
  const count=Math.max(1,Math.min(100,Math.floor(num(p.assetCount)||1))),assets=[];
  for(let index=1;index<=count;index++){
    const mineId=index===1?String(p.mineId||('MINE_ASSET:'+cid+':'+p.siteId+':'+h32(p.projectId))):String(p.mineId||('MINE_ASSET:'+cid+':'+p.siteId+':'+h32(p.projectId)))+':UNIT:'+index;
    let asset=rs.mineAssets.find(x=>String(x?.mineId||x?.id||'')===mineId);
    if(!asset){
      const sameSiteCount=rs.mineAssets.filter(x=>String(x?.siteId||'')===String(p.siteId)&&String(x?.status||'').toUpperCase()==='OPERATIONAL').length;
      const perAssetWorkers=Math.max(0,Math.floor(num(p.workersRequiredPerAsset)||((num(p.workersRequired)||0)/count)));
      const perAssetCommitted=Math.max(0,Math.floor((num(p.workersCommitted)||0)/count));
      asset={mineId,id:mineId,siteId:p.siteId,siteName:p.siteName,resourceId:p.resourceId,buildClass:p.buildClass,countryId:cid,ownerCountryId:cid,
        status:'OPERATIONAL',buildProjectId:p.projectId,commissionedTurn:turn(),capacityMultiplier:Math.min(1.60,1+0.12*(sameSiteCount+1)),
        workersRequired:perAssetWorkers,workersCommitted:perAssetCommitted,constructionCostUsd:(num(p.costUsd)||0)/count,commissioningLevel:sameSiteCount+1,
        assetCountAtConstruction:count,sourceSiteStatus:p.sourceSiteStatus||'UNOBSERVED',siteIdentityAuthority:p.siteIdentityAuthority||'CANONICAL_SITE_REGISTRY',
        authority:'SIMULATED_PLAYER_MINE_ASSET',productionStatus:'READY_FOR_EXTRACTION',lastProductionTurn:null};
      rs.mineAssets.push(asset);rs.mineAssets=rs.mineAssets.slice(-1024);
    }
    assets.push(asset);
  }
  rs.mineConstructionLedger=Array.isArray(rs.mineConstructionLedger)?rs.mineConstructionLedger:[];
  const ledger=rs.mineConstructionLedger.find(x=>String(x.projectId||'')===String(p.projectId));
  if(ledger){ledger.status='MINE_COMMISSIONED';ledger.commissionedTurn=turn();ledger.mineId=assets[0]?.mineId||p.mineId;ledger.commissionedMineIds=assets.map(x=>x.mineId);}
  emit('OMEGA_RESOURCE_MINE_COMMISSIONED',cid,{projectId:p.projectId,siteId:p.siteId,mineId:assets[0]?.mineId||p.mineId,mineIds:assets.map(x=>x.mineId),commissionedAssetCount:assets.length,assetCountAtConstruction:count,resourceId:p.resourceId,
    siteName:p.siteName,status:'OPERATIONAL',commissionedTurn:turn(),capacityMultiplier:assets[assets.length-1]?.capacityMultiplier||1,
    sourceSiteStatus:p.sourceSiteStatus,authority:'SIMULATED_PLAYER_MINE_ASSET'});
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId:p.siteId,mineIds:assets.map(x=>x.mineId),assetCount:assets.length,
    commissioningLevel:assets[assets.length-1]?.commissioningLevel||1,status:'OPERATIONAL'});
  return assets[0]||null;
}
function startFactoryProject(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_INVALID'};
  const n=netState(cid);
  if(input.requestId){const prior=n.projects.find(row=>row.projectType==='FACTORY_CONSTRUCTION'&&String(row.requestId||'')===String(input.requestId));if(prior)return{...clone(prior),idempotent:true};}
  if(input.factoryId){const prior=n.projects.find(row=>row.projectType==='FACTORY_CONSTRUCTION'&&String(row.factoryId||'')===String(input.factoryId)&&['UNDER_CONSTRUCTION','COMPLETED'].includes(String(row.status||'')));if(prior)return{...clone(prior),idempotent:true};}
  const requestedType=normalizeFactoryType(input.factoryType);
  const profiles=cat()?.factoryProfiles||{},profile=requestedType?profiles[requestedType]||null:null;
  const downstream=cat()?.downstreamFactoryRecipes||{};
  const requestedRecipeId=String(input.recipeId||'').trim();
  let selected=requestedRecipeId?downstream[requestedRecipeId]||null:null;
  let rid=tok(input.resourceId);
  if(!selected&&requestedType){
    const candidates=Object.values(downstream).filter(row=>String(row?.factoryType||'').toUpperCase()===requestedType);
    selected=candidates.find(row=>rid&&Object.keys(row?.inputs||{}).some(key=>tok(key)===rid))||
      candidates.find(row=>String(row?.recipeId||'')===String(profile?.defaultRecipeId||''))||candidates[0]||null;
  }
  let rule;
  if(selected){
    if(requestedType&&String(selected.factoryType||'').toUpperCase()!==requestedType)
      return{status:'BLOCKED',reason:'FACTORY_RECIPE_TYPE_MISMATCH',factoryType:requestedType,recipeId:selected.recipeId};
    const recipeInputs=Object.keys(selected.inputs||{}).map(tok);
    if(rid&&!recipeInputs.includes(rid))
      return{status:'BLOCKED',reason:'FACTORY_RECIPE_RESOURCE_MISMATCH',factoryType:selected.factoryType,recipeId:selected.recipeId,resourceId:rid,acceptedInputs:recipeInputs};
    rid=rid||recipeInputs[0]||'';
    rule={...clone(selected),recipeAuthority:selected.recipeAuthority||'SIMULATED_GAMEPLAY_RULE',
      recipeMode:recipeInputs.length>1?'MULTI_INPUT':'SINGLE_INPUT'};
  }else{
    if(!rid)return{status:'BLOCKED',reason:'FACTORY_RESOURCE_REQUIRED'};
    rule=recipeFor(rid,{});
    if(requestedType&&String(rule.factoryType||'').toUpperCase()!==requestedType)
      return{status:'BLOCKED',reason:'FACTORY_TYPE_RESOURCE_MISMATCH',requestedFactoryType:requestedType,expectedFactoryType:rule.factoryType,resourceId:rid};
    if(rule.recipeAuthority==='SIMULATED_GENERIC_FALLBACK'&&!input.allowSimulationFallback)
      return{status:'BLOCKED',reason:'UNVERIFIED_GENERIC_RECIPE_REQUIRES_EXPLICIT_SIMULATION_OPT_IN',resourceId:rid};
  }
  if(!Object.keys(rule.inputs||{}).length||!Object.keys(rule.outputs||{}).length)
    return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  const factoryType=String(rule.factoryType||requestedType||'').trim().toUpperCase();
  const typeProfile=profiles[factoryType]||profile||{};
  const catalogProfile=Object.prototype.hasOwnProperty.call(profiles,factoryType);
  let constructionMaterialQuote=null;
  if(catalogProfile){
    constructionMaterialQuote=factoryConstructionMaterialQuote(cid,typeProfile);
    if(constructionMaterialQuote.status!=='QUOTED')return{...constructionMaterialQuote,status:'BLOCKED',projectType:'FACTORY_CONSTRUCTION'};
  }
  const contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||cat()?.contractorTypes?.DOMESTIC_EPC;
  const profileDays=num(typeProfile.constructionDays),requestedDays=num(input.buildDays),requestedMonths=num(input.buildMonths);
  const projectStartDate=factoryCurrentGameDate();
  const exactMonthTarget=requestedMonths!==null&&requestedMonths>0&&projectStartDate
    ?factoryAddCalendarMonths(projectStartDate,Math.max(1,Math.round(requestedMonths))):null;
  const exactMonthDays=exactMonthTarget?factoryCalendarDaysBetween(projectStartDate,exactMonthTarget):null;
  const baseDays=exactMonthDays!==null&&exactMonthDays>0?exactMonthDays:Math.max(30,requestedDays||profileDays||Number(rule.cycleDays||1)*60+90);
  const constructionBonus=num(cr?.constructionBonus)||0;
  const days=baseDays*(1-constructionBonus);
  const estimatedCompletionDate=exactMonthTarget&&constructionBonus===0?exactMonthTarget:
    (projectStartDate?factoryAddGameDays(projectStartDate,Math.ceil(days-1e-9)):null);
  const configuredCost=num(typeProfile.constructionCost),requestedCost=num(input.cost);
  const configuredCapacity=num(typeProfile.defaultCapacityPerDay),requestedCapacity=num(input.capacityPerDay??input.throughputPerDay);
  const technologyIds=Array.isArray(input.requiredTechnologyIds)?input.requiredTechnologyIds.map(x=>String(x).toUpperCase()):
    (Array.isArray(typeProfile.requiredTechnologyIds)?typeProfile.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[]);
  const project={projectId:'FACTORY:'+cid+':'+factoryType+':'+(rule.recipeId||rid)+':T'+turn()+':'+h32(JSON.stringify(input)),
    projectType:'FACTORY_CONSTRUCTION',countryId:cid,resourceId:rid,factoryType,
    recipeId:rule.recipeId||requestedRecipeId||null,recipeMode:rule.recipeMode|| (Object.keys(rule.inputs||{}).length>1?'MULTI_INPUT':'SINGLE_INPUT'),
    recipeAuthority:rule.recipeAuthority||'INDUSTRIAL_CATALOG_RULE',factoryProfile:clone(typeProfile),
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid),
    cost:Math.max(1,requestedCost||configuredCost||1000),costUnit:typeProfile.unit||'GAME_CURRENCY_UNITS',
    durationDays:Number(days.toFixed(2)),durationMonthsRequested:exactMonthTarget?Math.max(1,Math.round(requestedMonths)):null,
    startDate:projectStartDate,estimatedCompletionDate,estimatedCommissioningDate:estimatedCompletionDate,
    startTurn:turn(),progressDays:0,status:'UNDER_CONSTRUCTION',
    capacityPerDay:Math.max(1,requestedCapacity||configuredCapacity||500),recipe:clone(rule),
    factoryId:String(input.factoryId||('FAC:'+cid+':'+factoryType+':T'+turn()+':P'+n.projects.length+':'+h32(String(turn())+'|'+(rule.recipeId||rid)+'|'+n.projects.length))),
    targetLocationNodeKey:input.locationNodeKey||('INDUSTRIAL_ZONE:'+cid),foreignContract:contractor!=='DOMESTIC_EPC',
    requiredTechnologyIds:technologyIds,technologyPackage:clone(input.technologyPackage||null),
    constructionMaterialsAuthority:constructionMaterialQuote?.authority||'SIMULATED_GENERIC_FACTORY_RECIPE_WITHOUT_CATALOG_BOM',
    constructionMaterialUnit:constructionMaterialQuote?.unit||typeProfile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
    materialsRequired:constructionMaterialQuote?clone(constructionMaterialQuote.materials.map(row=>({resourceId:row.resourceId,quantity:row.required,unit:row.unit}))):[],
    materialAllocations:[],constructionMaterialsStatus:constructionMaterialQuote?'PENDING_CONSUMPTION':'NOT_APPLICABLE',
    employmentProfile:clone(typeProfile.employment||null),requestId:String(input.requestId||''),
    authority:'SIMULATED_FACTORY_CONSTRUCTION_PROJECT',simulationOnly:true};
  if(constructionMaterialQuote){
    const materialAllocations=[];
    for(const material of constructionMaterialQuote.materials)
      materialAllocations.push(...consumeFactoryConstructionMaterial(cid,material.resourceId,material.required,project.projectId,constructionMaterialQuote.unit));
    project.materialAllocations=clone(materialAllocations);project.constructionMaterialsStatus='CONSUMED';project.constructionMaterialsConsumedTurn=turn();
  }
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);
  emit('OMEGA_FACTORY_PROJECT_STARTED',cid,project);return project;
}
function startInfrastructureProject(input={}){
  const cid=canonicalCountry(input.countryId),type=tok(input.infrastructureType||'road'),ir=infraRules()[type];
  if(!cid)return{status:'BLOCKED',reason:'INFRASTRUCTURE_COUNTRY_INVALID'};
  if(!ir)return{status:'BLOCKED',reason:'INFRASTRUCTURE_TYPE_UNDEFINED'};
  const n=netState(cid),requestId=String(input.requestId||'').trim();
  if(requestId){const previous=n.projects.find(row=>row.projectType==='INFRASTRUCTURE'&&String(row.requestId||'')===requestId&&['UNDER_CONSTRUCTION','COMPLETED'].includes(String(row.status||'')));if(previous)return{...clone(previous),idempotent:true};}
  const utilityType=type==='power'||type==='water';
  const distance=utilityType?0:Math.max(0,num(input.distanceKm)||1),contractor=String(input.contractorType||'DOMESTIC_EPC'),cr=cat()?.contractorTypes?.[contractor]||{};
  const requestedDays=input.buildDays==null?null:num(input.buildDays);
  const days=Math.max(30,utilityType?Math.max(0,requestedDays||num(ir.buildDays)||180):
    (num(ir.buildDays)||180)*(distance/Math.max(1,num(input.distanceReferenceKm)||10))*(1-(num(cr?.constructionBonus)||0)));
  const requestedCapacity=input.capacityPerDay==null?null:num(input.capacityPerDay);
  const capacityAdd=requestedCapacity===null?num(ir.capacityPerDay):requestedCapacity;
  if(capacityAdd===null||!Number.isFinite(capacityAdd)||capacityAdd<=0)
    return{status:'BLOCKED',reason:'INFRASTRUCTURE_CAPACITY_MUST_BE_POSITIVE',infrastructureType:type,capacityPerDay:input.capacityPerDay};
  const fixed=num(ir.costFixed)||0,perKm=num(ir.costPerKm)||0,requestedCost=input.cost==null?null:num(input.cost);
  const project={projectId:'INFRA:'+cid+':'+type+':T'+turn()+':'+h32(JSON.stringify(input)),requestId:requestId||null,
    projectType:'INFRASTRUCTURE',countryId:cid,infrastructureType:type,distanceKm:distance,capacityAddPerDay:capacityAdd,
    capacityUnit:ir.capacityUnit||'SIMULATION_RESOURCE_UNITS_PER_DAY',
    cost:Math.max(1,requestedCost==null?(perKm*distance+fixed):requestedCost),durationDays:Number(days.toFixed(2)),
    progressDays:0,startTurn:turn(),status:'UNDER_CONSTRUCTION',simulationOnly:true,
    authority:utilityType?'SIMULATED_UTILITY_INFRASTRUCTURE_PROJECT':'SIMULATED_TRANSPORT_INFRASTRUCTURE_PROJECT',
    fromNode:input.fromNode||null,toNode:input.toNode||null,corridorId:input.corridorId||null,
    contractorType:contractor,contractorCountryId:canonicalCountry(input.contractorCountryId||cid)};
  n.projects.push(project);n.projects=n.projects.slice(-MAX_PROJECTS);emit('OMEGA_INFRASTRUCTURE_PROJECT_STARTED',cid,project);return project;
}
function startPadmaCorridorProject(input={}){
  if(canonicalCountry(input.countryId)!=='BGD')return{status:'BLOCKED',reason:'PADMA_CORRIDOR_IS_BGD_SPECIFIC'};
  return startInfrastructureProject({...input,countryId:'BGD',infrastructureType:'bridge',distanceKm:num(input.distanceKm)||6.15,capacityPerDay:num(input.capacityPerDay)||60000,corridorId:'PADMA_EAST_WEST',fromNode:input.fromNode||'PADMA_WEST_GATEWAY',toNode:input.toNode||'PADMA_EAST_GATEWAY',contractorType:input.contractorType||'DOMESTIC_EPC'});
}
function advanceProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),completed=[],technologyCompleted=advanceTechnologyProjects(cid);
  for(const p of n.projects){
    if(p.status!=='UNDER_CONSTRUCTION')continue;
    const step=daysPerTurn()*(p.contractorType==='FOREIGN_EPC'?1.10:1);
    p.progressDays=Math.min(num(p.durationDays)||1,(num(p.progressDays)||0)+step);
    p.progressPct=(p.progressDays/(num(p.durationDays)||1));
    if(p.progressPct<1)continue;
    p.status='COMPLETED';p.completedTurn=turn();p.actualCompletionDate=factoryCurrentGameDate()||p.estimatedCompletionDate;completed.push(clone(p));
    if(p.projectType==='MINE_CONSTRUCTION'){
      const asset=commissionMineProject(cid,p);
      p.mineAssetId=asset.mineId;p.commissionedTurn=turn();p.assetStatus=asset.status;
    }else if(p.projectType==='FACTORY_CONSTRUCTION'){
      const econ=econState(cid);econ.productionAssets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
      const techReady=(p.requiredTechnologyIds||[]).every(t=>resourceState(cid).technologyCapabilities?.some(x=>tok(x?.technologyId).toUpperCase()===tok(t)));
      const assetStatus=techReady?'OPERATIONAL':'TECHNOLOGY_LOCKED';
      const factoryProfile=p.factoryProfile||cat()?.factoryProfiles?.[normalizeFactoryType(p.factoryType)]||{};
      econ.productionAssets.push({id:p.factoryId,countryId:cid,stage:'PROCESSING',factoryType:p.factoryType,
        recipeId:p.recipeId||p.recipe?.recipeId||null,recipeMode:p.recipeMode||p.recipe?.recipeMode||'SINGLE_INPUT',
        recipeAuthority:p.recipeAuthority||p.recipe?.recipeAuthority||'INDUSTRIAL_CATALOG_RULE',
        capacity:inputCapacityFromFactory(p),capacityPerDay:inputCapacityFromFactory(p),locationNodeKey:p.targetLocationNodeKey,status:assetStatus,
        inputCoefficients:p.recipe.inputs,outputProfile:p.recipe.outputs,cycleDays:p.recipe.cycleDays,
        inputInventory:{},inputBatchLots:[],inputUnit:p.recipe?.inputUnit||factoryProfile.inputUnit||null,
        productionHealth:{status:'STOPPED',productivityPct:0,reason:'NO_FACTORY_INPUTS',missingInputs:Object.keys(p.recipe?.inputs||{}),updatedTurn:turn(),authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'},
        outputUnit:p.recipe?.outputUnit||factoryProfile.outputUnit||null,
        requireTrackedInputs:p.recipeMode==='MULTI_INPUT'||factoryProfile.requireTrackedInputs===true,
        workforce:clone(factoryProfile.workforce||{}),employmentProfile:clone(factoryProfile.employment||p.employmentProfile||null),
        utilityRequirements:clone(factoryProfile.utilities||{}),
        requiredInfrastructure:clone(factoryProfile.requiredInfrastructure||[]),companyId:'EPC_FACTORY_OWNER',
        simulationOnly:true,authority:'SIMULATED_FACTORY_ASSET',transportAccess:['road','rail','ship'],commissionedTurn:turn(),
        requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
      emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:p.factoryId,capacity:inputCapacityFromFactory(p),projectId:p.projectId,status:assetStatus});
      if(assetStatus==='TECHNOLOGY_LOCKED')emit('OMEGA_FACTORY_TECHNOLOGY_BLOCKED',cid,{factoryId:p.factoryId,requiredTechnologyIds:clone(p.requiredTechnologyIds||[])});
    }else if(p.infrastructureType==='power'||p.infrastructureType==='water'){
      const ts=transportState(cid);ts.infrastructure=ts.infrastructure||{};
      const supply=ts.infrastructure.utilitySupply&&typeof ts.infrastructure.utilitySupply==='object'?ts.infrastructure.utilitySupply:
        (ts.infrastructure.utilitySupply={electricityMWhPerDay:0,waterM3PerDay:0,assets:[],authority:'SIMULATED_COMPLETED_UTILITY_PROJECTS',status:'AVAILABLE',simulationOnly:true});
      if(!Array.isArray(supply.assets))supply.assets=[];
      const amount=Math.max(0,num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='power')supply.electricityMWhPerDay=Number(((num(supply.electricityMWhPerDay)||0)+amount).toFixed(6));
      else supply.waterM3PerDay=Number(((num(supply.waterM3PerDay)||0)+amount).toFixed(6));
      supply.authority='SIMULATED_COMPLETED_UTILITY_PROJECTS';supply.status='AVAILABLE';supply.lastUpdatedTurn=turn();
      supply.assets.push({projectId:p.projectId,infrastructureType:p.infrastructureType,capacityPerDay:amount,capacityUnit:p.capacityUnit,
        completedTurn:turn(),status:'OPERATIONAL',authority:'SIMULATED_INFRASTRUCTURE_PROJECT',simulationOnly:true});
      while(supply.assets.length>512)supply.assets.shift();
      const key=p.infrastructureType==='power'?'powers':'waters';
      ts.infrastructure[key]=ts.infrastructure[key]||{capacityPerDay:0};
      ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+amount;
      ts.infrastructure[key].status='OPERATIONAL';ts.infrastructure[key].capacityUnit=p.capacityUnit;
      emit('OMEGA_INDUSTRIAL_UTILITY_SUPPLY_CHANGED',cid,{projectId:p.projectId,infrastructureType:p.infrastructureType,
        capacityPerDay:amount,capacityUnit:p.capacityUnit,supply:clone(supply),status:'AVAILABLE',simulationOnly:true});
    }else{
      const ts=transportState(cid),ir=infraRules()[p.infrastructureType]||{};ts.infrastructure=ts.infrastructure||{};
      const key=p.infrastructureType+'s';ts.infrastructure[key]=ts.infrastructure[key]||{};ts.infrastructure[key].capacityPerDay=(num(ts.infrastructure[key].capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);
      if(p.infrastructureType==='bridge'){ts.infrastructure.bridges=ts.infrastructure.bridges||{};ts.infrastructure.bridges.capacityPerDay=(num(ts.infrastructure.bridges.capacityPerDay)||0)+(num(p.capacityAddPerDay)||0);}
      if(p.corridorId)n.infrastructure.corridors[p.corridorId]={status:'OPERATIONAL',fromNode:p.fromNode,toNode:p.toNode,capacityPerDay:p.capacityAddPerDay,infrastructureType:p.infrastructureType};
      emit('OMEGA_TRANSPORT_INFRASTRUCTURE_COMPLETED',cid,p);
    }
    emit('OMEGA_PROJECT_COMPLETED',cid,p);
  }
  const employment=reconcileFactoryEmployment(cid);
  return{status:'ADVANCED',countryId:cid,completed,technologyCompleted,employment};
}
function inputCapacityFromFactory(p){
  return Math.max(1,num(p.capacityPerDay)||num(p.capacity)||1000);
}

function startTechnologyProject(input={}){
  const cid=canonicalCountry(input.countryId),technologyId=tok(input.technologyId).toUpperCase(),spec=techRules()[technologyId];
  if(!spec)return{status:'BLOCKED',reason:'TECHNOLOGY_PROJECT_UNDEFINED'};
  const mode=String(input.mode||'RESEARCH').toUpperCase(),donor=canonicalCountry(input.donorCountryId||input.contractorCountryId),contractor=String(input.contractorType||'DOMESTIC_EPC');
  if(mode==='IMPORT'&&!donor&&contractor!=='SPECIALIST_FOREIGN_TECH_VENDOR')return{status:'BLOCKED',reason:'DONOR_COUNTRY_OR_VENDOR_REQUIRED'};
  const donorCaps=donor?Array.isArray(resourceState(donor).technologyCapabilities)?resourceState(donor).technologyCapabilities:[]:[];
  if(mode==='IMPORT'&&!donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===technologyId)&&contractor!=='SPECIALIST_FOREIGN_TECH_VENDOR')return{status:'BLOCKED',reason:'DONOR_TECHNOLOGY_NOT_AVAILABLE'};
  const donorCapabilityVerified=mode==='IMPORT'&&(contractor==='SPECIALIST_FOREIGN_TECH_VENDOR'||donorCaps.some(x=>tok(x?.technologyId).toUpperCase()===technologyId));
  const contract={projectId:'TECH:'+cid+':'+technologyId+':T'+turn()+':'+h32(JSON.stringify(input)),countryId:cid,technologyId,mode,
    durationTurns:mode==='IMPORT'?spec.importTurns:spec.researchTurns,cost:mode==='IMPORT'?spec.importCost:spec.researchCost,donorCountryId:donor||null,
    contractorType:contractor,status:'IN_PROGRESS',startTurn:turn(),targetSiteId:input.targetSiteId||'*',targetResourceId:tok(input.resourceId||'*'),
    targetSiteType:input.siteType||'*',effects:clone(spec.effects||{}),donorCapabilityVerified};
  netState(cid).technologyContracts.push(contract);emit('OMEGA_RESOURCE_TECHNOLOGY_PROJECT_STARTED',cid,contract);return contract;
}
function refreshTechnologyGatedFactories(c){
  const cid=canonicalCountry(c),caps=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[],
    available=new Set(caps.map(x=>tok(x?.technologyId).toUpperCase()).filter(Boolean));
  for(const asset of factoryAssets(cid)){
    if(String(asset.status).toUpperCase()!=='TECHNOLOGY_LOCKED')continue;
    const req=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds.map(x=>tok(x).toUpperCase()).filter(Boolean):[];
    if(req.length&&req.every(t=>caps.some(row=>tok(row?.technologyId).toUpperCase()===t&&technologyCapabilityAvailable(row)))){
      asset.status='OPERATIONAL';asset.technologyUnlockedTurn=turn();
      emit('OMEGA_FACTORY_TECHNOLOGY_UNLOCKED',cid,{factoryId:asset.id,requiredTechnologyIds:clone(req)});
    }
  }
}
function advanceTechnologyProjects(c){
  const cid=canonicalCountry(c),n=netState(cid),r=resourceState(cid),completed=[];
  r.technologyCapabilities=Array.isArray(r.technologyCapabilities)?r.technologyCapabilities:[];
  for(const p of n.technologyContracts){
    if(String(p.status).toUpperCase()!=='IN_PROGRESS')continue;
    const elapsed=turn()-Number(p.startTurn||turn());
    if(elapsed<Number(p.durationTurns||1))continue;
    if(p.mode==='IMPORT'&&!p.donorCapabilityVerified){p.status='BLOCKED';p.blockReason='DONOR_CAPABILITY_NOT_VERIFIED';continue;}
    const capability={technologyId:p.technologyId,targetSiteId:p.targetSiteId,targetResourceId:p.targetResourceId,targetSiteType:p.targetSiteType,
      sourceType:p.mode==='IMPORT'?'IMPORTED':'RESEARCH',donorCountryId:p.donorCountryId||null,effects:clone(p.effects),status:'COMPLETE',completedTurn:turn()};
    if(!r.technologyCapabilities.some(x=>tok(x?.technologyId).toUpperCase()===tok(p.technologyId)&&String(x?.targetResourceId||'*')===String(p.targetResourceId||'*'))){
      r.technologyCapabilities.push(capability);
    }
    p.status='COMPLETE';p.completedTurn=turn();completed.push(clone(capability));
    refreshTechnologyGatedFactories(cid);
    emit('OMEGA_RESOURCE_TECHNOLOGY_COMPLETED',cid,capability);
  }
  return completed;
}

function currentTurnLedgerBucket(countryId,ledgerName,initialBucket){
  const network=netState(countryId);
  let ledger=network[ledgerName];
  if(!ledger||typeof ledger!=='object'||Array.isArray(ledger))ledger=network[ledgerName]={schemaVersion:VERSION,turns:{}};
  if(!ledger.turns||typeof ledger.turns!=='object'||Array.isArray(ledger.turns))ledger.turns={};
  const currentTurn=Math.max(0,Number(turn())||0),key=String(currentTurn);
  for(const oldKey of Object.keys(ledger.turns)){
    const oldTurn=Number(oldKey);
    if(Number.isFinite(oldTurn)&&oldTurn<currentTurn-30)delete ledger.turns[oldKey];
  }
  let bucket=ledger.turns[key];
  if(!bucket||typeof bucket!=='object'||Array.isArray(bucket)){
    // Avoid object-spread initialization here: the Android 9 WebView path can throw
    // from the transpiled spread helper while the utility ledger is first created.
    const defaults=clone(initialBucket||{});
    bucket=defaults&&typeof defaults==='object'&&!Array.isArray(defaults)?defaults:{};
    bucket.turn=currentTurn;
    ledger.turns[key]=bucket;
  }
  bucket.turn=currentTurn;
  return bucket;
}
function utilityTurnBucket(countryId){
  const bucket=currentTurnLedgerBucket(countryId,'utilityLedger',{used:{electricityMWh:0,waterM3:0},transactions:[]});
  bucket.used=bucket.used&&typeof bucket.used==='object'?bucket.used:{};
  bucket.used.electricityMWh=Math.max(0,num(bucket.used.electricityMWh)||0);
  bucket.used.waterM3=Math.max(0,num(bucket.used.waterM3)||0);
  bucket.transactions=Array.isArray(bucket.transactions)?bucket.transactions:[];
  return bucket;
}
function transportTurnBucket(countryId){
  const bucket=currentTurnLedgerBucket(countryId,'transportCapacityLedger',{usedByMode:{},shipments:[]});
  bucket.usedByMode=bucket.usedByMode&&typeof bucket.usedByMode==='object'?bucket.usedByMode:{};
  bucket.shipments=Array.isArray(bucket.shipments)?bucket.shipments:[];
  return bucket;
}
function technologyCapabilityAvailable(row){
  return ['COMPLETE','COMPLETED','AVAILABLE','UNLOCKED','OPERATIONAL','ACTIVE'].includes(String(row?.status||'').trim().toUpperCase());
}
function utilitySupplyValues(countryId){
  const infra=transportState(countryId).infrastructure||{};
  const supply=infra.utilitySupply&&typeof infra.utilitySupply==='object'?infra.utilitySupply:{};
  const power=supply.electricityMWhPerDay==null?null:num(supply.electricityMWhPerDay);
  const water=supply.waterM3PerDay==null?null:num(supply.waterM3PerDay);
  return{power:power!==null&&power>=0?power:null,water:water!==null&&water>=0?water:null,
    authority:supply.authority||null,status:supply.status||'NOT_RECORDED',assets:Array.isArray(supply.assets)?supply.assets:[]};
}
function previewFactoryUtilityUse(countryId,asset,productionQuantity){
  const cid=canonicalCountry(countryId),factoryId=String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||'');
  const type=normalizeFactoryType(asset?.factoryType||asset?.type||asset?.facilityType||'');
  const profile=(cat()?.factoryProfiles||{})[type]||{};
  const utilities=asset?.utilityRequirements&&typeof asset.utilityRequirements==='object'&&
    (asset.utilityRequirements.electricityMWhPerDay!=null||asset.utilityRequirements.waterM3PerDay!=null)
      ?asset.utilityRequirements:profile.utilities;
  const powerDaily=utilities?.electricityMWhPerDay==null?null:num(utilities.electricityMWhPerDay);
  const waterDaily=utilities?.waterM3PerDay==null?null:num(utilities.waterM3PerDay);
  if(powerDaily===null||waterDaily===null||powerDaily<0||waterDaily<0)
    return{status:'BLOCKED',reason:'FACTORY_UTILITY_PROFILE_NOT_RECORDED',countryId:cid,factoryId, factoryType:type};
  const capacityRaw=asset?.capacityPerDay??asset?.capacity??asset?.productionCapacity??asset?.throughput;
  const capacity=capacityRaw==null?null:num(capacityRaw);
  const quantity=num(productionQuantity);
  if(capacity===null||capacity<=0||quantity===null||quantity<=0)
    return{status:'BLOCKED',reason:'FACTORY_UTILITY_CAPACITY_INVALID',countryId:cid,factoryId,capacity,productionQuantity};
  const fraction=Math.min(1,quantity/capacity);
  const required={electricityMWh:Number((powerDaily*fraction).toFixed(6)),waterM3:Number((waterDaily*fraction).toFixed(6))};
  const supply=utilitySupplyValues(cid),bucket=utilityTurnBucket(cid);
  const used={electricityMWh:bucket.used.electricityMWh,waterM3:bucket.used.waterM3};
  const checks=[
    {key:'electricityMWh',label:'ELECTRICITY',supply:supply.power,unit:'MWh',required:required.electricityMWh,used:used.electricityMWh},
    {key:'waterM3',label:'INDUSTRIAL_WATER',supply:supply.water,unit:'M3',required:required.waterM3,used:used.waterM3}
  ];
  const missing=checks.filter(x=>x.required>1e-9&&x.supply===null);
  if(missing.length)return{status:'BLOCKED',reason:'FACTORY_UTILITY_SUPPLY_NOT_RECORDED',countryId:cid,factoryId,
    missingUtilities:missing.map(x=>x.label),required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water}};
  const shortages=checks.filter(x=>x.required>1e-9&&x.supply!==null&&x.supply-x.used+1e-9<x.required);
  if(shortages.length)return{status:'BLOCKED',reason:'FACTORY_UTILITY_SHORTAGE',countryId:cid,factoryId,
    shortages:shortages.map(x=>({utility:x.label,required:x.required,available:Math.max(0,x.supply-x.used),supply:x.supply,used:x.used,unit:x.unit})),
    required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water}};
  return{status:'READY',countryId:cid,factoryId,factoryType:type,turn:turn(),capacity,productionQuantity,
    utilizationFraction:fraction,required,used,supply:{electricityMWhPerDay:supply.power,waterM3PerDay:supply.water},
    supplyAuthority:supply.authority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE'};
}
function commitFactoryUtilityUse(countryId,asset,preview,transactionId){
  const cid=canonicalCountry(countryId),bucket=utilityTurnBucket(cid);
  bucket.used.electricityMWh=Number((bucket.used.electricityMWh+preview.required.electricityMWh).toFixed(6));
  bucket.used.waterM3=Number((bucket.used.waterM3+preview.required.waterM3).toFixed(6));
  const row={transactionId:String(transactionId),factoryId:String(asset?.id||asset?.assetId||asset?.factoryId||asset?.projectId||''),
    countryId:cid,turn:turn(),electricityMWh:preview.required.electricityMWh,waterM3:preview.required.waterM3,
    electricityUnit:'MWh',waterUnit:'M3',authority:'SIMULATED_UTILITY_CONSUMPTION_LEDGER',
    supplyAuthority:preview.supplyAuthority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE'};
  bucket.transactions.push(row);while(bucket.transactions.length>1024)bucket.transactions.shift();
  asset.lastUtilityConsumptionTurn=turn();asset.lastUtilityConsumptionTransactionId=String(transactionId);
  emit('OMEGA_FACTORY_UTILITY_CONSUMED',cid,row);
  return clone(row);
}
function previewTransportCapacity(countryId,route,requestedQuantity){
  const cid=canonicalCountry(countryId),quantity=num(requestedQuantity);
  if(quantity===null||quantity<=0)return{status:'BLOCKED',reason:'TRANSPORT_QUANTITY_INVALID',requestedQuantity};
  const legs=Array.isArray(route?.legs)?route.legs:(Array.isArray(route?.vehiclePlan)?route.vehiclePlan:[]);
  const modes=legs.map(row=>tok(row?.mode||row?.transportMode)).filter(Boolean);
  if(!modes.length)return{status:'BLOCKED',reason:'TRANSPORT_ROUTE_HAS_NO_LEGS',routeId:route?.routeId||null};
  const counts={};for(const mode of modes)counts[mode]=(counts[mode]||0)+1;
  const bucket=transportTurnBucket(cid),constraints=[];
  let allowed=quantity;
  for(const [mode,count] of Object.entries(counts)){
    const infra=infraQuality(cid,mode),capacity=Math.max(0,infra.capacityPerDay*infra.quality);
    const used=Math.max(0,num(bucket.usedByMode[mode])||0),remaining=Math.max(0,capacity-used);
    const modeAllowed=count>0?remaining/count:0;allowed=Math.min(allowed,modeAllowed);
    constraints.push({mode,legs:count,capacityPerTurn:capacity,usedThisTurn:used,availableThisTurn:remaining,
      maximumQuantityForRoute:modeAllowed,unit:'SIMULATION_RESOURCE_UNITS_PER_TURN'});
  }
  allowed=Number(Math.max(0,allowed).toFixed(6));
  if(allowed<=1e-9)return{status:'BLOCKED',reason:'TRANSPORT_CAPACITY_EXHAUSTED',countryId:cid,turn:turn(),
    routeId:route?.routeId||null,requestedQuantity:quantity,allowedQuantity:0,constraints};
  return{status:'READY',countryId:cid,turn:turn(),routeId:route?.routeId||null,requestedQuantity:quantity,
    allowedQuantity:allowed,adjusted:allowed+1e-6<quantity,constraints,
    authority:'SIMULATED_SHARED_TRANSPORT_CAPACITY_LEDGER'};
}
function commitTransportCapacity(countryId,route,quantity,shipmentId){
  const cid=canonicalCountry(countryId),bucket=transportTurnBucket(cid);
  const legs=Array.isArray(route?.legs)?route.legs:(Array.isArray(route?.vehiclePlan)?route.vehiclePlan:[]);
  const counts={};for(const row of legs){const mode=tok(row?.mode||row?.transportMode);if(mode)counts[mode]=(counts[mode]||0)+1;}
  for(const [mode,count] of Object.entries(counts))
    bucket.usedByMode[mode]=Number(((num(bucket.usedByMode[mode])||0)+quantity*count).toFixed(6));
  const row={shipmentId:String(shipmentId),countryId:cid,turn:turn(),quantity,
    useByMode:Object.fromEntries(Object.entries(counts).map(([mode,count])=>[mode,Number((quantity*count).toFixed(6))])),
    authority:'SIMULATED_SHARED_TRANSPORT_CAPACITY_LEDGER'};
  bucket.shipments.push(row);while(bucket.shipments.length>1024)bucket.shipments.shift();
  return clone(row);
}
function factoryUtilityDiagnostics(countryId){
  const cid=canonicalCountry(countryId);if(!cid)return{status:'BLOCKED',reason:'FACTORY_UTILITY_COUNTRY_INVALID'};
  const supply=utilitySupplyValues(cid),bucket=utilityTurnBucket(cid),transport=transportTurnBucket(cid);
  const utility=(value,used,unit)=>({supply:value,usedThisTurn:used,availableThisTurn:value===null?null:Math.max(0,value-used),unit,
    status:value===null?'NOT_RECORDED':(value-used<=1e-9?'DEPLETED_THIS_TURN':'AVAILABLE'),
    authority:supply.authority||'COMPLETED_UTILITY_PROJECTS_OR_EXPLICIT_GAME_STATE',simulationOnly:true});
  const transportCapacity={};
  for(const mode of ['truck','rail','ship','barge','pipeline']){
    const q=infraQuality(cid,mode),capacity=Math.max(0,q.capacityPerDay*q.quality),used=Math.max(0,num(transport.usedByMode[mode])||0);
    transportCapacity[mode]={capacityPerTurn:capacity,usedThisTurn:used,availableThisTurn:Math.max(0,capacity-used),
      unit:'SIMULATION_RESOURCE_UNITS_PER_TURN',quality:q.quality,authority:'SIMULATED_INFRASTRUCTURE_MODEL'};
  }
  const employment=econState(cid).factoryEmployment||null;
  return{status:supply.power===null||supply.water===null?'DEGRADED':'HEALTHY',countryId:cid,turn:turn(),
    electricityMWhPerDay:supply.power,electricity:utility(supply.power,bucket.used.electricityMWh,'MWh/day'),
    waterM3PerDay:supply.water,water:utility(supply.water,bucket.used.waterM3,'m3/day'),
    utilityAuthority:supply.authority||'NOT_RECORDED',utilityAssets:clone(supply.assets),
    transportCapacity,transportShipmentsThisTurn:transport.shipments.length,
    workforce:employment?{status:employment.status,unemployedCount:employment.unemployedCount,
      jobsSupported:employment.jobsSupported,jobsFilled:employment.jobsFilled,vacancies:employment.vacancies,
      authority:employment.authority||'NOT_RECORDED'}:{status:'NOT_RECORDED',authority:'NOT_RECORDED'},
    simulationOnly:true};
}

function factoryOperationGate(countryId,asset){
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const cid=canonicalCountry(countryId),factoryId=String(asset.id||asset.assetId||asset.factoryId||asset.projectId||'');
  const status=String(asset.status||'OPERATIONAL').toUpperCase();
  if(['CLOSED','DECOMMISSIONED','TECHNOLOGY_LOCKED','BLOCKED','UNDER_CONSTRUCTION','MAINTENANCE'].includes(status))
    return{status:'BLOCKED',reason:'FACTORY_NOT_OPERATIONAL',factoryId,factoryStatus:status};
  const required=Array.isArray(asset.requiredTechnologyIds)?asset.requiredTechnologyIds.map(x=>String(x).toUpperCase()):[];
  const capabilities=Array.isArray(resourceState(cid).technologyCapabilities)?resourceState(cid).technologyCapabilities:[];
  const missing=required.filter(id=>!capabilities.some(row=>String(row?.technologyId||'').trim().toUpperCase()===id&&technologyCapabilityAvailable(row)));
  if(missing.length)return{status:'BLOCKED',reason:'FACTORY_TECHNOLOGY_REQUIREMENT_NOT_MET',factoryId,missingTechnologyIds:missing};
  const employmentSummary=reconcileFactoryEmployment(cid);
  const employmentModel=econState(cid).factoryEmployment||{};
  const employment=employmentModel.factories?.[factoryId]||asset.employment||{};
  if(employmentSummary?.baselineUnemployedCount==null||employmentModel.status==='UNEMPLOYMENT_HEADCOUNT_UNAVAILABLE')
    return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_NOT_RECORDED',factoryId,
      requiredWorkers:num((cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||'')]?.employment?.coreOperatingCrew)||null,
      authority:employmentModel.unemploymentSource||'NOT_RECORDED'};
  const profile=(cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||asset.facilityType||'')]||{};
  const requiredCrew=Math.max(1,num(profile.employment?.coreOperatingCrew)||
    ((num(profile.workforce?.operators)||0)+(num(profile.workforce?.engineers)||0))||
    (num(asset.workforce?.operators)||0)+(num(asset.workforce?.engineers)||0));
  const workersFilled=num(employment.jobsFilled);
  if(workersFilled===null)return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_NOT_RECORDED',factoryId,requiredWorkers:requiredCrew};
  if(workersFilled<requiredCrew)return{status:'BLOCKED',reason:'FACTORY_WORKFORCE_SHORTAGE',factoryId,
    requiredWorkers:requiredCrew,workersAvailable:workersFilled,vacancies:num(employment.vacancies)??Math.max(0,requiredCrew-workersFilled)};
  return{status:'READY',factoryId,factoryStatus:status,requiredWorkers:requiredCrew,workersAvailable:workersFilled,
    workforceAuthority:employment.authority||employmentModel.authority||'SIMULATED_FACTORY_EMPLOYMENT_RECONCILIATION'};
}
function commitFactoryCycleImmediately(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||''),assets=factoryAssets(cid),asset=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const gate=factoryOperationGate(cid,asset);
  if(gate.status!=='READY')return gate;
  const requestedRecipe=recipeFor(input.resourceId||Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId,asset);
  if(asset.recipeMode==='MULTI_INPUT'||requestedRecipe.recipeMode==='MULTI_INPUT'||Object.keys(requestedRecipe.inputs||{}).length>1)
    return commitMultiInputFactoryCycleImmediately(input);
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const rid=tok(input.resourceId),recipe=recipeFor(rid,asset),r=resourceState(cid);r.inventory=r.inventory||{};
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const factoryAvailable=Math.max(0,num(factoryStock[rid])||0),countryAvailable=Math.max(0,num(r.inventory[rid])||0);
  const inputCoefficient=Math.max(1e-9,num(recipe.inputs[rid])||1);
  const cycleCapacity=Math.max(0,num(input.maxCycleQuantity)||num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  const requestedLimit=Math.min(Math.max(0,num(input.quantity)||cycleCapacity),cycleCapacity||Number.MAX_SAFE_INTEGER);
  const availableInputStock=factoryAvailable>1e-9?factoryAvailable:countryAvailable;
  const requested=Math.min(requestedLimit,availableInputStock/inputCoefficient);
  const need=requested*inputCoefficient;
  if(!(requested>1e-9))return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available:availableInputStock,source:factoryAvailable>1e-9?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const fromFactoryInput=factoryAvailable>1e-9&&factoryAvailable+1e-9>=need,available=fromFactoryInput?factoryAvailable:countryAvailable;
  if(available+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',required:need,available,source:fromFactoryInput?'FACTORY_INPUT_INVENTORY':'COUNTRY_INVENTORY'};
  const inputLots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const trackedForResource=inputLots.filter(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&Math.max(0,num(x?.remainingQuantity!=null?x.remainingQuantity:x?.quantity)||0)>1e-9&&(!input.factoryCycleId||String(x?.cycleReservationId||'')===String(input.factoryCycleId)));
  const trackedQuantity=trackedForResource.reduce((sum,x)=>sum+Math.max(0,num(x.remainingQuantity!=null?x.remainingQuantity:x.quantity)||0),0);
  if(fromFactoryInput&&trackedForResource.length&&trackedQuantity+1e-9<need)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,trackedInputQuantity:trackedQuantity,factoryInputInventory:factoryAvailable};
  const carbonPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const carbonUnit=trackedForResource.find(x=>x?.unit)?.unit||
    (Array.isArray(r.batches)?r.batches.find(x=>tok(x?.resourceId||x?.materialIdentity)===rid&&x?.unit)?.unit:null)||
    (Array.isArray(g.ResourceMinistryEngine?.resourceTypes)?g.ResourceMinistryEngine.resourceTypes.find(x=>tok(x?.id||x?.resourceId)===rid)?.unit:null);
  const utilityPreview=input.prepaidUtilityConsumption?{status:'READY',required:{electricityMWh:0,waterM3:0},prepaid:true}:previewFactoryUtilityUse(cid,asset,requested);
  if(utilityPreview.status!=='READY')return utilityPreview;
  const carbonGate=carbonPolicy?.previewCarbonActivity?.(cid,rid,need,carbonUnit,'RESOURCE_PROCESSING',null,{
    activityId:'FACTORYRUN:'+cid+':'+fid+':T'+turn(),factoryId:fid,
    siteId:trackedForResource.find(x=>x?.siteId)?.siteId||null,
    sourceId:trackedForResource.find(x=>x?.batchId)?.batchId||fid
  });
  if(carbonGate&&carbonGate.allowed===false)return{status:'BLOCKED',reason:carbonGate.reason||'CARBON_QUOTA_POLICY_BLOCKED_PROCESSING',carbonGate};
  const output={};for(const k of Object.keys(recipe.outputs))output[k]=requested*(num(recipe.outputs[k])||0);
  const sourceBatchIds=[],consumedInputs=[];let inputTrackingStatus='UNTRACKED_LEGACY_INPUT';
  if(fromFactoryInput){
    factoryStock[rid]=Math.max(0,factoryAvailable-need);
    if(trackedForResource.length){
      let remaining=need;inputTrackingStatus='TRACKED_FACTORY_INPUT_LOTS';
      for(const lot of trackedForResource){
        if(remaining<=1e-9)break;
        const prior=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0),take=Math.min(prior,remaining);
        if(take<=0)continue;
        lot.remainingQuantity=Math.max(0,prior-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';
        lot.lastMovementType='PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();
        const roots=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:(String(lot?.authority||lot?.provenance?.authority||'').includes('UNOBSERVED')||String(lot?.batchId||'').startsWith('CYCLE-LEGACY:')?[]:[lot.batchId]);
        roots.filter(Boolean).forEach(x=>sourceBatchIds.push(String(x)));
        consumedInputs.push({batchId:lot.batchId,quantity:take,sourceBatchIds:roots.filter(Boolean),stage:'FACTORY_INPUT'});remaining-=take;
      }
      if(remaining>1e-9)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',required:need,unallocated:remaining};
    }
  }else{
    let remaining=need,rawDebit=0,processedDebit=0;const batches=Array.isArray(r.batches)?r.batches:[],lots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{};
    for(const batch of batches){
      if(remaining<=1e-9)break;
      if(tok(batch?.resourceId||batch?.materialIdentity)!==rid)continue;
      const stage=String(batch?.stage||'RAW').toUpperCase();
      if(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY'].includes(stage))continue;
      const prior=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);if(prior<=0)continue;
      const take=Math.min(prior,remaining);batch.remainingQuantity=Math.max(0,prior-take);
      batch.status=batch.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';batch.lastMovementType='PROCESSING_CONSUMPTION';batch.lastMovementTurn=turn();
      if(['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage))processedDebit+=take;else rawDebit+=take;
      const lot=lots[batch.batchId];if(lot){lot.remainingQuantity=batch.remainingQuantity;lot.status=batch.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';lot.lastMovementType='PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();}
      if(batch.batchId)sourceBatchIds.push(String(batch.batchId));consumedInputs.push({batchId:batch.batchId,quantity:take,sourceBatchIds:[batch.batchId].filter(Boolean),stage:stage});remaining-=take;
    }
    if(remaining>1e-9){
      inputTrackingStatus='PARTIAL_TRACKING_WITH_LEGACY_BALANCE';
      const rawAvailable=Math.max(0,num(r.warehouse?.availableByResource?.[rid])||0),rawTake=Math.min(rawAvailable,remaining);rawDebit+=rawTake;remaining-=rawTake;
      const processedAvailable=Math.max(0,num(r.processedWarehouse?.availableByResource?.[rid])||0),processedTake=Math.min(processedAvailable,remaining);processedDebit+=processedTake;remaining-=processedTake;
      if(remaining>1e-9)consumedInputs.push({batchId:null,quantity:remaining,stage:'LEGACY_UNALLOCATED',sourceBatchIds:[]});
    }
    const rawWarehouse=r.warehouse||{};if(rawWarehouse.availableByResource)rawWarehouse.availableByResource[rid]=Math.max(0,(num(rawWarehouse.availableByResource[rid])||0)-rawDebit);
    if(r.processedWarehouse?.availableByResource)r.processedWarehouse.availableByResource[rid]=Math.max(0,(num(r.processedWarehouse.availableByResource[rid])||0)-processedDebit);
    r.warehouse=rawWarehouse;r.batches=batches;r.inventoryLots=lots;r.inventory[rid]=Math.max(0,countryAvailable-need);
  }
  asset.inputInventory=factoryStock;
  const sequence=Math.max(0,Number(n.factoryRunSequence)||0)+1;n.factoryRunSequence=sequence;
  const transactionId='FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+sequence;
  const finishedWarehouse=r.processedWarehouse||(r.processedWarehouse={warehouseId:'WH-'+cid+'-PROCESSED',countryId:cid,type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',status:'OPERATIONAL',availableByResource:{},storedBatchIds:[],receipts:[]});
  finishedWarehouse.availableByResource=finishedWarehouse.availableByResource||{};finishedWarehouse.storedBatchIds=Array.isArray(finishedWarehouse.storedBatchIds)?finishedWarehouse.storedBatchIds:[];
  finishedWarehouse.receipts=Array.isArray(finishedWarehouse.receipts)?finishedWarehouse.receipts:[];
  const batches=Array.isArray(r.batches)?r.batches:[],inventoryLots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:{},created=[];
  for(const outputId of Object.keys(output)){
    const outQty=output[outputId];if(!(outQty>0))continue;
    r.inventory[outputId]=(num(r.inventory[outputId])||0)+outQty;
    const batchId='OUTPUT:'+transactionId+':'+outputId,roots=[...new Set(sourceBatchIds.filter(Boolean))],unit=input.unit||inputLots.find(x=>tok(x.resourceId)===rid)?.unit||'TONNES';
    const row={batchId,resourceId:outputId,materialIdentity:outputId,quantity:outQty,remainingQuantity:outQty,unit,stage:'FINISHED',countryId:cid,
      sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),
      sourceBatchIds:roots,sourceFactoryId:fid,warehouseId:'WH-'+cid+'-PROCESSED',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',processId:transactionId,
      provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_PROCESSING_YIELD',processingAuthority:'SIMULATED',status:'FINISHED_GOODS_CREATED',transactionId,sourceBatchIds:roots,simulationTurn:turn()}};
    batches.push(row);created.push(row);
    inventoryLots[batchId]={batchId,resourceId:outputId,quantity:outQty,remainingQuantity:outQty,unit,stage:'FINISHED',countryId:cid,warehouseId:row.warehouseId,
      locationNodeKey:row.locationNodeKey,ownerCompanyId:row.ownerCompanyId,sourceBatchIds:roots,status:'AVAILABLE',provenance:clone(row.provenance),createdTurn:turn()};
    finishedWarehouse.availableByResource[outputId]=(num(finishedWarehouse.availableByResource[outputId])||0)+outQty;
    if(!finishedWarehouse.storedBatchIds.includes(batchId))finishedWarehouse.storedBatchIds.push(batchId);
    finishedWarehouse.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:row.warehouseId,countryId:cid,batchId,resourceId:outputId,quantity:outQty,unit,simulationTurn:turn(),status:'RECEIVED'});
  }
  while(finishedWarehouse.receipts.length>2048)finishedWarehouse.receipts.shift();while(batches.length>8192)batches.shift();
  const record={transactionId,countryId:cid,factoryId:fid,companyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),resourceId:rid,
    inputQuantity:need,inputQuantities:{[rid]:need},requestedProduction:requested,outputs:output,outputQuantities:clone(output),recipe:clone(recipe),
    cycleDays:recipe.cycleDays,turn:turn(),authority:'INDUSTRIAL_NETWORK_SIMULATION',status:'COMPLETED',inputSource:fromFactoryInput?'DELIVERED_SHIPMENT':'CENTRAL_INVENTORY',
    inputTrackingStatus,consumedInputs:clone(consumedInputs),sourceBatchIds:[...new Set(sourceBatchIds.filter(Boolean))],createdBatchIds:created.map(x=>x.batchId)};
  record.utilityConsumption=input.prepaidUtilityConsumption?clone(input.prepaidUtilityConsumption):commitFactoryUtilityUse(cid,asset,utilityPreview,transactionId);
  asset.lastProductionTurn=turn();asset.lastProductionTransactionId=transactionId;
  r.batches=batches;r.inventoryLots=inventoryLots;r.processedWarehouse=finishedWarehouse;
  processedTurns[fid]=turn();n.factoryProcessingTurns=processedTurns;
  r.finishedGoodsLedger=Array.isArray(r.finishedGoodsLedger)?r.finishedGoodsLedger:[];
  r.finishedGoodsLedger.push({transactionId,countryId:cid,factoryId:fid,companyId:record.companyId,sourceBatchIds:record.sourceBatchIds,outputQuantities:clone(output),
    createdBatchIds:record.createdBatchIds,turn:turn(),authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE_TO_ECONOMY'});
  while(r.finishedGoodsLedger.length>2048)r.finishedGoodsLedger.shift();
  const inventoryLedger=Array.isArray(r.inventoryLedger)?r.inventoryLedger:[];
  inventoryLedger.push({type:'FACTORY_PROCESSING_COMMITTED',transactionId,factoryId:fid,resourceId:rid,inputQuantity:need,outputs:clone(output),sourceBatchIds:record.sourceBatchIds,createdBatchIds:record.createdBatchIds,turn:turn()});
  while(inventoryLedger.length>2048)inventoryLedger.shift();r.inventoryLedger=inventoryLedger;
  n.factoryRuntime[fid]=record;n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);
  emit('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',cid,{transactionId,countryId:cid,factoryId:fid,companyId:record.companyId,outputs:clone(output),
    outputQuantities:clone(output),sourceBatchIds:record.sourceBatchIds,createdBatchIds:record.createdBatchIds,turn:turn(),
    authority:'SIMULATED_PROCESSING_YIELD',status:'AVAILABLE'});
  return record;
}
function commitMultiInputFactoryCycleImmediately(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const asset=factoryAssets(cid).find(a=>String(a?.id||a?.assetId||a?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND'};
  const fallbackResource=Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'';
  const requestedResource=tok(input.resourceId||fallbackResource);
  const recipe=recipeFor(requestedResource,asset),entries=Object.entries(recipe.inputs||{}).map(([id,coefficient])=>[tok(id),num(coefficient)]);
  if(entries.length<2)return{status:'BLOCKED',reason:'MULTI_INPUT_RECIPE_REQUIRED',factoryId:fid,recipeId:recipe.recipeId||null};
  if(!entries.some(([id])=>id===requestedResource))return{status:'BLOCKED',reason:'FACTORY_INPUT_NOT_IN_RECIPE',resourceId:requestedResource,recipeId:recipe.recipeId||null};
  if(entries.some(([id,coefficient])=>!id||coefficient===null||coefficient<=0))
    return{status:'BLOCKED',reason:'FACTORY_RECIPE_COEFFICIENT_INVALID',recipeId:recipe.recipeId||null};
  const n=netState(cid),processedTurns=n.factoryProcessingTurns&&typeof n.factoryProcessingTurns==='object'?n.factoryProcessingTurns:(n.factoryProcessingTurns={});
  if(Number(processedTurns[fid])===turn())return{status:'BLOCKED',reason:'FACTORY_TURN_CAPACITY_ALREADY_USED',factoryId:fid,turn:turn()};
  const capacity=Math.max(0,num(input.maxCycleQuantity)||num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  if(!(capacity>1e-9))return{status:'BLOCKED',reason:'PRODUCTION_CAPACITY_UNAVAILABLE',factoryId:fid,capacity};
  const inputLimit=Math.max(0,num(input.quantity)||capacity),limit=Math.min(capacity,inputLimit);
  const factoryStock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:[];
  const inactiveLotStatuses=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  const activeSourceLots=lots.filter(l=>{
    const status=String(l?.status||'').toUpperCase();
    return Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0)>1e-9&&!inactiveLotStatuses.has(status);
  });
  const globalBatchIds=activeSourceLots.map(l=>String(l?.batchId||'').trim()).filter(Boolean);
  if(new Set(globalBatchIds).size!==globalBatchIds.length)
    return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_ID',factoryId:fid,recipeId:recipe.recipeId||null};
  const availability=[];
  const seenRecipeInputs=new Set();
  for(const [resourceId,coefficient] of entries){
    if(seenRecipeInputs.has(resourceId))
      return{status:'BLOCKED',reason:'FACTORY_DUPLICATE_NORMALIZED_INPUT',factoryId:fid,resourceId,recipeId:recipe.recipeId||null};
    seenRecipeInputs.add(resourceId);
    const matchingStockKeys=Object.keys(factoryStock).filter(key=>tok(key)===resourceId);
    if(matchingStockKeys.length>1)
      return{status:'BLOCKED',reason:'DUPLICATE_NORMALIZED_FACTORY_STOCK_KEYS',factoryId:fid,resourceId,keys:matchingStockKeys};
    const stockKey=matchingStockKeys[0]||resourceId;
    const quantity=Math.max(0,num(factoryStock[stockKey])||0);
    const eligibleLots=lots.filter(l=>{
      const status=String(l?.status||'').toUpperCase();
      const remaining=Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0);
      return tok(l?.resourceId||l?.materialIdentity)===resourceId&&String(l?.batchId||'').trim()!==''&&
        remaining>1e-9&&!inactiveLotStatuses.has(status)&&(!input.factoryCycleId||String(l?.cycleReservationId||'')===String(input.factoryCycleId));
    });
    const batchIds=eligibleLots.map(l=>String(l?.batchId||'').trim()).filter(Boolean);
    if(new Set(batchIds).size!==batchIds.length)
      return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_ID',factoryId:fid,resourceId};
    const lotQuantity=eligibleLots.reduce((sum,l)=>sum+Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0),0);
    availability.push({resourceId,coefficient,stockKey,eligibleLots,available:quantity,tracked:lotQuantity,possibleProduction:quantity/coefficient});
  }
  const productionQuantity=Math.min(limit,...availability.map(x=>x.possibleProduction));
  if(!(productionQuantity>1e-9)){
    const missing=availability.filter(x=>x.available+1e-9<x.coefficient*Math.min(limit,1));
    return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:fid,recipeId:recipe.recipeId||null,
      requiredForOneUnit:availability.map(x=>({resourceId:x.resourceId,required:x.coefficient,available:x.available})),missingInputs:missing.map(x=>x.resourceId)};
  }
  const needs=availability.map(x=>({...x,required:productionQuantity*x.coefficient}));
  const mismatches=needs.filter(x=>x.tracked+1e-6<x.required);
  if(mismatches.length)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',factoryId:fid,recipeId:recipe.recipeId||null,
    mismatches:mismatches.map(x=>({resourceId:x.resourceId,required:x.required,tracked:x.tracked,available:x.available}))};
  for(const need of needs){
    let remaining=need.required;
    need.lotAllocations=[];
    const ordered=need.eligibleLots.slice().sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    for(const lot of ordered){
      if(remaining<=1e-9)break;
      const prior=Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0);
      const take=Math.min(prior,remaining);
      if(take>1e-9){need.lotAllocations.push({lot,quantity:take});remaining-=take;}
    }
    if(remaining>1e-6)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH',factoryId:fid,resourceId:need.resourceId,
      required:need.required,tracked:need.tracked,unallocated:remaining};
  }
  const outputEntries=Object.entries(recipe.outputs||{}).map(([outputId,ratio])=>({outputId,token:tok(outputId),ratio:num(ratio)}));
  if(!outputEntries.length||outputEntries.some(x=>!x.token||x.ratio===null||x.ratio<=0)||
    new Set(outputEntries.map(x=>x.token)).size!==outputEntries.length)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_PROFILE_INVALID',factoryId:fid,recipeId:recipe.recipeId||null};
  const outputTotal=outputEntries.reduce((sum,row)=>sum+row.ratio,0);
  if(!Number.isFinite(outputTotal)||Math.abs(outputTotal-1)>1e-6)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_BALANCE_INVALID',factoryId:fid,recipeId:recipe.recipeId||null,outputCoefficientTotal:outputTotal};
  const output={};
  for(const row of outputEntries){
    const quantity=Number((productionQuantity*row.ratio).toFixed(6));
    if(quantity>1e-9)output[row.outputId]=quantity;
  }
  if(!Object.keys(output).length)
    return{status:'BLOCKED',reason:'FACTORY_OUTPUT_ROUNDED_TO_ZERO',factoryId:fid,recipeId:recipe.recipeId||null};
  const utilityPreview=input.prepaidUtilityConsumption?{status:'READY',required:{electricityMWh:0,waterM3:0},prepaid:true}:previewFactoryUtilityUse(cid,asset,productionQuantity);
  if(utilityPreview.status!=='READY')return utilityPreview;
  const r=resourceState(cid);
  r.inventory=r.inventory&&typeof r.inventory==='object'?r.inventory:{};
  const finishedMap=r.processedWarehouse?.availableByResource||{};
  const outputInventoryKeys={},outputWarehouseKeys={};
  for(const row of outputEntries){
    const invKeys=Object.keys(r.inventory).filter(key=>tok(key)===row.token);
    const warehouseKeys=Object.keys(finishedMap).filter(key=>tok(key)===row.token);
    if(invKeys.length>1||warehouseKeys.length>1)
      return{status:'BLOCKED',reason:'DUPLICATE_NORMALIZED_OUTPUT_LEDGER_KEYS',factoryId:fid,resourceId:row.outputId,
        inventoryKeys:invKeys,warehouseKeys};
    outputInventoryKeys[row.outputId]=invKeys[0]||row.outputId;
    outputWarehouseKeys[row.outputId]=warehouseKeys[0]||row.outputId;
  }
  const policy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  for(const need of needs){
    const first=lots.find(l=>tok(l?.resourceId||l?.materialIdentity)===need.resourceId&&Math.max(0,num(l?.remainingQuantity!=null?l.remainingQuantity:l?.quantity)||0)>1e-9);
    const unit=first?.unit||recipe.inputUnit||asset.inputUnit||'SIMULATION_TONNE_EQUIVALENT';
    const gate=policy?.previewCarbonActivity?.(cid,need.resourceId,need.required,unit,'RESOURCE_PROCESSING',null,{
      activityId:'FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+need.resourceId,factoryId:fid,
      siteId:first?.siteId||null,sourceId:first?.batchId||fid
    });
    if(gate&&gate.allowed===false)return{status:'BLOCKED',reason:gate.reason||'CARBON_QUOTA_POLICY_BLOCKED_PROCESSING',resourceId:need.resourceId,carbonGate:gate};
  }
  const sourceBatchIds=[],sourceSiteIds=[],consumedInputs=[];
  for(const need of needs){
    factoryStock[need.stockKey]=Math.max(0,need.available-need.required);
    for(const allocation of need.lotAllocations){
      const lot=allocation.lot,take=allocation.quantity;
      const prior=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      lot.remainingQuantity=Math.max(0,prior-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_CONSUMED':'CONSUMED';
      lot.lastMovementType='MULTI_INPUT_PROCESSING_CONSUMPTION';lot.lastMovementTurn=turn();
      const lineage=Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId].filter(Boolean);
      if(lot.batchId&&!String(lot?.authority||lot?.provenance?.authority||'').includes('UNOBSERVED')&&!String(lot.batchId).startsWith('CYCLE-LEGACY:'))sourceBatchIds.push(String(lot.batchId));
      lineage.filter(Boolean).forEach(x=>sourceBatchIds.push(String(x)));
      (Array.isArray(lot.sourceSiteIds)?lot.sourceSiteIds:[]).filter(Boolean).forEach(x=>sourceSiteIds.push(String(x)));
      consumedInputs.push({batchId:lot.batchId||null,resourceId:need.resourceId,quantity:take,
        sourceBatchIds:lineage.filter(Boolean).map(String),stage:'FACTORY_INPUT'});
    }
  }
  const sequence=Math.max(0,Number(n.factoryRunSequence)||0)+1;n.factoryRunSequence=sequence;
  const transactionId='FACTORYRUN:'+cid+':'+fid+':T'+turn()+':'+sequence;
  const finished=r.processedWarehouse||(r.processedWarehouse={warehouseId:'WH-'+cid+'-PROCESSED',countryId:cid,
    type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',status:'OPERATIONAL',
    availableByResource:{},storedBatchIds:[],receipts:[]});
  finished.availableByResource=finished.availableByResource||{};
  finished.storedBatchIds=Array.isArray(finished.storedBatchIds)?finished.storedBatchIds:[];
  finished.receipts=Array.isArray(finished.receipts)?finished.receipts:[];
  const batches=Array.isArray(r.batches)?r.batches:(r.batches=[]);
  const inventoryLots=r.inventoryLots&&typeof r.inventoryLots==='object'?r.inventoryLots:(r.inventoryLots={});
  const roots=[...new Set(sourceBatchIds.filter(Boolean))],sites=[...new Set(sourceSiteIds.filter(Boolean))],created=[];
  const companyId=String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid));
  const outputUnit=recipe.outputUnit||asset.outputUnit||'SIMULATION_TONNE_EQUIVALENT';
  for(const [outputId,outQty] of Object.entries(output)){
    if(!(outQty>1e-9))continue;
    const inventoryKey=outputInventoryKeys[outputId]||outputId;
    r.inventory[inventoryKey]=(num(r.inventory[inventoryKey])||0)+outQty;
    const batchId='OUTPUT:'+transactionId+':'+outputId;
    const row={batchId,resourceId:outputId,materialIdentity:outputId,quantity:outQty,remainingQuantity:outQty,unit:outputUnit,
      stage:'FINISHED',countryId:cid,sourceCountryId:cid,originCountryId:cid,ownerCountryCode:cid,destinationCountryId:cid,
      ownerCompanyId:companyId,sourceBatchIds:roots,sourceSiteIds:sites,sourceFactoryId:fid,warehouseId:'WH-'+cid+'-PROCESSED',
      locationNodeKey:'WAREHOUSE:'+cid+':PROCESSED',processId:transactionId,
      provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:'SIMULATED_DOWNSTREAM_RECIPE',status:'FINISHED_GOODS_CREATED',
        transactionId,recipeId:recipe.recipeId||null,factoryType:asset.factoryType,sourceBatchIds:roots,sourceSiteIds:sites,simulationTurn:turn()}};
    batches.push(row);created.push(row);
    inventoryLots[batchId]={batchId,resourceId:outputId,quantity:outQty,remainingQuantity:outQty,unit:outputUnit,stage:'FINISHED',
      countryId:cid,warehouseId:row.warehouseId,locationNodeKey:row.locationNodeKey,ownerCompanyId:companyId,
      sourceBatchIds:roots,sourceSiteIds:sites,status:'AVAILABLE',provenance:clone(row.provenance),createdTurn:turn()};
    const warehouseKey=outputWarehouseKeys[outputId]||outputId;
    finished.availableByResource[warehouseKey]=(num(finished.availableByResource[warehouseKey])||0)+outQty;
    if(!finished.storedBatchIds.includes(batchId))finished.storedBatchIds.push(batchId);
    finished.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:row.warehouseId,countryId:cid,batchId,resourceId:outputId,
      quantity:outQty,unit:outputUnit,simulationTurn:turn(),status:'RECEIVED'});
  }
  while(finished.receipts.length>2048)finished.receipts.shift();
  while(batches.length>8192)batches.shift();
  const inputQuantities=Object.fromEntries(needs.map(x=>[x.resourceId,x.required]));
  const totalInput=needs.reduce((sum,x)=>sum+x.required,0);
  const record={transactionId,countryId:cid,factoryId:fid,factoryType:asset.factoryType||recipe.factoryType||null,
    recipeId:recipe.recipeId||asset.recipeId||null,recipeMode:'MULTI_INPUT',companyId,resourceId:requestedResource,
    inputQuantity:totalInput,inputQuantities,requestedProduction:productionQuantity,outputs:clone(output),outputQuantities:clone(output),
    recipe:clone(recipe),cycleDays:recipe.cycleDays,turn:turn(),authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'COMPLETED',
    inputSource:'TRACKED_FACTORY_INPUT',inputTrackingStatus:'TRACKED_FACTORY_INPUT_LOTS',
    consumedInputs:clone(consumedInputs),sourceBatchIds:roots,sourceSiteIds:sites,createdBatchIds:created.map(x=>x.batchId)};
  record.utilityConsumption=input.prepaidUtilityConsumption?clone(input.prepaidUtilityConsumption):commitFactoryUtilityUse(cid,asset,utilityPreview,transactionId);
  asset.inputInventory=factoryStock;asset.lastProductionTurn=turn();asset.lastProductionTransactionId=transactionId;
  r.batches=batches;r.inventoryLots=inventoryLots;r.processedWarehouse=finished;
  processedTurns[fid]=turn();n.factoryProcessingTurns=processedTurns;
  r.finishedGoodsLedger=Array.isArray(r.finishedGoodsLedger)?r.finishedGoodsLedger:[];
  r.finishedGoodsLedger.push({transactionId,countryId:cid,factoryId:fid,companyId,sourceBatchIds:roots,sourceSiteIds:sites,
    outputQuantities:clone(output),createdBatchIds:record.createdBatchIds,turn:turn(),authority:'SIMULATED_DOWNSTREAM_PRODUCTION',
    recipeId:record.recipeId,status:'AVAILABLE_TO_ECONOMY'});
  while(r.finishedGoodsLedger.length>2048)r.finishedGoodsLedger.shift();
  r.inventoryLedger=Array.isArray(r.inventoryLedger)?r.inventoryLedger:[];
  r.inventoryLedger.push({type:'FACTORY_MULTI_INPUT_PROCESSING_COMMITTED',transactionId,factoryId:fid,recipeId:record.recipeId,
    inputQuantities:clone(inputQuantities),outputs:clone(output),sourceBatchIds:roots,createdBatchIds:record.createdBatchIds,turn:turn()});
  while(r.inventoryLedger.length>2048)r.inventoryLedger.shift();
  n.factoryRuntime=n.factoryRuntime||{};n.factoryRuntime[fid]=record;
  n.events=Array.isArray(n.events)?n.events:[];n.events.push(record);n.events=n.events.slice(-MAX_EVENTS);
  emit('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',cid,record);
  emit('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',cid,{transactionId,countryId:cid,factoryId:fid,companyId,outputs:clone(output),
    outputQuantities:clone(output),sourceBatchIds:roots,sourceSiteIds:sites,createdBatchIds:record.createdBatchIds,turn:turn(),
    authority:'SIMULATED_DOWNSTREAM_PRODUCTION',status:'AVAILABLE'});
  return record;
}


/**
 * Stable public entry point for delivery completion and per-turn production.
 * Keep external callers independent of the internal immediate-commit method name.
 */
function executeFactoryCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const active=factoryCycleStore(cid).factoryProductionCycles[fid];
  if(factoryCycleActive(active)&&String(input.factoryCycleId||'')!==String(active.cycleId))
    return{status:'BLOCKED',reason:'FACTORY_CYCLE_ALREADY_RUNNING',factoryId:fid,activeCycleId:active.cycleId,
      finishDate:active.finishDate};
  return commitFactoryCycleImmediately(input);
}

function factoryCycleStore(countryId){
  const n=netState(countryId);
  if(!n.factoryProductionCycles||typeof n.factoryProductionCycles!=='object'||Array.isArray(n.factoryProductionCycles))
    n.factoryProductionCycles={};
  if(!Array.isArray(n.factoryProductionCycleHistory))n.factoryProductionCycleHistory=[];
  return n;
}
function factoryCycleActive(cycle){
  return !!cycle&&['IN_PROGRESS','PAUSED'].includes(String(cycle.status||'').toUpperCase());
}
function factorySetProductionHealth(asset,status,quantity,capacity,detail={}){
  const cap=Math.max(0,num(capacity)||0),q=Math.max(0,num(quantity)||0);
  const pct=cap>0?Math.max(0,Math.min(100,Number((q/cap*100).toFixed(2)))):0;
  asset.productionHealth={status,productivityPct:pct,productionUnitsPerCycle:q,capacityPerDay:cap,
    missingInputs:Array.isArray(detail.missingInputs)?detail.missingInputs:[],
    reason:detail.reason||null,detail:clone(detail),updatedTurn:turn(),
    cycleId:detail.cycleId||null,authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1'};
  asset.productionStatus=status;
  return asset.productionHealth;
}
function factoryProductionMetrics(asset,recipe,factoryCycleId=null){
  const cap=Math.max(0,num(asset?.capacityPerDay??asset?.capacity??asset?.productionCapacity??asset?.throughput)||0);
  const stock=asset?.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
  const lots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  const inactive=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  const inputs=[],missing=[];
  let possible=cap;
  for(const [rawId,rawCoefficient] of Object.entries(recipe?.inputs||{})){
    const rid=tok(rawId),coefficient=num(rawCoefficient),stockKey=quantityObjectKey(stock,rid);
    const quantity=stockKey===null?0:Math.max(0,num(stock[stockKey])||0);
    const eligible=lots.filter(lot=>tok(lot?.resourceId||lot?.materialIdentity)===rid&&
      !inactive.has(String(lot?.status||'').toUpperCase())&&
      (!lot?.cycleReservationId||String(lot.cycleReservationId)===String(factoryCycleId||''))&&
      Math.max(0,num(lot?.remainingQuantity!=null?lot.remainingQuantity:lot?.quantity)||0)>1e-9);
    const tracked=eligible.reduce((sum,lot)=>sum+Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0),0);
    const ids=eligible.map(lot=>String(lot.batchId||'').trim()).filter(Boolean);
    const duplicateBatchIds=new Set(ids).size!==ids.length;
    const requiredPerUnit=coefficient!==null&&coefficient>0?coefficient:null;
    if(!rid||requiredPerUnit===null||duplicateBatchIds){
      missing.push({resourceId:rid||rawId,reason:duplicateBatchIds?'DUPLICATE_FACTORY_INPUT_BATCH_ID':'INVALID_RECIPE_COEFFICIENT'});
      inputs.push({resourceId:rid,coefficient,available:quantity,tracked,possibleProduction:0,eligibleLots:eligible});
      possible=0;continue;
    }
    const byStock=quantity/requiredPerUnit,byTrace=tracked/requiredPerUnit;
    possible=Math.min(possible,byStock,byTrace);
    if(quantity<=1e-9)missing.push({resourceId:rid,requiredPerProductionUnit:requiredPerUnit,available:0,reason:'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY'});
    else if(tracked<=1e-9)missing.push({resourceId:rid,requiredTrackedQuantity:quantity,tracked,reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'});
    inputs.push({resourceId:rid,coefficient:requiredPerUnit,stockKey,available:quantity,tracked,possibleProduction:Math.min(byStock,byTrace),eligibleLots:eligible});
  }
  return{capacity:cap,possibleProduction:Math.max(0,Math.min(cap,possible)),inputs,missingInputs:missing,
    recipeInputCount:Object.keys(recipe?.inputs||{}).length};
}
function reserveFactoryCycleInputs(asset,metrics,inputQuantities,cycleId){
  const lots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  const reservations=[];
  for(const row of metrics.inputs||[]){
    let remaining=Math.max(0,num(inputQuantities[row.resourceId])||0);
    const candidates=(row.eligibleLots||[]).slice().sort((a,b)=>(Number(a.createdTurn)||0)-(Number(b.createdTurn)||0));
    for(const lot of candidates){
      if(remaining<=1e-9)break;
      const existing=String(lot?.cycleReservationId||'');
      if(existing&&existing!==String(cycleId))continue;
      const available=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      const take=Math.min(available,remaining);
      if(take>1e-9){
        reservations.push({resourceId:row.resourceId,batchId:String(lot.batchId||''),quantity:Number(take.toFixed(6)),
          sourceBatchIds:(Array.isArray(lot.sourceBatchIds)&&lot.sourceBatchIds.length?lot.sourceBatchIds:[lot.batchId]).filter(Boolean).map(String),lot});
        remaining=Number(Math.max(0,remaining-take).toFixed(6));
      }
    }
    if(remaining>1e-6)return{status:'BLOCKED',reason:'FACTORY_INPUT_BATCH_RESERVATION_FAILED',
      resourceId:row.resourceId,required:inputQuantities[row.resourceId],unreserved:remaining};
  }
  const seen=new Set();
  for(const reservation of reservations){
    if(!reservation.batchId||seen.has(reservation.batchId))
      return{status:'BLOCKED',reason:'DUPLICATE_FACTORY_INPUT_BATCH_RESERVATION',batchId:reservation.batchId||null};
    seen.add(reservation.batchId);
  }
  for(const reservation of reservations){
    reservation.lot.cycleReservationId=String(cycleId);
    reservation.lot.cycleReservedQuantity=reservation.quantity;
    reservation.lot.cycleReservedResourceId=reservation.resourceId;
    reservation.lot.cycleReservedTurn=turn();
    delete reservation.lot;
  }
  return{status:'RESERVED',reservations};
}
function releaseFactoryCycleReservations(asset,cycleId){
  const wanted=String(cycleId||'');
  if(!wanted)return 0;
  let released=0;
  for(const lot of Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[]){
    if(String(lot?.cycleReservationId||'')!==wanted)continue;
    delete lot.cycleReservationId;
    delete lot.cycleReservedQuantity;
    delete lot.cycleReservedResourceId;
    delete lot.cycleReservedTurn;
    released++;
  }
  return released;
}
function factorySourceWarehouse(rs,batch){
  const declared=String(batch?.warehouseId||'').toUpperCase();
  const stage=String(batch?.stage||'RAW').toUpperCase();
  if(declared.includes('PROCESSED')||declared.includes('FINISHED')||
     ['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(stage))
    return{kind:'PROCESSED',warehouse:rs.processedWarehouse||(rs.processedWarehouse={warehouseId:'WH-'+canonicalCountry(batch?.countryId||'' )+'-PROCESSED',availableByResource:{},reservedByResource:{}})};
  return{kind:'RAW',warehouse:rs.warehouse||(rs.warehouse={warehouseId:'WH-'+canonicalCountry(batch?.countryId||'')+'-RAW',availableByResource:{},reservedByResource:{}})};
}
function batchBelongsToBoundFactorySite(rs,batch,sourceSiteId,flowSiteByBatchId){
  const wanted=String(sourceSiteId||'').trim();
  if(!wanted)return true;
  const batchId=String(batch?.batchId||'').trim();
  const flowSite=flowSiteByBatchId.get(batchId);
  // A recorded site-flow entry is the strongest source identity for extracted batches.
  if(flowSite)return flowSite===wanted;
  const directIds=[batch?.siteReferenceKey,batch?.siteId,batch?.sourceSiteId,batch?.originSiteId,
    batch?.provenance?.siteId,batch?.provenance?.sourceSiteId]
    .map(value=>String(value||'').trim()).filter(Boolean);
  if(directIds.includes(wanted))return true;
  const occurrence=String(batch?.occurrenceKey||batch?.sourceOccurrenceKey||batch?.provenance?.occurrenceKey||'').trim();
  if(occurrence===wanted||occurrence.includes(':'+wanted+':'))return true;
  return false;
}
function transferFactoryInputsFromWarehouse(countryId,asset,recipe){
  const cid=canonicalCountry(countryId),rs=resourceState(cid),n=netState(cid);
  const stock=asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:(asset.inputInventory={});
  const lots=Array.isArray(asset.inputBatchLots)?asset.inputBatchLots:(asset.inputBatchLots=[]);
  const capacity=Math.max(0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity??asset.throughput)||0);
  const transfers=[],blocked=[];
  if(!(capacity>1e-9))return{status:'BLOCKED',reason:'PRODUCTION_CAPACITY_UNAVAILABLE',transfers,blocked};
  const batches=Array.isArray(rs.batches)?rs.batches:[];
  const nonTransferable=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','IN_TRANSIT','RESERVED','DECOMMISSIONED']);
  // Mine-bound simulation factories must not silently consume a different mine's
  // same-resource stock just because it is older in the national warehouse FIFO.
  // Generic factories without a source-site binding retain normal pooled-warehouse behavior.
  const boundSourceSiteId=String(asset?.sourceSiteId||asset?.siteId||'').trim();
  const siteFlowRows=Array.isArray(rs.industrialNetwork?.siteFlowLedger)?rs.industrialNetwork.siteFlowLedger:[];
  const flowSiteByBatchId=new Map(siteFlowRows.filter(row=>row?.batchId&&row?.siteId)
    .map(row=>[String(row.batchId),String(row.siteId)]));
  for(const [rawId,rawCoefficient] of Object.entries(recipe?.inputs||{})){
    const rid=tok(rawId),coefficient=num(rawCoefficient);
    if(!rid||coefficient===null||coefficient<=0){blocked.push({resourceId:rid||rawId,reason:'FACTORY_RECIPE_COEFFICIENT_INVALID'});continue;}
    const currentKey=quantityObjectKey(stock,rid),current=currentKey===null?0:Math.max(0,num(stock[currentKey])||0);
    const target=Math.max(0,capacity*coefficient-current);
    if(target<=1e-9)continue;
    const inTransit=n.shipments.filter(row=>String(row?.shipmentType||'')==='FACTORY_INPUT'&&
      String(row?.factoryId||'')===String(asset.id||asset.assetId||asset.projectId)&&tok(row?.resourceId)===rid&&
      ['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE'].includes(String(row?.status||'')))
      .reduce((sum,row)=>sum+Math.max(0,num(row?.targetQuantity)||0),0);
    let remaining=Math.max(0,target-inTransit);
    if(remaining<=1e-9)continue;
    const candidates=batches.filter(batch=>tok(batch?.resourceId||batch?.materialIdentity)===rid&&
      !nonTransferable.has(String(batch?.status||'').toUpperCase())&&
      Math.max(0,num(batch?.remainingQuantity!=null?batch.remainingQuantity:batch?.quantity)||0)>1e-9&&
      batchBelongsToBoundFactorySite(rs,batch,boundSourceSiteId,flowSiteByBatchId))
      .sort((a,b)=>(num(a?.createdTurn)||0)-(num(b?.createdTurn)||0));
    for(const batch of candidates){
      if(remaining<=1e-9)break;
      const batchId=String(batch?.batchId||'').trim();if(!batchId)continue;
      const source=factorySourceWarehouse(rs,batch),wh=source.warehouse;
      wh.availableByResource=wh.availableByResource||{};wh.reservedByResource=wh.reservedByResource||{};
      const availableKey=quantityObjectKey(wh.availableByResource,rid),reservedKey=quantityObjectKey(wh.reservedByResource,rid);
      if(availableKey===null)continue;
      const warehouseAvailable=Math.max(0,num(wh.availableByResource[availableKey])||0);
      const reserved=reservedKey===null?0:Math.max(0,num(wh.reservedByResource[reservedKey])||0);
      const sourceRemaining=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
      const sourceLot=rs.inventoryLots&&rs.inventoryLots[batchId]||null;
      const lotRemaining=sourceLot?Math.max(0,num(sourceLot.remainingQuantity!=null?sourceLot.remainingQuantity:sourceLot.quantity)||0):sourceRemaining;
      const invKey=quantityObjectKey(rs.inventory||{},rid),countryAvailable=invKey===null?0:Math.max(0,num(rs.inventory[invKey])||0);
      const sourceUnit=String(batch.unit||sourceLot?.unit||'').trim();
      const targetUnit=recipe.inputUnit||asset.inputUnit||cat()?.factoryCatalogPolicy?.unitNormalization?.targetUnit||'';
      const bridge=factoryUnitBridge(sourceUnit,targetUnit);
      if(!bridge){blocked.push({batchId,resourceId:rid,reason:'FACTORY_INPUT_UNIT_BRIDGE_NOT_DECLARED',sourceUnit:sourceUnit||'NOT_RECORDED',targetUnit:targetUnit||'NOT_RECORDED'});continue;}
      const amount=Math.min(remaining/bridge.factor,Math.max(0,warehouseAvailable-reserved),sourceRemaining,lotRemaining,countryAvailable);
      if(amount<=1e-9)continue;
      const targetAmount=Number((amount*bridge.factor).toFixed(6));
      if(!(targetAmount>1e-9))continue;
      const transferSequence=(Number(n.factoryInputTransferSequence)||0)+1;n.factoryInputTransferSequence=transferSequence;
      const transferId='FACTORY-WH-TRANSFER:'+cid+':'+String(asset.id||asset.assetId||asset.projectId)+':T'+turn()+':'+transferSequence;
      const rootIds=[batchId,...(Array.isArray(batch.sourceBatchIds)?batch.sourceBatchIds:[])].filter(Boolean).map(String);
      wh.availableByResource[availableKey]=Number(Math.max(0,warehouseAvailable-amount).toFixed(6));
      batch.remainingQuantity=Number(Math.max(0,sourceRemaining-amount).toFixed(6));
      batch.status=batch.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
      batch.lastMovementType='WAREHOUSE_TO_FACTORY_INPUT_TRANSFER';batch.lastMovementTurn=turn();
      if(sourceLot){
        sourceLot.remainingQuantity=Number(Math.max(0,lotRemaining-amount).toFixed(6));
        sourceLot.status=sourceLot.remainingQuantity>1e-9?'PARTIALLY_TRANSFERRED_TO_FACTORY':'TRANSFERRED_TO_FACTORY';
        sourceLot.lastMovementType='WAREHOUSE_TO_FACTORY_INPUT_TRANSFER';sourceLot.lastMovementTurn=turn();
      }
      if(batch.remainingQuantity<=1e-9&&Array.isArray(wh.storedBatchIds))wh.storedBatchIds=wh.storedBatchIds.filter(id=>String(id)!==batchId);
      if(invKey!==null)rs.inventory[invKey]=Number(Math.max(0,countryAvailable-amount).toFixed(6));
      const destKey=quantityObjectKey(stock,rid)||rid;
      stock[destKey]=Number(((num(stock[destKey])||0)+targetAmount).toFixed(6));
      const inputBatchId='INPUT:'+transferId;
      const inputLot={batchId:inputBatchId,resourceId:rid,materialIdentity:rid,quantity:targetAmount,remainingQuantity:targetAmount,
        unit:bridge.targetUnit,stage:'FACTORY_INPUT',countryId:cid,sourceCountryId:cid,originCountryId:cid,
        ownerCountryCode:cid,destinationCountryId:cid,ownerCompanyId:String(asset.companyId||asset.ownerCompanyId||('SIM-COMPANY:'+cid)),
        sourceBatchIds:rootIds,sourceSiteIds:[...(Array.isArray(batch.sourceSiteIds)?batch.sourceSiteIds:[])],
        sourceFactoryId:batch.sourceFactoryId||null,sourceWarehouseId:wh.warehouseId||('WH-'+cid+'-'+source.kind),
        factoryId:String(asset.id||asset.assetId||asset.projectId),locationNodeKey:'FACTORY:'+cid+':'+String(asset.id||asset.assetId||asset.projectId),
        createdTurn:turn(),status:'AVAILABLE_TO_FACTORY',lastMovementType:'WAREHOUSE_TO_FACTORY_INPUT_TRANSFER',lastMovementTurn:turn(),
        provenance:{source:'OMEGA_RESOURCE_INDUSTRIAL_NETWORK_V1',authority:bridge.authority,unitBridge:bridge,
          sourceBatchId:batchId,sourceBatchIds:rootIds,transferId,simulationOnly:true,simulationTurn:turn()}};
      lots.push(inputLot);
      if(!rs.inventoryLots||typeof rs.inventoryLots!=='object')rs.inventoryLots={};
      rs.inventoryLots[inputBatchId]={...clone(inputLot),createdTurn:turn()};
      const row={transferId,countryId:cid,factoryId:String(asset.id||asset.assetId||asset.projectId),resourceId:rid,
        quantity:amount,targetQuantity:targetAmount,sourceUnit,targetUnit:bridge.targetUnit,sourceBatchId:batchId,
        inputBatchId,sourceWarehouseId:wh.warehouseId||('WH-'+cid+'-'+source.kind),destinationNode:'FACTORY:'+cid+':'+String(asset.id||asset.assetId||asset.projectId),
        routeType:'INTERNAL_WAREHOUSE_TO_FACTORY',status:'DELIVERED',turn:turn(),sourceBatchIds:rootIds,
        authority:'SIMULATED_WAREHOUSE_TO_FACTORY_TRANSFER',simulationOnly:true};
      n.factoryInputTransfers=Array.isArray(n.factoryInputTransfers)?n.factoryInputTransfers:[];
      n.factoryInputTransfers.push(row);n.factoryInputTransfers=n.factoryInputTransfers.slice(-MAX_EVENTS);
      const inventoryLedger=Array.isArray(rs.inventoryLedger)?rs.inventoryLedger:[];
      inventoryLedger.push({type:'FACTORY_WAREHOUSE_INPUT_TRANSFER',...clone(row)});
      rs.inventoryLedger=inventoryLedger.slice(-2048);
      emit('OMEGA_FACTORY_WAREHOUSE_INPUT_TRANSFERRED',cid,row);
      transfers.push(row);remaining=Math.max(0,remaining-targetAmount);
    }
    if(remaining>1e-6)blocked.push({resourceId:rid,reason:'INSUFFICIENT_TRACKED_WAREHOUSE_STOCK',required:remaining+Math.max(0,target-remaining),transferred:target-remaining,remaining});
  }
  asset.inputInventory=stock;asset.inputBatchLots=lots;
  return{status:blocked.length?'DEGRADED':'TRANSFERRED',countryId:cid,factoryId:String(asset.id||asset.assetId||asset.projectId),turn:turn(),transferCount:transfers.length,transfers,blocked};
}
function factoryCycleDue(cycle){
  const now=factoryCurrentGameDate();
  if(cycle?.finishDate&&now)return factoryDateReached(now,cycle.finishDate);
  return turn()>=Math.max(0,num(cycle?.finishTurn)||Number.MAX_SAFE_INTEGER);
}
function startFactoryProductionCycle(input={}){
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'');
  const asset=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId)===fid);
  if(!asset)return{status:'BLOCKED',reason:'FACTORY_NOT_FOUND',factoryId:fid};
  const n=factoryCycleStore(cid),existing=n.factoryProductionCycles[fid];
  if(factoryCycleActive(existing))return{status:existing.status==='PAUSED'?'PAUSED':'IN_PROGRESS',cycleId:existing.cycleId,
    factoryId:fid,finishDate:existing.finishDate,productionQuantity:existing.productionQuantity,productivityPct:existing.productivityPct,idempotent:true};
  const gate=factoryOperationGate(cid,asset);
  if(gate.status!=='READY'){
    factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity),{reason:gate.reason,gate});
    return gate;
  }
  const first=tok(input.resourceId||Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'');
  const recipe=recipeFor(first,asset),metrics=factoryProductionMetrics(asset,recipe);
  const requested=Math.max(0,num(input.quantity)||metrics.capacity);
  let quantity=Math.min(metrics.capacity,requested,metrics.possibleProduction);
  if(metrics.missingInputs.length){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_OR_BATCH_SHORTAGE',missingInputs:metrics.missingInputs});
    return{status:'BLOCKED',reason:'FACTORY_INPUT_OR_BATCH_SHORTAGE',factoryId:fid,missingInputs:clone(metrics.missingInputs),capacity:metrics.capacity};
  }
  if(!(quantity>1e-9)){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',missingInputs:metrics.inputs.filter(row=>row.available<=1e-9).map(row=>({resourceId:row.resourceId,reason:'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY'}))});
    return{status:'BLOCKED',reason:'FACTORY_INPUT_SHORTAGE',factoryId:fid};
  }
  const utilityProfile=(cat()?.factoryProfiles||{})[normalizeFactoryType(asset.factoryType||asset.type||'')]?.utilities||asset.utilityRequirements||{};
  let utilityPreview=previewFactoryUtilityUse(cid,asset,quantity);
  if(utilityPreview.status==='BLOCKED'&&utilityPreview.reason==='FACTORY_UTILITY_SHORTAGE'){
    for(const shortage of utilityPreview.shortages||[]){
      const daily=shortage.utility==='ELECTRICITY'?num(utilityProfile.electricityMWhPerDay):num(utilityProfile.waterM3PerDay);
      const rate=daily!==null&&metrics.capacity>0?daily/metrics.capacity:0;
      if(rate>1e-9)quantity=Math.min(quantity,Math.max(0,num(shortage.available)||0)/rate);
    }
    if(quantity>1e-9)utilityPreview=previewFactoryUtilityUse(cid,asset,quantity);
  }
  if(utilityPreview.status!=='READY'||!(quantity>1e-9)){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:utilityPreview.reason||'FACTORY_UTILITY_SHORTAGE',utility:utilityPreview});
    return{status:'BLOCKED',reason:utilityPreview.reason||'FACTORY_UTILITY_SHORTAGE',factoryId:fid,utility:utilityPreview};
  }
  // Recheck batch attribution for the final utility-constrained quantity before scheduling.
  const inputQuantities={};
  for(const row of metrics.inputs){
    const need=Number((row.coefficient*quantity).toFixed(6));
    inputQuantities[row.resourceId]=need;
    if(row.available+1e-6<need||row.tracked+1e-6<need){
      const detail={resourceId:row.resourceId,required:need,available:row.available,tracked:row.tracked,reason:'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'};
      factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:detail.reason,missingInputs:[detail]});
      return{status:'BLOCKED',reason:detail.reason,factoryId:fid,missingInputs:[detail]};
    }
  }
  const startDate=factoryCurrentGameDate(),cycleDays=Math.max(1,num(recipe.cycleDays)||1),durationDays=Math.max(1,Math.ceil(cycleDays-1e-9));
  const finishDate=startDate?factoryAddGameDays(startDate,durationDays):null;
  const finishTurn=turn()+Math.max(1,Math.ceil(durationDays/Math.max(daysPerTurn(),1/86400000)));
  const cycleSequence=(Number(n.factoryProductionCycleSequence)||0)+1;n.factoryProductionCycleSequence=cycleSequence;
  const cycle={cycleId:'FACTORYCYCLE:'+cid+':'+fid+':T'+turn()+':'+cycleSequence,countryId:cid,factoryId:fid,
    factoryType:String(asset.factoryType||asset.type||'').toUpperCase(),recipeId:recipe.recipeId||asset.recipeId||null,
    recipeMode:recipe.recipeMode||'SINGLE_INPUT',primaryInputResourceId:first,productionQuantity:Number(quantity.toFixed(6)),
    capacityPerDay:metrics.capacity,productivityPct:Number((quantity/metrics.capacity*100).toFixed(2)),
    inputQuantities,expectedOutputs:Object.fromEntries(Object.entries(recipe.outputs||{}).map(([id,value])=>[id,Number((quantity*(num(value)||0)).toFixed(6))])),
    sourceBatchIds:[],
    inputBatchReservations:[],
    startDate,finishDate,cycleDays:durationDays,startTurn:turn(),finishTurn,status:'IN_PROGRESS',
    authority:'OMEGA_FACTORY_PRODUCTION_SCHEDULER_V1',simulationOnly:true};
  const reserved=reserveFactoryCycleInputs(asset,metrics,inputQuantities,cycle.cycleId);
  if(reserved.status!=='RESERVED'){
    factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:reserved.reason,detail:reserved});
    return{status:'BLOCKED',reason:reserved.reason,factoryId:fid,detail:reserved};
  }
  cycle.inputBatchReservations=reserved.reservations;
  cycle.sourceBatchIds=[...new Set(reserved.reservations.map(row=>String(row.batchId||'')).filter(Boolean))];
  n.factoryProductionCycles[fid]=cycle;
  n.factoryProductionCycleHistory.push(clone(cycle));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
  factorySetProductionHealth(asset,quantity+1e-6<metrics.capacity?'REDUCED':'RUNNING',quantity,metrics.capacity,{cycleId:cycle.cycleId});
  asset.activeProductionCycleId=cycle.cycleId;
  emit('OMEGA_FACTORY_PRODUCTION_CYCLE_STARTED',cid,cycle);
  return{status:'IN_PROGRESS',...clone(cycle)};
}
function completeFactoryProductionCycle(countryId,asset,cycle,result){
  const cid=canonicalCountry(countryId),n=netState(cid);
  if(result?.status!=='COMPLETED'){
    cycle.status='PAUSED';cycle.lastBlockedReason=result?.reason||'FACTORY_PRODUCTION_COMPLETION_BLOCKED';
    cycle.lastBlockedDetail=clone(result);cycle.pausedTurn=turn();
    factorySetProductionHealth(asset,'STOPPED',0,cycle.capacityPerDay,{reason:cycle.lastBlockedReason,cycleId:cycle.cycleId,detail:result});
    emit('OMEGA_FACTORY_PRODUCTION_CYCLE_PAUSED',cid,{cycleId:cycle.cycleId,factoryId:cycle.factoryId,
      reason:cycle.lastBlockedReason,detail:result,turn:turn()});
    return{status:'PAUSED',cycleId:cycle.cycleId,reason:cycle.lastBlockedReason,detail:result};
  }
  cycle.status='COMPLETED';cycle.completedTurn=turn();cycle.actualCompletionDate=factoryCurrentGameDate()||cycle.finishDate;
  const actualProduction=Math.max(0,num(result.requestedProduction)||cycle.productionQuantity);
  cycle.actualProductionQuantity=Number(actualProduction.toFixed(6));
  cycle.productivityPct=cycle.capacityPerDay>0?Number((actualProduction/cycle.capacityPerDay*100).toFixed(2)):0;
  cycle.transactionId=result.transactionId;cycle.outputQuantities=clone(result.outputQuantities||result.outputs||{});
  cycle.createdBatchIds=clone(result.createdBatchIds||[]);cycle.lastBlockedReason=null;
  releaseFactoryCycleReservations(asset,cycle.cycleId);
  asset.activeProductionCycleId=null;asset.lastProductionCycleId=cycle.cycleId;asset.lastProductionCycleCompletedDate=cycle.actualCompletionDate;
  factorySetProductionHealth(asset,cycle.productivityPct<99.999?'REDUCED':'READY',actualProduction,cycle.capacityPerDay,{cycleId:cycle.cycleId});
  n.factoryProductionCycleHistory.push(clone(cycle));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
  // Batch lineage from the committed transaction is the only source of truth for
  // which sites and shipments were consumed by this cycle. Input-lot IDs (for example,
  // INPUT:SHIP:...) are not site-flow batch IDs, so reconcile each consumed input lot's
  // recorded upstream lineage before updating mine/site flow records.
  // Never infer completion from factory/cycle identity alone.
  const rootsSet=new Set((result.sourceBatchIds||[]).map(String).filter(Boolean));
  const consumedInputIds=new Set((result.consumedInputs||[]).map(row=>String(row?.batchId||'')).filter(Boolean));
  const inputLots=Array.isArray(asset?.inputBatchLots)?asset.inputBatchLots:[];
  for(const lot of inputLots){
    const inputBatchId=String(lot?.batchId||'').trim();
    if(!inputBatchId)continue;
    if(consumedInputIds.has(inputBatchId)||rootsSet.has(inputBatchId)){
      rootsSet.add(inputBatchId);
      for(const sourceId of Array.isArray(lot?.sourceBatchIds)?lot.sourceBatchIds:[]){
        const id=String(sourceId||'').trim();
        if(id)rootsSet.add(id);
      }
    }
  }
  const roots=[...rootsSet];
  for(const sourceBatchId of roots){
    updateSiteFlow(cid,sourceBatchId,row=>{
      row.processingTransactionIds=[...new Set([...(row.processingTransactionIds||[]),String(result.transactionId)])];
      row.processingTransactionId=String(result.transactionId);
      row.createdBatchIds=[...new Set([...(row.createdBatchIds||[]),...(result.createdBatchIds||[])])];
      row.outputQuantities=row.outputQuantities||{};
      for(const [outputId,amount] of Object.entries(result.outputQuantities||{}))
        row.outputQuantities[outputId]=(num(row.outputQuantities[outputId])||0)+(num(amount)||0);
      row.lastProcessingTurn=turn();row.status='PROCESSED';
      addFlowStage(row,'PROCESSING','COMPLETED',{transactionId:result.transactionId,inputQuantity:result.inputQuantity,productionCycleId:cycle.cycleId});
      addFlowStage(row,'FINISHED_GOODS','AVAILABLE',{transactionId:result.transactionId,createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},productionCycleId:cycle.cycleId});
    });
    for(const shipment of n.shipments.filter(row=>String(row.batchId||'')===sourceBatchId)){
      shipment.processingStatus='PROCESSED';shipment.processingTransactionId=result.transactionId;
      shipment.processing=clone(result);shipment.processedTurn=turn();
      shipment.createdBatchIds=[...new Set([...(shipment.createdBatchIds||[]),...(result.createdBatchIds||[])])];
    }
    for(const delivery of n.deliveries.filter(row=>String(row.batchId||'')===sourceBatchId)){
      delivery.processingStatus='PROCESSED';delivery.processingTransactionId=result.transactionId;
      delivery.processing=clone(result);delivery.processedTurn=turn();
      delivery.createdBatchIds=[...new Set([...(delivery.createdBatchIds||[]),...(result.createdBatchIds||[])])];
    }
    emit('OMEGA_RESOURCE_SITE_FLOW_PROCESSED',cid,{siteId:siteFlowRows(cid).find(row=>String(row.batchId)===sourceBatchId)?.siteId||null,
      batchId:sourceBatchId,resourceId:cycle.primaryInputResourceId,transactionId:result.transactionId,
      createdBatchIds:result.createdBatchIds||[],outputQuantities:result.outputQuantities||{},turn:turn(),status:'PROCESSED'});
  }
  emit('OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED',cid,{cycleId:cycle.cycleId,transactionId:result.transactionId,
    factoryId:cycle.factoryId,outputQuantities:cycle.outputQuantities,finishDate:cycle.finishDate,actualCompletionDate:cycle.actualCompletionDate});
  return{status:'COMPLETED',cycleId:cycle.cycleId,transactionId:result.transactionId,outputQuantities:cycle.outputQuantities};
}
function processPendingFactoryInputs(countryId){
  const cid=canonicalCountry(countryId),n=factoryCycleStore(cid),assets=factoryAssets(cid),completed=[],started=[],blocked=[],transfers=[];
  const completedThisTurn=new Set();
  // First finish any cycle whose date has arrived. Output is not posted before this point.
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||''),cycle=n.factoryProductionCycles[fid];
    if(!fid||!asset||!factoryCycleActive(cycle)||cycle.status==='PAUSED'||!factoryCycleDue(cycle))continue;
    const result=executeFactoryCycle({countryId:cid,factoryId:fid,factoryCycleId:cycle.cycleId,
      resourceId:cycle.primaryInputResourceId,quantity:cycle.productionQuantity,unit:asset.inputUnit||null});
    const outcome=completeFactoryProductionCycle(cid,asset,cycle,result);
    if(outcome.status==='COMPLETED'){completed.push(outcome);completedThisTurn.add(fid);}
    else if(outcome.status!=='PAUSED')blocked.push({factoryId:fid,reason:outcome.reason||'FACTORY_PRODUCTION_CYCLE_PAUSED',detail:outcome});
  }
  for(const asset of assets){
    const fid=String(asset?.id||asset?.assetId||asset?.projectId||'');
    if(!fid||!asset||completedThisTurn.has(fid))continue;
    const prior=n.factoryProductionCycles[fid];
    if(factoryCycleActive(prior)){
      if(prior.status==='PAUSED'&&factoryCycleDue(prior)){
        // Pause is not a dead end: fetch any newly delivered/available required feedstock before
        // deciding whether this facility remains red/stopped or can resume at reduced productivity.
        const pausedRecipe=recipeFor(prior.primaryInputResourceId,asset);
        const feeder=transferFactoryInputsFromWarehouse(cid,asset,pausedRecipe);
        transfers.push(...(feeder.transfers||[]));
        const resumedMetrics=factoryProductionMetrics(asset,pausedRecipe,prior.cycleId);
        const resumeMissing=resumedMetrics.inputs.filter(row=>row.available<=1e-9||row.tracked<=1e-9)
          .map(row=>({resourceId:row.resourceId,available:row.available,tracked:row.tracked,
            reason:row.available<=1e-9?'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY':'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'}));
        if(resumedMetrics.possibleProduction<=1e-9||resumeMissing.length){
          factorySetProductionHealth(asset,'STOPPED',0,resumedMetrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',
            missingInputs:resumeMissing.length?resumeMissing:resumedMetrics.missingInputs,cycleId:prior.cycleId});
          blocked.push({factoryId:fid,reason:'FACTORY_INPUT_SHORTAGE',
            missingInputs:resumeMissing.length?resumeMissing:resumedMetrics.missingInputs,warehouseTransferStatus:feeder.status});
          continue;
        }
        releaseFactoryCycleReservations(asset,prior.cycleId);
        prior.status='RESCHEDULED_AFTER_INPUT_SHORTAGE';prior.resumedTurn=turn();prior.resumedByCycleSequence=(Number(n.factoryProductionCycleSequence)||0)+1;
        n.factoryProductionCycleHistory.push(clone(prior));n.factoryProductionCycleHistory=n.factoryProductionCycleHistory.slice(-MAX_EVENTS);
        delete n.factoryProductionCycles[fid];asset.activeProductionCycleId=null;
        // Continue through the normal operation, utility and workforce gates below. The replacement
        // cycle uses currently recorded batches and a newly calculated productivity percentage.
      }else{
        factorySetProductionHealth(asset,prior.productivityPct<99.999?'REDUCED':'RUNNING',
          prior.productionQuantity,prior.capacityPerDay,{cycleId:prior.cycleId});
        continue;
      }
    }
    const gate=factoryOperationGate(cid,asset);
    if(gate.status!=='READY'){
      factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity),{reason:gate.reason,gate});
      blocked.push({factoryId:fid,reason:gate.reason,detail:gate});continue;
    }
    const first=tok(Object.keys(asset.inputCoefficients||asset.inputs||{})[0]||asset.resourceId||'');
    const recipe=recipeFor(first,asset);
    const transfer=transferFactoryInputsFromWarehouse(cid,asset,recipe);
    transfers.push(...(transfer.transfers||[]));
    const metrics=factoryProductionMetrics(asset,recipe);
    const missing=metrics.inputs.filter(row=>row.available<=1e-9||row.tracked<=1e-9)
      .map(row=>({resourceId:row.resourceId,available:row.available,tracked:row.tracked,reason:row.available<=1e-9?'WAREHOUSE_AND_FACTORY_INPUT_STOCK_EMPTY':'FACTORY_INPUT_BATCH_LEDGER_MISMATCH'}));
    if(metrics.possibleProduction<=1e-9||missing.length){
      factorySetProductionHealth(asset,'STOPPED',0,metrics.capacity,{reason:'FACTORY_INPUT_SHORTAGE',missingInputs:missing.length?missing:metrics.missingInputs});
      blocked.push({factoryId:fid,reason:'FACTORY_INPUT_SHORTAGE',missingInputs:missing.length?missing:metrics.missingInputs,
        warehouseTransferStatus:transfer.status});continue;
    }
    const result=startFactoryProductionCycle({countryId:cid,factoryId:fid,resourceId:first,quantity:metrics.possibleProduction});
    if(result.status==='IN_PROGRESS')started.push({factoryId:fid,cycleId:result.cycleId,productionQuantity:result.productionQuantity,
      productivityPct:result.productivityPct,finishDate:result.finishDate});
    else blocked.push({factoryId:fid,reason:result.reason||result.status,detail:result});
  }
  return{status:blocked.length?'DEGRADED':'COMPLETED',countryId:cid,turn:turn(),completedCount:completed.length,processedCount:completed.length,completed,processed:completed,
    startedCount:started.length,started,warehouseTransferCount:transfers.length,transfers,blocked};
}

function ensureSimulationFactory(cid,site,resourceId,quantity,options={}){
  const economy=econState(cid);if(!Array.isArray(economy.productionAssets))economy.productionAssets=[];
  const assets=economy.productionAssets,siteId=String(site?.siteId||'');
  const factoryId='FAC-SIM:'+cid+':'+String(siteId).replace(/[^A-Za-z0-9_-]/g,'_')+':'+tok(resourceId);
  const compatible=candidateFactories(cid,resourceId);
  // Explicit auto-commissioning binds a new deposit to a source-site factory when possible.
  // Otherwise retain the legacy shared-factory fallback for callers that do not request it.
  const siteFactory=compatible.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===siteId);
  if(siteFactory)return{status:'EXISTING_SITE',factory:siteFactory.asset};
  let factory=assets.find(a=>String(a?.id||a?.assetId||a?.projectId)===factoryId);
  if(factory&&assetCanAccept(factory,resourceId))return{status:'EXISTING_SITE',factory};
  if(options.siteSpecific!==true&&compatible.length)return{status:'EXISTING',factory:compatible[0].asset};
  const recipe=recipeFor(resourceId,{});
  if(!Object.keys(recipe.inputs||{}).length||!Object.keys(recipe.outputs||{}).length)return{status:'BLOCKED',reason:'NO_FACTORY_RECIPE'};
  if(!factory){
    factory={id:factoryId,countryId:cid,siteId:null,sourceSiteId:siteId,stage:'PROCESSING',factoryType:recipe.factoryType||'RESOURCE_PROCESSING_PLANT',
      status:'OPERATIONAL',capacity:Math.max(1,num(quantity)||1),inputCoefficients:clone(recipe.inputs),outputProfile:clone(recipe.outputs),
      inputInventory:{},inputBatchLots:[],companyId:'SIM-COMPANY:'+cid,ownerCompanyId:'SIM-COMPANY:'+cid,
      transportAccess:['truck','rail','ship','pipeline'],locationNodeKey:'FACTORY:'+cid+':'+siteId,
      simulationOnly:true,authority:'SIMULATED_GAMEPLAY_BOOTSTRAP',
      bootstrapReason:options.siteSpecific===true?'SOURCE_SITE_FACTORY_REQUIRED':'NO_EXISTING_COMPATIBLE_FACTORY'};
    assets.push(factory);
  }
  return{status:'CREATED_SIMULATION_ONLY',factory};
}
async function executeSitePipeline(input={}){
  const cid=canonicalCountry(input.countryId);
  if(!cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISSING'};
  const endowment=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
  if(!endowment?.initialize||!endowment?.hydrateCountry||!endowment?.extractCountry)return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_RUNTIME_UNAVAILABLE'};
  const initialized=await endowment.initialize();
  if(initialized?.status!=='READY')return{status:'BLOCKED',reason:'RESOURCE_ENDOWMENT_NOT_READY',detail:initialized};
  const site=siteById(input.siteId);
  if(!site?.siteId)return{status:'BLOCKED',reason:'SITE_NOT_FOUND'};
  if(canonicalCountry(site.countryId)!==cid)return{status:'BLOCKED',reason:'SITE_COUNTRY_MISMATCH',siteCountryId:site.countryId,requestedCountryId:cid};
  const registeredAssets=Array.isArray(state()?.resource?.[cid]?.mineAssets)?state().resource[cid].mineAssets:[];
  const latestMineAsset=registeredAssets.slice().reverse().find(row=>String(row?.siteId||'')===String(site.siteId));
  if(latestMineAsset&&/DECOMMISSIONED|DESTROYED|STOPPED/.test(String(latestMineAsset.status||'').toUpperCase()))
    return{status:'BLOCKED',reason:'MINE_DECOMMISSIONED',siteId:site.siteId,countryId:cid};
  const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
  const siteGate=strategicPolicy?.siteAvailableForExtraction?.(cid,site.siteId,site);
  if(siteGate&&!siteGate.allowed)return{status:'BLOCKED',reason:siteGate.reason||'SITE_EXPLORATION_GATE_BLOCKED',siteId:site.siteId,countryId:cid};
  const rid=tok(input.resourceId||site?.real?.resourceId||site?.sourceSiteRecord?.resourceId||site?.identity?.resourceTypeId);
  if(!rid)return{status:'BLOCKED',reason:'RESOURCE_ID_MISSING'};
  const loaded=await loadCatalog();if(loaded?.status==='FAILED')return{status:'BLOCKED',reason:'INDUSTRIAL_CATALOG_UNAVAILABLE',detail:loaded};
  const hydrated=await endowment.hydrateCountry(cid);
  if(hydrated?.status!=='APPLIED'||hydrated?.result?.accepted===false)return{status:'BLOCKED',reason:'COUNTRY_HYDRATION_NOT_COMMITTED',detail:hydrated};
  const extractionPlan=planExtraction({countryId:cid,siteId:site.siteId,resourceId:rid,quantity:input.quantity,remainingReserve:input.remainingReserve});
  if(extractionPlan?.status!=='PLANNED')return{status:'BLOCKED',reason:'INDUSTRIAL_EXTRACTION_PLAN_BLOCKED',siteId:site.siteId,detail:extractionPlan};
  const countryState=state()?.resource?.[cid]||{},controllers=countryState.mineSiteControllers||{};
  const siteKey=String(site.siteId),controller=controllers[siteKey]||Object.values(controllers).find(x=>String(x?.siteReferenceKey||'')===siteKey);
  const linkedKeys=Array.isArray(controller?.linkedOccurrenceKeys)?controller.linkedOccurrenceKeys.map(String).filter(Boolean):[];
  const mineStates=countryState.mineStates&&typeof countryState.mineStates==='object'?countryState.mineStates:{};
  const siteReference=(Array.isArray(countryState.mineSiteReferences)?countryState.mineSiteReferences:[]).find(x=>String(x?.siteReferenceKey||x?.siteId||'')===siteKey);
  const matchingKeys=linkedKeys.filter(key=>tok(mineStates[key]?.resourceId||mineStates[key]?.resourceTypeId)===rid);
  const stateBoundKeys=Object.entries(mineStates).filter(([key,row])=>{
    const rowSite=String(row?.siteReferenceKey||row?.siteId||row?.sourceSiteId||'');
    return rowSite===siteKey&&tok(row?.resourceId||row?.resourceTypeId)===rid&&key;
  }).map(([key])=>String(key));
  // Some legacy occurrence keys predate per-key resourceId persistence or controller materialization.
  // Reuse a mine-state key only when its own site identity and commodity both match exactly.
  const referenceResource=tok(siteReference?.resourceId||siteReference?.resourceTypeId||siteReference?.rawSiteReference?.resourceId||siteReference?.rawSiteReference?.resourceTypeId);
  const dedicatedGameplaySite=site?.runtime?.identityAuthority==='LEGACY_SITE_GAMEPLAY_EXPANSION_WITH_SOURCE_LINEAGE'&&site?.map?.markerEligible!==false&&!site?.runtime?.aliasOfSiteId;
  const dedicatedSiteKeys=dedicatedGameplaySite?linkedKeys.filter(key=>String(key).startsWith('SITE_OCC:'+cid+':')&&tok(mineStates[key]?.resourceId||mineStates[key]?.resourceTypeId)===rid):[];
  // Prefer a structured source occurrence only when its source deposit name is the
  // same physical site, not merely a fuzzy-linked region with the same commodity.
  // Example: "Barapukuria Coal Mine" matches exactly; "Pilbara Hamersley Province"
  // must not swallow the distinct "Pilbara Iron Ore Range" gameplay site.
  const identityWords=value=>{
    const ignored=new Set(['site','mine','field','quarry','facility','deposit','orebody','area','zone','complex','project']);
    return [...new Set(String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ')
      .trim().split(/\s+/).filter(x=>x.length>1&&!ignored.has(x)))].sort().join(' ');
  };
  const depositRows=Array.isArray((g.ResourceMinistryEngine||g.OmegaResourceMinistryEngine||g.Omega?.ResourceMinistryEngine)?.deposits)?
    (g.ResourceMinistryEngine||g.OmegaResourceMinistryEngine||g.Omega?.ResourceMinistryEngine).deposits:[];
  const exactSiteName=identityWords(site.siteName);
  const sourceDepositKeys=matchingKeys.filter(key=>{
    const row=mineStates[key]||{},depositKey=String(row.depositKey||'').trim();
    if(!String(key).startsWith('OCC:')||!depositKey||/^SIM(?:_|$)/i.test(depositKey))return false;
    const source=depositRows.find(x=>[x?.id,x?.depositId,x?.mineId].some(v=>String(v||'').trim()===depositKey));
    const sourceName=source?.name||source?.depositName||row.siteName||row.depositName||'';
    return !!exactSiteName&&identityWords(sourceName)===exactSiteName;
  });
  const keys=sourceDepositKeys.length?sourceDepositKeys:
    (dedicatedSiteKeys.length?dedicatedSiteKeys:(stateBoundKeys.length?stateBoundKeys:(matchingKeys.length?matchingKeys:(referenceResource===rid?linkedKeys:[]))));
  if(!keys.length)return{status:'BLOCKED',reason:linkedKeys.length?'SITE_RESOURCE_OCCURRENCE_NOT_FOUND':'SITE_HAS_NO_EXECUTABLE_OCCURRENCE',siteId:site.siteId,countryId:cid,resourceId:rid,controllerStatus:controller?.controllerStatus||null,linkedOccurrenceCount:linkedKeys.length,siteStateOccurrenceCount:stateBoundKeys.length,referenceResource:referenceResource||null};
  const already=netState(cid).siteExecutions||[];
  const duplicate=already.find(x=>x.siteId===site.siteId&&Number(x.turn)===turn()&&x.status!=='FAILED');
  if(duplicate)return{status:'BLOCKED',reason:'SITE_ALREADY_EXECUTED_THIS_TURN',existingExecutionId:duplicate.executionId,siteId:site.siteId};
  // Prepare an explicitly requested source-site factory before the extraction event fires.
  // The extraction callback dispatches synchronously, so it must see the intended destination.
  let preparedFactory=null,preparedFactoryBootstrap=null;
  if(input.autoCommissionFactory===true){
    preparedFactoryBootstrap=ensureSimulationFactory(cid,site,rid,
      Math.max(1,num(extractionPlan.approvedQuantity)||num(input.quantity)||1),{siteSpecific:true});
    preparedFactory=preparedFactoryBootstrap.factory||null;
    if(!preparedFactory)return{status:'BLOCKED',reason:'SITE_FACTORY_BOOTSTRAP_BLOCKED',detail:preparedFactoryBootstrap};
  }
  const extraction=await endowment.extractCountry(cid,keys);
  const records=extraction?.result?.records||extraction?.records||[];
  const record=records.find(x=>keys.includes(String(x?.occurrenceKey||''))&&canonicalCountry(x?.countryId||cid)===cid&&x?.producedBatch);
  if(extraction?.status!=='APPLIED'||extraction?.result?.accepted===false||!record){
    return{status:'BLOCKED',reason:'SITE_EXTRACTION_NOT_COMMITTED',siteId:site.siteId,occurrenceKeys:keys,extractionStatus:extraction?.status||null,detail:extraction?.reason||extraction?.detail||extraction?.result?.error||extraction?.result?.blocked||extraction?.result?.reason||null};
  }
  const batch=record.producedBatch,quantity=Math.max(0,num(record.approvedQuantity)||num(batch.quantity)||num(record.quantity)||0);
  if(quantity<=0)return{status:'BLOCKED',reason:'EXTRACTION_BATCH_QUANTITY_INVALID',siteId:site.siteId,occurrenceKey:record.occurrenceKey};
  const candidates=candidateFactories(cid,rid);
  let factoryBootstrap=preparedFactoryBootstrap||null;
  let factoryChoice=preparedFactory||
    candidates.find(({asset})=>String(asset?.sourceSiteId||asset?.siteId||'')===String(site.siteId))?.asset||
    candidates[0]?.asset||null;
  // A missing factory must never be silently fabricated during normal gameplay.
  // Scenario/test callers may opt in explicitly with autoCommissionFactory:true.
  if(!factoryChoice&&input.autoCommissionFactory===true){
    factoryBootstrap=ensureSimulationFactory(cid,site,rid,quantity,{siteSpecific:true});
    factoryChoice=factoryBootstrap.factory||null;
  }
  if(!factoryChoice)return{status:'EXTRACTED_AWAITING_FACTORY',siteId:site.siteId,countryId:cid,resourceId:rid,quantity,unit:batch.unit||'TONNES',occurrenceKey:record.occurrenceKey,batchId:batch.batchId,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW'),reason:'NO_MATCHING_FACTORY'};
  const sent=dispatchShipment({countryId:cid,siteId:site.siteId,resourceId:rid,quantity,unit:batch.unit||'TONNES',transportMode:input.transportMode,
    factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),batchId:batch.batchId,occurrenceKey:record.occurrenceKey,warehouseId:batch.warehouseId||('WH-'+cid+'-RAW')});
  const dispatchedQuantity=sent.status==='DISPATCHED'?Math.max(0,num(sent.shipment?.quantity)||0):quantity;
  const execution={executionId:'SITE-PIPELINE:'+cid+':'+site.siteId+':T'+turn(),siteId:site.siteId,countryId:cid,resourceId:rid,occurrenceKey:record.occurrenceKey,batchId:batch.batchId,
    quantity:dispatchedQuantity,extractedQuantity:quantity,unit:batch.unit||'TONNES',turn:turn(),factoryId:String(factoryChoice.id||factoryChoice.assetId||factoryChoice.projectId),factoryBootstrapStatus:factoryBootstrap?.status||'EXISTING',
    extractionStatus:'COMMITTED',extractionPlanId:extractionPlan.planId,shipmentStatus:sent.status,shipmentId:sent.shipment?.shipmentId||null,route:clone(sent.shipment?.route||sent.plan?.route||null),status:sent.status==='DISPATCHED'?'IN_TRANSIT':sent.status};
  const ledger=netState(cid);ledger.siteExecutions=Array.isArray(ledger.siteExecutions)?ledger.siteExecutions:[];ledger.siteExecutions.push(clone(execution));ledger.siteExecutions=ledger.siteExecutions.slice(-MAX_EVENTS);
  if(sent.status!=='DISPATCHED')return{...execution,status:'EXTRACTED_AWAITING_ROUTE',reason:sent.reason||'SHIPMENT_DISPATCH_BLOCKED',shipment:sent};
  emit('OMEGA_RESOURCE_SITE_PIPELINE_STARTED',cid,execution);
  return{...execution,status:'IN_TRANSIT',shipment:sent.shipment,factoryBootstrap:factoryBootstrap?{status:factoryBootstrap.status,factoryId:factoryChoice.id}:null};
}

function diagnostics(countryId){
  const cid=countryId?canonicalCountry(countryId):null,sites=cid?masterSites().filter(s=>canonicalCountry(s?.countryId)===cid):masterSites();
  const byReason={}, extraction=sites.map(s=>{const rid=tok(s?.real?.resourceId||s?.sourceSiteRecord?.resourceId);const p=planExtraction({countryId:s.countryId,siteId:s.siteId,resourceId:rid,quantity:1});if(p.status!=='PLANNED')byReason[p.reason]=(byReason[p.reason]||0)+1;return p});
  const countries=[...new Set(masterSites().map(s=>canonicalCountry(s.countryId)).filter(Boolean))];
  let factoryCount=0,networkShipmentCount=0,projectCount=0;
  for(const c of countries){factoryCount+=factoryAssets(c).length;const n=netState(c);networkShipmentCount+=n.shipments.length;projectCount+=n.projects.length}
  const methods={};for(const x of extraction)if(x?.method)methods[x.method]=(methods[x.method]||0)+1;
  return{version:VERSION,siteCount:sites.length,commercialSiteCount:sites.filter(s=>s?.sourceSiteRecord?.commercialExtraction===true).length,
    extractionPlans:extraction.length,blockedExtractionReasons:byReason,methodCoverage:methods,factoryAssetCount:factoryCount,shipmentCount:networkShipmentCount,projectCount,
    catalogLoaded:!!cat(),daysPerTurn:daysPerTurn(),targetArchitecture:'SITE -> EXTRACTION -> WAREHOUSE -> ROUTE -> FACTORY -> PROCESS -> OUTPUT',countryIsolation:'ENFORCED_BY_COUNTRY_SCOPED_STATE_AND_CROSS_BORDER_CONTRACT'};
}


function finiteCount(value){if(value===null||value===undefined||value==='')return null;const n=num(value);return n!==null&&n>=0?n:null;}
function countryPopulationRecord(cid,econ){
  const s=state()||{},keys=[cid,String(cid||'').toUpperCase()];
  const resolver=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
  try{
    const identity=resolver?.resolveCountry?.(cid),raw=identity?.raw?.raw||identity?.raw?.datasets?.['countries.json']||identity?.raw||{};
    for(const name of [identity?.name,identity?.countryName,identity?.canonicalName,raw?.name,raw?.countryName,raw?.officialName]){
      if(name){keys.push(String(name));keys.push(String(name).toUpperCase().replace(/[^A-Z0-9]+/g,'_'));}
    }
  }catch(_){}
  const directRows=[econ?.populationRecord,econ?.demographics,econ?.population,s.population?.[cid],s.populations?.[cid],
    s.demographics?.[cid],s.society?.[cid],s.populationByCountry?.[cid],s.countryProfiles?.[cid],s.countries?.[cid]];
  const globals=[s.population,s.populations,s.populationByCountry,g.OmegaPopulationData,g.Omega?.PopulationData,g.populationData,
    g.PopulationData,g.POPULATION_DATA,g.OmegaCountryPopulationData,g.countryPopulationData,g.COUNTRY_POPULATION_DATA];
  for(const source of globals){
    if(!source||typeof source!=='object')continue;
    for(const key of keys){const row=source[key];if(row&&typeof row==='object'){directRows.push(row);break;}}
    if(source.data&&typeof source.data==='object')for(const key of keys){const row=source.data[key];if(row&&typeof row==='object'){directRows.push(row);break;}}
  }
  const populationFields=['populationTotal','population_total','totalPopulation','total_population','population','population_2015','population2015',
    'populationCurrent','population_current','populationCount','population_count','laborForce','labor_force','laborForceSize','labor_force_size',
    'totalLaborForce','total_labor_force','labourForce','labour_force'];
  for(const row of directRows){
    if(row&&typeof row==='object'&&populationFields.some(key=>row[key]!==undefined&&row[key]!==null&&row[key]!==''))return row;
    if(typeof row==='number'&&Number.isFinite(row)&&row>0)return{population:row};
  }
  return null;
}
function resolveFactoryLabourForce(cid,econ){
  const s=state()||{},record=countryPopulationRecord(cid,econ);
  const directCandidates=[econ.laborForce,econ.labor_force,econ.laborForceSize,econ.labor_force_size,econ.totalLaborForce,econ.total_labor_force,
    econ.population?.laborForce,econ.demographics?.laborForce,s.population?.[cid]?.laborForce,s.population?.[cid]?.labor_force,
    record?.laborForce,record?.labor_force,record?.labor_force_total,record?.laborForceTotal,record?.labourForce,record?.labour_force];
  for(const value of directCandidates){const n=finiteCount(value);if(n!==null&&n>0)return{value:n,authority:'RECORDED_LABOUR_FORCE',simulationOnly:false};}
  const popCandidates=[econ.populationTotal,econ.population_total,econ.population_2015,econ.population2015,econ.populationSize,
    typeof econ.population==='number'?econ.population:null,record?.populationTotal,record?.population_total,record?.population_2015,
    record?.population2015,record?.totalPopulation,record?.total_population,record?.population,record?.population_count,
    record?.populationCurrent,record?.population_current,record?.populationCount,record?.total];
  let population=null;for(const value of popCandidates){const n=finiteCount(value);if(n!==null&&n>0){population=n;break;}}
  if(population===null)return{value:null,authority:'NOT_RECORDED',simulationOnly:true};
  const participationCandidates=[econ.laborForceParticipationPct,econ.labor_force_participation_pct,econ.laborParticipationRatePct,
    record?.laborForceParticipationPct,record?.labor_force_participation_pct,record?.labor_force_participation_rate];
  let participation=null;
  for(const value of participationCandidates){const n=num(value);if(n!==null&&n>0&&n<=100){participation=n;break;}}
  if(participation===null)participation=60;
  return{value:Math.max(1,Math.round(population*participation/100)),authority:participation===60&&participationCandidates.every(v=>num(v)===null)?
    'SIMULATED_POPULATION_LABOUR_FORCE_PROXY_60_PERCENT':'RECORDED_PARTICIPATION_RATE_PROXY',
    simulationOnly:participationCandidates.every(v=>num(v)===null),population,participationRatePct:participation};
}
function readUnemploymentCount(econ){
  for(const key of ['unemploymentCount','unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount']){
    const value=finiteCount(econ?.[key]);if(value!==null)return{value,key};
  }
  return{value:null,key:null};
}
function readUnemploymentRate(econ){
  for(const key of ['unemployment_rate','unemploymentRatePct','unemploymentRate','unemployment_rate_pct']){
    const value=num(econ?.[key]);if(value!==null&&value>=0&&value<=100)return{value,key};
  }
  return{value:null,key:null};
}
function reconcileFactoryEmployment(countryId){
  const cid=canonicalCountry(countryId);
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_EMPLOYMENT_COUNTRY_INVALID'};
  const econ=econState(cid),profiles=cat()?.factoryProfiles||{},assets=factoryAssets(cid);
  let model=econ.factoryEmployment;
  if(!model||typeof model!=='object'||Array.isArray(model)){
    model={schemaVersion:'1.0.0',model:'SIMULATED_FACTORY_EMPLOYMENT_V1',baselineUnemployedCount:null,
      labourForce:null,labourForceAuthority:'NOT_RECORDED',unemploymentSource:'NOT_RECORDED',factories:{},jobsSupported:0,jobsFilled:0,
      vacancies:0,unemployedCount:null,unemploymentRatePct:null,lastAppliedUnemployedCount:null,lastAppliedUnemploymentRatePct:null,
      lastUpdatedTurn:null,simulationOnly:true};
    econ.factoryEmployment=model;
  }
  if(!model.factories||typeof model.factories!=='object'||Array.isArray(model.factories))model.factories={};
  const labour=resolveFactoryLabourForce(cid,econ),direct=readUnemploymentCount(econ),rate=readUnemploymentRate(econ);
  const priorFilled=Math.max(0,num(model.jobsFilled)||0);
  let baseline=finiteCount(model.baselineUnemployedCount);
  const lastCount=finiteCount(model.lastAppliedUnemployedCount),lastRate=num(model.lastAppliedUnemploymentRatePct);
  const directChanged=direct.value!==null&&lastCount!==null&&Math.abs(direct.value-lastCount)>1e-6;
  const rateChanged=rate.value!==null&&lastRate!==null&&Math.abs(rate.value-lastRate)>1e-7;
  if(baseline===null){
    if(direct.value!==null){baseline=direct.value;model.unemploymentSource='RECORDED_UNEMPLOYED_HEADCOUNT';}
    else if(rate.value!==null&&labour.value!==null){
      baseline=Math.max(0,Math.round(labour.value*rate.value/100));model.unemploymentSource='RECORDED_UNEMPLOYMENT_RATE_X_LABOUR_FORCE';
    }
  }else if(directChanged){
    baseline=direct.value+priorFilled;model.unemploymentSource='UPDATED_LIVE_UNEMPLOYED_HEADCOUNT_PLUS_EXISTING_FACTORY_HIRES';
  }else if(rateChanged&&labour.value!==null){
    baseline=Math.max(0,Math.round(labour.value*rate.value/100))+priorFilled;
    model.unemploymentSource='UPDATED_LIVE_UNEMPLOYMENT_RATE_PLUS_EXISTING_FACTORY_HIRES';
  }
  if(baseline!==null)model.baselineUnemployedCount=baseline;
  model.labourForce=labour.value;model.labourForceAuthority=labour.authority;model.labourForceSimulationOnly=labour.simulationOnly;
  model.factories={};
  const operational=assets.filter(asset=>String(asset?.status||'OPERATIONAL').toUpperCase()==='OPERATIONAL'&&
    (asset?.commissionedTurn!==undefined||asset?.factoryType||asset?.type));
  operational.sort((a,b)=>(num(a.commissionedTurn)??num(a.createdTurn)??0)-(num(b.commissionedTurn)??num(b.createdTurn)??0)||
    String(a.id||a.assetId||a.factoryId||a.projectId||'').localeCompare(String(b.id||b.assetId||b.factoryId||b.projectId||'')));
  let totalSupported=0,totalFilled=0,remaining=baseline;
  for(const asset of operational){
    const id=String(asset.id||asset.assetId||asset.factoryId||asset.projectId||'').trim();if(!id)continue;
    const type=String(asset.factoryType||asset.type||asset.facilityType||'').toUpperCase(),profile=profiles[type]||{};
    const jobsRaw=num(profile.employment?.jobsPerFactory??asset.employmentProfile?.jobsPerFactory??asset.employment?.jobsSupported);
    const supported=jobsRaw!==null&&jobsRaw>0?Math.floor(jobsRaw):0;
    const filled=remaining===null?0:Math.min(supported,Math.max(0,Math.floor(remaining))),open=supported-filled;
    remaining=remaining===null?null:Math.max(0,remaining-filled);totalSupported+=supported;totalFilled+=filled;
    const record={factoryId:id,factoryType:type,jobsSupported:supported,jobsFilled:filled,vacancies:open,
      status:supported===0?'EMPLOYMENT_PROFILE_MISSING':open===0?'FULLY_STAFFED':'PARTIALLY_STAFFED',
      authority:profile.employmentAuthority||profile.employment?.authority||'UNDECLARED',simulationOnly:true,lastReconciledTurn:turn()};
    model.factories[id]=record;
    asset.employment={...(asset.employment&&typeof asset.employment==='object'?asset.employment:{}),jobsSupported:supported,jobsFilled:filled,
      vacancies:open,coreOperatingCrew:num(profile.employment?.coreOperatingCrew),additionalDirectStaffSlots:num(profile.employment?.additionalDirectStaffSlots),
      jobScope:profile.employment?.jobScope||'DIRECT_FACTORY_JOBS_SCOPE_NOT_RECORDED',jobBreakdown:clone(profile.employment?.jobBreakdown||{}),
      status:record.status,model:'SIMULATED_FACTORY_EMPLOYMENT_V1',authority:record.authority,simulationOnly:true,lastReconciledTurn:turn()};
  }
  model.jobsSupported=totalSupported;model.jobsFilled=totalFilled;model.vacancies=Math.max(0,totalSupported-totalFilled);
  model.unemployedCount=baseline===null?null:Math.max(0,baseline-totalFilled);
  model.unemploymentRatePct=model.unemployedCount!==null&&labour.value!==null&&labour.value>0?
    Number((model.unemployedCount/labour.value*100).toFixed(4)):null;
  model.status=model.unemployedCount===null?'UNEMPLOYMENT_HEADCOUNT_UNAVAILABLE':'ACTIVE';
  model.authority='SIMULATED_FACTORY_EMPLOYMENT_RECONCILIATION';model.simulationOnly=true;model.lastUpdatedTurn=turn();
  if(model.unemployedCount!==null){
    econ.unemploymentCount=model.unemployedCount;
    for(const key of ['unemployedCount','unemployedPeople','unemployed_people','unemployment_count','joblessCount'])
      if(Object.prototype.hasOwnProperty.call(econ,key))econ[key]=model.unemployedCount;
    if(model.unemploymentRatePct!==null){
      econ.unemployment_rate=model.unemploymentRatePct;
      for(const key of ['unemploymentRatePct','unemploymentRate','unemployment_rate_pct'])
        if(Object.prototype.hasOwnProperty.call(econ,key))econ[key]=model.unemploymentRatePct;
      model.lastAppliedUnemploymentRatePct=model.unemploymentRatePct;
    }
    model.lastAppliedUnemployedCount=model.unemployedCount;
  }
  model.baselineUnemployedCount=baseline;
  model.lastUpdateSourceFields={unemployedCountKey:direct.key,unemploymentRateKey:rate.key};
  return{status:model.status,countryId:cid,turn:turn(),baselineUnemployedCount:baseline,labourForce:model.labourForce,
    labourForceAuthority:model.labourForceAuthority,unemployedCount:model.unemployedCount,unemploymentRatePct:model.unemploymentRatePct,
    jobsSupported:model.jobsSupported,jobsFilled:model.jobsFilled,vacancies:model.vacancies,operationalFactoryCount:operational.length,
    source:model.unemploymentSource,simulationOnly:true};
}

function factoryProductionRequirements(factoryType, recipeId){
  const catalog=cat()||{},profiles=catalog.factoryProfiles||{},processing=catalog.processingRules||{},
    downstream=catalog.downstreamFactoryRecipes||{};
  const requestedType=normalizeFactoryType(factoryType);
  let key=String(recipeId||'').trim(),resourceId=null,recipe=null,kind=null;
  if(/^PROCESSING:/i.test(key)){resourceId=key.replace(/^PROCESSING:/i,'').trim();key=resourceId;}
  if(key&&downstream[key]){recipe=downstream[key];kind='DOWNSTREAM';key=String(recipe.recipeId||key);}
  else if(key&&processing[key]){resourceId=key;recipe=processing[key];kind='PROCESSING';}
  if(!recipe&&!key){
    const profile=profiles[requestedType]||{};
    const preferred=profile.defaultRecipeId||((profile.recipeIds||[]).find(id=>downstream[id])||null);
    if(preferred&&downstream[preferred]){key=preferred;recipe=downstream[preferred];kind='DOWNSTREAM';}
    if(!recipe){
      const found=Object.entries(processing).find(([,row])=>String(row?.factoryType||'').toUpperCase()===requestedType);
      if(found){resourceId=found[0];key=found[0];recipe=found[1];kind='PROCESSING';}
    }
    if(!recipe){
      const found=Object.entries(downstream).find(([,row])=>String(row?.factoryType||'').toUpperCase()===requestedType);
      if(found){key=found[0];recipe=found[1];kind='DOWNSTREAM';}
    }
  }
  const resolvedType=String(recipe?.factoryType||requestedType).trim().toUpperCase();
  const profile=profiles[resolvedType];
  if(!recipe||!profile)return{status:'NOT_FOUND',reason:!recipe?'FACTORY_RECIPE_NOT_FOUND':'FACTORY_PROFILE_NOT_FOUND',
    factoryType:resolvedType,recipeId:key||null};
  const capacity=num(profile.defaultCapacityPerDay);
  if(capacity===null||capacity<=0)return{status:'BLOCKED',reason:'FACTORY_CAPACITY_NOT_RECORDED',
    factoryType:resolvedType,recipeId:recipe.recipeId||key||null};
  const inputs=recipe.inputs&&typeof recipe.inputs==='object'?recipe.inputs:{};
  const outputs=recipe.outputs&&typeof recipe.outputs==='object'?recipe.outputs:{};
  const scaleRows=(source,scale)=>{
    const result={};
    for(const [id,value] of Object.entries(source)){
      const quantity=num(value);
      result[id]=quantity===null?null:Number((quantity*scale).toFixed(6));
    }
    return result;
  };
  const utilities=profile.utilities&&typeof profile.utilities==='object'?profile.utilities:{};
  const power=num(utilities.electricityMWhPerDay),water=num(utilities.waterM3PerDay);
  const employment=profile.employment&&typeof profile.employment==='object'?profile.employment:{};
  const workforce=profile.workforce&&typeof profile.workforce==='object'?profile.workforce:{};
  return{
    status:'READY',
    contract:'OMEGA_FACTORY_PRODUCTION_REQUIREMENTS_V1',
    factoryType:resolvedType,
    factoryName:profile.name||resolvedType,
    recipeId:recipe.recipeId||((kind==='PROCESSING')?'PROCESSING:'+resourceId:key),
    recipeKind:kind,
    resourceId:resourceId,
    inputsPerProductionUnit:clone(inputs),
    outputsPerProductionUnit:clone(outputs),
    inputUnit:recipe.inputUnit||'SIMULATION_RESOURCE_UNIT',
    outputUnit:recipe.outputUnit||'SIMULATION_RESOURCE_UNIT',
    quantityBasis:recipe.quantityBasis||catalog.factoryCatalogPolicy?.quantityBasis||'PER_SIMULATION_PRODUCTION_UNIT',
    ratedCapacityPerDay:capacity,
    ratedDailyInputs:scaleRows(inputs,capacity),
    ratedDailyOutputs:scaleRows(outputs,capacity),
    processing:{cycleDays:num(recipe.cycleDays),cycleTimeUnit:recipe.cycleTimeUnit||catalog.factoryCatalogPolicy?.recipeTimeUnit||'IN_GAME_DAYS',
      runtimeTimingMode:catalog.factoryCatalogPolicy?.recipeTimingRuntimeBehavior||'GAME_CALENDAR_DELAYED_COMPLETION',
      durationEnforced:true},
    workforce:{
      operators:num(workforce.operators),engineers:num(workforce.engineers),
      coreOperatingCrew:num(employment.coreOperatingCrew)??((num(workforce.operators)||0)+(num(workforce.engineers)||0)),
      additionalDirectStaffSlots:num(employment.additionalDirectStaffSlots),totalDirectJobs:num(employment.jobsPerFactory),
      jobBreakdown:clone(employment.jobBreakdown||{})
    },
    utilities:{
      electricityMWhPerDay:power,waterM3PerDay:water,
      electricityMWhPerProductionUnit:power===null?null:Number((power/capacity).toFixed(6)),
      waterM3PerProductionUnit:water===null?null:Number((water/capacity).toFixed(6))
    },
    construction:{
      cost:num(profile.constructionCost),timeDays:num(profile.constructionDays),materials:clone(profile.constructionMaterials||{}),
      materialUnit:profile.constructionMaterialUnit||'SIMULATION_RESOURCE_UNIT',
      requiredInfrastructure:clone(profile.requiredInfrastructure||[]),requiredTechnologyIds:clone(profile.requiredTechnologyIds||[])
    },
    authority:recipe.recipeAuthority||recipe.authority||'SIMULATED_GAMEPLAY_RULE',
    profileAuthority:profile.authority||'NOT_RECORDED',
    simulationOnly:true
  };
}

function factoryProductionStatus(countryId,factoryId){
  const cid=canonicalCountry(countryId),assets=factoryAssets(cid),asset=assets.find(row=>String(row?.id||row?.assetId||row?.projectId)===String(factoryId||''));
  if(!asset)return{status:'NOT_FOUND',reason:'FACTORY_NOT_FOUND',countryId:cid,factoryId:String(factoryId||'')};
  const n=factoryCycleStore(cid),cycle=n.factoryProductionCycles[String(factoryId)]||null;
  return{status:'READY',countryId:cid,factoryId:String(factoryId),health:clone(asset.productionHealth||{status:'NOT_RECORDED'}),
    cycle:clone(cycle),lastProductionCycleId:asset.lastProductionCycleId||null,updatedTurn:turn()};
}
function decommissionFactory(input={}) {
  const cid=canonicalCountry(input.countryId),fid=String(input.factoryId||'').trim();
  if(!cid)return{status:'BLOCKED',reason:'FACTORY_COUNTRY_INVALID',factoryId:fid};
  if(!fid)return{status:'BLOCKED',reason:'FACTORY_ID_REQUIRED',countryId:cid};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'FACTORY_DECOMMISSION_CONFIRMATION_REQUIRED',countryId:cid,factoryId:fid};
  const asset=factoryAssets(cid).find(row=>String(row?.id||row?.assetId||row?.projectId||'')===fid);
  if(!asset)return{status:'NOT_FOUND',reason:'FACTORY_NOT_FOUND',countryId:cid,factoryId:fid};
  const previousStatus=String(asset.status||'NOT_RECORDED').trim().toUpperCase();
  if(['DECOMMISSIONED','DESTROYED'].includes(previousStatus))
    return{status:'DECOMMISSIONED',countryId:cid,factoryId:fid,idempotent:true,productionStatus:'STOPPED'};
  const network=netState(cid);
  const cycleMap=factoryCycleStore(cid).factoryProductionCycles;
  const cycle=cycleMap[fid]||null;
  if(factoryCycleActive(cycle)){
    cycle.status='CANCELLED';
    cycle.cancelReason='FACTORY_DECOMMISSIONED_BY_PLAYER';
    cycle.cancelledTurn=turn();
    cycle.cancelledDate=factoryCurrentGameDate();
    cycle.decommissionedByPlayer=true;
    releaseFactoryCycleReservations(asset,cycle.cycleId);
    network.factoryProductionCycleHistory.push(clone(cycle));
    network.factoryProductionCycleHistory=network.factoryProductionCycleHistory.slice(-MAX_EVENTS);
    delete cycleMap[fid];
  }
  asset.status='DECOMMISSIONED';
  asset.decommissionedTurn=turn();
  asset.decommissionedDate=factoryCurrentGameDate();
  asset.decommissionedByPlayer=true;
  asset.activeProductionCycleId=null;
  const health=factorySetProductionHealth(asset,'STOPPED',0,num(asset.capacityPerDay??asset.capacity??asset.productionCapacity),{
    reason:'FACTORY_DECOMMISSIONED_BY_PLAYER',
    priorStatus:previousStatus,
    cancelledCycleId:cycle?.cycleId||null
  });
  const record={status:'DECOMMISSIONED',countryId:cid,factoryId:fid,factoryType:String(asset.factoryType||asset.type||''),turn:turn(),
    date:asset.decommissionedDate,priorStatus:previousStatus,cancelledCycleId:cycle?.cycleId||null,
    productionHealth:clone(health),authority:'OMEGA_FACTORY_DECOMMISSION_API_V1',historyPreserved:true};
  network.factoryDecommissionHistory=Array.isArray(network.factoryDecommissionHistory)?network.factoryDecommissionHistory:[];
  network.factoryDecommissionHistory.push(clone(record));
  network.factoryDecommissionHistory=network.factoryDecommissionHistory.slice(-MAX_EVENTS);
  network.events=Array.isArray(network.events)?network.events:[];
  network.events.push(clone(record));network.events=network.events.slice(-MAX_EVENTS);
  emit('OMEGA_FACTORY_DECOMMISSIONED',cid,record);
  emit('OMEGA_FACTORY_CAPACITY_CHANGED',cid,{factoryId:fid,status:'DECOMMISSIONED',turn:turn()});
  return record;
}

function decommissionMine(input={}) {
  const cid=canonicalCountry(input.countryId),siteId=String(input.siteId||'').trim();
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'MINE_COUNTRY_INVALID',siteId:siteId||null};
  const activePlayerCountry=playerSimulationCountryId();
  if(!activePlayerCountry)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_NOT_SELECTED',countryId:cid,siteId:siteId||null};
  if(cid!==activePlayerCountry)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid,playerCountryId:activePlayerCountry,siteId:siteId||null};
  if(!siteId)return{status:'BLOCKED',reason:'MINE_SITE_ID_REQUIRED',countryId:cid};
  if(input.confirmed!==true)return{status:'CONFIRMATION_REQUIRED',reason:'MINE_DECOMMISSION_CONFIRMATION_REQUIRED',countryId:cid,siteId};
  const resource=resourceState(cid),assets=Array.isArray(resource.mineAssets)?resource.mineAssets:[];
  const asset=assets.slice().reverse().find(row=>String(row?.siteId||'')===siteId);
  if(!asset)return{status:'NOT_FOUND',reason:'PLAYER_MINE_ASSET_NOT_FOUND',countryId:cid,siteId};
  const previousStatus=String(asset.status||'NOT_RECORDED').trim().toUpperCase();
  if(['DECOMMISSIONED','DESTROYED'].includes(previousStatus))
    return{status:'DECOMMISSIONED',countryId:cid,siteId,idempotent:true,productionStatus:'STOPPED',historyPreserved:true};
  asset.status='DECOMMISSIONED';
  asset.operationalStatus='STOPPED';
  asset.productionStatus='STOPPED';
  asset.decommissionedTurn=turn();
  asset.decommissionedDate=factoryCurrentGameDate();
  asset.decommissionedByPlayer=true;
  asset.activeProductionCycleId=null;
  asset.productionHealth={...(asset.productionHealth||{}),status:'STOPPED',currentOutput:0,
    reason:'MINE_DECOMMISSIONED_BY_PLAYER',updatedTurn:turn()};
  const network=netState(cid);
  network.mineDecommissionHistory=Array.isArray(network.mineDecommissionHistory)?network.mineDecommissionHistory:[];
  const record={status:'DECOMMISSIONED',countryId:cid,siteId,resourceId:String(asset.resourceId||''),
    mineAssetId:String(asset.id||asset.assetId||siteId),turn:turn(),date:asset.decommissionedDate,
    priorStatus:previousStatus,productionStatus:'STOPPED',historyPreserved:true,
    stockPreserved:true,authority:'OMEGA_MINE_DECOMMISSION_API_V1'};
  network.mineDecommissionHistory.push(clone(record));
  network.mineDecommissionHistory=network.mineDecommissionHistory.slice(-MAX_EVENTS);
  network.events=Array.isArray(network.events)?network.events:[];
  network.events.push(clone(record));
  network.events=network.events.slice(-MAX_EVENTS);
  emit('OMEGA_RESOURCE_MINE_DECOMMISSIONED',cid,record);
  emit('OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',cid,{siteId,resourceId:record.resourceId,status:'DECOMMISSIONED',turn:turn()});
  return record;
}

function factoryCatalogDiagnostics(){
  const catalog=cat()||{},profiles=catalog.factoryProfiles||{},downstream=catalog.downstreamFactoryRecipes||{};
  const processing=processRules(),profileTypes=new Set(Object.keys(profiles));
  const allTypes=new Set([...Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase()),...Object.keys(profiles),
    ...Object.values(downstream).map(x=>String(x?.factoryType||'').toUpperCase())].filter(Boolean));
  const issues=[];
  for(const [type,profile] of Object.entries(profiles)){
    if(!profile?.iconId)issues.push({code:'FACTORY_ICON_ID_MISSING',factoryType:type});
    if(!(num(profile?.defaultCapacityPerDay)>0))issues.push({code:'FACTORY_CAPACITY_INVALID',factoryType:type});
    if(!(num(profile?.constructionCost)>0)||!(num(profile?.constructionDays)>0))issues.push({code:'FACTORY_CONSTRUCTION_PROFILE_INVALID',factoryType:type});
    if(profile?.authority!=='SIMULATED_GAMEPLAY_PROFILE'||profile?.simulationOnly!==true)issues.push({code:'FACTORY_PROFILE_PROVENANCE_MISSING',factoryType:type});
    const bom=profile?.constructionMaterials;
    if(!bom||typeof bom!=='object'||Array.isArray(bom)||!Object.keys(bom).length)issues.push({code:'FACTORY_CONSTRUCTION_BOM_MISSING',factoryType:type});
    else for(const [material,quantity] of Object.entries(bom)){
      if(!Object.keys(catalog.resourceRules||{}).some(key=>tok(key)===tok(material)))issues.push({code:'FACTORY_CONSTRUCTION_RESOURCE_UNREGISTERED',factoryType:type,resourceId:material});
      if(!(num(quantity)>0))issues.push({code:'FACTORY_CONSTRUCTION_MATERIAL_QUANTITY_INVALID',factoryType:type,resourceId:material,quantity});
    }
    const employment=profile?.employment;
    if(!(num(employment?.jobsPerFactory)>0)||employment?.simulationOnly!==true||!employment?.hiringSource)
      issues.push({code:'FACTORY_EMPLOYMENT_PROFILE_INVALID',factoryType:type});
    if(!num(profile?.constructionDays)||num(profile?.constructionDays)<=0)issues.push({code:'FACTORY_CONSTRUCTION_DURATION_INVALID',factoryType:type});
    const utilities=profile?.utilities;
    if(!utilities||num(utilities.electricityMWhPerDay)===null||num(utilities.waterM3PerDay)===null||
      num(utilities.electricityMWhPerDay)<0||num(utilities.waterM3PerDay)<0||
      !(num(utilities.electricityMWhPerDay)>0)&&!(num(utilities.waterM3PerDay)>0))
      issues.push({code:'FACTORY_UTILITY_PROFILE_INVALID',factoryType:type});
    if(!Array.isArray(profile?.requiredInfrastructure)||!profile.requiredInfrastructure.some(x=>tok(x)==='power'))
      issues.push({code:'FACTORY_POWER_INFRASTRUCTURE_REQUIREMENT_MISSING',factoryType:type});
    const jobMix=employment?.jobBreakdown;
    const jobMixTotal=jobMix&&typeof jobMix==='object'&&!Array.isArray(jobMix)?Object.values(jobMix).reduce((sum,value)=>sum+(num(value)||0),0):null;
    if(jobMixTotal===null||Math.abs(jobMixTotal-(num(employment?.jobsPerFactory)||0))>1e-6||
      Math.abs((num(employment?.coreOperatingCrew)||0)+(num(employment?.additionalDirectStaffSlots)||0)-(num(employment?.jobsPerFactory)||0))>1e-6)
      issues.push({code:'FACTORY_EMPLOYMENT_ROLE_BREAKDOWN_MISMATCH',factoryType:type,jobMixTotal,jobsPerFactory:employment?.jobsPerFactory});
    for(const tech of profile?.requiredTechnologyIds||[])if(!techRules()[String(tech).toUpperCase()])issues.push({code:'FACTORY_TECHNOLOGY_UNDEFINED',factoryType:type,technologyId:tech});
  }
  for(const [resourceId,rule] of Object.entries(processing)){
    if(!(num(rule?.cycleDays)>0))issues.push({code:'PROCESSING_CYCLE_TIME_INVALID',resourceId,cycleDays:rule?.cycleDays});
    if(rule?.quantityBasis!=='PER_SIMULATION_PRODUCTION_UNIT'||rule?.cycleTimeUnit!=='IN_GAME_DAYS')
      issues.push({code:'PROCESSING_REQUIREMENT_CONTRACT_MISSING',resourceId});
    if(rule?.requiresAllInputs!==true||rule?.missingInputPolicy!=='BLOCK_CYCLE')
      issues.push({code:'PROCESSING_ATOMIC_INPUT_POLICY_MISSING',resourceId});
    for(const [inputId,coefficient] of Object.entries(rule?.inputs||{}))
      if(!tok(inputId)||!(num(coefficient)>0))issues.push({code:'PROCESSING_INPUT_COEFFICIENT_INVALID',resourceId,inputId,coefficient});
    for(const [outputId,coefficient] of Object.entries(rule?.outputs||{}))
      if(!tok(outputId)||!(num(coefficient)>0))issues.push({code:'PROCESSING_OUTPUT_COEFFICIENT_INVALID',resourceId,outputId,coefficient});
  }
  for(const type of new Set(Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase()).filter(Boolean)))
    if(!profileTypes.has(type))issues.push({code:'PROCESSING_FACTORY_PROFILE_MISSING',factoryType:type});
  for(const [id,recipe] of Object.entries(downstream)){
    const inputs=recipe?.inputs||{},outputs=recipe?.outputs||{};
    if(String(recipe?.recipeId||'')!==id)issues.push({code:'RECIPE_ID_KEY_MISMATCH',recipeId:id});
    if(!(num(recipe?.cycleDays)>0))issues.push({code:'DOWNSTREAM_CYCLE_TIME_INVALID',recipeId:id,cycleDays:recipe?.cycleDays});
    if(recipe?.quantityBasis!=='PER_SIMULATION_PRODUCTION_UNIT'||recipe?.cycleTimeUnit!=='IN_GAME_DAYS')
      issues.push({code:'DOWNSTREAM_REQUIREMENT_CONTRACT_MISSING',recipeId:id});
    if(!profiles[String(recipe?.factoryType||'').toUpperCase()])issues.push({code:'DOWNSTREAM_FACTORY_PROFILE_MISSING',recipeId:id,factoryType:recipe?.factoryType});
    if(Object.keys(inputs).length<2||Object.keys(outputs).length<1)issues.push({code:'DOWNSTREAM_RECIPE_SHAPE_INVALID',recipeId:id});
    for(const [resourceId,coefficient] of Object.entries(inputs))if(!tok(resourceId)||!(num(coefficient)>0))issues.push({code:'RECIPE_INPUT_COEFFICIENT_INVALID',recipeId:id,resourceId,coefficient});
    for(const [resourceId,coefficient] of Object.entries(outputs))if(!tok(resourceId)||!(num(coefficient)>0))issues.push({code:'RECIPE_OUTPUT_COEFFICIENT_INVALID',recipeId:id,resourceId,coefficient});
    const inputTotal=Object.values(inputs).reduce((sum,x)=>sum+(num(x)||0),0);
    const outputTotal=Object.values(outputs).reduce((sum,x)=>sum+(num(x)||0),0);
    if(Math.abs(inputTotal-outputTotal)>1e-6)issues.push({code:'RECIPE_SIMULATION_MASS_BALANCE_MISMATCH',recipeId:id,inputTotal,outputTotal});
    if(recipe?.simulationOnly!==true||recipe?.recipeAuthority!=='SIMULATED_GAMEPLAY_RULE')issues.push({code:'RECIPE_PROVENANCE_MISSING',recipeId:id});
  }
  const producerIds=new Set([
    ...Object.values(processing).flatMap(rule=>Object.keys(rule?.outputs||{})),
    ...Object.values(downstream).flatMap(rule=>Object.keys(rule?.outputs||{}))
  ].map(tok));
  const knownRawIds=new Set([
    ...Object.keys(catalog.resourceRules||{}),
    ...Object.values(processing).flatMap(rule=>Object.keys(rule?.inputs||{}))
  ].map(tok));
  const declaredExternalIds=new Set(Object.keys(catalog.externalInputSources||{}).map(tok));
  for(const [recipeId,recipe] of Object.entries(downstream)){
    for(const resourceId of Object.keys(recipe?.inputs||{})){
      const rid=tok(resourceId);
      if(!producerIds.has(rid)&&!knownRawIds.has(rid)&&!declaredExternalIds.has(rid))
        issues.push({code:'RECIPE_INPUT_SOURCE_UNREGISTERED',recipeId,resourceId});
      const external=Object.keys(catalog.externalInputSources||{}).find(key=>tok(key)===rid);
      if(external&&catalog.externalInputSources[external]?.requiresRecordedBatch!==true)
        issues.push({code:'EXTERNAL_RECIPE_INPUT_MUST_REQUIRE_RECORDED_STOCK',recipeId,resourceId});
      if(external&&catalog.externalInputSources[external]?.autoGenerateStock===true)
        issues.push({code:'EXTERNAL_RECIPE_INPUT_MUST_NOT_AUTOFABRICATE_STOCK',recipeId,resourceId});
    }
  }
  for(const [type,profile] of Object.entries(profiles)){
    if(profile?.defaultRecipeId&&!downstream[profile.defaultRecipeId])issues.push({code:'FACTORY_DEFAULT_RECIPE_MISSING',factoryType:type,recipeId:profile.defaultRecipeId});
  }
  return{status:issues.length?'DEGRADED':'HEALTHY',factoryTypeCount:allTypes.size,processingRuleCount:Object.keys(processing).length,
    legacyProcessingFactoryTypeCount:new Set(Object.values(processing).map(x=>String(x?.factoryType||'').toUpperCase())).size,
    profileCount:Object.keys(profiles).length,downstreamRecipeCount:Object.keys(downstream).length,categoryCount:(catalog.factoryCatalogPolicy?.categoryOrder||[]).length,
    issues};
}
function gameplayPipelineDiagnostics(countryScope){
  const sites=masterSites();
  // UI callers that inspect one selected country must not synchronously scan every
  // country's ledger on the WebView main thread. Keep the no-argument global contract
  // intact for world diagnostics and aggregate pipeline verification.
  const scopeText=countryScope==null?'':String(countryScope).trim();
  const hasScope=scopeText.length>0;
  const resolvedScope=hasScope?canonicalCountry(scopeText):null;
  const scopedCountry=resolvedScope&&/^[A-Z]{3}$/.test(resolvedScope)?resolvedScope:null;
  // A supplied but unresolvable scope must fail closed instead of silently reverting
  // to the expensive global scan.
  const countries=hasScope?(scopedCountry?[scopedCountry]:[]):runtimeCountryIds();
  const siteCounts=Object.create(null);
  for(const site of sites){
    const cid=canonicalCountry(site?.countryId);
    if(cid)siteCounts[cid]=(siteCounts[cid]||0)+1;
  }
  const isCurrentlyBlocked=flow=>{
    const status=String(flow?.status||'').toUpperCase();
    return status.includes('BLOCKED')||status==='PUBLICATION_ATTEMPTED'||
      status==='EXTRACTED_AWAITING_ROUTE'||status==='EXTRACTED_AWAITING_FACTORY';
  };
  const perCountry=countries.map(c=>{
    const flows=siteFlowRows(c),network=netState(c),stages={};
    let dispatched=0,processed=0,marketPublished=0,treasuryReceipts=0,blocked=0,awaitingTransportCapacity=0;
    const blockedFlows=[],awaitingCapacityFlows=[];
    for(const flow of flows){
      const flowStages=Array.isArray(flow?.stages)?flow.stages:[];
      let hasDispatched=false,hasProcessed=false,hasMarketPublication=false;
      for(const step of flowStages){
        stages[step.stage]=(stages[step.stage]||0)+1;
        const stage=String(step.stage||'').toUpperCase(),status=String(step.status||'').toUpperCase();
        if(stage==='TRANSPORT'&&['IN_TRANSIT','DELIVERED'].includes(status))hasDispatched=true;
        if(stage==='PROCESSING'&&status==='COMPLETED')hasProcessed=true;
        if(stage==='MARKET'&&status==='PUBLISHED')hasMarketPublication=true;
      }
      if(hasDispatched)dispatched++;
      if(hasProcessed)processed++;
      if(hasMarketPublication)marketPublished++;
      treasuryReceipts+=(Array.isArray(flow?.treasurySettlements)?flow.treasurySettlements.length:0);
      if(String(flow?.status||'').toUpperCase()==='AWAITING_CAPACITY'){
        awaitingTransportCapacity++;
        awaitingCapacityFlows.push({siteId:flow.siteId,resourceId:flow.resourceId,batchId:flow.batchId,
          reason:flow.transportQueueReason||'TRANSPORT_CAPACITY_EXHAUSTED'});
      }
      if(isCurrentlyBlocked(flow)){
        blocked++;
        blockedFlows.push({siteId:flow.siteId,resourceId:flow.resourceId,batchId:flow.batchId,status:flow.status,
          blockReason:flow.blockReason||flow.lastResidualBlockReason||null,
          stages:flowStages.filter(s=>['BLOCKED','RESIDUAL_BLOCKED'].includes(s.status))
            .map(s=>({stage:s.stage,status:s.status,reason:s.reason||null,detail:s.detail||null}))});
      }
    }
    const shipments=Array.isArray(network.shipments)?network.shipments:[];
    return{countryId:c,registrySiteCount:siteCounts[c]||0,extractionFlows:flows.length,dispatched,processed,marketPublished,
      treasuryReceipts,blocked,blockedFlows,awaitingTransportCapacity,awaitingCapacityFlows,shipmentCount:shipments.length,stages};
  });
  return{contract:'OMEGA_SITE_FLOW_PIPELINE_V1',version:VERSION,turn:turn(),registrySiteCount:sites.length,
    diagnosticScope:scopedCountry||(hasScope?'UNRESOLVED':'GLOBAL'),countryCount:countries.length,
    flowCount:perCountry.reduce((n,x)=>n+x.extractionFlows,0),dispatched:perCountry.reduce((n,x)=>n+x.dispatched,0),
    processed:perCountry.reduce((n,x)=>n+x.processed,0),marketPublished:perCountry.reduce((n,x)=>n+x.marketPublished,0),
    treasuryReceipts:perCountry.reduce((n,x)=>n+x.treasuryReceipts,0),blocked:perCountry.reduce((n,x)=>n+x.blocked,0),
    awaitingTransportCapacity:perCountry.reduce((n,x)=>n+x.awaitingTransportCapacity,0),perCountry};
}
function api(){
  return Object.freeze({VERSION,loadCatalog,planExtraction,planShipment,dispatchShipment,dispatchFactoryInputShipment,advanceShipments,quoteMineProject,startMineProject,startFactoryProject,startInfrastructureProject,startPadmaCorridorProject,advanceProjects,startTechnologyProject,executeFactoryCycle,executeSitePipeline,diagnostics,gameplayPipelineDiagnostics,factoryCatalogDiagnostics,factoryProductionRequirements,factoryProductionStatus,decommissionFactory,decommissionMine,startFactoryProductionCycle,transferFactoryInputsFromWarehouse,processPendingFactoryInputs,factoryUtilityDiagnostics,factoryConstructionMaterialQuote,reconcileFactoryEmployment,normalizeInfrastructure,candidateFactories,recipeFor,processPendingFactoryInputs,resourceMethod,buildRoute});
}
g.Omega=g.Omega||{};g.Omega.ResourceIndustrialNetwork=api();g.OmegaResourceIndustrialNetwork=g.Omega.ResourceIndustrialNetwork;

function boot(){
  loadCatalog().then(()=>{emit('OMEGA_RESOURCE_INDUSTRIAL_NETWORK_READY','GLOBAL',{version:VERSION,catalogResourceRules:Object.keys(rules()).length,factoryRules:Object.keys(processRules()).length})}).catch(()=>{});
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',async()=>{
      const countryId=playerSimulationCountryId();
      if(!countryId)return {status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
      await loadCatalog();
      try{
        await advanceShipments(countryId);
        await advanceProjects(countryId);
        await processPendingFactoryInputs(countryId);
        reconcileFactoryEmployment(countryId);
        return {status:'COMPLETED',countryId,turn:turn()};
      }catch(error){
        throw new Error('INDUSTRIAL_TURN_FAILED:'+countryId+':'+String(error?.message||error));
      }
    });
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',onExtractionCommitted);
    g.addEventListener('OMEGA_RESOURCE_EXTRACTION_BLOCKED',onExtractionBlocked);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',onFinishedGoodsRegistered);
    g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED',onEconomyMarketPublication);
    g.addEventListener('OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',onDomesticSaleSettled);
    g.addEventListener('OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',onExtractionFiscalPosted);
    g.addEventListener('OMEGA_RESOURCE_TRADE_RECONCILED',onTreasurySettlement);
    g.addEventListener('OMEGA_READY',()=>loadCatalog());
    g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>loadCatalog());
  }
}
boot();

})(typeof window!=='undefined'?window:globalThis);
