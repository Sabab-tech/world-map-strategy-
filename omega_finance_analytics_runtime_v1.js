/* OMEGA Finance Analytics + country graph UI v1.0.0.
 * Preview = deterministic 30-day modeled scenario around source baseline, not observed time-series data.
 * Live mode starts only when the game commits its first turn.
 */
(function(g){
'use strict';
const VERSION='1.0.0',DAYS=30,PAGE=12,WINDOW=31;
if(g.OmegaFinanceAnalyticsRuntime?.VERSION===VERSION)return;
let ready=false,boot=null,profiles=[],chosen='BGD',metricId='gdp',query='',page=0,live=false,gameStarted=false,lastTurn=null,observer=null,bound=false;
const preview=new Map(),liveData=new Map(),countryMap=new Map();
const metrics=[
['gdp','Nominal GDP','USD','money','nominalGdpUsd',['gdpCurrentUsd','gdp']],
['growth','GDP growth','%/year','pct','gdpGrowthAnnualPct',['gdpGrowthPct','gdp_growth']],
['inflation','Inflation','%/year','pct','inflationAnnualPct',['inflationRatePct','inflation']],
['unemployment','Unemployment','%','pct','unemploymentRatePct',['unemploymentRatePct','unemployment_rate']],
['debt','Public debt','USD','money','publicDebtUsd',['publicDebtUsd','debt']],
['balance','Budget balance','USD/year','money','governmentBudgetBalanceUsd',['currentBudgetBalanceUsd','governmentBudgetBalanceUsd','budget_balance']],
['trade','Trade balance','USD/year','money','tradeBalanceUsd',['tradeBalanceUsd','trade_balance']],
['reserves','FX reserves','USD','money','foreignExchangeReservesUsd',['foreignExchangeReservesUsd','reserves']],
['exports','Exports','USD/year','money','exportsGoodsServicesUsd',['exportsGoodsServicesUsd','exports']],
['imports','Imports','USD/year','money','importsGoodsServicesUsd',['importsGoodsServicesUsd','imports']],
['tax','Tax receipts','% GDP','pct','taxRevenuePctGdp',['taxRevenuePctGdp']],
['govRevenue','Government revenue','% GDP','pct','totalGovernmentRevenuePctGdp',['totalGovernmentRevenuePctGdp']],
['govSpending','Government expenditure','% GDP','pct','totalGovernmentExpenditurePctGdp',['totalGovernmentExpenditurePctGdp']],
['currentAccount','Current account','% GDP','pct','currentAccountBalancePctGdp',['currentAccountBalancePctGdp']],
['agriculture','Agriculture value added','% GDP','pct','agricultureValueAddedPctGdp',['agricultureValueAddedPctGdp']],
['industry','Industry value added','% GDP','pct','industryValueAddedPctGdp',['industryValueAddedPctGdp']],
['manufacturing','Manufacturing value added','% GDP','pct','manufacturingValueAddedPctGdp',['manufacturingValueAddedPctGdp']],
['services','Services value added','% GDP','pct','servicesValueAddedPctGdp',['servicesValueAddedPctGdp']],
['health','Health spending','% GDP','pct','healthSpendingPctGdp',['healthSpendingPctGdp']],
['education','Education spending','% GDP','pct','educationSpendingPctGdp',['educationSpendingPctGdp']],
['moneyGrowth','Broad money growth','%/year','pct','moneySupplyGrowthAnnualPct',['moneySupplyGrowthAnnualPct']],
['lendingRate','Bank lending rate','%/year','pct','bankLendingRateAnnualPct',['bankLendingRateAnnualPct']],
['depositRate','Bank deposit rate','%/year','pct','bankDepositRateAnnualPct',['bankDepositRateAnnualPct']],
['npl','Non-performing loans','% loans','pct','bankNonPerformingLoansPct',['bankNonPerformingLoansPct']],
['privateCredit','Private credit','% GDP','pct','privateCreditPctGdp',['privateCreditPctGdp']],
['stability','Stability score','/100','score','stabilityScore',['stabilityScore']]
].map(a=>({id:a[0],label:a[1],unit:a[2],format:a[3],raw:a[4],source:a[5]}));
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const finance=()=>g.OmegaFinanceMinistry||null,macro=()=>g.OmegaMacroStabilityRuntime||null;
const iso=p=>String(p&&(p.iso3||p.countryCode)||'').toUpperCase(),code=p=>String(p&&(p.countryCode||p.iso3)||'').toUpperCase();
function rawFor(p){const a=macro();return a&&a.getRawProfile&&(a.getRawProfile(p.countryCode)||a.getRawProfile(p.iso3))||{rawIndicators:{},rawSourceRecords:{economy:p.sourceValues||null},fieldProvenance:{}};}
function first(...v){for(const x of v){const z=n(x);if(z!==null)return z;}return null;}
function baseValue(p,raw,m){const r=raw.rawIndicators||{},i=p.indicators||{},s=raw.rawSourceRecords?.economy||p.sourceValues||{};return first(r[m.raw],...m.source.map(k=>i[k]),s[m.id],m.id==='gdp'?s.gdp:null,m.id==='growth'?s.gdp_growth:null,m.id==='inflation'?s.inflation:null,m.id==='unemployment'?s.unemployment_rate:null,m.id==='debt'?s.debt:null,m.id==='balance'?s.budget_balance:null,m.id==='trade'?s.trade_balance:null,m.id==='reserves'?s.reserves:null);}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function createPreview(p){
 const raw=rawFor(p),values={};for(const m of metrics)values[m.id]=baseValue(p,raw,m);
 const snap=macro()?.getIndicators?.(p.iso3||p.countryCode);if(n(snap?.stabilityScore)!==null)values.stability=n(snap.stabilityScore);
 const phase=hash(iso(p))%10000/10000*Math.PI*2,growth=n(values.growth)||0,infl=n(values.inflation)??3,bal=values.balance,trade=values.trade;
 const series={};
 for(const m of metrics)series[m.id]=Array.from({length:DAYS+1},(_,day)=>{
  const b=values[m.id];if(b===null)return{x:day,label:day?'Day '+day:'Baseline',value:null,kind:'MODEL_PREVIEW'};
  const wave=Math.sin(day/4.8+phase)*.003+Math.sin(day/10+phase*.6)*.0015;let v=b;
  if(m.id==='gdp')v=Math.max(0,b*Math.pow(Math.max(.0001,1+growth/100),day/365)*(1+wave));
  else if(m.id==='growth')v=b+Math.sin(day/5.5+phase)*.08;
  else if(m.id==='inflation')v=clamp(infl+(3-infl)*day/30*.025+Math.sin(day/6+phase)*.08,-50,500);
  else if(m.id==='unemployment')v=clamp(b-Math.sign(growth)*Math.min(.08,Math.abs(growth)*.004)*day/30+Math.sin(day/7+phase)*.025,0,100);
  else if(m.id==='debt')v=Math.max(0,b-(bal===null?0:bal*day/365)*(1+wave));
  else if(m.id==='reserves')v=Math.max(0,b+(trade===null?0:trade*day/365*.04)+b*wave*.2);
  else if(m.id==='stability')v=clamp(b+Math.sin(day/7+phase)*1.5,0,100);
  else v=b*(1+wave);
  return{x:day,label:day?'Day '+day:'Baseline',value:v,kind:'MODEL_PREVIEW'};
 });
 return{countryCode:iso(p),name:p.name,baselineYear:n(raw.baselineYear)||2015,values,raw,series,mode:'MODEL_PREVIEW',provenance:'30-day deterministic model preview around the existing baseline; not observed daily history or an official forecast.'};
}
function selected(){return countryMap.get(String(chosen).toUpperCase())||profiles[0]||null;}
function currentValues(p){
 const f=finance(),a=macro(),raw=rawFor(p),fi=f?.getIndicators?.(p.countryCode),mi=a?.getIndicators?.(p.iso3||p.countryCode),out={};
 const map={gdp:[mi?.gdpUsd,fi?.gdpCurrentUsd],growth:[mi?.gdpGrowthAnnualPct,fi?.gdpGrowthPct],inflation:[mi?.inflationAnnualPct,fi?.inflationRatePct],unemployment:[mi?.unemploymentRatePct,fi?.unemploymentRatePct],debt:[mi?.publicDebtUsd,fi?.publicDebtUsd],balance:[mi?.annualBudgetBalanceUsd,fi?.currentBudgetBalanceUsd,fi?.governmentBudgetBalanceUsd],trade:[fi?.tradeBalanceUsd,raw.rawIndicators?.tradeBalanceUsd],reserves:[mi?.foreignExchangeReservesUsd,fi?.foreignExchangeReservesUsd],stability:[mi?.stabilityScore]};
 for(const m of metrics)out[m.id]=first(...(map[m.id]||[]),baseValue(p,raw,m));return out;
}
function handleTurn(d){
 const f=finance();if(!f?.getProfiles)return{ok:false,code:'FINANCE_NOT_READY'};
 const t=n(d?.simulationTurn)??n(d?.turn)??n(d?.payload?.turn)??n(f.diagnostics?.().simulationTurn)??0;
 if(lastTurn!==null&&t<=lastTurn)return{ok:true,duplicate:true,turn:t,updated:0};
 gameStarted=true;live=true;lastTurn=t;let updated=0;
 for(const p of profiles){const id=iso(p),values=currentValues(p),byMetric=liveData.get(id)||{};
  for(const m of metrics){const arr=byMetric[m.id]||(byMetric[m.id]=[]);arr.push({x:t,label:'Turn '+t,value:values[m.id],kind:'LIVE_TURN'});if(arr.length>WINDOW)arr.splice(0,arr.length-WINDOW);}
  liveData.set(id,byMetric);updated++;
 }
 render();return{ok:true,turn:t,updated,mode:'LIVE_TURNS'};
}
function seriesFor(p,id){const s=liveData.get(iso(p))?.[id];if(live&&s?.length)return s.slice();return(preview.get(iso(p))?.series[id]||[]).slice();}
function fmt(v,m){const z=n(v);if(z===null)return'N/A';if(m.format==='money'){const a=Math.abs(z);if(a>=1e12)return(z/1e12).toFixed(2)+'T USD';if(a>=1e9)return(z/1e9).toFixed(2)+'B USD';if(a>=1e6)return(z/1e6).toFixed(2)+'M USD';return new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(z)+' USD';}return z.toLocaleString('en-US',{maximumFractionDigits:2})+(m.format==='pct'?'%':'');}
function path(points,w,h,small){
 const vals=points.map((p,i)=>({i,v:n(p.value)})).filter(x=>x.v!==null);if(!vals.length)return null;
 const lo=Math.min(...vals.map(x=>x.v)),hi=Math.max(...vals.map(x=>x.v)),delta=hi-lo||Math.max(Math.abs(hi)*.02,1),left=small?2:78,right=small?2:18,top=small?3:20,bottom=small?3:35,pw=w-left-right,ph=h-top-bottom;
 const X=i=>left+(points.length<2?pw/2:i/(points.length-1)*pw),Y=v=>top+ph-(v-(lo-delta*.12))/(delta*1.24)*ph;
 return{d:vals.map((x,i)=>(i?'L':'M')+X(x.i).toFixed(2)+' '+Y(x.v).toFixed(2)).join(' '),lo,hi,left,right,top,bottom,pw,ph,X,Y};
}
function chart(points,m,p){
 const w=820,h=300,q=path(points,w,h,false);if(!q)return'<div class="ofa-empty">No source value is available for this indicator. Missing data remains N/A, not zero.</div>';
 const grids=Array.from({length:5},(_,i)=>{const v=q.lo+(q.hi-q.lo)*i/4,y=q.top+q.ph-i*q.ph/4;return'<line x1="'+q.left+'" x2="'+(w-q.right)+'" y1="'+y+'" y2="'+y+'" class="ofa-grid"/><text x="'+(q.left-8)+'" y="'+(y+4)+'" text-anchor="end" class="ofa-axis">'+esc(fmt(v,m))+'</text>';}).join('');
 const marks=[0,Math.floor((points.length-1)/2),points.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>'<text x="'+q.X(i)+'" y="'+(h-9)+'" text-anchor="middle" class="ofa-axis">'+esc(points[i].label)+'</text>').join('');
 const last=points[points.length-1];return'<div class="ofa-chart-box"><svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="'+esc(p.name+' '+m.label)+'">'+grids+marks+'<path d="'+q.d+'" class="ofa-graph-line '+(live?'ofa-live':'ofa-preview')+'"/><circle cx="'+q.X(points.length-1)+'" cy="'+q.Y(n(last.value)??q.lo)+'" r="4" class="ofa-point"><title>'+esc(last.label+': '+fmt(last.value,m))+'</title></circle></svg></div>';
}
function spark(points){const q=path(points,140,38,true);return q?'<svg viewBox="0 0 140 38" class="ofa-spark" aria-label="Country 30-day model graph"><path d="'+q.d+'"/></svg>':'<div class="ofa-spark-empty">N/A</div>';}
function optionsCountry(){return profiles.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>'<option value="'+esc(p.countryCode||p.iso3)+'"'+(iso(p)===String(chosen).toUpperCase()?' selected':'')+'>'+esc(p.name)+' ('+esc(iso(p))+')</option>').join('');}
function optionsMetric(){return metrics.map(m=>'<option value="'+m.id+'"'+(m.id===metricId?' selected':'')+'>'+esc(m.label)+' · '+esc(m.unit)+'</option>').join('');}
function rawHTML(p){const raw=preview.get(iso(p))?.raw||{},v=raw.rawIndicators||{},prov=raw.fieldProvenance||{};
 return Object.keys(v).sort().map(k=>'<tr><td>'+esc(k.replace(/([a-z0-9])([A-Z])/g,'$1 $2'))+'</td><td><code>'+esc(k)+'</code></td><td>'+esc(v[k]==null?'N/A':typeof v[k]==='number'?v[k].toLocaleString('en-US',{maximumFractionDigits:6}):v[k])+'</td><td>'+esc(prov[k]||(v[k]==null?'UNAVAILABLE':'LOCAL BASELINE'))+'</td></tr>').join('');}
function countriesHTML(){
 const m=metrics.find(x=>x.id===metricId)||metrics[0],q=query.trim().toLowerCase(),all=profiles.filter(p=>!q||String(p.name).toLowerCase().includes(q)||iso(p).toLowerCase().includes(q)||code(p).toLowerCase().includes(q)),pages=Math.max(1,Math.ceil(all.length/PAGE));
 page=clamp(page,0,pages-1);
 return'<section class="ofa-section"><div class="ofa-head"><div><h3>Country-by-country graphs</h3><p>Separate 30-day model trace for every country; search and open any individual graph.</p></div><span>'+all.length+' results</span></div><div class="ofa-search"><label>Find country<input type="search" data-ofa-search value="'+esc(query)+'" placeholder="Country name or ISO code"></label><div><button type="button" data-ofa-page="-1" '+(page===0?'disabled':'')+'>Previous</button><span>Page '+(page+1)+' / '+pages+'</span><button type="button" data-ofa-page="1" '+(page===pages-1?'disabled':'')+'>Next</button></div></div><div class="ofa-country-grid">'+all.slice(page*PAGE,(page+1)*PAGE).map(p=>{const rows=seriesFor(p,m.id),last=rows[rows.length-1];return'<article class="ofa-country-card"><div><strong>'+esc(p.name)+'</strong><small>'+esc(iso(p))+'</small></div>'+spark(rows)+'<span>'+esc(m.label)+'</span><b>'+esc(fmt(last?.value,m))+'</b><button data-ofa-open="'+esc(p.countryCode||p.iso3)+'" type="button">Open graph</button></article>';}).join('')+'</div></section>';
}
function render(){
 const host=g.document?.querySelector?.('[data-ofa-container]');if(!host)return;
 const p=selected();if(!p){host.innerHTML='<div class="ofa-empty">Country data are not available.</div>';return;}
 const m=metrics.find(x=>x.id===metricId)||metrics[0],rows=seriesFor(p,m.id),base=preview.get(iso(p)),v=base?.values||{};
 host.innerHTML='<div class="ofa-analytics"><header class="ofa-hero"><div><span class="ofa-eyebrow">OMEGA / ECONOMIC INTELLIGENCE</span><h2>Analytics &amp; Country Graphs</h2><p>Macro indicators, Treasury, trade, public accounts and banking fields.</p></div><span class="ofa-badge '+(live?'ofa-badge-live':'')+'">'+(live?'LIVE GAME TURNS':'30-DAY MODEL PREVIEW')+'</span></header><div class="ofa-explainer">'+(live?'Graph uses committed in-game snapshots and advances with the simulation.':'Game has not started. A 30-day modeled preview is generated from the existing baseline; live traces wait for the first committed game turn.')+'</div>'+
 '<div class="ofa-controls"><label>Country<select data-ofa-country>'+optionsCountry()+'</select></label><label>Indicator<select data-ofa-metric>'+optionsMetric()+'</select></label><button data-ofa-export type="button">Export country data (CSV)</button></div>'+
 '<section class="ofa-section"><div class="ofa-head"><div><h3>'+esc(p.name)+' · '+esc(m.label)+'</h3><p>'+esc(m.unit)+' · '+(live?'recent committed turns':'baseline day 0 through modeled day 30')+'</p></div><span>'+(live?'Live trace':'Scenario preview')+'</span></div><div class="ofa-kpis"><article><span>GDP baseline</span><b>'+esc(fmt(v.gdp,metrics[0]))+'</b><small>Historical baseline when available</small></article><article><span>Growth baseline</span><b>'+esc(fmt(v.growth,metrics[1]))+'</b><small>Annual rate</small></article><article><span>Chart value</span><b>'+esc(fmt(rows.length?rows[rows.length-1].value:null,m))+'</b><small>'+esc(rows.length?rows[rows.length-1].label:'N/A')+'</small></article></div>'+chart(rows,m,p)+'<p class="ofa-note">'+esc(base?.provenance||'Baseline unavailable')+'</p></section>'+
 countriesHTML()+'<details class="ofa-raw"><summary>All raw indicators for '+esc(p.name)+' ('+Object.keys(base?.raw?.rawIndicators||{}).length+' fields)</summary><div class="ofa-table-scroll"><table><thead><tr><th>Indicator</th><th>Field key</th><th>Raw value</th><th>Source status</th></tr></thead><tbody>'+rawHTML(p)+'</tbody></table></div><p class="ofa-note">Raw source values remain separate from modeled graph values. N/A is not converted to zero.</p></details><p class="ofa-footnote">The 30-day preview is a deterministic scenario around the existing source baseline, not observed daily history or a verified forecast. After the game begins, charts switch to recorded game-turn values.</p></div>';
}
function exportCsv(){
 const p=selected(),e=p&&preview.get(iso(p));if(!p||!e)return{ok:false,code:'COUNTRY_UNAVAILABLE'};
 const rows=[['country',p.name],['iso3',iso(p)],['baseline_year',e.baselineYear],['mode',live?'LIVE_GAME_TURNS':'MODEL_PREVIEW'],['provenance',e.provenance],[],['metric','baseline_value','latest_chart_value','source_status']];
 for(const m of metrics){const r=seriesFor(p,m.id),last=r[r.length-1];rows.push([m.label,e.values[m.id]??'',last?.value??'',e.raw.fieldProvenance?.[m.raw]||(e.values[m.id]===null?'UNAVAILABLE':'LOCAL_BASELINE / MODEL')]);}
 for(const[k,v]of Object.entries(e.raw.rawIndicators||{}))rows.push([k,v??'','',e.raw.fieldProvenance?.[k]||(v==null?'UNAVAILABLE':'LOCAL_REPOSITORY_BASELINE')]);
 const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return/[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\r\n');
 try{const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=g.document.createElement('a');a.href=url;a.download='omega-finance-'+iso(p).toLowerCase()+'-analytics.csv';a.style.display='none';g.document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);return{ok:true};}catch(_){return{ok:false,code:'CSV_EXPORT_UNAVAILABLE',content:csv};}
}
function bind(){
 if(bound||!g.document)return;bound=true;
 g.document.addEventListener('change',e=>{const t=e.target;if(t?.matches?.('[data-ofa-country]')){const p=profiles.find(p=>(p.countryCode||p.iso3)===t.value)||profiles.find(p=>iso(p)===String(t.value).toUpperCase());if(p){chosen=iso(p);render();}}else if(t?.matches?.('[data-ofa-metric]')){metricId=metrics.some(m=>m.id===t.value)?t.value:'gdp';page=0;render();}});
 g.document.addEventListener('input',e=>{const t=e.target;if(!t?.matches?.('[data-ofa-search]'))return;query=t.value;page=0;render();const next=g.document.querySelector('[data-ofa-search]');if(next){next.focus();try{next.setSelectionRange(query.length,query.length);}catch(_){}}});
 g.document.addEventListener('click',e=>{const t=e.target?.closest?.('[data-ofa-page],[data-ofa-open],[data-ofa-export]');if(!t)return;if(t.hasAttribute('data-ofa-page')){page=Math.max(0,page+(Number(t.getAttribute('data-ofa-page'))||0));render();}else if(t.hasAttribute('data-ofa-open')){const p=profiles.find(p=>(p.countryCode||p.iso3)===t.getAttribute('data-ofa-open'))||profiles.find(p=>iso(p)===String(t.getAttribute('data-ofa-open')).toUpperCase());if(p){chosen=iso(p);render();const s=g.document.querySelector('[data-ofa-country]');if(s)s.value=p.countryCode||p.iso3;}}else if(t.hasAttribute('data-ofa-export'))exportCsv();});
}
function observe(){if(observer||!g.document||!g.MutationObserver)return;const target=g.document.body||g.document.documentElement;if(target){observer=new g.MutationObserver(()=>{if(g.document.querySelector('[data-ofa-container]'))render();});observer.observe(target,{childList:true,subtree:true});}}
async function init(){
 if(ready)return diagnostics();if(boot)return boot;
 boot=(async()=>{const f=finance();if(!f?.getProfiles)throw new Error('FINANCE_PROFILES_UNAVAILABLE');if(f.init)await f.init();const a=macro();if(a?.init)await a.init();
  profiles=f.getProfiles().slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  for(const p of profiles){preview.set(iso(p),createPreview(p));countryMap.set(iso(p),p);countryMap.set(code(p),p);}
  const bd=profiles.find(p=>iso(p)==='BGD'||code(p)==='BGD');chosen=iso(bd||profiles[0]);ready=true;bind();observe();render();dispatch('OMEGA_FINANCE_ANALYTICS_READY',diagnostics());return diagnostics();})();
 try{return await boot;}finally{if(!ready)boot=null;}
}
function dispatch(type,detail){try{g.dispatchEvent&&g.CustomEvent&&g.dispatchEvent(new g.CustomEvent(type,{detail}));}catch(_){}}
function diagnostics(){return{version:VERSION,initialized:ready,countryCount:profiles.length,metricCount:metrics.length,previewCountries:preview.size,previewHorizonDays:DAYS,previewPointsPerMetric:DAYS+1,gameStarted,liveStarted:live,lastTurn,liveCountryCount:liveData.size,selectedCountryCode:chosen,selectedMetric:metricId,previewIsObservedHistory:false};}
function getCountrySeries(country,id){const p=countryMap.get(String(country||'').toUpperCase());if(!p)return null;const m=metrics.some(m=>m.id===id)?id:'gdp',e=preview.get(iso(p));return{countryCode:iso(p),countryName:p.name,metric:m,mode:live?'LIVE_TURNS':'MODEL_PREVIEW',points:seriesFor(p,m),baseline:e?.values[m],provenance:e?.provenance};}
function start(){gameStarted=true;render();return diagnostics();}
const api={VERSION,init,diagnostics,getMetrics:()=>metrics.map(m=>({...m})),getCountrySeries,handleTurn,onGameStarted:start,render,refresh:render,exportCsv};
g.OmegaFinanceAnalyticsRuntime=api;
if(g.document){
 g.addEventListener&&g.addEventListener('OMEGA_FINANCE_RUNTIME_READY',()=>init().catch(e=>g.console?.error?.('[OMEGA ANALYTICS INIT]',e)));
 g.addEventListener&&g.addEventListener('OMEGA_MACRO_STABILITY_RUNTIME_READY',()=>init().catch(e=>g.console?.error?.('[OMEGA ANALYTICS INIT]',e)));
 g.addEventListener&&g.addEventListener('OMEGA_READY',()=>init().catch(e=>g.console?.error?.('[OMEGA ANALYTICS INIT]',e)));
 g.addEventListener&&g.addEventListener('OMEGA_GAME_STARTED',start);g.addEventListener&&g.addEventListener('OMEGA_SIMULATION_STARTED',start);
 g.addEventListener&&g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED',e=>init().then(()=>handleTurn(e?.detail||{})).catch(err=>g.console?.error?.('[OMEGA ANALYTICS TURN]',err)));
 if(g.OmegaFinanceMinistry)Promise.resolve().then(()=>init().catch(e=>g.console?.error?.('[OMEGA ANALYTICS INIT]',e)));
 else g.document.addEventListener&&g.document.addEventListener('DOMContentLoaded',()=>init().catch(e=>g.console?.error?.('[OMEGA ANALYTICS INIT]',e)),{once:true});
}
})(typeof window!=='undefined'?window:globalThis);
