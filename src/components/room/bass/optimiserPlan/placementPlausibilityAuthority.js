// placementPlausibilityAuthority.js
// ---------------------------------------------------------------------------
// The HARD plausibility filter every ADI placement recommendation passes before
// it is shown, badged or applied.
//
// Product rules this exists to satisfy:
//   • Quantity-aware wording: one front subwoofer is never called "front subs".
//     One → "the front subwoofer", two or more → "the front subwoofers".
//   • Symmetry protection: a front/rear pair is never told to move one end only,
//     and a matched pair on one wall is never split.
//   • Minimum improvement: under 3 dB nothing is recommended (at most it is
//     stated as a minor option to review); 3–5 dB is offered only when symmetry
//     holds and no other metric is harmed; over 5 dB may be offered when the move
//     is physically plausible and every measured metric is protected.
//   • Multi-metric protection: a P20 gain alone never carries a recommendation
//     that damages P19, output/headroom or low-frequency extension, or that
//     pushes a seat backwards while the improvement is not a strong one.
//   • Apply is offered only for a meaningful, symmetric, unambiguous move whose
//     other metrics are protected.
//
// Outcomes (three, exactly):
//   APPROVED    meaningful, symmetric, unambiguous, metrics protected → may be
//               recommended, badged and applied
//   REVIEW      a small (< 3 dB) or not-unambiguous improvement → stated as a
//               minor option to review, never badged, never applyable
//   SUPPRESSED  symmetry-breaking, metric-damaging, implausible or unmeasured →
//               not shown as a recommendation at all, never applyable
//
// PURE and READ-ONLY: it reads evaluated evidence and decides whether that
// evidence may be offered. It evaluates nothing, recalculates nothing, and
// changes no bass maths, no optimiser scoring, no P19/P20 definition and no
// RP22 grading.
// ---------------------------------------------------------------------------

import { deltaText } from "./optimiserWholeNumberDb.js";

export const PLACEMENT_CREDIBILITY = Object.freeze({
  APPROVED: "approved",
  REVIEW: "review",
  SUPPRESSED: "suppressed",
});

/** Stated on a weak option that the designer may look at, but never apply. */
export const PLACEMENT_REVIEW_STATUS = "Minor option to review";

/** Stated instead of "Recommended" on a change this gate refuses to offer. */
export const PLACEMENT_BLOCKED_STATUS = "Not recommended";

/** Below this, no placement change is recommended. */
export const PLACEMENT_IMPROVEMENT_THRESHOLD_DB = 3;

/** At or above this, a movement may rebalance seats as well as improve P20. */
export const PLACEMENT_STRONG_IMPROVEMENT_DB = 5;

/** A change smaller than this is not a meaningful change (the card's own 1 dB). */
export const PLACEMENT_MATERIAL_DB = 1;

/** Low-frequency extension counts as harmed only beyond this. */
export const PLACEMENT_EXTENSION_TOLERANCE_HZ = 1;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * The ACTIVE subwoofer census of the current layout: how many subwoofers are
 * mounted on the front wall and on the rear wall. A disabled subwoofer is not
 * part of the layout that moves.
 *
 * @param {Array} instances - the layout's subwoofer instances
 * @param {object|null} [roomDims] - { lengthM }: with no stamped wall group, the
 *   wall a subwoofer stands on is read from which half of the room it sits in.
 */
export function subwooferGroupCounts(instances = [], roomDims = null) {
  const rows = Array.isArray(instances) ? instances : [];
  const lengthM = num(roomDims?.lengthM);
  const counts = { front: 0, rear: 0, total: 0, known: false };
  for (const instance of rows) {
    if (!instance || instance.enabled === false) continue;
    counts.total += 1;
    let group = instance.legacyGroup;
    if (group !== "front" && group !== "rear" && lengthM != null) {
      const y = num(instance.position?.y);
      if (y != null) group = y < lengthM / 2 ? "front" : "rear";
    }
    if (group === "front") counts.front += 1;
    else if (group === "rear") counts.rear += 1;
  }
  counts.known = counts.total > 0;
  return counts;
}

/**
 * How a wall group is named, from the layout's own census.
 *
 * One front subwoofer is "the front subwoofer" — never "front subs". Two or more
 * are "the front subwoofers". With no census to read, the neutral plural is kept
 * rather than a quantity being invented.
 */
export function subwooferGroupNoun(group, counts = null) {
  if (group !== "front" && group !== "rear") return "the subwoofers";
  const legacy = group === "front" ? "the front subs" : "the rear subs";
  if (!counts || counts.known !== true) return legacy;
  const count = num(group === "front" ? counts.front : counts.rear);
  if (count == null || count <= 0) return legacy;
  if (count === 1) return group === "front" ? "the front subwoofer" : "the rear subwoofer";
  return group === "front" ? "the front subwoofers" : "the rear subwoofers";
}

