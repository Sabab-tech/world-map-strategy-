/* OMEGA NATIONAL ACCOUNTS FOUNDATION v1
 * Phase 4A: read-only evidence checkpoint; Economy owns only its own compact snapshot.
 */
(function (g) {
  'use strict';
  const VERSION='1.0.0', HANDLER_ID='omega.national-accounts.phase4a';
  const COMMAND_TYPE='OMEGA_NATIONAL_ACCOUNTS_CHECKPOINT';
  const runtime={initialized:false,ready:false,initPromise:null,error:null,rules:null,manifest:null,
    coreCountryIds:new Set(),profilesByIso3:new Map(),profileMetadata:null,commandHandlerRegistered:false,
    unregisterCountryHandler:null,processedCountries:0,skippedCountries:0,deferredCountries:0,
    failedCountries:0,lastProcessedTurn:null,lastCountryId:null,rootStateRef:null,
    initializedCountryIds:new Set(),dirtyCountryIds:new Set(),countrySourceVersions:new Map(),eventListeners:[],
    rootResets:0,sourceInvalidations:0,globalInvalidations:0,globalSourceVersion:0,unchangedCountries:0,
    yieldCount:0,lastSyncSegmentMs:null,maxSyncSegmentMs:0,totalSyncSegmentMs:0,
    lastCountryElapsedMs:null,maxCountryElapsedMs:0,totalCountryElapsedMs:0,
    lastSourceRowsScanned:0,maxSourceRowsScanned:0};
  const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:
    typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
  const norm=v=>String(v??'').normalize('NFKC').trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');
  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);for(const k of Object.keys(v)){
      if(k==='__proto__'||k==='constructor')continue;
      if(v[k]!==undefined&&typeof v[k]!=='function')o[k]=clone(v[k],seen);
    }return o;
  };
  const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):
    Array.isArray(v)?'['+v.map(stable).join(',')+']':
    '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
  const fingerprint=v=>{let h=2166136261,s=stable(v);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return('00000000'+(h>>>0).toString(16)).slice(-8);};
  const near=(a,b,abs,rel)=>Math.abs(a-b)<=Math.max(abs,Math.max(Math.abs(a),Math.abs(b))*rel);
  const bounded=(v,fallback,max)=>Math.max(1,Math.min(max,Math.floor(finite(v)??fallback)));
  const clockNow=()=>{try{const n=Number(g.performance?.now?.());if(Number.isFinite(n))return n;}catch(_){}return Date.now();};
  const MAX_ROWS_PER_SYNC_SLICE=512;
  function recordSyncSegment(startedAt){
    const elapsed=Math.max(0,clockNow()-startedAt);
    runtime.lastSyncSegmentMs=elapsed;runtime.maxSyncSegmentMs=Math.max(runtime.maxSyncSegmentMs,elapsed);
    runtime.totalSyncSegmentMs+=elapsed;
  }
  function yieldToBrowser(){
    runtime.yieldCount++;
    return new Promise(resolve=>{
      if(typeof g.requestIdleCallback==='function'){
        try{g.requestIdleCallback(()=>resolve(),{timeout:60});return;}catch(_){}
      }
      if(typeof g.setTimeout==='function'){g.setTimeout(resolve,0);return;}
      Promise.resolve().then(resolve);
    });
  }
  const SOURCE_CHANGE_EVENTS=Object.freeze([
    'OMEGA_FINANCE_STATE_UPDATED',
    'OMEGA_TRADE_REQUEST_CREATED','OMEGA_TRADE_REQUEST_ACCEPTED','OMEGA_TRADE_REQUEST_REJECTED',
    'OMEGA_TRADE_COUNTER_OFFERED','OMEGA_TRADE_REQUEST_RETRY_CREATED','OMEGA_TRADE_SETTLEMENT_COMPLETED',
    'OMEGA_RESOURCE_BATCH_CREATED','OMEGA_RESOURCE_INVENTORY_CHANGED','OMEGA_RESOURCE_ECONOMY_UPDATED','OMEGA_RESOURCE_EXTRACTION_COMPLETED',
    'OMEGA_RESOURCE_IMPORT_COMPLETED','OMEGA_RESOURCE_EXPORT_COMPLETED','OMEGA_RESOURCE_CONSUMPTION_COMPLETED',
    'RESOURCE_STATE_UPDATED','OMEGA_RESOURCE_PROCESSING_COMPLETED','OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',
    'OMEGA_RESOURCE_FINISHED_GOODS_AVAILABLE','OMEGA_RESOURCE_FINISHED_GOODS_ECONOMY_REGISTERED',
    'OMEGA_INDUSTRIAL_RUNTIME_PUBLISHED','OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',
    'OMEGA_RESOURCE_MINE_WAREHOUSE_RECEIPT_POSTED','OMEGA_RESOURCE_DELIVERY_COMPLETED',
    'OMEGA_FACTORY_INPUT_SHIPMENT_DELIVERED','OMEGA_FACTORY_PRODUCTION_CYCLE_COMPLETED',
    'OMEGA_FACTORY_UTILITY_CONSUMED','OMEGA_FACTORY_CAPACITY_CHANGED','OMEGA_RESOURCE_MINE_CAPACITY_CHANGED',
    'OMEGA_PRIVATE_ENTERPRISE_LIFECYCLE_CHANGED',
    'OMEGA_RESOURCE_BUYER_ORDER_SETTLED'
  ]);
  function syncRootState(root){
    if(!isObject(root))return;
    if(runtime.rootStateRef&&runtime.rootStateRef!==root){
      runtime.initializedCountryIds.clear();runtime.dirtyCountryIds.clear();runtime.rootResets++;
    }
    runtime.rootStateRef=root;
  }
  function eventCountryIds(event){
    const detail=isObject(event?.detail)?event.detail:{},payload=isObject(detail.payload)?detail.payload:detail;
    const values=[detail.countryId,detail.countryCode,detail.iso3,detail.sourceCountryId,
      detail.targetCountryId,detail.destinationCountryId,detail.sellerCountryId,detail.buyerCountryId,
      payload.countryId,payload.countryCode,payload.iso3,payload.sourceCountryId,
      payload.targetCountryId,payload.destinationCountryId,payload.sellerCountryId,payload.buyerCountryId];
    const ids=new Set();
    for(const value of values){const id=canonicalIso3(value);if(id&&runtime.coreCountryIds.has(id))ids.add(id);}
    return [...ids];
  }
  function invalidateFromSourceEvent(event){
    const ids=eventCountryIds(event);
    if(!ids.length){
      runtime.initializedCountryIds.clear();runtime.dirtyCountryIds.clear();runtime.globalInvalidations++;
      runtime.globalSourceVersion++;return;
    }
    for(const id of ids){
      runtime.dirtyCountryIds.add(id);
      runtime.countrySourceVersions.set(id,(runtime.countrySourceVersions.get(id)||0)+1);
      runtime.sourceInvalidations++;
    }
  }
  function installSourceInvalidationListeners(){
    if(typeof g.addEventListener!=='function'||runtime.eventListeners.length)return;
    for(const type of SOURCE_CHANGE_EVENTS){
      const handler=event=>invalidateFromSourceEvent(event);
      g.addEventListener(type,handler);runtime.eventListeners.push({type,handler});
    }
  }

  function reconcileTreasury(input={},options={}){
    const opening=finite(input.openingCash),inflows=finite(input.inflows),outflows=finite(input.outflows),closing=finite(input.closingCash);
    const values=[opening,inflows,outflows,closing];
    if(values.some(v=>v===null))return{status:values.every(v=>v===null)?'UNOBSERVED':'PARTIAL',
      openingCash:opening,inflows,outflows,closingCash:closing,expectedClosingCash:null,variance:null,
      reason:'OPENING_OR_FLOW_COMPONENTS_UNOBSERVED'};
    if(values.some(v=>v<0))return{status:'INVALID_INPUT',openingCash:opening,inflows,outflows,closingCash:closing,
      expectedClosingCash:null,variance:null,reason:'NEGATIVE_CASH_COMPONENT'};
    const expected=opening+inflows-outflows,variance=closing-expected;
    const ok=near(expected,closing,finite(options.absoluteTolerance)??0.01,finite(options.relativeTolerance)??0.00000001);
    return{status:ok?'RECONCILED':'UNRECONCILED',openingCash:opening,inflows,outflows,closingCash:closing,
      expectedClosingCash:expected,variance,reason:ok?null:'TREASURY_STOCK_FLOW_MISMATCH'};
  }

  function reconcileGoodsFlow(rows=[],options={}){
    if(!Array.isArray(rows)||!rows.length)return{status:'UNOBSERVED',items:[],reconciledCount:0,partialCount:0,failedCount:0};
    const groups=new Map(),fields=['openingQuantity','production','imports','consumption','exports','losses','closingQuantity'];
    for(const row of rows){if(!isObject(row))continue;
      const resourceId=String(row.resourceId||row.productId||'').trim(),unit=String(row.unit||'').trim();
      if(!resourceId||!unit)continue;const key=resourceId+'\u0000'+unit;
      const group=groups.get(key)||{resourceId,unit,rows:[]};group.rows.push(row);groups.set(key,group);
    }
    const abs=finite(options.absoluteTolerance)??0.000001,rel=finite(options.relativeTolerance)??0.00000001;
    const items=[];let reconciledCount=0,partialCount=0,failedCount=0;
    for(const group of groups.values()){
      const totals=Object.fromEntries(fields.map(k=>[k,0])),missing=new Set();
      for(const row of group.rows)for(const field of fields){const value=finite(row[field]);if(value===null)missing.add(field);else totals[field]+=value;}
      if(missing.size){partialCount++;items.push(Object.assign({resourceId:group.resourceId,unit:group.unit,status:'PARTIAL',
        missingComponents:[...missing].sort(),expectedClosingQuantity:null,variance:null},totals));continue;}
      if(Object.values(totals).some(v=>v<0)){failedCount++;items.push(Object.assign({resourceId:group.resourceId,unit:group.unit,
        status:'INVALID_INPUT',missingComponents:[],expectedClosingQuantity:null,variance:null},totals));continue;}
      const expected=totals.openingQuantity+totals.production+totals.imports-totals.consumption-totals.exports-totals.losses;
      const variance=totals.closingQuantity-expected,ok=near(expected,totals.closingQuantity,abs,rel);
      if(ok)reconciledCount++;else failedCount++;
      items.push(Object.assign({resourceId:group.resourceId,unit:group.unit,status:ok?'RECONCILED':'UNRECONCILED',
        missingComponents:[],expectedClosingQuantity:expected,variance},totals));
    }
    if(!items.length)return{status:'UNOBSERVED',items:[],reconciledCount:0,partialCount:0,failedCount:0};
    return{status:failedCount?'UNRECONCILED':partialCount?'PARTIAL':'RECONCILED',
      items,reconciledCount,partialCount,failedCount};
  }

  function reconcileGDP(approaches={},options={}){
    const names=['production','expenditure','income'];
    const rows=names.map(name=>{const raw=isObject(approaches[name])?approaches[name]:{},value=finite(raw.value),
      currency=String(raw.currency||'').trim().toUpperCase(),period=String(raw.period||'').trim();
      return{name,value,currency:currency||null,period:period||null,
        complete:raw.complete===true&&value!==null&&!!currency&&!!period};});
    const complete=rows.filter(row=>row.complete);
    if(!complete.length)return{status:'UNOBSERVED',value:null,currency:null,period:null,approaches:rows,reason:'NO_COMPLETE_GDP_APPROACH'};
    if(complete.length!==3)return{status:'PARTIAL',value:null,currency:null,period:null,approaches:rows,reason:'ALL_THREE_APPROACHES_REQUIRED'};
    const first=complete[0];
    if(complete.some(row=>row.currency!==first.currency||row.period!==first.period))
      return{status:'UNRECONCILED',value:null,currency:null,period:null,approaches:rows,reason:'GDP_APPROACH_BASIS_MISMATCH'};
    const min=Math.min(...complete.map(row=>row.value)),max=Math.max(...complete.map(row=>row.value));
    const ok=near(min,max,finite(options.absoluteTolerance)??1,finite(options.relativeTolerance)??0.005);
    return{status:ok?'RECONCILED':'UNRECONCILED',
      value:ok?complete.reduce((sum,row)=>sum+row.value,0)/3:null,currency:first.currency,period:first.period,
      approaches:rows,difference:max-min,reason:ok?null:'GDP_APPROACH_VARIANCE'};
  }

  function rootState(context={}){
    const candidates=[context?.state,g.Omega?.Simulation?.world?.state,g.Omega?.World?.state,g.Game?.state,g.gameState];
    return candidates.find(isObject)||null;
  }
  function currentTurn(context={}){const root=rootState(context);
    for(const candidate of [context.turn,root?.simulation?.turn,root?.simulation?.currentTurn,g.Omega?.Simulation?.clock?.turn,root?.turn]){
      const n=finite(candidate);if(n!==null)return Math.max(0,Math.floor(n));
    }return 0;
  }
  function canonicalIso3(value){
    const raw=String(value??'').trim();if(!raw)return null;
    const finance=g.OmegaFinanceMinistry||g.Omega?.FinanceMinistry;
    try{const p=finance?.resolveCountry?.(raw),iso=String(p?.iso3||'').trim().toUpperCase();if(/^[A-Z]{3}$/.test(iso))return iso;}catch(_){}
    return/^[A-Z]{3}$/.test(raw.toUpperCase())?raw.toUpperCase():null;
  }
  function findProfile(value){const id=canonicalIso3(value);return id?runtime.profilesByIso3.get(id)||null:null;}
  function countryRecord(root,domain,profile,countryId){
    const section=root?.[domain];if(!isObject(section))return null;
    const direct=[countryId,profile?.iso3,profile?.countryCode,profile?.economyKey,
      profile?.populationKey,profile?.name,profile?.officialName].filter(Boolean);
    for(const key of direct){const value=section[key];if(isObject(value))return value;}
    const aliases=new Set(direct.map(norm));
    for(const [key,value] of Object.entries(section))if(aliases.has(norm(key))&&isObject(value))return value;
    return null;
  }
  async function fetchJson(file){
    const fetcher=typeof g.fetchResilient==='function'?g.fetchResilient:g.fetch;
    if(typeof fetcher!=='function')throw new Error('NATIONAL_ACCOUNTS_FETCH_UNAVAILABLE:'+file);
    const response=await fetcher.call(g,file,{cache:'no-store'});
    if(!response||response.ok===false)throw new Error('NATIONAL_ACCOUNTS_DATA_FETCH_FAILED:'+file);
    return typeof response.json==='function'?response.json():response;
  }
  async function loadInputs(){
    const finance=g.OmegaFinanceMinistry||g.Omega?.FinanceMinistry;
    if(!finance||typeof finance.getProfiles!=='function'||typeof finance.resolveCountry!=='function')
      throw new Error('NATIONAL_ACCOUNTS_FINANCE_PROFILE_API_UNAVAILABLE');
    if(typeof finance.init==='function')await finance.init();
    const [rules,manifest]=await Promise.all([
      fetchJson('./national_accounts_rules_v1.json'),fetchJson('./minister_country_roster_manifest_v1.json')]);
    if(!isObject(rules)||!isObject(manifest)||!isObject(manifest.countries))throw new Error('NATIONAL_ACCOUNTS_REGISTRY_INVALID');
    const ids=Object.keys(manifest.countries).map(v=>v.trim().toUpperCase()).filter(v=>/^[A-Z]{3}$/.test(v));
    const expected=Math.floor(finite(rules.roster?.expectedCoreCountryCount)??197);
    if(ids.length!==expected||new Set(ids).size!==expected)throw new Error('NATIONAL_ACCOUNTS_CORE_ROSTER_COUNT_MISMATCH');
    const profiles=finance.getProfiles();if(!Array.isArray(profiles))throw new Error('NATIONAL_ACCOUNTS_FINANCE_PROFILES_UNAVAILABLE');
    runtime.rules=rules;runtime.manifest=manifest;runtime.coreCountryIds=new Set(ids);runtime.profilesByIso3=new Map();
    for(const profile of profiles){const id=String(profile?.iso3||'').trim().toUpperCase();if(id)runtime.profilesByIso3.set(id,profile);}
    runtime.profileMetadata=typeof finance.getProfileMetadata==='function'?finance.getProfileMetadata():null;
  }
  function classifyFinanceLedger(rows){
    const categories={fiscalExpense:0,financing:0,debtService:0,internalTransfer:0,policyOrMemo:0,
      externalCash:0,unclassified:0,duplicateIds:0,missingIds:0},seen=new Set(),list=Array.isArray(rows)?rows:[];
    for(const row of list){if(!isObject(row))continue;const id=String(row.transactionId||'').trim();
      if(!id)categories.missingIds++;else if(seen.has(id))categories.duplicateIds++;else seen.add(id);
      const action=String(row.action||'').trim().toUpperCase();
      if(['EXPENSE','EXPENSE_ROLLBACK'].includes(action))categories.fiscalExpense++;
      else if(['BORROW','DEBT_REPAYMENT'].includes(action))categories.financing++;
      else if(action==='WORLD_BANK_DEBT_SERVICE')categories.debtService++;
      else if(['BUDGET_TRANSFER_IN','BUDGET_TRANSFER_OUT'].includes(action))categories.internalTransfer++;
      else if(/^(TAX_POLICY_CHANGED|POLICY_RATE_CHANGED|RESERVE_POLICY_CHANGED|BUDGET_SHARE_CHANGED|FISCAL_YEAR_ROLLOVER)$/.test(action))categories.policyOrMemo++;
      else if(/^EXTERNAL_TREASURY_(CREDIT|DEBIT)$/.test(action))categories.externalCash++;
      else categories.unclassified++;
    }
    return{recordCount:list.length,categories,coverage:list.length?'BOUNDED_LEDGER_WINDOW':'UNOBSERVED'};
  }
  function groupTradeValues(entries,settledIds,direction){
    const sums=new Map();for(const row of Array.isArray(entries)?entries:[]){
      const id=String(row?.settlementId||'').trim(),currency=String(row?.currency||'').trim().toUpperCase(),value=finite(row?.totalValue);
      if(!id||!settledIds.has(id)||!currency||value===null||value<0)continue;
      sums.set(currency,(sums.get(currency)||0)+value);
    }
    return[...sums.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([currency,totalValue])=>({direction,currency,totalValue}));
  }
  function summarizeTrade(bucket,maxRows,maxRequests){
    const ledger=isObject(bucket?.globalTradeLedger)?bucket.globalTradeLedger:{};
    const rows=Array.isArray(ledger.settlements)?ledger.settlements.slice(-maxRows):[];
    const settled=rows.filter(row=>String(row?.status||'').toUpperCase()==='SETTLED' && String(row?.settlementId||'').trim());
    const ids=new Set(settled.map(row=>String(row?.settlementId||'').trim()).filter(Boolean));
    const imports=Array.isArray(bucket?.importLedger)?bucket.importLedger.slice(-maxRows):[];
    const exports=Array.isArray(bucket?.exportLedger)?bucket.exportLedger.slice(-maxRows):[];
    const requests=Array.isArray(bucket?.importRequests)?bucket.importRequests.slice(-maxRequests):[];
    const importValues=groupTradeValues(imports,ids,'IMPORT'),exportValues=groupTradeValues(exports,ids,'EXPORT');
    const pendingRequestCount=requests.filter(row=>!['SETTLED','CANCELLED','REJECTED'].includes(String(row?.status||'').toUpperCase())).length;
    return{settlementCount:settled.length,settlementRowsObserved:rows.length,
      importLedgerRowsObserved:imports.length,exportLedgerRowsObserved:exports.length,
      importValueByCurrency:importValues,exportValueByCurrency:exportValues,
      monetaryValueCoverage:importValues.length||exportValues.length?'SETTLED_VALUE_OBSERVED_BY_CURRENCY':'UNOBSERVED',
      pendingRequestCount,pendingRequestRowsObserved:requests.length,
      pendingRequestCoverage:requests.length?(Array.isArray(bucket?.importRequests)&&bucket.importRequests.length>requests.length?'BOUNDED_LAST_N_RECORDS':'FULL_SOURCE_WINDOW'):'UNOBSERVED',
      pendingRequestWindowTruncated:Array.isArray(bucket?.importRequests)&&bucket.importRequests.length>requests.length,
      rowsScanned:rows.length+imports.length+exports.length+requests.length};
  }
  async function summarizeInventory(bucket,maxBatches,maxItems){
    const batches=Array.isArray(bucket?.batches)?bucket.batches.slice(-maxBatches):[];
    const groups=new Map(),seen=new Set();let missingIdentityCount=0,duplicateBatchCount=0;
    let segmentStartedAt=clockNow();
    for(let index=0;index<batches.length;index++){
      const batch=batches[index];
      if(isObject(batch)){const id=String(batch.batchId||'').trim();
        if(id&&seen.has(id))duplicateBatchCount++;
        else{
          if(id)seen.add(id);
          const resourceId=String(batch.resourceId||batch.materialIdentity||'').trim(),unit=String(batch.unit||'').trim();
          const quantity=finite(batch.remainingQuantity??batch.quantity);
          if(!resourceId||!unit||quantity===null||quantity<0)missingIdentityCount++;
          else{
            const key=resourceId+'\u0000'+unit,group=groups.get(key)||{resourceId,unit,closingQuantity:0,batchCount:0};
            group.closingQuantity+=quantity;group.batchCount++;groups.set(key,group);
          }
        }
      }
      if((index+1)%MAX_ROWS_PER_SYNC_SLICE===0&&index+1<batches.length){
        recordSyncSegment(segmentStartedAt);await yieldToBrowser();segmentStartedAt=clockNow();
      }
    }
    recordSyncSegment(segmentStartedAt);
    const all=[...groups.values()].sort((a,b)=>a.resourceId.localeCompare(b.resourceId)||a.unit.localeCompare(b.unit));
    return{sourceBatchCount:batches.length,identifiedBatchCount:all.reduce((n,row)=>n+row.batchCount,0),
      missingIdentityCount,duplicateBatchCount,closingStockByIdentity:all.slice(0,maxItems).map(row=>Object.assign({},row,{status:'CLOSING_STOCK_ONLY'})),
      truncatedIdentityCount:Math.max(0,all.length-maxItems),stockFlowStatus:all.length?'CLOSING_STOCK_ONLY':'UNOBSERVED'};
  }
  function buildPhase5SectorAccounts(countryId,profile,finance,tradeCountry,resource,economy,tradeSummary,fiscalPeriodAccount,turn){
    const buyerSettlements=[].concat(
      Array.isArray(resource?.buyerSettlements)?resource.buyerSettlements:[],
      Array.isArray(tradeCountry?.buyerSettlements)?tradeCountry.buyerSettlements:[]
    ).slice(-512);
    const domesticSales=[].concat(
      Array.isArray(resource?.domesticSales)?resource.domesticSales:[],
      Array.isArray(tradeCountry?.domesticSales)?tradeCountry.domesticSales:[]
    ).slice(-512);
    const companyAccounts=isObject(economy?.companyAccounts)?economy.companyAccounts:{};
    const lifecycle=isObject(economy?.privateEnterpriseLifecycle)?economy.privateEnterpriseLifecycle:{};
    const opEntries=Array.isArray(lifecycle.operatingCostEntries)?lifecycle.operatingCostEntries.slice(-512):[];
    const settlementCurrency=String(profile?.currencyCode||profile?.currency||economy?.currencyCode||tradeCountry?.settlementCurrency||'').trim().toUpperCase()||null;

    // 1. Households Sector
    let hhConsumption=0,hhPurchaseCount=0,hhWageIncome=0,hhWageCount=0;
    const hhCurrencies=new Set();
    for(const row of buyerSettlements){
      const bt=String(row?.buyerType||'').toUpperCase();
      if(!['HOUSEHOLD','HOUSEHOLD_RETAIL','RETAIL','CONSUMER'].includes(bt))continue;
      const val=finite(row.grossAmount??row.totalValue??row.netAmount);
      if(val!==null&&val>=0){hhConsumption+=val;hhPurchaseCount++;if(row.currency)hhCurrencies.add(String(row.currency).toUpperCase());}
    }
    for(const entry of opEntries){
      const workerPaid=finite(entry?.workerIncomePaid??entry?.wagesPaid);
      if(workerPaid!==null&&workerPaid>=0){hhWageIncome+=workerPaid;hhWageCount++;}
    }
    const hhCompanies=Object.values(companyAccounts).filter(isObject);
    let companyWagesReported=0,companyWagesCount=0;
    for(const acc of hhCompanies){
      const w=finite(acc.workerIncomePaid);
      if(w!==null&&w>0){companyWagesReported+=w;companyWagesCount++;}
    }
    const observedHouseholdWages=hhWageCount>0?hhWageIncome:(companyWagesCount>0?companyWagesReported:null);
    const householdsStatus=(hhPurchaseCount>0&&observedHouseholdWages!==null)?'OBSERVED':
      (hhPurchaseCount>0||observedHouseholdWages!==null?'PARTIAL':'UNOBSERVED');
    const households={
      sector:'HOUSEHOLDS',
      status:householdsStatus,
      currency:hhCurrencies.size===1?[...hhCurrencies][0]:settlementCurrency,
      consumptionExpenditure:hhPurchaseCount>0?Number(hhConsumption.toFixed(2)):null,
      settledPurchaseCount:hhPurchaseCount,
      laborIncomeReceived:observedHouseholdWages!==null?Number(observedHouseholdWages.toFixed(2)):null,
      netSaving:hhPurchaseCount>0&&observedHouseholdWages!==null?Number((observedHouseholdWages-hhConsumption).toFixed(2)):null
    };

    // 2. Non-Financial Corporations Sector
    let corpRevenue=0,corpCosts=0,corpTaxes=0,corpWages=0,corpTransport=0,corpCount=0;
    const corpCurrencies=new Set();
    for(const acc of hhCompanies){
      const rev=finite(acc.grossRevenue??acc.paymentsReceived);
      const paid=finite(acc.paymentsMade);
      if(rev===null&&paid===null)continue;
      corpCount++;
      if(rev!==null)corpRevenue+=rev;
      if(paid!==null)corpCosts+=paid;
      if(finite(acc.taxPaid)!==null)corpTaxes+=finite(acc.taxPaid);
      if(finite(acc.workerIncomePaid)!==null)corpWages+=finite(acc.workerIncomePaid);
      if(finite(acc.transportPaid)!==null)corpTransport+=finite(acc.transportPaid);
      if(acc.currency)corpCurrencies.add(String(acc.currency).toUpperCase());
    }
    for(const sale of domesticSales){
      if(corpCount>0)break;
      const val=finite(sale?.grossAmount??sale?.totalValue);
      if(val!==null&&val>=0){corpRevenue+=val;corpCount++;if(sale.currency)corpCurrencies.add(String(sale.currency).toUpperCase());}
    }
    const corporations={
      sector:'CORPORATIONS',
      status:corpCount>0?(corpRevenue>0&&corpWages>0?'OBSERVED':'PARTIAL'):'UNOBSERVED',
      currency:corpCurrencies.size===1?[...corpCurrencies][0]:settlementCurrency,
      companyAccountCount:hhCompanies.length,
      grossRevenue:corpCount>0?Number(corpRevenue.toFixed(2)):null,
      operatingOutflows:corpCount>0?Number(corpCosts.toFixed(2)):null,
      wagesPaid:corpCount>0?Number(corpWages.toFixed(2)):null,
      taxesPaid:corpCount>0?Number(corpTaxes.toFixed(2)):null,
      transportPaid:corpCount>0?Number(corpTransport.toFixed(2)):null,
      grossOperatingSurplusEstimate:corpCount>0?Number((corpRevenue-corpCosts).toFixed(2)):null
    };

    // 3. General Government Sector
    let govProcurementSpend=0,govProcurementCount=0;
    for(const row of buyerSettlements){
      if(['GOVERNMENT','GOVERNMENT_PROCUREMENT'].includes(String(row?.buyerType||'').toUpperCase())||row?.debitGovernmentTreasury===true){
        const val=finite(row.grossAmount??row.totalValue);
        if(val!==null&&val>=0){govProcurementSpend+=val;govProcurementCount++;}
      }
    }
    const financeState=isObject(finance?.omegaFinance)?finance.omegaFinance:{};
    const treasuryBal=finite(financeState.treasuryBalanceUsd);
    const govStatus=fiscalPeriodAccount?(fiscalPeriodAccount.flowCoverage==='COMPLETE_FROM_PERIOD_START'?'RECONCILED':'PARTIAL'):
      (treasuryBal!==null||govProcurementCount>0?'PARTIAL':'UNOBSERVED');
    const generalGovernment={
      sector:'GENERAL_GOVERNMENT',
      status:govStatus,
      currency:fiscalPeriodAccount?.currency||(treasuryBal!==null?'USD':settlementCurrency),
      treasuryClosingBalanceUsd:treasuryBal,
      periodInflowsUsd:fiscalPeriodAccount?finite(fiscalPeriodAccount.totalInflowsUsd):null,
      periodOutflowsUsd:fiscalPeriodAccount?finite(fiscalPeriodAccount.totalOutflowsUsd):null,
      taxRevenueUsd:fiscalPeriodAccount?finite(fiscalPeriodAccount.flowComponents?.taxRevenueUsd):null,
      governmentProcurementCount:govProcurementCount,
      governmentProcurementSpendLocal:govProcurementCount>0?Number(govProcurementSpend.toFixed(2)):null
    };

    // 4. External Sector (Rest of World)
    const impByCur=Array.isArray(tradeSummary?.importValueByCurrency)?tradeSummary.importValueByCurrency:[];
    const expByCur=Array.isArray(tradeSummary?.exportValueByCurrency)?tradeSummary.exportValueByCurrency:[];
    let singleCurrencyBalance=null;
    const allExtCurs=new Set([...impByCur.map(r=>r.currency),...expByCur.map(r=>r.currency)].filter(Boolean));
    if(allExtCurs.size===1){
      const impTotal=impByCur.reduce((s,r)=>s+(finite(r.totalValue)||0),0);
      const expTotal=expByCur.reduce((s,r)=>s+(finite(r.totalValue)||0),0);
      singleCurrencyBalance={currency:[...allExtCurs][0],exports:expTotal,imports:impTotal,netExports:expTotal-impTotal};
    }
    const externalSector={
      sector:'EXTERNAL_SECTOR',
      status:tradeSummary?.settlementCount>0?'OBSERVED':'UNOBSERVED',
      settledTransactionCount:tradeSummary?.settlementCount||0,
      importsByCurrency:clone(impByCur),
      exportsByCurrency:clone(expByCur),
      netExternalTrade:singleCurrencyBalance
    };

    const statuses=[households.status,corporations.status,generalGovernment.status,externalSector.status];
    const observedCount=statuses.filter(s=>s==='OBSERVED'||s==='RECONCILED').length;
    const partialCount=statuses.filter(s=>s==='PARTIAL').length;
    return{
      status:observedCount===4?'OBSERVED':(observedCount>0||partialCount>0?'PARTIAL':'UNOBSERVED'),
      turn,
      households,corporations,generalGovernment,externalSector,
      authority:'PHASE5_INSTITUTIONAL_SECTOR_ACCOUNTS_EVIDENCE_LEDGER'
    };
  }

  async function reconcileSectorJournals(input={}){
    const countryId=canonicalIso3(input.countryId),financeRows=Array.isArray(input.financeRows)?input.financeRows:[];
    const financeSourceRowsTotal=Math.max(financeRows.length,Math.floor(finite(input.financeSourceRowsTotal)??financeRows.length));
    const financeLimit=bounded(input.financeLedgerRows,500,500);
    const companyAccounts=isObject(input.companyAccounts)?input.companyAccounts:{};
    const companyLimit=bounded(input.maxCompanyAccounts,5,64);
    const rowsPerCompany=bounded(input.companyCashFlowRowsPerCompany,256,1024);
    const availableCompanyIds=[...new Set([
      ...(Array.isArray(g.Omega?.PrivateEnterpriseLifecycleV1?.companyIds)?g.Omega.PrivateEnterpriseLifecycleV1.companyIds:[]),
      ...Object.keys(companyAccounts)
    ].map(v=>String(v||'').trim()).filter(Boolean))].sort();
    const observedCompanyIds=availableCompanyIds.slice(0,companyLimit);
    const seen=new Map(),coverage=new Map();
    let postedTransactionCount=0,invalidTransactionCount=0,duplicateTransactionCount=0;
    let legacyTransactionCount=0,unavailableTransactionCount=0,companyCashFlowRowsObserved=0;
    let sourceRowsScanned=financeRows.length,companyDroppedRows=0,companyRowsTruncated=false;
    function recordCoverage(journal){
      const sectorId=String(journal.sectorId||'').toLowerCase(),currency=String(journal.currency||'').toUpperCase(),
        periodId=String(journal.periodId||'').trim();
      const key=sectorId+'\u0000'+currency+'\u0000'+periodId;
      const row=coverage.get(key)||{sectorId,currency,periodId,postedTransactionCount:0,unavailableTransactionCount:0};
      row.postedTransactionCount++;coverage.set(key,row);
    }
    function validate(row,sourceKind,sourceCompanyId){
      const journal=isObject(row?.sectorJournalV1)?row.sectorJournalV1:null;
      const transactionId=String(row?.transactionId||row?.entryId||'').trim();
      if(!journal){legacyTransactionCount++;return{status:'LEGACY',transactionId};}
      if(String(journal.status||'').toUpperCase()==='UNAVAILABLE'){
        unavailableTransactionCount++;
        const key=String(journal.sectorId||'').toLowerCase()+'\u0000'+String(journal.currency||'').toUpperCase()+'\u0000'+String(journal.periodId||'');
        const current=coverage.get(key)||{sectorId:String(journal.sectorId||'').toLowerCase(),currency:String(journal.currency||'').toUpperCase(),
          periodId:String(journal.periodId||''),postedTransactionCount:0,unavailableTransactionCount:0};
        current.unavailableTransactionCount++;coverage.set(key,current);
        return{status:'UNAVAILABLE',transactionId};
      }
      const tx=String(row?.transactionId||row?.entryId||'').trim();
      const sector=String(journal.sectorId||'').toLowerCase();
      const companyId=String(journal.companyId||row?.companyId||'').trim();
      const authority=String(journal.sourceAuthority||'').trim();
      const expectedAuthority=sourceKind==='FINANCE'
        ?(sector==='government'?'OMEGA_FINANCE_MINISTRY':'OMEGA_PRIVATE_ENTERPRISE_FINANCE_LEDGER')
        :'OMEGA_PRIVATE_ENTERPRISE_CASHFLOW';
      if(!countryId||!tx||journal.status!=='POSTED'||journal.schemaVersion!==1||
         !['government','firm'].includes(sector)||journal.sourceTransactionId!==tx||
         canonicalIso3(journal.countryId)!==countryId||!String(journal.currency||'').trim()||
         !String(journal.periodId||'').trim()||journal.counterEntryComplete!==true||
         authority!==expectedAuthority||
         (sector==='government'&&companyId)||
         (sector==='firm'&&(!companyId||companyId!==String(sourceCompanyId||row?.companyId||'')))||
         (sourceKind==='FINANCE'&&sector==='government'&&!['EXPENSE','EXPENSE_ROLLBACK'].includes(String(row?.action||'').toUpperCase()))||
         (sourceKind==='FINANCE'&&sector==='firm'&&String(row?.type||'').toUpperCase()!=='PRIVATE_ENTERPRISE_OPERATING_COST_ACCRUAL')){
        invalidTransactionCount++;return{status:'INVALID',transactionId:tx};
      }
      const currency=String(journal.currency).trim().toUpperCase();
      const debitDeclared=finite(journal.debitTotalMinor),creditDeclared=finite(journal.creditTotalMinor);
      if(!currency||!Number.isSafeInteger(debitDeclared)||!Number.isSafeInteger(creditDeclared)||
         debitDeclared<=0||debitDeclared!==creditDeclared){invalidTransactionCount++;return{status:'INVALID',transactionId:tx};}
      const lines=Array.isArray(journal.lines)?journal.lines:[],lineIds=new Set();let debit=0,credit=0;
      if(lines.length<2){invalidTransactionCount++;return{status:'INVALID',transactionId:tx};}
      for(const line of lines){
        const amount=finite(line?.amountMinor),side=String(line?.side||'').toUpperCase(),lineId=String(line?.lineId||'').trim();
        if(!Number.isSafeInteger(amount)||amount<=0||!lineId||lineIds.has(lineId)||
           !String(line?.accountId||'').trim()||String(line.currency||'').toUpperCase()!==currency||
           canonicalIso3(line.countryId)!==countryId||String(line.sourceTransactionId||'')!==tx||
           (sector==='firm'&&String(line.companyId||'')!==companyId)){
          invalidTransactionCount++;return{status:'INVALID',transactionId:tx};
        }
        lineIds.add(lineId);
        if(side==='DEBIT')debit+=amount;else if(side==='CREDIT')credit+=amount;else{
          invalidTransactionCount++;return{status:'INVALID',transactionId:tx};
        }
      }
      if(debit!==debitDeclared||credit!==creditDeclared||debit!==credit){
        invalidTransactionCount++;return{status:'INVALID',transactionId:tx};
      }
      const signature=JSON.stringify({sector,companyId,currency,periodId:journal.periodId,authority,debit,credit});
      if(seen.has(tx)){
        duplicateTransactionCount++;
        if(seen.get(tx)!==signature)invalidTransactionCount++;
        return{status:'DUPLICATE',transactionId:tx};
      }
      seen.set(tx,signature);postedTransactionCount++;recordCoverage(journal);
      return{status:'POSTED',transactionId:tx};
    }
    for(const row of financeRows)validate(row,'FINANCE',row?.companyId);
    const maxEntries=companyLimit*rowsPerCompany;
    let scannedCompanyAccounts=0,scannedCompanyRows=0,segmentStartedAt=clockNow();
    for(const companyId of observedCompanyIds){
      const account=companyAccounts[companyId];
      if(!isObject(account))continue;
      scannedCompanyAccounts++;
      const entries=Array.isArray(account.cashFlowEntries)?account.cashFlowEntries:[];
      const selected=entries.slice(-rowsPerCompany);
      const dropped=Math.max(0,finite(account.cashFlowJournalDroppedEntries)||0);
      companyDroppedRows+=dropped;
      if(entries.length>selected.length||dropped>0)companyRowsTruncated=true;
      for(const row of selected){
        companyCashFlowRowsObserved++;scannedCompanyRows++;
        validate(row,'COMPANY_CASHFLOW',companyId);
        if((scannedCompanyRows%MAX_ROWS_PER_SYNC_SLICE)===0){
          recordSyncSegment(segmentStartedAt);await yieldToBrowser();segmentStartedAt=clockNow();
        }
      }
    }
    recordSyncSegment(segmentStartedAt);
    sourceRowsScanned+=companyCashFlowRowsObserved;
    const financeTruncated=financeRows.length>=financeLimit||financeSourceRowsTotal>financeRows.length;
    const companyAccountsTruncated=availableCompanyIds.length>scannedCompanyAccounts;
    const sourceCoverageStatus=financeTruncated||companyRowsTruncated||companyAccountsTruncated||
      scannedCompanyAccounts<availableCompanyIds.length||observedCompanyIds.length<availableCompanyIds.length||
      availableCompanyIds.length<(Array.isArray(g.Omega?.PrivateEnterpriseLifecycleV1?.companyIds)?g.Omega.PrivateEnterpriseLifecycleV1.companyIds.length:0)||
      legacyTransactionCount||unavailableTransactionCount?'PARTIAL':'PARTIAL';
    const integrityStatus=invalidTransactionCount>0?'UNRECONCILED':
      (postedTransactionCount>0&&duplicateTransactionCount===0?'RECONCILED':
        (postedTransactionCount>0&&invalidTransactionCount===0?'RECONCILED':'UNOBSERVED'));
    const financeWindow={observedRows:financeRows.length,sourceRows:financeSourceRowsTotal,
      rowLimit:financeLimit,windowTruncated:financeTruncated,
      droppedSourceRows:Math.max(0,financeSourceRowsTotal-financeRows.length)};
    const companyWindow={companyAccountsAvailable:availableCompanyIds.length,
      companyAccountsObserved:scannedCompanyAccounts,companyAccountsLimit:companyLimit,
      companyAccountsTruncated,observedRows:companyCashFlowRowsObserved,rowLimitPerCompany:rowsPerCompany,
      windowTruncated:companyRowsTruncated||companyAccountsTruncated,droppedSourceRows:companyDroppedRows};
    const unaccountedSourceRowCount=Math.max(0,financeWindow.droppedSourceRows)+companyDroppedRows+
      Math.max(0,availableCompanyIds.length-scannedCompanyAccounts)+legacyTransactionCount+unavailableTransactionCount;
    return{
      status:'PARTIAL',integrityStatus,sourceCoverageStatus,countryId,
      postedTransactionCount,invalidTransactionCount,duplicateTransactionCount,
      legacyTransactionCount,unavailableTransactionCount,
      currencyPeriodCoverage:[...coverage.values()].sort((a,b)=>
        a.sectorId.localeCompare(b.sectorId)||a.currency.localeCompare(b.currency)||a.periodId.localeCompare(b.periodId)),
      amountsAggregated:false,currencyAmountAggregation:'DISABLED',
      sourceWindows:{financeLedger:financeWindow,companyCashFlow:companyWindow},
      sourceRowsScanned,unaccountedSourceRowCount,
      companyCashFlowRowsObserved,
      note:'Read-only double-entry evidence validation. Partial source coverage remains PARTIAL; amounts are not summed across currencies and missing postings are never inferred.'
    };
  }

  function buildObservedGoodsFlowRows(resource,tradeCountry,economy,inventory){
    const periods=Array.isArray(resource?.stockFlowPeriods)?resource.stockFlowPeriods:[];
    if(periods.length){
      const inventoryMovements=Array.isArray(resource?.inventoryLedger)?resource.inventoryLedger:[];
      const stockLossLedger=Array.isArray(resource?.stockLossLedger)?resource.stockLossLedger:[];
      const rows=[],allMovementKeys=new Set(),allLossKeys=new Set();
      let movementDuplicateCount=0,lossDuplicateCount=0;
      const number=(v)=>{const n=finite(v);return n===null?null:n;};
      const add=(map,resourceId,unit,field,quantity)=>{
        const id=String(resourceId||'').trim(),u=String(unit||'').trim(),q=number(quantity);
        if(!id||!u||q===null||q<0)return;
        const key=id+'\u0000'+u,row=map.get(key)||{resourceId:id,unit:u};
        row[field]=(finite(row[field])||0)+q;map.set(key,row);
      };
      for(const period of periods){
        if(!isObject(period))continue;
        const periodId=String(period.periodId||('GAME_TURN_'+String(period.turn??''))).trim();
        const turn=finite(period.turn);
        const openingRows=Array.isArray(period.openingStockByIdentity)?period.openingStockByIdentity:[];
        const closingRows=Array.isArray(period.closingStockByIdentity)?period.closingStockByIdentity:[];
        const opening=new Map(),closing=new Map(),flows=new Map(),movementSeen=new Map(),lossSeen=new Map();
        for(const row of openingRows){
          if(!isObject(row))continue;
          const quantity=finite(row.quantity);
          if(quantity===null||quantity<0)continue;
          opening.set(String(row.resourceId||'').trim()+'\u0000'+String(row.unit||'').trim(),quantity);
        }
        for(const row of closingRows){
          if(!isObject(row))continue;
          const quantity=finite(row.quantity);
          if(quantity===null||quantity<0)continue;
          closing.set(String(row.resourceId||'').trim()+'\u0000'+String(row.unit||'').trim(),quantity);
        }
        const periodMovements=inventoryMovements.filter(row=>
          isObject(row)&&(String(row.periodId||'')===periodId||
            (turn!==null&&finite(row.turn)===turn)||
            (row.type==='BATCH_CREATED'&&turn!==null&&finite(row.createdTurn)===turn)));
        let movementWindowComplete=true,movementConflictCount=0;
        const lossCandidates=[];
        function addLoss(row){
          if(!isObject(row))return;
          const eventId=String(row.eventId||row.lossEventId||'').trim();
          const sourceId=String(row.sourceEventId||row.sourceTransactionId||'').trim();
          const key=eventId||sourceId;
          if(!key)return;
          const signature=JSON.stringify({resourceId:row.resourceId,unit:row.unit,quantity:row.quantity,
            sourceType:row.sourceType,lossType:row.lossType,turn:row.turn});
          if(lossSeen.has(key)){
            lossDuplicateCount++;
            if(lossSeen.get(key).signature!==signature)movementConflictCount++;
            return;
          }
          lossSeen.set(key,{signature,row});
        }
        for(const row of periodMovements){
          const type=String(row.type||'').toUpperCase();
          const movementId=String(row.eventId||row.movementId||row.transactionId||
            row.settlementId||row.batchId||'').trim();
          if(!movementId){movementWindowComplete=false;continue;}
          const key=type+'\u0000'+movementId;
          const signature=JSON.stringify(row);
          if(movementSeen.has(key)){
            movementDuplicateCount++;
            if(movementSeen.get(key)!==signature)movementConflictCount++;
            continue;
          }
          movementSeen.set(key,signature);
          if(type==='BATCH_CREATED'){
            const source=String(row.source||row.sourceType||'').toUpperCase();
            if(source==='EXTRACTION'||source==='MINE_EXTRACTION'||source==='MINE'){
              add(flows,row.resourceId,row.unit,'production',row.quantity);
            }
          }else if(type==='INTERNATIONAL_TRADE_IMPORT'){
            add(flows,row.resourceId,row.unit,'imports',row.quantity);
          }else if(type==='INTERNATIONAL_TRADE_EXPORT'){
            add(flows,row.resourceId,row.unit,'exports',row.quantity);
          }else if(type==='INVENTORY_CONSUMED'){
            add(flows,row.resourceId,row.unit,'consumption',row.quantity);
          }else if(type==='INVENTORY_LOSS'||type==='STOCK_LOSS_COMMITTED'){
            addLoss(row);
          }else if(type==='PRODUCTION_TRANSACTION_COMMITTED'){
            const inputs=Array.isArray(row.inputs)?row.inputs:[];
            const outputs=Array.isArray(row.outputs)?row.outputs:[];
            for(const input of inputs)add(flows,input.resourceId,input.unit,'consumption',input.quantity);
            for(const output of outputs)add(flows,output.resourceId,output.unit,'production',output.quantity);
            for(const [resourceId,quantity] of Object.entries(row.inputQuantities||{})){
              const unit=row.inputUnits?.[resourceId]||row.unit||null;
              add(flows,resourceId,unit,'consumption',quantity);
            }
            for(const [resourceId,quantity] of Object.entries(row.outputQuantities||{})){
              const unit=row.outputUnits?.[resourceId]||row.unit||null;
              add(flows,resourceId,unit,'production',quantity);
            }
            for(const loss of Array.isArray(row.lossEvents)?row.lossEvents:[])addLoss(loss);
          }
        }
        for(const loss of stockLossLedger){
          if(!isObject(loss))continue;
          const lossTurn=finite(loss.turn);
          if(String(loss.periodId||'')!==periodId&&!(turn!==null&&lossTurn===turn))continue;
          addLoss(loss);
        }
        const lossRowsObserved=stockLossLedger.filter(row=>isObject(row)&&
          (String(row.periodId||'')===periodId||(turn!==null&&finite(row.turn)===turn))).length;
        const declaredLossRows=finite(period.stockLossLedgerRowsAtClosing);
        const lossLedgerBoundaryComplete=period.openingCaptured===true&&period.closingCaptured===true&&
          period.lossLedgerClosingCaptured===true&&String(period.lossCoverageStatus||'').toUpperCase()==='COMPLETE'&&
          finite(period.stockLossLedgerRowsAtOpening)!==null&&declaredLossRows!==null&&declaredLossRows===lossRowsObserved;
        const movementDeclared=finite(period.movementLedgerRowsAtClosing);
        if(movementDeclared!==null&&movementDeclared!==periodMovements.length)movementWindowComplete=false;
        const movementDropped=finite(period.movementLedgerDroppedEntries);
        if(movementDropped!==null&&movementDropped>0)movementWindowComplete=false;
        if(movementConflictCount>0)movementWindowComplete=false;
        allMovementKeys.add(periodId);
        const ids=new Set([...opening.keys(),...closing.keys(),...flows.keys(),...[...lossSeen.values()].map(x=>{
          return String(x.row.resourceId||'').trim()+'\u0000'+String(x.row.unit||'').trim();
        })]);
        for(const key of ids){
          const split=key.split('\u0000'),resourceId=split[0],unit=split.slice(1).join('\u0000');
          if(!resourceId||!unit)continue;
          const flow=flows.get(key)||{};
          const lossQuantity=[...lossSeen.values()].reduce((sum,item)=>{
            if(String(item.row.resourceId||'').trim()===resourceId&&String(item.row.unit||'').trim()===unit)
              return sum+(finite(item.row.quantity)||0);
            return sum;
          },0);
          const row={
            periodId,turn,resourceId,unit,
            openingQuantity:opening.has(key)?opening.get(key):(period.openingCoverageComplete===true?0:null),
            production:movementWindowComplete?(finite(flow.production)||0):null,
            imports:movementWindowComplete?(finite(flow.imports)||0):null,
            consumption:movementWindowComplete?(finite(flow.consumption)||0):null,
            exports:movementWindowComplete?(finite(flow.exports)||0):null,
            losses:lossLedgerBoundaryComplete?lossQuantity:null,
            closingQuantity:closing.has(key)?closing.get(key):(period.closingCoverageComplete===true?0:null),
            movementWindowComplete:movementWindowComplete,
            lossLedgerBoundaryComplete:lossLedgerBoundaryComplete,
            movementRowsObserved:periodMovements.length,
            lossRowsObserved:lossRowsObserved,
            sourceAuthority:'RESOURCE_STOCK_FLOW_PERIOD_AND_EVENT_LEDGER'
          };
          rows.push(row);
        }
      }
      rows.sort((a,b)=>String(a.periodId).localeCompare(String(b.periodId))||
        a.resourceId.localeCompare(b.resourceId)||a.unit.localeCompare(b.unit));
      inventory.periodStockFlowRows=rows.map(row=>clone(row));
      inventory.movementDuplicateCount=movementDuplicateCount;
      inventory.lossDuplicateCount=lossDuplicateCount;
      inventory.movementWindowComplete=rows.every(row=>row.movementWindowComplete);
      inventory.lossCoverageStatus=rows.every(row=>row.lossLedgerBoundaryComplete)?'COMPLETE':'PARTIAL_OR_UNOBSERVED';
      return rows;
    }
    if(Array.isArray(resource?.goodsFlowRows)&&resource.goodsFlowRows.length)return resource.goodsFlowRows;
    const openingBook=isObject(resource?.openingInventoryByResource)?resource.openingInventoryByResource:null;
    if(!openingBook||!Object.keys(openingBook).length)return[];
    const net=isObject(resource?.industrialNetwork)?resource.industrialNetwork:{};
    const prodRows=Array.isArray(economy?.industrialRuntime?.productionLedger)?economy.industrialRuntime.productionLedger:[];
    const imports=Array.isArray(tradeCountry?.importLedger)?tradeCountry.importLedger:[];
    const exports=Array.isArray(tradeCountry?.exportLedger)?tradeCountry.exportLedger:[];
    const consumption=Array.isArray(resource?.consumptionLedger)?resource.consumptionLedger:[];
    const buyerSettlements=[].concat(
      Array.isArray(resource?.buyerSettlements)?resource.buyerSettlements:[],
      Array.isArray(tradeCountry?.buyerSettlements)?tradeCountry.buyerSettlements:[]
    );
    const domesticSales=[].concat(
      Array.isArray(resource?.domesticSales)?resource.domesticSales:[],
      Array.isArray(tradeCountry?.domesticSales)?tradeCountry.domesticSales:[]
    );
    const lifecycleLedger=Array.isArray(net?.byProductLifecycleLedger)?net.byProductLifecycleLedger:[];
    const closingMap=new Map();
    for(const item of (inventory?.closingStockByIdentity||[])){
      closingMap.set(String(item.resourceId).toLowerCase()+'|'+String(item.unit||''),finite(item.closingQuantity)||0);
    }
    const rows=[];
    for(const [resKey,openEntry] of Object.entries(openingBook)){
      const openingQty=isObject(openEntry)?finite(openEntry.quantity):finite(openEntry);
      const unit=isObject(openEntry)&&openEntry.unit?String(openEntry.unit):
        ((inventory?.closingStockByIdentity||[]).find(r=>String(r.resourceId).toLowerCase()===resKey.toLowerCase())?.unit||'UNIT');
      if(openingQty===null)continue;
      const tokKey=norm(resKey);
      let production=0,imported=0,consumed=0,exported=0,losses=0;
      for(const pr of prodRows){
        if(String(pr?.status||'').toUpperCase()!=='COMPLETED')continue;
        for(const [outId,q] of Object.entries(pr.outputQuantities||{})){
          if(norm(outId)===tokKey)production+=(finite(q)||0);
        }
        for(const [inId,q] of Object.entries(pr.inputQuantities||{})){
          if(norm(inId)===tokKey)consumed+=(finite(q)||0);
        }
      }
      for(const imp of imports)if(norm(imp?.resourceId)===tokKey)imported+=(finite(imp.quantity)||0);
      for(const exp of exports)if(norm(exp?.resourceId)===tokKey)exported+=(finite(exp.quantity)||0);
      for(const cRow of consumption)if(norm(cRow?.resourceId)===tokKey)consumed+=(finite(cRow.quantity)||0);
      for(const bRow of buyerSettlements)if(norm(bRow?.resourceId)===tokKey)consumed+=(finite(bRow.quantity)||0);
      for(const dRow of domesticSales)if(norm(dRow?.resourceId)===tokKey)consumed+=(finite(dRow.quantity)||0);
      for(const lRow of lifecycleLedger){
        if(norm(lRow?.resourceId)===tokKey&&String(lRow?.action||'').toUpperCase()==='CONTROLLED_DISPOSAL'){
          losses+=(finite(lRow.quantity)||0);
        }
      }
      const closingQuantity=closingMap.get(resKey.toLowerCase()+'|'+unit)??closingMap.get(resKey.toLowerCase()+'|')??finite(resource?.inventory?.[resKey])??0;
      rows.push({resourceId:resKey,unit,openingQuantity:openingQty,production,imports:imported,consumption:consumed,exports:exported,losses,closingQuantity});
    }
    return rows;
  }
  function buildObservedGdpApproaches(economy,sectorAccounts,turn){
    const explicit=isObject(economy?.nationalAccountsInputs)?economy.nationalAccountsInputs:null;
    if(explicit&&isObject(explicit.approaches)){
      return reconcileGDP(explicit.approaches,explicit.options||{});
    }
    const hh=sectorAccounts?.households,corp=sectorAccounts?.corporations,gov=sectorAccounts?.generalGovernment,ext=sectorAccounts?.externalSector;
    const currency=hh?.currency||corp?.currency||gov?.currency||null;
    const period='TURN-'+String(turn);
    const prodReady=finite(corp?.grossRevenue)!==null&&finite(corp?.operatingOutflows)!==null&&finite(corp?.taxesPaid)!==null;
    const expReady=finite(hh?.consumptionExpenditure)!==null&&finite(gov?.governmentProcurementSpendLocal)!==null&&
      ext?.netExternalTrade&&finite(ext.netExternalTrade.netExports)!==null&&isObject(explicit?.capitalFormation)&&finite(explicit.capitalFormation.value)!==null;
    const incReady=finite(corp?.wagesPaid)!==null&&finite(corp?.grossOperatingSurplusEstimate)!==null&&finite(corp?.taxesPaid)!==null&&
      isObject(explicit?.incomeAdjustments);
    if(!prodReady&&!expReady&&!incReady)return reconcileGDP({});
    const approaches={};
    if(prodReady){
      const val=(corp.grossRevenue)-(corp.operatingOutflows-corp.wagesPaid-corp.taxesPaid);
      approaches.production={value:val,currency,period,complete:!!currency};
    }
    if(expReady){
      const val=hh.consumptionExpenditure+(finite(explicit.capitalFormation.value)||0)+gov.governmentProcurementSpendLocal+ext.netExternalTrade.netExports;
      approaches.expenditure={value:val,currency,period,complete:!!currency};
    }
    if(incReady){
      const val=corp.wagesPaid+corp.grossOperatingSurplusEstimate+corp.taxesPaid+(finite(explicit.incomeAdjustments.mixedIncome)||0);
      approaches.income={value:val,currency,period,complete:!!currency};
    }
    return reconcileGDP(approaches);
  }
  async function buildStatement(countryId,profile,root,turn){
    const sourceLookupStartedAt=clockNow();
    const finance=countryRecord(root,'finance',profile,countryId)||{};
    const tradeCountry=countryRecord(root,'trade',profile,countryId)||{};
    const resource=countryRecord(root,'resource',profile,countryId)||{};
    const economy=countryRecord(root,'economy',profile,countryId)||{};
    const financeState=isObject(finance.omegaFinance)?finance.omegaFinance:{};
    const limits=runtime.rules.limits||{};
    const financeRows=Array.isArray(financeState.ledger)?financeState.ledger.slice(-bounded(limits.financeLedgerRows,500,500)):[];
    const trade=summarizeTrade(tradeCountry,bounded(limits.tradeLedgerRows,512,512),
      bounded(limits.pendingImportRequestRows,512,512));
    recordSyncSegment(sourceLookupStartedAt);
    const inventory=await summarizeInventory(resource,bounded(limits.inventoryBatchRows,4096,4096),bounded(limits.maxStockIdentityRows,96,256));
    const industry=isObject(economy.industrialRuntime)?economy.industrialRuntime:{};
    const productionRows=Array.isArray(industry.productionLedger)?
      industry.productionLedger.slice(-bounded(limits.productionLedgerRows,2048,2048)):[];
    const completed=[];let productionSegmentStartedAt=clockNow();
    for(let index=0;index<productionRows.length;index++){
      if(String(productionRows[index]?.status||'').toUpperCase()==='COMPLETED')completed.push(productionRows[index]);
      if((index+1)%MAX_ROWS_PER_SYNC_SLICE===0&&index+1<productionRows.length){
        recordSyncSegment(productionSegmentStartedAt);await yieldToBrowser();productionSegmentStartedAt=clockNow();
      }
    }
    recordSyncSegment(productionSegmentStartedAt);
    const statementAssemblyStartedAt=clockNow();
    const balance=finite(financeState.treasuryBalanceUsd),available=finite(finance.available);
    const cashSource=balance!==null?String(financeState.treasurySource||'FINANCE_MINISTRY_RUNTIME'):'UNOBSERVED';
    const fiscalPeriodAccount=isObject(financeState.fiscalPeriodAccount)?financeState.fiscalPeriodAccount:null;
    const fiscalPeriodComplete=fiscalPeriodAccount?.flowCoverage==='COMPLETE_FROM_PERIOD_START';
    const treasuryCheck=fiscalPeriodAccount?reconcileTreasury({
      openingCash:fiscalPeriodComplete?finite(fiscalPeriodAccount.openingBalanceUsd):null,
      inflows:finite(fiscalPeriodAccount.totalInflowsUsd),
      outflows:finite(fiscalPeriodAccount.totalOutflowsUsd),
      closingCash:balance
    }):reconcileTreasury({});
    const treasuryStatus=fiscalPeriodAccount?
      (treasuryCheck.status!=='RECONCILED'?treasuryCheck.status:
        (fiscalPeriodAccount.openingBalanceQuality==='MODELLED'?'MODELLED_RECONCILED':'GAME_STATE_RECONCILED')):
      (balance===null?'UNOBSERVED':/ESTIMATE/i.test(cashSource)?'MODELLED_CLOSING_BALANCE_ONLY':'CLOSING_BALANCE_ONLY');
    const treasuryReconciliation=fiscalPeriodAccount?
      Object.assign({},treasuryCheck,{financeStatus:treasuryStatus,sourceAuthority:'FINANCE_MINISTRY_FISCAL_PERIOD_ACCOUNT'}):
      reconcileTreasury({});
    const currentGdp=finite(economy.gdp)??finite(profile?.indicators?.gdpCurrentUsd);
    const gdpSource=finite(economy.gdp)!==null?'FINANCE_OWNED_GAMEPLAY_ECONOMY_STATE':
      currentGdp!==null?'COUNTRY_ECONOMIC_BASELINE_PROFILE':'UNOBSERVED';
    const sectorAccounts=buildPhase5SectorAccounts(countryId,profile,finance,tradeCountry,resource,economy,trade,fiscalPeriodAccount,turn);
    const sectorJournals=await reconcileSectorJournals({
      countryId,financeRows,financeSourceRowsTotal:Array.isArray(financeState.ledger)?financeState.ledger.length:0,
      financeLedgerRows:bounded(limits.financeLedgerRows,500,500),
      companyAccounts:isObject(economy.companyAccounts)?economy.companyAccounts:{},
      maxCompanyAccounts:bounded(limits.maxCompanyAccounts,5,64),
      companyCashFlowRowsPerCompany:bounded(limits.companyCashFlowRowsPerCompany,256,1024)
    });
    const goodsFlowRows=buildObservedGoodsFlowRows(resource,tradeCountry,economy,inventory);
    const goods=reconcileGoodsFlow(goodsFlowRows);
    const gdp=buildObservedGdpApproaches(economy,sectorAccounts,turn);
    const approachMap=Object.fromEntries((gdp.approaches||[]).map(row=>[row.name,row]));
    const statement={
      schemaVersion:Number(runtime.rules.schemaVersion||1),modelVersion:String(runtime.rules.modelVersion||VERSION),
      countryId,countryName:profile?.name||runtime.manifest?.countries?.[countryId]?.countryName||countryId,
      turn,currency:profile?.currencyCode||profile?.currency||null,status:gdp.status==='RECONCILED'&&goods.status==='RECONCILED'?'RECONCILED':'PARTIAL',
      gdp:{status:gdp.status,value:gdp.value,currency:gdp.currency,period:gdp.period,approaches:{
        production:approachMap.production?.complete?approachMap.production:{status:'UNOBSERVED',missing:['gross-output-value','intermediate-consumption','product-taxes','subsidies']},
        expenditure:approachMap.expenditure?.complete?approachMap.expenditure:{status:'UNOBSERVED',missing:['household-consumption','actual-gross-capital-formation','government-final-consumption','exports','imports']},
        income:approachMap.income?.complete?approachMap.income:{status:'UNOBSERVED',missing:['employee-compensation','gross-operating-surplus','mixed-income','production-taxes','subsidies']}},
        modelledReference:{value:currentGdp,currency:currentGdp===null?null:'USD',source:gdpSource,
          status:currentGdp===null?'UNOBSERVED':'MODELLED_REFERENCE_NOT_RECONCILED_NATIONAL_ACCOUNTS'}},
      sectorAccounts,
      sectorJournals,
      treasury:{status:treasuryStatus,closingBalance:balance,source:cashSource,currency:balance===null?null:'USD',
        availableLiquidity:available,availableLiquidityCurrency:profile?.currencyCode||profile?.currency||null,
        openingBalance:fiscalPeriodComplete?finite(fiscalPeriodAccount.openingBalanceUsd):null,
        inflows:fiscalPeriodAccount?finite(fiscalPeriodAccount.totalInflowsUsd):null,
        outflows:fiscalPeriodAccount?finite(fiscalPeriodAccount.totalOutflowsUsd):null,
        fiscalPeriod:fiscalPeriodAccount?clone(fiscalPeriodAccount):null,
        financePeriodHistoryCount:Array.isArray(financeState.fiscalPeriodHistory)?financeState.fiscalPeriodHistory.length:0,
        reconciliation:treasuryReconciliation,
        financeLedger:classifyFinanceLedger(financeRows),financeLedgerWindow:financeRows.length?'LAST_N_RECORDS':'UNOBSERVED'},
      trade:{status:trade.settlementCount?'SETTLED_TRANSACTIONS_OBSERVED':'UNOBSERVED',
        settlementCount:trade.settlementCount,settlementRowsObserved:trade.settlementRowsObserved,
        importLedgerRowsObserved:trade.importLedgerRowsObserved,exportLedgerRowsObserved:trade.exportLedgerRowsObserved,
        importValueByCurrency:trade.importValueByCurrency,exportValueByCurrency:trade.exportValueByCurrency,
        monetaryValueCoverage:trade.monetaryValueCoverage,pendingRequestCount:trade.pendingRequestCount,
        pendingRequestRowsObserved:trade.pendingRequestRowsObserved,pendingRequestCoverage:trade.pendingRequestCoverage,
        pendingRequestWindowTruncated:trade.pendingRequestWindowTruncated},
      industry:{status:completed.length?'COMPLETED_FACTORY_RECORDS_OBSERVED':'UNOBSERVED',
        productionLedgerRowsObserved:productionRows.length,completedProductionRecords:completed.length,
        ledgerWindow:productionRows.length?'LAST_N_RECORDS':'UNOBSERVED'},
      goods:{status:goods.status==='UNOBSERVED'?inventory.stockFlowStatus:goods.status,stockFlowReconciliation:goods,inventory},
      completeness:{treasuryOpeningAndFlows:fiscalPeriodAccount?treasuryReconciliation.status:'UNOBSERVED',physicalGoodsOpeningProductionConsumptionExportLoss:goods.status,
        institutionalSectorAccounts:sectorAccounts.status,
        sectorJournalDoubleEntryIntegrity:sectorJournals.integrityStatus,
        gdpProductionApproach:approachMap.production?.complete?'AVAILABLE':'UNOBSERVED',
        gdpExpenditureApproach:approachMap.expenditure?.complete?'AVAILABLE':'UNOBSERVED',
        gdpIncomeApproach:approachMap.income?.complete?'AVAILABLE':'UNOBSERVED',
        sourceWindowBounded:true},
      provenance:{roster:runtime.rules.roster?.manifestPath||'minister_country_roster_manifest_v1.json',
        baselineYear:runtime.profileMetadata?.baselineYear??null,
        accountingAuthority:'ECONOMY_OWNED_PHASE5_INSTITUTIONAL_AND_RECONCILED_ACCOUNTS',cashSource,modelledGdpSource:gdpSource,
        treasuryAuthority:fiscalPeriodAccount?'FINANCE_MINISTRY_FISCAL_PERIOD_ACCOUNT':'FINANCE_MINISTRY_TREASURY_CLOSING_BALANCE_ONLY',
        treasuryOpeningSource:fiscalPeriodAccount?.openingBalanceSource||'UNOBSERVED',
        treasuryOpeningQuality:fiscalPeriodAccount?.openingBalanceQuality||'UNOBSERVED',
        tradeAuthority:'COUNTRY_SCOPED_SETTLED_TRADE_LEDGER',
        productionAuthority:'COUNTRY_SCOPED_FACTORY_PRODUCTION_LEDGER',
        stockAuthority:'COUNTRY_SCOPED_RESOURCE_BATCH_REGISTER',
        missingDataPolicy:'MISSING_IS_UNOBSERVED_NOT_ZERO'}
    };
    statement.workload={
      financeLedgerRowsObserved:financeRows.length,tradeRowsObserved:trade.rowsScanned,
      inventoryBatchRowsObserved:inventory.sourceBatchCount,productionLedgerRowsObserved:productionRows.length,
      companyCashFlowRowsObserved:sectorJournals.companyCashFlowRowsObserved,
      sourceRowsScanned:financeRows.length+trade.rowsScanned+inventory.sourceBatchCount+productionRows.length+sectorJournals.companyCashFlowRowsObserved
    };
    statement.sourceFingerprint=fingerprint({countryId,turn,treasury:statement.treasury,trade:statement.trade,
      industry:statement.industry,goods:statement.goods,gdp:statement.gdp,sectorAccounts:statement.sectorAccounts,
      sectorJournals:statement.sectorJournals,workload:statement.workload});
    recordSyncSegment(statementAssemblyStartedAt);
    return statement;
  }
  function checkpointHandler(command,context){
    const payload=command?.payload||{},countryId=canonicalIso3(context?.countryId||payload.countryId),statement=payload.statement;
    if(!countryId||!runtime.coreCountryIds.has(countryId)||!isObject(statement)||statement.countryId!==countryId||
       !Number.isFinite(Number(statement.turn)))return{accepted:false,reason:'NATIONAL_ACCOUNTS_CHECKPOINT_COUNTRY_OR_PAYLOAD_INVALID'};
    const path=runtime.rules.persistence.statePath||'economy.nationalAccounts',current=context.stateTransaction.get(path);
    if(isObject(current)&&finite(current.lastProcessedTurn)!==null&&current.lastProcessedTurn>=statement.turn)
      return{accepted:true,duplicate:true,noStateChangeAccepted:true,reason:'COUNTRY_TURN_ALREADY_CHECKPOINTED'};
    const history=Array.isArray(current?.snapshots)?current.snapshots.slice():[];
    history.push({turn:statement.turn,sourceFingerprint:statement.sourceFingerprint,status:statement.status,
      gdpStatus:statement.gdp.status,treasuryStatus:statement.treasury.status,goodsStatus:statement.goods.status,
      tradeSettlementCount:statement.trade.settlementCount});
    const historyLimit=bounded(runtime.rules.persistence.historyLimit,12,24);
    const saved=Object.assign({},clone(statement),{lastProcessedTurn:statement.turn,
      revision:(finite(current?.revision)||0)+1,snapshots:history.slice(-historyLimit)});
    context.stateTransaction.set(path,saved);
    return{accepted:true,stateMutationAuthority:'OMEGA_MINISTRY_STATE_TRANSACTION',
      countryId,lastProcessedTurn:statement.turn,revision:saved.revision};
  }
  function registerIntegrations(){
    const interop=g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability;
    const scheduler=g.Omega?.WorldSimulationScheduler||g.OmegaWorldSimulationScheduler;
    if(!interop||typeof interop.registerCommandHandler!=='function'||typeof interop.dispatchCommand!=='function')
      throw new Error('NATIONAL_ACCOUNTS_MINISTRY_INTEROPERABILITY_UNAVAILABLE');
    if(!scheduler||typeof scheduler.registerCountryHandler!=='function')throw new Error('NATIONAL_ACCOUNTS_WORLD_SCHEDULER_UNAVAILABLE');
    const owner=runtime.rules.persistence.ownerMinistry||'economy';
    if(!runtime.commandHandlerRegistered){interop.registerCommandHandler(COMMAND_TYPE,owner,checkpointHandler);runtime.commandHandlerRegistered=true;}
    if(!runtime.unregisterCountryHandler)runtime.unregisterCountryHandler=scheduler.registerCountryHandler(HANDLER_ID,processCountry,{
      tiers:runtime.rules.scheduler?.tiers||['PLAYER','ACTIVE','MACRO'],priority:finite(runtime.rules.scheduler?.priority)??40});
    installSourceInvalidationListeners();
  }
  async function processCountry(countryValue,context={}){
    if(!runtime.ready){runtime.deferredCountries++;return{status:'DEFERRED',reason:'NATIONAL_ACCOUNTS_RUNTIME_NOT_READY'};}
    const countryId=canonicalIso3(countryValue);
    if(!countryId||!runtime.coreCountryIds.has(countryId)){runtime.skippedCountries++;return{status:'SKIPPED',reason:'COUNTRY_NOT_IN_CORE_GAME_ROSTER'};}
    const profile=findProfile(countryId);
    if(!profile){runtime.deferredCountries++;return{status:'DEFERRED',reason:'COUNTRY_FINANCE_PROFILE_UNAVAILABLE',countryId};}
    const root=rootState(context);
    if(!root){runtime.deferredCountries++;return{status:'DEFERRED',reason:'AUTHORITATIVE_WORLD_STATE_UNAVAILABLE',countryId};}
    syncRootState(root);
    const turn=currentTurn(context),previous=countryRecord(root,'economy',profile,countryId)?.nationalAccounts;
    if(isObject(previous)&&finite(previous.lastProcessedTurn)!==null&&previous.lastProcessedTurn>=turn){
      runtime.skippedCountries++;return{status:'ALREADY_PROCESSED',countryId,turn,sourceFingerprint:previous.sourceFingerprint||null};}
    if(runtime.initializedCountryIds.has(countryId)&&!runtime.dirtyCountryIds.has(countryId)){
      runtime.skippedCountries++;runtime.unchangedCountries++;
      return{status:'UNCHANGED',countryId,turn,lastProcessedTurn:finite(previous?.lastProcessedTurn),
        sourceFingerprint:previous?.sourceFingerprint||null,sourceRowsScanned:0};}
    const startedAt=clockNow(),sourceVersion=runtime.countrySourceVersions.get(countryId)||0,
      globalSourceVersion=runtime.globalSourceVersion;
    let statement;
    try{statement=await buildStatement(countryId,profile,root,turn);}catch(error){
      const elapsed=Math.max(0,clockNow()-startedAt);
      runtime.lastCountryElapsedMs=elapsed;runtime.maxCountryElapsedMs=Math.max(runtime.maxCountryElapsedMs,elapsed);
      runtime.totalCountryElapsedMs+=elapsed;
      runtime.failedCountries++;return{status:'FAILED',reason:String(error?.message||error),
        errorStack:String(error?.stack||'').slice(0,5000),countryId,turn};}
    const interop=g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability;
    const commandId='NATIONAL-ACCOUNTS-'+countryId+'-T'+turn,owner=runtime.rules.persistence.ownerMinistry||'economy';
    const commitStartedAt=clockNow();
    let result;
    try{
      result=interop.dispatchCommand(owner,COMMAND_TYPE,countryId,{countryId,statement},{
        turn,commandId,commandType:COMMAND_TYPE,ownerMinistry:owner,correlationId:commandId,
        provenance:{source:HANDLER_ID,modelVersion:runtime.rules.modelVersion}});
    }finally{
      recordSyncSegment(commitStartedAt);
    }
    const elapsed=Math.max(0,clockNow()-startedAt),rowsScanned=finite(statement.workload?.sourceRowsScanned)??0;
    runtime.lastCountryElapsedMs=elapsed;runtime.maxCountryElapsedMs=Math.max(runtime.maxCountryElapsedMs,elapsed);
    runtime.totalCountryElapsedMs+=elapsed;runtime.lastSourceRowsScanned=rowsScanned;
    runtime.maxSourceRowsScanned=Math.max(runtime.maxSourceRowsScanned,rowsScanned);
    if(result?.status!=='APPLIED'||result?.result?.accepted===false){
      runtime.failedCountries++;return{status:'FAILED',reason:result?.reason||result?.result?.reason||result?.status||'NATIONAL_ACCOUNTS_CHECKPOINT_COMMIT_FAILED',countryId,turn};}
    runtime.initializedCountryIds.add(countryId);
    if(sourceVersion===(runtime.countrySourceVersions.get(countryId)||0)&&globalSourceVersion===runtime.globalSourceVersion)
      runtime.dirtyCountryIds.delete(countryId);
    else runtime.dirtyCountryIds.add(countryId);
    runtime.processedCountries++;runtime.lastProcessedTurn=turn;runtime.lastCountryId=countryId;
    return{status:'CHECKPOINTED',countryId,turn,sourceFingerprint:statement.sourceFingerprint,
      gdpStatus:statement.gdp.status,treasuryStatus:statement.treasury.status,
      goodsStatus:statement.goods.status,tradeSettlementCount:statement.trade.settlementCount,
      sourceRowsScanned:rowsScanned,elapsedMs:Number(elapsed.toFixed(3)),commandId};
  }
  async function init(){
    if(runtime.ready)return diagnostics();if(runtime.initPromise)return runtime.initPromise;
    runtime.initPromise=(async()=>{await loadInputs();registerIntegrations();runtime.initialized=true;runtime.ready=true;runtime.error=null;return diagnostics();})();
    try{return await runtime.initPromise;}catch(error){
      runtime.error=String(error?.message||error);runtime.initialized=false;runtime.ready=false;runtime.initPromise=null;throw error;}
  }
  function getSnapshot(value){
    const id=canonicalIso3(value),profile=findProfile(id),root=rootState();
    if(!id||!runtime.coreCountryIds.has(id)||!profile||!root)return null;
    const saved=countryRecord(root,'economy',profile,id)?.nationalAccounts;return isObject(saved)?clone(saved):null;
  }
  function diagnostics(){return{version:VERSION,initialized:runtime.initialized,ready:runtime.ready,error:runtime.error,
    coreCountryCount:runtime.coreCountryIds.size,resolvedProfileCount:runtime.profilesByIso3.size,
    rosterScope:runtime.manifest?.scope||null,modelVersion:runtime.rules?.modelVersion||null,
    commandHandlerRegistered:runtime.commandHandlerRegistered,
    schedulerHandlerRegistered:typeof runtime.unregisterCountryHandler==='function',
    schedulerTiers:clone(runtime.rules?.scheduler?.tiers||[]),schedulerPriority:finite(runtime.rules?.scheduler?.priority),
    processedCountries:runtime.processedCountries,skippedCountries:runtime.skippedCountries,unchangedCountries:runtime.unchangedCountries,
    deferredCountries:runtime.deferredCountries,failedCountries:runtime.failedCountries,
    lastProcessedTurn:runtime.lastProcessedTurn,lastCountryId:runtime.lastCountryId,
    initializedCountryCount:runtime.initializedCountryIds.size,dirtyCountryCount:runtime.dirtyCountryIds.size,
    sourceInvalidations:runtime.sourceInvalidations,globalInvalidations:runtime.globalInvalidations,rootResets:runtime.rootResets,
    invalidationListenerCount:runtime.eventListeners.length,yieldCount:runtime.yieldCount,
    lastSyncSegmentMs:runtime.lastSyncSegmentMs,maxSyncSegmentMs:runtime.maxSyncSegmentMs,
    totalSyncSegmentMs:Number(runtime.totalSyncSegmentMs.toFixed(3)),
    lastCountryElapsedMs:runtime.lastCountryElapsedMs,maxCountryElapsedMs:runtime.maxCountryElapsedMs,
    totalCountryElapsedMs:Number(runtime.totalCountryElapsedMs.toFixed(3)),
    lastSourceRowsScanned:runtime.lastSourceRowsScanned,maxSourceRowsScanned:runtime.maxSourceRowsScanned,
    executionMode:'CHANGE_DRIVEN_BOUNDED_PER_COUNTRY_READ_ONLY_ACCOUNTING_CHECKPOINT'};}
  const API=Object.freeze({VERSION,init,processCountry,getSnapshot,diagnostics,reconcileTreasury,reconcileGoodsFlow,reconcileGDP,reconcileSectorJournals,buildPhase5SectorAccounts});
  g.Omega=g.Omega||{};g.Omega.NationalAccounts=API;g.OmegaNationalAccounts=API;
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_READY',()=>{init().catch(error=>{runtime.error=String(error?.message||error);});});
    g.addEventListener('load',()=>{init().catch(error=>{runtime.error=String(error?.message||error);});},{once:true});
  }
  if(g.document&&(g.document.readyState==='complete'||g.document.readyState==='interactive'))
    Promise.resolve().then(()=>init().catch(error=>{runtime.error=String(error?.message||error);}));
})(typeof window!=='undefined'?window:globalThis);
