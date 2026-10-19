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

  const DEFAULT_STATE = Object.freeze({
    schemaVersion:1, policeCount:250, policeEfficiency:60, policeTrust:55,
    unlockedVehicleLevel:1, vehiclesOwned:{}, pendingVehicleOrder:null,
    facilityLevels:{station:1,patrol:1,academy:1,department:1,dispatch:0,forensics:0,border:0,cyber:0,emergency:0,communications:0},
    trainingQualityLevel:1,
    tacticsResearched:{antiRiot:false,smugglerInterdict:false,counterTerror:false,assetProtection:false,intelligenceFusion:false},
    pendingResearch:null, specialAgents:0, sabotageRisk:45, unpaidPayroll:0,
    lastPayrollDay:null, lastIncidentWeek:null, incidentSequence:0, incidentLedger:[], lastUpdatedTurn:0, agentDeployments:{}, intelligenceReports:[], lastIntelWeek:null,
    guardDeployments:[], nextGuardDeploymentId:1, vehicleFleet:[], nextVehicleUnitId:1, vehicleMaintenanceLog:[], lastFleetSimulationDay:null,
    homeBudget:{parentAllocationUsd:0,categories:{salary:{sharePct:30,amountUsd:0,spentUsd:0},vehicles:{sharePct:30,amountUsd:0,spentUsd:0},maintenance:{sharePct:25,amountUsd:0,spentUsd:0},operations:{sharePct:15,amountUsd:0,spentUsd:0}},updatedTurn:0,ledger:[]}
  });

  function clone(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);const o={};Object.keys(v).forEach(k=>{if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function')o[k]=clone(v[k]);});return o;}
  function num(v){const n=Number(v);return v!==null&&v!==''&&Number.isFinite(n)?n:null;}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function normalizeCountry(value){
    let raw=String(value||'').trim();if(!raw)return '';
    try{const r=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega&&g.Omega.CanonicalIdentity;const hit=r&&typeof r.resolveCountry==='function'?r.resolveCountry(raw):null;if(hit&&hit.id)raw=String(hit.id);}catch(_){}
    return raw.toUpperCase().replace(/[-\s]+/g,'_');
  }
  function currentCountry(candidate){
    const sim=g.Omega&&g.Omega.Simulation;
    const raw=candidate||(sim&&typeof sim.getPlayerCountryId==='function'&&sim.getPlayerCountryId())||
      (g.CountryIOS&&g.CountryIOS.activeCountry)||g.currentActiveCountry||
      (g.Game&&(g.Game.currentActiveCountry||g.Game.playerCountry||g.Game.countryId))||g.playerCountry||'USA';
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
  function debitTreasury(country,amount){
    const cost=Math.max(0,num(amount)||0);if(!cost)return{ok:true,amount:0,previous:[]};
    const cid=normalizeCountry(country),records=treasuryRecords(cid);if(!records.length)return{ok:false,reason:'TREASURY_DATA_UNAVAILABLE'};
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
    const s=Object.assign(d,clone(raw));s.facilityLevels=Object.assign(clone(DEFAULT_STATE.facilityLevels),raw.facilityLevels||{});
    s.tacticsResearched=Object.assign(clone(DEFAULT_STATE.tacticsResearched),raw.tacticsResearched||{});
    s.vehiclesOwned=Object.assign({},raw.vehiclesOwned||{});s.agentDeployments=Object.assign({},raw.agentDeployments||{});s.homeBudget=raw.homeBudget&&typeof raw.homeBudget==='object'?clone(raw.homeBudget):clone(DEFAULT_STATE.homeBudget);s.homeBudget.categories=Object.assign(clone(DEFAULT_STATE.homeBudget.categories),s.homeBudget.categories||{});s.homeBudget.ledger=Array.isArray(s.homeBudget.ledger)?s.homeBudget.ledger.slice(-100):[];s.intelligenceReports=Array.isArray(raw.intelligenceReports)?raw.intelligenceReports.slice(-100).map(clone):[];s.incidentLedger=Array.isArray(raw.incidentLedger)?raw.incidentLedger.slice(-100).map(clone):[];s.guardDeployments=Array.isArray(raw.guardDeployments)?raw.guardDeployments.filter(x=>x&&typeof x==='object'&&x.id&&x.vehicleLevel&&x.missionId).map(clone):[];if(!Number.isFinite(Number(s.nextGuardDeploymentId))||Number(s.nextGuardDeploymentId)<1)s.nextGuardDeploymentId=1;s.vehicleFleet=Array.isArray(raw.vehicleFleet)?raw.vehicleFleet.filter(x=>x&&typeof x==='object'&&x.id&&x.vehicleLevel).map(clone):[];if(!Number.isFinite(Number(s.nextVehicleUnitId))||Number(s.nextVehicleUnitId)<1)s.nextVehicleUnitId=1;s.vehicleMaintenanceLog=Array.isArray(raw.vehicleMaintenanceLog)?raw.vehicleMaintenanceLog.slice(-100).map(clone):[];
    if(num(s.policeCount)===null)s.policeCount=250;if(num(s.policeEfficiency)===null)s.policeEfficiency=60;if(num(s.policeTrust)===null)s.policeTrust=55;
    if(num(s.unlockedVehicleLevel)===null)s.unlockedVehicleLevel=1;return s;
  }
  function storedState(country){const root=rootState(),raw=root&&root.interior&&root.interior[country]&&root.interior[country].police;return raw&&typeof raw==='object'?mergeState(raw):null;}
  function publicState(s){return{homeBudget:clone(s.homeBudget),policeCount:s.policeCount,policeEfficiency:s.policeEfficiency,policeTrust:s.policeTrust,unlockedVehicleLevel:s.unlockedVehicleLevel,vehiclesOwned:clone(s.vehiclesOwned),pendingVehicleOrder:clone(s.pendingVehicleOrder),facilityLevels:clone(s.facilityLevels),trainingQualityLevel:s.trainingQualityLevel,tacticsResearched:clone(s.tacticsResearched),pendingResearch:clone(s.pendingResearch),specialAgents:s.specialAgents,sabotageRisk:s.sabotageRisk,unpaidPayroll:s.unpaidPayroll,agentDeployments:clone(s.agentDeployments),intelligenceReports:clone(s.intelligenceReports),incidentLedger:clone(s.incidentLedger),guardDeployments:clone(s.guardDeployments),nextGuardDeploymentId:s.nextGuardDeploymentId,vehicleFleet:clone(s.vehicleFleet),nextVehicleUnitId:s.nextVehicleUnitId,vehicleMaintenanceLog:clone(s.vehicleMaintenanceLog),lastFleetSimulationDay:s.lastFleetSimulationDay};}
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
  function money(value){const n=num(value);return n===null?'Unavailable':'$'+Math.round(n).toLocaleString('en-US');}
  function financeApi(){return g.OmegaFinanceMinistry||g.Omega&&g.Omega.FinanceMinistry||null;}
  function financeInteriorAllocation(country){
    const fm=financeApi();if(!fm||typeof fm.getFinanceState!=='function')return null;
    try{const state=fm.getFinanceState(country);return state&&state.allocations&&state.allocations.interior||null;}catch(_){return null;}
  }
  function budgetCategoryForAction(action){
    const a=String(action||'').toUpperCase();
    if(/RECRUIT|DISMISS|AGENT|PAYROLL/.test(a))return 'salary';
    if(/VEHICLE_ORDER|PROCUREMENT/.test(a))return 'vehicles';
    if(/REPAIR|SERVICE|MAINTENANCE/.test(a))return 'maintenance';
    return 'operations';
  }
  function budgetRemaining(state,category){
    const row=state&&state.homeBudget&&state.homeBudget.categories&&state.homeBudget.categories[category];
    return row?Math.max(0,(num(row.amountUsd)||0)-(num(row.spentUsd)||0)):0;
  }
  function configureHomeBudget(parentAmount,shares,country){
    const cid=normalizeCountry(country||currentCountry()),amount=num(parentAmount);
    if(!cid)return{ok:false,reason:'PLAYER_COUNTRY_UNAVAILABLE'};
    if(amount===null||amount<=0)return{ok:false,reason:'HOME_BUDGET_AMOUNT_INVALID'};
    const parent=financeInteriorAllocation(cid);
    if(!parent||Math.max(0,num(parent.budgetUsd)||0)+0.01<amount)
      return{ok:false,reason:'FINANCE_INTERIOR_ALLOCATION_REQUIRED',message:'Allocate this amount to Home / Interior in the Finance Ministry first.'};
    shares=shares&&typeof shares==='object'?shares:{};
    const defaults={salary:30,vehicles:30,maintenance:25,operations:15};
    const nextShares={};let total=0;
    Object.keys(defaults).forEach(key=>{const v=num(shares[key]??defaults[key]);if(v===null||v<0||v>100)throw new Error('HOME_BUDGET_SHARE_INVALID');nextShares[key]=v;total+=v;});
    if(total>100.00001)return{ok:false,reason:'HOME_BUDGET_SHARES_EXCEED_100',message:'Home Ministry category shares cannot exceed 100%.'};
    const state=getState(cid),next=clone(state),old=next.homeBudget||clone(DEFAULT_STATE.homeBudget);
    for(const key of Object.keys(defaults)){
      const prior=old.categories[key]||{},spent=Math.max(0,num(prior.spentUsd)||0),budget=amount*nextShares[key]/100;
      if(budget+0.01<spent)return{ok:false,reason:'HOME_BUDGET_BELOW_SPENT',message:'A category budget cannot be reduced below already-recorded spending.'};
      old.categories[key]={sharePct:nextShares[key],amountUsd:budget,spentUsd:spent};
    }
    old.parentAllocationUsd=amount;old.updatedTurn=turn();old.ledger=Array.isArray(old.ledger)?old.ledger:[];
    old.ledger.push({turn:turn(),action:'INTERNAL_BUDGET_CONFIGURED',parentAllocationUsd:amount,shares:clone(nextShares)});
    old.ledger=old.ledger.slice(-100);next.homeBudget=old;next.lastUpdatedTurn=turn();
    const commit=dispatchState(cid,next,'OMEGA_HOME_BUDGET_UPDATED');
    if(!commit.ok)return{ok:false,reason:commit.reason||'STATE_COMMAND_FAILED'};
    emit('OMEGA_HOME_BUDGET_UPDATED',{countryId:cid,budget:clone(old),turn:turn()});
    return{ok:true,countryId:cid,budget:clone(old)};
  }
  function getHomeBudgetSnapshot(country){
    const cid=normalizeCountry(country||currentCountry()),state=getState(cid),parent=financeInteriorAllocation(cid),budget=state.homeBudget||clone(DEFAULT_STATE.homeBudget);
    const parentAmount=parent?Math.max(0,num(parent.budgetUsd)||0):0,parentRemaining=parent?Math.max(0,num(parent.remainingUsd)||0):0;
    return{countryId:cid,financeAvailable:!!parent,parentAllocationUsd:parentAmount,parentRemainingUsd:parentRemaining,
      internal:clone(budget),categories:Object.keys(budget.categories||{}).map(key=>Object.assign({id:key},clone(budget.categories[key]),{remainingUsd:budgetRemaining(state,key)}))};
  }
  function mutation(country,cost,action,mutator){
    const cid=normalizeCountry(country||currentCountry());if(!cid)return{ok:false,reason:'PLAYER_COUNTRY_UNAVAILABLE'};
    const amount=Math.max(0,num(cost)||0),state=getState(cid),next=clone(state),result=mutator(next);
    if(result&&result.ok===false)return Object.assign({ok:false},result);
    const finance=financeApi();let financeState=null;
    try{if(finance&&typeof finance.getFinanceState==='function')financeState=finance.getFinanceState(cid);}catch(_){}
    const parent=financeState&&financeState.allocations&&financeState.allocations.interior||null,category=budgetCategoryForAction(action);
    let debit=null,financeSpent=false;
    if(amount>0&&financeState&&!parent)return{ok:false,reason:'FINANCE_INTERIOR_ALLOCATION_REQUIRED',message:'Finance Ministry must allocate a budget to Home / Interior before this expense can be executed.',cost:amount};
    if(amount>0&&finance&&typeof finance.applyAction==='function'&&parent){
      const homeBudget=next.homeBudget||clone(DEFAULT_STATE.homeBudget),remaining=budgetRemaining(state,category);
      if(Math.max(0,num(homeBudget.parentAllocationUsd)||0)<=0)return{ok:false,reason:'HOME_MINISTRY_BUDGET_NOT_CONFIGURED',cost:amount};
      if(amount>remaining+0.01)return{ok:false,reason:'HOME_MINISTRY_CATEGORY_BUDGET_EXCEEDED',category,balance:remaining,cost:amount};
      const resultFinance=finance.applyAction({type:'spend-budget',countryId:cid,department:'interior',amountUsd:amount,
        spendType:category==='salary'?'salary':category==='vehicles'?'purchase':category==='maintenance'?'maintenance':'general',
        description:'Home Ministry · '+String(action||'expense')});
      if(!resultFinance||!resultFinance.ok)return{ok:false,reason:resultFinance&&resultFinance.code||'HOME_MINISTRY_FINANCE_BUDGET_REJECTED',message:resultFinance&&resultFinance.message,balance:remaining,cost:amount};
      financeSpent=true;
      const row=homeBudget.categories[category];row.spentUsd=Math.max(0,num(row.spentUsd)||0)+amount;
      homeBudget.ledger=Array.isArray(homeBudget.ledger)?homeBudget.ledger:[];
      homeBudget.ledger.push({turn:turn(),action:String(action||'expense'),category,amountUsd:amount,description:'Home Ministry expense'});
      homeBudget.ledger=homeBudget.ledger.slice(-100);next.homeBudget=homeBudget;
    }else{
      debit=debitTreasury(cid,amount);if(!debit.ok)return{ok:false,reason:debit.reason,balance:debit.balance,cost:amount};
    }
    next.lastUpdatedTurn=turn();const commit=dispatchState(cid,next,'OMEGA_HOME_MINISTRY_TRANSACTION');
    if(!commit.ok){
      if(debit)refundTreasury(debit);
      if(financeSpent){const root=rootState(),row=root&&root.finance&&root.finance[cid];if(row&&num(row.available)!==null)row.available=Math.max(0,row.available+amount);}
      return{ok:false,reason:commit.reason||'STATE_COMMAND_FAILED'};
    }
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
    const baseFit=Number(vehicle.environmentFit[environment.id])||0,penalties=[];
    let fit=baseFit*road.fitMultiplier;
    if(environment.id==='city'&&road.id==='congested'&&vehicle.capacity>=12){fit-=12;penalties.push('Vehicle is too large for dense urban turns and curb access.');}
    if(environment.id==='city'&&road.id==='congested'&&vehicle.speed>=165){fit-=10;penalties.push('High-speed performance is wasted in traffic; low-speed manoeuvring risk rises.');}
    if(environment.id==='mountain'&&vehicle.speed>=165){fit-=8;penalties.push('High power and speed require extra brake and tyre control on steep bends.');}
    if((environment.id==='border'||environment.id==='mountain'||road.id==='muddy'||road.id==='rough')&&(Number(vehicle.capabilities.offRoad)||0)<45){fit-=14;penalties.push('Low off-road capability increases traction and underbody damage risk.');}
    if(environment.id==='coastal'&&road.id==='wet'&&(Number(vehicle.durability)||0)<65){fit-=6;penalties.push('Limited weather protection increases corrosion and electrical-maintenance exposure.');}
    fit=Math.round(clamp(fit,0,100));
    const roadWear={smooth:0,congested:0.07,wet:0.05,rough:0.13,muddy:0.20}[road.id]||0;
    const missionOverhead=0.025,fragility=Math.max(0,70-vehicle.durability)*0.001;
    const wearPerDay=Number((0.035+Math.max(0,70-fit)*0.004+roadWear+missionOverhead+fragility).toFixed(4));
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
    if(preview.environment.fit<20)return{ok:false,reason:'VEHICLE_ROUTE_MISMATCH',message:'This vehicle is too poorly matched to the selected environment. Choose a better platform or accept a different route.',environmentAssessment:preview.environment};
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
    return mutation(cid,qty*POLICE_RECRUITMENT_COST,'POLICE_RECRUITMENT',function(s){s.policeCount+=qty;s.policeEfficiency=clamp(s.policeEfficiency+Math.min(5,qty/100),0,100);return{amount:qty,addedDailyPayroll:qty*POLICE_SALARY_PER_DAY,newPoliceCount:s.policeCount};});
  }
  function firePolice(amount,country){
    const qty=Math.floor(num(amount)||0),cid=normalizeCountry(country||currentCountry()),s=getState(cid);if(qty<1)return{ok:false,reason:'DISMISSAL_QUANTITY_INVALID'};if(qty>=s.policeCount)return{ok:false,reason:'MINIMUM_FORCE_REQUIRED',message:'At least one officer must remain in service.'};
    return mutation(cid,0,'POLICE_DISMISSAL',function(next){next.policeCount-=qty;next.policeEfficiency=clamp(next.policeEfficiency-Math.min(5,qty/200),0,100);return{amount:qty,dailyPayrollSavings:qty*POLICE_SALARY_PER_DAY,newPoliceCount:next.policeCount};});
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
  function dailyPayroll(s){return s.policeCount*POLICE_SALARY_PER_DAY+s.specialAgents*AGENT_SALARY_PER_DAY;}
  function dailyOperatingCost(s){
    let total=dailyPayroll(s);
    if(Array.isArray(s.vehicleFleet)&&s.vehicleFleet.length){
      s.vehicleFleet.forEach(function(unit){
        const vehicle=VEHICLES.find(function(v){return v.level===Number(unit.vehicleLevel);});if(!vehicle)return;
        const condition=clamp(Number(unit.condition)||0,0,100),healthSurcharge=(100-condition)/100*0.6;
        const deployment=(s.guardDeployments||[]).find(function(row){return Array.isArray(row.vehicleIds)&&row.vehicleIds.includes(unit.id);});
        let routeSurcharge=0;
        if(deployment){const use=vehicleUseAssessment(unit.vehicleLevel,deployment.environmentId,deployment.roadCondition,s.countryId);routeSurcharge=Math.max(0,70-use.fit)/100*0.45+use.road.wearPerDay*0.25;}
        total+=vehicle.maintenancePerDay*(1+healthSurcharge+routeSurcharge);
      });
    }else VEHICLES.forEach(function(v){total+=(Math.max(0,num(s.vehiclesOwned[v.level])||0)*v.maintenancePerDay);});
    return Math.round(total*100)/100;
  }
  function collectIntelligence(country,s,day){
    const week=Math.floor(day/7);if(day<7||s.lastIntelWeek===week)return false;
    const targets=Object.keys(s.agentDeployments||{}).filter(id=>id!=='UNASSIGNED'&&id!==country&&(num(s.agentDeployments[id])||0)>0&&knownCountry(id));if(!targets.length)return false;
    targets.forEach(target=>{const observations=[],roots=[g.Game&&g.Game.state,g.gameState].filter(Boolean);for(const root of roots){const economy=root.economy&&root.economy[target],population=root.population&&root.population[target],police=root.interior&&root.interior[target]&&root.interior[target].police;[['economy.gdp',economy&&economy.gdp],['economy.debt',economy&&economy.debt],['economy.treasury',economy&&economy.treasury],['finance.available',root.finance&&root.finance[target]&&root.finance[target].available],['finance.reserves',root.finance&&root.finance[target]&&root.finance[target].reserves],['economy.stability',economy&&economy.stability],['population.population',population&&(population.population||population.population_2015||population.total)],['police.policeCount',police&&police.policeCount],['police.efficiency',police&&police.policeEfficiency],['police.threatExposure',police&&police.sabotageRisk]].forEach(pair=>{const value=num(pair[1]);if(value!==null)observations.push({field:pair[0],value:value});});}
      const report={reportId:'POLICE-INTEL-'+country+'-'+target+'-'+week+'-'+turn(),sourceCountryId:country,targetCountryId:target,simulationWeek:week,simulationTurn:turn(),agentCount:Math.max(0,num(s.agentDeployments[target])||0),confidencePercent:clamp(30+Math.max(0,num(s.agentDeployments[target])||0)*8,30,95),sourceType:'AUTHORITATIVE_GAME_STATE_OBSERVATION',observations:observations,assessment:observations.length?'SIGNALS_COLLECTED':'INSUFFICIENT_OBSERVABLE_FIELDS'};
      s.intelligenceReports.push(report);emit('OMEGA_HOME_MINISTRY_INTELLIGENCE_REPORT',report);
    });s.intelligenceReports=s.intelligenceReports.slice(-100);s.lastIntelWeek=week;return true;
  }
  function onTurnCommitted(event){
    const detail=event&&event.detail||{},payload=detail.payload||detail,cid=normalizeCountry(payload.countryId||detail.countryId||currentCountry());if(!cid)return;
    const now=simulationTimeMs(),day=Math.floor(now/DAY_MS),s=getState(cid);let changed=false,payrollDebit=null;
    if(s.lastPayrollDay===null||s.lastPayrollDay===undefined){s.lastPayrollDay=day;changed=true;}
    else if(day>s.lastPayrollDay){
      const days=Math.min(3650,day-s.lastPayrollDay),due=dailyOperatingCost(s)*days,treasury=getTreasury(cid);
      if(treasury.available){
        const finance=financeApi(),parent=financeInteriorAllocation(cid);
        let paid=Math.min(due,Math.max(0,treasury.balance)),debit=null,financePaid=false;
        if(finance&&parent){
          const salaryDue=dailyPayroll(s)*days,maintenanceDue=Math.max(0,due-salaryDue);
          const salaryAllowed=Math.min(salaryDue,budgetRemaining(s,'salary'));
          const maintenanceAllowed=Math.min(maintenanceDue,budgetRemaining(s,'maintenance'));
          const permitted=Math.min(paid,salaryAllowed+maintenanceAllowed);
          const financeResult=permitted>0&&typeof finance.applyAction==='function'
            ?finance.applyAction({type:'spend-budget',countryId:cid,department:'interior',amountUsd:permitted,spendType:'general',description:'Home Ministry daily payroll and fleet operating cost'})
            :{ok:false,code:'HOME_MINISTRY_OPERATING_BUDGET_EXHAUSTED',message:'Salary and maintenance category budgets are not available.'};
          if(financeResult&&financeResult.ok){
            paid=permitted;financePaid=true;
            const budget=s.homeBudget;
            const salaryPaid=Math.min(salaryAllowed,paid),maintenancePaid=Math.min(maintenanceAllowed,Math.max(0,paid-salaryPaid));
            budget.categories.salary.spentUsd=(num(budget.categories.salary.spentUsd)||0)+salaryPaid;
            budget.categories.maintenance.spentUsd=(num(budget.categories.maintenance.spentUsd)||0)+maintenancePaid;
            budget.ledger=Array.isArray(budget.ledger)?budget.ledger:[];
            budget.ledger.push({turn:turn(),action:'DAILY_OPERATING_COST',category:'salary+maintenance',amountUsd:paid,days:days});
            budget.ledger=budget.ledger.slice(-100);
          }else paid=0;
        }else{
          debit=debitTreasury(cid,paid);
          if(!debit.ok)paid=0;
        }
        if((debit&&debit.ok)||financePaid){
          payrollDebit=debit;
          if(paid<due){s.unpaidPayroll+=due-paid;s.policeTrust=clamp(s.policeTrust-Math.min(5,days),0,100);s.policeEfficiency=clamp(s.policeEfficiency-Math.min(5,days),0,100);s.sabotageRisk=clamp(s.sabotageRisk+Math.min(5,days),5,95);}
          emit('OMEGA_HOME_POLICE_PAYROLL_SETTLED',{countryId:cid,days:days,due:due,paid:paid,unpaid:Math.max(0,due-paid),turn:turn()});
          s.lastPayrollDay=day;changed=true;
        }
      }
    }
    const order=s.pendingVehicleOrder;
    if(order&&now>=order.completesAtMs){const v=VEHICLES.find(x=>x.level===order.level);if(v){
      s.vehiclesOwned[v.level]=Math.max(0,num(s.vehiclesOwned[v.level])||0)+order.quantity;s.unlockedVehicleLevel=Math.min(VEHICLES.length,Math.max(s.unlockedVehicleLevel,v.level+1));ensureFleetInventory(s,cid);
      const delivered=clone(order);delivered.status='DELIVERED';delivered.deliveredAtMs=now;s.pendingVehicleOrder=null;
      emit('OMEGA_POLICE_VEHICLE_DELIVERED',{countryId:cid,order:delivered,vehicle:v,unlockedVehicleLevel:s.unlockedVehicleLevel,turn:turn()});changed=true;
    }}
    if(advanceFleetSimulation(s,cid,day))changed=true;
    const research=s.pendingResearch;
    if(research&&now>=research.completesAtMs){const t=TACTICS.find(x=>x.id===research.id);if(t&&!s.tacticsResearched[t.id]){
      s.tacticsResearched[t.id]=true;s.policeEfficiency=clamp(s.policeEfficiency+t.efficiency,0,100);s.sabotageRisk=clamp(s.sabotageRisk-t.riskReduction,5,95);s.policeTrust=clamp(s.policeTrust+2,0,100);s.pendingResearch=null;
      emit('OMEGA_POLICE_RESEARCH_COMPLETED',{countryId:cid,tacticId:t.id,name:t.name,effects:clone(t),turn:turn()});changed=true;
    }}
    if(processIncident(cid,s,day))changed=true;if(collectIntelligence(cid,s,day))changed=true;s.lastUpdatedTurn=turn();if(changed){const committed=dispatchState(cid,s,'OMEGA_HOME_MINISTRY_SIMULATION_UPDATE');if(!committed.ok&&payrollDebit)refundTreasury(payrollDebit);}
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

  const api=Object.freeze({
    VERSION:VERSION,POLICE_SALARY_PER_DAY:POLICE_SALARY_PER_DAY,POLICE_RECRUITMENT_COST:POLICE_RECRUITMENT_COST,
    AGENT_RECRUITMENT_COST:AGENT_RECRUITMENT_COST,AGENT_SALARY_PER_DAY:AGENT_SALARY_PER_DAY,VEHICLE_UNLOCK_MS:VEHICLE_UNLOCK_MS,
    VEHICLES:VEHICLES,GUARD_MISSIONS:GUARD_MISSIONS,FACILITIES:FACILITIES,TACTICS:TACTICS,init:init,getCurrentCountryId:currentCountry,
    getState:function(country){return clone(getState(country));},getTreasury:function(country){return clone(getTreasury(country||currentCountry()));},getHomeBudgetSnapshot:getHomeBudgetSnapshot,configureHomeBudget:configureHomeBudget,getSimulationTimeMs:simulationTimeMs,
    getDailyPayroll:function(country){return dailyPayroll(getState(country||currentCountry()));},getDailyOperatingCost:function(country){return dailyOperatingCost(getState(country||currentCountry()));},getAvailableCountries:availableCountries,
    getResearchProgress:function(country){const s=getState(country||currentCountry()),p=s.pendingResearch;if(!p)return null;const remain=Math.max(0,p.completesAtMs-simulationTimeMs());return{id:p.id,name:p.name,startedAtMs:p.startedAtMs,completesAtMs:p.completesAtMs,remainingMs:remain,progress:clamp(100*(1-remain/Math.max(1,p.durationDays*DAY_MS)),0,100)};},
    formatMoney:money,estimateRecruitCost:function(amount){return Math.max(0,Math.floor(num(amount)||0))*POLICE_RECRUITMENT_COST;},
    estimateVehicleCost:function(level,amount){const v=VEHICLES.find(x=>x.level===Math.floor(num(level)||0));return v?v.cost*Math.max(0,Math.floor(num(amount)||0)):null;},
    estimateFacilityCost:function(id,amount,country){return estimateFacilityCostFrom(getState(country||currentCountry()),id,amount);},
    estimateTrainingCost:function(target,country){return estimateTrainingCostFrom(getState(country||currentCountry()),Math.floor(num(target)||0));},
    advice:advice,recruitPolice:recruitPolice,firePolice:firePolice,orderVehicle:orderVehicle,buildFacility:buildFacility,
    getGuardCapacity:guardCapacity,getGuardDeploymentPreview:guardPreview,deployGuard:deployGuard,standDownGuard:standDownGuard,getGuardEffectiveness:guardEffectiveness,getOperatingEnvironments:function(){return clone(OPERATING_ENVIRONMENTS);},getRoadConditions:function(){return clone(ROAD_CONDITIONS);},getVehicleUseAssessment:vehicleUseAssessment,getVehicleRecommendations:vehicleRecommendations,getVehicleFleet:vehicleFleetSummary,serviceVehicle:serviceVehicle,estimateVehicleRepairCost:estimateVehicleRepairCost,getGuardableAssets:function(country){return clone(guardableAssets(country||currentCountry()));},getGuardCoverageForIncident:function(type,country,targetAssetId){return guardCoverageForIncident(getState(country||currentCountry()),String(type||''),targetAssetId||null);},
    startResearch:startResearch,upgradeTraining:upgradeTraining,recruitAgents:recruitAgents,issueMinisterDirective:issueMinisterDirective,
    processTurn:onTurnCommitted,applyExistingAssetIncident:markExistingAsset
  });
  g.Omega=g.Omega||{};g.Omega.HomeMinistry=api;g.OmegaHomeMinistryEngine=api;
  registerHandlers();if(typeof g.addEventListener==='function'&&!g.__OMEGA_HOME_POLICE_TURN_LISTENER__){g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurnCommitted);g.__OMEGA_HOME_POLICE_TURN_LISTENER__=true;}
})(typeof window!=='undefined'?window:globalThis);
