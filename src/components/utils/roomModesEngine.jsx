// roomModesEngine.js
// Fast room modes calculator for "REW-style" bass response
// Uses rectangular room normal modes with source/receiver coupling

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
  smoothing = 'none', // 'none', '1/12', '1/6', '1/3'
  subFloorHeight = 0.0, // REW default: subs at floor
  normalizeBandHz = [30, 80], // Normalization band (avoid first mode cliff)
  normalizeToDb = 0 // Target level for normalization (0 = relative)
}) {
  // Validate inputs
  if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [], modeCount: 0 } };
  }
  
  if (!seatPosition || typeof seatPosition.x !== 'number' || typeof seatPosition.y !== 'number') {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [], modeCount: 0 } };
  }
  
  // REW parity mode forces 3D modes ON (regardless of UI toggles)
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
    // In REW parity mode, force subs to floor height
    sourcePositions = sourcePositions.map(src => ({
      ...src,
      z: subFloorHeight
    }));
  }
  
  const { widthM, lengthM, heightM } = roomDims;
  const volume = widthM * lengthM * heightM;
  
  // Compute Schroeder frequency
  const rt60 = 0.4; // default estimate
  const schroederHz = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 80;
  
  // Generate frequency axis (log-spaced)
  const freqs = generateFrequencyAxis(fMin, fMax, pointsPerOct);
  
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
  
  // Build complex response using modal resonators with spatial coupling
  let splDb = freqs.map(f => {
    let sumReal = 0;
    let sumImag = 0;
    
    // Complex sum across all modes
    for (const mode of modes) {
      const f0 = mode.freq;
      
      // Mode-order dependent Q (higher order = more damped)
      const order = Math.sqrt(mode.nx * mode.nx + mode.ny * mode.ny + mode.nz * mode.nz);
      const qMode = Math.max(8, Math.min(60, q / Math.max(1, order)));
      
      // Skip distant modes (optimization)
      const bw = f0 / qMode;
      const df = Math.abs(f - f0);
      if (df > 5 * bw) continue;
      
      // Compute spatial coupling for all sources
      let totalCoupling = 0;
      for (const source of sourcePositions) {
        const coupling = computeSpatialCoupling(mode, source, seatPosition, roomDims);
        totalCoupling += coupling;
      }
      
      // Average coupling if multiple sources
      if (sourcePositions.length > 1) {
        totalCoupling /= Math.sqrt(sourcePositions.length);
      }
      
      if (Math.abs(totalCoupling) < 0.001) continue;
      
      // 2nd-order resonator response (complex)
      // H(f) = W / [(f0^2 - f^2) + j*(f0*f/Q)]
      const f2 = f * f;
      const f02 = f0 * f0;
      const denomReal = f02 - f2;
      const denomImag = (f0 * f) / qMode;
      const denomMagSq = denomReal * denomReal + denomImag * denomImag;
      
      // Complex division: totalCoupling / (denomReal + j*denomImag)
      const hReal = (totalCoupling * denomReal) / denomMagSq;
      const hImag = -(totalCoupling * denomImag) / denomMagSq;
      
      // Deterministic per-mode phase offset (avoid artificial coherence)
      const phaseOffsetDeg = (mode.nx * 37 + mode.ny * 73 + mode.nz * 19) % 360;
      const phaseOffsetRad = phaseOffsetDeg * (Math.PI / 180);
      
      // Apply phase rotation: (hReal + j*hImag) * e^(j*phaseOffset)
      const cosPhase = Math.cos(phaseOffsetRad);
      const sinPhase = Math.sin(phaseOffsetRad);
      const rotatedReal = hReal * cosPhase - hImag * sinPhase;
      const rotatedImag = hReal * sinPhase + hImag * cosPhase;
      
      sumReal += rotatedReal;
      sumImag += rotatedImag;
    }
    
    // Magnitude in dB (relative)
    const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
    const db = 20 * Math.log10(Math.max(magnitude, 1e-12));
    
    // Guard against non-finite values
    return isFinite(db) ? db : 0;
  });
  
  // Apply smoothing if requested
  if (smoothing !== 'none') {
    splDb = applySmoothing(freqs, splDb, smoothing);
  }
  
  // Normalize in REW parity mode (relative curve, anchored to mid-band)
  let actualNormBand = normalizeBandHz;
  if (rewParityMode) {
    const result = normalizeToRelative(freqs, splDb, normalizeBandHz);
    splDb = result.splDb;
    actualNormBand = result.actualBand;
  }
  
  // Build detailed mode markers (for REW-style overlay)
  const modeMarkers = modes.map(m => {
    let axisLabel = null;
    if (m.type === 'axial') {
      if (m.nx > 0) axisLabel = 'W';
      else if (m.ny > 0) axisLabel = 'L';
      else if (m.nz > 0) axisLabel = 'H';
    }
    
    return {
      fHz: m.freq,
      family: m.type,
      axisLabel,
      n: [m.nx, m.ny, m.nz]
    };
  });
  
  // Extract mode frequencies for markers (axial only for clarity)
  const modeMarkersHz = modes
    .filter(m => m.type === 'axial')
    .map(m => m.freq)
    .sort((a, b) => a - b);
  
  // First ten mode frequencies for debug
  const firstTenModeHz = modes
    .slice(0, 10)
    .map(m => m.freq.toFixed(1));
  
  // Count by type
  const axialCount = modes.filter(m => m.type === 'axial').length;
  const tangentialCount = modes.filter(m => m.type === 'tangential').length;
  const obliqueCount = modes.filter(m => m.type === 'oblique').length;
  
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
 * Generate log-spaced frequency axis
 */
