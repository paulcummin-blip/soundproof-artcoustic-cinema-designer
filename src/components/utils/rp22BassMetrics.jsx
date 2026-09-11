// utils/rp22BassMetrics.jsx
// RP22 bass-derived Parameter 18 / 19 / 20 calculations that rely on the
// CURRENT bass engine output (BassResponseEngine). This file does NOT modify
// any acoustic maths — it only post-processes the existing per-seat
// { frequency, spl } response arrays that the engine already produces.
//
// Sources:
//   - BassResponseEngine.simulateResponseWithExtras(...) → responseData = [{ frequency, spl }]
//   - applyBassSmoothing(data, 'third') — display-only 1/3-octave smoothing.

import { applyBassSmoothing } from '../room/bass/bassGraphSmoothing';
import { applyDesignEqCurve, calculateDesignEqCurve } from "@/components/utils/designEqCalibration";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { getSpeakerModelMeta, getSubwooferCurve } from "@/components/models/speakers/registry";
import { levelP19_lfResponse, levelP20_lfConsistency, numericRp22Level } from "@/components/utils/rp22/levels";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { formatSplDisplay } from "@/components/utils/splDisplayFormatter";
import { computePhysicallyQualifiedP18Extension, computeResponseTargetF3 } from "@/components/utils/p18PhysicallyQualifiedAuthority";
export { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

export { applyDesignEqCurve, calculateDesignEqCurve };

// Shared P18/P19 reference band — the 60–200 Hz median used as the SPL plateau
// authority by BOTH P18 F3 calculation and P19 deviation reference. Keeping
// this as a single constant ensures P18 and P19 share the same reference
// baseline, preventing vertical reference drift between the two metrics.
export const P18_REFERENCE_BAND_HZ = [60, 200];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);


function toSplCurve(responseData) {
  if (!Array.isArray(responseData)) return [];
  const arr = [];
  for (let i = 0; i < responseData.length; i++) {
    const p = responseData[i];
    if (!p) continue;
    const f = Number(p.frequency);
    const s = Number(p.spl);
    if (isNum(f) && isNum(s)) arr.push({ frequency: f, spl: s });
  }
  return arr;
}

function smoothThird(curve) {
  if (!Array.isArray(curve) || curve.length === 0) return [];
  const smoothed = applyBassSmoothing(curve, 'third');
  // normalise + filter nulls produced by smoothing when data is too sparse
  const out = [];
  for (let i = 0; i < smoothed.length; i++) {
    const f = Number(smoothed[i].frequency);
    if (!isNum(f)) continue;
    const s = Number(smoothed[i].spl);
    if (!isNum(s)) continue;
    out.push({ frequency: f, spl: s });
  }
  return out;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const copy = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(copy.length / 2);
  return copy.length % 2 === 0
    ? (copy[mid - 1] + copy[mid]) / 2
    : copy[mid];
}


function valAt(curve, f) {
  if (!Array.isArray(curve) || curve.length === 0 || !isNum(f)) return null;
  if (f <= curve[0].frequency) return curve[0].spl;
  if (f >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (f >= curve[i].frequency && f <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const r = (f - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * r;
    }
  }
  return null;
}

// ── Legacy exports consumed by src/components/bass/bassSimulationEngine.jsx ──
// These pre-date the per-seat consumer above and operate on parallel
// freqsHz / splDb arrays (the format the simulation engine produces).
// Signatures are kept stable; only implementations are provided here.

const arrAt = (freqs, vals, f) => {
  if (!Array.isArray(freqs) || freqs.length === 0 || !Number.isFinite(f)) return null;
  if (f <= freqs[0]) return vals[0];
  if (f >= freqs[freqs.length - 1]) return vals[vals.length - 1];
  for (let i = 0; i < freqs.length - 1; i++) {
    if (f >= freqs[i] && f <= freqs[i + 1]) {
      const span = freqs[i + 1] - freqs[i];
      if (span === 0) return vals[i];
      const r = (f - freqs[i]) / span;
      return vals[i] + (vals[i + 1] - vals[i]) * r;
    }
  }
  return null;
};

// P14 — peak total LFE SPL capability in the requested band (Hz).
export function computeP14MaxLfeSpl({ freqsHz, splDb, band = [20, 80] }) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { maxSplDb: null, details: { band, samples: 0 } };
  }
  const [fLo, fHi] = band;
  const inBand = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] >= fLo && freqsHz[i] <= fHi && isNum(splDb[i])) inBand.push(splDb[i]);
  }
  if (inBand.length === 0) return { maxSplDb: null, details: { band, samples: 0 } };
  const maxSplDb = Math.max(...inBand);
  return { maxSplDb, details: { band, samples: inBand.length } };
}

