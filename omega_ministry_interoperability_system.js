/*
 * OMEGA GOVERNMENT INTEROPERABILITY SYSTEM v2.0.0
 *
 * Institutional interoperability layer for independent ministry engines.
 * This is NOT an authoritative game-state store. It is a deterministic
 * communication, public-state projection, evidence, decision-context and
 * command/event coordination system.
 */
(function(global){
  'use strict';

  const VERSION='2.0.0';
  const DEFAULT_MAX_INBOX=256;
  const DEFAULT_MAX_HISTORY=128;

  const FALLBACK_IDS=Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);

  const AVAILABILITY=Object.freeze({
    AVAILABLE:'AVAILABLE',
    UNOBSERVED:'UNOBSERVED',
    UNAVAILABLE:'UNAVAILABLE',
    STALE:'STALE',
    INVALID:'INVALID',
    NOT_APPLICABLE:'NOT_APPLICABLE',
    ESTIMATED:'ESTIMATED'
  });

  const VISIBILITY=Object.freeze({
    PUBLIC:'PUBLIC',
    GOVERNMENT_INTERNAL:'GOVERNMENT_INTERNAL',
    RESTRICTED:'RESTRICTED',
    CLASSIFIED:'CLASSIFIED'
  });

  const MESSAGE_TYPES=Object.freeze({
    STATE_UPDATE:'STATE_UPDATE',
    POLICY_UPDATE:'POLICY_UPDATE',
    REQUEST:'REQUEST',
    RESPONSE:'RESPONSE',
    ACK:'ACK',
    ALERT:'ALERT',
    FISCAL_STATUS:'FISCAL_STATUS',
    BUDGET_REQUEST:'BUDGET_REQUEST',
    PROJECT_STATUS:'PROJECT_STATUS',
    CONSTRAINT_UPDATE:'CONSTRAINT_UPDATE'
  });

  const DELIVERY_STATUS=Object.freeze({
    CREATED:'CREATED',
    DELIVERED:'DELIVERED',
    ACCEPTED:'ACCEPTED',
    REJECTED:'REJECTED',
    PROCESSING:'PROCESSING',
    PROCESSED:'PROCESSED',
    RESPONDED:'RESPONDED',
    EXPIRED:'EXPIRED',
    FAILED:'FAILED',
    DUPLICATE:'DUPLICATE'
  });

  const REQUEST_STATUS=Object.freeze({
    CREATED:'CREATED',
    DELIVERED:'DELIVERED',
    ACCEPTED:'ACCEPTED',
    REJECTED:'REJECTED',
    PROCESSING:'PROCESSING',
    RESPONDED:'RESPONDED',
    EXPIRED:'EXPIRED',
    FAILED:'FAILED'
  });

  const EVENT_TYPES=Object.freeze({
    MINISTRY_STATE_PUBLISHED:'MINISTRY_STATE_PUBLISHED',
    BUDGET_REQUESTED:'BUDGET_REQUESTED',
    BUDGET_APPROVED:'BUDGET_APPROVED',
    BUDGET_REJECTED:'BUDGET_REJECTED',
    PROJECT_STARTED:'PROJECT_STARTED',
    PROJECT_BLOCKED:'PROJECT_BLOCKED',
    PROJECT_COMPLETED:'PROJECT_COMPLETED',
    TREATY_NEGOTIATION_STARTED:'TREATY_NEGOTIATION_STARTED',
    TREATY_SIGNED:'TREATY_SIGNED',
    TREATY_RATIFIED:'TREATY_RATIFIED',
    TREATY_SUSPENDED:'TREATY_SUSPENDED',
    SANCTION_IMPOSED:'SANCTION_IMPOSED',
    SANCTION_LIFTED:'SANCTION_LIFTED',
    TRADE_POLICY_CHANGED:'TRADE_POLICY_CHANGED',
    FISCAL_CONDITION_CHANGED:'FISCAL_CONDITION_CHANGED',
    TRANSPORT_CAPACITY_CHANGED:'TRANSPORT_CAPACITY_CHANGED',
    THREAT_ASSESSMENT_CHANGED:'THREAT_ASSESSMENT_CHANGED',
    RESOURCE_STATE_CHANGED:'RESOURCE_STATE_CHANGED',
    OMEGA_AUTONOMY_DECISION_CREATED:'OMEGA_AUTONOMY_DECISION_CREATED',
    OMEGA_AUTONOMY_EVIDENCE_COLLECTED:'OMEGA_AUTONOMY_EVIDENCE_COLLECTED',
    OMEGA_AUTONOMY_PLAN_CREATED:'OMEGA_AUTONOMY_PLAN_CREATED',
    OMEGA_AUTONOMY_RESERVATION_CREATED:'OMEGA_AUTONOMY_RESERVATION_CREATED',
    OMEGA_AUTONOMY_RESERVATION_RELEASED:'OMEGA_AUTONOMY_RESERVATION_RELEASED',
    OMEGA_AUTONOMY_ACTION_DISPATCHED:'OMEGA_AUTONOMY_ACTION_DISPATCHED',
    OMEGA_RESOURCE_IMPORT_REQUEST_SENT:'OMEGA_RESOURCE_IMPORT_REQUEST_SENT',
    OMEGA_PROJECT_CONSTRUCTION_STARTED:'OMEGA_PROJECT_CONSTRUCTION_STARTED',
    OMEGA_PROJECT_CONSTRUCTION_PROGRESS:'OMEGA_PROJECT_CONSTRUCTION_PROGRESS',
    OMEGA_PROJECT_CONSTRUCTION_COMPLETED:'OMEGA_PROJECT_CONSTRUCTION_COMPLETED',
    OMEGA_HOUSING_CAPACITY_CHANGED:'OMEGA_HOUSING_CAPACITY_CHANGED',
    OMEGA_FACTORY_CAPACITY_CHANGED:'OMEGA_FACTORY_CAPACITY_CHANGED',
    OMEGA_MILITARY_RECRUITMENT_APPLIED:'OMEGA_MILITARY_RECRUITMENT_APPLIED',
    OMEGA_MILITARY_TRAINING_APPLIED:'OMEGA_MILITARY_TRAINING_APPLIED',
    OMEGA_MILITARY_EQUIPMENT_APPLIED:'OMEGA_MILITARY_EQUIPMENT_APPLIED',
    OMEGA_FORCE_STRUCTURE_CHANGED:'OMEGA_FORCE_STRUCTURE_CHANGED',
    OMEGA_TREATY_NEGOTIATION_STARTED:'OMEGA_TREATY_NEGOTIATION_STARTED',
    OMEGA_THREAT_ASSESSMENT_CREATED:'OMEGA_THREAT_ASSESSMENT_CREATED',
    OMEGA_TRADE_REQUEST_ACCEPTED:'OMEGA_TRADE_REQUEST_ACCEPTED',
    OMEGA_TRADE_REQUEST_REJECTED:'OMEGA_TRADE_REQUEST_REJECTED',
    OMEGA_TRADE_COUNTER_OFFERED:'OMEGA_TRADE_COUNTER_OFFERED',
    OMEGA_TRADE_REQUEST_RETRY_CREATED:'OMEGA_TRADE_REQUEST_RETRY_CREATED',
    OMEGA_TRADE_REQUEST_RETRY_SCHEDULED:'OMEGA_TRADE_REQUEST_RETRY_SCHEDULED',
    OMEGA_TRADE_SHIPMENT_CREATED:'OMEGA_TRADE_SHIPMENT_CREATED',
    OMEGA_TRADE_SETTLEMENT_COMPLETED:'OMEGA_TRADE_SETTLEMENT_COMPLETED',
    OMEGA_TRADE_SETTLEMENT_FAILED:'OMEGA_TRADE_SETTLEMENT_FAILED',
    OMEGA_TRADE_PRESSURE_APPLIED:'OMEGA_TRADE_PRESSURE_APPLIED',
    OMEGA_TRADE_DIPLOMATIC_RELATION_ADJUSTED:'OMEGA_TRADE_DIPLOMATIC_RELATION_ADJUSTED',
    OMEGA_TRADE_MILITARY_PRESSURE_APPLIED:'OMEGA_TRADE_MILITARY_PRESSURE_APPLIED',
    OMEGA_MEMORY_UPDATED:'OMEGA_MEMORY_UPDATED',
    OMEGA_MEMORY_CONSOLIDATED:'OMEGA_MEMORY_CONSOLIDATED',
    OMEGA_TREATY_COUNTER_OFFERED:'OMEGA_TREATY_COUNTER_OFFERED',
    OMEGA_TREATY_ACCEPTED:'OMEGA_TREATY_ACCEPTED',
    OMEGA_TREATY_REJECTED:'OMEGA_TREATY_REJECTED',
    OMEGA_TREATY_RATIFIED:'OMEGA_TREATY_RATIFIED',
    OMEGA_TREATY_IMPLEMENTED:'OMEGA_TREATY_IMPLEMENTED',
    OMEGA_TREATY_SUSPENDED:'OMEGA_TREATY_SUSPENDED',
    OMEGA_TREATY_TERMINATED:'OMEGA_TREATY_TERMINATED',
    OMEGA_MILITARY_FACILITY_CAPACITY_CHANGED:'OMEGA_MILITARY_FACILITY_CAPACITY_CHANGED',
    OMEGA_MILITARY_READINESS_CHANGED:'OMEGA_MILITARY_READINESS_CHANGED',
    OMEGA_MILITARY_TRAINING_COMPLETED:'OMEGA_MILITARY_TRAINING_COMPLETED',
    OMEGA_MILITARY_EQUIPMENT_ASSIGNMENT_CHANGED:'OMEGA_MILITARY_EQUIPMENT_ASSIGNMENT_CHANGED',
    OMEGA_INTELLIGENCE_BELIEF_UPDATED:'OMEGA_INTELLIGENCE_BELIEF_UPDATED',
    OMEGA_MEMORY_TRACE_APPEND:'OMEGA_MEMORY_TRACE_APPEND',
    OMEGA_MARKET_PRICE_UPDATED:'OMEGA_MARKET_PRICE_UPDATED',
    OMEGA_RESOURCE_ENDOWMENT_HYDRATED:'OMEGA_RESOURCE_ENDOWMENT_HYDRATED',
    OMEGA_RESOURCE_EXTRACTION_COMPLETED:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',
    OMEGA_RESOURCE_EXTRACTION_BLOCKED:'OMEGA_RESOURCE_EXTRACTION_BLOCKED',
    OMEGA_RESOURCE_BATCH_CREATED:'OMEGA_RESOURCE_BATCH_CREATED',
    OMEGA_RESOURCE_INVENTORY_CHANGED:'OMEGA_RESOURCE_INVENTORY_CHANGED',
    OMEGA_RESOURCE_INVENTORY_RECONCILED:'OMEGA_RESOURCE_INVENTORY_RECONCILED',
    OMEGA_RESOURCE_PROCESSING_COMPLETED:'OMEGA_RESOURCE_PROCESSING_COMPLETED',
    OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED:'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',
    OMEGA_INDUSTRIAL_RUNTIME_PUBLISHED:'OMEGA_INDUSTRIAL_RUNTIME_PUBLISHED',
    OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED:'OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',
    OMEGA_RESOURCE_TRADE_RECONCILED:'OMEGA_RESOURCE_TRADE_RECONCILED',
    OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH:'OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH',

    MINISTRY_STATE_CHANGED:'MINISTRY_STATE_CHANGED'
  });

  const STANDARD_PUBLIC_PATHS=Object.freeze({
    cabinet:[
      'store.policies','store.decisions','cabinet.autonomyReservations'
    ],
    finance:[
      'finance.budget','finance.allocated','finance.committed','finance.available',
      'finance.reserves','finance.taxRevenue','finance.revenue','finance.spending',
      'finance.encumbered','finance.capitalExpenditure','finance.operatingExpenditure',
      'finance.emergencyAllocation','finance.mandatoryObligations','finance.required',
      'finance.ministryAllocations','finance.resourceFiscal','finance.resourceFiscalLedger','finance.resourceSettlementClearing'
    ],
    economy:[
      'economy.gdp','economy.debt','economy.inflation','economy.unemployment',
      'economy.production','economy.productionCapacity','economy.revenue','economy.reserves','economy.productionAssets',
      'economy.industrialRuntime','economy.companyAccounts','economy.workerIncome','economy.supplierRevenue','economy.factoryOutput'
    ],
    trade:[
      'trade.relations','trade.balance','trade.exports','trade.imports',
      'trade.policy','trade.negotiations','trade.importRequests','trade.offerBook','trade.marketPrice','trade.marketState','trade.marketMeta','trade.routeCapacity','trade.domesticSales'
    ],
    foreign:[
      'foreign.relations','foreign.treaties','foreign.negotiations',
      'foreign.sanctions','foreign.embassies','foreign.negotiationRequests'
    ],
    intelligence:[
      'intelligence.threats','intelligence.state','intelligence.cyber',
      'intelligence.sources','intelligence.threatLevel'
    ],
    defense:[
      'defense.procurement','defense.readiness','defense.threatLevel'
    ],
    military:[
      'military.combat','military.readiness','military.forceStructure','military.logistics',
      'military.recruitmentQueue','military.trainingQueue','military.organizationQueue','military.equipmentQueue','military.equipmentInventory','military.facilities'
    ],
    interior:[
      'interior.stability','interior.corruption','interior.security','interior.housingAssets','cities.housing.available'
    ],
    transport:[
      'transport.infrastructure','transport.infrastructure.capacity','transport.logistics','transport.ports','transport.rail','transport.resourceRevenue'
    ],
    resource:[
      'resourceSummary','resourceInventory','resourceDeposits','resource.inventory','resource.production','resource.consumption','resource.reserves',
      'resource.endowment','resource.mines','resource.mineStates','resource.tradeAvailability','resource.extractionLedger','resource.resourceDomain','resource.authority',
      'resource.batches','resource.inventoryLedger','resource.inventoryIntegrity','resource.lastExtractionTurn'
    ],
    health:[
      'health.state','health.welfare','health.hospitals'
    ],
    education:[
      'education.state','education.research','education.enrollment'
    ],
    technology:[
      'technology.research','technology.innovation','technology.patents','technology.rnd'
    ],
    projects:[
      'projects.registry','projects.legal','projects.requiredFunding','projects.cost','projects.allocatedFunding',
      'projects.committedFunding','projects.spentFunding','projects.remainingFunding',
      'projects.completion','projects.startDate','projects.targetDate',
      'projects.dependencies','projects.blockers','projects.requiredApprovals',
      'projects.linkedMinistries'
    ],
    culture:[
      'culture.state','culture.media','culture.social'
    ],
    statistics:[
      'country.identity','statistics.observations','statistics.indicators',
      'statistics.sampleSize'
    ]
  });

  function clone(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(Array.isArray(value)){const out=[];seen.set(value,out);for(const v of value)out.push(clone(v,seen));return out;}
    if(value instanceof Map){const out={};seen.set(value,out);for(const [k,v] of value.entries())out[String(k)]=clone(v,seen);return out;}
    if(value instanceof Set){const out=[];seen.set(value,out);for(const v of value.values())out.push(clone(v,seen));return out;}
    const out={};seen.set(value,out);
    for(const k of Object.keys(value)){
      if(k==='__proto__'||k==='constructor')continue;
      const v=value[k];
      if(v!==undefined&&typeof v!=='function')out[k]=clone(v,seen);
    }
    return out;
  }

  function deepFreeze(value,seen=new Set()){
    if(value===null||typeof value!=='object'||seen.has(value))return value;
    seen.add(value);
    if(Array.isArray(value)){for(const v of value)deepFreeze(v,seen);}
    else if(value instanceof Map){for(const [k,v] of value.entries()){deepFreeze(k,seen);deepFreeze(v,seen);}}
    else if(value instanceof Set){for(const v of value.values())deepFreeze(v,seen);}
    else for(const k of Object.keys(value))deepFreeze(value[k],seen);
    try{return Object.freeze(value);}catch(_){return value;}
  }

  function number(value){
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value)))return Number(value);
    return null;
  }

  function readPath(root,path){
    if(root==null||!path)return undefined;
    let cur=root;
    for(const part of String(path).split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),part))return undefined;
      cur=cur[part];
    }
    return cur;
  }

  function setPath(root,path,value){
    const parts=String(path).split('.');
    let cur=root;
    for(let i=0;i<parts.length-1;i++){
      if(!cur[parts[i]]||typeof cur[parts[i]]!=='object')cur[parts[i]]={};
      cur=cur[parts[i]];
    }
    cur[parts[parts.length-1]]=value;
    return root;
  }

  function normalizeIds(registry){
    const ids=Array.isArray(registry?.ids)?registry.ids.map(String).filter(Boolean):
      Array.isArray(registry?.list?.())?registry.list().map(String).filter(Boolean):[];
    return [...new Set(ids)];
  }

  function snapshotKey(countryId,ministryId){
    return String(countryId)+'::'+String(ministryId);
  }

  function factValue(fact,entityId){
    if(!fact||fact.value===undefined)return undefined;
    const value=fact.value;
    if(entityId==null)return value;
    if(Array.isArray(value)){
      for(const row of value){
        if(row&&typeof row==='object'){
          const id=row.countryId??row.targetCountryId??row.id;
          if(id!=null&&String(id).toUpperCase()===String(entityId).toUpperCase()){
            return row.value??row.score??row.status??row;
          }
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

  function summarizeAvailability(facts){
    const counts={};
    for(const fact of Object.values(facts||{})){
      const status=String(fact?.availability||AVAILABILITY.UNOBSERVED);
      counts[status]=(counts[status]||0)+1;
    }
    return counts;
  }

  class MinistryInteroperabilitySystem{
    constructor(options={}){
      this.version=VERSION;
      this.registry=options.registry||null;
      this.provider=options.provider||null;
      this.policy=options.policy||null;
      this.decisionFramework=options.decisionFramework||null;
      this.stateTransaction=options.stateTransaction||null;
      this.kernel=null;
      this.bridge=null;
      this.ids=normalizeIds(this.registry);
      this.connections=new Map();
      this.inboxes=new Map();
      this.snapshots=new Map();
      this.deliveryLedger=new Map();
      this.requestLedger=new Map();
      this.events=new Map();
      this.commands=new Map();
      this.commandHandlers=new Map();
      this._receivedMessageIds=new Set();
      this._requestSequence=0;
      this._messageSequence=0;
      this._eventSequence=0;
      this._commandSequence=0;
      this.lastTurn=0;
      this._knowledgeRevision=0;
      this._knowledgeCache=null;
      this.maxInbox=Number.isFinite(Number(options.maxInbox))?Number(options.maxInbox):DEFAULT_MAX_INBOX;
      this.maxHistory=Number.isFinite(Number(options.maxHistory))?Number(options.maxHistory):DEFAULT_MAX_HISTORY;
      this.maxSnapshotAgeTurns=Number.isFinite(Number(options.maxSnapshotAgeTurns))?Number(options.maxSnapshotAgeTurns):1;
      this.metrics={
        sent:0,delivered:0,accepted:0,rejected:0,duplicate:0,
        dropped:0,expired:0,failed:0,processed:0,
        requests:0,responses:0,acks:0,alerts:0,
        statePublications:0,decisionEvaluations:0,commands:0,events:0,
        providerReads:0,providerMisses:0
      };
      this._rebuildTopology();
    }

    configure(options={}){
      this.registry=options.registry||this.registry||global.OmegaMinistryRegistry||global.OmegaMinistryDomainEngines||null;
      this.provider=options.provider||this.provider||global.OmegaMinistryStateProvider?.instance||null;
      this.policy=options.policy||this.policy||global.OmegaMinistryInformationPolicy?.instance||null;
      this.decisionFramework=options.decisionFramework||this.decisionFramework||global.OmegaMinistryDecisionFramework?.instance||null;
      this.stateTransaction=options.stateTransaction||this.stateTransaction||global.OmegaMinistryStateTransaction||null;
      this.ids=normalizeIds(this.registry);
      this.maxInbox=Number.isFinite(Number(options.maxInbox))?Number(options.maxInbox):this.maxInbox;
      this.maxHistory=Number.isFinite(Number(options.maxHistory))?Number(options.maxHistory):this.maxHistory;
      this.maxSnapshotAgeTurns=Number.isFinite(Number(options.maxSnapshotAgeTurns))?Number(options.maxSnapshotAgeTurns):this.maxSnapshotAgeTurns;
      this._rebuildTopology();
      return this;
    }

    _rebuildTopology(){
      this.connections.clear();
      this.inboxes.clear();
      for(const source of this.ids){
        this.inboxes.set(source,[]);
        for(const target of this.ids){
          const key=source+'->'+target;
          this.connections.set(key,{
            id:key,source,target,enabled:true,state:'READY',
            messagesSent:0,messagesDelivered:0,messagesAccepted:0,
            messagesRejected:0,messagesDropped:0,messagesDuplicated:0,
            lastSentTurn:null,lastDeliveredTurn:null,lastAcceptedTurn:null
          });
        }
      }
    }

    init(kernelOrBridge,options={}){
      if(options&&typeof options==='object'&&options.registry)this.configure(options);
      else this.configure({});
      this.kernel=kernelOrBridge||global.Omega?.Kernel||null;
      this.bridge=(
        this.kernel&&typeof this.kernel.createBridge==='function'
          ?this.kernel.createBridge()
          :kernelOrBridge&&typeof kernelOrBridge.emitEvent==='function'
            ?kernelOrBridge:null
      );
      this.lastTurn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      return this.verifyStructure().pass;
    }

    verifyStructure(){
      const expected=this.ids.length*this.ids.length;
      const missing=[];
      const invalid=[];
      for(const source of this.ids){
        for(const target of this.ids){
          const key=source+'->'+target;
          const route=this.connections.get(key);
          if(!route)missing.push(key);
          else if(route.source!==source||route.target!==target||route.enabled!==true)invalid.push(key);
        }
      }
      const engineRegistry=this.registry||global.OmegaMinistryDomainEngines;
      const engines=this.ids.map(id=>engineRegistry?.get?.(id)||null);
      const uniqueInstances=new Set(engines.filter(Boolean)).size;
      const enginesOk=engines.length===this.ids.length&&engines.every(e=>e&&e.id&&e.independent===true&&typeof e.execute==='function')&&uniqueInstances===this.ids.length;
      return {
        pass:missing.length===0&&invalid.length===0&&this.connections.size===expected,
        registryCount:this.ids.length,
        engineCount:engines.filter(Boolean).length,
        uniqueEngineInstances:uniqueInstances,
        connections:this.connections.size,
        expectedConnections:expected,
        crossMinistryConnections:this.ids.length*Math.max(0,this.ids.length-1),
        loopbackConnections:this.ids.length,
        missing,invalid,
        independentEnginesPass:enginesOk
      };
    }

    verifyFullMesh(){return this.verifyStructure();}

    _invalidateKnowledgeCache(){
      this._knowledgeRevision+=1;
      this._knowledgeCache=null;
    }

    _providerValue(countryId,path,context,observed){
      if(this.provider&&typeof this.provider.describe==='function'){
        this.metrics.providerReads+=1;
        const d=this.provider.describe(countryId,path,{currentTurn:this.lastTurn});
        if(d.availability===AVAILABILITY.AVAILABLE||d.availability===AVAILABILITY.ESTIMATED||d.availability===AVAILABILITY.STALE||d.availability===AVAILABILITY.INVALID){
          return d;
        }
        if(d.availability===AVAILABILITY.UNAVAILABLE||d.availability===AVAILABILITY.UNOBSERVED)this.metrics.providerMisses+=1;
        return d;
      }
      const fromObserved=readPath(observed,path);
      if(fromObserved!==undefined){
        return {
          countryId:String(countryId).toUpperCase(),path:String(path),
          value:clone(fromObserved),availability:AVAILABILITY.AVAILABLE,
          availabilityReason:'RUNTIME_EXECUTION_OBSERVATION',
          provenance:{
            provider:'OmegaMinistryInteroperabilitySystem',
            sourceType:'RUNTIME_EXECUTION_OUTPUT',
            source:'domainExecution.observedInputs',
            fieldPath:String(path),
            sourceRevision:null,
            simulationTurn:this.lastTurn,
            availability:AVAILABILITY.AVAILABLE
          }
        };
      }
      const fromContext=readPath(context,path);
      return {
        countryId:String(countryId).toUpperCase(),path:String(path),
        value:fromContext===undefined?null:clone(fromContext),
        availability:fromContext===undefined?AVAILABILITY.UNAVAILABLE:AVAILABILITY.AVAILABLE,
        availabilityReason:fromContext===undefined?'STATE_PROVIDER_UNAVAILABLE':'RUNTIME_CONTEXT_FALLBACK',
        provenance:{
          provider:'OmegaMinistryInteroperabilitySystem',
          sourceType:'RUNTIME_CONTEXT',
          source:'domainContext',
          fieldPath:String(path),
          sourceRevision:null,
          simulationTurn:this.lastTurn,
          availability:fromContext===undefined?AVAILABILITY.UNAVAILABLE:AVAILABILITY.AVAILABLE
        }
      };
    }

    _sourceRevision(countryId,ministryId,context,execution){
      if(this.provider&&typeof this.provider.getRevision==='function'){
        const revision=this.provider.getRevision(countryId,ministryId);
        if(revision!==null&&revision!==undefined)return String(revision);
      }
      if(execution&&execution.stateRevision!==undefined&&execution.stateRevision!==null)return String(execution.stateRevision);
      return null;
    }

    _currentTurn(context,packet){
      const candidates=[packet?.turn,context?.turn,context?.currentTurn,this.lastTurn];
      for(const v of candidates){const n=Number(v);if(Number.isFinite(n))return n;}
      return 0;
    }

    _factVisibility(source,path,explicit){
      if(this.policy&&typeof this.policy.classify==='function'){
        return this.policy.classify(source,path,explicit);
      }
      return VISIBILITY.GOVERNMENT_INTERNAL;
    }

    _messageProvenance(options={}){
      return options.provenance?clone(options.provenance):null;
    }

    _deterministicMessageId(countryId,turn,source,target){
      this._messageSequence+=1;
      return 'OMI-MSG-'+String(turn)+'-'+String(this._messageSequence)+'-'+String(countryId)+'-'+source+'-'+target;
    }

    _transitionDelivery(messageId,status,turn,reason=null){
      const row=this.deliveryLedger.get(String(messageId));
      if(!row)return null;
      row.statusHistory.push({status:String(status),simulationTurn:Number(turn),reason:reason||null});
      row.status=String(status);
      if(status===DELIVERY_STATUS.DELIVERED)row.deliveredTurn=Number(turn);
      if(status===DELIVERY_STATUS.ACCEPTED)row.acceptedTurn=Number(turn);
      if(status===DELIVERY_STATUS.PROCESSING)row.processingTurn=Number(turn);
      if(status===DELIVERY_STATUS.PROCESSED||status===DELIVERY_STATUS.FAILED||status===DELIVERY_STATUS.REJECTED||status===DELIVERY_STATUS.EXPIRED||status===DELIVERY_STATUS.RESPONDED)row.completedTurn=Number(turn);
      return row;
    }

    _route(source,target){
      return this.connections.get(String(source)+'->'+String(target))||null;
    }

    send(source,target,topic,payload={},options={}){
      const src=String(source||'');
      const dst=String(target||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      if(!this.ids.includes(src)||!this.ids.includes(dst)){
        this.metrics.rejected+=1;
        throw new Error('MESH_ROUTE_ID_INVALID');
      }
      if(!countryId){
        this.metrics.rejected+=1;
        throw new Error('COUNTRY_ID_REQUIRED');
      }
      const route=this._route(src,dst);
      if(!route||route.enabled!==true){
        this.metrics.rejected+=1;
        throw new Error('MESH_ROUTE_UNAVAILABLE');
      }

      const messageId=String(options.messageId||this._deterministicMessageId(countryId,turn,src,dst));
      if(this.deliveryLedger.has(messageId)){
        this.metrics.duplicate+=1;
        return clone(this.deliveryLedger.get(messageId).message);
      }

      const sourceSnapshot=this.snapshots.get(snapshotKey(countryId,src));
      const sourceStateRevision=options.sourceStateRevision!==undefined
        ?String(options.sourceStateRevision)
        :(sourceSnapshot?.stateRevision??null);

      const message=Object.freeze({
        protocolVersion:2,
        messageId,
        sourceMinistryId:src,
        targetMinistryId:dst,
        source:src,
        target:dst,
        countryId,
        messageType:String(options.messageType||MESSAGE_TYPES.STATE_UPDATE),
        topic:String(topic||'MINISTRY_INFORMATION'),
        priority:String(options.priority||'NORMAL'),
        simulationTurn:turn,
        turn,
        sourceStateRevision,
        payload:clone(payload),
        timestamp:Date.now(),
        timestampIsTelemetry:true,
        correlationId:options.correlationId?String(options.correlationId):null,
        causationId:options.causationId?String(options.causationId):null,
        expiryTurn:Number.isFinite(Number(options.expiryTurn))?Number(options.expiryTurn):null,
        provenance:this._messageProvenance(options)
      });

      const inbox=this.inboxes.get(dst);
      if(!inbox){
        route.messagesDropped+=1;route.state='DEGRADED';
        this.metrics.dropped+=1;this.metrics.failed+=1;
        throw new Error('MESH_RECEIVER_INBOX_MISSING:'+dst);
      }
      if(inbox.length>=this.maxInbox){
        route.messagesDropped+=1;route.state='DEGRADED';
        this.metrics.dropped+=1;this.metrics.failed+=1;
        this.deliveryLedger.set(messageId,{
          message:clone(message),messageId,countryId,source:src,target:dst,
          status:DELIVERY_STATUS.FAILED,statusHistory:[
            {status:DELIVERY_STATUS.CREATED,simulationTurn:turn,reason:null},
            {status:DELIVERY_STATUS.FAILED,simulationTurn:turn,reason:'INBOX_FULL'}
          ],createdTurn:turn,failedTurn:turn,error:'INBOX_FULL'
        });
        throw new Error('MESH_INBOX_FULL:'+dst);
      }

      this.deliveryLedger.set(messageId,{
        message:clone(message),
        messageId,countryId,source:src,target:dst,
        status:DELIVERY_STATUS.CREATED,
        statusHistory:[{status:DELIVERY_STATUS.CREATED,simulationTurn:turn,reason:null}],
        createdTurn:turn,
        deliveredTurn:null,
        acceptedTurn:null,
        processingTurn:null,
        completedTurn:null,
        error:null
      });
      this._transitionDelivery(messageId,DELIVERY_STATUS.DELIVERED,turn);
      inbox.push(message);
      route.messagesSent+=1;
      route.messagesDelivered+=1;
      route.lastSentTurn=turn;
      route.lastDeliveredTurn=turn;
      route.state='ACTIVE';
      this.metrics.sent+=1;
      this.metrics.delivered+=1;
      if(message.messageType===MESSAGE_TYPES.REQUEST)this.metrics.requests+=1;
      if(message.messageType===MESSAGE_TYPES.RESPONSE)this.metrics.responses+=1;
      if(message.messageType===MESSAGE_TYPES.ACK)this.metrics.acks+=1;
      if(message.messageType===MESSAGE_TYPES.ALERT)this.metrics.alerts+=1;
      this._emit('OMEGA_MINISTRY_MESSAGE_CREATED',message);
      return message;
    }

    broadcast(source,targets,topic,payload={},options={}){
      const list=Array.isArray(targets)?targets:this.ids.filter(id=>id!==String(source));
      return list.map(target=>{
        try{return this.send(source,target,topic,payload,options);}
        catch(error){return {ok:false,target,error:String(error?.message||error)};}
      });
    }

    request(source,target,topic,payload={},options={}){
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      this._requestSequence+=1;
      const requestId=String(options.requestId||('OMI-REQ-'+String(turn)+'-'+String(this._requestSequence)));
      const correlationId=String(options.correlationId||requestId);
      const message=this.send(source,target,topic,payload,{
        ...options,
        messageType:MESSAGE_TYPES.REQUEST,
        correlationId
      });
      this.requestLedger.set(correlationId,{
        requestId,correlationId,messageId:message.messageId,
        countryId:message.countryId,source:String(source),target:String(target),
        topic:String(topic),status:REQUEST_STATUS.DELIVERED,
        createdTurn:turn,expiryTurn:message.expiryTurn,
        responseMessageId:null,responseTurn:null,
        statusHistory:[
          {status:REQUEST_STATUS.CREATED,simulationTurn:turn},
          {status:REQUEST_STATUS.DELIVERED,simulationTurn:turn}
        ]
      });
      return message;
    }

    reply(source,requestMessage,topic,payload={},options={}){
      const request=unwrapMessage(requestMessage);
      if(!request)throw new Error('INVALID_REQUEST_MESSAGE');
      if(String(request.targetMinistryId||request.target||'')!==String(source))throw new Error('RESPONSE_SOURCE_MISMATCH');
      const response=this.send(source,request.sourceMinistryId||request.source,topic,payload,{
        ...options,
        countryId:request.countryId,
        turn:Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn,
        messageType:MESSAGE_TYPES.RESPONSE,
        correlationId:request.correlationId||request.messageId,
        causationId:request.messageId
      });
      const ledger=this.requestLedger.get(String(request.correlationId||request.messageId));
      if(ledger){
        ledger.status=REQUEST_STATUS.RESPONDED;
        ledger.responseMessageId=response.messageId;
        ledger.responseTurn=response.simulationTurn;
        ledger.statusHistory.push({status:REQUEST_STATUS.RESPONDED,simulationTurn:response.simulationTurn});
        this._transitionDelivery(response.messageId,DELIVERY_STATUS.RESPONDED,response.simulationTurn);
      }
      return response;
    }

    acknowledge(source,message,options={}){
      const request=unwrapMessage(message);
      if(!request)throw new Error('INVALID_MESSAGE');
      return this.send(source,request.sourceMinistryId||request.source,'message.acknowledgement',{
        acknowledgedMessageId:request.messageId,
        acknowledgedType:request.messageType
      },{
        ...options,
        countryId:request.countryId,
        messageType:MESSAGE_TYPES.ACK,
        correlationId:request.correlationId||request.messageId,
        causationId:request.messageId
      });
    }

    acceptMessage(idOrCountry,targetOrMessage,messageOrTurn,maybeTurn){
      let countryId,targetId,message,currentTurn;
      if(arguments.length>=3){
        countryId=String(idOrCountry||'').trim().toUpperCase();
        targetId=String(targetOrMessage||'');
        message=messageOrTurn;
        currentTurn=Number.isFinite(Number(maybeTurn))?Number(maybeTurn):this.lastTurn;
      }else{
        targetId=String(idOrCountry||'');
        message=targetOrCountry;
        countryId=String(message?.countryId||'').trim().toUpperCase();
        currentTurn=this.lastTurn;
      }
      const unwrapped=unwrapMessage(message);
      if(!countryId||!this.ids.includes(targetId)||!unwrapped){
        this.metrics.rejected+=1;
        return {ok:false,status:DELIVERY_STATUS.REJECTED,reason:'INVALID_MESSAGE'};
      }
      if(unwrapped.countryId!==countryId){
        this.metrics.rejected+=1;
        return {ok:false,status:DELIVERY_STATUS.REJECTED,reason:'COUNTRY_SCOPE_MISMATCH'};
      }
      if(!this.ids.includes(String(unwrapped.sourceMinistryId||unwrapped.source))){
        this.metrics.rejected+=1;
        return {ok:false,status:DELIVERY_STATUS.REJECTED,reason:'INVALID_SOURCE'};
      }
      if(String(unwrapped.targetMinistryId||unwrapped.target)!==targetId){
        this.metrics.rejected+=1;
        return {ok:false,status:DELIVERY_STATUS.REJECTED,reason:'INVALID_TARGET'};
      }
      const route=this._route(unwrapped.sourceMinistryId||unwrapped.source,targetId);
      if(!route){
        this.metrics.rejected+=1;
        return {ok:false,status:DELIVERY_STATUS.REJECTED,reason:'ROUTE_NOT_FOUND'};
      }
      const existing=this.deliveryLedger.get(String(unwrapped.messageId||''));
      if(existing&&[DELIVERY_STATUS.ACCEPTED,DELIVERY_STATUS.PROCESSING,DELIVERY_STATUS.PROCESSED,DELIVERY_STATUS.RESPONDED].includes(existing.status)){
        route.messagesDuplicated+=1;
        this.metrics.duplicate+=1;
        return {ok:true,duplicate:true,status:DELIVERY_STATUS.DUPLICATE,message:clone(unwrapped)};
      }

      if(unwrapped.expiryTurn!==null&&unwrapped.expiryTurn!==undefined&&Number.isFinite(Number(unwrapped.expiryTurn))&&currentTurn>Number(unwrapped.expiryTurn)){
        this._transitionDelivery(unwrapped.messageId,DELIVERY_STATUS.EXPIRED,currentTurn,'EXPIRY_TURN_REACHED');
        route.messagesRejected+=1;
        this.metrics.expired+=1;
        if(unwrapped.correlationId){
          const req=this.requestLedger.get(String(unwrapped.correlationId));
          if(req){
            req.status=REQUEST_STATUS.EXPIRED;
            req.statusHistory.push({status:REQUEST_STATUS.EXPIRED,simulationTurn:currentTurn});
          }
        }
        return {ok:false,status:DELIVERY_STATUS.EXPIRED,reason:'EXPIRED'};
      }

      this._transitionDelivery(unwrapped.messageId,DELIVERY_STATUS.ACCEPTED,currentTurn);
      route.messagesAccepted+=1;
      route.lastAcceptedTurn=currentTurn;
      this.metrics.accepted+=1;
      if(unwrapped.messageType===MESSAGE_TYPES.REQUEST&&unwrapped.correlationId){
        const req=this.requestLedger.get(String(unwrapped.correlationId));
        if(req){
          req.status=REQUEST_STATUS.ACCEPTED;
          req.statusHistory.push({status:REQUEST_STATUS.ACCEPTED,simulationTurn:currentTurn});
        }
      }
      this._invalidateKnowledgeCache();
      return {ok:true,status:DELIVERY_STATUS.ACCEPTED,message:clone(unwrapped)};
    }

    beginProcessing(messageId,currentTurn=this.lastTurn){
      const row=this.deliveryLedger.get(String(messageId));
      if(!row)return false;
      this._transitionDelivery(String(messageId),DELIVERY_STATUS.PROCESSING,Number(currentTurn));
      if(row.message.messageType===MESSAGE_TYPES.REQUEST&&row.message.correlationId){
        const req=this.requestLedger.get(String(row.message.correlationId));
        if(req){
          req.status=REQUEST_STATUS.PROCESSING;
          req.statusHistory.push({status:REQUEST_STATUS.PROCESSING,simulationTurn:Number(currentTurn)});
        }
      }
      return true;
    }

    completeProcessing(messageId,success=true,currentTurn=this.lastTurn,error=null){
      const row=this.deliveryLedger.get(String(messageId));
      if(!row)return false;
      const status=success?DELIVERY_STATUS.PROCESSED:DELIVERY_STATUS.FAILED;
      this._transitionDelivery(String(messageId),status,Number(currentTurn),error);
      if(success)this.metrics.processed+=1;else this.metrics.failed+=1;
      if(row.message.messageType===MESSAGE_TYPES.REQUEST&&row.message.correlationId){
        const req=this.requestLedger.get(String(row.message.correlationId));
        if(req&&!success){
          req.status=REQUEST_STATUS.FAILED;
          req.statusHistory.push({status:REQUEST_STATUS.FAILED,simulationTurn:Number(currentTurn),reason:error||null});
        }
      }
      return true;
    }

    _expireTurn(turn){
      for(const row of this.requestLedger.values()){
        if([REQUEST_STATUS.RESPONDED,REQUEST_STATUS.EXPIRED,REQUEST_STATUS.FAILED,REQUEST_STATUS.REJECTED].includes(row.status))continue;
        if(row.expiryTurn!==null&&row.expiryTurn!==undefined&&Number.isFinite(Number(row.expiryTurn))&&Number(turn)>Number(row.expiryTurn)){
          row.status=REQUEST_STATUS.EXPIRED;
          row.statusHistory.push({status:REQUEST_STATUS.EXPIRED,simulationTurn:Number(turn)});
          this.metrics.expired+=1;
          this._transitionDelivery(row.messageId,DELIVERY_STATUS.EXPIRED,Number(turn),'REQUEST_EXPIRED');
        }
      }
      for(const [key,inbox] of this.inboxes.entries()){
        const kept=[];
        for(const message of inbox){
          if(message.expiryTurn!==null&&message.expiryTurn!==undefined&&Number.isFinite(Number(message.expiryTurn))&&Number(turn)>Number(message.expiryTurn)){
            this._transitionDelivery(message.messageId,DELIVERY_STATUS.EXPIRED,Number(turn),'INBOX_MESSAGE_EXPIRED');
            this.metrics.expired+=1;
          }else kept.push(message);
        }
        this.inboxes.set(key,kept);
      }
    }

    advanceTurn(turn){
      const n=Number(turn);
      if(!Number.isFinite(n))return this.lastTurn;
      this.lastTurn=Math.max(this.lastTurn,n);
      this._expireTurn(this.lastTurn);
      return this.lastTurn;
    }

    drainInbox(countryId,ministryId,callback,maxMessages=100){
      const c=String(countryId||'').trim().toUpperCase();
      const id=String(ministryId||'');
      const inbox=this.inboxes.get(id);
      if(!c||!inbox||typeof callback!=='function')return 0;
      let count=0;
      while(count<Number(maxMessages)&&inbox.length){
        const message=inbox.shift();
        if(String(message.countryId||'').toUpperCase()!==c){
          this.metrics.rejected+=1;
          this._transitionDelivery(message.messageId,DELIVERY_STATUS.REJECTED,this.lastTurn,'COUNTRY_SCOPE_MISMATCH');
          count+=1;
          continue;
        }
        try{callback(message);}catch(error){
          this.completeProcessing(message.messageId,false,this.lastTurn,String(error?.message||error));
        }
        count+=1;
      }
      return count;
    }

    getMinistryInbox(countryId,ministryId){
      const c=String(countryId||'').trim().toUpperCase();
      const id=String(ministryId||'');
      const inbox=this.inboxes.get(id)||[];
      return clone(inbox.filter(m=>String(m.countryId||'').toUpperCase()===c));
    }

    _compilePublicSnapshot(ministryId,packet={}){
      const countryId=String(packet.context?.countryId||'').trim().toUpperCase();
      if(!countryId)throw new Error('COUNTRY_ID_REQUIRED_FOR_PUBLICATION');
      const turn=this._currentTurn(packet.context,packet);
      this.lastTurn=Math.max(this.lastTurn,turn);
      const engine=this.registry?.get?.(ministryId)||global.OmegaMinistryDomainEngines?.get?.(ministryId)||null;
      const execution=packet.domainExecution||{};
      const context=packet.context||{};
      const observed=execution.observedInputs||{};
      const configuredPaths=[...(Array.isArray(engine?.inputs)?engine.inputs:[]),...(STANDARD_PUBLIC_PATHS[ministryId]||[])];
      const isOwnedPath=path=>{
        const p=String(path||'');
        if(p==='country.identity')return ministryId==='statistics';
        if(p==='resourceSummary'||p==='resourceInventory'||p==='resourceDeposits')return ministryId==='resource';
        return p===String(ministryId)+'.'+p.split('.').slice(1).join('.') ||
          p.startsWith(String(ministryId)+'.') ||
          p.startsWith('store.') && ministryId==='cabinet';
      };
      const paths=[...new Set(configuredPaths)].filter(isOwnedPath);
      const publishedFacts={};
      const dataGaps=[];
      for(const path of paths){
        const described=this._providerValue(countryId,path,context,observed);
        const visibility=this._factVisibility(ministryId,path);
        const sourceRevision=this.provider?.getRevision?.(countryId,ministryId)??null;
        const fact={
          value:described.value===undefined?null:clone(described.value),
          availability:described.availability||AVAILABILITY.UNAVAILABLE,
          availabilityReason:described.availabilityReason||null,
          visibility,
          sourceMinistryId:ministryId,
          countryId,
          path,
          simulationTurn:turn,
          sourceTurn:described.provenance?.simulationTurn??turn,
          stateRevision:sourceRevision,
          publishedAt:Date.now(),
          timestampIsTelemetry:true,
          provenance:clone(described.provenance||null),
          access:{granted:true}
        };
        publishedFacts[path]=fact;
        if(fact.availability!==AVAILABILITY.AVAILABLE)dataGaps.push({
          path,availability:fact.availability,reason:fact.availabilityReason
        });
      }

      const stateRevision=this._sourceRevision(countryId,ministryId,context,execution);
      const runtimeStatus=packet.runtimeState||{};
      const policyCount=Object.keys(publishedFacts).filter(k=>k.startsWith('store.')).length;
      const projectFact=publishedFacts['projects.registry'];
      const projectCount=projectFact?.availability===AVAILABILITY.AVAILABLE&&projectFact.value&&typeof projectFact.value==='object'
        ?Object.keys(projectFact.value).length:null;

      const fiscal=this._groupFacts(publishedFacts,[
        ['budget','finance.budget'],['allocated','finance.allocated'],['committed','finance.committed'],
        ['available','finance.available'],['reserves','finance.reserves'],['taxRevenue','finance.taxRevenue'],
        ['revenue','finance.revenue'],['spending','finance.spending'],['encumbered','finance.encumbered'],
        ['capitalExpenditure','finance.capitalExpenditure'],['operatingExpenditure','finance.operatingExpenditure'],
        ['emergencyAllocation','finance.emergencyAllocation'],['mandatoryObligations','finance.mandatoryObligations']
      ]);

      const projects=this._groupFacts(publishedFacts,[
        ['registry','projects.registry'],['cost','projects.cost'],['allocatedFunding','projects.allocatedFunding'],
        ['committedFunding','projects.committedFunding'],['spentFunding','projects.spentFunding'],
        ['remainingFunding','projects.remainingFunding'],['completion','projects.completion'],
        ['startDate','projects.startDate'],['targetDate','projects.targetDate'],
        ['dependencies','projects.dependencies'],['blockers','projects.blockers'],
        ['requiredApprovals','projects.requiredApprovals'],['linkedMinistries','projects.linkedMinistries']
      ]);
      projects.knownCount=projectCount;

      const ownNeeds=this._compileNeeds(ministryId,countryId,publishedFacts);
      const budgetRequests=this._getBudgetRequestsForCountry(countryId,ministryId);
      const constraints=this._getConstraintsForCountry(countryId,ministryId);
      const alerts=this._getAlertsForCountry(countryId,ministryId);

      const snapshot={
        schemaVersion:2,
        ministryId,
        countryId,
        simulationTurn:turn,
        stateRevision,
        status:runtimeStatus.status||'UNKNOWN',
        active:runtimeStatus.active===true,
        domain:packet.domain||engine?.domain||null,
        fiscal,
        projects,
        needs:ownNeeds,
        requests:{
          budget:budgetRequests,
          inboxCount:this.getMinistryInbox(countryId,ministryId).length
        },
        constraints,
        alerts,
        operations:{
          phase:execution.phase||engine?.phase||null,
          failures:number(runtimeStatus.failures)??0,
          lastDt:number(runtimeStatus.lastDt)??null,
          inputCompleteness:number(execution.derived?.inputCompleteness)??null,
          missingInputs:clone(execution.missingInputs||[]),
          engineRevision:number(execution.revision)??null
        },
        publishedFacts,
        dataAvailability:summarizeAvailability(publishedFacts),
        knownDataGaps:dataGaps,
        provenance:{
          stateProvider:this.provider?.version||this.provider?.VERSION||null,
          publicationSource:'OMEGA_MINISTRY_INTEROPERABILITY_SYSTEM',
          publicationTurn:turn,
          sourceStateRevision:stateRevision
        }
      };
      return snapshot;
    }

    _groupFacts(publishedFacts,entries){
      const out={};
      for(const [alias,path] of entries){
        if(publishedFacts[path])out[alias]=publishedFacts[path];
      }
      return out;
    }

    _compileNeeds(ministryId,countryId,publishedFacts){
      const required=publishedFacts['finance.required']||publishedFacts['projects.requiredFunding']||null;
      const available=publishedFacts['finance.available']||null;
      const committed=publishedFacts['finance.committed']||publishedFacts['projects.committedFunding']||null;
      const mandatory=publishedFacts['finance.mandatoryObligations']||null;
      const result={
        status:'UNAVAILABLE',
        requirement:null,
        requested:null,
        required:null,
        committed:null,
        available:null,
        fundingGap:null,
        priority:null,
        urgency:null,
        evidence:[]
      };
      const fields=[['required',required],['available',available],['committed',committed],['mandatoryObligations',mandatory]];
      for(const [name,fact] of fields)if(fact)result[name]=clone(fact);
      if(publishedFacts['finance.required'])result.evidence.push({path:'finance.required',provenance:clone(required.provenance||null)});
      if(publishedFacts['finance.available'])result.evidence.push({path:'finance.available',provenance:clone(available.provenance||null)});
      if(required?.availability===AVAILABILITY.AVAILABLE&&available?.availability===AVAILABILITY.AVAILABLE){
        const req=number(factValue(required));
        const av=number(factValue(available));
        const com=committed?.availability===AVAILABILITY.AVAILABLE?number(factValue(committed)):null;
        const mand=mandatory?.availability===AVAILABILITY.AVAILABLE?number(factValue(mandatory)):null;
        if(req!==null&&av!==null&&com!==null&&mand!==null){
          result.fundingGap=Math.max(0,req-av-com-mand);
          result.status=result.fundingGap>0?'UNDERFUNDED':'FUNDED';
        }else{
          result.status='UNAVAILABLE';
        }
      }
      return result;
    }

    _recordBudgetLocal(countryId,source,payload,messageId,turn){
      const requestId=String(payload?.requestId||messageId);
      if(!this.requestLedger.has('BUDGET:'+requestId)){
        this.requestLedger.set('BUDGET:'+requestId,{
          kind:'BUDGET',
          requestId,countryId,sourceMinistryId:source,
          targetMinistryId:String(payload?.targetMinistryId||'finance'),
          messageId,
          createdTurn:turn,
          status:String(payload?.status||REQUEST_STATUS.CREATED),
          requestedAmount:number(payload?.requestedAmount??payload?.amount),
          requiredAmount:number(payload?.requiredAmount),
          fundingGap:number(payload?.fundingGap),
          priority:payload?.priority??null,
          urgency:payload?.urgency??null,
          purpose:payload?.purpose??null,
          evidence:clone(payload?.evidence||null),
          statusHistory:[{status:String(payload?.status||REQUEST_STATUS.CREATED),simulationTurn:turn}]
        });
      }
      return this.requestLedger.get('BUDGET:'+requestId);
    }

    _getBudgetRequestsForCountry(countryId,ministryId=null){
      const out=[];
      for(const [key,row] of this.requestLedger.entries()){
        if(!String(key).startsWith('BUDGET:'))continue;
        if(row.countryId!==countryId)continue;
        if(ministryId&&row.sourceMinistryId!==ministryId)continue;
        if(['CLOSED',REQUEST_STATUS.RESPONDED,REQUEST_STATUS.REJECTED].includes(row.status))continue;
        out.push(clone(row));
      }
      return out.slice(-this.maxHistory);
    }

    _recordProjectLocal(countryId,source,payload,messageId,turn){
      const key='PROJECT:'+countryId+':'+String(payload?.projectId||messageId);
      const existing=this.requestLedger.get(key)||{
        kind:'PROJECT',countryId,sourceMinistryId:source,
        projectId:payload?.projectId??null,
        status:null,statusHistory:[]
      };
      Object.assign(existing,{
        messageId,turn,ownerMinistry:payload?.ownerMinistry||source,
        status:payload?.status??null,phase:payload?.phase??null,
        cost:number(payload?.cost),allocatedFunding:number(payload?.allocatedFunding),
        committedFunding:number(payload?.committedFunding),spentFunding:number(payload?.spentFunding),
        remainingFunding:number(payload?.remainingFunding),
        completion:number(payload?.completion),blockers:clone(payload?.blockers||[]),
        dependencies:clone(payload?.dependencies||[]),linkedMinistries:clone(payload?.linkedMinistries||[])
      });
      existing.statusHistory.push({status:existing.status,simulationTurn:turn});
      if(existing.statusHistory.length>this.maxHistory)existing.statusHistory.shift();
      this.requestLedger.set(key,existing);
      return existing;
    }

    _getProjectsForCountry(countryId){
      const out=[];
      for(const [key,row] of this.requestLedger.entries()){
        if(String(key).startsWith('PROJECT:')&&row.countryId===countryId)out.push(clone(row));
      }
      return out.slice(-this.maxHistory);
    }

    _recordFiscalLocal(countryId,source,payload,messageId,turn){
      const key='FISCAL:'+countryId+':'+source;
      const row={
        kind:'FISCAL',countryId,sourceMinistryId:source,messageId,turn,
        budget:number(payload?.budget),allocated:number(payload?.allocated),
        committed:number(payload?.committed),available:number(payload?.available),
        spent:number(payload?.spent),encumbered:number(payload?.encumbered),
        currency:payload?.currency??null,evidence:clone(payload?.evidence||null)
      };
      this.requestLedger.set(key,row);
      this._invalidateKnowledgeCache();
      return row;
    }

    _recordConstraintLocal(countryId,source,payload,messageId,turn){
      const key='CONSTRAINT:'+countryId+':'+source;
      const list=this.requestLedger.get(key)||[];
      list.push({messageId,countryId,sourceMinistryId:source,turn,
        severity:String(payload?.severity||'INFO'),code:payload?.code??null,
        description:payload?.description??null,blocking:payload?.blocking===true,
        evidence:clone(payload?.evidence||null)});
      while(list.length>this.maxHistory)list.shift();
      this.requestLedger.set(key,list);
      this._invalidateKnowledgeCache();
    }

    _recordAlertLocal(countryId,source,payload,messageId,turn){
      const key='ALERT:'+countryId+':'+source;
      const list=this.requestLedger.get(key)||[];
      list.push({messageId,countryId,sourceMinistryId:source,turn,
        priority:String(payload?.priority||'NORMAL'),topic:payload?.topic??null,
        payload:clone(payload)});
      while(list.length>this.maxHistory)list.shift();
      this.requestLedger.set(key,list);
      this._invalidateKnowledgeCache();
    }

    _getConstraintsForCountry(countryId,ministryId){
      const key='CONSTRAINT:'+countryId+':'+ministryId;
      const list=this.requestLedger.get(key)||[];
      return clone(list.slice(-10));
    }

    _getAlertsForCountry(countryId,ministryId){
      const key='ALERT:'+countryId+':'+ministryId;
      const list=this.requestLedger.get(key)||[];
      return clone(list.slice(-10));
    }

    publishState(ministryId,packet={}){
      const id=String(ministryId||'');
      if(!this.ids.includes(id))throw new Error('UNKNOWN_MINISTRY:'+id);
      const snapshot=this._compilePublicSnapshot(id,packet);
      this.snapshots.set(snapshotKey(snapshot.countryId,id),snapshot);
      this.metrics.statePublications+=1;
      this.lastTurn=Math.max(this.lastTurn,snapshot.simulationTurn);
      this._invalidateKnowledgeCache();
      this._emit(EVENT_TYPES.MINISTRY_STATE_PUBLISHED,{
        countryId:snapshot.countryId,
        ministryId:id,
        simulationTurn:snapshot.simulationTurn,
        stateRevision:snapshot.stateRevision,
        dataAvailability:snapshot.dataAvailability
      },snapshot.simulationTurn);
      return this.getPeerState(id,id,snapshot.countryId,{currentTurn:snapshot.simulationTurn});
    }

    _emptyPublicState(countryId,ministryId,currentTurn){
      return {
        schemaVersion:2,
        ministryId,countryId,
        simulationTurn:currentTurn??null,
        stateRevision:null,
        status:'UNKNOWN',
        active:false,
        domain:this.registry?.get?.(ministryId)?.domain||null,
        fiscal:{},
        projects:{knownCount:null},
        needs:{status:'UNOBSERVED',requirement:null,requested:null,required:null,fundingGap:null},
        requests:{budget:[],inboxCount:0},
        constraints:[],alerts:[],
        operations:{},
        publishedFacts:{},
        dataAvailability:{UNOBSERVED:1},
        knownDataGaps:[],
        provenance:null,
        availability:AVAILABILITY.UNOBSERVED
      };
    }

    _filterSnapshotFor(viewer,source,snapshot,currentTurn){
      if(!snapshot)return this._emptyPublicState(snapshot?.countryId||null,source,currentTurn);
      const out=clone(snapshot);
      const filtered={};
      for(const [path,fact] of Object.entries(snapshot.publishedFacts||{})){
        const allowed=this.policy?.canRead?.(viewer,source,fact.visibility)!==false;
        if(allowed){
          const f=clone(fact);
          f.access={granted:true};
          if(String(f.availability)==='AVAILABLE'&&Number.isFinite(Number(currentTurn))&&Number.isFinite(Number(f.simulationTurn))){
            const maxAge=this.maxSnapshotAgeTurns;
            if(Number(currentTurn)-Number(f.simulationTurn)>maxAge){
              f.availability=AVAILABILITY.STALE;
              f.availabilityReason='CONSUMER_CURRENT_TURN_EXCEEDS_PUBLICATION_WINDOW';
            }
          }
          filtered[path]=f;
        }else{
          filtered[path]={
            ...clone(fact),
            value:null,
            availability:AVAILABILITY.UNAVAILABLE,
            availabilityReason:'ACCESS_RESTRICTED',
            access:{granted:false}
          };
        }
      }
      out.publishedFacts=filtered;
      out.fiscal=this._filterGrouped(out.fiscal,filtered);
      out.projects=this._filterGrouped(out.projects,filtered);
      out.dataAvailability=summarizeAvailability(filtered);
      out.knownDataGaps=Object.entries(filtered).filter(([,f])=>f.availability!==AVAILABILITY.AVAILABLE).map(([path,f])=>({path,availability:f.availability,reason:f.availabilityReason}));
      const staleCount=Object.values(filtered).filter(f=>f.availability===AVAILABILITY.STALE).length;
      out.freshness=staleCount?{status:AVAILABILITY.STALE,staleFacts:staleCount}:{
        status:'CURRENT',staleFacts:0
      };
      return out;
    }

    _filterGrouped(grouped,filtered){
      const out={};
      for(const [key,fact] of Object.entries(grouped||{})){
        if(fact?.path&&filtered[fact.path])out[key]=filtered[fact.path];
        else if(fact?.availability!==undefined){
          const path=fact.path;
          if(!path||!filtered[path])continue;
          out[key]=filtered[path];
        }
      }
      if(Object.prototype.hasOwnProperty.call(grouped||{},'knownCount'))out.knownCount=grouped.knownCount;
      return out;
    }

    getPeerState(requesterId,targetId,countryId,options={}){
      const viewer=String(requesterId||'');
      const target=String(targetId||'');
      const c=String(countryId||'').trim().toUpperCase();
      if(!this.ids.includes(viewer)||!this.ids.includes(target)||!c)return null;
      const snapshot=this.snapshots.get(snapshotKey(c,target));
      return this._filterSnapshotFor(viewer,target,snapshot,options.currentTurn??this.lastTurn);
    }

    _getKnowledgeReadModel(requesterId,countryId,currentTurn){
      const cacheKey=String(requesterId)+'::'+String(countryId)+'::'+String(currentTurn??this.lastTurn)+'::'+String(this._knowledgeRevision);
      if(this._knowledgeCache?.key===cacheKey)return this._knowledgeCache.value;
      const peerStates={};
      for(const id of this.ids)peerStates[id]=this.getPeerState(requesterId,id,countryId,{currentTurn});
      const government=this._governmentLedger(countryId,currentTurn);
      const nationalState=this._nationalState(countryId,currentTurn);
      const value=deepFreeze({
        revision:this._knowledgeRevision,
        requesterMinistryId:String(requesterId),
        countryId:String(countryId).trim().toUpperCase(),
        currentTurn:currentTurn??this.lastTurn,
        ownState:peerStates[String(requesterId)],
        peerStates,
        governmentLedger:government,
        nationalState,
        knownDataGaps:this._collectKnownGaps(peerStates),
        incomingMessages:deepFreeze(this.getMinistryInbox(countryId,requesterId).slice(-25))
      });
      this._knowledgeCache={key:cacheKey,value};
      return value;
    }

    _collectKnownGaps(peerStates){
      const out=[];
      for(const [id,state] of Object.entries(peerStates||{})){
        for(const gap of state?.knownDataGaps||[])out.push({ministryId:id,...gap});
      }
      return out.slice(-256);
    }

    _nationalState(countryId,currentTurn){
      let record=null;
      try{record=this.provider?.countryRecord?.(countryId)||null;}catch(_){}
      const domains=[];
      for(const id of this.ids){
        const snapshot=this.snapshots.get(snapshotKey(countryId,id));
        if(snapshot)domains.push({ministryId:id,available:true,turn:snapshot.simulationTurn,revision:snapshot.stateRevision});
        else domains.push({ministryId:id,available:false,turn:null,revision:null});
      }
      return {
        countryId:String(countryId).trim().toUpperCase(),
        countryName:record?.name||record?.officialName||record?.names?.[0]||null,
        simulationTurn:currentTurn??this.lastTurn,
        ministryDomains:domains
      };
    }

    _governmentLedger(countryId,currentTurn){
      const financial=[];
      const budgetRequests=[];
      const projects=[];
      const constraints=[];
      const alerts=[];
      const staleSnapshots=[];
      for(const id of this.ids){
        const snap=this.snapshots.get(snapshotKey(countryId,id));
        if(snap){
          financial.push({
            ministryId:id,
            fiscal:clone(snap.fiscal),
            stateRevision:snap.stateRevision,
            simulationTurn:snap.simulationTurn
          });
          const filtered=this._filterSnapshotFor('cabinet',id,snap,currentTurn);
          if(filtered.freshness?.status===AVAILABILITY.STALE)staleSnapshots.push(id);
          for(const request of filtered.requests?.budget||[])budgetRequests.push(request);
          for(const item of filtered.constraints||[])constraints.push({...item,sourceMinistryId:id});
          for(const item of filtered.alerts||[])alerts.push({...item,sourceMinistryId:id});
          if(filtered.projects?.knownCount!==null&&filtered.projects?.knownCount!==undefined){
            projects.push({ministryId:id,knownCount:filtered.projects.knownCount});
          }
        }
      }
      for(const row of this._getBudgetRequestsForCountry(countryId))budgetRequests.push(row);
      for(const row of this._getProjectsForCountry(countryId))projects.push(row);
      return {
        countryId,
        currentTurn:currentTurn??this.lastTurn,
        financial,
        budgetRequests:dedupeRecords(budgetRequests),
        projects:dedupeRecords(projects),
        constraints:dedupeRecords(constraints),
        alerts:dedupeRecords(alerts),
        staleSnapshots:[...new Set(staleSnapshots)],
        pendingRequests:this.getPendingRequests(countryId)
      };
    }

    getMinistryBriefing(ministryId,countryId,options={}){
      const readModel=this._getKnowledgeReadModel(
        String(ministryId),
        String(countryId).trim().toUpperCase(),
        Number.isFinite(Number(options.currentTurn))?Number(options.currentTurn):this.lastTurn
      );
      return clone({
        schemaVersion:2,
        ministryId:readModel.requesterMinistryId,
        countryId:readModel.countryId,
        generatedTurn:readModel.currentTurn,
        knowledgeRevision:readModel.revision,
        ownState:readModel.ownState,
        peerStates:readModel.peerStates,
        governmentLedger:readModel.governmentLedger,
        nationalState:readModel.nationalState,
        knownDataGaps:readModel.knownDataGaps,
        incomingMessages:readModel.incomingMessages,
        pendingRequests:this.getPendingRequests(readModel.countryId,readModel.requesterMinistryId)
      });
    }

    getContext(ministryId,options={}){
      const id=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      if(!this.ids.includes(id)||!countryId)return null;
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      const readModel=this._getKnowledgeReadModel(id,countryId,turn);
      return deepFreeze({
        ministryId:id,
        countryId,
        turn,
        dt:number(options.dt)??0,
        mesh:this.createPort(id,countryId),
        ownState:readModel.ownState,
        peerStates:readModel.peerStates,
        nationalState:readModel.nationalState,
        governmentLedger:readModel.governmentLedger,
        incomingMessages:readModel.incomingMessages,
        pendingRequests:this.getPendingRequests(countryId,id),
        alerts:readModel.ownState?.alerts||[],
        constraints:readModel.ownState?.constraints||[],
        knownDataGaps:readModel.knownDataGaps,
        decisionContext:null,
        knowledgeRevision:readModel.revision
      });
    }

    createPort(source,countryId){
      const src=String(source||'');
      const c=String(countryId||'').trim().toUpperCase();
      if(!this.ids.includes(src)||!c)throw new Error('INVALID_MINISTRY_PORT');
      const self=this;
      return Object.freeze({
        ministryId:src,
        countryId:c,
        send(target,topic,payload={},options={}){return self.send(src,target,topic,payload,{...options,countryId:c});},
        broadcast(targets,topic,payload={},options={}){return self.broadcast(src,targets,topic,payload,{...options,countryId:c});},
        request(target,topic,payload={},options={}){return self.request(src,target,topic,payload,{...options,countryId:c});},
        reply(message,topic,payload={},options={}){return self.reply(src,message,topic,payload,{...options,countryId:c});},
        acknowledge(message,options={}){return self.acknowledge(src,message,{...options,countryId:c});},
        getPeer(target,options={}){return self.getPeerState(src,target,c,{currentTurn:options.currentTurn??self.lastTurn});},
        getNationalBriefing(options={}){return self.getMinistryBriefing(src,c,options);},
        getDecisionContext(actionId,options={}){return self.evaluateAction(src,actionId,{...options,countryId:c});},
        dispatchCommand(actionId,payload={},options={}){return self.dispatchCommand(src,actionId,c,payload,options);},
        emitEvent(eventType,payload={},options={}){return self.emitEvent(eventType,c,src,payload,options);}
      });
    }

    evaluateAction(ministryId,actionId,options={}){
      const id=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      if(!this.ids.includes(id))return {status:'UNKNOWN',reason:'UNKNOWN_MINISTRY',ministryId:id,countryId};
      const briefing=this.getMinistryBriefing(id,countryId,{currentTurn:options.currentTurn??this.lastTurn});
      const framework=this.decisionFramework||global.OmegaMinistryDecisionFramework?.instance||null;
      if(!framework||typeof framework.evaluate!=='function'){
        return {status:'UNKNOWN',actionId:String(actionId||''),ministryId:id,countryId,reason:'DECISION_FRAMEWORK_UNAVAILABLE'};
      }
      const result=framework.evaluate({
        ministryId:id,
        actionId:String(actionId||''),
        countryId,
        currentTurn:options.currentTurn??this.lastTurn,
        briefing,
        requirements:Array.isArray(options.requirements)?options.requirements:undefined
      });
      this.metrics.decisionEvaluations+=1;
      return clone(result);
    }

    registerAction(actionId,definition){
      const framework=this.decisionFramework||global.OmegaMinistryDecisionFramework?.instance;
      if(!framework?.registerAction)throw new Error('DECISION_FRAMEWORK_UNAVAILABLE');
      return framework.registerAction(actionId,definition);
    }

    registerCommandHandler(commandType,ownerMinistry,handler){
      const owner=String(ownerMinistry||'');
      if(!this.ids.includes(owner))throw new Error('COMMAND_OWNER_UNKNOWN:'+owner);
      if(typeof handler!=='function')throw new Error('COMMAND_HANDLER_REQUIRED');
      this.commandHandlers.set(String(commandType),{ownerMinistry:owner,handler});
      return {commandType:String(commandType),ownerMinistry:owner};
    }

    dispatchCommand(sourceMinistry,actionId,countryId,payload={},options={}){
      const source=String(sourceMinistry||'');
      const country=String(countryId||'').trim().toUpperCase();
      if(!this.ids.includes(source)||!country)throw new Error('INVALID_COMMAND_SOURCE_OR_COUNTRY');
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      this._commandSequence+=1;
      const commandId=String(options.commandId||('OMI-CMD-'+String(turn)+'-'+String(this._commandSequence)));
      const commandType=String(options.commandType||actionId||'');
      const handler=this.commandHandlers.get(commandType)||null;
      const action=this.decisionFramework?.getAction?.(String(actionId||''))||null;
      if(handler && !this.stateTransaction && !global.OmegaMinistryStateTransaction){
        throw new Error('AUTHORITATIVE_STATE_TRANSACTION_UNAVAILABLE');
      }
      if(options.ownerMinistry&&handler&&String(options.ownerMinistry)!==handler.ownerMinistry)throw new Error('COMMAND_OWNER_MISMATCH');

      const command=Object.freeze({
        schemaVersion:1,
        commandId,
        commandType,
        actionId:String(actionId||''),
        sourceMinistryId:source,
        countryId:country,
        simulationTurn:turn,
        stateOwnerMinistryId:handler?.ownerMinistry||options.ownerMinistry||action?.stateOwnerMinistry||null,
        payload:clone(payload),
        correlationId:options.correlationId?String(options.correlationId):null,
        causationId:options.causationId?String(options.causationId):null,
        provenance:clone(options.provenance||null)
      });

      const row={
        ...clone(command),
        status:'CREATED',
        statusHistory:[{status:'CREATED',simulationTurn:turn}],
        result:null,
        requiresRepublish:true
      };
      this.commands.set(commandId,row);
      this.metrics.commands+=1;

      if(!handler){
        row.status='UNHANDLED';
        row.statusHistory.push({status:'UNHANDLED',simulationTurn:turn,reason:'AUTHORITATIVE_HANDLER_NOT_REGISTERED'});
        this._emit('OMEGA_COMMAND_UNHANDLED',{commandId,commandType,sourceMinistryId:source,countryId},turn);
        return clone(row);
      }

      try{
        row.status='PROCESSING';
        row.statusHistory.push({status:'PROCESSING',simulationTurn:turn});
        const transactionFactory=this.stateTransaction||global.OmegaMinistryStateTransaction||null;
        const stateTransaction=transactionFactory?.create
          ? transactionFactory.create(handler.ownerMinistry,country,turn,commandId)
          : null;
        if(!stateTransaction){
          throw new Error('AUTHORITATIVE_STATE_TRANSACTION_UNAVAILABLE');
        }
        const result=handler.handler(deepFreeze(clone(command)),{
          countryId:country,
          simulationTurn:turn,
          stateProvider:this.provider,
          stateTransaction,
          emitEvent:(eventType,eventPayload={},eventOptions={})=>this.emitEvent(eventType,country,handler.ownerMinistry,eventPayload,{...eventOptions,turn,causationId:commandId})
        });
        if(result?.accepted!==false && stateTransaction){
          row.transaction=stateTransaction.commit();
        }else if(stateTransaction){
          stateTransaction.rollback();
        }
        row.result=clone(result);
        row.status=result?.accepted===false?'FAILED':'APPLIED';
        row.stateChanged=Boolean(row.transaction?.changed);
        if(row.transaction?.afterRevision)row.stateRevisionAfter=row.transaction.afterRevision;
        row.statusHistory.push({status:row.status,simulationTurn:turn});
        if(result?.eventType)this.emitEvent(result.eventType,country,handler.ownerMinistry,result.eventPayload||{},{
          turn,causationId:commandId,provenance:result.provenance||null
        });
        return clone(row);
      }catch(error){
        row.status='FAILED';
        row.result={error:String(error?.message||error)};
        row.statusHistory.push({status:'FAILED',simulationTurn:turn});
        this.metrics.failed+=1;
        return clone(row);
      }
    }

    executeCommand(sourceMinistry,commandType,countryId,payload={},options={}){
      return this.dispatchCommand(sourceMinistry,commandType,countryId,payload,{...options,commandType});
    }

    getCommand(commandId){
      const row=this.commands.get(String(commandId||''));
      return row?clone(row):null;
    }

    getEvent(eventId){
      const row=this.events.get(String(eventId||''));
      return row?clone(row):null;
    }

    emitEvent(eventType,countryId,sourceMinistry,payload={},options={}){
      const type=String(eventType||'');
      const country=String(countryId||'').trim().toUpperCase();
      const source=String(sourceMinistry||'');
      if(!Object.prototype.hasOwnProperty.call(EVENT_TYPES,type))throw new Error('NON_CANONICAL_EVENT:'+type);
      if(!this.ids.includes(source)||!country)throw new Error('INVALID_EVENT_SCOPE');
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      this._eventSequence+=1;
      const eventId=String(options.eventId||('OMEGA-EVT-'+String(turn)+'-'+String(this._eventSequence)));
      if(this.events.has(eventId))return clone(this.events.get(eventId));
      const event={
        schemaVersion:1,eventId,eventType:type,countryId:country,
        sourceMinistryId:source,simulationTurn:turn,
        causationId:options.causationId?String(options.causationId):null,
        correlationId:options.correlationId?String(options.correlationId):null,
        stateRevision:options.stateRevision??this.snapshots.get(snapshotKey(country,source))?.stateRevision??null,
        payload:clone(payload),
        provenance:clone(options.provenance||null),
        timestamp:Date.now(),timestampIsTelemetry:true
      };
      this.events.set(eventId,event);
      while(this.events.size>this.maxHistory){
        const firstKey=this.events.keys().next().value;
        if(firstKey)this.events.delete(firstKey);else break;
      }
      this.metrics.events+=1;
      try{this.bridge?.emitEvent?.(type,event);}catch(error){
        event.transportError=String(error?.message||error);
        this.metrics.failed+=1;
      }
      try{global.dispatchEvent?.(new CustomEvent(type,{detail:clone(event)}));}catch(error){
        event.browserEventError=String(error?.message||error);
      }
      this._invalidateKnowledgeCache();
      return clone(event);
    }

    _emit(type,payload,turn){
      if(Object.prototype.hasOwnProperty.call(EVENT_TYPES,type)){
        try{return this.emitEvent(type,payload?.countryId||payload?.country||null,payload?.ministryId||'cabinet',payload,{turn});}catch(_){return null;}
      }
      try{this.bridge?.emitEvent?.(type,payload);}catch(_){}
      try{global.dispatchEvent?.(new CustomEvent(type,{detail:clone(payload)}));}catch(_){}
      return null;
    }

    getPendingRequests(countryId,requesterMinistry=null){
      const c=String(countryId||'').trim().toUpperCase();
      const out=[];
      for(const row of this.requestLedger.values()){
        if(row?.countryId!==c)continue;
        if(requesterMinistry&&row.sourceMinistryId!==String(requesterMinistry))continue;
        if(['RESPONDED','EXPIRED','FAILED','REJECTED','CLOSED'].includes(String(row.status)))continue;
        if(row.kind==='PROJECT'||row.kind==='FISCAL'||row.kind==='CONSTRAINT'||row.kind==='ALERT')continue;
        out.push(clone(row));
      }
      return out.slice(-this.maxHistory);
    }

    getDelivery(messageId){
      const row=this.deliveryLedger.get(String(messageId));
      return row?clone(row):null;
    }

    getRequest(correlationId){
      const row=this.requestLedger.get(String(correlationId));
      return row?clone(row):null;
    }

    getConnection(source,target){
      const row=this._route(source,target);
      return row?clone(row):null;
    }

    connectionsFor(ministryId,direction='ALL'){
      const id=String(ministryId||'');
      return [...this.connections.values()].filter(row=>{
        if(direction==='OUTBOUND')return row.source===id;
        if(direction==='INBOUND')return row.target===id;
        return row.source===id||row.target===id;
      }).map(value=>clone(value));
    }

    publishFiscalStatus(ministryId,status={},options={}){
      const source=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      if(!this.ids.includes(source)||!countryId)throw new Error('INVALID_FISCAL_PUBLICATION_SCOPE');
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      const payload={
        budget:number(status.budget),allocated:number(status.allocated),committed:number(status.committed),
        available:number(status.available),spent:number(status.spent),encumbered:number(status.encumbered),
        currency:status.currency??null,evidence:clone(status.evidence||null)
      };
      this._recordFiscalLocal(countryId,source,payload,'LOCAL-FISCAL-'+source+'-'+turn,turn);
      return this.send(source,String(options.target||'finance'),'ministry.fiscal.status',payload,{
        ...options,countryId,turn,messageType:MESSAGE_TYPES.FISCAL_STATUS
      });
    }

    recordBudgetRequest(ministryId,request={},options={}){
      const source=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      if(!this.ids.includes(source)||!countryId)throw new Error('INVALID_BUDGET_REQUEST_SCOPE');
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      this._requestSequence+=1;
      const requestId=String(request.requestId||('BUDGET-REQ-'+String(turn)+'-'+String(this._requestSequence)));
      const payload={
        requestId,
        targetMinistryId:String(options.target||'finance'),
        requestedAmount:number(request.requestedAmount??request.amount),
        requiredAmount:number(request.requiredAmount),
        fundingGap:number(request.fundingGap),
        priority:request.priority??null,
        urgency:request.urgency??null,
        purpose:request.purpose??null,
        status:request.status??REQUEST_STATUS.CREATED,
        evidence:clone(request.evidence||null)
      };
      const message=this.send(source,payload.targetMinistryId,'ministry.budget.request',payload,{
        ...options,countryId,turn,messageType:MESSAGE_TYPES.BUDGET_REQUEST
      });
      this._recordBudgetLocal(countryId,source,payload,message.messageId,turn);
      this.emitEvent(EVENT_TYPES.BUDGET_REQUESTED,countryId,source,payload,{
        turn,causationId:message.messageId,provenance:payload.evidence
      });
      return message;
    }

    publishProjectStatus(ministryId,status={},options={}){
      const source=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      if(!this.ids.includes(source)||!countryId)throw new Error('INVALID_PROJECT_PUBLICATION_SCOPE');
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      const payload={
        projectId:status.projectId??null,ownerMinistry:status.ownerMinistry||source,
        status:status.status??null,phase:status.phase??null,
        cost:number(status.cost),allocatedFunding:number(status.allocatedFunding),
        committedFunding:number(status.committedFunding),spentFunding:number(status.spentFunding),
        remainingFunding:number(status.remainingFunding),completion:number(status.completion),
        startDate:status.startDate??null,targetDate:status.targetDate??null,
        dependencies:clone(status.dependencies||[]),blockers:clone(status.blockers||[]),
        requiredApprovals:clone(status.requiredApprovals||[]),linkedMinistries:clone(status.linkedMinistries||[])
      };
      const message=this.send(source,String(options.target||'cabinet'),'ministry.project.status',payload,{
        ...options,countryId,turn,messageType:MESSAGE_TYPES.PROJECT_STATUS
      });
      this._recordProjectLocal(countryId,source,payload,message.messageId,turn);
      if(payload.status==='STARTED')this.emitEvent(EVENT_TYPES.PROJECT_STARTED,countryId,source,payload,{turn,causationId:message.messageId});
      if(payload.status==='BLOCKED')this.emitEvent(EVENT_TYPES.PROJECT_BLOCKED,countryId,source,payload,{turn,causationId:message.messageId});
      if(payload.status==='COMPLETED')this.emitEvent(EVENT_TYPES.PROJECT_COMPLETED,countryId,source,payload,{turn,causationId:message.messageId});
      return message;
    }

    publishConstraint(ministryId,constraint={},options={}){
      const source=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      const payload={
        severity:constraint.severity??'INFO',code:constraint.code??null,
        description:constraint.description??null,blocking:constraint.blocking===true,
        evidence:clone(constraint.evidence||null)
      };
      const message=this.send(source,String(options.target||'cabinet'),'ministry.constraint.updated',payload,{
        ...options,countryId,turn,messageType:MESSAGE_TYPES.CONSTRAINT_UPDATE
      });
      this._recordConstraintLocal(countryId,source,payload,message.messageId,turn);
      return message;
    }

    publishAlert(ministryId,alert={},options={}){
      const source=String(ministryId||'');
      const countryId=String(options.countryId||'').trim().toUpperCase();
      const turn=Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn;
      const payload={priority:alert.priority??'NORMAL',topic:alert.topic??null,evidence:clone(alert.evidence||null),...clone(alert)};
      const message=this.send(source,String(options.target||'cabinet'),'ministry.alert',payload,{
        ...options,countryId,turn,messageType:MESSAGE_TYPES.ALERT
      });
      this._recordAlertLocal(countryId,source,payload,message.messageId,turn);
      return message;
    }

    _ingestMessage(message){
      const type=String(message.messageType||MESSAGE_TYPES.STATE_UPDATE);
      const countryId=String(message.countryId||'').trim().toUpperCase();
      const source=String(message.sourceMinistryId||message.source||'');
      if(type===MESSAGE_TYPES.BUDGET_REQUEST)this._recordBudgetLocal(countryId,source,message.payload||{},message.messageId,message.simulationTurn);
      if(type===MESSAGE_TYPES.PROJECT_STATUS)this._recordProjectLocal(countryId,source,message.payload||{},message.messageId,message.simulationTurn);
      if(type===MESSAGE_TYPES.FISCAL_STATUS)this._recordFiscalLocal(countryId,source,message.payload||{},message.messageId,message.simulationTurn);
      if(type===MESSAGE_TYPES.CONSTRAINT_UPDATE)this._recordConstraintLocal(countryId,source,message.payload||{},message.messageId,message.simulationTurn);
      if(type===MESSAGE_TYPES.ALERT)this._recordAlertLocal(countryId,source,message.payload||{},message.messageId,message.simulationTurn);
      this._invalidateKnowledgeCache();
    }

    processIncoming(countryId,targetId,message,currentTurn,processor){
      const accepted=this.acceptMessage(countryId,targetId,message,currentTurn);
      if(!accepted.ok)return accepted;
      this.beginProcessing(message.messageId,currentTurn);
      this._ingestMessage(accepted.message);
      try{
        const result=typeof processor==='function'?processor(accepted.message):{accepted:true};
        if(result&&result.accepted===false){
          this.completeProcessing(message.messageId,false,currentTurn,String(result.reason||'PROCESSOR_REJECTED'));
          return {ok:false,status:DELIVERY_STATUS.REJECTED,reason:result.reason||'PROCESSOR_REJECTED',result:clone(result)};
        }
        this.completeProcessing(message.messageId,true,currentTurn);
        return {ok:true,status:DELIVERY_STATUS.PROCESSED,message:accepted.message,result:clone(result)};
      }catch(error){
        this.completeProcessing(message.messageId,false,currentTurn,String(error?.message||error));
        return {ok:false,status:DELIVERY_STATUS.FAILED,error:String(error?.message||error)};
      }
    }

    diagnostics(countryId=null,currentTurn=this.lastTurn){
      const structure=this.verifyStructure();
      let available=0,missing=0,stale=0,invalid=0,unobserved=0,estimated=0;
      for(const snapshot of this.snapshots.values()){
        if(countryId&&snapshot.countryId!==String(countryId).trim().toUpperCase())continue;
        const counts=snapshot.dataAvailability||{};
        available+=Number(counts.AVAILABLE||0);
        missing+=Number(counts.UNAVAILABLE||0);
        stale+=Number(counts.STALE||0);
        invalid+=Number(counts.INVALID||0);
        unobserved+=Number(counts.UNOBSERVED||0);
        estimated+=Number(counts.ESTIMATED||0);
      }
      const activeRoutes=[...this.connections.values()].filter(r=>r.messagesSent>0&&r.state==='ACTIVE').length;
      let publishedSnapshots=0,staleSnapshots=0;
      for(const snap of this.snapshots.values()){
        if(countryId&&snap.countryId!==String(countryId).trim().toUpperCase())continue;
        publishedSnapshots+=1;
        if(Number.isFinite(Number(currentTurn))&&Number.isFinite(Number(snap.simulationTurn))&&Number(currentTurn)-Number(snap.simulationTurn)>this.maxSnapshotAgeTurns)staleSnapshots+=1;
      }
      const budgetRequestCount=countryId
        ? this.getMinistryBriefing?.('finance',String(countryId).trim().toUpperCase(),{currentTurn})?.governmentLedger?.budgetRequests?.length||0
        : 0;
      const behaviorPass=this.metrics.sent>0&&this.metrics.delivered===this.metrics.sent&&this.metrics.dropped===0;
      return {
        version:VERSION,
        structure:{
          status:structure.pass?'PASS':'FAIL',
          ...structure
        },
        behavior:{
          status:behaviorPass?'PASS':'NOT_YET_VERIFIED',
          messagesSent:this.metrics.sent,
          messagesDelivered:this.metrics.delivered,
          messagesAccepted:this.metrics.accepted,
          messagesProcessed:this.metrics.processed,
          messagesRejected:this.metrics.rejected,
          messagesDropped:this.metrics.dropped,
          messagesDuplicated:this.metrics.duplicate,
          messagesExpired:this.metrics.expired,
          failed:this.metrics.failed
        },
        data:{
          status:'DIAGNOSTIC_ONLY',
          available,missing,stale,invalid,unobserved,estimated
        },
        routes:{
          active:activeRoutes,
          total:this.connections.size
        },
        snapshots:{
          published:publishedSnapshots,
          stale:staleSnapshots
        },
        governanceSignals:{
          budgetRequests:budgetRequestCount,
          projects:countryId?this._getProjectsForCountry(String(countryId).trim().toUpperCase()).length:0,
          constraints:countryId?[...this.requestLedger.values()].filter(r=>r?.countryId===String(countryId).trim().toUpperCase()&&r?.kind===undefined&&Array.isArray(r)).length:0,
          alerts:countryId?[...this.requestLedger.values()].filter(r=>r?.countryId===String(countryId).trim().toUpperCase()&&String(r?.kind||'')==='ALERT').length:0
        },
        requests:{
          pending:countryId?this.getPendingRequests(countryId).length:0,
          total:this.requestLedger.size
        },
        decisions:{
          evaluations:this.metrics.decisionEvaluations
        },
        commands:{
          total:this.commands.size
        },
        events:{
          total:this.events.size
        },
        countryId:countryId?String(countryId).trim().toUpperCase():null,
        simulationTurn:currentTurn,
        notes:[
          'Architecture readiness and data completeness are intentionally reported separately.',
          'Telemetry timestamps are not used to influence simulation outcomes.'
        ]
      };
    }

    health(countryId=null,currentTurn=this.lastTurn){
      return this.diagnostics(countryId,currentTurn);
    }

    advanceTurn(turn){
      const n=Number(turn);
      if(!Number.isFinite(n))return this.lastTurn;
      this.lastTurn=Math.max(this.lastTurn,n);
      this._expireTurn(this.lastTurn);
      this._invalidateKnowledgeCache();
      return this.lastTurn;
    }

    saveState(){
      return this.exportState();
    }

    exportState(){
      const inboxes={};
      for(const [id,list] of this.inboxes.entries())inboxes[id]=clone(list);
      const snapshots={};
      for(const [key,row] of this.snapshots.entries())snapshots[key]=clone(row);
      const delivery={};
      for(const [key,row] of this.deliveryLedger.entries())delivery[key]=clone(row);
      const requests={};
      for(const [key,row] of this.requestLedger.entries())requests[key]=clone(row);
      const events={};
      for(const [key,row] of this.events.entries())events[key]=clone(row);
      const commands={};
      for(const [key,row] of this.commands.entries())commands[key]=clone(row);
      return {
        schemaVersion:2,
        version:VERSION,
        ids:this.ids.slice(),
        lastTurn:this.lastTurn,
        sequences:{
          message:this._messageSequence,request:this._requestSequence,
          event:this._eventSequence,command:this._commandSequence
        },
        metrics:clone(this.metrics),
        inboxes,snapshots,deliveryLedger:delivery,requestLedger:requests,
        events,commands
      };
    }

    loadState(state){
      if(!state||typeof state!=='object')throw new Error('INVALID_INTEROPERABILITY_SAVE');
      const incomingIds=Array.isArray(state.ids)?state.ids.map(String):[];
      if(incomingIds.length&&incomingIds.some(id=>!this.ids.includes(id)))throw new Error('SAVE_MINISTRY_REGISTRY_MISMATCH');
      this.lastTurn=number(state.lastTurn)||0;
      this._messageSequence=number(state.sequences?.message)||0;
      this._requestSequence=number(state.sequences?.request)||0;
      this._eventSequence=number(state.sequences?.event)||0;
      this._commandSequence=number(state.sequences?.command)||0;
      this.metrics={...this.metrics,...clone(state.metrics||{})};
      for(const id of this.ids)this.inboxes.set(id,clone(state.inboxes?.[id]||[]).slice(0,this.maxInbox));
      this.snapshots=new Map(Object.entries(state.snapshots||{}).map(([k,v])=>[k,clone(v)]));
      this.deliveryLedger=new Map(Object.entries(state.deliveryLedger||{}).map(([k,v])=>[k,clone(v)]));
      this.requestLedger=new Map(Object.entries(state.requestLedger||{}).map(([k,v])=>[k,clone(v)]));
      this.events=new Map(Object.entries(state.events||{}).map(([k,v])=>[k,clone(v)]));
      this.commands=new Map(Object.entries(state.commands||{}).map(([k,v])=>[k,clone(v)]));
      this._receivedMessageIds=new Set();
      for(const [id,row] of this.deliveryLedger.entries())if(['ACCEPTED','PROCESSING','PROCESSED','RESPONDED'].includes(row.status))this._receivedMessageIds.add(id);
      this._invalidateKnowledgeCache();
      return true;
    }

    restoreState(state){return this.loadState(state);}

    export(){return this.exportState();}
    import(state){return this.loadState(state);}
  }

  function unwrapMessage(message){
    if(!message||typeof message!=='object')return null;
    if(message.data&&typeof message.data==='object'&&message.data.messageId)return message.data;
    return message.messageId?message:null;
  }

  function dedupeRecords(rows){
    const seen=new Set(),out=[];
    for(const row of rows||[]){
      const key=String(row?.requestId||row?.projectId||row?.messageId||JSON.stringify(row));
      if(seen.has(key))continue;
      seen.add(key);out.push(row);
    }
    return out;
  }

  const apiInstance=new MinistryInteroperabilitySystem();

  const api=Object.freeze({
    VERSION,
    Availability:AVAILABILITY,
    Visibility:VISIBILITY,
    MessageTypes:MESSAGE_TYPES,
    DeliveryStatus:DELIVERY_STATUS,
    RequestStatus:REQUEST_STATUS,
    EventTypes:EVENT_TYPES,
    instance:apiInstance,
    configure:options=>apiInstance.configure(options),
    init:(kernelOrBridge,options={})=>apiInstance.init(kernelOrBridge,options),
    verifyFullMesh:()=>apiInstance.verifyFullMesh(),
    health:(countryId,currentTurn)=>apiInstance.health(countryId,currentTurn),
    diagnostics:(countryId,currentTurn)=>apiInstance.diagnostics(countryId,currentTurn),
    getConnection:(source,target)=>apiInstance.getConnection(source,target),
    connectionsFor:(ministry,direction)=>apiInstance.connectionsFor(ministry,direction),
    createPort:(source,countryId)=>apiInstance.createPort(source,countryId),
    send:(source,target,topic,payload,options)=>apiInstance.send(source,target,topic,payload,options),
    broadcast:(source,targets,topic,payload,options)=>apiInstance.broadcast(source,targets,topic,payload,options),
    request:(source,target,topic,payload,options)=>apiInstance.request(source,target,topic,payload,options),
    reply:(source,message,topic,payload,options)=>apiInstance.reply(source,message,topic,payload,options),
    acknowledge:(source,message,options)=>apiInstance.acknowledge(source,message,options),
    acceptMessage:(...args)=>apiInstance.acceptMessage(...args),
    beginProcessing:(...args)=>apiInstance.beginProcessing(...args),
    completeProcessing:(...args)=>apiInstance.completeProcessing(...args),
    processIncoming:(...args)=>apiInstance.processIncoming(...args),
    drainInbox:(...args)=>apiInstance.drainInbox(...args),
    getMinistryInbox:(...args)=>apiInstance.getMinistryInbox(...args),
    publishState:(...args)=>apiInstance.publishState(...args),
    getPeerState:(...args)=>apiInstance.getPeerState(...args),
    getMinistryBriefing:(...args)=>apiInstance.getMinistryBriefing(...args),
    getContext:(...args)=>apiInstance.getContext(...args),
    evaluateAction:(...args)=>apiInstance.evaluateAction(...args),
    registerAction:(...args)=>apiInstance.registerAction(...args),
    registerCommandHandler:(...args)=>apiInstance.registerCommandHandler(...args),
    dispatchCommand:(...args)=>apiInstance.dispatchCommand(...args),
    executeCommand:(...args)=>apiInstance.executeCommand(...args),
    emitEvent:(...args)=>apiInstance.emitEvent(...args),
    advanceTurn:(...args)=>apiInstance.advanceTurn(...args),
    publishFiscalStatus:(...args)=>apiInstance.publishFiscalStatus(...args),
    recordBudgetRequest:(...args)=>apiInstance.recordBudgetRequest(...args),
    publishProjectStatus:(...args)=>apiInstance.publishProjectStatus(...args),
    publishConstraint:(...args)=>apiInstance.publishConstraint(...args),
    publishAlert:(...args)=>apiInstance.publishAlert(...args),
    getDelivery:(...args)=>apiInstance.getDelivery(...args),
    getRequest:(...args)=>apiInstance.getRequest(...args),
    getCommand:(...args)=>apiInstance.getCommand(...args),
    getEvent:(...args)=>apiInstance.getEvent(...args),
    getPendingRequests:(...args)=>apiInstance.getPendingRequests(...args),
    saveState:()=>apiInstance.saveState(),
    loadState:state=>apiInstance.loadState(state),
    export:()=>apiInstance.export(),
    import:state=>apiInstance.import(state)
  });

  global.Omega=global.Omega||{};
  global.Omega.MinistryInteroperability=api;
  global.Omega.MinistryMesh=api;
  global.OmegaMinistryInteroperability=api;
  global.OmegaMinistryMesh=api;
})(typeof window!=='undefined'?window:globalThis);