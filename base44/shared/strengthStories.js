/**
 * strengthStories.js (base44/shared — CANONICAL)
 * ---------------------------------------------
 * The story builders, ranking and omission audit behind the ONE engineering
 * strength authority. The Project Report's ADI Design Highlights page and the
 * proposal writer both read their ranked strengths from here, so the report and
 * the proposal can never state a different set of strengths.
 *
 * Each story is built only from ELIGIBLE evidence — terminal, authoritative,
 * non-assumed and non-provisional — read through strengthImportance, and each
 * carries its own members so it can be ranked by the canonical importance of
 * those members. The evidence reads themselves (product schedule, per-seat
 * floors, published parameter rows, per-row viewing results) live in
 * strengthStoryEvidence.js and are re-exported here so both surfaces import one
 * implementation.
 *
 * Scope discipline lives here: a seat-scoped strength is governed by its weakest
 * assessed seat, a row-scoped viewing result is stated per row (rows are never
 * required to agree), P19 is stated only where its own authority is settled, and
 * placement measures are named individually rather than presented as one uniform
 * claim.
 *
 * HOW A STORY IS RANKED
 *   material first, then the achieved level, then the importance sum, then the
 *   breadth of the scope it is stated for, then its own catalogue order — so a
 *   materially important L3 ranks above a low-importance L4.
 *
 * Pure: no React, no recalculation, no side effects, no runtime-specific APIs.
 * This file IS the canonical implementation; `shared/strengthStories.js` and
 * `src/shared/strengthStories.js` are thin re-exports of it.
 */

import {
  MIN_STRENGTH_LEVEL,
  MIN_STRONG_STORIES,
  levelRank,
  isStrength,
  isAssumedParameterKey,
  scopeRank,
} from './strengthImportance.js';

import {
  productEntries,
  subwooferSummary,
  modelCountLabel,
  joinList,
  productCount,
  evidence,
  sentence,
  parameter,
  seatRows,
  seatFloor,
  viewingRows,
  rowLabel,
} from './strengthStoryEvidence.js';

// One story's own shape is assembled by the shared shape helper; this module owns
// the catalogue, the mandatory seating story and how the stories are ranked.
import { story } from './strengthStoryShape.js';

import {
  readSeatBoundaryGeometry,
  seatingBoundaryHighlightCopy,
} from './seatingBoundaryPrinciple.js';

/* The evidence reads are part of this module's own public surface: the report
   page and the proposal reader both take them from here. */
export {
  productEntries,
  subwooferSummary,
  modelCountLabel,
  joinList,
  productCount,
  evidence,
  sentence,
  parameter,
  seatRows,
  seatFloor,
  viewingRows,
  rowLabel,
};

/* ── Story assembly ───────────────────────────────────────────────────────── */
// One story's own shape is assembled by the shared shape helper
// (strengthStoryShape.js). This module owns the catalogue of stories this design
// offers, and how those stories are ranked and audited.

/** The placement parameters, with each member's own level stated individually. */
// P1 is deliberately NOT one of these. The seating distance to the nearest
// boundary has its own highlight on every design (buildSeatingClearanceStory), so
// it is never also listed among the loudspeaker placement measures and the page
// never states the same decision twice.
const PLACEMENT_KEYS = Object.freeze(['p3', 'p7', 'p11', 'p4', 'p9', 'p10', 'p5', 'p6']);
export const PLACEMENT_PHRASES = Object.freeze({
  p3: 'screen-wall speakers inside their recommended zones',
  p7: 'wide speakers inside their deviation limit',
  p11: 'no speakers outside the recommended positions',
  p4: 'screen wall speakers matched in level',
  p9: 'height speakers spaced within the vertical limit',
  p10: 'height speakers matched in level',
  p5: 'surround speakers spaced within the horizontal limit',
  p6: 'surround speakers matched in level',
});

/**
 * The candidate stories, each gated on the eligible evidence it needs.
 * Returns the evidence-backed candidates in their own catalogue order plus the
 * supporting stories that may only fill a page the evidence has not filled.
 */
