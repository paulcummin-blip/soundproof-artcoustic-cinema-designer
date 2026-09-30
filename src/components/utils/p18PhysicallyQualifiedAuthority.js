// p18PhysicallyQualifiedAuthority.js
//
// Physically qualified P18 extension authority (Method C).
//
// Replaces the self-referenced 60–200 Hz median F3 (Method A) with a
// target-relative F3 that respects both the response AND the product
// operating capability at the selected P14 operating state.
//
// Concept:
//   response -3 dB point relative to operating target        (definition)
//   AND
//   product operating capability with 3 dB to spare relative
//   to the operating target                                  (protection)
//   → take the more restrictive / higher-frequency crossing
//   → achieved P18
//   → P19/P20 lower assessment bound
//
// The operating target is the canonical house curve target:
//   target(f) = p14TargetDb + artcousticHouseCurveOffsetAt(f)
//
// RESPONSE BRANCH — the -3 dB point (definition, unchanged):
//   cutoff(f) = target(f) - 3
//
// CAPABILITY BRANCH — 3 dB residual headroom (this rule):
//   remainingHeadroom(f) = systemMaxOutput(f) - target(f)
//   usable(f) ⟺ remainingHeadroom(f) >= P18_RESIDUAL_HEADROOM_DB
//   cutoff(f) = target(f) + 3
//
// P18 is therefore the lowest validated frequency where the installed
// subwoofer system can meet the selected P14 LFE target with at least 3 dB of
// output headroom still in hand. It is NOT the individual product F3: the
// capability curve is the power-summed multi-sub system output over the
// product's own validated DATA span, and the stop is decided by remaining
// headroom, not by a product -6 dB usable point.
//
// Lower selected P14 target ⇒ deeper P18. Higher selected P14 target ⇒ less
// deep. That trade-off is the physical result, not a tuning choice.
//
// A curve point meets a criterion when:
//   curve(f) >= cutoff(f)
// which is equivalent to:
//   curve(f) - artcousticHouseCurveOffsetAt(f) >= (p14TargetDb ∓ 3)
//
// So we adjust the curve by subtracting the house curve offset, then use a
// flat cutoff on the adjusted curve. This reuses the proven sustained-crossing
// walk logic for both branches.
//
// The capability curve is NOT derated a second time: the required residual
// headroom IS the safety reserve, so it is counted exactly once.
//
// BOUNDED RESULT HANDLING:
//   If BOTH response and capability remain above cutoff at the lowest valid
//   frequency, the result is bounded (≤ lowest valid frequency).
//   If EITHER has an actual interpolated crossing above the floor, that
//   crossing is used.
//   The achieved P18 is max(responseF3, capabilityF3) — the more restrictive.

import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { getSubwooferCurve, getSpeakerModelMeta } from "@/components/models/speakers/registry";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Residual output headroom P18 requires above the selected P14 LFE target.
// The installed system must still be able to deliver the target with this much
// headroom in hand at the published extension frequency. Below it, the
// frequency is not usable for P18: the system is already at or past its limit
// there, so extension may not be claimed.
export const P18_RESIDUAL_HEADROOM_DB = 3;

// Limiting reasons — what actually stopped the extension walk.
export const P18_LIMITING_REASON = Object.freeze({
  PRODUCT_DATA_FLOOR: "product-data-floor",
  OUTPUT_HEADROOM: "output-headroom",
  ROOM_RESPONSE: "room-response",
  UNRESOLVED: "unresolved",
});

function toSplCurve(responseData) {
  if (!Array.isArray(responseData)) return [];
  return responseData
    .filter((p) => p && isNum(p.frequency) && isNum(p.spl))
    .map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) }))
    .sort((a, b) => a.frequency - b.frequency);
}

function smoothThird(curve) {
  if (!Array.isArray(curve) || curve.length === 0) return [];
  const smoothed = applyBassSmoothing(curve, "third");
  return smoothed
    .filter((p) => isNum(p.frequency) && isNum(p.spl))
    .map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) }));
}

// Adjust a curve by subtracting the house curve offset at each frequency.
// adjusted(f) = curve(f) - artcousticHouseCurveOffsetAt(f)
function adjustForHouseCurve(curve) {
  return curve.map((p) => ({
    frequency: p.frequency,
    spl: p.spl - artcousticHouseCurveOffsetAt(p.frequency),
  }));
}

