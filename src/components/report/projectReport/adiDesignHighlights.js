/**
 * adiDesignHighlights.js
 * ----------------------
 * THE authority for the Project Report's ADI Design Highlights page.
 *
 * ADI examines this design's own frozen engineering evidence — the published
 * RP22 parameter results, their scope, RP23 viewing, the products specified and
 * the system architecture — and selects the strongest, most client-relevant
 * stories a dealer would want to point out to a client.
 *
 * HOW A STORY IS RANKED
 *   The selector ranks by the ONE existing canonical importance source — the
 *   Artcoustic System Design Rating's own parameter weights, read through
 *   adiHighlightImportance (published `effectiveWeight` where the publication
 *   carries one, else the canonical table). A story's importance is the sum of
 *   its members' weights, and a story is MATERIALLY IMPORTANT only when that sum
 *   clears the material threshold AND every member is itself an important
 *   parameter — so grouping low-importance results can never lift a story above
 *   a materially important one.
 *
 *   Rank order: materially important first, then the achieved level, then the
 *   breadth of the scope it is stated for, then its importance, then its own
 *   catalogue order. A materially important L3 therefore ranks above a
 *   low-importance L4.
 *
 * WHAT MAY BE STATED
 *   · Only terminal, authoritative, non-assumed and non-provisional evidence.
 *   · A seat-scoped strength must hold at every assessed seat (the weakest
 *     assessed seat governs), a row-scoped result is stated per row, and a
 *     narrow result is never promoted into a room-wide claim.
 *   · L1 is never a positive highlight.
 *
 * ADAPTIVE FLOOR (internal only)
 *   The design's own weighted achievement sets an internal spec tier, which sets
 *   the weakest level that may still be a positive highlight — so the page reads
 *   differently for a higher-, mid- and lower-spec design. L2 stories are only
 *   raised when the design does not already carry enough genuine strengths to
 *   fill the page.
 *
 * NONE OF THIS IS PRINTED. No weight, score, tier or ASDR language ever reaches
 * the client-facing copy — only the parameter, its published result and what it
 * means in the room.
 *
 * The story builders live in adiHighlightStories; the canonical weighting lives
 * in adiHighlightImportance. Read-only and pure throughout.
 */

import { fitHighlightsToBudget, PROJECT_REPORT_PAGE_BUDGET_MM } from './projectReportPageBudget';
import { parameter } from './adiHighlightStories';
import {
  MIN_STRENGTH_LEVEL,
  MIN_HIGHLIGHTS,
  MAX_HIGHLIGHTS,
  MIN_STRONG_STORIES,
  PARAMETER_KEYS,
  collectEligibleEvidence,
  classifySpecTier,
  tierFloor,
  scopeRank,
  levelRank,
  isStrength,
  isAssumedParameterKey,
} from './adiHighlightImportance';
import {
  buildCandidates,
  productEntries,
  seatFloor,
} from './adiHighlightStories';

export {
  MIN_STRENGTH_LEVEL,
  levelLabel,
  levelRank,
  isStrength,
} from './adiHighlightImportance';

export { productEntries } from './adiHighlightStories';

/**
 * The engineering connection each specified product has to this design's
 * published results — stated only where that result genuinely supports it.
 * The same connections are used by the highlights page and by the System &
 * Products page, so the two can never state a different reason.
 */
