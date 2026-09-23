/* OMEGA AUTONOMOUS WORLD SIMULATION CORE v4.2.0 */
(function(g){'use strict';
const V='4.2.0',SV=6,MAX=4000;
const LAYERS=['DATA_INTAKE','CANONICAL_IDENTITY','CAPABILITY_REGISTRY','WORLD_STATE_KERNEL','DEPENDENCY_GRAPH','DEMAND_ENGINE','SUPPLY_CAPACITY_ENGINE','NEED_GAP_PRESSURE_ENGINE','SCENARIO_ENGINE','GOAL_PRIORITY_ENGINE','DECISION_ENGINE','FEASIBILITY_ENGINE','PROJECT_ENGINE','TRANSACTION_ENGINE','TRADE_MARKET_ENGINE','FINANCE_ENGINE','INFRA_LOGISTICS_ENGINE','POPULATION_LABOR_ENGINE','TECH_PRODUCTIVITY_ENGINE','POLICY_INSTITUTION_ENGINE','EVENT_SHOCK_ENGINE','CONSEQUENCE_ENGINE','FORECAST_ENGINE','ACTOR_MEMORY_ADAPTATION','MULTI_RATE_SCHEDULER','STATE_RECONCILIATION','EVIDENCE_TRACE','RUNTIME_DEBUG'].map((x,i)=>({id:'L'+String(i).padStart(2,'0')+'_'+x,index:i}));
const DATASETS={countries:['countries.json',1],economy:['economy.json',0],population:['population.json',0],resources:['resources.json',0],cities:['cities.json',0],world:['world.json',0],industry:['industry.json',0],infrastructure:['infrastructure.json',0],finance:['finance.json',0],projects:['projects.json',0],relations:['relations.json',0],events:['events.json',0],organizations:['organizations.json',0],companies:['companies.json',0],institutions:['institutions.json',0]};
const SIGNALS={POPULATION:[],POPULATION_GROWTH:[],FOOD_DEMAND:[],FOOD_SUPPLY:[],HOUSING_DEMAND:[],HOUSING_SUPPLY:[],ENERGY_DEMAND:[],ENERGY_SUPPLY:[],RESOURCE_DEMAND:[],RESOURCE_STOCK:[],RESOURCE_RESERVE:[],RESOURCE_PRODUCTION:[],PRODUCTION_CAPACITY:[],EFFECTIVE_CAPACITY:[],CAPACITY_UTILIZATION:[],INPUT_AVAILABILITY:[],OUTPUT:[],PRODUCTIVITY:[],LABOR_AVAILABILITY:[],SKILLED_LABOR:[],UNEMPLOYMENT:[],WAGE_PRESSURE:[],HOUSEHOLD_INCOME:[],CONSUMER_DEMAND:[],INFLATION:[],GDP_GROWTH:[],REVENUE:[],EXPENDITURE:[],LIQUIDITY:[],CAPITAL_AVAILABILITY:[],DEBT_SERVICE_PRESSURE:[],FOREIGN_CURRENCY:[],TRADE_DEFICIT_PRESSURE:[],IMPORT_DEPENDENCE:[],EXPORT_DEMAND:[],INVESTMENT_DEMAND:[],MARKET_PRICE:[],TRADE_ROUTE_CAPACITY:[],TRANSPORT_CAPACITY:[],INFRASTRUCTURE_CAPACITY:[],LOGISTICS_CONGESTION:[],NETWORK_FAILURE_RISK:[],MAINTENANCE_BACKLOG:[],PROJECT_DELAY:[],ASSET_AGE:[],STABILITY:[],CORRUPTION:[],SECURITY_THREAT:[],FOREIGN_TENSION:[],MILITARY_READINESS:[],TECHNOLOGY_CAPABILITY:[],R_AND_D_CAPABILITY:[],HEALTH_CAPACITY:[],HEALTH_PRESSURE:[],EDUCATION_CAPACITY:[],PUBLIC_SERVICE_CAPACITY:[],MIGRATION_PRESSURE:[],WELFARE_PRESSURE:[],DISASTER_DAMAGE:[],FORECAST_SHORTFALL:[],SAVINGS:[],INTEREST_PRESSURE:[],SUPPLIER_CONCENTRATION:[]};
const DIR={};for(const k of Object.keys(SIGNALS))DIR[k]={problemWhen:null,opportunityWhen:null};
Object.assign(DIR,{POPULATION:{problemWhen:'CONTEXT'},POPULATION_GROWTH:{problemWhen:'CONTEXT'},FOOD_DEMAND:{problemWhen:'RISING'},FOOD_SUPPLY:{problemWhen:'FALLING',opportunityWhen:'RISING'},HOUSING_DEMAND:{problemWhen:'RISING'},HOUSING_SUPPLY:{problemWhen:'FALLING',opportunityWhen:'RISING'},ENERGY_DEMAND:{problemWhen:'RISING'},ENERGY_SUPPLY:{problemWhen:'FALLING',opportunityWhen:'RISING'},RESOURCE_DEMAND:{problemWhen:'RISING'},RESOURCE_STOCK:{problemWhen:'FALLING',opportunityWhen:'RISING'},RESOURCE_RESERVE:{problemWhen:'FALLING',opportunityWhen:'RISING'},RESOURCE_PRODUCTION:{problemWhen:'FALLING',opportunityWhen:'RISING'},PRODUCTION_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},EFFECTIVE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},CAPACITY_UTILIZATION:{problemWhen:'RISING'},INPUT_AVAILABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},OUTPUT:{problemWhen:'FALLING',opportunityWhen:'RISING'},PRODUCTIVITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},LABOR_AVAILABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},SKILLED_LABOR:{problemWhen:'FALLING',opportunityWhen:'RISING'},UNEMPLOYMENT:{problemWhen:'RISING'},WAGE_PRESSURE:{problemWhen:'RISING'},HOUSEHOLD_INCOME:{problemWhen:'FALLING',opportunityWhen:'RISING'},CONSUMER_DEMAND:{problemWhen:'RISING',opportunityWhen:'RISING'},INFLATION:{problemWhen:'RISING'},GDP_GROWTH:{problemWhen:'FALLING',opportunityWhen:'RISING'},REVENUE:{problemWhen:'FALLING',opportunityWhen:'RISING'},EXPENDITURE:{problemWhen:'RISING'},LIQUIDITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},CAPITAL_AVAILABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},DEBT_SERVICE_PRESSURE:{problemWhen:'RISING'},FOREIGN_CURRENCY:{problemWhen:'FALLING',opportunityWhen:'RISING'},TRADE_DEFICIT_PRESSURE:{problemWhen:'RISING'},IMPORT_DEPENDENCE:{problemWhen:'RISING'},EXPORT_DEMAND:{problemWhen:'RISING',opportunityWhen:'RISING'},INVESTMENT_DEMAND:{problemWhen:'RISING',opportunityWhen:'RISING'},MARKET_PRICE:{problemWhen:'RISING'},TRADE_ROUTE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},TRANSPORT_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},INFRASTRUCTURE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},LOGISTICS_CONGESTION:{problemWhen:'RISING'},NETWORK_FAILURE_RISK:{problemWhen:'RISING'},MAINTENANCE_BACKLOG:{problemWhen:'RISING'},PROJECT_DELAY:{problemWhen:'RISING'},ASSET_AGE:{problemWhen:'RISING'},STABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},CORRUPTION:{problemWhen:'RISING'},SECURITY_THREAT:{problemWhen:'RISING'},FOREIGN_TENSION:{problemWhen:'RISING'},MILITARY_READINESS:{problemWhen:'FALLING',opportunityWhen:'RISING'},TECHNOLOGY_CAPABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},R_AND_D_CAPABILITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},HEALTH_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},HEALTH_PRESSURE:{problemWhen:'RISING'},EDUCATION_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},PUBLIC_SERVICE_CAPACITY:{problemWhen:'FALLING',opportunityWhen:'RISING'},MIGRATION_PRESSURE:{problemWhen:'RISING'},WELFARE_PRESSURE:{problemWhen:'RISING'},DISASTER_DAMAGE:{problemWhen:'RISING'},FORECAST_SHORTFALL:{problemWhen:'RISING'},SAVINGS:{problemWhen:'FALLING',opportunityWhen:'RISING'},INTEREST_PRESSURE:{problemWhen:'RISING'},SUPPLIER_CONCENTRATION:{problemWhen:'RISING'}});
const FIELD_ALIASES={POPULATION:['population','population_total','total_population','population_2015'],POPULATION_GROWTH:['population_growth','growth_rate','annual_growth','population_growth_rate','annual_growth_rate'],FOOD_DEMAND:['food_demand','food_consumption','food_requirement'],FOOD_SUPPLY:['food_supply','foodproduction','food_production','agricultural_output'],HOUSING_DEMAND:['housing_required','housing_demand','housing_requirement'],HOUSING_SUPPLY:['housing_available','housing_stock','dwellings','housing_capacity'],ENERGY_DEMAND:['energy_demand','power_demand','electricity_demand','energy_requirement'],ENERGY_SUPPLY:['energy_supply','power_generation','electricity_available','generation_capacity'],RESOURCE_DEMAND:['resource_demand','demand','consumption','requirement'],RESOURCE_STOCK:['resource_stock','inventory','stock','available_stock'],RESOURCE_RESERVE:['resource_reserve','reserve','reserves','strategic_reserve'],RESOURCE_PRODUCTION:['resource_production','production','extraction','generation','output'],PRODUCTION_CAPACITY:['production_capacity','installed_capacity','capacity'],EFFECTIVE_CAPACITY:['effective_capacity','effectiveCapacity','available_capacity'],CAPACITY_UTILIZATION:['utilization','capacity_utilization','utilisation'],INPUT_AVAILABILITY:['input_availability','inputs','materials','feedstock','available_inputs'],OUTPUT:['output','production','current_output','actual_output'],PRODUCTIVITY:['productivity','output_per_worker','efficiency','labor_productivity'],LABOR_AVAILABILITY:['labor_available','labour_available','workforce','workers','labor_supply','labour_supply'],SKILLED_LABOR:['skilled_labor','skilled_labour','skilled_workers'],UNEMPLOYMENT:['unemployment','unemployment_rate'],WAGE_PRESSURE:['wage_pressure','wage_growth'],HOUSEHOLD_INCOME:['household_income','household_earnings','income'],CONSUMER_DEMAND:['consumer_demand','household_demand'],INFLATION:['inflation','inflation_rate'],GDP_GROWTH:['gdp_growth','growth','real_growth'],REVENUE:['revenue','tax_revenue','government_revenue'],EXPENDITURE:['expenditure','spending','government_spending','public_spending'],LIQUIDITY:['liquidity','cash','available_cash'],CAPITAL_AVAILABILITY:['capital_available','investable_capital','available_capital'],DEBT_SERVICE_PRESSURE:['debt_service','debt_service_pressure','debt_burden'],FOREIGN_CURRENCY:['foreign_currency','fx_reserves','foreign_exchange','reserves'],TRADE_DEFICIT_PRESSURE:['trade_deficit','deficit_pressure','trade_balance_pressure'],IMPORT_DEPENDENCE:['import_dependence','import_dependency'],EXPORT_DEMAND:['export_demand','external_demand','market_demand'],INVESTMENT_DEMAND:['investment_demand','capital_demand'],MARKET_PRICE:['market_price','price','unit_price'],TRADE_ROUTE_CAPACITY:['route_capacity','port_capacity','shipping_capacity','rail_capacity'],TRANSPORT_CAPACITY:['transport_capacity','network_capacity'],INFRASTRUCTURE_CAPACITY:['infrastructure_capacity','grid_capacity','network_capacity'],LOGISTICS_CONGESTION:['logistics_congestion','congestion','network_congestion'],NETWORK_FAILURE_RISK:['network_failure','failure_risk','outage_risk'],MAINTENANCE_BACKLOG:['maintenance_backlog','backlog','deferred_maintenance'],PROJECT_DELAY:['project_delay','schedule_variance','delay'],ASSET_AGE:['asset_age','age','years_in_service'],STABILITY:['stability','political_stability','social_stability'],CORRUPTION:['corruption','corruption_index'],SECURITY_THREAT:['security_threat','threat','threat_level'],FOREIGN_TENSION:['foreign_tension','tension','diplomatic_tension'],MILITARY_READINESS:['military_readiness','readiness','force_readiness'],TECHNOLOGY_CAPABILITY:['technology_capability','technology','technology_index'],R_AND_D_CAPABILITY:['r_and_d','research','research_capability','rd_capability'],HEALTH_CAPACITY:['health_capacity','hospital_capacity','medical_capacity'],HEALTH_PRESSURE:['health_pressure','health_crisis','medical_pressure'],EDUCATION_CAPACITY:['education_capacity','school_capacity','enrollment_capacity'],PUBLIC_SERVICE_CAPACITY:['public_service_capacity','service_capacity','government_service_capacity'],MIGRATION_PRESSURE:['migration_pressure','migration','net_migration_pressure'],WELFARE_PRESSURE:['welfare_pressure','social_pressure'],DISASTER_DAMAGE:['disaster_damage','damage','displacement','disaster_loss'],FORECAST_SHORTFALL:['forecast_shortfall','shortfall','projected_shortfall'],SAVINGS:['savings','national_savings','household_savings'],INTEREST_PRESSURE:['interest_pressure','interest_rate_pressure'],SUPPLIER_CONCENTRATION:['supplier_concentration','supplier_dependency']};
const STATE_PATHS={POPULATION:['population.population','population.total'],POPULATION_GROWTH:['population.growth_rate'],FOOD_DEMAND:['resource.demand.food','economy.foodDemand'],FOOD_SUPPLY:['resource.supply.food','resource.production.food','economy.foodSupply'],HOUSING_DEMAND:['cities.housing.required','population.housing.required'],HOUSING_SUPPLY:['cities.housing.available','cities.housing.stock'],ENERGY_DEMAND:['resource.demand.energy','economy.energyDemand'],ENERGY_SUPPLY:['resource.supply.energy','resource.production.energy','infrastructure.energy.available'],RESOURCE_DEMAND:['resource.demand.total','economy.resourceDemand'],RESOURCE_STOCK:['resource.inventory','resource.stock'],RESOURCE_RESERVE:['resource.reserve','resource.reserves'],RESOURCE_PRODUCTION:['resource.production','industry.resourceProduction'],PRODUCTION_CAPACITY:['industry.capacity','economy.productionCapacity'],EFFECTIVE_CAPACITY:['industry.effectiveCapacity'],CAPACITY_UTILIZATION:['industry.utilization'],INPUT_AVAILABILITY:['industry.inputs.available'],OUTPUT:['industry.output','economy.production'],PRODUCTIVITY:['industry.productivity','economy.productivity'],LABOR_AVAILABILITY:['population.labor.available','economy.labor.available'],SKILLED_LABOR:['population.labor.skilled','economy.labor.skilled'],UNEMPLOYMENT:['economy.unemployment','population.unemployment'],WAGE_PRESSURE:['economy.wagePressure'],HOUSEHOLD_INCOME:['economy.householdIncome'],CONSUMER_DEMAND:['economy.consumerDemand'],INFLATION:['economy.inflation'],GDP_GROWTH:['economy.gdp_growth'],REVENUE:['finance.revenue','economy.revenue'],EXPENDITURE:['finance.expenditure','economy.expenditure'],LIQUIDITY:['finance.liquidity'],CAPITAL_AVAILABILITY:['finance.capitalAvailable'],DEBT_SERVICE_PRESSURE:['finance.debtServicePressure'],FOREIGN_CURRENCY:['finance.foreignCurrency'],TRADE_DEFICIT_PRESSURE:['trade.deficitPressure'],IMPORT_DEPENDENCE:['trade.importDependence'],EXPORT_DEMAND:['trade.exportDemand'],INVESTMENT_DEMAND:['finance.investmentDemand','economy.investmentDemand'],MARKET_PRICE:['trade.marketPrice','economy.marketPrice'],TRADE_ROUTE_CAPACITY:['trade.routeCapacity','transport.routeCapacity'],TRANSPORT_CAPACITY:['transport.capacity'],INFRASTRUCTURE_CAPACITY:['infrastructure.capacity'],LOGISTICS_CONGESTION:['transport.logisticsCongestion'],NETWORK_FAILURE_RISK:['infrastructure.failureRisk'],MAINTENANCE_BACKLOG:['projects.maintenanceBacklog','infrastructure.maintenanceBacklog'],PROJECT_DELAY:['projects.delay'],ASSET_AGE:['projects.assetAge','industry.assetAge'],STABILITY:['interior.stability'],CORRUPTION:['interior.corruption'],SECURITY_THREAT:['defense.threatLevel','relations.securityThreat'],FOREIGN_TENSION:['relations.foreignTension'],MILITARY_READINESS:['military.readiness','defense.readiness'],TECHNOLOGY_CAPABILITY:['technology.capability'],R_AND_D_CAPABILITY:['technology.r_and_d'],HEALTH_CAPACITY:['health.capacity'],HEALTH_PRESSURE:['health.pressure'],EDUCATION_CAPACITY:['education.capacity'],PUBLIC_SERVICE_CAPACITY:['interior.serviceCapacity'],MIGRATION_PRESSURE:['population.migrationPressure'],WELFARE_PRESSURE:['population.welfarePressure'],DISASTER_DAMAGE:['infrastructure.disasterDamage','population.displacementPressure'],FORECAST_SHORTFALL:['forecasts.shortfall'],SAVINGS:['finance.savings'],INTEREST_PRESSURE:['finance.interestPressure'],SUPPLIER_CONCENTRATION:['trade.supplierConcentration']};
const REL={RESOURCE:['resource.demand.total','resource.supply.effective','SHORTAGE'],RESOURCE_SURPLUS:['resource.supply.total','resource.demand.total','OPPORTUNITY'],FOOD:['resource.demand.food','resource.supply.food','SHORTAGE'],ENERGY:['resource.demand.energy','resource.supply.energy','SHORTAGE'],HOUSING:['cities.housing.required','cities.housing.available','SHORTAGE'],INDUSTRIAL_INPUT:['industry.inputs.required','industry.inputs.available','SHORTAGE'],PRODUCTION:['industry.demand','industry.effectiveCapacity','CAPACITY'],LABOR:['industry.labor.required','population.labor.available','SHORTAGE'],INFRASTRUCTURE:['infrastructure.load','infrastructure.capacity','BOTTLENECK'],FISCAL:['finance.expenditure','finance.revenue','DEFICIT'],TRADE:['trade.imports','trade.exports','DEFICIT'],CAPITAL:['finance.operationalRequirement','finance.capitalAvailable','SHORTAGE'],CAPITAL_SURPLUS:['finance.capitalAvailable','finance.operationalRequirement','OPPORTUNITY'],RESERVE_BELOW_TARGET:['resource.reserveTarget','resource.reserve','SHORTAGE'],RESERVE_ABOVE_TARGET:['resource.reserve','resource.reserveTarget','OPPORTUNITY'],LOGISTICS:['supply.available','supply.reachable','BOTTLENECK'],DOMESTIC_SURPLUS_EXISTS:['economy.outputSurplus','economy.internalRequirement','OPPORTUNITY'],EXTERNAL_DEMAND_EXISTS:['trade.externalDemand','trade.currentExports','OPPORTUNITY'],ROUTE_CAPACITY_AVAILABLE:['trade.routeCapacity','trade.routeLoad','CAPACITY'],UNUSED_CAPACITY_EXISTS:['industry.effectiveCapacity','industry.currentOutput','OPPORTUNITY'],MARKET_DEMAND_EXISTS:['industry.demand','industry.output','OPPORTUNITY'],CAPITAL_FEASIBLE:['finance.capitalAvailable','projects.requiredCapital','CAPACITY'],PUBLIC_SERVICE:['population.serviceDemand','interior.serviceCapacity','SHORTAGE'],HEALTH:['health.demand','health.capacity','SHORTAGE'],EDUCATION:['education.demand','education.capacity','SHORTAGE'],CONSUMER_MARKET:['economy.consumerDemand','economy.output','OPPORTUNITY'],EXPORT_CAPACITY:['trade.externalDemand','trade.exportCapacity','OPPORTUNITY']};
const ACTIONS={
IMPORT:{execution:'TRANSACTION',owner:'trade',caps:['RESOURCE_DEMAND'],domains:['resources','trade','finance']},EXPORT:{execution:'TRANSACTION',owner:'trade',caps:['EXPORT_DEMAND','OUTPUT'],domains:['trade','finance','production']},DOMESTIC_EXPANSION:{execution:'PROJECT',owner:'projects',caps:['PRODUCTION_CAPACITY'],domains:['production','resources','labor']},RESERVE_RELEASE:{execution:'TRANSACTION',owner:'resource',caps:['RESOURCE_RESERVE'],domains:['resources','welfare']},RESERVE_BUILD:{execution:'PROJECT_OR_TRANSACTION',owner:'resource',caps:['RESOURCE_RESERVE'],domains:['resources','finance']},SUBSTITUTION:{execution:'POLICY_OR_PROJECT',owner:'economy',caps:['INPUT_AVAILABILITY'],domains:['production','resources']},EFFICIENCY:{execution:'POLICY_OR_PROJECT',owner:'technology',caps:['PRODUCTIVITY'],domains:['production','resources','energy']},SUPPLIER_CHANGE:{execution:'TRANSACTION_OR_POLICY',owner:'trade',caps:['EXPORT_DEMAND'],domains:['trade','resources']},DEMAND_MANAGEMENT:{execution:'POLICY',owner:'economy',caps:['CONSUMER_DEMAND'],domains:['demand','welfare','inflation']},PROCESSING_EXPANSION:{execution:'PROJECT',owner:'projects',caps:['OUTPUT'],domains:['industry','resources','trade']},HOUSING_BUILD:{execution:'PROJECT',owner:'projects',caps:['HOUSING_DEMAND','HOUSING_SUPPLY'],domains:['housing','infrastructure','labor']},INDUSTRY_BUILD:{execution:'PROJECT',owner:'projects',caps:['PRODUCTION_CAPACITY'],domains:['industry','labor','energy','resources','trade']},PROJECT_INVESTMENT:{execution:'PROJECT',owner:'projects',caps:['CAPITAL_AVAILABILITY'],domains:['industry','infrastructure','technology']},FINANCIAL_TRANSACTION:{execution:'TRANSACTION',owner:'finance',caps:['LIQUIDITY'],domains:['finance','economy']},DEBT_MANAGEMENT:{execution:'TRANSACTION_OR_POLICY',owner:'finance',caps:['DEBT_SERVICE_PRESSURE'],domains:['finance','economy','welfare']},INFRASTRUCTURE_EXPANSION:{execution:'PROJECT',owner:'projects',caps:['INFRASTRUCTURE_CAPACITY'],domains:['infrastructure','logistics','production']},MAINTENANCE:{execution:'PROJECT_OR_TRANSACTION',owner:'projects',caps:['MAINTENANCE_BACKLOG'],domains:['assets','production','infrastructure']},REPAIR:{execution:'PROJECT',owner:'projects',caps:['DISASTER_DAMAGE'],domains:['assets','infrastructure','production']},MODERNIZATION:{execution:'PROJECT',owner:'projects',caps:['TECHNOLOGY_CAPABILITY'],domains:['technology','productivity','production']},R_AND_D:{execution:'PROJECT',owner:'projects',caps:['R_AND_D_CAPABILITY'],domains:['technology','productivity']},EDUCATION_INVESTMENT:{execution:'PROJECT',owner:'projects',caps:['EDUCATION_CAPACITY'],domains:['education','labor','technology']},TRAINING:{execution:'PROJECT_OR_POLICY',owner:'education',caps:['SKILLED_LABOR','EDUCATION_CAPACITY'],domains:['labor','productivity']},MIGRATION_POLICY:{execution:'POLICY',owner:'interior',caps:['MIGRATION_PRESSURE'],domains:['population','labor','housing']},DIPLOMATIC_ADJUSTMENT:{execution:'POLICY',owner:'foreign',caps:['FOREIGN_TENSION'],domains:['foreign','trade','security']},SECURITY_PREPARATION:{execution:'PROJECT_OR_POLICY',owner:'defense',caps:['SECURITY_THREAT'],domains:['security','finance','resources']},EMERGENCY_RESPONSE:{execution:'PROJECT_OR_TRANSACTION',owner:'cabinet',caps:['DISASTER_DAMAGE'],domains:['disaster','health','infrastructure','welfare']},POLICY_REVIEW:{execution:'POLICY',owner:'cabinet',caps:[],domains:['institution','policy']}};
const SCENARIO_ROWS=[
['RESOURCE_DEFICIT','resources','PRESSURE',['REL','RESOURCE'],['IMPORT','DOMESTIC_EXPANSION','RESERVE_RELEASE','SUBSTITUTION','EFFICIENCY','SUPPLIER_CHANGE','RESERVE_BUILD']],['RESOURCE_SURPLUS','resources','OPPORTUNITY',['REL','RESOURCE_SURPLUS'],['EXPORT','PROCESSING_EXPANSION','RESERVE_BUILD','INDUSTRY_BUILD','PROJECT_INVESTMENT']],['POPULATION_DEMAND_EXPANSION','population','DRIVER',['SIG','POPULATION_GROWTH','RISING'],['HOUSING_BUILD','DOMESTIC_EXPANSION','EDUCATION_INVESTMENT','INFRASTRUCTURE_EXPANSION','TRAINING']],['HOUSING_SHORTAGE','housing','PRESSURE',['REL','HOUSING'],['HOUSING_BUILD','INFRASTRUCTURE_EXPANSION','PROJECT_INVESTMENT']],['FOOD_SHORTAGE','food','PRESSURE',['REL','FOOD'],['DOMESTIC_EXPANSION','IMPORT','RESERVE_RELEASE','PROCESSING_EXPANSION','INFRASTRUCTURE_EXPANSION']],['ENERGY_SHORTAGE','energy','PRESSURE',['REL','ENERGY'],['DOMESTIC_EXPANSION','IMPORT','INFRASTRUCTURE_EXPANSION','EFFICIENCY','SUBSTITUTION']],['INDUSTRIAL_INPUT_SHORTAGE','industry','PRESSURE',['REL','INDUSTRIAL_INPUT'],['IMPORT','SUBSTITUTION','SUPPLIER_CHANGE','RESERVE_BUILD','DOMESTIC_EXPANSION']],['FACTORY_EXPANSION','industry','OPPORTUNITY',['REL','PRODUCTION'],['INDUSTRY_BUILD','PROJECT_INVESTMENT','IMPORT','MODERNIZATION','EFFICIENCY']],['INVESTMENT_OPPORTUNITY','investment','OPPORTUNITY',['SIG','INVESTMENT_DEMAND','RISING'],['PROJECT_INVESTMENT','INDUSTRY_BUILD','INFRASTRUCTURE_EXPANSION','R_AND_D']],['CAPITAL_SURPLUS','finance','OPPORTUNITY',['REL','CAPITAL_SURPLUS'],['PROJECT_INVESTMENT','INFRASTRUCTURE_EXPANSION','R_AND_D','RESERVE_BUILD','DEBT_MANAGEMENT']],['FISCAL_DEFICIT','finance','PRESSURE',['REL','FISCAL'],['DEBT_MANAGEMENT','FINANCIAL_TRANSACTION','PROJECT_INVESTMENT','DEMAND_MANAGEMENT']],['TRADE_DEFICIT','trade','PRESSURE',['REL','TRADE'],['DOMESTIC_EXPANSION','EXPORT','SUPPLIER_CHANGE','SUBSTITUTION','DEMAND_MANAGEMENT']],['EXPORT_OPPORTUNITY','trade','OPPORTUNITY',['ALL',['REL','DOMESTIC_SURPLUS_EXISTS'],['REL','EXTERNAL_DEMAND_EXISTS'],['REL','ROUTE_CAPACITY_AVAILABLE']],['EXPORT','INDUSTRY_BUILD','PROCESSING_EXPANSION','INFRASTRUCTURE_EXPANSION']],['EMPLOYMENT_PRESSURE','labor','PRESSURE',['SIG','UNEMPLOYMENT','RISING'],['INDUSTRY_BUILD','INFRASTRUCTURE_EXPANSION','TRAINING','PROJECT_INVESTMENT']],['LABOR_SHORTAGE','labor','PRESSURE',['REL','LABOR'],['TRAINING','MIGRATION_POLICY','MODERNIZATION','R_AND_D']],['INFRASTRUCTURE_BOTTLENECK','infrastructure','PRESSURE',['REL','INFRASTRUCTURE'],['INFRASTRUCTURE_EXPANSION','EFFICIENCY','DEMAND_MANAGEMENT']],['LOGISTICS_BOTTLENECK','logistics','PRESSURE',['REL','LOGISTICS'],['INFRASTRUCTURE_EXPANSION','SUPPLIER_CHANGE','RESERVE_BUILD']],['TECHNOLOGY_GAP','technology','PRESSURE',['SIG','TECHNOLOGY_CAPABILITY','FALLING'],['R_AND_D','MODERNIZATION','TRAINING','PROJECT_INVESTMENT']],['RESOURCE_RESERVE_DECLINE','resources','PRESSURE',['SIG','RESOURCE_RESERVE','FALLING'],['RESERVE_BUILD','IMPORT','DOMESTIC_EXPANSION','SUBSTITUTION','SUPPLIER_CHANGE']],['EXTERNAL_SHOCK','external','PRESSURE',['EVENT','EXTERNAL_SHOCK_ACTIVE'],['IMPORT','RESERVE_RELEASE','DIPLOMATIC_ADJUSTMENT','EMERGENCY_RESPONSE','SUPPLIER_CHANGE']],['MIGRATION_PRESSURE','population','PRESSURE',['SIG','MIGRATION_PRESSURE','RISING'],['HOUSING_BUILD','INDUSTRY_BUILD','MIGRATION_POLICY','INFRASTRUCTURE_EXPANSION']],['STRATEGIC_RESERVE_MANAGEMENT','resources','GOVERNANCE',['ANY',['REL','RESERVE_BELOW_TARGET'],['REL','RESERVE_ABOVE_TARGET']],['RESERVE_BUILD','RESERVE_RELEASE','IMPORT']],['MAINTENANCE_CAPACITY_DECAY','assets','PRESSURE',['SIG','MAINTENANCE_BACKLOG','RISING'],['MAINTENANCE','REPAIR','MODERNIZATION']],['DISASTER_RESPONSE','disaster','PRESSURE',['SIG','DISASTER_DAMAGE','RISING'],['EMERGENCY_RESPONSE','REPAIR','IMPORT','RESERVE_RELEASE','PROJECT_INVESTMENT']],['GROWTH_OPPORTUNITY','development','OPPORTUNITY',['ALL',['REL','UNUSED_CAPACITY_EXISTS'],['REL','MARKET_DEMAND_EXISTS'],['REL','CAPITAL_FEASIBLE']],['INDUSTRY_BUILD','INFRASTRUCTURE_EXPANSION','R_AND_D','PROJECT_INVESTMENT']]];

