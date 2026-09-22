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
    CONSTRAINT_UPDATE:'CONSTRAINT_UPDATE',
    EVENT:'EVENT'
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
    MINISTRY_STATE_CHANGED:'MINISTRY_STATE_CHANGED'
  });

  const STANDARD_PUBLIC_PATHS=Object.freeze(Object.fromEntries(Object.entries(globalThis.OmegaMinistryKnowledgeContract?.definitions||{}).map(([id,def])=>[id,def.publish])));

  /* Legacy name retained only as an internal alias; the canonical knowledge contract is authoritative. */
  const MINISTRY_KNOWLEDGE_CONTRACT=globalThis.OmegaMinistryKnowledgeContract||null;
  
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
      this.authority=options.authority||null;
      this.dirtyPublications=new Map();
      this.kernel=null;
      this.bridge=null;
      this.ids=normalizeIds(this.registry);
      this.connections=new Map();
      this.inboxes=new Map();
      this.snapshots=new Map();
      this.deliveryLedger=new Map();
      this.requestLedger=new Map();
      this.events=new Map();
      this.eventOutbox=new Map();
      this.eventSubscriptions=new Map();
      this.eventDeliveryLedger=new Map();
      this.messageProtocols=new Map();
      this.causalRules=new Map();
      this.reactionQueue=[];
      this.commands=new Map();
      this.commandHandlers=new Map();
      this.pendingCommands=new Map();
      this.authorityPolicies=new Map();
      this.arbitrationPolicies=new Map();
      this.workflowDefinitions=new Map();
      this.cases=new Map();
      this._caseSequence=0;
      this._reactionSequence=0;
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
      this.authority=options.authority||this.authority||global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
      if(!this.registry)throw new Error('OMEGA_MINISTRY_REGISTRY_REQUIRED');
      if(!MINISTRY_KNOWLEDGE_CONTRACT)throw new Error('OMEGA_MINISTRY_KNOWLEDGE_CONTRACT_REQUIRED');
      this.ids=normalizeIds(this.registry);
      this.maxInbox=Number.isFinite(Number(options.maxInbox))?Number(options.maxInbox):this.maxInbox;
      this.maxHistory=Number.isFinite(Number(options.maxHistory))?Number(options.maxHistory):this.maxHistory;
      this.maxSnapshotAgeTurns=Number.isFinite(Number(options.maxSnapshotAgeTurns))?Number(options.maxSnapshotAgeTurns):this.maxSnapshotAgeTurns;
      for(const actionId of (MINISTRY_KNOWLEDGE_CONTRACT.actions?.()||[])){
        const definition=MINISTRY_KNOWLEDGE_CONTRACT.getAction?.(actionId);
        if(definition && this.decisionFramework?.registerAction && !this.decisionFramework.getAction?.(actionId)){
          this.decisionFramework.registerAction(actionId,definition);
        }
      }
      this._registerCanonicalMessageProtocols();
      this._rebuildTopology();
      return this;
    }

    _registerCanonicalMessageProtocols(){
      const required=['sourceMinistryId','targetMinistryId','countryId','topic','messageType'];
      for(const type of Object.values(MESSAGE_TYPES)){
        this.registerMessageProtocol(type,{
          requiredFields:required,
          schema:{type:'object',required}
        });
      }
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
      // Ministry identity/route registry and executable domain-engine registry are different contracts.
      // Diagnostics must validate independence against the executable engine registry.
      const engineRegistry=global.OmegaMinistryDomainEngines||global.Omega?.MinistryDomainEngines||null;
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
      if(this.authority&&typeof this.authority.revision==='function'){
        const revision=this.authority.revision(countryId,ministryId);
        if(revision!==null&&revision!==undefined)return String(revision);
      }
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

      const messageType=String(options.messageType||MESSAGE_TYPES.STATE_UPDATE);
      const protocol=this.messageProtocols.get(messageType)||null;
      if(protocol){
        const required=Array.isArray(protocol.requiredFields)&&protocol.requiredFields.length
          ?protocol.requiredFields
          :(Array.isArray(protocol.schema?.required)?protocol.schema.required:[]);
        const candidate={sourceMinistryId:src,targetMinistryId:dst,countryId,topic,payload,messageType};
        const missing=required.filter(field=>{
          const value=readPath(candidate,String(field));
          return value===undefined||value===null||value==='';
        });
        if(missing.length)throw new Error('MESSAGE_SCHEMA_INVALID:'+messageType+':'+missing.join(','));
        if(Array.isArray(protocol.allowedSources)&&!protocol.allowedSources.includes(src))throw new Error('MESSAGE_SOURCE_FORBIDDEN:'+messageType);
        if(Array.isArray(protocol.allowedTargets)&&!protocol.allowedTargets.includes(dst))throw new Error('MESSAGE_TARGET_FORBIDDEN:'+messageType);
      }

      const messageId=String(options.messageId||options.idempotencyKey||this._deterministicMessageId(countryId,turn,src,dst));
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
        messageType,
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
      const prior=[...this.requestLedger.values()].find(row=>row&&row.requestId===requestId&&row.messageId);
      if(prior){
        const existing=this.deliveryLedger.get(String(prior.messageId));
        if(existing?.message)return clone(existing.message);
      }
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
      const contract=MINISTRY_KNOWLEDGE_CONTRACT.get?.(ministryId)||MINISTRY_KNOWLEDGE_CONTRACT.definitions?.[ministryId]||null;
      const configuredPaths=[...(Array.isArray(engine?.inputs)?engine.inputs:[]),...(Array.isArray(contract?.publish)?contract.publish:STANDARD_PUBLIC_PATHS[ministryId]||[])];
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
          role:MINISTRY_KNOWLEDGE_CONTRACT.getFactMeta?.(ministryId,path)?.role||'INFORMATIONAL',
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
      const budgetRequests=this._getBudgetRequestsForCountry(countryId,ministryId);
      const latestRequest=budgetRequests.length?budgetRequests[budgetRequests.length-1]:null;
      const result={
        status:'UNAVAILABLE',
        requestState:latestRequest?{status:'REQUESTED',requestId:latestRequest.requestId||null,amount:latestRequest.requestedAmount??null}:null,
        requested:latestRequest?.requestedAmount??null,
        required:required?clone(required):null,
        committed:committed?clone(committed):null,
        available:available?clone(available):null,
        mandatoryObligations:mandatory?clone(mandatory):null,
        fundingGap:null,
        netAvailable:null,
        priority:latestRequest?.priority??null,
        urgency:latestRequest?.urgency??null,
        evidence:[]
      };
      for(const fact of [required,available,committed,mandatory])if(fact?.provenance)result.evidence.push({path:fact.path,provenance:clone(fact.provenance)});
      const req=required?.availability==='AVAILABLE'?number(factValue(required)):null;
      const av=available?.availability==='AVAILABLE'?number(factValue(available)):null;
      const com=committed?.availability==='AVAILABLE'?number(factValue(committed)):null;
      const mand=mandatory?.availability==='AVAILABLE'?number(factValue(mandatory)):null;
      if(req!==null&&av!==null&&com!==null&&mand!==null){
        result.netAvailable=av-com-mand;
        result.fundingGap=Math.max(0,req-result.netAvailable);
        result.status=result.netAvailable<0?'OVERCOMMITTED':(result.fundingGap>0?'UNDERFUNDED':'FUNDED');
      }else if(latestRequest){
        result.status='REQUESTED';
      }else{
        result.status='UNKNOWN';
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
          visibility:this._factVisibility(source,'budget.request'),
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
        status:payload?.status??null,visibility:this._factVisibility(source,'projects.status'),phase:payload?.phase??null,
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
        currency:payload?.currency??null,visibility:this._factVisibility(source,'fiscal.status'),evidence:clone(payload?.evidence||null)
      };
      this.requestLedger.set(key,row);
      this._invalidateKnowledgeCache();
      return row;
    }

    _recordConstraintLocal(countryId,source,payload,messageId,turn){
      const key='CONSTRAINT:'+countryId+':'+source;
      const list=this.requestLedger.get(key)||[];
      list.push({messageId,countryId,sourceMinistryId:source,turn,
        severity:String(payload?.severity||'INFO'),visibility:this._factVisibility(source,'constraints.'+String(payload?.code||'generic')),code:payload?.code??null,
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
        priority:String(payload?.priority||'NORMAL'),visibility:this._factVisibility(source,'alerts.'+String(payload?.topic||'generic')),topic:payload?.topic??null,
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

    _broadcastStateChangeNotice(countryId,ministryId,turn,stateRevision,changedPaths=[],causationId=null,provenance=null){
      const source=String(ministryId);
      const contract=MINISTRY_KNOWLEDGE_CONTRACT;
      const targets=this.ids.filter(id=>{
        if(id===source)return false;
        const watch=contract?.get?.(id)?.watch;
        return Array.isArray(watch)&&watch.includes(source);
      });
      for(const target of targets){
        try{
          this.send(String(ministryId),target,'ministry.state.changed',{
            stateRevision:stateRevision??null,
            simulationTurn:Number(turn)||0,
            changedPaths:(changedPaths||[]).slice(0,64)
          },{
            countryId:String(countryId).trim().toUpperCase(),
            turn:Number(turn)||0,
            messageType:MESSAGE_TYPES.STATE_UPDATE,
            priority:'NORMAL',
            causationId:causationId||null,
            provenance:clone(provenance||null)
          });
        }catch(error){this.metrics.failed+=1;}
      }
    }

    _markDirtyPublication(snapshot,previous=null,transaction=null){
      const countryId=snapshot.countryId;
      const ministryId=snapshot.ministryId;
      const key=snapshotKey(countryId,ministryId);
      const previousFacts=previous?.publishedFacts||{};
      const changedPaths=[];
      for(const [path,fact] of Object.entries(snapshot.publishedFacts||{})){
        const prev=previousFacts[path];
        const a=JSON.stringify({v:fact?.value,a:fact?.availability,r:fact?.stateRevision});
        const b=JSON.stringify({v:prev?.value,a:prev?.availability,r:prev?.stateRevision});
        if(a!==b)changedPaths.push(path);
      }
      if(previous && changedPaths.length){
        const dirty={
          countryId,ministryId,
          simulationTurn:snapshot.simulationTurn,
          stateRevision:snapshot.stateRevision,
          changedPaths,
          causationId:transaction?.commandId||null
        };
        this.dirtyPublications.set(key,dirty);
        this._broadcastStateChangeNotice(
          countryId,ministryId,snapshot.simulationTurn,snapshot.stateRevision,
          changedPaths,transaction?.commandId||null,snapshot.provenance
        );
      }
      return changedPaths;
    }

    publishState(ministryId,packet={}){
      const id=String(ministryId||'');
      if(!this.ids.includes(id))throw new Error('UNKNOWN_MINISTRY:'+id);
      const publishCountryId=String(packet.context?.countryId||'').trim().toUpperCase();
      const key=snapshotKey(publishCountryId,id);
      const previous=this.snapshots.get(key)||null;
      const snapshot=this._compilePublicSnapshot(id,packet);
      this.snapshots.set(snapshotKey(snapshot.countryId,id),snapshot);
      this._markDirtyPublication(snapshot,previous,packet.transaction||null);
      const dirtyKey=snapshotKey(snapshot.countryId,id);
      const dirty=this.dirtyPublications.get(dirtyKey);
      if(dirty && String(dirty.stateRevision||'')===String(snapshot.stateRevision||'')){
        this.dirtyPublications.delete(dirtyKey);
      }
      this.metrics.statePublications+=1;
      this.lastTurn=Math.max(this.lastTurn,snapshot.simulationTurn);
      this._invalidateKnowledgeCache();
      if(packet.deferEventDispatch===true){
        this.emitEvent(EVENT_TYPES.MINISTRY_STATE_PUBLISHED,snapshot.countryId,id,{
          countryId:snapshot.countryId,
          ministryId:id,
          simulationTurn:snapshot.simulationTurn,
          stateRevision:snapshot.stateRevision,
          dataAvailability:snapshot.dataAvailability
        },{turn:snapshot.simulationTurn,stateRevision:snapshot.stateRevision,deferDispatch:true});
      }else{
        this._emit(EVENT_TYPES.MINISTRY_STATE_PUBLISHED,{
          countryId:snapshot.countryId,
          ministryId:id,
          simulationTurn:snapshot.simulationTurn,
          stateRevision:snapshot.stateRevision,
          dataAvailability:snapshot.dataAvailability
        },snapshot.simulationTurn);
      }
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

    _filterRecordList(viewer,source,rows){
      return (rows||[]).filter(row=>{
        const visibility=row?.visibility||VISIBILITY.GOVERNMENT_INTERNAL;
        return this.policy?.canRead?.(viewer,source,visibility)!==false;
      }).map(row=>clone(row));
    }

    _filterNeeds(viewer,source,needs){
      if(!needs)return null;
      const out=clone(needs);
      for(const key of ['required','committed','available','mandatoryObligations']){
        const fact=out[key];
        if(fact && this.policy?.canRead?.(viewer,source,fact.visibility)!==true){
          out[key]={...clone(fact),value:null,availability:AVAILABILITY.UNAVAILABLE,availabilityReason:'ACCESS_RESTRICTED',access:{granted:false}};
        }
      }
      return out;
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
      out.needs=this._filterNeeds(viewer,source,out.needs);
      out.requests={...out.requests,budget:this._filterRecordList(viewer,source,out.requests?.budget)};
      out.constraints=this._filterRecordList(viewer,source,out.constraints);
      out.alerts=this._filterRecordList(viewer,source,out.alerts);
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
      const currentTurn=options.currentTurn??this.lastTurn;
      const filtered=this._filterSnapshotFor(viewer,target,snapshot,currentTurn);
      if(snapshot && this.authority?.revision){
        const authoritativeRevision=this.authority.revision(c,target);
        if(authoritativeRevision && snapshot.stateRevision && String(authoritativeRevision)!==String(snapshot.stateRevision)){
          for(const fact of Object.values(filtered.publishedFacts||{})){
            if(fact.availability===AVAILABILITY.AVAILABLE)fact.availability=AVAILABILITY.STALE;
            fact.availabilityReason='AUTHORITATIVE_REVISION_AHEAD_OF_PUBLICATION';
          }
          filtered.freshness={status:AVAILABILITY.STALE,reason:'AUTHORITATIVE_REVISION_AHEAD_OF_PUBLICATION'};
          filtered.knownDataGaps=Object.entries(filtered.publishedFacts||{}).filter(([,f])=>f.availability!==AVAILABILITY.AVAILABLE).map(([path,f])=>({path,availability:f.availability,reason:f.availabilityReason}));
        }
      }
      return filtered;
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

    coordinateGovernment(countryId,options={}){
      const country=String(countryId||'').trim().toUpperCase();
      if(!country)throw new Error('COUNTRY_ID_REQUIRED');
      const turn=Number.isFinite(Number(options.currentTurn))?Number(options.currentTurn):this.lastTurn;
      const cabinet=this.getMinistryBriefing('cabinet',country,{currentTurn:turn});
      const agenda=[];
      for(const request of cabinet.governmentLedger?.budgetRequests||[]){
        agenda.push({type:'BUDGET_REQUEST',requestId:request.requestId||request.messageId||null,sourceMinistryId:request.sourceMinistryId||null,status:request.status||'OPEN'});
      }
      for(const item of cabinet.governmentLedger?.constraints||[]){
        agenda.push({type:'CONSTRAINT',code:item.code||null,sourceMinistryId:item.sourceMinistryId||null,blocking:item.blocking===true});
      }
      for(const item of cabinet.governmentLedger?.alerts||[]){
        agenda.push({type:'ALERT',topic:item.topic||null,sourceMinistryId:item.sourceMinistryId||null,priority:item.priority||'NORMAL'});
      }
      return {
        schemaVersion:1,
        countryId:country,
        simulationTurn:turn,
        status:'READY',
        participatingMinistries:this.ids.slice(),
        agenda:agenda.slice(0,this.maxHistory),
        pendingRequests:(cabinet.governmentLedger?.pendingRequests||[]).slice(-this.maxHistory),
        staleSnapshots:(cabinet.governmentLedger?.staleSnapshots||[]).slice(),
        knownDataGaps:(cabinet.knownDataGaps||[]).slice(0,this.maxHistory),
        decisionContext:{available:true,source:'CABINET_GOVERNMENT_READ_MODEL'}
      };
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
        getDecisionContext(actionId,options={}){return self.evaluateAction(src,actionId,{...options,countryId:c,targetCountryId:options.targetCountryId||options.entityId||null});},
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
        targetCountryId:options.targetCountryId||options.entityId||null,
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

    registerMessageProtocol(messageType,definition={}){
      const type=String(messageType||'').trim();
      if(!type)throw new Error('MESSAGE_TYPE_REQUIRED');
      if(!definition||typeof definition!=='object')throw new Error('MESSAGE_PROTOCOL_REQUIRED');
      const normalized={
        messageType:type,
        requiredFields:Array.isArray(definition.requiredFields)?definition.requiredFields.map(String):[],
        schema:clone(definition.schema||null),
        allowedSources:Array.isArray(definition.allowedSources)?definition.allowedSources.map(String):null,
        allowedTargets:Array.isArray(definition.allowedTargets)?definition.allowedTargets.map(String):null,
        timeoutTurns:Number.isFinite(Number(definition.timeoutTurns))?Number(definition.timeoutTurns):null,
        retryPolicy:clone(definition.retryPolicy||null),
        priority:String(definition.priority||'NORMAL')
      };
      this.messageProtocols.set(type,Object.freeze(normalized));
      return clone(normalized);
    }

    subscribeEvent(eventType,ministryId,handler=null,options={}){
      const type=String(eventType||'').trim();
      const ministry=String(ministryId||'').trim();
      if(!type||!this.ids.includes(ministry))throw new Error('INVALID_EVENT_SUBSCRIPTION');
      if(handler!==null&&typeof handler!=='function')throw new Error('EVENT_HANDLER_REQUIRED');
      const key=type+'::'+ministry;
      this.eventSubscriptions.set(key,{
        eventType:type,ministryId:ministry,handler,
        enabled:options.enabled!==false,
        priority:Number.isFinite(Number(options.priority))?Number(options.priority):0
      });
      return {eventType:type,ministryId:ministry,enabled:options.enabled!==false};
    }

    unsubscribeEvent(eventType,ministryId){
      return this.eventSubscriptions.delete(String(eventType||'')+'::'+String(ministryId||''));
    }

    registerCausalRule(ruleId,definition={}){
      const id=String(ruleId||'').trim();
      if(!id)throw new Error('CAUSAL_RULE_ID_REQUIRED');
      const rule={
        ruleId:id,
        eventTypes:Array.isArray(definition.eventTypes)?definition.eventTypes.map(String):[],
        sourceMinistries:Array.isArray(definition.sourceMinistries)?definition.sourceMinistries.map(String):[],
        targetMinistries:Array.isArray(definition.targetMinistries)?definition.targetMinistries.map(String):[],
        condition:typeof definition.condition==='function'?definition.condition:null,
        createReaction:typeof definition.createReaction==='function'?definition.createReaction:null,
        enabled:definition.enabled!==false
      };
      this.causalRules.set(id,rule);
      return {ruleId:id,enabled:rule.enabled};
    }

    evaluateCausalRules(event){
      const created=[];
      for(const rule of this.causalRules.values()){
        if(!rule.enabled)continue;
        if(rule.eventTypes.length&&!rule.eventTypes.includes(String(event?.eventType)))continue;
        if(rule.sourceMinistries.length&&!rule.sourceMinistries.includes(String(event?.sourceMinistryId)))continue;
        let matches=true;
        try{
          if(rule.condition){
            const conditionContext={
              countryId:event.countryId||null,
              simulationTurn:event.simulationTurn??this.lastTurn,
              event:clone(event),
              interoperability:this,
              getContext:(ministryId,options={})=>this.getContext(ministryId,{...options,countryId:event.countryId,turn:event.simulationTurn})
            };
            matches=rule.condition(clone(event),conditionContext)!==false;
          }
        }catch(error){matches=false;}
        if(!matches)continue;
        let task=null;
        try{task=rule.createReaction?rule.createReaction(clone(event)):{targetMinistries:rule.targetMinistries};}catch(error){task=null;}
        if(!task)continue;
        this._reactionSequence+=1;
        const reaction={
          reactionId:'OMEGA-REACTION-'+String(event.simulationTurn||0)+'-'+String(this._reactionSequence),
          ruleId:rule.ruleId,eventId:event.eventId,countryId:event.countryId,
          simulationTurn:event.simulationTurn,targetMinistries:clone(task.targetMinistries||rule.targetMinistries||[]),
          actionId:task.actionId||null,commandType:task.commandType||null,payload:clone(task.payload||{}),
          status:'QUEUED',causationId:event.eventId,correlationId:event.correlationId||event.eventId
        };
        this.reactionQueue.push(reaction);
        created.push(clone(reaction));
      }
      while(this.reactionQueue.length>this.maxHistory)this.reactionQueue.shift();
      return created;
    }

    processReactionQueue(turn=this.lastTurn,limit=this.maxHistory){
      const processed=[];
      let count=0;
      while(this.reactionQueue.length&&count<Number(limit)){
        const task=this.reactionQueue[0];
        if(Number(task.simulationTurn)>Number(turn))break;
        this.reactionQueue.shift();
        count+=1;
        try{
          const targets=Array.isArray(task.targetMinistries)?task.targetMinistries:[];
          const source=String(task.sourceMinistryId||'cabinet');
          if(!this.ids.includes(source))throw new Error('REACTION_SOURCE_UNKNOWN:'+source);
          for(const target of targets){
            if(!this.ids.includes(String(target)))throw new Error('REACTION_TARGET_UNKNOWN:'+String(target));
            this.send(source,String(target),'government.causal.reaction',task.payload,{
              countryId:task.countryId,turn:Number(turn),messageType:MESSAGE_TYPES.EVENT,
              correlationId:task.correlationId,causationId:task.causationId
            });
          }
          task.status='DISPATCHED';
        }catch(error){
          task.status='FAILED';
          task.error=String(error?.message||error);
        }
        processed.push(clone(task));
      }
      return processed;
    }

    registerWorkflow(workflowId,definition={}){
      const id=String(workflowId||'').trim();
      if(!id)throw new Error('WORKFLOW_ID_REQUIRED');
      const normalized={
        workflowId:id,
        caseType:definition.caseType||null,
        states:Array.isArray(definition.states)?definition.states.map(String):[],
        transitions:clone(definition.transitions||{}),
        requiredParticipants:Array.isArray(definition.requiredParticipants)?definition.requiredParticipants.map(String):[],
        approvalStages:Array.isArray(definition.approvalStages)?definition.approvalStages.map(String):[]
      };
      this.workflowDefinitions.set(id,normalized);
      return clone(normalized);
    }

    createCase(definition={}){
      const owner=String(definition.ownerMinistry||'cabinet');
      const countryId=String(definition.countryId||'').trim().toUpperCase();
      if(!this.ids.includes(owner)||!countryId)throw new Error('INVALID_CASE_SCOPE');
      this._caseSequence+=1;
      const caseId=String(definition.caseId||('OMEGA-CASE-'+String(this._caseSequence)));
      if(this.cases.has(caseId))return clone(this.cases.get(caseId));
      const workflowId=definition.workflowId?String(definition.workflowId):null;
      const workflow=workflowId?this.workflowDefinitions.get(workflowId):null;
      const initialStatus=definition.status||workflow?.states?.[0]||'CREATED';
      const row={
        schemaVersion:1,caseId,type:definition.type||workflow?.caseType||'GOVERNMENT_CASE',
        countryId,ownerMinistry:owner,participants:Array.isArray(definition.participants)?definition.participants.map(String):[],
        workflowId,status:initialStatus,statusHistory:[{status:initialStatus,simulationTurn:Number(definition.turn)||this.lastTurn}],
        currentStage:definition.currentStage||initialStatus,approvalState:'PENDING',
        correlationId:definition.correlationId||null,causationId:definition.causationId||null,
        context:clone(definition.context||{}),outputs:[],createdTurn:Number(definition.turn)||this.lastTurn,
        updatedTurn:Number(definition.turn)||this.lastTurn
      };
      this.cases.set(caseId,row);
      return clone(row);
    }

    advanceCase(caseId,nextStatus,metadata={}){
      const row=this.cases.get(String(caseId||''));
      if(!row)throw new Error('CASE_NOT_FOUND');
      const workflow=row.workflowId?this.workflowDefinitions.get(row.workflowId):null;
      const transitions=workflow?.transitions||{};
      const allowed=Array.isArray(transitions[row.status])?transitions[row.status]:null;
      if(allowed&&!allowed.includes(String(nextStatus)))throw new Error('CASE_TRANSITION_NOT_ALLOWED:'+row.status+'->'+String(nextStatus));
      row.status=String(nextStatus);
      row.currentStage=String(nextStatus);
      row.updatedTurn=Number(metadata.turn??this.lastTurn);
      row.statusHistory.push({status:row.status,simulationTurn:row.updatedTurn,reason:metadata.reason||null});
      if(metadata.approvalState)row.approvalState=String(metadata.approvalState);
      if(metadata.output!==undefined)row.outputs.push(clone(metadata.output));
      if(row.statusHistory.length>this.maxHistory)row.statusHistory.shift();
      return clone(row);
    }

    getCase(caseId){return clone(this.cases.get(String(caseId||''))||null);}

    registerAuthorityPolicy(actionId,definition={}){
      const id=String(actionId||'').trim();
      if(!id)throw new Error('AUTHORITY_POLICY_ID_REQUIRED');
      this.authorityPolicies.set(id,clone({
        actionId:id,
        proposerMinistries:Array.isArray(definition.proposerMinistries)?definition.proposerMinistries.map(String):[],
        reviewerMinistries:Array.isArray(definition.reviewerMinistries)?definition.reviewerMinistries.map(String):[],
        approverMinistries:Array.isArray(definition.approverMinistries)?definition.approverMinistries.map(String):[],
        executorMinistries:Array.isArray(definition.executorMinistries)?definition.executorMinistries.map(String):[],
        overrideMinistries:Array.isArray(definition.overrideMinistries)?definition.overrideMinistries.map(String):[],
        reviewRequired:definition.reviewRequired===true
      }));
      return clone(this.authorityPolicies.get(id));
    }

    authorizeCommand(command,actor={}){
      const actionId=String(command?.actionId||'');
      const policy=this.authorityPolicies.get(actionId);
      const actorMinistry=String(actor.ministryId||command?.sourceMinistryId||'');
      const action=this.decisionFramework?.getAction?.(actionId)||null;
      const approvalRequirements=Array.isArray(action?.approvalRequirements)?action.approvalRequirements:[];
      const priorApproval=command?.approvalOverride&&typeof command.approvalOverride==='object'?command.approvalOverride:null;
      if(priorApproval?.status==='APPROVED_BY_AUTHORITY'&&policy){
        const approver=String(priorApproval.approverMinistryId||'');
        const authorizedApprover=policy.approverMinistries.includes(approver)||policy.reviewerMinistries.includes(approver)||approver==='cabinet';
        const executorMinistry=String(actor.executorMinistryId||command?.stateOwnerMinistryId||'');
        const executorOk=!policy.executorMinistries.length||policy.executorMinistries.includes(executorMinistry);
        if(authorizedApprover&&executorOk){
          return {authorized:true,status:'AUTHORIZED',reason:'PRIOR_AUTHORITY_APPROVAL',actorMinistry,approverMinistryId:approver};
        }
      }
      if(!policy&&approvalRequirements.length){
        return {authorized:false,status:'REVIEW_REQUIRED',reason:'DECLARATIVE_APPROVAL_REQUIREMENTS_UNRESOLVED',actorMinistry,approvalRequirements:approvalRequirements.slice()};
      }
      if(!policy)return {authorized:true,status:'AUTO_AUTHORIZED',reason:'NO_AUTHORITY_POLICY_REGISTERED',actorMinistry};
      const executorMinistry=String(actor.executorMinistryId||command?.stateOwnerMinistryId||'');
      const executorOk=!policy.executorMinistries.length||policy.executorMinistries.includes(executorMinistry);
      if(!executorOk)return {authorized:false,status:'REJECTED',reason:'EXECUTOR_NOT_AUTHORIZED',actorMinistry,executorMinistry};
      const proposerOk=!policy.proposerMinistries.length||policy.proposerMinistries.includes(actorMinistry);
      if(!proposerOk)return {authorized:false,status:'REJECTED',reason:'PROPOSER_NOT_AUTHORIZED',actorMinistry};
      if(policy.reviewRequired)return {authorized:false,status:'REVIEW_REQUIRED',reason:'HUMAN_OR_CABINET_REVIEW_REQUIRED',actorMinistry};
      const approverOk=!policy.approverMinistries.length||policy.approverMinistries.includes(actorMinistry)||policy.approverMinistries.includes('cabinet');
      return approverOk
        ? {authorized:true,status:'AUTHORIZED',reason:'POLICY_MATCH',actorMinistry}
        : {authorized:false,status:'REJECTED',reason:'APPROVER_NOT_AUTHORIZED',actorMinistry};
    }

    registerArbitrationPolicy(scope,definition={}){
      const key=String(scope||'').trim()||'GLOBAL';
      this.arbitrationPolicies.set(key,clone(definition||{}));
      return clone(this.arbitrationPolicies.get(key));
    }

    resolveConflict(conflict={},options={}){
      const scope=String(conflict.scope||conflict.actionId||'GLOBAL');
      const policy=this.arbitrationPolicies.get(scope)||this.arbitrationPolicies.get('GLOBAL')||null;
      if(policy?.resolution&&['RETRY','REBASE','REJECT','ESCALATE'].includes(String(policy.resolution)))return {
        status:'RESOLVED_BY_POLICY',resolution:String(policy.resolution),scope,conflict:clone(conflict)
      };
      return {
        status:'ESCALATE',resolution:'ESCALATE',scope,
        target:options.escalationTarget||'cabinet',
        conflict:clone(conflict)
      };
    }

    _deliverEventTransport(event){
      try{this.bridge?.emitEvent?.(event.eventType,event);}catch(error){event.transportError=String(error?.message||error);this.metrics.failed+=1;}
      try{global.dispatchEvent?.(new CustomEvent(event.eventType,{detail:clone(event)}));}catch(error){event.browserEventError=String(error?.message||error);}
    }

    processEventOutbox(turn=this.lastTurn,limit=this.maxHistory){
      const processed=[];
      const n=Number.isFinite(Number(turn))?Number(turn):this.lastTurn;
      for(const row of this.eventOutbox.values()){
        if(processed.length>=Number(limit))break;
        if(!['PENDING','FAILED','DISPATCHING'].includes(String(row.status)))continue;
        if(Number(row.nextEligibleTurn??0)>n)continue;
        row.status='DISPATCHING';
        row.attempts=Number(row.attempts||0)+1;
        row.lastAttemptTurn=n;
        let failed=false;
        const subscriptions=[...this.eventSubscriptions.values()]
          .filter(s=>s.enabled!==false&&(s.eventType===row.event.eventType||s.eventType==='*'))
          .sort((a,b)=>Number(a.priority)-Number(b.priority)||String(a.ministryId).localeCompare(String(b.ministryId)));
        for(const sub of subscriptions){
          const deliveryKey=row.event.eventId+'::'+sub.ministryId;
          const delivery=this.eventDeliveryLedger.get(deliveryKey)||{
            eventId:row.event.eventId,ministryId:sub.ministryId,statusHistory:[],attempts:0
          };
          if(delivery.status==='DELIVERED')continue;
          delivery.attempts+=1;
          delivery.statusHistory.push({status:'PROCESSING',simulationTurn:n});
          try{
            if(sub.handler){
              const result=sub.handler(clone(row.event),{ministryId:sub.ministryId,simulationTurn:n,interoperability:this});
              if(result?.accepted===false)throw new Error(String(result.reason||'EVENT_HANDLER_REJECTED'));
              delivery.status='DELIVERED';
            }else{
              this.send(String(row.event.sourceMinistryId),sub.ministryId,'event.'+row.event.eventType,{
                event:clone(row.event)
              },{
                countryId:row.event.countryId,turn:n,messageType:MESSAGE_TYPES.STATE_UPDATE,
                correlationId:row.event.correlationId||row.event.eventId,causationId:row.event.eventId
              });
              delivery.status='DELIVERED';
            }
            delivery.statusHistory.push({status:'DELIVERED',simulationTurn:n});
          }catch(error){
            failed=true;
            delivery.status='FAILED';
            delivery.error=String(error?.message||error);
            delivery.statusHistory.push({status:'FAILED',simulationTurn:n});
          }
          this.eventDeliveryLedger.set(deliveryKey,delivery);
        }
          this._deliverEventTransport(row.event);
        const reactions=Array.isArray(row.reactionIds)&&row.reactionIds.length
          ?[]
          :this.evaluateCausalRules(row.event);
        if(reactions.length)row.reactionIds=reactions.map(r=>r.reactionId);
        row.status=failed?'FAILED':'DISPATCHED';
        row.completedTurn=failed?null:n;
        row.error=failed?row.error||'EVENT_SUBSCRIBER_FAILURE':null;
        if(failed)row.nextEligibleTurn=n+Math.max(1,Math.min(16,2**Math.min(4,row.attempts-1)));
        processed.push(clone(row));
      }
      return processed;
    }

    approveCommand(commandId,actor={}){
      const id=String(commandId||'');
      const row=this.commands.get(id);
      if(!row)throw new Error('COMMAND_NOT_FOUND');
      if(String(row.status)!=='REVIEW_REQUIRED'&&String(row.lifecycleStatus)!=='REVIEW_REQUIRED')return clone(row);
      const policy=this.authorityPolicies.get(String(row.actionId||''));
      if(!policy)throw new Error('AUTHORITY_POLICY_REQUIRED_FOR_REVIEW');
      const reviewer=String(actor.ministryId||actor.reviewerMinistryId||'');
      const canReview=policy.reviewerMinistries.includes(reviewer)||policy.approverMinistries.includes(reviewer)||reviewer==='cabinet';
      if(!canReview)throw new Error('REVIEWER_NOT_AUTHORIZED');
      const turn=Number.isFinite(Number(actor.turn))?Number(actor.turn):this.lastTurn;
      row.approval={
        ...(row.approval||{}),
        authorized:true,
        status:'APPROVED_BY_AUTHORITY',
        approverMinistryId:reviewer,
        approvedTurn:turn
      };
      row.lifecycleStatus='APPROVED';
      row.status='APPROVED';
      row.statusHistory.push({status:'APPROVED',simulationTurn:turn,reason:'AUTHORITY_REVIEW_COMPLETED'});
      return clone(row);
    }

    executeApprovedCommand(commandId,actor={}){
      const id=String(commandId||'');
      const row=this.commands.get(id);
      if(!row)throw new Error('COMMAND_NOT_FOUND');
      if(String(row.status)!=='APPROVED'||row.approval?.status!=='APPROVED_BY_AUTHORITY'){
        throw new Error('COMMAND_NOT_APPROVED');
      }
      return this.dispatchCommand(
        row.sourceMinistryId,
        row.actionId,
        row.countryId,
        clone(row.payload||{}),
        {
          turn:Number.isFinite(Number(actor.turn))?Number(actor.turn):row.simulationTurn,
          commandType:row.commandType,
          commandId:id,
          correlationId:row.correlationId,
          causationId:row.causationId,
          approvalOverride:clone(row.approval),
          approvingMinistryId:row.approval.approverMinistryId,
          executorMinistryId:actor.executorMinistryId||row.stateOwnerMinistryId,
          approvedExecution:true,
          provenance:clone(row.provenance||null)
        }
      );
    }

    _finalizePreparedCommand(prepared,options={}){
      const row=prepared?.row;
      const stateTransaction=prepared?.stateTransaction;
      const stagedEvents=Array.isArray(prepared?.stagedEvents)?prepared.stagedEvents:[];
      const turn=Number.isFinite(Number(prepared?.turn))?Number(prepared.turn):this.lastTurn;
      const owner=String(prepared?.ownerMinistry||row?.stateOwnerMinistryId||'');
      if(!row||!stateTransaction)throw new Error('PREPARED_COMMAND_INVALID');

      try{
        row.transaction=stateTransaction.commit();
        if(row.transaction?.status==='ALREADY_PROCESSED'){
          row.pendingCommit=false;
          row.status='ALREADY_PROCESSED';
          row.lifecycleStatus='VERIFIED';
          row.stateChanged=false;
          this.pendingCommands.delete(String(row.commandId));
          return clone(row);
        }

        row.pendingCommit=false;
        row.lifecycleStatus='COMMITTED';
        row.statusHistory.push({status:'COMMITTED',simulationTurn:turn});
        row.result=clone(prepared.result);
        row.status=prepared.result?.accepted===false?'FAILED':'APPLIED';
        row.stateChanged=Boolean(row.transaction?.changed);

        const authority=this.authority||global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
        const authoritativeDomainRevision=row.stateChanged
          ?(authority?.revision?.(row.countryId,owner)||row.transaction?.afterRevision||null)
          :null;
        if(authoritativeDomainRevision)row.stateRevisionAfter=authoritativeDomainRevision;

        if(row.stateChanged){
          row.requiresRepublish=true;
          this.dirtyPublications.set(snapshotKey(row.countryId,owner),{
            countryId:row.countryId,
            ministryId:owner,
            simulationTurn:turn,
            stateRevision:authoritativeDomainRevision,
            changedPaths:(row.transaction.operations||[]).map(op=>op.path).slice(0,64),
            causationId:row.commandId
          });
          this.emitEvent(EVENT_TYPES.MINISTRY_STATE_CHANGED,row.countryId,owner,{
            commandId:row.commandId,
            stateRevision:authoritativeDomainRevision,
            changedPaths:(row.transaction.operations||[]).map(op=>op.path)
          },{
            turn,
            causationId:row.commandId,
            stateRevision:authoritativeDomainRevision,
            deferDispatch:true
          });
        }

        for(const staged of stagedEvents){
          this.emitEvent(staged.eventType,row.countryId,owner,staged.payload,{
            ...staged.options,
            stateRevision:authoritativeDomainRevision,
            deferDispatch:true
          });
        }

        this.pendingCommands.delete(String(row.commandId));
        if(options.processEventOutbox===true)this.processEventOutbox(turn);
        row.lifecycleStatus='VERIFIED';
        row.statusHistory.push({
          status:'VERIFIED',
          simulationTurn:turn,
          reason:row.stateChanged?'STATE_AND_EVENT_OUTBOX_PERSISTED':'NO_STATE_CHANGE'
        });
        return clone(row);
      }catch(error){
        if(String(error?.message||error).startsWith('STATE_REVISION_CONFLICT:')){
          row.lifecycleStatus='CONFLICT';
          row.statusHistory.push({status:'CONFLICT',simulationTurn:turn,reason:String(error.message||error)});
          row.arbitration=this.resolveConflict({
            scope:row.actionId,
            actionId:row.actionId,
            countryId:row.countryId,
            commandId:row.commandId,
            reason:String(error.message||error)
          });
        }
        row.status='FAILED';
        row.result={error:String(error?.message||error)};
        row.statusHistory.push({status:'FAILED',simulationTurn:turn});
        this.metrics.failed+=1;
        this.pendingCommands.delete(String(row.commandId));
        return clone(row);
      }
    }

    commitPendingCommands(turn=this.lastTurn,options={}){
      const targetTurn=Number.isFinite(Number(turn))?Number(turn):this.lastTurn;
      const rows=[...this.pendingCommands.values()]
        .filter(row=>Number(row.turn)<=targetTurn)
        .sort((a,b)=>Number(a.turn)-Number(b.turn)||String(a.row.commandId).localeCompare(String(b.row.commandId)));
      const committed=[];
      for(const prepared of rows){
        committed.push(this._finalizePreparedCommand(prepared,options));
      }
      return committed;
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

      const existing=this.commands.get(commandId);
      if(existing&&(
        String(existing.status)==='APPLIED' ||
        String(existing.lifecycleStatus)==='VERIFIED' ||
        String(existing.lifecycleStatus)==='COMMITTED'
      )){
        return clone({...existing,duplicate:true,status:'ALREADY_PROCESSED'});
      }
      if(existing&&(
        String(existing.status)==='REVIEW_REQUIRED' ||
        String(existing.lifecycleStatus)==='REVIEW_REQUIRED'
      )){
        return clone({...existing,duplicate:true,status:'PENDING_APPROVAL'});
      }
      if(existing&&String(existing.lifecycleStatus)==='APPROVED'&&options.approvedExecution!==true){
        return clone({...existing,duplicate:true,status:'PENDING_APPROVAL'});
      }
      if(existing)this.commands.delete(commandId);

      const commandType=String(options.commandType||actionId||'');
      const handler=this.commandHandlers.get(commandType)||null;
      const action=this.decisionFramework?.getAction?.(String(actionId||''))||null;
      if(handler && !this.stateTransaction && !global.OmegaMinistryStateTransaction){
        throw new Error('AUTHORITATIVE_STATE_TRANSACTION_UNAVAILABLE');
      }
      if(options.ownerMinistry&&handler&&String(options.ownerMinistry)!==handler.ownerMinistry)throw new Error('COMMAND_OWNER_MISMATCH');

      const command=Object.freeze({
        schemaVersion:2,
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
        approvalOverride:options.approvalOverride?clone(options.approvalOverride):null,
        provenance:clone(options.provenance||null)
      });

      const row={
        ...clone(command),
        status:'CREATED',
        lifecycleStatus:'PROPOSED',
        statusHistory:[{status:'PROPOSED',simulationTurn:turn}],
        result:null,
        requiresRepublish:false,
        approval:null,
        transaction:null
      };
      this.commands.set(commandId,row);
      this.metrics.commands+=1;

      const transition=(status,reason=null)=>{
        row.lifecycleStatus=String(status);
        row.statusHistory.push({status:row.lifecycleStatus,simulationTurn:turn,reason});
      };

      if(!handler){
        transition('VALIDATED','NO_EXECUTION_HANDLER_REGISTERED');
        row.status='UNHANDLED';
        row.statusHistory.push({status:'UNHANDLED',simulationTurn:turn,reason:'AUTHORITATIVE_HANDLER_NOT_REGISTERED'});
        this._emit('OMEGA_COMMAND_UNHANDLED',{commandId,commandType,sourceMinistryId:source,countryId},turn);
        return clone(row);
      }

      try{
        transition('VALIDATED');
        const approval=this.authorizeCommand(command,{
          ministryId:options.approvingMinistryId||source,
          executorMinistryId:options.executorMinistryId||command.stateOwnerMinistryId
        });
        row.approval=clone(approval);
        transition(approval.authorized?'APPROVED':approval.status,approval.reason);
        if(!approval.authorized){
          row.status=approval.status;
          row.requiresRepublish=false;
          if(approval.status==='REVIEW_REQUIRED'){
            row.caseId=this.createCase({
              caseId:'COMMAND-REVIEW-'+commandId,
              type:'COMMAND_AUTHORIZATION_REVIEW',
              workflowId:options.workflowId||null,
              countryId:country,
              ownerMinistry:'cabinet',
              participants:[source,handler.ownerMinistry],
              turn,
              correlationId:command.correlationId,
              causationId:command.causationId,
              context:{commandId,actionId:String(actionId||''),approvalRequirements:clone(approval.approvalRequirements||[])}
            }).caseId;
          }
          return clone(row);
        }
        transition('AUTHORIZED',approval.reason);

        const stagedEvents=[];
        transition('EXECUTING');
        const transactionFactory=this.stateTransaction||global.OmegaMinistryStateTransaction||null;
        const authority=this.authority||global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
        const stateTransaction=transactionFactory?.create
          ? transactionFactory.create(handler.ownerMinistry,country,turn,commandId,authority)
          : null;
        if(!stateTransaction)throw new Error('AUTHORITATIVE_STATE_TRANSACTION_UNAVAILABLE');

        const result=handler.handler(deepFreeze(clone(command)),{
          countryId:country,
          simulationTurn:turn,
          stateProvider:this.provider,
          stateTransaction,
          emitEvent:(eventType,eventPayload={},eventOptions={})=>{
            stagedEvents.push({
              eventType,payload:clone(eventPayload),
              options:{...clone(eventOptions),turn,causationId:commandId}
            });
            return {staged:true,eventType:String(eventType)};
          }
        });

        if(result?.accepted!==false){
          for(const staged of stagedEvents){
            if(!Object.prototype.hasOwnProperty.call(EVENT_TYPES,String(staged.eventType))){
              throw new Error('NON_CANONICAL_EVENT:'+String(staged.eventType));
            }
          }

          row.result=clone(result);

          const prepared={
            row,
            stateTransaction,
            stagedEvents:clone(stagedEvents),
            result:clone(result),
            turn,
            ownerMinistry:handler.ownerMinistry
          };

          if(options.deferCommit===true){
            row.lifecycleStatus='READY_TO_COMMIT';
            row.status='STAGED';
            row.pendingCommit=true;
            row.statusHistory.push({status:'READY_TO_COMMIT',simulationTurn:turn});
            this.pendingCommands.set(commandId,prepared);
            return clone(row);
          }

          return this._finalizePreparedCommand(prepared,{
            processEventOutbox:options.deferEventDispatch!==true
          });
        }else{
          stateTransaction.rollback();
          row.result=clone(result);
          row.status='FAILED';
          row.lifecycleStatus='FAILED';
          row.statusHistory.push({status:'FAILED',simulationTurn:turn,reason:'HANDLER_REJECTED'});
          this.pendingCommands.delete(commandId);
          return clone(row);
        }
      }catch(error){
        if(String(error?.message||error).startsWith('STATE_REVISION_CONFLICT:')){
          transition('CONFLICT',String(error.message));
          row.arbitration=this.resolveConflict({
            scope:command.actionId,actionId:command.actionId,countryId:country,
            commandId,reason:String(error.message)
          });
        }
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
      const eventId=String(options.eventId||('OMEGA-EVT-'+String(turn)+'-'+String(++this._eventSequence)));
      if(this.events.has(eventId))return clone(this.events.get(eventId));

      const event={
        schemaVersion:2,eventId,eventType:type,countryId:country,
        sourceMinistryId:source,simulationTurn:turn,
        causationId:options.causationId?String(options.causationId):null,
        correlationId:options.correlationId?String(options.correlationId):null,
        stateRevision:options.stateRevision??this.snapshots.get(snapshotKey(country,source))?.stateRevision??null,
        payload:clone(payload),
        provenance:clone(options.provenance||null),
        timestamp:Date.now(),timestampIsTelemetry:true
      };
      this.events.set(eventId,event);
      this.eventOutbox.set(eventId,{
        event:clone(event),status:'PENDING',attempts:0,lastAttemptTurn:null,nextEligibleTurn:turn,
        completedTurn:null,error:null,reactionIds:[]
      });
      this.metrics.events+=1;
      this._invalidateKnowledgeCache();

      if(options.deferDispatch!==true)this.processEventOutbox(turn);
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

    getDirtyPublications(countryId=null,ministryId=null){
      const out=[];
      const c=countryId?String(countryId).trim().toUpperCase():null;
      for(const [key,row] of this.dirtyPublications.entries()){
        if(c&&row.countryId!==c)continue;
        if(ministryId&&row.ministryId!==String(ministryId))continue;
        out.push(clone(row));
      }
      return out;
    }

    consumeDirtyPublication(countryId,ministryId){
      const key=snapshotKey(String(countryId||'').trim().toUpperCase(),String(ministryId||''));
      const row=this.dirtyPublications.get(key)||null;
      if(row)this.dirtyPublications.delete(key);
      return row?clone(row):null;
    }

    getEventLog(options={}){
      const from=Number.isFinite(Number(options.fromTurn))?Number(options.fromTurn):-Infinity;
      const to=Number.isFinite(Number(options.toTurn))?Number(options.toTurn):Infinity;
      const country=options.countryId?String(options.countryId).trim().toUpperCase():null;
      return [...this.events.values()]
        .filter(event=>(country===null||event.countryId===country)&&Number(event.simulationTurn)>=from&&Number(event.simulationTurn)<=to)
        .sort((a,b)=>Number(a.simulationTurn)-Number(b.simulationTurn)||String(a.eventId).localeCompare(String(b.eventId)))
        .map(event=>clone(event));
    }

    replayEvents(options={}){
      const events=this.getEventLog(options);
      return {
        mode:'REPLAY_READONLY',
        fromTurn:options.fromTurn??null,
        toTurn:options.toTurn??null,
        countryId:options.countryId?String(options.countryId).trim().toUpperCase():null,
        eventCount:events.length,
        events
      };
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
      const cId=countryId?String(countryId).trim().toUpperCase():null;
      const budgetRequestCount=cId
        ? this._getBudgetRequestsForCountry(cId).length
        : 0;
      const projectSignalCount=cId?this._getProjectsForCountry(cId).length:0;
      const constraintCount=cId?[...this.requestLedger.entries()].reduce((n,[key,list])=>n+(String(key).startsWith('CONSTRAINT:'+cId+':')&&Array.isArray(list)?list.length:0),0):0;
      const alertCount=cId?[...this.requestLedger.entries()].reduce((n,[key,list])=>n+(String(key).startsWith('ALERT:'+cId+':')&&Array.isArray(list)?list.length:0),0):0;
      const pendingRequestCount=cId?this.getPendingRequests(cId).length:0;
      const unresolvedCount=[...this.requestLedger.values()].filter(row=>row?.countryId===cId && !['RESPONDED','REJECTED','EXPIRED','FAILED'].includes(String(row?.status||''))).length;
      const behaviorPass=this.metrics.sent>0&&this.metrics.delivered===this.metrics.sent&&this.metrics.dropped===0&&this.metrics.failed===0;
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
          projects:projectSignalCount,
          constraints:constraintCount,
          alerts:alertCount,
          unresolvedRequests:unresolvedCount
        },
        requests:{
          pending:pendingRequestCount,
          total:this.requestLedger.size,
          unresolved:unresolvedCount
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
        authority:this.authority?.diagnostics?.()||null,
        knowledgeContract:{version:MINISTRY_KNOWLEDGE_CONTRACT.VERSION||null,ministries:MINISTRY_KNOWLEDGE_CONTRACT.size?.()||this.ids.length},
        republish:{dirty:this.dirtyPublications.size},
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
          event:this._eventSequence,command:this._commandSequence,
          reaction:this._reactionSequence,case:this._caseSequence
        },
        metrics:clone(this.metrics),
        inboxes,snapshots,deliveryLedger:delivery,requestLedger:requests,
        events,commands,
        eventOutbox:clone(Object.fromEntries(this.eventOutbox)),
        eventDeliveryLedger:clone(Object.fromEntries(this.eventDeliveryLedger)),
        reactionQueue:clone(this.reactionQueue),
        cases:clone(Object.fromEntries(this.cases)),
        pendingCommands:[...this.pendingCommands.values()].map(p=>({
          commandId:p.row.commandId,
          turn:p.turn,
          status:p.row.status,
          lifecycleStatus:p.row.lifecycleStatus,
          ownerMinistry:p.ownerMinistry,
          countryId:p.row.countryId,
          expectedRevision:p.stateTransaction?.expectedRevision??null,
          operations:clone(p.stateTransaction?.operations||[]),
          stagedEvents:clone(p.stagedEvents||[]),
          result:clone(p.result)
        })),
        dirtyPublications:clone(Object.fromEntries(this.dirtyPublications)),
        authorityState:this.authority?.exportState?.()||null
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
      this._reactionSequence=number(state.sequences?.reaction)||0;
      this._caseSequence=number(state.sequences?.case)||0;
      this.metrics={...this.metrics,...clone(state.metrics||{})};
      for(const id of this.ids)this.inboxes.set(id,clone(state.inboxes?.[id]||[]).slice(0,this.maxInbox));
      this.snapshots=new Map(Object.entries(state.snapshots||{}).map(([k,v])=>[k,clone(v)]));
      this.deliveryLedger=new Map(Object.entries(state.deliveryLedger||{}).map(([k,v])=>[k,clone(v)]));
      this.requestLedger=new Map(Object.entries(state.requestLedger||{}).map(([k,v])=>[k,clone(v)]));
      this.events=new Map(Object.entries(state.events||{}).map(([k,v])=>[k,clone(v)]));
      this.eventOutbox=new Map(Object.entries(state.eventOutbox||{}).map(([k,v])=>[k,clone(v)]));
      this.eventDeliveryLedger=new Map(Object.entries(state.eventDeliveryLedger||{}).map(([k,v])=>[k,clone(v)]));
      this.reactionQueue=clone(state.reactionQueue||[]);
      this.cases=new Map(Object.entries(state.cases||{}).map(([k,v])=>[k,clone(v)]));
      this.pendingCommands=new Map();
      this.commands=new Map(Object.entries(state.commands||{}).map(([k,v])=>[k,clone(v)]));
      const pendingRows=Array.isArray(state.pendingCommands)?state.pendingCommands:[];
      const authority=this.authority||global.OmegaAuthoritativeStateAuthority?.instance||global.Omega?.AuthoritativeStateAuthority?.instance||null;
      const transactionFactory=this.stateTransaction||global.OmegaMinistryStateTransaction||null;
      for(const pending of pendingRows){
        try{
          const row=this.commands.get(String(pending.commandId));
          if(!row||row.status!=='STAGED')continue;
          const tx=transactionFactory?.create?.(
            String(pending.ownerMinistry||row.stateOwnerMinistryId||''),
            String(pending.countryId||row.countryId||''),
            Number(pending.turn)||row.simulationTurn||this.lastTurn,
            String(pending.commandId),
            authority
          );
          if(!tx)continue;
          if(pending.expectedRevision!==undefined)tx.expectedRevision=pending.expectedRevision;
          tx.operations=clone(pending.operations||[]);
          this.pendingCommands.set(String(pending.commandId),{
            row,
            stateTransaction:tx,
            stagedEvents:clone(pending.stagedEvents||[]),
            result:clone(pending.result),
            turn:Number(pending.turn)||row.simulationTurn||this.lastTurn,
            ownerMinistry:String(pending.ownerMinistry||row.stateOwnerMinistryId||'')
          });
        }catch(_){}
      }
      this.dirtyPublications=new Map(Object.entries(state.dirtyPublications||{}).map(([k,v])=>[k,clone(v)]));
      if(state.authorityState&&this.authority?.importState)this.authority.importState(state.authorityState);
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
    coordinateGovernment:(...args)=>apiInstance.coordinateGovernment(...args),
    evaluateAction:(...args)=>apiInstance.evaluateAction(...args),
    registerAction:(...args)=>apiInstance.registerAction(...args),
    registerMessageProtocol:(...args)=>apiInstance.registerMessageProtocol(...args),
    subscribeEvent:(...args)=>apiInstance.subscribeEvent(...args),
    unsubscribeEvent:(...args)=>apiInstance.unsubscribeEvent(...args),
    registerCausalRule:(...args)=>apiInstance.registerCausalRule(...args),
    evaluateCausalRules:(...args)=>apiInstance.evaluateCausalRules(...args),
    processReactionQueue:(...args)=>apiInstance.processReactionQueue(...args),
    registerWorkflow:(...args)=>apiInstance.registerWorkflow(...args),
    createCase:(...args)=>apiInstance.createCase(...args),
    advanceCase:(...args)=>apiInstance.advanceCase(...args),
    getCase:(...args)=>apiInstance.getCase(...args),
    registerAuthorityPolicy:(...args)=>apiInstance.registerAuthorityPolicy(...args),
    approveCommand:(...args)=>apiInstance.approveCommand(...args),
    executeApprovedCommand:(...args)=>apiInstance.executeApprovedCommand(...args),
    authorizeCommand:(...args)=>apiInstance.authorizeCommand(...args),
    registerArbitrationPolicy:(...args)=>apiInstance.registerArbitrationPolicy(...args),
    resolveConflict:(...args)=>apiInstance.resolveConflict(...args),
    processEventOutbox:(...args)=>apiInstance.processEventOutbox(...args),
    commitPendingCommands:(...args)=>apiInstance.commitPendingCommands(...args),
    getEventLog:(...args)=>apiInstance.getEventLog(...args),
    replayEvents:(...args)=>apiInstance.replayEvents(...args),
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
    getDirtyPublications:(...args)=>apiInstance.getDirtyPublications(...args),
    consumeDirtyPublication:(...args)=>apiInstance.consumeDirtyPublication(...args),
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
