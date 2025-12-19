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
  
  // Build magnitude response with proper modal weighting
  const baselineDb = 90; // reference level
  let splDb = freqs.map(f => {
    let totalContribution = 0;
    
    // Sum contributions from all modes
    for (const mode of modes) {
      const f0 = mode.freq;
      const Q = q;
      
      // Bandwidth for early-out optimization
      const bw = f0 / Q;
      const df = Math.abs(f - f0);
      if (df > 5 * bw) continue;
      
      // Compute modal contribution from all sources
      let sourceCoupling = 0;
      for (const source of sourcePositions) {
        const coupling = computeModalCoupling(mode, source, seatPosition, roomDims);
        sourceCoupling += coupling;
      }
      
      // Average if multiple sources
      if (sourcePositions.length > 0) {
        sourceCoupling /= Math.sqrt(sourcePositions.length);
      }
      
      if (Math.abs(sourceCoupling) < 0.001) continue;
      
      // Compute resonator magnitude response
      const omega = 2 * Math.PI * f;
      const omega0 = 2 * Math.PI * f0;
      const domega = omega - omega0;
      const bwRad = omega0 / Q;
      
      // Magnitude of 2nd-order resonator
      const denom = Math.sqrt(domega * domega + bwRad * bwRad);
      const peakMag = bwRad / denom;
      
      // Modal gain scaled by mode type (axial stronger than tangential)
      let modeWeight = 1.0;
      if (mode.type === 'axial') modeWeight = 1.0;
      else if (mode.type === 'tangential') modeWeight = 0.5;
      else if (mode.type === 'oblique') modeWeight = 0.25;
      
      const modeGain = 12 * modeWeight; // dB at peak
      const contribution = sourceCoupling * peakMag * modeGain;
      
      totalContribution += contribution;
    }
    
    return Math.max(30, Math.min(130, baselineDb + totalContribution));
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
 * Compute modal coupling for source and receiver
 */
function computeModalCoupling(mode, source, receiver, roomDims) {
  const { widthM, lengthM, heightM } = roomDims;
  const { nx, ny, nz } = mode;
  
  // Source coupling (pressure mode shape)
  let srcCoupling = 1;
  if (nx > 0) {
    srcCoupling *= Math.cos(nx * Math.PI * source.x / widthM);
  }
  if (ny > 0) {
    srcCoupling *= Math.cos(ny * Math.PI * source.y / lengthM);
  }
  if (nz > 0) {
    const srcZ = source.z ?? 0.0;
    srcCoupling *= Math.cos(nz * Math.PI * srcZ / heightM);
  }
  
  // Receiver coupling
  let rcvCoupling = 1;
  if (nx > 0) {
    rcvCoupling *= Math.cos(nx * Math.PI * receiver.x / widthM);
  }
  if (ny > 0) {
    rcvCoupling *= Math.cos(ny * Math.PI * receiver.y / lengthM);
  }
  if (nz > 0) {
    const rcvZ = receiver.z ?? 1.2;
    rcvCoupling *= Math.cos(nz * Math.PI * rcvZ / heightM);
  }
  
  // Combined coupling (energy-like: square of pressure)
  const coupling = srcCoupling * rcvCoupling;
  return coupling * Math.abs(coupling); // preserves sign, scales by magnitude
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
  // Find mean SPL in reference band
  const [fMin, fMax] = bandHz;
  const indices = freqs.map((f, i) => f >= fMin && f <= fMax ? i : -1).filter(i => i >= 0);
  
  if (indices.length === 0) return splDb;
  
  const refSum = indices.reduce((sum, i) => sum + splDb[i], 0);
  const refLevel = refSum / indices.length;
  
  // Offset to target level
  const offset = targetDb - refLevel;
  return splDb.map(spl => spl + offset);
}