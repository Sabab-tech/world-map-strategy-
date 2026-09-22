/*
 * OMEGA MINISTRY INTEROPERABILITY KNOWLEDGE CONTRACT v1.0.0
 *
 * Declarative institutional knowledge/decision contract for the canonical ministries.
 * This registry defines semantic paths and information roles; it does not contain
 * country-specific values.
 */
(function(global){
  'use strict';

  const VERSION='1.0.0';
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

  const api=Object.freeze({
    VERSION,
    roles:Object.freeze({...roles}),
    definitions:Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,def])=>[id,Object.freeze({
      ...def,
      publish:Object.freeze(def.publish.slice()),
      watch:Object.freeze(def.watch.slice()),
      actions:Object.freeze(def.actions.slice())
    })]))),
    factMeta:Object.freeze(Object.fromEntries(Object.entries(factMeta).map(([id,meta])=>[id,Object.freeze({...meta})]))),
    get:id=>definitions[String(id)]||null,
    getFactMeta:(ministry,path)=>factMeta[String(ministry)]?.[String(path)]||{role:roles.INFORMATIONAL},
    list:()=>Object.keys(definitions),
    size:()=>Object.keys(definitions).length
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryKnowledgeContract=api;
  global.OmegaMinistryKnowledgeContract=api;
})(typeof window!=='undefined'?window:globalThis);
