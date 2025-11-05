/**
 * RP22 SPL targets (in dB) for different performance levels.
 */
export const RP22_TARGETS = {
  P12: { L1: 102, L2: 105, L3: 108, L4: 111 }, // For screen channels
  P13: { L1: 99,  L2: 102, L3: 105, L4: 108 }, // For non-screen channels
  // P14 (LFE) is a placeholder until the spec is finalized.
  P14: { L1: 109, L2: 112, L3: 115, L4: 118, _status: 'UNVERIFIED' } // TODO: Confirm with final RP22 spec
};

/**
 * Maps speaker groups to their corresponding RP22 SPL parameter.
 */
export const SPEAKER_GROUP_TO_PARAMETER = {
  'lcr': 'P12',
  'frontWide': 'P13',
  'sideSurround': 'P13',
  'rearSurround': 'P13',
  'overheads': 'P13',
  'subwoofers': 'P14'
};

/**
 * Retrieves the RP22 target SPL for a specific speaker group and performance level.
 * @param {string} groupKey - The key for the speaker group (e.g., 'lcr', 'sideSurround').
 * @param {number} level - The desired RP22 level (1-4).
 * @returns {object} An object containing the target SPL, the relevant parameter, and verification status.
 */
export function getRP22Target(groupKey, level = 4) {
  const parameter = SPEAKER_GROUP_TO_PARAMETER[groupKey];
  if (!parameter) {
    return { target: null, parameter: null, isVerified: false };
  }
  
  const targets = RP22_TARGETS[parameter];
  if (!targets) {
    return { target: null, parameter, isVerified: false };
  }
  
  const levelKey = `L${Math.round(level)}`;
  const target = targets[levelKey];
  const isVerified = targets._status !== 'UNVERIFIED';
  
  return {
    target: target ?? null,
    parameter,
    isVerified
  };
}