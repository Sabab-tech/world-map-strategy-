import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('UNIDO mirror preflight runs only for source-data changes and uses the small bundle', () => {
  const workflow = read('.github/workflows/country-factory-establishment-data-v1.yml');
  const mirrorJobs = workflow.match(/^  mirror-preflight:$/gm) || [];
  const refreshJobs = workflow.match(/^  refresh:$/gm) || [];

  assert.equal(mirrorJobs.length, 1, 'there must be exactly one mirror-preflight job');
  assert.equal(refreshJobs.length, 1, 'there must be exactly one refresh job');
  assert.ok(workflow.includes('mirror_source_changed: ${{ steps.mirror_source_scope.outputs.changed }}'));
  assert.ok(workflow.includes('id: mirror_source_scope'));
  assert.ok(workflow.includes('git diff --name-only "$BASE_SHA" HEAD'));
  assert.ok(workflow.includes('factory_isic_mapping_v1\\.json'));
  assert.ok(workflow.includes('country_factory_establishment_data_v1\\.json'));
  assert.ok(workflow.includes('scripts/build_country_factory_establishment_data_v1\\.mjs'));
  assert.ok(workflow.includes('scripts/export_unido_indstat_establishments\\.py'));
  assert.ok(workflow.includes("mirror-preflight:\n    if: ${{ github.event_name == 'pull_request' && needs.validate.outputs.mirror_source_changed == 'true' }}"));
  assert.ok(workflow.includes('python -m subsetsio sync --bundle small'));
  assert.equal(workflow.includes('--bundle large'), false, 'the 20 GB wide bundle must not be downloaded');
});

test('UNIDO establishment exports are restricted to the recent 2015–2024 reporting window', () => {
  const exporter = read('scripts/export_unido_indstat_establishments.py');
  assert.match(exporter, /MIN_YEAR = 2015/);
  assert.match(exporter, /MAX_YEAR = 2024/);
  assert.match(exporter, /BETWEEN \{MIN_YEAR\\} AND \{MAX_YEAR\\}/);
  assert.match(exporter, /"query_year_range": \[MIN_YEAR, MAX_YEAR\]/);
});
