// adi-shortlist-selection.test.mjs
// Focused tests for the global ADI Starting Layout shortlist.
//
// Locks in the contract:
//   - Eligible candidates across 1/2/4-sub quantities are POOLED and ranked
//     GLOBALLY by the existing canonical comparator, not one-per-quantity.
//   - Practical classification is derived from ACTUAL cabinet wall-contact
//     (isPracticalWallContactPlacement), not family name. A cabinet whose
//     near face is inset (~390 mm from the wall) is NOT practical.
//   - Materially equivalent geometry (same coordinates within 2 cm) and/or
//     the same finalist identity are deduplicated; the best-ranked wins.
//   - Up to three credible, materially distinct candidates are returned.
//   - Fewer than three are returned when fewer credible candidates exist.
//   - Side/mixed/inset layouts appear ONLY when they deliver a whole-Level
//     improvement over the best practical candidate globally, and may displace
//     a weaker practical option (exception ordering before the shortlist fills).
//   - Every returned option carries P19/P20 from its own canonical evaluation
//     (valid=true with real Levels); no invented scores.
//   - P14 is a necessary constraint: candidates that failed the requested P14
//     operating point (requestedP14Pass === false) are excluded.
//
// Coordinates are RESOLVED cabinet centres (coordinateSpace: cabinet_centre)
// — the same shape Stage 2 produces. For sub2-12 (depth 0.255 m, width 0.5 m)
// in a 5×7 m room with WALL_BUFFER_M = 0.01:
//   Front wall centre Y = 0.01 + 0.1275 = 0.1375
//   Rear  wall centre Y = 7 − 0.01 − 0.1275 = 6.8625
//   Left  wall centre X = 0.01 + 0.25     = 0.26 (rot 0) / 0.1375 (rot 90)
//   Right wall centre X = 5 − 0.01 − 0.25  = 4.74 (rot 0) / 4.8625 (rot 90)
//
// Run: node --import ./test/_alias-register.mjs --test test/adi-shortlist-selection.test.mjs

import assert from 'node:assert/strict';
import { buildAdiShortlist } from '@/components/room/bass/bda/adiShortlistSelection';
import {
  isPracticalWallContactPlacement,
  isSideOrMixedWallFamily,
} from '@/components/room/bass/stage2/stage2PracticalPlacementPreference';

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

// Resolved cabinet centres for sub2-12 in a 5×7 room (WALL_BUFFER_M = 0.01).
const FRONT_Y = 0.1375;
const REAR_Y = 6.8625;
const LEFT_X_R0 = 0.26;      // corner / front-rear wall (rot 0)
const RIGHT_X_R0 = 4.74;
const LEFT_X_R90 = 0.1375;   // side wall (rot 90)
const RIGHT_X_R90 = 4.8625;

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

// --- wall-contact classification -----------------------------------------

// 1. A wall-mounted front pair IS practical.
{
  const result = makeResult({
    finalistId: 'two-C_FRONT_PAIR',
    familyId: 'C_FRONT_PAIR',
    quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
  });
  assert.equal(isPracticalWallContactPlacement(result, CONTEXT), true, 'front-wall pair is practical');
  console.log('  ✔ Front-wall pair classified practical by actual wall-contact');
}

// 2. An inset RP22_E (cabinet faces ~390 mm from the wall) is NOT practical.
//    This is the confirmed defect: RP22_E was displayed as practical despite
//    its front/rear cabinet faces being approximately 392.5 mm from the walls.
{
  // Centre Y = 0.1375 + 0.3925 = 0.53 → face at 0.53 − 0.1275 = 0.4025 m from wall.
  const insetY = 0.1375 + 0.3925;
  const result = makeResult({
    finalistId: 'four-RP22_E-inset',
    familyId: 'RP22_E',
    quantity: 4,
    coordinates: [
      { x: LEFT_X_R0, y: insetY },
      { x: RIGHT_X_R0, y: insetY },
      { x: LEFT_X_R0, y: 7 - insetY },
      { x: RIGHT_X_R0, y: 7 - insetY },
    ],
  });
  assert.equal(isPracticalWallContactPlacement(result, CONTEXT), false, 'inset RP22_E is NOT practical');
  assert.equal(isSideOrMixedWallFamily(result.familyId), false, 'RP22_E is not a side/mixed family by name');
  console.log('  ✔ Inset RP22_E rejected by wall-contact (family name alone does not qualify)');
}

