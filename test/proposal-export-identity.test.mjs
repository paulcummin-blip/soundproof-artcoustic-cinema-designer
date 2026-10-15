/**
 * proposal-export-identity.test.mjs
 * ----------------------------------
 * Fixture harness for proposal document-input readiness — the stage that held
 * Preview and Export open: `runPrint` → `waitForDocumentInputs` →
 * `resolveExportIdentity`.
 *
 * Nothing here touches the database, the writer, the validator, the engineering
 * authority or any stored proposal: every read, every frame and every document is
 * a plain in-memory double, so the ordering, the deadlines, the failure rules and
 * the two print modes are exercised on their own.
 *
 *   A  normal identity resolution succeeds
 *   A2 names already frozen in the proposal are reused, with no read at all
 *   B  the saved-version lookup responds slowly, but inside its budget
 *   C  the saved-version lookup NEVER resolves (single version / comparison / read error)
 *   D  the animation frame executes normally
 *   E  the animation frame NEVER fires
 *   F  a read that completes after its deadline changes nothing
 *   G  Retry starts a clean attempt
 *   H  Preview creates no issued-export record
 *   I  Export retains the existing issue-recording behaviour
 *   J  the popup-blocked fallback uses the SAME readiness rules
 *   K  image / font / stylesheet checks are intact and unweakened
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PROPOSAL_IDENTITY_BLOCKED_BY,
  PROPOSAL_IDENTITY_BUDGET_MS,
  PROPOSAL_IDENTITY_REASON,
  frozenVersionNames,
  requiresEveryVersionName,
  resolveProposalExportIdentity,
  unresolvedVersionIds,
} from '@/components/proposal/editor/proposalExportIdentity';
import {
  PRINT_READINESS_BUDGET_MS,
  PRINT_READINESS_REASON,
  assessFontSet,
  assessImageElement,
  assessStylesheetElement,
  describePrintReadinessFailure,
  preparePrintDocument,
  settleOneFrame,
  waitForDocumentInputs,
  waitForImages,
  waitForStylesheets,
} from '@/components/report/printReadiness';
import {
  createExportDiagnostics,
  readLastExportDiagnostics,
  recordExportDiagnostics,
} from '@/components/proposal/export/proposalExportDiagnostics';
/* ── Fixtures (safe, in-memory only) ──────────────────────────────────────── */

const VERSION_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const VERSION_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const summaryFixture = (over = {}) => ({
  id: 'fixture-proposal',
  title: 'Genesis AV',
  proposal_type: 'system_summary',
  version_id: VERSION_A,
  selected_version_ids: [VERSION_A],
  metadata: {},
  ...over,
});

const comparisonFixture = (over = {}) => summaryFixture({
  proposal_type: 'comparison',
  selected_version_ids: [VERSION_A, VERSION_B],
  ...over,
});

const contextFixture = () => ({
  projectName: 'Genesis AV',
  filenameDealerName: 'Fixture Dealer',
  filenameClientName: 'Fixture Client',
  projectReference: 'AC-0001',
});

const recordsFor = (...pairs) => pairs.map(([id, version_name]) => ({ id, version_name }));

const readReturning = (records, delayMs = 0) => async () => {
  if (delayMs > 0) await wait(delayMs);
  return records;
};
const readThatNeverResolves = () => new Promise(() => {});
const readThatFails = async () => { throw new Error('fixture read unavailable'); };

/** A frame that runs, as a real one does. */
const frameRuns = async () => ({ settled: true, expired: false, elapsedMs: 16 });
/** A frame the browser never delivers — a hidden or throttled tab. */
const frameNeverResolves = () => new Promise(() => {});

const marksOf = (result) => (result.diagnostics?.marks || [])
  .map((mark) => `${mark.operation}:${mark.phase}`);
const markDetail = (result, operation, phase) => (result.diagnostics?.marks || [])
  .find((mark) => mark.operation === operation && mark.phase === phase);

/* ── A. Normal identity resolution ───────────────────────────────────────── */

