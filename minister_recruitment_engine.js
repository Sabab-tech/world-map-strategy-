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
      '.omr-status.is-busy{color:#f7c97a}';
    document.head.appendChild(style);
  }

  function renderCandidateDetail(detail, candidate, ministryId, cc, currentId, blockedReason) {
    const id = text(candidate.id);
    const isActive = id === currentId;
    const blocked = text(blockedReason);
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
    const action = blocked
      ? '<button class="omr-recruit" data-action="recruit" type="button" disabled>' + esc(blocked) + '</button>'
      : isActive
        ? '<button class="omr-fire" data-action="fire" type="button">FIRE MINISTER</button>'
        : '<button class="omr-recruit" data-action="recruit" type="button">RECRUIT MINISTER</button>';

    detail.innerHTML =
      '<div class="omr-dossier"><div class="omr-dossier-top"><div>' +
      '<span class="omr-role">MINISTER PROFILE</span><h3>' + esc(name) + '</h3><p>' +
      esc(candidate.background || 'No professional background supplied.') + '</p></div>' +
      '<span class="omr-active-tag">' + (isActive ? 'CURRENTLY ACTIVE' : blocked ? esc(blocked) : 'AVAILABLE CANDIDATE') +
      '</span></div><div class="omr-meta"><span>ID <b>' + esc(id) + '</b></span><span>AGE <b>' +
      esc(candidate.age) + '</b></span><span>GENDER <b>' + esc(candidate.gender) +
      '</b></span><span>IDEOLOGY <b>' + esc(candidate.ideology && candidate.ideology.type || 'Unspecified') +
      '</b></span><span>PROFILE GROUP <b>' + esc(candidate.ministryCategory || candidate.__category || 'Not recorded') +
      '</b></span></div><div class="omr-sections"><div><h4>CORE SKILLS</h4>' +
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
        const assignedElsewhereReason = !current && assignedElsewhere(id, ministryId, cc);
        const ministryOccupied = !current && Boolean(currentId);
        const blockedReason = assignedElsewhereReason ? 'ASSIGNED ELSEWHERE' : ministryOccupied ? 'MINISTRY OCCUPIED' : '';
        const status = current ? 'ACTIVE' : blockedReason || 'AVAILABLE';
        const quickAction = current
          ? '<span class="omr-card-quick-status">ACTIVE MINISTER</span>'
          : blockedReason
            ? '<button class="omr-card-quick-recruit" data-action="quick-recruit" type="button" disabled>' + esc(blockedReason) + '</button>'
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
        const assignedElsewhereReason = !isCurrent && assignedElsewhere(candidate.id || candidate.ministerId, ministryId, cc)
          ? 'ASSIGNED ELSEWHERE' : '';
        const occupiedReason = !isCurrent && current ? 'MINISTRY OCCUPIED' : '';
        renderCandidateDetail(detail, candidate, ministryId, cc, current, assignedElsewhereReason || occupiedReason);
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
    ministryProfileCategories: MINISTRY_PROFILE_CATEGORIES
  };
  global.OmegaMinisterRecruitment = api;

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (patchDashboard() || tries > 200) clearInterval(timer);
  }, 100);
  patchDashboard();
})(typeof window !== 'undefined' ? window : globalThis);
