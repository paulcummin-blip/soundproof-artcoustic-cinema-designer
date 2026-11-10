// coordinatedSearchOptions.js
// ---------------------------------------------------------------------------
// Present a small number of genuinely distinct, designer-facing options from
// the coordinated search results.
//
// The baseline (designer's preferred layout) is ALWAYS retained as the first
// option. Alternatives are added only when they are qualified, material, and
// genuinely distinct. No automatic Apply.
// ---------------------------------------------------------------------------

import { compareWithBaseline, areDistinctOptions, preferSimpler } from "./coordinatedSearchRanking";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Build a designer-facing option from a qualified candidate's evidence and
 * metadata.
 *
 * @param {object} params
 * @param {string} params.optionId — "baseline" | "alternative-A" | ...
 * @param {string} params.label — short human label
 * @param {object} params.evidence — canonical evidence
 * @param {object} params.meta — { quantity, coordinates, seatingPositions, seatingOffsetMm, crossover, tuning, complexity }
 * @returns {object} option
 */
export function buildOption({ optionId, label, evidence, meta = {} }) {
  return {
    optionId,
    label,
    evidence,
    meta: {
      quantity: num(meta.quantity),
      coordinates: Array.isArray(meta.coordinates) ? meta.coordinates : [],
      seatingPositions: Array.isArray(meta.seatingPositions) ? meta.seatingPositions : [],
      seatingOffsetMm: num(meta.seatingOffsetMm),
      crossover: meta.crossover || null,
      tuning: Array.isArray(meta.tuning) ? meta.tuning : [],
      complexity: meta.complexity || "baseline",
    },
  };
}

/**
 * Build the complete set of designer-facing options from the search results.
 *
 * The baseline is always option A. Alternatives are added only when:
 *   1. They are acoustically qualified.
 *   2. They are materially better than the baseline (existing materiality).
 *   3. They are genuinely distinct from each other.
 *   4. They are not dominated by a simpler equivalent alternative.
 *
 * @param {object} params
 * @param {object} params.baseline — { evidence, meta }
 * @param {Array}  params.alternatives — [{ evidence, meta }]
 * @returns {object} { options, recommendations, summary }
 */
export function buildOptions({ baseline, alternatives = [] }) {
  const options = [];
  const recommendations = [];

  // ── Option A: Baseline (always retained) ──────────────────────────
  const baselineOption = buildOption({
    optionId: "baseline",
    label: "Keep your proposed design",
    evidence: baseline.evidence,
    meta: { ...baseline.meta, complexity: "baseline" },
  });
  options.push(baselineOption);

  if (!baseline.evidence) {
    return { options, recommendations: [], summary: { baselineQualified: false, alternativesPresented: 0 } };
  }

  // ── Evaluate alternatives against the baseline ────────────────────
  const evaluated = [];
  for (const alt of alternatives) {
    if (!alt?.evidence) continue;

    const comparison = compareWithBaseline(baseline.evidence, alt.evidence);

    if (!comparison.recommended) continue;

    evaluated.push({
      alt,
      comparison,
      simplicityScore: alt.meta?.quantity || 4,
    });
  }

  // ── Sort: material improvement strength, then prefer simpler ──────
  evaluated.sort((a, b) => {
    const aP20Gain = num(a.comparison.comparison?.p20Primary?.levelDelta) || 0;
    const bP20Gain = num(b.comparison.comparison?.p20Primary?.levelDelta) || 0;
    if (aP20Gain !== bP20Gain) return bP20Gain - aP20Gain;
    return preferSimpler(
      { ...a.alt.evidence, quantity: a.alt.meta?.quantity },
      { ...b.alt.evidence, quantity: b.alt.meta?.quantity },
    );
  });

  // ── Retain genuinely distinct alternatives only ──────────────────
  const retained = [];
  for (const ev of evaluated) {
    const isDistinct = retained.every((r) =>
      areDistinctOptions(ev.alt.meta, r.alt.meta),
    );
    if (!isDistinct) continue;
    retained.push(ev);
  }

  // ── Build option objects ─────────────────────────────────────────
  let optionLetter = "A";
  for (const ev of retained) {
    optionLetter = String.fromCharCode(optionLetter.charCodeAt(0) + 1);
    const label = buildAlternativeLabel(ev.alt.meta);
    const option = buildOption({
      optionId: `alternative-${optionLetter}`,
      label,
      evidence: ev.alt.evidence,
      meta: { ...ev.alt.meta, complexity: ev.alt.meta?.quantity > (baseline.meta?.quantity || 0) ? "more-complex" : "similar" },
    });
    options.push(option);

    recommendations.push({
      optionId: option.optionId,
      reason: ev.comparison.reason,
      comparison: ev.comparison.comparison,
      whatChanges: describeWhatChanges(baseline.meta, ev.alt.meta),
      whatImproves: describeWhatImproves(ev.comparison.comparison),
      complexityNote: describeComplexity(baseline.meta, ev.alt.meta),
      why: ev.comparison.reason,
    });
  }

  return {
    options,
    recommendations,
    summary: {
      baselineQualified: true,
      alternativesPresented: recommendations.length,
      alternativesEvaluated: evaluated.length,
      alternativesDistinct: retained.length,
    },
  };
}

