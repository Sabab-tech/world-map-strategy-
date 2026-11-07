/* OMEGA PRIVATE MARKET COMPETITION RUNTIME v1.0.0
 * Turn-based concentration monitoring and state-authorised anti-monopoly expansion orders.
 * All thresholds are gameplay indicators, not legal competition findings.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const COMMAND='OMEGA_PRIVATE_MARKET_COMPETITION_PUBLISH';
const COMPANY_IDS=['AURORA_INDUSTRIAL_GROUP','MERIDIAN_ENGINEERING_GROUP','NOVA_CONSUMER_INDUSTRIES','ATLAS_TECHNOLOGY_CORPORATION','TERRA_INFRASTRUCTURE_GROUP'];
const REQUIRED_RIGHTS=['strategicOversight','licensingAndPermits','fiscalRegulation','labourSafetyEnvironmentalRegulation',
 'strategicSupplyOversight','strategicContracts','domesticSupplyDirection','exportControl','publicProcurement',
 'competitionOversight','foreignOwnershipReview','emergencyIntervention'];
const THRESHOLDS=Object.freeze({
 lookbackTurns:365,releaseConfirmationTurns:3,
 watch:{privateCompanyHhi:1500,leaderTotalMarketSharePct:30},
 investigation:{privateCompanyHhi:2500,leaderTotalMarketSharePct:40},
 intervention:{leaderTotalMarketSharePct:50,privateCompanyHhiWithShare:5000,minimumLeaderShareForHhiInterventionPct:40}
});
const clone=(v,seen=new WeakMap())=>{
 if(v===null||typeof v!=='object')return v;
 if(seen.has(v))return seen.get(v);
 if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
 const o={};seen.set(v,o);
 for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);
 return o;
};
const num=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;};
const id=v=>String(v??'').trim().toUpperCase();
const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const state=()=>g.Game?.state||g.gameState||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
function country(v){
 const raw=id(v);if(!raw)return '';
 if(/^[A-Z]{3}$/.test(raw))return raw;
 try{const r=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity)?.resolveCountry?.(raw);if(r?.id)return id(r.id);}catch(_){}
 return raw;
}
function playerCountry(){
 const s=state()||{},sim=g.Omega?.Simulation;
 const candidates=[];
 try{if(typeof sim?.getPlayerCountryId==='function')candidates.push(sim.getPlayerCountryId());}catch(_){}
 candidates.push(s.simulation?.session?.playerCountryId,s.simulation?.playerCountryId,s.playerCountryId,s.playerCountryCode,
  g.Game?.playerCountryId,g.Game?.playerCountryCode,g.Game?.playerCountry,g.OMEGA_PLAYER_COUNTRY_ID);
 for(const value of candidates){
  const raw=value&&typeof value==='object'?(value.iso3||value.iso3Code||value.countryCode||value.countryId||value.code||value.id||value.name):value;
  const c=country(raw);if(/^[A-Z0-9]{2,3}$/.test(c)&&c!=='GLOBAL'&&c!=='WORLD')return c;
 }
 return '';
}
function bucket(domain,cid){
 const root=state()?.[domain];if(!root||typeof root!=='object')return{};
 const c=country(cid);
 if(root[c]&&typeof root[c]==='object')return root[c];
 const key=Object.keys(root).find(k=>country(k)===c);
 return key?root[key]:{};
}
function marketApi(){return g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1||null;}
function dispatch(type,cid,payload){
 const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
 try{
  const result=m.dispatchCommand('trade',type,cid,clone(payload),{turn:turn(),commandType:type,correlationId:'COMPETITION:'+cid+':T'+turn()});
  return result?.result&&['APPLIED','FAILED','REJECTED'].includes(String(result.status||''))?result.result:result;
 }catch(error){return{status:'FAILED',reason:String(error?.message||error)};}
}
function emit(type,cid,payload){
 try{interop()?.emitEvent?.(type,cid,'trade',clone(payload),{turn:turn(),correlationId:'COMPETITION:'+cid+':T'+turn()});}catch(_){}
 try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:cid,payload:clone(payload),simulationTurn:turn()}}));}catch(_){}
}
function competitionState(cid){
 const row=bucket('trade',cid).marketCompetition;
 return row&&typeof row==='object'?clone(row):{version:VERSION,countryId:cid,cases:[],activeRestrictions:[],events:[],lastProcessedTurn:null};
}
function publishHandler(cmd,ctx){
 const p=cmd?.payload||{},cid=country(ctx?.countryId);
 if(!cid||country(p.countryId)!==cid)return{accepted:false,reason:'COMPETITION_COUNTRY_SCOPE_MISMATCH'};
 const snap=p.snapshot;
 if(!snap||country(snap.countryId)!==cid||num(snap.generatedTurn)!==turn())
  return{accepted:false,reason:'COMPETITION_SNAPSHOT_INVALID_OR_STALE'};
 const prior=ctx.stateTransaction.get('trade.marketCompetition');
 if(prior&&num(prior.lastProcessedTurn)>num(snap.lastProcessedTurn))
  return{accepted:false,reason:'COMPETITION_SNAPSHOT_OLDER_THAN_STATE'};
 if(prior&&num(prior.lastProcessedTurn)===turn())
  return{accepted:true,duplicate:true,lastProcessedTurn:turn()};
 ctx.stateTransaction.set('trade.marketCompetition',clone(snap));
 return{accepted:true,countryId:cid,lastProcessedTurn:turn(),caseCount:(snap.cases||[]).length,
  activeRestrictionCount:(snap.activeRestrictions||[]).length};
}
let handlersReady=false,handlerErrors=[];
function install(){
 if(handlersReady)return{ready:true,errors:[]};
 const m=interop();if(!m?.registerCommandHandler)return{ready:false,reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
 handlerErrors=[];
 try{
  if(Array.isArray(m.instance?.ids)&&m.instance.ids.length===0&&typeof m.configure==='function')m.configure({});
  try{m.registerAction?.(COMMAND,{actionId:COMMAND,stateOwnerMinistry:'trade',authority:'OMEGA_PRIVATE_MARKET_COMPETITION_RUNTIME'});}
  catch(error){handlerErrors.push('ACTION_REGISTRATION:'+String(error?.message||error));}
  m.registerCommandHandler(COMMAND,'trade',publishHandler);
  handlersReady=true;
 }catch(error){handlerErrors.push(String(error?.message||error));}
 return{ready:handlersReady,errors:handlerErrors.slice()};
}
function settledResources(cid){
 const rows=bucket('trade',cid).domesticSales;
 if(!Array.isArray(rows))return[];
 const ids=new Set();
 rows.forEach(wrapper=>{
  const sale=wrapper?.sale&&typeof wrapper.sale==='object'?wrapper.sale:wrapper;
  const t=num(wrapper?.turn)??num(sale?.simulationTurn);
  if(!sale||String(sale.status||'').toUpperCase()!=='SETTLED'||
    String(sale.paymentStatus||'').toUpperCase()!=='SETTLED'||
    String(sale.ownerAllocationStatus||'').toUpperCase()!=='RECONCILED'||
    t===null||t>turn()||t<Math.max(0,turn()-THRESHOLDS.lookbackTurns+1))return;
  const rid=String(sale.resourceId||'').trim();if(rid)ids.add(rid);
 });
 return [...ids].sort((a,b)=>token(a).localeCompare(token(b)));
}
function classify(summary,share){
 const hhi=num(summary?.privateCompanyHhi)??0,s=num(share)??0;
 if(s>=THRESHOLDS.intervention.leaderTotalMarketSharePct||
   (hhi>=THRESHOLDS.intervention.privateCompanyHhiWithShare&&s>=THRESHOLDS.intervention.minimumLeaderShareForHhiInterventionPct))return'INTERVENTION';
 if(s>=THRESHOLDS.investigation.leaderTotalMarketSharePct||hhi>=THRESHOLDS.investigation.privateCompanyHhi)return'INVESTIGATION';
 if(s>=THRESHOLDS.watch.leaderTotalMarketSharePct||hhi>=THRESHOLDS.watch.privateCompanyHhi)return'WATCH';
 return'NONE';
}
function stateControlProof(cid,companyId){
 const assets=bucket('economy',cid).productionAssets;
 const rows=(Array.isArray(assets)?assets:[]).filter(asset=>
  String(asset?.ownerType||'').toUpperCase()==='PRIVATE_ENTERPRISE'&&
  id(asset.ownerCompanyId||asset.ownerId||asset.privateCompanyId)===id(companyId));
 if(!rows.length)return{verified:false,reason:'NO_PRIVATE_ASSET_STATE_CONTROL_RECORD',assetIds:[]};
 const invalid=rows.filter(asset=>{
  const rights=asset.stateControlRights||{};
  return rights.authority!=='OMEGA_STATE_CONTROL_RIGHTS_V1'||
   String(rights.operationalControl||'').toUpperCase()!=='STATE_POLICY_ONLY'||
   REQUIRED_RIGHTS.some(key=>rights[key]!==true)||
   String(asset.privatePermitStatus||'').toUpperCase()!=='ACTIVE';
 });
 return{verified:invalid.length===0,reason:invalid.length?'PRIVATE_ASSET_STATE_CONTROL_RIGHTS_INCOMPLETE':null,
  assetIds:rows.map(x=>String(x.id||x.factoryId||'')).filter(Boolean),
  unverifiedAssetIds:invalid.map(x=>String(x.id||x.factoryId||'')).filter(Boolean),
  rightsAuthority:'OMEGA_STATE_CONTROL_RIGHTS_V1'};
}
function caseId(cid,rid,company){return'OMEGA-ANTITRUST:'+cid+':'+token(rid)+':'+token(company);}
function appendEvent(snapshot,type,row){
 snapshot.events=Array.isArray(snapshot.events)?snapshot.events:[];
 snapshot.events.push({eventId:type+':'+row.caseId+':T'+turn(),type,caseId:row.caseId,companyId:row.companyId,
  resourceId:row.resourceId,turn:turn(),stage:row.stage||null,interventionStatus:row.interventionStatus||null});
 if(snapshot.events.length>1024)snapshot.events.splice(0,snapshot.events.length-1024);
}
function processCountry(countryId){
 const cid=country(countryId||playerCountry()),active=playerCountry();
 if(!active)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
 if(cid!==active)return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY',countryId:cid,playerCountryId:active};
 const installed=install();if(!installed.ready)return{status:'UNAVAILABLE',reason:installed.reason||'COMPETITION_HANDLER_NOT_READY'};
 const prior=competitionState(cid);
 if(num(prior.lastProcessedTurn)===turn())return{status:'ALREADY_UPDATED',countryId:cid,turn:turn(),
  activeRestrictionCount:(prior.activeRestrictions||[]).length};
 const api=marketApi();if(!api||typeof api.getPrivateMarketConcentration!=='function')
  return{status:'UNAVAILABLE',reason:'PRIVATE_MARKET_CONCENTRATION_API_UNAVAILABLE'};
 const snapshot=prior,cases=Array.isArray(snapshot.cases)?snapshot.cases:[],byId=new Map(cases.map(row=>[row.caseId,row]));
 const observed=new Set(),evaluatedResources=new Set(),decisions=[],resources=settledResources(cid);
 resources.forEach(resourceId=>{
  let summary;
  try{summary=api.getPrivateMarketConcentration({countryId:cid,resourceId,lookbackTurns:THRESHOLDS.lookbackTurns});}
  catch(error){decisions.push({resourceId,status:'ERROR',reason:String(error?.message||error)});return;}
  if(!summary||summary.status!=='AVAILABLE')return;
  evaluatedResources.add(token(resourceId));
  const firms=(Array.isArray(summary.firms)?summary.firms:[])
   .filter(row=>COMPANY_IDS.includes(id(row.companyId))&&(num(row.settledSalesValue)||0)>0)
   .sort((a,b)=>(num(b.totalAttributedMarketSharePct)||0)-(num(a.totalAttributedMarketSharePct)||0)||
    id(a.companyId).localeCompare(id(b.companyId)));
  if(!firms.length)return;
  const hhi=num(summary.privateCompanyHhi)??0;
  const candidates=firms.filter(row=>(num(row.totalAttributedMarketSharePct)||0)>=THRESHOLDS.watch.leaderTotalMarketSharePct);
  if(!candidates.length&&classify(summary,num(firms[0].totalAttributedMarketSharePct))!=='NONE')candidates.push(firms[0]);
  candidates.forEach(firm=>{
   const companyId=id(firm.companyId),share=num(firm.totalAttributedMarketSharePct)??0,
    stage=classify(summary,share);
   if(stage==='NONE')return;
   const key=caseId(cid,resourceId,companyId);observed.add(key);
   let row=byId.get(key);
   const created=!row;
   if(!row){
    row={caseId:key,countryId:cid,resourceId,companyId,status:'OPEN',openedTurn:turn(),createdTurn:turn(),
     interventionStatus:'NOT_REQUIRED',belowThresholdTurns:0,authority:'OMEGA_PRIVATE_MARKET_COMPETITION_RUNTIME'};
    cases.push(row);byId.set(key,row);
   }
   row.status='OPEN';row.stage=stage;row.lastObservedTurn=turn();row.lastObservedPrivateCompanyHhi=hhi;
   row.leaderTotalMarketSharePct=Number(share.toFixed(4));
   row.privateSectorMarketSharePct=num(summary.privateSectorMarketSharePct);
   row.verifiedSettledSaleCount:num(summary.verifiedSettledSaleCount)||0;
   row.totalAttributedSettledMarketValue:num(summary.totalAttributedSettledMarketValue)||0;
   row.evidenceWindow={fromTurn:summary.fromTurn,toTurn:summary.toTurn,lookbackTurns:summary.lookbackTurns,
    source:'SETTLED_PAID_OWNER_ATTRIBUTION_RECONCILED_DOMESTIC_SALES'};
   row.thresholds=clone(THRESHOLDS);row.thresholdAuthority='GAMEPLAY_MODEL_INDICATORS_NOT_LEGAL_FINDINGS';
   row.belowThresholdTurns=0;
   if(stage==='INTERVENTION'){
    if(row.interventionStatus!=='ACTIVE'){
     const proof=stateControlProof(cid,companyId);row.stateControlProof=proof;
     if(proof.verified){
      row.interventionStatus='ACTIVE';row.interventionType='PRIVATE_FACTORY_EXPANSION_HOLD';
      row.interventionStartedTurn=turn();row.interventionReason='DOMINANCE_THRESHOLD_REACHED';
      appendEvent(snapshot,created?'ANTITRUST_INTERVENTION_APPLIED':'ANTITRUST_INTERVENTION_REAPPLIED',row);
     }else{
      row.interventionStatus='BLOCKED_STATE_CONTROL';row.interventionReason=proof.reason;
      appendEvent(snapshot,'ANTITRUST_INTERVENTION_BLOCKED_STATE_CONTROL',row);
     }
    }else{
     row.stateControlProof=stateControlProof(cid,companyId);
    }
   }else if(row.interventionStatus==='ACTIVE'){
    // A previously authorised expansion hold remains until the market leaves WATCH
    // for three consecutive committed turns; temporary dips do not release it.
    row.interventionReason='EXPANSION_HOLD_PENDING_MARKET_REBALANCE';
   }else{
    row.interventionStatus='NOT_REQUIRED';row.interventionReason=null;
   }
   row.updatedTurn=turn();
   decisions.push({resourceId,companyId,stage,leaderTotalMarketSharePct:row.leaderTotalMarketSharePct,
    privateCompanyHhi:hhi,interventionStatus:row.interventionStatus});
  });
 });
 cases.forEach(row=>{
  if(!row||row.status==='RESOLVED'||observed.has(row.caseId)||!evaluatedResources.has(token(row.resourceId)))return;
  row.belowThresholdTurns=(num(row.belowThresholdTurns)||0)+1;
  row.lastBelowThresholdTurn=turn();row.updatedTurn=turn();
  if(row.belowThresholdTurns>=THRESHOLDS.releaseConfirmationTurns){
   const wasActive=row.interventionStatus==='ACTIVE';
   row.status='RESOLVED';row.resolvedTurn=turn();row.resolutionReason='CONCENTRATION_BELOW_WATCH_THRESHOLDS_FOR_REQUIRED_TURNS';
   if(wasActive)row.interventionStatus='LIFTED';
   appendEvent(snapshot,wasActive?'ANTITRUST_EXPANSION_HOLD_RELEASED':'MARKET_CONCENTRATION_CASE_RESOLVED',row);
  }
 });
 snapshot.version=VERSION;snapshot.countryId=cid;snapshot.generatedTurn=turn();snapshot.lastProcessedTurn=turn();
 snapshot.lookbackTurns=THRESHOLDS.lookbackTurns;snapshot.thresholds=clone(THRESHOLDS);
 snapshot.resourcesChecked=resources.length;snapshot.latestDecisions=decisions.slice(-128);
 snapshot.activeRestrictions=cases.filter(row=>row&&row.status==='OPEN'&&row.interventionStatus==='ACTIVE')
  .map(row=>({caseId:row.caseId,countryId:cid,resourceId:row.resourceId,companyId:row.companyId,
   status:'ACTIVE',restrictionType:'PRIVATE_FACTORY_EXPANSION_HOLD',startsTurn:row.interventionStartedTurn,
   reason:row.interventionReason,authority:'OMEGA_STATE_CONTROL_RIGHTS_V1'}));
 snapshot.activeRestrictions=snapshot.activeRestrictions.slice(-256);
 snapshot.cases=cases.slice(-512);
 const result=dispatch(COMMAND,cid,{countryId:cid,snapshot:snapshot});
 if(!result||result.accepted!==true){
  return{status:'FAILED',reason:result?.reason||'COMPETITION_STATE_PUBLISH_FAILED',detail:clone(result||null)};
 }
 emit('OMEGA_PRIVATE_MARKET_COMPETITION_TURN_PROCESSED',cid,{turn:turn(),resourcesChecked:resources.length,
  caseCount:snapshot.cases.length,activeRestrictionCount:snapshot.activeRestrictions.length});
 return{status:'COMPLETED',countryId:cid,turn:turn(),resourcesChecked:resources.length,
  caseCount:snapshot.cases.length,activeRestrictionCount:snapshot.activeRestrictions.length,
  decisions:clone(decisions),authority:'OMEGA_PRIVATE_MARKET_COMPETITION_RUNTIME'};
}
function getCompanyExpansionRestriction(countryId,companyId,resourceId){
 const cid=country(countryId||playerCountry()),company=id(companyId),rid=String(resourceId||'').trim();
 if(cid!==playerCountry()||!company)return null;
 const rows=competitionState(cid).activeRestrictions||[];
 const found=rows.find(row=>row&&String(row.status||'').toUpperCase()==='ACTIVE'&&row.authority==='OMEGA_STATE_CONTROL_RIGHTS_V1'&&
  row.restrictionType==='PRIVATE_FACTORY_EXPANSION_HOLD'&&id(row.companyId)===company&&
  (!rid||token(row.resourceId)===token(rid))&&
  (num(row.startsTurn)===null||turn()>=num(row.startsTurn)));
 return found?clone(found):null;
}
function getCountryStatus(countryId){
 const cid=country(countryId||playerCountry());
 if(cid!==playerCountry())return{status:'BLOCKED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 const snap=competitionState(cid);
 return{status:'AVAILABLE',countryId:cid,turn:turn(),lastProcessedTurn:snap.lastProcessedTurn??null,
  resourcesChecked:snap.resourcesChecked||0,cases:clone(snap.cases||[]),
  activeRestrictions:clone(snap.activeRestrictions||[]),thresholds:clone(snap.thresholds||THRESHOLDS),
  authority:'OMEGA_PRIVATE_MARKET_COMPETITION_RUNTIME'};
}
function diagnostics(){
 const cid=playerCountry(),snap=cid?competitionState(cid):{};
 return{version:VERSION,handlerReady:handlersReady,handlerErrors:handlerErrors.slice(),playerCountryId:cid||null,
  lastProcessedTurn:snap.lastProcessedTurn??null,caseCount:(snap.cases||[]).length,
  activeRestrictionCount:(snap.activeRestrictions||[]).length,thresholds:clone(THRESHOLDS)};
}
function onTurn(event){
 const detail=event?.detail||event||{},cid=country(detail.countryId||detail.playerCountryId||playerCountry());
 if(!cid||cid!==playerCountry())return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
 return processCountry(cid);
}
function init(){
 install();
 if(!g.__omegaPrivateMarketCompetitionTurnHook&&typeof g.addEventListener==='function'){
  g.__omegaPrivateMarketCompetitionTurnHook=true;
  g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
  g.addEventListener('OMEGA_READY',install);
  g.addEventListener('OMEGA_GAME_SESSION_STARTED',install);
 }
 return diagnostics();
}
const API=Object.freeze({VERSION,THRESHOLDS:clone(THRESHOLDS),install,processCountry,getCountryStatus,
 getCompanyExpansionRestriction,diagnostics});
g.Omega=g.Omega||{};g.Omega.PrivateMarketCompetitionRuntime=API;
g.OmegaPrivateMarketCompetitionRuntime=API;
try{init();}catch(error){g.OmegaPrivateMarketCompetitionRuntimeError=String(error?.message||error);}
})(typeof globalThis!=='undefined'?globalThis:window);
