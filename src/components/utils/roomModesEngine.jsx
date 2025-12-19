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
  normalizeBandHz = [20, 30], // REW-like normalization band
  normalizeToDb = 90 // Target level for normalization
}) {
  // Validate inputs
  if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [] } };
  }
  
  if (!seatPosition || typeof seatPosition.x !== 'number' || typeof seatPosition.y !== 'number') {
    return { freqs: [], splDb: [], debug: { schroederHz: 0, modeMarkersHz: [] } };
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
  
  // Build complex response using spatial coupling and mode-order Q
  let splDb = freqs.map(f => {
    let sumReal = 0;
    let sumImag = 0;
    
    // Complex sum across all modes
    for (const mode of modes) {
      const f0 = mode.freq;
      
      // Mode-order dependent Q (higher order = more damped)
      const order = Math.sqrt(mode.nx * mode.nx + mode.ny * mode.ny + mode.nz * mode.nz);
      const qMode = Math.max(8, Math.min(60, q / Math.max(1, order)));
      
      const bw = f0 / qMode;
      const df = Math.abs(f - f0);
      
      // Early out for distant modes
      if (df > 5 * bw) continue;
      
      // Compute spatial coupling for all sources
      let totalCoupling = 0;
      for (const source of sourcePositions) {
        const coupling = computeSpatialCoupling(mode, source, seatPosition, roomDims);
        totalCoupling += coupling;
      }
      
      // Average coupling if multiple sources
      if (sourcePositions.length > 0) {
        totalCoupling /= Math.sqrt(sourcePositions.length);
      }
      
      if (Math.abs(totalCoupling) < 0.001) continue;
      
      // Complex Lorentzian response: H(f) = W / (1 + j*(f-f0)/(bw/2))
      const denomReal = 1;
      const denomImag = (f - f0) / (bw / 2);
      const denomMagSq = denomReal * denomReal + denomImag * denomImag;
      
      // Complex division: (totalCoupling + 0j) / (denomReal + j*denomImag)
      const hReal = (totalCoupling * denomReal) / denomMagSq;
      const hImag = -(totalCoupling * denomImag) / denomMagSq;
      
      sumReal += hReal;
      sumImag += hImag;
    }
    
    // Magnitude in dB (relative)
    const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
    return 20 * Math.log10(Math.max(magnitude, 1e-9));
  });
  
  // Apply smoothing if requested
  if (smoothing !== 'none') {
    splDb = applySmoothing(freqs, splDb, smoothing);
  }
  
  // Normalize in REW parity mode (anchor to specific band)
  if (rewParityMode) {
    splDb = normalizeToReferenceLevel(freqs, splDb, normalizeBandHz, normalizeToDb);
  }
  
  // Extract mode frequencies for markers (axial only for clarity)
  const modeMarkersHz = modes
    .filter(m => m.type === 'axial')
    .map(m => m.freq)
    .sort((a, b) => a - b);
  
  return {
    freqs,
    splDb,
    debug: {
      schroederHz,
      modeMarkersHz
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
  
  // Wave numbers for this mode
  const kx = nx * Math.PI / widthM;
  const ky = ny * Math.PI / lengthM;
  const kz = nz * Math.PI / heightM;
  
  // Source pressure shape
  const srcX = nx > 0 ? Math.cos(kx * source.x) : 1;
  const srcY = ny > 0 ? Math.cos(ky * source.y) : 1;
  const srcZ = nz > 0 ? Math.cos(kz * (source.z ?? 0.0)) : 1;
  const S = srcX * srcY * srcZ;
  
  // Receiver pressure shape
  const rcvX = nx > 0 ? Math.cos(kx * receiver.x) : 1;
  const rcvY = ny > 0 ? Math.cos(ky * receiver.y) : 1;
  const rcvZ = nz > 0 ? Math.cos(kz * (receiver.z ?? 1.2)) : 1;
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
 * Normalize response to specific reference level in band (REW-like)
 */
function normalizeToReferenceLevel(freqs, splDb, bandHz, targetDb) {
  // Find median SPL in reference band (more robust than mean)
  const [fMin, fMax] = bandHz;
  const bandValues = freqs
    .map((f, i) => f >= fMin && f <= fMax ? splDb[i] : null)
    .filter(v => v !== null)
    .sort((a, b) => a - b);
  
  if (bandValues.length === 0) return splDb;
  
  // Use median for stability
  const refLevel = bandValues[Math.floor(bandValues.length / 2)];
  
  // Offset to target level (anchor to 0 dB for relative mode)
  const offset = targetDb - refLevel;
  return splDb.map(spl => spl + offset);
}