// project-library-report-listing.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — the Project Library's Generated Reports listing.
//
//   TEST 1  A report regenerated five times lists ONE current live row
//   TEST 2  Three exports of the same report list ONE issued row: the latest
//   TEST 3  An updated report updates the live row and the latest issued PDF is
//           judged against it ("Issued PDF" / "Issued PDF — design changed since
//           export") while the older copies stay in storage, unlisted
//   TEST 4  A Visual Report export and a Technical Report export never stand
//           in for one another
//   TEST 5  Level 4 version and Level 1 version are judged inside their own
//           version group
//
// The listing rules under test, derived exactly as the Library derives them:
//   one live row per version and report type (the newest), every exported PDF
//   listed newest first, and each export judged against the live report of its
//   OWN version and report type.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  EXPORT_SOURCE_CHANGED_LABEL,
  ISSUED_PDF_LABEL,
  LIBRARY_SOURCE_LABEL,
  collapseLiveReports,
  liveReportKey,
  resolveExportLiveState,
  selectLatestExports,
} from '../components/library/librarySourceStatus.js';
import { isSnapshotRestorable } from '../components/report/reportSnapshotAuthority.js';

const LIVE_REPORT_TYPES = ['visual', 'technical'];

const fingerprints = (engineering) => ({
  engineeringFingerprint: engineering,
  calculationFingerprint: `CALC-${engineering}`,
  seatPriorityFingerprint: 'SEATS-1',
});

/** One saved report as it is stored. */
const saved = (id, versionId, reportType, generatedAt, engineering = 'ENG-1') => ({
  id,
  project_id: 'project-1',
  version_id: versionId,
  report_type: reportType,
  report_schema_version: 1,
  generated_at: generatedAt,
  status: 'current',
  source_fingerprints: fingerprints(engineering),
  payload: { engineeringFingerprint: engineering },
});

/** One exported PDF as it is stored. */
const issued = (id, {
  versionId = 'version-4',
  documentType = 'technical',
  exportedAt,
  engineering = 'ENG-1',
  sourceRecordId = 'source-1',
} = {}) => ({
  id,
  project_id: 'project-1',
  document_type: documentType,
  version_id: versionId,
  selected_version_ids: [versionId],
  exported_at: exportedAt,
  source_record_id: sourceRecordId,
  source_fingerprints: fingerprints(engineering),
  source_status_at_export: 'current',
});

/** The live rows the Library lists, derived as the Library derives them. */
const liveRows = (snapshots) => collapseLiveReports(snapshots)
  .filter((snapshot) => LIVE_REPORT_TYPES.includes(snapshot.report_type))
  .filter(isSnapshotRestorable)
  .map((snapshot) => ({
    id: snapshot.id,
    versionId: snapshot.version_id,
    reportType: snapshot.report_type,
    generatedAt: snapshot.generated_at,
    status: snapshot.status,
    sourceFingerprints: snapshot.source_fingerprints,
  }))
  .sort((a, b) => LIVE_REPORT_TYPES.indexOf(a.reportType) - LIVE_REPORT_TYPES.indexOf(b.reportType));

/**
 * The issued rows one version group shows: the LATEST export of each report
 * type. An older export of the same version and type is not listed.
 */
const issuedRows = (records, versionId) => selectLatestExports(
  records.filter((record) => (record.version_id || null) === versionId),
).map((entry) => entry?.record || entry);

const VERSION_4 = { id: 'version-4', version_name: 'Level 4 version', published_fingerprint: 'ENG-1' };
const VERSION_1 = { id: 'version-1', version_name: 'Level 1 version', published_fingerprint: 'ENG-1' };

/* ── TEST 1 — one live row per report type ──────────────────────────────── */

test('TEST 1 — a Technical Report regenerated five times lists ONE current live row', () => {
  const snapshots = [
    saved('snap-1', 'version-4', 'technical', '2026-10-01T09:00:00.000Z'),
    saved('snap-2', 'version-4', 'technical', '2026-10-02T09:00:00.000Z'),
    saved('snap-3', 'version-4', 'technical', '2026-10-03T09:00:00.000Z'),
    saved('snap-4', 'version-4', 'technical', '2026-10-04T09:00:00.000Z'),
    saved('snap-5', 'version-4', 'technical', '2026-10-05T09:00:00.000Z'),
    saved('snap-visual', 'version-4', 'visual', '2026-10-04T09:00:00.000Z'),
  ];

  const rows = liveRows(snapshots);

  assert.equal(rows.length, 2, 'one row per report type, never one per generation');
  assert.deepEqual(rows.map((row) => row.reportType), ['visual', 'technical']);

  const technical = rows.find((row) => row.reportType === 'technical');
  assert.equal(technical.id, 'snap-5', 'the newest generation is the row');
  assert.equal(technical.generatedAt, '2026-10-05T09:00:00.000Z', 'the newest generated date only');
  assert.equal(technical.status, 'current', 'the live row keeps its own status');
});