// P18 — in-room -3 dB extension frequency.
// Walks from low to high and finds the lowest frequency where the smoothed
// response reaches -3 dB relative to the per-frequency target, staying above.
export function computeP18InRoomF3({ freqsHz, splDb, targetDb, minHz = 10, maxHz = 200 }) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { f3Hz: null, details: { samples: 0 } };
  }
  // Reference level = median of splDb in the shared P18/P19 reference band.
  const refIdxs = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] >= P18_REFERENCE_BAND_HZ[0] && freqsHz[i] <= P18_REFERENCE_BAND_HZ[1] && isNum(splDb[i])) refIdxs.push(i);
  }
  const refVals = (refIdxs.length > 0 ? refIdxs : freqsHz.map((_, i) => i))
    .map((i) => splDb[i])
    .filter(isNum);
  const refDb = median(refVals);
  if (!isNum(refDb)) return { f3Hz: null, details: { samples: 0 } };
  const cutoffDb = refDb - 3;

  // Walk from low to high; first bin at/above cutoff within [minHz,maxHz].
  let f3 = null;
  for (let i = 0; i < freqsHz.length; i++) {
    const f = freqsHz[i];
    if (f < minHz || f > maxHz) continue;
    if (!isNum(splDb[i])) continue;
    if (splDb[i] >= cutoffDb) { f3 = f; break; }
  }
  return { f3Hz: f3, details: { refDb, cutoffDb, samples: freqsHz.length } };
}

