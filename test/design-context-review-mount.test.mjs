/**
 * Design Context review hook — mount lifecycle regression.
 *
 * Mounts the REAL useDesignContextReview hook with react-test-renderer and
 * a controllable base44 mock to prove the four lifecycle guarantees the
 * Technical Report and Proposal generation flows depend on:
 *
 *   1. Skipping every question calls NO saveDesignContext — no unnecessary
 *      DesignContext record is created.
 *   2. A discovery failure proceeds (review returns true) so generation is
 *      never stuck waiting on a dialog that cannot open.
 *   3. A save failure proceeds (review returns true) so generation is never
 *      stuck after the designer answered.
 *   4. Unmounting while a review is pending resolves the promise (returns
 *      false) so no generation promise stays unresolved when the page is
 *      navigated away.
 *
 * Run: node --experimental-vm-modules test/design-context-review-mount.test.mjs
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

// Register the mount loader BEFORE any @/ imports.
register('./_mount-loader.mjs', import.meta.url);

// Install browser globals before React hooks run.
const { installBrowserGlobals } = await import(
  pathToFileURL(pathResolve(process.cwd(), 'src/test/mocks/browserGlobals.mjs')).href
);
installBrowserGlobals();

// ─── Controllable base44 mock ───────────────────────────────────────────
// The hook calls base44.functions.invoke('discoverDesignContextQuestions', …)
// and base44.functions.invoke('saveDesignContext', …). Each test controls
// what those return so the lifecycle paths can be exercised.
const invokeLog = [];
let discoverResponse = { data: { ok: true, questions: [], saved_items: [] } };
let saveResponse = { data: { ok: true } };
let discoverThrows = false;
let saveThrows = false;

const base44 = {
  functions: {
    invoke: async (name, payload) => {
      invokeLog.push({ name, payload });
      if (name === 'discoverDesignContextQuestions') {
        if (discoverThrows) throw new Error('discovery failed');
        return discoverResponse;
      }
      if (name === 'saveDesignContext') {
        if (saveThrows) throw new Error('save failed');
        return saveResponse;
      }
      return { data: {} };
    },
  },
  entities: {},
  auth: { me: async () => ({ id: 'u1', email: 't@t' }) },
};

// Override the mock map's base44 export with our controllable instance.
// The mount loader resolves @/api/base44Client to the mock file; we mutate
// that module's exported base44 in place by re-importing it and copying.
const base44MockModule = await import(
  pathToFileURL(pathResolve(process.cwd(), 'src/test/mocks/base44ClientMock.mjs')).href
);
// Replace the mock's base44 object's functions.invoke with ours.
base44MockModule.base44.functions = base44.functions;
base44MockModule.base44.entities = base44.entities;
base44MockModule.base44.auth = base44.auth;

const React = await import('react');
const TestRenderer = (await import('react-test-renderer')).default;
const { act } = await import('react-test-renderer');

const { useDesignContextReview } = await import('@/components/adi/designContext/useDesignContextReview');

// ─── Test harness ───────────────────────────────────────────────────────
// A tiny host component that exposes the hook's state and actions through
// a ref, so the test can drive the hook exactly as the report page does.
function makeHarness() {
  const api = { review: null, proceed: null, cancel: null, Dialog: null, isReviewing: null };
  function Host() {
    const ctx = useDesignContextReview({ projectId: 'proj', versionId: 'v1' });
    api.review = ctx.review;
    api.proceed = ctx.proceed;
    api.cancel = ctx.cancel;
    api.Dialog = ctx.Dialog;
    api.isReviewing = ctx.isReviewing;
    return null;
  }
  return { api, Host };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Tests ──────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
function assert(condition, message) {
  if (condition) { passCount += 1; }
  else { failCount += 1; console.error(`  FAIL: ${message}`); }
}

// 1. Skipping all questions calls no saveDesignContext.
async function testSkipAllDoesNotSave() {
  invokeLog.length = 0;
  discoverResponse = { data: { ok: true, questions: [
    { question_id: 'q1', question: 'Why?', area: 'seating', decision_fingerprint: 'fp1' },
  ], saved_items: [] } };
  saveResponse = { data: { ok: true } };
  discoverThrows = false; saveThrows = false;

  const { api, Host } = makeHarness();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Host)); });

  // Start the review WITHOUT awaiting it — it returns a pending promise that
  // only resolves when the designer proceeds or cancels.
  let reviewResult = null;
  const reviewPromise = api.review().then((r) => { reviewResult = r; return r; });
  await flushPromises();

  // All questions skipped: proceed with every row status 'skipped'.
  await act(async () => { await api.proceed([{ question_id: 'q1', question: 'Why?', area: 'seating', status: 'skipped', decision_fingerprint: 'fp1' }]); });
  await flushPromises();
  await reviewPromise;

  const saves = invokeLog.filter((c) => c.name === 'saveDesignContext');
  assert(saves.length === 0, 'skipping all questions must not call saveDesignContext');
  assert(reviewResult === true, 'skipping all questions lets generation proceed (review returns true)');
  renderer.unmount();
}

// 2. A discovery failure proceeds (review returns true).
async function testDiscoveryFailureProceeds() {
  invokeLog.length = 0;
  discoverThrows = true;

  const { api, Host } = makeHarness();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Host)); });

  // A discovery failure resolves the review promise immediately (true), so
  // we can await it.
  let result = null;
  await act(async () => { result = await api.review(); });
  await flushPromises();

  assert(result === true, 'a discovery failure must let generation proceed (review returns true)');
  assert(api.isReviewing === false, 'the hook returns to idle after a discovery failure');
  renderer.unmount();
  discoverThrows = false;
}

// 3. A save failure proceeds (review returns true).
async function testSaveFailureProceeds() {
  invokeLog.length = 0;
  discoverResponse = { data: { ok: true, questions: [
    { question_id: 'q1', question: 'Why?', area: 'seating', decision_fingerprint: 'fp1' },
  ], saved_items: [] } };
  saveThrows = true;

  const { api, Host } = makeHarness();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Host)); });

  let reviewResult = null;
  const reviewPromise = api.review().then((r) => { reviewResult = r; return r; });
  await flushPromises();

  let proceedResult = null;
  await act(async () => {
    proceedResult = await api.proceed([{ question_id: 'q1', question: 'Why?', area: 'seating', status: 'answered', answer: 'Because.', decision_fingerprint: 'fp1' }]);
  });
  await flushPromises();
  await reviewPromise;

  assert(proceedResult === undefined || proceedResult === true, 'proceed does not throw on save failure');
  assert(reviewResult === true, 'a save failure must let generation proceed (review returns true)');
  assert(api.isReviewing === false, 'the hook returns to idle after a save failure');
  renderer.unmount();
  saveThrows = false;
}

// 4. Unmounting while a review is pending resolves the promise.
async function testUnmountResolvesPending() {
  invokeLog.length = 0;
  discoverResponse = { data: { ok: true, questions: [
    { question_id: 'q1', question: 'Why?', area: 'seating', decision_fingerprint: 'fp1' },
  ], saved_items: [] } };

  const { api, Host } = makeHarness();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Host)); });

  // Start the review and DON'T resolve it — the dialog is open.
  let reviewSettled = false;
  let reviewResult = null;
  const reviewPromise = api.review().then((r) => { reviewSettled = true; reviewResult = r; return r; });
  await flushPromises();

  // The review is pending (dialog open). Unmount now. The unmount must be
  // inside act so React flushes the useEffect cleanup that resolves the
  // pending promise.
  assert(reviewSettled === false, 'the review must be pending while the dialog is open');
  // Unmount synchronously inside act so the useEffect cleanup runs.
  act(() => { renderer.unmount(); });
  // Flush microtasks so the cleanup's resolverRef.current(false) settles
  // the .then chain before we assert.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert(reviewSettled === true, 'the pending review promise must settle after unmount');
  assert(reviewResult === false, 'unmount must resolve the pending review as a cancel (false)');
}

// 5. Answered items are saved; no_reason items are saved; skipped are not.
async function testAnsweredAndNoReasonAreSaved() {
  invokeLog.length = 0;
  discoverResponse = { data: { ok: true, questions: [
    { question_id: 'q1', question: 'Why A?', area: 'seating', decision_fingerprint: 'fp1' },
    { question_id: 'q2', question: 'Why B?', area: 'subwoofers', decision_fingerprint: 'fp2' },
    { question_id: 'q3', question: 'Why C?', area: 'treatment', decision_fingerprint: 'fp3' },
  ], saved_items: [] } };
  saveResponse = { data: { ok: true } };
  discoverThrows = false; saveThrows = false;

  const { api, Host } = makeHarness();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Host)); });

  const reviewPromise = api.review();
  await flushPromises();

  await act(async () => {
    await api.proceed([
      { question_id: 'q1', question: 'Why A?', area: 'seating', status: 'answered', answer: 'For the bar.', decision_fingerprint: 'fp1' },
      { question_id: 'q2', question: 'Why B?', area: 'subwoofers', status: 'no_reason', decision_fingerprint: 'fp2' },
      { question_id: 'q3', question: 'Why C?', area: 'treatment', status: 'skipped', decision_fingerprint: 'fp3' },
    ]);
  });
  await flushPromises();
  await reviewPromise;

  const saves = invokeLog.filter((c) => c.name === 'saveDesignContext');
  assert(saves.length === 1, 'one saveDesignContext call for answered+no_reason');
  const savedItems = saves[0]?.payload?.context_items || [];
  assert(savedItems.length === 2, 'only answered and no_reason items are saved (skipped dropped)');
  assert(savedItems.some((i) => i.question_id === 'q1' && i.status === 'answered'), 'answered q1 is saved');
  assert(savedItems.some((i) => i.question_id === 'q2' && i.status === 'no_reason'), 'no_reason q2 is saved');
  assert(!savedItems.some((i) => i.question_id === 'q3'), 'skipped q3 is not saved');
  renderer.unmount();
}

// 6. Cancel resolves the pending review as false (abort).
async function testCancelAborts() {
  invokeLog.length = 0;
  discoverResponse = { data: { ok: true, questions: [
    { question_id: 'q1', question: 'Why?', area: 'seating', decision_fingerprint: 'fp1' },
  ], saved_items: [] } };

  const { api, Host } = makeHarness();
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Host)); });

  let reviewResult = null;
  const reviewPromise = api.review().then((r) => { reviewResult = r; return r; });
  await flushPromises();

  assert(api.isReviewing === true, 'the hook is reviewing while the dialog is open');
  act(() => { api.cancel(); });
  await flushPromises();
  try { await reviewPromise; } catch { /* resolved by cancel */ }

  assert(reviewResult === false, 'cancel resolves the review as false (abort)');
  assert(api.isReviewing === false, 'the hook returns to idle after cancel');
  renderer.unmount();
}

// ─── Run ────────────────────────────────────────────────────────────────
const tests = [
  ['skip-all does not save', testSkipAllDoesNotSave],
  ['discovery failure proceeds', testDiscoveryFailureProceeds],
  ['save failure proceeds', testSaveFailureProceeds],
  ['unmount resolves pending', testUnmountResolvesPending],
  ['answered and no_reason are saved', testAnsweredAndNoReasonAreSaved],
  ['cancel aborts', testCancelAborts],
];

for (const [name, fn] of tests) {
  console.log(`\n› ${name}`);
  try { await fn(); } catch (err) { failCount += 1; console.error(`  FAIL (threw): ${err?.message || err}`); }
}

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);