// Find the lowest frequency where the adjusted curve >= flatCutoffDb.
// Uses sustained-crossing walk with 1/3-octave local window (narrow-spike protection).
// Returns { f3Hz, bounded, upperBoundHz }:
//   - bounded=true:  adjusted curve still above cutoff at floor → f3Hz=null, upperBoundHz=floor
//   - f3Hz!=null:    actual interpolated crossing
//   - both null:     curve never reaches cutoff (FAIL — no extension at this target)
function findTargetRelativeF3Adjusted(curve, flatCutoffDb, validMinHz) {
  const empty = { f3Hz: null, bounded: false, upperBoundHz: null };
  if (!Array.isArray(curve) || curve.length === 0) return empty;

  const curveMinHz = curve[0].frequency;
  const floorHz = isNum(validMinHz) && validMinHz > 0
    ? Math.max(validMinHz, curveMinHz)
    : curveMinHz;

  const points = curve.filter((p) => p.frequency >= floorHz && p.frequency <= 200 && isNum(p.spl));
  if (!points.length) {
    return { f3Hz: null, bounded: true, upperBoundHz: floorHz };
  }

  // Bounded: adjusted curve is still above cutoff at the lowest valid frequency.
  if (points[0].spl >= flatCutoffDb) {
    return { f3Hz: null, bounded: true, upperBoundHz: floorHz };
  }

  // Search upward for the first sustained crossing of flatCutoffDb.
  let f3Hz = null;
  for (let index = 0; index < points.length; index++) {
    if (points[index].spl < flatCutoffDb) continue;
    // Local 1/3-octave sustained window: [crossing, crossing × 2^(1/3)].
    const windowEndHz = points[index].frequency * Math.pow(2, 1 / 3);
    let sustained = true;
    for (let j = index; j < points.length; j++) {
      if (points[j].frequency > windowEndHz) break;
      if (points[j].spl < flatCutoffDb) { sustained = false; break; }
    }
    if (!sustained) continue;
    // Interpolate the exact crossing from the previous point.
    const previous = points[index - 1];
    if (!previous || previous.spl >= flatCutoffDb) {
      f3Hz = points[index].frequency;
      break;
    }
    const ratio = (flatCutoffDb - previous.spl) / (points[index].spl - previous.spl);
    f3Hz = previous.frequency + (points[index].frequency - previous.frequency) * ratio;
    break;
  }

  if (f3Hz == null) {
    // No crossing found — curve never reaches cutoff (FAIL).
    return { f3Hz: null, bounded: false, upperBoundHz: null };
  }

  return { f3Hz, bounded: false, upperBoundHz: null };
}

// ---------------------------------------------------------------------------
// Response-target F3
// ---------------------------------------------------------------------------
// Lowest frequency where the smoothed Final EQ response is within
// target(f) - 3 dB, i.e. response(f) >= p14TargetDb + houseCurveOffset(f) - 3.
//
// @param {Array} responseCurve - [{ frequency, spl }] Final EQ response (received domain)
// @param {number} p14TargetDb - P14 target SPL for the selected operating level
// @param {number|null} validMinHz - product capability validity floor
// @returns {{ f3Hz: number|null, bounded: boolean, upperBoundHz: number|null }}
// ---------------------------------------------------------------------------
export function computeResponseTargetF3(responseCurve, p14TargetDb, validMinHz = null) {
  const smoothed = smoothThird(toSplCurve(responseCurve));
  const adjusted = adjustForHouseCurve(smoothed);
  const flatCutoffDb = Number(p14TargetDb) - 3;
  return findTargetRelativeF3Adjusted(adjusted, flatCutoffDb, validMinHz);
}

