// absorptionAdviceAuthority.js
// ---------------------------------------------------------------------------
// Low-frequency absorption ADVICE for the ADI Bass Optimisation result.
//
// Product rule: absorption is a design recommendation, never an applyable lever.
// It is stated AFTER practical electronic and placement options have been
// evaluated, and it never produces an Apply action.
//
// RP22 basis: low-frequency response depends on room volume, proportions,
// listener locations, subwoofer quantity and locations, bass absorption and
// electro-acoustic optimisation — and modest damping of low-frequency room
// resonances is always desirable. This module therefore does not compute
// absorption, and never claims any was calculated. It reads the metrics the
// optimiser already produced and states, in plain language, when the remaining
// seat-to-seat variation is the kind absorption addresses.
//
// Evidence it may use (all already measured by the optimiser):
//   • the achieved P20 level / deviation (L1 or worse = not L2-or-better)
//   • the worst P20 frequency shared by several seats (a persistent frequency)
//   • levers that improved one seat while worsening another (trade-offs)
// ---------------------------------------------------------------------------

import { frequencyText } from "./optimiserWholeNumberDb.js";

export const ABSORPTION_ROW_KEY = "low_frequency_absorption";
export const ABSORPTION_LABEL = "Low-frequency absorption";

export const ABSORPTION_STATUS = Object.freeze({
  RECOMMENDED: "Recommended",
  CONSIDER: "Consider",
});

export const ABSORPTION_ACTION_TEXT = "Review front wall / corners for bass trapping";

export const ABSORPTION_LOCATION_COPY = Object.freeze({
  KNOWN: "Front wall / front corners are the first places to review for bass trapping.",
  UNKNOWN: "Add low-frequency absorption as part of the room treatment design. Final placement should be confirmed during calibration.",
});

/** L1 is the poorest RP22 P20 level: absorption is advised when it remains. */
export const ABSORPTION_POOR_LEVEL_MAX = 1;

/** Used only when no level is published: ±10 dB or worse is not L2-or-better. */
export const ABSORPTION_POOR_DEVIATION_DB = 10;

/** Seats whose worst P20 frequency falls within this band share a frequency. */
export const ABSORPTION_FREQUENCY_TOLERANCE_HZ = 3;

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * The frequency several seats share as their worst P20 frequency. A single seat
 * with a bad frequency is not evidence of a persistent room issue.
 */
export function persistentFrequency(seats = []) {
  const values = (Array.isArray(seats) ? seats : [])
    .map((seat) => numeric(seat?.p20WorstFrequencyHz ?? seat?.worstFrequencyHz))
    .filter((value) => value != null && value > 0)
    .sort((a, b) => a - b);
  if (values.length < 2) return null;

  let best = null;
  values.forEach((value) => {
    const clustered = values.filter((other) => Math.abs(other - value) <= ABSORPTION_FREQUENCY_TOLERANCE_HZ);
    if (!best || clustered.length > best.seatCount) {
      best = { seatCount: clustered.length, hz: Math.round(value) };
    }
  });
  return best && best.seatCount >= 2 ? best : null;
}

function leverKeyOf(row) {
  return String(row?.lever ?? row?.leverKey ?? row?.key ?? "");
}

/**
 * Resolve the absorption advice, or null when it is not warranted.
 *
 * Shown only when P20 remains poor after the practical options were evaluated,
 * and either a persistent frequency is shared across seats or the search kept
 * trading one seat against another.
 */
export function resolveAbsorptionAdvice({
  p20Level = null,
  p20DeviationDb = null,
  seats = [],
  leverRows = [],
  limitingFrequencyHz = null,
} = {}) {
  const level = numeric(p20Level);
  const deviation = numeric(p20DeviationDb);

  const poorByLevel = level != null && level <= ABSORPTION_POOR_LEVEL_MAX;
  const poorByDeviation = level == null && deviation != null && deviation >= ABSORPTION_POOR_DEVIATION_DB;
  if (!poorByLevel && !poorByDeviation) return null;

  const rows = Array.isArray(leverRows) ? leverRows : [];
  const persistent = persistentFrequency(seats);
  const tradedOff = rows.some((row) => row?.tradeOff && row.tradeOff.isTradeOff !== false);
  const placementEvaluated = rows.some((row) => /placement/i.test(leverKeyOf(row)) && row?.evaluated === true);

  const fallback = numeric(limitingFrequencyHz);
  const frequencyHz = persistent?.hz ?? (fallback != null ? Math.round(fallback) : null);

  const status = persistent || tradedOff
    ? ABSORPTION_STATUS.RECOMMENDED
    : ABSORPTION_STATUS.CONSIDER;

  const reason = frequencyHz != null
    ? `Persistent modal issue around ${frequencyText(frequencyHz)}`
    : "Seat-to-seat variation remains after electronic and placement options";

  const headline = frequencyHz != null
    ? `ADI found a persistent seat-to-seat variation around ${frequencyText(frequencyHz)}. Electronic tuning and practical placement did not fully solve it. Consider low-frequency absorption at the front wall / front corners to reduce modal energy.`
    : "Electronic tuning and practical placement did not fully solve the remaining seat-to-seat variation. Consider low-frequency absorption as part of the room treatment design.";

  // The specific location is only stated when the practical routes have been
  // evaluated AND a limiting frequency is known. Otherwise the general design
  // advice is given, with final placement confirmed at calibration.
  const locationKnown = frequencyHz != null && placementEvaluated;

  return {
    key: ABSORPTION_ROW_KEY,
    label: ABSORPTION_LABEL,
    status,
    frequencyHz,
    frequencyText: frequencyHz == null ? null : frequencyText(frequencyHz),
    affectedSeatCount: persistent?.seatCount ?? 0,
    reason,
    headline,
    actionText: ABSORPTION_ACTION_TEXT,
    location: locationKnown ? ABSORPTION_LOCATION_COPY.KNOWN : ABSORPTION_LOCATION_COPY.UNKNOWN,
    locationKnown,
    tradedOff,
    placementEvaluated,
  };
}