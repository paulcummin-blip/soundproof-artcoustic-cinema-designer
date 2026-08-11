/**
 * usefulLcrPower.js
 * -----------------
 * Stage E1 — maximum useful LCR amplifier power resolver.
 *
 * Derives the amplifier power required for a loudspeaker to reach its canonical
 * continuous SPL cap at 1 m (half-space), capped at the registry max_power, then
 * snapped to the smallest canonical amplifier power option that reaches or
 * exceeds that ceiling.
 *
 * Physics authority (matches centralSplEngine.getSPL1mCapability):
 *
 *   spl1mCapability = min(
 *     sensitivity + 10·log10(min(ampPower, maxPower)),
 *     maxSplCont1mHalfspace
 *   )
 *
 * The cap is applied at 1 m BEFORE propagation loss. Once a speaker has reached
 * its continuous SPL cap at 1 m, additional amplifier power does NOT increase
 * predicted SPL at any distance — propagation loss applies equally to the
 * capped and uncapped values. Therefore the "useful" power is the power that
 * reaches the cap; power above that is wasted.
 *
 *   powerToReachCap   = 10 ^ ((maxSplCap - sensitivity) / 10)
 *   usablePowerCeiling = min(max_power, powerToReachCap)
 *
 * The result is resolved to the smallest existing canonical amplifier power
 * option (POWER_OPTIONS from the SPL engine) that is >= the usable ceiling, so
 * recommendation wording always states a real supported setting.
 */

import { POWER_OPTIONS } from "@/components/utils/spl/engine";

/**
 * Resolve the maximum useful amplifier power (W) for a speaker model.
 * Returns a canonical power option, or null when the model lacks the data
 * needed to compute an acoustic ceiling.
 *
 * @param {Object} modelMeta - Registry model metadata (sensitivity_dB_1w1m,
 *   max_spl_cont_db_1m_halfspace, max_power).
 * @returns {number|null} Canonical amplifier power in watts.
 */
export function resolveUsefulLcrPowerW(modelMeta) {
  const sensitivityDb = Number(modelMeta?.sensitivity_dB_1w1m);
  const maxSplCapDb = Number(modelMeta?.max_spl_cont_db_1m_halfspace);
  const maxPowerW = Number(modelMeta?.max_power);

  if (!Number.isFinite(sensitivityDb) || !Number.isFinite(maxSplCapDb)) return null;
  if (maxSplCapDb <= sensitivityDb) return null; // degenerate — cap at/below 1 W

  const powerToReachCap = Math.pow(10, (maxSplCapDb - sensitivityDb) / 10);
  const ceiling =
    Number.isFinite(maxPowerW) && maxPowerW > 0
      ? Math.min(maxPowerW, powerToReachCap)
      : powerToReachCap;

  // Snap to the smallest canonical amplifier option that reaches or exceeds the
  // usable ceiling. POWER_OPTIONS is already ascending, but sort defensively.
  const sortedOptions = [...POWER_OPTIONS].sort((a, b) => a - b);
  const snapped = sortedOptions.find((opt) => opt >= ceiling);
  return Number.isFinite(snapped) ? snapped : Math.ceil(ceiling);
}