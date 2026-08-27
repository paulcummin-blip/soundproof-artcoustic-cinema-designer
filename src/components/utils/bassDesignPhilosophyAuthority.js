// bassDesignPhilosophyAuthority.js
//
// GOVERNING RULE — locked into the production authority.
//
// The selected RP22 house curve is the immutable design target.
// Do not weaken, lower, reshape, truncate or compromise the house curve
// because the selected subwoofer system cannot achieve it.
//
// The system must:
//   1. Define the target.
//   2. Produce the best realistic EQ match.
//   3. Measure whether the design can support that result.
//   4. Warn the user when it cannot.
//   5. Let the user improve the physical design.
//
// The optimiser must never use available P14 capability, achieved P14/P18/P19/P20
// pass/fail, subwoofer shortfall, or automatic lower target selection to weaken
// or alter the design target. EQ minimises deviation from the selected house
// curve within the fixed physical EQ constraints (+6 / -15 dB, existing Q and
// filter-count limits, protected-null and seat-protection rules).
//
// Staged calculation order (never synchronous on the main thread):
//   1. Render graph and fixed EQ result
//   2. Calculate P14
//   3. Calculate P18
//   4. Calculate P19
//   5. Calculate P20
// Each result is published as it completes.
//
// P19 and P20 are cached against the fixed post-EQ response signatures and do
// NOT recalculate when only the P14 target selection changes.
//
// Changing the P14 target may update the house-curve vertical operating
// position, P14, and P18. It must NOT rerun the physical room simulation or
// regenerate the EQ filter bank when the response shape is unchanged.

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { requiredP14ExtensionHz } from "@/components/utils/p14HouseCurveNormalisation";
import { computeInRoomF3FromResponseCurve } from "@/components/utils/rp22BassMetrics";

export const BASS_DESIGN_PHILOSOPHY = Object.freeze({
  rule: "The selected RP22 house curve is the immutable design target.",
  constraints: Object.freeze({
    maxBoostDb: 6,
    maxCutDb: -15,
    protectedNullRules: true,
    seatProtectionRules: true,
    physicalFilterValidation: true,
  }),
  excludedFromTargetSelection: Object.freeze([
    "availableP14Capability",
    "achievedP14Level",
    "p18PassFail",
    "p19PassFail",
    "p20PassFail",
    "subwooferShortfall",
    "automaticLowerTargetSelection",
  ]),
  stagedOrder: Object.freeze(["eq", "p14", "p18", "p19", "p20"]),
});

const isFiniteNumber = (value) => value !== null && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value));

function smoothedCurve(curve) {
  return applyBassSmoothing(
    (Array.isArray(curve) ? curve : [])
      .filter((point) => isFiniteNumber(point?.frequency) && isFiniteNumber(point?.spl))
      .map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) }))
      .sort((left, right) => left.frequency - right.frequency),
    "third",
  );
}

function curveValueAt(curve, frequency) {
  if (!Array.isArray(curve) || curve.length === 0 || !Number.isFinite(frequency)) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve.at(-1).spl;
  for (let index = 0; index < curve.length - 1; index += 1) {
    if (frequency >= curve[index].frequency && frequency <= curve[index + 1].frequency) {
      const span = curve[index + 1].frequency - curve[index].frequency;
      if (span === 0) return curve[index].spl;
      const ratio = (frequency - curve[index].frequency) / span;
      return curve[index].spl + (curve[index + 1].spl - curve[index].spl) * ratio;
    }
  }
  return null;
}

