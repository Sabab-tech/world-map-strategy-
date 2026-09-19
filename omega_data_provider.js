/* OMEGA DATA PROVIDER v1.0.0 */
(function(global){
  'use strict';
  if(global.OmegaDataProvider?.VERSION==='1.0.0')return;
  const VERSION='1.0.0',text=v=>String(v==null?'':v).trim();
  class DevelopmentDataProvider{
    async get(path){
      if(typeof fetch!=='function')throw new Error('DevelopmentDataProvider requires fetch');
      const r=await fetch(path,{cache:'no-store'});
      if(!r.ok)throw new Error(path+': HTTP '+r.status);
      return r.json();
    }
  }
  class AndroidLocalDataProvider{
    constructor(adapter=global.OmegaAndroidDataBridge||null){this.adapter=adapter;}
    async get(path){
      if(!this.adapter)throw new Error('Android local data adapter unavailable');
      const key=text(path).replace(/^\/+/, '');
      if(typeof this.adapter.getJSON==='function')return this.adapter.getJSON(key);
      if(typeof this.adapter.readJSON==='function')return this.adapter.readJSON(key);
      throw new Error('Android local data adapter exposes neither getJSON() nor readJSON()');
    }
  }
  class Provider{
    constructor(options={}){
      this.development=options.development||new DevelopmentDataProvider();
      this.android=options.android||new AndroidLocalDataProvider();
    }
    async get(path){
      const platform=text(global.OmegaRuntimePlatform||'').toLowerCase();
      if(platform==='android'||global.OmegaAndroidDataBridge)return this.android.get(path);
      return this.development.get(path);
    }
    async getMany(paths){
      if(!Array.isArray(paths))throw new Error('paths must be an array');
      return Promise.all(paths.map(path=>this.get(path)));
    }
  }
  const instance=new Provider();
  global.OmegaDataProvider=Object.freeze({
    VERSION,
    DevelopmentDataProvider,
    AndroidLocalDataProvider,
    create(options={}){return new Provider(options);},
    get(path){return instance.get(path);},
    getMany(paths){return instance.getMany(paths);}
  });
})(typeof globalThis!=='undefined'?globalThis:window);
