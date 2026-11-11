// evaluatedOptionPresentation.js
// ---------------------------------------------------------------------------
// Pure presentation helpers that map a Stage 2 canonical finalist result into
// the compact option shape the Subwoofer Design Starting Layout cards render.
//
// READ-ONLY: reads a Stage 2 result and the design context (room, seat
// priorities, model, height). It evaluates nothing, recalculates nothing and
// changes no bass maths, no RP22 scoring and no Apply authority. The option it
// returns is a reformatted view of evidence the Stage 2 canonical evaluation
// already produced.
//
// P19/P20 are stated ONLY when the Stage 2 result genuinely carries them —
// `requestedP14Pass !== false`, no physical rejection, no terminal outcome —
// so a Stage 1 proxy, an invented curve or a failed operating point is never
// shown as a predicted RP22 result. When the evidence is not valid the field
// is null and the card renders "—".
//
// Each quantity surfaces ONE practical front/rear-wall option (the normal
// recommendation) plus zero or more exceptional side/mixed-wall ALTERNATIVES
// that deliver an actual whole-Level improvement. The practical option is
// always visible; alternatives are labelled `placementKind: "alternative"` and
// carry an `improvement` summary describing the specific RP22 Level gain.
// ---------------------------------------------------------------------------

import { normaliseModelKey } from "@/components/models/speakers/registry";
import { resultEvidenceIsValid } from "../stage2/stage2CandidateEligibility.js";
import {
  selectQualifyingAlternatives,
  isSideOrMixedWallFamily,
} from "../stage2/stage2PracticalPlacementPreference.js";

const ROTATION_FRONT = 0;
const ROTATION_REAR = 180;

/**
 * Derive a wall placement ("front" | "rear") from a cabinet centre coordinate
 * and the room length. Front/rear-wall arrangements are the only placements
 * surfaced by the recommendation workflow, so this is a deterministic read of
 * which end of the room the cabinet sits at.
 */
export function wallPlacementForCoordinate(coord, roomDims) {
  const y = Number(coord?.y);
  const length = Number(roomDims?.lengthM);
  if (!Number.isFinite(y) || !Number.isFinite(length) || length <= 0) return "front";
  return y < length / 2 ? "front" : "rear";
}

/**
 * Representative cabinet rotation for a coordinate, derived from its wall.
 * Front wall → 0°, rear wall → 180°. Matches the evaluation orientation for
 * the front/rear-wall families the recommendation surfaces.
 */
export function orientationForCoordinate(coord, roomDims) {
  return wallPlacementForCoordinate(coord, roomDims) === "rear" ? ROTATION_REAR : ROTATION_FRONT;
}

/**
 * Split a candidate's coordinates into front and rear groups, by wall.
 * Used by the quantity-aware Apply authority to stamp legacyGroup on new
 * instances.
 */
export function splitCoordinatesByWall(coordinates, roomDims) {
  const front = [];
  const rear = [];
  for (const coord of (Array.isArray(coordinates) ? coordinates : [])) {
    if (wallPlacementForCoordinate(coord, roomDims) === "rear") rear.push(coord);
    else front.push(coord);
  }
  return { front, rear };
}

/**
 * Worst P20 seat summary for a priority group, from a Stage 2 result's
 * perSeatP20 rows and the seat-priority map. Returns the lowest level and the
 * widest raw variation across the group, or null when the group has no seats.
 */
function worstP20ForPriority(perSeatP20, seatPriorityMap, priority) {
  const rows = (Array.isArray(perSeatP20) ? perSeatP20 : []).filter((row) => {
    const id = String(row?.seatId || "");
    return seatPriorityMap.get(id) === priority;
  });
  if (rows.length === 0) return null;
  let level = Infinity;
  let variation = -Infinity;
  for (const row of rows) {
    const lvl = Number(row?.level);
    if (Number.isFinite(lvl)) level = Math.min(level, lvl);
    const variationDb = Number(row?.variationDbRaw);
    if (Number.isFinite(variationDb)) variation = Math.max(variation, Math.abs(variationDb));
  }
  return {
    level: Number.isFinite(level) ? level : null,
    variationDb: Number.isFinite(variation) ? variation : null,
  };
}

// Re-export the single evidence-validity authority so the display path and
// the Stage 2 eligibility path share one definition.
export { resultEvidenceIsValid };

/**
 * Build the compact evaluated-option shape for a Stage 2 best-finalist result.
 *
 * @param {object} result — Stage 2 canonical finalist result (bestFinalist)
 * @param {Map} seatPriorityMap — seatId → "primary" | "secondary"
 * @param {object} context — { roomDims, selectedSubModel, subwooferBottomHeightM, placementKind }
 * @returns {object|null} option shape, or null when the result is not a real
 *   evaluated candidate (no coordinates, no quantity)
 */
