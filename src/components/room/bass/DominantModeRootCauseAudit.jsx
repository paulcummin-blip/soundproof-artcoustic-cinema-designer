/**
 * DominantModeRootCauseAudit
 *
 * Diagnostic-only. Does not affect live graph or production engine.
 * Settings: Q×0.8, Tang×0.8, Axial=1.0, Oblique=1.0
 * Targets: 70, 80, 85, 90 Hz
 */
import React, { useState, useCallback } from 'react';
import {
  TARGET_FREQUENCIES, REW_BENCHMARK,
  runAuditSim, findBin, analyseFrequency, buildRecommendation,
} from './dominantModeAuditLogic';

// ─── shared style tokens ─────────────────────────────────────────────────────
const COLORS = {
  axial:       '#166534',
  tangential:  '#0369a1',
  oblique:     '#7e22ce',
  header:      '#1e3a5f',
  border:      '#bfdbfe',
  bg:          '#eff6ff',
  bgCard:      '#f8faff',
  titleClr:    '#1d4ed8',
};
const TH = {
  textAlign: 'right', padding: '3px 5px', fontSize: 9, fontWeight: 700,
  background: '#e0f2fe', borderBottom: '2px solid #7dd3fc', color: '#0369a1',
  whiteSpace: 'nowrap',
};
const TD = { textAlign: 'right', padding: '2px 5px', fontSize: 9, fontFamily: 'monospace' };

function f4(v)   { return Number.isFinite(v) ? v.toFixed(4) : '—'; }
function f2(v)   { return Number.isFinite(v) ? v.toFixed(2) : '—'; }
function f1(v)   { return Number.isFinite(v) ? v.toFixed(1) : '—'; }
function pct(v)  { return Number.isFinite(v) ? v.toFixed(1) + '%' : '—'; }
function errClr(e) {
  if (!Number.isFinite(e)) return '#6b7280';
  return Math.abs(e) > 5 ? '#dc2626' : Math.abs(e) > 3 ? '#b45309' : '#166534';
}
function famClr(f) { return COLORS[f] ?? '#374151'; }
function famLabel(f) { return f ? f.charAt(0).toUpperCase() + f.slice(1) : '—'; }

// ─── sub-components ───────────────────────────────────────────────────────────

function FreqHeader({ data }) {
  const { targetHz, totalRe, totalIm, totalMag, simSpl, rewTarget, error } = data;
  const totalSplDb = 20 * Math.log10(Math.max(totalMag, 1e-10));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', padding: '5px 0', fontSize: 10, fontFamily: 'monospace', borderBottom: '1px solid #bfdbfe', marginBottom: 6 }}>
      <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13 }}>{targetHz} Hz</span>
      <span>Total Re: <b>{f4(totalRe)}</b></span>
      <span>Total Im: <b>{f4(totalIm)}</b></span>
      <span>Modal mag: <b>{f4(totalMag)}</b> ({f1(totalSplDb)} dB)</span>
      <span>REW target: <b>{rewTarget != null ? rewTarget.toFixed(1) : '—'} dB</b></span>
      <span>Simulated: <b>{f1(simSpl)} dB</b></span>
      <span style={{ fontWeight: 700, color: errClr(error) }}>Error: {error != null ? (error > 0 ? '+' : '') + error.toFixed(1) + ' dB' : '—'}</span>
    </div>
  );
}

