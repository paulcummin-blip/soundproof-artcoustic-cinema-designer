/**
 * canonicalScreenDescription.js (shared)
 * --------------------------------------
 * The display description a NARRATIVE surface may state.
 *
 * The stored report evidence carries two statements of the same display: the
 * canonical identity — display_type, diagonal_inches and the display_label a
 * report prints ('115" TV') — and a frozen human sentence
 * (report_facts.screen.interpretation) written when the report was generated.
 * A report generated before the display identity was unified wrote that sentence
 * from the viewable width, so it can survive in a frozen snapshot as
 * '100" 16:9, manual dimensions TV on front wall' beside a canonical 115" TV.
 *
 * This module resolves that contradiction AT READ TIME, when narrative input is
 * prepared. It never rewrites the frozen evidence and never touches an issued
 * PDF: the stored snapshot keeps its own sentence, and only the description a
 * writer is handed is resolved.
 *
 * A television is stated by its nominal diagonal alone (never a viewable width,
 * never an aspect ratio), exactly as the canonical display phrase states it and
 * as the client-facing Project Report prints it. Every other fact the stored
 * sentence carries — manual dimensions, the wall, the mount, the height above
 * floor — is kept exactly as written, so the description loses no geometry. A
 * projection screen, and a display with no canonical diagonal, are returned
 * unchanged.
 *
 * Pure: no React, no SDK, no side effects.
 */

import { readDisplayIdentity } from './canonicalDisplayIdentity.js';

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The inches a stored description states, or null when it states none. */
function statedInches(text) {
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*"/);
  return match ? Number(match[1]) : null;
}

/**
 * Everything the stored sentence says AFTER the size it states: the aspect
 * ratio and the display's own noun are part of the size statement and go with
 * it; every remaining clause is a fact and is kept verbatim.
 */
function detailAfterSize(text) {
  const remainder = String(text)
    .replace(/^\s*\d+(?:\.\d+)?\s*"\s*/, '')
    .replace(/^\s*\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?\s*/, '')
    .replace(/^\s*,\s*/, '');
  const clauses = remainder.split(',').map((clause) => clause.trim()).filter(Boolean);
  if (clauses.length === 0) return null;
  // Drop the noun the old sentence used for the display, so the canonical
  // phrase is never doubled ('115" TV, TV on front wall').
  clauses[0] = clauses[0].replace(/\s*\b(?:TV|television|screen)\b\s*/i, ' ').trim();
  const kept = clauses.filter(Boolean);
  return kept.length > 0 ? kept.join(', ') : null;
}

/**
 * The display description for narrative input, resolved against the canonical
 * display identity.
 *
 * @param {Object|null} screen — a screen block carrying the canonical identity
 *   (display_type, diagonal_inches) and the stored interpretation.
 * @returns {string|null} the canonical description, or the stored one unchanged.
 */
export function canonicalScreenDescription(screen) {
  const stored = asText(screen?.interpretation);
  if (!stored) return stored;

  const identity = readDisplayIdentity(screen);
  if (!identity.isTv || !identity.tvPhrase) return stored;

  const inches = statedInches(stored);
  // A sentence that states no size states no contradiction: it is left alone.
  if (inches === null) return stored;
  if (Math.round(inches) === Math.round(Number(identity.diagonalInches))) return stored;

  const detail = detailAfterSize(stored);
  return detail ? `${identity.tvPhrase}, ${detail}` : identity.tvPhrase;
}

export default canonicalScreenDescription;