// Runtime calculation layer. It computes state relationships; it never supplies missing values.
const RUNTIME_COMPARATORS=Object.freeze({
  DEFICIT:'DEFICIT',
  SURPLUS:'SURPLUS',
  BALANCED:'BALANCED',
  UNKNOWN:'UNKNOWN'
});
const APPROVED_POLICY_OVERRIDES=Object.freeze({
  RESOURCE_DEFICIT:['IMPORT','DOMESTIC_EXPANSION','RESERVE_RELEASE','SUBSTITUTION','DEMAND_MANAGEMENT'],
  RESOURCE_SURPLUS:['EXPORT','PROCESSING_EXPANSION','RESERVE_BUILD','DOMESTIC_EXPANSION'],
  FOOD_SHORTAGE:['IMPORT','DOMESTIC_EXPANSION','RESERVE_RELEASE','PROCESSING_EXPANSION'],
  ENERGY_SHORTAGE:['IMPORT','DOMESTIC_EXPANSION','EFFICIENCY','SUBSTITUTION'],
  INDUSTRIAL_INPUT_SHORTAGE:['IMPORT','DOMESTIC_EXPANSION','SUBSTITUTION','SUPPLIER_CHANGE'],
  HOUSING_SHORTAGE:['HOUSING_BUILD','INFRASTRUCTURE_EXPANSION','PROJECT_INVESTMENT'],
  FACTORY_EXPANSION:['DOMESTIC_EXPANSION','PROCESSING_EXPANSION','PROJECT_INVESTMENT','MODERNIZATION'],
  INVESTMENT_OPPORTUNITY:['PROJECT_INVESTMENT','DOMESTIC_EXPANSION','INFRASTRUCTURE_EXPANSION','R_AND_D'],
  CAPITAL_SURPLUS:['PROJECT_INVESTMENT','INFRASTRUCTURE_EXPANSION','R_AND_D','RESERVE_BUILD','DEBT_MANAGEMENT'],
  FISCAL_DEFICIT:['DEBT_MANAGEMENT','FINANCIAL_TRANSACTION','DEMAND_MANAGEMENT'],
  TRADE_DEFICIT:['DOMESTIC_EXPANSION','SUPPLIER_CHANGE','SUBSTITUTION','DEMAND_MANAGEMENT'],
  EXPORT_OPPORTUNITY:['EXPORT','PROCESSING_EXPANSION','DOMESTIC_EXPANSION','INFRASTRUCTURE_EXPANSION'],
  EMPLOYMENT_PRESSURE:['DOMESTIC_EXPANSION','INFRASTRUCTURE_EXPANSION','TRAINING','PROJECT_INVESTMENT'],
  LABOR_SHORTAGE:['TRAINING','MIGRATION_POLICY','MODERNIZATION','R_AND_D'],
  INFRASTRUCTURE_BOTTLENECK:['INFRASTRUCTURE_EXPANSION','EFFICIENCY','DEMAND_MANAGEMENT'],
  LOGISTICS_BOTTLENECK:['INFRASTRUCTURE_EXPANSION','SUPPLIER_CHANGE','RESERVE_BUILD'],
  TECHNOLOGY_GAP:['R_AND_D','MODERNIZATION','TRAINING','PROJECT_INVESTMENT'],
  RESOURCE_RESERVE_DECLINE:['RESERVE_BUILD','IMPORT','DOMESTIC_EXPANSION','SUBSTITUTION'],
  EXTERNAL_SHOCK:['IMPORT','RESERVE_RELEASE','DIPLOMATIC_ADJUSTMENT','EMERGENCY_RESPONSE','SUPPLIER_CHANGE'],
  MIGRATION_PRESSURE:['HOUSING_BUILD','DOMESTIC_EXPANSION','MIGRATION_POLICY','INFRASTRUCTURE_EXPANSION'],
  STRATEGIC_RESERVE_MANAGEMENT:['RESERVE_BUILD','RESERVE_RELEASE','IMPORT'],
  MAINTENANCE_CAPACITY_DECAY:['MAINTENANCE','REPAIR','MODERNIZATION'],
  DISASTER_RESPONSE:['EMERGENCY_RESPONSE','REPAIR','IMPORT','RESERVE_RELEASE','PROJECT_INVESTMENT'],
  GROWTH_OPPORTUNITY:['DOMESTIC_EXPANSION','INFRASTRUCTURE_EXPANSION','R_AND_D','PROJECT_INVESTMENT']
});
const RUNTIME_ONLY_ACTIONS=Object.freeze({
  PRODUCTION_INCREASE:{execution:'OPERATION',owner:'economy',caps:['OUTPUT'],domains:['production','resources']},
  PRODUCTION_DECREASE:{execution:'OPERATION',owner:'economy',caps:['OUTPUT'],domains:['production','resources']},
  IMPORT_REDUCTION:{execution:'OPERATION',owner:'trade',caps:['IMPORT_DEPENDENCE'],domains:['trade','resources','demand']},
  HOLD:{execution:'NONE',owner:'economy',caps:[],domains:[]}
});
Object.assign(ACTIONS,RUNTIME_ONLY_ACTIONS);

