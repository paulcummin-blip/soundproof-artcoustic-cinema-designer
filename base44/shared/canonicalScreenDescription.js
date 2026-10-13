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
 * floor — is kept exactly as written, so the description loses no geometry.
 *
 * A projection screen is stated by its VIEWABLE WIDTH, the size the designer set
 * and the size every report prints. Its diagonal is recorded by the canonical
 * geometry for reference and is never stated as the screen's size. A stored
 * sentence that states a different width is therefore resolved from the geometry
 * in the same way, keeping the sentence's own noun and every other clause. A
 * display whose canonical geometry states no size is returned unchanged.
 *
 * canonicalStatedSizeInches() is the one place the size a narrative may state is
 * resolved, so every narrative surface is handed the canonical number and never
 * a historical sentence's own figure.
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
/**
 * The size a narrative surface STATES for the display, resolved from the
 * canonical geometry alone.
 *
 * A television is stated by its nominal diagonal, a projection screen by its
 * viewable width — the size the designer set and the size the reports print. The
 * diagonal is a separate fact (see readDisplayIdentity) and is never returned as
 * the stated size, so no narrative is ever handed two competing numbers for one
 * display.
 *
 * @returns {number|null} inches, or null when the geometry states no size.
 */
export function canonicalStatedSizeInches(screen) {
  const identity = readDisplayIdentity(screen);
  if (identity.isTv) {
    const diagonal = Number(identity.diagonalInches);
    return Number.isFinite(diagonal) && diagonal > 0 ? diagonal : null;
  }
  const widthCm = Number(screen?.viewable_width_cm);
  return Number.isFinite(widthCm) && widthCm > 0 ? Math.round(widthCm / 2.54) : null;
}

/**
 * The canonical phrase for a projection screen: its VIEWABLE WIDTH and aspect
 * ratio, and those alone — `170" wide 2.35:1 projection screen`. The diagonal is
 * never stated for a projection screen.
 */
function projectionPhrase(screen, widthInches) {
  const aspect = asText(screen?.format) || asText(screen?.aspect_ratio);
  const width = `${Math.round(widthInches)}"`;
  return aspect
    ? `${width} wide ${aspect} projection screen`
    : `${width} wide projection screen`;
}

export function canonicalScreenDescription(screen) {
  const stored = asText(screen?.interpretation);
  if (!stored) return stored;

  const identity = readDisplayIdentity(screen);
  const canonical = canonicalStatedSizeInches(screen);
  if (!Number.isFinite(canonical)) return stored;

  const inches = statedInches(stored);
  // A sentence that states no size states no contradiction: it is left alone.
  if (inches === null) return stored;
  if (Math.round(inches) === Math.round(canonical)) return stored;

  const detail = detailAfterSize(stored);
  const phrase = identity.isTv ? identity.tvPhrase : projectionPhrase(screen, canonical);
  if (!phrase) return stored;
  return detail ? `${phrase}, ${detail}` : phrase;
}

export default canonicalScreenDescription;