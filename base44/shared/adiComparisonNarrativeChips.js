/**
 * adiComparisonNarrativeChips.js (shared)
 * ---------------------------------------
 * The comparison-mode half of the ADI narrative example chips.
 *
 * A single-version proposal describes its one version, so its examples may state
 * that version's own facts. A comparison covers two or more selected versions,
 * so an example may never state one version's fact as though it applied to the
 * whole proposal.
 *
 * Three rules decide the comparison list:
 *
 *   1. A fact identical in every selected version may be stated normally, so the
 *      single-version examples that hold for all versions are kept as they are.
 *   2. Everything else is offered as a comparison of the selected versions: a
 *      category prompt naming the design area (dynamic range, bass layout,
 *      spatial resolution, speaker layout, viewing experience, system scale),
 *      never one version's number on its own.
 *   3. Every candidate chip is validated against ALL selected versions. A chip
 *      that is not comparative must pass for every version — that is what makes
 *      a shared fact safe to state. A comparative chip may state a value that
 *      belongs to any selected version, but a value found in none of them is
 *      still rejected: a version difference is never invented.
 *
 * Nothing is calculated here. Every fact is read from the frozen Engineering
 * Snapshot of each selected version — the same authority the report is
 * generated from. Pure: no React, no fetching, no side effects.
 */

import {
  CHIP_LIMIT,
  buildAuthorityChips,
  validateNarrativeChip,
} from './adiNarrativeAuthority.js';
import {
  isHighChannelDensityLayout,
  NAMED_HIGH_DENSITY_LAYOUT,
} from './highChannelDensityRule.js';

/** How many comparison examples the authority offers. The remaining slots are
 *  reserved for examples that hold identically in every selected version. */
export const COMPARISON_CHIP_LIMIT = 9;

/** Slots kept for the examples that hold identically in every selected version,
 *  leaving the last slot for ADI's own suggestions. */
const SHARED_CHIP_LIMIT = COMPARISON_CHIP_LIMIT + 2;

/** Protocol names that carry digits but state no design value. */
const PROTOCOL_NAMES = Object.freeze(['RP22', 'RP23']);

/**
 * Wording that asks the report to compare. A chip with none of this is stating
 * a fact, so it must hold for every selected version.
 */
const COMPARATIVE_RE = /compar|difference|differences|\bbetween\b|\bacross\b|\bversus\b|\bvs\.?\b|upgrade benefits|which (?:system|version|option)|trade-?off/i;

/** The parameters behind each comparison area of the report. */
const DYNAMIC_RANGE_PARAMETERS = Object.freeze([12, 13, 14]);
const SPATIAL_RESOLUTION_PARAMETERS = Object.freeze([1, 5, 7, 9]);
const ALL_RESULT_PARAMETERS = Object.freeze([2, 4, 5, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20]);

export function isComparativeChip(label) {
  return COMPARATIVE_RE.test(String(label || ''));
}

/** The wording for two versions and for three or more. */
export function comparisonWording(versions) {
  const two = versions.length === 2;
  return {
    two,
    ofSystems: two ? 'of both systems' : 'across all systems',
    betweenVersions: two ? 'between the two versions' : 'across all selected versions',
    subwooferStrategies: two
      ? 'Compare the subwoofer strategies'
      : 'Compare the subwoofer strategies across all systems',
    stronger: two
      ? 'Highlight which system gives the stronger cinema experience'
      : 'Highlight which system gives the strongest cinema experience',
    upgrades: two
      ? 'Compare the upgrade benefits between versions'
      : 'Compare the upgrade benefits across all versions',
  };
}

function chip(label, reason, sourceFields, sourceValues) {
  return { label, reason, source: 'authority', sourceFields, sourceValues };
}

function versionName(entry, index) {
  return String(entry?.version_name || '').trim() || `Version ${index + 1}`;
}

/** Reads one fact per selected version and names the version it came from. */
function perVersion(versions, reader) {
  return versions
    .map((entry, index) => {
      const value = reader(entry.facts);
      return value ? `${versionName(entry, index)}: ${value}` : null;
    })
    .filter(Boolean)
    .join('; ');
}

function everyVersion(versions, reader) {
  return versions.every((entry) => Boolean(reader(entry.facts)));
}

// ── The facts each comparison area is offered from ──────────────────────────

