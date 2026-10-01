// p8-always-l4-authority.test.mjs
// ---------------------------------------------------------------------------
// RP22 Parameter 8 ("Upfiring/elevation speakers allowed?") is a fixed Sound
// Proof product rule: always Performance Level 4. Never a dash, never
// "Not verified", never "Not calculated".
//
//   TEST 1  The P8 authority states L4 / "No" / assumed, with one short note
//   TEST 2  The design-rating authority publishes P8 as scored L4 for any input
//   TEST 3  P8 stays out of the rating numerator — other scores do not move
//   TEST 4  The published engineering summary reports P8 as assumed L4 ("No")
//   TEST 5  The room-parameter level resolver always answers L4 for P8
//   TEST 6  The compliance summary counts P8 as assessed, not "not verified"
//   TEST 7  The report surfaces carry the P8 note and the fixed authority
//   TEST 8  The proposal/report text authority narrates P8 as an L4 result
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  P8_LEVEL,
  P8_ACHIEVED_VALUE,
  P8_PRESENTATION_STATUS,
  P8_FIXED_REASON,
  P8_NOTE,
  P8_NUMBER,
  isP8Number,
  isP8Key,
  buildP8RoomResult,
} from '../components/utils/rp22/p8Authority.js';
import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
} from '../components/report/technical/artcousticSystemDesignRating.js';
import { summariseEngineeringResults } from '../components/engineering/engineeringSummaryAuthority.js';
import { resolveRoomParameterLevel } from '../components/report/technical/roomParameterLevelAuthority.js';

const SEATS = [
  { id: 's1', x: 1.6, y: 3.6 },
  { id: 's2', x: 2.4, y: 3.6 },
];

const baseInput = {
  seats: SEATS,
  p12: { rawValue: 105, mode: 'minimum' },
  p13: { rawValue: 102, mode: 'minimum' },
};

test('TEST 1 — the P8 authority states Level 4, achieved "No" and one short note', () => {
  assert.equal(P8_LEVEL, 'L4');
  assert.equal(P8_ACHIEVED_VALUE, 'No');
  assert.equal(P8_PRESENTATION_STATUS, 'assumed');
  assert.equal(P8_NOTE, 'Level 4 is assigned by Sound Proof for this parameter.');
  assert.equal(isP8Number(8), true);
  assert.equal(isP8Number('8'), true);
  assert.equal(isP8Number(7), false);
  assert.equal(isP8Key('p8'), true);
  assert.equal(isP8Key('p7'), false);
});

test('TEST 2 — P8 is published as a scored Level 4 result for any input', () => {
  for (const input of [null, undefined, { rawValue: 1 }, { rawValue: 'Yes' }]) {
    const authority = buildArtcousticDesignRatingAuthority({ ...baseInput, p8: input });
    const p8 = authority.parameters.p8;
    assert.equal(p8.state, 'scored', `p8 state for input ${JSON.stringify(input)}`);
    assert.equal(p8.level, 'L4');
    assert.equal(p8.reason, P8_FIXED_REASON);
  }
});

test('TEST 3 — P8 never enters the rating numerator, so other scores do not move', () => {
  const withP8 = buildArtcousticDesignRatingAuthority({ ...baseInput, p8: { rawValue: 1 } });
  const withoutP8 = buildArtcousticDesignRatingAuthority({ ...baseInput });
  const a = calculateRoomDesignRating(withP8);
  const b = calculateRoomDesignRating(withoutP8);
  assert.equal(a.actualPoints, b.actualPoints, 'P8 input cannot change the rating');
  assert.equal(a.maximumAvailablePoints, b.maximumAvailablePoints);
  assert.ok(!(a.contributions || []).some((c) => c.key === 'p8'), 'P8 is not a rating contribution');
});

test('TEST 4 — the published summary reports P8 as assumed Level 4 with achieved "No"', () => {
  const authority = buildArtcousticDesignRatingAuthority({ ...baseInput, p8: null });
  const summary = summariseEngineeringResults({ designRatingAuthority: authority, seats: SEATS });

  const p8 = summary.project.compliance.byParameter.p8;
  assert.equal(p8.presentationStatus, P8_PRESENTATION_STATUS, 'P8 reads as an assumed authority');
  assert.equal(p8.level, 'L4');

  const roomResult = summary.roomResultsByParameter[P8_NUMBER];
  assert.equal(roomResult.level, 'L4');
  assert.equal(roomResult.value, 'No');
  assert.equal(roomResult.formatted, 'No', 'no dash can survive publication');
  assert.notEqual(roomResult.state, 'provisional');

  assert.equal(summary.parameterSummaries.project.p8.level, 'L4');
});

test('TEST 5 — the room-parameter level resolver always answers L4 for P8', () => {
  const emptyAnalysis = { gradedParameters: { primary: {} } };
  assert.equal(resolveRoomParameterLevel(8, { analysisResult: emptyAnalysis }), 'L4');
  assert.equal(
    resolveRoomParameterLevel(8, {
      analysisResult: { gradedParameters: { primary: { 8: { status: 'no_data', level: null, value: null } } } },
    }),
    'L4',
    'a missing engine result cannot blank P8',
  );
  assert.equal(resolveRoomParameterLevel(8, {}), 'L4');
});

test('TEST 6 — the compliance summary counts P8 as assessed, never "not verified"', () => {
  const authority = buildArtcousticDesignRatingAuthority({ ...baseInput, p8: null });
  const summary = summariseEngineeringResults({ designRatingAuthority: authority, seats: SEATS });
  const compliance = summary.project.compliance;
  assert.notEqual(compliance.byParameter.p8.presentationStatus, 'not_verified');
  assert.equal(compliance.byParameter.p8.state, 'scored');
  assert.ok(compliance.counts.L4 >= 1, 'P8 contributes to the assessed L4 count');
});

test('TEST 7 — the report surfaces carry the P8 note and read the fixed authority', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
  const tile = read('src/components/rp22/RP22ComplianceParameterTile.jsx');
  const card = read('src/components/report/technical/TechnicalParameterCard.jsx');
  const printCard = read('src/components/report/ParameterCard.jsx');
  const grid = read('src/components/report/RP22ReportParameterGrid.jsx');

  assert.ok(tile.includes('P8_NOTE'), 'compliance tile states the fixed note');
  assert.ok(card.includes('P8_NOTE'), 'technical card states the fixed note');
  assert.ok(printCard.includes('P8_NOTE'), 'compliance print card states the fixed note');
  assert.ok(grid.includes('p8Authority') || grid.includes('useParameterGridAuthority'), 'grid reads the published authority');

  const p8Authority = read('src/components/utils/rp22/p8Authority.js');
  assert.ok(p8Authority.includes("no \"Not verified\""), 'the rule is documented in the authority');
});

test('TEST 8 — the fixed P8 room result carries the level and the achieved value', () => {
  const result = buildP8RoomResult({ formatted: '—', level: '—', value: null });
  assert.equal(result.level, 'L4');
  assert.equal(result.value, 'No');
  assert.equal(result.formatted, 'No');
  assert.equal(result.fixedAuthority, true);
});