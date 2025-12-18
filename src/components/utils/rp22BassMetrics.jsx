// rp22BassMetrics.js
// Pure helper functions for computing RP22 P14/P18/P19 from bass simulation data

// Internal helper: 1/3 octave smoothing
function apply13OctaveSmoothing(freqsHz, splDb) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return splDb;
  }
  
  if (freqsHz.length !== splDb.length) {
    return splDb;
  }
  
  const smoothed = [];
  
  for (let i = 0; i < freqsHz.length; i++) {
    const fc = freqsHz[i];
    const fLow = fc / Math.pow(2, 1/6);  // Lower edge of 1/3 octave
    const fHigh = fc * Math.pow(2, 1/6); // Upper edge of 1/3 octave
    
    // Find all points within this band
    const bandPoints = [];
    for (let j = 0; j < freqsHz.length; j++) {
      if (freqsHz[j] >= fLow && freqsHz[j] <= fHigh) {
        bandPoints.push(splDb[j]);
      }
    }
    
    // Average SPL in band
    const avgSpl = bandPoints.length > 0 
      ? bandPoints.reduce((a, b) => a + b, 0) / bandPoints.length
      : splDb[i];
    
    smoothed.push(avgSpl);
  }
  
  return smoothed;
}

// P19: Max deviation from target below Schroeder frequency (1/3 octave smoothing)
export function computeP19DeviationBelowSchroeder({ freqsHz, splDb, targetDb, schroederHz }) {
  // Input validation
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { resultDb: null, details: { reason: "missing_data" } };
  }
  
  if (freqsHz.length !== splDb.length) {
    return { resultDb: null, details: { reason: "array_length_mismatch" } };
  }
  
  if (typeof schroederHz !== 'number' || !isFinite(schroederHz)) {
    return { resultDb: null, details: { reason: "invalid_schroeder" } };
  }
  
  // Default target is flat (0 dB)
  const target = Array.isArray(targetDb) && targetDb.length === freqsHz.length
    ? targetDb
    : freqsHz.map(() => 0);
  
  // Apply 1/3 octave smoothing
  const smoothedSplDb = apply13OctaveSmoothing(freqsHz, splDb);
  
  // Filter to frequencies below Schroeder
  const belowSchroeder = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] <= schroederHz) {
      const dev = Math.abs(smoothedSplDb[i] - target[i]);
      if (isFinite(dev)) {
        belowSchroeder.push(dev);
      }
    }
  }
  
  if (belowSchroeder.length === 0) {
    return { resultDb: null, details: { reason: "no_points_below_schroeder" } };
  }
  
  const maxDev = Math.max(...belowSchroeder);
  
  return {
    resultDb: maxDev,
    details: {
      bandHz: [Math.min(...freqsHz.filter(f => f <= schroederHz)), schroederHz],
      pointsEvaluated: belowSchroeder.length
    }
  };
}

// P18: In-room -3dB extension frequency
export function computeP18InRoomF3({ freqsHz, splDb, targetDb, minHz = 10, maxHz = 200 }) {
  // Input validation
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { f3Hz: null, details: { reason: "missing_data" } };
  }
  
  if (freqsHz.length !== splDb.length) {
    return { f3Hz: null, details: { reason: "array_length_mismatch" } };
  }
  
  // Default target is flat (0 dB)
  const target = Array.isArray(targetDb) && targetDb.length === freqsHz.length
    ? targetDb
    : freqsHz.map(() => 0);
  
  // Compute deviation from target
  const deviation = splDb.map((spl, i) => spl - target[i]);
  
  // Find reference level in 50-80 Hz band
  const refBand = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] >= 50 && freqsHz[i] <= 80) {
      refBand.push(deviation[i]);
    }
  }
  
  if (refBand.length === 0) {
    return { f3Hz: null, details: { reason: "no_reference_band" } };
  }
  
  const refLevel = refBand.reduce((a, b) => a + b, 0) / refBand.length;
  const targetLevel = refLevel - 3; // -3dB relative to reference
  
  // Find lowest frequency where deviation reaches targetLevel
  // Search from low to high frequency
  let f3Hz = null;
  
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] < minHz || freqsHz[i] > maxHz) continue;
    
    if (deviation[i] >= targetLevel) {
      // Linear interpolation if we have a previous point
      if (i > 0 && freqsHz[i - 1] >= minHz) {
        const f1 = freqsHz[i - 1];
        const f2 = freqsHz[i];
        const d1 = deviation[i - 1];
        const d2 = deviation[i];
        
        // Interpolate to find exact crossing point
        const ratio = (targetLevel - d1) / (d2 - d1);
        f3Hz = f1 + ratio * (f2 - f1);
      } else {
        f3Hz = freqsHz[i];
      }
      break;
    }
  }
  
  return {
    f3Hz,
    details: {
      refLevel,
      targetLevel,
      refBandHz: [50, 80]
    }
  };
}

// P14: Maximum LFE SPL capability at RSP (20-80 Hz)
export function computeP14MaxLfeSpl({ freqsHz, splDb, band = [20, 80] }) {
  // Input validation
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length === 0) {
    return { maxSplDb: null, details: { reason: "missing_data" } };
  }
  
  if (freqsHz.length !== splDb.length) {
    return { maxSplDb: null, details: { reason: "array_length_mismatch" } };
  }
  
  const [minHz, maxHz] = band;
  
  // Filter to band
  const bandSpl = [];
  for (let i = 0; i < freqsHz.length; i++) {
    if (freqsHz[i] >= minHz && freqsHz[i] <= maxHz && isFinite(splDb[i])) {
      bandSpl.push(splDb[i]);
    }
  }
  
  if (bandSpl.length === 0) {
    return { maxSplDb: null, details: { reason: "no_points_in_band" } };
  }
  
  const maxSplDb = Math.max(...bandSpl);
  
  return {
    maxSplDb,
    details: {
      bandHz: band,
      pointsEvaluated: bandSpl.length
    }
  };
}