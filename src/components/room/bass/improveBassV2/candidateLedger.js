// candidateLedger.js
// ---------------------------------------------------------------------------
// Read-only diagnostic ledger for one optimisation run.
//
// One row per candidate the funnel touched, showing what it measured, what it
// canonically achieved, whether it was confirmed and which objective it was
// selected for. It is a DEBUG artefact — never client-facing, never a scoring
// authority, and it changes nothing in the run.
//
// Rows carry: candidate id, source, delay/gain/polarity/phase settings, the
// proxy metrics (RSP range, worst-seat range, balanced range), canonical P19,
// canonical P20, P18 extension, status, retain/discard reason, rank and the
// objective(s) it was selected as.
//
// Pure: no React, no side effects.
// ---------------------------------------------------------------------------

import { readRspP19, canonicalP19Level } from "./p19Authority.js";
import { readProxyCandidateMetrics, emptyProxyCandidateMetrics } from "./proxyCandidateMetrics.js";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function asInfinity(value) {
  return Number.isFinite(value) ? value : null;
}

/** The lever a confirmed candidate came from. */
export function candidateSourceLabel(result) {
  if (!result) return "unknown";
  const origin = String(result.candidateOrigin || "");
  const kind = String(result.candidateKind || "");
  if (kind === "current" || result.candidateId === "current") return "current";
  if (kind === "gain") return "gain";
  if (kind === "phase" || origin === "phase-only") return "phase";
  if (origin.startsWith("combined")) return "combined";
  if (kind === "seating") return "seating";
  if (kind === "calibration") return "grouped-delay";
  if (result.isPositionCandidate) return "challenger-placement";
  return kind || "unknown";
}

/** Per-source delay / gain / polarity / phase of a confirmed candidate. */
export function tuningSettings(result) {
  const tuning = Array.isArray(result?.appliedTuning) ? result.appliedTuning : [];
  if (!tuning.length) return null;
  return {
    delay: tuning.map((t) => finiteOrNull(t?.delayMs) ?? 0),
    gain: tuning.map((t) => finiteOrNull(t?.gainDb) ?? 0),
    polarity: tuning.map((t) => finiteOrNull(t?.polarity) ?? 0),
    phase: tuning.map((t) => finiteOrNull(t?.phaseControlDeg ?? t?.phaseAdjust) ?? 0),
  };
}

/**
 * Proxy metrics for each candidate id, from the run's stored diagnostic
 * options and challenger proxy results. Grouped searches carry their own proxy
 * shape (RSP / primary-seat / all-seat range).
 *
 * @param {object} params
 * @param {Array} params.challengers - candidates carrying proxyResult
 * @param {object} params.diagnostics - { phaseDiagnostics, calibrationDiagnostics, gainDiagnostics }
 * @returns {Map<string, object>} candidateId → proxy metrics
 */
export function buildProxyIndex({ challengers = [], diagnostics = {} } = {}) {
  const index = new Map();

  for (const challenger of Array.isArray(challengers) ? challengers : []) {
    const id = String(challenger?.id ?? "");
    if (!id || !challenger?.proxyResult) continue;
    index.set(id, readProxyCandidateMetrics(challenger.proxyResult));
  }

  const groups = [diagnostics.phaseDiagnostics, diagnostics.calibrationDiagnostics, diagnostics.gainDiagnostics];
  for (const group of groups) {
    for (const option of Array.isArray(group?.options) ? group.options : []) {
      const id = String(option?.candidateId ?? "");
      if (!id) continue;
      const proxy = option?.proxy || {};
      const rsp = finiteOrNull(proxy.rspRangeDb) ?? Infinity;
      const worst = finiteOrNull(proxy.primaryRangeDb) ?? finiteOrNull(proxy.allSeatRangeDb) ?? Infinity;
      index.set(id, {
        proxyRspRange: rsp,
        proxyWorstSeatRange: worst,
        proxyAllSeatRange: finiteOrNull(proxy.allSeatRangeDb) ?? worst,
        proxyBalancedRange: Math.max(rsp, worst),
      });
    }
  }

  return index;
}

/** Which objective(s) each candidate was selected as. */
function selectedAsById(objectives, finalCandidate) {
  const roles = new Map();
  const mark = (result, role) => {
    if (!result) return;
    const id = String(result.candidateId ?? result.id ?? "");
    if (!id) return;
    const list = roles.get(id) || [];
    if (!list.includes(role)) list.push(role);
    roles.set(id, list);
  };
  mark(objectives?.bestCanonicalP19, "best-p19");
  mark(objectives?.bestCanonicalP20, "best-p20");
  mark(objectives?.bestCanonicalBalanced, "best-balanced");
  mark(finalCandidate, "final-recommended");
  return roles;
}