// ---------------------------------------------------------------------------
// Product capability curve (power-summed, source-domain product data)
// ---------------------------------------------------------------------------
// The system's maximum output at each frequency: the power sum of every active
// subwoofer's validated product curve (multi-sub summation, +10·log10(n) for n
// identical units).
//
// The curve's lower bound is the validated product DATA floor — the lowest
// frequency every active sub publishes engineering data for. It is deliberately
// NOT the product's -6 dB usable LF point: that point is the product F3, and
// terminating output-capable extension there would hide extension the installed
// system can genuinely deliver. Below the data floor there is no product
// authority at all, so the walk stops and the result is reported as bounded.
export function buildProductCapabilityCurve(activeSubs) {
  const products = (activeSubs || [])
    .map((sub) => {
      const modelKey = sub?.modelKey ?? sub?.model;
      const curve = getSubwooferCurve(modelKey);
      const meta = getSpeakerModelMeta(modelKey);
      if (!Array.isArray(curve) || curve.length < 2) return null;
      const frequencies = curve.map((p) => Number(p.hz)).filter(Number.isFinite).sort((a, b) => a - b);
      const usableLfHz = Number(meta?.bassCapability?.usableLF_neg6dB);
      return {
        // Diagnostic only — never the P18 floor.
        usableLfHz: isNum(usableLfHz) ? usableLfHz : null,
        dataFloorHz: frequencies.length ? frequencies[0] : null,
        curve: curve.map((p) => ({ frequency: Number(p.hz), spl: Number(p.db) })),
      };
    })
    .filter(Boolean);

  if (!products.length) return null;

  const productLfLimits = products.map((p) => p.dataFloorHz).filter(isNum);
  const physicalLfHz = productLfLimits.length ? Math.max(...productLfLimits) : 0;

  const frequencies = [...new Set([
    physicalLfHz,
    ...products.flatMap((p) => p.curve.map((point) => point.frequency)),
  ])]
    .filter((f) => f >= physicalLfHz)
    .sort((a, b) => a - b);

  const capabilityCurve = frequencies.map((f) => {
    const values = products.map((p) => {
      const exact = p.curve.find((c) => c.frequency === f);
      if (exact) return exact.spl;
      // Interpolate
      const lower = p.curve.filter((c) => c.frequency <= f).at(-1);
      const upper = p.curve.find((c) => c.frequency >= f);
      if (!lower || !upper || lower.frequency === upper.frequency) return lower?.spl ?? null;
      const ratio = (f - lower.frequency) / (upper.frequency - lower.frequency);
      return lower.spl + (upper.spl - lower.spl) * ratio;
    });
    if (values.some((v) => !isNum(v))) return null;
    const spl = 10 * Math.log10(values.reduce((sum, v) => sum + Math.pow(10, v / 10), 0));
    return { frequency: f, spl };
  }).filter(Boolean);

  return { curve: capabilityCurve, physicalLfHz };
}

// ---------------------------------------------------------------------------
// Capability-target F3 — 3 dB residual headroom criterion
// ---------------------------------------------------------------------------
// Lowest frequency where the installed system's maximum output still exceeds
// the operating target by the required residual headroom:
//   systemMaxOutput(f) - target(f) >= P18_RESIDUAL_HEADROOM_DB
// i.e. productLimit(f) >= p14TargetDb + houseCurveOffset(f) + 3.
//
// The product curve is not derated a second time: this criterion already
// requires 3 dB of the system's output capability to remain unused, which is
// the protection the product needs. Derating as well would count the margin
// twice and would make the published headroom disagree with the decision.
//
// @param {Array} activeSubs - active subwoofer instances
// @param {number} p14TargetDb - P14 target SPL for the selected operating level
// @param {number|null} validMinHz - product data validity floor
// @returns {{ f3Hz: number|null, bounded: boolean, upperBoundHz: number|null }}
// ---------------------------------------------------------------------------
export function computeCapabilityTargetF3(activeSubs, p14TargetDb, validMinHz = null) {
  const product = buildProductCapabilityCurve(activeSubs);
  if (!product || !product.curve.length) {
    return { f3Hz: null, bounded: false, upperBoundHz: null };
  }
  const adjusted = adjustForHouseCurve(product.curve);
  const flatCutoffDb = Number(p14TargetDb) + P18_RESIDUAL_HEADROOM_DB;
  return findTargetRelativeF3Adjusted(adjusted, flatCutoffDb, validMinHz);
}

