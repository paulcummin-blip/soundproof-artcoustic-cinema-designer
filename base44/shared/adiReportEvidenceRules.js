/**
 * adiReportEvidenceRules.js (shared)
 * ----------------------------------
 * The evidence rules for ADI-authored client-facing reports (System Design
 * Summary and System Design Comparison).
 *
 * Reports are structured around the three RP22 design structures:
 *   Spatial Resolution, Dynamic Range, Timbre Matching.
 *
 * A parameter is never the point of the writing. Parameters appear only as
 * evidence inside those structures, and only when the result is reliable.
 * This module decides which results are allowed to appear, and which
 * structure each one supports.
 *
 * It reads the frozen Engineering Snapshot passively. It never calculates,
 * grades, regroups or invents a result: it only excludes, labels and sorts
 * what the snapshot already states.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

/** The three RP22 design structures, in report order. */
export const REPORT_STRUCTURES = Object.freeze([
  'Spatial Resolution',
  'Dynamic Range',
  'Timbre Matching',
]);

/**
 * Parameters that are never referenced in a client-facing report, whatever the
 * snapshot contains. Each carries the reason so the exclusion is auditable.
 */
export const EXCLUDED_PARAMETERS = Object.freeze({
  8: 'not used',
  15: 'not used',
  20: 'not used in this client summary',
  21: 'not used',
});

/**
 * Which design structure each parameter supports in a client-facing report.
 *
 * This is the REPORT mapping, deliberately set by the report design and not
 * copied from the compliance surfaces. P4, P6 and P10 are consistency results:
 * they are evidence for how evenly sound is presented across the room, so they
 * support Spatial Resolution in this narrative, alongside the geometry results.
 */
export const PARAMETER_STRUCTURE = Object.freeze({
  1: 'Spatial Resolution',
  2: 'Spatial Resolution',
  3: 'Spatial Resolution',
  4: 'Spatial Resolution',
  5: 'Spatial Resolution',
  6: 'Spatial Resolution',
  7: 'Spatial Resolution',
  9: 'Spatial Resolution',
  10: 'Spatial Resolution',
  11: 'Spatial Resolution',
  12: 'Dynamic Range',
  13: 'Dynamic Range',
  14: 'Dynamic Range',
  16: 'Timbre Matching',
  17: 'Timbre Matching',
  18: 'Timbre Matching',
  19: 'Timbre Matching',
});

/** Plain-language name for each result, used in prose and in the table. */
export const PARAMETER_PLAIN_LANGUAGE = Object.freeze({
  1: 'Seat-to-wall distance',
  2: 'Discrete channels',
  3: 'Screen speaker placement',
  4: 'Screen consistency',
  5: 'Horizontal spacing',
  6: 'Surround level consistency',
  7: 'Front wide position',
  9: 'Overhead spacing',
  10: 'Overhead level consistency',
  11: 'Surround speaker placement',
  12: 'Screen Dynamic Range',
  13: 'Non-screen Dynamic Range',
  8: 'Upfiring speaker allowance',
  14: 'LFE and subwoofer Dynamic Range',
  15: 'Background noise assumption',
  16: 'Screen timbre',
  17: 'Surround timbre',
  18: 'Bass extension',
  19: 'Bass response',
  20: 'Bass seat-to-seat consistency',
  21: 'Early reflection assumption',
});

/**
 * Level and status values that mean the result is not usable as evidence.
 * Nothing here is ever inferred: an unusable result is simply omitted.
 */
const UNUSABLE_LEVELS = new Set(['', 'N/A', 'NA', 'NONE', 'NOT CALCULATED', 'NOT_ASSESSED', 'NOT_CONFIGURED']);
const UNUSABLE_STATUS = /unreliable|provisional|stale|waiting|excluded|not[_ ]?calculated|pending|incomplete|assumed|unknown/i;

/**
 * Strip the Engineering Authority { statement, confidence, source } wrapper.
 * Plain values pass through unchanged.
 */
export function statement(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value.statement ?? null;
  return value;
}

/** True when this parameter may appear in a client-facing report at all. */
export function isReportParameter(parameterId) {
  const id = Number(parameterId);
  if (!Number.isFinite(id)) return false;
  if (EXCLUDED_PARAMETERS[id]) return false;
  return Boolean(PARAMETER_STRUCTURE[id]);
}

/** True when the result is reliable enough to be used as report evidence. */
export function isReliableResult(entry) {
  if (!entry) return false;
  const level = typeof entry.achieved_level === 'string'
    ? entry.achieved_level.trim().toUpperCase()
    : entry.achieved_level == null
      ? ''
      : String(entry.achieved_level).trim().toUpperCase();
  if (UNUSABLE_LEVELS.has(level)) return false;
  const status = entry.status ?? entry.reliability ?? entry.authority_status ?? null;
  if (typeof status === 'string' && UNUSABLE_STATUS.test(status)) return false;
  // A level with no readable value is still usable evidence when it is an
  // assessed level (for example a pass or fail level with no dB figure).
  return true;
}

/** The level and value of a result, or null when it is not reliable. */
export function readReliableResult(entry) {
  if (!isReliableResult(entry)) return null;
  const level = entry.achieved_level ? String(entry.achieved_level).trim() : null;
  const raw = entry.formatted_value ?? entry.display_value ?? entry.raw_value ?? entry.formatted ?? null;
  const value = raw == null ? null : String(raw).trim();
  if (!level && !value) return null;
  return {
    level,
    value,
    text: [level, value].filter(Boolean).join(' · '),
  };
}

