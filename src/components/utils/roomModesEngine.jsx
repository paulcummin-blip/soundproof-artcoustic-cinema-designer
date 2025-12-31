// roomModesEngine.js
// REW-parity room modes calculator for bass response
// Uses rectangular room normal modes with source/receiver spatial coupling

const SPEED_OF_SOUND = 343; // m/s
const SPATIAL_AVG_RADIUS_M = 0.10; // REW-style mic/source spatial averaging (10cm)

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
  rawEngineOutput = false,
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
  imageFieldEnabled = null,
  includeSBIR = true,
  sbirMaxOrder = 1,
  sbirIncludeWalls = true,
  sbirIncludeFloorCeiling = true,
  sbirBlendEnabled = true,
  sbirBlendStartHz = null,
  sbirBlendEndHz = null,
  modalOnlyDebugView = false,
  modeIsolation = null,
  complexEigenfunctions = false,
  componentView = 'modalPlusSbir', // 'modalOnly' | 'sbirOnly' | 'modalPlusSbir'
  sealedRoom = true, // REW-style: cinemas are sealed by default
  mlpPosition = null, // MLP position for distance debug
  sbirDebugSingleFrontWall = false, // DIAGNOSTIC: Only use direct + front wall reflection
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
  let modes = computeRoomModes({
    widthM,
    lengthM,
    heightM,
    fMax: modeLimitHz,
    c,
    includeAxial: includeAxialLocal,
    includeTangential: includeTangentialLocal,
    includeOblique: includeObliqueLocal
  });

  // PART H: Mode isolation filter (single/multi-mode test harness)
  if (modeIsolation && modeIsolation !== 'off') {
    // Support both single mode "1,0,0" and multi-mode "1,0,0|0,1,0"
    const modeSpecs = modeIsolation.split('|').map(spec => {
      const [nx, ny, nz] = spec.split(',').map(n => parseInt(n, 10));
      return { nx, ny, nz };
    });

    modes = modes.filter(m => 
      modeSpecs.some(spec => m.nx === spec.nx && m.ny === spec.ny && m.nz === spec.nz)
    );
  }
  
  // Lowest axial mode (used for sealed-room pressure behaviour)
  const lowestAxial = modes.find(m => m.type === "axial")?.freq || null;
  
  // Sealed room LF boost (REW-style: enabled by default, can be disabled for leaky rooms)
  const sealedBoostEnabled = sealedRoom;
  const sealedBoostKDbPerOct = sealedRoom ? 6.0 : 0.0;
  const sealedBoostMaxGainDb = sealedRoom ? 12.0 : 0.0;

  // Leaky room LF roll-off (if not sealed, reduce LF below ~35 Hz)
  const leakyRolloffEnabled = !sealedRoom;
  
  // Image field (first-order reflections) - default ON in REW mode
  const imageFieldEnabledActual = imageFieldEnabled !== null ? imageFieldEnabled : rewParityMode;
  
  // Compute pressure reflection coefficients from absorption
  const beta = imageFieldEnabledActual ? {
    front: Math.sqrt(Math.max(0, 1 - absorption.front)),
    back: Math.sqrt(Math.max(0, 1 - absorption.back)),
    left: Math.sqrt(Math.max(0, 1 - absorption.left)),
    right: Math.sqrt(Math.max(0, 1 - absorption.right)),
    ceiling: Math.sqrt(Math.max(0, 1 - absorption.ceiling)),
    floor: Math.sqrt(Math.max(0, 1 - absorption.floor)),
  } : null;
  
  // SBIR (image source) settings - default ON in REW mode
  const sbirEnabled = includeSBIR && rewParityMode && !modalOnlyDebugView;
  
  // REW parity: SBIR transition region (image source → modal crossover)
  // LF (15-50 Hz): SBIR at full strength (deep nulls, interference)
  // HF (>Schroeder): Modal eigenmode dominates (statistical behaviour)
  const sbirBlendStartHzActual = sbirBlendStartHz !== null ? sbirBlendStartHz : (schroederHz * 0.8);
  const sbirBlendEndHzActual = sbirBlendEndHz !== null ? sbirBlendEndHz : (schroederHz * 1.3);
  
  // Track what processing was applied
  const calibrationApplied = rewParityMode;
  let actualNormBand = normalizeBandHz;

  // LF debugging stats collectors
  const lfDebug = {
    modalMag15_45: []
  };
  
  // Per-mode contribution tracking (for REW parity debugging)
  const modeContributions = {};
  
  // LF Movement Probe: track source/seat coupling at key frequencies
  const lfMovementProbe = {};

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
  // Component magnitude tracking for RMS debug
  const modalMagDb_all = [];
  const sbirMagDb_all = [];
  const totalMagDb_all = [];

  // SBIR 63 Hz diagnostic probe (track across passes)
  let sbirDebugProbe63Hz_captured = null;

  // Extract computation into runOnce for diagnostic double-run
  const runOnce = (sourcesOverride, sbirTrimLinearArg = 1.0, componentViewOverride = null) => {
    const sourcesUsed = sourcesOverride ?? sourcesLocal;

    // Component magnitude tracking for SBIR level matching (30-80 Hz band)
    const modalBandDb = [];
    const sbirBandDb = [];

  // Build response: pure MODAL PRESSURE SUM (REW-style room curve)
  // Store BOTH coherent raw AND processed curves
  // CRITICAL: coherentRawDb is the REFERENCE TRUTH - if nulls don't move with sub position, coupling is broken
  const coherentRawDb = [];
  let splDb = freqs.map((f, i) => {
    let sumRe_modal = 0;
    let sumIm_modal = 0;
    let activeTerms = 0;
    
    // Per-mode contribution tracking (top 3 contributors per bin)
    const modeContribsThisBin = [];
    
    // SBIR (image source) complex pressure sum
    let sumRe_sbir = 0;
    let sumIm_sbir = 0;

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

        // Spatial coupling (Part H3 - switch between real and complex eigenfunctions)
        let coupling, couplingComplex;
        if (complexEigenfunctions) {
          couplingComplex = computeSpatialCouplingComplex(mode, source, seat, room);
          // Keep signed amplitude (allows cancellations)
          coupling = couplingComplex.amp;
          if (Math.abs(coupling) < 1e-6) continue;
        } else {
          coupling = computeSpatialCoupling(mode, source, seat, room);
          if (Math.abs(coupling) < 1e-6) continue;
          couplingComplex = null; // Not used in real mode
        }

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
        let cRe, cIm;
        
        if (complexEigenfunctions && couplingComplex) {
          // Complex coupling: couplingComplex * (weightRe + j*weightIm) * (hRe + j*hIm)
          // First: coupling * weight
          const cwRe = couplingComplex.re * weightRe - couplingComplex.im * weightIm;
          const cwIm = couplingComplex.re * weightIm + couplingComplex.im * weightRe;
          
          // Then: (coupling*weight) * H
          cRe = cwRe * hRe - cwIm * hIm;
          cIm = cwRe * hIm + cwIm * hRe;
        } else {
          // Real coupling (existing behaviour)
          cRe = coupling * (weightRe * hRe - weightIm * hIm);
          cIm = coupling * (weightRe * hIm + weightIm * hRe);
        }

        sumRe_modal += cRe;
        sumIm_modal += cIm;
        activeTerms += 1;
        
        // Track per-mode contribution (magnitude + phase)
        const cMag = Math.sqrt(cRe * cRe + cIm * cIm);
        const cPhase = Math.atan2(cIm, cRe) * (180 / Math.PI); // degrees
        
        if (cMag > 1e-6) {
          // Store coupling info for debug (Part H3)
          let couplingInfo = { real: coupling };
          if (complexEigenfunctions && couplingComplex) {
            const couplingMag = Math.sqrt(couplingComplex.re * couplingComplex.re + couplingComplex.im * couplingComplex.im);
            const couplingPhase = Math.atan2(couplingComplex.im, couplingComplex.re) * (180 / Math.PI);
            couplingInfo = {
              real: coupling,
              amp: couplingComplex.amp,
              phaseDeg: couplingComplex.phaseDeg,
              complexMag: couplingMag,
              complexPhase: couplingPhase,
              complexRe: couplingComplex.re,
              complexIm: couplingComplex.im
            };
          }
          
          modeContribsThisBin.push({
            freq: mode.freq,
            type: mode.type,
            n: [mode.nx, mode.ny, mode.nz],
            magDb: 20 * Math.log10(cMag),
            phaseDeg: cPhase,
            coupling: coupling,
            couplingInfo: couplingInfo
          });
        }
      }
    }

    // Store top 3 mode contributors for this bin (for phase debug)
    if (modeContribsThisBin.length > 0) {
      const top3 = modeContribsThisBin
        .sort((a, b) => b.magDb - a.magDb)
        .slice(0, 3);
      
      // Only store for probe frequencies to avoid bloat
      if (__isProbeFreq(f)) {
        modeContributions[f.toFixed(1)] = top3;
      }
    }
    
    // LF Movement Probe: capture coupling terms at key frequencies
    const probeFreqs = [25, 35, 45];
    if (probeFreqs.includes(Math.round(f))) {
      // Find dominant mode near this frequency
      const nearestMode = modes
        .filter(m => Math.abs(m.freq - f) < 5)
        .sort((a, b) => Math.abs(a.freq - f) - Math.abs(b.freq - f))[0];
      
      if (nearestMode && sourcesUsed.length > 0) {
        const source = sourcesUsed[0];
        const coupling = computeSpatialCoupling(nearestMode, source, seat, room);
        const { srcCouplingTerm, rcvCouplingTerm } = getSpatialCouplingTerms(nearestMode, source, seat, room);
        
        const modalMag = Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal);
        const modalDbVal = 20 * Math.log10(Math.max(Number.EPSILON, modalMag));
        
        lfMovementProbe[f.toFixed(0)] = {
          nearestModeHz: nearestMode.freq.toFixed(1),
          modeIndices: [nearestMode.nx, nearestMode.ny, nearestMode.nz],
          sourceTerm: srcCouplingTerm.toFixed(4),
          seatTerm: rcvCouplingTerm.toFixed(4),
          totalCoupling: coupling.toFixed(4),
          modalMag: modalMag.toFixed(6),
          modalSplDb: modalDbVal.toFixed(2)
        };
      }
    }
    
    // SBIR (image source) calculation - integrated into modal summation
    let sbirPathsUsed = 0;
    let sbirStrongestReflection = null;
    
    // Compute SBIR frequency blend weight (REW-style transition)
    let sbirWeight = 1.0; // Default: full strength
    if (sbirEnabled && sbirBlendEnabled) {
      if (f <= sbirBlendStartHzActual) {
        // Below blend start: SBIR fully active (LF interference)
        sbirWeight = 1.0;
      } else if (f >= sbirBlendEndHzActual) {
        // Above blend end: SBIR fades out (modal dominates)
        sbirWeight = 0.0;
      } else {
        // Smooth transition (cosine taper)
        const t = (f - sbirBlendStartHzActual) / (sbirBlendEndHzActual - sbirBlendStartHzActual);
        sbirWeight = 0.5 * (1 + Math.cos(Math.PI * t)); // 1.0 → 0.0
      }
    }
    
    if (sbirEnabled) {
      for (let subIdx = 0; subIdx < sourcesUsed.length; subIdx++) {
        const source = sourcesUsed[subIdx];
        
        // Get product metadata and tuning
        const meta = subProductMeta && subProductMeta[subIdx] ? subProductMeta[subIdx] : null;
        let productRelativeDb = 0;
        if (meta && meta.relativeCurve && meta.relativeCurve[i] !== undefined) {
          productRelativeDb = meta.relativeCurve[i];
        }
        const productMagScale = Math.pow(10, productRelativeDb / 20);
        
        const subTuning = source.tuning || { gainDb: 0, delayMs: 0, polarity: 0 };
        const userGainLinear = Math.pow(10, subTuning.gainDb / 20);
        const autoLevelGainDb = mlpAutoLevelGainsDb[subIdx] || 0;
        const autoLevelGainLinear = Math.pow(10, autoLevelGainDb / 20);
        const gainLinear = userGainLinear * autoLevelGainLinear;
        
        const delayPhase = -2 * Math.PI * f * (subTuning.delayMs / 1000);
        const polarityPhase = (subTuning.polarity === 180 || subTuning.polarity === 'invert') ? Math.PI : 0;
        const totalPhase = delayPhase + polarityPhase;
        
        const weightMag = productMagScale * gainLinear;
        const weightRe = weightMag * Math.cos(totalPhase);
        const weightIm = weightMag * Math.sin(totalPhase);
        
        // Compute SBIR complex pressure (order 2 for live use, keeps it smooth)
        const sbirResult = computeSBIRComplexAtFreq({
          f,
          source,
          receiver: seat,
          roomDims: room,
          surfaceAbsorption: absorption,
          c,
          includeWalls: sbirIncludeWalls,
          includeFloorCeiling: sbirIncludeFloorCeiling,
          maxOrder: isDragging ? 1 : 2, // Reduce order while dragging for performance
          sbirDebugSingleFrontWall: sbirDebugSingleFrontWall, // DIAGNOSTIC: single reflection mode
        });
        
        // Apply weight to SBIR contribution
        sumRe_sbir += weightRe * sbirResult.re - weightIm * sbirResult.im;
        sumIm_sbir += weightRe * sbirResult.im + weightIm * sbirResult.re;
        
        // Track debug info (only at 40 Hz probe)
        if (Math.abs(f - 40) < 0.6) {
          sbirPathsUsed = sbirResult.pathsUsed;
          sbirStrongestReflection = sbirResult.strongestReflection;
        }

        // Track 63 Hz debug info (for single reflection test)
        if (sbirResult.debugAt63Hz && !sbirDebugProbe63Hz_captured) {
          sbirDebugProbe63Hz_captured = sbirResult.debugAt63Hz;
        }
      }
      
      // Apply frequency-dependent SBIR blend weight (REW-style transition)
      sumRe_sbir *= sbirWeight;
      sumIm_sbir *= sbirWeight;
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

    // Phase check probe (34 Hz for REW parity verification)
    if (Math.abs(f - 34.3) < 0.6) {
      const sumMag = Math.sqrt(sumRe_modal * sumRe_modal + sumIm_modal * sumIm_modal);
      const individualMags = modeContribsThisBin.map(m => Math.pow(10, m.magDb / 20));
      const maxIndividual = individualMags.length > 0 ? Math.max(...individualMags) : 0;
      
      if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG) {
        globalThis.__B44_PHASE_CHECK = {
          f: f.toFixed(1),
          sumRe: sumRe_modal.toFixed(6),
          sumIm: sumIm_modal.toFixed(6),
          sumMag: sumMag.toFixed(6),
          maxIndividualMag: maxIndividual.toFixed(6),
          cancelled: sumMag < (maxIndividual * 0.5),
          topModes: modeContribsThisBin.slice(0, 3)
        };
      }
    }
    
    // REW-style authoritative terms (computed ONCE per frequency):
    // - modalTerm: eigenmode summation (Allen-Berkley style)
    // - sbirTerm: direct + reflections (image source method, includes direct path at order 0)
    // - totalTerm: modal + sbir (coherent complex sum)

    // SEALED ROOM PRESSURE GAIN - Apply ONLY to modal term (not SBIR)
    // REW parity: modal pressure boosted below lowest axial, SBIR stays geometry-driven
    let sealedRoomGainLinear = 1.0;
    if (!rawEngineOutput && sealedBoostEnabled && lowestAxial && f < lowestAxial) {
      const octavesBelow = Math.log2(lowestAxial / f);
      const pressureGainDb = Math.min(sealedBoostMaxGainDb, sealedBoostKDbPerOct * octavesBelow);
      sealedRoomGainLinear = Math.pow(10, pressureGainDb / 20);
    }

    // Apply sealed gain to MODAL term only (SBIR remains unboosted)
    const modalTerm_re = sumRe_modal * sealedRoomGainLinear;
    const modalTerm_im = sumIm_modal * sealedRoomGainLinear;

    // Apply SBIR level matching trim (passed in from outer scope)
    // This ensures SBIR and modal terms are on the same "scale" in 30-80 Hz
    const sbirTerm_re = sumRe_sbir * sbirTrimLinearArg; // Includes direct path (order 0)
    const sbirTerm_im = sumIm_sbir * sbirTrimLinearArg;

    const totalTerm_re = modalTerm_re + sbirTerm_re;
    const totalTerm_im = modalTerm_im + sbirTerm_im;

    // componentView is a DEBUG LENS ONLY (term selection, no calibration changes)
    let sumRe_total = 0;
    let sumIm_total = 0;

    const view = componentViewOverride ?? componentView;

    if (view === 'modalOnly') {
      // Debug view: modal term only
      sumRe_total = modalTerm_re;
      sumIm_total = modalTerm_im;
    } else if (view === 'sbirOnly') {
      // Debug view: SBIR term only (includes direct + reflections, REW-like)
      sumRe_total = sbirTerm_re;
      sumIm_total = sbirTerm_im;
    } else {
      // Default REW view: total coherent sum (modal + sbir)
      sumRe_total = totalTerm_re;
      sumIm_total = totalTerm_im;
    }

    // COHERENT PRESSURE RAW: Pure complex magnitude (no processing)
    // This is the REFERENCE PHYSICS - position-dependent nulls come from here
    const coherentMag = Math.sqrt(sumRe_total * sumRe_total + sumIm_total * sumIm_total);
    const coherentPressureRaw = 20 * Math.log10(Math.max(Number.EPSILON, coherentMag));
    
    // Store component magnitudes for RMS calculation and debug visibility
    const modalMag = Math.sqrt(modalTerm_re * modalTerm_re + modalTerm_im * modalTerm_im);
    const sbirMag = Math.sqrt(sbirTerm_re * sbirTerm_re + sbirTerm_im * sbirTerm_im);
    const totalMag = Math.sqrt(totalTerm_re * totalTerm_re + totalTerm_im * totalTerm_im);

    const modalMagDb = 20 * Math.log10(Math.max(Number.EPSILON, modalMag));
    const sbirMagDb = 20 * Math.log10(Math.max(Number.EPSILON, sbirMag));
    const totalMagDb = 20 * Math.log10(Math.max(Number.EPSILON, totalMag));

    modalMagDb_all.push(modalMagDb);
    sbirMagDb_all.push(sbirMagDb);
    totalMagDb_all.push(totalMagDb);

    // Collect component magnitudes in calibration band (30-80 Hz) for SBIR level matching
    if (f >= 30 && f <= 80 && Number.isFinite(modalMagDb) && Number.isFinite(sbirMagDb)) {
      modalBandDb.push(modalMagDb);
      sbirBandDb.push(sbirMagDb);
    }

    // Start with coherent pressure, then apply processing layers (ONLY if not raw mode)
    let modalDb = coherentPressureRaw;
    
    // Mode density compensation (REW-ish) — MUST ramp in smoothly to avoid a cliff at Schroeder.
    const mdCompEnabled = (!rawEngineOutput && rewParityMode && activeTerms > 1);

    // Use a smooth transition window around Schroeder (starts a bit before, fully in a bit after).
    const mdCompStartHz = Math.max(70, schroederHz * 0.85);
    const mdCompEndHz   = Math.max(mdCompStartHz + 1, schroederHz * 1.15);

    let mdCompWeight = 0.0;
    if (mdCompEnabled) {
      if (f <= mdCompStartHz) mdCompWeight = 0.0;
      else if (f >= mdCompEndHz) mdCompWeight = 1.0;
      else {
        const t = (f - mdCompStartHz) / (mdCompEndHz - mdCompStartHz);
        // cosine ease-in (0 → 1) with no kink
        mdCompWeight = 0.5 * (1 - Math.cos(Math.PI * t));
      }

      const n = Math.max(1, activeTerms);
      const compDb = 10 * Math.log10(n) * 0.85;

      // Apply gradually (this prevents the sudden 150 Hz step)
      modalDb -= compDb * mdCompWeight;
    }

    // Apply leaky room LF roll-off (if room is not sealed)
    // Reduce LF below ~35 Hz with gentle shelving (REW-like behaviour)
    if (!rawEngineOutput && leakyRolloffEnabled && f < 35) {
      const octavesBelow = Math.log2(35 / f);
      const rolloffDb = -3.0 * octavesBelow; // -3 dB/octave below 35 Hz
      modalDb += Math.max(-9.0, rolloffDb); // Cap at -9 dB max reduction
    }
    
    // Store coherent raw for RAW mode output
    coherentRawDb.push(coherentPressureRaw);
    
    return modalDb;
  });
  
  return { splDb, modalBandDb, sbirBandDb, coherentRawDb };
  }; // End of runOnce

  // Run engine with normal sources - FIRST PASS to collect statistics
  const firstPass = runOnce(null, 1.0);
  const modalBandDbPass1 = firstPass.modalBandDb;
  const sbirBandDbPass1 = firstPass.sbirBandDb;

  // SBIR Level Matching (Part B): Compute trim to match SBIR to modal scale in 30-80 Hz
  let sbirTrimDb = 0;
  let sbirTrimLinear = 1.0;
  let sbirMatchingApplied = false;
  let modalMedianDb = 0;
  let sbirMedianDb = 0;

  if (rewParityMode && sbirEnabled && modalBandDbPass1.length >= 10 && sbirBandDbPass1.length >= 10) {
    // Compute medians
    const sortedModal = [...modalBandDbPass1].sort((a, b) => a - b);
    const sortedSbir = [...sbirBandDbPass1].sort((a, b) => a - b);

    modalMedianDb = sortedModal[Math.floor(sortedModal.length / 2)];
    sbirMedianDb = sortedSbir[Math.floor(sortedSbir.length / 2)];

    // Compute trim: bring SBIR median to match modal median
    sbirTrimDb = modalMedianDb - sbirMedianDb;
    sbirTrimLinear = Math.pow(10, sbirTrimDb / 20);
    sbirMatchingApplied = true;

    // Log the trim computation for audit
    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG) {
      console.log('[SBIR LEVEL MATCHING]', {
        modalMedian: modalMedianDb.toFixed(2),
        sbirMedian: sbirMedianDb.toFixed(2),
        trimDb: sbirTrimDb.toFixed(2),
        trimLinear: sbirTrimLinear.toFixed(4),
        bandSamples: modalBandDbPass1.length
      });
    }
  }

  // SECOND PASS: Run engine again with computed SBIR trim
  const secondPass = runOnce(null, sbirTrimLinear);
  const splDb = secondPass.splDb;
  const rawCoherentDb = secondPass.coherentRawDb;
  
  // REW-style coherence loss: transition from coherent pressure sum to energy-like behaviour above ~100-140 Hz
  // This makes the curve "come back down" at HF like REW does
  const shouldApplyCoherenceLoss = rewParityMode && componentView === 'modalPlusSbir';
  let splDbRew = splDb;
  let coherenceLossApplied = false;
  const cohStartHz = 90;
  const cohEndHz = 140;
  
  if (shouldApplyCoherenceLoss) {
    splDbRew = splDb.map((coherentDb, i) => {
      const f = freqs[i];
      if (!Number.isFinite(f) || !Number.isFinite(coherentDb)) return coherentDb;
      
      // Smooth transition from coherent (LF) to energy-like (HF)
      const t = Math.max(0, Math.min(1, (f - cohStartHz) / Math.max(1e-6, (cohEndHz - cohStartHz))));
      const smoothT = t * t * (3 - 2 * t); // Smoothstep
      
      // Progressive penalty: by 140 Hz, reduce by ~10 dB
      const penaltyDb = smoothT * 10.0;
      
      return coherentDb - penaltyDb;
    });
    coherenceLossApplied = true;
  }
  
  // Use REW-processed array for rest of pipeline when coherence loss is active
  const splDbForPipeline = coherenceLossApplied ? splDbRew : splDb;
  
  // Compute RMS for component magnitudes (20-200 Hz band) - DO THIS 5
  const computeRmsDb = (dbArray, freqsArr) => {
    const band = dbArray
      .map((db, i) => freqsArr[i] >= 20 && freqsArr[i] <= 200 ? db : null)
      .filter(v => v !== null && Number.isFinite(v));
    
    if (band.length === 0) return 0;
    
    const sumSq = band.reduce((acc, db) => acc + db * db, 0);
    return Math.sqrt(sumSq / band.length);
  };

  const modalRmsDb_20_200 = computeRmsDb(modalMagDb_all, freqs);
  const sbirRmsDb_20_200 = computeRmsDb(sbirMagDb_all, freqs);
  const totalRmsDb_20_200 = computeRmsDb(totalMagDb_all, freqs);
  
  // SBIR debug probe (40 Hz for acceptance test)
  let sbirDebugProbe40Hz = null;
  if (sbirEnabled && !isDragging && sourcesLocal.length > 0 && seat) {
    const idx40 = freqs.findIndex(f => Math.abs(f - 40) < 0.6);
    if (idx40 >= 0) {
      const source = sourcesLocal[0];
      
      // Compute direct-only magnitude
      const dx = source.x - seat.x;
      const dy = source.y - seat.y;
      const dz = (source.z ?? 0) - (seat.z ?? 1.2);
      const directDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const directMag = 1 / Math.max(0.25, directDist);
      
      // Compute SBIR field (direct + reflections)
      const sbirResult = computeSBIRComplexAtFreq({
        f: 40,
        source,
        receiver: seat,
        roomDims: room,
        surfaceAbsorption: absorption,
        c,
        includeWalls: sbirIncludeWalls,
        includeFloorCeiling: sbirIncludeFloorCeiling,
        maxOrder: 2,
      });
      
      const sbirTotalMag = Math.sqrt(sbirResult.re * sbirResult.re + sbirResult.im * sbirResult.im);
      
      // Compute modal-only at 40 Hz (from stored complex sums during loop)
      // We'll need to track this separately - for now use the combined result
      
      sbirDebugProbe40Hz = {
        directOnlyDb: Number.isFinite(directMag) ? (20 * Math.log10(Math.max(Number.EPSILON, directMag))) : 'N/A',
        sbirTotalDb: Number.isFinite(sbirTotalMag) ? (20 * Math.log10(Math.max(Number.EPSILON, sbirTotalMag))) : 'N/A',
        combinedResultDb: Number.isFinite(splDb?.[idx40]) ? splDb[idx40].toFixed(2) : 'N/A',
        pathsUsed: sbirResult.pathsUsed,
        strongestReflection: sbirResult.strongestReflection
      };
    }
  }

  // PRESSURE REGION SUPPORT: FULLY DISABLED (REW parity)
  // REW's Room Simulator does not apply artificial pressure-zone boost
  // Kept for future reference only - all gain values set to zero

    // Pressure region is now handled inline during modal summation
    // (No post-processing needed - losses already bypassed below lowest axial)

    // Schroeder blend: FIXED RULES to preserve modal nulls
    // NEW: Start at 1.0 × Schroeder (not 0.7), never fill nulls, only tame peaks
    let splDbSchroeder = splDbForPipeline;
    if (!rawEngineOutput && rewParityMode && schroederHz > 0) {
      splDbSchroeder = splDbForPipeline.map((db, i) => {
        const f = freqs[i];

        // NEW BLEND RULES (Part B):
        // - blendStart = 1.0 × Schroeder (protects modal region)
        // - blendEnd = 1.8 × Schroeder (gentle transition)
        const blendStart = schroederHz * 1.0;
        const blendEnd = schroederHz * 1.8;

        // Below blendStart: NO blending at all (preserve coherent result)
        if (f < blendStart) return db;

        // Above blendEnd: allow diffuse/statistical target to dominate
        const t = Math.max(0, Math.min(1, (f - blendStart) / Math.max(1e-6, (blendEnd - blendStart))));

        // Gentle roll-off to prevent upper bass inflation
        const octavesAbove = Math.log2(f / blendStart);
        const rolloffDb = -1.0 * octavesAbove;

        // Simple target: a mild downward tilt + rolloff
        const target = dbAt(blendStart, freqs, splDbForPipeline) - 3 * Math.log2(f / blendStart) + rolloffDb;

        const blendedDb = (1 - t) * db + t * target;

        // CRITICAL (Part B2): Preserve null depth by capping blend
        // Never allow blend to rise more than +2 dB above coherent curve
        // NULLS MUST STAY DEEP - this is physical, not aesthetic
        return Math.min(blendedDb, db + 2.0);
        });
        }

        // AUDIT CHECKPOINT: Schroeder blend should preserve nulls below 1.0×Schroeder
        // If you're seeing nulls get filled in, the blend logic above is broken

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

  // Apply smoothing if requested AND not raw mode (create NEW array, never mutate)
  const smoothingApplied = (!rawEngineOutput && smoothing !== 'none') ? smoothing : 'none';
  const splDbSmoothed = (!rawEngineOutput && smoothing !== 'none') 
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
  
  // All mode markers (for REW parity overlay)
  const modeMarkersAllHz = [...modes]
    .map(m => m.freq)
    .sort((a, b) => a - b);
  
  // First 60 modes for debug list
  const modeListFirst60 = [...modes].slice(0, 60).map(m => {
    let axisLabel = null;
    if (m.type === 'axial') {
      if (m.nx > 0 && m.ny === 0 && m.nz === 0) axisLabel = 'W';
      else if (m.ny > 0 && m.nx === 0 && m.nz === 0) axisLabel = 'L';
      else if (m.nz > 0 && m.nx === 0 && m.ny === 0) axisLabel = 'H';
    }
    return {
      fHz: Number(m.freq.toFixed(1)),
      type: m.type,
      nx: m.nx,
      ny: m.ny,
      nz: m.nz,
      axisLabel
    };
  });
  
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

  // Use smoothed modal curve (SBIR is now integrated into splDb during summation)
  // REW parity: always use unsmoothed data for plotting (preserve null depth)
  // Smoothing happens visually via chart interpolation, not data mutation
  let finalDb = rewParityMode ? splDbRepaired : splDbSmoothed;
  const plottedDb = (!rawEngineOutput && smoothing !== 'none') ? splDbSmoothed : splDbRepaired;

  if (!Array.isArray(finalDb) || finalDb.length === 0) {
    finalDb = Array.isArray(splDb) ? [...splDb] : [];
  }

  // Always compute MLP reference (30-80 Hz median) for anchoring (Part D1)
  // CRITICAL: This is ONLY applied to the processed output, NEVER to RAW
  const calRefBandHz = [30, 80];
  const mlpBandValues = freqs
  .map((f, i) => f >= calRefBandHz[0] && f <= calRefBandHz[1] && isFinite(finalDb[i]) ? finalDb[i] : null)
  .filter(v => v !== null);

  // Define normRefDb early (REW Compare View needs this to never crash)
  let normRefDb = isRelative ? 0 : 85;

  if (mlpBandValues.length >= 10) {
    const sorted = [...mlpBandValues].sort((a, b) => a - b);
    const mlpMedianDb = sorted[Math.floor(sorted.length / 2)];
    calRefMedianDbBefore = mlpMedianDb;
    normRefDb = mlpMedianDb; // Actual computed reference for this run

    // REW Compare mode: no calibration offset (keep curve as-computed)
    if (rewParityMode) {
      calibrationOffsetDb = 0;
      normAppliedActual = false;
    } else if (isRelative) {
      // Relative view: normalize to 0 dB
      const targetDb = Number.isFinite(normalizeToDb) ? normalizeToDb : 0;
      calibrationOffsetDb = targetDb - mlpMedianDb;
      normAppliedActual = true;
    } else {
      // Absolute view: calibrate so MLP 30-80 Hz median = 85 dB (reference cinema level)
      const targetAbsoluteDb = 85;
      calibrationOffsetDb = targetAbsoluteDb - mlpMedianDb;
    }

    // Apply calibration offset (will be 0 in REW Compare mode)
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
  const warnings = [];
  
  const tol = 0.01; // 1 cm tolerance
  const seatX_frac = seat.x / widthM;
  const seatY_frac = seat.y / lengthM;
  const seatZ_frac = (seat.z ?? 1.2) / heightM;

  const widthOddModesSuppressed = Math.abs(seat.x - widthM / 2) < tol;
  const lengthOddModesSuppressed = Math.abs(seat.y - lengthM / 2) < tol;
  const heightOddModesSuppressed = Math.abs((seat.z ?? 1.2) - heightM / 2) < tol;

  if (widthOddModesSuppressed) {
    warnings.push("Seat is near width centre; odd width modes suppressed. L/R sub moves may show reduced LF change at this seat.");
  }
  if (lengthOddModesSuppressed) {
    warnings.push("Seat is near length centre; odd length modes suppressed. Front/back sub moves may show reduced LF change at this seat.");
  }
  if (heightOddModesSuppressed) {
    warnings.push("Seat is near height centre; odd height modes suppressed. Floor/ceiling sub moves may show reduced LF change at this seat.");
  }

  if (__debugBass) {
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
    
    const rawDbBeforeCal = splDbForPipeline[idx]; // Before any calibration
    const finalDbValue = finalDb[idx]; // After all processing (calibration + normalization)
    
    // Compute sealed room pressure gain if enabled
    let pressureGainDb = 0;
    if (sealedBoostEnabled && lowestAxial && fProbe < lowestAxial) {
      const octavesBelow = Math.log2(lowestAxial / fProbe);
      pressureGainDb = Math.min(sealedBoostMaxGainDb, sealedBoostKDbPerOct * octavesBelow);
    }
    
    // Count active terms at this frequency (for debug)
    let activeTermsAtFreq = 0;
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
      const df = Math.abs(fProbe - f0);
      if (df > 5 * bandwidth && df > 20) continue;
      
      for (let subIdx = 0; subIdx < sourcesLocal.length; subIdx++) {
        const source = sourcesLocal[subIdx];
        const coupling = computeSpatialCoupling(mode, source, seat, room);
        if (Math.abs(coupling) >= 1e-6) {
          activeTermsAtFreq += 1;
        }
      }
    }
    
    // Compute mode density compensation at this frequency
    let modeDensityCompDb = 0;
    if (rewParityMode && fProbe >= 70 && activeTermsAtFreq > 1) {
      const n = Math.max(1, activeTermsAtFreq);
      modeDensityCompDb = 10 * Math.log10(n) * 0.85;
    }
    
    return {
      freq: fProbe,
      rawDbBeforeCal: rawDbBeforeCal.toFixed(2),
      finalDbAfterCal: finalDbValue.toFixed(2),
      pressureGainDb: pressureGainDb.toFixed(2),
      belowLowestAxial: lowestAxial && fProbe < lowestAxial,
      activeTerms: activeTermsAtFreq,
      modeDensityCompDb: modeDensityCompDb.toFixed(2)
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

  // ---- Parity debug helpers (read-only, no DSP changes) ----
  const peakDipDelta = (freqsArr, dbArr, fMin, fMax) => {
    if (!Array.isArray(freqsArr) || !Array.isArray(dbArr)) {
      return { peakDb: "N/A", dipDb: "N/A", peakFreq: "N/A", dipFreq: "N/A", deltaDb: "N/A" };
    }

    let peak = -Infinity, dip = Infinity;
    let peakF = null, dipF = null;
    let found = 0;

    for (let i = 0; i < freqsArr.length; i++) {
      const f = freqsArr[i];
      if (f < fMin || f > fMax) continue;

      const v = dbArr[i];
      if (!Number.isFinite(v)) continue;

      found++;
      if (v > peak) { peak = v; peakF = f; }
      if (v < dip)  { dip  = v; dipF  = f; }
    }

    if (!found) {
      return { peakDb: "N/A", dipDb: "N/A", peakFreq: "N/A", dipFreq: "N/A", deltaDb: "N/A" };
    }

    return {
      peakDb: peak.toFixed(2),
      dipDb: dip.toFixed(2),
      peakFreq: peakF.toFixed(1),
      dipFreq: dipF.toFixed(1),
      deltaDb: (peak - dip).toFixed(2),
    };
  };

  const avgDb = (freqsArr, dbArr, fMin, fMax) => {
    if (!Array.isArray(freqsArr) || !Array.isArray(dbArr)) return "N/A";

    let sum = 0;
    let n = 0;

    for (let i = 0; i < freqsArr.length; i++) {
      const f = freqsArr[i];
      if (f < fMin || f > fMax) continue;

      const v = dbArr[i];
      if (!Number.isFinite(v)) continue;

      sum += v;
      n++;
    }

    if (!n) return "N/A";
    return (sum / n).toFixed(2);
  };

  // ---- Parity audits: raw coherent vs final plotted ----
  let parityAudits = null;

  // Use plottedDb for parity audit (shows what smoothing is doing)
  const finalPlottedDb = (Array.isArray(plottedDb) && plottedDb.length > 0) ? plottedDb : finalDb;

  const buildParityStats = (rawDb, finalDbArr) => {
    const raw40_70 = peakDipDelta(freqs, rawDb, 40, 70);
    const fin40_70 = peakDipDelta(freqs, finalDbArr, 40, 70);

    const rawDelta = raw40_70.deltaDb;
    const finDelta = fin40_70.deltaDb;

    const deltaShrink =
      (rawDelta !== "N/A" && finDelta !== "N/A")
        ? (parseFloat(rawDelta) - parseFloat(finDelta)).toFixed(2)
        : "N/A";

    return {
      raw: {
        band40_70Hz: raw40_70,
        band20_40Hz_avgDb: avgDb(freqs, rawDb, 20, 40),
        band100_160Hz_avgDb: avgDb(freqs, rawDb, 100, 160),
      },
      final: {
        band40_70Hz: fin40_70,
        band20_40Hz_avgDb: avgDb(freqs, finalDbArr, 20, 40),
        band100_160Hz_avgDb: avgDb(freqs, finalDbArr, 100, 160),
      },
      deltaShrinkDb_40_70: deltaShrink,
    };
  };

  // Always compute modalPlusSbir (the plotted curve)
  parityAudits = {
    modalPlusSbir: buildParityStats(rawCoherentDb, finalPlottedDb),
  };

  // When debug is enabled, also include RAW-only component view stats (no final pipeline duplication)
  if (__debugBass && !isDragging) {
    const modalOnlyPass = runOnce(null, sbirTrimLinear, "modalOnly");
    const sbirOnlyPass  = runOnce(null, sbirTrimLinear, "sbirOnly");

    parityAudits.componentViews = {
      modalOnly: {
        raw: {
          band40_70Hz: peakDipDelta(freqs, modalOnlyPass.coherentRawDb, 40, 70),
          band20_40Hz_avgDb: avgDb(freqs, modalOnlyPass.coherentRawDb, 20, 40),
          band100_160Hz_avgDb: avgDb(freqs, modalOnlyPass.coherentRawDb, 100, 160),
        },
        note: "Raw coherent only (final is not computed for component views to avoid duplicating the pipeline).",
      },
      sbirOnly: {
        raw: {
          band40_70Hz: peakDipDelta(freqs, sbirOnlyPass.coherentRawDb, 40, 70),
          band20_40Hz_avgDb: avgDb(freqs, sbirOnlyPass.coherentRawDb, 20, 40),
          band100_160Hz_avgDb: avgDb(freqs, sbirOnlyPass.coherentRawDb, 100, 160),
        },
        note: "Raw coherent only (final is not computed for component views to avoid duplicating the pipeline).",
      },
    };
  }

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
        coherenceLossApplied: false,
      }
    };
  }

  // Build base return object (all fresh arrays/objects to avoid frozen mutations)
  // CRITICAL: Always return valid arrays so REW Compare can't blank the graph
  const safeFreqs = Array.isArray(freqs) && freqs.length > 0 ? freqs : [];
  const safeFinalDb = Array.isArray(finalDb) && finalDb.length > 0 ? finalDb : (Array.isArray(splDb) ? splDb : []);
  const safePlottedDb = Array.isArray(plottedDb) && plottedDb.length > 0 ? plottedDb : safeFinalDb;

  const baseReturn = {
    freqs: [...safeFreqs],
    splDb: [...safeFinalDb],
    plottedDb: [...safePlottedDb],
    coherentRawDb: rewParityMode ? [...rawCoherentDb] : null,
    debug: {
      schroederHz,
      modeMarkersHz: [...modeMarkersHz],
      modeMarkersAllHz: [...modeMarkersAllHz],
      modeMarkers: modeMarkers.map(m => ({ ...m, n: [...m.n] })),
      modeListFirst60: [...modeListFirst60],
      modeCount: modes.length,
      modalModeCountUsed: modes.length, // Tracks actual mode count used in plot (Part C)
      modeIsolationActive: modeIsolation && modeIsolation !== 'off',
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
      imageFieldEnabled: imageFieldEnabledActual,
      reflectionBeta: beta ? {
        front: beta.front.toFixed(3),
        back: beta.back.toFixed(3),
        left: beta.left.toFixed(3),
        right: beta.right.toFixed(3),
        ceiling: beta.ceiling.toFixed(3),
        floor: beta.floor.toFixed(3)
      } : null,
      sbirEnabled,
      sbirMaxOrder: sbirMaxOrder,
      sbirBlendStartHz: sbirEnabled ? sbirBlendStartHzActual.toFixed(1) : 'N/A',
      sbirBlendEndHz: sbirEnabled ? sbirBlendEndHzActual.toFixed(1) : 'N/A',
      sbirDebugProbe40Hz: !isDragging ? sbirDebugProbe40Hz : null,
      sbirDebugProbe63Hz: !isDragging && sbirDebugProbe63Hz_captured ? sbirDebugProbe63Hz_captured : null,
      modeContributions: !isDragging ? modeContributions : null,
      phaseCheckAvailable: typeof globalThis !== 'undefined' && globalThis.__B44_PHASE_CHECK ? true : false,
      calRefBandHz: calRefBandHz,
      calRefMedianDbBefore: Number.isFinite(calRefMedianDbBefore) ? calRefMedianDbBefore.toFixed(2) : 'N/A',
      calOffsetAppliedDb: Number.isFinite(calibrationOffsetDb) ? calibrationOffsetDb.toFixed(2) : '0.00',
      calRefMedianDbAfter: Number.isFinite(calRefMedianDbAfter) ? calRefMedianDbAfter.toFixed(2) : 'N/A',
      rawEngineOutputMode: rawEngineOutput,
      blendStartHz: !rawEngineOutput && schroederHz > 0 ? (schroederHz * 1.0).toFixed(1) : 'N/A',
      blendEndHz: !rawEngineOutput && schroederHz > 0 ? (schroederHz * 1.8).toFixed(1) : 'N/A',
      modeDensityCompActive: !rawEngineOutput && rewParityMode,
      modeCouplingSanity: __b44ModeCouplingSanity ? { 
        seatM: { ...__b44ModeCouplingSanity.seatM },
        srcM: { ...__b44ModeCouplingSanity.srcM },
        normSeat: { ...__b44ModeCouplingSanity.normSeat },
        normSrc: { ...__b44ModeCouplingSanity.normSrc },
        seatShape_100: __b44ModeCouplingSanity.seatShape_100,
        srcShape_100: __b44ModeCouplingSanity.srcShape_100,
        coupling_100: __b44ModeCouplingSanity.coupling_100,
      } : null,
      warnings: warnings.length > 0 ? warnings : null,
      lfMovementProbe: Object.keys(lfMovementProbe).length > 0 ? lfMovementProbe : null,
      componentView: componentView, // Debug lens: which term is being plotted
      componentViewNote: "Modal/SBIR/Total are debug views of the same simulation - calibration never changes",
      coherenceLossApplied: coherenceLossApplied,
      coherenceLossParams: coherenceLossApplied ? { cohStartHz, cohEndHz, maxPenaltyDb: 10.0 } : null,
      modalRmsDb_20_200: modalRmsDb_20_200.toFixed(1), // Modal term RMS (20-200 Hz)
      sbirRmsDb_20_200: sbirRmsDb_20_200.toFixed(1), // SBIR term RMS (includes direct)
      totalRmsDb_20_200: totalRmsDb_20_200.toFixed(1), // Total term RMS (modal + sbir)
      sbirLevelMatching: sbirMatchingApplied ? {
        modalMedianDb: modalMedianDb.toFixed(2),
        sbirMedianDb: sbirMedianDb.toFixed(2),
        trimAppliedDb: sbirTrimDb.toFixed(2),
        trimLinear: sbirTrimLinear.toFixed(4)
      } : null,
      sealedRoom: sealedRoom,
      subDistancesToMLP: mlpPosition ? sourcePositions.map(s => {
        const dx = s.x - mlpPosition.x;
        const dy = s.y - mlpPosition.y;
        const dz = (s.z ?? 0) - (mlpPosition.z ?? 1.2);
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        return {
          subId: s.id || 'unknown',
          distanceM: dist.toFixed(3),
          effectiveDelayMs: (s.tuning?.delayMs ?? 0).toFixed(2)
        };
      }) : null,
      parityAudits,
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
 * Compute SBIR (image source) complex pressure at one frequency
 * REW-style: direct + reflected paths with lossy boundaries up to 2nd order
 * Returns { re, im, pathsUsed, strongestReflection, debugAt63Hz }
 */
function computeSBIRComplexAtFreq({
  f,
  source,
  receiver,
  roomDims,
  surfaceAbsorption,
  c,
  includeWalls,
  includeFloorCeiling,
  maxOrder = 2,
  sbirDebugSingleFrontWall = false, // DIAGNOSTIC: only direct + front wall reflection
}) {
  const k = (2 * Math.PI * f) / c;
  const { widthM, lengthM, heightM } = roomDims;
  
  let sumRe = 0;
  let sumIm = 0;
  let pathsUsed = 0;
  const reflections = []; // Track for debug
  let debugAt63Hz = null; // Detailed debug at 63 Hz probe
  
  // Reflection coefficients (amplitude)
  const R = {
    left: Math.sqrt(Math.max(0, 1 - surfaceAbsorption.left)),
    right: Math.sqrt(Math.max(0, 1 - surfaceAbsorption.right)),
    front: Math.sqrt(Math.max(0, 1 - surfaceAbsorption.front)),
    back: Math.sqrt(Math.max(0, 1 - surfaceAbsorption.back)),
    floor: Math.sqrt(Math.max(0, 1 - surfaceAbsorption.floor)),
    ceiling: Math.sqrt(Math.max(0, 1 - surfaceAbsorption.ceiling)),
  };
  
  // Order 0: Direct path
  const dx0 = source.x - receiver.x;
  const dy0 = source.y - receiver.y;
  const dz0 = (source.z ?? 0.0) - (receiver.z ?? 1.2);
  const r0 = Math.sqrt(dx0*dx0 + dy0*dy0 + dz0*dz0);

  let directPath = null;
  if (r0 > 0) {
    const A0 = 1 / Math.max(0.25, r0);
    const phase0 = -k * r0;
    sumRe += A0 * Math.cos(phase0);
    sumIm += A0 * Math.sin(phase0);
    pathsUsed++;
    directPath = { r: r0, A: A0, phase: phase0, surface: 'direct', re: A0 * Math.cos(phase0), im: A0 * Math.sin(phase0) };
  }

  // DIAGNOSTIC MODE: If single-front-wall mode is ON, only process front wall reflection
  const diagnosticSingleReflectionMode = sbirDebugSingleFrontWall;
  
  // Order 1: First-order reflections (single bounce)
  let frontWallReflection = null; // For diagnostic tracking
  if (maxOrder >= 1) {
    const order1Images = [];

    if (diagnosticSingleReflectionMode) {
      // DIAGNOSTIC: Only front wall reflection
      if (includeWalls) {
        order1Images.push(
          { x: source.x, y: -source.y, z: source.z ?? 0.0, loss: R.front, surface: 'front' }
        );
      }
    } else {
      // Normal mode: all reflections
      if (includeWalls) {
        order1Images.push(
          { x: -source.x, y: source.y, z: source.z ?? 0.0, loss: R.left, surface: 'left' },
          { x: 2*widthM - source.x, y: source.y, z: source.z ?? 0.0, loss: R.right, surface: 'right' },
          { x: source.x, y: -source.y, z: source.z ?? 0.0, loss: R.front, surface: 'front' },
          { x: source.x, y: 2*lengthM - source.y, z: source.z ?? 0.0, loss: R.back, surface: 'back' }
        );
      }

      if (includeFloorCeiling) {
        order1Images.push(
          { x: source.x, y: source.y, z: -(source.z ?? 0.0), loss: R.floor, surface: 'floor' },
          { x: source.x, y: source.y, z: 2*heightM - (source.z ?? 0.0), loss: R.ceiling, surface: 'ceiling' }
        );
      }
    }

    for (const img of order1Images) {
      const dxi = img.x - receiver.x;
      const dyi = img.y - receiver.y;
      const dzi = img.z - (receiver.z ?? 1.2);
      const ri = Math.sqrt(dxi*dxi + dyi*dyi + dzi*dzi);

      if (ri > 0) {
        const Ai = img.loss / Math.max(0.25, ri);
        const phasei = -k * ri;
        const contrib_re = Ai * Math.cos(phasei);
        const contrib_im = Ai * Math.sin(phasei);

        sumRe += contrib_re;
        sumIm += contrib_im;
        pathsUsed++;

        const contribMag = Math.sqrt(contrib_re * contrib_re + contrib_im * contrib_im);
        reflections.push({ surface: img.surface, order: 1, mag: contribMag });

        // Track front wall reflection for diagnostic
        if (img.surface === 'front') {
          frontWallReflection = {
            r: ri,
            A: Ai,
            phase: phasei,
            re: contrib_re,
            im: contrib_im,
            mag: contribMag
          };
        }
      }
    }
  }
  
  // Order 2: Second-order reflections (two bounces, corner paths)
  // Skip in diagnostic single-reflection mode
  if (maxOrder >= 2 && includeWalls && !diagnosticSingleReflectionMode) {
    // Only do wall-wall corners for performance (4 horizontal corners)
    const order2Images = [
      { x: -source.x, y: -source.y, z: source.z ?? 0.0, loss: R.left * R.front, surface: 'left+front' },
      { x: -source.x, y: 2*lengthM - source.y, z: source.z ?? 0.0, loss: R.left * R.back, surface: 'left+back' },
      { x: 2*widthM - source.x, y: -source.y, z: source.z ?? 0.0, loss: R.right * R.front, surface: 'right+front' },
      { x: 2*widthM - source.x, y: 2*lengthM - source.y, z: source.z ?? 0.0, loss: R.right * R.back, surface: 'right+back' },
    ];
    
    for (const img of order2Images) {
      const dxi = img.x - receiver.x;
      const dyi = img.y - receiver.y;
      const dzi = img.z - (receiver.z ?? 1.2);
      const ri = Math.sqrt(dxi*dxi + dyi*dyi + dzi*dzi);
      
      if (ri > 0) {
        const Ai = img.loss / Math.max(0.25, ri);
        const phasei = -k * ri;
        const contrib_re = Ai * Math.cos(phasei);
        const contrib_im = Ai * Math.sin(phasei);
        
        sumRe += contrib_re;
        sumIm += contrib_im;
        pathsUsed++;
        
        const contribMag = Math.sqrt(contrib_re * contrib_re + contrib_im * contrib_im);
        reflections.push({ surface: img.surface, order: 2, mag: contribMag });
      }
    }
  }
  
  // Find strongest reflection for debug
  let strongestReflection = null;
  if (reflections.length > 0) {
    const strongest = reflections.reduce((max, r) => r.mag > max.mag ? r : max, reflections[0]);
    strongestReflection = {
      surface: strongest.surface,
      order: strongest.order,
      magDb: 20 * Math.log10(Math.max(Number.EPSILON, strongest.mag))
    };
  }

  // [63 Hz DIAGNOSTIC] - Single reflection interference test
  if (Math.abs(f - 63) < 0.6 && directPath && frontWallReflection) {
    const directMag = directPath.A;
    const reflectedMag = frontWallReflection.A;
    const directPhase = directPath.phase * (180 / Math.PI); // radians to degrees
    const reflectedPhase = frontWallReflection.phase * (180 / Math.PI);
    const phaseDiff = ((reflectedPhase - directPhase) % 360 + 360) % 360; // Normalize to 0-360

    const combinedMag = Math.sqrt(sumRe * sumRe + sumIm * sumIm);

    debugAt63Hz = {
      freq: f.toFixed(1),
      directDistance: directPath.r.toFixed(3),
      reflectedDistance: frontWallReflection.r.toFixed(3),
      directMagLinear: directMag.toFixed(6),
      directMagDb: (20 * Math.log10(directMag)).toFixed(2),
      reflectedMagLinear: reflectedMag.toFixed(6),
      reflectedMagDb: (20 * Math.log10(reflectedMag)).toFixed(2),
      phaseDiffDeg: phaseDiff.toFixed(1),
      combinedMagLinear: combinedMag.toFixed(6),
      combinedMagDb: (20 * Math.log10(Math.max(Number.EPSILON, combinedMag))).toFixed(2),
      directRe: directPath.re.toFixed(6),
      directIm: directPath.im.toFixed(6),
      reflectedRe: frontWallReflection.re.toFixed(6),
      reflectedIm: frontWallReflection.im.toFixed(6),
      sumRe: sumRe.toFixed(6),
      sumIm: sumIm.toFixed(6),
      reflectionCoeff: R.front.toFixed(3),
      diagnosticMode: diagnosticSingleReflectionMode ? 'SINGLE FRONT WALL ONLY' : 'ALL REFLECTIONS'
    };
  }

  // [SBIR SANITY CHECK @80Hz] - Verify SBIR uses actual source positions (combing test)
  if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG && Math.abs(f - 80) < 0.6) {
    const allPaths = [
      directPath,
      ...reflections.map(r => ({ 
        surface: r.surface, 
        order: r.order, 
        A: Math.sqrt(r.mag), 
        r: null // Distance not stored in reflection tracking
      }))
    ].filter(Boolean);
    
    const top3 = allPaths
      .sort((a, b) => (b.A || 0) - (a.A || 0))
      .slice(0, 3);
    
    console.log('[SBIR SANITY CHECK @80Hz]', {
      freq: f.toFixed(1),
      sourcePos: { x: source.x.toFixed(3), y: source.y.toFixed(3), z: (source.z ?? 0).toFixed(3) },
      receiverPos: { x: receiver.x.toFixed(3), y: receiver.y.toFixed(3), z: (receiver.z ?? 1.2).toFixed(3) },
      directPathDistance: r0.toFixed(3),
      pathsUsed,
      top3Paths: top3.map(p => ({
        surface: p.surface,
        order: p.order || 0,
        distance: p.r !== null ? p.r.toFixed(3) : 'N/A',
        amplitude: p.A.toFixed(6),
        phase: p.phase !== undefined ? (p.phase * 180 / Math.PI).toFixed(1) + '°' : 'N/A'
      })),
      strongestReflectionSurface: strongestReflection?.surface || 'none',
      strongestReflectionMagDb: strongestReflection?.magDb.toFixed(1) || 'N/A'
    });
  }
  
  return { re: sumRe, im: sumIm, pathsUsed, strongestReflection, debugAt63Hz };
  }

/**
 * Compute spatial coupling using cosine pressure mode shapes (real eigenfunctions)
 * Returns total coupling (for engine use) - uses direct meters, no normalization
 * 
 * REW-style spatial averaging: averages coupling over a small region (±10cm) to prevent
 * perfect nulls at nodal planes. Real mics and sources have finite size.
 */
function computeSpatialCoupling(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  // Safe guard: prevent division by zero
  const W = Math.max(1e-6, widthM);
  const L = Math.max(1e-6, lengthM);
  const H = Math.max(1e-6, heightM);
  
  // Helper: compute coupling at a single point
  const couplingAtPoint = (srcPos, rcvPos) => {
    const srcX = nx > 0 ? Math.cos(nx * Math.PI * srcPos.x / W) : 1;
    const srcY = ny > 0 ? Math.cos(ny * Math.PI * srcPos.y / L) : 1;
    const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (srcPos.z ?? 0.0) / H) : 1;
    
    const rcvX = nx > 0 ? Math.cos(nx * Math.PI * rcvPos.x / W) : 1;
    const rcvY = ny > 0 ? Math.cos(ny * Math.PI * rcvPos.y / L) : 1;
    const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * (rcvPos.z ?? 1.2) / H) : 1;
    
    return (srcX * srcY * srcZ) * (rcvX * rcvY * rcvZ);
  };
  
  // Helper: clamp position to room bounds
  const clamp = (pos, dims) => ({
    x: Math.max(0.01, Math.min(dims.widthM - 0.01, pos.x)),
    y: Math.max(0.01, Math.min(dims.lengthM - 0.01, pos.y)),
    z: Math.max(0.01, Math.min(dims.heightM - 0.01, pos.z ?? 0.0))
  });
  
  // REW-style spatial averaging: 7-point stencil (centre + 6 directions)
  const r = SPATIAL_AVG_RADIUS_M;
  const offsets = [
    { x: 0, y: 0, z: 0 },      // centre
    { x: r, y: 0, z: 0 },      // +X
    { x: -r, y: 0, z: 0 },     // -X
    { x: 0, y: r, z: 0 },      // +Y
    { x: 0, y: -r, z: 0 },     // -Y
    { x: 0, y: 0, z: r },      // +Z
    { x: 0, y: 0, z: -r }      // -Z
  ];
  
  // Average coupling over source and receiver regions
  let sumCoupling = 0;
  let count = 0;
  
  for (const srcOffset of offsets) {
    const srcPos = clamp({
      x: source.x + srcOffset.x,
      y: source.y + srcOffset.y,
      z: (source.z ?? 0.0) + srcOffset.z
    }, roomDims);
    
    for (const rcvOffset of offsets) {
      const rcvPos = clamp({
        x: receiver.x + rcvOffset.x,
        y: receiver.y + rcvOffset.y,
        z: (receiver.z ?? 1.2) + rcvOffset.z
      }, roomDims);
      
      sumCoupling += couplingAtPoint(srcPos, rcvPos);
      count++;
    }
  }
  
  // Return averaged coupling (49 points total: 7 source × 7 receiver)
  return sumCoupling / count;
}

