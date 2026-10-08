// ---------------------------------------------------------------------------
// P19 — RSP-only authority across the reports and the proposal path
//
// P19 is the reference seating position response against the house target. It
// has no per-seat result at all, so no report or proposal surface may read,
// require, render or claim a per-seat P19 result.
//
//   TEST 1  the Visual bass adapter carries the RSP result only
//   TEST 2  the P19 page is RSP-only and has a missing-evidence state
//   TEST 3  the Bass Response page carries P20 per seat and no P19 seat data
//   TEST 4  the Technical Report can never draw a P19 seat grid
//   TEST 5  the proposal bass authority carries no P19 per-seat rows
//   TEST 6  the proposal evidence reader keeps only the RSP P19 result
//   TEST 7  no P19 seat-scoped claim is minted into the pack
//   TEST 8  a P19 seat-scoped claim is rejected by the writer contract
//   TEST 9  readiness requires the RSP P19 result, and a legacy per-seat P19
//           result never satisfies it
//   TEST 10 P20 per-seat evidence is unchanged
//
// TEST 1-4 read the components as source text: they are React modules bound to
// the app's '@/' aliases. TEST 5-10 exercise the pure authorities directly.
// Nothing here asserts or changes RP22 scoring, thresholds or engineering maths.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBassAuthority } from '../src/components/proposal/engineeringAuthority/buildBassAuthority.js';
import { buildSnapshotP19 } from '../src/components/proposal/engineeringAuthority/snapshotP19.js';
import { rspOnlyP19 } from '../base44/shared/proposalReportEvidenceReader.js';
import { buildScopedSeatClaims } from '../base44/shared/proposalEvidence/proposalEvidenceSeatScopes.js';
import { referencePositionScopeIssue } from '../base44/shared/proposalWriter/writerOutputTextRules.js';
import { validateReportEvidence } from '../base44/shared/reportEvidenceCompleteness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const VISUAL_ADAPTER = read('src/components/report/client/selectClientBassPerformance.js');
const P19_PAGE = read('src/components/report/client/ClientP19RspPresentation.jsx');
const BASS_PAGE = read('src/components/report/client/ClientBassResponse.jsx');
const PARAM_GRID = read('src/components/report/RP22ReportParameterGrid.jsx');
const GRID_AUTHORITY = read('src/components/report/technical/useParameterGridAuthority.jsx');
const PARAM_CARD = read('src/components/report/technical/TechnicalParameterCard.jsx');
const SCANNER = read('base44/shared/proposalWriter/writerProseScanner.js');
const EVIDENCE_READER = read('base44/shared/proposalReportEvidenceReader.js');

/* ── 1. The Visual bass adapter ─────────────────────────────────────────── */

test('the Visual bass adapter builds P19 from the RSP result only', () => {
  // The P19 object literal itself: from its opening line to the P20 block.
  const p19Block = VISUAL_ADAPTER.slice(
    VISUAL_ADAPTER.indexOf('const p19 = p19Room ? {'),
    VISUAL_ADAPTER.indexOf('const p20 ='),
  );
  assert.ok(p19Block.length > 0, 'the P19 adapter block was located');
  assert.ok(
    !/perSeatResults/.test(p19Block),
    'the Visual bass adapter carries no per-seat P19 rows',
  );
  assert.ok(
    !/seatResultsByParameter\?\.p19/.test(VISUAL_ADAPTER),
    'the Visual bass adapter never reads the stored per-seat P19 rows',
  );
  assert.match(
    p19Block,
    /rspResult:/,
    'the P19 result is the published RSP result',
  );
  assert.match(
    VISUAL_ADAPTER,
    /seatResultsByParameter\?\.p20/,
    'P20 seat results are still carried',
  );
  assert.match(
    VISUAL_ADAPTER.slice(VISUAL_ADAPTER.indexOf('const p20 =')),
    /perSeatResults:/,
    'the P20 per-seat rows are unchanged',
  );
});

/* ── 2. The P19 page ────────────────────────────────────────────────────── */

test('the P19 page reads the RSP result and states the missing-evidence case', () => {
  assert.ok(
    !/perSeatResults/.test(P19_PAGE),
    'the P19 page has no per-seat P19 fallback',
  );
  assert.ok(
    !/p19\?\.perSeat/.test(P19_PAGE) && !/p19\.perSeat/.test(P19_PAGE),
    'the P19 page never reaches into a per-seat P19 block',
  );
  assert.match(
    P19_PAGE,
    /MISSING_EVIDENCE_MESSAGE/,
    'a missing RSP result is stated instead of substituted',
  );
  assert.match(
    P19_PAGE,
    /has not been assessed for this design/,
    'the missing-evidence copy names the absence plainly',
  );
});

/* ── 3. The Bass Response page (P20) ────────────────────────────────────── */

