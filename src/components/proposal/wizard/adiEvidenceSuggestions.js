/**
 * adiEvidenceSuggestions.js
 * --------------------------
 * The deterministic Client Brief examples: general examples available the
 * instant the step opens, and project-specific examples built in code from the
 * frozen Engineering Snapshot — with no model call and no request of any kind.
 *
 * Why this exists: the design-specific examples used to arrive only from the
 * server, so the suggestion area had nothing to show until a request came back.
 * The examples are now built here, synchronously, from the same frozen facts the
 * server uses; the ADI function is a refinement on top of them and can never
 * decide whether the area has anything to show.
 *
 * Evidence rules, mirrored from the shared report authority
 * (base44/shared/adiReportEvidenceRules.js and adiNarrativeAuthority.js):
 *   · an assumed or administrative parameter (P8, P15, P21) is never referenced;
 *   · a result is read only when it carries a real assessed level (L1 to L4) and
 *     is not flagged unreliable, provisional, stale, waiting or assumed;
 *   · bass seat-to-seat consistency (P20) is referenced only at L3 or L4 in a
 *     room with more than one seat, exactly as the report admits it;
 *   · a television is stated by its diagonal and the noun TV, never as a screen,
 *     a viewable width or an aspect ratio;
 *   · a figure is stated only when the snapshot states it. Where a fact is
 *     missing the example is stated without a number, or not offered at all.
 *
 * Nothing here calculates, grades or re-derives a result, and nothing asks the
 * report to explain WHY a decision was made: a chip asks about the calculated
 * result and what it means for the room. The wording of every project-specific
 * example is the authority's own wording, so a chip built here and the same chip
 * built by the server are the same string and never appear twice.
 *
 * Pure: no React, no SDK, no fetching, no timers.
 */

import { isHighChannelDesign, HIGH_CHANNEL_PREFERRED_SENTENCE } from '@/components/proposal/highChannelLayoutAuthority';

/** How many examples are offered. Approximately the six narrative areas. */
export const EVIDENCE_SUGGESTION_LIMIT = 6;

/** The authority's own overhead-arrangement wording, reused so it cannot diverge. */
const OVERHEAD_ARRANGEMENT_CHIP = 'Explain the overhead loudspeaker arrangement and what its assessed spacing means for this room';

/** A small selection, offered before anything project-specific is readable. */
export const GENERAL_EXAMPLES = Object.freeze([
  'Dynamic impact',
  'Dialogue clarity',
  'Timbre matching across the room',
  'Seating and viewing comfort',
  'Invisible installation',
  'Explain the compromises made',
]);

/** Offered for a comparison before the versions' facts are readable. */
export const COMPARISON_GENERAL_EXAMPLES = Object.freeze([
  'Compare the dynamic capability of the options',
  'Compare the bass performance of the options',
  'Compare the seating and viewing experience of the options',
  'Explain which option best suits the client priorities',
  'Explain where the options perform the same',
  'Explain the cost and performance difference',
]);

/** The label shown over the general examples, so they are never read as this design's. */
export const GENERAL_NOTICE = "General examples. These are not based on this project's results.";

/** Shown, quietly, while the refinement request is in flight. Never blocks the examples. */
export const REFINING_NOTE = 'Refining suggestions for this design…';

/** The refinement did not arrive in time. The examples on screen stay usable. */
export const TIMEOUT_NOTE = 'Design-specific refinements are taking longer than expected. These examples are ready to use.';

/** The refinement failed. The examples on screen stay usable. */
export const FAILED_NOTE = 'Design-specific refinements are unavailable. These examples are ready to use.';

/** The parameters a client report may reference at all. */
const EXCLUDED_PARAMETER_IDS = new Set([8, 15, 21]);

/** Level and status values that mean the result is not usable evidence. */
const UNUSABLE_LEVELS = new Set(['', 'N/A', 'NA', 'NONE', 'NOT CALCULATED', 'NOT_ASSESSED', 'NOT_CONFIGURED']);
const UNUSABLE_STATUS = /unreliable|provisional|stale|waiting|excluded|not[_ ]?calculated|pending|incomplete|assumed|unknown/i;
const LEVEL_RE = /^L?([1-4])$/i;

