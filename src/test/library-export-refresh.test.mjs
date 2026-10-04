// library-export-refresh.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — an exported report PDF appears in the Project Library under the
// exact version it was exported from.
//
// Root cause under test: the issued document is recorded in the BACKGROUND,
// after the download has already been triggered (capturing and uploading a
// multi-page PDF takes seconds). A designer who downloads a report and returns
// straight to the Project Library arrives before the row exists, and the Library
// — which read once when it opened — never learned the row had landed. The
// Level 4 exports existed in the database, bound to the Level 4 version, and
// were still listed as "No PDF has been exported for this version yet".
//
//   TEST 1  A stored export is announced to an open Library (behavioural)
//   TEST 2  The row is stored BEFORE the announcement, never after
//   TEST 3  The Library reads again when a document is stored, silently
//   TEST 4  Returning to the tab reads again
//   TEST 5  BOTH report types record the VIEWED version, not the active one
//   TEST 6  One export per version and type — a per-version export is never hidden
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  notifyIssuedExportStored,
  subscribeIssuedExportStored,
} from '../components/library/issuedExportSignal.js';
import { selectLatestExports } from '../components/library/librarySourceStatus.js';
import { resolveReportVersionId } from '../components/report/reportVersionRequest.js';

const ROOT = path.resolve(process.cwd());
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// ── TEST 1 — an open Library is told the row landed ────────────────────────
test('TEST 1 — a stored export is announced to its project', () => {
  const heard = [];
  const unsubscribe = subscribeIssuedExportStored((projectId) => heard.push(projectId));

  notifyIssuedExportStored('project-A');
  // Another project's export must not refresh this Library.
  notifyIssuedExportStored('');
  unsubscribe();
  notifyIssuedExportStored('project-B');

  assert.deepEqual(heard, ['project-A'], 'the listener heard exactly the stored row');
});

test('TEST 1b — one failing listener cannot silence the others', () => {
  const heard = [];
  const bad = subscribeIssuedExportStored(() => { throw new Error('listener exploded'); });
  const good = subscribeIssuedExportStored((projectId) => heard.push(projectId));

  notifyIssuedExportStored('project-C');

  bad();
  good();
  assert.deepEqual(heard, ['project-C'], 'the healthy listener still heard it');
});

// ── TEST 2 — the announcement follows the write ────────────────────────────
test('TEST 2 — the Library row is created before the Library is told', () => {
  const source = read('src/components/library/issuedDocument/recordIssuedExport.js');
  const stored = source.indexOf('await storeIssuedDocument(');
  const announced = source.indexOf('notifyIssuedExportStored(');

  assert.ok(stored > -1, 'the issued document is stored');
  assert.ok(announced > -1, 'storing it is announced');
  assert.ok(stored < announced, 'nothing is announced before the row exists');
});

// ── TEST 3 — the Library reads again, without a loading flash ──────────────
test('TEST 3 — a stored document makes an open Library read again', () => {
  const source = read('src/components/library/useProjectLibraryAssets.js');

  assert.ok(source.includes('subscribeIssuedExportStored('), 'the Library listens for stored documents');
  assert.ok(source.includes("load({ silent: true })"), 'it reads again when one lands');
  assert.ok(
    source.includes('if (!silent) setLoading(true);'),
    'the refresh keeps what is on screen — no Loading state over the rows',
  );
  assert.ok(
    source.includes('storedProjectId !== projectId'),
    'only this project\'s exports refresh this Library',
  );
  assert.ok(source.includes('if (inFlight.current) return;'), 'reads never overlap');
});

// ── TEST 4 — returning to the tab reads again ──────────────────────────────
test('TEST 4 — returning to the tab reads again', () => {
  const source = read('src/components/library/useProjectLibraryAssets.js');

  assert.ok(source.includes("window.addEventListener('focus', refresh)"), 'focus refreshes');
  assert.ok(source.includes("document.addEventListener('visibilitychange', refresh)"), 'tab visibility refreshes');
  assert.ok(source.includes("document.hidden"), 'a hidden tab does not read');
});

// ── TEST 5 — the VIEWED version is the export authority ────────────────────
test('TEST 5 — both report types export against the version being viewed', () => {
  // The Visual Report records the version its authority resolved for the request.
  const visual = read('src/pages/RP22ClientReport.jsx');
  assert.ok(visual.includes('versionId: authority.versionId'), 'the Visual export records the resolved version');
  assert.ok(
    visual.includes('resolveReportVersionId({') || read('src/components/report/client/useClientReportAuthority.jsx').includes('resolveReportVersionId({'),
    'the Visual authority resolves the requested version',
  );

  // The Technical Report records the version it resolved for the request.
  const technical = read('src/pages/RP22Report.jsx');
  assert.ok(technical.includes('versionId: reportVersionId'), 'the Technical export records its resolved version');
  assert.ok(technical.includes('resolveReportVersionId({'), 'the Technical page resolves the requested version');

  // The request wins; the project's active version is only the fallback for a
  // page opened without one. Never the loaded Room Designer state.
  assert.equal(
    resolveReportVersionId({ requestedVersionId: 'LEVEL4', activeVersionId: 'LEVEL1' }),
    'LEVEL4',
    'the viewed version beats the active version',
  );
  assert.equal(
    resolveReportVersionId({ requestedVersionId: null, activeVersionId: 'LEVEL1' }),
    'LEVEL1',
    'the active version is used only when nothing was requested',
  );
});

// ── TEST 6 — the latest-export rule never hides a version's own export ─────
test('TEST 6 — one export per version and type, older duplicates only', () => {
  const rows = [
    { id: 'L4-tech', document_type: 'technical', version_id: 'L4', selected_version_ids: ['L4'], exported_at: '2026-10-04T17:11:41Z' },
    { id: 'L4-vis', document_type: 'visual', version_id: 'L4', selected_version_ids: ['L4'], exported_at: '2026-10-04T17:11:29Z' },
    { id: 'L1-tech-new', document_type: 'technical', version_id: 'L1', selected_version_ids: ['L1'], exported_at: '2026-10-04T15:29:09Z' },
    { id: 'L1-tech-old', document_type: 'technical', version_id: 'L1', selected_version_ids: ['L1'], exported_at: '2026-10-04T15:12:20Z' },
    { id: 'L1-vis', document_type: 'visual', version_id: 'L1', selected_version_ids: ['L1'], exported_at: '2026-10-04T15:28:57Z' },
  ];

  const listed = selectLatestExports(rows.map((record) => ({ record }))).map(({ record }) => record.id);

  assert.ok(listed.includes('L4-tech'), 'the Level 4 Technical export is listed');
  assert.ok(listed.includes('L4-vis'), 'the Level 4 Visual export is listed');
  assert.ok(listed.includes('L1-tech-new'), 'the newest Level 1 Technical export is listed');
  assert.ok(!listed.includes('L1-tech-old'), 'the older Level 1 Technical export is hidden');
  assert.equal(listed.length, 4, 'and nothing else is listed');

  // Reading a version's own section keeps exactly its rows.
  const sectionFor = (versionId) => listed.filter((id) => rows.find((r) => r.id === id)?.version_id === versionId);
  assert.deepEqual(sectionFor('L4').sort(), ['L4-tech', 'L4-vis'], 'Level 4 shows both of its exports');
});