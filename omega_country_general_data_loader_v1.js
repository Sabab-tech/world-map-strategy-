/* OMEGA Country General Data lazy loader v1.0.0
 * Defers the large country registry request until the player opens a country overview.
 */
(function(root){
  'use strict';
  const doc=root.document;
  if(!doc)return;
  const state={loading:false,loaded:!!root.OmegaCountryGeneralDataRuntime,promise:null};
  const esc=value=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function loadRuntime(){
    if(state.loaded)return Promise.resolve(true);
    if(state.promise)return state.promise;
    state.loading=true;
    state.promise=new Promise(resolve=>{
      const script=doc.createElement('script');
      script.src='./omega_country_general_data_runtime_v1.js';
      script.async=true;
      script.onload=()=>{
        const api=root.OmegaCountryGeneralDataRuntime;
        Promise.resolve(api?.init?.()).then(ready=>{
          state.loaded=!!ready&&!!api?.diagnostics?.().ready;
          state.loading=false;
          if(!state.loaded){state.promise=null;}
          resolve(state.loaded);
        }).catch(()=>{state.loading=false;state.promise=null;resolve(false);});
      };
      script.onerror=()=>{state.loading=false;state.promise=null;script.remove();resolve(false);};
      doc.head.appendChild(script);
    });
    return state.promise;
  }
  function installCountryIOS(){
    const ios=root.CountryIOS;
    if(!ios||typeof ios.renderChapter1_Overview!=='function'||ios.__omegaGeneralDataLoaderInstalled)return false;
    const original=ios.renderChapter1_Overview;
    ios.renderChapter1_Overview=function(){
      const args=Array.from(arguments);
      const country=args[0]||this.activeCountry||root.OmegaMinistryViewCountry||'USA';
      const shouldAddPlaceholder=!state.loaded;
      if(shouldAddPlaceholder)void loadRuntime();
      const html=original.apply(this,args);
      if(!shouldAddPlaceholder)return html;
      return String(html||'')+'<section data-omega-country-general-panel data-country-id="'+esc(country)+'" style="margin-top:12px;padding:12px;border-radius:12px;background:#0f172a;color:#cbd5e1;border:1px solid #334155"><strong>COUNTRY GENERAL DATA</strong><p>Loading shared country profile…</p></section>';
    };
    Object.defineProperty(ios,'__omegaGeneralDataLoaderInstalled',{value:true});
    return true;
  }
  function installMinistryOverview(){
    const ui=root.OmegaCountryOverviewMinistryUI||root.Omega?.CountryOverviewMinistryUI;
    if(!ui||typeof ui.renderCountryOverview!=='function'||ui.__omegaGeneralDataLoaderInstalled)return false;
    const original=ui.renderCountryOverview;
    ui.renderCountryOverview=function(){
      const result=original.apply(this,arguments);
      if(!state.loaded){
        void loadRuntime().then(ready=>{
          if(ready)ui.renderCountryOverview();
        });
      }
      return result;
    };
    Object.defineProperty(ui,'__omegaGeneralDataLoaderInstalled',{value:true});
    return true;
  }
  function install(){
    const countryInstalled=installCountryIOS();
    const ministryInstalled=installMinistryOverview();
    return countryInstalled||ministryInstalled;
  }
  install();
  root.addEventListener?.('DOMContentLoaded',install,{once:true});
  root.addEventListener?.('OMEGA_READY',install);
  root.setTimeout?.(install,800);
  root.OmegaCountryGeneralDataLoader=Object.freeze({load:loadRuntime,isLoaded:()=>state.loaded,isLoading:()=>state.loading});
})(window);
