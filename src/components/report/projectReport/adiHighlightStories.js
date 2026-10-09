/**
 * adiHighlightStories.js
 * ----------------------
 * The story builders behind the ADI Design Highlights selector.
 *
 * Each story is built only from ELIGIBLE evidence — terminal, authoritative,
 * non-assumed and non-provisional — read through adiHighlightImportance, and each
 * carries its own members so the selector can rank it by the canonical importance
 * of those members.
 *
 * Scope discipline lives here: a seat-scoped strength is governed by its weakest
 * assessed seat, a row-scoped viewing result is stated per row (rows are never
 * required to agree), P19 is stated only where its own authority is settled, and
 * placement measures are named individually rather than presented as one uniform
 * claim.
 *
 * Pure: no React, no recalculation, no side effects.
 */

import { readReportParameter } from '@/components/report/reportParameterEvidence';
import { getOfficialRp22Title } from '@/components/utils/rp22OfficialTitles';
import {
  MIN_STRENGTH_LEVEL,
  levelLabel,
  levelRank,
  isStrength,
  storyImportance,
  isMaterialStory,
} from './adiHighlightImportance';

const NONE_SPECIFIED = /^none specified$/i;

/* ── Product schedule helpers ─────────────────────────────────────────────── */

/** One product schedule row, split into its own entries: { name, count, position }. */
export function productEntries(productsSelected, key) {
  const row = (productsSelected?.rows || []).find((entry) => entry?.key === key);
  const value = String(row?.value || '').trim();
  if (!value || NONE_SPECIFIED.test(value)) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !NONE_SPECIFIED.test(part))
    .map((part) => ({
      label: part,
      name: part.replace(/×\s*\d+/, '').replace(/\([^)]*\)/g, '').trim(),
      count: Number((part.match(/×\s*(\d+)/) || [])[1] || 1),
      position: (part.match(/\(([^)]*)\)/) || [])[1] || null,
    }));
}

const totalCount = (entries) => entries.reduce((sum, entry) => sum + entry.count, 0);

/** Subwoofers stated by model with their combined count: "SUB4-12 × 4". */
export function subwooferSummary(entries) {
  const byModel = new Map();
  for (const entry of entries) {
    if (!entry.name) continue;
    byModel.set(entry.name, (byModel.get(entry.name) || 0) + entry.count);
  }
  return [...byModel.entries()].map(([name, count]) => ({ name, count }));
}

export const modelCountLabel = (entries) => entries
  .map((entry) => (entry.count > 1 ? `${entry.name} × ${entry.count}` : entry.name))
  .filter(Boolean)
  .join(', ');

