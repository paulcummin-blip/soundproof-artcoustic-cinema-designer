// electronicConfirmationLedger.js
// ---------------------------------------------------------------------------
// Compact, persistent diagnostic record of every canonically confirmed
// ELECTRONIC candidate — isolated phase, isolated delay, isolated gain and the
// joint crossover-integration search — plus the baseline they were compared
// against. Preserved with the optimisation run so a completed run can be
// audited afterwards from the saved evidence instead of a console log.
//
// EVIDENCE ONLY. This module reads the engine's final selection and its
// diagnostics and reshapes them. It performs no calculation, no search, no
// scoring and no side effect. It changes no acoustic maths, no optimiser
// behaviour, no RP22 grading and no acceptance threshold.
//
// One compact record per confirmed electronic candidate carries:
//   candidateId, family, candidateOrigin
//   crossover settings (when the search varied them)
//   per-sub gain, delay, phase and polarity
//   confirmed P19/P20 variation + level, P14 output + headroom
//   acceptance status (accepted / rejected / unmatched)
//   the individual safety-check rejection reasons
//
// No response curves, no per-frequency data, no large payloads.
// ---------------------------------------------------------------------------

const num = (value) => (value !== null && value !== undefined && typeof value !== "boolean" && Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 2) => (value == null ? null : Math.round(Number(value) * 10 ** digits) / 10 ** digits);

const ISOLATED_ELECTRONIC_KINDS = new Set(["phase", "calibration", "gain"]);

/**
 * Whether a confirmed result is an ELECTRONIC candidate the ledger should
 * record. Coordinated physical candidates, position candidates and seating
 * candidates are physical — they have their own evidence and are excluded so a
 * physical candidate is never presented as an isolated electronic search.
 */
function isElectronicCandidate(result) {
  if (!result || result.candidateKind === "current" || result.candidateId === "current") return false;
  if (result.isCoordinatedCandidate || result.candidateOrigin === "coordinated") return false;
  if (result.isPositionCandidate || result.candidateKind === "seating") return false;
  if (result.candidateOrigin === "combined-calibration-seating") return false;
  // Joint crossover + electronic tuning search.
  if (result.combinedFrom?.crossover === true) return true;
  // Combined calibration retuned on Current (no crossover, no movement).
  if (result.combinedFrom?.calibrationOnly === true) return true;
  return ISOLATED_ELECTRONIC_KINDS.has(result.candidateKind);
}

function familyOf(result) {
  if (result.combinedFrom?.crossover === true) return "crossover_integration";
  if (result.combinedFrom?.calibrationOnly === true) return "combined_calibration";
  if (result.candidateKind === "gain") return "gain";
  if (result.candidateKind === "phase") return "phase";
  if (result.candidateKind === "calibration" && result.groupedDelay) return "delay";
  return "electronic";
}

function compactTuning(result) {
  return (Array.isArray(result?.appliedTuning) ? result.appliedTuning : [])
    .map((entry) => ({
      sourceId: entry?.sourceId || null,
      gainDb: round(num(entry?.gainDb), 2),
      delayMs: round(num(entry?.delayMs), 2),
      phaseControlDeg: round(num(entry?.phaseControlDeg ?? entry?.phaseAdjust), 1),
      polarity: num(entry?.polarity) === -1 || num(entry?.polarity) === 180 ? -1 : 1,
    }));
}

function compactCrossover(result) {
  const xo = result?.crossover;
  if (!xo) return null;
  return {
    frequencyHz: round(num(xo.frequencyHz), 1),
    subwooferFrequencyHz: round(num(xo.subwooferFrequencyHz), 1),
    linkFrequencies: xo.linkFrequencies ?? null,
    speakerHpSlopeDbPerOct: num(xo.speakerHpSlopeDbPerOct),
    subwooferLpSlopeDbPerOct: num(xo.subwooferLpSlopeDbPerOct),
  };
}

function metricsOf(result) {
  return {
    p19VariationDb: round(num(result?.achievedP19VariationDb), 2),
    p19Level: result?.achievedP19Level ?? null,
    p20VariationDb: round(num(result?.achievedP20VariationDb), 2),
    p20Level: result?.achievedP20Level ?? null,
    p14AchievedDb: round(num(result?.p14AchievedDb), 2),
    p14HeadroomDb: round(num(result?.p14HeadroomDb), 2),
    p18Hz: round(num(result?.achievedP18Hz), 1),
    operatingOutputDb: round(num(result?.operatingOutputDb), 2),
  };
}

