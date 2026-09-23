/* OMEGA GLOBAL TRADE AUTONOMY SYSTEM v1.0.0
 * One deterministic world trade coordinator. Every country uses the same pipeline:
 * request -> counterparty review -> negotiation -> pressure/retry -> settlement.
 * Cross-country writes are split into owner-ministry transactions.
 */
(function(g){
  'use strict';
  const VERSION='1.0.0';
  const MAX_HISTORY=256, RETRY_COOLDOWN=2, MILITARY_ESCALATION_AFTER=3;
  const TYPES=Object.freeze({
    SENT:'SENT',COUNTER_OFFERED:'COUNTER_OFFERED',ACCEPTED:'ACCEPTED',REJECTED:'REJECTED',
    SETTLEMENT_PREPARING:'SETTLEMENT_PREPARING',SETTLED:'SETTLED',FAILED:'FAILED',
    WAITING_DATA:'WAITING_DATA'
  });
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k],seen);
    return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const clamp=(v,a=0,b=1)=>{const n=num(v);return n===null?null:Math.max(a,Math.min(b,n));};
  const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const state=()=>g.Game?.state||g.gameState||null;
  const turn=()=>{const s=state();return num(s?.simulation?.turn??s?.turn??s?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;};
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const memory=()=>g.OmegaOpponentDeepMemory||g.Omega?.OpponentDeepMemory||null;

  function ids(){
    try{
      const b=registry();
      const a=b?.list?.('COUNTRY')||b?.list?.()||[];
      return [...new Set(a.map(canonical).filter(Boolean))].sort();
    }catch(_){return Object.keys(state()?.trade||{}).map(canonical).filter(Boolean).sort();}
  }
  function read(root,path){
    let cur=root;
    for(const p of String(path||'').split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),p))return undefined;
      cur=cur[p];
    }
    return cur;
  }
  function countryValue(c,path){
    const s=state(),cid=canonical(c),parts=String(path||'').split('.'),domain=parts.shift();
    let bucket=s?.[domain];
    if(bucket&&typeof bucket==='object')bucket=bucket[cid]??bucket[Object.keys(bucket).find(k=>id(k)===cid)];
    return read(bucket,parts.join('.'));
  }
  function relation(buyer,seller){
    const a=canonical(buyer),b=canonical(seller);
    const candidates=[
      countryValue(a,'foreign.relations')?.[b],
      countryValue(a,'trade.relations')?.[b],
      countryValue(a,'relations')?.[b],
      countryValue(b,'foreign.relations')?.[a],
      countryValue(b,'trade.relations')?.[a],
      countryValue(b,'relations')?.[a]
    ].filter(x=>x!==undefined&&x!==null);
    const base=clone(candidates[0]||null);
    if(!base)return null;
    const adjustments=countryValue(a,'foreign.relationAdjustments')?.[b];
    const rows=Array.isArray(adjustments)?adjustments:[];
    const delta=rows.reduce((s,x)=>s+(num(x?.delta)||0),0);
    if(delta!==0){
      for(const k of ['overall','trade','trust','political']){
        const v=num(base[k]);
        if(v!==null)base[k]=Math.max(0,Math.min(100,v+delta));
      }
    }
    return base;
  }
  function relationScore(r){
    if(!r)return null;
    if(r.war_state===true||r.sanctions===true)return 0;
    const vals=[
      ['overall',.35],['trade',.35],['trust',.20],['political',.10]
    ].map(([k,w])=>{const x=num(r[k]);return x===null?null:[x>1?x/100:x,w];}).filter(Boolean);
    if(!vals.length)return null;
    const sw=vals.reduce((s,[,w])=>s+w,0);
    let score=vals.reduce((s,[x,w])=>s+x*w,0)/sw;
    const adj=countryValue(buyer,'foreign.relationAdjustments')?.[canonical(seller)];
    if(Array.isArray(adj))score+=adj.reduce((s,x)=>s+(num(x.delta)||0)/100,0);
    else if(adj)score+=(num(adj.delta)||0)/100;
    return clamp(score);
  }
  function agreement(r,buyer,seller){
    if(r?.trade_agreement===true)return true;
    const t=countryValue(buyer,'foreign.treaties')?.[canonical(seller)];
    return !!t && /SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(String(t.status||t.stage||'').toUpperCase());
  }
  function sanctionsOrWar(r){return r?.war_state===true||r?.sanctions===true;}
  function marketPrice(country,resource){
    const rid=String(resource||'').trim();
    try{
      const market=g.OmegaGlobalMarket||g.Omega?.GlobalMarket;
      const local=market?.localPrice?.(canonical(country),rid);
      if(num(local)!==null&&local>=0)return local;
    }catch(_){}
    const paths=[
      'trade.marketPrice.'+rid,'trade.marketPrices.'+rid,
      'trade.offerBook.'+rid+'.unitPrice','trade.offerBook.'+rid+'.price',
      'trade.offers.'+rid+'.unitPrice','trade.offers.'+rid+'.price'
    ];
    for(const p of paths){const x=num(countryValue(country,p));if(x!==null&&x>=0)return x;}
    try{
      const x=g.ResourceMinistryEngine?.getIntegratedResourceState?.(canonical(country));
      const m=x?.marketPrices||x?.priceBook||x?.supplierPrices;
      const n=num(m?.[rid]??m?.[String(rid).toLowerCase()]);
      if(n!==null&&n>=0)return n;
    }catch(_){}
    return null;
  }
  function inventory(country,resource){
    const rid=String(resource||'').trim();
    const inv=countryValue(country,'resource.inventory');
    const resv=countryValue(country,'resource.reserves');
    const production=countryValue(country,'resource.production');
    const find=(obj)=>{
      if(!obj||typeof obj!=='object')return null;
      const k=Object.prototype.hasOwnProperty.call(obj,rid)?rid:Object.keys(obj).find(x=>token(x)===token(rid));
      return k===undefined?null:num(obj[k]);
    };
    let stock=find(inv),reserve=find(resv),prod=find(production);
    if(stock===null){
      try{const x=g.ResourceMinistryEngine?.getIntegratedResourceState?.(canonical(country));stock=find(x?.inventory);reserve=reserve??find(x?.reserves);prod=prod??find(x?.production);}catch(_){}
    }
    return{stock,reserve,production};
  }
  function routeCapacity(buyer,resource){
    const rid=String(resource||'');
    const paths=['trade.routeCapacity.'+rid,'trade.routeCapacity','transport.tradeRouteCapacity.'+rid,'transport.tradeRouteCapacity'];
    for(const p of paths){const x=countryValue(buyer,p);const n=num(x);if(n!==null)return n;}
    return null;
  }
  function currencyOf(country){
    return String(
      countryValue(country,'trade.settlementCurrency')||
      countryValue(country,'finance.currencyCode')||
      countryValue(country,'economy.currency_code')||
      countryValue(country,'economy.currencyCode')||
      ''
    ).trim().toUpperCase()||null;
  }
  function fxRate(buyer,seller){
    const bc=currencyOf(buyer),sc=currencyOf(seller);
    if(!bc||!sc)return null;
    if(bc===sc)return 1;
    const paths=[
      'finance.exchangeRates.'+sc,
      'trade.exchangeRates.'+sc,
      'finance.fx.'+sc,
      'trade.fx.'+sc
    ];
    for(const p of paths){
      const direct=num(countryValue(buyer,p));
      if(direct!==null&&direct>0)return direct;
    }
    const globalRates=state()?.exchangeRates||state()?.fxRates||null;
    const direct=num(globalRates?.[bc]?.[sc]??globalRates?.[sc]?.[bc]);
    if(direct!==null&&direct>0)return direct;
    return null;
  }
  function settlementValues(buyer,seller,quantity,unitPrice){
    const q=num(quantity),p=num(unitPrice),fx=fxRate(buyer,seller);
    if(q===null||p===null||fx===null)return{buyerValue:null,sellerValue:null,fx};
    const sellerValue=q*p;
    return{buyerValue:sellerValue*fx,sellerValue,fx,buyerCurrency:currencyOf(buyer),sellerCurrency:currencyOf(seller)};
  }

  function financial(country){
    const available=num(countryValue(country,'finance.available'));
    const reserves=num(countryValue(country,'finance.reserves'));
    const debt=num(countryValue(country,'economy.debt'));
    const gdp=num(countryValue(country,'economy.gdp'));
    const liquidity=available??reserves;
    return{available,reserves,liquidity,debt,gdp,debtToGdp:gdp&&debt!==null?debt/gdp:null};
  }
  function memoryInsight(buyer,seller){
    try{return memory()?.relationInsight?.(canonical(buyer),canonical(seller))||{known:false};}catch(_){return{known:false};}
  }
  function ensureTradeBucket(root,c){
    if(!root[c]||typeof root[c]!=='object')root[c]={};
    if(!Array.isArray(root[c].importRequests))root[c].importRequests=[];
    if(!root[c].globalTradeLedger||typeof root[c].globalTradeLedger!=='object')root[c].globalTradeLedger={requests:[],decisions:[],settlements:[]};
    return root[c];
  }

  function emit(type,c,payload={},source='trade'){
    const mesh=interop();
    try{
      if(mesh?.emitEvent)return mesh.emitEvent(type,canonical(c),source,{countryId:canonical(c),...clone(payload)},{turn:turn()});
    }catch(_){}
    try{g.dispatchEvent?.(new CustomEvent(type,{detail:{eventType:type,countryId:canonical(c),...clone(payload),simulationTurn:turn()}}));}catch(_){}
    return null;
  }
  function command(owner,type,c,payload={}){
    const mesh=interop();
    if(!mesh?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{return mesh.dispatchCommand(owner,type,canonical(c),payload,{turn:turn(),commandType:type,correlationId:payload?.requestId||payload?.settlementId||payload?.decisionId||null});}
    catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }

  function sellerReviewDecision(request){
    const buyer=canonical(request.countryId),seller=canonical(request.targetCountryId),resourceId=String(request.resourceId||'').trim();
    const r=relation(buyer,seller),rel=relationScore(r),price=marketPrice(seller,resourceId),supply=inventory(seller,resourceId);
    const sellerFin=financial(seller),need=num(request.needPressure)??0.5;
    const result={
      requestId:String(request.requestId),buyerCountryId:buyer,sellerCountryId:seller,resourceId,
      quantity:num(request.quantity),offeredUnitPrice:num(request.unitPrice),marketPrice:price,
      relationScore:rel,agreement:agreement(r,buyer,seller),decision:'WAITING_DATA',reason:null,
      quantityApproved:null,unitPrice:null,confidence:0.5,
      sellerCurrency:currencyOf(seller),buyerCurrency:currencyOf(buyer),fxRate:null
    };
    if(!r){result.reason='FOREIGN_RELATION_NOT_OBSERVED';return result;}
    if(sanctionsOrWar(r)){result.decision='REJECT';result.reason='WAR_OR_SANCTIONS';return result;}
    if(rel===null){result.reason='RELATION_SCORE_NOT_OBSERVED';return result;}
    if(!result.agreement){result.decision='REJECT';result.reason='TRADE_AGREEMENT_NOT_APPROVED';return result;}
    if(price===null){result.reason='SELLER_MARKET_PRICE_NOT_OBSERVED';return result;}
    if(result.quantity===null||result.quantity<=0){result.decision='REJECT';result.reason='INVALID_QUANTITY';return result;}
    if(supply.stock===null){result.reason='SELLER_RESOURCE_STOCK_NOT_OBSERVED';return result;}
    const reserve=Math.max(0,supply.reserve||0),free=Math.max(0,supply.stock-reserve);
    if(free<=0){result.decision='REJECT';result.reason='RESOURCE_RESERVED_OR_SCARCE';return result;}
    const approved=Math.min(result.quantity,free);
    const debtPressure=sellerFin.debtToGdp===null?0:clamp(sellerFin.debtToGdp/1.5);
    const liquidityPressure=sellerFin.liquidity===null?0:clamp(1-(sellerFin.liquidity/Math.max(sellerFin.gdp||sellerFin.liquidity||1,1)));
    const productionBuffer=supply.production===null||supply.production===undefined?null:clamp(Number(supply.production)/(Math.max(Number(supply.production)+Number(supply.stock||0),1)));
    const strategicScarcity=free<=Math.max(result.quantity,0)?1:clamp(result.quantity/Math.max(free,1));
    const diplomaticBenefit=rel;
    const willingness=clamp(
      .35*diplomaticBenefit+
      .25*debtPressure+
      .20*liquidityPressure+
      .20*(1-strategicScarcity)
    );
    result.sellerDecisionFactors={resourceFree:free,resourceReserve:reserve,resourceScarcity:strategicScarcity,
      debtPressure,liquidityPressure,productionBuffer,diplomaticBenefit,willingness};
    const offered=result.offeredUnitPrice;
    if(offered===null){result.reason='REQUESTED_PRICE_NOT_OBSERVED';return result;}
    if(approved<result.quantity){
      result.quantityApproved=approved;
      if(approved<=0){result.decision='REJECT';result.reason='INSUFFICIENT_FREE_SUPPLY';return result;}
      result.unitPrice=price;
      result.decision='COUNTER';
      result.reason=willingness>=.65?'SCARCE_RESOURCE_RELEASED_AT_MARKET':'SUPPLY_LIMIT_COUNTER_OFFER';
      result.confidence=.85;
      return result;
    }
    if(offered < price*0.95){
      result.quantityApproved=approved;
      result.unitPrice=price;
      result.decision=willingness>=.75?'ACCEPT':'COUNTER';
      result.reason=result.decision==='ACCEPT'?'DEBT_OR_DIPLOMATIC_LIQUIDITY_PRESSURE':'PRICE_BELOW_MARKET';
      result.confidence=.9;
      return result;
    }
    result.quantityApproved=approved;
    result.unitPrice=offered>=price?offered:price;
    result.fxRate=fxRate(buyer,seller);
    if(result.fxRate===null){result.decision='WAITING_DATA';result.reason='SETTLEMENT_FX_NOT_OBSERVED';return result;}
    result.decision=(rel>=.25||need>=.8||diplomacyWeight>=.6)?'ACCEPT':'COUNTER';
    if(result.decision==='COUNTER'){result.reason='LOW_RELATION_OR_COMMERCIAL_TERM';result.unitPrice=price;}
    result.confidence=.85;
    return result;
  }

  function reviewHandler(cmd,ctx){
    const p=cmd?.payload||{},r=p.request||{},decision=sellerReviewDecision(r),seller=canonical(ctx.countryId);
    const ledger=ctx.stateTransaction.get('trade.globalTradeLedger');
    const root=ledger&&typeof ledger==='object'?clone(ledger):{requests:[],decisions:[],settlements:[]};
    root.decisions=[...(root.decisions||[]),{...decision,simulationTurn:turn()}].slice(-MAX_HISTORY);
    ctx.stateTransaction.set('trade.globalTradeLedger',root);
    if(decision.decision==='ACCEPT')emit('OMEGA_TRADE_REQUEST_ACCEPTED',seller,{
      requestId:decision.requestId,buyerCountryId:decision.buyerCountryId,resourceId:decision.resourceId,
      quantityApproved:decision.quantityApproved,unitPrice:decision.unitPrice,decision:decision.decision,reason:decision.reason
    });
    else if(decision.decision==='REJECT')emit('OMEGA_TRADE_REQUEST_REJECTED',seller,{
      requestId:decision.requestId,buyerCountryId:decision.buyerCountryId,resourceId:decision.resourceId,
      quantityApproved:decision.quantityApproved,unitPrice:decision.unitPrice,decision:decision.decision,reason:decision.reason
    });
    if(decision.decision==='COUNTER'){
      emit('OMEGA_TRADE_COUNTER_OFFERED',seller,decision);
      return{accepted:true,decision:decision.decision,tradeDecision:decision};
    }
    if(decision.decision==='ACCEPT')return{accepted:true,decision:'ACCEPT',tradeDecision:decision};
    if(decision.decision==='REJECT')return{accepted:true,decision:'REJECT',tradeDecision:decision};
    return{accepted:true,decision:'WAITING_DATA',tradeDecision:decision};
  }

  function relScoreForBuyer(buyer,seller){
    return relationScore(relation(buyer,seller))??0.5;
  }

  function buyerResponseHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId),requestId=String(p.requestId||''),response=clone(p.response||{});
    const rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!Array.isArray(bucket.importRequests))bucket.importRequests=[];
    if(!bucket.globalTradeLedger||typeof bucket.globalTradeLedger!=='object')bucket.globalTradeLedger={requests:[],decisions:[],settlements:[]};
    const idx=bucket.importRequests.findIndex(x=>String(x.requestId)===requestId);
    if(idx<0)return{accepted:false,reason:'TRADE_REQUEST_NOT_FOUND'};
    const req=clone(bucket.importRequests[idx]);
    const decision=String(response.decision||'WAITING_DATA').toUpperCase();
    req.lastCounterpartyDecision=clone(response);
    req.lastDecisionTurn=turn();
    if(decision==='WAITING_DATA'){req.status='SENT';req.stage='COUNTERPARTY_DATA_PENDING';bucket.importRequests[idx]=req;ctx.stateTransaction.set('trade',bucket);return{accepted:true,status:'WAITING_DATA'};}
    if(decision==='REJECT'){
      req.status=TYPES.REJECTED;req.stage='COUNTERPARTY_REJECTED';req.rejectionReason=response.reason||'COUNTERPARTY_REJECTED';
      req.refusalCount=(num(req.refusalCount)||0)+1;
      bucket.importRequests[idx]=req;
      const ledger=bucket.globalTradeLedger||{requests:[],decisions:[],settlements:[]};
      ledger.requests=[...(ledger.requests||[]),{requestId,status:req.status,attempt:req.attempt||1,simulationTurn:turn(),reason:req.rejectionReason}].slice(-MAX_HISTORY);
      bucket.globalTradeLedger=ledger;
      ctx.stateTransaction.set('trade',bucket);
      return{accepted:true,status:TYPES.REJECTED,request:req};
    }
    if(decision==='COUNTER'){
      const buyerFin=financial(c),market=marketPrice(c,req.resourceId),qty=num(response.quantityApproved)||num(req.quantity),price=num(response.unitPrice);
      const liquidity=buyerFin.liquidity;
      const need=clamp(req.needPressure??0.5);
      const mem=memoryInsight(c,req.targetCountryId);
      const memoryScore=mem.known?clamp(mem.acceptRate??0.5):0.5;
      const debtPressure=buyerFin.debtToGdp===null?0:clamp(buyerFin.debtToGdp/1.5);
      const diplomaticNeed=relScoreForBuyer(c,req.targetCountryId);
      const ceiling=market===null?price:market*(1.05+need*.10+memoryScore*.05-(debtPressure*.10)+(diplomaticNeed*.05));
      if(price===null||liquidity===null||qty===null){req.status='SENT';req.stage='COUNTER_OFFER_DATA_PENDING';bucket.importRequests[idx]=req;ctx.stateTransaction.set('trade',bucket);return{accepted:true,status:'WAITING_DATA'};}
      const total=qty*price;
      if(total<=liquidity&&price<=ceiling){
        req.quantity=qty;req.unitPrice=price;req.totalValue=total;req.status=TYPES.ACCEPTED;req.stage='COUNTER_OFFER_ACCEPTED';req.acceptedTurn=turn();
        bucket.importRequests[idx]=req;ctx.stateTransaction.set('trade',bucket);
        return{accepted:true,status:TYPES.ACCEPTED,request:req};
      }
      req.status=TYPES.REJECTED;req.stage='COUNTER_OFFER_DECLINED';req.rejectionReason='BUYER_COUNTER_OFFER_TOO_EXPENSIVE';req.refusalCount=(num(req.refusalCount)||0)+1;
      bucket.importRequests[idx]=req;ctx.stateTransaction.set('trade',bucket);
      return{accepted:true,status:TYPES.REJECTED,request:req};
    }
    if(decision==='ACCEPT'){
      const qty=num(response.quantityApproved)||num(req.quantity),price=num(response.unitPrice)||num(req.unitPrice);
      req.quantity=qty;req.unitPrice=price;req.totalValue=qty*price;req.status=TYPES.ACCEPTED;req.stage='COUNTERPARTY_ACCEPTED';req.acceptedTurn=turn();
      bucket.importRequests[idx]=req;ctx.stateTransaction.set('trade',bucket);
      return{accepted:true,status:TYPES.ACCEPTED,request:req};
    }
    return{accepted:false,reason:'UNKNOWN_TRADE_RESPONSE:'+decision};
  }

  function scheduleRetryHandler(cmd,ctx){
    const p=cmd?.payload||{},requestId=String(p.requestId||''),rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!Array.isArray(bucket.importRequests))bucket.importRequests=[];
    const idx=bucket.importRequests.findIndex(x=>String(x.requestId)===requestId);
    if(idx<0)return{accepted:false,reason:'TRADE_REQUEST_NOT_FOUND'};
    const row=clone(bucket.importRequests[idx]);
    if(String(row.status||'').toUpperCase()!=='REJECTED')return{accepted:false,reason:'TRADE_REQUEST_NOT_REJECTED'};
    const cooldown=num(p.cooldownTurns)??RETRY_COOLDOWN;
    row.nextRetryTurn=turn()+Math.max(1,cooldown);row.stage='PRESSURE_WAIT';
    row.refusalCount=num(p.refusalCount)??num(row.refusalCount)??1;
    bucket.importRequests[idx]=row;
    bucket.globalTradeLedger=bucket.globalTradeLedger||{requests:[],decisions:[],settlements:[]};
    bucket.globalTradeLedger.requests=[...(bucket.globalTradeLedger.requests||[]),{
      requestId,status:'RETRY_SCHEDULED',nextRetryTurn:row.nextRetryTurn,refusalCount:row.refusalCount,simulationTurn:turn()
    }].slice(-MAX_HISTORY);
    ctx.stateTransaction.set('trade',bucket);
    emit('OMEGA_TRADE_REQUEST_RETRY_SCHEDULED',ctx.countryId,{requestId,targetCountryId:row.targetCountryId,nextRetryTurn:row.nextRetryTurn,refusalCount:row.refusalCount},cmd.commandId);
    return{accepted:true,request:row,nextRetryTurn:row.nextRetryTurn};
  }

  function retryHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId);
    const rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!Array.isArray(bucket.importRequests))bucket.importRequests=[];
    if(!bucket.globalTradeLedger||typeof bucket.globalTradeLedger!=='object')bucket.globalTradeLedger={requests:[],decisions:[],settlements:[]};
    const previous=clone(p.previousRequest||null);
    if(!previous)return{accepted:false,reason:'PREVIOUS_REQUEST_REQUIRED'};
    const attempt=(num(previous.attempt)||1)+1;
    const retry={
      requestId:'IMP-RETRY-'+turn()+'-'+c+'-'+canonical(previous.targetCountryId)+'-'+attempt+'-'+String(previous.resourceId),
      countryId:c,targetCountryId:canonical(previous.targetCountryId),resourceId:String(previous.resourceId),
      quantity:num(previous.requestedQuantity)||num(previous.quantity),unitPrice:num(previous.unitPrice),
      totalValue:num(previous.totalValue)||null,currency:previous.currency||null,
      status:TYPES.SENT,stage:'POLITICAL_PRESSURE_RETRY',createdTurn:turn(),attempt,
      refusalCount:num(previous.refusalCount)||1,previousRequestId:String(previous.requestId),
      pressureLevel:num(p.pressureLevel)||1,needPressure:num(previous.needPressure)??0.5
    };
    bucket.importRequests=[...bucket.importRequests,retry].slice(-MAX_HISTORY);
    bucket.globalTradeLedger=bucket.globalTradeLedger||{requests:[],decisions:[],settlements:[]};
    bucket.globalTradeLedger.requests=[...(bucket.globalTradeLedger.requests||[]),{requestId:retry.requestId,status:'RETRY',attempt,previousRequestId:previous.requestId,simulationTurn:turn()}].slice(-MAX_HISTORY);
    ctx.stateTransaction.set('trade',bucket);
    emit('OMEGA_TRADE_REQUEST_RETRY_CREATED',c,retry);
    return{accepted:true,request:retry};
  }

  function findRequest(buyer,requestId){
    const arr=countryValue(buyer,'trade.importRequests');
    return Array.isArray(arr)?arr.find(x=>String(x.requestId)===String(requestId))||null:null;
  }
  function reserveExists(c,reservationId){
    const arr=countryValue(c,'cabinet.autonomyReservations');
    return Array.isArray(arr)&&arr.some(x=>String(x.reservationId)===String(reservationId)&&!['RELEASED','COMPLETED'].includes(String(x.status||'').toUpperCase()));
  }
  function sellerCanSettle(req){
    const inv=inventory(req.targetCountryId,req.resourceId),r=relation(req.countryId,req.targetCountryId),capacity=routeCapacity(req.countryId,req.resourceId);
    const q=num(req.quantity),buyerFin=financial(req.countryId),buyerInv=inventory(req.countryId,req.resourceId);
    const values=settlementValues(req.countryId,req.targetCountryId,q,req.unitPrice);
    const total=values.sellerValue;
    if(!r)return{ok:false,reason:'RELATION_NOT_OBSERVED'};
    if(sanctionsOrWar(r))return{ok:false,reason:'WAR_OR_SANCTIONS'};
    if(!agreement(r,req.countryId,req.targetCountryId))return{ok:false,reason:'TRADE_AGREEMENT_NOT_APPROVED'};
    if(capacity!==null&&capacity<=0)return{ok:false,reason:'ROUTE_UNAVAILABLE'};
    if(inv.stock===null)return{ok:false,reason:'SELLER_INVENTORY_NOT_OBSERVED'};
    const reserve=Math.max(0,inv.reserve||0);
    if(q===null||q<=0)return{ok:false,reason:'QUANTITY_NOT_OBSERVED'};
    if(inv.stock-reserve<q)return{ok:false,reason:'SELLER_FREE_STOCK_INSUFFICIENT'};
    if(values.fx===null||values.sellerValue===null||values.buyerValue===null)return{ok:false,reason:'SETTLEMENT_FX_OR_PRICE_NOT_OBSERVED'};
    if(buyerFin.liquidity===null)return{ok:false,reason:'BUYER_LIQUIDITY_NOT_OBSERVED'};
    if(buyerFin.liquidity<values.buyerValue)return{ok:false,reason:'BUYER_LIQUIDITY_INSUFFICIENT'};
    if(buyerInv.stock===null)return{ok:false,reason:'BUYER_RESOURCE_INVENTORY_NOT_OBSERVED'};
    return{ok:true,total:values.sellerValue,buyerTotal:values.buyerValue,sellerTotal:values.sellerValue,price:num(req.unitPrice),fx:values.fx,buyerCurrency:values.buyerCurrency,sellerCurrency:values.sellerCurrency};
  }

  function financeDebitHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'FINANCE_AMOUNT_INVALID'};
    const available=num(ctx.stateTransaction.get('finance.available')),reserves=num(ctx.stateTransaction.get('finance.reserves'));
    const base=available??reserves;
    if(base===null)return{accepted:false,reason:'FINANCE_LIQUIDITY_NOT_OBSERVED'};
    if(base<amount)return{accepted:false,reason:'FINANCE_LIQUIDITY_INSUFFICIENT'};
    if(available!==null)ctx.stateTransaction.set('finance.available',available-amount);
    else ctx.stateTransaction.set('finance.reserves',reserves-amount);
    const hist=ctx.stateTransaction.get('finance.tradeSettlementHistory');
    const arr=Array.isArray(hist)?hist:[];
    ctx.stateTransaction.set('finance.tradeSettlementHistory',arr.concat([{settlementId:p.settlementId,type:'DEBIT',amount,turn:turn(),countryId:ctx.countryId}]).slice(-MAX_HISTORY));
    return{accepted:true,amount};
  }
  function financeCreditHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'FINANCE_AMOUNT_INVALID'};
    const available=num(ctx.stateTransaction.get('finance.available'));
    if(available===null)return{accepted:false,reason:'FINANCE_LIQUIDITY_NOT_OBSERVED'};
    ctx.stateTransaction.set('finance.available',available+amount);
    const hist=ctx.stateTransaction.get('finance.tradeSettlementHistory');
    const arr=Array.isArray(hist)?hist:[];
    ctx.stateTransaction.set('finance.tradeSettlementHistory',arr.concat([{settlementId:p.settlementId,type:'CREDIT',amount,turn:turn(),countryId:ctx.countryId}]).slice(-MAX_HISTORY));
    return{accepted:true,amount};
  }
  function resourceDebitHandler(cmd,ctx){
    const p=cmd?.payload||{},rid=String(p.resourceId||''),q=num(p.quantity),inv=ctx.stateTransaction.get('resource.inventory');
    if(!rid||q===null||q<=0)return{accepted:false,reason:'RESOURCE_SETTLEMENT_INPUT_INVALID'};
    if(!inv||typeof inv!=='object')return{accepted:false,reason:'RESOURCE_INVENTORY_NOT_OBSERVED'};
    const k=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(x=>token(x)===token(rid));
    if(!k)return{accepted:false,reason:'RESOURCE_NOT_OBSERVED'};
    const stock=num(inv[k]);if(stock===null||stock<q)return{accepted:false,reason:'RESOURCE_STOCK_INSUFFICIENT'};
    const next=clone(inv);next[k]=stock-q;ctx.stateTransaction.set('resource.inventory',next);
    return{accepted:true,resourceId:rid,quantity:q};
  }
  function resourceCreditHandler(cmd,ctx){
    const p=cmd?.payload||{},rid=String(p.resourceId||''),q=num(p.quantity),inv=ctx.stateTransaction.get('resource.inventory');
    if(!rid||q===null||q<=0)return{accepted:false,reason:'RESOURCE_SETTLEMENT_INPUT_INVALID'};
    if(!inv||typeof inv!=='object')return{accepted:false,reason:'RESOURCE_INVENTORY_NOT_OBSERVED'};
    const k=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(x=>token(x)===token(rid))||rid;
    const current=num(inv[k])??0,next=clone(inv);next[k]=current+q;ctx.stateTransaction.set('resource.inventory',next);
    return{accepted:true,resourceId:rid,quantity:q};
  }
  function closeRequestHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId);
    const rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!Array.isArray(bucket.importRequests))bucket.importRequests=[];
    if(!bucket.globalTradeLedger||typeof bucket.globalTradeLedger!=='object')bucket.globalTradeLedger={requests:[],decisions:[],settlements:[]};
    const idx=bucket.importRequests.findIndex(x=>String(x.requestId)===String(p.requestId));
    if(idx<0)return{accepted:false,reason:'TRADE_REQUEST_NOT_FOUND'};
    const req=clone(bucket.importRequests[idx]);req.status=p.status||TYPES.SETTLED;req.stage=p.stage||'SETTLED';req.settlementId=p.settlementId||null;req.settledTurn=p.status===TYPES.SETTLED?turn():null;
    bucket.importRequests[idx]=req;
    bucket.globalTradeLedger=bucket.globalTradeLedger||{requests:[],decisions:[],settlements:[]};
    bucket.globalTradeLedger.settlements=[...(bucket.globalTradeLedger.settlements||[]),{settlementId:p.settlementId,requestId:p.requestId,status:req.status,turn:turn(),quantity:req.quantity,unitPrice:req.unitPrice,supplier:req.targetCountryId}].slice(-MAX_HISTORY);
    ctx.stateTransaction.set('trade',bucket);
    return{accepted:true,request:req};
  }
  function sellerLedgerHandler(cmd,ctx){
    const p=cmd?.payload||{};
    const rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!bucket.globalTradeLedger||typeof bucket.globalTradeLedger!=='object')bucket.globalTradeLedger={requests:[],decisions:[],settlements:[]};
    bucket.globalTradeLedger.settlements=[...(bucket.globalTradeLedger.settlements||[]),clone(p)].slice(-MAX_HISTORY);
    ctx.stateTransaction.set('trade',bucket);
    return{accepted:true,settlementId:p.settlementId};
  }
  function relationPressureHandler(cmd,ctx){
    const p=cmd?.payload||{},target=canonical(p.targetCountryId);
    if(!target)return{accepted:false,reason:'PRESSURE_TARGET_REQUIRED'};
    const existing=ctx.stateTransaction.get('foreign.relationAdjustments');
    const next=existing&&typeof existing==='object'?clone(existing):{};
    const list=Array.isArray(next[target])?next[target].slice():[];
    list.push({source:'TRADE_PRESSURE',type:'POLITICAL_PRESSURE',delta:num(p.delta)??-1,turn:turn(),requestId:p.requestId||null,reason:p.reason||'TRADE_REFUSAL'});
    next[target]=list.slice(-64);
    ctx.stateTransaction.set('foreign.relationAdjustments',next);
    emit('OMEGA_TRADE_DIPLOMATIC_RELATION_ADJUSTED',ctx.countryId,{targetCountryId:target,delta:num(p.delta)??-1,requestId:p.requestId||null});
    return{accepted:true,targetCountryId:target,delta:num(p.delta)??-1};
  }
  function militaryPressureHandler(cmd,ctx){
    const p=cmd?.payload||{},target=canonical(p.targetCountryId);
    if(!target)return{accepted:false,reason:'PRESSURE_TARGET_REQUIRED'};
    const stateNow=ctx.stateTransaction.get('military');
    const existing=stateNow&&typeof stateNow==='object'?clone(stateNow):{};
    const posture=existing.tradePressurePosture&&typeof existing.tradePressurePosture==='object'?existing.tradePressurePosture:{};
    const current=posture[target]&&typeof posture[target]==='object'?posture[target]:{targetCountryId:target,level:0};
    const force=ctx.stateTransaction.get('military.forceStructure');
    const readiness=num(ctx.stateTransaction.get('military.readiness'));
    if(!force&&readiness===null&&Object.keys(current).length===0)return{accepted:false,reason:'MILITARY_CAPABILITY_NOT_OBSERVED'};
    posture[target]={targetCountryId:target,level:(num(current.level)||0)+(num(p.level)||1),posture:'INCREASED_TRADE_PRESSURE',requestedTurn:turn(),requestId:p.requestId||null,readinessObserved:readiness};
    existing.tradePressurePosture=posture;
    ctx.stateTransaction.set('military',existing);
    emit('OMEGA_TRADE_MILITARY_PRESSURE_APPLIED',ctx.countryId,{targetCountryId:target,level:posture[target].level,requestId:p.requestId||null});
    return{accepted:true,targetCountryId:target,level:posture[target].level};
  }

  function installHandlers(){
    const mesh=interop();if(!mesh?.registerCommandHandler)return false;
    const defs=[
      ['OMEGA_TRADE_COUNTERPARTY_REVIEW','trade',reviewHandler],
      ['OMEGA_TRADE_APPLY_BUYER_RESPONSE','trade',buyerResponseHandler],
      ['OMEGA_TRADE_SCHEDULE_RETRY','trade',scheduleRetryHandler],
      ['OMEGA_TRADE_CREATE_RETRY','trade',retryHandler],
      ['OMEGA_TRADE_FINANCE_DEBIT','finance',financeDebitHandler],
      ['OMEGA_TRADE_FINANCE_CREDIT','finance',financeCreditHandler],
      ['OMEGA_TRADE_RESOURCE_DEBIT','resource',resourceDebitHandler],
      ['OMEGA_TRADE_RESOURCE_CREDIT','resource',resourceCreditHandler],
      ['OMEGA_TRADE_CLOSE_REQUEST','trade',closeRequestHandler],
      ['OMEGA_TRADE_RECORD_SELLER_SETTLEMENT','trade',sellerLedgerHandler],
      ['OMEGA_TRADE_APPLY_POLITICAL_PRESSURE','foreign',relationPressureHandler],
      ['OMEGA_TRADE_APPLY_MILITARY_PRESSURE','military',militaryPressureHandler]
    ];
    try{
      for(const [type,owner,handler] of defs){
        mesh.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_GLOBAL_TRADE'});
        mesh.registerCommandHandler(type,owner,handler);
      }
      return true;
    }catch(_){return false;}
  }

  function processRequest(req){
    const buyer=canonical(req.countryId),seller=canonical(req.targetCountryId);
    if(!buyer||!seller||buyer===seller)return;
    const status=String(req.status||'').toUpperCase(),stage=String(req.stage||'').toUpperCase();
    if(status==='REJECTED'&&num(req.nextRetryTurn)!==null&&turn()>=num(req.nextRetryTurn)){
      command('trade','OMEGA_TRADE_CREATE_RETRY',buyer,{previousRequest:clone(req),pressureLevel:num(req.refusalCount)||1});
      return;
    }
    if(status==='SENT'&&(/PENDING|OPEN|RETRY|PRESSURE/.test(stage)||stage==='COUNTERPARTY_DATA_PENDING')){
      const result=command('trade','OMEGA_TRADE_COUNTERPARTY_REVIEW',seller,{request:req});
      if(result?.status==='APPLIED'){
        const d=result.result?.tradeDecision||result.tradeDecision;
        if(d?.decision==='WAITING_DATA')return;
        const response=command('trade','OMEGA_TRADE_APPLY_BUYER_RESPONSE',buyer,{requestId:req.requestId,response:d});
        if(response?.status==='APPLIED'){
          const next=response.result?.request;
          if(String(next?.status||'').toUpperCase()==='ACCEPTED')settleRequest(next);
          if(String(next?.status||'').toUpperCase()==='REJECTED'&&d?.decision==='REJECT')handleRejection(next,d);
        }
      }
      return;
    }
    if(status==='ACCEPTED')settleRequest(req);
  }

  function settleRequest(req){
    const c=canonical(req.countryId),s=canonical(req.targetCountryId);
    if(!c||!s)return;
    const check=sellerCanSettle(req);
    if(!check.ok){command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:req.requestId,status:TYPES.FAILED,stage:'SETTLEMENT_BLOCKED',reason:check.reason});emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,reason:check.reason,targetCountryId:s});return;}
    const sid='SET-'+turn()+'-'+c+'-'+s+'-'+String(req.requestId);
    const debit=command('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{amount:check.buyerTotal,settlementId:sid,requestId:req.requestId,currency:check.buyerCurrency});
    if(debit?.status!=='APPLIED'){emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,reason:debit?.result?.reason||'BUYER_FINANCE_DEBIT_FAILED'});return;}
    const sellerCredit=command('finance','OMEGA_TRADE_FINANCE_CREDIT',s,{amount:check.sellerTotal,settlementId:sid,requestId:req.requestId,currency:check.sellerCurrency});
    const sellerResource=command('resource','OMEGA_TRADE_RESOURCE_DEBIT',s,{resourceId:req.resourceId,quantity:req.quantity,settlementId:sid,requestId:req.requestId});
    const buyerResource=command('resource','OMEGA_TRADE_RESOURCE_CREDIT',c,{resourceId:req.resourceId,quantity:req.quantity,settlementId:sid,requestId:req.requestId});
    if(sellerCredit?.status!=='APPLIED'||sellerResource?.status!=='APPLIED'||buyerResource?.status!=='APPLIED'){
      if(sellerCredit?.status==='APPLIED')command('finance','OMEGA_TRADE_FINANCE_DEBIT',s,{amount:check.sellerTotal,settlementId:sid+'-COMP-SELLER-FIN',requestId:req.requestId,currency:check.sellerCurrency});
      if(sellerResource?.status==='APPLIED')command('resource','OMEGA_TRADE_RESOURCE_CREDIT',s,{resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-SELLER-RES',requestId:req.requestId});
      if(buyerResource?.status==='APPLIED')command('resource','OMEGA_TRADE_RESOURCE_DEBIT',c,{resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId});
      if(debit?.status==='APPLIED')command('finance','OMEGA_TRADE_FINANCE_CREDIT',c,{amount:check.buyerTotal,settlementId:sid+'-COMP-BUYER-FIN',requestId:req.requestId,currency:check.buyerCurrency});
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,reason:'MULTI_LEDGER_COMMIT_FAILED',compensated:true});
      return;
    }
    command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:req.requestId,status:TYPES.SETTLED,stage:'SETTLED',settlementId:sid});
    command('trade','OMEGA_TRADE_RECORD_SELLER_SETTLEMENT',s,{settlementId:sid,requestId:req.requestId,buyerCountryId:c,resourceId:req.resourceId,quantity:req.quantity,unitPrice:req.unitPrice,totalValue:check.sellerTotal,buyerValue:check.buyerTotal,fx:check.fx,buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,status:'SETTLED',turn:turn()});
    const reservationId=req.reservationId;
    if(reservationId)command('cabinet','OMEGA_AUTO_RELEASE_RESERVATION',c,{reservationId,correlationId:req.requestId});
    emit('OMEGA_TRADE_SHIPMENT_CREATED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,resourceId:req.resourceId,quantity:req.quantity});
    emit('OMEGA_TRADE_SETTLEMENT_COMPLETED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,resourceId:req.resourceId,quantity:req.quantity,totalValue:check.sellerTotal,buyerValue:check.buyerTotal,fx:check.fx,buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency});
    try{memory()?.record?.(c,{type:'RELATIONAL',sourceEvent:'OMEGA_TRADE_SETTLEMENT_COMPLETED',targetCountryId:s,action:'IMPORT',outcome:{status:'SETTLED'},importance:.9,confidence:.9,evidence:{settlementId:sid}});}catch(_){}
  }

  function handleRejection(req,decision){
    const c=canonical(req.countryId),s=canonical(req.targetCountryId);
    const refusal=(num(req.refusalCount)||1);
    if(req.reservationId)command('cabinet','OMEGA_AUTO_RELEASE_RESERVATION',c,{reservationId:req.reservationId,correlationId:req.requestId});
    if(relation(c,s)){
      command('foreign','OMEGA_TRADE_APPLY_POLITICAL_PRESSURE',c,{targetCountryId:s,requestId:req.requestId,delta:-1,reason:decision?.reason||'TRADE_REFUSAL'});
      command('foreign','OMEGA_TRADE_APPLY_POLITICAL_PRESSURE',s,{targetCountryId:c,requestId:req.requestId,delta:-0.5,reason:'COUNTERPARTY_REFUSAL_OBSERVED'});
      const militaryLevel=refusal>=MILITARY_ESCALATION_AFTER?1:0;
      if(militaryLevel)command('military','OMEGA_TRADE_APPLY_MILITARY_PRESSURE',c,{targetCountryId:s,requestId:req.requestId,level:militaryLevel});
      emit('OMEGA_TRADE_PRESSURE_APPLIED',c,{targetCountryId:s,requestId:req.requestId,refusalCount:refusal,politicalPressureDelta:-1,militaryPressureLevel:militaryLevel,reason:decision?.reason||'TRADE_REFUSAL'});
    }
    if(refusal>=8)return;
    try{memory()?.record?.(c,{type:'RELATIONAL',sourceEvent:'OMEGA_TRADE_REQUEST_REJECTED',targetCountryId:s,action:'IMPORT',outcome:{status:'REJECTED',reason:decision?.reason||null},importance:.8,confidence:.9});}catch(_){}
    command('trade','OMEGA_TRADE_SCHEDULE_RETRY',c,{requestId:req.requestId,cooldownTurns:RETRY_COOLDOWN,refusalCount:refusal});
  }

  function onTurn(){processAll();}
  function processAll(){
    if(g.__omegaGlobalTradeProcessing)return;
    g.__omegaGlobalTradeProcessing=true;
    try{
      const seen=new Set();
      for(const c of ids()){
        const reqs=countryValue(c,'trade.importRequests');
        if(!Array.isArray(reqs))continue;
        for(const req of reqs.slice(-MAX_HISTORY)){
          const key=String(c)+'::'+String(req.requestId);
          if(seen.has(key))continue;seen.add(key);
          processRequest(req);
        }
      }
    }finally{g.__omegaGlobalTradeProcessing=false;}
  }

  function diagnostics(){
    let requests=0,pending=0,settled=0;
    for(const c of ids()){
      const arr=countryValue(c,'trade.importRequests');if(!Array.isArray(arr))continue;
      requests+=arr.length;
      for(const r of arr){const s=String(r.status||'').toUpperCase();if(s==='SETTLED')settled++;if(['SENT','ACCEPTED'].includes(s))pending++;}
    }
    return{version:VERSION,handlerInstalled:true,eventHooksInstalled:!!g.__omegaGlobalTradeTurnHook,worldCountryCount:ids().length,requests,pending,settled,settlementModel:'CROSS_MINISTRY_TWO_PHASE_COMPENSATING_LEDGER'};
  }
  function init(){
    installHandlers();
    if(!g.__omegaGlobalTradeTurnHook){
      g.__omegaGlobalTradeTurnHook=true;
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
      g.addEventListener?.('OMEGA_READY',()=>{installHandlers();});
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',()=>{installHandlers();});
    }
    return diagnostics();
  }
  const API=Object.freeze({VERSION,TYPES,diagnostics,processAll,reviewRequest:sellerReviewDecision,relationScore,marketPrice,inventory,currencyOf,fxRate,settlementValues});
  g.Omega=g.Omega||{};g.Omega.GlobalTrade=API;g.OmegaGlobalTrade=API;
  try{init();}catch(e){g.OmegaGlobalTradeError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