/** "A, B and C" — the page's own list style. */
export function joinList(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/* ── Evidence line helpers ────────────────────────────────────────────────── */

/**
 * One evidence line. The published level may be stated in the line's own key
 * ("P12 L4") or given explicitly; either way it is carried as the line's level,
 * so the page colours each piece of evidence by its own published grade.
 */
const levelFromKey = (key) => {
  const match = /(?:^|\s)(L[1-4])$/.exec(String(key || '').trim());
  return match ? match[1] : null;
};

export const evidence = (key, level, value, detail = null) => ({
  key,
  level: level ?? levelFromKey(key),
  value: value ?? null,
  detail,
});

export const sentence = (text) => {
  const trimmed = String(text || '').trim();
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : '';
};

/* ── Published evidence reads ─────────────────────────────────────────────── */

/** One published parameter result, by its RP22 number. */
export function parameter(summary, id) {
  if (!summary) return null;
  const row = readReportParameter(summary, id);
  const level = levelLabel(row?.level);
  if (level == null) return null;
  const value = row?.value && row.value !== '—' ? row.value : null;
  return { key: `P${id}`, id, level, value, detail: null, scope: row?.scope || 'room' };
}

/** Every assessed seat result published for one parameter. */
export function seatRows(summary, id) {
  const rows = summary?.project?.reportCounts?.seatResultsByParameter?.[`p${id}`] || [];
  return rows.filter((row) => levelLabel(row?.level) != null);
}

/**
 * The parameter's all-seat floor: the weakest assessed seat governs, so a
 * strength claimed from this result holds at every seat that was assessed.
 */
export function seatFloor(summary, id) {
  const rows = seatRows(summary, id);
  if (rows.length === 0) return null;
  const worst = rows.reduce(
    (acc, row) => (levelRank(row.level) < levelRank(acc.level) ? row : acc),
    rows[0],
  );
  const level = levelLabel(worst.level);
  return {
    key: `P${id}`,
    id,
    level,
    value: worst.valueFormatted || null,
    detail: rows.length > 1 ? `worst of ${rows.length} assessed seats` : 'assessed seat',
    scope: 'seat',
    assessed: rows.length,
  };
}

/** The RP23 viewing result of every seating row, from the published per-seat authority. */
export function viewingRows(summary, seatingPositions) {
  const perSeat = summary?.viewing?.per_seat || [];
  if (perSeat.length === 0) return [];
  const rowBySeatId = new Map(
    (Array.isArray(seatingPositions) ? seatingPositions : [])
      .map((seat) => [String(seat?.id), Number(seat?.rowNumber ?? seat?.row)]),
  );
  const byRow = new Map();
  for (const seat of perSeat) {
    const rowNumber = rowBySeatId.get(String(seat?.seat_id));
    if (!Number.isFinite(rowNumber)) continue;
    const level = levelLabel(seat?.rp23_level);
    const angle = Number(seat?.horizontal_angle_deg);
    const entry = byRow.get(rowNumber) || { rowNumber, levels: [], angles: [], seats: 0 };
    entry.seats += 1;
    if (level) entry.levels.push(level);
    if (Number.isFinite(angle)) entry.angles.push(angle);
    byRow.set(rowNumber, entry);
  }
  return [...byRow.values()]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map((entry) => ({
      rowNumber: entry.rowNumber,
      seats: entry.seats,
      level: entry.levels.length
        ? entry.levels.reduce((acc, level) => (levelRank(level) < levelRank(acc) ? level : acc), entry.levels[0])
        : null,
      minAngleDeg: entry.angles.length ? Math.min(...entry.angles) : null,
      maxAngleDeg: entry.angles.length ? Math.max(...entry.angles) : null,
    }));
}

/** "Front row" / "Middle row" / "Rear row", from the row's place in the plan. */
export function rowLabel(index, total) {
  if (total <= 1) return 'Seating row';
  if (index === 0) return 'Front row';
  if (index === total - 1) return 'Rear row';
  return total === 3 ? 'Middle row' : `Row ${index + 1}`;
}

/* ── Story assembly ───────────────────────────────────────────────────────── */

/**
 * A story's importance and its presentation emphasis are kept apart: the ranking
 * uses the canonical weight sum, while the card's own emphasis only ever follows
 * how material the story is and what level it reaches. No weight is displayed.
 */
function emphasise(candidate) {
  if (candidate.material && levelRank(candidate.level) >= 4) return 3;
  if (candidate.material || levelRank(candidate.level) >= MIN_STRENGTH_LEVEL) return 2;
  return 1;
}

function story({ id, order, title, category, members, evidence: lines, explanation, sources, scope, level }) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  const candidate = {
    id,
    order,
    title,
    category,
    members: list,
    importance: storyImportance(list),
    material: isMaterialStory(list),
    evidence: (Array.isArray(lines) ? lines : []).filter(Boolean),
    explanation: sentence(explanation),
    sources: sources || list.map((member) => String(member.key).toUpperCase()),
    scope: scope || list[0]?.scope || 'room',
    level: level || list.reduce(
      (acc, member) => (acc == null || levelRank(member.level) < levelRank(acc) ? member.level : acc),
      null,
    ),
  };
  candidate.weight = emphasise(candidate);
  return candidate;
}