// ── Shared P18 F3 authority — METHOD A (60–200 Hz median, no transition cap) ──
//
// Operates on {frequency, spl} response curves (the canonical authority format).
// This is the SAME proven method as computeP18InRoomF3, refactored to work on
// the curve format used by the canonical bass authority.
//
//   1. 1/3-octave smooth the confirmed operating response.
//   2. refDb = median of the smoothed response over 60–200 Hz.
//   3. cutoffDb = refDb − 3.
//   4. F3 = sustained extension walk (lowest freq where spl sustains >= cutoff).
//
// The 60–200 Hz band is fixed and deliberately NOT capped at the room transition.
// Diagnostic evidence confirmed this band is robust to isolated modes, broad
// modal humps, and small-room transition bleed. A narrower transition-capped
// band was tested and REJECTED because modal structure inside the narrow band
// inflated the reference and produced false F3 failures.
//
// P18 reference-band selection (this function) and P19/P20 grading-band
// selection (bassAssessmentBandAuthority) are separate authorities.
export function computeInRoomF3FromResponseCurve(curve, validMinHz = null) {
  const empty = { f3Hz: null, refDb: null, cutoffDb: null, achievedExtensionBounded: false, extensionUpperBoundHz: null };
  if (!Array.isArray(curve) || curve.length === 0) return empty;
  const smoothed = smoothThird(toSplCurve(curve));
  if (!smoothed.length) return empty;
  // Shared P18/P19 reference band (60–200 Hz) — METHOD A, no transition cap.
  const refPoints = smoothed.filter((p) => p.frequency >= P18_REFERENCE_BAND_HZ[0] && p.frequency <= P18_REFERENCE_BAND_HZ[1]);
  const refValues = (refPoints.length > 0 ? refPoints : smoothed).map((p) => p.spl).filter(isNum);
  const refDb = median(refValues);
  if (!isNum(refDb)) return empty;
  const cutoffDb = refDb - 3;

  // P18 valid lower bound: respects both the simulation grid and product
  // capability authority. Frequencies below this floor are not authoritative —
  // a response still above cutoff here is a BOUNDED result (extension is at or
  // below the floor), not a measured -3 dB crossing. This prevents the
  // simulation grid edge (e.g. 15 Hz) from being reported as an exact crossing
  // when the product has no engineering data there.
  const curveMinHz = smoothed[0].frequency;
  const floorHz = Number.isFinite(Number(validMinHz)) && Number(validMinHz) > 0
    ? Math.max(Number(validMinHz), curveMinHz)
    : curveMinHz;

  const points = smoothed.filter((p) => p.frequency <= 200 && isNum(p.spl) && p.frequency >= floorHz);
  if (!points.length) {
    return { f3Hz: null, refDb, cutoffDb, achievedExtensionBounded: true, extensionUpperBoundHz: floorHz };
  }

  // Case B: response is still above cutoff at the lowest valid frequency.
  // No downward -3 dB crossing exists inside the valid range — the extension
  // is bounded by the floor, not measured. Returning the grid edge as an exact
  // crossing would manufacture a false P18 result.
  if (points[0].spl >= cutoffDb) {
    return { f3Hz: null, refDb, cutoffDb, achievedExtensionBounded: true, extensionUpperBoundHz: floorHz };
  }

  // Case A/C: search upward for the first sustained crossing of cutoffDb.
  // LOCAL 1/3-octave sustained crossing — narrow-spike protection prevents a
  // single-point spike from faking extension, while a distant null at
  // 90/120/170 Hz may make P19/P20 worse but must not erase a legitimate
  // 20 Hz P18 extension.
  let f3Hz = null;
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].spl < cutoffDb) continue;
    // Local 1/3-octave window: [crossing, crossing × 2^(1/3)].
    const windowEndHz = points[index].frequency * Math.pow(2, 1 / 3);
    let sustained = true;
    for (let j = index; j < points.length; j += 1) {
      if (points[j].frequency > windowEndHz) break;
      if (points[j].spl < cutoffDb) { sustained = false; break; }
    }
    if (!sustained) continue;
    // Interpolate the exact crossing from the previous point.
    const previous = points[index - 1];
    if (!previous || previous.spl >= cutoffDb) { f3Hz = points[index].frequency; break; }
    const ratio = (cutoffDb - previous.spl) / (points[index].spl - previous.spl);
    f3Hz = previous.frequency + (points[index].frequency - previous.frequency) * ratio;
    break;
  }
  return { f3Hz, refDb, cutoffDb, achievedExtensionBounded: false, extensionUpperBoundHz: null };
}

// P19 — direct maximum absolute response-to-target deviation below Schroeder frequency.
export function computeP19DeviationBelowSchroeder({ freqsHz, splDb, targetDb, schroederHz }) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { resultDb: null, details: { samples: 0 } };
  }
  if (!isNum(schroederHz) || schroederHz <= 0) {
    return { resultDb: null, details: { samples: 0 } };
  }
  // If targetDb is an array (one value per freq), compare directly; else treat as scalar flat target.
  const tgtArr = Array.isArray(targetDb) && targetDb.length === freqsHz.length;
  let maxDev = 0;
  let used = 0;
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] > schroederHz) continue;
    if (!isNum(splDb[i])) continue;
    const ref = tgtArr ? targetDb[i] : targetDb;
    if (!isNum(ref)) continue;
    const d = Math.abs(splDb[i] - ref);
    if (d > maxDev) maxDev = d;
    used++;
  }
  return {
    resultDb: used > 0 ? maxDev : null,
    totalDifferenceDbRaw: used > 0 ? maxDev : null,
    details: { schroederHz, samples: used },
  };
}

