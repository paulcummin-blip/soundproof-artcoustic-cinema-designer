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
  normalizeToDb = 0
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
    ? generateLinearFrequencyAxis(fMin, fMax, 1.0) // 1 Hz steps
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
  
  // Build response using Lorentzian modal resonators with spatial coupling
  let splDb = freqs.map(f => {
    let sumPressure = 0;
    
    // Sum all modal contributions (magnitude-based Lorentzian)
    for (const mode of modes) {
      const f0 = mode.freq;
      
      // Mode-order dependent Q (higher order = more damped)
      const order = Math.sqrt(mode.nx * mode.nx + mode.ny * mode.ny + mode.nz * mode.nz);
      const qMode = Math.max(8, Math.min(60, q / Math.max(1, order)));
      
      // Skip distant modes (optimization)
      const bw = f0 / qMode;
      const df = Math.abs(f - f0);
      if (df > 5 * bw) continue;
      
      // Compute spatial coupling (pressure weighting)
      let totalCoupling = 0;
      for (const source of sourcePositions) {
        const coupling = computeSpatialCoupling(mode, source, seatPosition, roomDims);
        totalCoupling += coupling;
      }
      
      // Average if multiple sources
      if (sourcePositions.length > 1) {
        totalCoupling /= sourcePositions.length;
      }
      
      if (Math.abs(totalCoupling) < 0.001) continue;
      
      // Lorentzian resonator response (REW-style)
      // A(f) = G * (f0/Q)^2 / ( (f^2 - f0^2)^2 + (f0*f/Q)^2 )
      const f2 = f * f;
      const f02 = f0 * f0;
      const numerator = totalCoupling * (f0 / qMode) * (f0 / qMode);
      const denominator = Math.pow(f2 - f02, 2) + Math.pow(f0 * f / qMode, 2);
      
      const modeContribution = numerator / denominator;
      sumPressure += modeContribution;
    }
    
    // Convert to dB (20*log10 for pressure)
    const db = 20 * Math.log10(Math.abs(sumPressure) + 1e-12);
    return isFinite(db) ? db : -120;
  });
  
  // Apply smoothing if requested (post-process only)
  if (smoothing !== 'none') {
    splDb = applySmoothing(freqs, splDb, smoothing);
  }
  
  // Normalize to 30-80 Hz average = 0 dB (REW-style)
  let actualNormBand = normalizeBandHz;
  if (rewParityMode) {
    const result = normalizeToAverage(freqs, splDb, normalizeBandHz);
    splDb = result.splDb;
    actualNormBand = result.actualBand;
  }
  
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
      normBandHz: actualNormBand
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
  
  // Fallback to 20-80 Hz
  if (bandValues.length === 0) {
    bandValues = getFiniteInBand(20, 80);
    actualBand = [20, 80];
  }
  
  // Fallback to all finite
  if (bandValues.length === 0) {
    bandValues = splDb.filter(v => isFinite(v));
    actualBand = [freqs[0], freqs[freqs.length - 1]];
  }
  
  // If no data, return zeros
  if (bandValues.length === 0) {
    return { 
      splDb: splDb.map(() => 0),
      actualBand 
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
    actualBand
  };
}