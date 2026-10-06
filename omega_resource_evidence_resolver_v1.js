/* OMEGA RESOURCE EVIDENCE RESOLVER V1
 * Field-level temporal evidence resolution.
 * Source quality, confidence, publication/access date, effective date and supersession
 * are considered independently from gameplay simulation authority.
 */
(function(g){
'use strict';
const VERSION='1.0.0';
const SOURCE_RANK=Object.freeze({
  GOVERNMENT_REGULATOR:100,
  GEOLOGICAL_SURVEY:99,
  TECHNICAL_REPORT:98,
  OPERATOR_PRIMARY:96,
  STOCK_EXCHANGE_FILING:94,
  NI_43_101_REPORT:94,
  JORC_REPORT:94,
  PRMS_REPORT:94,
  OPERATOR:90,
  CORPORATE:85,
  USGS:84,
  IEA:84,
  EIA:84,
  OPEC:82,
  NATIONAL_STATISTICS:82,
  ACADEMIC_PAPER:75,
  REPUTABLE_INDUSTRY_PUBLICATION:72,
  SECONDARY_DATABASE:55,
  NEWS:50,
  ENGINEERING_ESTIMATE:40,
  LEGACY_CANONICAL:35,
  SIMULATED:10,
  UNOBSERVED:0
});
const STATUS_EXECUTABLE=new Set(['ACTIVE_PRODUCING','ACTIVE','OPERATING','RUNNING','PRODUCING','RESTARTING','LIMITED_RAMP_UP','LIMITED','ARTISANAL_AND_LIMITED']);
const STATUS_BLOCKED=new Set(['SUSPENDED','HISTORICAL_INACTIVE','CLOSED','ABANDONED','CARE_AND_MAINTENANCE','CESSATION_OF_PRODUCTION','NO_CURRENT_CONCESSION','PRESERVATION_AND_SAFE_MANAGEMENT','DISPUTED_OPERATION','RESOURCE_IDENTITY_UNVERIFIED','NOT_APPLICABLE']);
const clone=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]));
const year=v=>{if(v===null||v===undefined||v==='')return null;const m=String(v).match(/(?:^|[-/])((?:19|20)\\d{2})(?:[-/]|$)/);if(m)return Number(m[1]);const n=Number(v);return Number.isFinite(n)&&n>1800&&n<2500?n:null;};
const sourceRank=v=>SOURCE_RANK[String(v||'').trim().toUpperCase()]??20;
const confidence=v=>{const x=String(v??'').trim().toUpperCase();if(x==='HIGH'||x==='0.9'||x==='0.95'||x==='1')return 1;if(x==='MEDIUM'||x==='MODERATE'||x==='0.7')return .7;if(x==='LOW'||x==='0.4')return .4;const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):.6;};
const evidenceDate=e=>year(e?.effectiveDate??e?.effectiveFrom??e?.observedAsOf??e?.published??e?.publicationDate??e?.accessed);
function bestEvidence(row){
  const arr=Array.isArray(row?.evidence)?row.evidence:[];
  if(!arr.length)return null;
  return [...arr].sort((a,b)=>{
    const sr=sourceRank(b?.sourceType)-sourceRank(a?.sourceType);
    if(sr)return sr;
    const cb=confidence(b?.confidence)-confidence(a?.confidence);
    if(cb)return cb;
    return (evidenceDate(b)||0)-(evidenceDate(a)||0);
  })[0]||null;
}
function applicable(meta,simYear){
  const y=Number(simYear);
  if(!Number.isFinite(y))return true;
  const from=year(meta?.effectiveFrom??meta?.effectiveDate??meta?.observedAsOf);
  const to=year(meta?.effectiveTo??meta?.supersededOn);
  if(from!==null&&y<from)return false;
  if(to!==null&&y>to)return false;
  return true;
}
function baselineMeta(site,field){
  const authority=site?.[field+'Authority']||site?.[field+'EvidenceAuthority']||site?.[field+'EvidenceStatus'];
  const observedYear=year(site?.[field+'ObservedAsOf']??site?.[field+'EffectiveDate']??site?.operation?.[field+'EffectiveDate']??site?.quantitative?.[field]?.year);
  return{sourceType:authority&&/REVALIDATED|WEB/i.test(String(authority))?'LEGACY_CANONICAL':'LEGACY_CANONICAL',confidence:authority&&/REVALIDATED/i.test(String(authority))?.8:.55,effectiveFrom:observedYear??0,observedAsOf:observedYear??0};
}
function compare(existingMeta,incomingMeta){
  const sr=sourceRank(incomingMeta?.sourceType)-sourceRank(existingMeta?.sourceType);
  if(sr)return sr;
  const c=confidence(incomingMeta?.confidence)-confidence(existingMeta?.confidence);
  if(c)return c;
  const ef=(year(incomingMeta?.effectiveFrom)||0)-(year(existingMeta?.effectiveFrom)||0);
  if(ef)return ef;
  return (year(incomingMeta?.published)||year(incomingMeta?.observedAsOf)||year(incomingMeta?.accessed)||0)-
         (year(existingMeta?.published)||year(existingMeta?.observedAsOf)||year(existingMeta?.accessed)||0);
}
function field(site,row,fieldName,value,simYear){
  if(value===undefined||value===null||value==='')return{applied:false,value:site?.[fieldName]};
  const ev=bestEvidence(row);
  const incoming={sourceType:ev?.sourceType||'WEB_RESEARCHED',confidence:ev?.confidence??row?.confidence??.75,
    published:ev?.published||ev?.publicationDate||null,accessed:ev?.accessed||null,
    observedAsOf:row?.[fieldName+'ObservedAsOf']||row?.observedAsOf||ev?.observedAsOf||null,
    effectiveFrom:row?.[fieldName+'EffectiveFrom']||row?.effectiveFrom||ev?.effectiveFrom||ev?.effectiveDate||ev?.observedAsOf||ev?.accessed||null,
    effectiveTo:row?.[fieldName+'EffectiveTo']||row?.effectiveTo||ev?.effectiveTo||null,
    supersedes:row?.supersedes||ev?.supersedes||null};
  if(!applicable(incoming,simYear))return{applied:false,value:site?.[fieldName],reason:'EVIDENCE_NOT_YET_EFFECTIVE'};
  const existing=baselineMeta(site,fieldName);
  const superseded=Array.isArray(incoming.supersedes)&&incoming.supersedes.some(x=>String(x)===String(site?.[fieldName]));
  const replace=superseded||compare(existing,incoming)>0||site?.[fieldName]===undefined||site?.[fieldName]===null||site?.[fieldName]===''||site?.[fieldName]==='UNOBSERVED';
  return{applied:replace,value:replace?clone(value):site?.[fieldName],reason:replace?'APPLICABLE_EVIDENCE_WINS':'EXISTING_FIELD_WINS',
    incomingMeta:incoming,existingMeta:existing};
}
function apply(site,row,simYear){
  const s=clone(site||{}),facts=clone(row?.facts||{}),decisions={};
  for(const fieldName of ['owner','operator','status','extractionMethod']){
    const d=field(s,row,fieldName,facts?.[fieldName],simYear);decisions[fieldName]=d;
    if(d.applied)s[fieldName]=clone(d.value);
  }
  if(facts.status){
    const d=decisions.status;
    if(d.applied){
      s.operation={...(s.operation||{})};
      s.operation.status=clone(facts.status);
      s.operation.operationalStatus=clone(facts.status);
      const st=String(facts.status).toUpperCase();
      if(STATUS_EXECUTABLE.has(st)){s.operation.extractionEligibility='EXECUTABLE';s.operation.extractionEligibilityDerivedFrom='CURRENT_RESEARCH_STATUS';}
      else if(STATUS_BLOCKED.has(st)){s.operation.extractionEligibility='NON_EXECUTABLE';s.operation.extractionEligibilityDerivedFrom='CURRENT_RESEARCH_STATUS';}
    }
  }
  s.evidenceResolution={
    version:VERSION,simulationYear:Number.isFinite(Number(simYear))?Number(simYear):null,
    datasetId:row?.siteId||null,fieldDecisions:decisions,
    winningEvidence:bestEvidence(row)?clone(bestEvidence(row)):null,
    resolutionMode:'FIELD_LEVEL_TEMPORAL_PRECEDENCE',
    rule:'SOURCE_QUALITY -> CONFIDENCE -> EFFECTIVE_DATE -> PUBLICATION/ACCESS_DATE'
  };
  s.evidenceRevision={siteId:row?.siteId||null,effectiveForSimulationYear:Object.fromEntries(Object.entries(decisions).map(([k,v])=>[k,!!v.applied]))};
  return s;
}
function gate(site,simYear){
  const s=site||{},op=s.operation||{},status=String(op.operationalStatus||op.status||s.operationalStatus||s.status||'UNKNOWN').toUpperCase();
  const eligibility=String(op.extractionEligibility||s.extractionEligibility||'UNKNOWN').toUpperCase();
  const start=year(op.effectiveFrom??op.startYear??op.operatingStartYear??s.effectiveFrom??s.startYear);
  const end=year(op.effectiveTo??op.endYear??op.operatingEndYear??s.effectiveTo??s.endYear);
  const y=Number(simYear);
  if(Number.isFinite(y)&&start!==null&&y<start)return{executable:false,reason:'CHRONOLOGY_NOT_STARTED',status,eligibility};
  if(Number.isFinite(y)&&end!==null&&y>end)return{executable:false,reason:'CHRONOLOGY_ENDED',status,eligibility};
  if(eligibility==='NON_EXECUTABLE')return{executable:false,reason:'EXTRACTION_ELIGIBILITY_NON_EXECUTABLE',status,eligibility};
  if(status==='UNKNOWN'&&eligibility!=='EXECUTABLE')return{executable:false,reason:'OPERATIONAL_STATUS_UNVERIFIED',status,eligibility};
  if(STATUS_BLOCKED.has(status))return{executable:false,reason:'OPERATIONAL_STATUS_BLOCKED',status,eligibility};
  if(eligibility==='CONDITIONAL'&&!Boolean(op.conditionSatisfied??s.conditionSatisfied)){
    if(!new Set(['RESTARTING','LIMITED_RAMP_UP','LIMITED','ARTISANAL_AND_LIMITED']).has(status))
      return{executable:false,reason:'CONDITIONAL_EXECUTION_GATE_NOT_SATISFIED',status,eligibility};
  }
  if(['RESOURCE_IDENTITY_UNVERIFIED','DISPUTED_OPERATION','NOT_APPLICABLE'].includes(status))
    return{executable:false,reason:'SITE_IDENTITY_OR_LEGAL_GATE_BLOCKED',status,eligibility};
  return{executable:true,reason:'OPERATIONAL_GATE_PASSED',status,eligibility};
}
const API=Object.freeze({VERSION,SOURCE_RANK,sourceRank,bestEvidence,applicable,field,apply,gate});
g.Omega=g.Omega||{};g.Omega.ResourceEvidenceResolver=API;g.OmegaResourceEvidenceResolver=API;
})(typeof window!=='undefined'?window:globalThis);
