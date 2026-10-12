/**
 * writerVerificationDisclaimerRules.js (shared)
 * --------------------------------------------
 * THE verification-disclaimer rule: the wording a proposal never carries.
 *
 * The proposal presents the recommended design, its engineering assessment and
 * its expected performance. It states a calculated capability confidently, in
 * the same sentence as the capability, and it does NOT make that capability wait
 * for a future process: no sentence appends a verification disclaimer ("subject
 * to confirmation during calibration"), and no sentence asks the client to hold
 * a design prediction back because an eventual measurement has not happened yet.
 *
 * LANGUAGE, NOT ACCURACY. Internal accuracy is untouched by these rules: a
 * predicted result is still never described as a measured one, a reliable result
 * is still never widened to another scope, and every figure, level and product
 * still comes from the frozen evidence. Calibration or commissioning is still
 * written where the client's brief raises it or where it is an important
 * practical recommendation: a plain statement of fact about the design passes
 * these rules, and a conditional or confirming construction does not.
 *
 * Each rule id is a label for the audit and never the phrase itself.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

export const VERIFICATION_DISCLAIMER_RULES = Object.freeze([
  {
    rule: 'conditional_on_future_confirmation',
    // "subject to confirmation during calibration", "pending in-room measurement",
    // "contingent on commissioning"
    pattern: /\b(?:subject\s+to|pending|contingent\s+(?:up)?on|conditional\s+(?:up)?on)\b[^.;!?]{0,60}?\b(?:calibrat\w*|commission\w*|measur\w*|in-?room|on-?site|installation|install\w*|verif\w*|confirm\w*|validat\w*)\b/i,
  },
  {
    rule: 'confirmation_after_installation',
    // "final performance is confirmed by in-room calibration", "to be verified
    // once the system is installed", "following installation the result is measured"
    pattern: /\b(?:to\s+be|will\s+be|would\s+be|shall\s+be|is|are|can\s+be|must\s+be)\s+(?:finally\s+|fully\s+|then\s+)?(?:confirmed|verified|validated|proven|proved|measured|established)\b[^.;!?]{0,60}?\b(?:calibrat\w*|commission\w*|measur\w*|in-?room|on-?site|installation|install\w*)\b|\b(?:after|once|following|upon)\s+(?:the\s+)?(?:installation|commissioning|calibration|system\s+installation)\b[^.;!?]{0,60}?\b(?:confirm\w*|verif\w*|validat\w*|prove\w*|measur\w*|establish\w*)\b/i,
  },
  {
    rule: 'prediction_versus_measurement',
    // "actual results may differ from the model", "final in-room performance is
    // confirmed by measurement", "the difference between the prediction and the
    // measurement"
    pattern: /\b(?:may|might|could|can|will)\s+(?:differ|vary)\b[^.;!?]{0,60}?\b(?:measure\w*|calibrat\w*|in-?room|installation|once\s+installed|on\s+site|model\w*|prediction\w*)\b|\b(?:final|actual|true|real|real-world|as-built)\s+(?:in-?room\s+)?(?:performance|results?|response|behaviour|behavior|output)\b[^.;!?]{0,60}?\b(?:differ\w*|confirm\w*|verif\w*|measur\w*|prove\w*|only\s+known)\b|\bdiffer(?:s|ence|ences)?\s+between\s+(?:the\s+)?(?:prediction|predicted|model|modelled|modeled)\w*\s+and\s+(?:the\s+)?(?:measurement|measured|actual|real)\w*\b/i,
  },
  {
    rule: 'unverified_result',
    // "the result cannot be confirmed until the room is measured", "the predicted
    // outcome is not verified without commissioning"
    pattern: /\b(?:cannot|can\s+not|is\s+not|isn't|are\s+not|aren't|not)\s+(?:be\s+)?(?:confirmed|verified|guaranteed|proven|validated|established)\b[^.;!?]{0,60}?\b(?:until|before|without)\b[^.;!?]{0,50}?\b(?:measur\w*|calibrat\w*|commission\w*|in-?room|installation|installed|site)\b/i,
  },
]);

/** The rule ids behind the verification disclaimer, for an audit to assert against. */
export const VERIFICATION_DISCLAIMER_RULE_IDS = Object.freeze(VERIFICATION_DISCLAIMER_RULES.map((entry) => entry.rule));

/**
 * The verification disclaimer a clause carries, or null. The first rule that
 * matches is the one reported, so one clause raises one reason.
 *
 * @param {string} text
 * @returns {{ rule: string, at: number }|null}
 */
export function verificationDisclaimer(text) {
  const clause = String(text || '');
  if (clause.length === 0) return null;
  for (const entry of VERIFICATION_DISCLAIMER_RULES) {
    const match = entry.pattern.exec(clause);
    if (match) return { rule: entry.rule, at: match.index };
  }
  return null;
}

export default verificationDisclaimer;