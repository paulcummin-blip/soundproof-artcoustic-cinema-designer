/**
 * parameterResultCopy
 * -------------------
 * Shared copy authority for the Visual Report's RP22 parameter result cards.
 *
 * Every parameter result card shows the same two pieces of copy beneath its
 * level pill:
 *
 *   - the level heading, spoken as a word ("Level 4") — never as a code, and
 *     never repeating the parameter number, because the page has already
 *     identified the parameter and the pill has already shown the level
 *   - the official RP22 parameter description (RP22 Parameter Index wording)
 *     as the card's main explanation
 *
 * One authority means every parameter page reads the same wording, so a card
 * can never invent its own shorthand for the parameter or its level.
 *
 * Presentation only — no grading, thresholds, values or calculations.
 */

import { getOfficialRp22Title } from "@/components/utils/rp22OfficialTitles";

/**
 * Level heading for a result card. "L4" / 4 → "Level 4".
 * FAIL and N/A pass through as themselves; null when there is no level to show.
 *
 * @param {number|string|null} level - 1-4, "L1"-"L4", 0/"FAIL", "N/A"
 * @returns {string|null}
 */
export function parameterResultHeading(level) {
  if (level == null) return null;
  const str = String(level).trim().toUpperCase();
  const match = /^(?:L)?([1-4])$/.exec(str);
  if (match) return `Level ${match[1]}`;
  if (str === "FAIL") return "FAIL";
  if (str === "N/A" || str === "NA") return "N/A";
  return null;
}

/**
 * The official RP22 description for a parameter — the card's main explanation.
 *
 * @param {number} paramId - RP22 parameter number (e.g. 2)
 * @returns {string}
 */
export function parameterResultDescription(paramId) {
  return getOfficialRp22Title(paramId);
}