export function buildSpecificationConnections({
  productsSelected = null,
  engineeringSummary = null,
  dolbyConfig = null,
} = {}) {
  const lcr = productEntries(productsSelected, 'lcr');
  const surrounds = productEntries(productsSelected, 'surrounds');
  const overheads = productEntries(productsSelected, 'overheads');
  const subwoofers = productEntries(productsSelected, 'subwoofers');
  const treatment = productEntries(productsSelected, 'acoustic_treatment');

  const p12 = parameter(engineeringSummary, 12);
  const p13 = parameter(engineeringSummary, 13);
  const p14 = parameter(engineeringSummary, 14);
  const p18 = parameter(engineeringSummary, 18);

  const lcrTotal = lcr.reduce((sum, entry) => sum + entry.count, 0);
  const surroundTotal = surrounds.reduce((sum, entry) => sum + entry.count, 0);
  const overheadTotal = overheads.reduce((sum, entry) => sum + entry.count, 0);
  const subTotal = subwoofers.reduce((sum, entry) => sum + entry.count, 0);
  const treatmentTotal = treatment.reduce((sum, entry) => sum + entry.count, 0);

  return {
    lcr: lcrTotal > 0 && isStrength(p12?.level)
      ? `Screen-stage output — RP22 P12 ${p12.level}${p12.value ? `, ${p12.value}` : ''}`
      : lcrTotal > 0 ? 'Screen stage — left, centre and right' : null,
    surrounds: surroundTotal > 0 && isStrength(p13?.level)
      ? `Non-screen output — RP22 P13 ${p13.level}${p13.value ? `, ${p13.value}` : ''}`
      : surroundTotal > 0 ? 'Surround and wide coverage around the seats' : null,
    overheads: overheadTotal > 0
      ? `Overhead layer completing the ${String(dolbyConfig || 'immersive').trim()} field`
      : null,
    subwoofers: subTotal > 0
      ? [
          isStrength(p14?.level) ? `Bass output authority — RP22 P14 ${p14.level}${p14.value ? `, ${p14.value}` : ''}` : 'Bass output',
          p18 ? `extension to ${p18.value || 'the published limit'} (RP22 P18 ${p18.level})` : null,
        ].filter(Boolean).join(' · ')
      : null,
    acoustic_treatment: treatmentTotal > 0
      ? 'Planned reflection control at the first reflection points'
      : null,
    counts: { lcr: lcrTotal, surrounds: surroundTotal, overheads: overheadTotal, subwoofers: subTotal, acoustic_treatment: treatmentTotal },
  };
}

/**
 * ADI's selection for this design: the highlights, strongest first, and the
 * audited account of what was considered and why anything was left out.
 *
 * The internal spec tier and the weighted distribution the selection was read
 * from are returned for audit only — they are never printed.
 */
export function selectAdiHighlights(sources = {}) {
  const budgetMm = sources.budgetMm ?? PROJECT_REPORT_PAGE_BUDGET_MM.page;
  const evidenceMap = collectEligibleEvidence(sources.engineeringSummary);
  const distribution = evidenceMap.distribution;
  const specTier = classifySpecTier(distribution);
  const floor = tierFloor(specTier);
  const connections = buildSpecificationConnections({
    productsSelected: sources.productsSelected,
    engineeringSummary: sources.engineeringSummary,
    dolbyConfig: sources.dolbyConfig,
  });
  const { candidates, supporting } = buildCandidates(sources, {
    byKey: evidenceMap.byKey,
    floor,
    connections,
  });

  const withinFloor = candidates.filter((candidate) => levelRank(candidate.level) >= floor);
  const strong = withinFloor.filter((candidate) => levelRank(candidate.level) >= MIN_STRENGTH_LEVEL);
  // L2 is only raised where the design does not already carry enough genuine
  // strengths to fill the page — so a weaker design still tells a real story,
  // and a strong one is never padded with it.
  const fillFromLowerLevels = strong.length < MIN_STRONG_STORIES;
  const admitted = fillFromLowerLevels ? withinFloor : strong;

  const ranked = [...admitted].sort((a, b) => (
    Number(b.material) - Number(a.material)
    || levelRank(b.level) - levelRank(a.level)
    || b.importance - a.importance
    || scopeRank(b.scope) - scopeRank(a.scope)
    || a.order - b.order
  )).slice(0, MAX_HIGHLIGHTS);

  let highlights = fitHighlightsToBudget(ranked, budgetMm);

  // A page is never left short while genuine supporting evidence exists.
  if (highlights.length < MIN_HIGHLIGHTS) {
    const filler = [...supporting]
      .sort((a, b) => a.order - b.order)
      .filter((candidate) => !highlights.some((highlight) => highlight.id === candidate.id));
    highlights = fitHighlightsToBudget([...highlights, ...filler], budgetMm);
  }

  const selectedIds = new Set(highlights.map((highlight) => highlight.id));
  const rejected = [
    ...candidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        reason: levelRank(candidate.level) < floor
          ? `the published result is ${candidate.level} — below what a positive highlight may state for this design`
          : levelRank(candidate.level) < MIN_STRENGTH_LEVEL && !fillFromLowerLevels
            ? `the design already carries ${strong.length} results at L3 or better, so a ${candidate.level} result is not raised as a headline strength`
            : 'the page budget: the weakest highlight is held back rather than clipped',
      })),
    ...rejectedClaims(sources, {
      byKey: evidenceMap.byKey,
      fillFromLowerLevels,
      strongCount: strong.length,
    }),
  ];

  return {
    highlights,
    selected: highlights.map((highlight) => highlight.id),
    rejected,
    // Internal only — never printed on a client-facing page.
    specTier,
    distribution,
  };
}

