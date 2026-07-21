// candidateConsistency.js — Shared utilities for live candidate identity verification.
// Computes a stable candidate signature and a four-representation consistency test
// (A/B/C/D) at probe frequencies. Does NOT recalculate, rerank, or modify anything.

import { peakingEqResponseDb } from "@/components/utils/designEqCalibration";

export const PROBE_FREQS = [29.75, 39.14, 77.16, 101.52];
export const CONSISTENCY_TOLERANCE_DB = 0.05;

// --- Interpolation (matches the graph / optimiser interpolation convention) ---
export function interpolateCurve(curve, frequency) {
  if (!Array.isArray(curve) || curve.length === 0 || !Number.isFinite(frequency)) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (frequency >= curve[i].frequency && frequency <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const ratio = (frequency - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
    }
  }
  return null;
}

// --- Candidate signature ---
// A stable, deterministic string identifying the currently selected candidate.
export function buildCandidateSignature({ result, rspRawCurve }) {
  const c = result?.selectedCandidate;
  if (!c) return null;
  const filters = (Array.isArray(c.generatedFilterBank) ? c.generatedFilterBank : []).filter((f) => f?.enabled);
  const filterSig = filters
    .map((f) => `${(f.frequencyHz ?? 0).toFixed(2)}/${(f.gainDb ?? 0).toFixed(2)}/Q${(f.Q ?? 0).toFixed(2)}`)
    .join("|");
  const poolId = result?.poolId ?? c.poolId ?? "—";
  const requestedCombo = `P14-${c.requestedP14Level ?? "—"}/P18-${c.requestedP18Level ?? "—"}/P19-${c.requestedP19Level ?? "—"}`;
  const assessmentBand = `${c.assessmentStartHz ?? "—"}–${c.assessmentEndHz ?? "—"}Hz`;
  const fitProfile = c.designEqFitProfile || "standard";
  const selectedStart = c.startStrategy || (fitProfile === "house_curve" ? "multi-start" : "single");
  return {
    poolId,
    requestedCombo,
    assessmentBand,
    fitProfile,
    selectedStart,
    filterSignature: filterSig || "(none)",
    finalCurvePoints: Array.isArray(c.finalPostEqCurve) ? c.finalPostEqCurve.length : 0,
    combinedEqPoints: Array.isArray(c.combinedEqCurve) ? c.combinedEqCurve.length : 0,
    rawRspPoints: Array.isArray(rspRawCurve) ? rspRawCurve.length : 0,
  };
}

export function signatureToString(sig) {
  if (!sig) return "—";
  return [
    `Pool:${sig.poolId}`,
    sig.requestedCombo,
    `Assess:${sig.assessmentBand}`,
    `Profile:${sig.fitProfile}`,
    `Start:${sig.selectedStart}`,
    `Filters:[${sig.filterSignature}]`,
    `FC:${sig.finalCurvePoints}`,
    `CE:${sig.combinedEqPoints}`,
    `RR:${sig.rawRspPoints}`,
  ].join(" | ");
}

// --- A/B/C/D consistency test ---
// A = direct sum of peakingEqResponseDb() for every enabled filter
// B = interpolated value from selectedCandidate.combinedEqCurve
// C = selectedCandidate.finalPostEqCurve − rspRawCurve (the exact raw RSP used to build it)
// D = result.finalPostEqCurve − rspRawCurve (the exact raw RSP used by the graph)
// All four must agree within 0.05 dB at every probe frequency.
export function runConsistencyTest({ result, rspRawCurve }) {
  const c = result?.selectedCandidate;
  if (!c) return { rows: [], allPass: false, signature: null };
  const filters = (Array.isArray(c.generatedFilterBank) ? c.generatedFilterBank : []).filter((f) => f?.enabled);
  const combinedEqCurve = Array.isArray(c.combinedEqCurve) ? c.combinedEqCurve : [];
  const candidateFinal = Array.isArray(c.finalPostEqCurve) ? c.finalPostEqCurve : [];
  const resultFinal = Array.isArray(result.finalPostEqCurve) ? result.finalPostEqCurve : [];
  const rawCurve = Array.isArray(rspRawCurve) ? rspRawCurve : [];

  const rows = PROBE_FREQS.map((freq) => {
    const A = filters.reduce((sum, f) => sum + peakingEqResponseDb(freq, f), 0);
    const B = interpolateCurve(combinedEqCurve, freq);
    const cPost = interpolateCurve(candidateFinal, freq);
    const rawAt = interpolateCurve(rawCurve, freq);
    const C = Number.isFinite(cPost) && Number.isFinite(rawAt) ? cPost - rawAt : null;
    const dPost = interpolateCurve(resultFinal, freq);
    const D = Number.isFinite(dPost) && Number.isFinite(rawAt) ? dPost - rawAt : null;
    const vals = { A, B, C, D };
    const finiteVals = Object.values(vals).filter(Number.isFinite);
    if (finiteVals.length < 4) {
      return { freq, A, B, C, D, spread: null, pass: false, missing: true };
    }
    const spread = Math.max(...finiteVals) - Math.min(...finiteVals);
    return { freq, A, B, C, D, spread, pass: spread <= CONSISTENCY_TOLERANCE_DB, missing: false };
  });

  const allPass = rows.length > 0 && rows.every((r) => r.pass);
  const signature = buildCandidateSignature({ result, rspRawCurve });
  return { rows, allPass, signature };
}

