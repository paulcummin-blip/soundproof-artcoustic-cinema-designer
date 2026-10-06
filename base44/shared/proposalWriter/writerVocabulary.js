/**
 * writerVocabulary.js (shared)
 * -----------------------------
 * What the frozen pack lets a draft say, derived from the pack itself: the
 * figures and Performance Levels it states, the products it lists and the option
 * each one belongs to, the option names it uses, and the claims it allows and
 * blocks.
 *
 * Nothing here is a second copy of the engineering. A figure a draft may quote
 * is a figure the pack states; a product a draft may name is a product the pack
 * lists for the option it belongs to. If the pack does not state it, a draft may
 * not say it — which is the whole point of validating a draft against the input
 * the writer was actually given.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { BLOCK_REASON, CLAIM_KIND } from '../proposalEvidence/evidencePackSchema.js';

/** A measurement: a number and the unit the reports state it in. */
const MEASUREMENT = /(\d+(?:\.\d+)?)\s*(dBC|dBc|dB|kHz|Hz|cm|mm|m|kW|W)\b/g;

/** A Performance Level, in the short ("L3") or the written ("Level 3") form. */
const SHORT_LEVEL = /\bL([1-4])\b/g;
const WRITTEN_LEVEL = /\bLevel\s?([1-4])\b/gi;

/** A loudspeaker or subwoofer model as the reports state it ("SUB4-12", "Q8-5"). */
const MODEL = /\b[A-Z]{1,4}\d{1,3}(?:[-\u2013]\d{1,3})?[A-Z]?\b/g;

/** Tokens that look like a model but are never a product. */
const NOT_A_PRODUCT = /^(?:P\d{1,2}|L[1-4]|RP2[23])$/;

/** The blocked claims that forbid a change or an improvement in an area. */
export const CHANGE_BLOCK_REASONS = Object.freeze([
  BLOCK_REASON.NO_CLAIMED_CHANGE,
  BLOCK_REASON.NO_CLAIMED_IMPROVEMENT,
  BLOCK_REASON.NO_ADDED_CHANNELS,
  BLOCK_REASON.NO_SCREEN_CHANGE,
  BLOCK_REASON.NO_SEATING_CHANGE,
]);

/** Keywords for the blocks whose wording is a phrase rather than an area name. */
const REASON_KEYWORDS = Object.freeze({
  [BLOCK_REASON.NO_ADDED_CHANNELS]: ['channel', 'channels', 'format', 'formats'],
  [BLOCK_REASON.NO_SCREEN_CHANGE]: ['screen', 'screens'],
  [BLOCK_REASON.NO_SEATING_CHANGE]: ['seat', 'seats', 'seating'],
});

/** Every figure a string states, as "value unit" (e.g. "116 dbc", "20 hz"). */
export function measurementTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const pattern = new RegExp(MEASUREMENT.source, 'g');
  const found = [];
  let match = pattern.exec(text);
  while (match) {
    found.push(`${match[1]} ${match[2].toLowerCase()}`);
    match = pattern.exec(text);
  }
  return found;
}

/** Every Performance Level a string states, as "L1" to "L4". */
export function levelTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const found = [];
  const short = new RegExp(SHORT_LEVEL.source, 'g');
  let match = short.exec(text);
  while (match) {
    found.push(`L${match[1]}`);
    match = short.exec(text);
  }
  const written = new RegExp(WRITTEN_LEVEL.source, 'gi');
  let word = written.exec(text);
  while (word) {
    found.push(`L${word[1]}`);
    word = written.exec(text);
  }
  return found;
}

/** Every model-shaped token a string carries. */
export function modelTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const pattern = new RegExp(MODEL.source, 'g');
  const found = [];
  let match = pattern.exec(text);
  while (match) {
    found.push(match[0]);
    match = pattern.exec(text);
  }
  return found;
}

