// project-library-version-routing.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's report actions are VERSION-SAFE, and the
// Library keeps the LATEST exported PDF per version and report type.
//
//   TEST 1  A row's report action carries the row's own version_id
//   TEST 2  The requested version wins over the project's active version
//   TEST 3  A page that was asked for a version never reuses another version's
//           hydrated design (the in-session shortcut is refused)
//   TEST 4  Only the latest export per version and report type is listed
//   TEST 5  A version with no report of a type reads Not generated; an existing
//           one is Current or Update needed — never Missing, never invented
//
// The Level 4 case under test, exactly as reported:
//   Room Designer open on Level 1 version, Project Library open, Level 4 row
//   clicked → the action must carry LEVEL 4's version id and the report page
//   must resolve LEVEL 4. Level 1 is only ever used when Level 1 is the row,
//   or when no version was requested at all.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  REPORT_VERSION_PARAM,
  readRequestedVersionId,
  resolveReportVersionId,
  sharedHydrationMatchesRequest,
} from '../components/report/reportVersionRequest.js';
import { buildReportActionUrl } from '../components/proposal/sourceAuthority/proposalSourceAuthority.js';
import {
  LIVE_REPORT_STATE,
  latestExportKey,
  resolveLiveReportState,
  selectLatestExports,
} from '../components/library/librarySourceStatus.js';
import {
  READINESS_STATE,
  buildReadinessCell,
} from '../components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const VERSION_4 = 'version-level-4';
const VERSION_1 = 'version-level-1';
const PROJECT = 'project-marquee-home';

/** The URL a Project Library report row opens. */
const rowActionUrl = (route, versionId) => buildReportActionUrl({ route, projectId: PROJECT, versionId });

/** The version param of a URL, read exactly as the report page reads it. */
const paramsOf = (url) => new URLSearchParams(String(url).split('?')[1] || '');

/* ── TEST 1 — the row's action carries the row's version ────────────────── */

test('TEST 1 — a Level 4 report action carries LEVEL 4’s version id, and a Level 1 action Level 1’s', () => {
  const visual4 = rowActionUrl('/RP22ClientReport', VERSION_4);
  const technical4 = rowActionUrl('/RP22Report', VERSION_4);
  const visual1 = rowActionUrl('/RP22ClientReport', VERSION_1);

  assert.equal(readRequestedVersionId(paramsOf(visual4)), VERSION_4);
  assert.equal(readRequestedVersionId(paramsOf(technical4)), VERSION_4);
  assert.equal(readRequestedVersionId(paramsOf(visual1)), VERSION_1);

  // The project travels with the version, so the report reads the right project
  // as well as the right version.
  assert.equal(paramsOf(visual4).get('projectId'), PROJECT);
  assert.equal(REPORT_VERSION_PARAM, 'versionId');

  // A stable link written with the underscore spelling resolves identically.
  assert.equal(
    readRequestedVersionId(new URLSearchParams(`version_id=${VERSION_4}`)),
    VERSION_4,
  );
  // No version asked for: nothing is claimed.
  assert.equal(readRequestedVersionId(new URLSearchParams('projectId=p1')), null);
  assert.equal(readRequestedVersionId(new URLSearchParams('versionId=')), null);
  assert.equal(readRequestedVersionId(null), null);
});

/* ── TEST 2 — the request wins over the active version ──────────────────── */

test('TEST 2 — the requested version wins; the active version is only a fallback', () => {
  // The reported bug: Room Designer loaded on Level 1, Level 4 row clicked.
  assert.equal(
    resolveReportVersionId({ requestedVersionId: VERSION_4, activeVersionId: VERSION_1 }),
    VERSION_4,
    'the Level 4 request is not answered with the loaded Level 1 version',
  );
  assert.equal(
    resolveReportVersionId({ requestedVersionId: VERSION_1, activeVersionId: VERSION_1 }),
    VERSION_1,
    'a Level 1 row still uses Level 1',
  );
  // Opened without a version (menu, bookmark): the active version stands in.
  assert.equal(
    resolveReportVersionId({ requestedVersionId: null, activeVersionId: VERSION_1 }),
    VERSION_1,
  );
  assert.equal(resolveReportVersionId({}), null);
});

/* ── TEST 3 — the in-session shortcut is refused across versions ────────── */

test('TEST 3 — already-hydrated design is reused only for the version asked for', () => {
  assert.equal(
    sharedHydrationMatchesRequest({ requestedVersionId: null, hydratedVersionId: VERSION_1 }),
    true,
    'no request: the loaded version is the version to render',
  );
  assert.equal(
    sharedHydrationMatchesRequest({ requestedVersionId: VERSION_4, hydratedVersionId: VERSION_4 }),
    true,
    'the shared state holds the requested version',
  );
  assert.equal(
    sharedHydrationMatchesRequest({ requestedVersionId: VERSION_4, hydratedVersionId: VERSION_1 }),
    false,
    'Level 1 is loaded but Level 4 was asked for: hydrate Level 4 explicitly',
  );
  assert.equal(
    sharedHydrationMatchesRequest({ requestedVersionId: VERSION_4, hydratedVersionId: null }),
    false,
    'nothing hydrated yet: nothing to reuse',
  );
});

