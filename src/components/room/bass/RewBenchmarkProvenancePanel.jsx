/**
 * RewBenchmarkProvenancePanel
 * Diagnostic / validation only. No production simulation changes.
 *
 * Lets the user manually enter the REW benchmark setup so that B44 can
 * confirm the simulation is solving the same physical problem before
 * parity tuning continues.
 *
 * All fields are optional — unknown fields should be left blank.
 * Values are persisted to localStorage so they survive page reloads.
 */

import React, { useState, useMemo } from 'react';

const STORAGE_KEY = 'b44_rew_benchmark_provenance_v1';

const DEFAULT_STATE = {
  // Room
  rewRoomWidth: '',
  rewRoomLength: '',
  rewRoomHeight: '',
  // Sub / source
  rewSubX: '',
  rewSubY: '',
  rewSubZ: '',
  rewSourceSpl: '',
  rewSourcePhase: '',
  // Listener / seat
  rewListenerX: '',
  rewListenerY: '',
  rewListenerZ: '',
  // REW settings
  rewWallModel: '',
  rewModalQ: '',
  rewSmoothing: '',
  rewFreqPoints: '',
  rewDataSource: 'screenshot', // 'screenshot' | 'manual_table' | 'csv_export'
  // Benchmark SPL values
  rewSpl40: '',
  rewSpl57: '',
  rewSpl70: '',
  rewSpl80: '',
  rewSpl85: '',
  rewSpl90: '',
  rewSpl100: '',
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v, d = 3) {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

function matchCheck(rewVal, b44Val, tol) {
  const r = toNum(rewVal);
  if (r === null || b44Val === null || !Number.isFinite(b44Val)) return null; // unknown
  return Math.abs(r - b44Val) <= tol;
}

function Pill({ pass }) {
  if (pass === null) return (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>?</span>
  );
  return pass
    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46', background: '#dcfce7', borderRadius: 4, padding: '1px 6px' }}>✓ match</span>
    : <span style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', background: '#fee2e2', borderRadius: 4, padding: '1px 6px' }}>✗ mismatch</span>;
}

function FieldRow({ label, value, onChange, placeholder = '', unit = '', type = 'number' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <label style={{ fontSize: 10, color: '#374151', width: 130, flexShrink: 0, fontFamily: 'monospace' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step="any"
        style={{
          width: 90, fontSize: 10, fontFamily: 'monospace', border: '1px solid #D1D5DB',
          borderRadius: 4, padding: '2px 6px', background: '#fff', color: '#111827',
        }}
      />
      {unit && <span style={{ fontSize: 9, color: '#6b7280' }}>{unit}</span>}
    </div>
  );
}

function SectionHeading({ label, color = '#334155', bg = '#f8fafc', border = '#CBD5E1' }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '3px 8px', marginBottom: 6, marginTop: 6 }}>
      {label}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RewBenchmarkProvenancePanel({ roomDims, subsForSimulation, seatingPositions, multiSeries }) {
  const [fields, setFields] = useState(() => loadFromStorage());

  const set = (key, val) => {
    setFields(prev => {
      const next = { ...prev, [key]: val };
      saveToStorage(next);
      return next;
    });
  };

  // B44 live values for comparison
  const b44 = useMemo(() => {
    const sub = subsForSimulation?.[0] ?? null;
    const primarySeat = seatingPositions?.find(s => s.isPrimary) ?? seatingPositions?.[0] ?? null;
    const curve = multiSeries?.[0]?.data ?? [];

    const splAt = (targetHz) => {
      if (curve.length < 2) return null;
      const sorted = [...curve].sort((a, b) => a.frequency - b.frequency);
      let best = null, bestDist = Infinity;
      for (const pt of sorted) {
        const d = Math.abs(pt.frequency - targetHz);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
      return best && bestDist <= 5 ? best.spl : null;
    };

    return {
      roomWidth:  roomDims?.widthM  ?? null,
      roomLength: roomDims?.lengthM ?? null,
      roomHeight: roomDims?.heightM ?? null,
      subX:   sub?.x  ?? null,
      subY:   sub?.y  ?? null,
      subZ:   sub?.z  ?? null,
      listenerX: primarySeat?.x  ?? null,
      listenerY: primarySeat?.y  ?? null,
      listenerZ: Number.isFinite(Number(primarySeat?.z)) ? Number(primarySeat.z) : 1.2,
      subToListenerDist: (() => {
        if (!sub || !primarySeat) return null;
        const dx = sub.x - primarySeat.x;
        const dy = sub.y - primarySeat.y;
        const dz = (sub.z ?? 0.35) - (Number.isFinite(Number(primarySeat.z)) ? Number(primarySeat.z) : 1.2);
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
      })(),
      spl: {
        40: splAt(40), 57: splAt(57), 70: splAt(70),
        80: splAt(80), 85: splAt(85), 90: splAt(90), 100: splAt(100),
      },
    };
  }, [roomDims, subsForSimulation, seatingPositions, multiSeries]);

  // Derived REW sub-to-listener distance
  const rewSubToListenerDist = useMemo(() => {
    const sx = toNum(fields.rewSubX), sy = toNum(fields.rewSubY), sz = toNum(fields.rewSubZ);
    const lx = toNum(fields.rewListenerX), ly = toNum(fields.rewListenerY), lz = toNum(fields.rewListenerZ);
    if (sx === null || sy === null || sz === null || lx === null || ly === null || lz === null) return null;
    return Math.sqrt((sx-lx)**2 + (sy-ly)**2 + (sz-lz)**2);
  }, [fields.rewSubX, fields.rewSubY, fields.rewSubZ, fields.rewListenerX, fields.rewListenerY, fields.rewListenerZ]);

  // Geometry checks
  const geoChecks = {
    width:  matchCheck(fields.rewRoomWidth,  b44.roomWidth,  0.01),
    length: matchCheck(fields.rewRoomLength, b44.roomLength, 0.01),
    height: matchCheck(fields.rewRoomHeight, b44.roomHeight, 0.01),
    subX:   matchCheck(fields.rewSubX,   b44.subX,   0.01),
    subY:   matchCheck(fields.rewSubY,   b44.subY,   0.01),
    subZ:   matchCheck(fields.rewSubZ,   b44.subZ,   0.02),
    listX:  matchCheck(fields.rewListenerX, b44.listenerX, 0.01),
    listY:  matchCheck(fields.rewListenerY, b44.listenerY, 0.01),
    listZ:  matchCheck(fields.rewListenerZ, b44.listenerZ, 0.02),
  };
  const distCheck = matchCheck(
    rewSubToListenerDist !== null ? rewSubToListenerDist.toFixed(4) : '',
    b44.subToListenerDist, 0.05
  );

  // Geometry overall pass: all non-null checks must pass
  const geoNonNull = Object.values(geoChecks).filter(v => v !== null);
  const geoOverallPass = geoNonNull.length > 0 && geoNonNull.every(Boolean);
  const geoComplete = geoNonNull.length === Object.keys(geoChecks).length;

  // Source level check — tolerance ±1 dB
  const sourceLevelCheck = matchCheck(fields.rewSourceSpl, 94, 1); // 94 = flat_rew_reference

  // Confidence mapping
  const CONFIDENCE = {
    csv_export:    { label: 'High',   color: '#065f46', bg: '#dcfce7', desc: 'CSV / exported data' },
    manual_table:  { label: 'Medium', color: '#92400e', bg: '#fef3c7', desc: 'Manually typed from REW table' },
    screenshot:    { label: 'Low',    color: '#991b1b', bg: '#fee2e2', desc: 'Read from screenshot / graph' },
  };
  const conf = CONFIDENCE[fields.rewDataSource] || CONFIDENCE.screenshot;

  // Completeness: required fields for a like-for-like claim
  const requiredFields = [
    fields.rewRoomWidth, fields.rewRoomLength, fields.rewRoomHeight,
    fields.rewSubX, fields.rewSubY, fields.rewSubZ,
    fields.rewListenerX, fields.rewListenerY, fields.rewListenerZ,
    fields.rewSpl40, fields.rewSpl57, fields.rewSpl80,
  ];
  const allRequiredPresent = requiredFields.every(f => f !== '' && f !== null && f !== undefined);

  // Verdict
  const verdict = (() => {
    if (fields.rewDataSource === 'screenshot') {
      return { text: 'Do not use this benchmark for final parity claims.', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
    }
    if (!allRequiredPresent) {
      return { text: 'Benchmark is not like-for-like yet — fill in all required fields.', color: '#92400e', bg: '#fef3c7', border: '#fde68a' };
    }
    if (!geoOverallPass) {
      return { text: 'Geometry mismatch detected — verify REW room and source coordinates.', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
    }
    return { text: 'Benchmark is traceable and safe for parity comparison.', color: '#065f46', bg: '#dcfce7', border: '#86efac' };
  })();

  const thStyle = { fontSize: 9, fontWeight: 700, color: '#6b7280', padding: '2px 6px', textAlign: 'left', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' };
  const tdStyle = { fontSize: 10, fontFamily: 'monospace', padding: '2px 6px' };
  const tdRStyle = { ...tdStyle, textAlign: 'right' };

  const SPL_FREQS = [
    { hz: 40,  key: 'rewSpl40'  },
    { hz: 57,  key: 'rewSpl57'  },
    { hz: 70,  key: 'rewSpl70'  },
    { hz: 80,  key: 'rewSpl80'  },
    { hz: 85,  key: 'rewSpl85'  },
    { hz: 90,  key: 'rewSpl90'  },
    { hz: 100, key: 'rewSpl100' },
  ];

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 10 }}>

      {/* Verdict banner */}
      <div style={{
        padding: '6px 10px', borderRadius: 6, marginBottom: 10,
        background: verdict.bg, border: `1px solid ${verdict.border}`,
        color: verdict.color, fontWeight: 700, fontSize: 11,
      }}>
        {verdict.text}
      </div>

      {/* Confidence + source selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 10, color: '#374151' }}>Benchmark data source:</label>
        <select
          value={fields.rewDataSource}
          onChange={e => set('rewDataSource', e.target.value)}
          style={{ fontSize: 10, fontFamily: 'monospace', border: '1px solid #D1D5DB', borderRadius: 4, padding: '2px 6px', background: '#fff' }}
        >
          <option value="csv_export">CSV / exported data</option>
          <option value="manual_table">Manually typed from REW table</option>
          <option value="screenshot">Read from screenshot / graph</option>
        </select>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: conf.bg, color: conf.color }}>
          Confidence: {conf.label} — {conf.desc}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>

        {/* ── LEFT: Input forms ── */}
        <div>

          <SectionHeading label="1. Room dimensions" color="#1e3a5f" bg="#eff6ff" border="#bfdbfe" />
          <FieldRow label="Width"  value={fields.rewRoomWidth}  onChange={v => set('rewRoomWidth', v)}  placeholder="e.g. 4.80" unit="m" />
          <FieldRow label="Length" value={fields.rewRoomLength} onChange={v => set('rewRoomLength', v)} placeholder="e.g. 6.00" unit="m" />
          <FieldRow label="Height" value={fields.rewRoomHeight} onChange={v => set('rewRoomHeight', v)} placeholder="e.g. 2.70" unit="m" />

          <SectionHeading label="2. Sub / source" color="#3f6212" bg="#f7fee7" border="#d9f99d" />
          <FieldRow label="Sub X"         value={fields.rewSubX}       onChange={v => set('rewSubX', v)}       placeholder="e.g. 1.60" unit="m" />
          <FieldRow label="Sub Y"         value={fields.rewSubY}       onChange={v => set('rewSubY', v)}       placeholder="e.g. 0.15" unit="m" />
          <FieldRow label="Sub Z"         value={fields.rewSubZ}       onChange={v => set('rewSubZ', v)}       placeholder="e.g. 0.35" unit="m" />
          <FieldRow label="Source SPL"    value={fields.rewSourceSpl}  onChange={v => set('rewSourceSpl', v)}  placeholder="e.g. 94"   unit="dB" />
          <FieldRow label="Phase/polarity" value={fields.rewSourcePhase} onChange={v => set('rewSourcePhase', v)} placeholder="e.g. 0°" unit="" type="text" />

          <SectionHeading label="3. Listener / seat" color="#6d28d9" bg="#f5f3ff" border="#c4b5fd" />
          <FieldRow label="Listener X" value={fields.rewListenerX} onChange={v => set('rewListenerX', v)} placeholder="e.g. 2.40" unit="m" />
          <FieldRow label="Listener Y" value={fields.rewListenerY} onChange={v => set('rewListenerY', v)} placeholder="e.g. 3.20" unit="m" />
          <FieldRow label="Listener Z" value={fields.rewListenerZ} onChange={v => set('rewListenerZ', v)} placeholder="e.g. 1.20" unit="m" />

          <SectionHeading label="4. REW settings" color="#92400e" bg="#fffbeb" border="#fde68a" />
          <FieldRow label="Wall model"   value={fields.rewWallModel}    onChange={v => set('rewWallModel', v)}    placeholder="e.g. rigid / 0.30 abs" type="text" />
          <FieldRow label="Modal Q"      value={fields.rewModalQ}       onChange={v => set('rewModalQ', v)}       placeholder="e.g. 4.0" />
          <FieldRow label="Smoothing"    value={fields.rewSmoothing}    onChange={v => set('rewSmoothing', v)}    placeholder="e.g. none / 1/6 oct" type="text" />
          <FieldRow label="Freq points"  value={fields.rewFreqPoints}   onChange={v => set('rewFreqPoints', v)}   placeholder="e.g. 1000" />

        </div>

        {/* ── RIGHT: Benchmark SPL + comparison ── */}
        <div>

          <SectionHeading label="5. Benchmark SPL values (REW)" color="#991b1b" bg="#fef2f2" border="#fca5a5" />
          {SPL_FREQS.map(({ hz, key }) => (
            <FieldRow
              key={key}
              label={`${hz} Hz`}
              value={fields[key]}
              onChange={v => set(key, v)}
              placeholder="dB"
              unit="dB"
            />
          ))}

          {/* ── Comparison table ── */}
          <SectionHeading label="B44 vs REW comparison" color="#334155" bg="#f8fafc" border="#CBD5E1" />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Parameter</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>REW</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>B44</th>
                  <th style={thStyle}>Match</th>
                </tr>
              </thead>
              <tbody>
                {/* Geometry rows */}
                {[
                  { label: 'Room width',  rew: fields.rewRoomWidth,  b44: b44.roomWidth,  check: geoChecks.width,  unit: 'm' },
                  { label: 'Room length', rew: fields.rewRoomLength, b44: b44.roomLength, check: geoChecks.length, unit: 'm' },
                  { label: 'Room height', rew: fields.rewRoomHeight, b44: b44.roomHeight, check: geoChecks.height, unit: 'm' },
                  { label: 'Sub X',  rew: fields.rewSubX,  b44: b44.subX,  check: geoChecks.subX,  unit: 'm' },
                  { label: 'Sub Y',  rew: fields.rewSubY,  b44: b44.subY,  check: geoChecks.subY,  unit: 'm' },
                  { label: 'Sub Z',  rew: fields.rewSubZ,  b44: b44.subZ,  check: geoChecks.subZ,  unit: 'm' },
                  { label: 'Listener X', rew: fields.rewListenerX, b44: b44.listenerX, check: geoChecks.listX, unit: 'm' },
                  { label: 'Listener Y', rew: fields.rewListenerY, b44: b44.listenerY, check: geoChecks.listY, unit: 'm' },
                  { label: 'Listener Z', rew: fields.rewListenerZ, b44: b44.listenerZ, check: geoChecks.listZ, unit: 'm' },
                  { label: 'Sub→listener dist',
                    rew: rewSubToListenerDist !== null ? rewSubToListenerDist.toFixed(3) : '',
                    b44: b44.subToListenerDist,
                    check: distCheck,
                    unit: 'm' },
                  { label: 'Source SPL', rew: fields.rewSourceSpl, b44: 94, check: sourceLevelCheck, unit: 'dB' },
                ].map(({ label, rew, b44val, b44: b44v, check, unit }) => {
                  const rewNum = toNum(String(rew));
                  const b44num = Number.isFinite(b44v) ? b44v : null;
                  return (
                    <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>{label}</td>
                      <td style={tdRStyle}>{rewNum !== null ? rewNum.toFixed(3) : <span style={{ color: '#9ca3af' }}>—</span>} {unit}</td>
                      <td style={tdRStyle}>{b44num !== null ? b44num.toFixed(3) : <span style={{ color: '#9ca3af' }}>—</span>} {unit}</td>
                      <td style={{ ...tdStyle }}><Pill pass={check} /></td>
                    </tr>
                  );
                })}

                {/* SPL rows */}
                <tr><td colSpan={4} style={{ ...tdStyle, fontWeight: 700, color: '#991b1b', background: '#fef2f2', paddingTop: 6 }}>Benchmark SPL</td></tr>
                {SPL_FREQS.map(({ hz, key }) => {
                  const rewSpl = toNum(fields[key]);
                  const b44Spl = b44.spl[hz];
                  const diff = (rewSpl !== null && b44Spl !== null) ? b44Spl - rewSpl : null;
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid #fef2f2' }}>
                      <td style={tdStyle}>{hz} Hz</td>
                      <td style={tdRStyle}>{rewSpl !== null ? rewSpl.toFixed(1) : <span style={{ color: '#9ca3af' }}>—</span>} dB</td>
                      <td style={tdRStyle}>{b44Spl !== null ? b44Spl.toFixed(1) : <span style={{ color: '#9ca3af' }}>—</span>} dB</td>
                      <td style={tdStyle}>
                        {diff !== null ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: Math.abs(diff) > 3 ? '#991b1b' : Math.abs(diff) > 1.5 ? '#92400e' : '#065f46' }}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(1)} dB
                          </span>
                        ) : <span style={{ color: '#9ca3af', fontSize: 10 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Geometry overall */}
          <div style={{ marginTop: 8, padding: '5px 8px', borderRadius: 4, background: geoOverallPass ? '#dcfce7' : geoNonNull.length === 0 ? '#f1f5f9' : '#fee2e2', fontSize: 10, fontWeight: 700, color: geoOverallPass ? '#065f46' : geoNonNull.length === 0 ? '#64748b' : '#991b1b' }}>
            Geometry: {geoNonNull.length === 0 ? 'No REW data entered' : geoOverallPass ? '✓ All geometry matches' : `✗ ${geoNonNull.filter(v => !v).length} mismatch(es)`}
          </div>
          <div style={{ marginTop: 4, padding: '5px 8px', borderRadius: 4, background: distCheck === true ? '#dcfce7' : distCheck === false ? '#fee2e2' : '#f1f5f9', fontSize: 10, fontWeight: 700, color: distCheck === true ? '#065f46' : distCheck === false ? '#991b1b' : '#64748b' }}>
            Distance: {distCheck === null ? 'Unknown — enter sub and listener coordinates' : distCheck ? `✓ matches B44 (${fmt(b44.subToListenerDist)} m)` : `✗ REW ${fmt(rewSubToListenerDist)} m vs B44 ${fmt(b44.subToListenerDist)} m`}
          </div>

        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 9, color: '#9ca3af', borderTop: '1px solid #f3f4f6', paddingTop: 6 }}>
        Values are stored in browser localStorage. Do not infer or guess unknown fields — leave them blank.
      </div>
    </div>
  );
}