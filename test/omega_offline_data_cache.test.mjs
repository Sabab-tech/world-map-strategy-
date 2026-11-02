import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../omega-offline-map-sw.js',import.meta.url),'utf8');

function createCacheHarness(){
  const listeners=new Map(),cacheStores=new Map(),networkRequests=[];
  let offline=false,deleted=false,serverError=false,stalled=false,payload={revision:1};
  let clockNow=Date.now();
  class TestDate extends Date{static now(){return clockNow;}}
  const appUrl='https://omega.test/game/omega-offline-map-sw.js';
  const origin='https://omega.test';
  class MemoryCache{
    constructor(){this.entries=new Map();}
    key(request){return new URL(typeof request==='string'?request:request.url,appUrl).href;}
    async put(request,response){this.entries.set(this.key(request),response.clone());}
    async match(request){const response=this.entries.get(this.key(request));return response?response.clone():undefined;}
    async delete(request){return this.entries.delete(this.key(request));}
  }
  const caches={
    async open(name){if(!cacheStores.has(name))cacheStores.set(name,new MemoryCache());return cacheStores.get(name);},
    async keys(){return[...cacheStores.keys()];},
    async delete(name){return cacheStores.delete(name);}
  };
  const self={
    location:{href:appUrl,origin},
    clients:{async claim(){}},
    addEventListener(type,handler){listeners.set(type,handler);},
    async skipWaiting(){}
  };
  async function fetchImpl(input,options={}){
    const href=typeof input==='string'?input:input.url;
    const url=new URL(href,appUrl);networkRequests.push({url:url.href,cache:options.cache||null});
    if(url.pathname.endsWith('/resource-large.json')){
      if(offline)throw new Error('NETWORK_OFFLINE');
      return new Response('asset',{status:200,headers:{'Content-Type':'application/json','Content-Length':String(12*1024*1024+1)}});
    }
    if(url.pathname.endsWith('/api/omega/country-general-data/BD')){
      if(stalled)return new Promise((resolve,reject)=>{
        if(options.signal?.aborted)return reject(new Error('NETWORK_TIMEOUT'));
        options.signal?.addEventListener('abort',()=>reject(new Error('NETWORK_TIMEOUT')),{once:true});
      });
      if(offline)throw new Error('NETWORK_OFFLINE');
      if(deleted)return new Response('missing',{status:404});
      if(serverError)return new Response('temporarily unavailable',{status:503});
      return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(offline)throw new Error('NETWORK_OFFLINE');
    if(url.pathname.endsWith('/index.html'))return new Response('<html><head></head><body><script src="./boot.js"></script></body></html>',{status:200,headers:{'Content-Type':'text/html'}});
    if(url.pathname.endsWith('/manifest.json'))return new Response(JSON.stringify({factories:[],resources:[],transportVariants:[]}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response('asset',{status:200,headers:{'Content-Type':'application/javascript'}});
  }
  const sandbox={self,caches,fetch:fetchImpl,URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,Promise,Map,Set,Array,Object,Number,String,Math,Date:TestDate,RegExp};
  vm.runInNewContext(source,sandbox,{filename:'omega-offline-map-sw.js'});
  async function install(){
    let pending;
    listeners.get('install')({waitUntil(promise){pending=promise;}});
    await pending;
  }
  async function request(url,options={}){
    let pending;
    const waits=[];
    listeners.get('fetch')({request:new Request(url),respondWith(promise){pending=promise;},waitUntil(promise){waits.push(promise);}});
    const response=await pending;
    const background=Promise.all(waits);
    if(options.waitForBackground!==false)await background;
    return options.waitForBackground===false?{response,background}:response;
  }
  return{
    install,request,networkRequests,cacheStores,
    setOffline(value){offline=value;},
    setDeleted(value){deleted=value;},
    setServerError(value){serverError=value;},
    setStalled(value){stalled=value;},
    setPayload(value){payload=value;},
    advanceTime(ms){clockNow+=ms;}
  };
}

test('offline install precaches the shell but not the large resource registry shards',async()=>{
  const h=createCacheHarness();await h.install();
  const requested=h.networkRequests.map(row=>new URL(row.url).pathname);
  assert.ok(requested.some(path=>path.endsWith('/index.html')));
  assert.ok(requested.some(path=>path.endsWith('/leaflet.js')));
  assert.ok(!requested.some(path=>path.endsWith('/resource_site_master_registry_v1.json')));
  assert.ok(!requested.some(path=>/resource_site_logistics_routes_v1_part_\d+\.json$/.test(path)));
  assert.ok(!requested.some(path=>path.endsWith('/resource_site_country_expansion_v1.json')));
});

test('cached shell scripts do not trigger another background network request on every page load',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/boot.js';
  const before=h.networkRequests.filter(row=>row.url===url).length;
  assert.equal(before,1,'the shell script should have been fetched during installation');
  const response=await h.request(url);
  assert.equal(response.status,200);
  const after=h.networkRequests.filter(row=>row.url===url).length;
  assert.equal(after,before,'a cache hit for a JS asset must not spawn a second network request');
});

test('boot-critical world and country economy JSON remain available from the shell cache offline',async()=>{
  const h=createCacheHarness();await h.install();
  h.setOffline(true);
  for(const file of ['world.json','economy_global_profiles_v1.json']){
    const response=await h.request('https://omega.test/game/'+file);
    assert.equal(response.status,200,file+' must be served from the app shell cache');
  }
});

test('country data is refreshed online and only uses its last downloaded copy after network failure',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  let response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:1});
  h.setPayload({revision:2});
  const requestsBeforeCooldown=h.networkRequests.filter(row=>row.url===url).length;
  response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:1},'fresh cached data remains available during the refresh cooldown');
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
  assert.equal(h.networkRequests.filter(row=>row.url===url).length,requestsBeforeCooldown,
    're-reading a recently checked data URL must not start another network request');
  h.advanceTime(5*60*1000+1);
  response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:1},'the current read still returns the cached copy while its due refresh completes');
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
  response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:2},'the next read must use the refreshed exact-URL cache entry');
  h.setOffline(true);
  response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:2});
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
});

