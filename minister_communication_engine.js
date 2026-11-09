/* OMEGA MINISTER COMMUNICATION ENGINE v2.1.0
 * Uses the canonical registry first, with a guarded adapter for the legacy V2 runtime.
 */
(function(global){
  'use strict';
  if(global.OmegaMinisterCommunication?.version==='2.1.0')return;
  const text=value=>value==null?'':String(value);
  const stateRegistry=()=>global.OmegaMinisterStateRegistry||global.OmegaMinisterState?.registry||null;
  function get(id){
    const registry=stateRegistry();
    if(!registry)throw Error('MINISTER_STATE_REGISTRY_UNAVAILABLE');
    const state=registry.getMinister?.(id);
    if(state?.staticProfile&&state?.runtimeState)return {profile:state.staticProfile,runtime:state.runtimeState,learning:state.learningState||{},memory:state.memoryState||{},effective:state};
    const legacyRegistry=global.OmegaMinisterState?.registry&&global.OmegaMinisterState.registry!==registry?global.OmegaMinisterState.registry:null;
    const legacyProfile=legacyRegistry?.getMinister?.(id)||legacyRegistry?.profiles?.get?.(String(id))||null;
    const legacyRuntime=legacyRegistry?.getRuntime?.(id)||null;
    if(!state&&legacyProfile&&legacyRuntime)return {profile:legacyProfile,runtime:legacyRuntime,learning:legacyRegistry.getLearning?.(id)||{},memory:{},effective:null};
    const profile=state||registry.profiles?.get?.(String(id))||null;
    const runtime=registry.getRuntime?.(id)||null;
    const learning=registry.getLearning?.(id)||{};
    if(!profile)throw Error('MINISTER_NOT_FOUND');
    return {profile,runtime,learning,memory:{},effective:null};
  }
  function send(senderMinisterId,receiverMinisterId,topic,payload={},options={}){
    const sender=get(senderMinisterId),receiver=get(receiverMinisterId);
    const sr=sender.runtime,tr=receiver.runtime;
    if(!sr||String(sr.status).toUpperCase()!=='ACTIVE')throw Error('SENDER_NOT_ACTIVE');
    if(!tr||String(tr.status).toUpperCase()!=='ACTIVE')throw Error('RECEIVER_NOT_ACTIVE');
    if(String(sr.countryId)!==String(tr.countryId))throw Error('CROSS_COUNTRY_MESSAGE_REQUIRES_EXPLICIT_DIPLOMATIC_CHANNEL');
    const interop=global.OmegaMinistryInteroperability||global.Omega?.MinistryInteroperability||null;
    if(!interop||typeof interop.send!=='function')throw Error('MINISTRY_INTEROPERABILITY_UNAVAILABLE');
    const turn=Number.isFinite(Number(options.simulationTurn))?Number(options.simulationTurn):
      Number.isFinite(Number(sr.simulationTurn))?Number(sr.simulationTurn):
      Number.isFinite(Number(sr.currentTurn))?Number(sr.currentTurn):0;
    const topicText=text(topic);
    const routed=interop.send(String(sr.ministryId),String(tr.ministryId),topicText,{
      ministerMessage:{senderMinisterId:String(senderMinisterId),receiverMinisterId:String(receiverMinisterId),
        countryId:String(tr.countryId),topic:topicText,payload}
    },{...options,countryId:String(tr.countryId),turn,messageType:String(options.messageType||'STATE_UPDATE')});
    const message=Object.freeze({
      messageId:routed.messageId,senderMinisterId:String(senderMinisterId),receiverMinisterId:String(receiverMinisterId),
      countryId:String(tr.countryId),ministryId:String(tr.ministryId),messageType:routed.messageType,
      priority:routed.priority,topic:routed.topic,payload,timestamp:routed.timestamp,expiryTurn:routed.expiryTurn
    });
    try{global.dispatchEvent?.(new CustomEvent('MINISTER_MESSAGE_DELIVERED',{detail:message}));}catch(_){}
    return message;
  }
  function broadcast(senderMinisterId,receiverIds,topic,payload,options={}){
    return (Array.isArray(receiverIds)?receiverIds:[]).map(receiver=>{
      try{return send(senderMinisterId,receiver,topic,payload,options);}
      catch(error){return {receiverMinisterId:receiver,error:error.message};}
    });
  }
  global.OmegaMinisterCommunication={version:'2.1.0',send,broadcast,getMinisterContext:get};
})(typeof window!=='undefined'?window:globalThis);
