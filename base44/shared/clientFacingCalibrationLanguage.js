/**
 * clientFacingCalibrationLanguage.js (shared)
 * -------------------------------------------
 * THE CLIENT-FACING CALIBRATION LANGUAGE.
 *
 * Sound Proof is primarily a professional cinema design and sales tool. The
 * proposal presents the recommended design, its engineering assessment and its
 * expected performance, and it answers three questions: what we have designed,
 * why we recommend it, and what the client can expect.
 *
 * What it never does is make a stated capability wait for a future process. The
 * calculation and its validation already happen behind the scenes, so the copy
 * presents a calculated capability confidently and accurately, in the same
 * sentence as the capability, and does not append a verification disclaimer to
 * it. Future calibration, commissioning, measurement verification and the gap
 * between a design prediction and an eventual measurement are not subjects of
 * the document, and a capability is never repeatedly qualified.
 *
 * This authority changes how the engineering is communicated and nothing else.
 * Internal accuracy is untouched: every figure, Performance Level, product and
 * scope still comes from the frozen evidence, reliable and assumed evidence stay
 * apart, and a predicted result is never described as a measured one. The
 * engineering calculations and the internal validator are not affected by it.
 *
 * Calibration or commissioning is still written where the client's brief raises
 * it, or where it is an important practical design recommendation - stated once,
 * as a fact of the design.
 *
 * Injected into the proposal voice only (the shared proposal authority and the
 * proposal sales voice). The System Design reports and the internal client
 * summary are not given it: their scope and assumption statements are part of
 * the engineering record they carry.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Safe to import from any
 * backend function.
 */

export const CALIBRATION_LANGUAGE_VERSION = 1;

/** The only two cases in which a proposal mentions calibration or commissioning. */
export const CALIBRATION_MENTION_ALLOWED_WHEN = Object.freeze([
  'the client\'s brief raises it',
  'it is an important practical design recommendation',
]);

/**
 * The language the proposal voice is given. Each entry is one paragraph of the
 * prompt, so it reads as guidance rather than as a list of words.
 */
export const CLIENT_FACING_CALIBRATION_LANGUAGE = Object.freeze([
  '=== CLIENT-FACING CALIBRATION LANGUAGE ===',
  '',
  'The proposal presents the recommended design, its engineering assessment and its expected performance. It answers three questions: what we have designed, why we recommend it, and what the client can expect.',
  '',
  'Present calculated capability confidently and accurately, in the same sentence as the capability itself. The assessment behind it has already been made, so the capability is stated as this design\'s own, for example: “The specified loudspeaker system provides the predicted output capability required for demanding film soundtracks.”',
  '',
  'Prediction terminology stays exactly as it is: predicted, expected, calculated, designed, assessed. State what the design provides, and stop there. Say it once, in the scope the evidence states it for.',
  '',
  'NEVER APPEND A VERIFICATION DISCLAIMER TO A CAPABILITY.',
  'Never write “subject to confirmation during calibration”, “to be confirmed once the system is installed”, “pending in-room measurement”, “final performance will be verified on site”, “actual results may differ from the model”, or any other sentence that makes a stated capability wait for a future measurement.',
  'Never build a section, an opening, a closing remark or a repeated qualification around future calibration, commissioning, measurement verification, proving a predicted result after installation, or the difference between a prediction and an eventual measurement. One capability statement that keeps reassuring the client about a future process reads as though the design were unproven.',
  'Never describe a predicted result as a measured result, and never add a caution the evidence does not require.',
  '',
  'CALIBRATION AND COMMISSIONING: ONLY WHEN THE CLIENT ASKED, OR AS A PRACTICAL RECOMMENDATION.',
  'Two cases, and only two: the client\'s brief raises it, or it is an important practical design recommendation, such as a specific action worth taking (a stated playback level to set, a defined listening position to verify, an alignment step to schedule). Then state it once, as a fact of the design rather than as a hedge on a capability.',
  '',
  'Scope is written inside the claim (across the primary seats, at the reference position, at the assessed listening level) and never as a disclaimer placed after it.',
  '',
  'THE ENGINEERING IS UNCHANGED BY THIS. Every figure, level, product and scope still comes from the frozen evidence, reliable and assumed evidence stay apart, and a predicted result is never presented as a measured one. RP22 design context is there to strengthen the explanation of the recommended system, never to introduce a verification disclaimer.',
]);

export default CLIENT_FACING_CALIBRATION_LANGUAGE;