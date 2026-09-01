/* OMEGA MINISTER SEMANTIC QUESTION BRIDGE v2.0.0-PRODUCTION */
(function(global){
'use strict';
var INSTALLED='__omegaSemanticQuestionBridgeV2';
function text(v){return v==null?'':String(v).trim();}
function getUI(){return global.OmegaCabinetUI;}
function getSemantic(){return global.OmegaProductionSemanticRuntime;}
function activeIdentity(ui,minister){
 var game=global.Game||{}, state=game.state||{};
 var m=minister||ui.currentInterrogatedMinister||{};
 return {
  countryCode:text(ui.activeCountry||state.countryId||state.playerCountryId||game.currentActiveCountry||'').toUpperCase(),
  ministryId:text(m.ministryId||global.OmegaLayerManager&&global.OmegaLayerManager.activeMinistryId||''),
  ministerId:text(m.ministerId||m.id||''),
  ministerName:text(m.ministerName||m.name||m.baseName||'')
 };
}
function render(ui,id){
 try{if(typeof ui.renderChatHistory==='function')ui.renderChatHistory(id);}catch(e){console.warn('[OMEGA semantic render]',e);}
}
function install(){
 var ui=getUI(),semantic=getSemantic();
 if(!ui||!semantic||typeof semantic.buildAnswerPlan!=='function'||typeof semantic.formatOfflineAnswer!=='function'||typeof ui.processQuestionAndReply!=='function')return false;
 if(ui[INSTALLED])return true;
 var original=ui.processQuestionAndReply;
 ui[INSTALLED]=true;
 ui.processQuestionAndReply=function(minister,questionText){
  var q=text(questionText), id=text(minister&&minister.id||minister&&minister.ministerId||'');
  if(!id && ui.currentInterrogatedMinister)id=text(ui.currentInterrogatedMinister.id||ui.currentInterrogatedMinister.ministerId);
  try{
   var identity=activeIdentity(ui,minister);
   var state=(global.Game&&global.Game.state)||{};
   var history=ui.chatHistories&&ui.chatHistories[id]||[];
   var plan=semantic.buildAnswerPlan(q,identity,state,history);
   var answer=semantic.formatOfflineAnswer(plan);
   if(text(answer)){
    if(!ui.chatHistories)ui.chatHistories={};
    if(!ui.chatHistories[id])ui.chatHistories[id]=[];
    ui.chatHistories[id].push({sender:'USER',text:q,timestamp:Date.now()});
    ui.chatHistories[id].push({sender:'MINISTER',text:answer,response:answer,timestamp:Date.now(),semanticPlan:plan.semantic||plan,evidence:plan.result||null,source:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME_V4_1'});
    render(ui,id);
    return answer;
   }
  }catch(error){
   console.error('[OMEGA semantic bridge] execution failure',error);
  }
  return original.call(ui,minister,questionText);
 };
 return true;
}
function boot(){if(install())return;setTimeout(boot,200);}
if(global.addEventListener)global.addEventListener('OMEGA_READY',boot);
if(global.addEventListener)global.addEventListener('OMEGA_SEMANTIC_RUNTIME_READY',boot);
boot();
})(typeof globalThis!=='undefined'?globalThis:window);
