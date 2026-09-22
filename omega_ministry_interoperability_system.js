/*
 * OMEGA GOVERNMENT INTEROPERABILITY SYSTEM v1.0.0
 *
 * Purpose:
 *   - Provide a full 17 x 17 directed ministry communication topology.
 *   - Keep ministry engines independent while giving every ministry a
 *     compact, validated national situational picture.
 *   - Track public ministry state, budget requests, project signals,
 *     constraints, alerts, requests and responses.
 *   - Route real messages through the kernel messaging substrate when
 *     available; never let one ministry directly mutate another ministry.
 *
 * Architecture:
 *   17 domain engines
 *        -> interoperability system
 *        -> public state exchange + bilateral mesh
 *        -> target ministry inbox / decision context
 *
 * Unknown data stays unknown. This module never invents financial,
 * diplomatic, project, resource or operational values.
 */
(function(global){
  'use strict';

  const VERSION = '1.0.0';
  const IDS = Object.freeze([
    'cabinet','defense','military','finance','economy','trade','foreign',
    'intelligence','interior','transport','resource','health','education',
    'technology','projects','culture','statistics'
  ]);
  const ID_SET = new Set(IDS);

  const MESSAGE_TYPES = Object.freeze({
    STATE_UPDATE:'STATE_UPDATE',
    POLICY_UPDATE:'POLICY_UPDATE',
    REQUEST:'REQUEST',
    RESPONSE:'RESPONSE',
    ALERT:'ALERT',
    ACK:'ACK',
    BUDGET_REQUEST:'BUDGET_REQUEST',
    PROJECT_STATUS:'PROJECT_STATUS',
    CONSTRAINT_UPDATE:'CONSTRAINT_UPDATE',
    FISCAL_STATUS:'FISCAL_STATUS'
  });

  const CONNECTION_STATES = Object.freeze({
    READY:'READY',
    ACTIVE:'ACTIVE',
    DEGRADED:'DEGRADED',
    BLOCKED:'BLOCKED'
  });

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi,
    Number.isFinite(Number(n)) ? Number(n) : lo));

  function clone(value, seen = new WeakMap()){
    if(value === null || typeof value !== 'object') return value;
    if(seen.has(value)) return seen.get(value);
    if(Array.isArray(value)){
      const out=[]; seen.set(value,out);
      for(const item of value) out.push(clone(item,seen));
      return out;
    }
    if(value instanceof Map){
      const out={}; seen.set(value,out);
      for(const [k,v] of value.entries()) out[String(k)] = clone(v,seen);
      return out;
    }
    if(value instanceof Set){
      const out=[]; seen.set(value,out);
      for(const v of value.values()) out.push(clone(v,seen));
      return out;
    }
    const out={}; seen.set(value,out);
    for(const key of Object.keys(value)){
      if(key==='__proto__' || key==='constructor') continue;
      const v=value[key];
      if(v!==undefined && typeof v!=='function') out[key]=clone(v,seen);
    }
    return out;
  }

  function number(value){
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    if(typeof value === 'string' && value.trim()!=='' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function readPath(root,path){
    if(root==null || !path) return undefined;
    let cur=root;
    for(const part of String(path).split('.')){
      if(cur==null) return undefined;
      if(!Object.prototype.hasOwnProperty.call(Object(cur),part)) return undefined;
      cur=cur[part];
    }
    return cur;
  }

  function first(root,paths){
    for(const path of paths){
      const value=readPath(root,path);
      if(value!==undefined && value!==null) return value;
    }
    return null;
  }

  function collectionCount(value){
    if(Array.isArray(value)) return value.length;
    if(value instanceof Map || value instanceof Set) return value.size;
    if(value && typeof value==='object') return Object.keys(value).length;
    return null;
  }

  function toArray(value){
    if(Array.isArray(value)) return clone(value);
    if(value && typeof value.toArray==='function'){
      try{ return clone(value.toArray()); }catch(_){}
    }
    if(value instanceof Map) return [...value.values()].map(clone);
    if(value instanceof Set) return [...value.values()].map(clone);
    if(value && typeof value==='object') return Object.values(value).map(clone);
    return [];
  }

  function now(){ return Date.now(); }

  class MinistryInteroperabilitySystem{
    constructor(){
      this.version=VERSION;
      this.ids=IDS.slice();
      this.messageTypes=MESSAGE_TYPES;
      this.connections=new Map();
      this.inboxes=new Map();
      this.snapshots=new Map();
      this.requests=new Map();
      this.alerts=new Map();
      this.budgetRequests=new Map();
      this.projectSignals=new Map();
      this.constraints=new Map();
      this.fiscalReports=new Map();
      this.routeSequence=0;
      this.attached=false;
      this.bridge=null;
      this.messaging=null;
      this.lastTurn=0;
      this.initialized=false;
      this.metrics={
        sent:0,received:0,dropped:0,rejected:0,
        requests:0,responses:0,alerts:0,statePublications:0
      };
      this._buildFullMesh();
    }

    _buildFullMesh(){
      this.connections.clear();
      this.inboxes.clear();
      for(const source of IDS){
        this.inboxes.set(source,[]);
        for(const target of IDS){
          const id=source+'->'+target;
          this.connections.set(id,{
            id,source,target,enabled:true,
            state:CONNECTION_STATES.READY,
            protocolVersion:1,
            messagesSent:0,
            messagesReceived:0,
            messagesDropped:0,
            lastSentTurn:null,
            lastReceivedTurn:null
          });
        }
      }
    }

    init(kernelOrBridge){
      this.bridge=kernelOrBridge || this.bridge || null;
      try{
        this.messaging=this.bridge?.getService?.('MinistryMessaging') || null;
      }catch(_){ this.messaging=null; }
      this.attached=true;
      this.initialized=true;
      return this.verifyFullMesh().ok;
    }

    verifyFullMesh(){
      const expected=IDS.length*IDS.length;
      const missing=[];
      const bad=[];
      for(const source of IDS){
        for(const target of IDS){
          const route=this.connections.get(source+'->'+target);
          if(!route) missing.push(source+'->'+target);
          else if(route.source!==source || route.target!==target || route.enabled!==true) bad.push(route.id);
        }
      }
      return {
        ok:missing.length===0 && bad.length===0 && this.connections.size===expected,
        ministries:IDS.length,
        connectionCells:this.connections.size,
        expectedConnections:expected,
        crossMinistryConnections:IDS.length*(IDS.length-1),
        loopbackConnections:IDS.length,
        missing,bad
      };
    }

    _route(source,target){
      return this.connections.get(String(source)+'->'+String(target)) || null;
    }

    _validateIds(source,target){
      return ID_SET.has(String(source)) && ID_SET.has(String(target));
    }

    _nextMessageId(source,target,turn){
      this.routeSequence+=1;
      return 'OMI-'+String(turn??this.lastTurn??0)+'-'+String(this.routeSequence)+'-'+source+'-'+target;
    }

    _recordRouteSend(route,turn){
      if(!route) return;
      route.messagesSent+=1;
      route.lastSentTurn=turn??null;
      route.state=CONNECTION_STATES.ACTIVE;
    }

    _recordRouteReceive(route,turn){
      if(!route) return;
      route.messagesReceived+=1;
      route.lastReceivedTurn=turn??null;
      route.state=CONNECTION_STATES.ACTIVE;
    }

    _recordRouteDrop(route){
      if(!route) return;
      route.messagesDropped+=1;
      if(route.messagesDropped>0) route.state=CONNECTION_STATES.DEGRADED;
    }

    _emit(topic,payload){
      try{
        this.bridge?.emitEvent?.(topic,payload);
      }catch(_){}
      try{
        global.dispatchEvent?.(new CustomEvent(topic,{detail:payload}));
      }catch(_){}
    }

    createPort(source){
      const sourceId=String(source);
      if(!ID_SET.has(sourceId)) throw new Error('UNKNOWN_MINISTRY:'+sourceId);
      const self=this;
      return Object.freeze({
        ministryId:sourceId,
        send(target,topic,payload={},options={}){
          return self.send(sourceId,target,topic,payload,options);
        },
        broadcast(targets,topic,payload={},options={}){
          return self.broadcast(sourceId,targets,topic,payload,options);
        },
        request(target,topic,payload={},options={}){
          return self.request(sourceId,target,topic,payload,options);
        },
        reply(message,topic,payload={},options={}){
          return self.reply(sourceId,message,topic,payload,options);
        },
        getPeer(target){
          return self.getPeerState(sourceId,target);
        },
        getNationalBriefing(){
          return self.getMinistryBriefing(sourceId);
        },
        getDecisionContext(action,options={}){
          return self.evaluateAction(sourceId,action,options);
        }
      });
    }

    send(source,target,topic,payload={},options={}){
      source=String(source); target=String(target);
      if(!this._validateIds(source,target)){
        this.metrics.rejected+=1;
        throw new Error('MESH_ROUTE_ID_INVALID');
      }
      const route=this._route(source,target);
      if(!route || route.enabled!==true){
        this.metrics.rejected+=1;
        throw new Error('MESH_ROUTE_UNAVAILABLE');
      }
      const turn=Number.isFinite(Number(options.turn)) ? Number(options.turn) : this.lastTurn;
      const message=Object.freeze({
        protocolVersion:1,
        messageId:String(options.messageId||this._nextMessageId(source,target,turn)),
        source,
        target,
        sourceMinistryId:source,
        targetMinistryId:target,
        topic:String(topic||'MINISTRY_INFORMATION'),
        messageType:String(options.messageType||MESSAGE_TYPES.STATE_UPDATE),
        priority:String(options.priority||'NORMAL'),
        turn,
        correlationId:options.correlationId ? String(options.correlationId) : null,
        causationId:options.causationId ? String(options.causationId) : null,
        countryId:options.countryId ? String(options.countryId) : null,
        payload:clone(payload),
        timestamp:now(),
        expiry:Number.isFinite(Number(options.expiry)) ? Number(options.expiry) : 0
      });

      this._recordRouteSend(route,turn);
      this.metrics.sent+=1;

      let delivered=false;
      if(this.messaging && typeof this.messaging.send==='function'){
        try{
          this.messaging.send(source,target,message.topic,{
            priority:message.priority,
            data:message
          });
          delivered=true;
        }catch(_){}
      }
      if(!delivered){
        const inbox=this.inboxes.get(target);
        if(inbox){
          inbox.push(message);
          while(inbox.length>1000) inbox.shift();
          delivered=true;
        }
      }

      if(!delivered){
        this._recordRouteDrop(route);
        this.metrics.dropped+=1;
        throw new Error('MESH_DELIVERY_FAILED:'+message.messageId);
      }

      if(message.messageType===MESSAGE_TYPES.REQUEST) this.metrics.requests+=1;
      if(message.messageType===MESSAGE_TYPES.RESPONSE) this.metrics.responses+=1;
      if(message.messageType===MESSAGE_TYPES.ALERT) this.metrics.alerts+=1;

      this._emit('OMEGA_MINISTRY_MESH_MESSAGE_SENT',message);
      return message;
    }

    broadcast(source,targets,topic,payload={},options={}){
      const list=Array.isArray(targets) ? targets : IDS.filter(id=>id!==String(source));
      return list.map(target=>{
        try{return this.send(source,target,topic,payload,options);}
        catch(error){return {target,error:String(error?.message||error)};}
      });
    }

    request(source,target,topic,payload={},options={}){
      const correlationId=String(options.correlationId||(
        'REQ-'+this._nextMessageId(source,target,options.turn)
      ));
      const message=this.send(source,target,topic,payload,{
        ...options,
        messageType:MESSAGE_TYPES.REQUEST,
        correlationId
      });
      this.requests.set(correlationId,{
        correlationId,source,target,topic,
        status:'PENDING',
        createdTurn:message.turn,
        createdAt:message.timestamp,
        responseMessageId:null
      });
      return message;
    }

    reply(source,requestMessage,topic,payload={},options={}){
      const request=unwrapMessage(requestMessage);
      if(!request || request.target!==source) throw new Error('RESPONSE_SOURCE_MISMATCH');
      const target=String(request.source);
      const correlationId=request.correlationId||request.messageId;
      const response=this.send(source,target,topic,payload,{
        ...options,
        messageType:MESSAGE_TYPES.RESPONSE,
        correlationId,
        causationId:request.messageId
      });
      const pending=this.requests.get(correlationId);
      if(pending){
        pending.status='RESPONDED';
        pending.responseMessageId=response.messageId;
      }
      return response;
    }

    acceptMessage(target,message){
      const targetId=String(target);
      const unwrapped=unwrapMessage(message);
      if(!ID_SET.has(targetId) || !unwrapped){
        this.metrics.rejected+=1;
        return {ok:false,reason:'INVALID_MESSAGE'};
      }
      if(unwrapped.target!==targetId || !ID_SET.has(String(unwrapped.source))){
        this.metrics.rejected+=1;
        return {ok:false,reason:'MESSAGE_ROUTE_VALIDATION_FAILED'};
      }
      const route=this._route(unwrapped.source,targetId);
      if(!route){
        this.metrics.rejected+=1;
        return {ok:false,reason:'ROUTE_NOT_FOUND'};
      }
      this._recordRouteReceive(route,unwrapped.turn);
      this.metrics.received+=1;
      if(unwrapped.correlationId && unwrapped.messageType===MESSAGE_TYPES.RESPONSE){
        const req=this.requests.get(unwrapped.correlationId);
        if(req){
          req.status='RESPONDED';
          req.responseMessageId=unwrapped.messageId;
        }
      }

      const bucket=this._knowledgeBucket(targetId);
      if(unwrapped.messageType===MESSAGE_TYPES.BUDGET_REQUEST){
        this._recordBudgetRequest(unwrapped);
      }else if(unwrapped.messageType===MESSAGE_TYPES.PROJECT_STATUS){
        this._recordProjectSignal(unwrapped);
      }else if(unwrapped.messageType===MESSAGE_TYPES.CONSTRAINT_UPDATE){
        this._recordConstraint(unwrapped);
      }else if(unwrapped.messageType===MESSAGE_TYPES.FISCAL_STATUS){
        this._recordFiscalStatus(unwrapped);
      }else if(unwrapped.messageType===MESSAGE_TYPES.ALERT){
        this._recordAlert(unwrapped);
      }

      bucket.inbox.push(clone(unwrapped));
      while(bucket.inbox.length>250) bucket.inbox.shift();

      this._emit('OMEGA_MINISTRY_MESH_MESSAGE_RECEIVED',unwrapped);
      return {ok:true,message:clone(unwrapped)};
    }

    _knowledgeBucket(ministryId){
      if(!this._ministryKnowledge) this._ministryKnowledge=new Map();
      if(!this._ministryKnowledge.has(ministryId)){
        this._ministryKnowledge.set(ministryId,{
          inbox:[],
          peerFacts:new Map(),
          sent:[],
          received:[]
        });
      }
      return this._ministryKnowledge.get(ministryId);
    }

    getMinistryInbox(ministryId){
      const bucket=this._knowledgeBucket(String(ministryId));
      return clone(bucket.inbox);
    }

    _recordBudgetRequest(message){
      const source=message.source;
      const list=this.budgetRequests.get(source)||[];
      list.push({
        messageId:message.messageId,
        ministryId:source,
        turn:message.turn,
        amount:number(message.payload?.amount),
        currency:message.payload?.currency??null,
        purpose:message.payload?.purpose??null,
        urgency:message.payload?.urgency??'NORMAL',
        status:message.payload?.status??'OPEN',
        evidence:clone(message.payload?.evidence||null)
      });
      while(list.length>100) list.shift();
      this.budgetRequests.set(source,list);
    }

    _recordProjectSignal(message){
      const source=message.source;
      const list=this.projectSignals.get(source)||[];
      list.push({
        messageId:message.messageId,
        ministryId:source,
        turn:message.turn,
        projectId:message.payload?.projectId??null,
        projectCount:number(message.payload?.projectCount),
        activeCount:number(message.payload?.activeCount),
        committedBudget:number(message.payload?.committedBudget),
        status:message.payload?.status??null,
        blockers:clone(message.payload?.blockers||[])
      });
      while(list.length>100) list.shift();
      this.projectSignals.set(source,list);
    }

    _recordFiscalStatus(message){
      const source=message.source;
      this.fiscalReports.set(source,{
        messageId:message.messageId,
        ministryId:source,
        turn:message.turn,
        budget:number(message.payload?.budget),
        allocated:number(message.payload?.allocated),
        committed:number(message.payload?.committed),
        available:number(message.payload?.available),
        currency:message.payload?.currency??null,
        evidence:clone(message.payload?.evidence||null)
      });
    }

    _recordConstraint(message){
      const source=message.source;
      const list=this.constraints.get(source)||[];
      list.push({
        messageId:message.messageId,
        ministryId:source,
        turn:message.turn,
        severity:String(message.payload?.severity||'INFO'),
        code:message.payload?.code??null,
        description:message.payload?.description??null,
        blocking:message.payload?.blocking===true,
        evidence:clone(message.payload?.evidence||null)
      });
      while(list.length>100) list.shift();
      this.constraints.set(source,list);
    }

    _recordAlert(message){
      const source=message.source;
      const list=this.alerts.get(source)||[];
      list.push({
        messageId:message.messageId,
        ministryId:source,
        turn:message.turn,
        severity:String(message.priority||'NORMAL'),
        topic:message.topic,
        payload:clone(message.payload)
      });
      while(list.length>100) list.shift();
      this.alerts.set(source,list);
    }

    publishState(ministryId,packet={}){
      ministryId=String(ministryId);
      if(!ID_SET.has(ministryId)) throw new Error('UNKNOWN_MINISTRY:'+ministryId);

      const execution=packet.domainExecution||{};
      const context=packet.context||{};
      const store=packet.store||null;
      const runtimeState=packet.runtimeState||{};
      const observed=execution.observedInputs||{};

      const fiscal={
        budget:number(first(observed,[
          'finance.budget','economy.budget','projects.budget',
          'defense.budget','transport.budget'
        ])),
        spending:number(first(observed,[
          'finance.spending','projects.budget','defense.spending'
        ])),
        reserves:number(first(observed,['finance.reserves','economy.reserves'])),
        revenue:number(first(observed,['finance.taxRevenue','finance.revenue','economy.revenue'])),
        debt:number(first(observed,['economy.debt','finance.debt'])),
        sourceFields:Object.keys(observed).filter(k=>/budget|spending|reserve|revenue|debt/i.test(k))
      };

      const facts={};
      for(const [key,value] of Object.entries(observed)){
        if(/relation|treat|sanction|logistic|threat|readiness|procurement|production|inflation|unemployment|enrollment|research|innovation|hospital|stability|corruption|security/i.test(key)){
          facts[key]=clone(value);
        }
      }

      const projectRegistry=first(observed,['projects.registry']);
      const latestProjectSignal=this.projectSignals.get(ministryId)?.slice(-1)[0]||null;
      const projects={
        knownCount:collectionCount(projectRegistry) ?? latestProjectSignal?.projectCount ?? null,
        activeCount:latestProjectSignal?.activeCount ?? null,
        committedBudget:latestProjectSignal?.committedBudget ?? null,
        blockers:clone(latestProjectSignal?.blockers||[])
      };

      const policies=toArray(store?.policies);
      const decisions=toArray(store?.decisions);
      const needs=clone(store?.needsModel||null);
      const reportedFiscal=this.fiscalReports.get(ministryId)||null;
      if(reportedFiscal){
        if(reportedFiscal.budget!==null) fiscal.budget=reportedFiscal.budget;
        if(reportedFiscal.allocated!==null) fiscal.allocated=reportedFiscal.allocated;
        if(reportedFiscal.committed!==null) fiscal.committed=reportedFiscal.committed;
        if(reportedFiscal.available!==null) fiscal.available=reportedFiscal.available;
        if(reportedFiscal.currency!==null) fiscal.currency=reportedFiscal.currency;
      }
      const pendingBudgetRequests=(this.budgetRequests.get(ministryId)||[]).filter(x=>String(x.status).toUpperCase()!=='CLOSED');
      const requestedBudget=pendingBudgetRequests.reduce((sum,item)=>{
        const amount=number(item.amount);
        return sum+(amount===null?0:amount);
      },0);
      fiscal.requestedBudget=requestedBudget;
      fiscal.budgetNeedStatus=requestedBudget>0?'REQUESTED':'NONE';
      fiscal.budgetPressure=fiscal.budget!==null && fiscal.budget!==0
        ? Number((requestedBudget/fiscal.budget).toFixed(6))
        : null;
      const latestConstraints=this.constraints.get(ministryId)?.slice(-10)||[];
      const latestAlerts=this.alerts.get(ministryId)?.slice(-10)||[];

      const snapshot=Object.freeze({
        schemaVersion:1,
        ministryId,
        domain:packet.domain||execution.domain||null,
        countryId:context.countryId||null,
        turn:Number.isFinite(Number(packet.turn))?Number(packet.turn):this.lastTurn,
        status:runtimeState.status||'UNKNOWN',
        active:runtimeState.active===true,
        fiscal,
        projects,
        policy:{
          activeCount:collectionCount(store?.policies),
          decisionCount:collectionCount(store?.decisions)
        },
        needs,
        requests:{
          openBudgetRequests:clone(pendingBudgetRequests),
          inboxCount:this._knowledgeBucket(ministryId).inbox.length
        },
        constraints:clone(latestConstraints),
        alerts:clone(latestAlerts),
        operations:{
          phase:execution.phase||null,
          failures:number(runtimeState.failures)||0,
          lastDt:number(runtimeState.lastDt),
          inputCompleteness:number(execution.derived?.inputCompleteness),
          missingInputs:clone(execution.missingInputs||[]),
          engineRevision:number(execution.revision)||null,
          facts
        }
      });

      this.snapshots.set(ministryId,clone(snapshot));
      this.metrics.statePublications+=1;

      const knowledge=this._knowledgeBucket(ministryId);
      knowledge.peerFacts.set(ministryId,clone(snapshot));
      this.lastTurn=Math.max(this.lastTurn,Number(snapshot.turn)||0);
      this._emit('OMEGA_MINISTRY_PUBLIC_STATE_UPDATED',clone(snapshot));
      return clone(snapshot);
    }

    getPeerState(requesterId,targetId){
      requesterId=String(requesterId); targetId=String(targetId);
      if(!ID_SET.has(requesterId) || !ID_SET.has(targetId)) return null;
      return clone(this.snapshots.get(targetId)||{
        ministryId:targetId,
        availability:'UNOBSERVED'
      });
    }

    _peerCompact(snapshot){
      if(!snapshot) return {
        availability:'UNOBSERVED'
      };
      return {
        ministryId:snapshot.ministryId,
        domain:snapshot.domain,
        countryId:snapshot.countryId,
        turn:snapshot.turn,
        status:snapshot.status,
        active:snapshot.active,
        fiscal:clone(snapshot.fiscal),
        projects:clone(snapshot.projects),
        policy:clone(snapshot.policy),
        needs:clone(snapshot.needs),
        requests:clone(snapshot.requests),
        constraints:clone(snapshot.constraints),
        alerts:clone(snapshot.alerts),
        operations:clone(snapshot.operations)
      };
    }

    _openBudgetNeed(ministryId){
      const list=this.budgetRequests.get(ministryId)||[];
      return list.filter(x=>String(x.status).toUpperCase()!=='CLOSED').slice(-5);
    }

    _projectSummary(ministryId){
      const snapshot=this.snapshots.get(ministryId);
      const signals=this.projectSignals.get(ministryId)||[];
      const latest=signals[signals.length-1]||null;
      return {
        knownCount:snapshot?.projects?.knownCount ?? latest?.projectCount ?? null,
        activeCount:snapshot?.projects?.activeCount ?? latest?.activeCount ?? null,
        committedBudget:snapshot?.projects?.committedBudget ?? latest?.committedBudget ?? null,
        latestTurn:latest?.turn ?? snapshot?.turn ?? null
      };
    }

    _governmentLedger(){
      const financial=[];
      const projects=[];
      const budgetNeeds=[];
      const alerts=[];
      const constraints=[];
      for(const id of IDS){
        const s=this.snapshots.get(id);
        const p=this._projectSummary(id);
        financial.push({
          ministryId:id,
          budget:s?.fiscal?.budget ?? null,
          allocated:s?.fiscal?.allocated ?? null,
          committed:s?.fiscal?.committed ?? null,
          available:s?.fiscal?.available ?? null,
          spending:s?.fiscal?.spending ?? null,
          reserves:s?.fiscal?.reserves ?? null,
          revenue:s?.fiscal?.revenue ?? null,
          debt:s?.fiscal?.debt ?? null,
          requestedBudget:s?.fiscal?.requestedBudget ?? null,
          budgetNeedStatus:s?.fiscal?.budgetNeedStatus ?? 'UNKNOWN',
          turn:s?.turn ?? null
        });
        projects.push({ministryId:id,...p});
        const needs=this._openBudgetNeed(id);
        if(needs.length) budgetNeeds.push({ministryId:id,requests:clone(needs)});
        if(s?.constraints?.length) constraints.push({ministryId:id,items:clone(s.constraints.slice(-5))});
        if(s?.alerts?.length) alerts.push({ministryId:id,items:clone(s.alerts.slice(-5))});
      }
      return {financial,projects,budgetNeeds,alerts,constraints};
    }

    getMinistryBriefing(ministryId){
      ministryId=String(ministryId);
      if(!ID_SET.has(ministryId)) return null;
      const peers={};
      for(const id of IDS) peers[id]=this._peerCompact(this.snapshots.get(id));
      const ledger=this._governmentLedger();
      const received=this._knowledgeBucket(ministryId).inbox;
      const outgoing=this.connectionsFor(ministryId,'OUTBOUND').filter(r=>r.messagesSent>0).slice(-64);

      return clone({
        schemaVersion:1,
        ministryId,
        generatedTurn:this.lastTurn,
        ownState:peers[ministryId],
        peers,
        government:ledger,
        incomingMessages:received.slice(-50),
        outboundActivity:outgoing,
        mesh:{
          totalConnections:IDS.length*IDS.length,
          crossMinistryConnections:IDS.length*(IDS.length-1),
          loopbackConnections:IDS.length,
          availableFromThisMinistry:IDS.length
        }
      });
    }

    getContext(ministryId,options={}){
      ministryId=String(ministryId);
      const briefing=this.getMinistryBriefing(ministryId);
      const port=this.createPort(ministryId);
      const peers=briefing ? briefing.peers : {};
      const compactPeers={};
      for(const id of IDS) compactPeers[id]=this._peerCompact(peers[id]?.ministryId ? peers[id] : null);

      return Object.freeze({
        ministryId,
        turn:Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn,
        dt:number(options.dt)||0,
        mesh:port,
        nationalPicture:compactPeers,
        government:clone(briefing?.government||{
          financial:[],projects:[],budgetNeeds:[],alerts:[],constraints:[]
        }),
        incomingMessages:clone((briefing?.incomingMessages||[]).slice(-25)),
        decisionSupport:{
          tradeAgreement:this.evaluateAction('trade','CONCLUDE_TRADE_AGREEMENT')
        }
      });
    }

    evaluateAction(ministryId,action,options={}){
      ministryId=String(ministryId);
      const actionId=String(action||'GENERAL_ACTION').toUpperCase();
      if(!ID_SET.has(ministryId)) return {status:'UNKNOWN',reason:'UNKNOWN_MINISTRY'};

      if(actionId==='CONCLUDE_TRADE_AGREEMENT' && ministryId==='trade'){
        return this._evaluateTradeAgreement();
      }

      const required=Array.isArray(options.requirements)?options.requirements:[];
      const evidence=[];
      const missing=[];
      for(const req of required){
        const target=String(req.ministry||'');
        const snapshot=this.snapshots.get(target);
        const value=readPath(snapshot,req.path);
        if(value===undefined || value===null){
          missing.push({ministryId:target,path:req.path});
          continue;
        }
        evidence.push({ministryId:target,path:req.path,value:clone(value)});
      }
      return {
        status:missing.length ? 'UNKNOWN' : 'OBSERVED',
        action:actionId,
        evidence,
        missing
      };
    }

    _evaluateTradeAgreement(){
      const foreign=this.snapshots.get('foreign')||null;
      const trade=this.snapshots.get('trade')||null;
      const economy=this.snapshots.get('economy')||null;
      const finance=this.snapshots.get('finance')||null;
      const transport=this.snapshots.get('transport')||null;
      const intelligence=this.snapshots.get('intelligence')||null;

      const evidence=[];
      const missing=[];
      const blockers=[];

      const treaty=first(foreign,[
        'operations.facts.foreign.treaties',
        'operations.facts.trade.relations'
      ]);
      const sanctions=first(foreign,[
        'operations.facts.foreign.sanctions'
      ]);
      const relation=first(foreign,[
        'operations.facts.foreign.relations',
        'operations.facts.trade.relations'
      ]);
      const tradeBalance=trade?.fiscal?.revenue ?? first(trade?.operations?.facts||{},['trade.balance','trade.exports']);
      const logistics=first(transport,[
        'operations.facts.transport.logistics'
      ]);
      const fiscalReserves=finance?.fiscal?.reserves ?? null;
      const threat=first(intelligence,[
        'operations.facts.intelligence.threats'
      ]);

      const checks=[
        ['foreign.treatyStatus',treaty],
        ['foreign.sanctions',sanctions],
        ['foreign.relationScore',relation],
        ['transport.logisticsCapacity',logistics],
        ['finance.reserves',fiscalReserves],
        ['intelligence.externalThreat',threat]
      ];

      for(const [path,value] of checks){
        if(value===undefined || value===null){
          missing.push({path});
        }else{
          evidence.push({path,value:clone(value)});
        }
      }

      if(typeof sanctions==='number' && sanctions>0) blockers.push({code:'FOREIGN_SANCTIONS',value:sanctions});
      if(typeof relation==='number' && relation<0) blockers.push({code:'NEGATIVE_RELATION',value:relation});
      if(typeof logistics==='number' && logistics<=0) blockers.push({code:'LOGISTICS_CAPACITY',value:logistics});
      if(typeof threat==='number' && threat>=90) blockers.push({code:'EXTERNAL_THREAT_CRITICAL',value:threat});

      let status='UNKNOWN';
      if(blockers.length) status='BLOCKED';
      else if(missing.length) status='CONDITIONALLY_ASSESSABLE';
      else status='OBSERVED';

      return {
        action:'CONCLUDE_TRADE_AGREEMENT',
        status,
        evidence,
        blockers,
        missing,
        note:'This is a decision-context assessment from published game state. It does not invent missing diplomatic or fiscal facts.'
      };
    }

    publishFiscalStatus(ministryId,status,options={}){
      const ministryId0=String(ministryId);
      this._recordFiscalStatus({
        source:ministryId0,
        messageId:'LOCAL-FISCAL-'+ministryId0+'-'+this.lastTurn,
        turn:Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn,
        payload:status||{}
      });
      return this.send(
        ministryId0,
        String(options.target||'finance'),
        options.topic||'ministry.fiscal.status',
        {
          budget:number(status?.budget),
          allocated:number(status?.allocated),
          committed:number(status?.committed),
          available:number(status?.available),
          currency:status?.currency??null,
          evidence:clone(status?.evidence||null)
        },
        { ...options, messageType:MESSAGE_TYPES.FISCAL_STATUS }
      );
    }

    recordBudgetRequest(ministryId,request,options={}){
      const source=String(ministryId);
      this._recordBudgetRequest({
        source,
        messageId:'LOCAL-BUDGET-'+source+'-'+this.lastTurn+'-'+String((this.budgetRequests.get(source)||[]).length+1),
        turn:Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn,
        payload:request||{}
      });
      return this.send(
        String(ministryId),
        String(options.target||'finance'),
        options.topic||'ministry.budget.request',
        {
          amount:number(request?.amount),
          currency:request?.currency??null,
          purpose:request?.purpose??null,
          urgency:request?.urgency??'NORMAL',
          status:request?.status??'OPEN',
          evidence:clone(request?.evidence||null)
        },
        { ...options, messageType:MESSAGE_TYPES.BUDGET_REQUEST }
      );
    }

    publishProjectStatus(ministryId,status,options={}){
      const source=String(ministryId);
      this._recordProjectSignal({
        source,
        messageId:'LOCAL-PROJECT-'+source+'-'+this.lastTurn+'-'+String((this.projectSignals.get(source)||[]).length+1),
        turn:Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn,
        payload:status||{}
      });
      return this.send(
        String(ministryId),
        String(options.target||'cabinet'),
        options.topic||'ministry.project.status',
        {
          projectId:status?.projectId??null,
          projectCount:number(status?.projectCount),
          activeCount:number(status?.activeCount),
          committedBudget:number(status?.committedBudget),
          status:status?.status??'UPDATED',
          blockers:clone(status?.blockers||[])
        },
        { ...options, messageType:MESSAGE_TYPES.PROJECT_STATUS }
      );
    }

    publishConstraint(ministryId,constraint,options={}){
      const source=String(ministryId);
      this._recordConstraint({
        source,
        messageId:'LOCAL-CONSTRAINT-'+source+'-'+this.lastTurn+'-'+String((this.constraints.get(source)||[]).length+1),
        turn:Number.isFinite(Number(options.turn))?Number(options.turn):this.lastTurn,
        payload:constraint||{}
      });
      return this.send(
        String(ministryId),
        String(options.target||'cabinet'),
        options.topic||'ministry.constraint.updated',
        {
          severity:constraint?.severity??'INFO',
          code:constraint?.code??null,
          description:constraint?.description??null,
          blocking:constraint?.blocking===true,
          evidence:clone(constraint?.evidence||null)
        },
        { ...options, messageType:MESSAGE_TYPES.CONSTRAINT_UPDATE }
      );
    }

    connectionsFor(ministryId,direction='ALL'){
      ministryId=String(ministryId);
      return [...this.connections.values()]
        .filter(r=>direction==='ALL' ? (r.source===ministryId||r.target===ministryId)
          : direction==='OUTBOUND' ? r.source===ministryId
          : r.target===ministryId)
        .map(clone);
    }

    getConnection(source,target){
      const route=this._route(String(source),String(target));
      return route ? clone(route) : null;
    }

    health(){
      const mesh=this.verifyFullMesh();
      const initializedSnapshots=this.snapshots.size;
      const published=IDS.filter(id=>this.snapshots.has(id)).length;
      return {
        version:VERSION,
        initialized:this.initialized,
        ministries:IDS.length,
        connections:mesh.connectionCells,
        expectedConnections:mesh.expectedConnections,
        crossMinistryConnections:mesh.crossMinistryConnections,
        loopbackConnections:mesh.loopbackConnections,
        snapshots:initializedSnapshots,
        publishedMinistries:published,
        metrics:clone(this.metrics),
        meshOk:mesh.ok
      };
    }

    export(){
      return clone({
        version:VERSION,
        routeSequence:this.routeSequence,
        connections:[...this.connections.entries()],
        snapshots:[...this.snapshots.entries()],
        requests:[...this.requests.entries()],
        alerts:[...this.alerts.entries()],
        budgetRequests:[...this.budgetRequests.entries()],
        projectSignals:[...this.projectSignals.entries()],
        constraints:[...this.constraints.entries()],
        fiscalReports:[...this.fiscalReports.entries()],
        metrics:this.metrics,
        lastTurn:this.lastTurn
      });
    }

    import(data){
      if(!data || typeof data!=='object') throw new Error('INVALID_INTEROPERABILITY_SNAPSHOT');
      this.routeSequence=number(data.routeSequence)||0;
      this.lastTurn=number(data.lastTurn)||0;
      if(Array.isArray(data.connections)) this.connections=new Map(data.connections.map(([k,v])=>[k,clone(v)]));
      if(!Array.isArray(data.connections) || this.connections.size!==IDS.length*IDS.length) this._buildFullMesh();
      this.snapshots=new Map(Array.isArray(data.snapshots)?data.snapshots.map(([k,v])=>[k,clone(v)]):[]);
      this.requests=new Map(Array.isArray(data.requests)?data.requests.map(([k,v])=>[k,clone(v)]):[]);
      this.alerts=new Map(Array.isArray(data.alerts)?data.alerts.map(([k,v])=>[k,clone(v)]):[]);
      this.budgetRequests=new Map(Array.isArray(data.budgetRequests)?data.budgetRequests.map(([k,v])=>[k,clone(v)]):[]);
      this.projectSignals=new Map(Array.isArray(data.projectSignals)?data.projectSignals.map(([k,v])=>[k,clone(v)]):[]);
      this.constraints=new Map(Array.isArray(data.constraints)?data.constraints.map(([k,v])=>[k,clone(v)]):[]);
      this.fiscalReports=new Map(Array.isArray(data.fiscalReports)?data.fiscalReports.map(([k,v])=>[k,clone(v)]):[]);
      this.metrics={...this.metrics,...clone(data.metrics||{})};
    }
  }

  function unwrapMessage(message){
    if(!message || typeof message!=='object') return null;
    if(message.data && typeof message.data==='object' && message.data.messageId) return message.data;
    return message.messageId ? message : null;
  }

  const api = new MinistryInteroperabilitySystem();
  global.Omega = global.Omega || {};
  global.Omega.MinistryInteroperability = api;
  global.Omega.MinistryMesh = api;
  global.OmegaMinistryInteroperability = api;
})(typeof window!=='undefined'?window:globalThis);
