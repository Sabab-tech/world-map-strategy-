/* OMEGA MINISTER COMMUNICATION ENGINE v1.0.0 */
(function(global){'use strict';
  if(global.OmegaMinisterCommunication)return;
  const registry=()=>global.OmegaMinisterStateRegistry;
  const config=()=>registry()?.getConfig?.()||{};
  const id=()=>`MSG-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  function send(senderMinisterId,receiverMinisterId,topic,payload={},options={}){
    const r=registry();if(!r)throw new Error('MINISTER_STATE_REGISTRY_UNAVAILABLE');
    const sender=r.getMinister(senderMinisterId),receiver=r.getMinister(receiverMinisterId);
    if(!sender||sender.status!=='ACTIVE')throw new Error('SENDER_NOT_ACTIVE');
    if(!receiver||receiver.status!=='ACTIVE')throw new Error('RECEIVER_NOT_ACTIVE');
    if(sender.runtimeState.countryId!==receiver.runtimeState.countryId)throw new Error('CROSS_COUNTRY_MESSAGE_REQUIRES_EXPLICIT_DIPLOMATIC_CHANNEL');
    const message={messageId:options.messageId||id(),senderMinisterId,receiverMinisterId,countryId:receiver.runtimeState.countryId,ministryId:receiver.runtimeState.ministryId,messageType:String(options.messageType||'INFORMATION'),priority:String(options.priority||'NORMAL'),topic:String(topic||''),payload,timestamp:options.timestamp??0,expiry:options.expiry??0};
    r.sendMessage(senderMinisterId,receiverMinisterId,message);global.dispatchEvent?.(new CustomEvent('MINISTER_MESSAGE_DELIVERED',{detail:message}));return Object.freeze(message);
  }
  function broadcast(senderMinisterId,receiverIds,topic,payload,options={}){return (Array.isArray(receiverIds)?receiverIds:[]).map(receiver=>{try{return send(senderMinisterId,receiver,topic,payload,options)}catch(error){return {receiverMinisterId:receiver,error:error.message}}});}
  global.OmegaMinisterCommunication={version:'1.0.0',send,broadcast};
})(typeof window!=='undefined'?window:globalThis);
