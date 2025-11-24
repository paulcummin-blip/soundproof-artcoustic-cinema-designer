// components/utils/spl/centralSplEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED SPL ENGINE — Single source of truth for SPL calculations.
// Used by: Seat HUD, LCR cards, Surround cards, Overhead cards.
// 
// This engine now uses the same 1m capability logic as the SPL Calculator,
// driven entirely from components/data/speakerData.js.
// ─────────────────────────────────────────────────────────────────────────────

import { artcousticSpeakers } from "@/components/data/speakerData";

// Helper to find speaker data from speakerData.js by model name
function findSpeakerData(modelName) {
  if (!modelName || !Array.isArray(artcousticSpeakers)) return null;
  
  const normalizedModel = String(modelName).toLowerCase().replace(/[-_\s]/g, '');
  
  return artcousticSpeakers.find(s => {
    const normalizedEntry = String(s.model || '').toLowerCase().replace(/[-_\s]/g, '');
    return normalizedEntry === normalizedModel || s.id === modelName;
  }) || null;
}

// Helper to safely parse numbers
function safeNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute 1m SPL capability with the same logic as SPL Calculator.
 * This is the critical function that caps SPL at speaker's physical limits.
 * 
 * @param {Object} speakerMeta - Speaker metadata from speakerData.js or getModelDimsM
 * @param {number} ampPowerW - Amplifier power in watts
 * @returns {Object} { spl1m_capability, method, isVerified }
 */