const groupCount = (counts, group) => {
  if (!counts || counts.known !== true) return null;
  return num(group === "front" ? counts.front : counts.rear);
};

/** "a, b and c" — the factual reasons, as one clause. */
function joinReasons(reasons) {
  if (!reasons.length) return "";
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
}

/**
 * Does the evaluated move keep the layout's symmetry?
 *
 * Two rules only — both stated in physical terms:
 *   1. A matched pair on one wall is never split: moving one of two (or three of
 *      four) subwoofers of the same wall breaks that pair.
 *   2. A front/rear layout keeps its front/rear alignment: one end alone is never
 *      moved, whichever end it is.
 * With no census available, no symmetry claim is made in either direction.
 */
function assessSymmetry({ move = null, layoutCounts = null } = {}) {
  if (!move) return { ok: true, code: null, note: null };
  const moved = move.movesByGroup || {};
  const movedFront = num(moved.front) || 0;
  const movedRear = num(moved.rear) || 0;
  const frontCount = groupCount(layoutCounts, "front");
  const rearCount = groupCount(layoutCounts, "rear");

  for (const group of ["front", "rear"]) {
    const inGroup = group === "front" ? frontCount : rearCount;
    const movedInGroup = group === "front" ? movedFront : movedRear;
    if (inGroup != null && inGroup >= 2 && movedInGroup > 0 && movedInGroup < inGroup) {
      return {
        ok: false,
        code: "matched_pair_split",
        note: `${subwooferGroupNoun(group, layoutCounts)} would no longer be positioned as a matched pair`,
      };
    }
  }

  const hasFront = frontCount != null && frontCount > 0;
  const hasRear = rearCount != null && rearCount > 0;
  if (hasFront && hasRear && (movedFront > 0) !== (movedRear > 0)) {
    const movedWall = movedFront > 0 ? "front" : "rear";
    return {
      ok: false,
      code: "front_rear_alignment",
      note: `moving only ${subwooferGroupNoun(movedWall, layoutCounts)} would alter the symmetry of the current front/rear subwoofer layout`,
    };
  }

  return { ok: true, code: null, note: null };
}

/** Every seat whose own P20 deviation the move would make worse by 1 dB or more. */
function seatRegressions({ seats = null, baselineSeats = null } = {}) {
  const after = Array.isArray(seats) ? seats : [];
  const before = Array.isArray(baselineSeats) ? baselineSeats : [];
  if (!after.length || !before.length) return [];
  const previous = new Map(
    before.filter((row) => row?.seatId).map((row) => [row.seatId, row]),
  );
  const rows = [];
  for (const row of after) {
    const earlier = previous.get(row?.seatId);
    if (!earlier) continue;
    const afterDb = num(row.p20VariationDb);
    const beforeDb = num(earlier.p20VariationDb);
    if (afterDb == null || beforeDb == null) continue;
    if (afterDb - beforeDb >= PLACEMENT_MATERIAL_DB) {
      rows.push({ seatId: row.seatId, deltaDb: afterDb - beforeDb });
    }
  }
  return rows;
}

/**
 * Which metrics the evaluated move would make worse. Only measured harm is
 * reported: a metric this evaluation did not measure is never presented as
 * either protected or damaged.
 */
function assessDamage({ effect = null, baseline = null, seats = null, baselineSeats = null, improvementDb = null } = {}) {
  const damages = [];

  const p19Delta = num(effect?.p19DeltaDb);
  if (p19Delta != null && p19Delta >= PLACEMENT_MATERIAL_DB) {
    damages.push({
      label: "P19 consistency",
      deltaDb: p19Delta,
      note: `P19 consistency would be made worse by ${deltaText(p19Delta) || "a measurable amount"}`,
    });
  }

  const headroomDelta = num(effect?.outputDeltaDb) ?? num(effect?.p14DeltaDb);
  if (headroomDelta != null && headroomDelta <= -PLACEMENT_MATERIAL_DB) {
    damages.push({
      label: "Output / headroom",
      deltaDb: headroomDelta,
      note: `available output headroom would be reduced by ${deltaText(Math.abs(headroomDelta)) || "a measurable amount"}`,
    });
  }

  const beforeHz = num(baseline?.achievedP18Hz);
  const afterHz = num(effect?.achievedP18Hz);
  const lostHz = beforeHz != null && afterHz != null ? afterHz - beforeHz : null;
  if (lostHz != null && lostHz > PLACEMENT_EXTENSION_TOLERANCE_HZ) {
    damages.push({
      label: "Extension",
      deltaHz: Math.round(lostHz),
      note: `low-frequency extension would be reduced by ${Math.round(lostHz)} Hz`,
    });
  }

  // Seat-level protection. A move that is not a strong improvement must not push
  // any seat backwards to buy the gain.
  const regressed = seatRegressions({ seats, baselineSeats });
  if (regressed.length > 0 && (improvementDb == null || improvementDb < PLACEMENT_STRONG_IMPROVEMENT_DB)) {
    const worst = regressed.reduce((max, row) => (row.deltaDb > max.deltaDb ? row : max), regressed[0]);
    damages.push({
      label: "Seat results",
      seatCount: regressed.length,
      deltaDb: worst.deltaDb,
      note: `${regressed.length === 1 ? "one seat" : `${regressed.length} seats`} would be made worse (by ${deltaText(worst.deltaDb) || "a measurable amount"})`,
    });
  }

  return damages;
}

