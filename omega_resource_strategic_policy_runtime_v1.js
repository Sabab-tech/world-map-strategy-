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
let policyRules=null,loadPromise=null,handlersReady=false,registeredHandlerCount=0,registrationErrors=[];
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
 try{const m=interop();if(m?.emitEvent)return m.emitEvent(type,country(c),'resource',clone(payload),{turn:turn(),correlationId:payload?.violationId||payload?.policyId||payload?.projectId||payload?.transactionId||payload?.decisionId||null});}catch(_){}
 try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:country(c),payload:clone(payload),source:'resource'}}));}catch(_){}
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
 const b=country(buyer),s=country(seller),r=String(resourceId||'').trim();if(!b||!s||!r)return{blocked:true,reason:'INCOMPLETE_SCOPE',policies:[]};
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
 const locked=siteLocked(row);
 if(row.map?.markerEligible===false||row.runtime?.aliasOfSiteId||String(row.operation?.status||'').toUpperCase()==='NOT_APPLICABLE'||(row.operation?.commercialExtraction===false&&!locked))
  return{allowed:false,reason:'SITE_NOT_COMMERCIALLY_EXECUTABLE',siteKnown:true};
 if(country(row.countryId||row.identity?.countryIso3)!==cid)return{allowed:false,reason:'SITE_COUNTRY_MISMATCH',siteKnown:true};
 if(!locked)return{allowed:true,reason:null,siteKnown:true};
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
 if(!raw)return null;
 if(num(scale[raw])!==null)return num(scale[raw]);const simple=raw.replace(/S$/,'');if(num(scale[simple])!==null)return num(scale[simple]);return null;
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
 const factor=carbonFactor(p.resourceId,p.unit),activeQuota=ctx.stateTransaction.get('resource.carbonQuota');
 if(factor!==null){
  const carbonResult=recordCarbonEmissionTx(ctx,{transactionId:'CARBON:'+transactionId,quantity:quantity*factor,unit:'TONNES_CO2E',
   source:'RESOURCE_'+kind,sourceId:transactionId,siteId:p.siteId||null,resourceId:p.resourceId||null,
   provenance:'SIMULATED_GAMEPLAY_ACTIVITY_FACTOR'});
  if(carbonResult?.blocked===true)return{...carbonResult,accepted:true,transactionId,siteId:sid,environmentalImpactCommitted:false};
  if(carbonResult?.accepted===false)return carbonResult;
 }else if(activeQuota&&String(activeQuota.status||'').toUpperCase()==='ACTIVE'){
  return{accepted:false,reason:'CARBON_EMISSIONS_FACTOR_UNAVAILABLE',resourceId:p.resourceId||null,unit:p.unit||null};
 }
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
 if(site.map?.markerEligible===false||site.runtime?.aliasOfSiteId||String(site.operation?.status||'').toUpperCase()==='NOT_APPLICABLE'||(site.operation?.commercialExtraction===false&&!siteLocked(site)))return{accepted:false,reason:'SITE_NOT_SURVEYABLE'};
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
 const configuredCost=num(rules()?.exploration?.investmentCostPerProject);if(configuredCost===null||configuredCost<0)return{accepted:false,reason:'STRATEGIC_POLICY_RULES_NOT_READY'};
 const suppliedAmount=p.amount===undefined||p.amount===null?configuredCost:num(p.amount);
 if(suppliedAmount===null||Math.abs(suppliedAmount-configuredCost)>1e-9)return{accepted:false,reason:'EXPLORATION_INVESTMENT_AMOUNT_MISMATCH',requiredAmount:configuredCost};
 const cost=configuredCost;
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
 const site=findSite(p.siteId);if(!site||String(site.operation?.status||'').toUpperCase()==='NOT_APPLICABLE'||(site.operation?.commercialExtraction===false&&!siteLocked(site))||site.map?.markerEligible===false||site.runtime?.aliasOfSiteId)return{accepted:false,reason:'SITE_NOT_COMMERCIALLY_EXECUTABLE'};
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
 if(!root.bySite||typeof root.bySite!=='object')root.bySite={};const old=impactIndex(root,sid),reduce=Math.min(amount,num(e.remediationMaximumPerAction));
 const next={...clone(old),siteId:sid,countryId:c,landIndex:Math.max(0,(num(old.landIndex)||0)-reduce),waterIndex:Math.max(0,(num(old.waterIndex)||0)-reduce),wasteIndex:Math.max(0,(num(old.wasteIndex)||0)-reduce),lastUpdatedTurn:turn()};
 root.bySite[sid]=next;root.revision=(num(root.revision)||0)+1;root.lastUpdatedTurn=turn();
 ledger.push({transactionId:txn,impactType:'REMEDIATION',countryId:c,siteId:sid,amount:reduce,cost,turn:turn(),status:'COMMITTED'});
 ctx.stateTransaction.set('resource.environmentalImpact',root);ctx.stateTransaction.set('resource.environmentalLedger',ledger.slice(-configuredLimit('policy','maxEnvironmentalLedgerRows')));
 emit('OMEGA_RESOURCE_ENVIRONMENT_REMEDIATED',c,{transactionId:txn,siteId:sid,amount:reduce,cost});return{accepted:true,transactionId:txn,cost,impact:next};
}



