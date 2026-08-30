/* OMEGA MINISTER CAPABILITY ENGINE v2.1.0 */
(function(global){'use strict';
const VERSION='2.1.0',state={profiles:new Map()};
const clamp=(v,a=0,b=100)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):a;
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const DEFAULT_WEIGHTS={AUDIT:{accuracy:.45,strategic:.30,discipline:.15,integrity:.10},CRISIS:{crisis_handling:.45,strategic:.25,discipline:.20,empathy:.10},EXECUTION:{decision_speed:.35,discipline:.30,strategic:.20,accuracy:.15},NEGOTIATION:{empathy:.30,strategic:.30,accuracy:.20,discipline:.10,integrity:.10},SECURITY:{discipline:.30,strategic:.30,crisis_handling:.25,integrity:.15},FISCAL:{accuracy:.40,strategic:.30,discipline:.20,integrity:.10},INDUSTRY:{accuracy:.25,discipline:.30,strategic:.25,decision_speed:.20},DIPLOMACY:{empathy:.35,strategic:.30,accuracy:.20,discipline:.15},RESEARCH:{accuracy:.30,strategic:.35,discipline:.15,decision_speed:.20}};
function weights(){return global.OmegaMinisterStateRegistry?.getConfig?.()?.capabilityWeights||global.OmegaMinisterRuntimeConfig?.capabilityWeights||DEFAULT_WEIGHTS;}
function capability(profile,operation='EXECUTION'){
 const s=profile?.baseStats||profile?.stats||{},e=profile?.efficiencyProfile||profile?.efficiency||{},W=weights()[operation]||weights().EXECUTION||DEFAULT_WEIGHTS.EXECUTION;
 const integrity=100-num(s.corruption);let total=0,weight=0;
 for(const[k,w]of Object.entries(W)){const value=k==='integrity'?integrity:(Number.isFinite(Number(s[k]))?Number(s[k]):num(e[k]));total+=value*w;weight+=w;}
 return Number((total/Math.max(weight,.0001)).toFixed(2));
}
function evaluate(profile,operation='EXECUTION',context={}){
 const base=capability(profile,operation),taskFit=clamp(context.taskFit??1,.5,1.25),experienceFactor=1+clamp(context.experience??0,0,100)/400,informationQuality=clamp(context.informationQuality??1,.5,1),workloadFactor=1-(clamp(context.workload??0,0,100)/100)*clamp(context.workloadPenalty??.35,0,.7),stressFactor=1-(clamp(context.stress??0,0,100)/100)*clamp(context.stressPenalty??.30,0,.7),timePressureFactor=clamp(context.timePressureFactor??1,.6,1.05);
 const value=clamp(base*taskFit*experienceFactor*informationQuality*workloadFactor*stressFactor*timePressureFactor,0,100);
 return Object.freeze({operation,baseCapability:base,taskFit:Number(taskFit.toFixed(3)),experienceFactor:Number(experienceFactor.toFixed(3)),informationQuality:Number(informationQuality.toFixed(3)),workloadFactor:Number(workloadFactor.toFixed(3)),stressFactor:Number(stressFactor.toFixed(3)),timePressureFactor:Number(timePressureFactor.toFixed(3)),effectiveCapability:Number(value.toFixed(2)),profileId:profile?.id||profile?.ministerId||null});
}
function register(profile){const id=profile?.id||profile?.ministerId;if(id)state.profiles.set(id,Object.freeze({...profile}));return id||null;}
function get(profileId,operation,context={}){return evaluate(state.profiles.get(profileId),operation,context)}
global.OmegaMinisterCapability={VERSION,register,capability,evaluate,get};
})(typeof window!=='undefined'?window:globalThis);
