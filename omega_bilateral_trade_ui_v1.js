/* OMEGA Bilateral Trade UI v1.0.0. Renders only inside the Trade Ministry. */
(function(g){
'use strict';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const fmt=v=>{const n=num(v);return n===null?'Not recorded':n.toLocaleString('en-US',{maximumFractionDigits:4});};
const runtime=()=>g.OmegaBilateralTrade||g.Omega&&g.Omega.BilateralTrade||null;
function canonicalCountry(v){const raw=String(v||'').trim();if(!raw)return'';try{const r=g.OmegaCountryRuntimeData?.resolveCountry?.(raw);if(r?.iso3)return String(r.iso3).toUpperCase();if(r?.id)return String(r.id).toUpperCase();}catch(_){}try{const r=(g.OmegaCanonicalIdentityRegistry||g.OmegaCountrySemanticBridge)?.resolveCountry?.(raw);if(r?.id)return String(r.id).toUpperCase();}catch(_){}return raw.toUpperCase();}
function field(f){if(!f)return'Not recorded';const v=f.value;if(v===null||v===undefined)return'Unknown';return typeof v==='object'?(Array.isArray(v)?String(v.length)+' records':JSON.stringify(v)):String(v);}
function badge(f){const status=String(f&&f.status||'UNKNOWN').toUpperCase();return '<span class="bt-status bt-'+esc(status.toLowerCase())+'">'+esc(status)+'</span>';}
function evidenceMeta(f){if(!f)return '<small class="bt-evidence">Source not recorded</small>';const source=String(f.source||'Source not recorded'),note=String(f.note||'');return '<small class="bt-evidence">'+esc(source)+(note?' · '+esc(note):'')+'</small>';}
function render(root,countryValue){
 if(!root)return{ok:false,reason:'BILATERAL_TRADE_ROOT_REQUIRED'};
 const country=canonicalCountry(countryValue||g.OmegaMinistryViewCountry||g.OmegaCabinetUI?.activeCountry||'');
 const api=runtime();
 if(!api){root.textContent='Bilateral Trade runtime is not available in this session.';return{ok:false,reason:'RUNTIME_UNAVAILABLE'};}
 const agreements=api.getAgreements(country);
 root.innerHTML='<style>'+
 '.bt-wrap{display:grid;gap:12px;min-width:0;color:#dceaf6;font-size:13px}'+
 '.bt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}'+
 '.bt-panel{min-width:0;border:1px solid rgba(86,166,214,.28);border-radius:12px;background:linear-gradient(150deg,rgba(13,35,58,.96),rgba(6,19,35,.98));padding:12px;box-shadow:inset 0 1px rgba(255,255,255,.05)}'+
 '.bt-panel h3{font-size:13px;margin:0 0 10px;color:#f2f8ff}'+
 '.bt-panel p{font-size:11px;line-height:1.45;color:#9fb5ca;margin:5px 0}'+
 '.bt-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}'+
 '.bt-field{display:grid;gap:4px;min-width:0;font-size:10px;color:#9fb5ca}'+
 '.bt-field input,.bt-field select{box-sizing:border-box;width:100%;min-width:0;border:1px solid rgba(117,171,209,.38);border-radius:7px;background:#071729;color:#e6f4ff;padding:9px;font:inherit;font-size:12px}'+
 '.bt-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}'+
 '.bt-actions button{border:1px solid rgba(99,190,233,.45);border-radius:7px;background:linear-gradient(145deg,#16466a,#0b2844);color:#e5f5ff;padding:8px 11px;font:inherit;font-size:11px;font-weight:700;min-height:34px}'+
 '.bt-actions button[data-kind="danger"]{border-color:rgba(239,112,112,.5);background:#401d29}'+
 '.bt-actions button:disabled{opacity:.45;cursor:not-allowed}'+
 '.bt-note{font-size:11px;color:#a8bfd3;line-height:1.5;margin:0}'+
 '.bt-status{display:inline-block;margin-left:5px;border-radius:20px;padding:2px 7px;font-size:9px;font-weight:800;letter-spacing:.04em;background:#283b50;color:#d3e3f2}'+
 '.bt-known{background:#124d43;color:#baf6df}.bt-estimated{background:#5b4820;color:#ffe3a4}.bt-unknown{background:#3b414c;color:#d2d8e1}'+
 '.bt-record{border-top:1px solid rgba(120,165,200,.15);padding-top:9px;margin-top:9px}'+
 '.bt-meta{display:grid;grid-template-columns:minmax(90px,1fr) minmax(0,1.35fr);gap:6px;font-size:11px;padding:4px 0}'+
 '.bt-meta span:first-child{color:#8faac1}.bt-meta strong{overflow-wrap:anywhere;color:#e5f1fb;font-weight:600}'+
 '.bt-report-row{border-top:1px solid rgba(120,165,200,.15);padding:8px 0}'+
 '.bt-report-row h4{margin:0 0 6px;font-size:12px;color:#f0f7ff}'+
 '.bt-report-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:6px}'+
 '.bt-report-metrics>div{border-radius:7px;background:rgba(255,255,255,.035);padding:7px;min-width:0}'+
 '.bt-report-metrics small{display:block;color:#96aec3;font-size:9px;margin-bottom:4px}'+
 '.bt-report-metrics strong{display:block;overflow-wrap:anywhere;font-size:11px;color:#e5f2fc}'+
 '.bt-evidence{display:block;margin-top:4px;color:#819bb2;font-size:9px;line-height:1.35;overflow-wrap:anywhere}'+
 '.bt-status-line{min-height:18px;font-size:11px;color:#a8d8f4}'+
 '@media(max-width:480px){.bt-panel{padding:10px}.bt-actions button{flex:1}}'+
 '</style><div class="bt-wrap">'+
 '<div class="bt-panel"><h3>Bilateral Market Intelligence</h3><p>Generate a timestamped report for one counterparty. Each metric is marked Known, Estimated or Unknown; unavailable evidence is not filled with zero.</p>'+
 '<div class="bt-form-grid">'+
 '<label class="bt-field">Counterparty ISO3 or name<input data-bt-field="target" placeholder="e.g. SAU" autocomplete="off"></label>'+
 '<label class="bt-field">Commodity ID (optional)<input data-bt-field="resource" placeholder="e.g. crude_oil"></label>'+
 '</div><div class="bt-actions"><button type="button" data-bt-action="intelligence">Generate intelligence report</button></div>'+
 '<div data-bt-report aria-live="polite"></div></div>'+
 '<div class="bt-panel"><h3>Negotiate a Bilateral Trade Agreement</h3><p>The offer is recorded for both countries. Procurement is enabled only after both party records show the same active terms version.</p>'+
 '<div class="bt-form-grid">'+
 '<label class="bt-field">Counterparty ISO3 or name<input data-bt-field="offerTarget" placeholder="e.g. SAU" autocomplete="off"></label>'+
 '<label class="bt-field">Trade direction<select data-bt-field="direction"><option value="IMPORT">Import into selected country</option><option value="EXPORT">Export from selected country</option></select></label>'+
 '<label class="bt-field">Commodity ID<input data-bt-field="offerResource" placeholder="e.g. crude_oil"></label>'+
 '<label class="bt-field">Quantity per shipment<input data-bt-field="quantity" type="number" min="0.000001" step="any" placeholder="Quantity"></label>'+
 '<label class="bt-field">Agreed unit price<input data-bt-field="price" type="number" min="0" step="any" placeholder="Unit price"></label>'+
 '<label class="bt-field">Settlement currency<input data-bt-field="currency" maxlength="3" placeholder="e.g. USD"></label>'+
 '<label class="bt-field">Duration (game turns)<input data-bt-field="duration" type="number" min="1" max="10000" value="100"></label>'+
 '<label class="bt-field">Delivery mode (optional)<input data-bt-field="mode" placeholder="SHIP / RAIL / PIPELINE"></label>'+
 '</div><div class="bt-actions"><button type="button" data-bt-action="offer">Send bilateral offer</button></div></div>'+
 '<div class="bt-panel"><h3>Current Country Agreements</h3><div data-bt-agreements>'+
 (agreements.length?agreements.slice().reverse().map(a=>agreementCard(a,country)).join(''):'<p class="bt-note">No bilateral agreement is recorded for this country yet.</p>')+
 '</div></div><p class="bt-status-line" data-bt-status role="status"></p>'+
 '<p class="bt-note">Open Market price discovery remains separate. An agreement does not create stock, money or route capacity; procurement still passes through the existing Global Trade review, inventory, FX, Treasury and settlement checks.</p>'+
 '</div>';
 if(!root.__omegaBilateralTradeBound){
  root.addEventListener('click',function(event){
   const button=event.target&&event.target.closest&&event.target.closest('[data-bt-action]');
   if(!button||!root.contains(button))return;
   const action=button.getAttribute('data-bt-action'),reportHost=root.querySelector('[data-bt-report]'),status=root.querySelector('[data-bt-status]');
   const get=name=>{const el=root.querySelector('[data-bt-field="'+name+'"]');return el?el.value:'';};
   const say=message=>{if(status)status.textContent=message;};
   const currentCountry=country;
   let result=null;
   if(action==='intelligence'){
    result=api.requestMarketIntelligence(currentCountry,get('target'),{resourceId:get('resource')||undefined});
    if(result&&result.ok&&reportHost)reportHost.innerHTML=reportMarkup(result.report);
    say(result&&result.ok?'Intelligence report saved · '+result.report.dataVersion:'Intelligence report failed · '+(result&&result.reason||'Unknown reason'));
   }else if(action==='offer'){
    result=api.createAgreementOffer(currentCountry,get('offerTarget'),get('direction'),{
     resourceId:get('offerResource'),quantityPerShipment:get('quantity'),unitPrice:get('price'),
     currency:get('currency'),durationTurns:get('duration'),deliveryMode:get('mode')
    });
    say(result&&result.accepted?'Bilateral offer recorded for both countries · '+result.agreement.agreementId:'Offer failed · '+(result&&result.reason||'Unknown reason'));
   }else{
    const card=button.closest('[data-bt-agreement]');
    const agreementId=card&&card.getAttribute('data-bt-agreement');
    if(!agreementId){say('Agreement identity is missing.');return;}
    if(action==='accept')result=api.respondToOffer(currentCountry,agreementId,'ACCEPT');
    if(action==='reject')result=api.respondToOffer(currentCountry,agreementId,'REJECT');
    if(action==='counter')result=api.respondToOffer(currentCountry,agreementId,'COUNTER',{
      resourceId:get('offerResource')||undefined,
      quantityPerShipment:num(get('quantity'))??undefined,
      unitPrice:num(get('price'))??undefined,
      currency:get('currency')||undefined,
      deliveryMode:get('mode')||undefined
    });
    if(action==='procure')result=api.procureAgreement(currentCountry,agreementId,num(get('quantity')));
    if(action==='suspend')result=api.suspendAgreement(currentCountry,agreementId);
    if(action==='terminate')result=api.terminateAgreement(currentCountry,agreementId);
    if(action==='procure'&&result&&result.accepted){
      const readiness=result.assessment&&result.assessment.status||'UNKNOWN';
      const requestStatus=result.request&&result.request.status||'PENDING_REVIEW';
      const gaps=result.assessment&&Array.isArray(result.assessment.unknown)&&result.assessment.unknown.length
        ?' · evidence gaps: '+result.assessment.unknown.join(', '):'';
      say('Trade request recorded · '+requestStatus+' · readiness '+readiness+gaps+'. Settlement is not yet confirmed; Global Trade remains the final authority.');
    }else if(result&&result.accepted){
      const state=result.agreement&&result.agreement.status;
      say((action==='accept'||action==='counter'||action==='reject'?'Agreement response recorded':'Agreement action recorded')+' · '+(state||agreementId));
    }else{
      say('Agreement action failed · '+(result&&result.reason||'Unknown reason'));
    }
   }
   render(root,currentCountry);
   const newStatus=root.querySelector('[data-bt-status]');
   if(newStatus)newStatus.textContent=status?status.textContent:'';
   if(action==='intelligence'&&result&&result.ok){
    const host=root.querySelector('[data-bt-report]');if(host)host.innerHTML=reportMarkup(result.report);
   }
  });
  root.__omegaBilateralTradeBound=true;
 }
 return{ok:true,countryId:country,agreementCount:agreements.length};
}
function agreementCard(a,country){
 const parties=[String(a.buyerCountryId||''),String(a.sellerCountryId||'')],other=parties.find(x=>x!==country)||a.counterpartyCountryId||'Unknown';
 const mine=a.responses&&a.responses[country],version=num(a.termVersion),mineAccepted=mine&&num(mine.acceptedVersion)===version;
 const status=String(a.status||'UNKNOWN'),pending=['OFFERED','COUNTER_OFFERED','ACCEPTED_AWAITING_COUNTERPARTY'].includes(status);
 const controls=[];
 if(pending&&!mineAccepted)controls.push('<button type="button" data-bt-action="accept">Accept</button>');
 if(pending)controls.push('<button type="button" data-bt-action="counter">Counter</button><button type="button" data-kind="danger" data-bt-action="reject">Reject</button>');
 if(status==='ACTIVE')controls.push('<button type="button" data-bt-action="procure">'+(canonicalCountry(a.buyerCountryId)===country?'Place agreed import request':'Initiate agreed delivery')+'</button>');
 if(status==='ACTIVE')controls.push('<button type="button" data-bt-action="suspend">Suspend</button>');
 if(!['REJECTED','TERMINATED'].includes(status))controls.push('<button type="button" data-kind="danger" data-bt-action="terminate">Terminate</button>');
 return'<article class="bt-record" data-bt-agreement="'+esc(a.agreementId)+'">'+
 '<div class="bt-meta"><span>Agreement</span><strong>'+esc(a.agreementId)+'</strong></div>'+
 '<div class="bt-meta"><span>Counterparty</span><strong>'+esc(other)+' · '+esc(a.buyerCountryId)+' → '+esc(a.sellerCountryId)+'</strong></div>'+
 '<div class="bt-meta"><span>Commodity</span><strong>'+esc(a.resourceId)+'</strong></div>'+
 '<div class="bt-meta"><span>Terms</span><strong>'+fmt(a.terms&&a.terms.quantityPerShipment)+' / shipment · '+fmt(a.terms&&a.terms.unitPrice)+' '+esc(a.terms&&a.terms.currency||'currency not recorded')+'</strong></div>'+
 '<div class="bt-meta"><span>Status</span><strong>'+esc(status)+' · terms v'+esc(version)+'</strong></div>'+
 '<div class="bt-actions">'+controls.join('')+'</div></article>';
}
function reportMarkup(report){
 const o=report.countryOverview||{},resources=report.resources||[];
 const overview=[['Counterparty currency',o.currency],['Requester Treasury',o.requesterTreasuryLiquidity],['Counterparty Treasury',o.targetTreasuryLiquidity],['Requester FX reserves',o.requesterForeignExchangeReservesUsd],['Counterparty FX reserves',o.targetForeignExchangeReservesUsd],['Bilateral FX',o.bilateralFxRate],['Diplomatic score',o.diplomaticRelationScore],['War/sanctions risk',o.warOrSanctionsRisk],['Active agreements',o.agreementCount]];
 return'<div class="bt-record"><h3>'+esc(report.targetCountryId)+' · Market Intelligence</h3><p class="bt-note">'+esc(report.generatedAt)+' · turn '+esc(report.generatedTurn)+' · version '+esc(report.dataVersion)+'</p>'+
 '<div class="bt-report-metrics">'+overview.map(([label,f])=>'<div><small>'+esc(label)+' '+badge(f)+'</small><strong>'+esc(field(f))+'</strong>'+evidenceMeta(f)+'</div>').join('')+'</div>'+
 resources.map(r=>'<div class="bt-report-row"><h4>'+esc(r.resourceId)+'</h4><div class="bt-report-metrics">'+
 [['Domestic production',r.domesticProduction],['Domestic consumption',r.domesticConsumption],['Inventory',r.currentInventory],['Import demand',r.importDemand],['Potential export surplus',r.potentialExportableSurplus],['In transit',r.inboundInTransit],['Expected local price',r.expectedLocalPrice],['Route capacity',r.routeCapacity],['Supplier reliability',r.supplierReliability],['Strategic importance',r.strategicImportance],['Strategic risk',r.strategicRisk]].map(([label,f])=>'<div><small>'+esc(label)+' '+badge(f)+'</small><strong>'+esc(field(f))+'</strong>'+evidenceMeta(f)+'</div>').join('')+
 '</div><p class="bt-note">Alternatives: '+(r.alternativeSuppliers&&r.alternativeSuppliers.length?r.alternativeSuppliers.map(x=>esc(x.countryId)+' ('+esc(x.evidenceStatus)+')').join(', '):'Not recorded')+'</p></div>').join('')+'</div>';
}
g.OmegaBilateralTradeUI=Object.freeze({version:'1.0.0',render:render});
g.Omega=g.Omega||{};g.Omega.BilateralTradeUI=g.OmegaBilateralTradeUI;
})(typeof window!=='undefined'?window:globalThis);
