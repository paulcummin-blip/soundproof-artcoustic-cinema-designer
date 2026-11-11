// adi-shortlist-selection.test.mjs
// Focused tests for the global ADI Starting Layout shortlist.
//
// Locks in the contract:
//   - Eligible candidates across 1/2/4-sub quantities are POOLED and ranked
//     GLOBALLY by the existing canonical comparator, not one-per-quantity.
//   - Materially equivalent geometry (same coordinates within 2 cm) is
//     deduplicated; the best-ranked instance wins.
//   - Up to three credible, materially distinct candidates are returned.
//   - Fewer than three are returned when fewer credible candidates exist.
//   - Side-wall layouts appear ONLY when fewer than three practical options
//     exist AND the side candidate delivers a whole-Level improvement over
//     the best practical candidate globally, without regression in the other
//     relevant Level.
//   - Every returned option carries P19/P20 from its own canonical evaluation
//     (valid=true with real Levels); no invented scores.
//   - P14 is a necessary constraint: candidates that failed the requested P14
//     operating point (requestedP14Pass === false) are excluded.
//
// Run: node --import ./test/_alias-register.mjs --test test/adi-shortlist-selection.test.mjs

import assert from 'node:assert/strict';
import { buildAdiShortlist } from '@/components/room/bass/bda/adiShortlistSelection';
import { isSideOrMixedWallFamily } from '@/components/room/bass/stage2/stage2PracticalPlacementPreference';

// --- helpers -------------------------------------------------------------

const SEAT_PRIORITY = new Map([
  ['seat-1', 'primary'],
  ['seat-2', 'primary'],
  ['seat-3', 'secondary'],
]);

const CONTEXT = {
  roomDims: { widthM: 5, lengthM: 7, heightM: 2.6 },
  selectedSubModel: 'sub2-12',
  subwooferBottomHeightM: 0.05,
};

function makeResult({
  finalistId,
  familyId,
  quantity,
  coordinates,
  p19Level = 3,
  p19Variation = 2.5,
  p20PrimaryLevel = 3,
  p20PrimaryVariation = 3.0,
  p20SecondaryLevel = 2,
  p20SecondaryVariation = 4.0,
  requestedP14Pass = true,
  p14HeadroomDb = 6,
  physicalRejection = null,
  terminal = false,
}) {
  return {
    finalistId,
    familyId,
    quantity,
    coordinates,
    selectedProduct: 'sub2-12',
    achievedP19Level: p19Level,
    achievedP19VariationDb: p19Variation,
    achievedP20VariationDb: p20PrimaryVariation,
    perSeatP20: [
      { seatId: 'seat-1', level: p20PrimaryLevel, variationDbRaw: p20PrimaryVariation, worstFrequencyHz: 40 },
      { seatId: 'seat-2', level: p20PrimaryLevel, variationDbRaw: p20PrimaryVariation, worstFrequencyHz: 40 },
      { seatId: 'seat-3', level: p20SecondaryLevel, variationDbRaw: p20SecondaryVariation, worstFrequencyHz: 45 },
    ],
    perSeatP19: [
      { seatId: 'seat-1', level: p19Level, variationDbRaw: p19Variation, worstFrequencyHz: 35 },
      { seatId: 'seat-2', level: p19Level, variationDbRaw: p19Variation, worstFrequencyHz: 35 },
      { seatId: 'seat-3', level: p19Level, variationDbRaw: p19Variation, worstFrequencyHz: 35 },
    ],
    requestedP14Pass,
    p14HeadroomDb,
    physicalRejection,
    terminal,
    physicalValidation: physicalRejection ? { passed: false } : { passed: true },
    rankingData: {
      rankingTuple: [
        0, // -totalFailingSeats
        Math.min(p19Level, p20PrimaryLevel), // worstPrimaryCombined
        0, 0, // L4, L3+ counts
        -Math.floor(p19Variation), -Math.floor(p20PrimaryVariation), // deviations
        0, // rowVariation
        Math.min(p19Level, p20SecondaryLevel), 0, 0, // secondary combined
        -Math.floor(p19Variation), -Math.floor(p20SecondaryVariation), 0,
        -p19Variation, -p20PrimaryVariation, // overall response error
        p14HeadroomDb, 0, 1, 0, 0, 'coord-key',
      ],
      primarySummary: {
        seatCount: 2,
        seats: [
          { seatId: 'seat-1', p19Level, p20Level: p20PrimaryLevel, p19VariationDb: p19Variation, p20VariationDb: p20PrimaryVariation },
          { seatId: 'seat-2', p19Level, p20Level: p20PrimaryLevel, p19VariationDb: p19Variation, p20VariationDb: p20PrimaryVariation },
        ],
      },
      secondarySummary: {
        seatCount: 1,
        seats: [
          { seatId: 'seat-3', p19Level, p20Level: p20SecondaryLevel, p19VariationDb: p19Variation, p20VariationDb: p20SecondaryVariation },
        ],
      },
    },
  };
}

