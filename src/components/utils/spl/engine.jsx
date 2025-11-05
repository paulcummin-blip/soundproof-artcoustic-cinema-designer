/**
 * Shared SPL calculation engine
 * Used by both Room Designer and SPL Calculator for consistent results
 */

/**
 * Calculate SPL at listener position
 * @param {Object} inputs - SPL calculation inputs
 * @param {number} inputs.powerW - Amplifier power into nominal impedance
 * @param {number} inputs.sensitivity_dB_2p83 - Speaker spec @2.83V/1m
 * @param {number} inputs.nominalOhms - 4, 6, or 8 ohms
 * @param {number} inputs.distanceM - Listener distance (MLP to speaker)
 * @param {number} inputs.eqHeadroomDb - EQ headroom: 0, -3, or -6 dB
 * @param {number} [inputs.additionalLossDb=0] - Optional filters/voicing loss
 * @returns {number} SPL at listener position in dB
 * 
 * Formula matches SPL Calculator exactly:
 * 1. Normalize 2.83V sensitivity to chosen power
 * 2. Apply inverse-square law for distance
 * 3. Apply EQ headroom and additional losses
 */
export function splAtListener(inputs) {
  const { 
    powerW, 
    sensitivity_dB_2p83, 
    nominalOhms, 
    distanceM, 
    eqHeadroomDb, 
    additionalLossDb = 0 
  } = inputs;

  // Validate inputs
  if (!Number.isFinite(powerW) || powerW <= 0) return NaN;
  if (!Number.isFinite(sensitivity_dB_2p83)) return NaN;
  if (!Number.isFinite(nominalOhms) || nominalOhms <= 0) return NaN;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return NaN;

  // Power at 2.83V into nominal impedance
  const P_2p83 = (2.83 * 2.83) / nominalOhms;

  // SPL at 1m for given power
  const SPL_1m = sensitivity_dB_2p83 + 10 * Math.log10(powerW / P_2p83);

  // Distance loss (inverse square law)
  const distanceLossDb = 20 * Math.log10(distanceM / 1.0);

  // Total SPL at listener (apply EQ headroom and additional losses)
  const SPL_at_listener = SPL_1m - distanceLossDb + eqHeadroomDb - additionalLossDb;

  return SPL_at_listener;
}

/**
 * Standard amplifier power options (watts)
 */
export const POWER_OPTIONS = [
  50, 75, 100, 150, 200, 250, 300, 400, 600, 800, 1000
];

/**
 * EQ Headroom options (dB)
 */
export const EQ_HEADROOM_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: -3, label: '−3 dB' },
  { value: -6, label: '−6 dB' }
];

/**
 * Default values
 */
export const DEFAULT_POWER_W = 100;
export const DEFAULT_EQ_HEADROOM_DB = 0;