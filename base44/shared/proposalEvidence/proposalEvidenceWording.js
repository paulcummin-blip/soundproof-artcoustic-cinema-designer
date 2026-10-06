/**
 * proposalEvidenceWording.js (shared)
 * ------------------------------------
 * The one authority for the bass wording a frozen proposal evidence pack carries.
 *
 * A comparison can honestly show one option with more low-frequency output and a
 * bigger subwoofer package. What it cannot show is seat-to-seat bass consistency
 * being solved: in the Marquee comparison both designs sit at RP22 Level 1 for
 * it (±15.6 dB and ±13.2 dB), so P20 supports no consistency claim at all.
 *
 * Report prose still reaches the pack through the subwoofer facts — a strategy
 * summary is written for one design, not for the comparison — so the pack
 * removes any prohibited claim from the text it carries, and records exactly
 * what it removed and where.
 *
 * Two rules, both deterministic:
 *
 *  1. WORDING — a prohibited phrase is removed from any string a fact carries.
 *     Only the phrase is removed, so the count and the models in the same line
 *     survive; text that is nothing but the claim becomes null. The audit
 *     records the path and the rule id, never the sentence: the pack must not
 *     carry the phrase anywhere, its own audit least of all.
 *
 *  2. CLAIMS — where P20 shows no material difference, a consistency claim is
 *     blocked and bass may be described only as output authority and physical
 *     capability. Where P20 does support one, the consistency claim is allowed,
 *     from the P20 result itself.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { BLOCK_REASON } from './evidencePackSchema.js';

/**
 * The prohibited bass claims, each with the rule id the audit records. A rule id
 * is a label for the audit, never the phrase itself.
 */
const PROHIBITED_BASS_CLAIMS = Object.freeze([
  {
    rule: 'maximum_consistency',
    pattern: /(maximum|full|complete|perfect|total)\s+seat[- ]to[- ]seat\s+bass\s+consisten\w*/i,
  },
  {
    rule: 'solved_with_object',
    pattern: /solv\w*\s+(the\s+)?bass\s+consisten\w*/i,
  },
  {
    rule: 'solved_with_subject',
    pattern: /bass\s+consisten\w*\s+is\s+solved\w*/i,
  },
  {
    rule: 'materially_even',
    pattern: /(materially\s+even|perfectly\s+even)\s+bass\s+across\s+(all\s+)?seats?/i,
  },
  {
    rule: 'uniform_across_seats',
    pattern: /uniform\s+bass\s+across\s+(all\s+)?seats?/i,
  },
  {
    rule: 'improved_consistency',
    pattern: /(improved?|greater|better)\s+bass\s+consisten\w*/i,
  },
  {
    rule: 'identical_at_every_seat',
    pattern: /(identical|the\s+same)\s+bass\s+(at|in|across)\s+(every|all)\s+seats?/i,
  },
]);

/** The rule ids behind the prohibited claims, for an audit to assert against. */
export const PROHIBITED_BASS_RULES = Object.freeze(PROHIBITED_BASS_CLAIMS.map((rule) => rule.rule));

/** The bass wording the pack may carry: output authority, never consistency. */
export const BASS_OUTPUT_AUTHORITY_SCOPE = Object.freeze([
  'bass_output_authority',
  'physical_capability',
  'subwoofer_specification',
]);

/** Whether a string makes one of the prohibited bass claims. */
export function isBassConsistencyClaim(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return PROHIBITED_BASS_CLAIMS.some((rule) => rule.pattern.test(text));
}

/**
 * The boundaries a report line is read in: a separator between the parts of a
 * line ("X · Y"), or the end of a sentence. A line is therefore measured in
 * clauses, and a clause is kept or dropped whole — a claim is never cut out of
 * the middle of a sentence, which would leave maimed prose behind.
 */
const CLAUSE_BOUNDARY = /(\s*[·•|;]\s*|(?<=[.!?])\s+)/;

/** Tidy what a drop left behind. Only ever applied to text a clause left. */
function tidy(remaining) {
  return String(remaining)
    .replace(/\s+/g, ' ')
    .replace(/^[\s·•|,;:\-–—]+/, '')
    .replace(/[\s·•|,;:\-–—]+$/, '')
    .trim();
}

