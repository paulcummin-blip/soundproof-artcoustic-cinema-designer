/**
 * adiNarrativeFacts.js (shared)
 * -----------------------------
 * The facts layer behind the ADI narrative example chips.
 *
 * Reads the frozen Engineering Snapshot — the same calculated authority the
 * client report is generated from — and states what this project version
 * actually contains: screen, system layout, seating, viewing and the results
 * that were genuinely calculated. It also collects the canonical number sets
 * the chip validator checks against, so a chip can only state a value that
 * exists in this version.
 *
 * Nothing is calculated, graded or re-derived here. It reads passively.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs.
 */

import {
  PARAMETER_PLAIN_LANGUAGE,
  resolveBassEvidence,
  splitParameterEvidence,
} from './adiReportEvidenceRules.js';
import { summariseSubwooferConfiguration } from './subwooferConfigurationSummary.js';
import { readDisplayIdentity } from './canonicalDisplayIdentity.js';

export const NUMBER_RE = /\d+(?:\.\d+)*/g;

/** The parameters a client report may reference, for the facts block. */
const REPORT_PARAMETER_IDS = Object.freeze([2, 4, 5, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20]);

export function toNumber(value) {
  // A fact that is absent stays absent: null / undefined / '' are not zero, so a
  // missing screen size or count never becomes a stated figure.
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** '106.0' and '106' are the same number; '9.1.6' is not a number at all. */
export function normaliseNumber(token) {
  const number = Number(token);
  return Number.isFinite(number) ? String(number) : String(token);
}

function addNumbers(target, text) {
  for (const token of String(text ?? '').match(NUMBER_RE) || []) target.add(normaliseNumber(token));
}

/** The whole-number form of a displayed value is also a valid figure. */
function addRounded(target, token) {
  const number = Number(token);
  if (Number.isFinite(number)) target.add(String(Math.round(number)));
}

/** A single-value allowed set, or null when the fact is not present. */
export function numberSet(value) {
  const number = toNumber(value);
  return number === null ? null : new Set([String(number)]);
}

/** '9.1.6' allows '9', '9.1' and '9.1.6': it never invents a different layout. */
export function layoutPrefixes(configuration) {
  const parts = String(configuration || '').split('.');
  const out = [];
  let accumulated = '';
  for (const part of parts) {
    if (!/^\d+$/.test(part)) continue;
    accumulated = accumulated ? `${accumulated}.${part}` : part;
    out.push(accumulated);
  }
  return out;
}

export function normaliseLevel(level) {
  const text = String(level ?? '').trim().toUpperCase();
  const match = /^L?([1-4])$/.exec(text);
  return match ? `L${match[1]}` : null;
}

/**
 * The canonical facts for one project version, plus the allowed number sets.
 *
 * @param {Object} snapshot — frozen Engineering Snapshot
 * @returns {Object}
 */
export function buildNarrativeFacts(snapshot) {
  const available = snapshot?.available === true;
  const room = snapshot?.room || {};
  const system = snapshot?.system || {};
  const layout = system.channel_layout || {};
  const screenRaw = room.screen || {};

  // The display's own identity, read from the frozen snapshot's canonical fields
  // — `display_type` and the authoritative diagonal — and never reconstructed
  // from a viewable width, a preset width or an aspect ratio. A television is
  // stated by its diagonal and the noun TV; a projection screen keeps the
  // existing screen size and aspect ratio wording.
  const display = readDisplayIdentity(screenRaw);

  const screen = {
    // What kind of display this version has: 'tv' or 'projector_screen'.
    displayType: display.displayType,
    isTv: display.isTv,
    // A television's authoritative diagonal, and the client-facing phrase for it.
    diagonalInches: display.diagonalInches,
    tvDisplayPhrase: display.tvPhrase,
    // The projection-screen facts, read exactly as before.
    sizeInches: toNumber(screenRaw.size_inches),
    viewableWidthInches: toNumber(screenRaw.viewable_width_inches),
    aspectRatio: screenRaw.aspect_ratio ? String(screenRaw.aspect_ratio) : null,
  };
  // A television is never described by an aspect ratio, so the aspect one may
  // state is none at all.
  screen.displayAspectRatio = screen.isTv ? null : screen.aspectRatio;
  screen.available = Number.isFinite(screen.sizeInches) || screenRaw.manual_dimensions === true;

  // The subwoofer configuration is read from this version's own subwoofer
  // instances — the same active subs the analysis, pricing and reports use.
  // The Dolby notation digit is never the count: in 9.1.6 the 1 is one LFE
  // channel, not one subwoofer.
  const subwoofers = summariseSubwooferConfiguration(system);

  const channels = {
    total: toNumber(layout.total_discrete) ?? toNumber(system.configuration?.total_discrete_channels),
    configuration: system.configuration?.dolby_config ? String(system.configuration.dolby_config) : null,
    subwooferCount: subwoofers.available ? subwoofers.totalSubwooferCount : null,
  };

  const seating = {
    seats: toNumber(room.seating?.total_seats),
    rows: toNumber(room.seating?.row_count),
  };

  // The same reliable, report-legal results the report itself uses, with the
  // bass results read from the same bass authority the report reads.
  const { used } = splitParameterEvidence(snapshot);
  const bass = resolveBassEvidence(snapshot);
  const parameters = {};
  for (const entry of used) parameters[`p${entry.parameter_id}`] = entry;
  for (const entry of bass.usable) parameters[`p${entry.parameter_id}`] = entry;

  const sets = {
    all: new Set(),
    db: new Set(),
    hz: new Set(),
    degrees: new Set(),
    metres: new Set(),
    levels: new Set(),
    layouts: new Set(layoutPrefixes(channels.configuration)),
  };

  const canonical = [
    room.dimensions_text,
    room.volume_m3 ? `${room.volume_m3} m3` : null,
    room.seating?.interpretation,
    screenRaw.interpretation,
    screen.aspectRatio,
    screen.sizeInches,
    screen.viewableWidthInches,
    channels.total,
    channels.configuration,
    channels.subwooferCount,
    system.configuration?.text,
    system.subwoofer_strategy?.strategy_text,
    snapshot?.viewing?.summary,
    snapshot?.viewing?.primary_floor,
    snapshot?.viewing?.secondary_floor,
    snapshot?.viewing?.project_floor,
    ...Object.values(parameters).map((entry) => `${entry.level || ''} ${entry.value || ''}`),
  ].filter((value) => value !== null && value !== undefined);

  for (const value of canonical) addNumbers(sets.all, value);
  if (screen.aspectRatio) addNumbers(sets.all, screen.aspectRatio);
  if (Number.isFinite(screen.sizeInches)) sets.all.add(String(screen.sizeInches));
  if (Number.isFinite(screen.viewableWidthInches)) sets.all.add(String(screen.viewableWidthInches));

  // Unit-tagged figures: a dB, Hz, degree or metre figure is only allowed when
  // this version states it. The display policy rounds a value to a whole number,
  // so the whole-number form of a stated figure is accepted as well.
  for (const value of canonical) {
    for (const match of String(value).matchAll(/(\d+(?:\.\d+)*)\s*(dB|dBC|Hz|°|degrees)/gi)) {
      const unit = match[2].toLowerCase();
      const target = unit === 'db' || unit === 'dbc' ? sets.db : unit === 'hz' ? sets.hz : sets.degrees;
      target.add(normaliseNumber(match[1]));
      addRounded(target, match[1]);
      addRounded(sets.all, match[1]);
    }
    for (const match of String(value).matchAll(/(\d+(?:\.\d+)*)\s*m\b/gi)) {
      sets.metres.add(normaliseNumber(match[1]));
    }
  }

  // RP23 seat angles are numbers in the snapshot, not text.
  const perSeat = Array.isArray(snapshot?.viewing?.per_seat) ? snapshot.viewing.per_seat : [];
  for (const seat of perSeat) {
    const angle = toNumber(seat?.horizontal_angle_deg);
    if (angle === null) continue;
    sets.degrees.add(String(angle));
    sets.degrees.add(String(Math.round(angle)));
    sets.all.add(String(angle));
    sets.all.add(String(Math.round(angle)));
  }

  // The levels that genuinely exist in this version.
  const levelSources = [
    ...Object.values(parameters).map((entry) => entry.level),
    snapshot?.viewing?.primary_floor,
    snapshot?.viewing?.secondary_floor,
    snapshot?.viewing?.project_floor,
  ];
  for (const value of levelSources) {
    const level = normaliseLevel(value);
    if (level) sets.levels.add(level);
  }

  return {
    available,
    screen,
    channels,
    subwoofers,
    seating,
    viewing: {
      available: snapshot?.viewing?.available === true,
      rows: seating.rows,
      floor: normaliseLevel(snapshot?.viewing?.project_floor) || normaliseLevel(snapshot?.viewing?.primary_floor),
    },
    parameters,
    sets,
  };
}

/**
 * The project facts block given to the writer: the values it may state, and the
 * results it must not mention. Numbers outside this block are discarded by the
 * validator, so the block is also the contract.
 */
export function buildNarrativeFactsBlock(facts) {
  if (!facts?.available) return '';
  const lines = ['=== THIS PROJECT VERSION (the only values a suggestion may state) ==='];

  if (facts.screen.isTv) {
    // A television is stated by its diagonal size and the noun TV only: no
    // aspect ratio, no image width, and never the noun screen.
    lines.push(facts.screen.tvDisplayPhrase
      ? `Display: ${facts.screen.tvDisplayPhrase}. This design's display is a TELEVISION: describe it by that diagonal size and the noun TV only, and where the data supports it emphasise the viewing immersion it gives. Never call it a screen, never state an aspect ratio, and never state an image width, height or preset width.`
      : 'Display: a television. Never state a size, an aspect ratio or an image width, and never call it a screen.');
  } else if (facts.screen.available && Number.isFinite(facts.screen.sizeInches)) {
    const viewable = Number.isFinite(facts.screen.viewableWidthInches)
      && facts.screen.viewableWidthInches !== facts.screen.sizeInches
      ? ` (${facts.screen.viewableWidthInches}" viewable width)`
      : '';
    lines.push(`Screen: ${facts.screen.sizeInches}"${facts.screen.aspectRatio ? ` ${facts.screen.aspectRatio}` : ''}${viewable}`);
  } else {
    lines.push('Screen: not stated in the calculated data for this version. Never state a screen size or a viewing angle.');
  }

  if (facts.channels.configuration || Number.isFinite(facts.channels.total)) {
    const parts = [
      facts.channels.configuration ? `${facts.channels.configuration} layout` : null,
      Number.isFinite(facts.channels.total) ? `${facts.channels.total} discrete channels` : null,
      facts.subwoofers?.humanReadableSummary || null,
    ].filter(Boolean);
    lines.push(`System: ${parts.join(', ')}`);
  }

  if (Number.isFinite(facts.seating.seats) || Number.isFinite(facts.seating.rows)) {
    const parts = [
      Number.isFinite(facts.seating.seats) ? `${facts.seating.seats} seats` : null,
      Number.isFinite(facts.seating.rows) ? `${facts.seating.rows} rows` : null,
    ].filter(Boolean);
    lines.push(`Seating: ${parts.join(', ')}`);
  }

  const stated = REPORT_PARAMETER_IDS
    .map((id) => facts.parameters[`p${id}`])
    .filter(Boolean)
    .map((entry) => `${entry.label} ${entry.text}`);
  lines.push(stated.length > 0
    ? `Results calculated for this version: ${stated.join(' | ')}`
    : 'Results calculated for this version: none.');

  const missing = REPORT_PARAMETER_IDS
    .filter((id) => !facts.parameters[`p${id}`])
    .map((id) => PARAMETER_PLAIN_LANGUAGE[id] || `P${id}`);
  if (missing.length > 0) {
    lines.push(`No result exists for these, so never mention them: ${missing.join(', ')}`);
  }

  lines.push(`Viewing (RP23): ${facts.viewing.available ? `assessed${facts.viewing.floor ? `, ${facts.viewing.floor}` : ''}` : 'not calculated for this version'}`);
  lines.push('=== END THIS PROJECT VERSION ===');
  return lines.join('\n');
}

/**
 * The display rule handed to the ADI writer, so a suggestion never describes the
 * display as something it is not: a television is TV language by its diagonal
 * size, a projection screen keeps the existing screen and aspect-ratio wording.
 */
export function buildDisplayLanguageRule(facts) {
  if (!facts?.screen?.available) return '';
  if (facts.screen.isTv) {
    return `- This design's display is a TELEVISION${facts.screen.tvDisplayPhrase ? ` (${facts.screen.tvDisplayPhrase})` : ''}: describe it by its diagonal size and the noun TV only, and where the data supports it emphasise the viewing immersion the television gives. Never call it a screen, never mention an aspect ratio, and never mention an image width, height or preset width.`;
  }
  return '- This design uses a projection screen: state its screen size and aspect ratio as the calculated data gives them.';
}

export default buildNarrativeFacts;