export function buildEvaluatedOption(result, seatPriorityMap, context) {
  if (!result || !Array.isArray(result.coordinates) || result.coordinates.length === 0) return null;
  const quantity = Number(result.quantity);
  if (![1, 2, 4].includes(quantity)) return null;
  const roomDims = context?.roomDims || null;

  const coordinates = result.coordinates.map((coord) => ({
    x: Number(coord?.x),
    y: Number(coord?.y),
    placement: wallPlacementForCoordinate(coord, roomDims),
  }));
  if (coordinates.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) return null;

  const valid = resultEvidenceIsValid(result);

  const p19 = valid
    ? {
        level: Number.isFinite(Number(result.achievedP19Level)) ? Number(result.achievedP19Level) : null,
        variationDb: Number.isFinite(Number(result.achievedP19VariationDb)) ? Number(result.achievedP19VariationDb) : null,
      }
    : null;

  const p20Primary = valid
    ? worstP20ForPriority(result.perSeatP20, seatPriorityMap, "primary")
    : null;
  const p20Secondary = valid
    ? worstP20ForPriority(result.perSeatP20, seatPriorityMap, "secondary")
    : null;

  const model = normaliseModelKey(result.selectedProduct || context?.selectedSubModel) || null;
  const bottomHeightM = Number.isFinite(Number(context?.subwooferBottomHeightM))
    ? Number(context.subwooferBottomHeightM)
    : 0;

  return {
    quantity,
    finalistId: result.finalistId || null,
    familyId: result.familyId || null,
    coordinates,
    model,
    bottomHeightM,
    p19,
    p20Primary,
    p20Secondary,
    valid,
    fingerprint: result.fingerprint || null,
    terminal: result.terminal === true,
    physicalRejection: Boolean(result.physicalRejection),
    placementKind: context?.placementKind === "alternative" ? "alternative" : "practical",
    isSideOrMixed: isSideOrMixedWallFamily(result.familyId),
    improvement: null,
  };
}

/**
 * Compare an alternative option against the practical option and describe the
 * specific whole-Level improvement that qualifies it. Uses only the Levels
 * already stamped on the options — no new grade, no dB threshold.
 * @private
 */
export function buildImprovementDescription(altOption, practicalOption) {
  const p19 = Number.isFinite(altOption?.p19?.level)
    && Number.isFinite(practicalOption?.p19?.level)
    && altOption.p19.level > practicalOption.p19.level;
  const primaryP20 = Number.isFinite(altOption?.p20Primary?.level)
    && Number.isFinite(practicalOption?.p20Primary?.level)
    && altOption.p20Primary.level > practicalOption.p20Primary.level;
  return { p19, primaryP20 };
}

/**
 * Detect regressions in the NON-gating parameters so the alternative card can
 * show the actual compromises. The qualification gate is P19 RSP or Primary P20
 * Level improvement with no regression in the other of that pair; a Secondary
 * P20 Level regression does not block qualification (it is not a gate) but is a
 * real compromise the designer must see before accepting a less convenient
 * side/mixed-wall installation. Uses only the Levels already stamped on the
 * options — no new grade, no dB threshold.
 *
 * @private
 * @param {object} altOption — built alternative option
 * @param {object} practicalOption — built practical option
 * @returns {Array<{parameter: string, fromLevel: number, toLevel: number}>}
 *   compromise descriptors (empty when the alternative has no regression)
 */
export function buildCompromiseDescription(altOption, practicalOption) {
  const out = [];
  const altLvl = Number(altOption?.p20Secondary?.level);
  const pracLvl = Number(practicalOption?.p20Secondary?.level);
  if (Number.isFinite(altLvl) && Number.isFinite(pracLvl) && altLvl < pracLvl) {
    out.push({ parameter: "secondaryP20", fromLevel: pracLvl, toLevel: altLvl });
  }
  return out;
}

/**
 * Select the evaluated options for a Stage 2 complete state snapshot.
 *
 * For each quantity (1, 2, 4) the practical front/rear best finalist becomes
 * the normal recommendation, followed by zero or more exceptional
 * side/mixed-wall alternatives that deliver an actual whole-Level improvement
 * over the practical best. Alternatives are drawn from the quantity's eligible
 * ranked `evaluatedFinalists` (already persisted and hydrated), so no new
 * acoustic work is triggered and historical caches are surfaced as-is.
 *
 * Returns a flat array ordered by quantity (1 practical + alternatives, then
 * 2 practical + alternatives, then 4). Only quantities whose bestFinalist
 * carries valid evidence (or an explicit terminal/physical rejection that
 * should be shown as "not verified") are included.
 *
 * @param {object} stage2State — Stage 2 store state
 * @param {Map} seatPriorityMap
 * @param {object} context
 * @returns {object[]} evaluated options (practical + qualifying alternatives)
 */
export function selectEvaluatedOptions(stage2State, seatPriorityMap, context) {
  if (!stage2State || stage2State.status !== "complete") return [];
  const runFingerprint = stage2State.fingerprint || null;
  const buckets = [
    { result: stage2State.one_sub_result },
    { result: stage2State.two_sub_result },
    { result: stage2State.four_sub_result },
  ];
  const options = [];
  for (const bucket of buckets) {
    if (!bucket.result?.bestFinalist) continue;
    const practicalOption = buildEvaluatedOption(bucket.result.bestFinalist, seatPriorityMap, {
      ...context,
      placementKind: "practical",
    });
    if (!practicalOption) continue;
    practicalOption.fingerprint = runFingerprint;
    options.push(practicalOption);

    // Exceptional side/mixed-wall alternatives: drawn from the quantity's
    // eligible ranked evaluated-finalist set. No new acoustic work, no new
    // grade — only existing stamped Levels are compared.
    const evaluatedFinalists = Array.isArray(bucket.result.evaluatedFinalists)
      ? bucket.result.evaluatedFinalists
      : [];
    const alternatives = selectQualifyingAlternatives(evaluatedFinalists, bucket.result.bestFinalist);
    for (const alt of alternatives) {
      const altOption = buildEvaluatedOption(alt, seatPriorityMap, {
        ...context,
        placementKind: "alternative",
      });
      if (!altOption) continue;
      altOption.fingerprint = runFingerprint;
      altOption.improvement = buildImprovementDescription(altOption, practicalOption);
      altOption.compromises = buildCompromiseDescription(altOption, practicalOption);
      options.push(altOption);
    }
  }
  return options;
}