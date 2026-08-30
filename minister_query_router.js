/** MINISTER QUERY ROUTER v4.0.0 - compatibility adapter over the runtime semantic brain. */
(function(global){'use strict';
const VERSION='4.0.0';
const QueryIntent=Object.freeze({MINISTER_IDENTITY:'MINISTER_IDENTITY',RESOURCE_SECURITY:'RESOURCE_SECURITY',RESOURCE_STATUS:'RESOURCE_STATUS',RESOURCE_MINING_DISCOVERY:'RESOURCE_MINING_DISCOVERY',RESOURCE_PROCESSING_REFINING:'RESOURCE_PROCESSING_REFINING',RESOURCE_TRADE_TARIFF:'RESOURCE_TRADE_TARIFF',RESOURCE_LOGISTICS:'RESOURCE_LOGISTICS',RESOURCE_FORECAST:'RESOURCE_FORECAST',MACROECONOMICS:'MACROECONOMICS',DEMOGRAPHICS:'DEMOGRAPHICS',DEFENSE_MILITARY:'DEFENSE_MILITARY',ENERGY_POWER:'ENERGY_POWER',POLICY_DIRECTIVE:'POLICY_DIRECTIVE',GENERAL_STRATEGIC:'GENERAL_STRATEGIC',UNKNOWN:'UNKNOWN'});
function routeMinisterQuery(prompt,ministerContext={},worldContext={}){
 const b=global.OfflineSemanticBrain;
 if(!b)return{version:VERSION,intent:QueryIntent.UNKNOWN,domain:'UNKNOWN',entities:[],requiredData:[],confidence:0,error:'OFFLINE_SEMANTIC_BRAIN_NOT_INITIALIZED'};
 const p=b.parse(prompt,{countryId:worldContext.countryCode||ministerContext.countryCode,resourceId:worldContext.resourceId});
 const intentMap={MINISTER_IDENTITY:QueryIntent.MINISTER_IDENTITY,RESOURCE_MINING_DISCOVERY:QueryIntent.RESOURCE_MINING_DISCOVERY,RESOURCE_QUERY:QueryIntent.RESOURCE_STATUS,RESOURCE_SECURITY:QueryIntent.RESOURCE_SECURITY,CAUSAL_ANALYSIS:QueryIntent.GENERAL_STRATEGIC,POLICY_EVALUATION:QueryIntent.POLICY_DIRECTIVE,LOCATION_QUERY:QueryIntent.RESOURCE_MINING_DISCOVERY,GENERAL_QUERY:QueryIntent.GENERAL_STRATEGIC};
 const intent=intentMap[p.intent]||p.intent||QueryIntent.UNKNOWN;
 const entities=[];for(const[type,e]of Object.entries(p.entities||{}))if(e?.id)entities.push({type,id:e.id,confidence:e.confidence,source:e.source,surface:e.surface});
 const requiredData=[];if(p.entities.country?.id)requiredData.push('COUNTRY_PROFILE');if(p.entities.resource?.id)requiredData.push('RESOURCE_ENTITY');if(p.entities.asset?.id)requiredData.push('ASSET_COLLECTION');if(['COUNT','QUANTITY','LOCATE','SELECT'].includes(p.operation))requiredData.push('DETERMINISTIC_OPERATION');
 return{version:VERSION,intent,domain:p.intent||'GENERAL_QUERY',entities,requiredData,confidence:p.confidence,semantic:p,executable:p.executable};
}
const api=Object.freeze({VERSION,QueryIntent,routeMinisterQuery});global.MinisterQueryRouter=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
