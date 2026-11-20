'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const selector = read('omega_live_minister_selector.js');
const runtime = read('omega_minister_runtime_v2.js');
const recruitment = read('minister_recruitment_engine.js');
const government = read('omega_ui_v2/screens/government.js');

assert.match(html, /data-omega-ui-v2-required="true"/,
  'Production must explicitly require UI v2 so a failed mount cannot revive UI v1.');

assert.match(selector, /function uiV2Required\(\)/,
  'The live selector must check the active UI generation.');
assert.match(selector, /if\(uiV2Required\(\)\)\{removeLegacyMinisterControls\(\);return false;\}/,
  'The retired selector and profile panels must not mount in the production UI.');
assert.doesNotMatch(selector, /setInterval\(/,
  'The selector must not run a 100ms repaint loop on mobile.');
assert.match(selector, /if\(m&&install\(m\)\)return;/,
  'Legacy startup retries must stop once installation succeeds.');

assert.match(runtime, /function openPanel\(ministryId\)[\s\S]*?OmegaUIV2Integration/,
  'Legacy minister-runtime entrypoints must be routed through UI v2.');
assert.match(runtime, /government\.openRecruitment\(root,ministry,options\)/,
  'The runtime entrypoint must open the UI v2 recruitment panel with explicit context.');
assert.doesNotMatch(runtime, /root\.id='omega-minister-command'/,
  'The runtime must not create the old full-screen recruitment overlay.');

assert.match(recruitment, /function uiV2Required\(\)/,
  'The recruitment engine must honor the production UI-v2 requirement.');
assert.match(recruitment, /if \(uiV2Required\(\)\) \{[\s\S]*?openV2Recruitment\(targetMinistry\)/,
  'Recruitment calls must be sent into UI v2 in production.');
assert.match(recruitment, /if \(uiV2Required\(\)\) return;/,
  'Recruitment lifecycle updates must not redraw the hidden legacy dashboard.');
assert.doesNotMatch(recruitment, /const timer = setInterval\(/,
  'Legacy dashboard discovery must not keep a high-frequency interval alive.');

assert.match(government, /function openRecruitment\(root, ministryId, options\)/,
  'UI v2 Government must expose a recruitment entrypoint for old callers.');
assert.match(government, /openRecruitment: openRecruitment/,
  'The recruitment entrypoint must be exported to the integration bridge.');
assert.match(government, /COUNTRY_CONTEXT_UNRESOLVED/,
  'The recruitment screen must fail closed when country context is missing.');
assert.match(government, /MINISTRY_NOT_REGISTERED/,
  'The recruitment screen must reject unknown ministry IDs.');

console.log('OMEGA minister mobile/UI v2 regression checks passed.');
