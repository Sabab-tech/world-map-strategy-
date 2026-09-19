/* OMEGA AI PROVIDER v1.0.0
 * Single provider boundary. Deterministic OMEGA systems remain authoritative.
 */
(function(global){
  'use strict';
  if(global.OmegaAIProvider?.VERSION==='1.0.0')return;
  const VERSION='1.0.0';
  const C=()=>global.OmegaAIRuntimeContract;
  const Offline=()=>global.OmegaOfflineAIBridge;
  const text=v=>String(v==null?'':v).trim();
  const clone=v=>{try{return v===undefined?undefined:JSON.parse(JSON.stringify(v));}catch(_){return null;}};

  class GeminiProvider{
    constructor(options={}){
      this.name='gemini';
      this.endpoint=text(options.endpoint)||'/api/ai/semantic-query';
      this.native=options.native||global.OmegaAndroidGemini||null;
    }
    async isAvailable(){
      if(this.native&&(typeof this.native.generate==='function'||typeof this.native.infer==='function'))return true;
      return typeof fetch==='function'&&(typeof navigator==='undefined'||navigator.onLine!==false);
    }
    async generate(request){
      if(this.native){
        try{
          const result=typeof this.native.generate==='function'?await this.native.generate(clone(request)):await this.native.infer(clone(request));
          return C().createEnvelope({...result,provider:'gemini',mode:'online'});
        }catch(error){
          return C().createEnvelope({status:'INFERENCE_FAILED',provider:'gemini',mode:'online',error:text(error?.message||error)});
        }
      }
      if(typeof fetch!=='function')return C().createEnvelope({status:'AI_UNAVAILABLE',provider:'gemini',mode:'online',error:'fetch unavailable'});
      const response=await fetch(this.endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          prompt:request.question,
          canonicalAuthority:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME',
          canonicalContextPacket:{
            question:request.question,
            language:request.language,
            intent:request.intent,
            domain:request.domain,
            evidence:clone(request.evidence),
            context:clone(request.context),
            gameState:clone(request.gameState),
            history:clone(request.history)
          }
        })
      });
      if(!response.ok)throw new Error('Gemini gateway HTTP '+response.status);
      const data=await response.json();
      return C().createEnvelope({...data,provider:'gemini',mode:'online'});
    }
  }

  class OfflineProvider{
    constructor(bridge=Offline()){this.name='offline';this.bridge=bridge;}
    async isAvailable(){
      if(!this.bridge?.init)return false;
      const status=await this.bridge.init();
      return status.ok===true;
    }
    async generate(request){
      if(!this.bridge?.generate)return C().createEnvelope({status:'AI_UNAVAILABLE',provider:'offline',mode:'offline',error:'offline bridge unavailable'});
      return C().createEnvelope(await this.bridge.generate(clone(request)));
    }
  }

  class Provider{
    constructor(options={}){
      this.gemini=options.gemini||new GeminiProvider(options.geminiOptions||{});
      this.offline=options.offline||new OfflineProvider();
    }
    async request(rawRequest){
      const validation=C().validateRequest(rawRequest);
      if(!validation.ok)return C().createEnvelope({status:'INVALID_REQUEST',error:validation.errors.join('; ')});
      const request=validation.request;
      const forced=text(rawRequest?.provider).toLowerCase();
      const online=typeof navigator==='undefined'?true:navigator.onLine!==false;
      if(forced==='offline'||!online)return this._offline(request,forced==='offline'?'FORCED_OFFLINE':null);
      try{
        if(await this.gemini.isAvailable()){
          const result=C().validateResponse(await this.gemini.generate(request));
          if(result.ok&&result.response.status==='OK')return result.response;
          if(result.ok&&result.response.status!=='INFERENCE_FAILED'&&result.response.status!=='AI_UNAVAILABLE')return result.response;
        }
      }catch(_){}
      return this._offline(request,'GEMINI_FALLBACK');
    }
    async _offline(request,fallbackFrom){
      try{
        if(await this.offline.isAvailable()){
          const result=C().validateResponse(await this.offline.generate(request));
          if(result.ok)return {...result.response,fallbackFrom:fallbackFrom||result.response.fallbackFrom};
        }
        const reason=this.offline.bridge?.diagnostics?.().initError||'offline provider unavailable';
        return C().createEnvelope({
          status:'AI_UNAVAILABLE',
          provider:'offline',
          mode:'offline',
          fallbackFrom,
          error:reason,
          text:'AI is unavailable locally; deterministic OMEGA systems remain functional.'
        });
      }catch(error){
        return C().createEnvelope({
          status:'AI_UNAVAILABLE',
          provider:'offline',
          mode:'offline',
          fallbackFrom,
          error:text(error?.message||error),
          text:'AI is unavailable locally; deterministic OMEGA systems remain functional.'
        });
      }
    }
  }

  function isAIEndpoint(input){
    try{
      const url=new URL(typeof input==='string'?input:(input?.url||''),typeof location!=='undefined'?location.href:undefined);
      return url.pathname.endsWith('/api/ai/minister-consult')||url.pathname.endsWith('/api/ai/semantic-query');
    }catch(_){return false;}
  }
  function installFetchBridge(){
    if(global.__omegaAIProviderFetchBridgeInstalled||typeof global.fetch!=='function')return false;
    const nativeFetch=global.fetch.bind(global);
    global.__omegaAIProviderFetchBridgeInstalled=true;
    global.fetch=async function(input,init={}){
      const headers=init?.headers||{};
      if(headers['X-OMEGA-AI-PROVIDER-INTERNAL']||headers['x-omega-ai-provider-internal'])return nativeFetch(input,init);
      if(!isAIEndpoint(input))return nativeFetch(input,init);
      let body={};
      try{body=JSON.parse(String(init?.body||'{}'));}catch(_){}
      const result=await instance.request({
        ...body,
        question:body.prompt||body.question||'',
        evidence:body.canonicalContextPacket?.evidence||body.evidence||[],
        context:body.canonicalContextPacket?.context||body.context||{},
        gameState:body.canonicalContextPacket?.gameState||body.gameState||{},
        history:body.canonicalContextPacket?.history||body.conversationHistory||[]
      });
      const payload=JSON.stringify(result);
      if(typeof Response==='function')return new Response(payload,{status:200,headers:{'Content-Type':'application/json'}});
      return {ok:true,status:200,json:async()=>JSON.parse(payload),text:async()=>payload};
    };
    return true;
  }

  const instance=new Provider();
  installFetchBridge();
  global.OmegaAIProvider=Object.freeze({
    VERSION,
    GeminiProvider,
    OfflineProvider,
    create(options={}){return new Provider(options);},
    request(request){return instance.request(request);}
  });
})(typeof globalThis!=='undefined'?globalThis:window);