/** The placement parameters, with each member's own level stated individually. */
const PLACEMENT_KEYS = Object.freeze(['p3', 'p7', 'p11', 'p1', 'p4', 'p9', 'p10', 'p5', 'p6']);
const PLACEMENT_PHRASES = Object.freeze({
  p3: 'screen-wall speakers inside their recommended zones',
  p7: 'wide speakers inside their deviation limit',
  p11: 'no speakers outside the recommended positions',
  p1: 'the seating distance from the room walls',
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
      title: 'Cinema-scale dynamic capability',
      category: 'Dynamic Range',
      members: [p12, p13],
      level: levelRank(p12.level) <= levelRank(p13.level) ? p12.level : p13.level,
      evidence: [
        evidence(`P12 ${p12.level}`, null, p12Row?.value ? `Screen speakers · ${p12Row.value}` : 'Screen speakers'),
        evidence(`P13 ${p13.level}`, null, p13Row?.value ? `Surround & overhead · ${p13Row.value}` : 'Surround & overhead'),
      ],
      explanation: `the screen stage is assessed at ${p12Row?.value || p12.level} and the surround and overhead layer at ${p13Row?.value || p13.level}, so the system carries the output capability that demanding film soundtracks ask for at the reference seating position.`,
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
      title: 'Consistent tonal performance',
      category: 'Timbre Matching',
      members: [byKey.p16, byKey.p17],
      level: levelRank(p16.level) <= levelRank(p17.level) ? p16.level : p17.level,
      evidence: [
        evidence(`P16 ${p16.level}`, null, p16.value ? `Screen-to-surround level match · ${p16.value}` : 'Screen-to-surround level match'),
        evidence(`P17 ${p17.level}`, null, p17.value ? `Across the seating area · ${p17.value}` : 'Across the seating area'),
      ],
      explanation: `both parameters hold at ${levelRank(p16.level) <= levelRank(p17.level) ? p16.level : p17.level}${seats ? ` across all ${seats} assessed seating positions` : ' across the assessed seating positions'}, so the tonal character stays consistent as sound moves between the screen, surround and overhead channels.`,
      sources: ['P16', 'P17'],
    }));
  }

  // 3 · Bass output capability — the LFE authority of the specified subwoofers.
  if (eligible('p14')) {
    const p14 = byKey.p14;
    candidates.push(story({
      id: 'bass-output',
      order: 3,
      title: 'Bass output capability',
      category: 'Bass Performance',
      members: [p14],
      scope: 'room',
      evidence: [evidence(`P14 ${p14.level}`, null, p14.value ? `LFE output · ${p14.value}` : 'LFE output at the reference seating position')],
      explanation: `the subwoofers deliver ${p14.value || p14.level} of low-frequency output at the reference seating position, the output authority the bass system is specified to reach.`,
      sources: ['P14'],
    }));
  }

  // 4 · Deep bass extension — how far down the system genuinely reaches.
  const p18 = byKey?.p18;
  if (eligible('p18')) {
    candidates.push(story({
      id: 'low-frequency-extension',
      order: 4,
      title: 'Deep bass extension',
      category: 'Bass Performance',
      members: [p18],
      scope: 'room',
      evidence: [evidence(`P18 ${p18.level}`, null, p18.value ? `Extension to ${p18.value}` : 'In-room bass extension')],
      explanation: `the system reaches ${p18.value || 'the published limit'} in the room, so the lowest octaves of a film mix are reproduced rather than rolled off.`,
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
      title: 'Bass extension and response quality',
      category: 'Bass Performance',
      members: [p18, p19],
      scope: 'rsp',
      evidence: [
        evidence(`P18 ${p18.level}`, null, p18.value ? `Extension to ${p18.value}` : 'In-room bass extension'),
        evidence(`P19 ${p19.level}`, null, p19.value ? `At the reference seating position · ${p19.value}` : 'At the reference seating position'),
      ],
      explanation: `the system reaches ${p18.value || 'the published limit'} and the corrected response at the reference seating position sits ${p19.value || 'within the target window'} of the design target, so the bass is both extended and even.`,
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
      title: 'Speaker placement within the recommended zones',
      category: 'Spatial Resolution',
      members: placementMembers,
      scope: 'room',
      evidence: strongest.map((member) => evidence(
        `${String(member.key).toUpperCase()} ${member.level}`,
        null,
        PLACEMENT_PHRASES[member.key] || getOfficialRp22Title(member.id),
      )),
      explanation: `${joinList(strongest.map((member) => PLACEMENT_PHRASES[member.key] || getOfficialRp22Title(member.id)))}, each stated on its own published result.`,
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
      return `the ${rowLabel(rowIndex(row), rows.length).toLowerCase()} ${angle ? `views the ${displayNoun} at ${angle}` : 'holds a strong viewing position'} (RP23 ${row.level})`;
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
        `RP23 · ${rowLabel(rowIndex(row), rows.length)} ${row.level}`,
        null,
        row.maxAngleDeg != null ? `${row.maxAngleDeg.toFixed(1)}° · ${row.seats} seat${row.seats === 1 ? '' : 's'}` : `${row.seats} seats`,
      )),
      explanation: `${joinList(described)}${allRows ? ', so every seating row sits inside a strong viewing position.' : ', the rows that reach it are stated on their own result.'}`,
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
        p2IsStrength ? evidence(`P2 ${p2.level}`, null, p2.value || 'discrete speakers') : null,
        evidence(`${overheadCount} overheads`, null, subCount > 0 ? `${subCount} subwoofers` : null),
      ].filter(Boolean),
      explanation: `the design is built as a ${dolbyConfig} system with ${overheadCount} overhead speakers${subCount > 0 ? ` and ${subCount} subwoofers` : ''}, so effects move above and around the audience instead of staying on the screen plane.`,
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
        title: 'Purposeful product selection',
        category: 'Specification',
        members: [],
        evidence: [
          lcr.length > 0 && evidence('LCR', null, modelCountLabel(lcr)),
          surrounds.length > 0 && evidence('Surrounds / wides', null, modelCountLabel(surrounds)),
          overheads.length > 0 && evidence('Overheads', null, modelCountLabel(overheads)),
          subs.length > 0 && evidence('Subwoofers', null, modelCountLabel(subs)),
          treatment.length > 0 && evidence('Treatment', null, modelCountLabel(treatment)),
        ].filter(Boolean).slice(0, 3),
        explanation: `every part of the specification carries a job: ${joinList(jobs)}.`,
        sources: ['products'],
      }));
    }
  }

  return { candidates, supporting };
}

/** Unused by the selector but kept alongside the schedule helpers. */
export const productCount = totalCount;

export default buildCandidates;