/**
 * Report gate completeness acceptance tests.
 *
 * The regression under test: a COMPLETED project whose saved publication states
 * a finished P19 RSP result was blocked from opening any report, because the
 * parameter's legacy per-seat label still read "provisional".
 *
 * Rule asserted here: a report is blocked only when the engineering authority is
 * genuinely incomplete. A finished published result counts as complete; a
 * genuinely unfinished assessment (no result, provisional seats, missing
 * parameters) stays blocked.
 *
 * Pure: no React, no database. Fixtures mirror the real published summaries.
 *
 * Run: node --import ./test/_alias-register.mjs test/report-gate-completeness.test.mjs
 */

import assert from 'node:assert/strict';

import { assessEngineeringReportCompleteness } from '@/components/engineering/engineeringReportCompleteness';
import {
  buildReportGateDiagnostics,
  buildReportGateDiagnosticRows,
} from '@/components/report/reportGateDiagnostics';

const SEATS = ['seat-r1-c1', 'seat-r1-c2', 'seat-r2-c1', 'seat-r2-c2', 'seat-r2-c3'];

const scoredSeatRows = (level = 'L4') => Object.fromEntries(
  SEATS.map((seatId) => [seatId, { state: 'scored', level }]),
);

/**
 * A saved publication shaped like the real completed Luxavo V5 summary:
 * every parameter terminal EXCEPT the legacy P19 per-seat label, while the
 * summary's own published P19 RSP result is a finished L4.
 */
function completedSummaryWithLegacyP19Label() {
  const parameterAuthority = {};
  for (let i = 1; i <= 21; i += 1) {
    const key = `p${i}`;
    const seatScoped = ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17'].includes(key);
    parameterAuthority[key] = seatScoped
      ? { state: 'scored', scope: 'seat', level: null, seats: scoredSeatRows() }
      : { state: 'scored', scope: 'room', level: 'L4', seats: null };
  }
  // The legacy P19 label: per-seat, provisional, no grade.
  parameterAuthority.p19 = {
    state: 'provisional',
    scope: 'seat',
    level: null,
    seats: Object.fromEntries(SEATS.map((seatId) => [seatId, {
      state: 'provisional',
      level: null,
      reason: 'missing-authoritative-p19-seat-grade',
    }])),
  };
  parameterAuthority.screen = { state: 'scored', scope: 'seat', level: null, seats: scoredSeatRows() };

  return {
    parameterAuthority,
    project: { seatIds: SEATS },
    seatHudById: Object.fromEntries(SEATS.map((seatId) => [seatId, {}])),
    roomResultsByParameter: {
      14: { state: 'scored', status: 'scored', level: 'L1', value: 109 },
      18: { state: 'scored', status: 'scored', level: 'L2', value: 22 },
      // The finished RSP result that decides P19's terminality.
      19: { state: 'scored', status: 'complete', level: 'L4', value: 0.952, isAuthoritative: true },
    },
  };
}

/** A genuinely unfinished publication: bass ran, nothing authoritative landed. */
function incompleteBassSummary() {
  const parameterAuthority = {};
  for (let i = 1; i <= 21; i += 1) {
    const key = `p${i}`;
    const seatScoped = ['p1', 'p4', 'p5', 'p6', 'p9', 'p10', 'p16', 'p17'].includes(key);
    parameterAuthority[key] = seatScoped
      ? { state: 'scored', scope: 'seat', level: null, seats: scoredSeatRows() }
      : { state: 'scored', scope: 'room', level: 'L4', seats: null };
  }
  for (const key of ['p14', 'p18', 'p19', 'p20']) {
    parameterAuthority[key] = { state: 'provisional', scope: 'room', level: null, seats: null };
  }
  parameterAuthority.screen = { state: 'scored', scope: 'seat', level: null, seats: scoredSeatRows() };
  return {
    parameterAuthority,
    project: { seatIds: SEATS },
    seatHudById: Object.fromEntries(SEATS.map((seatId) => [seatId, {}])),
    roomResultsByParameter: {
      19: { state: 'provisional', status: 'no_data', level: null },
    },
  };
}

const results = [];
const check = (name, condition) => {
  results.push([name, !!condition]);
  assert.ok(condition, name);
};

// ── 1. The regression: completed project, legacy P19 label ────────────────
const completed = completedSummaryWithLegacyP19Label();
check('completed: legacy P19 label is provisional', completed.parameterAuthority.p19.state === 'provisional');
const completedGate = assessEngineeringReportCompleteness(completed);
check('completed: gate reports complete', completedGate.complete === true);
check('completed: P19 not listed as missing', !completedGate.missingParameterKeys.includes('p19'));
check('completed: no reason blocks the report', completedGate.reason === null);

