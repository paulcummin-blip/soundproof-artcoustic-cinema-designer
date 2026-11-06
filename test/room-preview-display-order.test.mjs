import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { classifyRoomPreviewResponse } from '../src/components/room/bass/roomPreviewDisplayPolicy.js';

// Execute the production hook with deterministic hooks/timers and a controllable
// worker. Physics is stubbed: these tests exercise dispatch and acceptance only.
function harness() {
  let cursor = 0, time = 0, timerId = 0, liveDragging = false;
  const slots = [], effects = [], timers = new Map(), workers = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const memo = (fn, deps) => {
    const i = cursor++;
    if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
    return slots[i].value;
  };
  class Worker {
    constructor() { this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(message) { this.messages.push({ message, time }); }
    terminate() { this.terminated = true; }
    complete(index, result) {
      this.onmessage({ data: { ...this.messages[index].message, type: 'complete', result } });
    }
  }
  const context = vm.createContext({
    classifyRoomPreviewResponse, URL, Worker, Date: { now: () => time },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState: initial => { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !equal(slots[i].deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
    computeNormalizedTransferFingerprint: ({ roomDims }) => roomDims.fingerprint,
    buildPreviewPhysicsOptions: x => x,
    canonicalizeNormalizedRoomInputs: x => x,
  });
  context.useLayoutEffect = context.useEffect;
  const source = fs.readFileSync('src/components/room/bass/useNormalizedRoomTransferLive.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function')
    .replaceAll('import.meta.url', '"file:///preview/hook.js"');
  vm.runInContext(source, context);
  const base = {
    roomDims: { widthM: 4, lengthM: 6, heightM: 2.4, fingerprint: 'a' },
    rspPosition: { x: 2, y: 3 }, seatingPositions: [],
    subsForSimulation: [{ x: 1, y: 1, z: 0.2 }], physicsOptions: {},
    analysisRequestId: 'room-preview', followCurrentGeometry: true,
    previewContextKey: 'project/version/design', isInteractionActive: () => liveDragging,
  };
  let props = base;
  const render = (fingerprint, extra = {}) => {
    props = { ...props, ...extra, roomDims: { ...base.roomDims, fingerprint } };
    cursor = 0; const value = context.useNormalizedRoomTransferLive(props);
    while (effects.length) effects.shift()();
    return value;
  };
  const tick = ms => {
    const end = time + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  };
  return { render, tick, workers, setLiveDragging: value => { liveDragging = value; } };
}

test('continuous geometry changes retain the original coalescing deadline and post latest geometry', () => {
  const h = harness();
  h.render('a'); h.tick(16); h.render('b'); h.tick(16); h.render('c');
  h.tick(16); h.render('d'); h.tick(2);
  assert.equal(h.workers.length, 1);
  assert.equal(h.workers[0].messages.length, 1);
  assert.equal(h.workers[0].messages[0].time, 50);
  assert.equal(h.workers[0].messages[0].message.fingerprint, 'd');
});

test('obsolete results never replace current curves; pending work uses latest geometry', () => {
  const h = harness();
  h.render('a'); h.tick(50);
  const worker = h.workers[0];
  worker.complete(0, { id: 'valid-a' });
  assert.equal(h.render('a').result.id, 'valid-a');
  h.render('b'); h.tick(50); h.render('c'); h.render('d');
  worker.complete(1, { id: 'obsolete-b' });
  assert.equal(h.render('d').result.id, 'valid-a');
  assert.equal(worker.messages.length, 3);
  assert.equal(worker.messages[2].message.fingerprint, 'd');
  assert.equal(worker.terminated, false);
  worker.complete(2, { id: 'valid-d' });
  assert.equal(h.render('d').result.id, 'valid-d');
});

test('explicit request mismatch and disabled automatic preview still prevent dispatch', () => {
  const h = harness();
  h.render('a', { followCurrentGeometry: false, analysisRequestFingerprint: 'old' });
  h.tick(100); assert.equal(h.workers.length, 0);
  h.render('a', { analysisRequestFingerprint: 'a' }); h.tick(25);
  h.render('b'); h.tick(100); assert.equal(h.workers.length, 0);
  h.render('b', { followCurrentGeometry: true, analysisRequestId: null });
  h.tick(100); assert.equal(h.workers.length, 0);
});

test('owner requests automatic preview without a delayed fingerprint feedback effect', () => {
  const owner = fs.readFileSync('src/components/room/bass/BassBackgroundAnalysisOwner.jsx', 'utf8');
  assert.match(owner, /followCurrentGeometry: true/);
  assert.doesNotMatch(owner, /setRoomPreviewFp/);
});
test('moving preview advances monotonically, retains updating, then settles exactly and refines', () => {
  const h = harness(); h.setLiveDragging(true);
  h.render('a', { interactionActive: true }); h.tick(50);
  h.render('b'); h.render('c');
  const w = h.workers[0];
  w.complete(0, { id: 'a' });
  assert.equal(h.render('c').result.id, 'a');
  assert.equal(h.render('c').status, 'calculating');
  assert.equal(w.messages[1].message.fingerprint, 'c');
  h.render('d'); w.complete(1, { id: 'c' });
  assert.equal(h.render('d').result.id, 'c');
  // Duplicate a must not overwrite c or clear the active d slot.
  w.complete(0, { id: 'late-a' });
  assert.equal(h.render('d').result.id, 'c');
  h.setLiveDragging(false);
  // Reject even an exact response immediately after release, before render.
  w.complete(2, { id: 'released-old-d' });
  assert.equal(h.render('final', { interactionActive: false }).result.id, 'c');
  h.tick(50);
  assert.equal(w.messages.at(-1).message.fingerprint, 'final');
  w.complete(w.messages.length - 1, { id: 'final-preview' });
  assert.equal(h.render('final').status, 'ready');
  assert.equal(h.render('final').result.id, 'final-preview');
  h.tick(230);
  const refined = h.workers.at(-1);
  assert.equal(refined.messages[0].message.quality, 'refined');
  refined.complete(0, { id: 'final-refined' });
  assert.equal(h.render('final').result.id, 'final-refined');
  assert.equal(h.render('final').quality, 'refined');
  w.complete(1, { id: 'late-c' });
  assert.equal(h.render('final').result.id, 'final-refined');
});

test('context changes and gesture restarts reject work from the previous epoch', () => {
  const h = harness(); h.setLiveDragging(true);
  h.render('a', { interactionActive: true }); h.tick(50);
  h.render('b', { previewContextKey: 'other-version' });
  h.workers[0].complete(0, { id: 'old-version' });
  assert.equal(h.render('b').result, null);
  h.setLiveDragging(false); h.render('b', { interactionActive: false });
  h.setLiveDragging(true); h.render('c', { interactionActive: true });
  h.workers[0].complete(1, { id: 'old-gesture' });
  assert.equal(h.render('c').result, null);
  h.workers[0].complete(2, { id: 'new-gesture' });
  assert.equal(h.render('c').result.id, 'new-gesture');
});

test('refined current result cannot be overwritten by a delayed preview', () => {
  const h = harness(); h.render('a'); h.tick(280);
  h.workers[1].complete(0, { id: 'refined' });
  h.workers[0].complete(0, { id: 'late-preview' });
  assert.equal(h.render('a').result.id, 'refined');
  assert.equal(h.render('a').quality, 'refined');
});

test('cancelling back to a cached refined position raises the display generation floor', () => {
  const h = harness(); h.render('a'); h.tick(280);
  h.workers[0].complete(0, { id: 'preview-a' });
  h.workers[1].complete(0, { id: 'refined-a' });
  h.setLiveDragging(true); h.render('b', { interactionActive: true }); h.tick(50);
  h.setLiveDragging(false); h.render('a', { interactionActive: false });
  h.workers[0].complete(1, { id: 'late-b' });
  assert.equal(h.render('a').result.id, 'refined-a');
  assert.equal(h.render('a').status, 'ready');
});
test('listener selection changes invalidate in-flight drag work without changing full geometry identity', () => {
  const h=harness();h.setLiveDragging(true);
  h.render('a',{interactionActive:true,previewListenerSelection:{mode:'rsp'}});h.tick(50);
  const w=h.workers[0];
  assert.equal(w.messages[0].message.payload.pointsPerOctave,32);
  h.render('a',{previewListenerSelection:{mode:'seat',seatId:'s2'}});
  w.complete(0,{id:'wrong-rsp'});
  assert.equal(h.render('a').result,null);
  assert.equal(w.messages[1].message.fingerprint,'a');
  assert.equal(w.messages[1].message.payload.listenerSelection.seatId,'s2');
  w.complete(1,{id:'s2'});
  assert.equal(h.render('a').result.id,'s2');
  h.render('b',{previewListenerSelection:{mode:'all'}});h.tick(50);
  assert.equal(w.messages.at(-1).message.payload.pointsPerOctave,8);
  h.setLiveDragging(false);h.render('b',{interactionActive:false});h.tick(280);
  const refined=h.workers.at(-1).messages[0].message;
  assert.equal(refined.quality,'refined');
  assert.equal(refined.payload.listenerSelection,undefined);
  assert.equal(refined.payload.pointsPerOctave,undefined);
});

