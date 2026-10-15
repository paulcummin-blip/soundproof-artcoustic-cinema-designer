// practicalPairAuthority.js
// ---------------------------------------------------------------------------
// THE one authority for "these two subwoofers are a practical symmetric pair".
//
// WHY THIS EXISTS
// The optimiser couples a mirrored same-wall pair so that the pair moves together
// — one movement variable, two explicit coordinates. The original test required
// the two acoustic centres to be mirrored to within 10 mm on BOTH axes. A real
// installed pair never matches that: the cabinets are set against the same wall,
// one each side of the centre line, but a build-out, skirting, joist or service
// void behind one of them puts its acoustic centre at a slightly different
// depth. On the Barton Solutions design the rear pair differs in depth by 81 mm
// only, and the old rule refused to recognise it — so the design was split into
// three unrelated groups and its searches ran on a layout that was not the one
// the room actually has.
//
// THE TOLERANCE LADDER — one authority, two named bands
//
//   identical   10 mm   the frozen two-source rule. Two sources count as ONE
//                       acoustic position, so differential grouped timing stays
//                       disabled by default. Unchanged by this module.
//
//   practical  100 mm   the installation band, used where two of THREE sources
//                       must be recognised as the pair they were built as.
//
// WHY 100 MM IS PHYSICALLY REASONABLE
//   100 mm is this application's own installation granularity: the placement
//   guide inset is 0.1 m, the local position grid is 0.1 m and the practical
//   placement band is 0.2 m. A subwoofer cabinet is 0.27–0.30 m deep and its
//   acoustic centre sits about one half-depth off the wall, so a 100 mm depth
//   difference is inside one half-depth: the two cabinets are at the same
//   installed depth as built, not at two deliberately different depths.
//   Laterally, 100 mm is roughly 2% of a 4–6 m room width, so a pair recognised
//   at this tolerance is still installed as a pair, one each side of the centre
//   line — and because the pair's lateral positions are exactly what the
//   placement search moves, recognising the pair is what lets ADI improve the
//   spread instead of treating two related cabinets as unrelated sources.
//   Beyond 100 mm the depth difference is a deliberate staggered installation
//   (one cabinet pushed out from the wall), which the conservative rule keeps as
//   two separate groups.
//
// Pure geometry and product identity. No bass maths, no P19/P20 definition, no
// scoring, no ranking, no target-bank logic.
// ---------------------------------------------------------------------------

/** Two sources count as ONE acoustic position (frozen two-source rule). */
export const IDENTICAL_PAIR_TOLERANCE_M = 0.01;

/** Two sources count as the pair they were installed as. */
export const PRACTICAL_PAIR_TOLERANCE_M = 0.1;

/** Stated wherever the practical band is explained, so it is never a bare number. */
export const PAIR_TOLERANCE_BASIS =
  "A practical symmetric pair is recognised when the two cabinets sit on the same wall, one each side of the "
  + "room's centre line, mirrored to within 100 mm and installed at the same depth to within 100 mm. 100 mm is "
  + "the application's own installation granularity (placement inset 0.1 m, position grid 0.1 m) and is about one "
  + "half of a subwoofer cabinet's depth, so the pair is read as installed together rather than as two unrelated "
  + "sources. A depth difference beyond 100 mm is a deliberate staggered installation and stays two groups.";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** A source may arrive as an instance ({position:{x,y}}) or as a raw point. */
function readPoint(source) {
  const point = source?.position || source;
  return { x: num(point?.x), y: num(point?.y) };
}

/**
 * Same model, or — when neither states one — no evidence against. Two different
 * stated models are never a pair.
 */
export function sameSubwooferModel(a, b) {
  const modelA = String(a?.model ?? a?.modelKey ?? "").trim();
  const modelB = String(b?.model ?? b?.modelKey ?? "").trim();
  if (modelA && modelB && modelA !== modelB) return false;
  return true;
}

