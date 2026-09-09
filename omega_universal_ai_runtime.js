/**
 * OMEGA UNIVERSAL AI RUNTIME v1.7.0
 * Canonical interrogation owner.
 * Uses runtime language data + contextual discourse semantics + production
 * semantic routing + full 40-stage cognitive handoff.
 * No conversational response text is hard-coded here.
 */
(function(global){
  'use strict';

  const KEY='omega.universal.ai.history.v1';
  const MAX_TURNS=200;
  const MAX_CONTEXT_TURNS=12;
  let installed=false;
  let queue=Promise.resolve();
  let datasetPromise=null;
  let gameLanguagePromise=null;
  let conversationVocabulary=null;
  let conversationVocabularyPromise=null;

  const norm=s=>String(s||'').normalize('NFKC').trim();
  const matchNorm=s=>norm(s).toLowerCase().replace(/[?!,.:;'"“”‘’(){}\[\]<>—–\/\\]+/g,' ').replace(/\s+/g,' ').trim();
  const isBn=s=>/[\u0980-\u09FF]/.test(String(s||''));
  const asset=p=>{try{return typeof document!=='undefined'&&document.baseURI?new URL(p,document.baseURI).href:p;}catch(_){return p;}};
  const readHistory=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return[];}};
  const writeHistory=h=>{try{localStorage.setItem(KEY,JSON.stringify(h.slice(-MAX_TURNS)));}catch(_) {}};
  const historyContext=()=>readHistory().slice(-MAX_CONTEXT_TURNS);

  function context(){
    const gs=global.Game?.state||global.gameState||global.Omega?.World?.state||{};
    const ui=global.OmegaCabinetUI||{};
    const m=ui.currentInterrogatedMinister||ui.currentMinister||ui.activeMinister||global.OmegaMinisterState?.activeMinister||{};
    return{
      countryId:gs.countryCode||gs.countryId||gs.playerCountryId||ui.activeCountry||'',
      countryName:gs.countryName||gs.country?.name||ui.activeCountry||'',
      ministerId:m.id||m.ministerId||ui.currentMinisterId||'',
      ministerName:m.name||m.ministerName||m.displayName||'',
      ministerRole:m.role||m.title||'',
      ministryId:m.ministryId||ui.currentMinistryId||'',
      gameState:gs
    };
  }
  function syncLanguageContext(ctx,system=global.OmegaLanguageSystem){
    if(!system||typeof system.setContext!=='function')return false;
    try{system.setContext({countryId:ctx?.countryId||'',countryName:ctx?.countryName||'',ministerId:ctx?.ministerId||'',ministerName:ctx?.ministerName||'',ministerRole:ctx?.ministerRole||'',ministryId:ctx?.ministryId||'',gameState:ctx?.gameState||{}});return true;}catch(e){console.warn('[OMEGA UNIVERSAL AI] language context rejected:',e?.message||e);return false;}
  }

  async function loadScript(src){
    return new Promise((resolve,reject)=>{
      if(typeof document==='undefined')return reject(new Error('DOM unavailable'));
      if([...document.scripts].some(s=>s.src&&(s.src===asset(src)||s.src.endsWith('/'+src))))return resolve();
      const s=document.createElement('script');s.src=asset(src);s.onload=resolve;s.onerror=()=>reject(new Error(`Unable to load ${src}`));document.head.appendChild(s);
    });
  }

  async function ensureConversationVocabulary(){
    if(conversationVocabulary)return conversationVocabulary;
    if(conversationVocabularyPromise)return conversationVocabularyPromise;
    conversationVocabularyPromise=(async()=>{
      try{
        const response=await fetch(asset('offline_language_vocabulary.json'),{cache:'no-store'});
        if(!response.ok)throw new Error(`HTTP_${response.status}`);
        conversationVocabulary=await response.json();
        if(!global.OmegaLanguageBatch03){try{await loadScript('omega_language_batch03_semantic_extension.js');}catch(_){}}
      }catch(e){conversationVocabulary=null;console.warn('[OMEGA UNIVERSAL AI] language vocabulary unavailable:',e?.message||e);}
      return conversationVocabulary;
    })().finally(()=>{conversationVocabularyPromise=null;});
    return conversationVocabularyPromise;
  }

  function tokenCount(text){const n=matchNorm(text);return n?n.split(/\s+/).filter(Boolean).length:0;}
  function questionSignals(text){
    const raw=norm(text),n=matchNorm(text),qd=conversationVocabulary?.questionDetection||{};
    if(!n)return{question:false,explicit:false,reason:'EMPTY'};
    if(raw.includes('?'))return{question:true,explicit:true,reason:'QUESTION_MARK'};
    if(raw.endsWith('!'))return{question:false,explicit:false,reason:'EXCLAMATION_GUARD'};
    const phrases=isBn(raw)?(Array.isArray(qd.bengaliStarters)?qd.bengaliStarters:[]):(Array.isArray(qd.englishStarters)?qd.englishStarters:[]);
    for(const phrase of phrases){const p=matchNorm(phrase);if(p&&(n===p||n.startsWith(p+' ')))return{question:true,explicit:true,reason:'VOCABULARY_STARTER',phrase:p};}
    const fallback=/(^|\s)(what|who|whom|whose|which|where|when|why|how|should|can|could|will|would|does|do|did|has|have|is there|are there)(\s|$)/i.test(n)||/(^|\s)(কি|কী|কে|কারা|কেন|কোথায়|কোথায়|কখন|কোন|কীভাবে|কিভাবে|কত|হবে কি|সম্ভব কি|আছে কি)(\s|$)/.test(n);
    return fallback?{question:true,explicit:false,reason:'INTERROGATIVE_TOKEN'}:{question:false,explicit:false,reason:'NO_QUESTION_SIGNAL'};
  }

  function ruleSources(){
    const out=[];
    const base=conversationVocabulary?.conversation?.intentRules||{};
    for(const [intent,rule] of Object.entries(base))out.push({intent,rule,source:'offline_language_vocabulary.json'});
    const ext=global.OmegaLanguageBatch03?.discourseLexicon?.intents||{};
    for(const [intent,rule] of Object.entries(ext))out.push({intent,rule,source:'omega_language_batch03_semantic_extension.js'});
    const map=new Map();
    for(const item of out){const old=map.get(item.intent);if(!old)map.set(item.intent,item);else map.set(item.intent,{intent:item.intent,rule:{...old.rule,...item.rule},source:`${old.source}+${item.source}`});}
    return[...map.values()];
  }

  function previousTurnProfile(history){
    const h=history.slice(-MAX_CONTEXT_TURNS),assistants=h.filter(x=>x?.role==='assistant'),users=h.filter(x=>x?.role==='user');
    const lastAssistant=assistants[assistants.length-1]||null,lastUser=users[users.length-1]||null;
    const signal=lastAssistant?questionSignals(lastAssistant.content||''):{question:false,reason:'NO_ASSISTANT_TURN'};
    const previousConversation=lastAssistant?.conversation||null;
    return{lastAssistant,lastUser,previousWasQuestion:signal.question,previousQuestionSignal:signal,previousConversationIntent:previousConversation?.intent||null,previousContextualRole:previousConversation?.contextualRole||null,historyCount:h.length};
  }

  function resolveContextualRole(intent,rule,history){
    if(!rule?.contextSensitive)return{role:intent,confidence:1,method:'DIRECT_DIALOG_ACT'};
    const profile=previousTurnProfile(history),table=global.OmegaLanguageBatch03?.discourseLexicon?.contextualResolution||{},resolver=table[intent]||{};
    if(profile.previousWasQuestion&&resolver.afterQuestion)return{role:resolver.afterQuestion,confidence:.94,method:'PREVIOUS_TURN_QUESTION'};
    if(profile.previousConversationIntent==='AFFIRMATION'&&resolver.afterAffirmation)return{role:resolver.afterAffirmation,confidence:.88,method:'PREVIOUS_DIALOG_ACT'};
    if(profile.previousConversationIntent==='NEGATION'&&resolver.afterNegation)return{role:resolver.afterNegation,confidence:.88,method:'PREVIOUS_DIALOG_ACT'};
    if(resolver.afterStatement)return{role:resolver.afterStatement,confidence:.78,method:'PREVIOUS_TURN_STATEMENT'};
    return{role:intent,confidence:.55,method:'CONTEXT_INSUFFICIENT'};
  }

  function conversationIntent(text){
    const normalized=matchNorm(text);if(!normalized)return null;
    const signal=questionSignals(text),detection={...(conversationVocabulary?.conversation?.detection||{}),...(global.OmegaLanguageBatch03?.discourseLexicon?.detection||{})};
    if(detection.maxTokens&&tokenCount(normalized)>Number(detection.maxTokens))return null;
    if(detection.ignoreWhenQuestionMarkersPresent&&signal.question)return null;
    if(signal.reason==='EXCLAMATION_GUARD')return null;
    const lang=isBn(text)?'bn':'en',matches=[];
    for(const {intent,rule,source} of ruleSources())for(const phrase of (rule?.phrases?.[lang]||[])){const p=matchNorm(phrase);if(p===normalized)matches.push({intent,priority:Number(rule?.priority||0),phrase:p,rule,source});}
    if(!matches.length)return null;
    matches.sort((a,b)=>b.priority-a.priority||b.phrase.length-a.phrase.length);
    const best=matches[0],contextual=resolveContextualRole(best.intent,best.rule,historyContext());
    return{...best,language:lang,contextualRole:contextual.role,contextConfidence:contextual.confidence,contextMethod:contextual.method,questionSignal:signal};
  }

  function renderMelody(match,text){
    const ext=global.OmegaLanguageBatch03?.discourseLexicon?.intents?.[match?.intent]?.melody?.[match?.language];
    const base=conversationVocabulary?.conversation?.melody?.[match?.intent]?.[match?.language];
    const pool=Array.isArray(ext)&&ext.length?ext:(Array.isArray(base)?base:[]);
    if(!pool.length)return null;
    const seed=matchNorm(text).split('').reduce((v,ch)=>(v*31+ch.charCodeAt(0))>>>0,7);return String(pool[seed%pool.length]);
  }

  function localConversation(text){
    const match=conversationIntent(text);if(!match)return null;
    return{intent:match.intent,text:renderMelody(match,text),language:match.language,contextualRole:match.contextualRole,contextConfidence:match.contextConfidence,contextMethod:match.contextMethod,evidence:{source:match.source,phrase:match.phrase,priority:match.priority,questionSignal:match.questionSignal,contextWindowTurns:historyContext().length}};
  }

  function output(text,question,meta={}){
    let node=document.getElementById('omega-ai-answer-text');
    if(!node){node=document.createElement('div');node.id='omega-ai-answer-text';const host=document.getElementById('omega-ai-answer')||document.getElementById('minister-ai-answer')||document.getElementById('interrogation-answer')||document.getElementById('interrogation-modal-content');if(host)host.appendChild(node);}
    if(!node)return;
    node.textContent=String(text||'');node.dataset.source=meta.source||'OMEGA_UNIVERSAL_AI_RUNTIME';node.dataset.operation=meta.operation||'';
    if(meta.reasoning)node.dataset.reasoning=JSON.stringify(meta.reasoning).slice(0,5000);
    if(meta.conversation)node.dataset.conversation=JSON.stringify(meta.conversation).slice(0,3000);
    if(meta.gameLanguage)node.dataset.gameLanguage=JSON.stringify(meta.gameLanguage).slice(0,2000);
    const h=readHistory();h.push({role:'user',content:question,timestamp:Date.now()});h.push({role:'assistant',content:String(text||''),timestamp:Date.now(),source:meta.source||'',reasoning:meta.reasoning||null,conversation:meta.conversation||null,gameLanguage:meta.gameLanguage||null});writeHistory(h);
  }

  async function postJson(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data=null;try{data=await r.json();}catch(_){}if(!r.ok)throw new Error(data?.error||`HTTP_${r.status}`);return data||{};}
  async function ensureReasoningDispatcher(){if(global.OmegaReasoningDispatcher)return global.OmegaReasoningDispatcher;try{await loadScript('omega_reasoning_dispatcher.js');}catch(_){return null;}return global.OmegaReasoningDispatcher||null;}
  async function ensureGameLanguageLayer(ctx=context()){
    if(gameLanguagePromise){const bridge=await gameLanguagePromise;syncLanguageContext(ctx);return bridge;}
    gameLanguagePromise=(async()=>{try{if(!global.OmegaLanguageSystem)await loadScript('omega_language_system.js');if(!global.OmegaLanguageBatch03)await loadScript('omega_language_batch03_semantic_extension.js');const system=global.OmegaLanguageSystem,bridge=global.OmegaGameLanguageBridge||null;if(!system)return null;if(bridge){bridge.load(system.gameLanguageOntology());bridge.install();}syncLanguageContext(ctx,system);return bridge;}catch(_){return null;}})().catch(()=>null);
    const bridge=await gameLanguagePromise;syncLanguageContext(ctx);return bridge;
  }
  async function ensureProductionSemanticRuntime(){let rt=global.OmegaProductionSemanticRuntime;if(rt&&rt.VERSION==='4.1.0-PRODUCTION')return rt;try{await loadScript('omega_production_semantic_runtime_v3.js');}catch(_){return null;}rt=global.OmegaProductionSemanticRuntime;if(!rt)return null;if(typeof rt.diagnostics==='function'&&!rt.diagnostics().ready&&typeof rt.init==='function'){try{await rt.init();}catch(_) {}}return rt.VERSION==='4.1.0-PRODUCTION'?rt:null;}
  async function ensureCognitiveEngine(){if(global.OmegaCognitiveEngine||global.OmegaSharedCognition||global.OmegaCognitiveOS)return true;try{await loadScript('omega_cognitive_engine.js');}catch(_){return false;}return!!(global.OmegaCognitiveEngine||global.OmegaSharedCognition||global.OmegaCognitiveOS);}

  async function browserOffline(common=context()){
    await ensureConversationVocabulary();
    if(datasetPromise){await ensureGameLanguageLayer(common);await ensureProductionSemanticRuntime();return datasetPromise;}
    datasetPromise=(async()=>{await ensureGameLanguageLayer(common);await ensureProductionSemanticRuntime();await ensureReasoningDispatcher();await ensureCognitiveEngine();if(!global.OfflineSemanticBrain)await loadScript('offline_semantic_brain.js');if(!global.OfflineQueryEngine)await loadScript('offline_query_engine.js');const files=['resources.json','resources_2.json','economy.json','population.json','countries.json','relations.json','country_policy.json','world.json','society.json','offline_semantic_knowledge.json','resource_ontology.json','offline_language_vocabulary.json'];const loaded=await Promise.all(files.map(async f=>{try{const r=await fetch(asset(f),{cache:'no-store'});if(!r.ok)return null;return await r.json();}catch(_){return null;}}));const datasets=loaded.filter(Boolean);const vocab=loaded[files.indexOf('offline_language_vocabulary.json')]||conversationVocabulary||{};conversationVocabulary=vocab;if(global.OfflineSemanticBrain.configure){try{global.OfflineSemanticBrain.configure({datasets,vocabulary:vocab});}catch(_) {}}return{datasets};})().catch(e=>{datasetPromise=null;throw e;});return datasetPromise;
  }

  async function runOfflineDirect(question,common){
    const {datasets}=await browserOffline(common),bridge=await ensureGameLanguageLayer(common),system=global.OmegaLanguageSystem;syncLanguageContext(common,system);const production=await ensureProductionSemanticRuntime(),dispatcher=await ensureReasoningDispatcher();await ensureCognitiveEngine();
    if(production&&typeof production.parse==='function'&&typeof production.execute==='function'){
      const parsed=production.parse(question,{countryId:common.countryId,resourceId:common.resourceId,ministerId:common.ministerId,timeHorizon:common.timeHorizon,countryName:common.countryName,ministryId:common.ministryId,gameState:common.gameState});let result=production.execute(parsed,common);
      if(!result?.ok){const brain=global.OfflineSemanticBrain,engine=global.OfflineQueryEngine;if(!brain||!engine||typeof brain.parse!=='function'||typeof engine.execute!=='function')throw new Error('Compatibility offline execution engine is unavailable');const fallbackParsed=brain.parse(question,{countryId:common.countryId,resourceId:common.resourceId,ministerId:common.ministerId,timeHorizon:common.timeHorizon,countryName:common.countryName,ministryId:common.ministryId});const fallback=engine.execute(fallbackParsed,datasets,common.language,common);result={...fallback,semanticFallback:true,canonicalSemantic:parsed};}
      const reasoning=dispatcher?dispatcher.dispatch(question,parsed,result,{...common,gameState:common.gameState}):null;if(reasoning?.used&&reasoning.text&&!result?.text)result.text=reasoning.text;result.reasoning=reasoning;result.gameLanguage=parsed?.gameLanguage||bridge||null;return{parsed,result,reasoning,canonical:true};
    }
    const brain=global.OfflineSemanticBrain,engine=global.OfflineQueryEngine;if(!brain||!engine||typeof brain.parse!=='function'||typeof engine.execute!=='function')throw new Error('Browser semantic execution engines are unavailable');const parsed=brain.parse(question,{countryId:common.countryId,resourceId:common.resourceId,ministerId:common.ministerId,timeHorizon:common.timeHorizon,countryName:common.countryName,ministryId:common.ministryId});const result=engine.execute(parsed,datasets,common.language,common);const reasoning=dispatcher?dispatcher.dispatch(question,parsed,result,{...common,gameState:common.gameState}):null;if(reasoning?.used&&reasoning.text&&!result?.text)result.text=reasoning.text;result.reasoning=reasoning;result.gameLanguage=parsed?.gameLanguage||bridge||null;return{parsed,result,reasoning,canonical:false};
  }

  async function runTurn(question){
    const ctx=context();await ensureGameLanguageLayer(ctx);await ensureConversationVocabulary();syncLanguageContext(ctx);const conversation=localConversation(question);
    if(conversation?.text){output(conversation.text,question,{source:'OFFLINE_CONTEXTUAL_CONVERSATION',conversation});return;}
    const provider=String(localStorage.getItem('omega_ai_provider')||document.getElementById('omega-ai-provider')?.value||'OFFLINE').toUpperCase();const common={prompt:question,language:isBn(question)?'bn':'en',...ctx,timeHorizon:'CURRENT',history:historyContext()};syncLanguageContext(common);const dispatcher=await ensureReasoningDispatcher();
    if(provider.includes('GOOGLE')){try{const history=readHistory().slice(-40).map(x=>`${x.role}: ${x.content}`).join('\n');const data=await postJson('/api/ai/minister-consult',{...common,conversationHistory:history,gameState:common.gameState});if(data?.text){output(data.text,question,{source:data.aiPowered?`GOOGLE:${data.model||'GEMINI'}`:'OFFLINE_GROUNDED',reasoning:data.cognitiveTrace||data.result?.reasoning||null,gameLanguage:data.semantic?.gameLanguage||null});return;}if(data?.result?.text){output(data.result.text,question,{source:'OFFLINE_GROUNDED_FALLBACK',reasoning:data.cognitiveTrace||data.result.reasoning||null,gameLanguage:data.result.gameLanguage||null});return;}}catch(e){console.warn('[OMEGA UNIVERSAL AI] server/google transport unavailable:',e?.message||e);}}
    try{const data=await runOfflineDirect(question,common);const text=data?.result?.text||'The offline semantic executor could not produce an evidence-backed answer from the current game data.';output(text,question,{source:data.canonical?'BROWSER_PRODUCTION_SEMANTIC':'BROWSER_COMPATIBILITY_OFFLINE',operation:data?.result?.operation||'',reasoning:data?.reasoning||null,gameLanguage:data?.result?.gameLanguage||null});return;}catch(directError){try{const data=await postJson('/api/ai/semantic-query',{...common,gameState:common.gameState,reservesData:global.Omega?.World?.reservesData||null});const text=data?.result?.text||data?.text||data?.cognitiveTrace?.aiGroundingPacket?.answerEvidence||'The semantic runtime could not produce an evidence-backed answer from the current game state.';output(text,question,{source:'SERVER_OFFLINE_GROUNDED',operation:data?.result?.operation||'',reasoning:data?.cognitiveTrace||null,gameLanguage:data?.semantic?.gameLanguage||data?.result?.gameLanguage||null});}catch(serverError){throw new Error(`Semantic execution failed: ${directError.message}; server fallback: ${serverError.message}`);}}
  }
  function enqueue(question){const q=norm(question);if(!q)return;queue=queue.then(()=>runTurn(q)).catch(e=>{console.error('[OMEGA UNIVERSAL AI] turn failed',e);output(isBn(q)?`উত্তর তৈরির পাইপলাইনে সমস্যা হয়েছে: ${e.message}`:`The answer pipeline failed: ${e.message}`,q,{source:'PIPELINE_ERROR'});});}
  function submitFromUI(){const input=document.getElementById('interrogation-input');const q=input?.value||'';if(!norm(q))return;input.value='';enqueue(q);}
  function install(){if(installed||typeof document==='undefined')return;installed=true;document.addEventListener('click',e=>{const button=e.target?.closest?.('#btn-submit-interrogation');if(!button)return;e.preventDefault();e.stopImmediatePropagation();submitFromUI();},true);document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.target?.id!=='interrogation-input')return;e.preventDefault();e.stopImmediatePropagation();submitFromUI();},true);global.OmegaUniversalAIRuntime=Object.freeze({enqueue,submitFromUI,context,readHistory,syncLanguageContext,conversationIntent,questionSignals,version:'1.7.0',semanticAuthority:'OmegaProductionSemanticRuntime',cognitiveAuthority:'OmegaReasoningDispatcher'});console.log('[OMEGA UNIVERSAL AI] Contextual discourse + semantic + 40-stage cognitive pipeline installed.');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