function makeBucket(ranked) {
  return {
    evaluatedFinalists: ranked,
    bestFinalist: ranked[0] || null,
    finalistCount: ranked.length,
  };
}

// --- tests ---------------------------------------------------------------

// 1. Global pooling: a 4-sub candidate that outranks a 2-sub candidate
//    appears first in the shortlist, irrespective of quantity order.
{
  const twoSub = makeResult({
    finalistId: 'two-C_FRONT_PAIR',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const fourSub = makeResult({
    finalistId: 'four-RP22_E',
    familyId: 'RP22_E',
    quantity: 4,
    coordinates: [{ x: 0.3, y: 0.3 }, { x: 4.7, y: 0.3 }, { x: 0.3, y: 6.7 }, { x: 4.7, y: 6.7 }],
    p19Level: 4, p20PrimaryLevel: 4,
  });
  const oneSub = makeResult({
    finalistId: 'one-FRONT_MID',
    familyId: 'ONE_FRONT_MID',
    quantity: 1,
    coordinates: [{ x: 2.5, y: 0.3 }],
    p19Level: 1, p20PrimaryLevel: 1,
  });

  const stage2State = {
    status: 'complete',
    fingerprint: 'fp-1',
    one_sub_result: makeBucket([oneSub]),
    two_sub_result: makeBucket([twoSub]),
    four_sub_result: makeBucket([fourSub]),
  };

  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 3, 'three distinct candidates pooled globally');
  assert.equal(shortlist[0].quantity, 4, '4-sub (best-ranked) is first globally');
  assert.equal(shortlist[0].finalistId, 'four-RP22_E');
  assert.equal(shortlist[1].quantity, 2, '2-sub is second');
  assert.equal(shortlist[2].quantity, 1, '1-sub is third');
  assert.ok(shortlist.every((o) => o.valid === true), 'every option has valid canonical evidence');
  assert.ok(shortlist.every((o) => o.p19 && o.p19.level != null), 'P19 carried from canonical evaluation');
  console.log('  ✔ Global pooling ranks across quantities, best-first');
}

// 2. Material-equivalence dedup: two 2-sub candidates with the same
//    coordinates (within 2 cm) collapse to one — the best-ranked instance.
{
  const a = makeResult({
    finalistId: 'two-A',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.260, y: 0.310 }, { x: 3.740, y: 0.310 }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const b = makeResult({
    finalistId: 'two-B',
    familyId: 'FRONT_THIRD_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.265, y: 0.310 }, { x: 3.745, y: 0.310 }], // 5 mm from A, same 2 cm bucket
    p19Level: 2, p20PrimaryLevel: 2,
  });

  const stage2State = {
    status: 'complete',
    fingerprint: 'fp-2',
    one_sub_result: null,
    two_sub_result: makeBucket([a, b]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'materially equivalent geometry deduped to one');
  assert.equal(shortlist[0].finalistId, 'two-A', 'best-ranked equivalent wins');
  console.log('  ✔ Materially equivalent geometry deduplicated (best-ranked wins)');
}

// 3. Fewer than three: only one quantity has an eligible candidate.
{
  const twoSub = makeResult({
    finalistId: 'two-only',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
  });
  const stage2State = {
    status: 'complete',
    fingerprint: 'fp-3',
    one_sub_result: null,
    two_sub_result: makeBucket([twoSub]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'fewer than three returned when only one exists');
  console.log('  ✔ Fewer than three eligible → fewer than three returned');
}

// 4. P14 exclusion: a candidate that failed the requested P14 operating point
//    (requestedP14Pass === false) is excluded — P14 is a necessary constraint.
{
  const p14Fail = makeResult({
    finalistId: 'p14-fail',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
    requestedP14Pass: false,
    p19Level: null,
    p19Variation: null,
  });
  const good = makeResult({
    finalistId: 'good',
    familyId: 'RP22_E',
    quantity: 4,
    coordinates: [{ x: 0.3, y: 0.3 }, { x: 4.7, y: 0.3 }, { x: 0.3, y: 6.7 }, { x: 4.7, y: 6.7 }],
  });
  const stage2State = {
    status: 'complete',
    fingerprint: 'fp-4',
    one_sub_result: null,
    two_sub_result: makeBucket([p14Fail]),
    four_sub_result: makeBucket([good]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'P14-failed candidate excluded');
  assert.equal(shortlist[0].finalistId, 'good', 'only the P14-passing candidate remains');
  console.log('  ✔ P14 operating-point failure excludes the candidate');
}

// 5. Side-wall exception: a side/mixed candidate is added ONLY when fewer than
//    three practical options exist AND it delivers a whole-Level improvement
//    over the best practical candidate globally.
{
  const practical = makeResult({
    finalistId: 'prac-2sub',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  // Side-wall with a whole-Level Primary P20 improvement, no P19 regression
  const sideImproved = makeResult({
    finalistId: 'side-RP22_D',
    familyId: 'RP22_D', // side-wall quarter positions
    quantity: 4,
    coordinates: [{ x: 0, y: 1.75 }, { x: 5, y: 1.75 }, { x: 0, y: 5.25 }, { x: 5, y: 5.25 }],
    p19Level: 2, p20PrimaryLevel: 3, // Primary P20 L2→L3 = whole-Level improvement, P19 no regression
  });
  // Side-wall with NO whole-Level improvement — must NOT appear
  const sideSame = makeResult({
    finalistId: 'side-RP22_G',
    familyId: 'RP22_G', // side-wall midpoints
    quantity: 2,
    coordinates: [{ x: 0, y: 3.5 }, { x: 5, y: 3.5 }],
    p19Level: 2, p20PrimaryLevel: 2, // same Levels — marginal, no qualification
  });

  const stage2State = {
    status: 'complete',
    fingerprint: 'fp-5',
    one_sub_result: null,
    two_sub_result: makeBucket([practical, sideSame]),
    four_sub_result: makeBucket([sideImproved]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 2, 'practical + one qualifying side-wall');
  assert.equal(shortlist[0].finalistId, 'prac-2sub', 'practical candidate first');
  assert.equal(shortlist[1].finalistId, 'side-RP22_D', 'qualifying side-wall second');
  assert.equal(shortlist[1].placementKind, 'alternative', 'side-wall tagged as alternative');
  assert.ok(!shortlist.find((o) => o.finalistId === 'side-RP22_G'), 'marginal side-wall excluded');
  console.log('  ✔ Side-wall exception: whole-Level improvement qualifies, marginal does not');
}

// 6. Side-wall does NOT displace a credible front/rear solution: when three
//    distinct practical options exist, no side-wall is added.
{
  const p1 = makeResult({
    finalistId: 'prac-1',
    familyId: 'ONE_FRONT_MID', quantity: 1,
    coordinates: [{ x: 2.5, y: 0.3 }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const p2 = makeResult({
    finalistId: 'prac-2',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const p3 = makeResult({
    finalistId: 'prac-4',
    familyId: 'RP22_E', quantity: 4,
    coordinates: [{ x: 0.3, y: 0.3 }, { x: 4.7, y: 0.3 }, { x: 0.3, y: 6.7 }, { x: 4.7, y: 6.7 }],
    p19Level: 1, p20PrimaryLevel: 1,
  });
  const sideBetter = makeResult({
    finalistId: 'side-better',
    familyId: 'RP22_D', quantity: 4,
    coordinates: [{ x: 0, y: 1.75 }, { x: 5, y: 1.75 }, { x: 0, y: 5.25 }, { x: 5, y: 5.25 }],
    p19Level: 4, p20PrimaryLevel: 4, // whole-Level improvement over all practicals
  });
  const stage2State = {
    status: 'complete',
    fingerprint: 'fp-6',
    one_sub_result: makeBucket([p1]),
    two_sub_result: makeBucket([p2]),
    four_sub_result: makeBucket([p3, sideBetter]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 3, 'three practical options fill the shortlist');
  assert.ok(shortlist.every((o) => !isSideOrMixedWallFamily(o.familyId)), 'no side-wall when practicals fill the shortlist');
  console.log('  ✔ Three practical options → no side-wall displacement');
}

// 7. No current evaluation → empty shortlist (waiting state handled by UI).
{
  const shortlist = buildAdiShortlist({ status: 'updating', fingerprint: 'fp' }, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 0, 'updating state yields no options');
  const empty = buildAdiShortlist({ status: 'complete', fingerprint: 'fp' }, SEAT_PRIORITY, CONTEXT);
  assert.equal(empty.length, 0, 'complete with no buckets yields no options');
  console.log('  ✔ No current evaluation → empty shortlist');
}

// 8. Fingerprint stamping: every option carries the Stage 2 run fingerprint.
{
  const r = makeResult({
    finalistId: 'fp-test',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: 0.3 }, { x: 3.75, y: 0.3 }],
  });
  const stage2State = {
    status: 'complete',
    fingerprint: 'run-fp-123',
    one_sub_result: null,
    two_sub_result: makeBucket([r]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist[0].fingerprint, 'run-fp-123', 'option stamped with run fingerprint');
  console.log('  ✔ Every option carries the Stage 2 run fingerprint');
}

console.log('\nadi-shortlist-selection: all checks passed');