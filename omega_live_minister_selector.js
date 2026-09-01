/* OMEGA LIVE MINISTER SELECTOR v1.0 */
(function(global){'use strict';
  const KEY='OMEGA_APPOINTED_MINISTERS_V1';
  const text=v=>String(v==null?'':v).trim();
  const country=()=>text(global.Game?.currentActiveCountry||global.Game?.state?.countryId||global.Game?.state?.playerCountryId||'USA').toUpperCase().replace(/\s+/g,'_');
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return{}}}
  function save(v){try{localStorage.setItem(KEY,JSON.stringify(v))}catch(_){}
  }
  function key(ministry){return `${country()}_${ministry}`}
  function getIndex(ministry){const x=load()[key(ministry)];return Number.isInteger(x)?x:0}
  function setIndex(ministry,index){const x=load();x[key(ministry)]=index;save(x);if(global.OmegaCabinetUI)global.OmegaCabinetUI.appointedMinisterIndex[key(ministry)]=index}
  function profile(ministry){const ui=global.OmegaCabinetUI;if(!ui||typeof ui.getMinisterProfile!=='function')return null;return ui.getMinisterProfile(ministry,country())}
  function installSelector(ministry){
    const ui=global.OmegaCabinetUI;if(!ui||!ui.ministersDB)return;
    const dash=document.getElementById('ministry-dashboard-view');if(!dash)return;
    const existing=document.getElementById('omega-live-minister-selector');if(existing)existing.remove();
    const p=profile(ministry);if(!p||!Array.isArray(p.candidates)||!p.candidates.length)return;
    const idx=getIndex(ministry)%p.candidates.length;
    const wrap=document.createElement('div');wrap.id='omega-live-minister-selector';wrap.className='omega-minister-selector';wrap.innerHTML=`<label for="omega-minister-choice">MINISTER</label><select id="omega-minister-choice" aria-label="Change Minister"></select><button type="button" id="omega-minister-appoint">APPOINT</button><span id="omega-minister-selector-status" style="font-size:10px;color:#94a3b8;font-family:var(--font-mono)">Authoritative runtime</span>`;
    const candidates=p.candidates;
    const select=wrap.querySelector('select');
    candidates.forEach((c,i)=>{const region=ui.getRegionForCountry(country());const name=(c.regional_names&&c.regional_names[region])||c.regional_names?.western||c.name||c.id;const o=document.createElement('option');o.value=String(i);o.textContent=`${name} • ${c.id}`;select.appendChild(o)});
    select.value=String(idx);
    const host=dash.querySelector('[data-minister-selector-host]')||dash.firstElementChild||dash;
    if(host&&host.parentNode)host.parentNode.insertBefore(wrap,host.nextSibling);else dash.appendChild(wrap);
    const appoint=()=>{const next=Number(select.value);setIndex(ministry,next);const fresh=profile(ministry);if(fresh){ui.currentInterrogatedMinister={...fresh,ministerId:fresh.id,ministryId:ministry,countryCode:country(),ministerName:fresh.name};}if(typeof ui.renderMinistryDashboard==='function')ui.renderMinistryDashboard(ministry);setTimeout(()=>installSelector(ministry),0);};
    select.addEventListener('change',()=>{wrap.querySelector('#omega-minister-selector-status').textContent='Pending appointment';});
    wrap.querySelector('#omega-minister-appoint').addEventListener('click',appoint);
  }
  function patch(){
    const ui=global.OmegaCabinetUI;if(!ui||ui.__liveMinisterSelectorPatched)return false;ui.__liveMinisterSelectorPatched=true;
    if(typeof ui.renderMinistryDashboard==='function'){
      const original=ui.renderMinistryDashboard.bind(ui);ui.renderMinistryDashboard=function(ministry,...args){const result=original(ministry,...args);setTimeout(()=>installSelector(ministry),0);return result};
    }
    if(typeof ui.openInterrogationModal==='function'){
      const original=ui.openInterrogationModal.bind(ui);ui.openInterrogationModal=function(ministry,...args){const p=profile(ministry);if(p)ui.currentInterrogatedMinister={...p,ministerId:p.id,ministryId:ministry,countryCode:country(),ministerName:p.name};return original(ministry,...args)};
    }
    return true;
  }
  function boot(){if(patch())return;setTimeout(boot,250)}
  global.addEventListener('OMEGA_SEMANTIC_RUNTIME_READY',()=>{patch();const ui=global.OmegaCabinetUI;if(ui&&global.OmegaLayerManager?.activeMinistryId)installSelector(global.OmegaLayerManager.activeMinistryId)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(typeof globalThis!=='undefined'?globalThis:window);