export function buildCandidates(sources, { byKey, floor, connections }) {
  const {
    engineeringSummary,
    productsSelected,
    seatingPositions = [],
    dolbyConfig = null,
  } = sources;
  const candidates = [];
  const supporting = [];
  const eligible = (key) => byKey?.[key]?.eligible === true && byKey[key].level != null;
  const levelOf = (key) => byKey?.[key]?.level ?? null;
  const required = Math.max(floor, MIN_STRENGTH_LEVEL);

  // 1 · Cinema-scale dynamic capability — the screen stage and the non-screen layer.
  if (eligible('p12') && eligible('p13')) {
    const p12 = byKey.p12;
    const p13 = byKey.p13;
    const p12Row = parameter(engineeringSummary, 12);
    const p13Row = parameter(engineeringSummary, 13);
    candidates.push(story({
      id: 'dynamic-capability',
      order: 1,
      title: 'Cinema-scale dynamic range',
      category: 'Dynamic Range',
      members: [p12, p13],
      level: levelRank(p12.level) <= levelRank(p13.level) ? p12.level : p13.level,
      evidence: [
        evidence('P12', p12.level, p12Row?.value ? `Screen speakers · ${p12Row.value}` : 'Screen speakers'),
        evidence('P13', p13.level, p13Row?.value ? `Surround & overhead · ${p13Row.value}` : 'Surround & overhead'),
      ],
      explanation: `the screen channels reach ${p12Row?.value || 'their published capability'} and the surround and overhead layer reaches ${p13Row?.value || 'its published capability'} at the reference seating position, so a demanding soundtrack plays at the scale it was mixed for: dialogue stays clean while the fullest effects arrive without strain.`,
      sources: ['P12', 'P13'],
    }));
  }

  // 2 · Consistent tonal performance — must hold at every assessed seat.
  const p16 = seatFloor(engineeringSummary, 16);
  const p17 = seatFloor(engineeringSummary, 17);
  if (p16 && p17 && eligible('p16') && eligible('p17')) {
    const seats = Math.max(p16.assessed || 0, p17.assessed || 0);
    candidates.push(story({
      id: 'tonal-consistency',
      order: 2,
      title: 'A tonal balance that holds from seat to seat',
      category: 'Timbre Matching',
      members: [byKey.p16, byKey.p17],
      level: levelRank(p16.level) <= levelRank(p17.level) ? p16.level : p17.level,
      evidence: [
        // Each result is stated for its OWN speaker group. P16 and P17 are
        // seat-to-seat frequency-response variances: they state how consistently
        // one loudspeaker group holds its own tonal balance from seat to seat, and
        // neither compares one loudspeaker group with another.
        evidence('P16', p16.level, p16.value ? `Screen channels across the seats · ${p16.value}` : 'Screen channels across the assessed seats'),
        evidence('P17', p17.level, p17.value ? `Surround and overhead across the seats · ${p17.value}` : 'Surround and overhead across the assessed seats'),
      ],
      explanation: `the tonal balance holds${seats ? ` across all ${seats} assessed seating positions` : ' across the assessed seating positions'}, each result read for its own speaker group, so within the screen channels, and within the surround and overhead channels, no seat sounds noticeably thinner or brighter than the one beside it.`,
      sources: ['P16', 'P17'],
    }));
  }

  // 3 · Bass output capability — the LFE authority of the specified subwoofers.
  if (eligible('p14')) {
    const p14 = byKey.p14;
    candidates.push(story({
      id: 'bass-output',
      order: 3,
      title: 'Bass output with genuine authority',
      category: 'Bass Performance',
      members: [p14],
      scope: 'room',
      evidence: [evidence('P14', p14.level, p14.value ? `LFE output · ${p14.value}` : 'LFE output at the reference seating position')],
      explanation: `the subwoofers deliver ${p14.value ? `${p14.value} of low-frequency output` : 'the low-frequency output'} at the reference seating position, so the weight of an explosion or a bass line is reproduced rather than thinning out as the level rises.`,
      sources: ['P14'],
    }));
  }

  // 4 · Deep bass extension — how far down the system genuinely reaches.
  const p18 = byKey?.p18;
  if (eligible('p18')) {
    candidates.push(story({
      id: 'low-frequency-extension',
      order: 4,
      title: 'Extension into the lowest octaves',
      category: 'Bass Performance',
      members: [p18],
      scope: 'room',
      evidence: [evidence('P18', p18.level, p18.value ? `Extension to ${p18.value}` : 'In-room bass extension')],
      explanation: `the system reaches ${p18.value || 'the published limit'} in the room, so the lowest octaves of a film mix are reproduced instead of rolled off: the deepest rumbles are felt in the room rather than described by the speakers.`,
      sources: ['P18'],
    }));
  }

  // 5 · Extension AND response quality — raised only where BOTH results are
  // authoritative. P19 alone is never enough, and a provisional P19 disqualifies it.
  const p19 = byKey?.p19;
  if (eligible('p18') && eligible('p19')) {
    candidates.push(story({
      id: 'bass-extension-and-response',
      order: 5,
      title: 'Extended bass, held under control',
      category: 'Bass Performance',
      members: [p18, p19],
      scope: 'rsp',
      evidence: [
        evidence('P18', p18.level, p18.value ? `Extension to ${p18.value}` : 'In-room bass extension'),
        evidence('P19', p19.level, p19.value ? `At the reference seating position · ${p19.value}` : 'At the reference seating position'),
      ],
      explanation: `the system reaches ${p18.value || 'the published limit'} and the corrected response at the reference seating position sits ${p19.value || 'within the target window'} of the design target, so the deep end has both reach and control: it carries real weight without the boom that would smear the dialogue above it.`,
      sources: ['P18', 'P19'],
    }));
  }

  // 6 · Speaker placement — each strong placement measure stated on its own
  // result. Only the measures that genuinely hold are named, so a mixed spatial
  // picture is never presented as a uniformly strong one.
  const placementMembers = PLACEMENT_KEYS
    .map((key) => byKey?.[key])
    .filter((member) => member && member.eligible && levelRank(member.level) >= required);
  if (placementMembers.length >= 2) {
    const strongest = [...placementMembers].sort((a, b) => b.weight - a.weight).slice(0, 3);
    candidates.push(story({
      id: 'spatial-resolution',
      order: 6,
      title: 'Placement held to the recommended geometry',
      category: 'Spatial Resolution',
      members: placementMembers,
      scope: 'room',
      evidence: strongest.map((member) => evidence(
        String(member.key).toUpperCase(),
        member.level,
        PLACEMENT_PHRASES[member.key],
      )),
      explanation: `placement is held to the recommended geometry: ${joinList(strongest.map((member) => PLACEMENT_PHRASES[member.key]))}, so the front stage locks onto the picture and effects cross the room the way the film was mixed instead of smearing between channels.`,
      sources: placementMembers.map((member) => String(member.key).toUpperCase()),
    }));
  }

  // 7 · Immersive viewing geometry — per row, from the published RP23 authority.
  // Rows are never required to agree: each row is stated at its own result, and a
  // strength is claimed only for the rows that actually reach it.
  const rows = viewingRows(engineeringSummary, seatingPositions);
  const claimedRows = rows.filter((row) => levelRank(row.level) >= required);
  if (claimedRows.length > 0) {
    const displayNoun = sources?.displayType === 'tv' ? 'TV' : 'screen';
    const rowIndex = (row) => rows.findIndex((entry) => entry.rowNumber === row.rowNumber);
    const described = claimedRows.map((row) => {
      const angle = row.maxAngleDeg != null ? `${row.maxAngleDeg.toFixed(1)}°` : null;
      // The row's own result is stated by the pill beside its evidence line, so
      // the sentence states the geometry and never repeats the level as text.
      return `the ${rowLabel(rowIndex(row), rows.length).toLowerCase()} ${angle ? `views the ${displayNoun} at ${angle}` : 'holds a strong viewing position'}`;
    });
    const allRows = claimedRows.length === rows.length;
    const single = claimedRows.length === 1;
    candidates.push(story({
      id: 'viewing-geometry',
      order: 7,
      title: allRows ? 'Immersive viewing from every row' : single
        ? `${rowLabel(rowIndex(claimedRows[0]), rows.length)} viewing immersion`
        : 'Immersive viewing across the seating rows',
      category: 'Viewing Experience',
      // The RP23 authority is ONE evidence item, however many rows it is claimed
      // for: its canonical weight is counted once, and the weakest claimed row
      // governs the story it states.
      members: [{
        key: 'RP23',
        id: 'screen',
        level: claimedRows.reduce((acc, row) => (levelRank(row.level) < levelRank(acc) ? row.level : acc), claimedRows[0].level),
        weight: byKey?.screen?.weight || 0,
        scope: 'row',
        assessed: claimedRows.reduce((sum, row) => sum + row.seats, 0),
      }],
      level: claimedRows.reduce((acc, row) => (levelRank(row.level) < levelRank(acc) ? row.level : acc), claimedRows[0].level),
      scope: 'row',
      evidence: claimedRows.slice(0, 3).map((row) => evidence(
        'RP23',
        row.level,
        [
          rowLabel(rowIndex(row), rows.length),
          row.maxAngleDeg != null ? `${row.maxAngleDeg.toFixed(1)}°` : null,
          `${row.seats} seat${row.seats === 1 ? '' : 's'}`,
        ].filter(Boolean).join(' · '),
      )),
      explanation: `${joinList(described)}${allRows ? ', so the picture fills the field of view it was framed for from every row in the room.' : ', so those rows watch the picture at the angle it was composed for.'}`,
      sources: claimedRows.map((row) => `RP23:${row.rowNumber}:${row.level}`),
    }));
  }

  // 8 · The immersive layout — the architecture the design is built on. Where P2
  // is a genuine strength this is an evidence-backed story in its own right;
  // otherwise it supports the page without claiming a result it does not have.
  const p2 = byKey?.p2;
  const { overheads: overheadCount = 0, subwoofers: subCount = 0 } = connections?.counts || {};
  // P2 is only stated as an engineering strength where it actually reaches the
  // positive floor; below it the layout is described from the system alone and
  // no parameter result is claimed.
  const p2IsStrength = eligible('p2') && levelRank(p2.level) >= floor;
  if (dolbyConfig && overheadCount > 0) {
    const layoutStory = story({
      id: 'immersive-layout',
      order: 8,
      title: 'A high-resolution immersive layout',
      category: 'System Architecture',
      members: p2IsStrength ? [p2] : [],
      evidence: [
        evidence(String(dolbyConfig), null, 'system format'),
        p2IsStrength ? evidence('P2', p2.level, p2.value || 'discrete speakers') : null,
        evidence(`${overheadCount} overheads`, null, subCount > 0 ? `${subCount} subwoofers` : null),
      ].filter(Boolean),
      explanation: `the design is built as a ${dolbyConfig} system with ${overheadCount} overhead speakers${subCount > 0 ? ` and ${subCount} subwoofers` : ''}, so a score, rain or a helicopter moves above and around the audience instead of staying pinned to the picture.`,
      sources: p2IsStrength ? ['P2', 'architecture'] : ['architecture'],
    });
    if (p2IsStrength) candidates.push(layoutStory);
    else supporting.push(layoutStory);
  }

  // 9 · The specification, connected to the results it is there to deliver. This
  // supports a page the evidence stories have not filled; it never displaces one.
  const counts = connections?.counts || {};
  if ((counts.lcr || 0) + (counts.surrounds || 0) + (counts.overheads || 0) + (counts.subwoofers || 0) > 0) {
    const lcr = productEntries(productsSelected, 'lcr');
    const surrounds = productEntries(productsSelected, 'surrounds');
    const overheads = productEntries(productsSelected, 'overheads');
    const subs = subwooferSummary(productEntries(productsSelected, 'subwoofers'));
    const treatment = productEntries(productsSelected, 'acoustic_treatment');

    const jobs = [
      lcr.length > 0 && isStrength(levelOf('p12')) && `${modelCountLabel(lcr)} for the P12 screen-stage capability`,
      surrounds.length > 0 && isStrength(levelOf('p13')) && `${modelCountLabel(surrounds)} for the P13 non-screen output`,
      overheads.length > 0 && `${modelCountLabel(overheads)} for the overhead field`,
      subs.length > 0 && isStrength(levelOf('p14')) && `${modelCountLabel(subs)} for the P14 bass output capability`,
      treatment.length > 0 && `${modelCountLabel(treatment)} for planned reflection control`,
    ].filter(Boolean);

    if (jobs.length > 0) {
      supporting.push(story({
        id: 'product-selection',
        order: 20,
        title: 'Specified for this room',
        category: 'Specification',
        members: [],
        evidence: [
          lcr.length > 0 && evidence('LCR', null, modelCountLabel(lcr)),
          surrounds.length > 0 && evidence('Surrounds / wides', null, modelCountLabel(surrounds)),
          overheads.length > 0 && evidence('Overheads', null, modelCountLabel(overheads)),
          subs.length > 0 && evidence('Subwoofers', null, modelCountLabel(subs)),
          treatment.length > 0 && evidence('Treatment', null, modelCountLabel(treatment)),
        ].filter(Boolean).slice(0, 3),
        explanation: `every part of the specification carries a job: ${joinList(jobs)}, so the budget goes to the parts that shape what the room does.`,
        sources: ['products'],
      }));
    }
  }

  return { candidates, supporting };
}

