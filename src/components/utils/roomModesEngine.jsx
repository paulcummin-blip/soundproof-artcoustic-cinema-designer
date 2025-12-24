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
  autoLevelToMLP = true,
  isDragging = false,
  sealedRoomBoost = { enabled: false, kDbPerOct: 6.0, maxGainDb: 12.0 },
}) {
  try {
  // IMMUTABILITY GUARD: Create safe local copies of ALL inputs to prevent readonly errors
  const room = roomDims ? { 
    widthM: roomDims.widthM, 
    lengthM: roomDims.lengthM, 
    heightM: roomDims.heightM 
  } : null;
  
  const seat = seatPosition ? { 
    x: seatPosition.x, 
    y: seatPosition.y, 
    z: seatPosition.z 
  } : null;
  
  const sources = (sourcePositions || []).map(s => ({
    x: s?.x,
    y: s?.y,
    z: s?.z,
    id: s?.id,
    modelKey: s?.modelKey,
    tuning: s?.tuning ? {
      gainDb: s.tuning.gainDb ?? 0,
      delayMs: s.tuning.delayMs ?? 0,
      polarity: s.tuning.polarity ?? 'normal'
    } : { gainDb: 0, delayMs: 0, polarity: 'normal' }
  }));
  
  const absorption = surfaceAbsorption ? { ...surfaceAbsorption } : {
    front: 0.30, back: 0.30, left: 0.30,
    right: 0.30, ceiling: 0.30, floor: 0.30,
  };
  
  // Create local copies of product curves to prevent mutation
  const productCurves = subProductCurves && Array.isArray(subProductCurves)
    ? subProductCurves.map(curve => curve ? [...curve] : null)
    : null;
  
  // Validate inputs (use local copies)
  if (!room?.widthM || !room?.lengthM || !room?.heightM) {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [], modeCount: 0 } };
  }
  
  if (!seat || typeof seat.x !== 'number' || typeof seat.y !== 'number') {
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

  // Sources array already created as safe copy above - apply defaults if needed
  let sourcesLocal = sources.length > 0 ? sources : [{
    x: room.widthM / 2,
    y: 0.2,
    z: rewParityMode ? subFloorHeight : 0.2,
    tuning: { gainDb: 0, delayMs: 0, polarity: 'normal' }
  }];
  
  // Force subs to floor in REW parity mode (create new objects)
  if (rewParityMode) {
    sourcesLocal = sourcesLocal.map(src => ({
      ...src,
      z: subFloorHeight,
    }));
  }

  // If there is NO product curve, we never want "absolute SPL" behaviour.
  // Generic view should be normalised to a sensible reference level.
  const hasProductCurves =
    !!(subProductCurves && Array.isArray(subProductCurves) && subProductCurves.length > 0);

  // Define absolute/relative mode clearly (matches REW's logic)
  const isRelative = !!relativeViewEnabled;
  const isAbsolute = !isRelative;
  
  // Auto level to MLP: default true when REW mode is on
  const autoLevelEnabled = rewParityMode ? (autoLevelToMLP ?? true) : false;
  
  const { widthM, lengthM, heightM } = room;
  
  // Safe guard: ensure dimensions are valid
  if (!Number.isFinite(widthM) || !Number.isFinite(lengthM) || !Number.isFinite(heightM) || 
      widthM <= 0 || lengthM <= 0 || heightM <= 0) {
    return { 
      freqs: [], 
      splDb: [], 
      debug: { 
        error: "Invalid room dimensions",
        roomDims: { widthM, lengthM, heightM }
      } 
    };
  }
  
  const volume = widthM * lengthM * heightM;
  
  // Compute Schroeder frequency
  const rt60 = 0.4;
  const schroederHz = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 80;
  
  // Generate frequency axis FIRST (needed by subProductMeta)
  const freqs = rewParityMode 
    ? generateLinearFrequencyAxis(fMin, fMax, 0.5) // 0.5 Hz steps for modal detail
    : generateLogFrequencyAxis(fMin, fMax, pointsPerOct);
  
  // Detect product curve type and extract reference SPL
  const subProductMeta = productCurves ? productCurves.map((curve, idx) => {
    if (!curve || !Array.isArray(curve)) {
      return { type: 'NONE', baseSplAt1m_50Hz: 90 };
    }
    
    const finite = curve.filter(v => Number.isFinite(v));
    if (finite.length === 0) {
      return { type: 'NONE', baseSplAt1m_50Hz: 90 };
    }
    
    const minDb = Math.min(...finite);
    const maxDb = Math.max(...finite);
    
    // Detect if this is ABSOLUTE SPL (range ~60-140 dB) or RELATIVE GAIN (range ~-20 to +20 dB)
    const isAbsoluteCurve = (minDb >= 60 && maxDb <= 140);
    
    // Find value at 50 Hz (or nearest bin)
    const idx50 = freqs.findIndex(f => f >= 50);
    const valueAt50Hz = idx50 >= 0 && idx50 < curve.length ? curve[idx50] : null;
    
    if (isAbsoluteCurve) {
      // ABSOLUTE SPL curve: extract reference SPL, convert to relative
      const baseSpl = valueAt50Hz || 90;
      const relativeCurve = curve.map(db => db - baseSpl);
      return {
        type: 'ABSOLUTE',
        baseSplAt1m_50Hz: baseSpl,
        productDbAt50Hz: valueAt50Hz,
        relativeCurve,
        originalRange: { min: minDb, max: maxDb }
      };
    } else {
      // RELATIVE GAIN curve: use default reference SPL
      return {
        type: 'RELATIVE',
        baseSplAt1m_50Hz: 90, // Generic REW-ish anchor
        productDbAt50Hz: valueAt50Hz,
        relativeCurve: curve, // Already relative
        originalRange: { min: minDb, max: maxDb }
      };
    }
  }) : null;

  
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
  
  // Sealed room LF boost (ALWAYS ENABLED - cinemas are sealed by design)
  const sealedBoostEnabled = true;
  const sealedBoostKDbPerOct = 6.0;
  const sealedBoostMaxGainDb = 12.0;
  
  // Track what processing was applied
  const calibrationApplied = rewParityMode;
  let actualNormBand = normalizeBandHz;

  // LF debugging stats collectors
  const lfDebug = {
    modalMag15_45: []
  };

  // --- B44: modal coupling sanity (single mode 1,0,0) ---
  const __b44Clamp01 = (t) => Math.max(0, Math.min(1, t));
  const __b44Seat = seat || { x: 0, y: 0, z: 0 };
  const __b44Src = (sourcesLocal.length > 0) ? sourcesLocal[0] : { x: 0, y: 0, z: 0 };

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

  // REW-style MLP auto level alignment (compute per-sub gain corrections using modal sum)
  let mlpAutoLevelGainsDb = [];
  
  if (autoLevelEnabled && sourcesLocal.length > 1) {
    const mlpBand = [30, 80];
    const perSubMedians = [];
    
    // For each sub, compute its solo modal response at MLP in 30-80 Hz
    for (let subIdx = 0; subIdx < sourcesLocal.length; subIdx++) {
      const soloSource = [sourcesLocal[subIdx]];
      
      // Compute solo modal curve (no user gain, no delay)
      const soloCurve = freqs.map((f, i) => {
        let sumRe_modal = 0;
        let sumIm_modal = 0;
        
        for (const mode of modes) {
          const f0 = mode.freq;
          if (!(f0 > 0)) continue;
          
          const qMode = estimateModeQ({
            mode,
            roomDims: room,
            surfaceAbsorption: absorption,
            dampingScalar,
            leakage,
            f0,
          });
          
          const bandwidth = f0 / qMode;
          const df = Math.abs(f - f0);
          if (df > 5 * bandwidth && df > 20) continue;
          
          const source = soloSource[0];
          const coupling = computeSpatialCoupling(mode, source, seat, room);
          if (Math.abs(coupling) < 1e-6) continue;
          
          const meta = subProductMeta && subProductMeta[subIdx] ? subProductMeta[subIdx] : null;
          
          // Product curve as magnitude multiplier (relative)
          let productRelativeDb = 0;
          if (meta && meta.relativeCurve && meta.relativeCurve[i] !== undefined) {
            productRelativeDb = meta.relativeCurve[i];
          }
          const productMagScale = Math.pow(10, productRelativeDb / 20);
          
          // Modal transfer function (normalized)
          const r = f / Math.max(1e-6, f0);
          const re = (1 - r * r);
          const im = (r / Math.max(1e-6, qMode));
          const denom = (re * re + im * im);
          let hRe = re / denom;
          let hIm = -im / denom;
          hRe /= Math.max(1e-6, qMode);
          hIm /= Math.max(1e-6, qMode);
          
          // No delay, no polarity for calibration
          const weightMag = productMagScale;
          const cRe = coupling * weightMag * hRe;
          const cIm = coupling * weightMag * hIm;
          
          sumRe_modal += cRe;
          sumIm_modal += cIm;
        }
        
        const mag = Math.max(Number.EPSILON, Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal));
        return 20 * Math.log10(mag);
      });
      
      // Extract 30-80 Hz median
      const bandValues = freqs
        .map((f, i) => f >= mlpBand[0] && f <= mlpBand[1] && isFinite(soloCurve[i]) ? soloCurve[i] : null)
        .filter(v => v !== null);
      
      if (bandValues.length >= 10) {
        const sorted = [...bandValues].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        perSubMedians.push(median);
      } else {
        perSubMedians.push(0);
      }
    }
    
    // Compute average median across all subs
    const validMedians = perSubMedians.filter(m => Number.isFinite(m) && m !== 0);
    const avgMedian = validMedians.length > 0 
      ? validMedians.reduce((a, b) => a + b, 0) / validMedians.length 
      : 0;
    
    // Compute gain corrections (dB) for each sub
    mlpAutoLevelGainsDb = perSubMedians.map(median => {
      if (!Number.isFinite(median) || median === 0) return 0;
      return avgMedian - median;
    });
  } else {
    // No auto-level: all gains are 0 dB
    mlpAutoLevelGainsDb = sourcesLocal.map(() => 0);
  }
  
  // Extract computation into runOnce for diagnostic double-run
  const runOnce = (sourcesOverride) => {
    const sourcesUsed = sourcesOverride ?? sourcesLocal;

  // Build response: pure MODAL PRESSURE SUM (REW-style room curve)
  let splDb = freqs.map((f, i) => {
    let sumRe_modal = 0;
    let sumIm_modal = 0;

    for (const mode of modes) {
      const f0 = mode.freq;
      if (!(f0 > 0)) continue;

      // Compute modal Q
      const qMode = estimateModeQ({
        mode,
        roomDims: room,
        surfaceAbsorption: absorption,
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
        const coupling = computeSpatialCoupling(mode, source, seat, room);
        if (Math.abs(coupling) < 1e-6) continue;

        // Get product metadata for this sub
        const meta = subProductMeta && subProductMeta[subIdx] ? subProductMeta[subIdx] : null;

        // Product curve as magnitude multiplier (relative dB → linear scale)
        let productRelativeDb = 0;
        if (meta && meta.relativeCurve && meta.relativeCurve[i] !== undefined) {
          productRelativeDb = meta.relativeCurve[i];
        }
        const productMagScale = Math.pow(10, productRelativeDb / 20);

        // Apply sub tuning (gain, delay, polarity)
        const subTuning = source.tuning || { gainDb: 0, delayMs: 0, polarity: 0 };
        const userGainLinear = Math.pow(10, subTuning.gainDb / 20);

        // Apply MLP auto-level correction
        const autoLevelGainDb = mlpAutoLevelGainsDb[subIdx] || 0;
        const autoLevelGainLinear = Math.pow(10, autoLevelGainDb / 20);

        const gainLinear = userGainLinear * autoLevelGainLinear;

        // Phase: delay + polarity only (distance/time-of-flight is in the coupling)
        const delayPhase = -2 * Math.PI * f * (subTuning.delayMs / 1000);
        const polarityPhase = (subTuning.polarity === 180 || subTuning.polarity === 'invert') ? Math.PI : 0;
        const totalPhase = delayPhase + polarityPhase;

        // Complex weight for this sub (magnitude shaping only)
        const weightMag = productMagScale * gainLinear;
        const weightRe = weightMag * Math.cos(totalPhase);
        const weightIm = weightMag * Math.sin(totalPhase);

        // Second-order resonator (dimensionless, REW-style behaviour)
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

    // DEBUG: capture pre-smoothing magnitudes for probe bins only
    if (__debugBass && __isProbeFreq(f)) {
      const modalMag = Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal);
      const toDb = (x) => 20 * Math.log10(Math.max(Number.EPSILON, x));

      __probeRows.push({
        fProbe: f,
        idx: i,
        binHz: Number(freqs[i].toFixed(2)),
        modalMagDb_pre: Number(toDb(modalMag).toFixed(2)),
        splDb_postSmooth: null,
        finalDb: null,
      });
    }

    // LF debugging: capture magnitudes before calibration in 15-45 Hz band
    if (f >= 15 && f <= 45) {
      const modalMag = Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal);
      lfDebug.modalMag15_45.push(20 * Math.log10(Math.max(Number.EPSILON, modalMag)));
    }

    // Pure modal pressure magnitude → dB
    let modalDb = 20 * Math.log10(Math.max(Number.EPSILON, Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal)));
    
    // Apply sealed room LF boost below lowest axial (if enabled)
    if (sealedBoostEnabled && lowestAxial && f < lowestAxial) {
      const octavesBelow = Math.log2(lowestAxial / f);
      const pressureGainDb = Math.min(sealedBoostMaxGainDb, sealedBoostKDbPerOct * octavesBelow);
      modalDb += pressureGainDb;
    }
    
    return modalDb;
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
    // PLUS: gentle roll-off to fix "upper bass too high" symptom
    let splDbSchroeder = splDb;
    if (rewParityMode && schroederHz > 0) {
      splDbSchroeder = splDb.map((db, i) => {
        const f = freqs[i];
        // Only apply above Schroeder frequency (never below lowest axial)
        if (f < schroederHz) return db;

        // Blend to a gently smoothed "statistical" curve (no wild modal spikes)
        const f2 = schroederHz * 1.6;
        const t = Math.max(0, Math.min(1, (f - schroederHz) / Math.max(1e-6, (f2 - schroederHz))));

        // Gentle roll-off to prevent upper bass inflation (fix 80-200 Hz region)
        // Apply -1 dB per octave above Schroeder to keep mid-bass realistic
        const octavesAbove = Math.log2(f / schroederHz);
        const rolloffDb = -1.0 * octavesAbove;
        
        // Simple target: a mild downward tilt + rolloff
        const target = dbAt(schroederHz, freqs, splDb) - 3 * Math.log2(f / schroederHz) + rolloffDb;

        return (1 - t) * db + t * target;
      });
    }

    // Capture RAW stats BEFORE any processing (critical for debugging)
    const rawFinite = splDbSchroeder.filter(v => isFinite(v));
    const rawMin = rawFinite.length > 0 ? Math.min(...rawFinite) : 0;
    const rawMax = rawFinite.length > 0 ? Math.max(...rawFinite) : 0;
    const rawRange = rawMax - rawMin;

    // Clamp non-finite values before smoothing (IMMUTABLE - do not mutate in place)
    let nonFiniteRepaired = 0;
    let lastGoodValue = 0;

    const repaired = [];
    for (let i = 0; i < splDbSchroeder.length; i++) {
    const v = splDbSchroeder[i];
    if (!isFinite(v)) {
      repaired.push(lastGoodValue);
      nonFiniteRepaired += 1;
    } else {
      repaired.push(v);
      lastGoodValue = v;
    }
    }
    const splDbRepaired = repaired;

  // Capture pre-normalization stats (after repair, before smoothing/norm)
  const finitePreNorm = splDbRepaired.filter(v => isFinite(v));
  const preNormMin = finitePreNorm.length > 0 ? Math.min(...finitePreNorm) : 0;
  const preNormMax = finitePreNorm.length > 0 ? Math.max(...finitePreNorm) : 0;
  const preNormRange = preNormMax - preNormMin;

  // Apply smoothing if requested (create NEW array, never mutate)
  const smoothingApplied = smoothing !== 'none' ? smoothing : 'none';
  const splDbSmoothed = smoothing !== 'none' 
    ? applySmoothing(freqs, splDbRepaired, smoothing)
    : splDbRepaired;

  // DEBUG: record post-smoothing splDb at probe bins
  if (__debugBass && __probeRows && __probeRows.length) {
    for (const row of __probeRows) {
      const i = row.idx;
      if (i >= 0 && i < splDbSmoothed.length) {
        row.splDb_postSmooth = Number.isFinite(splDbSmoothed[i]) ? Number(splDbSmoothed[i].toFixed(2)) : splDbSmoothed[i];
      }
    }
  }

  // Capture post-normalization stats
  const finitePostNorm = splDbSmoothed.filter(v => isFinite(v));
  const postNormMin = finitePostNorm.length > 0 ? Math.min(...finitePostNorm) : 0;
  const postNormMax = finitePostNorm.length > 0 ? Math.max(...finitePostNorm) : 0;
  const postNormRange = postNormMax - postNormMin;
  
  // Build detailed mode markers for visualization (create new array)
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
  
  // Mode markers (axial only for basic display) - create new sorted array
  const modeMarkersHz = [...modes]
    .filter(m => m.type === 'axial')
    .map(m => m.freq)
    .sort((a, b) => a - b);
  
  // Count by type
  const axialCount = modes.filter(m => m.type === 'axial').length;
  const tangentialCount = modes.filter(m => m.type === 'tangential').length;
  const obliqueCount = modes.filter(m => m.type === 'oblique').length;
  
  // First ten modes for debug (create new array)
  const firstTenModeHz = [...modes].slice(0, 10).map(m => m.freq.toFixed(1));
  
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

  // Build FINAL curve pipeline (single source of truth) - create NEW arrays at each step
  // Absolute SPL calibration: anchor curve to sensible reference at MLP
  let calibrationOffsetDb = 0;
  let normAppliedActual = false;
  let calRefMedianDbBefore = 0;
  let calRefMedianDbAfter = 0;
  let finalDb = splDbSmoothed;

  // Define normRefDb early (REW Compare View needs this to never crash)
  let normRefDb = isRelative ? 0 : 85;

  if (!Array.isArray(finalDb) || finalDb.length === 0) {
    finalDb = Array.isArray(splDb) ? [...splDb] : [];
  }

  // Always compute MLP reference (30-80 Hz median) for anchoring
  const calRefBandHz = [30, 80];
  const mlpBandValues = freqs
    .map((f, i) => f >= calRefBandHz[0] && f <= calRefBandHz[1] && isFinite(finalDb[i]) ? finalDb[i] : null)
    .filter(v => v !== null);

  if (mlpBandValues.length >= 10) {
    const sorted = [...mlpBandValues].sort((a, b) => a - b);
    const mlpMedianDb = sorted[Math.floor(sorted.length / 2)];
    calRefMedianDbBefore = mlpMedianDb;
    normRefDb = mlpMedianDb; // Actual computed reference for this run

    if (isRelative) {
      // Relative view: normalize to 0 dB
      const targetDb = Number.isFinite(normalizeToDb) ? normalizeToDb : 0;
      calibrationOffsetDb = targetDb - mlpMedianDb;
      normAppliedActual = true;
    } else {
      // Absolute view: calibrate so MLP 30-80 Hz median = 85 dB (reference cinema level)
      const targetAbsoluteDb = 85;
      calibrationOffsetDb = targetAbsoluteDb - mlpMedianDb;
    }

    // Apply calibration offset
    finalDb = finalDb.map(v => (isFinite(v) ? (v + calibrationOffsetDb) : v));
    
    // Compute after-calibration median for debug
    const afterBandValues = freqs
      .map((f, i) => f >= calRefBandHz[0] && f <= calRefBandHz[1] && isFinite(finalDb[i]) ? finalDb[i] : null)
      .filter(v => v !== null);
    if (afterBandValues.length >= 10) {
      const sortedAfter = [...afterBandValues].sort((a, b) => a - b);
      calRefMedianDbAfter = sortedAfter[Math.floor(sortedAfter.length / 2)];
    }
  }

  // DEBUG: record finalDb without risking a crash
  if (__debugBass && Array.isArray(__probeRows) && __probeRows.length) {
    for (const row of __probeRows) {
      const i = row.idx;
      if (i >= 0 && i < finalDb.length) {
        row.finalDb = Number.isFinite(finalDb[i]) ? Number(finalDb[i].toFixed(2)) : finalDb[i];
      }
    }
  }

  // Build lfProbeRaw from __probeRows (for variation testing)
  let lfProbeRaw = null;
  if (__debugBass && Array.isArray(__probeRows) && __probeRows.length) {
    lfProbeRaw = [...__probeRows]
      .sort((a, b) => a.fProbe - b.fProbe)
      .map(row => ({
        freq: row.fProbe,
        modalMagDb_pre: row.modalMagDb_pre
      }));
  }

  // Compute seat node check (for diagnosing mode suppression)
  let seatNodeCheck = null;
  if (__debugBass) {
    const tol = 0.01; // 1 cm tolerance
    const seatX_frac = seat.x / widthM;
    const seatY_frac = seat.y / lengthM;
    const seatZ_frac = (seat.z ?? 1.2) / heightM;

    const widthOddModesSuppressed = Math.abs(seat.x - widthM / 2) < tol;
    const lengthOddModesSuppressed = Math.abs(seat.y - lengthM / 2) < tol;
    const heightOddModesSuppressed = Math.abs((seat.z ?? 1.2) - heightM / 2) < tol;

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

  // Product curve stats (if applied) - use metadata
  let productCurveStats = null;
  if (subProductMeta && Array.isArray(subProductMeta)) {
    productCurveStats = subProductMeta.map((meta, idx) => {
      if (!meta) return null;

      return {
        subIndex: idx,
        productCurveType: meta.type,
        baseSplAt1m_50Hz: meta.baseSplAt1m_50Hz.toFixed(1),
        productDbAt50Hz: meta.productDbAt50Hz !== null ? meta.productDbAt50Hz.toFixed(1) : 'N/A',
        originalRange: meta.originalRange ? `${meta.originalRange.min.toFixed(1)} to ${meta.originalRange.max.toFixed(1)} dB` : 'N/A'
      };
    }).filter(s => s !== null);
  }

  // Compute LF debug stats
  const modalMagMin = lfDebug.modalMag15_45.length > 0 ? Math.min(...lfDebug.modalMag15_45).toFixed(1) : 'N/A';
  const modalMagMax = lfDebug.modalMag15_45.length > 0 ? Math.max(...lfDebug.modalMag15_45).toFixed(1) : 'N/A';

  // LF PROBE: detailed frequency-by-frequency audit using FINAL curve
  // Extended probes for acceptance test (25, 40, 60, 69, 120 Hz)
  const probeFreqs = [20, 25, 30, 34, 36, 38, 40, 42, 45, 60, 69, 120];
  const lfProbe = probeFreqs.map(fProbe => {
    const idx = freqs.findIndex(f => Math.abs(f - fProbe) < 0.6);
    if (idx < 0) return { freq: fProbe, error: 'not found' };
    
    const rawDbBeforeCal = splDb[idx]; // Before any calibration
    const finalDbValue = finalDb[idx]; // After all processing (calibration + normalization)
    
    // Compute sealed room pressure gain if enabled
    let pressureGainDb = 0;
    if (sealedBoostEnabled && lowestAxial && fProbe < lowestAxial) {
      const octavesBelow = Math.log2(lowestAxial / fProbe);
      pressureGainDb = Math.min(sealedBoostMaxGainDb, sealedBoostKDbPerOct * octavesBelow);
    }
    
    return {
      freq: fProbe,
      rawDbBeforeCal: rawDbBeforeCal.toFixed(2),
      finalDbAfterCal: finalDbValue.toFixed(2),
      pressureGainDb: pressureGainDb.toFixed(2),
      belowLowestAxial: lowestAxial && fProbe < lowestAxial
    };
  });
  
  // Diagnostic deltas for LF vs upper-bass balance
  const idx25 = freqs.findIndex(f => Math.abs(f - 25) < 0.6);
  const idx69 = freqs.findIndex(f => Math.abs(f - 69) < 0.6);
  const idx120 = freqs.findIndex(f => Math.abs(f - 120) < 0.6);
  
  const lfDelta_25_69 = (idx25 >= 0 && idx69 >= 0) 
    ? (finalDb[idx25] - finalDb[idx69]).toFixed(2) 
    : 'N/A';
  const upperBassDelta_69_120 = (idx69 >= 0 && idx120 >= 0) 
    ? (finalDb[idx69] - finalDb[idx120]).toFixed(2) 
    : 'N/A';
  
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
  const sourceCountUsed = sourcesLocal.length;
  const sourcePositionsUsed = sourcesLocal.slice(0, 3).map(s => ({
    x: Number(s.x).toFixed(2),
    y: Number(s.y).toFixed(2),
    z: Number(s.z || 0).toFixed(2)
  }));

  const sourceSigUsed = sourcesLocal.map(s => 
    `${s.x.toFixed(2)}_${s.y.toFixed(2)}_${(s.z||0).toFixed(2)}_g${(s.tuning?.gainDb||0).toFixed(1)}_d${(s.tuning?.delayMs||0).toFixed(1)}_p${s.tuning?.polarity||'normal'}`
  ).join('|');

  const seatSigUsed = `${seat.x.toFixed(2)}_${seat.y.toFixed(2)}_${(seat.z||1.2).toFixed(2)}`;
  
  // Rounded signatures for stable comparison (1cm resolution)
  const sourceSigRounded = sourcesLocal.map(s => 
    `${s.x.toFixed(2)}_${s.y.toFixed(2)}_${(s.z||0).toFixed(2)}`
  ).join('|');
  const seatSigRounded = `${seat.x.toFixed(2)}_${seat.y.toFixed(2)}_${(seat.z||1.2).toFixed(2)}`;
  
  // Compute stable input signature for debug memoization
  const inputSig = `${sourceSigUsed}|${seatSigUsed}|${smoothing}|${isRelative?'rel':'abs'}`;

  // FINAL GUARD: Prevent "No finite values" silent failures
  const finalFiniteCheck = finalDb.filter(v => isFinite(v));
  if (finalFiniteCheck.length < 10) {
    // Safety fallback: return flat curve so graph never blanks
    const fallbackValue = isRelative ? 0 : 85;
    const fallbackCurve = freqs.map(() => fallbackValue);
    return {
      freqs: [...freqs],
      splDb: fallbackCurve,
      debug: {
        error: "No finite SPL values (fallback curve used)",
        message: `Returned flat ${fallbackValue} dB curve to prevent blank graph`,
        nonFiniteRepaired,
        rawRange: rawRange ? rawRange.toFixed(2) : 'N/A',
      }
    };
  }

  // Build base return object (all fresh arrays/objects to avoid frozen mutations)
  // CRITICAL: Always return valid arrays so REW Compare can't blank the graph
  const safeFreqs = Array.isArray(freqs) && freqs.length > 0 ? freqs : [];
  const safeFinalDb = Array.isArray(finalDb) && finalDb.length > 0 ? finalDb : (Array.isArray(splDb) ? splDb : []);
  
  const baseReturn = {
    freqs: [...safeFreqs],
    splDb: [...safeFinalDb],
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
      absoluteSplMode: isAbsolute,
      relativeViewEnabled: isRelative,
      normBandHz: actualNormBand,
      normApplied: normAppliedActual,
      normRefDb: Number.isFinite(normRefDb) ? normRefDb.toFixed(2) : (isRelative ? "0.0" : "85.0"),
      smoothingApplied,
      inputSig,
      nonFiniteRepaired,
      rawRange: rawRange.toFixed(2),
      preNormRange: preNormRange.toFixed(2),
      postNormRange: postNormRange.toFixed(2),
      productCurvesApplied: !!subProductCurves,
      normalizeBandHz: actualNormBand,
      pressureEnabled: false,
      pressureThresholdHz: null,
      pressureRegion: null,
      lfDeltaDb_20_30: lfDeltaDb_20_30 !== null ? lfDeltaDb_20_30.toFixed(2) : 'N/A',
      splMinDb: splMinDb.toFixed(1),
      splMaxDb: splMaxDb.toFixed(1),
      splRangeDb: splRangeDb.toFixed(1),
      normalizeToDb: normalizeToDb !== undefined ? normalizeToDb : null,
      productCurveStats,
      calibrationMode: isAbsolute ? "Absolute SPL" : "Relative (normalized)",
      sourceCountUsed,
      sourcePositionsUsed: [...sourcePositionsUsed],
      sourceSigUsed,
      seatSigUsed,
      sourceSigRounded,
      seatSigRounded,
      splDbRepaired: rewParityMode ? [...splDbRepaired] : null,
      lfDebug15_45Hz: {
        modalMagDb: `${modalMagMin} to ${modalMagMax}`,
        note: "Pure modal pressure magnitudes before calibration offset"
      },
      lfProbe: {
        probeFrequencies: probeFreqs,
        measurements: lfProbe,
        pressureRegionActive: sealedBoostEnabled,
        pressureGainSettings: {
          kDbPerOct: sealedBoostKDbPerOct.toFixed(1),
          maxGainDb: sealedBoostMaxGainDb.toFixed(1),
          enabled: sealedBoostEnabled
        },
        minModalWeight: 0.15,
        lowestAxialHz: lowestAxial,
        blendStartHz: lowestAxial ? (lowestAxial * 0.7).toFixed(1) : 'N/A',
        blendEndHz: lowestAxial ? lowestAxial.toFixed(1) : 'N/A',
        absoluteSplMode: isAbsolute,
        relativeViewEnabled: isRelative,
        subProductCurvesPresent: !!(subProductCurves && Array.isArray(subProductCurves) && subProductCurves.length > 0),
        lfSanityCheck,
        lfDelta_25_69,
        upperBassDelta_69_120
      },
      lfProbeRaw: Array.isArray(lfProbeRaw) ? lfProbeRaw.map(r => ({ ...r })) : lfProbeRaw,
      seatNodeCheck: seatNodeCheck ? { ...seatNodeCheck } : null,
      autoLevelToMLP: autoLevelEnabled,
      mlpAutoLevelGainsDb: Array.isArray(mlpAutoLevelGainsDb) ? mlpAutoLevelGainsDb.map(g => (Number.isFinite(g) ? g.toFixed(2) : "0.00")) : [],
      mlpBand: [30, 80],
      rewParityMode: rewParityMode,
      modalOnly: rewParityMode,
      calRefBandHz: calRefBandHz,
      calRefMedianDbBefore: Number.isFinite(calRefMedianDbBefore) ? calRefMedianDbBefore.toFixed(2) : 'N/A',
      calOffsetAppliedDb: Number.isFinite(calibrationOffsetDb) ? calibrationOffsetDb.toFixed(2) : '0.00',
      calRefMedianDbAfter: Number.isFinite(calRefMedianDbAfter) ? calRefMedianDbAfter.toFixed(2) : 'N/A',
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
    const mirrored = mirrorSources(sourcesLocal, room);
    const splDb2 = runOnce(mirrored);
    
    // Apply same post-processing to mirrored run for fair comparison
    let finalDb2 = [...splDb2];

    // Apply smoothing
    if (smoothing !== 'none') {
      finalDb2 = applySmoothing(freqs, finalDb2, smoothing);
    }

    // Apply normalization (if relative mode)
    if (isRelative && normalizeBandHz && Array.isArray(normalizeBandHz) && normalizeBandHz.length === 2) {
      const [fMin, fMax] = normalizeBandHz;
      const bandValues = freqs
        .map((f, i) => f >= fMin && f <= fMax && isFinite(finalDb2[i]) ? finalDb2[i] : null)
        .filter(v => v !== null);

      if (bandValues.length >= 10) {
        const sorted = [...bandValues].sort((a, b) => a - b);
        const normRefDb2 = sorted[Math.floor(sorted.length / 2)];
        const targetDb = Number.isFinite(normalizeToDb) ? normalizeToDb : 0;
        finalDb2 = finalDb2.map(v => (isFinite(v) ? (v - normRefDb2 + targetDb) : v));
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
      console.log("SourceSig normal:", sourceSig(sourcesLocal));
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

  } catch (e) {
    // Safe error return with stack trace for debugging
    return {
      freqs: [],
      splDb: [],
      debug: {
        error: "computeRoomModesResponse failed",
        message: String(e?.message || e),
        stack: String(e?.stack || "")
      }
    };
  }
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
  
  // IMMUTABLE: Create new sorted array instead of sorting in place
  return [...modes].sort((a, b) => a.freq - b.freq);
}

/**
 * Compute spatial coupling using cosine pressure mode shapes
 * Returns total coupling (for engine use) - uses direct meters, no normalization
 */
function computeSpatialCoupling(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  // Safe guard: prevent division by zero
  const W = Math.max(1e-6, widthM);
  const L = Math.max(1e-6, lengthM);
  const H = Math.max(1e-6, heightM);
  
  // Cosine pressure terms (direct meters, no 0-1 normalization)
  const srcX = nx > 0 ? Math.cos(nx * Math.PI * source.x / W) : 1;
  const srcY = ny > 0 ? Math.cos(ny * Math.PI * source.y / L) : 1;
  const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / H) : 1;
  
  const rcvX = nx > 0 ? Math.cos(nx * Math.PI * receiver.x / W) : 1;
  const rcvY = ny > 0 ? Math.cos(ny * Math.PI * receiver.y / L) : 1;
  const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * (receiver.z ?? 1.2) / H) : 1;
  
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
  
  // IMMUTABLE: Build new array instead of mutating
  const smoothed = [];
  
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
    
    smoothed.push(count > 0 ? (sum / count) : splDb[i]);
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
  // Handle both roomDims formats (object or direct properties)
  const dims = roomDims?.widthM ? roomDims : { widthM: roomDims?.width, lengthM: roomDims?.length, heightM: roomDims?.height };
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