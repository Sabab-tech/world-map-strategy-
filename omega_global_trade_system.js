/* OMEGA GLOBAL TRADE AUTONOMY SYSTEM v1.1.0
 * One deterministic world trade coordinator. Every country uses the same pipeline:
 * request -> counterparty review -> negotiation -> pressure/retry -> settlement.
 * Cross-country writes are split into owner-ministry transactions.
 */
(function(g){
  'use strict';
  const VERSION='1.2.0';
  const MAX_HISTORY=256, RETRY_COOLDOWN=2, MILITARY_ESCALATION_AFTER=3;
  const MAX_AUTONOMOUS_REQUESTS_PER_COUNTRY_PER_TURN=24;
  let unregisterSchedulerHandler=null;
  const scheduledCountryTurns=new Map();
  let handlerInstallReport={ready:false,registered:0,total:0,actionRegistrationWarnings:[],errors:[]};
  let worldActivityCache=null;
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
  const canonical=v=>{const raw=String(v??'').trim();if(/^[A-Z]{3}$/i.test(raw))return id(raw);try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const memory=()=>g.OmegaOpponentDeepMemory||g.Omega?.OpponentDeepMemory||null;

  function ids(){
    const out=new Set();
    try{
      const b=registry();
      const a=b?.list?.('COUNTRY')||b?.list?.()||[];
      for(const x of a){
        const raw=x&&typeof x==='object'?(x.iso3||x.iso3Code||x.countryCode||x.country_id||x.id||x.canonicalId||x.code||x):x;
        const v=canonical(raw);
        if(v)out.add(v);
      }
    }catch(_){}
    const s=state()||{};
    for(const domain of ['trade','resource','finance','foreign','economy']){
      const section=s[domain];
      if(section&&typeof section==='object'){
        for(const key of Object.keys(section)){
          const v=canonical(key);
          if(v)out.add(v);
        }
      }
    }
    return [...out].filter(Boolean).sort();
  }
  function read(root,path){
    let cur=root;
    for(const p of String(path||'').split('.')){
      if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),p))return undefined;
      cur=cur[p];
    }
    return cur;
  }
  function countryEntry(map,countryId){
    if(!map||typeof map!=='object')return undefined;
    const cid=canonical(countryId);
    if(Object.prototype.hasOwnProperty.call(map,cid))return map[cid];
    const key=Object.keys(map).find(k=>id(k)===cid||canonical(k)===cid);
    return key===undefined?undefined:map[key];
  }
  function countryValue(c,path){
    const s=state(),cid=canonical(c),parts=String(path||'').split('.'),domain=parts.shift();
    const bucket=countryEntry(s?.[domain],cid);
    return read(bucket,parts.join('.'));
  }
  function privateCompanyStatus(country,company){
    const statuses=countryValue(country,'economy.privateEnterpriseLifecycle.companyStatuses');
    return String(statuses&&statuses[String(company||'').trim().toUpperCase()]||'ACTIVE').toUpperCase();
  }
  function relation(buyer,seller){
    const a=canonical(buyer),b=canonical(seller);
    const candidates=[
      countryEntry(countryValue(a,'foreign.relations'),b),
      countryEntry(countryValue(a,'trade.relations'),b),
      countryEntry(countryValue(a,'relations'),b),
      countryEntry(countryValue(b,'foreign.relations'),a),
      countryEntry(countryValue(b,'trade.relations'),a),
      countryEntry(countryValue(b,'relations'),a)
    ].filter(x=>x!==undefined&&x!==null);
    const base=clone(candidates[0]||null);
    if(!base)return null;
    const adjustments=countryEntry(countryValue(a,'foreign.relationAdjustments'),b);
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
    return clamp(score);
  }
  function agreement(r,buyer,seller){
    if(r?.trade_agreement===true)return true;
    const t=countryEntry(countryValue(buyer,'foreign.treaties'),seller);
    return !!t && /SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(String(t.status||t.stage||'').toUpperCase());
  }
  function sanctionsOrWar(r){return r?.war_state===true||r?.sanctions===true;}
  function blackMarketDealFor(request){const dealId=String(request?.blackMarketDealId||'').trim();if(!dealId)return null;
    try{return(g.OmegaBlackMarket||g.Omega?.BlackMarket)?.getAuthorizedDeal?.(dealId,request)||null;}catch(_){return null;}}
  function blackMarketMayReleaseExport(deal,reason){return !!deal&&deal.allowExportRestrictionBypass&&
    ['STATE_DIRECTIVE_DOMESTIC_ONLY','STATE_DIRECTIVE_EXPORT_RESTRICTED'].includes(String(reason||''));}
  function applyFinancialProducerCost(country, resource, quote) {
    const price = num(quote);
    if (price === null || price < 0) return null;
    const engine = g.OmegaEconomicTransmissionRuntime || g.Omega && g.Omega.EconomicTransmission;
    try {
      const multiplier = num(engine && engine.getProducerCostMultiplier && engine.getProducerCostMultiplier(canonical(country)));
      if (multiplier !== null && multiplier > 0)
        return price * clamp(multiplier, 0.5, 3);
    } catch (_) {}
    return price;
  }
  function marketPrice(country,resource){
    const rid=String(resource||'').trim();
    try{
      const market=g.OmegaGlobalMarket||g.Omega?.GlobalMarket;
      const local=market?.localPrice?.(canonical(country),rid);
      if(num(local)!==null&&local>=0)return applyFinancialProducerCost(country,rid,local);
    }catch(_){}
    const paths=[
      'trade.marketPrice.'+rid,'trade.marketPrices.'+rid,
      'trade.offerBook.'+rid+'.unitPrice','trade.offerBook.'+rid+'.price',
      'trade.offers.'+rid+'.unitPrice','trade.offers.'+rid+'.price'
    ];
    for(const p of paths){const x=num(countryValue(country,p));if(x!==null&&x>=0)return applyFinancialProducerCost(country,rid,x);}
    try{
      const x=g.ResourceMinistryEngine?.getIntegratedResourceState?.(canonical(country));
      const m=x?.marketPrices||x?.priceBook||x?.supplierPrices;
      const n=num(m?.[rid]??m?.[String(rid).toLowerCase()]);
      if(n!==null&&n>=0)return applyFinancialProducerCost(country,rid,n);
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
  function privateCompanyAvailableStock(country,resourceId,companyId){
    const c=canonical(country),co=String(companyId||'').trim().toUpperCase(),rid=String(resourceId||'').trim(),
      rs=countryEntry(state()?.resource,c)||null,rows=Array.isArray(rs?.batches)?rs.batches:[],
      lots=rs?.inventoryLots&&typeof rs.inventoryLots==='object'?rs.inventoryLots:{},
      shipments=Array.isArray(rs?.industrialNetwork?.shipments)?rs.industrialNetwork.shipments:[],
      batchReservations=Array.isArray(rs?.industrialNetwork?.batchReservations)?rs.industrialNetwork.batchReservations:[],
      nonCentral=new Set(['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY','SOLD','TRANSFERRED_OUT','DEPLETED']),
      inTransit=new Map(),
      batchLocked=new Map();
    if(!c||!rid||!co||!rows.length)return{status:'UNOBSERVED',available:null,sourceBatchIds:[]};
    shipments.forEach(row=>{
      if(!row||String(row.status||'').toUpperCase()!=='IN_TRANSIT'||!row.batchId||
         token(row.resourceId)!==token(rid))return;
      const key=String(row.batchId);
      inTransit.set(key,(inTransit.get(key)||0)+Math.max(0,num(row.quantity)||0));
    });
    let totalBatchReserved=0;
    batchReservations.forEach(row=>{
      if(!row||!['ACTIVE','RESERVED','LOCKED'].includes(String(row.status||'').toUpperCase())||!row.batchId)return;
      if(row.resourceId&&token(row.resourceId)!==token(rid))return;
      const key=String(row.batchId),qLock=Math.max(0,num(row.quantity)||0);
      if(qLock<=1e-9)return;
      batchLocked.set(key,(batchLocked.get(key)||0)+qLock);
      totalBatchReserved+=qLock;
    });
    let tracked=0;const sourceBatchIds=[];
    rows.forEach(batch=>{
      if(!batch||token(batch.resourceId||batch.materialIdentity)!==token(rid)||
         String(batch.ownerCompanyId||batch.ownerId||'').trim().toUpperCase()!==co||
         ['NOT_RECORDED','OWNER_NOT_RECORDED','UNASSIGNED','UNKNOWN_SOURCE','LEGACY_COMPANY_ATTRIBUTION_ROLE_UNCLASSIFIED'].includes(String(batch.ownerAttributionStatus||'').toUpperCase())||
         nonCentral.has(String(batch.stage||'').toUpperCase())||
         ['SOLD','CONSUMED','TRANSFERRED','DEPLETED'].includes(String(batch.status||'').toUpperCase()))return;
      const id=String(batch.batchId||''),lot=lots[id];
      let qty=Math.max(0,num(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity)||0);
      if(lot){
        if(['SOLD','CONSUMED','TRANSFERRED','DEPLETED'].includes(String(lot.status||'').toUpperCase()))return;
        qty=Math.min(qty,Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0));
      }
      qty=Math.max(0,qty-(inTransit.get(id)||0)-(batchLocked.get(id)||0));
      if(qty<=1e-9)return;
      tracked+=qty;sourceBatchIds.push(id);
    });
    const raw=rs.warehouse||{},processed=rs.processedWarehouse||{},
      free=(book,reserved)=>{
        const key=Object.keys(book||{}).find(x=>token(x)===token(rid));
        if(!key)return null;
        return Math.max(0,(num(book[key])||0)-(num(reserved?.[key])||num(reserved?.[rid])||0));
      };
    const rawFree=free(raw.availableByResource,raw.reservedByResource),
      processedFree=free(processed.availableByResource,processed.reservedByResource),
      warehouseObserved=rawFree!==null||processedFree!==null;
    if(!warehouseObserved)return{status:'UNOBSERVED_WAREHOUSE',available:null,trackedBatchQuantity:tracked,sourceBatchIds:sourceBatchIds};
    const warehouseFree=Math.max(0,(rawFree||0)+(processedFree||0)-totalBatchReserved);
    return{status:'AVAILABLE',available:Number(Math.min(tracked,warehouseFree).toFixed(6)),
      trackedBatchQuantity:Number(tracked.toFixed(6)),warehouseAvailable:Number(warehouseFree.toFixed(6)),
      reservedBatchQuantity:Number(totalBatchReserved.toFixed(6)),
      sourceBatchIds:sourceBatchIds,countryId:c,resourceId:rid,companyId:co,
      authority:'EXACT_PRIVATE_OWNER_BATCHES_AND_WAREHOUSE_BALANCE'};
  }
  function routeCapacity(buyer,resource){
    const rid=String(resource||'');
    const paths=['trade.routeCapacity.'+rid,'trade.routeCapacity','transport.tradeRouteCapacity.'+rid,'transport.tradeRouteCapacity'];
    for(const p of paths){const x=countryValue(buyer,p);const n=num(x);if(n!==null)return n;}
    return null;
  }
  function currencyOf(country){
    const observed=String(
      countryValue(country,'trade.settlementCurrency')||
      countryValue(country,'finance.currencyCode')||
      countryValue(country,'economy.currency_code')||
      countryValue(country,'economy.currencyCode')||
      ''
    ).trim().toUpperCase();
    if(observed)return observed;

    // Country currency identity is owned by the canonical Finance/Forex profile
    // registry. Older state snapshots do not necessarily materialize currencyCode
    // into each country's finance/economy bucket, so resolve that authoritative
    // profile before declaring the currency unavailable.
    const monetary=g.OmegaForexMonetaryEngine||g.Omega&&g.Omega.ForexMonetaryEngine;
    if(!monetary||typeof monetary.getProfiles!=='function'||typeof monetary.getCurrencyCode!=='function')
      return null;
    const target=canonical(country);
    if(!target)return null;
    let profiles=[];
    try{profiles=monetary.getProfiles()||[];}catch(_){return null;}
    const profile=profiles.find(row=>
      [row?.iso3,row?.countryCode,row?.code,row?.iso2]
        .some(value=>value&&canonical(value)===target));
    if(!profile)return null;
    try{return String(monetary.getCurrencyCode(profile)||'').trim().toUpperCase()||null;}
    catch(_){return null;}
  }
  function fxRate(buyer,seller){
    const bc=currencyOf(buyer),sc=currencyOf(seller);
    if(!bc||!sc)return null;
    if(bc===sc)return 1;
    const monetary=g.OmegaForexMonetaryEngine||g.Omega&&g.Omega.ForexMonetaryEngine;
    if(monetary&&typeof monetary.getRate==='function'){
      const buyerLocalPerUsd=num(monetary.getRate(bc,'SIMULATION'));
      const sellerLocalPerUsd=num(monetary.getRate(sc,'SIMULATION'));
      if(buyerLocalPerUsd!==null&&sellerLocalPerUsd!==null&&buyerLocalPerUsd>0&&sellerLocalPerUsd>0)
        return buyerLocalPerUsd/sellerLocalPerUsd;
    }
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
    if(!Array.isArray(root[c].importLedger))root[c].importLedger=[];
    if(!Array.isArray(root[c].exportLedger))root[c].exportLedger=[];
    if(!root[c].globalTradeLedger||typeof root[c].globalTradeLedger!=='object')root[c].globalTradeLedger={requests:[],decisions:[],settlements:[]};
    return root[c];
  }


    function stockFlowSnapshot(resource, factoryAssets) {
    resource = resource && typeof resource === 'object' ? resource : {};
    const inventory = resource.inventory && typeof resource.inventory === 'object' && !Array.isArray(resource.inventory) ? resource.inventory : null;
    const units = resource.inventoryUnits && typeof resource.inventoryUnits === 'object' ? resource.inventoryUnits : {};
    const batches = Array.isArray(resource.batches) ? resource.batches : [];
    const byIdentity = new Map(), batchTotals = new Map();
    let complete = !!inventory;
    const normalizeKey = value => token(value);
    const unitFor = rid => {
      const keys=Object.keys(units).filter(key=>normalizeKey(key)===normalizeKey(rid));
      const observed=keys.map(key=>String(units[key]||'').trim()).filter(Boolean);
      if(new Set(observed).size===1)return observed[0];
      const candidates=[...new Set(batches.filter(row=>normalizeKey(row&&(row.resourceId||row.materialIdentity))===normalizeKey(rid))
        .map(row=>String(row&&row.unit||'').trim()).filter(Boolean))];
      return candidates.length===1?candidates[0]:null;
    };
    const add=(rid,unit,quantity)=>{
      const name=String(rid||'').trim(),q=num(quantity),u=String(unit||'').trim();
      if(!name||q===null||q<0){complete=false;return;}
      if(!u){if(q>1e-9)complete=false;return;}
      const key=name+'\\u0000'+u,row=byIdentity.get(key)||{resourceId:name,unit:u,quantity:0};
      row.quantity+=q;byIdentity.set(key,row);
    };
    const inactive=new Set(['CONSUMED','SOLD','TRANSFERRED_OUT','EXHAUSTED','DECOMMISSIONED']);
    for(const batch of batches){
      if(inactive.has(String(batch&&batch.status||'').toUpperCase()))continue;
      const rid=String(batch&&(batch.resourceId||batch.materialIdentity)||'').trim();
      const q=num(batch&&(batch.remainingQuantity!=null?batch.remainingQuantity:batch.quantity));
      if(!rid||q===null||q<0){complete=false;continue;}
      if(q<=1e-9)continue;
      const key=normalizeKey(rid);batchTotals.set(key,(batchTotals.get(key)||0)+q);
      add(rid,batch.unit,q);
    }
    if(inventory){
      const seen=new Set();
      for(const key of Object.keys(inventory)){
        const q=num(inventory[key]),normalized=normalizeKey(key);
        if(!normalized||q===null||q<0){complete=false;continue;}
        if(seen.has(normalized))complete=false;seen.add(normalized);
        const tracked=batchTotals.get(normalized)||0;
        if(tracked>1e-9){if(q>tracked+1e-6)complete=false;continue;}
        add(key,unitFor(key),q);
      }
    }
    for(const asset of Array.isArray(factoryAssets)?factoryAssets:[]){
      const stock=asset&&asset.inputInventory&&typeof asset.inputInventory==='object'?asset.inputInventory:{};
      const lots=Array.isArray(asset&&asset.inputBatchLots)?asset.inputBatchLots:[];
      for(const rid of Object.keys(stock)){
        const total=num(stock[rid]);if(total===null||total<0){complete=false;continue;}
        const activeLots=lots.filter(lot=>normalizeKey(lot&&(lot.resourceId||lot.materialIdentity))===normalizeKey(rid)&&
          !inactive.has(String(lot&&lot.status||'').toUpperCase())&&
          !['IN_TRANSIT','RESERVED'].includes(String(lot&&lot.status||'').toUpperCase()));
        const grouped=new Map();let lotTotal=0,bad=false;
        for(const lot of activeLots){const q=num(lot&&(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)),unit=String(lot&&lot.unit||'').trim();
          if(q===null||q<0||!unit){bad=true;continue;}lotTotal+=q;grouped.set(unit,(grouped.get(unit)||0)+q);}
        if(!bad&&Math.abs(lotTotal-total)<=1e-6){for(const [unit,q] of grouped)add(rid,unit,q);}
        else if(total>1e-9){complete=false;add(rid,null,total);}
      }
    }
    return{complete,identities:[...byIdentity.values()].sort((a,b)=>a.resourceId.localeCompare(b.resourceId)||a.unit.localeCompare(b.unit))};
  }
function captureStockFlowPeriod(stateTransaction) {
    const t=turn(),periodId='GAME_TURN_'+String(t);
    const old=stateTransaction.get('resource.stockFlowPeriods');
    if(Array.isArray(old)&&old.some(row=>String(row&&row.periodId||'')===periodId))
      return{status:'ALREADY_CAPTURED',periodId};
    const resource={inventory:stateTransaction.get('resource.inventory'),inventoryUnits:stateTransaction.get('resource.inventoryUnits'),
      batches:stateTransaction.get('resource.batches')};
    const assets=stateTransaction.get('economy.productionAssets')||[],snapshot=stockFlowSnapshot(resource,assets);
    const periods=Array.isArray(old)?old.map(row=>clone(row)):[];
    const previous=periods.length?periods[periods.length-1]:null;
    if(previous&&Number(previous.turn)<t){
      if(Number(previous.turn)===t-1){previous.closingStockByIdentity=clone(snapshot.identities);
        previous.closingCoverageComplete=snapshot.complete;previous.closingCaptured=true;
        previous.closingCaptureSource='NEXT_TURN_PRE_MOVEMENT_SNAPSHOT';
        previous.stockLossLedgerRowsAtClosing=Array.isArray(stateTransaction.get('resource.stockLossLedger'))
          ?stateTransaction.get('resource.stockLossLedger').length:0;
        previous.lossLedgerClosingCaptured=true;
        previous.lossLedgerClosingSource='NEXT_TURN_PRE_MOVEMENT_SNAPSHOT';}
      else{previous.closingCaptured=false;previous.closingCaptureStatus='TURN_GAP_UNOBSERVED';
        previous.lossLedgerClosingCaptured=false;previous.lossLedgerClosingStatus='TURN_GAP_UNOBSERVED';}
    }
    const ledger=stateTransaction.get('resource.inventoryLedger'),
      lossLedger=stateTransaction.get('resource.stockLossLedger');
    periods.push({schemaVersion:1,periodId,turn:t,periodType:'GAME_TURN',
      openingStockByIdentity:clone(snapshot.identities),openingCoverageComplete:snapshot.complete,
      openingCaptured:true,openingCaptureSource:'BEFORE_FIRST_PHYSICAL_STOCK_MUTATION',
      inventoryLedgerRowsAtOpening:Array.isArray(ledger)?ledger.length:0,
      stockLossLedgerRowsAtOpening:Array.isArray(lossLedger)?lossLedger.length:0,
      lossCoverageStatus:'UNOBSERVED_NO_AUTHORITATIVE_LOSS_LEDGER'});
    while(periods.length>32)periods.shift();
    stateTransaction.set('resource.stockFlowPeriods',periods);
    return{status:'CAPTURED',periodId,openingCoverageComplete:snapshot.complete};
  }

  function persistTradeBucket(ctx,bucket){
    const requests=Array.isArray(bucket?.importRequests)?bucket.importRequests:[];
    const ledger=bucket?.globalTradeLedger&&typeof bucket.globalTradeLedger==='object'
      ?bucket.globalTradeLedger:{requests:[],decisions:[],settlements:[]};
    ctx.stateTransaction.set('trade.importRequests',requests);
    ctx.stateTransaction.set('trade.globalTradeLedger',ledger);
    ctx.stateTransaction.set('trade.importLedger',Array.isArray(bucket?.importLedger)?bucket.importLedger:[]);
    ctx.stateTransaction.set('trade.exportLedger',Array.isArray(bucket?.exportLedger)?bucket.exportLedger:[]);
    for(const key of ['balance','importValue','exportValue','tradeValue','lastSettlementTurn']){
      if(Object.prototype.hasOwnProperty.call(bucket,key))ctx.stateTransaction.set('trade.'+key,bucket[key]);
    }
  }

  function emit(type,c,payload={},source='trade'){
    if(String(type||'').toUpperCase().startsWith('OMEGA_TRADE_'))worldActivityCache=null;
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
  function commandApplied(result){
    return !!result&&(result.status==='APPLIED'||result.result?.duplicate===true||result.duplicate===true)&&
      result.result?.accepted!==false&&result.accepted!==false;
  }

  function sellerReviewDecision(request){
    const buyer=canonical(request.countryId),seller=canonical(request.targetCountryId),resourceId=String(request.resourceId||'').trim();
    const covertDeal=blackMarketDealFor(request);
    if(request.blackMarketDealId&&!covertDeal)return{requestId:String(request.requestId),buyerCountryId:buyer,sellerCountryId:seller,resourceId,decision:'REJECT',reason:'BLACK_MARKET_AUTHORIZATION_INVALID',confidence:1};
    const market=g.OmegaGlobalMarket||g.Omega?.GlobalMarket,marketQuote=request.sellerCompanyId?market?.quote?.(resourceId):null;
    const r=relation(buyer,seller),rel=relationScore(r),
      price=covertDeal?num(covertDeal.unitPrice):(request.sellerCompanyId&&String(marketQuote?.status||'').toUpperCase()!=='CLEARED'?null:marketPrice(seller,resourceId)),
      supply=inventory(seller,resourceId);
    const sellerFin=financial(seller),need=num(request.needPressure)??0.5;
    const result={
      requestId:String(request.requestId),buyerCountryId:buyer,sellerCountryId:seller,resourceId,
      quantity:num(request.quantity),offeredUnitPrice:num(request.unitPrice),marketPrice:price,
      relationScore:rel,agreement:agreement(r,buyer,seller),decision:'WAITING_DATA',reason:null,
      quantityApproved:null,unitPrice:null,confidence:0.5,
      sellerCurrency:currencyOf(seller),buyerCurrency:currencyOf(buyer),fxRate:null
    };
    if(!r){result.reason='FOREIGN_RELATION_NOT_OBSERVED';return result;}
    if(r?.war_state===true){result.decision='REJECT';result.reason='WAR_STATE_PROHIBITED';return result;}
    if(r?.sanctions===true&&!covertDeal){result.decision='REJECT';result.reason='WAR_OR_SANCTIONS';return result;}
    const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
    const embargo=strategicPolicy?.isResourceEmbargoed?.(buyer,seller,resourceId);
    if(embargo?.blocked&&!covertDeal){result.decision='REJECT';result.reason=embargo.reason||'RESOURCE_EMBARGO_ACTIVE';result.embargoPolicies=embargo.policies||[];return result;}
    const supplyPolicy=result.quantity>0?strategicPolicy?.evaluateExportDirective?.(seller,buyer,resourceId,result.quantity,request.governmentContractId):null;
    if(supplyPolicy&&supplyPolicy.allowed===false&&!blackMarketMayReleaseExport(covertDeal,supplyPolicy.reason)){result.decision='REJECT';result.reason=supplyPolicy.reason||'STATE_SUPPLY_DIRECTIVE_BLOCKED';result.stateSupplyDirective=supplyPolicy;return result;}
    const routeMode=String(request.transportMode||request.routeMode||'ship');
    const buyerBlockade=strategicPolicy?.isRouteBlocked?.(buyer,{resourceId,transportMode:routeMode,routeId:request.routeId,siteId:request.siteId});
    const sellerBlockade=strategicPolicy?.isRouteBlocked?.(seller,{resourceId,transportMode:routeMode,routeId:request.routeId,siteId:request.siteId});
    if(buyerBlockade?.blocked||sellerBlockade?.blocked){result.decision='REJECT';result.reason='RESOURCE_ROUTE_BLOCKADE_ACTIVE';result.routeBlockades=[...(buyerBlockade?.blockades||[]),...(sellerBlockade?.blockades||[])];return result;}
    if(rel===null){result.reason='RELATION_SCORE_NOT_OBSERVED';return result;}
    if(covertDeal){const inspection=(g.OmegaBlackMarket||g.Omega?.BlackMarket)?.shouldIntercept?.(covertDeal.dealId,request);
      if(inspection?.detected){result.decision='REJECT';result.reason='BLACK_MARKET_INTERCEPTED';result.confidence=inspection.probability||1;return result;}}
    if(!result.agreement&&!covertDeal){result.decision='REJECT';result.reason='TRADE_AGREEMENT_NOT_APPROVED';return result;}
    if(price===null){result.reason='SELLER_MARKET_PRICE_NOT_OBSERVED';return result;}
    if(result.quantity===null||result.quantity<=0){result.decision='REJECT';result.reason='INVALID_QUANTITY';return result;}
    if(supply.stock===null){result.reason='SELLER_RESOURCE_STOCK_NOT_OBSERVED';return result;}
    const reserve=Math.max(0,supply.reserve||0);
    let free=Math.max(0,supply.stock-reserve);
    if(request.sellerCompanyId){
      const companySupply=privateCompanyAvailableStock(seller,resourceId,request.sellerCompanyId);
      result.privateCompanySupply=clone(companySupply);
      if(companySupply.status!=='AVAILABLE'){
        result.reason='PRIVATE_SELLER_COMPANY_STOCK_OR_WAREHOUSE_UNOBSERVED';return result;
      }
      free=Math.min(free,Math.max(0,num(companySupply.available)||0));
    }
    if(free<=0){result.decision='REJECT';result.reason=request.sellerCompanyId?'PRIVATE_SELLER_COMPANY_STOCK_INSUFFICIENT':'RESOURCE_RESERVED_OR_SCARCE';return result;}
    const approved=Math.min(result.quantity,free);
    const debtPressure=sellerFin.debtToGdp===null?0:clamp(sellerFin.debtToGdp/1.5);
    const liquidityPressure=sellerFin.liquidity===null?0:clamp(1-(sellerFin.liquidity/Math.max(sellerFin.gdp||sellerFin.liquidity||1,1)));
    const productionBuffer=supply.production===null||supply.production===undefined?null:clamp(Number(supply.production)/(Math.max(Number(supply.production)+Number(supply.stock||0),1)));
    const strategicScarcity=free<=Math.max(result.quantity,0)?1:clamp(result.quantity/Math.max(free,1));
    const diplomaticBenefit=rel;
    // Reuse the explicit relationship score in the final commercial acceptance gate.
    // The previous branch referenced an undeclared diplomacyWeight variable here,
    // causing every otherwise-eligible trade review to fail before settlement.
    const diplomacyWeight=diplomaticBenefit;
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
    if(!covertDeal&&offered < price*0.95){
      result.quantityApproved=approved;
      result.unitPrice=price;
      result.decision=willingness>=.75?'ACCEPT':'COUNTER';
      result.reason=result.decision==='ACCEPT'?'DEBT_OR_DIPLOMATIC_LIQUIDITY_PRESSURE':'PRICE_BELOW_MARKET';
      result.confidence=.9;
      return result;
    }
    result.quantityApproved=approved;
    // At this point the offer has already passed the 95% market-price floor.
    // Accept the quoted price within that floor instead of silently repricing it
    // to the full market ask, which would make the agreed buyer/seller ledgers differ.
    result.unitPrice=offered;
    result.fxRate=fxRate(buyer,seller);
    if(result.fxRate===null){result.decision='WAITING_DATA';result.reason='SETTLEMENT_FX_NOT_OBSERVED';return result;}
    result.decision=(rel>=.25||need>=.8||diplomacyWeight>=.6)?'ACCEPT':'COUNTER';
    if(result.decision==='COUNTER'){result.reason='LOW_RELATION_OR_COMMERCIAL_TERM';result.unitPrice=price;}
    result.confidence=.85;
    return result;
  }

  function createImportRequestHandler(cmd,ctx){
    const p=cmd&&cmd.payload||{},buyer=canonical(ctx.countryId),seller=canonical(p.targetCountryId),resourceId=String(p.resourceId||'').trim();
    const quantity=num(p.quantity),unitPrice=num(p.unitPrice);
    if(!buyer||!seller)return{accepted:false,reason:'BUYER_AND_SELLER_COUNTRY_REQUIRED'};
    if(buyer===seller)return{accepted:false,reason:'SELF_TRADE_NOT_ALLOWED'};
    if(!resourceId)return{accepted:false,reason:'RESOURCE_ID_REQUIRED'};
    if(quantity===null||quantity<=0)return{accepted:false,reason:'QUANTITY_MUST_BE_POSITIVE'};
    if(unitPrice===null||unitPrice<0)return{accepted:false,reason:'UNIT_PRICE_MUST_BE_NON_NEGATIVE'};
    const blackMarketDealId=String(p.blackMarketDealId||'').trim(),bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;
    const blackMarketDeal=blackMarketDealId?bm?.getAuthorizedDeal?.(blackMarketDealId,{buyerCountryId:buyer,sellerCountryId:seller,resourceId,quantity,unitPrice,blackMarketPermitId:p.blackMarketPermitId}):null;
    if(blackMarketDealId&&!blackMarketDeal)return{accepted:false,reason:'BLACK_MARKET_AUTHORIZATION_INVALID'};
    if(!blackMarketDealId&&String(p.source||'').toUpperCase()==='OMEGA_BLACK_MARKET')return{accepted:false,reason:'BLACK_MARKET_PERMIT_REQUIRED'};
    const buyerCompanyId=String(p.buyerCompanyId||'').trim().toUpperCase(),
      sellerCompanyId=String(p.sellerCompanyId||'').trim().toUpperCase(),
      privateCompanyPurchase=!!(buyerCompanyId||sellerCompanyId),
      lifecycle=g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1;
    // Command payloads may be deeply frozen by the state transaction boundary.
    // Keep derived market evidence local rather than mutating caller-owned input.
    var marketPriceEvidence=clone(p.marketPriceEvidence||{});
    if(privateCompanyPurchase){
      if(!buyerCompanyId||!sellerCompanyId)return{accepted:false,reason:'PRIVATE_IMPORT_BUYER_AND_SELLER_COMPANIES_REQUIRED'};
      const companyIds=Array.isArray(lifecycle?.companyIds)?lifecycle.companyIds.map(x=>String(x).toUpperCase()):[];
      if(!companyIds.length||!companyIds.includes(buyerCompanyId)||!companyIds.includes(sellerCompanyId))
        return{accepted:false,reason:'PRIVATE_IMPORT_CANONICAL_COMPANY_REGISTRY_UNAVAILABLE_OR_INVALID'};
      const buyerCompanyStatus=privateCompanyStatus(buyer,buyerCompanyId),sellerCompanyStatus=privateCompanyStatus(seller,sellerCompanyId);
      if(buyerCompanyStatus!=='ACTIVE')return{accepted:false,reason:'PRIVATE_IMPORT_BUYER_COMPANY_NOT_ACTIVE',companyStatus:buyerCompanyStatus};
      if(sellerCompanyStatus==='CLOSED')return{accepted:false,reason:'PRIVATE_IMPORT_SELLER_COMPANY_CLOSED'};
      const market=g.OmegaGlobalMarket||g.Omega?.GlobalMarket,quote=market?.quote?.(resourceId);
      if(String(quote?.status||'').toUpperCase()!=='CLEARED'||num(quote?.clearingPriceUsd)===null)
        return{accepted:false,reason:'EXECUTABLE_MARKET_CLEARING_PRICE_NOT_OBSERVED',marketQuote:quote||null};
      if(typeof market?.privateCompanySuppliers!=='function')
        return{accepted:false,reason:'PRIVATE_COMPANY_MARKET_SUPPLIER_RUNTIME_UNAVAILABLE'};
      const supplier=market.privateCompanySuppliers(resourceId,quantity,buyer,sellerCompanyId,seller)
        .find(row=>String(row.companyId||'').trim().toUpperCase()===sellerCompanyId);
      if(!supplier)return{accepted:false,reason:'PRIVATE_SELLER_COMPANY_HAS_NO_VERIFIED_MARKET_STOCK',sellerCompanyId:sellerCompanyId};
      marketPriceEvidence=Object.assign({},marketPriceEvidence,{
        status:quote.status,clearingPriceUsd:quote.clearingPriceUsd,marketTurn:quote.generatedTurn,
        companyAvailableStock:supplier.available,sourceBatchIds:supplier.sourceBatchIds,
        authority:'OMEGA_GLOBAL_MARKET_EXECUTABLE_CLEARING'});
    }
    const requestId=String(p.requestId||('TRADE-'+turn()+'-'+buyer+'-'+seller+'-'+token(resourceId)+'-'+Date.now()));
    const existingRequests=ctx.stateTransaction.get('trade.importRequests');
    const requests=Array.isArray(existingRequests)?clone(existingRequests):[];
    const duplicate=requests.find(x=>String(x.requestId)===requestId);
    if(duplicate){
      const same=canonical(duplicate.countryId||duplicate.buyerCountryId)===buyer&&
        canonical(duplicate.targetCountryId||duplicate.sellerCountryId)===seller&&
        String(duplicate.resourceId||'').trim().toLowerCase().replace(/[\s-]+/g,'_')===resourceId.trim().toLowerCase().replace(/[\s-]+/g,'_')&&
        num(duplicate.quantity)===quantity&&num(duplicate.unitPrice)===unitPrice&&
        String(duplicate.currency||currencyOf(buyer)||'').toUpperCase()===String(p.currency||currencyOf(buyer)||'').toUpperCase()&&
        String(duplicate.governmentContractId||'')===String(p.governmentContractId||'')&&
        String(duplicate.blackMarketDealId||'')===blackMarketDealId&&String(duplicate.blackMarketPermitId||'')===String(p.blackMarketPermitId||'')&&
        String(duplicate.buyerCompanyId||'')===buyerCompanyId&&String(duplicate.sellerCompanyId||'')===sellerCompanyId;
      return same?{accepted:true,duplicate:true,request:clone(duplicate)}:{accepted:false,reason:'TRADE_REQUEST_ID_CONFLICT'};
    }
    const rawLedger=ctx.stateTransaction.get('trade.globalTradeLedger');
    const ledger=rawLedger&&typeof rawLedger==='object'?clone(rawLedger):{requests:[],decisions:[],settlements:[]};
    if(!Array.isArray(ledger.requests))ledger.requests=[];
    if(!Array.isArray(ledger.decisions))ledger.decisions=[];
    if(!Array.isArray(ledger.settlements))ledger.settlements=[];
    const request={
      requestId,countryId:buyer,targetCountryId:seller,resourceId,quantity,unitPrice,
      currency:String(p.currency||currencyOf(buyer)||'').toUpperCase()||null,
      totalValue:Number((quantity*unitPrice).toFixed(8)),status:TYPES.SENT,stage:'OPEN',
      attempt:1,createdTurn:turn(),requestedTurn:turn(),source:p.source||'GLOBAL_TRADE_UI',
      needPressure:clamp(p.needPressure)??0.5,settlementStatus:'NOT_STARTED',
      evidencePolicy:'COUNTERPARTY_REVIEW_REQUIRED',
      blackMarketDealId:blackMarketDeal?.dealId||null,blackMarketPermitId:blackMarketDeal?.permitId||null,
      ...(blackMarketDeal?{importTariffPct:0}:(p.importTariffPct===undefined?{}:{importTariffPct:p.importTariffPct})),
      governmentContractId:String(p.governmentContractId||p.contractId||'').trim()||null,
      transportMode:String(p.transportMode||p.shippingMode||p.routeMode||'').trim()||null,
      routeId:String(p.routeId||'').trim()||null,
      buyerCompanyId:buyerCompanyId||null,sellerCompanyId:sellerCompanyId||null,
      marketPriceEvidence:privateCompanyPurchase?clone(marketPriceEvidence):null,
      procurementType:privateCompanyPurchase?'PRIVATE_COMPANY_TO_COMPANY':'COUNTRY_TRADE'
    };
    requests.push(request);
    ledger.requests.push({
      requestId,status:request.status,stage:request.stage,buyerCountryId:buyer,sellerCountryId:seller,
      resourceId,quantity,unitPrice,totalValue:request.totalValue,simulationTurn:turn(),source:request.source
    });
    ctx.stateTransaction.set('trade.importRequests',requests.slice(-MAX_HISTORY));
    ctx.stateTransaction.set('trade.globalTradeLedger',{
      ...ledger,requests:ledger.requests.slice(-MAX_HISTORY),
      decisions:ledger.decisions.slice(-MAX_HISTORY),settlements:ledger.settlements.slice(-MAX_HISTORY)
    });
    emit('OMEGA_TRADE_REQUEST_CREATED',buyer,request);
    return{accepted:true,request:clone(request)};
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
    if(decision==='WAITING_DATA'){req.status='SENT';req.stage='COUNTERPARTY_DATA_PENDING';bucket.importRequests[idx]=req;persistTradeBucket(ctx,bucket);return{accepted:true,status:'WAITING_DATA'};}
    if(decision==='REJECT'){
      req.status=TYPES.REJECTED;req.stage='COUNTERPARTY_REJECTED';req.rejectionReason=response.reason||'COUNTERPARTY_REJECTED';
      req.refusalCount=(num(req.refusalCount)||0)+1;
      bucket.importRequests[idx]=req;
      const ledger=bucket.globalTradeLedger||{requests:[],decisions:[],settlements:[]};
      ledger.requests=[...(ledger.requests||[]),{requestId,status:req.status,attempt:req.attempt||1,simulationTurn:turn(),reason:req.rejectionReason}].slice(-MAX_HISTORY);
      bucket.globalTradeLedger=ledger;
      persistTradeBucket(ctx,bucket);
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
      if(price===null||liquidity===null||qty===null){req.status='SENT';req.stage='COUNTER_OFFER_DATA_PENDING';bucket.importRequests[idx]=req;persistTradeBucket(ctx,bucket);return{accepted:true,status:'WAITING_DATA'};}
      const total=qty*price;
      if(total<=liquidity&&price<=ceiling){
        req.quantity=qty;req.unitPrice=price;req.totalValue=total;req.status=TYPES.ACCEPTED;req.stage='COUNTER_OFFER_ACCEPTED';req.acceptedTurn=turn();
        bucket.importRequests[idx]=req;persistTradeBucket(ctx,bucket);
        return{accepted:true,status:TYPES.ACCEPTED,request:req};
      }
      req.status=TYPES.REJECTED;req.stage='COUNTER_OFFER_DECLINED';req.rejectionReason='BUYER_COUNTER_OFFER_TOO_EXPENSIVE';req.refusalCount=(num(req.refusalCount)||0)+1;
      bucket.importRequests[idx]=req;persistTradeBucket(ctx,bucket);
      return{accepted:true,status:TYPES.REJECTED,request:req};
    }
    if(decision==='ACCEPT'){
      const qty=num(response.quantityApproved)||num(req.quantity),price=num(response.unitPrice)||num(req.unitPrice);
      req.quantity=qty;req.unitPrice=price;req.totalValue=qty*price;req.status=TYPES.ACCEPTED;req.stage='COUNTERPARTY_ACCEPTED';req.acceptedTurn=turn();
      bucket.importRequests[idx]=req;persistTradeBucket(ctx,bucket);
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
    persistTradeBucket(ctx,bucket);
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
    persistTradeBucket(ctx,bucket);
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
    const values=settlementValues(req.countryId,req.targetCountryId,q,req.unitPrice),covertDeal=blackMarketDealFor(req);
    const total=values.sellerValue;
    if(req.blackMarketDealId&&!covertDeal)return{ok:false,reason:'BLACK_MARKET_AUTHORIZATION_INVALID'};
    if(!r)return{ok:false,reason:'RELATION_NOT_OBSERVED'};
    if(r.war_state===true)return{ok:false,reason:'WAR_STATE_PROHIBITED'};
    if(r.sanctions===true&&!covertDeal)return{ok:false,reason:'WAR_OR_SANCTIONS'};
    if(!agreement(r,req.countryId,req.targetCountryId)&&!covertDeal)return{ok:false,reason:'TRADE_AGREEMENT_NOT_APPROVED'};
    if(capacity!==null&&capacity<=0)return{ok:false,reason:'ROUTE_UNAVAILABLE'};
    if(inv.stock===null)return{ok:false,reason:'SELLER_INVENTORY_NOT_OBSERVED'};
    const reserve=Math.max(0,inv.reserve||0);
    if(q===null||q<=0)return{ok:false,reason:'QUANTITY_NOT_OBSERVED'};
    if(inv.stock-reserve<q)return{ok:false,reason:'SELLER_FREE_STOCK_INSUFFICIENT'};
    const transitReservations=countryValue(req.targetCountryId,'trade.blackMarketTransitReservations');
    const reservedForOtherDeals=(Array.isArray(transitReservations)?transitReservations:[])
      .filter(row=>String(row.status||'').toUpperCase()==='ACTIVE'&&String(row.requestId||'')!==String(req.requestId||'')&&token(row.resourceId)===token(req.resourceId))
      .reduce((sum,row)=>sum+Math.max(0,num(row.quantity)||0),0);
    const rsTarget=countryEntry(state()?.resource,canonical(req.targetCountryId))||null;
    const netBatchRes=Array.isArray(rsTarget?.industrialNetwork?.batchReservations)?rsTarget.industrialNetwork.batchReservations:[];
    const tradeCommitPrefix='TRADE:'+String(req.requestId||'');
    const reservedBatchForOtherDeals=netBatchRes
      .filter(row=>['ACTIVE','RESERVED','LOCKED'].includes(String(row?.status||'').toUpperCase())&&
        !String(row?.commitmentId||'').startsWith(tradeCommitPrefix)&&
        (!row?.resourceId||token(row.resourceId)===token(req.resourceId)))
      .reduce((sum,row)=>sum+Math.max(0,num(row?.quantity)||0),0);
    if(inv.stock-reserve-reservedForOtherDeals-reservedBatchForOtherDeals+1e-9<q)
      return{ok:false,reason:reservedBatchForOtherDeals>0&&inv.stock-reserve-reservedForOtherDeals+1e-9>=q?'SELLER_BATCH_RESERVATION_CONFLICT':'SELLER_BLACK_MARKET_TRANSIT_STOCK_RESERVED',
        reserved:reservedForOtherDeals+reservedBatchForOtherDeals,requested:q};
    const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
    const supplyPolicy=strategicPolicy?.evaluateExportDirective?.(req.targetCountryId,req.countryId,req.resourceId,q,req.governmentContractId,{
      [req.resourceId]:inv.stock
    });
    if(supplyPolicy&&supplyPolicy.allowed===false&&!blackMarketMayReleaseExport(covertDeal,supplyPolicy.reason))return{ok:false,reason:supplyPolicy.reason||'STATE_SUPPLY_DIRECTIVE_BLOCKED',stateSupplyDirective:supplyPolicy};
    if(values.fx===null||values.sellerValue===null||values.buyerValue===null)return{ok:false,reason:'SETTLEMENT_FX_OR_PRICE_NOT_OBSERVED'};
    const privateCompanyPurchase=!!(req.buyerCompanyId&&req.sellerCompanyId);
    if(!!req.buyerCompanyId!==!!req.sellerCompanyId)return{ok:false,reason:'PRIVATE_IMPORT_COMPANY_PAIR_INCOMPLETE'};
    if(!privateCompanyPurchase&&buyerFin.liquidity===null)return{ok:false,reason:'BUYER_LIQUIDITY_NOT_OBSERVED'};
    // Local-currency buyerValue cannot be compared against USD Treasury. Government Banking
    // verifies the exact USD debit (including tariff) after bilateral review.
    if(!privateCompanyPurchase&&!g.OmegaGovernmentBanking&&buyerFin.liquidity<values.buyerValue)return{ok:false,reason:'BUYER_LIQUIDITY_INSUFFICIENT'};
    if(buyerInv.stock===null)return{ok:false,reason:'BUYER_RESOURCE_INVENTORY_NOT_OBSERVED'};
    return{ok:true,total:values.sellerValue,buyerTotal:values.buyerValue,sellerTotal:values.sellerValue,price:num(req.unitPrice),fx:values.fx,buyerCurrency:values.buyerCurrency,sellerCurrency:values.sellerCurrency,
      settlementAuthority:privateCompanyPurchase?'PRIVATE_COMPANY_WALLETS':'GOVERNMENT_BANKING_OR_COUNTRY_FINANCE'};
  }

  function financeDebitHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount),sid=String(p.settlementId||'').trim();
    if(amount===null||amount<0)return{accepted:false,reason:'FINANCE_AMOUNT_INVALID'};
    const hist=ctx.stateTransaction.get('finance.tradeSettlementHistory'),arr=Array.isArray(hist)?hist:[];
    const prior=sid?arr.find(x=>String(x.settlementId||'')===sid&&String(x.type||'').toUpperCase()==='DEBIT'):null;
    if(prior){if(Math.abs((num(prior.amount)||0)-amount)>1e-7)return{accepted:false,reason:'FINANCE_IDEMPOTENCY_AMOUNT_MISMATCH'};return{accepted:true,duplicate:true,amount:prior.amount};}
    const available=num(ctx.stateTransaction.get('finance.available')),reserves=num(ctx.stateTransaction.get('finance.reserves'));
    const base=available??reserves;
    if(base===null)return{accepted:false,reason:'FINANCE_LIQUIDITY_NOT_OBSERVED'};
    const bank=g.OmegaGovernmentBanking||g.Omega&&g.Omega.GovernmentBanking;
    if(available!==null&&bank&&typeof bank.getReservedTreasuryUsd==='function'){
      const held=num(bank.getReservedTreasuryUsd(ctx.countryId,sid))||0;
      if(base-held+1e-8<amount)return{accepted:false,reason:'FINANCE_TREASURY_HELD_FOR_OTHER_PAYMENTS',availableAfterHolds:Math.max(0,base-held),heldUsd:held};
    }
    if(base<amount)return{accepted:false,reason:'FINANCE_LIQUIDITY_INSUFFICIENT'};
    if(available!==null)ctx.stateTransaction.set('finance.available',available-amount);
    else ctx.stateTransaction.set('finance.reserves',reserves-amount);
    ctx.stateTransaction.set('finance.tradeSettlementHistory',arr.concat([{settlementId:sid,type:'DEBIT',amount,turn:turn(),countryId:ctx.countryId}]).slice(-MAX_HISTORY));
    return{accepted:true,amount};
  }
  function financeCreditHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount),sid=String(p.settlementId||'').trim();
    if(amount===null||amount<0)return{accepted:false,reason:'FINANCE_AMOUNT_INVALID'};
    const hist=ctx.stateTransaction.get('finance.tradeSettlementHistory'),arr=Array.isArray(hist)?hist:[];
    const prior=sid?arr.find(x=>String(x.settlementId||'')===sid&&String(x.type||'').toUpperCase()==='CREDIT'):null;
    if(prior){if(Math.abs((num(prior.amount)||0)-amount)>1e-7)return{accepted:false,reason:'FINANCE_IDEMPOTENCY_AMOUNT_MISMATCH'};return{accepted:true,duplicate:true,amount:prior.amount};}
    const available=num(ctx.stateTransaction.get('finance.available'));
    if(available===null)return{accepted:false,reason:'FINANCE_LIQUIDITY_NOT_OBSERVED'};
    ctx.stateTransaction.set('finance.available',available+amount);
    ctx.stateTransaction.set('finance.tradeSettlementHistory',arr.concat([{settlementId:sid,type:'CREDIT',amount,turn:turn(),countryId:ctx.countryId}]).slice(-MAX_HISTORY));
    return{accepted:true,amount};
  }
  function resourceDebitHandler(cmd,ctx){
    const p=cmd?.payload||{},rid=String(p.resourceId||''),q=num(p.quantity),inv=ctx.stateTransaction.get('resource.inventory');
    const auth=p.transferAuthorization,seller=canonical(ctx.countryId);
    if(!auth||String(auth.type||'').toUpperCase()!=='TRADE_SETTLEMENT')return{accepted:false,reason:'CROSS_BORDER_TRANSFER_AUTHORIZATION_REQUIRED'};
    if(canonical(auth.sourceCountryId)!==seller)return{accepted:false,reason:'TRADE_SOURCE_COUNTRY_MISMATCH',countryId:seller,sourceCountryId:canonical(auth.sourceCountryId)};
    const buyer=canonical(auth.destinationCountryId);
    if(!buyer||buyer===seller)return{accepted:false,reason:'TRADE_DESTINATION_COUNTRY_INVALID'};
    if(!rid||q===null||q<=0)return{accepted:false,reason:'RESOURCE_SETTLEMENT_INPUT_INVALID'};
    const payloadSettlementId=String(p.settlementId||'').trim();
    const authorizationSettlementId=String(auth.settlementId||'').trim();
    if(payloadSettlementId&&authorizationSettlementId&&payloadSettlementId!==authorizationSettlementId)
      return{accepted:false,reason:'TRADE_SETTLEMENT_AUTHORIZATION_ID_MISMATCH',settlementId:payloadSettlementId,authorizedSettlementId:authorizationSettlementId};
    const settlementId=payloadSettlementId||authorizationSettlementId;
    if(!settlementId)return{accepted:false,reason:'TRADE_SETTLEMENT_ID_REQUIRED'};
    const blackMarketDealId=String(auth.blackMarketDealId||'').trim(),bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;
    const blackMarketDeal=blackMarketDealId?bm?.validateAuthorization?.(blackMarketDealId,{buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,quantity:q,unitPrice:auth.unitPrice,blackMarketPermitId:auth.blackMarketPermitId}):null;
    if(blackMarketDealId&&!blackMarketDeal)return{accepted:false,reason:'BLACK_MARKET_AUTHORIZATION_INVALID'};
    const buyerCompanyId=String(auth.buyerCompanyId||'').trim().toUpperCase(),
      sellerCompanyId=String(auth.sellerCompanyId||'').trim().toUpperCase(),privateCompanyTrade=!!(buyerCompanyId||sellerCompanyId),
      lifecycle=g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1,
      companyIds=Array.isArray(lifecycle?.companyIds)?lifecycle.companyIds.map(x=>String(x).toUpperCase()):[];
    if(privateCompanyTrade&&(!buyerCompanyId||!sellerCompanyId||!companyIds.includes(buyerCompanyId)||!companyIds.includes(sellerCompanyId)))
      return{accepted:false,reason:'PRIVATE_TRADE_CANONICAL_COMPANY_AUTHORIZATION_INVALID'};
    if(privateCompanyTrade){
      const buyerStatus=privateCompanyStatus(buyer,buyerCompanyId),sellerStatus=privateCompanyStatus(seller,sellerCompanyId);
      if(buyerStatus!=='ACTIVE')return{accepted:false,reason:'PRIVATE_TRADE_BUYER_COMPANY_NOT_ACTIVE',companyStatus:buyerStatus};
      if(sellerStatus==='CLOSED')return{accepted:false,reason:'PRIVATE_TRADE_SELLER_COMPANY_CLOSED'};
    }
    const existingExportLedger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?ctx.stateTransaction.get('resource.inventoryLedger'):[];
    const priorExport=existingExportLedger.find(x=>String(x?.settlementId||'')===settlementId&&x?.type==='INTERNATIONAL_TRADE_EXPORT');
    if(priorExport){
      const same=String(priorExport.resourceId||'')===rid&&Math.abs((num(priorExport.quantity)||0)-q)<1e-7&&
        canonical(priorExport.sourceCountryId||seller)===seller&&canonical(priorExport.destinationCountryId||'')===buyer&&
        String(priorExport.governmentContractId||'')===String(auth.governmentContractId||'')&&
        String(priorExport.sellerCompanyId||'')===sellerCompanyId&&String(priorExport.buyerCompanyId||'')===buyerCompanyId;
      return same?{accepted:true,duplicate:true,resourceId:rid,quantity:num(priorExport.quantity)||q,
        sourceCountryId:seller,destinationCountryId:buyer,transferType:'TRADE',batchTransfers:clone(priorExport.batchTransfers||[])}:
        {accepted:false,reason:'TRADE_RESOURCE_DEBIT_IDEMPOTENCY_COLLISION',settlementId};
    }
    if(!settlementId)return{accepted:false,reason:'TRADE_SETTLEMENT_ID_REQUIRED'};
    const strategicPolicy=g.Omega?.ResourceStrategicPolicyRuntime||g.OmegaResourceStrategicPolicyRuntime;
    const embargo=strategicPolicy?.isResourceEmbargoed?.(buyer,seller,rid);
    if(embargo?.blocked&&!blackMarketDeal?.allowEmbargoBypass)return{accepted:false,reason:embargo.reason||'RESOURCE_EMBARGO_ACTIVE',policies:embargo.policies||[]};
    const routeMode=String(p.transportMode||auth.transportMode||'ship');
    const buyerBlockade=strategicPolicy?.isRouteBlocked?.(buyer,{resourceId:rid,transportMode:routeMode,routeId:p.routeId||auth.routeId,siteId:p.siteId||auth.siteId});
    const sellerBlockade=strategicPolicy?.isRouteBlocked?.(seller,{resourceId:rid,transportMode:routeMode,routeId:p.routeId||auth.routeId,siteId:p.siteId||auth.siteId});
    if(buyerBlockade?.blocked||sellerBlockade?.blocked)return{accepted:false,reason:'RESOURCE_ROUTE_BLOCKADE_ACTIVE',blockades:[...(buyerBlockade?.blockades||[]),...(sellerBlockade?.blockades||[])]};
    if(!inv||typeof inv!=='object')return{accepted:false,reason:'RESOURCE_INVENTORY_NOT_OBSERVED'};
    const inventoryKeys=Object.keys(inv).filter(key=>token(key)===token(rid));
    if(!inventoryKeys.length)return{accepted:false,reason:'RESOURCE_NOT_OBSERVED'};
    const invalidInventoryKeys=inventoryKeys.filter(key=>num(inv[key])===null||num(inv[key])<0);
    if(invalidInventoryKeys.length)return{accepted:false,reason:'RESOURCE_INVENTORY_KEY_VALUE_INVALID',resourceId:rid,keys:invalidInventoryKeys};
    const k=Object.prototype.hasOwnProperty.call(inv,rid)?rid:inventoryKeys[0];
    const inventoryStock=inventoryKeys.reduce((sum,key)=>sum+(num(inv[key])||0),0);
    let stock=inventoryStock;

    const rows=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const lots=clone(ctx.stateTransaction.get('resource.inventoryLots')||{});
    const raw=clone(ctx.stateTransaction.get('resource.warehouse')||{
      warehouseId:'WH-'+seller+'-RAW',countryId:seller,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
      locationNodeKey:'WAREHOUSE:'+seller+':RAW',status:'OPERATIONAL',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]});
    const processed=clone(ctx.stateTransaction.get('resource.processedWarehouse')||{
      warehouseId:'WH-'+seller+'-PROCESSED',countryId:seller,type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',
      locationNodeKey:'WAREHOUSE:'+seller+':PROCESSED',status:'OPERATIONAL',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]});
    raw.availableByResource=raw.availableByResource||{};raw.reservedByResource=raw.reservedByResource||{};
    raw.storedBatchIds=Array.isArray(raw.storedBatchIds)?raw.storedBatchIds:[];
    processed.availableByResource=processed.availableByResource||{};processed.reservedByResource=processed.reservedByResource||{};
    processed.storedBatchIds=Array.isArray(processed.storedBatchIds)?processed.storedBatchIds:[];
    const isProcessed=stage=>['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(String(stage||'').toUpperCase());
    const nonCentral=stage=>['FACTORY_INPUT','CONSUMED','TRANSFERRED_TO_FACTORY','SOLD','TRANSFERRED_OUT'].includes(String(stage||'').toUpperCase());
    // A mine-logistics batch keeps its full remainingQuantity while part of it is still
    // mine-held or in transit. Only receipted warehouse quantity is eligible for export.
    // Mirror the Resource Economy inventory authority so trade cannot debit cargo twice.
    const network=clone(ctx.stateTransaction.get('resource.industrialNetwork')||{});
    const siteFlows=Array.isArray(network.siteFlowLedger)?network.siteFlowLedger:[];
    const flowByBatch=new Map(siteFlows.filter(flow=>flow&&flow.batchId).map(flow=>[String(flow.batchId),flow]));
    const activeFactoryShipmentStatuses=new Set(['IN_TRANSIT','BLOCKED_ROUTE_BLOCKADE','BLOCKED_LEDGER_MISMATCH',
      'BLOCKED_BATCH_LEDGER_MISMATCH','BLOCKED_FACTORY_MISSING']);
    const factoryInTransitByBatch=new Map();
    let mineWarehouseExportFlowChanged=false;
    (Array.isArray(network.shipments)?network.shipments:[]).forEach(shipment=>{
      const batchId=String(shipment?.batchId||'').trim();
      if(!batchId||!activeFactoryShipmentStatuses.has(String(shipment?.status||''))||
         !['RAW_TO_FACTORY','WAREHOUSE_TO_FACTORY'].includes(String(shipment?.shipmentType||'')))return;
      factoryInTransitByBatch.set(batchId,(factoryInTransitByBatch.get(batchId)||0)+Math.max(0,num(shipment.quantity)||0));
    });
    const batchRemaining=b=>Math.max(0,num(b&&b.remainingQuantity!=null?b.remainingQuantity:b&&b.quantity)||0);
    const availableQty=b=>{
      const remaining=batchRemaining(b),batchId=String(b?.batchId||''),flow=flowByBatch.get(batchId);
      if(!flow||!(flow.mineLogisticsRouteId||flow.mineLogisticsStockDebited===true))return remaining;
      const received=Math.max(0,num(flow.mineWarehouseReceivedQuantity)||0);
      const factoryDispatched=Math.max(0,num(flow.factoryDispatchedQuantity)||0);
      const factoryInTransit=Math.max(0,num(factoryInTransitByBatch.get(batchId))||0);
      const factoryDelivered=Math.max(0,factoryDispatched-factoryInTransit);
      const factoryConsumed=Math.max(0,num(flow.mineWarehouseConsumedQuantity)||0);
      const tradeExported=Math.max(0,num(flow.mineWarehouseExportedQuantity)||0);
      return Math.min(remaining,Math.max(0,received-factoryDelivered-factoryConsumed-tradeExported));
    };
    const centralAll=rows.filter(b=>token(b&&(b.resourceId||b.materialIdentity))===token(rid)&&!nonCentral(b&&b.stage)&&availableQty(b)>1e-9);
    const centralAllQty=centralAll.reduce((sum,b)=>sum+availableQty(b),0);
    const rawObservedKeys=Object.keys(raw.availableByResource).filter(key=>token(key)===token(rid));
    const processedObservedKeys=Object.keys(processed.availableByResource).filter(key=>token(key)===token(rid));
    const warehouseObserved=rawObservedKeys.length>0||processedObservedKeys.length>0;
    const sumMatching=(book,keys)=>keys.reduce((sum,key)=>sum+Math.max(0,num(book[key])||0),0);
    const rawWarehouseQuantity=sumMatching(raw.availableByResource,rawObservedKeys);
    const processedWarehouseQuantity=sumMatching(processed.availableByResource,processedObservedKeys);
    const warehouseQuantity=rawWarehouseQuantity+processedWarehouseQuantity;
    if(warehouseObserved){
      // The country inventory map is a compatibility mirror. It may lag after a
      // factory run; export is safe only when raw + processed warehouse balances
      // independently agree with the receipted, unconsumed batch ledger.
      if(Math.abs(warehouseQuantity-centralAllQty)>1e-6)
        return{accepted:false,reason:'RESOURCE_WAREHOUSE_BATCH_LEDGER_MISMATCH',resourceId:rid,
          inventory:inventoryStock,warehouseQuantity,trackedCentralQuantity:centralAllQty,
          rawWarehouseQuantity,processedWarehouseQuantity};
      stock=Math.max(stock,warehouseQuantity);
    }else if(centralAllQty>stock+1e-6){
      return{accepted:false,reason:'RESOURCE_BATCH_INVENTORY_MISMATCH',inventory:stock,trackedCentralQuantity:centralAllQty};
    }
    if(stock+1e-9<q)return{accepted:false,reason:'RESOURCE_STOCK_INSUFFICIENT'};
    // Export policy evaluates the same reconciled aggregate used by the final debit,
    // while the stored country state remains untouched until the transaction commits.
    const directiveInventory=Object.assign({},inv,{[rid]:stock});
    const supplyDirective=strategicPolicy?.evaluateExportDirective?.(seller,buyer,rid,q,auth.governmentContractId,directiveInventory);
    if(supplyDirective&&supplyDirective.allowed===false&&!blackMarketMayReleaseExport(blackMarketDeal,supplyDirective.reason))
      return{accepted:false,reason:supplyDirective.reason||'STATE_SUPPLY_DIRECTIVE_BLOCKED',stateSupplyDirective:supplyDirective};
    const exportFactoryIds=strategicPolicy?.allowedExportFactoryIds?.(seller,rid,auth.governmentContractId)||null;
    const strategic=ctx.stateTransaction.get('resource.strategicReserve')||{};
    const strategicBook=strategic.availableByResource&&typeof strategic.availableByResource==='object'?strategic.availableByResource:{};
    const reservedStrategic=Object.keys(strategicBook).filter(key=>token(key)===token(rid))
      .reduce((sum,key)=>sum+Math.max(0,num(strategicBook[key])||0),0);
    if(stock-reservedStrategic+1e-9<q)
      return{accepted:false,reason:'STRATEGIC_STOCKPILE_PROTECTED',available:Math.max(0,stock-reservedStrategic),requested:q};
    const explicitOwnerStatus=value=>!['NOT_RECORDED','OWNER_NOT_RECORDED','UNASSIGNED','UNKNOWN_SOURCE','LEGACY_COMPANY_ATTRIBUTION_ROLE_UNCLASSIFIED'].includes(String(value||'').toUpperCase());
    const central=privateCompanyTrade?centralAll.filter(b=>String(b.ownerCompanyId||b.ownerId||'').trim().toUpperCase()===sellerCompanyId&&
      explicitOwnerStatus(b.ownerAttributionStatus)&&companyIds.includes(String(b.operatorCompanyId||b.operatorId||'').trim().toUpperCase())):centralAll;
    const centralQty=central.reduce((sum,b)=>sum+availableQty(b),0);
    if(privateCompanyTrade&&centralQty+1e-8<q)return{accepted:false,reason:'PRIVATE_SELLER_COMPANY_STOCK_INSUFFICIENT',sellerCompanyId:sellerCompanyId,available:centralQty,requested:q};

    // Represent aggregate-only opening stock as an explicitly unobserved balance.
    // It is not assigned to a mine or passed off as observed geological provenance.
    const legacyQty=privateCompanyTrade?0:Math.max(0,stock-centralAllQty);
    if(legacyQty>1e-9){
      const legacyId='LEGACY-TRADE-STOCK:'+seller+':'+token(rid);
      let legacy=rows.find(b=>String(b?.batchId||'')===legacyId);
      if(!legacy){
        legacy={batchId:legacyId,resourceId:rid,materialIdentity:rid,quantity:legacyQty,remainingQuantity:legacyQty,unit:null,stage:'LEGACY_UNTRACKED',
          countryId:seller,sourceCountryId:seller,originCountryId:seller,ownerCountryCode:seller,destinationCountryId:seller,
          warehouseId:'WH-'+seller+'-RAW',locationNodeKey:'WAREHOUSE:'+seller+':RAW',sourceBatchIds:[],
          provenance:{sourceAuthority:'UNOBSERVED',authority:'LEGACY_OPENING_BALANCE'},transferType:'LEGACY_BALANCE_RECONCILIATION',status:'AVAILABLE'};
        rows.push(legacy);lots[legacyId]={...clone(legacy),status:'AVAILABLE'};
      }else{
        legacy.remainingQuantity=legacyQty;legacy.quantity=Math.max(num(legacy.quantity)||0,legacyQty);
        if(lots[legacyId])lots[legacyId].remainingQuantity=legacyQty;
      }
    }
    const rawRows=rows.filter(b=>token(b&&(b.resourceId||b.materialIdentity))===token(rid)&&!nonCentral(b&&b.stage)&&!isProcessed(b&&b.stage)&&availableQty(b)>1e-9);
    const processedRows=rows.filter(b=>token(b&&(b.resourceId||b.materialIdentity))===token(rid)&&!nonCentral(b&&b.stage)&&isProcessed(b&&b.stage)&&availableQty(b)>1e-9);
    const rawKeys=Object.keys(raw.availableByResource).filter(key=>token(key)===token(rid));
    const processedKeys=Object.keys(processed.availableByResource).filter(key=>token(key)===token(rid));
    const rawKey=rawKeys.find(key=>key===rid)||rawKeys[0]||rid;
    const processedKey=processedKeys.find(key=>key===rid)||processedKeys[0]||rid;
    const rawTargetQuantity=rawRows.reduce((sum,b)=>sum+availableQty(b),0);
    const processedTargetQuantity=processedRows.reduce((sum,b)=>sum+availableQty(b),0);
    // Preserve legacy key aliases for old saves, but keep only one authoritative
    // balance per normalized resource identity. Zero is retained as a value; keys
    // are never deleted as part of a trade.
    rawKeys.forEach(key=>{raw.availableByResource[key]=0;});
    processedKeys.forEach(key=>{processed.availableByResource[key]=0;});
    raw.availableByResource[rawKey]=rawTargetQuantity;
    processed.availableByResource[processedKey]=processedTargetQuantity;
    raw.storedBatchIds=[...new Set(rawRows.map(b=>String(b.batchId||'')).filter(Boolean))];
    processed.storedBatchIds=[...new Set(processedRows.map(b=>String(b.batchId||'')).filter(Boolean))];
    const netBatchReservations=Array.isArray(network.batchReservations)?network.batchReservations:[];
    const tradeCommitmentPrefix='TRADE:'+String(p.requestId||auth.requestId||'');
    const batchLockedByBatch=new Map();
    let totalNetworkBatchLocked=0;
    netBatchReservations.forEach(row=>{
      if(!row||!['ACTIVE','RESERVED','LOCKED'].includes(String(row.status||'').toUpperCase()))return;
      if(tradeCommitmentPrefix!=='TRADE:'&&String(row.commitmentId||'').startsWith(tradeCommitmentPrefix))return;
      if(row.resourceId&&token(row.resourceId)!==token(rid))return;
      const bid=String(row.batchId||'').trim(),qLock=Math.max(0,num(row.quantity)||0);
      if(!bid||qLock<=1e-9)return;
      batchLockedByBatch.set(bid,(batchLockedByBatch.get(bid)||0)+qLock);
      totalNetworkBatchLocked+=qLock;
    });
    const sumReserved=book=>Object.keys(book||{}).filter(key=>token(key)===token(rid))
      .reduce((sum,key)=>sum+Math.max(0,num(book[key])||0),0);
    const rawReserved=sumReserved(raw.reservedByResource),processedReserved=sumReserved(processed.reservedByResource);
    const rawOnHand=raw.availableByResource[rawKey],processedOnHand=processed.availableByResource[processedKey];
    if(rawOnHand-rawReserved+processedOnHand-processedReserved-totalNetworkBatchLocked+1e-6<q){
      return{accepted:false,reason:totalNetworkBatchLocked>0&&rawOnHand-rawReserved+processedOnHand-processedReserved+1e-6>=q?'SELLER_BATCH_RESERVATION_CONFLICT':'WAREHOUSE_STOCK_INSUFFICIENT',
        available:Math.max(0,rawOnHand-rawReserved+processedOnHand-processedReserved-totalNetworkBatchLocked),requested:q,reservedBatchQuantity:totalNetworkBatchLocked};
    }
    const fifo=central.concat(privateCompanyTrade?[]:rows.filter(b=>String(b?.batchId||'')==='LEGACY-TRADE-STOCK:'+seller+':'+token(rid))).filter((b,i,a)=>a.findIndex(x=>String(x?.batchId)===String(b?.batchId))===i);
    let remaining=q;const batchTransfers=[];let rawDebit=0,processedDebit=0;
    for(const b of fifo){
      if(remaining<=1e-9)break;
      if(token(b&&(b.resourceId||b.materialIdentity))!==token(rid)||nonCentral(b&&b.stage))continue;
      const before=Math.max(0,availableQty(b)-(batchLockedByBatch.get(String(b.batchId||''))||0));if(before<=0)continue;
      const sourceFactoryId=String(b.sourceFactoryId||b.factoryId||'').trim();
      if(privateCompanyTrade&&(String(b.ownerCompanyId||b.ownerId||'').trim().toUpperCase()!==sellerCompanyId||
         !explicitOwnerStatus(b.ownerAttributionStatus)||!companyIds.includes(String(b.operatorCompanyId||b.operatorId||'').trim().toUpperCase())))continue;
      if(Array.isArray(exportFactoryIds)&&(!sourceFactoryId||!exportFactoryIds.includes(sourceFactoryId)))continue;
      const stage=String(b.stage||'RAW').toUpperCase(),finished=isProcessed(stage),take=Math.min(before,remaining),
        after=Math.max(0,batchRemaining(b)-take),flow=flowByBatch.get(String(b.batchId||''));
      let lot=lots[b.batchId];
      if(!lot)lot={batchId:b.batchId,resourceId:rid,quantity:num(b.quantity)||before,remainingQuantity:before,unit:b.unit||null,stage:b.stage||'RAW',
        countryId:seller,warehouseId:b.warehouseId||(finished?processed.warehouseId:raw.warehouseId),sourceBatchIds:clone(b.sourceBatchIds||[]),status:'AVAILABLE'};
      const lotBefore=Math.max(0,num(lot.remainingQuantity!=null?lot.remainingQuantity:lot.quantity)||0);
      if(lotBefore+1e-6<take)return{accepted:false,reason:'RESOURCE_INVENTORY_LOT_MISMATCH',batchId:b.batchId,required:take,available:lotBefore};
      b.remainingQuantity=after;b.lastMovementType='INTERNATIONAL_TRADE_EXPORT';b.lastMovementTurn=turn();b.status=after>1e-9?'PARTIALLY_SOLD':'SOLD';
      lot.remainingQuantity=Math.max(0,lotBefore-take);lot.status=lot.remainingQuantity>1e-9?'PARTIALLY_SOLD':'SOLD';
      lot.lastMovementType='INTERNATIONAL_TRADE_EXPORT';lot.lastMovementTurn=turn();lots[b.batchId]=lot;
      if(flow){
        flow.mineWarehouseExportedQuantity=(Math.max(0,num(flow.mineWarehouseExportedQuantity)||0)+take);
        flow.lastMineWarehouseExportTurn=turn();mineWarehouseExportFlowChanged=true;
      }
      if(finished)processedDebit+=take;else rawDebit+=take;
      const roots=[...new Set([...(Array.isArray(b.sourceBatchIds)?b.sourceBatchIds:[]),String(b.batchId||'')].filter(Boolean).map(String))];
      batchTransfers.push({sourceBatchId:String(b.batchId||''),sourceBatchIds:roots,siteId:b.siteId||b.sourceSiteId||b.siteReferenceKey||null,
        siteReferenceKey:b.siteReferenceKey||null,occurrenceKey:b.occurrenceKey||b.sourceOccurrenceKey||null,resourceId:rid,quantity:take,
        unit:b.unit||null,stage,warehouseId:b.warehouseId||(finished?processed.warehouseId:raw.warehouseId),
        sourceCountryId:seller,originCountryId:b.originCountryId||seller,destinationCountryId:buyer,
        provenance:clone(b.provenance||{sourceAuthority:'UNOBSERVED'}),ownerCompanyId:b.ownerCompanyId||null,
        operatorCompanyId:b.operatorCompanyId||null,ownerAttributionStatus:b.ownerAttributionStatus||'NOT_RECORDED',
        sourceFactoryId:sourceFactoryId||null,tradeMode:blackMarketDeal?'BLACK_MARKET':'GENERAL_TRADE',blackMarketDealId:blackMarketDeal?.dealId||null});
      remaining-=take;
    }
    if(remaining>1e-6)return{accepted:false,reason:exportFactoryIds?'STATE_FACTORY_EXPORT_ALLOCATION_STOCK_INSUFFICIENT':'RESOURCE_BATCH_ALLOCATION_INCOMPLETE',remaining,requested:q,allocated:q-remaining};
    const allocationCheck=strategicPolicy?.validateExportBatchAllocation?.(seller,rid,batchTransfers,auth.governmentContractId);
    if(allocationCheck&&allocationCheck.allowed===false)return{accepted:false,reason:allocationCheck.reason||'STATE_FACTORY_EXPORT_ALLOCATION_VIOLATION',stateSupplyDirective:allocationCheck};
    const directiveCommit=strategicPolicy?.commitExportDirectiveTx?.(ctx,{settlementId:settlementId,resourceId:rid,
      quantity:q,destinationCountryId:buyer,governmentContractId:auth.governmentContractId,batchTransfers});
    if(directiveCommit&&directiveCommit.accepted===false)return{accepted:false,reason:directiveCommit.reason||'STATE_SUPPLY_DIRECTIVE_COMMIT_FAILED',stateSupplyDirective:directiveCommit};
    captureStockFlowPeriod(ctx.stateTransaction);
    const next=clone(inv);
    const inventoryMirrorAdjustment=Math.max(0,stock-inventoryStock);
    next[k]=Math.max(0,(num(next[k])||0)+inventoryMirrorAdjustment-q);
    raw.availableByResource[rawKey]=Math.max(0,rawOnHand-rawDebit);
    processed.availableByResource[processedKey]=Math.max(0,processedOnHand-processedDebit);
    raw.storedBatchIds=raw.storedBatchIds.filter(id=>availableQty(rows.find(b=>String(b.batchId)===String(id)))>1e-9);
    processed.storedBatchIds=processed.storedBatchIds.filter(id=>availableQty(rows.find(b=>String(b.batchId)===String(id)))>1e-9);
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'INTERNATIONAL_TRADE_EXPORT',settlementId:settlementId,resourceId:rid,quantity:q,
      sourceCountryId:seller,destinationCountryId:buyer,governmentContractId:String(auth.governmentContractId||'')||null,
      tradeMode:blackMarketDeal?'BLACK_MARKET':'GENERAL_TRADE',blackMarketDealId:blackMarketDeal?.dealId||null,
      buyerCompanyId:buyerCompanyId||null,sellerCompanyId:sellerCompanyId||null,
      batchTransfers:clone(batchTransfers),turn:turn()});
    while(ledger.length>2048)ledger.shift();
    ctx.stateTransaction.set('resource.inventory',next);ctx.stateTransaction.set('resource.batches',rows);ctx.stateTransaction.set('resource.inventoryLots',lots);
    ctx.stateTransaction.set('resource.warehouse',raw);ctx.stateTransaction.set('resource.processedWarehouse',processed);ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    if(mineWarehouseExportFlowChanged)ctx.stateTransaction.set('resource.industrialNetwork',network);
    return{accepted:true,resourceId:rid,quantity:q,sourceCountryId:seller,destinationCountryId:buyer,transferType:'TRADE',batchTransfers};
  }
  function resourceCreditHandler(cmd,ctx){
    const p=cmd?.payload||{},rid=String(p.resourceId||''),q=num(p.quantity),inv=ctx.stateTransaction.get('resource.inventory');
    const auth=p.transferAuthorization,buyer=canonical(ctx.countryId);
    if(!auth||String(auth.type||'').toUpperCase()!=='TRADE_SETTLEMENT')return{accepted:false,reason:'CROSS_BORDER_TRANSFER_AUTHORIZATION_REQUIRED'};
    if(canonical(auth.destinationCountryId)!==buyer)return{accepted:false,reason:'TRADE_DESTINATION_COUNTRY_MISMATCH',countryId:buyer,destinationCountryId:canonical(auth.destinationCountryId)};
    const seller=canonical(auth.sourceCountryId);
    if(!seller||seller===buyer)return{accepted:false,reason:'TRADE_SOURCE_COUNTRY_INVALID'};
    if(!rid||q===null||q<=0)return{accepted:false,reason:'RESOURCE_SETTLEMENT_INPUT_INVALID'};
    const payloadSettlementId=String(p.settlementId||'').trim();
    const authorizationSettlementId=String(auth.settlementId||'').trim();
    if(payloadSettlementId&&authorizationSettlementId&&payloadSettlementId!==authorizationSettlementId)
      return{accepted:false,reason:'TRADE_SETTLEMENT_AUTHORIZATION_ID_MISMATCH',settlementId:payloadSettlementId,authorizedSettlementId:authorizationSettlementId};
    const settlementId=payloadSettlementId||authorizationSettlementId;
    if(!settlementId)return{accepted:false,reason:'TRADE_SETTLEMENT_ID_REQUIRED'};
    const blackMarketDealId=String(auth.blackMarketDealId||'').trim(),bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;
    const blackMarketDeal=blackMarketDealId?bm?.validateAuthorization?.(blackMarketDealId,{buyerCountryId:buyer,sellerCountryId:seller,resourceId:rid,quantity:q,unitPrice:auth.unitPrice,blackMarketPermitId:auth.blackMarketPermitId}):null;
    if(blackMarketDealId&&!blackMarketDeal)return{accepted:false,reason:'BLACK_MARKET_AUTHORIZATION_INVALID'};
    const buyerCompanyId=String(auth.buyerCompanyId||'').trim().toUpperCase(),sellerCompanyId=String(auth.sellerCompanyId||'').trim().toUpperCase(),
      privateCompanyTrade=!!(buyerCompanyId||sellerCompanyId);
    if(privateCompanyTrade&&(!buyerCompanyId||!sellerCompanyId||privateCompanyStatus(buyer,buyerCompanyId)!=='ACTIVE'))
      return{accepted:false,reason:'PRIVATE_IMPORT_BUYER_COMPANY_NOT_ACTIVE'};
    const existingImportLedger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?ctx.stateTransaction.get('resource.inventoryLedger'):[];
    const priorImport=existingImportLedger.find(x=>String(x?.settlementId||'')===String(settlementId||'')&&x?.type==='INTERNATIONAL_TRADE_IMPORT');
    if(priorImport)return{accepted:true,duplicate:true,resourceId:rid,quantity:num(priorImport.quantity)||q,
      sourceCountryId:seller,destinationCountryId:buyer,transferType:'TRADE',sourceBatchTransfers:clone(priorImport.batchTransfers||[]),
      batchTransfers:clone(priorImport.batchTransfers||[]),createdBatchIds:clone(priorImport.createdBatchIds||[])};
    if(!inv||typeof inv!=='object')return{accepted:false,reason:'RESOURCE_INVENTORY_NOT_OBSERVED'};
    const k=Object.prototype.hasOwnProperty.call(inv,rid)?rid:(Object.keys(inv).find(x=>token(x)===token(rid))||rid);
    captureStockFlowPeriod(ctx.stateTransaction);
    const next=clone(inv),current=num(next[k])??0,transfers=Array.isArray(auth.batchTransfers)?clone(auth.batchTransfers):[];
    const transferTotal=transfers.reduce((sum,x)=>sum+Math.max(0,num(x?.quantity)||0),0);
    if(transfers.length&&Math.abs(transferTotal-q)>1e-6)return{accepted:false,reason:'TRADE_BATCH_TRANSFER_QUANTITY_MISMATCH',requested:q,transferred:transferTotal};
    const plan=transfers.length?transfers:[{sourceBatchId:null,sourceBatchIds:[],resourceId:rid,quantity:q,stage:'LEGACY_UNTRACKED',
      unit:null,sourceCountryId:seller,originCountryId:seller,destinationCountryId:buyer,provenance:{sourceAuthority:'UNOBSERVED',authority:'LEGACY_AGGREGATE_TRADE'}}];
    const rows=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const lots=clone(ctx.stateTransaction.get('resource.inventoryLots')||{});
    const raw=clone(ctx.stateTransaction.get('resource.warehouse')||{warehouseId:'WH-'+buyer+'-RAW',countryId:buyer,type:'SOVEREIGN_RAW_MATERIAL_WAREHOUSE',
      locationNodeKey:'WAREHOUSE:'+buyer+':RAW',status:'OPERATIONAL',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]});
    const processed=clone(ctx.stateTransaction.get('resource.processedWarehouse')||{warehouseId:'WH-'+buyer+'-PROCESSED',countryId:buyer,type:'SOVEREIGN_FINISHED_GOODS_WAREHOUSE',
      locationNodeKey:'WAREHOUSE:'+buyer+':PROCESSED',status:'OPERATIONAL',availableByResource:{},reservedByResource:{},storedBatchIds:[],receipts:[]});
    raw.availableByResource=raw.availableByResource||{};raw.storedBatchIds=Array.isArray(raw.storedBatchIds)?raw.storedBatchIds:[];
    raw.receipts=Array.isArray(raw.receipts)?raw.receipts:[];
    processed.availableByResource=processed.availableByResource||{};processed.storedBatchIds=Array.isArray(processed.storedBatchIds)?processed.storedBatchIds:[];
    processed.receipts=Array.isArray(processed.receipts)?processed.receipts:[];
    const isProcessed=stage=>['PROCESSED','INTERMEDIATE','FINISHED','REFINED','OUTPUT'].includes(String(stage||'').toUpperCase());
    const lifecycle=g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1,
      companyIds=Array.isArray(lifecycle?.companyIds)?lifecycle.companyIds.map(x=>String(x).toUpperCase()):[];
    if(privateCompanyTrade&&(!buyerCompanyId||!sellerCompanyId||!companyIds.includes(buyerCompanyId)||!companyIds.includes(sellerCompanyId)))
      return{accepted:false,reason:'PRIVATE_IMPORT_COMPANY_AUTHORIZATION_INVALID'};
    const createdBatchIds=[],acceptedTransfers=[];let credited=0;
    for(let i=0;i<plan.length;i++){
      const transfer=plan[i]||{},quantity=Math.max(0,num(transfer.quantity)||0);if(quantity<=0)continue;
      const productStage=isProcessed(transfer.stage)?'FINISHED':'RAW_EXTRACTED',warehouse=productStage==='FINISHED'?processed:raw;
      const sourceBatchId=String(transfer.sourceBatchId||('UNOBSERVED-'+i)).trim();
      const batchId='TRADE:'+String(settlementId||('T'+turn()))+':'+sourceBatchId+':'+i;
      if(rows.some(x=>String(x?.batchId||'')===batchId))return{accepted:false,reason:'TRADE_BATCH_ALREADY_CREDITED',batchId};
      const roots=[...new Set((Array.isArray(transfer.sourceBatchIds)?transfer.sourceBatchIds:[]).map(String).filter(Boolean))];
      const batch={batchId,resourceId:rid,materialIdentity:rid,quantity,remainingQuantity:quantity,unit:transfer.unit||null,stage:productStage,
        countryId:buyer,sourceCountryId:seller,originCountryId:transfer.originCountryId||seller,ownerCountryCode:buyer,destinationCountryId:buyer,
        ownerCompanyId:privateCompanyTrade?buyerCompanyId:null,operatorCompanyId:privateCompanyTrade?buyerCompanyId:null,
        ownerAttributionStatus:privateCompanyTrade?'EXPLICIT_PRIVATE_COMPANY_PURCHASE':'NOT_RECORDED',
        sourceOwnerCompanyId:transfer.ownerCompanyId||null,sourceOperatorCompanyId:transfer.operatorCompanyId||null,
        sourceFactoryId:transfer.sourceFactoryId||null,sourceSellerCompanyId:sellerCompanyId||transfer.ownerCompanyId||null,
        sourceBatchIds:roots,sourceTransferBatchId:transfer.sourceBatchId||null,sourceTransferCountryId:seller,
        sourceSiteId:transfer.siteId||null,siteReferenceKey:transfer.siteReferenceKey||null,occurrenceKey:transfer.occurrenceKey||null,
        warehouseId:warehouse.warehouseId,locationNodeKey:warehouse.locationNodeKey,transferReference:settlementId||null,
        timestampTurn:turn(),lastMovementType:'INTERNATIONAL_TRADE_IMPORT',lastMovementTurn:turn(),
        provenance:{sourceSubsystem:'OMEGA_GLOBAL_TRADE_SYSTEM',sourceAuthority:transfer.provenance?.sourceAuthority||'UNOBSERVED',
          transferAuthority:'SETTLED_INTERNATIONAL_TRADE',settlementId:settlementId||null,sourceCountryId:seller,
          buyerCompanyId:buyerCompanyId||null,sellerCompanyId:sellerCompanyId||null,
          sourceOwnerCompanyId:transfer.ownerCompanyId||null,sourceOperatorCompanyId:transfer.operatorCompanyId||null,
          sourceBatchId:transfer.sourceBatchId||null,sourceBatchIds:roots,sourceSiteId:transfer.siteId||null,occurrenceKey:transfer.occurrenceKey||null,
          sourceProvenance:clone(transfer.provenance||{sourceAuthority:'UNOBSERVED'}),simulationTurn:turn()}};
      rows.push(batch);createdBatchIds.push(batchId);
      lots[batchId]={batchId,resourceId:rid,quantity,remainingQuantity:quantity,unit:batch.unit,stage:productStage,countryId:buyer,
        warehouseId:warehouse.warehouseId,locationNodeKey:warehouse.locationNodeKey,sourceBatchIds:roots,sourceTransferBatchId:batch.sourceTransferBatchId,
        status:'AVAILABLE',provenance:clone(batch.provenance),createdTurn:turn()};
      warehouse.availableByResource[rid]=(num(warehouse.availableByResource[rid])||0)+quantity;
      warehouse.storedBatchIds.push(batchId);
      warehouse.receipts.push({receiptId:'WH-REC-'+batchId,warehouseId:warehouse.warehouseId,countryId:buyer,batchId,resourceId:rid,
        quantity,unit:batch.unit,simulationTurn:turn(),status:'RECEIVED',sourceCountryId:seller,settlementId:settlementId||null});
      credited+=quantity;
      acceptedTransfers.push({sourceBatchId:transfer.sourceBatchId||null,sourceBatchIds:roots,creditedBatchId:batchId,quantity,resourceId:rid,
        sourceCountryId:seller,destinationCountryId:buyer,ownerCompanyId:privateCompanyTrade?buyerCompanyId:null,
        sellerCompanyId:sellerCompanyId||transfer.ownerCompanyId||null,sourceFactoryId:transfer.sourceFactoryId||null,
        unit:transfer.unit||null,status:'CREDITED'});
    }
    if(Math.abs(credited-q)>1e-6)return{accepted:false,reason:'TRADE_IMPORT_CREDIT_QUANTITY_MISMATCH',requested:q,credited};
    next[k]=current+credited;
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'INTERNATIONAL_TRADE_IMPORT',settlementId:settlementId||null,resourceId:rid,quantity:credited,
      sourceCountryId:seller,createdBatchIds,batchTransfers:acceptedTransfers,
      buyerCompanyId:buyerCompanyId||null,sellerCompanyId:sellerCompanyId||null,
      tradeMode:blackMarketDeal?'BLACK_MARKET':'GENERAL_TRADE',blackMarketDealId:blackMarketDeal?.dealId||null,turn:turn()});
    while(ledger.length>2048)ledger.shift();
    ctx.stateTransaction.set('resource.inventory',next);ctx.stateTransaction.set('resource.batches',rows);ctx.stateTransaction.set('resource.inventoryLots',lots);
    ctx.stateTransaction.set('resource.warehouse',raw);ctx.stateTransaction.set('resource.processedWarehouse',processed);ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    return{accepted:true,resourceId:rid,quantity:credited,sourceCountryId:seller,destinationCountryId:buyer,transferType:'TRADE',
      sourceBatchTransfers:transfers,createdBatchIds,batchTransfers:acceptedTransfers};
  }
  function closeRequestHandler(cmd,ctx){
    const p=cmd?.payload||{},c=canonical(ctx.countryId);
    const rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!Array.isArray(bucket.importRequests))bucket.importRequests=[];
    if(!bucket.globalTradeLedger||typeof bucket.globalTradeLedger!=='object')bucket.globalTradeLedger={requests:[],decisions:[],settlements:[]};
    const idx=bucket.importRequests.findIndex(x=>String(x.requestId)===String(p.requestId));
    if(idx<0)return{accepted:false,reason:'TRADE_REQUEST_NOT_FOUND'};
    const req=clone(bucket.importRequests[idx]),wasSettled=String(req.status||'').toUpperCase()===TYPES.SETTLED;
    const nextStatus=p.status||TYPES.SETTLED,settlementId=String(p.settlementId||req.settlementId||'');
    if(wasSettled){
      if(settlementId&&settlementId===String(req.settlementId||'')){
        const priorImport=(bucket.importLedger||[]).find(x=>String(x?.settlementId||'')===settlementId);
        const requestedBuyerValue=num(p.buyerValue);
        const priorBuyerValue=num(priorImport?.totalValue);
        const expectedSellerValue=(num(req.quantity)||0)*(num(req.unitPrice)||0);
        const requestedSellerValue=num(p.sellerValue);
        const sameBuyerValue=requestedBuyerValue===null||priorBuyerValue===null||
          Math.abs(requestedBuyerValue-priorBuyerValue)<=1e-7;
        const sameSellerValue=requestedSellerValue===null||
          Math.abs(requestedSellerValue-expectedSellerValue)<=1e-7;
        const sameBuyerCurrency=!p.buyerCurrency||!priorImport?.currency||
          String(p.buyerCurrency).toUpperCase()===String(priorImport.currency).toUpperCase();
        const sameCounterparty=!p.sellerCountryId||canonical(p.sellerCountryId)===canonical(req.targetCountryId);
        if(!sameBuyerValue||!sameSellerValue||!sameBuyerCurrency||!sameCounterparty)
          return{accepted:false,reason:'TRADE_SETTLEMENT_IDEMPOTENCY_COLLISION',settlementId,
            requestId:req.requestId,expectedBuyerValue:priorBuyerValue,receivedBuyerValue:requestedBuyerValue,
            expectedSellerValue,receivedSellerValue:requestedSellerValue};
        return{accepted:true,duplicate:true,request:req,settlementId,balance:bucket.balance,importValue:bucket.importValue};
      }
      return{accepted:false,reason:'TRADE_REQUEST_ALREADY_SETTLED',requestId:req.requestId,settlementId:req.settlementId||null};
    }
    req.status=nextStatus;req.stage=p.stage||'SETTLED';req.settlementId=settlementId||null;req.settledTurn=nextStatus===TYPES.SETTLED?turn():null;
    bucket.importRequests[idx]=req;
    bucket.globalTradeLedger.settlements=[...(bucket.globalTradeLedger.settlements||[]),{settlementId,requestId:p.requestId,status:req.status,turn:turn(),periodId:'GAME_TURN_'+turn(),
      quantity:req.quantity,resourceId:req.resourceId,buyerCountryId:c,sellerCountryId:req.targetCountryId,supplier:req.targetCountryId,
      buyerValue:num(p.buyerValue)??num(req.totalValue)??((num(req.quantity)||0)*(num(req.unitPrice)||0)),
      sellerValue:num(p.sellerValue),buyerCurrency:p.buyerCurrency||null,sellerCurrency:p.sellerCurrency||null,fx:num(p.fx)}].slice(-MAX_HISTORY);
    if(nextStatus===TYPES.SETTLED&&!wasSettled){
      const buyerValue=num(p.buyerValue)??num(req.totalValue)??((num(req.quantity)||0)*(num(req.unitPrice)||0));
      if(buyerValue===null||buyerValue<0)return{accepted:false,reason:'BUYER_TRADE_VALUE_INVALID'};
      bucket.balance=(num(bucket.balance)||0)-buyerValue;
      bucket.importValue=(num(bucket.importValue)||0)+buyerValue;
      bucket.lastSettlementTurn=turn();
      const imports=Array.isArray(bucket.importLedger)?bucket.importLedger:[];
      bucket.importLedger=imports.concat([{settlementId,requestId:req.requestId,resourceId:req.resourceId,
        quantity:num(req.quantity)||0,totalValue:buyerValue,buyerValue,sellerValue:num(p.sellerValue),
        currency:p.buyerCurrency||null,buyerCurrency:p.buyerCurrency||null,sellerCurrency:p.sellerCurrency||null,fx:num(p.fx),
        sourceCountryId:req.targetCountryId,sellerCountryId:req.targetCountryId,buyerCountryId:c,counterpartyCountryId:req.targetCountryId,
        status:'SETTLED',turn:turn(),periodId:'GAME_TURN_'+turn()}]).slice(-MAX_HISTORY);
    }
    persistTradeBucket(ctx,bucket);
    return{accepted:true,request:req,balance:bucket.balance,importValue:bucket.importValue};
  }
  function recordInternationalShipmentHandler(cmd,ctx){
    const shipment=clone(cmd?.payload?.shipment||null),owner=canonical(ctx.countryId);
    if(!shipment||!String(shipment.shipmentId||'').trim()||
       !/^[A-Z]{3}$/.test(canonical(shipment.originCountryId))||
       !/^[A-Z]{3}$/.test(canonical(shipment.destinationCountryId))||
       canonical(shipment.originCountryId)===canonical(shipment.destinationCountryId)||
       !String(shipment.settlementId||'').trim()||!String(shipment.requestId||'').trim()||
       !String(shipment.resourceId||'').trim()||num(shipment.quantity)===null||num(shipment.quantity)<=0)
      return{accepted:false,reason:'INTERNATIONAL_SHIPMENT_RECORD_INVALID'};
    const origin=canonical(shipment.originCountryId),destination=canonical(shipment.destinationCountryId);
    if(owner!==origin&&owner!==destination)
      return{accepted:false,reason:'INTERNATIONAL_SHIPMENT_PARTICIPANT_SCOPE_INVALID',ownerCountryId:owner};
    const participantRole=owner===origin?'EXPORTER':'IMPORTER';
    const entry=Object.assign({},shipment,{originCountryId:origin,destinationCountryId:destination,
      participantCountryId:owner,participantRole});
    const raw=ctx.stateTransaction.get('trade.internationalShipmentLedger');
    const ledger=Array.isArray(raw)?clone(raw):[];
    const priorIndex=ledger.findIndex(row=>String(row?.shipmentId||'')===String(entry.shipmentId));
    if(priorIndex>=0){
      const prior=ledger[priorIndex];
      const immutable=['shipmentId','requestId','settlementId','resourceId','quantity','unit','originCountryId',
        'destinationCountryId'];
      const same=immutable.every(key=>{
        const a=prior[key],b=entry[key];
        if(key==='originCountryId'||key==='destinationCountryId')return canonical(a)===canonical(b);
        if(key==='quantity')return num(a)!==null&&num(b)!==null&&Math.abs(num(a)-num(b))<=1e-7;
        return String(a??'')===String(b??'');
      });
      if(!same)return{accepted:false,reason:'INTERNATIONAL_SHIPMENT_IDEMPOTENCY_COLLISION',shipmentId:entry.shipmentId};
      const allowed={
        status:{
          CREATED:['DISPATCHED','IN_TRANSIT','ARRIVED','FAILED','CANCELLED'],
          DISPATCHED:['IN_TRANSIT','CUSTOMS_CLEARANCE','ARRIVED','FAILED','INTERCEPTED','CANCELLED'],
          IN_TRANSIT:['CUSTOMS_CLEARANCE','ARRIVED','FAILED','INTERCEPTED','CANCELLED'],
          CUSTOMS_CLEARANCE:['IN_TRANSIT','ARRIVED','FAILED','INTERCEPTED','CANCELLED'],
          ARRIVED:[],FAILED:[],INTERCEPTED:[],CANCELLED:[]
        },
        arrivalStatus:{
          NOT_RECORDED:['PENDING','IN_TRANSIT','CUSTOMS_CLEARANCE','RECEIVED','FAILED'],
          UNKNOWN:['PENDING','IN_TRANSIT','CUSTOMS_CLEARANCE','RECEIVED','FAILED'],
          PENDING:['IN_TRANSIT','CUSTOMS_CLEARANCE','RECEIVED','FAILED'],
          IN_TRANSIT:['CUSTOMS_CLEARANCE','RECEIVED','FAILED'],
          CUSTOMS_CLEARANCE:['IN_TRANSIT','RECEIVED','FAILED'],
          RECEIVED:[],FAILED:[]
        },
        settlementStatus:{
          NOT_RECORDED:['PENDING','SETTLED','FAILED'],
          UNKNOWN:['PENDING','SETTLED','FAILED'],
          NOT_STARTED:['PENDING','SETTLED','FAILED'],
          PENDING:['SETTLED','FAILED','CANCELLED'],
          SETTLED:['REVERSED'],FAILED:[],CANCELLED:[],REVERSED:[]
        }
      };
      function canAdvance(field){
        const before=id(prior[field]||'NOT_RECORDED'),after=id(entry[field]||before);
        return before===after||(allowed[field][before]||[]).indexOf(after)>=0;
      }
      if(!canAdvance('status')||!canAdvance('arrivalStatus')||!canAdvance('settlementStatus'))
        return{accepted:false,reason:'INTERNATIONAL_SHIPMENT_LIFECYCLE_REGRESSION',shipmentId:entry.shipmentId};
      const stableWhenKnown=['dispatchTime','dispatchTurn','estimatedArrivalTime','etaTurn','arrivalTime','arrivalTurn','transportMode','routeId'];
      for(const key of stableWhenKnown){
        const before=prior[key],after=entry[key];
        if(before!==null&&before!==undefined&&before!==''&&after!==null&&after!==undefined&&after!==''&&
           String(before)!==String(after))
          return{accepted:false,reason:'INTERNATIONAL_SHIPMENT_EVIDENCE_REWRITE',shipmentId:entry.shipmentId,field:key};
      }
      const mutable=['status','arrivalStatus','settlementStatus','dispatchTime','dispatchTurn',
        'estimatedArrivalTime','etaTurn','arrivalTime','arrivalTurn','transportMode','routeId',
        'dispatchTimeEvidenceStatus','arrivalTimeEvidenceStatus'];
      let changed=false;
      mutable.forEach(key=>{
        const value=entry[key];
        if(value!==undefined&&value!==null&&value!==''&&(prior[key]===undefined||prior[key]===null||prior[key]==='')){
          prior[key]=value;changed=true;
        }else if(['status','arrivalStatus','settlementStatus'].includes(key)&&
          String(prior[key]||'').toUpperCase()!==String(value||'').toUpperCase()){
          prior[key]=value;changed=true;
        }
      });
      if(changed){
        prior.lastUpdatedTurn=turn();
        ledger[priorIndex]=prior;
        ctx.stateTransaction.set('trade.internationalShipmentLedger',ledger);
        return{accepted:true,updated:true,shipmentId:entry.shipmentId,participantRole,ledgerCount:ledger.length};
      }
      return{accepted:true,duplicate:true,shipmentId:entry.shipmentId,participantRole,ledgerCount:ledger.length};
    }
    ledger.push(entry);
    ctx.stateTransaction.set('trade.internationalShipmentLedger',ledger);
    return{accepted:true,duplicate:false,shipmentId:entry.shipmentId,participantRole,ledgerCount:ledger.length};
  }

  function sellerLedgerHandler(cmd,ctx){
    const p=cmd?.payload||{};
    const rawBucket=ctx.stateTransaction.get('trade');
    const bucket=rawBucket&&typeof rawBucket==='object'?clone(rawBucket):{};
    if(!bucket.globalTradeLedger||typeof bucket.globalTradeLedger!=='object')bucket.globalTradeLedger={requests:[],decisions:[],settlements:[]};
    const sid=String(p.settlementId||'').trim();
    if(String(p.status||'').toUpperCase()==='SETTLED'&&!sid)return{accepted:false,reason:'SELLER_SETTLEMENT_ID_REQUIRED'};
    const priorSettlement=(bucket.globalTradeLedger.settlements||[]).find(x=>
      String(x?.settlementId||'')===sid&&String(x?.status||'').toUpperCase()==='SETTLED');
    if(priorSettlement){
      const fields=['requestId','resourceId','buyerCountryId','buyerCurrency','sellerCurrency'];
      const sameFields=fields.every(key=>!priorSettlement[key]||!p[key]||
        String(priorSettlement[key]).toUpperCase()===String(p[key]).toUpperCase());
      const numericFields=['quantity','unitPrice','totalValue','buyerValue','fx'];
      const sameNumbers=numericFields.every(key=>num(priorSettlement[key])===null||num(p[key])===null||
        Math.abs(num(priorSettlement[key])-num(p[key]))<=1e-7);
      if(!sameFields||!sameNumbers)
        return{accepted:false,reason:'SELLER_SETTLEMENT_IDEMPOTENCY_COLLISION',settlementId:sid,
          requestId:p.requestId||null};
      return{accepted:true,duplicate:true,settlementId:sid,balance:bucket.balance,exportValue:bucket.exportValue};
    }
    if(String(p.status||'').toUpperCase()==='SETTLED'){
      const gross=num(p.totalValue);
      if(gross===null||gross<0)return{accepted:false,reason:'SELLER_TRADE_VALUE_INVALID'};
      bucket.balance=(num(bucket.balance)||0)+gross;
      bucket.exportValue=(num(bucket.exportValue)||0)+gross;
      bucket.lastSettlementTurn=turn();
      const exports=Array.isArray(bucket.exportLedger)?bucket.exportLedger:[];
      bucket.exportLedger=exports.concat([{settlementId:sid,requestId:p.requestId,resourceId:p.resourceId,
        quantity:num(p.quantity)||0,totalValue:gross,sellerValue:gross,buyerValue:num(p.buyerValue),
        currency:p.sellerCurrency||null,sellerCurrency:p.sellerCurrency||null,buyerCurrency:p.buyerCurrency||null,fx:num(p.fx),
        sellerCountryId:canonical(ctx.countryId),buyerCountryId:p.buyerCountryId||null,counterpartyCountryId:p.buyerCountryId||null,
        status:'SETTLED',turn:turn(),periodId:'GAME_TURN_'+turn()}]).slice(-MAX_HISTORY);
    }
    bucket.globalTradeLedger.settlements=[...(bucket.globalTradeLedger.settlements||[]),{...clone(p),sellerCountryId:canonical(ctx.countryId),
      periodId:'GAME_TURN_'+turn(),ledgerType:'SELLER_SETTLEMENT'}].slice(-MAX_HISTORY);
    persistTradeBucket(ctx,bucket);
    return{accepted:true,settlementId:sid,balance:bucket.balance,exportValue:bucket.exportValue};
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
    const mesh=interop();
    // Configure the authoritative ministry mesh before registration. Some runtime boot paths
    // import Global Trade before another subsystem configures the mesh, which would silently
    // leave counterpart review and settlement commands UNHANDLED.
    try{mesh?.configure?.({});}catch(e){handlerInstallReport.errors.push('MINISTRY_MESH_CONFIGURE_FAILED:'+String(e?.message||e));}
    const defs=[
      ['OMEGA_TRADE_CREATE_IMPORT_REQUEST','trade',createImportRequestHandler],
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
      ['OMEGA_TRADE_RECORD_INTERNATIONAL_SHIPMENT','trade',recordInternationalShipmentHandler],
      ['OMEGA_TRADE_APPLY_POLITICAL_PRESSURE','foreign',relationPressureHandler],
      ['OMEGA_TRADE_APPLY_MILITARY_PRESSURE','military',militaryPressureHandler]
    ];
    const report={ready:false,registered:0,total:defs.length,actionRegistrationWarnings:[],errors:[]};
    if(!mesh||typeof mesh.registerCommandHandler!=='function'){
      report.errors.push('MINISTRY_COMMAND_REGISTRY_UNAVAILABLE');handlerInstallReport=report;return false;
    }
    for(const [type,owner,handler] of defs){
      try{mesh.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_GLOBAL_TRADE'});}
      catch(e){report.actionRegistrationWarnings.push({type,reason:String(e?.message||e)});}
      try{mesh.registerCommandHandler(type,owner,handler);report.registered++;}
      catch(e){report.errors.push({type,owner,reason:String(e?.message||e)});}
    }
    report.ready=report.registered===report.total;handlerInstallReport=report;
    return report.ready;
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
      g.__OMEGA_LAST_TRADE_PROCESS_TRACE={requestId:req.requestId,buyer,seller,reviewStatus:result?.status||null,reviewResult:clone(result?.result||result||null)};
      if(result?.status==='APPLIED'){
        const d=result.result?.tradeDecision||result.tradeDecision;
        if(d?.decision==='WAITING_DATA')return;
        g.__OMEGA_LAST_TRADE_PROCESS_TRACE.reviewDecision=clone(d||null);
        const response=command('trade','OMEGA_TRADE_APPLY_BUYER_RESPONSE',buyer,{requestId:req.requestId,response:d});
        g.__OMEGA_LAST_TRADE_PROCESS_TRACE.responseStatus=response?.status||null;
        g.__OMEGA_LAST_TRADE_PROCESS_TRACE.responseResult=clone(response?.result||response||null);
        if(response?.status==='APPLIED'){
          const next=response.result?.request;
          g.__OMEGA_LAST_TRADE_PROCESS_TRACE.nextRequest=clone(next||null);
          if(String(next?.status||'').toUpperCase()==='ACCEPTED'){
            if(next.blackMarketDealId){const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;
              const transit=bm?.startTransit?.(next);if(transit?.accepted!==true)emit('OMEGA_TRADE_SETTLEMENT_FAILED',buyer,{requestId:next.requestId,blackMarketDealId:next.blackMarketDealId,reason:transit?.reason||'BLACK_MARKET_TRANSIT_START_FAILED'});
            }else settleRequest(next);
          }
          if(String(next?.status||'').toUpperCase()==='REJECTED'&&d?.decision==='REJECT')handleRejection(next,d);
        }
      }
      return;
    }
    if(status==='ACCEPTED'){
      if(req.blackMarketDealId){const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket;const transit=bm?.startTransit?.(req);
        if(transit?.accepted!==true)emit('OMEGA_TRADE_SETTLEMENT_FAILED',buyer,{requestId:req.requestId,blackMarketDealId:req.blackMarketDealId,reason:transit?.reason||'BLACK_MARKET_TRANSIT_START_FAILED'});
      }else settleRequest(req);
    }
  }

  function persistInternationalShipment(req,settlementId,batchTransfers,createdBatchIds,timing={}){
    const origin=canonical(req?.targetCountryId),destination=canonical(req?.countryId);
    if(!origin||!destination||origin===destination)return{accepted:false,reason:'INTERNATIONAL_SHIPMENT_COUNTRIES_INVALID'};
    const shipment={
      schemaVersion:1,
      shipmentId:'SHIP-'+String(settlementId),
      requestId:String(req.requestId||''),
      settlementId:String(settlementId||''),
      resourceId:String(req.resourceId||''),
      quantity:num(req.quantity),
      unit:(Array.isArray(batchTransfers)?batchTransfers.find(row=>row&&row.unit)?.unit:null)||null,
      originCountryId:origin,
      destinationCountryId:destination,
      transportMode:String(req.transportMode||'').trim()||null,
      routeId:String(req.routeId||'').trim()||null,
      dispatchTime:timing.dispatchTime||null,
      dispatchTurn:num(timing.dispatchTurn),
      estimatedArrivalTime:null,
      etaTurn:null,
      etaStatus:'NOT_ESTIMATED_ROUTE_TRAVEL_TIME_NOT_MODELED',
      arrivalTime:timing.arrivalTime||null,
      arrivalTurn:num(timing.arrivalTurn),
      arrivalStatus:'RECEIVED',
      settlementStatus:'SETTLED',
      status:'ARRIVED',
      sourceBatchIds:[...new Set((Array.isArray(batchTransfers)?batchTransfers:[])
        .flatMap(row=>[...(Array.isArray(row?.sourceBatchIds)?row.sourceBatchIds:[]),row?.sourceBatchId]
          .filter(Boolean).map(String)))],
      createdBatchIds:[...new Set((Array.isArray(createdBatchIds)?createdBatchIds:[]).map(String).filter(Boolean))],
      dispatchTimeEvidenceStatus:timing.dispatchTime?'OBSERVED_AT_RESOURCE_DEBIT':'LEGACY_TIMESTAMP_NOT_RECORDED',
      arrivalTimeEvidenceStatus:timing.arrivalTime?'OBSERVED_AT_BUYER_INVENTORY_RECEIPT':'LEGACY_TIMESTAMP_NOT_RECORDED'
    };
    const exporter=command('trade','OMEGA_TRADE_RECORD_INTERNATIONAL_SHIPMENT',origin,{shipment});
    if(!commandApplied(exporter))return{accepted:false,reason:'EXPORTER_SHIPMENT_LEDGER_WRITE_FAILED',detail:clone(exporter)};
    const importer=command('trade','OMEGA_TRADE_RECORD_INTERNATIONAL_SHIPMENT',destination,{shipment});
    if(!commandApplied(importer))return{accepted:false,reason:'IMPORTER_SHIPMENT_LEDGER_WRITE_FAILED',
      exporter:clone(exporter),detail:clone(importer)};
    return{accepted:true,shipmentId:shipment.shipmentId,exporter:clone(exporter),importer:clone(importer)};
  }

  function settleRequest(req){
    const c=canonical(req.countryId),s=canonical(req.targetCountryId);
    if(!c||!s)return;
    const bank=g.OmegaGovernmentBanking||g.Omega&&g.Omega.GovernmentBanking;
    const privateCompanyPurchase=!!(req.buyerCompanyId&&req.sellerCompanyId),
      lifecycle=g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1;
    if(!!req.buyerCompanyId!==!!req.sellerCompanyId){
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,reason:'PRIVATE_IMPORT_COMPANY_PAIR_INCOMPLETE'});return;
    }
    const useBank=!privateCompanyPurchase&&!!(bank&&typeof bank.prepareTradeSettlement==='function'&&typeof bank.commitTradeSettlement==='function');
    let sid=privateCompanyPurchase
      ?('SET-PRIVATE-'+c+'-'+s+'-'+String(req.requestId||'').replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,150))
      :useBank?('SET-'+c+'-'+s+'-'+String(req.requestId||'').replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,180))
      :'SET-'+turn()+'-'+c+'-'+s+'-'+String(req.requestId);

    // Recover a committed physical transfer even when the previous attempt failed before
    // request closure. The seller ledger is written only after the buyer stock credit succeeds.
    const priorSellerRows=countryValue(s,'trade.globalTradeLedger.settlements');
    const priorSellerSettlement=Array.isArray(priorSellerRows)?priorSellerRows.find(row=>
      String(row?.requestId||'')===String(req.requestId||'')&&
      String(row?.status||'').toUpperCase()==='SETTLED'&&
      canonical(row?.buyerCountryId)===c&&String(row?.resourceId||'')===String(req.resourceId||'')):null;
    if(priorSellerSettlement){
      sid=String(priorSellerSettlement.settlementId||sid);
      const buyerInventoryRows=countryValue(c,'resource.inventoryLedger');
      const priorBuyerImport=Array.isArray(buyerInventoryRows)?buyerInventoryRows.find(row=>
        String(row?.settlementId||'')===sid&&String(row?.type||'').toUpperCase()==='INTERNATIONAL_TRADE_IMPORT'):null;
      const importedQuantity=num(priorBuyerImport?.quantity);
      if(!priorBuyerImport||importedQuantity===null||Math.abs(importedQuantity-(num(req.quantity)||0))>1e-6){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:'TRADE_SETTLEMENT_RECOVERY_IMPORT_LEDGER_MISSING',recoverable:true});
        return;
      }
      const buyerValue=num(priorSellerSettlement.buyerValue)??num(priorBuyerImport.totalValue)??0;
      const sellerValue=num(priorSellerSettlement.totalValue)??((num(req.quantity)||0)*(num(req.unitPrice)||0));
      const batchTransfers=clone(priorBuyerImport.batchTransfers||[]);
      const createdBatchIds=clone(priorBuyerImport.createdBatchIds||[]);
      const recoveredShipment=persistInternationalShipment(req,sid,batchTransfers,createdBatchIds,{
        dispatchTime:priorSellerSettlement.dispatchTime||null,dispatchTurn:num(priorSellerSettlement.turn),
        arrivalTime:priorBuyerImport.createdAt||null,arrivalTurn:num(priorBuyerImport.turn)
      });
      if(!recoveredShipment.accepted){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:recoveredShipment.reason||'INTERNATIONAL_SHIPMENT_LEDGER_RECOVERY_FAILED',recoverable:true,detail:clone(recoveredShipment)});
        return;
      }
      const closeResult=command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:req.requestId,status:TYPES.SETTLED,
        stage:'SETTLED',settlementId:sid,buyerValue,sellerValue,sellerCountryId:s,
        buyerCurrency:priorSellerSettlement.buyerCurrency||currencyOf(c),
        sellerCurrency:priorSellerSettlement.sellerCurrency||currencyOf(s),
        fx:priorSellerSettlement.fx,recovered:true});
      g.__OMEGA_SETTLEMENT_TRACE={requestId:req.requestId,settlementId:sid,recoveredFromSellerLedger:true,
        close:clone(closeResult),sellerSettlement:clone(priorSellerSettlement)};
      if(!commandApplied(closeResult)){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:'TRADE_REQUEST_CLOSE_RECOVERY_FAILED',recoverable:true,detail:clone(closeResult)});
        return;
      }
      const sourceBatchIds=[...new Set(batchTransfers.flatMap(x=>[...(x.sourceBatchIds||[]),x.sourceBatchId].filter(Boolean).map(String)))];
      emit('OMEGA_TRADE_SHIPMENT_CREATED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,
        resourceId:req.resourceId,quantity:req.quantity,sourceCountryId:s,destinationCountryId:c,
        transferType:'TRADE',batchTransfers,sourceBatchIds,createdBatchIds,recovered:true});
      emit('OMEGA_TRADE_SETTLEMENT_COMPLETED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,
        resourceId:req.resourceId,quantity:req.quantity,totalValue:sellerValue,buyerValue,
        fx:priorSellerSettlement.fx||null,buyerCurrency:priorSellerSettlement.buyerCurrency||currencyOf(c),
        sellerCurrency:priorSellerSettlement.sellerCurrency||currencyOf(s),sourceCountryId:s,destinationCountryId:c,
        transferType:'TRADE',buyerCompanyId:req.buyerCompanyId||null,sellerCompanyId:req.sellerCompanyId||null,
        privateCompanyPurchase:!!(req.buyerCompanyId&&req.sellerCompanyId),
        batchTransfers,sourceBatchIds,createdBatchIds,recovered:true});
      return;
    }

    // Recovery after a prior attempt committed the banking journal but the request-closing
    // event did not finish. Never debit money or inventory a second time.
    const priorTxn=useBank&&typeof bank.getTransaction==='function'?bank.getTransaction(sid):null;
    const priorRow=priorTxn&&(priorTxn.result||priorTxn);
    if(useBank&&priorTxn&&String(priorTxn.status||priorRow.status||'').toUpperCase()==='SETTLED'){
      const buyerValue=num(priorRow.buyerTotalLocal)??num(priorRow.buyerDebitLocal)??0;
      const sellerValue=num(priorRow.sellerTotalLocal)??0;
      const batchTransfers=clone(priorRow.batchTransfers||[]);
      const createdBatchIds=clone(priorRow.createdBatchIds||[]);
      const sellerLedgerRecovery=command('trade','OMEGA_TRADE_RECORD_SELLER_SETTLEMENT',s,{
        settlementId:sid,requestId:req.requestId,buyerCountryId:c,resourceId:req.resourceId,
        quantity:req.quantity,unitPrice:req.unitPrice,totalValue:sellerValue,buyerValue,
        fx:priorRow.fx||null,buyerCurrency:priorRow.buyerCurrencyCode||currencyOf(c),
        sellerCurrency:priorRow.sellerCurrencyCode||currencyOf(s),status:'SETTLED',turn:turn()
      });
      g.__OMEGA_SETTLEMENT_TRACE.sellerLedgerRecovery=clone(sellerLedgerRecovery);
      if(!commandApplied(sellerLedgerRecovery)){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:'SELLER_SETTLEMENT_LEDGER_RECOVERY_FAILED',recoverable:true,detail:clone(sellerLedgerRecovery)});
        return;
      }
      const recoveredShipment=persistInternationalShipment(req,sid,batchTransfers,createdBatchIds,{
        dispatchTurn:num(priorRow.turn),arrivalTurn:num(priorRow.turn)
      });
      if(!recoveredShipment.accepted){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:recoveredShipment.reason||'INTERNATIONAL_SHIPMENT_LEDGER_RECOVERY_FAILED',recoverable:true,detail:clone(recoveredShipment)});
        return;
      }
      const closeRecovery=command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:req.requestId,status:TYPES.SETTLED,
        stage:'SETTLED',settlementId:sid,buyerValue,sellerValue,sellerCountryId:s,
        buyerCurrency:priorRow.buyerCurrencyCode||currencyOf(c),
        sellerCurrency:priorRow.sellerCurrencyCode||currencyOf(s),recovered:true});
      g.__OMEGA_SETTLEMENT_TRACE.closeRecovery=clone(closeRecovery);
      if(!commandApplied(closeRecovery)){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:'TRADE_REQUEST_CLOSE_RECOVERY_FAILED',recoverable:true,detail:clone(closeRecovery)});
        return;
      }
      const sourceBatchIds=[...new Set(batchTransfers.flatMap(x=>[...(x.sourceBatchIds||[]),x.sourceBatchId].filter(Boolean).map(String)))];
      emit('OMEGA_TRADE_SHIPMENT_CREATED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,blackMarketDealId:req.blackMarketDealId||null,
        resourceId:req.resourceId,quantity:req.quantity,sourceCountryId:s,destinationCountryId:c,transferType:'TRADE',
        batchTransfers,sourceBatchIds,createdBatchIds,recovered:true});
      emit('OMEGA_TRADE_SETTLEMENT_COMPLETED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,blackMarketDealId:req.blackMarketDealId||null,
        resourceId:req.resourceId,quantity:req.quantity,totalValue:sellerValue,buyerValue,
        fx:priorRow.fx||null,buyerCurrency:priorRow.buyerCurrencyCode||currencyOf(c),
        sellerCurrency:priorRow.sellerCurrencyCode||currencyOf(s),sourceCountryId:s,destinationCountryId:c,
        transferType:'TRADE',buyerCompanyId:req.buyerCompanyId||null,sellerCompanyId:req.sellerCompanyId||null,
        privateCompanyPurchase:!!(req.buyerCompanyId&&req.sellerCompanyId),
        batchTransfers,sourceBatchIds,createdBatchIds,recovered:true});
      g.__OMEGA_SETTLEMENT_TRACE={requestId:req.requestId,settlementId:sid,recovered:true};
      return;
    }

    const check=sellerCanSettle(req);
    g.__OMEGA_SETTLEMENT_TRACE={requestId:req.requestId,check:clone(check),settlementId:sid};
    if(!check.ok){
      command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:req.requestId,status:TYPES.FAILED,
        stage:'SETTLEMENT_BLOCKED',reason:check.reason,settlementId:sid});
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,reason:check.reason,targetCountryId:s,settlementId:sid});
      return;
    }

    let bankQuote=null,tariffPosted=false,privateTariffLocal=0,privateTariffUsd=0,privateReservation=null;
    if(privateCompanyPurchase){
      const policy=bank&&typeof bank.getCountryPolicy==='function'?bank.getCountryPolicy(c):null;
      const tariffPct=num(req.importTariffPct)??num(policy&&policy.importTariffPct);
      if(tariffPct===null||tariffPct<0||tariffPct>80){
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,reason:'PRIVATE_IMPORT_TARIFF_POLICY_UNOBSERVED_OR_INVALID'});return;
      }
      privateTariffLocal=Number((check.buyerTotal*tariffPct/100).toFixed(2));
      if(privateTariffLocal>0){
        const forex=g.OmegaForexMonetaryEngine||g.Omega&&g.Omega.ForexMonetaryEngine;
        const localPerUsd=check.buyerCurrency==='USD'?1:num(forex&&typeof forex.getRate==='function'?forex.getRate(check.buyerCurrency,'SIMULATION'):null);
        if(localPerUsd===null||localPerUsd<=0){
          emit('OMEGA_TRADE_SETTLEMENT_WAITING_FOR_FUNDS',c,{requestId:req.requestId,settlementId:sid,reason:'PRIVATE_IMPORT_TARIFF_FX_RATE_NOT_OBSERVED'});return;
        }
        privateTariffUsd=Number((privateTariffLocal/localPerUsd).toFixed(2));
      }
      const reserve=lifecycle&&typeof lifecycle.reservePrivateCompanyImport==='function'
        ?lifecycle.reservePrivateCompanyImport({settlementId:sid,buyerCountryId:c,sellerCountryId:s,
          buyerCompanyId:req.buyerCompanyId,sellerCompanyId:req.sellerCompanyId,buyerAmount:Number((check.buyerTotal+privateTariffLocal).toFixed(2)),
          buyerPurchaseAmount:check.buyerTotal,buyerTariffAmount:privateTariffLocal,sellerAmount:check.sellerTotal,
          buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,quantity:req.quantity,
          resourceId:req.resourceId,unitPrice:req.unitPrice})
        :{status:'BLOCKED',reason:'PRIVATE_COMPANY_PROCUREMENT_RUNTIME_UNAVAILABLE'};
      if(!['RESERVED','DUPLICATE','SETTLED'].includes(reserve.status)){
        emit('OMEGA_TRADE_SETTLEMENT_WAITING_FOR_FUNDS',c,{requestId:req.requestId,settlementId:sid,
          reason:reserve.reason||'PRIVATE_COMPANY_FUNDS_NOT_AVAILABLE',detail:clone(reserve)});return;
      }
      privateReservation=reserve.reservation||null;
      g.__OMEGA_SETTLEMENT_TRACE.privateCompanyReservation=clone(reserve);
    }
    if(useBank){
      bankQuote=bank.prepareTradeSettlement({
        authorization:'OMEGA_GLOBAL_TRADE',settlementId:sid,requestId:String(req.requestId),
        buyerCountryId:c,sellerCountryId:s,resourceId:req.resourceId,
        buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,
        buyerTotal:check.buyerTotal,sellerTotal:check.sellerTotal,
        paymentDelayTurns:num(req.paymentDelayTurns),importTariffPct:num(req.importTariffPct)
      });
      g.__OMEGA_SETTLEMENT_TRACE.bankQuote=clone(bankQuote);
      if(bankQuote&&(bankQuote.waiting||bankQuote.code==='PAYMENT_DELAYED')){
        emit('OMEGA_TRADE_PAYMENT_DELAYED',c,{requestId:req.requestId,settlementId:sid,targetCountryId:s,
          dueTurn:bankQuote.dueTurn,reason:bankQuote.code});
        return;
      }
      if(!bankQuote||bankQuote.ok!==true){
        const code=String(bankQuote&&bankQuote.code||'GOVERNMENT_BANKING_QUOTE_FAILED');
        if(['INSUFFICIENT_TREASURY','BUYER_TREASURY_UNAVAILABLE'].includes(code)){
          emit('OMEGA_TRADE_SETTLEMENT_WAITING_FOR_FUNDS',c,{requestId:req.requestId,settlementId:sid,reason:code,detail:clone(bankQuote)});
          return;
        }
        try{bank.cancelTradeSettlement?.(sid,code);}catch(_){}
        command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{requestId:req.requestId,status:TYPES.FAILED,
          stage:'BANKING_PREFLIGHT_REJECTED',reason:code,settlementId:sid});
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,reason:code,detail:clone(bankQuote)});
        return;
      }
    }

    const buyerDebitAmount=privateCompanyPurchase?Number((check.buyerTotal+privateTariffLocal).toFixed(2)):
      useBank?num(bankQuote.buyerDebitUsd):check.buyerTotal;
    const sellerCreditAmount=useBank?num(bankQuote.sellerCreditUsd):check.sellerTotal;
    const tariffUsd=privateCompanyPurchase?privateTariffUsd:(useBank?(num(bankQuote.tariffUsd)||0):0);
    function cancelBank(reason){if(useBank){try{bank.cancelTradeSettlement(sid,reason);}catch(_){}}}
    function cancelPrivate(reason){if(privateCompanyPurchase&&lifecycle&&typeof lifecycle.cancelPrivateCompanyImport==='function'){
      try{lifecycle.cancelPrivateCompanyImport({buyerCountryId:c,settlementId:sid,reason:reason||'TRADE_SETTLEMENT_ABORTED'});}catch(_){}
    }}
    function compensateBuyer(reason){
      if(privateCompanyPurchase){
        let tariffReversed=!tariffPosted;
        if(tariffPosted&&tariffUsd>0){
          const reverse=command('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{amount:tariffUsd,
            settlementId:sid+'-COMP-TARIFF',requestId:req.requestId,currency:'USD',reason:reason||'PRIVATE_TRADE_COMPENSATION'});
          tariffReversed=reverse?.status==='APPLIED'||reverse?.result?.duplicate===true;
          if(!tariffReversed)g.__OMEGA_SETTLEMENT_TRACE.tariffCompensation=clone(reverse);
        }
        cancelPrivate(reason);
        return{privateCompany:true,tariffReversed};
      }
      let tariffReversed=!tariffPosted;
      if(useBank&&tariffPosted&&tariffUsd>0){
        const reverse=command('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{
          amount:tariffUsd,settlementId:sid+'-COMP-TARIFF',requestId:req.requestId,currency:'USD',reason:reason||'TRADE_COMPENSATION'
        });
        tariffReversed=reverse?.status==='APPLIED';
        if(!tariffReversed)g.__OMEGA_SETTLEMENT_TRACE.tariffCompensation=clone(reverse);
      }
      // If reversing the separate tariff credit fails, refund only seller value to avoid
      // creating cash while retaining the customs credit. Otherwise refund the gross debit.
      const refundAmount=useBank
        ? (tariffReversed?buyerDebitAmount:(num(bankQuote.sellerCreditUsd)||0))
        : check.buyerTotal;
      const refund=command('finance','OMEGA_TRADE_FINANCE_CREDIT',c,{
        amount:refundAmount,settlementId:sid+'-COMP-BUYER-FIN',requestId:req.requestId,
        currency:useBank?'USD':check.buyerCurrency,reason:reason||'TRADE_COMPENSATION'
      });
      g.__OMEGA_SETTLEMENT_TRACE.buyerCompensation=clone(refund);
      return {tariffReversed,refund};
    }
    function reverseSellerResource(sellerResource){
      const auth={type:'TRADE_SETTLEMENT',settlementId:sid+'-COMP-SELLER-RES',requestId:req.requestId,
        sourceCountryId:c,destinationCountryId:s,
        buyerCompanyId:privateCompanyPurchase?req.sellerCompanyId:null,
        sellerCompanyId:privateCompanyPurchase?req.buyerCompanyId:null,
        batchTransfers:(sellerResource?.result?.batchTransfers||[]).map(x=>({...x,sourceCountryId:c,destinationCountryId:s}))};
      return command('resource','OMEGA_TRADE_RESOURCE_CREDIT',s,{
        resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-SELLER-RES',
        requestId:req.requestId,transferAuthorization:auth
      });
    }

    const debit=privateCompanyPurchase?{status:'APPLIED',result:{privateCompanyReservation:clone(privateReservation)}}:
      command('finance','OMEGA_TRADE_FINANCE_DEBIT',c,{
        amount:buyerDebitAmount,settlementId:sid,requestId:req.requestId,currency:useBank?'USD':check.buyerCurrency
      });
    g.__OMEGA_SETTLEMENT_TRACE.debit=clone(debit);
    if(debit?.status!=='APPLIED'&&debit?.result?.duplicate!==true){
      cancelBank(debit?.result?.reason||'BUYER_FINANCE_DEBIT_FAILED');
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:debit?.result?.reason||'BUYER_FINANCE_DEBIT_FAILED'});
      return;
    }
    if(privateCompanyPurchase&&tariffUsd>0){
      const tariff=command('finance','OMEGA_TRADE_FINANCE_CREDIT',c,{
        amount:tariffUsd,settlementId:sid+'-TARIFF',requestId:req.requestId,currency:'USD',reason:'PRIVATE_COMPANY_IMPORT_TARIFF'
      });
      g.__OMEGA_SETTLEMENT_TRACE.privateTariffCredit=clone(tariff);
      if(tariff?.status!=='APPLIED'&&tariff?.result?.duplicate!==true){
        cancelPrivate('PRIVATE_IMPORT_TARIFF_CREDIT_FAILED');
        emit('OMEGA_TRADE_SETTLEMENT_WAITING_FOR_FUNDS',c,{requestId:req.requestId,settlementId:sid,
          reason:'PRIVATE_IMPORT_TARIFF_TREASURY_CREDIT_FAILED',detail:clone(tariff)});return;
      }
      tariffPosted=true;
    }
    if(useBank&&tariffUsd>0){
      const tariff=command('finance','OMEGA_TRADE_FINANCE_CREDIT',c,{
        amount:tariffUsd,settlementId:sid+'-TARIFF',requestId:req.requestId,currency:'USD',reason:'IMPORT_TARIFF'
      });
      g.__OMEGA_SETTLEMENT_TRACE.tariffCredit=clone(tariff);
      if(tariff?.status!=='APPLIED'&&tariff?.result?.duplicate!==true){
        const refund=command('finance','OMEGA_TRADE_FINANCE_CREDIT',c,{
          amount:buyerDebitAmount,settlementId:sid+'-COMP-BUYER-FIN',requestId:req.requestId,
          currency:'USD',reason:'TARIFF_CREDIT_FAILED'
        });
        g.__OMEGA_SETTLEMENT_TRACE.buyerCompensation=clone(refund);
        cancelBank('IMPORT_TARIFF_CREDIT_FAILED');
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:'IMPORT_TARIFF_CREDIT_FAILED',compensated:refund?.status==='APPLIED'});
        return;
      }
      tariffPosted=true;
    }

    const transferAuthorization={type:'TRADE_SETTLEMENT',settlementId:sid,requestId:req.requestId,sourceCountryId:s,destinationCountryId:c,
      governmentContractId:req.governmentContractId||null,unitPrice:req.unitPrice,
      blackMarketDealId:req.blackMarketDealId||null,blackMarketPermitId:req.blackMarketPermitId||null,
      buyerCompanyId:privateCompanyPurchase?req.buyerCompanyId:null,
      sellerCompanyId:privateCompanyPurchase?req.sellerCompanyId:null};
    const shipmentDispatchTime=new Date().toISOString(),shipmentDispatchTurn=turn();
    const sellerResource=command('resource','OMEGA_TRADE_RESOURCE_DEBIT',s,{
      resourceId:req.resourceId,quantity:req.quantity,settlementId:sid,requestId:req.requestId,transferAuthorization
    });
    g.__OMEGA_SETTLEMENT_TRACE.sellerResource=clone(sellerResource);
    if(sellerResource?.status!=='APPLIED'&&sellerResource?.result?.duplicate!==true){
      compensateBuyer('SELLER_RESOURCE_DEBIT_FAILED');cancelBank('SELLER_RESOURCE_DEBIT_FAILED');
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:sellerResource?.result?.reason||'SELLER_RESOURCE_DEBIT_FAILED',compensated:true});return;
    }
    const sellerCredit=privateCompanyPurchase?{status:'APPLIED',result:{privateCompanyReceiptPending:true}}:
      command('finance','OMEGA_TRADE_FINANCE_CREDIT',s,{
        amount:sellerCreditAmount,settlementId:sid,requestId:req.requestId,currency:useBank?'USD':check.sellerCurrency
      });
    g.__OMEGA_SETTLEMENT_TRACE.sellerCredit=clone(sellerCredit);
    if(sellerCredit?.status!=='APPLIED'&&sellerCredit?.result?.duplicate!==true){
      const reverse=reverseSellerResource(sellerResource);
      g.__OMEGA_SETTLEMENT_TRACE.sellerResourceCompensation=clone(reverse);
      compensateBuyer('SELLER_FINANCE_CREDIT_FAILED');cancelBank('SELLER_FINANCE_CREDIT_FAILED');
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:'SELLER_FINANCE_CREDIT_FAILED',compensated:true});return;
    }
    const buyerAuth={...transferAuthorization,batchTransfers:clone(sellerResource?.result?.batchTransfers||[])};
    const buyerResource=command('resource','OMEGA_TRADE_RESOURCE_CREDIT',c,{
      resourceId:req.resourceId,quantity:req.quantity,settlementId:sid,requestId:req.requestId,transferAuthorization:buyerAuth
    });
    g.__OMEGA_SETTLEMENT_TRACE.buyerResource=clone(buyerResource);
    if(buyerResource?.status!=='APPLIED'&&buyerResource?.result?.duplicate!==true){
      const sellerDebit=privateCompanyPurchase?{status:'APPLIED',result:{privateCompanyReceiptNotPosted:true}}:
        command('finance','OMEGA_TRADE_FINANCE_DEBIT',s,{
          amount:sellerCreditAmount,settlementId:sid+'-COMP-SELLER-FIN',requestId:req.requestId,currency:useBank?'USD':check.sellerCurrency
        });
      g.__OMEGA_SETTLEMENT_TRACE.sellerFinanceCompensation=clone(sellerDebit);
      const reverse=reverseSellerResource(sellerResource);
      g.__OMEGA_SETTLEMENT_TRACE.sellerResourceCompensation=clone(reverse);
      compensateBuyer('BUYER_RESOURCE_CREDIT_FAILED');cancelBank('BUYER_RESOURCE_CREDIT_FAILED');
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:buyerResource?.result?.reason||'BUYER_RESOURCE_CREDIT_FAILED',compensated:true});return;
    }

    if(privateCompanyPurchase){
      const createdBatchIds=clone(buyerResource?.result?.createdBatchIds||[]);
      const receipts=createdBatchIds.map(batchId=>'WH-REC-'+batchId);
      const companySettlement=lifecycle&&typeof lifecycle.completePrivateCompanyImport==='function'
        ?lifecycle.completePrivateCompanyImport({settlementId:sid,buyerCountryId:c,sellerCountryId:s,
          buyerCompanyId:req.buyerCompanyId,sellerCompanyId:req.sellerCompanyId,resourceId:req.resourceId,quantity:req.quantity,
          buyerAmount:buyerDebitAmount,buyerPurchaseAmount:check.buyerTotal,buyerTariffAmount:privateTariffLocal,
          sellerAmount:check.sellerTotal,buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,
          batchTransfers:clone(sellerResource?.result?.batchTransfers||[]),createdBatchIds:createdBatchIds,deliveryReceiptIds:receipts,
          unitPrice:req.unitPrice})
        :{status:'BLOCKED',reason:'PRIVATE_COMPANY_PROCUREMENT_RUNTIME_UNAVAILABLE'};
      g.__OMEGA_SETTLEMENT_TRACE.privateCompanySettlement=clone(companySettlement);
      if(!['SETTLED','DUPLICATE'].includes(companySettlement.status)){
        const reverseBuyer=command('resource','OMEGA_TRADE_RESOURCE_DEBIT',c,{
          resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId,
          transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId,
            sourceCountryId:c,destinationCountryId:s,governmentContractId:null,
            buyerCompanyId:req.sellerCompanyId,sellerCompanyId:req.buyerCompanyId}
        });
        const reverseBuyerCredit=reverseBuyer?.status==='APPLIED'||reverseBuyer?.result?.duplicate===true
          ?command('resource','OMEGA_TRADE_RESOURCE_CREDIT',s,{
            resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId,
            transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId,
              sourceCountryId:c,destinationCountryId:s,buyerCompanyId:req.sellerCompanyId,sellerCompanyId:req.buyerCompanyId,
              batchTransfers:clone(reverseBuyer?.result?.batchTransfers||[])}
          }):{status:'FAILED',reason:'BUYER_RESOURCE_REVERSAL_DEBIT_FAILED'};
        g.__OMEGA_SETTLEMENT_TRACE.privateCompanyStockCompensation={debit:clone(reverseBuyer),credit:clone(reverseBuyerCredit)};
        compensateBuyer('PRIVATE_COMPANY_CASH_SETTLEMENT_FAILED');cancelBank('PRIVATE_COMPANY_CASH_SETTLEMENT_FAILED');
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:companySettlement.reason||'PRIVATE_COMPANY_CASH_SETTLEMENT_FAILED',
          compensated:(reverseBuyer?.status==='APPLIED'||reverseBuyer?.result?.duplicate===true)&&
            (reverseBuyerCredit?.status==='APPLIED'||reverseBuyerCredit?.result?.duplicate===true)});return;
      }
    }
    const batchTransfers=clone(sellerResource?.result?.batchTransfers||[]);
    const createdBatchIds=clone(buyerResource?.result?.createdBatchIds||[]);
    if(useBank){
      const bankCommit=bank.commitTradeSettlement({
        settlementId:sid,batchTransfers,createdBatchIds,requestId:req.requestId
      });
      g.__OMEGA_SETTLEMENT_TRACE.bankCommit=clone(bankCommit);
      if(!bankCommit||bankCommit.ok!==true){
        const reverseBuyer=command('resource','OMEGA_TRADE_RESOURCE_DEBIT',c,{
          resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId,
          transferAuthorization:{type:'TRADE_SETTLEMENT',settlementId:sid+'-COMP-BUYER-RES',requestId:req.requestId,sourceCountryId:c,destinationCountryId:s}
        });
        g.__OMEGA_SETTLEMENT_TRACE.buyerResourceCompensation=clone(reverseBuyer);
        const refundBuyer=compensateBuyer('GOVERNMENT_BANKING_COMMIT_FAILED');
        const reverseSellerCredit=command('finance','OMEGA_TRADE_FINANCE_DEBIT',s,{
          amount:sellerCreditAmount,settlementId:sid+'-COMP-SELLER-FIN',requestId:req.requestId,currency:'USD'
        });
        g.__OMEGA_SETTLEMENT_TRACE.sellerFinanceCompensation=clone(reverseSellerCredit);
        const reverseAuth={type:'TRADE_SETTLEMENT',settlementId:sid+'-COMP-SELLER-RES',requestId:req.requestId,
          sourceCountryId:c,destinationCountryId:s,batchTransfers:(reverseBuyer?.result?.batchTransfers||[]).map(x=>({...x,sourceCountryId:c,destinationCountryId:s}))};
        const reverseResource=command('resource','OMEGA_TRADE_RESOURCE_CREDIT',s,{
          resourceId:req.resourceId,quantity:req.quantity,settlementId:sid+'-COMP-SELLER-RES',requestId:req.requestId,transferAuthorization:reverseAuth
        });
        g.__OMEGA_SETTLEMENT_TRACE.sellerResourceCompensation=clone(reverseResource);
        cancelBank(bankCommit?.code||'GOVERNMENT_BANKING_COMMIT_FAILED');
        emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
          reason:bankCommit?.code||'GOVERNMENT_BANKING_COMMIT_FAILED',
          compensated:!!refundBuyer&&reverseSellerCredit?.status==='APPLIED',detail:clone(bankCommit)});return;
      }
    }

    const sellerLedgerResult=command('trade','OMEGA_TRADE_RECORD_SELLER_SETTLEMENT',s,{
      settlementId:sid,requestId:req.requestId,buyerCountryId:c,resourceId:req.resourceId,
      quantity:req.quantity,unitPrice:req.unitPrice,totalValue:check.sellerTotal,buyerValue:check.buyerTotal,
      fx:check.fx,buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,status:'SETTLED',turn:turn()
    });
    g.__OMEGA_SETTLEMENT_TRACE.sellerLedger=clone(sellerLedgerResult);
    if(!commandApplied(sellerLedgerResult)){
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:'SELLER_SETTLEMENT_LEDGER_POST_FAILED',recoverable:true,detail:clone(sellerLedgerResult)});
      return;
    }
    const shipmentArrivalTime=new Date().toISOString(),shipmentArrivalTurn=turn();
    const shipmentLedgerResult=persistInternationalShipment(req,sid,batchTransfers,createdBatchIds,{
      dispatchTime:shipmentDispatchTime,dispatchTurn:shipmentDispatchTurn,
      arrivalTime:shipmentArrivalTime,arrivalTurn:shipmentArrivalTurn
    });
    g.__OMEGA_SETTLEMENT_TRACE.shipmentLedger=clone(shipmentLedgerResult);
    if(!shipmentLedgerResult.accepted){
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:shipmentLedgerResult.reason||'INTERNATIONAL_SHIPMENT_LEDGER_WRITE_FAILED',recoverable:true,detail:clone(shipmentLedgerResult)});
      return;
    }
    const closeResult=command('trade','OMEGA_TRADE_CLOSE_REQUEST',c,{
      requestId:req.requestId,status:TYPES.SETTLED,stage:'SETTLED',settlementId:sid,
      buyerValue:check.buyerTotal,sellerValue:check.sellerTotal,sellerCountryId:s,
      buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,fx:check.fx
    });
    g.__OMEGA_SETTLEMENT_TRACE.close=clone(closeResult);
    if(!commandApplied(closeResult)){
      emit('OMEGA_TRADE_SETTLEMENT_FAILED',c,{requestId:req.requestId,settlementId:sid,
        reason:'TRADE_REQUEST_CLOSE_FAILED',recoverable:true,detail:clone(closeResult)});
      return;
    }
    const reservationId=req.reservationId;
    if(reservationId)command('cabinet','OMEGA_AUTO_RELEASE_RESERVATION',c,{reservationId,correlationId:req.requestId});
    const indNet=g.OmegaResourceIndustrialNetwork||g.Omega?.ResourceIndustrialNetwork;
    if(indNet&&typeof indNet.releaseBatchReservation==='function'){
      try{indNet.releaseBatchReservation(s,'TRADE:'+String(req.requestId||''),'SETTLED');}catch(_){}
    }
    const sourceBatchIds=[...new Set(batchTransfers.flatMap(x=>[...(x.sourceBatchIds||[]),x.sourceBatchId].filter(Boolean).map(String)))];
    emit('OMEGA_TRADE_SHIPMENT_CREATED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,blackMarketDealId:req.blackMarketDealId||null,
      resourceId:req.resourceId,quantity:req.quantity,sourceCountryId:s,destinationCountryId:c,
      transferType:'TRADE',batchTransfers,sourceBatchIds,createdBatchIds});
    emit('OMEGA_TRADE_SETTLEMENT_COMPLETED',c,{settlementId:sid,requestId:req.requestId,targetCountryId:s,blackMarketDealId:req.blackMarketDealId||null,
      resourceId:req.resourceId,quantity:req.quantity,totalValue:check.sellerTotal,buyerValue:check.buyerTotal,
      fx:check.fx,buyerCurrency:check.buyerCurrency,sellerCurrency:check.sellerCurrency,
      sourceCountryId:s,destinationCountryId:c,transferType:'TRADE',
      buyerCompanyId:req.buyerCompanyId||null,sellerCompanyId:req.sellerCompanyId||null,
      privateCompanyPurchase:privateCompanyPurchase,
      batchTransfers,sourceBatchIds,createdBatchIds});
    try{memory()?.record?.(c,{type:'RELATIONAL',sourceEvent:'OMEGA_TRADE_SETTLEMENT_COMPLETED',
      targetCountryId:s,action:'IMPORT',outcome:{status:'SETTLED'},importance:.9,confidence:.9,
      evidence:{settlementId:sid}});}catch(_){}
  }

  function handleRejection(req,decision){
    if(req?.blackMarketDealId){const runtime=g.OmegaBlackMarket||g.Omega?.BlackMarket;
      try{return runtime?.handleTradeRejection?.(req,decision)||{accepted:false,reason:'BLACK_MARKET_REJECTION_HANDLER_UNAVAILABLE'};}
      catch(e){return{accepted:false,reason:String(e?.message||e)};}}
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
  function processCountryRequests(countryId,maxRequests=MAX_HISTORY){
    const c=canonical(countryId),reqs=countryValue(c,'trade.importRequests');
    if(!c||!Array.isArray(reqs))return{status:'COMPLETED',countryId:c||null,requestCount:0};
    if(g.__omegaGlobalTradeProcessing)return{status:'SKIPPED',reason:'TRADE_PROCESSING_ALREADY_ACTIVE',countryId:c};
    g.__omegaGlobalTradeProcessing=true;
    let processed=0;
    try{
      const seen=new Set(),eligible=reqs.slice(-MAX_HISTORY).filter(req=>{
        const status=String(req?.status||'').toUpperCase(),stage=String(req?.stage||'').toUpperCase();
        if(status==='ACCEPTED')return true;
        if(status==='REJECTED'&&num(req?.nextRetryTurn)!==null&&turn()>=num(req.nextRetryTurn))return true;
        return status==='SENT'&&(/PENDING|OPEN|RETRY|PRESSURE/.test(stage)||stage==='COUNTERPARTY_DATA_PENDING');
      }).slice(0,Math.max(1,Math.min(MAX_HISTORY,Math.floor(num(maxRequests)||MAX_HISTORY))));
      for(const req of eligible){
        const key=String(c)+'::'+String(req.requestId);
        if(seen.has(key))continue;
        seen.add(key);
        processRequest(req);
        processed++;
      }
    }finally{g.__omegaGlobalTradeProcessing=false;}
    return{status:'COMPLETED',countryId:c,turn:turn(),requestCount:processed,
      eligibleCount:processed,requestLimit:Math.max(1,Math.min(MAX_HISTORY,Math.floor(num(maxRequests)||MAX_HISTORY)))};
  }
  function processScheduledCountry(countryId,context={}){
    const c=canonical(countryId),player=playerSimulationCountryId();
    if(!c)return{status:'SKIPPED',reason:'NPC_TRADE_COUNTRY_REQUIRED'};
    if(player&&c===player)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_HANDLED_BY_TRADE_TURN'};
    const token=String(num(context.turn)??turn())+':'+c;
    if(scheduledCountryTurns.has(token))return{status:'ALREADY_UPDATED',countryId:c,turn:turn(),requestCount:0};
    const result=processCountryRequests(c,MAX_AUTONOMOUS_REQUESTS_PER_COUNTRY_PER_TURN);
    if(result.status==='COMPLETED'){
      scheduledCountryTurns.set(token,true);
      if(scheduledCountryTurns.size>512)scheduledCountryTurns.delete(scheduledCountryTurns.keys().next().value);
    }
    return{...result,scheduled:true,playerCountryId:player,requestLimit:MAX_AUTONOMOUS_REQUESTS_PER_COUNTRY_PER_TURN};
  }
  function installSchedulerHandler(){
    const scheduler=g.Omega?.WorldSimulationScheduler||g.OmegaWorldSimulationScheduler||null;
    if(!scheduler||typeof scheduler.registerCountryHandler!=='function')return false;
    if(unregisterSchedulerHandler)return true;
    unregisterSchedulerHandler=scheduler.registerCountryHandler('omega.global-trade.country-autonomy',processScheduledCountry,
      {tiers:['ACTIVE','MACRO'],priority:80});
    return typeof unregisterSchedulerHandler==='function';
  }
  function processCountry(countryId){
    const selected=playerSimulationCountryId(),target=canonical(countryId||selected);
    if(!selected)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
    if(target!==selected)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_SCOPE_VIOLATION',countryId:target,playerCountryId:selected};
    return processPlayerCountryTurn();
  }
  function processPlayerCountryTurn(){
    const selected=playerSimulationCountryId();
    if(!selected)return{status:'SKIPPED',reason:'PLAYER_COUNTRY_NOT_SELECTED'};
    const token=String(turn())+':'+selected;
    if(g.__omegaGlobalTradeProcessedToken===token)return{status:'ALREADY_UPDATED',countryId:selected,turn:turn()};
    const result=processCountryRequests(selected);
    g.__omegaGlobalTradeProcessedToken=token;
    return result;
  }  function onTurn(){return processPlayerCountryTurn();}
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


  function policySnapshotForPair(buyerCountryId, sellerCountryId) {
    const buyer = canonical(buyerCountryId), seller = canonical(sellerCountryId);
    const relationRow = relation(buyer, seller);
    const treaty = countryEntry(countryValue(buyer, 'foreign.treaties'), seller);
    const bank = g.OmegaGovernmentBanking || g.Omega?.GovernmentBanking;
    let importTariffPct = num(countryValue(buyer, 'trade.importTariffPct') ??
      countryValue(buyer, 'trade.policy.importTariffPct') ??
      countryValue(buyer, 'trade.tradePolicy.importTariffPct'));
    try {
      const policy = bank?.getCountryPolicy?.(buyer);
      if (num(policy?.importTariffPct) !== null) importTariffPct = num(policy.importTariffPct);
    } catch (_) {}
    const foreignPolicy = countryValue(buyer, 'foreign.policy') ?? countryValue(buyer, 'foreign.foreignPolicy');
    const tradePolicy = countryValue(buyer, 'trade.policy') ?? countryValue(buyer, 'trade.tradePolicy');
    const activeTreaty = !!treaty && /SIGNED|RATIFIED|ACTIVE|IMPLEMENTED/.test(
      String(treaty.status || treaty.stage || '').toUpperCase());
    return {
      relationObserved: !!relationRow,
      relationScore: relationScore(relationRow),
      tradeAgreementActive: relationRow?.trade_agreement === true || activeTreaty,
      treatyType: treaty?.treatyType || null,
      treatyStatus: treaty?.status || treaty?.stage || null,
      warState: relationRow?.war_state === true,
      sanctions: relationRow?.sanctions === true,
      importTariffPct,
      foreignPolicy: typeof foreignPolicy === 'string' ? foreignPolicy : (foreignPolicy?.stance || foreignPolicy?.type || null),
      tradePolicy: typeof tradePolicy === 'string' ? tradePolicy : (tradePolicy?.stance || tradePolicy?.mode || null)
    };
  }

  function getWorldActivity(options={}) {
    const root = state() || {};
    const currentTurn = turn();
    const requestedLimit = Math.floor(num(options.limit) || 48);
    const requestedPerCountry = Math.floor(num(options.perCountry) || 12);
    const limit = Math.max(1, Math.min(249, requestedLimit));
    const perCountry = Math.max(1, Math.min(16, requestedPerCountry));
    if (!options.refresh && worldActivityCache && worldActivityCache.root === root &&
        worldActivityCache.turn === currentTurn && worldActivityCache.limit === limit &&
        worldActivityCache.perCountry === perCountry) return clone(worldActivityCache.value);

    const countryIds = ids().slice(0, 249);
    const summaries = [], records = [];
    let totalRequests = 0, totalDecisions = 0, totalSettlements = 0, countriesWithActivity = 0;
    for (const countryId of countryIds) {
      const requestsRaw = countryValue(countryId, 'trade.importRequests');
      const requests = Array.isArray(requestsRaw) ? requestsRaw.slice(-perCountry) : [];
      const ledger = countryValue(countryId, 'trade.globalTradeLedger') || {};
      const decisions = Array.isArray(ledger.decisions) ? ledger.decisions.slice(-perCountry) : [];
      const settlements = Array.isArray(ledger.settlements) ? ledger.settlements.slice(-perCountry) : [];
      const relations = countryValue(countryId, 'foreign.relations');
      const summary = {
        countryId,
        requestCount: Array.isArray(requestsRaw) ? requestsRaw.length : 0,
        decisionCount: Array.isArray(ledger.decisions) ? ledger.decisions.length : 0,
        settlementLedgerCount: Array.isArray(ledger.settlements) ? ledger.settlements.length : 0,
        requestSampleCount: requests.length,
        pendingRequestCount: requests.filter(row =>
          ['SENT','COUNTER_OFFERED','ACCEPTED','SETTLEMENT_PREPARING','PENDING_SETTLEMENT'].includes(String(row?.status || '').toUpperCase())).length,
        settledRequestCount: requests.filter(row =>
          String(row?.status || '').toUpperCase() === 'SETTLED').length,
        observedRelationCount: relations && typeof relations === 'object' ? Object.keys(relations).length : 0,
        lastActivityTurn: null,
        lastActivity: null,
        policy: null
      };
      totalRequests += summary.requestCount;
      totalDecisions += summary.decisionCount;
      totalSettlements += summary.settlementLedgerCount;
      let lastTurn = -1;
      const addRecord = (record, action) => {
        const recordTurn = num(record?.simulationTurn ?? record?.turn ?? record?.settledTurn ?? record?.createdTurn);
        if (recordTurn !== null && recordTurn >= lastTurn) {
          lastTurn = recordTurn;
          summary.lastActivityTurn = recordTurn;
          summary.lastActivity = action;
        }
      };
      for (const row of requests) {
        const status = String(row?.status || '').toUpperCase();
        if (!row || !row.requestId || ['CANCELLED','EXPIRED'].includes(status)) continue;
        const buyer = canonical(row.countryId || row.buyerCountryId || countryId);
        const seller = canonical(row.targetCountryId || row.sellerCountryId);
        const recordTurn = num(row.settledTurn ?? row.createdTurn ?? row.requestedTurn) ?? currentTurn;
        records.push({
          key: 'REQUEST:' + buyer + ':' + String(row.requestId),
          activityType:'TRADE_REQUEST', action:'IMPORT_REQUEST',
          status, turn:recordTurn, requestId:String(row.requestId),
          buyerCountryId:buyer, sellerCountryId:seller,
          countryId:buyer, counterpartyCountryId:seller,
          resourceId:row.resourceId || null, quantity:num(row.quantity),
          totalValue:num(row.totalValue), currency:row.currency || null,
          reason:row.rejectionReason || row.reason || null
        });
        addRecord({ ...row, turn:recordTurn }, 'IMPORT_REQUEST · ' + status);
      }
      for (const row of decisions) {
        if (!row || !row.requestId) continue;
        const buyer = canonical(row.buyerCountryId || row.countryId);
        const seller = countryId;
        const decision = String(row.decision || row.status || 'UNKNOWN').toUpperCase();
        const recordTurn = num(row.simulationTurn ?? row.turn) ?? currentTurn;
        records.push({
          key:'DECISION:' + seller + ':' + String(row.requestId) + ':' + recordTurn,
          activityType:'COUNTERPARTY_DECISION', action:'COUNTERPARTY_REVIEW',
          status:decision, turn:recordTurn, requestId:String(row.requestId),
          buyerCountryId:buyer, sellerCountryId:seller,
          countryId:seller, counterpartyCountryId:buyer,
          resourceId:row.resourceId || null, quantity:num(row.quantityApproved ?? row.quantity),
          totalValue:num(row.unitPrice) !== null && num(row.quantityApproved ?? row.quantity) !== null
            ? num(row.unitPrice) * num(row.quantityApproved ?? row.quantity) : null,
          currency:row.sellerCurrency || null, reason:row.reason || null
        });
        addRecord({ ...row, turn:recordTurn }, 'COUNTERPARTY_REVIEW · ' + decision);
      }
      for (const row of settlements) {
        if (!row || !row.settlementId) continue;
        const sellerSide = String(row.ledgerType || '').toUpperCase() === 'SELLER_SETTLEMENT' || !!row.buyerCountryId;
        const buyer = sellerSide ? canonical(row.buyerCountryId) : countryId;
        const seller = sellerSide ? countryId : canonical(row.supplier || row.sellerCountryId || row.targetCountryId);
        const recordTurn = num(row.turn ?? row.settledTurn ?? row.simulationTurn) ?? currentTurn;
        const status = String(row.status || 'UNKNOWN').toUpperCase();
        records.push({
          key:'SETTLEMENT:' + String(row.settlementId),
          activityType:'SETTLEMENT', action:sellerSide?'EXPORT_SETTLEMENT':'IMPORT_SETTLEMENT',
          status, turn:recordTurn, requestId:row.requestId || null,
          settlementId:String(row.settlementId),
          buyerCountryId:buyer, sellerCountryId:seller,
          countryId:sellerSide?seller:buyer, counterpartyCountryId:sellerSide?buyer:seller,
          resourceId:row.resourceId || null, quantity:num(row.quantity),
          totalValue:num(row.totalValue ?? row.buyerValue), buyerValue:num(row.buyerValue),
          currency:row.currency || row.sellerCurrency || row.buyerCurrency || null,
          reason:row.reason || null
        });
        addRecord({ ...row, turn:recordTurn }, 'SETTLEMENT · ' + status);
      }
      if (summary.requestCount || summary.decisionCount || summary.settlementLedgerCount) countriesWithActivity += 1;
      const player = playerSimulationCountryId();
      summary.policy = player && player !== countryId
        ? policySnapshotForPair(countryId, player)
        : {
            observedRelationCount: summary.observedRelationCount,
            importTariffPct: num(countryValue(countryId, 'trade.importTariffPct') ??
              countryValue(countryId, 'trade.policy.importTariffPct') ??
              countryValue(countryId, 'trade.tradePolicy.importTariffPct')),
            foreignPolicy: countryValue(countryId, 'foreign.policy')?.stance || countryValue(countryId, 'foreign.policy') || null,
            tradePolicy: countryValue(countryId, 'trade.policy')?.stance || countryValue(countryId, 'trade.policy') || null
          };
      summaries.push(summary);
    }
    const deduped = new Map();
    for (const row of records) {
      const old = deduped.get(row.key);
      if (!old) deduped.set(row.key, row);
      else deduped.set(row.key, {
        ...old, totalValue:old.totalValue ?? row.totalValue, buyerValue:old.buyerValue ?? row.buyerValue,
        currency:old.currency || row.currency, buyerCountryId:old.buyerCountryId || row.buyerCountryId,
        sellerCountryId:old.sellerCountryId || row.sellerCountryId,
        status:old.status === 'SETTLED' || row.status !== 'SETTLED' ? old.status : row.status
      });
    }
    const byRecency = [...deduped.values()].sort((a,b)=>b.turn-a.turn||String(a.key).localeCompare(String(b.key)));
    const countryCovered = new Set(), countryFirstRows = [];
    for (const row of byRecency) {
      const buyer = canonical(row.buyerCountryId), seller = canonical(row.sellerCountryId);
      if ((buyer && !countryCovered.has(buyer)) || (seller && !countryCovered.has(seller))) {
        countryFirstRows.push(row);
        if (buyer) countryCovered.add(buyer);
        if (seller) countryCovered.add(seller);
      }
    }
    const firstRowKeys = new Set(countryFirstRows.map(row=>row.key));
    const fairActivity = countryFirstRows.concat(byRecency.filter(row=>!firstRowKeys.has(row.key)));
    const ordered = fairActivity.slice(0,limit)
      .map(row=>({...row,policy:policySnapshotForPair(row.buyerCountryId,row.sellerCountryId)}));
    summaries.sort((a,b)=>(b.lastActivityTurn ?? -1)-(a.lastActivityTurn ?? -1)||a.countryId.localeCompare(b.countryId));
    const summary = {
      turn:currentTurn, countryCount:countryIds.length, countriesWithActivity,
      totalRequests, totalDecisions, totalSettlementLedgerRows:totalSettlements,
      pendingRequests:summaries.reduce((sum,row)=>sum+row.pendingRequestCount,0),
      settledRequests:summaries.reduce((sum,row)=>sum+row.settledRequestCount,0),
      scannedRecordsPerCountry:perCountry, returnedActivityCount:ordered.length,
      activityLimit:limit
    };
    // Normalize undefined fields before the first response and the cached response.
    // JSON-backed persistence drops undefined object members; both reads must return
    // the exact same stable shape without mutating any country ledger.
    const value = clone({ summary, countries:summaries, records:ordered });
    worldActivityCache = { root, turn:currentTurn, limit, perCountry, value };
    return clone(value);
  }

  function diagnostics(){
    let requests=0,pending=0,settled=0;
    for(const c of ids()){
      const arr=countryValue(c,'trade.importRequests');if(!Array.isArray(arr))continue;
      requests+=arr.length;
      for(const r of arr){const s=String(r.status||'').toUpperCase();if(s==='SETTLED')settled++;if(['SENT','ACCEPTED'].includes(s))pending++;}
    }
    return{version:VERSION,handlerInstalled:handlerInstallReport.ready,commandHandlersInstalled:handlerInstallReport.registered,
      commandHandlerCount:handlerInstallReport.total,handlerInstallErrors:clone(handlerInstallReport.errors),
      actionRegistrationWarnings:clone(handlerInstallReport.actionRegistrationWarnings),eventHooksInstalled:!!g.__omegaGlobalTradeTurnHook,
      worldCountryCount:ids().length,requests,pending,settled,settlementModel:'CROSS_MINISTRY_TWO_PHASE_COMPENSATING_LEDGER',
      schedulerHandlerRegistered:typeof unregisterSchedulerHandler==='function',
      autonomousCountryRequestCap:MAX_AUTONOMOUS_REQUESTS_PER_COUNTRY_PER_TURN,
      autonomousCountryTiers:['ACTIVE','MACRO'],durableInternationalShipmentLedger:true};
  }
  function init(){
    installHandlers();
    installSchedulerHandler();
    if(!g.__omegaGlobalTradeTurnHook){
      g.__omegaGlobalTradeTurnHook=true;
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
      g.addEventListener?.('OMEGA_READY',()=>{installHandlers();installSchedulerHandler();});
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',()=>{installHandlers();installSchedulerHandler();});
    }
    return diagnostics();
  }
  function processBlackMarketNetworkRequest(input={}){
    const buyer=canonical(input.buyerCountryId),requestId=String(input.requestId||''),dealId=String(input.dealId||''),permitId=String(input.permitId||'');
    if(!buyer||!requestId||!dealId||!permitId)return{accepted:false,reason:'BLACK_MARKET_NETWORK_REQUEST_SCOPE_INVALID'};
    const rows=countryValue(buyer,'trade.importRequests'),req=Array.isArray(rows)?rows.find(x=>String(x.requestId)===requestId):null;
    if(!req||String(req.blackMarketDealId||'')!==dealId||String(req.blackMarketPermitId||'')!==permitId)return{accepted:false,reason:'BLACK_MARKET_NETWORK_REQUEST_NOT_FOUND'};
    const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket,deal=bm?.getAuthorizedDeal?.(dealId,{buyerCountryId:buyer,sellerCountryId:req.targetCountryId,
      resourceId:req.resourceId,quantity:req.quantity,unitPrice:req.unitPrice,blackMarketPermitId:permitId});
    if(!deal||deal.autonomousNetwork!==true)return{accepted:false,reason:'BLACK_MARKET_NETWORK_AUTHORIZATION_REQUIRED'};
    if(['SETTLED','SETTLED_UNDER_INVESTIGATION','INTERCEPTED','FAILED','EXPIRED','IN_TRANSIT'].includes(String(deal.status||'').toUpperCase()))
      return{accepted:true,status:deal.status,skipped:true};
    processRequest(req);
    const nextRows=countryValue(buyer,'trade.importRequests'),next=Array.isArray(nextRows)?nextRows.find(x=>String(x.requestId)===requestId):null;
    const updated=bm?.getDeal?.(dealId,buyer);
    return{accepted:true,status:updated?.status||next?.status||'PROCESSING',request:clone(next||req),deal:clone(updated||deal)};
  }
  function settleBlackMarketTransit(input={}){
    const buyer=canonical(input.buyerCountryId),requestId=String(input.requestId||''),dealId=String(input.dealId||''),permitId=String(input.permitId||'');
    if(!buyer||!requestId||!dealId||!permitId)return{accepted:false,reason:'BLACK_MARKET_TRANSIT_SETTLEMENT_SCOPE_INVALID'};
    const rows=countryValue(buyer,'trade.importRequests'),req=Array.isArray(rows)?rows.find(x=>String(x.requestId)===requestId):null;
    if(!req||String(req.blackMarketDealId||'')!==dealId||String(req.blackMarketPermitId||'')!==permitId||String(req.status||'').toUpperCase()!=='ACCEPTED')
      return{accepted:false,reason:'BLACK_MARKET_TRANSIT_REQUEST_NOT_ACCEPTED'};
    const bm=g.OmegaBlackMarket||g.Omega?.BlackMarket,deal=bm?.getAuthorizedDeal?.(dealId,{buyerCountryId:buyer,sellerCountryId:req.targetCountryId,
      resourceId:req.resourceId,quantity:req.quantity,unitPrice:req.unitPrice,blackMarketPermitId:permitId});
    if(!deal||String(deal.status||'').toUpperCase()!=='IN_TRANSIT'||(buyer!==playerSimulationCountryId()&&deal.autonomousNetwork!==true))
      return{accepted:false,reason:'BLACK_MARKET_TRANSIT_AUTHORIZATION_INVALID'};
    settleRequest(req);
    const after=countryValue(buyer,'trade.importRequests'),closed=Array.isArray(after)?after.find(x=>String(x.requestId)===requestId):null;
    if(String(closed?.status||'').toUpperCase()!=='SETTLED')return{accepted:false,reason:String(closed?.stage||closed?.status||'BLACK_MARKET_SETTLEMENT_PENDING')};
    return{accepted:true,status:'SETTLED',settlementId:closed.settlementId||null,request:clone(closed)};
  }
  function createRequest(countryId,payload={}){
    installHandlers();
    const requestId=String(payload.requestId||('TRADE-'+turn()+'-'+canonical(countryId)+'-'+token(payload.resourceId||'RESOURCE')+'-'+Date.now()));
    const result=command('trade','OMEGA_TRADE_CREATE_IMPORT_REQUEST',countryId,{...clone(payload),requestId});
    return result&&['APPLIED','FAILED'].includes(String(result.status||''))&&result.result?result.result:result;
  }
  function createPrivateCompanyImportRequest(countryId,payload={}){
    const buyer=canonical(countryId||playerSimulationCountryId()),seller=canonical(payload.targetCountryId),
      resourceId=String(payload.resourceId||'').trim(),quantity=num(payload.quantity),
      buyerCompanyId=String(payload.buyerCompanyId||'').trim().toUpperCase(),
      sellerCompanyId=String(payload.sellerCompanyId||'').trim().toUpperCase(),
      lifecycle=g.OmegaPrivateEnterpriseLifecycleV1||g.Omega?.PrivateEnterpriseLifecycleV1,
      companyIds=Array.isArray(lifecycle?.companyIds)?lifecycle.companyIds.map(x=>String(x).toUpperCase()):[],
      market=g.OmegaGlobalMarket||g.Omega?.GlobalMarket;
    if(!buyer||buyer!==playerSimulationCountryId())return{accepted:false,reason:'PLAYER_COUNTRY_SCOPE_ONLY'};
    if(!seller||seller===buyer||!resourceId||quantity===null||quantity<=0)
      return{accepted:false,reason:'PRIVATE_IMPORT_REQUEST_FIELDS_INVALID'};
    if(!companyIds.includes(buyerCompanyId)||!companyIds.includes(sellerCompanyId))
      return{accepted:false,reason:'PRIVATE_IMPORT_COMPANY_ID_INVALID'};
    if(!market||typeof market.privateCompanySuppliers!=='function'||typeof market.quote!=='function'||typeof market.localPrice!=='function')
      return{accepted:false,reason:'PRIVATE_COMPANY_MARKET_SUPPLIER_RUNTIME_UNAVAILABLE'};
    const quote=market.quote(resourceId);
    if(String(quote?.status||'').toUpperCase()!=='CLEARED'||
       num(quote?.clearingPriceUsd)===null||num(quote?.clearingPriceUsd)<=0)
      return{accepted:false,reason:'EXECUTABLE_MARKET_CLEARING_PRICE_NOT_OBSERVED',quote:quote};
    const suppliers=market.privateCompanySuppliers(resourceId,quantity,buyer,sellerCompanyId,seller);
    const supplier=suppliers.find(row=>String(row.companyId||'').trim().toUpperCase()===sellerCompanyId);
    if(!supplier)return{accepted:false,reason:'PRIVATE_SELLER_COMPANY_HAS_NO_VERIFIED_MARKET_STOCK',
      sellerCountryId:seller,sellerCompanyId:sellerCompanyId,suppliers:suppliers};
    const marketUnitPrice=market.localPrice(seller,resourceId),requestedPrice=num(payload.unitPrice);
    if(marketUnitPrice===null||marketUnitPrice<=0)return{accepted:false,reason:'SELLER_LOCAL_MARKET_PRICE_NOT_OBSERVED'};
    const unitPrice=requestedPrice===null?marketUnitPrice:requestedPrice;
    if(unitPrice<=0)return{accepted:false,reason:'PRIVATE_IMPORT_UNIT_PRICE_INVALID'};
    return createRequest(buyer,{...clone(payload),targetCountryId:seller,resourceId:resourceId,
      quantity:quantity,unitPrice:unitPrice,buyerCompanyId:buyerCompanyId,sellerCompanyId:sellerCompanyId,
      source:'OMEGA_PRIVATE_COMPANY_PROCUREMENT',marketPriceEvidence:{
        status:quote.status,clearingPriceUsd:quote.clearingPriceUsd,unitPriceLocal:marketUnitPrice,
        currency:currencyOf(seller),marketTurn:quote.generatedTurn,companyAvailableStock:supplier.available,
        sourceBatchIds:supplier.sourceBatchIds,authority:'OMEGA_GLOBAL_MARKET_EXECUTABLE_CLEARING'
      }});
  }
  const API=Object.freeze({VERSION,TYPES,diagnostics,processAll,processCountry,processScheduledCountry,reviewRequest:sellerReviewDecision,
    getWorldActivity,processBlackMarketNetworkRequest,settleBlackMarketTransit,createRequest,createPrivateCompanyImportRequest,relationScore,marketPrice,inventory,currencyOf,fxRate,settlementValues});
  g.Omega=g.Omega||{};g.Omega.GlobalTrade=API;g.OmegaGlobalTrade=API;
  try{init();}catch(e){g.OmegaGlobalTradeError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);
