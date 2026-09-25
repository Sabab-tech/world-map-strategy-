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
  const countries=()=>{
    try{return[...new Set((registry()?.list?.('COUNTRY')||registry()?.list?.()||[]).map(canonical).filter(Boolean))].sort();}
    catch(_){return Object.keys(state()?.trade||{}).map(canonical).filter(Boolean).sort();}
  };
  function countryValue(c,path){
    const cid=canonical(c),parts=String(path||'').split('.'),domain=parts.shift();let bucket=state()?.[domain];
    if(bucket&&typeof bucket==='object')bucket=bucket[cid]??bucket[Object.keys(bucket).find(k=>id(k)===cid)];
    for(const p of parts){if(bucket==null||!Object.prototype.hasOwnProperty.call(Object(bucket),p))return undefined;bucket=bucket[p];}
    return bucket;
  }
  function currency(c){
    return String(countryValue(c,'finance.currencyCode')||countryValue(c,'economy.currency_code')||countryValue(c,'economy.currencyCode')||countryValue(c,'trade.settlementCurrency')||'').trim().toUpperCase()||null;
  }
  function usdRate(c){
    const code=currency(c);
    if(!code)return null;
    if(code==='USD')return 1;
    const raw=n(countryValue(c,'economy.exchange_rate_usd')??countryValue(c,'finance.exchange_rate_usd')??countryValue(c,'finance.usdPerUnit'));
    if(raw===null||raw<=0)return null;
    return raw;
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
    let bi=0,ai=0,matched=0,lastBid=null,lastAsk=null,matches=[];
    const bidRemain=bids.map(x=>({...x,remaining:x.quantity}));
    const askRemain=asks.map(x=>({...x,remaining:x.quantity}));
    while(bi<bidRemain.length&&ai<askRemain.length){
      const bid=bidRemain[bi],ask=askRemain[ai];
      if(bid.priceUsd+1e-12<ask.priceUsd)break;
      if(bid.countryId===ask.countryId){ai+=1;continue;}
      const q=Math.min(bid.remaining,ask.remaining);if(!(q>0))break;
      matched+=q;lastBid=bid;lastAsk=ask;
      matches.push({buyerCountryId:bid.countryId,sellerCountryId:ask.countryId,quantity:q,bidPriceUsd:bid.priceUsd,askPriceUsd:ask.priceUsd,bidPrice:bid.price,askPrice:ask.price,referenceLiquidity:!!ask.referenceOnly});
      bid.remaining-=q;ask.remaining-=q;
      if(bid.remaining<=0)bi+=1;if(ask.remaining<=0)ai+=1;
    }
    const ref=referencePrice(rid);
    const clearing=matched>0?Number(((lastBid.priceUsd+lastAsk.priceUsd)/2).toFixed(8)):null;
    const bestBid=bids[0]?.priceUsd??null,bestAsk=asks[0]?.priceUsd??null;
    const status=clearing!==null?'CLEARED':(bestBid!==null||bestAsk!==null?'NO_CROSS':'NO_ORDERS');
    const matchedNotional=matches.reduce((s,x)=>s+(x.quantity||0)*((x.bidPriceUsd+x.askPriceUsd)/2),0);
    const vwap=matched>0?Number((matchedNotional/matched).toFixed(8)):null;
    const spread=bestBid!==null&&bestAsk!==null?Number((bestAsk-bestBid).toFixed(8)):null;
    const priceSamples=(Array.isArray(history)?history:[]).map(x=>n(x?.clearingPriceUsd)).filter(x=>x!==null);
    if(clearing!==null)priceSamples.push(clearing);
    const mean=priceSamples.length?priceSamples.reduce((s,x)=>s+x,0)/priceSamples.length:null;
    const variance=priceSamples.length>1?priceSamples.reduce((s,x)=>s+Math.pow(x-mean,2),0)/priceSamples.length:null;
    const volatilityUsd=variance!==null?Number(Math.sqrt(variance).toFixed(8)):null;
    return{resourceId:rid,status,numeraire:'USD',clearingPriceUsd:clearing,bestBidUsd:bestBid,bestAskUsd:bestAsk,matchedQuantity:matched,
      bidDepth:bids.reduce((s,x)=>s+(n(x.quantity)||0),0),askDepth:asks.reduce((s,x)=>s+(n(x.quantity)||0),0),
      priceDiscovery:clearing!==null?'ORDER_BOOK_CROSSING':(bestBid!==null&&bestAsk!==null?'NEGOTIATION_RANGE':ref?'REFERENCE_ONLY':'UNAVAILABLE'),
      referencePrice:ref?.price??null,referenceUnit:ref?.unit??null,referenceSource:ref?.source??null,matches,vwapUsd:vwap,spreadUsd:spread,volatilityUsd,
      microstructure:{bidCount:bids.length,askCount:asks.length,referenceAskCount:asks.filter(x=>x.referenceOnly).length},
      generatedTurn:turn(),orderBookDepth:{bid:bids.length,ask:asks.length}};
  }
  function rebuild(){
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
      const inv=countryValue(c,'resource.inventory'),prod=countryValue(c,'resource.production'),tradeable=countryValue(c,'resource.tradeAvailability');
      const spr=countryValue(c,'resource.strategicReserve'),protectedStock=n(spr?.availableByResource?.[rid])||0;
      const available=n(tradeable?.[rid])??Math.max(0,(n(inv?.[rid])||0)-protectedStock)+(n(prod?.[rid])||0);
      if(available<=0||available<quantity)continue;
      const q=quote(rid),rel=countryValue(target,'foreign.relations')?.[c]||countryValue(c,'foreign.relations')?.[target]||null;
      out.push({countryId:c,resourceId:rid,available,marketQuote:q,relationObserved:!!rel,tradeAgreementObserved:rel?.trade_agreement===true});
    }
    return out.sort((a,b)=>a.countryId.localeCompare(b.countryId));
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
  function install(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    try{
      m.registerAction?.('OMEGA_MARKET_PUBLISH_PROJECTION',{actionId:'OMEGA_MARKET_PUBLISH_PROJECTION',stateOwnerMinistry:'trade',authority:'OMEGA_GLOBAL_MARKET'});
      m.registerCommandHandler('OMEGA_MARKET_PUBLISH_PROJECTION','trade',projectionHandler);
      return true;
    }catch(_){return false;}
  }
  function onTurn(){
    install();
    const markets=rebuild();
    for(const c of countries()){
      writeProjection(c,markets);
      try{interop()?.emitEvent?.('OMEGA_MARKET_PRICE_UPDATED',c,'trade',{turn:turn(),resources:Object.keys(markets).length},{turn:turn(),correlationId:'MARKET-'+turn()+'-'+c});}catch(_){}
    }
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
  const API=Object.freeze({VERSION,diagnostics,rebuild,quote,localPrice,suppliers});
  g.Omega=g.Omega||{};g.Omega.GlobalMarket=API;g.OmegaGlobalMarket=API;
  try{init();}catch(e){g.OmegaGlobalMarketError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
