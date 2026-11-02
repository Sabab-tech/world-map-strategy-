import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../omega-offline-map-sw.js',import.meta.url),'utf8');

function createCacheHarness(){
  const listeners=new Map(),cacheStores=new Map(),networkRequests=[];
  let offline=false,deleted=false,serverError=false,payload={revision:1};
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
      return new Response('asset',{status:200,headers:{'Content-Type':'application/json','Content-Length':String(4*1024*1024+1)}});
    }
    if(url.pathname.endsWith('/api/omega/country-general-data/BD')){
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
  const sandbox={self,caches,fetch:fetchImpl,URL,Request,Response,Headers,Promise,Map,Set,Array,Object,Number,String,Math,Date,RegExp};
  vm.runInNewContext(source,sandbox,{filename:'omega-offline-map-sw.js'});
  async function install(){
    let pending;
    listeners.get('install')({waitUntil(promise){pending=promise;}});
    await pending;
  }
  async function request(url){
    let pending;
    const waits=[];
    listeners.get('fetch')({request:new Request(url),respondWith(promise){pending=promise;},waitUntil(promise){waits.push(promise);}});
    const response=await pending;
    await Promise.all(waits);
    return response;
  }
  return{
    install,request,networkRequests,cacheStores,
    setOffline(value){offline=value;},
    setDeleted(value){deleted=value;},
    setServerError(value){serverError=value;},
    setPayload(value){payload=value;}
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

test('country data is refreshed online and only uses its last downloaded copy after network failure',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  let response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:1});
  h.setPayload({revision:2});
  response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:2});
  h.setOffline(true);
  response=await h.request(url);
  assert.deepEqual(await response.json(),{revision:2});
  assert.equal(response.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
});

test('server errors do not silently serve stale data while the server is reachable',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  await h.request(url);
  h.setServerError(true);
  const response=await h.request(url);
  assert.equal(response.status,503,'server errors must be visible instead of being masked by cached JSON');
  h.setServerError(false);
  h.setOffline(true);
  const offlineResponse=await h.request(url);
  assert.equal(offlineResponse.status,200,'a later genuine network failure may still use the saved offline copy');
  assert.equal(offlineResponse.headers.get('X-OMEGA-OFFLINE-STALE'),'1');
});

test('deleted country data is removed rather than resurrected from an old offline cache',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/api/omega/country-general-data/BD';
  await h.request(url);
  h.setDeleted(true);
  let response=await h.request(url);
  assert.equal(response.status,404);
  h.setOffline(true);
  response=await h.request(url);
  assert.equal(response.status,504);
});

test('oversized dynamic data is not retained in the offline working set',async()=>{
  const h=createCacheHarness();await h.install();
  const url='https://omega.test/game/resource-large.json';
  h.setOffline(false);
  const response=await h.request(url);
  assert.equal(response.status,200);
  h.setOffline(true);
  const offlineResponse=await h.request(url);
  assert.equal(offlineResponse.status,504,'oversized JSON must not be retained for offline use');
});