function buildAlternativeLabel(meta) {
  const parts = [];
  if (meta?.quantity) parts.push(`${meta.quantity} sub${meta.quantity > 1 ? "s" : ""}`);
  if (meta?.seatingOffsetMm && meta.seatingOffsetMm !== 0) {
    const dir = meta.seatingOffsetMm < 0 ? "toward screen" : "away from screen";
    parts.push(`move seating ${Math.abs(meta.seatingOffsetMm)} mm ${dir}`);
  }
  if (meta?.crossover) parts.push(`${meta.crossover.frequencyHz || 80} Hz crossover`);
  if (parts.length === 0) return "Alternative layout";
  return parts.join(", ");
}

function describeWhatChanges(baselineMeta, altMeta) {
  const changes = [];
  if (altMeta?.quantity && altMeta.quantity !== baselineMeta?.quantity) {
    changes.push(`Subwoofer count: ${baselineMeta?.quantity || "?"} → ${altMeta.quantity}`);
  }
  if (altMeta?.seatingOffsetMm && altMeta.seatingOffsetMm !== 0) {
    const dir = altMeta.seatingOffsetMm < 0 ? "toward screen" : "away from screen";
    changes.push(`Seating: move ${Math.abs(altMeta.seatingOffsetMm)} mm ${dir}`);
  }
  if (altMeta?.coordinates && baselineMeta?.coordinates) {
    const moved = positionsChanged(baselineMeta.coordinates, altMeta.coordinates);
    if (moved) changes.push("Subwoofer positions changed");
  }
  return changes;
}

function describeWhatImproves(comparison) {
  if (!comparison) return [];
  const improvements = [];
  if (comparison.p20Primary?.levelDelta > 0) {
    improvements.push(`Primary P20: L${comparison.p20Primary.baselineLevel} → L${comparison.p20Primary.candidateLevel}`);
  }
  if (comparison.p19?.levelDelta > 0) {
    improvements.push(`P19: L${comparison.p19.baselineLevel} → L${comparison.p19.candidateLevel}`);
  }
  if (comparison.p20Secondary?.levelDelta > 0) {
    improvements.push(`Secondary P20: L${comparison.p20Secondary.baselineLevel} → L${comparison.p20Secondary.candidateLevel}`);
  }
  return improvements;
}

function describeComplexity(baselineMeta, altMeta) {
  const baseQty = baselineMeta?.quantity || 0;
  const altQty = altMeta?.quantity || 0;
  if (altQty > baseQty) {
    return `Adds ${altQty - baseQty} subwoofer${altQty - baseQty > 1 ? "s" : ""} and associated installation complexity`;
  }
  if (altQty === baseQty) {
    return "Same subwoofer count — different physical placement";
  }
  return "Simpler subwoofer arrangement";
}

function positionsChanged(baseCoords, altCoords) {
  if (!Array.isArray(baseCoords) || !Array.isArray(altCoords)) return false;
  if (baseCoords.length !== altCoords.length) return true;
  for (let i = 0; i < baseCoords.length; i++) {
    if (Math.abs((baseCoords[i]?.x || 0) - (altCoords[i]?.x || 0)) > 0.01) return true;
    if (Math.abs((baseCoords[i]?.y || 0) - (altCoords[i]?.y || 0)) > 0.01) return true;
  }
  return false;
}