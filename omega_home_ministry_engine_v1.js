/* OMEGA HOME MINISTRY POLICE ENGINE v1.0.0
 * Country-scoped police staffing, procurement, facilities, research, training,
 * intelligence operations, daily payroll and deterministic incident events.
 * Expenditure requires an existing authoritative treasury record.
 */
(function (g) {
  'use strict';
  const VERSION = '1.0.0', DAY_MS = 86400000, VEHICLE_UNLOCK_MS = 180 * DAY_MS;
  const POLICE_SALARY_PER_DAY = 65, POLICE_RECRUITMENT_COST = 2500;
  const AGENT_RECRUITMENT_COST = 50000, AGENT_SALARY_PER_DAY = 500;
  const STATE_COMMAND = 'HOME_POLICE_STATE_PATCH';
  const CAPABILITY_MATERIALS_COMMAND = 'OMEGA_HOME_POLICE_CAPABILITY_MATERIALS';
  const FINANCE_CASH_COMMAND = 'HOME_POLICE_FINANCE_CASH_ADJUST';
  const ECONOMY_INCIDENT_COMMAND = 'HOME_POLICE_APPLY_SECURITY_INCIDENT';

  const VEHICLES = Object.freeze([
    {level:1,id:'cityline-compact',iconId:'cityline',name:'Cityline Patrol Compact',emoji:'🚓',className:'TIER I · ENTRY PATROL',specialty:'Urban patrol',terrain:'City streets',environmentFit:{"city":98,"highway":75,"rural":48,"border":20,"industrial":62,"mountain":18,"coastal":48},speed:120,acceleration:48,capacity:4,durability:40,rangeKm:420,enduranceHours:8,cost:5000,maintenancePerDay:45,capabilities:{response:42,patrol:52,protection:24,crowdControl:12,surveillance:22,offRoad:14,command:10,counterSmuggling:15},specialFeatures:['Budget-friendly service parts','Tight turning radius','Basic dispatch radio'],strengths:'Lowest upkeep and reliable everyday street coverage',tradeoff:'Low armor and limited performance on rough terrain',role:'Routine urban patrol and first response'},
    {level:2,id:'falcon-rs',iconId:'falcon',name:'Falcon Rapid Response Sedan',emoji:'🚔',className:'TIER II · RAPID RESPONSE',specialty:'Fast urban response',terrain:'Road network',environmentFit:{"city":92,"highway":98,"rural":35,"border":18,"industrial":48,"mountain":12,"coastal":35},speed:145,acceleration:76,capacity:4,durability:43,rangeKm:480,enduranceHours:10,cost:8000,maintenancePerDay:60,capabilities:{response:72,patrol:48,protection:25,crowdControl:10,surveillance:28,offRoad:12,command:14,counterSmuggling:24},specialFeatures:['High-acceleration pursuit tuning','Enhanced road navigation','Dual-channel emergency radio'],strengths:'Reaches city incidents quickly and intercepts road targets',tradeoff:'Less durable than SUVs and weak off-road performance',role:'Fast response across the city grid'},
    {level:3,id:'ranger-suv',iconId:'ranger',name:'Ranger Tactical SUV',emoji:'🚙',className:'TIER III · MULTI-ROLE',specialty:'Rural and mixed patrol',terrain:'City, highway and light off-road',environmentFit:{"city":72,"highway":76,"rural":90,"border":67,"industrial":83,"mountain":75,"coastal":65},speed:132,acceleration:58,capacity:6,durability:62,rangeKm:540,enduranceHours:11,cost:12000,maintenancePerDay:85,capabilities:{response:52,patrol:62,protection:48,crowdControl:28,surveillance:38,offRoad:68,command:20,counterSmuggling:40},specialFeatures:['Raised all-weather suspension','Roof-mounted scene lighting','Portable roadside checkpoint kit'],strengths:'Flexible coverage across roads, countryside and uneven ground',tradeoff:'Higher fuel and maintenance use than basic patrol cars',role:'Mixed urban and rural patrol'},
    {level:4,id:'sentinel-van',iconId:'sentinel',name:'Sentinel Personnel Transport Van',emoji:'🚐',className:'TIER IV · PERSONNEL TRANSPORT',specialty:'Officer transport',terrain:'Road network',environmentFit:{"city":72,"highway":70,"rural":58,"border":28,"industrial":78,"mountain":24,"coastal":52},speed:105,acceleration:32,capacity:12,durability:66,rangeKm:520,enduranceHours:10,cost:15000,maintenancePerDay:95,capabilities:{response:34,patrol:38,protection:42,crowdControl:54,surveillance:20,offRoad:20,command:30,counterSmuggling:20},specialFeatures:['12-seat officer transport cabin','Lockable equipment lockers','Rapid team-disembark layout'],strengths:'Moves a full support team in one dispatch',tradeoff:'Large turning radius and slower pursuit speed',role:'Officer transport and support deployment'},
    {level:5,id:'bastion-armored',iconId:'bastion',name:'Bastion Armored Patrol Vehicle',emoji:'🚘',className:'TIER V · ARMORED RESPONSE',specialty:'High-risk site protection',terrain:'City and industrial roads',environmentFit:{"city":58,"highway":56,"rural":64,"border":63,"industrial":95,"mountain":55,"coastal":68},speed:112,acceleration:36,capacity:6,durability:87,rangeKm:470,enduranceHours:9,cost:25000,maintenancePerDay:150,capabilities:{response:40,patrol:48,protection:86,crowdControl:50,surveillance:30,offRoad:36,command:26,counterSmuggling:34},specialFeatures:['Reinforced passenger cell','Protected glass package','High-durability run-flat wheels'],strengths:'Excellent protection for industrial guards and high-risk transfers',tradeoff:'Expensive upkeep with reduced speed and agility',role:'Protected transport in high-risk incidents'},
    {level:6,id:'interceptor-xr',iconId:'interceptor',name:'Interceptor XR Highway Unit',emoji:'🚨',className:'TIER VI · HIGH-SPEED INTERCEPTOR',specialty:'Highway interception',terrain:'Paved road and highway',environmentFit:{"city":52,"highway":100,"rural":26,"border":14,"industrial":35,"mountain":10,"coastal":30},speed:185,acceleration:94,capacity:2,durability:48,rangeKm:410,enduranceHours:7,cost:35000,maintenancePerDay:180,capabilities:{response:94,patrol:34,protection:25,crowdControl:8,surveillance:44,offRoad:6,command:12,counterSmuggling:52},specialFeatures:['Track-focused acceleration','Long-range vehicle ID camera','Rapid pursuit telemetry'],strengths:'Best-in-class road interception and response speed',tradeoff:'Only two seats, short duty endurance and poor rough-road handling',role:'High-speed vehicle interception'},
    {level:7,id:'terraguard-at',iconId:'terraguard',name:'TerraGuard All-Terrain SUV',emoji:'🚙',className:'TIER VII · TERRAIN CONTROL',specialty:'Perimeter and remote patrol',terrain:'Rural, hills and rough tracks',environmentFit:{"city":48,"highway":72,"rural":90,"border":98,"industrial":81,"mountain":95,"coastal":90},speed:138,acceleration:54,capacity:6,durability:78,rangeKm:610,enduranceHours:12,cost:45000,maintenancePerDay:230,capabilities:{response:58,patrol:72,protection:64,crowdControl:32,surveillance:50,offRoad:88,command:24,counterSmuggling:68},specialFeatures:['Heavy-duty off-road suspension','Thermal perimeter camera','Extended auxiliary fuel reserve'],strengths:'Strong border and remote industrial coverage',tradeoff:'High tyre and suspension maintenance on daily city routes',role:'Reinforced city and perimeter patrol'},
    {level:8,id:'beacon-command',iconId:'beacon',name:'Beacon Mobile Command Cruiser',emoji:'🚔',className:'TIER VIII · MOBILE COMMAND',specialty:'Field command and coordination',terrain:'City and highway',environmentFit:{"city":83,"highway":80,"rural":52,"border":38,"industrial":83,"mountain":34,"coastal":61},speed:142,acceleration:45,capacity:5,durability:70,rangeKm:660,enduranceHours:14,cost:60000,maintenancePerDay:300,capabilities:{response:58,patrol:45,protection:46,crowdControl:42,surveillance:74,offRoad:22,command:94,counterSmuggling:54},specialFeatures:['Deployable command console','Encrypted multi-channel radio','Live incident map and vehicle tracking'],strengths:'Raises coordination efficiency for nearby guard teams',tradeoff:'Costly electronics and only moderate physical protection',role:'Field command, dispatch and coordination'},
    {level:9,id:'civic-shield',iconId:'civicshield',name:'CivicShield Public-Order Carrier',emoji:'🚐',className:'TIER IX · PUBLIC-ORDER SUPPORT',specialty:'Crowd safety and riot response',terrain:'Urban roads and event zones',environmentFit:{"city":73,"highway":48,"rural":42,"border":22,"industrial":82,"mountain":18,"coastal":44},speed:92,acceleration:24,capacity:20,durability:96,rangeKm:450,enduranceHours:10,cost:85000,maintenancePerDay:380,capabilities:{response:32,patrol:42,protection:88,crowdControl:98,surveillance:28,offRoad:14,command:42,counterSmuggling:12},specialFeatures:['20-person protected transport capacity','Wide-area flood lighting','Non-lethal crowd-safety equipment bay'],strengths:'Highest public-order capacity and strong crew protection',tradeoff:'Slow, conspicuous and unsuitable for discreet surveillance',role:'Protected personnel deployment and civilian evacuation'},
    {level:10,id:'ironwall-hs',iconId:'ironwall',name:'Ironwall Heavy Security Truck',emoji:'🛻',className:'TIER X · HEAVY SECURITY',specialty:'Critical infrastructure guard',terrain:'Industrial yards and major roads',environmentFit:{"city":44,"highway":58,"rural":65,"border":68,"industrial":100,"mountain":60,"coastal":71},speed:108,acceleration:28,capacity:8,durability:100,rangeKm:630,enduranceHours:14,cost:110000,maintenancePerDay:470,capabilities:{response:36,patrol:56,protection:100,crowdControl:58,surveillance:35,offRoad:44,command:35,counterSmuggling:40},specialFeatures:['Heavy reinforced chassis','Deployable perimeter floodlights','Industrial-site barrier and tool storage'],strengths:'Best durability for long shifts guarding critical assets',tradeoff:'Highest fuel footprint among standard heavy vehicles',role:'High-durability critical-site security'},
    {level:11,id:'aegis-smart-ev',iconId:'aegis',name:'Aegis Smart Patrol EV',emoji:'🚓',className:'TIER XI · SMART PATROL',specialty:'Sensor-assisted patrol',terrain:'Connected urban road networks',environmentFit:{"city":100,"highway":89,"rural":52,"border":31,"industrial":69,"mountain":18,"coastal":55},speed:158,acceleration:72,capacity:4,durability:61,rangeKm:760,enduranceHours:18,cost:150000,maintenancePerDay:600,capabilities:{response:76,patrol:80,protection:40,crowdControl:24,surveillance:90,offRoad:15,command:65,counterSmuggling:72},specialFeatures:['AI-assisted camera triage','Low-noise electric drive','Predictive patrol route planner'],strengths:'Long duty endurance and strong digital detection',tradeoff:'Electronic sensor package is costly and needs specialist servicing',role:'Sensor-assisted dispatch and patrol coverage'},
    {level:12,id:'nexus-tactical',iconId:'nexus',name:'Nexus Tactical Network Unit',emoji:'🚔',className:'TIER XII · TACTICAL NETWORK',specialty:'Multi-team coordination',terrain:'City, highway and secured sites',environmentFit:{"city":85,"highway":83,"rural":67,"border":56,"industrial":91,"mountain":52,"coastal":72},speed:151,acceleration:63,capacity:6,durability:82,rangeKm:790,enduranceHours:16,cost:200000,maintenancePerDay:760,capabilities:{response:72,patrol:68,protection:72,crowdControl:60,surveillance:94,offRoad:42,command:88,counterSmuggling:86},specialFeatures:['Encrypted mesh communications','Multi-sensor observation mast','Automated evidence and incident hand-off'],strengths:'Strong intelligence sharing and cross-team incident coordination',tradeoff:'Large operating cost and depends on communications infrastructure',role:'Integrated mobile operations and field coordination'},
    {level:13,id:'viper-elite',iconId:'viper',name:'Viper Elite Response Coupe',emoji:'🏎️',className:'TIER XIII · ELITE RESPONSE',specialty:'Elite rapid-response escort',terrain:'Paved roads and highways',environmentFit:{"city":62,"highway":100,"rural":32,"border":15,"industrial":42,"mountain":8,"coastal":32},speed:178,acceleration:98,capacity:4,durability:75,rangeKm:700,enduranceHours:10,cost:280000,maintenancePerDay:950,capabilities:{response:99,patrol:42,protection:54,crowdControl:20,surveillance:76,offRoad:10,command:55,counterSmuggling:80},specialFeatures:['Track-grade acceleration control','High-speed secure escort package','Long-range plate and route recognition'],strengths:'Outstanding response and interception on paved routes',tradeoff:'Premium maintenance and very limited off-road utility',role:'Specialist rapid response and critical escort'},
    {level:14,id:'guardian-national',iconId:'guardian',name:'Guardian National Security SUV',emoji:'🚓',className:'TIER XIV · NATIONAL SECURITY',specialty:'National strategic-site protection',terrain:'Long-distance roads and mixed terrain',environmentFit:{"city":80,"highway":82,"rural":83,"border":88,"industrial":90,"mountain":84,"coastal":84},speed:168,acceleration:68,capacity:5,durability:94,rangeKm:930,enduranceHours:20,cost:400000,maintenancePerDay:1250,capabilities:{response:82,patrol:84,protection:92,crowdControl:64,surveillance:88,offRoad:70,command:82,counterSmuggling:86},specialFeatures:['Long-range secure communications','Multi-zone perimeter sensor suite','Redundant power and navigation systems'],strengths:'Balanced long-range protection, patrol and surveillance',tradeoff:'Very high capital cost and specialist upkeep',role:'Long-range national security command support'},
    {level:15,id:'sovereign-mkxv',iconId:'sovereign',name:'Sovereign Guardian MK-XV',emoji:'🏆',className:'TIER XV · FLAGSHIP',specialty:'National multi-role protection',terrain:'All approved road and mixed-terrain routes',environmentFit:{"city":88,"highway":92,"rural":90,"border":90,"industrial":97,"mountain":92,"coastal":92},speed:200,acceleration:100,capacity:6,durability:120,rangeKm:1120,enduranceHours:24,cost:750000,maintenancePerDay:1800,capabilities:{response:100,patrol:96,protection:100,crowdControl:94,surveillance:100,offRoad:88,command:100,counterSmuggling:96},specialFeatures:['Integrated national command suite','AI sensor fusion and redundant uplinks','Flagship armor and 24-hour mission endurance'],strengths:'Highest combined response, surveillance, protection and command ratings',tradeoff:'Extreme purchase and maintenance costs; inefficient for routine low-risk patrol',role:'Flagship multi-system protection and rapid command response'}
  ]);

  const OPERATING_ENVIRONMENTS = Object.freeze([
    {id:'city',name:'Dense City',emoji:'🏙️',description:'Traffic, tight turns, narrow lanes and frequent stops',roadConditions:['smooth','congested','wet'],roadDefault:'congested'},
    {id:'highway',name:'Highway',emoji:'🛣️',description:'High-speed paved response routes and longer distances',roadConditions:['smooth','wet'],roadDefault:'smooth'},
    {id:'rural',name:'Rural Roads',emoji:'🌾',description:'Mixed paved and secondary roads with sparse support',roadConditions:['smooth','wet','rough'],roadDefault:'rough'},
    {id:'border',name:'Remote Border',emoji:'🛂',description:'Long patrol corridors, few services and uneven terrain',roadConditions:['smooth','rough','muddy','wet'],roadDefault:'rough'},
    {id:'industrial',name:'Industrial Zone',emoji:'🏭',description:'Heavy traffic, debris, loading yards and critical facilities',roadConditions:['smooth','congested','rough','wet'],roadDefault:'rough'},
    {id:'mountain',name:'Mountain / Hills',emoji:'⛰️',description:'Steep grades, tight bends and traction-sensitive routes',roadConditions:['smooth','rough','wet','muddy'],roadDefault:'rough'},
    {id:'coastal',name:'Coastal / Wetland',emoji:'🌊',description:'Salt air, standing water and soft or flooded shoulders',roadConditions:['smooth','wet','muddy','rough'],roadDefault:'wet'}
  ]);
  const ROAD_CONDITIONS = Object.freeze([
    {id:'smooth',name:'Clear / smooth',fitMultiplier:1,wearPerDay:0,damageRisk:1},
    {id:'congested',name:'Congested traffic',fitMultiplier:0.78,wearPerDay:0.16,damageRisk:1.45},
    {id:'wet',name:'Wet / rain',fitMultiplier:0.82,wearPerDay:0.12,damageRisk:1.35},
    {id:'rough',name:'Rough / broken road',fitMultiplier:0.72,wearPerDay:0.26,damageRisk:1.75},
    {id:'muddy',name:'Mud / soft ground',fitMultiplier:0.62,wearPerDay:0.38,damageRisk:2.1}
  ]);

  const GUARD_MISSIONS = Object.freeze([
    {id:'urban_patrol',name:'Urban Patrol',emoji:'🌆',description:'Routine public-space patrol and rapid local response',weights:{patrol:0.34,response:0.26,surveillance:0.18,command:0.08,protection:0.08,offRoad:0.03,crowdControl:0.03},coverageTypes:['CIVIL_UNREST','SMUGGLING_NETWORK']},
    {id:'industrial_guard',name:'Industrial / Factory Guard',emoji:'🏭',description:'Protect factories, power sites and strategic industrial assets',weights:{protection:0.34,surveillance:0.20,patrol:0.15,command:0.10,response:0.10,counterSmuggling:0.08,crowdControl:0.03},coverageTypes:['INDUSTRIAL_SABOTAGE']},
    {id:'border_interdiction',name:'Border Interdiction',emoji:'🛂',description:'Detect smuggling and patrol remote border corridors',weights:{counterSmuggling:0.30,offRoad:0.22,surveillance:0.20,response:0.18,patrol:0.06,protection:0.04},coverageTypes:['SMUGGLING_NETWORK','INDUSTRIAL_SABOTAGE']},
    {id:'public_order',name:'Public-Order Support',emoji:'🛡️',description:'Crowd safety, de-escalation and critical-event readiness',weights:{crowdControl:0.38,protection:0.24,command:0.12,patrol:0.12,response:0.10,surveillance:0.04},coverageTypes:['CIVIL_UNREST']},
    {id:'rapid_response',name:'Rapid Response',emoji:'⚡',description:'Fast interception and emergency response across the country',weights:{response:0.42,surveillance:0.18,patrol:0.18,command:0.08,protection:0.08,counterSmuggling:0.04},coverageTypes:['CIVIL_UNREST','SMUGGLING_NETWORK','INDUSTRIAL_SABOTAGE']},
    {id:'vip_escort',name:'Critical Convoy / VIP Escort',emoji:'🚨',description:'Escort protected convoys and high-priority officials',weights:{response:0.28,protection:0.28,command:0.18,surveillance:0.16,patrol:0.06,counterSmuggling:0.04},coverageTypes:['SMUGGLING_NETWORK','INDUSTRIAL_SABOTAGE']}
  ]);

  const FACILITIES = Object.freeze([
    {id:'station',name:'Police Station',emoji:'🏛️',baseCost:15000,effect:'Local response coverage and officer availability'},
    {id:'patrol',name:'Police Patrol Grid',emoji:'🚓',baseCost:22000,effect:'Patrol coverage and incident response speed'},
    {id:'academy',name:'Police Academy',emoji:'🎓',baseCost:30000,effect:'Raises the ceiling for training quality'},
    {id:'department',name:'Police Department HQ',emoji:'🎛️',baseCost:40000,effect:'Coordination, planning and command efficiency'},
    {id:'dispatch',name:'Emergency Dispatch Centre',emoji:'📡',baseCost:52000,effect:'Faster dispatch and emergency coordination'},
    {id:'forensics',name:'Forensic Investigation Lab',emoji:'🔬',baseCost:68000,effect:'Evidence quality and case resolution'},
    {id:'border',name:'Border Security Checkpoint',emoji:'🛂',baseCost:82000,effect:'Smuggling detection and cross-border monitoring'},
    {id:'cyber',name:'Cyber Crime Unit',emoji:'💻',baseCost:105000,effect:'Digital threat analysis and intelligence support'},
    {id:'emergency',name:'Emergency Response Unit',emoji:'🚨',baseCost:125000,effect:'Crisis response and civilian protection'},
    {id:'communications',name:'Secure Communications Hub',emoji:'🛰️',baseCost:150000,effect:'Secure information exchange and field coordination'}
  ]);

  const TACTICS = Object.freeze([
    {id:'antiRiot',name:'Civil Stability & De-escalation Doctrine',emoji:'🛡️',cost:45000,durationDays:30,effect:'Reduces escalation risk and improves public-order response',efficiency:5,riskReduction:5},
    {id:'smugglerInterdict',name:'Cross-Border Contraband Interdiction Grid',emoji:'🛂',cost:65000,durationDays:45,effect:'Improves smuggling detection and border intelligence',efficiency:6,riskReduction:4},
    {id:'counterTerror',name:'Critical Infrastructure Threat Assessment',emoji:'🔰',cost:95000,durationDays:60,effect:'Improves early warning for coordinated infrastructure threats',efficiency:8,riskReduction:7},
    {id:'assetProtection',name:'Industrial & Civilian Asset Protection Protocol',emoji:'🏭',cost:115000,durationDays:75,effect:'Improves protection planning for recorded industrial and civilian assets',efficiency:7,riskReduction:8},
    {id:'intelligenceFusion',name:'National Intelligence Fusion Network',emoji:'🛰️',cost:145000,durationDays:90,effect:'Improves cross-agency event detection and intelligence hand-off',efficiency:10,riskReduction:10}
  ]);

  const HOME_BUDGET_DEFAULT_PLAN = Object.freeze({
    personnel:{mode:'percent',value:45},vehicles:{mode:'percent',value:20},
    maintenance:{mode:'percent',value:15},facilities:{mode:'percent',value:8},
    training:{mode:'percent',value:5},operations:{mode:'percent',value:7}
  });
  const HOME_BUDGET_CATEGORIES = Object.freeze({
    personnel:{label:'Personnel & salaries',financeType:'salary',actions:['POLICE_RECRUITMENT','AGENT_RECRUITMENT','POLICE_PAYROLL']},
    vehicles:{label:'Vehicle procurement',financeType:'purchase',actions:['VEHICLE_ORDER']},
    maintenance:{label:'Repair & maintenance',financeType:'maintenance',actions:['POLICE_VEHICLE_REPAIR','POLICE_FLEET_MAINTENANCE']},
    facilities:{label:'Facilities',financeType:'investment',actions:['FACILITY_BUILD']},
    training:{label:'Training & research',financeType:'investment',actions:['TRAINING_UPGRADE','POLICE_TACTIC_RESEARCH']},
    operations:{label:'Operations & other costs',financeType:'general',actions:['HOME_MINISTRY_DAILY_OPERATIONS']}
  });
  const DEFAULT_POLICE_PATROL_PLAN=Object.freeze({urban:32,rural:12,highway:10,border:10,drugs:10,investigations:8,cyber:4,community:14});
  const DEFAULT_POLICE_DEPARTMENT_PLAN=Object.freeze({
    generalPatrol:28,traffic:10,investigations:14,homicide:5,cybercrime:5,
    narcotics:8,border:8,community:10,forensics:4,rapidResponse:8
  });
  const DEFAULT_POLICE_RULEBOOK=Object.freeze({
    missingPersonActionHours:6,highRiskResponseMinutes:30,arrestResponseHours:6,
    arrestReviewHours:6,maximumDetentionHours:48,warrantDecisionHours:24,
    evidenceSubmissionHours:12,forceReviewHours:48,bodyCameraMandatory:true,
    searchWarrantRequired:true,trainingDaysBeforeDeployment:30,minimumPatrolCoveragePct:40
  });
  const POLICE_RULEBOOK_RANGES=Object.freeze({
    missingPersonActionHours:[0,24],highRiskResponseMinutes:[0,240],arrestResponseHours:[0.5,72],
    arrestReviewHours:[1,48],maximumDetentionHours:[1,168],warrantDecisionHours:[1,72],
    evidenceSubmissionHours:[1,72],forceReviewHours:[1,168],
    trainingDaysBeforeDeployment:[0,180],minimumPatrolCoveragePct:[0,100]
  });
  function normalizePoliceRulebook(raw){
    const defaults=DEFAULT_POLICE_RULEBOOK,src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},out={};
    Object.keys(POLICE_RULEBOOK_RANGES).forEach(function(key){
      const value=num(src[key]),range=POLICE_RULEBOOK_RANGES[key];
      out[key]=Math.round(clamp(value===null?defaults[key]:value,range[0],range[1])*10)/10;
    });
    out.bodyCameraMandatory=src.bodyCameraMandatory===undefined?defaults.bodyCameraMandatory:src.bodyCameraMandatory!==false;
    out.searchWarrantRequired=src.searchWarrantRequired===undefined?defaults.searchWarrantRequired:src.searchWarrantRequired!==false;
    return out;
  }
  function validatePoliceRulebook(input,base){
    if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,code:'POLICE_RULEBOOK_INPUT_INVALID',errors:['Submit a rulebook object.']};
    const keys=Object.keys(POLICE_RULEBOOK_RANGES).concat(['bodyCameraMandatory','searchWarrantRequired']);
    const unknown=Object.keys(input).filter(function(key){return keys.indexOf(key)<0;});
    if(unknown.length)return{ok:false,code:'POLICE_RULEBOOK_UNKNOWN_FIELDS',errors:unknown.map(function(key){return'Unknown rulebook field: '+key;})};
    const source=Object.assign({},DEFAULT_POLICE_RULEBOOK,base||{},input),out={},errors=[];
    Object.keys(POLICE_RULEBOOK_RANGES).forEach(function(key){
      const raw=source[key],value=num(raw),range=POLICE_RULEBOOK_RANGES[key];
      if(raw===''||value===null||value<range[0]||value>range[1]){
        errors.push(key+' must be a number between '+range[0]+' and '+range[1]+'.');
      }else out[key]=Math.round(value*10)/10;
    });
    ['bodyCameraMandatory','searchWarrantRequired'].forEach(function(key){
      if(typeof source[key]!=='boolean')errors.push(key+' must be true or false.');
      else out[key]=source[key];
    });
    return errors.length?{ok:false,code:'POLICE_RULEBOOK_VALIDATION_FAILED',errors:errors}:{ok:true,rulebook:out};
  }
  function policeRulebookQuality(raw){
    const r=normalizePoliceRulebook(raw),inverse=function(value,max){return clamp(100-(value/max)*100,0,100);};
    const patrolFit=clamp(100-Math.abs(r.minimumPatrolCoveragePct-40)*1.5,0,100);
    return Math.round((
      inverse(r.missingPersonActionHours,24)*0.08+
      inverse(r.highRiskResponseMinutes,240)*0.10+
      inverse(r.arrestResponseHours,72)*0.10+
      inverse(r.arrestReviewHours,48)*0.08+
      inverse(r.maximumDetentionHours,168)*0.10+
      inverse(r.warrantDecisionHours,72)*0.07+
      inverse(r.evidenceSubmissionHours,72)*0.08+
      inverse(r.forceReviewHours,168)*0.07+
      (r.bodyCameraMandatory?100:35)*0.08+
      (r.searchWarrantRequired?100:45)*0.06+
      clamp(r.trainingDaysBeforeDeployment/90*100,0,100)*0.10+
      patrolFit*0.08
    )*10)/10;
  }
  function policeRulebookOperationalIndex(raw){
    const r=normalizePoliceRulebook(raw),d=DEFAULT_POLICE_RULEBOOK;
    const ratio=function(reference,current,min){return clamp(reference/Math.max(min,current),0.25,4);};
    const training=clamp(Math.max(0,r.trainingDaysBeforeDeployment)/Math.max(1,d.trainingDaysBeforeDeployment),0.25,4);
    const patrol=clamp(Math.max(0,r.minimumPatrolCoveragePct)/Math.max(1,d.minimumPatrolCoveragePct),0.25,4);
    return Math.round(clamp(
      ratio(d.missingPersonActionHours,r.missingPersonActionHours,0.5)*0.08+
      ratio(d.highRiskResponseMinutes,r.highRiskResponseMinutes,5)*0.10+
      ratio(d.arrestResponseHours,r.arrestResponseHours,0.5)*0.15+
      ratio(d.arrestReviewHours,r.arrestReviewHours,1)*0.09+
      ratio(d.maximumDetentionHours,r.maximumDetentionHours,1)*0.08+
      ratio(d.warrantDecisionHours,r.warrantDecisionHours,1)*0.08+
      ratio(d.evidenceSubmissionHours,r.evidenceSubmissionHours,1)*0.07+
      ratio(d.forceReviewHours,r.forceReviewHours,1)*0.08+
      (r.bodyCameraMandatory?1:0.65)*0.07+
      (r.searchWarrantRequired?1:0.75)*0.05+
      training*0.07+patrol*0.08,0.2,4)*100)/100;
  }
  function normalizePoliceDepartmentPlan(raw){
    const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},out={};
    Object.keys(DEFAULT_POLICE_DEPARTMENT_PLAN).forEach(function(key){
      const value=num(src[key]);
      out[key]=Math.round(clamp(value===null?DEFAULT_POLICE_DEPARTMENT_PLAN[key]:value,0,100)*10)/10;
    });
    return out;
  }
  function validatePoliceDepartmentPlan(input,base){
    if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,code:'POLICE_DEPARTMENT_PLAN_INVALID',errors:['Submit a department allocation object.']};
    const keys=Object.keys(DEFAULT_POLICE_DEPARTMENT_PLAN),unknown=Object.keys(input).filter(function(key){return keys.indexOf(key)<0;});
    if(unknown.length)return{ok:false,code:'POLICE_DEPARTMENT_UNKNOWN_FIELDS',errors:unknown.map(function(key){return'Unknown police unit: '+key;})};
    const src=Object.assign({},DEFAULT_POLICE_DEPARTMENT_PLAN,base||{},input),out={},errors=[];
    keys.forEach(function(key){
      const raw=src[key],value=num(raw);
      if(raw===''||value===null||value<0||value>100)errors.push(key+' must be between 0 and 100%.');
      else out[key]=Math.round(value*10)/10;
    });
    const total=Object.values(out).reduce(function(sum,value){return sum+value;},0);
    if(errors.length===0&&Math.abs(total-100)>0.11)errors.push('Police department shares must total exactly 100%; current total is '+total.toFixed(1)+'%.');
    return errors.length?{ok:false,code:'POLICE_DEPARTMENT_PLAN_VALIDATION_FAILED',errors:errors,totalPct:total}:{ok:true,plan:out,totalPct:total};
  }
  function policeDepartmentHeadcounts(state){
    const plan=normalizePoliceDepartmentPlan(state&&state.policeDepartments),total=Math.max(0,Math.floor(num(state&&state.policeCount)||0)),keys=Object.keys(DEFAULT_POLICE_DEPARTMENT_PLAN),rows=[];
    let allocated=0;
    keys.forEach(function(key){const exact=total*plan[key]/100,whole=Math.floor(exact);rows.push({key:key,headcount:whole,fraction:exact-whole,pct:plan[key]});allocated+=whole;});
    rows.slice().sort(function(a,b){return b.fraction-a.fraction||a.key.localeCompare(b.key);}).slice(0,total-allocated).forEach(function(extra){
      const target=rows.find(function(row){return row.key===extra.key;});if(target)target.headcount++;
    });
    const out={};rows.forEach(function(row){out[row.key]={pct:row.pct,headcount:row.headcount};});return out;
  }
  function activePolicePolicyRules(state){
    return POLICE_POLICY_RULES.filter(function(rule){return !!(state&&state.policeRules&&state.policeRules[rule.id]);});
  }
  function activePolicyDailyCost(state){
    return activePolicePolicyRules(state).reduce(function(sum,rule){return sum+Math.max(0,num(rule.dailyCostUsd)||0);},0);
  }
  function policeRulebookDailyCost(state){
    const current=state||{},payroll=dailyPayroll(current),headcount=Math.max(0,num(current.policeCount)||0);
    const fixed=125*Math.sqrt(Math.max(1,headcount/1000));
    return Math.round((payroll*0.006*policeRulebookOperationalIndex(current.policeRulebook)+fixed)*100)/100;
  }
  function ruleDailyCost(state){
    return activePolicyDailyCost(state)+policeRulebookDailyCost(state);
  }
  const POLICE_POLICY_RULES=Object.freeze([
    {id:'community_policing',name:'Community policing & local liaison',department:'operations',setupCostUsd:125000,dailyCostUsd:250,description:'Builds neighborhood reporting and non-escalation capacity.',crimeEffects:{theft:.04,robbery:.02,streetRobbery:.06,assault:.08,homicide:.01},trustDelta:5,misconductMultiplier:1,clearanceDelta:1,justiceDelta:2,privacyDelta:0,vehicleWearPct:0},
    {id:'body_camera_audit',name:'Body cameras & independent audit',department:'operations',setupCostUsd:180000,dailyCostUsd:180,description:'Improves evidence quality and lowers abuse-of-power risk.',crimeEffects:{},trustDelta:6,misconductMultiplier:.62,clearanceDelta:3,justiceDelta:2,privacyDelta:-2,vehicleWearPct:0},
    {id:'data_led_patrols',name:'Data-led patrol scheduling',department:'operations',setupCostUsd:160000,dailyCostUsd:450,description:'Concentrates patrols where recorded incidents cluster; increases privacy risk unless audited.',crimeEffects:{theft:.05,robbery:.05,streetRobbery:.06,drugTrafficking:.03,cybercrime:.02},trustDelta:1,misconductMultiplier:1.05,clearanceDelta:2,justiceDelta:1,privacyDelta:5,vehicleWearPct:2},
    {id:'drug_task_force',name:'Drug trafficking investigation unit',department:'operations',setupCostUsd:250000,dailyCostUsd:350,description:'Improves evidence-led drug-market investigations and targeted seizure work.',crimeEffects:{drugTrafficking:.14,contrabandSmuggling:.05,robbery:.01},trustDelta:0,misconductMultiplier:1,clearanceDelta:3,justiceDelta:1,privacyDelta:1,vehicleWearPct:2},
    {id:'border_interdiction',name:'Border & customs coordination',department:'operations',setupCostUsd:200000,dailyCostUsd:300,description:'Coordinates police, customs and port reporting to reduce contraband leakage.',crimeEffects:{contrabandSmuggling:.16,drugTrafficking:.06},trustDelta:0,misconductMultiplier:1,clearanceDelta:2,justiceDelta:1,privacyDelta:0,vehicleWearPct:2},
    {id:'rapid_case_processing',name:'Rapid case processing & victim support',department:'facilities',setupCostUsd:250000,dailyCostUsd:250,description:'Reduces case queues and repeat-offending pressure; requires functioning investigators and court coordination.',crimeEffects:{theft:.03,robbery:.04,assault:.06,homicide:.08},trustDelta:3,misconductMultiplier:.95,clearanceDelta:8,justiceDelta:12,privacyDelta:-1,vehicleWearPct:0},
    {id:'independent_oversight',name:'Independent police complaints office',department:'operations',setupCostUsd:125000,dailyCostUsd:180,description:'Creates an accountable route for complaints and disciplinary review.',crimeEffects:{},trustDelta:7,misconductMultiplier:.65,clearanceDelta:1,justiceDelta:3,privacyDelta:-2,vehicleWearPct:0},
    {id:'professional_training',name:'Professional standards & scenario training',department:'training',setupCostUsd:300000,dailyCostUsd:400,description:'Improves officer skill, lawful de-escalation and case quality over time.',crimeEffects:{theft:.02,robbery:.02,streetRobbery:.02,assault:.04,drugTrafficking:.02,contrabandSmuggling:.02,cybercrime:.03,homicide:.03},trustDelta:2,misconductMultiplier:.82,clearanceDelta:5,justiceDelta:4,privacyDelta:-1,vehicleWearPct:0},
    {id:'high_visibility_patrols',name:'High-visibility patrol rotations',department:'operations',setupCostUsd:125000,dailyCostUsd:700,description:'Raises visible patrol presence against street robbery and theft, with additional fuel and vehicle wear.',crimeEffects:{theft:.06,robbery:.07,streetRobbery:.08},trustDelta:2,misconductMultiplier:1,clearanceDelta:1,justiceDelta:0,privacyDelta:0,vehicleWearPct:15},
    {id:'cybercrime_unit',name:'Cybercrime & digital evidence unit',department:'training',setupCostUsd:325000,dailyCostUsd:500,description:'Improves digital-evidence handling, online fraud investigation and cyber case throughput.',crimeEffects:{cybercrime:.18,drugTrafficking:.01},trustDelta:1,misconductMultiplier:.92,clearanceDelta:5,justiceDelta:4,privacyDelta:2,vehicleWearPct:0}
  ]);
  const DEFAULT_POLICE_POLICY_STATE=Object.freeze(Object.fromEntries(POLICE_POLICY_RULES.map(function(row){return[row.id,false];})));
  const DEFAULT_STATE = Object.freeze({
    schemaVersion:1, policeCount:250, policeEfficiency:60, policeTrust:55,
    unlockedVehicleLevel:1, vehiclesOwned:{}, pendingVehicleOrder:null, fuelSupplyDays:14, lastFuelSupplyPurchaseTurn:null,
    homeBudgetPlan:HOME_BUDGET_DEFAULT_PLAN,
    baselineVersion:0,baselinePolicePersonnel:null,baselineFleetUnits:null,baselineFleetReplacementValueUsd:0,baselineSource:null,
    dailySalaryPerOfficerUsd:null,recruitmentFeePerOfficerUsd:null,crimeBaseline:null,crimeModel:null,crimeHistory:[],crimeAccumulator:{},lastCrimeSimulationDay:null,
    policeRules:DEFAULT_POLICE_POLICY_STATE,policeRulebook:DEFAULT_POLICE_RULEBOOK,policeDepartments:DEFAULT_POLICE_DEPARTMENT_PLAN,patrolPlan:DEFAULT_POLICE_PATROL_PLAN,publicSatisfaction:55,misconductRiskPct:20,justiceBacklog:0,privacyRiskPct:20,
    facilityLevels:{station:1,patrol:1,academy:1,department:1,dispatch:0,forensics:0,border:0,cyber:0,emergency:0,communications:0},
    trainingQualityLevel:1, policeRecruitmentLevel:1, recruitmentBaseFeePerOfficerUsd:null,
    pendingCapabilityProjects:[], completedCapabilityProjects:[],
    tacticsResearched:{antiRiot:false,smugglerInterdict:false,counterTerror:false,assetProtection:false,intelligenceFusion:false},
    pendingResearch:null, specialAgents:0, sabotageRisk:45, unpaidPayroll:0,
    lastPayrollDay:null, lastIncidentWeek:null, incidentSequence:0, incidentLedger:[], lastUpdatedTurn:0, agentDeployments:{}, intelligenceReports:[], lastIntelWeek:null,
    policeCases:[],nextPoliceCaseSequence:1,
    guardDeployments:[], nextGuardDeploymentId:1, vehicleFleet:[], nextVehicleUnitId:1, vehicleMaintenanceLog:[], lastFleetSimulationDay:null
  });

  function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);const o={};Object.keys(v).forEach(k=>{if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k]);});return o;}
  function num(v){const n=Number(v);return v!==null&&v!==''&&Number.isFinite(n)?n:null;}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function normalizeCountry(value){
    let raw=String(value||'').trim();if(!raw)return '';
    try{const r=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega&&g.Omega.CanonicalIdentity;const hit=r&&typeof r.resolveCountry==='function'?r.resolveCountry(raw):null;if(hit&&hit.id)raw=String(hit.id);}catch(_){}
    const normalized=raw.toUpperCase().replace(/[-\s]+/g,'_');
    try {
      const baseline=countryPoliceBaselineByCode&&countryPoliceBaselineByCode[normalized];
      if(baseline&&baseline.code)return String(baseline.code).trim().toUpperCase().replace(/[-\s]+/g,'_');
    } catch (_) {}
    return normalized;
  }
  function currentCountry(candidate){
    const sim=g.Omega&&g.Omega.Simulation;
    const raw=candidate||g.OmegaMinistryViewCountry||
      (sim&&typeof sim.getPlayerCountryId==='function'&&sim.getPlayerCountryId())||
      (g.CountryIOS&&g.CountryIOS.activeCountry)||g.currentActiveCountry||
      (g.Game&&(g.Game.selectedCountryId||g.Game.activeCountry||g.Game.currentActiveCountry||g.Game.playerCountry||g.Game.countryId))||
      g.playerCountry||'USA';
    return normalizeCountry(raw);
  }
  function playerCountry(){
    const sim=g.Omega&&g.Omega.Simulation,root=rootState();
    let raw=null;
    try{if(sim&&typeof sim.getPlayerCountryId==='function')raw=sim.getPlayerCountryId();}catch(_){}
    raw=raw||root&&root.simulation&&root.simulation.session&&root.simulation.session.playerCountryId||
      root&&root.simulation&&root.simulation.playerCountryId||root&&root.playerCountryId||root&&root.playerCountryCode||
      g.Game&&(g.Game.playerCountryId||g.Game.playerCountryCode||g.Game.playerCountry)||
      g.playerCountry||g.OMEGA_PLAYER_COUNTRY_ID||g.Game&&(g.Game.countryId||g.Game.currentActiveCountry)||
      g.CountryIOS&&g.CountryIOS.activeCountry||g.currentActiveCountry||'USA';
    return normalizeCountry(raw);
  }
  function rootState(){return g.Game&&g.Game.state&&typeof g.Game.state==='object'?g.Game.state:(g.gameState&&typeof g.gameState==='object'?g.gameState:null);}
  function turn(){
    const sim=g.Omega&&g.Omega.Simulation, root=rootState();
    const candidates=[sim&&sim.clock&&sim.clock.turn,root&&root.simulation&&root.simulation.turn,root&&root.turn];
    for(const v of candidates){const n=num(v);if(n!==null&&n>=0)return Math.floor(n);}return 0;
  }
  function simulationTimeMs(){
    const sim=g.Omega&&g.Omega.Simulation, root=rootState();
    const candidates=[sim&&sim.clock&&sim.clock.simulationTimeMs,sim&&sim.clock&&sim.clock.snapshot&&sim.clock.snapshot().simulationTimeMs,root&&root.simulation&&root.simulation.simulationTimeMs,root&&root.simulationTimeMs];
    for(const v of candidates){const n=num(v);if(n!==null&&n>=0)return n;}
    const step=num(sim&&sim.clock&&sim.clock.stepDurationMs)||3600000;return turn()*step;
  }
  function interop(){return g.Omega&&g.Omega.MinistryInteroperability||g.OmegaMinistryInteroperability||null;}
  function treasuryRecords(country){
    const roots=[g.Game&&g.Game.state,g.gameState].filter(Boolean),finance=[];
    roots.forEach(root=>{const row=root&&root.finance&&root.finance[country];if(row&&typeof row==='object'&&num(row.available)!==null&&!finance.some(x=>x.row===row))finance.push({row:row,key:'available',source:'FINANCE_AVAILABLE'});});
    if(finance.length)return finance;
    const economy=[];
    roots.forEach(root=>{const row=root&&root.economy&&root.economy[country];if(row&&typeof row==='object'&&num(row.treasury)!==null&&!economy.some(x=>x.row===row))economy.push({row:row,key:'treasury',source:'ECONOMY_TREASURY'});});
    return economy;
  }
  function getTreasury(country){
    const records=treasuryRecords(normalizeCountry(country||currentCountry()));
    return records.length?{available:true,balance:num(records[0].row[records[0].key]),source:records[0].source,reason:null}:{available:false,balance:null,source:null,reason:'TREASURY_DATA_UNAVAILABLE'};
  }
  function normalizeHomeBudgetPlan(raw){
    const out={};
    Object.keys(HOME_BUDGET_CATEGORIES).forEach(function(id){
      const row=raw&&raw[id]&&typeof raw[id]==='object'?raw[id]:HOME_BUDGET_DEFAULT_PLAN[id];
      const mode=row&&row.mode==='amount'?'amount':'percent';
      let value=num(row&&row.value);
      if(value===null)value=HOME_BUDGET_DEFAULT_PLAN[id].value;
      value=Math.max(0,Math.min(mode==='percent'?100:1e15,value));
      out[id]={mode:mode,value:value};
    });
    return out;
  }
  function normalizePatrolPlan(raw){
    const out={};
    Object.keys(DEFAULT_POLICE_PATROL_PLAN).forEach(function(key){
      const value=num(raw&&raw[key]);
      out[key]=Math.round(clamp(value===null?DEFAULT_POLICE_PATROL_PLAN[key]:value,0,100)*10)/10;
    });
    return out;
  }
  let countryPoliceBaselineByCode=Object.create(null),countryPoliceBaselineRows=[];
  function baselineAliases(row){
    return [row&&row.code,row&&row.iso2,row&&row.iso3,row&&row.name].filter(Boolean).map(function(value){
      return String(value).trim().toUpperCase().replace(/[-\s]+/g,'_');
    });
  }
  function findPoliceBaseline(country){
    const raw=String(country||'').trim().toUpperCase().replace(/[-\s]+/g,'_');
    const canonical=normalizeCountry(country);
    return countryPoliceBaselineByCode[raw]||countryPoliceBaselineByCode[canonical]||null;
  }
  function validateCountryPoliceBaselineRows(rows){
    const errors=[],codes=new Set(),aliases=new Map(),tiers=new Set(VEHICLES.map(function(v){return String(v.level);}));
    if(!Array.isArray(rows)||rows.length===0)return{ok:false,code:'POLICE_BASELINE_ROWS_INVALID',errors:['Country baseline must be a non-empty array.'],countryCount:0};
    rows.forEach(function(row,index){
      const label='row['+index+']'+(row&&row.name?' '+row.name:'');
      if(!row||typeof row!=='object'||Array.isArray(row)){errors.push(label+': record must be an object.');return;}
      if(typeof row.code!=='string'||!row.code.trim())errors.push(label+': missing country code.');
      if(typeof row.name!=='string'||!row.name.trim())errors.push(label+': missing country name.');
      const code=String(row.code||'').trim().toUpperCase();
      if(code){
        if(codes.has(code))errors.push(label+': duplicate country code '+code+'.');
        codes.add(code);
      }
      baselineAliases(row).forEach(function(alias){
        const previous=aliases.get(alias);
        if(previous&&previous!==code)errors.push(label+': alias '+alias+' is already assigned to '+previous+'.');
        else aliases.set(alias,code);
      });
      const police=num(row.baselinePolice&&row.baselinePolice.activePersonnel);
      if(police===null||police<1||Math.floor(police)!==police)errors.push(label+': active police baseline must be a positive integer.');
      const staffing=num(row.baselinePolice&&row.baselinePolice.staffingRatePer100k);
      if(staffing===null||staffing<0||staffing>100000)errors.push(label+': staffingRatePer100k must be a finite non-negative rate.');
      const fleet=row.baselineFleet,total=num(fleet&&fleet.totalUnits),tierCounts=fleet&&fleet.countsByTier;
      if(!fleet||total===null||total<0||Math.floor(total)!==total)errors.push(label+': fleet total must be a finite non-negative integer.');
      if(!tierCounts||typeof tierCounts!=='object'||Array.isArray(tierCounts)){errors.push(label+': countsByTier must be an object.');}
      else{
        let sum=0;
        Object.keys(tierCounts).forEach(function(tier){
          const n=num(tierCounts[tier]);
          if(!tiers.has(String(tier)))errors.push(label+': unknown vehicle tier '+tier+'.');
          if(n===null||n<0||Math.floor(n)!==n)errors.push(label+': vehicle tier '+tier+' must be a non-negative integer.');
          else sum+=n;
        });
        tiers.forEach(function(tier){if(!Object.prototype.hasOwnProperty.call(tierCounts,tier))errors.push(label+': missing vehicle tier '+tier+'.');});
        if(total!==null&&sum!==total)errors.push(label+': vehicle tier sum '+sum+' does not equal fleet total '+total+'.');
      }
      const pop=row.population&&row.population.value;
      if(pop!==null&&pop!==undefined&&pop!==''){
        const n=num(pop);if(n===null||n<=0)errors.push(label+': present population value must be finite and greater than zero.');
      }
      const crime=row.crime,rates=crime&&crime.ratesPer100k;
      if(!rates||typeof rates!=='object'||Array.isArray(rates))errors.push(label+': crime ratesPer100k must be an object.');
      else{
        ['theft','robbery','streetRobbery','drugTrafficking','contrabandSmuggling','assault','homicide','cybercrime'].forEach(function(category){
          const n=num(rates[category]);
          if(n===null||n<0)errors.push(label+': crime rate '+category+' must be a finite non-negative number.');
        });
      }
      const profile=row.fleetProfile,weights=profile&&profile.environmentMixPct;
      if(!profile||typeof profile!=='object'||!weights||typeof weights!=='object'||Array.isArray(weights)){
        errors.push(label+': country vehicle operating profile is missing.');
      }else{
        const envKeys=['city','highway','rural','border','industrial','coastal','mountain'];
        let mixTotal=0;
        envKeys.forEach(function(key){
          const value=num(weights[key]);
          if(value===null||value<0||value>100)errors.push(label+': environment weight '+key+' must be between 0 and 100.');
          else mixTotal+=value;
        });
        if(Math.abs(mixTotal-100)>0.11)errors.push(label+': environment weights must total 100%; got '+mixTotal.toFixed(1)+'%.');
        ['roadQualityIndex','mountainTerrainIndex','coastalLogisticsIndex','industrialComplexityIndex','remoteCoverageIndex','urbanComplexityIndex'].forEach(function(key){
          const n=num(profile[key]);if(n===null||n<0||n>100)errors.push(label+': '+key+' must be between 0 and 100.');
        });
      }
      const homicide=crime&&crime.observedHomicide&&crime.observedHomicide.ratePer100k;
      if(homicide!==null&&homicide!==undefined&&homicide!==''){
        const n=num(homicide);if(n===null||n<0)errors.push(label+': observed homicide rate must be non-negative when provided.');
      }
    });
    return errors.length?{ok:false,code:'POLICE_BASELINE_VALIDATION_FAILED',errors:errors.slice(0,80),errorCount:errors.length,countryCount:codes.size}:
      {ok:true,countryCount:codes.size,errors:[]};
  }
  function loadCountryPoliceBaselines(rows){
    const validation=validateCountryPoliceBaselineRows(rows);
    if(!validation.ok)return validation;
    const next=Object.create(null),nextAliasOwners=new Map();
    rows.forEach(function(row){
      baselineAliases(row).forEach(function(alias){
        const previous=nextAliasOwners.get(alias);
        if(previous&&previous!==row.code)throw new Error('POLICE_BASELINE_ALIAS_CONFLICT:'+alias);
        nextAliasOwners.set(alias,row.code);
        next[alias]=row;
      });
      next[normalizeCountry(row.code)]=row;
      next[normalizeCountry(row.iso3)]=row;
    });
    countryPoliceBaselineByCode=next;
    countryPoliceBaselineRows=rows.slice();
    return{ok:true,countryCount:validation.countryCount,
      populationCount:rows.filter(function(row){return num(row.population&&row.population.value)!==null;}).length,
      observedHomicideCount:rows.filter(function(row){return num(row.crime&&row.crime.observedHomicide&&row.crime.observedHomicide.ratePer100k)!==null;}).length};
  }
  function initialCrimeBaseline(row){
    const rates=clone(row&&row.crime&&row.crime.ratesPer100k||{});
    return{
      version:1,population:num(row&&row.population&&row.population.value),populationYear:num(row&&row.population&&row.population.year),
      populationSource:row&&row.population&&row.population.source||'POPULATION_UNAVAILABLE',
      ratesPer100k:rates,rateSources:clone(row&&row.crime&&row.crime.rateSources||{}),
      observedHomicide:clone(row&&row.crime&&row.crime.observedHomicide||{ratePer100k:null,year:null,source:null}),
      referencePersonnel:Math.max(1,num(row&&row.baselinePolice&&row.baselinePolice.activePersonnel)||250),
      referenceEfficiency:60,referenceTrust:55,referenceSatisfaction:55,referenceTrainingQualityLevel:1,
      referenceFacilityLevels:clone(DEFAULT_STATE.facilityLevels),referenceTactics:clone(DEFAULT_STATE.tacticsResearched),
      referenceVehicles:clone(row&&row.baselineFleet&&row.baselineFleet.countsByTier||{}),
      referenceFleetUnits:Math.max(0,num(row&&row.baselineFleet&&row.baselineFleet.totalUnits)||0),
      referencePatrolPlan:clone(DEFAULT_POLICE_PATROL_PLAN),referenceRules:clone(DEFAULT_POLICE_POLICY_STATE),referenceRulebookScore:policeRulebookQuality(DEFAULT_POLICE_RULEBOOK),
      baselineAnnualIncidents:clone(row&&row.crime&&row.estimatedAnnualIncidents||{}),
      source:'OMEGA_COUNTRY_POLICE_BASELINE_V1'
    };
  }
  function currentFleetCounts(state){
    const counts={};VEHICLES.forEach(function(vehicle){counts[String(vehicle.level)]=Math.max(0,Math.floor(num(state&&state.vehiclesOwned&&state.vehiclesOwned[vehicle.level])||0));});
    return counts;
  }
  function countryFleetSnapshotRow(row,root){
    const cid=normalizeCountry(row&&row.code),container=root&&root.interior&&root.interior[cid];
    const raw=container&&container.police&&typeof container.police==='object'?container.police:null;
    const baseFleet=row&&row.baselineFleet||{},baseCounts=baseFleet.countsByTier||{};
    const stateReady=!!(raw&&Math.floor(num(raw.baselineVersion)||0)>=1);
    const pending=stateReady&&raw.pendingVehicleOrder&&typeof raw.pendingVehicleOrder==='object'?raw.pendingVehicleOrder:null;
    const ownedCounts={},inTransitCounts={},committedCounts={},operationalCounts={};
    const unitRows=raw&&Array.isArray(raw.vehicleFleet)?raw.vehicleFleet:[];
    const perTier=Object.create(null);
    VEHICLES.forEach(function(vehicle){perTier[String(vehicle.level)]={total:0,operational:0,deployed:0,maintenance:0,repair:0};});
    unitRows.forEach(function(unit){
      const stats=perTier[String(Math.floor(num(unit&&unit.vehicleLevel)||0))];if(!stats)return;
      stats.total++;
      const condition=Math.max(0,Math.min(100,num(unit&&unit.condition)===null?100:num(unit.condition)));
      const status=String(unit&&unit.status||'AVAILABLE');
      const odometer=Math.max(0,num(unit&&unit.odometerKm)||0),serviceAt=Math.max(1,num(unit&&unit.nextServiceAtKm)||5000);
      if(condition>15&&(status==='AVAILABLE'||status==='DEPLOYED')&&odometer<serviceAt)stats.operational++;
      if(status==='DEPLOYED')stats.deployed++;
      if(['MAINTENANCE_DUE','SERVICE_DUE','INSPECTION_DUE'].includes(status))stats.maintenance++;
      if(['REPAIR_REQUIRED','DESTROYED'].includes(status)||condition<=15)stats.repair++;
    });
    let deployedUnits=0,maintenanceUnits=0,repairRequiredUnits=0;
    VEHICLES.forEach(function(vehicle){
      const tier=String(vehicle.level),recorded=stateReady&&raw.vehiclesOwned?num(raw.vehiclesOwned[tier]):null;
      const owned=Math.max(0,Math.floor(recorded!==null&&recorded>=0?recorded:(num(baseCounts[tier])||0)));
      const ordered=pending&&Number(pending.level)===vehicle.level?Math.max(0,Math.floor(num(pending.quantity)||0)):0;
      const stats=perTier[tier],unmaterialized=Math.max(0,owned-stats.total);
      ownedCounts[tier]=owned;inTransitCounts[tier]=ordered;committedCounts[tier]=owned+ordered;
      operationalCounts[tier]=unmaterialized+stats.operational;
      deployedUnits+=stats.deployed;maintenanceUnits+=stats.maintenance;repairRequiredUnits+=stats.repair;
    });
    const sum=function(values){return Object.keys(values||{}).reduce(function(total,key){return total+Math.max(0,num(values[key])||0);},0);};
    const ownedUnits=sum(ownedCounts),inTransitUnits=sum(inTransitCounts);
    return {
      countryCode:String(row&&row.code||cid),iso2:String(row&&row.iso2||row&&row.code||cid),iso3:String(row&&row.iso3||''),
      countryName:String(row&&row.name||cid),region:String(row&&row.region||'Unknown region'),
      baselineUnits:Math.max(0,Math.floor(num(baseFleet.totalUnits)||0)),
      ownedUnits:ownedUnits,inTransitUnits:inTransitUnits,committedUnits:ownedUnits+inTransitUnits,
      operationalUnits:sum(operationalCounts),deployedUnits:deployedUnits,maintenanceUnits:maintenanceUnits,repairRequiredUnits:repairRequiredUnits,
      policePersonnel:Math.max(0,Math.floor(num(stateReady?raw.policeCount:row&&row.baselinePolice&&row.baselinePolice.activePersonnel)||0)),
      policeEfficiency:clamp(num(stateReady?raw.policeEfficiency:60)===null?60:num(stateReady?raw.policeEfficiency:60),0,100),
      baselineCountsByTier:clone(baseCounts),ownedCountsByTier:ownedCounts,inTransitCountsByTier:inTransitCounts,committedCountsByTier:committedCounts,
      baselineSource:String(baseFleet.source||'MODELED_COUNTRY_CONTEXT_AWARE_STARTING_INVENTORY'),
      dataQuality:'MODELED_ESTIMATE_NOT_OBSERVED_ROSTER: '+String(baseFleet.modelNote||baseFleet.source||'COUNTRY_CONTEXT_DERIVED_STARTING_INVENTORY'),
      liveStateAvailable:stateReady,baselineVersion:stateReady?Math.max(0,Math.floor(num(raw.baselineVersion)||0)):0,
      pendingOrder:pending?clone(pending):null
    };
  }
  function getCountryFleetSnapshot(country){
    const cid=normalizeCountry(country||currentCountry()),row=findPoliceBaseline(cid);
    if(!row)return{available:false,reason:'POLICE_BASELINE_NOT_LOADED',countryId:cid};
    return Object.assign({available:true},countryFleetSnapshotRow(row,rootState()));
  }
  function getWorldFleetSnapshot(){
    if(!Array.isArray(countryPoliceBaselineRows)||!countryPoliceBaselineRows.length)
      return{available:false,reason:'POLICE_BASELINE_NOT_LOADED',countryCount:0,countries:[],totalBaselineUnits:0,totalOwnedUnits:0,totalInTransitUnits:0,totalCommittedUnits:0,totalOperationalUnits:0};
    const root=rootState(),countries=countryPoliceBaselineRows.map(function(row){return countryFleetSnapshotRow(row,root);});
    const totals=countries.reduce(function(out,row){
      out.totalBaselineUnits+=row.baselineUnits;out.totalOwnedUnits+=row.ownedUnits;out.totalInTransitUnits+=row.inTransitUnits;
      out.totalCommittedUnits+=row.committedUnits;out.totalOperationalUnits+=row.operationalUnits;out.liveStateCountries+=row.liveStateAvailable?1:0;
      return out;
    },{totalBaselineUnits:0,totalOwnedUnits:0,totalInTransitUnits:0,totalCommittedUnits:0,totalOperationalUnits:0,liveStateCountries:0});
    return Object.assign({available:true,source:'OMEGA_COUNTRY_POLICE_BASELINE_V1',dataQuality:'MODELED_ESTIMATE_NOT_OBSERVED_ROSTER',countryCount:countries.length,countries:countries},totals);
  }
  function operationalFleetCounts(state,country){
    const owned=currentFleetCounts(state),out=Object.fromEntries(VEHICLES.map(function(vehicle){return[String(vehicle.level),0];}));
    const rows=Array.isArray(state&&state.vehicleFleet)?state.vehicleFleet:[];
    if(!rows.length)return owned;
    const cid=normalizeCountry(country||currentCountry()),profile=getCountryOperatingProfile(cid),mix=profile.environmentMixPct||{};
    const env=Object.keys(mix).sort(function(a,b){return Number(mix[b])-Number(mix[a]);})[0]||'city';
    const defaultRoad=Number(profile.roadQualityIndex)<40?'rough':'smooth';
    rows.forEach(function(unit){
      const level=Math.floor(num(unit&&unit.vehicleLevel)||0),vehicle=VEHICLES.find(function(v){return v.level===level;});
      if(!vehicle||!Object.prototype.hasOwnProperty.call(out,String(level)))return;
      const condition=clamp(num(unit.condition)===null?100:num(unit.condition),0,100);
      if(condition<=15||unit.status==='REPAIR_REQUIRED'||unit.status==='DESTROYED')return;
      const statusFactor=unit.status==='DEPLOYED'?0.68:unit.status==='MAINTENANCE_DUE'?0.62:unit.status==='SERVICE_DUE'||unit.status==='INSPECTION_DUE'?0.72:unit.status==='AVAILABLE'?1:0.4;
      const serviceTarget=Math.max(1,num(unit.nextServiceAtKm)||5000),serviceRatio=clamp((num(unit.odometerKm)||0)/serviceTarget,0,2);
      const serviceFactor=serviceRatio>=1?0.35:serviceRatio>=0.9?0.72:1;
      const assessment=vehicleUseAssessment(level,unit.lastEnvironment||env,unit.lastRoadCondition||defaultRoad,cid);
      const routeFactor=assessment&&assessment.ok?0.72+0.28*(assessment.fit/100):0.6;
      out[String(level)]+=condition/100*statusFactor*serviceFactor*routeFactor;
    });
    return out;
  }
  function totalOperationalFleetCount(counts){
    return Object.keys(counts||{}).reduce(function(sum,key){return sum+Math.max(0,num(counts[key])||0);},0);
  }
  function operationalVehicleUnitCount(state){
    const rows=Array.isArray(state&&state.vehicleFleet)?state.vehicleFleet:[];
    if(!rows.length)return totalFleetCount(currentFleetCounts(state));
    return rows.filter(function(unit){
      const condition=clamp(num(unit&&unit.condition)===null?100:num(unit.condition),0,100);
      const status=String(unit&&unit.status||'AVAILABLE');
      const serviceTarget=Math.max(1,num(unit&&unit.nextServiceAtKm)||5000);
      const odometer=Math.max(0,num(unit&&unit.odometerKm)||0);
      return condition>15&&(status==='AVAILABLE'||status==='DEPLOYED')&&odometer<serviceTarget;
    }).length;
  }
  function totalFleetCount(counts){
    return Object.keys(counts||{}).reduce(function(sum,key){return sum+Math.max(0,Math.floor(num(counts[key])||0));},0);
  }
  function isPristinePoliceState(state,raw){
    if(!raw)return true;
    const facilitiesAreDefault=Object.keys(DEFAULT_STATE.facilityLevels).every(function(key){
      return Math.floor(num(state.facilityLevels&&state.facilityLevels[key])||0)===Math.floor(num(DEFAULT_STATE.facilityLevels[key])||0);
    });
    const tacticsAreDefault=Object.keys(DEFAULT_STATE.tacticsResearched).every(function(key){return !state.tacticsResearched||state.tacticsResearched[key]===false;});
    const policiesAreDefault=Object.keys(DEFAULT_POLICE_POLICY_STATE).every(function(key){return !state.policeRules||state.policeRules[key]===false;});
    return Math.floor(num(state.baselineVersion)||0)===0&&
      Math.floor(num(state.policeCount)||250)===250&&Math.floor(num(state.policeEfficiency)||60)===60&&
      Math.floor(num(state.policeTrust)||55)===55&&Math.floor(num(state.publicSatisfaction)||55)===55&&
      totalFleetCount(state.vehiclesOwned)===0&&Math.floor(num(state.lastUpdatedTurn)||0)===0&&
      !(state.pendingVehicleOrder)&&!(state.pendingResearch)&&!(state.guardDeployments||[]).length&&
      !(state.incidentLedger||[]).length&&!(state.vehicleMaintenanceLog||[]).length&&
      Math.floor(num(state.trainingQualityLevel)||1)===1&&Math.floor(num(state.specialAgents)||0)===0&&
      Math.floor(num(state.unpaidPayroll)||0)===0&&facilitiesAreDefault&&tacticsAreDefault&&policiesAreDefault;
  }
  function isUntouchedLegacyBaselineState(state,raw,row){
    if(!raw||Math.floor(num(raw.baselineVersion)||0)<1||Math.floor(num(raw.fleetProfileModelVersion)||0)>=1)return false;
    const facilitiesAreDefault=Object.keys(DEFAULT_STATE.facilityLevels).every(function(key){
      return Math.floor(num(state.facilityLevels&&state.facilityLevels[key])||0)===Math.floor(num(DEFAULT_STATE.facilityLevels[key])||0);
    });
    const tacticsAreDefault=Object.keys(DEFAULT_STATE.tacticsResearched).every(function(key){return !state.tacticsResearched||state.tacticsResearched[key]===false;});
    const policiesAreDefault=Object.keys(DEFAULT_POLICE_POLICY_STATE).every(function(key){return !state.policeRules||state.policeRules[key]===false;});
    const rulebookIsDefault=JSON.stringify(normalizePoliceRulebook(state.policeRulebook))===JSON.stringify(normalizePoliceRulebook(DEFAULT_POLICE_RULEBOOK));
    const patrolIsDefault=JSON.stringify(normalizePatrolPlan(state.patrolPlan))===JSON.stringify(normalizePatrolPlan(DEFAULT_POLICE_PATROL_PLAN));
    const departmentsAreDefault=JSON.stringify(normalizePoliceDepartmentPlan(state.policeDepartments))===JSON.stringify(normalizePoliceDepartmentPlan(DEFAULT_POLICE_DEPARTMENT_PLAN));
    const vehiclesArePristine=(state.vehicleFleet||[]).every(function(unit){
      return Number(unit.condition||100)>=99.9&&Number(unit.odometerKm||0)===0&&Number(unit.incidents||0)===0&&Number(unit.repairsCount||0)===0;
    });
    const personnel=Math.max(1,Math.floor(num(state.baselinePolicePersonnel)||0));
    const fleetUnits=Math.max(0,Math.floor(num(state.baselineFleetUnits)||0));
    return personnel>0&&Math.floor(num(state.policeCount)||0)===personnel&&
      totalFleetCount(state.vehiclesOwned)===fleetUnits&&Math.floor(num(state.lastUpdatedTurn)||0)===0&&
      !state.pendingVehicleOrder&&!state.pendingResearch&&!(state.guardDeployments||[]).length&&
      !(state.incidentLedger||[]).length&&!(state.vehicleMaintenanceLog||[]).length&&vehiclesArePristine&&
      !(state.crimeHistory||[]).length&&!(state.crimeModel&&Number(state.crimeModel.totalIncidents||0))&&
      Math.floor(num(state.trainingQualityLevel)||1)===1&&Math.floor(num(state.specialAgents)||0)===0&&
      Math.floor(num(state.unpaidPayroll)||0)===0&&facilitiesAreDefault&&tacticsAreDefault&&policiesAreDefault&&
      rulebookIsDefault&&patrolIsDefault&&departmentsAreDefault&&!(state.policeCases||[]).length&&Math.floor(num(state.nextPoliceCaseSequence)||1)===1;
  }
  function applyBaselineToPoliceState(state,row,raw){
    const pristine=isPristinePoliceState(state,raw),legacyUntouched=isUntouchedLegacyBaselineState(state,raw,row);
    const refreshOpeningFleet=pristine||legacyUntouched,fleet=row&&row.baselineFleet||{},personnel=row&&row.baselinePolice||{};
    if(refreshOpeningFleet){
      state.policeCount=Math.max(1,Math.floor(num(personnel.activePersonnel)||250));
      state.vehiclesOwned=Object.assign({},fleet.countsByTier||{});
      if(legacyUntouched){state.vehicleFleet=[];state.nextVehicleUnitId=1;state.vehicleMaintenanceLog=[];state.lastFleetSimulationDay=null;state.crimeBaseline=initialCrimeBaseline(row);}
      state.unlockedVehicleLevel=Math.max(1,Math.min(1,Math.floor(num(state.unlockedVehicleLevel)||1)));
      state.policeEfficiency=60;state.policeTrust=55;state.publicSatisfaction=55;
      state.misconductRiskPct=20;state.justiceBacklog=0;state.privacyRiskPct=20;
      state.trainingQualityLevel=1;state.lastUpdatedTurn=turn();
    }else{
      state.vehiclesOwned=state.vehiclesOwned&&typeof state.vehiclesOwned==='object'?state.vehiclesOwned:{};
      VEHICLES.forEach(function(vehicle){const tier=String(vehicle.level),recorded=num(state.vehiclesOwned[tier]);if(recorded===null||recorded<0||Math.floor(recorded)!==recorded)state.vehiclesOwned[tier]=Math.max(0,Math.floor(num(fleet.countsByTier&&fleet.countsByTier[tier])||0));});
    }
    if(pristine||num(state.fuelSupplyDays)===null)state.fuelSupplyDays=14;
    state.fuelSupplyDays=clamp(num(state.fuelSupplyDays)===null?14:num(state.fuelSupplyDays),0,180);
    state.baselineVersion=1;
    if(refreshOpeningFleet)state.fleetProfileModelVersion=Math.max(1,Math.floor(num(row&&row.fleetProfile&&row.fleetProfile.modelVersion)||1));
    state.baselinePolicePersonnel=Math.max(1,Math.floor(num(personnel.activePersonnel)||250));
    state.baselineFleetUnits=Math.max(0,Math.floor(num(fleet.totalUnits)||0));
    state.baselineFleetReplacementValueUsd=Math.max(0,num(fleet.replacementValueUsd)||0);
    state.baselineSource='OMEGA_COUNTRY_POLICE_BASELINE_V1';
    const payroll=row&&row.payrollRules||{};
    if(pristine||num(state.dailySalaryPerOfficerUsd)===null)state.dailySalaryPerOfficerUsd=Math.max(0.75,num(payroll.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY);
    if(pristine||num(state.recruitmentBaseFeePerOfficerUsd)===null)state.recruitmentBaseFeePerOfficerUsd=Math.max(75,num(payroll.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);
    if(pristine||num(state.recruitmentFeePerOfficerUsd)===null)state.recruitmentFeePerOfficerUsd=Math.max(75,num(payroll.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);
    state.policeRecruitmentLevel=Math.max(1,Math.min(10,Math.floor(num(state.policeRecruitmentLevel)||1)));
    if(!state.crimeBaseline||Number(state.crimeBaseline.version)!==1)state.crimeBaseline=initialCrimeBaseline(row);
    state.patrolPlan=normalizePatrolPlan(state.patrolPlan);
    state.policeRules=Object.assign(clone(DEFAULT_POLICE_POLICY_STATE),state.policeRules||{});
    state.policeRulebook=normalizePoliceRulebook(state.policeRulebook);
    state.policeDepartments=normalizePoliceDepartmentPlan(state.policeDepartments);
    if(!state.crimeModel||typeof state.crimeModel!=='object')state.crimeModel={totalIncidents:0,openedCases:0,clearedCases:0,lastUpdatedDay:null};
    if(!Array.isArray(state.crimeHistory))state.crimeHistory=[];
    if(!state.crimeAccumulator||typeof state.crimeAccumulator!=='object')state.crimeAccumulator={};
    if(state.lastCrimeSimulationDay===null||state.lastCrimeSimulationDay===undefined)state.lastCrimeSimulationDay=Math.floor(simulationTimeMs()/DAY_MS);
    if(state.lastPayrollDay===null||state.lastPayrollDay===undefined)state.lastPayrollDay=Math.floor(simulationTimeMs()/DAY_MS);
    return{state:state,pristine:pristine,refreshedLegacyFleet:legacyUntouched};
  }
  function bootstrapCountryPoliceBaselines(rows){
    const loaded=loadCountryPoliceBaselines(rows);
    if(!loaded.ok)return loaded;
    const root=rootState();if(!root)return{ok:false,code:'AUTHORITATIVE_GAME_STATE_UNAVAILABLE',countryCount:loaded.countryCount};
    if(!root.interior||typeof root.interior!=='object')root.interior={};
    let seeded=0,existing=0,migrated=0,playerCountryId=playerCountry();
    rows.forEach(function(row){
      if(!row||!row.code)return;
      const cid=normalizeCountry(row.code),countryState=root.interior[cid]&&root.interior[cid].police;
      const raw=countryState&&typeof countryState==='object'?countryState:null;
      const state=mergeState(raw||baseState()),result=applyBaselineToPoliceState(state,row,raw);
      if(!root.interior[cid]||typeof root.interior[cid]!=='object')root.interior[cid]={};
      root.interior[cid].police=clone(result.state);
      if(result.pristine)seeded++;else if(result.refreshedLegacyFleet){seeded++;migrated++;}else existing++;
    });
    root.omegaHomePoliceBaselineVersion=1;
    root.omegaHomePoliceBaselineCountryCount=loaded.countryCount;
    root.omegaHomePoliceBaselineUpdatedAt=new Date().toISOString();
    const playerBaseline=findPoliceBaseline(playerCountryId);
    if(playerBaseline){
      const cid=normalizeCountry(playerBaseline.code);
      getState(cid);
    }
    const diagnostics=Object.assign({},loaded,{ok:true,seededCountries:seeded,existingCountryStatesPreserved:existing,
      migratedLegacyFleetCountries:migrated,baselineVersion:1,activeCountry:playerCountryId});
    emit('OMEGA_HOME_POLICE_WORLD_BASELINE_READY',diagnostics);
    return diagnostics;
  }
  function activePolicePolicyRules(state){
    return POLICE_POLICY_RULES.filter(function(rule){return !!(state&&state.policeRules&&state.policeRules[rule.id]);});
  }
  function ruleDailyCost(state){
    return activePolicePolicyRules(state).reduce(function(sum,rule){return sum+Math.max(0,num(rule.dailyCostUsd)||0);},0);
  }
  function ruleEffectSum(state,key){
    return activePolicePolicyRules(state).reduce(function(sum,rule){return sum+(num(rule[key])||0);},0);
  }
  function crimeVehicleCapability(state,category,country){
    const map={
      theft:['patrol','surveillance'],robbery:['response','patrol','protection'],
      streetRobbery:['patrol','response','crowdControl'],drugTrafficking:['counterSmuggling','surveillance','command'],
      contrabandSmuggling:['counterSmuggling','offRoad','surveillance'],assault:['response','crowdControl','protection'],
      homicide:['response','surveillance','command'],cybercrime:['surveillance','command']
    };
    const keys=map[category]||['patrol','response'],counts=operationalFleetCounts(state,country),units=totalOperationalFleetCount(counts);
    if(!units)return 0;
    let weighted=0;
    VEHICLES.forEach(function(vehicle){
      const count=counts[String(vehicle.level)]||0;
      const score=(map[category]||[]).reduce(function(sum,key){return sum+(num(vehicle.capabilities[key])||0);},0)/Math.max(1,(map[category]||[]).length);
      weighted+=count*score;
    });
    return weighted/units;
  }
  function countryStaffingTarget(country,baseline,currentPopulation,referencePersonnel){
    const row=findPoliceBaseline(country)||{},baselinePopulation=Math.max(0,num(baseline&&baseline.population)||0);
    const localRate=Math.max(0,num(row.baselinePolice&&row.baselinePolice.staffingRatePer100k)||0);
    const targetRatePer100k=Math.max(150,localRate*1.1);
    const targetAtBaseline=baselinePopulation>0?Math.max(referencePersonnel,baselinePopulation*targetRatePer100k/100000):referencePersonnel;
    const populationScale=currentPopulation!==null&&currentPopulation>0&&baselinePopulation>0?
      clamp(currentPopulation/baselinePopulation,0.1,20):1;
    return{targetRatePer100k:targetRatePer100k,populationScale:populationScale,
      targetPersonnel:Math.max(1,Math.ceil(targetAtBaseline*populationScale))};
  }
  function crimeReductionForCategory(state,category,crimeBaseline,country){
    const base=crimeBaseline||state.crimeBaseline||{},refPersonnel=Math.max(1,num(base.referencePersonnel)||num(state.baselinePolicePersonnel)||250);
    const refEfficiency=num(base.referenceEfficiency)===null?60:num(base.referenceEfficiency);
    const currentPopulation=num(population(country))===null?num(base.population):num(population(country));
    const staffingTarget=countryStaffingTarget(country,base,currentPopulation,refPersonnel);
    const populationScale=staffingTarget.populationScale;
    let reduction=Math.log(Math.max(1,num(state.policeCount)||1)/refPersonnel)*0.08;
    reduction+=(Math.max(0,num(state.policeEfficiency)||0)-refEfficiency)*0.0015;
    const facilityMap={
      theft:[['station',0.008],['patrol',0.014],['dispatch',0.012]],
      robbery:[['station',0.006],['patrol',0.012],['dispatch',0.012],['forensics',0.01]],
      streetRobbery:[['station',0.006],['patrol',0.015],['dispatch',0.012]],
      drugTrafficking:[['border',0.014],['forensics',0.015],['cyber',0.006],['communications',0.008]],
      contrabandSmuggling:[['border',0.018],['communications',0.008],['dispatch',0.006]],
      assault:[['station',0.006],['patrol',0.01],['emergency',0.012],['academy',0.005]],
      homicide:[['forensics',0.02],['dispatch',0.008],['academy',0.005]],
      cybercrime:[['cyber',0.025],['communications',0.012],['forensics',0.01]]
    };
    const minimumFacilityLevels={station:2,patrol:2,dispatch:2,forensics:2,border:1,communications:2,academy:3,cyber:1,emergency:2,department:2};
    const facilityDemandScale=Math.max(1,Math.min(2.5,Math.sqrt(populationScale)));
    (facilityMap[category]||[]).forEach(function(pair){
      const current=Math.max(0,num(state.facilityLevels&&state.facilityLevels[pair[0]])||0);
      const reference=Math.max(0,num((base.referenceFacilityLevels||DEFAULT_STATE.facilityLevels)[pair[0]])||0);
      const target=Math.ceil(Math.max(minimumFacilityLevels[pair[0]]||1,reference)*facilityDemandScale);
      reduction+=(current-target)*pair[1];
    });
    const countryFleet=operationalFleetCounts(state,country);
    const currentCars=totalOperationalFleetCount(countryFleet),refCars=Math.max(1,num(base.referenceFleetUnits)||num(state.baselineFleetUnits)||currentCars||1);
    reduction+=Math.log(Math.max(1,currentCars)/refCars)*0.035;
    const currentQuality=crimeVehicleCapability(state,category,country),refVehicles=base.referenceVehicles||{};
    let refUnits=0,refQuality=0;
    VEHICLES.forEach(function(vehicle){
      const count=Math.max(0,num(refVehicles[vehicle.level])||0),keys=({theft:['patrol','surveillance'],robbery:['response','patrol','protection'],streetRobbery:['patrol','response','crowdControl'],drugTrafficking:['counterSmuggling','surveillance','command'],contrabandSmuggling:['counterSmuggling','offRoad','surveillance'],assault:['response','crowdControl','protection'],homicide:['response','surveillance','command'],cybercrime:['surveillance','command']})[category]||['patrol','response'];
      const quality=keys.reduce(function(sum,key){return sum+(num(vehicle.capabilities[key])||0);},0)/keys.length;
      refUnits+=count;refQuality+=count*quality;
    });
    refQuality=refUnits?refQuality/refUnits:currentQuality;
    reduction+=(currentQuality-refQuality)*0.0018;
    const currentDepartments=normalizePoliceDepartmentPlan(state.policeDepartments),refDepartments=normalizePoliceDepartmentPlan(base.referencePoliceDepartments||DEFAULT_POLICE_DEPARTMENT_PLAN);
    const departmentInfluence={
      theft:{generalPatrol:0.0011,community:0.0007,investigations:0.0003},
      robbery:{generalPatrol:0.0008,rapidResponse:0.0010,investigations:0.0007},
      streetRobbery:{generalPatrol:0.0011,traffic:0.0004,community:0.0008},
      drugTrafficking:{narcotics:0.0014,border:0.0008,investigations:0.0006},
      contrabandSmuggling:{border:0.0015,traffic:0.0006,narcotics:0.0006},
      assault:{community:0.0012,rapidResponse:0.0007,investigations:0.0004},
      homicide:{homicide:0.0018,forensics:0.0010,investigations:0.0010},
      cybercrime:{cybercrime:0.0020,forensics:0.0008,investigations:0.0005}
    };
    Object.entries(departmentInfluence[category]||{generalPatrol:0.001}).forEach(function(entry){
      const key=entry[0],weight=entry[1];
      reduction+=(currentDepartments[key]-refDepartments[key])*weight;
    });
    const currentPatrol=normalizePatrolPlan(state.patrolPlan),refPatrol=normalizePatrolPlan(base.referencePatrolPlan);
    const patrolInfluence={
      theft:{urban:0.0014,rural:0.0005,community:0.0003},
      robbery:{urban:0.0012,highway:0.0007,community:0.0003},
      streetRobbery:{urban:0.0012,community:0.0006,highway:0.0003},
      drugTrafficking:{drugs:0.0010,border:0.0006,rural:0.0004,investigations:0.0003},
      contrabandSmuggling:{border:0.0010,rural:0.0007,highway:0.0004,drugs:0.0002},
      assault:{community:0.0010,urban:0.0005,investigations:0.0003},
      homicide:{investigations:0.0010,community:0.0004,urban:0.0003},
      cybercrime:{cyber:0.0013,investigations:0.0004}
    };
    Object.entries(patrolInfluence[category]||{urban:0.0015}).forEach(function(entry){
      const key=entry[0],weight=entry[1];
      reduction+=(currentPatrol[key]-refPatrol[key])*weight;
    });
    const effects=({theft:'theft',robbery:'robbery',streetRobbery:'streetRobbery',drugTrafficking:'drugTrafficking',contrabandSmuggling:'contrabandSmuggling',assault:'assault',homicide:'homicide',cybercrime:'cybercrime'})[category]||category;
    activePolicePolicyRules(state).forEach(function(rule){reduction+=Math.max(0,num(rule.crimeEffects&&rule.crimeEffects[effects])||0);});
    const tactics=state.tacticsResearched||{};
    if(category==='assault'&&tactics.antiRiot)reduction+=0.025;
    if((category==='drugTrafficking'||category==='contrabandSmuggling')&&tactics.smugglerInterdict)reduction+=0.03;
    if((category==='homicide'||category==='robbery')&&tactics.counterTerror)reduction+=0.02;
    if((category==='robbery'||category==='assault')&&tactics.assetProtection)reduction+=0.018;
    if(tactics.intelligenceFusion)reduction+=0.012;
    reduction+=(Math.max(0,num(state.publicSatisfaction)||0)-(num(base.referenceSatisfaction)===null?55:num(base.referenceSatisfaction)))*0.0007;
    reduction+=(20-clamp(num(state.misconductRiskPct)===null?20:num(state.misconductRiskPct),0,100))*0.00055;
    const requiredPersonnel=staffingTarget.targetPersonnel;
    const staffingCoverage=clamp((Math.max(0,num(state.policeCount)||0))/requiredPersonnel,0,2);
    reduction+=Math.log(clamp(staffingCoverage,0.1,2))*0.18;
    const requiredVehicles=Math.max(1,Math.ceil(requiredPersonnel/18));
    const vehicleCoverage=clamp(totalFleetCount(currentFleetCounts(state))/requiredVehicles,0,2);
    reduction+=Math.log(clamp(vehicleCoverage,0.1,2))*0.12;
    const trainingTarget=3+Math.max(0,Math.log2(Math.max(0.1,populationScale)))*0.25;
    reduction+=(clamp((Math.max(1,num(state.trainingQualityLevel)||1)/trainingTarget),0,1.5)-1)*0.045;
    const referenceRulebookScore=num(base.referenceRulebookScore)===null?policeRulebookQuality(DEFAULT_POLICE_RULEBOOK):num(base.referenceRulebookScore);
    reduction+=(policeRulebookQuality(state.policeRulebook)-referenceRulebookScore)*0.002;
    const currentBook=normalizePoliceRulebook(state.policeRulebook),referenceBook=normalizePoliceRulebook(DEFAULT_POLICE_RULEBOOK);
    const responsePressure=clamp((referenceBook.arrestResponseHours-currentBook.arrestResponseHours)/referenceBook.arrestResponseHours,-2,0.9);
    const fastResponseCategories={theft:0.025,robbery:0.035,streetRobbery:0.04,drugTrafficking:0.012,contrabandSmuggling:0.015,assault:0.03,homicide:0.025,cybercrime:0.02};
    reduction+=responsePressure*(fastResponseCategories[category]||0.01);
    const fuelReserveDays=clamp(num(state.fuelSupplyDays)===null?14:num(state.fuelSupplyDays),0,180);
    const fuelReadiness=clamp(fuelReserveDays/14,0,1);
    reduction+=(fuelReadiness-1)*0.08;
    const unresolvedCases=(state.policeCases||[]).filter(function(row){
      return row&&row.status!=='CLOSED'&&(row.responseDeadlineMissed||row.warrantDeadlineMissed||row.evidenceDeadlineMissed||row.arrestReviewOverdue||row.detentionDeadlineMissed||row.forceReviewOverdue);
    }).length;
    reduction-=Math.min(0.18,unresolvedCases*0.012);
    return clamp(reduction,-0.65,0.75);
  }
  function getCrimeSnapshot(country,suppliedState){
    const cid=normalizeCountry(country||currentCountry()),state=suppliedState||getState(cid),baseline=state&&state.crimeBaseline;
    if(!state||!baseline||!baseline.ratesPer100k)return{available:false,reason:'POLICE_BASELINE_NOT_LOADED',countryId:cid};
    const categories=Object.keys(baseline.ratesPer100k),rows={};let baselineIndex=0,currentIndex=0,totalBaseline=0,totalProjected=0;
    categories.forEach(function(category){
      const rate=num(baseline.ratesPer100k[category]);if(rate===null||rate<0)return;
      const reduction=crimeReductionForCategory(state,category,baseline,cid),projected=Math.max(0,rate*(1-reduction));
      const dynamicPopulation=num(population(cid)),baselinePopulation=num(baseline.population);
      const populationValue=dynamicPopulation!==null&&dynamicPopulation>0?dynamicPopulation:baselinePopulation;
      const annualBaseline=populationValue===null?null:Math.round(populationValue*rate/100000);
      const annualProjected=populationValue===null?null:Math.round(populationValue*projected/100000);
      const profile=findPoliceBaseline(cid)||{},gdpPerCapita=Math.max(0,num(profile.economyInputs&&profile.economyInputs.gdpPerCapitaUsd)||0);
      const impactFactor={theft:0.08,robbery:0.18,streetRobbery:0.11,drugTrafficking:0.35,contrabandSmuggling:0.40,assault:0.035,homicide:8,cybercrime:0.25}[category]||0.08;
      const financialImpactPerIncidentUsd=Math.round(Math.max(25,gdpPerCapita*impactFactor+(category==='homicide'?5000:0)));
      const source=baseline.rateSources&&baseline.rateSources[category]||'MODELED_SIMULATION_BASELINE';
      const isObserved=String(source).indexOf('WORLD_BANK_OBSERVED')===0;
      rows[category]={category:category,label:({theft:'Theft',robbery:'Robbery',streetRobbery:'Street robbery',drugTrafficking:'Drug trafficking',contrabandSmuggling:'Contraband / smuggling',assault:'Assault',homicide:'Homicide',cybercrime:'Cybercrime'})[category]||category,
        baselineRatePer100k:rate,projectedRatePer100k:Math.round(projected*1000)/1000,reductionPct:Math.round(reduction*10000)/100,
        baselineAnnualIncidents:annualBaseline,projectedAnnualIncidents:annualProjected,estimatedAnnualIncidentsAvoided:annualBaseline===null?null:annualBaseline-annualProjected,
        financialImpactPerIncidentUsd:financialImpactPerIncidentUsd,
        baselineEstimatedFinancialImpactUsd:annualBaseline===null?null:annualBaseline*financialImpactPerIncidentUsd,
        projectedEstimatedFinancialImpactUsd:annualProjected===null?null:annualProjected*financialImpactPerIncidentUsd,
        estimatedFinancialImpactAvoidedUsd:annualBaseline===null||annualProjected===null?null:(annualBaseline-annualProjected)*financialImpactPerIncidentUsd,
        financialImpactSource:'MODELED_ECONOMIC_EXPOSURE_NOT_POLICE_REVENUE',
        source:source,observed:isObserved,observationYear:category==='homicide'&&baseline.observedHomicide?baseline.observedHomicide.year:null};
      baselineIndex+=rate;currentIndex+=projected;
      totalBaseline+=annualBaseline===null?0:annualBaseline;totalProjected+=annualProjected===null?0:annualProjected;
    });
    const dynamicPop=num(population(cid)),baselinePop=num(baseline.population),pop=dynamicPop!==null&&dynamicPop>0?dynamicPop:baselinePop;
    const model=state.crimeModel||{};
    const active=activePolicePolicyRules(state);
    const policeBaseline=findPoliceBaseline(cid)||{},referencePersonnel=Math.max(1,num(baseline.referencePersonnel)||num(state.baselinePolicePersonnel)||250);
    const staffingTarget=countryStaffingTarget(cid,baseline,pop,referencePersonnel);
    const targetPolice=staffingTarget.targetPersonnel,targetFleet=Math.max(1,Math.ceil(targetPolice/18));
    const ownedFleetCounts=currentFleetCounts(state),fleetCounts=operationalFleetCounts(state,cid),ownedFleetUnits=totalFleetCount(ownedFleetCounts),fleetUnits=totalOperationalFleetCount(fleetCounts);
    const facilityTargets={station:2,patrol:2,dispatch:2,forensics:2,border:1,communications:2,academy:3,cyber:1,emergency:2,department:2};
    const facilityTargetUnits=Object.values(facilityTargets).reduce(function(sum,n){return sum+n;},0);
    const facilityCurrentUnits=Object.keys(facilityTargets).reduce(function(sum,key){return sum+Math.min(facilityTargets[key],Math.max(0,num(state.facilityLevels&&state.facilityLevels[key])||0));},0);
    const facilityReadinessPct=Math.round(clamp(facilityCurrentUnits/Math.max(1,facilityTargetUnits)*100,0,100)*10)/10;
    const trainingCoveragePct=Math.round(clamp(Math.max(1,num(state.trainingQualityLevel)||1)/Math.max(1,3+Math.max(0,Math.log2(Math.max(0.1,staffingTarget.populationScale)))*0.25)*100,0,100)*10)/10;
    const estimatedAnnualFinancialImpactUsd=Object.values(rows).reduce(function(sum,row){return sum+(num(row.projectedEstimatedFinancialImpactUsd)||0);},0);
    const baselineAnnualFinancialImpactUsd=Object.values(rows).reduce(function(sum,row){return sum+(num(row.baselineEstimatedFinancialImpactUsd)||0);},0);
    const estimatedFinancialImpactAvoidedUsd=Object.values(rows).reduce(function(sum,row){return sum+(num(row.estimatedFinancialImpactAvoidedUsd)||0);},0);
    return{available:true,countryId:cid,countryName:(findPoliceBaseline(cid)||{}).name||cid,
      region:policeBaseline.region||'Unknown region',operatingProfile:getCountryOperatingProfile(cid),
      population:pop,populationYear:baseline.populationYear,populationSource:baseline.populationSource,
      fuel: getFuelSnapshot(cid,state),
      staffingTargetRatePer100k:staffingTarget.targetRatePer100k,
      requiredPoliceEstimate:targetPolice,policeStaffingCoveragePct:targetPolice?Math.round(state.policeCount/targetPolice*1000)/10:null,
      currentFleetUnits:ownedFleetUnits,currentOperationalFleetUnits:Math.round(fleetUnits*10)/10,
      currentOperationalVehicleUnits:operationalVehicleUnitCount(state),requiredFleetEstimate:targetFleet,vehicleCoveragePct:targetFleet?Math.round(fleetUnits/targetFleet*1000)/10:null,
      facilityReadinessPct:facilityReadinessPct,trainingCoveragePct:trainingCoveragePct,
      simulationTargetSource:'GAMEPLAY_POLICY_TARGET_NOT_OFFICIAL_COUNTRY_STANDARD',
      estimatedAnnualFinancialImpactUsd:estimatedAnnualFinancialImpactUsd,baselineAnnualFinancialImpactUsd:baselineAnnualFinancialImpactUsd,
      estimatedFinancialImpactAvoidedUsd:estimatedFinancialImpactAvoidedUsd,financialImpactSource:'MODELED_ECONOMIC_EXPOSURE_NOT_POLICE_REVENUE',
      activePolice:Math.max(0,Math.floor(num(state.policeCount)||0)),policePer100k:pop?Math.round(state.policeCount/pop*100000*10)/10:null,
      baselinePolicePersonnel:state.baselinePolicePersonnel,trainingQualityLevel:state.trainingQualityLevel,policeEfficiency:state.policeEfficiency,
      publicSatisfaction:clamp(num(state.publicSatisfaction)===null?num(state.policeTrust)||55:num(state.publicSatisfaction),0,100),
      misconductRiskPct:clamp(num(state.misconductRiskPct)===null?20:num(state.misconductRiskPct),0,100),privacyRiskPct:clamp(num(state.privacyRiskPct)===null?20:num(state.privacyRiskPct),0,100),
      justiceBacklog:Math.max(0,num(state.justiceBacklog)||0),policeCases:getPoliceCaseSummary(state,simulationTimeMs()),policeRulebook:normalizePoliceRulebook(state.policeRulebook),policeRulebookScore:policeRulebookQuality(state.policeRulebook),
      policeRulebookOperationalIndex:policeRulebookOperationalIndex(state.policeRulebook),
      policeRulebookDailyCostUsd:policeRulebookDailyCost(state),
      activePolicyDailyCostUsd:Math.round(activePolicyDailyCost(state)*100)/100,
      policeDepartments:clone(normalizePoliceDepartmentPlan(state.policeDepartments)),policeDepartmentHeadcounts:policeDepartmentHeadcounts(state),
      caseClearanceBonusPct:ruleEffectSum(state,'clearanceDelta'),
      justiceSpeedBonusPct:ruleEffectSum(state,'justiceDelta'),activePolicyRules:active.map(function(rule){return rule.id;}),
      baselineAnnualIncidentEstimate:baseline.population===null?null:totalBaseline,
      projectedAnnualIncidentEstimate:baseline.population===null?null:totalProjected,annualIncidentsAvoided:baseline.population===null?null:totalBaseline-totalProjected,
      baselineCrimeIndex:baselineIndex?100:0,projectedCrimeIndex:baselineIndex?Math.round(currentIndex/baselineIndex*10000)/100:0,
      recordedDailyModel:clone(model),categories:rows,
      disclaimer:'Rates labelled WORLD_BANK_OBSERVED are official-data observations; other crime categories and all projected outcomes are game estimates, not official crime statistics.'};
  }
  function estimateRecruitmentImpact(quantity,country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),qty=Math.floor(num(quantity)||0);
    if(qty<1||qty>100000)return{ok:false,code:'RECRUITMENT_QUANTITY_INVALID'};
    const before=getCrimeSnapshot(cid,state);if(!before.available)return{ok:false,code:before.reason||'POLICE_BASELINE_NOT_LOADED'};
    const next=Object.assign({},state,{policeCount:state.policeCount+qty,policeEfficiency:clamp(state.policeEfficiency+Math.min(5,qty/100),0,100)});
    const after=getCrimeSnapshot(cid,next);
    const dailySalary=Math.max(0,num(state.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY),hiringFee=Math.max(0,num(state.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);
    return{ok:true,quantity:qty,upfrontCostUsd:qty*hiringFee,addedDailyPayrollUsd:qty*dailySalary,
      baselineAnnualIncidents:before.baselineAnnualIncidentEstimate,projectedAnnualIncidentsBefore:before.projectedAnnualIncidentEstimate,
      projectedAnnualIncidentsAfter:after.projectedAnnualIncidentEstimate,additionalIncidentsAvoidedPerYear:(before.projectedAnnualIncidentEstimate===null||after.projectedAnnualIncidentEstimate===null)?null:before.projectedAnnualIncidentEstimate-after.projectedAnnualIncidentEstimate,
      before:before,after:after};
  }
  function financeApi(){return g.OmegaFinanceMinistry||g.Omega&&g.Omega.FinanceMinistry||null;}
  function isPlayerCountry(country){
    const cid=normalizeCountry(country),finance=financeApi();
    try{
      const profile=finance&&typeof finance.resolveCountry==='function'?finance.resolveCountry(cid):null;
      const player=finance&&typeof finance.getPlayerCountry==='function'?finance.getPlayerCountry():null;
      if(profile&&player){
        const a=normalizeCountry(profile.iso3||profile.countryCode||profile.code||profile.name);
        const b=normalizeCountry(player.iso3||player.countryCode||player.code||player.name);
        if(a&&b)return a===b;
      }
    }catch(_){}
    return !!cid&&cid===playerCountry();
  }
  function homeBudgetCategory(action){
    const name=String(action||'HOME_MINISTRY_DAILY_OPERATIONS').toUpperCase();
    if(name.includes('FUEL'))return 'operations';
    for(const [id,row] of Object.entries(HOME_BUDGET_CATEGORIES))if(row.actions.includes(name))return id;
    if(name.includes('RECRUIT')||name.includes('PAYROLL')||name.includes('SALARY'))return 'personnel';
    if(name.includes('VEHICLE')&&(name.includes('ORDER')||name.includes('PROCURE')||name.includes('PURCHASE')))return 'vehicles';
    if(name.includes('REPAIR')||name.includes('SERVICE')||name.includes('MAINTENANCE'))return 'maintenance';
    if(name.includes('FACILITY')||name.includes('FACILITIES'))return 'facilities';
    if(name.includes('RESEARCH')||name.includes('TRAIN'))return 'training';
    return 'operations';
  }
  function currentFiscalLedgerSpend(model,category){
    const ledger=Array.isArray(model&&model.ledger)?model.ledger:[];
    const fiscal=Math.max(0,Math.floor(num(model&&model.fiscalYearIndex)||0));
    const marker='OMEGA_HOME_BUDGET:'+category+'|';
    return ledger.reduce(function(sum,row){
      if(!row||row.action!=='EXPENSE'||String(row.department||'')!=='interior'||!String(row.description||'').startsWith(marker))return sum;
      if(num(row.fiscalYearIndex)!==null&&Math.floor(num(row.fiscalYearIndex))!==fiscal)return sum;
      if(row.reversedBy)return sum;
      return sum+Math.max(0,num(row.amountUsd)||0);
    },0);
  }
  function getHomeBudgetSnapshot(country,suppliedState){
    const cid=normalizeCountry(country||currentCountry()),finance=financeApi();
    if(!cid)return{available:false,reason:'PLAYER_COUNTRY_UNAVAILABLE',countryId:cid};
    if(!finance||typeof finance.applyAction!=='function'||typeof finance.getFinanceState!=='function'||typeof finance.diagnostics!=='function')
      return{available:false,reason:'FINANCE_RUNTIME_NOT_READY',countryId:cid};
    const diagnostic=finance.diagnostics();
    if(!diagnostic||diagnostic.initialized!==true)return{available:false,reason:'FINANCE_RUNTIME_NOT_READY',countryId:cid};
    const profile=typeof finance.resolveCountry==='function'?finance.resolveCountry(cid):null;
    if(!profile)return{available:false,reason:'COUNTRY_PROFILE_UNAVAILABLE',countryId:cid};
    const canEdit=isPlayerCountry(cid);
    let model=null;
    try{model=finance.getFinanceState(cid);}catch(_){model=null;}
    const parent=model&&model.allocations&&model.allocations.interior;
    const envelope=num(parent&&parent.budgetUsd);
    if(!model||!parent||envelope===null||envelope<=0)
      return{available:false,reason:'HOME_BUDGET_ALLOCATION_UNAVAILABLE',countryId:cid,treasuryBalanceUsd:num(model&&model.treasuryBalanceUsd)};
    const rawState=suppliedState||getState(cid),plan=normalizeHomeBudgetPlan(rawState&&rawState.homeBudgetPlan);
    const treasury=getTreasury(cid),cash=num(model.treasuryBalanceUsd)!==null?Math.max(0,num(model.treasuryBalanceUsd)):treasury.available?Math.max(0,treasury.balance):null;
    const parentRemaining=Math.max(0,num(parent.remainingUsd)===null?envelope:num(parent.remainingUsd));
    const categories={};let plannedTotal=0,spentTotal=0;
    Object.keys(HOME_BUDGET_CATEGORIES).forEach(function(id){
      const spec=HOME_BUDGET_CATEGORIES[id],row=plan[id];
      const amount=row.mode==='amount'?row.value:envelope*row.value/100;
      const spent=currentFiscalLedgerSpend(model,id);
      const remaining=Math.max(0,amount-spent);
      categories[id]={id:id,label:spec.label,mode:row.mode,value:row.value,budgetUsd:amount,spentUsd:spent,remainingUsd:remaining,
        spendableUsd:Math.max(0,Math.min(remaining,parentRemaining,cash===null?0:cash))};
      plannedTotal+=amount;spentTotal+=spent;
    });
    const valid=plannedTotal<=envelope+0.01;
    return{available:true,valid:valid,canEdit:canEdit,readOnly:!canEdit,reason:valid?null:'HOME_BUDGET_PLAN_EXCEEDS_PARENT_ALLOCATION',
      countryId:cid,financeCountryCode:profile.countryCode||null,parentBudgetUsd:envelope,parentRemainingUsd:parentRemaining,
      treasuryBalanceUsd:cash,planTotalUsd:plannedTotal,unplannedBudgetUsd:Math.max(0,envelope-plannedTotal),
      spentThisYearUsd:spentTotal,categories:categories,revision:num(model.revision)||0,plan:plan};
  }
  function setHomeBudgetPlan(input,country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid);
    const current=getHomeBudgetSnapshot(cid,state);
    if(!current.available)return{ok:false,code:current.reason||'HOME_BUDGET_UNAVAILABLE',snapshot:current};
    if(current.canEdit===false)return{ok:false,code:'PLAYER_COUNTRY_SCOPE_VIOLATION',message:'Budget changes are restricted to the active player country.',snapshot:current};
    const nextPlan=normalizeHomeBudgetPlan(input);
    let total=0;
    Object.keys(HOME_BUDGET_CATEGORIES).forEach(function(id){
      const row=nextPlan[id];total+=row.mode==='amount'?row.value:current.parentBudgetUsd*row.value/100;
    });
    if(total>current.parentBudgetUsd+0.01)
      return{ok:false,code:'HOME_BUDGET_PLAN_EXCEEDS_PARENT_ALLOCATION',message:'Home Ministry sub-budgets cannot exceed the Finance Ministry interior allocation.',plannedUsd:total,parentBudgetUsd:current.parentBudgetUsd};
    for(const id of Object.keys(HOME_BUDGET_CATEGORIES)){
      const row=nextPlan[id],budget=row.mode==='amount'?row.value:current.parentBudgetUsd*row.value/100;
      if(budget+0.01<(current.categories[id].spentUsd||0))
        return{ok:false,code:'HOME_BUDGET_BELOW_SPENT',category:id,spentUsd:current.categories[id].spentUsd,budgetUsd:budget,
          message:'An allocation cannot be reduced below money already spent this fiscal year.'};
    }
    state.homeBudgetPlan=nextPlan;state.lastUpdatedTurn=turn();
    const committed=dispatchState(cid,state,'OMEGA_HOME_MINISTRY_BUDGET_PLAN_UPDATED');
    if(!committed.ok)return{ok:false,code:committed.reason||'STATE_COMMAND_FAILED'};
    return{ok:true,code:'HOME_BUDGET_PLAN_SAVED',snapshot:getHomeBudgetSnapshot(cid,state)};
  }
  function validateHomeBudgetExpense(country,amount,action,state,snapshot){
    const cost=Math.max(0,num(amount)||0);if(!cost)return{ok:true,amount:0};
    const snap=snapshot||getHomeBudgetSnapshot(country,state);
    if(!snap.available)return{ok:false,reason:snap.reason||'HOME_BUDGET_UNAVAILABLE',balance:snap.treasuryBalanceUsd,cost:cost};
    if(snap.canEdit===false)return{ok:false,reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',balance:snap.treasuryBalanceUsd,cost:cost};
    if(!snap.valid)return{ok:false,reason:'HOME_BUDGET_PLAN_EXCEEDS_PARENT_ALLOCATION',balance:snap.treasuryBalanceUsd,cost:cost};
    const category=homeBudgetCategory(action),row=snap.categories[category];
    if(!row)return{ok:false,reason:'HOME_BUDGET_CATEGORY_UNAVAILABLE',category:category,cost:cost};
    if(cost>row.remainingUsd+0.01)return{ok:false,reason:'HOME_BUDGET_CATEGORY_EXCEEDED',category:category,budgetRemaining:row.remainingUsd,balance:snap.treasuryBalanceUsd,cost:cost};
    if(cost>snap.parentRemainingUsd+0.01)return{ok:false,reason:'HOME_BUDGET_PARENT_EXCEEDED',balance:snap.parentRemainingUsd,cost:cost};
    if(snap.treasuryBalanceUsd===null)return{ok:false,reason:'TREASURY_DATA_UNAVAILABLE',cost:cost};
    if(cost>snap.treasuryBalanceUsd+0.01)return{ok:false,reason:'INSUFFICIENT_TREASURY',balance:snap.treasuryBalanceUsd,cost:cost};
    return{ok:true,category:category,financeType:HOME_BUDGET_CATEGORIES[category].financeType,snapshot:snap,amount:cost};
  }
  function debitTreasury(country,amount,action,planState){
    const cost=Math.max(0,num(amount)||0);if(!cost)return{ok:true,amount:0,previous:[]};
    const cid=normalizeCountry(country),finance=financeApi();
    if(finance&&typeof finance.applyAction==='function'){
      const check=validateHomeBudgetExpense(cid,cost,action,planState);
      if(!check.ok)return{ok:false,reason:check.reason,balance:check.balance,cost:cost,category:check.category,
        budgetRemaining:check.budgetRemaining,message:check.message};
      let result;
      try{result=finance.applyAction({type:'spend-budget',countryId:cid,department:'interior',amountUsd:cost,
        spendType:check.financeType,description:'OMEGA_HOME_BUDGET:'+check.category+'|'+String(action||'HOME_MINISTRY_DAILY_OPERATIONS')});}
      catch(error){return{ok:false,reason:'FINANCE_TRANSACTION_FAILED',message:String(error&&error.message||error),balance:check.snapshot.treasuryBalanceUsd,cost:cost};}
      if(!result||result.ok!==true)return{ok:false,reason:result&&result.code||'FINANCE_TRANSACTION_FAILED',
        balance:result&&result.treasuryBalanceUsd!==undefined?result.treasuryBalanceUsd:check.snapshot.treasuryBalanceUsd,cost:cost,category:check.category,
        message:result&&result.message};
      return{ok:true,amount:cost,financeTransaction:true,transactionId:result.transactionId||null,countryId:cid,
        category:check.category,previous:[]};
    }
    const records=treasuryRecords(cid);if(!records.length)return{ok:false,reason:'TREASURY_DATA_UNAVAILABLE'};
    const balance=num(records[0].row[records[0].key]);if(balance===null||balance<cost)return{ok:false,reason:'INSUFFICIENT_TREASURY',balance:balance};
    const mesh=interop(),root=rootState(),transactionalFinance=records[0].key==='available'&&root&&root.finance&&root.finance[cid]&&num(root.finance[cid].available)!==null&&mesh&&typeof mesh.dispatchCommand==='function'&&financeHandlerRegistered;
    if(transactionalFinance){
      const command=mesh.dispatchCommand('interior',FINANCE_CASH_COMMAND,cid,{delta:-cost,reason:'HOME_MINISTRY_POLICE_SPENDING'},{turn:turn(),commandType:FINANCE_CASH_COMMAND,correlationId:'POLICE-FINANCE-'+cid+'-'+turn()+'-'+Math.floor(simulationTimeMs())});
      if(!command||command.status!=='APPLIED')return{ok:false,reason:command&&command.result&&command.result.reason||command&&command.result&&command.result.error||'FINANCE_TRANSACTION_FAILED',balance:balance};
      try{if(typeof g.updateGlobalResourceHUD==='function')g.updateGlobalResourceHUD(cid);}catch(_){}
      return{ok:true,amount:cost,previous:[{remote:true,country:cid,amount:cost,expectedBalance:balance-cost}]};
    }
    const previous=records.map(e=>({row:e.row,key:e.key,value:e.row[e.key]}));
    records.forEach(e=>{const old=num(e.row[e.key]);if(old!==null)e.row[e.key]=Math.max(0,old-cost);});
    try{if(typeof g.updateGlobalResourceHUD==='function')g.updateGlobalResourceHUD(cid);}catch(_){}
    return{ok:true,amount:cost,previous:previous};
  }
  function refundTreasury(debit){
    if(debit&&Array.isArray(debit.financeTransactions)){
      for(let i=debit.financeTransactions.length-1;i>=0;i--)refundTreasury(debit.financeTransactions[i]);
      return;
    }
    if(debit&&debit.financeTransaction&&debit.transactionId){
      const finance=financeApi();
      if(finance&&typeof finance.applyAction==='function'){
        const result=finance.applyAction({type:'rollback-home-ministry-expense',countryId:debit.countryId,transactionId:debit.transactionId,
          description:'Rollback after Home Ministry state commit failure'});
        if(result&&result.ok)return;
        emit('OMEGA_HOME_POLICE_FINANCE_REFUND_FAILED',{countryId:debit.countryId,amount:debit.amount,reason:result&&result.code||'FINANCE_ROLLBACK_FAILED'});
        return;
      }
    }
    (debit&&debit.previous||[]).forEach(e=>{
      if(e.remote){
        const root=rootState(),row=root&&root.finance&&root.finance[e.country],current=row&&num(row.available);
        if(row&&current!==null&&current===e.expectedBalance){
          row.available=current+e.amount;
          try{if(typeof g.updateGlobalResourceHUD==='function')g.updateGlobalResourceHUD(e.country);}catch(_){}
          emit('OMEGA_HOME_POLICE_FINANCE_ROLLBACK',{countryId:e.country,amount:e.amount,reason:'INTERIOR_STATE_COMMIT_FAILED'});
        }else emit('OMEGA_HOME_POLICE_FINANCE_REFUND_FAILED',{countryId:e.country,amount:e.amount,reason:'FINANCE_BALANCE_CHANGED_BEFORE_ROLLBACK'});
      }else e.row[e.key]=e.value;
    });
  }
  function baseState(){const s=clone(DEFAULT_STATE);s.lastPayrollDay=Math.floor(simulationTimeMs()/DAY_MS);return s;}
  function mergeState(raw){
    const d=clone(DEFAULT_STATE);if(!raw||typeof raw!=='object')return baseState();
    const s=Object.assign(d,clone(raw));
    s.homeBudgetPlan=normalizeHomeBudgetPlan(raw.homeBudgetPlan);
    s.policeRules=Object.assign(clone(DEFAULT_POLICE_POLICY_STATE),raw.policeRules||{});
    s.policeRulebook=normalizePoliceRulebook(raw.policeRulebook);
    s.policeDepartments=normalizePoliceDepartmentPlan(raw.policeDepartments);
    s.policeCases=Array.isArray(raw.policeCases)?raw.policeCases.slice(-200).map(clone):[];
    s.nextPoliceCaseSequence=Math.max(1,Math.floor(num(raw.nextPoliceCaseSequence)||1));
    s.patrolPlan=normalizePatrolPlan(raw.patrolPlan);
    s.crimeBaseline=raw.crimeBaseline&&typeof raw.crimeBaseline==='object'?clone(raw.crimeBaseline):null;
    s.crimeModel=raw.crimeModel&&typeof raw.crimeModel==='object'?clone(raw.crimeModel):null;
    s.crimeHistory=Array.isArray(raw.crimeHistory)?raw.crimeHistory.slice(-90).map(clone):[];
    s.crimeAccumulator=raw.crimeAccumulator&&typeof raw.crimeAccumulator==='object'?Object.assign({},raw.crimeAccumulator):{};
    s.baselineVersion=Math.max(0,Math.floor(num(raw.baselineVersion)||0));
    s.dailySalaryPerOfficerUsd=num(raw.dailySalaryPerOfficerUsd);
    s.recruitmentFeePerOfficerUsd=num(raw.recruitmentFeePerOfficerUsd);
    s.fuelSupplyDays=clamp(num(raw.fuelSupplyDays)===null?14:num(raw.fuelSupplyDays),0,180);
    s.lastFuelSupplyPurchaseTurn=num(raw.lastFuelSupplyPurchaseTurn);
    s.publicSatisfaction=clamp(num(raw.publicSatisfaction)===null?num(s.policeTrust)||55:num(raw.publicSatisfaction),0,100);
    s.misconductRiskPct=clamp(num(raw.misconductRiskPct)===null?20:num(raw.misconductRiskPct),0,100);
    s.justiceBacklog=Math.max(0,num(raw.justiceBacklog)||0);s.privacyRiskPct=clamp(num(raw.privacyRiskPct)===null?20:num(raw.privacyRiskPct),0,100);
    s.baselinePolicePersonnel=num(raw.baselinePolicePersonnel);s.baselineFleetUnits=num(raw.baselineFleetUnits);s.baselineFleetReplacementValueUsd=Math.max(0,num(raw.baselineFleetReplacementValueUsd)||0);s.baselineSource=raw.baselineSource||null;
    s.lastCrimeSimulationDay=num(raw.lastCrimeSimulationDay);
    s.facilityLevels=Object.assign(clone(DEFAULT_STATE.facilityLevels),raw.facilityLevels||{});
    s.policeRecruitmentLevel=Math.max(1,Math.min(10,Math.floor(num(raw.policeRecruitmentLevel)||1)));
    s.recruitmentBaseFeePerOfficerUsd=num(raw.recruitmentBaseFeePerOfficerUsd);
    s.pendingCapabilityProjects=Array.isArray(raw.pendingCapabilityProjects)?raw.pendingCapabilityProjects.slice(-50).map(clone):[];
    s.completedCapabilityProjects=Array.isArray(raw.completedCapabilityProjects)?raw.completedCapabilityProjects.slice(-50).map(clone):[];
    s.tacticsResearched=Object.assign(clone(DEFAULT_STATE.tacticsResearched),raw.tacticsResearched||{});
    s.vehiclesOwned=Object.assign({},raw.vehiclesOwned||{});s.agentDeployments=Object.assign({},raw.agentDeployments||{});s.intelligenceReports=Array.isArray(raw.intelligenceReports)?raw.intelligenceReports.slice(-100).map(clone):[];s.incidentLedger=Array.isArray(raw.incidentLedger)?raw.incidentLedger.slice(-100).map(clone):[];s.guardDeployments=Array.isArray(raw.guardDeployments)?raw.guardDeployments.filter(x=>x&&typeof x==='object'&&x.id&&x.vehicleLevel&&x.missionId).map(clone):[];if(!Number.isFinite(Number(s.nextGuardDeploymentId))||Number(s.nextGuardDeploymentId)<1)s.nextGuardDeploymentId=1;s.vehicleFleet=Array.isArray(raw.vehicleFleet)?raw.vehicleFleet.filter(x=>x&&typeof x==='object'&&x.id&&x.vehicleLevel).map(clone):[];if(!Number.isFinite(Number(s.nextVehicleUnitId))||Number(s.nextVehicleUnitId)<1)s.nextVehicleUnitId=1;s.vehicleMaintenanceLog=Array.isArray(raw.vehicleMaintenanceLog)?raw.vehicleMaintenanceLog.slice(-100).map(clone):[];
    if(num(s.policeCount)===null)s.policeCount=250;if(num(s.policeEfficiency)===null)s.policeEfficiency=60;if(num(s.policeTrust)===null)s.policeTrust=55;
    if(num(s.unlockedVehicleLevel)===null)s.unlockedVehicleLevel=1;return s;
  }
  function storedState(country){const root=rootState(),raw=root&&root.interior&&root.interior[country]&&root.interior[country].police;return raw&&typeof raw==='object'?mergeState(raw):null;}
  function publicState(s){return{policeCount:s.policeCount,policeEfficiency:s.policeEfficiency,policeTrust:s.policeTrust,trainingQualityLevel:s.trainingQualityLevel,policeRecruitmentLevel:s.policeRecruitmentLevel,recruitmentFeePerOfficerUsd:s.recruitmentFeePerOfficerUsd,facilityLevels:clone(s.facilityLevels),pendingCapabilityProjects:clone(s.pendingCapabilityProjects||[]),completedCapabilityProjects:clone(s.completedCapabilityProjects||[]),unlockedVehicleLevel:s.unlockedVehicleLevel,vehiclesOwned:clone(s.vehiclesOwned),pendingVehicleOrder:clone(s.pendingVehicleOrder),fuelSupplyDays:clamp(num(s.fuelSupplyDays)===null?14:num(s.fuelSupplyDays),0,180),lastFuelSupplyPurchaseTurn:s.lastFuelSupplyPurchaseTurn,homeBudgetPlan:clone(normalizeHomeBudgetPlan(s.homeBudgetPlan)),baselineVersion:s.baselineVersion,baselinePolicePersonnel:s.baselinePolicePersonnel,baselineFleetUnits:s.baselineFleetUnits,baselineFleetReplacementValueUsd:s.baselineFleetReplacementValueUsd,dailySalaryPerOfficerUsd:s.dailySalaryPerOfficerUsd,recruitmentFeePerOfficerUsd:s.recruitmentFeePerOfficerUsd,crimeBaseline:clone(s.crimeBaseline),crimeModel:clone(s.crimeModel),crimeHistory:clone(s.crimeHistory),policeRules:clone(s.policeRules),policeRulebook:clone(normalizePoliceRulebook(s.policeRulebook)),policeDepartments:clone(normalizePoliceDepartmentPlan(s.policeDepartments)),policeCases:clone((s.policeCases||[]).slice(-200)),nextPoliceCaseSequence:Math.max(1,Math.floor(num(s.nextPoliceCaseSequence)||1)),patrolPlan:clone(s.patrolPlan),publicSatisfaction:s.publicSatisfaction,misconductRiskPct:s.misconductRiskPct,justiceBacklog:s.justiceBacklog,privacyRiskPct:s.privacyRiskPct,facilityLevels:clone(s.facilityLevels),trainingQualityLevel:s.trainingQualityLevel,tacticsResearched:clone(s.tacticsResearched),pendingResearch:clone(s.pendingResearch),specialAgents:s.specialAgents,sabotageRisk:s.sabotageRisk,unpaidPayroll:s.unpaidPayroll,agentDeployments:clone(s.agentDeployments),intelligenceReports:clone(s.intelligenceReports),incidentLedger:clone(s.incidentLedger),guardDeployments:clone(s.guardDeployments),nextGuardDeploymentId:s.nextGuardDeploymentId,vehicleFleet:clone(s.vehicleFleet),nextVehicleUnitId:s.nextVehicleUnitId,vehicleMaintenanceLog:clone(s.vehicleMaintenanceLog),lastFleetSimulationDay:s.lastFleetSimulationDay};}
  function emit(type,detail){try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:clone(detail||{})}));}catch(_){}}
  function dispatchState(country,next,eventName){
    const mesh=interop();
    if(mesh&&typeof mesh.dispatchCommand==='function'&&handlerRegistered){
      const row=mesh.dispatchCommand('interior',STATE_COMMAND,country,{state:clone(next)},{turn:turn(),commandType:STATE_COMMAND,correlationId:'POLICE-'+country+'-'+turn()+'-'+(eventName||'UPDATE')});
      if(row&&row.status==='APPLIED'){emit(eventName||'OMEGA_HOME_POLICE_STATE_CHANGED',{countryId:country,state:publicState(next),turn:turn()});return{ok:true,status:row.status};}
      return{ok:false,status:row&&row.status||'FAILED',reason:row&&row.result&&row.result.error||'STATE_COMMAND_FAILED'};
    }
    const root=rootState();if(!root)return{ok:false,reason:'AUTHORITATIVE_GAME_STATE_UNAVAILABLE'};
    if(!root.interior||typeof root.interior!=='object')root.interior={};if(!root.interior[country]||typeof root.interior[country]!=='object')root.interior[country]={};
    root.interior[country].police=clone(next);emit(eventName||'OMEGA_HOME_POLICE_STATE_CHANGED',{countryId:country,state:publicState(next),turn:turn()});return{ok:true,status:'DIRECT_STATE_WRITE'};
  }
  function getState(country){
    const cid=normalizeCountry(country||currentCountry());if(!cid)return baseState();
    const existing=storedState(cid);
    if(existing){
      if(ensureFleetInventory(existing,cid))dispatchState(cid,existing,'OMEGA_HOME_POLICE_FLEET_MIGRATED');
      return existing;
    }
    const initial=baseState();ensureFleetInventory(initial,cid);
    dispatchState(cid,initial,'OMEGA_HOME_MINISTRY_INITIALIZED');return initial;
  }
  function money(value){const format=g.OmegaNumberFormat;return format&&typeof format.money==='function'?format.money(value,{unavailable:'Unavailable'}):(num(value)===null?'Unavailable':'$'+Math.round(num(value)).toLocaleString('en-US'));}
  function mutation(country,cost,action,mutator){
    const cid=normalizeCountry(country||currentCountry());if(!cid)return{ok:false,reason:'PLAYER_COUNTRY_UNAVAILABLE'};
    if(!isPlayerCountry(cid))return{ok:false,reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:cid};
    const amount=Math.max(0,num(cost)||0),state=getState(cid),next=clone(state),result=mutator(next);
    if(result&&result.ok===false)return Object.assign({ok:false},result);
    const debit=debitTreasury(cid,amount,action,state);if(!debit.ok)return{ok:false,reason:debit.reason,balance:debit.balance,cost:amount,category:debit.category,budgetRemaining:debit.budgetRemaining,message:debit.message};
    next.lastUpdatedTurn=turn();const commit=dispatchState(cid,next,'OMEGA_HOME_MINISTRY_TRANSACTION');
    if(!commit.ok){refundTreasury(debit);return{ok:false,reason:commit.reason||'STATE_COMMIT_FAILED'};}
    try{if(typeof g.updateGlobalResourceHUD==='function')g.updateGlobalResourceHUD(cid);}catch(_){}
    emit('OMEGA_HOME_POLICE_ACTION_COMPLETED',{countryId:cid,action:action,cost:amount,treasury:getTreasury(cid),state:publicState(next),turn:turn()});
    return Object.assign({ok:true,countryId:cid,cost:amount,state:next,treasury:getTreasury(cid)},result&&typeof result==='object'?result:{});
  }
  function population(country){
    for(const root of [g.Game&&g.Game.state,g.gameState].filter(Boolean)){
      const p=root&&root.population&&root.population[country];if(!p||typeof p!=='object')continue;
      for(const k of ['population','population_2015','total','totalPopulation','people']){const n=num(p[k]);if(n!==null&&n>0)return n;}
    }return null;
  }
  function estimateFacilityCostFrom(s,id,amount){
    const f=FACILITIES.find(x=>x.id===id),qty=Math.floor(num(amount)||0);if(!f||qty<=0)return 0;
    let total=0,level=Math.max(0,Math.floor(num(s.facilityLevels[id])||0));for(let i=0;i<qty;i++)total+=f.baseCost*Math.max(1,level+i);return total;
  }
  function estimateTrainingCostFrom(s,target){
    const t=Math.floor(num(target)||0);if(t<=s.trainingQualityLevel)return 0;let total=0;for(let l=s.trainingQualityLevel;l<t;l++)total+=25000*l;return total;
  }
  function advice(kind,payload,country){
    const cid=normalizeCountry(country||currentCountry()),s=getState(cid),t=getTreasury(cid),balance=t.available?t.balance:null,d=payload||{};
    if(kind==='recruit'){
      const pop=population(cid),target=pop?clamp(Math.ceil(pop/10000),s.policeCount,1000000):s.policeCount+Math.max(25,Math.ceil(s.policeCount*0.1));
      const needed=Math.max(0,target-s.policeCount),afford=balance===null?0:Math.floor(balance/POLICE_RECRUITMENT_COST),amount=Math.min(needed||Math.max(10,Math.ceil(s.policeCount*0.05)),afford,5000);
      return{kind:kind,amount:Math.max(0,amount),upfrontCost:Math.max(0,amount)*POLICE_RECRUITMENT_COST,dailyCost:Math.max(0,amount)*POLICE_SALARY_PER_DAY,currentCount:s.policeCount,targetCount:target,treasury:balance,text:balance===null?'Treasury data is unavailable. No hiring budget can be certified.':amount<=0?'Treasury cannot cover one recruit or the recorded staffing target is already met.':'Minister recommendation: recruit '+amount.toLocaleString()+' officers. Upfront cost '+money(amount*POLICE_RECRUITMENT_COST)+'; additional daily payroll '+money(amount*POLICE_SALARY_PER_DAY)+'. Estimated staffing target: '+target.toLocaleString()+'.'};
    }
    if(kind==='fire'){
      const requested=Math.max(0,Math.floor(num(d.amount)||0)),target=Math.max(1,Math.ceil(s.policeCount*0.05)),amount=Math.min(Math.max(1,s.policeCount-1),requested||target);
      return{kind:kind,amount:amount,dailySavings:amount*POLICE_SALARY_PER_DAY,text:'Minister recommendation: consider releasing '+amount.toLocaleString()+' officers only if response coverage remains adequate. Estimated daily payroll saving: '+money(amount*POLICE_SALARY_PER_DAY)+'. Dismissal has no upfront cost.'};
    }
    if(kind==='vehicle'){
      const level=Math.floor(num(d.level)||s.unlockedVehicleLevel),v=VEHICLES.find(x=>x.level===level);if(!v)return{kind:kind,amount:0,text:'Selected vehicle tier is invalid.'};
      const afford=balance===null?0:Math.floor(balance/v.cost),amount=Math.max(0,Math.min(afford,10));
      return{kind:kind,amount:amount,cost:amount*v.cost,level:level,text:level>s.unlockedVehicleLevel?'Only tiers through Tier '+s.unlockedVehicleLevel+' are currently unlocked. Higher tiers unlock in sequence after delivery.':amount<1?'Treasury cannot cover one vehicle or verified treasury data is unavailable.':'Minister recommendation: order '+amount+' × '+v.name+'. Procurement cost: '+money(amount*v.cost)+'. Delivery takes 180 simulation days.'};
    }
    if(kind==='facility'){
      const id=String(d.id||'station'),f=FACILITIES.find(x=>x.id===id);if(!f)return{kind:kind,amount:0,text:'Selected facility is unavailable.'};
      const afford=balance===null?0:Math.floor(balance/f.baseCost),amount=Math.max(0,Math.min(afford,3)),cost=estimateFacilityCostFrom(s,id,amount);
      return{kind:kind,amount:amount,cost:cost,id:id,text:amount<1?'Treasury cannot cover the next level of this facility, or treasury data is unavailable.':'Minister recommendation: build '+amount+' level(s) of '+f.name+'. Estimated total cost: '+money(cost)+'.'};
    }
    if(kind==='training'){
      const requested=Math.max(s.trainingQualityLevel,Math.floor(num(d.target)||s.trainingQualityLevel+1)),cap=s.facilityLevels.academy||0,target=Math.min(requested,cap),cost=estimateTrainingCostFrom(s,target);
      return{kind:kind,target:target,cap:cap,cost:cost,text:target<=s.trainingQualityLevel?'Upgrade the Police Academy first. Training quality cannot exceed academy level.':target<requested?'Training target capped at Academy Level '+cap+'. Estimated cost: '+money(cost)+'.':'Minister recommendation: raise training quality to Level '+target+'. Estimated cost: '+money(cost)+'.'};
    }
    if(kind==='specialAgents'){
      const afford=balance===null?0:Math.floor(balance/AGENT_RECRUITMENT_COST),amount=Math.max(0,Math.min(afford,3));
      return{kind:kind,amount:amount,cost:amount*AGENT_RECRUITMENT_COST,dailyCost:amount*AGENT_SALARY_PER_DAY,text:amount<1?'Treasury cannot cover one agent or treasury data is unavailable.':'Minister recommendation: recruit '+amount+' intelligence agent(s). Cost: '+money(amount*AGENT_RECRUITMENT_COST)+'; additional daily operating cost: '+money(amount*AGENT_SALARY_PER_DAY)+'.'};
    }
    return{kind:kind,amount:0,text:'No recommendation is available for this request.'};
  }
  function orderVehicle(level,quantity,country){
    const tier=Math.floor(num(level)||0),qty=Math.floor(num(quantity)||0),cid=normalizeCountry(country||currentCountry()),v=VEHICLES.find(x=>x.level===tier);
    if(!v)return{ok:false,reason:'VEHICLE_TIER_INVALID'};if(qty<1||qty>100)return{ok:false,reason:'VEHICLE_QUANTITY_INVALID',message:'Quantity must be between 1 and 100.'};
    const s=getState(cid);if(s.pendingVehicleOrder)return{ok:false,reason:'PROCUREMENT_ALREADY_IN_PROGRESS',pending:s.pendingVehicleOrder};
    if(tier>s.unlockedVehicleLevel)return{ok:false,reason:'VEHICLE_TIER_LOCKED',unlockedVehicleLevel:s.unlockedVehicleLevel};
    const cost=v.cost*qty;return mutation(cid,cost,'VEHICLE_ORDER',function(next){const now=simulationTimeMs();next.pendingVehicleOrder={level:tier,quantity:qty,totalCost:cost,orderedAtTurn:turn(),startedAtMs:now,completesAtMs:now+VEHICLE_UNLOCK_MS,durationMs:VEHICLE_UNLOCK_MS,status:'IN_TRANSIT'};return{amount:qty,vehicle:v.name,estimatedDeliveryMs:now+VEHICLE_UNLOCK_MS,totalCost:cost};});
  }
  function fleetUnitStatus(unit){
    if(!unit||Number(unit.condition)<=15)return 'REPAIR_REQUIRED';
    if(Number(unit.odometerKm||0)>=Number(unit.nextServiceAtKm||5000))return 'MAINTENANCE_DUE';
    return 'AVAILABLE';
  }
  function ensureFleetInventory(state,country){
    let changed=false;
    if(!Array.isArray(state.vehicleFleet)){state.vehicleFleet=[];changed=true;}
    if(!Number.isFinite(Number(state.nextVehicleUnitId))||Number(state.nextVehicleUnitId)<1){state.nextVehicleUnitId=1;changed=true;}
    state.vehiclesOwned=state.vehiclesOwned&&typeof state.vehiclesOwned==='object'?state.vehiclesOwned:{};
    VEHICLES.forEach(function(vehicle){
      const tier=String(vehicle.level);
      let have=state.vehicleFleet.filter(function(unit){return Number(unit.vehicleLevel)===vehicle.level;}).length;
      let owned=Math.max(0,Math.floor(num(state.vehiclesOwned[tier])||0));
      if(owned<have){state.vehiclesOwned[tier]=have;owned=have;changed=true;}
      while(have<owned){
        const seq=state.nextVehicleUnitId++;
        state.vehicleFleet.push({id:String(country||'COUNTRY')+'-POLICE-'+String(vehicle.level).padStart(2,'0')+'-'+String(seq).padStart(5,'0'),vehicleLevel:vehicle.level,condition:100,odometerKm:0,nextServiceAtKm:5000,status:'AVAILABLE',acquiredAtTurn:turn(),acquiredAtSimulationMs:simulationTimeMs(),lastEnvironment:null,lastRoadCondition:null,lastMaintenanceSimulationDay:Math.floor(simulationTimeMs()/DAY_MS),maintenanceEvents:0});
        have++;changed=true;
      }
    });
    const claimed=new Set();
    state.guardDeployments=Array.isArray(state.guardDeployments)?state.guardDeployments:[];
    state.guardDeployments.forEach(function(deployment){
      if(!Array.isArray(deployment.vehicleIds)){deployment.vehicleIds=[];changed=true;}
      const vehicle=VEHICLES.find(function(v){return v.level===Number(deployment.vehicleLevel);});
      if(!vehicle)return;
      deployment.vehicleIds=deployment.vehicleIds.filter(function(id){return state.vehicleFleet.some(function(unit){return unit.id===id&&Number(unit.vehicleLevel)===vehicle.level;})&&!claimed.has(id);});
      deployment.vehicleIds.forEach(function(id){claimed.add(id);});
      const needed=Math.max(0,Math.floor(num(deployment.quantity)||0))-deployment.vehicleIds.length;
      if(needed>0){
        const available=state.vehicleFleet.filter(function(unit){return Number(unit.vehicleLevel)===vehicle.level&&!claimed.has(unit.id)&&Number(unit.condition)>15&&Number(unit.odometerKm||0)<Number(unit.nextServiceAtKm||5000);}).slice().sort(function(a,b){return(Number(b.condition)||0)-(Number(a.condition)||0);});
        available.slice(0,needed).forEach(function(unit){deployment.vehicleIds.push(unit.id);claimed.add(unit.id);changed=true;});
      }
      if(deployment.vehicleIds.length!==Math.max(0,Math.floor(num(deployment.quantity)||0))){
        deployment.quantity=deployment.vehicleIds.length;deployment.officers=deployment.quantity*vehicle.capacity;changed=true;
      }
    });
    state.vehicleFleet.forEach(function(unit){
      if(claimed.has(unit.id)){
        if(unit.status!=='DEPLOYED'&&Number(unit.condition)>15&&Number(unit.odometerKm||0)<Number(unit.nextServiceAtKm||5000)){unit.status='DEPLOYED';changed=true;}
        return;
      }
      if(unit.status==='DEPLOYED'){unit.status=fleetUnitStatus(unit);changed=true;}
      else if(unit.status==='AVAILABLE'){
        const next=fleetUnitStatus(unit);if(next!=='AVAILABLE'){unit.status=next;changed=true;}
      }
    });
    if(state.vehicleFleet.length&&state.nextVehicleUnitId<=state.vehicleFleet.length)state.nextVehicleUnitId=state.vehicleFleet.length+1;
    return changed;
  }
  function environmentSpec(environmentId){
    return OPERATING_ENVIRONMENTS.find(function(row){return row.id===String(environmentId||'');})||OPERATING_ENVIRONMENTS[0];
  }
  function roadSpec(roadId){
    return ROAD_CONDITIONS.find(function(row){return row.id===String(roadId||'');})||ROAD_CONDITIONS[0];
  }
  function vehicleUseAssessment(vehicleLevel,environmentId,roadCondition,country){
    const cid=normalizeCountry(country||currentCountry()),vehicle=VEHICLES.find(function(row){return row.level===Math.floor(num(vehicleLevel)||0);});
    const environment=environmentSpec(environmentId),road=roadSpec(roadCondition);
    if(!vehicle)return{ok:false,reason:'VEHICLE_TIER_INVALID',environment:clone(environment),road:clone(road),fit:0,baseFit:0,wearPerDay:0,damageRisk:0,penalties:[]};
    const baseFit=Number(vehicle.environmentFit[environment.id])||0,penalties=[],countryProfile=getCountryOperatingProfile(cid);
    let fit=baseFit*road.fitMultiplier;
    const roadQuality=clamp(Number(countryProfile.roadQualityIndex)||50,10,92);
    const mountainIndex=clamp(Number(countryProfile.mountainTerrainIndex)||0,0,100);
    const coastalIndex=clamp(Number(countryProfile.coastalLogisticsIndex)||0,0,100);
    const urbanComplexity=clamp(Number(countryProfile.urbanComplexityIndex)||Number(countryProfile.urbanizationPct)||40,0,100);
    if((road.id==='rough'||road.id==='muddy')&&roadQuality<42){
      const roadPenalty=(42-roadQuality)*0.18*(Number(vehicle.capabilities.offRoad)<45?1.3:0.35);
      fit-=roadPenalty;penalties.push('Country road-quality profile adds '+roadPenalty.toFixed(1)+' fit points of exposure.');
    }
    if(environment.id==='city'&&urbanComplexity>60&&vehicle.capacity>=10){
      const trafficPenalty=(urbanComplexity-60)*0.12;fit-=trafficPenalty;penalties.push('Dense city network penalises large transport vehicles by '+trafficPenalty.toFixed(1)+' fit points.');
    }
    if(environment.id==='mountain'&&mountainIndex>=45&&Number(vehicle.capabilities.offRoad)>=65){
      fit+=Math.min(5,(mountainIndex-45)*0.09);penalties.push('Country terrain context rewards higher off-road capability.');
    }
    if(environment.id==='border'&&Number(countryProfile.remoteCoverageIndex)>=60&&Number(vehicle.capabilities.offRoad)<55){
      fit-=Math.min(7,(Number(countryProfile.remoteCoverageIndex)-60)*0.18);penalties.push('Remote coverage context increases the penalty for weak all-terrain capability.');
    }
    if(environment.id==='coastal'&&road.id==='wet'&&coastalIndex>=60&&Number(vehicle.durability)<75){
      const corrosionPenalty=Math.min(7,(coastalIndex-50)*0.08);fit-=corrosionPenalty;penalties.push('Country coastal exposure increases corrosion and electrical-service risk.');
    }
    if(environment.id==='city'&&road.id==='congested'&&vehicle.capacity>=12){fit-=12;penalties.push('Vehicle is too large for dense urban turns and curb access.');}
    if(environment.id==='city'&&road.id==='congested'&&vehicle.speed>=165){fit-=10;penalties.push('High-speed performance is wasted in traffic; low-speed manoeuvring risk rises.');}
    if(environment.id==='mountain'&&vehicle.speed>=165){fit-=8;penalties.push('High power and speed require extra brake and tyre control on steep bends.');}
    if((environment.id==='border'||environment.id==='mountain'||road.id==='muddy'||road.id==='rough')&&(Number(vehicle.capabilities.offRoad)||0)<45){fit-=14;penalties.push('Low off-road capability increases traction and underbody damage risk.');}
    if(environment.id==='coastal'&&road.id==='wet'&&(Number(vehicle.durability)||0)<65){fit-=6;penalties.push('Limited weather protection increases corrosion and electrical-maintenance exposure.');}
    fit=Math.round(clamp(fit,0,100));
    const roadWear={smooth:0,congested:0.07,wet:0.05,rough:0.13,muddy:0.20}[road.id]||0;
    const missionOverhead=0.025,fragility=Math.max(0,70-vehicle.durability)*0.001;
    const terrainWearMultiplier=1+Math.max(0,50-roadQuality)*0.002+mountainIndex*0.0008+coastalIndex*0.00035+Number(countryProfile.remoteCoverageIndex||0)*0.00025;
    const wearPerDay=Number(((0.035+Math.max(0,70-fit)*0.004+roadWear+missionOverhead+fragility)*terrainWearMultiplier).toFixed(4));
    const distanceMultiplier={smooth:1,congested:0.58,wet:0.78,rough:0.52,muddy:0.34}[road.id]||1;
    const dailyDistance=Math.round((environment.id==='highway'?180:environment.id==='border'?135:environment.id==='mountain'?70:environment.id==='rural'?105:environment.id==='coastal'?85:90)*distanceMultiplier);
    const damageRisk=Number((road.damageRisk*(1+Math.max(0,60-fit)/70+Math.max(0,80-vehicle.durability)/160)).toFixed(2));
    const status=fit>=80?'OPTIMAL':fit>=60?'SUITABLE':fit>=40?'STRAINED':'POOR FIT';
    return{ok:true,vehicleId:vehicle.id,vehicleName:vehicle.name,environment:clone(environment),road:clone(road),baseFit:baseFit,fit:fit,status:status,wearPerDay:wearPerDay,dailyDistanceKm:dailyDistance,damageRisk:damageRisk,penalties:penalties,summary:fit>=80?'Well-matched platform; normal wear for this route.':fit>=60?'Usable deployment with manageable handling and maintenance trade-offs.':fit>=40?'Poor route fit. Expect slower response, higher wear and more maintenance.':'Unsuitable match. The route can be completed, but performance loss and damage risk are high.'};
  }
  function fleetUnitsForTier(state,level){
    return (state.vehicleFleet||[]).filter(function(unit){return Number(unit.vehicleLevel)===Number(level);});
  }
  function availableFleetUnits(state,level){
    return fleetUnitsForTier(state,level).filter(function(unit){return unit.status==='AVAILABLE'&&Number(unit.condition)>15&&Number(unit.odometerKm||0)<Number(unit.nextServiceAtKm||5000);});
  }
  function vehicleFleetSummary(country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid);
    return state.vehicleFleet.map(function(unit){
      const vehicle=VEHICLES.find(function(row){return row.level===Number(unit.vehicleLevel);});
      const deployment=(state.guardDeployments||[]).find(function(row){return Array.isArray(row.vehicleIds)&&row.vehicleIds.includes(unit.id);});
      const assessment=deployment?vehicleUseAssessment(unit.vehicleLevel,deployment.environmentId,deployment.roadCondition,cid):null;
      return Object.assign(clone(unit),{vehicleName:vehicle&&vehicle.name||'Unknown vehicle',className:vehicle&&vehicle.className||'Unknown class',purchaseCost:vehicle&&vehicle.cost||0,maintenancePerDay:vehicle&&vehicle.maintenancePerDay||0,deploymentId:deployment&&deployment.id||null,deploymentMission:deployment&&deployment.missionId||null,sector:deployment&&deployment.sector||null,environmentAssessment:assessment,repairEstimate:estimateVehicleRepairCost(unit),maxCondition:100});
    });
  }
  function estimateVehicleRepairCost(unit){
    const vehicle=unit&&VEHICLES.find(function(row){return row.level===Number(unit.vehicleLevel);});
    if(!vehicle)return 0;
    const health=clamp(num(unit.condition)===null?100:num(unit.condition),0,100);
    const serviceDue=Number(unit.odometerKm||0)>=Number(unit.nextServiceAtKm||5000);
    const deterioration=vehicle.cost*Math.max(0,100-health)/100*0.22;
    const service=serviceDue?vehicle.maintenancePerDay*18:0;
    return Math.round(Math.max(vehicle.cost*0.025,deterioration+service));
  }
  function deploymentEffectiveness(state,deployment,country){
    const vehicle=VEHICLES.find(function(row){return row.level===Number(deployment.vehicleLevel);});
    const base=guardEffectiveness(deployment.vehicleLevel,deployment.missionId,state);
    const units=(deployment.vehicleIds||[]).map(function(id){return(state.vehicleFleet||[]).find(function(row){return row.id===id;});}).filter(Boolean);
    const health=units.length?units.reduce(function(total,unit){return total+clamp(Number(unit.condition)||0,0,100);},0)/units.length:100;
    const use=vehicleUseAssessment(deployment.vehicleLevel,deployment.environmentId,deployment.roadCondition,country||currentCountry());
    return Math.round(clamp(base*(0.55+0.0045*use.fit)*(0.35+0.0065*health),0,100));
  }
  function guardOfficerCount(state){
    return (state.guardDeployments||[]).reduce(function(total,unit){return total+Math.max(0,Math.floor(num(unit.officers)||0));},0);
  }
  function guardVehicleCount(state,level){
    return (state.guardDeployments||[]).reduce(function(total,unit){return total+(Number(unit.vehicleLevel)===Number(level)?Math.max(0,Math.floor(num(unit.quantity)||0)):0);},0);
  }
  function guardEffectiveness(vehicleLevel,missionId,state){
    const vehicle=VEHICLES.find(function(row){return row.level===Math.floor(num(vehicleLevel)||0);});
    const mission=GUARD_MISSIONS.find(function(row){return row.id===String(missionId||'');});
    if(!vehicle||!mission)return 0;
    let weighted=0,weightTotal=0;
    Object.keys(mission.weights).forEach(function(key){const weight=mission.weights[key];weighted+=(Number(vehicle.capabilities[key])||0)*weight;weightTotal+=weight;});
    const core=weightTotal?weighted/weightTotal:0;
    const trainingBoost=Math.min(10,Math.max(0,Number(state.trainingQualityLevel)||1)*1.7);
    const facilityBoost=Math.min(8,((Number(state.facilityLevels.station)||0)+(Number(state.facilityLevels.patrol)||0)+(Number(state.facilityLevels.dispatch)||0))*1.15);
    const tacticBoost=(mission.id==='public_order'&&state.tacticsResearched.antiRiot?6:0)+
      (mission.id==='border_interdiction'&&state.tacticsResearched.smugglerInterdict?6:0)+
      (mission.id==='industrial_guard'&&state.tacticsResearched.assetProtection?7:0)+
      ((mission.id==='rapid_response'||mission.id==='vip_escort')&&state.tacticsResearched.counterTerror?4:0)+
      (state.tacticsResearched.intelligenceFusion?3:0);
    return Math.round(clamp(core+trainingBoost+facilityBoost+tacticBoost,0,100));
  }
  function guardCoverageForIncident(state,incidentType,targetAssetId){
    let coverage=0;
    (state.guardDeployments||[]).forEach(function(unit){
      const mission=GUARD_MISSIONS.find(function(row){return row.id===unit.missionId;});
      const vehicle=VEHICLES.find(function(row){return row.level===Number(unit.vehicleLevel);});
      if(!mission||!vehicle||!mission.coverageTypes.includes(incidentType))return;
      if(unit.assetId&&String(unit.assetId)!==String(targetAssetId||''))return;
      const rating=deploymentEffectiveness(state,unit,currentCountry());
      coverage+=(rating*Math.max(0,Number(unit.quantity)||0))*(mission.id==='urban_patrol'&&incidentType!=='CIVIL_UNREST'?0.55:1)/7;
    });
    return Math.round(clamp(coverage,0,35));
  }
  function guardCapacity(country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),ownedVehicles={},deployedVehicles={},repairRequired={},maintenanceDue={};
    VEHICLES.forEach(function(vehicle){
      ownedVehicles[vehicle.level]=fleetUnitsForTier(state,vehicle.level).length;
      deployedVehicles[vehicle.level]=guardVehicleCount(state,vehicle.level);
      repairRequired[vehicle.level]=fleetUnitsForTier(state,vehicle.level).filter(function(unit){return unit.status==='REPAIR_REQUIRED';}).length;
      maintenanceDue[vehicle.level]=fleetUnitsForTier(state,vehicle.level).filter(function(unit){return unit.status==='MAINTENANCE_DUE';}).length;
    });
    const availableVehicles={};
    VEHICLES.forEach(function(vehicle){availableVehicles[vehicle.level]=availableFleetUnits(state,vehicle.level).length;});
    return {policeCount:state.policeCount,deployedOfficers:guardOfficerCount(state),availableOfficers:Math.max(0,state.policeCount-guardOfficerCount(state)),ownedVehicles:ownedVehicles,deployedVehicles:deployedVehicles,availableVehicles:availableVehicles,repairRequired:repairRequired,maintenanceDue:maintenanceDue};
  }
  function guardPreview(vehicleLevel,missionId,quantity,country,environmentId,roadCondition){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),vehicle=VEHICLES.find(function(row){return row.level===Math.floor(num(vehicleLevel)||0);});
    const mission=GUARD_MISSIONS.find(function(row){return row.id===String(missionId||'');});
    const requested=Math.floor(num(quantity)||0),capacity=guardCapacity(cid),availableVehicles=capacity.availableVehicles[vehicleLevel]||0,count=vehicle&&mission?requested:0;
    const environment=vehicle?vehicleUseAssessment(vehicle.level,environmentId,roadCondition,cid):null;
    const candidateUnits=vehicle?availableFleetUnits(state,vehicle.level).slice().sort(function(a,b){return(Number(b.condition)||0)-(Number(a.condition)||0);}).slice(0,Math.max(0,count)):[];
    const health=candidateUnits.length?candidateUnits.reduce(function(total,unit){return total+Number(unit.condition||0);},0)/candidateUnits.length:100;
    const baseScore=vehicle&&mission?guardEffectiveness(vehicle.level,mission.id,state):0;
    const score=vehicle&&mission&&environment?Math.round(clamp(baseScore*(0.55+0.0045*environment.fit)*(0.35+0.0065*health),0,100)):0;
    const wearForecast=environment?Number((environment.wearPerDay*30).toFixed(1)):0;
    return {ok:Boolean(vehicle&&mission&&environment&&count>=1&&count<=100&&count<=availableVehicles&&count*vehicle.capacity<=capacity.availableOfficers),vehicle:vehicle?clone(vehicle):null,mission:mission?clone(mission):null,quantity:count,availableVehicles:availableVehicles,requiredOfficers:vehicle&&count>0?count*vehicle.capacity:0,availableOfficers:capacity.availableOfficers,effectiveness:score,baseEffectiveness:baseScore,estimatedCoverage:vehicle&&mission?Math.round(clamp(score*Math.max(0,count)/7,0,35)):0,environment:environment,estimatedConditionLoss30Days:wearForecast,estimatedMaintenanceExposure:environment?environment.damageRisk:null,reason:!vehicle?'VEHICLE_TIER_INVALID':!mission?'GUARD_MISSION_INVALID':count<1||count>100?'GUARD_QUANTITY_INVALID':count>availableVehicles?'INSUFFICIENT_UNASSIGNED_VEHICLES':count*vehicle.capacity>capacity.availableOfficers?'INSUFFICIENT_UNASSIGNED_OFFICERS':null};
  }
  function vehicleRecommendations(missionId,environmentId,roadCondition,quantity,country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),mission=GUARD_MISSIONS.find(function(row){return row.id===String(missionId||'');});
    if(!mission)return [];
    const environment=environmentSpec(environmentId),road=roadSpec(roadCondition),requested=Math.max(1,Math.min(100,Math.floor(num(quantity)||1)));
    const freeOfficers=Math.max(0,state.policeCount-guardOfficerCount(state)),candidates=[];
    VEHICLES.forEach(function(vehicle){
      if(vehicle.level>state.unlockedVehicleLevel)return;
      const ready=availableFleetUnits(state,vehicle.level).slice().sort(function(a,b){return(Number(b.condition)||0)-(Number(a.condition)||0);});
      if(!ready.length)return;
      const environmentAssessment=vehicleUseAssessment(vehicle.level,environment.id,road.id,cid);
      if(environmentAssessment.fit<20)return;
      const units=ready.slice(0,Math.min(requested,ready.length,Math.floor(freeOfficers/vehicle.capacity)));
      if(!units.length)return;
      const health=units.reduce(function(total,unit){return total+(Number(unit.condition)||0);},0)/units.length;
      const baseScore=guardEffectiveness(vehicle.level,mission.id,state);
      const effectiveness=Math.round(clamp(baseScore*(0.55+0.0045*environmentAssessment.fit)*(0.35+0.0065*health),0,100));
      const wear30=environmentAssessment.wearPerDay*30;
      const maintenanceExposure=environmentAssessment.damageRisk;
      const costPerDay=vehicle.maintenancePerDay*(1+(100-health)/100*0.6+Math.max(0,70-environmentAssessment.fit)/100*0.45+road.wearPerDay*0.25);
      const strategicScore=Math.round(clamp(effectiveness*0.55+environmentAssessment.fit*0.30+Math.max(0,100-wear30)*0.15-costPerDay/500,0,100));
      const strengths=[];
      if(environmentAssessment.fit>=80)strengths.push('Strong route fit');
      if(effectiveness>=65)strengths.push('High mission effectiveness');
      if(wear30<=5)strengths.push('Low expected wear');
      if((vehicle.capabilities[mission.weights?Object.keys(mission.weights).sort(function(a,b){return mission.weights[b]-mission.weights[a];})[0]:'response']||0)>=80)strengths.push('Specialist mission capability');
      candidates.push({vehicleLevel:vehicle.level,vehicleId:vehicle.id,vehicleName:vehicle.name,className:vehicle.className,availableVehicles:ready.length,recommendedQuantity:units.length,averageCondition:Math.round(health),missionId:mission.id,missionName:mission.name,environmentId:environment.id,environmentName:environment.name,roadCondition:road.id,roadName:road.name,environmentFit:environmentAssessment.fit,effectiveness:effectiveness,strategicScore:strategicScore,estimatedWear30Days:Number(wear30.toFixed(1)),damageRisk:environmentAssessment.damageRisk,maintenancePerDay:vehicle.maintenancePerDay,estimatedMaintenancePerDay:Math.round(costPerDay),strengths:strengths,tradeoff:environmentAssessment.summary,why:environmentAssessment.fit>=80?'Best-fit platform for this route.':environmentAssessment.fit>=60?'Usable platform with manageable wear and response trade-offs.':'Available only as a compromise; condition and maintenance costs rise faster.'});
    });
    return candidates.sort(function(a,b){return b.strategicScore-a.strategicScore||b.environmentFit-a.environmentFit||a.estimatedWear30Days-b.estimatedWear30Days||a.vehicleLevel-b.vehicleLevel;}).slice(0,3);
  }
  function deployGuard(vehicleLevel,quantity,missionId,sector,country,assetId,environmentId,roadCondition){
    const level=Math.floor(num(vehicleLevel)||0),qty=Math.floor(num(quantity)||0),cid=normalizeCountry(country||currentCountry());
    const vehicle=VEHICLES.find(function(row){return row.level===level;}),mission=GUARD_MISSIONS.find(function(row){return row.id===String(missionId||'');});
    if(!vehicle)return{ok:false,reason:'VEHICLE_TIER_INVALID'};
    if(!mission)return{ok:false,reason:'GUARD_MISSION_INVALID'};
    if(qty<1||qty>100)return{ok:false,reason:'GUARD_QUANTITY_INVALID'};
    const state=getState(cid);
    if(level>state.unlockedVehicleLevel)return{ok:false,reason:'VEHICLE_TIER_LOCKED',unlockedVehicleLevel:state.unlockedVehicleLevel};
    const requestedAssetId=String(assetId||'').trim();
    const asset=requestedAssetId?guardableAssets(cid).find(function(row){return row.id===requestedAssetId;}):null;
    if(requestedAssetId&&!asset)return{ok:false,reason:'GUARD_ASSET_UNAVAILABLE',message:'The chosen guard target is not a currently recorded, eligible country asset.'};
    const environment=environmentSpec(environmentId),road=roadSpec(roadCondition);
    const preview=guardPreview(level,mission.id,qty,cid,environment.id,road.id);
    if(!preview.ok)return{ok:false,reason:preview.reason,availableVehicles:preview.availableVehicles,availableOfficers:preview.availableOfficers,requiredOfficers:preview.requiredOfficers,environmentAssessment:preview.environment};
    if(preview.environment.fit<15)return{ok:false,reason:'VEHICLE_ROUTE_MISMATCH',message:'This vehicle is too poorly matched to the selected environment. Choose a better platform or accept a different route.',environmentAssessment:preview.environment};
    const location=String(sector||asset&&asset.name||'General Sector').trim().slice(0,80)||'General Sector';
    return mutation(cid,0,'POLICE_GUARD_DEPLOYMENT',function(next){
      const fleetCandidates=availableFleetUnits(next,level).slice().sort(function(a,b){return(Number(b.condition)||0)-(Number(a.condition)||0);});
      const picked=fleetCandidates.slice(0,qty);
      if(picked.length!==qty)return{ok:false,reason:'FLEET_CHANGED_RETRY'};
      const id='GUARD-'+cid+'-'+String(next.nextGuardDeploymentId||1);
      next.nextGuardDeploymentId=Math.max(1,Math.floor(num(next.nextGuardDeploymentId)||1))+1;
      const deployment={id:id,vehicleLevel:level,quantity:qty,vehicleIds:picked.map(function(unit){return unit.id;}),missionId:mission.id,sector:location,assetId:asset?asset.id:null,assetName:asset?asset.name:null,assetCategory:asset?asset.category:null,environmentId:environment.id,roadCondition:road.id,environmentFit:preview.environment.fit,predictedWearPerDay:preview.environment.wearPerDay,officers:qty*vehicle.capacity,deployedAtTurn:turn(),deployedAtSimulationMs:simulationTimeMs(),effectiveness:0,status:'ACTIVE'};
      picked.forEach(function(unit){unit.status='DEPLOYED';unit.lastEnvironment=environment.id;unit.lastRoadCondition=road.id;});
      next.guardDeployments.push(deployment);
      deployment.effectiveness=deploymentEffectiveness(next,deployment,cid);
      return {deployment:clone(deployment),vehicle:vehicle.name,mission:mission.name,guardAsset:asset?clone(asset):null,environmentAssessment:clone(preview.environment),estimatedEffectiveness:deployment.effectiveness,assignedOfficers:deployment.officers,availableVehicleCount:guardCapacity(cid).availableVehicles[level]-qty};
    });
  }
  function standDownGuard(deploymentId,country){
    const cid=normalizeCountry(country||currentCountry()),id=String(deploymentId||'').trim();
    if(!id)return{ok:false,reason:'GUARD_DEPLOYMENT_ID_REQUIRED'};
    const state=getState(cid),unit=(state.guardDeployments||[]).find(function(row){return row.id===id;});
    if(!unit)return{ok:false,reason:'GUARD_DEPLOYMENT_NOT_FOUND'};
    return mutation(cid,0,'POLICE_GUARD_STAND_DOWN',function(next){
      const index=next.guardDeployments.findIndex(function(row){return row.id===id;});
      if(index<0)return{ok:false,reason:'GUARD_DEPLOYMENT_NOT_FOUND'};
      const removed=next.guardDeployments.splice(index,1)[0];
      (removed.vehicleIds||[]).forEach(function(vehicleId){const unit=next.vehicleFleet.find(function(row){return row.id===vehicleId;});if(unit&&unit.status==='DEPLOYED')unit.status=fleetUnitStatus(unit);});
      return {deployment:clone(removed),releasedOfficers:removed.officers,releasedVehicles:removed.quantity,releasedVehicleIds:clone(removed.vehicleIds||[])};
    });
  }
  function serviceVehicle(vehicleId,country){
    const cid=normalizeCountry(country||currentCountry()),id=String(vehicleId||'').trim();
    if(!id)return{ok:false,reason:'VEHICLE_ID_REQUIRED'};
    const state=getState(cid),unit=state.vehicleFleet.find(function(row){return row.id===id;});
    if(!unit)return{ok:false,reason:'VEHICLE_UNIT_NOT_FOUND'};
    const active=(state.guardDeployments||[]).some(function(row){return Array.isArray(row.vehicleIds)&&row.vehicleIds.includes(id);});
    if(active||unit.status==='DEPLOYED')return{ok:false,reason:'VEHICLE_STILL_DEPLOYED',message:'Stand down the active guard assignment before servicing this vehicle.'};
    if(unit.status==='AVAILABLE'&&Number(unit.condition)>=99&&Number(unit.odometerKm)<Number(unit.nextServiceAtKm||5000))return{ok:false,reason:'SERVICE_NOT_REQUIRED'};
    const cost=estimateVehicleRepairCost(unit);
    return mutation(cid,cost,'POLICE_VEHICLE_REPAIR',function(next){
      const target=next.vehicleFleet.find(function(row){return row.id===id;});
      if(!target)return{ok:false,reason:'VEHICLE_UNIT_NOT_FOUND'};
      const before=Number(target.condition)||0,oldStatus=target.status;
      target.condition=100;target.status='AVAILABLE';target.nextServiceAtKm=Math.max(Number(target.nextServiceAtKm)||0,Number(target.odometerKm)||0)+5000;
      target.lastMaintenanceSimulationDay=Math.floor(simulationTimeMs()/DAY_MS);target.lastEnvironment=null;target.lastRoadCondition=null;target.maintenanceEvents=(Math.max(0,Math.floor(num(target.maintenanceEvents)||0))+1);
      const record={vehicleId:id,vehicleLevel:target.vehicleLevel,action:'FULL_SERVICE_AND_REPAIR',conditionBefore:before,conditionAfter:100,odometerKm:target.odometerKm,cost:cost,simulationDay:Math.floor(simulationTimeMs()/DAY_MS),turn:turn()};
      next.vehicleMaintenanceLog.push(record);next.vehicleMaintenanceLog=next.vehicleMaintenanceLog.slice(-100);
      emit('OMEGA_POLICE_VEHICLE_SERVICED',{countryId:cid,record:clone(record),previousStatus:oldStatus});
      return{vehicle:clone(target),conditionBefore:before,conditionAfter:100,serviceCost:cost,maintenanceRecord:clone(record)};
    });
  }
  function advanceFleetSimulation(state,country,toDay){
    const last=num(state.lastFleetSimulationDay);
    if(last===null||last<0){state.lastFleetSimulationDay=toDay;return true;}
    if(toDay<=last)return false;
    const fromDay=Math.max(0,Math.floor(last)),elapsedDays=Math.min(3650,Math.floor(toDay)-fromDay);
    if(elapsedDays<=0)return false;
    const fromMs=fromDay*DAY_MS,toMs=Math.floor(toDay)*DAY_MS;
    let changed=false;
    const log=function(entry){state.vehicleMaintenanceLog.push(Object.assign({countryId:country,simulationDay:Math.floor(toDay),turn:turn()},entry));changed=true;};
    const originalDeployments=(state.guardDeployments||[]).slice();
    originalDeployments.forEach(function(deployment){
      const vehicle=VEHICLES.find(function(row){return row.level===Number(deployment.vehicleLevel);});
      const environment=environmentSpec(deployment.environmentId),road=roadSpec(deployment.roadCondition);
      const use=vehicleUseAssessment(deployment.vehicleLevel,environment.id,road.id,country);
      const kept=[];
      (deployment.vehicleIds||[]).forEach(function(vehicleId){
        const unit=state.vehicleFleet.find(function(row){return row.id===vehicleId;});
        if(!unit)return;
        const startMs=Math.max(fromMs,Number(deployment.deployedAtSimulationMs)||fromMs,Number(unit.acquiredAtSimulationMs)||fromMs);
        const activeDays=Math.max(0,Math.min(elapsedDays,(toMs-startMs)/DAY_MS));
        if(activeDays>0){
          const conditionBefore=Number(unit.condition)||0;
          unit.condition=Math.round(clamp(conditionBefore-use.wearPerDay*activeDays,0,100)*100)/100;
          unit.odometerKm=Math.round((Math.max(0,Number(unit.odometerKm)||0)+use.dailyDistanceKm*activeDays)*10)/10;
          unit.lastEnvironment=environment.id;unit.lastRoadCondition=road.id;
          changed=true;
        }
        if(Number(unit.condition)<=15){
          unit.condition=Math.max(0,Number(unit.condition)||0);unit.status='REPAIR_REQUIRED';
          log({vehicleId:unit.id,vehicleLevel:unit.vehicleLevel,action:'BREAKDOWN_REQUIRES_REPAIR',condition:unit.condition,environment:environment.id,roadCondition:road.id,missionId:deployment.missionId,sector:deployment.sector,damageRisk:use.damageRisk});
          emit('OMEGA_POLICE_VEHICLE_BREAKDOWN',{countryId:country,vehicle:clone(unit),deploymentId:deployment.id,environment:environment.id,roadCondition:road.id,turn:turn()});
        }else if(Number(unit.odometerKm||0)>=Number(unit.nextServiceAtKm||5000)){
          unit.status='MAINTENANCE_DUE';
          log({vehicleId:unit.id,vehicleLevel:unit.vehicleLevel,action:'SCHEDULED_SERVICE_DUE',condition:unit.condition,odometerKm:unit.odometerKm,nextServiceAtKm:unit.nextServiceAtKm,environment:environment.id,roadCondition:road.id,missionId:deployment.missionId,sector:deployment.sector});
          emit('OMEGA_POLICE_VEHICLE_SERVICE_DUE',{countryId:country,vehicle:clone(unit),deploymentId:deployment.id,turn:turn()});
        }else{unit.status='DEPLOYED';kept.push(unit.id);}
      });
      if(kept.length!==(deployment.vehicleIds||[]).length){
        const removed=(deployment.vehicleIds||[]).filter(function(id){return !kept.includes(id);});
        deployment.vehicleIds=kept;deployment.quantity=kept.length;deployment.officers=kept.length*(vehicle&&vehicle.capacity||0);
        deployment.effectiveness=kept.length?deploymentEffectiveness(state,deployment,country):0;deployment.status=kept.length?'PARTIAL_FORCE_AFTER_MAINTENANCE':'AUTO_STOOD_DOWN_MAINTENANCE';
        log({action:'GUARD_FORCE_REDUCED',deploymentId:deployment.id,missionId:deployment.missionId,sector:deployment.sector,removedVehicleIds:removed,remainingVehicleCount:kept.length,releasedOfficers:removed.length*(vehicle&&vehicle.capacity||0),reason:'VEHICLE_DAMAGED_OR_SERVICE_DUE'});
      }
    });
    state.guardDeployments=state.guardDeployments.filter(function(row){return(row.vehicleIds||[]).length>0;});
    state.vehicleFleet.forEach(function(unit){
      if(unit.status==='DEPLOYED'&&(state.guardDeployments||[]).some(function(row){return(row.vehicleIds||[]).includes(unit.id);}))return;
      if(unit.status==='DEPLOYED')unit.status=fleetUnitStatus(unit);
      if(unit.status==='AVAILABLE'){
        const status=fleetUnitStatus(unit);if(status!=='AVAILABLE'){unit.status=status;log({vehicleId:unit.id,vehicleLevel:unit.vehicleLevel,action:status==='MAINTENANCE_DUE'?'SCHEDULED_SERVICE_DUE':'CONDITION_INSPECTION_DUE',condition:unit.condition,odometerKm:unit.odometerKm,nextServiceAtKm:unit.nextServiceAtKm});}
      }
    });
    state.vehicleMaintenanceLog=state.vehicleMaintenanceLog.slice(-100);
    state.lastFleetSimulationDay=Math.floor(toDay);
    return true;
  }
  function recruitPolice(amount,country){
    const qty=Math.floor(num(amount)||0),cid=normalizeCountry(country||currentCountry());if(qty<1||qty>100000)return{ok:false,reason:'RECRUITMENT_QUANTITY_INVALID',message:'Recruitment must be between 1 and 100000 officers.'};
    const s=getState(cid),unitFee=Math.max(0,num(s.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST),dailySalary=Math.max(0,num(s.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY);
    return mutation(cid,qty*unitFee,'POLICE_RECRUITMENT',function(next){next.policeCount+=qty;next.policeEfficiency=clamp(next.policeEfficiency+Math.min(5,qty/100),0,100);return{amount:qty,unitRecruitmentFeeUsd:unitFee,addedDailyPayroll:qty*dailySalary,newPoliceCount:next.policeCount,estimatedCrimeImpact:estimateRecruitmentImpact(qty,cid)};});
  }
  function firePolice(amount,country){
    const qty=Math.floor(num(amount)||0),cid=normalizeCountry(country||currentCountry()),s=getState(cid);if(qty<1)return{ok:false,reason:'DISMISSAL_QUANTITY_INVALID'};if(qty>=s.policeCount)return{ok:false,reason:'MINIMUM_FORCE_REQUIRED',message:'At least one officer must remain in service.'};
    const dailySalary=Math.max(0,num(s.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY);
    return mutation(cid,0,'POLICE_DISMISSAL',function(next){next.policeCount-=qty;next.policeEfficiency=clamp(next.policeEfficiency-Math.min(5,qty/200),0,100);return{amount:qty,dailyPayrollSavings:qty*dailySalary,newPoliceCount:next.policeCount};});
  }
  function buildFacility(id,amount,country){
    const f=FACILITIES.find(x=>x.id===String(id)),qty=Math.floor(num(amount)||0),cid=normalizeCountry(country||currentCountry());if(!f)return{ok:false,reason:'FACILITY_ID_INVALID'};if(qty<1||qty>100)return{ok:false,reason:'FACILITY_QUANTITY_INVALID'};
    const s=getState(cid),cost=estimateFacilityCostFrom(s,f.id,qty);
    return mutation(cid,cost,'FACILITY_BUILD',function(next){next.facilityLevels[f.id]=Math.max(0,num(next.facilityLevels[f.id])||0)+qty;next.policeTrust=clamp(next.policeTrust+Math.min(6,qty*1.5),0,100);
      if(['station','patrol','dispatch','emergency'].includes(f.id))next.policeEfficiency=clamp(next.policeEfficiency+Math.min(6,qty),0,100);
      if(['border','forensics','cyber','communications'].includes(f.id))next.sabotageRisk=clamp(next.sabotageRisk-Math.min(8,qty*1.5),5,95);
      return{facility:f.name,amount:qty,newLevel:next.facilityLevels[f.id],totalCost:cost};});
  }
  function startResearch(id,country){
    const t=TACTICS.find(x=>x.id===String(id)),cid=normalizeCountry(country||currentCountry());if(!t)return{ok:false,reason:'TACTIC_ID_INVALID'};
    const s=getState(cid);if(s.tacticsResearched[t.id])return{ok:false,reason:'TACTIC_ALREADY_RESEARCHED'};if(s.pendingResearch)return{ok:false,reason:'RESEARCH_ALREADY_IN_PROGRESS',pending:s.pendingResearch};
    if(t.id==='intelligenceFusion'&&s.specialAgents<1)return{ok:false,reason:'INTELLIGENCE_AGENT_REQUIRED',message:'Recruit at least one intelligence agent before researching the fusion network.'};
    const result=mutation(cid,t.cost,'POLICE_TACTIC_RESEARCH',function(next){const now=simulationTimeMs();next.pendingResearch={id:t.id,name:t.name,cost:t.cost,startedAtMs:now,completesAtMs:now+t.durationDays*DAY_MS,durationDays:t.durationDays,startedAtTurn:turn(),status:'IN_PROGRESS'};return{tactic:t.name,completesAtMs:now+t.durationDays*DAY_MS,durationDays:t.durationDays};});
    if(result.ok)emit('OMEGA_POLICE_RESEARCH_STARTED',{countryId:cid,tacticId:t.id,name:t.name,durationDays:t.durationDays,completesAtMs:result.completesAtMs,turn:turn()});return result;
  }
  function upgradeTraining(targetLevel,country){
    const target=Math.floor(num(targetLevel)||0),cid=normalizeCountry(country||currentCountry()),s=getState(cid);
    if((s.pendingCapabilityProjects||[]).some(function(p){return p&&p.type==='training'&&p.status==='IN_PROGRESS';}))return{ok:false,reason:'TRAINING_UPGRADE_ALREADY_IN_PROGRESS',message:'A training-level upgrade project is already in progress.'};
    if(target<=s.trainingQualityLevel)return{ok:false,reason:'TRAINING_TARGET_NOT_HIGHER'};if(target>100)return{ok:false,reason:'TRAINING_TARGET_INVALID'};if(target>(s.facilityLevels.academy||0))return{ok:false,reason:'ACADEMY_LEVEL_TOO_LOW',academyLevel:s.facilityLevels.academy,target:target};
    const cost=estimateTrainingCostFrom(s,target);
    return mutation(cid,cost,'TRAINING_UPGRADE',function(next){next.trainingQualityLevel=target;next.policeEfficiency=clamp(next.policeEfficiency+Math.min(20,(target-s.trainingQualityLevel)*4),0,100);next.policeTrust=clamp(next.policeTrust+Math.min(5,target-s.trainingQualityLevel),0,100);next.sabotageRisk=clamp(next.sabotageRisk-Math.min(5,(target-s.trainingQualityLevel)*1.5),5,95);return{target:target,cost:cost,newTrainingQuality:target};});
  }
  function knownCountry(country){const roots=[g.Game&&g.Game.state,g.gameState].filter(Boolean);return roots.some(root=>(root.economy&&root.economy[country])||(root.population&&root.population[country])||(root.interior&&root.interior[country]));}
  function availableCountries(country){const home=normalizeCountry(country||currentCountry()),set=new Set();for(const root of [g.Game&&g.Game.state,g.gameState].filter(Boolean)){for(const bucket of ['economy','population','interior']){const rows=root&&root[bucket];if(rows&&typeof rows==='object')Object.keys(rows).forEach(key=>{const id=normalizeCountry(key);if(id&&id!==home)set.add(id);});}}return Array.from(set).sort();}
  function recruitAgents(amount,country,targetCountry){
    const qty=Math.floor(num(amount)||0),cid=normalizeCountry(country||currentCountry()),target=normalizeCountry(targetCountry||'UNASSIGNED');if(qty<1||qty>100)return{ok:false,reason:'AGENT_QUANTITY_INVALID'};
    if(target!=='UNASSIGNED'&&(target===cid||!knownCountry(target)))return{ok:false,reason:'INTEL_TARGET_UNAVAILABLE',message:'Choose a recorded country other than the home country.'};
    return mutation(cid,qty*AGENT_RECRUITMENT_COST,'INTELLIGENCE_AGENT_RECRUITMENT',function(s){s.specialAgents+=qty;s.agentDeployments[target]=Math.max(0,num(s.agentDeployments[target])||0)+qty;s.sabotageRisk=clamp(s.sabotageRisk-Math.min(12,qty*4),5,95);s.policeEfficiency=clamp(s.policeEfficiency+Math.min(5,qty),0,100);return{amount:qty,targetCountryId:target,newAgentCount:s.specialAgents,deployedTo:s.agentDeployments[target],addedDailyOperatingCost:qty*AGENT_SALARY_PER_DAY,newSabotageRisk:s.sabotageRisk};});
  }
  function issueMinisterDirective(facilityTarget,trainingTarget,country){
    const cid=normalizeCountry(country||currentCountry()),facilityGoal=clamp(Math.floor(num(facilityTarget)||0),0,100),trainingGoal=clamp(Math.floor(num(trainingTarget)||0),0,100);let s=getState(cid),spent=0;const actions=[];
    if(facilityGoal>(s.facilityLevels.academy||0)){const result=buildFacility('academy',facilityGoal-(s.facilityLevels.academy||0),cid);if(!result.ok)return{ok:false,reason:result.reason,actions:actions,message:'Academy upgrade could not be completed: '+result.reason};spent+=result.cost||0;actions.push('Academy built to Level '+facilityGoal+' for '+money(result.cost));s=getState(cid);}
    if(trainingGoal>s.trainingQualityLevel){if(trainingGoal>(s.facilityLevels.academy||0))return{ok:false,reason:'ACADEMY_LEVEL_TOO_LOW',actions:actions,message:'Academy reaches Level '+s.facilityLevels.academy+', below requested training Level '+trainingGoal+'. Increase the academy target first.'};
      const result=upgradeTraining(trainingGoal,cid);if(!result.ok)return{ok:false,reason:result.reason,actions:actions,message:'Academy directive applied; training directive remains incomplete because '+result.reason+'.'};spent+=result.cost||0;actions.push('Training quality upgraded to Level '+trainingGoal+' for '+money(result.cost));}
    if(!actions.length)actions.push('No change required; requested academy and training levels are already met.');
    emit('OMEGA_HOME_MINISTER_DIRECTIVE_COMPLETED',{countryId:cid,facilityTarget:facilityGoal,trainingTarget:trainingGoal,actions:actions,cost:spent,turn:turn()});return{ok:true,countryId:cid,cost:spent,actions:actions,state:getState(cid)};
  }

  function deterministicRoll(country,week,atTurn){const value=country+':'+week+':'+atTurn;let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0)%100;}
  function findNamedArrays(root,names,depth,out){
    if(!root||typeof root!=='object'||depth>5)return;
    Object.keys(root).forEach(key=>{const val=root[key],name=key.toLowerCase().replace(/[^a-z]/g,'');if(names.indexOf(name)>=0&&Array.isArray(val))out.push({key:key,rows:val});if(val&&typeof val==='object'&&!Array.isArray(val))findNamedArrays(val,names,depth+1,out);});
  }
  function securityAssetCandidates(country){
    const cid=normalizeCountry(country||currentCountry()),root=rootState()||(g.gameState&&typeof g.gameState==='object'?g.gameState:null);
    const economy=root&&root.economy&&root.economy[cid];
    if(!economy||typeof economy!=='object')return [];
    const found=[];
    findNamedArrays(economy,['factories','industrialfacilities','plants','civilianfacilities','infrastructureassets'],0,found);
    const candidates=[];
    found.forEach(function(entry){
      entry.rows.forEach(function(row,index){
        if(!row||typeof row!=='object'||Array.isArray(row))return;
        const identity=String(row.factoryId||row.factory_id||row.assetId||row.id||row.name||'').toLowerCase();
        const kind=String(row.type||row.kind||row.category||'').toLowerCase();
        const factoryLike=/factory|plant|smelt|industrial|aluminium|aluminum|civilian/.test(identity+' '+kind);
        const unavailable=/destroyed|offline|damaged|closed|suspend|decommission|retired|abandon|disused|inactive|planned|development|maintenance|non.?operat|not.?operat|under.?repair/.test(String(row.operationalStatus||row.status||row.securityCondition||'').toLowerCase());
        if(!factoryLike||unavailable)return;
        const id=String(row.factoryId||row.factory_id||row.assetId||row.id||row.name||'').trim();
        const name=String(row.name||row.factoryName||row.assetName||row.facilityName||id||'Unnamed recorded asset').trim();
        candidates.push({id:id||null,name:name,category:String(row.type||row.kind||row.category||entry.key),array:entry.key,index:index});
      });
    });
    return candidates;
  }
  function guardableAssets(country){
    return securityAssetCandidates(country).filter(function(row){return Boolean(row.id);}).map(function(row){
      return {id:row.id,name:row.name,category:row.category,array:row.array,index:row.index};
    });
  }
  function expectedIncidentAsset(country,week){
    const rows=securityAssetCandidates(country);
    if(!rows.length)return null;
    const row=rows[Math.max(0,Math.floor(num(week)||0))%rows.length];
    return {id:row.id,name:row.name,category:row.category,array:row.array,index:row.index};
  }
  function markExistingAsset(country,incident){
    const mesh=interop();if(!mesh||typeof mesh.dispatchCommand!=='function'||!economyHandlerRegistered)return null;
    const row=mesh.dispatchCommand('economy',ECONOMY_INCIDENT_COMMAND,country,{incident:clone(incident)},{turn:turn(),commandType:ECONOMY_INCIDENT_COMMAND,correlationId:incident.id});
    return row&&row.status==='APPLIED'&&row.result?row.result.assetImpact||null:null;
  }
  function processIncident(country,s,day){
    const week=Math.floor(day/7);if(day<7||s.lastIncidentWeek===week)return false;
    const roll=deterministicRoll(country,week,turn()),types=['CIVIL_UNREST','SMUGGLING_NETWORK','INDUSTRIAL_SABOTAGE'],type=types[roll%types.length];
    const targetAsset=(type==='INDUSTRIAL_SABOTAGE'||type==='CIVIL_UNREST')?expectedIncidentAsset(country,week):null;
    const guardMitigation=guardCoverageForIncident(s,type,targetAsset&&targetAsset.id);
    const chance=clamp(Math.round(s.sabotageRisk/3-guardMitigation/10),1,30);
    if(roll>=chance){s.lastIncidentWeek=week;return true;}
    const mitigation=clamp((s.specialAgents*8)+(s.tacticsResearched.counterTerror?20:0)+(s.tacticsResearched.assetProtection?18:0)+(s.tacticsResearched.intelligenceFusion?14:0),0,85);
    const detected=deterministicRoll(country,week+313,turn())<clamp(mitigation+15+guardMitigation,0,100);
    s.incidentSequence+=1;
    const incident={id:'POLICE-INCIDENT-'+country+'-'+week+'-'+s.incidentSequence,countryId:country,simulationWeek:week,simulationDay:day,simulationTurn:turn(),type:type,baselineRiskPercent:s.sabotageRisk,detected:detected,mitigationPercent:mitigation,guardMitigationPercent:guardMitigation,targetAssetId:targetAsset&&targetAsset.id||null,targetAssetName:targetAsset&&targetAsset.name||null,activeGuardDeployments:(s.guardDeployments||[]).filter(function(unit){const mission=GUARD_MISSIONS.find(function(row){return row.id===unit.missionId;});return mission&&mission.coverageTypes.includes(type)&&(!unit.assetId||String(unit.assetId)===String(targetAsset&&targetAsset.id||''));}).length,status:detected?'DETECTED_AND_CONTAINED':'RESPONSE_REQUIRED',assetImpact:null};
    if(!detected&&(type==='INDUSTRIAL_SABOTAGE'||type==='CIVIL_UNREST'))incident.assetImpact=markExistingAsset(country,incident);
    s.incidentLedger.push(incident);s.incidentLedger=s.incidentLedger.slice(-100);s.lastIncidentWeek=week;
    if(!detected){s.policeTrust=clamp(s.policeTrust-2,0,100);s.policeEfficiency=clamp(s.policeEfficiency-1,0,100);s.sabotageRisk=clamp(s.sabotageRisk+1,5,95);}else{s.policeTrust=clamp(s.policeTrust+0.5,0,100);}
    emit('OMEGA_HOME_MINISTRY_SECURITY_INCIDENT',incident);return true;
  }
  function dailyPayroll(s){return Math.max(0,num(s.policeCount)||0)*Math.max(0,num(s.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY)+Math.max(0,num(s.specialAgents)||0)*AGENT_SALARY_PER_DAY;}
  function dailyFuelCost(s){
    const state=s||{},counts=currentFleetCounts(state);
    let total=0;
    VEHICLES.forEach(function(vehicle){
      const count=Math.max(0,Math.floor(num(counts[String(vehicle.level)])||0));
      if(!count)return;
      const offRoad=Math.max(0,num(vehicle.capabilities&&vehicle.capabilities.offRoad)||0);
      const perVehicle=6+(Math.max(0,num(vehicle.speed)||100)*0.075)+
        (Math.max(0,num(vehicle.capacity)||1)*0.32)+(offRoad*0.025);
      total+=count*perVehicle;
    });
    return Math.round(total*100)/100;
  }
  function getFuelSnapshot(country,suppliedState){
    const cid=normalizeCountry(country||currentCountry()),state=suppliedState||getState(cid);
    const reserve=clamp(num(state.fuelSupplyDays)===null?14:num(state.fuelSupplyDays),0,180);
    const target=14,coveragePct=Math.round(clamp(reserve/target*100,0,100)*10)/10;
    const dailyCost=dailyFuelCost(state);
    return{countryId:cid,reserveDays:reserve,targetReserveDays:target,coveragePct:coveragePct,
      estimatedDailyFuelCostUsd:dailyCost,estimatedCostPerReserveDayUsd:dailyCost,
      status:reserve<=0?'CRITICAL':reserve<3?'LOW':reserve<7?'WATCH':'READY',
      source:'MODELED_FUEL_REQUIREMENT_FROM_VEHICLE_MIX'};
  }
  function purchaseFuelSupply(days,country){
    const qty=Math.floor(num(days)||0),cid=normalizeCountry(country||currentCountry());
    if(qty<1||qty>90)return{ok:false,reason:'FUEL_RESERVE_DAYS_INVALID',message:'Fuel orders must be between 1 and 90 simulation days.'};
    const state=getState(cid),current=clamp(num(state.fuelSupplyDays)===null?14:num(state.fuelSupplyDays),0,180);
    if(current+qty>180)return{ok:false,reason:'FUEL_STORAGE_LIMIT_EXCEEDED',message:'Reserve capacity is 180 simulation days. Reduce the order to fit the remaining capacity.'};
    const cost=Math.round(dailyFuelCost(state)*qty*100)/100;
    return mutation(cid,cost,'POLICE_FUEL_SUPPLY_PURCHASE',function(next){
      next.fuelSupplyDays=clamp((num(next.fuelSupplyDays)||0)+qty,0,180);
      next.lastFuelSupplyPurchaseTurn=turn();
      return{daysPurchased:qty,reserveDays:next.fuelSupplyDays,unitDailyFuelCostUsd:dailyFuelCost(next),
        estimatedTotalCostUsd:cost,fuel:getFuelSnapshot(cid,next)};
    });
  }
  function dailyOperatingCost(s){
    let total=dailyPayroll(s)+ruleDailyCost(s);
    const policyWearMultiplier=1+clamp(ruleEffectSum(s,'vehicleWearPct'),0,100)/100;
    if(Array.isArray(s.vehicleFleet)&&s.vehicleFleet.length){
      s.vehicleFleet.forEach(function(unit){
        const vehicle=VEHICLES.find(function(v){return v.level===Number(unit.vehicleLevel);});if(!vehicle)return;
        const condition=clamp(Number(unit.condition)||0,0,100),healthSurcharge=(100-condition)/100*0.6;
        const deployment=(s.guardDeployments||[]).find(function(row){return Array.isArray(row.vehicleIds)&&row.vehicleIds.includes(unit.id);});
        let routeSurcharge=0;
        if(deployment){const use=vehicleUseAssessment(unit.vehicleLevel,deployment.environmentId,deployment.roadCondition,s.countryId);routeSurcharge=Math.max(0,70-use.fit)/100*0.45+use.road.wearPerDay*0.25;}
        total+=vehicle.maintenancePerDay*(1+healthSurcharge+routeSurcharge)*policyWearMultiplier;
      });
    }else VEHICLES.forEach(function(v){total+=(Math.max(0,num(s.vehiclesOwned[v.level])||0)*v.maintenancePerDay*policyWearMultiplier);});
    return Math.round(total*100)/100;
  }
  function advanceCrimeSimulation(state,country,toDay){
    const last=num(state.lastCrimeSimulationDay);
    if(last===null||last<0){state.lastCrimeSimulationDay=toDay;return false;}
    if(toDay<=last)return false;
    const fromDay=Math.max(0,Math.floor(last)),elapsed=Math.min(365,Math.floor(toDay)-fromDay);
    if(elapsed<=0)return false;
    const snap=getCrimeSnapshot(country,state);
    if(!snap.available){state.lastCrimeSimulationDay=Math.floor(toDay);return true;}
    const model=state.crimeModel&&typeof state.crimeModel==='object'?state.crimeModel:{};
    const acc=state.crimeAccumulator&&typeof state.crimeAccumulator==='object'?state.crimeAccumulator:{};
    let totalIncidents=Math.max(0,num(model.totalIncidents)||0),openedTotal=Math.max(0,num(model.openedCases)||0),clearedTotal=Math.max(0,num(model.clearedCases)||0);
    let backlog=Math.max(0,num(state.justiceBacklog)||0);
    const history=Array.isArray(state.crimeHistory)?state.crimeHistory:[];
    const activeRuleClearance=ruleEffectSum(state,'clearanceDelta'),activeRuleSpeed=ruleEffectSum(state,'justiceDelta');
    const rulebook=normalizePoliceRulebook(state.policeRulebook),ruleScore=policeRulebookQuality(rulebook);
    const clearance=clamp(0.25+(Math.max(0,num(state.policeEfficiency)||0)*0.002)+Math.max(0,num(state.trainingQualityLevel)||1)*0.008+
      activeRuleClearance*0.006+(Math.max(0,num(state.facilityLevels&&state.facilityLevels.forensics)||0)*0.012)-
      (Math.max(0,num(state.misconductRiskPct)||0)*0.0012),0.12,0.85);
    const dailyCapacity=Math.max(1,Math.floor((Math.max(0,num(state.policeCount)||0)*0.006+
      Math.max(0,num(state.facilityLevels&&state.facilityLevels.forensics)||0)*30+
      Math.max(0,num(state.facilityLevels&&state.facilityLevels.dispatch)||0)*20)*
      clamp(0.55+(Math.max(0,num(state.policeEfficiency)||0)/100)*0.8,0.55,1.35)+activeRuleSpeed*2));
    let changed=false;
    let daySnapshot=snap;
    for(let step=1;step<=elapsed;step++){
      if(step>1)daySnapshot=getCrimeSnapshot(country,state);
      const day=fromDay+step;let incidents=0,byCategory={};
      Object.keys(daySnapshot.categories).forEach(function(category){
        const row=daySnapshot.categories[category];if(row.projectedAnnualIncidents===null)return;
        const expected=row.projectedAnnualIncidents/365;
        const accumulated=(num(acc[category])||0)+expected;
        const count=Math.max(0,Math.floor(accumulated));
        acc[category]=accumulated-count;
        if(count){byCategory[category]=count;incidents+=count;}
      });
      const caseOpen=Math.max(0,Math.round(incidents*0.36));
      const capacity=Math.min(backlog+caseOpen,dailyCapacity);
      const cleared=Math.max(0,Math.floor(capacity*clearance));
      backlog=Math.max(0,backlog+caseOpen-cleared);
      totalIncidents+=incidents;openedTotal+=caseOpen;clearedTotal+=cleared;
      state.publicSatisfaction=clamp((num(state.publicSatisfaction)||55)+
        (clearance>0.52?0.025:clearance<0.32?-0.035:0)+
        (Math.max(0,num(state.misconductRiskPct)||0)>45?-0.06:0)+
        (cleared>0&&backlog===0?0.015:0),0,100);
      state.publicSatisfaction=clamp(state.publicSatisfaction+clamp((ruleScore-68)*0.0009,-0.025,0.03)+(rulebook.bodyCameraMandatory?0.006:-0.014)+(rulebook.searchWarrantRequired?0.003:-0.008),0,100);
      state.misconductRiskPct=clamp((num(state.misconductRiskPct)||0)+clamp((68-ruleScore)*0.0004,-0.012,0.02)+(rulebook.bodyCameraMandatory?-0.006:0.012)+(rulebook.searchWarrantRequired?-0.003:0.006),0,100);
      state.policeTrust=clamp((num(state.policeTrust)||55)+(state.publicSatisfaction-(num(state.policeTrust)||55))*0.025,0,100);
      history.push({day:day,turn:turn(),incidents:incidents,openedCases:caseOpen,clearedCases:cleared,
        caseClearancePct:caseOpen?Math.round(Math.min(1,cleared/Math.max(1,caseOpen))*10000)/100:null,
        justiceBacklog:Math.round(backlog),publicSatisfaction:Math.round(state.publicSatisfaction*100)/100,
        misconductRiskPct:Math.round((num(state.misconductRiskPct)||0)*100)/100,crimeIndex:daySnapshot.projectedCrimeIndex,byCategory:byCategory});
      const currentFuelDays=clamp(num(state.fuelSupplyDays)===null?14:num(state.fuelSupplyDays),0,180);
      state.fuelSupplyDays=Math.max(0,currentFuelDays-1);
      changed=true;
    }
    state.justiceBacklog=Math.round(backlog);
    state.crimeAccumulator=acc;
    state.crimeModel={totalIncidents:totalIncidents,openedCases:openedTotal,clearedCases:clearedTotal,lastUpdatedDay:Math.floor(toDay),
      latestDailyIncidents:history.length?history[history.length-1].incidents:0,latestDailyClearedCases:history.length?history[history.length-1].clearedCases:0,
      activeCaseClearancePct:Math.round(clearance*10000)/100,dailyCaseCapacity:dailyCapacity};
    state.crimeHistory=history.slice(-90);
    state.lastCrimeSimulationDay=Math.floor(toDay);
    emit('OMEGA_POLICE_CRIME_DAY_RECORDED',{countryId:country,fromDay:fromDay+1,toDay:Math.floor(toDay),elapsedDays:elapsed,
      dailyIncidents:state.crimeModel.latestDailyIncidents,justiceBacklog:state.justiceBacklog,publicSatisfaction:state.publicSatisfaction,
      crimeIndex:history.length?history[history.length-1].crimeIndex:daySnapshot.projectedCrimeIndex,turn:turn()});
    return changed;
  }
  function collectIntelligence(country,s,day){
    const week=Math.floor(day/7);if(day<7||s.lastIntelWeek===week)return false;
    const targets=Object.keys(s.agentDeployments||{}).filter(id=>id!=='UNASSIGNED'&&id!==country&&(num(s.agentDeployments[id])||0)>0&&knownCountry(id));if(!targets.length)return false;
    targets.forEach(target=>{const observations=[],roots=[g.Game&&g.Game.state,g.gameState].filter(Boolean);for(const root of roots){const economy=root.economy&&root.economy[target],population=root.population&&root.population[target],police=root.interior&&root.interior[target]&&root.interior[target].police;[['economy.gdp',economy&&economy.gdp],['economy.debt',economy&&economy.debt],['economy.treasury',economy&&economy.treasury],['finance.available',root.finance&&root.finance[target]&&root.finance[target].available],['finance.reserves',root.finance&&root.finance[target]&&root.finance[target].reserves],['economy.stability',economy&&economy.stability],['population.population',population&&(population.population||population.population_2015||population.total)],['police.policeCount',police&&police.policeCount],['police.efficiency',police&&police.policeEfficiency],['police.threatExposure',police&&police.sabotageRisk]].forEach(pair=>{const value=num(pair[1]);if(value!==null)observations.push({field:pair[0],value:value});});}
      const report={reportId:'POLICE-INTEL-'+country+'-'+target+'-'+week+'-'+turn(),sourceCountryId:country,targetCountryId:target,simulationWeek:week,simulationTurn:turn(),agentCount:Math.max(0,num(s.agentDeployments[target])||0),confidencePercent:clamp(30+Math.max(0,num(s.agentDeployments[target])||0)*8,30,95),sourceType:'AUTHORITATIVE_GAME_STATE_OBSERVATION',observations:observations,assessment:observations.length?'SIGNALS_COLLECTED':'INSUFFICIENT_OBSERVABLE_FIELDS'};
      s.intelligenceReports.push(report);emit('OMEGA_HOME_MINISTRY_INTELLIGENCE_REPORT',report);
    });s.intelligenceReports=s.intelligenceReports.slice(-100);s.lastIntelWeek=week;return true;
  }
  function policeCapabilityResources(type,target,state){
    const facilities=state&&state.facilityLevels||{};
    const policeCount=Math.max(0,Math.floor(num(state&&state.policeCount)||0));
    const academyLevel=Math.max(0,Math.floor(num(facilities.academy)||0));
    const departmentLevel=Math.max(0,Math.floor(num(facilities.department)||0));
    if(type==='training'){
      return [
        {id:'academy',label:'Police academy facility level',unit:'level(s)',required:target,available:academyLevel,ok:academyLevel>=target},
        {id:'instructors',label:'Qualified instructor teams',unit:'team(s)',required:Math.max(1,Math.ceil(target/2)),available:Math.max(1,Math.floor(policeCount/500)),ok:Math.max(1,Math.floor(policeCount/500))>=Math.max(1,Math.ceil(target/2))}
      ];
    }
    return [
      {id:'department',label:'Police department facility level',unit:'level(s)',required:Math.ceil(target/3),available:departmentLevel,ok:departmentLevel>=Math.ceil(target/3)},
      {id:'recruitmentTeams',label:'Recruitment teams available from current personnel',unit:'team(s)',required:Math.max(1,Math.ceil(target/2)),available:Math.max(1,Math.floor(policeCount/1000)),ok:Math.max(1,Math.floor(policeCount/1000))>=Math.max(1,Math.ceil(target/2))}
    ];
  }
  function materialToken(value){return String(value||'').trim().toLowerCase().replace(/[\\s-]+/g,'_');}
  function capabilityMaterialRequirements(type,target){
    const level=Math.max(1,Math.floor(num(target)||1));
    if(type==='training')return[
      {resourceId:'CONSTRUCTION_AGGREGATE',quantity:level*8},
      {resourceId:'COPPER',quantity:level*2},
      {resourceId:'BAUXITE_ALUMINUM',quantity:level}
    ];
    return[
      {resourceId:'CRUDE_OIL',quantity:level*3},
      {resourceId:'COPPER',quantity:level},
      {resourceId:'IRON_ORE',quantity:level*2}
    ];
  }
  function capabilityResourceBucket(country){
    const root=rootState();
    if(!root||!root.resource||typeof root.resource!=='object')return{bucket:null,countryId:normalizeCountry(country)};
    const baseline=findPoliceBaseline(country);
    const aliases=[country,baseline&&baseline.code,baseline&&baseline.iso2,baseline&&baseline.iso3,baseline&&baseline.name].filter(Boolean).map(materialToken);
    const keys=Object.keys(root.resource);
    const key=keys.find(function(item){return aliases.includes(materialToken(item))||aliases.some(function(alias){return normalizeCountry(item)===normalizeCountry(alias);});});
    const row=key?root.resource[key]:null;
    return{bucket:row&&typeof row==='object'?row:null,countryId:key||normalizeCountry(country)};
  }
  function materialMapEntry(map,resourceId){
    if(!map||typeof map!=='object'||Array.isArray(map))return{key:null,raw:null,quantity:null};
    const wanted=materialToken(resourceId),key=Object.keys(map).find(function(item){return materialToken(item)===wanted;});
    if(key===undefined)return{key:null,raw:null,quantity:null};
    const raw=map[key];let value=raw;
    if(raw&&typeof raw==='object'&&!Array.isArray(raw))value=raw.availableQuantity??raw.available??raw.quantity??raw.amount??raw.value??raw.stock??raw.total;
    return{key:key,raw:raw,quantity:num(value)};
  }
  function capabilityMaterialStock(country,resourceId){
    const found=capabilityResourceBucket(country),bucket=found.bucket;
    if(!bucket||!bucket.inventory||typeof bucket.inventory!=='object'||Array.isArray(bucket.inventory))
      return{resourceId:resourceId,name:String(resourceId).replace(/_/g,' '),inventoryQuantity:null,availableQuantity:null,reservedQuantity:null,unit:null,source:'RESOURCE_RUNTIME_UNAVAILABLE',resourceCountryId:found.countryId};
    const inventory=materialMapEntry(bucket.inventory,resourceId);
    if(inventory.quantity===null)
      return{resourceId:resourceId,name:String(resourceId).replace(/_/g,' '),inventoryQuantity:null,availableQuantity:null,reservedQuantity:null,unit:null,source:'RESOURCE_INVENTORY_UNAVAILABLE',resourceCountryId:found.countryId};
    const trade=materialMapEntry(bucket.tradeAvailability,resourceId);
    const reserve=materialMapEntry(bucket.strategicReserve&&bucket.strategicReserve.availableByResource,resourceId);
    const reserved=Math.max(0,reserve.quantity===null?0:reserve.quantity),outsideReserve=Math.max(0,inventory.quantity-reserved);
    const available=trade.quantity===null?outsideReserve:Math.min(outsideReserve,Math.max(0,trade.quantity));
    const resourceTypes=Array.isArray(g.ResourceMinistryEngine&&g.ResourceMinistryEngine.resourceTypes)?g.ResourceMinistryEngine.resourceTypes:[];
    const type=resourceTypes.find(function(item){return materialToken(item&&item.id)===materialToken(resourceId);});
    const labels={CONSTRUCTION_AGGREGATE:'Construction aggregate',COPPER:'Copper',BAUXITE_ALUMINUM:'Bauxite / aluminum',CRUDE_OIL:'Crude oil',IRON_ORE:'Iron ore'};
    return{resourceId:resourceId,name:type&&type.name||labels[resourceId]||String(resourceId).replace(/_/g,' '),
      unit:type&&type.unit||type&&type.units||null,inventoryQuantity:inventory.quantity,availableQuantity:available,
      reservedQuantity:reserved,authority:'LIVE_GAME_RESOURCE_INVENTORY',source:'Game.state.resource[country].inventory',resourceCountryId:found.countryId};
  }
  function resourceMaterialsTransaction(country,mode,projectId,materials){
    const mesh=interop();
    if(!mesh||typeof mesh.dispatchCommand!=='function')return{ok:false,reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    const bucket=capabilityResourceBucket(country);
    const payload={mode:mode,projectId:projectId,materials:Array.isArray(materials)?materials.map(function(row){return{resourceId:row.resourceId,quantity:row.quantity};}):[]};
    try{
      const response=mesh.dispatchCommand('interior',CAPABILITY_MATERIALS_COMMAND,bucket.countryId,payload,
        {turn:turn(),commandType:CAPABILITY_MATERIALS_COMMAND,correlationId:projectId,ownerMinistry:'resource'});
      if(response&&response.status==='APPLIED')return{ok:true,result:response.result||null,countryId:bucket.countryId};
      return{ok:false,reason:response&&response.result&&(response.result.reason||response.result.code)||response&&response.reason||response&&response.status||'RESOURCE_MATERIAL_TRANSACTION_REJECTED'};
    }catch(error){return{ok:false,reason:String(error&&error.message||error)};}
  }
  function estimatePoliceCapabilityUpgrade(type,country){
    const kind=String(type||'').trim().toLowerCase(),cid=normalizeCountry(country||currentCountry());
    if(!cid||!['training','recruitment'].includes(kind))return{ok:false,canStart:false,code:'CAPABILITY_TYPE_OR_COUNTRY_INVALID',countryId:cid||null};
    const state=getState(cid),currentLevel=Math.max(1,Math.floor(num(kind==='training'?state.trainingQualityLevel:state.policeRecruitmentLevel)||1));
    const targetLevel=currentLevel+1,maxLevel=10,now=simulationTimeMs();
    const baseRecruitmentFee=Math.max(75,num(state.recruitmentBaseFeePerOfficerUsd)||num(state.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);
    const costUsd=targetLevel>maxLevel?0:kind==='training'
      ?Math.max(0,estimateTrainingCostFrom(state,targetLevel))
      :Math.max(25000,Math.round(baseRecruitmentFee*(20+targetLevel*18)));
    const durationDays=targetLevel>maxLevel?0:kind==='training'?Math.max(1,Math.ceil(targetLevel*1.5)):Math.max(1,Math.ceil(targetLevel*1.25));
    const action=kind==='training'?'TRAINING_UPGRADE':'POLICE_RECRUITMENT';
    const category=kind==='training'?'training':'personnel';
    const budget=getHomeBudgetSnapshot(cid,state),budgetRow=budget&&budget.categories&&budget.categories[category];
    const spendableUsd=budgetRow&&num(budgetRow.spendableUsd)!==null?Math.max(0,num(budgetRow.spendableUsd)):0;
    const resources=targetLevel<=maxLevel?policeCapabilityResources(kind,targetLevel,state):[];
    const materials=(targetLevel<=maxLevel?capabilityMaterialRequirements(kind,targetLevel):[])
      .map(function(row){return Object.assign({},row,capabilityMaterialStock(cid,row.resourceId));});
    const existingProject=(state.pendingCapabilityProjects||[]).find(function(p){return p&&p.type===kind&&p.status==='IN_PROGRESS';});
    const materialRuntime=g.OmegaHomePoliceTrainingMaterialsRuntime&&typeof g.OmegaHomePoliceTrainingMaterialsRuntime.diagnostics==='function'
      ?g.OmegaHomePoliceTrainingMaterialsRuntime.diagnostics():null;
    const blockers=[];
    if(currentLevel>=maxLevel)blockers.push({code:'CAPABILITY_LEVEL_MAXIMUM',message:'This capability is already at the maximum level '+maxLevel+'.'});
    if(!isPlayerCountry(cid))blockers.push({code:'PLAYER_COUNTRY_SCOPE_VIOLATION',message:'Capability upgrades can only be started for the active player country.'});
    if(existingProject)blockers.push({code:'CAPABILITY_PROJECT_ALREADY_RUNNING',message:'A '+kind+' level upgrade is already in progress.'});
    if(!budget||!budget.available)blockers.push({code:'FINANCE_UNAVAILABLE',message:'Finance budget and treasury data are unavailable.'});
    else{
      if(budget.canEdit===false)blockers.push({code:'PLAYER_COUNTRY_SCOPE_VIOLATION',message:'Finance marks this country as read-only.'});
      if(budget.valid!==true)blockers.push({code:'HOME_BUDGET_PLAN_INVALID',message:'Home Ministry allocations exceed the authorised Interior budget.'});
      if(spendableUsd+0.01<costUsd)blockers.push({code:'INSUFFICIENT_BUDGET_OR_TREASURY',message:'The '+category+' category, Interior envelope or treasury does not have enough spendable money.'});
    }
    resources.filter(function(row){return !row.ok;}).forEach(function(row){
      blockers.push({code:'CAPABILITY_RESOURCE_REQUIREMENT_MISSING',resourceId:row.id,message:row.label+': need '+row.required+' '+row.unit+', available '+row.available+'.'});
    });
    if(!materialRuntime||materialRuntime.ready!==true)
      blockers.push({code:'RESOURCE_MATERIAL_RUNTIME_UNAVAILABLE',message:'The authoritative resource inventory transaction handler is not ready.'});
    materials.forEach(function(row){
      if(row.availableQuantity===null||row.availableQuantity===undefined){
        blockers.push({code:'RESOURCE_INVENTORY_UNAVAILABLE',resourceId:row.resourceId,message:'Live stock for '+row.name+' is unavailable. Expected source: Game.state.resource[country].inventory.'});
      }else if(row.availableQuantity+1e-9<row.quantity){
        blockers.push({code:'INSUFFICIENT_RESOURCE_STOCK',resourceId:row.resourceId,required:row.quantity,available:row.availableQuantity,
          message:'Need '+row.quantity+' '+(row.unit||'units')+' of '+row.name+'; only '+row.availableQuantity+' is available outside protected reserves.'});
      }
    });
    return{
      ok:true,canStart:blockers.length===0,code:blockers.length?'CAPABILITY_UPGRADE_BLOCKED':'CAPABILITY_UPGRADE_READY',
      countryId:cid,type:kind,currentLevel:currentLevel,targetLevel:targetLevel,maxLevel:maxLevel,
      costUsd:costUsd,currency:'USD',durationDays:durationDays,
      startedAtMs:now,estimatedCompletionAtMs:now+durationDays*DAY_MS,
      action:action,budgetCategory:category,spendableUsd:spendableUsd,
      budgetAvailable:!!(budget&&budget.available),resources:resources,materials:materials,
      inventorySource:'Game.state.resource[country].inventory',blockers:blockers,
      pendingProject:existingProject?clone(existingProject):null
    };
  }
  function startPoliceCapabilityUpgrade(type,country){
    const quote=estimatePoliceCapabilityUpgrade(type,country);
    if(!quote.ok||!quote.canStart)return{ok:false,reason:quote.blockers&&quote.blockers[0]&&quote.blockers[0].code||quote.code||'CAPABILITY_UPGRADE_BLOCKED',message:quote.blockers&&quote.blockers[0]&&quote.blockers[0].message||'Capability upgrade prerequisites are not satisfied.',quote:quote};
    const cid=quote.countryId,kind=quote.type,now=simulationTimeMs(),projectId='POLICE-CAPABILITY-'+kind.toUpperCase()+'-'+cid+'-'+turn()+'-'+Math.floor(now);
    // Consume required materials through the Resource Ministry transaction ledger.
    // If Finance/state commit fails, restore the exact captured stock receipt.
    const spent=resourceMaterialsTransaction(cid,'CONSUME',projectId,quote.materials||[]);
    if(!spent.ok)return{ok:false,reason:spent.reason||'RESOURCE_MATERIAL_CONSUMPTION_FAILED',message:'The resource ledger rejected this upgrade. No project was started.',quote:quote};
    const project={
      id:projectId,countryId:cid,type:kind,fromLevel:quote.currentLevel,targetLevel:quote.targetLevel,
      costUsd:quote.costUsd,budgetCategory:quote.budgetCategory,durationDays:quote.durationDays,
      startedAtMs:now,completesAtMs:now+quote.durationDays*DAY_MS,
      resources:clone(quote.resources),materials:(quote.materials||[]).map(function(row){return{
        resourceId:row.resourceId,name:row.name||row.resourceId,quantity:row.quantity,unit:row.unit||null,
        inventorySource:row.source||quote.inventorySource||'Game.state.resource[country].inventory'
      };}),
      resourceReceipt:clone(spent.result),status:'IN_PROGRESS',startedAtTurn:turn(),completedAtMs:null
    };
    const result=mutation(cid,quote.costUsd,quote.action,function(next){
      const actualLevel=Math.max(1,Math.floor(num(kind==='training'?next.trainingQualityLevel:next.policeRecruitmentLevel)||1));
      if(actualLevel!==quote.currentLevel)return{ok:false,reason:'CAPABILITY_LEVEL_CHANGED',message:'The level changed after this quote. Recalculate before spending.'};
      if((next.pendingCapabilityProjects||[]).some(function(p){return p&&p.type===kind&&p.status==='IN_PROGRESS';}))
        return{ok:false,reason:'CAPABILITY_PROJECT_ALREADY_RUNNING',message:'A project of this type is already running.'};
      next.pendingCapabilityProjects=(Array.isArray(next.pendingCapabilityProjects)?next.pendingCapabilityProjects:[]).concat([clone(project)]).slice(-50);
      return{project:clone(project),currentLevel:quote.currentLevel,targetLevel:quote.targetLevel,durationDays:quote.durationDays,
        estimatedCompletionAtMs:project.completesAtMs,budgetCategory:quote.budgetCategory,materialsConsumed:clone(project.materials)};
    });
    if(!result||result.ok!==true){
      const refund=resourceMaterialsTransaction(cid,'REFUND',projectId,[]);
      if(!refund.ok)emit('OMEGA_HOME_POLICE_CAPABILITY_MATERIAL_REFUND_FAILED',{countryId:cid,projectId:projectId,reason:refund.reason||'REFUND_FAILED',turn:turn()});
      return Object.assign({},result||{ok:false,reason:'CAPABILITY_UPGRADE_START_FAILED'},{materialRefunded:!!refund.ok,materialsConsumed:clone(project.materials)});
    }
    emit('OMEGA_POLICE_CAPABILITY_UPGRADE_STARTED',{countryId:cid,project:clone(project),turn:turn()});
    return Object.assign({},result,{quote:quote,projectId:projectId,materialsConsumed:clone(project.materials)});
  }
  function processCapabilityProjects(state,country,now){
    const pending=Array.isArray(state&&state.pendingCapabilityProjects)?state.pendingCapabilityProjects:[];
    if(!pending.length)return false;
    const remaining=[],completed=Array.isArray(state.completedCapabilityProjects)?state.completedCapabilityProjects.slice(-49):[];
    let changed=false;
    pending.forEach(function(project){
      if(!project||project.status!=='IN_PROGRESS'){return;}
      if(Number(now)<Number(project.completesAtMs)){remaining.push(project);return;}
      const kind=String(project.type||''),target=Math.max(1,Math.floor(num(project.targetLevel)||1));
      const current=Math.max(1,Math.floor(num(kind==='training'?state.trainingQualityLevel:state.policeRecruitmentLevel)||1));
      if(current!==Math.floor(num(project.fromLevel)||current)){
        const failed=clone(project);failed.status='FAILED';failed.failureReason='CAPABILITY_LEVEL_CHANGED';failed.completedAtMs=now;
        completed.push(failed);emit('OMEGA_POLICE_CAPABILITY_UPGRADE_FAILED',{countryId:country,project:failed,turn:turn()});changed=true;return;
      }
      if(kind==='training'){
        state.trainingQualityLevel=target;
        state.policeEfficiency=clamp(state.policeEfficiency+Math.min(20,(target-current)*4),0,100);
        state.policeTrust=clamp(state.policeTrust+Math.min(5,target-current),0,100);
        state.sabotageRisk=clamp(state.sabotageRisk-Math.min(5,(target-current)*1.5),5,95);
      }else if(kind==='recruitment'){
        state.policeRecruitmentLevel=target;
        const baseFee=Math.max(75,num(state.recruitmentBaseFeePerOfficerUsd)||num(state.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);
        state.recruitmentBaseFeePerOfficerUsd=baseFee;
        state.recruitmentFeePerOfficerUsd=Math.max(1,Math.round(baseFee*(1-Math.min(0.225,Math.max(0,target-1)*0.025))));
      }else{remaining.push(project);return;}
      const done=clone(project);done.status='COMPLETED';done.completedAtMs=now;done.completedAtTurn=turn();
      completed.push(done);emit('OMEGA_POLICE_CAPABILITY_UPGRADE_COMPLETED',{countryId:country,project:done,turn:turn()});changed=true;
    });
    if(changed){state.pendingCapabilityProjects=remaining;state.completedCapabilityProjects=completed.slice(-50);}
    return changed;
  }
  function onTurnCommitted(event){
    const detail=event&&event.detail||{},payload=detail.payload||detail,cid=normalizeCountry(payload.countryId||detail.countryId||playerCountry());if(!cid)return;
    const now=simulationTimeMs(),day=Math.floor(now/DAY_MS),s=getState(cid);let changed=false,payrollDebit=null;
    if(s.lastPayrollDay===null||s.lastPayrollDay===undefined){s.lastPayrollDay=day;changed=true;}
    else if(day>s.lastPayrollDay){
      const days=Math.min(3650,day-s.lastPayrollDay),due=dailyOperatingCost(s)*days;
      const finance=financeApi();let debit=null,paid=0,treasuryUnavailable=false;
      if(finance&&typeof finance.applyAction==='function'){
        const payrollDue=dailyPayroll(s)*days,rulebookDue=policeRulebookDailyCost(s)*days,policyDue=activePolicyDailyCost(s)*days;
        const maintenanceDue=Math.max(0,due-payrollDue-rulebookDue-policyDue),snapshot=getHomeBudgetSnapshot(cid,s);
        const payrollCheck=validateHomeBudgetExpense(cid,payrollDue,'POLICE_PAYROLL',s,snapshot);
        const maintenanceCheck=validateHomeBudgetExpense(cid,maintenanceDue,'POLICE_FLEET_MAINTENANCE',s,snapshot);
        const rulebookCheck=validateHomeBudgetExpense(cid,rulebookDue,'POLICE_RULEBOOK_DAILY_OPERATIONS',s,snapshot);
        const policyCheck=validateHomeBudgetExpense(cid,policyDue,'HOME_MINISTRY_DAILY_OPERATIONS',s,snapshot);
        if(snapshot.available&&payrollCheck.ok&&maintenanceCheck.ok&&rulebookCheck.ok&&policyCheck.ok&&due<=snapshot.parentRemainingUsd+0.01&&due<=snapshot.treasuryBalanceUsd+0.01){
          const transactions=[];
          const salaryDebit=payrollDue>0?debitTreasury(cid,payrollDue,'POLICE_PAYROLL',s):{ok:true,amount:0};
          if(salaryDebit.ok&&salaryDebit.financeTransaction)transactions.push(salaryDebit);
          const upkeepDebit=maintenanceDue>0?debitTreasury(cid,maintenanceDue,'POLICE_FLEET_MAINTENANCE',s):{ok:true,amount:0};
          if(upkeepDebit.ok&&upkeepDebit.financeTransaction)transactions.push(upkeepDebit);
          const rulebookDebit=rulebookDue>0?debitTreasury(cid,rulebookDue,'POLICE_RULEBOOK_DAILY_OPERATIONS',s):{ok:true,amount:0};
          if(rulebookDebit.ok&&rulebookDebit.financeTransaction)transactions.push(rulebookDebit);
          const policyDebit=policyDue>0?debitTreasury(cid,policyDue,'HOME_MINISTRY_DAILY_OPERATIONS',s):{ok:true,amount:0};
          if(policyDebit.ok&&policyDebit.financeTransaction)transactions.push(policyDebit);
          if(salaryDebit.ok&&upkeepDebit.ok&&rulebookDebit.ok&&policyDebit.ok){debit={ok:true,financeTransactions:transactions,amount:due};paid=due;}
          else {
            if(policyDebit.ok&&policyDebit.financeTransaction)refundTreasury(policyDebit);
            if(rulebookDebit.ok&&rulebookDebit.financeTransaction)refundTreasury(rulebookDebit);
            if(upkeepDebit.ok&&upkeepDebit.financeTransaction)refundTreasury(upkeepDebit);
            if(salaryDebit.ok&&salaryDebit.financeTransaction)refundTreasury(salaryDebit);
            debit={ok:false,reason:!salaryDebit.ok?salaryDebit.reason:!upkeepDebit.ok?upkeepDebit.reason:!rulebookDebit.ok?rulebookDebit.reason:policyDebit.reason||'FINANCE_TRANSACTION_FAILED'};
          }
        }else debit={ok:false,reason:!snapshot.available?snapshot.reason||'HOME_BUDGET_UNAVAILABLE':!payrollCheck.ok?payrollCheck.reason:!maintenanceCheck.ok?maintenanceCheck.reason:!rulebookCheck.ok?rulebookCheck.reason:!policyCheck.ok?policyCheck.reason:'HOME_BUDGET_PARENT_EXCEEDED'};
      }else{
        const treasury=getTreasury(cid);
        if(treasury.available){paid=Math.min(due,Math.max(0,treasury.balance));debit=debitTreasury(cid,paid,'HOME_MINISTRY_DAILY_OPERATIONS',s);}
        else {treasuryUnavailable=true;debit={ok:false,reason:'TREASURY_DATA_UNAVAILABLE'};}
      }
      if(debit&&debit.ok){
        payrollDebit=debit;
        if(paid<due){s.unpaidPayroll+=due-paid;s.policeTrust=clamp(s.policeTrust-Math.min(5,days),0,100);s.policeEfficiency=clamp(s.policeEfficiency-Math.min(5,days),0,100);s.sabotageRisk=clamp(s.sabotageRisk+Math.min(5,days),5,95);}
        emit('OMEGA_HOME_POLICE_PAYROLL_SETTLED',{countryId:cid,days:days,due:due,paid:paid,unpaid:Math.max(0,due-paid),turn:turn()});
        s.lastPayrollDay=day;changed=true;
      }else if(treasuryUnavailable){
        emit('OMEGA_HOME_POLICE_PAYROLL_SKIPPED',{countryId:cid,days:days,due:due,reason:'TREASURY_DATA_UNAVAILABLE',turn:turn()});
      }else{
        s.unpaidPayroll+=due;s.policeTrust=clamp(s.policeTrust-Math.min(5,days),0,100);s.policeEfficiency=clamp(s.policeEfficiency-Math.min(5,days),0,100);s.sabotageRisk=clamp(s.sabotageRisk+Math.min(5,days),5,95);
        emit('OMEGA_HOME_POLICE_PAYROLL_SETTLED',{countryId:cid,days:days,due:due,paid:0,unpaid:due,reason:debit&&debit.reason||'BUDGET_UNAVAILABLE',turn:turn()});
        s.lastPayrollDay=day;changed=true;
      }
    }
    const order=s.pendingVehicleOrder;
    if(order&&now>=order.completesAtMs){const v=VEHICLES.find(x=>x.level===order.level);if(v){
      const efficiencyBefore=clamp(num(s.policeEfficiency)===null?60:num(s.policeEfficiency),0,100);
      const capabilityKeys=['response','patrol','protection','surveillance','command'];
      const capabilityAverage=capabilityKeys.reduce(function(total,key){return total+(num(v.capabilities&&v.capabilities[key])||0);},0)/capabilityKeys.length;
      const calculatedEfficiencyBonus=Math.min(2.5,Math.round(Math.log1p(Math.max(1,Number(order.quantity)||1))*(0.35+capabilityAverage/100*1.4)*100)/100);
      s.vehiclesOwned[v.level]=Math.max(0,num(s.vehiclesOwned[v.level])||0)+order.quantity;
      s.policeEfficiency=clamp(efficiencyBefore+calculatedEfficiencyBonus,0,100);
      const appliedEfficiencyBonus=Math.round((s.policeEfficiency-efficiencyBefore)*100)/100;
      s.unlockedVehicleLevel=Math.min(VEHICLES.length,Math.max(s.unlockedVehicleLevel,v.level+1));ensureFleetInventory(s,cid);
      const delivered=clone(order);delivered.status='DELIVERED';delivered.deliveredAtMs=now;s.pendingVehicleOrder=null;
      emit('OMEGA_POLICE_VEHICLE_DELIVERED',{countryId:cid,order:delivered,vehicle:v,unlockedVehicleLevel:s.unlockedVehicleLevel,policeEfficiencyBefore:efficiencyBefore,policeEfficiencyAfter:s.policeEfficiency,policeEfficiencyBonus:appliedEfficiencyBonus,turn:turn()});changed=true;
    }}
    if(advanceFleetSimulation(s,cid,day))changed=true;
    if(advanceCrimeSimulation(s,cid,day))changed=true;
    const research=s.pendingResearch;
    if(research&&now>=research.completesAtMs){const t=TACTICS.find(x=>x.id===research.id);if(t&&!s.tacticsResearched[t.id]){
      s.tacticsResearched[t.id]=true;s.policeEfficiency=clamp(s.policeEfficiency+t.efficiency,0,100);s.sabotageRisk=clamp(s.sabotageRisk-t.riskReduction,5,95);s.policeTrust=clamp(s.policeTrust+2,0,100);s.pendingResearch=null;
      emit('OMEGA_POLICE_RESEARCH_COMPLETED',{countryId:cid,tacticId:t.id,name:t.name,effects:clone(t),turn:turn()});changed=true;
    }}
    if(processCapabilityProjects(s,cid,now))changed=true;
    if(processIncident(cid,s,day))changed=true;if(collectIntelligence(cid,s,day))changed=true;
    if(processPoliceCaseDeadlines(s,cid,now))changed=true;
    s.lastUpdatedTurn=turn();if(changed){const committed=dispatchState(cid,s,'OMEGA_HOME_MINISTRY_SIMULATION_UPDATE');if(!committed.ok&&payrollDebit)refundTreasury(payrollDebit);}
  }

  let handlerRegistered=false,economyHandlerRegistered=false,financeHandlerRegistered=false;
  function registerHandlers(){
    const mesh=interop();if(!mesh||typeof mesh.registerCommandHandler!=='function')return false;
    if(!handlerRegistered){
      try{mesh.registerCommandHandler(STATE_COMMAND,'interior',function(packet,ctx){
        const incoming=packet&&packet.payload&&packet.payload.state;if(!incoming||typeof incoming!=='object'||!ctx||!ctx.stateTransaction)return{accepted:false,reason:'POLICE_STATE_OR_TRANSACTION_MISSING'};
        ctx.stateTransaction.set('interior.police',mergeState(incoming));return{accepted:true,stateVersion:VERSION};
      });handlerRegistered=true;}catch(e){handlerRegistered=String(e&&e.message||e).includes('DUPLICATE')||false;}
    }
    if(!financeHandlerRegistered){
      try{mesh.registerCommandHandler(FINANCE_CASH_COMMAND,'finance',function(packet,ctx){
        const payload=packet&&packet.payload||{},delta=num(payload.delta),current=num(ctx&&ctx.stateTransaction&&ctx.stateTransaction.get('finance.available'));
        if(delta===null||!ctx||!ctx.stateTransaction)return{accepted:false,reason:'FINANCE_DELTA_OR_TRANSACTION_MISSING'};
        if(delta>=0)return{accepted:false,reason:'POSITIVE_FINANCE_ADJUSTMENT_FORBIDDEN'};
        if(current===null)return{accepted:false,reason:'FINANCE_AVAILABLE_UNAVAILABLE'};
        if(delta<0&&current<Math.abs(delta))return{accepted:false,reason:'INSUFFICIENT_TREASURY',balance:current,required:Math.abs(delta)};
        const next=Math.max(0,current+delta);
        ctx.stateTransaction.set('finance.available',next);
        return{accepted:true,balanceBefore:current,balanceAfter:next,delta:delta,reason:payload.reason||'HOME_MINISTRY_FINANCE_ADJUSTMENT'};
      });financeHandlerRegistered=true;}catch(e){financeHandlerRegistered=String(e&&e.message||e).includes('DUPLICATE')||false;}
    }
    if(!economyHandlerRegistered){
      try{mesh.registerCommandHandler(ECONOMY_INCIDENT_COMMAND,'economy',function(packet,ctx){
        const incident=packet&&packet.payload&&packet.payload.incident;if(!incident||!ctx||!ctx.stateTransaction)return{accepted:false,reason:'INCIDENT_OR_TRANSACTION_MISSING'};
        const economy=ctx.stateTransaction.get('economy');if(!economy||typeof economy!=='object')return{accepted:true,assetImpact:null,reason:'NO_COUNTRY_ECONOMY_ASSET_RECORD'};
        const found=[];findNamedArrays(economy,['factories','industrialfacilities','plants','civilianfacilities','infrastructureassets'],0,found);const candidates=[];
        found.forEach(entry=>entry.rows.forEach((row,index)=>{
          if(!row||typeof row!=='object'||Array.isArray(row))return;
          const identity=String(row.factoryId||row.factory_id||row.assetId||row.id||row.name||'').toLowerCase(),kind=String(row.type||row.kind||row.category||'').toLowerCase();
          const factoryLike=/factory|plant|smelt|industrial|aluminium|aluminum|civilian/.test(identity+' '+kind),unavailable=/destroyed|offline|damaged|closed|suspend|decommission|retired|abandon|disused|inactive|planned|development|maintenance|non.?operat|not.?operat|under.?repair/.test(String(row.operationalStatus||row.status||row.securityCondition||'').toLowerCase());
          if(factoryLike&&!unavailable)candidates.push({row:row,index:index,array:entry.key});
        }));
        if(!candidates.length)return{accepted:true,assetImpact:null,reason:'NO_REGISTERED_FACTORY_OR_CIVILIAN_ASSET_TO_DAMAGE'};
        const target=candidates[incident.simulationWeek%candidates.length],before=num(target.row.productionCapacity!==undefined?target.row.productionCapacity:target.row.capacity);
        target.row.securityCondition='DAMAGED';target.row.securityIncidentId=incident.id;target.row.securityDamagePercent=50;target.row.securityOperational=false;
        if(before!==null&&before>0){if(target.row.productionCapacity!==undefined)target.row.productionCapacity=Math.max(0,before*0.5);else if(target.row.capacity!==undefined)target.row.capacity=Math.max(0,before*0.5);target.row.previousCapacityBeforeSecurityDamage=before;}
        ctx.stateTransaction.set('economy',economy);
        return{accepted:true,assetImpact:{array:target.array,index:target.index,assetId:target.row.factoryId||target.row.factory_id||target.row.assetId||target.row.id||target.row.name||null,condition:'DAMAGED',productionCapacityReduced:before!==null&&before>0}};
      });economyHandlerRegistered=true;}catch(e){economyHandlerRegistered=String(e&&e.message||e).includes('DUPLICATE')||false;}
    }
    return handlerRegistered;
  }
  function init(){
    registerHandlers();if(typeof g.addEventListener==='function'&&!g.__OMEGA_HOME_POLICE_TURN_LISTENER__){g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurnCommitted);g.__OMEGA_HOME_POLICE_TURN_LISTENER__=true;}
    return{ready:true,version:VERSION,registered:handlerRegistered,countryId:currentCountry(),simulationTurn:turn()};
  }

  function getCountryOperatingProfile(country){
    const cid=normalizeCountry(country||currentCountry()),row=findPoliceBaseline(cid)||{};
    const profile=row.fleetProfile||{},rawWeights=profile.environmentMixPct||{};
    const defaults={city:30,highway:12,rural:22,border:10,industrial:8,coastal:8,mountain:10};
    const keys=Object.keys(defaults),sum=keys.reduce(function(total,key){return total+Math.max(0,num(rawWeights[key])||0);},0);
    const weights={};
    keys.forEach(function(key){weights[key]=sum>0?Math.round(Math.max(0,num(rawWeights[key])||0)/sum*1000)/10:defaults[key];});
    const total=keys.reduce(function(total,key){return total+weights[key];},0);
    if(Math.abs(total-100)>0.11){const top=keys.reduce(function(best,key){return weights[key]>weights[best]?key:best;},keys[0]);weights[top]=Math.round((weights[top]+100-total)*10)/10;}
    const access=Array.isArray(profile.oceanAccess)?profile.oceanAccess:Array.isArray(row.oceanAccess)?row.oceanAccess:[];
    return{countryId:cid,countryName:row.name||cid,region:profile.subregion||row.region||'Unknown region',
      continent:profile.continent||'Unknown continent',subregion:profile.subregion||row.region||'Unknown subregion',
      urbanizationPct:num(profile.urbanizationPct)===null?num(row.urbanizationPct):num(profile.urbanizationPct),
      hasOceanAccess:profile.hasOceanAccess===undefined?access.length>0:!!profile.hasOceanAccess,oceanAccess:clone(access),
      economyCapacityIndex:num(profile.economyCapacityIndex),environmentMixPct:weights,
      mapCoordinate:clone(profile.mapCoordinate||{lat:null,lng:null}),majorCityCount:Math.max(0,Math.floor(num(profile.majorCityCount)||0)),
      economicHubCount:Math.max(0,Math.floor(num(profile.economicHubCount)||0)),militarySiteCount:Math.max(0,Math.floor(num(profile.militarySiteCount)||0)),
      strategicSiteCount:Math.max(0,Math.floor(num(profile.strategicSiteCount)||0)),capitalRecorded:!!profile.capitalRecorded,
      cityProfileCoverage:!!profile.cityProfileCoverage,urbanComplexityIndex:clamp(num(profile.urbanComplexityIndex)===null?num(profile.urbanizationPct)||45:num(profile.urbanComplexityIndex),0,100),
      roadQualityIndex:clamp(num(profile.roadQualityIndex)===null?35:num(profile.roadQualityIndex),10,100),
      mountainTerrainIndex:clamp(num(profile.mountainTerrainIndex)||0,0,100),coastalLogisticsIndex:clamp(num(profile.coastalLogisticsIndex)||0,0,100),
      industrialComplexityIndex:clamp(num(profile.industrialComplexityIndex)||0,0,100),remoteCoverageIndex:clamp(num(profile.remoteCoverageIndex)||0,0,100),
      terrainClass:profile.terrainClass||'MIXED_TERRAIN',profileSource:profile.source||'MODELED_COUNTRY_CONTEXT_FALLBACK',
      contextSource:profile.contextSource||'COUNTRY_CONTEXT_FALLBACK',contextIndexesAreMeasured:false};
  }
  function getCountryVehicleRecommendations(country,limit){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),profile=getCountryOperatingProfile(cid);
    const weights=profile.environmentMixPct||{},topEnvironment=Object.keys(weights).sort(function(a,b){return weights[b]-weights[a];})[0]||'city';
    const options=VEHICLES.map(function(vehicle){
      const totalWeight=Object.keys(weights).reduce(function(sum,key){return sum+Math.max(0,num(weights[key])||0);},0)||100;
      const rawFit=Object.keys(weights).reduce(function(sum,key){return sum+(Math.max(0,num(weights[key])||0)*Math.max(0,num(vehicle.environmentFit&&vehicle.environmentFit[key])||0));},0)/totalWeight;
      const economy=num(profile.economyCapacityIndex)===null?35:profile.economyCapacityIndex;
      const owned=Math.max(0,Math.floor(num(state.vehiclesOwned&&state.vehiclesOwned[String(vehicle.level)])||0));
      const ready=availableFleetUnits(state,vehicle.level).length;
      const lockedPenalty=vehicle.level>state.unlockedVehicleLevel&&owned===0?12+(vehicle.level-state.unlockedVehicleLevel)*1.5:0;
      const purchaseCostPenalty=Math.max(0,vehicle.cost/10000-economy/16)*1.2;
      const roadPenalty=profile.roadQualityIndex<40&&Number(vehicle.capabilities.offRoad)<45?(40-profile.roadQualityIndex)*0.12:0;
      const fitPct=Math.round(clamp(rawFit-roadPenalty,0,100)*10)/10;
      const planningScore=Math.round(clamp(fitPct-purchaseCostPenalty-lockedPenalty,0,100)*10)/10;
      return{level:vehicle.level,id:vehicle.id,name:vehicle.name,role:vehicle.role,className:vehicle.className,terrain:vehicle.terrain,
        fitPct:fitPct,planningScore:planningScore,environmentFit:Math.round((Number(vehicle.environmentFit&&vehicle.environmentFit[topEnvironment])||0)*10)/10,
        dominantEnvironment:topEnvironment,maintenancePerDay:vehicle.maintenancePerDay,cost:vehicle.cost,owned:owned,operationalUnits:ready,
        canDeploy:ready>0,procurementUnlocked:vehicle.level<=state.unlockedVehicleLevel,affordabilityPenalty:Math.round(purchaseCostPenalty*10)/10,
        roadPenalty:Math.round(roadPenalty*10)/10,source:'MODELED_COUNTRY_ENVIRONMENT_SUITABILITY',
        contextSource:'COUNTRY_GEOGRAPHY_CITY_NETWORK_AND_VEHICLE_CAPABILITIES'};
    });
    options.sort(function(a,b){return b.planningScore-a.planningScore||b.fitPct-a.fitPct||a.level-b.level;});
    return options.slice(0,Math.max(1,Math.min(15,Math.floor(num(limit)||5))));
  }
  function policeRulebookCostEstimate(country,input,suppliedState){
    const cid=normalizeCountry(country||currentCountry()),state=suppliedState||getState(cid);
    const validation=validatePoliceRulebook(input,state.policeRulebook);
    if(!validation.ok)return{ok:false,code:validation.code,errors:validation.errors,countryId:cid};
    const nextBook=validation.rulebook,currentBook=normalizePoliceRulebook(state.policeRulebook);
    if(JSON.stringify(currentBook)===JSON.stringify(nextBook)){
      const daily=policeRulebookDailyCost(state);
      return{ok:true,unchanged:true,countryId:cid,rulebook:nextBook,oneTimeCostUsd:0,currentDailyCostUsd:daily,newDailyCostUsd:daily,dailyCostDeltaUsd:0,operationalIndex:policeRulebookOperationalIndex(nextBook),qualityScore:policeRulebookQuality(nextBook)};
    }
    const headcount=Math.max(0,num(state.policeCount)||0),salary=Math.max(0,num(state.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY);
    const currentIndex=policeRulebookOperationalIndex(currentBook),nextIndex=policeRulebookOperationalIndex(nextBook);
    const baselinePayroll=headcount*salary+Math.max(0,num(state.specialAgents)||0)*AGENT_SALARY_PER_DAY;
    const currentDaily=policeRulebookDailyCost(state),nextState=Object.assign({},state,{policeRulebook:nextBook});
    const newDaily=policeRulebookDailyCost(nextState),scale=Math.sqrt(Math.max(1,headcount/1000));
    let oneTime=2500+Math.round(scale*450)+Math.round(baselinePayroll*0.12*Math.max(0,nextIndex-currentIndex));
    if(!currentBook.bodyCameraMandatory&&nextBook.bodyCameraMandatory)oneTime+=Math.round(Math.sqrt(Math.max(1,headcount))*70);
    if(!currentBook.searchWarrantRequired&&nextBook.searchWarrantRequired)oneTime+=Math.round(scale*1800);
    oneTime+=Math.round(Math.abs(nextBook.trainingDaysBeforeDeployment-currentBook.trainingDaysBeforeDeployment)*scale*30);
    oneTime=Math.max(1000,Math.round(oneTime));
    return{ok:true,unchanged:false,countryId:cid,rulebook:nextBook,oneTimeCostUsd:oneTime,currentDailyCostUsd:currentDaily,
      newDailyCostUsd:newDaily,dailyCostDeltaUsd:Math.round((newDaily-currentDaily)*100)/100,
      operationalIndex:nextIndex,currentOperationalIndex:currentIndex,qualityScore:policeRulebookQuality(nextBook),
      estimatedAnnualOperatingCostUsd:Math.round(newDaily*365*100)/100,
      estimatedAnnualCostDeltaUsd:Math.round((newDaily-currentDaily)*365*100)/100,financeCategory:'operations',financeRequired:true};
  }
  function updatePoliceRulebook(input,country){
    const cid=normalizeCountry(country||currentCountry()),current=getState(cid),estimate=policeRulebookCostEstimate(cid,input,current);
    if(!estimate.ok)return{ok:false,code:estimate.code,errors:estimate.errors||[],countryId:cid};
    if(estimate.unchanged)return{ok:true,code:'POLICE_RULEBOOK_UNCHANGED',countryId:cid,rulebook:estimate.rulebook,cost:0,
      oneTimeCostUsd:0,currentDailyCostUsd:estimate.currentDailyCostUsd,newDailyCostUsd:estimate.newDailyCostUsd,
      dailyCostDeltaUsd:0,qualityScore:estimate.qualityScore,crime:getCrimeSnapshot(cid,current)};
    const beforeBook=normalizePoliceRulebook(current.policeRulebook);
    return mutation(cid,estimate.oneTimeCostUsd,'POLICE_RULEBOOK_UPDATED',function(next){
      const before=policeRulebookQuality(beforeBook),after=policeRulebookQuality(estimate.rulebook),delta=after-before;
      next.policeRulebook=clone(estimate.rulebook);
      next.publicSatisfaction=clamp((num(next.publicSatisfaction)===null?55:num(next.publicSatisfaction))+clamp(delta*0.055,-4,4),0,100);
      next.policeTrust=clamp((num(next.policeTrust)===null?55:num(next.policeTrust))+clamp(delta*0.04,-3,3),0,100);
      next.misconductRiskPct=clamp((num(next.misconductRiskPct)===null?20:num(next.misconductRiskPct))-clamp(delta*0.055,-3,3),0,100);
      return{code:'POLICE_RULEBOOK_UPDATED',rulebook:clone(estimate.rulebook),cost:estimate.oneTimeCostUsd,oneTimeCostUsd:estimate.oneTimeCostUsd,
        currentDailyCostUsd:estimate.currentDailyCostUsd,newDailyCostUsd:estimate.newDailyCostUsd,dailyCostDeltaUsd:estimate.dailyCostDeltaUsd,
        qualityBefore:before,qualityScore:after,qualityDelta:Math.round(delta*10)/10,crime:getCrimeSnapshot(cid,next)};
    });
  }
  function estimatePoliceDepartmentPlanCost(country,input){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),validation=validatePoliceDepartmentPlan(input,state.policeDepartments);
    if(!validation.ok)return{ok:false,code:validation.code,errors:validation.errors,totalPct:validation.totalPct,countryId:cid};
    const current=normalizePoliceDepartmentPlan(state.policeDepartments),next=validation.plan;
    if(JSON.stringify(current)===JSON.stringify(next))return{ok:true,unchanged:true,countryId:cid,plan:next,oneTimeCostUsd:0,reassignedOfficers:0};
    const total=Math.max(0,Math.floor(num(state.policeCount)||0)),movedPct=Object.keys(next).reduce(function(sum,key){return sum+Math.abs(next[key]-current[key]);},0)/2;
    const salary=Math.max(0,num(state.dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY);
    const cost=Math.max(1000,Math.round(1500+Math.round(total*movedPct/100)*salary*0.10+Math.sqrt(Math.max(1,total/1000))*450));
    return{ok:true,unchanged:false,countryId:cid,plan:next,oneTimeCostUsd:cost,reassignedOfficers:Math.round(total*movedPct/100),
      movedSharePct:Math.round(movedPct*10)/10,financeCategory:'operations',financeRequired:true};
  }
  function setPoliceDepartmentPlan(input,country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),estimate=estimatePoliceDepartmentPlanCost(cid,input);
    if(!estimate.ok)return{ok:false,code:estimate.code,errors:estimate.errors||[],totalPct:estimate.totalPct,countryId:cid};
    if(estimate.unchanged)return{ok:true,code:'POLICE_DEPARTMENT_PLAN_UNCHANGED',countryId:cid,plan:estimate.plan,cost:0,headcounts:policeDepartmentHeadcounts(state)};
    const prior=normalizePoliceDepartmentPlan(state.policeDepartments);
    return mutation(cid,estimate.oneTimeCostUsd,'POLICE_DEPARTMENT_REALLOCATION',function(next){
      next.policeDepartments=clone(estimate.plan);
      const communityDelta=estimate.plan.community-prior.community;
      next.publicSatisfaction=clamp((num(next.publicSatisfaction)||55)+communityDelta*0.025,0,100);
      return{code:'POLICE_DEPARTMENT_PLAN_UPDATED',plan:clone(estimate.plan),oneTimeCostUsd:estimate.oneTimeCostUsd,
        reassignedOfficers:estimate.reassignedOfficers,movedSharePct:estimate.movedSharePct,headcounts:policeDepartmentHeadcounts(next),crime:getCrimeSnapshot(cid,next)};
    });
  }
  function policeDepartmentCatalog(){
    const labels={
      generalPatrol:['General patrol','Visible presence and first response',['theft','robbery','streetRobbery']],
      traffic:['Traffic police','Road incidents, congestion and vehicle checkpoints',['streetRobbery','contrabandSmuggling']],
      investigations:['Criminal investigations','Case building, suspect identification and clearance',['theft','robbery','homicide']],
      homicide:['Homicide investigation','Serious violence and homicide casework',['homicide']],
      cybercrime:['Cybercrime unit','Digital evidence and online offending',['cybercrime']],
      narcotics:['Narcotics unit','Drug markets and trafficking networks',['drugTrafficking']],
      border:['Border & customs police','Border corridors, smuggling and port access',['contrabandSmuggling','drugTrafficking']],
      community:['Community safety police','Victim reports, local engagement and de-escalation',['assault','streetRobbery','theft']],
      forensics:['Forensic officers','Evidence processing and laboratory support',['homicide','robbery','cybercrime']],
      rapidResponse:['Rapid response','Urgent callouts and high-risk incidents',['robbery','assault','homicide']]
    };
    return Object.keys(DEFAULT_POLICE_DEPARTMENT_PLAN).map(function(id){return{id:id,name:labels[id][0],description:labels[id][1],crimeCategories:labels[id][2],defaultPct:DEFAULT_POLICE_DEPARTMENT_PLAN[id]};});
  }
  const POLICE_CASE_TYPES=Object.freeze({
    missingPerson:{label:'Missing person',crimeCategory:null,baseCost:180},
    theft:{label:'Theft report',crimeCategory:'theft',baseCost:90},
    robbery:{label:'Robbery',crimeCategory:'robbery',baseCost:160},
    streetRobbery:{label:'Street robbery',crimeCategory:'streetRobbery',baseCost:130},
    drugTrafficking:{label:'Drug trafficking',crimeCategory:'drugTrafficking',baseCost:220},
    contrabandSmuggling:{label:'Contraband / smuggling',crimeCategory:'contrabandSmuggling',baseCost:220},
    assault:{label:'Assault / violence',crimeCategory:'assault',baseCost:160},
    homicide:{label:'Homicide investigation',crimeCategory:'homicide',baseCost:380},
    cybercrime:{label:'Cybercrime',crimeCategory:'cybercrime',baseCost:240}
  });
  function policeCasePriority(value){
    const key=String(value||'normal').toLowerCase();
    return ['low','normal','high','critical'].indexOf(key)>=0?key:null;
  }
  function policeCasePriorityFactor(value){
    return({low:0.75,normal:1,high:1.65,critical:2.6})[policeCasePriority(value)||'normal'];
  }
  function policeCaseResponseHours(caseType,priority,rulebook){
    const book=normalizePoliceRulebook(rulebook);
    if(caseType==='missingPerson')return priority==='critical'||priority==='high'?Math.min(book.missingPersonActionHours,book.highRiskResponseMinutes/60):book.missingPersonActionHours;
    if(priority==='critical'||priority==='high')return book.highRiskResponseMinutes/60;
    return book.arrestResponseHours;
  }
  function policeCaseFilingCostEstimate(caseType,priority,country){
    const cid=normalizeCountry(country||currentCountry()),type=POLICE_CASE_TYPES[String(caseType||'')],level=policeCasePriority(priority);
    if(!type)return{ok:false,code:'POLICE_CASE_TYPE_INVALID',countryId:cid};
    if(!level)return{ok:false,code:'POLICE_CASE_PRIORITY_INVALID',countryId:cid};
    const book=normalizePoliceRulebook(getState(cid).policeRulebook),hours=Math.max(0.25,policeCaseResponseHours(caseType,level,book));
    const cost=Math.round(type.baseCost*policeCasePriorityFactor(level)*(1+0.75/hours)*100)/100;
    return{ok:true,countryId:cid,caseType:String(caseType),caseLabel:type.label,priority:level,firstActionDeadlineHours:hours,
      oneTimeFilingCostUsd:cost,costMultiplier:Math.round((1+0.75/hours)*100)/100,financeCategory:'operations'};
  }
  function policeCaseActionCostEstimate(caseRow,action,state){
    const base={START_RESPONSE:45,REQUEST_WARRANT:75,DECIDE_WARRANT:65,ARREST:130,REVIEW_ARREST:45,
      FILE_EVIDENCE:70,CHARGE:85,RELEASE:35,RECORD_FORCE:55,REVIEW_FORCE:70,CLOSE_CASE:25,SEARCH:80};
    if(!base[action])return{ok:false,code:'POLICE_CASE_ACTION_INVALID'};
    const book=normalizePoliceRulebook(state&&state.policeRulebook),prio=policeCasePriorityFactor(caseRow&&caseRow.priority);
    let hours=book.arrestResponseHours;
    if(action==='START_RESPONSE')hours=Math.max(0.25,num(caseRow&&caseRow.firstActionDeadlineHours)||0.25);
    else if(action==='REQUEST_WARRANT'||action==='DECIDE_WARRANT')hours=book.warrantDecisionHours;
    else if(action==='REVIEW_ARREST')hours=book.arrestReviewHours;
    else if(action==='FILE_EVIDENCE')hours=book.evidenceSubmissionHours;
    else if(action==='REVIEW_FORCE')hours=book.forceReviewHours;
    hours=Math.max(0.25,num(hours)||0.25);
    return{ok:true,action:action,baseCostUsd:base[action],deadlineHours:hours,
      costUsd:Math.round(base[action]*prio*(1+0.35/hours)*100)/100,financeCategory:'operations'};
  }
  function getPoliceCaseSummary(state,nowMs){
    const rows=Array.isArray(state&&state.policeCases)?state.policeCases:[],now=nowMs===undefined?simulationTimeMs():Math.max(0,num(nowMs)||0);
    return{total:rows.length,open:rows.filter(function(row){return row.status!=='CLOSED';}).length,
      responseOverdue:rows.filter(function(row){return !!row.responseDeadlineMissed&&row.status!=='CLOSED';}).length,
      evidenceOverdue:rows.filter(function(row){return !!row.evidenceDeadlineMissed&&row.status!=='CLOSED';}).length,
      warrantOverdue:rows.filter(function(row){return !!row.warrantDeadlineMissed&&row.status!=='CLOSED';}).length,
      detentionReleaseRequired:rows.filter(function(row){return row.status==='RELEASE_REQUIRED';}).length,
      awaitingArrestReview:rows.filter(function(row){return !!row.arrestedAtMs&&!row.arrestReviewedAtMs&&!row.releasedAtMs;}).length,
      dueNow:rows.filter(function(row){return row.status!=='CLOSED'&&((!row.firstResponseAtMs&&now>=row.firstActionDueAtMs)||(row.warrantRequestedAtMs&&!row.warrantDecisionAtMs&&now>=row.warrantDecisionDueAtMs)||(row.arrestedAtMs&&!row.arrestReviewedAtMs&&now>=row.arrestReviewDueAtMs)||(row.forceUsedAtMs&&!row.forceReviewedAtMs&&now>=row.forceReviewDueAtMs));}).length};
  }
  function filePoliceCase(caseType,priority,description,country){
    const cid=normalizeCountry(country||currentCountry()),type=POLICE_CASE_TYPES[String(caseType||'')],level=policeCasePriority(priority);
    const estimate=policeCaseFilingCostEstimate(caseType,level,cid);
    if(!type)return{ok:false,code:'POLICE_CASE_TYPE_INVALID'};
    if(!level)return{ok:false,code:'POLICE_CASE_PRIORITY_INVALID'};
    const cleanDescription=String(description||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
    if(!cleanDescription)return{ok:false,code:'POLICE_CASE_DESCRIPTION_REQUIRED',message:'Add a short factual case description.'};
    if(!estimate.ok)return estimate;
    const now=Math.max(1,simulationTimeMs()),book=normalizePoliceRulebook(getState(cid).policeRulebook),firstActionHours=policeCaseResponseHours(caseType,level,book);
    return mutation(cid,estimate.oneTimeFilingCostUsd,'POLICE_CASE_FILED',function(next){
      const sequence=Math.max(1,Math.floor(num(next.nextPoliceCaseSequence)||1)),id='CASE-'+cid+'-'+turn()+'-'+sequence;
      const entry={id:id,countryId:cid,sequence:sequence,caseType:String(caseType),caseLabel:type.label,crimeCategory:type.crimeCategory,
        priority:level,description:cleanDescription,status:'OPEN',reportedAtMs:now,reportedAtTurn:turn(),
        firstActionDeadlineHours:firstActionHours,firstActionDueAtMs:now+firstActionHours*3600000,firstResponseAtMs:null,
        warrantRequestedAtMs:null,warrantDecisionDueAtMs:null,warrantDecision:null,warrantDecisionAtMs:null,
        evidenceSubmissionDueAtMs:now+book.evidenceSubmissionHours*3600000,evidenceFiledAtMs:null,
        arrestedAtMs:null,arrestReviewDueAtMs:null,arrestReviewedAtMs:null,detentionDeadlineAtMs:null,releasedAtMs:null,chargedAtMs:null,
        forceUsedAtMs:null,forceReviewDueAtMs:null,forceReviewedAtMs:null,
        responseDeadlineMissed:false,warrantDeadlineMissed:false,evidenceDeadlineMissed:false,arrestReviewOverdue:false,
        detentionDeadlineMissed:false,forceReviewOverdue:false,
        oneTimeFilingCostUsd:estimate.oneTimeFilingCostUsd,actionLog:[{action:'CASE_FILED',atMs:now,turn:turn(),costUsd:estimate.oneTimeFilingCostUsd}]};
      next.nextPoliceCaseSequence=sequence+1;next.policeCases=Array.isArray(next.policeCases)?next.policeCases:[];
      next.policeCases.unshift(entry);next.policeCases=next.policeCases.slice(0,200);
      return{caseRecord:clone(entry),oneTimeFilingCostUsd:estimate.oneTimeFilingCostUsd,
        firstActionDeadlineHours:firstActionHours,caseSummary:getPoliceCaseSummary(next,now)};
    });
  }
  function recordPoliceCaseAction(caseId,action,country,decision){
    const cid=normalizeCountry(country||currentCountry()),id=String(caseId||'').trim(),kind=String(action||'').toUpperCase();
    if(!id)return{ok:false,code:'POLICE_CASE_ID_REQUIRED'};
    const current=getState(cid),found=(current.policeCases||[]).find(function(row){return row.id===id;});
    if(!found)return{ok:false,code:'POLICE_CASE_NOT_FOUND',caseId:id};
    if(found.status==='CLOSED')return{ok:false,code:'POLICE_CASE_ALREADY_CLOSED'};
    const now=Math.max(1,simulationTimeMs()),book=normalizePoliceRulebook(current.policeRulebook);
    if(kind==='DECIDE_WARRANT'&&['APPROVED','DENIED'].indexOf(String(decision||'').toUpperCase())<0)
      return{ok:false,code:'POLICE_WARRANT_DECISION_INVALID',message:'Choose APPROVED or DENIED.'};
    if(kind==='START_RESPONSE'&&found.firstResponseAtMs)return{ok:false,code:'POLICE_CASE_RESPONSE_ALREADY_RECORDED'};
    if(kind==='REQUEST_WARRANT'&&found.warrantRequestedAtMs)return{ok:false,code:'POLICE_WARRANT_ALREADY_REQUESTED'};
    if(kind==='DECIDE_WARRANT'&&(!found.warrantRequestedAtMs||found.warrantDecisionAtMs))return{ok:false,code:'POLICE_WARRANT_NOT_PENDING'};
    if(kind==='ARREST'&&(!found.firstResponseAtMs||found.arrestedAtMs||found.releasedAtMs||found.chargedAtMs))
      return{ok:false,code:'POLICE_ARREST_STAGE_INVALID',message:'Record first response; case must not already have an arrest, charge or release.'};
    if(kind==='REVIEW_ARREST'&&(!found.arrestedAtMs||found.arrestReviewedAtMs||found.releasedAtMs))
      return{ok:false,code:'POLICE_ARREST_REVIEW_STAGE_INVALID'};
    if(kind==='FILE_EVIDENCE'&&(!found.firstResponseAtMs||found.evidenceFiledAtMs))return{ok:false,code:'POLICE_EVIDENCE_STAGE_INVALID'};
    if(kind==='CHARGE'&&(!found.arrestedAtMs||!found.arrestReviewedAtMs||!found.evidenceFiledAtMs||found.releasedAtMs))
      return{ok:false,code:'POLICE_DUE_PROCESS_REQUIREMENTS_UNMET',message:'Charge requires an arrest, completed arrest review and evidence filing. Release a detained person if the detention deadline has passed.'};
    if(kind==='CHARGE'&&found.detentionDeadlineAtMs&&now>=found.detentionDeadlineAtMs)return{ok:false,code:'POLICE_DETENTION_DEADLINE_EXCEEDED',message:'The pre-charge detention deadline has passed; release is required before any further case action.'};
    if(kind==='RELEASE'&&(!found.arrestedAtMs||found.releasedAtMs||found.chargedAtMs))return{ok:false,code:'POLICE_RELEASE_STAGE_INVALID'};
    if(kind==='RECORD_FORCE'&&found.forceUsedAtMs)return{ok:false,code:'POLICE_FORCE_ALREADY_RECORDED'};
    if(kind==='REVIEW_FORCE'&&(!found.forceUsedAtMs||found.forceReviewedAtMs))return{ok:false,code:'POLICE_FORCE_REVIEW_STAGE_INVALID'};
    if(kind==='SEARCH'&&book.searchWarrantRequired&&found.warrantDecision!=='APPROVED'&&found.priority!=='critical')
      return{ok:false,code:'POLICE_SEARCH_WARRANT_REQUIRED',message:'A search warrant must be approved before this search; critical emergencies may use the documented emergency exception.'};
    if(kind==='SEARCH'&&found.searchAtMs)return{ok:false,code:'POLICE_SEARCH_ALREADY_RECORDED'};
    if(kind==='CLOSE_CASE'&&(found.arrestedAtMs&&!found.releasedAtMs&&!found.chargedAtMs||found.forceUsedAtMs&&!found.forceReviewedAtMs))
      return{ok:false,code:'POLICE_CASE_CLOSURE_REQUIREMENTS_UNMET',message:'Resolve active detention and complete use-of-force review before closing.'};
    const estimate=policeCaseActionCostEstimate(found,kind,current);
    if(!estimate.ok)return{ok:false,code:estimate.code};
    return mutation(cid,estimate.costUsd,'POLICE_CASE_'+kind,function(next){
      const row=(next.policeCases||[]).find(function(item){return item.id===id;});
      if(!row)return{ok:false,code:'POLICE_CASE_NOT_FOUND'};
      const previousStatus=row.status,log={action:kind,atMs:now,turn:turn(),costUsd:estimate.costUsd};
      if(kind==='START_RESPONSE'){
        row.firstResponseAtMs=now;row.status='UNDER_INVESTIGATION';row.responseOnTime=now<=row.firstActionDueAtMs;
        if(row.responseOnTime){next.publicSatisfaction=clamp(next.publicSatisfaction+0.12*policeCasePriorityFactor(row.priority),0,100);next.policeTrust=clamp(next.policeTrust+0.08,0,100);}
      }else if(kind==='REQUEST_WARRANT'){
        row.warrantRequestedAtMs=now;row.warrantDecisionDueAtMs=now+book.warrantDecisionHours*3600000;row.status='WARRANT_PENDING';
      }else if(kind==='DECIDE_WARRANT'){
        row.warrantDecision=String(decision).toUpperCase();row.warrantDecisionAtMs=now;row.status='UNDER_INVESTIGATION';
        if(now<=row.warrantDecisionDueAtMs){next.policeTrust=clamp(next.policeTrust+0.08,0,100);next.publicSatisfaction=clamp(next.publicSatisfaction+0.06,0,100);}
      }else if(kind==='ARREST'){
        row.arrestedAtMs=now;row.arrestReviewDueAtMs=now+book.arrestReviewHours*3600000;row.detentionDeadlineAtMs=now+book.maximumDetentionHours*3600000;row.status='ARRESTED';
      }else if(kind==='REVIEW_ARREST'){
        row.arrestReviewedAtMs=now;row.arrestReviewOnTime=now<=row.arrestReviewDueAtMs;row.status='ARREST_REVIEWED';
        next.policeTrust=clamp(next.policeTrust+(row.arrestReviewOnTime?0.12:-0.08),0,100);
        if(row.arrestReviewOnTime)next.misconductRiskPct=clamp(next.misconductRiskPct-0.15,0,100);
      }else if(kind==='FILE_EVIDENCE'){
        row.evidenceFiledAtMs=now;row.evidenceOnTime=now<=row.evidenceSubmissionDueAtMs;
        next.policeEfficiency=clamp(next.policeEfficiency+(row.evidenceOnTime?0.05:-0.06),0,100);
      }else if(kind==='CHARGE'){
        row.chargedAtMs=now;row.status='CHARGED';
        next.crimeModel=next.crimeModel||{totalIncidents:0,openedCases:0,clearedCases:0};
        next.crimeModel.clearedCases=Math.max(0,Math.floor(num(next.crimeModel.clearedCases)||0))+1;
        next.justiceBacklog=Math.max(0,Math.floor(num(next.justiceBacklog)||0)-1);
        next.publicSatisfaction=clamp(next.publicSatisfaction+0.15,0,100);
      }else if(kind==='RELEASE'){
        row.releasedAtMs=now;row.status='RELEASED';next.policeTrust=clamp(next.policeTrust+0.1,0,100);
      }else if(kind==='RECORD_FORCE'){
        row.forceUsedAtMs=now;row.forceReviewDueAtMs=now+book.forceReviewHours*3600000;row.status='FORCE_REVIEW_REQUIRED';
      }else if(kind==='REVIEW_FORCE'){
        row.forceReviewedAtMs=now;row.forceReviewOnTime=now<=row.forceReviewDueAtMs;row.status='UNDER_INVESTIGATION';
        next.misconductRiskPct=clamp(next.misconductRiskPct+(row.forceReviewOnTime?-0.12:0.25),0,100);
        next.publicSatisfaction=clamp(next.publicSatisfaction+(row.forceReviewOnTime?0.08:-0.2),0,100);
      }else if(kind==='SEARCH'){
        row.searchAtMs=now;row.searchAuthority=row.warrantDecision==='APPROVED'?'WARRANT_APPROVED':'CRITICAL_EMERGENCY_EXCEPTION';
      }else if(kind==='CLOSE_CASE'){
        row.closedAtMs=now;row.status='CLOSED';
      }
      log.statusBefore=previousStatus;log.statusAfter=row.status;row.actionLog=Array.isArray(row.actionLog)?row.actionLog:[];row.actionLog.push(log);row.actionLog=row.actionLog.slice(-40);
      return{caseRecord:clone(row),caseAction:kind,actionCostUsd:estimate.costUsd,
        caseSummary:getPoliceCaseSummary(next,now),crime:getCrimeSnapshot(cid,next)};
    });
  }
  function processPoliceCaseDeadlines(state,country,now){
    const rows=Array.isArray(state&&state.policeCases)?state.policeCases:[];if(!rows.length)return false;
    const at=Math.max(0,num(now)||0);let anyChanged=false;
    rows.forEach(function(row){
      if(!row||row.status==='CLOSED')return;
      let caseChanged=false;
      if(!row.firstResponseAtMs&&!row.responseDeadlineMissed&&at>Number(row.firstActionDueAtMs||0)){
        row.responseDeadlineMissed=true;row.responseOverdueAtMs=at;
        const penalty=policeCasePriorityFactor(row.priority);
        state.publicSatisfaction=clamp(state.publicSatisfaction-0.12*penalty,0,100);
        state.policeTrust=clamp(state.policeTrust-0.08*penalty,0,100);caseChanged=true;
      }
      if(row.warrantRequestedAtMs&&!row.warrantDecisionAtMs&&!row.warrantDeadlineMissed&&at>Number(row.warrantDecisionDueAtMs||0)){
        row.warrantDeadlineMissed=true;row.warrantOverdueAtMs=at;
        state.publicSatisfaction=clamp(state.publicSatisfaction-0.08,0,100);caseChanged=true;
      }
      if(row.firstResponseAtMs&&!row.evidenceFiledAtMs&&!row.evidenceDeadlineMissed&&at>Number(row.evidenceSubmissionDueAtMs||0)){
        row.evidenceDeadlineMissed=true;row.evidenceOverdueAtMs=at;
        state.policeEfficiency=clamp(state.policeEfficiency-0.05,0,100);
        state.justiceBacklog=Math.max(0,Math.floor(num(state.justiceBacklog)||0))+1;caseChanged=true;
      }
      if(row.arrestedAtMs&&!row.arrestReviewedAtMs&&!row.arrestReviewOverdue&&at>Number(row.arrestReviewDueAtMs||0)){
        row.arrestReviewOverdue=true;row.arrestReviewOverdueAtMs=at;
        state.misconductRiskPct=clamp(state.misconductRiskPct+0.15,0,100);
        state.policeTrust=clamp(state.policeTrust-0.1,0,100);caseChanged=true;
      }
      if(row.arrestedAtMs&&!row.chargedAtMs&&!row.releasedAtMs&&row.detentionDeadlineAtMs&&at>=Number(row.detentionDeadlineAtMs)&&!row.detentionDeadlineMissed){
        row.detentionDeadlineMissed=true;row.status='RELEASE_REQUIRED';row.detentionDeadlineMissedAtMs=at;
        state.misconductRiskPct=clamp(state.misconductRiskPct+0.2,0,100);
        state.publicSatisfaction=clamp(state.publicSatisfaction-0.15,0,100);caseChanged=true;
      }
      if(row.forceUsedAtMs&&!row.forceReviewedAtMs&&!row.forceReviewOverdue&&at>Number(row.forceReviewDueAtMs||0)){
        row.forceReviewOverdue=true;row.forceReviewOverdueAtMs=at;
        state.misconductRiskPct=clamp(state.misconductRiskPct+0.15,0,100);
        state.publicSatisfaction=clamp(state.publicSatisfaction-0.1,0,100);caseChanged=true;
      }
      if(caseChanged){
        if(!Array.isArray(row.actionLog))row.actionLog=[];
        if(row.actionLog.length<40)row.actionLog.push({action:'DEADLINE_REVIEW',atMs:at,turn:turn()});
        anyChanged=true;
      }
    });
    state.policeCases=rows.slice(0,200);
    return anyChanged;
  }
  const api=Object.freeze({
    VERSION:VERSION,POLICE_SALARY_PER_DAY:POLICE_SALARY_PER_DAY,POLICE_RECRUITMENT_COST:POLICE_RECRUITMENT_COST,
    AGENT_RECRUITMENT_COST:AGENT_RECRUITMENT_COST,AGENT_SALARY_PER_DAY:AGENT_SALARY_PER_DAY,VEHICLE_UNLOCK_MS:VEHICLE_UNLOCK_MS,
    VEHICLES:VEHICLES,GUARD_MISSIONS:GUARD_MISSIONS,FACILITIES:FACILITIES,TACTICS:TACTICS,init:init,getCurrentCountryId:currentCountry,
    getState:function(country){return clone(getState(country));},getTreasury:function(country){return clone(getTreasury(country||currentCountry()));},getSimulationTimeMs:simulationTimeMs,
    getDailyPayroll:function(country){return dailyPayroll(getState(country||currentCountry()));},getDailyOperatingCost:function(country){return dailyOperatingCost(getState(country||currentCountry()));},getAvailableCountries:availableCountries,
    getResearchProgress:function(country){const s=getState(country||currentCountry()),p=s.pendingResearch;if(!p)return null;const remain=Math.max(0,p.completesAtMs-simulationTimeMs());return{id:p.id,name:p.name,startedAtMs:p.startedAtMs,completesAtMs:p.completesAtMs,remainingMs:remain,progress:clamp(100*(1-remain/Math.max(1,p.durationDays*DAY_MS)),0,100)};},
    formatMoney:money,getHomeBudgetSnapshot:getHomeBudgetSnapshot,setHomeBudgetPlan:setHomeBudgetPlan,
    getFuelSnapshot:function(country){return clone(getFuelSnapshot(country||currentCountry(),getState(country||currentCountry())));},getDailyFuelCost:function(country){return dailyFuelCost(getState(country||currentCountry()));},purchaseFuelSupply:purchaseFuelSupply,
    estimateRecruitCost:function(amount,country){const s=getState(country||currentCountry());return Math.max(0,Math.floor(num(amount)||0))*Math.max(0,num(s.recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);},
    getPoliceSalaryPerDay:function(country){return Math.max(0,num(getState(country||currentCountry()).dailySalaryPerOfficerUsd)||POLICE_SALARY_PER_DAY);},
    getRecruitmentFeePerOfficer:function(country){return Math.max(0,num(getState(country||currentCountry()).recruitmentFeePerOfficerUsd)||POLICE_RECRUITMENT_COST);},
    validateCountryPoliceBaselineRows:validateCountryPoliceBaselineRows,loadCountryPoliceBaselines:loadCountryPoliceBaselines,bootstrapCountryPoliceBaselines:bootstrapCountryPoliceBaselines,
    getCountryOperatingProfile:getCountryOperatingProfile,getCountryVehicleRecommendations:getCountryVehicleRecommendations,
    getPoliceRulebook:function(country){return normalizePoliceRulebook(getState(country||currentCountry()).policeRulebook);},
    getPoliceRulebookQuality:function(country){return policeRulebookQuality(getState(country||currentCountry()).policeRulebook);},
    getPoliceRulebookOperationalIndex:function(country){return policeRulebookOperationalIndex(getState(country||currentCountry()).policeRulebook);},
    validatePoliceRulebook:function(input,country){return validatePoliceRulebook(input,getState(country||currentCountry()).policeRulebook);},
    getPoliceRulebookCosts:policeRulebookCostEstimate,updatePoliceRulebook:updatePoliceRulebook,
    getPoliceDepartmentPlan:function(country){return normalizePoliceDepartmentPlan(getState(country||currentCountry()).policeDepartments);},
    getPoliceDepartmentCatalog:policeDepartmentCatalog,
    getPoliceDepartmentHeadcounts:function(country){return policeDepartmentHeadcounts(getState(country||currentCountry()));},
    getPoliceCaseTypes:function(){return clone(POLICE_CASE_TYPES);},
    getPoliceCases:function(country){return clone((getState(country||currentCountry()).policeCases||[]).slice(0,200));},
    getPoliceCaseSummary:function(country){return getPoliceCaseSummary(getState(country||currentCountry()),simulationTimeMs());},
    estimatePoliceCaseFilingCost:policeCaseFilingCostEstimate,filePoliceCase:filePoliceCase,recordPoliceCaseAction:recordPoliceCaseAction,
    validatePoliceDepartmentPlan:function(input,country){return validatePoliceDepartmentPlan(input,getState(country||currentCountry()).policeDepartments);},
    estimatePoliceDepartmentPlanCost:estimatePoliceDepartmentPlanCost,setPoliceDepartmentPlan:setPoliceDepartmentPlan,
    getCountryPoliceBaseline:function(country){return clone(findPoliceBaseline(country));},
    getCountryFleetSnapshot:getCountryFleetSnapshot,getWorldFleetSnapshot:getWorldFleetSnapshot,
    getCrimeSnapshot:getCrimeSnapshot,estimateRecruitmentImpact:estimateRecruitmentImpact,
    getPolicePolicyRules:function(){return clone(POLICE_POLICY_RULES);},
    setPatrolPlan:function(plan,country){
      const cid=normalizeCountry(country||currentCountry()),nextPlan=normalizePatrolPlan(plan),total=Object.values(nextPlan).reduce(function(sum,value){return sum+value;},0);
      if(total>100.0001)return{ok:false,code:'PATROL_PLAN_OVERALLOCATED',message:'Patrol allocations cannot exceed 100%.',totalPct:total};
      const minimum=normalizePoliceRulebook(getState(cid).policeRulebook).minimumPatrolCoveragePct;
      if(total+0.0001<minimum)return{ok:false,code:'PATROL_PLAN_BELOW_RULEBOOK_MINIMUM',message:'Patrol coverage cannot fall below the selected Police Rulebook minimum.',minimumPatrolCoveragePct:minimum,totalPct:total};
      return mutation(cid,0,'POLICE_PATROL_PLAN_UPDATED',function(s){s.patrolPlan=nextPlan;return{patrolPlan:clone(nextPlan),totalPct:total,minimumPatrolCoveragePct:minimum,crime:getCrimeSnapshot(cid,Object.assign(clone(s),{patrolPlan:nextPlan}))};});
    },
    setPolicePolicyRule:function(ruleId,enabled,country){const cid=normalizeCountry(country||currentCountry()),rule=POLICE_POLICY_RULES.find(function(row){return row.id===String(ruleId);});if(!rule)return{ok:false,code:'POLICE_POLICY_RULE_INVALID'};const activate=!!enabled,state=getState(cid);if(!!state.policeRules[rule.id]===activate)return{ok:true,code:'POLICE_POLICY_UNCHANGED',rule:clone(rule),state:publicState(state),crime:getCrimeSnapshot(cid,state)};const action='POLICE_'+(rule.department==='training'?'TRAINING_':rule.department==='facilities'?'FACILITY_':'POLICY_')+rule.id.toUpperCase();return mutation(cid,activate?rule.setupCostUsd:0,action,function(next){next.policeRules[rule.id]=activate;const direction=activate?1:-1;next.publicSatisfaction=clamp(next.publicSatisfaction+rule.trustDelta*direction,0,100);next.policeTrust=clamp(next.policeTrust+rule.trustDelta*direction,0,100);if(rule.misconductMultiplier&&rule.misconductMultiplier!==1){next.misconductRiskPct=clamp(activate?next.misconductRiskPct*rule.misconductMultiplier:next.misconductRiskPct/rule.misconductMultiplier,0,100);}next.privacyRiskPct=clamp(next.privacyRiskPct+rule.privacyDelta*direction,0,100);return{rule:clone(rule),enabled:activate,setupCostUsd:activate?rule.setupCostUsd:0,dailyOperatingCostUsd:ruleDailyCost(next),crime:getCrimeSnapshot(cid,next)};});},
    estimateVehicleCost:function(level,amount){const v=VEHICLES.find(x=>x.level===Math.floor(num(level)||0));return v?v.cost*Math.max(0,Math.floor(num(amount)||0)):null;},
    estimateFacilityCost:function(id,amount,country){return estimateFacilityCostFrom(getState(country||currentCountry()),id,amount);},
    estimateTrainingCost:function(target,country){return estimateTrainingCostFrom(getState(country||currentCountry()),Math.floor(num(target)||0));},
    advice:advice,recruitPolice:recruitPolice,firePolice:firePolice,orderVehicle:orderVehicle,buildFacility:buildFacility,
    getGuardCapacity:guardCapacity,getGuardDeploymentPreview:guardPreview,deployGuard:deployGuard,standDownGuard:standDownGuard,getGuardEffectiveness:guardEffectiveness,getOperatingEnvironments:function(){return clone(OPERATING_ENVIRONMENTS);},getRoadConditions:function(){return clone(ROAD_CONDITIONS);},getVehicleUseAssessment:vehicleUseAssessment,getVehicleRecommendations:vehicleRecommendations,getVehicleFleet:vehicleFleetSummary,serviceVehicle:serviceVehicle,estimateVehicleRepairCost:estimateVehicleRepairCost,getGuardableAssets:function(country){return clone(guardableAssets(country||currentCountry()));},getGuardCoverageForIncident:function(type,country,targetAssetId){return guardCoverageForIncident(getState(country||currentCountry()),String(type||''),targetAssetId||null);},
    startResearch:startResearch,upgradeTraining:upgradeTraining,recruitAgents:recruitAgents,issueMinisterDirective:issueMinisterDirective,
    getPoliceCapabilityUpgradeQuote:estimatePoliceCapabilityUpgrade,
    startPoliceCapabilityUpgrade:startPoliceCapabilityUpgrade,
    getPoliceCapabilityState:function(country){const cid=normalizeCountry(country||currentCountry()),s=getState(cid);return{countryId:cid,trainingLevel:s.trainingQualityLevel,recruitmentLevel:s.policeRecruitmentLevel,academyLevel:num(s.facilityLevels&&s.facilityLevels.academy)||0,departmentLevel:num(s.facilityLevels&&s.facilityLevels.department)||0,policeCount:s.policeCount,recruitmentFeePerOfficerUsd:s.recruitmentFeePerOfficerUsd,pendingProjects:clone((s.pendingCapabilityProjects||[]).filter(function(p){return p&&p.status==='IN_PROGRESS';})),completedProjects:clone(s.completedCapabilityProjects||[])};},
    processTurn:onTurnCommitted,applyExistingAssetIncident:markExistingAsset
  });
  g.Omega=g.Omega||{};g.Omega.HomeMinistry=api;g.OmegaHomeMinistryEngine=api;
  registerHandlers();if(typeof g.addEventListener==='function'&&!g.__OMEGA_HOME_POLICE_TURN_LISTENER__){g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurnCommitted);g.__OMEGA_HOME_POLICE_TURN_LISTENER__=true;}
})(typeof window!=='undefined'?window:globalThis);