// ---------------------------------------------------------------------------
// What actually stopped the extension walk. Two branches can bind, and each
// stops the walk for a different reason:
//   product-data-floor  the binding branch had no validated data below the
//                       floor, so the result is bounded rather than crossed
//   output-headroom     the system ran out of the 3 dB of spare output
//                       capability the rule requires over the selected target
//   room-response       the room response never reaches the -3 dB criterion
//                       above the floor (correctability / geometry limited)
// Ties resolve to the capability reason: the output rule is the protection
// limit, so a frequency is not usable for P18 unless it is satisfied.
function classifyP18LimitingReason({ responseHz, capabilityHz, responseBounded, capabilityBounded }) {
  if (responseHz == null || capabilityHz == null) {
    if (capabilityHz == null && responseHz != null) return P18_LIMITING_REASON.ROOM_RESPONSE;
    return P18_LIMITING_REASON.UNRESOLVED;
  }
  if (capabilityBounded && responseBounded) return P18_LIMITING_REASON.PRODUCT_DATA_FLOOR;
  if (capabilityHz >= responseHz) {
    return capabilityBounded
      ? P18_LIMITING_REASON.PRODUCT_DATA_FLOOR
      : P18_LIMITING_REASON.OUTPUT_HEADROOM;
  }
  return P18_LIMITING_REASON.ROOM_RESPONSE;
}

