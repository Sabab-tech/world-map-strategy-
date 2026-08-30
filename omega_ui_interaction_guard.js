/* OMEGA UI INTERACTION GUARD v2.1.0 */
(function(global){'use strict';
  if(global.__OMEGA_UI_INTERACTION_GUARD_V21__)return;global.__OMEGA_UI_INTERACTION_GUARD_V21__=true;
  const MINISTRY='#ministry-dashboard-view',CABINET='#cabinet-full-window',COMMAND='#command-hub-modal',STYLE_ID='omega-ui-interaction-guard-v21';
  const visible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0};
  const active=()=>visible(document.querySelector(MINISTRY));
  function install(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
    html,body,#app{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none!important}
    #ui-engine-root{position:fixed!important;inset:0!important;z-index:100!important;pointer-events:none!important}
    ${MINISTRY}{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;transform:none!important;margin:0!important;display:none;flex-direction:column;min-height:0!important;overflow:hidden!important;z-index:9000!important;isolation:isolate;contain:layout paint style;pointer-events:none!important}
    ${MINISTRY}.omega-ui-active,${MINISTRY}[aria-hidden="false"]{display:flex!important;pointer-events:auto!important}
    ${MINISTRY}>.sticky-layer-header{position:sticky!important;top:0!important;flex:0 0 auto!important;z-index:100!important}
    #ministry-dashboard-content{position:relative!important;display:block!important;flex:1 1 0!important;min-height:0!important;height:auto!important;width:100%!important;max-height:none!important;overflow:auto!important;overflow-x:hidden!important;overflow-y:scroll!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;touch-action:pan-y pinch-zoom!important;box-sizing:border-box;isolation:isolate;padding-bottom:max(32px,env(safe-area-inset-bottom))!important}
    #ministry-dashboard-content>*{box-sizing:border-box;max-width:100%}
    #ministry-dashboard-content button,#ministry-dashboard-content a,#ministry-dashboard-content input,#ministry-dashboard-content select,#ministry-dashboard-content textarea,#ministry-dashboard-content [role="button"]{pointer-events:auto!important;touch-action:manipulation!important;position:relative!important;z-index:2!important}
    ${CABINET},${COMMAND},#render-engine-root,#map,.ui-bottom-navigation,.ui-right-controls,#special-map-controls{isolation:isolate}
    ${CABINET}{z-index:4000!important}
    body.omega-ministry-active ${CABINET},body.omega-ministry-active ${COMMAND},body.omega-ministry-active #render-engine-root,body.omega-ministry-active #map,body.omega-ministry-active #special-map-controls,body.omega-ministry-active .ui-bottom-navigation,body.omega-ministry-active .ui-right-controls{pointer-events:none!important}
    body.omega-ministry-active ${MINISTRY},body.omega-ministry-active ${MINISTRY} *{pointer-events:auto!important}
    .omega-ministry-scroll-surface{overflow:auto!important;overflow-y:scroll!important;touch-action:pan-y pinch-zoom!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important}
  `;document.head.appendChild(s)}
  function setSurface(){const m=document.querySelector(MINISTRY),content=document.querySelector('#ministry-dashboard-content');const on=active();document.body.classList.toggle('omega-ministry-active',on);if(m){m.classList.toggle('omega-ui-active',on);m.setAttribute('aria-hidden',on?'false':'true')}if(content)content.classList.add('omega-ministry-scroll-surface');const c=document.querySelector(CABINET),cmd=document.querySelector(COMMAND);if(c)c.setAttribute('aria-hidden',on?'true':'false');if(cmd)cmd.setAttribute('aria-hidden',on?'true':'false')}
  function blockOutside(e){if(!active())return;const m=document.querySelector(MINISTRY);if(m?.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation()}
  function boot(){install();for(const t of ['pointerdown','pointerup','click','touchstart','touchend','mousedown','mouseup'])document.addEventListener(t,blockOutside,true);document.addEventListener('wheel',e=>{if(!active())return;const m=document.querySelector(MINISTRY);if(!m?.contains(e.target)){e.preventDefault();e.stopImmediatePropagation()}},{capture:true,passive:false});const observer=new MutationObserver(()=>queueMicrotask(setSurface));observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});setInterval(setSurface,200);setSurface()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  global.OmegaUIInteractionGuard={version:'2.1.0',refresh:setSurface};
})(window);
