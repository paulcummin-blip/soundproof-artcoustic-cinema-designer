// bassSimulationEngine.js
// Pure calculation engine for bass simulation (no React)

import { getSubwooferCurve, getApprovedContinuousSplDb } from "@/components/models/speakers/registry";
import { 
  computeP14MaxLfeSpl, 
  computeP18InRoomF3, 
  computeP19DeviationBelowSchroeder 
} from "@/components/utils/rp22BassMetrics";

const SPEED_OF_SOUND = 343; // m/s
const MIN_DISTANCE = 0.5; // meters (prevent explosion at near-zero)
const MIN_SPL_FLOOR_DB = -200; // dB (very low floor to prevent -Infinity without killing nulls)

// Build fixed high-resolution frequency array for bass simulation (independent of product curves)
export function buildBassFrequencyBins(curvePoints) {
  // Generate fixed 1 Hz resolution array from 15-200 Hz
  const freqs = [];
  for (let f = 15; f <= 200; f += 1) {
    freqs.push(f);
  }
  return freqs;
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

// Compute room modes up to maxHz (axial + tangential + oblique)
function computeRoomModes(roomDims, maxHz = 200) {
  const Lx = Number(roomDims.widthM);
  const Ly = Number(roomDims.lengthM);
  const Lz = Number(roomDims.heightM);

  if (!Lx || !Ly || !Lz) return [];

  const c = SPEED_OF_SOUND;

  // Conservative upper bounds for mode indices
  const nxMax = Math.max(1, Math.ceil((2 * maxHz * Lx) / c));
  const nyMax = Math.max(1, Math.ceil((2 * maxHz * Ly) / c));
  const nzMax = Math.max(1, Math.ceil((2 * maxHz * Lz) / c));

  const modes = [];

  for (let nx = 0; nx <= nxMax; nx++) {
    for (let ny = 0; ny <= nyMax; ny++) {
      for (let nz = 0; nz <= nzMax; nz++) {
        // Skip (0,0,0)
        if (nx === 0 && ny === 0 && nz === 0) continue;

        // Frequency
        const fx = (nx / Lx);
        const fy = (ny / Ly);
        const fz = (nz / Lz);

        const fHz = (c / 2) * Math.sqrt(fx * fx + fy * fy + fz * fz);
        if (!Number.isFinite(fHz) || fHz <= 0 || fHz > maxHz) continue;

        // Classify type
        const nonZero = (nx !== 0) + (ny !== 0) + (nz !== 0);
        let type = "axial";
        if (nonZero === 2) type = "tangential";
        if (nonZero === 3) type = "oblique";

        modes.push({
          type,
          nx, ny, nz,
          fHz,
          dims: { Lx, Ly, Lz }
        });
      }
    }
  }

  // Sort by frequency and cap count for performance
  modes.sort((a, b) => a.fHz - b.fHz);

  // Keep a sensible number (REW-like density but safe)
  return modes.slice(0, 400);
}

// Export for UI use (backward compat alias)
export { computeRoomModes as computeAxialModes };

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
  
  // Compute room modes up to 200 Hz (uses nx/ny/nz structure)
  const modes = computeRoomModes(roomDims, 200);
  
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
      
      // Use the existing modeCoupling helper (handles signed 3D coupling)
      const coupling = modeCoupling(mode, sourcePos, seatPos);
      
      // Skip if coupling is negligible
      if (Math.abs(coupling) < 0.01) continue;
      
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
    
    // Use correct constant name
    const floorLinear = Math.pow(10, MIN_SPL_FLOOR_DB / 20);
    const clampedLinear = Math.max(floorLinear, Math.pow(10, finalDb / 20));
    const clampedDb = 20 * Math.log10(clampedLinear);
    
    return Math.min(130, clampedDb);
  });
}

