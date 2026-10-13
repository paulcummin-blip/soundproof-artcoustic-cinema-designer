/**
 * rp22ClientBenefitIntent.js (shared)
 * ------------------------------------
 * THE PRACTICAL DESIGN INTENT BEHIND RP22 P1 TO P21 AND RP23.
 *
 * WHY IT EXISTS. Client-facing writing must explain what a result MEANS for the
 * cinema, not what a parameter measures. To do that, ADI has to hold the practical
 * reason each parameter exists in the first place: what the design consideration
 * does for the listener, and what a published result does and does not establish.
 *
 * This module is that understanding, in one reference. It is the reasoning ADI
 * brings to the writing, and it is deliberately NOT a list to be mentioned:
 *
 *   - it states no figure, level, threshold or grade, and it grades nothing;
 *   - it is not this project's evidence. The frozen evidence decides which of
 *     these benefits is supported in a given design, and a benefit the evidence
 *     does not support is never written;
 *   - it never establishes why a particular designer chose a configuration. A
 *     designer reason exists only where the project records one.
 *
 * CONSUMED BY the shared Sound Proof writing authority
 * (`soundProofWritingAuthority.js`), through the client benefit writing standard.
 * Every string here is read by the writing model, so it is written without an em
 * dash.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The reference generation, so a refinement is always traceable. */
export const CLIENT_BENEFIT_INTENT_VERSION = 1;

/**
 * One entry per parameter: what the consideration does for the listener, and what
 * a published result does and does not establish for the client.
 */
