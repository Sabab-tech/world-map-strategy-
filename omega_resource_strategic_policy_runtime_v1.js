/* OMEGA STRATEGIC RESOURCE POLICY RUNTIME v1.0.0
 * Enforceable embargoes/blockades, site exploration/commissioning, environmental
 * impacts and remediation. Numerical behavior is sourced from the JSON ruleset.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const clone=(v,seen=new WeakMap())=>{
 if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);
 if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x));return a;}
 const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;
};
const num=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);return null;};
const id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const state=()=>g.Game?.state||g.gameState||{};
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
let policyRules=null,loadPromise=null,handlersReady=false,registrationErrors=[];
function country(v){
 const raw=String(v??'').trim();if(!raw)return null;
 try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;const hit=b?.resolveCountry?.(raw);if(hit?.id)return id(hit.id);}catch(_){}
 return id(raw);
}
function inlineRules(){return g.OmegaResourceStrategicPolicyRules||g.Omega?.ResourceStrategicPolicyRules||null;}
async function loadRules(){
 const inline=inlineRules();if(inline){policyRules=inline;return{status:'READY',source:'INLINE',version:inline.version||null};}
 if(policyRules)return{status:'READY',source:'CACHE',version:policyRules.version||null};
 if(loadPromise)return loadPromise;
 loadPromise=(async()=>{try{
  if(typeof fetch!=='function')throw new Error('STRATEGIC_POLICY_RULES_FETCH_UNAVAILABLE');
  const res=await fetch('resource_strategic_policy_rules_v1.json',{cache:'no-store'});
  if(!res?.ok)throw new Error('STRATEGIC_POLICY_RULES_FETCH_FAILED');
  const data=await res.json();if(data?.schemaVersion!=='OMEGA_RESOURCE_STRATEGIC_POLICY_RULES_V1')throw new Error('STRATEGIC_POLICY_RULE_SCHEMA_INVALID');
  policyRules=data;g.OmegaResourceStrategicPolicyRules=data;g.Omega=g.Omega||{};g.Omega.ResourceStrategicPolicyRules=data;
  return{status:'READY',source:'JSON',version:data.version||null};
 }catch(e){return{status:'FAILED',reason:String(e?.message||e)};}finally{loadPromise=null;}})();
 return loadPromise;
}
const rules=()=>policyRules||inlineRules()||null;
function configuredLimit(group,key){const value=num(rules()?.[group]?.[key]);return value!==null&&Number.isInteger(value)&&value>0?value:null;}
function dispatch(owner,type,c,payload={}){
 const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
 try{const r=m.dispatchCommand(owner,type,country(c),clone(payload),{turn:turn(),commandType:type,correlationId:payload?.policyId||payload?.projectId||payload?.transactionId||payload?.correlationId||null});
  return r?.result&&['APPLIED','REJECTED'].includes(String(r.status||''))?r.result:r;
 }catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
}
function emit(type,c,payload={}){
 try{const m=interop();if(m?.emitEvent)return m.emitEvent(type,country(c),'strategic-resource-policy',clone(payload),{turn:turn(),correlationId:payload?.policyId||payload?.projectId||payload?.transactionId||null});}catch(_){}
 try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:country(c),payload:clone(payload),source:'strategic-resource-policy'}}));}catch(_){}
 return null;
}
function rowsFor(domain,field){
 const root=state()?.[domain];if(!root||typeof root!=='object')return[];
 const out=[];for(const [key,b] of Object.entries(root)){if(!b||typeof b!=='object'||Array.isArray(b))continue;
  for(const p of Array.isArray(b[field])?b[field]:[])out.push({...clone(p),issuerCountryId:p?.issuerCountryId||key});}
 return out;
}
function active(p){if(!p||String(p.status||'ACTIVE').toUpperCase()!=='ACTIVE')return false;const t=turn(),a=num(p.startsTurn),b=num(p.expiresTurn);return(a===null||t>=a)&&(b===null||t<=b);}
function scopeMatch(p,v){return String(p??'*')==='*'||tok(p)===tok(v);}
function embargoMatch(p,buyer,seller,rid){
 if(!active(p)||!scopeMatch(p.resourceId,rid))return false;
 const issuer=country(p.issuerCountryId),target=country(p.targetCountryId||'*'),d=String(p.direction||'BOTH').toUpperCase();
 return (issuer===seller&&(target===buyer||target==='*')&&(d==='EXPORT'||d==='BOTH'))||
  (issuer===buyer&&(target===seller||target==='*')&&(d==='IMPORT'||d==='BOTH'));
}
function isResourceEmbargoed(buyer,seller,resourceId){
 const b=country(buyer),s=country(seller),r=String(resourceId||'').trim();if(!b||!s||!r)return{blocked:false,reason:'INCOMPLETE_SCOPE',policies:[]};
 const hits=rowsFor('trade','resourceEmbargoes').filter(p=>embargoMatch(p,b,s,r));
 return{blocked:hits.length>0,reason:hits.length?'RESOURCE_EMBARGO_ACTIVE':null,policies:hits.map(p=>({policyId:p.policyId,issuerCountryId:p.issuerCountryId,targetCountryId:p.targetCountryId,resourceId:p.resourceId,direction:p.direction}))};
}
function blockadeMatch(p,c,ctx={}){
 if(!active(p))return false;const target=country(p.targetCountryId||'*'),cid=country(c);if(target!=='*'&&target!==cid)return false;
 if(!scopeMatch(p.resourceId||'*',ctx.resourceId||''))return false;
 const mode=tok(ctx.transportMode||ctx.mode),modes=Array.isArray(p.modes)?p.modes.map(tok):['ship'];
 if(modes.length&&!modes.includes('*')&&!modes.includes(mode))return false;
 for(const k of ['siteId','routeId','factoryId'])if(p[k]&&String(p[k])!==String(ctx[k]||''))return false;
 return true;
}
function isRouteBlocked(c,ctx={}){
 const hits=rowsFor('trade','resourceBlockades').filter(p=>blockadeMatch(p,c,ctx));
 return{blocked:hits.length>0,reason:hits.length?'RESOURCE_ROUTE_BLOCKADE_ACTIVE':null,blockades:hits.map(p=>({policyId:p.policyId,issuerCountryId:p.issuerCountryId,targetCountryId:p.targetCountryId,resourceId:p.resourceId,modes:p.modes,routeId:p.routeId||null}))};
}
function findSite(siteId){
 const wanted=String(siteId||'').trim();if(!wanted)return null;
 const packs=[g.OmegaResourceSiteCanonicalCatalogData,g.Omega?.ResourceSiteCanonicalCatalogData,g.OmegaResourceSiteMasterResearchData,g.Omega?.ResourceSiteMasterResearchData,g.OmegaResourceLosslessReferenceData];
 for(const p of packs){const a=Array.isArray(p?.sites)?p.sites:Array.isArray(p?.records)?p.records:Array.isArray(p?.records?.sites)?p.records.sites:Array.isArray(p?.sites)?p.sites:[];const hit=a.find(x=>String(x?.siteId||'')===wanted);if(hit)return hit;}
 return null;
}
function siteLocked(site){
 const raw=String(site?.operation?.extractionEligibility||site?.extractionEligibility||site?.runtime?.extractionEligibility||'').toUpperCase();
 return /LOCKED_UNTIL_DISCOVERY|DISCOVERY_AND_FINAL_INVESTMENT|REQUIRES_EXPLORATION|UNDISCOVERED/.test(raw);
}
function siteAvailableForExtraction(c,siteId,siteRecord=null){
 const row=siteRecord||findSite(siteId),cid=country(c),sid=String(siteId||row?.siteId||'').trim();
 if(!sid)return{allowed:false,reason:'SITE_ID_REQUIRED'};
 if(!row)return{allowed:true,reason:null,siteKnown:false};
 if(row.map?.markerEligible===false||row.runtime?.aliasOfSiteId||row.operation?.commercialExtraction===false||String(row.operation?.status||'').toUpperCase()==='NOT_APPLICABLE')
  return{allowed:false,reason:'SITE_NOT_COMMERCIALLY_EXECUTABLE',siteKnown:true};
 if(country(row.countryId||row.identity?.countryIso3)!==cid)return{allowed:false,reason:'SITE_COUNTRY_MISMATCH',siteKnown:true};
 if(!siteLocked(row))return{allowed:true,reason:null,siteKnown:true};
 const res=state()?.resource?.[cid]||{},commissioned=Array.isArray(res.commissionedSites)?res.commissionedSites:[];
 const hit=commissioned.find(x=>String(x?.siteId||'')===sid&&String(x?.status||'').toUpperCase()==='COMMISSIONED');
 return hit?{allowed:true,reason:null,siteKnown:true,commissioned:true}:{allowed:false,reason:'EXPLORATION_AND_INVESTMENT_REQUIRED',siteKnown:true};
}
function setPolicy(ctx,kind,payload){
 const c=country(ctx.countryId),p=payload||{},target=country(p.targetCountryId||'*'),rid=String(p.resourceId||'*').trim();
 if(!c||!target)return{accepted:false,reason:'POLICY_COUNTRY_REQUIRED'};
 if(target===c||target==='*'&&p.targetCountryId)return{accepted:false,reason:'POLICY_TARGET_INVALID'};
 if(!rid)return{accepted:false,reason:'POLICY_RESOURCE_REQUIRED'};
 const direction=String(p.direction||rules()?.policy?.defaultEmbargoDirection||'').toUpperCase();
 if(kind==='embargo'&&!['EXPORT','IMPORT','BOTH'].includes(direction))return{accepted:false,reason:'EMBARGO_DIRECTION_INVALID'};
 const path=kind==='embargo'?'trade.resourceEmbargoes':'trade.resourceBlockades';
 const historyLimit=configuredLimit('policy','maxPolicyHistory'),activeLimit=configuredLimit('policy','maxActivePoliciesPerCountry');
 if(historyLimit===null||activeLimit===null)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const raw=ctx.stateTransaction.get(path),arr=Array.isArray(raw)?clone(raw):[];
 const policyId=String(p.policyId||kind.toUpperCase()+':'+c+':'+target+':'+tok(rid)+':T'+turn());
 const old=arr.findIndex(x=>String(x?.policyId||'')===policyId);
 const startsTurn=Math.max(turn(),num(p.startsTurn)??turn()),expiresTurn=num(p.expiresTurn);
 if(expiresTurn!==null&&expiresTurn<startsTurn)return{accepted:false,reason:'POLICY_EXPIRY_BEFORE_START'};
 const row={policyId,issuerCountryId:c,targetCountryId:target,resourceId:rid,status:'ACTIVE',createdTurn:turn(),startsTurn,expiresTurn,reason:String(p.reason||''),
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',...(kind==='embargo'?{direction}:{modes:Array.isArray(p.modes)?p.modes.map(tok).filter(Boolean):(Array.isArray(rules()?.policy?.defaultBlockadeModes)?rules().policy.defaultBlockadeModes.map(tok):[]),routeId:p.routeId||null,siteId:p.siteId||null,factoryId:p.factoryId||null})};
 if(old<0&&active(arr.find(x=>String(x?.policyId||'')===policyId))===false&&arr.filter(active).length>=activeLimit)return{accepted:false,reason:'ACTIVE_POLICY_LIMIT_REACHED',maximum:activeLimit};
 if(old>=0)arr[old]={...arr[old],...row};else arr.push(row);
 ctx.stateTransaction.set(path,arr.slice(-historyLimit));emit(kind==='embargo'?'OMEGA_RESOURCE_EMBARGO_DECLARED':'OMEGA_RESOURCE_ROUTE_BLOCKADE_DECLARED',c,row);
 return{accepted:true,policy:row,idempotent:old>=0};
}
function liftPolicy(ctx,kind,payload){
 const policyId=String(payload?.policyId||'').trim();if(!policyId)return{accepted:false,reason:'POLICY_ID_REQUIRED'};
 const path=kind==='embargo'?'trade.resourceEmbargoes':'trade.resourceBlockades',raw=ctx.stateTransaction.get(path),arr=Array.isArray(raw)?clone(raw):[];
 const i=arr.findIndex(x=>String(x?.policyId||'')===policyId);if(i<0)return{accepted:false,reason:'POLICY_NOT_FOUND'};
 if(String(arr[i].status||'').toUpperCase()==='LIFTED')return{accepted:true,duplicate:true,policy:arr[i]};
 arr[i].status='LIFTED';arr[i].liftedTurn=turn();arr[i].liftedReason=String(payload?.reason||'');ctx.stateTransaction.set(path,arr);
 emit(kind==='embargo'?'OMEGA_RESOURCE_EMBARGO_LIFTED':'OMEGA_RESOURCE_ROUTE_BLOCKADE_LIFTED',ctx.countryId,arr[i]);return{accepted:true,policy:arr[i]};
}
function impactKey(siteId){return String(siteId||'UNBOUND_SITE').trim()||'UNBOUND_SITE';}
function impactIndex(root,siteId){const by=root?.bySite&&typeof root.bySite==='object'?root.bySite:{};return by[impactKey(siteId)]&&typeof by[impactKey(siteId)]==='object'?by[impactKey(siteId)]:{};}
function extractionMultiplier(c,siteId,resourceId,tx){
 const e=rules()?.environmental;if(!e?.enabled||num(e.productionPenaltyThreshold)===null||num(e.maximumProductionPenalty)===null||num(e.productionPenaltyPerIndex)===null||num(e.minimumExtractionMultiplier)===null)return 1;
 const root=tx?.get?.('resource.environmentalImpact')||state()?.resource?.[country(c)]?.environmentalImpact||{},s=impactIndex(root,siteId);
 const burden=Math.max(0,((num(s.landIndex)||0)+(num(s.waterIndex)||0))*0.5-num(e.productionPenaltyThreshold));
 const penalty=Math.min(num(e.maximumProductionPenalty),burden*num(e.productionPenaltyPerIndex));
 return Math.max(num(e.minimumExtractionMultiplier),1-penalty);
}
function unitScale(unit){
 const scale=rules()?.environmental?.quantityScaleByUnit||{},raw=String(unit||'').toUpperCase().replace(/[ -]+/g,'_');
 if(num(scale[raw])!==null)return num(scale[raw]);const simple=raw.replace(/S$/,'');if(num(scale[simple])!==null)return num(scale[simple]);return num(scale.DEFAULT);
}
function recordImpactTx(ctx,payload,kind){
 const e=rules()?.environmental,ledgerLimit=configuredLimit('policy','maxEnvironmentalLedgerRows');if(!e?.enabled||ledgerLimit===null||num(e.maximumBatchIntensity)===null||num(e.maximumSiteIndex)===null||num(e.defaultEnvironmentalRisk)===null||num(e.defaultWaterStress)===null||num(e.riskInfluence)===null||num(e.waterStressInfluence)===null||!e.batchImpact||num(e.batchImpact.land)===null||num(e.batchImpact.water)===null||num(e.batchImpact.emissions)===null||num(e.batchImpact.processingWaste)===null)return{accepted:false,reason:'ENVIRONMENTAL_RULES_UNAVAILABLE'};
 const c=country(ctx.countryId),p=payload||{},quantity=num(p.quantity);if(quantity===null||quantity<=0)return{accepted:false,reason:'ENVIRONMENTAL_QUANTITY_INVALID'};
 const transactionId=String(p.transactionId||p.extractionId||p.batchId||[kind,c,p.siteId,turn()].join(':'));
 const oldLedger=ctx.stateTransaction.get('resource.environmentalLedger'),ledger=Array.isArray(oldLedger)?clone(oldLedger):[];
 if(ledger.some(x=>String(x?.transactionId||'')===transactionId&&String(x?.impactType||'')===kind))return{accepted:true,duplicate:true,transactionId};
 const rootRaw=ctx.stateTransaction.get('resource.environmentalImpact'),root=rootRaw&&typeof rootRaw==='object'?clone(rootRaw):{bySite:{},revision:0};
 if(!root.bySite||typeof root.bySite!=='object')root.bySite={};
 const sid=impactKey(p.siteId),old=impactIndex(root,sid),site=findSite(p.siteId)||{},risk=site.naturalRisk||site.riskProfile||{};
 const riskValue=Math.max(0,Math.min(100,num(risk.environmental)??num(e.defaultEnvironmentalRisk)));
 const waterStress=Math.max(0,Math.min(100,num(risk.waterStress)??num(e.defaultWaterStress)));
 const scale=unitScale(p.unit);if(scale===null||scale<=0)return{accepted:false,reason:'ENVIRONMENTAL_UNIT_SCALE_UNAVAILABLE'};
 const intensity=Math.min(num(e.maximumBatchIntensity),quantity/scale);
 const riskInfluence=Math.max(0,Math.min(1,num(e.riskInfluence))),waterInfluence=Math.max(0,Math.min(1,num(e.waterStressInfluence)));
 const impact=kind==='PROCESSING'?num(e.batchImpact.processingWaste):num(e.batchImpact.land);
 const landDelta=kind==='PROCESSING'?0:intensity*impact*((1-riskInfluence)+riskInfluence*riskValue/100);
 const waterDelta=kind==='PROCESSING'?intensity*num(e.batchImpact.processingWaste)*((1-waterInfluence)+waterInfluence*waterStress/100):intensity*num(e.batchImpact.water)*((1-waterInfluence)+waterInfluence*waterStress/100);
 const emissionsDelta=intensity*num(e.batchImpact.emissions);
 const wasteDelta=kind==='PROCESSING'?intensity*num(e.batchImpact.processingWaste):0;
 const max=num(e.maximumSiteIndex);
 const next={...clone(old),siteId:sid,countryId:c,resourceId:String(p.resourceId||''),landIndex:Math.min(max,(num(old.landIndex)||0)+landDelta),
  waterIndex:Math.min(max,(num(old.waterIndex)||0)+waterDelta),emissionsIndex:Math.min(max,(num(old.emissionsIndex)||0)+emissionsDelta),
  wasteIndex:Math.min(max,(num(old.wasteIndex)||0)+wasteDelta),lastUpdatedTurn:turn(),lastTransactionId:transactionId};
 root.bySite[sid]=next;root.revision=(num(root.revision)||0)+1;root.lastUpdatedTurn=turn();
 ledger.push({transactionId,impactType:kind,countryId:c,siteId:sid,resourceId:p.resourceId||null,quantity,unit:p.unit||null,landDelta,waterDelta,emissionsDelta,wasteDelta,turn:turn(),status:'COMMITTED'});
 ctx.stateTransaction.set('resource.environmentalImpact',root);ctx.stateTransaction.set('resource.environmentalLedger',ledger.slice(-ledgerLimit));
 emit('OMEGA_RESOURCE_ENVIRONMENTAL_IMPACT_RECORDED',c,{transactionId,impactType:kind,siteId:sid,resourceId:p.resourceId||null,landDelta,waterDelta,emissionsDelta,wasteDelta});
 return{accepted:true,transactionId,impact:next,delta:{landDelta,waterDelta,emissionsDelta,wasteDelta}};
}
function recordExtractionImpactTx(ctx,p){return recordImpactTx(ctx,p,'EXTRACTION');}
function recordProcessingImpactTx(ctx,p){return recordImpactTx(ctx,p,'PROCESSING');}
function surveyStart(ctx,payload){
 const c=country(ctx.countryId),p=payload||{},sid=String(p.siteId||'').trim(),site=findSite(sid);
 if(!sid||!site)return{accepted:false,reason:'SITE_NOT_FOUND'};
 if(country(site.countryId||site.identity?.countryIso3)!==c)return{accepted:false,reason:'SITE_COUNTRY_MISMATCH'};
 if(site.map?.markerEligible===false||site.runtime?.aliasOfSiteId||site.operation?.commercialExtraction===false||String(site.operation?.status||'').toUpperCase()==='NOT_APPLICABLE')return{accepted:false,reason:'SITE_NOT_SURVEYABLE'};
 const current=ctx.stateTransaction.get('resource.explorationProjects'),projects=Array.isArray(current)?clone(current):[];
 const activeProject=projects.find(x=>x.siteId===sid&&['IN_PROGRESS','DISCOVERED_PENDING_INVESTMENT','INVESTMENT_APPROVED','COMMISSIONED'].includes(String(x.status||'')));
 if(activeProject)return{accepted:true,duplicate:true,project:activeProject};
 const er=rules()?.exploration,projectLimit=configuredLimit('exploration','maximumSurveyProjects');if(!er?.enabled||projectLimit===null||num(er.minimumSurveyTurns)===null||num(er.maximumSurveyTurns)===null||num(er.surveyTurns)===null)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const min=Math.max(1,num(er.minimumSurveyTurns)),max=Math.max(min,num(er.maximumSurveyTurns));
 const duration=Math.max(min,Math.min(max,Math.floor(num(p.requiredTurns)??num(er.surveyTurns))));
 const row={projectId:String(p.projectId||'EXPLORE:'+c+':'+sid+':T'+turn()),countryId:c,siteId:sid,resourceId:site.identity?.resourceTypeId||site.resourceId||site.sourceSiteRecord?.resourceId||null,
  status:'IN_PROGRESS',startedTurn:turn(),lastProgressTurn:turn(),progressTurns:0,requiredTurns:duration,progress:0,investmentStatus:'NOT_APPROVED',
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',provenance:{sourceAuthority:'CANONICAL_SITE_REGISTRY',quantityAuthority:'UNOBSERVED_UNTIL_DISCOVERY'}};
 projects.push(row);ctx.stateTransaction.set('resource.explorationProjects',projects.slice(-projectLimit));
 emit('OMEGA_RESOURCE_EXPLORATION_STARTED',c,row);return{accepted:true,project:row};
}
function surveyTick(ctx,payload){
 const projectLimit=configuredLimit('exploration','maximumSurveyProjects');if(projectLimit===null)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const c=country(ctx.countryId),current=ctx.stateTransaction.get('resource.explorationProjects'),projects=Array.isArray(current)?clone(current):[];
 let advanced=0,discovered=0;
 for(const p of projects){
  if(String(p.status||'')!=='IN_PROGRESS'||Number(p.lastProgressTurn)===turn())continue;
  const tech=g.Omega?.ResourceResearchRuntime,site=findSite(p.siteId),eff=num(tech?.getEngineeringEffect?.(c,p.siteId,p.resourceId,site?.siteType)?.explorationEfficiencyMultiplier);
  p.progressTurns=Math.min(num(p.requiredTurns)||1,(num(p.progressTurns)||0)+Math.max(0.1,eff||1));
  p.progress=Math.min(100,p.progressTurns/Math.max(1,num(p.requiredTurns)||1)*100);p.lastProgressTurn=turn();p.updatedTurn=turn();advanced++;
  if(p.progressTurns+1e-9>=(num(p.requiredTurns)||1)){p.progress=100;p.status='DISCOVERED_PENDING_INVESTMENT';p.discoveredTurn=turn();discovered++;emit('OMEGA_RESOURCE_SITE_DISCOVERED',c,p);}
 }
 ctx.stateTransaction.set('resource.explorationProjects',projects.slice(-projectLimit));return{accepted:true,countryId:c,turn:turn(),advanced,discovered};
}
function investSite(countryId,payload){
 const c=country(countryId),p=payload||{},projectId=String(p.projectId||'').trim();if(!projectId)return{accepted:false,reason:'PROJECT_ID_REQUIRED'};
 const existing=state()?.resource?.[c]?.explorationProjects,project=Array.isArray(existing)?existing.find(x=>x.projectId===projectId):null;
 if(!project)return{accepted:false,reason:'EXPLORATION_PROJECT_NOT_FOUND'};
 if(project.status==='INVESTMENT_APPROVED'||project.status==='COMMISSIONED')return{accepted:true,duplicate:true,project};
 if(project.status!=='DISCOVERED_PENDING_INVESTMENT')return{accepted:false,reason:'DISCOVERY_NOT_COMPLETED'};
 const configuredCost=num(rules()?.exploration?.investmentCostPerProject);if(configuredCost===null)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const cost=Math.max(0,num(p.amount)??configuredCost);
 const debit=dispatch('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{amount:cost,reason:'RESOURCE_SITE_INVESTMENT',referenceId:projectId,transactionId:'RESOURCE_INVEST:'+projectId});
 if(debit?.status!=='APPLIED'&&debit?.accepted!==true)return{accepted:false,reason:'TREASURY_INVESTMENT_DEBIT_FAILED',detail:debit};
 const r=dispatch('resource','OMEGA_RESOURCE_EXPLORATION_INVEST_COMMIT',c,{projectId,amount:cost,transactionId:'RESOURCE_INVEST:'+projectId});
 if(r?.accepted===false||r?.status==='FAILED')return{accepted:false,reason:'INVESTMENT_STATE_COMMIT_FAILED',detail:r};
 return{accepted:true,project:r?.project||null,cost,transactionId:'RESOURCE_INVEST:'+projectId};
}
function investCommit(ctx,payload){
 const p=payload||{},projects=ctx.stateTransaction.get('resource.explorationProjects'),arr=Array.isArray(projects)?clone(projects):[],i=arr.findIndex(x=>x.projectId===String(p.projectId||''));
 if(i<0)return{accepted:false,reason:'EXPLORATION_PROJECT_NOT_FOUND'};
 if(['INVESTMENT_APPROVED','COMMISSIONED'].includes(arr[i].status))return{accepted:true,duplicate:true,project:arr[i]};
 if(arr[i].status!=='DISCOVERED_PENDING_INVESTMENT')return{accepted:false,reason:'DISCOVERY_NOT_COMPLETED'};
 arr[i].status='INVESTMENT_APPROVED';arr[i].investmentStatus='APPROVED';arr[i].investmentCost=num(p.amount)||0;arr[i].investmentTurn=turn();arr[i].investmentTransactionId=p.transactionId||null;
 ctx.stateTransaction.set('resource.explorationProjects',arr);emit('OMEGA_RESOURCE_SITE_INVESTMENT_APPROVED',ctx.countryId,arr[i]);return{accepted:true,project:arr[i]};
}
function commission(ctx,payload){
 const c=country(ctx.countryId),sid=String(payload?.siteId||'').trim(),projectId=String(payload?.projectId||'').trim();
 const projects=ctx.stateTransaction.get('resource.explorationProjects'),arr=Array.isArray(projects)?clone(projects):[],i=arr.findIndex(x=>(projectId&&x.projectId===projectId)||(!projectId&&x.siteId===sid));
 if(i<0)return{accepted:false,reason:'EXPLORATION_PROJECT_NOT_FOUND'};
 const p=arr[i];if(p.status==='COMMISSIONED')return{accepted:true,duplicate:true,project:p};
 if(p.status!=='INVESTMENT_APPROVED')return{accepted:false,reason:'EXPLICIT_INVESTMENT_REQUIRED'};
 const site=findSite(p.siteId);if(!site||site.operation?.commercialExtraction===false||site.map?.markerEligible===false||site.runtime?.aliasOfSiteId)return{accepted:false,reason:'SITE_NOT_COMMERCIALLY_EXECUTABLE'};
 const projectLimit=configuredLimit('exploration','maximumSurveyProjects');if(projectLimit===null)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const raw=ctx.stateTransaction.get('resource.commissionedSites'),commissioned=Array.isArray(raw)?clone(raw):[];
 if(!commissioned.some(x=>x.siteId===p.siteId))commissioned.push({siteId:p.siteId,countryId:c,resourceId:p.resourceId,status:'COMMISSIONED',projectId:p.projectId,commissionedTurn:turn(),authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME'});
 p.status='COMMISSIONED';p.commissionedTurn=turn();arr[i]=p;
 ctx.stateTransaction.set('resource.explorationProjects',arr);ctx.stateTransaction.set('resource.commissionedSites',commissioned.slice(-projectLimit));
 emit('OMEGA_RESOURCE_SITE_COMMISSIONED',c,p);return{accepted:true,project:p,siteId:p.siteId};
}
function remediate(ctx,payload){
 const c=country(ctx.countryId),p=payload||{},sid=String(p.siteId||'').trim(),amount=num(p.amount);
 if(!sid||amount===null||amount<=0)return{accepted:false,reason:'REMEDIATION_INPUT_INVALID'};
 const e=rules()?.environmental;if(!e?.enabled||num(e.remediationCostPerIndex)===null||num(e.remediationMaximumPerAction)===null)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const cost=amount*num(e.remediationCostPerIndex),max=num(e.remediationMaximumPerAction);if(amount>max)return{accepted:false,reason:'REMEDIATION_AMOUNT_EXCEEDS_LIMIT',maximum:max};
 const txn=String(p.transactionId||'REMEDIATE:'+c+':'+sid+':T'+turn());
 const before=ctx.stateTransaction.get('resource.environmentalLedger'),ledger=Array.isArray(before)?clone(before):[];
 if(ledger.some(x=>x.transactionId===txn))return{accepted:true,duplicate:true,transactionId:txn};
 // Debit is a separate treasury-owned transaction. Do not change environmental state if it fails.
 const debit=dispatch('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{amount:cost,reason:'RESOURCE_ENVIRONMENTAL_REMEDIATION',transactionId:txn});
 if(debit?.status!=='APPLIED'&&debit?.accepted!==true)return{accepted:false,reason:'TREASURY_REMEDIATION_DEBIT_FAILED',detail:debit,cost};
 const rootRaw=ctx.stateTransaction.get('resource.environmentalImpact'),root=rootRaw&&typeof rootRaw==='object'?clone(rootRaw):{bySite:{},revision:0};
 if(!root.bySite||typeof root.bySite!=='object')root.bySite={};const old=impactIndex(root,sid),reduce=Math.min(amount,num(e.remediationMaximumPerAction)||25);
 const next={...clone(old),siteId:sid,countryId:c,landIndex:Math.max(0,(num(old.landIndex)||0)-reduce),waterIndex:Math.max(0,(num(old.waterIndex)||0)-reduce),wasteIndex:Math.max(0,(num(old.wasteIndex)||0)-reduce),lastUpdatedTurn:turn()};
 root.bySite[sid]=next;root.revision=(num(root.revision)||0)+1;root.lastUpdatedTurn=turn();
 ledger.push({transactionId:txn,impactType:'REMEDIATION',countryId:c,siteId:sid,amount:reduce,cost,turn:turn(),status:'COMMITTED'});
 ctx.stateTransaction.set('resource.environmentalImpact',root);ctx.stateTransaction.set('resource.environmentalLedger',ledger.slice(-configuredLimit('policy','maxEnvironmentalLedgerRows')));
 emit('OMEGA_RESOURCE_ENVIRONMENT_REMEDIATED',c,{transactionId:txn,siteId:sid,amount:reduce,cost});return{accepted:true,transactionId:txn,cost,impact:next};
}
function handlerFor(type,fn,owner='resource'){const m=interop();if(!m?.registerCommandHandler)return false;try{m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME'});m.registerCommandHandler(type,owner,fn);return true;}catch(e){registrationErrors.push(type+':'+String(e?.message||e));return false;}}
function install(){
 registrationErrors=[];const defs=[
 ['OMEGA_RESOURCE_EMBARGO_DECLARE',(cmd,ctx)=>setPolicy(ctx,'embargo',cmd?.payload||{}),'trade'],
 ['OMEGA_RESOURCE_EMBARGO_LIFT',(cmd,ctx)=>liftPolicy(ctx,'embargo',cmd?.payload||{}),'trade'],
 ['OMEGA_RESOURCE_BLOCKADE_DECLARE',(cmd,ctx)=>setPolicy(ctx,'blockade',cmd?.payload||{}),'trade'],
 ['OMEGA_RESOURCE_BLOCKADE_LIFT',(cmd,ctx)=>liftPolicy(ctx,'blockade',cmd?.payload||{}),'trade'],
 ['OMEGA_RESOURCE_EXPLORATION_START',(cmd,ctx)=>surveyStart(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_EXPLORATION_TICK',(cmd,ctx)=>surveyTick(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_EXPLORATION_INVEST_COMMIT',(cmd,ctx)=>investCommit(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_EXPLORATION_COMMISSION',(cmd,ctx)=>commission(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_ENVIRONMENT_RECORD_EXTRACTION',(cmd,ctx)=>recordExtractionImpactTx(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_ENVIRONMENT_RECORD_PROCESSING',(cmd,ctx)=>recordProcessingImpactTx(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_ENVIRONMENTAL_REMEDIATE',(cmd,ctx)=>remediate(ctx,cmd?.payload||{})]
 ];
 let n=0;for(const [t,f,owner='resource'] of defs)if(handlerFor(t,f,owner))n++;handlersReady=n===defs.length;return{ready:handlersReady,registered:n,required:defs.length,errors:registrationErrors.slice()};
}
function countryIds(){
 const out=new Set(Object.keys(state()?.resource||{}).map(country).filter(Boolean));
 try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;for(const x of b?.list?.('COUNTRY')||b?.list?.()||[]){const r=typeof x==='object'?(x.iso3||x.countryId||x.id||x.code):x;if(r)out.add(country(r));}}catch(_){}
 return [...out].filter(Boolean).sort();
}
function processCountry(c){install();const cc=country(c);if(!cc)return{status:'SKIPPED',reason:'COUNTRY_REQUIRED'};return dispatch('resource','OMEGA_RESOURCE_EXPLORATION_TICK',cc,{correlationId:'EXPLORATION-TICK:'+cc+':'+turn()});}
function processAll(){return countryIds().map(processCountry);}
function declareEmbargo(c,p={}){install();return dispatch('trade','OMEGA_RESOURCE_EMBARGO_DECLARE',c,p);}
function liftEmbargo(c,p={}){install();return dispatch('trade','OMEGA_RESOURCE_EMBARGO_LIFT',c,p);}
function declareBlockade(c,p={}){install();return dispatch('trade','OMEGA_RESOURCE_BLOCKADE_DECLARE',c,p);}
function liftBlockade(c,p={}){install();return dispatch('trade','OMEGA_RESOURCE_BLOCKADE_LIFT',c,p);}
function startExploration(c,p={}){install();return dispatch('resource','OMEGA_RESOURCE_EXPLORATION_START',c,p);}
function approveInvestment(c,p={}){install();return investSite(c,p);}
function commissionSite(c,p={}){install();return dispatch('resource','OMEGA_RESOURCE_EXPLORATION_COMMISSION',c,p);}
function remediateSite(c,p={}){install();return dispatch('resource','OMEGA_RESOURCE_ENVIRONMENTAL_REMEDIATE',c,p);}
function diagnostics(){
 const trade=state()?.trade||{},resource=state()?.resource||{};
 return{version:VERSION,rulesLoaded:!!rules(),rulesVersion:rules()?.version||null,handlersReady,handlerErrors:registrationErrors.slice(),
  countryCount:countryIds().length,activeEmbargoes:rowsFor('trade','resourceEmbargoes').filter(active).length,activeBlockades:rowsFor('trade','resourceBlockades').filter(active).length,
  explorationProjects:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.explorationProjects)?r.explorationProjects.filter(p=>['IN_PROGRESS','DISCOVERED_PENDING_INVESTMENT','INVESTMENT_APPROVED'].includes(p.status)).length:0),0),
  commissionedSiteCount:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.commissionedSites)?r.commissionedSites.length:0),0),
  environmentalLedgerRows:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.environmentalLedger)?r.environmentalLedger.length:0),0),
  marketLedgerCountries:Object.keys(trade).length};
}
const API=Object.freeze({VERSION,loadRules,install,diagnostics,isResourceEmbargoed,isRouteBlocked,siteAvailableForExtraction,extractionMultiplier,recordExtractionImpactTx,recordProcessingImpactTx,declareEmbargo,liftEmbargo,declareBlockade,liftBlockade,startExploration,processCountry,processAll,approveInvestment,commissionSite,remediateSite});
g.Omega=g.Omega||{};g.Omega.ResourceStrategicPolicyRuntime=API;g.OmegaResourceStrategicPolicyRuntime=API;
if(typeof g.addEventListener==='function'){
 g.addEventListener('OMEGA_READY',()=>{loadRules().then(()=>install()).catch(()=>{});});
 g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{loadRules().then(()=>install()).catch(()=>{});});
 g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{try{processAll();}catch(_){}});
 g.addEventListener('OMEGA_RESOURCE_PROCESSING_COMPLETED',e=>{
  const d=e?.detail||{},p=d.payload||d,cc=country(p.countryId||d.countryId);
  const tx=String(p.transactionId||p.processId||'');if(!cc||!tx)return;
  const outputs=p.outputs||p.outputQuantities||{},inputs=p.inputs||p.inputQuantities||{};
  const quantity=Object.values(inputs).reduce((s,v)=>s+Math.max(0,num(v?.quantity??v)||0),0)||Object.values(outputs).reduce((s,v)=>s+Math.max(0,num(v?.quantity??v)||0),0);
  if(quantity<=0)return;
  const root=state()?.resource?.[cc]||{},sourceIds=Array.isArray(p.sourceBatchIds)?p.sourceBatchIds.map(String):[],batches=Array.isArray(root.batches)?root.batches:[];
  const sourceBatch=batches.find(x=>sourceIds.includes(String(x?.batchId||'')))||batches.find(x=>String(x?.batchId||'')===String(p.batchId||''))||null;
  const siteId=p.siteId||p.sourceSiteId||p.siteReferenceKey||p.sourceOccurrenceKey||sourceBatch?.siteReferenceKey||sourceBatch?.siteId||sourceBatch?.occurrenceKey||null;
  dispatch('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_PROCESSING',cc,{transactionId:tx,siteId,resourceId:p.resourceId||sourceBatch?.resourceId||Object.keys(inputs)[0]||Object.keys(outputs)[0]||null,quantity,unit:p.unit||sourceBatch?.unit||'TONNES'});
 });
}
void loadRules();install();
})(typeof window!=='undefined'?window:globalThis);
