// bassSimulationEngine.js
// Pure calculation engine for bass simulation (no React)

import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { 
  computeP14MaxLfeSpl, 
  computeP18InRoomF3, 
  computeP19DeviationBelowSchroeder 
} from "@/components/utils/rp22BassMetrics";

const SPEED_OF_SOUND = 343; // m/s
const MIN_DISTANCE = 0.5; // meters (prevent explosion at near-zero)
const MIN_SPL_FLOOR = 30; // dB (prevent -Infinity)

// Build frequency array from curve points, clamped to 15-200 Hz
export function buildBassFrequencyBins(curvePoints) {
  if (!Array.isArray(curvePoints) || curvePoints.length === 0) {
    return [];
  }
  
  const frequencies = curvePoints.map(p => p.hz || p.frequency || p[0]).filter(f => f >= 15 && f <= 200);
  return [...new Set(frequencies)].sort((a, b) => a - b);
}

// Generate target curve for bass (flat through 20-80 Hz, gentle roll-off above)
export function generateTargetCurve(freqsHz) {
  if (!Array.isArray(freqsHz) || freqsHz.length === 0) {
    return [];
  }
  
  return freqsHz.map(f => {
    if (f <= 80) {
      return 0; // Flat reference
    }
    // Gentle roll-off above 80 Hz: -6 dB by 200 Hz
    const slope = -6 / (200 - 80);
    return slope * (f - 80);
  });
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
    modes.push({ axis: 'Y', n, fHz: f, dim: roomDims.lengthM });
  }
  
  // Width modes (along X axis)
  for (let n = 1; n < 50; n++) {
    const f = (c / 2) * (n / roomDims.widthM);
    if (f > fMax) break;
    modes.push({ axis: 'X', n, fHz: f, dim: roomDims.widthM });
  }
  
  // Height modes (along Z axis)
  for (let n = 1; n < 50; n++) {
    const f = (c / 2) * (n / roomDims.heightM);
    if (f > fMax) break;
    modes.push({ axis: 'Z', n, fHz: f, dim: roomDims.heightM });
  }
  
  return modes;
}

// Export for UI use
export { computeAxialModes };

// Compute REW-style modes-only response (axial modes with source/receiver coupling)
export function computeModesOnlyResponse({ roomDims, seatPos, freqsHz, damping = 20 }) {
  if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
    return freqsHz.map(() => 90); // fallback flat
  }
  
  if (!seatPos || typeof seatPos.x !== 'number' || typeof seatPos.y !== 'number') {
    return freqsHz.map(() => 90); // fallback flat
  }
  
  // Generic reference source: front wall center, near floor
  const sourcePos = {
    x: roomDims.widthM / 2,
    y: 0.01,
    z: 0.1
  };
  
  // Compute axial modes up to 200 Hz
  const modes = computeAxialModes(roomDims, 200);
  
  // Baseline (flat response reference)
  const baselineDb = 90;
  
  // Build response curve with modal resonances
  return freqsHz.map(f => {
    // Start with unity magnitude (0 dB contribution)
    let totalDb = 0;
    
    // Sum contributions from all modes
    for (const mode of modes) {
      const f0 = mode.fHz;
      const Q = damping;
      
      // Bandwidth for filtering
      const bw = f0 / Q;
      const df = Math.abs(f - f0);
      
      // Skip modes too far away (optimization)
      if (df > 5 * bw) continue;
      
      // Calculate source-receiver coupling for this mode
      let coupling = 0;
      const n = mode.n;
      
      if (mode.axis === 'Y') {
        // Length mode
        const L = roomDims.lengthM;
        const excite = Math.abs(Math.cos(n * Math.PI * sourcePos.y / L));
        const receive = Math.abs(Math.cos(n * Math.PI * seatPos.y / L));
        coupling = excite * receive;
      } else if (mode.axis === 'X') {
        // Width mode
        const W = roomDims.widthM;
        const excite = Math.abs(Math.cos(n * Math.PI * sourcePos.x / W));
        const receive = Math.abs(Math.cos(n * Math.PI * seatPos.x / W));
        coupling = excite * receive;
      } else if (mode.axis === 'Z') {
        // Height mode
        const H = roomDims.heightM;
        const zS = sourcePos.z;
        const zR = seatPos.z ?? 1.2;
        const excite = Math.abs(Math.cos(n * Math.PI * zS / H));
        const receive = Math.abs(Math.cos(n * Math.PI * zR / H));
        coupling = excite * receive;
      }
      
      // Skip if coupling is negligible
      if (coupling < 0.01) continue;
      
      // Compute smooth resonator response (2nd-order peaking)
      // Normalized frequency deviation
      const omega = 2 * Math.PI * f;
      const omega0 = 2 * Math.PI * f0;
      const domega = omega - omega0;
      const bwRad = omega0 / Q;
      
      // Magnitude response of peaking filter
      const denom = Math.sqrt(domega * domega + bwRad * bwRad);
      const peakMag = bwRad / denom;
      
      // Scale by coupling (modal strength)
      const gain = 12; // dB boost at peak (tunable)
      const contribution = coupling * peakMag * gain;
      
      totalDb += contribution;
    }
    
    // Final SPL = baseline + modal contributions
    const finalDb = baselineDb + totalDb;
    
    return Math.max(MIN_SPL_FLOOR, Math.min(130, finalDb));
  });
}