export function computeTransitionFrequencyHz(roomDims, rt60 = 0.4) {
  const w = Number(roomDims?.widthM ?? roomDims?.width);
  const l = Number(roomDims?.lengthM ?? roomDims?.length);
  const h = Number(roomDims?.heightM ?? roomDims?.height);
  if (!isNum(w) || !isNum(l) || !isNum(h) || w <= 0 || l <= 0 || h <= 0) return null;
  const V = w * l * h;
  if (!isNum(V) || V <= 0) return null;
  const fs = 2000 * Math.sqrt(Math.max(rt60, 0.05) / V);
  return isNum(fs) && fs > 0 ? fs : null;
}

// Shared Design EQ transform lives in designEqCalibration.js. It is consumed by
// both P14 scoring and the Bass Response graph so the displayed and assessed
// post-calibration curves always remain identical.

// Parameter 14 — LFE total SPL capability at RSP (post design-EQ), 1/3-octave
// smoothed. Design EQ (when enabled) shapes the curve toward the Artcoustic
// house curve, bounded by +6 dB boost / -10 dB cut — it never "repairs" a
// narrow raw null, since it only ever operates on the already-smoothed curve.
export function computeParam14LfeCapability(rspResponse, designEqEnabled, band = [20, 120], usableLfHz, activeSubs = []) {
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;
  const curve = toSplCurve(rspResponse);
  if (curve.length === 0) return null;

  const smoothed = smoothThird(curve);
  if (smoothed.length === 0) return null;

  const evalCurve = designEqEnabled
    ? applyDesignEqCurve(rspResponse, usableLfHz, activeSubs)
    : smoothed;

  const [fLo, fHi] = band;
  const inBand = evalCurve.filter((p) => p.frequency >= fLo && p.frequency <= fHi);
  const bandUsed = inBand.length > 0 ? inBand : evalCurve;
  const minSpl = Math.min(...bandUsed.map((p) => p.spl));
  if (!isNum(minSpl)) return null;

  // Sound Proof 1 dB favourable ceil — higher-is-better SPL capability (Group B).
  const designSpl = resolveRp22DesignValue(14, minSpl);

  let level = 0;
  if (designSpl >= 123) level = 4;
  else if (designSpl >= 120) level = 3;
  else if (designSpl >= 117) level = 2;
  else if (designSpl >= 114) level = 1;

  return {
    value: designSpl,
    rawValue: minSpl,
    level: level >= 1 ? `L${level}` : null,
    formatted: formatSplDisplay(designSpl),
    designEqEnabled: !!designEqEnabled,
    band,
    note: 'Post-EQ design estimate at RSP using selected subwoofer product data.',
  };
}

function productCurveForSub(sub) {
  const modelKey = sub?.modelKey ?? sub?.model;
  const curve = getSubwooferCurve(modelKey);
  const meta = getSpeakerModelMeta(modelKey);
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const usableLfHz = Number(meta?.bassCapability?.usableLF_neg6dB);
  return {
    usableLfHz: Number.isFinite(usableLfHz) ? usableLfHz : null,
    curve: curve.map((point) => ({ frequency: Number(point.hz), spl: Number(point.db) })),
  };
}

function interpolateProductCurve(curve, frequency) {
  if (frequency < curve[0].frequency || frequency > curve[curve.length - 1].frequency) return null;
  return valAt(curve, frequency);
}

