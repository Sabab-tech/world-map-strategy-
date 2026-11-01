/* OMEGA UI text presentation.
 * This module only humanizes visible DOM text nodes. It never changes game state,
 * canonical identifiers, data attributes, form values, or simulation calculations.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var INSTALL_FLAG = '__OMEGA_UI_TEXT_PRESENTATION_INSTALLED__';
  var FORMAT_FLAG = 'data-omega-ui-display-label';
  var IGNORED_TAGS = {
    SCRIPT: true, STYLE: true, NOSCRIPT: true, CODE: true, PRE: true,
    KBD: true, SAMP: true, TEXTAREA: true, INPUT: true, SELECT: true,
    OPTION: true, SVG: true, MATH: true, TEMPLATE: true
  };

  function formatLabel(value) {
    return String(value == null ? '' : value)
      .replace(/_+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ');
  }

  function isInsideMapSurface(node) {
    var current = node && (node.nodeType === 1 ? node :
      (node.parentElement ||
        (node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null)));

    while (current) {
      var id = String(current.id || '');
      if (id === 'render-engine-root' || id === 'map') return true;
      current = current.parentElement;
    }
    return false;
  }

  function hasRawTextAncestor(node) {
    if (isInsideMapSurface(node)) return true;

    var current = node && (node.parentElement ||
      (node.parentNode && node.parentNode.nodeType === 1 ? node.parentNode : null));

    while (current) {
      var tag = String(current.tagName || '').toUpperCase();
      if (IGNORED_TAGS[tag] || current.isContentEditable) return true;
      if (typeof current.hasAttribute === 'function' &&
          current.hasAttribute('data-omega-raw-text')) return true;
      current = current.parentElement;
    }
    return false;
  }

  function isInsideFormattedLabel(element) {
    var current = element;
    while (current) {
      if (typeof current.getAttribute === 'function' &&
          current.getAttribute(FORMAT_FLAG) === 'true') return true;
      current = current.parentElement;
    }
    return false;
  }

  function formatTextNode(node) {
    if (!node || node.nodeType !== 3) return false;

    var raw = String(node.nodeValue == null ? '' : node.nodeValue);
    if (raw.indexOf('_') < 0 || hasRawTextAncestor(node)) return false;

    var display = formatLabel(raw);
    if (display === raw) return false;

    if (isInsideFormattedLabel(node.parentElement)) {
      node.nodeValue = display;
      return true;
    }

    var parent = node.parentNode;
    if (!parent || typeof parent.replaceChild !== 'function') return false;

    var strong = doc.createElement('strong');
    var italic = doc.createElement('em');
    strong.setAttribute(FORMAT_FLAG, 'true');
    strong.style.fontWeight = '700';
    italic.style.fontStyle = 'italic';
    italic.textContent = display;
    strong.appendChild(italic);
    parent.replaceChild(strong, node);
    return true;
  }

  function visit(node) {
    if (!node) return;

    if (node.nodeType === 3) {
      formatTextNode(node);
      return;
    }

    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;

    if (node.nodeType === 1) {
      var tag = String(node.tagName || '').toUpperCase();
      if (IGNORED_TAGS[tag] || node.isContentEditable) return;
      if (typeof node.hasAttribute === 'function' &&
          node.hasAttribute('data-omega-raw-text')) return;
    }

    var children = Array.prototype.slice.call(node.childNodes || []);
    for (var i = 0; i < children.length; i += 1) visit(children[i]);
  }

  function install() {
    if (!doc || !doc.body) return false;
    if (global[INSTALL_FLAG]) return true;

    global[INSTALL_FLAG] = true;
    visit(doc.body);

    if (typeof global.MutationObserver === 'function') {
      var observer = new global.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          var record = records[i];
          if (record.type === 'characterData') {
            formatTextNode(record.target);
          } else if (record.type === 'childList') {
            var added = record.addedNodes || [];
            for (var j = 0; j < added.length; j += 1) visit(added[j]);
          }
        }
      });

      observer.observe(doc.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
      global.__OMEGA_UI_TEXT_PRESENTATION_OBSERVER__ = observer;
    }

    return true;
  }

  global.OmegaUIPresentation = Object.freeze({
    version: '1.0.0',
    formatLabel: formatLabel,
    install: install
  });

  if (doc && doc.body) install();
  else if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('DOMContentLoaded', install, { once: true });
  }
})(window);
