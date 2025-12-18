// bassSimulationEngine.js
// Pure calculation engine for bass simulation (no React)

import { getSubwooferCurve } from "@/components/models/speakers/registry";

const SPEED_OF_SOUND = 343; // m/s
const MIN_DISTANCE = 0.5; // meters (prevent explosion at near-zero)
const MIN_SPL_FLOOR = 30; // dB (prevent -Infinity)
const MODE_Q = 8; // Damping factor for room modes
const MODE_MAX_GAIN_DB = 6; // Maximum mode influence per frequency

// Build frequency array from curve points, clamped to 15-200 Hz
export function buildBassFrequencyBins(curvePoints) {
  if (!Array.isArray(curvePoints) || curvePoints.length === 0) {
    return [];
  }
  
  const frequencies = curvePoints.map(p => p.hz || p.frequency || p[0]).filter(f => f >= 15 && f <= 200);
  return [...new Set(frequencies)].sort((a, b) => a - b);
}

// Linear interpolation between curve points
export function interpolateCurveDb(curvePoints, hz) {
  if (!Array.isArray(curvePoints) || curvePoints.length === 0) {
    return 90; // fallback sensitivity
  }
  
  // Normalize point format
  const points = curvePoints.map(p => ({
    hz: p.hz || p.frequency || p[0],
    db: p.db || p.spl || p[1]
  })).sort((a, b) => a.hz - b.hz);
  
  // Clamp to endpoints
  if (hz <= points[0].hz) return points[0].db;
  if (hz >= points[points.length - 1].hz) return points[points.length - 1].db;
  
  // Linear interpolation
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    if (hz >= p1.hz && hz <= p2.hz) {
      const ratio = (hz - p1.hz) / (p2.hz - p1.hz);
      return p1.db + (p2.db - p1.db) * ratio;
    }
  }
  
  return points[0].db;
}

// Calculate boundary gain based on position
function calculateBoundaryGain(subPos, roomDims, radiationMode) {
  if (radiationMode === 'half-space') {
    return 0; // already grounded
  }
  
  const proximity = 0.30; // meters
  let wallCount = 0;
  
  if (subPos.x <= proximity) wallCount++;
  if (subPos.x >= roomDims.widthM - proximity) wallCount++;
  if (subPos.y <= proximity) wallCount++;
  if (subPos.y >= roomDims.lengthM - proximity) wallCount++;
  if (subPos.z <= proximity) wallCount++; // floor
  
  // +3dB per boundary, max +6dB for corner
  return Math.min(wallCount * 3, 6);
}

// Compute axial room modes (L/W/H) up to fMax
function computeAxialModes(roomDims, fMax = 200) {
  const modes = [];
  const c = SPEED_OF_SOUND;
  
  // Length modes (along Y axis)
  for (let n = 1; n < 50; n++) {
    const f = (c / 2) * (n / roomDims.lengthM);
    if (f > fMax) break;
    modes.push({ axis: 'L', n, fHz: f, dim: roomDims.lengthM });
  }
  
  // Width modes (along X axis)
  for (let n = 1; n < 50; n++) {
    const f = (c / 2) * (n / roomDims.widthM);
    if (f > fMax) break;
    modes.push({ axis: 'W', n, fHz: f, dim: roomDims.widthM });
  }
  
  // Height modes (along Z axis)
  for (let n = 1; n < 50; n++) {
    const f = (c / 2) * (n / roomDims.heightM);
    if (f > fMax) break;
    modes.push({ axis: 'H', n, fHz: f, dim: roomDims.heightM });
  }
  
  return modes;
}

// Calculate mode coupling between source and receiver
function axisCoupling(axis, n, sourcePos, seatPos, dim) {
  let sourceU, seatU;
  
  if (axis === 'L') {
    sourceU = sourcePos.y;
    seatU = seatPos.y;
  } else if (axis === 'W') {
    sourceU = sourcePos.x;
    seatU = seatPos.x;
  } else { // H
    sourceU = sourcePos.z;
    seatU = seatPos.z;
  }
  
  // Standing wave pressure shape: cos(n * π * u / dim)
  const excite = Math.abs(Math.cos(n * Math.PI * sourceU / dim));
  const receive = Math.abs(Math.cos(n * Math.PI * seatU / dim));
  
  return excite * receive;
}

// Apply mode filtering to complex sum
function applyModesToMagnitude(magnitude, f, modes, subs, seatPos, roomDims) {
  const bwHz = modes[0]?.fHz / MODE_Q || 5; // Fallback bandwidth
  let totalGainDb = 0;
  let modeCount = 0;
  
  for (const mode of modes) {
    // Only evaluate modes within window
    const df = Math.abs(f - mode.fHz);
    const windowBw = 2 * (mode.fHz / MODE_Q);
    if (df > windowBw) continue;
    
    // Calculate total coupling for this mode
    let coupling = 0;
    for (const sub of subs) {
      coupling += axisCoupling(mode.axis, mode.n, 
        { x: sub.x, y: sub.y, z: sub.z }, 
        seatPos, 
        mode.dim);
    }
    
    // Normalize coupling to 0..1
    coupling = Math.min(1, coupling / Math.max(1, subs.length));
    
    // Gaussian-shaped resonant gain
    const bw = mode.fHz / MODE_Q;
    const gaussFactor = Math.exp(-Math.pow((f - mode.fHz) / bw, 2));
    const gainDb = MODE_MAX_GAIN_DB * coupling * gaussFactor;
    
    totalGainDb += gainDb;
    modeCount++;
  }
  
  // Clamp total mode influence to ±8dB
  totalGainDb = Math.max(-8, Math.min(8, totalGainDb));
  
  // Apply gain to magnitude
  const gainLinear = Math.pow(10, totalGainDb / 20);
  return magnitude * gainLinear;
}

