/* OMEGA MILITARY RECRUITMENT & BATTLEFIELD COMMAND v1.0.0
 * Country-scoped force growth, budget-checked procurement and a city/theater battle loop.
 * Country personnel and inventories are explicitly labelled observed or simulated.
 */
(function (g) {
  'use strict';
  if (g.OmegaBattlefieldCommand && g.OmegaBattlefieldCommand.VERSION === '1.0.0') return;
  var VERSION = '1.0.0', initPromise = null, ready = false, data = { countries: [], cities: [], population: {}, catalog: null };
  var uiState = { open: false, tab: 'forces', targetCountry: '', terrainFilter: 'all', theaterId: '', status: '', statusType: '' };
  var ROOT_KEY = 'omegaMilitaryCommand';
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function num(v) { var n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : null; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function clone(v) { if (v === null || typeof v !== 'object') return v; if (Array.isArray(v)) return v.map(clone); var o = {}; Object.keys(v).forEach(function (k) { if (k !== '__proto__' && k !== 'constructor' && typeof v[k] !== 'function') o[k] = clone(v[k]); }); return o; }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'region'; }
  function norm(v) { return String(v || '').trim().toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  function stateRoot() { return g.Game && obj(g.Game.state) ? g.Game.state : obj(g.gameState) ? g.gameState : null; }
  function simTurn() { var s = g.Omega && g.Omega.Simulation, r = stateRoot(); return Math.max(0, Math.floor(num(s && s.clock && s.clock.turn) ?? num(r && r.simulation && r.simulation.turn) ?? num(r && r.turn) ?? 0)); }
  function simTimeMs() { var s = g.Omega && g.Omega.Simulation, r = stateRoot(); return Math.max(0, num(s && s.clock && s.clock.simulationTimeMs) ?? num(r && r.simulation && r.simulation.simulationTimeMs) ?? num(r && r.simulationTimeMs) ?? simTurn() * 3600000); }
  function identityId(v) {
    try {
      var registry = g.OmegaCanonicalIdentityRegistry || g.OmegaCountrySemanticBridge || (g.Omega && g.Omega.CanonicalIdentity);
      var hit = registry && typeof registry.resolveCountry === 'function' ? registry.resolveCountry(String(v || '')) : null;
      if (hit && hit.id) return norm(hit.id);
    } catch (_) {}
    return norm(v);
  }
  function countryAliases(row) {
    return [row && row.name, row && row.code, row && row.iso2, row && row.iso3, row && row.countryCode, row && row.numericCode].filter(Boolean).map(function (v) { return norm(v); });
  }
  function resolveCountryRow(value) {
    var rows = data.countries || [], raw = String(value || '').trim(), key = norm(raw), canonical = identityId(raw);
    var exact = rows.find(function (row) { return countryAliases(row).indexOf(key) >= 0; });
    if (exact) return exact;
    return rows.find(function (row) {
      return countryAliases(row).some(function (alias) { return alias === canonical || identityId(alias) === canonical; }) ||
        identityId(row.name) === canonical || identityId(row.iso3) === canonical;
    }) || null;
  }
  function currentPlayerCountry() {
    var s = g.Omega && g.Omega.Simulation, raw =
      (s && typeof s.getPlayerCountryId === 'function' && s.getPlayerCountryId()) ||
      (g.CountryIOS && g.CountryIOS.activeCountry) ||
      g.currentActiveCountry ||
      (g.Game && (g.Game.currentActiveCountry || g.Game.playerCountry || g.Game.countryId)) ||
      g.playerCountry || 'USA';
    return resolveCountryRow(raw) || { name: String(raw), code: norm(raw), iso2: norm(raw), iso3: norm(raw), lat: null, lng: null };
  }
  function countryKey(row) { return norm(row && (row.iso3 || row.code || row.name)); }
  function financeCode(row) {
    var finance = g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry);
    try {
      var profile = finance && finance.resolveCountry && finance.resolveCountry(row && (row.iso3 || row.code || row.name));
      if (profile && profile.countryCode) return profile.countryCode;
    } catch (_) {}
    return row && (row.iso3 || row.code || row.name);
  }
  function fetchJson(path) {
    if (typeof g.fetch !== 'function') return Promise.reject(new Error('FETCH_UNAVAILABLE'));
    return g.fetch(path, { cache: 'no-cache' }).then(function (response) {
      if (!response || !response.ok) throw new Error('DATA_FETCH_FAILED:' + path);
      return response.json();
    });
  }
  function loadData() {
    return Promise.all([
      fetchJson('countries.json').catch(function () { return null; }),
      fetchJson('cities.json').catch(function () { return null; }),
      fetchJson('population.json').catch(function () { return null; }),
      fetchJson('military_command_catalog_v1.json').catch(function () { return null; })
    ]).then(function (rows) {
      data.countries = Array.isArray(rows[0]) ? rows[0] : [];
      data.cities = Array.isArray(rows[1] && rows[1].countries) ? rows[1].countries : [];
      data.population = obj(rows[2]) ? rows[2] : {};
      data.catalog = obj(rows[3]) ? rows[3] : null;
      ready = data.countries.length > 0 && !!data.catalog && Array.isArray(data.catalog.procurement);
      if (g.document) mountLauncher();
      return diagnostics();
    });
  }
  function populationRecord(profile) {
    var aliases = [profile && profile.name, profile && profile.code, profile && profile.iso2, profile && profile.iso3].map(norm);
    for (var i = 0; i < aliases.length; i++) if (obj(data.population[aliases[i]])) return data.population[aliases[i]];
    var finance = g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry);
    try {
      var p = finance && finance.resolveCountry && finance.resolveCountry(profile && (profile.iso3 || profile.name));
      if (p && obj(p.populationValues)) return p.populationValues;
      if (p && obj(p.indicators)) return { population_2015: p.indicators.population2015, urbanization_rate: p.populationValues && p.populationValues.urbanization_rate };
    } catch (_) {}
    return null;
  }
  function countryPopulation(profile) {
    var row = populationRecord(profile), n = num(row && (row.population_2015 ?? row.population ?? row.totalPopulation));
    if (n !== null && n > 0) return { value: n, source: 'POPULATION_BASELINE' };
    var root = stateRoot(), aliases = [countryKey(profile), norm(profile && profile.code), norm(profile && profile.iso2)];
    for (var i = 0; i < aliases.length; i++) {
      var p = root && root.population && root.population[aliases[i]];
      n = num(p && (p.population ?? p.population_2015 ?? p.total ?? p.totalPopulation));
      if (n !== null && n > 0) return { value: n, source: 'GAME_STATE_POPULATION' };
    }
    return { value: null, source: 'POPULATION_UNAVAILABLE' };
  }
  function urbanizationPct(profile) {
    var row = populationRecord(profile), n = num(row && row.urbanization_rate);
    return n === null ? null : clamp(n, 0, 100);
  }
  function findNativeForce(profile) {
    var root = stateRoot(), key = countryKey(profile), aliases = countryAliases(profile), candidates = [];
    if (!root) return null;
    ['military', 'defense', 'armedForces', 'armed_forces'].forEach(function (bucketName) {
      var bucket = root[bucketName];
      if (!obj(bucket)) return;
      Object.keys(bucket).forEach(function (k) {
        if (aliases.indexOf(norm(k)) >= 0 || identityId(k) === identityId(profile.iso3 || profile.name)) candidates.push(bucket[k]);
      });
      if (identityId(profile.iso3 || profile.name) === identityId(currentPlayerCountry().iso3 || currentPlayerCountry().name)) candidates.push(bucket);
    });
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!obj(c)) continue;
      var fs = c.forceStructure || c.force_structure || c.armedForces || c.army || c;
      if (!obj(fs)) continue;
      var personnel = num(fs.personnel ?? fs.activePersonnel ?? fs.manpower ?? fs.totalPersonnel ?? fs.total_personnel);
      if (personnel !== null && personnel >= 0) return { personnel: Math.floor(personnel), readiness: clamp(num(c.readiness ?? fs.readiness ?? fs.readinessPct) ?? 55, 0, 100), source: 'EXISTING_GAME_STATE', equipment: c.equipmentInventory || fs.equipmentInventory || c.equipment || fs.equipment || null };
    }
    return null;
  }
  function defaultsForState(profile) {
    var catalog = data.catalog || {}, baseline = catalog.baselineForce || {}, pop = countryPopulation(profile), native = findNativeForce(profile);
    var personnel;
    if (native) personnel = native.personnel;
    else if (pop.value !== null) personnel = Math.floor(clamp(pop.value * (num(baseline.activePersonnelShareOfPopulation) || 0.00045), num(baseline.minimumPersonnel) || 500, num(baseline.maximumPersonnel) || 1200000));
    else personnel = Math.max(0, Math.floor(num(baseline.minimumPersonnel) || 500));
    var inventory = {}, equipmentSource = native && native.equipment ? 'EXISTING_GAME_STATE' : 'SIMULATED_BASELINE_EQUIPMENT';
    (catalog.procurement || []).forEach(function (item) {
      var read = native && native.equipment ? inventoryQuantity(native.equipment, item.id) : null;
      if (read !== null) inventory[item.id] = Math.max(0, Math.floor(read));
      else {
        var ratio = num(baseline.estimatedEquipmentRatios && baseline.estimatedEquipmentRatios[item.id]) || 0;
        inventory[item.id] = Math.max(0, Math.floor(personnel * ratio));
        if (native && native.equipment) equipmentSource = 'PARTLY_OBSERVED_PARTLY_SIMULATED';
      }
    });
    return {
      countryCode: countryKey(profile), countryName: String(profile && profile.name || countryKey(profile)),
      personnel: personnel, personnelSource: native ? native.source : pop.value !== null ? 'SIMULATED_ESTIMATE_FROM_POPULATION' : 'SIMULATED_MINIMUM_NO_POPULATION_BASELINE',
      readiness: native ? native.readiness : num(catalog.economy && catalog.economy.defaultReadinessPct) || 55,
      equipment: inventory, equipmentSource: equipmentSource,
      budgetPlan: clone(catalog.budgetPlanDefaults || { personnel: 45, equipment: 40, operations: 15 }),
      recruitmentQueue: [], procurementQueue: [], battleLog: [], cityControl: {},
      unpaidPayrollUsd: 0, lastPayrollDay: Math.floor(simTimeMs() / 86400000), revision: 0, updatedTurn: simTurn()
    };
  }
  function inventoryQuantity(raw, id) {
    if (!obj(raw)) return null;
    var v = raw[id];
    if (v === undefined) {
      var wanted = norm(id);
      var key = Object.keys(raw).find(function (k) { return norm(k) === wanted || norm(k).indexOf(wanted) >= 0; });
      if (key) v = raw[key];
    }
    if (obj(v)) v = v.quantity ?? v.count ?? v.amount ?? v.total;
    return num(v);
  }
  function readState(profile) {
    var root = stateRoot(), all = root && root[ROOT_KEY], key = countryKey(profile);
    if (obj(all) && obj(all[key])) {
      var saved = clone(all[key]), defaults = defaultsForState(profile);
      saved.countryCode = key; saved.countryName = profile.name || saved.countryName || key;
      saved.personnel = Math.max(0, Math.floor(num(saved.personnel) ?? defaults.personnel));
      saved.readiness = clamp(num(saved.readiness) ?? defaults.readiness, 0, 100);
      saved.equipment = obj(saved.equipment) ? saved.equipment : defaults.equipment;
      Object.keys(defaults.equipment).forEach(function (id) { if (num(saved.equipment[id]) === null) saved.equipment[id] = defaults.equipment[id]; });
      saved.budgetPlan = normalizeShares(saved.budgetPlan || defaults.budgetPlan);
      saved.recruitmentQueue = Array.isArray(saved.recruitmentQueue) ? saved.recruitmentQueue : [];
      saved.procurementQueue = Array.isArray(saved.procurementQueue) ? saved.procurementQueue : [];
      saved.battleLog = Array.isArray(saved.battleLog) ? saved.battleLog : [];
      saved.cityControl = obj(saved.cityControl) ? saved.cityControl : {};
      return saved;
    }
    return defaultsForState(profile);
  }
  function normalizeShares(raw) {
    var defaults = (data.catalog && data.catalog.budgetPlanDefaults) || { personnel: 45, equipment: 40, operations: 15 }, out = {};
    ['personnel', 'equipment', 'operations'].forEach(function (k) { out[k] = clamp(num(raw && raw[k]) ?? num(defaults[k]) ?? 0, 0, 100); });
    return out;
  }
  function saveState(profile, state) {
    var root = stateRoot();
    if (!root) return { ok: false, code: 'GAME_STATE_UNAVAILABLE' };
    if (!obj(root[ROOT_KEY])) root[ROOT_KEY] = {};
    state.countryCode = countryKey(profile); state.countryName = profile.name || state.countryName;
    state.updatedTurn = simTurn(); state.revision = Math.max(0, Math.floor(num(state.revision) || 0)) + 1;
    root[ROOT_KEY][countryKey(profile)] = clone(state);
    emit('OMEGA_MILITARY_COMMAND_STATE_UPDATED', { countryId: countryKey(profile), state: clone(state), turn: simTurn(), revision: state.revision });
    return { ok: true, state: clone(state) };
  }
  function resolveFinanceFor(profile) {
    var api = g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry);
    if (!api || typeof api.applyAction !== 'function' || typeof api.getFinanceState !== 'function' || typeof api.diagnostics !== 'function') return { ok: false, code: 'FINANCE_RUNTIME_NOT_READY' };
    var d = api.diagnostics();
    if (!d || d.initialized !== true) return { ok: false, code: 'FINANCE_RUNTIME_NOT_READY' };
    var player = api.getPlayerCountry && api.getPlayerCountry(), resolved = api.resolveCountry && api.resolveCountry(profile.iso3 || profile.code || profile.name);
    if (player && resolved && player.countryCode && resolved.countryCode && player.countryCode !== resolved.countryCode) return { ok: false, code: 'PLAYER_COUNTRY_SCOPE_VIOLATION' };
    if (!resolved) return { ok: false, code: 'FINANCE_COUNTRY_NOT_FOUND' };
    var model = api.getFinanceState(resolved.countryCode), parent = model && model.allocations && model.allocations.defense;
    if (!model || !parent || !(num(parent.budgetUsd) > 0)) return { ok: false, code: 'DEFENSE_BUDGET_ALLOCATION_UNAVAILABLE' };
    return { ok: true, api: api, profile: resolved, model: model, parent: parent, financeCountryCode: resolved.countryCode };
  }
  function budgetSpendByCategory(model, category) {
    var rows = Array.isArray(model && model.ledger) ? model.ledger : [], fiscal = Math.max(0, Math.floor(num(model && model.fiscalYearIndex) || 0)), marker = 'OMEGA_MILITARY_BUDGET:' + category + '|';
    return rows.reduce(function (sum, row) {
      if (!row || row.action !== 'EXPENSE' || String(row.department || '') !== 'defense' || !String(row.description || '').startsWith(marker) || row.reversedBy) return sum;
      if (num(row.fiscalYearIndex) !== null && Math.floor(num(row.fiscalYearIndex)) !== fiscal) return sum;
      return sum + Math.max(0, num(row.amountUsd) || 0);
    }, 0);
  }
  function defenseBudgetSnapshot(profile, suppliedState) {
    profile = profile || currentPlayerCountry();
    var access = resolveFinanceFor(profile);
    if (!access.ok) return { available: false, reason: access.code, countryCode: countryKey(profile) };
    var state = suppliedState || readState(profile), total = Math.max(0, num(access.parent.budgetUsd) || 0);
    var remaining = Math.max(0, num(access.parent.remainingUsd) ?? total), cash = Math.max(0, num(access.model.treasuryBalanceUsd) || 0), plan = normalizeShares(state.budgetPlan), rows = {}, planned = 0;
    ['personnel', 'equipment', 'operations'].forEach(function (id) {
      var budget = total * plan[id] / 100, spent = budgetSpendByCategory(access.model, id);
      rows[id] = { id: id, sharePct: plan[id], budgetUsd: budget, spentUsd: spent, remainingUsd: Math.max(0, budget - spent),
        spendableUsd: Math.max(0, Math.min(budget - spent, remaining, cash)) };
      planned += budget;
    });
    return { available: true, valid: plan.personnel + plan.equipment + plan.operations <= 100.0001, reason: null,
      countryCode: countryKey(profile), financeCountryCode: access.financeCountryCode, parentBudgetUsd: total,
      parentRemainingUsd: remaining, treasuryBalanceUsd: cash, planTotalUsd: planned,
      unallocatedSharePct: Math.max(0, 100 - plan.personnel - plan.equipment - plan.operations), categories: rows, plan: plan,
      fiscalYearIndex: Math.max(0, Math.floor(num(access.model.fiscalYearIndex) || 0)) };
  }
  function setDefenseBudgetPlan(plan) {
    var profile = currentPlayerCountry(), state = readState(profile), next = normalizeShares(plan), sum = next.personnel + next.equipment + next.operations;
    if (sum > 100.0001) return { ok: false, code: 'DEFENSE_PLAN_OVERALLOCATED', message: 'Defense sub-budgets cannot exceed 100% of the Finance Defense ceiling.' };
    var snap = defenseBudgetSnapshot(profile, state);
    if (!snap.available) return { ok: false, code: snap.reason || 'DEFENSE_BUDGET_UNAVAILABLE' };
    ['personnel', 'equipment', 'operations'].forEach(function (id) {
      if (next[id] + 0.0001 < snap.categories[id].spentUsd / Math.max(1, snap.parentBudgetUsd) * 100) sum = 101;
    });
    if (sum > 100.0001) return { ok: false, code: 'DEFENSE_PLAN_BELOW_SPENT', message: 'A defense category cannot be reduced below money already spent this fiscal year.' };
    state.budgetPlan = next;
    var saved = saveState(profile, state);
    return saved.ok ? { ok: true, code: 'DEFENSE_PLAN_SAVED', snapshot: defenseBudgetSnapshot(profile, state) } : saved;
  }
  function spendDefense(profile, category, amount, spendType, description) {
    var cost = Math.max(0, num(amount) || 0);
    if (cost <= 0) return { ok: false, code: 'EXPENSE_AMOUNT_INVALID', message: 'Expense must be greater than zero.' };
    var state = readState(profile), snap = defenseBudgetSnapshot(profile, state);
    if (!snap.available) return { ok: false, code: snap.reason || 'DEFENSE_BUDGET_UNAVAILABLE' };
    if (!snap.valid) return { ok: false, code: 'DEFENSE_PLAN_OVERALLOCATED' };
    var row = snap.categories[category];
    if (!row) return { ok: false, code: 'DEFENSE_CATEGORY_INVALID' };
    if (cost > row.remainingUsd + 0.01) return { ok: false, code: 'DEFENSE_CATEGORY_LIMIT_EXCEEDED', budgetRemaining: row.remainingUsd, cost: cost };
    if (cost > snap.parentRemainingUsd + 0.01) return { ok: false, code: 'ALLOCATION_LIMIT_EXCEEDED', budgetRemaining: snap.parentRemainingUsd, cost: cost };
    if (cost > snap.treasuryBalanceUsd + 0.01) return { ok: false, code: 'INSUFFICIENT_TREASURY', balance: snap.treasuryBalanceUsd, cost: cost };
    var api = g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry), type = spendType || (category === 'personnel' ? 'salary' : category === 'equipment' ? 'purchase' : 'general');
    var result;
    try {
      result = api.applyAction({ type: 'spend-budget', countryId: snap.financeCountryCode, department: 'defense',
        amountUsd: cost, spendType: type, description: 'OMEGA_MILITARY_BUDGET:' + category + '|' + String(description || 'MILITARY_ACTION') });
    } catch (error) { return { ok: false, code: 'FINANCE_TRANSACTION_FAILED', message: String(error && error.message || error) }; }
    return result && result.ok ? { ok: true, transactionId: result.transactionId || null, cost: cost, snapshot: defenseBudgetSnapshot(profile, state) } :
      { ok: false, code: result && result.code || 'FINANCE_TRANSACTION_FAILED', message: result && result.message, balance: result && result.treasuryBalanceUsd };
  }
  function emit(type, payload) {
    try { if (typeof g.dispatchEvent === 'function' && typeof g.CustomEvent === 'function') g.dispatchEvent(new g.CustomEvent(type, { detail: Object.assign({ eventType: type, simulationTurn: simTurn() }, clone(payload || {})) })); } catch (_) {}
  }
  function getCityCountryRow(profile) {
    var key = identityId(profile.name || profile.iso3 || profile.code);
    return (data.cities || []).find(function (row) { return identityId(row.name) === key || countryAliases(profile).some(function (a) { return countryAliases(row).indexOf(a) >= 0; }); }) || null;
  }
  function cityRowsFor(profile) {
    var source = getCityCountryRow(profile), list = [];
    if (source) {
      if (obj(source.capital)) list.push(Object.assign({ role: 'CAPITAL', type: 'political' }, source.capital));
      ['economic', 'military', 'cities'].forEach(function (field) {
        (Array.isArray(source[field]) ? source[field] : []).forEach(function (item) {
          if (obj(item)) list.push(Object.assign({ role: field === 'economic' ? 'ECONOMIC' : field === 'military' ? 'MILITARY' : 'CITY' }, item));
        });
      });
    }
    var seen = {};
    return list.filter(function (row) {
      var key = norm(row.name); if (!key || seen[key]) return false; seen[key] = true; return true;
    });
  }
  function classifyTerrain(row) {
    var text = norm([row.name, row.role, row.type, row.description].join(' '));
    if (/MOUNTAIN|HIGHLAND|HILL|PASS/.test(text)) return 'mountain';
    if (/BORDER|FRONTIER|CHECKPOINT/.test(text)) return 'border';
    if (/PORT|COAST|NAVAL|SEAPORT|HARBOR|HARBOUR|MARITIME|DOCK/.test(text)) return 'coastal';
    if (/INDUSTR|FACTORY|SMELT|POWER PLANT|REFINERY|MANUFACTUR/.test(text)) return 'industrial';
    if (/MILITARY|AIR FORCE|AIRBASE|NAVAL COMMAND|ARMY COMMAND/.test(text)) return 'military';
    if (/CAPITAL|NATIONAL ADMINISTRATIVE CENTER/.test(text)) return 'capital';
    return 'urban';
  }
  function buildTheaters(profile) {
    var rows = cityRowsFor(profile), pop = countryPopulation(profile), urbanPct = urbanizationPct(profile), key = countryKey(profile), result = [];
    if (!rows.length) {
      rows.push({ name: 'National Urban Area', role: 'MODELED_FALLBACK', type: 'urban', description: 'Modeled urban theater because this country has no city records in the local registry.' });
    }
    rows.forEach(function (row) {
      var terrain = classifyTerrain(row);
      result.push({
        id: key + '-city-' + slug(row.name) + '-' + terrain, countryCode: key, name: String(row.name),
        group: 'urban', terrain: terrain, terrainLabel: (data.catalog.terrain[terrain] || data.catalog.terrain.urban).label,
        role: String(row.role || row.type || 'CITY'), description: String(row.description || 'Recorded city / strategic location from cities.json.'),
        source: row.role === 'MODELED_FALLBACK' ? 'MODELED_FALLBACK_NO_CITY_RECORD' : 'CITIES_JSON',
        lat: num(row.lat), lng: num(row.lng ?? row.lon), urbanizationPct: urbanPct,
        populationEstimate: null, controller: key
      });
    });
    var ruralPopulation = pop.value !== null && urbanPct !== null ? Math.round(pop.value * (100 - urbanPct) / 100) : null;
    var regionNames = ['Northern Rural Region', 'Central Rural Region', 'Southern Rural Region'];
    regionNames.forEach(function (name, i) {
      result.push({
        id: key + '-rural-region-' + (i + 1), countryCode: key, name: name + ' (modeled)',
        group: 'rural', terrain: 'rural', terrainLabel: data.catalog.terrain.rural.label,
        role: 'RURAL_REGION', description: 'Game-generated rural theater; not a registered city or official administrative district.',
        source: 'MODELED_FROM_COUNTRY_URBANIZATION', lat: null, lng: null, urbanizationPct: urbanPct,
        populationEstimate: ruralPopulation === null ? null : Math.round(ruralPopulation / 3), controller: key
      });
    });
    return result;
  }
  function getTheaters(country) {
    var profile = typeof country === 'object' && country ? country : resolveCountryRow(country);
    if (!profile) return [];
    return buildTheaters(profile);
  }
  function stateDigest(profile) {
    var s = readState(profile), pop = countryPopulation(profile), theaters = buildTheaters(profile);
    return { countryCode: countryKey(profile), countryName: profile.name, personnel: s.personnel, personnelSource: s.personnelSource,
      readiness: s.readiness, equipment: clone(s.equipment), equipmentSource: s.equipmentSource || 'MIXED_OR_SAVED',
      treasuryAndBudget: defenseBudgetSnapshot(profile, s), cityCount: theaters.length, saved: !!(stateRoot() && stateRoot()[ROOT_KEY] && stateRoot()[ROOT_KEY][countryKey(profile)]),
      populationBaseline: pop.source, modeled: String(s.personnelSource || '').indexOf('SIMULATED') === 0 };
  }
  function recruit(quantity) {
    if (!ready) return { ok: false, code: 'BATTLEFIELD_DATA_NOT_READY' };
    var profile = currentPlayerCountry(), catalog = data.catalog, qty = Math.floor(num(quantity) || 0);
    if (qty < (num(catalog.economy.minimumRecruitment) || 1) || qty > (num(catalog.economy.maximumRecruitmentPerOrder) || 200000))
      return { ok: false, code: 'RECRUITMENT_QUANTITY_INVALID' };
    var state = readState(profile), population = countryPopulation(profile), baseline = catalog.baselineForce || {};
    var cap = population.value === null ? num(baseline.maximumPersonnel) || 1200000 : Math.min(num(baseline.maximumPersonnel) || 1200000, Math.floor(population.value * 0.01));
    if (state.personnel + qty > cap) return { ok: false, code: 'FORCE_CEILING_EXCEEDED', current: state.personnel, requested: qty, ceiling: cap };
    var cost = qty * (num(catalog.economy.recruitmentCostPerSoldierUsd) || 0);
    var charge = spendDefense(profile, 'personnel', cost, 'salary', 'PERSONNEL_RECRUITMENT');
    if (!charge.ok) return charge;
    state.personnel += qty; state.personnelSource = 'PLAYER_MANAGED_PLUS_BASELINE';
    state.recruitmentQueue.push({ id: 'REC-' + countryKey(profile) + '-' + simTurn() + '-' + (state.recruitmentQueue.length + 1),
      quantity: qty, costUsd: cost, status: 'RECRUITED', turn: simTurn(), source: 'PLAYER_COMMAND' });
    state.recruitmentQueue = state.recruitmentQueue.slice(-256);
    state.readiness = clamp(state.readiness + Math.min(4, qty / 20000), 0, 100);
    var saved = saveState(profile, state);
    if (!saved.ok) {
      if (charge.transactionId) rollbackFinance(charge.transactionId, profile);
      return { ok: false, code: saved.code || 'MILITARY_STATE_COMMIT_FAILED', rollbackAttempted: !!charge.transactionId };
    }
    emit('OMEGA_MILITARY_RECRUITMENT_APPLIED', { countryId: countryKey(profile), quantity: qty, costUsd: cost, newPersonnel: state.personnel, turn: simTurn() });
    return { ok: true, quantity: qty, costUsd: cost, personnel: state.personnel, state: clone(state) };
  }
  function rollbackFinance(transactionId, profile) {
    var finance = g.OmegaFinanceMinistry || (g.Omega && g.Omega.FinanceMinistry);
    if (!finance || !transactionId || !finance.applyAction) return false;
    var result = finance.applyAction({ type: 'rollback-home-ministry-expense', countryId: financeCode(profile), transactionId: transactionId,
      description: 'Rollback failed military state commit' });
    return !!(result && result.ok);
  }
  function purchase(itemId, quantity) {
    if (!ready) return { ok: false, code: 'BATTLEFIELD_DATA_NOT_READY' };
    var profile = currentPlayerCountry(), catalog = data.catalog, item = catalog.procurement.find(function (x) { return x.id === String(itemId); }), qty = Math.floor(num(quantity) || 0);
    if (!item) return { ok: false, code: 'PROCUREMENT_ITEM_INVALID' };
    if (qty < 1 || qty > 10000) return { ok: false, code: 'PROCUREMENT_QUANTITY_INVALID' };
    var state = readState(profile), cost = qty * (num(item.costUsd) || 0);
    var charge = spendDefense(profile, 'equipment', cost, 'purchase', 'EQUIPMENT_PURCHASE:' + item.id);
    if (!charge.ok) return charge;
    state.equipment[item.id] = Math.max(0, Math.floor(num(state.equipment[item.id]) || 0)) + qty;
    state.procurementQueue.push({ id: 'PROC-' + countryKey(profile) + '-' + simTurn() + '-' + (state.procurementQueue.length + 1),
      itemId: item.id, itemName: item.name, quantity: qty, costUsd: cost, status: 'DELIVERED', turn: simTurn(), source: 'PLAYER_COMMAND' });
    state.procurementQueue = state.procurementQueue.slice(-256);
    var saved = saveState(profile, state);
    if (!saved.ok) {
      if (charge.transactionId) rollbackFinance(charge.transactionId, profile);
      return { ok: false, code: saved.code || 'MILITARY_STATE_COMMIT_FAILED', rollbackAttempted: !!charge.transactionId };
    }
    emit('OMEGA_MILITARY_EQUIPMENT_APPLIED', { countryId: countryKey(profile), itemId: item.id, quantity: qty, costUsd: cost, inventory: state.equipment[item.id], turn: simTurn() });
    return { ok: true, itemId: item.id, quantity: qty, costUsd: cost, inventory: state.equipment[item.id], state: clone(state) };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function equipmentPower(state, commitment, field) {
    var total = 0, catalog = data.catalog, inv = state.equipment || {};
    (catalog.procurement || []).forEach(function (item) { total += (num(inv[item.id]) || 0) * (num(item[field]) || 0) * commitment; });
    return total;
  }
  function startBattle(input) {
    if (!ready) return { ok: false, code: 'BATTLEFIELD_DATA_NOT_READY' };
    input = obj(input) ? input : {};
    var player = currentPlayerCountry(), target = resolveCountryRow(input.targetCountry || uiState.targetCountry);
    if (!target) return { ok: false, code: 'BATTLE_TARGET_COUNTRY_INVALID' };
    if (countryKey(target) === countryKey(player)) return { ok: false, code: 'BATTLE_TARGET_IS_PLAYER_COUNTRY', message: 'Choose a different country as the opponent.' };
    var theater = buildTheaters(target).find(function (t) { return t.id === String(input.theaterId || uiState.theaterId); });
    if (!theater) return { ok: false, code: 'BATTLE_THEATER_NOT_FOUND' };
    var playerState = readState(player), enemyState = readState(target), catalog = data.catalog, rules = catalog.combat || {};
    var troops = Math.floor(num(input.troops) || Math.min(1000, playerState.personnel)), pct = clamp(num(input.equipmentCommitmentPct) ?? num(rules.equipmentCommitmentDefaultPct) ?? 30, 0, 100), commitment = pct / 100;
    if (troops < 1 || troops > playerState.personnel) return { ok: false, code: 'BATTLE_TROOP_COUNT_INVALID', available: playerState.personnel };
    var garrisonShare = clamp(num(catalog.baselineForce && catalog.baselineForce.garrisonShareOfActivePersonnel) || 0.12, 0.01, num(rules.maximumGarrisonShare) || 0.3);
    var defenders = Math.min(enemyState.personnel, Math.max(num(rules.minimumGarrison) || 500, Math.floor(enemyState.personnel * garrisonShare)));
    var terrain = catalog.terrain[theater.terrain] || catalog.terrain.urban;
    var readinessFloor = num(rules.readinessFactorFloor) || 0.45;
    var attackEquipment = equipmentPower(playerState, commitment, 'combatPower');
    var attackLogistics = equipmentPower(playerState, commitment, 'logisticsPower');
    var defenseEquipment = equipmentPower(enemyState, 0.45, 'combatPower');
    var defenseLogistics = equipmentPower(enemyState, 0.45, 'logisticsPower');
    var attackPower = troops * (readinessFloor + playerState.readiness / 200) * terrain.attackModifier * (num(terrain.supplyModifier) || 1) + attackEquipment + attackLogistics * 0.25;
    var defensePower = defenders * (readinessFloor + enemyState.readiness / 200) * terrain.defenseModifier + defenseEquipment * 0.55 + defenseLogistics * 0.2;
    var ratio = attackPower / Math.max(1, defensePower), won = ratio >= 1;
    var jitter = (hash(countryKey(player) + '|' + countryKey(target) + '|' + theater.id + '|' + simTurn()) % 7) / 1000;
    var attackLossRate = clamp((num(rules.baseAttackLossPct) || 0.05) + (defensePower / Math.max(1, attackPower + defensePower)) * 0.2 + jitter, 0.02, num(rules.maximumLossPct) || 0.32);
    var defenseLossRate = clamp((num(rules.baseDefenseLossPct) || 0.04) + (attackPower / Math.max(1, attackPower + defensePower)) * 0.22 + jitter, 0.02, num(rules.maximumLossPct) || 0.32);
    var attackerLosses = Math.min(playerState.personnel, Math.max(1, Math.round(troops * attackLossRate)));
    var defenderLosses = Math.min(enemyState.personnel, Math.max(1, Math.round(defenders * defenseLossRate)));
    playerState.personnel = Math.max(0, playerState.personnel - attackerLosses);
    enemyState.personnel = Math.max(0, enemyState.personnel - defenderLosses);
    playerState.readiness = clamp(playerState.readiness + (won ? 1 : -3), 15, 100);
    enemyState.readiness = clamp(enemyState.readiness + (won ? -2 : 1), 15, 100);
    var equipmentLosses = {};
    (catalog.procurement || []).forEach(function (item) {
      var owned = Math.max(0, Math.floor(num(playerState.equipment[item.id]) || 0));
      var loss = owned ? Math.min(owned, Math.floor(owned * (won ? 0.005 : 0.012) * commitment)) : 0;
      if (loss > 0) { playerState.equipment[item.id] = owned - loss; equipmentLosses[item.id] = loss; }
    });
    var controller = won ? countryKey(player) : countryKey(target);
    enemyState.cityControl[theater.id] = { controller: controller, lastBattleTurn: simTurn(), lastOutcome: won ? 'ATTACKER_VICTORY' : 'DEFENDER_HELD' };
    var battle = { id: 'BATTLE-' + countryKey(player) + '-' + countryKey(target) + '-' + simTurn() + '-' + (playerState.battleLog.length + 1),
      turn: simTurn(), attackerCountry: countryKey(player), attackerName: player.name, defenderCountry: countryKey(target), defenderName: target.name,
      theaterId: theater.id, theaterName: theater.name, terrain: theater.terrain, outcome: won ? 'ATTACKER_VICTORY' : 'DEFENDER_HELD',
      attackerPersonnelCommitted: troops, defenderGarrison: defenders, attackerLosses: attackerLosses, defenderLosses: defenderLosses,
      attackerPower: Math.round(attackPower), defenderPower: Math.round(defensePower), equipmentCommitmentPct: pct,
      attackerReadinessAfter: playerState.readiness, defenderReadinessAfter: enemyState.readiness, equipmentLosses: equipmentLosses,
      dataProvenance: { attacker: playerState.personnelSource || 'SAVED_GAME_STATE', defender: enemyState.personnelSource || 'SIMULATED_ESTIMATE', theater: theater.source } };
    playerState.battleLog.push(battle); playerState.battleLog = playerState.battleLog.slice(-200);
    enemyState.battleLog.push(battle); enemyState.battleLog = enemyState.battleLog.slice(-200);
    var savedPlayer = saveState(player, playerState), savedEnemy = saveState(target, enemyState);
    if (!savedPlayer.ok || !savedEnemy.ok) return { ok: false, code: 'BATTLE_STATE_COMMIT_FAILED', playerSaved: savedPlayer.ok, targetSaved: savedEnemy.ok };
    emit('OMEGA_MILITARY_BATTLE_RESOLVED', clone(battle));
    return { ok: true, battle: battle, playerState: clone(playerState), targetState: clone(enemyState) };
  }
  function formatMoney(v) { var n = num(v); return n === null ? 'Unavailable' : '$' + Math.round(n).toLocaleString('en-US'); }
  function runtimeDataDiagnostics() {
    return { version: VERSION, ready: ready, countryCount: data.countries.length, cityCountryCount: data.cities.length,
      countriesWithoutCityRecords: Math.max(0, data.countries.length - data.cities.length), catalogAvailable: !!data.catalog,
      countryProfilesHaveAtLeastTwoTheaters: ready ? data.countries.every(function (p) { return buildTheaters(p).length >= 2; }) : false,
      countryScopedState: true, financeBudgetEnforced: true, battleRuntime: true };
  }
  function mountLauncher() {
    if (!g.document || g.document.getElementById('omega-battlefield-launcher-v1')) return;
    var style = g.document.getElementById('omega-battlefield-style-v1');
    if (!style) {
      style = g.document.createElement('style'); style.id = 'omega-battlefield-style-v1';
      style.textContent =
        '.obfc-launcher{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9998;border:1px solid #d5b15c;border-radius:9px;padding:11px 13px;background:linear-gradient(135deg,#30485a,#121c2a);color:#f7de9a;font-weight:900;font-size:11px;letter-spacing:.06em;box-shadow:0 6px 24px rgba(0,0,0,.36);touch-action:manipulation}' +
        '.obfc-overlay{position:fixed;inset:0;z-index:100000;background:rgba(2,7,13,.96);color:#edf4fc;display:none;overflow:auto;overscroll-behavior:contain;font-family:Arial,sans-serif}' +
        '.obfc-overlay.is-open{display:block}.obfc-shell{max-width:1150px;margin:0 auto;padding:12px 12px 30px;box-sizing:border-box;min-height:100%;}' +
        '.obfc-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;background:rgba(2,7,13,.96);border-bottom:1px solid rgba(224,190,105,.24)}' +
        '.obfc-title{font-weight:900;font-size:15px;letter-spacing:.08em;color:#f4d780}.obfc-sub{font-size:11px;color:#9fb4c8;margin-top:5px;line-height:1.45}.obfc-close{min-width:42px;min-height:40px;border:1px solid #476175;border-radius:8px;background:#172838;color:#eaf4fa;font-size:12px;font-weight:900}' +
        '.obfc-tabs{display:flex;gap:7px;overflow-x:auto;padding:12px 0}.obfc-tab{white-space:nowrap;border:1px solid #315067;border-radius:8px;padding:9px 11px;background:#101d2a;color:#bcd1e2;font-size:10px;font-weight:900}.obfc-tab.is-active{background:#5d4724;color:#ffe6a3;border-color:#d5b15c}' +
        '.obfc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.obfc-card{min-width:0;box-sizing:border-box;border:1px solid rgba(102,160,195,.27);border-radius:10px;padding:11px;background:linear-gradient(150deg,#152d42,#09131f)}' +
        '.obfc-card h3{font-size:12px;line-height:1.35;margin:5px 0;color:#edf5fd}.obfc-card p{font-size:11px;line-height:1.5;color:#9db5c9;margin:7px 0}.obfc-label{font-size:9px;color:#eac978;text-transform:uppercase;letter-spacing:.09em;font-weight:900}.obfc-num{font-size:16px;color:#f7f9fc;font-weight:900;overflow-wrap:anywhere}.obfc-muted{font-size:11px;line-height:1.5;color:#a5bacd;margin:9px 0}.obfc-status{margin:10px 0;border:1px solid #37556a;border-radius:8px;padding:10px;background:rgba(0,0,0,.18);color:#b5cbdd;font-size:12px;line-height:1.5}.obfc-status.is-error{color:#ffd3cc;border-color:#9a4944}.obfc-status.is-ok{color:#c0f1d8;border-color:#368b6a}' +
        '.obfc-button{width:100%;min-height:39px;padding:9px;border:1px solid #48677b;border-radius:7px;background:linear-gradient(135deg,#263f52,#0c1925);color:#eaf4fb;font-size:10px;font-weight:900;letter-spacing:.04em;touch-action:manipulation}.obfc-button.is-gold{background:linear-gradient(135deg,#80602a,#302517);border-color:#d6b563;color:#ffe8a9}.obfc-button:disabled{opacity:.4}.obfc-field{box-sizing:border-box;width:100%;min-width:0;min-height:38px;border:1px solid #3b5b72;border-radius:7px;padding:8px;background:#06111d;color:#eff7fc;font-size:12px;margin:5px 0 9px}.obfc-form-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.obfc-card svg{display:block;width:100%;height:80px;margin:0 auto 8px}.obfc-terrain{border:1px solid #29485d;border-radius:7px;background:#0b1a28;padding:9px;text-align:left;min-height:80px;width:100%;color:#dcebf6}.obfc-terrain.is-selected{border-color:#e5c36f;box-shadow:0 0 0 1px rgba(229,195,111,.18)}.obfc-select{max-width:100%}.obfc-table{border-collapse:collapse;width:100%;font-size:11px}.obfc-table th,.obfc-table td{padding:8px 5px;text-align:left;border-bottom:1px solid rgba(151,183,206,.17)}.obfc-table th{color:#e8ca7a;text-transform:uppercase;font-size:9px}.obfc-pill{display:inline-block;border:1px solid rgba(119,183,216,.32);border-radius:5px;padding:4px 6px;font-size:9px;color:#b8e8f5;background:rgba(50,145,177,.1)}' +
        '@media(max-width:690px){.obfc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.obfc-shell{padding-left:9px;padding-right:9px}.obfc-card{padding:9px}.obfc-title{font-size:13px}}@media(max-width:400px){.obfc-grid{grid-template-columns:1fr}.obfc-form-row{grid-template-columns:1fr}.obfc-launcher{right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));}}';
      (g.document.head || g.document.documentElement).appendChild(style);
    }
    var button = g.document.createElement('button');
    button.type = 'button'; button.id = 'omega-battlefield-launcher-v1'; button.className = 'obfc-launcher';
    button.textContent = 'MILITARY / BATTLEFIELD';
    button.onclick = open;
    (g.document.body || g.document.documentElement).appendChild(button);
    var modal = g.document.createElement('div');
    modal.id = 'omega-battlefield-modal-v1'; modal.className = 'obfc-overlay'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    (g.document.body || g.document.documentElement).appendChild(modal);
  }
  function playerState() { return readState(currentPlayerCountry()); }
  function setStatus(message, type) { uiState.status = String(message || ''); uiState.statusType = type || ''; }
  function statusHtml() { return uiState.status ? '<div class="obfc-status ' + (uiState.statusType === 'error' ? 'is-error' : uiState.statusType === 'ok' ? 'is-ok' : '') + '">' + esc(uiState.status) + '</div>' : ''; }
  function vehicleSvg(item) {
    var id = 'obfc-svg-' + slug(item.id), fill = 'url(#' + id + '-body)';
    var art = '';
    if (item.id === 'logistics_truck') {
      art = '<ellipse cx="119" cy="86" rx="86" ry="7" fill="#01060a" opacity=".6"/><rect x="29" y="34" width="107" height="37" rx="3" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.5"/><path d="M38 39 H127 V47 H38 Z" fill="#aab8c2" opacity=".35"/><path d="M137 49 H173 L197 62 V75 H137 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.5"/><path d="M149 51 H171 L187 62 H149 Z" fill="#8fc0d5" opacity=".75"/><rect x="38" y="44" width="88" height="22" fill="#182a39" stroke="#97aab6" stroke-opacity=".55"/><path d="M36 69 H197" stroke="#e6bd67" stroke-width="3"/><circle cx="60" cy="76" r="13" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="60" cy="76" r="5" fill="#8ea0ab"/><circle cx="112" cy="76" r="13" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="112" cy="76" r="5" fill="#8ea0ab"/><circle cx="172" cy="76" r="13" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="172" cy="76" r="5" fill="#8ea0ab"/>';
    } else if (item.id === 'utility_vehicle') {
      art = '<ellipse cx="120" cy="85" rx="78" ry="7" fill="#01060a" opacity=".6"/><path d="M42 61 L51 43 L84 32 L143 32 L166 43 L183 58 L190 73 L37 73 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7" stroke-linejoin="round"/><path d="M58 44 L86 36 H113 V56 H50 Z" fill="#9bc5d8" opacity=".78"/><path d="M119 36 H141 L160 48 H119 Z" fill="#9bc5d8" opacity=".66"/><path d="M40 61 H189" stroke="#e6bd67" stroke-width="3"/><circle cx="72" cy="74" r="15" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="72" cy="74" r="6" fill="#8ea0ab"/><circle cx="157" cy="74" r="15" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="157" cy="74" r="6" fill="#8ea0ab"/><path d="M177 57 L185 60 V66 H177 Z" fill="#f5d889"/>';
    } else if (item.id === 'apc') {
      art = '<ellipse cx="120" cy="85" rx="91" ry="8" fill="#01060a" opacity=".6"/><rect x="32" y="67" width="178" height="18" rx="9" fill="#101d29" stroke="#899ba7" stroke-width="2"/><g fill="#607583" stroke="#c7d2d9" stroke-width="1.5"><circle cx="52" cy="76" r="7"/><circle cx="76" cy="76" r="7"/><circle cx="100" cy="76" r="7"/><circle cx="124" cy="76" r="7"/><circle cx="148" cy="76" r="7"/><circle cx="172" cy="76" r="7"/><circle cx="196" cy="76" r="7"/></g><path d="M34 67 L43 46 L65 40 L161 40 L191 53 L207 67 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7"/><path d="M62 43 H88 V60 H47 Z M95 43 H121 V60 H95 Z M128 43 H156 V60 H128 Z" fill="#9bc5d8" opacity=".64"/><path d="M36 65 H208" stroke="#e6bd67" stroke-width="3"/><path d="M162 40 L174 32 L187 36 L193 51" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.5"/>';
    } else if (item.id === 'mbt') {
      art = '<ellipse cx="120" cy="85" rx="91" ry="8" fill="#01060a" opacity=".6"/><rect x="29" y="68" width="181" height="17" rx="8" fill="#101d29" stroke="#899ba7" stroke-width="2"/><g fill="#657987" stroke="#c7d2d9" stroke-width="1.5"><circle cx="48" cy="76" r="7"/><circle cx="72" cy="76" r="7"/><circle cx="96" cy="76" r="7"/><circle cx="120" cy="76" r="7"/><circle cx="144" cy="76" r="7"/><circle cx="168" cy="76" r="7"/><circle cx="192" cy="76" r="7"/></g><path d="M42 67 L51 48 L176 48 L202 67 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7"/><path d="M83 50 L99 32 L141 30 L162 47 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7"/><path d="M127 33 L188 25 L191 30 L145 42" fill="#647b8a" stroke="#d0d8de" stroke-width="1.4"/><rect x="111" y="29" width="29" height="8" rx="4" fill="#9eb2bd"/><path d="M40 65 H204" stroke="#e6bd67" stroke-width="3"/>';
    } else if (item.id === 'artillery_battery') {
      art = '<ellipse cx="120" cy="85" rx="77" ry="7" fill="#01060a" opacity=".6"/><path d="M55 69 L69 55 L125 55 L151 66 L151 75 H55 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7"/><circle cx="73" cy="76" r="12" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="73" cy="76" r="5" fill="#8ea0ab"/><circle cx="136" cy="76" r="12" fill="#02060b" stroke="#8ea0ab" stroke-width="3"/><circle cx="136" cy="76" r="5" fill="#8ea0ab"/><path d="M107 58 L176 30 L181 35 L125 65 Z" fill="#8095a3" stroke="#d0d8de" stroke-width="2"/><path d="M177 30 L184 27 L187 33 L181 36 Z" fill="#ced9df"/><path d="M96 61 L117 45 L131 49 L131 61 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.5"/><path d="M39 71 H155" stroke="#e6bd67" stroke-width="3"/>';
    } else if (item.id === 'multirole_aircraft') {
      art = '<ellipse cx="120" cy="84" rx="78" ry="6" fill="#01060a" opacity=".45"/><path d="M26 55 L96 50 L111 17 L126 17 L132 49 L207 61 L208 68 L133 64 L124 84 L113 84 L107 63 L28 63 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.6" stroke-linejoin="round"/><path d="M113 24 L121 22 L126 49 L117 49 Z" fill="#9bc5d8" opacity=".75"/><path d="M38 56 L90 53 L91 58 L39 60 Z" fill="#9bc5d8" opacity=".5"/><path d="M135 51 L196 62 L193 65 L135 59 Z" fill="#9bc5d8" opacity=".35"/><circle cx="120" cy="57" r="3" fill="#e6bd67"/><path d="M46 68 H198" stroke="#e6bd67" stroke-width="2" opacity=".7"/>';
    } else if (item.id === 'patrol_vessel') {
      art = '<ellipse cx="120" cy="85" rx="96" ry="7" fill="#01060a" opacity=".5"/><path d="M25 65 H215 L194 81 Q120 93 46 81 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7"/><path d="M84 65 V43 H152 V65 Z" fill="' + fill + '" stroke="#d0d8de" stroke-width="1.7"/><path d="M95 48 H112 V59 H95 Z M119 48 H140 V59 H119 Z" fill="#9bc5d8" opacity=".76"/><rect x="109" y="28" width="5" height="16" fill="#9eb2bd"/><path d="M114 30 H137 V34 H114 Z" fill="#e6bd67"/><path d="M30 67 H209" stroke="#e6bd67" stroke-width="3"/><path d="M42 86 Q64 80 83 86 T124 86 T166 86 T205 86" fill="none" stroke="#76b7d0" stroke-width="2" opacity=".7"/>';
    }
    return '<svg viewBox="0 0 240 105" role="img" aria-label="' + esc(item.name) + ' illustration" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="' + id + '-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8296a5"/><stop offset=".48" stop-color="#394d5d"/><stop offset="1" stop-color="#111e2b"/></linearGradient><linearGradient id="' + id + '-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbf5ff" stop-opacity=".9"/><stop offset="1" stop-color="#42667c" stop-opacity=".5"/></linearGradient></defs>' + art + '<text x="120" y="15" text-anchor="middle" font-size="10" font-weight="700" letter-spacing=".7" fill="#d5e6ee">' + esc(item.category) + '</text></svg>';
  }
  function tabsHtml() {
    return [['forces','FORCES & RECRUITMENT'],['procurement','PROCUREMENT'],['budget','DEFENSE BUDGET'],['battlefield','BATTLEFIELD']].map(function (t) {
      return '<button type="button" class="obfc-tab ' + (uiState.tab === t[0] ? 'is-active' : '') + '" data-obfc-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
  }
  function profileOptions(selected) {
    return data.countries.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).map(function (p) {
      return '<option value="' + esc(countryKey(p)) + '"' + (countryKey(p) === selected ? ' selected' : '') + '>' + esc(p.name) + ' (' + esc(p.iso3 || p.code || '') + ')</option>';
    }).join('');
  }
  function stateSummaryCards(s, profile) {
    var snap = defenseBudgetSnapshot(profile, s);
    return '<div class="obfc-grid"><article class="obfc-card"><div class="obfc-label">Active personnel</div><div class="obfc-num">' + Math.round(s.personnel).toLocaleString() + '</div><p>Source: ' + esc(s.personnelSource || 'SAVED_GAME_STATE') + '</p></article>' +
      '<article class="obfc-card"><div class="obfc-label">Readiness</div><div class="obfc-num">' + Math.round(s.readiness) + ' / 100</div><p>Readiness is a game-simulation measure, not a real-world capability rating.</p></article>' +
      '<article class="obfc-card"><div class="obfc-label">Equipment types</div><div class="obfc-num">' + Object.keys(s.equipment || {}).filter(function (id) { return (num(s.equipment[id]) || 0) > 0; }).length + '</div><p>Inventory source: ' + esc(s.equipmentSource || 'SAVED_OR_MODELED') + '</p></article>' +
      '<article class="obfc-card"><div class="obfc-label">Defense budget</div><div class="obfc-num">' + esc(snap.available ? formatMoney(snap.parentRemainingUsd) : 'Unavailable') + '</div><p>' + esc(snap.available ? 'Parent allocation remaining' : snap.reason) + '</p></article></div>';
  }
  function renderForces(s, profile) {
    var snap = defenseBudgetSnapshot(profile, s), cost = data.catalog.economy.recruitmentCostPerSoldierUsd;
    return '<section><h2 class="obfc-title">FORCE STRUCTURE & RECRUITMENT</h2><p class="obfc-muted">Recruitment increases the saved force structure and adds recurring daily payroll. Recruitment is rejected if the Defense salary budget, total Defense allocation or national treasury cannot cover the upfront order.</p>' +
      stateSummaryCards(s, profile) + '<article class="obfc-card" style="margin-top:10px"><div class="obfc-label">Recruit personnel</div><div class="obfc-form-row"><div>Quantity<input id="obfc-recruit-quantity" class="obfc-field" type="number" min="1" max="' + Number(data.catalog.economy.maximumRecruitmentPerOrder || 200000) + '" value="1000" step="1" inputmode="numeric"></div><div>Quoted cost<div id="obfc-recruit-cost" class="obfc-num">' + esc(formatMoney(cost * 1000)) + '</div><p>' + esc(formatMoney(data.catalog.economy.dailyPayrollPerSoldierUsd)) + ' per soldier per simulation day</p></div></div>' +
      '<button id="obfc-recruit-button" class="obfc-button is-gold" type="button" ' + (!snap.available ? 'disabled' : '') + '>CONFIRM RECRUITMENT</button>' +
      '<div class="obfc-muted">Country personnel records missing from the current dataset use an explicitly labelled simulated baseline. This is not presented as a verified real-world troop count.</div></article></section>';
  }
  function renderProcurement(s, profile) {
    var snap = defenseBudgetSnapshot(profile, s);
    return '<section><h2 class="obfc-title">MILITARY EQUIPMENT PROCUREMENT</h2><p class="obfc-muted">Procurement costs come from military_command_catalog_v1.json game rules. Purchases require both remaining Defense equipment allocation and available national treasury.</p>' +
      stateSummaryCards(s, profile) + '<div class="obfc-grid" style="margin-top:10px">' + data.catalog.procurement.map(function (item) {
        var owned = Math.max(0, Math.floor(num(s.equipment[item.id]) || 0));
        return '<article class="obfc-card">' + vehicleSvg(item) + '<div class="obfc-label">' + esc(item.category) + '</div><h3>' + esc(item.name) + '</h3><div class="obfc-num">' + esc(formatMoney(item.costUsd)) + '</div><p>' + esc(item.description) + '</p><p>Owned: <strong>' + owned.toLocaleString() + '</strong> · Combat value: ' + Number(item.combatPower || 0) + '</p>' +
          '<label class="obfc-muted">Quantity<input class="obfc-field" id="obfc-buy-' + esc(item.id) + '" type="number" min="1" max="10000" value="1" step="1" inputmode="numeric"></label>' +
          '<button type="button" class="obfc-button" data-obfc-buy="' + esc(item.id) + '" ' + (!snap.available ? 'disabled' : '') + '>PURCHASE</button></article>';
      }).join('') + '</div></section>';
  }
  function renderBudget(s, profile) {
    var snap = defenseBudgetSnapshot(profile, s), plan = s.budgetPlan || { personnel: 45, equipment: 40, operations: 15 };
    var rows = [['personnel','Recruitment & payroll'],['equipment','Equipment procurement'],['operations','Operations & training']].map(function (r) {
      var item = snap.categories && snap.categories[r[0]];
      return '<tr><td>' + esc(r[1]) + '</td><td><input class="obfc-field" type="number" min="0" max="100" step="0.1" data-obfc-share="' + r[0] + '" value="' + esc(plan[r[0]]) + '"></td><td>' +
        esc(snap.available ? formatMoney(item.budgetUsd) : 'Unavailable') + '</td><td>' +
        esc(snap.available ? formatMoney(item.remainingUsd) : 'Unavailable') + '</td></tr>';
    }).join('');
    return '<section><h2 class="obfc-title">DEFENSE MINISTRY SUB-BUDGET</h2><p class="obfc-muted">Finance owns the top-level Defense allocation. These percentages only split that approved envelope; they cannot create money or bypass the treasury limit.</p>' +
      '<div class="obfc-grid"><article class="obfc-card"><div class="obfc-label">Annual Defense ceiling</div><div class="obfc-num">' + esc(snap.available ? formatMoney(snap.parentBudgetUsd) : 'Unavailable') + '</div></article>' +
      '<article class="obfc-card"><div class="obfc-label">Defense remaining</div><div class="obfc-num">' + esc(snap.available ? formatMoney(snap.parentRemainingUsd) : 'Unavailable') + '</div></article>' +
      '<article class="obfc-card"><div class="obfc-label">Treasury</div><div class="obfc-num">' + esc(snap.available ? formatMoney(snap.treasuryBalanceUsd) : 'Unavailable') + '</div></article></div>' +
      (!snap.available ? '<div class="obfc-status is-error">Defense allocation unavailable: ' + esc(snap.reason) + '. Initialize Finance and allocate a positive Defense budget first.</div>' : '') +
      '<form id="obfc-budget-form"><div style="overflow-x:auto"><table class="obfc-table"><thead><tr><th>Category</th><th>Share %</th><th>Annual ceiling</th><th>Remaining</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="obfc-status" id="obfc-budget-total">Total: ' + (Number(plan.personnel) + Number(plan.equipment) + Number(plan.operations)) + '% of Defense budget.</div>' +
      '<button class="obfc-button is-gold" id="obfc-save-budget" type="submit" ' + (!snap.available ? 'disabled' : '') + '>SAVE DEFENSE DISTRIBUTION</button></form></section>';
  }
  function renderBattlefield(s, profile) {
    var target = resolveCountryRow(uiState.targetCountry) || data.countries.find(function (p) { return countryKey(p) !== countryKey(profile); }) || profile;
    var theaters = buildTheaters(target), selected = theaters.find(function (t) { return t.id === uiState.theaterId; });
    if (!selected) { selected = theaters[0]; uiState.theaterId = selected ? selected.id : ''; }
    var filtered = theaters.filter(function (t) { return uiState.terrainFilter === 'all' || t.group === uiState.terrainFilter || t.terrain === uiState.terrainFilter; });
    var enemy = readState(target), sourceLine = 'Personnel baseline: ' + esc(enemy.personnelSource || 'SIMULATED_ESTIMATE') + '. City-level population is not invented when the registry has no city population record.';
    return '<section><h2 class="obfc-title">CITY & REGIONAL BATTLEFIELD THEATERS</h2><p class="obfc-muted">City cards use the local cities.json registry. Every country also has modeled rural-region cards, including countries with no city records. Urban/rural labels describe simulation theaters, not official district borders.</p>' +
      '<label class="obfc-label" for="obfc-target-country">OPPONENT COUNTRY</label><select id="obfc-target-country" class="obfc-field obfc-select">' + profileOptions(countryKey(target)) + '</select>' +
      '<div class="obfc-form-row"><div><label class="obfc-label" for="obfc-terrain-filter">THEATER FILTER</label><select id="obfc-terrain-filter" class="obfc-field">' +
      [['all','All theaters'],['urban','Urban cities'],['rural','Rural regions'],['coastal','Coastal'],['industrial','Industrial'],['mountain','Mountain'],['border','Border'],['military','Military zones'],['capital','Capitals']].map(function (o) { return '<option value="' + o[0] + '"' + (uiState.terrainFilter === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select></div><div><label class="obfc-label">AVAILABLE FORCE</label><div class="obfc-num">' + Math.round(s.personnel).toLocaleString() + ' personnel</div><div class="obfc-muted">' + esc(s.personnelSource || 'SAVED_STATE') + '</div></div></div>' +
      '<div class="obfc-grid">' + filtered.map(function (t) {
        var isSelected = selected && selected.id === t.id, ctl = enemy.cityControl && enemy.cityControl[t.id], ruralPop = t.populationEstimate === null ? 'No rural-population baseline' : 'Estimated rural population: ' + Math.round(t.populationEstimate).toLocaleString();
        return '<button type="button" class="obfc-terrain ' + (isSelected ? 'is-selected' : '') + '" data-obfc-theater="' + esc(t.id) + '">' +
          '<span class="obfc-label">' + esc(t.group === 'rural' ? 'RURAL / MODELED' : t.terrainLabel) + '</span><h3>' + esc(t.name) + '</h3>' +
          '<div class="obfc-muted">' + esc(t.role) + ' · ' + esc(t.source) + '</div>' +
          '<div class="obfc-muted">' + esc(t.group === 'rural' ? ruralPop : (t.urbanizationPct === null ? 'Urbanization data unavailable' : 'Country urbanization baseline: ' + t.urbanizationPct + '%')) + '</div>' +
          (ctl ? '<span class="obfc-pill">LAST CONTROL: ' + esc(ctl.controller) + '</span>' : '<span class="obfc-pill">NO RECORDED BATTLE</span>') + '</button>';
      }).join('') + '</div>' +
      (selected ? '<article class="obfc-card" style="margin-top:10px"><div class="obfc-label">Selected theater</div><h3>' + esc(selected.name) + ' · ' + esc(selected.terrainLabel) + '</h3><p>' + esc(selected.description) + '</p><p>Attack modifier ' + selectedAttackModifier(selected.terrain) + ' · Defense modifier ' + selectedDefenseModifier(selected.terrain) + ' · Logistics modifier ' + selectedSupplyModifier(selected.terrain) + '</p>' +
        '<div class="obfc-form-row"><div><label class="obfc-label" for="obfc-battle-troops">PERSONNEL TO COMMIT</label><input id="obfc-battle-troops" class="obfc-field" type="number" min="1" max="' + s.personnel + '" value="' + Math.max(1, Math.min(1000, s.personnel)) + '" inputmode="numeric"></div>' +
        '<div><label class="obfc-label" for="obfc-battle-equipment">EQUIPMENT COMMITMENT %</label><input id="obfc-battle-equipment" class="obfc-field" type="number" min="0" max="100" value="' + Number((data.catalog.combat || {}).equipmentCommitmentDefaultPct || 30) + '" inputmode="numeric"></div></div>' +
        '<button class="obfc-button is-gold" type="button" id="obfc-start-battle" ' + (countryKey(target) === countryKey(profile) || s.personnel <= 0 ? 'disabled' : '') + '>START SIMULATED ENGAGEMENT</button></article>' : '') +
      '<div class="obfc-muted">' + sourceLine + ' Battle outcomes are game simulations based on force structure, equipment, readiness and terrain modifiers; they are not real-world operational forecasts.</div></section>';
  }
  function selectedAttackModifier(id) { return Number((data.catalog.terrain[id] || data.catalog.terrain.urban).attackModifier).toFixed(2); }
  function selectedDefenseModifier(id) { return Number((data.catalog.terrain[id] || data.catalog.terrain.urban).defenseModifier).toFixed(2); }
  function selectedSupplyModifier(id) { return Number((data.catalog.terrain[id] || data.catalog.terrain.urban).supplyModifier).toFixed(2); }
  function render() {
    if (!g.document) return;
    var modal = g.document.getElementById('omega-battlefield-modal-v1');
    if (!modal) return;
    var profile = currentPlayerCountry(), s = readState(profile);
    if (!uiState.targetCountry) {
      var first = data.countries.find(function (p) { return countryKey(p) !== countryKey(profile); });
      uiState.targetCountry = first ? countryKey(first) : countryKey(profile);
    }
    var panel = uiState.tab === 'procurement' ? renderProcurement(s, profile) : uiState.tab === 'budget' ? renderBudget(s, profile) :
      uiState.tab === 'battlefield' ? renderBattlefield(s, profile) : renderForces(s, profile);
    modal.innerHTML = '<div class="obfc-shell"><header class="obfc-head"><div><div class="obfc-title">OMEGA · MILITARY & BATTLEFIELD COMMAND</div><div class="obfc-sub">Active nation: ' + esc(profile.name || countryKey(profile)) + ' · Finance-connected recruitment, equipment and city/regional combat simulation</div></div><button type="button" class="obfc-close" id="obfc-close">CLOSE</button></header>' +
      '<nav class="obfc-tabs">' + tabsHtml() + '</nav>' + statusHtml() + panel +
      '<div class="obfc-muted">Data handling: recorded country/city data is shown as recorded; generated force totals, equipment ratios and rural theaters are marked as game estimates. All recruitment and procurement expenses use the Finance Ministry budget ledger.</div></div>';
    modal.classList.add('is-open'); uiState.open = true;
    modal.querySelector('#obfc-close').onclick = close;
    Array.prototype.forEach.call(modal.querySelectorAll('[data-obfc-tab]'), function (button) {
      button.onclick = function () { uiState.tab = button.getAttribute('data-obfc-tab'); setStatus('', ''); render(); };
    });
    var rec = modal.querySelector('#obfc-recruit-button');
    if (rec) {
      var q = modal.querySelector('#obfc-recruit-quantity'), costNode = modal.querySelector('#obfc-recruit-cost');
      if (q && costNode) q.oninput = function () { costNode.textContent = formatMoney((num(q.value) || 0) * data.catalog.economy.recruitmentCostPerSoldierUsd); };
      rec.onclick = function () {
        var result = recruit(q && q.value);
        setStatus(result.ok ? 'Recruited ' + Number(result.quantity).toLocaleString() + ' personnel. Treasury and Defense personnel budget were charged.' :
          'Recruitment rejected: ' + String(result.message || result.code || 'UNKNOWN_ERROR') + '. No recruitment was added.', result.ok ? 'ok' : 'error');
        render();
      };
    }
    Array.prototype.forEach.call(modal.querySelectorAll('[data-obfc-buy]'), function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-obfc-buy'), q = modal.querySelector('#obfc-buy-' + id);
        var result = purchase(id, q && q.value);
        setStatus(result.ok ? 'Procurement completed: ' + Number(result.quantity).toLocaleString() + ' × ' + id + '. Cost: ' + formatMoney(result.costUsd) + '.' :
          'Procurement rejected: ' + String(result.message || result.code || 'UNKNOWN_ERROR') + '. No equipment was added.', result.ok ? 'ok' : 'error');
        render();
      };
    });
    var targetSelect = modal.querySelector('#obfc-target-country');
    if (targetSelect) targetSelect.onchange = function () { uiState.targetCountry = targetSelect.value; uiState.theaterId = ''; render(); };
    var filter = modal.querySelector('#obfc-terrain-filter');
    if (filter) filter.onchange = function () { uiState.terrainFilter = filter.value; render(); };
    Array.prototype.forEach.call(modal.querySelectorAll('[data-obfc-theater]'), function (button) {
      button.onclick = function () { uiState.theaterId = button.getAttribute('data-obfc-theater'); render(); };
    });
    var battle = modal.querySelector('#obfc-start-battle');
    if (battle) battle.onclick = function () {
      var troops = modal.querySelector('#obfc-battle-troops'), eq = modal.querySelector('#obfc-battle-equipment');
      var result = startBattle({ targetCountry: uiState.targetCountry, theaterId: uiState.theaterId, troops: troops && troops.value, equipmentCommitmentPct: eq && eq.value });
      setStatus(result.ok ? (result.battle.outcome === 'ATTACKER_VICTORY' ? 'Victory at ' : 'Defenders held at ') + result.battle.theaterName + '. Attacker losses: ' + result.battle.attackerLosses + ', defender losses: ' + result.battle.defenderLosses + '. Battle record saved.' :
        'Battle rejected: ' + String(result.message || result.code || 'UNKNOWN_ERROR') + '.', result.ok ? 'ok' : 'error');
      render();
    };
    var budgetForm = modal.querySelector('#obfc-budget-form');
    if (budgetForm) budgetForm.onsubmit = function (event) {
      event.preventDefault();
      var plan = {};
      Array.prototype.forEach.call(modal.querySelectorAll('[data-obfc-share]'), function (input) { plan[input.getAttribute('data-obfc-share')] = input.value; });
      var result = setDefenseBudgetPlan(plan);
      setStatus(result.ok ? 'Defense sub-budget saved. Finance remains the source of the parent ceiling.' : 'Defense allocation rejected: ' + String(result.message || result.code || 'UNKNOWN_ERROR') + '.', result.ok ? 'ok' : 'error');
      render();
    };
    if (budgetForm) {
      var totalNode = modal.querySelector('#obfc-budget-total'), saveButton = modal.querySelector('#obfc-save-budget');
      var recalc = function () {
        var sum = 0;
        Array.prototype.forEach.call(modal.querySelectorAll('[data-obfc-share]'), function (input) { sum += Math.max(0, num(input.value) || 0); });
        if (totalNode) { totalNode.textContent = 'Total: ' + sum.toFixed(1) + '% of Defense budget.'; totalNode.className = 'obfc-status' + (sum > 100.0001 ? ' is-error' : ''); }
        if (saveButton) saveButton.disabled = sum > 100.0001 || sum < 0;
      };
      Array.prototype.forEach.call(modal.querySelectorAll('[data-obfc-share]'), function (input) { input.oninput = recalc; }); recalc();
    }
  }
  function open() {
    if (!ready) {
      setStatus('Country/city data or the military rules catalog has not loaded. No action is available yet.', 'error');
      if (g.document) {
        mountLauncher();
        var modal = g.document.getElementById('omega-battlefield-modal-v1');
        if (modal) { modal.innerHTML = '<div class="obfc-shell"><header class="obfc-head"><div class="obfc-title">OMEGA · MILITARY & BATTLEFIELD COMMAND</div><button id="obfc-close" class="obfc-close">CLOSE</button></header>' + statusHtml() + '</div>'; modal.classList.add('is-open'); var c = modal.querySelector('#obfc-close'); if (c) c.onclick = close; }
      }
      return;
    }
    if (!uiState.targetCountry) {
      var p = currentPlayerCountry(), first = data.countries.find(function (row) { return countryKey(row) !== countryKey(p); });
      uiState.targetCountry = first ? countryKey(first) : countryKey(p);
    }
    render();
  }
  function close() {
    var modal = g.document && g.document.getElementById('omega-battlefield-modal-v1');
    if (modal) modal.classList.remove('is-open');
    uiState.open = false;
  }
  function onTurn(event) {
    if (!ready || !data.catalog) return;
    var d = event && event.detail || {}, payload = d.payload || d, player = currentPlayerCountry();
    var eventCountry = resolveCountryRow(payload.countryId || d.countryId);
    if (eventCountry && countryKey(eventCountry) !== countryKey(player)) return;
    var nextDay = Math.floor(simTimeMs() / 86400000), state = readState(player), lastDay = num(state.lastPayrollDay);
    if (lastDay === null || lastDay < 0) { state.lastPayrollDay = nextDay; saveState(player, state); return; }
    if (nextDay <= lastDay) return;
    var elapsed = Math.min(3650, nextDay - lastDay), due = Math.max(0, state.personnel * (num(data.catalog.economy.dailyPayrollPerSoldierUsd) || 0) * elapsed);
    var payment = spendDefense(player, 'personnel', due, 'salary', 'MILITARY_PAYROLL');
    if (payment.ok) {
      state.lastPayrollDay = nextDay; state.unpaidPayrollUsd = 0;
      emit('OMEGA_MILITARY_PAYROLL_SETTLED', { countryId: countryKey(player), days: elapsed, dueUsd: due, paidUsd: due, turn: simTurn() });
    } else {
      state.unpaidPayrollUsd = Math.max(0, num(state.unpaidPayrollUsd) || 0) + due;
      state.readiness = clamp(state.readiness - Math.min(8, elapsed * 2), 10, 100);
      emit('OMEGA_MILITARY_PAYROLL_SHORTFALL', { countryId: countryKey(player), days: elapsed, dueUsd: due, paidUsd: 0, reason: payment.code || 'BUDGET_UNAVAILABLE', turn: simTurn() });
    }
    saveState(player, state);
  }
  function diagnostics() {
    var current = currentPlayerCountry();
    return Object.assign(runtimeDataDiagnostics(), {
      playerCountry: countryKey(current),
      playerCountryName: current.name || countryKey(current),
      savedCountries: (function () { var r = stateRoot(); return r && obj(r[ROOT_KEY]) ? Object.keys(r[ROOT_KEY]).length : 0; })()
    }, ready ? { cityTheatersForPlayer: buildTheaters(current).length, forceState: stateDigest(current) } : {});
  }
  var api = {
    VERSION: VERSION, init: init, diagnostics: diagnostics, open: open, close: close, getPlayerCountry: currentPlayerCountry,
    getCountryProfiles: function () { return clone(data.countries); }, getTheaters: getTheaters, getState: function (country) { var p = resolveCountryRow(country || currentPlayerCountry().iso3); return p ? stateDigest(p) : null; },
    getDetailedState: function (country) { var p = resolveCountryRow(country || currentPlayerCountry().iso3); return p ? clone(readState(p)) : null; },
    getDefenseBudgetSnapshot: function (country) { return defenseBudgetSnapshot(resolveCountryRow(country) || currentPlayerCountry()); },
    setDefenseBudgetPlan: setDefenseBudgetPlan, recruit: recruit, purchase: purchase, startBattle: startBattle,
    buildTheaters: buildTheaters, VERSION: VERSION
  };
  function init() {
    if (ready) return Promise.resolve(diagnostics());
    if (initPromise) return initPromise;
    initPromise = loadData().then(function (result) {
      if (g.document) mountLauncher();
      if (g.addEventListener && !g.__OMEGA_BATTLEFIELD_TURN_LISTENER__) {
        g.addEventListener('OMEGA_SIMULATION_TURN_COMMITTED', onTurn);
        g.__OMEGA_BATTLEFIELD_TURN_LISTENER__ = true;
      }
      return result;
    }).catch(function (error) {
      ready = false;
      return { version: VERSION, ready: false, error: String(error && error.message || error), countryCount: data.countries.length, cityCountryCount: data.cities.length };
    });
    return initPromise;
  }
  g.OmegaBattlefieldCommand = api;
  if (g.document) {
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', function () { init(); }, { once: true });
    else Promise.resolve().then(function () { init(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
