/* OMEGA STRATEGIC RESOURCE ECONOMY RUNTIME v1.0.0
 * Milestone C integration: environmental externalities, production constraints,
 * treasury remediation liability, versioned save/load, and live subsystem diagnostics.
 * Quantitative environmental coefficients are loaded only from the declared JSON ruleset.
 */
(function(g){
'use strict';
const VERSION='1.0.0',RULES_URL='resource_environmental_rules_v1.json',SAVE_SCHEMA='OMEGA_RESOURCE_SAVE_V1';
const clone=(v,seen)=>{
  if(v===null||typeof v!=='object')return v;
  seen=seen||new WeakMap();if(seen.has(v))return seen.get(v);
  if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
  const o={};seen.set(v,o);
  for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],seen);
  return o;
};
const num=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const id=v=>String(v??'').trim().toUpperCase();
const tok=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
const state=()=>g.Game?.state||g.gameState||null;
const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn)??0;
const rulesFromGlobals=()=>g.OmegaResourceEnvironmentalRulesData||g.Omega?.ResourceEnvironmentalRulesData||null;
let loadedRules=rulesFromGlobals(),rulesPromise=null,rulesError=null;
const pendingImpacts=[];
function countries(){
  const s=state()||{},out=new Set();
  for(const domain of ['resource','economy','trade','finance','transport','foreign','environment']){
    const bucket=s[domain];if(bucket&&typeof bucket==='object')for(const key of Object.keys(bucket)){const c=id(key);if(/^[A-Z]{3}$/.test(c))out.add(c);}
  }
  try{
    const r=g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity;
    const rows=r?.list?.('COUNTRY')||r?.list?.()||[];
    for(const row of rows){const c=id(row&&typeof row==='object'?(row.iso3||row.iso3Code||row.countryCode||row.id||row.canonicalId||row.code):row);if(/^[A-Z]{3}$/.test(c))out.add(c);}
  }catch(_){}
  return [...out].sort();
}
function countryBucket(domain,c,create=false){
  const s=state();if(!s)return null;
  if(!s[domain]&&create)s[domain]={};
  const root=s[domain];if(!root||typeof root!=='object')return null;
  const cid=id(c);
  let key=Object.prototype.hasOwnProperty.call(root,cid)?cid:Object.keys(root).find(k=>id(k)===cid);
  if(key===undefined&&create){key=cid;root[key]={};}
  if(key===undefined)return null;
  if(create&&(!root[key]||typeof root[key]!=='object'))root[key]={};
  return root[key]||null;
}
function emit(type,c,payload={}){
  const detail={countryId:id(c),payload:clone(payload),simulationTurn:turn(),source:'omega-resource-strategic-economy'};
  try{g.dispatchEvent?.(new g.CustomEvent(type,{detail:{eventType:type,...detail}}));}catch(_){}
}
async function loadRules(){
  if(loadedRules)return{status:'READY',rules:loadedRules,reused:true};
  if(rulesPromise)return rulesPromise;
  rulesPromise=(async()=>{
    try{
      if(typeof g.fetch!=='function')throw new Error('ENVIRONMENT_RULES_NOT_INJECTED_AND_FETCH_UNAVAILABLE');
      const response=await g.fetch(RULES_URL,{cache:'no-store'});
      if(!response?.ok)throw new Error('ENVIRONMENT_RULES_FETCH_FAILED');
      const data=await response.json();
      if(data?.datasetId!=='OMEGA_RESOURCE_ENVIRONMENTAL_RULES_V1'||data?.schemaVersion!=='1.0.0')throw new Error('ENVIRONMENT_RULES_CONTRACT_INVALID');
      loadedRules=data;g.OmegaResourceEnvironmentalRulesData=data;g.Omega=g.Omega||{};g.Omega.ResourceEnvironmentalRulesData=data;
      return{status:'READY',rules:data};
    }catch(e){rulesError=String(e?.message||e);return{status:'FAILED',reason:rulesError};}
    finally{rulesPromise=null;}
  })();
  return rulesPromise;
}
function unitToken(raw){
  const value=id(raw).replace(/[ -]+/g,'_');
  if(!value)return null;
  const aliases=loadedRules?.unitAliases||{};
  return id(aliases[value]||value);
}
function stableStringify(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return'['+value.map(stableStringify).join(',')+']';
  return'{'+Object.keys(value).filter(k=>k!=='__proto__'&&k!=='constructor'&&typeof value[k]!=='function'&&value[k]!==undefined).sort()
    .map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
}
function checksum(value){
  const text=typeof value==='string'?value:stableStringify(value);
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return(h>>>0).toString(16).padStart(8,'0');
}
function zeroTotals(){
  return{landDisturbanceHa:0,waterUseM3:0,ghgTCO2e:0,tailingsTonnes:0,remediationLiabilityUnits:0};
}
function addTotals(a,b){
  const out={...a};for(const k of ['landDisturbanceHa','waterUseM3','ghgTCO2e','tailingsTonnes','remediationLiabilityUnits'])out[k]=(num(out[k])||0)+(num(b[k])||0);return out;
}
function highestStatus(totals,thresholds){
  let status='NORMAL';
  for(const label of ['WATCH','HIGH','CRITICAL']){
    const row=thresholds?.[label.toLowerCase()]||{};
    const hit=Object.entries(row).some(([k,limit])=>num(limit)!==null&&(num(totals[k])||0)>=num(limit));
    if(hit)status=label;
  }
  return status;
}
function consequenceFactor(status){
  const factors=loadedRules?.consequences?.productionCapacityMultiplier||{};
  return Math.max(0.1,Math.min(1,num(factors[status])??1));
}
function ensureImpactState(c){
  const env=countryBucket('environment',c,true);
  let impact=env.resourceImpact;
  if(!impact||typeof impact!=='object'){
    impact={schemaVersion:VERSION,datasetId:loadedRules?.datasetId||null,authority:'SIMULATED_GAMEPLAY_RULES',
      cumulative:zeroTotals(),thisTurn:{turn:turn(),...zeroTotals()},siteTotals:{},processedEventIds:[],ledger:[],
      remediationPaidUnits:0,environmentalStatus:'NORMAL',productionCapacityMultiplier:1,lastUpdatedTurn:turn()};
    env.resourceImpact=impact;
  }
  if(!impact.cumulative||typeof impact.cumulative!=='object')impact.cumulative=zeroTotals();
  if(!impact.thisTurn||typeof impact.thisTurn!=='object'||Number(impact.thisTurn.turn)!==turn())impact.thisTurn={turn:turn(),...zeroTotals()};
  if(!impact.siteTotals||typeof impact.siteTotals!=='object')impact.siteTotals={};
  if(!Array.isArray(impact.processedEventIds))impact.processedEventIds=[];
  if(!Array.isArray(impact.ledger))impact.ledger=[];
  return{env,impact};
}
function impactValues(rule,quantity,stage){
  const keys=['landDisturbanceHaPerUnit','waterUseM3PerUnit','ghgTCO2ePerUnit','tailingsTonnesPerUnit'];
  const values={landDisturbanceHa:0,waterUseM3:0,ghgTCO2e:0,tailingsTonnes:0};
  for(const key of keys){
    const raw=rule?.[key],rate=num(raw);
    // A processing rule may intentionally omit a component that does not apply (e.g. land disturbance).
    if(rate===null&&(stage==='PROCESSING'&&(raw===undefined||raw===null)))continue;
    if(rate===null||rate<0)return{status:'RULE_COEFFICIENT_INVALID',values:null};
  }
  values.landDisturbanceHa=quantity*(num(rule.landDisturbanceHaPerUnit)||0);
  values.waterUseM3=quantity*(num(rule.waterUseM3PerUnit)||0);
  values.ghgTCO2e=quantity*(num(rule.ghgTCO2ePerUnit)||0);
  values.tailingsTonnes=quantity*(num(rule.tailingsTonnesPerUnit)||0);
  return{status:'MODELED',values};
}
function costOfImpact(values){
  const c=loadedRules?.consequences||{};
  return (values.landDisturbanceHa||0)*(num(c.liabilityUnitsPerLandHa)||0)+
    (values.waterUseM3||0)*(num(c.liabilityUnitsPerWaterM3)||0)+
    (values.ghgTCO2e||0)*(num(c.liabilityUnitsPerTCO2e)||0)+
    (values.tailingsTonnes||0)*(num(c.liabilityUnitsPerTailingsTonne)||0);
}
function refreshControls(c,impact){
  const status=highestStatus(impact.cumulative,loadedRules?.thresholds);
  const multiplier=consequenceFactor(status);
  impact.environmentalStatus=status;impact.productionCapacityMultiplier=multiplier;impact.lastUpdatedTurn=turn();
  const r=countryBucket('resource',c,true);
  r.environmentalControls={status,productionCapacityMultiplier:multiplier,updatedTurn:turn(),authority:'SIMULATED_GAMEPLAY_RULES',datasetId:loadedRules?.datasetId||null};
  const env=countryBucket('environment',c,true);
  env.resourceImpact=impact;
  return{status,productionCapacityMultiplier:multiplier};
}
function applyOne(c,{eventId,eventType,resourceId,quantity,unit,siteId,sourceBatchIds=[],transactionId=null,stage='EXTRACTION'}){
  const cid=id(c),rid=tok(resourceId),q=num(quantity),unitId=unitToken(unit);
  if(!cid||!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'COUNTRY_ID_INVALID'};
  if(!rid||q===null||q<=0)return{status:'BLOCKED',reason:'IMPACT_QUANTITY_INVALID'};
  const {env,impact}=ensureImpactState(cid);
  const key=String(eventId||[eventType,cid,siteId||'',rid,turn(),q,unitId||''].join(':'));
  if(impact.processedEventIds.includes(key))return{status:'DUPLICATE_IGNORED',eventId:key};
  const source=stage==='PROCESSING'?loadedRules?.processing:loadedRules?.extraction;
  const rule=source?.[rid]||null;
  let values={landDisturbanceHa:0,waterUseM3:0,ghgTCO2e:0,tailingsTonnes:0},impactStatus='UNMODELED',reason=null;
  if(!rule){reason='RESOURCE_ENVIRONMENT_RULE_NOT_FOUND';}
  else if(unitId!==unitToken(rule.unit)){impactStatus='BLOCKED';reason='RESOURCE_UNIT_DOES_NOT_MATCH_ENVIRONMENT_RULE';}
  else{
    const calc=impactValues(rule,q,stage);
    impactStatus=calc.status;values=calc.values||values;
    if(calc.status!=='MODELED')reason=calc.status;
  }
  if(impactStatus==='MODELED'){
    values.remediationLiabilityUnits=costOfImpact(values);
    impact.cumulative=addTotals(impact.cumulative,values);
    impact.thisTurn=addTotals(impact.thisTurn,values);
    if(siteId){
      const siteKey=String(siteId),prior=impact.siteTotals[siteKey]||{...zeroTotals(),siteId:siteKey};
      impact.siteTotals[siteKey]=addTotals(prior,values);impact.siteTotals[siteKey].siteId=siteKey;
      impact.siteTotals[siteKey].lastTurn=turn();
    }
    const fin=countryBucket('finance',cid,true);
    fin.environmentalRemediationLiabilityUnits=(num(fin.environmentalRemediationLiabilityUnits)||0)+values.remediationLiabilityUnits;
    fin.environmentalExternalityCostUnits=(num(fin.environmentalExternalityCostUnits)||0)+values.remediationLiabilityUnits;
  }
  const row={eventId:key,eventType,countryId:cid,siteId:siteId||null,resourceId:rid,quantity:q,unit:unitId,stage,
    transactionId:transactionId||null,sourceBatchIds:[...new Set(sourceBatchIds.map(String).filter(Boolean))],
    impacts:clone(values),status:impactStatus,reason,authority:'SIMULATED_GAMEPLAY_RULES',rulesDatasetId:loadedRules?.datasetId||null,turn:turn()};
  impact.processedEventIds.push(key);if(impact.processedEventIds.length>8192)impact.processedEventIds=impact.processedEventIds.slice(-8192);
  impact.ledger.push(row);if(impact.ledger.length>4096)impact.ledger=impact.ledger.slice(-4096);
  refreshControls(cid,impact);
  emit('OMEGA_RESOURCE_ENVIRONMENTAL_IMPACT_RECORDED',cid,row);
  return{status:impactStatus,eventId:key,impacts:clone(values),environmentalStatus:impact.environmentalStatus};
}
function payloadOf(evt){
  let x=evt?.detail||evt||{};
  for(let i=0;i<3&&x&&typeof x==='object'&&x.payload&&typeof x.payload==='object';i++)x=x.payload;
  return x||{};
}
function handleExtraction(evt){
  const p=payloadOf(evt),batch=p.batch||p.producedBatch||{};
  const c=p.countryId||evt?.detail?.countryId||batch.countryId,rid=p.resourceId||batch.resourceId;
  const q=p.quantity??p.approvedQuantity??batch.quantity,unit=p.unit||batch.unit;
  const batchId=batch.batchId||p.batchId||p.extractionId;
  const siteId=p.siteReferenceKey||p.siteId||batch.siteReferenceKey||batch.siteId||p.occurrenceKey||null;
  const promise=loadRules().then(res=>{
    if(res.status!=='READY')return{status:'UNAVAILABLE',reason:res.reason};
    return applyOne(c,{eventId:'EXTRACTION:'+String(batchId||p.extractionId||[c,rid,turn(),q].join(':')),eventType:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
      resourceId:rid,quantity:q,unit,siteId,sourceBatchIds:batchId?[String(batchId)]:[],transactionId:p.extractionId||null,stage:'EXTRACTION'});
  });
  pendingImpacts.push(promise);return promise;
}
function handleProcessing(evt){
  const p=payloadOf(evt),outputs=p.outputQuantities||p.outputs||{},roots=Array.isArray(p.sourceBatchIds)?p.sourceBatchIds:[];
  const c=p.countryId||evt?.detail?.countryId,transactionId=p.transactionId||p.processingTransactionId;
  const promise=loadRules().then(async res=>{
    if(res.status!=='READY')return{status:'UNAVAILABLE',reason:res.reason};
    const out=[];
    for(const [rid,q] of Object.entries(outputs)){
      const sourceBatchIds=roots;
      out.push(applyOne(c,{eventId:'PROCESSING:'+String(transactionId||p.transactionId||[c,turn(),rid].join(':'))+':'+rid,
        eventType:'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',resourceId:rid,quantity:q,
        unit:p.unit||'TONNES',siteId:p.siteId||null,sourceBatchIds,transactionId:transactionId||null,stage:'PROCESSING'}));
    }
    return{status:'COMPLETED',results:out};
  });
  pendingImpacts.push(promise);return promise;
}
function enforceRemediation(c){
  const cid=id(c),{env,impact}=ensureImpactState(cid);
  const due=Math.max(0,(num(impact.cumulative.remediationLiabilityUnits)||0)-(num(impact.remediationPaidUnits)||0));
  const fraction=Math.min(1,Math.max(0,num(loadedRules?.consequences?.remediationPaymentFractionPerTurn)??0));
  const desired=due*fraction,fin=countryBucket('finance',cid,false),available=num(fin?.available);
  const alreadyPaidThisTurn=Number(impact.lastRemediationTurn)===turn();
  let paid=0;
  if(!alreadyPaidThisTurn&&desired>0&&available!==null&&available>0){
    paid=Math.min(desired,available);fin.available=available-paid;
    fin.environmentalRemediationPaidUnits=(num(fin.environmentalRemediationPaidUnits)||0)+paid;
    impact.remediationPaidUnits=(num(impact.remediationPaidUnits)||0)+paid;
  }
  impact.unpaidRemediationLiabilityUnits=Math.max(0,(num(impact.cumulative.remediationLiabilityUnits)||0)-(num(impact.remediationPaidUnits)||0));
  if(!alreadyPaidThisTurn){
    const ledger=Array.isArray(fin?.environmentalLedger)?fin.environmentalLedger:[];
    if(fin){
      ledger.push({receiptId:'ENV-REMEDIATION:'+cid+':T'+turn(),countryId:cid,turn:turn(),liabilityBefore:due,scheduledPayment:desired,paid,unpaidAfter:impact.unpaidRemediationLiabilityUnits,
        currency:fin.currencyCode||countryBucket('economy',cid,false)?.currency_code||'SIMULATION_CURRENCY',authority:'SIMULATED_GAMEPLAY_RULES',status:paid>=desired-1e-9?'PAID':'PARTIALLY_PAID_OR_UNFUNDED'});
      fin.environmentalLedger=ledger.slice(-2048);
    }
    impact.lastRemediationTurn=turn();
  }
  refreshControls(cid,impact);
  env.resourceImpact=impact;
  return{countryId:cid,turn:turn(),liability:impact.unpaidRemediationLiabilityUnits,paid,status:impact.environmentalStatus};
}
function processTurn(){
  const cs=countries(),results=[];
  for(const c of cs)results.push(enforceRemediation(c));
  return{status:'COMPLETED',turn:turn(),countryCount:cs.length,results};
}
async function flushPending(){
  const rows=pendingImpacts.splice(0,pendingImpacts.length);
  return Promise.all(rows);
}
function getExtractionMultiplier(countryId){
  const row=countryBucket('environment',countryId,false)?.resourceImpact||{};
  return Math.max(0.1,Math.min(1,num(row.productionCapacityMultiplier??countryBucket('resource',countryId,false)?.environmentalControls?.productionCapacityMultiplier)??1));
}
function getProcessingMultiplier(countryId){return getExtractionMultiplier(countryId);}
function auditState(root=state()){
  const issues=[];
  if(!root||typeof root!=='object'||Array.isArray(root))return{status:'INVALID',issues:[{type:'STATE_ROOT_INVALID'}]};
  for(const [countryId,row] of Object.entries(root.resource||{})){
    const batches=Array.isArray(row?.batches)?row.batches:[],seen=new Set();
    for(const b of batches){
      const bid=String(b?.batchId||'').trim();
      if(bid&&seen.has(bid))issues.push({type:'DUPLICATE_BATCH_ID',countryId,batchId:bid});
      if(bid)seen.add(bid);
      for(const field of ['countryId','sourceCountryId','originCountryId','ownerCountryCode']){
        const owner=id(b?.[field]);if(owner&&/^[A-Z]{3}$/.test(owner)&&owner!==id(countryId))issues.push({type:'CROSS_COUNTRY_BATCH_OWNER',countryId,batchId:bid,field,ownerCountryId:owner});
      }
      const q=num(b?.remainingQuantity??b?.quantity);if(q!==null&&q< -1e-9)issues.push({type:'NEGATIVE_BATCH_QUANTITY',countryId,batchId:bid,quantity:q});
    }
    for(const [rid,q0] of Object.entries(row?.inventory||{})){const q=num(q0);if(q===null||q< -1e-9)issues.push({type:'INVALID_INVENTORY_QUANTITY',countryId,resourceId:rid,quantity:q0});}
    for(const [bid,lot] of Object.entries(row?.inventoryLots||{})){
      const q=num(lot?.remainingQuantity??lot?.quantity);if(q!==null&&q< -1e-9)issues.push({type:'NEGATIVE_INVENTORY_LOT',countryId,batchId:bid,quantity:q});
    }
  }
  return{status:issues.length?'DEGRADED':'HEALTHY',issues:issues.slice(0,256),issueCount:issues.length};
}
function createSaveEnvelope(){
  const root=state();if(!root||typeof root!=='object')return{status:'BLOCKED',reason:'GAME_STATE_UNAVAILABLE'};
  const copied=clone(root),metadata={schema: SAVE_SCHEMA,runtimeVersion:VERSION,turn:turn(),countryCount:countries().length,
    resourceBatchCount:Object.values(copied.resource||{}).reduce((sum,x)=>sum+(Array.isArray(x?.batches)?x.batches.length:0),0),
    siteRegistryCount:Array.isArray((g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData)?.sites)?(g.OmegaResourceSiteCanonicalCatalogData||g.Omega?.ResourceSiteCanonicalCatalogData).sites.length:null,
    integrity:auditState(copied),capturedAt:new Date().toISOString()};
  const body={schema:SAVE_SCHEMA,schemaVersion:1,metadata,state:copied};
  return{status:'READY',envelope:{...body,checksum:checksum(body)}};
}
function validateSave(envelope){
  if(!envelope||typeof envelope!=='object'||envelope.schema!==SAVE_SCHEMA||envelope.schemaVersion!==1||
    !envelope.state||typeof envelope.state!=='object'||Array.isArray(envelope.state))return{status:'INVALID',reason:'SAVE_ENVELOPE_CONTRACT_INVALID'};
  const body={schema:envelope.schema,schemaVersion:envelope.schemaVersion,metadata:envelope.metadata||{},state:envelope.state};
  if(String(envelope.checksum||'')!==checksum(body))return{status:'INVALID',reason:'SAVE_CHECKSUM_MISMATCH'};
  if(!envelope.state.simulation||typeof envelope.state.simulation!=='object')return{status:'INVALID',reason:'SAVE_SIMULATION_STATE_MISSING'};
  return{status:'VALID',checksum:envelope.checksum,integrity:auditState(envelope.state)};
}
function restoreSave(envelope){
  const valid=validateSave(envelope);if(valid.status!=='VALID')return{status:'REJECTED',reason:valid.reason,integrity:valid.integrity||null};
  const current=state();if(!current||typeof current!=='object')return{status:'BLOCKED',reason:'GAME_STATE_UNAVAILABLE'};
  try{
    const next=clone(envelope.state);
    for(const key of Object.keys(current))if(key!=='__proto__'&&key!=='constructor')delete current[key];
    for(const [key,value] of Object.entries(next))if(key!=='__proto__'&&key!=='constructor')current[key]=value;
    g.__omegaResourceExtractionTurn=null;g.__omegaResourceExtractionPromise=null;g.__omegaResourceExtractionPromiseTurn=null;
    try{g.Omega?.ResourceEndowmentRuntime?.restorePersistedReserveStates?.();}catch(_){}
    try{g.OmegaGlobalMarket?.rebuild?.();}catch(_){}
    try{g.Omega?.GlobalMarket?.rebuild?.();}catch(_){}
    emit('OMEGA_GAME_STATE_RESTORED','GLOBAL',{schema:envelope.schema,turn:turn(),checksum:envelope.checksum,integrity:valid.integrity});
    return{status:'RESTORED',turn:turn(),checksum:envelope.checksum,integrity:valid.integrity};
  }catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
}
function storage(){
  try{return g.localStorage||null;}catch(_){return null;}
}
function slotKey(slot){
  const name=String(slot||'autosave').trim();
  if(!name||name.length>64||!/^[a-zA-Z0-9_.-]+$/.test(name))return null;
  return String(loadedRules?.persistence?.saveKeyPrefix||'omega.resource.save.v1:')+name;
}
function saveSlot(slot='autosave'){
  const store=storage(),key=slotKey(slot);if(!store)return{status:'UNAVAILABLE',reason:'LOCAL_STORAGE_UNAVAILABLE'};
  if(!key)return{status:'REJECTED',reason:'SAVE_SLOT_NAME_INVALID'};
  const result=createSaveEnvelope();if(result.status!=='READY')return result;
  const text=JSON.stringify(result.envelope),maxBytes=num(loadedRules?.persistence?.maxSaveBytes)||4500000;
  if(text.length>maxBytes)return{status:'REJECTED',reason:'SAVE_SIZE_LIMIT_EXCEEDED',sizeBytes:text.length,maxBytes};
  try{store.setItem(key,text);emit('OMEGA_GAME_SAVE_WRITTEN','GLOBAL',{slot:String(slot),turn:turn(),sizeBytes:text.length,checksum:result.envelope.checksum});return{status:'SAVED',slot:String(slot),turn:turn(),sizeBytes:text.length,checksum:result.envelope.checksum};}
  catch(e){return{status:'FAILED',reason:/quota/i.test(String(e?.message||e))?'STORAGE_QUOTA_EXCEEDED':String(e?.message||e)};}
}
function loadSlot(slot='autosave'){
  const store=storage(),key=slotKey(slot);if(!store)return{status:'UNAVAILABLE',reason:'LOCAL_STORAGE_UNAVAILABLE'};
  if(!key)return{status:'REJECTED',reason:'SAVE_SLOT_NAME_INVALID'};
  let raw;try{raw=store.getItem(key);}catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  if(!raw)return{status:'NOT_FOUND',slot:String(slot)};
  let parsed;try{parsed=JSON.parse(raw);}catch(_){return{status:'REJECTED',reason:'SAVE_JSON_INVALID'};}
  const result=restoreSave(parsed);return{...result,slot:String(slot)};
}
function listSlots(){
  const store=storage();if(!store)return{status:'UNAVAILABLE',reason:'LOCAL_STORAGE_UNAVAILABLE',slots:[]};
  const prefix=String(loadedRules?.persistence?.saveKeyPrefix||'omega.resource.save.v1:'),slots=[];
  try{for(let i=0;i<store.length;i++){const key=store.key(i);if(key&&key.startsWith(prefix))slots.push(key.slice(prefix.length));}}
  catch(e){return{status:'FAILED',reason:String(e?.message||e),slots:[]};}
  return{status:'READY',slots:slots.sort().slice(0,Math.max(1,num(loadedRules?.persistence?.maxSlots)||8))};
}
function deleteSlot(slot){
  const store=storage(),key=slotKey(slot);if(!store)return{status:'UNAVAILABLE',reason:'LOCAL_STORAGE_UNAVAILABLE'};
  if(!key)return{status:'REJECTED',reason:'SAVE_SLOT_NAME_INVALID'};
  try{store.removeItem(key);return{status:'DELETED',slot:String(slot)};}catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
}
function diagnostics(){
  const market=g.OmegaGlobalMarket||g.Omega?.GlobalMarket,trade=g.OmegaGlobalTrade||g.Omega?.GlobalTrade;
  const action=g.OmegaResourceActionExecutionRuntime||g.Omega?.ResourceActionExecutionRuntime;
  const research=g.OmegaResourceResearchRuntime||g.Omega?.ResourceResearchRuntime;
  const endowment=g.OmegaResourceEndowmentRuntime||g.Omega?.ResourceEndowmentRuntime;
  const industrial=g.OmegaResourceIndustrialNetwork||g.Omega?.ResourceIndustrialNetwork;
  const root=state(),saves=listSlots();
  return{version:VERSION,rulesStatus:loadedRules?'READY':rulesError?'FAILED':'LOADING',rulesDatasetId:loadedRules?.datasetId||null,
    market:{available:!!market,rebuild:typeof market?.rebuild==='function',quote:typeof market?.quote==='function'},
    internationalTrade:{available:!!trade,processAll:typeof trade?.processAll==='function'},
    strategicStockpile:{available:!!action,diagnostics:typeof action?.diagnostics==='function'?action.diagnostics():null},
    explorationAndTechnology:{available:!!research,diagnostics:typeof research?.diagnostics==='function'?research.diagnostics():null},
    extraction:{available:!!endowment,diagnostics:typeof endowment?.diagnostics==='function'?endowment.diagnostics():null},
    industrial:{available:!!industrial,diagnostics:typeof industrial?.gameplayPipelineDiagnostics==='function'?industrial.gameplayPipelineDiagnostics():null},
    environment:{countryCount:Object.keys(root?.environment||{}).length,modeledCountries:countries().filter(c=>!!countryBucket('environment',c,false)?.resourceImpact).length},
    persistence:{available:!!storage(),slots:saves.slots,autosaveEnabled:loadedRules?.persistence?.autosaveOnCompletedEconomyTurn===true},
    integrity:auditState(root)};
}
function onTurn(){processTurn();}
function onExtraction(evt){void handleExtraction(evt);}
function onFinishedGoods(evt){void handleProcessing(evt);}
function onEconomyUpdate(){
  if(loadedRules?.persistence?.autosaveOnCompletedEconomyTurn!==true)return;
  const t=turn();if(g.__omegaResourceStrategicEconomyAutosaveTurn===t)return;
  g.__omegaResourceStrategicEconomyAutosaveTurn=t;
  const saved=saveSlot(loadedRules?.persistence?.autosaveSlot||'autosave');
  g.__omegaResourceStrategicEconomyLastAutosave=clone(saved);
}
function onRestore(){try{g.OmegaGlobalMarket?.rebuild?.();}catch(_){}}
const API=Object.freeze({VERSION,loadRules,diagnostics,processTurn,flushPending,getExtractionMultiplier,getProcessingMultiplier,
  recordExtraction:handleExtraction,recordProcessing:handleProcessing,auditState,createSaveEnvelope,validateSave,restoreSave,
  save:saveSlot,load:loadSlot,listSlots,deleteSlot,checksum});
g.Omega=g.Omega||{};g.Omega.ResourceStrategicEconomyRuntime=API;
g.OmegaResourceStrategicEconomyRuntime=API;
void loadRules();
if(typeof g.addEventListener==='function'){
  g.addEventListener('OMEGA_RESOURCE_EXTRACTION_COMPLETED',onExtraction);
  g.addEventListener('OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE',onFinishedGoods);
  g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
  g.addEventListener('OMEGA_RESOURCE_ECONOMY_UPDATED',onEconomyUpdate);
  g.addEventListener('OMEGA_GAME_STATE_RESTORED',onRestore);
  g.addEventListener('OMEGA_READY',()=>{void loadRules();});
  g.addEventListener('OMEGA_GAME_SESSION_STARTED',()=>{void loadRules();});
}
})(typeof window!=='undefined'?window:globalThis);