// Detect nulls in frequency response (20-80 Hz band)
function detectNulls(freqsHz, splDb, band = [20, 80]) {
  const nulls = [];
  
  // Find indices in band
  const indices = freqsHz.map((f, i) => f >= band[0] && f <= band[1] ? i : -1).filter(i => i >= 0);
  
  if (indices.length < 3) return { count: 0, worstDb: 0 };
  
  // Calculate average SPL in band for reference
  const bandSpl = indices.map(i => splDb[i]);
  const avgSpl = bandSpl.reduce((a, b) => a + b, 0) / bandSpl.length;
  
  // Look for local dips
  for (let i = 1; i < indices.length - 1; i++) {
    const idx = indices[i];
    const prevIdx = indices[i - 1];
    const nextIdx = indices[i + 1];
    
    const localAvg = (splDb[prevIdx] + splDb[nextIdx]) / 2;
    const dip = localAvg - splDb[idx];
    
    // Count as null if dip is at least 6dB below local neighbors
    if (dip >= 6) {
      nulls.push({
        freqHz: freqsHz[idx],
        depthDb: -dip,
        spl: splDb[idx]
      });
    }
  }
  
  const worstNull = nulls.length > 0 
    ? Math.min(...nulls.map(n => n.depthDb))
    : 0;
  
  return { 
    count: nulls.length, 
    worstDb: worstNull,
    nulls 
  };
}

// Main simulation engine
export function simulateBassAtSeats({ roomDims, seats, subs, splConfig }) {
  // Guards
  if (!roomDims || !roomDims.widthM || !roomDims.lengthM || !roomDims.heightM) {
    return { seatResponses: {}, metrics: null };
  }
  
  if (!Array.isArray(seats) || seats.length === 0) {
    return { seatResponses: {}, metrics: null };
  }
  
  if (!Array.isArray(subs) || subs.length === 0) {
    return { seatResponses: {}, metrics: null };
  }
  
  // Load curves for all unique models
  const modelCurves = {};
  subs.forEach(sub => {
    if (sub.modelKey && !modelCurves[sub.modelKey]) {
      modelCurves[sub.modelKey] = getSubwooferCurve(sub.modelKey);
    }
  });
  
  // Get frequency bins (use first valid curve)
  const firstCurve = Object.values(modelCurves).find(c => c && c.length > 0);
  if (!firstCurve) {
    return { seatResponses: {}, metrics: null };
  }
  
  const freqsHz = buildBassFrequencyBins(firstCurve);
  if (freqsHz.length === 0) {
    return { seatResponses: {}, metrics: null };
  }
  
  const powerW = splConfig?.globalPowerW ?? 100;
  const eqHeadroomDb = splConfig?.globalEqHeadroomDb ?? 0;
  const radiationMode = splConfig?.radiationMode ?? 'half-space';
  
  const dbPower = 10 * Math.log10(Math.max(1, powerW));
  const dbEq = -eqHeadroomDb;
  
  // Precompute room modes (do this once)
  const modes = computeAxialModes(roomDims, 200);
  
  // Compute response for each seat
  const seatResponses = {};
  
  seats.forEach(seat => {
    const seatId = seat.id || `${seat.x}-${seat.y}`;
    const seatPos = { x: seat.x, y: seat.y, z: seat.z ?? 0.35 };
    
    const splDb = freqsHz.map(f => {
      let sumReal = 0;
      let sumImag = 0;
      
      subs.forEach(sub => {
        const curve = modelCurves[sub.modelKey];
        if (!curve) return;
        
        // Distance
        const dx = sub.x - seatPos.x;
        const dy = sub.y - seatPos.y;
        const dz = sub.z - seatPos.z;
        const d = Math.max(MIN_DISTANCE, Math.sqrt(dx*dx + dy*dy + dz*dz));
        
        // Baseline SPL from curve
        const db0 = interpolateCurveDb(curve, f);
        
        // Distance loss
        const dbDist = -20 * Math.log10(d / 1);
        
        // Boundary gain
        const dbBoundary = calculateBoundaryGain({ x: sub.x, y: sub.y, z: sub.z }, roomDims, radiationMode);
        
        // Total magnitude
        const dbMag = db0 + dbDist + dbPower + dbEq + dbBoundary;
        const amplitude = Math.pow(10, dbMag / 20);
        
        // Time-of-flight phase
        const phi = -2 * Math.PI * f * (d / SPEED_OF_SOUND);
        
        // Complex accumulation
        sumReal += amplitude * Math.cos(phi);
        sumImag += amplitude * Math.sin(phi);
      });
      
      // Convert to SPL with mode influence
      let magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
      
      // Apply room modes to magnitude
      magnitude = applyModesToMagnitude(magnitude, f, modes, subs, seatPos, roomDims);
      
      const spl = 20 * Math.log10(magnitude);
      return Math.max(MIN_SPL_FLOOR, spl);
    });
    
    // Detect nulls for this seat
    const nullInfo = detectNulls(freqsHz, splDb, [20, 80]);
    
    seatResponses[seatId] = { freqsHz, splDb, nulls: nullInfo };
  });
  
  // Compute RP22 metrics
  const metrics = computeRP22Metrics(seatResponses, seats);
  
  return { seatResponses, metrics };
}