const CLONE=(v,s=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(s.has(v))return s.get(v);if(Array.isArray(v)){const a=[];s.set(v,a);for(const x of v)a.push(CLONE(x,s));return a;}const o={};s.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=CLONE(v[k],s);return o;};
const NUM=v=>{const n=Number(v);return Number.isFinite(n)?n:null},ID=v=>String(v??'').trim().toUpperCase();
function DIRECTION(v){if(v==null)return null;if(typeof v==='string'){const x=v.trim().toUpperCase();if(['RISING','INCREASING','UP','GROWING','ESCALATING'].includes(x))return'RISING';if(['FALLING','DECREASING','DOWN','DECLINING','SHRINKING'].includes(x))return'FALLING';if(['HIGH','LOW','CRITICAL','STABLE','NORMAL','SURPLUS','DEFICIT','NONE'].includes(x))return x;return null;}if(typeof v==='object')for(const k of ['problemDirection','direction','trend','status','condition','state']){const d=DIRECTION(v[k]);if(d)return d;}return null;}
function READ(r,p){let c=r;for(const k of String(p||'').split('.')){if(c==null||!Object.prototype.hasOwnProperty.call(Object(c),k))return undefined;c=c[k];}return c;}
function WORLD(){return g.Game?.state||g.gameState||g.Omega?.AuthoritativeWorldState?.state||{};} function WORLD_DATASET(k){const rt=g.Omega?.OpponentCountryRuntime?.instance;return rt?.gw?.get(k);} function SIM(){return g.Omega?.Simulation||g.Omega?.SimulationRuntime||null;} function IO(){return g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;}
function TURN(){const s=WORLD(),r=SIM();for(const x of [s?.simulation?.turn,s?.turn,s?.simulationTurn,r?.clock?.turn]){const n=NUM(x);if(n!==null)return n;}return 0;} function PLAYER(){const s=WORLD(),r=SIM();for(const x of [r?.getPlayerCountryId?.(),s?.simulation?.session?.playerCountryId,s?.playerCountryId,s?.countryCode,s?.countryId]){const z=ID(x);if(z)return z;}return null;}
function ROWS(raw){const d=raw?.countries||raw?.data||raw?.records||raw?.items||raw;if(Array.isArray(d))return d;if(d&&typeof d==='object')return Object.values(d).filter(x=>x&&typeof x==='object');return[];}
function REC(raw,c){
  const want=ID(c),rt=g.Omega?.OpponentCountryRuntime?.instance,canon=rt?.idr?.resolve?.(want)?.raw||null;
  const aliases=[want,canon?.id,canon?.code,canon?.iso2,canon?.iso3,canon?.name,canon?.countryName,canon?.officialName].filter(Boolean);
  const keys=[...new Set(aliases.flatMap(x=>{const z=String(x);return[z,ID(z),ID(z).replace(/[^A-Z0-9]+/g,'_')];}))];
  const d=raw?.countries??raw?.data??raw?.records??raw?.items??raw;
  const match=r=>[r?.id,r?.code,r?.iso2,r?.iso3,r?.country_id,r?.countryId,r?.country_code,r?.name,r?.countryName,r?.officialName]
    .some(x=>keys.includes(String(x??''))||keys.includes(ID(x)));
  if(Array.isArray(d))return d.find(match)||null;
  if(d&&typeof d==='object'){for(const k of keys)if(d[k]&&typeof d[k]==='object')return d[k];return Object.values(d).find(match)||null;}
  return null;
}
function STATE_PATH(s,c,p){const a=String(p).split('.'),d=a.shift(),sec=s?.[d];if(sec==null)return undefined;let b=sec?.[c];if(b===undefined){const k=Object.keys(sec||{}).find(x=>ID(x)===ID(c));if(k!==undefined)b=sec[k];}if(b===undefined)return undefined;return READ(b,a.join('.'));}
function SC_TRIG(t){if(!Array.isArray(t))return null;const[k,...v]=t;if(k==='SIG')return{type:'signal',signal:v[0],direction:v[1]};if(k==='REL')return{type:'relation',relation:v[0]};if(k==='EVENT')return{type:'event',event:v[0]};if(k==='ALL')return{type:'all',items:v.map(SC_TRIG)};if(k==='ANY')return{type:'any',items:v.map(SC_TRIG)};return null;}
function SC_OWNER(d){return({resources:'resource',finance:'finance',trade:'trade',technology:'technology',infrastructure:'transport',logistics:'transport',labor:'economy',population:'economy',housing:'projects',industry:'economy',food:'resource',energy:'resource',external:'foreign',assets:'projects',disaster:'cabinet',development:'cabinet',investment:'finance'})[d]||'cabinet';}
const SCENARIOS=SCENARIO_ROWS.map((r,i)=>{const acts=r[4],caps=[...new Set(acts.flatMap(a=>ACTIONS[a]?.caps||[]))];return{id:r[0],domain:r[1],kind:r[2],trigger:SC_TRIG(r[3]),requiredCapabilities:caps,observedState:['authoritative state observations'],derivedConditions:['trigger expression evaluated only against observed evidence','missing evidence remains unknown'],candidateActionTypes:acts,feasibilityRequirements:['country-scoped capabilities','known blocking constraints','execution authority'],decisionFactors:['priority class','need/pressure','feasibility','cost/time evidence','risk','finance','second-order effects','memory','forecast'],executionMethod:[...new Set(acts.map(a=>ACTIONS[a]?.execution))],expectedConsequences:[...new Set(acts.flatMap(a=>ACTIONS[a]?.domains||[]))],failureConditions:['missing required evidence','blocking constraint','executor rejection','reconciliation failure'],recoveryConditions:['constraint cleared','alternative feasible action','new evidence'],exitConditions:['trigger false','state resolved','superseded'],reevaluationRule:'STATE_CHANGE_OR_DEPENDENCY_EVENT',actions:acts,owner:SC_OWNER(r[1]),registryIndex:i};});
class Trace{constructor(){this.a=[];this.i=0;}add(x){const e={traceId:'TR-'+(++this.i),simulationTurn:TURN(),...CLONE(x)};this.a.push(e);if(this.a.length>MAX)this.a.shift();return e;}save(){return CLONE(this.a)}restore(v){this.a=Array.isArray(v)?CLONE(v):[];this.i=this.a.length;}}
function UNIT(p){const x=String(p).toLowerCase();for(const u of ['million_usd','billion_usd','usd','barrel','bbl','tonne','ton','kg','mt','twh','gwh','mwh','percent','percentage','per_day','per_year','unit','units'])if(x.includes(u))return u;return null;}
function FLAT(v,p='',out=[],d=0){if(d>5||v==null||typeof v!=='object')return out;if(Array.isArray(v)){v.slice(0,12).forEach(x=>FLAT(x,p,out,d+1));return out;}for(const[k,x]of Object.entries(v)){const q=p?p+'.'+k:k;out.push(q);if(x&&typeof x==='object')FLAT(x,q,out,d+1);}return out;}
function PROFILE(id,raw){const rs=ROWS(raw),fields=[...new Set(rs.slice(0,32).flatMap(r=>FLAT(r)))],norm=x=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,'_'),identity=['id','code','iso2','iso3','country_id','countryId','country_code','name'].filter(k=>rs.some(r=>READ(r,k)!==undefined)),relationships=fields.filter(x=>/(country|resource|facility|project|supplier|operator|owner|target|parent|actor|organization)(_?id|s)?$/i.test(x)),units=Object.fromEntries(fields.map(x=>[x,UNIT(x)]).filter(([,u])=>u)),fieldMeaning={},caps=[];for(const k of Object.keys(SIGNALS)){const aliases=[k,...(FIELD_ALIASES[k]||[])],matches=[...new Set(aliases.flatMap(a=>fields.filter(f=>norm(f).includes(norm(a)))))].slice(0,32);if(matches.length){fieldMeaning[k]={fields:matches,semanticSource:'FIELD_ALIASES',confidence:'OBSERVED_NAME_MATCH'};caps.push({capability:k,fields:matches});}}return{datasetId:id,schema:{recordCountEstimate:rs.length,sampleRowCount:Math.min(rs.length,32),fieldCount:fields.length,fields:fields.slice(0,1000)},identityFields:identity,fieldMeaning,units,relationships,capabilities:caps};}
class Gateway{constructor(o={}){this.base=String(o.basePath||'').replace(/\/$/,'');this.fetch=o.fetchImpl||g.fetch?.bind(g)||null;this.c=new Map;this.p=new Map;this.tr=o.trace||null;}set(k,v){this.c.set(k,CLONE(v));this.p.set(k,PROFILE(k,v));this.tr?.add({layer:'L00_DATA_INTAKE',datasetId:k,recordCount:this.p.get(k).schema.recordCountEstimate,profile:this.p.get(k)});return true;}get(k){return this.c.has(k)?CLONE(this.c.get(k)):undefined;}profile(k){return this.p.get(k)?CLONE(this.p.get(k)):null;}async load(k){if(this.c.has(k))return this.get(k);const d=DATASETS[k];if(!d)throw Error('DATASET_NOT_REGISTERED:'+k);if(!this.fetch)throw Error('DATASET_FETCH_UNAVAILABLE:'+k);const r=await this.fetch((this.base?this.base+'/':'')+d[0],{cache:'no-store'});if(!r.ok)throw Error('DATASET_FETCH_FAILED:'+k);const v=await r.json();this.set(k,v);return CLONE(v);}status(){return Object.fromEntries(Object.entries(DATASETS).map(([k,d])=>[k,{path:d[0],required:!!d[1],loaded:this.c.has(k),profile:!!this.p.get(k)}]));}save(){return{datasets:Object.fromEntries(this.c),profiles:Object.fromEntries(this.p)}}restore(s){this.c=new Map(Object.entries(s?.datasets||{}));this.p=new Map(Object.entries(s?.profiles||{}));}}
class Identity{constructor(gw,tr){this.gw=gw;this.tr=tr;this.ids=new Set;this.map=new Map;}rebuild(){this.ids.clear();this.map.clear();const raw=this.gw.get('countries');if(raw===undefined){this.tr.add({layer:'L01_CANONICAL_IDENTITY',status:'UNAVAILABLE'});return;}for(const r of ROWS(raw)){const id=ID(r?.id??r?.code??r?.iso3??r?.country_id??r?.countryId);if(!id)continue;this.ids.add(id);for(const a of [r?.id,r?.code,r?.iso3,r?.iso2,r?.name])if(a!=null&&!this.map.has(ID(a)))this.map.set(ID(a),{id,raw:CLONE(r)});}this.tr.add({layer:'L01_CANONICAL_IDENTITY',status:'BUILT',count:this.ids.size});}resolve(v){return CLONE(this.map.get(ID(v))||null)}list(){return[...this.ids].sort();}}
class CapRegistry{constructor(gw,tr){this.gw=gw;this.tr=tr;this.m=new Map;}rebuild(){this.m.clear();for(const p of this.gw.p.values())for(const c of p.capabilities||[]){const a=this.m.get(c.capability)||[];a.push({datasetId:p.datasetId,fields:c.fields});this.m.set(c.capability,a);}this.tr.add({layer:'L02_CAPABILITY_REGISTRY',capabilities:this.m.size});}forCountry(c){const r={};for(const k of Object.keys(SIGNALS))r[k]=false;for(const [k,v] of this.m)r[k]=v.some(x=>!!REC(this.gw.get(x.datasetId),c));return r;}snapshot(){return Object.fromEntries([...this.m].map(([k,v])=>[k,CLONE(v)]));}}
class ActorRegistry{
  constructor(gw,tr,countryIdentity){this.gw=gw;this.tr=tr;this.countryIdentity=countryIdentity;this.m=new Map;}
  rebuild(){
    this.m.clear();
    for(const id of this.countryIdentity.list())this.m.set(id,{id,actorType:'COUNTRY',identity:this.countryIdentity.resolve(id)});
    for(const [dataset,type] of [['organizations','ORGANIZATION'],['companies','COMPANY'],['institutions','INSTITUTION']]){
      const raw=this.gw.get(dataset);
      if(raw===undefined)continue;
      for(const row of ROWS(raw)){
        const id=ID(row?.actorId??row?.organizationId??row?.companyId??row?.institutionId??row?.id??row?.code);
        if(!id)continue;
        this.m.set(id,{id,actorType:type,identity:CLONE(row),sourceDataset:dataset});
      }
    }
    this.tr.add({layer:'L01_CANONICAL_IDENTITY',actorRegistrySize:this.m.size,nonCountryActors:[...this.m.values()].filter(x=>x.actorType!=='COUNTRY').length});
  }
  resolve(id){return CLONE(this.m.get(ID(id))||null);}
  list(type){const t=type?String(type).toUpperCase():null;return [...this.m.values()].filter(x=>!t||x.actorType===t).sort((a,b)=>a.id.localeCompare(b.id));}
}
class Graph{constructor(tr){this.tr=tr;this.e=new Map;}build(){this.e.clear();for(const[a,b]of [['POPULATION','FOOD_DEMAND'],['POPULATION','HOUSING_DEMAND'],['POPULATION','EDUCATION_CAPACITY'],['POPULATION','HEALTH_CAPACITY'],['POPULATION','LABOR_AVAILABILITY'],['POPULATION','ENERGY_DEMAND'],['POPULATION','CONSUMER_DEMAND'],['OUTPUT','REVENUE'],['OUTPUT','EXPORT_DEMAND'],['INPUT_AVAILABILITY','OUTPUT'],['INFRASTRUCTURE_CAPACITY','EFFECTIVE_CAPACITY'],['TECHNOLOGY_CAPABILITY','PRODUCTIVITY'],['PRODUCTIVITY','OUTPUT'],['UNEMPLOYMENT','HOUSEHOLD_INCOME'],['HOUSEHOLD_INCOME','CONSUMER_DEMAND'],['CONSUMER_DEMAND','OUTPUT'],['MAINTENANCE_BACKLOG','EFFECTIVE_CAPACITY'],['DISASTER_DAMAGE','EFFECTIVE_CAPACITY'],['FORECAST_SHORTFALL','SCENARIO']])this.add(a,b,'UNIVERSAL_CAUSAL_RELATION');this.tr.add({layer:'L04_DEPENDENCY_GRAPH',edges:this.count()});}add(a,b,r){const x=this.e.get(a)||[];if(!x.some(q=>q.to===b))x.push({from:a,to:b,reason:r});this.e.set(a,x);}down(ns=[]){const q=[...ns],s=new Set(q);while(q.length){const x=q.shift();for(const e of this.e.get(x)||[])if(!s.has(e.to)){s.add(e.to);q.push(e.to);}}return[...s];}count(){return[...this.e.values()].reduce((a,x)=>a+x.length,0);}}
class Kernel{
  constructor(gw,id,tr){this.gw=gw;this.id=id;this.tr=tr;this.hyd=new Map;}
  readSignal(state,c,k){
    for(const p of STATE_PATHS[k]||[]){const v=STATE_PATH(state,c,p);if(v!==undefined)return{value:v,source:'STATE:'+p,authoritative:true};}
    for(const [dataset,raw] of this.gw.c){const r=REC(raw,c);if(!r)continue;for(const p of [k,...(FIELD_ALIASES[k]||[])]){const v=READ(r,p);if(v!==undefined)return{value:v,source:'DATASET:'+dataset+'.'+p,authoritative:false};}}
    return null;
  }
  observeDatasetFields(c){
    const map={
      population_2015:['population','population_2015'],annual_growth_rate:['population','annual_growth_rate'],
      birth_rate:['population','birth_rate'],death_rate:['population','death_rate'],migration_rate:['population','migration_rate'],urbanization_rate:['population','urbanization_rate'],
      gdp:['economy','gdp'],gdp_growth:['economy','gdp_growth'],inflation:['economy','inflation'],unemployment_rate:['economy','unemployment_rate'],
      budget_balance:['economy','budget_balance'],debt:['economy','debt'],trade_balance:['economy','trade_balance'],exchange_rate_usd:['economy','exchange_rate_usd'],reserves:['economy','reserves']
    },out={};
    for(const [field,[dataset,key]] of Object.entries(map)){const row=REC(this.gw.get(dataset),c),value=row?READ(row,key):undefined;out[field]={dataset,field:key,value:value===undefined?null:CLONE(value),status:value===undefined?'UNAVAILABLE':'AVAILABLE',source:value===undefined?null:'DATASET:'+dataset+'.'+key};}
    return out;
  }
  snap(c,t){
    const cid=ID(c),state=WORLD(),sig={};
    for(const k of Object.keys(SIGNALS)){const r=this.readSignal(state,cid,k),v=r?.value;
      sig[k]={signalId:k,value:v===undefined?null:CLONE(v),raw:v===undefined?null:CLONE(v),direction:DIRECTION(v),status:v===undefined||v===null?'UNAVAILABLE':'AVAILABLE',
        source:r?.source||null,provenance:r?{source:r.source,simulationTurn:t,authoritative:!!r.authoritative}:null};
    }
    this.derive(sig);
    const datasetObservations=this.observeDatasetFields(cid);
    const out={countryId:cid,turn:t,identity:this.id.resolve(cid),signals:sig,datasetObservations};
    this.hyd.set(cid,CLONE(out));
    this.tr.add({layer:'L03_WORLD_STATE_KERNEL',countryId:cid,available:Object.values(sig).filter(x=>x.status==='AVAILABLE').length,missing:Object.values(sig).filter(x=>x.status!=='AVAILABLE').length,
      datasetFieldsObserved:Object.values(datasetObservations).filter(x=>x.status==='AVAILABLE').length,stateHydrated:true});
    return out;
  }
  derive(sig){
    const n=k=>SCALAR(sig[k]?.value);
    if(sig.EFFECTIVE_CAPACITY.status!=='AVAILABLE'){const pc=n('PRODUCTION_CAPACITY');if(pc!==null){const ic=n('INFRASTRUCTURE_CAPACITY'),tc=n('TRANSPORT_CAPACITY');let v=pc;const from=['PRODUCTION_CAPACITY'];if(ic!==null){v=Math.min(v,ic);from.push('INFRASTRUCTURE_CAPACITY');}if(tc!==null){v=Math.min(v,tc);from.push('TRANSPORT_CAPACITY');}sig.EFFECTIVE_CAPACITY={signalId:'EFFECTIVE_CAPACITY',value:v,raw:v,direction:null,status:'AVAILABLE',source:'DERIVED:CAPACITY_CONSTRAINTS',provenance:{derivedFrom:from}};}}
    if(sig.CAPACITY_UTILIZATION.status!=='AVAILABLE'){const o=n('OUTPUT'),c=n('EFFECTIVE_CAPACITY');if(o!==null&&c!==null&&c>0){const v=o/c;sig.CAPACITY_UTILIZATION={signalId:'CAPACITY_UTILIZATION',value:v,raw:v,direction:v>=1?'HIGH':null,status:'AVAILABLE',source:'DERIVED:OUTPUT_DIV_CAPACITY',provenance:{derivedFrom:['OUTPUT','EFFECTIVE_CAPACITY']}};}}
  }
  getHydrated(c){return CLONE(this.hyd.get(ID(c))||null);}
}
function SCALAR(v){if(v&&typeof v==='object')for(const k of ['value','effective','total','available','required','demand','supply','capacity','load','target','amount','quantity']){const z=NUM(v[k]);if(z!==null)return z;}return NUM(v);}
function RELATION(s,c,k){const d=REL[k];if(!d)return null;let a,b,ap,bp;for(const p of [d[0]]){const z=STATE_PATH(s,c,p);if(z!==undefined){a=SCALAR(z);ap=p;break;}}for(const p of [d[1]]){const z=STATE_PATH(s,c,p);if(z!==undefined){b=SCALAR(z);bp=p;break;}}return a===null||b===null?null:{left:a,right:b,leftPath:ap,rightPath:bp};}
function EVAL_REL(ctx,k){const o=RELATION(ctx.state,ctx.countryId,k);if(!o)return{state:'UNKNOWN',reason:'RELATION_DATA_UNAVAILABLE'};return{state:o.left>o.right?'TRUE':'FALSE',operands:o,kind:REL[k][2],gap:o.left-o.right};}
function EVAL_DIR(k,o,e){if(!DIR[k])return{state:'UNKNOWN',reason:'SIGNAL_NOT_REGISTERED'};const a=DIRECTION(o),x=String(e||DIR[k].problemWhen||'').toUpperCase();if(!a)return{state:'UNKNOWN',reason:'SEMANTIC_DIRECTION_NOT_OBSERVED'};if(x==='CONTEXT')return{state:'FALSE',actual:a};if(x==='RISING')return{state:a==='RISING'?'TRUE':'FALSE',actual:a};if(x==='FALLING')return{state:a==='FALLING'?'TRUE':'FALSE',actual:a};if(x==='HIGH')return{state:['HIGH','CRITICAL'].includes(a)?'TRUE':'FALSE',actual:a};if(x==='LOW')return{state:a==='LOW'?'TRUE':'FALSE',actual:a};return{state:'UNKNOWN',actual:a};}
function EVENT_LIST(c){const e=WORLD()?.events||WORLD()?.simulation?.events||[];return Array.isArray(e)?e.filter(x=>!x?.countryId||ID(x.countryId)===ID(c)):[];}
function TRIGGER(t,c){
  if(!t)return{state:'UNKNOWN',reason:'TRIGGER_UNDEFINED'};
  if(t.type==='signal'){const o=c.signals?.[t.signal];if(!o||o.status!=='AVAILABLE')return{state:'UNKNOWN',reason:'SIGNAL_UNAVAILABLE'};return{...EVAL_DIR(t.signal,o.raw,t.direction),evidence:o};}
  if(t.type==='relation'){const g=(c.gaps||c.gapPressure?.gaps||{})[t.relation];if(!g||g.state==='UNKNOWN')return{state:'UNKNOWN',reason:'RELATION_DATA_UNAVAILABLE'};return{state:g.state==='TRUE'?'TRUE':'FALSE',evidence:g};}
  if(t.type==='event'){const e=EVENT_LIST(c.countryId).find(x=>!x.resolved&&ID(x.eventType||x.type)===ID(t.event));return{state:e?'TRUE':'FALSE',evidence:e||{event:t.event}};}
  if(t.type==='all'){const r=t.items.map(x=>TRIGGER(x,c));if(r.some(x=>x.state==='UNKNOWN'))return{state:'UNKNOWN',evidence:r};return{state:r.every(x=>x.state==='TRUE')?'TRUE':'FALSE',evidence:r};}
  if(t.type==='any'){const r=t.items.map(x=>TRIGGER(x,c));if(r.some(x=>x.state==='TRUE'))return{state:'TRUE',evidence:r};if(r.every(x=>x.state==='FALSE'))return{state:'FALSE',evidence:r};return{state:'UNKNOWN',evidence:r};}
  return{state:'UNKNOWN',reason:'TRIGGER_UNSUPPORTED'};
}
class Demand{constructor(tr){this.tr=tr;}run(s){const observed={},required={},drivers={};for(const k of Object.keys(s.signals))if(/DEMAND$/.test(k)||['RESOURCE_DEMAND','CONSUMER_DEMAND','INVESTMENT_DEMAND'].includes(k))if(s.signals[k].status==='AVAILABLE'){observed[k]=CLONE(s.signals[k]);const z=SCALAR(s.signals[k].value);if(z!==null)required[k]=z;}for(const k of ['POPULATION','POPULATION_GROWTH','HOUSEHOLD_INCOME','OUTPUT','EXPORT_DEMAND','INVESTMENT_DEMAND'])if(s.signals[k]?.status==='AVAILABLE')drivers[k]=CLONE(s.signals[k]);this.tr.add({layer:'L05_DEMAND_ENGINE',countryId:s.countryId,observed:Object.keys(observed),required:Object.keys(required),drivers:Object.keys(drivers)});return{observed,required,drivers};}}
class Supply{constructor(tr){this.tr=tr;}run(s){const supply={},capacity={};for(const k of ['FOOD_SUPPLY','ENERGY_SUPPLY','RESOURCE_STOCK','RESOURCE_PRODUCTION','PRODUCTION_CAPACITY','EFFECTIVE_CAPACITY','INFRASTRUCTURE_CAPACITY','TRANSPORT_CAPACITY','LABOR_AVAILABILITY','HOUSING_SUPPLY','HEALTH_CAPACITY','EDUCATION_CAPACITY','INPUT_AVAILABILITY'])if(s.signals[k]?.status==='AVAILABLE')(['PRODUCTION_CAPACITY','EFFECTIVE_CAPACITY','INFRASTRUCTURE_CAPACITY','TRANSPORT_CAPACITY','LABOR_AVAILABILITY','HOUSING_SUPPLY','HEALTH_CAPACITY','EDUCATION_CAPACITY'].includes(k)?capacity:supply)[k]=CLONE(s.signals[k]);this.tr.add({layer:'L06_SUPPLY_CAPACITY_ENGINE',countryId:s.countryId,supply:Object.keys(supply),capacity:Object.keys(capacity)});return{supply,capacity};}}
function LEVEL(v){const d=DIRECTION(v);return d==='CRITICAL'?'CRITICAL':d==='HIGH'?'HIGH':d==='LOW'?'LOW':['RISING','FALLING'].includes(d)?'MODERATE':null;}
class GapPressure{
  constructor(tr){this.tr=tr;}
  run(s){
    const gaps={},state=s.rawState||WORLD(),cid=s.countryId;
    const resolve=path=>{
      const sv=STATE_PATH(state,cid,path),sn=SCALAR(sv);if(sn!==null)return{value:sn,raw:CLONE(sv),path,source:'STATE'};
      const parts=String(path).split('.'),root=parts.shift(),ds=[root,{resource:'resources',trade:'relations',transport:'infrastructure'}[root]].filter(Boolean);
      for(const dataset of ds){const r=REC(WORLD_DATASET(dataset),cid);if(!r)continue;const v=READ(r,parts.join('.')),n=SCALAR(v);if(n!==null)return{value:n,raw:CLONE(v),path,source:'DATASET:'+dataset};}
      const key=Object.keys(STATE_PATHS).find(k=>(STATE_PATHS[k]||[]).includes(path)),sig=s.signals?.[key],n=SCALAR(sig?.value);
      return key&&n!==null?{value:n,raw:CLONE(sig.value),path:key,source:'SIGNAL'}:null;
    };
    Object.keys(REL).forEach(k=>{
      const spec=REL[k],a=resolve(spec[0]),b=resolve(spec[1]);
      if(!a||!b){gaps[k]={state:'UNKNOWN',required:null,available:null,gap:null,kind:spec[2],operands:null,need:null,pressure:{state:'UNKNOWN',level:null,reason:'RELATION_DATA_UNAVAILABLE'}};return;}
      const gap=a.value-b.value,active=gap>0,ratio=Math.max(0,Math.min(1,gap/Math.max(Math.abs(a.value),1e-9)));
      gaps[k]={state:active?'TRUE':'FALSE',required:a.value,available:b.value,gap,kind:spec[2],
        operands:{left:a.value,right:b.value,leftPath:a.path,rightPath:b.path,leftSource:a.source,rightSource:b.source},
        need:active?{id:'NEED_'+k,state:'ACTIVE',gap,severity:ratio}:null,
        pressure:active?{state:'ACTIVE',level:ratio>=.75?'CRITICAL':ratio>=.5?'HIGH':ratio>=.2?'MODERATE':'LOW',ratio}:{state:'NONE',level:null,ratio:0}};
    });
    const semantic=[];Object.entries(s.signals).forEach(([k,o])=>{if(o.status!=='AVAILABLE')return;const e=EVAL_DIR(k,o.raw,DIR[k]?.problemWhen);if(e.state==='TRUE')semantic.push({signal:k,direction:e.actual,rule:DIR[k]?.problemWhen});});
    this.tr.add({layer:'L07_NEED_GAP_PRESSURE_ENGINE',countryId:cid,activeGaps:Object.entries(gaps).filter(([,x])=>x.state==='TRUE').map(([k])=>k),unknownGaps:Object.entries(gaps).filter(([,x])=>x.state==='UNKNOWN').map(([k])=>k),semantic});
    return{gaps,needs:Object.entries(gaps).filter(([,x])=>x.state==='TRUE').map(([k])=>'NEED_'+k),semantic};
  }
}

