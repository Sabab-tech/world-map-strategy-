/* OMEGA SUPPLEMENTAL RESOURCE SITE COMMISSIONING
 * Global historical mineral occurrences remain non-operational until the player explicitly
 * commissions a site. Commissioning creates a simulation-only operational state and then
 * reuses the existing Endowment -> Part 04 -> Part 05 -> batch/warehouse/industrial pipeline.
 * Source observations are never rewritten as real-world facts.
 */
(function(g){
 'use strict';
 const original=g.Omega?.ResourceEndowmentRuntime||g.OmegaResourceEndowmentRuntime;
 if(!original||typeof original.registerSupplementalSiteCatalog!=='function')return;
 if(original.__supplementalCommissioningWrapped)return;
 const state=()=>g.Game?.state||g.gameState||{};
 const country=v=>String(v||'').trim().toUpperCase();
 const turn=()=>Number(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??0)||0;
 const commissioned=(row,cid)=>state()?.resource?.[cid]?.siteCommissioning?.[row.siteId]?.status==='COMMISSIONED_SIMULATION';
 const wrapper=Object.create(original);
 wrapper.__supplementalCommissioningWrapped=true;
 wrapper.registerSupplementalSiteCatalog=function(rows){
  const input=(Array.isArray(rows)?rows:[]).map(row=>{
   const cid=country(row?.countryId||row?.identity?.countryIso3||row?.countryCode);
   if(!cid||!commissioned(row,cid))return row;
   return {...row,operation:{...(row.operation||{}),status:'SIMULATED_ACTIVE_EXTRACTION',commercialExtraction:true,extractionEligibility:'SIMULATION_COMMISSIONED'},
    simulation:{...(row.simulation||{}),activationAuthority:'GAMEPLAY_SIMULATION',commissionedTurn:state()?.resource?.[cid]?.siteCommissioning?.[row.siteId]?.turn??null}};
  });
  return original.registerSupplementalSiteCatalog(input);
 };
 wrapper.commissionSupplementalSite=async function(siteId){
  const key=String(siteId||'').trim();
  const binding=g.Omega?.IndividualResourceSiteBinding;
  const site=(Array.isArray(binding?.sites)?binding.sites:[]).find(row=>String(row?.siteId||'')===key);
  if(!site)return{status:'BLOCKED',reason:'SITE_NOT_IN_LOADED_GLOBAL_CATALOG',siteId:key||null};
  if(!String(site.sourceType||'').startsWith('GLOBAL_'))return{status:'BLOCKED',reason:'NOT_A_SUPPLEMENTAL_GLOBAL_SITE',siteId:key};
  const cid=country(site.countryId);
  if(!/^[A-Z]{3}$/.test(cid))return{status:'BLOCKED',reason:'UNRESOLVED_COUNTRY_IDENTITY',siteId:key};
  const coords=site.coordinates||site.location?.coordinates||{};
  if(!Number.isFinite(Number(coords.lat))||!Number.isFinite(Number(coords.lng)))return{status:'BLOCKED',reason:'MISSING_UPSTREAM_COORDINATES',siteId:key,countryId:cid};
  const root=state();if(!root.resource)root.resource={};if(!root.resource[cid])root.resource[cid]={};
  const countryState=root.resource[cid];
  if(!countryState.siteCommissioning||typeof countryState.siteCommissioning!=='object')countryState.siteCommissioning={};
  countryState.siteCommissioning[key]={siteId:key,countryId:cid,status:'COMMISSIONED_SIMULATION',authority:'GAMEPLAY_SIMULATION',turn:turn(),resourceId:site.real?.resourceId||site.identity?.resourceTypeId||null};
  site.operation={...(site.operation||{}),status:'SIMULATED_ACTIVE_EXTRACTION',commercialExtraction:true,extractionEligibility:'SIMULATION_COMMISSIONED'};
  site.simulation={...(site.simulation||{}),activationAuthority:'GAMEPLAY_SIMULATION',commissionedTurn:turn()};
  const rows=(Array.isArray(binding.sites)?binding.sites:[]).filter(row=>String(row.sourceType||'').startsWith('GLOBAL_'));
  const registration=original.registerSupplementalSiteCatalog(rows);
  delete countryState.mineSiteReferences;delete countryState.mineSiteControllers;
  const hydration=await original.hydrateCountry(cid);
  const hydrated=registration?.status==='READY'&&hydration?.status==='APPLIED';
  return{status:hydrated?'COMMISSIONED_SIMULATION':'COMMISSIONED_SIMULATION_HYDRATION_PENDING',siteId:key,countryId:cid,resourceId:site.real?.resourceId||site.identity?.resourceTypeId||null,turn:turn(),registration,hydration,
   nextStep:'Use the existing per-site PLAN EXTRACTION / EXECUTE SITE actions. Extraction still succeeds only if the reserve/extraction runtime commits a result.'};
 };
 g.Omega=g.Omega||{};
 g.Omega.ResourceEndowmentRuntime=wrapper;
 g.OmegaResourceEndowmentRuntime=wrapper;
 function attachButton(){
  const panel=document.getElementById('omega-individual-resource-panel');
  if(!panel||panel.querySelector('#omega-global-site-commission'))return;
  const btn=document.createElement('button');
  btn.id='omega-global-site-commission';
  btn.type='button';
  btn.textContent='COMMISSION SIMULATION SITE';
  btn.style.cssText='display:block;width:100%;margin:8px 0;padding:9px;background:#253c4b;color:#fff;border:1px solid #547c91;border-radius:4px;font:700 11px monospace';
  const plan=panel.querySelector('#omega-individual-plan');
  if(plan?.parentNode)plan.parentNode.parentNode.insertBefore(btn,plan.parentNode);
  else panel.appendChild(btn);
  btn.addEventListener('click',async()=>{
   const select=document.getElementById('omega-individual-select');
   const siteId=String(select?.value||'');
   const selected=(g.Omega?.IndividualResourceSiteBinding?.sites||[]).find(row=>row.siteId===siteId);
   const status=document.getElementById('omega-individual-status');
   if(!selected){if(status)status.textContent='BLOCKED · select an individual global site first';return;}
   if(!String(selected.sourceType||'').startsWith('GLOBAL_')){if(status)status.textContent='BLOCKED · this button is for supplemental global sites';return;}
   btn.disabled=true;btn.textContent='COMMISSIONING…';
   try{
    const result=await wrapper.commissionSupplementalSite(siteId);
    if(result.status==='COMMISSIONED_SIMULATION'||result.status==='COMMISSIONED_SIMULATION_HYDRATION_PENDING'){
     selected.operation={...(selected.operation||{}),status:'SIMULATED_ACTIVE_EXTRACTION',commercialExtraction:true,extractionEligibility:'SIMULATION_COMMISSIONED'};
     selected.simulation={...(selected.simulation||{}),activationAuthority:'GAMEPLAY_SIMULATION',commissionedTurn:turn()};
     if(status)status.textContent=result.status==='COMMISSIONED_SIMULATION'?'SIMULATION SITE COMMISSIONED · '+siteId+' · country runtime hydrated':'COMMISSION SAVED · '+siteId+' · country runtime hydration pending; extraction is not verified';
    }else if(status)status.textContent='COMMISSION BLOCKED · '+(result.reason||result.status);
   }catch(error){if(status)status.textContent='COMMISSION FAILED · '+String(error?.message||error);}
   finally{btn.disabled=false;btn.textContent='COMMISSION SIMULATION SITE';}
  });
 }
 if(typeof MutationObserver==='function'&&g.document?.body){
  const observer=new MutationObserver(attachButton);observer.observe(document.body,{childList:true,subtree:true});
 }
 g.addEventListener?.('load',()=>setTimeout(attachButton,0));
 g.addEventListener?.('OMEGA_RESOURCE_SITE_SELECTED',attachButton);
})(typeof window!=='undefined'?window:globalThis);
