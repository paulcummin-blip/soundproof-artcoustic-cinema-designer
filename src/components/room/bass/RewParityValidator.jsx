import React, { useMemo } from 'react';
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * REW Parity Validator
 * Compares B44 curve vs REW reference curve for peak/null alignment
 * Tolerance: ±0.5 Hz frequency, ±0.5 dB level
 */
export default function RewParityValidator({ b44Series, rewSeries }) {
  // Normalize curve to 40-80 Hz median (kills calibration offset without distorting null depth)
  const normalizeCurve = (series) => {
    if (!series || series.length === 0) return { normalized: [], median: 0 };
    
    const band40_80 = series
      .filter(p => p.frequency >= 40 && p.frequency <= 80 && Number.isFinite(p.spl))
      .map(p => p.spl);
    
    if (band40_80.length < 3) return { normalized: series, median: 0 };
    
    const sorted = [...band40_80].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const normalized = series.map(p => ({
      frequency: p.frequency,
      spl: Number.isFinite(p.spl) ? p.spl - median : null
    }));
    
    return { normalized, median };
  };
  
  // Detect local maxima (peaks) and minima (nulls)
  // Feature must differ from neighbors by at least 0.75 dB
  const detectFeatures = (series, fMin = 15, fMax = 120) => {
    const peaks = [];
    const nulls = [];
    
    const inBand = series.filter(p => 
      p.frequency >= fMin && p.frequency <= fMax && Number.isFinite(p.spl)
    );
    
    for (let i = 1; i < inBand.length - 1; i++) {
      const prev = inBand[i - 1];
      const curr = inBand[i];
      const next = inBand[i + 1];
      
      if (!Number.isFinite(prev.spl) || !Number.isFinite(next.spl)) continue;
      
      // Peak detection (higher than both neighbors by at least 0.75 dB)
      if (curr.spl > prev.spl + 0.75 && curr.spl > next.spl + 0.75) {
        peaks.push({
          frequency: curr.frequency,
          level: curr.spl,
          height: Math.min(curr.spl - prev.spl, curr.spl - next.spl)
        });
      }
      
      // Null detection (lower than both neighbors by at least 0.75 dB)
      if (curr.spl < prev.spl - 0.75 && curr.spl < next.spl - 0.75) {
        nulls.push({
          frequency: curr.frequency,
          level: curr.spl,
          depth: Math.min(prev.spl - curr.spl, next.spl - curr.spl)
        });
      }
    }
    
    // Sort by depth/height (strongest first)
    peaks.sort((a, b) => b.height - a.height);
    nulls.sort((a, b) => b.depth - a.depth);
    
    return { peaks, nulls };
  };
  
  // Pair REW features with nearest B44 features
  const pairFeatures = (rewFeatures, b44Features, type) => {
    const paired = [];
    const PAIRING_WINDOW_HZ = 2.0; // Wide net for initial search
    const STRICT_FREQ_TOL_HZ = 0.5; // Strict pass/fail threshold
    const STRICT_LEVEL_TOL_DB = 0.5;
    
    rewFeatures.forEach(rewFeat => {
      // Find candidates within pairing window
      const candidates = b44Features.filter(b44Feat => 
        Math.abs(b44Feat.frequency - rewFeat.frequency) <= PAIRING_WINDOW_HZ
      );
      
      if (candidates.length === 0) {
        paired.push({
          type,
          rewFreq: rewFeat.frequency,
          rewLevel: rewFeat.level,
          b44Freq: null,
          b44Level: null,
          deltaHz: null,
          deltaDb: null,
          status: 'MISSING'
        });
        return;
      }
      
      // Choose nearest in frequency
      const nearest = candidates.reduce((best, curr) => {
        const bestDist = Math.abs(best.frequency - rewFeat.frequency);
        const currDist = Math.abs(curr.frequency - rewFeat.frequency);
        return currDist < bestDist ? curr : best;
      });
      
      const deltaHz = nearest.frequency - rewFeat.frequency;
      const deltaDb = nearest.level - rewFeat.level;
      
      // Apply strict tolerances
      const freqPass = Math.abs(deltaHz) <= STRICT_FREQ_TOL_HZ;
      const levelPass = Math.abs(deltaDb) <= STRICT_LEVEL_TOL_DB;
      const status = (freqPass && levelPass) ? 'PASS' : 'FAIL';
      
      paired.push({
        type,
        rewFreq: rewFeat.frequency,
        rewLevel: rewFeat.level,
        b44Freq: nearest.frequency,
        b44Level: nearest.level,
        deltaHz,
        deltaDb,
        status
      });
    });
    
    return paired;
  };
  
  // Compute RMS error over 15-120 Hz band
  const computeRmsError = (b44Norm, rewNorm) => {
    if (!b44Norm || b44Norm.length === 0 || !rewNorm || rewNorm.length === 0) return null;
    
    // Interpolate onto common grid (use B44 grid as reference)
    const commonFreqs = b44Norm
      .filter(p => p.frequency >= 15 && p.frequency <= 120 && Number.isFinite(p.spl))
      .map(p => p.frequency);
    
    if (commonFreqs.length < 10) return null;
    
    // Linear interpolation helper
    const interpolate = (series, targetFreq) => {
      if (!series || series.length === 0) return null;
      
      // Find bracket
      const sorted = [...series].sort((a, b) => a.frequency - b.frequency);
      
      // Clamp to endpoints
      if (targetFreq <= sorted[0].frequency) return sorted[0].spl;
      if (targetFreq >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
      
      // Find surrounding points
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        
        if (!Number.isFinite(p1.spl) || !Number.isFinite(p2.spl)) continue;
        
        if (targetFreq >= p1.frequency && targetFreq <= p2.frequency) {
          const t = (targetFreq - p1.frequency) / (p2.frequency - p1.frequency);
          return p1.spl + (p2.spl - p1.spl) * t;
        }
      }
      
      return null;
    };
    
    // Compute squared error at each frequency
    let sumSqError = 0;
    let count = 0;
    
    commonFreqs.forEach(f => {
      const b44Val = interpolate(b44Norm, f);
      const rewVal = interpolate(rewNorm, f);
      
      if (Number.isFinite(b44Val) && Number.isFinite(rewVal)) {
        const error = b44Val - rewVal;
        sumSqError += error * error;
        count++;
      }
    });
    
    if (count === 0) return null;
    
    return Math.sqrt(sumSqError / count);
  };
  
  // Main validation logic
  const validation = useMemo(() => {
    if (!b44Series || b44Series.length === 0) {
      return { status: 'NO_B44_DATA' };
    }
    
    if (!rewSeries || rewSeries.length === 0) {
      return { status: 'NO_REW_DATA' };
    }
    
    // Normalize both curves
    const { normalized: b44Norm, median: b44Median } = normalizeCurve(b44Series);
    const { normalized: rewNorm, median: rewMedian } = normalizeCurve(rewSeries);
    
    // Detect features on both curves
    const b44Features = detectFeatures(b44Norm);
    const rewFeatures = detectFeatures(rewNorm);
    
    // Pair features
    const pairedPeaks = pairFeatures(rewFeatures.peaks, b44Features.peaks, 'Peak');
    const pairedNulls = pairFeatures(rewFeatures.nulls, b44Features.nulls, 'Null');
    
    // Count passes
    const peaksPassed = pairedPeaks.filter(p => p.status === 'PASS').length;
    const nullsPassed = pairedNulls.filter(p => p.status === 'PASS').length;
    const peaksTotal = pairedPeaks.length;
    const nullsTotal = pairedNulls.length;
    
    // Find worst offenders (top 5 by combined error)
    const allPaired = [...pairedPeaks, ...pairedNulls];
    const failures = allPaired
      .filter(p => p.status === 'FAIL')
      .map(p => ({
        ...p,
        combinedError: Math.abs(p.deltaHz || 0) + Math.abs(p.deltaDb || 0)
      }))
      .sort((a, b) => b.combinedError - a.combinedError)
      .slice(0, 5);
    
    // Max errors
    const maxDeltaHz = allPaired
      .filter(p => p.deltaHz !== null)
      .reduce((max, p) => Math.max(max, Math.abs(p.deltaHz)), 0);
    
    const maxDeltaDb = allPaired
      .filter(p => p.deltaDb !== null)
      .reduce((max, p) => Math.max(max, Math.abs(p.deltaDb)), 0);
    
    // RMS error
    const rmsError = computeRmsError(b44Norm, rewNorm);
    
    return {
      status: 'VALID',
      peaksPassed,
      peaksTotal,
      nullsPassed,
      nullsTotal,
      failures,
      maxDeltaHz,
      maxDeltaDb,
      rmsError,
      b44Median,
      rewMedian,
      b44Features,
      rewFeatures
    };
  }, [b44Series, rewSeries]);
  
  // Render status
  if (validation.status === 'NO_B44_DATA') {
    return (
      <Alert className="border border-gray-300 bg-gray-50">
        <AlertDescription className="text-sm text-gray-600">
          No B44 curve data available
        </AlertDescription>
      </Alert>
    );
  }
  
  if (validation.status === 'NO_REW_DATA') {
    return (
      <Alert className="border border-blue-300 bg-blue-50">
        <AlertDescription className="text-sm text-blue-700">
          Load REW compare data to run parity check
        </AlertDescription>
      </Alert>
    );
  }
  
  // Render validation results
  const passRate = validation.peaksTotal + validation.nullsTotal > 0
    ? ((validation.peaksPassed + validation.nullsPassed) / (validation.peaksTotal + validation.nullsTotal) * 100)
    : 0;
  
  const overallStatus = passRate >= 80 ? 'GOOD' : passRate >= 50 ? 'FAIR' : 'POOR';
  const statusColor = overallStatus === 'GOOD' ? 'green' : overallStatus === 'FAIR' ? 'yellow' : 'red';
  
  return (
    <div className={`rounded-lg border-2 ${
      statusColor === 'green' ? 'border-green-600 bg-green-50' : 
      statusColor === 'yellow' ? 'border-yellow-600 bg-yellow-50' : 
      'border-red-600 bg-red-50'
    } p-4`}>
      <div className="text-sm font-bold mb-3" style={{ 
        color: statusColor === 'green' ? '#065f46' : 
               statusColor === 'yellow' ? '#92400e' : '#991b1b' 
      }}>
        REW Parity Check (15–120 Hz)
      </div>
      
      {/* Summary scores */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Nulls Matched</div>
          <div className="text-lg font-bold text-gray-900">
            {validation.nullsPassed} / {validation.nullsTotal}
          </div>
          <div className="text-xs text-gray-500">
            {validation.nullsTotal > 0 
              ? `${Math.round(validation.nullsPassed / validation.nullsTotal * 100)}%`
              : 'N/A'}
          </div>
        </div>
        
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Peaks Matched</div>
          <div className="text-lg font-bold text-gray-900">
            {validation.peaksPassed} / {validation.peaksTotal}
          </div>
          <div className="text-xs text-gray-500">
            {validation.peaksTotal > 0 
              ? `${Math.round(validation.peaksPassed / validation.peaksTotal * 100)}%`
              : 'N/A'}
          </div>
        </div>
      </div>
      
      {/* Error metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs font-mono">
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-gray-600 mb-1">Max ΔHz</div>
          <div className="font-bold text-gray-900">
            {validation.maxDeltaHz.toFixed(2)} Hz
          </div>
          <div className={validation.maxDeltaHz <= 0.5 ? 'text-green-600' : 'text-red-600'}>
            {validation.maxDeltaHz <= 0.5 ? '✓ PASS' : '✗ FAIL'}
          </div>
        </div>
        
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-gray-600 mb-1">Max ΔdB</div>
          <div className="font-bold text-gray-900">
            {validation.maxDeltaDb.toFixed(2)} dB
          </div>
          <div className={validation.maxDeltaDb <= 0.5 ? 'text-green-600' : 'text-red-600'}>
            {validation.maxDeltaDb <= 0.5 ? '✓ PASS' : '✗ FAIL'}
          </div>
        </div>
        
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-gray-600 mb-1">RMS Error</div>
          <div className="font-bold text-gray-900">
            {validation.rmsError !== null ? validation.rmsError.toFixed(2) : 'N/A'} dB
          </div>
          <div className={validation.rmsError !== null && validation.rmsError <= 1.0 ? 'text-green-600' : 'text-yellow-600'}>
            {validation.rmsError !== null && validation.rmsError <= 1.0 ? '✓ GOOD' : 'CAUTION'}
          </div>
        </div>
      </div>
      
      {/* Overall verdict */}
      <div className={`text-sm font-semibold mb-3 p-2 rounded ${
        overallStatus === 'GOOD' ? 'bg-green-100 text-green-800' :
        overallStatus === 'FAIR' ? 'bg-yellow-100 text-yellow-800' :
        'bg-red-100 text-red-800'
      }`}>
        Overall: {overallStatus} ({Math.round(passRate)}% features matched)
      </div>
      
      {/* Normalization info */}
      <div className="text-xs font-mono text-gray-600 mb-2 bg-white p-2 rounded border border-gray-200">
        <div><strong>Normalization applied:</strong> 40–80 Hz median subtracted from both curves</div>
        <div>B44 median: {validation.b44Median.toFixed(2)} dB → 0 dB</div>
        <div>REW median: {validation.rewMedian.toFixed(2)} dB → 0 dB</div>
      </div>
      
      {/* Worst offenders table */}
      {validation.failures.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            Worst Offenders (Top {validation.failures.length}):
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300 bg-gray-100">
                  <th className="text-left p-1">Type</th>
                  <th className="text-right p-1">REW Hz</th>
                  <th className="text-right p-1">REW dB</th>
                  <th className="text-right p-1">B44 Hz</th>
                  <th className="text-right p-1">B44 dB</th>
                  <th className="text-right p-1">ΔHz</th>
                  <th className="text-right p-1">ΔdB</th>
                  <th className="text-left p-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {validation.failures.map((fail, i) => (
                  <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="p-1">{fail.type}</td>
                    <td className="text-right p-1">{fail.rewFreq.toFixed(1)}</td>
                    <td className="text-right p-1">{fail.rewLevel.toFixed(1)}</td>
                    <td className="text-right p-1">{fail.b44Freq !== null ? fail.b44Freq.toFixed(1) : '—'}</td>
                    <td className="text-right p-1">{fail.b44Level !== null ? fail.b44Level.toFixed(1) : '—'}</td>
                    <td className={`text-right p-1 ${Math.abs(fail.deltaHz || 0) > 0.5 ? 'text-red-600 font-bold' : ''}`}>
                      {fail.deltaHz !== null ? (fail.deltaHz >= 0 ? '+' : '') + fail.deltaHz.toFixed(2) : '—'}
                    </td>
                    <td className={`text-right p-1 ${Math.abs(fail.deltaDb || 0) > 0.5 ? 'text-red-600 font-bold' : ''}`}>
                      {fail.deltaDb !== null ? (fail.deltaDb >= 0 ? '+' : '') + fail.deltaDb.toFixed(2) : '—'}
                    </td>
                    <td className={`text-left p-1 font-semibold ${fail.status === 'MISSING' ? 'text-orange-600' : 'text-red-600'}`}>
                      {fail.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Feature summary */}
      <div className="mt-3 pt-3 border-t border-gray-300 text-xs font-mono text-gray-600">
        <div><strong>Features detected:</strong></div>
        <div>REW: {validation.rewFeatures.peaks.length} peaks, {validation.rewFeatures.nulls.length} nulls</div>
        <div>B44: {validation.b44Features.peaks.length} peaks, {validation.b44Features.nulls.length} nulls</div>
      </div>
      
      {/* Acceptance criteria */}
      <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600">
        <div className="font-semibold mb-1">Tolerance:</div>
        <div>• Frequency: ±0.5 Hz (strict)</div>
        <div>• Level: ±0.5 dB (strict)</div>
        <div>• RMS target: &lt;1.0 dB (good), &lt;2.0 dB (acceptable)</div>
      </div>
    </div>
  );
}