/** Whether a model-shaped token is a product name rather than a parameter or a standard. */
export function isProductToken(token) {
  return typeof token === 'string' && token.length > 0 && !NOT_A_PRODUCT.test(token);
}

/** Every Performance Level a parameter's own rows state, keyed by parameter number. */
function parameterLevels(facts) {
  const levels = new Map();
  for (const row of Array.isArray(facts?.parameters) ? facts.parameters : []) {
    const id = Number(row?.parameter_id);
    if (!Number.isFinite(id)) continue;
    const set = levels.get(id) || new Set();
    for (const level of levelTokens(row?.level || '')) set.add(level);
    for (const level of levelTokens(row?.text || '')) set.add(level);
    levels.set(id, set);
  }
  return levels;
}

/** Every string anywhere in a value, so the pack can be read as the text it is. */
function stringsOf(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => stringsOf(entry, out));
    return out;
  }
  if (value && typeof value === 'object') Object.values(value).forEach((entry) => stringsOf(entry, out));
  return out;
}

/** A number as the reports may write it, in both plain and one-decimal form. */
function numberVariants(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return [];
  const variants = [`${number} ${unit}`];
  const oneDecimal = `${number.toFixed(1)} ${unit}`;
  if (!variants.includes(oneDecimal)) variants.push(oneDecimal);
  return variants;
}

/**
 * The vocabulary of one frozen pack.
 *
 * @param {Object} pack — the frozen proposal evidence pack
 * @returns {{
 *   measurements: Set<string>, levels: Set<string>,
 *   parameters: Map<number, Set<string>>, products: Set<string>,
 *   owners: Map<string, Set<string>>, optionNames: Set<string>,
 *   versionIds: Set<string>
 * }}
 */
export function packVocabulary(pack) {
  const measurements = new Set();
  const levels = new Set();
  const parameters = new Map();
  const products = new Set();
  const owners = new Map();
  const optionNames = new Set();

  // Everything the pack states as text: the figures, the levels and the models.
  for (const text of stringsOf(pack)) {
    for (const token of measurementTokens(text)) measurements.add(token);
    for (const level of levelTokens(text)) levels.add(level);
    for (const token of modelTokens(text)) if (isProductToken(token)) products.add(token);
  }

  const options = Array.isArray(pack?.options) ? pack.options : [];
  for (const option of options) {
    if (option?.version_name) optionNames.add(option.version_name);
    const facts = option?.facts || {};
    const versionId = option?.version_id ?? null;

    // Dimensions the reports state as numbers rather than as prose.
    for (const token of numberVariants(facts.room?.length_m, 'm')) measurements.add(token);
    for (const token of numberVariants(facts.room?.width_m, 'm')) measurements.add(token);
    for (const token of numberVariants(facts.room?.height_m, 'm')) measurements.add(token);
    for (const token of numberVariants(facts.screen?.viewable_width_cm, 'cm')) measurements.add(token);
    for (const token of numberVariants(facts.screen?.viewable_height_cm, 'cm')) measurements.add(token);

    for (const [id, set] of parameterLevels(facts)) parameters.set(id, set);

    const owned = [];
    const productStrings = [
      ...stringsOf(facts.system?.products),
      ...stringsOf(facts.system?.products_by_layer),
      ...stringsOf(facts.system?.product_roles),
      ...stringsOf(facts.system?.subwoofer_strategy),
      ...stringsOf(facts.bass),
    ];
    for (const text of productStrings) {
      for (const token of modelTokens(text)) if (isProductToken(token)) owned.push(token);
    }

    for (const token of owned) {
      products.add(token);
      if (!versionId) continue;
      const set = owners.get(token) || new Set();
      set.add(versionId);
      owners.set(token, set);
    }
  }

  // The classification carries a parameter's levels as reported, which is the
  // same evidence a written result is judged against.
  for (const row of Array.isArray(pack?.classification) ? pack.classification : []) {
    const match = /^p(\d+)$/.exec(row?.area || '');
    if (!match) continue;
    const id = Number(match[1]);
    const set = parameters.get(id) || new Set();
    for (const level of Array.isArray(row?.levels) ? row.levels : []) {
      for (const token of levelTokens(level)) set.add(token);
    }
    parameters.set(id, set);
  }

  return {
    measurements,
    levels,
    parameters,
    products,
    owners,
    optionNames,
    versionIds: new Set(options.map((option) => option?.version_id).filter(Boolean)),
  };
}