/**
 * Compute spatial coupling with phase-only complex behaviour (Part H3 - Phase debug)
 * Returns { re, im, amp, phaseDeg } for complex coupling
 * 
 * CRITICAL: Amplitude uses COSINE terms (position-dependent, correct physics)
 * Phase uses eigenfunction phase difference (smooth variation for debugging)
 * This is NOT REW parity - it's a debug mode to observe phase without breaking amplitude
 */
function computeSpatialCouplingComplex(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  // Safe guard: prevent division by zero
  const W = Math.max(1e-6, widthM);
  const L = Math.max(1e-6, lengthM);
  const H = Math.max(1e-6, heightM);
  
  // AMPLITUDE: Use cosine terms (exactly like real coupling)
  const srcCosX = nx > 0 ? Math.cos(nx * Math.PI * source.x / W) : 1;
  const srcCosY = ny > 0 ? Math.cos(ny * Math.PI * source.y / L) : 1;
  const srcCosZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / H) : 1;
  
  const rcvCosX = nx > 0 ? Math.cos(nx * Math.PI * receiver.x / W) : 1;
  const rcvCosY = ny > 0 ? Math.cos(ny * Math.PI * receiver.y / L) : 1;
  const rcvCosZ = nz > 0 ? Math.cos(nz * Math.PI * (receiver.z ?? 1.2) / H) : 1;
  
  // Total amplitude (position-dependent, preserves null migration)
  const amp = (srcCosX * srcCosY * srcCosZ) * (rcvCosX * rcvCosY * rcvCosZ);
  
  // PHASE: Eigenfunction phase difference (for smooth phase variation debug)
  const srcPhase = (nx * Math.PI * source.x / W) + (ny * Math.PI * source.y / L) + (nz * Math.PI * (source.z ?? 0.0) / H);
  const rcvPhase = (nx * Math.PI * receiver.x / W) + (ny * Math.PI * receiver.y / L) + (nz * Math.PI * (receiver.z ?? 1.2) / H);
  const phi = srcPhase - rcvPhase;
  
  // Complex coupling: amp * exp(j*phi) = amp * (cos(phi) + j*sin(phi))
  const couplingRe = amp * Math.cos(phi);
  const couplingIm = amp * Math.sin(phi);
  
  const phaseDeg = (phi * 180 / Math.PI) % 360;
  
  return { 
    re: couplingRe, 
    im: couplingIm,
    amp: amp,
    phaseDeg: phaseDeg
  };
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
 * Apply fractional octave smoothing in MAGNITUDE domain (REW-style, preserves nulls)
 */
