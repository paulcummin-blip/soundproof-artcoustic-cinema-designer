// steinwayLockedAmplifier.js
// ---------------------------------------------------------------------------
// Comparison-control rule for Steinway Lyngdorf / Steinway & Sons loudspeakers
// that use the manufacturer's locked amplifier ecosystem.
//
// When such a speaker is selected in RP22 Speaker Capability, the shared
// amplifier-power control is locked to the manufacturer's specified 400 W and
// manual editing is disabled. The user's previous power value is preserved and
// restored as soon as the selection no longer includes a Steinway locked-amp
// speaker.
//
// Identification uses the canonical manufacturer identity (manufacturerIdentity)
// so spelling variants of "Steinway Lyngdorf" and "Steinway & Sons" match, but
// unrelated "Lyngdorf Audio" / "Lyngdorf" products do NOT — the rule never fires
// merely because a model name contains a similar word.
//
// This is a comparison-control rule only. It does not change the central SPL
// engine, RP22 thresholds, manufacturer specifications or data classification.
// ---------------------------------------------------------------------------

import { normaliseManufacturerIdentity } from "./manufacturerIdentity";

export const STEINWAY_LOCKED_AMPLIFIER_POWER_W = 400;

export const STEINWAY_LOCKED_AMPLIFIER_NOTE =
  "Steinway Lyngdorf speakers are a locked system and must use Steinway Lyngdorf amplification. The comparison therefore uses the manufacturer's specified 400 W amplifier power.";

// The normalised identity of "Steinway Lyngdorf" is "steinwaylyngdorf" and
// "Steinway & Sons" is "steinwaysons" (the "&" expands to "and", a joining word
// that is filtered out). Both start with "steinway".
// "Lyngdorf Audio" normalises to "lyngdorfaudio" and "Lyngdorf" to "lyngdorf" —
// neither starts with "steinway", so unrelated Lyngdorf products are excluded.
function normalisedIsSteinway(manufacturer) {
  const id = normaliseManufacturerIdentity(manufacturer);
  if (!id) return false;
  return id.startsWith("steinway");
}

export function isSteinwayLockedAmplifierRecord(record) {
  if (!record) return false;
  // Explicit locked-system authority takes precedence — the flag is carried
  // from the source specification through the comparison row, so any genuine
  // manufacturer-locked system is recognised regardless of manufacturer name.
  if (record.locked_amplification_system === true) return true;
  // Fallback: canonical manufacturer-name identification for Steinway Lyngdorf
  // / Steinway & Sons records that do not yet carry the explicit flag.
  return normalisedIsSteinway(record.manufacturer);
}

export function isSteinwayLockedAmplifierCandidate(candidate) {
  if (!candidate) return false;
  return isSteinwayLockedAmplifierRecord(candidate.record)
    || normalisedIsSteinway(candidate.manufacturer);
}

/**
 * The fixed manufacturer amplifier power for a locked-system speaker. Returns
 * the record's locked_amplifier_power_w when set, falling back to the canonical
 * 400 W for Steinway Lyngdorf / Steinway & Sons records identified by name.
 * @param {object} record comparison row or candidate record
 * @returns {number} amplifier power in watts
 */
export function getLockedAmplifierPowerW(record) {
  if (record?.locked_amplifier_power_w && Number.isFinite(Number(record.locked_amplifier_power_w))) {
    return Number(record.locked_amplifier_power_w);
  }
  return STEINWAY_LOCKED_AMPLIFIER_POWER_W;
}