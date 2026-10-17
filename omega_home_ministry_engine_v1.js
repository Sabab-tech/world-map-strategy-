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
    {level:1,name:'Patrol Cruiser Basic',emoji:'🚓',className:'ENTRY PATROL',speed:120,capacity:4,durability:40,rangeKm:420,enduranceHours:8,cost:5000,maintenancePerDay:45,role:'Routine urban patrol and first response'},
    {level:2,name:'Rapid Response Sedan',emoji:'🚔',className:'RAPID RESPONSE',speed:140,capacity:4,durability:45,rangeKm:480,enduranceHours:10,cost:8000,maintenancePerDay:60,role:'Fast response across the city grid'},
    {level:3,name:'Tactical SUV',emoji:'🚙',className:'MULTI-ROLE',speed:130,capacity:6,durability:60,rangeKm:520,enduranceHours:11,cost:12000,maintenancePerDay:85,role:'Mixed urban and rural patrol'},
    {level:4,name:'Police Transport Van',emoji:'🚐',className:'PERSONNEL TRANSPORT',speed:100,capacity:12,durability:65,rangeKm:500,enduranceHours:10,cost:15000,maintenancePerDay:95,role:'Officer transport and support deployment'},
    {level:5,name:'Armored Patrol Vehicle',emoji:'🚘🛡️',className:'ARMORED RESPONSE',speed:110,capacity:6,durability:85,rangeKm:460,enduranceHours:8,cost:25000,maintenancePerDay:150,role:'Protected transport in high-risk incidents'},
    {level:6,name:'Advanced Interceptor',emoji:'🚨',className:'HIGH-SPEED INTERCEPTOR',speed:180,capacity:2,durability:50,rangeKm:400,enduranceHours:7,cost:35000,maintenancePerDay:180,role:'High-speed vehicle interception'},
    {level:7,name:'Urban Defense SUV',emoji:'🚙⚡',className:'URBAN DEFENSE',speed:135,capacity:6,durability:75,rangeKm:560,enduranceHours:12,cost:45000,maintenancePerDay:230,role:'Reinforced city and perimeter patrol'},
    {level:8,name:'Command Cruiser',emoji:'🚔💠',className:'MOBILE COMMAND',speed:145,capacity:5,durability:70,rangeKm:620,enduranceHours:12,cost:60000,maintenancePerDay:300,role:'Field command, dispatch and coordination'},
    {level:9,name:'Riot Control Carrier',emoji:'🚐🛡️',className:'PUBLIC-ORDER SUPPORT',speed:90,capacity:20,durability:95,rangeKm:440,enduranceHours:10,cost:85000,maintenancePerDay:380,role:'Protected personnel deployment and evacuation'},
    {level:10,name:'Heavy Security Vehicle',emoji:'🛻',className:'HEAVY SECURITY',speed:105,capacity:8,durability:100,rangeKm:600,enduranceHours:14,cost:110000,maintenancePerDay:470,role:'High-durability critical-site security'},
    {level:11,name:'AI Assisted Patrol',emoji:'🚓🤖',className:'SMART PATROL',speed:160,capacity:4,durability:60,rangeKm:720,enduranceHours:18,cost:150000,maintenancePerDay:600,role:'Sensor-assisted dispatch and patrol coverage'},
    {level:12,name:'Smart Tactical Unit',emoji:'🚔🔷',className:'TACTICAL NETWORK',speed:150,capacity:6,durability:80,rangeKm:760,enduranceHours:16,cost:200000,maintenancePerDay:760,role:'Integrated mobile operations and field coordination'},
    {level:13,name:'Elite Response Vehicle',emoji:'🏎️',className:'ELITE RESPONSE',speed:175,capacity:4,durability:75,rangeKm:680,enduranceHours:10,cost:280000,maintenancePerDay:950,role:'Specialist rapid response and critical escort'},
    {level:14,name:'National Security Cruiser',emoji:'🚓👑',className:'NATIONAL SECURITY',speed:165,capacity:5,durability:90,rangeKm:900,enduranceHours:18,cost:400000,maintenancePerDay:1250,role:'Long-range national security command support'},
    {level:15,name:'Sovereign Guardian Vehicle',emoji:'🏆🚔',className:'FLAGSHIP / TIER XV',speed:200,capacity:6,durability:120,rangeKm:1100,enduranceHours:24,cost:750000,maintenancePerDay:1800,role:'Flagship multi-system protection and rapid command response'}
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
    lastPayrollDay:null, lastIncidentWeek:null, incidentSequence:0, incidentLedger:[], lastUpdatedTurn:0, agentDeployments:{}, intelligenceReports:[], lastIntelWeek:null
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
    s.vehiclesOwned=Object.assign({},raw.vehiclesOwned||{});s.agentDeployments=Object.assign({},raw.agentDeployments||{});s.intelligenceReports=Array.isArray(raw.intelligenceReports)?raw.intelligenceReports.slice(-100).map(clone):[];s.incidentLedger=Array.isArray(raw.incidentLedger)?raw.incidentLedger.slice(-100).map(clone):[];
    if(num(s.policeCount)===null)s.policeCount=250;if(num(s.policeEfficiency)===null)s.policeEfficiency=60;if(num(s.policeTrust)===null)s.policeTrust=55;
    if(num(s.unlockedVehicleLevel)===null)s.unlockedVehicleLevel=1;return s;
  }
  function storedState(country){const root=rootState(),raw=root&&root.interior&&root.interior[country]&&root.interior[country].police;return raw&&typeof raw==='object'?mergeState(raw):null;}
  function publicState(s){return{policeCount:s.policeCount,policeEfficiency:s.policeEfficiency,policeTrust:s.policeTrust,unlockedVehicleLevel:s.unlockedVehicleLevel,vehiclesOwned:clone(s.vehiclesOwned),pendingVehicleOrder:clone(s.pendingVehicleOrder),facilityLevels:clone(s.facilityLevels),trainingQualityLevel:s.trainingQualityLevel,tacticsResearched:clone(s.tacticsResearched),pendingResearch:clone(s.pendingResearch),specialAgents:s.specialAgents,sabotageRisk:s.sabotageRisk,unpaidPayroll:s.unpaidPayroll,agentDeployments:clone(s.agentDeployments),intelligenceReports:clone(s.intelligenceReports),incidentLedger:clone(s.incidentLedger)};}
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
    const existing=storedState(cid);if(existing)return existing;
    const initial=baseState();dispatchState(cid,initial,'OMEGA_HOME_MINISTRY_INITIALIZED');return initial;
  }
  function money(value){const n=num(value);return n===null?'Unavailable':'$'+Math.round(n).toLocaleString('en-US');}
  function mutation(country,cost,action,mutator){
    const cid=normalizeCountry(country||currentCountry());if(!cid)return{ok:false,reason:'PLAYER_COUNTRY_UNAVAILABLE'};
    const amount=Math.max(0,num(cost)||0),state=getState(cid),next=clone(state),result=mutator(next);
    if(result&&result.ok===false)return Object.assign({ok:false},result);
    const debit=debitTreasury(cid,amount);if(!debit.ok)return{ok:false,reason:debit.reason,balance:debit.balance,cost:amount};
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
  function markExistingAsset(country,incident){
    const mesh=interop();if(!mesh||typeof mesh.dispatchCommand!=='function'||!economyHandlerRegistered)return null;
    const row=mesh.dispatchCommand('economy',ECONOMY_INCIDENT_COMMAND,country,{incident:clone(incident)},{turn:turn(),commandType:ECONOMY_INCIDENT_COMMAND,correlationId:incident.id});
    return row&&row.status==='APPLIED'&&row.result?row.result.assetImpact||null:null;
  }
  function processIncident(country,s,day){
    const week=Math.floor(day/7);if(day<7||s.lastIncidentWeek===week)return false;
    const roll=deterministicRoll(country,week,turn()),chance=clamp(Math.round(s.sabotageRisk/3),1,30);
    if(roll>=chance){s.lastIncidentWeek=week;return true;}
    const types=['CIVIL_UNREST','SMUGGLING_NETWORK','INDUSTRIAL_SABOTAGE'],type=types[roll%types.length];
    const mitigation=clamp((s.specialAgents*8)+(s.tacticsResearched.counterTerror?20:0)+(s.tacticsResearched.assetProtection?18:0)+(s.tacticsResearched.intelligenceFusion?14:0),0,85);
    const detected=deterministicRoll(country,week+313,turn())<mitigation+15;
    s.incidentSequence+=1;
    const incident={id:'POLICE-INCIDENT-'+country+'-'+week+'-'+s.incidentSequence,countryId:country,simulationWeek:week,simulationDay:day,simulationTurn:turn(),type:type,baselineRiskPercent:s.sabotageRisk,detected:detected,mitigationPercent:mitigation,status:detected?'DETECTED_AND_CONTAINED':'RESPONSE_REQUIRED',assetImpact:null};
    if(!detected&&(type==='INDUSTRIAL_SABOTAGE'||type==='CIVIL_UNREST'))incident.assetImpact=markExistingAsset(country,incident);
    s.incidentLedger.push(incident);s.incidentLedger=s.incidentLedger.slice(-100);s.lastIncidentWeek=week;
    if(!detected){s.policeTrust=clamp(s.policeTrust-2,0,100);s.policeEfficiency=clamp(s.policeEfficiency-1,0,100);s.sabotageRisk=clamp(s.sabotageRisk+1,5,95);}else{s.policeTrust=clamp(s.policeTrust+0.5,0,100);}
    emit('OMEGA_HOME_MINISTRY_SECURITY_INCIDENT',incident);return true;
  }
  function dailyPayroll(s){return s.policeCount*POLICE_SALARY_PER_DAY+s.specialAgents*AGENT_SALARY_PER_DAY;}
  function dailyOperatingCost(s){let total=dailyPayroll(s);VEHICLES.forEach(v=>{total+=(Math.max(0,num(s.vehiclesOwned[v.level])||0)*v.maintenancePerDay);});return total;}
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
        const paid=Math.min(due,Math.max(0,treasury.balance)),debit=debitTreasury(cid,paid);
        if(debit.ok){
          payrollDebit=debit;
          if(paid<due){s.unpaidPayroll+=due-paid;s.policeTrust=clamp(s.policeTrust-Math.min(5,days),0,100);s.policeEfficiency=clamp(s.policeEfficiency-Math.min(5,days),0,100);s.sabotageRisk=clamp(s.sabotageRisk+Math.min(5,days),5,95);}
          emit('OMEGA_HOME_POLICE_PAYROLL_SETTLED',{countryId:cid,days:days,due:due,paid:paid,unpaid:Math.max(0,due-paid),turn:turn()});
          s.lastPayrollDay=day;changed=true;
        }
      }
    }
    const order=s.pendingVehicleOrder;
    if(order&&now>=order.completesAtMs){const v=VEHICLES.find(x=>x.level===order.level);if(v){
      s.vehiclesOwned[v.level]=Math.max(0,num(s.vehiclesOwned[v.level])||0)+order.quantity;s.unlockedVehicleLevel=Math.min(VEHICLES.length,Math.max(s.unlockedVehicleLevel,v.level+1));
      const delivered=clone(order);delivered.status='DELIVERED';delivered.deliveredAtMs=now;s.pendingVehicleOrder=null;
      emit('OMEGA_POLICE_VEHICLE_DELIVERED',{countryId:cid,order:delivered,vehicle:v,unlockedVehicleLevel:s.unlockedVehicleLevel,turn:turn()});changed=true;
    }}
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
          const factoryLike=/factory|plant|smelt|industrial|aluminium|aluminum|civilian/.test(identity+' '+kind),unavailable=/destroyed|offline|damaged|closed/.test(String(row.operationalStatus||row.status||row.securityCondition||'').toLowerCase());
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
    VEHICLES:VEHICLES,FACILITIES:FACILITIES,TACTICS:TACTICS,init:init,getCurrentCountryId:currentCountry,
    getState:function(country){return clone(getState(country));},getTreasury:function(country){return clone(getTreasury(country||currentCountry()));},getSimulationTimeMs:simulationTimeMs,
    getDailyPayroll:function(country){return dailyPayroll(getState(country||currentCountry()));},getDailyOperatingCost:function(country){return dailyOperatingCost(getState(country||currentCountry()));},getAvailableCountries:availableCountries,
    getResearchProgress:function(country){const s=getState(country||currentCountry()),p=s.pendingResearch;if(!p)return null;const remain=Math.max(0,p.completesAtMs-simulationTimeMs());return{id:p.id,name:p.name,startedAtMs:p.startedAtMs,completesAtMs:p.completesAtMs,remainingMs:remain,progress:clamp(100*(1-remain/Math.max(1,p.durationDays*DAY_MS)),0,100)};},
    formatMoney:money,estimateRecruitCost:function(amount){return Math.max(0,Math.floor(num(amount)||0))*POLICE_RECRUITMENT_COST;},
    estimateVehicleCost:function(level,amount){const v=VEHICLES.find(x=>x.level===Math.floor(num(level)||0));return v?v.cost*Math.max(0,Math.floor(num(amount)||0)):null;},
    estimateFacilityCost:function(id,amount,country){return estimateFacilityCostFrom(getState(country||currentCountry()),id,amount);},
    estimateTrainingCost:function(target,country){return estimateTrainingCostFrom(getState(country||currentCountry()),Math.floor(num(target)||0));},
    advice:advice,recruitPolice:recruitPolice,firePolice:firePolice,orderVehicle:orderVehicle,buildFacility:buildFacility,
    startResearch:startResearch,upgradeTraining:upgradeTraining,recruitAgents:recruitAgents,issueMinisterDirective:issueMinisterDirective,
    processTurn:onTurnCommitted,applyExistingAssetIncident:markExistingAsset
  });
  g.Omega=g.Omega||{};g.Omega.HomeMinistry=api;g.OmegaHomeMinistryEngine=api;
  registerHandlers();if(typeof g.addEventListener==='function'&&!g.__OMEGA_HOME_POLICE_TURN_LISTENER__){g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurnCommitted);g.__OMEGA_HOME_POLICE_TURN_LISTENER__=true;}
})(typeof window!=='undefined'?window:globalThis);
