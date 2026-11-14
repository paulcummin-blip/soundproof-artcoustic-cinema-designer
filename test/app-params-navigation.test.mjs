import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/lib/app-params.js', 'utf8')
  .replaceAll('import.meta.env', 'env')
  .replaceAll('export const ', 'const ');
function storage(initial = {}, full = false) {
  const data = new Map(Object.entries(initial));
  return { data, full, getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { if (this.full) throw new DOMException('Full', 'QuotaExceededError'); data.set(key, value); },
    removeItem(key) { data.delete(key); } };
}
function boot(localStorage, sessionStorage, query = '') {
  const window = { localStorage, sessionStorage, location: new URL('https://preview.example/Projects' + query),
    history: { replaceState(_state, _title, url) { window.location = new URL(url, window.location); } } };
  const context = vm.createContext({ window, document: { title: 'Sound Proof' }, URLSearchParams,
    env: { VITE_BASE44_APP_ID: 'app', VITE_BASE44_BACKEND_URL: 'https://base44.app' } });
  return vm.runInContext(source + '\n({ appParams, window, clear: typeof clearAppParamAuthFallback === "function" ? clearAppParamAuthFallback : undefined })', context);
}
const query = '?access_token=fresh-preview-token&server_url=https%3A%2F%2Fpreview.example&base44_data_env=prod';

test('full localStorage: fresh preview token and backend survive full page navigation', () => {
  const local = storage({ base44_access_token: 'old-token', base44_server_url: 'https://base44.app' }, true);
  const session = storage();
  const first = boot(local, session, query);
  assert.equal(first.appParams.token, 'fresh-preview-token');
  assert.equal(first.window.location.search.includes('access_token'), false);
  assert.equal(first.window.location.search.includes('base44_data_env=prod'), true);
  const next = boot(local, session);
  assert.equal(next.appParams.token, 'fresh-preview-token');
  assert.equal(next.appParams.serverUrl, 'https://preview.example');
});

test('healthy storage: explicit preview backend survives build default on reload', () => {
  const local = storage(), session = storage();
  boot(local, session, query);
  const next = boot(local, session);
  assert.equal(next.appParams.token, 'fresh-preview-token');
  assert.equal(next.appParams.serverUrl, 'https://preview.example');
  assert.equal(session.data.size, 0);
});

test('a later successful token write replaces the quota fallback', () => {
  const local = storage({}, true), session = storage();
  boot(local, session, query);
  local.full = false;
  boot(local, session, '?access_token=replacement-token');
  assert.equal(boot(local, session).appParams.token, 'replacement-token');
  assert.equal(session.getItem('soundproof:app-param-fallback:base44_access_token'), null);
});

test('logout removes fallback, SDK token cleanup leaves no token after reload', () => {
  const local = storage({ base44_access_token: 'old-token' }, true), session = storage();
  const first = boot(local, session, query);
  assert.equal(typeof first.clear, 'function');
  first.clear();
  local.removeItem('base44_access_token');
  assert.equal(boot(local, session).appParams.token, null);
});

test('no credentials are invented when both stores are unavailable', () => {
  const denied = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  const result = boot(denied, denied);
  assert.equal(result.appParams.token, null);
  assert.equal(result.appParams.serverUrl, 'https://base44.app');
});

test('published default remains available without preview overrides', () => {
  assert.equal(boot(storage(), storage()).appParams.serverUrl, 'https://base44.app');
});