// 3. A correctly wall-mounted RP22_E (faces at WALL_BUFFER_M) IS practical.
{
  const result = makeResult({
    finalistId: 'four-RP22_E-wall',
    familyId: 'RP22_E',
    quantity: 4,
    coordinates: [
      { x: LEFT_X_R0, y: FRONT_Y },
      { x: RIGHT_X_R0, y: FRONT_Y },
      { x: LEFT_X_R0, y: REAR_Y },
      { x: RIGHT_X_R0, y: REAR_Y },
    ],
  });
  assert.equal(isPracticalWallContactPlacement(result, CONTEXT), true, 'wall-mounted RP22_E is practical');
  console.log('  ✔ Wall-mounted RP22_E classified practical by actual wall-contact');
}

// 4. A side-wall arrangement (RP22_G) is NOT practical.
{
  const result = makeResult({
    finalistId: 'two-RP22_G',
    familyId: 'RP22_G',
    quantity: 2,
    coordinates: [{ x: LEFT_X_R90, y: 3.5 }, { x: RIGHT_X_R90, y: 3.5 }],
  });
  assert.equal(isPracticalWallContactPlacement(result, CONTEXT), false, 'side-wall midpoints NOT practical');
  console.log('  ✔ Side-wall midpoints rejected by wall-contact');
}

// --- shortlist integration -----------------------------------------------

