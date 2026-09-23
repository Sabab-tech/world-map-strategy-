class Goal{constructor(tr,mem){this.tr=tr;this.mem=mem;}run(c,sc,gp){const prior=this.mem.state(c).persistentGoals||[],goals=sc.map(x=>({goalId:'GOAL-'+x.id,scenarioId:x.id,priorityClass:x.kind==='PRESSURE'?'PRESSURE':x.kind==='OPPORTUNITY'?'OPPORTUNITY':'DRIVER',persistent:true,previouslyActive:prior.includes(x.id),memoryBias:this.mem.bias(c,x.id),needs:CLONE(gp.needs),priorityFactors:x.decisionFactors})).sort((a,b)=>(a.priorityClass==='PRESSURE'?0:a.priorityClass==='DRIVER'?1:2)-(b.priorityClass==='PRESSURE'?0:b.priorityClass==='DRIVER'?1:2)||a.goalId.localeCompare(b.goalId));this.mem.state(c).persistentGoals=[...new Set(goals.map(x=>x.scenarioId))].slice(-128);this.tr.add({layer:'L09_GOAL_PRIORITY_ENGINE',countryId:c,goals:goals.map(x=>x.goalId)});return goals;}}
class Feasibility{constructor(tr){this.tr=tr;}check(c,a,ctx){const d=ACTIONS[a];if(!d)return{status:'BLOCKED',reason:'ACTION_UNREGISTERED'};const missing=[],unknown=[];for(const cap of d.caps){if(ctx.countryCapabilities?.[cap])continue;if(ctx.signals?.[cap]?.status==='AVAILABLE')continue;if(ctx.countryCapabilities?.[cap]===false)missing.push(cap);else unknown.push(cap);}const blockers=[];if(a==='IMPORT'&&ctx.signals.FOREIGN_CURRENCY?.status==='AVAILABLE'&&NUM(ctx.signals.FOREIGN_CURRENCY.value)===0)blockers.push('FOREIGN_CURRENCY_UNAVAILABLE');if(a==='EXPORT'&&ctx.signals.TRADE_ROUTE_CAPACITY?.status==='AVAILABLE'&&NUM(ctx.signals.TRADE_ROUTE_CAPACITY.value)===0)blockers.push('NO_ROUTE_CAPACITY');const status=blockers.length?'BLOCKED':missing.length?'BLOCKED':unknown.length?'UNKNOWN':'FEASIBLE';const r={status,owner:d.owner,execution:d.execution,requiredCapabilities:d.caps,missingCapabilities:missing,unknownCapabilities:unknown,blockingConditions:blockers};this.tr.add({layer:'L11_FEASIBILITY_ENGINE',countryId:c,action:a,status,missing,unknown,blockers});return r;}}
class Decision{constructor(tr,f){this.tr=tr;this.f=f;}run(c,goals,ctx){const out=[];for(const goal of goals){const sc=ctx.scenarios.find(x=>x.id===goal.scenarioId);if(!sc)continue;const candidates=sc.actions.map(a=>({action:a,feasibility:this.f.check(c,a,ctx)})),feasible=candidates.filter(x=>x.feasibility.status==='FEASIBLE');if(!feasible.length)continue;const max=goal.priorityClass==='PRESSURE'?3:goal.priorityClass==='OPPORTUNITY'?2:1;const selected=feasible.slice(0,max).map(x=>x.action);out.push({decisionId:'DEC-'+c+'-'+ctx.turn+'-'+sc.id,countryId:c,simulationTurn:ctx.turn,scenarioId:sc.id,goal:CLONE(goal),candidateActions:CLONE(candidates),selectedActions:selected,decisionFactors:sc.decisionFactors,executionMethod:selected.map(a=>ACTIONS[a].execution),expectedConsequences:selected.flatMap(a=>ACTIONS[a].domains),status:'DECIDED'});}this.tr.add({layer:'L10_DECISION_ENGINE',countryId:c,count:out.length});return out;}}
class ProjectEngine{constructor(tr){this.tr;this.tr=tr;this.m=new Map;}plan(d,a){const x=ACTIONS[a];if(!x||!x.execution.includes('PROJECT'))return null;const p={projectId:'PROJ-'+d.decisionId+'-'+a,countryId:d.countryId,actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',phase:'INITIATION',requirements:{inputs:[],capital:null,labor:null,infrastructure:null,technology:null,time:null},progress:null,commissioning:'PENDING',operationalCapacity:null,executor:x.owner,createdTurn:d.simulationTurn,dependencies:x.domains};this.m.set(p.projectId,p);this.tr.add({layer:'L12_PROJECT_ENGINE',countryId:d.countryId,projectId:p.projectId,status:p.status});return CLONE(p);}advance(e){const p=this.m.get(e?.projectId);if(!p)return null;for(const k of ['status','phase','progress','commissioning','operationalCapacity'])if(e[k]!==undefined)p[k]=CLONE(e[k]);p.lastEvent=e.eventType||null;this.tr.add({layer:'L12_PROJECT_ENGINE',projectId:p.projectId,status:p.status,event:p.lastEvent});return CLONE(p);}list(c){return CLONE([...this.m.values()].filter(x=>!c||ID(x.countryId)===ID(c)));}save(){return CLONE([...this.m.values()]);}restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.projectId,CLONE(x)]));}}
class TransactionEngine{constructor(tr){this.tr=tr;this.m=new Map;}plan(d,a){const x=ACTIONS[a];if(!x||!x.execution.includes('TRANSACTION'))return null;const q={transactionId:'TX-'+d.decisionId+'-'+a,countryId:d.countryId,actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',settlement:'PENDING',from:null,to:null,quantity:null,value:null,currency:null,requirements:{sourceKnown:false,targetKnown:false,amountKnown:false},executor:x.owner,createdTurn:d.simulationTurn};this.m.set(q.transactionId,q);this.tr.add({layer:'L13_TRANSACTION_ENGINE',countryId:d.countryId,transactionId:q.transactionId,status:q.status});return CLONE(q);}settle(e){const q=this.m.get(e?.transactionId);if(!q)return null;q.status=e.status||'SETTLED';q.settlement=CLONE(e);this.tr.add({layer:'L13_TRANSACTION_ENGINE',transactionId:q.transactionId,status:q.status});return CLONE(q);}save(){return CLONE([...this.m.values()]);}restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.transactionId,CLONE(x)]));}}
class Goal{
  constructor(tr,mem){this.tr=tr;this.mem=mem;}
  run(c,sc,gp){
    const prior=this.mem.state(c).persistentGoals||[];
    const goals=sc.map(x=>({
      goalId:'GOAL-'+x.id,
      scenarioId:x.id,
      priorityClass:x.kind==='PRESSURE'?'PRESSURE':x.kind==='OPPORTUNITY'?'OPPORTUNITY':'DRIVER',
      persistent:true,
      previouslyActive:prior.includes(x.id),
      memoryBias:this.mem.bias(c,x.id),
      needs:CLONE(gp.needs),
      priorityFactors:x.decisionFactors,
      requiredOutcome:x.kind==='PRESSURE'?'RESTORE_OR_PROTECT':x.kind==='OPPORTUNITY'?'CAPTURE_OR_EXPAND':'ADJUST_CAPACITY'
    })).sort((a,b)=>(a.priorityClass==='PRESSURE'?0:a.priorityClass==='DRIVER'?1:2)-(b.priorityClass==='PRESSURE'?0:b.priorityClass==='DRIVER'?1:2)||a.goalId.localeCompare(b.goalId));
    this.mem.state(c).persistentGoals=[...new Set(goals.map(x=>x.scenarioId))].slice(-128);
    this.tr.add({layer:'L09_GOAL_PRIORITY_ENGINE',countryId:c,goals:goals.map(x=>x.goalId)});
    return goals;
  }
}
class Feasibility{
  constructor(tr){this.tr=tr;}
  check(c,a,ctx){
    const d=ACTIONS[a];
    if(!d)return{status:'BLOCKED',reason:'ACTION_UNREGISTERED'};
    const missing=[],unknown=[],evidence={};
    for(const cap of d.caps){
      if(ctx.countryCapabilities?.[cap]||ctx.signals?.[cap]?.status==='AVAILABLE'){evidence[cap]={status:'AVAILABLE',source:ctx.signals?.[cap]?.source||'CAPABILITY_REGISTRY'};continue;}
      if(ctx.countryCapabilities?.[cap]===false)evidence[cap]={status:'MISSING',source:'CAPABILITY_REGISTRY'},missing.push(cap);
      else evidence[cap]={status:'UNKNOWN',source:'CAPABILITY_REGISTRY'},unknown.push(cap);
    }
    const blockers=[];
    if(a==='IMPORT'&&ctx.signals.FOREIGN_CURRENCY?.status==='AVAILABLE'&&NUM(ctx.signals.FOREIGN_CURRENCY.value)===0)blockers.push('FOREIGN_CURRENCY_UNAVAILABLE');
    if(a==='EXPORT'&&ctx.signals.TRADE_ROUTE_CAPACITY?.status==='AVAILABLE'&&NUM(ctx.signals.TRADE_ROUTE_CAPACITY.value)===0)blockers.push('NO_ROUTE_CAPACITY');
    const status=blockers.length?'BLOCKED':missing.length?'BLOCKED':unknown.length?'UNKNOWN':'FEASIBLE';
    const r={status,owner:d.owner,execution:d.execution,requiredCapabilities:d.caps,missingCapabilities:missing,unknownCapabilities:unknown,blockingConditions:blockers,evidence};
    this.tr.add({layer:'L11_FEASIBILITY_ENGINE',countryId:c,action:a,status,missing,unknown,blockers});
    return r;
  }
}
class Decision{
  constructor(tr,f,graph,mem){this.tr=tr;this.f=f;this.graph=graph;this.mem=mem;}
  analyze(c,a,goal,ctx){
    const feasibility=this.f.check(c,a,ctx);
    const d=ACTIONS[a],riskSignals=['SECURITY_THREAT','FOREIGN_TENSION','INFLATION','INTEREST_PRESSURE'];
    const risk=riskSignals.filter(k=>ctx.signals?.[k]?.status==='AVAILABLE').map(k=>({signal:k,direction:DIRECTION(ctx.signals[k].raw),source:ctx.signals[k].source}));
    const finance=['LIQUIDITY','CAPITAL_AVAILABILITY','FOREIGN_CURRENCY'].map(k=>({signal:k,status:ctx.signals?.[k]?.status||'UNAVAILABLE',direction:DIRECTION(ctx.signals?.[k]?.raw),source:ctx.signals?.[k]?.source||null}));
    const secondOrder=this.graph.down(d?.domains||[]);
    const memoryBias=this.mem.bias(c,goal.scenarioId);
    return{action:a,feasibility,costEvidence:finance,timeEvidence:ctx.signals?.PROJECT_DELAY||{status:'UNAVAILABLE'},benefitEvidence:goal.priorityClass==='PRESSURE'?{type:'PRESSURE_RELIEF'}:{type:'OPPORTUNITY_CAPTURE'},riskEvidence:risk,resourceEvidence:feasibility.evidence,strategicImpact:{priorityClass:goal.priorityClass,domains:d?.domains||[]},secondOrderEffects:secondOrder,memoryBias,assessmentStatus:feasibility.status==='FEASIBLE'?'QUALITATIVE_COMPLETE':'EVIDENCE_INCOMPLETE'};
  }
  run(c,goals,ctx){
    const out=[];
    for(const goal of goals){
      const sc=ctx.scenarios.find(x=>x.id===goal.scenarioId);
      if(!sc)continue;
      const analyses=sc.actions.map(a=>this.analyze(c,a,goal,ctx));
      const feasible=analyses.filter(x=>x.feasibility.status==='FEASIBLE');
      const conditionally=analyses.filter(x=>x.feasibility.status==='UNKNOWN');
      if(!feasible.length&&!conditionally.length)continue;
      const pool=feasible.length?feasible:conditionally;
      const limit=goal.priorityClass==='PRESSURE'?3:goal.priorityClass==='OPPORTUNITY'?2:1;
      const selected=pool.slice(0,limit).map(x=>x.action);
      out.push({decisionId:'DEC-'+c+'-'+ctx.turn+'-'+sc.id,countryId:c,simulationTurn:ctx.turn,scenarioId:sc.id,goal:CLONE(goal),candidateActions:analyses,selectedActions:selected,decisionFactors:sc.decisionFactors,executionMethod:selected.map(a=>ACTIONS[a].execution),expectedConsequences:selected.flatMap(a=>ACTIONS[a].domains),selectionBasis:feasible.length?'FEASIBLE_EVIDENCE_FIRST':'CONDITIONALLY_FEASIBLE_WITH_UNKNOWN_INPUTS',status:'DECIDED'});
    }
    this.tr.add({layer:'L10_DECISION_ENGINE',countryId:c,count:out.length});
    return out;
  }
}
function PROJECT_REQUIREMENTS(d,action,ctx){
  const req=[];
  const maps={capital:'CAPITAL_AVAILABILITY',labor:'LABOR_AVAILABILITY',infrastructure:'INFRASTRUCTURE_CAPACITY',technology:'TECHNOLOGY_CAPABILITY'};
  for(const [slot,signal] of Object.entries(maps)){
    const o=ctx.signals?.[signal];
    req.push({slot,signal,status:o?.status||'UNAVAILABLE',source:o?.source||null,evidence:o?.raw||null});
  }
  req.push({slot:'inputs',signal:'INPUT_AVAILABILITY',status:ctx.signals?.INPUT_AVAILABILITY?.status||'UNAVAILABLE',source:ctx.signals?.INPUT_AVAILABILITY?.source||null,evidence:ctx.signals?.INPUT_AVAILABILITY?.raw||null});
  return req;
}
class ProjectEngine{
  constructor(tr){this.tr=tr;this.m=new Map;}
  plan(d,a,ctx={}){
    const x=ACTIONS[a];if(!x||!x.execution.includes('PROJECT'))return null;
    const p={projectId:'PROJ-'+d.decisionId+'-'+a,countryId:d.countryId,actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',phase:'INITIATION',requirements:PROJECT_REQUIREMENTS(d,a,ctx),progress:null,commissioning:'PENDING',operationalCapacity:null,executor:x.owner,createdTurn:d.simulationTurn,dependencies:x.domains,executionAuthority:'EXTERNAL_PROJECT_EXECUTOR'};
    this.m.set(p.projectId,p);
    this.tr.add({layer:'L12_PROJECT_ENGINE',countryId:d.countryId,projectId:p.projectId,status:p.status,phase:p.phase});
    return CLONE(p);
  }
  advance(e){
    const p=this.m.get(e?.projectId);if(!p)return null;
    for(const k of ['status','phase','progress','commissioning','operationalCapacity','lastEvent'])if(e[k]!==undefined)p[k]=CLONE(e[k]);
    p.lastEvent=e.eventType||p.lastEvent||null;
    this.tr.add({layer:'L12_PROJECT_ENGINE',projectId:p.projectId,status:p.status,event:p.lastEvent});
    return CLONE(p);
  }
  list(c){return CLONE([...this.m.values()].filter(x=>!c||ID(x.countryId)===ID(c)));}
  save(){return CLONE([...this.m.values()]);}
  restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.projectId,CLONE(x)]));}
}
class TransactionEngine{
  constructor(tr){this.tr=tr;this.m=new Map;}
  plan(d,a,ctx={}){
    const x=ACTIONS[a];if(!x||!x.execution.includes('TRANSACTION'))return null;
    const gap=ctx.gapPressure?.gaps?.RESOURCE||null, qty=gap?.state==='TRUE'?gap.gap:null;
    const price=SCALAR(ctx.signals?.MARKET_PRICE?.value), value=qty!==null&&price!==null?qty*price:null;
    const q={transactionId:'TX-'+d.decisionId+'-'+a,countryId:d.countryId,actionType:a,scenarioId:d.scenarioId,decisionId:d.decisionId,status:'PROPOSED',settlement:'PENDING',from:null,to:null,quantity:qty,value,currency:null,requirements:{sourceKnown:false,targetKnown:false,amountKnown:qty!==null,valueKnown:value!==null,foreignCurrencyEvidence:ctx.signals?.FOREIGN_CURRENCY?.status||'UNAVAILABLE'},executor:x.owner,createdTurn:d.simulationTurn,executionAuthority:'EXTERNAL_TRANSACTION_EXECUTOR'};
    this.m.set(q.transactionId,q);
    this.tr.add({layer:'L13_TRANSACTION_ENGINE',countryId:d.countryId,transactionId:q.transactionId,status:q.status});
    return CLONE(q);
  }
  settle(e){
    const q=this.m.get(e?.transactionId);if(!q)return null;
    q.status=e.status||'SETTLED';q.settlement=CLONE(e);
    this.tr.add({layer:'L13_TRANSACTION_ENGINE',transactionId:q.transactionId,status:q.status});
    return CLONE(q);
  }
  save(){return CLONE([...this.m.values()]);}
  restore(v){this.m=new Map((Array.isArray(v)?v:[]).map(x=>[x.transactionId,CLONE(x)]));}
}
