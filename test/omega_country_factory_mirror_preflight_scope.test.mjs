import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('20 GB UNIDO mirror preflight is limited to actual source-data input changes', () => {
  const workflow = read('.github/workflows/country-factory-establishment-data-v1.yml');
  assert.match(workflow, /mirror_source_changed:\\s*\\$\\{\\{\\s*steps\\.mirror-source-scope\\.outputs\\.changed\\s*\\}\\}/);
  assert.match(workflow, /id: mirror-source-scope[\\s\\S]*?git diff --name-only "\\$BASE_SHA" HEAD/);
  assert.match(workflow, /factory_isic_mapping_v1\\\\?\\.json/);
  assert.match(workflow, /country_factory_establishment_data_v1\\\\?\\.json/);
  assert.match(workflow, /scripts\\/build_country_factory_establishment_data_v1\\\\?\\.mjs/);
  assert.match(workflow, /scripts\\/export_unido_indstat_establishments\\\\?\\.py/);
  assert.match(workflow, /mirror-preflight:\\s*\\n\\s*if: github\\.event_name == 'pull_request' && needs\\.validate\\.outputs\\.mirror_source_changed == 'true'/);
});
