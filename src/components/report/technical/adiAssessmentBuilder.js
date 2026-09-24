/**
 * adiAssessmentBuilder.js
 * -----------------------
 * The single authoritative ADI Assessment builder.
 *
 * Produces structured engineering commentary — Highlights, Improvements to
 * Consider, and Overall Assessment — from the canonical engineering summary
 * published by the Room Designer.
 *
 * This is the ONE authoritative ADI Assessment used across every output:
 * Technical Report, dealer-branded presentations, and proposal documents.
 * Every consumer calls buildAdiAssessment(engineeringSummary) — no consumer
 * re-derives or duplicates the commentary.
 *
 * ADI is professional engineering commentary — never a score, never another
 * RP22 parameter, never a list of faults. It complements the Design Rating.
 * It never replaces it.
 *
 * Pure: no React, no UI, no side effects. Reads only from the published
 * engineering summary.
 */

import { getRoomDesignRatingDesignation } from "./designRatingPresentation";

const LEVEL_RANK = { L1: 1, L2: 2, L3: 3, L4: 4 };

/**
 * Extract the lowest achieved floor level across the three RP22 performance
 * categories (Spatial Resolution, Dynamic Range, Timbre Matching) for a
 * seating group. Screen / Viewing Geometry is separately governed and
 * excluded. FAIL is excluded — a FAIL triggers a different narrative path.
 *
 * @param {Array} categories — engineeringSummary.{primary|secondary}.categories
 * @returns {string|null} — "L1".."L4" or null
 */
function getSeatingGroupFloor(categories) {
  if (!Array.isArray(categories)) return null;
  const rp22Categories = categories.filter(
    (cat) => cat?.hasContribs && !cat?.isScreen && !cat?.hasFail,
  );
  const levels = rp22Categories
    .map((cat) => cat?.floorLevel)
    .filter((level) => level && LEVEL_RANK[level]);
  if (!levels.length) return null;
  return levels.sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])[0];
}

/**
 * Check if any category in the seating group has a genuine FAIL.
 */
function hasAnyFail(categories) {
  if (!Array.isArray(categories)) return false;
  return categories.some((cat) => cat?.hasFail);
}

/**
 * Resolve the P19/P20 bass parameter level for a seating scope.
 * Keys may be lowercase "p19"/"p20" in parameterSummaries.
 */
function getBassLevel(parameterSummaries, scope, paramKey) {
  const scopeSummary = parameterSummaries?.[scope];
  if (!scopeSummary) return null;
  const param = scopeSummary?.[paramKey] || scopeSummary?.[paramKey.toUpperCase()];
  const level = param?.level;
  return level && LEVEL_RANK[level] ? level : null;
}

/**
 * Build the ADI Assessment from the canonical engineering summary.
 *
 * @param {Object} engineeringSummary — the published engineering summary
 * @returns {{ highlights: string[], improvements: Array<{action, why, benefit}>, overallAssessment: string } | null}
 */
export function buildAdiAssessment(engineeringSummary) {
  if (!engineeringSummary) return null;

  const primaryCats = engineeringSummary.primary?.categories || [];
  const secondaryCats = engineeringSummary.secondary?.categories || [];
  const primaryFloor = getSeatingGroupFloor(primaryCats);
  const secondaryFloor = getSeatingGroupFloor(secondaryCats);
  const primaryHasFail = hasAnyFail(primaryCats);
  const secondaryHasFail = hasAnyFail(secondaryCats);

  const projectRating = engineeringSummary.project?.rating;
  const designation = getRoomDesignRatingDesignation(projectRating);
  const dpi = engineeringSummary.project?.designPerformanceIndex;

  const compromisedSeatCount =
    engineeringSummary.project?.reportCounts?.compromisedSeatCount || 0;
  const coverage = engineeringSummary.project?.coverage;

  // P19 (response fit) and P20 (seat consistency) for bass commentary
  const p19Primary = getBassLevel(engineeringSummary.parameterSummaries, "primary", "p19");
  const p20Primary = getBassLevel(engineeringSummary.parameterSummaries, "primary", "p20");

  const bassStrong =
    p19Primary && p20Primary &&
    LEVEL_RANK[p19Primary] >= 3 && LEVEL_RANK[p20Primary] >= 3;
  const bassModerate =
    p19Primary && p20Primary &&
    (LEVEL_RANK[p19Primary] >= 2 || LEVEL_RANK[p20Primary] >= 2);

  // Design meets objective: no FAIL, DPI >= 60 (High Performance or above)
  const meetsObjective = !primaryHasFail && dpi != null && dpi >= 60;

  // ── Highlights — always begin positively ──────────────────────────────
  const highlights = [];

  if (primaryFloor && !primaryHasFail) {
    highlights.push(`Primary listening positions perform no lower than ${primaryFloor}.`);
  }
  if (secondaryFloor && !secondaryHasFail) {
    highlights.push(`Secondary listening positions perform no lower than ${secondaryFloor}.`);
  }
  if (bassStrong) {
    highlights.push("Bass consistency is strong across the primary seating area.");
  } else if (bassModerate) {
    highlights.push("Bass response is well-controlled across the primary seating area.");
  }
  if (meetsObjective) {
    highlights.push("The selected loudspeaker system comfortably achieves the chosen design objective.");
  }
  if (coverage?.statement) {
    highlights.push("The design provides balanced coverage throughout the seating area.");
  }

  // Always have at least one positive highlight
  if (highlights.length === 0) {
    highlights.push("The design has been evaluated against CEDIA RP22 performance criteria.");
  }

  // ── Improvements to Consider — only meaningful engineering benefit ─────
  const improvements = [];

  if (compromisedSeatCount > 0) {
    improvements.push({
      action: "Consider moving the primary seating row approximately 250 mm forward to improve bass consistency.",
      why: "Seat-to-seat bass variation is the primary remaining limitation.",
      benefit: "Improved P19 response consistency across the primary listening area.",
    });
  }

  if (p20Primary && LEVEL_RANK[p20Primary] < 3) {
    improvements.push({
      action: "Consider additional rear subwoofers to improve seat-to-seat consistency.",
      why: "P20 seat consistency is below the reference threshold.",
      benefit: "More uniform bass response across all seating positions.",
    });
  }

  if (!meetsObjective && !primaryHasFail && dpi != null && dpi < 60) {
    improvements.push({
      action: "Consider increasing system capability if a higher RP22 performance level is required.",
      why: "The current system achieves a good but not reference-level performance.",
      benefit: "Higher RP22 performance levels across multiple parameters.",
    });
  }

  // ── Overall Assessment — one concise engineering conclusion ───────────
  let overallAssessment;
  if (primaryHasFail) {
    overallAssessment =
      "The remaining limitations are primarily physical and would require changes to room geometry or system specification rather than further calibration.";
  } else if (improvements.length === 0) {
    overallAssessment =
      "This design provides a balanced and consistent listening experience that meets the selected design objectives.";
  } else {
    overallAssessment =
      "The design meets its selected objectives with well-controlled performance across the listening area. The remaining improvements are refinements rather than fundamental limitations.";
  }

  return {
    highlights,
    improvements,
    overallAssessment,
    designation,
  };
}