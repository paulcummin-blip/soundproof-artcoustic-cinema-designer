import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register, createRequire } from 'node:module';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

register('./_alias-loader.mjs', import.meta.url);
const { ensureAtmosOverheads, DOLBY_PRESETS, seedSpeakersFromPreset } =
  await import('../src/components/room/utils/dolbyHelpers.jsx');
const { hydrateProjectIntoAppState } =
  await import('../src/components/utils/hydrateProjectIntoAppState.jsx');
const { buildDesignState } = await import('../src/lib/versionAuthority.js');
const { parse } = createRequire(import.meta.url)('@babel/parser');

// Execute the actual production hook, provider readiness/setter declarations,
// hydration helper and plan-view effect. Only the surrounding UI is replaced.
// No SDK calls, dealer records, localStorage saves or network writes.
const providerSource = fs.readFileSync('src/components/AppStateProvider.jsx', 'utf8');
const hookSource = fs.readFileSync('src/components/hooks/useSpeakerSystemStore.jsx', 'utf8');
const planSource = fs.readFileSync('src/components/room/RoomVisualisation.jsx', 'utf8');
function findNode(source, predicate) {
  let result;
  function walk(node) {
    if (!node || typeof node !== 'object' || result) return;
    if (predicate(node)) { result = node; return; }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(parse(source, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(result, 'production source node exists');
  return source.slice(result.start, result.end);
}
const readinessSource = providerSource.slice(
  providerSource.indexOf('  const [isHydrated, setIsHydrated]'),
  providerSource.indexOf('  const [perSeatMetrics, setPerSeatMetrics]')
);
const useReadiness = new Function('React', `
  const { useState, useRef, useCallback } = React;
  const __isFreeUse = false;
  ${readinessSource}
  return { isProjectHydrationReady, setProjectHydrationReady,
    getSpeakerHydrationScope: typeof getSpeakerHydrationScope === 'function'
      ? getSpeakerHydrationScope : undefined };
`);
const sameSpeakers = new Function('return (' + findNode(providerSource,
  n => n.type === 'FunctionDeclaration' && n.id?.name === 'speakersShallowEqual') + ')')();
const setterDeclaration = findNode(providerSource,
  n => n.type === 'VariableDeclarator' && n.id?.name === 'setSpeakerSystem');
const useSpeakerSetter = new Function('React', '_setSpeakerSystem', 'speakersShallowEqual',
  'const { useCallback } = React; const ' + setterDeclaration + '; return setSpeakerSystem;');
const hookBody = findNode(hookSource,
  n => n.type === 'FunctionDeclaration' && n.id?.name === 'useSpeakerSystemStore');
const makeHook = new Function('React', 'useAppState', 'ensureAtmosOverheads',
  'DOLBY_PRESETS', 'seedSpeakersFromPreset', 'return (' + hookBody + ')');
const planEffect = findNode(planSource, n => n.type === 'CallExpression'
  && n.callee?.name === 'useEffect'
  && planSource.slice(n.start, n.end).includes('slsrDefaultCapturedRef'));
const runPlanEffect = new Function('placedSpeakers', 'onSetSpeakers',
  'const useEffect = fn => fn(); const getCanonicalRole = role => role;'
  + 'const slsrDefaultCapturedRef = {current:new Set()}; ' + planEffect + ';');

const room = { widthM: 5.6, lengthM: 6.69, heightM: 2.4 };
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(layout, model) {
  const speakers = seedSpeakersFromPreset({
    preset: layout, roomDimensions: { width: room.widthM, length: room.lengthM, height: room.heightM }
  }).map(s => ({ ...s, model: s.role.startsWith('T') ? model : 'q6-3' }));
  return { dolby_config: layout, selected_speakers: speakers,
    room_width: room.widthM, room_length: room.lengthM, room_height: room.heightM,
    overhead_global_model: model, seating_positions: [], subwooferInstances: [] };
}
const A = fixture('5.1.4', 'architect-mikro');
const B = fixture('9.1.6', 'architect-2-1');
const overheads = speakers => speakers.filter(s => s.role.startsWith('T'))
  .map(s => [s.role, s.model]).sort(([a], [b]) => a.localeCompare(b));
const expectedB = overheads(B.selected_speakers);

function mount() {
  let app, store, root;
  let delayUpdates = false;
  const queued = [];
  const useStore = makeHook(React, () => app, ensureAtmosOverheads, DOLBY_PRESETS, seedSpeakersFromPreset);
  function Harness() {
    const [speakerSystem, rawSet] = React.useState({ placedSpeakers: [] });
    const [dolbyLayout, setDolbyLayout] = React.useState('5.1.4');
    const [overheadGlobalModel, setOverheadGlobalModel] = React.useState('architect-mikro');
    const readiness = useReadiness(React);
    const enqueue = React.useCallback(updater => {
      if (delayUpdates) queued.push(() => rawSet(updater));
      else rawSet(updater);
    }, []);
    const setSpeakerSystem = useSpeakerSetter(React, enqueue, sameSpeakers);
    app = { ...readiness, speakerSystem, setSpeakerSystem, dolbyLayout,
      setDolbyLayout, overheadGlobalModel, setOverheadGlobalModel, roomDims: room,
      useFrontGlobal: true, useMidGlobal: true, useRearGlobal: true };
    store = useStore();
    return null;
  }
  act(() => { root = TestRenderer.create(React.createElement(Harness)); });
  function hydrate(design, finish = true) {
    app.setProjectHydrationReady(false);
    hydrateProjectIntoAppState(clone(design), app, {
      setSpeakerSystem: app.setSpeakerSystem,
      setDolbyPreset: app.setDolbyLayout,
      setOverheadGlobalModel: app.setOverheadGlobalModel,
    });
    if (finish) app.setProjectHydrationReady(true);
  }
  act(() => hydrate(A));
  return {
    get app() { return app; }, get store() { return store; },
    hydrate,
    delay() { delayUpdates = true; },
    flush() { delayUpdates = false; queued.splice(0).forEach(run => run()); },
    close() { act(() => root.unmount()); }
  };
}

for (const phase of ['loading', 'loaded']) {
  test('A 5.1.4 → B 9.1.6: stale plan callback preserves all six ARCHITECT models (' + phase + ')', () => {
    const h = mount();
    try {
      const oldSetter = h.store.setSpeakers;
      const oldPlanSpeakers = h.store.placedSpeakers;
      act(() => {
        h.hydrate(B, phase === 'loaded');
        // Exactly the escaped sequence: B restoration queued, then A's plan
        // effect queues a functional update carrying A's layout.
        runPlanEffect(oldPlanSpeakers, oldSetter);
      });
      assert.deepEqual(overheads(h.store.placedSpeakers), expectedB);
      if (phase === 'loading') act(() => h.app.setProjectHydrationReady(true));
      // A subsequent current-layout update must not reseed blank middle roles.
      act(() => h.store.setSpeakers(prev => prev));
      assert.deepEqual(overheads(h.store.placedSpeakers), expectedB);
      const saved = JSON.parse(JSON.stringify(buildDesignState({
        ...B, selected_speakers: h.store.placedSpeakers
      })));
      assert.deepEqual(overheads(saved.selected_speakers), expectedB);
      act(() => h.hydrate(A));
      act(() => h.hydrate(saved));
      assert.deepEqual(overheads(h.store.placedSpeakers), expectedB);
    } finally { h.close(); }
  });
}

test('already-queued A updater is rejected when it executes after B hydration', () => {
  const h = mount();
  try {
    h.delay();
    let called = 0;
    h.store.setSpeakers(prev => { called++; return prev; });
    // Release queueing for hydration without executing the held updater.
    // The hydration raw setters are queued too; flush ordering is controlled by
    // first advancing the synchronous readiness scope, then draining A.
    act(() => h.app.setProjectHydrationReady(false));
    act(() => h.flush());
    assert.equal(called, 0, 'guard is checked inside the queued functional update');
    act(() => h.hydrate(B));
    assert.deepEqual(overheads(h.store.placedSpeakers), expectedB);
  } finally { h.close(); }
});

test('callback rendered while loading stays invalid after loading completes', () => {
  const h = mount();
  try {
    act(() => h.hydrate(B, false));
    const loadingSetter = h.store.setSpeakers;
    act(() => h.app.setProjectHydrationReady(true));
    let called = false;
    act(() => loadingSetter(prev => { called = true; return []; }));
    assert.equal(called, false);
    assert.deepEqual(overheads(h.store.placedSpeakers), expectedB);
  } finally { h.close(); }
});

test('current-version edits and intentional 9.1.6 → 5.1.4 layout changes still work', () => {
  const h = mount();
  try {
    act(() => h.hydrate(B));
    act(() => h.store.setSpeakers(prev => prev.map(s =>
      s.role === 'TML' ? { ...s, model: 'architect-mikro' } : s)));
    assert.equal(h.store.placedSpeakers.find(s => s.role === 'TML').model, 'architect-mikro');
    act(() => h.app.setDolbyLayout('5.1.4'));
    act(() => h.store.setSpeakers(prev => prev));
    assert.equal(overheads(h.store.placedSpeakers).length, 4);
    assert.ok(!h.store.placedSpeakers.some(s => s.role === 'TML' || s.role === 'TMR'));
    act(() => h.hydrate(A));
    assert.deepEqual(overheads(h.store.placedSpeakers), overheads(A.selected_speakers));
  } finally { h.close(); }
});

test('blank saved overheads remain blank; the correction never invents assignments', () => {
  const h = mount();
  try {
    const blank = clone(B);
    blank.selected_speakers.find(s => s.role === 'TML').model = '';
    act(() => h.hydrate(blank));
    act(() => h.store.setSpeakers(prev => prev));
    assert.equal(h.store.placedSpeakers.find(s => s.role === 'TML').model, '');
  } finally { h.close(); }
});
