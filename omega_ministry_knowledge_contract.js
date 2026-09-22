/*
 * OMEGA MINISTRY INTEROPERABILITY KNOWLEDGE CONTRACT v1.0.0
 *
 * Declarative institutional knowledge/decision contract for the canonical ministries.
 * This registry defines semantic paths and information roles; it does not contain
 * country-specific values.
 */
(function(global){
  'use strict';

  const VERSION='1.1.0';
  const roles=Object.freeze({
    REQUIRED:'REQUIRED',
    OPTIONAL:'OPTIONAL',
    INFORMATIONAL:'INFORMATIONAL',
    DECISION_INPUT:'DECISION_INPUT'
  });

  const common={
    governmentLedger:true,
    peerVisibility:'POLICY_CONTROLLED'
  };

  const definitions={
    cabinet:{domain:'executive_coordination',publish:['store.policies','store.decisions'],watch:['finance','economy','foreign','defense','projects'],actions:[]},
    defense:{domain:'defense_policy',publish:['defense.procurement','defense.readiness'],watch:['finance','military','resource','foreign','intelligence'],actions:[]},
    military:{domain:'force_readiness',publish:['military.combat','military.readiness','military.forceStructure','military.logistics'],watch:['defense','finance','resource','intelligence','transport'],actions:[]},
    finance:{domain:'fiscal_state',publish:['finance.budget','finance.allocated','finance.committed','finance.available','finance.reserves','finance.taxRevenue','finance.revenue','finance.spending','finance.encumbered','finance.capitalExpenditure','finance.operatingExpenditure','finance.emergencyAllocation','finance.mandatoryObligations','finance.required','finance.ministryAllocations'],watch:['economy','projects','statistics','education','health','defense','military'],actions:[]},
    economy:{domain:'economic_state',publish:['economy.gdp','economy.debt','economy.inflation','economy.unemployment','economy.production','economy.revenue','economy.reserves'],watch:['finance','trade','resource','transport','education','health','technology'],actions:[]},
    trade:{domain:'commerce_state',publish:['trade.relations','trade.balance','trade.exports','trade.imports','trade.policy','trade.negotiations'],watch:['foreign','economy','finance','transport','resource','intelligence'],actions:['CONCLUDE_TRADE_AGREEMENT']},
    foreign:{domain:'diplomatic_state',publish:['foreign.relations','foreign.treaties','foreign.negotiations','foreign.sanctions','foreign.embassies'],watch:['trade','defense','intelligence','economy','finance'],actions:[]},
    intelligence:{domain:'intelligence_state',publish:['intelligence.threats','intelligence.state','intelligence.cyber','intelligence.sources'],watch:['foreign','interior','defense','military','trade'],actions:[]},
    interior:{domain:'civil_administration',publish:['interior.stability','interior.corruption','interior.security'],watch:['finance','health','education','statistics','intelligence'],actions:[]},
    transport:{domain:'infrastructure_logistics',publish:['transport.infrastructure','transport.logistics','transport.ports','transport.rail'],watch:['economy','resource','projects','trade','defense'],actions:[]},
    resource:{domain:'resource_governance',publish:['resourceSummary','resourceInventory','resourceDeposits'],watch:['economy','transport','projects','trade','defense'],actions:[]},
    health:{domain:'public_health',publish:['health.state','health.welfare','health.hospitals'],watch:['finance','interior','education','statistics','economy'],actions:[]},
    education:{domain:'human_capital',publish:['education.state','education.research','education.enrollment'],watch:['finance','technology','health','economy','projects'],actions:[]},
    technology:{domain:'science_technology',publish:['technology.research','technology.innovation','technology.patents','technology.rnd'],watch:['education','finance','defense','economy','projects'],actions:[]},
    projects:{domain:'government_projects',publish:['projects.registry','projects.legal','projects.requiredFunding','projects.cost','projects.allocatedFunding','projects.committedFunding','projects.spentFunding','projects.remainingFunding','projects.completion','projects.startDate','projects.targetDate','projects.dependencies','projects.blockers','projects.requiredApprovals','projects.linkedMinistries'],watch:['finance','transport','technology','resource','education','health'],actions:[]},
    culture:{domain:'culture_media',publish:['culture.state','culture.media','culture.social'],watch:['education','foreign','interior','statistics'],actions:[]},
    statistics:{domain:'national_statistics',publish:['country.identity','statistics.observations','statistics.indicators','statistics.sampleSize'],watch:['economy','finance','health','education','trade','population'],actions:[]}
  };

  const factMeta={};
  for(const [ministry,def] of Object.entries(definitions)){
    factMeta[ministry]={};
    for(const path of def.publish){
      const informational=/\.(relations|treaties|sanctions|embassies|balance|exports|imports|negotiations|observations|indicators|sampleSize)$/.test(path);
      factMeta[ministry][path]={role: informational?roles.INFORMATIONAL:roles.DECISION_INPUT};
    }
  }
  factMeta.trade['trade.balance']={role:roles.INFORMATIONAL};
  factMeta.trade['trade.exports']={role:roles.INFORMATIONAL};
  factMeta.trade['trade.imports']={role:roles.INFORMATIONAL};
  factMeta.foreign['foreign.relations']={role:roles.INFORMATIONAL};
  factMeta.foreign['foreign.treaties']={role:roles.DECISION_INPUT};
  factMeta.foreign['foreign.sanctions']={role:roles.DECISION_INPUT};
  factMeta.finance['finance.reserves']={role:roles.DECISION_INPUT};
  factMeta.transport['transport.logistics']={role:roles.DECISION_INPUT};
  factMeta.intelligence['intelligence.threats']={role:roles.DECISION_INPUT};

  const actionDefinitions={
    CONCLUDE_TRADE_AGREEMENT:{
      actionId:'CONCLUDE_TRADE_AGREEMENT',
      authority:'TRADE_MINISTRY',
      stateOwnerMinistry:'foreign',
      requirements:[
        {id:'foreign.relations',ministryId:'foreign',path:'foreign.relations',entityScoped:true,role:roles.REQUIRED},
        {id:'foreign.treaties',ministryId:'foreign',path:'foreign.treaties',entityScoped:true,role:roles.REQUIRED},
        {id:'foreign.negotiations',ministryId:'foreign',path:'foreign.negotiations',entityScoped:true,required:false,role:roles.OPTIONAL},
        {id:'foreign.sanctions',ministryId:'foreign',path:'foreign.sanctions',entityScoped:true,role:roles.REQUIRED},
        {id:'economy.production',ministryId:'economy',path:'economy.production',role:roles.REQUIRED},
        {id:'finance.reserves',ministryId:'finance',path:'finance.reserves',role:roles.REQUIRED},
        {id:'transport.logistics',ministryId:'transport',path:'transport.logistics',role:roles.REQUIRED},
        {id:'intelligence.threats',ministryId:'intelligence',path:'intelligence.threats',role:roles.REQUIRED},
        {id:'trade.balance',ministryId:'trade',path:'trade.balance',required:false,role:roles.INFORMATIONAL},
        {id:'trade.exports',ministryId:'trade',path:'trade.exports',required:false,role:roles.INFORMATIONAL},
        {id:'trade.imports',ministryId:'trade',path:'trade.imports',required:false,role:roles.INFORMATIONAL}
      ],
      affectedMinistries:['trade','foreign','economy','finance','transport'],
      affectedStateDomains:['foreign','trade','economy','finance','transport'],
      approvalRequirements:[],
      expectedOutputs:['TRADE_POLICY_DECISION'],
      downstreamEffects:[
        {type:'STATE_REVIEW_REQUEST',targetMinistries:['foreign','economy','finance','transport']},
        {type:'PUBLIC_STATE_REPUBLISH',sourceMinistry:'foreign'}
      ]
    }
  };

  function getCapability(ministryId){
    const id=String(ministryId||'');
    const def=definitions[id];
    if(!def)return null;
    return {
      ministryId:id,
      domain:def.domain,
      publish:def.publish.slice(),
      consume:def.watch.slice(),
      actions:def.actions.slice()
    };
  }

  function getActionAuthority(actionId){
    const action=actionDefinitions[String(actionId||'')];
    if(!action)return null;
    return {
      actionId:action.actionId,
      stateOwnerMinistry:action.stateOwnerMinistry||null,
      proposerAuthority:action.authority||null,
      approvalRequirements:Array.isArray(action.approvalRequirements)?action.approvalRequirements.slice():[],
      affectedMinistries:Array.isArray(action.affectedMinistries)?action.affectedMinistries.slice():[],
      affectedStateDomains:Array.isArray(action.affectedStateDomains)?action.affectedStateDomains.slice():[]
    };
  }

  const api=Object.freeze({
    VERSION,
    roles:Object.freeze({...roles}),
    definitions:Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,def])=>[id,Object.freeze({
      ...def,
      publish:Object.freeze(def.publish.slice()),
      watch:Object.freeze(def.watch.slice()),
      actions:Object.freeze(def.actions.slice())
    })]))),
    actionDefinitions:Object.freeze(Object.fromEntries(Object.entries(actionDefinitions).map(([id,def])=>[id,Object.freeze({...def,requirements:Object.freeze(def.requirements.map(r=>Object.freeze({...r})))} )]))),
    factMeta:Object.freeze(Object.fromEntries(Object.entries(factMeta).map(([id,meta])=>[id,Object.freeze({...meta})]))),
    get:id=>definitions[String(id)]||null,
    getFactMeta:(ministry,path)=>factMeta[String(ministry)]?.[String(path)]||{role:roles.INFORMATIONAL},
    getAction:id=>actionDefinitions[String(id)]||null,
    getCapability:getCapability,
    getActionAuthority:getActionAuthority,
    canPerform:(ministryId,actionId)=>Boolean(definitions[String(ministryId||'')]?.actions?.includes(String(actionId||''))),
    actions:()=>Object.keys(actionDefinitions),
    list:()=>Object.keys(definitions),
    size:()=>Object.keys(definitions).length
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryKnowledgeContract=api;
  global.OmegaMinistryKnowledgeContract=api;
})(typeof window!=='undefined'?window:globalThis);