/* ── RP22 Parameter 1: the seating decision, stated on every design ────────── */

/**
 * The highlights a page states on EVERY design that carries the evidence for
 * them, whatever the ranking decides. The seating decision is the one a client
 * always asks about — whether the seats can be pushed against a wall to keep the
 * floor space — so it is never left to the ranking to decide whether it is
 * mentioned.
 */
export const MANDATORY_STORY_IDS = Object.freeze(['seating-clearance']);

/**
 * THE SEATING CLEARANCE HIGHLIGHT — RP22 Parameter 1, the seating distance to the
 * room's nearest boundary.
 *
 * Stated on every design whose evidence carries a P1 result at all. The measured
 * P1 result is stated as its own published result wherever it is a genuine
 * strength; where it is not, the card explains the design decision behind the
 * seating with no level beside it and claims no positive result, and it carries
 * the supporting emphasis it then deserves.
 *
 * The words come from the approved seating-boundary authority
 * (seatingBoundaryPrinciple), read from this design's OWN seating and room
 * geometry, so the explanation is specific to this room. It states no distance and
 * no level of its own: the card can never contradict the published result beside
 * it, the distance to the nearest boundary is never confused with the distance to
 * the wall behind the seating, and no bass or measured outcome is promised.
 *
 * @param {Object} sources — the story-builder sources (seatingPositions/roomDims,
 *   or a prebuilt seatBoundaryGeometry)
 * @param {Object} params
 * @param {Object} params.byKey — the eligible evidence map
 * @returns {Object|null} the story, or null where the design carries no P1 result
 */