function generateFrequencyAxis(fMin, fMax, pointsPerOct) {
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
 * Returns all axial, tangential, and oblique modes up to fMax
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
  
  // Maximum mode indices (prevent runaway)
  const nMax = Math.ceil((fMax / c) * 2 * Math.max(widthM, lengthM, heightM)) + 5;
  
  for (let nx = 0; nx <= nMax; nx++) {
    for (let ny = 0; ny <= nMax; ny++) {
      for (let nz = 0; nz <= nMax; nz++) {
        // Skip (0,0,0) mode
        if (nx === 0 && ny === 0 && nz === 0) continue;
        
        // Compute modal frequency
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
        
        modes.push({
          nx,
          ny,
          nz,
          freq,
          type
        });
      }
    }
  }
  
  return modes.sort((a, b) => a.freq - b.freq);
}

/**
 * Compute spatial coupling between source and receiver for a given mode
 * Uses cosine pressure mode shapes (signed for interference)
 */
function computeSpatialCoupling(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  // Cosine pressure mode shapes (preserves sign for interference)
  const srcX = nx > 0 ? Math.cos(nx * Math.PI * source.x / widthM) : 1;
  const srcY = ny > 0 ? Math.cos(ny * Math.PI * source.y / lengthM) : 1;
  const srcZ = nz > 0 ? Math.cos(nz * Math.PI * (source.z ?? 0.0) / heightM) : 1;
  const S = srcX * srcY * srcZ;
  
  const rcvX = nx > 0 ? Math.cos(nx * Math.PI * receiver.x / widthM) : 1;
  const rcvY = ny > 0 ? Math.cos(ny * Math.PI * receiver.y / lengthM) : 1;
  const rcvZ = nz > 0 ? Math.cos(nz * Math.PI * (receiver.z ?? 1.2) / heightM) : 1;
  const R = rcvX * rcvY * rcvZ;
  
  // Coupling (signed - preserves interference effects)
  return S * R;
}

/**
 * Apply fractional octave smoothing to response
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
    
    // Find indices in smoothing window
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
 * Normalize response to relative (0 dB) by removing median offset in band
 * Avoids "cliff" at low frequencies by anchoring to mid-band where modes exist
 * Returns: { splDb: normalized array, actualBand: band used }
 */
function normalizeToRelative(freqs, splDb, bandHz) {
  // Helper to extract finite values in a band
  const getFiniteValuesInBand = (fMin, fMax) => {
    return freqs
      .map((f, i) => f >= fMin && f <= fMax && isFinite(splDb[i]) ? splDb[i] : null)
      .filter(v => v !== null)
      .sort((a, b) => a - b);
  };
  
  // Try primary band first (30-80 Hz)
  let bandValues = getFiniteValuesInBand(bandHz[0], bandHz[1]);
  let actualBand = bandHz;
  
  // Fallback to 20-80 Hz if primary band is empty
  if (bandValues.length === 0) {
    bandValues = getFiniteValuesInBand(20, 80);
    actualBand = [20, 80];
  }
  
  // Fallback to all finite values if still empty
  if (bandValues.length === 0) {
    bandValues = splDb.filter(v => isFinite(v)).sort((a, b) => a - b);
    actualBand = [freqs[0], freqs[freqs.length - 1]];
  }
  
  // If still no data, return zeros
  if (bandValues.length === 0) {
    return { 
      splDb: splDb.map(() => 0),
      actualBand 
    };
  }
  
  // Use median for stability (robust to outliers)
  const medianDb = bandValues[Math.floor(bandValues.length / 2)];
  
  // Normalize and sanitize
  const normalized = splDb.map(spl => {
    if (!isFinite(spl)) return 0;
    const normalized = spl - medianDb;
    return isFinite(normalized) ? normalized : 0;
  });
  
  return {
    splDb: normalized,
    actualBand
  };
}