class ScenarioEngine{constructor(tr){this.tr=tr;}run(s,gp,events){const ctx={...s,...gp,state:s.rawState||WORLD(),countryId:s.countryId,events};const active=[];for(const sc of SCENARIOS){const e=TRIGGER(sc.trigger,ctx);if(e.state==='TRUE')active.push({...CLONE(sc),evidence:e.evidence});}this.tr.add({layer:'L08_SCENARIO_ENGINE',countryId:s.countryId,active:active.map(x=>x.id)});return active;}}
class Memory{constructor(tr){this.tr=tr;this.m=new Map;}state(c){if(!this.m.has(c))this.m.set(c,{pastProblems:[],pastDecisions:[],outcomes:[],scenarioBias:{},persistentGoals:[]});return this.m.get(c);}bias(c,sc){const x=this.state(c).scenarioBias[sc];return x==='FAILED'?'RETRY_CAUTION':x==='BLOCKED'?'AVOID_BLOCKED_ACTION':x==='COMPLETED'?'FAVOR_REPEAT':null;}decision(c,d){this.state(c).pastDecisions.push(CLONE(d));this.tr.add({layer:'L23_ACTOR_MEMORY_ADAPTATION',countryId:c,type:'DECISION',decisionId:d.decisionId});}outcome(c,o){const m=this.state(c);m.outcomes.push(CLONE(o));m.scenarioBias[o.scenarioId]=String(o.status||'OBSERVED').toUpperCase();if(m.outcomes.length>64)m.outcomes.shift();this.tr.add({layer:'L23_ACTOR_MEMORY_ADAPTATION',countryId:c,type:'OUTCOME',scenarioId:o.scenarioId,status:o.status});}save(){return CLONE(Object.fromEntries(this.m));}restore(v){this.m=new Map(Object.entries(v||{}).map(([k,x])=>[k,CLONE(x)]));}}
class Goal{constructor(tr,mem){this.tr=tr;this.mem=mem;}run(c,sc,gp){const prior=this.mem.state(c).persistentGoals||[],goals=sc.map(x=>({goalId:'GOAL-'+x.id,scenarioId:x.id,priorityClass:x.kind==='PRESSURE'?'PRESSURE':x.kind==='OPPORTUNITY'?'OPPORTUNITY':'DRIVER',persistent:true,previouslyActive:prior.includes(x.id),memoryBias:this.mem.bias(c,x.id),needs:CLONE(gp.needs),priorityFactors:x.decisionFactors})).sort((a,b)=>(a.priorityClass==='PRESSURE'?0:a.priorityClass==='DRIVER'?1:2)-(b.priorityClass==='PRESSURE'?0:b.priorityClass==='DRIVER'?1:2)||a.goalId.localeCompare(b.goalId));this.mem.state(c).persistentGoals=[...new Set(goals.map(x=>x.scenarioId))].slice(-128);this.tr.add({layer:'L09_GOAL_PRIORITY_ENGINE',countryId:c,goals:goals.map(x=>x.goalId)});return goals;}}
class Feasibility{
  constructor(tr){this.tr=tr;}
  check(c,a,ctx){
    const d=ACTIONS[a];if(!d)return{status:'BLOCKED',reason:'ACTION_UNREGISTERED'};
    const missing=[],unknown=[],signals=ctx.signals||{},caps=ctx.countryCapabilities||{};
    for(const cap of d.caps||[]){if(caps[cap]===true||signals[cap]?.status==='AVAILABLE')continue;if(caps[cap]===false)missing.push(cap);else unknown.push(cap);}
    const n=k=>SCALAR(signals[k]?.value),blockers=[];
    if(a==='IMPORT'&&n('FOREIGN_CURRENCY')!==null&&n('FOREIGN_CURRENCY')<=0)blockers.push('FOREIGN_CURRENCY_UNAVAILABLE');
    if(['IMPORT','EXPORT'].includes(a)&&n('TRADE_ROUTE_CAPACITY')!==null&&n('TRADE_ROUTE_CAPACITY')<=0)blockers.push('TRADE_ROUTE_CAPACITY_UNAVAILABLE');
    if(['PROJECT_INVESTMENT','FINANCIAL_TRANSACTION'].includes(a)&&n('LIQUIDITY')!==null&&n('LIQUIDITY')<0)blockers.push('NEGATIVE_LIQUIDITY');
    if(a==='EXPORT'&&ctx.gapPressure?.gaps?.RESOURCE?.state==='TRUE')blockers.push('DOMESTIC_RESOURCE_DEFICIT');
    const status=blockers.length||missing.length?'BLOCKED':unknown.length?'UNKNOWN':'FEASIBLE';
    const r={status,owner:d.owner,execution:d.execution,requiredCapabilities:d.caps||[],missingCapabilities:missing,unknownCapabilities:unknown,blockingConditions:blockers};
    this.tr.add({layer:'L11_FEASIBILITY_ENGINE',countryId:ID(c),action:a,status,missing,unknown,blockers});return r;
  }
}

