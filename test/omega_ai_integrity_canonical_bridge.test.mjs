import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('omega_ai_integrity_canonical_bridge.js','utf8');
const semanticCalls=[];
const frozenIntegrity=Object.freeze({VERSION:'2.1.0',detectIntent(){return{intent:'OLD',confidence:0.1};}});
const context={
  OmegaAIIntegrity:frozenIntegrity,
  OmegaProductionSemanticRuntime:{
    VERSION:'3.4.0',
    parse(question,options){semanticCalls.push({question,options});return{operation:'LOOKUP',targetDomain:'COUNTRY',confidence:0.92};}
  },
  setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'omega_ai_integrity_canonical_bridge.js'});
assert.equal(context.OmegaAIIntegrityCanonicalBridge.install(),true);
assert.equal(Object.isFrozen(context.OmegaAIIntegrity),true,'the immutable integrity API must stay immutable');
assert.equal(Object.prototype.hasOwnProperty.call(context.OmegaAIIntegrity,'parse'),false,'bridge must not patch the frozen object');
const bridge=context.OmegaAIIntegrityCanonicalBridge.getApi();
assert.ok(bridge);
assert.equal(bridge.semanticVersion,'3.4.0');
assert.equal(bridge.SEMANTIC_AUTHORITY,'OmegaProductionSemanticRuntime');
assert.deepEqual(JSON.parse(JSON.stringify(bridge.parse('country status',{country:'BGD'}))),{
  operation:'LOOKUP',targetDomain:'COUNTRY',confidence:0.92
});
assert.deepEqual(JSON.parse(JSON.stringify(bridge.detectIntent('country status'))),{intent:'COUNTRY',confidence:0.92});
assert.equal(semanticCalls.length,2);
console.log('OMEGA immutable AI canonical bridge regression test passed');