test('A. a normal identity resolves, with the saved version name stated', async () => {
  const result = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readReturning(recordsFor([VERSION_A, 'Level 4 version'])),
    frameWait: frameRuns,
    diagnostics: createExportDiagnostics(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
  assert.equal(result.blockedBy, null);
  assert.deepEqual(result.identity.versionNames, ['Level 4 version']);
  assert.equal(result.versionsResolved, true);
  assert.equal(result.frameExpired, false);
  // Identity, project, dealer, client and reference all travel together.
  assert.equal(result.identity.projectName, 'Genesis AV');
  assert.equal(result.identity.dealerName, 'Fixture Dealer');
  assert.equal(result.identity.projectReference, 'AC-0001');

  const marks = marksOf(result);
  assert.ok(marks.includes('identity_resolution:started'), 'resolution start recorded');
  assert.ok(marks.includes('version_lookup:started'), 'lookup start recorded');
  assert.ok(marks.includes('version_lookup:completed'), 'lookup completion recorded');
  assert.ok(marks.includes('animation_frame:completed'), 'frame completion recorded');
  assert.ok(marks.includes('identity_available:completed'), 'final identity recorded');
  assert.equal(typeof result.diagnostics.totalMs, 'number');
  assert.equal(result.diagnostics.blockedBy, null);
});

/* ── A2. Authoritative names are reused, never re-read ───────────────────── */

test('A2. version names frozen in the proposal are reused with no read at all', async () => {
  let readCalls = 0;
  const frozen = comparisonFixture({
    metadata: {
      comparison_table: {
        versions: [
          { version_id: VERSION_A, version_name: 'Level 4 version' },
          { version_id: VERSION_B, version_name: 'Level 1 version' },
        ],
      },
    },
  });

  const result = await resolveProposalExportIdentity({
    proposal: frozen,
    projectContext: contextFixture(),
    // A reader that would hang forever: it must never be reached.
    readVersionNames: async () => { readCalls += 1; return readThatNeverResolves()(); },
    frameWait: frameRuns,
    diagnostics: createExportDiagnostics(),
  });

  assert.equal(result.ok, true);
  assert.equal(readCalls, 0, 'no database read was performed');
  assert.deepEqual(result.identity.versionNames, ['Level 4 version', 'Level 1 version']);
  assert.equal(frozenVersionNames(frozen).size, 2);
  assert.deepEqual(unresolvedVersionIds([VERSION_A, VERSION_B], frozenVersionNames(frozen)), []);
  assert.ok(!marksOf(result).some((mark) => mark.startsWith('version_lookup')), 'no lookup was needed');
});

/* ── B. A slow lookup, inside its budget ─────────────────────────────────── */

test('B. a slow saved-version lookup still resolves inside its budget', async () => {
  const result = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readReturning(recordsFor([VERSION_A, 'Level 4 version']), 80),
    frameWait: frameRuns,
    budgets: { versionLookup: 600, frame: 200 },
    diagnostics: createExportDiagnostics(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.identity.versionNames, ['Level 4 version']);
  const completed = markDetail(result, 'version_lookup', 'completed');
  assert.ok(completed, 'the lookup completed');
  assert.ok(completed.atMs >= 60, `lookup took its time (${completed.atMs}ms)`);
  assert.equal(result.diagnostics.blockedBy, null);
});

/* ── C. A lookup that never resolves ─────────────────────────────────────── */

test('C1. a lookup that never resolves cannot hold a single-version export open', async () => {
  const started = Date.now();
  const result = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readThatNeverResolves,
    frameWait: frameRuns,
    budgets: { versionLookup: 120, frame: 60 },
    diagnostics: createExportDiagnostics(),
  });
  const elapsed = Date.now() - started;

  // Bounded: it ends on its own deadline rather than with the page.
  assert.ok(elapsed < 1200, `resolution ended at ${elapsed}ms`);
  assert.equal(result.ok, true);
  // One version, no readable name: the document states no version rather than an
  // invented one — and it says so.
  assert.equal(result.versionsResolved, false);
  assert.deepEqual(result.identity.versionNames, []);
  assert.ok(marksOf(result).includes('version_lookup:expired'));
  assert.equal(markDetail(result, 'version_lookup', 'expired').detail.expired, true);
});