export function buildSeatingClearanceStory(sources = {}, { byKey = {} } = {}) {
  const p1 = byKey?.p1;
  if (!p1) return null;

  const geometry = sources.seatBoundaryGeometry
    || readSeatBoundaryGeometry({ seats: sources.seatingPositions, roomDims: sources.roomDims });
  const explanation = seatingBoundaryHighlightCopy(geometry);
  if (!explanation) return null;

  const positive = isStrength(p1.level);
  return story({
    id: 'seating-clearance',
    order: 9,
    title: 'Seating placed clear of the room\'s boundaries',
    category: 'Seating Position',
    members: positive ? [p1] : [],
    level: p1.level ?? null,
    scope: 'seat',
    evidence: [
      evidence(
        'P1',
        positive ? p1.level : null,
        positive && p1.value ? `Nearest room boundary · ${p1.value}` : 'Nearest room boundary',
      ),
    ],
    explanation,
    sources: positive ? ['P1'] : [],
  });
}

/* ── Admission, ranking and the omission audit ─────────────────────────────── */

/** The canonical ranking order: material, then level, importance, scope, order. */
export const rankComparator = (a, b) => (
  Number(b.material) - Number(a.material)
  || levelRank(b.level) - levelRank(a.level)
  || b.importance - a.importance
  || scopeRank(b.scope) - scopeRank(a.scope)
  || a.order - b.order
);

