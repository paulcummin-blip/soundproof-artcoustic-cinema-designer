// liveBassValidationReport.js — Pure, read-only report builder.
//
// Exports buildLiveBassValidationReport(): takes the CURRENT LIVE project
// runtime inputs and the CURRENT COMPLETED canonical result and returns a
// plain-text validation report string.
//
// This module is strictly read-only. It:
//   - Runs zero simulations and zero optimiser runs.
//   - Reads only from existing completed runtime data.
//   - Interpolates from the actual canonical arrays (not graph pixels).
//   - Applies the CURRENT selected P14 operating-level offset so the
//     exported 34/75/100 Hz rows match the live graph.
//   - Verifies the completed result matches the current active calibration
//     fingerprint via the existing production authority check before
//     exporting any canonical values.
//   - Emits "INCOMPLETE" for any field that cannot be sourced from the live
//     runtime instead of substituting synthetic data.
//
// It does NOT import or call any simulation, EQ, scoring, cache, worker, or
// graph module. The only imports are the P14 integration diagnostic (a pure
// closed-form calculation over the house-curve shape), the production
// authority validator, and the curve/filter signature builders (pure hash
// helpers).

import { diagnoseHouseCurveP14Integration } from "@/components/utils/p14HouseCurveNormalisation";
import {
  buildCurveSignature,
  buildFilterBankSignature,
} from "@/components/room/bass/bassResultAuthority";
import { finalOptimisedBassAuthorityMatches } from "@/components/room/bass/finalOptimisedBassResponse";

const PROBE_FREQS = [34, 75, 100];
const INCOMPLETE = "INCOMPLETE";

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v, digits = 4, fallback = INCOMPLETE) {
  const n = num(v);
  return n === null ? fallback : n.toFixed(digits);
}

function fmtCoord(v, digits = 3) {
  const n = num(v);
  return n === null ? INCOMPLETE : n.toFixed(digits);
}

// Linear interpolation from a canonical curve array. Each point is
// { frequency, spl } (or { frequency, offsetDb }). Returns null when the
// requested frequency is outside the curve's span so the caller can emit
// INCOMPLETE rather than extrapolating.
function interpolateSpl(curve, freq) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  const f = num(freq);
  if (f === null) return null;
  const points = curve
    .map((p) => ({ frequency: num(p?.frequency ?? p?.hz), spl: num(p?.spl ?? p?.offsetDb ?? p?.db) }))
    .filter((p) => p.frequency !== null && p.spl !== null)
    .sort((a, b) => a.frequency - b.frequency);
  if (points.length === 0) return null;
  if (f < points[0].frequency || f > points[points.length - 1].frequency) return null;
  let upperIndex = points.findIndex((p) => p.frequency >= f);
  if (upperIndex === -1) return null;
  if (upperIndex === 0) return points[0].spl;
  const low = points[upperIndex - 1];
  const high = points[upperIndex];
  if (high.frequency === low.frequency) return high.spl;
  const ratio = (f - low.frequency) / (high.frequency - low.frequency);
  return low.spl + (high.spl - low.spl) * ratio;
}

function sectionHeader(title) {
  return `\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`;
}