function smoothFractionalOctaveMagnitude(freqs, dbArray, fraction /* e.g. 48 or 3 */) {
  // Returns dB, smoothed in linear magnitude domain over log-frequency.
  // Nulls remain null; we do not smear across null gaps.
  const out = new Array(dbArray.length).fill(null);

  const ln2 = Math.log(2);
  const halfWindow = 0.5 / fraction; // +/- half a band in octaves

  // Precompute log2(freq)
  const log2f = freqs.map(f => Math.log(f) / ln2);

  // Convert dB -> magnitude (keep null)
  const mag = dbArray.map(v => (Number.isFinite(v) ? Math.pow(10, v / 20) : null));

  for (let i = 0; i < freqs.length; i++) {
    if (mag[i] === null) continue;

    const centre = log2f[i];
    const lo = centre - halfWindow;
    const hi = centre + halfWindow;

    let sum = 0;
    let n = 0;

    // simple window over log2 frequency
    for (let j = 0; j < freqs.length; j++) {
      const mj = mag[j];
      if (mj === null) continue;
      const lj = log2f[j];
      if (lj >= lo && lj <= hi) {
        sum += mj;
        n++;
      }
    }

    if (n > 0) {
      const avg = sum / n;
      out[i] = 20 * Math.log10(Math.max(Number.EPSILON, avg));
    }
  }

  return out;
}

