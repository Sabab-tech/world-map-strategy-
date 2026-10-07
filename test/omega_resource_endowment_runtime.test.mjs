import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot=new URL('../',import.meta.url);
const resourceFiles=new Map([
  ['resources.json',new URL('../resources.json',import.meta.url)],
  ['resources_2.json',new URL('../resources_2.json',import.meta.url)],
  ['resource_site_reserve_simulation_v1.json',new URL('../resource_site_reserve_simulation_v1.json',import.meta.url)],
  ['resource_site_canonical_catalog_v1.json',new URL('../resource_site_canonical_catalog_v1.json',import.meta.url)]
]);
const nativeFetch=globalThis.fetch;
;