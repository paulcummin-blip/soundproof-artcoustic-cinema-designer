// adiGuidanceCopy.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// Parameter-aware guidance copy.
//
// Every limiting factor gets the same six answers, in the same order:
//
//   1. What is wrong?              → whatIsWrong
//   2. Why is it happening?        → whyItIsHappening
//   3. What should I change first? → changeFirst
//   4. What is expected to improve?→ expectedImprovement
//   5. What will remain limited?   → remainingLimitation
//   6. Why are other obvious
//      changes less useful?        → lowerValueChanges
//
// The guidance is written per parameter because the physical cause — and
// therefore the useful next action — is different for every parameter. Speaker
// advice is never offered for a geometry problem, and geometry advice is never
// offered for a capability problem.
//
// This module produces TEXT ONLY. It never grades, ranks, recalculates or
// re-thresholds anything: every number it prints comes straight from the
// canonical evidence.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { ADI_FACTOR_KIND } from "./adiLimitingFactorRules";
import { isHighChannelSystem } from "@/components/proposal/highChannelLayoutAuthority";

// ── Formatting helpers ───────────────────────────────────────────────────

const num = (value, digits = 1) => (
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : null
);

const db = (value, digits = 1) => (num(value, digits) ? `${num(value, digits)} dB` : "a measurable amount");
const deg = (value) => (num(value) ? `${num(value, 0)}°` : "a measurable angle");
const metres = (value) => (num(value, 2) ? `${num(value, 2)} m` : null);
const hz = (value) => (num(value, 0) ? `${num(value, 0)} Hz` : null);

function seatLabel(seatId, seat) {
  if (seat?.row != null) {
    const column = seat.column != null ? `, seat ${seat.column}` : "";
    return `row ${seat.row}${column}`;
  }
  return seatId ? `seat ${seatId}` : "the worst seat";
}

function rowsSummary(parameter) {
  return (parameter?.byRow || [])
    .map((row) => `row ${row.row} ${row.worstLevel || "not calculated"}${row.meanValue != null ? ` (${num(Math.abs(row.meanValue))})` : ""}`)
    .join(", ");
}

function levelPhrase(level) {
  if (!level) return "not calculated";
  return level === "FAIL" ? "a FAIL" : level;
}

function thresholdLine() {
  return "";
}

function runnerUpText(runnerUp, evidence) {
  if (!runnerUp) return null;
  const parameter = evidence?.parameters?.[runnerUp.key];
  const detail = parameter?.worstValue != null
    ? `${num(Math.abs(parameter.worstValue))}${runnerUp.key === "p18" ? " Hz" : runnerUp.key.startsWith("p1") ? " m" : ""}`
    : null;
  return `${runnerUp.area} (${levelPhrase(runnerUp.level)}${detail ? `, ${detail}` : ""})`;
}

// ── Shared fact builders ─────────────────────────────────────────────────

function bassSeatFacts(parameter) {
  const seats = Array.isArray(parameter?.scoredSeats) ? parameter.scoredSeats : [];
  if (!seats.length) return null;
  const ranked = seats
    .map((seat) => ({ ...seat, magnitude: Math.abs(Number(seat.value) || 0) }))
    .sort((a, b) => b.magnitude - a.magnitude);
  return {
    worst: ranked[0],
    best: ranked[ranked.length - 1],
    worstDb: ranked[0].magnitude,
    spreadDb: ranked.length > 1 ? ranked[0].magnitude - ranked[ranked.length - 1].magnitude : null,
    count: ranked.length,
  };
}

// ── Per-parameter guidance ───────────────────────────────────────────────

