/*
 * OMEGA MINISTER INTELLIGENCE PIPELINE v1.0.0
 *
 * A single orchestration boundary for minister identity, recruitment state,
 * Bengali/English language parsing, cognitive dialogue, and conversation memory.
 * OmegaMinisterStateRegistry is the canonical state authority. The older V2
 * minister runtime remains available as a compatibility projection.
 */
(function (global) {
  'use strict';

  if (global.OmegaMinisterIntelligencePipeline && global.OmegaMinisterIntelligencePipeline.VERSION === '1.0.0') return;

  const VERSION = '1.0.0';
  const SOURCE = 'OMEGA_MINISTER_INTELLIGENCE_PIPELINE_V1';
  const syncing = new Set();
  const bridgeErrors = [];
  let legacyRef = null;
  let legacyRecruit = null;
  let legacyFire = null;
  let installed = false;
  let turnSequence = 0;

  const text = value => value == null ? '' : String(value).trim();
  const upper = value => text(value).toUpperCase();
  const clone = value => {
    if (value === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  };
  const now = () => Date.now();
  const canonical = () => global.OmegaMinisterStateRegistry || null;
  const legacy = () => global.OmegaMinisterSystem || legacyRef || null;
  const event = (name, detail) => {
    try { global.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
  };
  const canonicalActive = state => upper(state && state.runtimeState && state.runtimeState.status) === 'ACTIVE';
  const legacyActive = state => upper((state && state.runtime && state.runtime.status) || (state && state.runtimeState && state.runtimeState.status)) === 'ACTIVE';
  const stateId = state => text(state && (state.ministerId || (state.runtimeState && state.runtimeState.ministerId) || (state.runtime && state.runtime.ministerId) || (state.staticProfile && state.staticProfile.ministerId) || (state.profile && state.profile.id)));
  const countryOf = state => text(state && ((state.runtimeState && state.runtimeState.countryId) || (state.runtime && state.runtime.countryId)));
  const ministryOf = state => text(state && ((state.runtimeState && state.runtimeState.ministryId) || (state.runtime && state.runtime.ministryId) || (state.staticProfile && state.staticProfile.ministryId) || (state.profile && state.profile.ministryId)));

  function rememberError(code, error, context) {
    bridgeErrors.push({ code: code, message: text(error && error.message || error || code), context: clone(context || {}), at: now() });
    if (bridgeErrors.length > 60) bridgeErrors.splice(0, bridgeErrors.length - 60);
  }

  function toLegacyRuntime(runtime) {
    const out = clone(runtime || {});
    ['confidence', 'trust'].forEach(key => {
      if (Number(out[key]) > 1) out[key] = Number(out[key]) / 100;
    });
    return out;
  }
  function toCanonicalRuntime(runtime) {
    const out = clone(runtime || {});
    ['confidence', 'trust'].forEach(key => {
      if (Number(out[key]) > 0 && Number(out[key]) <= 1) out[key] = Number(out[key]) * 100;
    });
    return out;
  }
  function syncKey(countryId, ministryId) {
    return upper(countryId) + ':' + text(ministryId).toLowerCase();
  }
  function guarded(key, action) {
    if (!key || syncing.has(key)) return false;
    syncing.add(key);
    try { action(); }
    catch (error) { rememberError('STATE_BRIDGE_SYNC_FAILED', error, { key: key }); }
    finally { syncing.delete(key); }
    return true;
  }

  function getCanonicalState(ministerId) {
    try { return canonical() && canonical().getMinister ? canonical().getMinister(ministerId) : null; }
    catch (error) { rememberError('CANONICAL_STATE_READ_FAILED', error, { ministerId: ministerId }); return null; }
  }
  function getLegacyState(ministerId) {
    const system = legacy();
    try { return system && system.getMinister ? system.getMinister(ministerId) : null; }
    catch (error) { rememberError('LEGACY_STATE_READ_FAILED', error, { ministerId: ministerId }); return null; }
  }

  function profileForLegacy(state) {
    const source = state && (state.staticProfile || state.profile || state.identity) || {};
    return {
      ...clone(source),
      id: text(source.id || source.ministerId || stateId(state)),
      ministerId: text(source.ministerId || source.id || stateId(state)),
      name: text(source.name || source.baseName || source.regionalName || source.id || stateId(state)),
      baseName: text(source.baseName || source.name || source.regionalName || source.id || stateId(state)),
      age: source.age != null ? source.age : source.baseAge,
      baseAge: source.baseAge != null ? source.baseAge : source.age,
      stats: clone(source.stats || source.baseStats || {}),
      baseStats: clone(source.baseStats || source.stats || {}),
      efficiency: clone(source.efficiency || source.efficiencyProfile || {}),
      efficiencyProfile: clone(source.efficiencyProfile || source.efficiency || {}),
      personality: clone(source.personality || source.personalityProfile || {}),
      personalityProfile: clone(source.personalityProfile || source.personality || {}),
      regional_names: clone(source.regional_names || source.regionalNames || {}),
      regionalNames: clone(source.regionalNames || source.regional_names || {}),
      ministryId: text((state && state.runtimeState && state.runtimeState.ministryId) || source.ministryId)
    };
  }

  function syncCanonicalToLegacyCore(state) {
    const registry = canonical();
    const system = legacy();
    if (!registry || !system || !state) return;
    const ministerId = stateId(state);
    const runtime = clone(state.runtimeState || {});
    const learning = clone(state.learningState || {});
    if (!ministerId || !runtime.countryId || !runtime.ministryId || !system.registry) return;
    const local = system.registry;
    const current = system.getActive && system.getActive(runtime.countryId, runtime.ministryId);
    const currentId = stateId(current);
    const profile = profileForLegacy(state);
    if (!local.getMinister(ministerId) && local.registerProfile) local.registerProfile(profile);

    if (runtime.status === 'ACTIVE' && currentId !== ministerId) {
      if (currentId && legacyActive(current)) {
        try { if (legacyFire) legacyFire(currentId); } catch (error) { rememberError('LEGACY_REPLACEMENT_FAILED', error, { currentId: currentId, ministerId: ministerId }); }
      }
      try {
        const oldProfile = local.getMinister(ministerId);
        if (oldProfile && legacyRecruit && (!local.getRuntime(ministerId) || local.getRuntime(ministerId).status !== 'ACTIVE')) {
          legacyRecruit(ministerId, runtime.countryId, runtime.ministryId);
        } else if (local.assign && local.getRuntime(ministerId)) {
          local.assign(ministerId, runtime.countryId, runtime.ministryId, runtime.assignmentTime || now());
        }
      } catch (error) { rememberError('LEGACY_ASSIGNMENT_MIRROR_FAILED', error, { ministerId: ministerId }); }
    } else if (runtime.status !== 'ACTIVE' && currentId === ministerId) {
      try { if (legacyFire) legacyFire(ministerId); } catch (error) { rememberError('LEGACY_DISMISSAL_MIRROR_FAILED', error, { ministerId: ministerId }); }
    }

    if (local.getRuntime && local.setRuntime && local.getRuntime(ministerId)) {
      local.setRuntime(ministerId, toLegacyRuntime(runtime));
      if (local.setLearning && local.getLearning && local.getLearning(ministerId)) {
        const learningPatch = {};
        ['totalServiceTime', 'totalTaskExposure', 'domainExperience', 'crisisExperience', 'decisionExperience', 'successfulDecisions', 'failedDecisions', 'completedPlans', 'failedPlans', 'learnedLessons', 'forecastCalibration', 'strategyEffectiveness', 'skillEvolution', 'specialization', 'trainingHours', 'lastLearningAt'].forEach(key => {
          if (learning[key] !== undefined) learningPatch[key] = clone(learning[key]);
        });
        local.setLearning(ministerId, learningPatch);
      }
      try { system.persist && system.persist(); system.synchronize && system.synchronize(); } catch (_) {}
    }
  }

  function syncCanonicalToLegacy(state) {
    const runtime = state && state.runtimeState || {};
    return guarded(syncKey(runtime.countryId, runtime.ministryId), () => syncCanonicalToLegacyCore(state));
  }

  function syncLegacyToCanonicalCore(ministerId) {
    const registry = canonical();
    const system = legacy();
    const old = getLegacyState(ministerId);
    if (!registry || !system || !old) return;
    const runtime = old.runtime || old.runtimeState || {};
    const countryId = text(runtime.countryId);
    const ministryId = text(runtime.ministryId || (old.profile && old.profile.ministryId));
    if (!countryId || !ministryId) return;
    const key = syncKey(countryId, ministryId);
    let current = registry.getActiveMinister && registry.getActiveMinister(countryId, ministryId);
    let currentId = stateId(current);

    if (runtime.status === 'ACTIVE' && currentId !== text(ministerId)) {
      if (currentId && canonicalActive(current)) {
        rememberError('LEGACY_CANONICAL_ASSIGNMENT_CONFLICT', 'Canonical assignment retained; legacy runtime differs.', { countryId: countryId, ministryId: ministryId, canonicalMinisterId: currentId, legacyMinisterId: ministerId });
        syncCanonicalToLegacyCore(current);
        return;
      }
      const profile = profileForLegacy(old);
      if (registry.recruitCandidate) {
        try { registry.recruitCandidate(profile, countryId, ministryId, runtime.assignmentTime || global.Game && global.Game.gameTime || 0); }
        catch (error) {
          if (text(error.message) !== 'MINISTRY_ALREADY_ASSIGNED') rememberError('CANONICAL_RECRUITMENT_MIRROR_FAILED', error, { ministerId: ministerId, countryId: countryId, ministryId: ministryId });
          current = registry.getActiveMinister && registry.getActiveMinister(countryId, ministryId);
          if (current && stateId(current) !== text(ministerId)) syncCanonicalToLegacyCore(current);
          return;
        }
      }
    } else if (runtime.status !== 'ACTIVE' && currentId === text(ministerId)) {
      try { registry.removeMinister(ministerId, 'FIRED', runtime.lastUpdateTick || global.Game && global.Game.gameTime || 0); }
      catch (error) { rememberError('CANONICAL_DISMISSAL_MIRROR_FAILED', error, { ministerId: ministerId }); }
      return;
    }

    const canonicalState = registry.getMinister && registry.getMinister(ministerId);
    if (canonicalActive(canonicalState)) {
      const patch = {};
      ['workload', 'cognitiveLoad', 'stress', 'fatigue', 'politicalPressure', 'economicPressure', 'crisisPressure', 'activeTasks', 'activePlans', 'pendingDecisions', 'currentObjectives', 'currentAttention', 'currentStrategicPosture', 'lastUpdateTick'].forEach(key => {
        if (runtime[key] !== undefined) patch[key] = clone(runtime[key]);
      });
      ['confidence', 'trust'].forEach(key => {
        if (runtime[key] !== undefined) patch[key] = Number(runtime[key]) > 0 && Number(runtime[key]) <= 1 ? Number(runtime[key]) * 100 : runtime[key];
      });
      try { registry.updateRuntimeState && registry.updateRuntimeState(ministerId, patch, 'LEGACY_RUNTIME_MIRROR'); }
      catch (error) { rememberError('CANONICAL_RUNTIME_MIRROR_FAILED', error, { ministerId: ministerId }); }
      const learning = old.learning || old.learningState || {};
      const learningPatch = {};
      ['totalServiceTime', 'totalTaskExposure', 'domainExperience', 'crisisExperience', 'decisionExperience', 'successfulDecisions', 'failedDecisions', 'completedPlans', 'failedPlans', 'learnedLessons', 'forecastCalibration', 'strategyEffectiveness', 'skillEvolution', 'specialization', 'trainingHours', 'lastLearningAt'].forEach(key => {
        if (learning[key] !== undefined) learningPatch[key] = clone(learning[key]);
      });
      try { registry.updateLearningState && registry.updateLearningState(ministerId, learningPatch); }
      catch (error) { rememberError('CANONICAL_LEARNING_MIRROR_FAILED', error, { ministerId: ministerId }); }
    }
  }

  function syncLegacyToCanonical(ministerId) {
    const old = getLegacyState(ministerId);
    const runtime = old && (old.runtime || old.runtimeState) || {};
    return guarded(syncKey(runtime.countryId, runtime.ministryId || (old && old.profile && old.profile.ministryId)), () => syncLegacyToCanonicalCore(ministerId));
  }

  function syncAllCanonicalToLegacy() {
    const registry = canonical();
    if (!registry || !registry.getRegistry) return;
    for (const state of registry.getRegistry().values()) {
      syncCanonicalToLegacy({
        ministerId: state.identity && state.identity.ministerId,
        staticProfile: state.identity,
        runtimeState: state.runtime,
        learningState: state.learning,
        memoryState: state.memory
      });
    }
  }

  function getActiveMinister(countryId, ministryId, preferredId) {
    const registry = canonical();
    const system = legacy();
    const preferred = text(preferredId);
    if (preferred) {
      const state = getCanonicalState(preferred);
      if (canonicalActive(state)) return state;
      const old = getLegacyState(preferred);
      if (legacyActive(old)) return old;
      return null;
    }
    if (registry && registry.getActiveMinister && countryId && ministryId) {
      try {
        const state = registry.getActiveMinister(countryId, ministryId);
        if (canonicalActive(state)) return state;
      } catch (error) { rememberError('CANONICAL_ASSIGNMENT_LOOKUP_FAILED', error, { countryId: countryId, ministryId: ministryId }); }
    }
    if (system && system.getActive && countryId && ministryId) {
      try {
        const state = system.getActive(countryId, ministryId);
        if (legacyActive(state)) return state;
      } catch (error) { rememberError('LEGACY_ASSIGNMENT_LOOKUP_FAILED', error, { countryId: countryId, ministryId: ministryId }); }
    }
    return null;
  }

  function readHistory(ministerId) {
    const registry = canonical();
    if (!ministerId || !registry || !registry.retrieveMemory) return [];
    try { return (registry.retrieveMemory(ministerId, 'relational', 12) || []).map(clone); }
    catch (_) { return []; }
  }

  function resolveContext(overrides) {
    const extra = overrides && typeof overrides === 'object' ? overrides : {};
    const game = global.Game || {};
    const gameState = game.state || global.gameState || global.Omega && global.Omega.World && global.Omega.World.state || {};
    const ui = global.OmegaCabinetUI || {};
    const selected = ui.currentInterrogatedMinister || ui.currentMinister || ui.activeMinister || {};
    const activeGameCountry = typeof game.currentActiveCountry === 'string'
      ? game.currentActiveCountry
      : game.currentActiveCountry && (game.currentActiveCountry.iso3 || game.currentActiveCountry.iso);
    const countryId = text(extra.countryId || extra.countryCode || selected.countryCode || gameState.countryCode || gameState.countryId || gameState.playerCountryId || game.countryCode || activeGameCountry || ui.activeCountry);
    const countryName = text(extra.countryName || gameState.countryName || gameState.country && gameState.country.name || ui.activeCountry);
    const ministryId = text(extra.ministryId || selected.ministryId || ui.currentMinistryId || '');
    const preferred = text(extra.ministerId || selected.ministerId || selected.id || ui.currentMinisterId || '');
    const active = getActiveMinister(countryId, ministryId, preferred);
    const profile = active && (active.staticProfile || active.profile) || {};
    const runtime = active && (active.runtimeState || active.runtime) || {};
    const ministerId = stateId(active);
    const resolvedCountry = countryId || text(runtime.countryId);
    const resolvedMinistry = ministryId || text(runtime.ministryId || profile.ministryId);
    const history = Array.isArray(extra.history) ? extra.history.slice(-12) : readHistory(ministerId);
    let countryDetails = gameState;
    try { if (ui.getCountryDetails && resolvedCountry) countryDetails = ui.getCountryDetails(resolvedCountry) || gameState; } catch (_) {}
    const resolvedDetails = clone(extra.countryDetails || countryDetails || gameState || {});
    if (resolvedDetails && typeof resolvedDetails === 'object' && !Array.isArray(resolvedDetails)) {
      if (!resolvedDetails.countryCode) resolvedDetails.countryCode = resolvedCountry;
      if (!resolvedDetails.countryId) resolvedDetails.countryId = resolvedCountry;
      if (!resolvedDetails.name) resolvedDetails.name = countryName || resolvedCountry;
      if (!resolvedDetails.countryName) resolvedDetails.countryName = countryName || resolvedCountry;
    }
    return {
      countryId: resolvedCountry,
      countryCode: resolvedCountry,
      countryName: countryName,
      ministryId: resolvedMinistry,
      ministerId: ministerId,
      ministerName: text(profile.name || profile.baseName || selected.ministerName || selected.name || ministerId),
      ministerRole: text(extra.ministerRole || selected.role || selected.title || ui.ministriesDatabase && ui.ministriesDatabase[resolvedMinistry] && ui.ministriesDatabase[resolvedMinistry].role || profile.role),
      ministerProfile: clone(profile),
      ministerRuntime: clone(runtime),
      ministerLearning: clone(active && (active.learningState || active.learning) || {}),
      ministerMemory: clone(active && (active.memoryState || active.memory) || {}),
      effectiveCapability: active && active.effectiveCapability != null ? active.effectiveCapability : null,
      isActiveMinister: !!active && (canonicalActive(active) || legacyActive(active)),
      activeMinister: active,
      gameState: clone(extra.gameState || gameState || {}),
      countryDetails: resolvedDetails,
      history: history,
      language: text(extra.language || '')
    };
  }

  async function prepareLanguage(question, context) {
    const system = global.OmegaLanguageSystem;
    const languageContext = {
      countryId: context.countryId,
      countryName: context.countryName,
      ministryId: context.ministryId,
      ministerId: context.ministerId,
      ministerName: context.ministerName,
      ministerRole: context.ministerRole,
      gameState: context.gameState
    };
    const isBengali = /[\u0980-\u09FF]/.test(question);
    if (!system || typeof system.parse !== 'function') {
      return { parsed: { raw: question, surface: question, language: isBengali ? 'bn' : 'en', operation: 'CONVERSATION', targetDomain: 'MINISTER' }, language: isBengali ? 'bn' : 'en', ready: false };
    }
    try {
      if (typeof system.diagnostics === 'function' && system.diagnostics().ready !== true && typeof system.load === 'function') await system.load();
      if (system.setContext) system.setContext(languageContext);
      const parsed = system.parse(question, languageContext) || {};
      return { parsed: parsed, language: text(parsed.language || (isBengali ? 'bn' : 'en')), ready: true };
    } catch (error) {
      rememberError('LANGUAGE_PARSE_FAILED', error, { ministerId: context.ministerId });
      return { parsed: { raw: question, surface: question, language: isBengali ? 'bn' : 'en', operation: 'CONVERSATION', targetDomain: 'MINISTER' }, language: isBengali ? 'bn' : 'en', ready: false };
    }
  }

  function ministerPayload(context, analysis) {
    const profile = context.ministerProfile || {};
    const stats = clone(profile.stats || profile.baseStats || {});
    const efficiencyProfile = clone(profile.efficiencyProfile || (profile.efficiency && typeof profile.efficiency === 'object' ? profile.efficiency : {}));
    const efficiencyValues = Object.values(efficiencyProfile || {}).map(Number).filter(value => Number.isFinite(value));
    const explicitEfficiency = typeof profile.efficiency === 'number' ? profile.efficiency :
      Number.isFinite(Number(profile.efficiencyScore)) ? Number(profile.efficiencyScore) :
      Number.isFinite(Number(context.effectiveCapability)) ? Number(context.effectiveCapability) : null;
    const efficiency = explicitEfficiency !== null ? explicitEfficiency :
      (efficiencyValues.length ? efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length : 75);
    const name = context.ministerName || profile.name || profile.baseName || context.ministerId;
    const role = context.ministerRole || profile.role || context.ministryId;
    return {
      ...clone(profile),
      id: context.ministerId,
      ministerId: context.ministerId,
      name: name,
      ministerName: name,
      title: role,
      ministryId: context.ministryId,
      role: role,
      countryId: context.countryId,
      countryCode: context.countryCode,
      stats: stats,
      baseStats: clone(profile.baseStats || stats),
      efficiency: efficiency,
      efficiencyProfile: efficiencyProfile,
      personality: clone(profile.personality || profile.personalityProfile || {}),
      ideology: clone(profile.ideology || {}),
      runtime: clone(context.ministerRuntime || {}),
      learning: clone(context.ministerLearning || {}),
      memory: clone(context.ministerMemory || {}),
      recentConversation: (context.history || []).slice(-12),
      effectiveCapability: context.effectiveCapability,
      parsedIntent: clone(analysis.parsed || {}),
      language: analysis.language,
      persona: clone(profile)
    };
  }

  function extractText(value, depth) {
    const level = depth || 0;
    if (level > 5 || value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value !== 'object') return '';
    const direct = ['text', 'answer', 'response', 'reply', 'message', 'summary', 'content', 'briefing', 'conclusion', 'recommendation'];
    for (const key of direct) if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
    for (const key of ['result', 'data', 'output', 'responseData', 'cognitive', 'dialogue']) {
      const found = extractText(value[key], level + 1);
      if (found) return found;
    }
    return '';
  }

  async function invokeCognitive(question, context, analysis) {
    let engine = global.OmegaCognitiveOS || global.OmegaCognitiveEngine || global.OmegaSharedCognition;
    if (!engine && typeof document !== 'undefined') {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/omega_cognitive_engine.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('COGNITIVE_ENGINE_SCRIPT_LOAD_FAILED'));
          document.head.appendChild(script);
        });
      } catch (error) { rememberError('COGNITIVE_ENGINE_LOAD_FAILED', error, {}); }
      engine = global.OmegaCognitiveOS || global.OmegaCognitiveEngine || global.OmegaSharedCognition;
    }
    if (!engine) return { ok: false, status: 'COGNITIVE_ENGINE_UNAVAILABLE', text: '', raw: null };
    const minister = ministerPayload(context, analysis);
    let lastError = null;
    for (const method of ['askMinisterWithAI', 'thinkMinisterQuestion']) {
      if (typeof engine[method] !== 'function') continue;
      try {
        const raw = await engine[method](question, minister, context.countryId || context.countryCode || 'NATIONAL_SOVEREIGN', context.countryDetails || context.gameState || {});
        const answer = extractText(raw);
        if (answer) return { ok: true, status: 'ANSWERED', text: answer, raw: raw, method: method };
        lastError = new Error(method + '_RETURNED_NO_TEXT');
      } catch (error) {
        lastError = error;
        rememberError('COGNITIVE_DIALOGUE_FAILED', error, { ministerId: context.ministerId, method: method });
      }
    }
    const dispatcher = global.OmegaReasoningDispatcher;
    if (dispatcher && dispatcher.dispatch && analysis && analysis.parsed) {
      try {
        const result = dispatcher.dispatch(question, analysis.parsed, {
          ok: true,
          status: 'MINISTER_CONVERSATION_CONTEXT',
          value: null,
          evidence: [],
          minister: { id: context.ministerId, ministryId: context.ministryId },
          context: { countryId: context.countryId, ministryId: context.ministryId }
        }, {
          countryId: context.countryId,
          countryCode: context.countryCode,
          countryName: context.countryName,
          ministryId: context.ministryId,
          ministerId: context.ministerId,
          language: analysis.language,
          persona: minister,
          gameState: context.gameState,
          history: context.history,
          timeHorizon: 'CURRENT'
        });
        const answer = extractText(result);
        if (answer) return { ok: true, status: 'ANSWERED_BY_REASONING_FALLBACK', text: answer, raw: result, method: 'OMEGA_REASONING_DISPATCHER' };
      } catch (error) { lastError = error; rememberError('REASONING_FALLBACK_FAILED', error, { ministerId: context.ministerId }); }
    }
    return { ok: false, status: lastError ? 'COGNITIVE_RESPONSE_UNAVAILABLE' : 'COGNITIVE_DIALOGUE_METHOD_UNAVAILABLE', text: '', raw: null, error: lastError && lastError.message || null };
  }

  function storeConversation(context, question, answer, analysis, response) {
    const registry = canonical();
    const ministerId = context.ministerId;
    if (!registry || !ministerId) return null;
    const turnId = 'MINISTER-TURN-' + now() + '-' + (++turnSequence);
    const timestamp = now();
    const userMessage = {
      messageId: turnId + '-USER',
      role: 'user',
      speaker: 'PLAYER',
      channel: 'MINISTER_CONVERSATION',
      countryId: context.countryId,
      ministryId: context.ministryId,
      language: analysis.language,
      content: question,
      intent: text(analysis.parsed && (analysis.parsed.operation || analysis.parsed.intent) || 'CONVERSATION'),
      timestamp: timestamp
    };
    const ministerMessage = {
      messageId: turnId + '-MINISTER',
      role: 'assistant',
      speaker: 'MINISTER',
      channel: 'MINISTER_CONVERSATION',
      countryId: context.countryId,
      ministryId: context.ministryId,
      language: analysis.language,
      content: answer,
      status: response.status,
      source: response.method || SOURCE,
      timestamp: now()
    };
    try { registry.sendMessage && registry.sendMessage(ministerId, userMessage); }
    catch (error) { rememberError('USER_MESSAGE_MEMORY_WRITE_FAILED', error, { ministerId: ministerId }); }
    try { registry.sendMessage && registry.sendMessage(ministerId, ministerMessage); }
    catch (error) { rememberError('MINISTER_MESSAGE_MEMORY_WRITE_FAILED', error, { ministerId: ministerId }); }
    try {
      registry.storeEpisode && registry.storeEpisode(ministerId, {
        type: 'MINISTER_CONVERSATION',
        turnId: turnId,
        countryId: context.countryId,
        ministryId: context.ministryId,
        intent: userMessage.intent,
        userMessageId: userMessage.messageId,
        ministerMessageId: ministerMessage.messageId,
        language: analysis.language,
        status: response.status,
        timestamp: timestamp
      });
    } catch (error) { rememberError('CONVERSATION_EPISODE_WRITE_FAILED', error, { ministerId: ministerId }); }
    return { turnId: turnId, userMessage: userMessage, ministerMessage: ministerMessage };
  }

  function localizedUnavailable(language) {
    return language === 'bn'
      ? 'মন্ত্রী-সংলাপের জ্ঞানীয় ইঞ্জিন নির্ভরযোগ্য উত্তর দিতে পারেনি। কোনো তথ্য বানিয়ে দেওয়া হয়নি; মন্ত্রী ইন্টেলিজেন্স ডায়াগনস্টিক পরীক্ষা করুন।'
      : 'The minister dialogue engine could not produce a grounded answer. No answer was fabricated; inspect the minister intelligence diagnostics.';
  }

  async function ask(question, overrides) {
    const prompt = text(question);
    if (!prompt) return { ok: false, status: 'EMPTY_INPUT', text: '', source: SOURCE };
    const context = resolveContext(overrides || {});
    if (!context.ministerId || !context.isActiveMinister) {
      const bn = /[\u0980-\u09FF]/.test(prompt);
      return {
        ok: false,
        status: 'MINISTER_NOT_ACTIVE',
        text: bn ? 'এই মন্ত্রণালয়ে সক্রিয় মন্ত্রী পাওয়া যায়নি। আগে একজন মন্ত্রী নিয়োগ করুন।' : 'No active minister is assigned to this ministry. Recruit a minister first.',
        source: SOURCE,
        context: { countryId: context.countryId, ministryId: context.ministryId }
      };
    }
    const analysis = await prepareLanguage(prompt, context);
    context.language = analysis.language;
    context.history = readHistory(context.ministerId).slice(-12);
    const response = await invokeCognitive(prompt, context, analysis);
    if (!response.ok || !response.text) {
      return {
        ok: false,
        status: response.status,
        text: localizedUnavailable(analysis.language),
        error: response.error || null,
        source: SOURCE,
        analysis: clone(analysis.parsed),
        diagnostics: diagnostics()
      };
    }
    const memory = storeConversation(context, prompt, response.text, analysis, response);
    const result = {
      ok: true,
      status: response.status,
      text: response.text,
      language: analysis.language,
      source: SOURCE,
      route: ['OMEGA_LANGUAGE_SYSTEM', 'CANONICAL_MINISTER_STATE', 'OMEGA_COGNITIVE_OS', 'MINISTER_RELATIONAL_MEMORY'],
      analysis: clone(analysis.parsed),
      minister: { id: context.ministerId, name: context.ministerName, ministryId: context.ministryId, capability: context.effectiveCapability },
      cognitiveMethod: response.method || null,
      conversation: memory,
      raw: response.raw
    };
    event('OMEGA_MINISTER_CONVERSATION_COMPLETED', { ...result, raw: undefined });
    return result;
  }

  function shouldHandleQuestion(overrides, question) {
    if (!text(question)) return false;
    const context = resolveContext(overrides || {});
    return !!(context.ministerId && context.isActiveMinister);
  }

  function onCanonicalRecruit(eventObject) {
    const detail = eventObject && eventObject.detail || {};
    const ministerId = text(detail.ministerId);
    if (!ministerId) return;
    const state = getCanonicalState(ministerId);
    const runtime = state && state.runtimeState || {};
    if (state && canonicalActive(state) && runtime.countryId && runtime.ministryId) {
      guarded(syncKey(runtime.countryId, runtime.ministryId), () => syncCanonicalToLegacyCore(state));
      return;
    }
    const old = getLegacyState(ministerId);
    if (legacyActive(old)) syncLegacyToCanonical(ministerId);
  }

  function onCanonicalSync(eventObject) {
    const detail = eventObject && eventObject.detail || {};
    const state = detail.effective || getCanonicalState(detail.ministerId);
    if (!state) return;
    const runtime = state.runtimeState || {};
    if (runtime.countryId && runtime.ministryId) guarded(syncKey(runtime.countryId, runtime.ministryId), () => syncCanonicalToLegacyCore(state));
  }

  function onLegacyRecruit(eventObject) {
    const detail = eventObject && eventObject.detail || {};
    const ministerId = text(detail.ministerId);
    const countryId = text(detail.countryId);
    const ministryId = text(detail.ministryId);
    if (!ministerId || !countryId || !ministryId) return;
    const key = syncKey(countryId, ministryId);
    guarded(key, () => {
      const current = canonical() && canonical().getActiveMinister && canonical().getActiveMinister(countryId, ministryId);
      if (current && canonicalActive(current)) syncCanonicalToLegacyCore(current);
      else syncLegacyToCanonicalCore(ministerId);
    });
  }

  function onLegacyFire(eventObject) {
    const detail = eventObject && eventObject.detail || {};
    const ministerId = text(detail.ministerId);
    if (!ministerId) return;
    const state = getCanonicalState(ministerId);
    const old = getLegacyState(ministerId);
    const runtime = state && state.runtimeState || old && (old.runtime || old.runtimeState) || detail;
    const key = syncKey(runtime.countryId || detail.countryId, runtime.ministryId || detail.ministryId);
    guarded(key, () => {
      const isCanonicalEvent = !!(detail.previousRuntime || state && !canonicalActive(state) && !legacyActive(old));
      if (isCanonicalEvent || !legacyActive(old)) {
        if (legacyActive(old) && legacyFire) {
          try { legacyFire(ministerId); } catch (error) { rememberError('LEGACY_DISMISSAL_MIRROR_FAILED', error, { ministerId: ministerId }); }
        }
      } else if (canonicalActive(state)) {
        try { canonical().removeMinister(ministerId, 'FIRED', detail.timestamp || global.Game && global.Game.gameTime || 0); }
        catch (error) { rememberError('CANONICAL_DISMISSAL_MIRROR_FAILED', error, { ministerId: ministerId }); }
      }
    });
  }

  function installLegacyFacade() {
    const system = legacy();
    const registry = canonical();
    if (!system || !registry || system.__ministerIntelligenceFacadeV1) return false;
    legacyRef = system;
    legacyRecruit = typeof system.recruit === 'function' ? system.recruit.bind(system) : null;
    legacyFire = typeof system.fire === 'function' ? system.fire.bind(system) : null;
    system.__ministerIntelligenceFacadeV1 = true;
    if (legacyRecruit) {
      system.recruit = function recruitThroughCanonicalAuthority(ministerId, countryId, ministryId) {
        const cc = text(countryId || resolveContext().countryId);
        const ministry = text(ministryId);
        if (!cc || !ministry || !registry.recruitCandidate) throw new Error('MINISTER_CANONICAL_REGISTRY_UNAVAILABLE');
        const current = registry.getActiveMinister && registry.getActiveMinister(cc, ministry);
        if (current && stateId(current) !== text(ministerId)) throw new Error('MINISTRY_ALREADY_ASSIGNED');
        if (current && stateId(current) === text(ministerId)) return current;
        const candidate = system.getCandidates && system.getCandidates(ministry).find(row => text(row.id) === text(ministerId));
        if (!candidate) throw new Error('CANDIDATE_NOT_FOUND');
        return registry.recruitCandidate({ ...clone(candidate), name: candidate.name || candidate.baseName || candidate.id }, cc, ministry, global.Game && global.Game.gameTime || 0);
      };
    }
    if (legacyFire) {
      system.fire = function fireThroughCanonicalAuthority(ministerId) {
        const state = registry.getMinister && registry.getMinister(ministerId);
        if (canonicalActive(state)) return registry.removeMinister(ministerId, 'FIRED', global.Game && global.Game.gameTime || 0);
        return legacyFire(ministerId);
      };
    }
    syncAllCanonicalToLegacy();
    return true;
  }

  function onLegacyReady() {
    installLegacyFacade();
    syncAllCanonicalToLegacy();
  }
  function onLanguageReady() {
    const context = resolveContext();
    if (global.OmegaLanguageSystem && global.OmegaLanguageSystem.setContext) {
      try {
        global.OmegaLanguageSystem.setContext({
          countryId: context.countryId, countryName: context.countryName,
          ministryId: context.ministryId, ministerId: context.ministerId,
          ministerName: context.ministerName, ministerRole: context.ministerRole,
          gameState: context.gameState
        });
      } catch (error) { rememberError('LANGUAGE_CONTEXT_SYNC_FAILED', error, {}); }
    }
  }

  function install() {
    if (installed || typeof global.addEventListener !== 'function') return;
    installed = true;
    global.addEventListener('OMEGA_MINISTER_RUNTIME_READY', onLegacyReady);
    global.addEventListener('MINISTER_RECRUITED', onCanonicalRecruit);
    global.addEventListener('MINISTER_ASSIGNED', onCanonicalRecruit);
    global.addEventListener('MINISTER_FIRED', onLegacyFire);
    global.addEventListener('MINISTER_SYSTEM_SYNCHRONIZED', onCanonicalSync);
    global.addEventListener('OMEGA_LANGUAGE_SYSTEM_READY', onLanguageReady);
    ['MINISTER_STATE_UPDATED', 'MINISTER_RUNTIME_CHANGED', 'MINISTER_LEARNING_CHANGED', 'MINISTER_TASK_STARTED', 'MINISTER_TASK_FINISHED', 'MINISTER_PRESSURE_CHANGED', 'MINISTER_WORKLOAD_UPDATED', 'MINISTER_STRESS_UPDATED'].forEach(name => {
      global.addEventListener(name, eventObject => {
        const detail = eventObject && eventObject.detail || {};
        if (detail.ministerId && getLegacyState(detail.ministerId)) syncLegacyToCanonical(detail.ministerId);
      });
    });
    installLegacyFacade();
    onLanguageReady();
  }

  function diagnostics() {
    const context = resolveContext();
    const registry = canonical();
    const system = legacy();
    let languageReady = false;
    try { languageReady = !!global.OmegaLanguageSystem && (global.OmegaLanguageSystem.diagnostics && global.OmegaLanguageSystem.diagnostics().ready === true || global.__OMEGA_LANGUAGE_SYSTEM_READY__ === true); } catch (_) {}
    return {
      version: VERSION,
      ready: !!registry && installed,
      canonicalRegistryAvailable: !!registry,
      legacyRuntimeAvailable: !!system,
      legacyFacadeInstalled: !!(system && system.__ministerIntelligenceFacadeV1),
      languageSystemAvailable: !!global.OmegaLanguageSystem,
      languageRuntimeReady: languageReady,
      cognitiveEngineAvailable: !!(global.OmegaCognitiveOS || global.OmegaCognitiveEngine || global.OmegaSharedCognition),
      communicationEngineAvailable: !!global.OmegaMinisterCommunication,
      activeMinister: context.ministerId || null,
      activeMinistry: context.ministryId || null,
      stateStores: { canonicalAuthority: 'OmegaMinisterStateRegistry', compatibilityProjection: 'OmegaMinisterSystem.registry' },
      bridgeErrors: bridgeErrors.slice(-20)
    };
  }

  const api = Object.freeze({
    VERSION: VERSION,
    ask: ask,
    shouldHandleQuestion: shouldHandleQuestion,
    resolveContext: resolveContext,
    getActiveMinister: getActiveMinister,
    prepareLanguage: prepareLanguage,
    installLegacyFacade: installLegacyFacade,
    sync: syncAllCanonicalToLegacy,
    diagnostics: diagnostics
  });
  global.OmegaMinisterIntelligencePipeline = api;
  install();
  event('OMEGA_MINISTER_INTELLIGENCE_PIPELINE_READY', diagnostics());
})(typeof window !== 'undefined' ? window : globalThis);
