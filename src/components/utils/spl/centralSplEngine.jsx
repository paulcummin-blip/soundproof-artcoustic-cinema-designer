// components/utils/spl/centralSplEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED SPL ENGINE — Single source of truth for SPL calculations.
// Used by: Seat HUD, LCR cards, Surround cards, Overhead cards.
// 
// This engine now uses the same 1m capability logic as the SPL Calculator,
// driven entirely from components/data/speakerData.js.
// ─────────────────────────────────────────────────────────────────────────────

import { artcousticSpeakers } from "@/components/data/speakerData";

// Quasi-line distance benefit (small, capped) for selected models only.
// Purpose: allow a modest (0–2 dB) reduction in distance loss for quasi-line behaviour,
// without changing general RP22 anechoic baseline for normal point sources.
function isQuasiLineEligibleSpeaker(speaker) {
  const id = String(speaker?.id ?? '').toLowerCase();
  const model = String(speaker?.model ?? '').toLowerCase();

  const isQSeries = id.startsWith('spitfire-q-') || model.includes('spitfire q');
  const isEvolve63 = id === 'evolve-6-3' || model.includes('evolve 6-3');
  const isEvolve84 = id === 'evolve-8-4' || model.includes('evolve 8-4');

  return Boolean(speaker?.isLineSource) && (isQSeries || isEvolve63 || isEvolve84);
}

// Returns 0..2 dB benefit based on distance vs speaker height (as a proxy for line length).
// Ramps from 0 dB at ~2x height to 2 dB at ~8x height (clamped).
function quasiLineBenefitDb(distanceM, speaker) {
  if (!isQuasiLineEligibleSpeaker(speaker)) return 0;

  const L = Number(speaker?.heightM);
  if (!Number.isFinite(L) || L <= 0) return 0;

  const d = Math.max(1, Number(distanceM) || 0); // keep same 1m floor behaviour
  const start = 2 * L;
  const end = 8 * L;

  if (d <= start) return 0;
  if (d >= end) return 2;

  const t = (d - start) / (end - start); // 0..1
  return 2 * t; // 0..2 dB
}

// Helper to find speaker data from speakerData.js by model name
function findSpeakerData(modelName) {
  if (!modelName || !Array.isArray(artcousticSpeakers)) return null;
  
  const normalizedModel = String(modelName).toLowerCase().replace(/[-_\s]/g, '');
  
  return artcousticSpeakers.find(s => {
    const normalizedEntry = String(s.model || '').toLowerCase().replace(/[-_\s]/g, '');
    return normalizedEntry === normalizedModel || s.id === modelName;
  }) || null;
}

/**
 * Small bounded room-support approximation based on room volume.
 * SOURCE BASIS: published half-space values + direct-sound propagation.
 * Room support is a modest steady-state in-room gain correction only.
 * Intentionally bounded — this is a design approximation, not exact acoustics.
 * 
 * @param {number|null} volumeM3 - Room volume in cubic metres
 * @returns {number} Room support gain in dB (0.5–2.0 dB)
 */
function roomSupportDbFromVolume(volumeM3) {
  if (!Number.isFinite(volumeM3)) return 1.0;  // sensible default when unknown
  if (volumeM3 < 60)  return 2.0;              // small room — strong boundary support
  if (volumeM3 < 120) return 1.5;              // medium room
  if (volumeM3 < 200) return 1.0;              // large room
  return 0.5;                                   // very large — minimal support
}

// Helper to safely parse numbers
function safeNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve effective sensitivity.
 * SOURCE BASIS: published half-space sensitivity — no anechoic correction applied.
 * This engine predicts realistic in-room SPL for design purposes (not exact simulation).
 * 
 * @param {Object} speakerMeta - Speaker metadata
 * @param {Object} effectiveSplInputs - SPL inputs (retained for API compatibility)
 * @returns {number} Effective sensitivity in dB @ 1W/1m
 */
function resolveEffectiveSensitivity(speakerMeta, effectiveSplInputs) {
  // Use published half-space sensitivity directly — no -6 dB anechoic reduction.
  // The quoted sensitivity_db_1w_1m values are half-space (2π) measurements.
  return safeNum(speakerMeta?.sensitivity_db_1w_1m) ||
         safeNum(speakerMeta?.sensitivity) ||
         87; // default fallback
}

