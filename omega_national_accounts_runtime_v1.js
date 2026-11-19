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
    'OMEGA_FACTORY_UTILITY_CONSUMED','OMEGA_FACTORY_CAPACITY_CHANGED','OMEGA_RESOURCE_MINE_CAPACITY_CHANGED'
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

  async function reconcileSectorJournals(input={}) {
    const countryId=canonicalIso3(input.countryId);
    if(!countryId)return{status:'UNOBSERVED',complete:false,integrityStatus:'UNOBSERVED',
      sourceCoverageStatus:'UNOBSERVED',postedTransactionCount:0,unavailableTransactionCount:0,
      unaccountedSourceRowCount:0,invalidTransactionCount:0,duplicateTransactionCount:0,
      sourceRowsObserved:0,sourceRowsScanned:0,currencyPeriodCoverage:[],reason:'COUNTRY_ID_UNAVAILABLE'};
    const financeRows=Array.isArray(input.financeRows)?input.financeRows:[];
    const financeSourceRowsTotal=Math.max(financeRows.length,Math.floor(finite(input.financeSourceRowsTotal)??financeRows.length));
    const companyAccounts=isObject(input.companyAccounts)?input.companyAccounts:{};
    const enterpriseRegistry=g.Omega?.PrivateEnterpriseLifecycleV1||g.OmegaPrivateEnterpriseLifecycleV1;
    const registeredCompanyIds=Array.isArray(enterpriseRegistry?.companyIds)?
      [...new Set(enterpriseRegistry.companyIds.map(value=>String(value||'').trim()).filter(Boolean))]:[];
    const companyRegistryAvailable=registeredCompanyIds.length>0;
    const maxCompanies=bounded(input.maxCompanyAccounts,5,5);
    const maxRowsPerCompany=bounded(input.companyCashFlowRowsPerCompany,256,512);
    const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
    const companyIds=companyRegistryAvailable?registeredCompanyIds.filter(companyId=>
      hasOwn(companyAccounts,companyId)&&isObject(companyAccounts[companyId])):[];
    const missingCompanyIds=companyRegistryAvailable?registeredCompanyIds.filter(companyId=>
      !hasOwn(companyAccounts,companyId)||!isObject(companyAccounts[companyId])):[];
    const selectedCompanyIds=companyIds.slice(0,maxCompanies);
    const companyRows=[];
    let companyCashFlowRowsObserved=0,companyCashFlowRowsRetained=0,droppedCompanyRows=0;
    let companyCashFlowWindowTruncated=companyIds.length>selectedCompanyIds.length;
    for(const companyId of selectedCompanyIds){
      const account=companyAccounts[companyId],entries=Array.isArray(account.cashFlowEntries)?account.cashFlowEntries:[];
      const observed=entries.slice(-maxRowsPerCompany);
      const dropped=Math.max(0,Math.floor(finite(account.cashFlowJournalDroppedEntries)||0));
      companyCashFlowRowsObserved+=observed.length;
      companyCashFlowRowsRetained+=entries.length;
      droppedCompanyRows+=dropped;
      if(entries.length>observed.length||dropped>0)companyCashFlowWindowTruncated=true;
      companyRows.push({companyId,account,entries:observed,retainedRows:entries.length,droppedRows:dropped});
    }
    const expectedFinanceSector=row=>{
      const type=String(row?.type||'').trim().toUpperCase(),action=String(row?.action||'').trim().toUpperCase();
      if(type.startsWith('PRIVATE_ENTERPRISE_'))return'firm';
      if(['EXPENSE','EXPENSE_ROLLBACK','BORROW','DEBT_REPAYMENT','WORLD_BANK_DEBT_SERVICE'].includes(action))return'government';
      return null;
    };
    const seen=new Set(),groups=new Map();
    let journalTransactionCount=0,postedTransactionCount=0,unavailableTransactionCount=0,
      unaccountedSourceRowCount=0,invalidTransactionCount=0,duplicateTransactionCount=0;
    const accountTotals={government:{posted:0,unavailable:0},firm:{posted:0,unavailable:0}};
    function processJournalRow(row,sourceLedger,expectedSector,expectedCompany,sourceTransactionId,required){
      const journal=row?.sectorJournalV1;
      if(!isObject(journal)){
        if(required)unaccountedSourceRowCount++;
        return;
      }
      journalTransactionCount++;
      const status=String(journal.status||'').trim().toUpperCase();
      if(status==='UNAVAILABLE'){
        unavailableTransactionCount++;
        const sector=String(journal.sectorId||expectedSector||'').toLowerCase();
        if(accountTotals[sector])accountTotals[sector].unavailable++;
        return;
      }
      if(status!=='POSTED'){invalidTransactionCount++;return;}
      const transactionId=String(sourceTransactionId||'').trim();
      const sourceAuthority=String(journal.sourceAuthority||'').trim();
      const currency=String(journal.currency||'').trim().toUpperCase();
      const sector=String(journal.sectorId||'').trim().toLowerCase();
      const journalCountry=String(journal.countryId||'').trim().toUpperCase();
      let valid=!!transactionId&&!!sourceAuthority&&!!currency&&
        String(journal.sourceTransactionId||'').trim()===transactionId&&
        journalCountry===countryId&&
        (!expectedSector||sector===expectedSector)&&
        (!expectedCompany||String(journal.companyId||'')===expectedCompany)&&
        (!expectedCompany||!row?.companyId||String(row.companyId)===expectedCompany)&&
        journal.counterEntryComplete===true;
      const debitDeclared=finite(journal.debitTotalMinor),creditDeclared=finite(journal.creditTotalMinor);
      if(!Number.isSafeInteger(debitDeclared)||!Number.isSafeInteger(creditDeclared)||
         debitDeclared<=0||debitDeclared!==creditDeclared)valid=false;
      const lines=Array.isArray(journal.lines)?journal.lines:[];
      if(lines.length<2)valid=false;
      let debitTotal=0,creditTotal=0;
      for(const line of lines){
        const amount=finite(line?.amountMinor),side=String(line?.side||'').toUpperCase();
        if(!isObject(line)||!Number.isSafeInteger(amount)||amount<=0||
           !String(line.accountId||'').trim()||
           String(line.currency||'').trim().toUpperCase()!==currency||
           String(line.countryId||'').trim().toUpperCase()!==countryId||
           String(line.sourceTransactionId||'').trim()!==transactionId||
           (expectedCompany&&String(line.companyId||'')!==expectedCompany)){
          valid=false;continue;
        }
        if(side==='DEBIT')debitTotal+=amount;
        else if(side==='CREDIT')creditTotal+=amount;
        else valid=false;
      }
      if(debitTotal!==creditTotal||debitTotal!==debitDeclared||creditTotal!==creditDeclared)valid=false;
      const duplicateKey=[sourceLedger,sourceAuthority,countryId,expectedCompany||'',transactionId].join('|');
      if(seen.has(duplicateKey)){duplicateTransactionCount++;valid=false;}
      else seen.add(duplicateKey);
      if(!valid){invalidTransactionCount++;return;}
      postedTransactionCount++;
      if(accountTotals[sector])accountTotals[sector].posted++;
      const periodId=String(journal.periodId||'UNSPECIFIED_PERIOD');
      const groupKey=[sector,currency,periodId].join('|');
      const group=groups.get(groupKey)||{sectorId:sector,currency,periodId,
        postedTransactionCount:0,unavailableTransactionCount:0};
      group.postedTransactionCount++;
      groups.set(groupKey,group);
    }
    for(let index=0;index<financeRows.length;index++){
      const row=financeRows[index],sector=expectedFinanceSector(row),
        tx=String(row?.transactionId||'').trim();
      processJournalRow(row,'FINANCE_LEDGER',sector||String(row?.sectorJournalV1?.sectorId||'').toLowerCase(),
        String(row?.companyId||'')||null,tx,!!sector);
    }
    let scannedCompanyRows=0,segmentStartedAt=clockNow();
    for(const company of companyRows){
      const accountCompanyId=String(company.account?.companyId||company.companyId);
      for(let index=0;index<company.entries.length;index++){
        const row=company.entries[index],rowStatus=String(row?.status||'').toUpperCase();
        const required=rowStatus==='POSTED'||rowStatus==='REVERSED';
        const tx=String(row?.entryId||row?.transactionId||'').trim();
        processJournalRow(row,'COMPANY_CASH_FLOW','firm',accountCompanyId,tx,required);
        scannedCompanyRows++;
        if(scannedCompanyRows%MAX_ROWS_PER_SYNC_SLICE===0&&scannedCompanyRows<companyCashFlowRowsObserved){
          recordSyncSegment(segmentStartedAt);await yieldToBrowser();segmentStartedAt=clockNow();
        }
      }
    }
    if(companyCashFlowRowsObserved>0)recordSyncSegment(segmentStartedAt);
    const windowTruncated=financeSourceRowsTotal>financeRows.length||companyCashFlowWindowTruncated;
    const anySourceRows=financeRows.length>0||companyCashFlowRowsObserved>0;
    const integrityStatus=invalidTransactionCount||duplicateTransactionCount?'UNRECONCILED':
      postedTransactionCount?'RECONCILED':'UNOBSERVED';
    const sourceCoverageStatus=!anySourceRows?'UNOBSERVED':
      (!companyRegistryAvailable||missingCompanyIds.length||windowTruncated||
       unaccountedSourceRowCount||unavailableTransactionCount)?
        'PARTIAL':'RETAINED_SOURCE_WINDOWS_ACCOUNTED';
    const currencyPeriodCoverage=[...groups.values()].sort((a,b)=>
      a.sectorId.localeCompare(b.sectorId)||a.currency.localeCompare(b.currency)||a.periodId.localeCompare(b.periodId));
    return{
      schemaVersion:1,status:'PARTIAL',complete:false,sourceAuthority:'READ_ONLY_EXISTING_SECTOR_JOURNALS',
      integrityStatus,sourceCoverageStatus,
      journalTransactionCount,postedTransactionCount,unavailableTransactionCount,
      unaccountedSourceRowCount,invalidTransactionCount,duplicateTransactionCount,
      sectorCoverage:accountTotals,currencyPeriodCoverage,
      sourceWindows:{
        financeLedger:{retainedSourceRows:financeSourceRowsTotal,observedRows:financeRows.length,
          maximumRows:bounded(input.financeLedgerRows,500,500),windowTruncated:financeSourceRowsTotal>financeRows.length},
        companyCashFlow:{companyRegistryAvailable,companyAccountsAvailable:companyRegistryAvailable?companyIds.length:null,
          companyAccountsMissing:companyRegistryAvailable?missingCompanyIds.length:null,
          companyAccountsObserved:selectedCompanyIds.length,companyAccountsTruncated:companyIds.length>selectedCompanyIds.length,
          retainedSourceRows:companyCashFlowRowsRetained,observedRows:companyCashFlowRowsObserved,
          maximumRowsPerCompany:maxRowsPerCompany,windowTruncated:companyCashFlowWindowTruncated,
          droppedSourceRows:droppedCompanyRows,
          companies:companyRows.map(row=>({companyId:row.companyId,retainedRows:row.retainedRows,
            observedRows:row.entries.length,droppedSourceRows:row.droppedRows,
            windowTruncated:row.retainedRows>row.entries.length||row.droppedRows>0}))}
      },
      sourceRowsObserved:financeRows.length+companyCashFlowRowsObserved,
      sourceRowsScanned:companyCashFlowRowsObserved,
      amountsAggregated:false,
      limitations:[
        'Journal integrity is checked per source transaction in integer minor units; monetary amounts are not aggregated across transactions or currencies.',
        'Finance and company cash-flow sources are read-only and bounded to their retained windows; truncated or legacy rows remain partial.',
        'Household, external-sector, supplier-counterparty, full physical-inventory and period-opening/closing evidence are not inferred.',
        'A balanced journal posting does not by itself establish complete sector or national stock-flow coverage.'
      ]
    };
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
  async function buildStatement(countryId,profile,root,turn){
    const sourceLookupStartedAt=clockNow();
    const finance=countryRecord(root,'finance',profile,countryId)||{};
    const tradeCountry=countryRecord(root,'trade',profile,countryId)||{};
    const resource=countryRecord(root,'resource',profile,countryId)||{};
    const economy=countryRecord(root,'economy',profile,countryId)||{};
    const financeState=isObject(finance.omegaFinance)?finance.omegaFinance:{};
    const limits=runtime.rules.limits||{};
    const financeRows=Array.isArray(financeState.ledger)?financeState.ledger.slice(-bounded(limits.financeLedgerRows,500,500)):[];
    const sectorJournals=await reconcileSectorJournals({countryId,financeRows,
      financeSourceRowsTotal:Array.isArray(financeState.ledger)?financeState.ledger.length:0,
      financeLedgerRows:limits.financeLedgerRows,companyAccounts:economy.companyAccounts,
      maxCompanyAccounts:limits.maxCompanyAccounts,companyCashFlowRowsPerCompany:limits.companyCashFlowRowsPerCompany});
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
    const gdp=reconcileGDP({}),goods=reconcileGoodsFlow([]);
    const statement={
      schemaVersion:Number(runtime.rules.schemaVersion||1),modelVersion:String(runtime.rules.modelVersion||VERSION),
      countryId,countryName:profile?.name||runtime.manifest?.countries?.[countryId]?.countryName||countryId,
      turn,currency:profile?.currencyCode||profile?.currency||null,status:'PARTIAL',
      gdp:{status:gdp.status,value:null,currency:null,period:null,approaches:{
        production:{status:'UNOBSERVED',missing:['gross-output-value','intermediate-consumption','product-taxes','subsidies']},
        expenditure:{status:'UNOBSERVED',missing:['household-consumption','actual-gross-capital-formation','government-final-consumption','exports','imports']},
        income:{status:'UNOBSERVED',missing:['employee-compensation','gross-operating-surplus','mixed-income','production-taxes','subsidies']}},
        modelledReference:{value:currentGdp,currency:currentGdp===null?null:'USD',source:gdpSource,
          status:currentGdp===null?'UNOBSERVED':'MODELLED_REFERENCE_NOT_RECONCILED_NATIONAL_ACCOUNTS'}},
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
      sectorJournals:sectorJournals,
      goods:{status:inventory.stockFlowStatus,stockFlowReconciliation:goods,inventory},
      completeness:{treasuryOpeningAndFlows:fiscalPeriodAccount?treasuryReconciliation.status:'UNOBSERVED',physicalGoodsOpeningProductionConsumptionExportLoss:goods.status,
        sectorJournalDoubleEntryIntegrity:sectorJournals.integrityStatus,
        sectorJournalSourceCoverage:sectorJournals.sourceCoverageStatus,
        gdpProductionApproach:'UNOBSERVED',gdpExpenditureApproach:'UNOBSERVED',gdpIncomeApproach:'UNOBSERVED',
        sourceWindowBounded:true},
      provenance:{roster:runtime.rules.roster?.manifestPath||'minister_country_roster_manifest_v1.json',
        baselineYear:runtime.profileMetadata?.baselineYear??null,
        accountingAuthority:'ECONOMY_OWNED_READ_ONLY_EVIDENCE_CHECKPOINT',cashSource,modelledGdpSource:gdpSource,
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
      companyCashFlowRowsObserved:sectorJournals.sourceRowsScanned,
      sourceRowsScanned:financeRows.length+trade.rowsScanned+inventory.sourceBatchCount+productionRows.length+
        sectorJournals.sourceRowsScanned
    };
    statement.sourceFingerprint=fingerprint({countryId,turn,treasury:statement.treasury,trade:statement.trade,
      industry:statement.industry,sectorJournals:statement.sectorJournals,goods:statement.goods,gdp:statement.gdp,workload:statement.workload});
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
  const API=Object.freeze({VERSION,init,processCountry,getSnapshot,diagnostics,reconcileTreasury,reconcileGoodsFlow,reconcileGDP,
    reconcileSectorJournals});
  g.Omega=g.Omega||{};g.Omega.NationalAccounts=API;g.OmegaNationalAccounts=API;
  if(typeof g.addEventListener==='function'){
    g.addEventListener('OMEGA_READY',()=>{init().catch(error=>{runtime.error=String(error?.message||error);});});
    g.addEventListener('load',()=>{init().catch(error=>{runtime.error=String(error?.message||error);});},{once:true});
  }
  if(g.document&&(g.document.readyState==='complete'||g.document.readyState==='interactive'))
    Promise.resolve().then(()=>init().catch(error=>{runtime.error=String(error?.message||error);}));
})(typeof window!=='undefined'?window:globalThis);
