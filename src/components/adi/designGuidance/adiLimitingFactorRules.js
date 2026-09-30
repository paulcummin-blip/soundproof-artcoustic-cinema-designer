// adiLimitingFactorRules.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// Limiting-factor priority authority.
//
// ADI must always lead with the parameter that genuinely limits the finished
// cinema — never with whatever recommendation happened to be generated first.
// This module is that authority.
//
// ADI_CONSEQUENCE is ADI's professional priority model. It is NOT an RP22
// grade, NOT a design-rating weight, and NOT a threshold. It expresses how
// much each parameter constrains the delivered experience, which is what
// decides which limitation the designer should tackle first:
//
//   • Bass consistency and bass capability are the hardest results to change
//     after the room is built, so they lead.
//   • Spatial and SPL geometry are next: they drive the whole seating area.
//   • Timbre consistency and zonal compliance are refinements.
//
// Severity comes from the EXISTING canonical grade only (FAIL/L1/L2/L3/L4).
// This module never re-grades, never re-thresholds and never averages.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { adiLevelRank } from "./adiDesignEvidence";

/** ADI professional consequence model (see header). */
export const ADI_CONSEQUENCE = Object.freeze({
  p20: 10, // seat-to-seat bass consistency
  p19: 9, // RSP bass response / target match
  p14: 9, // LFE SPL capability
  p18: 8, // in-room bass extension
  p12: 8, // screen speaker SPL capability
  p13: 7, // non-screen speaker SPL capability
  p5: 7, // horizontal surround angle gaps
  p9: 7, // vertical upper speaker angle gaps
  p2: 7, // discrete speaker count (layout architecture)
  p1: 6, // listening area distance to room boundaries
  p4: 5, // screen wall SPL balance across seats
  p6: 5, // surround SPL balance across seats
  p10: 5, // upper speaker SPL balance across seats
  p16: 5, // screen speaker timbre consistency
  p17: 5, // surround/height timbre consistency
  screen: 5, // RP23 horizontal viewing angle
  p7: 4, // wide speaker median-angle deviation
  p11: 4, // speakers outside recommended zones
  p3: 3, // screen wall speakers outside zones
});

/** Severity of an achieved grade. FAIL dominates; L3/L4 carry no weight. */
export const ADI_LEVEL_SEVERITY = Object.freeze({
  FAIL: 3.2,
  L1: 2.4,
  L2: 1.4,
  L3: 0.5,
  L4: 0,
});

/** Seat-scope parameters where a front-to-rear collapse means the listening
 *  area / rear-row geometry is the cause, not the speaker model. */
export const ADI_SPATIAL_KEYS = Object.freeze(["p5", "p9", "p4", "p6", "p10", "p16", "p17"]);

/** Of those, the angle-coverage parameters. A listening area that is too deep
 *  shows up here first — the level-balance and timbre spreads at the rear row
 *  follow from the geometry. Where both families collapse, ADI leads with the
 *  angle parameter, because that is the one that responds to listening-area
 *  depth and the guidance must name the real cause. */
export const ADI_ANGLE_KEYS = Object.freeze(["p5", "p9"]);

/** A row-to-row collapse of two or more performance levels. */
export const ADI_ROW_COLLAPSE_LEVELS = 2;

export const ADI_FACTOR_KIND = Object.freeze({
  INCOMPLETE: "incomplete",
  CAPABILITY: "capability",
  BASS_CONSISTENCY: "bass-consistency",
  BASS_RESPONSE: "bass-response",
  ROW_COLLAPSE: "row-collapse",
  WEAKEST: "weakest",
  BALANCED: "balanced",
});

export const ADI_AREA_LABEL = Object.freeze({
  p1: "Listening area and room boundaries",
  p20: "Bass consistency",
  p19: "Bass response",
  p18: "Bass extension",
  p14: "Bass capability",
  p5: "Surround spatial geometry",
  p9: "Height/overhead spatial geometry",
  p4: "Screen-wall level balance",
  p6: "Surround level balance",
  p10: "Upper speaker level balance",
  p16: "Screen speaker timbre consistency",
  p17: "Surround and height timbre consistency",
  p12: "Screen speaker output capability",
  p13: "Non-screen speaker output capability",
  p2: "Loudspeaker layout",
  p3: "Speaker zoning",
  p7: "Wide speaker geometry",
  p11: "Speaker zoning",
  screen: "Screen and viewing geometry",
});