test('the Bass Response page carries P20 per seat and no P19 seat data', () => {
  assert.match(
    BASS_PAGE,
    /function buildBassSeats\(seatingPositions, p20PerSeat\)/,
    'the seat builder takes P20 alone',
  );
  assert.ok(
    !/p19Level|p19VariationDb|p19PerSeat/.test(BASS_PAGE),
    'no per-seat P19 field is carried by the Bass Response page',
  );
  assert.match(
    BASS_PAGE,
    /p20Level:/,
    'P20 seat levels are unchanged',
  );
});

/* ── 4. The Technical Report ────────────────────────────────────────────── */

test('the Technical Report can never draw a P19 seat grid', () => {
  assert.match(
    PARAM_GRID,
    /Number\(param\?\.id\) === 19/,
    'the parameter grid refuses a P19 seat map',
  );
  assert.match(
    GRID_AUTHORITY,
    /if \(Number\(paramId\) === 19\) return \[\];/,
    'the grid authority builds no P19 seat grid',
  );
  assert.match(
    PARAM_CARD,
    /Number\(param\?\.id\) !== 19/,
    'the parameter card never treats P19 as seat-scoped',
  );
});

/* ── 5. Proposal bass authority ─────────────────────────────────────────── */

test('the proposal bass authority carries no P19 per-seat rows and keeps P20', () => {
  const authority = buildBassAuthority({
    roomResultsByParameter: {
      14: { level: 'L3', value: 6, formatted: '6 dBC' },
      18: { level: 'L2', value: 28, formatted: '28 Hz' },
      19: { level: 'L2', value: 4.5, formatted: '4.5 dB' },
    },
    parameterSummaries: { project: { p19: { level: 'L2' }, p20: { level: 'L1' } } },
    project: { reportCounts: { seatResultsByParameter: { p19: [{ seatId: 'a', level: 'L2' }], p20: [{ seatId: 'a', level: 'L1' }] } } },
  });

  assert.equal(authority.p19.parameter_id, 19);
  assert.equal(authority.p19.scope, 'rsp');
  assert.equal(authority.p19.achieved_level, 'L2');
  assert.ok(
    !Object.prototype.hasOwnProperty.call(authority.p19, 'per_seat'),
    'the P19 authority has no per-seat block at all',
  );
  assert.deepEqual(authority.p20.per_seat, [{ seatId: 'a', level: 'L1' }]);
});

/* ── 6. The proposal evidence reader ───────────────────────────────────── */

test('the proposal evidence reader keeps only the RSP P19 result', () => {
  const legacy = {
    rsp: { level: 'L2', display_value: '4.5 dB' },
    primary_floor: 'L2',
    secondary_floor: 'L1',
    project_floor: 'L1',
    per_seat: [{ seatId: 'seat-r1-c1', level: 'L1' }],
    coverage_summary: 'legacy per-seat coverage',
  };
  assert.deepEqual(rspOnlyP19(legacy), { rsp: { level: 'L2', display_value: '4.5 dB' } });
  assert.deepEqual(rspOnlyP19(null), null);
  assert.match(
    EVIDENCE_READER,
    /p19: rspOnlyP19\(engineering\.bass\.p19\)/,
    'the proposal snapshot reads P19 through the RSP-only rule',
  );
});

/* ── 7. Pack claims ────────────────────────────────────────────────────── */

test('no P19 seat-scoped claim is minted, and the P20 claim is unchanged', () => {
  const option = {
    version_id: 'v1',
    version_name: 'Level 4 version',
    facts: {
      fingerprints: { engineering: 'eng:1', seating_scope: 'seat:1' },
      report_snapshot_ids: { visual: 'r1', technical: 'r2' },
      seat_scopes: {
        primary: {
          available: true,
          seat_count: 3,
          parameters: {
            p19: { level: 'L3', parameter_scope: 'seat' },
            p20: { level: 'L4', parameter_scope: 'seat' },
          },
        },
        secondary: { available: false, seat_count: 0, parameters: {} },
      },
    },
  };

  const claims = buildScopedSeatClaims(option, 0);
  assert.equal(claims.filter((claim) => claim.area === 'p19').length, 0);
  const p20 = claims.find((claim) => claim.area === 'p20');
  assert.ok(p20, 'the P20 primary seat claim is still minted');
  assert.equal(p20.scope, 'primary');
  assert.equal(p20.level, 'L4');
});

/* ── 8. Writer contract ────────────────────────────────────────────────── */

