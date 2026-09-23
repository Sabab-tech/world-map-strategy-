/* OMEGA SECOND-ORDER CONSEQUENCE SYSTEM v1.0.0
 * Propagates confirmed mutations only when the receiving domain exposes the
 * required coefficient/factor. It never invents a missing causal parameter.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0',MAX=128;
  const clone=(v,seen=new WeakMap())=>{if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;};
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  function command(owner,type,c,payload={}){
    const m=interop();if(!m?.dispatchCommand)return{status:'UNAVAILABLE'};
    try{return m.dispatchCommand(owner,type,canonical(c),payload,{turn:turn(),commandType:type,correlationId:payload?.causationId||payload?.eventId||null});}catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }
  function emit(type,c,payload={},source='cabinet'){
    const m=interop();try{return m?.emitEvent?.(type,canonical(c),source,{countryId:canonical(c),...clone(payload)},{turn:turn()});}catch(_){return null;}
  }
  function stateRead(c,path){
    const cid=canonical(c),parts=String(path||'').split('.'),domain=parts.shift();let b=state()?.[domain];
    if(b&&typeof b==='object')b=b[cid]??b[Object.keys(b).find(k=>id(k)===cid)];
    for(const p of parts){if(b==null||!Object.prototype.hasOwnProperty.call(Object(b),p))return undefined;b=b[p];}
    return b;
  }
  function stateSetCommand(owner,type,c,payload){return command(owner,type,c,payload);}
  function tradeBalanceHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount),kind=String(p.kind||'').toUpperCase();
    if(amount===null||amount<0)return{accepted:false,reason:'TRADE_BALANCE_AMOUNT_INVALID'};
    const trade=ctx.stateTransaction.get('trade');
    const next=trade&&typeof trade==='object'?clone(trade):{};
    if(kind==='IMPORT')next.importValue=num(next.importValue)===null?amount:num(next.importValue)+amount;
    if(kind==='EXPORT')next.exportValue=num(next.exportValue)===null?amount:num(next.exportValue)+amount;
    if(kind==='IMPORT')next.balance=num(next.balance)===null?(0-amount):num(next.balance)-amount;
    if(kind==='EXPORT')next.balance=num(next.balance)===null?amount:num(next.balance)+amount;
    const ledger=Array.isArray(next.flowLedger)?next.flowLedger:[];
    next.flowLedger=ledger.concat([{type:kind,amount,resourceId:p.resourceId||null,quantity:num(p.quantity),counterpartyCountryId:p.counterpartyCountryId?canonical(p.counterpartyCountryId):null,turn:turn(),settlementId:p.settlementId||null}]).slice(-MAX);
    ctx.stateTransaction.set('trade',next);
    return{accepted:true,kind,amount};
  }
  function resourceDemandHandler(cmd,ctx){
    const p=cmd?.payload||{},rid=String(p.resourceId||''),delta=num(p.delta),cons=ctx.stateTransaction.get('resource.consumption');
    if(!rid||delta===null)return{accepted:false,reason:'RESOURCE_DEMAND_INPUT_INVALID'};
    const next=cons&&typeof cons==='object'?clone(cons):{};
    const k=Object.keys(next).find(x=>token(x)===token(rid))||rid;
    const current=num(next[k]);
    if(current===null)return{accepted:false,reason:'RESOURCE_CONSUMPTION_NOT_OBSERVED'};
    next[k]=current+delta;ctx.stateTransaction.set('resource.consumption',next);
    return{accepted:true,resourceId:rid,delta};
  }
  function housingShortageHandler(cmd,ctx){
    const p=cmd?.payload||{},delta=num(p.delta),raw=ctx.stateTransaction.get('cities.housing.required'),available=num(ctx.stateTransaction.get('cities.housing.available'));
    if(delta===null||available===null)return{accepted:false,reason:'HOUSING_CONSEQUENCE_DATA_UNAVAILABLE'};
    if(raw!==undefined){
      const required=num(raw);
      if(required===null)return{accepted:false,reason:'HOUSING_REQUIRED_NOT_OBSERVED'};
      ctx.stateTransaction.set('cities.housing.required',Math.max(0,required-delta));
    }
    const pressure=ctx.stateTransaction.get('population.migration_pressure');
    if(pressure!==undefined){
      const pv=num(pressure);
      if(pv!==null)ctx.stateTransaction.set('population.migration_pressure',Math.max(0,pv-delta));
    }
    return{accepted:true,delta};
  }
  function factoryConsequenceHandler(cmd,ctx){
    const p=cmd?.payload||{},capacityDelta=num(p.capacityDelta),coeff=p.inputCoefficients;
    if(capacityDelta===null||!coeff||typeof coeff!=='object')return{accepted:false,reason:'FACTORY_CAUSAL_COEFFICIENT_NOT_OBSERVED'};
    const changes=[];
    for(const [rid,raw] of Object.entries(coeff)){
      const perCapacity=num(raw);if(perCapacity===null)continue;
      changes.push({resourceId:rid,delta:capacityDelta*perCapacity});
    }
    for(const x of changes){
      const r=command('resource','OMEGA_SECOND_ORDER_RESOURCE_DEMAND',ctx.countryId,{...x,causationId:p.eventId||null});
      if(r?.status!=='APPLIED')return{accepted:false,reason:'SECOND_ORDER_RESOURCE_PROPAGATION_FAILED',detail:r};
    }
    return{accepted:true,changes};
  }
  function equipmentConsequenceHandler(cmd,ctx){
    const p=cmd?.payload||{},item=String(p.item||''),q=num(p.quantity);
    const profile=stateRead(ctx.countryId,'military.equipmentProfiles')?.[item];
    const effect=num(profile?.readinessEffectPerUnit??profile?.readinessEffect);
    if(q===null||effect===null)return{accepted:false,reason:'EQUIPMENT_READINESS_EFFECT_NOT_OBSERVED'};
    const r=command('military','OMEGA_AUTO_MILITARY_READY',ctx.countryId,{readinessDelta:q*effect,decisionId:p.decisionId||null,correlationId:p.eventId||null});
    return r?.status==='APPLIED'?{accepted:true,readinessDelta:q*effect}:{accepted:false,reason:'READINESS_PROPAGATION_FAILED',detail:r};
  }
  function installHandlers(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    const defs=[
      ['OMEGA_SECOND_ORDER_APPLY_TRADE_BALANCE','trade',tradeBalanceHandler],
      ['OMEGA_SECOND_ORDER_RESOURCE_DEMAND','resource',resourceDemandHandler],
      ['OMEGA_SECOND_ORDER_HOUSING_SHORTAGE','interior',housingShortageHandler],
      ['OMEGA_SECOND_ORDER_FACTORY_CAUSAL','economy',factoryConsequenceHandler],
      ['OMEGA_SECOND_ORDER_EQUIPMENT_EFFECT','military',equipmentConsequenceHandler]
    ];
    try{for(const [t,o,h] of defs){m.registerAction?.(t,{actionId:t,stateOwnerMinistry:o,authority:'OMEGA_SECOND_ORDER_CAUSAL'});m.registerCommandHandler(t,o,h);}return true;}catch(_){return false;}
  }
  function onEvent(type,e){
    const d=e?.detail||{},p=d.payload||d,out=clone(p),c=canonical(d.countryId||p.countryId);
    if(!c)return;
    if(type==='OMEGA_TRADE_SETTLEMENT_COMPLETED'){
      const amount=num(p.totalValue);const q=num(p.quantity),rid=p.resourceId,target=canonical(p.targetCountryId);
      if(amount!==null)command('trade','OMEGA_SECOND_ORDER_APPLY_TRADE_BALANCE',c,{kind:'IMPORT',amount,quantity:q,resourceId:rid,counterpartyCountryId:target,eventId:d.eventId||null});
      if(target&&amount!==null)command('trade','OMEGA_SECOND_ORDER_APPLY_TRADE_BALANCE',target,{kind:'EXPORT',amount,quantity:q,resourceId:rid,counterpartyCountryId:c,eventId:d.eventId||null});
    }
    if(type==='OMEGA_HOUSING_CAPACITY_CHANGED'){
      const delta=num(p.delta);if(delta!==null)command('interior','OMEGA_SECOND_ORDER_HOUSING_SHORTAGE',c,{delta,eventId:d.eventId||null});
    }
    if(type==='OMEGA_FACTORY_CAPACITY_CHANGED'){
      const coeff=stateRead(c,'economy.inputCoefficients')||stateRead(c,'industry.inputCoefficients');
      const delta=num(p.delta);if(delta!==null&&coeff)command('economy','OMEGA_SECOND_ORDER_FACTORY_CAUSAL',c,{capacityDelta:delta,inputCoefficients:clone(coeff),eventId:d.eventId||null});
    }
    if(type==='OMEGA_MILITARY_EQUIPMENT_APPLIED'){
      const q=num(p.quantity);if(q!==null&&p.item)command('military','OMEGA_SECOND_ORDER_EQUIPMENT_EFFECT',c,{quantity:q,item:p.item,decisionId:p.decisionId||null,eventId:d.eventId||null});
    }
  }
  function init(){
    installHandlers();
    if(g.__omegaSecondOrderHooks)return diagnostics();
    g.__omegaSecondOrderHooks=true;
    const events=['OMEGA_TRADE_SETTLEMENT_COMPLETED','OMEGA_HOUSING_CAPACITY_CHANGED','OMEGA_FACTORY_CAPACITY_CHANGED','OMEGA_MILITARY_EQUIPMENT_APPLIED'];
    for(const type of events)g.addEventListener?.(type,e=>onEvent(type,e));
    return diagnostics();
  }
  function diagnostics(){return{version:VERSION,handlerInstalled:true,eventHooksInstalled:!!g.__omegaSecondOrderHooks};}
  const API=Object.freeze({VERSION,diagnostics,processEvent:onEvent});
  g.Omega=g.Omega||{};g.Omega.OpponentSecondOrderConsequences=API;g.OmegaOpponentSecondOrderConsequences=API;try{init();}catch(e){g.OmegaOpponentSecondOrderConsequencesError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