class Decision{
  constructor(tr,feas,mem){this.tr=tr;this.f=feas;this.mem=mem;}
  policyOrder(id){return APPROVED_POLICY_OVERRIDES[id]||[];}
  run(c,goals,ctx){
    const out=[];
    for(const goal of goals){
      const sc=ctx.scenarios.find(x=>x.id===goal.scenarioId);if(!sc)continue;
      const order=this.policyOrder(sc.id);
      const candidates=sc.actions.map(action=>({action,feasibility:this.f.check(c,action,ctx)}));
      const feasible=candidates.filter(x=>x.feasibility.status==='FEASIBLE').sort((a,b)=>{
        const ai=order.indexOf(a.action),bi=order.indexOf(b.action);
        return (ai<0?Number.MAX_SAFE_INTEGER:ai)-(bi<0?Number.MAX_SAFE_INTEGER:bi)||a.action.localeCompare(b.action);
      });
      if(!feasible.length){this.tr.add({layer:'L10_DECISION_ENGINE',countryId:c,scenarioId:sc.id,status:'NO_FEASIBLE_ACTION'});continue;}
      const selected=[feasible[0].action];
      if(sc.kind==='PRESSURE'){const second=feasible.find(x=>x.action!==selected[0]&&order.indexOf(x.action)>=0);if(second)selected.push(second.action);}
      const evaluations=selected.map(a=>candidates.find(x=>x.action===a));
      out.push({decisionId:'DEC-'+ID(c)+'-'+ctx.turn+'-'+sc.id,countryId:ID(c),simulationTurn:ctx.turn,scenarioId:sc.id,goal:CLONE(goal),
        candidateActions:CLONE(candidates),selectedActions:selected,selectedEvaluations:CLONE(evaluations),evidence:CLONE(sc.evidence||null),
        decisionFactors:sc.decisionFactors,status:'DECIDED',executionMethod:selected.map(a=>ACTIONS[a].execution),
        expectedConsequences:[...new Set(selected.flatMap(a=>ACTIONS[a].domains||[]))],
        reasoning:{selection:'FIRST_FEASIBLE_APPROVED_ACTION',approvedOrder:order,memoryBias:this.mem.bias(ctx.countryId,sc.id)}});
    }
    this.tr.add({layer:'L10_DECISION_ENGINE',countryId:c,count:out.length,decisions:out.map(x=>x.decisionId)});return out;
  }
}
class ProjectEngine{
  constructor(tr){this.tr=tr;this.m=new Map();}
  plan(d,a){
    const spec=ACTIONS[a];if(!spec||!String(spec.execution).includes('PROJECT'))return null;
    const ctx=d.context||{},sig=ctx.signals||{},gaps=ctx.gapPressure?.gaps||{},rel=spec.rel&&gaps[spec.rel]?.state==='TRUE'?gaps[spec.rel]:null;
    const evidencePaths=Object.values(sig).filter(x=>x?.status==='AVAILABLE').map(x=>x.source).filter(Boolean);
    const runtimeQuantity=SCALAR(d.selected?.quantity??d.runtimeMeasurement?.selected?.quantity);const requirements={targetQuantity:runtimeQuantity??rel?.gap??null,capital:SCALAR(sig.CAPITAL_AVAILABILITY?.value),labor:SCALAR(sig.LABOR_AVAILABILITY?.value),
      infrastructure:SCALAR(sig.INFRASTRUCTURE_CAPACITY?.value),technology:SCALAR(sig.TECHNOLOGY_CAPABILITY?.value),inputs:[],time:null,evidenceStatus:evidencePaths.length?'OBSERVED':'UNAVAILABLE',evidencePaths};
    const p={projectId:'PROJ-'+d.decisionId+'-'+a,countryId:ID(d.countryId),actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',
      phase:'INITIATION',requirements,progress:0,commissioning:'PENDING',operationalCapacity:null,executor:spec.owner,createdTurn:d.simulationTurn,dependencies:spec.domains||[],
      executionBoundary:'EXTERNAL_PROJECT_EXECUTOR',stateMutationAuthority:false,lifecycle:['PROPOSED','APPROVED','FUNDED','UNDER_CONSTRUCTION','COMMISSIONING','OPERATIONAL','COMPLETED','BLOCKED']};
    this.m.set(p.projectId,p);this.tr.add({layer:'L12_PROJECT_ENGINE',countryId:p.countryId,projectId:p.projectId,status:p.status,requirements});return CLONE(p);
  }
  advance(e){const p=this.m.get(e?.projectId);if(!p)return null;['status','phase','progress','commissioning','operationalCapacity','requirements'].forEach(k=>{if(e[k]!==undefined)p[k]=CLONE(e[k]);});p.lastEvent=e?.eventType||null;this.tr.add({layer:'L12_PROJECT_ENGINE',projectId:p.projectId,status:p.status,event:p.lastEvent});return CLONE(p);}
  list(c){return CLONE([...this.m.values()].filter(x=>!c||ID(x.countryId)===ID(c)));}
  save(){return CLONE([...this.m.values()]);}
  restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.projectId,CLONE(x)]));}
}

class TransactionEngine{
  constructor(tr){this.tr=tr;this.m=new Map();}
  plan(d,a){
    const spec=ACTIONS[a];if(!spec||!String(spec.execution).includes('TRANSACTION'))return null;
    const ctx=d.context||{},sig=ctx.signals||{},gaps=ctx.gapPressure?.gaps||{},rel=spec.rel&&gaps[spec.rel]?.state==='TRUE'?gaps[spec.rel]:null;
    const runtimeQuantity=SCALAR(d.selected?.quantity??d.runtimeMeasurement?.selected?.quantity),quantity=runtimeQuantity??rel?.gap??null,price=SCALAR(sig.MARKET_PRICE?.value),value=quantity!==null&&price!==null?quantity*price:null;
    const q={transactionId:'TX-'+d.decisionId+'-'+a,countryId:ID(d.countryId),actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',
      settlement:'PENDING',from:null,to:null,quantity,value,currency:null,requirements:{sourceKnown:false,targetKnown:false,amountKnown:quantity!==null,priceKnown:price!==null,
        foreignCurrencyObserved:SCALAR(sig.FOREIGN_CURRENCY?.value)!==null},executor:spec.owner,createdTurn:d.simulationTurn,executionBoundary:'EXTERNAL_TRANSACTION_EXECUTOR',
      stateMutationAuthority:false,evidence:CLONE(d.evidence||null)};
    this.m.set(q.transactionId,q);this.tr.add({layer:'L13_TRANSACTION_ENGINE',countryId:q.countryId,transactionId:q.transactionId,status:q.status,quantity,value});return CLONE(q);
  }
  settle(e){const q=this.m.get(e?.transactionId);if(!q)return null;q.status=e.status||'SETTLED';q.settlement=CLONE(e);this.tr.add({layer:'L13_TRANSACTION_ENGINE',transactionId:q.transactionId,status:q.status});return CLONE(q);}
  save(){return CLONE([...this.m.values()]);}
  restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.transactionId,CLONE(x)]));}
}