test('C2. an unresolved name for a comparison FAILS clearly and invents nothing', async () => {
  const result = await resolveProposalExportIdentity({
    proposal: comparisonFixture(),
    projectContext: contextFixture(),
    readVersionNames: readThatNeverResolves,
    frameWait: frameRuns,
    budgets: { versionLookup: 120, frame: 60 },
    diagnostics: createExportDiagnostics(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, PROPOSAL_IDENTITY_REASON.VERSION_NAMES_UNRESOLVED);
  assert.equal(result.blockedBy, PROPOSAL_IDENTITY_BLOCKED_BY.VERSION_LOOKUP);
  assert.equal(result.identity, null, 'no partial identity is offered');
  assert.equal(result.names.size, 0, 'no name is invented');
  assert.equal(requiresEveryVersionName([VERSION_A, VERSION_B]), true);
  assert.ok(marksOf(result).includes('version_lookup:expired'));
});

test('C3. a lookup that fails is reported as failed, not as an expiry or a success', async () => {
  const result = await resolveProposalExportIdentity({
    proposal: comparisonFixture(),
    projectContext: contextFixture(),
    readVersionNames: readThatFails,
    frameWait: frameRuns,
    budgets: { versionLookup: 200, frame: 100 },
    diagnostics: createExportDiagnostics(),
  });

  assert.equal(result.ok, false);
  assert.ok(marksOf(result).includes('version_lookup:failed'));
  assert.equal(markDetail(result, 'version_lookup', 'failed').detail.expired, false);
});

/* ── D. The animation frame executes normally ─────────────────────────────── */

test('D. a frame that executes resolves normally, and reports itself settled', async () => {
  const firingWindow = { requestAnimationFrame: (callback) => { callback(); return 1; } };
  const frame = await settleOneFrame(firingWindow, { budgetMs: 200 });
  assert.equal(frame.settled, true);
  assert.equal(frame.expired, false);
  assert.equal(frame.elapsedMs >= 0, true);

  const result = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readReturning(recordsFor([VERSION_A, 'Level 4 version'])),
    frameWait: () => settleOneFrame(firingWindow, { budgetMs: 200 }),
    diagnostics: createExportDiagnostics(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.frameExpired, false);
});

/* ── E. The animation frame never fires ──────────────────────────────────── */

test('E1. a frame the browser never delivers ends on its own deadline', async () => {
  const suspendedWindow = { requestAnimationFrame: () => 0 };
  const started = Date.now();
  const frame = await settleOneFrame(suspendedWindow, { budgetMs: 40 });
  const elapsed = Date.now() - started;

  assert.equal(frame.settled, false);
  assert.equal(frame.expired, true, 'an expired frame is reported as expired');
  assert.ok(elapsed >= 30 && elapsed < 900, `the wait ended at ${elapsed}ms`);

  // And with no frame runner at all (a plain node context), it never blocks.
  const absent = await settleOneFrame(null, { budgetMs: 40 });
  assert.equal(absent.settled, true);
});

test('E2. a frame that never fires cannot hold identity resolution open', async () => {
  const started = Date.now();
  const result = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readReturning(recordsFor([VERSION_A, 'Level 4 version'])),
    frameWait: frameNeverResolves,
    budgets: { versionLookup: 100, frame: 60 },
    diagnostics: createExportDiagnostics(),
  });
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 1000, `resolution ended at ${elapsed}ms`);
  assert.equal(result.ok, true, 'the identity is still handed over');
  assert.equal(result.frameExpired, true, 'and the expiry is reported, not hidden');
  // The name is still correct: the frame was never what made it correct.
  assert.deepEqual(result.identity.versionNames, ['Level 4 version']);
  assert.ok(marksOf(result).includes('animation_frame:expired'));
});

/* ── F. A read that completes after its deadline ─────────────────────────── */

test('F. a read arriving after the deadline changes nothing', async () => {
  let readCalls = 0;
  const lateRead = async () => {
    readCalls += 1;
    await wait(150);
    return recordsFor([VERSION_A, 'Level 4 version']);
  };

  const result = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: lateRead,
    frameWait: frameRuns,
    budgets: { versionLookup: 30, frame: 30 },
    diagnostics: createExportDiagnostics(),
  });
  const settledSnapshot = JSON.stringify(result.identity);

  assert.equal(result.ok, true);
  assert.equal(result.versionsResolved, false, 'the deadline decided, not the late read');
  assert.equal(readCalls, 1, 'exactly one read was started');

  // Let the late read land. Nothing may change: no second resolution, no rewrite
  // of what was already handed over.
  await wait(220);
  assert.equal(readCalls, 1, 'the late result did not start another attempt');
  assert.equal(JSON.stringify(result.identity), settledSnapshot, 'the handed-over identity is immutable');
  assert.equal(result.versionsResolved, false, 'the late name was not silently adopted');
});

/* ── G. Retry starts a clean attempt ─────────────────────────────────────── */

test('G. Retry is a clean attempt and picks up the name that has since arrived', async () => {
  const first = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readThatNeverResolves,
    frameWait: frameRuns,
    budgets: { versionLookup: 60, frame: 30 },
    diagnostics: createExportDiagnostics(),
  });
  assert.equal(first.versionsResolved, false);

  const second = await resolveProposalExportIdentity({
    proposal: summaryFixture(),
    projectContext: contextFixture(),
    readVersionNames: readReturning(recordsFor([VERSION_A, 'Level 4 version'])),
    frameWait: frameRuns,
    diagnostics: createExportDiagnostics(),
  });

  assert.equal(second.ok, true);
  assert.equal(second.versionsResolved, true);
  assert.deepEqual(second.identity.versionNames, ['Level 4 version']);
  assert.equal(second.diagnostics.blockedBy, null, 'the retry carries no earlier failure');
  assert.notEqual(second.diagnostics, first.diagnostics, 'each attempt has its own trace');
  assert.notEqual(second.names, first.names, 'each attempt has its own resolved state');
});