export const RP22_CLIENT_BENEFIT_INTENT = Object.freeze([
  Object.freeze({
    parameter: 'P1',
    measures: 'the distance between the listening area and the room walls',
    matters: 'the clearance around the seating changes how bass behaves across the seats, how the walls send reflections back at the listener, and how naturally the surround speakers wrap sound around the room. Seating pushed up against a boundary sits in the strongest pressure zone in the room, where the room dominates what the client hears.',
    establishes: 'a favourable result means the seating has been placed to work with the room. A tighter result means the room itself is the constraint on how much clearance was available, not the design intent.',
  }),
  Object.freeze({
    parameter: 'P2',
    measures: 'decoder and renderer capability with the number of discretely rendered speaker positions',
    matters: 'the processor is what places sound in the room. Each object or channel is rendered to a real loudspeaker position rather than blended across the array, which is what makes movement and precision possible.',
    establishes: 'a result here describes how precisely sound can be placed and moved for the speakers this design actually provides.',
  }),
  Object.freeze({
    parameter: 'P3',
    measures: 'the number of screen wall speakers allowed outside their recommended zonal locations',
    matters: 'a screen channel belongs in its recommended zone so that the picture and the sound supporting it stay locked together.',
    establishes: 'a clean result means the front stage follows the intended geometry, so the image and its sound agree across the seats.',
  }),
  Object.freeze({
    parameter: 'P4',
    measures: 'the maximum level difference between the screen wall speakers',
    matters: 'the three screen channels have to be matched in output. If they are not, the front image drifts towards whichever channel is stronger as a scene gets loud.',
    establishes: 'a tight result means the front stage holds its centre as the soundtrack builds.',
  }),
  Object.freeze({
    parameter: 'P5',
    measures: 'the horizontal angle between adjacent surround speakers',
    matters: 'surround speakers spaced too far apart leave gaps. Effects step from one loudspeaker to the next instead of travelling past the seats, and localisation weakens.',
    establishes: 'a favourable result means effects can move smoothly around the seating rather than jumping between widely spaced speakers.',
  }),
  Object.freeze({
    parameter: 'P6',
    measures: 'the maximum level difference between the surround speakers',
    matters: 'surround speakers that differ in output make effects favour one side of the room, which draws attention to a loudspeaker rather than to the scene.',
    establishes: 'a tight result means the surround layer stays even all the way around the audience.',
  }),
  Object.freeze({
    parameter: 'P7',
    measures: 'how far the wide speakers deviate from their intended horizontal position',
    matters: 'front wide speakers fill the area between the screen and the side surrounds. Their position decides whether that transition is continuous or leaves a gap in the soundstage.',
    establishes: 'a favourable result means the front stage and the surrounds join together across the seating.',
  }),
  Object.freeze({
    parameter: 'P8',
    measures: 'whether reflected or elevation speaker types are permitted for height information',
    matters: 'height information is most convincing when it comes from real overhead positions rather than being bounced off the ceiling or inferred by the processor.',
    establishes: 'the result states whether the height layer is produced as the format intends in this design.',
  }),
  Object.freeze({
    parameter: 'P9',
    measures: 'the vertical angle between adjacent height speakers',
    matters: 'overhead speakers spaced too far apart make height effects step across the ceiling instead of flying over the audience.',
    establishes: 'a favourable result means sounds above the audience travel rather than jump.',
  }),
  Object.freeze({
    parameter: 'P10',
    measures: 'the maximum level difference between the height speakers',
    matters: 'an uneven height layer pulls overhead effects towards the louder speaker and away from the picture.',
    establishes: 'a tight result means the ceiling layer stays balanced over the seating.',
  }),
  Object.freeze({
    parameter: 'P11',
    measures: 'the number of surround, wide and upper speakers allowed outside their recommended locations',
    matters: 'the non-screen layers work as a set. A loudspeaker outside its recommended location leaves a gap that the rest of the array has to cover.',
    establishes: 'a clean result means the arrangement follows the intended geometry around the seating.',
  }),
  Object.freeze({
    parameter: 'P12',
    measures: 'the sound pressure capability of the screen speakers at the reference position',
    matters: 'capability is what lets a demanding soundtrack build without strain. Dialogue stays clear, the score grows in scale, and effects keep their weight when a mix becomes dense.',
    establishes: 'a result here describes how much output the screen stage has at the reference position. It says nothing about bass, and nothing about the quality of the response.',
  }),
  Object.freeze({
    parameter: 'P13',
    measures: 'the sound pressure capability of the non-screen speakers at the reference position',
    matters: 'the surrounds and overheads need their own reserve. Without it, effects around and above the audience disappear behind the front stage as soon as the soundtrack becomes busy.',
    establishes: 'a result here describes the reserve the surround and height layers have at the reference position, independently of the screen stage and of bass.',
  }),
  Object.freeze({
    parameter: 'P14',
    measures: 'the low-frequency output capability at the reference position',
    matters: 'bass output is what gives low-frequency effects their physical weight, and what keeps the subwoofer system away from its limits on the most demanding material.',
    establishes: 'a result here describes how much low-frequency output is available. It says nothing about how deep the bass goes, how smooth it is, or what the other seats hear.',
  }),
  Object.freeze({
    parameter: 'P15',
    measures: 'the background noise floor of the room',
    matters: 'a cinema can only reveal quiet detail if the room itself is quiet. The noise floor is the limit below which the quietest parts of a soundtrack are lost.',
    establishes: 'the assumed level describes the room the system is designed for, so quiet passages and fine detail remain audible.',
  }),
  Object.freeze({
    parameter: 'P16',
    measures: 'the seat-to-seat variation across the screen wall speakers',
    matters: 'the front stage should sound the same whichever seat the client takes, otherwise the room has one best seat and the rest are a compromise.',
    establishes: 'a favourable result means the front stage is consistent across the seats assessed. It is not a statement about the surrounds, the overheads or bass, and it is not a statement that the screen speakers match the surrounds in tone: that is a different question, about how the layers sound as sound crosses between them.',
  }),
  Object.freeze({
    parameter: 'P17',
    measures: 'the seat-to-seat variation across the surround and height speakers',
    matters: 'the same reasoning applies around and above the audience: movement and height should hold their character wherever the client sits.',
    establishes: 'a favourable result means the surround and height layers stay consistent across the seats assessed, separately from the front stage. It does not say whether those layers sound like the same system as the front stage: tonal matching between the groups is its own consideration.',
  }),
  Object.freeze({
    parameter: 'P18',
    measures: 'how low the bass extends in the room before it begins to fall away',
    matters: 'extension is depth. It is what gives the low end its foundation, underneath the weight that output provides.',
    establishes: 'a result here describes how deep the bass goes. It says nothing about how loud it can play or how smooth it is.',
  }),
  Object.freeze({
    parameter: 'P19',
    measures: 'the low-frequency response shape at the reference position',
    matters: 'quality is what makes power useful. A smooth, controlled response is what separates firm, articulate bass from boom.',
    establishes: 'a result here describes the shape of the bass response at the reference position, not the output available and not what the other seats hear.',
  }),
  Object.freeze({
    parameter: 'P20',
    measures: 'the seat-to-seat variation in the low frequencies',
    matters: 'bass that only works in one seat makes the room feel unequal. Clients notice immediately when one seat has noticeably more or less low frequency than the seats beside it.',
    establishes: 'a result here describes how consistent the bass is across the seats assessed. It is a statement about consistency, not about output or depth.',
  }),
  Object.freeze({
    parameter: 'P21',
    measures: 'the level of early reflections relative to the direct sound',
    matters: 'reflections arriving just after the direct sound blur the image the loudspeakers have built, costing both clarity and precise placement.',
    establishes: 'the assumed level describes how controlled those early reflections are, and therefore how clearly the system can present detail and position.',
  }),
  Object.freeze({
    parameter: 'RP23',
    measures: 'the viewing geometry: screen size, seating distance and the resulting viewing angle',
    matters: 'the picture is part of the experience. The relationship between the screen and the seating decides how much of the view the image fills and how immersive the room feels.',
    establishes: 'the result describes what each row actually sees, never an angle quoted for its own sake.',
  }),
]);

/**
 * The reference as prompt lines, one line per parameter. Read by the writing
 * model inside the client benefit writing standard.
 *
 * @returns {string[]}
 */
export function clientBenefitIntentLines() {
  return RP22_CLIENT_BENEFIT_INTENT.map(
    (entry) => `${entry.parameter} (${entry.measures}). Why it matters: ${entry.matters} What a result establishes: ${entry.establishes}`,
  );
}

export default RP22_CLIENT_BENEFIT_INTENT;