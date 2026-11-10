// coordinatedSearchOrchestrator.js
// ---------------------------------------------------------------------------
// Bass ADI Coordinated Design Search — designer-led optimisation.
//
// This orchestrator wraps the EXISTING acoustic authorities into a bounded
// search that:
//
//   1. Evaluates the designer's current layout first (baseline).
//   2. Searches 1/2/4-sub practical placement alternatives.
//   3. Explores legal whole-block seating translations.
//   4. Re-places subs for each retained seating state.
//   5. Screens fast, optimises electronics on survivors, canonically
//      confirms only the final shortlist.
//   6. Separates acoustic qualification from designer-led recommendation.
//   7. Presents a small number of genuinely distinct options.
//   8. Never auto-applies.
//
// It does NOT create a second acoustic solver. It reuses:
//   - Stage 1/2 placement finalists (existing)
//   - seatingPositionSearch (existing whole-block movement)
//   - coordinatedCandidateBundle / Evaluation (existing canonical path)
//   - materialityGate (existing materiality rules)
//   - P14/P19/P20 canonical authorities (existing)
// ---------------------------------------------------------------------------

import { createSearchBudget, meetsEarlyExit } from "./coordinatedSearchBudget";
import { qualifyCandidate, compareWithBaseline, preferSimpler, areDistinctOptions } from "./coordinatedSearchRanking";
import { buildOptions } from "./coordinatedSearchOptions";
import { evaluateCoordinatedCandidate, buildCandidateTransfer } from "./coordinatedCandidateEvaluation";
import { buildCoordinatedCandidateBundle } from "./coordinatedCandidateBundle";
import { generateSeatingCandidates, describeSeatingChange, validateSeatingPositions } from "./seatingPositionSearch";
import { resolveProposedRspFromSeat } from "./coordinatedCandidateRsp";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Run the Bass ADI coordinated design search.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {object} params.roomDims — { widthM, lengthM, heightM }
 * @param {Array}  params.subwooferInstances — installed sub instances
 * @param {Array}  params.seatingPositions — installed seating
 * @param {string} [params.designatedSeatId] — canonical RSP seat
 * @param {string} params.selectedSubModel
 * @param {number} [params.amplifierPowerPerSubW]
 * @param {number} [params.subwooferBottomHeightM]
 * @param {object} [params.p14Target] — { p14TargetBasis, p14TargetLevel, p14TargetDb, p18TargetBasis }
 * @param {object} [params.integrationContext] — LCR/sub integration context
 * @param {object} [params.stage1Finalists] — { 1: [...], 2: [...], 4: [...] } from Stage 1
 * @param {string} [params.screenWall] — "front" | "back"
 * @param {object} [params.callbacks] — { onProgress, isCancelled }
 * @returns {Promise<object>} { status, baseline, options, recommendations, summary, diagnostics }
 */
