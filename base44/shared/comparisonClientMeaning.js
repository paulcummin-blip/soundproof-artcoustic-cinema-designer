/**
 * comparisonClientMeaning.js (shared)
 * -----------------------------------
 * The client meaning attached to one calculated comparison row: what that area
 * gives the room, in the client's own words.
 *
 * Deterministic and evidence-scoped. It is never written by AI, and it never
 * invents a benefit: the line is chosen from the row's own values, so a result
 * the evidence states at RP22 Level 1 or Level 2 is described honestly instead
 * of being sold as a strength.
 *
 * The wording is benefit-led by design. A comparison asks the client to choose,
 * so every line answers "what does this give me?", and a result both options
 * share is stated once — in the area's own words — rather than repeated down
 * the table as "no change".
 *
 * Pure: no React, no side effects, no runtime APIs.
 */

/** A row whose values state a Level 1 or Level 2 result is not a strength. */
const LOW_GRADE = /\bL[12]\b/i;

/** The benefit-led line for each comparison area. */
const GAIN = Object.freeze({
  p12: 'More front-stage headroom. Dialogue, score and screen effects have more room to expand before the system sounds strained.',
  p13: 'More capability around and above the seating: effects in the surround and height layers keep their presence during demanding scenes.',
  p14: 'More bass authority and physical impact, supporting the scale of film soundtracks.',
  p16: 'Tonal consistency across the screen channels, so voices and effects stay consistent from left to right.',
  p17: 'Tonal consistency around and above the seats as effects move through the room.',
  p18: 'Bass depth: how far down the system reaches for the lowest film effects.',
  p19: 'Bass balance at the reference seat, which is the response the calibration is measured against.',
  p20: 'Consistent bass from seat to seat, so the low-frequency balance holds more evenly across the listening positions.',
  room: 'The room these designs are built around, on its own stated dimensions.',
  p2: 'The physical sound positions the system is built with, around and above the seats.',
  p4: 'How evenly the screen channels hold their level across the seating area.',
  p5: 'How evenly the listener-level speakers are spaced, which is what lets movement travel through the room.',
  p7: 'How well the front wide positions bridge the screen and the side speakers.',
  p9: 'How evenly the overhead speakers are spaced above the seats.',
  p10: 'How closely the overhead channels are matched in level.',
  screen_size: 'The screen scale the seating plan and viewing distance were designed around.',
  rp23_viewing: 'How comfortably the screen scale reads from each seating row.',
  system_layout: 'The sound positions the system places around and above the seats.',
  speakers: 'The loudspeakers each position is delivered with.',
  amplification: 'The power behind the speakers.',
  seating: 'The seats this design was assessed across.',
  acoustic_treatment: 'The acoustic treatment included in the room.',
  lcr: 'The screen speakers that carry dialogue, music and screen effects.',
  surrounds: 'The speakers that carry effects around the seating area.',
  overheads: 'The speakers that carry the height layer above the seats.',
  subwoofers: 'The subwoofers that carry the low-frequency content.',
});

/** The honest line for an area whose stated result is Level 1 or Level 2. */
const MODEST = Object.freeze({
  p12: 'Front-stage headroom is adequate for this room rather than generous, so the screen channels have less spare capacity at the highest playback levels.',
  p13: 'The surround and height layers have usable headroom, with less reserve than the screen stage.',
  p14: 'Low-frequency output supports the room, with less spare capacity than the main channels.',
  p16: 'The screen channels keep a broadly consistent tonal character, with some variation across the screen.',
  p17: 'Surround and overhead tone stays reasonably consistent, with some variation as effects move around the room.',
  p18: 'Bass extension is useful for film effects without reaching the deepest content.',
  p19: 'Bass response is set at the reference seating position, with the variation the response shows there.',
  p20: 'Bass level varies between seats as the room and the subwoofer positions allow.',
  p2: 'The channel count follows the format the room is designed to, built from the positions this room allows.',
  p4: 'Screen level consistency is set by the room and the screen wall, so the front stage holds together without being perfectly even seat to seat.',
  p5: 'Spacing between the listener-level speakers follows the practical speaker positions and the seat geometry.',
  p9: 'Overhead spacing follows the ceiling height and the seating layout, so sound above the seats is even rather than ideal.',
  p10: 'The overhead channels are kept close in level as the ceiling layout allows.',
});

/**
 * What a shared result means, in the area's own words. The client must not read
 * a shared result as a claimed gain, so it is stated as the shared thing it is —
 * never as a bare "same" or "no change" line repeated for every area.
 */
const SHARED = Object.freeze({
  p12: 'Both options are assessed at the same front-stage headroom, so the front stage is not where the choice lies.',
  p13: 'Both options are assessed at the same capability around and above the seating.',
  p14: 'Both options are assessed at the same low-frequency output capability.',
  p18: 'Both options reach the same low-frequency extension.',
  p19: 'Both options sit the same distance from the bass target at the reference seat.',
  p20: 'Seat-to-seat bass consistency is the same in both options.',
  room: 'Both options are the same room, on the same stated dimensions.',
  p2: 'Both options place the same sound positions around and above the seats.',
  screen_size: 'Same screen scale in both options.',
  seating: 'Same seating in both options.',
  system_layout: 'Same layout in both options.',
  acoustic_treatment: 'Same acoustic treatment in both options.',
});

/** The fallback for a row with no mapped area: plain, never cautious filler. */
const GENERAL_GAIN = 'Part of how this option performs as a whole in the room.';

/**
 * @param {{ key?: string, values?: string[], identical?: boolean }} row
 * @returns {string}
 */
export default function comparisonClientMeaning(row) {
  const key = String(row?.key || '').trim();
  const stated = (Array.isArray(row?.values) ? row.values : []).map((value) => String(value)).join(' ');
  const gain = GAIN[key] || GENERAL_GAIN;

  // A shared result says what both options keep, once, in the area's own words.
  if (row?.identical === true) return SHARED[key] || gain;

  // A difference the evidence states at Level 1 or Level 2 is described as the
  // real capability it is, with what limits it. It is never sold as a strength.
  if (LOW_GRADE.test(stated)) return MODEST[key] || gain;

  return gain;
}