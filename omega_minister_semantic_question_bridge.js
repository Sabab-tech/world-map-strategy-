/* OMEGA MINISTER SEMANTIC QUESTION BRIDGE v1.0 */
(function(global){'use strict';
  function install(){
    const ui=global.OmegaCabinetUI,semantic=global.OmegaProductionSemanticRuntime;
    if(!ui||!semantic||typeof ui.processQuestionAndReply!=='function')return false;
    if(ui.__semanticQuestionBridgeInstalled)return true;
    const original=ui.processQuestionAndReply.bind(ui);
    ui.__semanticQuestionBridgeInstalled=true;
    ui.processQuestionAndReply=function(minister,questionText){
      const q=String(questionText==null?'':questionText).trim();
      let plan=null,result=null,answer=null;
      try{
        const identity={
          countryCode:String(this.activeCountry||global.Game?.state?.countryId||global.Game?.state?.playerCountryId||'').toUpperCase(),
          ministryId:String(minister?.id||global.OmegaLayerManager?.activeMinistryId||''),
          ministerId:String(minister?.ministerId||minister?.id||''),
          ministerName:String(minister?.ministerName||minister?.name||'')
        };
        plan=semantic.buildAnswerPlan(q,identity,global.Game?.state||{},this.chatHistories?.[minister?.id]||[]);
        result=plan.result;
        answer=semantic.formatOfflineAnswer(plan);
      }catch(error){console.warn('[OMEGA Minister Semantic Bridge] semantic execution failed',error)}
      if(!answer){return original(minister,questionText)}
      const resultOfOriginal=original(minister,questionText);
      const replace=()=>{
        const history=this.chatHistories?.[minister?.id];
        if(!Array.isArray(history)||!history.length)return;
        const last=history[history.length-1];
        if(last&&String(last.sender||'').toUpperCase()==='MINISTER'){
          last.text=answer;
          last.response=answer;
          last.semanticPlan=plan.semantic;
          last.evidence=result;
          last.source='OMEGA_PRODUCTION_SEMANTIC_RUNTIME';
          this.renderChatHistory(minister.id);
        }
      };
      replace();
      setTimeout(replace,0);
      setTimeout(replace,50);
      return resultOfOriginal;
    };
    return true;
  }
  function boot(){if(!install())setTimeout(boot,200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(typeof globalThis!=='undefined'?globalThis:window);