export async function runCoordinatedSearch(params) {
  const {
    projectId,
    roomDims,
    subwooferInstances = [],
    seatingPositions = [],
    designatedSeatId = null,
    selectedSubModel,
    amplifierPowerPerSubW = 0,
    subwooferBottomHeightM = 0,
    p14Target = null,
    integrationContext = null,
    stage1Finalists = {},
    screenWall = "front",
    callbacks = {},
  } = params;

  const { onProgress = null, isCancelled = () => false } = callbacks;
  const budget = createSearchBudget();
  const diagnostics = createDiagnosticsTracker();

  const progress = (phase, label, current, total) => {
    diagnostics.recordPhase(phase, label);
    if (onProgress) try { onProgress(phase, label, current, total); } catch { /* non-fatal */ }
  };

  try {
    // ── 0. Input validation ──────────────────────────────────────
    if (!roomDims || !seatingPositions.length || !selectedSubModel || !p14Target) {
      return { status: "blocked", reason: "Missing required inputs", baseline: null, options: [], recommendations: [], summary: {}, diagnostics: diagnostics.snapshot() };
    }

    // ── 1. Evaluate the baseline (designer's current layout) ─────
    progress("baseline", "Evaluating your current design", 0, 1);
    const baselineResult = await evaluateBaseline({
      subwooferInstances, roomDims, seatingPositions, designatedSeatId,
      selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
      p14Target, integrationContext,
    });
    diagnostics.recordBaseline(baselineResult);

    if (isCancelled()) return cancelledResult(baselineResult, diagnostics);
    if (budget.isExhausted()) return exhaustedResult(baselineResult, [], diagnostics);

    // If the baseline meets early-exit criteria, no search is needed.
    if (baselineResult.evidence && meetsEarlyExit(baselineResult.evidence, baselineResult.p14Passes)) {
      progress("complete", "Your current design achieves excellent performance", 1, 1);
      const options = buildOptions({
        baseline: { evidence: baselineResult.evidence, meta: baselineResult.meta },
        alternatives: [],
      });
      return successResult(baselineResult, options, diagnostics, budget);
    }

    // ── 2. Generate topology + seating candidates ────────────────
    progress("searching", "Searching alternative subwoofer placements", 0, 1);
    const searchCandidates = generateSearchCandidates({
      roomDims, seatingPositions, designatedSeatId, screenWall,
      stage1Finalists, subwooferInstances,
      selectedSubModel, subwooferBottomHeightM,
      p14Target, integrationContext,
    });
    diagnostics.recordCandidatesGenerated(searchCandidates.length);

    // ── 3. Fast screening: build transfers, reject failures ──────
    progress("screening", "Fast acoustic screening of candidates", 0, searchCandidates.length);
    const screened = [];
    for (let i = 0; i < searchCandidates.length; i++) {
      if (isCancelled()) return cancelledResult(baselineResult, diagnostics);
      if (budget.isExhausted()) break;

      const candidate = searchCandidates[i];
      const built = buildCandidateTransfer({
        bundle: candidate.bundle,
        roomDims,
        amplifierPowerPerSubW,
      });

      if (built.status === "built") {
        screened.push({ ...candidate, transfer: built.transfer, responseBasis: built.responseBasis });
        diagnostics.recordScreened(candidate.candidateId, "passed");
      } else {
        diagnostics.recordScreened(candidate.candidateId, "rejected", built.issues?.join("; "));
      }

      progress("screening", `Screening candidates (${i + 1}/${searchCandidates.length})`, i + 1, searchCandidates.length);
    }

    // ── 4. Canonical confirmation (bounded) ───────────────────────
    progress("confirming", "Canonical confirmation of finalists", 0, Math.min(screened.length, budget.bounds.MAX_CANONICAL_CONFIRMATIONS));
    const confirmed = [];
    for (let i = 0; i < screened.length; i++) {
      if (isCancelled()) return cancelledResult(baselineResult, diagnostics);
      if (!budget.claimCanonicalConfirmation()) break;
      if (budget.isExhausted()) break;

      const candidate = screened[i];
      const evalResult = await evaluateCoordinatedCandidate({
        bundle: candidate.bundle,
        roomDims,
        amplifierPowerPerSubW,
        preBuiltTransfer: candidate.transfer,
        preBuiltResponseBasis: candidate.responseBasis,
      });

      diagnostics.recordConfirmation(candidate.candidateId, evalResult.status);

      if (evalResult.status === "evaluated" && evalResult.evidence) {
        const qualified = qualifyCandidate(evalResult.evidence, {
          p14Passes: evalResult.evidence.p14?.achievedDb >= evalResult.evidence.p14?.targetDb,
        });
        if (qualified.qualified) {
          confirmed.push({
            evidence: evalResult.evidence,
            meta: candidate.meta,
          });
          diagnostics.recordQualified(candidate.candidateId);
        }
      }

      progress("confirming", `Confirming finalists (${i + 1}/${Math.min(screened.length, budget.bounds.MAX_CANONICAL_CONFIRMATIONS)})`, i + 1, Math.min(screened.length, budget.bounds.MAX_CANONICAL_CONFIRMATIONS));

      // Early exit if a strong candidate is found
      if (confirmed.length > 0 && meetsEarlyExit(confirmed[confirmed.length - 1].evidence, true)) {
        break;
      }
    }

    // ── 5. Build designer-facing options ──────────────────────────
    progress("finalising", "Building recommendations", 0, 1);
    const options = buildOptions({
      baseline: { evidence: baselineResult.evidence, meta: baselineResult.meta },
      alternatives: confirmed,
    });

    diagnostics.recordOptions(options);
    return successResult(baselineResult, options, diagnostics, budget);

  } catch (error) {
    diagnostics.recordError(error);
    return { status: "error", error: error?.message || "Search failed", baseline: null, options: [], recommendations: [], summary: {}, diagnostics: diagnostics.snapshot() };
  }
}

