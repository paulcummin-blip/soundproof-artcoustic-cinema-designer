/**
 * Acceptance tests for per-report-type saved report snapshots.
 *
 * Covers: save on generation, restore while the source fingerprints match,
 * out-of-date marking when the design moves on, regeneration overwriting the
 * saved report in place, and the guarantee that a saved report payload never
 * copies an engineering value.
 *
 * Pure: no React, no database.
 *
 * Run: node test/report-snapshot-authority.test.mjs
 */

import assert from 'node:assert/strict';

import {
  REPORT_SNAPSHOT_SCHEMA_VERSION,
  REPORT_SNAPSHOT_STATUS,
  REPORT_SNAPSHOT_TYPE,
  buildSnapshotPayload,
  buildSnapshotRecord,
  buildStaleSentence,
  buildSourceFingerprints,
  compareSourceFingerprints,
  currentSourceFingerprints,
  describeChangedFingerprints,
  isSnapshotRestorable,
  reportTypeLabel,
  resolveSnapshotStatus,
  snapshotIdentityKey,
} from '../src/components/report/reportSnapshotAuthority.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FINGERPRINTS = {
  engineeringFingerprint: 'eng:v1:aaaa1111bbbb2222',
  calculationFingerprint: 'bass:v4:cccc3333dddd4444',
  seatPriorityFingerprint: 'seatprio:eeee5555',
};

const seats = [
  { seat_id: 's1', x: 2.0, y: 3.0 },
  { seat_id: 's2', x: 2.6, y: 3.0 },
];
const speakers = [{ id: 'fl' }, { id: 'fc' }, { id: 'fr' }];
const subs = [{ id: 'sub1', enabled: true }, { id: 'sub2', enabled: false }];

/** A saved report as the database returns it. */
function savedSnapshot({ fingerprints = FINGERPRINTS, payload = null, schemaVersion = REPORT_SNAPSHOT_SCHEMA_VERSION } = {}) {
  return {
    id: 'snap_1',
    project_id: 'proj_1',
    version_id: 'ver_1',
    account_id: 'acct_1',
    report_type: REPORT_SNAPSHOT_TYPE.VISUAL,
    report_schema_version: schemaVersion,
    source_fingerprints: fingerprints,
    generated_at: '2026-10-02T09:15:00.000Z',
    generated_by: 'Paul',
    status: REPORT_SNAPSHOT_STATUS.CURRENT,
    payload: payload || buildSnapshotPayload({
      engineeringFingerprint: fingerprints.engineeringFingerprint,
      presentation: { seatingPositions: seats, placedSpeakers: speakers, subwooferInstances: subs },
      pages: [{ id: 'design-summary', category: 'Design Summary' }, { id: 'bass-capability', category: 'Bass Performance' }],
    }),
  };
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, message: error?.message || String(error) });
  }
}

// ── 1. First generation saves the report against the project version ────────