function ContributorTable({ modes }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 3 }}>Top 15 Modal Contributors</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
        <thead>
          <tr>
            {['#','Indices','Family','Mode Hz','Q','Src Ψ','Rcv Ψ','Coupling','Transfer','Contrib','Phase','% Total'].map(h => (
              <th key={h} style={{ ...TH, textAlign: h === 'Family' ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modes.map(m => (
            <tr key={m.rank} style={{ borderBottom: '1px solid #e0f2fe', background: m.rank === 1 ? '#e0f2fe' : undefined }}>
              <td style={{ ...TD, fontWeight: m.rank <= 3 ? 700 : 400, color: '#1d4ed8' }}>{m.rank}</td>
              <td style={{ ...TD, color: '#0c4a6e', textAlign: 'center' }}>({m.nx},{m.ny},{m.nz})</td>
              <td style={{ ...TD, textAlign: 'left', color: famClr(m.family) }}>{famLabel(m.family)}</td>
              <td style={TD}>{f1(m.modeHz)}</td>
              <td style={TD}>{f2(m.q)}</td>
              <td style={TD}>{f4(m.sourceCoupling)}</td>
              <td style={TD}>{f4(m.receiverCoupling)}</td>
              <td style={{ ...TD, color: '#0369a1' }}>{f4(m.combinedCoupling)}</td>
              <td style={{ ...TD, color: '#b45309' }}>{f4(m.transferMag)}</td>
              <td style={{ ...TD, fontWeight: m.rank <= 3 ? 700 : 400 }}>{f4(m.mag)}</td>
              <td style={TD}>{f1(m.phaseDeg)}°</td>
              <td style={{ ...TD, fontWeight: m.rank <= 5 ? 700 : 400, color: m.pctOfTotal > 20 ? '#dc2626' : '#374151' }}>{pct(m.pctOfTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RootCauseTable({ rootCause }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7e22ce', marginBottom: 3 }}>Root Cause — Top 10 (normalised to 100%)</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 540 }}>
        <thead>
          <tr>
            {['Mode','Family','Coupling %','Transfer %','Contribution %','Driver'].map(h => (
              <th key={h} style={{ ...TH, textAlign: h === 'Family' || h === 'Driver' ? 'left' : 'right', background: '#f3e8ff', borderBottomColor: '#c084fc', color: '#7e22ce' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rootCause.map((m, i) => {
            const cHigh = m.couplingNorm >= m.transferNorm * 1.2;
            const tHigh = m.transferNorm >= m.couplingNorm * 1.2;
            const driver = cHigh && tHigh ? 'Both' : cHigh ? 'Coupling' : tHigh ? 'Transfer' : 'Equal';
            const driverColor = driver === 'Both' ? '#dc2626' : driver === 'Coupling' ? '#0369a1' : driver === 'Transfer' ? '#b45309' : '#6b7280';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #e9d5ff', background: i === 0 ? '#f3e8ff' : undefined }}>
                <td style={{ ...TD, textAlign: 'center', color: '#4c1d95' }}>({m.nx},{m.ny},{m.nz})</td>
                <td style={{ ...TD, textAlign: 'left', color: famClr(m.family) }}>{famLabel(m.family)}</td>
                <td style={{ ...TD, fontWeight: m.couplingNorm > 80 ? 700 : 400, color: '#0369a1' }}>{pct(m.couplingNorm)}</td>
                <td style={{ ...TD, fontWeight: m.transferNorm > 80 ? 700 : 400, color: '#b45309' }}>{pct(m.transferNorm)}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{pct(m.contribNorm)}</td>
                <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: driverColor }}>{driver}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FamilySummary({ familySummary }) {
  const families = ['axial', 'tangential', 'oblique'];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', marginBottom: 3 }}>Family Summary</div>
      <table style={{ borderCollapse: 'collapse', minWidth: 360, fontSize: 9, fontFamily: 'monospace' }}>
        <thead>
          <tr>
            {['Family','Contribution %','Coupling %','Transfer %'].map(h => (
              <th key={h} style={{ ...TH, textAlign: h === 'Family' ? 'left' : 'right', background: '#dcfce7', borderBottomColor: '#86efac', color: '#166534' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {families.map(fam => {
            const s = familySummary[fam] ?? {};
            return (
              <tr key={fam} style={{ borderBottom: '1px solid #bbf7d0' }}>
                <td style={{ ...TD, textAlign: 'left', color: famClr(fam), fontWeight: 700 }}>{famLabel(fam)}</td>
                <td style={{ ...TD, fontWeight: (s.contribPct ?? 0) > 50 ? 700 : 400 }}>{pct(s.contribPct)}</td>
                <td style={TD}>{pct(s.couplingPct)}</td>
                <td style={TD}>{pct(s.transferPct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DominanceScore({ dominance }) {
  const { top1Pct, top3Pct, top5Pct } = dominance;
  const isDominant = top3Pct > 60;
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 9, fontFamily: 'monospace', padding: '4px 0', borderTop: '1px solid #bfdbfe', marginTop: 4 }}>
      <span style={{ fontWeight: 700, color: '#0369a1' }}>Dominance:</span>
      <span>Top 1: <b style={{ color: top1Pct > 30 ? '#dc2626' : '#374151' }}>{pct(top1Pct)}</b></span>
      <span>Top 3: <b style={{ color: isDominant ? '#dc2626' : '#374151' }}>{pct(top3Pct)}</b></span>
      <span>Top 5: <b>{pct(top5Pct)}</b></span>
      <span style={{ color: isDominant ? '#dc2626' : '#166534', fontWeight: 700 }}>
        {isDominant ? '⚠ Few dominant modes driving error' : '✓ Energy distributed across many modes'}
      </span>
    </div>
  );
}

function FreqPanel({ data }) {
  const [showRootCause, setShowRootCause] = useState(false);
  return (
    <div style={{ border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 10px', marginBottom: 10, background: '#f8faff' }}>
      <FreqHeader data={data} />
      <ContributorTable modes={data.top15} />
      <button
        onClick={() => setShowRootCause(v => !v)}
        style={{ fontSize: 9, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4, border: '1px solid #c084fc', background: showRootCause ? '#f3e8ff' : '#fff', color: '#7e22ce', cursor: 'pointer', marginBottom: showRootCause ? 6 : 0 }}
      >
        {showRootCause ? '▲ Hide root cause' : '▼ Show root cause table'}
      </button>
      {showRootCause && <RootCauseTable rootCause={data.rootCause} />}
      <FamilySummary familySummary={data.familySummary} />
      <DominanceScore dominance={data.dominance} />
    </div>
  );
}

function Recommendation({ rec }) {
  const confColor = rec.confidence === 'High' ? '#166534' : rec.confidence === 'Medium' ? '#b45309' : '#6b7280';
  const confBg    = rec.confidence === 'High' ? '#dcfce7' : rec.confidence === 'Medium' ? '#fef3c7' : '#f3f4f6';
  const driverColor = rec.driver === 'Coupling' ? '#0369a1' : rec.driver === 'Transfer magnitude' ? '#b45309' : rec.driver === 'Family weighting' ? '#166534' : '#374151';
  return (
    <div style={{ border: '2px solid #1d4ed8', borderRadius: 8, background: '#eff6ff', padding: '10px 14px', marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>Recommendation Engine</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace' }}>
          Primary parity driver: <b style={{ color: driverColor, fontSize: 12 }}>{rec.driver}</b>
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '1px 8px', borderRadius: 4, background: confBg, color: confColor, fontWeight: 700, border: `1px solid ${confColor}` }}>
          Confidence: {rec.confidence}
        </span>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#1e3a5f', lineHeight: 1.5, borderTop: '1px solid #bfdbfe', paddingTop: 6 }}>
        {rec.explanation}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
        <span>Avg coupling norm: {f1(rec.avgCoupling)}%</span>
        <span>Avg transfer norm: {f1(rec.avgTransfer)}%</span>
        <span>Avg family dom: {f1(rec.avgFamilyDom)}%</span>
        <span>Avg top-3 energy: {f1(rec.avgTop3Pct)}%</span>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DominantModeRootCauseAudit({ roomDims, seat, sub, surfaceAbsorption, activeSettings }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  const canRun = !!(
    roomDims?.widthM && roomDims?.lengthM && roomDims?.heightM &&
    seat?.x != null && seat?.y != null &&
    sub?.x  != null && sub?.y  != null
  );

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setResults(null);
    setError(null);
    await new Promise(r => setTimeout(r, 0));

    try {
      const result = runAuditSim(roomDims, seat, sub, surfaceAbsorption, activeSettings);
      const { activeModalContributorDebugSeries, freqsHz, splDbRaw } = result;

      const freqResults = TARGET_FREQUENCIES.map(hz => {
        const bin = findBin(activeModalContributorDebugSeries, hz);
        return analyseFrequency(hz, bin, freqsHz, splDbRaw);
      });

      const recommendation = buildRecommendation(freqResults);
      setResults({ freqResults, recommendation });
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }, [roomDims, seat, sub, surfaceAbsorption, activeSettings, canRun]);

  return (
    <div style={{ marginTop: 12, border: '1px solid #7dd3fc', borderRadius: 8, background: COLORS.bg, padding: '10px 12px' }}>
      <div style={{ fontWeight: 700, color: COLORS.titleClr, fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        Dominant Mode Root Cause Audit
        <span style={{ fontWeight: 400, color: '#60a5fa', marginLeft: 8, fontSize: 10 }}>
          Q×0.8 · Tang×0.8 · Axial=1.0 · Oblique=1.0 · diagnostic only · does not affect live graph
        </span>
      </div>

      {!canRun && (
        <div style={{ fontSize: 10, color: '#b45309', fontFamily: 'monospace', marginBottom: 6 }}>
          ⚠ Requires room dimensions, a valid seat position, and a valid sub position.
        </div>
      )}

      <button
        onClick={run}
        disabled={running || !canRun}
        style={{
          height: 28, padding: '0 14px', borderRadius: 6, border: '1px solid #1d4ed8',
          background: (running || !canRun) ? '#e5e7eb' : '#1d4ed8',
          color: (running || !canRun) ? '#6b7280' : '#fff',
          fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
          cursor: (running || !canRun) ? 'not-allowed' : 'pointer',
          marginBottom: 10,
        }}
      >
        {running ? 'Running…' : results ? 'Re-run audit' : 'Run dominant mode audit'}
      </button>

      {error && (
        <div style={{ fontSize: 10, color: '#dc2626', fontFamily: 'monospace', marginBottom: 6 }}>
          Error: {error}
        </div>
      )}

      {results && (
        <>
          {results.freqResults.map((data, i) =>
            data
              ? <FreqPanel key={TARGET_FREQUENCIES[i]} data={data} />
              : <div key={i} style={{ fontSize: 9, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 6 }}>No engine data at {TARGET_FREQUENCIES[i]} Hz</div>
          )}
          {results.recommendation && <Recommendation rec={results.recommendation} />}
        </>
      )}
    </div>
  );
}