/**
 * canonicalP6Authority.js
 * -----------------------
 * THE P6 authority.
 *
 * Every surface that computes, grades or shows P6 — the RP22 analysis engine
 * (whose per-seat result is what the reports freeze and publish), the seat HUD
 * snapshot and the HUD metrics calculator — computes it HERE, so the
 * application holds exactly one P6 semantic. The report surfaces (Compliance
 * Panel, Visual Report, Technical Report) consume the published per-seat result
 * this module produces and never compute P6 themselves.
 *
 * WHAT P6 IS
 *
 *   The RP22 surround-consistency assessment: how evenly the installed
 *   listener-level surround speakers — the bed-layer sides (including numbered
 *   additional pairs), the rear pair and the front wides — arrive at a
 *   listening position, measured RELATIVE TO THE REFERENCE SEAT (RSP).
 *
 *   P6 is the RSP-normalised relative level spread of the listener-level
 *   layout. That is the whole of it: an evenness-of-geometry result, never an
 *   output, capability or SPL claim.
 *
 *   For each canonical listener-level surround speaker i:
 *
 *       normalisedLevelAtSeat_i = levelAtSeat_i - levelAtRSP_i
 *       P6 spread               = max(normalised) - min(normalised)
 *
 *   A speaker contributes only when it has a finite level at BOTH positions —
 *   the same-speaker RSP normalisation the engine has always applied. Role
 *   identity, alias resolution and de-duplication are the shared
 *   listenerLevelSurroundRoles authority, unchanged.
 *
 * WHY THE LEVELS ARE UNCAPPED
 *
 *   Each speaker is normalised against its OWN level at the RSP, so its
 *   sensitivity, amplifier power and cabinet capability cancel exactly: what
 *   remains is the relative distance geometry of the layout. That cancellation
 *   only holds on the designer's uncapped design level. When a nearer speaker's
 *   physical max-SPL cap is reached at the seat but not at the RSP, the cap no
 *   longer cancels and a capability limit — P12/P13's subject, fed by amplifier
 *   power and the cabinet's own rating — would bias a geometry result.
 *
 *   P6 therefore reads the SPL engine's uncapped level (`theoretical`), and a
 *   speaker with no uncapped level is excluded rather than assessed on its
 *   capped level. Capability stays where it belongs: P12/P13.
 *
 *   (The engine's cap is applied at the 1 m stage, so it is position-independent
 *   for one speaker and already cancels in the normalisation: reading the
 *   uncapped level gives the SAME P6 result, and makes that independence a
 *   property of the code rather than a coincidence of where the cap happens to
 *   be applied.)
 *
 *   At the RSP itself every normalised level is 0, so P6 = 0 dB = L4.
 *
 * GRADING (RP22 thresholds and the Sound Proof design-value policy, unchanged)
 *
 *   design value = whole-dB floor of the raw spread (resolveRp22DesignValue(6)).
 *   ≤ 2 dB L4 · ≤ 4 dB L3 · ≤ 6 dB L2 · ≤ 10 dB L1 · > 10 dB FAIL.
 *   Full precision stays in maxDeltaRaw for diagnostics and graphs.
 *
 * The module is pure: no React, no app state, no I/O.
 */

import { resolveP6Listeners } from '@/components/utils/rp22/listenerLevelSurroundRoles';
import { resolveRp22DesignValue } from '@/components/utils/rp22/resolveRp22DesignValue';

/**
 * The uncapped design level a speaker reaches at one position, or null.
 *
 * `theoretical` is the SPL engine's capability-free level (sensitivity plus
 * amplifier power minus propagation loss, computed alongside the capped
 * `value`). A speaker with no uncapped level cannot contribute: substituting
 * its capped level would reintroduce the capability bias P6 must not carry.
 */
function uncappedLevel(entry) {
  const level = entry?.theoretical;
  return typeof level === 'number' && Number.isFinite(level) ? level : null;
}

/**
 * Rebuild one position's listener-level surround map on the uncapped levels, in
 * the shape the shared role resolver expects ({ role: { value } }).
 */
function uncappedListenerMap(listeners) {
  const out = {};
  for (const [role, entry] of Object.entries(listeners || {})) {
    const level = uncappedLevel(entry);
    if (level !== null) out[role] = { value: level };
  }
  return out;
}

/**
 * The Performance Level of a whole-dB P6 spread, as its label.
 *
 * @param {number} valueDb the whole-dB design value
 * @returns {'L4'|'L3'|'L2'|'L1'|'FAIL'|null}
 */
export function levelLabelForP6Spread(valueDb) {
  if (!Number.isFinite(valueDb)) return null;
  if (valueDb <= 2) return 'L4';
  if (valueDb <= 4) return 'L3';
  if (valueDb <= 6) return 'L2';
  if (valueDb <= 10) return 'L1';
  return 'FAIL';
}

/** The same level in the engine's numeric convention (4…1, 0 = FAIL). */
function numericLevel(levelLabel) {
  if (levelLabel === 'FAIL') return 0;
  const digits = String(levelLabel || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

/**
 * Compute P6 for one listening position.
 *
 * @param {Object} input
 * @param {Object|null} input.seatListeners the seat's listener-level surround
 *   SPL map from the SPL engine: { role: { value, theoretical } }
 * @param {Object|null} input.rspListeners the RSP's map for the same speakers
 * @returns {{
 *   valueDb: number, level: number, levelLabel: string, formatted: string,
 *   maxDeltaRaw: number, rolesUsed: string[], normalizedByRole: Object,
 *   seatByRole: Object, rspByRole: Object, uncapped: boolean
 * }|null} null when fewer than two surround speakers can be assessed from both
 *   positions — the result is NOT CALCULATED rather than guessed.
 */
export function computeP6Authority({ seatListeners, rspListeners } = {}) {
  const {
    normalizedByRole,
    seatByRole,
    rspByRole,
    rolesUsed,
  } = resolveP6Listeners({
    seatListeners: uncappedListenerMap(seatListeners),
    rspListeners: uncappedListenerMap(rspListeners),
  });

  const values = Object.values(normalizedByRole);
  if (values.length < 2) return null;

  let maxDeltaRaw = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const delta = Math.abs(values[i] - values[j]);
      if (delta > maxDeltaRaw) maxDeltaRaw = delta;
    }
  }

  // Sound Proof design-grading policy: the DESIGN VALUE is the whole-dB floor, so
  // fractions of a predicted dB do not cost a Performance Level. Full precision is
  // preserved in maxDeltaRaw for diagnostics only. RP22 thresholds are unchanged.
  const valueDb = resolveRp22DesignValue(6, maxDeltaRaw);
  const levelLabel = levelLabelForP6Spread(valueDb);

  return {
    valueDb,
    level: numericLevel(levelLabel),
    levelLabel,
    formatted: `${valueDb} dB`,
    maxDeltaRaw,
    rolesUsed,
    normalizedByRole,
    seatByRole,
    rspByRole,
    uncapped: true,
  };
}