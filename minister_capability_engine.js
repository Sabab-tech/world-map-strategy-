/* OMEGA MINISTER CAPABILITY ENGINE v1.0.0 */
(function(global){'use strict';
const VERSION='1.0.0';
const state={profiles:new Map(),rules:{}};
const text=v=>String(v==null?'':v).trim();
function norm(v){return text(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function avg(v){const a=Object.values(v||{}).filter(x=>typeof x==='number');return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;}
function capability(profile,operation){const s=profile?.stats||{},e=profile?.efficiency||{};const corruption=typeof s.corruption==='number'?100-s.corruption:50;const W={AUDIT:{accuracy:.45,strategic:.30,discipline:.15,integrity:.10},CRISIS:{crisis_handling:.45,strategic:.25,discipline:.20,empathy:.10},EXECUTION:{decision_speed:.35,discipline:.30,strategic:.20,accuracy:.15},NEGOTIATION:{empathy:.30,strategic:.30,accuracy:.20,discipline:.10,integrity:.10},SECURITY:{discipline:.30,strategic:.30,crisis_handling:.25,integrity:.15},FISCAL:{accuracy:.40,strategic:.30,discipline:.20,integrity:.10},INDUSTRY:{accuracy:.25,discipline:.30,strategic:.25,decision_speed:.20},DIPLOMACY:{empathy:.35,strategic:.30,accuracy:.20,discipline:.15},RESEARCH:{accuracy:.30,strategic:.35,discipline:.15,decision_speed:.20}}[operation]||{accuracy:.25,strategic:.25,discipline:.20,decision_speed:.20,crisis_handling:.10};let total=0,weight=0;for(const[k,w]of Object.entries(W)){let value=k==='integrity'?corruption:(typeof s[k]==='number'?s[k]:(typeof e[k]==='number'?e[k]:0));total+=value*w;weight+=w;}return Number((total/Math.max(weight,.0001)).toFixed(2));}
function evaluate(profile,operation,base=100){const c=capability(profile,operation);const multiplier=0.5+c/200;return Object.freeze({operation,score:c,multiplier:Number(multiplier.toFixed(4)),effectiveValue:Number((base*multiplier).toFixed(2)),profileId:profile?.id||null});}
function register(profile){if(profile?.id)state.profiles.set(profile.id,profile);return profile?.id||null;}
function get(profileId,operation,base){return evaluate(state.profiles.get(profileId),operation,base);}
const api={VERSION,register,capability,evaluate,get};global.OmegaMinisterCapability=api;
})(typeof window!=='undefined'?window:globalThis);
