/* OMEGA SHARED NUMBER FORMAT v1.0.0
 * Readable compact quantities and money for ministry/gameplay interfaces.
 * Formatting only: never changes underlying simulation values.
 */
(function (g) {
  'use strict';
  if (g.OmegaNumberFormat && g.OmegaNumberFormat.VERSION === '1.0.0') return;

  var SCALES = [
    { value: 1e15, label: 'quadrillion' },
    { value: 1e12, label: 'trillion' },
    { value: 1e9, label: 'billion' },
    { value: 1e6, label: 'million' },
    { value: 1e3, label: 'thousand' }
  ];

  function finite(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    var normalized = value.trim().replace(/,/g, '');
    var number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function grouped(value, maximumFractionDigits) {
    var digits = maximumFractionDigits == null ? 2 : Math.max(0, Math.min(8, maximumFractionDigits));
    try {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
    } catch (_) {
      return String(Number(value.toFixed(digits)));
    }
  }

  function scaleFor(abs, minimumScale) {
    var minimum = minimumScale == null ? 1e6 : Number(minimumScale);
    for (var i = 0; i < SCALES.length; i++) {
      if (abs >= SCALES[i].value && SCALES[i].value >= minimum) return SCALES[i];
    }
    return null;
  }

  function compact(value, options) {
    var n = finite(value);
    if (n === null) return options && options.unavailable || 'Unavailable';
    var settings = options || {};
    var abs = Math.abs(n);
    var minimum = settings.threshold == null ? 1e6 : Number(settings.threshold);
    var scale = scaleFor(abs, minimum);
    if (!scale) return grouped(n, settings.maximumFractionDigits);
    var digits = settings.maximumFractionDigits == null ? 2 : settings.maximumFractionDigits;
    return (n < 0 ? '-' : '') + grouped(abs / scale.value, digits) + ' ' + scale.label;
  }

  function money(value, options) {
    var n = finite(value);
    if (n === null) return options && options.unavailable || 'Unavailable';
    var settings = options || {};
    var abs = Math.abs(n);
    var scale = scaleFor(abs, settings.threshold == null ? 1e3 : Number(settings.threshold));
    if (scale) {
      var digits = settings.maximumFractionDigits == null ? 2 : settings.maximumFractionDigits;
      return (n < 0 ? '-$' : '$') + grouped(abs / scale.value, digits) + ' ' + scale.label;
    }
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: settings.currency || 'USD',
        maximumFractionDigits: settings.smallMaximumFractionDigits == null ? 0 : settings.smallMaximumFractionDigits
      }).format(n);
    } catch (_) {
      return (n < 0 ? '-$' : '$') + grouped(abs, 0);
    }
  }

  g.OmegaNumberFormat = Object.freeze({
    VERSION: '1.0.0',
    finite: finite,
    compact: compact,
    quantity: compact,
    number: compact,
    money: money,
    formatMoney: money
  });
})(typeof window !== 'undefined' ? window : globalThis);