/** The pack's allowed claims by ID. */
export function claimIndex(input) {
  const index = new Map();
  for (const claim of Array.isArray(input?.allowed_claims) ? input.allowed_claims : []) {
    if (claim?.claim_id) index.set(claim.claim_id, claim);
  }
  return index;
}

/** The pack's blocked claim IDs. */
export function blockIdSet(input) {
  return new Set(
    (Array.isArray(input?.blocked_claims) ? input.blocked_claims : [])
      .map((block) => block?.block_id)
      .filter(Boolean),
  );
}

/** Whether P20 blocks a seat-to-seat bass consistency claim in this pack. */
export function p20BlocksConsistency(input) {
  return (Array.isArray(input?.bass?.blocked) ? input.bass.blocked : [])
    .some((entry) => entry?.reason === BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY);
}

/** Whether the pack allows a recommendation at all. */
export function hasRecommendationClaim(input) {
  return (Array.isArray(input?.allowed_claims) ? input.allowed_claims : [])
    .some((claim) => claim?.kind === CLAIM_KIND.RECOMMENDATION);
}

/**
 * The prose the pack itself states: its claim statements, its materiality notes,
 * its bass note, its allowed bass claims and its framing. A sentence that comes
 * from the pack is a sentence the pack permits, so it is never read as a claimed
 * improvement in an area the pack blocks — the wording was the pack's own.
 */