function requireCognitiveApproval(ctx,operation,amount=null,projectType=null){
 const cfg=rules()?.cognitive,limit=num(cfg?.maxDecisionAgeTurns);
 const ledger=ctx?.stateTransaction?.get('resource.cognitiveDecisionLedger');
 const decisions=Array.isArray(ledger)?clone(ledger):[];
 let latestIndex=-1;
 for(let i=decisions.length-1;i>=0;i--)if(decisions[i]?.gateScope==='STRATEGIC_HIGH_IMPACT_OPERATIONS'){latestIndex=i;break;}
 const latest=latestIndex>=0?decisions[latestIndex]:null;
 if(!latest)return{accepted:false,reason:'COGNITIVE_GATE_DECISION_REQUIRED',operation};
 if(limit===null||limit<0)return{accepted:false,reason:'COGNITIVE_GATE_RULES_INVALID',operation};
 if(turn()-(num(latest.turn)||0)>limit)return{accepted:false,reason:'COGNITIVE_GATE_DECISION_EXPIRED',operation,decisionId:latest.decisionId};
 if(latest.aiGenerated!==true||latest.authority!=='OMEGA_SERVER_RESOURCE_DECISION_AI')
  return{accepted:false,reason:'SERVER_AI_DECISION_REQUIRED',operation,decisionId:latest.decisionId};
 if(String(latest.operation||'')!==String(operation||''))
  return{accepted:false,reason:'COGNITIVE_GATE_OPERATION_MISMATCH',operation,approvedOperation:latest.operation,decisionId:latest.decisionId};
 if(operation==='SWF_CAPITALIZATION'){
  const requested=num(latest.requestedAmount),actual=num(amount);
  if(requested===null||actual===null||Math.abs(requested-actual)>1e-9)
   return{accepted:false,reason:'COGNITIVE_GATE_AMOUNT_MISMATCH',operation,approvedAmount:requested,requestedAmount:actual,decisionId:latest.decisionId};
 }else if(operation==='POWER_PROJECT'){
  if(String(latest.projectType||'')!==String(projectType||''))
   return{accepted:false,reason:'COGNITIVE_GATE_PROJECT_TYPE_MISMATCH',operation,approvedProjectType:latest.projectType,requestedProjectType:projectType,decisionId:latest.decisionId};
  const ruleCost=num(rules()?.power?.projectTypes?.[projectType]?.constructionCostTreasuryUnits);
  const assessedCost=num(latest.aiAssessment?.operationRequirements?.constructionCostTreasuryUnits);
  if(ruleCost===null||assessedCost===null||Math.abs(ruleCost-assessedCost)>1e-9||amount===null||Math.abs(ruleCost-num(amount))>1e-9)
   return{accepted:false,reason:'COGNITIVE_GATE_RULESET_COST_MISMATCH',operation,decisionId:latest.decisionId};
 }
 if(latest.decision!=='PROCEED_WITH_RECORDED_ASSUMPTIONS'){
  return{accepted:false,reason:latest.decision==='BLOCK'?'COGNITIVE_GATE_BLOCKED':'COGNITIVE_GATE_REVIEW_REQUIRED',operation,
   decisionId:latest.decisionId,decision:latest.decision};
 }
 if(latest.consumedAtTurn!==undefined&&latest.consumedAtTurn!==null)
  return{accepted:false,reason:'COGNITIVE_GATE_APPROVAL_ALREADY_USED',operation,decisionId:latest.decisionId,consumedAtTurn:latest.consumedAtTurn};
 decisions[latestIndex]={...latest,consumedAtTurn:turn(),consumedOperation:operation,consumedAmount:num(amount),consumedProjectType:projectType||null};
 ctx.stateTransaction.set('resource.cognitiveDecisionLedger',decisions);
 return{accepted:true,decisionId:latest.decisionId,decision:latest.decision,operation,consumedAtTurn:turn()};
}