class TradeMarketEngine{constructor(tr){this.tr=tr;}run(s){const x={imports:s.signals.IMPORT_DEPENDENCE,exports:s.signals.EXPORT_DEMAND,route:s.signals.TRADE_ROUTE_CAPACITY,price:s.signals.MARKET_PRICE,concentration:s.signals.SUPPLIER_CONCENTRATION};this.tr.add({layer:'L14_TRADE_MARKET_ENGINE',countryId:s.countryId,observed:Object.values(x).filter(v=>v?.status==='AVAILABLE').length,marketState:x});return x;}}
class FinanceEngine{constructor(tr){this.tr=tr;}run(s){const x={revenue:s.signals.REVENUE,expenditure:s.signals.EXPENDITURE,liquidity:s.signals.LIQUIDITY,capital:s.signals.CAPITAL_AVAILABILITY,foreignCurrency:s.signals.FOREIGN_CURRENCY,debtService:s.signals.DEBT_SERVICE_PRESSURE};this.tr.add({layer:'L15_FINANCE_ENGINE',countryId:s.countryId,observed:Object.values(x).filter(v=>v?.status==='AVAILABLE').length,financialState:x});return x;}}
class InfraLogisticsEngine{constructor(tr){this.tr=tr;}run(s){const x={infrastructure:s.signals.INFRASTRUCTURE_CAPACITY,transport:s.signals.TRANSPORT_CAPACITY,congestion:s.signals.LOGISTICS_CONGESTION,route:s.signals.TRADE_ROUTE_CAPACITY,failureRisk:s.signals.NETWORK_FAILURE_RISK};this.tr.add({layer:'L16_INFRA_LOGISTICS_ENGINE',countryId:s.countryId,observed:Object.values(x).filter(v=>v?.status==='AVAILABLE').length,networkState:x});return x;}}
class PopulationLaborEngine{constructor(tr){this.tr=tr;}run(s){const x={population:s.signals.POPULATION,growth:s.signals.POPULATION_GROWTH,labor:s.signals.LABOR_AVAILABILITY,skilled:s.signals.SKILLED_LABOR,unemployment:s.signals.UNEMPLOYMENT,income:s.signals.HOUSEHOLD_INCOME,migration:s.signals.MIGRATION_PRESSURE};this.tr.add({layer:'L17_POPULATION_LABOR_ENGINE',countryId:s.countryId,observed:Object.values(x).filter(v=>v?.status==='AVAILABLE').length,demographicState:x});return x;}}
class TechProductivityEngine{constructor(tr){this.tr=tr;}run(s){const x={technology:s.signals.TECHNOLOGY_CAPABILITY,productivity:s.signals.PRODUCTIVITY,rAndD:s.signals.R_AND_D_CAPABILITY};this.tr.add({layer:'L18_TECH_PRODUCTIVITY_ENGINE',countryId:s.countryId,observed:Object.values(x).filter(v=>v?.status==='AVAILABLE').length,technologyState:x});return x;}}
class PolicyInstitutionEngine{constructor(tr){this.tr=tr;}run(s){const x={stability:s.signals.STABILITY,corruption:s.signals.CORRUPTION,services:s.signals.PUBLIC_SERVICE_CAPACITY,welfare:s.signals.WELFARE_PRESSURE};this.tr.add({layer:'L19_POLICY_INSTITUTION_ENGINE',countryId:s.countryId,observed:Object.values(x).filter(v=>v?.status==='AVAILABLE').length,institutionState:x});return x;}}
class PolicyLifecycle{constructor(tr){this.tr=tr;this.m=new Map;}plan(d,a){const x=ACTIONS[a];if(!x||x.execution!=='POLICY')return null;const p={policyId:'POL-'+d.decisionId+'-'+a,countryId:d.countryId,actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',phase:'REVIEW',requirements:{evidence:CLONE(d.evidence||null),feasibility:CLONE(d.feasibility||null)},executor:x.owner,createdTurn:d.simulationTurn,lastEvent:null};this.m.set(p.policyId,p);this.tr.add({layer:'L19_POLICY_INSTITUTION_ENGINE',countryId:d.countryId,policyId:p.policyId,status:p.status,phase:p.phase});return CLONE(p);}advance(e){const p=this.m.get(e?.policyId);if(!p)return null;p.status=e.status||p.status;p.phase=e.phase||p.phase;p.lastEvent=e.eventType||null;this.tr.add({layer:'L19_POLICY_INSTITUTION_ENGINE',policyId:p.policyId,status:p.status,phase:p.phase,event:p.lastEvent});return CLONE(p);}list(c){return CLONE([...this.m.values()].filter(x=>!c||ID(x.countryId)===ID(c)));}save(){return CLONE([...this.m.values()]);}restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.policyId,CLONE(x)]));}}
class EventShock{constructor(tr){this.tr=tr;}run(c){const e=EVENT_LIST(c).filter(x=>!x.resolved).map(x=>({eventId:x.id||x.eventId||x.eventType,type:x.eventType||x.type,impactedSignals:x.impactedSignals||[],domains:x.domains||[],sourceCountryId:x.sourceCountryId||null}));this.tr.add({layer:'L20_EVENT_SHOCK_ENGINE',countryId:c,activeEvents:e.length});return e;}}
class Consequence{
  constructor(tr,g,gw){this.tr=tr;this.g=g;this.gw=gw;}
  domainSignals(domain){
    const m={
      resources:['RESOURCE_STOCK','RESOURCE_PRODUCTION','RESOURCE_DEMAND','RESOURCE_RESERVE'],resource:['RESOURCE_STOCK','RESOURCE_PRODUCTION','RESOURCE_DEMAND','RESOURCE_RESERVE'],
      food:['FOOD_SUPPLY','FOOD_DEMAND','RESOURCE_STOCK'],energy:['ENERGY_SUPPLY','ENERGY_DEMAND','RESOURCE_STOCK'],
      industry:['INPUT_AVAILABILITY','PRODUCTION_CAPACITY','EFFECTIVE_CAPACITY','OUTPUT','PRODUCTIVITY','ENERGY_DEMAND'],
      production:['PRODUCTION_CAPACITY','EFFECTIVE_CAPACITY','OUTPUT','INPUT_AVAILABILITY'],
      trade:['IMPORT_DEPENDENCE','EXPORT_DEMAND','MARKET_PRICE','FOREIGN_CURRENCY','TRADE_ROUTE_CAPACITY'],
      finance:['REVENUE','EXPENDITURE','LIQUIDITY','CAPITAL_AVAILABILITY','FOREIGN_CURRENCY','DEBT_SERVICE_PRESSURE'],
      infrastructure:['INFRASTRUCTURE_CAPACITY','TRANSPORT_CAPACITY','EFFECTIVE_CAPACITY','LOGISTICS_CONGESTION','NETWORK_FAILURE_RISK'],
      logistics:['TRADE_ROUTE_CAPACITY','TRANSPORT_CAPACITY','LOGISTICS_CONGESTION','EFFECTIVE_CAPACITY'],
      labor:['LABOR_AVAILABILITY','SKILLED_LABOR','UNEMPLOYMENT','WAGE_PRESSURE','HOUSEHOLD_INCOME'],
      population:['POPULATION','POPULATION_GROWTH','MIGRATION_PRESSURE','HOUSEHOLD_INCOME','CONSUMER_DEMAND'],
      housing:['HOUSING_DEMAND','HOUSING_SUPPLY','INFRASTRUCTURE_CAPACITY','LABOR_AVAILABILITY'],
      education:['EDUCATION_CAPACITY','SKILLED_LABOR','PRODUCTIVITY'],health:['HEALTH_CAPACITY','HEALTH_PRESSURE','PUBLIC_SERVICE_CAPACITY'],
      technology:['TECHNOLOGY_CAPABILITY','R_AND_D_CAPABILITY','PRODUCTIVITY','OUTPUT'],assets:['ASSET_AGE','MAINTENANCE_BACKLOG','EFFECTIVE_CAPACITY','OUTPUT'],
      security:['SECURITY_THREAT','MILITARY_READINESS','LIQUIDITY'],foreign:['FOREIGN_TENSION','EXPORT_DEMAND','TRADE_ROUTE_CAPACITY','SECURITY_THREAT'],
      welfare:['WELFARE_PRESSURE','HOUSEHOLD_INCOME','CONSUMER_DEMAND'],disaster:['DISASTER_DAMAGE','HEALTH_PRESSURE','INFRASTRUCTURE_CAPACITY','WELFARE_PRESSURE'],
      development:['OUTPUT','PRODUCTIVITY','CAPITAL_AVAILABILITY'],investment:['INVESTMENT_DEMAND','CAPITAL_AVAILABILITY','OUTPUT'],
      demand:['CONSUMER_DEMAND','INFLATION','WELFARE_PRESSURE'],institution:['STABILITY','CORRUPTION','PUBLIC_SERVICE_CAPACITY']
    };
    return [...(m[String(domain||'').toLowerCase()]||[])];
  }
  preview(d,a){
    const domains=ACTIONS[a]?.domains||[];
    const direct=[...new Set(domains.flatMap(x=>this.domainSignals(x)))];
    const down=this.g.down(direct),secondary=down.filter(x=>!direct.includes(x));
    const external=down.filter(x=>['FOREIGN_TENSION','EXPORT_DEMAND','TRADE_ROUTE_CAPACITY','SECURITY_THREAT'].includes(x));
    const out={decisionId:d.decisionId,action:a,domains,direct,secondary,external,crossDomain:new Set(down).size>1};
    this.tr.add({layer:'L21_CONSEQUENCE_ENGINE',countryId:d.countryId,decisionId:d.decisionId,action:a,direct,secondary,external});return out;
  }
  affectedActors(e){
    const origin=ID(e?.countryId),actors=new Set(origin?[origin]:[]),raw=this.gw.get('relations');
    for(const r of ROWS(raw)){const ids=['countryId','sourceCountryId','targetCountryId','partnerCountryId','fromCountryId','toCountryId','actorId','targetId'].map(k=>ID(r?.[k])).filter(Boolean);if(!origin||ids.includes(origin))for(const z of ids)actors.add(z);}
    for(const z of e?.affectedActors||[])if(ID(z))actors.add(ID(z));return [...actors];
  }
  outcome(e){
    const inputs=[...(e?.impactedNodes||[]),...(e?.domains||[])];
    const normalized=[...new Set(inputs.flatMap(x=>this.domainSignals(x)))];
    const dirty=this.g.down(normalized.length?normalized:inputs),actors=this.affectedActors(e);
    this.tr.add({layer:'L21_CONSEQUENCE_ENGINE',countryId:e?.countryId,eventType:e?.eventType,inputs,normalizedSignals:normalized,dirty,affectedActors:actors,propagated:true});
    return{dirty,affectedActors:actors};
  }
}
class Forecast{
  constructor(tr){this.tr=tr;this.h=new Map();this.projects=[];}
  observe(s){const a=this.h.get(s.countryId)||[];if(!a.length||a[a.length-1].turn!==s.turn)a.push({turn:s.turn,signals:CLONE(s.signals)});this.h.set(s.countryId,a.slice(-24));}
  run(s,gp){
    const h=this.h.get(s.countryId)||[],trend={},projectedShortfalls=[];
    if(h.length>=2){const a=h[h.length-2],b=h[h.length-1];Object.keys(b.signals).forEach(k=>{const x=SCALAR(a.signals[k]?.value),y=SCALAR(b.signals[k]?.value);if(x===null||y===null)return;const slope=y-x;trend[k]={direction:slope>0?'RISING':slope<0?'FALLING':'STABLE',from:x,to:y,slope};});}
    Object.entries(gp.gaps).forEach(([gap,row])=>{if(row.state==='TRUE')projectedShortfalls.push({gap,current:true,severity:row.pressure?.ratio??null,trend:trend[gap]||null});});
    const out={trend,projectedShortfalls,basis:{currentState:true,observedTurns:h.length,committedProjects:CLONE(this.projects),knownConstraints:projectedShortfalls.map(x=>x.gap)},window:'SCHEDULER_DEFINED'};
    this.tr.add({layer:'L22_FORECAST_ENGINE',countryId:s.countryId,trendSignals:Object.keys(trend).length,shortfalls:projectedShortfalls.length});return out;
  }
  setProjects(p){this.projects=CLONE(p||[]);}save(){return CLONE(Object.fromEntries(this.h));}restore(v){this.h=new Map(Object.entries(v||{}));}
}

class Scheduler{
  constructor(tr){this.tr=tr;this.last=new Map();this.dirty=new Map();}
  mode(gp,sc){if(gp.semantic.length||Object.values(gp.gaps).some(x=>x.state==='TRUE'))return'FULL';if(sc.length)return'STANDARD';return'BACKGROUND';}
  should(c,t,m){const interval={FULL:1,STANDARD:3,BACKGROUND:7}[m]||1,last=this.last.get(c),dirty=this.dirty.get(c),due=last===undefined||Number(t)-Number(last)>=interval||(dirty&&dirty.size>0);this.tr.add({layer:'L24_MULTI_RATE_SCHEDULER',countryId:c,turn:t,mode:m,interval,due,dirty:[...(dirty||new Set())]});return due;}
  mark(c,nodes,reason){const set=this.dirty.get(c)||new Set();(nodes||[]).forEach(x=>set.add(x));this.dirty.set(c,set);this.tr.add({layer:'L24_MULTI_RATE_SCHEDULER',countryId:c,reason,dirty:[...set],scheduled:true});}
  commit(c,t){this.last.set(c,Number(t));this.dirty.delete(c);this.tr.add({layer:'L24_MULTI_RATE_SCHEDULER',countryId:c,turn:t,action:'COMMIT_SCHEDULE',scheduledNext:true});}
  save(){return{last:Object.fromEntries(this.last),dirty:Object.fromEntries([...this.dirty].map(([k,v])=>[k,[...v]]))};}
  restore(v){this.last=new Map(Object.entries(v?.last||{}));this.dirty=new Map(Object.entries(v?.dirty||{}).map(([k,x])=>[k,new Set(x)]));}
}

class Reconcile{
  constructor(tr){this.tr=tr;}
  run(s){
    const checks=[],n=k=>SCALAR(s.signals[k]?.value),inv=n('RESOURCE_STOCK'),cap=n('EFFECTIVE_CAPACITY'),out=n('OUTPUT'),route=n('TRADE_ROUTE_CAPACITY'),load=n('LOGISTICS_CONGESTION');
    if(inv!==null)checks.push({id:'INVENTORY_NON_NEGATIVE',status:inv<0?'FAIL':'PASS',value:inv});
    if(cap!==null&&out!==null)checks.push({id:'OUTPUT_WITHIN_EFFECTIVE_CAPACITY',status:out<=cap?'PASS':'FAIL',output:out,capacity:cap});
    if(route!==null&&load!==null)checks.push({id:'LOGISTICS_WITHIN_ROUTE_CAPACITY',status:load<=route?'PASS':'FAIL',load,route});
    const rev=n('REVENUE'),exp=n('EXPENDITURE');if(rev!==null&&exp!==null)checks.push({id:'FISCAL_ARITHMETIC',status:'PASS',balance:rev-exp});
    const liq=n('LIQUIDITY');if(liq!==null)checks.push({id:'LIQUIDITY_NON_NEGATIVE',status:liq<0?'FAIL':'PASS',liquidity:liq});
    const failed=checks.filter(x=>x.status==='FAIL'),result={status:failed.length?'FAIL':checks.length?'PASS':'UNVERIFIED',checks,verifiedChecks:checks.length,failedChecks:failed.map(x=>x.id)};
    this.tr.add({layer:'L25_STATE_RECONCILIATION',countryId:s.countryId,status:result.status,checks});return result;
  }
}

class RuntimeFlowEngine{
  constructor(tr){this.tr=tr;}
  compare(required,available,meta={}){
    const r=SCALAR(required),a=SCALAR(available);
    if(r===null||a===null)return{status:RUNTIME_COMPARATORS.UNKNOWN,required:r,available:a,gap:null,ratio:null,...meta};
    const gap=r-a;
    return{status:gap>0?RUNTIME_COMPARATORS.DEFICIT:gap<0?RUNTIME_COMPARATORS.SURPLUS:RUNTIME_COMPARATORS.BALANCED,
      required:r,available:a,gap,ratio:r===0?0:Math.abs(gap)/Math.abs(r),...meta};
  }
  _bestMeasurementAction(m,sig,scenarioId){
    const base=APPROVED_POLICY_OVERRIDES[scenarioId]||[],candidates=[];
    const capacity=SCALAR(sig.EFFECTIVE_CAPACITY?.value),output=SCALAR(sig.OUTPUT?.value);
    const fx=SCALAR(sig.FOREIGN_CURRENCY?.value),route=SCALAR(sig.TRADE_ROUTE_CAPACITY?.value);
    const externalDemand=SCALAR(sig.EXPORT_DEMAND?.value),consumerDemand=SCALAR(sig.CONSUMER_DEMAND?.value);
    const reserve=SCALAR(m.reserve);
    if(m.status===RUNTIME_COMPARATORS.DEFICIT){
      if(capacity!==null&&output!==null&&capacity>output){
        candidates.push({action:'PRODUCTION_INCREASE',quantity:Math.min(m.gap,capacity-output),reason:'CAPACITY_HEADROOM'});
      }
      if(fx!==null&&fx>0&&route!==null&&route>0){
        candidates.push({action:'IMPORT',quantity:m.gap,reason:'FOREIGN_SUPPLY_FEASIBLE'});
      }
      if(reserve!==null&&reserve>0){
        candidates.push({action:'RESERVE_RELEASE',quantity:Math.min(m.gap,reserve),reason:'RESERVE_AVAILABLE'});
      }
      if(base.includes('DEMAND_MANAGEMENT')&&consumerDemand!==null&&consumerDemand>0){
        candidates.push({action:'DEMAND_MANAGEMENT',quantity:m.gap,reason:'OBSERVED_CONSUMER_DEMAND'});
      }
    }else if(m.status===RUNTIME_COMPARATORS.SURPLUS){
      if(externalDemand!==null&&externalDemand>0&&route!==null&&route>0){
        candidates.push({action:'EXPORT',quantity:Math.min(Math.abs(m.gap),externalDemand),reason:'EXTERNAL_DEMAND_AND_ROUTE'});
      }
      if(output!==null&&m.required!==null&&output>m.required){
        candidates.push({action:'PRODUCTION_DECREASE',quantity:output-m.required,reason:'OUTPUT_ABOVE_REQUIRED'});
      }
    }else if(m.status===RUNTIME_COMPARATORS.BALANCED){
      candidates.push({action:'HOLD',quantity:0,reason:'REQUIRED_EQUALS_AVAILABLE'});
    }
    candidates.sort((x,y)=>{
      const xi=base.indexOf(x.action),yi=base.indexOf(y.action);
      return (xi<0?Number.MAX_SAFE_INTEGER:xi)-(yi<0?Number.MAX_SAFE_INTEGER:yi)||String(x.action).localeCompare(String(y.action));
    });
    return candidates.length?candidates:[{action:'HOLD',quantity:0,reason:'NO_EVIDENCE_BACKED_CORRECTION'}];
  }
  analyze(countryId,s){
    const measures=[];
    const pairs=[
      ['FOOD','FOOD_DEMAND','FOOD_SUPPLY'],['ENERGY','ENERGY_DEMAND','ENERGY_SUPPLY'],
      ['HOUSING','HOUSING_DEMAND','HOUSING_SUPPLY'],['RESOURCE','RESOURCE_DEMAND','RESOURCE_STOCK']
    ];
    for(const [kind,need,available] of pairs){
      const m=this.compare(s.signals[need]?.value,s.signals[available]?.value,{kind,requiredSignal:need,availableSignal:available});
      if(m.status!==RUNTIME_COMPARATORS.UNKNOWN){m.candidates=this._bestMeasurementAction(m,s.signals,this._scenarioFor(kind));measures.push(m);}
    }
    const demand=SCALAR(s.signals.INVESTMENT_DEMAND?.value),out=SCALAR(s.signals.OUTPUT?.value),cap=SCALAR(s.signals.EFFECTIVE_CAPACITY?.value);
    if(demand!==null&&out!==null){
      const m=this.compare(demand,out,{kind:'INDUSTRY_OUTPUT',requiredSignal:'INVESTMENT_DEMAND',availableSignal:'OUTPUT'});
      if(m.status===RUNTIME_COMPARATORS.DEFICIT&&cap!==null&&cap>out)m.candidates=[{action:'PRODUCTION_INCREASE',quantity:Math.min(m.gap,cap-out),reason:'CAPACITY_HEADROOM'}];
      else if(m.status===RUNTIME_COMPARATORS.DEFICIT)m.candidates=[{action:'DOMESTIC_EXPANSION',quantity:m.gap,reason:'CAPACITY_BOUND'}];
      else m.candidates=this._bestMeasurementAction(m,s.signals,'FACTORY_EXPANSION');
      measures.push(m);
    }
    const re=g.ResourceMinistryEngine;
    let rs=null;try{rs=re?.getIntegratedResourceState?.(countryId)||null;}catch(_){}
    if(rs&&typeof rs==='object'){
      const prod=rs.production||{},cons=rs.consumption||{},resv=rs.reserves||{},inv=rs.inventory||{};
      for(const resourceId of [...new Set([...Object.keys(prod),...Object.keys(cons)])]){
        const m=this.compare(cons[resourceId],prod[resourceId],{kind:'RESOURCE_FLOW',resourceId,reserve:SCALAR(resv[resourceId]),inventory:SCALAR(inv[resourceId]),requiredSignal:'RESOURCE_CONSUMPTION',availableSignal:'RESOURCE_PRODUCTION'});
        if(m.status!==RUNTIME_COMPARATORS.UNKNOWN)m.candidates=this._bestMeasurementAction(m,s.signals,m.status===RUNTIME_COMPARATORS.SURPLUS?'RESOURCE_SURPLUS':'RESOURCE_DEFICIT');
        if(m.status!==RUNTIME_COMPARATORS.UNKNOWN)measures.push(m);
      }
    }
    const automaticDecisions=measures.map((m,i)=>({decisionId:'AUTO-'+ID(countryId)+'-'+s.turn+'-'+String(i+1),countryId:ID(countryId),simulationTurn:s.turn,
      scenarioId:this._scenarioFor(m.kind),decisionOrigin:'RUNTIME_CALCULATION',status:'AUTO_DECIDED',measurement:CLONE(m),selected:m.candidates?.[0]||{action:'HOLD',quantity:0,reason:'NO_CANDIDATE'},
      evidence:{required:m.required,available:m.available,gap:m.gap,status:m.status,requiredSignal:m.requiredSignal,availableSignal:m.availableSignal}}));
    this.tr.add({layer:'L05_DEMAND_ENGINE',countryId:countryId,runtimeComparisons:measures.length,automaticDecisions:automaticDecisions.length});
    return{measurements:measures,automaticDecisions};
  }
  _scenarioFor(kind){return({FOOD:'FOOD_SHORTAGE',ENERGY:'ENERGY_SHORTAGE',HOUSING:'HOUSING_SHORTAGE',RESOURCE:'RESOURCE_DEFICIT',RESOURCE_FLOW:'RESOURCE_DEFICIT',INDUSTRY_OUTPUT:'FACTORY_EXPANSION'})[kind]||'RESOURCE_DEFICIT';}
}
class RuntimeOperationEngine{
  constructor(tr){this.tr=tr;this.orders=new Map();}
  plan(d){
    const selection=d?.selected;
    if(!selection||!RUNTIME_ONLY_ACTIONS[selection.action])return null;
    const order={operationId:'OP-'+d.decisionId+'-'+selection.action,countryId:ID(d.countryId),simulationTurn:d.simulationTurn,scenarioId:d.scenarioId,
      actionType:selection.action,quantity:SCALAR(selection.quantity)??0,direction:selection.action==='PRODUCTION_INCREASE'?'INCREASE':selection.action==='PRODUCTION_DECREASE'?'DECREASE':'HOLD',
      status:'QUEUED_FOR_EXECUTOR',executor:RUNTIME_ONLY_ACTIONS[selection.action].owner,stateMutationAuthority:false,executionApplied:false,
      reason:selection.reason||null,measurement:CLONE(d.measurement||d.runtimeMeasurement||null)};
    this.orders.set(order.operationId,order);this.tr.add({layer:'L12_PROJECT_ENGINE',countryId:order.countryId,operationId:order.operationId,type:'RUNTIME_OPERATION_ORDER'});
    return CLONE(order);
  }
  save(){return CLONE([...this.orders.values()]);}
  restore(v){this.orders=new Map((Array.isArray(v)?v:[]).map(x=>[x.operationId,CLONE(x)]));}
}
class Runtime{
  constructor(o={}){
    this.tr=new Trace;
    this.gw=o.gateway||new Gateway({...o,trace:this.tr});
    this.idr=new Identity(this.gw,this.tr);
    this.actors=new ActorRegistry(this.gw,this.tr,this.idr);
    this.cap=new CapRegistry(this.gw,this.tr);
    this.graph=new Graph(this.tr);
    this.kernel=new Kernel(this.gw,this.idr,this.tr);
    this.demand=new Demand(this.tr);
    this.supply=new Supply(this.tr);
    this.gap=new GapPressure(this.tr);
    this.scenario=new ScenarioEngine(this.tr);
    this.mem=new Memory(this.tr);
    this.goal=new Goal(this.tr,this.mem);
    this.feas=new Feasibility(this.tr);
    this.decision=new Decision(this.tr,this.feas,this.mem);
    this.projects=new ProjectEngine(this.tr);this.runtimeFlow=new RuntimeFlowEngine(this.tr);this.operations=new RuntimeOperationEngine(this.tr);
    this.transactions=new TransactionEngine(this.tr);
    this.trade=new TradeMarketEngine(this.tr);
    this.finance=new FinanceEngine(this.tr);
    this.infra=new InfraLogisticsEngine(this.tr);
    this.population=new PopulationLaborEngine(this.tr);
    this.technology=new TechProductivityEngine(this.tr);
    this.policyEngine=new PolicyInstitutionEngine(this.tr);
    this.policyLifecycle=new PolicyLifecycle(this.tr);
    this.events=new EventShock(this.tr);
    this.forecast=new Forecast(this.tr);
    this.scheduler=new Scheduler(this.tr);
    this.reconcile=new Reconcile(this.tr);
    this.cons=new Consequence(this.tr,this.graph,this.gw);
    this.runs=new Map;
    this.history=[];
    this.bound=new Set;
    this.running=true;
    this.reasoner=null;
    this.lastTurn=null;
    this.lastError=null;
    this.attached=false;
  }
  async init(o={}){
    try{
      if(o.fetchCountries!==false&&this.gw.get('countries')===undefined)await this.gw.load('countries');for(const k of ['population','economy','cities','relations'])if(this.gw.get(k)===undefined)try{await this.gw.load(k);}catch(e){this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'DATASET_OPTIONAL_LOAD_FAILED',datasetId:k,error:String(e?.message||e)});}
      this.idr.rebuild();
      this.actors.rebuild();
      if(o.preload){
        for(const k of Object.keys(DATASETS))if(k!=='countries')try{await this.gw.load(k)}catch(_){}
      }
      this.cap.rebuild();
      this.actors.rebuild();
      this.graph.build();
      this.bind();
      return this.diag();
    }catch(e){
      this.lastError=String(e?.message||e);
      return this.diag();
    }
  }
  async countries(){
    if(this.idr.list().length)return this.idr.list();
    if(this.gw.get('countries')===undefined)await this.gw.load('countries');
    this.idr.rebuild();this.actors.rebuild();return this.idr.list();
  }
  async evaluate(c,t=TURN()){
    const s=this.kernel.snap(c,t);s.rawState=WORLD();this.graph.build();
    const demand=this.demand.run(s),supply=this.supply.run(s),gap=this.gap.run(s),events=this.events.run(s.countryId),scenarios=this.scenario.run(s,gap,events),runtimeAnalysis=this.runtimeFlow.analyze(s.countryId,s);
    const mode=this.scheduler.mode(gap,scenarios);
    if(!this.scheduler.should(s.countryId,t,mode))return{status:'SKIPPED',countryId:s.countryId,turn:t,mode,last:this.runs.get(s.countryId)||null};
    this.forecast.observe(s);this.forecast.setProjects(this.projects.list(s.countryId));
    const ctx={countryId:s.countryId,turn:t,mode,signals:s.signals,demand,supply,gapPressure:gap,scenarios,events,
      countryCapabilities:this.cap.forCountry(s.countryId),forecasts:null};
    for(const [k,v] of Object.entries(s.signals))if(v.status==='AVAILABLE')ctx.countryCapabilities[k]=true;
    ctx.forecasts=this.forecast.run(s,gap);
    ctx.subsystems={trade:this.trade.run(s),finance:this.finance.run(s),infra:this.infra.run(s),population:this.population.run(s),technology:this.technology.run(s),policy:this.policyEngine.run(s)};
    const goals=this.goal.run(s.countryId,scenarios,gap),policyDecisions=this.decision.run(s.countryId,goals,ctx),automaticDecisions=runtimeAnalysis.automaticDecisions.map(x=>({decisionId:x.decisionId,countryId:x.countryId,simulationTurn:x.simulationTurn,scenarioId:x.scenarioId,status:x.status,selectedActions:[x.selected.action],selected:x.selected,runtimeMeasurement:x.measurement,evidence:x.evidence,selectedEvaluations:[{action:x.selected.action,feasibility:{status:'RUNTIME_FEASIBLE'}}]})),decisions=[...policyDecisions,...automaticDecisions];
    const reconciliation=this.reconcile.run(s),development=this.development(s,gap);
    decisions.forEach(d=>this.mem.decision(s.countryId,d));
    const out={status:'COMPLETE',countryId:s.countryId,turn:t,mode,identity:s.identity,signals:s.signals,demand,supply,gapPressure:gap,scenarios,goals,
      decisions,runtimeAnalysis,forecasts:ctx.forecasts,reconciliation,development,events,subsystems:ctx.subsystems};
    this.runs.set(s.countryId,out);this.scheduler.commit(s.countryId,t);
    this.history.push({countryId:s.countryId,turn:t,scenarios:scenarios.map(x=>x.id),decisions:decisions.map(x=>x.decisionId)});if(this.history.length>MAX)this.history.shift();
    this.emitCoverage(s.countryId,t);return out;
  }
  development(s,g){
    const av=k=>s.signals[k]?.status==='AVAILABLE';
    return{emergent:true,basis:'SATISFACTION_AND_CAPACITY_STATE',
      conditionSet:{basicNeeds:['FOOD_SUPPLY','HOUSING_SUPPLY','HEALTH_CAPACITY'].filter(av),
        productiveCapacity:['OUTPUT','PRODUCTIVITY','LABOR_AVAILABILITY','CAPITAL_AVAILABILITY'].filter(av),
        humanCapital:['EDUCATION_CAPACITY','TECHNOLOGY_CAPABILITY'].filter(av),
        infrastructure:['INFRASTRUCTURE_CAPACITY','TRANSPORT_CAPACITY'].filter(av),
        financialStability:['CAPITAL_AVAILABILITY','LIQUIDITY'].filter(av),
        resilience:['HEALTH_CAPACITY','INFRASTRUCTURE_CAPACITY','RESOURCE_RESERVE'].filter(av)},
      currentPressures:g.semantic.map(x=>x.signal)};
  }
  emitCoverage(c,t){
    const r=this.runs.get(c),executed=[...new Set(this.tr.a.map(x=>x.layer).filter(Boolean))];
    this.tr.add({layer:'L26_EVIDENCE_TRACE',countryId:c,turn:t,availableSignals:r?Object.values(r.signals).filter(x=>x.status==='AVAILABLE').length:0,
      scenarioCount:r?.scenarios?.length||0,decisionCount:r?.decisions?.length||0,executedLayers:executed.length});
    this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'REAL_LAYER_EXECUTION_TRACE',countryId:c,turn:t});
  }
  bind(){
    const x=IO();
    if(!x?.registerAction||!x?.registerCommandHandler)return{status:'UNAVAILABLE'};
    const result=[];
    const autoId='OCR_V42_RUNTIME_AUTO';
    if(!this.bound.has(autoId)){
      try{
        x.registerAction(autoId,{actionId:autoId,stateOwnerMinistry:'economy',authority:'OMEGA_AUTONOMOUS_RUNTIME',
          candidateActionTypes:Object.keys(RUNTIME_ONLY_ACTIONS),requiredCapabilities:[]});
        x.registerCommandHandler(autoId,'economy',(cmd,ctx)=>this.handleRuntimeAuto(cmd,ctx));
        this.bound.add(autoId);
      }catch(e){this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'RUNTIME_AUTO_BIND_FAILED',error:String(e?.message||e)});}
    }
    for(const sc of SCENARIOS){
      const id='OCR_V42_'+sc.id;
      if(this.bound.has(id))continue;
      try{
        x.registerAction(id,{
          actionId:id,
          stateOwnerMinistry:sc.owner,
          authority:'OMEGA_AUTONOMOUS_WORLD_SIMULATION',
          scenarioId:sc.id,
          candidateActionTypes:sc.actions,
          requiredCapabilities:sc.requiredCapabilities,
          observedState:sc.observedState,
          derivedConditions:sc.derivedConditions,
          feasibilityRequirements:sc.feasibilityRequirements,
          decisionFactors:sc.decisionFactors,
          executionMethod:sc.executionMethod,
          expectedConsequences:sc.expectedConsequences,
          failureConditions:sc.failureConditions,
          recoveryConditions:sc.recoveryConditions,
          exitConditions:sc.exitConditions,
          reevaluationRule:sc.reevaluationRule
        });
        x.registerCommandHandler(id,sc.owner,(cmd,ctx)=>this.handle(cmd,ctx));
        this.bound.add(id);
        result.push({id,status:'BOUND'});
      }catch(e){
        result.push({id,status:'FAILED',error:String(e?.message||e)});
      }
    }
    this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'BIND',count:this.bound.size});
    return{status:'READY',results:result};
  }
  handleRuntimeAuto(cmd,ctx={}){
    const d=cmd?.payload?.opponentDecision||{},selected=d.selected||d.runtimeMeasurement?.selected,country=ID(d.countryId||cmd?.countryId);
    if(!country)return{accepted:false,reason:'COUNTRY_ID_REQUIRED'};
    if(!selected||!RUNTIME_ONLY_ACTIONS[selected.action])return{accepted:false,reason:'RUNTIME_ACTION_NOT_REGISTERED'};
    const tx=ctx?.stateTransaction;if(!tx)return{accepted:false,reason:'AUTHORITATIVE_STATE_TRANSACTION_UNAVAILABLE'};
    const order=this.operations.plan({decisionId:d.decisionId||('AUTO-'+TURN()),countryId:country,simulationTurn:d.simulationTurn??TURN(),scenarioId:d.scenarioId,selected,measurement:d.runtimeMeasurement||d.measurement,evidence:d.evidence});
    if(!order)return{accepted:false,reason:'RUNTIME_ORDER_CREATION_FAILED'};
    const path='economy.autonomousOrders',current=tx.get(path),next=Array.isArray(current)?current.slice(-127).concat([order]):[order];
    tx.set(path,next);tx.set('economy.autonomousLastOrder',order);
    return{accepted:true,executionState:'QUEUED_FOR_EXECUTOR',worldEffectApplied:false,batch:{batchId:'AUTO-'+order.operationId,plans:[order],executionApplied:false,stateMutationAuthority:false}};
  }
  handle(cmd,ctx={}){
  const d=cmd?.payload?.opponentDecision||cmd?.payload?.decision||{},selected=Array.isArray(d.selectedActions)?d.selectedActions:(d.decisionOrigin==='RUNTIME_CALCULATION'&&d.selected?.action?[d.selected.action]:[]),country=ID(d.countryId||cmd?.countryId);
  if(!country)return{accepted:false,reason:'COUNTRY_ID_REQUIRED'};
  const sc=SCENARIOS.find(x=>x.id===d.scenarioId);if(!sc)return{accepted:false,reason:'SCENARIO_NOT_REGISTERED'};
  if(!selected.length)return{accepted:false,reason:'NO_SELECTED_ACTIONS'};
  for(const a of selected)if(!ACTIONS[a])return{accepted:false,reason:'ACTION_NOT_REGISTERED:'+a};
  const context=this.runs.get(country)||d.context;if(!context)return{accepted:false,reason:'DECISION_CONTEXT_UNAVAILABLE'};
  const feasibility=selected.map(a=>({action:a,result:this.feas.check(country,a,context)}));
  if(feasibility.some(x=>x.result.status!=='FEASIBLE'))return{accepted:false,reason:'SELECTED_ACTION_NOT_FEASIBLE',feasibility};
  const plans=[];
  for(const a of selected){
    const runtimeOrder=this.operations.plan({...d,countryId:country,selected:d.selected||d.runtimeMeasurement?.selected,runtimeMeasurement:d.runtimeMeasurement,measurement:d.runtimeMeasurement});const p=runtimeOrder||this.projects.plan({...d,countryId:country,context},a)||this.transactions.plan({...d,countryId:country,context},a)||this.policyLifecycle.plan({...d,countryId:country,context},a);
    if(p){plans.push(p);this.cons.preview(d,a);}
  }
  if(!plans.length)return{accepted:false,reason:'NO_EXECUTABLE_PLAN'};
  const owner=String(cmd.sourceMinistryId||'cabinet'),turn=NUM(ctx?.simulationTurn)??TURN(),batch={
    batchId:'EXEC-'+turn+'-'+country+'-'+sc.id+'-'+String(d.decisionId||'').replace(/[^A-Z0-9_-]/gi,''),countryId:country,decisionId:d.decisionId||null,
    scenarioId:d.scenarioId,plans,status:'PENDING_EXTERNAL_EXECUTOR',executionApplied:false,
    executorBoundary:'EXTERNAL_MINISTRY_OR_PROJECT_TRANSACTION_POLICY_ENGINE',turn,stateMutationAuthority:false,feasibility
  };
  this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'EXECUTION_STARTED',batchId:batch.batchId,executionApplied:false,planCount:plans.length});
  try{
    if(ctx?.stateTransaction){
      const key=owner+'.executionOrders',q=ctx.stateTransaction.get(key),order={...batch,executionState:'QUEUED_FOR_EXECUTOR',worldEffectApplied:false};
      ctx.stateTransaction.set(key,Array.isArray(q)?q.slice(-127).concat([order]):[order]);
      ctx.stateTransaction.set(owner+'.lastExecutionOrder',order);
    }
    ctx?.emitEvent?.('OMEGA_AUTONOMOUS_EXECUTION_REQUESTED',batch);
    this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'EXECUTION_HANDOFF',batchId:batch.batchId,executorBoundary:batch.executorBoundary});
    return{accepted:true,batch:CLONE(batch)};
  }catch(e){
    this.lastError=String(e?.message||e);this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'EXECUTION_HANDOFF_FAILED',error:this.lastError});
    return{accepted:false,error:this.lastError};
  }
}

