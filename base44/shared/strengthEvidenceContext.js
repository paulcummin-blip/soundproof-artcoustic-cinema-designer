/**
 * strengthEvidenceContext.js (base44/shared — CANONICAL)
 * -----------------------------------------------------
 * A saved Project Report's frozen `reportEvidence` turned into the SAME
 * story-builder context the report page builds from the published engineering
 * authority — so ONE selection runs over both, and a proposal written from the
 * frozen evidence can never state a different set of strengths from the report.
 *
 * WHAT IS ADAPTED, AND WHAT IS NOT
 *   Three facts the story builder needs are stored in the frozen evidence in a
 *   different serialisation from the live publication, and are read here exactly
 *   as the evidence states them — never recalculated, never re-graded:
 *
 *     · the system format        evidence.system.layout          → dolbyConfig
 *     · the product schedule     evidence.system.products_selected_by_layer
 *                                                                → the schedule rows
 *                                                                → the layer counts
 *     · the display              evidence.screen.display_type     → displayType
 *
 *   Everything else — the parameters and their published levels and terminal
 *   states, their seat scope, and the RP23 viewing results — is read by
 *   `summaryFromReportEvidence` (strengthImportance), which is the ONE reader of
 *   the frozen evidence. No live Project, ProjectVersion, publication pointer or
 *   Room Designer state is read anywhere on this path: the whole context is
 *   derived from the evidence object that is passed in.
 *
 * The selection returned here is the canonical one: the same eligibility rule,
 * the same canonical weights, the same story builders, the same ranking. Only
 * the report's own A4 page-budget trim is left to the report page, because a
 * document has a page and a proposal does not.
 *
 * INTERNAL ONLY. Nothing here is ever printed.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs. This
 * file IS the canonical implementation; `shared/strengthEvidenceContext.js` and
 * `src/shared/strengthEvidenceContext.js` are thin re-exports of it.
 */

import {
  summaryFromReportEvidence,
  collectEligibleEvidence,
  classifySpecTier,
  tierFloor,
  MIN_STRENGTH_LEVEL,
  MAX_HIGHLIGHTS,
} from './strengthImportance.js';

import {
  buildCandidates,
  admitStrengthStories,
  rankStrengthStories,
  auditOmittedStories,
} from './strengthStories.js';

/**
 * The product schedule's layers, and the label each layer states. The keys are
 * the frozen evidence's own `products_selected_by_layer` keys — the same layers
 * the report's product schedule states.
 */
export const STORY_LAYER_LABELS = Object.freeze({
  lcr: 'LCR',
  surrounds: 'Surrounds / wides',
  overheads: 'Overheads',
  subwoofers: 'Subwoofers',
  acoustic_treatment: 'Acoustic treatment',
});

/** Every schedule layer, in the schedule's own order. */
export const STORY_LAYER_KEYS = Object.freeze(Object.keys(STORY_LAYER_LABELS));

/** One layer's frozen entries, in the schedule's own order. */
function layerEntries(evidence, key) {
  const layer = evidence?.system?.products_selected_by_layer?.[key];
  return Array.isArray(layer) ? layer.filter(Boolean) : [];
}

/** How many units one layer's frozen entries state. */
const layerCount = (evidence, key) => layerEntries(evidence, key)
  .reduce((sum, entry) => sum + (Number(entry?.quantity) || 0), 0);

/**
 * One layer's entries in the schedule's own row format — "ARCHITECT 2-1 × 6" —
 * which is the format the shared product reader parses. Entry order, model and
 * quantity are the evidence's own; nothing is derived from them.
 */
function layerRowValue(entries) {
  return entries.map((entry) => {
    const model = String(entry?.model || '').trim();
    if (!model) return null;
    const quantity = Number(entry?.quantity) || 1;
    const position = entry?.position ? ` (${entry.position})` : '';
    return `${model} × ${quantity}${position}`;
  }).filter(Boolean).join(', ');
}