/** The structure a parameter supports, or null when it is excluded. */
export function structureForParameter(parameterId) {
  const id = Number(parameterId);
  if (!isReportParameter(id)) return null;
  return PARAMETER_STRUCTURE[id] || null;
}

/** Plain-language name for a parameter, falling back to its supplied title. */
export function plainLanguageName(parameterId, fallbackTitle) {
  const id = Number(parameterId);
  return PARAMETER_PLAIN_LANGUAGE[id] || fallbackTitle || `P${id}`;
}

function parameterRows(snapshot) {
  const list = snapshot?.rp22?.parameter_headlines;
  return Array.isArray(list) ? list.filter((row) => row && row.parameter_id != null) : [];
}

/**
 * Split the snapshot's parameter results into the three design structures,
 * plus the list of results that are deliberately not used.
 *
 * @param {Object} snapshot — frozen Engineering Snapshot
 * @returns {{
 *   byStructure: { [structure: string]: Array<Object> },
 *   used: Array<Object>,
 *   omitted: Array<{ parameter_id: number|null, label: string, reason: string }>,
 * }}
 */
export function splitParameterEvidence(snapshot) {
  const byStructure = {
    'Spatial Resolution': [],
    'Dynamic Range': [],
    'Timbre Matching': [],
  };
  const used = [];
  const omitted = [];

  for (const row of parameterRows(snapshot)) {
    const id = Number(row.parameter_id);
    const label = row.title || plainLanguageName(id);

    if (EXCLUDED_PARAMETERS[id]) {
      // Plain language only: an excluded result is never named by its
      // parameter code in anything the writer reads.
      omitted.push({ parameter_id: id, label: plainLanguageName(id, label), reason: EXCLUDED_PARAMETERS[id] });
      continue;
    }
    const structure = structureForParameter(id);
    if (!structure) {
      omitted.push({ parameter_id: id, label, reason: 'No client-facing structure.' });
      continue;
    }
    const result = readReliableResult(row);
    if (!result) {
      omitted.push({ parameter_id: id, label, reason: 'Not reliable or not calculated.' });
      continue;
    }
    const entry = {
      parameter_id: id,
      structure,
      label: plainLanguageName(id, row.title),
      level: result.level,
      value: result.value,
      text: result.text,
    };
    byStructure[structure].push(entry);
    used.push(entry);
  }

  return { byStructure, used, omitted };
}

/**
 * The bass results, with their reliability stated rather than assumed.
 *
 * P20 is never part of a client-facing report, so it is reported here only as
 * an exclusion. P14, P18 and P19 are usable only when the snapshot states a
 * reliable result for them.
 *
 * @param {Object} snapshot
 * @returns {{
 *   p14: Object|null, p18: Object|null, p19: Object|null,
 *   usable: Array<Object>,
 *   omitted: Array<{ parameter_id: number, label: string, reason: string }>,
 * }}
 */
export function resolveBassEvidence(snapshot) {
  const bass = snapshot?.bass || {};
  const omitted = [];
  const pick = (id, entry, extra = null) => {
    const source = extra ? { ...entry, ...extra } : entry;
    const result = readReliableResult(source);
    const label = plainLanguageName(id);
    if (!result) {
      omitted.push({
        parameter_id: id,
        label,
        reason: entry ? 'Not reliable or not calculated.' : 'Not present in the calculated data.',
      });
      return null;
    }
    return { parameter_id: id, label, level: result.level, value: result.value, text: result.text };
  };

  const p14 = pick(14, bass.p14);
  const p18 = pick(18, bass.p18);
  const p19 = pick(19, bass.p19?.rsp, bass.p19?.rsp
    ? { achieved_level: bass.p19.rsp.level, formatted_value: bass.p19.rsp.display_value ?? bass.p19.rsp.raw_value }
    : null);

  if (bass.p20) {
    omitted.push({ parameter_id: 20, label: plainLanguageName(20), reason: EXCLUDED_PARAMETERS[20] });
  }

  return {
    p14,
    p18,
    p19,
    usable: [p14, p18, p19].filter(Boolean),
    omitted,
  };
}

/**
 * The Key Performance Highlights rows in report priority order.
 *
 * Only the most useful client-facing results are carried into the table, and
 * only when the calculated result is reliable. Rows for excluded parameters
 * (P8, P15, P20, P21) and for internal scores never appear here.
 *
 * The Result value is copied from the snapshot; it is never derived here.
 */
export const HIGHLIGHT_PRIORITY = Object.freeze([
  'screen_size',
  'rp23_viewing',
  'system_layout',
  'p2',
  'p4',
  'p5',
  'p7',
  'p9',
  'p12',
  'p13',
  'p14',
  'p18',
  'p19',
  'p16',
  'p17',
  'p6',
  'p10',
]);

/** Maximum number of client-facing highlight rows. */
export const HIGHLIGHT_ROW_LIMIT = 14;

/** Sort a set of candidate highlight rows into report priority order. */
export function orderHighlightRows(rows) {
  const rank = new Map(HIGHLIGHT_PRIORITY.map((key, index) => [key, index]));
  return [...(rows || [])].sort((a, b) => {
    const left = rank.has(a.key) ? rank.get(a.key) : HIGHLIGHT_PRIORITY.length;
    const right = rank.has(b.key) ? rank.get(b.key) : HIGHLIGHT_PRIORITY.length;
    return left - right;
  });
}