const PLAIN_LANGUAGE = Object.freeze({
  3: 'Screen speaker placement',
  5: 'Horizontal spacing',
  7: 'Front wide position',
  9: 'Overhead spacing',
  11: 'Surround speaker placement',
  12: 'Screen Dynamic Range',
  13: 'Non-screen Dynamic Range',
  14: 'LFE and subwoofer Dynamic Range',
  16: 'Screen timbre',
  17: 'Surround timbre',
  18: 'Bass extension',
  19: 'Bass response',
  20: 'Bass consistency',
});

const tvPhraseOf = (diagonalInches) => (Number.isFinite(diagonalInches) && diagonalInches > 0
  ? `${Math.round(diagonalInches)}" TV`
  : null);

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** The display identity, read exactly from the snapshot's own frozen fields. */
function readDisplay(screen = {}) {
  const declared = String(screen.display_type ?? '').trim().toLowerCase();
  const isTv = declared === 'tv' || declared === 'television' || (!declared && screen.television === true);
  const diagonalInches = toNumber(screen.diagonal_inches);
  const sizeInches = toNumber(screen.size_inches);
  return {
    isTv,
    diagonalInches,
    sizeInches,
    aspectRatio: screen.aspect_ratio ? String(screen.aspect_ratio) : null,
    tvPhrase: isTv ? tvPhraseOf(diagonalInches) : null,
  };
}

/** One reliable result, or null when the row is not usable as evidence. */
function readReliableRow(row) {
  const id = Number(row?.parameter_id);
  if (!Number.isFinite(id) || EXCLUDED_PARAMETER_IDS.has(id)) return null;

  const status = row?.status ?? row?.reliability ?? row?.authority_status ?? null;
  if (typeof status === 'string' && status.trim() && UNUSABLE_STATUS.test(status)) return null;

  const rawLevel = String(row?.level ?? row?.achieved_level ?? '').trim();
  if (rawLevel && UNUSABLE_LEVELS.has(rawLevel.toUpperCase())) return null;
  const levelMatch = LEVEL_RE.exec(rawLevel);
  // Only an assessed level is evidence. A row carrying a value but no level has
  // not been graded, so it is not used to build an example that names a level.
  if (!levelMatch) return null;

  const value = String(row?.value ?? row?.formatted_value ?? row?.formatted ?? '').trim();
  return {
    parameter_id: id,
    label: PLAIN_LANGUAGE[id] || row?.title || `P${id}`,
    level: `L${levelMatch[1]}`,
    value: value || null,
    text: [`L${levelMatch[1]}`, value || null].filter(Boolean).join(' · '),
  };
}

/**
 * The facts behind the examples, read passively from one frozen snapshot.
 *
 * @param {Object|null} snapshot — frozen Engineering Snapshot
 * @returns {Object}
 */
export function readEvidenceFacts(snapshot) {
  const available = snapshot?.available === true;
  const results = {};
  const rows = Array.isArray(snapshot?.rp22?.parameter_headlines)
    ? snapshot.rp22.parameter_headlines
    : [];
  for (const row of rows) {
    const reliable = readReliableRow(row);
    if (reliable) results[`p${reliable.parameter_id}`] = reliable;
  }

  const layout = snapshot?.system?.channel_layout || {};
  const seats = Array.isArray(snapshot?.seats) ? snapshot.seats.length : 0;
  const totalSeats = toNumber(snapshot?.room?.seating?.total_seats);
  const seatCount = seats || totalSeats || 0;

  // Bass consistency is admitted exactly as the report admits it: current, at
  // L3 or L4, and meaningful in a room with more than one seat.
  const p20 = results.p20 || null;
  const bassConsistency = p20 && ['L3', 'L4'].includes(p20.level) && seatCount > 1 ? p20 : null;

  return {
    available,
    display: readDisplay(snapshot?.room?.screen || {}),
    layout: {
      configuration: snapshot?.system?.configuration?.dolby_config
        ? String(snapshot.system.configuration.dolby_config)
        : null,
      totalDiscrete: toNumber(layout.total_discrete) ?? toNumber(snapshot?.system?.configuration?.total_discrete_channels),
    },
    seating: {
      rows: toNumber(snapshot?.room?.seating?.row_count),
      seats: seatCount || null,
    },
    viewingAvailable: snapshot?.viewing?.available === true,
    highChannel: available ? isHighChannelDesign(snapshot) === true : false,
    results,
    bassConsistency,
  };
}

const chip = (area, label, reason) => ({ area, label, reason: reason || '' });

