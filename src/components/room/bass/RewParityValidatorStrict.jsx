import React, { useMemo } from 'react';
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * REW Parity Validator (Strict Numerical Comparison)
 * Compares B44 curve vs REW reference curve on a shared frequency grid
 * Reports: MAE, max error, 95th percentile, peak/null alignment
 * NO smoothing, NO post-processing - pure validation
 */
export default function RewParityValidatorStrict({ b44Series, rewSeries }) {
  const validation = useMemo(() => {
    if (!b44Series || b44Series.length === 0) {
      return { status: 'NO_B44_DATA' };
    }
    
    if (!rewSeries || rewSeries.length === 0) {
      return { status: 'NO_REW_DATA' };
    }
    
    // 1. CREATE SHARED COMPARISON GRID (2000 points, log-spaced)
    const gridFMin = 10;
    const gridFMax = 200;
    const gridPointCount = 2000;
    
    const validationGrid = [];
    const octaves = Math.log2(gridFMax / gridFMin);
    const pointsPerOct = gridPointCount / octaves;
    
    for (let i = 0; i <= gridPointCount; i++) {
      const f = gridFMin * Math.pow(2, i / pointsPerOct);
      if (f > gridFMax) break;
      validationGrid.push(f);
    }
    
    // 2. INTERPOLATE BOTH CURVES ONTO VALIDATION GRID
    const interpolate = (series, targetFreq) => {
      if (!series || series.length === 0) return null;
      
      const sorted = [...series]
        .filter(p => Number.isFinite(p.frequency) && Number.isFinite(p.spl))
        .sort((a, b) => a.frequency - b.frequency);
      
      if (sorted.length === 0) return null;
      
      // Clamp to endpoints
      if (targetFreq <= sorted[0].frequency) return sorted[0].spl;
      if (targetFreq >= sorted[sorted.length - 1].frequency) return sorted[sorted.length - 1].spl;
      
      // Find bracket
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        
        if (targetFreq >= p1.frequency && targetFreq <= p2.frequency) {
          const t = (targetFreq - p1.frequency) / (p2.frequency - p1.frequency);
          return p1.spl + (p2.spl - p1.spl) * t;
        }
      }
      
      return null;
    };
    
    const b44OnGrid = validationGrid.map(f => interpolate(b44Series, f));
    const rewOnGrid = validationGrid.map(f => interpolate(rewSeries, f));
    
    // 3. COMPUTE CORE PARITY METRICS
    const deltas = [];
    for (let i = 0; i < validationGrid.length; i++) {
      const b44Val = b44OnGrid[i];
      const rewVal = rewOnGrid[i];
      
      if (Number.isFinite(b44Val) && Number.isFinite(rewVal)) {
        deltas.push({
          freq: validationGrid[i],
          delta: b44Val - rewVal,
          absDelta: Math.abs(b44Val - rewVal)
        });
      }
    }
    
    if (deltas.length === 0) {
      return { status: 'NO_OVERLAP' };
    }
    
    // Mean Absolute Error
    const mae = deltas.reduce((sum, d) => sum + d.absDelta, 0) / deltas.length;
    
    // Max Absolute Error
    const maxError = Math.max(...deltas.map(d => d.absDelta));
    const maxErrorFreq = deltas.find(d => d.absDelta === maxError)?.freq || null;
    
    // 95th Percentile
    const sortedAbsDeltas = [...deltas].sort((a, b) => a.absDelta - b.absDelta);
    const idx95 = Math.floor(sortedAbsDeltas.length * 0.95);
    const percentile95 = sortedAbsDeltas[idx95]?.absDelta || 0;
    
    // Pass band count (±0.5 dB tolerance)
    const passBandCount = deltas.filter(d => d.absDelta <= 0.5).length;
    const passBandPercent = (passBandCount / deltas.length) * 100;
    
    // 4. PEAK/NULL ALIGNMENT TEST
    // Detect local maxima/minima with prominence filter
    const detectFeatures = (grid, values, prominenceDb = 1.0) => {
      const peaks = [];
      const nulls = [];
      
      for (let i = 1; i < grid.length - 1; i++) {
        const prev = values[i - 1];
        const curr = values[i];
        const next = values[i + 1];
        
        if (!Number.isFinite(prev) || !Number.isFinite(curr) || !Number.isFinite(next)) continue;
        
        // Peak detection
        if (curr > prev && curr > next) {
          const height = Math.min(curr - prev, curr - next);
          if (height >= prominenceDb) {
            peaks.push({
              frequency: grid[i],
              level: curr,
              prominence: height
            });
          }
        }
        
        // Null detection
        if (curr < prev && curr < next) {
          const depth = Math.min(prev - curr, next - curr);
          if (depth >= prominenceDb) {
            nulls.push({
              frequency: grid[i],
              level: curr,
              prominence: depth
            });
          }
        }
      }
      
      return { peaks, nulls };
    };
    
    const b44Features = detectFeatures(validationGrid, b44OnGrid, 1.0);
    const rewFeatures = detectFeatures(validationGrid, rewOnGrid, 1.0);
    
    // Pair features (find closest match within ±2 Hz)
    const pairFeatures = (rewFeats, b44Feats, type) => {
      const paired = [];
      const FREQ_TOL_HZ = 0.5; // Strict tolerance for pass/fail
      const LEVEL_TOL_DB = 0.5;
      const SEARCH_WINDOW_HZ = 2.0; // Search window
      
      rewFeats.forEach(rewFeat => {
        // Find candidates within search window
        const candidates = b44Feats.filter(b44Feat => 
          Math.abs(b44Feat.frequency - rewFeat.frequency) <= SEARCH_WINDOW_HZ
        );
        
        if (candidates.length === 0) {
          paired.push({
            type,
            rewFreq: rewFeat.frequency,
            rewLevel: rewFeat.level,
            rewProminence: rewFeat.prominence,
            b44Freq: null,
            b44Level: null,
            freqErrorHz: null,
            levelErrorDb: null,
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
        
        const freqErrorHz = nearest.frequency - rewFeat.frequency;
        const levelErrorDb = nearest.level - rewFeat.level;
        
        const freqPass = Math.abs(freqErrorHz) <= FREQ_TOL_HZ;
        const levelPass = Math.abs(levelErrorDb) <= LEVEL_TOL_DB;
        const status = (freqPass && levelPass) ? 'PASS' : 'FAIL';
        
        paired.push({
          type,
          rewFreq: rewFeat.frequency,
          rewLevel: rewFeat.level,
          rewProminence: rewFeat.prominence,
          b44Freq: nearest.frequency,
          b44Level: nearest.level,
          b44Prominence: nearest.prominence,
          freqErrorHz,
          levelErrorDb,
          status
        });
      });
      
      return paired;
    };
    
    const pairedPeaks = pairFeatures(rewFeatures.peaks, b44Features.peaks, 'Peak');
    const pairedNulls = pairFeatures(rewFeatures.nulls, b44Features.nulls, 'Null');
    
    // Count passes
    const peaksPassed = pairedPeaks.filter(p => p.status === 'PASS').length;
    const nullsPassed = pairedNulls.filter(p => p.status === 'PASS').length;
    const totalFeatures = pairedPeaks.length + pairedNulls.length;
    const totalPassed = peaksPassed + nullsPassed;
    const featurePassPercent = totalFeatures > 0 ? (totalPassed / totalFeatures) * 100 : 0;
    
    // Top 10 worst offenders (combined error metric)
    const allPaired = [...pairedPeaks, ...pairedNulls];
    const failures = allPaired
      .filter(p => p.status === 'FAIL' || p.status === 'MISSING')
      .map(p => ({
        ...p,
        combinedError: (Math.abs(p.freqErrorHz || 0) * 2) + Math.abs(p.levelErrorDb || 0)
      }))
      .sort((a, b) => b.combinedError - a.combinedError)
      .slice(0, 10);
    
    // 5. GRID DENSITY DIAGNOSTIC ("Why it looks blocky")
    const computeSpacingStats = (series) => {
      const freqs = series
        .map(p => p.frequency)
        .filter(f => Number.isFinite(f))
        .sort((a, b) => a - b);
      
      if (freqs.length < 2) return { count: 0, minSpacing: null, maxSpacing: null, spacings: [] };
      
      const spacings = [];
      for (let i = 1; i < freqs.length; i++) {
        spacings.push(freqs[i] - freqs[i - 1]);
      }
      
      const minSpacing = Math.min(...spacings);
      const maxSpacing = Math.max(...spacings);
      
      return { count: freqs.length, minSpacing, maxSpacing, spacings };
    };
    
    const b44GridStats = computeSpacingStats(b44Series);
    const rewGridStats = computeSpacingStats(rewSeries);
    
    // Detect sudden spacing changes in B44 grid
    let spacingWarning = null;
    if (b44GridStats.maxSpacing !== null && b44GridStats.minSpacing !== null) {
      const spacingRatio = b44GridStats.maxSpacing / b44GridStats.minSpacing;
      if (spacingRatio > 3) {
        // Find where spacing changes
        const spacings = b44GridStats.spacings || [];
        const freqs = b44Series
          .map(p => p.frequency)
          .filter(f => Number.isFinite(f))
          .sort((a, b) => a - b);
        
        for (let i = 1; i < spacings.length; i++) {
          const prevSpacing = spacings[i - 1];
          const currSpacing = spacings[i];
          
          if (currSpacing / prevSpacing > 2 && freqs[i]) {
            spacingWarning = `Frequency grid density changes at ${freqs[i].toFixed(1)} Hz (${prevSpacing.toFixed(3)} Hz → ${currSpacing.toFixed(3)} Hz spacing); visual corners likely from undersampling, not physics.`;
            break;
          }
        }
      }
    }
    
    // 6. PASS/FAIL HEADLINE
    const overallPass = (passBandPercent >= 95) && (featurePassPercent >= 80);
    
    return {
      status: 'VALID',
      mae,
      maxError,
      maxErrorFreq,
      percentile95,
      passBandCount,
      passBandPercent,
      pairedPeaks,
      pairedNulls,
      peaksPassed,
      nullsPassed,
      totalFeatures,
      featurePassPercent,
      failures,
      b44GridStats,
      rewGridStats,
      spacingWarning,
      overallPass,
      gridPointCount: validationGrid.length
    };
  }, [b44Series, rewSeries]);
  
  // Render status
  if (validation.status === 'NO_B44_DATA') {
    return (
      <Alert className="border border-gray-300 bg-gray-50">
        <AlertDescription className="text-sm text-gray-600">
          No B44 curve data available for validation
        </AlertDescription>
      </Alert>
    );
  }
  
  if (validation.status === 'NO_REW_DATA') {
    return (
      <Alert className="border border-blue-300 bg-blue-50">
        <AlertDescription className="text-sm text-blue-700">
          Load REW reference data to run strict parity validation
        </AlertDescription>
      </Alert>
    );
  }
  
  if (validation.status === 'NO_OVERLAP') {
    return (
      <Alert className="border border-red-300 bg-red-50">
        <AlertDescription className="text-sm text-red-700">
          No overlap between B44 and REW curves on validation grid
        </AlertDescription>
      </Alert>
    );
  }
  
  // Render validation results
  const statusColor = validation.overallPass ? 'green' : 'red';
  
  return (
    <div className={`rounded-lg border-2 ${
      statusColor === 'green' ? 'border-green-600 bg-green-50' : 'border-red-600 bg-red-50'
    } p-4`}>
      <div className="text-sm font-bold mb-3" style={{ 
        color: statusColor === 'green' ? '#065f46' : '#991b1b' 
      }}>
        REW Parity Validator (Strict Numerical Comparison)
      </div>
      
      {/* Overall pass/fail headline */}
      <div className={`text-lg font-bold mb-4 p-3 rounded ${
        validation.overallPass ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'
      }`}>
        {validation.overallPass ? '✓ PASS' : '✗ FAIL'}
      </div>
      
      {/* Core parity metrics */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Mean Abs Error</div>
          <div className="text-lg font-bold text-gray-900">
            {validation.mae.toFixed(3)} dB
          </div>
        </div>
        
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Max Error</div>
          <div className="text-lg font-bold text-gray-900">
            {validation.maxError.toFixed(3)} dB
          </div>
          {validation.maxErrorFreq && (
            <div className="text-xs text-gray-500">
              @ {validation.maxErrorFreq.toFixed(1)} Hz
            </div>
          )}
        </div>
        
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">95th Percentile</div>
          <div className="text-lg font-bold text-gray-900">
            {validation.percentile95.toFixed(3)} dB
          </div>
        </div>
        
        <div className="bg-white rounded p-2 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Pass Band</div>
          <div className="text-lg font-bold text-gray-900">
            {validation.passBandPercent.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">
            {validation.passBandCount} / {deltas.length} pts
          </div>
        </div>
      </div>
      
      {/* Peak/null alignment summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded p-3 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Peaks Matched</div>
          <div className="text-2xl font-bold text-gray-900">
            {validation.peaksPassed} / {validation.pairedPeaks.length}
          </div>
          <div className="text-xs text-gray-500">
            {validation.pairedPeaks.length > 0 
              ? `${Math.round(validation.peaksPassed / validation.pairedPeaks.length * 100)}%`
              : 'N/A'}
          </div>
        </div>
        
        <div className="bg-white rounded p-3 border border-gray-200">
          <div className="text-xs text-gray-600 mb-1">Nulls Matched</div>
          <div className="text-2xl font-bold text-gray-900">
            {validation.nullsPassed} / {validation.pairedNulls.length}
          </div>
          <div className="text-xs text-gray-500">
            {validation.pairedNulls.length > 0 
              ? `${Math.round(validation.nullsPassed / validation.pairedNulls.length * 100)}%`
              : 'N/A'}
          </div>
        </div>
      </div>
      
      {/* Overall feature alignment */}
      <div className={`p-3 rounded mb-4 ${
        validation.featurePassPercent >= 80 ? 'bg-green-100' : 'bg-red-100'
      }`}>
        <div className="text-sm font-semibold">
          Overall Feature Alignment: {validation.featurePassPercent.toFixed(1)}%
        </div>
        <div className="text-xs mt-1">
          {validation.totalPassed} / {validation.totalFeatures} features matched (peaks + nulls)
        </div>
      </div>
      
      {/* Top 10 worst offenders */}
      {validation.failures.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            Top {validation.failures.length} Worst Offenders:
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
                    <td className={`text-right p-1 ${Math.abs(fail.freqErrorHz || 0) > 0.5 ? 'text-red-600 font-bold' : ''}`}>
                      {fail.freqErrorHz !== null ? (fail.freqErrorHz >= 0 ? '+' : '') + fail.freqErrorHz.toFixed(2) : '—'}
                    </td>
                    <td className={`text-right p-1 ${Math.abs(fail.levelErrorDb || 0) > 0.5 ? 'text-red-600 font-bold' : ''}`}>
                      {fail.levelErrorDb !== null ? (fail.levelErrorDb >= 0 ? '+' : '') + fail.levelErrorDb.toFixed(2) : '—'}
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
      
      {/* Grid density diagnostic */}
      <div className="bg-blue-50 rounded p-3 border border-blue-300 mb-4">
        <div className="text-xs font-semibold text-blue-900 mb-2">
          Grid Density Diagnostic ("Why it looks blocky")
        </div>
        <div className="space-y-2 text-xs font-mono">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="font-semibold text-blue-800 mb-1">B44 Grid:</div>
              <div>Point count: {validation.b44GridStats.count}</div>
              <div>Min spacing: {validation.b44GridStats.minSpacing !== null ? validation.b44GridStats.minSpacing.toFixed(4) : 'N/A'} Hz</div>
              <div>Max spacing: {validation.b44GridStats.maxSpacing !== null ? validation.b44GridStats.maxSpacing.toFixed(4) : 'N/A'} Hz</div>
              {validation.b44GridStats.maxSpacing !== null && validation.b44GridStats.minSpacing !== null && (
                <div className={validation.b44GridStats.maxSpacing / validation.b44GridStats.minSpacing > 3 ? 'text-red-600 font-bold' : 'text-green-600'}>
                  Ratio: {(validation.b44GridStats.maxSpacing / validation.b44GridStats.minSpacing).toFixed(1)}×
                  {validation.b44GridStats.maxSpacing / validation.b44GridStats.minSpacing > 3 ? ' (non-uniform)' : ' (uniform)'}
                </div>
              )}
            </div>
            
            <div>
              <div className="font-semibold text-blue-800 mb-1">REW Grid:</div>
              <div>Point count: {validation.rewGridStats.count}</div>
              <div>Min spacing: {validation.rewGridStats.minSpacing !== null ? validation.rewGridStats.minSpacing.toFixed(4) : 'N/A'} Hz</div>
              <div>Max spacing: {validation.rewGridStats.maxSpacing !== null ? validation.rewGridStats.maxSpacing.toFixed(4) : 'N/A'} Hz</div>
            </div>
          </div>
          
          {validation.spacingWarning && (
            <div className="mt-2 pt-2 border-t border-blue-300 text-red-600 font-semibold">
              ⚠️ {validation.spacingWarning}
            </div>
          )}
        </div>
      </div>
      
      {/* Validation grid info */}
      <div className="text-xs font-mono text-gray-600 bg-white p-2 rounded border border-gray-200 mb-3">
        <div><strong>Validation grid:</strong> {validation.gridPointCount} points (log-spaced, {gridFMin}–{gridFMax} Hz)</div>
        <div><strong>Sample count:</strong> {deltas.length} valid comparisons</div>
      </div>
      
      {/* Acceptance criteria */}
      <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
        <div className="font-semibold mb-1">Acceptance Criteria:</div>
        <div>• Pass band: ≥95% of points within ±0.5 dB ({validation.passBandPercent >= 95 ? '✓ PASS' : '✗ FAIL'})</div>
        <div>• Feature alignment: ≥80% of peaks/nulls within ±0.5 Hz / ±0.5 dB ({validation.featurePassPercent >= 80 ? '✓ PASS' : '✗ FAIL'})</div>
        <div className="mt-1 pt-1 border-t border-gray-300">
          <strong>Overall:</strong> {validation.overallPass ? '✓ PASS (REW parity achieved)' : '✗ FAIL (improvements needed)'}
        </div>
      </div>
    </div>
  );
}