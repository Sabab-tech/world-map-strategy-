/* OMEGA LIVE MINISTER SELECTOR v2.1.0-PRODUCTION */
(function(global){
'use strict';
var VERSION='2.1.0-PRODUCTION',KEY='OMEGA_APPOINTED_MINISTERS_V2';
function text(v){return v==null?'':String(v).trim();}
function game(){return global.Game||{};}
function country(){var g=game(),s=g.state||{};return text(g.currentActiveCountry||s.countryId||s.playerCountryId||'BANGLADESH').toUpperCase().replace(/\s+/g,'_');}
function load(){try{return JSON.parse(global.localStorage.getItem(KEY)||'{}');}catch(e){return{};}}
function save(v){try{global.localStorage.setItem(KEY,JSON.stringify(v));}catch(e){}}
function selectedIndex(ministry){var v=load()[country()+'_'+ministry];v=Number(v);return isFinite(v)&&v>=0?Math.floor(v):0;}
function profile(ministry){var ui=global.OmegaCabinetUI;if(!ui||typeof ui.getMinisterProfile!=='function')return null;try{return ui.getMinisterProfile(ministry,country());}catch(e){return null;}}
function candidates(ministry){var p=profile(ministry);return p&&Array.isArray(p.candidates)?p.candidates:[];}
function remove(){var old=document.getElementById('omega-live-minister-selector');if(old&&old.parentNode)old.parentNode.removeChild(old);}
function install(ministry){var ui=global.OmegaCabinetUI,dash=document.getElementById('ministry-dashboard-view');if(!ui||!dash||!ministry)return false;var cs=candidates(ministry);if(!cs.length)return false;remove();var i=Math.min(selectedIndex(ministry),cs.length-1);if(i<0)i=0;var box=document.createElement('div');box.id='omega-live-minister-selector';box.className='omega-minister-selector';box.innerHTML='<label>MINISTER</label><select id="omega-minister-choice" aria-label="Change Minister"></select><button type="button" id="omega-minister-appoint">CHANGE MINISTER</button><span id="omega-minister-selector-status">CURRENT</span>';var select=box.querySelector('#omega-minister-choice'),n;
for(n=0;n<cs.length;n++){var c=cs[n]||{},option=document.createElement('option');option.value=String(n);option.textContent=text(c.name||c.baseName||c.ministerName||c.id||('Candidate '+(n+1)))+' • '+text(c.id||c.ministerId||'');select.appendChild(option);}select.value=String(i);var anchor=dash.querySelector('[data-minister-selector-host]');if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor);else dash.insertBefore(box,dash.firstChild||null);
function appoint(){var k=Number(select.value),c=cs[k];if(!c)return;var store=load();store[country()+'_'+ministry]=k;save(store);ui.appointedMinisterIndex=ui.appointedMinisterIndex||{};ui.appointedMinisterIndex[ministry]=k;ui.currentInterrogatedMinister={};for(var prop in c)ui.currentInterrogatedMinister[prop]=c[prop];ui.currentInterrogatedMinister.ministerId=text(c.ministerId||c.id);ui.currentInterrogatedMinister.ministryId=ministry;ui.currentInterrogatedMinister.countryCode=country();ui.currentInterrogatedMinister.ministerName=text(c.ministerName||c.name||c.baseName);box.querySelector('#omega-minister-selector-status').textContent='APPOINTED: '+ui.currentInterrogatedMinister.ministerName;if(typeof ui.renderMinistryDashboard==='function'){ui.__liveSelectorRefresh=true;ui.renderMinistryDashboard(ministry);setTimeout(function(){ui.__liveSelectorRefresh=false;install(ministry);},0);}}
select.addEventListener('change',function(){box.querySelector('#omega-minister-selector-status').textContent='READY TO CHANGE';});box.querySelector('#omega-minister-appoint').addEventListener('click',appoint);return true;}
function patch(){var ui=global.OmegaCabinetUI;if(!ui||ui.__liveMinisterSelectorV21)return false;ui.__liveMinisterSelectorV21=true;if(typeof ui.renderMinistryDashboard==='function'){var render=ui.renderMinistryDashboard;ui.renderMinistryDashboard=function(ministry){var result=render.apply(this,arguments);setTimeout(function(){install(ministry);},0);return result;};}return true;}
function boot(){if(patch())return;setTimeout(boot,250);}
global.OmegaLiveMinisterSelector={VERSION:VERSION,install:install};boot();
})(typeof globalThis!=='undefined'?globalThis:window);
