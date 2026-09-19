const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

function load(path,sandbox){
  vm.runInNewContext(fs.readFileSync(path,'utf8'),sandbox,{filename:path});
}

const sandbox={
  console,JSON,Object,Number,String,RegExp,Map,Set,Array,Math,Promise,
  navigator:{onLine:true},
  fetch:async()=>({ok:false,status:503,json:async()=>({})}),
  setTimeout,clearTimeout
};
sandbox.globalThis=sandbox;

load('omega_ai_runtime_contract.js',sandbox);
load('omega_offline_ai_bridge.js',sandbox);
load('omega_ai_provider.js',sandbox);

(async()=>{
  const contract=sandbox.OmegaAIRuntimeContract;
  assert.equal(contract.validateCommand({
    intent:'CHANGE_POLICY',domain:'DEFENSE',action:'ADJUST_BUDGET',
    target:'DEFENSE_BUDGET',value:12
  }).ok,true);
  assert.equal(contract.validateCommand({
    intent:'CHANGE_POLICY',domain:'DEFENSE'
  }).ok,false);

  const provider=sandbox.OmegaAIProvider.create({
    gemini:{
      isAvailable:async()=>true,
      generate:async()=>contract.createEnvelope({
        status:'OK',provider:'gemini',mode:'online',text:'online'
      })
    },
    offline:{
      isAvailable:async()=>true,
      generate:async()=>contract.createEnvelope({
        status:'OK',provider:'offline',mode:'offline',text:'offline'
      })
    }
  });

  let result=await provider.request({question:'test',evidence:[]});
  assert.equal(result.provider,'gemini');

  sandbox.navigator.onLine=false;
  result=await provider.request({question:'test',evidence:[]});
  assert.equal(result.provider,'offline');

  sandbox.navigator.onLine=true;
  const failing=sandbox.OmegaAIProvider.create({
    gemini:{
      isAvailable:async()=>true,
      generate:async()=>{throw new Error('network down');}
    },
    offline:{
      isAvailable:async()=>true,
      generate:async()=>contract.createEnvelope({
        status:'OK',provider:'offline',mode:'offline',text:'fallback'
      })
    }
  });
  result=await failing.request({question:'test',evidence:[]});
  assert.equal(result.provider,'offline');
  assert.equal(result.fallbackFrom,'gemini_fallback');

  const manifest=JSON.parse(fs.readFileSync('offline_ai/manifest.json','utf8'));
  assert.equal(manifest.status,'INSPECTED_NOT_ANDROID_COMPATIBLE');
  assert.equal(manifest.androidCompatibility.localInferenceSupported,false);

  console.log('OMEGA HYBRID AI PROVIDER TEST PASSED');
})().catch(error=>{console.error(error);process.exit(1);});