/* ── TEST 2 — every exported PDF stays listed ───────────────────────────── */

test('TEST 2 — three exports of the same report list ONE issued row: the latest', () => {
  const exports = [
    issued('export-1', { exportedAt: '2026-10-02T10:00:00.000Z' }),
    issued('export-2', { exportedAt: '2026-10-03T10:00:00.000Z' }),
    issued('export-3', { exportedAt: '2026-10-04T10:00:00.000Z' }),
  ];

  const rows = issuedRows(exports, 'version-4');
  assert.equal(rows.length, 1, 'ONE exported PDF per version and report type');
  assert.equal(rows[0].id, 'export-3', 'the latest export is the row');

  // The Library holds one PDF, not one per export: the older copies are still
  // in storage (they are never deleted or overwritten), they are simply not
  // listed. Supersession is still derivable for them.
  assert.ok(exports.some((record) => record.id === 'export-1'), 'the older copy stays in storage');
  const superseded = resolveExportLiveState({ record: exports[1], version: VERSION_4, superseded: true });
  assert.equal(superseded.label, LIBRARY_SOURCE_LABEL.superseded, 'a newer export of the same report');

  // No live report of this type: the export still reads as an issued PDF.
  const withoutLive = resolveExportLiveState({ record: rows[0], version: VERSION_4, liveReport: null });
  assert.equal(withoutLive.label, ISSUED_PDF_LABEL, 'an issued PDF never reads as a live report');

  // It matches the live report of its own version and type: "Same as current".
  const live = saved('snap-1', 'version-4', 'technical', '2026-10-01T09:00:00.000Z');
  const matched = resolveExportLiveState({ record: rows[0], version: VERSION_4, liveReport: {
    generatedAt: live.generated_at,
    sourceFingerprints: live.source_fingerprints,
  } });
  assert.equal(matched.label, LIBRARY_SOURCE_LABEL.same_as_current);

  // A second export of the SAME version and report type never adds a row, and
  // neither does a Visual Report export of the same version.
  const withVisual = exports.concat([issued('export-visual', {
    documentType: 'visual',
    exportedAt: '2026-10-05T10:00:00.000Z',
  })]);
  assert.deepEqual(
    issuedRows(withVisual, 'version-4').map((row) => row.document_type).sort(),
    ['technical', 'visual'],
    'one row per report type, never one per export',
  );
});

/* ── TEST 3 — regenerating after exporting ──────────────────────────────── */

test('TEST 3 — regenerating after exporting updates the live row and marks the older exports', () => {
  const exports = [
    issued('export-1', { exportedAt: '2026-10-02T10:00:00.000Z' }),
    issued('export-2', { exportedAt: '2026-10-03T10:00:00.000Z' }),
  ];
  const before = saved('snap-1', 'version-4', 'technical', '2026-10-02T09:00:00.000Z');

  // Nothing has moved on yet: an export made after the live report matches it.
  assert.equal(
    resolveExportLiveState({
      record: exports[1],
      version: VERSION_4,
      liveReport: { generatedAt: before.generated_at, sourceFingerprints: before.source_fingerprints },
    }).label,
    LIBRARY_SOURCE_LABEL.same_as_current,
  );

  // The report is regenerated from a design that has moved on.
  const after = saved('snap-2', 'version-4', 'technical', '2026-10-05T09:00:00.000Z', 'ENG-2');
  const rows = liveRows([before, after]);
  assert.equal(rows.length, 1, 'still one live row');
  assert.equal(rows[0].generatedAt, '2026-10-05T09:00:00.000Z', 'the live row carries the new date');

  const liveReport = { generatedAt: after.generated_at, sourceFingerprints: after.source_fingerprints };
  const kept = issuedRows(exports, 'version-4');
  assert.equal(kept.length, 1, 'the Library lists the latest export only');
  assert.equal(kept[0].id, 'export-2', 'the newest of the two exports');
  assert.deepEqual(
    kept.map((record) => resolveExportLiveState({ record, version: VERSION_4, liveReport }).label),
    [EXPORT_SOURCE_CHANGED_LABEL],
    'the design moved on: "Issued PDF — design changed since export"',
  );
  assert.equal(
    EXPORT_SOURCE_CHANGED_LABEL,
    'Issued PDF — design changed since export',
    'the exact wording',
  );

  // The older export is unlisted but keeps its own label authority: it is still
  // judged against the same version and report type it was issued for.
  assert.equal(
    resolveExportLiveState({ record: exports[0], version: VERSION_4, liveReport }).label,
    EXPORT_SOURCE_CHANGED_LABEL,
    'the unlisted older export is judged the same way',
  );

  // Updated from the SAME source: the issued PDF is not out of date, and it is
  // still an issued PDF — the Library has no "older export" vocabulary.
  const sameSource = saved('snap-3', 'version-4', 'technical', '2026-10-06T09:00:00.000Z', 'ENG-1');
  assert.deepEqual(
    kept.map((record) => resolveExportLiveState({
      record,
      version: VERSION_4,
      liveReport: { generatedAt: sameSource.generated_at, sourceFingerprints: sameSource.source_fingerprints },
    }).label),
    [ISSUED_PDF_LABEL],
  );
});