const BUILDERS = {
  // P20 — seat-to-seat bass consistency
  "p20": ({ candidate, evidence, boundaryCoupled, multiSubInteraction }) => {
    const facts = bassSeatFacts(candidate?.parameter);
    const worstLabel = facts ? seatLabel(facts.worst.seatId, facts.worst) : "the worst seat";
    const subCount = Number(evidence?.system?.subwooferCount || 0);
    const rearWall = metres(evidence?.geometry?.rearWallDistanceM);
    const p1 = evidence?.parameters?.p1;

    const what = `Seat-to-seat bass consistency is the limiting factor of this design. ${facts
      ? `Across ${facts.count} assessed seat${facts.count === 1 ? "" : "s"} the low-frequency response varies by ${db(facts.worstDb)}${facts.spreadDb != null ? `, with a ${db(facts.spreadDb)} spread between the best and worst seat` : ""}. ${worstLabel.charAt(0).toUpperCase()}${worstLabel.slice(1)} is the weakest position.`
      : "The low-frequency response is not consistent across the listening area."} P20 currently stands at ${levelPhrase(candidate?.level)}.`;

    const geometryCause = subCount <= 1
      ? `A single subwoofer can only be correctly aligned to one listening position: every other seat inherits whatever the room is doing at that exact point, so the variation across the seats is set by the room rather than the system.`
      : `With ${subCount} subwoofers the variation is coming from where those cabinets sit relative to the room's axial modes and from how they combine — cabinets that are symmetrically placed on the same wall tend to drive the same mode at every seat instead of cancelling it.`;

    const boundaryCause = boundaryCoupled
      ? ` ${worstLabel.charAt(0).toUpperCase()}${worstLabel.slice(1)} also sits close to a room boundary${rearWall ? ` (${rearWall} to the nearest wall)` : ""}, so it sits inside the pressure build-up of the room's length mode while the front seats sit nearer a null — part of this ${facts ? db(facts.worstDb) : "variation"} is the seating position itself.`
      : "";

    const why = `${geometryCause}${boundaryCause} Below the room's transition frequency the response is decided by modal behaviour, so the same system produces a different curve at each seat.`;

    const changeFirst = boundaryCoupled
      ? `Move the seating first — pull ${worstLabel} forward so the whole listening area sits at least 0.8–1.2 m from the rear wall — then re-place the subwoofers. ${subCount <= 1 ? "Add a second subwoofer and place the pair toward the mid-points of opposing walls (front/rear or left/right) rather than together on the front wall." : "Move the existing cabinets to opposing wall mid-points, keeping the array symmetric around the room centreline."} Attack the seating and the array together: they are the two levers that change P20 across every seat at once.`
      : `${subCount <= 1 ? "Add a second subwoofer" : "Re-place the existing subwoofers"} so the array is symmetric about the room's centreline and drives the length mode from opposing positions (front/rear wall mid-points, or both side-wall mid-points). If the seating can move, pull ${worstLabel} 300–500 mm toward the room centre as well. Then re-run the bass calibration — the layout sets the shape of the variation, the calibration only sets its level.`;

    const expected = `Opposed subwoofer placement cancels the dominant mode at the listening positions instead of exciting it, which is the only mechanism that reduces the error across all seats simultaneously. Expect the worst-seat deviation to fall into the L2 window, moving P20 from ${levelPhrase(candidate?.level)} toward L2 or better, with P19 usually improving in the same pass.`;

    const remaining = `Any seat that has to stay within about 0.6 m of a boundary keeps some boundary-induced response error that no amount of array placement can remove, and the room's own low-frequency decay below the transition frequency is unchanged. If the seating cannot move, the worst seat remains the reference limitation.`;

    const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
    const lower = `Changing the loudspeakers, re-aiming the bed channels or adding amplifier power does not address P20 — this parameter is produced by the subwoofer/room geometry, not by the speakers above the transition frequency.${alternative ? ` The next most limiting result is ${alternative}, which should be addressed after the bass layout is settled, not instead of it.` : ""}${multiSubInteraction ? " The multiple-subwoofer interaction also shows up in P19, so treat the array as one problem rather than two." : ""}`;

    return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
  },

  // P19 — reference-seat bass response
  "p19": ({ candidate, evidence, boundaryCoupled }) => {
    const facts = bassSeatFacts(candidate?.parameter);
    const worstLabel = facts ? seatLabel(facts.worst.seatId, facts.worst) : "the reference seat";
    const why = `The reference listening position is not yet tracking the target low-frequency curve — the deviation is ${facts ? db(facts.worstDb) : "notable"} at ${worstLabel}. Below the transition frequency this is a room problem, not a system problem: ${boundaryCoupled ? "the seat's proximity to a boundary loads the response in the lower octaves, " : ""}the subwoofer position sets which modes are excited, and where a mode peaks or cancels at that seat the curve departs from the target.`;
    const changeFirst = `Re-place the subwoofer${Number(evidence?.system?.subwooferCount || 0) > 1 ? "s" : ""} relative to the reference seat first — moving the cabinet a quarter of the room length while leaving the seat fixed changes which modes reach that seat.${boundaryCoupled ? " If the reference seat is within 0.8 m of a wall, move the seat forward before touching the array; the boundary loading has to be removed first." : ""} Only then apply calibration to the residual curve.`;
    const expected = `The target deviation at the reference seat should fall into the L2 window, moving P19 from ${levelPhrase(candidate?.level)} toward L2 or better. Because the same modal behaviour drives P20, seat-to-seat consistency usually improves in the same pass.`;
    const remaining = `Calibration can correct the residual curve at the reference seat, but it cannot recover output that a deep null has removed — those narrow bands stay limited by the geometry, and every other seat inherits the same correction applied to a different room response.`;
    const lower = `A larger or more capable subwoofer raises the ceiling but does not change the modal pattern that is causing the deviation${runnerUpText(evidence?.runnerUpCandidate, evidence) ? `; ${runnerUpText(evidence?.runnerUpCandidate, evidence)} is the next result to look at once the reference curve is settled` : ""}.`;
    return { whatIsWrong: `The reference-seat bass response is the limiting factor. The measured response deviates by ${facts ? db(facts.worstDb) : "a significant margin"} from the selected target below the room's transition frequency. P19 currently stands at ${levelPhrase(candidate?.level)}.`, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
  },

  // P14 / P12 / P13 — output capability
  "p14": ({ candidate, evidence }) => capabilityCopy({ candidate, evidence, subject: "LFE output capability", requirement: "the selected LFE target", action: "the subwoofer array" }),
  "p12": ({ candidate, evidence }) => capabilityCopy({ candidate, evidence, subject: "screen-speaker output capability at the reference seat", requirement: "the required screen-channel level", action: "the screen-wall speakers" }),
  "p13": ({ candidate, evidence }) => capabilityCopy({ candidate, evidence, subject: "non-screen speaker output capability at the reference seat", requirement: "the required surround and height level", action: "the surround and height speakers" }),

  // P1 — listening area and boundaries
  "p1": ({ candidate, evidence }) => {
    const parameter = candidate?.parameter;
    const worst = parameter?.scoredSeats
      ?.map((seat) => ({ ...seat, magnitude: Math.abs(Number(seat.value) || 0) }))
      .sort((a, b) => a.magnitude - b.magnitude)[0];
    const distance = worst ? metres(worst.magnitude) : null;
    const seatText = worst ? seatLabel(worst.seatId, worst) : "the rear of the listening area";
    const rearWall = metres(evidence?.geometry?.rearWallDistanceM);
    const what = `The listening area is too close to the room boundaries. ${distance ? `The closest listening position (${seatText}) sits ${distance} from the nearest wall` : `${seatText} sits inside the minimum recommended boundary distance`}, giving P1 ${levelPhrase(candidate?.level)}.`;
    const why = `A seat within roughly a metre of a wall sits inside that boundary's pressure build-up at low frequencies and inside the maximum of one or more room modes. That row therefore sees a different bass curve and a different early-reflection pattern from the rows in front of it, which is why this parameter also drives bass consistency and timbre results at the rear of the room.`;
    const changeFirst = `Move the seating: give the closest listener at least 0.8 m — ideally 1.2 m — of clearance to the nearest wall, starting with ${seatText}. If the row spacing allows it, pull the rear row forward rather than moving the whole block, so the front rows keep their screen distance.`;
    const expected = `P1 should recover to L2 or better, and because the same boundary loading contributes to the bass and timbre results at that row, P16/P17/P20 usually improve at the same seats without any change to the system.`;
    const remaining = `If the room depth is fixed and the seats must stay where they are, the rear row keeps a boundary-related response error that cannot be equalised away — treat that row as secondary seating for critical listening.`;
    const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
    const lower = `Speaker changes, amplifier power and calibration do not move the listener away from the wall; this is a seating and room-geometry result.${alternative ? ` ${alternative} is the next limitation to examine once the seating layout is fixed.` : ""}`;
    // P1 is a minimum-distance parameter: the smallest value is the limiting one.
    return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
  },

  // P5 / P9 — spatial angle gaps
  "p5": ({ candidate, evidence }) => spatialCopy({ candidate, evidence, group: "surround", plane: "horizontal", between: "adjacent surround speakers" }),
  "p9": ({ candidate, evidence }) => spatialCopy({ candidate, evidence, group: "height/overhead", plane: "vertical", between: "adjacent upper speakers" }),

  // P4 / P6 / P10 — SPL balance
  "p4": ({ candidate, evidence }) => splBalanceCopy({ candidate, evidence, group: "screen-wall", label: "screen-wall speaker" }),
  "p6": ({ candidate, evidence }) => splBalanceCopy({ candidate, evidence, group: "surround", label: "surround speaker" }),
  "p10": ({ candidate, evidence }) => splBalanceCopy({ candidate, evidence, group: "upper", label: "upper speaker" }),

  // P16 / P17 — timbre consistency
  "p16": ({ candidate, evidence }) => timbreCopy({ candidate, evidence, group: "screen-wall", label: "screen-wall" }),
  "p17": ({ candidate, evidence }) => timbreCopy({ candidate, evidence, group: "surround and height", label: "surround and height" }),

  // P18 — bass extension
  "p18": ({ candidate, evidence }) => {
    const achieved = hz(candidate?.parameter?.value);
    const what = `In-room bass extension is the limiting factor. The system reaches ${achieved ? achieved : "a higher cut-off than the selected target"} against the selected extension target — P18 ${levelPhrase(candidate?.level)}.`;
    const why = `Extension is set by the subwoofer's own low-frequency capability plus the room's gain below the transition frequency. Where the room does not reinforce the lowest octave and the cabinet rolls off, the −3 dB point lands higher than the target.`;
    const changeFirst = `Confirm the selected extension target matches the room's realistic capability first; if it does, move to a subwoofer with greater low-frequency output (the next model up the same range) rather than adding equalisation, since equalisation cannot create output below the cabinet's roll-off.`;
    const expected = `A larger cabinet or a second subwoofer in the same family typically recovers 3–6 Hz of extension and moves P18 up one level; the room's own gain then extends it further.`;
    const remaining = `Below the room's fundamental axial mode the response is dominated by the room, so the last few Hz of extension may stay out of reach regardless of the product selected.`;
    const lower = `Amplifier power does not extend the cut-off below the cabinet's alignment, and targeting a lower P18 figure without the cabinet support produces a curve that measures flat but has no usable output in the last octave.`;
    return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
  },

  // P2 / P3 / P7 / P11 — loudspeaker layout and zoning
  //
  // A high-channel-count layout is already at the top RP22 level for P2, and the
  // spacing parameters are position and seat results. Neither is presented as a
  // channel-count problem: more channels are never offered, and processor or
  // amplifier capability and cost are never raised.
  "p2": ({ candidate, evidence }) => (isHighChannelSystem(evidence?.system)
    ? {
      whatIsWrong: `The layout is settled at this speaker density, which is the top RP22 level for discrete channel capability: Parameter 2 is achieved here rather than limited.`,
      whyItIsHappening: `At this density the design is not short of speaker positions. What a seat hears at the spacing parameters is set by where the speakers can physically go and where the seats are, not by the number of channels.`,
      changeFirst: `Work the position results instead — P5, P7, P9 and P10 respond to speaker position, aiming and seat geometry, and none of them needs another channel.`,
      expectedImprovement: `Re-positioning or re-aiming the existing speakers moves the spacing parameters without adding a channel, and leaves Parameter 2 where it already is.`,
      remainingLimitation: `The practical speaker positions and the seat geometry set the ceiling that remains; a higher channel count would not raise it.`,
      lowerValueChanges: `Upgrading the speaker models does not change a position result either${runnerUpText(evidence?.runnerUpCandidate, evidence) ? `; ${runnerUpText(evidence?.runnerUpCandidate, evidence)} is the next result to address` : ""}.`,
    }
    : {
      whatIsWrong: `The number of discretely rendered speakers is the limiting factor: the layout renders ${candidate?.parameter?.value != null ? `${candidate.parameter.value} discrete outputs` : "fewer discrete outputs than the layout requires"}, giving P2 ${levelPhrase(candidate?.level)}.`,
      whyItIsHappening: `A layout with fewer discrete channels cannot reproduce the intended object panning between the speakers it does not have, so the spatial result is limited before any speaker is optimised.`,
      changeFirst: `Add the missing speaker positions in priority order — surrounds, then heights — rather than upgrading the speaker models in the positions you already have.`,
      expectedImprovement: `Each added discrete position raises the achievable spatial resolution and moves P2 up a level, which lifts the Spatial Resolution category with it.`,
      remainingLimitation: `If the room or the budget caps the channel count, the achievable spatial resolution is capped with it; the design should then target the level the layout can genuinely support.`,
      lowerValueChanges: `Upgrading the existing speakers does not add channels${runnerUpText(evidence?.runnerUpCandidate, evidence) ? `; ${runnerUpText(evidence?.runnerUpCandidate, evidence)} is the next result to address` : ""}.`,
    }),
  "p3": ({ candidate, evidence }) => zoningCopy({ candidate, evidence, subject: "screen-wall", count: candidate?.parameter?.value }),
  "p11": ({ candidate, evidence }) => zoningCopy({ candidate, evidence, subject: "surround, wide and height", count: candidate?.parameter?.value }),
  "p7": ({ candidate, evidence }) => ({
    whatIsWrong: `The wide speakers sit ${candidate?.parameter?.value != null ? `${deg(candidate.parameter.value)} off` : "outside"} their ideal median angle, giving P7 ${levelPhrase(candidate?.level)}.`,
    whyItIsHappening: `Wide speakers are placed to bridge the front stage and the sides; where the only practical position is outside the recommended wedge the panning across the front is skewed at the outer seats.`,
    changeFirst: `Move the wide pair toward the median angle of the front stage — usually a small change in wall position or bracket angle — before considering a different speaker model.`,
    expectedImprovement: `Bringing them inside the recommended wedge restores smooth panning between the screen speakers and the surrounds and moves P7 up a level.`,
    remainingLimitation: `If the wall construction or the screen width fixes the position, some deviation remains and the outer seats stay the weakest for front-stage panning.`,
    lowerValueChanges: `A different wide speaker model does not change its angular position; this is a placement result.`,
  }),
  "screen": ({ candidate, evidence }) => ({
    whatIsWrong: `The screen viewing geometry is the limiting factor: the horizontal viewing angle is outside the recommended window at ${candidate?.parameter?.worstSeatId ? seatLabel(candidate.parameter.worstSeatId) : "the outer seats"}.`,
    whyItIsHappening: `The seating distance and screen width set the horizontal angle; where the rows are deep or the screen is small, the outer rows fall outside the comfortable window.`,
    changeFirst: `Change the seating distance or the screen size — the two variables that set the angle — starting with the row that sits furthest outside the window.`,
    expectedImprovement: `Bringing the worst row inside the window restores the intended immersive field of view and improves the RP23 result across the seating area.`,
    remainingLimitation: `Where the room depth is fixed, the front row usually has to give up some of the gain made at the back.`,
    lowerValueChanges: `Loudspeaker changes do not affect the viewing angle; this is a screen and seating geometry result.`,
  }),
};

// ── Shared builders for parameter families ───────────────────────────────

function capabilityCopy({ candidate, evidence, subject, requirement, action }) {
  const value = num(candidate?.parameter?.value);
  const distance = metres(evidence?.geometry?.listeningDistanceM);
  const what = `Output capability is the limiting factor. ${subject.charAt(0).toUpperCase()}${subject.slice(1)} reaches ${value ? `${value} dB` : "less than the required level"} at the reference seat against ${requirement} — P${candidate?.number} ${levelPhrase(candidate?.level)}.`;
  const why = `The achievable level is the sum of speaker sensitivity, amplifier power, listening distance${distance ? ` (currently ${distance})` : ""} and how many speakers share the load. Where two or more of those are unfavourable, the system runs out of output before the target is met, and the shortfall shows up first at the reference seat.`;
  const changeFirst = `The cheapest first move is amplifier power — doubling power adds 3 dB — provided the speakers are rated for it. If the shortfall is larger than about 3 dB, or the speakers are already at their power limit, step up the range within the same family so the tonal character of the system does not change.`;
  const expected = `A doubling of power recovers 3 dB immediately; a step up the model range typically recovers 3–6 dB of clean output, which moves P${candidate?.number} from ${levelPhrase(candidate?.level)} to the next level and lifts the Dynamic Range category with it.`;
  const remaining = `Capability is capped by the cabinet and driver complement. If the target is a reference-level requirement, the ceiling is set by the model range rather than the calibration, and ${action} has to change to raise it.`;
  const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
  const lower = `Room treatment, re-aiming and equalisation redistribute energy but cannot create output, so they do not resolve a capability shortfall.${alternative ? ` ${alternative} is the next result to examine once the output requirement is met.` : ""}`;
  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

function spatialCopy({ candidate, evidence, group, plane, between }) {
  const parameter = candidate?.parameter;
  const rows = (parameter?.byRow || []).filter((row) => row.assessedCount > 0);
  const front = rows[0] || null;
  const rear = rows[rows.length - 1] || null;
  const rowProfile = rows.map((row) => `row ${row.row} ${row.worstLevel || "not calculated"}${row.meanValue != null ? ` (${num(Math.abs(row.meanValue), 1)}°)` : ""}`).join(" · ");
  const worstValue = parameter?.worstValue != null ? deg(Math.abs(parameter.worstValue)) : null;
  const collapse = rows.length > 1 && front?.worstRank != null && rear?.worstRank != null && (front.worstRank - rear.worstRank) >= 2;

  const what = `Spatial angle coverage for the ${group} speakers is the limiting factor. ${worstValue ? `The largest gap between ${between} at a listening position is ${worstValue}` : `The ${plane} angle between ${between} exceeds the recommended maximum at the outer seats`}, giving P${candidate?.number} ${levelPhrase(candidate?.level)}.${rows.length ? ` By row: ${rowProfile}.` : ""}`;

  const why = collapse
    ? `The angle between ${between} closes up as the listener moves rearward: the same speaker positions that give the front row a wide, well-filled arc give the back row a much narrower one. The listening area is deeper than the current surround layout can serve, so the rear rows — not the speaker model — are what limits this parameter.`
    : `The spacing between ${between} relative to the affected seats produces too large an angular gap for smooth panning. The gap is created by the distance between the speakers and how far the seat sits from them, not by the speakers themselves.`;

  const changeFirst = collapse
    ? `Bring the rear rows forward so the whole listening area sits inside one surround window, or add a second pair of side surrounds positioned for the rear seats. If the room is too shallow to separate the rows, reduce to two rows: at this depth the depth of the listening area is itself the constraint, and removing a row buys more than any speaker change.`
    : `Split the largest gap — either add a speaker between the existing pair, or re-position the pair and the seating so the affected seats see them from a narrower angle. Confirm the change on the worst seat before changing anything else.`;

  const expected = collapse
    ? `The rear-row angle opens toward the front row's figure, moving P${candidate?.number} from ${levelPhrase(candidate?.level)} to L2 or better, and the surround level-balance and timbre results at the rear row usually recover with it.`
    : `The largest gap closes to inside the recommended window and panning across the affected seats becomes continuous, moving P${candidate?.number} up one level.`;

  const remaining = `Very wide or very deep listening areas stay the hardest case: the outermost or rearmost seats retain the largest angle gap, so treat them as the reference limitation rather than expecting them to match the centre seats.`;

  const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
  const lower = `Changing the ${group} speaker model, adding amplifier power or re-aiming the existing pair cannot change the angle measured from the seats — that is fixed by positions.${alternative ? ` ${alternative} is the next result to address once the layout is settled.` : ""}`;

  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

function splBalanceCopy({ candidate, evidence, group, label }) {
  const parameter = candidate?.parameter;
  const worst = parameter?.scoredSeats
    ?.map((seat) => ({ ...seat, magnitude: Math.abs(Number(seat.value) || 0) }))
    .sort((a, b) => b.magnitude - a.magnitude)[0];
  const seatText = worst ? seatLabel(worst.seatId, worst) : "the outer seats";
  const spread = worst ? db(worst.magnitude) : null;
  const what = `Level balance between the ${group} speakers is the limiting factor. The predicted difference between the loudest and quietest ${label} at ${seatText} is ${spread || "larger than the recommended maximum"}, giving P${candidate?.number} ${levelPhrase(candidate?.level)}.`;
  const why = `That difference is mostly distance: ${seatText} sits much closer to one ${label} than to the others, and level differences of this size cannot be corrected by a global trim because the error changes from seat to seat. Where the speakers also differ in sensitivity or in how they behave off-axis, a further part of the spread comes from the speakers themselves.`;
  const changeFirst = `Even the distances first — re-position or re-aim the ${group} speakers so ${seatText} sits closer to the average distance for that group — then set the channel levels with a microphone at the reference seat rather than by ear.`;
  const expected = `Closing the distance spread typically brings the difference inside the recommended window, moving P${candidate?.number} from ${levelPhrase(candidate?.level)} to L2 or better and improving the seat-to-seat consistency the level difference was masking.`;
  const remaining = `Some spread is inherent to a wide listening area: the seats at the extremes stay the weakest, and a room where the screen wall forces the outer speakers into the corners keeps some of the difference.`;
  const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
  const lower = `A global level trim cannot fix a per-seat difference, because the error is spatial rather than absolute — and it would move every other seat away from the correct level.${alternative ? ` ${alternative} is the next result to look at once the balance is evened out.` : ""}`;
  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

function timbreCopy({ candidate, evidence, group, label }) {
  const parameter = candidate?.parameter;
  const worst = parameter?.scoredSeats
    ?.map((seat) => ({ ...seat, magnitude: Math.abs(Number(seat.value) || 0) }))
    .sort((a, b) => b.magnitude - a.magnitude)[0];
  const seatText = worst ? seatLabel(worst.seatId, worst) : "the outer seats";
  const variance = worst ? db(worst.magnitude) : null;
  const what = `Seat-to-seat timbre consistency across the ${group} speakers is the limiting factor. The variance in frequency response between seats reaches ${variance || "a wider margin than the recommended maximum"}, giving P${candidate?.number} ${levelPhrase(candidate?.level)}${worst ? `, worst at ${seatText}` : ""}.`;
  const why = `Every seat outside the design axis hears a different off-axis response from each ${label} speaker. Where the rows sit at markedly different angles to the speakers, or where the ${group} channels mix models from different ranges, those differences no longer track each other and the tonal character shifts as the listener moves.`;
  const changeFirst = `Hold one model family across the ${group} channels, then re-aim those speakers so each row sits closer to the same off-axis angle — a small toe-in or height change at the speakers that serve the outer rows does more for this parameter than replacing a single unit.`;
  const expected = `Matching the model family and evening the off-axis angles moves P${candidate?.number} from ${levelPhrase(candidate?.level)} to L2 or better, and the panning between those channels becomes tonally continuous.`;
  const remaining = `A very wide front row will always sit further off-axis than the centre: those seats keep a small residual variance that no amount of aiming removes.`;
  const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
  const lower = `Adding power or changing the subwoofer does not affect a mid- and high-frequency variance result.${alternative ? ` ${alternative} is the next result to address afterwards.` : ""}`;
  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

function zoningCopy({ candidate, evidence, subject, count }) {
  const n = Number(count);
  const what = `${n && Number.isFinite(n) ? `${n} ${subject} speaker${n === 1 ? "" : "s"} sit` : `A ${subject} speaker sits`} outside the recommended zonal locations, giving P${candidate?.number} ${levelPhrase(candidate?.level)}.`;
  const why = `The recommended zones exist because the zonal positions produce the intended coverage at every seat; a speaker outside them works against the geometry, usually showing up next as an angle or level-balance result.`;
  const changeFirst = `Move the affected speaker back inside its zone before changing the specification — the zone is defined by the seating and screen geometry, so the correct position is reachable in almost every room with a bracket or a slight relocation.`;
  const expected = `Returning the speaker to its zone clears P${candidate?.number} and usually lifts the associated angle and level-balance parameters with it.`;
  const remaining = `If the room construction genuinely prevents the zonal position (a structural wall, a window or a door), that position stays out of zone and its associated parameters remain limited at that seat.`;
  const lower = `A different speaker model does not move the speaker into its zone.`;
  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

// ── Incomplete evaluation — never a dead end ─────────────────────────────

function incompleteCopy({ evidence, signal }) {
  const missing = evidence?.evaluation?.missingParameters || [];
  const bassIncomplete = evidence?.evaluation?.bassIncomplete === true;
  const missingLabels = missing
    .filter((entry) => ["p1", "p4", "p5", "p6", "p9", "p10", "p12", "p13", "p14", "p16", "p17", "p18", "p19", "p20", "p2"].includes(entry.key))
    .map((entry) => `P${entry.number}`)
    .slice(0, 8);
  const signalText = signal?.deviationDb != null
    ? `${signal.key === "p20" ? "seat-to-seat bass consistency" : "the reference-seat bass response"} (the provisional data already shows ${db(signal.deviationDb)} of variation)`
    : "the bass parameters";

  const what = `ADI cannot yet name a settled limiting factor, because the evaluation has not finished.${missingLabels.length ? ` Still outstanding: ${missingLabels.join(", ")}.` : ""}${bassIncomplete ? " The bass parameters in particular have not published, so the results that usually lead this analysis are still provisional." : ""}`;
  const why = `The results ADI reasons over are graded from settled engineering data. Until ${bassIncomplete ? "the bass evaluation completes" : "those parameters calculate"}, any ranking would be based on provisional numbers — so ADI holds the ranking rather than naming a factor it cannot defend.`;
  const changeFirst = bassIncomplete
    ? `Complete the bass evaluation first: re-run the bass analysis in the Room Designer and accept the calibration so P14/P18/P19/P20 publish. In the meantime, the provisional evidence already points at ${signalText} — if the variation is confirmed, plan on subwoofer layout, symmetry and seating position before any speaker change.`
    : `Calculate the outstanding parameters, then re-read this guidance.`;
  const expected = `Once the outstanding parameters publish, ADI will name the limiting factor, the first action and the expected improvement with settled numbers rather than estimates.`;
  const remaining = `Until then the design should not be signed off on the incomplete results: the parameters still outstanding are among those that most affect the finished performance.`;
  const lower = `Changing speakers, aiming or calibration now would be guesswork — the evidence needed to judge whether a change helped is exactly what is missing.`;
  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

// ── Front-to-rear collapse — listening-area depth ───────────────────────

function metricValue(key, value) {
  const magnitude = Math.abs(Number(value) || 0);
  if (key === "p5" || key === "p9") return deg(magnitude);
  return db(magnitude);
}

function collapseFamily(key) {
  if (key === "p5") {
    return {
      label: "Surround angle coverage",
      fix: "Bring the rear rows forward so the whole listening area sits inside one surround window, or add a second pair of side surrounds positioned for the rear seats.",
    };
  }
  if (key === "p9") {
    return {
      label: "Height speaker angle coverage",
      fix: "Either bring the rear rows forward so one row of overhead speakers serves the whole area, or add a second row of overheads aligned to the rear seats.",
    };
  }
  if (key === "p4" || key === "p6" || key === "p10") {
    return {
      label: "Level balance across the listening area",
      fix: "Even the seat-to-speaker distances at the rear rows — re-position or re-aim the speakers that serve them — before any other change.",
    };
  }
  return {
    label: "Timbre consistency across the listening area",
    fix: "Hold one model family across the channels serving the rear rows and re-aim them so every row sits at a similar off-axis angle.",
  };
}

function rowCollapseCopy({ candidate, evidence, collapse }) {
  const key = candidate?.key || collapse?.key || null;
  const parameter = candidate?.parameter || collapse?.parameter || null;
  const family = collapseFamily(key);
  const rows = (parameter?.byRow || []).filter((row) => row.assessedCount > 0);
  const profile = rows
    .map((row) => `row ${row.row} ${levelPhrase(row.worstLevel)}${row.meanValue != null ? ` (${metricValue(key, row.meanValue)})` : ""}`)
    .join(" · ");
  const front = collapse?.frontRow || rows[0] || null;
  const rear = collapse?.rearRow || rows[rows.length - 1] || null;
  const roomDepth = metres(evidence?.geometry?.roomDims?.lengthM);
  const rowCount = rows.length;

  const what = `${family.label} collapses from the front of the listening area to the rear. ${profile ? `By row: ${profile}.` : ""} The rear row is ${levelPhrase(rear?.worstLevel)} while the front row is ${levelPhrase(front?.worstLevel)}${collapse?.drop ? ` — ${collapse.drop} performance levels lost across ${rowCount} rows` : ""}. This is a listening-area geometry result, not an equipment result.`;

  const why = `The rows do not see the same thing. ${key === "p5" || key === "p9"
    ? "The angle between adjacent speakers is measured from the seat, so the same speaker positions that give the front row a wide, well-filled arc give the rear row a much narrower one."
    : "The seat-to-speaker distances and the off-axis angles both change row by row, so each row receives a different balance and a different response shape."} ${roomDepth
    ? `At ${roomDepth} of room depth, the listening area is deeper than a single row of speakers can cover evenly`
    : `The listening area is deeper than the speaker layout can cover evenly`}, which is why the loss accumulates toward the back rather than appearing at one seat.`;

  const changeFirst = `${family.fix}${roomDepth && rowCount >= 3
    ? " If the room is too shallow to separate the rows, reduce to two rows: at this depth the depth of the listening area is itself the constraint, and removing a row buys more than any equipment change."
    : " Confirm the improvement on the rear row before changing anything else."}`;

  const expected = `The rear-row result should move toward the front row's figure — P${candidate?.number} recovering from ${levelPhrase(rear?.worstLevel)} to L2 or better — and the level-balance and timbre results at the rear row usually recover with it, because the same geometry is driving them.`;

  const remaining = `If every row has to stay where it is, the rear row remains the weakest position: aiming can recover a few degrees of the angle and calibration can even the levels, but neither changes the geometry the rear seats sit in. Treat the front rows as the reference seats.`;

  const alternative = runnerUpText(evidence?.runnerUpCandidate, evidence);
  const lower = `Changing the speaker model, adding amplifier power or re-aiming the existing speakers cannot change the angle or the distance measured from the rear row — that is fixed by where the speakers and the seats are.${alternative ? ` ${alternative} is the next result to address once the listening-area layout is settled.` : ""}`;

  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

function balancedCopy({ evidence }) {
  const candidate = evidence?.balancedCandidate || null;
  const what = `No limiting factor stands out. Every settled parameter currently reaches L2 or better${candidate ? `, and the lowest remaining result is ${candidate.area} at ${levelPhrase(candidate.level)}` : ""}.`;
  const why = `No single result is holding the design back — the remaining differences between parameters are refinements rather than constraints.`;
  const changeFirst = candidate
    ? `There is nothing that must change. If further work is wanted, ${candidate.area} is the lowest result and the most useful place to refine.`
    : `There is nothing that must change.`;
  const expected = `Any refinement from here moves a single parameter by one level rather than lifting the design as a whole.`;
  const remaining = `The room's own acoustics and the seating geometry set the ceiling that remains; that ceiling cannot be raised by calibration alone.`;
  const lower = `Speaker upgrades, additional channels or room treatment would add cost without changing the outcome that currently limits the design.`;
  return { whatIsWrong: what, whyItIsHappening: why, changeFirst, expectedImprovement: expected, remainingLimitation: remaining, lowerValueChanges: lower };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Build the six-field ADI guidance for the selected limiting factor.
 *
 * @param {Object} selection — selectAdiLimitingFactor output
 * @returns {{ whatIsWrong, whyItIsHappening, changeFirst, expectedImprovement,
 *   remainingLimitation, lowerValueChanges }}
 */
export function buildAdiGuidanceCopy(selection) {
  const { kind, key, candidate, runnerUp, evidence } = selection || {};
  const context = {
    candidate,
    evidence: { ...(evidence || {}), runnerUpCandidate: runnerUp },
    boundaryCoupled: selection?.boundaryCoupled === true,
    multiSubInteraction: selection?.multiSubInteraction === true,
  };

  if (kind === ADI_FACTOR_KIND.INCOMPLETE) {
    return incompleteCopy({ evidence, signal: selection?.signal || null });
  }
  if (kind === ADI_FACTOR_KIND.BALANCED) {
    return balancedCopy({ evidence: { ...(evidence || {}), balancedCandidate: selection?.candidates?.[0] || null } });
  }
  if (kind === ADI_FACTOR_KIND.ROW_COLLAPSE) {
    return rowCollapseCopy({
      candidate,
      evidence: evidence || {},
      collapse: selection?.collapse || null,
    });
  }

  const builder = BUILDERS[key || candidate?.key];
  if (!builder) {
    const fallback = candidate;
    return {
      whatIsWrong: fallback
        ? `${fallback.area} is the limiting factor of this design, currently at ${levelPhrase(fallback.level)}.`
        : "No limiting factor could be identified from the settled results.",
      whyItIsHappening: "This parameter is below the intended performance level for the seating area it covers.",
      changeFirst: "Address the geometry of this parameter before changing equipment: position and layout determine the result.",
      expectedImprovement: "Correcting the geometry should move this parameter up at least one performance level.",
      remainingLimitation: "The remaining rooms and seating constraints set the ceiling for this parameter.",
      lowerValueChanges: "Equipment changes do not alter a geometry result.",
    };
  }

  return builder(context);
}

export default buildAdiGuidanceCopy;