function severityOf(level) {
  const normalized = String(level || "").toUpperCase();
  return ADI_LEVEL_SEVERITY[normalized] ?? 0;
}

function consequenceOf(key) {
  return ADI_CONSEQUENCE[key] ?? 0;
}

function isFailing(level) {
  const rank = adiLevelRank(level);
  return rank === 0 || rank === 1;
}

/** A front-to-rear collapse on one seat-scope parameter. */
function findRowCollapse(parameters) {
  const collapses = [];
  for (const key of ADI_SPATIAL_KEYS) {
    const parameter = parameters[key];
    if (!parameter || parameter.state !== "scored") continue;
    const rows = (parameter.byRow || []).filter((row) => row.assessedCount > 0);
    if (rows.length < 2) continue;
    const front = rows[0];
    const rear = rows[rows.length - 1];
    if (front.worstRank == null || rear.worstRank == null) continue;
    const drop = front.worstRank - rear.worstRank;
    if (drop < ADI_ROW_COLLAPSE_LEVELS) continue;
    const score = drop * consequenceOf(key) * severityOf(rear.worstLevel);
    collapses.push({ key, parameter, frontRow: front, rearRow: rear, drop, score });
  }
  if (!collapses.length) return null;
  const angleCollapses = collapses.filter((entry) => ADI_ANGLE_KEYS.includes(entry.key));
  const pool = angleCollapses.length ? angleCollapses : collapses;
  return pool.slice().sort((a, b) => b.score - a.score)[0];
}

/** Rank every assessable parameter ADI may lead with. */
export function rankAdiLimitingCandidates(evidence) {
  const parameters = evidence?.parameters || {};
  const candidates = [];

  for (const [key, parameter] of Object.entries(parameters)) {
    if (!parameter || parameter.state !== "scored" || !parameter.level) continue;
    const severity = severityOf(parameter.level);
    const consequence = consequenceOf(key);
    if (severity <= 0 || consequence <= 0) continue;
    candidates.push({
      key,
      number: parameter.number,
      area: ADI_AREA_LABEL[key] || "Design performance",
      level: parameter.level,
      severity,
      consequence,
      rank: severity * consequence,
      parameter,
    });
  }

  return candidates.sort((a, b) => b.rank - a.rank);
}

/**
 * Select the ONE limiting factor ADI must lead with.
 *
 * Rule order is fixed and deliberate:
 *   1. Incomplete evaluation (nothing credible to rank) — never a dead end.
 *   2. Output capability not achieved (P14).
 *   3. Severe seat-to-seat bass inconsistency (P20) — subwoofer layout,
 *      seating and symmetry come before any speaker change.
 *   4. Reference-seat bass response (P19).
 *   5. Spatial collapse from front row to rear row — listening-area depth /
 *      rear-row geometry, not the speaker model.
 *   6. The highest-consequence genuinely weak parameter.
 *   7. Nothing below L2 — the design is balanced.
 *
 * @param {Object} evidence — buildAdiDesignEvidence output
 * @returns {Object} selected factor
 */
