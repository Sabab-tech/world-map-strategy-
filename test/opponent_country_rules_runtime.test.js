import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../opponent_country_rules.js',import.meta.url),'utf8');

const queued=[];
const registeredActions=new Map();
const registeredHandlers=new Map();

const sandbox={
  console,
  Map,
  Set,
  WeakMap,
  Object,
  Array,
  Number,
  String,
  JSON,
  Promise,
  Math,
  CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
  addEventListener(){},
  fetch:async()=>({ok:true,json:async()=>({
    countries:[
      {code:'AAA',name:'Alpha'},
      {code:'BBB',name:'Bravo'},
      {code:'CCC',name:'Charlie'}
    ]
  })}),
  Game:{
    state:{
      simulation:{turn:4,session:{playerCountryId:'AAA'}},
      economy:{
        BBB:{gdp:100,inflation:10,gdp_growth:-1,debt:90,trade_balance:-10}
      },
      interior:{BBB:{stability:40}},
      military:{BBB:{readiness:50}}
    }
  },
  Omega:{
    Simulation:{
      clock:{turn:4},
      getPlayerCountryId(){return 'AAA';},
      enqueueCommand(command){queued.push(command);return command;}
    },
    MinistryInteroperability:{
      registerAction(id,definition){registeredActions.set(id,definition);return definition;},
      registerCommandHandler(type,owner,handler){registeredHandlers.set(type,{owner,handler});return {commandType:type,ownerMinistry:owner};},
      evaluateAction(_owner,actionId){return registeredActions.has(actionId)?{status:'OBSERVED'}:{status:'UNKNOWN'};}
    }
  },
  OmegaCanonicalIdentityRegistry:{
    exportData(){return {countries:[{id:'AAA'},{id:'BBB'},{id:'CCC'}]};},
    resolveCountry(id){return [{id:'AAA',raw:{code:'AAA'}},{id:'BBB',raw:{code:'BBB'}},{id:'CCC',raw:{code:'CCC'}}].find(x=>x.id===id)||null;}
  }
};

vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'opponent_country_rules.js'});

const api=sandbox.Omega.OpponentCountryRules;
assert.ok(api);
await api.initialize({fetchCountries:true,turn:4});

const result=await api.onTurnCommitted(4);
assert.equal(result.status,'COMPLETE');
assert.equal(result.opponents,2);
assert.ok(result.decisions>0);
assert.ok(registeredActions.size>0);
assert.ok(registeredHandlers.size>0);
assert.ok(queued.length>0);

const decision=await api.evaluateCountry('BBB',5);
assert.equal(decision.countryId,'BBB');
assert.ok(decision.decisions.length>0);
assert.equal(api.diagnostics().version,'1.0.0');

console.log('OMEGA OPPONENT COUNTRY RULES TEST PASSED');
console.log(JSON.stringify({
  opponentCountries:result.opponents,
  decisions:result.decisions,
  queued:result.queued.filter(x=>x.status==='QUEUED').length,
  registeredActions:registeredActions.size
}));