// Compute RP22 P14, P18, P19 + Designer fairness metrics
function computeRP22Metrics(seatResponses, seats) {
  const seatIds = Object.keys(seatResponses);
  if (seatIds.length === 0) return null;
  
  // Find MLP
  const mlpSeat = seats.find(s => s.isPrimary);
  const mlpId = mlpSeat ? (mlpSeat.id || `${mlpSeat.x}-${mlpSeat.y}`) : seatIds[0];
  const mlpResponse = seatResponses[mlpId];
  
  if (!mlpResponse) return null;
  
  const { freqsHz, splDb } = mlpResponse;
  
  // Helper: find indices in band
  const getBandIndices = (fMin, fMax) => {
    return freqsHz.map((f, i) => f >= fMin && f <= fMax ? i : -1).filter(i => i >= 0);
  };
  
  const band20_80 = getBandIndices(20, 80);
  const band50_80 = getBandIndices(50, 80);
  
  // P19: Peak SPL at MLP (20-80 Hz)
  const mlpBandSpl = band20_80.map(i => splDb[i]);
  const p19PeakDb = mlpBandSpl.length > 0 ? Math.max(...mlpBandSpl) : 0;
  
  // P18: F3 extension at MLP
  const refBandSpl = band50_80.map(i => splDb[i]);
  const refLevel = refBandSpl.length > 0 ? refBandSpl.reduce((a, b) => a + b, 0) / refBandSpl.length : 0;
  const targetF3 = refLevel - 3;
  
  let f3Hz = 15;
  for (let i = 0; i < freqsHz.length; i++) {
    if (splDb[i] >= targetF3) {
      f3Hz = freqsHz[i];
      break;
    }
  }
  
  // P14: Seat-to-seat variance (20-80 Hz)
  const variancePerFreq = band20_80.map(freqIdx => {
    const splAtFreq = seatIds.map(id => seatResponses[id].splDb[freqIdx]);
    const mean = splAtFreq.reduce((a, b) => a + b, 0) / splAtFreq.length;
    const variance = splAtFreq.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / splAtFreq.length;
    return Math.sqrt(variance);
  });
  
  const p14AvgStdDevDb = variancePerFreq.length > 0 
    ? variancePerFreq.reduce((a, b) => a + b, 0) / variancePerFreq.length 
    : 0;
  
  // Designer Fairness Metrics
  // Calculate average SPL per seat in 20-80 Hz band
  const seatAvgSpl = {};
  seatIds.forEach(id => {
    const bandSpl = band20_80.map(i => seatResponses[id].splDb[i]);
    seatAvgSpl[id] = bandSpl.reduce((a, b) => a + b, 0) / bandSpl.length;
  });
  
  const avgSplValues = Object.values(seatAvgSpl);
  const bestSeatAvgDb = Math.max(...avgSplValues);
  const worstSeatAvgDb = Math.min(...avgSplValues);
  const spreadBestWorstDb = bestSeatAvgDb - worstSeatAvgDb;
  
  // Null analysis across all seats
  const nullsPerSeat = {};
  let worstSeatId = null;
  let worstNullDb = 0;
  
  seatIds.forEach(id => {
    const nullInfo = seatResponses[id].nulls;
    nullsPerSeat[id] = {
      count: nullInfo.count,
      worstDb: nullInfo.worstDb
    };
    
    if (nullInfo.worstDb < worstNullDb) {
      worstNullDb = nullInfo.worstDb;
      worstSeatId = id;
    }
  });
  
  // Fairness Score (0-100)
  let fairnessScore = 100;
  fairnessScore -= 6 * p14AvgStdDevDb;
  fairnessScore -= 2 * spreadBestWorstDb;
  fairnessScore -= 4 * Math.max(0, Math.abs(worstNullDb) - 6);
  fairnessScore = Math.max(0, Math.min(100, fairnessScore));
  
  return {
    p14: { avgStdDevDb: p14AvgStdDevDb },
    p18: { f3Hz },
    p19: { bandPeakDb: p19PeakDb },
    fairness: {
      score: Math.round(fairnessScore),
      seatToSeatStdDevDb: p14AvgStdDevDb,
      bestSeatAvgDb,
      worstSeatAvgDb,
      spreadBestWorstDb,
      nulls: {
        perSeat: nullsPerSeat,
        worstSeatId,
        worstNullDb
      }
    }
  };
}