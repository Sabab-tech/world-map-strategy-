/* OMEGA shared action-progress surface.
 * A truthful, non-blocking loader for explicit long-running actions and legacy ministry controls.
 */
(function (g) {
  'use strict';

  if (g.OmegaActionProgress && g.OmegaActionProgress.__omegaV1) return;
  var serial = 0;
  var current = null;
  var root = null;
  var styleId = 'omega-action-progress-style-v1';
  var rootId = 'omega-action-progress-v1';
  var WORKING = /working|loading|pending|processing|validating|saving|submitting|starting|building|constructing|running|please wait|চলছে|অপেক্ষা|তৈরি হচ্ছে|সংরক্ষণ হচ্ছে/i;
  var MUTATING = /execute|submit|create|build|start|stop|launch|sign|approve|transfer|purchase|recruit|deploy|research|trade|train|construct|upgrade|negotiate|order|assign|accept|reject|vote|invest|change.?policy|apply|implement|configure|enact|issue|establish|amend|mobilize|budget|policy|set.?policy|set.?|save|delete|remove|extract|commission|authorize|settle|import|export|produce|production|mine|factory|treaty|project|operation|action|command|run|send|dispatch|confirm|hire|fire|fund|allocate|reform|repair|expand|activate|refresh|reload|sync|update|recalculate|reconcile|download/i;
  var NAVIGATION = /^(back|back-to-map|exit|close|cancel|dismiss|tab-[\w-]+|open-panel|focus-map|focus-site)$/i;

  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function escapeHTML(value) {
    return text(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }
  function ensureSurface() {
    if (!g.document) return null;
    if (!g.document.getElementById(styleId)) {
      var style = g.document.createElement('style');
      style.id = styleId;
      style.textContent =
        '#omega-action-progress-v1{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translate(-50%,-150%);opacity:0;z-index:2147482000;width:min(560px,calc(100vw - 20px));padding:10px 12px 9px;border:1px solid #496782;border-radius:10px;background:rgba(7,20,34,.97);box-shadow:0 12px 36px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.08);color:#eaf4fc;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:none;transition:transform .16s ease,opacity .16s ease;box-sizing:border-box}' +
        '#omega-action-progress-v1.is-visible{transform:translate(-50%,0);opacity:1}' +
        '#omega-action-progress-v1 *{box-sizing:border-box}' +
        '#omega-action-progress-v1 .oap-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}' +
        '#omega-action-progress-v1 .oap-title{font-size:11px;font-weight:850;letter-spacing:.07em;text-transform:uppercase;color:#b9dff7;min-width:0;overflow-wrap:anywhere}' +
        '#omega-action-progress-v1 .oap-value{flex:0 0 auto;color:#e7f4ff;font-size:11px;font-variant-numeric:tabular-nums}' +
        '#omega-action-progress-v1 .oap-detail{margin-top:3px;color:#b5c7d8;overflow-wrap:anywhere}' +
        '#omega-action-progress-v1 .oap-track{height:4px;margin-top:8px;border-radius:20px;background:#24394e;overflow:hidden}' +
        '#omega-action-progress-v1 .oap-fill{display:block;width:34%;height:100%;border-radius:20px;background:linear-gradient(90deg,#4da6dc,#8bd6ef);transform:translateX(-120%);animation:oap-slide 1s ease-in-out infinite}' +
        '#omega-action-progress-v1[data-mode="determinate"] .oap-fill{width:0;transform:none;animation:none;transition:width .14s linear}' +
        '#omega-action-progress-v1[data-state="complete"] .oap-fill{width:100%;transform:none;animation:none;background:#6bc6a5}' +
        '#omega-action-progress-v1[data-state="error"]{border-color:#9d5959}' +
        '#omega-action-progress-v1[data-state="error"] .oap-title{color:#ffcece}' +
        '#omega-action-progress-v1[data-state="error"] .oap-fill{width:100%;transform:none;animation:none;background:#d87979}' +
        '@keyframes oap-slide{0%{transform:translateX(-120%)}100%{transform:translateX(340%)}}' +
        '@media(prefers-reduced-motion:reduce){#omega-action-progress-v1{transition:none}#omega-action-progress-v1 .oap-fill{animation:none;transform:none;width:100%}}';
      (g.document.head || g.document.documentElement).appendChild(style);
    }
    root = g.document.getElementById(rootId);
    if (!root) {
      root = g.document.createElement('section');
      root.id = rootId;
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      root.setAttribute('aria-hidden', 'true');
      root.setAttribute('data-state', 'idle');
      root.innerHTML =
        '<div class="oap-head"><strong class="oap-title" data-oap-title>WORKING</strong>' +
        '<span class="oap-value" data-oap-value>In progress</span></div>' +
        '<div class="oap-detail" data-oap-detail>Preparing action…</div>' +
        '<div class="oap-track" role="progressbar" aria-label="Action progress" aria-valuemin="0" aria-valuemax="100">' +
        '<span class="oap-fill" data-oap-fill></span></div>';
      (g.document.body || g.document.documentElement).appendChild(root);
    }
    return root;
  }
  function node(selector) {
    var el = ensureSurface();
    return el && el.querySelector(selector);
  }
  function clearTimers(job) {
    if (!job || !Array.isArray(job.timers)) return;
    job.timers.forEach(function (id) { try { g.clearTimeout(id); } catch (_) {} });
    job.timers.length = 0;
  }
  function later(job, callback, delay) {
    if (!job || job.closed) return null;
    var id = g.setTimeout(function () {
      if (job.currentId !== serial || job.closed) return;
      var at = job.timers.indexOf(id);
      if (at >= 0) job.timers.splice(at, 1);
      callback();
    }, delay);
    job.timers.push(id);
    return id;
  }
  function paint() {
    return new Promise(function (resolve) {
      var raf = typeof g.requestAnimationFrame === 'function' ? g.requestAnimationFrame.bind(g) : function (fn) { return g.setTimeout(fn, 16); };
      raf(function () { raf(resolve); });
    });
  }
  function setState(job, state, title, detail) {
    if (!job || job.id !== serial || current !== job || job.closed) return false;
    var el = ensureSurface();
    if (!el) return false;
    el.classList.add('is-visible');
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-busy', state === 'working' ? 'true' : 'false');
    el.setAttribute('data-state', state);
    var titleEl = el.querySelector('[data-oap-title]');
    var detailEl = el.querySelector('[data-oap-detail]');
    if (titleEl && title != null) titleEl.textContent = text(title);
    if (detailEl && detail != null) detailEl.textContent = text(detail);
    var value = el.querySelector('[data-oap-value]');
    if (value) value.textContent = job.percent === null ? (state === 'working' ? 'In progress' : (state === 'complete' ? 'Complete' : 'Needs attention')) : Math.round(job.percent) + '%';
    return true;
  }
  function handleFor(job) {
    function active() { return current === job && job.id === serial && !job.closed; }
    return {
      id: job.id,
      setPhase: function (detail, title) {
        if (!active()) return false;
        job.percent = null;
        var el = ensureSurface();
        if (el) {
          el.setAttribute('data-mode', 'indeterminate');
          var bar = el.querySelector('[role="progressbar"]');
          if (bar) bar.removeAttribute('aria-valuenow');
          var fill = el.querySelector('[data-oap-fill]');
          if (fill) fill.style.width = '';
        }
        return setState(job, 'working', title || job.title, detail || 'Working…');
      },
      setProgress: function (percent, detail, title) {
        if (!active()) return false;
        var parsed = Number(percent);
        if (!Number.isFinite(parsed)) return this.setPhase(detail, title);
        job.percent = Math.max(0, Math.min(100, parsed));
        var el = ensureSurface();
        if (el) {
          el.setAttribute('data-mode', 'determinate');
          var bar = el.querySelector('[role="progressbar"]');
          if (bar) bar.setAttribute('aria-valuenow', String(Math.floor(job.percent)));
          var fill = el.querySelector('[data-oap-fill]');
          if (fill) fill.style.width = job.percent + '%';
        }
        return setState(job, 'working', title || job.title, detail || 'Progress reported by the active operation');
      },
      complete: function (detail, title) {
        if (!active()) return false;
        clearTimers(job);
        job.percent = 100;
        var el = ensureSurface();
        if (el) {
          el.setAttribute('data-mode', 'determinate');
          var bar = el.querySelector('[role="progressbar"]');
          if (bar) bar.setAttribute('aria-valuenow', '100');
          var fill = el.querySelector('[data-oap-fill]');
          if (fill) fill.style.width = '100%';
        }
        setState(job, 'complete', title || job.title, detail || 'Operation finished. Review the result in the current section.');
        later(job, function () { hide(job); }, 1000);
        return true;
      },
      fail: function (error, detail) {
        if (!active()) return false;
        clearTimers(job);
        var reason = typeof error === 'string' ? error : text(error && error.message || error || 'Unknown error');
        if (reason.length > 180) reason = reason.slice(0, 177) + '…';
        setState(job, 'error', 'ACTION NEEDS ATTENTION', detail || reason || 'The action did not report a result.');
        later(job, function () { hide(job); }, 5000);
        return true;
      },
      cancel: function (detail) {
        if (!active()) return false;
        clearTimers(job);
        setState(job, 'complete', job.title, detail || 'Action tracking ended.');
        later(job, function () { hide(job); }, 400);
        return true;
      }
    };
  }
  function hide(job) {
    if (!job || current !== job || job.id !== serial) return false;
    clearTimers(job);
    job.closed = true;
    var el = ensureSurface();
    if (el) {
      el.classList.remove('is-visible');
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('aria-busy', 'false');
      el.setAttribute('data-state', 'idle');
    }
    current = null;
    return true;
  }
  function begin(title, options) {
    options = options || {};
    if (current) {
      clearTimers(current);
      current.closed = true;
    }
    serial += 1;
    var job = {
      id:serial, currentId:serial, title:text(title || 'Working'), percent:null,
      timers:[], closed:false, startedAt:Date.now(), options:options
    };
    current = job;
    ensureSurface();
    var h = handleFor(job);
    h.setPhase(options.detail || 'Preparing action…', options.heading || job.title);
    if (options.timeoutMs !== 0) {
      later(job, function () {
        h.fail('No completion signal was received after ' + Math.round((Number(options.timeoutMs) || 60000) / 1000) + ' seconds.',
          'This action has not reported completion. Check the section result before trying again.');
      }, Math.max(10000, Number(options.timeoutMs) || 60000));
    }
    return h;
  }
  async function run(title, task, options) {
    options = options || {};
    var h = begin(title, options);
    try {
      await paint();
      var result = await task(h);
      if (current && current.id === h.id) {
        if (options.successMessage) h.complete(options.successMessage, options.heading || title);
        else h.complete('Operation finished. Review the result in the current section.', options.heading || title);
      }
      return result;
    } catch (error) {
      h.fail(error, options.failureMessage || text(error && error.message || error));
      if (options.rethrow !== false) throw error;
      return null;
    }
  }
  function controlLabel(el) {
    var raw = text(el && (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent));
    if (!raw && el && el.form) raw = 'Submit form';
    return raw.replace(/\s+/g, ' ').slice(0, 76) || 'Action';
  }
  function isExcludedControl(el) {
    if (!el || !el.closest) return true;
    if (el.closest('#omega-action-progress-v1,#omega-mine-management-modal,#gsrsk-intelligence-modal,[data-omega-action-progress-managed="true"]')) return true;
    if (el.closest('[data-omega-v2-global-nav],[data-omega-v2-jump-route],[data-omega-v2-jump-ministry],[data-omega-v2-back],[data-omega-v2-exit],[data-omega-v2-action="back-to-map"]')) return true;
    if (el.matches('a[href],summary,[role="tab"],[data-panel]')) return true;
    var action = text(el.getAttribute('data-action') || el.getAttribute('data-operation') ||
      el.getAttribute('data-command') || el.getAttribute('data-omega-action') || el.getAttribute('data-ministry-action'));
    if (NAVIGATION.test(action)) return true;
    return false;
  }
  function hasMutationIntent(el) {
    if (!el || isExcludedControl(el)) return false;
    if (el.matches('form button[type="submit"],form input[type="submit"]')) return true;
    var action = text(el.getAttribute('data-action') || el.getAttribute('data-operation') ||
      el.getAttribute('data-command') || el.getAttribute('data-omega-action') || el.getAttribute('data-ministry-action') ||
      el.getAttribute('data-omega-v2-action'));
    var onclick = text(el.getAttribute('onclick'));
    var label = controlLabel(el);
    if (action && MUTATING.test(action)) return true;
    if (onclick && MUTATING.test(onclick)) return true;
    return MUTATING.test(label) && !/^(open|show|view|inspect|details|search|filter|refresh|close|back|cancel|dismiss)\b/i.test(label);
  }
  function isStillPending(el, job) {
    if (!el || !g.document || !g.document.documentElement.contains(el)) return false;
    if (el.disabled || el.getAttribute('aria-busy') === 'true') return true;
    if (el.closest('[aria-busy="true"]')) return true;
    if (WORKING.test(controlLabel(el))) return true;
    var parent = el.closest('[role="dialog"],main,section,article');
    if (parent) {
      var status = parent.querySelector('[role="status"][aria-live="polite"],[role="alert"],[data-status="pending"],[data-state="pending"]');
      if (status && WORKING.test(text(status.textContent))) return true;
    }
    return Date.now() - job.startedAt < 2500;
  }
  function watchControl(el, title) {
    var h = begin(title || controlLabel(el), { detail:'Action submitted; waiting for the section to update.', timeoutMs:55000 });
    var job = current;
    var attempt = 0;
    function check() {
      if (current !== job || job.closed) return;
      attempt += 1;
      if (isStillPending(el, job)) {
        if (attempt < 112) later(job, check, 500);
        else h.fail('The interface did not report completion.', 'The action may still be running. Check the section state before retrying.');
        return;
      }
      h.complete('Action handled. Check the current section for its recorded result.');
    }
    later(job, check, 700);
  }
  function bindGenericActionWatchers() {
    if (!g.document || g.document.__omegaActionProgressWatchersBound) return;
    g.document.__omegaActionProgressWatchersBound = true;
    g.document.addEventListener('click', function (event) {
      var target = event && event.target;
      var el = target && target.closest ? target.closest('button,[role="button"],input[type="submit"],input[type="button"]') : null;
      if (!el || !g.document.documentElement.contains(el) || !hasMutationIntent(el)) return;
      watchControl(el, controlLabel(el));
    }, true);
    g.document.addEventListener('submit', function (event) {
      var form = event && event.target;
      if (!form || form.closest && form.closest('#omega-mine-management-modal,#gsrsk-intelligence-modal')) return;
      var submit = form.querySelector('button[type="submit"],input[type="submit"]');
      if (submit && hasMutationIntent(submit)) watchControl(submit, controlLabel(submit));
    }, true);
  }

  g.OmegaActionProgress = Object.freeze({
    __omegaV1:true,
    begin:begin,
    run:run,
    bindGenericActionWatchers:bindGenericActionWatchers,
    get active(){ return !!current; },
    version:'1.0.0'
  });
  function boot() { ensureSurface(); bindGenericActionWatchers(); }
  if (g.document) {
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', boot, { once:true });
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
