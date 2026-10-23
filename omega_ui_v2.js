/* OMEGA Atlas Command UI v2.0.0
 * A presentation/navigation shell that reads canonical OMEGA runtimes.
 * It does not synthesize national statistics or mutate the simulation.
 * Existing full engine modules remain accessible through the reversible legacy bridge.
 */
(function (g, d) {
  'use strict';
  var VERSION = '2.0.0';
  if (!d || !d.body || g.OMEGAUIV2 && g.OMEGAUIV2.version === VERSION) return;
  var state = {
    route: 'home', country: null, countries: [], pickerOpen: false, countryQuery: '',
    govTab: 'executive', metric: 'gdp', moreQuery: '', nativeMode: false,
    financeReady: false, photosReady: false, error: null
  };
  var root = d.createElement('div');
  root.id = 'omega-ui-v2-root';
  root.setAttribute('aria-label', 'OMEGA Atlas Command interface');
  var resume = d.createElement('button');
  resume.id = 'omega-ui-v2-resume';
  resume.type = 'button';
  resume.hidden = true;
  resume.innerHTML = '<span aria-hidden="true">◈</span><span>Return to Atlas Command</span>';
  d.body.appendChild(root);
  d.body.appendChild(resume);
  d.body.classList.add('omega-ui-v2-active');

  var MODULES = [
    { id:'world', title:'World Map', desc:'World geography and country context', icon:'globe', photo:null },
    { id:'government', title:'Government', desc:'Executive and all ministries', icon:'landmark', photo:'bangladesh-parliament' },
    { id:'economy', title:'Economy & Finance', desc:'Fiscal indicators and trend charts', icon:'chart', photo:'geelong-oil-refinery' },
    { id:'resources', title:'Resources & Mines', desc:'Sites, reserves and material flow', icon:'layers', photo:'open-pit-mine' },
    { id:'factories', title:'Factories & Industry', desc:'Construction and production', icon:'factory', photo:'industrial-production-line' },
    { id:'home-affairs', title:'Home Affairs', desc:'Police, readiness and public safety', icon:'shield', photo:'bangladesh-police-headquarters' },
    { id:'foreign-affairs', title:'Foreign Affairs', desc:'Relations, missions and treaties', icon:'handshake', photo:'un-assembly-building' },
    { id:'religion', title:'Society & Religion', desc:'Sourced demographic and heritage records', icon:'users', photo:'mosque-architecture' },
    { id:'defense', title:'Defense', desc:'Readiness, logistics and procurement', icon:'defense', photo:'uss-nimitz' },
    { id:'society', title:'Population & Society', desc:'Population and public-service data', icon:'users', photo:'wheat-field' },
    { id:'country', title:'Country Dossier', desc:'National facts, sectors and data coverage', icon:'globe', photo:null }
  ];
  var CORE_MINISTRIES = [
    { id:'defense', name:'Defense', group:'Security & readiness' },
    { id:'home-affairs', name:'Home Affairs', group:'Police and public safety' },
    { id:'foreign-affairs', name:'Foreign Affairs', group:'Diplomacy and international relations' },
    { id:'finance', name:'Finance', group:'Treasury and public finance' },
    { id:'industry', name:'Industry', group:'Factories and industrial policy' },
    { id:'energy', name:'Energy', group:'Power and fuel systems' },
    { id:'education', name:'Education', group:'Education services' },
    { id:'health', name:'Health', group:'Health services' },
    { id:'agriculture', name:'Agriculture', group:'Food and agricultural systems' },
    { id:'transport', name:'Transport', group:'Road, rail, port and logistics' },
    { id:'intelligence', name:'Intelligence', group:'Strategic information' },
    { id:'justice', name:'Justice', group:'Justice and legal systems' },
    { id:'infrastructure', name:'Infrastructure', group:'National infrastructure' },
    { id:'environment', name:'Environment', group:'Environmental records and policy' },
    { id:'science', name:'Science & Technology', group:'Research and innovation' },
    { id:'labor', name:'Labor & Employment', group:'Workforce and employment' },
    { id:'culture', name:'Culture & Heritage', group:'Culture and heritage' },
    { id:'communications', name:'Communications', group:'Telecommunications and media' }
  ];

  function text(v) { return String(v == null ? '' : v); }
  function esc(v) { return text(v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string' || !v.trim()) return null;
    var str = v.trim().replace(/,/g, '');
    if (!/^-?\d+(?:\.\d+)?$/.test(str)) return null;
    var n = Number(str);
    return Number.isFinite(n) ? n : null;
  }
  function keyNorm(v) { return text(v).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function runtime() { return g.OmegaCountryRuntimeData || null; }
  function resolveCountry(value) {
    var api = runtime();
    if (!api || typeof api.resolveCountry !== 'function') return null;
    try { return api.resolveCountry(value) || null; } catch (_) { return null; }
  }
  function countryKey(row) { return text(row && (row.iso3 || row.countryCode || row.code || row.name)).trim().toUpperCase(); }
  function normalizedIdentity(value) {
    var id = resolveCountry(value);
    if (id) return id;
    var rows = state.countries;
    var query = keyNorm(value);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if ([row.countryCode, row.iso3, row.name, row.officialName].some(function (v) { return keyNorm(v) === query; })) return row;
    }
    return null;
  }
  function selectedIdentity() {
    return normalizedIdentity(state.country) || normalizedIdentity('USA') || state.countries[0] || null;
  }
  function iso3(id) { return text(id && (id.iso3 || id.countryCode || id.code)).trim().toUpperCase(); }
  function displayName(id) { return text(id && (id.name || id.officialName || id.countryCode)) || 'Country not selected'; }
  function flag(id) {
    var api = runtime();
    try { if (api && typeof api.flagFor === 'function') { var value=api.flagFor(id && (id.iso3 || id.countryCode || id.name)); if (value) return value; } } catch (_) {}
    var code = text(id && (id.countryCode || id.iso2)).toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) return Array.from(code, function (c) { return String.fromCodePoint(127397 + c.charCodeAt(0)); }).join('');
    return '◈';
  }
  function profileFor(id) {
    var api = runtime();
    if (!api || typeof api.getProfile !== 'function' || !id) return id;
    try { return api.getProfile(id.iso3 || id.countryCode || id.name) || id; } catch (_) { return id; }
  }
  function recordFor(domain, id) {
    var api = runtime();
    var key = iso3(id || selectedIdentity());
    if (api && typeof api.getRecord === 'function') {
      try { var data = api.getRecord(domain, key); if (data && typeof data === 'object') return data; } catch (_) {}
    }
    var profile = profileFor(id || selectedIdentity()) || {};
    if (domain === 'economy') return profile.sourceValues || profile.indicators || {};
    if (domain === 'population') return profile.populationValues || profile.demographics || {};
    return profile;
  }
  function deepMetric(obj, candidates, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4) return null;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i], value = obj[key];
      if (candidates.indexOf(keyNorm(key)) !== -1) {
        if (typeof value === 'object' && value) {
          var inner = num(value.value != null ? value.value : value.amount);
          if (inner != null) return { value:inner, key:key, unit:text(value.unit || value.units), year:value.year || value.observationYear || null, source:value.source || value.sourceId || null };
        }
        var n = num(value);
        if (n != null) return { value:n, key:key, unit:'', year:null, source:null };
      }
    }
    for (var j = 0; j < keys.length; j += 1) {
      var nested = deepMetric(obj[keys[j]], candidates, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  function metricValue(id, metric) {
    var p = profileFor(id) || {};
    var economy = recordFor('economy', id);
    var population = recordFor('population', id);
    var all = [p, p.indicators, p.metrics, p.sourceValues, p.populationValues, economy, population].filter(Boolean);
    var candidates = {
      gdp:['nominalgdpusd','gdpcurrentusd','gdpusd','gdpusdcurrent','gdpcurrent','nominalgdp','gdpcurrent','gdp'],
      population:['populationtotalpeople','totalpopulation','populationtotal','populationmillions','pop','population'],
      area:['areakm2','totalareakm2','surfaceareakm2','territorykm2','area'],
      inflation:['inflationannualpct','inflationratepct','inflationrate','inflation'],
      growth:['gdpgrowthannualpct','gdpgrowthpct','growthrate','economicgrowth']
    }[metric] || [];
    for (var i = 0; i < all.length; i += 1) {
      var found = deepMetric(all[i], candidates, 0);
      if (found) return found;
    }
    return null;
  }
  function compact(n, maximum) {
    if (n == null) return 'Not recorded';
    try { return new Intl.NumberFormat('en', { notation:'compact', maximumFractionDigits:maximum == null ? 1 : maximum }).format(n); }
    catch (_) { return Math.round(n).toLocaleString('en-US'); }
  }
  function displayMetric(found, kind) {
    if (!found || found.value == null) return 'Not recorded';
    var k = keyNorm(found.key || ''), unit = text(found.unit);
    if (kind === 'population') {
      if (/million/.test(k) || /million/i.test(unit)) return compact(found.value,1) + 'M';
      if (/billion/.test(k) || /billion/i.test(unit)) return compact(found.value,1) + 'B';
      return compact(found.value,1);
    }
    if (kind === 'gdp') {
      if (/billion/.test(k) || /billion/i.test(unit)) return '$' + compact(found.value,1) + 'B';
      if (/trillion/.test(k) || /trillion/i.test(unit)) return '$' + compact(found.value,1) + 'T';
      if (/usd|dollar|nominalgdp/.test(k) || /USD|dollar/i.test(unit)) return '$' + compact(found.value,1);
      return compact(found.value,1) + (unit ? ' ' + unit : '');
    }
    if (kind === 'area') return compact(found.value,1) + (unit || (/km2|squarekilomet/.test(k) ? ' km²' : ''));
    if (kind === 'inflation' || kind === 'growth') return compact(found.value,1) + '%';
    return compact(found.value,1);
  }
  function valueSource(found) {
    if (!found) return 'No recorded value';
    if (found.source) return text(found.source);
    if (found.year) return 'Source record · ' + text(found.year);
    return 'Canonical country record';
  }
  function currentYear() {
    var nodes = [d.querySelector('[data-omega-game-date]'), d.getElementById('status-clock')];
    for (var i=0;i<nodes.length;i+=1) {
      var t = nodes[i] && text(nodes[i].textContent);
      var match = t && t.match(/(?:19|20|21)\d{2}/);
      if (match) return match[0];
    }
    var s = g.Game && g.Game.state;
    var raw = s && (s.date || s.currentDate || s.simulationDate);
    var m = text(raw).match(/(?:19|20|21)\d{2}/);
    return m ? m[0] : 'Year not recorded';
  }
  function icon(name) {
    var paths = {
      home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
      landmark:'<path d="m3 9 9-6 9 6M4 10h16M5 20h14M7 10v8m5-8v8m5-8v8M3 21h18"/>',
      chart:'<path d="M3 3v18h18M7 14l4-4 3 3 6-7"/><circle cx="20" cy="6" r="1"/>',
      more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
      shield:'<path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m8 12 2.5 2.5L16 9"/>',
      factory:'<path d="M3 21V9l6 3V8l6 4V5h4v16zM7 17h2m3 0h2m3 0h2"/>',
      layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
      handshake:'<path d="m3 12 5-5 4 2 3-2 6 5-5 5-3-2-3 2z"/><path d="m8 7 3-3 4 3m-8 7 4 3m1-5 4 3"/>',
      users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
      defense:'<path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m12 7 1.2 3.2L17 11l-3 2 .7 3.5-2.7-2-2.7 2L10 13l-3-2 3.8-.8z"/>',
      search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
      arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
      back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
      chevron:'<path d="m9 18 6-6-6-6"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      close:'<path d="m5 5 14 14M19 5 5 19"/>'
    };
    return '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.globe)+'</svg>';
  }
  function photoItem(id) {
    try { return g.OmegaUIPhotoAssets && typeof g.OmegaUIPhotoAssets.get === 'function' ? g.OmegaUIPhotoAssets.get(id) : null; } catch (_) { return null; }
  }
  function photoUrl(id) {
    var item = photoItem(id);
    return item && /^assets\/ui-photos\/[a-z0-9-]+\.webp$/.test(text(item.path)) ? './' + item.path : '';
  }
  function photoCredit(id) {
    var item = photoItem(id);
    if (!item) return '';
    return '<div class="ov2-photo-credit">Photo: <a href="'+esc(item.sourcePageUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.author || item.creditText || 'Source attribution')+'</a> · <a href="'+esc(item.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(item.licenseShortName || 'License')+'</a></div>';
  }
  function heroPhoto(id, title, subtitle, className) {
    var url = photoUrl(id), item=photoItem(id), cls='ov2-hero'+(url?' ov2-hero--photo':'')+(className?' '+className:'');
    if (url) return '<section class="'+cls+'"><img class="ov2-hero-img" src="'+esc(url)+'" alt="'+esc(item.altText||item.caption||title)+'" width="'+Number(item.width||1280)+'" height="'+Number(item.height||720)+'" loading="eager" decoding="async"><div class="ov2-hero-copy"><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div></section>'+photoCredit(id);
    return '<section class="ov2-hero"><div class="ov2-hero-fallback"><div><span class="ov2-big-flag">'+esc(flag(selectedIdentity()))+'</span><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div></div></section>';
  }
  function modulePhoto(id) {
    var p=photoUrl(id);
    return p?'<img class="ov2-module-img" src="'+esc(p)+'" alt="" loading="lazy" decoding="async">':'';
  }
  function pageHead(eyebrow,title,subtitle,action) {
    return '<header class="ov2-page-head"><div><p class="ov2-eyebrow">'+esc(eyebrow)+'</p><h1 class="ov2-title">'+esc(title)+'</h1>'+(subtitle?'<p class="ov2-subtitle">'+esc(subtitle)+'</p>':'')+'</div>'+(action||'')+'</header>';
  }
  function sectionHead(title,desc,action) {
    return '<div class="ov2-section-head"><div><h2>'+esc(title)+'</h2>'+(desc?'<p>'+esc(desc)+'</p>':'')+'</div>'+(action||'')+'</div>';
  }
  function kpi(label,value,source,ico) {
    return '<article class="ov2-card ov2-kpi"><div class="ov2-kpi-head">'+icon(ico||'chart')+'<span>'+esc(label)+'</span></div><strong class="ov2-kpi-value">'+esc(value)+'</strong><small class="ov2-kpi-source">'+esc(source)+'</small></article>';
  }
  function fact(label,value,source) {
    return '<article class="ov2-fact"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(source||'')+'</small></article>';
  }
  function moduleTile(id) {
    var item=MODULES.find(function (m) { return m.id===id; });
    if(!item)return '';
    var imgId=item.photo;
    var identity=selectedIdentity();
    if ((id==='government'||id==='home-affairs'||id==='religion') && !(identity && (identity.iso3==='BGD'||identity.countryCode==='BD'))) {
      if (id==='government') imgId=null;
      if (id==='home-affairs') imgId=null;
      if (id==='religion') imgId=null;
    }
    return '<button type="button" class="ov2-module" data-v2-route="'+esc(id)+'" aria-label="Open '+esc(item.title)+'">'+modulePhoto(imgId||'')+'<span class="ov2-module-copy"><span><strong>'+esc(item.title)+'</strong><small>'+esc(item.desc)+'</small></span><span class="ov2-module-icon">'+icon(item.icon)+'</span></span></button>';
  }
  function rowButton(title,desc,ico,route,photoId) {
    var thumb=photoUrl(photoId||'');
    return '<button type="button" class="ov2-row" data-v2-route="'+esc(route||'more')+'">'+(thumb?'<img class="ov2-row-thumb" src="'+esc(thumb)+'" alt="" loading="lazy" decoding="async">':'<span class="ov2-row-icon">'+icon(ico||'globe')+'</span>')+'<span class="ov2-row-main"><strong>'+esc(title)+'</strong><small>'+esc(desc||'')+'</small></span><span class="ov2-chevron" aria-hidden="true">›</span></button>';
  }
  function currentCountryContextChanged() {
    var id=selectedIdentity();
    if(!id)return;
    // This is a UI browsing context, not an assignment of player sovereignty.
    g.OmegaMinistryViewCountry = iso3(id);
    if(g.OmegaCabinetUI) g.OmegaCabinetUI.activeCountry=iso3(id);
    try { g.dispatchEvent(new g.CustomEvent('OMEGA_UI_V2_COUNTRY_CONTEXT_CHANGED',{detail:{countryCode:id.countryCode||null,iso3:id.iso3||null,name:displayName(id)}})); } catch (_) {}
  }
  function getFinanceSeries() {
    var api=g.OmegaFinanceAnalyticsRuntime, id=selectedIdentity();
    if(!api || typeof api.getCountrySeries!=='function'||!id)return null;
    var key=iso3(id);
    try { return api.getCountrySeries(key,state.metric||'gdp') || null; } catch (_) { return null; }
  }
  function seriesValue(p) {
    if(typeof p==='number')return Number.isFinite(p)?p:null;
    if(!p||typeof p!=='object')return null;
    var candidates=['value','y','amount','metricValue','result','currentValue','baseline'];
    for(var i=0;i<candidates.length;i++){var n=num(p[candidates[i]]);if(n!==null)return n;}
    if(p.metrics&&typeof p.metrics==='object') {
      var keys=Object.keys(p.metrics);for(var j=0;j<keys.length;j++){var mv=num(p.metrics[keys[j]]);if(mv!==null)return mv;}
    }
    return null;
  }
  function trendChart() {
    var api=g.OmegaFinanceAnalyticsRuntime;
    var list=[];
    try { list=api&&typeof api.getMetrics==='function'?api.getMetrics():[]; } catch (_) {}
    if(!Array.isArray(list)||!list.length)list=[{id:'gdp',label:'Nominal GDP',unit:'USD'},{id:'growth',label:'GDP growth',unit:'%'},{id:'inflation',label:'Inflation',unit:'%'},{id:'debt',label:'Public debt',unit:'USD'}];
    if(!list.some(function(x){return x.id===state.metric;}))state.metric=list[0]&&list[0].id||'gdp';
    var select='<label class="ov2-sr-only" for="ov2-metric-select">Chart metric</label><select id="ov2-metric-select" class="ov2-select" data-v2-metric>';
    select+=list.map(function(m){return '<option value="'+esc(m.id)+'"'+(m.id===state.metric?' selected':'')+'>'+esc(m.label||m.id)+'</option>';}).join('')+'</select>';
    var series=getFinanceSeries(),points=series&&Array.isArray(series.points)?series.points.map(seriesValue).filter(function(v){return v!==null&&Number.isFinite(v);}):[];
    if(points.length<2) {
      return '<section class="ov2-card ov2-chart-card"><div class="ov2-chart-head"><div><h3>Economic trend</h3><p>Only available, source-backed or committed-turn values are charted.</p></div>'+select+'</div><div class="ov2-chart-empty">No usable series is available for this country and indicator yet. Missing history is not replaced with invented points.</div></section>';
    }
    if(points.length>31) {
      var sampled=[],step=(points.length-1)/30;
      for(var i=0;i<=30;i++)sampled.push(points[Math.round(i*step)]);
      points=sampled;
    }
    var min=Math.min.apply(null,points),max=Math.max.apply(null,points),range=max-min||Math.abs(max)||1;
    var coords=points.map(function(v,i){return {x:12+i*(296/Math.max(1,points.length-1)),y:91-((v-min)/range)*70};});
    var poly=coords.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' ');
    var area='M '+coords[0].x.toFixed(1)+' 101 L '+coords.map(function(p){return p.x.toFixed(1)+' '+p.y.toFixed(1);}).join(' L ')+' L '+coords[coords.length-1].x.toFixed(1)+' 101 Z';
    var mode=text(series.mode||'MODEL_PREVIEW');
    var isLive=mode==='LIVE_TURNS';
    var meta=isLive?'Committed game-turn data':'Scenario preview · modeled, not observed history';
    var last=points[points.length-1];
    var metric=list.find(function(m){return m.id===state.metric;})||{};
    var formatted=metric.unit==='USD'?'$'+compact(last,1):compact(last,1)+(metric.unit==='%'?'%':metric.unit?' '+metric.unit:'');
    var defs='<defs><linearGradient id="ov2-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#43d6c8" stop-opacity=".29"/><stop offset="100%" stop-color="#43d6c8" stop-opacity="0"/></linearGradient></defs>';
    var grid=[24,46,68,90].map(function(y){return '<line class="ov2-gridline" x1="12" y1="'+y+'" x2="308" y2="'+y+'"/>';}).join('');
    return '<section class="ov2-card ov2-chart-card"><div class="ov2-chart-head"><div><h3>'+esc(metric.label||state.metric)+'</h3><p>'+esc(meta)+'</p></div>'+select+'</div><svg class="ov2-chart" viewBox="0 0 320 112" role="img" aria-label="'+esc(metric.label||state.metric)+' chart showing '+points.length+' values">'+defs+grid+'<path class="ov2-area" d="'+area+'"/><polyline points="'+poly+'"/></svg><div class="ov2-chart-stat"><strong>'+esc(formatted)+'</strong><span>Latest available point<br>'+esc(text(series.provenance&&typeof series.provenance==='string'?series.provenance:''))+'</span></div><div class="ov2-chart-caption">'+(isLive?'Source: committed simulation turns.':'Model data is explicitly marked as a scenario preview. It is not recorded history or a forecast guarantee.')+'</div></section>';
  }
  function homeScreen() {
    var id=selectedIdentity(),p=profileFor(id)||{},gdp=metricValue(id,'gdp'),pop=metricValue(id,'population'),area=metricValue(id,'area'),infl=metricValue(id,'inflation');
    var photo=(id&&(id.iso3==='BGD'||id.countryCode==='BD'))?'bangladesh-parliament':'';
    return pageHead('National command','Welcome back, Commander','A live interface to the selected country record. Missing fields stay visible as Not recorded.', '<span class="ov2-badge ov2-badge--accent">'+esc(currentYear())+'</span>')+
      heroPhoto(photo,displayName(id),text(p.officialName||'Country profile')+' · Country context only')+
      '<div class="ov2-grid ov2-grid--four">'+kpi('Nominal GDP',displayMetric(gdp,'gdp'),valueSource(gdp),'chart')+kpi('Population',displayMetric(pop,'population'),valueSource(pop),'users')+kpi('Area',displayMetric(area,'area'),valueSource(area),'globe')+kpi('Inflation',displayMetric(infl,'inflation'),valueSource(infl),'chart')+'</div>'+
      '<section class="ov2-section">'+sectionHead('National overview','Open a focused part of the simulation', '<button type="button" class="ov2-quiet-link" data-v2-route="more">All modules ›</button>')+
      '<div class="ov2-tiles">'+moduleTile('world')+moduleTile('government')+moduleTile('economy')+moduleTile('resources')+moduleTile('factories')+moduleTile('foreign-affairs')+'</div></section>'+
      '<section class="ov2-section">'+sectionHead('Economic outlook','Real engine series only · scenario previews are labelled')+trendChart()+'</section>'+
      '<p class="ov2-data-note">Country selection in this header changes the browsing context only. It does not transfer player control or alter simulation ownership. Values shown above come from the canonical country runtime; an absent source value remains Not recorded.</p>';
  }
  function governmentScreen() {
    var id=selectedIdentity(),p=profileFor(id)||{};
    var controls='<div class="ov2-segmented" role="group" aria-label="Government destination"><button type="button" data-v2-gov-tab="executive" aria-pressed="'+(state.govTab==='executive')+'">Executive Ministry</button><button type="button" data-v2-gov-tab="all" aria-pressed="'+(state.govTab==='all')+'">All Ministries</button></div>';
    if(state.govTab==='executive') {
      var gdp=metricValue(id,'gdp'),pop=metricValue(id,'population'),area=metricValue(id,'area');
      return pageHead('Government','National executive','Country Overview is the starting dossier inside Executive Ministry, not a separate top-level destination.')+controls+
        heroPhoto(id&&(id.iso3==='BGD'||id.countryCode==='BD')?'bangladesh-parliament':'',displayName(id)+' · Executive overview','National institutions and source-backed indicators')+
        '<div class="ov2-fact-grid">'+fact('Capital',text(p.capital||'Not recorded'),p.capital?'Country registry':'No recorded capital')+fact('Population',displayMetric(pop,'population'),valueSource(pop))+fact('Territory',displayMetric(area,'area'),valueSource(area))+fact('GDP',displayMetric(gdp,'gdp'),valueSource(gdp))+'</div>'+
        '<div class="ov2-actions"><button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-route="country">Open Country Dossier '+icon('arrow')+'</button><button type="button" class="ov2-button ov2-button--block" data-v2-native="cabinet">Open full executive workspace '+icon('arrow')+'</button></div>'+
        '<section class="ov2-section">'+sectionHead('National departments','Select a module from the current game registry')+'<div class="ov2-tiles">'+moduleTile('home-affairs')+moduleTile('foreign-affairs')+moduleTile('defense')+moduleTile('society')+'</div></section>';
    }
    var rows=listMinistries();
    var cards=rows.map(function(m){
      return '<button type="button" class="ov2-row" data-v2-ministry="'+esc(m.id)+'" data-v2-ministry-name="'+esc(m.name)+'"><span class="ov2-row-icon">'+icon(ministryIcon(m.name))+'</span><span class="ov2-row-main"><strong>'+esc(m.name)+'</strong><small>'+esc(m.group||m.description||'Open ministry workspace')+'</small></span><span class="ov2-chevron" aria-hidden="true">›</span></button>';
    }).join('');
    return pageHead('Government','All Ministries','A searchable directory backed by the current ministry registry.')+controls+
      '<input class="ov2-directory-search" data-v2-ministry-search type="search" placeholder="Search ministries…" aria-label="Search ministries">'+
      '<div class="ov2-list" id="ov2-ministry-list">'+(cards||'<div class="ov2-empty">Ministry registry is not ready. Open the full cabinet to use the canonical ministry list.</div>')+'</div>'+
      '<p class="ov2-data-note">Ministry actions and minister state are delegated to the established game engine. This directory does not invent budgets, staffing or readiness values.</p>';
  }
  function listMinistries() {
    var result=[],cabinet=g.OmegaCabinetUI,registry=g.OmegaMinistryRegistry;
    var sources=[];
    if(registry) ['list','listMinistries','getAll','getAllMinistries'].forEach(function(k){if(typeof registry[k]==='function')try{var v=registry[k]();if(Array.isArray(v))sources.push(v);}catch(_){}});
    if(cabinet&&cabinet.ministriesDatabase) {
      if(Array.isArray(cabinet.ministriesDatabase))sources.push(cabinet.ministriesDatabase);
      else if(typeof cabinet.ministriesDatabase==='object')sources.push(Object.keys(cabinet.ministriesDatabase).map(function(k){var v=cabinet.ministriesDatabase[k];return Object.assign({id:k},v&&typeof v==='object'?v:{name:text(v)});}));
    }
    if(registry&&Array.isArray(registry.ministries))sources.push(registry.ministries);
    for(var i=0;i<sources.length;i++){
      result=sources[i].map(function(m){
        if(typeof m==='string')return{id:keyNorm(m),name:m,group:'Ministry'};
        return{id:text(m.id||m.ministryId||m.key||m.code||m.slug),name:text(m.name||m.title||m.label||m.ministryName||m.id),group:text(m.description||m.portfolio||m.domain||'Ministry workspace')};
      }).filter(function(m){return m.id&&m.name;});
      if(result.length)break;
    }
    if(!result.length)result=CORE_MINISTRIES.slice();
    var seen=Object.create(null);
    return result.filter(function(m){var key=keyNorm(m.id);if(!key||seen[key])return false;seen[key]=true;return true;});
  }
  function ministryIcon(name) {
    var n=keyNorm(name);
    if(/defen|military|intelligence/.test(n))return 'defense';
    if(/foreign|diplom|external/.test(n))return 'handshake';
    if(/finance|treasury|econom/.test(n))return 'chart';
    if(/industry|energy|transport|infrastructure/.test(n))return 'factory';
    if(/home|police|interior|security/.test(n))return 'shield';
    return 'landmark';
  }
  function economyScreen() {
    var id=selectedIdentity(),gdp=metricValue(id,'gdp'),infl=metricValue(id,'inflation'),growth=metricValue(id,'growth');
    return pageHead('Economy','Economic intelligence','Indicator trends use the existing Finance analytics runtime; the chart states whether data is model preview or committed turns.')+
      '<div class="ov2-grid">'+kpi('GDP',displayMetric(gdp,'gdp'),valueSource(gdp),'chart')+kpi('GDP growth',displayMetric(growth,'growth'),valueSource(growth),'chart')+kpi('Inflation',displayMetric(infl,'inflation'),valueSource(infl),'chart')+kpi('Fiscal data','Open details','Canonical Finance runtime','landmark')+'</div>'+
      '<section class="ov2-section">'+trendChart()+'</section>'+
      '<section class="ov2-section">'+sectionHead('Financial workspace','Use the existing ledger and monetary runtime')+'<div class="ov2-card ov2-card-body"><p>Cash, public debt, exchange rates and budgets are shown only when the underlying game records supply them. Banking accounts are distinct from treasury ledgers.</p><div class="ov2-actions"><button type="button" class="ov2-button ov2-button--primary" data-v2-native="finance">Open Finance Ministry</button><button type="button" class="ov2-button" data-v2-native="cabinet">Open all Finance tools</button></div></div></section>';
  }
  function countryScreen() {
    var id=selectedIdentity(),p=profileFor(id)||{},gdp=metricValue(id,'gdp'),pop=metricValue(id,'population'),area=metricValue(id,'area');
    return pageHead('Executive Ministry · Country dossier','Country Overview',displayName(id)+' · sourced profile and data coverage', '<button class="ov2-button ov2-button--quiet" type="button" data-v2-route="government">‹ Government</button>')+
      heroPhoto(id&&(id.iso3==='BGD'||id.countryCode==='BD')?'bangladesh-parliament':'',displayName(id),text(p.officialName||'Official country name not recorded'))+
      '<div class="ov2-grid">'+kpi('GDP',displayMetric(gdp,'gdp'),valueSource(gdp),'chart')+kpi('Population',displayMetric(pop,'population'),valueSource(pop),'users')+kpi('Area',displayMetric(area,'area'),valueSource(area),'globe')+kpi('Capital',text(p.capital||'Not recorded'),p.capital?'Country registry':'No recorded capital','landmark')+'</div>'+
      '<section class="ov2-section">'+sectionHead('Country data domains','Open source-backed sector evidence')+'<div class="ov2-list">'+rowButton('Economic & trade profile','GDP, trade and macro indicators','chart','economy')+rowButton('Resources & energy','Sites, reserves and extraction records','layers','resources','open-pit-mine')+rowButton('Industry & infrastructure','Production and national infrastructure','factory','factories','industrial-production-line')+rowButton('People & public services','Population and recorded services','users','society')+rowButton('Foreign relations','Treaties and diplomatic records','handshake','foreign-affairs','un-assembly-building')+'</div></section>'+
      '<p class="ov2-data-note">The dossier is not a claim that every field is complete. Missing values remain Not recorded. Open the country sector panel for deeper sourced evidence when the canonical source registry has a record.</p>'+
      '<div class="ov2-actions"><button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-native="country-dossier">Open full source evidence</button></div>';
  }
  function resourceScreen() {
    return pageHead('National assets','Resources & Mines','A traceable material chain, not unrelated counters.')+
      heroPhoto('open-pit-mine','Resource command','Sites · reserves · extraction · warehouse · route')+
      '<div class="ov2-grid">'+kpi('Global resource sites','Open registry','Country scoped when data exists','layers')+kpi('Reserve balance','Not recorded','Read the selected site reserve ledger','chart')+kpi('Warehouse stock','Not recorded','Batch ledger is authoritative','layers')+kpi('Delivered inputs','Not recorded','Confirmed shipment receipts only','factory')+'</div>'+
      '<section class="ov2-section">'+sectionHead('Material flow','Follow each batch across the game engine')+'<div class="ov2-card ov2-card-body"><div class="ov2-flow">'+[
        ['Resource site','Canonical identity, recorded reserve and provenance'],
        ['Extraction cycle','Eligible production consumes the selected reserve'],
        ['Material batch','Quantity, unit, source and remaining quantity'],
        ['Warehouse','Receipt and inventory lot are derived from the batch ledger'],
        ['Transport route','Capacity, mode, route provenance and delivery status'],
        ['Factory input / output','Recipe consumption followed by a canonical output batch'],
        ['Economy / market','Only accepted output and market ledger events']
      ].map(function(step,i){return '<div class="ov2-flow-step"><span class="ov2-flow-number">'+(i+1)+'</span><div><strong>'+esc(step[0])+'</strong><small>'+esc(step[1])+'</small></div></div>';}).join('')+'</div></div></section>'+
      '<div class="ov2-actions"><button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-native="resource">Open canonical Resource Console</button><button type="button" class="ov2-button ov2-button--block" data-v2-native="resource-mines">Open mines and extraction</button></div>'+
      '<p class="ov2-data-note">The current screen does not fabricate resource totals. Site selection, reserve state, shipment and production actions are executed by the canonical runtime.</p>';
  }
  function factoryScreen() {
    return pageHead('National assets','Factories & Industry','Production and construction remain bound to existing factory recipes and game time.')+
      heroPhoto('industrial-production-line','Industrial network','Project → inputs → production cycle → output batch')+
      '<div class="ov2-grid">'+kpi('Active factories','Not recorded','Canonical factory registry','factory')+kpi('Production rate','Not recorded','Only defined recipe outputs','chart')+kpi('Input readiness','Not recorded','Warehouse-matched batches','layers')+kpi('Projects','Not recorded','Build completion uses game clock','landmark')+'</div>'+
      '<section class="ov2-section">'+sectionHead('Production sequence','A factory is ready only when its actual inputs are available')+'<div class="ov2-card ov2-card-body"><div class="ov2-flow">'+[
        ['Factory / project record','Read factory type, build phase and game-calendar completion date'],
        ['Recipe and input requirements','Use catalogued recipe, units, duration and labour where present'],
        ['Warehouse batch matching','Show available, reserved and missing input quantities'],
        ['Production cycle','Consume actual input batches according to the canonical handler'],
        ['Output batch','Publish quantity, unit, remaining stock and destination ledger']
      ].map(function(step,i){return '<div class="ov2-flow-step"><span class="ov2-flow-number">'+(i+1)+'</span><div><strong>'+esc(step[0])+'</strong><small>'+esc(step[1])+'</small></div></div>';}).join('')+'</div></div></section>'+
      '<div class="ov2-actions"><button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-native="factory">Open canonical Factory workspace</button><button type="button" class="ov2-button ov2-button--block" data-v2-native="resource-processing">Open industrial pipeline</button></div>'+
      '<p class="ov2-data-note">This view intentionally shows Not recorded rather than sample factory counts, costs or daily capacities. Factory details are delegated to the registered engine.</p>';
  }
  function homeAffairsScreen() {
    var isBD=selectedIdentity()&&(selectedIdentity().iso3==='BGD'||selectedIdentity().countryCode==='BD');
    return pageHead('Government department','Home Affairs','Public safety and internal order')+
      heroPhoto(isBD?'bangladesh-police-headquarters':'','Home Affairs','Police · personnel · vehicles · public safety')+
      '<div class="ov2-grid">'+kpi('Budget','Not recorded','Ledger-backed budget only','chart')+kpi('Personnel','Not recorded','Roster-backed counts only','users')+kpi('Vehicles','Not recorded','Registered vehicle records','shield')+kpi('Readiness','Not recorded','Capability assessment required','check')+'</div>'+
      '<section class="ov2-section">'+sectionHead('Department workspaces','Open the existing department runtime')+'<div class="ov2-list">'+rowButton('Police operations','Operations and available capability','shield','home-affairs')+rowButton('Personnel & training','Recruitment, roster and training','users','home-affairs')+rowButton('Vehicles & logistics','Vehicle readiness and route support','layers','home-affairs')+rowButton('Emergency services','Emergency response where implemented','shield','home-affairs')+'</div></section>'+
      '<button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-native="home-affairs">Open Home Affairs engine</button>'+
      '<p class="ov2-data-note">No fixed budget/personnel values are shown unless the country-scoped source ledger contains them. Buttons route to the current Ministry runtime, not a fake success state.</p>';
  }
  function foreignAffairsScreen() {
    return pageHead('External relations','Foreign Affairs','Diplomatic state and international organizations')+
      heroPhoto('un-assembly-building','Foreign Affairs','Relations · missions · treaties · multilateral forums')+
      '<div class="ov2-tiles">'+
        ['United Nations','NATO','WTO','OIC','ASEAN','African Union','European Union'].map(function(n){return '<article class="ov2-card ov2-card-body"><div class="ov2-row-icon">'+icon('handshake')+'</div><h3 style="margin-top:9px">'+esc(n)+'</h3><p>Open only if supported by the current relation or organization registry.</p></article>';}).join('')+
      '</div><section class="ov2-section">'+sectionHead('Diplomatic workflow','Record state, do not invent treaty status')+'<div class="ov2-flow">'+[
        ['Bilateral relations','Read the selected counterpart’s current relationship state'],
        ['Missions & negotiations','Open the mission or negotiation records'],
        ['Treaty review','Track proposed, pending and enacted statuses separately'],
        ['Diplomatic timeline','Chronological game events and confirmed outcomes']
      ].map(function(step,i){return '<div class="ov2-flow-step"><span class="ov2-flow-number">'+(i+1)+'</span><div><strong>'+esc(step[0])+'</strong><small>'+esc(step[1])+'</small></div></div>';}).join('')+'</div></section>'+
      '<button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-native="foreign-affairs">Open Foreign Affairs ministry</button>'+
      '<p class="ov2-data-note">Organization tiles describe navigation categories only. They do not claim membership, treaty signatures or live diplomatic relations.</p>';
  }
  function religionScreen() {
    var isBD=selectedIdentity()&&(selectedIdentity().iso3==='BGD'||selectedIdentity().countryCode==='BD');
    return pageHead('People & identity','Society & Religion','Neutral presentation of sourced demographic and heritage records')+
      heroPhoto(isBD?'mosque-architecture':'','Society & Religion','Population · recorded demographics · religion · cultural heritage')+
      '<div class="ov2-grid">'+kpi('Population',displayMetric(metricValue(selectedIdentity(),'population'),'population'),valueSource(metricValue(selectedIdentity(),'population')),'users')+kpi('Religion shares','Not recorded','Show only sourced percentages','users')+kpi('Heritage sites','Not recorded','Catalogued site data only','globe')+kpi('Public services','Not recorded','Domain registry coverage','landmark')+'</div>'+
      '<section class="ov2-section">'+sectionHead('Data integrity','Percentages and site counts require a current sourced record')+'<div class="ov2-list">'+rowButton('Population and demographics','Recorded observations and source years','users','society')+rowButton('Religion records','No default percentage or invented distribution','users','religion')+rowButton('Cultural and heritage sites','Site identities and verified imagery','globe','religion')+'</div></section>'+
      '<p class="ov2-data-note">Religious and demographic information is presented neutrally. The page never substitutes an example chart or sample percentages for missing country data.</p>';
  }
  function defenseScreen() {
    var isUS=selectedIdentity()&&(selectedIdentity().iso3==='USA'||selectedIdentity().countryCode==='US');
    return pageHead('National security','Defense','Readiness · logistics · procurement · training')+
      heroPhoto(isUS?'uss-nimitz':'','Defense','A command overview, not an unsupported operations simulator')+
      '<div class="ov2-grid">'+kpi('Readiness','Not recorded','Engine assessment required','shield')+kpi('Logistics','Not recorded','Inventory and delivery records','layers')+kpi('Procurement','Not recorded','Approved project state','factory')+kpi('Training','Not recorded','Recorded training outcomes','users')+'</div>'+
      '<button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-native="defense">Open Defense workspace</button>'+
      '<p class="ov2-data-note">Capability, inventory and construction data must come from canonical engines. The photo is illustrative, not evidence that the selected country owns a pictured asset.</p>';
  }
  function worldScreen() {
    return pageHead('World intelligence','World Map','The existing offline map remains the geographic authority.')+
      '<div class="ov2-world-banner">'+icon('globe')+'<span><strong>'+esc(displayName(selectedIdentity()))+'</strong><small>Selected country context · tap the map or choose another country above</small></span></div>'+
      '<div class="ov2-map-pointer-hole" aria-label="Interactive world map is visible behind this panel"></div>'+
      '<div class="ov2-world-controls"><button type="button" class="ov2-button" data-v2-route="country">Country dossier</button><button type="button" class="ov2-button" data-v2-route="economy">Economic indicators</button><button type="button" class="ov2-button" data-v2-route="resources">Resource sites</button></div>'+
      '<p class="ov2-data-note">The locally bundled Leaflet/offline map and its canonical country records are preserved. A country selected from this top header changes the dossier context only; it does not change which country the player controls.</p>';
  }
  function moreScreen() {
    var query=keyNorm(state.moreQuery||'');
    var visible=MODULES.filter(function(m){return m.id!=='home' && (!query||keyNorm(m.title+' '+m.desc).indexOf(query)!==-1);});
    return pageHead('Workspace directory','More modules','A single directory for specialist ministries and game systems')+
      '<input type="search" data-v2-more-search class="ov2-directory-search" placeholder="Search resources, factories, ministries…" aria-label="Search game modules" value="'+esc(state.moreQuery)+'">'+
      '<div class="ov2-tiles">'+visible.map(function(item){return moduleTile(item.id);}).join('')+'</div>'+
      '<section class="ov2-section">'+sectionHead('Ministry workspaces','The current government registry remains the source of ministry identity')+'<div class="ov2-actions"><button type="button" class="ov2-button ov2-button--primary ov2-button--block" data-v2-route="government">Browse All Ministries '+icon('arrow')+'</button><button type="button" class="ov2-button ov2-button--block" data-v2-native="cabinet">Open legacy engine surfaces</button></div></section>';
  }
  function screenContent() {
    switch(state.route) {
      case 'world': return worldScreen();
      case 'government': return governmentScreen();
      case 'economy': return economyScreen();
      case 'country': return countryScreen();
      case 'resources': return resourceScreen();
      case 'factories': return factoryScreen();
      case 'home-affairs': return homeAffairsScreen();
      case 'foreign-affairs': return foreignAffairsScreen();
      case 'religion': case 'society': return religionScreen();
      case 'defense': return defenseScreen();
      case 'more': return moreScreen();
      default: return homeScreen();
    }
  }
  var NAV = [
    {id:'home',label:'Home',icon:'home'},
    {id:'world',label:'World',icon:'globe'},
    {id:'government',label:'Government',icon:'landmark'},
    {id:'economy',label:'Economy',icon:'chart'},
    {id:'more',label:'More',icon:'more'}
  ];
  function header() {
    var id=selectedIdentity(),nm=displayName(id),code=iso3(id)||'--';
    return '<header class="ov2-header"><div class="ov2-brand"><span class="ov2-brand-mark">'+icon('globe')+'</span><span>OMEGA</span></div><button class="ov2-country-button" type="button" data-v2-picker aria-expanded="'+state.pickerOpen+'" aria-label="Choose country"><span class="ov2-country-flag">'+esc(flag(id))+'</span><span class="ov2-country-name-wrap"><span class="ov2-country-name">'+esc(nm)+'</span><span class="ov2-country-code">'+esc(code)+' · COUNTRY CONTEXT</span></span><span aria-hidden="true">⌄</span></button><div class="ov2-year"><strong>'+esc(currentYear())+'</strong><span>GAME YEAR</span></div><section class="ov2-picker" '+(state.pickerOpen?'':'hidden')+' aria-label="Country selector"><div class="ov2-picker-head"><strong>Select a country</strong><input class="ov2-picker-search" type="search" data-v2-country-search placeholder="Search by country name or code" aria-label="Search countries" value="'+esc(state.countryQuery)+'"></div><div class="ov2-country-results" id="ov2-country-results">'+countryResultsHtml()+'</div></section></header>';
  }
  function countryResultsHtml() {
    var term=keyNorm(state.countryQuery),rows=state.countries.filter(function(c){return !term||keyNorm(c.name+' '+c.officialName+' '+c.iso3+' '+c.countryCode).indexOf(term)!==-1;}).slice(0,40);
    if(!rows.length)return '<div class="ov2-empty">No country matches this search.</div>';
    return rows.map(function(c){var active=countryKey(c)===countryKey(selectedIdentity());return '<button type="button" class="ov2-country-option" data-v2-country="'+esc(countryKey(c))+'" aria-current="'+active+'"><span class="ov2-country-flag">'+esc(flag(c))+'</span><span class="ov2-country-name-wrap"><span class="ov2-country-name">'+esc(c.name||c.officialName)+'</span><span class="ov2-country-code">'+esc(c.iso3||c.countryCode||'')+'</span></span><span class="ov2-country-code">'+(active?'SELECTED':'')+'</span></button>';}).join('');
  }
  function navHtml() {
    return '<nav class="ov2-bottom-nav" aria-label="Primary navigation">'+NAV.map(function(n){var current=state.route===n.id || (n.id==='more'&&['resources','factories','home-affairs','foreign-affairs','religion','society','defense','country'].indexOf(state.route)!==-1);return '<button type="button" class="ov2-nav-item" data-v2-route="'+n.id+'" aria-label="'+n.label+'" '+(current?'aria-current="page"':'')+'>'+icon(n.icon)+'<span>'+n.label+'</span></button>';}).join('')+'</nav>';
  }
  function render() {
    if(state.nativeMode||!root)return;
    root.hidden=false;
    d.body.classList.add('omega-ui-v2-active');
    d.body.style.overflow='hidden';
    root.className='ov2-app'+(state.route==='world'?' ov2-world':'');
    root.innerHTML=header()+'<main class="ov2-main"><div class="ov2-content" id="ov2-content">'+screenContent()+'</div></main>'+navHtml();
    if(state.pickerOpen) {
      var input=root.querySelector('[data-v2-country-search]');
      if(input && !input.dataset.focused) { input.dataset.focused='true'; try{input.focus({preventScroll:true});}catch(_){} }
    }
  }
  function renderCountryResults() {
    var target=d.getElementById('ov2-country-results');
    if(target)target.innerHTML=countryResultsHtml();
  }
  function suspendForNative(action) {
    state.nativeMode=true;
    root.hidden=true;
    d.body.classList.remove('omega-ui-v2-active');
    d.body.style.overflow='';
    resume.hidden=false;
    if(typeof action==='function')g.setTimeout(function(){try{action();}catch(e){notify('Could not open native engine module. '+text(e&&e.message||e));}},70);
  }
  function resumeV2() {
    state.nativeMode=false;
    resume.hidden=true;
    state.pickerOpen=false;
    currentCountryContextChanged();
    render();
  }
  function notify(message) {
    var old=d.getElementById('ov2-notice');
    if(old)old.remove();
    var node=d.createElement('div');
    node.id='ov2-notice';node.setAttribute('role','status');
    node.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(78px + env(safe-area-inset-bottom,0px));z-index:2147483001;padding:12px 14px;border-radius:10px;background:#102d40;border:1px solid #315c70;color:#f0f6f8;font:12px/1.45 system-ui,sans-serif;box-shadow:0 10px 24px #0007';
    node.textContent=message;d.body.appendChild(node);
    g.setTimeout(function(){if(node.isConnected)node.remove();},5000);
  }
  function openCabinet(ministryId,ministryName) {
    currentCountryContextChanged();
    var open=function(){
      var entry=g.OMEGAGovEntryV3;
      if(entry&&typeof entry.open==='function') entry.open();
      else {
        var button=d.getElementById('omega-gov-entry-v3');
        if(button)button.click();
        else if(typeof g.openMainMinistryView==='function')g.openMainMinistryView({preventDefault:function(){},stopPropagation:function(){},stopImmediatePropagation:function(){}});
      }
      if(ministryId||ministryName) {
        var attempts=0;
        var timer=function(){
          attempts++;
          var nodes=Array.prototype.slice.call(d.querySelectorAll('#cabinet-full-window [data-ministry-id],#ministry-dashboard-view [data-ministry-id],#cabinet-full-window .dept-card'));
          var wanted=keyNorm(ministryId||ministryName);
          var found=nodes.find(function(node){
            var code=keyNorm(node.getAttribute('data-ministry-id')||node.getAttribute('data-ministry')||node.id||'');
            var label=keyNorm(node.innerText||node.textContent||'');
            return (code && (code===wanted || wanted.indexOf(code)!==-1 || code.indexOf(wanted)!==-1)) || (ministryName&&label.indexOf(keyNorm(ministryName))!==-1);
          });
          if(found&&typeof found.click==='function'){found.click();return;}
          if(attempts<6)g.setTimeout(timer,180);
          else notify('The cabinet opened, but this ministry could not be matched automatically. Use the canonical All Ministries list.');
        };
        g.setTimeout(timer,200);
      }
    };
    suspendForNative(open);
  }
  function openNative(target) {
    var id=selectedIdentity(),country=iso3(id);
    if(target==='resource'||target==='resource-mines'||target==='resource-processing') {
      var engine=g.ResourceMinistryEngine;
      var panels={'resource':'matrix','resource-mines':'deposits','resource-processing':'industrial'};
      if(!engine||typeof engine.openModal!=='function'){notify('Canonical Resource Console is unavailable in this session.');return;}
      suspendForNative(function(){engine.openModal(country,panels[target]||'matrix');});
      return;
    }
    if(target==='finance'){openCabinet('finance','Finance');return;}
    if(target==='home-affairs'){openCabinet('home-affairs','Home Affairs');return;}
    if(target==='foreign-affairs'){openCabinet('foreign-affairs','Foreign Affairs');return;}
    if(target==='defense'){openCabinet('defense','Defense');return;}
    if(target==='factory'){
      openCabinet('industry','Industry');
      return;
    }
    if(target==='country-dossier'){
      suspendForNative(function(){
        var opened=false, panel=d.getElementById('omega-country-overview-panel');
        if(g.OmegaCountrySectorProfileUI&&typeof g.OmegaCountrySectorProfileUI.init==='function') {
          g.OmegaCountrySectorProfileUI.init();
          if(panel)opened=true;
        }
        if(!opened)openCabinet('executive','Executive Ministry');
      });
      return;
    }
    openCabinet(null,null);
  }
  function routeTo(route) {
    var valid=['home','world','government','economy','more','country','resources','factories','home-affairs','foreign-affairs','religion','society','defense'];
    if(valid.indexOf(route)===-1)return;
    state.route=route;state.pickerOpen=false;state.countryQuery='';state.error=null;render();
    if(route==='economy') {
      var api=g.OmegaFinanceAnalyticsRuntime;
      if(api&&typeof api.init==='function'&&!state.financeReady)Promise.resolve(api.init()).then(function(){state.financeReady=true;if(state.route==='economy'||state.route==='home')render();}).catch(function(){state.financeReady=false;});
    }
  }
  function onClick(event) {
    var target=event.target&&event.target.closest?event.target.closest('button[data-v2-route],button[data-v2-picker],button[data-v2-country],button[data-v2-gov-tab],button[data-v2-native],button[data-v2-ministry]'):null;
    if(!target)return;
    if(target.hasAttribute('data-v2-picker')){state.pickerOpen=!state.pickerOpen;state.countryQuery='';render();return;}
    if(target.hasAttribute('data-v2-country')) {
      var id=normalizedIdentity(target.getAttribute('data-v2-country'));
      if(id){state.country=countryKey(id);state.pickerOpen=false;state.countryQuery='';currentCountryContextChanged();render();}
      return;
    }
    if(target.hasAttribute('data-v2-gov-tab')){state.govTab=target.getAttribute('data-v2-gov-tab')==='all'?'all':'executive';render();return;}
    if(target.hasAttribute('data-v2-route')){routeTo(target.getAttribute('data-v2-route'));return;}
    if(target.hasAttribute('data-v2-native')){openNative(target.getAttribute('data-v2-native'));return;}
    if(target.hasAttribute('data-v2-ministry')){openCabinet(target.getAttribute('data-v2-ministry'),target.getAttribute('data-v2-ministry-name'));return;}
  }
  function onInput(event) {
    var target=event.target;
    if(!target)return;
    if(target.matches('[data-v2-country-search]')){state.countryQuery=target.value||'';renderCountryResults();return;}
    if(target.matches('[data-v2-more-search]')){state.moreQuery=target.value||'';var cursor=target.selectionStart;render();var next=root.querySelector('[data-v2-more-search]');if(next){next.focus();try{next.setSelectionRange(cursor,cursor);}catch(_){}}return;}
    if(target.matches('[data-v2-ministry-search]')) {
      var q=keyNorm(target.value||'');
      root.querySelectorAll('[data-v2-ministry]').forEach(function(node){node.hidden=q&&keyNorm(node.innerText||node.textContent||'').indexOf(q)===-1;});
    }
  }
  function onChange(event) {
    var target=event.target;
    if(target&&target.matches('[data-v2-metric]')) {
      state.metric=target.value||'gdp';
      var rootScroll=d.getElementById('ov2-content'),top=rootScroll?rootScroll.scrollTop:0;
      render();
      var next=d.querySelector('[data-v2-metric]');if(next)next.focus();
      var newScroll=d.getElementById('ov2-content');if(newScroll)newScroll.scrollTop=top;
    }
  }
  function start() {
    var rt=runtime();
    if(rt&&typeof rt.init==='function')Promise.resolve().then(function(){return rt.init();}).then(function(){refreshCountries();}).catch(function(){refreshCountries();});
    else refreshCountries();
    if(g.OmegaUIPhotoAssets&&typeof g.OmegaUIPhotoAssets.ready==='function')Promise.resolve(g.OmegaUIPhotoAssets.ready()).then(function(){state.photosReady=true;render();}).catch(function(){state.photosReady=false;render();});
    if(g.OmegaFinanceAnalyticsRuntime&&typeof g.OmegaFinanceAnalyticsRuntime.init==='function')Promise.resolve(g.OmegaFinanceAnalyticsRuntime.init()).then(function(){state.financeReady=true;render();}).catch(function(){});
    render();
  }
  function refreshCountries() {
    var api=runtime(),rows=[];
    try {rows=api&&typeof api.listProfiles==='function'?api.listProfiles():[];}catch(_){}
    if(!Array.isArray(rows)||!rows.length)return;
    state.countries=rows.map(function(c){return Object.assign({},c);}).filter(function(c){return c.name&&(c.iso3||c.countryCode);}).sort(function(a,b){return text(a.name).localeCompare(text(b.name));});
    if(!state.country) {
      var candidates=[g.OmegaMinistryViewCountry,g.OmegaCabinetUI&&g.OmegaCabinetUI.activeCountry,g.CountryIOS&&g.CountryIOS.activeCountry,g.Game&&g.Game.currentActiveCountry,g.Game&&g.Game.state&&(g.Game.state.playerCountryCode||g.Game.state.playerCountryId),'USA'];
      for(var i=0;i<candidates.length;i++){var chosen=normalizedIdentity(candidates[i]);if(chosen){state.country=countryKey(chosen);break;}}
    }
    if(!state.country&&state.countries.length)state.country=countryKey(state.countries[0]);
    render();
  }
  root.addEventListener('click',onClick);
  root.addEventListener('input',onInput);
  root.addEventListener('change',onChange);
  resume.addEventListener('click',resumeV2);
  d.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&state.pickerOpen){state.pickerOpen=false;render();}
  });
  g.addEventListener('OMEGA_COUNTRY_RUNTIME_READY',refreshCountries);
  g.addEventListener('OMEGA_READY',refreshCountries);
  g.addEventListener('OMEGA_GAME_STARTED',refreshCountries);
  g.addEventListener('OMEGA_UI_V2_COUNTRY_CONTEXT_CHANGED',function(){ if(state.route!=='world')render(); });
  var api=Object.freeze({
    version:VERSION, getState:function(){return {route:state.route,country:state.country,availableCountries:state.countries.length,legacyMode:state.nativeMode,photoAssetsReady:state.photosReady,financeReady:state.financeReady};},
    navigate:routeTo, setCountry:function(value){var id=normalizedIdentity(value);if(!id)return false;state.country=countryKey(id);currentCountryContextChanged();render();return true;},
    refresh:render, openLegacy:openNative, enterLegacy:function(){suspendForNative();}, returnToV2:resumeV2
  });
  g.OMEGAUIV2=api;
  start();
})(window, document);