test('1. a generated report is saved against the project version', () => {
  const record = buildSnapshotRecord({
    projectId: 'proj_1',
    versionId: 'ver_1',
    accountId: 'acct_1',
    reportType: REPORT_SNAPSHOT_TYPE.VISUAL,
    sourceFingerprints: FINGERPRINTS,
    generatedBy: 'Paul',
    payload: buildSnapshotPayload({ engineeringFingerprint: FINGERPRINTS.engineeringFingerprint }),
    generatedAt: '2026-10-02T09:15:00.000Z',
  });

  assert.equal(record.project_id, 'proj_1');
  assert.equal(record.version_id, 'ver_1');
  assert.equal(record.report_type, 'visual');
  assert.equal(record.report_schema_version, REPORT_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(record.generated_at, '2026-10-02T09:15:00.000Z');
  assert.equal(record.generated_by, 'Paul');
  assert.equal(record.status, REPORT_SNAPSHOT_STATUS.CURRENT);
  assert.equal(record.status_updated_at, record.generated_at);
  assert.deepEqual(record.source_fingerprints, FINGERPRINTS);
});

test('1b. the saved report is restorable straight after generation', () => {
  const resolution = resolveSnapshotStatus({ saved: savedSnapshot(), currentFingerprints: FINGERPRINTS });
  assert.equal(resolution.restorable, true);
  assert.equal(resolution.status, REPORT_SNAPSHOT_STATUS.CURRENT);
  assert.deepEqual(resolution.changedKeys, []);
  assert.equal(resolution.generatedAt, '2026-10-02T09:15:00.000Z');
  assert.equal(resolution.generatedBy, 'Paul');
});

test('1c. one saved report per project version and report type', () => {
  const visual = snapshotIdentityKey({ projectId: 'p1', versionId: 'v1', reportType: REPORT_SNAPSHOT_TYPE.VISUAL });
  const technical = snapshotIdentityKey({ projectId: 'p1', versionId: 'v1', reportType: REPORT_SNAPSHOT_TYPE.TECHNICAL });
  const otherVersion = snapshotIdentityKey({ projectId: 'p1', versionId: 'v2', reportType: REPORT_SNAPSHOT_TYPE.VISUAL });

  assert.notEqual(visual, technical);
  assert.notEqual(visual, otherVersion);
  assert.equal(visual, snapshotIdentityKey({ projectId: 'p1', versionId: 'v1', reportType: REPORT_SNAPSHOT_TYPE.VISUAL }));
});

test('1d. every report type is named for the dealer', () => {
  assert.equal(reportTypeLabel(REPORT_SNAPSHOT_TYPE.VISUAL), 'Visual Report');
  assert.equal(reportTypeLabel(REPORT_SNAPSHOT_TYPE.TECHNICAL), 'Technical Report');
  assert.equal(reportTypeLabel(REPORT_SNAPSHOT_TYPE.SYSTEM_DESIGN_SUMMARY), 'System Design Summary');
});

// ── 2. Reopen restores the saved report while fingerprints match ────────────

test('2. reopening with an unchanged design restores the saved report', () => {
  // Nothing about the project has moved on.
  const current = currentSourceFingerprints({
    authoritySnapshot: {
      engineeringFingerprint: FINGERPRINTS.engineeringFingerprint,
      calculationFingerprint: FINGERPRINTS.calculationFingerprint,
    },
    engineeringSummary: { seatPriorityFingerprint: FINGERPRINTS.seatPriorityFingerprint },
  });

  const resolution = resolveSnapshotStatus({ saved: savedSnapshot(), currentFingerprints: current });
  assert.equal(resolution.status, REPORT_SNAPSHOT_STATUS.CURRENT);
  assert.equal(isSnapshotRestorable(savedSnapshot()), true);
});

test('2b. the live seat-priority indicator wins over the published one', () => {
  const fingerprints = currentSourceFingerprints({
    authoritySnapshot: null,
    engineeringSummary: { seatPriorityFingerprint: 'seatprio:published' },
    liveSeatPriorityFingerprint: 'seatprio:live',
  });
  assert.equal(fingerprints.seatPriorityFingerprint, 'seatprio:live');

  const fallback = currentSourceFingerprints({
    engineeringSummary: { seatPriorityFingerprint: 'seatprio:published' },
  });
  assert.equal(fallback.seatPriorityFingerprint, 'seatprio:published');
});

// ── 3. A design change marks the saved report, never blanks it ──────────────

test('3. a design change marks the saved report as generated before the latest changes', () => {
  const current = { ...FINGERPRINTS, engineeringFingerprint: 'eng:v1:99999999aaaaaaaa' };
  const resolution = resolveSnapshotStatus({ saved: savedSnapshot(), currentFingerprints: current });

  assert.equal(resolution.restorable, true, 'the saved report stays restorable — it is never blanked');
  assert.equal(resolution.status, REPORT_SNAPSHOT_STATUS.STALE);
  assert.deepEqual(resolution.changedKeys, ['engineeringFingerprint']);
  // The saved report itself is untouched: the values a dealer saw are still there.
  assert.equal(resolution.generatedAt, '2026-10-02T09:15:00.000Z');
  assert.equal(resolution.generatedBy, 'Paul');
});

test('3b. the out-of-date sentence names what moved on', () => {
  assert.equal(
    buildStaleSentence(['engineeringFingerprint']),
    'The design changed after this report was generated.',
  );
  assert.equal(
    buildStaleSentence(['seatPriorityFingerprint']),
    'The seating priorities changed after this report was generated.',
  );
  assert.equal(
    buildStaleSentence(['engineeringFingerprint', 'calculationFingerprint']),
    'The design and the bass assessment changed after this report was generated.',
  );
  assert.equal(
    buildStaleSentence(['engineeringFingerprint', 'calculationFingerprint', 'seatPriorityFingerprint']),
    'The design, the bass assessment and the seating priorities changed after this report was generated.',
  );
  assert.equal(
    buildStaleSentence([]),
    'This report was generated before the latest changes to this project.',
  );
});

test('3c. only the inputs that actually changed are reported', () => {
  const resolution = resolveSnapshotStatus({
    saved: savedSnapshot(),
    currentFingerprints: { ...FINGERPRINTS, calculationFingerprint: 'bass:v4:changed' },
  });
  assert.deepEqual(resolution.changedKeys, ['calculationFingerprint']);
  assert.deepEqual(describeChangedFingerprints(resolution.changedKeys), ['The bass assessment']);
});

test('3d. an unreadable fingerprint never manufactures out-of-date', () => {
  // A cold load that cannot read the seat priority says "current", never "stale".
  const cold = resolveSnapshotStatus({
    saved: savedSnapshot(),
    currentFingerprints: {
      engineeringFingerprint: FINGERPRINTS.engineeringFingerprint,
      calculationFingerprint: null,
      seatPriorityFingerprint: null,
    },
  });
  assert.equal(cold.status, REPORT_SNAPSHOT_STATUS.CURRENT);

  const comparison = compareSourceFingerprints(FINGERPRINTS, { engineeringFingerprint: FINGERPRINTS.engineeringFingerprint });
  assert.deepEqual(comparison.changed, []);
  assert.deepEqual(comparison.compared, ['engineeringFingerprint'], 'only readable inputs are judged');
});

test('3e. a saved report from another payload generation is not restored as current', () => {
  const older = savedSnapshot({ schemaVersion: REPORT_SNAPSHOT_SCHEMA_VERSION + 1 });
  const resolution = resolveSnapshotStatus({ saved: older, currentFingerprints: FINGERPRINTS });
  assert.equal(resolution.restorable, false);
  assert.equal(resolution.status, REPORT_SNAPSHOT_STATUS.NONE);
});

test('3f. a saved report with no payload is not restorable', () => {
  assert.equal(isSnapshotRestorable(savedSnapshot({ payload: {} })), false);
  assert.equal(isSnapshotRestorable(null), false);
  assert.equal(resolveSnapshotStatus({ saved: savedSnapshot({ payload: {} }) }).status, REPORT_SNAPSHOT_STATUS.NONE);
});

// ── 4. Regenerate overwrites the saved report in place ──────────────────────

test('4. regenerating overwrites the saved report and makes it current again', () => {
  const before = savedSnapshot();
  const movedOn = { ...FINGERPRINTS, engineeringFingerprint: 'eng:v1:99999999aaaaaaaa' };

  // Before regenerating, the saved report is out of date and stays untouched.
  assert.equal(resolveSnapshotStatus({ saved: before, currentFingerprints: movedOn }).status, REPORT_SNAPSHOT_STATUS.STALE);

  // Regenerate writes the same record identity with the fingerprints read now.
  const regenerated = {
    ...before,
    ...buildSnapshotRecord({
      projectId: 'proj_1',
      versionId: 'ver_1',
      accountId: 'acct_1',
      reportType: REPORT_SNAPSHOT_TYPE.VISUAL,
      sourceFingerprints: movedOn,
      generatedBy: 'Paul',
      payload: before.payload,
      generatedAt: '2026-10-02T14:00:00.000Z',
    }),
  };

  assert.equal(regenerated.id, before.id, 'the same saved report is overwritten, not duplicated');
  assert.equal(regenerated.generated_at, '2026-10-02T14:00:00.000Z');
  assert.equal(resolveSnapshotStatus({ saved: regenerated, currentFingerprints: movedOn }).status, REPORT_SNAPSHOT_STATUS.CURRENT);
});

// ── 5. A saved report never becomes a second engineering authority ──────────

test('5. the saved payload carries no engineering value', () => {
  const payload = buildSnapshotPayload({
    engineeringFingerprint: FINGERPRINTS.engineeringFingerprint,
    presentation: {
      seatingPositions: seats,
      placedSpeakers: speakers,
      subwooferInstances: subs,
      // The payload must not copy any of this, even when it is handed in.
      roomResultsByParameter: { 14: { value: 104.2 }, 18: { value: 24 }, 19: { value: 0.82 } },
      seatHudById: { s1: { rp22: { p5: { level: 'L3' } } } },
      designRating: { rating: { dpi: 81 } },
    },
    pages: [{ id: 'design-summary', category: 'Design Summary' }],
  });

  const serialised = JSON.stringify(payload);
  assert.ok(!serialised.includes('roomResultsByParameter'), 'no RP22 parameter values are copied');
  assert.ok(!serialised.includes('seatHudById'), 'no seat results are copied');
  assert.ok(!serialised.includes('designRating'), 'no design rating is copied');
  assert.deepEqual(Object.keys(payload).sort(), ['engineeringFingerprint', 'pages', 'presentation']);
});

test('5b. the saved payload records the report identity and its page inventory', () => {
  const payload = buildSnapshotPayload({
    engineeringFingerprint: FINGERPRINTS.engineeringFingerprint,
    presentation: {
      showAsdr: true,
      priceData: { finalTotal: 42000 },
      seatingPositions: seats,
      placedSpeakers: speakers,
      subwooferInstances: subs,
      dolbyLayout: '9.4.4',
    },
    pages: [
      { id: 'design-summary', category: 'Design Summary' },
      { id: 'bass-capability', category: 'Bass Performance' },
      { category: 'No id — never inventoried' },
    ],
  });

  assert.equal(payload.engineeringFingerprint, FINGERPRINTS.engineeringFingerprint);
  assert.equal(payload.presentation.seatingCount, 2);
  assert.equal(payload.presentation.speakerCount, 3);
  assert.equal(payload.presentation.subwooferCount, 1, 'a disabled subwoofer is not counted');
  assert.equal(payload.presentation.dolbyLayout, '9.4.4');
  assert.deepEqual(payload.presentation.priceData, { finalTotal: 42000 });
  assert.deepEqual(payload.pages, [
    { id: 'design-summary', category: 'Design Summary' },
    { id: 'bass-capability', category: 'Bass Performance' },
  ]);
});

test('5c. an empty fingerprint set is normalised, never guessed', () => {
  assert.deepEqual(buildSourceFingerprints({ engineeringFingerprint: '  eng:v1:x  ' }), {
    engineeringFingerprint: 'eng:v1:x',
    calculationFingerprint: null,
    seatPriorityFingerprint: null,
  });
  assert.deepEqual(buildSourceFingerprints(null), {
    engineeringFingerprint: null,
    calculationFingerprint: null,
    seatPriorityFingerprint: null,
  });
});

// ── Report ──────────────────────────────────────────────────────────────────

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}`);
  if (!result.ok) console.log(`      ${result.message}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) process.exitCode = 1;