// ── Baseline evaluation ──────────────────────────────────────────────

async function evaluateBaseline({
  subwooferInstances, roomDims, seatingPositions, designatedSeatId,
  selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM,
  p14Target, integrationContext,
}) {
  const activeInstances = subwooferInstances.filter((s) => s.enabled !== false);
  const coordinates = activeInstances.map((inst) => ({
    x: Number(inst.position?.x) || 0,
    y: Number(inst.position?.y) || 0,
  }));

  const rspResolution = resolveProposedRspFromSeat({
    seatingPositions, designatedSeatId, roomWidthM: roomDims.widthM,
  });

  const bundle = buildCoordinatedCandidateBundle({
    candidateId: "baseline-current",
    quantity: coordinates.length,
    coordinates,
    selectedSubModel,
    subwooferBottomHeightM,
    seatingPositions,
    designatedSeatId,
    fallbackRsp: rspResolution.rspPosition,
    roomWidthM: roomDims.widthM,
    tuning: activeInstances.map((inst) => ({
      delayMs: Number(inst.delayMs) || 0,
      gainDb: Number(inst.gainDb) || 0,
      polarity: Number(inst.polarity) || 0,
      phaseControlDeg: Number(inst.phaseControlDeg) || 0,
    })),
    crossover: integrationContext?.crossover || null,
    integrationContext,
    responseBasis: integrationContext ? "combined-lcr-sub" : "sub-only",
    p14Target,
  });

  const evalResult = await evaluateCoordinatedCandidate({
    bundle, roomDims, amplifierPowerPerSubW,
  });

  return {
    bundle,
    evidence: evalResult.evidence,
    status: evalResult.status,
    issues: evalResult.issues,
    p14Passes: evalResult.evidence?.p14?.achievedDb >= evalResult.evidence?.p14?.targetDb,
    meta: {
      quantity: coordinates.length,
      coordinates,
      seatingPositions,
      seatingOffsetMm: 0,
      crossover: integrationContext?.crossover || null,
      tuning: bundle.tuning,
      designatedSeatId,
      // P0-2: candidate-owned physical identity for the baseline too.
      placementId: "baseline-current",
      selectedSubModel,
      subwooferBottomHeightM,
      roomDims: { widthM: roomDims.widthM, lengthM: roomDims.lengthM },
    },
  };
}

// ── Search candidate generation ─────────────────────────────────────

