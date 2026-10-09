/**
 * adiDesignHighlights.js
 * ----------------------
 * THE authority for the Project Report's ADI Design Highlights page.
 *
 * ADI examines this design's own frozen engineering evidence — the published
 * RP22 parameter results, their primary/secondary seat scope, RP23 viewing,
 * the products specified, the room and seating geometry, the bass authority and
 * the system architecture — and selects the four to six strongest highlights a
 * dealer would want to point out to a client.
 *
 * RULES THIS AUTHORITY OBEYS
 *   · A highlight is only raised where the published evidence genuinely
 *     supports it (L3 or better — the floor a client-facing strength must
 *     reach). Nothing is inferred, averaged, re-graded or invented.
 *   · A seat-scoped strength must hold at EVERY assessed seat: the weakest
 *     assessed seat governs, so a narrow result can never become a room-wide
 *     claim.
 *   · A result that is only assessed at one position is stated AS that
 *     position (P19 is the reference seating position, never "the room").
 *   · Weak and assumed parameters raise no highlight at all.
 *   · Every highlight carries its own evidence (parameter + level + stated
 *     value) and its internal source list.
 *
 * The page-fit guard lives in projectReportPageBudget: the list is ranked
 * strongest-first and the weakest highlights are dropped if the page would not
 * fit, so the page can never clip.
 *
 * Read-only and pure: no React, no recalculation, no side effects.
 */

import { readReportParameter } from '@/components/report/reportParameterEvidence';
import { fitHighlightsToBudget, PROJECT_REPORT_PAGE_BUDGET_MM } from './projectReportPageBudget';

/** The level floor a client-facing strength must reach (L3 or better). */
export const MIN_STRENGTH_LEVEL = 3;

const LEVEL_RANK = Object.freeze({ L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 });
const NONE_SPECIFIED = /^none specified$/i;

/** A published level as L1–L4, or null when it is not an assessed level. */
export function levelLabel(level) {
  if (level === 0 || String(level).trim().toUpperCase() === 'FAIL') return 'FAIL';
  const match = /^L?([1-4])$/i.exec(String(level ?? '').trim());
  return match ? `L${match[1]}` : null;
}

/** Where a level sits: L4 strongest, FAIL lowest, unknown −1. */
export function levelRank(level) {
  const label = levelLabel(level);
  return label == null ? -1 : (LEVEL_RANK[label] ?? -1);
}

/** Whether a level reaches the strength floor. */
export const isStrength = (level) => levelRank(level) >= MIN_STRENGTH_LEVEL;

/** One published parameter result, by its RP22 number. */
function parameter(summary, id) {
  if (!summary) return null;
  const row = readReportParameter(summary, id);
  const level = levelLabel(row?.level);
  if (level == null) return null;
  const value = row?.value && row.value !== '—' ? row.value : null;
  return { key: `P${id}`, id, level, value, detail: null, scope: row?.scope || 'room' };
}

/** Every assessed seat result published for one parameter. */
function seatRows(summary, id) {
  const rows = summary?.project?.reportCounts?.seatResultsByParameter?.[`p${id}`] || [];
  return rows.filter((row) => levelLabel(row?.level) != null);
}

/**
 * The parameter's all-seat floor: the weakest assessed seat governs, so a
 * strength claimed from this result holds at every seat that was assessed.
 */
function seatFloor(summary, id) {
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
  };
}

