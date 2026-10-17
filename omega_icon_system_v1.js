/* OMEGA UI ICON SYSTEM v1.0.0
 * Self-hosted, offline-safe SVG iconography. No CDN, fonts, or raster dependencies.
 * Original compact line icons designed for the OMEGA strategic command interface.
 */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const XLINK_NS = 'http://www.w3.org/1999/xlink';

    const SYMBOLS = Object.freeze({
        'landmark': '<path d="M3 10h18M5 10v9m4-9v9m6-9v9m4-9v9M3 21h18M2 10 12 3l10 7"/>',
        'shield': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/>',
        'swords': '<path d="m14.5 17.5 3 3 3-3-3-3M3 3l8.5 8.5M5 3l6 1-7 7 1 6 4-4M21 3l-8.5 8.5M19 3l-6 1 7 7-1 6-4-4M9 15l-4 4m0 0 3 3m-3-3 3-3"/>',
        'wallet': '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 9V5a2 2 0 0 1 2-2h12M16 13h5v4h-5a2 2 0 0 1 0-4Z"/><path d="M17.5 15h.01"/>',
        'chart-column': '<path d="M4 20V11h4v9M10 20V4h4v16M16 20v-7h4v7M2 20h20"/>',
        'refresh': '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 6l3 6M4 12l3 6a7 7 0 0 0 11.4-3"/>',
        'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
        'user-search': '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c.5-3.2 2.8-5 7-5 1.4 0 2.6.2 3.5.7"/><circle cx="18" cy="17" r="3"/><path d="m20.2 19.2 2 2"/>',
        'building-2': '<path d="M3 21h18M5 21V5l7-3 7 3v16M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1M11 21v-3h2v3"/>',
        'plane': '<path d="m3 11 18-8-6 18-3-7-9-3Z"/><path d="m12 14 4-4"/>',
        'pickaxe': '<path d="m3 7 9-4 9 4M8 5l5 5M13 10l-7 11M13 10l5 2"/>',
        'heart-pulse': '<path d="M20.8 8.7c0 5.2-8.8 11.3-8.8 11.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/><path d="M4 12h4l2-3 3.2 6 2-3H20"/>',
        'book-open': '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v17H5.5A2.5 2.5 0 0 0 3 22V5.5ZM21 5.5A2.5 2.5 0 0 0 18.5 3H12v17h6.5A2.5 2.5 0 0 1 21 22V5.5Z"/>',
        'microscope': '<path d="m9 3 6 6M7 5l4-4 5 5-4 4M10 10l-5 5M7 13l4 4M4 21h16M8 17a6 6 0 0 0 12 0v-1"/>',
        'scroll': '<path d="M8 4h10a2 2 0 0 1 0 4H6a3 3 0 0 0 0 6h11a2 2 0 0 1 0 4H7"/><path d="M7 4a2 2 0 0 0-2 2v11a3 3 0 0 0 3 3h10"/>',
        'palette': '<path d="M12 3a9 9 0 1 0 0 18h1.3a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.4-3h1A4.8 4.8 0 0 0 22 10c0-3.9-4.5-7-10-7Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="15" cy="7" r="1"/>',
        'car-front': '<path d="m5 11 2-5h10l2 5M3 11h18l-1 8H4l-1-8ZM5 15h3m8 0h3M7 19v2m10-2v2"/>',
        'trophy': '<path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H3v2a5 5 0 0 0 5 5M17 6h4v2a5 5 0 0 1-5 5"/>',
        'zap': '<path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>',
        'chart-line': '<path d="M3 3v18h18M6 15l4-4 4 3 6-8"/><path d="M16 6h4v4"/>',
        'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/>',
        'cylinder': '<ellipse cx="12" cy="5" rx="7" ry="2.5"/><path d="M5 5v14c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5M5 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 15c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
        'save': '<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
        'radio-tower': '<path d="m5 20 7-16 7 16M8 14h8M10 9h4"/><path d="M3 8a12 12 0 0 1 0 8M21 8a12 12 0 0 0 0 8M6 10a8 8 0 0 1 0 4M18 10a8 8 0 0 0 0 4"/>',
        'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        'pause': '<path d="M8 5h3v14H8zM15 5h3v14h-3z"/>',
        'play': '<path d="m7 4 13 8-13 8V4Z"/>',
        'search': '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
        'alert-triangle': '<path d="M10.3 4.3 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/>',
        'satellite': '<path d="m7 7 10 10M5 9l4-4-4-2-2 2 2 4ZM15 19l4-4 2 4-2 2-4-2Z"/><path d="m9 15-4 4m9-12 4-4M4 14a5 5 0 0 0 6 6M14 4a5 5 0 0 1 6 6"/>',
        'map': '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
        'moon': '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>',
        'cloud-rain': '<path d="M7 16a5 5 0 1 1 1.5-9.8A6 6 0 0 1 20 9a4 4 0 0 1-1 7"/><path d="m8 18-1 3m6-3-1 3m6-3-1 3"/>',
        'gem': '<path d="m6 3-4 6 10 13L22 9l-4-6H6Z"/><path d="m2 9 20 0M6 3l3 6 3 13 3-13 3-6"/>',
        'bell': '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
        'sliders-horizontal': '<path d="M4 6h9m4 0h3M4 18h3m4 0h9M13 3v6M7 15v6"/>',
        'bot': '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6M2 12v4m20-4v4"/>',
        'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        'arrow-left': '<path d="M19 12H5m7 7-7-7 7-7"/>',
        'arrow-right': '<path d="M5 12h14m-7-7 7 7-7 7"/>',
        'arrow-left-right': '<path d="M8 7H3l4-4M3 7h18M16 17h5l-4 4m4-4H3"/>',
        'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
        'factory': '<path d="M3 21V9l6 3V8l6 4V5h5v16H3Z"/><path d="M7 17h2m3 0h2m3 0h2"/>',
        'warehouse': '<path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M7 21v-7h10v7M7 10h.01M12 10h.01M17 10h.01"/>',
        'scan-search': '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/>',
        'shield-check': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
        'briefcase': '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
        'activity': '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
        'database': '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
        'settings': '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4L7.1 15a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 2Z"/>',
        'graduation-cap': '<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6"/>',
        'network': '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="m10.8 7.3-4.6 9.4m7-9.4 4.6 9.4M7.5 19h9"/>',
        'circle-help': '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.6 1.4c-1.2 1.3-2.2 1.5-2.2 3.1M12 17h.01"/>',
        'sparkles': '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
        'building': '<path d="M4 21V3h16v18M2 21h20M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/>',
        'siren': '<path d="M6 17V9a6 6 0 0 1 12 0v8M4 17h16M3 21h18M12 1v2M3 5l2 1M21 5l-2 1"/>',
        'school': '<path d="m2 10 10-6 10 6-10 6-10-6Z"/><path d="M6 13v5c4 3 8 3 12 0v-5M22 10v7"/>',
        'hospital': '<path d="M4 21V4h16v17M2 21h20M9 8h6M12 5v6M8 15h2m4 0h2"/>',
        'lock': '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
        'key-round': '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2 2 2 2-3 3-2-2-2 2"/>',
        'train-front': '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M9 7h.01M15 7h.01M8 19l-2 3m10-3 2 3M8 15h8"/>',
        'ship': '<path d="M3 16h18l-3 5H7l-4-5ZM5 16V8h14v8M9 8V4h6v4M2 12l3 2m17-2-3 2"/>',
        'route': '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a4 4 0 0 0 4-4V10a4 4 0 0 1 4-4"/>',
        'clipboard-check': '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4.5h6V2H9v2.5Zm-1 9 2.5 2.5L16 10"/>',
        'leaf': '<path d="M20 4C10 4 4 8 4 15a5 5 0 0 0 5 5c7 0 11-6 11-16Z"/><path d="M3 22c3-6 7-9 13-13"/>',
        'hammer': '<path d="m14 6 4-4 4 4-4 4M3 21l11-11M9 5l5-3 5 5-3 5"/>'
    });

    const normalizeEmoji = (value) => String(value || '')
        .replace(/[\uFE0E\uFE0F]/g, '')
        .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');

    const EMOJI_ENTRIES = [
        ['🏛️', 'landmark'], ['🏛', 'landmark'], ['🛡️', 'shield'], ['🛡', 'shield'],
        ['⚔️', 'swords'], ['⚔', 'swords'], ['💰', 'wallet'], ['💵', 'wallet'],
        ['📊', 'chart-column'], ['📈', 'chart-line'], ['🔄', 'refresh'], ['🔁', 'refresh'],
        ['🌐', 'globe'], ['🌍', 'globe'], ['🌎', 'globe'], ['🌏', 'globe'],
        ['🕵️', 'user-search'], ['🕵', 'user-search'], ['🏢', 'building-2'],
        ['✈️', 'plane'], ['✈', 'plane'], ['⛏️', 'pickaxe'], ['⛏', 'pickaxe'],
        ['⚕️', 'heart-pulse'], ['⚕', 'heart-pulse'], ['📚', 'book-open'],
        ['🔬', 'microscope'], ['📜', 'scroll'], ['🎨', 'palette'],
        ['🚓', 'car-front'], ['🚔', 'car-front'], ['🚙', 'car-front'], ['🚘', 'car-front'],
        ['🚐', 'car-front'], ['🚨', 'siren'], ['🏆', 'trophy'], ['⚡', 'zap'],
        ['👥', 'users'], ['🛢️', 'cylinder'], ['🛢', 'cylinder'], ['💾', 'save'],
        ['📡', 'radio-tower'], ['⏰', 'clock'], ['⏱️', 'clock'], ['⏱', 'clock'],
        ['⏸', 'pause'], ['⏯️', 'play'], ['▶️', 'play'], ['🔍', 'search'],
        ['⚠️', 'alert-triangle'], ['⚠', 'alert-triangle'], ['🛰️', 'satellite'], ['🛰', 'satellite'],
        ['🗺️', 'map'], ['🗺', 'map'], ['🌃', 'moon'], ['🌧️', 'cloud-rain'],
        ['🌧', 'cloud-rain'], ['💎', 'gem'], ['🔔', 'bell'], ['🎛️', 'sliders-horizontal'],
        ['🤖', 'bot'], ['👁️', 'eye'], ['👁', 'eye'], ['⬅️', 'arrow-left'],
        ['⬅', 'arrow-left'], ['➡️', 'arrow-right'], ['➡', 'arrow-right'],
        ['↔️', 'arrow-left-right'], ['↔', 'arrow-left-right'], ['🔎', 'search'],
        ['🔧', 'settings'], ['⚙️', 'settings'], ['⚙', 'settings'], ['🔨', 'hammer'],
        ['🏙️', 'building-2'], ['🏙', 'building-2'], ['🎓', 'graduation-cap'],
        ['🏭', 'factory'], ['🏫', 'school'], ['🏥', 'hospital'], ['🚂', 'train-front'],
        ['🚢', 'ship'], ['🧭', 'route'], ['🌱', 'leaf'], ['✅', 'shield-check'],
        ['❌', 'alert-triangle'], ['❗', 'alert-triangle'], ['🔐', 'lock'],
        ['🔑', 'key-round'], ['📋', 'clipboard-check'], ['📖', 'book-open'],
        ['💡', 'zap'], ['🧬', 'activity'], ['🏦', 'landmark'], ['💳', 'wallet'],
        ['💼', 'briefcase'], ['🔗', 'network'], ['🗄️', 'database'], ['🗄', 'database'],
        ['🔭', 'microscope'], ['🚀', 'plane'], ['🔙', 'arrow-left'],
        ['🔽', 'arrow-right'], ['⬆️', 'arrow-right'], ['⬆', 'arrow-right'],
        ['🔺', 'alert-triangle'], ['🔻', 'alert-triangle'], ['🎯', 'scan-search'],
        ['🧠', 'activity'], ['📌', 'map'], ['🏗️', 'factory'], ['🏗', 'factory'],
        ['🪙', 'wallet'], ['🌡️', 'activity'], ['🌡', 'activity'], ['🪖', 'shield'],
        ['🎖️', 'trophy'], ['🎖', 'trophy'], ['🧱', 'building'], ['🧰', 'settings'],
        ['🧪', 'microscope'], ['🛠️', 'settings'], ['🛠', 'settings'], ['🪪', 'clipboard-check'],
        ['🔒', 'lock'], ['🔓', 'lock'], ['📖', 'book-open']
    ];
    const EMOJI_TO_ICON = new Map(EMOJI_ENTRIES.map(([emoji, icon]) => [normalizeEmoji(emoji), icon]));

    const iconForEmoji = (emoji) => EMOJI_TO_ICON.get(normalizeEmoji(emoji)) || 'circle-help';
    const ICON_RE = /\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?)*/gu;
    const EXCLUDED_SELECTOR = 'script,style,textarea,input,select,option,pre,code,svg,[contenteditable="true"],.omega-icon-sprite,.omega-ui-icon';

    function makeIcon(name) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'omega-ui-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const use = document.createElementNS(SVG_NS, 'use');
        const href = '#omega-icon-' + (SYMBOLS[name] ? name : 'circle-help');
        use.setAttribute('href', href);
        try { use.setAttributeNS(XLINK_NS, 'xlink:href', href); } catch (_) { /* SVG2 href remains the primary path. */ }
        svg.appendChild(use);
        return svg;
    }

    function excluded(textNode) {
        const parent = textNode && textNode.parentElement;
        return !parent || (typeof parent.closest === 'function' && !!parent.closest(EXCLUDED_SELECTOR));
    }

    function replaceTextNode(textNode) {
        if (!textNode || textNode.nodeType !== 3 || excluded(textNode)) return 0;
        const text = textNode.nodeValue || '';
        ICON_RE.lastIndex = 0;
        if (!ICON_RE.test(text)) return 0;
        ICON_RE.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        let match;
        let count = 0;
        while ((match = ICON_RE.exec(text))) {
            const before = text.slice(cursor, match.index);
            if (before) fragment.appendChild(document.createTextNode(before));
            fragment.appendChild(makeIcon(iconForEmoji(match[0])));
            cursor = match.index + match[0].length;
            count++;
        }
        const after = text.slice(cursor);
        if (after) fragment.appendChild(document.createTextNode(after));
        if (!count || !textNode.parentNode) return 0;
        textNode.parentNode.replaceChild(fragment, textNode);
        return count;
    }

    function scanNode(root) {
        if (!root) return 0;
        if (root.nodeType === 3) return replaceTextNode(root);
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return 0;
        if (root.nodeType === 1) {
            if (root.matches && root.matches(EXCLUDED_SELECTOR)) return 0;
            if (root.tagName === 'TEMPLATE' && root.content) return scanNode(root.content);
        }
        let converted = 0;
        const walker = document.createTreeWalker(root, document.defaultView?.NodeFilter?.SHOW_TEXT || 4);
        let node;
        const pending = [];
        while ((node = walker.nextNode())) pending.push(node);
        for (const textNode of pending) converted += replaceTextNode(textNode);
        return converted;
    }

    function installSprite() {
        if (!document.body || document.getElementById('omega-icon-sprite-v1')) return;
        const sprite = document.createElementNS(SVG_NS, 'svg');
        sprite.setAttribute('id', 'omega-icon-sprite-v1');
        sprite.setAttribute('class', 'omega-icon-sprite');
        sprite.setAttribute('aria-hidden', 'true');
        sprite.setAttribute('focusable', 'false');
        sprite.innerHTML = Object.entries(SYMBOLS).map(([name, paths]) =>
            '<symbol id="omega-icon-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</symbol>'
        ).join('');
        document.body.prepend(sprite);
    }

    function init() {
        if (!document.body || window.__OMEGA_ICON_SYSTEM_INIT_V1__) return;
        window.__OMEGA_ICON_SYSTEM_INIT_V1__ = true;
        installSprite();
        scanNode(document.body);
        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver((records) => {
                for (const record of records) {
                    if (record.type === 'characterData') replaceTextNode(record.target);
                    if (record.type === 'childList') record.addedNodes.forEach(scanNode);
                }
            });
            observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            window.__OMEGA_ICON_SYSTEM_OBSERVER_V1__ = observer;
        }
        window.__OMEGA_ICON_SYSTEM_DIAGNOSTICS_V1__ = Object.freeze({
            version: '1.0.0',
            iconCount: Object.keys(SYMBOLS).length,
            mappedEmojiCount: EMOJI_TO_ICON.size,
            initialized: true,
            offline: true
        });
    }

    window.OMEGA_ICON_SYSTEM_V1 = Object.freeze({
        version: '1.0.0',
        iconNames: Object.freeze(Object.keys(SYMBOLS)),
        nameForEmoji: iconForEmoji,
        normalizeEmoji,
        scanNode,
        initialize: init
    });

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
        else init();
    }
})();
