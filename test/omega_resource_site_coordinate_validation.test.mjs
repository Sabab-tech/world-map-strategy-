import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const catalog = JSON.parse(read('resource_site_canonical_catalog_v1.json'));
const world = JSON.parse(read('world.json'));
const binding = read('omega_resource_gameplay_binding_v1.js');

function containsRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (((a[1] > lat) !== (b[1] > lat)) &&
        lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function containsPolygon(lng, lat, rings) {
  return rings.length > 0 && containsRing(lng, lat, rings[0]) &&
    !rings.slice(1).some(ring => containsRing(lng, lat, ring));
}
function containsGeometry(lng, lat, geometry) {
  if (geometry.type === 'Polygon') return containsPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => containsPolygon(lng, lat, poly));
  return false;
}
function bounds(geometry) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  function walk(node) {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      b[0] = Math.min(b[0], node[0]); b[1] = Math.min(b[1], node[1]);
      b[2] = Math.max(b[2], node[0]); b[3] = Math.max(b[3], node[1]); return;
    }
    node.forEach(walk);
  }
  walk(geometry.coordinates);
  return b;
}
const features = world.features.map(feature => ({...feature, bounds: bounds(feature.geometry)}));
function audit(site) {
  const c = site.location?.coordinates || site.coordinates || {};
  const lng = Number(c.lng), lat = Number(c.lat);
  const owner = features.find(feature => String(feature.id).toUpperCase() === String(site.countryId).toUpperCase());
  const inOwner = owner && lng >= owner.bounds[0] && lng <= owner.bounds[2] &&
    lat >= owner.bounds[1] && lat <= owner.bounds[3] && containsGeometry(lng, lat, owner.geometry);
  if (inOwner) return {status: 'INSIDE_OWNER'};
  for (const feature of features) {
    if (String(feature.id).toUpperCase() === String(site.countryId).toUpperCase()) continue;
    const b = feature.bounds;
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    if (containsGeometry(lng, lat, feature.geometry)) {
      return {status: owner ? 'INSIDE_OTHER_COUNTRY' : 'OWNER_GEOMETRY_MISSING', containingCountryId: feature.id};
    }
  }
  return {status: owner ? 'OFFSHORE_OR_OUTSIDE_LAND' : 'OWNER_GEOMETRY_MISSING'};
}
const byId = new Map(catalog.sites.map(site => [site.siteId, site]));

test('all 199 canonical sites are audited against the checked-in country geometry', () => {
  assert.equal(catalog.sites.length, 199);
  assert.ok(world.features.length >= 170, 'country geometry must include world country polygons');
  for (const site of catalog.sites) {
    const coordinates = site.location?.coordinates || site.coordinates;
    assert.ok(Number.isFinite(Number(coordinates?.lat)), site.siteId+' latitude');
    assert.ok(Number.isFinite(Number(coordinates?.lng)), site.siteId+' longitude');
    assert.ok(audit(site).status, site.siteId+' must receive a coordinate-audit status');
  }
});

test('known onshore sites remain inside their assigned country', () => {
  for (const id of [
    'SITE_BGD_barapukuria_coal_mine',
    'SITE_IND_gevra_oc_mine',
    'SITE_PAK_thar_block_ii_coal_mine'
  ]) {
    assert.equal(audit(byId.get(id)).status, 'INSIDE_OWNER', id+' must map inside its owning country');
  }
});

test('proven wrong-country land coordinates are quarantined; missing owner geometry is reported', () => {
  const result = audit(byId.get('SITE_TLS_bayu_undan_gas_and_condensate_field'));
  assert.equal(result.status, 'INSIDE_OTHER_COUNTRY', 'Bayu-Undan coordinates must not be attributed to Indonesia');
  assert.equal(result.containingCountryId, 'IDN');

  // The bundled GeoJSON omits several microstates and Singapore. Those sites cannot
  // be declared wrong from this polygon alone; they must remain explicitly unresolved.
  for (const [id, containingCountryId] of [
    ['SITE_SGP_pulau_ubin_granite_quarry_sites', 'MYS'],
    ['SITE_AND_llorts_iron_mine', 'FRA'],
    ['SITE_MCO_no_verified_commercial_mining_site', 'FRA'],
    ['SITE_SMR_no_verified_commercial_mining_site', 'ITA'],
    ['SITE_LIE_no_verified_commercial_mining_site', 'AUT'],
    ['SITE_VAT_no_verified_commercial_mining_site', 'ITA']
  ]) {
    const unresolved = audit(byId.get(id));
    assert.equal(unresolved.status, 'OWNER_GEOMETRY_MISSING', id+' owner polygon is absent');
    assert.equal(unresolved.containingCountryId, containingCountryId, id+' containing-country diagnosis');
  }
  assert.match(binding, /s\.coordinateValidation\?\.status==='INSIDE_OTHER_COUNTRY'/,
    'markers with proven cross-country coordinates must not be drawn at a false location');
  assert.match(binding, /unresolvedOwnerGeometry/,
    'sites whose owner polygon is missing must remain explicitly listed in diagnostics');
  assert.match(binding, /__OMEGA_RESOURCE_COORDINATE_AUDIT__/,
    'quarantined and unresolved source records must remain visible in diagnostics instead of being silently discarded');
});

test('runtime loads world geometry and preserves offshore sites as a separate status', () => {
  assert.match(binding, /'world\.json'/, 'runtime must load the local country GeoJSON');
  assert.match(binding, /OFFSHORE_OR_OUTSIDE_LAND/, 'offshore sites must not be falsely labelled as wrong-country land sites');
  assert.match(binding, /INSIDE_OWNER/, 'onshore ownership must be checked against the assigned country');
});
