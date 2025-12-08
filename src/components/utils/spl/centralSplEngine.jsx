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
 * Resolve effective sensitivity, applying radiation mode adjustment.
 * 
 * @param {Object} speakerMeta - Speaker metadata
 * @param {Object} effectiveSplInputs - SPL inputs including radiationMode
 * @returns {number} Effective sensitivity in dB @ 1W/1m
 */
function resolveEffectiveSensitivity(speakerMeta, effectiveSplInputs) {
  // Start from speaker's sensitivity (same resolution as before)
  let baseSens = safeNum(speakerMeta?.sensitivity_db_1w_1m) || 
                 safeNum(speakerMeta?.sensitivity) || 
                 87; // default fallback
  
  // Apply radiation mode adjustment
  const radiationMode = effectiveSplInputs?.radiationMode || 'half-space';
  if (radiationMode === 'anechoic') {
    baseSens -= 6; // Anechoic reduces effective sensitivity by 6 dB
  }
  
  return baseSens;
}

/**
 * Compute 1m SPL capability with the same logic as SPL Calculator.
 * This is the critical function that caps SPL at speaker's physical limits.
 * 
 * @param {Object} speakerMeta - Speaker metadata from speakerData.js or getModelDimsM
 * @param {number} ampPowerW - Amplifier power in watts
 * @returns {Object} { spl1m_capability, method, isVerified }
 */