/**
 * Apply fractional octave smoothing (legacy dB-domain smoothing)
 */
function applySmoothing(freqs, splDb, smoothing) {
  const octaveFraction = {
    '1/48': 48,
    '1/12': 12,
    '1/6': 6,
    '1/3': 3
  }[smoothing] || 1;
  
  // Use new magnitude-domain smoothing
  return smoothFractionalOctaveMagnitude(freqs, splDb, octaveFraction);
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
  
  // Stronger frequency dependence: reduce Q faster above 80 Hz (tames upper-bass peaks)
  const freqFactor = Math.pow(f0 / 50, -0.30);
  
  // Mode type weighting: tangential/oblique modes more damped than axial
  let modeTypeFactor = 1.0;
  if (mode.type === 'tangential') modeTypeFactor = 0.85;
  else if (mode.type === 'oblique') modeTypeFactor = 0.75;
  
  // Mode order weighting: higher order modes slightly more damped
  const order = Math.sqrt(mode.nx*mode.nx + mode.ny*mode.ny + mode.nz*mode.nz);
  const orderFactor = 1 / (1 + 0.08 * Math.max(0, order - 1));
  
  // Leakage reduces Q uniformly
  const leakageFactor = 1 / (1 + 2 * clamp01(leakage));
  
  const q = baseQ * freqFactor * modeTypeFactor * orderFactor * leakageFactor;
  
  return Math.max(6, Math.min(80, q));
}

function clamp01(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}