export function buildLiveBassValidationReport({
  roomDims,
  rspPosition,
  seatingPositions,
  sources,
  splConfig,
  requested,
  fingerprints,
  optimisationResult,
  lifecycle,
  designEqEnabled,
  rawRspCurve,
}) {
  const lines = [];
  const finalBassResponse = optimisationResult?.finalOptimisedBassResponse || null;
  const selectedCandidate = optimisationResult?.selectedCandidate || null;
  const calibrationFingerprint = fingerprints?.calibration || null;

  lines.push("ARTCOUSTIC LIVE BASS VALIDATION REPORT");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: current live project + current completed canonical result`);
  lines.push(`Note: read-only export. Zero simulations and zero optimiser runs triggered.`);

  // ── 0. Result validity check ──
  // The completed-result shape carries calibrationFingerprint (not a generic
  // fingerprint field). Validate using the same canonical authority the live
  // graph uses: finalOptimisedBassAuthorityMatches over the completed response.
  // Do NOT call validateCachedBassResult with the calibration fingerprint as a
  // generic fingerprint argument — that validator expects result.fingerprint,
  // which is absent from this completed-result shape.
  const calibrationFingerprintMatches = !!(
    optimisationResult?.calibrationFingerprint
    && calibrationFingerprint
    && optimisationResult.calibrationFingerprint === calibrationFingerprint
  );
  const canonicalAuthorityMatches = finalOptimisedBassAuthorityMatches(finalBassResponse);
  const resultIsValid = calibrationFingerprintMatches && canonicalAuthorityMatches;

  // ── 1. Runtime inputs ──
  lines.push(sectionHeader("1. RUNTIME INPUTS"));
  lines.push(`Room dimensions: ${fmtCoord(roomDims?.widthM)} x ${fmtCoord(roomDims?.lengthM)} x ${fmtCoord(roomDims?.heightM)} m`);
  lines.push(`RSP coordinates: x=${fmtCoord(rspPosition?.x)}, y=${fmtCoord(rspPosition?.y)}, z=${fmtCoord(rspPosition?.z)}`);

  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  lines.push(`Seat count: ${seats.length}`);
  seats.forEach((seat, i) => {
    const id = seat?.id || `${seat?.x}-${seat?.y}` || `seat-${i}`;
    lines.push(`  Seat ${id}: x=${fmtCoord(seat?.x)}, y=${fmtCoord(seat?.y)}, z=${fmtCoord(seat?.z)}`);
  });

  const subs = Array.isArray(sources) ? sources : [];
  lines.push(`Active subwoofer count: ${subs.length}`);
  subs.forEach((sub, i) => {
    const id = sub?.id || `sub-${i}`;
    const model = sub?.modelKey || INCOMPLETE;
    lines.push(`  Sub ${id}: model=${model}, x=${fmtCoord(sub?.x)}, y=${fmtCoord(sub?.y)}, z=${fmtCoord(sub?.z)}`);
  });

  const basis = splConfig?.selectedP14TargetBasis === "recommended" ? "recommended" : "minimum";
  // Explicit null guard: Number(null) === 0, which would coerce to L1 via `|| 1`.
  const rawLevel = splConfig?.selectedP14Level;
  const level = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const targetDb = num(requested?.selectedP14TargetDb);
  const extHz = num(requested?.selectedP14RequiredExtensionHz);
  lines.push(`Selected P14 basis: ${basis}`);
  lines.push(`Selected P14 level: ${level !== null ? `L${level}` : INCOMPLETE}`);
  lines.push(`Selected P14 target dBC: ${targetDb === null ? INCOMPLETE : targetDb.toFixed(4)}`);
  lines.push(`Required P18 extension Hz: ${extHz === null ? INCOMPLETE : extHz.toFixed(4)}`);
  lines.push(`Design EQ state: ${designEqEnabled ? "ENABLED" : "DISABLED"}`);
  lines.push(`Active calibration fingerprint: ${calibrationFingerprint || INCOMPLETE}`);
  lines.push(`Result calibration fingerprint: ${optimisationResult?.calibrationFingerprint || INCOMPLETE}`);
  lines.push(`Calibration fingerprint match: ${calibrationFingerprintMatches ? "PASS" : "FAIL"}`);
  lines.push(`Canonical completed-result authority: ${canonicalAuthorityMatches ? "PASS" : "FAIL"}`);
  lines.push(`Overall export authority: ${resultIsValid ? "VALID" : "INVALID"}`);
  if (!resultIsValid) {
    if (!calibrationFingerprintMatches && calibrationFingerprint) {
      lines.push(`Calibration fingerprint mismatch: result=${optimisationResult?.calibrationFingerprint || INCOMPLETE}, active=${calibrationFingerprint}`);
    }
    if (!canonicalAuthorityMatches) {
      lines.push(`Canonical authority mismatch: finalOptimisedBassResponse failed signature/candidate consistency check`);
    }
  }

  // ── 2. Operating-level offset resolution ──
  // Resolve the P14 integration diagnostic to obtain the selected operating
  // offset, then compute the operating-level offset applied to the live graph.
  const houseCurveShape = finalBassResponse?.canonicalHouseCurveShape || null;
  const canonicalVerticalOffsetDb = num(finalBassResponse?.canonicalVerticalOffsetDb);

  let p14Diagnostic = null;
  if (Array.isArray(houseCurveShape) && houseCurveShape.length > 0 && targetDb !== null && extHz !== null) {
    p14Diagnostic = diagnoseHouseCurveP14Integration({
      houseCurveShape,
      selectedP14TargetDb: targetDb,
      requiredExtensionHz: extHz,
      upperLfeHz: 120,
    });
  }
  const selectedOperatingOffsetDb = p14Diagnostic ? num(p14Diagnostic.operatingOffsetDb) : null;
  const operatingLevelOffsetDb = (selectedOperatingOffsetDb !== null && canonicalVerticalOffsetDb !== null)
    ? selectedOperatingOffsetDb - canonicalVerticalOffsetDb
    : null;

  lines.push(sectionHeader("2. OPERATING-LEVEL OFFSET"));
  lines.push(`canonicalVerticalOffsetDb: ${canonicalVerticalOffsetDb === null ? INCOMPLETE : canonicalVerticalOffsetDb.toFixed(4)}`);
  lines.push(`selected operatingOffsetDb: ${selectedOperatingOffsetDb === null ? INCOMPLETE : selectedOperatingOffsetDb.toFixed(4)}`);
  lines.push(`applied operatingLevelOffsetDb: ${operatingLevelOffsetDb === null ? INCOMPLETE : operatingLevelOffsetDb.toFixed(4)}`);

  // ── 3. Exact live RSP rows at 34 / 75 / 100 Hz ──
  lines.push(sectionHeader("3. EXACT LIVE RSP ROWS (operating-level shifted to match graph)"));
  // Raw SPL source: authoritative.rspRawCurve (the live RSP curve from the current simulation)
  // Target SPL source: finalBassResponse.canonicalHouseCurveShape + p14Diagnostic.operatingOffsetDb
  // Post-EQ SPL source: finalBassResponse.canonicalPostEqRsp
  // All shifted by operatingLevelOffsetDb (raw and post-EQ) or operatingOffsetDb (target).
  const rawCurve = Array.isArray(rawRspCurve) ? rawRspCurve : null;
  const postEqCurve = finalBassResponse?.canonicalPostEqRsp || null;

  lines.push(`Source arrays:`);
  lines.push(`  Raw: authoritative.rspRawCurve (${Array.isArray(rawCurve) ? rawCurve.length : INCOMPLETE} points)`);
  lines.push(`  Target: finalBassResponse.canonicalHouseCurveShape + operatingOffsetDb (${Array.isArray(houseCurveShape) ? houseCurveShape.length : INCOMPLETE} points)`);
  lines.push(`  Post-EQ: finalBassResponse.canonicalPostEqRsp (${Array.isArray(postEqCurve) ? postEqCurve.length : INCOMPLETE} points)`);

  if (!resultIsValid) {
    lines.push("");
    lines.push(`Canonical values: ${INCOMPLETE} (result is stale, mismatched or incomplete)`);
    lines.push(`Mismatch reason: ${!calibrationFingerprintMatches ? "calibration fingerprint mismatch" : "canonical authority mismatch"}`);
  } else {
    lines.push("");
    lines.push("Freq(Hz)  Raw SPL    Target SPL  EQ contrib  Post-EQ SPL  Residual");
    lines.push("--------  --------   ----------  ----------  -----------  --------");

    PROBE_FREQS.forEach((freq) => {
      const rawBase = interpolateSpl(rawCurve, freq);
      const targetBase = interpolateSpl(houseCurveShape, freq);
      const postEqBase = interpolateSpl(postEqCurve, freq);

      const shiftedRaw = (rawBase !== null && operatingLevelOffsetDb !== null) ? rawBase + operatingLevelOffsetDb : null;
      const shiftedTarget = (targetBase !== null && selectedOperatingOffsetDb !== null) ? targetBase + selectedOperatingOffsetDb : null;
      const shiftedPostEq = (postEqBase !== null && operatingLevelOffsetDb !== null) ? postEqBase + operatingLevelOffsetDb : null;

      const eqContrib = (shiftedPostEq !== null && shiftedRaw !== null) ? shiftedPostEq - shiftedRaw : null;
      const residual = (shiftedPostEq !== null && shiftedTarget !== null) ? shiftedPostEq - shiftedTarget : null;

      lines.push(
        `${freq.toString().padStart(8)}  ${
          (shiftedRaw === null ? INCOMPLETE : shiftedRaw.toFixed(4)).padStart(8)
        }   ${
          (shiftedTarget === null ? INCOMPLETE : shiftedTarget.toFixed(4)).padStart(10)
        }  ${
          (eqContrib === null ? INCOMPLETE : eqContrib.toFixed(4)).padStart(10)
        }  ${
          (shiftedPostEq === null ? INCOMPLETE : shiftedPostEq.toFixed(4)).padStart(11)
        }  ${
          (residual === null ? INCOMPLETE : residual.toFixed(4)).padStart(8)
        }`
      );
    });
  }

  // ── 4. Final selected filter bank ──
  lines.push(sectionHeader("4. FINAL SELECTED FILTER BANK"));
  const filterBank = finalBassResponse?.canonicalFilterBank || null;
  const filterBankSignature = finalBassResponse?.filterBankSignature || null;
  const selectedCandidateId = finalBassResponse?.selectedCandidateId || selectedCandidate?.candidateId || null;
  const startType = selectedCandidate?.startStrategy || selectedCandidate?.designEqFitProfile || null;

  if (!resultIsValid || !Array.isArray(filterBank) || filterBank.length === 0) {
    lines.push(`Filter bank: ${INCOMPLETE} (no valid completed canonical result)`);
  } else {
    lines.push(`Filter count: ${filterBank.length}`);
    lines.push("Idx  Freq(Hz)    Gain(dB)    Q        Enabled");
    lines.push("---  ---------   --------    ------   -------");
    filterBank.forEach((filter, i) => {
      lines.push(
        `${String(i).padStart(3)}  ${
          fmt(filter?.frequencyHz, 4, INCOMPLETE).padStart(9)
        }   ${
          fmt(filter?.gainDb, 4, INCOMPLETE).padStart(8)
        }    ${
          fmt(filter?.Q, 4, INCOMPLETE).padStart(6)
        }   ${filter?.enabled ? "true" : "false"}`
      );
    });
  }
  lines.push(`Filter-bank signature: ${resultIsValid ? (filterBankSignature || INCOMPLETE) : INCOMPLETE}`);
  lines.push(`Selected candidate ID: ${resultIsValid ? (selectedCandidateId || INCOMPLETE) : INCOMPLETE}`);
  lines.push(`Start type: ${resultIsValid ? (startType || INCOMPLETE) : INCOMPLETE}`);

  // ── 5. P14 integration proof ──
  lines.push(sectionHeader("5. P14 INTEGRATION PROOF"));
  if (!resultIsValid || !p14Diagnostic) {
    lines.push(`selectedP14TargetDb: ${targetDb === null ? INCOMPLETE : targetDb.toFixed(4)}`);
    lines.push(`requiredExtensionHz: ${extHz === null ? INCOMPLETE : extHz.toFixed(4)}`);
    lines.push(`includedBands: ${INCOMPLETE}`);
    lines.push(`operatingOffsetDb: ${INCOMPLETE}`);
    lines.push(`integratedCWeightedDb: ${INCOMPLETE}`);
    lines.push(`errorDb: ${INCOMPLETE}`);
  } else {
    lines.push(`selectedP14TargetDb: ${p14Diagnostic.selectedP14TargetDb !== null ? p14Diagnostic.selectedP14TargetDb.toFixed(4) : INCOMPLETE}`);
    lines.push(`requiredExtensionHz: ${p14Diagnostic.requiredExtensionHz !== null ? p14Diagnostic.requiredExtensionHz.toFixed(4) : INCOMPLETE}`);
    lines.push(`includedBands: ${Array.isArray(p14Diagnostic.includedBands) && p14Diagnostic.includedBands.length ? p14Diagnostic.includedBands.map((b) => `${b.frequencyHz} Hz`).join(", ") : INCOMPLETE}`);
    lines.push(`operatingOffsetDb: ${p14Diagnostic.operatingOffsetDb !== null ? p14Diagnostic.operatingOffsetDb.toFixed(4) : INCOMPLETE}`);
    lines.push(`integratedCWeightedDb: ${p14Diagnostic.integratedCWeightedDb !== null ? p14Diagnostic.integratedCWeightedDb.toFixed(4) : INCOMPLETE}`);
    lines.push(`errorDb: ${p14Diagnostic.errorDb !== null ? p14Diagnostic.errorDb.toFixed(4) : INCOMPLETE}`);
  }

  // ── 6. Runtime lifecycle evidence ──
  lines.push(sectionHeader("6. RUNTIME LIFECYCLE EVIDENCE"));
  const trace = Array.isArray(lifecycle?.lifecycleTrace) ? lifecycle.lifecycleTrace : [];
  const replacementRunCount = num(lifecycle?.replacementRunCount);
  const traceWorkerStarts = trace.filter((entry) => entry?.stage === "Worker created").length;
  const traceWorkerCompletions = trace.filter((entry) => entry?.stage === "Job marked complete").length;
  // No explicit lifetime worker counters exist in the lifecycle object; only
  // the bounded lifecycle trace is available. Label accurately — do not
  // present bounded trace counts as lifetime totals.
  lines.push(`Lifecycle trace worker starts: ${traceWorkerStarts}`);
  lines.push(`Lifecycle trace worker completions: ${traceWorkerCompletions}`);
  if (replacementRunCount !== null) {
    lines.push(`Replacement run count: ${replacementRunCount}`);
  }

  // ── 7. Signatures ──
  lines.push(sectionHeader("7. SIGNATURES"));
  const rawResponseSignature = finalBassResponse?.rawResponseSignature || null;
  const postEqCurveSignature = finalBassResponse?.postEqCurveSignature || null;
  const fbSignature = filterBankSignature || (Array.isArray(filterBank) && filterBank.length ? buildFilterBankSignature({ generatedFilterBank: filterBank }) : null);

  // Target signature: generated from the CURRENT selected P14 target curve
  // after applying the selected operating offset (house-curve shape + operatingOffsetDb).
  let targetSignature = null;
  if (resultIsValid && Array.isArray(houseCurveShape) && houseCurveShape.length && selectedOperatingOffsetDb !== null) {
    const shiftedTargetCurve = houseCurveShape.map((point) => ({
      frequency: num(point?.frequency ?? point?.hz),
      spl: (num(point?.spl ?? point?.offsetDb ?? point?.db) ?? 0) + selectedOperatingOffsetDb,
    })).filter((p) => p.frequency !== null);
    targetSignature = buildCurveSignature(shiftedTargetCurve);
  }

  lines.push(`Raw response-shape signature: ${resultIsValid ? (rawResponseSignature || INCOMPLETE) : INCOMPLETE}`);
  lines.push(`Post-EQ response-shape signature: ${resultIsValid ? (postEqCurveSignature || INCOMPLETE) : INCOMPLETE}`);
  lines.push(`Target signature (selected P14 target, operating-offset shifted): ${targetSignature || INCOMPLETE}`);
  lines.push(`Filter-bank signature: ${resultIsValid ? (fbSignature || INCOMPLETE) : INCOMPLETE}`);

  lines.push("");
  lines.push("END OF REPORT");
  return lines.join("\n");
}