// Canonical physically qualified P18 extension authority (Method C)
// ---------------------------------------------------------------------------
// For each P14 level:
//   responseF3 = lowest f where response(f) >= target(f) - 3            (the -3 dB point)
//   capabilityF3 = lowest f where systemMaxOutput(f) >= target(f) + 3    (3 dB spare)
//   achievedP18 = max(responseF3, capabilityF3)  [more restrictive]
//   passes = achievedP18 <= p18LimitHz
// Winning level = highest passing level.
//
// Both criteria must hold at the achieved frequency, so the published P18 both
// states the -3 dB point at the selected target AND carries at least 3 dB of
// residual output headroom there.
//
// @param {object} params
// @param {Array} params.rspPostEqCurve - Final EQ RSP response [{ frequency, spl }]
// @param {Array} params.activeSubs - active subwoofer instances
// @param {number|null} params.configuredUsableLfHz - configured usable LF extension
// @param {string} params.p14TargetBasis - "minimum" or "recommended"
// @returns {object|null} - P18 result with targets, level, value, formatted
// ---------------------------------------------------------------------------
export function computePhysicallyQualifiedP18Extension({
  rspPostEqCurve,
  activeSubs = [],
  configuredUsableLfHz = null,
  p14TargetBasis = "minimum",
}) {
  if (!Array.isArray(rspPostEqCurve) || !rspPostEqCurve.length) return null;

  const definitions = getRp22BassOperatingDefinitions(p14TargetBasis);

  // Product capability validity floor: highest (worst) lowest engineering
  // frequency among active subwoofers.
  const productMinHzValues = (activeSubs || [])
    .map((sub) => {
      const curve = getSubwooferCurve(sub?.modelKey ?? sub?.model);
      if (!Array.isArray(curve) || !curve.length) return null;
      const freqs = curve.map((p) => Number(p.hz)).filter(Number.isFinite).sort((a, b) => a - b);
      return freqs.length ? freqs[0] : null;
    })
    .filter(Number.isFinite);
  const productCurveMinHz = productMinHzValues.length ? Math.max(...productMinHzValues) : null;
  const validMinHz = Number.isFinite(productCurveMinHz) ? Math.max(15, productCurveMinHz) : null;

  // A configured usable LF extension is reported, never used as the P18 floor:
  // it is the product's own -6 dB usable point, i.e. the product F3, and the
  // rule forbids terminating output-capable extension there. P18 is bounded by
  // the validated product DATA floor and by the residual-headroom criterion.
  const configuredMinHz = isNum(configuredUsableLfHz) ? Number(configuredUsableLfHz) : null;
  const effectiveMinHz = validMinHz;

  const targets = definitions.map((definition) => {
    const p14TargetDb = definition.p14TargetDb;
    // Response criterion: the -3 dB point relative to the selected target.
    const flatCutoffDb = p14TargetDb - 3;
    // Capability criterion: the selected target PLUS the required residual
    // output headroom the system must still have in hand.
    const headroomCutoffDb = p14TargetDb + P18_RESIDUAL_HEADROOM_DB;

    // Response-target F3
    const responseF3 = computeResponseTargetF3(rspPostEqCurve, p14TargetDb, effectiveMinHz);
    let responseExtensionHz = null;
    let responseBounded = false;
    if (responseF3.bounded) {
      responseExtensionHz = responseF3.upperBoundHz;
      responseBounded = true;
    } else if (responseF3.f3Hz != null) {
      responseExtensionHz = responseF3.f3Hz;
    }

    // Capability-target F3
    const capabilityF3 = computeCapabilityTargetF3(activeSubs, p14TargetDb, effectiveMinHz);
    let capabilityExtensionHz = null;
    let capabilityBounded = false;
    if (capabilityF3.bounded) {
      capabilityExtensionHz = capabilityF3.upperBoundHz;
      capabilityBounded = true;
    } else if (capabilityF3.f3Hz != null) {
      capabilityExtensionHz = capabilityF3.f3Hz;
    }

    // If either is null (not bounded, no crossing), P18 fails for this level.
    if (responseExtensionHz == null || capabilityExtensionHz == null) {
      return {
        level: definition.level,
        p14TargetDb,
        cutoffDb: flatCutoffDb,
        headroomCutoffDb: headroomCutoffDb,
        limitHz: definition.p18LimitHz,
        responseTargetF3Hz: responseExtensionHz,
        capabilityTargetF3Hz: capabilityExtensionHz,
        responseBounded,
        capabilityBounded,
        achievedBounded: false,
        extensionHz: null,
        extensionHzRaw: null,
        passesFrequency: false,
        residualHeadroomDb: P18_RESIDUAL_HEADROOM_DB,
        limitingReason: P18_LIMITING_REASON.UNRESOLVED,
      };
    }

    // Achieved P18 = max(responseF3, capabilityF3) — the more restrictive crossing.
    // Both criteria hold at the achieved frequency: the -3 dB point at the
    // selected target is met, and the required residual output headroom is
    // still in hand.
    const achievedBounded = responseBounded && capabilityBounded;
    const extensionHz = Math.max(responseExtensionHz, capabilityExtensionHz);
    const designHz = resolveRp22DesignValue(18, extensionHz);

    return {
      level: definition.level,
      p14TargetDb,
      cutoffDb: flatCutoffDb,
      headroomCutoffDb: headroomCutoffDb,
      limitHz: definition.p18LimitHz,
      responseTargetF3Hz: responseExtensionHz,
      capabilityTargetF3Hz: capabilityExtensionHz,
      responseBounded,
      capabilityBounded,
      achievedBounded,
      extensionHz: designHz,
      extensionHzRaw: extensionHz,
      passesFrequency: designHz != null && designHz <= definition.p18LimitHz,
      residualHeadroomDb: P18_RESIDUAL_HEADROOM_DB,
      limitingReason: classifyP18LimitingReason({
        responseHz: responseExtensionHz,
        capabilityHz: capabilityExtensionHz,
        responseBounded,
        capabilityBounded,
      }),
    };
  });

  const winningTarget = targets.slice().reverse().find((t) => t.passesFrequency) || null;

  return {
    targets,
    level: winningTarget?.level || null,
    value: winningTarget?.extensionHz ?? null,
    formatted: winningTarget ? `${winningTarget.extensionHz} Hz` : null,
    responseTargetF3Hz: winningTarget?.responseTargetF3Hz ?? null,
    capabilityTargetF3Hz: winningTarget?.capabilityTargetF3Hz ?? null,
    achievedExtensionBounded: winningTarget?.achievedBounded || false,
    extensionUpperBoundHz: winningTarget?.achievedBounded
      ? (winningTarget?.responseTargetF3Hz ?? winningTarget?.capabilityTargetF3Hz ?? null)
      : null,
    residualHeadroomDb: P18_RESIDUAL_HEADROOM_DB,
    limitingReason: winningTarget?.limitingReason ?? P18_LIMITING_REASON.UNRESOLVED,
    configuredUsableLfHz: configuredMinHz,
    source: "physically-qualified-operating-target-f3",
    note: "Achieved P18 is the more restrictive of the response -3 dB point at the selected P14 operating target and the frequency where the installed system still holds the required residual output headroom over that target (Method C).",
  };
}