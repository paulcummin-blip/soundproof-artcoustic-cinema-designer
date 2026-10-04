/**
 * aboutSoundProofCopy
 * -------------------
 * THE copy authority for the closing About Sound Proof page of both reports.
 *
 * Priority, exactly as the reports require it:
 *   1  the published / admin copy, when it says something
 *   2  the bundled built-in copy, which always exists
 *
 * The fallback ships inside the app bundle, so the printed copy is available
 * SYNCHRONOUSLY: a report export never waits for a read, never prints a waiting
 * state, and never leaves the page out. The page is mandatory, so this function
 * cannot return nothing.
 *
 * Pure module: no React, no network, no async.
 */

import { DEFAULT_ABOUT_SOUND_PROOF_HTML } from "./defaultContent";

/** True when a copy string actually says something. */
export function hasAboutSoundProofCopy(html) {
  return typeof html === "string" && html.trim().length > 0;
}

/**
 * The About copy to render.
 *
 * @param {string|null|undefined} publishedHtml copy read from the canonical
 *   PublicationContent record, or null while it is not yet available.
 * @returns {string} published copy, or the bundled fallback — never empty.
 */
export function resolveAboutSoundProofHtml(publishedHtml) {
  return hasAboutSoundProofCopy(publishedHtml)
    ? publishedHtml
    : DEFAULT_ABOUT_SOUND_PROOF_HTML;
}