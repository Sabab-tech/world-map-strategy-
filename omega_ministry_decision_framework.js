/*
 * OMEGA MINISTRY DECISION FRAMEWORK v1.0.0
 *
 * Generic evidence-driven action evaluation.
 * Action definitions are data, not one-off procedural logic.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const k of Object.keys(value)){if(k==='__proto__'||k==='constructor')continue;const v=value[k];if(v!==undefined&&typeof v!=='function')out[k]=clone(v,seen);}
    return out;
  }

  function entityValue(value,entityId){
    if(entityId==null||value==null)return value;
    if(Array.isArray(value)){
      for(const row of value){
        if(row&&typeof row==='object'){
          const rowId=row.countryId??row.targetCountryId??row.id;
          if(rowId!=null&&String(rowId).toUpperCase()===String(entityId).toUpperCase())return row.value??row.score??row.status??row;
        }
      }
      return undefined;
    }
    if(value&&typeof value==='object'){
      if(Object.prototype.hasOwnProperty.call(value,entityId))return value[entityId];
      const key=Object.keys(value).find(k=>String(k).toUpperCase()===String(entityId).toUpperCase());
      if(key!==undefined)return value[key];
    }
    return value;
  }

  function normalizeOp(op){return String(op||'').toUpperCase();}
  function compare(actual,operator,expected){
    switch(normalizeOp(operator)){
      case 'EQ':return actual===expected;
      case 'NEQ':return actual!==expected;
      case 'GT':return Number(actual)>Number(expected);
      case 'GTE':return Number(actual)>=Number(expected);
      case 'LT':return Number(actual)<Number(expected);
      case 'LTE':return Number(actual)<=Number(expected);
      case 'IN':return Array.isArray(expected)&&expected.some(v=>v===actual);
      case 'NOT_IN':return Array.isArray(expected)&&!expected.some(v=>v===actual);
      case 'EXISTS':return actual!==undefined&&actual!==null;
      case 'TRUTHY':return !!actual;
      case 'FALSY':return !actual;
      case 'CONTAINS':return typeof actual==='string'&&actual.toLowerCase().includes(String(expected??'').toLowerCase());
      default:return null;
    }
  }

  function isUsable(status,required){
    const s=String(status||'UNOBSERVED').toUpperCase();
    if(s==='AVAILABLE')return true;
    if(s==='ESTIMATED')return !required;
    return false;
  }

  class MinistryDecisionFramework{
    constructor(options={}){
      this.version=VERSION;
      this.actions=new Map();
      if(options.actions){
        for(const [id,def] of Object.entries(options.actions))this.registerAction(id,def);
      }
    }

    registerAction(actionId,definition={}){
      const id=String(actionId||'').trim();
      if(!id)throw new Error('ACTION_ID_REQUIRED');
      const def=clone(definition);
      def.actionId=id;
      def.requirements=Array.isArray(def.requirements)?def.requirements:[];
      def.optionalRequirements=Array.isArray(def.optionalRequirements)?def.optionalRequirements:[];
      def.blockingConditions=Array.isArray(def.blockingConditions)?def.blockingConditions:[];
      def.warningConditions=Array.isArray(def.warningConditions)?def.warningConditions:[];
      def.affectedMinistries=Array.isArray(def.affectedMinistries)?def.affectedMinistries:[];
      def.affectedStateDomains=Array.isArray(def.affectedStateDomains)?def.affectedStateDomains:[];
      def.approvalRequirements=Array.isArray(def.approvalRequirements)?def.approvalRequirements:[];
      def.expectedOutputs=Array.isArray(def.expectedOutputs)?def.expectedOutputs:[];
      def.downstreamEffects=Array.isArray(def.downstreamEffects)?def.downstreamEffects:[];
      this.actions.set(id,def);
      return clone(def);
    }

    getAction(actionId){
      const def=this.actions.get(String(actionId||''));
      return def?clone(def):null;
    }

    listActions(){return [...this.actions.keys()];}

    _fact(briefing,requirement,countryId,currentTurn){
      const source=String(requirement.ministryId||requirement.sourceMinistry||'');
      const peer=briefing?.peerStates?.[source]||briefing?.peers?.[source]||null;
      if(!peer)return {requirement,availability:'UNOBSERVED',status:'MISSING',reason:'SOURCE_MINISTRY_SNAPSHOT_UNOBSERVED'};
      const fact=peer.publishedFacts?.[String(requirement.path||'')];
      if(!fact)return {requirement,availability:'UNAVAILABLE',status:'MISSING',reason:'FACT_NOT_PUBLISHED'};
      if(fact.access?.granted===false)return {
        requirement,availability:'UNAVAILABLE',status:'MISSING',accessStatus:'DENIED',
        reason:'ACCESS_RESTRICTED',fact:clone(fact)
      };
      let availability=String(fact.availability||'UNOBSERVED');
      let value=fact.value;
      if(requirement.entityScoped){
        value=entityValue(value,requirement.entityId||countryId);
        if(value===undefined)availability='UNAVAILABLE';
      }
      return {
        requirement,
        sourceMinistry:source,
        path:String(requirement.path||''),
        availability,
        status:isUsable(availability,requirement.required!==false)?'AVAILABLE':'MISSING',
        value:clone(value),
        stateRevision:fact.stateRevision??null,
        simulationTurn:fact.simulationTurn??null,
        publishedAt:fact.publishedAt??null,
        provenance:clone(fact.provenance||null),
        visibility:fact.visibility||'GOVERNMENT_INTERNAL',
        access:{granted:true},
        currentTurn
      };
    }

    _condition(condition,evidenceById){
      if(condition?.fact){
        const key=String(condition.fact);
        const e=evidenceById.get(key);
        if(!e||e.status==='MISSING')return {state:'UNKNOWN',reason:'CONDITION_FACT_MISSING'};
        const result=compare(e.value,condition.operator,condition.value);
        return result===null?{state:'UNKNOWN',reason:'UNSUPPORTED_OPERATOR'}:{state:result?'TRUE':'FALSE',evidence:e};
      }
      if(Array.isArray(condition?.all)){
        const states=condition.all.map(c=>this._condition(c,evidenceById));
        if(states.some(x=>x.state==='UNKNOWN'))return {state:'UNKNOWN'};
        return {state:states.every(x=>x.state==='TRUE')?'TRUE':'FALSE'};
      }
      if(Array.isArray(condition?.any)){
        const states=condition.any.map(c=>this._condition(c,evidenceById));
        if(states.some(x=>x.state==='TRUE'))return {state:'TRUE'};
        if(states.every(x=>x.state==='FALSE'))return {state:'FALSE'};
        return {state:'UNKNOWN'};
      }
      return {state:'UNKNOWN',reason:'EMPTY_CONDITION'};
    }

    evaluate(input={}){
      const ministryId=String(input.ministryId||'');
      const countryId=String(input.countryId||'').trim().toUpperCase();
      const actionId=String(input.actionId||'');
      const def=this.getAction(actionId);
      if(!def)return {frameworkVersion:VERSION,status:'UNKNOWN',actionId,countryId,ministryId,reason:'ACTION_DEFINITION_NOT_FOUND'};

      const requirements=[
        ...def.requirements,
        ...(Array.isArray(input.requirements)?input.requirements:[]),
        ...def.optionalRequirements.map(r=>({...r,required:false}))
      ];
      const evidence=[];
      const missing=[];
      const warnings=[];
      const evidenceById=new Map();

      let requirementIndex=0;
      for(const requirement of requirements){
        const result=this._fact(input.briefing||{},requirement,countryId,input.currentTurn??null);
        const key=String(requirement.id||requirement.path||requirement.ministryId||('requirement:'+String(requirementIndex++)));
        evidence.push({...result,requirement:clone(requirement)});
        evidenceById.set(key,result);
        if(result.status==='MISSING' && requirement.required!==false)missing.push(result);
        if(result.availability==='STALE')warnings.push({type:'STALE_DATA',requirement:clone(requirement),evidence:result});
        if(result.availability==='ESTIMATED')warnings.push({type:'ESTIMATED_DATA',requirement:clone(requirement),evidence:result});
      }

      const blockers=[];
      for(const condition of def.blockingConditions){
        const result=this._condition(condition,evidenceById);
        if(result.state==='TRUE')blockers.push({condition:clone(condition),result});
        else if(result.state==='UNKNOWN')warnings.push({type:'BLOCKING_CONDITION_UNKNOWN',condition:clone(condition),result});
      }
      for(const condition of def.warningConditions){
        const result=this._condition(condition,evidenceById);
        if(result.state==='TRUE')warnings.push({type:'WARNING_CONDITION',condition:clone(condition),result});
        else if(result.state==='UNKNOWN')warnings.push({type:'WARNING_CONDITION_UNKNOWN',condition:clone(condition),result});
      }

      let status='OBSERVED';
      if(blockers.length)status='BLOCKED';
      else if(missing.length)status='UNKNOWN';
      else if(warnings.some(w=>w.type==='STALE_DATA'||w.type==='ESTIMATED_DATA'))status='CONDITIONALLY_ASSESSABLE';

      return {
        frameworkVersion:VERSION,
        actionId,
        ministryId,
        countryId,
        status,
        requirementsEvaluated:requirements.length,
        evidence,
        missing,
        blockers,
        warnings,
        authority:clone(def.authority||null),
        approvalRequirements:clone(def.approvalRequirements),
        affectedMinistries:clone(def.affectedMinistries),
        affectedStateDomains:clone(def.affectedStateDomains),
        expectedOutputs:clone(def.expectedOutputs),
        downstreamEffects:clone(def.downstreamEffects)
      };
    }
  }

  global.Omega=global.Omega||{};
  global.Omega.MinistryDecisionFramework=Object.freeze({
    VERSION,
    create:(options={})=>new MinistryDecisionFramework(options),
    instance:new MinistryDecisionFramework()
  });
  global.OmegaMinistryDecisionFramework=global.Omega.MinistryDecisionFramework;
})(typeof window!=='undefined'?window:globalThis);