export function selectAdiLimitingFactor(evidence) {
  const candidates = rankAdiLimitingCandidates(evidence);
  const bass = evidence?.bass || {};
  const runnerUp = candidates[1] || null;

  // ── 1. Nothing credible to rank ────────────────────────────────────
  if (!candidates.length) {
    return {
      kind: ADI_FACTOR_KIND.INCOMPLETE,
      key: null,
      candidate: null,
      runnerUp: null,
      candidates,
      evidence,
    };
  }

  const cap = candidates.find((candidate) => candidate.key === "p14");
  const consistency = candidates.find((candidate) => candidate.key === "p20");
  const response = candidates.find((candidate) => candidate.key === "p19");

  // ── 2. Capability first — no arrangement of a system that cannot reach the
  //      target will satisfy the design.
  if (cap && isFailing(cap.level)) {
    return {
      kind: ADI_FACTOR_KIND.CAPABILITY,
      key: "p14",
      candidate: cap,
      runnerUp,
      candidates,
      evidence,
    };
  }

  // ── 3. Bass consistency outranks every non-bass parameter. ─────────
  if (consistency && isFailing(consistency.level)) {
    return {
      kind: ADI_FACTOR_KIND.BASS_CONSISTENCY,
      key: "p20",
      candidate: consistency,
      runnerUp,
      candidates,
      evidence,
      boundaryCoupled: isFailing(evidence?.parameters?.p1?.level),
      multiSubInteraction:
        (response && isFailing(response.level)) &&
        Number(evidence?.system?.subwooferCount || 0) >= 2,
    };
  }

  // ── 4. Reference-seat response. ───────────────────────────────────
  if (response && isFailing(response.level)) {
    return {
      kind: ADI_FACTOR_KIND.BASS_RESPONSE,
      key: "p19",
      candidate: response,
      runnerUp,
      candidates,
      evidence,
      boundaryCoupled: isFailing(evidence?.parameters?.p1?.level),
    };
  }

  // ── 5. Front-to-rear spatial collapse → listening-area depth. ─────
  const collapse = findRowCollapse(evidence?.parameters || {});
  if (collapse && isFailing(collapse.rearRow.worstLevel)) {
    const escalated = candidates.find((candidate) => candidate.key === collapse.key) || null;
    const collapseRank = collapse.score * 1.35;
    const leader = candidates[0];
    if (!leader || collapseRank >= leader.rank) {
      return {
        kind: ADI_FACTOR_KIND.ROW_COLLAPSE,
        key: collapse.key,
        candidate: escalated,
        runnerUp: candidates.find((candidate) => candidate.key !== collapse.key) || null,
        candidates,
        collapse,
        evidence,
      };
    }
  }

  // ── 6. The genuinely weak parameter with the highest consequence. ──
  const weakest = candidates.find((candidate) => isFailing(candidate.level));
  if (weakest) {
    return {
      kind: ADI_FACTOR_KIND.WEAKEST,
      key: weakest.key,
      candidate: weakest,
      runnerUp: candidates.find((candidate) => candidate.key !== weakest.key) || null,
      candidates,
      evidence,
    };
  }

  // ── 7. Nothing settled is failing, but the bass evaluation has not
  //      published. Bass carries the highest consequence of any category, so
  //      ADI must not call the design balanced while it is unknown: it names
  //      what is missing and the action that settles it.
  if (evidence?.evaluation?.bassIncomplete === true) {
    return {
      kind: ADI_FACTOR_KIND.INCOMPLETE,
      key: null,
      candidate: null,
      runnerUp: candidates[0] || null,
      candidates,
      evidence,
    };
  }

  // ── 8. Nothing below L2. ──────────────────────────────────────────
  return {
    kind: ADI_FACTOR_KIND.BALANCED,
    key: candidates[0]?.key || null,
    candidate: null,
    runnerUp: null,
    candidates,
    evidence,
  };
}

/**
 * Does the evaluation carry a provisional bass signal worth acting on? Used by
 * the incomplete-evaluation guidance so ADI still gives a definite direction
 * instead of a dead end.
 */
export function resolveProvisionalBassSignal(evidence) {
  const p20 = evidence?.bass?.p20;
  const p19 = evidence?.bass?.p19;
  const p20Db = p20?.worstSeatDb ?? p20?.worstSeatDbProvisional ?? null;
  const p19Db = p19?.worstSeatDb ?? p19?.worstSeatDbProvisional ?? null;
  if (p20Db != null) return { key: "p20", deviationDb: p20Db };
  if (p19Db != null) return { key: "p19", deviationDb: p19Db };
  return null;
}

export default selectAdiLimitingFactor;