function subwooferLine(facts) {
  const subs = facts?.subwoofers || {};
  if (!Number.isFinite(subs.totalSubwooferCount) || subs.totalSubwooferCount <= 0) return null;
  return subs.humanReadableSummary || `${subs.totalSubwooferCount} subwoofers`;
}

function channelsLine(facts) {
  const parts = [
    facts?.channels?.configuration ? `${facts.channels.configuration} layout` : null,
    Number.isFinite(facts?.channels?.total) ? `${facts.channels.total} discrete channels` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function parameterLine(facts, ids) {
  const parts = ids
    .map((id) => facts?.parameters?.[`p${id}`])
    .filter(Boolean)
    .map((entry) => entry.text);
  return parts.length > 0 ? parts.join(', ') : null;
}

function screenSeatingLine(facts) {
  const parts = [
    facts?.screen?.available && Number.isFinite(facts.screen.sizeInches)
      ? `${facts.screen.sizeInches}"${facts.screen.aspectRatio ? ` ${facts.screen.aspectRatio}` : ''} screen`
      : null,
    Number.isFinite(facts?.seating?.seats) ? `${facts.seating.seats} seats` : null,
    Number.isFinite(facts?.seating?.rows) ? `${facts.seating.rows} rows` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function rowsLine(facts) {
  const rows = facts?.seating?.rows;
  return Number.isFinite(rows) && rows >= 2 ? `${rows} rows` : null;
}

function resultLine(facts) {
  return parameterLine(facts, ALL_RESULT_PARAMETERS) || channelsLine(facts);
}

/**
 * The distinct subwoofer counts of the selected versions, or null unless every
 * version states a count and exactly two different counts are in play. Two
 * counts is what makes an exact "2-sub and 4-sub" comparison honest.
 */
export function distinctSubwooferCounts(versions) {
  const counts = versions.map((entry) => entry.facts?.subwoofers?.totalSubwooferCount);
  if (!counts.every((count) => Number.isFinite(count) && count > 0)) return null;
  const distinct = [...new Set(counts)].sort((a, b) => a - b);
  return distinct.length === 2 ? distinct : null;
}

/**
 * The comparison examples: category prompts across the selected versions, each
 * offered only when every selected version states the area it names.
 */
export function buildComparisonAuthorityChips(versions = []) {
  const list = (versions || []).filter((entry) => entry?.facts?.available === true);
  if (list.length < 2) return [];

  const words = comparisonWording(list);
  const core = [];
  const extras = [];

  // 1. The comparison itself. It claims no fact, so it is always offered.
  core.push(chip(
    `Explain the main differences ${words.betweenVersions}`,
    `Compares ${list.map((entry, index) => versionName(entry, index)).join(' against ')}.`,
    ['selected versions'],
    list.map((entry, index) => versionName(entry, index)),
  ));

  // 2. The design areas the report compares, each read from every version.
  if (everyVersion(list, (facts) => parameterLine(facts, DYNAMIC_RANGE_PARAMETERS))) {
    core.push(chip(
      `Compare the dynamic range ${words.ofSystems}`,
      perVersion(list, (facts) => parameterLine(facts, DYNAMIC_RANGE_PARAMETERS)),
      ['snapshot.rp22.parameter_headlines.p12/p13/p14 (every selected version)'],
      [],
    ));
  }

  if (everyVersion(list, subwooferLine)) {
    core.push(chip(
      `Compare the bass layouts ${words.ofSystems}`,
      perVersion(list, subwooferLine),
      ['snapshot.system.subwoofer_strategy (every selected version)'],
      [],
    ));
  }

  if (everyVersion(list, (facts) => parameterLine(facts, SPATIAL_RESOLUTION_PARAMETERS))) {
    core.push(chip(
      `Compare the spatial resolution ${words.ofSystems}`,
      perVersion(list, (facts) => parameterLine(facts, SPATIAL_RESOLUTION_PARAMETERS)),
      ['snapshot.rp22.parameter_headlines (spatial resolution, every selected version)'],
      [],
    ));
  }

  if (everyVersion(list, channelsLine)) {
    core.push(chip(
      `Compare the speaker layouts ${words.ofSystems}`,
      perVersion(list, channelsLine),
      ['snapshot.system.channel_layout (every selected version)'],
      [],
    ));
  }

  if (everyVersion(list, screenSeatingLine)) {
    core.push(chip(
      'Compare the screen and seating experience',
      perVersion(list, screenSeatingLine),
      ['snapshot.room.screen', 'snapshot.room.seating (every selected version)'],
      [],
    ));
  }

  if (everyVersion(list, subwooferLine)) {
    core.push(chip(
      words.subwooferStrategies,
      perVersion(list, subwooferLine),
      ['snapshot.system.subwoofer_strategy (every selected version)'],
      [],
    ));
  }

  // The exact comparison, only when two versions genuinely hold two counts.
  const counts = distinctSubwooferCounts(list);
  if (counts) {
    core.push(chip(
      `Compare the ${counts[0]}-sub and ${counts[1]}-sub bass layouts`,
      perVersion(list, subwooferLine),
      ['snapshot.system.subwoofer_strategy.count (every selected version)'],
      counts.map(String),
    ));
  }

  if (everyVersion(list, rowsLine)) {
    core.push(chip(
      'Compare the front row and rear row viewing experience',
      perVersion(list, rowsLine),
      ['snapshot.room.seating.row_count (every selected version)'],
      [],
    ));
  }

  // 3. The wider comparison points, offered on the same terms.
  if (everyVersion(list, resultLine)) {
    extras.push(chip(
      'Compare system scale, speaker count and bass capability',
      perVersion(list, resultLine),
      ['snapshot.system', 'snapshot.rp22.parameter_headlines (every selected version)'],
      [],
    ));
  }

  // A comparison whose versions all use a high-channel-count layout has no
  // channel or spacing upgrade to compare. The shared layout is the point
  // instead: it is already at the top RP22 level for discrete channel
  // capability, so it is offered as a strength the options have in common.
  const sharedHighDensityLayout = list.every((entry) => isHighChannelDensityLayout({
    channelCount: entry?.facts?.channels?.total,
    configuration: entry?.facts?.channels?.configuration,
  }));

  if (sharedHighDensityLayout) {
    const sharedConfiguration = list[0]?.facts?.channels?.configuration || NAMED_HIGH_DENSITY_LAYOUT;
    extras.push(chip(
      `Highlight the shared ${sharedConfiguration} layout`,
      `Every selected version already uses the same high-channel-count layout, which is the top RP22 level for discrete channel capability.`,
      ['snapshot.system.channel_layout (every selected version)'],
      list.map((entry, index) => versionName(entry, index)),
    ));
  } else {
    extras.push(chip(
      words.upgrades,
      `Compares what each of the ${list.length} selected versions adds over the others.`,
      ['selected versions'],
      list.map((entry, index) => versionName(entry, index)),
    ));
  }

  if (everyVersion(list, resultLine)) {
    extras.push(chip(
      `Compare performance against RP22 ${words.ofSystems}`,
      perVersion(list, resultLine),
      ['snapshot.rp22 (every selected version)'],
      [],
    ));
    extras.push(chip(
      words.stronger,
      `Compares the calculated results of ${list.map((entry, index) => versionName(entry, index)).join(' and ')}.`,
      ['snapshot.rp22.parameter_headlines (every selected version)'],
      [],
    ));
  }

  return [...core, ...extras].slice(0, COMPARISON_CHIP_LIMIT);
}

/**
 * The single-version examples that hold identically in EVERY selected version.
 * These are safe to state normally: nothing in them belongs to one version only.
 */
export function buildSharedAuthorityChips(versions = []) {
  const list = (versions || []).filter((entry) => entry?.facts?.available === true);
  if (list.length < 2) return [];

  const others = list.slice(1).map(
    (entry) => new Set(buildAuthorityChips(entry.facts).map((entryChip) => entryChip.label)),
  );

  return buildAuthorityChips(list[0].facts)
    .filter((entryChip) => others.every((labels) => labels.has(entryChip.label)))
    .map((entryChip) => ({
      ...entryChip,
      reason: `Stated the same in every selected version. ${entryChip.reason}`,
    }));
}

// ── Validation ──────────────────────────────────────────────────────────────

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes the official saved version names and the protocol names (RP22, RP23)
 * from a chip before its numbers are checked. A version name is a label, not a
 * design value, and RP22 is the standard the report is graded against — neither
 * may be read as a stated figure.
 */
function stripLabels(label, versions) {
  let working = String(label || '');
  for (const entry of versions) {
    const name = String(entry?.version_name || '').trim();
    if (name.length < 3) continue;
    working = working.replace(new RegExp(escapeRegExp(name), 'gi'), ' '.repeat(name.length));
  }
  for (const name of PROTOCOL_NAMES) {
    working = working.replace(new RegExp(escapeRegExp(name), 'gi'), ' '.repeat(name.length));
  }
  return working;
}

function dedupeViolations(violations) {
  const seen = new Set();
  return violations.filter((violation) => {
    const key = `${violation.rule}:${violation.value}:${violation.version || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Validate one chip against every selected version.
 *
 * Not comparative → it must pass for every version (a shared fact).
 * Comparative → every value it states must belong to one of the versions, and a
 * value no version states is rejected.
 *
 * @returns {{ status: 'passed'|'rejected', violations: Array<Object> }}
 */
export function validateComparisonChip(label, versions) {
  const list = (versions || []).filter((entry) => entry?.facts?.available === true);
  if (list.length === 0) return { status: 'rejected', violations: [{ rule: 'no_authority' }] };

  const working = stripLabels(label, list).trim();
  if (!working) return { status: 'rejected', violations: [{ rule: 'empty_chip' }] };

  const checks = list.map((entry) => validateNarrativeChip(working, entry.facts));
  if (checks.every((check) => check.status === 'passed')) {
    return { status: 'passed', violations: [] };
  }

  if (!isComparativeChip(label)) {
    const violations = [];
    checks.forEach((check, index) => {
      for (const violation of check.violations) {
        violations.push({ ...violation, version: versionName(list[index], index) });
      }
    });
    return { status: 'rejected', violations: dedupeViolations(violations) };
  }

  const violations = [];
  checks.forEach((check, index) => {
    for (const violation of check.violations) {
      // A comparative chip may state a value that belongs to another selected
      // version: that version's own check does not raise this violation.
      const explained = checks.some((other, otherIndex) => otherIndex !== index
        && !other.violations.some(
          (otherViolation) => otherViolation.rule === violation.rule
            && String(otherViolation.value) === String(violation.value),
        ));
      if (!explained) {
        violations.push({ ...violation, version: versionName(list[index], index) });
      }
    }
  });
  return { status: violations.length === 0 ? 'passed' : 'rejected', violations: dedupeViolations(violations) };
}

/**
 * Build the comparison chip list: the comparison examples first, then the
 * examples that hold in every selected version, then the ADI suggestions that
 * pass validation against every selected version.
 *
 * @param {{ aiChips?: Array<Object>, versions: Array<{ version_name, facts }> }} params
 * @returns {{ suggestions: Array<Object>, diagnostics: Array<Object> }}
 */
export function resolveComparisonNarrativeChips({ aiChips = [], versions = [] } = {}) {
  const list = (versions || []).filter((entry) => entry?.facts?.available === true);
  const suggestions = [];
  const diagnostics = [];
  const seen = new Set();

  const add = (entry, diagnostic) => {
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

  for (const entry of buildComparisonAuthorityChips(list)) {
    if (suggestions.length >= COMPARISON_CHIP_LIMIT) break;
    const check = validateComparisonChip(entry.label, list);
    add(entry, { status: check.status, violations: check.violations });
  }

  for (const entry of buildSharedAuthorityChips(list)) {
    if (suggestions.length >= SHARED_CHIP_LIMIT) break;
    const check = validateComparisonChip(entry.label, list);
    add(entry, { status: check.status, violations: check.violations });
  }

  for (const raw of Array.isArray(aiChips) ? aiChips : []) {
    if (suggestions.length >= CHIP_LIMIT) break;
    const label = String(raw?.label || '').trim();
    if (!label) continue;
    const check = validateComparisonChip(label, list);
    if (check.status !== 'passed') {
      diagnostics.push({
        text: label,
        source: 'adi',
        status: 'rejected',
        sourceFields: [],
        sourceValues: [],
        violations: check.violations,
        rewrittenTo: null,
      });
      continue;
    }
    add(
      { label, reason: String(raw?.reason || '').trim(), source: 'adi', sourceFields: [], sourceValues: [] },
      { status: 'passed', violations: [] },
    );
  }

  return { suggestions, diagnostics };
}

export default resolveComparisonNarrativeChips;