function evaluationFor(selection, candidateId) {
  const evaluations = Array.isArray(selection?.evaluations) ? selection.evaluations : [];
  return evaluations.find((entry) => entry?.candidateId === candidateId) || null;
}

/**
 * The individual safety-check rejection reasons for one candidate, read from
 * the run's own evaluation rows and the integration search's rejected list.
 * Nothing is invented; a candidate with no recorded issues returns an empty
 * list.
 */
function rejectionReasons(selection, result) {
  const reasons = [];
  const evalRow = evaluationFor(selection, result?.candidateId);
  if (evalRow) {
    if (evalRow.status === "safety-rejected") {
      if (evalRow.outputPass === false) reasons.push("P14 operating point not achieved");
      if (evalRow.level?.regressed) reasons.push("Hard safety regression");
      if (evalRow.muted?.mutedCount) reasons.push(`Subwoofer muted (${evalRow.muted.mutedCount})`);
    }
    if (Array.isArray(evalRow.issues) && evalRow.issues.length) reasons.push(...evalRow.issues);
    if (evalRow.status === "below-materiality") reasons.push("Below material-improvement threshold");
    if (evalRow.status === "trade-off") reasons.push("Trade-off — improves one measure, worsens another");
    if (evalRow.status === "protected-seat-trade-off") reasons.push("Protected primary seat regression");
    if (evalRow.status === "non-assessable") reasons.push(evalRow.reason || "Non-assessable");
    if (evalRow.status === "unchanged") reasons.push("Same as current configuration");
    if (evalRow.status === "baseline-unvalidated") reasons.push("Current baseline could not be validated");
  }
  // Joint crossover-integration rejection reasons (per-finalist issue list).
  const rejected = Array.isArray(selection?.combinedDiagnostics?.rejected)
    ? selection.combinedDiagnostics.rejected
    : [];
  const match = rejected.find((row) => row?.crossover && result?.crossover
    && Number(row.crossover.frequencyHz) === Number(result.crossover.frequencyHz)
    && Number(row.crossover.speakerHpSlopeDbPerOct) === Number(result.crossover.speakerHpSlopeDbPerOct));
  if (match && Array.isArray(match.issues)) reasons.push(...match.issues);
  return reasons;
}

function acceptanceFor(selection, result) {
  const evalRow = evaluationFor(selection, result?.candidateId);
  if (!evalRow) return { accepted: false, status: "unmatched" };
  if (evalRow.status === "material") return { accepted: true, status: "accepted" };
  return { accepted: false, status: evalRow.status || "rejected" };
}

function baselineRecord(selection) {
  const baseline = selection?.currentResult;
  if (!baseline) return null;
  return {
    candidateId: "current",
    family: "baseline",
    candidateOrigin: "current",
    crossover: compactCrossover(baseline),
    tuning: compactTuning(baseline),
    metrics: metricsOf(baseline),
    acceptance: { accepted: true, status: "baseline" },
    rejectionReasons: [],
  };
}

function candidateRecord(selection, result) {
  return {
    candidateId: result.candidateId || null,
    family: familyOf(result),
    candidateOrigin: result.candidateOrigin || null,
    crossover: compactCrossover(result),
    tuning: compactTuning(result),
    metrics: metricsOf(result),
    acceptance: acceptanceFor(selection, result),
    rejectionReasons: rejectionReasons(selection, result),
  };
}

/**
 * Build the compact electronic confirmation ledger from the engine's final
 * selection. Returns null when there is no baseline and no electronic
 * candidate to record.
 *
 * @param {object} selection - the V2 engine's final selection object
 * @returns {object|null} { ledgerVersion, recordCount, baseline, candidates, records }
 */
export function buildElectronicConfirmationLedger(selection) {
  if (!selection) return null;
  const baseline = baselineRecord(selection);
  const candidates = (Array.isArray(selection.confirmedResults) ? selection.confirmedResults : [])
    .filter(isElectronicCandidate)
    .map((result) => candidateRecord(selection, result));
  const records = [baseline, ...candidates].filter(Boolean);
  if (records.length === 0) return null;
  return {
    ledgerVersion: 1,
    recordCount: records.length,
    baseline,
    candidates,
    records,
  };
}