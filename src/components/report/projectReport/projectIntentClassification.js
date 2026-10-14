/**
 * projectIntentClassification.js
 * -----------------------------
 * THE ONE AUTHORITY for what kind of room a saved design is, so the Project
 * Report's headline, its design-intent paragraph and every other client-facing
 * surface read the same intent from the same rule.
 *
 * THE RULE — a television system is a media lounge, never a dedicated cinema:
 *
 *   A TV-based system defaults to a MEDIA LOUNGE (a relaxed, high-performance
 *   media room). 'Dedicated cinema' is never the default for a television, and
 *   the intent is never derived from a format, a channel count, a subwoofer
 *   count, a performance level or a seating row.
 *
 * DEDICATED-CINEMA EXCEPTIONS — the only two:
 *
 *   1. The room is a projection / screen room built as a cinema. A projector and
 *      a screen are what make a dedicated cinema, so a projection design keeps
 *      its dedicated-cinema language exactly as it always read.
 *   2. The designer or dealer has EXPLICITLY marked the room as a dedicated
 *      cinema — an explicit intent mark recorded on the project, or explicit
 *      dedicated-cinema wording in the designer's own project text.
 *
 * A bare mention of "cinema" or "cinema room" is NOT an explicit mark: a brief
 * that says "cinema room" for a single-row television lounge is still a media
 * lounge, which is why only explicit dedicated-cinema wording is honoured here.
 *
 * Read-only and pure: it reads the display the design was built around and the
 * designer's own stated intent, and nothing else. It recalculates nothing,
 * grades nothing, and holds no copy of its own. No React, no DOM, no side
 * effects.
 */

import { isTvDisplay } from '@/components/models/screen/displayTypeAuthority';

/** The two project intents this authority can return. */
export const PROJECT_INTENT = Object.freeze({
  MEDIA_LOUNGE: 'media_lounge',
  DEDICATED_CINEMA: 'dedicated_cinema',
});

/** WHY the intent came out as it did — the basis the decision rests on. */
export const PROJECT_INTENT_REASON = Object.freeze({
  PROJECTION: 'projection_cinema',
  EXPLICIT: 'explicit_dedicated_cinema',
  TV: 'tv_system',
});

/**
 * The explicit dedicated-cinema wording a designer's own text has to contain
 * before a television design is read as a cinema. Deliberately narrow: a bare
 * "cinema" or "cinema room" is not an explicit mark, so it never flips the intent.
 */
const EXPLICIT_CINEMA_WORDING = /\b(?:dedicated\s+(?:home\s+|screening\s+)?cinema|reference\s+cinema|cinema\s+bunker|dedicated\s+screening\s+room)\b/i;

/** Explicit intent values recorded on the project itself, when a field holds one. */
const EXPLICIT_INTENT_VALUES = new Set(['dedicated_cinema', 'dedicated cinema', 'cinema']);

/** Free-text fields a designer's or dealer's own words may arrive in. */
const DESIGNER_TEXT_FIELDS = ['notes', 'client_brief', 'narrative_brief', 'brief'];

/**
 * Whether the designer or dealer has explicitly marked this project as a
 * dedicated cinema. An explicit intent value counts; so does explicit wording in
 * the project's own text — and only that wording, never a bare "cinema room".
 */
export function hasExplicitDedicatedCinemaIntent(projectDetails) {
  if (!projectDetails || typeof projectDetails !== 'object') return false;
  const mark = String(
    projectDetails.design_intent ?? projectDetails.cinema_intent ?? projectDetails.project_intent ?? '',
  ).trim().toLowerCase();
  if (EXPLICIT_INTENT_VALUES.has(mark)) return true;
  const stated = DESIGNER_TEXT_FIELDS
    .map((field) => projectDetails[field])
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' \n ');
  return EXPLICIT_CINEMA_WORDING.test(stated);
}

/**
 * Classify one saved design's project intent.
 *
 * @param {Object} [input.projectDetails] — the saved project (its display and the designer's own text)
 * @returns {{intent: string, reason: string, isMediaLounge: boolean, isDedicatedCinema: boolean}}
 */
export function classifyProjectIntent({ projectDetails = null } = {}) {
  const tv = isTvDisplay(projectDetails);
  const explicit = tv && hasExplicitDedicatedCinemaIntent(projectDetails);

  const intent = (!tv || explicit) ? PROJECT_INTENT.DEDICATED_CINEMA : PROJECT_INTENT.MEDIA_LOUNGE;
  const reason = !tv
    ? PROJECT_INTENT_REASON.PROJECTION
    : explicit ? PROJECT_INTENT_REASON.EXPLICIT : PROJECT_INTENT_REASON.TV;

  return {
    intent,
    reason,
    isMediaLounge: intent === PROJECT_INTENT.MEDIA_LOUNGE,
    isDedicatedCinema: intent === PROJECT_INTENT.DEDICATED_CINEMA,
  };
}

/**
 * Convenience: is this design a media lounge — a relaxed, high-performance media
 * room — rather than a dedicated cinema?
 */
export function isMediaLounge(projectDetails) {
  return classifyProjectIntent({ projectDetails }).isMediaLounge;
}

export default classifyProjectIntent;