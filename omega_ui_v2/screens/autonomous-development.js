/* OMEGA Autonomous Trade Command Center.
 * Read-only diagnostics over canonical runtimes; no parallel scheduler or game-state writes.
 */
(function(g){'use strict';
var STATUS={HEALTHY:'healthy',ACTIVE:'active',PENDING:'pending',BLOCKED:'blocked',AUTONOMOUS:'autonomous',INFO:'info',UNKNOWN:'unknown'};
var PIPELINE=[
{id:'observe',title:'Observe',caption:'Collect verified national signals',icon:'observe',layers:['DATA_INTAKE','CANONICAL_IDENTITY','CAPABILITY_REGISTRY','WORLD_STATE_KERNEL','DEPENDENCY_GRAPH','DEMAND_ENGINE']},
{id:'plan',title:'Plan',caption:'Measure needs and test options',icon:'plan',layers:['SUPPLY_CAPACITY_ENGINE','NEED_GAP_PRESSURE_ENGINE','SCENARIO_ENGINE','GOAL_PRIORITY_ENGINE','DECISION_ENGINE','FEASIBILITY_ENGINE']},
{id:'execute',title:'Execute',caption:'Move decisions through existing authorities',icon:'execute',layers:['PROJECT_ENGINE','TRANSACTION_ENGINE','TRADE_MARKET_ENGINE','FINANCE_ENGINE','INFRA_LOGISTICS_ENGINE','POPULATION_LABOR_ENGINE']},
{id:'adapt',title:'Adapt',caption:'Respond to policy and world changes',icon:'adapt',layers:['TECH_PRODUCTIVITY_ENGINE','POLICY_INSTITUTION_ENGINE','EVENT_SHOCK_ENGINE','CONSEQUENCE_ENGINE','FORECAST_ENGINE']},
{id:'learn',title:'Learn',caption:'Reconcile evidence and retain state',icon:'learn',layers:['ACTOR_MEMORY_ADAPTATION','MULTI_RATE_SCHEDULER','STATE_RECONCILIATION','EVIDENCE_TRACE','RUNTIME_DEBUG']}
];
var EXECUTORS=['projectExecutor','housingExecutor','factoryExecutor','militaryRecruitmentExecutor','militaryTrainingExecutor','militaryEquipmentExecutor','treatyInitiator','counterpartyResponse','threatFusion','reservationLedger'];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
function obj(v){return!!v&&typeof v==='object'&&!Array.isArray(v);}
function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);return null;}
function fmt(v){var n=num(v);if(n===null)return v==null||v===''?'Not reported':esc(v);try{return new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);}catch(_){return String(n);}}
function textOf(values,fallback){for(var i=0;i<values.length;i++)if(values[i]!==null&&values[i]!==undefined&&String(values[i]).trim()!=='')return String(values[i]);return fallback||'Not reported';}
function titleOf(value){return String(value==null?'':value).replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase().replace(/\b[a-z]/g,function(c){return c.toUpperCase();})||'Not reported';}
function diagnostic(api){if(!api||typeof api.diagnostics!=='function')return{available:false,data:null,error:null};try{var d=api.diagnostics();return obj(d)?{available:true,data:d,error:null}:{available:false,data:null,error:'DIAGNOSTICS_EMPTY'};}catch(e){return{available:true,data:null,error:String(e&&e.message||e)};}}
function apiOf(o,k,f){return(o&&o[k])||g[f]||null;}
function iconSvg(name){
var drawings={
observe:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M11 7.5v7M7.5 11h7"/>',
plan:'<rect x="3.5" y="4" width="7" height="6" rx="1.5"/><rect x="13.5" y="14" width="7" height="6" rx="1.5"/><path d="M10.5 7h3a2 2 0 0 1 2 2v5M8 10v4a2 2 0 0 0 2 2h3.5"/>',
execute:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
adapt:'<path d="M3 17.5 8.5 12l4 3.5L21 6"/><path d="M15.5 6H21v5.5M3 21h18"/>',
learn:'<path d="M12 3.5 4 7v5c0 4.7 3.4 7.8 8 9 4.6-1.2 8-4.3 8-9V7z"/><path d="m8.5 12.2 2.3 2.3 4.8-5"/>',
trade:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
network:'<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M10.5 6.8 6.5 16M13.5 6.8 17.5 16M7.2 18h9.6"/>',
project:'<path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4H14l6 6v10z"/><path d="M14 4v6h6M8 14h8M8 17h5"/>',
shield:'<path d="M12 3.5 4.5 7v5c0 4.2 2.8 7.4 7.5 8.8 4.7-1.4 7.5-4.6 7.5-8.8V7z"/><path d="m8.5 12 2.3 2.3 4.7-4.8"/>',
chart:'<path d="M4 19.5V5M4 19.5h16"/><path d="m6.5 15 4-4 3 2.5 5-6"/>',
refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.7 9a7 7 0 0 1 11.8-2L20 12M4 12l2.5 5a7 7 0 0 0 11.8-2"/>',
check:'<path d="m5 12.5 4.2 4.2L19.5 6.8"/>'
};
return'<svg class="omega-v2-autonomy-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">'+(drawings[name]||drawings.chart)+'</svg>';
}
function statusChip(label,state){var valid=['healthy','active','pending','blocked','autonomous','info','unknown'];if(valid.indexOf(state)<0)state='unknown';return'<span class="omega-v2-autonomy-status omega-v2-autonomy-status--'+state+'">'+esc(label)+'</span>';}
function stateLabel(state){return state===STATUS.HEALTHY?'Ready':state===STATUS.ACTIVE?'Active':state===STATUS.PENDING?'Needs review':state===STATUS.BLOCKED?'Blocked':state===STATUS.AUTONOMOUS?'Autonomous':state===STATUS.INFO?'Informational':'Unknown';}
function tradeStatus(r){if(!r.available)return STATUS.UNKNOWN;if(r.error)return STATUS.BLOCKED;var d=r.data||{},s=d.stats||{};if(num(s.errors)>0||num(s.checkpointFailures)>0)return STATUS.PENDING;if(d.rulesStatus==='READY'&&d.rulesEnabled&&d.schedulerHandlerRegistered&&d.commandHandlerRegistered)return STATUS.HEALTHY;if(d.rulesStatus==='READY'||d.rulesStatus==='LOADING'||d.rulesStatus==='NOT_LOADED')return STATUS.PENDING;if(d.rulesStatus==='UNAVAILABLE')return STATUS.BLOCKED;return STATUS.UNKNOWN;}
function macroStatus(r){if(!r.available)return STATUS.UNKNOWN;if(r.error||(r.data&&r.data.error))return STATUS.BLOCKED;var d=r.data||{};if(d.ready&&d.schedulerHandlerRegistered)return STATUS.HEALTHY;if(d.initialized||d.ready)return STATUS.ACTIVE;return STATUS.PENDING;}
function schedulerStatus(r){if(!r.available)return STATUS.UNKNOWN;if(r.error)return STATUS.BLOCKED;var d=r.data||{};if(num(d.totalEvaluationErrors)>0)return STATUS.PENDING;if(d.processing||d.inFlightTurn)return STATUS.ACTIVE;return d.installed?STATUS.HEALTHY:STATUS.PENDING;}
function autonomyStatus(r){if(!r.available)return STATUS.UNKNOWN;if(r.error)return STATUS.BLOCKED;var d=r.data||{};if(d.queueBridgeInstalled&&d.interoperabilityAvailable&&d.counterpartyResponse!==false)return STATUS.HEALTHY;if(d.projectExecutor||d.treatyInitiator||d.threatFusion)return STATUS.PENDING;return STATUS.UNKNOWN;}
function metric(label,value,detail,icon){return'<article class="oa-stat"><div class="oa-stat-label">'+iconSvg(icon)+'<span>'+esc(label)+'</span></div><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></article>';}
function button(route,label,primary){return'<button type="button" class="omega-v2-button '+(primary?'omega-v2-button--primary':'omega-v2-button--quiet')+'" data-omega-v2-global-nav="'+esc(route)+'">'+esc(label)+'</button>';}
function ministryButton(id,label,primary){return'<button type="button" class="omega-v2-button '+(primary?'omega-v2-button--primary':'omega-v2-button--quiet')+'" data-omega-v2-more-ministry="'+esc(id)+'">'+esc(label)+'</button>';}
function systemCard(title,description,state,icon,rows,action){return'<article class="oa-system-card" data-state="'+esc(state)+'"><div class="oa-system-head"><span class="oa-icon-tile">'+iconSvg(icon)+'</span><div class="oa-system-title"><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p></div>'+statusChip(stateLabel(state),state)+'</div><div class="oa-system-metrics">'+rows.map(function(r){return'<div><span>'+esc(r[0])+'</span><strong>'+esc(r[1])+'</strong></div>';}).join('')+'</div>'+(action?'<div class="oa-system-action">'+action+'</div>':'')+'</article>';}
function buildViewModel(options){
options=options||{};var o=g.Omega||{};
var ta=apiOf(o,'AutonomousNationalTradeDecisionV1','OmegaAutonomousNationalTradeDecisionV1');
var ma=apiOf(o,'NpcNationalMacroEconomy','OmegaNpcNationalMacroEconomy');
var sa=apiOf(o,'WorldSimulationScheduler','OmegaWorldSimulationScheduler');
var oa=apiOf(o,'OpponentAutonomy','OmegaOpponentAutonomy');
var ga=apiOf(o,'GlobalTrade','OmegaGlobalTrade');
var tr=diagnostic(ta),mr=diagnostic(ma),sr=diagnostic(sa),ar=diagnostic(oa),gr=diagnostic(ga);
var td=tr.data||{},ts=td.stats||{},md=mr.data||{},sd=sr.data||{},ad=ar.data||{};
var npc=textOf([td.lastCountryId,ts.lastCountryId],'');
if(npc&&!/^[A-Z]{3}$/.test(npc.toUpperCase()))npc='';
var plan=null,planError=null;
if(ta&&npc&&typeof ta.getDecisionPlan==='function'){try{plan=ta.getDecisionPlan(npc);}catch(e){planError=String(e&&e.message||e);}}
var projects=[],projectsAvailable=false;
if(oa&&npc&&typeof oa.activeProjects==='function'){try{var rows=oa.activeProjects(npc);if(Array.isArray(rows)){projects=rows.slice(0,5);projectsAvailable=true;}}catch(_){}}
var executorKeys=EXECUTORS.filter(function(k){return typeof ad[k]==='boolean';});
var executorReady=executorKeys.filter(function(k){return ad[k]===true;}).length;
var tstate=tradeStatus(tr),mstate=macroStatus(mr),sstate=schedulerStatus(sr),astate=autonomyStatus(ar);
var pstate=ar.available&&ad.projectExecutor===true?(ad.interoperabilityAvailable===true?STATUS.HEALTHY:STATUS.PENDING):STATUS.UNKNOWN;
var states=[tstate,mstate,sstate,astate,pstate];
var overall=states.indexOf(STATUS.BLOCKED)>=0?STATUS.BLOCKED:states.indexOf(STATUS.PENDING)>=0?STATUS.PENDING:states.indexOf(STATUS.ACTIVE)>=0?STATUS.ACTIVE:states.every(function(s){return s===STATUS.HEALTHY;})?STATUS.HEALTHY:STATUS.UNKNOWN;
return{selectedCountry:String(options.countryId||'').trim().toUpperCase(),npcCountry:npc,
trade:{report:tr,data:td,stats:ts,plan:plan,planError:planError,state:tstate},
macro:{report:mr,data:md,state:mstate},scheduler:{report:sr,data:sd,state:sstate},
autonomy:{report:ar,data:ad,state:astate},globalTrade:{report:gr,data:gr.data||{}},
projects:{rows:projects,available:projectsAvailable,state:pstate},
executors:{available:executorKeys.length,ready:executorReady},overall:overall,pipeline:PIPELINE};
}
function pipelineMarkup(model){return'<div class="oa-pipeline" role="list" aria-label="Five-part autonomous decision architecture">'+model.pipeline.map(function(s,i){return'<section class="oa-stage" role="listitem" data-stage="'+esc(s.id)+'"><div class="oa-stage-head"><span class="oa-icon-tile">'+iconSvg(s.icon)+'</span><span class="oa-stage-number">0'+(i+1)+'</span></div><h3>'+esc(s.title)+'</h3><p>'+esc(s.caption)+'</p><div class="oa-stage-divider"></div><ul>'+s.layers.map(function(x){return'<li>'+esc(titleOf(x))+'</li>';}).join('')+'</ul><small>'+s.layers.length+' registered layers</small></section>';}).join('')+'</div>';}
function candidateMarkup(m){
var p=m.trade.plan,rows=p&&Array.isArray(p.candidates)?p.candidates:[];
if(!rows.length)return'<div class="oa-empty"><strong>No trade candidates reported</strong><p>'+(m.trade.planError?'The latest trade plan could not be read: '+esc(m.trade.planError):m.npcCountry?'No saved candidate rows are available for the latest NPC checkpoint.':'The engine has not reported an NPC country checkpoint yet.')+'</p></div>';
return'<div class="oa-candidate-list">'+rows.slice(0,3).map(function(r,i){
r=obj(r)?r:{};
var direction=textOf([r.direction,r.tradeDirection],'TRADE').toUpperCase();
var resource=titleOf(textOf([r.resourceId,r.resource,r.commodityId],'Resource not reported'));
var partner=textOf([r.targetCountryId,r.partnerCountryId,r.supplierCountryId],'Counterparty not reported');
var quantity=textOf([r.quantityPerDelivery,r.quantity,r.proposedQuantity],'Not reported');
var kind=direction==='IMPORT'?'import':direction==='EXPORT'?'export':'other';
return'<article class="oa-candidate" data-direction="'+kind+'"><div class="oa-candidate-main"><span class="oa-direction oa-direction--'+kind+'">'+(kind==='import'?'Import need':kind==='export'?'Export opportunity':'Trade candidate')+'</span><h4>'+esc(resource)+'</h4><p>Counterparty <strong>'+esc(partner)+'</strong></p></div><div class="oa-candidate-quantity"><span>Proposed quantity</span><strong>'+esc(quantity)+'</strong><small>Candidate only · not a confirmed contract</small></div></article>';
}).join('')+'</div>';
}
function projectMarkup(m){
if(!m.projects.available)return'<div class="oa-empty"><strong>Project data not exposed</strong><p>The project runtime has not returned a readable record for this NPC checkpoint. This is not counted as zero active projects.</p></div>';
if(!m.projects.rows.length)return'<div class="oa-empty"><strong>No active project records</strong><p>No active project rows are recorded for '+esc(m.npcCountry)+'.</p></div>';
return'<div class="oa-project-list">'+m.projects.rows.map(function(r,i){
r=obj(r)?r:{};
var name=textOf([r.name,r.title,r.projectName,r.id],'Project '+(i+1));
var state=textOf([r.status],'Status not recorded');
var progress=num(r.progressPct);
return'<article class="oa-project-row"><div class="oa-project-copy"><strong>'+esc(name)+'</strong><span>'+esc(titleOf(state))+'</span></div><div class="oa-project-progress">'+(progress===null?'<small>Progress not reported</small>':'<strong>'+esc(fmt(progress))+'%</strong><span class="oa-progress-track"><i style="width:'+Math.max(0,Math.min(100,progress))+'%"></i></span>')+'</div></article>';
}).join('')+'</div>';
}
function guardMarkup(data,available){
if(!available)return'<div class="oa-empty"><strong>Guard diagnostics unavailable</strong><p>The trade runtime did not expose its authority-boundary report.</p></div>';
var rows=[
['Player-country automation is excluded','playerCountryAutomation',false,'The autonomous engine must not control the player-selected country.'],
['A second scheduler is not created','createsIndependentScheduler',false,'Country visits stay on the existing world scheduler.'],
['No timer or animation loop is started','usesTimersOrAnimationLoop',false,'The engine remains turn-driven and bounded.'],
['Existing Global Market authority is used','usesExistingGlobalMarket',true,'Price discovery and supplier availability remain with Global Market.'],
['Existing Global Trade authority is used','usesExistingGlobalTrade',true,'Requests, shipment, settlement and stock updates remain canonical.'],
['Existing bilateral agreement authority is used','usesExistingBilateralTrade',true,'Terms, acceptance and contract lifecycle stay with Bilateral Trade.'],
['Existing ministry transaction authority is used','usesExistingMinistryStateTransaction',true,'Country trade-state writes remain transaction-controlled.']
];
return'<div class="oa-guard-grid" role="list">'+rows.map(function(r){
var value=data[r[1]],known=typeof value==='boolean',ok=value===r[2],state=known?(ok?STATUS.HEALTHY:STATUS.BLOCKED):STATUS.UNKNOWN;
return'<article class="oa-guard" role="listitem" data-state="'+state+'"><span class="oa-guard-icon">'+iconSvg(ok&&known?'check':'shield')+'</span><div><strong>'+esc(r[0])+'</strong><p>'+esc(r[3])+'</p></div>'+statusChip(known?(ok?'Verified':'Mismatch'):'Not reported',state)+'</article>';
}).join('')+'</div>';
}
function render(root,options){
if(!root)return{ok:false,code:'AUTONOMOUS_DEVELOPMENT_ROOT_REQUIRED'};
options=options||{};var m=buildViewModel(options),td=m.trade.data,ts=m.trade.stats,md=m.macro.data,sd=m.scheduler.data,ad=m.autonomy.data;
var overallLabel=m.overall===STATUS.HEALTHY?'Systems ready':m.overall===STATUS.ACTIVE?'Autonomy active':m.overall===STATUS.PENDING?'Review required':m.overall===STATUS.BLOCKED?'System blocked':'Partial telemetry';
var npc=m.npcCountry||'Awaiting first NPC checkpoint',player=m.selectedCountry||'Not selected';
var scope=md.coreCountryCount==null?'Not reported':fmt(md.coreCountryCount)+' country profiles';
var gt=m.globalTrade.data;
var lastResult=ts.lastResult&&obj(ts.lastResult)?textOf([ts.lastResult.status,ts.lastResult.reason],'Recorded result'):textOf([ts.lastResult],'Not reported');
var phase=textOf([m.trade.plan&&m.trade.plan.phase],'No checkpoint');
var decision=m.trade.plan&&m.trade.plan.lastDecision;
var decisionStatus=textOf([decision&&decision.status,decision&&decision.reason],'Not reported');
var systems='';
systems+=systemCard('World scheduler','Bounded country and event workload',m.scheduler.state,'network',[
['Installed',sd.installed===true?'Yes':sd.installed===false?'No':'Not reported'],
['Active / roster',fmt(sd.activeCountryCount)+' / '+fmt(sd.rosterCount)],
['Registered handlers',fmt(sd.registeredCountryHandlers)],
['Pending events',fmt(sd.pendingEvents)]
],button('reports','View runtime reports',false));
systems+=systemCard('NPC macro economy','Country-level economic progression',m.macro.state,'chart',[
['Country profiles',scope],
['Processed',fmt(md.processedCountries)],
['Deferred',fmt(md.deferredCountries)],
['Failed',fmt(md.failedCountries)]
],button('economy','Open national accounts',false));
systems+=systemCard('Autonomous trade engine','Import and export decision planning',m.trade.state,'trade',[
['Rules',textOf([td.rulesStatus],'Not loaded')],
['Operating mode',textOf([td.rolloutMode],'Not reported')],
['NPC visits',fmt(ts.visits)],
['Proposals issued',fmt(ts.proposals)],
['Counteroffers accepted',fmt(ts.counteroffersAccepted)],
['Runtime errors',fmt(ts.errors)]
],ministryButton('trade','Open Trade Ministry',true));
systems+=systemCard('National autonomy','Projects, response routing and interoperability',m.autonomy.state,'project',[
['Queue bridge',ad.queueBridgeInstalled===true?'Connected':ad.queueBridgeInstalled===false?'Unavailable':'Not reported'],
['Route subjects',fmt(ad.routeCount)],
['Project executor',ad.projectExecutor===true?'Available':ad.projectExecutor===false?'Unavailable':'Not reported'],
['Counterparty response',ad.counterpartyResponse===true?'Connected':ad.counterpartyResponse===false?'Not connected':'Not reported']
],ministryButton('mega_projects','Review projects',false));
var globalTrade=m.globalTrade.report.available?'<div class="oa-market-stats"><div><span>Requests</span><strong>'+esc(fmt(gt.requests))+'</strong></div><div><span>Pending</span><strong>'+esc(fmt(gt.pending))+'</strong></div><div><span>Settled</span><strong>'+esc(fmt(gt.settled))+'</strong></div></div>':'<div class="oa-empty"><strong>Global Trade diagnostics not connected</strong><p>Market and settlement totals remain unavailable until the canonical runtime reports them.</p></div>';
root.innerHTML='<section class="omega-v2-shell omega-v2-autonomy-page">'+
'<header class="oa-hero"><div class="oa-hero-copy"><div class="oa-eyebrow">OMEGA / NATIONAL ECONOMY OPERATIONS</div><h1>Autonomous Trade Command</h1><p>Monitor how NPC nations identify supply gaps, evaluate partners, prepare proposals and pass approved agreements through the existing trade authorities.</p><div class="oa-context"><span>'+statusChip('Read-only telemetry',STATUS.INFO)+'</span><span>'+statusChip('Player country · '+player,STATUS.UNKNOWN)+'</span><span>'+statusChip('Latest NPC · '+npc,m.npcCountry?STATUS.AUTONOMOUS:STATUS.UNKNOWN)+'</span></div></div><aside class="oa-hero-status"><span class="oa-hero-status-label">Network condition</span><strong>'+esc(overallLabel)+'</strong>'+statusChip(stateLabel(m.overall),m.overall)+'<button type="button" class="omega-v2-button omega-v2-button--primary oa-refresh" data-omega-autonomy-refresh>'+iconSvg('refresh')+'<span>Refresh diagnostics</span></button></aside></header>'+
'<section class="oa-stats" aria-label="Autonomous trade activity">'+
metric('NPC visits',fmt(ts.visits),'Bounded scheduler checkpoints','network')+
metric('Trade proposals',fmt(ts.proposals),'Proposals are not settled deals','trade')+
metric('Counteroffers accepted',fmt(ts.counteroffersAccepted),'Recorded decision outcomes','check')+
metric('Runtime errors',fmt(ts.errors),'Trade-engine diagnostics','shield')+
'</section>'+
'<section class="oa-section"><div class="oa-section-heading"><div><span class="oa-kicker">Runtime overview</span><h2>System health</h2><p>Live diagnostics from the existing OMEGA authorities.</p></div>'+statusChip('Canonical runtime sources',STATUS.INFO)+'</div><div class="oa-system-grid">'+systems+'</div></section>'+
'<section class="oa-section"><div class="oa-section-heading"><div><span class="oa-kicker">Latest country checkpoint</span><h2>Trade decision workspace</h2><p>The latest recorded NPC planning state. Candidate rows are not active contracts.</p></div>'+statusChip(phase,m.npcCountry?STATUS.ACTIVE:STATUS.UNKNOWN)+'</div><div class="oa-workspace-grid"><article class="oa-panel oa-decision-panel"><div class="oa-panel-heading"><span class="oa-icon-tile">'+iconSvg('trade')+'</span><div><h3>Import and export candidates</h3><p>Latest NPC country: <strong>'+esc(npc)+'</strong></p></div></div>'+candidateMarkup(m)+'<div class="oa-decision-details"><div><span>Last decision</span><strong>'+esc(titleOf(decisionStatus))+'</strong></div><div><span>Market syncs</span><strong>'+esc(fmt(ts.marketSyncs))+'</strong></div><div><span>Supplier scans</span><strong>'+esc(fmt(ts.supplierScans))+'</strong></div><div><span>Checkpoint failures</span><strong>'+esc(fmt(ts.checkpointFailures))+'</strong></div></div></article><div class="oa-workspace-side"><article class="oa-panel"><div class="oa-panel-heading"><span class="oa-icon-tile">'+iconSvg('project')+'</span><div><h3>National projects</h3><p>Latest NPC project records</p></div>'+statusChip(m.projects.available?'Connected':'Unknown',m.projects.available?STATUS.HEALTHY:STATUS.UNKNOWN)+'</div>'+projectMarkup(m)+ministryButton('mega_projects','Open national projects',false)+'</article><article class="oa-panel"><div class="oa-panel-heading"><span class="oa-icon-tile">'+iconSvg('chart')+'</span><div><h3>Global Trade activity</h3><p>Canonical request and settlement totals</p></div></div>'+globalTrade+'</article></div></div></section>'+
'<section class="oa-section"><div class="oa-section-heading"><div><span class="oa-kicker">Decision architecture</span><h2>How a national trade decision moves</h2><p>Five coordinated phases containing 28 registered layers. This is an architecture map, not a live per-layer execution trace.</p></div>'+statusChip('28 registered layers',STATUS.INFO)+'</div>'+pipelineMarkup(m)+'</section>'+
'<section class="oa-section"><div class="oa-section-heading"><div><span class="oa-kicker">Integrity and control</span><h2>Authority boundaries</h2><p>Each condition is shown only when the trade runtime explicitly reports its value.</p></div>'+statusChip('No parallel authority',STATUS.INFO)+'</div><div class="oa-panel oa-guards-panel">'+guardMarkup(td,m.trade.report.available)+'</div></section>'+
'<section class="oa-section"><div class="oa-section-heading"><div><span class="oa-kicker">Navigate existing systems</span><h2>Command shortcuts</h2><p>Open the established ministries and reporting screens.</p></div></div><div class="oa-shortcuts">'+ministryButton('trade','Trade and agreements',true)+ministryButton('mega_projects','National projects',false)+ministryButton('production','Factories and industry',false)+ministryButton('treasury_finance','Treasury and finance',false)+ministryButton('foreign_affairs','Foreign affairs',false)+button('reports','Reports and evidence',false)+'</div></section>'+
'<p class="oa-footnote">This screen reads diagnostics and saved NPC checkpoints only. It does not create proposals, activate agreements, reserve stock, dispatch shipments, debit Treasury, advance projects or modify country state. Values that are not reported remain unknown.</p></section>';
if(!root.__omegaAutonomyRefreshBound&&typeof root.addEventListener==='function'){root.addEventListener('click',function(e){var t=e&&e.target,b=t&&typeof t.closest==='function'?t.closest('[data-omega-autonomy-refresh]'):null;if(!b||typeof root.contains==='function'&&!root.contains(b))return;if(e.preventDefault)e.preventDefault();render(root,root.__omegaAutonomyOptions||{});});root.__omegaAutonomyRefreshBound=true;}
root.__omegaAutonomyOptions=options;
return{ok:true,overall:m.overall,npcCountry:m.npcCountry||null,pipelineLayers:m.pipeline.reduce(function(n,s){return n+s.layers.length;},0)};
}
var API=Object.freeze({VERSION:'1.1.0',STATUS:STATUS,buildViewModel:buildViewModel,render:render});
g.OmegaUIV2AutonomousDevelopment=API;g.Omega=g.Omega||{};g.Omega.UIV2AutonomousDevelopment=API;
})(typeof window!=='undefined'?window:globalThis);
