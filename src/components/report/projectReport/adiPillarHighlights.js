/**
 * adiPillarHighlights.js
 * -----------------------
 * THE authority for the Project Report's redesigned ADI Design Highlights page.
 *
 * The page now consolidates performance into the THREE RP22 pillars — Spatial
 * Resolution (P1–P11), Dynamic Range (P12–P16) and Timbre Matching (P17–P21) —
 * the same three pillars the Technical Report, the sidebar RP22 Performance
 * Overview and the Live RP22 Performance Summary all read from.
 *
 * ADAPTIVE HIGHLIGHT SELECTION
 *   Within each pillar, ADI selects the strongest, most client-relevant results
 *   from this design's own frozen engineering evidence, ranked by the SAME
 *   canonical ASDR parameter weights the Artcoustic System Design Rating uses
 *   (PARAM_WEIGHTS, read through adiHighlightImportance). Higher-weight
 *   parameters lead; within the same weight, the higher level leads. L3 and L4
 *   results are preferred; L2 is raised only when a pillar does not already carry
 *   three L3-or-better results, so a weaker design still tells a real story and a
 *   strong one is never padded. L1 and FAIL are never positive highlights.
 *
 * SEAT-SPECIFIC PARAMETERS DISPLAY ALL RESULTS
 *   A seat-scoped parameter (P1, P4, P5, P6, P9, P10, P16, P17, P20) is shown
 *   with EVERY assessed seat's own published level — primary and secondary,
 *   better-performing and limiting alike — grouped by seating row. A room-scoped
 *   parameter shows its single published result; an RSP-scoped parameter (P19)
 *   shows its reference-seat result.
 *
 * RP22 PERFORMANCE OVERVIEW TABLE
 *   The page carries a compact three-pillar / two-seating-group overview table at
 *   its foot, reusing the SAME limiting-performance authority the restored RP22
 *   Performance Overview in the System Designer uses (buildPillarOverview). The
 *   engineering summary is adapted into the shape that authority reads, so no
 *   RP22 calculation, threshold or grading is duplicated.
 *
 * WHAT MAY BE STATED
 *   Only terminal, authoritative, non-assumed and non-provisional evidence
 *   (collectEligibleEvidence). Assumed parameters (P8, P15, P21) are excluded.
 *   No weight, score, tier or ASDR language reaches the client-facing copy.
 *
 * Pure: no React, no DOM, no side effects. Read-only throughout.
 */

import {
  collectEligibleEvidence,
  levelRank,
  levelLabel,
  isStrength,
} from './adiHighlightImportance';
import {
  PARAM_CATEGORIES,
  PARAM_CATEGORY_COLOURS,
  getHumanTitleForParam,
} from '@/components/report/technical/technicalParameterMeta';
import {
  buildPillarOverview,
  PILLAR_ORDER,
} from '@/components/rp22/performanceOverviewPillarLimits';
import { RP22_PRESENTATION_PARAMETERS } from '@/components/utils/rp22ParameterPresentation';
import { statedSummaryValue } from './projectReportPublishedValues';

/** The three pillars, in reading order, with their stable ids and colours. */
export const ADI_PILLARS = Object.freeze([
  { id: 'spatial-resolution', title: 'Spatial Resolution', colour: PARAM_CATEGORY_COLOURS['Spatial Resolution'] },
  { id: 'dynamic-range', title: 'Dynamic Range', colour: PARAM_CATEGORY_COLOURS['Dynamic Range'] },
  { id: 'timbre-matching', title: 'Timbre Matching', colour: PARAM_CATEGORY_COLOURS['Timbre Matching'] },
]);

/** The weakest level that may still be raised as a positive highlight (L2). */
const MIN_POSITIVE_LEVEL_RANK = 2;

/** The most parameters a pillar section states, so the page always fits A4. */
const MAX_PARAMS_PER_PILLAR = 4;

/** A pillar leads with its L3-or-better results; L2 fills only below this count. */
const MIN_STRONG_PER_PILLAR = 3;

