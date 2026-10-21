/* OMEGA UI Button System v1.0.0
 * Non-destructive inventory and appearance manager for every live UI button.
 * This file never replaces an existing click handler or gameplay action.
 */
(function (global, document) {
  'use strict';

  if (!global || !document) return;
  if (global.OMEGA_BUTTON_SYSTEM_V1 && global.OMEGA_BUTTON_SYSTEM_V1.version === '1.0.0') return;

  var VERSION = '1.0.0';
  var sequence = 0;
  var clickAttempts = [];
  var testResults = {};
  var observer = null;
  var VALID_RESULTS = { PASS: true, FAIL: true, BLOCKED: true, NOT_TESTED: true };
  var VALID_KINDS = { primary: true, secondary: true, danger: true, navigation: true, toggle: true, icon: true, utility: true, submit: true };

  function getAttr(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null;
    var value = node.getAttribute(name);
    return value === null || value === undefined ? null : String(value);
  }

  function setAttr(node, name, value) {
    if (!node || typeof node.setAttribute !== 'function') return;
    if (getAttr(node, name) !== String(value)) node.setAttribute(name, String(value));
  }

  function classText(node) {
    var value = node && node.className;
    if (value && typeof value === 'object' && typeof value.baseVal === 'string') value = value.baseVal;
    return String(value || getAttr(node, 'class') || '').toLowerCase();
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function textLabel(node) {
    if (!node) return '';
    var value = getAttr(node, 'aria-label') || getAttr(node, 'title') || getAttr(node, 'data-label') ||
      node.innerText || node.textContent || getAttr(node, 'value') || '';
    value = cleanText(value);
    if (value) return value;

    if (typeof node.querySelector === 'function') {
      var image = node.querySelector('img[alt]');
      if (image && getAttr(image, 'alt')) return cleanText(getAttr(image, 'alt'));
      var svgTitle = node.querySelector('svg title');
      if (svgTitle && (svgTitle.textContent || svgTitle.innerText)) return cleanText(svgTitle.textContent || svgTitle.innerText);
      var titledSvg = node.querySelector('svg[aria-label],svg[title]');
      if (titledSvg) return cleanText(getAttr(titledSvg, 'aria-label') || getAttr(titledSvg, 'title'));
    }

    var labelledBy = getAttr(node, 'aria-labelledby');
    if (labelledBy && document.getElementById) {
      var ids = labelledBy.split(/\s+/);
      var parts = [];
      for (var i = 0; i < ids.length; i++) {
        var labelNode = document.getElementById(ids[i]);
        if (labelNode) parts.push(cleanText(labelNode.innerText || labelNode.textContent || ''));
      }
      value = cleanText(parts.join(' '));
      if (value) return value;
    }
    return '';
  }

  function containsClass(classes, token) {
    return new RegExp('(^|\\s)' + token + '(\\s|$)').test(classes);
  }

  function determineKind(node, label) {
    var explicit = cleanText(getAttr(node, 'data-omega-button-variant') || getAttr(node, 'data-omega-button-kind')).toLowerCase();
    if (VALID_KINDS[explicit]) return explicit;

    var classes = classText(node);
    var id = String(getAttr(node, 'id') || '').toLowerCase();
    var role = String(getAttr(node, 'role') || '').toLowerCase();
    var actionLabel = label.toLowerCase();

    if (/(^|[\\s_-])(danger|destructive|delete|remove)([\\s_-]|$)/.test(classes) ||
        /(^|[\\s_-])(danger|destructive|delete|remove)([\\s_-]|$)/.test(id) ||
        /\\b(delete|remove|destroy|erase|demolish)\\b/.test(actionLabel)) return 'danger';

    if (/(^|[\\s_-])(primary|btn-primary|confirm|apply|submit)([\\s_-]|$)/.test(classes) ||
        /\\b(save|apply|confirm|execute|build|recruit|purchase|approve|launch|accept|create|deploy|submit|enact)\\b/.test(actionLabel)) return 'primary';

    if (/(^|[\\s_-])(close|drawer-close|modal-close|dismiss)([\\s_-]|$)/.test(classes) ||
        /^(close|dismiss|back|cancel|go back|return)$/.test(actionLabel) ||
        getAttr(node, 'data-role') === 'close') return 'utility';

    if (containsClass(classes, 'icon-btn') || containsClass(classes, 'icon-only') || id === 'btn-ministry-dock') return 'icon';
    if (getAttr(node, 'aria-pressed') !== null || containsClass(classes, 'toggle-btn') || containsClass(classes, 'switch-btn')) return 'toggle';
    if (role === 'tab' || containsClass(classes, 'nav-btn') || containsClass(classes, 'tab-btn') ||
        containsClass(classes, 'metric-opt-btn') || containsClass(classes, 'layer-opt-btn') ||
        containsClass(classes, 'speed-btn') || containsClass(classes, 'c-ministry-btn')) return 'navigation';

    var type = String(getAttr(node, 'type') || '').toLowerCase();
    if (type === 'submit') return 'submit';
    return 'secondary';
  }

  function actionBinding(node) {
    var inline = getAttr(node, 'onclick');
    if ((inline && cleanText(inline)) || typeof node.onclick === 'function') return 'DIRECT_HANDLER';

    var actionAttrs = [];
    var attributes = node.attributes || [];
    for (var i = 0; i < attributes.length; i++) {
      var name = String(attributes[i].name || '').toLowerCase();
      var value = cleanText(attributes[i].value);
      if (value && /^data-.*(?:action|command|route|target|operation)$/.test(name)) actionAttrs.push(name);
    }
    if (actionAttrs.length || getAttr(node, 'aria-controls') || getAttr(node, 'formaction')) {
      return 'DECLARATIVE_OR_DELEGATED';
    }

    var type = String(getAttr(node, 'type') || '').toLowerCase();
    var hasForm = !!node.form || (typeof node.closest === 'function' && !!node.closest('form'));
    if (hasForm && type === 'submit') return 'FORM_SUBMIT';
    if (hasForm && !type) return 'FORM_SUBMIT_IMPLICIT';
    return 'RUNTIME_OR_DELEGATED';
  }

  function actionNote(node, label, binding) {
    var explicit = cleanText(getAttr(node, 'data-omega-button-note'));
    if (explicit) return explicit;
    var action = getAttr(node, 'data-action') || getAttr(node, 'data-omega-action') ||
      getAttr(node, 'data-om-action') || getAttr(node, 'aria-controls') || getAttr(node, 'formaction');
    if (!action) action = getAttr(node, 'onclick') ? 'inline onclick' : binding.toLowerCase().replace(/_/g, ' ');
    return 'Control: ' + (label || 'UNLABELLED') + '. Action evidence: ' + action + '. Handler evidence is not a gameplay-success assertion.';
  }

  function assignKey(node) {
    var key = getAttr(node, 'data-omega-button-key');
    if (key) return key;
    sequence += 1;
    key = 'OMEGA-BTN-' + ('000000' + sequence).slice(-6);
    setAttr(node, 'data-omega-button-key', key);
    return key;
  }

  function stamp(node) {
    if (!node || String(node.tagName || '').toLowerCase() !== 'button') return null;
    var label = textLabel(node);
    var kind = determineKind(node, label);
    var binding = actionBinding(node);
    var key = assignKey(node);

    setAttr(node, 'data-omega-button-managed', 'v1');
    setAttr(node, 'data-omega-button-kind', kind);
    setAttr(node, 'data-omega-button-binding', binding);
    if (getAttr(node, 'data-omega-button-status') === null) setAttr(node, 'data-omega-button-status', 'NOT_TESTED');
    if (getAttr(node, 'data-omega-button-note') === null) setAttr(node, 'data-omega-button-note', actionNote(node, label, binding));
    if (testResults[key]) setAttr(node, 'data-omega-button-test-result', testResults[key].status);
    return { node: node, key: key, label: label, kind: kind, binding: binding };
  }

  function listButtons(root) {
    root = root || document;
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    try { return Array.prototype.slice.call(root.querySelectorAll('button')); }
    catch (_) { return []; }
  }

  function scanNode(node) {
    if (!node) return;
    if (String(node.tagName || '').toLowerCase() === 'button') stamp(node);
    if (typeof node.querySelectorAll === 'function') {
      var descendants;
      try { descendants = node.querySelectorAll('button'); } catch (_) { descendants = []; }
      for (var i = 0; i < descendants.length; i++) stamp(descendants[i]);
    }
  }

  function visible(node) {
    var current = node;
    while (current) {
      if (getAttr(current, 'hidden') !== null || getAttr(current, 'aria-hidden') === 'true') return false;
      if (current.style && (current.style.display === 'none' || current.style.visibility === 'hidden' || current.style.visibility === 'collapse')) return false;
      if (typeof global.getComputedStyle === 'function') {
        try {
          var style = global.getComputedStyle(current);
          if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) return false;
        } catch (_) {}
      }
      current = current.parentElement || current.parentNode || null;
    }
    if (typeof node.getBoundingClientRect === 'function') {
      try {
        var rect = node.getBoundingClientRect();
        if (rect && (rect.width === 0 || rect.height === 0)) return false;
      } catch (_) {}
    }
    return true;
  }

  function surface(node) {
    var current = node && (node.parentElement || node.parentNode);
    while (current && current !== document) {
      var id = getAttr(current, 'id');
      var classes = classText(current).split(/\s+/).filter(function (item) { return !!item; }).slice(0, 2);
      var role = getAttr(current, 'role');
      if (role === 'dialog' || id || /modal|drawer|cabinet|ministry|panel|navigation|resource|finance|map/.test(classes.join(' '))) {
        return (id ? '#' + id : '') + (classes.length ? (id ? ' ' : '') + '.' + classes.join('.') : '') + (role ? ' [role=' + role + ']' : '');
      }
      current = current.parentElement || current.parentNode || null;
    }
    return 'document';
  }

  function testState(node, key) {
    if (testResults[key]) return testResults[key];
    var domStatus = getAttr(node, 'data-omega-button-test-result');
    return { status: VALID_RESULTS[domStatus] ? domStatus : 'NOT_TESTED', note: getAttr(node, 'data-omega-button-test-note') || '', source: 'DOM_OR_SESSION' };
  }

  function audit(root) {
    var nodes = listButtons(root);
    var ids = {};
    var entries = [];
    var issues = [];
    var byKind = {};
    var visibleCount = 0;
    var actionReviewRequired = 0;

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var stampResult = stamp(node);
      if (!stampResult) continue;
      var id = getAttr(node, 'id');
      if (id) ids[id] = (ids[id] || 0) + 1;
    }

    for (var j = 0; j < nodes.length; j++) {
      var item = nodes[j];
      var data = stamp(item);
      if (!data) continue;
      var isVisible = visible(item);
      var test = testState(item, data.key);
      var hasLabel = !!data.label;
      var type = String(getAttr(item, 'type') || '').toLowerCase() || 'implicit-button';
      var duplicateId = !!(getAttr(item, 'id') && ids[getAttr(item, 'id')] > 1);
      var binding = data.binding;
      var rect = null;
      if (typeof item.getBoundingClientRect === 'function') {
        try {
          var rawRect = item.getBoundingClientRect();
          if (rawRect) rect = { width: Number(rawRect.width) || 0, height: Number(rawRect.height) || 0 };
        } catch (_) {}
      }
      if (data.kind) byKind[data.kind] = (byKind[data.kind] || 0) + 1;
      if (isVisible) visibleCount += 1;

      if (!hasLabel) issues.push({ code: 'MISSING_ACCESSIBLE_NAME', key: data.key, id: getAttr(item, 'id'), message: 'Add aria-label/title or meaningful visible text.' });
      if (duplicateId) issues.push({ code: 'DUPLICATE_BUTTON_ID', key: data.key, id: getAttr(item, 'id'), message: 'Button IDs must be unique within the live document.' });
      if (binding === 'FORM_SUBMIT_IMPLICIT') issues.push({ code: 'IMPLICIT_FORM_SUBMIT', key: data.key, id: getAttr(item, 'id'), message: 'Set type="button" or type="submit" deliberately.' });
      if (binding === 'RUNTIME_OR_DELEGATED') actionReviewRequired += 1;

      entries.push({
        key: data.key,
        id: getAttr(item, 'id'),
        label: data.label || '',
        kind: data.kind,
        surface: surface(item),
        type: type,
        binding: binding,
        visible: isVisible,
        disabled: !!item.disabled || getAttr(item, 'aria-disabled') === 'true',
        active: containsClass(classText(item), 'active') || getAttr(item, 'aria-pressed') === 'true' ||
          getAttr(item, 'aria-selected') === 'true' || getAttr(item, 'aria-current') === 'page',
        size: rect,
        note: getAttr(item, 'data-omega-button-note') || '',
        verification: test.status,
        verificationNote: test.note || ''
      });
    }

    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      total: entries.length,
      visible: visibleCount,
      hidden: entries.length - visibleCount,
      actionReviewRequired: actionReviewRequired,
      byKind: byKind,
      issues: issues,
      buttons: entries
    };
  }

  function findButtonByKey(key) {
    var nodes = listButtons(document);
    for (var i = 0; i < nodes.length; i++) {
      if (getAttr(nodes[i], 'data-omega-button-key') === String(key)) return nodes[i];
    }
    return null;
  }

  function markTestResult(keyOrNode, status, note) {
    status = String(status || '').toUpperCase();
    note = cleanText(note);
    if (!VALID_RESULTS[status]) return { success: false, reason: 'INVALID_STATUS' };
    if (status !== 'NOT_TESTED' && !note) return { success: false, reason: 'NOTE_REQUIRED' };

    var node = keyOrNode && typeof keyOrNode === 'object' ? keyOrNode : findButtonByKey(keyOrNode);
    if (!node || String(node.tagName || '').toLowerCase() !== 'button') return { success: false, reason: 'BUTTON_NOT_FOUND' };
    var data = stamp(node);
    if (!data) return { success: false, reason: 'BUTTON_NOT_FOUND' };

    var result = { key: data.key, status: status, note: note, updatedAt: new Date().toISOString() };
    testResults[data.key] = result;
    setAttr(node, 'data-omega-button-status', status);
    setAttr(node, 'data-omega-button-test-result', status);
    setAttr(node, 'data-omega-button-test-note', note);
    return { success: true, result: result };
  }

  function findButton(target) {
    var current = target;
    while (current && current !== document) {
      if (String(current.tagName || '').toLowerCase() === 'button') return current;
      current = current.parentElement || current.parentNode || null;
    }
    return null;
  }

  function trackClick(event) {
    var button = findButton(event && event.target);
    if (!button) return;
    var info = stamp(button);
    if (!info) return;
    clickAttempts.unshift({
      key: info.key,
      label: info.label || '',
      kind: info.kind,
      attemptedAt: new Date().toISOString(),
      outcome: 'CLICK_ATTEMPT_ONLY'
    });
    if (clickAttempts.length > 100) clickAttempts.length = 100;
  }

  function initialize() {
    scanNode(document.documentElement || document.body || document);
    if (typeof document.addEventListener === 'function') document.addEventListener('click', trackClick, true);
    if (typeof global.MutationObserver === 'function' && (document.documentElement || document.body)) {
      observer = new global.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes || [];
          for (var j = 0; j < added.length; j++) scanNode(added[j]);
        }
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }

  function exportJSON() {
    return JSON.stringify({ version: VERSION, audit: audit(), clickAttempts: clickAttempts.slice(), testResults: testResults }, null, 2);
  }

  var api = {
    version: VERSION,
    audit: audit,
    markTestResult: markTestResult,
    getRecentClickAttempts: function () { return clickAttempts.slice(); },
    exportJSON: exportJSON
  };

  global.OMEGA_BUTTON_SYSTEM_V1 = api;
  global.OMEGAButtonSystem = api;

  if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(window, document);