function capitalizeSwfTx(ctx,payload){
 const cfg=rules()?.swf,p=payload||{},amount=num(p.amount),transactionId=String(p.transactionId||'').trim();
 if(!cfg?.enabled)return{accepted:false,reason:'SWF_RULES_UNAVAILABLE'};
 if(amount===null||amount<=0)return{accepted:false,reason:'SWF_AMOUNT_MUST_BE_POSITIVE'};
 if(!transactionId)return{accepted:false,reason:'SWF_TRANSACTION_ID_REQUIRED'};
 const c=country(ctx.countryId),prior=ctx.stateTransaction.get('resource.sovereignWealthFund')||{};
 const contributions=Array.isArray(prior.contributions)?clone(prior.contributions):[];
 const old=contributions.find(x=>String(x?.transactionId||'')===transactionId);
 if(old)return Math.abs((num(old.amount)||0)-amount)<1e-9?{accepted:true,duplicate:true,contribution:old,fund:prior}:{accepted:false,reason:'SWF_TRANSACTION_ID_CONFLICT'};
 const gate=requireCognitiveApproval(ctx,'SWF_CAPITALIZATION',amount);if(!gate.accepted)return gate;
 const limit=num(cfg.maxTransactions);if(limit===null||limit<1)return{accepted:false,reason:'SWF_HISTORY_LIMIT_UNAVAILABLE'};
 const debit=dispatch('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{amount,reason:'SOVEREIGN_WEALTH_FUND_CAPITALIZATION',
  referenceId:'SWF:'+c,transactionId:'SWF-CAPITAL:'+transactionId});
 if(debit?.status!=='APPLIED'&&debit?.accepted!==true)return{accepted:false,reason:'SWF_TREASURY_DEBIT_FAILED',detail:debit};
 const contribution={transactionId,amount,countryId:c,turn:turn(),status:'CAPITALIZED',unit:'TREASURY_NATIVE_UNITS',
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',provenance:'PLAYER_AUTHORIZED_TREASURY_TRANSFER'};
 contributions.push(contribution);
 const fund={fundId:'SWF:'+c,countryId:c,balance:(num(prior.balance)||0)+amount,unit:'TREASURY_NATIVE_UNITS',
  currencyCode:ctx.stateTransaction.get('finance.currencyCode')||ctx.stateTransaction.get('trade.settlementCurrency')||ctx.stateTransaction.get('economy.currencyCode')||null,
  contributions:contributions.slice(-limit),createdTurn:num(prior.createdTurn)??turn(),updatedTurn:turn(),
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',provenance:'LEDGER_BACKED_TREASURY_CAPITALIZATION'};
 ctx.stateTransaction.set('resource.sovereignWealthFund',fund);
 emit('OMEGA_RESOURCE_SWF_CAPITALIZED',c,{contribution,fund});
 return{accepted:true,contribution,fund};
}
function capitalizeSovereignWealthFund(c,p={}){install();return dispatch('resource','OMEGA_RESOURCE_SWF_CAPITALIZE',c,p);}
function carbonUnit(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function carbonFactor(resourceId,unit){
 const map=rules()?.carbon?.emissionsFactorsByResourceUnit||{};
 const raw=carbonUnit(unit),alias=({TONNE:'TONNES',METRIC_TONNE:'TONNES',METRIC_TONNES:'TONNES',TONNE_ORE:'TONNES_ORE',BBL:'BBL',BARREL:'BARREL'})[raw]||raw;
 const value=num(map[tok(resourceId)+':'+raw]??map[tok(resourceId)+':'+alias]);
 return value!==null&&value>=0?value:null;
}
function carbonWindow(quota){
 const starts=num(quota?.startTurn),period=num(quota?.periodTurns);
 if(starts===null||period===null||period<1||!Number.isInteger(period))return null;
 if(turn()<starts)return null;
 const index=Math.floor((turn()-starts)/period);
 return{periodIndex:index,startTurn:starts+index*period,endTurn:starts+(index+1)*period};
}
function quotaUsed(ctx,quota,window){
 const ledger=ctx?.stateTransaction?.get('resource.carbonEmissionsLedger');
 return(Array.isArray(ledger)?ledger:[]).filter(x=>String(x?.quotaId||'')===String(quota?.quotaId||'')&&Number(x?.periodIndex)===window.periodIndex)
  .reduce((sum,x)=>sum+Math.max(0,num(x?.quantityTonnesCo2e)||0),0);
}
function emitCarbonViolation(c,row){
 const type='OMEGA_RESOURCE_CARBON_QUOTA_VIOLATION_RECORDED';
 try{
  const m=interop();
  if(m?.emitEvent){m.emitEvent(type,c,'resource',clone(row),{turn:turn(),correlationId:row.violationId});return true;}
 }catch(_){}
 try{if(typeof g.dispatchEvent==='function'&&typeof g.CustomEvent==='function')g.dispatchEvent(new g.CustomEvent(type,{detail:{eventType:type,countryId:c,payload:clone(row),source:'resource'}}));}catch(_){}
 return false;
}
function recordCarbonQuotaViolation(ctx,payload={}){
 const p=payload||{},c=country(ctx?.countryId||p.countryId);if(!c)return null;
 const tx=ctx?.stateTransaction&&typeof ctx.stateTransaction.get==='function'&&typeof ctx.stateTransaction.set==='function'?ctx.stateTransaction:null;
 const resourceBucket=()=>{
  const root=state();
  if(tx)return null;
  root.resource=root.resource&&typeof root.resource==='object'?root.resource:{};
  const key=Object.keys(root.resource).find(x=>country(x)===c)||c;
  root.resource[key]=root.resource[key]&&typeof root.resource[key]==='object'?root.resource[key]:{};
  return root.resource[key];
 };
 const bucket=resourceBucket();
 const quota=tx?.get('resource.carbonQuota')||bucket?.carbonQuota||state()?.resource?.[c]?.carbonQuota||null;
 const quotaId=String(p.quotaId||quota?.quotaId||'');
 const attempt=String(p.transactionId||p.attemptId||[
  'PREVIEW',c,turn(),p.source||'ACTIVITY',p.siteId||p.factoryId||'',p.resourceId||'',p.quantity??p.quantityTonnesCo2e??'',p.unit||''
 ].join(':'));
 const violationId=String(p.violationId||'CARBON-VIOLATION:'+attempt);
 const previous=tx?.get('resource.carbonQuotaEnforcementLedger')??bucket?.carbonQuotaEnforcementLedger;
 const ledger=Array.isArray(previous)?clone(previous):[];
 const existing=ledger.find(x=>String(x?.violationId||'')===violationId);
 if(existing)return existing;
 const impactRoot=tx?.get('resource.environmentalImpact')||bucket?.environmentalImpact||state()?.resource?.[c]?.environmentalImpact||{};
 const siteKey=p.siteId?impactKey(p.siteId):null;
 const siteImpact=siteKey&&impactRoot?.bySite&&typeof impactRoot.bySite==='object'?impactRoot.bySite[siteKey]||null:null;
 const envRules=rules()?.environmental||{},threshold=num(envRules.productionPenaltyThreshold);
 const siteBurden=siteImpact?((Math.max(0,num(siteImpact.landIndex)||0)+Math.max(0,num(siteImpact.waterIndex)||0))/2):0;
 const remediationFollowUp=siteImpact?(threshold!==null&&siteBurden>=threshold?'REMEDIATION_RECOMMENDED':'MONITOR_SITE_IMPACT'):'NO_SITE_LINKED';
 const row={
  violationId,countryId:c,quotaId:quotaId||null,turn:turn(),periodIndex:num(p.periodIndex),
  source:String(p.source||'UNSPECIFIED_ACTIVITY'),sourceId:p.sourceId||p.factoryId||null,
  transactionId:p.transactionId||null,siteId:p.siteId||null,resourceId:p.resourceId||null,
  inputQuantity:num(p.quantity),inputUnit:p.inputUnit||p.unit||null,
  requestedTonnesCo2e:num(p.requestedTonnesCo2e??p.emissionsTonnesCo2e??p.quantityTonnesCo2e),
  usedTonnesCo2e:num(p.usedTonnesCo2e),allowanceTonnesCo2e:num(p.allowanceTonnesCo2e),
  projectedTonnesCo2e:num(p.projectedTonnesCo2e),reason:'CARBON_QUOTA_EXCEEDED',
  enforcementAction:'ACTIVITY_BLOCKED_BEFORE_EMISSION_COMMIT',
  productionConsequence:/POWER_GENERATION/i.test(String(p.source||''))?'POWER_ASSET_HELD_IDLE':
   (/RESOURCE_(EXTRACTION|PROCESSING)/i.test(String(p.source||''))?'EXTRACTION_OR_PROCESSING_BLOCKED':'EMISSION_ENTRY_NOT_COMMITTED'),
  linkedSiteImpact:siteImpact?{landIndex:num(siteImpact.landIndex),waterIndex:num(siteImpact.waterIndex),
   emissionsIndex:num(siteImpact.emissionsIndex),wasteIndex:num(siteImpact.wasteIndex)}:null,
  remediationFollowUp,penaltyTreasuryUnits:0,status:'BLOCKED',
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',
  provenance:'CARBON_QUOTA_ENFORCEMENT_RULESET_NO_EMISSION_COMMITTED'
 };
 const limit=configuredLimit('carbon','maxEnforcementLedgerRows')||4096;
 ledger.push(row);
 if(tx)tx.set('resource.carbonQuotaEnforcementLedger',ledger.slice(-limit));
 else bucket.carbonQuotaEnforcementLedger=ledger.slice(-limit);
 emitCarbonViolation(c,row);
 return row;
}
function recordCarbonEmissionTx(ctx,payload){
 const cfg=rules()?.carbon,p=payload||{},quantity=num(p.quantityTonnesCo2e??p.quantity);
 if(!cfg?.enabled)return{accepted:false,reason:'CARBON_RULES_UNAVAILABLE'};
 if(quantity===null||quantity<=0)return{accepted:false,reason:'CARBON_EMISSION_QUANTITY_INVALID'};
 if(carbonUnit(p.unit||cfg.unit)!=='TONNES_CO2E')return{accepted:false,reason:'CARBON_EMISSION_UNIT_INVALID',requiredUnit:'TONNES_CO2E'};
 const transactionId=String(p.transactionId||'').trim();
 if(!transactionId)return{accepted:false,reason:'CARBON_EMISSION_TRANSACTION_ID_REQUIRED'};
 const before=ctx.stateTransaction.get('resource.carbonEmissionsLedger'),ledger=Array.isArray(before)?clone(before):[];
 const existing=ledger.find(x=>String(x?.transactionId||'')===transactionId);
 if(existing){
  const same=Math.abs((num(existing.quantityTonnesCo2e)||0)-quantity)<1e-9&&String(existing.source||'')===String(p.source||'UNSPECIFIED_ACTIVITY');
  return same?{accepted:true,duplicate:true,record:existing}:{accepted:false,reason:'CARBON_EMISSION_TRANSACTION_CONFLICT'};
 }
 const activeQuota=ctx.stateTransaction.get('resource.carbonQuota');
 let quotaId=null,periodIndex=null,periodUsedBefore=0,allowance=null;
 if(activeQuota&&String(activeQuota.status||'').toUpperCase()==='ACTIVE'){
  const window=carbonWindow(activeQuota);
  if(!window)return{accepted:false,reason:'CARBON_QUOTA_WINDOW_INVALID'};
  periodUsedBefore=quotaUsed(ctx,activeQuota,window);allowance=num(activeQuota.allowanceTonnesCo2e);quotaId=activeQuota.quotaId;periodIndex=window.periodIndex;
  if(allowance===null||allowance<0)return{accepted:false,reason:'CARBON_QUOTA_ALLOWANCE_INVALID'};
  if(periodUsedBefore+quantity>allowance+1e-9){
   const violation=recordCarbonQuotaViolation(ctx,{transactionId,source:p.source||'UNSPECIFIED_ACTIVITY',sourceId:p.sourceId||null,
    siteId:p.siteId||null,resourceId:p.resourceId||null,quantityTonnesCo2e:quantity,unit:'TONNES_CO2E',
    requestedTonnesCo2e:quantity,usedTonnesCo2e:periodUsedBefore,allowanceTonnesCo2e:allowance,
    projectedTonnesCo2e:periodUsedBefore+quantity,periodIndex,quotaId});
   return{accepted:true,blocked:true,status:'BLOCKED',reason:'CARBON_QUOTA_EXCEEDED',quotaId,allowanceTonnesCo2e:allowance,
    usedTonnesCo2e:periodUsedBefore,requestedTonnesCo2e:quantity,projectedTonnesCo2e:periodUsedBefore+quantity,
    periodIndex,violation,emissionCommitted:false};
  }
 }
 const c=country(ctx.countryId),row={transactionId,countryId:c,source:String(p.source||'UNSPECIFIED_ACTIVITY'),sourceId:p.sourceId||null,
  siteId:p.siteId||null,resourceId:p.resourceId||null,quantityTonnesCo2e:quantity,unit:'TONNES_CO2E',turn:turn(),quotaId,periodIndex,
  status:'COMMITTED',authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',
  provenance:String(p.provenance||'EXPLICIT_SIMULATED_OR_MEASURED_ACTIVITY_RECORD')};
 const limit=configuredLimit('carbon','maxEmissionLedgerRows');if(limit===null)return{accepted:false,reason:'CARBON_LEDGER_LIMIT_UNAVAILABLE'};
 ledger.push(row);ctx.stateTransaction.set('resource.carbonEmissionsLedger',ledger.slice(-limit));
 const currentQuota=ctx.stateTransaction.get('resource.carbonQuota');
 if(currentQuota&&quotaId){
  const window=carbonWindow(currentQuota),used=(window?quotaUsed(ctx,currentQuota,window):0);
  ctx.stateTransaction.set('resource.carbonAccounting',{unit:'TONNES_CO2E',quotaId,currentPeriodIndex:periodIndex,
   currentPeriodUsedTonnesCo2e:used,lastUpdatedTurn:turn(),status:used>=(num(currentQuota.allowanceTonnesCo2e)||0)?'ALLOWANCE_EXHAUSTED':'WITHIN_ALLOWANCE',
   authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME'});
 }
 emit('OMEGA_RESOURCE_CARBON_EMISSION_RECORDED',c,row);
 return{accepted:true,record:row,periodUsedBefore,periodUsedAfter:periodUsedBefore+quantity,allowanceTonnesCo2e:allowance};
}
function previewCarbonActivity(countryId,resourceId,quantity,unit,source,txContext,activityContext={}){
 const c=country(countryId),q=num(quantity);if(!c||q===null||q<=0)return{allowed:false,reason:'CARBON_ACTIVITY_INPUT_INVALID'};
 const environmentalScale=unitScale(unit);
 if(environmentalScale===null||environmentalScale<=0)return{allowed:false,reason:'ENVIRONMENTAL_UNIT_SCALE_UNAVAILABLE',resourceId,unit};
 const quota=(txContext?.stateTransaction?.get('resource.carbonQuota'))||state()?.resource?.[c]?.carbonQuota;
 const active=quota&&String(quota.status||'').toUpperCase()==='ACTIVE';
 const factor=carbonFactor(resourceId,unit);
 if(!active)return{allowed:true,emissionsKnown:factor!==null,emissionsTonnesCo2e:factor===null?null:q*factor,reason:factor===null?'NO_SIMULATED_FACTOR_CONFIGURED':null};
 if(factor===null)return{allowed:false,reason:'CARBON_EMISSIONS_FACTOR_UNAVAILABLE',resourceId,unit};
 const window=carbonWindow(quota);if(!window)return{allowed:false,reason:'CARBON_QUOTA_WINDOW_INVALID'};
 const ledgerRaw=txContext?.stateTransaction?.get('resource.carbonEmissionsLedger')||state()?.resource?.[c]?.carbonEmissionsLedger;
 const ledger=Array.isArray(ledgerRaw)?ledgerRaw:[];
 const used=ledger.filter(x=>String(x?.quotaId||'')===String(quota.quotaId||'')&&Number(x?.periodIndex)===window.periodIndex)
  .reduce((sum,x)=>sum+Math.max(0,num(x?.quantityTonnesCo2e)||0),0);
 const amount=q*factor,allowance=num(quota.allowanceTonnesCo2e);
 if(allowance===null||allowance<0)return{allowed:false,reason:'CARBON_QUOTA_ALLOWANCE_INVALID'};
 const allowed=used+amount<=allowance+1e-9;
 const result={allowed,reason:allowed?null:'CARBON_QUOTA_EXCEEDED',resourceId,unit,source:source||'RESOURCE_ACTIVITY',
  factorTonnesCo2ePerUnit:factor,emissionsTonnesCo2e:amount,usedTonnesCo2e:used,
  projectedTonnesCo2e:used+amount,allowanceTonnesCo2e:allowance,periodIndex:window.periodIndex,quotaId:quota.quotaId};
 if(!allowed)recordCarbonQuotaViolation(txContext,{transactionId:activityContext.transactionId||null,
  attemptId:activityContext.activityId||null,siteId:activityContext.siteId||null,factoryId:activityContext.factoryId||null,
  source:source||'RESOURCE_ACTIVITY',sourceId:activityContext.sourceId||activityContext.factoryId||null,
  resourceId,quantity:q,inputUnit:unit,emissionsTonnesCo2e:amount,usedTonnesCo2e:used,
  projectedTonnesCo2e:used+amount,allowanceTonnesCo2e:allowance,periodIndex:window.periodIndex,quotaId:quota.quotaId});
 return result;
}
function setCarbonQuotaTx(ctx,payload){
 const cfg=rules()?.carbon,p=payload||{},allowance=num(p.allowanceTonnesCo2e),period=num(p.periodTurns??cfg?.defaultPeriodTurns);
 if(!cfg?.enabled)return{accepted:false,reason:'CARBON_RULES_UNAVAILABLE'};
 if(allowance===null||allowance<0)return{accepted:false,reason:'CARBON_QUOTA_ALLOWANCE_INVALID'};
 if(period===null||period<1||!Number.isInteger(period))return{accepted:false,reason:'CARBON_QUOTA_PERIOD_INVALID'};
 const c=country(ctx.countryId),quotaId=String(p.quotaId||'CARBON-QUOTA:'+c+':T'+turn()+':'+Date.now()).trim();
 const prior=ctx.stateTransaction.get('resource.carbonQuota');
 if(prior&&String(prior.quotaId||'')===quotaId){
  const same=Math.abs((num(prior.allowanceTonnesCo2e)||0)-allowance)<1e-9&&Number(prior.periodTurns)===period;
  return same?{accepted:true,duplicate:true,quota:prior}:{accepted:false,reason:'CARBON_QUOTA_ID_CONFLICT'};
 }
 const histBefore=ctx.stateTransaction.get('resource.carbonQuotaHistory'),history=Array.isArray(histBefore)?clone(histBefore):[];
 if(prior&&typeof prior==='object')history.push({...clone(prior),status:'SUPERSEDED',supersededTurn:turn()});
 const limit=configuredLimit('carbon','maxQuotaHistory');if(limit===null)return{accepted:false,reason:'CARBON_LEDGER_LIMIT_UNAVAILABLE'};
 const quota={quotaId,countryId:c,allowanceTonnesCo2e:allowance,unit:'TONNES_CO2E',periodTurns:period,startTurn:turn(),status:'ACTIVE',
  enforcement:'BLOCK_EMISSION_IF_ALLOWANCE_WOULD_BE_EXCEEDED',createdTurn:turn(),authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',
  provenance:'PLAYER_SET_SIMULATED_POLICY_RULE'};
 ctx.stateTransaction.set('resource.carbonQuota',quota);ctx.stateTransaction.set('resource.carbonQuotaHistory',history.slice(-limit));
 emit('OMEGA_RESOURCE_CARBON_QUOTA_SET',c,quota);return{accepted:true,quota};
}
function carbonQuotaSet(countryId,payload={}){install();return dispatch('resource','OMEGA_RESOURCE_CARBON_QUOTA_SET',countryId,payload);}
function recordCarbonEmission(countryId,payload={}){install();return dispatch('resource','OMEGA_RESOURCE_CARBON_EMISSION_RECORD',countryId,payload);}
function evaluateCognitiveGateTx(ctx,payload){
 const cfg=rules()?.cognitive,p=payload||{},answers=Array.isArray(p.answers)?p.answers.map(x=>String(x||'')):null;
 const required=num(cfg?.questionsRequired),historyLimit=configuredLimit('cognitive','maxHistory');
 if(!cfg?.enabled||required===null||historyLimit===null)return{accepted:false,reason:'COGNITIVE_RULES_UNAVAILABLE'};
 if(!answers||answers.length!==required||answers.some(x=>!['proceed','review','block'].includes(x)))return{accepted:false,reason:'ALL_12_QUESTIONS_REQUIRE_ANSWERS',requiredAnswers:required};
 const operation=String(p.operation||'').trim().toUpperCase();
 if(!['POWER_PROJECT','SWF_CAPITALIZATION'].includes(operation))return{accepted:false,reason:'COGNITIVE_GATE_OPERATION_INVALID'};
 const projectType=operation==='POWER_PROJECT'?String(p.projectType||'NUCLEAR_BASELOAD').trim().toUpperCase():null;
 if(operation==='POWER_PROJECT'&&projectType!=='NUCLEAR_BASELOAD')return{accepted:false,reason:'COGNITIVE_GATE_PROJECT_TYPE_UNSUPPORTED'};
 const requestedAmount=p.requestedAmount===undefined||p.requestedAmount===null||p.requestedAmount===''?null:num(p.requestedAmount);
 if(operation==='SWF_CAPITALIZATION'&&(requestedAmount===null||requestedAmount<=0))return{accepted:false,reason:'COGNITIVE_GATE_SWF_AMOUNT_REQUIRED'};
 if(operation==='POWER_PROJECT'&&requestedAmount!==null)return{accepted:false,reason:'COGNITIVE_GATE_POWER_AMOUNT_RULESET_CONTROLLED'};
 const decisionId=String(p.decisionId||'COGNITIVE:'+country(ctx.countryId)+':T'+turn()+':'+Date.now()).trim();
 const old=ctx.stateTransaction.get('resource.cognitiveDecisionLedger'),ledger=Array.isArray(old)?clone(old):[];
 const existing=ledger.find(x=>String(x?.decisionId||'')===decisionId);
 if(existing){
  const same=JSON.stringify(existing.answers)===JSON.stringify(answers)&&String(existing.operation||'')===operation&&
   (projectType===null?existing.projectType==null:String(existing.projectType||'')===projectType)&&
   ((requestedAmount===null&&existing.requestedAmount==null)||(requestedAmount!==null&&Math.abs((num(existing.requestedAmount)||0)-requestedAmount)<1e-9));
  return same?{accepted:true,duplicate:true,decision:existing}:{accepted:false,reason:'COGNITIVE_DECISION_ID_CONFLICT'};
 }
 const ai=p.aiAssessment&&typeof p.aiAssessment==='object'?p.aiAssessment:null;
 if(!ai||ai.aiGenerated!==true||ai.authority!=='OMEGA_SERVER_RESOURCE_DECISION_AI')
  return{accepted:false,reason:'AI_ASSESSMENT_REQUIRED',authorityRequired:'OMEGA_SERVER_RESOURCE_DECISION_AI'};
 const modelDecision=String(ai.decision||'').toUpperCase(),confidence=num(ai.confidence);
 if(!['PROCEED','REVIEW','BLOCK'].includes(modelDecision)||confidence===null||confidence<0||confidence>1)
  return{accepted:false,reason:'AI_ASSESSMENT_SCHEMA_INVALID'};
 const aiAmount=ai.requestedAmount===undefined||ai.requestedAmount===null||ai.requestedAmount===''?null:num(ai.requestedAmount);
 if(String(ai.operation||'').toUpperCase()!==operation||
    (projectType===null?ai.projectType!=null:String(ai.projectType||'').toUpperCase()!==projectType)||
    !((requestedAmount===null&&aiAmount===null)||(requestedAmount!==null&&aiAmount!==null&&Math.abs(requestedAmount-aiAmount)<1e-9)))
  return{accepted:false,reason:'AI_ASSESSMENT_SCOPE_MISMATCH'};
 if(operation==='POWER_PROJECT'){
  const cost=num(rules()?.power?.projectTypes?.[projectType]?.constructionCostTreasuryUnits);
  const assessedCost=num(ai.operationRequirements?.constructionCostTreasuryUnits);
  if(cost===null||assessedCost===null||Math.abs(cost-assessedCost)>1e-9)
   return{accepted:false,reason:'AI_ASSESSMENT_RULESET_MISMATCH'};
 }
 const blocks=answers.filter(x=>x==='block').length,reviews=answers.filter(x=>x==='review').length;
 let finalDecision=blocks?'BLOCK':(reviews>=4&&modelDecision==='PROCEED'?'REVIEW':modelDecision);
 const decision=finalDecision==='PROCEED'?'PROCEED_WITH_RECORDED_ASSUMPTIONS':finalDecision;
 const aiRecord={decision:modelDecision,confidence,operation,projectType,requestedAmount,
  operationRequirements:clone(ai.operationRequirements||{}),riskSummary:String(ai.riskSummary||'').slice(0,1200),
  findings:Array.isArray(ai.findings)?ai.findings.slice(0,12):[],
  recommendedChecks:Array.isArray(ai.recommendedChecks)?ai.recommendedChecks.slice(0,12):[],
  safetyOverride:ai.safetyOverride||null,model:String(ai.model||'GEMINI_MODEL_UNDISCLOSED'),
  provenance:String(ai.provenance||'SERVER_MODEL_RESPONSE_WITH_DETERMINISTIC_SAFETY_FLOORS')};
 const row={decisionId,countryId:country(ctx.countryId),turn:turn(),operation,projectType,requestedAmount,
  answers:answers.slice(),answeredCount:answers.length,blockCount:blocks,reviewCount:reviews,decision,status:'RECORDED',
  advisory:false,enforced:true,gateScope:'STRATEGIC_HIGH_IMPACT_OPERATIONS',authority:'OMEGA_SERVER_RESOURCE_DECISION_AI',
  aiGenerated:true,modelDecision,confidence,aiAssessment:aiRecord,safetyOverride:blocks>0?'PLAYER_REPORTED_BLOCKER':
   (reviews>=4&&modelDecision==='PROCEED'?'FOUR_OR_MORE_UNRESOLVED_ANSWERS':null),
  provenance:'SERVER_AI_EVALUATION_PLUS_USER_ENTERED_CHECKLIST'};
 ledger.push(row);ctx.stateTransaction.set('resource.cognitiveDecisionLedger',ledger.slice(-historyLimit));
 emit('OMEGA_RESOURCE_COGNITIVE_DECISION_RECORDED',ctx.countryId,row);return{accepted:true,decision:row,persisted:true};
}
function evaluateCognitiveGate(countryId,payload={}){install();return dispatch('resource','OMEGA_RESOURCE_COGNITIVE_GATE_EVALUATE',countryId,payload);}
function powerProjectCreate(ctx,payload){
 const cfg=rules()?.power,p=payload||{},type=String(p.projectType||p.type||'NUCLEAR_BASELOAD').trim().toUpperCase(),rule=cfg?.projectTypes?.[type];
 if(!cfg?.enabled||!rule)return{accepted:false,reason:'POWER_PROJECT_TYPE_UNSUPPORTED'};
 const c=country(ctx.countryId),limit=configuredLimit('power','maxProjectsPerCountry');if(limit===null)return{accepted:false,reason:'POWER_RULES_UNAVAILABLE'};
 const projectId=String(p.projectId||'POWER:'+c+':'+type+':T'+turn()+':'+Date.now()).trim(),old=ctx.stateTransaction.get('resource.powerProjects');
 const projects=Array.isArray(old)?clone(old):[],existing=projects.find(x=>String(x?.projectId||'')===projectId);
 if(existing)return String(existing.projectType)===type?{accepted:true,duplicate:true,project:existing}:{accepted:false,reason:'POWER_PROJECT_ID_CONFLICT'};
 const gate=requireCognitiveApproval(ctx,'POWER_PROJECT',num(rule.constructionCostTreasuryUnits),type);if(!gate.accepted)return gate;
 if(projects.filter(x=>!['CANCELLED','FAILED'].includes(String(x.status||''))).length>=limit)return{accepted:false,reason:'POWER_PROJECT_LIMIT_REACHED'};
 const cost=num(rule.constructionCostTreasuryUnits),capacity=num(rule.capacityMw),buildTurns=num(rule.constructionTurns);
 if(cost===null||cost<0||capacity===null||capacity<=0||buildTurns===null||buildTurns<1||!Number.isInteger(buildTurns))return{accepted:false,reason:'POWER_PROJECT_RULES_INVALID'};
 const debit=dispatch('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{amount:cost,reason:'RESOURCE_POWER_PROJECT_CONSTRUCTION',referenceId:projectId,transactionId:'POWER-COST:'+projectId});
 if(debit?.status!=='APPLIED'&&debit?.accepted!==true)return{accepted:false,reason:'POWER_PROJECT_TREASURY_DEBIT_FAILED',detail:debit,cost};
 const project={projectId,projectType:type,countryId:c,status:'UNDER_CONSTRUCTION',startedTurn:turn(),lastProgressTurn:turn(),
  progressTurns:0,requiredTurns:buildTurns,progressPct:0,costUsd:cost,capacityMw:capacity,costTreasuryUnits:cost,constructionCurrency:String(rule.constructionCurrency||'TREASURY_NATIVE_UNITS'),treasuryCurrencyCode:ctx.stateTransaction.get('finance.currencyCode')||ctx.stateTransaction.get('trade.settlementCurrency')||ctx.stateTransaction.get('economy.currencyCode')||null,
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',provenance:rule.authority||'SIMULATED_GAMEPLAY_RULESET'};
 projects.push(project);ctx.stateTransaction.set('resource.powerProjects',projects.slice(-limit));
 emit('OMEGA_RESOURCE_POWER_PROJECT_STARTED',c,project);return{accepted:true,project};
}
function powerTick(ctx){
 const cfg=rules()?.power;if(!cfg?.enabled)return{accepted:false,reason:'POWER_RULES_UNAVAILABLE'};
 const c=country(ctx.countryId),ruleSet=cfg.projectTypes||{},limit=configuredLimit('power','maxProjectsPerCountry');
 if(limit===null)return{accepted:false,reason:'POWER_RULES_UNAVAILABLE'};
 const p0=ctx.stateTransaction.get('resource.powerProjects'),projects=Array.isArray(p0)?clone(p0):[];
 const a0=ctx.stateTransaction.get('resource.powerAssets'),assets=Array.isArray(a0)?clone(a0):[];
 const created=[];
 for(const project of projects){
  if(project.status!=='UNDER_CONSTRUCTION'||Number(project.lastProgressTurn)===turn())continue;
  project.progressTurns=Math.min(Number(project.requiredTurns)||1,(Number(project.progressTurns)||0)+1);
  project.progressPct=project.progressTurns/Math.max(1,Number(project.requiredTurns)||1);project.lastProgressTurn=turn();project.updatedTurn=turn();
  if(project.progressTurns+1e-9<(Number(project.requiredTurns)||1))continue;
  project.status='COMMISSIONED';project.completedTurn=turn();
  const rule=ruleSet[project.projectType]||{};
  const assetId='POWER-ASSET:'+project.projectId;
  let asset=assets.find(x=>String(x.assetId||'')===assetId);
  if(!asset){
   asset={assetId,projectId:project.projectId,countryId:c,projectType:project.projectType,status:'IDLE_FUEL_SHORTAGE',
    capacityMw:num(rule.capacityMw)||num(project.capacityMw)||0,capacityFactor:num(rule.capacityFactor)||1,
    fuelResourceId:String(rule.fuelResourceId||''),fuelQuantityPerTurn:num(rule.fuelQuantityPerTurn)||0,
    emissionsTonnesCo2ePerMwh:num(rule.emissionsTonnesCo2ePerMwh),commissionedTurn:turn(),
    authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',provenance:rule.authority||'SIMULATED_GAMEPLAY_RULESET'};
   assets.push(asset);created.push(assetId);
  }
  emit('OMEGA_RESOURCE_POWER_ASSET_COMMISSIONED',c,asset);
 }
 let rawInv=ctx.stateTransaction.get('resource.inventory'),inventory=rawInv&&typeof rawInv==='object'?clone(rawInv):{};
 let generatedMwh=0,installedCapacityMw=0;
 const ledger0=ctx.stateTransaction.get('resource.powerGenerationLedger'),generationLedger=Array.isArray(ledger0)?clone(ledger0):[];
 for(const asset of assets){
  installedCapacityMw+=Math.max(0,num(asset.capacityMw)||0);
  if(['CANCELLED','FAILED'].includes(String(asset.status||''))||Number(asset.lastGeneratedTurn)===turn())continue;
  const fuelId=String(asset.fuelResourceId||''),fuelNeed=Math.max(0,num(asset.fuelQuantityPerTurn)||0),fuelAvailable=fuelId?Math.max(0,num(inventory[fuelId])||0):0;
  const generation=Math.max(0,num(asset.capacityMw)||0)*24*Math.max(0,Math.min(1,num(asset.capacityFactor)||1));
  const emission=generation*Math.max(0,num(asset.emissionsTonnesCo2ePerMwh)||0);
  if(!fuelId||fuelNeed<=0||fuelAvailable+1e-9<fuelNeed){
   asset.status='IDLE_FUEL_SHORTAGE';asset.generationMwh=0;asset.lastAttemptTurn=turn();asset.lastBlockedReason='POWER_FUEL_STOCK_UNAVAILABLE';
   generationLedger.push({transactionId:'POWER-GEN:'+asset.assetId+':T'+turn(),assetId:asset.assetId,countryId:c,turn:turn(),status:'BLOCKED',reason:asset.lastBlockedReason,generationMwh:0});
   continue;
  }
  const carbon=recordCarbonEmissionTx(ctx,{transactionId:'POWER-CO2:'+asset.assetId+':T'+turn(),quantity:emission,unit:'TONNES_CO2E',
   source:'POWER_GENERATION',sourceId:asset.assetId,provenance:asset.provenance});
  if(!carbon.accepted||carbon.blocked===true){
   asset.status=carbon.reason==='CARBON_QUOTA_EXCEEDED'?'IDLE_CARBON_QUOTA':'BLOCKED_CARBON_ACCOUNTING';
   asset.generationMwh=0;asset.lastAttemptTurn=turn();asset.lastBlockedReason=carbon.reason;
   generationLedger.push({transactionId:'POWER-GEN:'+asset.assetId+':T'+turn(),assetId:asset.assetId,countryId:c,turn:turn(),status:'BLOCKED',reason:carbon.reason,generationMwh:0});
   continue;
  }
  inventory[fuelId]=Math.max(0,fuelAvailable-fuelNeed);
  asset.status='OPERATIONAL';asset.generationMwh=generation;asset.emissionsTonnesCo2e=emission;asset.lastGeneratedTurn=turn();
  asset.lastBlockedReason=null;asset.lastFuelUse={resourceId:fuelId,quantity:fuelNeed,turn:turn()};
  generatedMwh+=generation;
  generationLedger.push({transactionId:'POWER-GEN:'+asset.assetId+':T'+turn(),assetId:asset.assetId,countryId:c,turn:turn(),status:'GENERATED',
   capacityMw:asset.capacityMw,generationMwh:generation,emissionsTonnesCo2e:emission,fuelResourceId:fuelId,fuelQuantity:fuelNeed});
  emit('OMEGA_RESOURCE_POWER_GENERATED',c,{assetId:asset.assetId,turn:turn(),generationMwh:generation,emissionsTonnesCo2e:emission});
 }
 const ledgerLimit=configuredLimit('carbon','maxEmissionLedgerRows')||4096;
 ctx.stateTransaction.set('resource.powerProjects',projects.slice(-limit));ctx.stateTransaction.set('resource.powerAssets',assets.slice(-limit));
 ctx.stateTransaction.set('resource.inventory',inventory);ctx.stateTransaction.set('resource.powerGenerationLedger',generationLedger.slice(-ledgerLimit));
 const powerState={turn:turn(),unit:'MWH_PER_TURN',installedCapacityMw,generatedMwh,assets:assets.map(x=>({assetId:x.assetId,status:x.status,capacityMw:x.capacityMw,generationMwh:x.generationMwh||0,lastBlockedReason:x.lastBlockedReason||null})),
  authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME',provenance:'POWER_GENERATION_DERIVED_FROM_RULESET_AND_OBSERVED_INVENTORY'};
 ctx.stateTransaction.set('resource.powerGeneration',powerState);
 return{accepted:true,countryId:c,turn:turn(),projectsAdvanced:projects.filter(x=>Number(x.lastProgressTurn)===turn()&&x.status==='UNDER_CONSTRUCTION').length,
  commissionedAssetIds:created,installedCapacityMw,generatedMwh,assets:powerState.assets};
}
function startPowerProject(countryId,payload={}){install();return dispatch('resource','OMEGA_RESOURCE_POWER_PROJECT_CREATE',countryId,payload);}
function processPowerCountry(countryId){install();return dispatch('resource','OMEGA_RESOURCE_POWER_PROJECT_TICK',countryId,{correlationId:'POWER-TICK:'+country(countryId)+':'+turn()});}

function handlerFor(type,fn,owner='resource'){const m=interop();if(!m?.registerCommandHandler)return false;try{m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_RESOURCE_STRATEGIC_POLICY_RUNTIME'});m.registerCommandHandler(type,owner,fn);return true;}catch(e){registrationErrors.push(type+':'+String(e?.message||e));return false;}}
function install(){
 if(handlersReady)return{ready:true,registered:registeredHandlerCount,required:registeredHandlerCount,errors:[]};
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
 ['OMEGA_RESOURCE_ENVIRONMENTAL_REMEDIATE',(cmd,ctx)=>remediate(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_CARBON_QUOTA_SET',(cmd,ctx)=>setCarbonQuotaTx(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_CARBON_EMISSION_RECORD',(cmd,ctx)=>recordCarbonEmissionTx(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_COGNITIVE_GATE_EVALUATE',(cmd,ctx)=>evaluateCognitiveGateTx(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_SWF_CAPITALIZE',(cmd,ctx)=>capitalizeSwfTx(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_POWER_PROJECT_CREATE',(cmd,ctx)=>powerProjectCreate(ctx,cmd?.payload||{})],
 ['OMEGA_RESOURCE_POWER_PROJECT_TICK',(cmd,ctx)=>powerTick(ctx,cmd?.payload||{})]
 ];
 let n=0;for(const [t,f,owner='resource'] of defs)if(handlerFor(t,f,owner))n++;registeredHandlerCount=n;handlersReady=n===defs.length;return{ready:handlersReady,registered:n,required:defs.length,errors:registrationErrors.slice()};
}
function countryIds(){
 const out=new Set(Object.keys(state()?.resource||{}).map(country).filter(Boolean));
 try{const b=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;for(const x of b?.list?.('COUNTRY')||b?.list?.()||[]){const r=typeof x==='object'?(x.iso3||x.countryId||x.id||x.code):x;if(r)out.add(country(r));}}catch(_){}
 return [...out].filter(Boolean).sort();
}
function processCountry(c){install();const cc=country(c);if(!cc)return{status:'SKIPPED',reason:'COUNTRY_REQUIRED'};return dispatch('resource','OMEGA_RESOURCE_EXPLORATION_TICK',cc,{correlationId:'EXPLORATION-TICK:'+cc+':'+turn()});}
function processAll(){return countryIds().map(processCountry);}
function setCarbonQuota(c,p={}){return carbonQuotaSet(c,p);}
function recordEmission(c,p={}){return recordCarbonEmission(c,p);}
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
  carbonEmissionLedgerRows:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.carbonEmissionsLedger)?r.carbonEmissionsLedger.length:0),0),
  activeCarbonQuotas:Object.values(resource).filter(r=>String(r?.carbonQuota?.status||'').toUpperCase()==='ACTIVE').length,
  powerProjectCount:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.powerProjects)?r.powerProjects.length:0),0),
  powerAssetCount:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.powerAssets)?r.powerAssets.length:0),0),
  cognitiveDecisionRows:Object.values(resource).reduce((n,r)=>n+(Array.isArray(r?.cognitiveDecisionLedger)?r.cognitiveDecisionLedger.length:0),0),
  sovereignWealthFundCount:Object.values(resource).filter(r=>!!r?.sovereignWealthFund).length,
  marketLedgerCountries:Object.keys(trade).length};
}
const API=Object.freeze({VERSION,loadRules,install,diagnostics,isResourceEmbargoed,isRouteBlocked,siteAvailableForExtraction,extractionMultiplier,recordExtractionImpactTx,recordProcessingImpactTx,declareEmbargo,liftEmbargo,declareBlockade,liftBlockade,startExploration,processCountry,processAll,approveInvestment,commissionSite,remediateSite,setCarbonQuota,recordCarbonEmission,previewCarbonActivity,evaluateCognitiveGate,startPowerProject,processPowerCountry,capitalizeSovereignWealthFund});
g.Omega=g.Omega||{};g.Omega.ResourceStrategicPolicyRuntime=API;g.OmegaResourceStrategicPolicyRuntime=API;
// Load the rules immediately; OMEGA_READY may already have fired before this script loads.
loadRules().then(()=>install()).catch(()=>{});
install();
if(typeof g.addEventListener==='function'){
 g.addEventListener('OMEGA_READY',()=>{loadRules().then(()=>install()).catch(()=>{});});
 g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{loadRules().then(()=>install()).catch(()=>{});});
 g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',()=>{try{processAll();for(const c of countryIds())processPowerCountry(c);}catch(_){}});
 const processingImpactListener=e=>{
  const d=e?.detail||{},p=d.payload||d,cc=country(p.countryId||d.countryId);
  const tx=String(p.transactionId||p.processId||'');if(!cc||!tx)return;
  const outputs=p.outputs||p.outputQuantities||{},inputs=p.inputs||p.inputQuantities||{};
  const quantity=Object.values(inputs).reduce((s,v)=>s+Math.max(0,num(v?.quantity??v)||0),0)||Object.values(outputs).reduce((s,v)=>s+Math.max(0,num(v?.quantity??v)||0),0);
  if(quantity<=0)return;
  const root=state()?.resource?.[cc]||{},sourceIds=Array.isArray(p.sourceBatchIds)?p.sourceBatchIds.map(String):[],batches=Array.isArray(root.batches)?root.batches:[];
  const sourceBatch=batches.find(x=>sourceIds.includes(String(x?.batchId||'')))||batches.find(x=>String(x?.batchId||'')===String(p.batchId||''))||null;
  const siteId=p.siteId||p.sourceSiteId||p.siteReferenceKey||p.sourceOccurrenceKey||sourceBatch?.siteReferenceKey||sourceBatch?.siteId||sourceBatch?.occurrenceKey||null;
  dispatch('resource','OMEGA_RESOURCE_ENVIRONMENT_RECORD_PROCESSING',cc,{transactionId:tx,siteId,resourceId:p.resourceId||sourceBatch?.resourceId||Object.keys(inputs)[0]||Object.keys(outputs)[0]||null,quantity,unit:p.unit||sourceBatch?.unit||'TONNES'});
 };
 g.addEventListener('OMEGA_RESOURCE_PROCESSING_COMPLETED',processingImpactListener);
 g.addEventListener('OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',processingImpactListener);
}
void loadRules();install();
})(typeof window!=='undefined'?window:globalThis);