// Calculate mode coupling between source and receiver (pressure-mode shape)
function axisCoupling(axis, n, sourcePos, seatPos, dim) {
  let sourceU, seatU;
  
  if (axis === 'Y') {
    sourceU = sourcePos.y;
    seatU = seatPos.y;
  } else if (axis === 'X') {
    sourceU = sourcePos.x;
    seatU = seatPos.x;
  } else { // Z
    sourceU = sourcePos.z;
    seatU = seatPos.z;
  }
  
  // Standing wave pressure shape: cos(n * π * u / dim)
  const excite = Math.abs(Math.cos(n * Math.PI * sourceU / dim));
  const receive = Math.abs(Math.cos(n * Math.PI * seatU / dim));
  
  return excite * receive;
}

// Compute modal resonator response (complex)
function modalResonator(f, f0, Q, coupling, gain = 0.25) {
  // Simple 2nd-order peaking filter centered at f0
  // Returns complex multiplier: 1 + (gain * coupling * resonance)
  
  const w = 2 * Math.PI * f;
  const w0 = 2 * Math.PI * f0;
  const bw = w0 / Q;
  
  // Normalized frequency deviation
  const dw = w - w0;
  
  // Complex resonance (simplified peaking response)
  const denom = Math.sqrt(dw * dw + bw * bw);
  const resonanceMag = (bw / denom);
  const resonancePhase = -Math.atan2(dw, bw);
  
  // Scale by coupling and gain
  const scaledMag = gain * coupling * resonanceMag;
  
  // Return as complex addition: 1 + (scaledMag * e^(j*phase))
  const real = 1 + scaledMag * Math.cos(resonancePhase);
  const imag = scaledMag * Math.sin(resonancePhase);
  
  return { real, imag };
}