/** The frozen evidence's product schedule, in the shape the story builder reads. */
export function evidenceProductsSelected(reportEvidence) {
  const rows = STORY_LAYER_KEYS
    .map((key) => ({ key, area: STORY_LAYER_LABELS[key], value: layerRowValue(layerEntries(reportEvidence, key)) }))
    .filter((row) => row.value);
  return { rows };
}

/**
 * The layer counts the immersive-layout story states. Each count is the units
 * the frozen schedule states for that layer; where a layer states no entries,
 * the frozen architecture's own channel count is the count it states — never a
 * derived one.
 */
export function evidenceSystemConnections(reportEvidence) {
  const system = reportEvidence?.system || {};
  const counts = {};
  for (const key of STORY_LAYER_KEYS) counts[key] = layerCount(reportEvidence, key);
  counts.overheads = counts.overheads || Number(system.overhead_channels) || 0;
  counts.subwoofers = counts.subwoofers || Number(system.subwoofer_count) || 0;
  return { counts };
}

/**
 * The story-builder context of one saved report's frozen evidence: the canonical
 * summary the selection runs over, the product schedule it names, the system
 * format and the display it states, and the layer counts it states.
 *
 * `seatingPositions` is deliberately empty: the frozen evidence states each
 * viewing seat's own row, so the viewing result is read from the evidence rather
 * than from any live seating plan.
 */
export function buildStrengthSourcesFromReportEvidence(reportEvidence) {
  const evidence = reportEvidence && typeof reportEvidence === 'object' ? reportEvidence : {};
  return {
    engineeringSummary: summaryFromReportEvidence(evidence),
    productsSelected: evidenceProductsSelected(evidence),
    seatingPositions: [],
    dolbyConfig: evidence?.system?.layout || null,
    displayType: evidence?.screen?.display_type || null,
    connections: evidenceSystemConnections(evidence),
  };
}

/**
 * The ranked strengths of one saved report, read from its own frozen evidence by
 * the canonical selection. The returned `ranked` list is the same list the
 * report page ranks, in the same order, so both surfaces state the same story.
 *
 * @param {Object} reportEvidence — the frozen `reportEvidence` of a saved report
 * @param {Object} [options]
 * @param {number} [options.maxStories] — the list length cap; the canonical
 *   maximum by default, since a proposal carries the same headline set the
 *   report states.
 */
export function selectStrengthStoriesFromReportEvidence(reportEvidence, { maxStories = MAX_HIGHLIGHTS } = {}) {
  const sources = buildStrengthSourcesFromReportEvidence(reportEvidence);
  const eligible = collectEligibleEvidence(sources.engineeringSummary);
  const specTier = classifySpecTier(eligible.distribution);
  const floor = tierFloor(specTier);
  const { candidates, supporting } = buildCandidates(sources, {
    byKey: eligible.byKey,
    floor,
    connections: sources.connections,
  });
  const admission = admitStrengthStories(candidates, { floor });
  const ranked = rankStrengthStories(admission.admitted, maxStories);
  const selectedIds = new Set(ranked.map((story) => story.id));
  const rejected = auditOmittedStories({
    candidates,
    selectedIds,
    floor,
    strongCount: admission.strongCount,
    fillFromLowerLevels: admission.fillFromLowerLevels,
    engineeringSummary: sources.engineeringSummary,
    productsSelected: sources.productsSelected,
    byKey: eligible.byKey,
  });
  return {
    sources,
    specTier,
    floor,
    byKey: eligible.byKey,
    distribution: eligible.distribution,
    candidates,
    supporting,
    admission,
    ranked,
    selected: ranked.map((story) => story.id),
    rejected,
  };
}

/** The minimum level a client-facing strength must reach, for consumers here. */
export { MIN_STRENGTH_LEVEL };

export default selectStrengthStoriesFromReportEvidence;