function displayChip(facts) {
  const { display } = facts;
  if (display.isTv) {
    return display.tvPhrase
      ? chip('display_viewing', `Emphasise the ${display.tvPhrase}`, 'The television this version states, by its diagonal size.')
      : chip('display_viewing', 'Highlight the immersive viewing experience from the TV', 'This version states a television, so the example carries no number.');
  }
  if (Number.isFinite(display.sizeInches)) {
    const aspect = display.aspectRatio ? ` ${display.aspectRatio}` : '';
    return chip('display_viewing', `Emphasise the ${display.sizeInches} inch${aspect} screen`, 'Screen size and aspect ratio as stated for this version.');
  }
  return chip('display_viewing', 'Emphasise the screen scale and viewing geometry', 'This version states no screen size, so the example carries no number.');
}

function seatingChip(facts) {
  const { rows, seats } = facts.seating;
  if (Number.isFinite(rows) && rows >= 2) {
    return chip('client_experience', 'Explain front-row and rear-row viewing differences', `${rows} seating rows in this version.`);
  }
  if (facts.viewingAvailable || (Number.isFinite(seats) && seats >= 2)) {
    return chip('client_experience', 'Explain the seating positions and the viewing experience', 'The seating and viewing this version states, stated without a number.');
  }
  return null;
}

function layoutChip(facts) {
  const { configuration, totalDiscrete } = facts.layout;
  if (configuration) {
    return chip('loudspeaker_configuration', `Explain the ${configuration} system layout`, 'Channel layout calculated for this version.');
  }
  if (Number.isFinite(totalDiscrete)) {
    return chip('loudspeaker_configuration', `Highlight the ${totalDiscrete} discrete channels`, 'Discrete channel count calculated for this version.');
  }
  return null;
}

function dynamicChip(facts) {
  const order = ['p12', 'p13', 'p14'];
  for (const key of order) {
    const entry = facts.results[key];
    if (!entry) continue;
    const prefix = entry.level ? `${entry.level} ` : '';
    return chip('dynamic_capability', `Show the ${prefix}${entry.label} result`, `${entry.label} result for this version: ${entry.text}.`);
  }
  return null;
}

function spatialChip(facts) {
  if (facts.results.p9) {
    const entry = facts.results.p9;
    return chip('spatial_resolution', OVERHEAD_ARRANGEMENT_CHIP, `Overhead spacing result for this version: ${entry.text}.`);
  }
  const placement = ['p3', 'p5', 'p11', 'p7'].find((key) => facts.results[key]);
  if (placement) {
    return chip(
      'spatial_resolution',
      'Explain the screen and surround speaker placement within the room',
      `${facts.results[placement].label} result for this version: ${facts.results[placement].text}.`,
    );
  }
  return null;
}

function timbreChip(facts) {
  if (facts.results.p16) {
    const entry = facts.results.p16;
    return chip('timbre_matching', `Explain the ${entry.level} screen timbre result`, `Screen timbre result for this version: ${entry.text}.`);
  }
  if (facts.results.p17) {
    const entry = facts.results.p17;
    return chip('timbre_matching', `Explain the ${entry.level} surround timbre result`, `Surround timbre result for this version: ${entry.text}.`);
  }
  return null;
}

/**
 * The documented constraint or compromise this design actually carries. Offered
 * only with evidence behind it: a high channel count, or a calculated bass
 * extension result. A design with neither is not described as constrained.
 */
function constraintChip(facts) {
  if (facts.highChannel) {
    return chip('documented_constraint', 'Explain what sets the spacing between the channels', HIGH_CHANNEL_PREFERRED_SENTENCE);
  }
  if (facts.results.p18) {
    const entry = facts.results.p18;
    return chip('documented_constraint', 'Highlight the bass extension result', `Bass extension result for this version: ${entry.text}.`);
  }
  return null;
}

function bassChip(facts) {
  if (facts.results.p18) {
    const entry = facts.results.p18;
    return chip('bass_capability', 'Highlight the bass extension result', `Bass extension result for this version: ${entry.text}.`);
  }
  if (facts.results.p19) {
    const entry = facts.results.p19;
    return chip('bass_capability', 'Explain the bass response across the seating', `Bass response result for this version: ${entry.text}.`);
  }
  if (facts.bassConsistency) {
    const entry = facts.bassConsistency;
    return chip('bass_capability', 'Explain bass consistency across the seating', `Bass consistency result for this version: ${entry.text}.`);
  }
  return null;
}

