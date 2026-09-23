/* OMEGA RESOURCE -> INDUSTRY -> MARKET -> FISCAL RUNTIME v1.0.0
 * Authoritative physical inventory stays under ministry-owned resource state.
 * Cross-ministry writes go through OmegaMinistryInteroperability.
 * No country-specific branches. No fabricated opening inventory.
 */
(function(g){
  'use strict';

  const VERSION='1.0.0';
  const DEFAULT_RULES={
    schemaVersion:'1.0.0',
    inventory:{legacyOpeningBalancePolicy:'PRESERVE_AND_MARK',batchConsumptionPolicy:'FIFO',sellableSurplusPolicy:'OBSERVED_INVENTORY_ONLY'},
    fiscal:{royaltyRate:0.02,resourceTaxRate:0.01,corporateTaxRate:0.20,exportDutyRate:0,otherReceiptRate:0},
    operatingAllocation:{workerIncomeRate:0.12,transportRevenueRate:0.05},
    runtime:{maxLedgerEntries:2048,maxBatches:8192},
    market:{offerFractionOfObservedInventory:0.25,minOfferQuantity:1}
  };

  const clone=(v,seen=new WeakMap())=>{
    if(v===null||typeof v!=='object')return v;
    if(seen.has(v))return seen.get(v);
    if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(clone(x,seen));return a;}
    const o={};seen.set(v,o);
    for(const k of Object.keys(v))if(k!=='__proto__'&&k!=='constructor'&&typeof v[k]!=='function'&&v[k]!==undefined)o[k]=clone(v[k]);
    return o;
  };
  const id=v=>String(v??'').trim().toUpperCase();
  const key=v=>String(v??'').trim();
  const token=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const state=()=>g.Game?.state||g.gameState||{};
  const turn=()=>num(state()?.simulation?.turn??state()?.turn??state()?.simulationTurn??g.Omega?.Simulation?.clock?.turn)??0;
  const registry=()=>g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge||g.Omega?.CanonicalIdentity||null;
  const canonical=v=>{try{const r=registry()?.resolveCountry?.(v);if(r?.id)return id(r.id);}catch(_){}return id(v);};
  const interop=()=>g.Omega?.MinistryInteroperability||g.OmegaMinistryInteroperability||null;
  const countries=()=>{
    try{return[...new Set((registry()?.list?.('COUNTRY')||registry()?.list?.()||[]).map(canonical).filter(Boolean))].sort();}
    catch(_){return Object.keys(state()?.resource||{}).map(canonical).filter(Boolean).sort();}
  };
  const rules=()=>g.__OmegaResourceEconomyRules||DEFAULT_RULES;

  function countryBucket(c,domain){
    const cid=canonical(c),root=state();
    const domainRoot=root?.[domain];
    if(!domainRoot||typeof domainRoot!=='object')return null;
    const exact=domainRoot[cid];
    if(exact&&typeof exact==='object')return exact;
    const match=Object.keys(domainRoot).find(k=>canonical(k)===cid);
    return match?domainRoot[match]:null;
  }
  function read(c,path){
    const parts=String(path||'').split('.');
    const root=countryBucket(c,parts.shift());
    let cur=root;
    for(const p of parts){if(cur==null||!Object.prototype.hasOwnProperty.call(Object(cur),p))return undefined;cur=cur[p];}
    return cur;
  }
  function dispatch(owner,commandType,c,payload={}){
    const m=interop();
    if(!m?.dispatchCommand)return{status:'UNAVAILABLE',reason:'MINISTRY_INTEROPERABILITY_UNAVAILABLE'};
    try{
      return m.dispatchCommand(owner,commandType,canonical(c),payload,{
        turn:turn(),commandType,correlationId:payload?.correlationId||payload?.transactionId||payload?.settlementId||null
      });
    }catch(e){return{status:'FAILED',reason:String(e?.message||e)};}
  }
  function emit(type,c,payload={},source='resource'){
    try{return interop()?.emitEvent?.(type,canonical(c),source,{countryId:canonical(c),...clone(payload)},{turn:turn(),correlationId:payload?.correlationId||payload?.transactionId||payload?.settlementId||null});}
    catch(_){
      try{g.dispatchEvent?.(new CustomEvent(type,{detail:{eventType:type,countryId:canonical(c),payload:clone(payload),simulationTurn:turn()}}));}catch(_2){}
      return null;
    }
  }

  async function loadRules(){
    if(g.__OmegaResourceEconomyRules)return g.__OmegaResourceEconomyRules;
    try{
      if(typeof fetch==='function'){
        const r=await fetch('./resource_economy_rules.json',{cache:'no-store'});
        if(r?.ok){
          const data=await r.json();
          g.__OmegaResourceEconomyRules={...DEFAULT_RULES,...data,
            inventory:{...DEFAULT_RULES.inventory,...(data.inventory||{})},
            fiscal:{...DEFAULT_RULES.fiscal,...(data.fiscal||{})},
            operatingAllocation:{...DEFAULT_RULES.operatingAllocation,...(data.operatingAllocation||{})},
            runtime:{...DEFAULT_RULES.runtime,...(data.runtime||{})},
            market:{...DEFAULT_RULES.market,...(data.market||{})}
          };
          return g.__OmegaResourceEconomyRules;
        }
      }
    }catch(e){g.__OmegaResourceEconomyRulesError=String(e?.message||e);}
    g.__OmegaResourceEconomyRules=clone(DEFAULT_RULES);
    return g.__OmegaResourceEconomyRules;
  }

  function normalizeCoefficients(value){
    const out={};
    if(!value)return out;
    if(Array.isArray(value)){
      for(const row of value){
        if(!row)continue;
        const rid=String(row.resourceId??row.resource??row.materialId??row.id??'').trim();
        const q=num(row.coefficient??row.quantity??row.amount??row.ratio);
        if(rid&&q!==null&&q>0)out[rid]=q;
      }
      return out;
    }
    if(typeof value==='object'){
      for(const [rid,v] of Object.entries(value)){
        const q=num(typeof v==='object'?(v.coefficient??v.quantity??v.amount??v.ratio):v);
        if(q!==null&&q>0)out[String(rid)]=q;
      }
    }
    return out;
  }

  function normalizeOutputs(value){
    return normalizeCoefficients(value);
  }

  function classifyStage(asset){
    const raw=token(asset?.stage||asset?.assetStage||asset?.facilityStage||asset?.facilityType||asset?.type||'');
    if(/processing|process|refin|benefici|smelt|mill|separat|concentrat|distill|cracker/.test(raw))return 'PROCESSING';
    if(/factory|manufact|plant|assembly|industrial|battery|petrochem|fertilizer|steel|wire|chemical/.test(raw))return 'FACTORY';
    return String(asset?.stage||asset?.assetStage||'').toUpperCase()||'UNKNOWN';
  }

  function recipeFor(asset){
    let inputs=normalizeCoefficients(asset?.inputCoefficients??asset?.inputs??asset?.inputProfile);
    let outputs=normalizeOutputs(asset?.outputProfile??asset?.outputs??asset?.outputCoefficients);
    const inputId=asset?.inputResourceId??asset?.inputResource??asset?.feedstockResourceId??asset?.feedstock;
    const outputId=asset?.outputResourceId??asset?.outputResource??asset?.productResourceId;
    if(!Object.keys(inputs).length&&inputId)inputs[String(inputId)]=1;
    if(!Object.keys(outputs).length&&outputId)outputs[String(outputId)]=1;
    let derivedOutput=false;
    if(!Object.keys(outputs).length&&Object.keys(inputs).length){
      const ontology=g.__OmegaResourceEconomyOntology||{};
      const rid0=Object.keys(inputs)[0];
      const row=ontology[token(rid0)]||ontology[String(rid0).toUpperCase()]||ontology[rid0];
      const list=Array.isArray(row?.refinedOutputs)?row.refinedOutputs.filter(Boolean):[];
      const yf=num(asset?.yieldFactor??asset?.conversionYield??asset?.processYield);
      if(list.length&&yf!==null&&yf>0){
        const share=(yf/list.length);
        for(const x of list)outputs[x]=share;
        derivedOutput=true;
      }
    }
    return {inputs,outputs,derivedOutput};
  }

  function companyIdForMine(c,resourceId){
    const mines=countryBucket(c,'resource')?.mines;
    if(Array.isArray(mines)){
      const hit=mines.find(m=>token(m?.resourceId)===token(resourceId)&&(m?.operatorKey||m?.ownerKey));
      if(hit)return String(hit.operatorKey||hit.ownerKey);
    }
    return 'STATE_RESOURCE_POOL_'+canonical(c);
  }

  function companyIdForAsset(c,asset){
    return String(asset?.companyId??asset?.ownerId??asset?.operatorId??asset?.company??('STATE_INDUSTRY_'+canonical(c)));
  }

  function batchRows(c){
    const b=read(c,'resource.batches');
    return Array.isArray(b)?b:[];
  }

  function inventoryObject(c){
    const v=read(c,'resource.inventory');
    return v&&typeof v==='object'?v:{};
  }

  function sumBatchRemaining(c){
    const sum={};
    for(const b of batchRows(c)){
      const rid=String(b?.resourceId||b?.materialIdentity||'').trim();
      const q=num(b?.remainingQuantity??b?.quantity);
      if(rid&&q!==null&&q>0)sum[rid]=(sum[rid]||0)+q;
    }
    return sum;
  }

  function reconcile(c){
    const inv=inventoryObject(c);
    const allocated=sumBatchRemaining(c);
    const gaps=[];
    for(const [rid,q] of Object.entries(inv)){
      const actual=num(q);
      if(actual===null||actual<0)gaps.push({resourceId:rid,type:'INVALID_INVENTORY_VALUE',value:q});
      else{
        const allocatedQ=num(allocated[rid])||0;
        if(Math.abs(actual-allocatedQ)>1e-9)gaps.push({resourceId:rid,type:actual>allocatedQ?'UNALLOCATED_INVENTORY':'OVERALLOCATED_BATCH_LEDGER',inventory:actual,batchAllocated:allocatedQ,delta:actual-allocatedQ});
      }
    }
    return gaps;
  }

  function materialClass(b){
    const stage=String(b?.stage||b?.materialStage||'RAW').toUpperCase();
    if(stage==='INTERMEDIATE')return 'intermediate';
    if(stage==='FINISHED')return 'finished';
    return 'raw';
  }

  function reconcileHandler(cmd,ctx){
    const c=canonical(ctx.countryId);
    const inventory=clone(ctx.stateTransaction.get('resource.inventory')||{});
    const batches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    const seen={};
    for(const b of batches){
      const rid=String(b?.resourceId||b?.materialIdentity||'').trim();
      const q=num(b?.remainingQuantity??b?.quantity)||0;
      if(rid&&q>0)seen[rid]=(seen[rid]||0)+q;
    }
    for(const [rid,q0] of Object.entries(inventory)){
      const q=num(q0);
      if(q===null||q<0)continue;
      const diff=q-(num(seen[rid])||0);
      if(diff>0){
        const batch={
          batchId:'LEGACY_OPENING_'+canonical(c)+'_'+token(rid),
          resourceId:rid,materialIdentity:rid,quantity:diff,remainingQuantity:diff,unit:null,
          stage:'RAW',ownerCountryCode:c,ownerCompanyId:'UNKNOWN_SOURCE',sourceBatchIds:[],
          provenance:{source:'PRE_EXISTING_RESOURCE_INVENTORY',status:'UNALLOCATED_LEGACY_BALANCE',simulationTurn:turn()}
        };
        batches.push(batch);
        ledger.push({type:'INVENTORY_RECONCILIATION',resourceId:rid,quantity:diff,policy:'PRESERVE_AND_MARK',status:'LEGACY_UNALLOCATED_BALANCE',turn:turn()});
      }else if(diff<0){
        ledger.push({type:'INVENTORY_RECONCILIATION',resourceId:rid,quantity:Math.abs(diff),policy:'OBSERVE_MISMATCH',status:'BATCH_LEDGER_EXCEEDS_INVENTORY',turn:turn()});
      }
    }
    const lim=num(rules()?.runtime?.maxBatches)||8192;
    while(batches.length>lim)batches.shift();
    const ledLim=num(rules()?.runtime?.maxLedgerEntries)||2048;
    while(ledger.length>ledLim)ledger.shift();
    ctx.stateTransaction.set('resource.batches',batches);
    ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    ctx.stateTransaction.set('resource.inventoryIntegrity',{
      status:reconcile(c).length?'DEGRADED':'HEALTHY',
      checkedTurn:turn(),
      gaps:reconcile(c).slice(-64),
      authority:'RESOURCE_INVENTORY_AUTHORITY'
    });
    return{accepted:true,countryId:c,status:reconcile(c).length?'DEGRADED':'HEALTHY',gaps:reconcile(c).slice(-64)};
  }

  function registerBatchHandler(cmd,ctx){
    const c=canonical(ctx.countryId),p=cmd?.payload||{};
    const row=clone(p.batch||p.producedBatch||p);
    const rid=String(row?.resourceId||row?.materialIdentity||p.resourceId||'').trim();
    const q=num(row?.quantity??row?.approvedQuantity??p.quantity);
    if(!rid||q===null||q<=0)return{accepted:false,reason:'BATCH_INPUT_INVALID'};
    const batches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const batch={
      batchId:String(row?.batchId||p.batchId||('BATCH_'+turn()+'_'+canonical(c)+'_'+token(rid)+'_'+String(batches.length+1))),
      resourceId:rid,materialIdentity:String(row?.materialIdentity||rid),quantity:q,remainingQuantity:q,
      unit:row?.unit??null,stage:String(row?.stage||'RAW').toUpperCase(),
      ownerCountryCode:c,ownerCompanyId:String(row?.ownerCompanyId||p.ownerCompanyId||companyIdForMine(c,rid)),
      sourceBatchIds:Array.isArray(row?.sourceBatchIds)?row.sourceBatchIds.slice():[],
      extractionReference:row?.extractionReference||p.extractionId||null,
      transformReference:row?.transformReference||null,
      processId:row?.processId||null,timestampTick:turn(),
      provenance:clone(row?.provenance||p.provenance||{source:'OMEGA_RESOURCE_EXTRACTION_COMPLETED',simulationTurn:turn()})
    };
    if(batches.some(x=>String(x?.batchId)===batch.batchId))return{accepted:true,duplicate:true,batchId:batch.batchId};
    batches.push(batch);
    const lim=num(rules()?.runtime?.maxBatches)||8192;while(batches.length>lim)batches.shift();
    ctx.stateTransaction.set('resource.batches',batches);
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'BATCH_CREATED',batchId:batch.batchId,resourceId:rid,quantity:q,stage:batch.stage,turn:turn(),source:batch.extractionReference?'EXTRACTION':'RUNTIME'});
    while(ledger.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))ledger.shift();
    ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    emit('OMEGA_RESOURCE_BATCH_CREATED',c,{batch},cmd.commandId);
    return{accepted:true,batch};
  }

  function consumeHandler(cmd,ctx){
    const c=canonical(ctx.countryId),p=cmd?.payload||{},rid=String(p.resourceId||'').trim(),q=num(p.quantity);
    if(!rid||q===null||q<=0)return{accepted:false,reason:'CONSUME_INPUT_INVALID'};
    const inv=clone(ctx.stateTransaction.get('resource.inventory')||{});
    const current=num(inv[rid])??num(inv[Object.keys(inv).find(k=>token(k)===token(rid))]);
    if(current===null||current<q)return{accepted:false,reason:'RESOURCE_INVENTORY_INSUFFICIENT'};
    const k=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(x=>token(x)===token(rid))||rid;
    inv[k]=current-q;
    const batches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    let remaining=q;
    const consumed=[];
    for(const b of batches){
      if(remaining<=1e-9)break;
      if(token(b?.resourceId||b?.materialIdentity)!==token(rid))continue;
      const rq=num(b?.remainingQuantity??b?.quantity)||0;
      if(rq<=0)continue;
      const take=Math.min(rq,remaining);
      b.remainingQuantity=rq-take;
      remaining-=take;
      consumed.push({batchId:b.batchId,quantity:take,stage:b.stage,ownerCompanyId:b.ownerCompanyId});
    }
    if(remaining>1e-9)consumed.push({batchId:null,quantity:remaining,stage:'LEGACY_UNALLOCATED',ownerCompanyId:'UNKNOWN_SOURCE'});
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'INVENTORY_CONSUMED',resourceId:rid,quantity:q,reason:p.reason||'PROCESSING_OR_INTERNAL_SALE',turn:turn(),consumed});
    while(ledger.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))ledger.shift();
    ctx.stateTransaction.set('resource.inventory',inv);
    ctx.stateTransaction.set('resource.batches',batches);
    ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    return{accepted:true,resourceId:rid,quantity:q,consumed};
  }

  function addHandler(cmd,ctx){
    const c=canonical(ctx.countryId),p=cmd?.payload||{},rid=String(p.resourceId||'').trim(),q=num(p.quantity);
    if(!rid||q===null||q<=0)return{accepted:false,reason:'ADD_INPUT_INVALID'};
    const inv=clone(ctx.stateTransaction.get('resource.inventory')||{});
    const k=Object.prototype.hasOwnProperty.call(inv,rid)?rid:Object.keys(inv).find(x=>token(x)===token(rid))||rid;
    inv[k]=(num(inv[k])||0)+q;
    const batches=Array.isArray(ctx.stateTransaction.get('resource.batches'))?clone(ctx.stateTransaction.get('resource.batches')):[];
    const batch={
      batchId:String(p.batchId||('BATCH_'+turn()+'_'+canonical(c)+'_'+token(rid)+'_'+String(batches.length+1))),
      resourceId:rid,materialIdentity:rid,quantity:q,remainingQuantity:q,unit:p.unit??null,
      stage:String(p.stage||'FINISHED').toUpperCase(),ownerCountryCode:c,ownerCompanyId:String(p.ownerCompanyId||'STATE_INDUSTRY_'+c),
      sourceBatchIds:Array.isArray(p.sourceBatchIds)?p.sourceBatchIds.slice():[],transformReference:p.transactionId||null,
      processId:p.processId||null,timestampTick:turn(),provenance:clone(p.provenance||{source:'OMEGA_RESOURCE_INDUSTRY_RUNTIME',simulationTurn:turn()})
    };
    batches.push(batch);
    const ledger=Array.isArray(ctx.stateTransaction.get('resource.inventoryLedger'))?clone(ctx.stateTransaction.get('resource.inventoryLedger')):[];
    ledger.push({type:'INVENTORY_CREATED',resourceId:rid,quantity:q,stage:batch.stage,turn:turn(),batchId:batch.batchId,sourceBatchIds:batch.sourceBatchIds});
    while(ledger.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))ledger.shift();
    const lim=num(rules()?.runtime?.maxBatches)||8192;while(batches.length>lim)batches.shift();
    ctx.stateTransaction.set('resource.inventory',inv);
    ctx.stateTransaction.set('resource.batches',batches);
    ctx.stateTransaction.set('resource.inventoryLedger',ledger);
    emit('OMEGA_RESOURCE_INVENTORY_CHANGED',c,{resourceId:rid,delta:q,newQuantity:inv[k],stage:batch.stage,transactionId:p.transactionId||null},cmd.commandId);
    return{accepted:true,resourceId:rid,quantity:q,batch};
  }

  function publishEconomyStateHandler(cmd,ctx){
    const c=canonical(ctx.countryId),p=cmd?.payload||{};
    ctx.stateTransaction.set('economy.industrialRuntime',clone(p.industrialRuntime||{}));
    ctx.stateTransaction.set('economy.companyAccounts',clone(p.companyAccounts||{}));
    ctx.stateTransaction.set('economy.workerIncome',clone(p.workerIncome||{}));
    ctx.stateTransaction.set('economy.supplierRevenue',clone(p.supplierRevenue||{}));
    ctx.stateTransaction.set('economy.factoryOutput',clone(p.factoryOutput||{}));
    emit('OMEGA_INDUSTRIAL_RUNTIME_PUBLISHED',c,{turn:turn(),companyCount:Object.keys(p.companyAccounts||{}).length},cmd.commandId);
    return{accepted:true,countryId:c,turn:turn()};
  }

  function companyFlowHandler(cmd,ctx){
    const p=cmd?.payload||{},companyId=String(p.companyId||'').trim(),amount=num(p.amount);
    if(!companyId||amount===null)return{accepted:false,reason:'COMPANY_FLOW_INPUT_INVALID'};
    const accounts=clone(ctx.stateTransaction.get('economy.companyAccounts')||{});
    const account=accounts[companyId]&&typeof accounts[companyId]==='object'?accounts[companyId]:{
      companyId,openingBalanceStatus:'UNKNOWN',cashFlowSinceRuntimeStart:0,grossRevenue:0,taxPaid:0,workerIncomePaid:0,transportPaid:0,supplierRevenue:0
    };
    const direction=String(p.direction||'CREDIT').toUpperCase();
    account.cashFlowSinceRuntimeStart=(num(account.cashFlowSinceRuntimeStart)||0)+(direction==='DEBIT'?-amount:amount);
    if(direction==='CREDIT'){
      account.grossRevenue=(num(account.grossRevenue)||0)+(num(p.grossRevenue)||amount);
      account.supplierRevenue=(num(account.supplierRevenue)||0)+(num(p.supplierRevenue)||amount);
    }else{
      if(p.category==='TAX')account.taxPaid=(num(account.taxPaid)||0)+amount;
      if(p.category==='WORKER_INCOME')account.workerIncomePaid=(num(account.workerIncomePaid)||0)+amount;
      if(p.category==='TRANSPORT')account.transportPaid=(num(account.transportPaid)||0)+amount;
    }
    accounts[companyId]=account;
    ctx.stateTransaction.set('economy.companyAccounts',accounts);
    return{accepted:true,companyId,amount,direction};
  }

  function workerFlowHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'WORKER_FLOW_INVALID'};
    const existing=clone(ctx.stateTransaction.get('economy.workerIncome')||{});
    existing.totalSinceRuntimeStart=(num(existing.totalSinceRuntimeStart)||0)+amount;
    existing.lastTurn=turn();existing.lastStatus='SIMULATION_RULE';
    ctx.stateTransaction.set('economy.workerIncome',existing);
    return{accepted:true,amount};
  }

  function supplierFlowHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'SUPPLIER_FLOW_INVALID'};
    const existing=clone(ctx.stateTransaction.get('economy.supplierRevenue')||{});
    existing.totalSinceRuntimeStart=(num(existing.totalSinceRuntimeStart)||0)+amount;existing.lastTurn=turn();
    ctx.stateTransaction.set('economy.supplierRevenue',existing);
    return{accepted:true,amount};
  }

  function fiscalReceiptHandler(cmd,ctx){
    const p=cmd?.payload||{},receipt=clone(p.receipt||p),total=num(receipt.total);
    if(total===null||total<0)return{accepted:false,reason:'FISCAL_RECEIPT_INVALID'};
    const fiscal=clone(ctx.stateTransaction.get('finance.resourceFiscal')||{
      cumulative:{royalty:0,resourceTax:0,corporateTax:0,exportDuty:0,other:0,total:0},
      thisTurn:{royalty:0,resourceTax:0,corporateTax:0,exportDuty:0,other:0,total:0},
      lastTurn:null
    });
    const keys=['royalty','resourceTax','corporateTax','exportDuty','other'];
    for(const k of keys){
      const q=num(receipt[k])||0;
      fiscal.cumulative[k]=(num(fiscal.cumulative[k])||0)+q;
      fiscal.thisTurn[k]=(num(fiscal.thisTurn[k])||0)+q;
    }
    fiscal.cumulative.total=(num(fiscal.cumulative.total)||0)+total;
    fiscal.thisTurn.total=(num(fiscal.thisTurn.total)||0)+total;
    fiscal.lastTurn=turn();
    fiscal.policySource='resource_economy_rules.json';
    const ledger=Array.isArray(ctx.stateTransaction.get('finance.resourceFiscalLedger'))?clone(ctx.stateTransaction.get('finance.resourceFiscalLedger')):[];
    ledger.push({...receipt,turn:turn()});
    while(ledger.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))ledger.shift();
    const currentRevenue=num(ctx.stateTransaction.get('finance.revenue'));
    const currentTaxRevenue=num(ctx.stateTransaction.get('finance.taxRevenue'));
    const currentAvailable=num(ctx.stateTransaction.get('finance.available'));
    const currentReserves=num(ctx.stateTransaction.get('finance.reserves'));
    ctx.stateTransaction.set('finance.resourceFiscal',fiscal);
    ctx.stateTransaction.set('finance.resourceFiscalLedger',ledger);
    ctx.stateTransaction.set('finance.revenue',(currentRevenue===null?0:currentRevenue)+total);
    ctx.stateTransaction.set('finance.taxRevenue',(currentTaxRevenue===null?0:currentTaxRevenue)+total);
    if(currentAvailable!==null)ctx.stateTransaction.set('finance.available',currentAvailable+total);
    else if(currentReserves!==null)ctx.stateTransaction.set('finance.reserves',currentReserves+total);
    return{accepted:true,total,treasuryLiquidityMutation:currentAvailable!==null?'AVAILABLE':(currentReserves!==null?'RESERVES':'UNOBSERVED_BASELINE')};
  }

  function domesticSaleHandler(cmd,ctx){
    const p=cmd?.payload||{},sale=clone(p.sale||p);
    const rows=Array.isArray(ctx.stateTransaction.get('trade.domesticSales'))?clone(ctx.stateTransaction.get('trade.domesticSales')):[];
    rows.push({...sale,turn:turn(),status:sale.status||'SETTLED'});
    while(rows.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))rows.shift();
    ctx.stateTransaction.set('trade.domesticSales',rows);
    return{accepted:true,sale};
  }

  function offerBookHandler(cmd,ctx){
    const p=cmd?.payload||{},offers=Array.isArray(p.offers)?clone(p.offers):[];
    const existing=ctx.stateTransaction.get('trade.offerBook');
    let rows=[];
    if(Array.isArray(existing))rows=clone(existing);
    else if(existing&&typeof existing==='object'){
      for(const [rid,v] of Object.entries(existing)){
        if(Array.isArray(v))for(const x of v)rows.push({...clone(x),resourceId:x?.resourceId||rid});
        else if(v&&typeof v==='object')rows.push({...clone(v),resourceId:v?.resourceId||rid});
      }
    }
    rows=rows.filter(x=>x?.source!=='OMEGA_RESOURCE_ECON_AUTO_OFFER');
    rows.push(...offers);
    while(rows.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))rows.shift();
    ctx.stateTransaction.set('trade.offerBook',rows);
    return{accepted:true,offerCount:offers.length,totalRows:rows.length};
  }

  function transportFlowHandler(cmd,ctx){
    const p=cmd?.payload||{},amount=num(p.amount);
    if(amount===null||amount<0)return{accepted:false,reason:'TRANSPORT_FLOW_INVALID'};
    const existing=clone(ctx.stateTransaction.get('transport.resourceRevenue')||{});
    existing.totalSinceRuntimeStart=(num(existing.totalSinceRuntimeStart)||0)+amount;existing.lastTurn=turn();
    ctx.stateTransaction.set('transport.resourceRevenue',existing);
    return{accepted:true,amount};
  }

  function commandHandlersInstall(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    try{
      const actions=[
        ['OMEGA_RESOURCE_ECON_RECONCILE_INVENTORY','resource',reconcileHandler],
        ['OMEGA_RESOURCE_ECON_REGISTER_BATCH','resource',registerBatchHandler],
        ['OMEGA_RESOURCE_ECON_CONSUME_INVENTORY','resource',consumeHandler],
        ['OMEGA_RESOURCE_ECON_ADD_INVENTORY','resource',addHandler],
        ['OMEGA_RESOURCE_ECON_PUBLISH_ECONOMY','economy',publishEconomyStateHandler],
        ['OMEGA_RESOURCE_ECON_RECORD_DOMESTIC_SALE','trade',domesticSaleHandler],
        ['OMEGA_RESOURCE_ECON_PUBLISH_OFFER_BOOK','trade',offerBookHandler],
        ['OMEGA_RESOURCE_ECON_COMPANY_FLOW','economy',companyFlowHandler],
        ['OMEGA_RESOURCE_ECON_WORKER_FLOW','economy',workerFlowHandler],
        ['OMEGA_RESOURCE_ECON_SUPPLIER_FLOW','economy',supplierFlowHandler],
        ['OMEGA_RESOURCE_ECON_FISCAL_RECEIPT','finance',fiscalReceiptHandler],
        ['OMEGA_RESOURCE_ECON_TRANSPORT_REVENUE','transport',transportFlowHandler]
      ];
      for(const [type,owner,handler] of actions){
        m.registerAction?.(type,{actionId:type,stateOwnerMinistry:owner,authority:'OMEGA_RESOURCE_ECONOMY_RUNTIME'});
        m.registerCommandHandler(type,owner,handler);
      }
      return true;
    }catch(_){return false;}
  }

  function makeProductionState(c){
    const econ=countryBucket(c,'economy')||{};
    const assets=Array.isArray(econ.productionAssets)?econ.productionAssets:[];
    const inv=inventoryObject(c);
    const records=[],outputs={},blocks=[];
    for(const asset of assets){
      const facilityId=String(asset?.projectId??asset?.assetId??asset?.id??asset?.siteId??('ASSET_'+records.length));
      const stage=classifyStage(asset);
      const recipe=recipeFor(asset);
      const capacity=num(asset?.capacity??asset?.productionCapacity??asset?.throughput);
      const row={
        facilityId,stage,status:'BLOCKED',reason:null,capacityObserved:capacity,
        companyId:companyIdForAsset(c,asset),inputCoefficients:recipe.inputs,outputProfile:recipe.outputs,derivedOutputRule:recipe.derivedOutput
      };
      if(capacity===null||capacity<=0){row.reason='PRODUCTION_CAPACITY_UNAVAILABLE';blocks.push(row);records.push(row);continue;}
      if(!Object.keys(recipe.inputs).length){row.reason='INPUT_RECIPE_UNOBSERVED';blocks.push(row);records.push(row);continue;}
      if(!Object.keys(recipe.outputs).length){row.reason='OUTPUT_RECIPE_UNOBSERVED';blocks.push(row);records.push(row);continue;}
      let scale=capacity;
      const inputsAvailable={};
      for(const [rid,coef] of Object.entries(recipe.inputs)){
        const available=num(inv[rid])||0;
        inputsAvailable[rid]=available;
        scale=Math.min(scale,available/coef);
      }
      scale=Math.max(0,scale);
      if(scale<=0){row.reason='INPUT_STOCK_UNAVAILABLE';row.inputsAvailable=inputsAvailable;blocks.push(row);records.push(row);continue;}
      row.status='READY';
      row.plannedScale=scale;
      row.inputsAvailable=inputsAvailable;
      row.computedOutputs={};
      for(const [rid,coef] of Object.entries(recipe.outputs))row.computedOutputs[rid]=scale*coef;
      records.push(row);
    }
    return{assets,records,outputs,blocks};
  }

  function executeFactories(c){
    const p=makeProductionState(c);
    const executed=[];
    for(const row of p.records){
      if(row.status!=='READY')continue;
      const asset=(p.assets||[]).find(a=>String(a?.projectId??a?.assetId??a?.id??a?.siteId??'')===row.facilityId);
      if(!asset)continue;
      const txId='IND-'+turn()+'-'+canonical(c)+'-'+row.facilityId+'-'+String(executed.length+1);
      let sourceBatchIds=[],consumptions=[];
      for(const [rid,coef] of Object.entries(row.inputCoefficients)){
        const qty=row.plannedScale*coef;
        const result=dispatch('resource','OMEGA_RESOURCE_ECON_CONSUME_INVENTORY',c,{
          resourceId:rid,quantity:qty,reason:row.stage==='FACTORY'?'FACTORY_INPUT_CONSUMPTION':'PROCESSING_INPUT_CONSUMPTION',
          correlationId:txId
        });
        if(result?.status!=='APPLIED'){
          row.status='BLOCKED';row.reason=result?.result?.reason||'INPUT_CONSUMPTION_FAILED';break;
        }
        const consumed=result.result?.consumed||[];
        consumptions.push({resourceId:rid,quantity:qty,consumed});
        for(const x of consumed)if(x.batchId)sourceBatchIds.push(x.batchId);
      }
      if(row.status!=='READY')continue;
      for(const [rid,q] of Object.entries(row.computedOutputs)){
        const stage=row.stage==='PROCESSING'?'INTERMEDIATE':'FINISHED';
        const add=dispatch('resource','OMEGA_RESOURCE_ECON_ADD_INVENTORY',c,{
          resourceId:rid,quantity:q,stage,ownerCompanyId:row.companyId,sourceBatchIds,transactionId:txId,
          unit:asset?.unit||null,provenance:{source:'OMEGA_RESOURCE_ECONOMY_RUNTIME',facilityId:row.facilityId,simulationTurn:turn(),derivedOutputRule:row.derivedOutputRule}
        });
        if(add?.status!=='APPLIED'){
          row.status='BLOCKED';row.reason=add?.result?.reason||'OUTPUT_INVENTORY_COMMIT_FAILED';break;
        }
      }
      if(row.status!=='READY')continue;
      for(const item of consumptions)settleDomesticInput(c,item.resourceId,item.quantity,item.consumed,row.companyId,row.facilityId,txId);
      executed.push({
        transactionId:txId,countryId:canonical(c),facilityId:row.facilityId,companyId:row.companyId,stage:row.stage,
        inputQuantities:Object.fromEntries(Object.entries(row.inputCoefficients).map(([rid,coef])=>[rid,row.plannedScale*coef])),
        outputQuantities:clone(row.computedOutputs),sourceBatchIds,turn:turn(),status:'COMPLETED',derivedOutputRule:row.derivedOutputRule
      });
      emit(row.stage==='PROCESSING'?'OMEGA_RESOURCE_PROCESSING_COMPLETED':'OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',c,executed[executed.length-1]);
    }
    return{...p,executed};
  }

  function appendIndustrialLedger(c,executed,blocks){
    const econ=countryBucket(c,'economy')||{};
    const runtime=clone(econ.industrialRuntime||{});
    runtime.lastTurn=turn();
    runtime.facilities=executed.concat(blocks||[]);
    runtime.productionLedger=(Array.isArray(runtime.productionLedger)?runtime.productionLedger:[]).concat(executed).slice(-(num(rules()?.runtime?.maxLedgerEntries)||2048));
    runtime.blockedFacilities=(blocks||[]).slice(-256);
    runtime.status=blocks?.length?'DEGRADED':'HEALTHY';
    return runtime;
  }

  function publishMarketOffers(c){
    const inv=inventoryObject(c),offers=[],fraction=Math.max(0,Math.min(1,num(rules()?.market?.offerFractionOfObservedInventory)??0.25)),minQ=Math.max(0,num(rules()?.market?.minOfferQuantity)??1);
    for(const [rid,q0] of Object.entries(inv)){
      const q=num(q0)||0;if(q<minQ)continue;
      const statePrice=num(read(c,'trade.marketPrice')?.[rid]);
      let price=statePrice;
      if(price===null&&typeof g.OmegaGlobalMarket?.localPrice==='function')price=num(g.OmegaGlobalMarket.localPrice(c,rid));
      if(price===null||price<=0)continue;
      const offerQuantity=q*fraction;if(offerQuantity<minQ)continue;
      offers.push({offerId:'AUTO-OFFER-'+turn()+'-'+canonical(c)+'-'+token(rid),resourceId:rid,quantity:offerQuantity,available:offerQuantity,price,unitPrice:price,countryId:canonical(c),source:'OMEGA_RESOURCE_ECON_AUTO_OFFER',referenceOnly:false,simulationTurn:turn()});
    }
    return dispatch('trade','OMEGA_RESOURCE_ECON_PUBLISH_OFFER_BOOK',c,{offers,correlationId:'AUTO-OFFER-'+turn()+'-'+canonical(c)});
  }

  function processTurnCountry(c){
    const recBefore=countryBucket(c,'resource')||{};
    const beforeInv=clone(recBefore.inventory||{});
    const recon=dispatch('resource','OMEGA_RESOURCE_ECON_RECONCILE_INVENTORY',c,{correlationId:'RESOURCE-RECON-'+turn()+'-'+canonical(c)});
    const production=executeFactories(c);
    const afterInv=countryBucket(c,'resource')||{};
    const after=clone(afterInv.inventory||{});
    const deltas={};
    const resourceIds=[...new Set([...Object.keys(beforeInv),...Object.keys(after)])];
    for(const rid of resourceIds)deltas[rid]=(num(after[rid])||0)-(num(beforeInv[rid])||0);
    const runtime=appendIndustrialLedger(c,production.executed,production.blocks);
    const companyAccounts=clone(countryBucket(c,'economy')?.companyAccounts||{});
    const workerIncome=clone(countryBucket(c,'economy')?.workerIncome||{});
    const supplierRevenue=clone(countryBucket(c,'economy')?.supplierRevenue||{});
    const factoryOutput={};
    for(const e of production.executed)for(const [rid,q] of Object.entries(e.outputQuantities))factoryOutput[rid]=(factoryOutput[rid]||0)+q;
    publishMarketOffers(c);
    dispatch('economy','OMEGA_RESOURCE_ECON_PUBLISH_ECONOMY',c,{
      industrialRuntime:runtime,companyAccounts,workerIncome,supplierRevenue,factoryOutput,
      correlationId:'RESOURCE-ECO-PUBLISH-'+turn()+'-'+canonical(c)
    });
    emit('OMEGA_RESOURCE_INVENTORY_RECONCILED',c,{turn:turn(),reconciliation:recon?.result||recon?.reason||null,deltas,executed:production.executed.length,blocked:production.blocks.length});
    return{
      countryId:canonical(c),turn:turn(),
      mineCount:Array.isArray(recBefore.mines)?recBefore.mines.length:0,
      inventoryBefore:beforeInv,inventoryAfter:after,deltas,
      factoriesExecuted:production.executed.length,factoriesBlocked:production.blocks.length,
      productionLedger:production.executed,blockedFacilities:production.blocks
    };
  }

  function marketProjection(){
    const books=g.__OmegaMarketBooks||{};
    const resources={};
    for(const [rid,row] of Object.entries(books))resources[rid]={...clone(row?.clearing||{}),history:clone(row?.history||[])};
    return{turn:turn(),numeraire:'USD',resources};
  }

  function republishMarket(){
    if(typeof g.OmegaGlobalMarket?.rebuild==='function')g.OmegaGlobalMarket.rebuild();
    const snapshot=marketProjection();
    for(const c of countries()){
      dispatch('trade','OMEGA_MARKET_PUBLISH_PROJECTION',c,{snapshot,correlationId:'MARKET-ECO-'+turn()+'-'+c});
    }
  }

  function clearTradeAfterProduction(){
    try{g.OmegaGlobalTrade?.processAll?.();}catch(_){}
  }

  function extractPayload(evt){
    return evt?.detail?.payload||evt?.detail?.data?.payload||evt?.detail||{};
  }

  function fiscalForSale(countryId,sale){
    const r=rules(),gross=num(sale?.totalValue??sale?.sellerTotal??sale?.amount);
    if(gross===null||gross<0)return null;
    const royalty=gross*(num(r.fiscal.royaltyRate)||0);
    const resourceTax=gross*(num(r.fiscal.resourceTaxRate)||0);
    const corporateTax=gross*(num(r.fiscal.corporateTaxRate)||0);
    const exportDuty=(String(sale?.direction||'EXPORT').toUpperCase()==='EXPORT'?gross*(num(r.fiscal.exportDutyRate)||0):0);
    const other=gross*(num(r.fiscal.otherReceiptRate)||0);
    const total=royalty+resourceTax+corporateTax+exportDuty+other;
    return{gross,royalty,resourceTax,corporateTax,exportDuty,other,total,currency:sale?.sellerCurrency||sale?.currency||null,policySource:'resource_economy_rules.json'};
  }

  function findSupplierCompany(c,resourceId){
    const econ=countryBucket(c,'economy')||{};
    const owners=econ.industrialRuntime?.materialOwners;
    if(owners?.[resourceId])return String(owners[resourceId]);
    return companyIdForMine(c,resourceId);
  }

  function settleDomesticInput(c,resourceId,quantity,consumed,buyerCompany,facilityId,transactionId){
    const grossUnit=num(read(c,'trade.marketPrice')?.[resourceId]);
    const unitPrice=grossUnit!==null?grossUnit:(typeof g.OmegaGlobalMarket?.localPrice==='function'?num(g.OmegaGlobalMarket.localPrice(c,resourceId)):null);
    const q=num(quantity)||0;
    const suppliers={};
    for(const row of Array.isArray(consumed)?consumed:[]){
      const owner=String(row?.ownerCompanyId||'').trim();
      const rq=num(row?.quantity)||0;
      if(owner&&owner!=='UNKNOWN_SOURCE'&&rq>0)suppliers[owner]=(suppliers[owner]||0)+rq;
    }
    if(!Object.keys(suppliers).length)suppliers[companyIdForMine(c,resourceId)]=q;
    const totalSupplierQty=Object.values(suppliers).reduce((s,v)=>s+v,0)||q;
    const sale={
      saleId:'DOM-'+turn()+'-'+canonical(c)+'-'+token(resourceId)+'-'+String(facilityId)+'-'+String(transactionId),
      transactionId,facilityId,countryId:canonical(c),resourceId,quantity:q,buyerCompanyId:buyerCompany,
      supplierAllocations:clone(suppliers),direction:'DOMESTIC',simulationTurn:turn()
    };
    if(unitPrice===null||unitPrice<=0){
      sale.status='PHYSICAL_TRANSFER_COMPLETED';
      sale.paymentStatus='UNOBSERVED';
      sale.valuationStatus='UNOBSERVED_MARKET_PRICE';
      dispatch('trade','OMEGA_RESOURCE_ECON_RECORD_DOMESTIC_SALE',c,{sale,correlationId:sale.saleId});
      return sale;
    }
    sale.unitPrice=unitPrice;sale.totalValue=q*unitPrice;sale.status='SETTLED';sale.paymentStatus='SETTLED';sale.valuationStatus='OBSERVED_RUNTIME_MARKET_PRICE';
    for(const [supplier,sourceQty] of Object.entries(suppliers)){
      const share=sourceQty/totalSupplierQty;
      const supplierGross=sale.totalValue*share;
      dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:supplier,amount:supplierGross,direction:'CREDIT',grossRevenue:supplierGross,supplierRevenue:supplierGross,category:'DOMESTIC_SUPPLY',saleId:sale.saleId});
      const f=fiscalForSale(c,{totalValue:supplierGross,direction:'DOMESTIC',currency:null});
      if(f&&f.total>0){
        dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:supplier,amount:f.total,direction:'DEBIT',category:'TAX',saleId:sale.saleId});
        dispatch('finance','OMEGA_RESOURCE_ECON_FISCAL_RECEIPT',c,{receipt:{...f,saleId:sale.saleId,resourceId,companyId:supplier,direction:'DOMESTIC'},correlationId:sale.saleId});
      }
      const worker=supplierGross*(num(rules()?.operatingAllocation?.workerIncomeRate)||0);
      const transport=supplierGross*(num(rules()?.operatingAllocation?.transportRevenueRate)||0);
      if(worker>0){
        dispatch('economy','OMEGA_RESOURCE_ECON_WORKER_FLOW',c,{amount:worker,saleId:sale.saleId});
        dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:supplier,amount:worker,direction:'DEBIT',category:'WORKER_INCOME',saleId:sale.saleId});
      }
      if(transport>0){
        dispatch('transport','OMEGA_RESOURCE_ECON_TRANSPORT_REVENUE',c,{amount:transport,saleId:sale.saleId});
        dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:supplier,amount:transport,direction:'DEBIT',category:'TRANSPORT',saleId:sale.saleId});
      }
    }
    dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',c,{companyId:buyerCompany,amount:sale.totalValue,direction:'DEBIT',category:'FACTORY_INPUT_PURCHASE',saleId:sale.saleId});
    dispatch('economy','OMEGA_RESOURCE_ECON_SUPPLIER_FLOW',c,{amount:sale.totalValue,saleId:sale.saleId});
    dispatch('trade','OMEGA_RESOURCE_ECON_RECORD_DOMESTIC_SALE',c,{sale,correlationId:sale.saleId});
    emit('OMEGA_RESOURCE_DOMESTIC_SALE_SETTLED',c,sale,'trade');
    return sale;
  }

  function recordMaterialOwner(c,execution){
    const assetCompany=String(execution.companyId||'').trim();if(!assetCompany)return;
    const econ=countryBucket(c,'economy')||{};
    const owners=clone(econ.industrialRuntime?.materialOwners||{});
    for(const rid of Object.keys(execution.outputQuantities||{}))owners[rid]=assetCompany;
    const runtime=clone(econ.industrialRuntime||{});runtime.materialOwners=owners;runtime.lastTurn=turn();
    dispatch('economy','OMEGA_RESOURCE_ECON_PUBLISH_ECONOMY',c,{
      industrialRuntime:runtime,companyAccounts:clone(econ.companyAccounts||{}),workerIncome:clone(econ.workerIncome||{}),
      supplierRevenue:clone(econ.supplierRevenue||{}),factoryOutput:clone(econ.factoryOutput||{})
    });
  }

  function fiscalizeTradeEvent(evt){
    const sale=extractPayload(evt);
    const settlementId=String(sale?.settlementId||'').trim();
    if(!settlementId||g.__OmegaResourceFiscalizedSettlements?.has(settlementId))return;
    if(!g.__OmegaResourceFiscalizedSettlements)g.__OmegaResourceFiscalizedSettlements=new Set();
    g.__OmegaResourceFiscalizedSettlements.add(settlementId);
    const seller=canonical(sale?.targetCountryId||sale?.sellerCountryId||sale?.countryId);
    const rid=String(sale?.resourceId||'').trim();
    if(!seller||!rid)return;
    const gross=num(sale?.totalValue??sale?.sellerTotal);if(gross===null)return;
    const companyId=findSupplierCompany(seller,rid);
    const ruleset=rules();
    const clearing=dispatch('finance','OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY',seller,{
      amount:gross,settlementId,companyId,correlationId:settlementId
    });
    if(clearing?.status==='APPLIED'){
      dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId,amount:gross,direction:'CREDIT',grossRevenue:gross,supplierRevenue:gross,category:'SUPPLIER_SALE',settlementId});
    }
    const fiscal=fiscalForSale(seller,{...sale,direction:'EXPORT'});
    if(fiscal&&fiscal.total>0){
      dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId,amount:fiscal.total,direction:'DEBIT',category:'TAX',settlementId});
      dispatch('finance','OMEGA_RESOURCE_ECON_FISCAL_RECEIPT',seller,{receipt:{...fiscal,settlementId,sellerCountryId:seller,resourceId:rid,companyId},correlationId:settlementId});
    }
    const alloc=ruls=>{
      const worker=g.__OmegaResourceEconomyRules.operatingAllocation.workerIncomeRate;
      const transport=g.__OmegaResourceEconomyRules.operatingAllocation.transportRevenueRate;
      return{worker:gross*(num(worker)||0),transport:gross*(num(transport)||0)};
    };
    const a=alloc(ruleset);
    if(a.worker>0){
      dispatch('economy','OMEGA_RESOURCE_ECON_WORKER_FLOW',seller,{amount:a.worker,settlementId});
      dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId,amount:a.worker,direction:'DEBIT',category:'WORKER_INCOME',settlementId});
    }
    if(a.transport>0){
      dispatch('transport','OMEGA_RESOURCE_ECON_TRANSPORT_REVENUE',seller,{amount:a.transport,settlementId});
      dispatch('economy','OMEGA_RESOURCE_ECON_COMPANY_FLOW',seller,{companyId,amount:a.transport,direction:'DEBIT',category:'TRANSPORT',settlementId});
    }
    emit('OMEGA_RESOURCE_FISCAL_RECEIPT_POSTED',seller,{settlementId,resourceId:rid,companyId,...fiscal,workerIncome:a.worker,transportRevenue:a.transport});
  }

  function installFinanceClearHandler(){
    const m=interop();if(!m?.registerCommandHandler)return false;
    const handler=function(cmd,ctx){
      const p=cmd?.payload||{},amount=num(p.amount);
      if(amount===null||amount<0)return{accepted:false,reason:'TRADE_CLEAR_AMOUNT_INVALID'};
      const available=num(ctx.stateTransaction.get('finance.available'));
      const reserves=num(ctx.stateTransaction.get('finance.reserves'));
      const base=available??reserves;
      if(base===null||base<amount)return{accepted:false,reason:'TRADE_CLEAR_LIQUIDITY_UNAVAILABLE'};
      if(available!==null)ctx.stateTransaction.set('finance.available',available-amount);
      else ctx.stateTransaction.set('finance.reserves',reserves-amount);
      const ledger=Array.isArray(ctx.stateTransaction.get('finance.resourceFiscalLedger'))?clone(ctx.stateTransaction.get('finance.resourceFiscalLedger')):[];
      ledger.push({type:'TRADE_CLEAR_TO_COMPANY',amount,settlementId:p.settlementId,companyId:p.companyId,turn:turn()});
      while(ledger.length>(num(rules()?.runtime?.maxLedgerEntries)||2048))ledger.shift();
      ctx.stateTransaction.set('finance.resourceFiscalLedger',ledger);
      return{accepted:true,amount};
    };
    try{
      m.registerAction?.('OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY',{actionId:'OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY',stateOwnerMinistry:'finance',authority:'OMEGA_RESOURCE_ECONOMY_RUNTIME'});
      m.registerCommandHandler('OMEGA_RESOURCE_ECON_TRADE_CLEAR_TO_COMPANY','finance',handler);
      return true;
    }catch(_){return false;}
  }

  function eventHook(){
    if(g.__omegaResourceEconomyEventHook)return;
    g.__omegaResourceEconomyEventHook=true;
    const events=[
      ['OMEGA_RESOURCE_EXTRACTION_COMPLETED',evt=>{
        const p=extractPayload(evt),b=p?.producedBatch||null;
        if(b)dispatch('resource','OMEGA_RESOURCE_ECON_REGISTER_BATCH',canonical(p.countryId||evt?.detail?.countryId),{batch:b,extractionId:p.extractionId||null,provenance:p.provenance||null});
      }],
      ['OMEGA_RESOURCE_PROCESSING_COMPLETED',evt=>{
        const p=extractPayload(evt);recordMaterialOwner(canonical(p.countryId||evt?.detail?.countryId),p);
      }],
      ['OMEGA_INDUSTRIAL_PRODUCTION_COMPLETED',evt=>{
        const p=extractPayload(evt);recordMaterialOwner(canonical(p.countryId||evt?.detail?.countryId),p);
      }],
      ['OMEGA_TRADE_SETTLEMENT_COMPLETED',fiscalizeTradeEvent]
    ];
    for(const [type,fn] of events)g.addEventListener?.(type,fn);
  }

  function buildDashboard(c){
    const cid=canonical(c),rs=countryBucket(cid,'resource')||{},econ=countryBucket(cid,'economy')||{},fin=countryBucket(cid,'finance')||{},transport=countryBucket(cid,'transport')||{};
    const mines=Array.isArray(rs.mines)?rs.mines:[];
    const outputs=rs.production&&typeof rs.production==='object'?rs.production:{};
    const inv=rs.inventory&&typeof rs.inventory==='object'?rs.inventory:{};
    const batches=Array.isArray(rs.batches)?rs.batches:[];
    const runtime=econ.industrialRuntime||{};
    const fiscal=fin.resourceFiscal||{};
    const lastTurn=Number(runtime.lastTurn??rs.lastExtractionTurn??turn());
    const mineRows=mines.map(m=>{
      const rid=String(m?.resourceId||'');
      const output=read(cid,'resource.mineOutputs')?.[m?.occurrenceKey]||{};
      const stateRow=m?.reserveState||{};
      const status=String(output?.status||m?.operationalStatus||stateRow?.operationalStatus||'UNKNOWN').toUpperCase();
      return{
        occurrenceKey:m?.occurrenceKey,depositName:m?.depositName,resourceId:rid,ownerKey:m?.ownerKey,operatorKey:m?.operatorKey,
        status,reserve:num(stateRow?.residualQuantity??m?.residualQuantity)??null,
        outputThisTurn:num(output?.producedQuantity)??0,locationNodeKey:m?.locationNodeKey||null,
        deltaReserve:output?.reserveBefore&&output?.reserveAfter?((num(output.reserveAfter.residualQuantity)||0)-(num(output.reserveBefore.residualQuantity)||0)):null
      };
    });
    const active=mines.filter(x=>/ACTIVE|DEPLETING|OPERATING|RESERVE_DEPLETING/.test(String(x.status))).length;
    const blocked=mines.filter(x=>/BLOCKED|FAILED|UNAVAILABLE|UNKNOWN/.test(String(x.status))).length;
    const totalFiscal=num(fiscal?.thisTurn?.total)||0;
    const invDelta=clone(read(cid,'resource.inventoryDelta')||{});
    return{
      version:VERSION,countryId:cid,turn:turn(),
      mines:{total:mines.length,active,blocked,rows:mineRows},
      inventory:{actual:clone(inv),delta:invDelta,batches:batches.length,integrity:clone(rs.inventoryIntegrity||null)},
      industry:{runtime:clone(runtime),factoryOutput:clone(econ.factoryOutput||{}),blockedFacilities:clone(runtime.blockedFacilities||[])},
      market:{
        prices:clone(read(cid,'trade.marketPrice')||{}),state:clone(read(cid,'trade.marketMeta')||{}),
        globalQuoteCount:Object.keys(g.__OmegaMarketBooks||{}).length
      },
      treasury:{
        fiscalThisTurn:clone(fiscal.thisTurn||{}),fiscalCumulative:clone(fiscal.cumulative||{}),
        revenue:num(fin.revenue),taxRevenue:num(fin.taxRevenue),available:num(fin.available),reserves:num(fin.reserves),
        transportRevenue:num(transport.resourceRevenue?.totalSinceRuntimeStart),
        companyAccounts:clone(econ.companyAccounts||{})
      },
      health:{
        status:(blocked>0||runtime.status==='DEGRADED'||rs.inventoryIntegrity?.status==='DEGRADED')?'DEGRADED':'HEALTHY',
        mineCount:mines.length,activeMines:active,blockedMines:blocked,lastIndustryTurn:lastTurn,
        rulesVersion:rules()?.schemaVersion||null
      },
      totalFiscalThisTurn:totalFiscal
    };
  }

  function diagnostic(){
    const all=countries(),rows=[];
    let mines=0;
    for(const c of all){
      const x=buildDashboard(c);mines+=x.mines.total;
      rows.push({countryId:c,mineCount:x.mines.total,active:x.mines.active,blocked:x.mines.blocked,industryTurn:x.industry.runtime?.lastTurn??null});
    }
    return{version:VERSION,countryCount:all.length,mineCount:mines,countries:rows,rulesLoaded:!!g.__OmegaResourceEconomyRules,marketReady:!!g.__OmegaMarketBooks,handlersReady:!!interop()?.commandHandlers,allMineRowsUncapped:true};
  }

  function onTurn(){
    if(g.__omegaResourceEconomyTurn===turn())return;
    g.__omegaResourceEconomyTurn=turn();
    void runTurn();
  }

  async function runTurn(){
    await loadRules();
    commandHandlersInstall();installFinanceClearHandler();eventHook();
    for(const c of countries())processTurnCountry(c);
    republishMarket();
    clearTradeAfterProduction();
    for(const c of countries()){
      const dashboard=buildDashboard(c);
      const h=dashboard.health;
      emit('OMEGA_RESOURCE_ECONOMY_RUNTIME_HEALTH',c,dashboard.health);
      try{g.dispatchEvent?.(new CustomEvent('OMEGA_RESOURCE_ECONOMY_UPDATED',{detail:dashboard}));}catch(_){}
    }
  }

  async function init(){
    await loadRules();
    commandHandlersInstall();installFinanceClearHandler();eventHook();
    if(!g.__omegaResourceEconomyTurnHook){
      g.__omegaResourceEconomyTurnHook=true;
      g.addEventListener?.('OMEGA_SIMULATION_TURN_COMMITTED',onTurn);
      g.addEventListener?.('OMEGA_READY',()=>{commandHandlersInstall();installFinanceClearHandler();eventHook();});
      g.addEventListener?.('OMEGA_GAME_SESSION_STARTED',()=>{commandHandlersInstall();installFinanceClearHandler();eventHook();});
    }
  }

  function injectUI(){
    if(!g.CountryIOS)return;
    if(g.__OmegaOriginalResourceChapter5&&!g.__OmegaResourceEconomyUIInstalled)return;
    if(!g.__OmegaOriginalResourceChapter5)g.__OmegaOriginalResourceChapter5=g.CountryIOS.renderChapter5_Resources;
    const original=g.__OmegaOriginalResourceChapter5;
    g.CountryIOS.renderChapter5_Resources=function(countryKey){
      const dash=buildDashboard(countryKey);
      if(!dash?.countryId)return original.call(this,countryKey);
      const esc=v=>String(v??'').replace(/[&<>"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
      const money=v=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
      const signed=v=>v===null||v===undefined?'—':(Number(v)>0?'+':'')+Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
      const statusClass=s=>/ACTIVE|OPERATING|DEPLETING|COMPLETED|HEALTHY/.test(String(s))?'good':(/BLOCKED|FAILED|DEGRADED|UNKNOWN/.test(String(s))?'bad':'warn');
      const mines=dash.mines.rows.slice().sort((a,b)=>String(a.depositName||'').localeCompare(String(b.depositName||'')));
      const rows=mines.map(m=>'<div class="omega-re-mine-row">'+
        '<div><b>'+esc(m.depositName||m.occurrenceKey||'UNNAMED MINE')+'</b><span>'+esc(m.resourceId)+'</span></div>'+
        '<div><span class="omega-re-badge '+statusClass(m.status)+'">'+esc(m.status)+'</span></div>'+
        '<div class="omega-re-num">'+(m.reserve===null?'—':money(m.reserve))+'</div>'+
        '<div class="omega-re-num">'+money(m.outputThisTurn)+'</div>'+
        '<div class="omega-re-num">'+(m.deltaReserve===null?'—':signed(m.deltaReserve))+'</div>'+
        '<div class="omega-re-owner">'+esc(m.operatorKey||m.ownerKey||'STATE / UNOBSERVED')+'</div></div>').join('');
      const invRows=Object.keys(dash.inventory.actual||{}).sort().map(rid0=>{
        const q=dash.inventory.actual[rid0],d=dash.inventory.delta?.[rid0];
        return '<div class="omega-re-inv-row"><span>'+esc(rid0)+'</span><strong>'+money(q)+'</strong><em class="'+statusClass((d||0)>=0?'UP':'DOWN')+'">'+signed(d??null)+'</em></div>';
      }).join('')||'<div class="omega-re-empty">No authoritative inventory quantity is currently observed.</div>';
      const fisc=dash.treasury.fiscalThisTurn||{};
      const companyEntries=Object.entries(dash.treasury.companyAccounts||{}).slice(-12).map(([cid0,a])=>
        '<div class="omega-re-company-row"><span>'+esc(cid0)+'</span><strong>'+signed(a?.cashFlowSinceRuntimeStart??0)+'</strong><small>gross '+money(a?.grossRevenue??0)+' · tax '+money(a?.taxPaid??0)+'</small></div>').join('');
      const blocked=(dash.industry.blockedFacilities||[]).slice(-12).map(x=>
        '<div class="omega-re-block"><b>'+esc(x.facilityId)+'</b><span>'+esc(x.reason||'UNKNOWN')+'</span></div>').join('');
      return '<div class="omega-resource-economy-hub">'+
        '<section class="omega-re-header"><div><div class="omega-re-kicker">RESOURCE ECONOMIC CONTROL // LIVE</div><h3>'+esc(dash.countryId)+' RESOURCE–INDUSTRY–MARKET CHAIN</h3><p>Turn '+dash.turn+' · authoritative runtime state · no synthetic warehouse balance</p></div>'+
        '<div class="omega-re-health '+statusClass(dash.health.status)+'">'+esc(dash.health.status)+'</div></section>'+
        '<section class="omega-re-kpis">'+
          '<div><small>MINES</small><strong>'+dash.mines.total+'</strong><em>'+dash.mines.active+' active · '+dash.mines.blocked+' blocked</em></div>'+
          '<div><small>INVENTORY LOTS</small><strong>'+dash.inventory.batches+'</strong><em>'+ (dash.inventory.integrity?.status||'UNVERIFIED') +'</em></div>'+
          '<div><small>FACTORY OUTPUT</small><strong>'+money(Object.values(dash.industry.factoryOutput||{}).reduce((s,x)=>s+(Number(x)||0),0))+'</strong><em>this runtime</em></div>'+
          '<div><small>TREASURY RECEIPTS</small><strong>+'+money(dash.totalFiscalThisTurn)+'</strong><em>this turn</em></div>'+
        '</section>'+
        '<section class="omega-re-flow"><div class="omega-re-flow-title">LIVE MATERIAL & MONEY FLOW</div><div class="omega-re-flow-line">'+
          '<span>DEPOSIT</span><b>↓</b><span>EXTRACTION</span><b>↓</b><span>BATCH</span><b>↓</b><span>INVENTORY</span><b>↓</b><span>PROCESSING</span><b>↓</b><span>FACTORY</span><b>↓</b><span>MARKET</span><b>↓</b><span>SETTLEMENT</span><b>↓</b><span>TREASURY</span></div></section>'+
        '<section class="omega-re-grid">'+
          '<div class="omega-re-panel omega-re-wide"><header><b>OPERATING MINE REGISTER</b><span>'+dash.mines.total+' sites</span></header><div class="omega-re-mine-head"><span>MINE / RESOURCE</span><span>STATUS</span><span>RESERVE</span><span>OUTPUT</span><span>Δ RESERVE</span><span>OWNER / OPERATOR</span></div><div class="omega-re-scroll">'+(rows||'<div class="omega-re-empty">No mine records loaded.</div>')+'</div></div>'+
          '<div class="omega-re-panel"><header><b>AUTHORITATIVE INVENTORY</b><span>live</span></header><div class="omega-re-scroll omega-re-inventory">'+invRows+'</div></div>'+
          '<div class="omega-re-panel"><header><b>FACTORY / PROCESSING STATUS</b><span>'+dash.industry.runtime?.status||'UNKNOWN'+'</span></header><div class="omega-re-scroll">'+(blocked||'<div class="omega-re-empty">All currently modeled production assets are executing or no asset is blocked.</div>')+'</div></div>'+
          '<div class="omega-re-panel"><header><b>TREASURY / FISCAL RECEIPTS</b><span>turn '+dash.turn+'</span></header><div class="omega-re-fiscal">'+
            '<div><span>Royalty</span><strong>+'+money(fisc.royalty||0)+'</strong></div><div><span>Resource tax</span><strong>+'+money(fisc.resourceTax||0)+'</strong></div><div><span>Corporate tax</span><strong>+'+money(fisc.corporateTax||0)+'</strong></div><div><span>Export duty</span><strong>+'+money(fisc.exportDuty||0)+'</strong></div><div class="total"><span>TOTAL RECEIPTS</span><strong>+'+money(fisc.total||0)+'</strong></div>'+
            '<div class="omega-re-fiscal-sub">Revenue: '+money(dash.treasury.revenue)+' · Tax revenue: '+money(dash.treasury.taxRevenue)+' · Available: '+money(dash.treasury.available)+' · Reserves: '+money(dash.treasury.reserves)+'</div>'+
          '</div></div>'+
          '<div class="omega-re-panel"><header><b>COMPANY CASH-FLOW</b><span>runtime flows</span></header><div class="omega-re-scroll">'+(companyEntries||'<div class="omega-re-empty">No company ledger entries recorded yet.</div>')+'</div></div>'+
          '<div class="omega-re-panel"><header><b>INCREASE / DECREASE MONITOR</b><span>this turn</span></header><div class="omega-re-scroll">'+
            Object.keys(dash.inventory.delta||{}).sort().map(k0=>'<div class="omega-re-change"><span>'+esc(k0)+'</span><strong class="'+statusClass((dash.inventory.delta[k0]||0)>=0?'UP':'DOWN')+'">'+signed(dash.inventory.delta[k0])+'</strong></div>').join('')+
          '</div></div>'+
        '</section>'+
        '<section class="omega-re-footer"><span>Rules: '+esc(dash.health.rulesVersion||'UNKNOWN')+'</span><span>Batch policy: FIFO · legacy balances preserved and marked · no hardcoded 25,000 warehouse stock</span></section>'+
      '</div>';
    };
    g.__OmegaResourceEconomyUIInstalled=true;
  }

  function injectStyles(){
    if(document.getElementById('omega-resource-economy-style'))return;
    const s=document.createElement('style');s.id='omega-resource-economy-style';
    s.textContent=''+
      '.omega-resource-economy-hub{font-family:var(--font-mono,monospace);color:#dbe7f3;display:flex;flex-direction:column;gap:12px;padding:4px 2px 30px}'+
      '.omega-re-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;background:linear-gradient(135deg,rgba(7,17,30,.98),rgba(15,27,45,.96));border:1px solid rgba(0,229,255,.45);border-radius:12px;padding:15px 16px;box-shadow:0 0 24px rgba(0,229,255,.08)}'+
      '.omega-re-kicker{font-size:9px;letter-spacing:1.4px;color:#61d7ff;margin-bottom:5px}.omega-re-header h3{font-family:var(--font-title,inherit);font-size:15px;margin:0;color:#f4f8fc;letter-spacing:.7px}.omega-re-header p{font-size:10px;color:#71869b;margin:6px 0 0}.omega-re-health{font-size:10px;font-weight:800;padding:6px 9px;border:1px solid currentColor;border-radius:999px;white-space:nowrap}.omega-re-health.good{color:#36d399}.omega-re-health.warn{color:#f4c95d}.omega-re-health.bad{color:#ff7373}'+
      '.omega-re-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.omega-re-kpis>div{background:rgba(10,19,32,.93);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:10px}.omega-re-kpis small{display:block;font-size:9px;color:#72869a;letter-spacing:1px}.omega-re-kpis strong{display:block;font-size:18px;color:#eff6fb;margin:2px 0}.omega-re-kpis em{font-style:normal;font-size:9px;color:#6fa8c5}.omega-re-flow{background:rgba(5,13,23,.95);border:1px solid rgba(168,85,247,.22);border-radius:9px;padding:10px}.omega-re-flow-title{font-size:10px;color:#c9a9ff;letter-spacing:1px;margin-bottom:8px}.omega-re-flow-line{display:flex;gap:7px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:9px}.omega-re-flow-line span{padding:5px 7px;border:1px solid rgba(255,255,255,.09);border-radius:6px;background:rgba(255,255,255,.025)}.omega-re-flow-line b{color:#5bd5ff}.omega-re-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.omega-re-panel{background:rgba(8,17,29,.96);border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden;min-width:0}.omega-re-panel.omega-re-wide{grid-column:1/-1}.omega-re-panel>header{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02)}.omega-re-panel>header b{font-size:10px;color:#eaf4fa;letter-spacing:.6px}.omega-re-panel>header span{font-size:9px;color:#6e8799}.omega-re-mine-head,.omega-re-mine-row{display:grid;grid-template-columns:2.2fr .85fr .95fr .8fr .9fr 1.2fr;gap:6px;align-items:center;padding:7px 9px}.omega-re-mine-head{font-size:8px;color:#647b8e;border-bottom:1px solid rgba(255,255,255,.06)}.omega-re-mine-row{font-size:9px;border-bottom:1px solid rgba(255,255,255,.045)}.omega-re-mine-row:last-child{border-bottom:0}.omega-re-mine-row>div:first-child b{display:block;color:#eef5f8;font-size:9px}.omega-re-mine-row>div:first-child span,.omega-re-owner{color:#70879a;font-size:8px}.omega-re-num{text-align:right;color:#cde4f1}.omega-re-badge{font-size:7px;border:1px solid currentColor;border-radius:999px;padding:3px 5px}.omega-re-badge.good{color:#34d399}.omega-re-badge.warn{color:#f4c95d}.omega-re-badge.bad{color:#ff7373}.omega-re-scroll{max-height:280px;overflow:auto}.omega-re-inv-row,.omega-re-company-row,.omega-re-change,.omega-re-block{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.045);font-size:9px}.omega-re-inv-row strong{color:#e8f2f7}.omega-re-inv-row em{font-style:normal;font-size:8px}.omega-re-inv-row em.good,.omega-re-change .good{color:#34d399}.omega-re-inv-row em.bad,.omega-re-change .bad{color:#ff7373}.omega-re-company-row{grid-template-columns:1.2fr auto}.omega-re-company-row small{grid-column:1/-1;color:#6e8799;font-size:8px}.omega-re-block{grid-template-columns:1fr 1.2fr}.omega-re-block span{color:#ff9a9a}.omega-re-empty{padding:12px;color:#607589;font-size:9px;text-align:center}.omega-re-fiscal{padding:10px}.omega-re-fiscal>div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.045);font-size:9px}.omega-re-fiscal strong{color:#4fe1ad}.omega-re-fiscal .total{padding-top:10px;margin-top:3px;border-top:1px solid rgba(255,215,0,.18);border-bottom:0}.omega-re-fiscal .total strong{color:#ffd66b;font-size:12px}.omega-re-fiscal-sub{color:#6e8799;font-size:8px;line-height:1.5;display:block!important}.omega-re-footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:7px 2px;color:#607587;font-size:8px}@media(max-width:850px){.omega-re-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.omega-re-grid{grid-template-columns:1fr}.omega-re-panel.omega-re-wide{grid-column:auto}.omega-re-mine-head{display:none}.omega-re-mine-row{grid-template-columns:1.6fr .8fr .95fr .8fr .9fr;}.omega-re-owner{grid-column:1/-1}.omega-re-flow-line{justify-content:flex-start}}';
    document.head.appendChild(s);
  }

  function uiHook(){
    if(typeof document==='undefined')return;
    injectStyles();
    injectUI();
    try{
      g.removeEventListener?.('OMEGA_RESOURCE_ECONOMY_UPDATED',uiRefresh);
      g.addEventListener?.('OMEGA_RESOURCE_ECONOMY_UPDATED',uiRefresh);
      g.removeEventListener?.('RESOURCE_STATE_UPDATED',uiRefresh);
      g.addEventListener?.('RESOURCE_STATE_UPDATED',uiRefresh);
    }catch(_){}
  }

  function uiRefresh(){
    if(!g.CountryIOS||g.CountryIOS.activeChapter!==5)return;
    try{injectUI();g.CountryIOS.switchChapter(5);}catch(_){}
  }

  async function initOntology(){
    try{
      if(typeof fetch!=='function')return;
      const r=await fetch('./resource_ontology.json',{cache:'no-store'});
      if(r?.ok){
        const data=await r.json();
        g.__OmegaResourceEconomyOntology=data?.COMMODITY_ONTOLOGIES||data?.commodity_ontologies||{};
      }
    }catch(e){g.__OmegaResourceEconomyOntologyError=String(e?.message||e);}
  }

  function bootstrap(){
    void loadRules();
    void initOntology();
    commandHandlersInstall();installFinanceClearHandler();eventHook();
    if(typeof document!=='undefined'){
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',uiHook,{once:true});
      else uiHook();
    }
  }

  const API=Object.freeze({
    VERSION,
    diagnostics:diagnostic,
    getCountryDashboard:buildDashboard,
    runTurn,
    processCountry:processTurnCountry,
    reconcileCountry:c=>dispatch('resource','OMEGA_RESOURCE_ECON_RECONCILE_INVENTORY',canonical(c),{correlationId:'RESOURCE-RECON-MANUAL-'+turn()+'-'+canonical(c)}),
    executeCountryFactories:executeFactories
  });
  g.Omega=g.Omega||{};
  g.Omega.ResourceEconomy=API;
  g.OmegaResourceEconomy=API;
  try{bootstrap();}catch(e){g.OmegaResourceEconomyError=String(e?.message||e);}
})(typeof window!=='undefined'?window:globalThis);