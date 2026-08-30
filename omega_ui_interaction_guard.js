/* OMEGA UI INTERACTION GUARD v2.0.0 */
(function(global){'use strict';
  if(global.__OMEGA_UI_INTERACTION_GUARD_V2__)return;global.__OMEGA_UI_INTERACTION_GUARD_V2__=true;
  const STYLE_ID='omega-ui-interaction-guard-v2';
  const MINISTRY='#ministry-dashboard-view';
  const CABINET='#cabinet-full-window';
  const COMMAND='#command-hub-modal';
  const isVisible=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0};
  const ministryOpen=()=>isVisible(document.querySelector(MINISTRY));
  function styles(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
    html,body,#app{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none}
    #ui-engine-root{position:fixed!important;inset:0!important;z-index:100!important;pointer-events:none!important}
    ${CABINET},${COMMAND},${MINISTRY}{isolation:isolate;contain:layout paint style}
    ${CABINET}{z-index:4000!important}
    ${MINISTRY}{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;transform:none!important;margin:0!important;display:none;flex-direction:column;pointer-events:none!important;overflow:hidden!important;z-index:9000!important;background:var(--omega-glass,#07111f)}
    ${MINISTRY}[aria-hidden="false"],${MINISTRY}.omega-ui-active{display:flex!important;pointer-events:auto!important}
    ${MINISTRY}>.sticky-layer-header{flex:0 0 auto;position:sticky;top:0;z-index:20}
    #ministry-dashboard-content{position:relative!important;display:block!important;flex:1 1 0!important;min-height:0!important;height:auto!important;max-height:none!important;width:100%!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain!important;overscroll-behavior-x:none!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important;scroll-behavior:auto;isolation:isolate;box-sizing:border-box;padding-bottom:max(24px,env(safe-area-inset-bottom))!important;}
    #ministry-dashboard-content>*{max-width:100%;box-sizing:border-box}
    #ministry-dashboard-content button,#ministry-dashboard-content a,#ministry-dashboard-content input,#ministry-dashboard-content select,#ministry-dashboard-content textarea,#ministry-dashboard-content [role="button"]{pointer-events:auto!important;touch-action:manipulation!important;position:relative;z-index:2}
    ${CABINET},${COMMAND},#render-engine-root,#map,#special-map-controls,.ui-bottom-navigation,.ui-right-controls{transition:none!important}
    body.omega-ministry-active ${CABINET},body.omega-ministry-active ${COMMAND},body.omega-ministry-active #render-engine-root,body.omega-ministry-active #map,body.omega-ministry-active #special-map-controls,body.omega-ministry-active .ui-bottom-navigation,body.omega-ministry-active .ui-right-controls{pointer-events:none!important}
    body.omega-ministry-active ${MINISTRY},body.omega-ministry-active ${MINISTRY} *{pointer-events:auto}
  `;document.head.appendChild(s)}
  function setActive(){const active=ministryOpen();document.body.classList.toggle('omega-ministry-active',active);const m=document.querySelector(MINISTRY),c=document.querySelector(CABINET),cmd=document.querySelector(COMMAND);if(m){m.setAttribute('aria-hidden',active?'false':'true');if(active)m.classList.add('omega-ui-active');else m.classList.remove('omega-ui-active')}if(c)c.setAttribute('aria-hidden',active?'true':'false');if(cmd)cmd.setAttribute('aria-hidden',active?'true':'false');}
  function intercept(e){if(!ministryOpen())return;const m=document.querySelector(MINISTRY);if(m&&m.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();}
  function wheel(e){if(!ministryOpen())return;const m=document.querySelector(MINISTRY);if(m&&m.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();}
  function boot(){styles();['pointerdown','pointerup','click','touchstart','touchend'].forEach(t=>document.addEventListener(t,intercept,true));document.addEventListener('wheel',wheel,{capture:true,passive:false});document.addEventListener('scroll',()=>setActive(),true);const obs=new MutationObserver(setActive);obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});setInterval(setActive,250);setActive();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  global.OmegaUIInteractionGuard={version:'2.0.0',refresh:setActive};
})(window);