export function computeParam18ProductExtension(activeSubs, configuredUsableLfHz = null, p14TargetBasis = "minimum") {
  const products = (activeSubs || []).map(productCurveForSub);
  if (!products.length || products.some((product) => !product)) return null;
  const productLfLimits = products.map((product) => product.usableLfHz).filter(isNum);
  const physicalLfHz = Math.max(
    isNum(configuredUsableLfHz) ? Number(configuredUsableLfHz) : 0,
    productLfLimits.length ? Math.max(...productLfLimits) : 0,
  );
  const frequencies = [...new Set([
    physicalLfHz,
    ...products.flatMap((product) => product.curve.map((point) => point.frequency)),
  ])]
    .filter((frequency) => frequency >= physicalLfHz)
    .sort((a, b) => a - b);
  const productCapabilityCurve = frequencies.map((frequency) => {
    const values = products.map((product) => interpolateProductCurve(product.curve, frequency));
    if (values.some((value) => !isNum(value))) return null;
    const spl = 10 * Math.log10(values.reduce((sum, value) => sum + Math.pow(10, value / 10), 0));
    return { frequency, spl };
  }).filter(Boolean);
  if (!productCapabilityCurve.length) return null;

  const targets = getRp22BassOperatingDefinitions(p14TargetBasis).map((definition) => {
    const cutoffDb = definition.p18CutoffDb;
    let extensionHz = null;
    if (productCapabilityCurve[0].spl >= cutoffDb) {
      extensionHz = productCapabilityCurve[0].frequency;
    } else {
      for (let index = 0; index < productCapabilityCurve.length - 1; index += 1) {
        const low = productCapabilityCurve[index];
        const high = productCapabilityCurve[index + 1];
        if (low.spl < cutoffDb && high.spl >= cutoffDb) {
          const ratio = (cutoffDb - low.spl) / (high.spl - low.spl);
          extensionHz = Math.max(physicalLfHz, low.frequency + (high.frequency - low.frequency) * ratio);
          break;
        }
      }
    }
    return {
      level: definition.level,
      targetSplDb: definition.p14TargetDb,
      cutoffDb,
      limitHz: definition.p18LimitHz,
      extensionHz,
      bounded: extensionHz === productCapabilityCurve[0].frequency,
      passesFrequency: extensionHz != null && extensionHz <= definition.p18LimitHz,
    };
  });
  const winningTarget = targets.slice().reverse().find((target) => target.passesFrequency) || null;
  return {
    targets,
    level: winningTarget?.level || null,
    value: winningTarget?.extensionHz ?? null,
    formatted: winningTarget == null ? null : `${Math.round(winningTarget.extensionHz)} Hz`,
    physicalLfHz,
    productCapabilityCurve,
    source: "power-summed-authoritative-product-capability",
    note: "Physical product extension; room response, boundary gain, modal gain and EQ are excluded.",
  };
}

function sustainedExtensionAtCutoff(curve, cutoffDb, upperHz = 120) {
  const points = smoothThird(toSplCurve(curve)).filter((point) => point.frequency <= upperHz);
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].spl < cutoffDb) continue;
    // Local 1/3-octave window: [crossing, crossing × 2^(1/3)].
    const windowEndHz = points[index].frequency * Math.pow(2, 1 / 3);
    let sustained = true;
    for (let j = index; j < points.length; j += 1) {
      if (points[j].frequency > windowEndHz) break;
      if (points[j].spl < cutoffDb) { sustained = false; break; }
    }
    if (!sustained) continue;
    const previous = points[index - 1];
    if (!previous || previous.spl >= cutoffDb) return points[index].frequency;
    const ratio = (cutoffDb - previous.spl) / (points[index].spl - previous.spl);
    return previous.frequency + (points[index].frequency - previous.frequency) * ratio;
  }
  return null;
}

