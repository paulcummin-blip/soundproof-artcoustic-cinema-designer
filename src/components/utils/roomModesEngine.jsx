// roomModesEngine.js
// REW-parity room modes calculator for bass response
// Uses rectangular room normal modes with source/receiver spatial coupling

const SPEED_OF_SOUND = 343; // m/s
const C_MPS = 343; // Reference speed of sound
const SPATIAL_AVG_RADIUS_M = 0.10; // REW-style mic/source spatial averaging (10cm)

// Helper to compute peak/dip/delta for a given frequency band
function peakDipDelta(freqs, dbArray, loHz, hiHz) {
  if (!Array.isArray(freqs) || !Array.isArray(dbArray) || freqs.length !== dbArray.length) {
    return null;
  }
  let peak = -Infinity, dip = Infinity;
  let peakHz = null, dipHz = null;
  let found = 0;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    if (f < loHz || f > hiHz) continue;
    const v = dbArray[i];
    if (!Number.isFinite(v)) continue;
    found++;
    if (v > peak) { peak = v; peakHz = f; }
    if (v < dip)  { dip  = v; dipHz  = f; }
  }
  if (!found) return null;
  return { peakDb: peak, dipDb: dip, peakHz, dipHz, deltaDb: peak - dip };
}

// Helper to find the largest adjacent jump in a frequency band
const findLargestAdjacentJump = (freqs, dbArr, fMin = 55, fMax = 90) => {
  if (!Array.isArray(freqs) || !Array.isArray(dbArr)) return null;

  let best = null;

  for (let i = 1; i < freqs.length; i++) {
    const f0 = freqs[i - 1];
    const f1 = freqs[i];
    if (!(f0 >= fMin && f0 <= fMax && f1 >= fMin && f1 <= fMax)) continue;

    const y0 = dbArr[i - 1];
    const y1 = dbArr[i];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;

    const jumpDb = Math.abs(y1 - y0);
    const df = f1 - f0;

    if (!best || jumpDb > best.jumpDb) {
      best = { i0: i - 1, i1: i, f0, f1, y0, y1, jumpDb, df };
    }
  }

  return best;
};

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
  disableSealedRoomGain = false, // Debug: bypass sealed-room LF gain
  disableNullRepair = false, // Debug: bypass null repair/fill
  rewStrictParity = false, // REW Strict: disable all presentation shapers (coherence loss, mode density comp, Schroeder blend)
  calcEpoch = 0, // Request cancellation epoch
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

  // Speed of sound used in calculations
  const cActual = Number(c) || C_MPS;

  // Compute axial fundamentals for debug alignment
  const axialFundamentals = {
    fL: cActual / (2 * lengthM),
    fW: cActual / (2 * widthM),
    fH: cActual / (2 * heightM),
  };
  const lowestAxialHz = Math.min(axialFundamentals.fL, axialFundamentals.fW, axialFundamentals.fH);
  
  // Compute Schroeder frequency
  const rt60 = 0.4;
  const schroederHz = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 80;
  
  // Generate frequency axis: REW-matched log spacing (24 PPO from 20-200 Hz)
  // During drag: use lower resolution for fast preview
  const effectivePPO = 24; // REW standard

  const freqs = generateLogFrequencyAxis(
    fMin, 
    fMax, 
    isDragging ? 20 : effectivePPO
  );
  
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
  // Debug bypass: can be disabled to isolate LF locking behavior
  const sealedBoostEnabled = sealedRoom && !disableSealedRoomGain;
  const sealedBoostKDbPerOct = sealedBoostEnabled ? 6.0 : 0.0;
  const sealedBoostMaxGainDb = sealedBoostEnabled ? 12.0 : 0.0;

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
            rewParityMode,
          });
          
          const bandwidth = f0 / qMode;
          const df = Math.abs(f - f0);
          
          // Smooth distance taper (replaces hard skip gate)
          const bw = Math.max(1e-6, bandwidth);
          const x = df / (3.0 * bw);
          const taper = 1 / (1 + Math.pow(x, 4));
          
          // Skip if taper is negligible
          if (taper < 0.001) continue;
          
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
          
          // Apply smooth distance taper
          hRe *= taper;
          hIm *= taper;
          
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

  // DEBUG: Track term counts for 55-80 Hz band (step detection)
  const termCountDebug = [];

  // ENGINE TRACE: Per-frequency calculation breakdown (for step drilldown)
  const engineTrace = [];

  // STEP JUMP DEBUG: Track term counts for 55-90 Hz (extended range for step detection)
  const termCountDebug55_90Hz = [];

  let splDb = freqs.map((f, i) => {
    let sumRe_modal = 0;
    let sumIm_modal = 0;
    let activeTerms = 0;
    
    // Per-mode contribution tracking (top 3 contributors per bin)
    const modeContribsThisBin = [];

    // SBIR (image source) complex pressure sum
    let sumRe_sbir = 0;
    let sumIm_sbir = 0;

    // DEBUG: Track terms used for this frequency
    let modesConsidered = 0;
    let modesUsed = 0;
    let modesSkippedBandwidth = 0;
    let modesSkippedCoupling = 0;

    for (const mode of modes) {
      const f0 = mode.freq;
      if (!(f0 > 0)) continue;

      modesConsidered++;

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

      // Smooth distance taper (replaces hard skip gate)
      const bw = Math.max(1e-6, bandwidth);
      const x = df / (3.0 * bw);
      const taper = 1 / (1 + Math.pow(x, 4));

      // Count as "effectively skipped" if taper is negligible
      if (taper < 0.001) {
        modesSkippedBandwidth++;
      }

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
          if (Math.abs(coupling) < 1e-6) {
            modesSkippedCoupling++;
            continue;
          }
          couplingComplex = null; // Not used in real mode
          }

          modesUsed++;

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

        // Apply smooth distance taper
        hRe *= taper;
        hIm *= taper;

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
      // Use index-based key to avoid frequency rounding
      if (__isProbeFreq(f)) {
        modeContributions[`idx_${i}`] = { freq: f, modes: top3 };
      }
    }
    
    // LF Movement Probe: capture coupling terms at key frequencies
    const probeFreqs = [25, 35, 45];
    if (probeFreqs.some(pf => Math.abs(f - pf) < 0.3)) {
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
        
        // Use index-based key to preserve exact frequency
        lfMovementProbe[`idx_${i}_${f.toFixed(2)}Hz`] = {
          exactFreqHz: f,
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
    let sbirReflectionsUsed = 0;
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

        // Track SBIR paths used
        sbirReflectionsUsed += sbirResult.pathsUsed || 0;

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
        exactFreqHz: f, // Keep exact frequency (no rounding)
        idx: i,
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

    // COHERENT PRESSURE RAW: Pure complex magnitude (REW-style, no measurement floor)
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
    
    // REW parity: NO mode density compensation (keep raw modal overlap)
    const mdCompEnabled = false;

    // Apply leaky room LF roll-off (if room is not sealed)
    // Reduce LF below ~35 Hz with gentle shelving (REW-like behaviour)
    if (!rawEngineOutput && leakyRolloffEnabled && f < 35) {
      const octavesBelow = Math.log2(35 / f);
      const rolloffDb = -3.0 * octavesBelow; // -3 dB/octave below 35 Hz
      modalDb += Math.max(-9.0, rolloffDb); // Cap at -9 dB max reduction
    }
    
    // Store coherent raw for RAW mode output
    coherentRawDb.push(coherentPressureRaw);

    // DEBUG: Track term counts for 55-80 Hz band (step detection)
    if (f >= 55 && f <= 80) {
      termCountDebug.push({
        freqHz: f,
        exactFreqHz: f,
        idx: i,
        modesConsidered,
        modesUsed,
        modesSkippedBandwidth,
        modesSkippedCoupling,
        sbirReflectionsUsed,
        activeTermsTotal: activeTerms,
        modalDb: coherentPressureRaw
      });
    }

    // STEP JUMP DEBUG: Track term counts for 55-90 Hz (extended range)
    if (f >= 55 && f <= 90) {
      termCountDebug55_90Hz.push({
        exactFreqHz: f,
        idx: i,
        modesConsidered: Number.isFinite(modesConsidered) ? modesConsidered : 0,
        modesUsed: Number.isFinite(modesUsed) ? modesUsed : 0,
        modesSkippedBandwidth: Number.isFinite(modesSkippedBandwidth) ? modesSkippedBandwidth : 0,
        modesSkippedCoupling: Number.isFinite(modesSkippedCoupling) ? modesSkippedCoupling : 0,
        sbirReflectionsUsed: Number.isFinite(sbirReflectionsUsed) ? sbirReflectionsUsed : 0,
        activeTermsTotal: Number.isFinite(activeTerms) ? activeTerms : 0,
        coherentRawDb: Number.isFinite(coherentPressureRaw) ? coherentPressureRaw : null,
        modalDb: Number.isFinite(modalDb) ? modalDb : null,
      });
    }

    // ENGINE TRACE: Reuse magnitude values already computed for RMS tracking
    const modalDbForTrace = modalMagDb_all.length > 0 ? modalMagDb_all[modalMagDb_all.length - 1] : 0;
    const sbirDbForTrace = sbirMagDb_all.length > 0 ? sbirMagDb_all[sbirMagDb_all.length - 1] : 0;
    const totalDbForTrace = totalMagDb_all.length > 0 ? totalMagDb_all[totalMagDb_all.length - 1] : 0;

    engineTrace.push({
      idx: i,
      exactFreqHz: f,
      modalDb: modalDbForTrace,
      sbirDb: sbirDbForTrace,
      totalDb: totalDbForTrace,
      modesConsidered,
      modesUsed,
      modesSkippedBandwidth,
      modesSkippedCoupling,
      sbirReflectionsUsed,
      activeTermsTotal: activeTerms
    });

    return modalDb;
    });
  
  return { splDb, modalBandDb, sbirBandDb, coherentRawDb, termCountDebug55_90Hz };
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
            // REW parity: do NOT level-match SBIR to modal.
            // REW sums components as-is; any “matching” distorts the curve shape.
            sbirTrimDb = 0;
            sbirTrimLinear = 1.0;
            sbirMatchingApplied = false;
            modalMedianDb = 0;
            sbirMedianDb = 0;
          }

  // SECOND PASS: Run engine again with computed SBIR trim
  const secondPass = runOnce(null, sbirTrimLinear);
  const splDb = secondPass.splDb;
  const rawCoherentDb = secondPass.coherentRawDb;
  const engineTraceFinal = secondPass.engineTrace;
  const termCountDebug55_90HzPass2 = secondPass.termCountDebug55_90Hz || [];

  
  
  // REW parity: NO coherence loss (keep pure modal/SBIR summation at all frequencies)
  const splDbForPipeline = splDb;
  const coherenceLossApplied = false;
  
  // Compute RMS for component magnitudes (20-200 Hz band) - CORRECTED: linear domain
  const computeRmsDb = (magLinearArray, freqsArr) => {
    // Extract linear magnitudes in band (20-200 Hz)
    const bandLinear = [];
    for (let i = 0; i < freqsArr.length; i++) {
      const f = freqsArr[i];
      if (f < 20 || f > 200) continue;
      
      // Convert dB back to linear magnitude
      const dbVal = magLinearArray[i];
      if (!Number.isFinite(dbVal)) continue;
      
      const linearMag = Math.pow(10, dbVal / 20);
      
      // Treat floored values as zero (no acoustic energy)
      if (linearMag < 1e-10) continue;
      
      bandLinear.push(linearMag);
    }
    
    if (bandLinear.length === 0) return 0;
    
    // RMS in linear domain
    const sumSq = bandLinear.reduce((acc, mag) => acc + mag * mag, 0);
    const rmsLinear = Math.sqrt(sumSq / bandLinear.length);
    
    // Convert final RMS to dB
    return 20 * Math.log10(Math.max(1e-12, rmsLinear));
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

  // NO Schroeder blend (REW parity: always bypass)
  const splDbSchroeder = splDbForPipeline;

  // Capture RAW stats BEFORE any processing (critical for debugging)
  const rawFinite = splDbSchroeder.filter(v => isFinite(v));
  const rawMin = rawFinite.length > 0 ? Math.min(...rawFinite) : 0;
  const rawMax = rawFinite.length > 0 ? Math.max(...rawFinite) : 0;
  const rawRange = rawMax - rawMin;

  // NO null repair (REW parity: always preserve deep nulls)
  const splDbRepaired = splDbSchroeder.map(v => isFinite(v) ? v : null);
  const nonFiniteRepaired = splDbSchroeder.filter(v => !isFinite(v)).length;
  

  // Capture pre-normalization stats (after repair, before smoothing/norm)
  const finitePreNorm = splDbRepaired.filter(v => isFinite(v));
  const preNormMin = finitePreNorm.length > 0 ? Math.min(...finitePreNorm) : 0;
  const preNormMax = finitePreNorm.length > 0 ? Math.max(...finitePreNorm) : 0;
  const preNormRange = preNormMax - preNormMin;

  // Apply smoothing if requested AND not raw mode (create NEW array, never mutate)
  const smoothingApplied = (!rawEngineOutput && smoothing !== 'none') ? smoothing : 'none';
  const splDbSmoothed = (!rawEngineOutput && smoothing !== 'none') 
    ? (rewParityMode ? applyRewStyleSmoothing(freqs, splDbRepaired, smoothing) : applySmoothing(freqs, splDbRepaired, smoothing))
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
  let qMappingText = `Q base: ${qBase.toFixed(1)} (slider=${dampingScalar.toFixed(2)})`;
  let rewParityDamping = null;

  // REW-parity damping: compute RT60 and Q range for debug
  if (rewParityMode) {
    const V = room.widthM * room.lengthM * room.heightM;

    const S_floor = room.lengthM * room.widthM;
    const S_ceiling = room.lengthM * room.widthM;
    const S_front = room.widthM * room.heightM;
    const S_back = room.widthM * room.heightM;
    const S_left = room.lengthM * room.heightM;
    const S_right = room.lengthM * room.heightM;

    const alpha_floor = absorption?.floor ?? 0.30;
    const alpha_ceiling = absorption?.ceiling ?? 0.30;
    const alpha_front = absorption?.front ?? 0.30;
    const alpha_back = absorption?.back ?? 0.30;
    const alpha_left = absorption?.left ?? 0.30;
    const alpha_right = absorption?.right ?? 0.30;

    const A = S_floor * alpha_floor + 
              S_ceiling * alpha_ceiling + 
              S_front * alpha_front + 
              S_back * alpha_back + 
              S_left * alpha_left + 
              S_right * alpha_right;

    const RT60 = 0.161 * V / Math.max(A, 1e-6);
    const tau = RT60 / 13.815;

    // Compute Q at min/max mode frequencies for debug
    const modeFreqs = modes.map(m => m.freq).filter(f => f > 0);
    const fMin = modeFreqs.length > 0 ? Math.min(...modeFreqs) : 20;
    const fMax = modeFreqs.length > 0 ? Math.max(...modeFreqs) : 200;

    const Q_min = Math.max(5, Math.min(80, Math.PI * fMin * tau));
    const Q_max = Math.max(5, Math.min(80, Math.PI * fMax * tau));

    rewParityDamping = {
      alphaDefault: 0.30,
      RT60: RT60.toFixed(3),
      tau: tau.toFixed(4),
      Q_at_20Hz: Math.max(5, Math.min(80, Math.PI * 20 * tau)).toFixed(1),
      Q_at_50Hz: Math.max(5, Math.min(80, Math.PI * 50 * tau)).toFixed(1),
      Q_at_100Hz: Math.max(5, Math.min(80, Math.PI * 100 * tau)).toFixed(1),
      Q_range: `${Q_min.toFixed(1)} to ${Q_max.toFixed(1)}`
    };

    qMappingText = `Q (REW-parity): RT60=${RT60.toFixed(2)}s, Q@50Hz=${Math.max(5, Math.min(80, Math.PI * 50 * tau)).toFixed(1)}`;
  }
  
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
  let calRefMedianDbBefore = 0;
  let calRefMedianDbAfter = 0;
  let calibrationOffsetDb = 0; // Legacy, only for non-REW mode
  let normAppliedActual = false;

  // Use smoothed modal curve (SBIR is now integrated into splDb during summation)
  // REW parity: always use unsmoothed data for plotting (preserve null depth)
  // Smoothing happens visually via chart interpolation, not data mutation
  let finalDb = rewParityMode ? splDbRepaired : splDbSmoothed;
  const plottedDb = (!rawEngineOutput && smoothing !== 'none') ? splDbSmoothed : splDbRepaired;
  

  if (!Array.isArray(finalDb) || finalDb.length === 0) {
    finalDb = Array.isArray(splDb) ? [...splDb] : [];
  }

  // DISPLAY-ONLY REW RELATIVE SHIFT (median 30–80 Hz -> 0 dB)
  // Engine curve (finalDb) stays unchanged in REW parity mode.
  let displayOffsetDb = 0;

  if (rewParityMode && isRelative) {
    const displayBand = [30, 80];
    const bandVals = freqs
      .map((f, i) => (f >= displayBand[0] && f <= displayBand[1] && Number.isFinite(finalDb[i])) ? finalDb[i] : null)
      .filter(v => v !== null);

    if (bandVals.length >= 10) {
      const sorted = [...bandVals].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      displayOffsetDb = -med; // target is 0 dB
    }
  }

  // Always compute MLP reference (30-80 Hz median) for anchoring
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

    // Calibration offset is ONLY for non-REW modes.
    // In REW parity mode we keep ENGINE FINAL untouched, and do display shifting separately.
    if (!rewParityMode && isRelative) {
      // Relative view: normalize to 0 dB
      const targetDb = Number.isFinite(normalizeToDb) ? normalizeToDb : 0;
      calibrationOffsetDb = targetDb - mlpMedianDb;
      normAppliedActual = true;
    } else if (!rewParityMode && !isRelative) {
      // Absolute view (non-REW): calibrate so MLP 30–80 Hz median = 85 dB
      const targetAbsoluteDb = 85;
      calibrationOffsetDb = targetAbsoluteDb - mlpMedianDb;
    } else {
      // REW parity: no engine calibration offset
      calibrationOffsetDb = 0;
      normAppliedActual = false;
    }

    // Apply legacy calibration offset (only non-REW mode)
    if (!rewParityMode) {
      finalDb = finalDb.map(v => (isFinite(v) ? (v + calibrationOffsetDb) : v));
    }
    
    // Compute after-offset median for debug
    const afterBandValues = freqs
      .map((f, i) => f >= calRefBandHz[0] && f <= calRefBandHz[1] && isFinite(finalDb[i]) ? finalDb[i] + displayOffsetDb : null)
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
  const safePlottedDbRaw = Array.isArray(plottedDb) && plottedDb.length > 0 ? plottedDb : safeFinalDb;

  // Apply display-only offset ONLY for REW parity + Relative view
  const safeDisplayDb = (rewParityMode && isRelative)
    ? safeFinalDb.map(v => (Number.isFinite(v) ? (v + displayOffsetDb) : v))
    : safeFinalDb;

  const safeDisplayPlottedDb = (rewParityMode && isRelative)
    ? safePlottedDbRaw.map(v => (Number.isFinite(v) ? (v + displayOffsetDb) : v))
    : safePlottedDbRaw;
  
  // Acceptance test diagnostics: check for duplicate X and verify strict ordering
  const freqsForDiagnostic = [...safeFreqs];
  const duplicateCheck = freqsForDiagnostic.filter((f, i, arr) => i > 0 && f === arr[i - 1]);
  const duplicateCount = duplicateCheck.length;
  
  const strictlyIncreasing = freqsForDiagnostic.every((f, i, arr) => 
    i === 0 || f > arr[i - 1]
  );
  
  const minDeltaF = freqsForDiagnostic.length >= 2 
    ? Math.min(...freqsForDiagnostic.slice(1).map((f, i) => f - freqsForDiagnostic[i]))
    : 0;
  
  // Continuity diagnostic: check for step artifacts (large jumps between adjacent points)
  // Target band: 60-90 Hz (above pivot, where steps were reported)
  const continuityBand60_90 = [];
  for (let i = 1; i < safeFreqs.length; i++) {
    const f = safeFreqs[i];
    if (f >= 60 && f <= 90 && Number.isFinite(safeFinalDb[i]) && Number.isFinite(safeFinalDb[i-1])) {
      const deltaDb = Math.abs(safeFinalDb[i] - safeFinalDb[i-1]);
      const deltaF = safeFreqs[i] - safeFreqs[i-1];
      continuityBand60_90.push({ freq: f, deltaDb, deltaF });
    }
  }
  
  const maxDeltaDb60_90 = continuityBand60_90.length > 0 
    ? Math.max(...continuityBand60_90.map(d => d.deltaDb))
    : 0;
  
  const avgDeltaDb60_90 = continuityBand60_90.length > 0
    ? continuityBand60_90.reduce((sum, d) => sum + d.deltaDb, 0) / continuityBand60_90.length
    : 0;

  // --- Build baseReturn FIRST (no conditionals inside object literals) ---
  const baseReturn = {
    freqs: safeFreqs,
    splDb: safeDisplayDb,
    plottedDb: safeDisplayPlottedDb,
    coherentRawDb: rawCoherentDb,
    engineTrace: engineTraceFinal,
    debug: {
      cMpsUsed: cActual,
      roomDimsUsed: { widthM, lengthM, heightM },
      axialFundamentals,
      schroederHz: Number.isFinite(schroederHz) ? schroederHz : 0,
      modeMarkersHz,
      modeMarkersAllHz,
      modeMarkers,
      modeCount: modes.length,
      axialCount,
      tangentialCount,
      obliqueCount,
      firstTenModeHz,
      modeListFirst60,
      qMappingText,
      rewParityDamping,
      inputSig,
      sourceSigUsed,
      seatSigUsed,
      sourceSigRounded,
      seatSigRounded,
      sourceCountUsed,
      sourcePositionsUsed,
      mlpAutoLevelGainsDb,
      autoLevelEnabled,
      sbirMatchingApplied,
      modalMedianDb: Number.isFinite(modalMedianDb) ? modalMedianDb.toFixed(2) : 'N/A',
      sbirMedianDb: Number.isFinite(sbirMedianDb) ? sbirMedianDb.toFixed(2) : 'N/A',
      sbirTrimDb: Number.isFinite(sbirTrimDb) ? sbirTrimDb.toFixed(2) : 'N/A',
      sbirTrimLinear: Number.isFinite(sbirTrimLinear) ? sbirTrimLinear.toFixed(4) : 'N/A',
      modalRmsDb_20_200: Number.isFinite(modalRmsDb_20_200) ? modalRmsDb_20_200.toFixed(2) : 'N/A',
      sbirRmsDb_20_200: Number.isFinite(sbirRmsDb_20_200) ? sbirRmsDb_20_200.toFixed(2) : 'N/A',
      totalRmsDb_20_200: Number.isFinite(totalRmsDb_20_200) ? totalRmsDb_20_200.toFixed(2) : 'N/A',
      splMinDb: Number.isFinite(splMinDb) ? splMinDb.toFixed(1) : 'N/A',
      splMaxDb: Number.isFinite(splMaxDb) ? splMaxDb.toFixed(1) : 'N/A',
      splRangeDb: Number.isFinite(splRangeDb) ? splRangeDb.toFixed(1) : 'N/A',
      preNormMin: Number.isFinite(preNormMin) ? preNormMin.toFixed(1) : 'N/A',
      preNormMax: Number.isFinite(preNormMax) ? preNormMax.toFixed(1) : 'N/A',
      preNormRange: Number.isFinite(preNormRange) ? preNormRange.toFixed(1) : 'N/A',
      postNormMin: Number.isFinite(postNormMin) ? postNormMin.toFixed(1) : 'N/A',
      postNormMax: Number.isFinite(postNormMax) ? postNormMax.toFixed(1) : 'N/A',
      postNormRange: Number.isFinite(postNormRange) ? postNormRange.toFixed(1) : 'N/A',
      rawMin: Number.isFinite(rawMin) ? rawMin.toFixed(1) : 'N/A',
      rawMax: Number.isFinite(rawMax) ? rawMax.toFixed(1) : 'N/A',
      rawRange: Number.isFinite(rawRange) ? rawRange.toFixed(1) : 'N/A',
      nonFiniteRepaired,
      smoothingApplied,
      normRefDb,
      normApplied: normAppliedActual,
      calRefMedianDbBefore,
      calRefMedianDbAfter,
      calibrationOffsetDb,
      displayOffsetDb,
      rewParityMode,
      isRelative,
      coherenceLossApplied,
      productCurveStats,
      sbirEnabled,
      sbirBlendEnabled,
      sbirBlendStartHz: Number.isFinite(sbirBlendStartHzActual) ? sbirBlendStartHzActual.toFixed(1) : 'N/A',
      sbirBlendEndHz: Number.isFinite(sbirBlendEndHzActual) ? sbirBlendEndHzActual.toFixed(1) : 'N/A',
      sealedBoostEnabled,
      sealedBoostKDbPerOct,
      sealedBoostMaxGainDb,
      lfDeltaDb_20_30: Number.isFinite(lfDeltaDb_20_30) ? lfDeltaDb_20_30.toFixed(2) : 'N/A',
      lfDelta_25_69,
      upperBassDelta_69_120,
      lfSanityCheck,
      modalMagMin,
      modalMagMax,
      lfProbe,
      lfProbeRaw,
      lfMovementProbe,
      modeContributions,
      seatNodeCheck,
      warnings,
      parityAudits,
      sbirDebugProbe40Hz,
      sbirDebugProbe63Hz: sbirDebugProbe63Hz_captured,
      duplicateCount,
      strictlyIncreasing,
      minDeltaF: Number.isFinite(minDeltaF) ? minDeltaF.toFixed(6) : 'N/A',
      continuityBand60_90_maxDeltaDb: Number.isFinite(maxDeltaDb60_90) ? maxDeltaDb60_90.toFixed(3) : 'N/A',
      continuityBand60_90_avgDeltaDb: Number.isFinite(avgDeltaDb60_90) ? avgDeltaDb60_90.toFixed(3) : 'N/A',
    }
  };

  // --- Attach 40–70 Hz stage audit when enabled (ONE time only) ---
  if (globalThis.__B44_BASS_AUDIT === true) {
    const audit40_70 = {
      coherentRawDb: Array.isArray(rawCoherentDb) ? peakDipDelta(freqs, rawCoherentDb, 40, 70) : null,
      splDb: Array.isArray(splDb) ? peakDipDelta(freqs, splDb, 40, 70) : null,
      splDbForPipeline: Array.isArray(splDbForPipeline) ? peakDipDelta(freqs, splDbForPipeline, 40, 70) : null,
      splDbSchroeder: Array.isArray(splDbSchroeder) ? peakDipDelta(freqs, splDbSchroeder, 40, 70) : null,
      splDbRepaired: Array.isArray(splDbRepaired) ? peakDipDelta(freqs, splDbRepaired, 40, 70) : null,
      plottedDb: Array.isArray(plottedDb) ? peakDipDelta(freqs, plottedDb, 40, 70) : null,
    };

    // Guard: ensure debug container exists
    if (!baseReturn.debug) baseReturn.debug = {};
    baseReturn.debug.audit40_70 = audit40_70;
  }

  // ---- Step Jump Inspector ALWAYS ON (55–90 Hz) ----
  if (!baseReturn.debug) baseReturn.debug = {};

  const step = findLargestAdjacentJump(freqs, plottedDb, 55, 90);

  if (step && Array.isArray(termCountDebug55_90HzPass2)) {
    // Enrich term counts with all pipeline stage values
    const enrichedDebug = termCountDebug55_90HzPass2.map((row) => {
      const i = row.idx;
      return {
        ...row,
        splDbForPipeline: Number.isFinite(splDbForPipeline?.[i]) ? splDbForPipeline[i] : null,
        splDbSchroeder: Number.isFinite(splDbSchroeder?.[i]) ? splDbSchroeder[i] : null,
        splDbRepaired: Number.isFinite(splDbRepaired?.[i]) ? splDbRepaired[i] : null,
        plottedDb: Number.isFinite(plottedDb?.[i]) ? plottedDb[i] : null,
      };
    });

    const row0 = enrichedDebug.find(r => Math.abs(r.exactFreqHz - step.f0) < 1e-6) || null;
    const row1 = enrichedDebug.find(r => Math.abs(r.exactFreqHz - step.f1) < 1e-6) || null;

    baseReturn.debug.stepJumpInspector55_90 = {
      summary: {
        f0: step.f0,
        f1: step.f1,
        y0: step.y0,
        y1: step.y1,
        jumpDb: step.jumpDb,
        df: step.df,
      },
      rows: [row0, row1],
    };

    baseReturn.debug.termCountDebug55_90Hz = enrichedDebug;
    
    // --- BIN-TO-BIN MODE TRACE (only when audit enabled and step exists) ---
    if (globalThis.__B44_BASS_AUDIT === true) {
      // Helper: trace a single bin's modal calculation
      const traceSingleBin = (iTarget) => {
        const f = freqs[iTarget];
        if (!Number.isFinite(f)) return null;
        
        const modeTrace = [];
        let activeTermsTotal = 0;
        let modesConsidered = 0;
        let modesUsed = 0;
        let modesSkippedBandwidth = 0;
        let modesSkippedCoupling = 0;
        
        // Per-mode contribution buckets (sum across subs)
        const modeContribMap = {};
        
        for (const mode of modes) {
          const f0 = mode.freq;
          if (!(f0 > 0)) continue;
          
          modesConsidered++;
          
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
          
          const modeKey = `${mode.nx},${mode.ny},${mode.nz}`;
          
          // Smooth distance taper (replaces hard skip gate)
          const bw = Math.max(1e-6, bandwidth);
          const x = df / (3.0 * bw);
          const taper = 1 / (1 + Math.pow(x, 4));
          
          // Count as "effectively skipped" if taper is negligible
          if (taper < 0.001) {
            modesSkippedBandwidth++;
            modeTrace.push({
              modeKey,
              modeHz: f0,
              type: mode.type,
              n: [mode.nx, mode.ny, mode.nz],
              qMode,
              bandwidthHz: bandwidth,
              dfHz: df,
              skipped: true,
              skipReason: 'bandwidth',
              contribMag: 0,
              contribDb: -Infinity
            });
            continue;
          }
          
          // Compute coupling for each sub and accumulate
          let totalContribRe = 0;
          let totalContribIm = 0;
          let hadNonZeroCoupling = false;
          
          for (let subIdx = 0; subIdx < sourcesLocal.length; subIdx++) {
            const source = sourcesLocal[subIdx];
            
            const coupling = computeSpatialCoupling(mode, source, seat, room);
            if (Math.abs(coupling) < 1e-6) continue;
            
            hadNonZeroCoupling = true;
            
            const meta = subProductMeta && subProductMeta[subIdx] ? subProductMeta[subIdx] : null;
            let productRelativeDb = 0;
            if (meta && meta.relativeCurve && meta.relativeCurve[iTarget] !== undefined) {
              productRelativeDb = meta.relativeCurve[iTarget];
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
            
            const r = f / Math.max(1e-6, f0);
            const re = (1 - r * r);
            const im = (r / Math.max(1e-6, qMode));
            const denom = (re * re + im * im);
            let hRe = re / denom;
            let hIm = -im / denom;
            
            // Apply smooth distance taper
            hRe *= taper;
            hIm *= taper;
            
            const cRe = coupling * (weightRe * hRe - weightIm * hIm);
            const cIm = coupling * (weightRe * hIm + weightIm * hRe);
            
            totalContribRe += cRe;
            totalContribIm += cIm;
          }
          
          if (!hadNonZeroCoupling) {
            modesSkippedCoupling++;
            modeTrace.push({
              modeKey,
              modeHz: f0,
              type: mode.type,
              n: [mode.nx, mode.ny, mode.nz],
              qMode,
              bandwidthHz: bandwidth,
              dfHz: df,
              skipped: true,
              skipReason: 'coupling',
              contribMag: 0,
              contribDb: -Infinity
            });
            continue;
          }
          
          // Only count as "used" if taper is significant
          if (taper >= 0.001) {
            modesUsed++;
            activeTermsTotal++;
          }
          
          const contribMag = Math.sqrt(totalContribRe * totalContribRe + totalContribIm * totalContribIm);
          const contribDb = 20 * Math.log10(Math.max(Number.EPSILON, contribMag));
          
          modeTrace.push({
            modeKey,
            modeHz: f0,
            type: mode.type,
            n: [mode.nx, mode.ny, mode.nz],
            qMode,
            bandwidthHz: bandwidth,
            dfHz: df,
            skipped: false,
            skipReason: null,
            contribMag,
            contribDb
          });
        }
        
        const topContribModes = modeTrace
          .filter(m => !m.skipped)
          .sort((a, b) => b.contribDb - a.contribDb)
          .slice(0, 10);
        
        return {
          idx: iTarget,
          exactFreqHz: f,
          activeTermsTotal,
          modesConsidered,
          modesUsed,
          modesSkippedBandwidth,
          modesSkippedCoupling,
          modeTrace,
          topContribModes
        };
      };
      
      // Helper: diff two bin traces
      const diffTraces = (trace0, trace1) => {
        if (!trace0 || !trace1) return null;
        
        // Build mode key sets
        const used0 = new Set(trace0.modeTrace.filter(m => !m.skipped).map(m => m.modeKey));
        const used1 = new Set(trace1.modeTrace.filter(m => !m.skipped).map(m => m.modeKey));
        
        // Modes added (in f1 but not f0)
        const modesAdded = trace1.modeTrace
          .filter(m => !m.skipped && !used0.has(m.modeKey))
          .map(m => ({ modeKey: m.modeKey, type: m.type, modeHz: m.modeHz, n: m.n, contribDb: m.contribDb }))
          .sort((a, b) => b.contribDb - a.contribDb)
          .slice(0, 15);
        
        // Modes removed (in f0 but not f1)
        const modesRemoved = trace0.modeTrace
          .filter(m => !m.skipped && !used1.has(m.modeKey))
          .map(m => ({ modeKey: m.modeKey, type: m.type, modeHz: m.modeHz, n: m.n, contribDb: m.contribDb }))
          .sort((a, b) => b.contribDb - a.contribDb)
          .slice(0, 15);
        
        // Modes that changed skip status
        const modesSkipChanged = [];
        for (const m0 of trace0.modeTrace) {
          const m1 = trace1.modeTrace.find(m => m.modeKey === m0.modeKey);
          if (!m1) continue;
          
          if (m0.skipped !== m1.skipped || m0.skipReason !== m1.skipReason) {
            modesSkipChanged.push({
              modeKey: m0.modeKey,
              type: m0.type,
              modeHz: m0.modeHz,
              n: m0.n,
              atF0: { skipped: m0.skipped, reason: m0.skipReason, df: m0.dfHz, bw: m0.bandwidthHz },
              atF1: { skipped: m1.skipped, reason: m1.skipReason, df: m1.dfHz, bw: m1.bandwidthHz }
            });
          }
        }
        
        // Top contribution deltas (modes present in both bins)
        const sharedModes = trace0.modeTrace
          .filter(m => !m.skipped && used1.has(m.modeKey))
          .map(m0 => {
            const m1 = trace1.modeTrace.find(m => m.modeKey === m0.modeKey);
            if (!m1 || m1.skipped) return null;
            
            const deltaDb = m1.contribDb - m0.contribDb;
            return {
              modeKey: m0.modeKey,
              type: m0.type,
              modeHz: m0.modeHz,
              n: m0.n,
              contribDb0: m0.contribDb,
              contribDb1: m1.contribDb,
              deltaDb
            };
          })
          .filter(Boolean)
          .sort((a, b) => Math.abs(b.deltaDb) - Math.abs(a.deltaDb))
          .slice(0, 15);
        
        return {
          f0: trace0.exactFreqHz,
          f1: trace1.exactFreqHz,
          modesAdded,
          modesRemoved,
          modesSkipChanged,
          topDeltaContrib: sharedModes
        };
      };
      
      // Trace the two bins and compute diff
      const trace0 = traceSingleBin(step.i0);
      const trace1 = traceSingleBin(step.i1);
      const diff = diffTraces(trace0, trace1);
      
      if (trace0 && trace1 && diff) {
        baseReturn.debug.stepJumpInspector55_90.trace = {
          bin0: trace0,
          bin1: trace1,
          diff
        };
      }
    }
  } else {
    baseReturn.debug.stepJumpInspector55_90 = { summary: null, rows: [] };
    baseReturn.debug.termCountDebug55_90Hz = [];
  }

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

  // --- B44 AUDIT (guarded, no UI, no logs) ---
  if (globalThis.__B44_BASS_AUDIT === true && baseReturn && baseReturn.debug && Array.isArray(baseReturn.freqs)) {
    try {
      const peakDipDelta = (freqs, dbArr, fLo, fHi) => {
        let peakDb = -Infinity, dipDb = Infinity;
        let peakHz = null, dipHz = null;

        for (let i = 0; i < freqs.length; i++) {
          const f = freqs[i];
          if (!(f >= fLo && f <= fHi)) continue;
          const v = dbArr?.[i];
          if (!Number.isFinite(v)) continue;

          if (v > peakDb) { peakDb = v; peakHz = f; }
          if (v < dipDb)  { dipDb = v;  dipHz  = f; }
        }

        if (!Number.isFinite(peakDb) || !Number.isFinite(dipDb)) return null;

        return {
          peakDb,
          peakHz,
          dipDb,
          dipHz,
          deltaDb: peakDb - dipDb
        };
      };

      // IMPORTANT: do not read from console-stored arrays; only from the arrays we already have here
      baseReturn.debug.audit40_70 = {
        coherentRawDb: Array.isArray(baseReturn.coherentRawDb)
          ? peakDipDelta(baseReturn.freqs, baseReturn.coherentRawDb, 40, 70)
          : null,

        splDb: Array.isArray(baseReturn.splDb)
          ? peakDipDelta(baseReturn.freqs, baseReturn.splDb, 40, 70)
          : null,

        splDbForPipeline: Array.isArray(splDbForPipeline)
          ? peakDipDelta(baseReturn.freqs, splDbForPipeline, 40, 70)
          : null,

        splDbSchroeder: Array.isArray(splDbSchroeder)
          ? peakDipDelta(baseReturn.freqs, splDbSchroeder, 40, 70)
          : null,

        splDbRepaired: Array.isArray(splDbRepaired)
          ? peakDipDelta(baseReturn.freqs, splDbRepaired, 40, 70)
          : null,

        plottedDb: Array.isArray(baseReturn.plottedDb)
          ? peakDipDelta(baseReturn.freqs, baseReturn.plottedDb, 40, 70)
          : null
      };
    } catch {
      // absolute fail-safe: audit must never break rendering
    }
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
 * Generate hybrid linear frequency axis (REW parity - high analytic resolution)
 * 15-80 Hz: 0.25 Hz steps (dense modal region)
 * 80-200 Hz: 0.5 Hz steps (upper bass)
 * Target: ~700-750 points for smooth curves without smoothing
 */
function generateHybridLinearFrequencyAxis(fMin, fMax) {
  const freqs = [];
  
  // Part 1: 15-80 Hz at 0.25 Hz steps
  for (let f = fMin; f <= 80; f += 0.25) {
    freqs.push(f);
  }
  
  // Part 2: 80-200 Hz at 0.5 Hz steps (start from 80.5 to avoid duplicate)
  for (let f = 80.5; f <= fMax; f += 0.5) {
    freqs.push(f);
  }
  
  return freqs;
}

/**
 * Generate log-spaced frequency axis (legacy - kept for non-REW mode)
 */
function generateLogFrequencyAxis(fMin, fMax, pointsPerOct) {
  const freqs = [];
  const octaves = Math.log2(fMax / fMin);
  const totalPoints = Math.ceil(octaves * pointsPerOct);
  
  for (let i = 0; i <= totalPoints; i++) {
    const f = fMin * Math.pow(2, i / pointsPerOct);
    if (f > fMax) break;
    freqs.push(f); // Keep full float precision (no rounding)
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
 * Apply REW-style fractional octave smoothing (linear magnitude domain, log-frequency window)
 * This preserves null depth better than dB-domain averaging
 */
function applyRewStyleSmoothing(freqs, splDb, smoothingSetting) {
  // Parse smoothing setting to get N (e.g., '1/3' → 3, '1/48' → 48)
  const settingMap = {
    '1/48': 48,
    '1/24': 24,
    '1/12': 12,
    '1/6': 6,
    '1/3': 3,
    '1/1': 1
  };
  
  const N = settingMap[smoothingSetting] || 3;
  
  // Smoothing window in octaves (half-width)
  const halfWindowOct = 1 / (2 * N);
  
  const smoothed = new Array(splDb.length);
  
  for (let i = 0; i < freqs.length; i++) {
    const f0 = freqs[i];
    const dbOriginal = splDb[i];
    
    // Fallback for non-finite centre value
    if (!Number.isFinite(f0) || !Number.isFinite(dbOriginal)) {
      smoothed[i] = dbOriginal;
      continue;
    }
    
    // Window bounds in Hz
    const fLo = f0 / Math.pow(2, halfWindowOct);
    const fHi = f0 * Math.pow(2, halfWindowOct);
    
    // Collect linear magnitudes in window
    let sumMagnitude = 0;
    let count = 0;
    
    for (let j = 0; j < freqs.length; j++) {
      const fj = freqs[j];
      const dbj = splDb[j];
      
      // Only include finite values in window
      if (Number.isFinite(fj) && Number.isFinite(dbj) && fj >= fLo && fj <= fHi) {
        const magnitude = Math.pow(10, dbj / 20);
        sumMagnitude += magnitude;
        count++;
      }
    }
    
    // Compute smoothed value
    if (count > 0) {
      const avgMagnitude = sumMagnitude / count;
      smoothed[i] = 20 * Math.log10(Math.max(Number.EPSILON, avgMagnitude));
    } else {
      // No valid values in window: use original
      smoothed[i] = dbOriginal;
    }
  }
  
  return smoothed;
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

function estimateModeQ({ mode, roomDims, surfaceAbsorption, dampingScalar, leakage, f0, rewParityMode }) {
  // Handle both roomDims formats (object or direct properties)
  const dims = roomDims?.widthM ? roomDims : { widthM: roomDims?.width, lengthM: roomDims?.length, heightM: roomDims?.height };
  
  // REW-parity path: derive Q from surface absorption using Sabine RT60
  if (rewParityMode) {
    const W = dims.widthM || 1;
    const L = dims.lengthM || 1;
    const H = dims.heightM || 1;
    const V = W * L * H;
    
    // Surface areas
    const S_floor = L * W;
    const S_ceiling = L * W;
    const S_front = W * H;
    const S_back = W * H;
    const S_left = L * H;
    const S_right = L * H;
    
    // Use absorption coefficients from surfaceAbsorption (or default to 0.30)
    const alpha_floor = surfaceAbsorption?.floor ?? 0.30;
    const alpha_ceiling = surfaceAbsorption?.ceiling ?? 0.30;
    const alpha_front = surfaceAbsorption?.front ?? 0.30;
    const alpha_back = surfaceAbsorption?.back ?? 0.30;
    const alpha_left = surfaceAbsorption?.left ?? 0.30;
    const alpha_right = surfaceAbsorption?.right ?? 0.30;
    
    // Equivalent absorption area (Sabine)
    const A = S_floor * alpha_floor + 
              S_ceiling * alpha_ceiling + 
              S_front * alpha_front + 
              S_back * alpha_back + 
              S_left * alpha_left + 
              S_right * alpha_right;
    
    // Sabine RT60 (0.161 is the constant for metric units)
    const RT60 = 0.161 * V / Math.max(A, 1e-6);
    
    // Convert RT60 to modal time constant tau (60 dB = 13.815 tau)
    const tau = RT60 / 13.815;
    
    // Modal Q at this frequency: Q = π * f * tau
    const Q_sabine = 2 * Math.PI * f0 * tau;
    
    // Clamp to safe range
    const Q_final = Math.max(5, Math.min(80, Q_sabine));

    if (typeof globalThis !== 'undefined' && globalThis.__B44_BASS_DEBUG) {
      console.log('[MODE Q (SABINE)]', {
        f0: Number(f0?.toFixed?.(2) ?? f0),
        RT60: Number(RT60?.toFixed?.(3) ?? RT60),
        tau: Number(tau?.toFixed?.(4) ?? tau),
        Q_sabine: Number(Q_sabine?.toFixed?.(2) ?? Q_sabine),
        Q_final: Number(Q_final?.toFixed?.(2) ?? Q_final),
      });
    }

    return Q_final;
  }
  
  // Original slider-based Q control (non-REW mode)
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