// P18 assessment against the REQUIRED extension at the SELECTED operating level.
// Does not walk levels or pick the highest winning level. Does not lower the
// operating level or shorten the target curve to create a pass.
//
// The response must sustain the selected operating level (cutoffDb) down to the
// required extension frequency. If it cannot, the result is FAIL with the
// achieved extension and shortfall reported separately.
export function assessP18AgainstRequiredExtension({
  rspPostEqCurve,
  canonicalTargetCurve,
  perSeatPostEqCurves = [],
  selectedP14TargetDb,
  requiredExtensionHz,
  p18CutoffDb,
  configuredUsableLfHz = null,
  upperLfeHz = 120,
  productCurveMinHz = null,
}) {
  if (!Array.isArray(rspPostEqCurve) || !rspPostEqCurve.length) return null;
  const targetDb = Number(selectedP14TargetDb);
  const requiredHz = Number(requiredExtensionHz);
  // p18CutoffDb (= P14Target − 3) is NOT used as an absolute per-frequency SPL
  // floor for the in-room response. It remains in the return for diagnostic
  // compatibility with product-extension consumers, but the achieved in-room
  // F3 uses the response's own 60–200 Hz median (METHOD A).
  const absoluteCutoffDb = Number.isFinite(Number(p18CutoffDb)) ? Number(p18CutoffDb) : null;
  const usableLfHz = Number.isFinite(Number(configuredUsableLfHz))
    ? Number(configuredUsableLfHz)
    : null;
  if (!Number.isFinite(requiredHz)) return null;

  const seatCurves = (Array.isArray(perSeatPostEqCurves) ? perSeatPostEqCurves : [])
    .filter((seat) => Array.isArray(seat?.responseData) && seat.responseData.length);

  // P18 valid lower bound: the simulation grid floor (15 Hz) raised to the
  // product capability validity floor when the active subwoofers have no
  // authoritative engineering data below that point. A response still above
  // the -3 dB cutoff at this floor is a BOUNDED result (extension is at or
  // below the floor), not a measured crossing — see computeInRoomF3FromResponseCurve.
  const simulationMinHz = 15;
  const productFloorHz = Number.isFinite(Number(productCurveMinHz)) ? Number(productCurveMinHz) : null;
  const validMinHz = productFloorHz != null ? Math.max(simulationMinHz, productFloorHz) : simulationMinHz;

  // P18 F3 = achieved in-room −3 dB extension of the confirmed operating
  // response at the selected P14 SPL. Uses the shared 60–200 Hz median
  // authority (METHOD A) — refDb = median of 1/3-octave-smoothed response over
  // 60–200 Hz, cutoffDb = refDb − 3, F3 = sustained extension walk.
  //
  // The 60–200 Hz band is fixed and NOT capped at the room transition.
  // Diagnostic evidence confirmed this is robust to isolated modes, broad
  // modal humps, and small-room transition bleed. P18 reference-band selection
  // and P19/P20 grading-band selection are separate authorities.
  const rspF3 = computeInRoomF3FromResponseCurve(rspPostEqCurve, validMinHz);
  const rspBounded = rspF3.achievedExtensionBounded === true;
  const rspExtensionHz = rspBounded ? rspF3.extensionUpperBoundHz : rspF3.f3Hz;
  const rspRefDb = rspF3.refDb;
  const rspCutoffDb = rspF3.cutoffDb;

  const seatResults = seatCurves.map((seat) => {
    const seatF3 = computeInRoomF3FromResponseCurve(seat.responseData, validMinHz);
    const seatBounded = seatF3.achievedExtensionBounded === true;
    return {
      seatId: seat.seatId,
      extensionHz: seatBounded ? seatF3.extensionUpperBoundHz : seatF3.f3Hz,
      refDb: seatF3.refDb,
      cutoffDb: seatF3.cutoffDb,
      achievedExtensionBounded: seatBounded,
    };
  });
  const validSeatExtensions = seatResults.map((seat) => seat.extensionHz).filter(isFiniteNumber);
  const worstSeatExtensionHz = validSeatExtensions.length ? Math.max(...validSeatExtensions) : null;
  const worstSeatId = seatResults.filter((seat) => isFiniteNumber(seat.extensionHz))
    .sort((a, b) => b.extensionHz - a.extensionHz)[0]?.seatId ?? null;
  const achievedExtensionHz = rspExtensionHz;
  const achievedExtensionBounded = rspBounded;
  const extensionUpperBoundHz = rspBounded ? rspF3.extensionUpperBoundHz : null;
  const passes = isFiniteNumber(achievedExtensionHz) && achievedExtensionHz <= requiredHz;
  const shortfallHz = passes
    ? null
    : (isFiniteNumber(achievedExtensionHz) ? achievedExtensionHz - requiredHz : null);

  return {
    selectedP14TargetDb: Number.isFinite(targetDb) ? targetDb : null,
    requiredExtensionHz: requiredHz,
    p18CutoffDb: absoluteCutoffDb,
    // The achieved in-room F3 uses the response's own 60–200 Hz median, NOT
    // p18CutoffDb. This field is retained for diagnostic compatibility only.
    rspRefDb,
    rspCutoffDb,
    relativeCutoffDb: -3,
    configuredUsableLfHz: usableLfHz,
    rspExtensionHz,
    worstSeatExtensionHz,
    worstSeatId,
    seatResults,
    seatConsistencyExcludedFromP18: true,
    achievedExtensionHz,
    achievedExtensionBounded,
    extensionUpperBoundHz,
    validMinHz,
    productCurveMinHz: productFloorHz,
    passes,
    shortfallHz,
    assessmentSource: rspBounded
      ? "in-room-60-200-median-bounded-at-product-validity-floor"
      : "in-room-60-200-median-sustained-extension",
  };
}