// P18 achieved extension — Method C (physically qualified operating-target F3).
//
// Replaces the former Method A (60–200 Hz self-referenced median). The achieved
// P18 is now the more restrictive of:
//   - response-target F3: lowest f where response(f) >= target(f) - 3
//   - capability-target F3: lowest f where productLimit(f) >= target(f) - 3
//
// Per-seat extensions are retained as diagnostics but do NOT override the RSP
// response F3 in the achieved P18. P20 handles seat-to-seat consistency.
export function computeParam18AchievedExtension({ rspPostEqCurve, perSeatPostEqCurves = [], activeSubs = [], configuredUsableLfHz = null, p14TargetBasis = "minimum" }) {
  if (!Array.isArray(rspPostEqCurve) || !rspPostEqCurve.length) return null;

  // Delegate to the canonical Method C authority.
  const methodC = computePhysicallyQualifiedP18Extension({
    rspPostEqCurve,
    activeSubs,
    configuredUsableLfHz,
    p14TargetBasis,
  });
  if (!methodC) return null;

  // Compute per-seat target-relative F3s as diagnostics (not authoritative for P18).
  const seatCurves = (perSeatPostEqCurves || []).filter((seat) => Array.isArray(seat?.responseData) && seat.responseData.length);
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
  const seatF3Results = seatCurves.map((seat) => {
    const seatF3 = computeResponseTargetF3(seat.responseData, methodC.targets[0]?.p14TargetDb, validMinHz);
    const seatExtensionHz = seatF3.bounded ? seatF3.upperBoundHz : seatF3.f3Hz;
    return { seatId: seat.seatId, extensionHz: seatExtensionHz, achievedExtensionBounded: seatF3.bounded };
  });

  // Merge per-seat diagnostics into the Method C targets.
  const targets = methodC.targets.map((target) => {
    const seatExtensions = seatF3Results.map((seat) => ({ seatId: seat.seatId, extensionHz: seat.extensionHz }));
    const worstSeat = seatExtensions.filter((seat) => isNum(seat.extensionHz)).sort((a, b) => b.extensionHz - a.extensionHz)[0] || null;
    return {
      ...target,
      worstSeatId: worstSeat?.seatId ?? null,
      worstSeatExtensionHz: worstSeat?.extensionHz ?? null,
    };
  });

  const winningTarget = targets.slice().reverse().find((t) => t.passesFrequency) || null;
  return {
    targets,
    level: winningTarget?.level || methodC.level,
    value: winningTarget?.extensionHz ?? methodC.value,
    formatted: methodC.formatted,
    refDb: null,
    cutoffDb: null,
    responseTargetF3Hz: methodC.responseTargetF3Hz,
    capabilityTargetF3Hz: methodC.capabilityTargetF3Hz,
    achievedExtensionBounded: methodC.achievedExtensionBounded,
    extensionUpperBoundHz: methodC.extensionUpperBoundHz,
    productCapability: { productCapabilityCurve: null, source: "physically-qualified-authority" },
    source: methodC.source,
    note: methodC.note,
  };
}