// 5. Global pooling: a 4-sub candidate that outranks a 2-sub candidate
//    appears first in the shortlist, irrespective of quantity order.
{
  const twoSub = makeResult({
    finalistId: 'two-C_FRONT_PAIR',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const fourSub = makeResult({
    finalistId: 'four-RP22_E-wall',
    familyId: 'RP22_E', quantity: 4,
    coordinates: [{ x: LEFT_X_R0, y: FRONT_Y }, { x: RIGHT_X_R0, y: FRONT_Y }, { x: LEFT_X_R0, y: REAR_Y }, { x: RIGHT_X_R0, y: REAR_Y }],
    p19Level: 4, p20PrimaryLevel: 4,
  });
  const oneSub = makeResult({
    finalistId: 'one-FRONT_MID',
    familyId: 'ONE_FRONT_MID', quantity: 1,
    coordinates: [{ x: 2.5, y: FRONT_Y }],
    p19Level: 1, p20PrimaryLevel: 1,
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-1',
    one_sub_result: makeBucket([oneSub]),
    two_sub_result: makeBucket([twoSub]),
    four_sub_result: makeBucket([fourSub]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 3, 'three distinct candidates pooled globally');
  assert.equal(shortlist[0].quantity, 4, '4-sub (best-ranked) is first globally');
  assert.equal(shortlist[0].finalistId, 'four-RP22_E-wall');
  assert.equal(shortlist[1].quantity, 2, '2-sub is second');
  assert.equal(shortlist[2].quantity, 1, '1-sub is third');
  assert.ok(shortlist.every((o) => o.valid === true), 'every option has valid canonical evidence');
  assert.ok(shortlist.every((o) => o.p19 && o.p19.level != null), 'P19 carried from canonical evaluation');
  console.log('  ✔ Global pooling ranks across quantities, best-first');
}

// 6. Material-equivalence dedup: two 2-sub candidates with the same
//    coordinates (within 2 cm) AND the same acoustic outcome collapse to one —
//    the best-ranked instance. Same geometry necessarily produces the same
//    Levels, so both candidates share P19/P20 outcomes here.
{
  const a = makeResult({
    finalistId: 'two-A',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.740, y: FRONT_Y }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const b = makeResult({
    finalistId: 'two-B',
    familyId: 'FRONT_THIRD_PAIR', quantity: 2,
    coordinates: [{ x: 1.255, y: FRONT_Y }, { x: 3.745, y: FRONT_Y }], // 5 mm from A
    p19Level: 3, p20PrimaryLevel: 3, // same acoustic outcome as A
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-2',
    one_sub_result: null,
    two_sub_result: makeBucket([a, b]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'materially equivalent geometry + outcome deduped to one');
  assert.equal(shortlist[0].finalistId, 'two-A', 'best-ranked equivalent wins');
  console.log('  ✔ Materially equivalent geometry + outcome deduplicated (best-ranked wins)');
}

// 6b. Documented defect: two 4-sub front/rear arrangements 86 mm apart with
//     identical P19/P20 Levels and variation (RP22_C vs FOUR_THIRD_PAIRS)
//     collapse into ONE practical card — they are not meaningfully different
//     design choices. The better-ranked arrangement survives.
{
  // Front/rear X coordinates 1.677 / 2.623 (RP22_C-like) vs 1.763 / 2.537
  // (FOUR_THIRD_PAIRS-like): 86 mm apart. Same Y at the walls.
  const rp22c = makeResult({
    finalistId: 'four-RP22_C',
    familyId: 'RP22_C', quantity: 4,
    coordinates: [
      { x: 1.677, y: FRONT_Y }, { x: 2.623, y: FRONT_Y },
      { x: 1.677, y: REAR_Y }, { x: 2.623, y: REAR_Y },
    ],
    p19Level: 4, p19Variation: 2.0,
    p20PrimaryLevel: 1, p20PrimaryVariation: 6.0,
    p20SecondaryLevel: 1, p20SecondaryVariation: 15.0,
  });
  const thirdPairs = makeResult({
    finalistId: 'four-FOUR_THIRD_PAIRS',
    familyId: 'FOUR_THIRD_PAIRS', quantity: 4,
    coordinates: [
      { x: 1.763, y: FRONT_Y }, { x: 2.537, y: FRONT_Y },
      { x: 1.763, y: REAR_Y }, { x: 2.537, y: REAR_Y },
    ],
    p19Level: 4, p19Variation: 2.0,
    p20PrimaryLevel: 1, p20PrimaryVariation: 6.0,
    p20SecondaryLevel: 1, p20SecondaryVariation: 15.0,
  });
  // RP22_C ranks better (first in the pool). Both are practical wall-contact.
  const stage2State = {
    status: 'complete', fingerprint: 'fp-86mm',
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: makeBucket([rp22c, thirdPairs]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'two near-identical 4-sub arrangements collapse to one card');
  assert.equal(shortlist[0].finalistId, 'four-RP22_C', 'better-ranked arrangement survives');
  assert.equal(shortlist[0].placementKind, 'practical', 'surviving card is practical');
  console.log('  ✔ Documented 86 mm-apart duplicate collapses (better-ranked survives)');
}

// 6c. Clearly different front/rear layouts remain distinct even when their
//     RP22 Levels match. Front subs at x=1.25 vs x=2.0 are 750 mm apart — well
//     outside the material placement tolerance — so both are retained.
{
  const narrow = makeResult({
    finalistId: 'four-narrow',
    familyId: 'RP22_C', quantity: 4,
    coordinates: [
      { x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y },
      { x: 1.25, y: REAR_Y }, { x: 3.75, y: REAR_Y },
    ],
    p19Level: 4, p20PrimaryLevel: 1, p20SecondaryLevel: 1,
  });
  const wide = makeResult({
    finalistId: 'four-wide',
    familyId: 'FOUR_THIRD_PAIRS', quantity: 4,
    coordinates: [
      { x: 2.0, y: FRONT_Y }, { x: 3.0, y: FRONT_Y },
      { x: 2.0, y: REAR_Y }, { x: 3.0, y: REAR_Y },
    ],
    p19Level: 4, p20PrimaryLevel: 1, p20SecondaryLevel: 1, // identical Levels
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-distinct',
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: makeBucket([narrow, wide]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 2, 'genuinely different layouts retained despite matching Levels');
  console.log('  ✔ Clearly different front/rear layouts remain distinct');
}

// 6d. Materially different seat-to-seat response evidence is not suppressed
//     merely because displayed Levels match. Same Levels, same geometry
//     within tolerance, but worst-seat variation differs by > tolerance →
//     both retained.
{
  const lowVar = makeResult({
    finalistId: 'four-low-var',
    familyId: 'RP22_C', quantity: 4,
    coordinates: [
      { x: 1.677, y: FRONT_Y }, { x: 2.623, y: FRONT_Y },
      { x: 1.677, y: REAR_Y }, { x: 2.623, y: REAR_Y },
    ],
    p19Level: 4, p20PrimaryLevel: 1, p20PrimaryVariation: 6.0,
    p20SecondaryLevel: 1, p20SecondaryVariation: 15.0,
  });
  const highVar = makeResult({
    finalistId: 'four-high-var',
    familyId: 'FOUR_THIRD_PAIRS', quantity: 4,
    coordinates: [
      { x: 1.70, y: FRONT_Y }, { x: 2.60, y: FRONT_Y }, // within 150 mm of lowVar
      { x: 1.70, y: REAR_Y }, { x: 2.60, y: REAR_Y },
    ],
    p19Level: 4, p20PrimaryLevel: 1, p20PrimaryVariation: 9.0, // +3 dB — materially different
    p20SecondaryLevel: 1, p20SecondaryVariation: 15.0,
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-var',
    one_sub_result: null,
    two_sub_result: null,
    four_sub_result: makeBucket([lowVar, highVar]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 2, 'materially different seat-to-seat evidence retained');
  console.log('  ✔ Different seat-to-seat evidence not suppressed by matching Levels');
}

// 6e. Different subwoofer quantities are never collapsed solely because their
//     RP22 outcomes match. A 2-sub and a 4-sub with identical Levels both stay.
{
  const twoSub = makeResult({
    finalistId: 'two-same',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    p19Level: 4, p20PrimaryLevel: 1, p20SecondaryLevel: 1,
  });
  const fourSub = makeResult({
    finalistId: 'four-same',
    familyId: 'RP22_C', quantity: 4,
    coordinates: [
      { x: 1.677, y: FRONT_Y }, { x: 2.623, y: FRONT_Y },
      { x: 1.677, y: REAR_Y }, { x: 2.623, y: REAR_Y },
    ],
    p19Level: 4, p20PrimaryLevel: 1, p20SecondaryLevel: 1, // identical Levels
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-qty',
    one_sub_result: null,
    two_sub_result: makeBucket([twoSub]),
    four_sub_result: makeBucket([fourSub]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 2, 'different quantities retained despite matching outcomes');
  console.log('  ✔ Different quantities not collapsed by matching RP22 outcomes');
}

// 6f. Two near-identical arrangements with DIFFERENT acoustic outcomes are
//     NOT collapsed — a Level difference means they are materially different
//     design choices. (Same geometry with different Levels cannot occur in
//     the real engine, but the guard is asserted explicitly.)
{
  const a = makeResult({
    finalistId: 'two-better',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.740, y: FRONT_Y }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const b = makeResult({
    finalistId: 'two-worse',
    familyId: 'FRONT_THIRD_PAIR', quantity: 2,
    coordinates: [{ x: 1.255, y: FRONT_Y }, { x: 3.745, y: FRONT_Y }], // 5 mm from A
    p19Level: 2, p20PrimaryLevel: 2, // different acoustic outcome
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-outcome',
    one_sub_result: null,
    two_sub_result: makeBucket([a, b]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 2, 'different acoustic outcomes not collapsed');
  console.log('  ✔ Different acoustic outcomes retained (not collapsed by geometry)');
}

// 7. Fewer than three: only one quantity has an eligible candidate.
{
  const twoSub = makeResult({
    finalistId: 'two-only',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-3',
    one_sub_result: null,
    two_sub_result: makeBucket([twoSub]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'fewer than three returned when only one exists');
  console.log('  ✔ Fewer than three eligible → fewer than three returned');
}

// 8. P14 exclusion: a candidate that failed the requested P14 operating point
//    is excluded — P14 is a necessary constraint.
{
  const p14Fail = makeResult({
    finalistId: 'p14-fail',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    requestedP14Pass: false, p19Level: null, p19Variation: null,
  });
  const good = makeResult({
    finalistId: 'good',
    familyId: 'RP22_E', quantity: 4,
    coordinates: [{ x: LEFT_X_R0, y: FRONT_Y }, { x: RIGHT_X_R0, y: FRONT_Y }, { x: LEFT_X_R0, y: REAR_Y }, { x: RIGHT_X_R0, y: REAR_Y }],
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-4',
    one_sub_result: null,
    two_sub_result: makeBucket([p14Fail]),
    four_sub_result: makeBucket([good]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'P14-failed candidate excluded');
  assert.equal(shortlist[0].finalistId, 'good', 'only the P14-passing candidate remains');
  console.log('  ✔ P14 operating-point failure excludes the candidate');
}

// 9. Side-wall exception: a side/mixed candidate is added ONLY when it delivers
//    a whole-Level improvement over the best practical candidate globally.
{
  const practical = makeResult({
    finalistId: 'prac-2sub',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const sideImproved = makeResult({
    finalistId: 'side-RP22_D',
    familyId: 'RP22_D', quantity: 4,
    coordinates: [{ x: LEFT_X_R90, y: 1.75 }, { x: RIGHT_X_R90, y: 1.75 }, { x: LEFT_X_R90, y: 5.25 }, { x: RIGHT_X_R90, y: 5.25 }],
    p19Level: 2, p20PrimaryLevel: 3,
  });
  const sideSame = makeResult({
    finalistId: 'side-RP22_G',
    familyId: 'RP22_G', quantity: 2,
    coordinates: [{ x: LEFT_X_R90, y: 3.5 }, { x: RIGHT_X_R90, y: 3.5 }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-5',
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

// 10. Exception ordering: a qualifying side-wall candidate may displace a
//     weaker practical option even when three practical options would fill the
//     shortlist. The side-wall candidate ranks higher globally (better Levels)
//     and qualifies, so it enters and the weakest practical is pushed out.
{
  const p1 = makeResult({
    finalistId: 'prac-1',
    familyId: 'ONE_FRONT_MID', quantity: 1,
    coordinates: [{ x: 2.5, y: FRONT_Y }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const p2 = makeResult({
    finalistId: 'prac-2',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const p3 = makeResult({
    finalistId: 'prac-4',
    familyId: 'RP22_E', quantity: 4,
    coordinates: [{ x: LEFT_X_R0, y: FRONT_Y }, { x: RIGHT_X_R0, y: FRONT_Y }, { x: LEFT_X_R0, y: REAR_Y }, { x: RIGHT_X_R0, y: REAR_Y }],
    p19Level: 1, p20PrimaryLevel: 1,
  });
  const sideBetter = makeResult({
    finalistId: 'side-better',
    familyId: 'RP22_D', quantity: 4,
    coordinates: [{ x: LEFT_X_R90, y: 1.75 }, { x: RIGHT_X_R90, y: 1.75 }, { x: LEFT_X_R90, y: 5.25 }, { x: RIGHT_X_R90, y: 5.25 }],
    p19Level: 4, p20PrimaryLevel: 4, // whole-Level improvement over ALL practicals
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-6',
    one_sub_result: makeBucket([p1]),
    two_sub_result: makeBucket([p2]),
    four_sub_result: makeBucket([p3, sideBetter]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 3, 'three cards total');
  assert.ok(shortlist.some((o) => o.finalistId === 'side-better'), 'qualifying side-wall entered the shortlist');
  assert.ok(shortlist.some((o) => o.finalistId === 'side-better' && o.placementKind === 'alternative'), 'tagged alternative');
  assert.ok(!shortlist.some((o) => o.finalistId === 'prac-4'), 'weakest practical displaced by qualifying side-wall');
  console.log('  ✔ Exception ordering: qualifying side-wall displaces weaker practical');
}

// 11. No qualifying side-wall: when three practical options exist and the
//     side-wall does NOT deliver a whole-Level improvement, it stays excluded.
{
  const p1 = makeResult({
    finalistId: 'prac-1',
    familyId: 'ONE_FRONT_MID', quantity: 1,
    coordinates: [{ x: 2.5, y: FRONT_Y }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const p2 = makeResult({
    finalistId: 'prac-2',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    p19Level: 2, p20PrimaryLevel: 2,
  });
  const p3 = makeResult({
    finalistId: 'prac-4',
    familyId: 'RP22_E', quantity: 4,
    coordinates: [{ x: LEFT_X_R0, y: FRONT_Y }, { x: RIGHT_X_R0, y: FRONT_Y }, { x: LEFT_X_R0, y: REAR_Y }, { x: RIGHT_X_R0, y: REAR_Y }],
    p19Level: 1, p20PrimaryLevel: 1,
  });
  const sideMarginal = makeResult({
    finalistId: 'side-marginal',
    familyId: 'RP22_D', quantity: 4,
    coordinates: [{ x: LEFT_X_R90, y: 1.75 }, { x: RIGHT_X_R90, y: 1.75 }, { x: LEFT_X_R90, y: 5.25 }, { x: RIGHT_X_R90, y: 5.25 }],
    p19Level: 1, p20PrimaryLevel: 1, // same as best practical → no whole-Level improvement
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-7',
    one_sub_result: makeBucket([p1]),
    two_sub_result: makeBucket([p2]),
    four_sub_result: makeBucket([p3, sideMarginal]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 3, 'three practical options fill the shortlist');
  assert.ok(shortlist.every((o) => o.placementKind === 'practical'), 'no side-wall when it does not qualify');
  console.log('  ✔ Marginal side-wall stays excluded (no whole-Level improvement)');
}

// 12. No current evaluation → empty shortlist.
{
  const shortlist = buildAdiShortlist({ status: 'updating', fingerprint: 'fp' }, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 0, 'updating state yields no options');
  const empty = buildAdiShortlist({ status: 'complete', fingerprint: 'fp' }, SEAT_PRIORITY, CONTEXT);
  assert.equal(empty.length, 0, 'complete with no buckets yields no options');
  console.log('  ✔ No current evaluation → empty shortlist');
}

// 13. Fingerprint stamping: every option carries the Stage 2 run fingerprint.
{
  const r = makeResult({
    finalistId: 'fp-test',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
  });
  const stage2State = {
    status: 'complete', fingerprint: 'run-fp-123',
    one_sub_result: null,
    two_sub_result: makeBucket([r]),
    four_sub_result: null,
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist[0].fingerprint, 'run-fp-123', 'option stamped with run fingerprint');
  console.log('  ✔ Every option carries the Stage 2 run fingerprint');
}

// 14. Inset RP22_E is NOT shown as practical even when it is the only 4-sub
//     candidate. It may appear as an alternative only if it qualifies; when it
//     does not, the shortlist shows fewer than three rather than padding with
//     the inset arrangement.
{
  const practical2 = makeResult({
    finalistId: 'prac-2sub',
    familyId: 'C_FRONT_PAIR', quantity: 2,
    coordinates: [{ x: 1.25, y: FRONT_Y }, { x: 3.75, y: FRONT_Y }],
    p19Level: 3, p20PrimaryLevel: 3,
  });
  const inset4 = makeResult({
    finalistId: 'four-RP22_E-inset',
    familyId: 'RP22_E', quantity: 4,
    coordinates: [
      { x: LEFT_X_R0, y: 0.53 },
      { x: RIGHT_X_R0, y: 0.53 },
      { x: LEFT_X_R0, y: 6.47 },
      { x: RIGHT_X_R0, y: 6.47 },
    ],
    p19Level: 2, p20PrimaryLevel: 2, // no whole-Level improvement over practical2
  });
  const stage2State = {
    status: 'complete', fingerprint: 'fp-8',
    one_sub_result: null,
    two_sub_result: makeBucket([practical2]),
    four_sub_result: makeBucket([inset4]),
  };
  const shortlist = buildAdiShortlist(stage2State, SEAT_PRIORITY, CONTEXT);
  assert.equal(shortlist.length, 1, 'inset RP22_E not shown as practical or alternative');
  assert.equal(shortlist[0].finalistId, 'prac-2sub', 'only the wall-contact practical shown');
  console.log('  ✔ Inset RP22_E excluded — shortlist not padded with inset arrangement');
}

console.log('\nadi-shortlist-selection: all checks passed');