test('a P19 seat-scoped claim is rejected, and honest wording is not', () => {
  const reason = referencePositionScopeIssue({
    sentence: 'Bass response is excellent across the primary seats.',
    scope: 'primary',
  });
  assert.equal(reason, 'p19_is_assessed_at_the_reference_seating_position_not_across_the_seats');

  assert.equal(
    referencePositionScopeIssue({
      sentence: 'Bass response is excellent across the primary seats.',
      scope: 'all',
    }),
    'p19_is_assessed_at_the_reference_seating_position_not_across_the_seats',
  );
  assert.equal(
    referencePositionScopeIssue({
      sentence: 'Bass response at the reference seating position is good.',
      scope: null,
    }),
    null,
  );
  assert.equal(
    referencePositionScopeIssue({
      sentence: 'Bass response is not even across every seat.',
      scope: 'all',
    }),
    null,
  );
  assert.equal(
    referencePositionScopeIssue({
      sentence: 'Bass consistency is excellent across the primary seats.',
      scope: 'primary',
    }),
    null,
  );
  assert.equal(
    referencePositionScopeIssue({
      sentence: 'Bass response is excellent across the primary seats.',
      scope: 'primary',
      packProse: ['bass response is excellent across the primary seats.'],
    }),
    null,
  );

  assert.match(
    SCANNER,
    /referencePositionScopeIssue/,
    'the writer validator applies the rule to every section it scans',
  );
  assert.match(
    SCANNER,
    /WRITER_REJECTION\.SCOPE_MISMATCH/,
    'a P19 seat-scoped claim is a reported violation',
  );
});

/* ── 9. Readiness ──────────────────────────────────────────────────────── */

function technicalEvidence(p19Entry) {
  return {
    evidence_version: 1,
    report_type: 'technical',
    identity: {
      project_id: 'p1',
      version_id: 'v1',
      report_type: 'technical',
      source_fingerprint: 'eng:1',
      bass_fingerprint: 'bass:1',
    },
    room: { length_m: 6, width_m: 4.5, height_m: 2.4 },
    screen: { screen_type: 'Projection screen', format: '16:9', viewable_diagonal_in: 120 },
    system: { products_selected: [{ model: 'Q4-3', quantity: 3 }] },
    parameter_index: p19Entry ? { P19: p19Entry } : {},
    seating: {
      seats: 1,
      per_seat: [{
        row: 1,
        seat_id: 'seat-r1-c1',
        column: 1,
        priority: 'primary',
        distance_m: 4.2,
        horizontal_angle_deg: 12,
      }],
    },
    proposal_ready: true,
  };
}

test('readiness requires the RSP P19 result and a legacy per-seat P19 never satisfies it', () => {
  const rspResult = {
    key: 'P19',
    scope: 'rsp',
    level: 'L2',
    value: '4.5 dB',
    authority_value: '4.5 dB',
    authority_level: 'L2',
    authority_fingerprint: 'bass:1',
    authority_timestamp: '2026-01-01T00:00:00.000Z',
    source_type: 'durable-current-bass-authority',
  };

  const present = validateReportEvidence(technicalEvidence(rspResult), 'technical');
  assert.ok(
    !present.missing.includes('parameter_index.P19'),
    'the aggregate RSP P19 result satisfies the P19 requirement',
  );

  const absent = validateReportEvidence(technicalEvidence(null), 'technical');
  assert.ok(
    absent.missing.includes('parameter_index.P19'),
    'no P19 result is still reported as missing',
  );

  // The legacy per-seat marker is not a result: it cannot stand in for the RSP
  // P19 result, so readiness is still blocked.
  const legacyPerSeat = validateReportEvidence(technicalEvidence({
    ...rspResult,
    scope: 'seat',
    value: 'Seat results',
    authority_value: 'Seat results',
  }), 'technical');
  assert.ok(
    legacyPerSeat.missing.includes('parameter_index.P19'),
    'a per-seat P19 row never satisfies the P19 requirement',
  );
});

/* ── 10. P20 is unchanged ──────────────────────────────────────────────── */

test('the P20 per-seat authority is unchanged', () => {
  const authority = buildBassAuthority({
    roomResultsByParameter: {},
    parameterSummaries: { project: { p20: { level: 'L1' } } },
    project: { reportCounts: { seatResultsByParameter: { p20: [{ seatId: 'a', level: 'L2' }, { seatId: 'b', level: 'L1' }] } } },
  });
  assert.equal(authority.available, true);
  assert.equal(authority.p20.achieved_level, 'L1');
  assert.equal(authority.p20.per_seat.length, 2);

  // The frozen P19 snapshot stays RSP-only, and P20 keeps its seat rows.
  const snapshotP19 = buildSnapshotP19({
    parameterSummaries: { project: { p19: { level: 'L2', value: 4.5, valueFormatted: '4.5 dB' } } },
  });
  assert.deepEqual(snapshotP19.per_seat, []);
  assert.equal(snapshotP19.rsp.level, 'L2');
  assert.equal(snapshotP19.rsp.display_value, '4.5 dB');
});