// Apply modal filtering to complex pressure (per sub contribution)
function applyModesToComplexPressure(sumReal, sumImag, f, modes, sub, seatPos, Q, modesEnabled) {
  if (!modesEnabled || !modes || modes.length === 0) {
    return { real: sumReal, imag: sumImag };
  }
  
  // Start with unity multiplier
  let modeMultReal = 1;
  let modeMultImag = 0;
  
  // Accumulate modal contributions
  for (const mode of modes) {
    // Only evaluate modes near this frequency (within 3*BW)
    const bw = mode.fHz / Q;
    const df = Math.abs(f - mode.fHz);
    if (df > 3 * bw) continue;
    
    // Calculate coupling for this sub-seat pair
    const coupling = axisCoupling(mode.axis, mode.n, 
      { x: sub.x, y: sub.y, z: sub.z }, 
      seatPos, 
      mode.dim);
    
    if (coupling < 0.01) continue; // Skip negligible couplings
    
    // Get complex resonator response
    const resonator = modalResonator(f, mode.fHz, Q, coupling);
    
    // Multiply complex numbers: (a + jb) * (c + jd) = (ac - bd) + j(ad + bc)
    const newReal = modeMultReal * resonator.real - modeMultImag * resonator.imag;
    const newImag = modeMultReal * resonator.imag + modeMultImag * resonator.real;
    
    modeMultReal = newReal;
    modeMultImag = newImag;
  }
  
  // Apply modal multiplier to pressure
  const finalReal = sumReal * modeMultReal - sumImag * modeMultImag;
  const finalImag = sumReal * modeMultImag + sumImag * modeMultReal;
  
  return { real: finalReal, imag: finalImag };
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

// Normalize sub tuning (ensure safe defaults)
function normalizeSubTuning(tuning) {
  const defaults = { gainDb: 0, delayMs: 0, polarity: 0 };
  if (!tuning || typeof tuning !== 'object') return defaults;
  
  return {
    gainDb: Math.max(-12, Math.min(6, Number(tuning.gainDb) || 0)),
    delayMs: Math.max(0, Math.min(20, Number(tuning.delayMs) || 0)),
    polarity: (tuning.polarity === 180) ? 180 : 0
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
  const modesEnabled = splConfig?.modesEnabled ?? false;
  const roomDamping = splConfig?.roomDamping ?? 20; // Q value: 8 (dead) to 35 (lively)
  
  const dbPower = 10 * Math.log10(Math.max(1, powerW));
  const dbEq = -eqHeadroomDb;
  
  // Precompute room modes (do this once)
  const modes = modesEnabled ? computeAxialModes(roomDims, 200) : [];
  
  // Compute response for each seat
  const seatResponses = {};
  
  seats.forEach(seat => {
    const seatId = seat.id || `${seat.x}-${seat.y}`;
    const seatPos = { x: seat.x, y: seat.y, z: Number.isFinite(seat.z) ? seat.z : 1.2 };
    
    const splDb = freqsHz.map(f => {
      let sumReal = 0;
      let sumImag = 0;

      subs.forEach(sub => {
        const curve = modelCurves[sub.modelKey];
        if (!curve) return;

        // Normalize tuning
        const tuning = normalizeSubTuning(sub.tuning);

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

        // Apply user gain adjustment
        const dbGain = tuning.gainDb;

        // Total magnitude
        const dbMag = db0 + dbDist + dbPower + dbEq + dbBoundary + dbGain;
        const amplitude = Math.pow(10, dbMag / 20);

        // Guard against non-finite amplitude
        if (!isFinite(amplitude)) return;

        // Time-of-flight phase
        let phi = -2 * Math.PI * f * (d / SPEED_OF_SOUND);

        // Apply user delay (adds phase lag)
        const delaySeconds = tuning.delayMs / 1000;
        const phaseDelayRadians = -2 * Math.PI * f * delaySeconds;
        phi += phaseDelayRadians;

        // Apply polarity (180° phase shift if inverted)
        if (tuning.polarity === 180) {
          phi += Math.PI;
        }

        // Guard against non-finite phase
        if (!isFinite(phi)) return;

        // Complex contribution from this sub (before modal filtering)
        const subReal = amplitude * Math.cos(phi);
        const subImag = amplitude * Math.sin(phi);

        // Apply modal filtering if enabled (per sub-seat path)
        const { real: filteredReal, imag: filteredImag } = applyModesToComplexPressure(
          subReal, subImag, f, modes, sub, seatPos, roomDamping, modesEnabled
        );

        // Accumulate
        sumReal += filteredReal;
        sumImag += filteredImag;
      });

      // Convert complex sum to SPL (pure pressure summation)
      const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
      const spl = 20 * Math.log10(magnitude);
      return Math.max(MIN_SPL_FLOOR, spl);
    });
    
    // Detect nulls for this seat
    const nullInfo = detectNulls(freqsHz, splDb, [20, 80]);
    
    seatResponses[seatId] = { freqsHz, splDb, nulls: nullInfo };
  });
  
  // Compute RP22 metrics
  const metrics = computeRP22Metrics(seatResponses, seats, subs, roomDims);
  
  return { seatResponses, metrics };
}

// Check for extreme tuning settings
function checkTuningWarnings(subs) {
  const warnings = [];
  
  subs.forEach((sub, i) => {
    const tuning = normalizeSubTuning(sub.tuning);
    if (tuning.delayMs > 15) {
      warnings.push(`Sub ${i + 1}: High delay (${tuning.delayMs.toFixed(1)}ms) - verify alignment`);
    }
    if (tuning.gainDb > 3) {
      warnings.push(`Sub ${i + 1}: High gain (+${tuning.gainDb.toFixed(1)}dB) - check headroom`);
    }
  });
  
  return warnings;
}

// Compute RP22 P14, P18, P19 + Designer fairness metrics
function computeRP22Metrics(seatResponses, seats, subs = [], roomDims) {
  const seatIds = Object.keys(seatResponses);
  if (seatIds.length === 0) return null;
  
  // Find MLP (RSP)
  const mlpSeat = seats.find(s => s.isPrimary);
  const mlpId = mlpSeat ? (mlpSeat.id || `${mlpSeat.x}-${mlpSeat.y}`) : seatIds[0];
  const mlpResponse = seatResponses[mlpId];
  
  if (!mlpResponse) return null;
  
  const { freqsHz, splDb } = mlpResponse;
  
  // Calculate Schroeder frequency
  const w = roomDims?.widthM ?? 0;
  const l = roomDims?.lengthM ?? 0;
  const h = roomDims?.heightM ?? 0;
  const volume = w * l * h;
  const rt60 = 0.4; // default RT60 estimate
  const schroederHz = volume > 0 ? 2000 * Math.sqrt(rt60 / volume) : 80;
  
  // Generate target curve
  const targetDb = generateTargetCurve(freqsHz);
  
  // Compute RP22 metrics using new helpers
  const p14Result = computeP14MaxLfeSpl({ freqsHz, splDb, band: [20, 80] });
  const p18Result = computeP18InRoomF3({ freqsHz, splDb, targetDb, minHz: 10, maxHz: 200 });
  const p19Result = computeP19DeviationBelowSchroeder({ freqsHz, splDb, targetDb, schroederHz });
  
  // Debug logging (controlled by global flag)
  if (globalThis.__B44_LOGS) {
    console.log('[RP22 Bass Metrics]', {
      p14_maxSpl: p14Result.maxSplDb,
      p18_f3Hz: p18Result.f3Hz,
      p19_maxDeviation: p19Result.resultDb,
      schroederHz,
      p14_details: p14Result.details,
      p18_details: p18Result.details,
      p19_details: p19Result.details
    });
  }
  
  // Helper: find indices in band
  const getBandIndices = (fMin, fMax) => {
    return freqsHz.map((f, i) => f >= fMin && f <= fMax ? i : -1).filter(i => i >= 0);
  };
  
  const band20_80 = getBandIndices(20, 80);
  const band45_70 = getBandIndices(45, 70);
  
  // Seat-to-seat uniformity (20-80 Hz)
  const uniformityPerFreq = band20_80.map(freqIdx => {
    const splAtFreq = seatIds.map(id => seatResponses[id].splDb[freqIdx]);
    const mean = splAtFreq.reduce((a, b) => a + b, 0) / splAtFreq.length;
    const variance = splAtFreq.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / splAtFreq.length;
    return Math.sqrt(variance);
  });
  
  const uniformitySdDb_20_80 = uniformityPerFreq.length > 0 
    ? uniformityPerFreq.reduce((a, b) => a + b, 0) / uniformityPerFreq.length 
    : 0;
  
  // Mid-bass uniformity (45-70 Hz) for warnings
  const midBassUniformity = band45_70.map(freqIdx => {
    const splAtFreq = seatIds.map(id => seatResponses[id].splDb[freqIdx]);
    const mean = splAtFreq.reduce((a, b) => a + b, 0) / splAtFreq.length;
    const variance = splAtFreq.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / splAtFreq.length;
    return Math.sqrt(variance);
  });
  
  const midBassUniformitySd = midBassUniformity.length > 0
    ? midBassUniformity.reduce((a, b) => a + b, 0) / midBassUniformity.length
    : 0;
  
  // Designer Fairness Metrics (separate from RP22 parameters)
  // Calculate seat-to-seat variance for fairness scoring
  const variancePerFreq = band20_80.map(freqIdx => {
    const splAtFreq = seatIds.map(id => seatResponses[id].splDb[freqIdx]);
    const mean = splAtFreq.reduce((a, b) => a + b, 0) / splAtFreq.length;
    const variance = splAtFreq.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / splAtFreq.length;
    return Math.sqrt(variance);
  });
  
  const p14AvgStdDevDb = variancePerFreq.length > 0 
    ? variancePerFreq.reduce((a, b) => a + b, 0) / variancePerFreq.length 
    : 0;
  
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
  
  // Check for tuning warnings
  const tuningWarnings = checkTuningWarnings(subs);
  
  // Designer warnings
  const designerWarnings = [];
  
  // 1. Clustered layout detection
  if (subs.length > 1 && seats.length > 1) {
    let hasCluster = false;
    for (let i = 0; i < subs.length; i++) {
      for (let j = i + 1; j < subs.length; j++) {
        const dx = subs[i].x - subs[j].x;
        const dy = subs[i].y - subs[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1.0) {
          hasCluster = true;
          break;
        }
      }
      if (hasCluster) break;
    }
    
    if (hasCluster) {
      designerWarnings.push({
        type: 'clustered_layout',
        severity: 'warning',
        message: 'Clustered subwoofer layout detected — maximises SPL at one point but increases modal imbalance across seats. Consider distributing subs (front/back or left/right) for better uniformity.'
      });
    }
  }
  
  // 2. Great extension but poor mid-bass integrity
  if (p18Result.f3Hz && p18Result.f3Hz < 22 && midBassUniformitySd > 4) {
    designerWarnings.push({
      type: 'extension_vs_integrity',
      severity: 'caution',
      message: `Deep extension (${p18Result.f3Hz.toFixed(0)} Hz) but high mid-bass variance (±${midBassUniformitySd.toFixed(1)} dB in 45–70 Hz). Infrasonic output won't compensate for uneven mid-bass — consider repositioning subs for better 45–70 Hz control.`
    });
  }
  
  // 3. P19 deviation too high below Schroeder
  if (p19Result.resultDb && p19Result.resultDb > 4) {
    designerWarnings.push({
      type: 'high_p19_deviation',
      severity: 'warning',
      message: `High frequency response ripple below Schroeder (±${p19Result.resultDb.toFixed(1)} dB). Modal interference is causing uneven response at RSP. Try sub repositioning or add/adjust tuning (polarity, delay) to smooth the response.`
    });
  }
  
  return {
    p14: { 
      maxSplDb: p14Result.maxSplDb ?? 0,
      details: p14Result.details
    },
    p18: { 
      f3Hz: p18Result.f3Hz ?? 15,
      details: p18Result.details
    },
    p19: { 
      maxDeviationDb: p19Result.resultDb ?? 0,
      details: p19Result.details
    },
    uniformity: {
      sdDb_20_80: uniformitySdDb_20_80,
      midBassUniformitySd
    },
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
    },
    targetDb,
    schroederHz,
    tuningWarnings,
    designerWarnings
  };
}