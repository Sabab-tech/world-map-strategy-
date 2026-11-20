/* OMEGA Android WebView Compatibility v1
 * Local-only API shims for the older Chromium/WebView bundled with Android 9.
 * This file must load synchronously before every runtime script.
 */
(function () {
    'use strict';

    if (typeof Array.prototype.flatMap !== 'function') {
        Object.defineProperty(Array.prototype, 'flatMap', {
            configurable: true,
            writable: true,
            enumerable: false,
            value: function (callback, thisArg) {
                if (this == null) throw new TypeError('Array.prototype.flatMap called on null or undefined');
                if (typeof callback !== 'function') throw new TypeError('flatMap callback must be a function');
                var source = Object(this);
                var length = source.length >>> 0;
                var output = [];
                for (var index = 0; index < length; index += 1) {
                    if (!(index in source)) continue;
                    var mapped = callback.call(thisArg, source[index], index, source);
                    if (Array.isArray(mapped)) {
                        for (var nestedIndex = 0; nestedIndex < mapped.length; nestedIndex += 1) {
                            if (nestedIndex in mapped) output.push(mapped[nestedIndex]);
                        }
                    } else {
                        output.push(mapped);
                    }
                }
                return output;
            }
        });
    }

    window.OMEGA_ANDROID_COMPAT_V1 = Object.freeze({
        version: 1,
        arrayFlatMap: typeof Array.prototype.flatMap === 'function'
    });
})();