export function packProseSentences(input) {
  const pack = input?.evidence_pack;
  const stated = [];

  for (const claim of Array.isArray(pack?.allowed_claims) ? pack.allowed_claims : []) stated.push(claim?.statement);
  for (const note of Array.isArray(pack?.materiality_notes) ? pack.materiality_notes : []) stated.push(note?.note);
  for (const entry of Array.isArray(pack?.bass_claims?.allowed) ? pack.bass_claims.allowed : []) stated.push(entry?.text);
  stated.push(pack?.bass_claims?.note);
  stated.push(pack?.decision_framing?.text);

  return stated
    .filter((entry) => typeof entry === 'string' && entry.length > 0)
    .flatMap((entry) => sentenceParts(entry))
    .map((sentence) => sentence.toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Whether a sentence is prose the pack itself states. */
export function isPackProse(sentence, packProse) {
  const normalised = String(sentence || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalised.length === 0) return false;
  return (Array.isArray(packProse) ? packProse : [])
    .some((statement) => statement === normalised || statement.includes(normalised));
}

/** The blocks that forbid a change or an improvement, in pack order. */
export function blockedChangeBlocks(input) {
  return (Array.isArray(input?.blocked_claims) ? input.blocked_claims : [])
    .filter((block) => CHANGE_BLOCK_REASONS.includes(block?.reason));
}

/** Words that name no area on their own, so they never stand as an area's head. */
const STOPWORDS = Object.freeze([
  'and', 'or', 'the', 'of', 'to', 'for', 'with', 'a', 'an', 'in', 'on', 'at', 'by', 'as', 'its', 'from',
]);

/**
 * Terms too broad to stand for one area on their own. "System" names a
 * subwoofer as often as a layout, "level" is an option's name and a Performance
 * Level before it is an overhead result, and "bass" is the family the whole bass
 * section belongs to. None of them identifies ONE area, so a sentence is never
 * read as claiming a change in an area from that word by itself — but the area's
 * own phrase ("system layout", "bass consistency") still names it.
 */
const GENERIC_AREA_TERMS = Object.freeze(['system', 'level', 'bass']);

/** The distinctive terms a label is named by. */
function areaHeads(label) {
  const words = String(label || '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2
      && !STOPWORDS.includes(word)
      && !GENERIC_AREA_TERMS.includes(word));

  const heads = new Set();
  for (const word of words) {
    heads.add(word);
    // A plural label names its singular too: "Subwoofers" is claimed by "subwoofer".
    if (word.endsWith('s') && word.length > 4) heads.add(word.slice(0, -1));
  }
  return [...heads];
}

/** The area's own phrase, as a sentence would write it. */
function areaPhrases(label) {
  const text = String(label || '')
    .replace(/\([^)]*\)/g, ' ')
    .split('/')[0]
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.split(' ').filter((word) => word.length > 1).length > 1 ? [text] : [];
}

/**
 * What one blocked claim is named by: the area's own phrase, and the distinctive
 * terms a claim about that area would use as its subject. A block whose wording
 * is a fixed phrase rather than an area keeps its own terms.
 *
 * @param {Object} block — one blocked claim
 * @param {Object} pack — the frozen evidence pack
 * @returns {{ reason: string|null, heads: Array<string>, phrases: Array<string> }}
 */
export function blockPatterns(block, pack) {
  const explicit = REASON_KEYWORDS[block?.reason];
  const area = (Array.isArray(pack?.areas) ? pack.areas : [])
    .find((entry) => entry.area === (block?.area || block?.scope)) || null;
  const label = area?.label || '';

  return {
    reason: block?.reason || null,
    heads: explicit ? [...explicit] : areaHeads(label || block?.area || block?.scope),
    phrases: explicit ? [] : areaPhrases(label),
  };
}

/** The words an improvement claim would have to name for one blocked area. */
export function blockKeywords(block, pack) {
  return blockPatterns(block, pack).heads;
}

/**
 * Every term the pack's areas are named by — the vocabulary a sentence has to
 * reach into before it can be asserting anything about the evidence at all.
 * Used to tell a claim about the design from a sentence that asserts nothing.
 */
export function areaAnchorTerms(pack) {
  const terms = new Set();

  const add = (label) => {
    const words = String(label || '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.includes(word));
    for (const word of words) {
      terms.add(word);
      if (word.endsWith('s') && word.length > 4) terms.add(word.slice(0, -1));
    }
  };

  for (const area of Array.isArray(pack?.areas) ? pack.areas : []) add(area?.label);
  for (const keywords of Object.values(REASON_KEYWORDS)) {
    for (const word of keywords) terms.add(word);
  }
  return [...terms];
}

/* ── Reading a draft's prose ───────────────────────────────────────────────── */

const GAIN_WORDS = /\b(?:improve[sd]?|improvements?|gains?|better|greater|exceeds?|superior|boosts?|increases?|enhances?|more|advantages?|benefits?)\b/i;
const CHANGE_WORDS = /\b(?:changes?|changed|differs?|different|instead of|rather than|replaces?|adds?|upgrad(?:e|es|ed))\b/i;
const SAME_WORDS = /\b(?:identical|unchanged|shared|shares?|matching)\b/i;
const RESULT_WORDS = /\b(?:achieves?|reaches?|delivers?|scores?|records?|measured|shows?|performs?|remains?|states?)\b/i;
const RECOMMEND_WORDS = /\b(?:recommend\w*|we would choose|best choice|the better option|stronger option|stronger recommendation)\b/i;

/** What a sentence asserts, or null when it asserts nothing. */
export function assertionKind(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  if (GAIN_WORDS.test(text)) return 'gain';
  if (CHANGE_WORDS.test(text)) return 'change';
  if (SAME_WORDS.test(text)) return 'same';
  if (RESULT_WORDS.test(text)) return 'result';
  return null;
}

/** Whether a sentence offers a recommendation. */
export function isRecommendation(text) {
  return RECOMMEND_WORDS.test(String(text || ''));
}

/* ── Scoped seat-group claims ──────────────────────────────────────────────── */

/**
 * The client adjectives a scoped claim is worded with, and the Performance Level
 * each one has to be supported by. The same mapping the pack mints its scoped
 * claims with, read here so a draft's own wording can be held to it.
 */
export const SCOPE_ADJECTIVE_LEVEL = Object.freeze({ Excellent: 'L4', Great: 'L3', Good: 'L2' });

/** The seating scope a sentence names, or null when it names none. */
export function seatScopeInText(text) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  if (/\b(?:primary|principal|main)\s+(?:seats?|listening\s+positions?|positions?)\b/i.test(sentence)) return 'primary';
  if (/\bsecondary\s+(?:seats?|listening\s+positions?|positions?)\b/i.test(sentence)) return 'secondary';
  if (/\b(?:all|every|each)\s+(?:of\s+the\s+)?seats?\b/i.test(sentence)) return 'all';
  if (/\bthe\s+seating\b|\bthe\s+seats\b|\bthe\s+room\b|\bthe\s+whole\s+room\b/i.test(sentence)) return 'all';
  return null;
}

/** The client adjective a sentence uses, or null. */
export function scopeAdjectiveInText(text) {
  const match = /\b(Excellent|Great|Good)\b/i.exec(String(text || ''));
  if (!match) return null;
  return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
}

/** Every Performance Level a claim states: its own scoped level, or the levels behind it. */
export function claimLevels(claim) {
  const levels = new Set();
  if (/^L[1-4]$/.test(String(claim?.level ?? ''))) levels.add(String(claim.level));
  for (const level of Array.isArray(claim?.levels) ? claim.levels : []) {
    if (/^L[1-4]$/.test(String(level))) levels.add(String(level));
  }
  return levels;
}

/** Whether a claim states a result for one seating group rather than for every seat. */
export function isNarrowScopeClaim(claim) {
  return claim?.scope === 'primary' || claim?.scope === 'secondary';
}

/**
 * Whether the claim kinds a section cites can support what the sentence asserts.
 * A gain needs a claim that allows a gain; a change needs a claim that records a
 * change; a shared statement needs a shared result; a stated result needs any
 * claim at all — but it does need one.
 */
export function kindSatisfiesAssertion(kind, claimKinds) {
  if (!kind) return true;
  const kinds = new Set(Array.isArray(claimKinds) ? claimKinds : []);
  if (kind === 'gain') return kinds.has(CLAIM_KIND.MATERIAL_GAIN) || kinds.has(CLAIM_KIND.RECOMMENDATION);
  if (kind === 'change') return kinds.has(CLAIM_KIND.FACTUAL_CHANGE) || kinds.has(CLAIM_KIND.MATERIAL_GAIN);
  if (kind === 'same') return kinds.has(CLAIM_KIND.SHARED_RESULT) || kinds.has(CLAIM_KIND.CREDIBILITY);
  return kinds.size > 0;
}

/** A section's prose, as the sentences the rules are applied to. */
export function sentenceParts(text) {
  return String(text || '')
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Every parameter number a string names ("P12" -> 12). */
export function parameterIds(text) {
  const found = [];
  const pattern = /\bP(\d{1,2})\b/g;
  let match = pattern.exec(String(text || ''));
  while (match) {
    const id = Number(match[1]);
    if (id >= 1 && id <= 23) found.push(id);
    match = pattern.exec(text);
  }
  return found;
}

/**
 * The text with the option names taken out. An option is named by its own saved
 * report name — "Level 1", "Level 4" — and that name is an option's name, not a
 * parameter result, so it is never read as a Performance Level claim.
 */
export function stripOptionNames(text, optionNames) {
  let out = String(text || '');
  for (const name of optionNames || []) {
    if (!name) continue;
    out = out.split(name).join(' ');
  }
  return out;
}

/** The prose word count of a section. */
export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}