/** The RP23 viewing result of every seating row, from the published per-seat authority. */
function viewingRows(summary, seatingPositions) {
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
function rowLabel(index, total) {
  if (total <= 1) return 'Seating row';
  if (index === 0) return 'Front row';
  if (index === total - 1) return 'Rear row';
  return total === 3 ? 'Middle row' : `Row ${index + 1}`;
}

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
function subwooferSummary(entries) {
  const byModel = new Map();
  for (const entry of entries) {
    if (!entry.name) continue;
    byModel.set(entry.name, (byModel.get(entry.name) || 0) + entry.count);
  }
  return [...byModel.entries()].map(([name, count]) => ({ name, count }));
}

const modelCountLabel = (entries) => entries
  .map((entry) => (entry.count > 1 ? `${entry.name} × ${entry.count}` : entry.name))
  .filter(Boolean)
  .join(', ');

/** "A, B and C" — the page's own list style. */
function joinList(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const evidence = (key, level, value, detail = null) => ({
  key,
  level: level ?? null,
  value: value ?? null,
  detail,
});

const sentence = (text) => {
  const trimmed = String(text || '').trim();
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : '';
};

/**
 * The engineering connection each specified product has to this design's
 * published results — stated only where that result genuinely supports it.
 * The same connections are used by the highlights page and by the System &
 * Products page, so the two can never state a different reason.
 */
export function buildSpecificationConnections({ productsSelected = null, engineeringSummary = null } = {}) {
  const lcr = productEntries(productsSelected, 'lcr');
  const surrounds = productEntries(productsSelected, 'surrounds');
  const overheads = productEntries(productsSelected, 'overheads');
  const subwoofers = productEntries(productsSelected, 'subwoofers');
  const treatment = productEntries(productsSelected, 'acoustic_treatment');

  const p12 = parameter(engineeringSummary, 12);
  const p13 = parameter(engineeringSummary, 13);
  const p14 = parameter(engineeringSummary, 14);
  const p18 = parameter(engineeringSummary, 18);

  const lcrTotal = totalCount(lcr);
  const surroundTotal = totalCount(surrounds);
  const overheadTotal = totalCount(overheads);
  const subTotal = totalCount(subwoofers);
  const treatmentTotal = totalCount(treatment);

  return {
    lcr: lcrTotal > 0 && isStrength(p12?.level)
      ? `Screen-stage output — RP22 P12 ${p12.level}${p12.value ? `, ${p12.value}` : ''}`
      : lcrTotal > 0 ? 'Screen stage — left, centre and right' : null,
    surrounds: surroundTotal > 0 && isStrength(p13?.level)
      ? `Non-screen output — RP22 P13 ${p13.level}${p13.value ? `, ${p13.value}` : ''}`
      : surroundTotal > 0 ? 'Surround and wide coverage around the seats' : null,
    overheads: overheadTotal > 0
      ? `Overhead layer completing the ${String(productsSelected?.overheadFormat || '').trim() || 'immersive'} field`
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

/** The candidate highlights, each gated on the evidence it needs. */
function buildCandidates(sources) {
  const {
    engineeringSummary,
    productsSelected,
    seatingPositions = [],
    dolbyConfig = null,
  } = sources;
  const candidates = [];

  // 1 · Cinema-scale dynamic capability — the screen stage and the non-screen layer.
  const p12 = parameter(engineeringSummary, 12);
  const p13 = parameter(engineeringSummary, 13);
  if (isStrength(p12?.level) && isStrength(p13?.level)) {
    const weakest = Math.min(levelRank(p12.level), levelRank(p13.level));
    candidates.push({
      id: 'dynamic-capability',
      order: 1,
      weight: weakest >= 4 ? 3 : 2,
      title: 'Cinema-scale dynamic capability',
      category: 'Dynamic Range',
      evidence: [
        evidence(`P12 ${p12.level}`, null, p12.value ? `Screen speakers · ${p12.value}` : 'Screen speakers'),
        evidence(`P13 ${p13.level}`, null, p13.value ? `Surround & overhead · ${p13.value}` : 'Surround & overhead'),
      ],
      explanation: sentence(`the screen stage is assessed at ${p12.value || p12.level} and the surround and overhead layer at ${p13.value || p13.level}, so the system carries the output capability that demanding film soundtracks ask for at the reference seating position.`),
      sources: ['P12', 'P13'],
    });
  }

  // 2 · Consistent tonal performance — must hold at every assessed seat.
  const p16 = seatFloor(engineeringSummary, 16);
  const p17 = seatFloor(engineeringSummary, 17);
  if (isStrength(p16?.level) && isStrength(p17?.level)) {
    const seats = Math.max(p16.detail?.match(/\d+/)?.[0] || 0, 0);
    candidates.push({
      id: 'tonal-consistency',
      order: 2,
      weight: Math.min(levelRank(p16.level), levelRank(p17.level)) >= 4 ? 3 : 2,
      title: 'Consistent tonal performance',
      category: 'Timbre Matching',
      evidence: [
        evidence(`P16 ${p16.level}`, null, p16.value ? `Screen-to-surround level match · ${p16.value}` : 'Screen-to-surround level match'),
        evidence(`P17 ${p17.level}`, null, p17.value ? `Across the seating area · ${p17.value}` : 'Across the seating area'),
      ],
      explanation: sentence(`both parameters hold at ${levelRank(p16.level) <= levelRank(p17.level) ? p16.level : p17.level}${seats ? ` across all ${seats} assessed seating positions` : ' across the assessed seating positions'}, so the tonal character stays consistent as sound moves between the screen, surround and overhead channels.`),
      sources: ['P16', 'P17'],
    });
  }

  // 3 · Bass response at the reference seating position. P19 is assessed at the
  // RSP only, so the claim is made for the RSP — never for the room.
  const p19 = parameter(engineeringSummary, 19);
  if (isStrength(p19?.level)) {
    candidates.push({
      id: 'reference-seat-bass',
      order: 3,
      weight: levelRank(p19.level) >= 4 ? 3 : 2,
      title: 'Strong reference-seat bass response',
      category: 'Bass Performance',
      evidence: [evidence(`P19 ${p19.level}`, null, p19.value ? `At the reference seating position · ${p19.value}` : 'At the reference seating position')],
      explanation: sentence(`at the reference seating position the corrected bass response sits ${p19.value || 'within the target window'} of the design target, so the reference seat hears the low-frequency foundation the design was tuned for.`),
      sources: ['P19'],
      scope: 'rsp',
    });
  }

  // 4 · Immersive viewing geometry — per row, from the published RP23 authority.
  const rows = viewingRows(engineeringSummary, seatingPositions);
  const rowStrengths = rows.filter((row) => isStrength(row.level));
  if (rows.length > 0 && rowStrengths.length === rows.length) {
    const strongest = rowStrengths.reduce((acc, row) => (levelRank(row.level) > levelRank(acc.level) ? row : acc), rowStrengths[0]);
    const described = rows.map((row, index) => {
      const angle = row.maxAngleDeg != null ? `${row.maxAngleDeg.toFixed(1)}°` : null;
      const label = rowLabel(index, rows.length).toLowerCase();
      return `the ${label} ${angle ? `views the screen at ${angle} ` : ''}(RP23 ${row.level})`;
    });
    candidates.push({
      id: 'viewing-geometry',
      order: 4,
      weight: levelRank(strongest.level) >= 4 ? 2 : 1,
      title: 'Immersive viewing geometry',
      category: 'Viewing Experience',
      evidence: rows.slice(0, 3).map((row, index) => evidence(
        `RP23 · ${rowLabel(index, rows.length)} ${row.level}`,
        null,
        row.maxAngleDeg != null ? `${row.maxAngleDeg.toFixed(1)}° · ${row.seats} seat${row.seats === 1 ? '' : 's'}` : `${row.seats} seats`,
      )),
      explanation: sentence(`${joinList(described)}, so the front of the room gives the most immersive view while the rows behind it stay inside a strong viewing position.`),
      sources: rows.map((row) => `RP23:${row.rowNumber}:${row.level}`),
    });
  }

  // 5 · The immersive layout itself — the architecture the design is built on.
  const p2 = parameter(engineeringSummary, 2);
  const connections = buildSpecificationConnections({ productsSelected, engineeringSummary });
  const { overheads: overheadCount, subwoofers: subCount } = connections.counts;
  if (dolbyConfig && overheadCount > 0) {
    candidates.push({
      id: 'immersive-layout',
      order: 5,
      weight: isStrength(p2?.level) ? 2 : 1,
      title: 'A high-resolution immersive layout',
      category: 'System Architecture',
      evidence: [
        evidence(String(dolbyConfig), null, 'system format'),
        p2 ? evidence(`P2 ${p2.level}`, null, `${p2.value || 'discrete speakers'}`) : null,
        evidence(`${overheadCount} overheads`, null, subCount > 0 ? `${subCount} subwoofers` : null),
      ].filter(Boolean),
      explanation: sentence(`the design is built as a ${dolbyConfig} system with ${overheadCount} overhead speakers${subCount > 0 ? ` and ${subCount} subwoofers` : ''}${p2?.value ? ` across ${p2.value}` : ''}, so effects move above and around the audience instead of staying on the screen plane.`),
      sources: ['P2', 'architecture'],
    });
  }

  // 6 · The specification, connected to the results it is there to deliver.
  if (connections.counts.lcr + connections.counts.surrounds + connections.counts.overheads + connections.counts.subwoofers > 0) {
    const lcr = productEntries(productsSelected, 'lcr');
    const surrounds = productEntries(productsSelected, 'surrounds');
    const overheads = productEntries(productsSelected, 'overheads');
    const subs = subwooferSummary(productEntries(productsSelected, 'subwoofers'));
    const treatment = productEntries(productsSelected, 'acoustic_treatment');

    const jobs = [
      lcr.length > 0 && isStrength(p12?.level) && `${modelCountLabel(lcr)} front stage for the P12 screen-stage capability`,
      surrounds.length > 0 && isStrength(p13?.level) && `${modelCountLabel(surrounds)} layer for the P13 non-screen output`,
      overheads.length > 0 && `${modelCountLabel(overheads)} overheads completing the immersive field`,
      subs.length > 0 && isStrength(p14?.level) && `${modelCountLabel(subs)} subwoofers delivering the P14 bass output capability`,
      treatment.length > 0 && `${modelCountLabel(treatment)} acoustic treatment for planned reflection control`,
    ].filter(Boolean);

    if (jobs.length > 0) {
      candidates.push({
        id: 'product-selection',
        order: 6,
        weight: 1,
        title: 'Purposeful product selection',
        category: 'Specification',
        evidence: [
          lcr.length > 0 && evidence('LCR', null, modelCountLabel(lcr)),
          surrounds.length > 0 && evidence('Surrounds / wides', null, modelCountLabel(surrounds)),
          overheads.length > 0 && evidence('Overheads', null, modelCountLabel(overheads)),
          subs.length > 0 && evidence('Subwoofers', null, modelCountLabel(subs)),
          treatment.length > 0 && evidence('Treatment', null, modelCountLabel(treatment)),
        ].filter(Boolean).slice(0, 3),
        explanation: sentence(`every part of the specification carries a job: ${joinList(jobs)}.`),
        sources: ['products'],
      });
    }
  }

  return candidates;
}

/**
 * ADI's selection for this design: the highlights, strongest first, and the
 * audited account of what was considered and why anything was left out.
 */
export function selectAdiHighlights(sources = {}) {
  const budgetMm = sources.budgetMm ?? PROJECT_REPORT_PAGE_BUDGET_MM.page;
  const candidates = buildCandidates(sources)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  const highlights = fitHighlightsToBudget(candidates, budgetMm);

  const selectedIds = new Set(highlights.map((highlight) => highlight.id));
  const rejected = [
    ...candidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, reason: 'page budget: the weakest highlight is held back rather than clipped' })),
    ...rejectedClaims(sources),
  ];

  return { highlights, selected: highlights.map((highlight) => highlight.id), rejected };
}

/** Why each strength ADI deliberately did NOT state was left out. */
function rejectedClaims({ engineeringSummary, productsSelected } = {}) {
  const rejected = [];
  const p5 = seatFloor(engineeringSummary, 5);
  const p6 = seatFloor(engineeringSummary, 6);
  const p10 = seatFloor(engineeringSummary, 10);
  const p20 = seatFloor(engineeringSummary, 20);
  const p15 = parameter(engineeringSummary, 15);
  const p21 = parameter(engineeringSummary, 21);
  const p18 = parameter(engineeringSummary, 18);

  if (p5 || p6 || p10) {
    const floors = [p5, p6, p10].filter(Boolean).map((row) => `${row.key} ${row.level}`);
    rejected.push({ id: 'spatial-resolution', reason: `seat-scoped spatial results are mixed (${floors.join(', ')}) — below the strength floor` });
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
  if (p18 && !isStrength(p18.level)) {
    rejected.push({ id: 'low-frequency-extension', reason: `P18 is ${p18.level} — moderate extension is stated with the bass output, not raised as its own strength` });
  }
  const treatment = productEntries(productsSelected, 'acoustic_treatment');
  if (treatment.length === 0) {
    rejected.push({ id: 'acoustic-treatment', reason: 'no acoustic treatment is specified in this design' });
  }
  return rejected;
}

/** The highlights page's content: this design's own ADI selection. */
export function buildAdiDesignHighlights(sources = {}) {
  return selectAdiHighlights(sources).highlights;
}

export default buildAdiDesignHighlights;