/**
 * Compute 1m SPL capability with the same logic as SPL Calculator.
 * This is the critical function that caps SPL at speaker's physical limits.
 * NOW MATCHES SPL CALCULATOR: Uses CF6 peak @ 1m as the hard cap (no crest factor deduction).
 * 
 * @param {Object} speakerMeta - Speaker metadata from speakerData.js or getModelDimsM
 * @param {number} ampPowerW - Amplifier power in watts
 * @param {number} effectiveSensitivity - Pre-adjusted sensitivity (with radiation mode)
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
  // Hard cap: use the continuous anechoic 1m SPL as the ceiling.
  // max_spl_cont_db_1m on effectiveMeta is already resolved to anechoic via
  // the priority chain in calculateSplAtPoint / computeSingleSeatSplAtDistance.
  // ─────────────────────────────────────────────────────────────────────────
  const hardCap = safeNum(speakerMeta?.max_spl_cont_db_1m_halfspace) ||
                  safeNum(speakerMeta?.max_spl_cont_db_1m) || 
                  safeNum(speakerMeta?.max_spl);
  
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
  // Room volume for bounded in-room support approximation
  roomVolumeM3 = null,
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
  
  // Build effective speaker data — source basis is published half-space values.
  // Propagation remains current direct-sound seat-loss method.
  // This is intended for realistic in-room design prediction, not exact acoustic simulation.
  const effectiveMeta = {
    sensitivity_db_1w_1m: safeNum(resolvedMeta?.sensitivity_db_1w_1m) || 
                          safeNum(resolvedMeta?.sensitivity) || 
                          safeNum(sensitivity_dB_1w1m) || 
                          87,
    power_handling_w: safeNum(resolvedMeta?.power_handling_w) || 
                      safeNum(resolvedMeta?.max_power) || 
                      Infinity,
    // Continuous cap: half-space first → legacy cont → legacy max_spl
    max_spl_cont_db_1m: safeNum(resolvedMeta?.max_spl_cont_db_1m_halfspace) ||
                        safeNum(resolvedMeta?.max_spl_cont_db_1m) || 
                        safeNum(resolvedMeta?.max_spl) || 
                        null,
    // Peak cap: half-space first → legacy CF6 peak → legacy peak_spl
    max_spl_peak_db_cf6_1m: safeNum(resolvedMeta?.max_spl_peak_db_cf6_1m_halfspace) ||
                            safeNum(resolvedMeta?.max_spl_peak_db_cf6_1m) ||
                            safeNum(resolvedMeta?.peak_spl) ||
                            null,
  };

  // Dev-only warning if half-space fields are absent
  if (speakerModel && !resolvedMeta?.max_spl_cont_db_1m_halfspace && !resolvedMeta?.max_spl_cont_db_1m) {
    const warnKey = `__splWarn_${speakerModel}`;
    if (!globalThis[warnKey]) {
      globalThis[warnKey] = true;
      console.warn(`[SPL] No half-space or continuous SPL fields for model: ${speakerModel}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Resolve effective sensitivity (applies radiationMode adjustment)
  // ─────────────────────────────────────────────────────────────────────────
  const effectiveSensitivity = resolveEffectiveSensitivity(effectiveMeta, effectiveSplInputs);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Compute capped 1m SPL capability (same as SPL Calculator)
  // ─────────────────────────────────────────────────────────────────────────
  const { spl1m_capability } = getSPL1mCapability(effectiveMeta, powerW, effectiveSensitivity);
  const ampPowerUsed = safeNum(powerW) || 0;
  const powerHandlingUsed = safeNum(effectiveMeta?.power_handling_w) || Infinity;
  const availablePowerUsed = Math.min(ampPowerUsed, powerHandlingUsed);
  const spl1mAmpLimited = availablePowerUsed > 0
    ? effectiveSensitivity + 10 * Math.log10(availablePowerUsed)
    : null;
  const maxContinuousSplCap = safeNum(effectiveMeta?.max_spl_cont_db_1m_halfspace) ||
    safeNum(effectiveMeta?.max_spl_cont_db_1m) ||
    safeNum(effectiveMeta?.max_spl) ||
    null;
  
  if (spl1m_capability === null) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Calculate 3D distance loss (Room Designer's accurate geometry)
  // ─────────────────────────────────────────────────────────────────────────
  const dx = speakerPos.x - seatPos.x;
  const dy = speakerPos.y - seatPos.y;
  const spz = Number.isFinite(speakerPos?.z) ? speakerPos.z : 1.2;
  const sez = Number.isFinite(seatPos?.z) ? seatPos.z : 1.2;
  const dz = spz - sez;
  
  const distance = Math.max(0.10, Math.hypot(dx, dy, dz)); // 10cm floor
  const d = Math.max(1, distance); // Floor at 1m for log
  const speakerForBenefit = { id: speakerModel, model: speakerModel, isLineSource: resolvedMeta?.isLineSource, heightM: resolvedMeta?.heightM };
  const lineBenefit = quasiLineBenefitDb(d, speakerForBenefit); // 0..2 dB, only for Q + Evolve 6-3/8-4
  const distanceLoss = (20 * Math.log10(d)) - lineBenefit;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Apply all losses + small bounded room support approximation.
  // Source basis: published half-space values. Propagation: direct-sound seat-loss.
  // Room support is a small bounded steady-state approximation from room volume.
  // ─────────────────────────────────────────────────────────────────────────
  const roomSupportDb = roomSupportDbFromVolume(roomVolumeM3);
  const spl = spl1m_capability - distanceLoss - (screenLoss_dB || 0) - (eqHeadroom_dB || 0) + roomSupportDb;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Theoretical SPL (uncapped — sensitivity + power only, no hard cap)
  // ─────────────────────────────────────────────────────────────────────────
  const P_amp_theoretical = safeNum(powerW) || 0;
  const P_spk_theoretical = safeNum(effectiveMeta?.power_handling_w) || Infinity;
  const P_available_theoretical = Math.min(P_amp_theoretical, P_spk_theoretical);
  let spl_theoretical = null;
  if (P_available_theoretical > 0) {
    const spl1m_theoretical = effectiveSensitivity + 10 * Math.log10(P_available_theoretical);
    const theoreticalLineBenefit = quasiLineBenefitDb(d, speakerForBenefit);
    const theoreticalDistanceLoss = (20 * Math.log10(d)) - theoreticalLineBenefit;
    spl_theoretical = spl1m_theoretical - theoreticalDistanceLoss - (screenLoss_dB || 0) - (eqHeadroom_dB || 0) + roomSupportDb;
    if (!Number.isFinite(spl_theoretical)) spl_theoretical = null;
  }

  return Number.isFinite(spl) ? {
    spl,
    spl_theoretical,
    debug: {
      modelKey: speakerModel,
      modelLabel: resolvedMeta?.label || resolvedMeta?.name || resolvedMeta?.model || speakerModel,
      sensitivityUsedDb: effectiveSensitivity,
      powerHandlingW: powerHandlingUsed,
      ampPowerW: ampPowerUsed,
      availablePowerW: availablePowerUsed,
      maxContinuousSplCapDb: maxContinuousSplCap,
      spl1mAmpLimitedDb: spl1mAmpLimited,
      spl1mCappedDb: spl1m_capability,
      distanceM: distance,
      distanceLossDb: distanceLoss,
      roomSupportDb,
      finalRawSplDb: spl,
    },
  } : null;
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
  mlpPoint = null, // canonical MLP point (green dot)
  heightM = 2.4,  // room height for overhead z-fix
  widthM = null,  // room width for volume-based room support
  lengthM = null, // room length for volume-based room support
}) {
  const metricsMap = new Map();
  
  if (!Array.isArray(seats) || !Array.isArray(placedSpeakers)) {
    return metricsMap;
  }

  const roomHeightM = Number.isFinite(Number(heightM)) ? Number(heightM) : 2.4;
  const roomWidthM  = Number.isFinite(Number(widthM))  ? Number(widthM)  : null;
  const roomLengthM = Number.isFinite(Number(lengthM)) ? Number(lengthM) : null;
  // Room volume used for small bounded in-room support approximation
  const roomVolumeM3 = (Number.isFinite(roomWidthM) && Number.isFinite(roomLengthM) && Number.isFinite(roomHeightM))
    ? roomWidthM * roomLengthM * roomHeightM
    : null;

  // NEW: Add synthetic "mlp" seat if mlpPoint is provided
  let seatsToProcess = [...seats];
  if (mlpPoint && Number.isFinite(mlpPoint.x) && Number.isFinite(mlpPoint.y)) {
    seatsToProcess.push({
      id: "mlp",
      x: mlpPoint.x,
      y: mlpPoint.y,
      z: mlpPoint.z || 1.2,
      isPrimary: false, // This is NOT a real seat
      __isSyntheticMLP: true,
    });
  }

  // Role categorization (same for all speaker types)
  const screenRoles = new Set(['FL', 'FC', 'FR']);
  const surroundRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
  
  // Generic overhead detector - ANY role starting with "T"
  const isOverheadRole = (role) => {
    const canon = getCanonicalRole(role);
    return canon.startsWith('T'); // TFL, TFR, TML, TMR, TRL, TRR, TL, TR, TBL, TBR, TFC, TRC, TBC...
  };

  // Filter speakers with valid positions AND real models
  const hasPos = (s) =>
    s?.position &&
    Number.isFinite(s.position.x) &&
    Number.isFinite(s.position.y);

  const hasRealModel = (s) => {
    const ms = String(s?.model ?? "").trim().toLowerCase();
    return !!ms && ms !== "off" && ms !== "none";
  };

  // SPL METRICS MUST NOT RUN ON "EXPECTED BY LAYOUT" SPEAKERS.
  // REAL MODEL IS REQUIRED.
  const placedLCR = placedSpeakers.filter(
    (s) => hasPos(s) && hasRealModel(s) && screenRoles.has(getCanonicalRole(s.role))
  );
  const placedSur = placedSpeakers.filter(
    (s) => hasPos(s) && hasRealModel(s) && surroundRoles.has(getCanonicalRole(s.role))
  );
  const placedOH = placedSpeakers.filter(
    (s) => hasPos(s) && hasRealModel(s) && isOverheadRole(s.role)
  );

  // Integrated LCR soundbars are stored as one physical FC speaker.
  // For SPL/RP22 reporting only, expose virtual FL/FC/FR screen-channel entries.
  const isIntegratedLcr = (() => {
    if (placedLCR.length !== 1) return false;
    const fc = placedLCR[0];
    if (getCanonicalRole(fc.role) !== 'FC') return false;
    const meta = getModelDimsM(fc.model);
    return meta?.frontStageType === 'integrated_lcr';
  })();

  const screenSpeakersForSpl = isIntegratedLcr
    ? (() => {
        const fc = placedLCR[0];
        const baseId = fc.id || 'FC';
        return [
          { ...fc, role: 'FL', id: `${baseId}__virtual_FL`, virtualFromIntegratedLcr: true },
          { ...fc, role: 'FC', id: `${baseId}__virtual_FC`, virtualFromIntegratedLcr: true },
          { ...fc, role: 'FR', id: `${baseId}__virtual_FR`, virtualFromIntegratedLcr: true },
        ];
      })()
    : placedLCR;

  // Process each seat (including synthetic MLP)
  for (const seat of seatsToProcess) {
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

        // --- Overhead SPL must always assume ceiling mount height ---
        // Do NOT trust spk.position.z for overheads (often missing/0/legacy).
        const canonRole = getCanonicalRole(spk.role);
        const isOverhead = String(canonRole).startsWith('T');

        const speakerPosForSpl = isOverhead
          ? { ...spk.position, z: roomHeightM }
          : spk.position;

        // Calculate SPL using UNIFIED logic with 1m capability cap
        const splResult = calculateSplAtPoint({
          speakerPos: speakerPosForSpl,
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
          // Room volume for bounded in-room support approximation
          roomVolumeM3,
        });

        const splValue = splResult?.spl ?? null;
        const splTheoretical = splResult?.spl_theoretical ?? null;

        if (Number.isFinite(splValue)) {
          spl[categoryKey][role] = {
            value: splValue,
            formatted: `${splValue.toFixed(1)} dB`,
            theoretical: Number.isFinite(splTheoretical) ? splTheoretical : null,
            debug: {
              ...(splResult?.debug || {}),
              role: spk.role,
              canonicalRole: role,
            },
          };
        }
      }
    };

    // Process all speaker categories with unified logic
    processSpeakers(screenSpeakersForSpl, 'screen');
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

  // Build effective metadata — prefer canonical anechoic registry fields first
  const effectiveMeta = {
    sensitivity_db_1w_1m: safeNum(resolvedMeta?.sensitivity_db_1w_1m || resolvedMeta?.sensitivity) || 87,
    power_handling_w: safeNum(resolvedMeta?.power_handling_w || resolvedMeta?.max_power) || Infinity,
    // Continuous cap: canonical anechoic → legacy cont → legacy max_spl
    max_spl_cont_db_1m: safeNum(resolvedMeta?.max_spl_cont_db_1m_anechoic) ||
                        safeNum(resolvedMeta?.max_spl_cont_db_1m) ||
                        safeNum(resolvedMeta?.max_spl) || null,
    // Peak cap: canonical anechoic → legacy CF6 → legacy peak_spl
    max_spl_peak_db_cf6_1m: safeNum(resolvedMeta?.max_spl_peak_db_cf6_1m_anechoic) ||
                            safeNum(resolvedMeta?.max_spl_peak_db_cf6_1m) ||
                            safeNum(resolvedMeta?.peak_spl) || null,
    // Flag: true when peak is already on anechoic basis — prevents double -6 dB
    peak_is_anechoic: !!(resolvedMeta?.max_spl_peak_db_cf6_1m_anechoic != null),
  };

  // Dev-only warning if canonical anechoic fields are absent
  if (speakerModelId && !resolvedMeta?.max_spl_cont_db_1m_anechoic && !resolvedMeta?.max_spl_peak_db_cf6_1m_anechoic) {
    const warnKey = `__splWarn_${speakerModelId}`;
    if (!globalThis[warnKey]) {
      globalThis[warnKey] = true;
      console.warn(`[SPL] No canonical anechoic SPL fields for model: ${speakerModelId}`);
    }
  }
  
  // Console log for sanity check
  if (speakerModelId && distance_m && powerW) {
    console.log(`[centralSplEngine] Computing SPL for ${speakerModelId}: distance=${distance_m.toFixed(2)}m, power=${Math.round(powerW)}W, radiationMode=${radiationMode}`);
  }

  // 2. Resolve effective sensitivity with radiation mode adjustment
  const effectiveSensitivity = resolveEffectiveSensitivity(effectiveMeta, { radiationMode });

  // 3. Compute continuous SPL @ 1m (with hard cap)
  const { spl1m_capability: spl1m_cont } = getSPL1mCapability(effectiveMeta, powerW, effectiveSensitivity);

  // 4. Peak SPL @ 1m (CF6) - direct from spec, not amp-limited
  // Only apply -6 dB anechoic correction if the field is NOT already canonical anechoic.
  let spl1m_peak = effectiveMeta.max_spl_peak_db_cf6_1m;
  if (spl1m_peak !== null && !effectiveMeta.peak_is_anechoic) {
    spl1m_peak -= 6; // Only for legacy non-anechoic fields
  }

  // 5. Distance loss (simple 1D for calculator context)
  const d = (Number.isFinite(distance_m) && distance_m > 0) ? distance_m : 0;
  const speakerForBenefit = { id: speakerModelId, model: speakerModelId, isLineSource: resolvedMeta?.isLineSource, heightM: resolvedMeta?.heightM };
  const lineBenefit = quasiLineBenefitDb(d, speakerForBenefit); // 0..2 dB, only for Q + Evolve 6-3/8-4
  const distanceLoss = (d > 0 ? (20 * Math.log10(d)) : 0) - lineBenefit;

  // 6. Apply losses to continuous SPL
  const spl_continuous_db_at_seat = Number.isFinite(spl1m_cont)
    ? spl1m_cont - distanceLoss - (screenLoss_dB || 0) - (eqHeadroom_dB || 0)
    : null;

  // 7. Apply losses to peak SPL (no EQ headroom on peak)
  const spl_peak_cf6_db_at_seat = Number.isFinite(spl1m_peak)
    ? spl1m_peak - distanceLoss - (screenLoss_dB || 0)
    : null;

  // Console log for sanity check
  if (speakerModelId) {
    console.log(`[centralSplEngine] ${speakerModelId} @ ${distance_m.toFixed(2)}m: continuous=${spl_continuous_db_at_seat?.toFixed(1)}dB, peak=${spl_peak_cf6_db_at_seat?.toFixed(1)}dB (1m_cont=${spl1m_cont?.toFixed(1)}dB, 1m_peak=${spl1m_peak?.toFixed(1)}dB, sens_eff=${effectiveSensitivity?.toFixed(1)}dB)`);
  }

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