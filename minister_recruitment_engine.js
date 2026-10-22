/* OMEGA MINISTER RECRUITMENT ENGINE v2.3.0
 * Canonical recruitment/fire lifecycle, ministry-aware candidate mapping,
 * selected-country binding, visible errors and dashboard synchronization.
 */
(function (global) {
  'use strict';

  const VERSION = '2.3.0';
  const MAX_CANDIDATES = 5;
  const text = value => String(value == null ? '' : value).trim();
  const esc = value => text(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const registry = () => global.OmegaMinisterStateRegistry || null;

  // The UI exposes 18 ministries while ministers.json has 15 profile groups.
  // These are explicit domain mappings, not arbitrary alphabetical fallbacks.
  const MINISTRY_PROFILE_CATEGORIES = Object.freeze({
    cabinet_council: ['Information_Media', 'Culture_Religion'],
    trade: ['Economy_Commerce'],
    production: ['Energy_Infrastructure'],
    taxes: ['Finance'],
    central_bank: ['Finance'],
    laws: ['Justice'],
    education: ['Public_Welfare'],
    infrastructure: ['Energy_Infrastructure'],
    science_research: ['Science_Technology'],
    defense: ['Defense'],
    foreign_affairs: ['Foreign_Affairs'],
    energy_mining: ['Energy_Infrastructure', 'Environment_Climate'],
    intelligence_cyber: ['Intelligence', 'Science_Technology'],
    agriculture_food: ['Agriculture_Food'],
    interior_security: ['Home_Affairs'],
    health_welfare: ['Public_Welfare'],
    treasury_finance: ['Finance'],
    mega_projects: ['Energy_Infrastructure', 'Environment_Climate']
  });

  function normalizeCandidateKey(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function normalizeCountryCode(value) {
    let raw = value;
    if (raw && typeof raw === 'object') {
      raw = raw.iso3 || raw.iso || raw.isoCode || raw.countryCode || raw.country_code ||
        raw.code || raw.id || raw.name || raw.countryName;
    }
    const label = text(raw);
    if (!label) return '';
    if (/^[a-z]{3}$/i.test(label)) return label.toUpperCase();

    const resolver = global.OmegaCanonicalIdentityRegistry || global.OmegaCountrySemanticBridge;
    try {
      const resolved = resolver && typeof resolver.resolveCountry === 'function'
        ? resolver.resolveCountry(label) : null;
      const id = resolved && (resolved.id || resolved.code || resolved.iso3 || resolved.iso);
      if (id) return text(id).toUpperCase();
    } catch (_) {}
    return label.toUpperCase();
  }

  function countryCode() {
    const ui = global.OmegaCabinetUI || {};
    const game = global.Game || {};
    const sources = [
      ui.activeCountry,
      global.OmegaMinistryViewCountry,
      game.currentActiveCountry,
      game.countryCode,
      global.currentActiveCountry
    ];
    for (const source of sources) {
      const code = normalizeCountryCode(source);
      if (code) return code;
    }
    return '';
  }


const countryRosterCache={manifest:null,profiles:new Map(),templates:null};
const COUNTRY_NAMES={
Asia:{first:'Aarav Mira Rafiq Nadia Imran Sana Arjun Mei Hana Kenji Aisha Dara Lina Farid Yuna Tenzin Siti Bao Anika Omar Jin Soraya Kiran Mali Yasmin Hiro Noor Kavya Reza'.split(' '),last:'Rahman Iyer Tanaka Chowdhury Sato Malik Wijaya Chen Sharma Khan Das Nguyen Kim Hossain Patel Fernando Yamamoto Kaur Prasetyo Wang Haq Nakamura Lestari Sen Bose Park Hidayat Singh Le Qureshi'.split(' ')},
Africa:{first:'Amara Zola Kwame Nia Kofi Amina Tendai Sade Bako Thandi Idris Lindiwe Jabari Zuri Chidi Malaika Olu Eshe Tariro Kelechi Nuru Ayo Abena Sipho Adisa Mirembe Femi Imani Kato Deka'.split(' '),last:'Okafor Mensah Ndlovu Diallo Abebe Bello Dlamini Kamara Mbeki Adebayo Moussa Boateng Kone Toure Moyo Achebe Sow Molefe Tesfaye Mahlangu Osei Traore Mutombo Kagiso Munyaneza Chukwu Biko Senghor Mabena'.split(' ')},
Europe:{first:'Elena Marek Luka Sofia Nikolai Ines Tomas Anja Milan Freya Daria Anton Marta Emil Leonie Rafael Katarina Jonas Petra Mikhail Eva Stefan Clara Oskar Nina Victor Alina Boris Isabel Mateo'.split(' '),last:'Novak Petrov Kovac Ivanov Horvat Jensen Weber Dubois Silva Rossi Popescu Kowalski Keller Berg Moreau Costa Muller Svensson Kuznetsov Nowak Dvorak Varga Marin Schmidt Lind Vukovic Fischer Kral Santos Laurent'.split(' ')},
'North America':{first:'Jordan Taylor Morgan Avery Casey Riley Cameron Skyler Drew Quinn Parker Rowan Alex Jamie Reese Logan Devon Emerson Ari Sage Noah Maya Elijah Grace Ethan Leah Miles Naomi Owen Zoe'.split(' '),last:'Carter Bennett Reed Hayes Morgan Brooks Sullivan Mitchell Foster Turner Parker Collins Bailey Ward Price Murphy Cooper Rogers Cook Powell Rivera Graham Hughes Kelly Sanders Coleman Ross Bryant Morris Ellis'.split(' ')},
'South America':{first:'Camila Mateo Sofia Thiago Valeria Lucas Mariana Diego Isabela Rafael Lucia Nicolas Gabriela Tomas Elena Andres Daniela Bruno Paula Joaquin Renata Felipe Alma Martin Cecilia Emilio Natalia Gael Bianca Pablo'.split(' '),last:'Silva Alvarez Rojas Ferreira Morales Castro Mendez Vargas Navarro Santos Pereira Ramirez Costa Gomez Herrera Torres Acosta Romero Flores Cabrera Medina Rivera Ortiz Vega Cardenas Paz Quintero Benitez Lagos Arias'.split(' ')},
Oceania:{first:'Tane Moana Aroha Koa Leilani Talia Noa Mika Sione Anahera Manaia Lani Eren Isla Kai Rangi Ayla Tama Niko Mele Pita Alani Luka Kiri Hemi Sela Jone Malia Tui Afa'.split(' '),last:'Tupou Waqa Katoa Faumuina Taito Ngata Fale Ravulo Morrison Kereama Vaai Taufua Manu Whaitiri Talakai Rika Niumata Sopoaga Tuilagi Mikaere Faleafaga Paea Wendt Ropata Tawake Tofa Tukaki Kivalu TeRangi'.split(' ')},
Antarctica:{first:'Alex Robin Sam Taylor Jordan Morgan Avery Casey Riley Cameron Skyler Drew Quinn Parker Rowan Jamie Reese Logan Devon Emerson Ari Sage Noah Maya Elliot Harper Milan Remy River Jules'.split(' '),last:'Reed Hayes Morgan Brooks Sullivan Mitchell Foster Turner Parker Collins Bailey Ward Price Murphy Cooper Rogers Cook Powell Rivera Graham Hughes Kelly Sanders Coleman Ross Bryant Bennett Carter Morris Ellis'.split(' ')}};
const COUNTRY_MIDDLES='Dev Linh Samira Iqbal Nari Pran Amin Talia Rohan Suri Minh Ayan Jaya Faris Kimi Dilan Yori Mina Anwar Veda Hye Rumi Tari Nima Adil Sora Jamil Kanya Eshan Rina'.split(' ');
const LEADERSHIP_STYLES=['Long-horizon planner who compares scenarios and prefers measured execution.','Fast-moving executor who favours clear priorities and short decision cycles.','Consultative coordinator who weighs stakeholder effects before committing.','Process-led operator who emphasizes compliance and predictable delivery.','Balanced administrator who combines execution with periodic review.'];
const DECISION_STYLES=['Compares feasibility, risk and portfolio objectives.','Uses staged implementation and corrective checkpoints.','Checks evidence and documents assumptions before major commitments.','Balances speed with escalation rules for uncertainty.','Uses risk registers, measurable milestones and post-decision review.'];
function normalizeCountryLookupKey(value){return text(value).normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
async function loadRosterJson(url){const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error('ROSTER_JSON_HTTP_'+r.status+':'+url);return r.json();}
function rosterTemplateDB(raw){return raw?.ministers_database||raw?.ministers||raw||{};}
async function loadCountryRoster(countryId){
 if(!countryRosterCache.manifest)countryRosterCache.manifest=loadRosterJson('minister_country_roster_manifest_v1.json').catch(e=>{countryRosterCache.manifest=null;throw e;});
 const manifest=await countryRosterCache.manifest;let code=manifest.lookup?.[normalizeCountryLookupKey(countryId)];
 if(!code)code=manifest.lookup?.[normalizeCountryLookupKey(normalizeCountryCode(countryId))];
 const identity=manifest.countries?.[code];if(!identity)throw new Error('COUNTRY_ROSTER_COUNTRY_NOT_FOUND');
 if(countryRosterCache.profiles.has(code))return {manifest,identity,record:countryRosterCache.profiles.get(code),continentData:null};
 if(!countryRosterCache.templates){let raw=global.OmegaMinistersDB;if(!raw||!Object.values(rosterTemplateDB(raw)).some(Array.isArray)){raw=await loadRosterJson('ministers.json');global.OmegaMinistersDB=rosterTemplateDB(raw);}countryRosterCache.templates=rosterTemplateDB(raw);}
 const db=countryRosterCache.templates,record={countryCode:code,countryName:identity.countryName,continent:identity.continent,subregion:identity.subregion,identityStatus:identity.identityStatus,provenance:{kind:'SIMULATION_GENERATED',realPersonClaim:false},ministries:{}},ordinal=Number(identity.ordinal)||0;
 for(let mi=0;mi<manifest.ministryDefinitions.length;mi++){
  const def=manifest.ministryDefinitions[mi],categories=MINISTRY_PROFILE_CATEGORIES[normalizeCandidateKey(def.id)]||[def.templateCategory],pool=categories.flatMap(k=>Array.isArray(db[k])?db[k]:[]),fallback=db[def.templateCategory]||[],templates=pool.length?pool:fallback;
  if(!templates.length)throw new Error('COUNTRY_ROSTER_TEMPLATE_MISSING:'+def.templateCategory);
  const region=COUNTRY_NAMES[identity.continent]||COUNTRY_NAMES.Antarctica;
  record.ministries[def.id]=Array.from({length:5},(_,slot)=>{
   const seq=ordinal*90+mi*5+slot,name=region.first[seq%region.first.length]+' '+COUNTRY_MIDDLES[Math.floor(seq/region.first.length)%COUNTRY_MIDDLES.length]+' '+region.last[Math.floor(seq/(region.first.length*COUNTRY_MIDDLES.length))%region.last.length];
   const t=templates[(ordinal+mi+slot)%templates.length]||{},delta=(i,seed)=>((seed+i*7)%15)-7,clamp100=v=>Math.max(0,Math.min(100,Math.round(Number(v)||0))),stats={},efficiency={};
   Object.entries(t.stats||{}).forEach(([k,v],i)=>stats[k]=clamp100(Number(v)+delta(i,ordinal*3+mi*5+slot*11)));
   for(const k of ['discipline','aggression','empathy','corruption','strategic'])if(!(k in stats))stats[k]=clamp100(50+delta(Object.keys(stats).length,ordinal+mi*3+slot*5));
   Object.entries(t.efficiency||{}).forEach(([k,v],i)=>efficiency[k]=clamp100(Number(v)+delta(i,ordinal*7+mi*3+slot*13)));
   for(const k of ['decision_speed','accuracy','crisis_handling'])if(!(k in efficiency))efficiency[k]=clamp100(50+delta(Object.keys(efficiency).length,ordinal+mi*7+slot*3));
   const age=Math.max(28,Math.min(68,Number(t.age||45)+((ordinal+mi+slot)%9)-4)),background=def.backgrounds[slot],prior=def.priorityAreas,id='MIN-'+code+'-'+def.id.toUpperCase()+'-'+String(slot+1).padStart(3,'0');
   const ranked=Object.entries(stats).map(([k,v])=>({k,v,s:k==='corruption'?100-v:v})).sort((a,b)=>b.s-a.s).slice(0,2),labels={discipline:'discipline',aggression:'initiative and risk tolerance',empathy:'stakeholder awareness',corruption:'integrity',strategic:'strategic planning'},strengths=ranked.map(x=>(labels[x.k]||x.k)+' ('+x.v+'/100 simulated rating)'),watchouts=[];
   if(stats.corruption>=25)watchouts.push('Elevated simulated integrity-risk score; strengthen audit controls.');
   if(stats.aggression>=78)watchouts.push('High simulated risk appetite; review irreversible decisions.');
   if(stats.empathy<40)watchouts.push('Use stakeholder-impact review for welfare-facing decisions.');
   if(efficiency.accuracy<68)watchouts.push('Accuracy score calls for independent validation before high-impact decisions.');
   if(efficiency.crisis_handling<68)watchouts.push('Crisis-response score suggests contingency planning and escalation monitoring.');
   if(!watchouts.length)watchouts.push('No standout risk flag in this simulated profile; monitor workload and decision quality.');
   const style=stats.strategic>=82&&stats.discipline>=70?LEADERSHIP_STYLES[0]:efficiency.decision_speed>=84?LEADERSHIP_STYLES[1]:stats.empathy>=70?LEADERSHIP_STYLES[2]:stats.discipline>=82?LEADERSHIP_STYLES[3]:LEADERSHIP_STYLES[4];
   const summaries=[name+' is a fictional OMEGA candidate for '+identity.countryName+'\'s '+def.title+' portfolio, emphasizing '+prior[0]+' and '+prior[1]+'.','This simulated '+def.title.toLowerCase()+' profile for '+identity.countryName+' prioritizes '+prior[1]+' while overseeing '+prior[2]+'.',name+'\'s simulated record focuses on '+prior[2]+' and accountable delivery in '+identity.countryName+'.','Designed for OMEGA, this fictional candidate approaches '+def.title.toLowerCase()+' through '+prior[0]+' and evidence-led review.','A fictional candidate dossier for '+identity.countryName+': '+def.title.toLowerCase()+' work centers on '+prior[1]+', tracking and risk control.'];
   return {id,name,baseName:name,displayName:name,age,gender:String(t.gender||((slot%2)?'female':'male')),background,education:'Simulated training track in '+prior[0]+' and public-sector governance.',careerBackground:'Fictional '+background.toLowerCase()+' background for the '+def.title+' portfolio.',specialties:prior.slice(0,2),ministryId:def.id,ministryCategory:def.templateCategory,ministryTitle:def.title,countryCode:code,countryName:identity.countryName,continent:identity.continent,subregion:identity.subregion,stats,efficiency,ideology:{type:String(t.ideology?.type||['technocrat','liberal','secular','nationalist','socialist'][(ordinal+mi+slot)%5])},personalityProfile:{...stats,learningAgility:clamp100(100-Math.abs(70-efficiency.accuracy)+((ordinal+mi*2+slot*3)%13)-6),stressTolerance:clamp100((stats.discipline+efficiency.crisis_handling+stats.empathy)/3)},profileDetails:{summary:summaries[slot],professionalBackground:background+' is a fictional career archetype focused on '+prior[0]+' and '+prior[1]+'; no real-world employment history is implied.',leadershipStyle:style,decisionMaking:DECISION_STYLES[(ordinal+mi+slot)%5],strengths,watchouts,priorityAreas:prior,provenanceNotice:'Fictional simulation character; not a claim about a real official.'},recordType:'SIMULATED_FICTIONAL',isFictional:true};
  });
 }
 countryRosterCache.profiles.set(code,record);return {manifest,identity,record,continentData:null};
}
async function countryScopedCandidates(ministryId,countryId){try{const roster=await loadCountryRoster(countryId),items=roster.record.ministries?.[normalizeCandidateKey(ministryId)];if(!Array.isArray(items)||items.length!==MAX_CANDIDATES)return {known:true,candidates:[],identity:roster.identity};return {known:true,identity:roster.identity,candidates:items.map(p=>({...p,displayName:p.displayName||p.baseName||p.name||p.id,ministryCategory:p.ministryCategory||MINISTRY_PROFILE_CATEGORIES[normalizeCandidateKey(ministryId)]?.[0]||ministryId,rosterSource:'COUNTRY_MINISTRY_ROSTER_V1'}))};}catch(error){return {known:error?.message!=='COUNTRY_ROSTER_COUNTRY_NOT_FOUND'&&String(error?.message||'').startsWith('COUNTRY_ROSTER_'),candidates:[],error};}}

  function categoryPool(all, ministryId) {
    const target = normalizeCandidateKey(ministryId);
    const exact = all.filter(candidate => normalizeCandidateKey(candidate.__category) === target);
    if (exact.length >= MAX_CANDIDATES) return exact;

    const preferred = MINISTRY_PROFILE_CATEGORIES[target] || [];
    for (const category of preferred) {
      const matching = all.filter(candidate =>
        normalizeCandidateKey(candidate.__category) === normalizeCandidateKey(category));
      if (matching.length >= MAX_CANDIDATES) return matching;
    }
    if (exact.length) return exact;

    const targetTokens = new Set(target.split('_').filter(Boolean));
    const score = candidate => {
      const values = [candidate.__category, candidate.background, candidate.id]
        .map(normalizeCandidateKey).join(' ');
      let result = 0;
      for (const token of targetTokens) if (values.includes(token)) result += 1;
      return result;
    };
    return all.slice().sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)));
  }

  async function offlineRoster(ministryId, countryId) {
    const scoped=await countryScopedCandidates(ministryId,countryId);
    if(scoped.known&&scoped.candidates.length===MAX_CANDIDATES)return scoped.candidates;
    if(scoped.known)throw new Error('COUNTRY_MINISTRY_ROSTER_INVALID');
    let source = global.OmegaMinistersDB;
    if (!source || !Object.values(source).some(Array.isArray)) {
      try {
        const response = await fetch('ministers.json', { cache: 'no-store' });
        if (response.ok) {
          const raw = await response.json();
          source = raw.ministers_database || raw.ministers || raw;
          global.OmegaMinistersDB = source;
        }
      } catch (_) {}
    }

    const database = source && (source.ministers_database || source.ministers) || source || {};
    const all = [];
    for (const [category, list] of Object.entries(database)) {
      if (!Array.isArray(list)) continue;
      for (const profile of list) {
        const id = text(profile && (profile.id || profile.ministerId));
        if (id) all.push(Object.assign({}, profile, { id, __category: category }));
      }
    }

    return categoryPool(all, ministryId).slice(0, MAX_CANDIDATES).map(profile =>
      Object.assign({}, profile, {
        displayName: displayName(profile),
        ministryCategory: profile.__category,
        rosterSource: 'MINISTERS_JSON_OFFLINE'
      }));
  }

  async function fetchRoster(ministryId, countryId) {
    let apiError = 'API unavailable';
    const cc = normalizeCountryCode(countryId || countryCode());
    try {
      const response = await fetch(
        'api/minister-candidates?ministryId=' + encodeURIComponent(ministryId) +
        '&countryCode=' + encodeURIComponent(cc),
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) apiError = 'HTTP ' + response.status;
      else {
        const data = await response.json();
        if (data.ok && Array.isArray(data.candidates) && data.candidates.length === MAX_CANDIDATES) {
          return data.candidates;
        }
        apiError = data.error || ('Expected five verified candidates; received ' +
          ((data.candidates && data.candidates.length) || 0));
      }
    } catch (error) {
      apiError = text(error && error.message || error || apiError);
    }

    const roster = await offlineRoster(ministryId, cc);
    if (roster.length === MAX_CANDIDATES) return roster;
    throw new Error('Minister roster unavailable (' + apiError + '). Only ' + roster.length +
      ' unique candidates were found in ministers.json; five are required.');
  }

  function activeMinister(ministryId, countryId) {
    try {
      const cc = normalizeCountryCode(countryId || countryCode());
      return registry() && cc && ministryId
        ? registry().getActiveMinister(cc, String(ministryId)) || null : null;
    } catch (_) {
      return null;
    }
  }

  function activeId(ministryId, countryId) {
    const active = activeMinister(ministryId, countryId);
    return active && active.ministerId || null;
  }

  function ministerState(ministerId) {
    try { return registry() && registry().getMinister(String(ministerId)) || null; }
    catch (_) { return null; }
  }

  function assignedElsewhere(ministerId, ministryId, countryId) {
    const state = ministerState(ministerId);
    const runtime = state && (state.runtimeState || state.runtime) || {};
    if (String(runtime.status || '').toUpperCase() !== 'ACTIVE') return false;
    return normalizeCountryCode(runtime.countryId) !== normalizeCountryCode(countryId) ||
      String(runtime.ministryId || '').toLowerCase() !== String(ministryId || '').toLowerCase();
  }

  function operationFor(ministryId) {
    const rules = registry() && registry().getConfig && registry().getConfig().roles || [];
    const value = String(ministryId || '').toLowerCase();
    const matched = rules.find(role => (role.match || []).some(token =>
      value.includes(String(token).toLowerCase())));
    return (matched || rules.find(role => !(role.match || []).length) || {}).operations?.[0] || 'EXECUTION';
  }

  function capability(candidate, ministryId) {
    const engine = global.OmegaMinisterCapability;
    if (!engine || typeof engine.evaluate !== 'function') return null;
    try {
      return engine.evaluate(candidate, operationFor(ministryId), {
        workload: 0, stress: 0, experience: 0, informationQuality: 1
      });
    } catch (_) {
      return null;
    }
  }

  function profileEffects(candidate, ministryId) {
    const behavior = global.OmegaMinisterBehavior;
    if (!behavior || typeof behavior.analyzeProfile !== 'function') return null;
    try {
      return behavior.analyzeProfile(candidate, operationFor(ministryId), {
        ministryId, domain: ministryId
      });
    } catch (_) {
      return null;
    }
  }

  function displayName(candidate) {
    return candidate && (candidate.displayName || candidate.name ||
      candidate.regional_names && (candidate.regional_names.south_asia ||
        candidate.regional_names.western) || candidate.id) || 'Unknown candidate';
  }

  function primaryActionLabel(ministryId, countryId) {
    return activeMinister(ministryId, countryId) ? 'Fire Minister' : 'Recruit Minister';
  }

  function syncDashboard(ministryId, countryId) {
    const ui = global.OmegaCabinetUI;
    if (!ui) return;
    const cc = normalizeCountryCode(countryId || countryCode());
    const active = activeMinister(ministryId, cc);
    const ministry = ui.ministriesDatabase && ui.ministriesDatabase[ministryId];

    if (ministry) {
      if (active) {
        const profile = active.staticProfile || {};
        ministry.ministerId = active.ministerId;
        ministry.activeMinisterId = active.ministerId;
        ministry.ministerName = profile.baseName || profile.name || active.ministerId;
        ministry.ministerProfile = profile;
        ministry.ministerRuntime = active.runtimeState;
        ministry.ministerLearning = active.learningState;
        ministry.effectiveCapability = active.effectiveCapability;
      } else {
        ministry.ministerName = null;
        ministry.ministerId = null;
        ministry.activeMinisterId = null;
        ministry.ministerProfile = null;
        ministry.ministerRuntime = null;
        ministry.ministerLearning = null;
        ministry.effectiveCapability = null;
      }
    }

    // Redraw the open ministry first so its header and Recruit/Fire control are fresh.
    if (String(ui.currentDashboardMinistryId || '') === String(ministryId) &&
        typeof ui.renderMinistryDashboard === 'function') {
      ui.renderMinistryDashboard(ministryId);
      return;
    }
    if (normalizeCountryCode(ui.activeCountry) === cc && typeof ui.renderCabinet === 'function') {
      ui.renderCabinet(ui.activeCountry);
    }
    refresh(ministryId);
  }

  async function recruit(ministryId, candidate, countryId) {
    const cc = normalizeCountryCode(countryId || countryCode());
    const name = displayName(candidate);
    const profile = Object.assign({}, candidate, { name, id: text(candidate && (candidate.id || candidate.ministerId)) });
    if (!cc) throw new Error('COUNTRY_REQUIRED');
    if (!ministryId) throw new Error('MINISTRY_REQUIRED');
    if (!profile.id) throw new Error('CANDIDATE_ID_REQUIRED');
    if (!registry() || typeof registry().recruitCandidate !== 'function') {
      throw new Error('MINISTER_STATE_REGISTRY_UNAVAILABLE');
    }
    if (assignedElsewhere(profile.id, ministryId, cc)) {
      throw new Error('MINISTER_ALREADY_ASSIGNED');
    }

    const state = registry().recruitCandidate(profile, cc, String(ministryId), global.Game && global.Game.gameTime != null ? global.Game.gameTime : 0);
    syncDashboard(String(ministryId), cc);
    notify('MINISTER RECRUITED', name + ' is now the active minister.', 'success');
    return state;
  }

  async function fire(ministryId, candidate, countryId) {
    const cc = normalizeCountryCode(countryId || countryCode());
    const ministerId = text(candidate && (candidate.id || candidate.ministerId ||
      candidate.staticProfile && candidate.staticProfile.ministerId));
    if (!cc) throw new Error('COUNTRY_REQUIRED');
    if (!ministerId) throw new Error('CANDIDATE_ID_REQUIRED');
    const current = activeMinister(ministryId, cc);
    if (!current || String(current.ministerId) !== ministerId) throw new Error('MINISTER_NOT_ACTIVE');
    if (!registry() || typeof registry().removeMinister !== 'function') {
      throw new Error('MINISTER_STATE_REGISTRY_UNAVAILABLE');
    }

    const name = displayName(candidate && (candidate.staticProfile || candidate) || current.staticProfile || {});
    const result = registry().removeMinister(ministerId, 'FIRED',
      global.Game && global.Game.gameTime != null ? global.Game.gameTime : 0);
    syncDashboard(String(ministryId), cc);
    notify('MINISTER FIRED', name + ' has left office. The ministry is now vacant.', 'success');
    return result;
  }

  function humanError(error) {
    const code = text(error && error.message || error || 'UNKNOWN_ERROR');
    const friendly = {
      COUNTRY_REQUIRED: 'Select a country before recruiting a minister.',
      MINISTRY_REQUIRED: 'Open a ministry before recruiting a minister.',
      CANDIDATE_ID_REQUIRED: 'The selected candidate has no valid minister ID.',
      MINISTER_STATE_REGISTRY_UNAVAILABLE: 'The minister state system is not ready. Reload the game and retry.',
      MINISTER_ALREADY_ASSIGNED: 'This candidate already holds another active ministry. Choose an available candidate.',
      MINISTRY_ALREADY_ASSIGNED: 'This ministry is already occupied. Refresh the ministry and try again.',
      MINISTER_ALREADY_ACTIVE: 'This minister is already active in another assignment.',
      MINISTER_NOT_ACTIVE: 'There is no active minister in this ministry to fire.'
    };
    return friendly[code] || code;
  }

  function showInlineError(parent, error) {
    if (!parent) {
      notify('MINISTER ACTION FAILED', humanError(error), 'error');
      return;
    }
    let node = parent.querySelector && parent.querySelector('.omr-error');
    if (!node) {
      node = document.createElement('div');
      node.className = 'omr-error';
      node.setAttribute('role', 'alert');
      parent.appendChild(node);
    }
    node.textContent = humanError(error);
  }

  function ensureStyles() {
    if (!global.document || !document.head || document.getElementById('omega-minister-recruitment-lifecycle-style')) return;
    const style = document.createElement('style');
    style.id = 'omega-minister-recruitment-lifecycle-style';
    style.textContent =
      '.omr-launch{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;position:relative;z-index:12}' +
      '.omr-launch button{min-height:40px;padding:9px 14px;border:1px solid #1683a0;border-radius:8px;background:#102b3b;color:#e3f8ff;font-weight:800;cursor:pointer}' +
      '.omr-launch .omega-open-recruitment{border-color:#20c997;background:linear-gradient(135deg,#123e3a,#102b3b)}' +
      '.omr-launch .omega-manage-recruitment{background:#182536;color:#d7e2ec}' +
      '.omr-launch button:disabled,.omr-actions button:disabled{opacity:.55;cursor:not-allowed}' +
      '.omr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;align-items:stretch}' +
      '.omr-card{display:flex;flex-direction:column;gap:6px;min-width:0;width:100%;padding:12px;border:1px solid #355063;border-radius:10px;background:#10202d;color:#e3f8ff;text-align:left;cursor:pointer;font:inherit}' +
      '.omr-card:focus-visible,.omr-card-quick-recruit:focus-visible{outline:2px solid #20c997;outline-offset:2px}' +
      '.omr-card-quick-recruit{margin-top:8px;min-height:34px;padding:7px 10px;border:1px solid #20c997;border-radius:7px;background:#123e3a;color:#e8fff8;font-size:12px;font-weight:800;cursor:pointer}' +
      '.omr-card-quick-recruit:disabled{opacity:.55;cursor:not-allowed}' +
      '.omr-card-quick-status{margin-top:8px;color:#8cd9b9;font-size:11px;font-weight:800}' +
      '.omr-card.is-busy{opacity:.7;border-color:#8b6b35}' +
      '.omr-error{margin:10px 0;padding:10px 12px;border:1px solid #b45353;border-radius:8px;background:#2b151a;color:#ffd8d8;font-size:12px;line-height:1.5}' +
      '.omr-status.is-busy{color:#f7c97a}' + '.omr-profile-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:14px 0}' + '.omr-profile-section{padding:12px;border:1px solid rgba(100,155,190,.28);border-radius:10px;background:rgba(12,28,42,.58)}' + '.omr-profile-section h4{margin:0 0 8px;font-size:11px;letter-spacing:.08em;color:#9bcfe0}' + '.omr-profile-section p{margin:0;line-height:1.55;color:#d8e3ec;font-size:12px}' + '.omr-profile-section ul{margin:0;padding-left:18px;display:grid;gap:6px;color:#d8e3ec;font-size:12px;line-height:1.45}' + '.omr-provenance{margin:10px 0;color:#9baebc;font-size:11px;font-style:italic}' + '@media(max-width:560px){.omr-profile-sections{grid-template-columns:1fr}.omr-meta{gap:8px}}';
    document.head.appendChild(style);
  }

  function renderCandidateDetail(detail, candidate, ministryId, cc, currentId, busy) {
    const id = text(candidate.id);
    const isActive = id === currentId;
    const cap = capability(candidate, ministryId);
    const effects = profileEffects(candidate, ministryId);
    const effectsMarkup = effects
      ? '<div class="omr-profile-effects" style="margin-top:12px;padding:12px;border:1px solid rgba(100,155,190,.35);border-radius:9px;background:rgba(12,28,42,.55)">' +
        '<h4 style="margin:0 0 8px">PROFILE EFFECTS</h4>' +
        '<p style="margin:4px 0"><b>Work style:</b> ' +
          esc(Array.isArray(effects.workStyle) ? effects.workStyle.map(item => String(item).replace(/_/g, ' ')).join(', ') : 'Not recorded') + '</p>' +
        '<p style="margin:4px 0"><b>Age stage:</b> ' + esc(effects.age && effects.age.band || 'Not recorded') +
          ' · operation modifier ×' + esc(Number.isFinite(Number(effects.age && effects.age.capabilityMultiplier)) ? Number(effects.age.capabilityMultiplier).toFixed(2) : 'N/A') + '</p>' +
        '<p style="margin:4px 0"><b>Stress resilience:</b> ' + esc(effects.stressResilience && effects.stressResilience.handlingLabel || 'Not recorded') +
          ' (' + esc(effects.stressResilience && effects.stressResilience.score != null ? effects.stressResilience.score : 'N/A') + '/100)</p>' +
        '<p style="margin:4px 0"><b>Training rate:</b> ×' +
          esc(Number.isFinite(Number(effects.training && effects.training.ageMultiplier)) ? Number(effects.training.ageMultiplier).toFixed(2) : 'N/A') + ' age · ×' +
          esc(Number.isFinite(Number(effects.training && effects.training.learningAgilityMultiplier)) ? Number(effects.training.learningAgilityMultiplier).toFixed(2) : 'N/A') + ' learning agility</p>' +
        '<p style="margin:4px 0"><b>Career fit:</b> ' +
          (effects.careerFit && effects.careerFit.matched
            ? 'match +' + esc(Math.round(Number(effects.careerFit.bonus || 0) * 100)) + '% (' +
              esc(Array.isArray(effects.careerFit.matchedKeywords) ? effects.careerFit.matchedKeywords.join(', ') : '') + ')'
            : 'no recorded specialty match; neutral modifier') + '</p></div>'
      : '';
    const stats = Object.entries(Object.assign({}, candidate.stats || {}, candidate.efficiency || {}))
      .filter(entry => typeof entry[1] === 'number')
      .map(entry => {
        const key = entry[0], value = entry[1];
        return '<div class="omr-skill"><span>' + esc(key.replace(/_/g, ' ').toUpperCase()) +
          '</span><b>' + value + '</b><i><em style="width:' + Math.max(0, Math.min(100, value)) +
          '%"></em></i></div>';
      }).join('');
    const name = displayName(candidate);
    const profile = candidate.profileDetails || {};
    const section = (title,value) => Array.isArray(value) ? (value.length ? '<section class="omr-profile-section"><h4>'+esc(title)+'</h4><ul>'+value.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul></section>' : '') : (text(value) ? '<section class="omr-profile-section"><h4>'+esc(title)+'</h4><p>'+esc(value)+'</p></section>' : '');
    const profileMarkup = [['PROFILE SUMMARY',profile.summary],['PROFESSIONAL BACKGROUND',profile.professionalBackground],['LEADERSHIP STYLE',profile.leadershipStyle],['DECISION APPROACH',profile.decisionMaking],['KEY STRENGTHS',profile.strengths],['AREAS TO MONITOR',profile.watchouts],['MINISTRY PRIORITIES',profile.priorityAreas]].map(([t,v])=>section(t,v)).join('');
    const countryMeta = candidate.countryName ? '<span>COUNTRY <b>'+esc(candidate.countryName)+'</b></span><span>CONTINENT <b>'+esc(candidate.continent||'Not recorded')+'</b></span><span>SUBREGION <b>'+esc(candidate.subregion||'Not recorded')+'</b></span><span>PORTFOLIO <b>'+esc(candidate.ministryTitle||candidate.ministryId||ministryId)+'</b></span>' : '';
    const provenance = profile.provenanceNotice ? '<p class="omr-provenance">'+esc(profile.provenanceNotice)+'</p>' : '';
    const action = busy
      ? '<button class="omr-recruit" data-action="recruit" type="button" disabled>ALREADY ASSIGNED</button>'
      : isActive
        ? '<button class="omr-fire" data-action="fire" type="button">FIRE MINISTER</button>'
        : '<button class="omr-recruit" data-action="recruit" type="button">RECRUIT MINISTER</button>';

    detail.innerHTML =
      '<div class="omr-dossier"><div class="omr-dossier-top"><div>' +
      '<span class="omr-role">MINISTER PROFILE</span><h3>' + esc(name) + '</h3><p>' +
      esc(candidate.background || 'No professional background supplied.') + '</p></div>' +
      '<span class="omr-active-tag">' + (isActive ? 'CURRENTLY ACTIVE' : busy ? 'ASSIGNED ELSEWHERE' : 'AVAILABLE CANDIDATE') +
      '</span></div><div class="omr-meta"><span>ID <b>' + esc(id) + '</b></span><span>AGE <b>' +
      esc(candidate.age) + '</b></span><span>GENDER <b>' + esc(candidate.gender) +
      '</b></span><span>IDEOLOGY <b>' + esc(candidate.ideology && candidate.ideology.type || 'Unspecified') +
      '</b></span><span>PROFILE GROUP <b>' + esc(candidate.ministryCategory || candidate.__category || 'Not recorded') +
      '</b></span>' + countryMeta + '</div><div class="omr-profile-sections">' + profileMarkup + '</div>' + provenance + '<div class="omr-sections"><div><h4>CORE SKILLS</h4>' +
      (stats || '<p>Detailed skill ratings are not recorded for this profile.</p>') +
      '</div><div><h4>EFFECTIVE CAPABILITY</h4><p>Capability is evaluated from this profile and the selected ministry runtime rules.</p>' +
      (cap ? '<div class="omr-capability"><strong>' + esc(cap.operation) + '</strong><span>Base ' +
        esc(cap.baseCapability) + ' • Effective ' + esc(cap.effectiveCapability) + '</span></div>' : '') +
      effectsMarkup + '</div></div><div class="omr-actions">' + action + '</div></div>';

    const actionButton = detail.querySelector('[data-action]');
    if (actionButton && !busy) {
      actionButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (actionButton.disabled) return;
        actionButton.disabled = true;
        try {
          if (isActive) await fire(ministryId, candidate, cc);
          else await recruit(ministryId, candidate, cc);
        } catch (error) {
          actionButton.disabled = false;
          showInlineError(detail, error);
        }
      });
    }
  }

  async function render(ministryId, container, countryId) {
    const cc = normalizeCountryCode(countryId || countryCode());
    const roster = await fetchRoster(ministryId, cc);
    const currentId = activeId(ministryId, cc);
    container.innerHTML =
      '<section class="omega-minister-recruitment"><div class="omr-header"><div><h2>MINISTER RECRUITMENT</h2>' +
      '<p>Select an available candidate. Profile skills and identity come from ministers.json.</p></div>' +
      '<span class="omr-badge">' + roster.length + ' CANDIDATES</span></div><div class="omr-grid">' +
      roster.map((candidate, index) => {
        const id = text(candidate.id || candidate.ministerId);
        const current = id === currentId;
        const busy = !current && assignedElsewhere(id, ministryId, cc);
        const status = current ? 'ACTIVE' : busy ? 'ASSIGNED ELSEWHERE' : 'AVAILABLE';
        const quickAction = current
          ? '<span class="omr-card-quick-status">ACTIVE MINISTER</span>'
          : busy
            ? '<button class="omr-card-quick-recruit" data-action="quick-recruit" type="button" disabled>ASSIGNED ELSEWHERE</button>'
            : '<button class="omr-card-quick-recruit" data-action="quick-recruit" type="button">RECRUIT MINISTER</button>';
        return '<div class="omr-card ' + (current ? 'is-active' : busy ? 'is-busy' : '') +
          '" data-id="' + esc(id) + '" role="button" tabindex="0" aria-label="View profile for ' + esc(displayName(candidate)) + '">' +
          '<span class="omr-index">' + String(index + 1).padStart(2, '0') + '</span><strong>' + esc(displayName(candidate)) +
          '</strong><span class="omr-id">ID: ' + esc(id) + '</span><span>' +
          esc(candidate.background || '') + '</span><span>Age ' + esc(candidate.age) +
          '</span><span class="omr-status ' + (busy ? 'is-busy' : '') + '">' + status + '</span>' +
          quickAction + '</div>';
      }).join('') + '</div><div class="omr-detail"><div class="omr-empty">Select a candidate to inspect the complete profile.</div></div></section>';

    const detail = container.querySelector('.omr-detail');
    container.querySelectorAll('.omr-card').forEach(card => {
      const candidate = roster.find(item => text(item.id || item.ministerId) === card.dataset.id);
      if (!candidate) return;

      const showDetails = () => {
        const current = activeId(ministryId, cc);
        const isCurrent = text(candidate.id || candidate.ministerId) === current;
        const busy = !isCurrent && assignedElsewhere(candidate.id || candidate.ministerId, ministryId, cc);
        renderCandidateDetail(detail, candidate, ministryId, cc, current, busy);
      };

      card.addEventListener('click', event => {
        const target = event && event.target;
        if (target && typeof target.closest === 'function' && target.closest('[data-action="quick-recruit"]')) return;
        showDetails();
      });
      card.addEventListener('keydown', event => {
        if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
        const target = event.target;
        if (target && typeof target.closest === 'function' && target.closest('[data-action="quick-recruit"]')) return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        showDetails();
      });

      const quickRecruit = card.querySelector('[data-action="quick-recruit"]');
      if (quickRecruit && !quickRecruit.disabled) {
        quickRecruit.addEventListener('click', async event => {
          event.preventDefault();
          event.stopPropagation();
          if (quickRecruit.disabled) return;
          quickRecruit.disabled = true;
          try {
            await recruit(ministryId, candidate, cc);
          } catch (error) {
            quickRecruit.disabled = false;
            showInlineError(container, error);
          }
        });
      }
    });
  }

  function openRecruitment(ministryId) {
    const content = document.getElementById('ministry-dashboard-content');
    const targetMinistry = ministryId || global.OmegaCabinetUI && global.OmegaCabinetUI.currentDashboardMinistryId;
    if (!content || !targetMinistry) return;
    let host = content.querySelector('.omega-recruitment-host');
    if (host) host.remove();
    host = document.createElement('div');
    host.className = 'omega-recruitment-host';
    content.appendChild(host);
    render(targetMinistry, host, countryCode()).catch(error => showInlineError(host, error));
  }

  function launchPrimary(ministryId, ui) {
    const cc = countryCode();
    const active = activeMinister(ministryId, cc);
    if (!active) {
      openRecruitment(ministryId);
      return;
    }
    const profile = active.staticProfile || {};
    const name = profile.baseName || profile.name || active.ministerId;
    if (typeof global.confirm === 'function' &&
        !global.confirm('Fire ' + name + ' from this ministry? This action will make the ministry vacant.')) return;
    fire(ministryId, { id: active.ministerId, name }, cc).catch(error => {
      notify('MINISTER ACTION FAILED', humanError(error), 'error');
      injectButton(ui, ministryId);
    });
  }

  function injectButton(ui, ministryId) {
    const content = document.getElementById('ministry-dashboard-content');
    if (!content || !ministryId) return;
    ensureStyles();

    let wrapper = content.querySelector('[data-omega-recruitment="button"]');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.dataset.omegaRecruitment = 'button';
      wrapper.className = 'omr-launch';
      wrapper.innerHTML =
        '<button type="button" class="omega-open-recruitment" data-action="primary"></button>' +
        '<button type="button" class="omega-manage-recruitment" data-action="manage">VIEW MINISTER PROFILES</button>';
      content.prepend(wrapper);
    } else if (!wrapper.querySelector('[data-action="manage"]')) {
      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'omega-manage-recruitment';
      manage.dataset.action = 'manage';
      manage.textContent = 'VIEW MINISTER PROFILES';
      wrapper.appendChild(manage);
    }

    wrapper.dataset.ministryId = String(ministryId);
    const primary = wrapper.querySelector('[data-action="primary"]');
    const manage = wrapper.querySelector('[data-action="manage"]');
    if (primary) {
      primary.textContent = primaryActionLabel(ministryId, countryCode());
      primary.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        launchPrimary(wrapper.dataset.ministryId || ministryId, ui);
      };
    }
    if (manage) {
      manage.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        openRecruitment(wrapper.dataset.ministryId || ministryId);
      };
    }
  }

  function patchDashboard() {
    const ui = global.OmegaCabinetUI;
    if (!ui || typeof ui.renderMinistryDashboard !== 'function') return false;
    if (ui.__ministerRecruitmentPatchedV2) return true;
    ui.__ministerRecruitmentPatchedV2 = true;
    const original = ui.renderMinistryDashboard;
    ui.renderMinistryDashboard = function (ministryId) {
      const result = original.call(this, ministryId);
      Promise.resolve(result).then(() => injectButton(this, ministryId));
      return result;
    };
    return true;
  }

  function refresh(ministryId) {
    const host = document.querySelector('#ministry-dashboard-content .omega-recruitment-host');
    if (host) render(ministryId, host, countryCode()).catch(error => showInlineError(host, error));
  }

  function notify(title, message, kind) {
    const type = kind || 'success';
    if (typeof global.showOmegaNotification === 'function') {
      global.showOmegaNotification(title, message, type);
    } else if (type === 'error') {
      console.error('[' + title + '] ' + message);
    } else {
      console.log('[' + title + '] ' + message);
    }
  }

  const api = {
    VERSION,
    fetchRoster,
    activeId,
    render,
    openRecruitment,
    recruit,
    fire,
    refresh,
    notify,
    patchDashboard,
    operationFor,
    primaryActionLabel,
    ministryProfileCategories: MINISTRY_PROFILE_CATEGORIES,
    loadCountryRoster,
    countryScopedCandidates
  };
  global.OmegaMinisterRecruitment = api;

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (patchDashboard() || tries > 200) clearInterval(timer);
  }, 100);
  patchDashboard();
})(typeof window !== 'undefined' ? window : globalThis);