test('server errors may use a marked stale copy while the server is temporarily unavailable',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  await h.request(url);
  h.advanceTime(5*60*1000+1);
  h.setServerError(true);
  const response=await h.request(url);
  assert.equal(response.status,200,'a transient server error should not prevent offline-capable data from being displayed');
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1','fallback data must be visibly marked stale');
  assert.deepEqual(await response.json(),{revision:1});
});

test('stalled country requests abort at the configured timeout and fall back to the last downloaded copy',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  await h.request(url);
  h.advanceTime(5*60*1000+1);
  h.setStalled(true);
  const started=Date.now();
  const pending=await h.request(url,{waitForBackground:false});
  const response=pending.response;
  const pageElapsed=Date.now()-started;
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
  assert.ok(pageElapsed<500,'a cached page response must not wait for the background network timeout');
  const backgroundStarted=Date.now();
  await pending.background;
  const refreshElapsed=Date.now()-backgroundStarted;
  assert.ok(refreshElapsed<2800,'a stalled background refresh must abort at its 2.2 second timeout');
});

test('deleted country data is removed rather than resurrected from an old offline cache',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  await h.request(url);
  h.advanceTime(5*60*1000+1);
  h.setDeleted(true);
  let response=await h.request(url);
  assert.equal(response.status,200,'the last downloaded copy can be served while a background deletion check completes');
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
  h.setOffline(true);
  response=await h.request(url);
  assert.equal(response.status,504,'a 404/410 refresh must remove the previous offline copy');
});

test('data larger than the configured per-file limit is not retained in the offline working set',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/resource-large.json';
  h.setOffline(false);
  const response=await h.request(url);
  assert.equal(response.status,200);
  h.setOffline(true);
  const offlineResponse=await h.request(url);
  assert.equal(offlineResponse.status,504,'oversized JSON must not be retained for offline use');
});
