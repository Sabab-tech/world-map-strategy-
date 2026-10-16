import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const countries = JSON.parse(await fs.readFile(new URL('../countries.json', import.meta.url), 'utf8'));
const world = JSON.parse(await fs.readFile(new URL('../world.json', import.meta.url), 'utf8'));
const oceans = JSON.parse(await fs.readFile(new URL('../world_oceans_v1.json', import.meta.url), 'utf8'));
const runtime = await fs.readFile(new URL('../omega_geographic_region_system_v1.js', import.meta.url), 'utf8');
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../style.css', import.meta.url), 'utf8');

const continents = new Set(['Africa','Antarctica','Asia','Europe','North America','Oceania','South America']);
const oceanIds = new Set(['ARCTIC','ATLANTIC','INDIAN','PACIFIC','SOUTHERN']);
assert.equal(countries.length, 249, 'Do not change the canonical ISO roster size.');
assert.equal(new Set(countries.map(c => c.code)).size, 249, 'ISO alpha-2 codes must be unique.');
assert.equal(new Set(countries.map(c => c.iso3)).size, 249, 'ISO alpha-3 codes must be unique.');
assert.ok(countries.every(c => /^[A-Z]{2}$/.test(String(c.code))), 'Every record needs a valid ISO alpha-2 code.');
assert.ok(countries.every(c => /^[A-Z]{3}$/.test(String(c.iso3))), 'Every record needs a valid ISO alpha-3 code.');

for (const c of countries) {
  assert.ok(continents.has(c.continent), c.name + ': invalid primary continent');
  assert.ok(Array.isArray(c.continents) && c.continents.includes(c.continent), c.name + ': continent memberships must include primary continent');
  assert.ok(c.continents.every(x => continents.has(x)), c.name + ': unsupported continent membership');
  assert.ok(typeof c.subregion === 'string' && c.subregion.trim(), c.name + ': subregion is missing');
  assert.ok(Array.isArray(c.oceanAccess), c.name + ': oceanAccess must be an array, including [] for landlocked entities');
  assert.equal(new Set(c.oceanAccess).size, c.oceanAccess.length, c.name + ': duplicate ocean membership');
  assert.ok(c.oceanAccess.every(x => oceanIds.has(x)), c.name + ': unknown ocean membership');
  assert.ok(Number.isFinite(c.lat) && c.lat >= -90 && c.lat <= 90, c.name + ': invalid or missing representative latitude');
  assert.ok(Number.isFinite(c.lng) && c.lng >= -180 && c.lng <= 180, c.name + ': invalid or missing representative longitude');
  assert.ok(['COUNTRIES_JSON_EXISTING','NATURAL_EARTH_LABEL_POINT','TOPOJSON_POLYGON_CENTROID'].includes(c.mapPointSource), c.name + ': missing coordinate provenance');
  assert.equal(c.regionalClassificationSource, 'UNSD_M49_AND_NATURAL_EARTH', c.name + ': missing regional provenance');
}
for (const continent of continents) assert.ok(countries.some(c => c.continents.includes(continent)), 'No rows assigned to ' + continent);

assert.equal(world.type, 'FeatureCollection');
assert.equal(world.features.length, 252, 'Expected 249 canonical ISO polygons plus the 3 retained map-only features.');
const codeCounts = new Map();
for (const f of world.features) {
  assert.ok(f.geometry && ['Polygon','MultiPolygon'].includes(f.geometry.type), 'Every land feature must have polygon geometry.');
  const code = String(f.properties?.ISO_A3 || f.properties?.iso_a3 || (/^[A-Z]{3}$/.test(String(f.id)) ? f.id : '')).toUpperCase();
  if (countries.some(c => c.iso3 === code)) codeCounts.set(code, (codeCounts.get(code)||0)+1);
}
assert.equal(codeCounts.size, 249, 'Every canonical country/area must have a polygon.');
for (const c of countries) assert.equal(codeCounts.get(c.iso3), 1, c.name + ': expected exactly one polygon keyed by ISO3.');
assert.ok(world.features.some(f => f.properties?.name === 'Kosovo' || f.id === 'CS-KM'), 'Existing Kosovo map feature must be preserved.');
assert.ok(world.features.some(f => f.properties?.name === 'Northern Cyprus'), 'Existing Northern Cyprus map feature must be preserved.');
assert.ok(world.features.some(f => f.properties?.name === 'Somaliland'), 'Existing Somaliland map feature must be preserved.');

