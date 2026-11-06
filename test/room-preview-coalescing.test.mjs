import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the production hook with deterministic hooks/timers and a controllable
// worker. Physics is stubbed: these tests exercise dispatch and acceptance only.
function harness() {
  let cursor = 0, time = 0, timerId = 0;
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
    URL, Worker, Date: { now: () => time },
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
  const source = fs.readFileSync('src/components/room/bass/useNormalizedRoomTransferLive.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function')
    .replaceAll('import.meta.url', '"file:///preview/hook.js"');
  vm.runInContext(source, context);
  const base = {
    roomDims: { widthM: 4, lengthM: 6, heightM: 2.4, fingerprint: 'a' },
    rspPosition: { x: 2, y: 3 }, seatingPositions: [],
    subsForSimulation: [{ x: 1, y: 1, z: 0.2 }], physicsOptions: {},
    analysisRequestId: 'room-preview', followCurrentGeometry: true,
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
  return { render, tick, workers };
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
