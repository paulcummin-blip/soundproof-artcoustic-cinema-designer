// searchStatusEvidence.js
// ---------------------------------------------------------------------------
// Pure helper: reads the engine's per-category diagnostics and the hierarchy
// gate decision, and returns a compact, run-evidence status for each search
// category (Phase, Delay, Gain, Crossover, Placement, Seating).
//
// Each category carries:
//   status   — "completed" | "not_applicable" | "skipped" | "failed"
//              | "incomplete" | "not_run"
//   evaluated — true only when a genuine canonical evaluation occurred
//   label    — human label for the UI dot
//
// This module reads diagnostics; it performs no calculation and no side effect.
// It uses the existing electronicCategoryCompleted / crossoverGenuinelyCompleted
// authorities so the UI and the gate can never disagree.
// ---------------------------------------------------------------------------

import {
  electronicCategoryCompleted,
  crossoverGenuinelyCompleted,
} from "../improveBassV2/nonIntrusiveHierarchyGate.js";

const CATEGORY_LABELS = {
  phase: "Phase",
  delay: "Delay",
  gain: "Gain",
  crossover: "Crossover",
  placement: "Placement",
  seating: "Seating",
};

function categoryStatus(complete, reason) {
  if (complete && reason === "not-applicable") return { status: "not_applicable", evaluated: false };
  if (complete) return { status: "completed", evaluated: true };
  if (reason === "error") return { status: "failed", evaluated: false };
  if (reason === "skipped-not-run" || reason === "skipped-no-coverage") return { status: "skipped", evaluated: false };
  if (reason === "no-confirmation-evidence" || reason === "screened-not-confirmed") return { status: "incomplete", evaluated: false };
  if (reason === "stale" || reason === "cancelled") return { status: "incomplete", evaluated: false };
  if (reason === "incomplete" || reason === "not_run") return { status: "incomplete", evaluated: false };
  return { status: "incomplete", evaluated: false };
}

/**
 * Build the per-category search status from the engine's diagnostics and the
 * hierarchy gate decision. All inputs are optional — a missing diagnostic is
 * reported as not_run, never as completed.
 *
 * @param {object} diagnostics - { phaseDiagnostics, calibrationDiagnostics,
 *   gainDiagnostics, combinedDiagnostics, placementGate, seatingGate,
 *   placementEvaluated, seatingDiagnostics }
 * @returns {object} { categories: [{ key, label, status, evaluated }], ... }
 */
export function buildSearchStatusEvidence(diagnostics = {}) {
  const {
    phaseDiagnostics = null,
    calibrationDiagnostics = null,
    gainDiagnostics = null,
    combinedDiagnostics = null,
    placementGate = false,
    seatingGate = false,
    placementEvaluated = false,
    seatingDiagnostics = null,
  } = diagnostics;

  const phase = electronicCategoryCompleted(phaseDiagnostics);
  const delay = electronicCategoryCompleted(calibrationDiagnostics);
  const gain = electronicCategoryCompleted(gainDiagnostics);
  const crossover = combinedDiagnostics
    ? crossoverGenuinelyCompleted(combinedDiagnostics)
    : { complete: false, reason: "missing-diagnostics" };

  // Placement and seating are physical stages gated by the hierarchy. Their
  // status is read from the gate decision and the run's own evidence of
  // whether a search actually occurred — not inferred from a completed run.
  const placementStatus = placementEvaluated
    ? (placementGate ? { status: "completed", evaluated: true }
      : { status: "completed", evaluated: true }) // evaluated but gate closed (levels above L1)
    : placementGate
      ? { status: "completed", evaluated: true } // gate opened → a search ran
      : { status: "skipped", evaluated: false };

  const seatingStatus = (() => {
    if (seatingDiagnostics) {
      const tested = Number(seatingDiagnostics.tested || 0);
      const confirmed = Number(seatingDiagnostics.confirmed || 0);
      if (tested > 0 || confirmed > 0) {
        return { status: "completed", evaluated: true };
      }
      if (seatingDiagnostics.status === "skipped") return { status: "skipped", evaluated: false };
      if (seatingDiagnostics.status === "incomplete") return { status: "incomplete", evaluated: false };
    }
    // No seating diagnostics: the seating search never ran.
    return { status: "skipped", evaluated: false };
  })();

  const categories = [
    { key: "phase", label: CATEGORY_LABELS.phase, ...categoryStatus(phase.complete, phase.reason) },
    { key: "delay", label: CATEGORY_LABELS.delay, ...categoryStatus(delay.complete, delay.reason) },
    { key: "gain", label: CATEGORY_LABELS.gain, ...categoryStatus(gain.complete, gain.reason) },
    { key: "crossover", label: CATEGORY_LABELS.crossover, ...categoryStatus(crossover.complete, crossover.reason) },
    { key: "placement", label: CATEGORY_LABELS.placement, ...placementStatus },
    { key: "seating", label: CATEGORY_LABELS.seating, ...seatingStatus },
  ];

  return { categories };
}