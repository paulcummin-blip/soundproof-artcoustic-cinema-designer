// p18PhysicallyQualifiedAuthority.js
//
// Physically qualified P18 extension authority (Method C).
//
// Replaces the self-referenced 60–200 Hz median F3 (Method A) with a
// target-relative F3 that respects both the response AND the product
// operating capability at the selected P14 operating state.
//
// Concept:
//   response F3 relative to operating target
//   AND
//   product operating capability F3 relative to operating target
//   → take the more restrictive / higher-frequency crossing
//   → achieved P18
//   → P19/P20 lower assessment bound
//
// The operating target is the canonical house curve target:
//   target(f) = p14TargetDb + artcousticHouseCurveOffsetAt(f)
//
// The -3 dB cutoff is:
//   cutoff(f) = target(f) - 3 = p14TargetDb + artcousticHouseCurveOffsetAt(f) - 3
//
// A curve point meets the cutoff when:
//   curve(f) >= cutoff(f)
// which is equivalent to:
//   curve(f) - artcousticHouseCurveOffsetAt(f) >= p14TargetDb - 3
//
// So we adjust the curve by subtracting the house curve offset, then use
// a flat cutoff of (p14TargetDb - 3) on the adjusted curve. This reuses the
// proven sustained-crossing walk logic.
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
function buildProductCapabilityCurve(activeSubs) {
  const products = (activeSubs || [])
    .map((sub) => {
      const modelKey = sub?.modelKey ?? sub?.model;
      const curve = getSubwooferCurve(modelKey);
      const meta = getSpeakerModelMeta(modelKey);
      if (!Array.isArray(curve) || curve.length < 2) return null;
      const usableLfHz = Number(meta?.bassCapability?.usableLF_neg6dB);
      return {
        usableLfHz: isNum(usableLfHz) ? usableLfHz : null,
        curve: curve.map((p) => ({ frequency: Number(p.hz), spl: Number(p.db) })),
      };
    })
    .filter(Boolean);

  if (!products.length) return null;

  const productLfLimits = products.map((p) => p.usableLfHz).filter(isNum);
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
// Capability-target F3
// ---------------------------------------------------------------------------
// Lowest frequency where the product operating limit is within
// target(f) - 3 dB, i.e. productLimit(f) >= p14TargetDb + houseCurveOffset(f) - 3.
//
// @param {Array} activeSubs - active subwoofer instances
// @param {number} p14TargetDb - P14 target SPL for the selected operating level
// @param {number|null} validMinHz - product capability validity floor
// @returns {{ f3Hz: number|null, bounded: boolean, upperBoundHz: number|null }}
// ---------------------------------------------------------------------------
export function computeCapabilityTargetF3(activeSubs, p14TargetDb, validMinHz = null) {
  const product = buildProductCapabilityCurve(activeSubs);
  if (!product || !product.curve.length) {
    return { f3Hz: null, bounded: false, upperBoundHz: null };
  }
  const adjusted = adjustForHouseCurve(product.curve);
  const flatCutoffDb = Number(p14TargetDb) - 3;
  return findTargetRelativeF3Adjusted(adjusted, flatCutoffDb, validMinHz);
}

// ---------------------------------------------------------------------------
// Canonical physically qualified P18 extension authority (Method C)
// ---------------------------------------------------------------------------
// For each P14 level:
//   responseF3 = lowest f where response(f) >= target(f) - 3
//   capabilityF3 = lowest f where productLimit(f) >= target(f) - 3
//   achievedP18 = max(responseF3, capabilityF3)  [more restrictive]
//   passes = achievedP18 <= p18LimitHz
// Winning level = highest passing level.
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

  // Also consider configuredUsableLfHz
  const configuredMinHz = isNum(configuredUsableLfHz) ? Number(configuredUsableLfHz) : null;
  const effectiveMinHz = configuredMinHz != null
    ? Math.max(validMinHz ?? 15, configuredMinHz)
    : validMinHz;

  const targets = definitions.map((definition) => {
    const p14TargetDb = definition.p14TargetDb;
    const flatCutoffDb = p14TargetDb - 3;

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
        limitHz: definition.p18LimitHz,
        responseTargetF3Hz: responseExtensionHz,
        capabilityTargetF3Hz: capabilityExtensionHz,
        responseBounded,
        capabilityBounded,
        achievedBounded: false,
        extensionHz: null,
        extensionHzRaw: null,
        passesFrequency: false,
      };
    }

    // Achieved P18 = max(responseF3, capabilityF3) — more restrictive crossing
    const extensionHz = Math.max(responseExtensionHz, capabilityExtensionHz);
    const achievedBounded = responseBounded && capabilityBounded;
    const designHz = resolveRp22DesignValue(18, extensionHz);

    return {
      level: definition.level,
      p14TargetDb,
      cutoffDb: flatCutoffDb,
      limitHz: definition.p18LimitHz,
      responseTargetF3Hz: responseExtensionHz,
      capabilityTargetF3Hz: capabilityExtensionHz,
      responseBounded,
      capabilityBounded,
      achievedBounded,
      extensionHz: designHz,
      extensionHzRaw: extensionHz,
      passesFrequency: designHz != null && designHz <= definition.p18LimitHz,
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
    source: "physically-qualified-operating-target-f3",
    note: "Achieved P18 from the more restrictive of response-target F3 and product-capability-target F3 at the selected P14 operating state (Method C).",
  };
}