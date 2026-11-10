/* OMEGA GLOBAL MARKET CLEARING SYSTEM v1.0.0
 * Real order-book aggregation and deterministic price discovery.
 * Reference prices are explicitly marked as REFERENCE_ONLY and never treated
 * as observed market prices.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0',MAX_ORDERS=2048,MAX_MARKET_HISTORY=128;
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
  const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const clamp=(v,a=0,b=1)=>{const x=n(v);return x===null?null:Math.max(a,Math.min(b,x));};
  const state=()=>g.Game?.state||g.gameState||{};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const turn=()=>n(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  // A market rebuild reads one stable world snapshot for every resource. Resolve each
  // country/domain bucket once so resource-by-resource clearing does not repeatedly scan
  // all country keys and re-resolve the same aliases.
  let activeMarketSnapshot=null;
  function createMarketSnapshot(){
    const root=state()||{},countryIds=new Set();
    const resolveRow=row=>{
      const raw=row&&typeof row==='object'
        ?(row.iso3||row.iso3Code||row.countryCode||row.country_id||row.countryId||row.canonicalId||row.id||row.code)
        :row;
      const value=canonical(raw);
      if(value&&value!=='[OBJECT OBJECT]')countryIds.add(value);
    };
    try{
      const rows=registry()?.list?.('COUNTRY')||registry()?.list?.()||[];
      if(Array.isArray(rows))rows.forEach(resolveRow);
    }catch(_){}
    const domains=['trade','resource','finance','foreign','economy'];
    for(const domain of domains){
      const source=root[domain];
      if(source&&typeof source==='object')Object.keys(source).forEach(resolveRow);
    }
    const buckets=Object.create(null);
    for(const domain of domains){
      const source=root[domain];
      if(!source||typeof source!=='object')continue;
      const index=Object.create(null);
      for(const key of Object.keys(source)){
        const cid=canonical(key);
        if(cid&&!Object.prototype.hasOwnProperty.call(index,cid))index[cid]=source[key];
      }
      // Preserve the old direct-key preference when canonical and alias keys coexist.
      for(const cid of countryIds)if(Object.prototype.hasOwnProperty.call(source,cid))index[cid]=source[cid];
      buckets[domain]=index;
    }
    return{countryIds:[...countryIds].filter(Boolean).sort(),buckets,currencyByCountry:new Map(),usdRateByCountry:new Map()};
  }
  const countries=()=>activeMarketSnapshot?activeMarketSnapshot.countryIds:(()=>{
    const out=new Set();
    const resolveRow=row=>{
      const raw=row&&typeof row==='object'
        ?(row.iso3||row.iso3Code||row.countryCode||row.country_id||row.countryId||row.canonicalId||row.id||row.code)
        :row;
      const value=canonical(raw);
      if(value&&value!=='[OBJECT OBJECT]')out.add(value);
    };
    try{
      const rows=registry()?.list?.('COUNTRY')||registry()?.list?.()||[];
      if(Array.isArray(rows))rows.forEach(resolveRow);
    }catch(_){}
    const s=state()||{};
    for(const domain of ['trade','resource','finance','foreign','economy']){
      const root=s[domain];
      if(root&&typeof root==='object')Object.keys(root).forEach(resolveRow);
    }
    return [...out].filter(Boolean).sort();
  })();
  function countryValue(c,path){
    const cid=canonical(c),parts=String(path||'').split('.'),domain=parts.shift();let bucket;
    if(activeMarketSnapshot)bucket=activeMarketSnapshot.buckets[domain]?.[cid];
    else{
      bucket=state()?.[domain];
      if(bucket&&typeof bucket==='object')bucket=bucket[cid]??bucket[Object.keys(bucket).find(k=>canonical(k)===cid)];
    }
    for(const p of parts){if(bucket==null||!Object.prototype.hasOwnProperty.call(Object(bucket),p))return undefined;bucket=bucket[p];}
    return bucket;
  }
  function currency(c){
    const target=canonical(c),cache=activeMarketSnapshot?.currencyByCountry;
    if(cache?.has(target))return cache.get(target);
    const remember=value=>{if(cache)cache.set(target,value);return value;};
    const stored=String(countryValue(c,'finance.currencyCode')||countryValue(c,'economy.currency_code')||countryValue(c,'economy.currencyCode')||countryValue(c,'trade.settlementCurrency')||'').trim().toUpperCase();
    if(stored)return remember(stored);

    // Finance country buckets are not guaranteed to be materialized in older saves.
    // Currency identity still belongs to the canonical Finance/Forex profile registry.
    const monetary=g.OmegaForexMonetaryEngine||g.Omega&&g.Omega.ForexMonetaryEngine;
    if(!monetary)return remember(null);
    if(!target)return remember(null);

    // Forex quote rows expose the canonical countryCode used by the simulation
    // state (often ISO2) as well as the source ISO3. Prefer that exact key before
    // falling back to Finance profile identity resolution.
    if(typeof monetary.getCountryQuotes==='function'){
      try{
        const quotes=monetary.getCountryQuotes('SIMULATION')||[];
        const quote=quotes.find(row=>
          [row?.countryCode,row?.iso3].some(value=>
            value&&(id(value)===target||canonical(value)===target)));
        const quoteCode=String(quote?.currencyCode||'').trim().toUpperCase();
        if(quoteCode)return remember(quoteCode);
      }catch(_){}
    }
    if(typeof monetary.getProfiles!=='function'||typeof monetary.getCurrencyCode!=='function')return remember(null);
    let profiles=[];
    try{profiles=monetary.getProfiles()||[];}catch(_){return remember(null);}
    const profile=profiles.find(row=>
      [row?.countryCode,row?.code,row?.iso2,row?.iso3]
        .some(value=>value&&(id(value)===target||canonical(value)===target)));
    if(!profile)return remember(null);
    try{return remember(String(monetary.getCurrencyCode(profile)||'').trim().toUpperCase()||null);}
    catch(_){return remember(null);}
  }
  function usdRate(c){
    const target=canonical(c),cache=activeMarketSnapshot?.usdRateByCountry;
    if(cache?.has(target))return cache.get(target);
    const remember=value=>{if(cache)cache.set(target,value);return value;};
    const code=currency(c);
    if(!code)return remember(null);
    if(code==='USD')return remember(1);
    const raw=n(countryValue(c,'economy.exchange_rate_usd')??countryValue(c,'finance.exchange_rate_usd')??countryValue(c,'finance.usdPerUnit'));
    if(raw!==null&&raw>0)return remember(raw);

    // Trade settlement and market clearing must share the same canonical Forex
    // simulation rate. A country's Finance bucket can contain a valid currency code
    // while its legacy exchange_rate_usd field is still absent; returning null here
    // silently drops its bids/asks from the executable order book.
    const monetary=g.OmegaForexMonetaryEngine||g.Omega&&g.Omega.ForexMonetaryEngine;
    if(!monetary||typeof monetary.getRate!=='function')return remember(null);
    const simulationRate=n(monetary.getRate(code,'SIMULATION'));
    return remember(simulationRate!==null&&simulationRate>0?simulationRate:null);
  }
  function toUsd(c,price){
    const p=n(price),r=usdRate(c);if(p===null||r===null)return null;
    return currency(c)==='USD'?p:p/r;
  }
  function resourceIds(){
    const ids=new Set;
    const rt=g.ResourceMinistryEngine?.resourceTypes;
    if(Array.isArray(rt))for(const x of rt)if(x?.id)ids.add(String(x.id));
    for(const c of countries()){
      const inv=countryValue(c,'resource.inventory'),prod=countryValue(c,'resource.production'),cons=countryValue(c,'resource.consumption');
      for(const source of [inv,prod,cons])if(source&&typeof source==='object')for(const k of Object.keys(source))ids.add(k);
      const req=countryValue(c,'trade.importRequests');if(Array.isArray(req))for(const x of req)if(x?.resourceId)ids.add(x.resourceId);
      const offers=countryValue(c,'trade.offerBook');
      if(offers&&typeof offers==='object'){
        if(Array.isArray(offers))for(const x of offers)if(x?.resourceId)ids.add(x.resourceId);
        else for(const [k,v] of Object.entries(offers))if(v&&typeof v==='object')ids.add(v.resourceId||k);
      }
    }
    return [...ids].map(String).filter(Boolean).sort((a,b)=>token(a).localeCompare(token(b)));
  }
  function referencePrice(rid){
    const rt=g.ResourceMinistryEngine?.resourceTypes||[];
    const row=Array.isArray(rt)?rt.find(x=>token(x?.id)===token(rid)):null;
    const p=n(row?.basePrice);
    return p===null?null:{price:p,unit:row?.unit||null,source:'ResourceMinistryEngine.resourceTypes.basePrice',referenceOnly:true};
  }
  function pushOrder(book,order){if(!order.resourceId||order.quantity<=0||order.price===null)return;const key=String(order.resourceId);if(!book[key])book[key]={bids:[],asks:[]};book[key][order.side].push(order);}
  function collectOrders(rid){
    const book={bids:[],asks:[]};
    for(const c of countries()){
      const reqs=countryValue(c,'trade.importRequests');
      if(Array.isArray(reqs))for(const q of reqs.slice(-256)){
        if(token(q?.resourceId)!==token(rid)||!['SENT','COUNTER_OFFERED','ACCEPTED'].includes(id(q?.status)))continue;
        const usd=toUsd(c,q.unitPrice);if(usd===null)continue;
        pushOrder({[rid]:book},{resourceId:rid,side:'bids',countryId:canonical(c),quantity:n(q.quantity)||0,price:n(q.unitPrice),priceUsd:usd,currency:currency(c),source:'TRADE_IMPORT_REQUEST',referenceOnly:false,requestId:q.requestId});
      }
      const offers=countryValue(c,'trade.offerBook');
      const rows=[];
      if(Array.isArray(offers))rows.push(...offers.map(x=>({...x,countryId:x?.countryId||c})));
      else if(offers&&typeof offers==='object'){
        for(const [k,v] of Object.entries(offers)){
          if(Array.isArray(v))for(const x of v)rows.push({...x,resourceId:x?.resourceId||k,countryId:x?.countryId||c});
          else if(v&&typeof v==='object')rows.push({...v,resourceId:v?.resourceId||k,countryId:v?.countryId||c});
        }
      }
      for(const q of rows){
        if(token(q?.resourceId||q?.resource)!==token(rid))continue;
        const usd=toUsd(c,q.unitPrice??q.price);if(usd===null)continue;
        pushOrder({[rid]:book},{resourceId:rid,side:'asks',countryId:canonical(c),quantity:n(q.quantity)||n(q.available)||0,price:n(q.unitPrice??q.price),priceUsd:usd,currency:currency(c),source:'TRADE_OFFER_BOOK',referenceOnly:false,offerId:q.offerId||q.id||null});
      }
      const inv=countryValue(c,'resource.inventory'),prod=countryValue(c,'resource.production'),tradeable=countryValue(c,'resource.tradeAvailability');
      const spr=countryValue(c,'resource.strategicReserve'),protectedStock=n(spr?.availableByResource?.[rid])||0;
      const available=n(tradeable?.[rid])??Math.max(0,(n(inv?.[rid])||0)-protectedStock)+(n(prod?.[rid])||0);
      if(available>0){
        const ref=referencePrice(rid);
        const usd=ref?toUsd(c,ref.price):null;
        if(ref&&usd!==null)pushOrder({[rid]:book},{resourceId:rid,side:'asks',countryId:canonical(c),quantity:available,price:ref.price,priceUsd:usd,currency:currency(c),source:'OBSERVED_RESOURCE_LIQUIDITY_AT_REFERENCE',referenceOnly:true});
      }
    }
    book.bids=book.bids.slice(-MAX_ORDERS);book.asks=book.asks.slice(-MAX_ORDERS);
    return book;
  }
  function clearResource(rid,orders,history=[]){
    const bids=[...orders.bids].sort((a,b)=>b.priceUsd-a.priceUsd||a.countryId.localeCompare(b.countryId)||String(a.requestId||'').localeCompare(String(b.requestId||'')));
    const asks=[...orders.asks].sort((a,b)=>a.priceUsd-b.priceUsd||a.countryId.localeCompare(b.countryId)||String(a.offerId||'').localeCompare(String(b.offerId||'')));
    let matched=0,lastBid=null,lastAsk=null,matches=[],blockedPairs=[];
    const bidRemain=bids.map(x=>({...x,remaining:x.quantity}));
    const askRemain=asks.map(x=>({...x,remaining:x.quantity}));
    const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
    // Match each buyer against price-eligible sellers independently. An embargoed pair
    // is skipped without discarding that seller's offer for other countries.
    for(const bid of bidRemain){
      for(const ask of askRemain){
        if(bid.remaining<=1e-9)break;
        if(ask.remaining<=1e-9)continue;
        // Resource inventory at a reference price is a quote signal, not a seller order.
        // It must never create a fill or a fictitious clearing price.
        if(ask.referenceOnly===true)continue;
        if(bid.priceUsd+1e-12<ask.priceUsd)break;
        if(bid.countryId===ask.countryId)continue;
        const embargo=strategicPolicy?.isResourceEmbargoed?.(bid.countryId,ask.countryId,rid);
        if(embargo?.blocked){blockedPairs.push({buyerCountryId:bid.countryId,sellerCountryId:ask.countryId,resourceId:rid,reason:embargo.reason||'RESOURCE_EMBARGO_ACTIVE'});continue;}
        const routeMode=String(bid.transportMode||ask.transportMode||'ship');
        const buyerBlockade=strategicPolicy?.isRouteBlocked?.(bid.countryId,{resourceId:rid,transportMode:routeMode,routeId:bid.routeId,siteId:bid.siteId});
        const sellerBlockade=strategicPolicy?.isRouteBlocked?.(ask.countryId,{resourceId:rid,transportMode:routeMode,routeId:ask.routeId,siteId:ask.siteId});
        if(buyerBlockade?.blocked||sellerBlockade?.blocked){blockedPairs.push({buyerCountryId:bid.countryId,sellerCountryId:ask.countryId,resourceId:rid,reason:'RESOURCE_ROUTE_BLOCKADE_ACTIVE',blockades:[...(buyerBlockade?.blockades||[]),...(sellerBlockade?.blockades||[])]});continue;}
        const q=Math.min(bid.remaining,ask.remaining);if(!(q>0))continue;
        const stateDirective=strategicPolicy?.evaluateExportDirective?.(ask.countryId,bid.countryId,rid,q,
          ask.governmentContractId||bid.governmentContractId);
        if(stateDirective&&stateDirective.allowed===false){
          blockedPairs.push({buyerCountryId:bid.countryId,sellerCountryId:ask.countryId,resourceId:rid,
            reason:stateDirective.reason||'STATE_SUPPLY_DIRECTIVE_BLOCKED',stateSupplyDirective:stateDirective});
          continue;
        }
        matched+=q;lastBid=bid;lastAsk=ask;
        matches.push({buyerCountryId:bid.countryId,sellerCountryId:ask.countryId,quantity:q,bidPriceUsd:bid.priceUsd,askPriceUsd:ask.priceUsd,bidPrice:bid.price,askPrice:ask.price,referenceLiquidity:!!ask.referenceOnly});
        bid.remaining-=q;ask.remaining-=q;
      }
    }
    const ref=referencePrice(rid);
    const clearing=matched>0?Number(((lastBid.priceUsd+lastAsk.priceUsd)/2).toFixed(8)):null;
    const bestBid=bids[0]?.priceUsd??null,bestAsk=asks.find(x=>x.referenceOnly!==true)?.priceUsd??null;
    const status=clearing!==null?'CLEARED':(bestBid!==null||bestAsk!==null?'NO_CROSS':'NO_ORDERS');
    const matchedNotional=matches.reduce((s,x)=>s+(x.quantity||0)*((x.bidPriceUsd+x.askPriceUsd)/2),0);
    const vwap=matched>0?Number((matchedNotional/matched).toFixed(8)):null;
    const spread=bestBid!==null&&bestAsk!==null?Number((bestAsk-bestBid).toFixed(8)):null;
    const priceSamples=(Array.isArray(history)?history:[]).map(x=>n(x?.clearingPriceUsd)).filter(x=>x!==null);
    if(clearing!==null)priceSamples.push(clearing);
    const mean=priceSamples.length?priceSamples.reduce((s,x)=>s+x,0)/priceSamples.length:null;
    const variance=priceSamples.length>1?priceSamples.reduce((s,x)=>s+Math.pow(x-mean,2),0)/priceSamples.length:null;
    const volatilityUsd=variance!==null?Number(Math.sqrt(variance).toFixed(8)):null;
    return{resourceId:rid,status,numeraire:'USD',clearingPriceUsd:clearing,bestBidUsd:bestBid,bestAskUsd:bestAsk,matchedQuantity:matched,blockedTradePairs:blockedPairs,
      bidDepth:bids.reduce((s,x)=>s+(n(x.quantity)||0),0),askDepth:asks.filter(x=>x.referenceOnly!==true).reduce((s,x)=>s+(n(x.quantity)||0),0),referenceAskDepth:asks.filter(x=>x.referenceOnly===true).reduce((s,x)=>s+(n(x.quantity)||0),0),
      priceDiscovery:clearing!==null?'ORDER_BOOK_CROSSING':(bestBid!==null&&bestAsk!==null?'NEGOTIATION_RANGE':ref?'REFERENCE_ONLY':'UNAVAILABLE'),
      referencePrice:ref?.price??null,referenceUnit:ref?.unit??null,referenceSource:ref?.source??null,matches,vwapUsd:vwap,spreadUsd:spread,volatilityUsd,
      microstructure:{bidCount:bids.length,askCount:asks.filter(x=>x.referenceOnly!==true).length,referenceAskCount:asks.filter(x=>x.referenceOnly===true).length},
      generatedTurn:turn(),orderBookDepth:{bid:bids.length,ask:asks.filter(x=>x.referenceOnly!==true).length,referenceAsks:asks.filter(x=>x.referenceOnly===true).length}};
  }
  function rebuild(){
    const previousSnapshot=activeMarketSnapshot;
    activeMarketSnapshot=createMarketSnapshot();
    try{
      const markets={};
      const seedCountry=countries()[0];
      const persisted=seedCountry?countryValue(seedCountry,'trade.marketHistory'):{};
      for(const rid of resourceIds()){
        const orders=collectOrders(rid);
        const h=Array.isArray(persisted?.[rid])?persisted[rid]:[];
        const clearing=clearResource(rid,orders,h);
        markets[rid]={orders,clearing,history:h.concat([{turn:turn(),...clearing}]).slice(-MAX_MARKET_HISTORY)};
      }
      g.__OmegaMarketBooks=markets;
      return markets;
    }finally{
      activeMarketSnapshot=previousSnapshot;
    }
  }
  function quote(rid){
    const key=String(rid||'').trim();
    const row=g.__OmegaMarketBooks?.[key]||g.__OmegaMarketBooks?.[Object.keys(g.__OmegaMarketBooks||{}).find(x=>token(x)===token(key))];
    const q=row?.clearing||{resourceId:key,status:'UNAVAILABLE',priceDiscovery:'UNAVAILABLE',clearingPriceUsd:null,bestBidUsd:null,bestAskUsd:null,referencePrice:null};
    return clone(q);
  }
  function localPrice(countryId,rid){
    const q=quote(rid),c=canonical(countryId);
    const usd=q.clearingPriceUsd??q.referencePrice;
    if(usd===null||usd===undefined)return null;
    const rate=usdRate(c);if(rate===null)return null;
    return currency(c)==='USD'?usd:usd*rate;
  }
  function suppliers(rid,quantity=0,buyer=null){
    const target=canonical(buyer),out=[];
    for(const c of countries()){
      if(c===target)continue;
      const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
      const embargo=target?strategicPolicy?.isResourceEmbargoed?.(target,c,rid):null;
      if(embargo?.blocked)continue;
      const buyerBlockade=target?strategicPolicy?.isRouteBlocked?.(target,{resourceId:rid,transportMode:'ship'}):null;
      const sellerBlockade=strategicPolicy?.isRouteBlocked?.(c,{resourceId:rid,transportMode:'ship'});
      if(buyerBlockade?.blocked||sellerBlockade?.blocked)continue;
      const inv=countryValue(c,'resource.inventory'),prod=countryValue(c,'resource.production'),tradeable=countryValue(c,'resource.tradeAvailability');
      const spr=countryValue(c,'resource.strategicReserve'),protectedStock=n(spr?.availableByResource?.[rid])||0;
      const available=n(tradeable?.[rid])??Math.max(0,(n(inv?.[rid])||0)-protectedStock)+(n(prod?.[rid])||0);
      if(available<=0||available<quantity)continue;
      if(target){
        const stateDirective=strategicPolicy?.evaluateExportDirective?.(c,target,rid,
          quantity>0?Math.min(quantity,available):available,null,{[rid]:available});
        if(stateDirective&&stateDirective.allowed===false)continue;
      }
      const q=quote(rid),rel=countryValue(target,'foreign.relations')?.[c]||countryValue(c,'foreign.relations')?.[target]||null;
      out.push({countryId:c,resourceId:rid,available,marketQuote:q,relationObserved:!!rel,tradeAgreementObserved:rel?.trade_agreement===true});
    }
    return out.sort((a,b)=>a.countryId.localeCompare(b.countryId));
  }
  function privateCompanySuppliers(rid,quantity=0,buyer=null,sellerCompanyId=null,sellerCountryId=null){
    const target=canonical(buyer),requestedSeller=sellerCountryId?canonical(sellerCountryId):null,
      requested=Math.max(0,n(quantity)||0),companyFilter=String(sellerCompanyId||'').trim().toUpperCase(),
      lifecycle=g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1,
      companyIds=Array.isArray(lifecycle?.companyIds)?lifecycle.companyIds.map(x=>String(x).toUpperCase()):[],
      companyNames=lifecycle?.companyNames||{},out=[];
    if(!companyIds.length)return out;
    for(const c of countries()){
      if(c===target||(requestedSeller&&c!==requestedSeller))continue;
      const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
      const embargo=target?strategicPolicy?.isResourceEmbargoed?.(target,c,rid):null;
      if(embargo?.blocked)continue;
      const buyerBlockade=target?strategicPolicy?.isRouteBlocked?.(target,{resourceId:rid,transportMode:'ship'}):null;
      const sellerBlockade=strategicPolicy?.isRouteBlocked?.(c,{resourceId:rid,transportMode:'ship'});
      if(buyerBlockade?.blocked||sellerBlockade?.blocked)continue;
      const rs=countryValue(c,'resource'),rows=Array.isArray(rs?.batches)?rs.batches:[],
        lots=rs?.inventoryLots&&typeof rs.inventoryLots==='object'?rs.inventoryLots:{},
        shipments=Array.isArray(rs?.industrialNetwork?.shipments)?rs.industrialNetwork.shipments:[],
        reserve=rs?.strategicReserve?.availableByResource||{};
      const reserved=new Map();
      shipments.forEach(row=>{
        if(!row||String(row.status||'').toUpperCase()!=='IN_TRANSIT'||!row.batchId||token(row.resourceId)!==token(rid))return;
        const id=String(row.batchId);reserved.set(id,(reserved.get(id)||0)+Math.max(0,n(row.quantity)||0));
      });
      const buckets=Object.create(null);
      rows.forEach(batch=>{
        if(!batch||token(batch.resourceId||batch.materialIdentity)!==token(rid))return;
        const owner=String(batch.ownerCompanyId||batch.ownerId||'').trim().toUpperCase(),
          operator=String(batch.operatorCompanyId||batch.operatorId||batch.companyId||'').trim().toUpperCase(),
          ownerStatus=String(batch.ownerAttributionStatus||'').toUpperCase(),
          companyStatus=String(countryValue(c,'economy.privateEnterpriseLifecycle.companyStatuses')?.[owner]||'ACTIVE').toUpperCase(),
          stage=String(batch.stage||'').toUpperCase(),status=String(batch.status||'').toUpperCase();
        if(!companyIds.includes(owner)||(companyFilter&&owner!==companyFilter)||!companyIds.includes(operator)||companyStatus==='CLOSED')return;
        if(['NOT_RECORDED','OWNER_NOT_RECORDED','UNASSIGNED','UNKNOWN_SOURCE','LEGACY_COMPANY_ATTRIBUTION_ROLE_UNCLASSIFIED'].includes(ownerStatus))return;
        if(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY','SOLD','TRANSFERRED_OUT','DEPLETED'].includes(stage)||
           ['SOLD','CONSUMED','TRANSFERRED','DEPLETED'].includes(status))return;
        const batchId=String(batch.batchId||''),lot=lots[batchId];
        let available=Math.max(0,n(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
        if(lot){
          if(['SOLD','CONSUMED','TRANSFERRED','DEPLETED'].includes(String(lot.status||'').toUpperCase()))return;
          available=Math.min(available,Math.max(0,n(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0));
        }
        available=Math.max(0,available-(reserved.get(batchId)||0));
        if(available<=1e-9)return;
        if(!buckets[owner])buckets[owner]={companyId:owner,companyName:companyNames[owner]||owner,available:0,
          sourceBatchIds:[],sourceFactoryIds:[],operatorCompanyIds:[]};
        buckets[owner].available+=available;buckets[owner].sourceBatchIds.push(batchId);
        const factoryId=String(batch.sourceFactoryId||batch.factoryId||'').trim();
        if(factoryId)buckets[owner].sourceFactoryIds.push(factoryId);
        if(buckets[owner].operatorCompanyIds.indexOf(operator)<0)buckets[owner].operatorCompanyIds.push(operator);
      });
      const raw=rs?.warehouse||{},processed=rs?.processedWarehouse||{};
      const getFree=(book,locked)=>{
        const key=Object.keys(book||{}).find(k=>token(k)===token(rid));if(!key)return 0;
        return Math.max(0,(n(book[key])||0)-(n(locked?.[key])||n(locked?.[rid])||0));
      };
      const warehouseFree=getFree(raw.availableByResource,raw.reservedByResource)+
        getFree(processed.availableByResource,processed.reservedByResource);
      const protectedStock=Math.max(0,n(reserve[rid])||0);
      // Company-attributed batches can exceed the aggregate free warehouse balance when
      // legacy, reserved or stale lot records overlap. Allocate the single exportable
      // warehouse quantity across all owners once, rather than granting each company
      // the same aggregate ceiling.
      const exportableStock=Math.max(0,warehouseFree-protectedStock);
      const owners=Object.keys(buckets).map(companyId=>({
        companyId:companyId,row:buckets[companyId],units:Math.max(0,Math.floor(buckets[companyId].available*1e6+1e-7))
      })).filter(x=>x.units>0);
      const totalOwnerUnits=owners.reduce((sum,x)=>sum+x.units,0);
      const exportableUnits=Math.min(totalOwnerUnits,Math.max(0,Math.floor(exportableStock*1e6+1e-7)));
      let assignedUnits=0;
      owners.forEach(owner=>{
        const exact=totalOwnerUnits>0?exportableUnits*owner.units/totalOwnerUnits:0;
        owner.allocatedUnits=Math.min(owner.units,Math.floor(exact));
        owner.remainder=exact-owner.allocatedUnits;
        assignedUnits+=owner.allocatedUnits;
      });
      owners.slice().sort((a,b)=>b.remainder-a.remainder||a.companyId.localeCompare(b.companyId))
        .slice(0,Math.max(0,exportableUnits-assignedUnits))
        .forEach(owner=>{if(owner.allocatedUnits<owner.units)owner.allocatedUnits++;});
      const q=quote(rid),rel=target?(countryValue(target,'foreign.relations')?.[c]||countryValue(c,'foreign.relations')?.[target]||null):null;
      owners.forEach(owner=>{
        const companyId=owner.companyId,row=owner.row,available=owner.allocatedUnits/1e6;
        if(available<=0||available+1e-9<requested)return;
        const stateDirective=target?strategicPolicy?.evaluateExportDirective?.(c,target,rid,
          requested>0?requested:available,null,{[rid]:available}):null;
        if(stateDirective&&stateDirective.allowed===false)return;
        out.push({countryId:c,resourceId:rid,companyId:companyId,companyName:row.companyName,
          available:Number(available.toFixed(6)),sourceBatchIds:row.sourceBatchIds,
          sourceFactoryIds:[...new Set(row.sourceFactoryIds)],operatorCompanyIds:row.operatorCompanyIds,
          marketQuote:q,relationObserved:!!rel,tradeAgreementObserved:rel?.trade_agreement===true,
          ownerAttributionStatus:'VERIFIED_EXPLICIT_PRIVATE_COMPANY_BATCH_OWNER',
          authority:'EXACT_PRIVATE_BATCH_AND_WAREHOUSE_STOCK'});
      });
    }
    return out.sort((a,b)=>b.available-a.available||a.countryId.localeCompare(b.countryId)||a.companyId.localeCompare(b.companyId));
  }
  function writeProjection(c,markets){
    const m=interop();if(!m?.dispatchCommand)return null;
    const snapshot={turn:turn(),numeraire:'USD',resources:{}};
    for(const [rid,row] of Object.entries(markets||{})){
      snapshot.resources[rid]={...clone(row.clearing),history:clone(row.history||[])};
    }
    return m.dispatchCommand('trade','OMEGA_MARKET_PUBLISH_PROJECTION',canonical(c),{snapshot},{turn:turn(),commandType:'OMEGA_MARKET_PUBLISH_PROJECTION',correlationId:'MARKET-'+turn()+'-'+canonical(c)});
  }
  function projectionHandler(cmd,ctx){
    const p=cmd?.payload||{},snap=clone(p.snapshot||{});
    ctx.stateTransaction.set('trade.marketState',snap);
    const prices={};
    for(const [rid,q] of Object.entries(snap.resources||{})){
      const px=q.clearingPriceUsd??q.referencePrice??null;
      if(px!==null){
        const rate=usdRate(ctx.countryId);
        if(rate!==null)prices[rid]=currency(ctx.countryId)==='USD'?px:px*rate;
      }
    }
    if(Object.keys(prices).length)ctx.stateTransaction.set('trade.marketPrice',prices);
    const meta=ctx.stateTransaction.get('trade.marketMeta');
    const next=meta&&typeof meta==='object'?clone(meta):{};
    const history=ctx.stateTransaction.get('trade.marketHistory');
    const h=history&&typeof history==='object'?clone(history):{};
    for(const [rid,q] of Object.entries(snap.resources||{})){
      const row=clone(q);const rows=Array.isArray(row.history)?row.history.slice(-MAX_MARKET_HISTORY):[];
      delete row.history;next[rid]=row;h[rid]=rows;
    }
    ctx.stateTransaction.set('trade.marketMeta',next);
    ctx.stateTransaction.set('trade.marketHistory',h);
    return{accepted:true,resourceCount:Object.keys(snap.resources||{}).length,turn:snap.turn};
  }

  function companyResearchRequestHandler(cmd,ctx){
    const p=cmd?.payload||{},cid=canonical(ctx.countryId),requestId=String(p.requestId||'').trim(),
      companyId=id(p.companyId),outputs=Array.isArray(p.outputResources)?p.outputResources.map(x=>token(x)).filter(Boolean):[],
      inputs=Array.isArray(p.inputResources)?p.inputResources.map(x=>token(x)).filter(Boolean):[],
      scopes=Array.isArray(p.marketScopes)?p.marketScopes.map(x=>id(x)).filter(Boolean):[];
    if(!cid||!requestId||!companyId)return{accepted:false,reason:'COMPANY_MARKET_RESEARCH_IDENTITY_REQUIRED'};
    if(!outputs.length&&!inputs.length)return{accepted:false,reason:'COMPANY_MARKET_RESEARCH_COMMODITIES_REQUIRED'};
    if(outputs.length>64||inputs.length>64||scopes.length>4)return{accepted:false,reason:'COMPANY_MARKET_RESEARCH_SCOPE_LIMIT'};
    const unique=rows=>[...new Set(rows)].sort();
    const request={
      requestId,companyId,companyName:String(p.companyName||companyId),
      countryId:cid,factoryType:token(p.factoryType)||null,
      requestedFactoryCount:Number.isInteger(Number(p.factoryCount))?Math.max(0,Number(p.factoryCount)):null,
      outputResources:unique(outputs),inputResources:unique(inputs),
      marketScopes:unique(scopes.length?scopes:['DOMESTIC','INTERNATIONAL']),
      analysisHorizonDays:Math.max(1,Math.min(3650,Number(p.analysisHorizonDays)||30)),
      requestPurpose:String(p.requestPurpose||'PRIVATE_FACTORY_INVESTMENT_DUE_DILIGENCE').slice(0,180),
      source:'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_V1',
      submittedTurn:turn(),status:'QUEUED',responseStatus:'AWAITING_MARKET_EVIDENCE',
      evidencePolicy:'OBSERVED_ONLY_MISSING_DATA_REMAINS_UNOBSERVED'
    };
    const previous=ctx.stateTransaction.get('trade.companyMarketResearchRequests');
    const queue=Array.isArray(previous)?clone(previous):[];
    const existing=queue.find(row=>row&&String(row.requestId)===requestId);
    if(existing){
      const comparable=row=>JSON.stringify({
        requestId:row.requestId,companyId:row.companyId,countryId:row.countryId,
        factoryType:row.factoryType,requestedFactoryCount:row.requestedFactoryCount,
        outputResources:row.outputResources,inputResources:row.inputResources,
        marketScopes:row.marketScopes,analysisHorizonDays:row.analysisHorizonDays,requestPurpose:row.requestPurpose
      });
      return comparable(existing)===comparable(request)
        ?{accepted:true,duplicate:true,request:clone(existing)}
        :{accepted:false,reason:'COMPANY_MARKET_RESEARCH_REQUEST_ID_COLLISION'};
    }
    queue.push(request);
    ctx.stateTransaction.set('trade.companyMarketResearchRequests',queue.slice(-512));
    emit('OMEGA_MARKET_RESEARCH_REQUEST_QUEUED',cid,request);
    return{accepted:true,request:clone(request),queueSize:Math.min(512,queue.length)};
  }
  function requestCompanyResearch(countryId,payload={}){
    const mesh=interop(),cid=canonical(countryId||playerSimulationCountryId());
    if(!cid)return{accepted:false,reason:'PLAYER_COUNTRY_NOT_RESOLVED'};
    if(!mesh?.dispatchCommand)return{accepted:false,reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    install();
    const requestId=String(payload.requestId||('MARKET-RESEARCH-'+cid+'-'+turn()+'-'+token(payload.companyId)+'-'+token(payload.factoryType)));
    const result=mesh.dispatchCommand('trade','OMEGA_MARKET_QUEUE_COMPANY_RESEARCH',cid,
      {...clone(payload),requestId},{turn:turn(),commandType:'OMEGA_MARKET_QUEUE_COMPANY_RESEARCH',correlationId:requestId});
    return result&&result.status==='APPLIED'&&result.result?result.result:result;
  }
  function getCompanyResearchRequests(countryId,companyId){
    const rows=countryValue(countryId||playerSimulationCountryId(),'trade.companyMarketResearchRequests');
    const target=id(companyId);
    return clone((Array.isArray(rows)?rows:[]).filter(row=>!target||id(row.companyId)===target));
  }

  function install(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    try{
      m.registerAction?.('OMEGA_MARKET_PUBLISH_PROJECTION',{actionId:'OMEGA_MARKET_PUBLISH_PROJECTION',stateOwnerMinistry:'trade',authority:'OMEGA_GLOBAL_MARKET'});
      m.registerCommandHandler('OMEGA_MARKET_PUBLISH_PROJECTION','trade',projectionHandler);
      m.registerAction?.('OMEGA_MARKET_QUEUE_COMPANY_RESEARCH',{actionId:'OMEGA_MARKET_QUEUE_COMPANY_RESEARCH',stateOwnerMinistry:'trade',authority:'OMEGA_GLOBAL_MARKET'});
      m.registerCommandHandler('OMEGA_MARKET_QUEUE_COMPANY_RESEARCH','trade',companyResearchRequestHandler);
      return true;
    }catch(_){return false;}
  }
  function playerSimulationCountryId(){
    const sim=g.Omega&&g.Omega.Simulation,root=state()||{};
    const session=root.simulation&&root.simulation.session||sim&&sim.world&&sim.world.state&&sim.world.state.simulation&&sim.world.state.simulation.session||{};
    let direct=null;
    try{if(sim&&typeof sim.getPlayerCountryId==='function')direct=sim.getPlayerCountryId();}catch(_){}
    const candidates=[session.playerCountryId,direct,root.simulation&&root.simulation.playerCountryId,root.playerCountryId,root.playerCountryCode,
      g.Game&&(g.Game.playerCountryId||g.Game.playerCountryCode||g.Game.playerCountry),g.OMEGA_PLAYER_COUNTRY_ID];
    for(const value of candidates){
      const raw=value&&typeof value==='object'?(value.iso3||value.iso3Code||value.countryCode||value.countryId||value.code||value.id||value.name):value;
      const cid=canonical(raw);
      if(cid&&cid!=='GLOBAL'&&cid!=='WORLD'&&/^[A-Z0-9]{2,3}$/.test(cid))return cid;
    }
    return null;
  }
  function rebuildCountry(countryId){
    const selected=playerSimulationCountryId(),target=canonical(countryId||selected);
    if(!selected)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
    if(target!==selected)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:target,playerCountryId:selected};
    const token=String(turn())+':'+selected;
    if(g.__omegaGlobalMarketProjectedToken===token)return{status:'ALREADY_UPDATED',countryId:selected,turn:turn()};
    install();
    const markets=rebuild();
    const result=writeProjection(selected,markets);
    try{interop()?.emitEvent?.('OMEGA_MARKET_PRICE_UPDATED',selected,'trade',{turn:turn(),resources:Object.keys(markets).length},{turn:turn(),correlationId:'MARKET-'+turn()+'-'+selected});}catch(_){}
    g.__omegaGlobalMarketProjectedToken=token;
    return{status:'COMPLETED',countryId:selected,turn:turn(),resourceCount:Object.keys(markets).length,projection:result};
  }
  function onTurn(){
    const selected=playerSimulationCountryId();
    if(!selected)return {status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
    return rebuildCountry(selected);
  }
  function diagnostics(){
    const markets=g.__OmegaMarketBooks||{},rows=Object.values(markets);
    return{version:VERSION,handlerInstalled:!!interop()?.commandHandlers?.has?.('OMEGA_MARKET_PUBLISH_PROJECTION'),resourceMarkets:rows.length,clearedMarkets:rows.filter(x=>x.clearing?.status==='CLEARED').length,marketOrderCount:rows.reduce((s,x)=>s+(x.orders?.bids?.length||0)+(x.orders?.asks?.length||0),0),numeraire:'USD'};
  }
  function init(){
    install();
    if(!g.__omegaGlobalMarketHook){
      g.__omegaGlobalMarketHook=true;
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
      g.addEventListener?.('OMEGA_READY',install);
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',install);
    }
    if(state()?.simulation?.turn!==undefined)rebuild();
    return diagnostics();
  }
  const API=Object.freeze({VERSION,diagnostics,rebuild,rebuildCountry,quote,localPrice,suppliers,privateCompanySuppliers,
    requestCompanyResearch,getCompanyResearchRequests});
  g.Omega=g.Omega||{};g.Omega.GlobalMarket=API;g.OmegaGlobalMarket=API;
  try{init();}catch(e){g.OmegaGlobalMarketError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