// --- Visible condition report (observation only — no fixes) ---
// Reports the observed mismatch between official RSP P19 and worst real-seat house-curve
// deviation, plus repeated-filter detection. Returns structured TEST/EXPECTED/ACTUAL/DELTA/
// SEVERITY/NEXT TEST rows.
export function buildVisibleConditionReport({ result, rspRawCurve }) {
  const c = result?.selectedCandidate;
  if (!c) return [];
  const rows = [];

  // 1. Official RSP P19
  const p19Level = result.achievedP19Level;
  const p19Var = result.achievedP19VariationDb;
  const p19Pass = p19Level && p19Level !== "FAIL" && p19Level !== "L0";
  rows.push({
    test: "Official RSP P19",
    expected: "Pass (≤ ±3.0 dB, L1+)",
    actual: `${p19Pass ? p19Level : "FAIL"} (±${Number.isFinite(p19Var) ? p19Var.toFixed(1) : "—"} dB)`,
    delta: p19Pass ? "0" : `${Number.isFinite(p19Var) ? (p19Var - 3.0).toFixed(1) : "—"} dB over L1 threshold`,
    severity: p19Pass ? "info" : "high",
    nextTest: "Confirm RSP P19 is computed from result.finalPostEqCurve vs house-curve target, not from a different curve",
  });

  // 2. Worst real-seat house-curve deviation
  const worstSeatVar = c.worstRealSeatHouseCurveVariationDb;
  const worstSeatLevel = c.worstRealSeatHouseCurveLevel;
  const worstSeatId = c.worstRealSeatHouseCurveSeatId || "—";
  const seatPass = worstSeatLevel && worstSeatLevel > 0;
  rows.push({
    test: "Worst real-seat house-curve deviation",
    expected: "L4 (≤ ±2.0 dB) for house-curve priority",
    actual: `${seatPass ? `L${worstSeatLevel}` : "FAIL"} (±${Number.isFinite(worstSeatVar) ? worstSeatVar.toFixed(1) : "—"} dB) @ ${worstSeatId}`,
    delta: seatPass ? "0" : `${Number.isFinite(worstSeatVar) ? (worstSeatVar - 2.0).toFixed(1) : "—"} dB over L4 threshold`,
    severity: seatPass ? "info" : "medium",
    nextTest: "Confirm worst-seat metric is computed from perSeatRawCurves with the same EQ bank applied",
  });

  // 3. Selected objective
  const objective = c.designEqFitProfile === "house_curve" ? "RSP maximum residual, then RSP RMS; real seats constrained" : "RSP P19";
  rows.push({
    test: "Selected objective",
    expected: "Matches displayed graph and P19 reporting",
    actual: objective,
    delta: objective.startsWith("RSP maximum") ? "0" : "Legacy objective",
    severity: objective.startsWith("RSP maximum") ? "info" : "medium",
    nextTest: "Confirm the optimiser was run with house-curve priority (accuracy mode)",
  });

  // 4. Displayed graph
  rows.push({
    test: "Displayed graph",
    expected: "RSP (authoritative assessment position)",
    actual: "RSP",
    delta: "0",
    severity: "info",
    nextTest: "Confirm graph raw = rspRawCurve and post-EQ = result.finalPostEqCurve",
  });

  // 5. Repeated filters detection
  const filters = (Array.isArray(c.generatedFilterBank) ? c.generatedFilterBank : []).filter((f) => f?.enabled);
  const repeatedGroups = [];
  const used = new Set();
  for (let i = 0; i < filters.length; i++) {
    if (used.has(i)) continue;
    const group = [filters[i]];
    for (let j = i + 1; j < filters.length; j++) {
      if (used.has(j)) continue;
      const df = Math.abs(filters[i].frequencyHz - filters[j].frequencyHz);
      if (df <= 5.0) {
        group.push(filters[j]);
        used.add(j);
      }
    }
    if (group.length > 1) {
      used.add(i);
      const freqs = group.map((f) => f.frequencyHz).sort((a, b) => a - b);
      repeatedGroups.push({
        range: `${freqs[0].toFixed(1)}–${freqs[freqs.length - 1].toFixed(1)} Hz`,
        count: group.length,
        filters: group,
      });
    }
  }
  if (repeatedGroups.length > 0) {
    const desc = repeatedGroups.map((g) => `${g.range} (${g.count} filters)`).join("; ");
    rows.push({
      test: "Repeated filters (within 5 Hz)",
      expected: "No repeated filters in same region",
      actual: desc,
      delta: `${repeatedGroups.length} group(s)`,
      severity: "medium",
      nextTest: "Inspect optimiser trace to see why multiple filters were placed in the same region",
    });
  }

  return rows;
}