async turnCommitted(t=TURN()){
    if(!this.running)return{status:'SKIPPED',reason:'STOPPED'};
    try{
      this.bind();
      const ids=await this.countries(),p=PLAYER(),opp=ids.filter(x=>!p||x!==p);
      const evaluated=[],queued=[];
      for(const c of opp){
        const r=await this.evaluate(c,t);
        if(r.status==='COMPLETE')evaluated.push(r);
      }
      for(const r of evaluated)for(const d of r.decisions){
        const q=this.queue(d,t);
        if(q)queued.push(q);
      }
      this.lastTurn=t;
      return{
        status:'COMPLETE',turn:t,opponents:opp.length,
        evaluated:evaluated.length,
        decisions:evaluated.reduce((a,x)=>a+x.decisions.length,0),
        queued:queued.length
      };
    }catch(e){
      this.lastError=String(e?.message||e);
      return{status:'ERROR',turn:t,error:this.lastError};
    }
  }
  queue(d,t){
    if(d?.decisionOrigin==='RUNTIME_CALCULATION'&&d?.selected?.action==='HOLD')return null;
    const r=SIM();if(!r?.enqueueCommand)return null;
    const sc=SCENARIOS.find(x=>x.id===d.scenarioId);if(!sc)return null;
    const id='OCR_V42_'+d.scenarioId;
    const cmd={commandId:'OCR-V42-'+t+'-'+ID(d.countryId)+'-'+d.scenarioId+'-'+String(d.decisionId||''),
      commandType:id,actionId:id,sourceMinistryId:sc.owner,countryId:ID(d.countryId),payload:{opponentDecision:CLONE(d)},
      options:{origin:d.decisionOrigin==='RUNTIME_CALCULATION'?'OMEGA_AUTONOMOUS_RUNTIME':'OMEGA_AUTONOMOUS_WORLD_SIMULATION',
        scenarioId:d.scenarioId,correlationId:d.decisionId}};
    try{r.enqueueCommand(cmd);return cmd;}catch(e){this.lastError=String(e?.message||e);return null;}
  }
  outcome(e){
    const c=ID(e?.countryId);
    if(!c)return null;
    if(e?.projectId)this.projects.advance(e);
    if(e?.transactionId)this.transactions.settle(e);
    if(e?.policyId)this.policyLifecycle.advance(e);
    const x=this.cons.outcome(e);
    const turn=NUM(e?.simulationTurn)??TURN();
    let hydrated=null,reconciliation=null;
    try{
      hydrated=this.kernel.snap(c,turn);
      reconciliation=this.reconcile.run(hydrated);
      this.tr.add({layer:'L03_WORLD_STATE_KERNEL',countryId:c,turn,stateUpdated:true,source:'POST_EXECUTION_REHYDRATION'});
    }catch(err){
      reconciliation={status:'UNKNOWN',error:String(err?.message||err)};
      this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'POST_EXECUTION_REHYDRATION_FAILED',countryId:c,error:reconciliation.error});
    }
    this.mem.outcome(c,e);
    for(const a of x.affectedActors||[])this.scheduler.mark(a,x.dirty,e?.eventType||'OUTCOME');
    this.tr.add({layer:'L27_RUNTIME_DEBUG',type:'NEXT_EVALUATION_SCHEDULED',countryId:c,affectedActors:x.affectedActors||[],dirty:x.dirty||[]});
    return{...x,hydratedState:hydrated,reconciliation};
  }
  assess(c,t=TURN()){
    const r=this.runs.get(ID(c));
    return r&&r.turn===t?ASSESS(r):this.evaluate(c,t).then(ASSESS);
  }
  setReasoningAdapter(fn){this.reasoner=typeof fn==='function'?fn:null;return{status:this.reasoner?'BOUND':'UNBOUND'};}
  async reason(c,t=TURN()){
    const r=this.runs.get(ID(c))||await this.evaluate(c,t);
    if(!this.reasoner)return{status:'NOT_BOUND',context:CLONE(r),mutationAuthority:false};
    const ans=await this.reasoner(CLONE({
      countryId:r.countryId,turn:r.turn,signals:r.signals,gaps:r.gapPressure,
      scenarios:r.scenarios,goals:r.goals,decisions:r.decisions,forecasts:r.forecasts
    }));
    return{status:'RETURNED',result:CLONE(ans),mutationAuthority:false};
  }
  attach(){
    if(this.attached||typeof g.addEventListener!=='function')return this.attached;
    g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',e=>{
      const t=NUM(e?.detail?.payload?.turn??e?.detail?.turn)??TURN();
      void this.turnCommitted(t);
    });
    for(const ev of ['OMEGA_PROJECT_COMPLETED','OMEGA_PROJECT_BLOCKED','OMEGA_TRANSACTION_SETTLED','OMEGA_TRANSACTION_FAILED','OMEGA_POLICY_EXECUTED','OMEGA_EVENT_SHOCK_APPLIED']){
      g.addEventListener(ev,e=>this.outcome(e?.detail?.payload||e?.detail||{}));
    }
    this.attached=true;
    return true;
  }
  diag(){
    const executed=new Set(this.tr.a.map(x=>x.layer).filter(Boolean)),known=new Set(LAYERS.map(x=>x.id)),real=[...executed].filter(x=>known.has(x)),runtime=this.tr.a.filter(x=>x.runtimeComparisons!==undefined);
    return{version:V,schemaVersion:SV,layers:LAYERS.length,executedLayers:real.length,unexecutedLayers:LAYERS.length-real.length,
      scenarioCount:SCENARIOS.length,directionalSignals:Object.keys(DIR).length,actionTypes:Object.keys(ACTIONS).length,registeredCommands:this.bound.size,trackedCountries:this.runs.size,
      lastTurn:this.lastTurn,lastError:this.lastError,traceEntries:this.tr.a.length,traceLayers:[...executed],datasets:this.gw.status(),capabilities:this.cap.snapshot(),
      runtimeCalculation:{enginePresent:!!this.runtimeFlow,comparisonPasses:runtime.reduce((n,x)=>n+Number(x.runtimeComparisons||0),0),
        automaticDecisions:runtime.reduce((n,x)=>n+Number(x.automaticDecisions||0),0),numericValuesSource:'OBSERVED_STATE_ONLY'},
      approvedPolicyLayer:{scenarioRules:Object.keys(APPROVED_POLICY_OVERRIDES).length,numericStateTransitions:0},
      dataTruth:{syntheticFallbackTraceEntries:this.tr.a.filter(x=>x.syntheticFallback===true).length,missingDataPolicy:'UNKNOWN_OR_UNAVAILABLE'},
      contracts:{dataIntake:true,schemaDiscovery:[...this.gw.p.values()].every(x=>!!x.schema),identity:this.gw.get('countries')===undefined||this.idr.map.size>0,
        fieldMeaning:[...this.gw.p.values()].some(x=>Object.keys(x.fieldMeaning||{}).length>0),unitDetection:[...this.gw.p.values()].some(x=>Object.keys(x.units||{}).length>0),
        runtimeBinding:this.bound.size>0||!IO(),capabilityRegistry:this.cap.m.size>0||this.gw.p.size===0,stateHydration:true,dependencyGraph:this.graph.count()>0,
        demand:true,supplyCapacity:true,needGapPressure:true,scenario:true,goalPriority:true,decision:true,feasibility:true,runtimeComparison:!!this.runtimeFlow,
        projectLifecycle:true,transactionLifecycle:true,operationLifecycle:!!this.operations,policyLifecycle:true,tradeMarket:true,finance:true,infraLogistics:true,
        populationLabor:true,techProductivity:true,policyInstitution:true,eventShock:true,consequence:true,forecast:true,memoryAdaptation:true,
        multiRateScheduler:true,stateReconciliation:true,evidenceTrace:real.includes('L26_EVIDENCE_TRACE'),runtimeDebug:real.includes('L27_RUNTIME_DEBUG')}}
  }
