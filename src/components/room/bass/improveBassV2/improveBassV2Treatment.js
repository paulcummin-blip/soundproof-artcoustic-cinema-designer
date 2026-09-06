// improveBassV2Treatment.js
// Treatment advisory for the V2 Improve Bass Response.
// Only provides advisory guidance when geometry/tuning optimisation has
// failed to solve a persistent modal issue. Never prescribes exact treatment
// thickness, guarantees a grade improvement, or claims an exact dB improvement.

/**
 * Build a treatment advisory based on the winner's remaining limitations.
 * Returns null if no treatment advisory is warranted (e.g. if the result
 * is already strong or the limitation is not modal).
 *
 * @param {object} winner - V2 winner result with perSeatP19/P20, limiting info
 * @param {object} roomDims - room dimensions
 * @returns {{ title: string, body: string, showAdvisory: boolean } | null}
 */
export function buildTreatmentAdvisory(winner, roomDims) {
  if (!winner) return null;

  const perSeatP19 = Array.isArray(winner.perSeatP19) ? winner.perSeatP19 : [];
  const perSeatP20 = Array.isArray(winner.perSeatP20) ? winner.perSeatP20 : [];

  // Check if any seat has a persistent limitation (FAIL or L1)
  const limitedSeats = [...perSeatP19, ...perSeatP20].filter((seat) => {
    const level = Number(seat.level);
    return Number.isFinite(level) && level <= 1;
  });

  if (limitedSeats.length === 0) return null;

  // Identify the worst limitation
  const worstSeat = limitedSeats.reduce((worst, seat) => {
    const level = Number(seat.level);
    return level < (Number(worst?.level) || 5) ? seat : worst;
  }, limitedSeats[0]);

  const worstFreq = Number(worstSeat?.worstFrequencyHz);
  const hasFreqInfo = Number.isFinite(worstFreq) && worstFreq > 0;

  // Determine modal family from frequency
  let modalDescription = "a persistent low-frequency modal feature";
  if (hasFreqInfo) {
    const lengthM = Number(roomDims?.lengthM) || 0;
    const widthM = Number(roomDims?.widthM) || 0;
    const heightM = Number(roomDims?.heightM) || 0;
    const speedOfSound = 343;

    const axialLength = lengthM > 0 ? speedOfSound / (2 * lengthM) : 0;
    const axialWidth = widthM > 0 ? speedOfSound / (2 * widthM) : 0;
    const axialHeight = heightM > 0 ? speedOfSound / (2 * heightM) : 0;

    if (axialLength > 0 && Math.abs(worstFreq - axialLength) / axialLength < 0.15) {
      modalDescription = `a ${worstFreq.toFixed(0)} Hz longitudinal-mode feature`;
    } else if (axialWidth > 0 && Math.abs(worstFreq - axialWidth) / axialWidth < 0.15) {
      modalDescription = `a ${worstFreq.toFixed(0)} Hz lateral-mode feature`;
    } else if (axialHeight > 0 && Math.abs(worstFreq - axialHeight) / axialHeight < 0.15) {
      modalDescription = `a ${worstFreq.toFixed(0)} Hz vertical-mode feature`;
    } else {
      modalDescription = `a persistent ${worstFreq.toFixed(0)} Hz modal feature`;
    }
  }

  const title = "Remaining limitation";
  const body = `${modalDescription} remains. Consider substantial LF treatment at front/rear-wall or corner pressure zones. Confirm treatment design from in-room measurements.`;

  return {
    title,
    body,
    showAdvisory: true,
  };
}

/**
 * Build a remaining-limitation description for the result UI.
 */
export function buildRemainingLimitation(winner) {
  if (!winner) return null;

  const perSeatP19 = Array.isArray(winner.perSeatP19) ? winner.perSeatP19 : [];
  const perSeatP20 = Array.isArray(winner.perSeatP20) ? winner.perSeatP20 : [];

  const allSeats = [...perSeatP19, ...perSeatP20];
  const limitedSeats = allSeats.filter((seat) => {
    const level = Number(seat.level);
    return Number.isFinite(level) && level <= 1;
  });

  if (limitedSeats.length === 0) return null;

  const worstSeat = limitedSeats.reduce((worst, seat) => {
    const level = Number(seat.level);
    return level < (Number(worst?.level) || 5) ? seat : worst;
  }, limitedSeats[0]);

  const worstFreq = Number(worstSeat?.worstFrequencyHz);
  const hasFreq = Number.isFinite(worstFreq) && worstFreq > 0;
  const parameter = perSeatP19.includes(worstSeat) ? "P19" : "P20";

  const parts = [];
  parts.push(`Seat ${worstSeat.seatId || "—"} remains limited by ${parameter}`);
  if (hasFreq) {
    parts.push(`at ${worstFreq.toFixed(0)} Hz`);
  }
  if (Number.isFinite(worstSeat.variationDbRaw)) {
    parts.push(`(${Math.abs(worstSeat.variationDbRaw).toFixed(1)} dB deviation)`);
  }

  return parts.join(" ");
}