/**
 * The presentation scope of one parameter: Seat, Room or RSP, read from the
 * same RP22 presentation catalog the sidebar overview and the seat-scope
 * authority read from.
 */
function presentationScope(id) {
  const entry = RP22_PRESENTATION_PARAMETERS.find((p) => p.id === id);
  return entry?.scope || 'Room';
}

/** A parameter's assessed seat rows, grouped by physical row, worst-first. */
function seatRowsFor(summary, id) {
  const rows = summary?.project?.reportCounts?.seatResultsByParameter?.[`p${id}`] || [];
  const assessed = rows.filter((row) => levelLabel(row?.level) != null);
  if (assessed.length === 0) return [];
  // Group by the row the publication itself states; seats with no row fall back
  // to a single "Seats" group so no result is ever lost.
  const byRow = new Map();
  for (const seat of assessed) {
    const rowKey = Number.isFinite(Number(seat.row)) ? Number(seat.row) : null;
    const label = rowKey != null ? `Row ${rowKey}` : 'Seats';
    if (!byRow.has(label)) byRow.set(label, []);
    byRow.get(label).push(seat);
  }
  return [...byRow.entries()].map(([label, seats]) => {
    // Sort worst-first so the limiting seat reads first within its row.
    const sorted = [...seats].sort((a, b) => levelRank(a.level) - levelRank(b.level));
    return {
      label,
      seats: sorted.map((seat) => ({
        seatId: seat.seatId,
        isPrimary: seat.isPrimary === true,
        level: levelLabel(seat.level),
        value: seat.valueFormatted || null,
      })),
      // The row's own floor: the weakest seat in it.
      floor: sorted.reduce(
        (weakest, seat) => (levelRank(seat.level) < levelRank(weakest) ? seat.level : weakest),
        sorted[0].level,
      ),
    };
  });
}

/** A room or RSP result, stated only when its own row is authoritative. */
function roomResultFor(summary, id) {
  const row = summary?.roomResultsByParameter?.[id]
    ?? summary?.roomResultsByParameter?.[String(id)]
    ?? null;
  if (!row) return null;
  const level = levelLabel(row.level);
  if (level == null) return null;
  return { level, value: statedSummaryValue(summary, id) };
}

/**
 * The parameters ADI selects for one pillar: the strongest, highest-weight
 * results this design's own evidence carries. L3 and L4 lead; L2 fills only when
 * the pillar does not already carry three L3-or-better results. L1 and FAIL are
 * never selected.
 */
function selectPillarParameters(eligible, pillarTitle) {
  const inPillar = eligible.filter((entry) => PARAM_CATEGORIES[entry.id] === pillarTitle);
  if (inPillar.length === 0) return [];

  const ranked = [...inPillar].sort((a, b) => {
    const byWeight = (Number(b.weight) || 0) - (Number(a.weight) || 0);
    if (byWeight !== 0) return byWeight;
    return levelRank(b.level) - levelRank(a.level);
  });

  const strong = ranked.filter((entry) => levelRank(entry.level) >= 3);
  const positive = ranked.filter((entry) => levelRank(entry.level) >= MIN_POSITIVE_LEVEL_RANK);

  const selected = strong.length >= MIN_STRONG_PER_PILLAR
    ? strong.slice(0, MAX_PARAMS_PER_PILLAR)
    : positive.slice(0, MAX_PARAMS_PER_PILLAR);

  return selected;
}