function getSPL1mCapability(speakerMeta, ampPowerW, effectiveSensitivity = null) {
    const P_amp = safeNum(ampPowerW) || 0;
    const P_spk = safeNum(speakerMeta?.power_handling_w || speakerMeta?.max_power) || Infinity;

    // Available power is minimum of amp and speaker max
    const P_available = Math.min(P_amp, P_spk);

    // Get sensitivity in 1W/1m terms (use passed-in effective sensitivity if provided)
    const sens_1W = effectiveSensitivity !== null 
      ? effectiveSensitivity 
      : safeNum(speakerMeta?.sensitivity_db_1w_1m || speakerMeta?.sensitivity);
  
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
  // Effective SPL inputs (includes radiationMode)
  effectiveSplInputs = null,
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
  // Step 2: Resolve effective sensitivity (applies radiationMode adjustment)
  // ─────────────────────────────────────────────────────────────────────────
  const effectiveSensitivity = resolveEffectiveSensitivity(effectiveMeta, effectiveSplInputs);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Compute capped 1m SPL capability (same as SPL Calculator)
  // ─────────────────────────────────────────────────────────────────────────
  const { spl1m_capability } = getSPL1mCapability(effectiveMeta, powerW, effectiveSensitivity);
  
  if (spl1m_capability === null) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Calculate 3D distance loss (Room Designer's accurate geometry)
  // ─────────────────────────────────────────────────────────────────────────
  const dx = speakerPos.x - seatPos.x;
  const dy = speakerPos.y - seatPos.y;
  const dz = (speakerPos.z || 1.2) - (seatPos.z || 1.2);
  
  const distance = Math.max(0.10, Math.hypot(dx, dy, dz)); // 10cm floor
  const distanceLoss = 20 * Math.log10(Math.max(1, distance)); // Floor at 1m for log

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Apply all losses to the CAPPED 1m capability
  // ─────────────────────────────────────────────────────────────────────────
  const spl = spl1m_capability - distanceLoss - (screenLoss_dB || 0) - (eqHeadroom_dB || 0);
  
  return Number.isFinite(spl) ? spl : null;
}

/**
 * Compute SPL metrics for all seats in the room.
 * Returns a map: seatId → { spl: { screen: {...}, surrounds: {...}, uppers: {...} } }
 * 
 * Now uses UNIFIED SPL logic matching the SPL Calculator:
 * - Looks up speaker data from speakerData.js
 * - Applies max_spl_cont_db_1m cap before distance loss
 * - Same calculation for LCR, Surrounds, and Overheads
 * 
 * @param {Array} seats - Array of seat objects with x, y, z, id
 * @param {Array} placedSpeakers - Array of speaker objects
 * @param {Function} getCanonicalRole - Role normalization function
 * @param {Function} getEffectiveSplInputs - Function to get power/sensitivity for a role
 * @param {Function} getModelDimsM - Function to get speaker dimensions/metadata
 * @param {number} screenLoss_dB - Screen loss in dB (default 0)
 * @param {number} eqHeadroom_dB - EQ headroom in dB (default 0)
 * @returns {Map} seatId → metrics object
 */
export function computeAllSeatSplMetrics({
  seats,
  placedSpeakers,
  getCanonicalRole,
  getEffectiveSplInputs,
  getModelDimsM,
  screenLoss_dB = 0,
  eqHeadroom_dB = 0,
}) {
  const metricsMap = new Map();
  
  if (!Array.isArray(seats) || !Array.isArray(placedSpeakers)) {
    return metricsMap;
  }

  // Role categorization (same for all speaker types)
  const screenRoles = new Set(['FL', 'FC', 'FR']);
  const surroundRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
  
  // Generic overhead detector - ANY role starting with "T"
  const isOverheadRole = (role) => {
    const canon = getCanonicalRole(role);
    return canon.startsWith('T'); // TFL, TFR, TML, TMR, TRL, TRR, TL, TR, TBL, TBR, TFC, TRC, TBC...
  };

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

    // ─────────────────────────────────────────────────────────────────────────
    // UNIFIED: Same processing for LCR, Surrounds, and Overheads
    // The only differences come from: distance, power setting, and speaker specs.
    // ─────────────────────────────────────────────────────────────────────────
    const processSpeakers = (speakerArray, categoryKey) => {
      for (const spk of speakerArray) {
        const role = getCanonicalRole(spk.role);
        
        // Get speaker metadata from getModelDimsM (which should query speakerData.js)
        const speakerMeta = getModelDimsM(spk.model);
        
        // Get effective SPL inputs (power, sensitivity overrides)
        const effectiveSplInputs = getEffectiveSplInputs(spk.role);

        // Calculate SPL using UNIFIED logic with 1m capability cap
        const splValue = calculateSplAtPoint({
          speakerPos: spk.position,
          seatPos,
          // Pass model name for speakerData.js lookup
          speakerModel: spk.model,
          // Pass any pre-resolved metadata
          speakerMeta: speakerMeta,
          // Legacy sensitivity fallback
          sensitivity_dB_1w1m: effectiveSplInputs?.sensitivity_dB_1w1m || 
                               effectiveSplInputs?.sensitivity || 
                               speakerMeta?.sensitivity_dB_1w1m || 
                               speakerMeta?.sensitivity || 
                               87,
          // Power from effective inputs
          powerW: effectiveSplInputs?.powerW || 100,
          // Screen loss and EQ headroom
          screenLoss_dB: screenLoss_dB || 0,
          eqHeadroom_dB: eqHeadroom_dB || 0,
          // Pass effectiveSplInputs for radiationMode
          effectiveSplInputs: effectiveSplInputs,
        });

        if (Number.isFinite(splValue)) {
          spl[categoryKey][role] = {
            value: splValue,
            formatted: `${splValue.toFixed(1)} dB`,
          };
        }
      }
    };

    // Process all speaker categories with unified logic
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

/**
 * Compute SPL at a specific distance for a single speaker.
 * Unifies continuous and peak SPL calculation for both SPL Calculator and Room Designer.
 * 
 * @param {Object} params
 * @param {string} params.speakerModelId - Speaker model ID for lookup in speakerData.js
 * @param {number} params.distance_m - Listening distance in meters
 * @param {number} params.powerW - Amplifier power in watts
 * @param {string} params.radiationMode - 'half-space' or 'anechoic'
 * @param {number} [params.screenLoss_dB=0] - Screen loss in dB
 * @param {number} [params.eqHeadroom_dB=0] - EQ headroom in dB
 * @param {Object} [params.speakerMeta=null] - Pre-resolved speaker metadata (for comparators without IDs)
 * @returns {Object|null} { spl_continuous_db_at_seat, spl_peak_cf6_db_at_seat, details }
 */
export function computeSingleSeatSplAtDistance({
  speakerModelId,
  distance_m,
  powerW,
  radiationMode,
  screenLoss_dB = 0,
  eqHeadroom_dB = 0,
  speakerMeta = null,
}) {
  // 1. Retrieve speaker metadata (lookup or use provided)
  let resolvedMeta = speakerMeta;
  if (!resolvedMeta && speakerModelId) {
    resolvedMeta = findSpeakerData(speakerModelId);
  }
  
  if (!resolvedMeta) {
    return {
      spl_continuous_db_at_seat: null,
      spl_peak_cf6_db_at_seat: null,
      details: null,
    };
  }

  // Build effective metadata
  const effectiveMeta = {
    sensitivity_db_1w_1m: safeNum(resolvedMeta?.sensitivity_db_1w_1m || resolvedMeta?.sensitivity) || 87,
    power_handling_w: safeNum(resolvedMeta?.power_handling_w || resolvedMeta?.max_power) || Infinity,
    max_spl_cont_db_1m: safeNum(resolvedMeta?.max_spl_cont_db_1m || resolvedMeta?.max_spl) || null,
    max_spl_peak_db_cf6_1m: safeNum(resolvedMeta?.max_spl_peak_db_cf6_1m) || null,
  };

  // 2. Resolve effective sensitivity with radiation mode adjustment
  const effectiveSensitivity = resolveEffectiveSensitivity(effectiveMeta, { radiationMode });

  // 3. Compute continuous SPL @ 1m (with hard cap)
  const { spl1m_capability: spl1m_cont } = getSPL1mCapability(effectiveMeta, powerW, effectiveSensitivity);

  // 4. Peak SPL @ 1m (CF6) - direct from spec, not amp-limited
  const spl1m_peak = effectiveMeta.max_spl_peak_db_cf6_1m;

  // 5. Distance loss (simple 1D for calculator context)
  const distanceLoss = Number.isFinite(distance_m) && distance_m > 0 
    ? 20 * Math.log10(distance_m) 
    : 0;

  // 6. Apply losses to continuous SPL
  const spl_continuous_db_at_seat = Number.isFinite(spl1m_cont)
    ? spl1m_cont - distanceLoss - (screenLoss_dB || 0) - (eqHeadroom_dB || 0)
    : null;

  // 7. Apply losses to peak SPL (no EQ headroom on peak)
  const spl_peak_cf6_db_at_seat = Number.isFinite(spl1m_peak)
    ? spl1m_peak - distanceLoss - (screenLoss_dB || 0)
    : null;

  return {
    spl_continuous_db_at_seat,
    spl_peak_cf6_db_at_seat,
    details: {
      spl1m_cont,
      spl1m_peak,
      effectiveSensitivity,
      distanceLoss,
    },
  };
}