function rowForResult({ result, proxy, evaluation, roles }) {
  const p19 = readRspP19(result);
  return {
    candidateId: String(result?.candidateId ?? result?.id ?? ""),
    source: candidateSourceLabel(result),
    settings: tuningSettings(result),
    proxyRspRange: asInfinity(proxy?.proxyRspRange),
    proxyWorstSeatRange: asInfinity(proxy?.proxyWorstSeatRange),
    proxyAllSeatRange: asInfinity(proxy?.proxyAllSeatRange),
    proxyBalancedRange: asInfinity(proxy?.proxyBalancedRange),
    canonicalP19: p19.deviationDb,
    canonicalP19Level: canonicalP19Level(result?.achievedP19Level),
    canonicalP20: finiteOrNull(result?.achievedP20VariationDb),
    canonicalP18Hz: finiteOrNull(result?.achievedP18Hz),
    status: "confirmed",
    reasonRetained: evaluation?.materiality?.reason || evaluation?.reason ||
      (evaluation?.status ? `Evaluation: ${evaluation.status}` : "Confirmed canonical candidate"),
    reasonDiscarded: null,
    rank: null,
    selectedAs: roles?.get(String(result?.candidateId ?? result?.id ?? "")) || [],
  };
}

function rowForProxyOnly({ id, proxy }) {
  return {
    candidateId: id,
    source: "proxy-only",
    settings: null,
    proxyRspRange: asInfinity(proxy?.proxyRspRange),
    proxyWorstSeatRange: asInfinity(proxy?.proxyWorstSeatRange),
    proxyAllSeatRange: asInfinity(proxy?.proxyAllSeatRange),
    proxyBalancedRange: asInfinity(proxy?.proxyBalancedRange),
    canonicalP19: null,
    canonicalP19Level: null,
    canonicalP20: null,
    canonicalP18Hz: null,
    status: "proxy-only",
    reasonRetained: null,
    reasonDiscarded: "Not promoted to canonical confirmation",
    rank: null,
    selectedAs: [],
  };
}

/**
 * Build the run ledger.
 *
 * @param {object} params
 * @param {Array} params.candidates - every canonical confirmed candidate
 * @param {Map} params.proxyIndex - from buildProxyIndex()
 * @param {Array} params.evaluations - selection.evaluations
 * @param {object} params.objectives - selectCanonicalObjectives() output
 * @param {object} params.finalCandidate - the engine's chosen winner
 */
export function buildCandidateLedger({
  candidates = [], proxyIndex = null, evaluations = [], objectives = null, finalCandidate = null,
} = {}) {
  const proxyLookup = proxyIndex instanceof Map ? proxyIndex : new Map();
  const evalById = new Map(
    (Array.isArray(evaluations) ? evaluations : [])
      .filter((entry) => entry && entry.candidateId != null)
      .map((entry) => [String(entry.candidateId), entry]),
  );
  const roles = selectedAsById(objectives, finalCandidate);

  const seen = new Set();
  const rows = [];
  for (const result of Array.isArray(candidates) ? candidates : []) {
    const id = String(result?.candidateId ?? result?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(rowForResult({
      result,
      proxy: proxyLookup.get(id) || emptyProxyCandidateMetrics(),
      evaluation: evalById.get(id) || null,
      roles,
    }));
  }

  for (const [id, proxy] of proxyLookup) {
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(rowForProxyOnly({ id, proxy }));
  }

  // Diagnostic rank: confirmed candidates ordered by canonical P19, then P20.
  rows
    .filter((row) => row.status === "confirmed")
    .sort((a, b) =>
      (a.canonicalP19 ?? Infinity) - (b.canonicalP19 ?? Infinity)
      || (a.canonicalP20 ?? Infinity) - (b.canonicalP20 ?? Infinity)
      || a.candidateId.localeCompare(b.candidateId))
    .forEach((row, index) => { row.rank = index + 1; });

  return rows;
}

/** Counts for quick reading. */
export function summariseCandidateLedger(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    total: list.length,
    confirmed: list.filter((row) => row.status === "confirmed").length,
    proxyOnly: list.filter((row) => row.status === "proxy-only").length,
    bestP19: list.filter((row) => row.selectedAs.includes("best-p19")).map((row) => row.candidateId),
    bestP20: list.filter((row) => row.selectedAs.includes("best-p20")).map((row) => row.candidateId),
    bestBalanced: list.filter((row) => row.selectedAs.includes("best-balanced")).map((row) => row.candidateId),
    finalRecommended: list.filter((row) => row.selectedAs.includes("final-recommended")).map((row) => row.candidateId),
  };
}