/**
 * The candidates in narrative priority order: the six areas the brief is built
 * around, then the constraint and bass examples, which fill a place when one of
 * the six has no evidence behind it. One example per area, so no two examples
 * ask about the same calculated result.
 */
const CANDIDATES = Object.freeze([
  { area: 'display_viewing', build: displayChip },
  { area: 'client_experience', build: seatingChip },
  { area: 'loudspeaker_configuration', build: layoutChip },
  { area: 'dynamic_capability', build: dynamicChip },
  { area: 'spatial_resolution', build: spatialChip },
  { area: 'timbre_matching', build: timbreChip },
  { area: 'documented_constraint', build: constraintChip },
  { area: 'bass_capability', build: bassChip },
]);

const key = (label) => String(label || '').trim().toLowerCase();

/** One version's own project-specific examples, in priority order. */
function suggestionsForSnapshot(snapshot) {
  const facts = readEvidenceFacts(snapshot);
  if (!facts.available) return [];
  const out = [];
  const areas = new Set();
  for (const candidate of CANDIDATES) {
    if (out.length >= EVIDENCE_SUGGESTION_LIMIT) break;
    if (areas.has(candidate.area)) continue;
    const entry = candidate.build(facts);
    if (!entry) continue;
    if (out.some((existing) => key(existing.label) === key(entry.label))) continue;
    areas.add(candidate.area);
    out.push(entry);
  }
  return out;
}

/**
 * The examples to show for this selection, built with no asynchronous step.
 *
 * Single version: the project-specific examples when the frozen snapshot is
 * readable, otherwise the general examples.
 *
 * Comparison: only the examples that hold in EVERY selected version are stated
 * as project facts, and the comparison prompts fill the remainder — one
 * version's fact is never offered as though it applied to the whole comparison.
 *
 * @returns {{ suggestions: Array<Object>, evidenceBacked: boolean }}
 */
export function buildEvidenceSuggestions({ snapshot = null, versionSnapshots = [], proposalType = 'single' } = {}) {
  const comparison = proposalType === 'comparison' || (Array.isArray(versionSnapshots) && versionSnapshots.length > 1);

  if (comparison) {
    const perVersion = (Array.isArray(versionSnapshots) ? versionSnapshots : [])
      .map((entry) => suggestionsForSnapshot(entry?.snapshot))
      .filter((list) => list.length > 0);
    if (perVersion.length < 2) {
      return { suggestions: [], evidenceBacked: false };
    }
    const [first, ...rest] = perVersion;
    const shared = first.filter((entry) => rest.every(
      (list) => list.some((other) => key(other.label) === key(entry.label)),
    ));
    const suggestions = shared.slice(0, 4);
    const seen = new Set(suggestions.map((entry) => key(entry.label)));
    for (const label of COMPARISON_GENERAL_EXAMPLES) {
      if (suggestions.length >= EVIDENCE_SUGGESTION_LIMIT) break;
      if (seen.has(key(label))) continue;
      suggestions.push({ area: 'comparison', label, reason: '' });
    }
    return { suggestions, evidenceBacked: shared.length > 0 };
  }

  const suggestions = suggestionsForSnapshot(snapshot);
  return { suggestions, evidenceBacked: suggestions.length > 0 };
}

/**
 * Add refined examples to the ones already shown. The base examples are kept
 * exactly as they are and only ever gain entries: a refinement that fails,
 * times out or returns nothing to add cannot remove or replace them.
 */
export function mergeSuggestions({ base = [], refined = [], limit = 12 } = {}) {
  const out = [];
  const seen = new Set();
  for (const entry of [...(base || []), ...(refined || [])]) {
    const label = String(entry?.label || '').trim();
    if (!label) continue;
    if (seen.has(key(label))) continue;
    seen.add(key(label));
    out.push({ label, reason: String(entry?.reason || '').trim(), area: entry?.area || null });
    if (out.length >= limit) break;
  }
  return out;
}

/** The selection that is still offered by the examples on screen. */
export function pruneSelection(selected = [], chips = []) {
  const offered = new Set((chips || []).map((entry) => String(entry?.label || '')));
  return (selected || []).filter((label) => offered.has(label));
}

export default buildEvidenceSuggestions;