/**
 * Decide whether an evaluated placement change may be recommended at all.
 *
 * @param {object} params
 * @param {object|null} [params.effect] - the lever's own evaluated effect
 *   ({ p20DeltaDb, p19DeltaDb, p14DeltaDb, outputDeltaDb, achievedP18Hz })
 * @param {object|null} [params.baseline] - the run's baseline summary
 * @param {object|null} [params.move] - describePlacementMove() result
 * @param {object|null} [params.layoutCounts] - subwooferGroupCounts() of the layout
 * @param {Array|null} [params.seats] - per-seat evidence after the move, when kept
 * @param {Array|null} [params.baselineSeats] - per-seat evidence before the move
 * @returns {object} the credibility decision, its factual reasons and its copy
 */
export function assessPlacementPlausibility({
  effect = null,
  baseline = null,
  move = null,
  layoutCounts = null,
  seats = null,
  baselineSeats = null,
} = {}) {
  const p20Delta = num(effect?.p20DeltaDb);
  const p19Delta = num(effect?.p19DeltaDb);
  const improvementDb = p20Delta != null ? -p20Delta : (p19Delta != null ? -p19Delta : null);
  const improvementText = improvementDb != null && improvementDb > 0 ? deltaText(improvementDb) : null;

  const plausible = move ? move.practical !== false : true;
  const unambiguous = move ? move.unambiguous !== false : true;
  const symmetry = assessSymmetry({ move, layoutCounts });
  const damages = assessDamage({ effect, baseline, seats, baselineSeats, improvementDb });

  const base = {
    improvementDb,
    improvementText,
    plausible,
    unambiguous,
    symmetryOk: symmetry.ok,
    symmetryBreach: symmetry.ok ? null : symmetry.code,
    damages,
    metricsProtected: damages.length === 0,
    applyAllowed: false,
    status: null,
    suitabilityNote: null,
    reviewSummary: null,
    reasons: [],
  };

  // No measured improvement: nothing is recommended, badged or applied.
  if (improvementDb == null || improvementDb < PLACEMENT_MATERIAL_DB) {
    return {
      ...base,
      credibility: PLACEMENT_CREDIBILITY.SUPPRESSED,
      suitabilityNote: "Not recommended — the evaluation measured no useful improvement in seat-to-seat bass consistency.",
      reasons: ["no measured improvement in seat-to-seat bass consistency"],
    };
  }

  const reasons = [];
  if (!plausible) reasons.push("the evaluated movement is not a practical, wall-based placement change");
  if (!symmetry.ok && symmetry.note) reasons.push(symmetry.note);
  damages.forEach((damage) => reasons.push(damage.note));

  if (reasons.length > 0) {
    return {
      ...base,
      credibility: PLACEMENT_CREDIBILITY.SUPPRESSED,
      suitabilityNote: `Not recommended — ${joinReasons(reasons)}.`,
      reasons,
    };
  }

  // A small improvement, or a movement that is not a single unambiguous one, is
  // stated as a minor option to review — never recommended, never applyable.
  if (improvementDb < PLACEMENT_IMPROVEMENT_THRESHOLD_DB || !unambiguous) {
    const reason = !unambiguous
      ? "the evaluated movement is not a single, unambiguous direction, so it is not offered as an automatic placement change"
      : `it is below the ${PLACEMENT_IMPROVEMENT_THRESHOLD_DB} dB threshold for an automatic placement change`;
    return {
      ...base,
      credibility: PLACEMENT_CREDIBILITY.REVIEW,
      status: PLACEMENT_REVIEW_STATUS,
      suitabilityNote: `Minor option to review — ${reason}.`,
      reviewSummary: !unambiguous
        ? `ADI found a possible improvement of ${improvementText} in seat-to-seat bass consistency, but the evaluated movement is not a single, unambiguous direction. It is not offered as an automatic placement change.`
        : `ADI found a small possible improvement of ${improvementText} in seat-to-seat bass consistency. It is below the ${PLACEMENT_IMPROVEMENT_THRESHOLD_DB} dB threshold for an automatic placement change.`,
      reasons: [reason],
    };
  }

  return {
    ...base,
    credibility: PLACEMENT_CREDIBILITY.APPROVED,
    applyAllowed: true,
    reasons: [],
  };
}