// P19/P20 cache key — derived from the fixed post-EQ response signatures only.
// Changing the P14 target selection does NOT change this key, so P19/P20
// results remain valid and are not recalculated.
export function computeP19P20CacheKey({ postEqCurveSignature, filterBankSignature, seatCount }) {
  const parts = [
    "p19p20",
    String(postEqCurveSignature || "—"),
    String(filterBankSignature || "—"),
    `seats:${Number.isFinite(seatCount) ? seatCount : 0}`,
  ];
  return parts.join("|");
}

// User warning message and practical actions shown when P14 or P18 fails.
export const BASS_TARGET_FAILURE_MESSAGE =
  "The current subwoofer selection cannot achieve the selected RP22 bass target after calibration EQ.";

export const BASS_TARGET_FAILURE_ACTIONS = Object.freeze([
  "Adjust subwoofer positions",
  "Add additional subwoofers",
  "Select a higher-capability subwoofer",
  "Combine these changes",
]);

export function buildBassTargetWarning({ p14Pass, p18Pass, p14ShortfallDb, p14LimitingFrequencyHz, p18ShortfallHz, p18RequiredExtensionHz }) {
  const p14Failed = p14Pass === false;
  const p18Failed = p18Pass === false;
  if (!p14Failed && !p18Failed) return null;
  const details = [];
  if (p14Failed) {
    details.push({
      parameter: "P14",
      message: `Subwoofer output capability${isFiniteNumber(p14ShortfallDb) ? ` — ${Math.abs(p14ShortfallDb).toFixed(1)} dB shortfall` : ""}${isFiniteNumber(p14LimitingFrequencyHz) ? ` at ${p14LimitingFrequencyHz.toFixed(1)} Hz` : ""}.`,
    });
  }
  if (p18Failed) {
    details.push({
      parameter: "P18",
      message: `Bass extension${isFiniteNumber(p18ShortfallHz) ? ` — ${Math.abs(p18ShortfallHz).toFixed(1)} Hz short of ${p18RequiredExtensionHz} Hz` : ` — does not reach ${p18RequiredExtensionHz} Hz`}.`,
    });
  }
  return {
    message: BASS_TARGET_FAILURE_MESSAGE,
    details,
    actions: BASS_TARGET_FAILURE_ACTIONS,
  };
}

export { requiredP14ExtensionHz };