/** Why each strength ADI deliberately did NOT state was left out. */
function rejectedClaims({ engineeringSummary, productsSelected } = {}, { byKey = {}, fillFromLowerLevels = false, strongCount = 0 } = {}) {
  const rejected = [];
  const p5 = seatFloor(engineeringSummary, 5);
  const p6 = seatFloor(engineeringSummary, 6);
  const p10 = seatFloor(engineeringSummary, 10);
  const p20 = seatFloor(engineeringSummary, 20);
  const p15 = byKey?.p15;
  const p21 = byKey?.p21;

  const mixedPlacement = [p5, p6, p10].filter(Boolean).map((row) => `${row.key} ${row.level}`);
  if (mixedPlacement.length > 0) {
    rejected.push({
      id: 'spatial-resolution',
      reason: `the seat-scoped placement results are mixed (${mixedPlacement.join(', ')}) — each placement measure is stated on its own result, and none of these is raised as a strength`,
    });
  }
  if (p20) {
    rejected.push({ id: 'room-wide-bass-consistency', reason: `P20 is ${p20.level} across the assessed seats — no room-wide bass consistency is claimed` });
  }
  if (p15) {
    rejected.push({ id: 'background-noise', reason: `P15 is ${p15.level}${p15.value ? ` (${p15.value})` : ''} and is an assumed design assumption, not a measured result` });
  }
  if (p21) {
    rejected.push({ id: 'early-reflections', reason: 'P21 is an assumed performance level, not a measured result' });
  }
  const p19 = byKey?.p19;
  if (p19 && !p19.eligible) {
    rejected.push({
      id: 'reference-seat-bass',
      reason: `P19 is ${p19.state || 'unavailable'} in its own published authority — a bass response claim is not raised until that authority is settled`,
    });
  }
  const p18 = byKey?.p18;
  if (p18?.level && levelRank(p18.level) < MIN_STRENGTH_LEVEL) {
    rejected.push({
      id: 'low-frequency-extension',
      reason: `P18 is ${p18.level}${p18.value ? ` (${p18.value})` : ''} — moderate extension, and stronger results are available to lead with`,
    });
  }
  if (!fillFromLowerLevels) {
    rejected.push({
      id: 'lower-level-strengths',
      reason: `this design carries ${strongCount} results at L3 or better, so L2 results are not raised as headline strengths`,
    });
  }
  const treatment = productEntries(productsSelected, 'acoustic_treatment');
  if (treatment.length === 0) {
    rejected.push({ id: 'acoustic-treatment', reason: 'no acoustic treatment is specified in this design' });
  }
  // Assumed and non-terminal parameters are audited too, so the page can account
  // for every parameter it deliberately did not state.
  for (const key of PARAMETER_KEYS) {
    const entry = byKey?.[key];
    if (!entry || isAssumedParameterKey(key)) continue;
    if (!entry.eligible && entry.state && entry.state !== 'scored') {
      rejected.push({
        id: `parameter-${key}`,
        reason: `${String(key).toUpperCase()} is ${entry.state} and carries no terminal result — it can never be a positive highlight`,
      });
    }
  }
  return rejected;
}

/** The highlights page's content: this design's own ADI selection. */
export function buildAdiDesignHighlights(sources = {}) {
  return selectAdiHighlights(sources).highlights;
}

export default buildAdiDesignHighlights;