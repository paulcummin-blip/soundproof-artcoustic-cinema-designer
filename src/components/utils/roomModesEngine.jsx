// roomModesEngine.js
// REW-parity room modes calculator for bass response
// Uses rectangular room normal modes with source/receiver spatial coupling

const SPEED_OF_SOUND = 343; // m/s

/**
 * Compute room modes response (axial, tangential, oblique)
 * Returns frequency response based on room geometry and positions
 */
export function computeRoomModesResponse({
  roomDims,
  sourcePositions = [],
  seatPosition,
  fMin = 15,
  fMax = 200,
  pointsPerOct = 24,
  modeLimitHz = 200,
  q = 35,
  includeAxial = true,
  includeTangential = false,
  includeOblique = false,
  c = SPEED_OF_SOUND,
  rewParityMode = true,
  smoothing = 'none',
  subFloorHeight = 0.0,
  normalizeBandHz = [30, 80],
  normalizeToDb = 80,
  relativeViewEnabled = false,
  surfaceAbsorption = {
    front: 0.30,
    back: 0.30,
    left: 0.30,
    right: 0.30,
    ceiling: 0.30,
    floor: 0.30,
  },
  dampingScalar = 1.0,
  leakage = 0.0,
  subProductCurves = null,
  absoluteSplMode = false,
}) {
  // Validate inputs
  if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [], modeCount: 0 } };
  }
  
  if (!seatPosition || typeof seatPosition.x !== 'number' || typeof seatPosition.y !== 'number') {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [], modeCount: 0 } };
  }

  // DEBUG (off by default)
  // To enable in preview: run in browser console once: globalThis.__B44_BASS_DEBUG = true
  const __debugBass = !!globalThis.__B44_BASS_DEBUG;
  
  // DIAGNOSTIC: Source position sensitivity test
  const DIAG_POS = Boolean(globalThis.__B44_BASS_DIAG_POS);

  // Probe frequencies we care about
  const __probeFreqs = [20, 25, 30, 34, 36, 38, 40, 42, 45];

  // Helper: treat 0.5 Hz step as exact bin lookup
  const __isProbeFreq = (f) => __probeFreqs.includes(Math.round(f));

  // Collected probe rows (pre-smoothing + post-smoothing + final)
  const __probeRows = __debugBass ? [] : null;
  
  // Source signature helper (for diagnostics)
  const sourceSig = (sources = []) =>
    sources
      .map(s => {
        const x = Number(s?.x ?? 0);
        const y = Number(s?.y ?? 0);
        const z = Number(s?.z ?? 0);
        return `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      })
      .join(" | ");
  
  // Mirror sources helper (for sensitivity testing)
  const mirrorSources = (sources = [], roomDims) => {
    const W = Number(roomDims?.widthM);
    const L = Number(roomDims?.lengthM);
    return sources.map(s => {
      const x = Number(s?.x ?? 0);
      const y = Number(s?.y ?? 0);
      const z = Number(s?.z ?? 0);
      return { ...s, x: (W - x), y: (L - y), z };
    });
  };
  
  // --- Local copies only (never mutate inputs passed in) ---
  let includeAxialLocal = includeAxial;
  let includeTangentialLocal = includeTangential;
  let includeObliqueLocal = includeOblique;

  if (rewParityMode) {
    includeAxialLocal = true;
    includeTangentialLocal = true;
    includeObliqueLocal = true;
  }

  // Build a local sources array (never reassign/mutate caller sourcePositions)
  let sources = Array.isArray(sourcePositions) ? sourcePositions : [];

  if (sources.length === 0) {
    sources = [{
      x: roomDims.widthM / 2,
      y: 0.2,
      z: rewParityMode ? subFloorHeight : 0.2,
    }];
  } else if (rewParityMode) {
    // Force subs to floor in REW parity mode (new objects only)
    sources = sources.map(src => ({
      ...src,
      z: subFloorHeight,
    }));
  }

  // If there is NO product curve, we never want "absolute SPL" behaviour.
  // Generic view should be normalised to a sensible reference level.
  const hasProductCurves =
    !!(subProductCurves && Array.isArray(subProductCurves) && subProductCurves.length > 0);

  if (!hasProductCurves) {
    absoluteSplMode = false;
  }
  
  const { widthM, lengthM, heightM } = roomDims;
  const volume = widthM * lengthM * heightM;
  
  // Compute Schroeder frequency
  const rt60 = 0.4;
  const schroederHz = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 80;
  
  // Generate frequency axis (linear for REW parity)
  const freqs = rewParityMode 
    ? generateLinearFrequencyAxis(fMin, fMax, 0.5) // 0.5 Hz steps for modal detail
    : generateLogFrequencyAxis(fMin, fMax, pointsPerOct);
  
  // Compute room modes
  const modes = computeRoomModes({
    widthM,
    lengthM,
    heightM,
    fMax: modeLimitHz,
    c,
    includeAxial: includeAxialLocal,
    includeTangential: includeTangentialLocal,
    includeOblique: includeObliqueLocal
  });

  // Lowest axial mode (used for sealed-room pressure behaviour)
  const lowestAxial = modes.find(m => m.type === "axial")?.freq || null;
  
  // Pressure-region support flag (DISABLED for REW parity - causes false LF boost)
  const pressureEnabled = false;
  const kDbPerOct = 0; // REW mode: no artificial room gain below lowest axial
  const maxPressureGainDb = 0; // Capped to prevent LF explosion
  
  // SOURCE CALIBRATION (applied upstream, not after summation)
  // REW reference: 1 sub @ 1m in half-space ≈ 90 dB at 50 Hz
  const numSubs = sources.length;
  const avgDistance = 3.5; // Typical MLP distance in meters
  const subSensitivity = 90; // Typical subwoofer 1W/1m (dB)
  
  // Distance loss: -20*log10(d)
  const distanceLoss = 20 * Math.log10(avgDistance);
  
  // Multi-sub gain: +3 dB per doubling (coherent summation at modal frequencies)
  const multiSubGain = 10 * Math.log10(numSubs);
  
  // Boundary gain: +3 dB for half-space (floor loading)
  const boundaryGain = 3;
  
  // Source calibration offset (applied to modal sum, not result)
  const sourceCalibrationDb = rewParityMode 
    ? (subSensitivity - distanceLoss + multiSubGain + boundaryGain)
    : 0;

  // LF debugging stats collectors
  const lfDebug = {
    directMag15_45: [],
    modalMag15_45: [],
    blendedMag15_45: []
  };

  // --- B44: modal coupling sanity (single mode 1,0,0) ---
  const __b44Clamp01 = (t) => Math.max(0, Math.min(1, t));
  const __b44Seat = seatPosition || { x: 0, y: 0, z: 0 };
  const __b44Src = (Array.isArray(sources) && sources[0]) ? sources[0] : { x: 0, y: 0, z: 0 };

  // normalised 0..1
  const __sx = __b44Clamp01((__b44Seat.x || 0) / (widthM || 1));
  const __sy = __b44Clamp01((__b44Seat.y || 0) / (lengthM || 1));
  const __sz = __b44Clamp01((__b44Seat.z || 0) / (heightM || 1));

  const __qx = __b44Clamp01((__b44Src.x || 0) / (widthM || 1));
  const __qy = __b44Clamp01((__b44Src.y || 0) / (lengthM || 1));
  const __qz = __b44Clamp01((__b44Src.z || 0) / (heightM || 1));

  // Mode (1,0,0): cos(pi*x) along width, constant along others
  const __seatShape_100 = Math.cos(Math.PI * 1 * __sx);
  const __srcShape_100  = Math.cos(Math.PI * 1 * __qx);
  const __coupling_100  = __seatShape_100 * __srcShape_100;

  // Expose live values (do not spam console)
  const __b44ModeCouplingSanity = {
    seatM: { x: __b44Seat.x, y: __b44Seat.y, z: __b44Seat.z },
    srcM:  { x: __b44Src.x,  y: __b44Src.y,  z: __b44Src.z  },
    normSeat: { x: __sx, y: __sy, z: __sz },
    normSrc:  { x: __qx, y: __qy, z: __qz },
    seatShape_100: __seatShape_100,
    srcShape_100: __srcShape_100,
    coupling_100: __coupling_100,
  };

  // Extract computation into runOnce for diagnostic double-run
  const runOnce = (sourcesOverride) => {
    const sourcesUsed = sourcesOverride ?? sources;

  // Build response: complex pressure sum with direct/modal blending
  let splDb = freqs.map((f, i) => {
    // 1. DIRECT-FIELD COMPLEX SUM (geometry-dependent, no modal filtering)
    let sumRe_direct = 0;
    let sumIm_direct = 0;

    for (let subIdx = 0; subIdx < sourcesUsed.length; subIdx++) {
      const source = sourcesUsed[subIdx];

      // Distance to seat
      const dx = source.x - seatPosition.x;
      const dy = source.y - seatPosition.y;
      const dz = (source.z ?? 0.0) - (seatPosition.z ?? 1.2);
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz);

      // Pure geometry/phase term only (no absolute SPL reference)
      const amplitude = 1 / Math.max(0.5, d);

      // Apply sub's product response if provided
      let productGainLinear = 1.0;
      if (subProductCurves && subProductCurves[subIdx]) {
        const curveDb = subProductCurves[subIdx][i];
        if (Number.isFinite(curveDb)) {
          productGainLinear = Math.pow(10, curveDb / 20);
        }
      }

      // Apply sub tuning (gain, delay, polarity)
      const subTuning = source.tuning || { gainDb: 0, delayMs: 0, polarity: 0 };
      const gainLinear = Math.pow(10, subTuning.gainDb / 20) * productGainLinear;

      // Generic (room-only) sub magnitude shaping:
      // When no product curve is supplied, stay flat (no artificial roll-off)
      let genericDb = 0;
      const genericLinear = 1.0;

      // Phase: propagation + delay + polarity
      let phi = -2 * Math.PI * f * (d / SPEED_OF_SOUND);
      phi += -2 * Math.PI * f * (subTuning.delayMs / 1000);
      if (subTuning.polarity === 180 || subTuning.polarity === 'invert') {
        phi += Math.PI;
      }

      // Complex contribution
      const finalAmplitude = amplitude * gainLinear * genericLinear;
      sumRe_direct += finalAmplitude * Math.cos(phi);
      sumIm_direct += finalAmplitude * Math.sin(phi);
    }

    // 2. MODAL COMPLEX SUM (existing logic unchanged)
    let sumRe_modal = 0;
    let sumIm_modal = 0;

    for (const mode of modes) {
      const f0 = mode.freq;
      if (!(f0 > 0)) continue;

      // Compute modal Q
      const qMode = estimateModeQ({
        mode,
        roomDims,
        surfaceAbsorption,
        dampingScalar,
        leakage,
        f0,
      });

      const bandwidth = f0 / qMode;
      const df = Math.abs(f - f0);
      if (df > 5 * bandwidth && df > 20) continue;

      // Complex pressure contribution per sub
      for (let subIdx = 0; subIdx < sourcesUsed.length; subIdx++) {
        const source = sourcesUsed[subIdx];

        // Spatial coupling (signed, preserves phase)
        const coupling = computeSpatialCoupling(mode, source, seatPosition, roomDims);
        if (Math.abs(coupling) < 1e-6) continue;

        // Apply sub's product response if provided (frequency-dependent gain)
        let productGainLinear = 1.0;
        if (subProductCurves && subProductCurves[subIdx]) {
          const curveDb = subProductCurves[subIdx][i];
          if (Number.isFinite(curveDb)) {
            productGainLinear = Math.pow(10, curveDb / 20);
          }
        }

        // Apply sub tuning (gain, delay, polarity)
        const subTuning = source.tuning || { gainDb: 0, delayMs: 0, polarity: 0 };
        const gainLinear = Math.pow(10, subTuning.gainDb / 20) * productGainLinear;
        const delayPhase = -2 * Math.PI * f * (subTuning.delayMs / 1000);
        const polarityPhase = (subTuning.polarity === 180 || subTuning.polarity === 'invert') ? Math.PI : 0;
        const totalPhase = delayPhase + polarityPhase;

        // Generic (room-only) sub magnitude shaping:
        // When no product curve is supplied, stay flat (no artificial roll-off)
        let genericDb = 0;
        const genericLinear = 1.0;

        // Complex weight for this sub
        const weightRe = gainLinear * genericLinear * Math.cos(totalPhase);
        const weightIm = gainLinear * genericLinear * Math.sin(totalPhase);

        // Second-order resonator (dimensionless, REW-style behaviour)
        // Use normalised form so numbers don't explode/shrink with Hz^2 scaling.
        // H(f) = 1 / ( (1 - (f/f0)^2) + j*(f/(f0*Q)) )
        const r = f / Math.max(1e-6, f0);
        const re = (1 - r * r);
        const im = (r / Math.max(1e-6, qMode));
        const denom = (re * re + im * im);

        // Complex H
        let hRe = re / denom;
        let hIm = -im / denom;

        // Normalise peak so modes don't "lock" the first axial family unrealistically.
        // At resonance, |H| ~= Q, so divide by Q to keep peak ~ 1.
        hRe /= Math.max(1e-6, qMode);
        hIm /= Math.max(1e-6, qMode);

        // Weighted modal contribution: weight * H * coupling
        const cRe = coupling * (weightRe * hRe - weightIm * hIm);
        const cIm = coupling * (weightRe * hIm + weightIm * hRe);

        sumRe_modal += cRe;
        sumIm_modal += cIm;
      }
    }

    // 3. COMPLEX-DOMAIN CROSSFADE (with minimum modal contribution)
    const blendStartHz = lowestAxial * 0.7;
    const blendEndHz = lowestAxial;
    const minModalWeight = 0.15; // Keep modal field active even below lowest axial

    let w = minModalWeight; // Modal weight (never goes to pure direct)
    if (f >= blendEndHz) {
      w = 1.0;
    } else if (f >= blendStartHz) {
      w = minModalWeight + (1.0 - minModalWeight) * ((f - blendStartHz) / (blendEndHz - blendStartHz));
    }

    const modalScale = 6000;
    // Correct crossfade: as w rises, we move from direct -> modal
    const sumRe = (1 - w) * sumRe_direct + w * modalScale * sumRe_modal;
    const sumIm = (1 - w) * sumIm_direct + w * modalScale * sumIm_modal;

    // DEBUG: capture pre-smoothing component magnitudes for probe bins only
    if (__debugBass && __isProbeFreq(f)) {
      const directMag = Math.sqrt(sumRe_direct * sumRe_direct + sumIm_direct * sumIm_direct);
      const modalMag = Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal);
      const scaledModalMag = Math.sqrt(
        (modalScale * sumRe_modal) * (modalScale * sumRe_modal) +
        (modalScale * sumIm_modal) * (modalScale * sumIm_modal)
      );
      const blendedMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

      const toDb = (x) => 20 * Math.log10(Math.max(Number.EPSILON, x));

      __probeRows.push({
        fProbe: f,
        idx: i,
        binHz: Number(freqs[i].toFixed(2)),
        w: Number.isFinite(w) ? Number(w.toFixed(3)) : w,
        directMagDb_pre: Number(toDb(directMag).toFixed(2)),
        modalMagDb_pre: Number(toDb(modalMag).toFixed(2)),
        scaledModalMagDb_pre: Number(toDb(scaledModalMag).toFixed(2)),
        blendedMagDb_pre: Number(toDb(blendedMag).toFixed(2)),
        splDb_postSmooth: null,
        finalDb: null,
      });
    }

    // LF debugging: capture magnitudes before calibration in 15-45 Hz band
    if (f >= 15 && f <= 45) {
      const directMag = Math.sqrt(sumRe_direct * sumRe_direct + sumIm_direct * sumIm_direct);
      const modalMag = Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal);
      const blendedMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
      
      lfDebug.directMag15_45.push(20 * Math.log10(Math.max(Number.EPSILON, directMag)));
      lfDebug.modalMag15_45.push(20 * Math.log10(Math.max(Number.EPSILON, modalMag)));
      lfDebug.blendedMag15_45.push(20 * Math.log10(Math.max(Number.EPSILON, blendedMag)));
    }

    // Avoid flattening the LF response: use a much smaller epsilon than 1e-12
    // so tiny geometry/phase variations are not quantised into a fixed shelf.
    const mag = Math.max(Number.EPSILON, Math.sqrt(sumRe * sumRe + sumIm * sumIm));

    // Magnitude -> dB (calibration applied later in absoluteSplMode stage)
    return 20 * Math.log10(mag);
  });
  
  return splDb;
  }; // End of runOnce

  // Run engine with normal sources
  const splDb = runOnce(null);

  // PRESSURE REGION SUPPORT: FULLY DISABLED (REW parity)
  // REW's Room Simulator does not apply artificial pressure-zone boost
  // Kept for future reference only - all gain values set to zero

    // Pressure region is now handled inline during modal summation
    // (No post-processing needed - losses already bypassed below lowest axial)

    // Schroeder blend: above fs, reduce explicit modal contrast (statistical smoothing feel)
    if (rewParityMode && schroederHz > 0) {
      splDb = splDb.map((db, i) => {
        const f = freqs[i];
        // Only apply above Schroeder frequency (never below lowest axial)
        if (f < schroederHz) return db;

        // Blend to a gently smoothed "statistical" curve (no wild modal spikes)
        const f2 = schroederHz * 1.6;
        const t = Math.max(0, Math.min(1, (f - schroederHz) / Math.max(1e-6, (f2 - schroederHz))));

        // Simple target: a mild downward tilt
        const target = dbAt(schroederHz, freqs, splDb) - 3 * Math.log2(f / schroederHz);

        return (1 - t) * db + t * target;
      });
    }

    // Capture RAW stats BEFORE any processing (critical for debugging)
  const rawFinite = splDb.filter(v => isFinite(v));
  const rawMin = rawFinite.length > 0 ? Math.min(...rawFinite) : 0;
  const rawMax = rawFinite.length > 0 ? Math.max(...rawFinite) : 0;
  const rawRange = rawMax - rawMin;

  // Clamp non-finite values before smoothing
  let nonFiniteRepaired = 0;
  let lastGoodValue = 0;
  for (let i = 0; i < splDb.length; i++) {
    if (!isFinite(splDb[i])) {
      splDb[i] = lastGoodValue;
      nonFiniteRepaired++;
    } else {
      lastGoodValue = splDb[i];
    }
  }

  // Capture pre-normalization stats (after repair, before smoothing/norm)
  const finitePreNorm = splDb.filter(v => isFinite(v));
  const preNormMin = finitePreNorm.length > 0 ? Math.min(...finitePreNorm) : 0;
  const preNormMax = finitePreNorm.length > 0 ? Math.max(...finitePreNorm) : 0;
  const preNormRange = preNormMax - preNormMin;

  // Apply smoothing if requested (post-process only)
  const smoothingApplied = smoothing !== 'none' ? smoothing : 'none';
  if (smoothing !== 'none') {
    splDb = applySmoothing(freqs, splDb, smoothing);
  }

  // DEBUG: record post-smoothing splDb at probe bins
  if (__debugBass && __probeRows && __probeRows.length) {
    for (const row of __probeRows) {
      const i = row.idx;
      if (i >= 0 && i < splDb.length) {
        row.splDb_postSmooth = Number.isFinite(splDb[i]) ? Number(splDb[i].toFixed(2)) : splDb[i];
      }
    }
  }
  
  // Track what processing was applied
  const calibrationApplied = rewParityMode;
  const calibrationOffset = sourceCalibrationDb;
  let actualNormBand = normalizeBandHz;

  // Capture post-normalization stats
  const finitePostNorm = splDb.filter(v => isFinite(v));
  const postNormMin = finitePostNorm.length > 0 ? Math.min(...finitePostNorm) : 0;
  const postNormMax = finitePostNorm.length > 0 ? Math.max(...finitePostNorm) : 0;
  const postNormRange = postNormMax - postNormMin;
  
  // Build detailed mode markers for visualization
  const modeMarkers = modes.map(m => {
    let axisLabel = null;
    if (m.type === 'axial') {
      if (m.nx > 0 && m.ny === 0 && m.nz === 0) axisLabel = 'W';
      else if (m.ny > 0 && m.nx === 0 && m.nz === 0) axisLabel = 'L';
      else if (m.nz > 0 && m.nx === 0 && m.ny === 0) axisLabel = 'H';
    }
    
    return {
      fHz: m.freq,
      family: m.type,
      axisLabel,
      n: [m.nx, m.ny, m.nz]
    };
  });
  
  // Mode markers (axial only for basic display)
  const modeMarkersHz = modes
    .filter(m => m.type === 'axial')
    .map(m => m.freq)
    .sort((a, b) => a - b);
  
  // Count by type
  const axialCount = modes.filter(m => m.type === 'axial').length;
  const tangentialCount = modes.filter(m => m.type === 'tangential').length;
  const obliqueCount = modes.filter(m => m.type === 'oblique').length;
  
  // First ten modes for debug
  const firstTenModeHz = modes.slice(0, 10).map(m => m.freq.toFixed(1));
  
  // Compute Q mapping for debug
  const qBase = dampingScalar * 20;
  const qMappingText = `Q base: ${qBase.toFixed(1)} (slider=${dampingScalar.toFixed(2)})`;
  
  // Compute LF delta for debug (20-30 Hz flatness check)
  let lfDeltaDb_20_30 = null;
  if (rewParityMode && freqs.length > 0) {
    const idx20 = freqs.findIndex(f => f >= 20);
    const idx30 = freqs.findIndex(f => f >= 30);
    if (idx20 >= 0 && idx30 >= 0) {
      lfDeltaDb_20_30 = splDb[idx30] - splDb[idx20];
    }
  }

  // Compute SPL stats before absolute calibration
  const finiteBeforeCal = splDb.filter(v => isFinite(v));
  const splMinBeforeDb = finiteBeforeCal.length > 0 ? Math.min(...finiteBeforeCal) : 0;
  const splMaxBeforeDb = finiteBeforeCal.length > 0 ? Math.max(...finiteBeforeCal) : 0;

  // Build FINAL curve pipeline (single source of truth)
  let finalDb = [...splDb];
  
  // Step 1: Apply absolute SPL calibration if requested
  let absoluteSplApplied = false;
  if (absoluteSplMode && Number.isFinite(calibrationOffset) && calibrationOffset !== 0) {
    finalDb = finalDb.map(v => v + calibrationOffset);
    absoluteSplApplied = true;
  }
  
  // Step 2: Apply relative normalization if requested (30-80 Hz band)
  // REW-style: use MEDIAN of band for robustness against nulls
  let normAppliedActual = false;
  let normRefDb = 0;
  if (!absoluteSplMode && normalizeBandHz && Array.isArray(normalizeBandHz) && normalizeBandHz.length === 2) {
    const [fMin, fMax] = normalizeBandHz;
    const bandValues = freqs
      .map((f, i) => f >= fMin && f <= fMax && isFinite(finalDb[i]) ? finalDb[i] : null)
      .filter(v => v !== null);
    
    if (bandValues.length >= 10) {
      // Use MEDIAN instead of MEAN (more REW-like, robust to nulls)
      const sorted = [...bandValues].sort((a, b) => a - b);
      normRefDb = sorted[Math.floor(sorted.length / 2)];
      const targetDb = Number.isFinite(normalizeToDb) ? normalizeToDb : 80;
      finalDb = finalDb.map(v => (isFinite(v) ? (v - normRefDb + targetDb) : v));
      normAppliedActual = true;
    }
  }

  // DEBUG: record finalDb + print a single forensic table
  if (__debugBass && __probeRows && __probeRows.length) {
    for (const row of __probeRows) {
      const i = row.idx;
      if (i >= 0 && i < finalDb.length) {
        row.finalDb = Number.isFinite(finalDb[i]) ? Number(finalDb[i].toFixed(2)) : finalDb[i];
      }
    }

    const lowest = Number.isFinite(lowestAxial) ? Number(lowestAxial.toFixed(2)) : lowestAxial;
    const blendStart = Number.isFinite(lowestAxial) ? Number((lowestAxial * 0.7).toFixed(2)) : null;
    const blendEnd = Number.isFinite(lowestAxial) ? Number(lowestAxial.toFixed(2)) : null;

    console.log("B44_BASS_DEBUG_RUN", {
      roomDims,
      seatPosition,
      sourceCount: sourcePositions?.length || 0,
      lowestAxialHz: lowest,
      blendStartHz: blendStart,
      blendEndHz: blendEnd,
      smoothing,
      normalizeBandHz,
      normalizeToDb,
      absoluteSplMode,
      rewParityMode
    });

    // Sort by frequency, print as table
    const rows = [...__probeRows].sort((a, b) => a.binHz - b.binHz);
    console.table(rows);
  }

  // Build lfProbeRaw from __probeRows (for variation testing)
  let lfProbeRaw = null;
  if (__debugBass && __probeRows && __probeRows.length) {
    lfProbeRaw = [...__probeRows]
      .sort((a, b) => a.fProbe - b.fProbe)
      .map(row => ({
        freq: row.fProbe,
        blendedMagDb_pre: row.blendedMagDb_pre,
        w: row.w,
        directMagDb_pre: row.directMagDb_pre,
        scaledModalMagDb_pre: row.scaledModalMagDb_pre
      }));
  }

  // Compute seat node check (for diagnosing mode suppression)
  let seatNodeCheck = null;
  if (__debugBass) {
    const tol = 0.01; // 1 cm tolerance
    const seatX_frac = seatPosition.x / widthM;
    const seatY_frac = seatPosition.y / lengthM;
    const seatZ_frac = seatPosition.z / heightM;

    const widthOddModesSuppressed = Math.abs(seatPosition.x - widthM / 2) < tol;
    const lengthOddModesSuppressed = Math.abs(seatPosition.y - lengthM / 2) < tol;
    const heightOddModesSuppressed = Math.abs(seatPosition.z - heightM / 2) < tol;

    seatNodeCheck = {
      seatX_frac: Number(seatX_frac.toFixed(3)),
      seatY_frac: Number(seatY_frac.toFixed(3)),
      seatZ_frac: Number(seatZ_frac.toFixed(3)),
      widthOddModesSuppressed,
      lengthOddModesSuppressed,
      heightOddModesSuppressed
    };
  }

  // Compute final SPL stats after all processing
  const finalFinite = finalDb.filter(v => isFinite(v));
  const splMinDb = finalFinite.length > 0 ? Math.min(...finalFinite) : 0;
  const splMaxDb = finalFinite.length > 0 ? Math.max(...finalFinite) : 0;
  const splRangeDb = splMaxDb - splMinDb;

  // Product curve stats (if applied)
  let productCurveStats = null;
  if (subProductCurves && Array.isArray(subProductCurves)) {
    productCurveStats = subProductCurves.map((curve, idx) => {
      if (!curve || !Array.isArray(curve)) return null;
      
      const finite = curve.filter(v => Number.isFinite(v));
      if (finite.length === 0) return null;
      
      const minDb = Math.min(...finite);
      const maxDb = Math.max(...finite);
      
      // Find value at ~50 Hz
      const idx50 = freqs.findIndex(f => f >= 50);
      const at50Hz = (idx50 >= 0 && Number.isFinite(curve[idx50])) ? curve[idx50] : null;
      
      return {
        subIndex: idx,
        productMinDb: minDb.toFixed(1),
        productMaxDb: maxDb.toFixed(1),
        productAt50HzDb: at50Hz !== null ? at50Hz.toFixed(1) : 'N/A'
      };
    }).filter(s => s !== null);
  }

  // Compute LF debug stats
  const directMagMin = lfDebug.directMag15_45.length > 0 ? Math.min(...lfDebug.directMag15_45).toFixed(1) : 'N/A';
  const directMagMax = lfDebug.directMag15_45.length > 0 ? Math.max(...lfDebug.directMag15_45).toFixed(1) : 'N/A';
  const modalMagMin = lfDebug.modalMag15_45.length > 0 ? Math.min(...lfDebug.modalMag15_45).toFixed(1) : 'N/A';
  const modalMagMax = lfDebug.modalMag15_45.length > 0 ? Math.max(...lfDebug.modalMag15_45).toFixed(1) : 'N/A';
  const blendedMagMin = lfDebug.blendedMag15_45.length > 0 ? Math.min(...lfDebug.blendedMag15_45).toFixed(1) : 'N/A';
  const blendedMagMax = lfDebug.blendedMag15_45.length > 0 ? Math.max(...lfDebug.blendedMag15_45).toFixed(1) : 'N/A';

  // LF PROBE: detailed frequency-by-frequency audit using FINAL curve
  const probeFreqs = [20, 25, 30, 34, 36, 38, 40, 42, 45];
  const lfProbe = probeFreqs.map(fProbe => {
    const idx = freqs.findIndex(f => Math.abs(f - fProbe) < 0.6);
    if (idx < 0) return { freq: fProbe, error: 'not found' };
    
    const rawDbBeforeCal = splDb[idx]; // Before any calibration
    const finalDbValue = finalDb[idx]; // After all processing (calibration + normalization)
    
    // Pressure gain is always 0 (disabled)
    const pressureGainDb = 0;
    
    return {
      freq: fProbe,
      rawDbBeforeCal: rawDbBeforeCal.toFixed(2),
      finalDbAfterCal: finalDbValue.toFixed(2),
      pressureGainDb: pressureGainDb.toFixed(2),
      belowLowestAxial: lowestAxial && fProbe < lowestAxial
    };
  });
  
  // LF sanity check: 20 Hz should NOT be hotter than 30 Hz in generic sub mode
  const idx20 = freqs.findIndex(f => Math.abs(f - 20) < 0.6);
  const idx30 = freqs.findIndex(f => Math.abs(f - 30) < 0.6);
  let lfSanityCheck = 'N/A';
  if (idx20 >= 0 && idx30 >= 0 && !subProductCurves) {
    const spl20 = splDb[idx20];
    const spl30 = splDb[idx30];
    const delta = spl20 - spl30;
    lfSanityCheck = delta > 6 ? `FAIL: 20Hz is ${delta.toFixed(1)}dB above 30Hz (generic sub should roll off)` : 'PASS';
  }

  // Build source/seat signatures for dependency tracking
  const sourceCountUsed = sources.length;
  const sourcePositionsUsed = sources.slice(0, 3).map(s => ({
    x: Number(s.x).toFixed(2),
    y: Number(s.y).toFixed(2),
    z: Number(s.z || 0).toFixed(2)
  }));

  const sourceSigUsed = sources.map(s => 
    `${s.x.toFixed(2)}_${s.y.toFixed(2)}_${(s.z||0).toFixed(2)}_g${(s.tuning?.gainDb||0).toFixed(1)}_d${(s.tuning?.delayMs||0).toFixed(1)}_p${s.tuning?.polarity||'normal'}`
  ).join('|');

  const seatSigUsed = `${seatPosition.x.toFixed(2)}_${seatPosition.y.toFixed(2)}_${(seatPosition.z||1.2).toFixed(2)}`;

  // Build base return object (all fresh arrays/objects to avoid frozen mutations)
  const baseReturn = {
    freqs: [...freqs],
    splDb: [...finalDb],
    debug: {
      schroederHz,
      modeMarkersHz: [...modeMarkersHz],
      modeMarkers: modeMarkers.map(m => ({ ...m, n: [...m.n] })),
      modeCount: modes.length,
      axialCount,
      tangentialCount,
      obliqueCount,
      firstTenModeHz: [...firstTenModeHz],
      lowestAxialHz: lowestAxial,
      blendStartHz: lowestAxial * 0.7,
      blendEndHz: lowestAxial,
      qBase: qBase.toFixed(1),
      qMappingText,
      absoluteMode: absoluteSplMode,
      calibrationApplied,
      normBandHz: actualNormBand,
      normApplied: normAppliedActual,
      normRefDb: normAppliedActual ? normRefDb.toFixed(2) : 'N/A',
      smoothingApplied,
      nonFiniteRepaired,
      rawRange: rawRange.toFixed(2),
      preNormRange: preNormRange.toFixed(2),
      postNormRange: postNormRange.toFixed(2),
      productCurvesApplied: !!subProductCurves,
      absoluteSplMode,
      normalizeBandHz: actualNormBand,
      pressureEnabled: false,
      pressureThresholdHz: null,
      pressureRegion: null,
      lfDeltaDb_20_30: lfDeltaDb_20_30 !== null ? lfDeltaDb_20_30.toFixed(2) : 'N/A',
      splMinDb: splMinDb.toFixed(1),
      splMaxDb: splMaxDb.toFixed(1),
      splRangeDb: splRangeDb.toFixed(1),
      calibrationOffsetDb: Number.isFinite(calibrationOffset) ? calibrationOffset.toFixed(1) : 'N/A',
      splRangeBeforeDb: [splMinBeforeDb.toFixed(1), splMaxBeforeDb.toFixed(1)],
      splRangeAfterDb: [splMinDb.toFixed(1), splMaxDb.toFixed(1)],
      absoluteSplApplied,
      normalizeToDb: normalizeToDb !== undefined ? normalizeToDb : null,
      productCurveStats,
      directFieldUsesDb0: false,
      calibrationMode: absoluteSplMode ? "Absolute SPL" : "Relative (normalized)",
      sourceCountUsed,
      sourcePositionsUsed: [...sourcePositionsUsed],
      sourceSigUsed,
      seatSigUsed,
      lfDebug15_45Hz: {
        directMagDb: `${directMagMin} to ${directMagMax}`,
        modalMagDb: `${modalMagMin} to ${modalMagMax}`,
        blendedMagDb: `${blendedMagMin} to ${blendedMagMax}`,
        note: "Magnitudes before sourceCalibrationDb applied"
      },
      lfProbe: {
        probeFrequencies: probeFreqs,
        measurements: lfProbe,
        pressureRegionActive: false,
        pressureGainSettings: {
          kDbPerOct: '0.0',
          maxGainDb: '0.0',
          enabled: false
        },
        minModalWeight: 0.15,
        lowestAxialHz: lowestAxial,
        blendStartHz: lowestAxial ? (lowestAxial * 0.7).toFixed(1) : 'N/A',
        blendEndHz: lowestAxial ? lowestAxial.toFixed(1) : 'N/A',
        sourceCalibrationDb: sourceCalibrationDb.toFixed(2),
        absoluteSplMode,
        subProductCurvesPresent: !!(subProductCurves && Array.isArray(subProductCurves) && subProductCurves.length > 0),
        lfSanityCheck
      },
      lfProbeRaw: Array.isArray(lfProbeRaw) ? lfProbeRaw.map(r => ({ ...r })) : lfProbeRaw,
      seatNodeCheck: seatNodeCheck ? { ...seatNodeCheck } : null,
      modeCouplingSanity: __b44ModeCouplingSanity ? { 
        seatM: { ...__b44ModeCouplingSanity.seatM },
        srcM: { ...__b44ModeCouplingSanity.srcM },
        normSeat: { ...__b44ModeCouplingSanity.normSeat },
        normSrc: { ...__b44ModeCouplingSanity.normSrc },
        seatShape_100: __b44ModeCouplingSanity.seatShape_100,
        srcShape_100: __b44ModeCouplingSanity.srcShape_100,
        coupling_100: __b44ModeCouplingSanity.coupling_100,
      } : null
    }
  };

  // DIAGNOSTIC: Position sensitivity test (run engine twice with mirrored sources)
  if (DIAG_POS) {
    const mirrored = mirrorSources(sources, roomDims);
    const splDb2 = runOnce(mirrored);
    
    // Apply same post-processing to mirrored run for fair comparison
    let finalDb2 = [...splDb2];
    
    // Apply smoothing
    if (smoothing !== 'none') {
      finalDb2 = applySmoothing(freqs, finalDb2, smoothing);
    }
    
    // Apply calibration
    if (absoluteSplMode && Number.isFinite(calibrationOffset) && calibrationOffset !== 0) {
      finalDb2 = finalDb2.map(v => v + calibrationOffset);
    }
    
    // Apply normalization
    if (!absoluteSplMode && normalizeBandHz && Array.isArray(normalizeBandHz) && normalizeBandHz.length === 2) {
      const [fMin, fMax] = normalizeBandHz;
      const bandValues = freqs
        .map((f, i) => f >= fMin && f <= fMax && isFinite(finalDb2[i]) ? finalDb2[i] : null)
        .filter(v => v !== null);
      
      if (bandValues.length >= 10) {
        const sorted = [...bandValues].sort((a, b) => a - b);
        const normRefDb = sorted[Math.floor(sorted.length / 2)];
        const targetDb = Number.isFinite(normalizeToDb) ? normalizeToDb : 80;
        finalDb2 = finalDb2.map(v => (isFinite(v) ? (v - normRefDb + targetDb) : v));
      }
    }
    
    // Compare at LF probe frequencies
    const probeHz = [20, 25, 30, 34, 36, 38, 40, 42, 45];
    const idxFor = (hz, freqsArr) => {
      let bestI = -1, bestD = 1e9;
      for (let i = 0; i < freqsArr.length; i++) {
        const d = Math.abs(freqsArr[i] - hz);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      return bestI;
    };
    
    let maxDelta = 0;
    const rows = probeHz.map(hz => {
      const i1 = idxFor(hz, freqs);
      const a = i1 >= 0 ? finalDb[i1] : null;
      const b = i1 >= 0 ? finalDb2[i1] : null;
      const d = (typeof a === "number" && typeof b === "number") ? Math.abs(a - b) : null;
      if (typeof d === "number") maxDelta = Math.max(maxDelta, d);
      return { 
        hz, 
        normal: a !== null ? a.toFixed(2) : 'N/A', 
        mirrored: b !== null ? b.toFixed(2) : 'N/A', 
        delta: d !== null ? d.toFixed(3) : 'N/A' 
      };
    });
    
    if (typeof console !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed("[B44][POS DIAG] source-coupling sensitivity");
      console.log("SourceSig normal:", sourceSig(sources));
      console.log("SourceSig mirrored:", sourceSig(mirrored));
      console.table(rows);
      console.log("Max Δ(dB) across probes:", maxDelta.toFixed(3));
      if (maxDelta < 0.5) {
        console.warn("[B44][POS DIAG] ALERT: moving source had <0.5 dB effect at LF probes. Source coupling may be missing or stale.");
      }
      console.groupEnd();
    }

    // ✅ IMPORTANT: Return new object with posDiag, DO NOT mutate baseReturn
    return {
      ...baseReturn,
      debug: {
        ...(baseReturn.debug || {}),
        posDiag: { maxDeltaDb: maxDelta, rows }
      }
    };
  }

  return baseReturn;
}

/**
 * Generate linear frequency axis (REW default)
 */
function generateLinearFrequencyAxis(fMin, fMax, step) {
  const freqs = [];
  for (let f = fMin; f <= fMax; f += step) {
    freqs.push(f);
  }
  return freqs;
}

/**
 * Generate log-spaced frequency axis
 */
function generateLogFrequencyAxis(fMin, fMax, pointsPerOct) {
  const freqs = [];
  const octaves = Math.log2(fMax / fMin);
  const totalPoints = Math.ceil(octaves * pointsPerOct);
  
  for (let i = 0; i < totalPoints; i++) {
    const f = fMin * Math.pow(2, i / pointsPerOct);
    if (f <= fMax) {
      freqs.push(f);
    }
  }
  
  return freqs;
}

/**
 * Compute room modes (rectangular room)
 */
function computeRoomModes({
  widthM,
  lengthM,
  heightM,
  fMax,
  c,
  includeAxial,
  includeTangential,
  includeOblique
}) {
  const modes = [];
  
  // Maximum mode indices
  const nMax = Math.ceil((fMax / c) * 2 * Math.max(widthM, lengthM, heightM)) + 5;
  
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        // Skip (0,0,0)
        if (nx === 0 && ny === 0 && nz === 0) continue;
        
        // Modal frequency: f = (c/2) * sqrt( (nx/Lx)^2 + (ny/Ly)^2 + (nz/Lz)^2 )
        const freq = (c / 2) * Math.sqrt(
          Math.pow(nx / widthM, 2) +
          Math.pow(ny / lengthM, 2) +
          Math.pow(nz / heightM, 2)
        );
        
        if (freq > fMax) continue;
        
        // Classify mode type
        const activeAxes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        let type;
        if (activeAxes === 1) {
          type = 'axial';
          if (!includeAxial) continue;
        } else if (activeAxes === 2) {
          type = 'tangential';
          if (!includeTangential) continue;
        } else {
          type = 'oblique';
          if (!includeOblique) continue;
        }
        
        modes.push({ nx, ny, nz, freq, type });
      }
    }
  }
  
  return modes.sort((a, b) => a.freq - b.freq);
}

/**
 * Compute spatial coupling using cosine pressure mode shapes
 * Returns total coupling (for engine use) and individual terms (for debug)
 */
function computeSpatialCoupling(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  // Cosine pressure terms (preserves sign for interference)
  const srcX = nx > 0 ? Math.cos(nx * Math.PI * source.x / widthM) : 1;
  const srcY = ny > 0 ? Math.cos(ny * Math.PI * source.y / lengthM) : 1;
  const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / heightM) : 1;
  
  const rcvX = nx > 0 ? Math.cos(nx * Math.PI * receiver.x / widthM) : 1;
  const rcvY = ny > 0 ? Math.cos(ny * Math.PI * receiver.y / lengthM) : 1;
  const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * (receiver.z ?? 1.2) / heightM) : 1;
  
  // Total coupling = source pressure × receiver pressure
  return (srcX * srcY * srcZ) * (rcvX * rcvY * rcvZ);
}

/**
 * Compute spatial coupling terms separately (for debug visibility)
 */
function getSpatialCouplingTerms(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  const srcX = nx > 0 ? Math.cos(nx * Math.PI * source.x / widthM) : 1;
  const srcY = ny > 0 ? Math.cos(ny * Math.PI * source.y / lengthM) : 1;
  const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / heightM) : 1;
  const srcCouplingTerm = srcX * srcY * srcZ;
  
  const rcvX = nx > 0 ? Math.cos(nx * Math.PI * receiver.x / widthM) : 1;
  const rcvY = ny > 0 ? Math.cos(ny * Math.PI * receiver.y / lengthM) : 1;
  const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * (receiver.z ?? 1.2) / heightM) : 1;
  const rcvCouplingTerm = rcvX * rcvY * rcvZ;

  return {
    srcCouplingTerm,
    rcvCouplingTerm,
    totalCoupling: srcCouplingTerm * rcvCouplingTerm,
  };
}

/**
 * Apply fractional octave smoothing
 */
function applySmoothing(freqs, splDb, smoothing) {
  const octaveFraction = {
    '1/12': 12,
    '1/6': 6,
    '1/3': 3
  }[smoothing] || 1;
  
  const smoothed = [...splDb];
  
  for (let i = 0; i < freqs.length; i++) {
    const fc = freqs[i];
    const fLow = fc / Math.pow(2, 1 / (2 * octaveFraction));
    const fHigh = fc * Math.pow(2, 1 / (2 * octaveFraction));
    
    let sum = 0;
    let count = 0;
    
    for (let j = 0; j < freqs.length; j++) {
      if (freqs[j] >= fLow && freqs[j] <= fHigh) {
        sum += splDb[j];
        count++;
      }
    }
    
    if (count > 0) {
      smoothed[i] = sum / count;
    }
  }
  
  return smoothed;
}

/**
 * Normalize to average in band = 0 dB (REW-style)
 */
function normalizeToAverage(freqs, splDb, bandHz) {
  // Helper to get finite values in band
  const getFiniteInBand = (fMin, fMax) => {
    return freqs
      .map((f, i) => f >= fMin && f <= fMax && isFinite(splDb[i]) ? splDb[i] : null)
      .filter(v => v !== null);
  };
  
  // Try primary band (30-80 Hz)
  let bandValues = getFiniteInBand(bandHz[0], bandHz[1]);
  let actualBand = bandHz;
  
  // Guard: if fewer than 10 points in band, skip normalization
  if (bandValues.length < 10) {
    return {
      splDb,
      actualBand,
      applied: false
    };
  }
  
  // Use average (not median) for REW-style normalization
  const avgDb = bandValues.reduce((a, b) => a + b, 0) / bandValues.length;
  
  // Normalize
  const normalized = splDb.map(spl => {
    if (!isFinite(spl)) return -120;
    const norm = spl - avgDb;
    return isFinite(norm) ? norm : -120;
  });
  
  return {
    splDb: normalized,
    actualBand,
    applied: true
  };
}

function dbAt(fTarget, freqs, splDb) {
  let best = 0;
  let bestDf = 1e9;
  for (let i = 0; i < freqs.length; i++) {
    const df = Math.abs(freqs[i] - fTarget);
    if (df < bestDf) { 
      bestDf = df; 
      best = splDb[i]; 
    }
  }
  return best;
}

function estimateModeQ({ mode, roomDims, surfaceAbsorption, dampingScalar, leakage, f0 }) {
  // Direct Q control (REW-like): slider value is the base Q, with only mild frequency dependence
  // This makes "Dead (8)" clearly broad and "Lively (35)" clearly resonant
  
  const baseQ = dampingScalar * 20; // Maps slider (0.5-1.75) to Q (10-35)
  
  // Mild frequency dependence: slightly lower Q at higher frequencies
  const freqFactor = Math.pow(f0 / 50, -0.15);
  
  // Mode order weighting: higher order modes slightly more damped
  const order = Math.sqrt(mode.nx*mode.nx + mode.ny*mode.ny + mode.nz*mode.nz);
  const orderFactor = 1 / (1 + 0.08 * Math.max(0, order - 1));
  
  // Leakage reduces Q uniformly
  const leakageFactor = 1 / (1 + 2 * clamp01(leakage));
  
  const q = baseQ * freqFactor * orderFactor * leakageFactor;
  
  return Math.max(6, Math.min(80, q));
}

function clamp01(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}