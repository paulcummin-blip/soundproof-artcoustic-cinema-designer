/**
 * writerNaturalWritingRules.js
 * ---------------------------
 * The deterministic half of the Sound Proof Natural Writing Standard.
 *
 * Four readings, each of which refuses wording and none of which rewrites it:
 *
 *   - the punctuation rule: an em dash is never written in client-facing copy, so
 *     the section text is refused and the sentence is rewritten by the writer. The
 *     copy is read exactly as it was written, so a figure, a product identifier and
 *     an evidence reference are never touched to satisfy the rule;
 *   - a stock connective at the head of a sentence;
 *   - a generic claim phrase with no project content;
 *   - the same mechanical paragraph opener repeated across the document.
 *
 * The vocabulary is read from writerNaturalWritingStandard.js, so the phrases the
 * model is told to avoid and the phrases the validator refuses are the same list.
 *
 * Grounding, scope, levels, products, the evidence pack and the RP22 assessment are
 * not read here: this module decides only how the copy reads.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */
import { WRITER_REJECTION, violation } from './writerContractSchema.js';
import { attributeViolation } from './writerViolationAudit.js';
import {
  EM_DASH_CHARACTER,
  GENERIC_CLAIM_PHRASES,
  MECHANICAL_OPENERS,
  MECHANICAL_OPENER_THRESHOLD,
  STOCK_CONNECTIVES,
} from './writerNaturalWritingStandard.js';

const normalise = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CONNECTIVE_PATTERN = new RegExp(
  `(?:^|[.!?;:]\\s+)(${STOCK_CONNECTIVES.map(escapeRegExp).join('|')})\\b`,
  'i',
);

/** Where the first em dash sits in client-facing copy, or null. */
export function emDashAt(text) {
  const at = String(text || '').indexOf(EM_DASH_CHARACTER);
  return at === -1 ? null : at;
}

/** A stock connective at the head of a sentence, or null. */
export function stockConnective(text) {
  const match = normalise(text).match(CONNECTIVE_PATTERN);
  return match ? { phrase: match[1] } : null;
}

/** A generic claim phrase the standard refuses, or null. */
export function genericClaimPhrase(text) {
  const flat = normalise(text).toLowerCase();
  if (!flat) return null;
  for (const phrase of GENERIC_CLAIM_PHRASES) {
    if (flat.includes(phrase)) return { phrase };
  }
  return null;
}

/** The paragraphs of a section body: a blank line separates them. */
function paragraphsOf(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** The first words of a paragraph, with any markup ignored. */
function openingWordsOf(paragraph) {
  return paragraph
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * One mechanical opener family opened again and again across the document.
 *
 * Reported once per family, on the paragraph that breaches the threshold, with the
 * paragraph as its clause. Two paragraphs may legitimately open the same way; three
 * is the register the standard refuses.
 *
 * @param {Array<{section: string, text: string}>} sections — the draft's sections
 * @returns {Array<Object>} attributed violations
 */
export function repetitiveParagraphOpeners(sections = []) {
  const counts = new Map();
  const found = [];
  for (const entry of sections) {
    if (!entry || typeof entry.text !== 'string' || entry.text.trim().length === 0) continue;
    for (const paragraph of paragraphsOf(entry.text)) {
      const words = openingWordsOf(paragraph);
      const family = MECHANICAL_OPENERS.find((opener) => {
        const openerWords = opener.split(' ');
        return words.slice(0, openerWords.length).join(' ') === opener;
      });
      if (!family) continue;
      const count = (counts.get(family) || 0) + 1;
      counts.set(family, count);
      if (count === MECHANICAL_OPENER_THRESHOLD) {
        found.push(attributeViolation(
          violation(WRITER_REJECTION.REPETITIVE_PARAGRAPH_OPENER, {
            section: entry.section,
            detail: `repeated_paragraph_opener:${family.split(' ').join('_')}`,
          }),
          { text: entry.text, sentence: paragraph, ruleId: `natural_writing:${family.split(' ').join('_')}` },
        ));
      }
    }
  }
  return found;
}

export default repetitiveParagraphOpeners;