// P18 in-room extension authority — Method C (physically qualified operating-target F3).
//
// Replaces the former Method A (60–200 Hz self-referenced median). The achieved
// P18 is now the more restrictive of:
//   - response-target F3: lowest f where response(f) >= target(f) - 3
//   - capability-target F3: lowest f where productLimit(f) >= target(f) - 3
//
// The second positional argument is retained for backward compatibility with
// callers that passed bassP14 or productCurveMinHz; it is no longer used.
// activeSubs and configuredUsableLfHz enable the capability-target F3.
// When activeSubs is empty, the result uses the response-target F3 alone.
export function computeParam18BassExtension(rspResponse, _legacyArg = null, activeSubs = [], configuredUsableLfHz = null, p14TargetBasis = "minimum") {
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;

  // Delegate to the canonical Method C authority when active subs are available.
  const subs = Array.isArray(activeSubs) ? activeSubs : [];
  if (subs.length > 0) {
    return computePhysicallyQualifiedP18Extension({
      rspPostEqCurve: rspResponse,
      activeSubs: subs,
      configuredUsableLfHz,
      p14TargetBasis,
    });
  }

  // Response-only fallback (no active subs → no capability F3).
  // Still uses the target-relative F3 (Method C response path), NOT Method A.
  const definitions = getRp22BassOperatingDefinitions(p14TargetBasis);
  const targets = definitions.map((definition) => {
    const responseF3 = computeResponseTargetF3(rspResponse, definition.p14TargetDb, null);
    const extensionHz = responseF3.bounded ? responseF3.upperBoundHz : responseF3.f3Hz;
    const designHz = resolveRp22DesignValue(18, extensionHz);
    return {
      level: definition.level,
      targetSplDb: definition.p14TargetDb,
      cutoffDb: definition.p14TargetDb - 3,
      refDb: null,
      limitHz: definition.p18LimitHz,
      extensionHz: designHz,
      extensionHzRaw: extensionHz,
      bounded: responseF3.bounded,
      passesFrequency: designHz != null && designHz <= definition.p18LimitHz,
    };
  });
  const winningTarget = targets.slice().reverse().find((t) => t.passesFrequency) || null;
  return {
    targets,
    level: winningTarget?.level || null,
    value: winningTarget?.extensionHz ?? null,
    formatted: winningTarget ? `${winningTarget.extensionHz} Hz` : null,
    refDb: null,
    cutoffDb: null,
    source: "physically-qualified-operating-target-f3-response-only",
    note: "Achieved P18 from response-target F3 (Method C). No capability F3 — no active subwoofers provided.",
  };
}

// Parameter 19 — Frequency response below transition frequency at RSP, relative
// to target curve (1/3-octave smoothing).
//
//  Target curve: with no user-selectable target in the app yet, we use the
//  median SPL of the 1/3-octave smoothed RSP curve (i.e. flat-target) across
//  the smoothed bass band. Max absolute deviation below the transition
//  frequency is returned.
export function computeParam19Deviation(rspResponse, transitionHz, lowerHz = null) {
  if (!isNum(transitionHz) || transitionHz <= 0) return null;
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;
  const curve = toSplCurve(rspResponse);
  if (curve.length === 0) return null;

  const smoothed = smoothThird(curve);
  if (smoothed.length === 0) return null;

  // Shared P18/P19 reference band (60–200 Hz) — same authority as P18 F3.
  const bandHigh = smoothed.filter((p) => p.frequency >= P18_REFERENCE_BAND_HZ[0] && p.frequency <= P18_REFERENCE_BAND_HZ[1]);
  const bandUsed = bandHigh.length > 0 ? bandHigh : smoothed;
  const refDb = median(bandUsed.map((p) => p.spl));
  if (!isNum(refDb)) return null;

  // Assessment band: [achieved P18 → transition]. When lowerHz is provided
  // (the achieved P18 F3), filter out points below it. Falls back to no
  // lower bound only when lowerHz is null/invalid (legacy callers).
  const hasLower = isNum(lowerHz) && lowerHz > 0;
  const below = smoothed.filter((p) => p.frequency <= transitionHz && (!hasLower || p.frequency >= lowerHz));
  if (below.length === 0) return null;

  let rawMaxDev = 0;
  for (let i = 0; i < below.length; i++) {
    const d = Math.abs(below[i].spl - refDb);
    if (d > rawMaxDev) rawMaxDev = d;
  }
  // RP22 P19 is the direct maximum absolute response-to-target deviation.
  // Preserve full precision for grading; display rounding is neutral.
  const variationDbRaw = Math.abs(rawMaxDev);
  const maxDev = resolveRp22DesignValue(19, variationDbRaw);
  const level = levelP19_lfResponse(variationDbRaw).level;

  return {
    maxDevDb: maxDev,
    rawMaxDev: variationDbRaw,
    totalDifferenceDbRaw: rawMaxDev,
    targetDb: refDb,
    transitionHz,
    level,
    status: level === "FAIL" ? "fail" : "ok",
    formatted: `±${maxDev} dB`,
    note: 'Calculated from 1/3-octave smoothed predicted response.',
  };
}