/** One selected parameter's full display record, with its scope-correct results. */
function buildParameterRecord(entry, summary) {
  const id = entry.id;
  const scope = presentationScope(id);
  const title = getHumanTitleForParam(id);
  const record = {
    id,
    key: entry.key,
    label: `P${id}`,
    title,
    scope,
    weight: entry.weight,
    level: entry.level,
    value: entry.value || null,
    seats: null,
    room: null,
  };
  if (scope === 'Seat') {
    record.seats = seatRowsFor(summary, id);
    // The parameter's own floor across every assessed seat, for the commentary.
    const allSeats = (record.seats || []).flatMap((row) => row.seats);
    record.level = allSeats.length > 0
      ? allSeats.reduce(
          (weakest, seat) => (levelRank(seat.level) < levelRank(weakest) ? seat.level : weakest),
          allSeats[0].level,
        )
      : entry.level;
  } else {
    const room = roomResultFor(summary, id);
    record.room = room;
    record.level = room?.level ?? entry.level;
    record.value = room?.value ?? entry.value ?? null;
  }
  return record;
}

/**
 * One pillar's short, honest commentary: what its results mean for this room,
 * stated without weights, scores or ASDR language. A pillar with no eligible
 * evidence says so plainly and claims nothing.
 */
function buildPillarCommentary(pillarTitle, parameters) {
  if (!parameters || parameters.length === 0) {
    return `${pillarTitle} is assessed from this design's own published RP22 results. No terminal result was published for this pillar, so no claim is made here.`;
  }

  const levels = parameters.map((p) => p.level).filter(Boolean);
  const worst = levels.reduce(
    (min, lvl) => (levelRank(lvl) < levelRank(min) ? lvl : min),
    levels[0] || 'L1',
  );
  const best = levels.reduce(
    (max, lvl) => (levelRank(lvl) > levelRank(max) ? lvl : max),
    levels[0] || 'L1',
  );
  const allStrong = parameters.every((p) => isStrength(p.level));
  const names = parameters.map((p) => p.label).join(', ');

  const lead = allStrong
    ? `${pillarTitle} is a genuine strength of this design.`
    : levelRank(worst) >= 2
      ? `${pillarTitle} holds across the assessed results.`
      : `${pillarTitle} carries assessed results, with room for improvement.`;

  const detail = parameters.length === 1
    ? `The published result for ${names} is the principal evidence here.`
    : `The strongest results are ${names}, with the limiting result at ${worst}.`;

  return `${lead} ${detail}`;
}

/**
 * Adapt the published engineering summary into the shape the shared
 * limiting-performance authority (buildPillarOverview) reads, so the overview
 * table reuses the SAME scope and worst-level logic as the System Designer's
 * RP22 Performance Overview without duplicating any calculation.
 */
function engineeringSummaryToOverviewInput(summary) {
  if (!summary) return null;
  const seatResults = summary?.project?.reportCounts?.seatResultsByParameter || {};
  const roomResults = summary?.roomResultsByParameter || null;
  if (!roomResults && Object.keys(seatResults).length === 0) return null;
  return {
    reportCounts: { seatResultsByParameter: seatResults },
    roomResultsByParameter: roomResults || {},
  };
}

/**
 * The redesigned ADI Design Highlights page's content: the three RP22 pillars,
 * each with its adaptively-selected parameters and their full per-seat results,
 * plus the compact RP22 Performance Overview table.
 *
 * @param {Object} sources — engineeringSummary, productsSelected, dolbyConfig
 * @returns {{ pillars: Array, overview: Object|null }}
 */
export function buildAdiPillarHighlights(sources = {}) {
  const { engineeringSummary } = sources;
  const evidence = collectEligibleEvidence(engineeringSummary);
  const eligible = evidence.eligible || [];

  const pillars = ADI_PILLARS.map((pillar) => {
    const selected = selectPillarParameters(eligible, pillar.title);
    const parameters = selected
      .map((entry) => buildParameterRecord(entry, engineeringSummary))
      .filter((p) => p != null);
    return {
      id: pillar.id,
      title: pillar.title,
      colour: pillar.colour,
      parameters,
      commentary: buildPillarCommentary(pillar.title, parameters),
      hasEvidence: parameters.length > 0,
    };
  });

  const overviewInput = engineeringSummaryToOverviewInput(engineeringSummary);
  const overview = overviewInput ? buildPillarOverview(overviewInput) : null;

  return { pillars, overview };
}

export default buildAdiPillarHighlights;