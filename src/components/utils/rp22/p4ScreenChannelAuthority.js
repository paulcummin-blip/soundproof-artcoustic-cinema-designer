// src/components/utils/rp22/p4ScreenChannelAuthority.js
/**
 * P4 INPUT AUTHORITY — the one place that decides what P4 compares.
 *
 * P4 is the maximum SPL difference between the screen wall channels at a seat
 * (normalised to the Reference Seating Position exactly as every other seat
 * parameter is). There are exactly THREE logical screen channels: FL, FC and FR.
 *
 * A dual-centre stage is two physical cabinets but ONE logical FC channel. Its
 * SPL is the virtual acoustic centre's own calculation at the pair midpoint —
 * the same figure a conventional centre speaker at that position produces.
 * FCL and FCR are never additional independent channels in P4.
 *
 * The +4 dB dual-centre arrangement allowance is part of the pair's OWN SPL, not
 * a separate capability figure: the two cabinets driven at full centre-channel
 * power really do produce that sound pressure at the seat, and that is exactly the
 * logical Centre SPL the LCR/centre SPL cards and P12 state. P4 therefore reads
 * each channel's effective SPL — the same figure every other surface uses — so a
 * dual-mono pair is compared where it actually plays. Backing the allowance out
 * compared the centre 4 dB below its own stated output and pushed every seat past
 * the bottom of the P4 scale ('Below L1'), which left P4 ungraded.
 *
 * Thresholds and grading are untouched — they stay in the existing grading
 * authority (rp22LevelForP4 / resolveRp22DesignValue).
 */

/** The three logical screen channels P4 compares, in stage order. */
export const P4_SCREEN_CHANNELS = ['FL', 'FC', 'FR'];

/**
 * The SPL (dB) one screen channel entry contributes to P4.
 * Uses the speaker's own propagation result, so a flat arrangement allowance
 * carried on the capability value can never enter the comparison.
 * @param {Object|null} entry - one entry of a seat's `screen` SPL category
 * @returns {number|null}
 */
export function p4ChannelSplDb(entry) {
  if (!entry) return null;
  const effectiveSpl = Number(entry.value);
  const ownSpl = Number(entry.splBeforeArrangementAllowanceDb);
  const spl = Number.isFinite(effectiveSpl) ? effectiveSpl : ownSpl;
  return Number.isFinite(spl) ? spl : null;
}

/**
 * P4 raw metric for one seat: the maximum absolute SPL difference between the
 * logical screen channels (FL, FC, FR).
 * @param {Object|null} screenSpl - a seat's `screen` SPL category
 * @returns {number|null} dB, or null when fewer than two channels have an SPL
 */
export function p4ScreenChannelDeltaDb(screenSpl) {
  const spls = P4_SCREEN_CHANNELS
    .map((role) => p4ChannelSplDb(screenSpl?.[role]))
    .filter(Number.isFinite);

  if (spls.length < 2) return null;

  let maxDelta = 0;
  for (let i = 0; i < spls.length; i++) {
    for (let j = i + 1; j < spls.length; j++) {
      const delta = Math.abs(spls[i] - spls[j]);
      if (delta > maxDelta) maxDelta = delta;
    }
  }
  return maxDelta;
}

export default { P4_SCREEN_CHANNELS, p4ChannelSplDb, p4ScreenChannelDeltaDb };