// ── 2. Genuinely incomplete bass stays blocked ────────────────────────────
const incompleteGate = assessEngineeringReportCompleteness(incompleteBassSummary());
check('incomplete: gate reports incomplete', incompleteGate.complete === false);
check('incomplete: names the missing bass parameters',
  ['p14', 'p18', 'p19', 'p20'].every((key) => incompleteGate.missingParameterKeys.includes(key)));

// ── 3. A non-terminal label with no published result is NOT terminal ──────
const labelOnly = incompleteBassSummary();
delete labelOnly.roomResultsByParameter[19];
const labelOnlyGate = assessEngineeringReportCompleteness(labelOnly);
check('provisional P19 with no result stays missing', labelOnlyGate.missingParameterKeys.includes('p19'));

// ── 4. A P19 result without a level is not a finished result ──────────────
const levelless = completedSummaryWithLegacyP19Label();
levelless.roomResultsByParameter[19] = { state: 'scored', status: 'complete', level: null };
const levellessGate = assessEngineeringReportCompleteness(levelless);
check('levelless P19 result stays missing', levellessGate.missingParameterKeys.includes('p19'));

// ── 5. Seat-scoped strictness is preserved ────────────────────────────────
const partialSeat = completedSummaryWithLegacyP19Label();
partialSeat.parameterAuthority.p5.seats['seat-r2-c3'] = { state: 'provisional', level: null };
const partialSeatGate = assessEngineeringReportCompleteness(partialSeat);
check('a provisional seat still blocks', partialSeatGate.complete === false);
check('a provisional seat is reported as a seat-level gap',
  partialSeatGate.incompleteSeatParameterKeys.includes('p5'));

// ── 6. An unrelated missing parameter is still named ─────────────────────
const missingP11 = completedSummaryWithLegacyP19Label();
delete missingP11.parameterAuthority.p11;
const missingP11Gate = assessEngineeringReportCompleteness(missingP11);
check('missing P11 blocks and is named', missingP11Gate.missingParameterKeys.includes('p11'));

// ── 7. No saved assessment at all ─────────────────────────────────────────
const noSummaryGate = assessEngineeringReportCompleteness(null);
check('no saved assessment blocks', noSummaryGate.complete === false);
check('no saved assessment names every parameter', noSummaryGate.missingParameterKeys.length === 21);

// ── 8. Diagnostics: complete authority, no saved report snapshot → opens ──
const readyDiagnostics = buildReportGateDiagnostics({
  projectId: 'p1',
  versionId: 'v1',
  reportType: 'technical',
  hasSavedEngineeringAuthority: true,
  hasCompleteEngineeringSnapshot: true,
  hasReportSnapshot: false,
  missingParameters: [],
  gateResult: 'ready',
  blockReason: null,
});
check('diagnostics: saved authority recognised', readyDiagnostics.has_saved_engineering_authority === true);
check('diagnostics: complete snapshot recognised', readyDiagnostics.has_complete_engineering_snapshot === true);
check('diagnostics: a missing report snapshot is not a block',
  readyDiagnostics.has_report_snapshot === false && readyDiagnostics.block_reason === null);

// ── 9. Diagnostics: blocked, with the bass items called out ───────────────
const blockedDiagnostics = buildReportGateDiagnostics({
  projectId: 'p2',
  versionId: 'v2',
  reportType: 'visual',
  hasSavedEngineeringAuthority: true,
  hasCompleteEngineeringSnapshot: incompleteGate.complete,
  hasReportSnapshot: false,
  missingParameters: incompleteGate.missingParameterKeys,
  incompleteSeatParameters: incompleteGate.incompleteSeatParameterKeys,
  sourceFingerprint: 'eng:v1:abc',
  savedFingerprint: null,
  snapshotStatus: 'none',
  gateResult: 'not-ready',
  blockReason: incompleteGate.reason,
});
check('diagnostics: incomplete snapshot reported', blockedDiagnostics.has_complete_engineering_snapshot === false);
check('diagnostics: bass gaps listed', blockedDiagnostics.missing_bass_parameters.length === 4);
check('diagnostics: block reason present', typeof blockedDiagnostics.block_reason === 'string');

const rows = buildReportGateDiagnosticRows(blockedDiagnostics).map(([label]) => label);
check('diagnostics rows carry every required field', [
  'project_id', 'version_id', 'report_type', 'has_saved_engineering_authority',
  'has_complete_engineering_snapshot', 'has_report_snapshot', 'missing_parameters',
  'missing_bass_parameters', 'source_fingerprint', 'saved_fingerprint',
  'snapshot_status', 'stale', 'gate_result', 'block_reason',
].every((label) => rows.includes(label)));

// ── 10. P19 resolved by the published result, in both directions ─────────
check('Luxavo-shaped summary: reports may open', completedGate.complete === true);
check('Marquee-shaped summary: reports stay blocked', incompleteGate.complete === false);

const failed = results.filter(([, ok]) => !ok);
for (const [name, ok] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);