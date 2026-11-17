/**
 * steeringBriefValidation.js
 * --------------------------
 * A modest, substantive check that the designer has entered meaningful project
 * context before a new proposal can be generated.
 *
 * It is deliberately NOT a long minimum word count or a category-by-category
 * questionnaire. A few meaningful sentences are enough. The check rejects an
 * empty field, a couple of tokens, and a string of filler words, and it accepts
 * any short brief that carries real project context: how the room will be used,
 * what matters to the client, a design decision, a compromise or a benefit to
 * explain.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'its', 'their', 'them',
  'they', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'can', 'may', 'might', 'must', 'shall', 'about', 'across',
  'every', 'each', 'also', 'than', 'then', 'when', 'what', 'which', 'while', 'out',
  'both', 'some', 'any', 'all', 'use', 'using', 'up', 'so', 'as', 'or', 'but', 'if',
  'it', 'we', 'you', 'your', 'our', 'my', 'me', 'i',
]);

const MIN_LENGTH = 30;
const MIN_TOKENS = 6;
const MIN_DISTINCT = 4;

function tokensOf(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word));
}

/**
 * Whether the brief carries enough project context to guide the proposal.
 *
 * @param {string} text — the designer's steering brief
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateSteeringBrief(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value.length === 0) {
    return {
      valid: false,
      reason: 'Add a few sentences describing how the room will be used and what matters most to the client.',
    };
  }
  if (value.length < MIN_LENGTH) {
    return {
      valid: false,
      reason: 'A little more helps ADI write a project-specific proposal: say what the room is for, what matters to the client, or a key design decision.',
    };
  }
  const tokens = tokensOf(value);
  const distinct = new Set(tokens);
  if (tokens.length < MIN_TOKENS || distinct.size < MIN_DISTINCT) {
    return {
      valid: false,
      reason: 'Add some real project context: how the room will be used, a client priority, or a design decision. A few meaningful sentences are enough.',
    };
  }
  return { valid: true, reason: null };
}

export default validateSteeringBrief;