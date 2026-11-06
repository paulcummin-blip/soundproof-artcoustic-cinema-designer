/**
 * subwooferAmplifierAuthority.js
 * ------------------------------
 * THE ONE rule that decides how many CPH-1000D subwoofer amplifiers a design
 * requires. The pricing engine (the System summary's priced breakdown) and the
 * Speaker Design equipment schedule BOTH call this, so the amplifier count the
 * designer is quoted, the one the sidebar states and the one the issued PDF
 * prints can never disagree.
 *
 * The rule is the pricing engine's own: a CPH-1000D is added for each subwoofer
 * the design's own front/rear configuration states — a group counts only when it
 * carries a model and a positive count, exactly as `computeCommercialPriceBreakdown`
 * has always done. No second "one amp per sub" assumption is made anywhere else:
 * the Speaker Design reads this count instead of re-deriving it from its own
 * subwoofer rows, so an edge-case subwoofer representation can never produce a
 * different amplifier number from the priced breakdown.
 *
 * Pure: no React, no SDK, no side effects, so the invariant can be proved on its
 * own and the pricing engine's behaviour is preserved byte-for-byte.
 */

/** The derived subwoofer amplifier product, as the pricing engine states it. */
export const SUBWOOFER_AMPLIFIER_MODEL = 'CPH-1000D';

/** The position label the Speaker Design schedule states for the amplifier row. */
export const SUBWOOFER_AMPLIFIER_POSITION = 'Subwoofer amplifier';

/**
 * The number of CPH-1000D subwoofer amplifiers the pricing engine prices for a
 * design: the sum of the front and rear subwoofer counts, where a group counts
 * only when it carries a model and a positive count.
 *
 * This is the SAME computation `computeCommercialPriceBreakdown` performs
 * inline. Extracting it here gives the Speaker Design schedule a single,
 * importable authority for the amplifier count instead of an independent
 * re-derivation.
 *
 * @param {Object} [input]
 * @param {Object} [input.frontSubsCfg] — the design's front subwoofer configuration
 * @param {Object} [input.rearSubsCfg] — the design's rear subwoofer configuration
 * @returns {number} a non-negative integer (0 when no subwoofers are stated)
 */
export function subwooferAmplifierCount({ frontSubsCfg = null, rearSubsCfg = null } = {}) {
  let count = 0;
  if (frontSubsCfg?.model && Number(frontSubsCfg?.count) > 0) {
    count += Number(frontSubsCfg.count) || 0;
  }
  if (rearSubsCfg?.model && Number(rearSubsCfg?.count) > 0) {
    count += Number(rearSubsCfg.count) || 0;
  }
  return count;
}

export default subwooferAmplifierCount;