/**
 * The stories a page states, with the mandatory explanations kept in place: where
 * the ranking or the page's own cap would leave one out, the weakest story that is
 * not mandatory gives up its place instead, and the page still reads strongest
 * first. Nothing is added to the page by this: the mandatory stories answer a
 * question every client asks, and each states its own published result or explains
 * a design decision without claiming one.
 */
export function withMandatoryStories({ ranked = [], candidates = [], maxStories = null } = {}) {
  const cap = Number.isFinite(Number(maxStories)) ? Number(maxStories) : null;
  const settled = [...ranked].sort(rankComparator);

  for (const id of MANDATORY_STORY_IDS) {
    if (!settled.some((entry) => entry.id === id)) {
      const mandatory = (Array.isArray(candidates) ? candidates : []).find((entry) => entry.id === id);
      if (!mandatory) continue;
      settled.push(mandatory);
    }
    if (!cap || settled.length <= cap) continue;
    for (let index = settled.length - 1; index >= 0 && settled.length > cap; index -= 1) {
      if (MANDATORY_STORY_IDS.includes(settled[index].id)) continue;
      settled.splice(index, 1);
    }
  }

  return settled.sort(rankComparator);
}

/**
 * The stories that may be stated for a design of this quality: everything at or
 * above the adaptive floor, with the L2 band admitted only when the design does
 * not already carry enough genuine strengths of its own. A weaker design is
 * therefore told a real story about its strongest results, and a strong one is
 * never padded with a modest result.
 */
