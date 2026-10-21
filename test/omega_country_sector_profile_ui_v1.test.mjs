import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
const read = path => readFileSync(path, 'utf8');

test('country sector UI is wired into the existing page and offline app shell', () => {
 const html=read('index.html'),sw=read('omega-offline-map-sw.js');
 assert.match(html,/omega_country_sector_profile_ui_v1\.css/);
 assert.match(html,/omega_country_sector_profile_ui_v1\.js/);
 assert.match(html,/omega_country_overview_ministry_ui_v1\.js/);
 assert.match(sw,/omega_country_sector_profile_ui_v1\.css/);
 assert.match(sw,/omega_country_sector_profile_ui_v1\.js/);
 assert.match(sw,/country_sector_profiles_v1\.json/);
 assert.match(sw,/country_sector_profile_schema_v1\.json/);
});

test('country sector UI resolves compact references through canonical data and preserves missing states', () => {
 const ui=read('omega_country_sector_profile_ui_v1.js'),runtime=read('omega_country_general_data_runtime_v1.js');
 assert.match(ui,/sourcePolicy/);
 assert.match(ui,/refType==='METRIC'/);
 assert.match(ui,/refType==='DERIVED_METRIC'/);
 assert.match(ui,/refType==='EXTERNAL_METRIC'/);
 assert.match(ui,/refType==='GENERAL_FACT'/);
 assert.match(ui,/NOT RECORDED/);
 assert.match(ui,/Year /);
 assert.match(runtime,/getMetricDefinition/);
 assert.match(ui,/data-ocsp-toggle/);
 assert.match(ui,/async function toggleDossier/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage/);
});

test('new country sector asset parses as valid JavaScript', () => {
 assert.doesNotThrow(()=>new vm.Script(read('omega_country_sector_profile_ui_v1.js')));
});
