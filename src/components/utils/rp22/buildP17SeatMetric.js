/**
 * buildP17SeatMetric.js
 * ---------------------
 * P17 — one seat's metric, built from the engine's per-seat coverage-window result.
 *
 * P17 IS A DESIGN GUIDE. The engine grades the seat from the effective off-axis
 * angle of the channel that covers it, against that model's coverage windows:
 * L4 inside the 1.5 dB window, L3 inside the 3 dB window, L2 inside the usable
 * 4 dB window, L1 outside usable coverage. This builder carries that grade through
 * verbatim. It never re-grades, and it never turns a raw measured polar deviation
 * into the seat's score. Under 4 dB is not a failure.
 *
 * The raw seat-versus-RSP response delta, the limiting speaker entry and the
 * beyond-limit set are carried as read-only diagnostics only.
 *
 * Pure: no React, no SDK, no writes.
 */

import { formatP17WindowResult } from "@/components/utils/rp22/p17CoverageWindows";

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * @param {object|null} p17Data - the engine's per-seat P17 result
 *        (see computeP17ForAllSeats in rp22HfOffAxis.jsx)
 */
export function buildP17SeatMetric(p17Data) {
  // No surround/upper channel could be graded at this seat — report unavailable
  // rather than a grade. Never inferred.
  if (!p17Data || !isNum(p17Data.p17Db)) {
    return {
      value: null,
      formatted: "—",
      level: "—",
      windows: null,
      evidenceType: "missing",
      cause: "missing_evidence",
      perSpeaker: [],
      p17HasNaAngles: false,
    };
  }

  // The grade the engine produced IS the coverage-window result. There is no
  // separate coverage cap: being outside the −3 dB window is exactly what an L2
  // or L1 grade already means.
  const level = /^L[1-4]$/.test(String(p17Data.windowLevel || "")) ? p17Data.windowLevel : null;

  // ── P17 design-guide basis marker ──
  // The engine grades each seat against the model's coverage windows and stamps
  // windowLevel / windowLevelNumber / windowCause on the per-seat result. These
  // are the fields p17SeatEvidenceAuthority.resolveRowBasis reads to decide
  // coverage_window vs earlier_variance_basis. They MUST be carried through the
  // stored metric verbatim — dropping them makes a fresh coverage-window result
  // read as legacy after it is saved/published/reopened.
  const windowLevel = level;
  const windowLevelNumber = isNum(p17Data.windowLevelNumber) ? p17Data.windowLevelNumber : null;
  const windowCause = p17Data.cause || null;

  return {
    value: p17Data.p17Db,
    formatted: formatP17WindowResult(level),
    level,
    windows: p17Data.windows || null,
    evidenceType: p17Data.evidenceType || null,
    cause: p17Data.cause || null,
    // ── basis marker (read by resolveRowBasis) ──
    windowLevel,
    windowLevelNumber,
    windowCause,
    worstRole: p17Data.worstRole,
    worstAngleDeg: p17Data.worstAngleDeg,
    worstLossDb: p17Data.worstLossDb,
    perSpeaker: p17Data.perSpeaker || [],
    p17HasNaAngles: p17Data.p17HasNaAngles || false,
    // ── Read-only diagnostic evidence (additive; never graded) ──
    rawVarianceDb: isNum(p17Data.rawVarianceDb) ? p17Data.rawVarianceDb : null,
    uncappedLevel: level,
    capApplied: false,
    limiting: p17Data.limiting || null,
    beyondLimit: p17Data.beyondLimit || [],
    coverageLimitDeg: isNum(p17Data.coverageLimitDeg) ? p17Data.coverageLimitDeg : null,
  };
}