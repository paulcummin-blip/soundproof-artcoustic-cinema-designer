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
//   - Emits "INCOMPLETE" for any field that cannot be sourced from the live
//     runtime instead of substituting synthetic data.
//
// It does NOT import or call any simulation, EQ, authority, scoring, cache,
// worker, or graph module. The only imports are the P14 integration
// diagnostic (a pure closed-form calculation over the house-curve shape) and
// the curve/filter signature builders (pure hash helpers).

import { diagnoseHouseCurveP14Integration } from "@/components/utils/p14HouseCurveNormalisation";
import { buildCurveSignature, buildFilterBankSignature } from "@/components/room/bass/bassResultAuthority";

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
  const level = Math.max(1, Math.min(4, Math.round(Number(splConfig?.selectedP14Level) || 1)));
  const targetDb = num(requested?.selectedP14TargetDb);
  const extHz = num(requested?.selectedP14RequiredExtensionHz);
  lines.push(`Selected P14 basis: ${basis}`);
  lines.push(`Selected P14 level: L${level}`);
  lines.push(`Selected P14 target dBC: ${targetDb === null ? INCOMPLETE : targetDb.toFixed(4)}`);
  lines.push(`Required P18 extension Hz: ${extHz === null ? INCOMPLETE : extHz.toFixed(4)}`);
  lines.push(`Design EQ state: ${designEqEnabled ? "ENABLED" : "DISABLED"}`);
  lines.push(`Calibration fingerprint: ${calibrationFingerprint || INCOMPLETE}`);

  // ── 2. Exact live RSP rows at 34 / 75 / 100 Hz ──
  lines.push(sectionHeader("2. EXACT LIVE RSP ROWS (interpolated from canonical arrays)"));
  // Raw SPL source: authoritative.rspRawCurve (the live RSP curve from the current simulation)
  // Target SPL source: finalBassResponse.canonicalTargetCurve
  // Post-EQ SPL source: finalBassResponse.canonicalPostEqRsp
  const rawCurve = Array.isArray(rawRspCurve) ? rawRspCurve : null;
  const targetCurve = finalBassResponse?.canonicalTargetCurve || null;
  const postEqCurve = finalBassResponse?.canonicalPostEqRsp || null;

  lines.push(`Source arrays:`);
  lines.push(`  Raw: authoritative.rspRawCurve (${Array.isArray(rawCurve) ? rawCurve.length : "n/a"} points)`);
  lines.push(`  Target: finalBassResponse.canonicalTargetCurve (${Array.isArray(targetCurve) ? targetCurve.length : "n/a"} points)`);
  lines.push(`  Post-EQ: finalBassResponse.canonicalPostEqRsp (${Array.isArray(postEqCurve) ? postEqCurve.length : "n/a"} points)`);

  lines.push("");
  lines.push("Freq(Hz)  Raw SPL    Target SPL  EQ contrib  Post-EQ SPL  Residual");
  lines.push("--------  --------   ----------  ----------  -----------  --------");

  PROBE_FREQS.forEach((freq) => {
    const raw = interpolateSpl(rawCurve, freq);
    const target = interpolateSpl(targetCurve, freq);
    const postEq = interpolateSpl(postEqCurve, freq);
    const eqContrib = (raw !== null && postEq !== null) ? (postEq - raw) : null;
    const residual = (postEq !== null && target !== null) ? (postEq - target) : null;
    lines.push(
      `${freq.toString().padStart(8)}  ${
        (raw === null ? INCOMPLETE : raw.toFixed(4)).padStart(8)
      }   ${
        (target === null ? INCOMPLETE : target.toFixed(4)).padStart(10)
      }  ${
        (eqContrib === null ? INCOMPLETE : eqContrib.toFixed(4)).padStart(10)
      }  ${
        (postEq === null ? INCOMPLETE : postEq.toFixed(4)).padStart(11)
      }  ${
        (residual === null ? INCOMPLETE : residual.toFixed(4)).padStart(8)
      }`
    );
  });

  // ── 3. Final selected filter bank ──
  lines.push(sectionHeader("3. FINAL SELECTED FILTER BANK"));
  const filterBank = finalBassResponse?.canonicalFilterBank || null;
  const filterBankSignature = finalBassResponse?.filterBankSignature || null;
  const selectedCandidateId = finalBassResponse?.selectedCandidateId || selectedCandidate?.candidateId || null;
  const startType = selectedCandidate?.startStrategy || selectedCandidate?.designEqFitProfile || null;

  if (!Array.isArray(filterBank) || filterBank.length === 0) {
    lines.push(`Filter bank: ${INCOMPLETE} (no completed canonical result)`);
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
  lines.push(`Filter-bank signature: ${filterBankSignature || INCOMPLETE}`);
  lines.push(`Selected candidate ID: ${selectedCandidateId || INCOMPLETE}`);
  lines.push(`Start type: ${startType || INCOMPLETE}`);

  // ── 4. P14 integration proof ──
  lines.push(sectionHeader("4. P14 INTEGRATION PROOF"));
  const houseCurveShape = finalBassResponse?.canonicalHouseCurveShape || null;
  if (!Array.isArray(houseCurveShape) || houseCurveShape.length === 0 || targetDb === null || extHz === null) {
    lines.push(`selectedP14TargetDb: ${targetDb === null ? INCOMPLETE : targetDb.toFixed(4)}`);
    lines.push(`requiredExtensionHz: ${extHz === null ? INCOMPLETE : extHz.toFixed(4)}`);
    lines.push(`includedBands: ${INCOMPLETE}`);
    lines.push(`operatingOffsetDb: ${INCOMPLETE}`);
    lines.push(`integratedCWeightedDb: ${INCOMPLETE}`);
    lines.push(`errorDb: ${INCOMPLETE}`);
  } else {
    const diag = diagnoseHouseCurveP14Integration({
      houseCurveShape,
      selectedP14TargetDb: targetDb,
      requiredExtensionHz: extHz,
      upperLfeHz: 120,
    });
    lines.push(`selectedP14TargetDb: ${diag.selectedP14TargetDb !== null ? diag.selectedP14TargetDb.toFixed(4) : INCOMPLETE}`);
    lines.push(`requiredExtensionHz: ${diag.requiredExtensionHz !== null ? diag.requiredExtensionHz.toFixed(4) : INCOMPLETE}`);
    lines.push(`includedBands: ${Array.isArray(diag.includedBands) && diag.includedBands.length ? diag.includedBands.map((b) => `${b.frequencyHz} Hz`).join(", ") : INCOMPLETE}`);
    lines.push(`operatingOffsetDb: ${diag.operatingOffsetDb !== null ? diag.operatingOffsetDb.toFixed(4) : INCOMPLETE}`);
    lines.push(`integratedCWeightedDb: ${diag.integratedCWeightedDb !== null ? diag.integratedCWeightedDb.toFixed(4) : INCOMPLETE}`);
    lines.push(`errorDb: ${diag.errorDb !== null ? diag.errorDb.toFixed(4) : INCOMPLETE}`);
  }

  // ── 5. Runtime lifecycle evidence ──
  lines.push(sectionHeader("5. RUNTIME LIFECYCLE EVIDENCE"));
  const trace = Array.isArray(lifecycle?.lifecycleTrace) ? lifecycle.lifecycleTrace : [];
  const workerStartCount = trace.filter((entry) => entry?.stage === "Worker created").length;
  const workerCompletionCount = trace.filter((entry) => entry?.stage === "Job marked complete").length;
  lines.push(`Worker start count: ${workerStartCount}`);
  lines.push(`Worker completion count: ${workerCompletionCount}`);

  const rawResponseSignature = finalBassResponse?.rawResponseSignature || null;
  const postEqCurveSignature = finalBassResponse?.postEqCurveSignature || null;
  const targetSignature = Array.isArray(targetCurve) && targetCurve.length ? buildCurveSignature(targetCurve) : null;
  const fbSignature = filterBankSignature || (Array.isArray(filterBank) && filterBank.length ? buildFilterBankSignature({ generatedFilterBank: filterBank }) : null);

  lines.push(`Raw response-shape signature: ${rawResponseSignature || INCOMPLETE}`);
  lines.push(`Post-EQ response-shape signature: ${postEqCurveSignature || INCOMPLETE}`);
  lines.push(`Target signature: ${targetSignature || INCOMPLETE}`);
  lines.push(`Filter-bank signature: ${fbSignature || INCOMPLETE}`);

  lines.push("");
  lines.push("END OF REPORT");
  return lines.join("\n");
}