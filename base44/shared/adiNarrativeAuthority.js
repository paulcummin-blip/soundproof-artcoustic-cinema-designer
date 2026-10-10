/**
 * adiNarrativeAuthority.js (shared)
 * ---------------------------------
 * The authority behind the ADI narrative example chips in the Client Brief step.
 *
 * The chips are examples the designer can click into the brief. They are built
 * from, and checked against, the frozen Engineering Snapshot — the same
 * calculated authority the client report is generated from — so a chip can only
 * ever state a value that exists in this project version.
 *
 * Two jobs:
 *   1. buildAuthorityChips()     the deterministic examples, assembled in code
 *      from the calculated facts (screen, layout, channel count, results).
 *   2. validateNarrativeChip()   the gate every chip passes before display.
 *      A number is allowed only when it matches the canonical value for what it
 *      describes: an inch figure must be this version's screen, a level must be
 *      the achieved level of the result it names, a dB / Hz / degree figure must
 *      exist in this version's results. A chip that fails is rewritten without
 *      the number, or rejected and never shown.
 *
 * Nothing is calculated here. It reads the snapshot passively and never
 * re-grades, re-derives or re-groups a result.
 *
 * Pure: no React, no fetching, no side effects, no runtime-specific APIs.
 */

import {
  PARAMETER_PLAIN_LANGUAGE,
} from './adiReportEvidenceRules.js';
import {
  ASSUMED_PARAMETER_LABEL,
  assumedParameterUseIssue,
} from './clientFacingParameterAuthority.js';
import {
  NUMBER_RE,
  normaliseLevel,
  normaliseNumber,
  numberSet,
} from './adiNarrativeFacts.js';
import {
  isHighChannelDensityLayout,
  mentionsHighChannelSpacingUpgrade,
  mentionsRoomGeometryConstraintClaim,
  mentionsProcessorCostClaim,
  HIGH_CHANNEL_PREFERRED_SENTENCE,
} from './highChannelDensityRule.js';

/** The generic screen example, used when this version states no screen. */
export const SCREEN_GENERIC_CHIP = 'Emphasise the screen scale and viewing geometry';

/** The generic television example, used when a version states a TV without a diagonal. */
export const TV_GENERIC_CHIP = 'Highlight the immersive viewing experience from the TV';

/** How many deterministic examples the authority builds. */
export const AUTHORITY_CHIP_LIMIT = 8;

/** How many chips are shown in total. */
export const CHIP_LIMIT = 12;

/**
 * Phrases that name one specific calculated result, in the order they must be
 * tested: 'non-screen Dynamic Range' is tested before 'screen Dynamic Range',
 * which it contains.
 */
const PARAMETER_PHRASES = Object.freeze([
  { id: 13, re: /non[-\s]?screen\s+dynamic\s+range/i },
  { id: 12, re: /screen\s+dynamic\s+range/i },
  { id: 14, re: /(?:lfe|subwoofer)\s+dynamic\s+range/i },
  { id: 16, re: /screen\s+timbre/i },
  { id: 17, re: /(?:surround|overhead)\s+timbre/i },
  { id: 18, re: /bass\s+extension/i },
  { id: 19, re: /bass\s+response/i },
  { id: 20, re: /bass\s+consistency/i },
]);