/* ── TEST 4 — report types are never confused ───────────────────────────── */

test('TEST 4 — a Visual Report export and a Technical Report export never stand in for one another', () => {
  // The Visual Report has moved on; the Technical Report has not.
  const visualLive = saved('snap-visual', 'version-4', 'visual', '2026-10-05T09:00:00.000Z', 'ENG-2');
  const technicalLive = saved('snap-technical', 'version-4', 'technical', '2026-10-02T09:00:00.000Z', 'ENG-1');

  const visualExport = issued('export-visual', { documentType: 'visual', exportedAt: '2026-10-03T10:00:00.000Z' });
  const technicalExport = issued('export-technical', { documentType: 'technical', exportedAt: '2026-10-03T10:00:00.000Z' });

  const liveByType = new Map(LIVE_REPORT_TYPES.map((type) => {
    const live = type === 'visual' ? visualLive : technicalLive;
    return [type, { generatedAt: live.generated_at, sourceFingerprints: live.source_fingerprints }];
  }));

  assert.notEqual(
    liveReportKey('version-4', 'visual'),
    liveReportKey('version-4', 'technical'),
    'the two report types are separate rows',
  );

  assert.equal(
    resolveExportLiveState({
      record: visualExport,
      version: VERSION_4,
      liveReport: liveByType.get('visual'),
    }).label,
    EXPORT_SOURCE_CHANGED_LABEL,
    'the Visual export is judged against the Visual live report',
  );
  assert.equal(
    resolveExportLiveState({
      record: technicalExport,
      version: VERSION_4,
      liveReport: liveByType.get('technical'),
    }).label,
    LIBRARY_SOURCE_LABEL.same_as_current,
    'the Visual report moving on does not move the Technical export',
  );
});

/* ── TEST 5 — versions are never confused ───────────────────────────────── */

test('TEST 5 — Level 4 version and Level 1 version are judged inside their own version group', () => {
  const level4Live = saved('snap-4', 'version-4', 'technical', '2026-10-05T09:00:00.000Z');
  const level1Live = saved('snap-1', 'version-1', 'technical', '2026-10-01T09:00:00.000Z');

  const exports = [
    issued('export-4', { versionId: 'version-4', exportedAt: '2026-10-04T10:00:00.000Z' }),
    issued('export-1', { versionId: 'version-1', exportedAt: '2026-10-02T10:00:00.000Z' }),
  ];

  const group4 = issuedRows(exports, 'version-4');
  const group1 = issuedRows(exports, 'version-1');

  assert.deepEqual(group4.map((row) => row.id), ['export-4']);
  assert.deepEqual(group1.map((row) => row.id), ['export-1'], 'each version lists only its own exports');
  assert.notEqual(
    liveReportKey('version-4', 'technical'),
    liveReportKey('version-1', 'technical'),
    'each version owns its own comparison key',
  );

  assert.equal(
    resolveExportLiveState({
      record: group4[0],
      version: VERSION_4,
      liveReport: { generatedAt: level4Live.generated_at, sourceFingerprints: level4Live.source_fingerprints },
    }).label,
    LIBRARY_SOURCE_LABEL.older_export,
    'the Level 4 export is older than the Level 4 live report',
  );
  assert.equal(
    resolveExportLiveState({
      record: group1[0],
      version: VERSION_1,
      liveReport: { generatedAt: level1Live.generated_at, sourceFingerprints: level1Live.source_fingerprints },
    }).label,
    LIBRARY_SOURCE_LABEL.same_as_current,
    'a Level 1 live report never reaches a Level 4 export',
  );
});