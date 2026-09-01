/* OMEGA LIVE MINISTER SELECTOR + SEMANTIC QUESTION BINDING v3.0.0-PRODUCTION */
(function(global){
'use strict';
var VERSION='3.0.0-PRODUCTION',KEY='OMEGA_APPOINTED_MINISTERS_V3';
function text(v){return v==null?'':String(v).trim();}
function game(){return global.Game||{};}
function country(){var g=game(),s=g.state||{};return text(g.currentActiveCountry||s.countryId||s.playerCountryId||'BANGLADESH').toUpperCase().replace(/\s+/g,'_');}
function load(){try{return JSON.parse(global.localStorage.getItem(KEY)||'{}');}catch(e){return{};}}
function save(v){try{global.localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}}
function selectedIndex(ministry){var v=Number(load()[country()+'_'+ministry]);return isFinite(v)&&v>=0?Math.floor(v):0;}
function profile(ministry){var ui=global.OmegaCabinetUI;if(!ui||typeof ui.getMinisterProfile!=='function')return null;try{return ui.getMinisterProfile(ministry,country());}catch(e){return null;}}
function candidates(ministry){var p=profile(ministry);return p&&Array.isArray(p.candidates)?p.candidates:[];}
function remove(){var old=document.getElementById('omega-live-minister-selector');if(old&&old.parentNode)old.parentNode.removeChild(old);}
function setActive(ui,ministry,c){if(!c)return;ui.appointedMinisterIndex=ui.appointedMinisterIndex||{};var i=c.__omegaIndex;if(i!=null)ui.appointedMinisterIndex[ministry]=Number(i);ui.currentInterrogatedMinister={};for(var k in c)if(k!=='__omegaIndex')ui.currentInterrogatedMinister[k]=c[k];ui.currentInterrogatedMinister.ministerId=text(c.ministerId||c.id);ui.currentInterrogatedMinister.ministryId=ministry;ui.currentInterrogatedMinister.countryCode=country();ui.currentInterrogatedMinister.ministerName=text(c.ministerName||c.name||c.baseName);}
function install(ministry){
 var ui=global.OmegaCabinetUI,dash=document.getElementById('ministry-dashboard-view');if(!ui||!dash||!ministry)return false;
 var cs=candidates(ministry);if(!cs.length)return false;remove();
 var i=Math.min(selectedIndex(ministry),cs.length-1);if(i<0)i=0;
 var box=document.createElement('div');box.id='omega-live-minister-selector';box.className='omega-minister-selector';box.innerHTML='<label>MINISTER</label><select id="omega-minister-choice" aria-label="Change Minister"></select><button type="button" id="omega-minister-appoint">CHANGE MINISTER</button><span id="omega-minister-selector-status">CURRENT</span>';
 var select=box.querySelector('#omega-minister-choice'),n,c;
 for(n=0;n<cs.length;n++){c=cs[n]||{};var option=document.createElement('option');option.value=String(n);option.textContent=text(c.name||c.baseName||c.ministerName||c.id||('Candidate '+(n+1)))+' • '+text(c.id||c.ministerId||'');select.appendChild(option);}
 select.value=String(i);c=cs[i]||{};c.__omegaIndex=i;setActive(ui,ministry,c);
 var host=dash.querySelector('.sticky-layer-header');if(host&&host.parentNode)host.parentNode.insertBefore(box,host);else dash.insertBefore(box,dash.firstChild||null);
 function appoint(){var k=Number(select.value),candidate=cs[k];if(!candidate)return;candidate.__omegaIndex=k;var store=load();store[country()+'_'+ministry]=k;save(store);setActive(ui,ministry,candidate);box.querySelector('#omega-minister-selector-status').textContent='APPOINTED: '+ui.currentInterrogatedMinister.ministerName;if(typeof ui.renderMinistryDashboard==='function'){ui.__omegaSelectorRefreshing=true;ui.renderMinistryDashboard(ministry);setTimeout(function(){ui.__omegaSelectorRefreshing=false;install(ministry);},50);}}
 select.addEventListener('change',function(){box.querySelector('#omega-minister-selector-status').textContent='READY TO CHANGE';});box.querySelector('#omega-minister-appoint').addEventListener('click',appoint);return true;
}
function patchSelector(){var ui=global.OmegaCabinetUI;if(!ui||ui.__omegaSelectorV3)return false;ui.__omegaSelectorV3=true;if(typeof ui.renderMinistryDashboard==='function'){var render=ui.renderMinistryDashboard;ui.renderMinistryDashboard=function(ministry){var result=render.apply(this,arguments);if(!this.__omegaSelectorRefreshing)setTimeout(function(){install(ministry);},0);return result;};}return true;}
function patchQuestion(){var ui=global.OmegaCabinetUI,semantic=global.OmegaProductionSemanticRuntime;if(!ui||!semantic||typeof semantic.buildAnswerPlan!=='function'||typeof semantic.formatOfflineAnswer!=='function'||typeof ui.processQuestionAndReply!=='function')return false;if(ui.__omegaSemanticV3)return true;ui.__omegaSemanticV3=true;var original=ui.processQuestionAndReply;ui.processQuestionAndReply=function(minister,questionText){var q=text(questionText),m=minister||ui.currentInterrogatedMinister||{},id=text(m.ministerId||m.id);try{var identity={countryCode:country(),ministryId:text(m.ministryId||global.OmegaLayerManager&&global.OmegaLayerManager.activeMinistryId),ministerId:id,ministerName:text(m.ministerName||m.name||m.baseName)},plan=semantic.buildAnswerPlan(q,identity,game().state||{},ui.chatHistories&&ui.chatHistories[id]||[]),answer=semantic.formatOfflineAnswer(plan);if(answer&&id){ui.chatHistories=ui.chatHistories||{};ui.chatHistories[id]=ui.chatHistories[id]||[];ui.chatHistories[id].push({sender:'USER',text:q,timestamp:Date.now()});ui.chatHistories[id].push({sender:'MINISTER',text:answer,response:answer,timestamp:Date.now(),semanticPlan:plan.semantic||plan,evidence:plan.result||null,source:'OMEGA_PRODUCTION_SEMANTIC_RUNTIME_V4_1'});if(typeof ui.renderChatHistory==='function')ui.renderChatHistory(id);return answer;}}catch(e){console.error('[OMEGA semantic question]',e);}return original.call(ui,minister,questionText);};return true;}
function boot(){patchSelector();if(patchQuestion())return;setTimeout(boot,200);}
global.OmegaLiveMinisterSelector={VERSION:VERSION,install:install};boot();
})(typeof globalThis!=='undefined'?globalThis:window);