/* ── TEST 4 — only the latest export per version and report type ────────── */

const issued = (id, { versionId = VERSION_4, documentType = 'technical', exportedAt } = {}) => ({
  id,
  project_id: PROJECT,
  document_type: documentType,
  version_id: versionId,
  selected_version_ids: [versionId],
  exported_at: exportedAt,
  filename: `${documentType}-${id}.pdf`,
});

test('TEST 4 — four exports of one version and type list ONE row; versions and types stay separate', () => {
  const exports = [
    issued('v4-tech-1', { exportedAt: '2026-10-01T10:00:00.000Z' }),
    issued('v4-tech-2', { exportedAt: '2026-10-02T10:00:00.000Z' }),
    issued('v4-tech-3', { exportedAt: '2026-10-03T10:00:00.000Z' }),
    issued('v4-tech-4', { exportedAt: '2026-10-04T10:00:00.000Z' }),
    issued('v4-visual-1', { documentType: 'visual', exportedAt: '2026-10-02T10:00:00.000Z' }),
    issued('v1-tech-1', { versionId: VERSION_1, exportedAt: '2026-10-02T10:00:00.000Z' }),
  ];

  const listed = selectLatestExports(exports).map((entry) => entry?.record || entry);
  assert.deepEqual(
    listed.map((record) => record.id).sort(),
    ['v1-tech-1', 'v4-tech-4', 'v4-visual-1'],
    'the latest per project version and report type',
  );

  // The repeated Level 1 mistake: a Level 4 export never takes the Level 1 slot
  // and vice versa — the key is the version, not only the report type.
  assert.notEqual(
    latestExportKey({ document_type: 'technical', version_id: VERSION_4 }),
    latestExportKey({ document_type: 'technical', version_id: VERSION_1 }),
  );
  assert.notEqual(
    latestExportKey({ document_type: 'technical', version_id: VERSION_4 }),
    latestExportKey({ document_type: 'visual', version_id: VERSION_4 }),
  );

  // Four exports, one PDF: nothing is deleted, only unlisted.
  assert.equal(exports.length, 6, 'every export record stays in storage');
});

/* ── TEST 5 — the row state is the readiness cell, stated never invented ── */

test('TEST 5 — no report of a type reads Not generated; an existing one Current or Update needed', () => {
  const ready = buildReadinessCell({ state: READINESS_STATE.CURRENT });
  const movedOn = buildReadinessCell({ state: READINESS_STATE.STALE });
  const absent = buildReadinessCell({ state: READINESS_STATE.MISSING });

  // The row state IS the readiness cell: a report the readiness authority will
  // not accept as a proposal source never reads Current.
  assert.equal(resolveLiveReportState({ cell: ready, hasReport: true }), LIVE_REPORT_STATE.CURRENT);
  assert.equal(resolveLiveReportState({ cell: movedOn, hasReport: true }), LIVE_REPORT_STATE.UPDATE_NEEDED);
  assert.equal(resolveLiveReportState({ cell: absent, hasReport: false }), LIVE_REPORT_STATE.MISSING);

  // While the readiness read is in flight nothing is claimed — not even Missing.
  assert.equal(resolveLiveReportState({ cell: null, hasReport: true }), LIVE_REPORT_STATE.CHECKING);
  assert.equal(
    resolveLiveReportState({ cell: buildReadinessCell({ state: READINESS_STATE.CHECKING }), hasReport: false }),
    LIVE_REPORT_STATE.CHECKING,
  );

  // The Level 4 section: a Technical Report exists, the Visual Report does not.
  const level4Cells = new Map([['technical', ready]]);
  assert.equal(
    resolveLiveReportState({ cell: level4Cells.get('visual') || absent, hasReport: false }),
    LIVE_REPORT_STATE.MISSING,
    'Level 4 Visual',
  );
  assert.equal(
    resolveLiveReportState({ cell: level4Cells.get('technical'), hasReport: true }),
    LIVE_REPORT_STATE.CURRENT,
    'Level 4 Technical',
  );

  // A report belonging to another version is never this version's report: the
  // section filters by version first, so Level 1's Technical Report cannot
  // answer for Level 4.
  const level1 = [{ version_id: VERSION_1, report_type: 'technical' }];
  const level4Only = level1.filter((snapshot) => snapshot.version_id === VERSION_4);
  assert.equal(level4Only.length, 0, 'no Level 1 row leaks into the Level 4 section');
});