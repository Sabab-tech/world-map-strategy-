/* OMEGA MINISTER COMMUNICATION ENGINE v2.0.0
 * Contract-aligned with omega_minister_runtime_v2.js.
 * Profile data comes from getMinister(); live state comes from getRuntime().
 */
(function(global){
  'use strict';
  if(global.OmegaMinisterCommunication?.version==='2.0.0') return;
  const registry=()=>global.OmegaMinisterState?.registry||global.OmegaMinisterStateRegistry||null;
  const text=v=>v==null?'':String(v);
  let localSequence=0;
  function get(id0){const r=registry();if(!r)throw Error('MINISTER_STATE_REGISTRY_UNAVAILABLE');const profile=r.getMinister(id0),runtime=r.getRuntime(id0);if(!profile)throw Error('MINISTER_NOT_FOUND');return {profile,runtime};}
  function send(senderMinisterId,receiverMinisterId,topic,payload={},options={}){
    const s=get(senderMinisterId),t=get(receiverMinisterId),sr=s.runtime,tr=t.runtime;
    if(!sr||sr.status!=='ACTIVE')throw Error('SENDER_NOT_ACTIVE');
    if(!tr||tr.status!=='ACTIVE')throw Error('RECEIVER_NOT_ACTIVE');
    if(String(sr.countryId)!==String(tr.countryId))throw Error('CROSS_COUNTRY_MESSAGE_REQUIRES_EXPLICIT_DIPLOMATIC_CHANNEL');

    const interop=global.OmegaMinistryInteroperability || global.Omega?.MinistryInteroperability || null;
    if(!interop||typeof interop.send!=='function')throw Error('MINISTRY_INTEROPERABILITY_UNAVAILABLE');

    const turn=Number.isFinite(Number(options.simulationTurn))
      ?Number(options.simulationTurn)
      :Number.isFinite(Number(sr.simulationTurn))
        ?Number(sr.simulationTurn)
        :Number.isFinite(Number(sr.currentTurn))
          ?Number(sr.currentTurn)
          :0;
    const routed=interop.send(
      String(sr.ministryId),
      String(tr.ministryId),
      text(topic),
      {ministerMessage:{
        senderMinisterId:String(senderMinisterId),
        receiverMinisterId:String(receiverMinisterId),
        countryId:String(tr.countryId),
        topic:text(topic),
        payload
      }},
      {
        ...options,
        countryId:String(tr.countryId),
        turn,
        messageType:String(options.messageType||'STATE_UPDATE')
      }
    );
    const message={
      messageId:routed.messageId,
      senderMinisterId:String(senderMinisterId),
      receiverMinisterId:String(receiverMinisterId),
      countryId:String(tr.countryId),
      ministryId:String(tr.ministryId),
      messageType:routed.messageType,
      priority:routed.priority,
      topic:routed.topic,
      payload,
      timestamp:routed.timestamp,
      expiryTurn:routed.expiryTurn
    };
    try{global.dispatchEvent?.(new CustomEvent('MINISTER_MESSAGE_DELIVERED',{detail:message}))}catch(_){}
    return Object.freeze(message);
  }
  function broadcast(senderMinisterId,receiverIds,topic,payload,options={}){return (Array.isArray(receiverIds)?receiverIds:[]).map(receiver=>{try{return send(senderMinisterId,receiver,topic,payload,options)}catch(error){return {receiverMinisterId:receiver,error:error.message}}});}
  global.OmegaMinisterCommunication={version:'2.0.0',send,broadcast,getMinisterContext:get};
})(typeof window!=='undefined'?window:globalThis);
