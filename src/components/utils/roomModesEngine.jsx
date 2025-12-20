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
  normalizeToDb = 0,
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
  
  // REW parity mode forces 3D modes ON
  if (rewParityMode) {
    includeAxial = true;
    includeTangential = true;
    includeOblique = true;
  }
  
  // Default source if none provided
  if (!sourcePositions || sourcePositions.length === 0) {
    sourcePositions = [{
      x: roomDims.widthM / 2,
      y: 0.2,
      z: rewParityMode ? subFloorHeight : 0.2
    }];
  } else if (rewParityMode) {
    // In REW parity mode, force subs to floor
    sourcePositions = sourcePositions.map(src => ({
      ...src,
      z: subFloorHeight
    }));
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
    includeAxial,
    includeTangential,
    includeOblique
  });

  // Lowest axial mode (used for sealed-room pressure behaviour)
  const lowestAxial = modes.find(m => m.type === "axial")?.freq || null;
  
  // Build response: complex pressure sum of modes (REW Room Simulator behavior)
  let splDb = freqs.map((f) => {
    // Modal complex sum only (no direct term - room dominates at these frequencies)
    let sumRe = 0;
    let sumIm = 0;

    for (const mode of modes) {
      const f0 = mode.freq;
      if (!(f0 > 0)) continue;

      // Skip far-away modes for speed (bandwidth-aware)
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
      for (let subIdx = 0; subIdx < sourcePositions.length; subIdx++) {
        const source = sourcePositions[subIdx];
        
        // Spatial coupling (signed, preserves phase)
        const coupling = computeSpatialCoupling(mode, source, seatPosition, roomDims);
        if (Math.abs(coupling) < 1e-6) continue;

        // Apply sub's product response if provided (frequency-dependent gain)
        let productGainLinear = 1.0;
        if (subProductCurves && subProductCurves[subIdx]) {
          const curveDb = subProductCurves[subIdx][freqs.indexOf(f)];
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

        // Complex weight for this sub
        const weightRe = gainLinear * Math.cos(totalPhase);
        const weightIm = gainLinear * Math.sin(totalPhase);

        // Second-order resonator (complex)
        // H(f) = 1 / ( (f0^2 - f^2) + j*(f0*f/Q) )
        const f2 = f * f;
        const f02 = f0 * f0;
        const re = (f02 - f2);
        const im = (f0 * f / Math.max(1e-6, qMode));
        const denom = (re*re + im*im);
        const hRe = re / denom;
        const hIm = -im / denom;

        // Weighted modal contribution: weight * H * coupling
        const cRe = coupling * (weightRe * hRe - weightIm * hIm);
        const cIm = coupling * (weightRe * hIm + weightIm * hRe);

        sumRe += cRe;
        sumIm += cIm;
      }
    }

    // Magnitude -> dB
    const mag = Math.max(1e-12, Math.sqrt(sumRe*sumRe + sumIm*sumIm));
    return 20 * Math.log10(mag);
  });

    // REW-like sealed-room pressure behaviour below lowest axial mode
    // Smooth transition to pressure-dominated region (no cliff)
    if (rewParityMode && Number.isFinite(lowestAxial) && lowestAxial > 0) {
      const f1 = lowestAxial;
      const fTransition = Math.max(15, f1 * 0.6); // Transition zone

      splDb = splDb.map((db, i) => {
        const f = freqs[i];
        if (!(Number.isFinite(f) && f > 0 && Number.isFinite(db))) return db;
        if (f >= f1) return db;

        // Gentle pressure-zone rise: +6 dB/oct below f1, smoothly blended
        const octavesDown = Math.log2(f1 / Math.max(f, 10));
        const targetBoost = Math.min(10, 6 * octavesDown); // Cap at +10 dB

        // Smooth blend from f1 down to fTransition
        let blendFactor;
        if (f <= fTransition) {
          blendFactor = 1.0;
        } else {
          // Cosine blend for smoothness
          const t = (f - fTransition) / (f1 - fTransition);
          blendFactor = 0.5 * (1 - Math.cos(Math.PI * (1 - t)));
        }

        return db + targetBoost * blendFactor;
      });
    }

    // Schroeder blend: above fs, reduce explicit modal contrast (statistical smoothing feel)
    if (rewParityMode) {
      const volume = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
      const rt60 = 0.4;
      const fs = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 120;

      splDb = splDb.map((db, i) => {
        const f = freqs[i];
        if (f <= fs) return db;

        // Blend to a gently smoothed "statistical" curve (no wild modal spikes)
        const f2 = fs * 1.6;
        const t = Math.max(0, Math.min(1, (f - fs) / Math.max(1e-6, (f2 - fs))));

        // Simple target: a mild downward tilt
        const target = dbAt(fs, freqs, splDb) - 3 * Math.log2(f / fs);

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
  
  // Normalize to 30-80 Hz average = 0 dB (REW-style)
  let actualNormBand = normalizeBandHz;
  let normApplied = false;
  if (rewParityMode && normalizeBandHz) {
    const result = normalizeToAverage(freqs, splDb, normalizeBandHz);
    splDb = result.splDb;
    actualNormBand = result.actualBand;
    normApplied = result.applied;
  }

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

  return {
    freqs,
    splDb,
    debug: {
      schroederHz,
      modeMarkersHz,
      modeMarkers,
      modeCount: modes.length,
      axialCount,
      tangentialCount,
      obliqueCount,
      firstTenModeHz,
      lowestAxialHz: lowestAxial,
      qBase: qBase.toFixed(1),
      qMappingText,
      absoluteMode: absoluteSplMode,
      normBandHz: actualNormBand,
      normApplied,
      smoothingApplied,
      nonFiniteRepaired,
      rawRange: rawRange.toFixed(2),
      preNormRange: preNormRange.toFixed(2),
      postNormRange: postNormRange.toFixed(2),
      productCurvesApplied: !!subProductCurves
    }
  };
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