/**
 * Classify two sources as a symmetric pair.
 *
 * @param {object} a - subwoofer instance ({position:{x,y}}) or raw point ({x,y})
 * @param {object} b - the other source
 * @param {object} params
 * @param {number} params.widthM - room width, the centre line the pair mirrors about
 * @param {number} [params.toleranceM] - the band to test (default: practical)
 * @returns {{paired:boolean, identical:boolean, toleranceM:number, lateralOffsetM:number|null,
 *   depthDeltaM:number|null, modelMatch:boolean, reason:string}}
 */
export function classifySymmetricPair(a, b, {
  widthM = null,
  toleranceM = PRACTICAL_PAIR_TOLERANCE_M,
} = {}) {
  const width = num(widthM);
  const tolerance = num(toleranceM) ?? PRACTICAL_PAIR_TOLERANCE_M;
  const pointA = readPoint(a);
  const pointB = readPoint(b);
  const modelMatch = sameSubwooferModel(a, b);

  const base = {
    paired: false,
    identical: false,
    toleranceM: tolerance,
    lateralOffsetM: null,
    depthDeltaM: null,
    modelMatch,
    reason: "",
  };

  if (width == null || width <= 0 || pointA.x == null || pointA.y == null
    || pointB.x == null || pointB.y == null) {
    return { ...base, reason: "Pair geometry could not be read for this room." };
  }
  if (!modelMatch) {
    return { ...base, reason: "Different subwoofer models — not one acoustic pair." };
  }

  const lateralOffsetM = Math.abs(pointA.x + pointB.x - width);
  const depthDeltaM = Math.abs(pointA.y - pointB.y);
  const sameSideOfCentre = (pointA.x - width / 2) * (pointB.x - width / 2) < 0
    || Math.abs(pointA.x - width / 2) <= tolerance
    || Math.abs(pointB.x - width / 2) <= tolerance;

  const measured = { lateralOffsetM, depthDeltaM };
  if (!sameSideOfCentre) {
    return { ...base, ...measured, reason: "Both cabinets sit on the same side of the room's centre line." };
  }
  if (lateralOffsetM > tolerance) {
    return {
      ...base,
      ...measured,
      reason: `Lateral positions are ${Math.round(lateralOffsetM * 1000)} mm from a true mirror — `
        + `beyond the ${Math.round(tolerance * 1000)} mm installation band.`,
    };
  }
  if (depthDeltaM > tolerance) {
    return {
      ...base,
      ...measured,
      reason: `Installed depths differ by ${Math.round(depthDeltaM * 1000)} mm — `
        + `a deliberately staggered installation, not one pair.`,
    };
  }

  return {
    paired: true,
    identical: lateralOffsetM <= IDENTICAL_PAIR_TOLERANCE_M && depthDeltaM <= IDENTICAL_PAIR_TOLERANCE_M,
    toleranceM: tolerance,
    lateralOffsetM,
    depthDeltaM,
    modelMatch,
    reason: lateralOffsetM <= IDENTICAL_PAIR_TOLERANCE_M && depthDeltaM <= IDENTICAL_PAIR_TOLERANCE_M
      ? "Mirrored about the room's centre line and installed at the same depth."
      : `Recognised as one installed pair: mirrored to ${Math.round(lateralOffsetM * 1000)} mm and `
        + `set at depths ${Math.round(depthDeltaM * 1000)} mm apart, inside the installation band.`,
  };
}

/** The pair-as-installed test (100 mm band). */
export function isPracticalSymmetricPair(a, b, params = {}) {
  return classifySymmetricPair(a, b, { ...params, toleranceM: PRACTICAL_PAIR_TOLERANCE_M }).paired;
}

/**
 * The frozen two-source test (10 mm band): two sources at ONE acoustic position.
 * Kept separate so the two-source rule is never widened by this module.
 */
export function isIdenticalSymmetricPair(a, b, params = {}) {
  return classifySymmetricPair(a, b, { ...params, toleranceM: IDENTICAL_PAIR_TOLERANCE_M }).paired;
}