save(){
    return{
      schemaVersion:SV,version:V,history:CLONE(this.history),runs:CLONE(Object.fromEntries(this.runs)),
      memory:this.mem.save(),forecast:this.forecast.save(),scheduler:this.scheduler.save(),
      projects:this.projects.save(),operations:this.operations.save(),transactions:this.transactions.save(),policies:this.policyLifecycle.save(),queued:this.queued?[...this.queued]:[],
      trace:this.tr.save(),datasets:this.gw.save(),hydrated:CLONE(Object.fromEntries(this.kernel.hyd))
    };
  }
  load(s){
    if(Number(s?.schemaVersion)!==SV)throw Error('AUTONOMOUS_RUNTIME_SCHEMA_MISMATCH');
    this.history=CLONE(s.history||[]);
    this.runs=new Map(Object.entries(s.runs||{}));
    this.mem.restore(s.memory);
    this.forecast.restore(s.forecast);
    this.scheduler.restore(s.scheduler);
    this.projects.restore(s.projects);
    this.transactions.restore(s.transactions);
    this.policyLifecycle.restore(s.policies);
    this.tr.restore(s.trace);
    this.gw.restore(s.datasets);
    this.kernel.hyd=new Map(Object.entries(s.hydrated||{}));
    this.idr.rebuild();
    this.cap.rebuild();
    this.actors.rebuild();
    return this.diag();
  }
}
function ASSESS(r){return{countryId:r.countryId,simulationTurn:r.turn,problemSignals:Object.entries(r.signals).filter(([k,o])=>EVAL_DIR(k,o.raw,DIR[k]?.problemWhen).state==='TRUE').map(([k])=>k),opportunitySignals:Object.entries(r.signals).filter(([k,o])=>DIR[k]?.opportunityWhen&&DIRECTION(o.raw)===DIR[k].opportunityWhen).map(([k])=>k),unknownSignals:Object.entries(r.signals).filter(([,o])=>o.status!=='AVAILABLE').map(([k])=>k),gaps:CLONE(r.gapPressure.gaps),scenarios:r.scenarios.map(x=>x.id),goals:r.goals.map(x=>x.goalId),decisions:r.decisions.map(x=>x.decisionId),forecasts:CLONE(r.forecasts),reconciliation:CLONE(r.reconciliation),development:CLONE(r.development)};}
const RT=new Runtime();
const API={VERSION:V,SCHEMA_VERSION:SV,LAYERS:CLONE(LAYERS),DATASETS:CLONE(DATASETS),STATE_DIRECTION_REGISTRY:CLONE(DIR),CAPABILITY_PATTERNS:CLONE(SIGNALS),GAP_RELATION_REGISTRY:CLONE(REL),ACTION_TYPES:CLONE(ACTIONS),SCENARIO_REGISTRY:CLONE(SCENARIOS),RUNTIME_LAYER_REGISTRY:CLONE(LAYERS),instance:RT,initialize:o=>RT.init(o||{}),attachToSimulation:()=>RT.attach(),onTurnCommitted:t=>RT.turnCommitted(t??TURN()),evaluateCountry:(c,t)=>RT.evaluate(c,t),assessCountryState:(c,t)=>RT.assess(c,t),listCountryIds:()=>RT.countries(),listActors:(type)=>RT.actors.list(type),evaluateActor:(actorId,t)=>RT.evaluate(actorId,t),evaluateDirection:(s,o,e)=>EVAL_DIR(s,o,e),loadDataset:async(k,o)=>{const v=await RT.gw.load(k,o||{});RT.idr.rebuild();RT.cap.rebuild();RT.actors.rebuild();return v;},setDataset:(k,v)=>{RT.gw.set(k,v);RT.idr.rebuild();RT.cap.rebuild();RT.actors.rebuild();return true;},getDataset:k=>RT.gw.get(k),getDatasetProfile:k=>RT.gw.profile(k),getHydratedState:c=>RT.kernel.getHydrated(c),handleOutcome:e=>RT.outcome(e),markDirty:(c,n,r)=>RT.scheduler.mark(ID(c),n,r),setReasoningAdapter:f=>RT.setReasoningAdapter(f),reason:(c,t)=>RT.reason(c,t),diagnostics:()=>RT.diag(),saveState:()=>RT.save(),loadState:s=>RT.load(s),getTrace:()=>RT.tr.save(),buildDependencyGraph:c=>{RT.graph.build();const s=RT.kernel.snap(c,TURN());return RT.graph.down(Object.keys(s.signals).filter(k=>s.signals[k].status==='AVAILABLE'));}};
g.Omega=g.Omega||{};g.Omega.OpponentCountryRules=Object.freeze(API);g.Omega.OpponentCountryRuntime=Object.freeze(API);g.OmegaAutonomousWorldSimulation=Object.freeze(API);g.OmegaOpponentCountryRules=Object.freeze(API);try{RT.attach();}catch(e){RT.lastError=String(e?.message||e);}if(typeof g.addEventListener==='function')g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{void RT.init({turn:TURN()});});else void RT.init({fetchCountries:false,turn:TURN()});
})(typeof window!=='undefined'?window:globalThis);