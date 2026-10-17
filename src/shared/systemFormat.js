/**
 * systemFormat.js
 * ---------------
 * THE client- and dealer-facing SYSTEM FORMAT authority.
 *
 * The format a client reads is:
 *
 *     BED CHANNELS . ACTIVE SUBWOOFERS . OVERHEAD CHANNELS
 *
 *   5 bed channels + 2 active subwoofers + 4 overheads  →  "5.2.4"
 *   7 bed channels + 4 active subwoofers + 4 overheads  →  "7.4.4"
 *   9 bed channels + 3 active subwoofers + 6 overheads  →  "9.3.6"
 *
 * The middle figure is the number of subwoofers the design actually has — the
 * hardware the client is buying — not the single LFE channel of the codec.
 *
 * THIS IS PRESENTATION ONLY. The design's Dolby/codec identity — the canonical
 * "9.1.6", its one .1 LFE channel, the LFE routing, the bass maths, the RP22
 * parameter results, the speaker and subwoofer counts and the saved engineering
 * authority — is untouched by this module and is never derived from its output.
 * Nothing here calculates, grades or corrects anything: it reads passively.
 *
 * Every surface that states a system format to a client or dealer reads it from
 * here, so the Room Designer, the Project Report, the technical overview, the
 * drawing summaries, the Speaker Design schedule, the proposal and the project
 * cards can never disagree.
 *
 * SUBWOOFER COUNTING: an instance is active unless it states enabled: false —
 * the same rule the bass analysis, the pricing engine and the reports use. When
 * no instance list is on hand, a stated subwoofer count or the version's own
 * front/rear configuration counts are used.
 *
 * Pure: no imports, no React, no reads, no side effects. This is the ONE
 * client-facing system format authority in the app.
 */

/** An enabled flag absent still means enabled, matching the rest of the app. */
export function activeSubwooferCount(instances) {
  const list = Array.isArray(instances) ? instances : [];
  return list.filter((instance) => instance?.enabled !== false).length;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * The design's ACTIVE subwoofer count: its own instances where they are known,
 * otherwise a count the caller already holds. Null when the design states
 * nothing at all about its subwoofers — the caller then leaves the stored
 * configuration's own figure standing rather than asserting zero subwoofers.
 */
export function resolveActiveSubwooferCount({
  subwooferInstances,
  subwoofers,
  frontSubsCfg,
  rearSubsCfg,
  subwooferCount,
} = {}) {
  const instances = Array.isArray(subwooferInstances) && subwooferInstances.length > 0
    ? subwooferInstances
    : (Array.isArray(subwoofers) && subwoofers.length > 0 ? subwoofers : null);
  if (instances) return activeSubwooferCount(instances);

  const stated = positiveNumber(subwooferCount);
  if (stated !== null) return stated;

  const configured = (positiveNumber(frontSubsCfg?.count) || 0) + (positiveNumber(rearSubsCfg?.count) || 0);
  return configured > 0 ? configured : null;
}

/**
 * The numeric segments of a layout such as "9.1.6": [9, 1, 6]. An empty or
 * absent layout yields no segments, so a design that states no layout keeps the
 * caller's own placeholder instead of being reported as a zero-channel system.
 */
function layoutDigits(layout) {
  const token = String(layout ?? '').trim().split(/[\s_]+/)[0] || '';
  if (!token) return [];
  return token.split('.').map((part) => {
    const text = String(part).trim();
    return text && Number.isFinite(Number(text)) ? Number(text) : null;
  });
}

function overheadChannels(layout) {
  const digits = layoutDigits(layout);
  return Number.isFinite(digits[2]) ? digits[2] : 0;
}

/**
 * The system format a client reads, from the design's own layout and its active
 * subwoofers. Null when the design states no layout at all, so a caller keeps
 * its own placeholder rather than inventing a format.
 *
 * @param {Object} input
 * @param {string} input.layout — the design's Dolby layout ("9.1.6")
 * @param {number} [input.extraBedChannels] — bed channels added beyond the layout
 * @param {Array}  [input.subwooferInstances] — the version's own subwoofer instances
 * @param {number} [input.subwooferCount] — an already-stated active count
 * @param {Object} [input.frontSubsCfg] / [input.rearSubsCfg] — configuration fallback
 * @returns {string|null} e.g. "9.3.6"
 */
export function systemFormat(input = {}) {
  const bed = layoutDigits(input?.layout)[0];
  if (!Number.isFinite(bed)) return null;

  const extra = Number(input?.extraBedChannels);
  const bedChannels = bed + (Number.isFinite(extra) ? extra : 0);
  const overheads = overheadChannels(input?.layout);

  // The active subwoofer count where the design states its subwoofers. A design
  // that states nothing about them keeps its stored configuration's own figure,
  // so a surface never asserts a subwoofer count it does not know.
  const statedSubs = resolveActiveSubwooferCount(input);
  const layoutSubs = layoutDigits(input?.layout)[1];
  const subs = statedSubs === null ? (Number.isFinite(layoutSubs) ? layoutSubs : 0) : statedSubs;

  return overheads > 0
    ? `${bedChannels}.${subs}.${overheads}`
    : `${bedChannels}.${subs}`;
}

/**
 * The same format in the wording the project cards use: an immersive layout is
 * stated as Dolby Atmos, and a bed-only layout keeps its surround wording.
 */
export function dolbySystemLabel(input = {}) {
  const format = systemFormat(input);
  if (!format) return null;
  return overheadChannels(input?.layout) > 0 ? `Dolby Atmos ${format}` : `${format} Surround`;
}

export default systemFormat;