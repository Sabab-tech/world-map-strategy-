/* OMEGA Country General Data lazy loader v1.0.0
 * Defers the large country registry request until the player opens a country overview.
 */
(function(root){
  'use strict';
  const doc=root.document;
  if(!doc)return;
  const state={loading:false,loaded:false};
  const esc=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function loadRuntime(){
    if(state.loading||state.loaded)return;
    state.loading=true;
    const script=doc.createElement('script');
    script.src='./omega_country_general_data_runtime_v1.js';
    script.async=true;
    script.onload=()=>{state.loaded=true;state.loading=false;};
    script.onerror=()=>{state.loading=false;script.remove();};
    doc.head.appendChild(script);
  }
  function install(){
    const ios=root.CountryIOS;
    if(!ios||typeof ios.renderChapter1_Overview!=='function'||ios.__omegaGeneralDataLoaderInstalled)return false;
    const original=ios.renderChapter1_Overview;
    ios.renderChapter1_Overview=function(){
      const args=Array.from(arguments);
      const country=args[0]||this.activeCountry||root.OmegaMinistryViewCountry||'USA';
      const shouldAddPlaceholder=!state.loaded&&!state.loading;
      loadRuntime();
      const html=original.apply(this,args);
      if(!shouldAddPlaceholder)return html;
      return String(html||'')+'<section data-omega-country-general-panel data-country-id="'+esc(country)+'" style="margin-top:12px;padding:12px;border-radius:12px;background:#0f172a;color:#cbd5e1;border:1px solid #334155"><strong>COUNTRY GENERAL DATA</strong><p>Loading shared country profile…</p></section>';
    };
    Object.defineProperty(ios,'__omegaGeneralDataLoaderInstalled',{value:true});
    return true;
  }
  if(!install()){
    root.addEventListener?.('DOMContentLoaded',install,{once:true});
    root.addEventListener?.('OMEGA_READY',install);
    root.setTimeout?.(install,800);
  }
  root.OmegaCountryGeneralDataLoader=Object.freeze({load:loadRuntime,isLoaded:()=>state.loaded,isLoading:()=>state.loading});
})(window);