/* ── H. No issued record without an issued document ─────────────────────── */

test('H. no issued export is recorded without an issued document', async () => {
  // The guard is the document itself, and Preview Document no longer exists, so
  // there is no read-only pass that could reach the issued-copy write.
  const source = readFileSync(new URL('../src/components/proposal/export/useProposalExport.js', import.meta.url), 'utf8');
  assert.ok(/const shouldRecordIssued = Boolean\(issuedDocument\?\.documentType\);/.test(source));
  assert.ok(/if \(isCurrent\(\) && shouldRecordIssued\) \{/.test(source));
  assert.equal(source.includes('handlePreview'), false);
  assert.equal(source.includes('previewing'), false);
});

/* ── I. Export keeps its issue-recording behaviour ──────────────────────── */

test('I. Export still records the composition it printed — and only with a document', async () => {
  const source = readFileSync(new URL('../src/components/proposal/export/useProposalExport.js', import.meta.url), 'utf8');
  // The decision is taken from the document, and it is the only route to the write.
  assert.ok(/const shouldRecordIssued = Boolean\(issuedDocument\?\.documentType\);/.test(source));
  assert.ok(/issuedSnapshot = snapshotIssuedComposition\(issuedDocument\.documentType, root\);/.test(source));
  assert.ok(/if \(isCurrent\(\) && shouldRecordIssued\) \{/.test(source));
  const guarded = source.indexOf('if (isCurrent() && shouldRecordIssued) {');
  const write = source.indexOf('recordIssuedExportInBackground({');
  assert.ok(guarded > -1 && write > guarded, 'the only issued-copy write sits behind that decision');
  // And the export is authorized as an issued export, so the approval rule and the
  // evidence check are enforced server-side before anything is prepared.
  assert.equal(source.includes("action: EXPORT_ACTION"), true);
});

/* ── J. The fallback uses the same readiness rules ──────────────────────── */

test('J. the popup-blocked fallback is prepared by the SAME readiness authority', async () => {
  const exportSource = readFileSync(new URL('../src/components/proposal/export/useProposalExport.js', import.meta.url), 'utf8');
  const windowSource = readFileSync(new URL('../src/components/proposal/export/proposalPrintWindow.js', import.meta.url), 'utf8');
  // The in-page fallback… resolves the pack node ONCE and refuses to prepare when
  // there is none, so the application interface can never be printed in the pack's
  // place. It is still the one shared authority that prepares it.
  assert.ok(/const fallbackNode = findPrintNode\(\);/.test(exportSource));
  // The fallback is prepared by the ONE shared readiness authority, through the
  // fallback helper — never by a bare animation-frame delay.
  assert.ok(/prepareBrowserProposalFallback\(fallbackNode/.test(exportSource));
  assert.ok(!/preparePrintDocument\(\{ doc: document, root: findPrintNode\(\) \}\)/.test(exportSource));
  assert.ok(/COMPOSITION_UNAVAILABLE/.test(exportSource));
  const fallbackSource = readFileSync(new URL('../src/components/proposal/export/browserProposalFallback.js', import.meta.url), 'utf8');
  assert.ok(/preparePrintDocument\(\{ doc, root: clone, trace \}\)/.test(fallbackSource),
    'the fallback runs the same readiness authority as the print window');
  // …and the app-owned print window resolves the pack node and prints that same
  // composed document, through the app's own window helper.
  assert.ok(/export function findPrintNode\(/.test(windowSource));
  assert.ok(/export async function printProposalInWindow/.test(windowSource));
  assert.ok(/printProposalInWindow\(printWindow, \{/.test(exportSource));
  assert.ok(/node: printNode/.test(exportSource));

  // And that authority still refuses a document whose image has not arrived.
  const pendingImage = { src: 'fixture://image', complete: false, naturalWidth: 0, naturalHeight: 0 };
  const fakeRoot = { querySelectorAll: () => [pendingImage] };
  const outcome = await preparePrintDocument({
    doc: { fonts: null, querySelectorAll: () => [] },
    root: fakeRoot,
    budgets: { stylesheets: 50, fonts: 50, images: 60, layout: 50, poll: 5 },
  });
  assert.equal(outcome.ready, false);
  assert.equal(outcome.reason, PRINT_READINESS_REASON.IMAGES_FAILED);
});

/* ── K. Resource checks are intact and unweakened ───────────────────────── */

test('K. image, font and stylesheet checks are unchanged', async () => {
  // Budgets: the existing budgets must not have been loosened or removed.
  assert.equal(PRINT_READINESS_BUDGET_MS.inputs, 15000);
  assert.equal(PRINT_READINESS_BUDGET_MS.stylesheets, 8000);
  assert.equal(PRINT_READINESS_BUDGET_MS.fonts, 6000);
  assert.equal(PRINT_READINESS_BUDGET_MS.images, 12000);
  assert.equal(PRINT_READINESS_BUDGET_MS.layout, 2000);
  assert.equal(PRINT_READINESS_BUDGET_MS.poll, 50);
  assert.equal(PROPOSAL_IDENTITY_BUDGET_MS.versionLookup, 5000);

  // Images: loaded AND decoded, with real dimensions.
  assert.equal(assessImageElement({ complete: false, src: 'a' }), 'pending');
  assert.equal(assessImageElement({ complete: true, src: 'a', naturalWidth: 10, naturalHeight: 10 }), 'ready');
  assert.equal(assessImageElement({ complete: true, src: 'a', naturalWidth: 0, naturalHeight: 0 }), 'failed');
  assert.deepEqual(await waitForImages({ querySelectorAll: () => [] }), { ok: true, reason: null, failures: [] });

  // Stylesheets: parsed, or a failure — never a styled-looking guess.
  assert.equal(assessStylesheetElement({ getAttribute: () => 'fixture.css' }), 'pending');
  assert.equal(assessStylesheetElement({ getAttribute: () => 'fixture.css', sheet: {} }), 'ready');
  const neverParses = { getAttribute: () => 'fixture.css', addEventListener: () => {}, sheet: null };
  const stylesheets = await waitForStylesheets(
    { querySelectorAll: () => [neverParses] },
    { budgetMs: 60, pollMs: 5 },
  );
  assert.equal(stylesheets.ok, false);
  assert.equal(stylesheets.reason, PRINT_READINESS_REASON.STYLESHEETS_TIMEOUT);

  // Fonts: a loading face is pending, an errored face is a failure.
  const faceSet = (statuses) => ({ forEach: (fn) => statuses.forEach((status) => fn({ status })), ready: Promise.resolve() });
  assert.equal(assessFontSet(faceSet(['loaded', 'loading'])), 'pending');
  assert.equal(assessFontSet(faceSet(['loaded', 'error'])), 'failed');
  assert.equal(assessFontSet(faceSet(['loaded', 'loaded'])), 'ready');
});

/* ── The designer-facing message, and the internal trace ────────────────── */

test('the failure message is plain and actionable; the trace is internal', async () => {
  const identityError = new Error('internal detail that a designer must never read');
  identityError.printIdentityUnresolved = true;
  const inputs = await waitForDocumentInputs(async () => { throw identityError; }, { budgetMs: 200 });
  assert.equal(inputs.ok, false);
  assert.equal(inputs.reason, PRINT_READINESS_REASON.IDENTITY_UNRESOLVED);

  const message = describePrintReadinessFailure({ reason: inputs.reason });
  assert.ok(/Retry Export/.test(message), 'it says what to do');
  assert.ok(/could not be read/.test(message), 'it names the cause in plain words');
  assert.ok(!/version_lookup|animation_frame|identity_resolution|Promise|undefined/.test(message), 'no implementation detail');

  // The internal trace names the operation that prevented completion.
  const result = await resolveProposalExportIdentity({
    proposal: comparisonFixture(),
    projectContext: contextFixture(),
    readVersionNames: readThatNeverResolves,
    frameWait: frameNeverResolves,
    budgets: { versionLookup: 80, frame: 40 },
    diagnostics: createExportDiagnostics({ scope: 'fixture' }),
  });
  recordExportDiagnostics(result.diagnostics, { label: 'fixture comparison' });
  const last = readLastExportDiagnostics();
  assert.equal(result.blockedBy, PROPOSAL_IDENTITY_BLOCKED_BY.VERSION_LOOKUP);
  assert.equal(last.blockedBy, 'version_lookup');
  assert.equal(last.scope, 'fixture');
  // Nothing project-specific travels in a trace.
  assert.ok(!JSON.stringify(last).includes('Genesis AV'));
  assert.ok(!JSON.stringify(last).includes(VERSION_A));
});