export function admitStrengthStories(candidates = [], { floor = MIN_STRENGTH_LEVEL } = {}) {
  const withinFloor = candidates.filter((candidate) => levelRank(candidate.level) >= floor);
  const strong = withinFloor.filter((candidate) => levelRank(candidate.level) >= MIN_STRENGTH_LEVEL);
  const fillFromLowerLevels = strong.length < Number(MIN_STRONG_STORIES);
  return {
    withinFloor,
    strong,
    strongCount: strong.length,
    fillFromLowerLevels,
    admitted: fillFromLowerLevels ? withinFloor : strong,
  };
}

/** The ranked stories: material first, then level, importance, scope, catalogue order. */
export function rankStrengthStories(admitted = [], maxStories = null) {
  const ranked = [...admitted].sort(rankComparator);
  return Number.isFinite(maxStories) ? ranked.slice(0, maxStories) : ranked;
}

/**
 * Every strength the design offered and what became of it. The list is produced
 * for both surfaces: the report audits it under the page, and the proposal
 * records it beside the draft it was written from, so what was left out and why
 * is never a matter of opinion.
 *
 * @param {Object} params
 * @param {Array} params.candidates — every story the evidence offered
 * @param {Set|Array} params.selectedIds — the stories that were stated
 * @param {Object} params.byKey — the eligible evidence map
 * @param {number} params.floor — the adaptive floor this design was read at
 */
export function auditOmittedStories({
  candidates = [],
  selectedIds = [],
  floor = MIN_STRENGTH_LEVEL,
  strongCount = 0,
  fillFromLowerLevels = false,
  engineeringSummary = null,
  productsSelected = null,
  byKey = {},
} = {}) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const rejected = candidates
    .filter((candidate) => !selected.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      reason: levelRank(candidate.level) < floor
        ? `the published result is ${candidate.level} — below what a positive strength may state for this design`
        : levelRank(candidate.level) < MIN_STRENGTH_LEVEL && !fillFromLowerLevels
          ? `the design already carries ${strongCount} results at L3 or better, so a ${candidate.level} result is not raised as a headline strength`
          : 'the page budget: the weakest strength is held back rather than clipped',
    }));

  // Why each strength the design deliberately did NOT state was left out.
  const p5 = seatFloor(engineeringSummary, 5);
  const p6 = seatFloor(engineeringSummary, 6);
  const p10 = seatFloor(engineeringSummary, 10);
  const p20 = seatFloor(engineeringSummary, 20);
  const p15 = byKey?.p15;
  const p21 = byKey?.p21;

  const mixedPlacement = [p5, p6, p10].filter(Boolean).map((row) => `${row.key} ${row.level}`);
  if (mixedPlacement.length > 0) {
    rejected.push({
      id: 'seat-placement-consistency',
      reason: `the seat-scoped placement results are mixed (${mixedPlacement.join(', ')}) — each placement measure is stated on its own result, and no seat-by-seat placement consistency is claimed`,
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
  // Assumed and non-terminal parameters are audited too, so both surfaces can
  // account for every parameter they deliberately did not state.
  for (const key of Object.keys(byKey || {})) {
    const entry = byKey[key];
    if (!entry || isAssumedParameterKey(key)) continue;
    if (!entry.eligible && entry.state && entry.state !== 'scored') {
      rejected.push({
        id: `parameter-${key}`,
        reason: `${String(key).toUpperCase()} is ${entry.state} and carries no terminal result — it can never be a positive strength`,
      });
    }
  }
  return rejected;
}

export default buildCandidates;