function generateSearchCandidates({
  roomDims, seatingPositions, designatedSeatId, screenWall,
  stage1Finalists, subwooferInstances,
  selectedSubModel, subwooferBottomHeightM,
  p14Target, integrationContext,
}) {
  const candidates = [];
  const quantities = [1, 2, 4];
  const activeInstances = subwooferInstances.filter((s) => s.enabled !== false);
  const currentQuantity = activeInstances.length;

  // ── Seating states: current + legal translations ────────────────
  const seatingStates = [{ offsetMm: 0, seatingPositions, label: "current" }];
  const seatingShifts = generateSeatingCandidates(seatingPositions, roomDims, screenWall);
  const validShifts = seatingShifts.filter((s) => s.valid && s.offsetMm !== 0);

  // Retain up to MAX_SEATING_STATES_FOR_REPLACEMENT total (including current)
  const maxStates = 3;
  const retainedShifts = validShifts.slice(0, maxStates - 1);
  for (const shift of retainedShifts) {
    seatingStates.push({
      offsetMm: shift.offsetMm,
      seatingPositions: shift.seatingPositions,
      label: describeSeatingChange(shift.offsetMm),
    });
  }

  // ── For each seating state, generate placement candidates ───────
  for (const seatingState of seatingStates) {
    const rspResolution = resolveProposedRspFromSeat({
      seatingPositions: seatingState.seatingPositions,
      designatedSeatId,
      roomWidthM: roomDims.widthM,
    });

    for (const qty of quantities) {
      // Skip the current quantity at the current seating (that's the baseline)
      if (qty === currentQuantity && seatingState.offsetMm === 0) continue;

      const finalists = stage1Finalists[qty] || [];
      const boundedFinalists = finalists.slice(0, 2); // MAX_PLACEMENT_FINALISTS_PER_QTY

      for (const finalist of boundedFinalists) {
        const coords = finalist.coordinates || finalist.sources?.map((s) => ({
          x: s.xNorm * roomDims.widthM,
          y: s.yNorm * roomDims.lengthM,
        })) || [];
        if (!coords.length || coords.length !== qty) continue;

        const bundle = buildCoordinatedCandidateBundle({
          candidateId: `search-${qty}sub-seat${seatingState.offsetMm}-${finalist.id || "f"}`,
          quantity: qty,
          coordinates: coords,
          selectedSubModel,
          subwooferBottomHeightM,
          seatingPositions: seatingState.seatingPositions,
          designatedSeatId,
          fallbackRsp: rspResolution.rspPosition,
          roomWidthM: roomDims.widthM,
          crossover: integrationContext?.crossover || null,
          integrationContext,
          responseBasis: integrationContext ? "combined-lcr-sub" : "sub-only",
          p14Target,
        });

        candidates.push({
          candidateId: bundle.candidateId,
          bundle,
          meta: {
            quantity: qty,
            coordinates: coords,
            seatingPositions: seatingState.seatingPositions,
            seatingOffsetMm: seatingState.offsetMm,
            crossover: integrationContext?.crossover || null,
            tuning: bundle.tuning,
            designatedSeatId,
            finalistId: finalist.id || null,
            seatingLabel: seatingState.label,
            // P0-2: candidate-owned physical identity for reproducible
            // presentation. Never inferred from the installed layout.
            placementId: finalist.id || null,
            selectedSubModel,
            subwooferBottomHeightM,
            roomDims: { widthM: roomDims.widthM, lengthM: roomDims.lengthM },
          },
        });
      }
    }
  }

  return candidates;
}

// ── Diagnostics tracker ─────────────────────────────────────────────

function createDiagnosticsTracker() {
  const phases = [];
  let baseline = null;
  let candidatesGenerated = 0;
  const screened = [];
  const confirmed = [];
  const qualified = [];
  let optionsSummary = null;
  let error = null;

  return {
    recordPhase(phase, label) {
      phases.push({ phase, label, ts: Date.now() });
    },
    recordBaseline(result) {
      baseline = {
        status: result.status,
        p14Passes: result.p14Passes,
        p19Level: num(result.evidence?.p19?.level),
        p20PrimaryLevel: num(result.evidence?.p20Primary?.level),
        evidenceComplete: !!result.evidence,
      };
    },
    recordCandidatesGenerated(count) { candidatesGenerated = count; },
    recordScreened(candidateId, outcome, reason) {
      screened.push({ candidateId, outcome, reason });
    },
    recordConfirmation(candidateId, status) {
      confirmed.push({ candidateId, status });
    },
    recordQualified(candidateId) {
      qualified.push({ candidateId });
    },
    recordOptions(options) {
      optionsSummary = options.summary;
    },
    recordError(err) {
      error = err?.message || String(err);
    },
    snapshot() {
      return {
        phases,
        baseline,
        candidatesGenerated,
        candidatesScreened: screened.length,
        candidatesScreenedPassed: screened.filter((s) => s.outcome === "passed").length,
        candidatesScreenedRejected: screened.filter((s) => s.outcome === "rejected").length,
        canonicalConfirmations: confirmed.length,
        candidatesQualified: qualified.length,
        optionsSummary,
        error,
      };
    },
  };
}

// ── Result builders ─────────────────────────────────────────────────

function successResult(baseline, options, diagnostics, budget) {
  return {
    status: "complete",
    baseline,
    options: options.options,
    recommendations: options.recommendations,
    summary: options.summary,
    diagnostics: diagnostics.snapshot(),
    budget: budget.snapshot(),
  };
}

function cancelledResult(baseline, diagnostics) {
  return {
    status: "cancelled",
    baseline,
    options: [],
    recommendations: [],
    summary: {},
    diagnostics: diagnostics.snapshot(),
  };
}

function exhaustedResult(baseline, alternatives, diagnostics) {
  return {
    status: "budget_exhausted",
    baseline,
    options: [],
    recommendations: [],
    summary: {},
    diagnostics: diagnostics.snapshot(),
  };
}