/**
 * Remove the clauses that make a prohibited bass claim from one string. The rest
 * of the line is kept exactly as the report wrote it: the count and the models in
 * "4 × SUB4-12 · maximum seat-to-seat bass consistency" survive, and only the
 * claim goes.
 *
 * @param {string} text
 * @returns {{ text: string|null, rules: string[] }} the cleaned text (null when
 *   nothing but claims was left) and the rule ids that matched
 */
export function stripBassConsistencyWording(text) {
  if (typeof text !== 'string' || text.length === 0) return { text, rules: [] };
  const rules = [];
  const kept = String(text).split(CLAUSE_BOUNDARY).filter((clause, index) => {
    if (index % 2 === 1) return false; // a boundary between clauses
    if (!isBassConsistencyClaim(clause)) return true;
    for (const rule of PROHIBITED_BASS_CLAIMS) if (rule.pattern.test(clause)) rules.push(rule.rule);
    return false;
  });
  if (rules.length === 0) return { text, rules: [] };
  const cleaned = tidy(kept.join(' '));
  return { text: cleaned.length > 0 ? cleaned : null, rules: [...new Set(rules)] };
}

/**
 * Remove every prohibited bass claim from a tree of facts.
 *
 * @param {*} value the tree (a new tree is returned; the input is never mutated)
 * @param {string[]} path the trail the audit reports for this subtree
 * @returns {{ value: *, removed: Array<{ path: string, rule: string }> }}
 */
export function stripBassWordingDeep(value, path = []) {
  const removed = [];
  const walk = (node, trail) => {
    if (typeof node === 'string') {
      const { text, rules } = stripBassConsistencyWording(node);
      for (const rule of rules) removed.push({ path: trail.join('.'), rule });
      return text;
    }
    if (Array.isArray(node)) return node.map((item, index) => walk(item, [...trail, String(index)]));
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(node)) out[key] = walk(child, [...trail, key]);
      return out;
    }
    return node;
  };
  return { value: walk(value, path), removed };
}

/**
 * The pack's own gate. Every string the pack carries has already been cleaned,
 * and this proves it: a pack that still carries a prohibited claim is not
 * generated at all, rather than being handed to a writer.
 */
export function assertBassWordingSafe(pack) {
  const serialised = JSON.stringify(pack ?? null);
  const found = PROHIBITED_BASS_CLAIMS.find((rule) => rule.pattern.test(serialised));
  if (found) {
    throw new Error(
      `The proposal evidence pack is not safe to write from: it carries a prohibited bass claim (${found.rule}). `
      + 'The pack has not been generated.',
    );
  }
  return pack;
}

/** "L1" -> "Level 1"; null when no level is stated. */
export function levelLabel(level) {
  const match = /^L([1-4])$/i.exec(String(level ?? '').trim());
  return match ? `Level ${match[1]}` : null;
}

/**
 * The seat-to-seat bass consistency note behind P20, in the evidence's own terms.
 *
 * @param {{ levels?: string[], outputAuthorityOptionName?: string|null }} input
 * @returns {string}
 */
export function buildBassConsistencyNote({ levels = [], outputAuthorityOptionName = null } = {}) {
  const stated = (Array.isArray(levels) ? levels : []).map(levelLabel).filter(Boolean);
  const sameLevel = stated.length > 0 && stated.every((level) => level === stated[0]);
  const head = sameLevel
    ? `Both designs remain ${stated[0]} for seat-to-seat bass consistency.`
    : 'Neither design is assessed as materially more consistent from seat to seat.';
  const tail = outputAuthorityOptionName
    ? `${outputAuthorityOptionName} improves bass output authority, not full-seat uniformity.`
    : 'Neither design changes bass output authority.';
  return `${head} ${tail}`;
}

/**
 * The block that governs every bass consistency claim. Worded so that the rule
 * itself carries no prohibited phrase: this text ships inside the pack, and the
 * pack's own gate reads it.
 */
export function buildBassConsistencyBlock() {
  return {
    reason: BLOCK_REASON.NO_SOLVED_BASS_CONSISTENCY,
    prohibited: 'Do not claim that seat-to-seat bass consistency has been solved or improved, '
      + 'and do not describe the bass as uniform, identical or materially even across the seats: '
      + 'the reports show no material difference here. '
      + 'Bass may be described only as output authority, physical capability and the subwoofer specification.',
    scope: 'seat_to_seat_consistency',
  };
}