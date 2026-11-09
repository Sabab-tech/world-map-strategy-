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

  function findFormattedLabel(element) {
    var current = element;
    while (current) {
      if (typeof current.getAttribute === 'function' &&
          current.getAttribute(FORMAT_FLAG) === 'true') return current;
      current = current.parentElement;
    }
    return null;
  }

  function ensurePresentationStyles() {
    if (!doc || !doc.createElement) return false;
    if (doc.getElementById && doc.getElementById('omega-ui-text-presentation-style')) return true;

    var style = doc.createElement('style');
    style.id = 'omega-ui-text-presentation-style';
    style.textContent =
      '[data-omega-ui-display-label="true"]::after{' +
        'content:attr(data-omega-ui-display-text);font-weight:700;font-style:italic' +
      '}' +
      '[data-omega-ui-display-label="true"]>.omega-ui-raw-label{' +
        'font-size:0!important;line-height:0!important;color:transparent!important' +
      '}';
    var host = doc.head || doc.documentElement || doc.body;
    if (!host || typeof host.appendChild !== 'function') return false;
    host.appendChild(style);
    return true;
  }

  function setDisplayLabel(wrapper, display) {
    wrapper.setAttribute('data-omega-ui-display-text', display);
    wrapper.setAttribute('aria-label', display);
  }

  function formatTextNode(node) {
    if (!node || node.nodeType !== 3) return false;

    var raw = String(node.nodeValue == null ? '' : node.nodeValue);
    if (raw.indexOf('_') < 0 || hasRawTextAncestor(node)) return false;

    var display = formatLabel(raw);
    if (display === raw) return false;

    var existing = findFormattedLabel(node.parentElement);
    if (existing) {
      // Keep the canonical text node exactly as supplied by the game/UI renderer.
      setDisplayLabel(existing, display);
      return true;
    }

    var parent = node.parentNode;
    if (!parent || typeof parent.replaceChild !== 'function') return false;

    var strong = doc.createElement('strong');
    var rawLabel = doc.createElement('span');
    strong.setAttribute(FORMAT_FLAG, 'true');
    strong.setAttribute('role', 'text');
    strong.setAttribute('aria-label', display);
    rawLabel.setAttribute('class', 'omega-ui-raw-label');
    setDisplayLabel(strong, display);
    parent.replaceChild(strong, node);
    rawLabel.appendChild(node);
    strong.appendChild(rawLabel);
    return true;
  }

  function visit(node) {
    if (!node || isInsideMapSurface(node)) return;

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
    ensurePresentationStyles();
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