// Signed mode-shape coupling between source and receiver for a 3D mode
function modeCoupling(mode, sourcePos, seatPos) {
  const { nx, ny, nz, dims } = mode;
  const { Lx, Ly, Lz } = dims;

  // Normalised standing-wave pressure shape (signed!)
  const sx = (nx === 0) ? 1 : Math.cos(nx * Math.PI * (sourcePos.x / Lx));
  const sy = (ny === 0) ? 1 : Math.cos(ny * Math.PI * (sourcePos.y / Ly));
  const sz = (nz === 0) ? 1 : Math.cos(nz * Math.PI * (sourcePos.z / Lz));

  const rx = (nx === 0) ? 1 : Math.cos(nx * Math.PI * (seatPos.x / Lx));
  const ry = (ny === 0) ? 1 : Math.cos(ny * Math.PI * (seatPos.y / Ly));
  const rz = (nz === 0) ? 1 : Math.cos(nz * Math.PI * (seatPos.z / Lz));

  // Signed coupling (can be negative → enables cancellations)
  return (sx * sy * sz) * (rx * ry * rz);
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
function applyModesToComplexPressure(sumReal, sumImag, f, modes, sub, seatPos, Q, modesEnabled, debugProbe = null) {
  if (!modesEnabled || !modes || modes.length === 0) {
    return { real: sumReal, imag: sumImag };
  }
  
  // REW-like: sum modal deltas from unity, then apply transfer function H = 1 + sum(...)
  // This allows deep cancellations (multiplicative approach smooths/shapes instead)
  let modeSumReal = 0;
  let modeSumImag = 0;
  
  // Track top modes for debugging
  const modeContributions = [];
  let modesPassedBandwidth = 0;
  
  // Accumulate modal contributions (sum of deltas from unity)
  for (const mode of modes) {
    // Only evaluate modes near this frequency (within 3*BW)
    const bw = mode.fHz / Q;
    const df = Math.abs(f - mode.fHz);
    if (df > 3 * bw) continue;
    
    modesPassedBandwidth++;
    
    // Calculate coupling for this sub-seat pair (signed, full 3D)
    const coupling = modeCoupling(
      mode,
      { x: sub.x, y: sub.y, z: sub.z },
      seatPos
    );

    // Skip tiny couplings
    if (Math.abs(coupling) < 0.01) continue;
    
    // Get complex resonator response (returns 1 + contribution)
    const resonator = modalResonator(f, mode.fHz, Q, coupling);
    
    // Track for debug probe
    if (debugProbe) {
      const resonMag = Math.sqrt(resonator.real * resonator.real + resonator.imag * resonator.imag);
      const resonMagDb = 20 * Math.log10(Math.max(1e-10, resonMag));
      
      modeContributions.push({
        nx: mode.nx,
        ny: mode.ny,
        nz: mode.nz,
        f0Hz: mode.fHz,
        coupling,
        resonMagDb,
        resonReal: resonator.real,
        resonImag: resonator.imag
      });
    }
    
    // Sum the delta from unity (resonator = 1 + delta, so delta = resonator - 1)
    modeSumReal += (resonator.real - 1);
    modeSumImag += resonator.imag;
  }
  
  // Build transfer function H = 1 + sum(modal deltas)
  const Hreal = 1 + modeSumReal;
  const Himag = modeSumImag;
  
  // Apply transfer function to pressure once: P_out = P_in * H
  const finalReal = sumReal * Hreal - sumImag * Himag;
  const finalImag = sumReal * Himag + sumImag * Hreal;
  
  // Return debug data if requested
  if (debugProbe) {
    const preMag = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
    const preDb = 20 * Math.log10(Math.max(1e-10, preMag));
    
    const sumMag = Math.sqrt(modeSumReal * modeSumReal + modeSumImag * modeSumImag);
    const sumDb = 20 * Math.log10(Math.max(1e-10, sumMag));
    
    const Hmag = Math.sqrt(Hreal * Hreal + Himag * Himag);
    const Hdb = 20 * Math.log10(Math.max(1e-10, Hmag));
    
    const postMag = Math.sqrt(finalReal * finalReal + finalImag * finalImag);
    const postDb = 20 * Math.log10(Math.max(1e-10, postMag));
    
    // Sort by absolute contribution effect and take top N
    const topModes = modeContributions
      .sort((a, b) => Math.abs(b.coupling * b.resonMagDb) - Math.abs(a.coupling * a.resonMagDb))
      .slice(0, debugProbe.topModes || 8);
    
    return {
      real: finalReal,
      imag: finalImag,
      debug: {
        pre: { real: sumReal, imag: sumImag, mag: preMag, db: preDb },
        modeSum: { real: modeSumReal, imag: modeSumImag, mag: sumMag, db: sumDb },
        H: { real: Hreal, imag: Himag, mag: Hmag, db: Hdb },
        post: { real: finalReal, imag: finalImag, mag: postMag, db: postDb },
        top: topModes,
        modesPassedBandwidth: modesPassedBandwidth,
        totalModesAvailable: modes.length
      }
    };
  }
  
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
export function simulateBassAtSeats({ roomDims, seats, subs, splConfig, options = {} }) {
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
  
  // Modal Probe setup
  const debugProbe = options.debugProbe || null;
  const probeEnabled = debugProbe?.enabled === true;
  const probeFreqs = probeEnabled ? (debugProbe.freqsHz || []) : [];
  const probeSeatId = probeEnabled ? debugProbe.seatId : null;
  const modeProbe = {
    seatIdUsed: null,
    freqsRequested: probeFreqs,
    rows: []
  };
  
  // Audit instrumentation (diagnostic only, no behavior change)
  const auditEnabled = globalThis.__B44_BASS_AUDIT === true;
  const auditFrequencies = [20, 30, 40, 50, 63, 80, 100, 125, 160];
  let audit = {
    enabled: auditEnabled,
    seatId: null,
    frequencies: [],
    contributors: [],
    summations: []
  };
  let auditSeatId = null;
  
  if (auditEnabled) {
    // Select primary seat or first seat for audit
    const auditSeat = seats.find(s => s.isPrimary) || seats[0];
    auditSeatId = auditSeat.id || `${auditSeat.x}-${auditSeat.y}`;
    audit.seatId = auditSeatId;
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
  const sbirEnabled = splConfig?.sbirEnabled === true; // SBIR reflections toggle
  
  // Subwoofer frequency_response_curve values are maximum continuous SPL at 1m
  // (already power/capability-scaled), NOT 1W/1m sensitivity.
  // Therefore dbPower must NOT be added to db0 for curve-based subwoofer response.
  const dbPower = 0;
  const dbEq = -eqHeadroomDb;
  
  // Precompute room modes (do this once)
  const modes = modesEnabled ? computeRoomModes(roomDims, 200) : [];
  
  // Compute response for each seat
  const seatResponses = {};
  
  seats.forEach(seat => {
    const seatId = seat.id || `${seat.x}-${seat.y}`;
    const seatPos = { x: seat.x, y: seat.y, z: Number.isFinite(seat.z) ? seat.z : 1.2 };
    
    // Check if this seat should be probed
    const isProbeTarget = probeEnabled && (
      probeSeatId === seatId || 
      probeSeatId === "MLP" && seat.isPrimary
    );
    
    if (isProbeTarget) {
      modeProbe.seatIdUsed = seatId;
    }
    
    const splDb = freqsHz.map(f => {
      let sumReal = 0;
      let sumImag = 0;
      
      // Check if this frequency should be audited
      const shouldAudit = auditEnabled && 
                         seatId === auditSeatId && 
                         auditFrequencies.includes(f);
      
      // Check if this frequency should be probed
      const shouldProbe = isProbeTarget && probeFreqs.some(pf => Math.abs(f - pf) < 0.5);

      subs.forEach((sub, subIdx) => {
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

        // Boundary gain (disabled when SBIR is enabled to prevent double-counting)
        const dbBoundary = sbirEnabled ? 0 : calculateBoundaryGain({ x: sub.x, y: sub.y, z: sub.z }, roomDims, radiationMode);

        // Apply user gain adjustment
        const dbGain = tuning.gainDb;

        // Total magnitude
        const dbMag = db0 + dbDist + dbPower + dbEq + dbBoundary + dbGain;
        const amplitude = Math.pow(10, dbMag / 20);

        // Guard against non-finite amplitude
        if (!isFinite(amplitude)) return;

        // Time-of-flight phase
        const phiDistance = -2 * Math.PI * f * (d / SPEED_OF_SOUND);

        // Apply user delay (adds phase lag)
        const delaySeconds = tuning.delayMs / 1000;
        const phiDelay = -2 * Math.PI * f * delaySeconds;
        
        // Apply polarity (180° phase shift if inverted)
        const phiPolarity = (tuning.polarity === 180) ? Math.PI : 0;
        
        // Total phase
        let phi = phiDistance + phiDelay + phiPolarity;

        // Guard against non-finite phase
        if (!isFinite(phi)) return;

        // Complex contribution from this sub (direct path)
        const subReal = amplitude * Math.cos(phi);
        const subImag = amplitude * Math.sin(phi);

        // Start with direct path
        let totalSubReal = subReal;
        let totalSubImag = subImag;

        // Add SBIR (first-order image sources) if enabled
        if (sbirEnabled) {
          // REW-style: reflection coefficient derived from absorption (amplitude)
          // If absorption α=0.30, amplitude reflection ≈ sqrt(1-α)=0.836
          const defaultAbs = 0.30;
          const abs = Number.isFinite(splConfig?.surfaceAbsorption) ? splConfig.surfaceAbsorption : defaultAbs;
          const alpha = Math.max(0, Math.min(0.95, abs));
          const reflCoeff = Math.sqrt(1 - alpha);
          
          // Image sources: reflect sub position across each boundary
          const imageSources = [
            // Left wall (x=0)
            { x: -sub.x, y: sub.y, z: sub.z, wall: 'left' },
            // Right wall (x=widthM)
            { x: 2 * roomDims.widthM - sub.x, y: sub.y, z: sub.z, wall: 'right' },
            // Front wall (y=0)
            { x: sub.x, y: -sub.y, z: sub.z, wall: 'front' },
            // Back wall (y=lengthM)
            { x: sub.x, y: 2 * roomDims.lengthM - sub.y, z: sub.z, wall: 'back' },
            // Floor (z=0)
            { x: sub.x, y: sub.y, z: -sub.z, wall: 'floor' },
            // Ceiling (z=heightM)
            { x: sub.x, y: sub.y, z: 2 * roomDims.heightM - sub.z, wall: 'ceiling' }
          ];
          
          // Add each image source contribution
          imageSources.forEach(imgSub => {
            const dx_img = imgSub.x - seatPos.x;
            const dy_img = imgSub.y - seatPos.y;
            const dz_img = imgSub.z - seatPos.z;
            const d_img = Math.max(MIN_DISTANCE, Math.sqrt(dx_img*dx_img + dy_img*dy_img + dz_img*dz_img));
            
            // Image path magnitude (no boundary gain for reflected paths)
            const dbMag_img = db0 + (-20 * Math.log10(d_img / 1)) + dbPower + dbEq + dbGain;
            const amplitude_img = Math.pow(10, dbMag_img / 20) * reflCoeff;
            
            if (!isFinite(amplitude_img)) return;
            
            // Image path phase (includes distance, user delay, and polarity)
            const phiDistance_img = -2 * Math.PI * f * (d_img / SPEED_OF_SOUND);
            const phi_img = phiDistance_img + phiDelay + phiPolarity;
            
            if (!isFinite(phi_img)) return;
            
            // Add image source complex contribution
            totalSubReal += amplitude_img * Math.cos(phi_img);
            totalSubImag += amplitude_img * Math.sin(phi_img);
          });
        }

        // Apply modal filtering to composite (direct + SBIR) pressure
        const modeResult = applyModesToComplexPressure(
          totalSubReal, totalSubImag, f, modes, sub, seatPos, roomDamping, modesEnabled,
          shouldProbe ? debugProbe : null
        );
        
        const filteredReal = modeResult.real;
        const filteredImag = modeResult.imag;
        
        // Capture probe data if requested
        if (shouldProbe && modeResult.debug) {
          modeProbe.rows.push({
            frequencyHz: f,
            seatId,
            subId: sub.id || `sub-${subIdx}`,
            pre: modeResult.debug.pre,
            modeMult: modeResult.debug.modeMult,
            post: modeResult.debug.post,
            topModes: modeResult.debug.top
          });
        }

        // Record audit data if enabled for this frequency and seat
        if (shouldAudit) {
          audit.contributors.push({
            seatId,
            frequencyHz: f,
            subIndex: subIdx,
            subId: sub.id || `sub-${subIdx}`,
            distance: d,
            // Raw dB components
            db0,
            dbDist,
            dbBoundary,
            dbPower,
            dbEq,
            dbGain,
            dbMag,
            // Magnitude & phase
            amplitude,
            phiDistance,
            phiDelay,
            phiPolarity,
            phiTotal: phi,
            // Complex values
            subReal,
            subImag,
            filteredReal,
            filteredImag
          });
        }

        // Accumulate
        sumReal += filteredReal;
        sumImag += filteredImag;
      });

      // Convert complex sum to SPL (pure pressure summation)
      const magnitudeRaw = Math.sqrt(sumReal * sumReal + sumImag * sumImag);

      // Prevent -Infinity / crazy negatives when magnitude collapses to ~0
      const floorLinear = Math.pow(10, MIN_SPL_FLOOR_DB / 20);
      const magnitude = Math.max(magnitudeRaw, floorLinear);

      const spl = 20 * Math.log10(magnitude);
      const finalSpl = spl; // already floored in linear domain

      // Record summation audit data
      if (shouldAudit) {
        audit.summations.push({
          seatId,
          frequencyHz: f,
          sumReal,
          sumImag,
          magnitudeRaw,
          magnitude,
          spl,
          finalSplDb: finalSpl
        });
      }

      return finalSpl;
    });
    
    // Detect nulls for this seat
    const nullInfo = detectNulls(freqsHz, splDb, [20, 80]);
    
    seatResponses[seatId] = { freqsHz, splDb, nulls: nullInfo };
  });
  
  // Force audit probe entry at 50 Hz for visibility test
  if (auditEnabled && audit.contributors.length === 0) {
    audit.contributors.push({
      seatId: auditSeatId || 'unknown',
      frequencyHz: 50,
      subIndex: 0,
      subId: '__audit_probe__',
      distance: 0,
      db0: 0,
      dbDist: 0,
      dbBoundary: 0,
      dbPower: 0,
      dbEq: 0,
      dbGain: 0,
      dbMag: 0,
      amplitude: 0,
      phiDistance: 0,
      phiDelay: 0,
      phiPolarity: 0,
      phiTotal: 0,
      subReal: 0,
      subImag: 0,
      filteredReal: 0,
      filteredImag: 0
    });
    audit.summations.push({
      seatId: auditSeatId || 'unknown',
      frequencyHz: 50,
      sumReal: 0,
      sumImag: 0,
      magnitude: 0,
      spl: 0,
      finalSplDb: 0
    });
  }
  
  // Compute RP22 metrics
  const metrics = computeRP22Metrics(seatResponses, seats, subs, roomDims);
  
  return { seatResponses, metrics, audit: { ...audit, modeProbe } };
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

  // ── P14: approved Dolby DART continuous SPL @ 1m ──────────────────────────
  // Uses the approved product figure directly (no offset). Does not affect
  // P18/P19, the source curve, or any modal/room maths.
  const activeSubModels = (subs || []).map(s => s.modelKey).filter(Boolean);
  const approvedSplValues = activeSubModels.map(m => getApprovedContinuousSplDb(m));
  const isDesignEstimate = activeSubModels.length > 0 && approvedSplValues.every(v => v !== null);
  const summationGainDb = activeSubModels.length > 0 ? 10 * Math.log10(activeSubModels.length) : 0;
  const maxSplGraphDb = p14Result.maxSplDb;
  const continuousSplDb = isDesignEstimate
    ? Math.max(...approvedSplValues) + summationGainDb
    : maxSplGraphDb;
  
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
      maxSplDb: continuousSplDb ?? p14Result.maxSplDb ?? 0,
      maxSplGraphDb: maxSplGraphDb ?? 0,
      isDesignEstimate,
      note: isDesignEstimate
        ? "P14 uses approved maximum continuous SPL @ 1m from Dolby DART product data."
        : null,
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

// ── CONVERGENCE WRAPPER (Step 1 — read-only, not wired to any UI yet) ───────
// Thin adapter proving bassSimulationEngine.jsx can produce the same output
// shape as BassResponseEngine.simulateResponseWithExtras, so P14/P18/P19 can
// eventually consume a single engine. No production path calls this yet.
//
// Legacy input format:
//   subwoofers: [{ position:{x,y,z}, model, enabled, gainDb, phaseAdjust, delay, polarity }]
//   seatPosition: { x, y, z }
//   roomDimensions: { length, width, height }  (metres)
//
// Output (mimics BassResponseEngine.simulateResponseWithExtras):
//   { responseData: [{ frequency, spl }, ...], rp22Analysis: {...} | null }
export function simulateResponseWithExtrasWrapper(subwoofers, seatPosition, roomDimensions) {
  if (!seatPosition || !roomDimensions) return { responseData: [], rp22Analysis: null };

  const subs = Array.isArray(subwoofers) ? subwoofers : [];
  if (subs.length === 0) return { responseData: [], rp22Analysis: null };

  // Convert legacy sub format → bassSimulationEngine format
  const engineSubs = subs
    .filter(s => s && s.position && s.model)
    .map((s, i) => ({
      id: s.id || `wrapper-sub-${i}`,
      modelKey: s.model,
      x: Number(s.position.x),
      y: Number(s.position.y),
      z: Number.isFinite(Number(s.position.z)) ? Number(s.position.z) : 0.35,
      tuning: {
        gainDb: Number(s.gainDb) || 0,
        delayMs: Number(s.delay) || 0,
        polarity: s.polarity === -1 ? 180 : 0,
      },
    }));

  if (engineSubs.length === 0) return { responseData: [], rp22Analysis: null };

  // Convert room dimensions (legacy uses length/width/height; engine uses *M)
  const roomDims = {
    widthM: Number(roomDimensions.width) || Number(roomDimensions.widthM) || 4,
    lengthM: Number(roomDimensions.length) || Number(roomDimensions.lengthM) || 6,
    heightM: Number(roomDimensions.height) || Number(roomDimensions.heightM) || 2.6,
  };

  // Wrap single seat
  const seats = [{
    id: 'wrapper-seat',
    x: Number(seatPosition.x),
    y: Number(seatPosition.y),
    z: Number.isFinite(Number(seatPosition.z)) ? Number(seatPosition.z) : 1.2,
    isPrimary: true,
  }];

  // Call existing engine with default splConfig
  const result = simulateBassAtSeats({
    roomDims,
    seats,
    subs: engineSubs,
    splConfig: {
      globalPowerW: 100,
      globalEqHeadroomDb: 0,
      radiationMode: 'half-space',
      modesEnabled: true,
      roomDamping: 20,
      sbirEnabled: true,
    },
    options: {},
  });

  const seatResponse = result?.seatResponses?.['wrapper-seat'];
  if (!seatResponse || !seatResponse.freqsHz || !seatResponse.splDb) {
    return { responseData: [], rp22Analysis: null };
  }

  // Convert freqsHz/splDb arrays → [{ frequency, spl }] (full 1 Hz resolution)
  const responseData = seatResponse.freqsHz.map((f, i) => ({
    frequency: f,
    spl: Number.isFinite(seatResponse.splDb[i]) ? seatResponse.splDb[i] : 0,
  }));

  // Build rp22Analysis from metrics to mimic legacy shape
  const m = result?.metrics;
  const rp22Analysis = m ? {
    calculatedSPL: m.p14?.maxSplDb ?? 0,
    maxSplGraphDb: m.p14?.maxSplGraphDb ?? 0,
    isDesignEstimate: m.p14?.isDesignEstimate ?? false,
    note: m.p14?.note ?? null,
    rp22Level: _wrapperLevelLabel(m.p14?.maxSplDb),
    modalVariation: m.p19?.maxDeviationDb ?? 0,
    factors: {
      summationGain: 0,
      boundaryGain: 0,
      nullCount: 0,
    },
  } : null;

  return { responseData, rp22Analysis };
}

function _wrapperLevelLabel(spl) {
  if (!Number.isFinite(spl)) return 'Below Level 1';
  if (spl >= 123) return 'Level 4';
  if (spl >= 120) return 'Level 3';
  if (spl >= 117) return 'Level 2';
  if (spl >= 114) return 'Level 1';
  return 'Below Level 1';
}