assert.ok(!countries.find(c => c.code === 'LU').oceanAccess.length, 'Luxembourg must remain landlocked');
assert.ok(countries.find(c => c.code === 'HM').oceanAccess.includes('INDIAN'), 'Heard and McDonald Islands should be associated with the Indian Ocean');
assert.ok(countries.find(c => c.code === 'AX').oceanAccess.includes('ATLANTIC'), 'Aland Islands belong to the connected Atlantic basin');
assert.ok(countries.find(c => c.code === 'BV').oceanAccess.includes('ATLANTIC'), 'Bouvet Island belongs to the South Atlantic');
assert.ok(countries.find(c => c.code === 'IO').oceanAccess.includes('INDIAN'), 'British Indian Ocean Territory must be in the Indian Ocean');
assert.ok(countries.find(c => c.code === 'HK').oceanAccess.includes('PACIFIC'), 'Hong Kong belongs to the Pacific basin');
assert.ok(countries.find(c => c.code === 'MO').oceanAccess.includes('PACIFIC'), 'Macao belongs to the Pacific basin');
assert.ok(countries.find(c => c.code === 'NF').oceanAccess.includes('PACIFIC'), 'Norfolk Island belongs to the Pacific');
assert.ok(countries.find(c => c.code === 'JO').oceanAccess.includes('INDIAN'), 'Jordan has a Red Sea/Gulf of Aqaba connection');
assert.ok(countries.find(c => c.code === 'MC').oceanAccess.includes('ATLANTIC'), 'Monaco belongs to the connected Mediterranean/Atlantic basin');
assert.ok(countries.find(c => c.code === 'GS').oceanAccess.includes('ATLANTIC'), 'South Georgia and the South Sandwich Islands belong to the South Atlantic');
assert.ok(countries.find(c => c.code === 'GE').oceanAccess.includes('ATLANTIC'), 'Georgia has Black Sea access connected to the Atlantic basin');
assert.equal(countries.find(c => c.code === 'GS').continent, 'South America', 'South Georgia should not be grouped with North America');
assert.equal(oceans.type, 'FeatureCollection');
assert.equal(oceans.features.length, 5, 'Exactly five ocean basin geometries are required.');
assert.equal(new Set(oceans.features.map(f => f.properties?.oceanId)).size, 5, 'Ocean IDs must be unique.');
for (const oceanId of oceanIds) {
  assert.ok(countries.some(c => c.oceanAccess.includes(oceanId)), 'Every ocean must have at least one assigned country/area: ' + oceanId);
}
for (const f of oceans.features) {
  assert.ok(oceanIds.has(f.properties.oceanId), 'Unsupported ocean: ' + f.properties.oceanId);
  assert.ok(f.geometry && ['Polygon','MultiPolygon'].includes(f.geometry.type), f.properties.name + ': invalid ocean geometry');
}
assert.ok(runtime.includes('OMEGAGeographicRegionSystem'), 'Region selector runtime must expose its public API.');
assert.ok(runtime.includes('featureMember'), 'Region selection must update actual polygon layers.');
assert.ok(runtime.includes('"NORTHERN CYPRUS": ["Asia", "Europe"]'), 'Northern Cyprus must remain included in geographic group highlighting.');
assert.ok(runtime.includes('"SOMALILAND": ["Africa"]'), 'Somaliland must remain included in Africa group highlighting.');
assert.ok(runtime.includes('"SOMALILAND": ["INDIAN"]'), 'Somaliland must remain included in the Indian Ocean group where appropriate.');

assert.ok(runtime.includes('zoomToCountry'), 'Country list entries must navigate to the map polygon.');
assert.ok(html.includes('id="btn-quick-layers"'), 'The satellite/layer quick-tool must remain available.');
assert.ok(html.includes('id="layers-drawer"'), 'The existing map layer drawer must remain available.');
assert.ok(html.includes('id="omega-geographic-region-selector"'), 'The region selector must be embedded in the map layer drawer.');
assert.ok(html.includes('id="omega-region-select"'), 'The region dropdown must be present in the layer drawer markup.');
for (const value of ['continent:Africa','continent:Antarctica','continent:Asia','continent:Europe','continent:North America','continent:Oceania','continent:South America','ocean:ARCTIC','ocean:ATLANTIC','ocean:INDIAN','ocean:PACIFIC','ocean:SOUTHERN']) {
  assert.ok(html.includes('value="' + value + '"'), 'Missing drawer region option: ' + value);
}
assert.ok(runtime.includes('document.getElementById("omega-region-select")'), 'Runtime must bind the embedded drawer dropdown.');
assert.ok(!runtime.includes('L.control({position:"bottomright"})'), 'The region picker must not create a separate floating Leaflet control.');
assert.ok(css.includes('.omega-region-drawer-section'), 'Drawer-integrated region selector must be styled.');

assert.ok(runtime.includes('function setBoundaryGlow('), 'Selected region borders must use the dedicated glow helper.');
assert.ok(runtime.includes('omega-region-boundary-glow'), 'Region highlighting must mark actual Leaflet path elements for glow styling.');
assert.ok(runtime.includes('originalSelectCountry.apply(this, arguments)'), 'Manual country selection must continue to work after group selection.');
assert.ok(runtime.includes('if (state.selected) setSelection("")'), 'Direct country clicks must clear stale continent/ocean selection.');
assert.match(runtime, /fillOpacity: 0\.16/, 'Group highlighting should preserve satellite visibility instead of flooding country interiors.');
assert.ok(css.includes('.leaflet-overlay-pane path.omega-region-boundary-glow'), 'Glow must be applied to the actual SVG polygon paths.');
assert.ok(css.includes('drop-shadow('), 'Selected boundaries require a visible colored glow.');



console.log(JSON.stringify({
  countries: countries.length,
  allCountryRecordsHaveCoordinates: countries.every(c => Number.isFinite(c.lat) && Number.isFinite(c.lng)),
  continentMemberships: Object.fromEntries([...continents].map(x => [x,countries.filter(c => c.continents.includes(x)).length])),
  oceanMemberships: Object.fromEntries([...oceanIds].map(x => [x,countries.filter(c => c.oceanAccess.includes(x)).length])),
  polygonFeatures: world.features.length,
  canonicalPolygonCount: codeCounts.size,
  oceanGeometryCount: oceans.features.length,
  result: 'PASS'
}, null, 2));