function getSPL1mCapability(speakerMeta, ampPowerW) {
  const P_amp = safeNum(ampPowerW) || 0;
  const P_spk = safeNum(speakerMeta?.power_handling_w || speakerMeta?.max_power) || Infinity;
  
  // Available power is minimum of amp and speaker max
  const P_available = Math.min(P_amp, P_spk);
  
  // Get sensitivity in 1W/1m terms
  const sens_1W = safeNum(speakerMeta?.sensitivity_db_1w_1m || speakerMeta?.sensitivity);
  
  // Compute amp-limited SPL at 1m
  let SPL_1m_amp_limited = null;
  if (sens_1W !== null && P_available > 0) {
    SPL_1m_amp_limited = sens_1W + 10 * Math.log10(P_available);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL: Cap at max_spl_cont_db_1m from speakerData.js
  // This is the speaker's verified continuous max SPL at 1m — the physical limit.
  // ─────────────────────────────────────────────────────────────────────────
  const hardCap = safeNum(speakerMeta?.max_spl_cont_db_1m || speakerMeta?.max_spl);
  
  // Determine final 1m capability
  let spl1m_capability = null;
  let method = "Unknown";
  let isVerified = false;
  
  if (SPL_1m_amp_limited !== null && hardCap !== null) {
    // Both available: use minimum (cap the amp-limited value)
    spl1m_capability = Math.min(SPL_1m_amp_limited, hardCap);
    method = spl1m_capability === hardCap ? "Max SPL Cap" : "Amp-limited";
    isVerified = spl1m_capability === hardCap;
  } else if (SPL_1m_amp_limited !== null) {
    // Only amp-limited available
    spl1m_capability = SPL_1m_amp_limited;
    method = "Amp-limited";
    isVerified = false;
  } else if (hardCap !== null) {
    // Only hard cap available (fallback)
    spl1m_capability = hardCap;
    method = "Max SPL Cap";
    isVerified = true;
  }
  
  return { spl1m_capability, method, isVerified };
}

/**
 * Calculate SPL at a point using unified logic matching SPL Calculator.
 * 
 * Steps:
 * 1. Look up speaker data from speakerData.js
 * 2. Compute capped 1m SPL capability (amp-limited, then capped at max_spl_cont_db_1m)
 * 3. Calculate 3D distance loss
 * 4. Subtract screen loss and EQ headroom
 * 
 * @param {Object} params
 * @returns {number|null} Final SPL at seat position
 */
function calculateSplAtPoint({
  speakerPos,
  seatPos,
  sensitivity_dB_1w1m,
  powerW,
  // New unified parameters
  speakerModel = null,
  speakerMeta = null,
  screenLoss_dB = 0,
  eqHeadroom_dB = 0,
}) {
  // Validate positions
  if (!speakerPos || !Number.isFinite(speakerPos.x) || !Number.isFinite(speakerPos.y)) return null;
  if (!seatPos || !Number.isFinite(seatPos.x) || !Number.isFinite(seatPos.y)) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Resolve speaker metadata from speakerData.js
  // ─────────────────────────────────────────────────────────────────────────
  let resolvedMeta = speakerMeta;
  if (!resolvedMeta && speakerModel) {
    resolvedMeta = findSpeakerData(speakerModel);
  }
  
  // Build effective speaker data (merge passed values with resolved data)
  const effectiveMeta = {
    sensitivity_db_1w_1m: safeNum(resolvedMeta?.sensitivity_db_1w_1m) || 
                          safeNum(resolvedMeta?.sensitivity) || 
                          safeNum(sensitivity_dB_1w1m) || 
                          87,
    power_handling_w: safeNum(resolvedMeta?.power_handling_w) || 
                      safeNum(resolvedMeta?.max_power) || 
                      Infinity,
    max_spl_cont_db_1m: safeNum(resolvedMeta?.max_spl_cont_db_1m) || 
                        safeNum(resolvedMeta?.max_spl) || 
                        null,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Compute capped 1m SPL capability (same as SPL Calculator)
  // ─────────────────────────────────────────────────────────────────────────
  const { spl1m_capability } = getSPL1mCapability(effectiveMeta, powerW);
  
  if (spl1m_capability === null) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Calculate 3D distance loss (Room Designer's accurate geometry)
  // ─────────────────────────────────────────────────────────────────────────
  const dx = speakerPos.x - seatPos.x;
  const dy = speakerPos.y - seatPos.y;
  const dz = (speakerPos.z || 1.2) - (seatPos.z || 1.2);
  
  const distance = Math.max(0.10, Math.hypot(dx, dy, dz)); // 10cm floor
  const distanceLoss = 20 * Math.log10(Math.max(1, distance)); // Floor at 1m for log

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Apply all losses to the CAPPED 1m capability
  // ─────────────────────────────────────────────────────────────────────────
  const spl = spl1m_capability - distanceLoss - (screenLoss_dB || 0) - (eqHeadroom_dB || 0);
  
  return Number.isFinite(spl) ? spl : null;
}

/**
 * Compute SPL metrics for all seats in the room.
 * Returns a map: seatId → { spl: { screen: {...}, surrounds: {...}, uppers: {...} } }
 * 
 * @param {Array} seats - Array of seat objects with x, y, z, id
 * @param {Array} placedSpeakers - Array of speaker objects
 * @param {Function} getCanonicalRole - Role normalization function
 * @param {Function} getEffectiveSplInputs - Function to get power/sensitivity for a role
 * @param {Function} getModelDimsM - Function to get speaker dimensions/metadata
 * @returns {Map} seatId → metrics object
 */
export function computeAllSeatSplMetrics({
  seats,
  placedSpeakers,
  getCanonicalRole,
  getEffectiveSplInputs,
  getModelDimsM,
}) {
  const metricsMap = new Map();
  
  if (!Array.isArray(seats) || !Array.isArray(placedSpeakers)) {
    return metricsMap;
  }

  // Role categorization
  const screenRoles = new Set(['FL', 'FC', 'FR']);
  const surroundRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
  const overheadRoles = new Set(['TFL', 'TFR', 'TML', 'TMR', 'TBL', 'TBR', 'TL', 'TR', 'TFC', 'TBC']);

  // Filter speakers with valid positions
  const hasPos = s => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);
  const placedLCR = placedSpeakers.filter(s => hasPos(s) && screenRoles.has(getCanonicalRole(s.role)));
  const placedSur = placedSpeakers.filter(s => hasPos(s) && surroundRoles.has(getCanonicalRole(s.role)));
  const placedOH = placedSpeakers.filter(s => hasPos(s) && overheadRoles.has(getCanonicalRole(s.role)));

  // Process each seat
  for (const seat of seats) {
    const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
    const seatPos = {
      x: Number(seat?.x ?? seat?.position?.x),
      y: Number(seat?.y ?? seat?.position?.y),
      z: Number(seat?.z ?? seat?.position?.z ?? 1.2),
    };

    if (!Number.isFinite(seatPos.x) || !Number.isFinite(seatPos.y)) {
      continue; // Skip invalid seats
    }

    const spl = {
      screen: {},
      surrounds: {},
      uppers: {},
    };

    // Helper to process speakers in a category
    const processSpeakers = (speakerArray, categoryKey) => {
      for (const spk of speakerArray) {
        const role = getCanonicalRole(spk.role);
        const speakerMeta = getModelDimsM(spk.model);
        const effectiveSplInputs = getEffectiveSplInputs(spk.role);

        const splValue = calculateSplAtPoint({
          speakerPos: spk.position,
          seatPos,
          sensitivity_dB_1w1m: effectiveSplInputs?.sensitivity_dB_1w1m || 
                               effectiveSplInputs?.sensitivity || 
                               speakerMeta?.sensitivity_dB_1w1m || 
                               speakerMeta?.sensitivity || 
                               87,
          powerW: effectiveSplInputs?.powerW || 100,
        });

        if (Number.isFinite(splValue)) {
          spl[categoryKey][role] = {
            value: splValue,
            formatted: `${splValue.toFixed(1)} dB`,
          };
        }
      }
    };

    processSpeakers(placedLCR, 'screen');
    processSpeakers(placedSur, 'surrounds');
    processSpeakers(placedOH, 'uppers');

    metricsMap.set(seatId, { spl });
  }

  return metricsMap;
}

/**
 * Get SPL metrics for a specific seat (typically MLP/RSP).
 * Returns { screen: {...}, surrounds: {...}, uppers: {...} } or null if seat not found.
 */
export function getSeatSplMetrics(allSeatMetrics, seatId) {
  if (!allSeatMetrics || !seatId) return null;
  const metrics = allSeatMetrics.get(seatId);
  return metrics?.spl || null;
}

/**
 * Helper to get the MLP/RSP seat from a list of seats.
 * Looks for isPrimary flag or falls back to the first seat.
 */
export function getMlpSeat(seats) {
  if (!Array.isArray(seats) || seats.length === 0) return null;
  
  // Try to find primary seat
  const primary = seats.find(s => s.isPrimary);
  if (primary) return primary;
  
  // Fallback to first seat
  return seats[0];
}