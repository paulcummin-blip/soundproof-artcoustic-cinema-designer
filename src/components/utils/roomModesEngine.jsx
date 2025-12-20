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
  
  // Build response: complex pressure sum of modes + small direct term (REW-ish)
  let splDb = freqs.map((f) => {
    // 1) Small direct term (kept intentionally small so modes dominate below Schroeder)
    let directRe = 0;
    let directIm = 0;

    for (const source of sourcePositions) {
      const dx = source.x - seatPosition.x;
      const dy = source.y - seatPosition.y;
      const dz = (source.z ?? 0) - (seatPosition.z ?? 1.2);
      const r = Math.max(0.5, Math.sqrt(dx*dx + dy*dy + dz*dz));

      // 1/r pressure, with phase from distance (k*r)
      const amp = 1.0 / r;
      const phi = -2 * Math.PI * f * (r / c);

      directRe += amp * Math.cos(phi);
      directIm += amp * Math.sin(phi);
    }

    if (sourcePositions.length > 1) {
      directRe /= sourcePositions.length;
      directIm /= sourcePositions.length;
    }

    // 2) Modal complex sum
    let sumRe = directRe;
    let sumIm = directIm;

    for (const mode of modes) {
      const f0 = mode.freq;
      if (!(f0 > 0)) continue;

      // Skip far-away modes for speed
      const df = Math.abs(f - f0);
      if (df > 40) continue;

      // Spatial coupling (signed)
      let coupling = 0;
      for (const source of sourcePositions) {
        coupling += computeSpatialCoupling(mode, source, seatPosition, roomDims);
      }
      if (sourcePositions.length > 1) coupling /= sourcePositions.length;
      if (Math.abs(coupling) < 1e-6) continue;

      // Mode damping from surface absorption (REW-ish approximation)
      const qMode = estimateModeQ({
        mode,
        roomDims,
        surfaceAbsorption,
        dampingScalar,
        leakage,
        f0,
      });

      // Second-order resonator (complex)
      // H(f) = 1 / ( (f0^2 - f^2) + j*(f0*f/Q) )
      const f2 = f * f;
      const f02 = f0 * f0;
      const re = (f02 - f2);
      const im = (f0 * f / Math.max(1e-6, qMode));

      // Complex division: coupling / (re + j im)
      const denom = (re*re + im*im);
      const hRe = (coupling * re) / denom;
      const hIm = (-coupling * im) / denom;

      sumRe += hRe;
      sumIm += hIm;
    }

    // Magnitude -> dB
    const mag = Math.max(1e-12, Math.sqrt(sumRe*sumRe + sumIm*sumIm));
    return 20 * Math.log10(mag);
  });

    // REW-like sealed-room pressure behaviour below lowest axial mode.
    // Subtle boost to prevent cliff (cap at +6 dB, not +12)
    if (rewParityMode && Number.isFinite(lowestAxial) && lowestAxial > 0) {
      const f0 = lowestAxial;
      const maxBoostDb = 6;

      splDb = splDb.map((db, i) => {
        const f = freqs[i];
        if (!(Number.isFinite(f) && f > 0 && Number.isFinite(db))) return db;
        if (f >= f0) return db;

        // 12 dB/oct slope, capped at +6 dB
        const boost = Math.min(maxBoostDb, 12 * Math.log2(f0 / f));
        return db + boost;
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
      normBandHz: actualNormBand,
      normApplied,
      smoothingApplied,
      nonFiniteRepaired,
      rawMin: rawMin.toFixed(2),
      rawMax: rawMax.toFixed(2),
      rawRange: rawRange.toFixed(2),
      preNormMin: preNormMin.toFixed(2),
      preNormMax: preNormMax.toFixed(2),
      preNormRange: preNormRange.toFixed(2),
      postNormMin: postNormMin.toFixed(2),
      postNormMax: postNormMax.toFixed(2),
      postNormRange: postNormRange.toFixed(2)
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
  // Base: start from an RT60 estimate derived from average absorption
  const { widthM, lengthM, heightM } = roomDims;

  const S_floor = widthM * lengthM;
  const S_ceiling = S_floor;
  const S_front = widthM * heightM;
  const S_back = S_front;
  const S_left = lengthM * heightM;
  const S_right = S_left;

  const A =
    S_floor   * clamp01(surfaceAbsorption.floor) +
    S_ceiling * clamp01(surfaceAbsorption.ceiling) +
    S_front   * clamp01(surfaceAbsorption.front) +
    S_back    * clamp01(surfaceAbsorption.back) +
    S_left    * clamp01(surfaceAbsorption.left) +
    S_right   * clamp01(surfaceAbsorption.right);

  const V = Math.max(0.1, widthM * lengthM * heightM);

  // Sabine RT60 (rough, but REW-like in spirit). RT60 = 0.161 V / A
  let rt60 = 0.161 * V / Math.max(0.1, A);

  // Mode-specific weighting: higher order modes decay faster (more surface interaction)
  const order = Math.sqrt(mode.nx*mode.nx + mode.ny*mode.ny + mode.nz*mode.nz);
  const orderLoss = 1 + 0.15 * Math.max(0, order - 1);

  // Leakage adds uniform extra loss (reduces RT60)
  const leakLoss = 1 + 3 * clamp01(leakage);

  rt60 = rt60 / (orderLoss * leakLoss);

  // Apply dampingScalar (slider maps to this)
  rt60 = rt60 / Math.max(0.25, dampingScalar);

  // Convert to Q: Q ≈ π f0 RT60
  const q = Math.max(6, Math.min(80, Math.PI * f0 * rt60));
  return q;
}

function clamp01(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}