function levelForDeviation(dev) {
  return numericRp22Level(levelP20_lfConsistency(dev));
}

// Parameter 20 — Seat-to-seat frequency response below transition, relative to
// RSP, per seat, 1/3-octave smoothing. The worst (non-RSP) seat result is the
// achieved room value.
export function computeParam20SeatConsistency({ rspResponse, perSeatResponses, transitionHz, rspSeatId, lowerHz = null }) {
  if (!isNum(transitionHz) || transitionHz <= 0) return null;
  if (!Array.isArray(rspResponse) || rspResponse.length === 0) return null;

  const rspSmoothed = smoothThird(toSplCurve(rspResponse));
  if (rspSmoothed.length === 0) return null;

  // Assessment band: [achieved P18 → transition]. When lowerHz is provided
  // (the achieved P18 F3), filter out points below it.
  const hasLower = isNum(lowerHz) && lowerHz > 0;
  const rspBandFreqs = rspSmoothed
    .filter((p) => p.frequency <= transitionHz && (!hasLower || p.frequency >= lowerHz))
    .map((p) => p.frequency);
  if (rspBandFreqs.length === 0) return null;

  const perSeat = [];
  for (let i = 0; i < (perSeatResponses || []).length; i++) {
    const entry = perSeatResponses[i];
    if (!entry || !Array.isArray(entry.responseData) || entry.responseData.length === 0) continue;
    // P20 measures seat-to-seat consistency across REAL seats only.
    // The synthetic "rsp" response (measured at the green RSP marker) is the
    // reference curve, not a real seat — exclude it from the comparison set.
    if (entry.seatId === "rsp" || entry.__isSyntheticRsp === true) continue;
    const seatCurve = smoothThird(toSplCurve(entry.responseData));
    if (seatCurve.length === 0) continue;

    let maxDev = 0;
    for (let j = 0; j < rspBandFreqs.length; j++) {
      const f = rspBandFreqs[j];
      const rspSpl = valAt(rspSmoothed, f);
      const seatSpl = valAt(seatCurve, f);
      if (rspSpl != null && seatSpl != null) {
        const d = Math.abs(seatSpl - rspSpl);
        if (d > maxDev) maxDev = d;
      }
    }
    const isRsp = rspSeatId != null && String(entry.seatId) === String(rspSeatId);
    const dev = isRsp ? 0 : maxDev;
    const designDev = resolveRp22DesignValue(20, dev);
    perSeat.push({
      seatId: entry.seatId,
      isPrimary: !!entry.isPrimary,
      isRsp,
      deviationDb: designDev,
      deviationDbRaw: dev,
      totalSeatToRspDifferenceDbRaw: isRsp ? 0 : maxDev,
      level: levelForDeviation(dev),
    });
  }
  if (perSeat.length === 0) return null;

  // Seat-to-seat consistency requires at least 2 real seats. With fewer than
  // 2 real seats there is nothing to compare (the RSP reference alone is not a
  // "seat-to-seat" measurement), so report no_data.
  if (perSeat.length < 2) return null;

  const other = perSeat.filter((s) => !s.isRsp);
  // Worst (max deviation) across non-RSP seats; fall back to RSP with single seat config.
  let worst = null;
  if (other.length > 0) {
    worst = other.reduce((acc, s) => s.deviationDb > (acc ? acc.deviationDb : -Infinity) ? s : acc, null);
  } else {
    worst = perSeat[0] || null;
  }
  if (!worst) return null;

  const worstDev = worst.deviationDb;
  const worstLevel = levelForDeviation(worstDev);

  return {
    perSeat,
    rspSeatId,
    worstSeatId: worst.seatId,
    worstSeatDeviationDb: worstDev,
    worstSeatLevel: worstLevel,
    transitionHz,
    isSingleSeat: other.length === 0,
    note: 'Seat-to-seat consistency relative to RSP using 1/3-octave smoothing.',
  };
}