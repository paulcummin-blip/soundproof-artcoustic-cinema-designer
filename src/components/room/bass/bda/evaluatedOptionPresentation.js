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
// ---------------------------------------------------------------------------

import { normaliseModelKey } from "@/components/models/speakers/registry";

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

/**
 * Is the Stage 2 result's P19/P20 evidence valid to display?
 * A result that failed the requested P14 operating point, that carried a
 * physical rejection, or that terminated without canonical assessment never
 * carries valid P19/P20 — so it is never shown as a predicted RP22 result.
 */
export function resultEvidenceIsValid(result) {
  if (!result || result.terminal === true || result.physicalRejection) return false;
  if (result.requestedP14Pass === false) return false;
  // Explicit null guard: Number(null) === 0, which Number.isFinite accepts.
  // A null/undefined P19 level must never be treated as a valid Level 0.
  const p19Level = result.achievedP19Level;
  if (p19Level == null || !Number.isFinite(Number(p19Level)) || Number(p19Level) < 0) return false;
  return true;
}

/**
 * Build the compact evaluated-option shape for a Stage 2 best-finalist result.
 *
 * @param {object} result — Stage 2 canonical finalist result (bestFinalist)
 * @param {Map} seatPriorityMap — seatId → "primary" | "secondary"
 * @param {object} context — { roomDims, selectedSubModel, subwooferBottomHeightM }
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
  };
}

/**
 * Select the best evaluated option per quantity (1, 2, 4) from a Stage 2
 * complete state snapshot. Returns an array ordered by quantity, with null
 * entries omitted. Only quantities whose bestFinalist carries valid evidence
 * (or an explicit terminal/physical rejection that should be shown as "not
 * verified") are included.
 *
 * @param {object} stage2State — Stage 2 store state
 * @param {Map} seatPriorityMap
 * @param {object} context
 * @returns {object[]} evaluated options (1–3 entries)
 */
export function selectEvaluatedOptions(stage2State, seatPriorityMap, context) {
  if (!stage2State || stage2State.status !== "complete") return [];
  const runFingerprint = stage2State.fingerprint || null;
  const buckets = [
    { quantity: 1, result: stage2State.one_sub_result?.bestFinalist },
    { quantity: 2, result: stage2State.two_sub_result?.bestFinalist },
    { quantity: 4, result: stage2State.four_sub_result?.bestFinalist },
  ];
  const options = [];
  for (const bucket of buckets) {
    if (!bucket.result) continue;
    const option = buildEvaluatedOption(bucket.result, seatPriorityMap, context);
    if (option) {
      // Stamp the Stage 2 run fingerprint so the quantity-aware Apply stale
      // guard can reject an option whose evaluation no longer matches the
      // current design.
      option.fingerprint = runFingerprint;
      options.push(option);
    }
  }
  return options;
}