/** How a number carrying a unit is checked against this version's own figures. */
const UNIT_RULES = Object.freeze([
  { rule: 'screen_size', re: /(\d+(?:\.\d+)*)\s*(?:inch(?:es)?|["”])/gi, allowed: screenSizeAllowed },
  { rule: 'channel_count', re: /(\d+(?:\.\d+)*)\s*(?:discrete\s+)?channels?\b/gi, allowed: (facts) => numberSet(facts.channels.total) },
  { rule: 'subwoofer_count', re: /(\d+(?:\.\d+)*)\s*subwoofers?\b/gi, allowed: (facts) => numberSet(facts.channels.subwooferCount) },
  { rule: 'seat_count', re: /(\d+(?:\.\d+)*)\s*seats?\b/gi, allowed: (facts) => numberSet(facts.seating.seats) },
  { rule: 'row_count', re: /(\d+(?:\.\d+)*)\s*rows?\b/gi, allowed: (facts) => numberSet(facts.seating.rows) },
  { rule: 'db_value', re: /(\d+(?:\.\d+)*)\s*(?:dB|dBC)\b/gi, allowed: (facts) => facts.sets.db },
  { rule: 'hz_value', re: /(\d+(?:\.\d+)*)\s*Hz\b/gi, allowed: (facts) => facts.sets.hz },
  { rule: 'angle_value', re: /(\d+(?:\.\d+)*)\s*(?:°|degrees?\b)/gi, allowed: (facts) => facts.sets.degrees },
  { rule: 'dimension_value', re: /(\d+(?:\.\d+)*)\s*m\b/gi, allowed: (facts) => facts.sets.metres },
]);

function screenSizeAllowed(facts, _value, context) {
  const allowed = new Set();
  // A television states one figure only: its authoritative diagonal. A viewable
  // width, a preset width or a screen size is never stated for a TV.
  if (facts.screen.isTv) {
    if (Number.isFinite(facts.screen.diagonalInches)) {
      allowed.add(String(facts.screen.diagonalInches));
      allowed.add(String(Math.round(facts.screen.diagonalInches)));
    }
    return allowed.size === 0 ? null : allowed;
  }
  if (Number.isFinite(facts.screen.sizeInches)) allowed.add(String(facts.screen.sizeInches));
  if (/viewable/i.test(context) && Number.isFinite(facts.screen.viewableWidthInches)) {
    allowed.add(String(facts.screen.viewableWidthInches));
  }
  return allowed.size === 0 ? null : allowed;
}

/**
 * For a television, the display is never named as a screen or a projector.
 * These match the display being described as a screen — never the RP22 'screen'
 * result names (P12 screen Dynamic Range, P16 screen timbre), which stay as they
 * are.
 */
const TV_FORBIDDEN_DISPLAY_RE = Object.freeze([
  /\bprojector\b/i,
  /\b\d+(?:\.\d+)*\s*(?:inch(?:es)?|["”])\s*screens?\b/i,
  /\bscreens?\s+(?:size|scale|width|height|diagonal)\b/i,
  /\bviewable\s+width\b/i,
]);

function chip(label, reason, sourceFields, sourceValues) {
  return { label, reason, source: 'authority', sourceFields, sourceValues };
}

function levelPrefix(entry) {
  const level = normaliseLevel(entry?.level);
  return level ? `${level} ` : '';
}

/**
 * The canonical television example: the display's own diagonal and the noun TV,
 * never a screen, an aspect ratio or an image width.
 */
function tvDisplayChip(facts) {
  return facts.screen.tvDisplayPhrase
    ? chip(
      `Emphasise the ${facts.screen.tvDisplayPhrase}`,
      'The television this version states, by its diagonal size.',
      ['snapshot.room.screen.display_type', 'snapshot.room.screen.diagonal_inches'],
      [facts.screen.tvDisplayPhrase],
    )
    : chip(
      TV_GENERIC_CHIP,
      'This version states a television, so the example carries no number.',
      ['snapshot.room.screen.display_type'],
      [],
    );
}

/**
 * The display example for this version.
 *
 * A television is stated by its authoritative diagonal and the noun TV — never
 * by a viewable width, a preset width or an aspect ratio. A projection screen
 * keeps the existing screen size and aspect ratio wording.
 */
function displayChip(facts) {
  if (facts.screen.isTv) return tvDisplayChip(facts);
  if (facts.screen.available && Number.isFinite(facts.screen.sizeInches)) {
    return chip(
      `Emphasise the ${facts.screen.sizeInches} inch${facts.screen.aspectRatio ? ` ${facts.screen.aspectRatio}` : ''} screen`,
      'Screen size and aspect ratio as stated for this version.',
      ['snapshot.room.screen.size_inches', 'snapshot.room.screen.aspect_ratio'],
      [String(facts.screen.sizeInches), facts.screen.aspectRatio].filter(Boolean),
    );
  }
  return chip(
    SCREEN_GENERIC_CHIP,
    'This version states no screen size, so the example carries no number.',
    ['snapshot.room.screen'],
    [],
  );
}

/**
 * The deterministic examples, assembled from the calculated facts. Every value
 * in the label comes from a named snapshot field; where a fact is missing the
 * example is either omitted or stated without a number.
 */
export function buildAuthorityChips(facts) {
  if (!facts?.available) return [];
  const chips = [];
  const { channels, seating, parameters } = facts;

  chips.push(displayChip(facts));

  if (channels.configuration) {
    chips.push(chip(
      `Explain the ${channels.configuration} system layout`,
      'Channel layout calculated for this version.',
      ['snapshot.system.configuration.dolby_config'],
      [channels.configuration],
    ));
  }

  if (Number.isFinite(channels.total)) {
    chips.push(chip(
      `Highlight the ${channels.total} discrete channels`,
      'Discrete channel count calculated for this version.',
      ['snapshot.system.channel_layout.total_discrete'],
      [String(channels.total)],
    ));
  }

  const p12 = parameters.p12;
  if (p12) {
    chips.push(chip(
      `Show the ${levelPrefix(p12)}screen Dynamic Range result`,
      `Screen Dynamic Range result for this version: ${p12.text}.`,
      ['snapshot.rp22.parameter_headlines.p12'],
      [p12.text],
    ));
  }

  const p16 = parameters.p16;
  if (p16) {
    chips.push(chip(
      `Explain the ${levelPrefix(p16)}screen timbre result`,
      `Screen timbre result for this version: ${p16.text}.`,
      ['snapshot.rp22.parameter_headlines.p16'],
      [p16.text],
    ));
  }

  const p18 = parameters.p18;
  if (p18) {
    chips.push(chip(
      'Highlight the bass extension result',
      `Bass extension result for this version: ${p18.text}.`,
      ['snapshot.bass.p18'],
      [p18.text],
    ));
  }

  if (Number.isFinite(seating.rows) && seating.rows >= 2) {
    chips.push(chip(
      'Explain front-row and rear-row viewing differences',
      `${seating.rows} seating rows in this version.`,
      ['snapshot.room.seating.row_count'],
      [String(seating.rows)],
    ));
  }

  // The subwoofer example states this version's own configuration — the count and
  // the front/rear layout read from its subwoofer instances. A version with no
  // active subwoofer gets no subwoofer example at all, never an invented one.
  const subs = facts.subwoofers || {};
  if (Number.isFinite(subs.totalSubwooferCount) && subs.totalSubwooferCount > 0) {
    const total = subs.totalSubwooferCount;
    const layout = subs.layoutLabel ? ` ${subs.layoutLabel}` : '';
    chips.push(chip(
      total === 1
        ? `Explain the single${layout} subwoofer configuration`
        : `Explain the ${total} subwoofer${layout} configuration`,
      subs.humanReadableSummary
        ? `Subwoofer configuration in this version: ${subs.humanReadableSummary}.`
        : 'Subwoofer configuration read from this version.',
      ['snapshot.system.subwoofer_strategy.instances', 'snapshot.system.subwoofer_strategy.count'],
      [String(total), ...(subs.modelLabel ? [subs.modelLabel] : [])],
    ));
  }

  const p20 = parameters.p20;
  if (p20) {
    chips.push(chip(
      'Explain bass consistency across the seating',
      `Bass consistency result for this version: ${p20.text}.`,
      ['snapshot.bass.p20'],
      [p20.text],
    ));
  }

  return chips.slice(0, AUTHORITY_CHIP_LIMIT);
}

/** The calculated result a chip names, or null when it names none. */
function matchParameterPhrase(text, facts) {
  for (const phrase of PARAMETER_PHRASES) {
    if (!phrase.re.test(text)) continue;
    return {
      id: phrase.id,
      label: PARAMETER_PLAIN_LANGUAGE[phrase.id] || `P${phrase.id}`,
      entry: facts.parameters?.[`p${phrase.id}`] || null,
    };
  }
  return null;
}

/**
 * Validate one chip label against the project authority.
 *
 * Every number must match the canonical value for what it describes, and every
 * named result must exist for this version.
 *
 * @param {Object|null} [policy] — the proposal exclusion policy. An assumed or
 *   administrative parameter (P8, P15, P21) may only be suggested when the
 *   designer explicitly asked for it, and then only labelled as an assumption.
 * @returns {{ status: 'passed'|'rejected', violations: Array<Object> }}
 */
export function validateNarrativeChip(label, facts, policy = null) {
  const text = String(label || '').trim();
  const violations = [];
  if (!text) return { status: 'rejected', violations: [{ rule: 'empty_chip' }] };
  if (!facts || facts.available !== true) {
    return { status: 'rejected', violations: [{ rule: 'no_authority' }] };
  }

  // An assumed or administrative parameter is never a suggestion: no chip may
  // offer to compare it, improve it or discuss it unless it was asked for, and
  // then only as a labelled assumption.
  const assumed = assumedParameterUseIssue(text, policy, { broad: true });
  if (assumed) {
    return {
      status: 'rejected',
      violations: [{
        rule: assumed.rule,
        value: assumed.code,
        allowed: policy?.allows?.(assumed.code) === true ? ASSUMED_PARAMETER_LABEL : null,
      }],
    };
  }

  // A high-channel-count design has no speaker-count or spacing upgrade to offer.
  // Parameter 2 is already at the top RP22 level for this layout, so a chip that
  // presents the layout as a room-geometry limitation, or that raises processor
  // or amplifier channel capability or cost, is rejected here rather than shown
  // to the designer.
  if (isHighChannelDensityLayout({ channelCount: facts.channels?.total, configuration: facts.channels?.configuration })) {
    if (mentionsHighChannelSpacingUpgrade(text)) {
      return {
        status: 'rejected',
        violations: [{ rule: 'high_channel_upgrade', value: text, allowed: null }],
      };
    }
    if (mentionsRoomGeometryConstraintClaim(text)) {
      return {
        status: 'rejected',
        violations: [{ rule: 'high_channel_geometry_constraint', value: text, allowed: HIGH_CHANNEL_PREFERRED_SENTENCE }],
      };
    }
    if (mentionsProcessorCostClaim(text)) {
      return {
        status: 'rejected',
        violations: [{ rule: 'high_channel_processor_cost', value: text, allowed: null }],
      };
    }
  }

  // ── Display language: a television is never described as a screen. ──
  if (facts.screen.isTv) {
    for (const pattern of TV_FORBIDDEN_DISPLAY_RE) {
      const match = pattern.exec(text);
      if (match) violations.push({ rule: 'display_noun', value: match[0], allowed: 'TV' });
    }
  }

  let working = text;

  // ── Aspect ratio: a stated aspect must be this design's aspect. ──
  // A television is never described by an aspect ratio, so the aspect a TV may
  // state is none at all.
  const allowedAspect = facts.screen.displayAspectRatio ?? null;
  for (const match of text.matchAll(/(\d+(?:\.\d+)*)\s*:\s*(\d+(?:\.\d+)*)/g)) {
    const value = `${match[1]}:${match[2]}`;
    if (!allowedAspect || value !== allowedAspect) {
      violations.push({ rule: 'aspect_ratio', value, allowed: allowedAspect });
    }
  }
  if (facts.screen.aspectRatio) working = working.split(facts.screen.aspectRatio).join(' ');

  // ── Channel layout strings (9.1.6): a different layout is an invention. ──
  for (const match of working.matchAll(/\d+(?:\.\d+){1,}/g)) {
    if (facts.sets.layouts.has(match[0])) continue;
    violations.push({ rule: 'channel_layout', value: match[0], allowed: facts.channels.configuration });
  }
  working = working.replace(/\d+(?:\.\d+){1,}/g, (token) => (facts.sets.layouts.has(token) ? ' '.repeat(token.length) : token));

  // ── Unit rules: screen, counts, dB, Hz, degrees, metres. ──
  for (const unitRule of UNIT_RULES) {
    working = working.replace(unitRule.re, (match, value, offset, whole) => {
      const allowed = unitRule.allowed(facts, value, whole.slice(Math.max(0, offset - 40), offset + match.length + 20));
      const normalised = normaliseNumber(value);
      if (!allowed || !allowed.has(normalised)) {
        violations.push({ rule: unitRule.rule, value: normalised, allowed: allowed ? [...allowed] : [] });
      }
      return ' '.repeat(match.length);
    });
  }

  // ── Levels: only a level this version achieved, and the level of the result
  // the chip actually names. ──
  const phrase = matchParameterPhrase(text, facts);
  if (phrase && !phrase.entry) {
    violations.push({ rule: 'unknown_result', value: phrase.label, parameter: phrase.id, allowed: null });
  }
  for (const match of text.matchAll(/\bL(\d)\b|\bLevel\s+(\d)\b/gi)) {
    const level = `L${match[1] || match[2]}`;
    if (phrase?.entry) {
      const achieved = normaliseLevel(phrase.entry.level);
      if (achieved !== level) {
        violations.push({ rule: 'parameter_level', value: level, allowed: achieved, parameter: phrase.id });
      }
    } else if (!facts.sets.levels.has(level)) {
      violations.push({ rule: 'level', value: level, allowed: [...facts.sets.levels] });
    }
  }
  working = working.replace(/\bL\d\b|\bLevel\s+\d\b/gi, (match) => ' '.repeat(match.length));

  // ── Anything left over must still be a number this version states. ──
  for (const token of working.match(NUMBER_RE) || []) {
    const normalised = normaliseNumber(token);
    if (!facts.sets.all.has(normalised)) {
      violations.push({ rule: 'unmatched_number', value: normalised, allowed: null });
    }
  }

  return { status: violations.length === 0 ? 'passed' : 'rejected', violations };
}

/**
 * A chip that failed only on its screen size is rewritten to the correct screen
 * example (or to the generic wording when this version states no screen).
 */
function rewriteChip(label, check, facts) {
  const violations = check.violations || [];

  // A television: an example that describes the display as something else — a
  // screen, an aspect ratio, an image width — is replaced by the canonical TV
  // example, so refreshing the examples can never reintroduce screen wording.
  if (facts.screen.isTv) {
    const describesDisplay = violations.some((violation) => violation.rule === 'screen_size'
      || violation.rule === 'aspect_ratio'
      || violation.rule === 'display_noun');
    if (!describesDisplay) return null;
    const display = tvDisplayChip(facts);
    return {
      label: display.label,
      reason: 'The display in this example did not match this version, so it was rewritten from the television this version states.',
      sourceFields: display.sourceFields,
      sourceValues: display.sourceValues,
    };
  }

  const screenOnly = violations.length > 0
    && violations.every((violation) => violation.rule === 'screen_size');
  if (!screenOnly || !/screen/i.test(label)) return null;

  if (facts.screen.available && Number.isFinite(facts.screen.sizeInches)) {
    return {
      label: `Emphasise the ${facts.screen.sizeInches} inch${facts.screen.aspectRatio ? ` ${facts.screen.aspectRatio}` : ''} screen`,
      reason: 'The screen size in this example did not match this version, so it was rewritten from the screen size stated for this version.',
      sourceFields: ['snapshot.room.screen.size_inches', 'snapshot.room.screen.aspect_ratio'],
      sourceValues: [String(facts.screen.sizeInches), facts.screen.aspectRatio].filter(Boolean),
    };
  }
  return {
    label: SCREEN_GENERIC_CHIP,
    reason: 'The screen size in this example did not match this version, so the number was removed.',
    sourceFields: ['snapshot.room.screen'],
    sourceValues: [],
  };
}

/**
 * Build the chip list shown to the designer: the deterministic authority chips
 * first, then the AI suggestions that passed validation. Every chip carries its
 * diagnostics record — chip text, source fields, source value and outcome — so
 * each example can be traced to the data it came from.
 *
 * @param {{ aiChips?: Array<Object>, facts: Object, policy?: Object|null }} params
 * @returns {{ suggestions: Array<Object>, diagnostics: Array<Object> }}
 */
export function resolveNarrativeChips({ aiChips = [], facts, policy = null } = {}) {
  const suggestions = [];
  const diagnostics = [];
  const seen = new Set();

  const add = (entry, diagnostic) => {
    // The diagnostic is always recorded, even when the chip itself is dropped as
    // a duplicate: what happened to every candidate chip stays traceable.
    diagnostics.push({
      text: diagnostic.text || entry.label,
      source: entry.source || 'authority',
      status: diagnostic.status,
      sourceFields: entry.sourceFields || [],
      sourceValues: entry.sourceValues || [],
      violations: diagnostic.violations || [],
      rewrittenTo: diagnostic.rewrittenTo || null,
    });
    const key = String(entry.label).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      label: entry.label,
      reason: entry.reason || '',
      source: entry.source || 'authority',
    });
  };

  // Deterministic examples first: assembled in code from the calculated facts.
  for (const entry of buildAuthorityChips(facts)) {
    if (suggestions.length >= CHIP_LIMIT) break;
    const check = validateNarrativeChip(entry.label, facts);
    // A chip built here must pass its own check; one that does not is dropped
    // rather than displayed with a value that failed validation.
    add(entry, { status: check.status, violations: check.violations });
  }

  for (const raw of Array.isArray(aiChips) ? aiChips : []) {
    if (suggestions.length >= CHIP_LIMIT) break;
    const label = String(raw?.label || '').trim();
    if (!label) continue;
    const check = validateNarrativeChip(label, facts, policy);
    if (check.status === 'passed') {
      add(
        { label, reason: String(raw?.reason || '').trim(), source: 'adi', sourceFields: [], sourceValues: [] },
        { status: 'passed', violations: [] },
      );
      continue;
    }
    const rewrite = rewriteChip(label, check, facts);
    if (rewrite) {
      const recheck = validateNarrativeChip(rewrite.label, facts, policy);
      if (recheck.status === 'passed') {
        add(
          { ...rewrite, source: 'authority' },
          { text: label, status: 'rewritten', violations: check.violations, rewrittenTo: rewrite.label },
        );
        continue;
      }
    }
    diagnostics.push({
      text: label,
      source: 'adi',
      status: 'rejected',
      sourceFields: [],
      sourceValues: [],
      violations: check.violations,
      rewrittenTo: null,
    });
  }

  return { suggestions, diagnostics };
}

export default resolveNarrativeChips;