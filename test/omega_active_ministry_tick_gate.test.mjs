import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const appSource=fs.readFileSync(path.join(root,'omega_ui_v2/app.js'),'utf8');
const coordinator=fs.readFileSync(path.join(root,'omega_enterprise_composition_root_v10.js'),'utf8');

test('UI v2 exposes the active route, ministry and selected country to the time coordinator',()=>{
  const browser={};
  const context=vm.createContext({window:browser,globalThis:browser,console});
  vm.runInContext(appSource,context,{filename:'omega_ui_v2/app.js'});
  const state={
    route:'ministry-detail',ministryId:'foreign_affairs',countryId:'BGD',
    section:'dashboard',governmentView:'executive-ministry'
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(browser.OmegaUIV2App.getActiveContext({__omegaUIV2State:state}))),
    {route:'ministry-detail',ministryId:'foreign_affairs',countryId:'BGD',section:'dashboard',governmentView:'executive-ministry'}
  );
  assert.equal(browser.OmegaUIV2App.getActiveContext({__omegaUIV2State:{route:'map',ministryId:null,countryId:'BGD'}}).ministryId,null);
});

test('the simulation ministry pump dispatches at most the currently visible ministry',()=>{
  assert.match(coordinator,/OmegaUIV2App\?\.getActiveContext/);
  assert.match(coordinator,/viewToRuntimeId/);
  assert.match(coordinator,/viewToRuntimeId\[key\]/);
  assert.doesNotMatch(coordinator,/MINISTRIES\.forEach\(id\s*=>\s*\{\s*if\s*\(typeof kernel\.pumpOrchestratedPipelineTick/);
  assert.match(coordinator,/if \(!id\) return results;/);
});
