/* OMEGA UI INTERACTION GUARD v2.4.0
 * Modal-aware interaction gate. The minister interrogation dialog is an
 * authorized interactive surface and must never be blocked by the ministry
 * outside-click shield.
 *
 * Performance invariants:
 * - Never write an observed DOM attribute/style unless its value changes.
 * - Coalesce relevant DOM changes to one animation frame.
 * - Ignore unrelated deep UI mutations and avoid a permanent polling timer.
 */
(function(global){
'use strict';
if(global.__OMEGA_UI_INTERACTION_GUARD_V21__)return;
global.__OMEGA_UI_INTERACTION_GUARD_V21__=true;
const MINISTRY='#ministry-dashboard-view',INTERROGATION='#minister-interrogation-modal',CABINET='#cabinet-full-window',COMMAND='#command-hub-modal',STYLE_ID='omega-ui-interaction-guard-v22';
const SURFACE_SELECTOR=[MINISTRY,INTERROGATION,CABINET,COMMAND].join(',');
let pendingSyncFrame=null;
const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;};
const active=()=>visible(document.querySelector(MINISTRY));
const interactiveOverlay=()=>visible(document.querySelector(INTERROGATION));
// UI v2 reuses the cabinet as its host. Preserve its interaction surface when
// a legacy ministry overlay briefly remains active during a layer transition.
const activeV2Cabinet=()=>{const c=document.querySelector(CABINET);return!!(c&&c.getAttribute('data-omega-ui-v2-active')==='true');};
function setAttributeIfChanged(el,name,value){
 if(el&&el.getAttribute(name)!==value)el.setAttribute(name,value);
}
function setStyleIfChanged(el,name,value){
 if(el&&el.style&&el.style[name]!==value)el.style[name]=value;
}
function install(){
 if(document.getElementById(STYLE_ID))return;
 const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
 html,body,#app{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none!important}
 #ui-engine-root{position:fixed!important;inset:0!important;z-index:100!important;pointer-events:none!important}
 ${MINISTRY}{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;transform:none!important;margin:0!important;display:none;flex-direction:column;min-height:0!important;overflow:hidden!important;z-index:9000!important;isolation:isolate;contain:layout paint style;pointer-events:none!important}
 ${MINISTRY}.omega-ui-active,${MINISTRY}[aria-hidden="false"]{display:flex!important;pointer-events:auto!important}
 ${MINISTRY}>.sticky-layer-header{position:sticky!important;top:0!important;flex:0 0 auto!important;z-index:100!important}
 #ministry-dashboard-content{position:relative!important;display:block!important;flex:1 1 0!important;min-height:0!important;height:auto!important;width:100%!important;max-height:none!important;overflow:auto!important;overflow-x:hidden!important;overflow-y:scroll!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;touch-action:pan-y pinch-zoom!important;box-sizing:border-box;isolation:isolate;padding-bottom:max(32px,env(safe-area-inset-bottom))!important}
 #ministry-dashboard-content>*{box-sizing:border-box;max-width:100%}
 #ministry-dashboard-content button,#ministry-dashboard-content a,#ministry-dashboard-content input,#ministry-dashboard-content select,#ministry-dashboard-content textarea,#ministry-dashboard-content [role="button"]{pointer-events:auto!important;touch-action:manipulation!important;position:relative!important;z-index:2!important}
 ${INTERROGATION}{pointer-events:auto!important;z-index:100000!important}
 ${INTERROGATION} input,${INTERROGATION} button,${INTERROGATION} textarea,${INTERROGATION} select,${INTERROGATION} [role="button"]{pointer-events:auto!important;touch-action:manipulation!important;position:relative!important;z-index:100001!important}
 ${CABINET},${COMMAND},#render-engine-root,#map,.ui-bottom-navigation,.ui-right-controls,#special-map-controls{isolation:isolate}
 ${CABINET}{z-index:4000!important}
 body.omega-ministry-active ${CABINET}:not([data-omega-ui-v2-active="true"]),body.omega-ministry-active ${COMMAND},body.omega-ministry-active #render-engine-root,body.omega-ministry-active #map,body.omega-ministry-active #special-map-controls,body.omega-ministry-active .ui-bottom-navigation,body.omega-ministry-active .ui-right-controls{pointer-events:none!important}
 body.omega-ministry-active ${CABINET}[data-omega-ui-v2-active="true"],body.omega-ministry-active ${CABINET}[data-omega-ui-v2-active="true"] *{pointer-events:auto!important}
 body.omega-ministry-active ${MINISTRY},body.omega-ministry-active ${MINISTRY} *{pointer-events:auto!important}
 .omega-ministry-scroll-surface{overflow:auto!important;overflow-y:scroll!important;touch-action:pan-y pinch-zoom!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important}
 `;
 document.head.appendChild(s);
}
function setSurface(){
 const m=document.querySelector(MINISTRY),content=document.querySelector('#ministry-dashboard-content'),interrogation=document.querySelector(INTERROGATION),on=active(),overlay=interactiveOverlay();
 if(document.body&&document.body.classList)document.body.classList.toggle('omega-ministry-active',on);
 if(m){m.classList.toggle('omega-ui-active',on);setAttributeIfChanged(m,'aria-hidden',on?'false':'true');}
 if(content&&!content.classList.contains('omega-ministry-scroll-surface'))content.classList.add('omega-ministry-scroll-surface');
 if(interrogation){
   setStyleIfChanged(interrogation,'pointerEvents',overlay?'auto':'none');
   setAttributeIfChanged(interrogation,'aria-hidden',overlay?'false':'true');
   if(overlay){
     setStyleIfChanged(interrogation,'zIndex','100000');
     interrogation.querySelectorAll('input,button,textarea,select,[role="button"]').forEach(el=>{
       setStyleIfChanged(el,'pointerEvents','auto');
       setStyleIfChanged(el,'touchAction','manipulation');
     });
   }
 }
 const c=document.querySelector(CABINET),cmd=document.querySelector(COMMAND),v2CabinetActive=activeV2Cabinet();
 setAttributeIfChanged(c,'aria-hidden',on&&!v2CabinetActive?'true':'false');
 setAttributeIfChanged(cmd,'aria-hidden',on?'true':'false');
}
function allowedTarget(target){const m=document.querySelector(MINISTRY),i=document.querySelector(INTERROGATION),c=document.querySelector(CABINET);return!!(m?.contains(target)||i?.contains(target)||(activeV2Cabinet()&&c?.contains(target)));}
function blockOutside(e){if(!active())return;if(allowedTarget(e.target))return;e.preventDefault();e.stopImmediatePropagation();}
function containsSurface(el){
 if(!el||el.nodeType!==1)return false;
 if(el.matches&&el.matches(SURFACE_SELECTOR))return true;
 const surfaces=[document.querySelector(MINISTRY),document.querySelector(INTERROGATION),document.querySelector(CABINET),document.querySelector(COMMAND)];
 return surfaces.some(surface=>surface&&(surface===el||(typeof el.contains==='function'&&el.contains(surface))));
}
function scheduleSurfaceSync(){
 if(pendingSyncFrame!==null)return;
 const run=()=>{pendingSyncFrame=null;setSurface();};
 if(typeof global.requestAnimationFrame==='function')pendingSyncFrame=global.requestAnimationFrame(run);
 else pendingSyncFrame=global.setTimeout(run,16);
}
function relevantMutations(records){
 for(const record of records||[]){
   if(record.type==='attributes'){
     if(record.target===document.body||containsSurface(record.target))return true;
   }else if(record.type==='childList'){
     if(record.target===document.body||containsSurface(record.target))return true;
     for(const node of [...(record.addedNodes||[]),...(record.removedNodes||[])]){
       if(containsSurface(node))return true;
     }
   }
 }
 return false;
}
function boot(){
 install();
 for(const t of ['pointerdown','pointerup','click','touchstart','touchend','mousedown','mouseup','focusin'])document.addEventListener(t,blockOutside,true);
 document.addEventListener('wheel',e=>{if(!active())return;if(allowedTarget(e.target))return;e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
 if(typeof global.MutationObserver==='function'){
   const observer=new global.MutationObserver(records=>{if(relevantMutations(records))scheduleSurfaceSync();});
   observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});
 }
 global.addEventListener('pageshow',scheduleSurfaceSync);
 global.addEventListener('resize',scheduleSurfaceSync,{passive:true});
 global.addEventListener('transitionend',scheduleSurfaceSync,true);
 document.addEventListener('visibilitychange',scheduleSurfaceSync);
 setSurface();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
global.OmegaUIInteractionGuard={version:'2.4.0',refresh:setSurface,scheduleRefresh:scheduleSurfaceSync};
})(window);
