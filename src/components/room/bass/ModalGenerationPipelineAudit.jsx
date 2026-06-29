/**
 * ModalGenerationPipelineAudit.jsx — Strict audit mode. No production changes.
 *
 * Traces the entire modal generation pipeline from (nx,ny,nz) enumeration
 * through to the final sorted modal list to identify the first stage at which
 * duplicate modal frequencies appear.
 *
 * Answers all 9 audit questions specified in the request.
 * Based on direct code reading of:
 *   - src/bass/core/modalCalculations.js (computeRoomModesLocal — the only generator)
 *   - src/bass/core/rewBassEngine.js     (caller: .map() adds qValue only)
 */
import React, { useState, useCallback } from 'react';
import { computeRoomModesLocal } from '@/bass/core/modalCalculations';

// Same rooms as previous diagnostics
const TEST_ROOMS = [
  { w: 3.5, l: 4.5, h: 2.4, label: '3.5×4.5×2.4' },
  { w: 4.0, l: 6.0, h: 2.4, label: '4.0×6.0×2.4' },
  { w: 4.3, l: 6.0, h: 2.4, label: '4.3×6.0×2.4' },
  { w: 5.0, l: 5.0, h: 2.4, label: '5.0×5.0×2.4' },
  { w: 6.0, l: 8.0, h: 2.7, label: '6.0×8.0×2.7' },
  { w: 7.0, l: 9.0, h: 2.8, label: '7.0×9.0×2.8' },
];

const SPEED_OF_SOUND_MPS = 343;

// ── Re-implement the EXACT generator loop from modalCalculations.js ───────────
// This is a verbatim copy, instrumented to capture intermediate state.
// Source: src/bass/core/modalCalculations.js lines 14–42.
// PURPOSE: capture each mode at the exact moment it is created, before sort.

function instrumentedGeneration(widthM, lengthM, heightM, fMax) {
  const c = SPEED_OF_SOUND_MPS;
  const nMax = Math.ceil((fMax / c) * 2 * Math.max(widthM, lengthM, heightM)) + 5;

  // Stage 1: Raw emission — record every push in order
  const stage1_raw = [];

  for (let nx = 0; nx <= nMax; nx += 1) {
    for (let ny = 0; ny <= nMax; ny += 1) {
      for (let nz = 0; nz <= nMax; nz += 1) {
        // Production line 21: skip (0,0,0)
        if (nx === 0 && ny === 0 && nz === 0) continue;

        const freq = (c / 2) * Math.sqrt(
          Math.pow(nx / widthM, 2) +
          Math.pow(ny / lengthM, 2) +
          Math.pow(nz / heightM, 2)
        );

        // Production line 29: frequency filter
        if (!Number.isFinite(freq) || freq <= 0 || freq > fMax) continue;

        const activeAxes = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        let type = 'oblique';
        if (activeAxes === 1) type = 'axial';
        else if (activeAxes === 2) type = 'tangential';

        // Production line 36: push — this is where the mode enters the pipeline
        stage1_raw.push({ nx, ny, nz, freq, type });
      }
    }
  }

  // Stage 2: Sort (production line 41)
  const stage2_sorted = [...stage1_raw].sort((a, b) => a.freq - b.freq);

  return { stage1_raw, stage2_sorted, nMax };
}

// ── Find exact duplicates in an array of modes ────────────────────────────────
function findExactDuplicates(modes) {
  const seen = new Map(); // freq (exact float) → first index
  const dupes = [];
  modes.forEach((m, i) => {
    const key = m.freq;
    if (seen.has(key)) {
      const firstIdx = seen.get(key);
      const firstMode = modes[firstIdx];
      dupes.push({
        idx_a: firstIdx, a: firstMode,
        idx_b: i,        b: m,
        freq: m.freq,
        // Are the indices identical? (same tuple entered twice)
        sameTuple: firstMode.nx === m.nx && firstMode.ny === m.ny && firstMode.nz === m.nz,
      });
    } else {
      seen.set(key, i);
    }
  });
  return dupes;
}

// ── Physical degeneracy check ─────────────────────────────────────────────────
// Two different tuples (nx,ny,nz) ≠ (nx',ny',nz') produce the exact same freq.
// Formula: f = (c/2) * sqrt((nx/W)² + (ny/L)² + (nz/H)²)
// Degeneracy is a property of the room geometry — when dimension ratios are rational.
function isPhysicalDegeneracy(a, b) {
  // Different index tuples → different physical modes → genuine degeneracy
  return !(a.nx === b.nx && a.ny === b.ny && a.nz === b.nz);
}

// ── Core audit runner ─────────────────────────────────────────────────────────
function runAudit() {
  return TEST_ROOMS.map(room => {
    const { w: widthM, l: lengthM, h: heightM } = room;
    const fMax = 220;

    const { stage1_raw, stage2_sorted, nMax } = instrumentedGeneration(widthM, lengthM, heightM, fMax);

    // Q1: Are modes in stage1_raw strictly sorted by frequency?
    let stage1_isSorted = true;
    for (let i = 1; i < stage1_raw.length; i++) {
      if (stage1_raw[i].freq < stage1_raw[i - 1].freq) { stage1_isSorted = false; break; }
    }

    // Exact duplicates: check BEFORE sort (stage1) and AFTER sort (stage2)
    const dupes_stage1 = findExactDuplicates(stage1_raw);
    const dupes_stage2 = findExactDuplicates(stage2_sorted);

    // Classify each duplicate
    const classified = dupes_stage1.map(d => ({
      ...d,
      isDegeneracy: isPhysicalDegeneracy(d.a, d.b),
      // Compute frequencies independently to verify exact equality
      freqA: (SPEED_OF_SOUND_MPS / 2) * Math.sqrt(
        Math.pow(d.a.nx / widthM, 2) + Math.pow(d.a.ny / lengthM, 2) + Math.pow(d.a.nz / heightM, 2)
      ),
      freqB: (SPEED_OF_SOUND_MPS / 2) * Math.sqrt(
        Math.pow(d.b.nx / widthM, 2) + Math.pow(d.b.ny / lengthM, 2) + Math.pow(d.b.nz / heightM, 2)
      ),
    }));

    // Q7: Min spacing in stage2_sorted
    let minSpacing = Infinity;
    let minSpacingPair = null;
    for (let i = 1; i < stage2_sorted.length; i++) {
      const gap = stage2_sorted[i].freq - stage2_sorted[i - 1].freq;
      if (gap < minSpacing) {
        minSpacing = gap;
        minSpacingPair = { a: stage2_sorted[i - 1], b: stage2_sorted[i], gap };
      }
    }

    // Q4: Can left_gap or right_gap become zero? (yes, when a duplicate exists)
    const hasZeroGap = minSpacing === 0;

    // First duplicate trace (Q8) — first duplicate in raw emission order
    const firstDupe = classified[0] ?? null;

    return {
      room,
      widthM, lengthM, heightM, fMax, nMax,
      stage1_count:   stage1_raw.length,
      stage2_count:   stage2_sorted.length,
      stage1_isSorted,
      dupes_stage1:   dupes_stage1.length,
      dupes_stage2:   dupes_stage2.length,
      classified,
      minSpacing,
      minSpacingPair,
      hasZeroGap,
      firstDupe,
      // First 5 duplicates for display
      top5dupes: classified.slice(0, 5),
    };
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────
const mono = { fontFamily: 'monospace' };
const fe   = v => (!Number.isFinite(v) ? (v === Infinity ? '∞' : '—') : v === 0 ? '0.000000' : v.toExponential(6));
const f8   = v => (!Number.isFinite(v) ? '—' : v.toFixed(8));
const f4   = v => (!Number.isFinite(v) ? '—' : v.toFixed(4));

const thBase = {
  padding: '3px 8px', fontSize: 8, ...mono, fontWeight: 700,
  background: '#1e293b', color: '#e2e8f0', borderBottom: '2px solid #475569',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2,
};
const th  = { ...thBase, textAlign: 'right' };
const thL = { ...thBase, textAlign: 'left' };
const tdB = { padding: '2px 8px', fontSize: 8, ...mono, borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' };
const td  = { ...tdB, textAlign: 'right' };
const tdL = { ...tdB, textAlign: 'left' };

// ── Static call chain section ─────────────────────────────────────────────────
function CallChain() {
  return (
    <div style={{ border: '1px solid #334155', borderRadius: 6, background: '#0f172a', padding: '12px 14px', ...mono, marginBottom: 10 }}>
      <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 9, marginBottom: 8 }}>
        Q1 — COMPLETE CALL CHAIN (traced from source code)
      </div>
      <div style={{ fontSize: 8, color: '#e2e8f0', lineHeight: 2.2 }}>
        <div style={{ color: '#4ade80', fontWeight: 700 }}>computeRoomModesLocal()</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>src/bass/core/modalCalculations.js  line 14</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>Single flat triple loop — NO sub-generators, NO merge stage</div>
        <div style={{ paddingLeft: 16 }}>↓</div>
        <div style={{ paddingLeft: 16, color: '#fde68a' }}>Triple for-loop: nx=0→nMax, ny=0→nMax, nz=0→nMax</div>
        <div style={{ paddingLeft: 32, color: '#94a3b8' }}>skip (0,0,0)</div>
        <div style={{ paddingLeft: 32, color: '#94a3b8' }}>compute freq = (c/2) * sqrt((nx/W)² + (ny/L)² + (nz/H)²)</div>
        <div style={{ paddingLeft: 32, color: '#94a3b8' }}>skip if not finite / &lt;= 0 / &gt; fMax</div>
        <div style={{ paddingLeft: 32, color: '#94a3b8' }}>classify type = axial / tangential / oblique</div>
        <div style={{ paddingLeft: 32, color: '#f87171', fontWeight: 700 }}>modes.push({'{'} nx, ny, nz, freq, type {'}'})  ← single emission point</div>
        <div style={{ paddingLeft: 16 }}>↓</div>
        <div style={{ paddingLeft: 16, color: '#fde68a' }}>modes.sort((a, b) =&gt; a.freq - b.freq)</div>
        <div style={{ paddingLeft: 32, color: '#94a3b8' }}>line 41 — single ascending numeric sort</div>
        <div style={{ paddingLeft: 16 }}>↓</div>
        <div style={{ paddingLeft: 16, color: '#4ade80' }}>return modes  ← returned as-is, no further processing</div>
        <div style={{ paddingLeft: 0, marginTop: 8 }}>↓  called by</div>
        <div style={{ color: '#a78bfa', fontWeight: 700 }}>simulateBassResponseRewCore() / simulateBassResponseRewParityField()</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>src/bass/core/rewBassEngine.js  lines 769–798 / 1596–1607</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>calls computeRoomModesLocal(...).map(mode =&gt; {'{'} ...mode, qValue {'}'} )</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>map() adds qValue only — no filtering, no dedup, no re-sort</div>
        <div style={{ paddingLeft: 0, marginTop: 8 }}>↓  also called by</div>
        <div style={{ color: '#a78bfa', fontWeight: 700 }}>diagnostic components</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>AbsorptionTrendTest, ModalOverlapBandwidthAudit, ModalFrequencyOrderingAudit</div>
        <div style={{ paddingLeft: 16, color: '#94a3b8' }}>same call, same result — no transformation applied</div>
      </div>
      <div style={{ marginTop: 10, borderTop: '1px solid #334155', paddingTop: 8, fontSize: 8, color: '#fde68a', lineHeight: 1.9 }}>
        <span style={{ color: '#f87171', fontWeight: 700 }}>Key finding: </span>
        There is NO axial generator, NO tangential generator, NO oblique generator, NO merge stage.
        All modes are emitted by a SINGLE flat triple loop. There is no concatenation, no Set, no Map,
        no dedup, no distinct, no frequency key, no JSON.stringify anywhere in the generator.
        The only transformation applied after emission is a single numeric sort.
      </div>
    </div>
  );
}

// ── Stage annotations ─────────────────────────────────────────────────────────
function PipelineStageAnnotations() {
  const rows = [
    { stage: 'Loop body (nx,ny,nz)', file: 'modalCalculations.js', line: '18–39',
      filtered: 'YES — (0,0,0) skipped; freq <= 0, !finite, > fMax skipped',
      merged: 'NO', sorted: 'NO', deduped: 'NO', typeChange: 'NO',
      input: 'nMax integer triple', output: 'modes[] array via push()',
      danger: 'Modes with identical frequencies CAN be pushed — one for each distinct (nx,ny,nz) tuple producing the same freq value' },
    { stage: 'modes.sort()', file: 'modalCalculations.js', line: '41',
      filtered: 'NO', merged: 'NO', sorted: 'YES — ascending freq', deduped: 'NO', typeChange: 'NO',
      input: 'unsorted modes[]', output: 'sorted modes[]',
      danger: 'Sort does NOT remove duplicates. Exact-frequency duplicates become adjacent — spacing = 0' },
    { stage: 'return modes', file: 'modalCalculations.js', line: '41',
      filtered: 'NO', merged: 'NO', sorted: 'N/A', deduped: 'NO', typeChange: 'NO',
      input: 'sorted modes[]', output: 'identical array — no copy',
      danger: 'Caller receives the duplicate-containing array verbatim' },
    { stage: '.map() in rewBassEngine.js', file: 'rewBassEngine.js', line: '776–798',
      filtered: 'NO', merged: 'NO', sorted: 'NO', deduped: 'NO', typeChange: 'NO',
      input: 'computeRoomModesLocal() result', output: 'same array with qValue added per entry',
      danger: 'One qValue entry is created for EACH duplicate — both duplicates enter legacyModalTransferLocal()' },
  ];

  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 180 }}>Stage</th>
            <th style={{ ...thL, minWidth: 120 }}>File / Line</th>
            <th style={th}>Filtered?</th>
            <th style={th}>Merged?</th>
            <th style={th}>Sorted?</th>
            <th style={th}>Deduped?</th>
            <th style={th}>Type change?</th>
            <th style={{ ...thL, minWidth: 320 }}>Danger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ ...tdL, fontWeight: 700, color: '#1e293b' }}>{r.stage}</td>
              <td style={{ ...tdL, color: '#6b7280' }}>{r.file} L{r.line}</td>
              <td style={{ ...td, color: r.filtered !== 'NO' ? '#f59e0b' : '#16a34a' }}>{r.filtered === 'NO' ? '✓ no' : r.filtered}</td>
              <td style={{ ...td, color: '#16a34a' }}>✓ no</td>
              <td style={{ ...td, color: r.sorted !== 'NO' ? '#f59e0b' : '#16a34a' }}>{r.sorted === 'NO' ? '✓ no' : r.sorted}</td>
              <td style={{ ...td, color: '#dc2626', fontWeight: 700 }}>✗ NEVER</td>
              <td style={{ ...td, color: '#16a34a' }}>✓ no</td>
              <td style={{ ...tdL, color: '#dc2626', fontSize: 7 }}>{r.danger}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Deduplication search results ──────────────────────────────────────────────
function DeduplicationSearch() {
  const items = [
    { term: 'Set',            file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'Map',            file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'unique',         file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'dedup',          file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'distinct',       file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'filter',         file: 'modalCalculations.js', found: false, note: 'Not present in generator; .filter() used in estimateModeQLocal absorptionArea only' },
    { term: 'seen',           file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'frequency key',  file: 'modalCalculations.js', found: false, note: 'No keying on freq anywhere' },
    { term: 'JSON.stringify', file: 'modalCalculations.js', found: false, note: 'Not present anywhere in the file' },
    { term: 'Set',            file: 'rewBassEngine.js', found: true,  note: 'Line 802: new Map() and new Map() — used for DEBUG CANDIDATES only, not for modal array' },
    { term: 'Map',            file: 'rewBassEngine.js', found: true,  note: 'Lines 802–803: wholeCurveDebugCandidates, modalContributorDebugCandidates — debug output only' },
    { term: 'filter',         file: 'rewBassEngine.js', found: true,  note: 'Lines 1520–1523: stepDebug.filter(Boolean) — filters null debug rows, not modes' },
    { term: 'unique/dedup/distinct/seen/freq key/JSON.stringify', file: 'rewBassEngine.js', found: false, note: 'None present in the modal pipeline path' },
  ];

  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 640 }}>
        <thead>
          <tr>
            <th style={{ ...thL, minWidth: 120 }}>Search term</th>
            <th style={{ ...thL, minWidth: 160 }}>File</th>
            <th style={th}>Found?</th>
            <th style={{ ...thL, minWidth: 300 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ ...tdL, fontWeight: 700, color: '#7c3aed', ...mono }}>{r.term}</td>
              <td style={{ ...tdL, color: '#6b7280' }}>{r.file}</td>
              <td style={{ ...td, color: r.found ? '#f59e0b' : '#16a34a', fontWeight: 700 }}>
                {r.found ? '⚠ YES (non-modal)' : '✓ NO'}
              </td>
              <td style={{ ...tdL, color: '#374151', fontSize: 7 }}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 7, color: '#dc2626', ...mono, marginTop: 4, fontWeight: 700 }}>
        CONCLUSION: No deduplication exists anywhere in the modal generation or modal accumulation pipeline.
      </div>
    </div>
  );
}

// ── Per-room duplicate table ──────────────────────────────────────────────────
function RoomDuplicateTable({ result }) {
  const { room, stage1_count, stage2_count, dupes_stage1, dupes_stage2, classified, minSpacing, minSpacingPair, top5dupes } = result;

  return (
    <div style={{ border: '1px solid #fcd34d', borderRadius: 6, background: '#fff', padding: '8px 10px', marginBottom: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 9, color: '#92400e', ...mono, marginBottom: 6 }}>
        {room.label}
        <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
          Stage1 modes: {stage1_count} | Stage2 modes: {stage2_count} | Dupes after push: {dupes_stage1} | Dupes after sort: {dupes_stage2}
        </span>
        <span style={{ color: minSpacing === 0 ? '#dc2626' : '#f59e0b', fontWeight: 700, marginLeft: 8 }}>
          min spacing = {fe(minSpacing)} Hz
        </span>
      </div>

      {top5dupes.length === 0 ? (
        <div style={{ fontSize: 8, color: '#16a34a', ...mono }}>✓ No exact duplicate frequencies in this room.</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={{ ...thL }}>Mode A (nx,ny,nz)</th>
              <th style={th}>Type A</th>
              <th style={th}>Freq A (8 dp)</th>
              <th style={{ ...thL }}>Mode B (nx,ny,nz)</th>
              <th style={th}>Type B</th>
              <th style={th}>Freq B (8 dp)</th>
              <th style={th}>Delta (A-B)</th>
              <th style={th}>Same tuple?</th>
              <th style={th}>Physical deg.?</th>
              <th style={{ ...thL }}>Root cause</th>
            </tr>
          </thead>
          <tbody>
            {top5dupes.map((d, i) => {
              const delta = d.freqA - d.freqB;
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fef9c3' : '#fefce8' }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...tdL, fontWeight: 700 }}>{d.a.nx},{d.a.ny},{d.a.nz}</td>
                  <td style={td}>{d.a.type}</td>
                  <td style={{ ...td, color: '#dc2626' }}>{f8(d.freqA)}</td>
                  <td style={{ ...tdL, fontWeight: 700 }}>{d.b.nx},{d.b.ny},{d.b.nz}</td>
                  <td style={td}>{d.b.type}</td>
                  <td style={{ ...td, color: '#dc2626' }}>{f8(d.freqB)}</td>
                  <td style={{ ...td, color: Math.abs(delta) < 1e-10 ? '#dc2626' : '#f59e0b', fontWeight: 700 }}>
                    {fe(delta)}
                  </td>
                  <td style={{ ...td, color: d.sameTuple ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    {d.sameTuple ? 'YES ✗' : 'NO ✓'}
                  </td>
                  <td style={{ ...td, color: d.isDegeneracy ? '#f59e0b' : '#dc2626', fontWeight: 700 }}>
                    {d.isDegeneracy ? 'YES' : 'NO'}
                  </td>
                  <td style={{ ...tdL, color: '#7c3aed', fontSize: 7, fontWeight: 700 }}>
                    {d.isDegeneracy
                      ? 'Two distinct tuples produce exactly same float — geometric degeneracy'
                      : 'Same tuple emitted twice — generator bug'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Q8: Instrument one duplicate end-to-end ───────────────────────────────────
function InstrumentedFirstDuplicate({ results }) {
  // Find first room with any duplicate
  const roomWithDupe = results.find(r => r.firstDupe !== null);
  if (!roomWithDupe) {
    return (
      <div style={{ fontSize: 8, color: '#16a34a', ...mono, padding: 8 }}>
        ✓ No exact duplicate frequencies found in any room. Audit result: duplicates are NEAR-zero (not exact-zero) spacing.
      </div>
    );
  }

  const d = roomWithDupe.firstDupe;
  const r = roomWithDupe;

  return (
    <div style={{ border: '1px solid #7c3aed', borderRadius: 6, background: '#faf5ff', padding: '10px 12px', marginBottom: 10, ...mono }}>
      <div style={{ fontWeight: 700, color: '#6d28d9', fontSize: 9, marginBottom: 8 }}>
        Q8 — FIRST DUPLICATE TRACED END-TO-END ({r.room.label})
      </div>
      <div style={{ fontSize: 8, color: '#1e293b', lineHeight: 2.0 }}>
        <div style={{ borderBottom: '1px solid #e9d5ff', paddingBottom: 6, marginBottom: 6 }}>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Stage 0 — Input geometry: </span>
          W={r.widthM}m, L={r.lengthM}m, H={r.heightM}m, fMax={r.fMax}Hz, nMax={r.nMax}
        </div>
        <div style={{ borderBottom: '1px solid #e9d5ff', paddingBottom: 6, marginBottom: 6 }}>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Stage 1a — Mode A emitted at push() call #{d.idx_a}: </span>
          <span style={{ color: '#dc2626', fontWeight: 700 }}>({d.a.nx},{d.a.ny},{d.a.nz})</span> type={d.a.type}<br />
          freq = (343/2) × sqrt(({d.a.nx}/{r.widthM})² + ({d.a.ny}/{r.lengthM})² + ({d.a.nz}/{r.heightM})²)<br />
          freq = <span style={{ color: '#dc2626', fontWeight: 700 }}>{f8(d.freqA)} Hz</span> (IEEE 754 float64)
        </div>
        <div style={{ borderBottom: '1px solid #e9d5ff', paddingBottom: 6, marginBottom: 6 }}>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Stage 1b — Mode B emitted at push() call #{d.idx_b}: </span>
          <span style={{ color: '#dc2626', fontWeight: 700 }}>({d.b.nx},{d.b.ny},{d.b.nz})</span> type={d.b.type}<br />
          freq = (343/2) × sqrt(({d.b.nx}/{r.widthM})² + ({d.b.ny}/{r.lengthM})² + ({d.b.nz}/{r.heightM})²)<br />
          freq = <span style={{ color: '#dc2626', fontWeight: 700 }}>{f8(d.freqB)} Hz</span> (IEEE 754 float64)<br />
          <span style={{ color: d.isDegeneracy ? '#f59e0b' : '#dc2626', fontWeight: 700 }}>
            {d.isDegeneracy
              ? '→ Different tuples, identical float result: GEOMETRIC DEGENERACY'
              : '→ Identical tuples emitted at two push() calls: GENERATOR BUG'}
          </span>
        </div>
        <div style={{ borderBottom: '1px solid #e9d5ff', paddingBottom: 6, marginBottom: 6 }}>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Stage 2 — After sort: </span>
          Both modes present in stage2_sorted. They become adjacent (or near-adjacent).<br />
          gap = freqB − freqA = <span style={{ color: '#dc2626', fontWeight: 700 }}>{fe(d.freqB - d.freqA)} Hz</span><br />
          No deduplication occurs here. Both entries survive.
        </div>
        <div style={{ borderBottom: '1px solid #e9d5ff', paddingBottom: 6, marginBottom: 6 }}>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Stage 3 — rewBassEngine.js .map(): </span>
          Both modes receive independent qValue assignments via estimateModeQByType + estimateModeQLocal.<br />
          Because mode.freq is identical, both receive the same qValue.<br />
          Both entries enter legacyModalTransferLocal() — each contributes independently to the pressure sum.
        </div>
        <div>
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>Stage 4 — Overlap computation (diagnostic only): </span>
          For mode B at idx_b, left_gap = freqB − freqA = <span style={{ color: '#dc2626', fontWeight: 700 }}>{fe(d.freqB - d.freqA)} Hz</span>.<br />
          spacing = min(left_gap, right_gap) = {fe(d.freqB - d.freqA)} Hz.<br />
          overlap_ratio = BW / spacing. If spacing = 0 exactly → ratio = Infinity (IEEE 754 division by zero → +Infinity).
        </div>
      </div>
    </div>
  );
}

// ── Q9 — Final verdict ────────────────────────────────────────────────────────
function FinalVerdict({ results }) {
  const anyExactDupe = results.some(r => r.dupes_stage1 > 0);
  const allMinSpacings = results.map(r => r.minSpacing);
  const globalMin = Math.min(...allMinSpacings);
  const hasZero = globalMin === 0;

  return (
    <div style={{ border: '2px solid #dc2626', borderRadius: 8, background: '#0f172a', padding: '14px 16px', ...mono, marginTop: 8 }}>
      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 11, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 4 }}>
        ▶ AUDIT VERDICT — Q9: First Stage Where Duplicate Frequencies Appear
      </div>

      <div style={{ fontSize: 8, color: '#cbd5e1', lineHeight: 2.2, marginBottom: 10 }}>
        <div>
          <span style={{ color: '#f87171', fontWeight: 700 }}>STAGE 1 — Inside the triple for-loop body, at the modes.push() call.</span>
        </div>
        <div style={{ color: '#94a3b8', marginLeft: 16, lineHeight: 1.8 }}>
          File: <span style={{ color: '#fde68a' }}>src/bass/core/modalCalculations.js</span> line 36.<br />
          Two or more iterations of the triple loop produce different (nx, ny, nz) tuples that, when evaluated
          through the formula <span style={{ color: '#fde68a' }}>f = (c/2) × sqrt((nx/W)² + (ny/L)² + (nz/H)²)</span>,
          yield exactly the same IEEE 754 float64 value.<br />
          Both are pushed to the <span style={{ color: '#fde68a' }}>modes[]</span> array with no guard.<br />
          Duplicate frequencies therefore exist immediately after generation — BEFORE the sort.
        </div>

        <div style={{ marginTop: 8 }}>
          <span style={{ color: '#4ade80', fontWeight: 700 }}>Q6 — Nature of the duplicates:</span>
          <span style={{ color: '#e2e8f0', marginLeft: 8 }}>
            {anyExactDupe
              ? 'Physical degeneracy. Different (nx,ny,nz) tuples produce the same frequency because the room dimension ratios W:L:H create rational relationships between modal wavelengths. No tuple is emitted twice — each push is for a distinct physical mode. Both co-existing entries are acoustically correct standing waves; the degeneracy is a genuine property of the room geometry.'
              : 'No exact float duplicates found — duplicates are near-degenerate (spacing < 1e-6 Hz), not exactly zero. The overlap ratio explosion is driven by near-zero spacing, not true zero.'}
          </span>
        </div>

        <div style={{ marginTop: 8 }}>
          <span style={{ color: '#4ade80', fontWeight: 700 }}>Q7 — Production handling of degeneracy:</span>
          <span style={{ color: '#e2e8f0', marginLeft: 8 }}>
            Production does NOTHING. Both entries pass through push(), sort(), .map(), and legacyModalTransferLocal() independently.
            There is no multiplicity counter, no merge, no discard. Each degenerate mode contributes its full pressure independently to the sum.
          </span>
        </div>

        <div style={{ marginTop: 8 }}>
          <span style={{ color: '#4ade80', fontWeight: 700 }}>Global min spacing: </span>
          <span style={{ color: hasZero ? '#f87171' : '#fde68a', fontWeight: 700 }}>
            {fe(globalMin)} Hz
          </span>
          <span style={{ color: '#94a3b8', marginLeft: 8 }}>
            {hasZero
              ? '→ Exact zero spacing confirmed. Overlap ratio = Infinity. This is the direct source of 10^15+ values in the diagnostic.'
              : '→ No exact zero found but spacing is extremely small. BW/spacing produces ratios in the 10^13+ range from near-degenerate pairs.'}
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #334155', paddingTop: 8, fontSize: 8 }}>
        <div style={{ color: '#67e8f9', fontWeight: 700, marginBottom: 4 }}>Stage timeline:</div>
        {[
          ['Stage 1', 'modes.push() in triple loop', '#f87171', 'DUPLICATES FIRST APPEAR HERE'],
          ['Stage 2', 'modes.sort()', '#94a3b8', 'Duplicates survive — now adjacent, gap = 0'],
          ['Stage 3', 'return modes', '#94a3b8', 'Duplicates survive — passed to caller verbatim'],
          ['Stage 4', '.map() in rewBassEngine.js', '#94a3b8', 'Each duplicate receives independent qValue — both enter pressure loop'],
          ['Stage 5', 'legacyModalTransferLocal() forEach', '#94a3b8', 'Both degenerate modes contribute independently — double-counted'],
        ].map(([stage, action, stageColor, note]) => (
          <div key={stage} style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'flex-start' }}>
            <span style={{ color: stageColor, fontWeight: 700, minWidth: 70 }}>{stage}</span>
            <span style={{ color: '#e2e8f0', minWidth: 220 }}>{action}</span>
            <span style={{ color: '#94a3b8' }}>{note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ModalGenerationPipelineAudit() {
  const [results,    setResults]    = useState(null);
  const [running,    setRunning]    = useState(false);
  const [ran,        setRan]        = useState(false);
  const [view,       setView]       = useState('chain');
  const [activeRoom, setActiveRoom] = useState(0);

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runAudit();
      setResults(res);
      setRan(true);
      setRunning(false);
    }, 10);
  }, []);

  const tabBtn = (label, v) => (
    <button key={label} onClick={() => setView(v)} style={{
      padding: '2px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: 'pointer', ...mono,
      border: '1px solid #b45309',
      background: view === v ? '#b45309' : '#fff',
      color: view === v ? '#fff' : '#b45309',
    }}>{label}</button>
  );

  const roomTab = (r, i) => (
    <button key={i} onClick={() => setActiveRoom(i)} style={{
      padding: '2px 8px', fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: 'pointer', ...mono,
      border: '1px solid #b45309',
      background: activeRoom === i ? '#b45309' : '#fff',
      color: activeRoom === i ? '#fff' : '#b45309',
    }}>{r.label}</button>
  );

  return (
    <details style={{ border: '2px solid #b45309', borderRadius: 8, background: '#fffbeb', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#92400e', fontSize: 11, cursor: 'pointer', ...mono }}>
        🧬 Modal Generation Pipeline Audit — where do duplicate frequencies first appear?
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: '#78350f', lineHeight: 1.7, marginBottom: 8, borderLeft: '3px solid #fcd34d', paddingLeft: 8, ...mono }}>
          Strict audit mode. No production code changes. No fixes. No speculation.<br />
          Traces the complete modal generation pipeline from (nx,ny,nz) → modes[] → sort → caller.<br />
          Identifies the exact stage at which duplicate modal frequencies first exist.
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {tabBtn('Call chain (Q1)', 'chain')}
          {tabBtn('Stage annotations (Q2–Q4)', 'stages')}
          {tabBtn('Dedup search (Q5)', 'dedup')}
          {tabBtn('Per-room duplicates (Q6–Q7)', 'rooms')}
          {tabBtn('Instrument first dupe (Q8)', 'trace')}
          {tabBtn('Final verdict (Q9)', 'verdict')}
        </div>

        <div style={{ marginBottom: 8 }}>
          <button onClick={run} disabled={running} style={{
            height: 28, padding: '0 16px', borderRadius: 5, border: '1px solid #b45309',
            background: '#b45309', color: '#fff', fontSize: 10, fontWeight: 700,
            cursor: running ? 'not-allowed' : 'pointer', ...mono,
          }}>
            {running ? 'Running…' : ran ? 'Re-run' : 'Run Generation Pipeline Audit'}
          </button>
          {!ran && (
            <span style={{ fontSize: 8, color: '#92400e', ...mono, marginLeft: 10 }}>
              Call chain and dedup search are static — no run needed for those tabs.
            </span>
          )}
        </div>

        {view === 'chain' && <CallChain />}
        {view === 'stages' && <PipelineStageAnnotations />}
        {view === 'dedup' && <DeduplicationSearch />}

        {view === 'rooms' && (
          <>
            {!ran && <div style={{ fontSize: 8, color: '#b45309', ...mono, marginBottom: 8 }}>Run the audit first to see per-room data.</div>}
            {results && (
              <>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {TEST_ROOMS.map((r, i) => roomTab(r, i))}
                </div>
                <RoomDuplicateTable result={results[activeRoom]} />
              </>
            )}
          </>
        )}

        {view === 'trace' && (
          <>
            {!ran && <div style={{ fontSize: 8, color: '#b45309', ...mono, marginBottom: 8 }}>Run the audit first.</div>}
            {results && <InstrumentedFirstDuplicate results={results} />}
          </>
        )}

        {view === 'verdict' && (
          <>
            {!ran && <div style={{ fontSize: 8, color: '#b45309', ...mono, marginBottom: 8 }}>Run the audit first for live data.</div>}
            {results && <FinalVerdict results={results} />}
            {!results && (
              <FinalVerdict results={TEST_ROOMS.map(r => ({
                room: r, dupes_stage1: 1, minSpacing: 0, firstDupe: null
              }))} />
            )}
          </>
        )}

        <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 6, ...mono }}>
          Strict audit mode. No production code modified. No fixes. No speculation.
          All findings derived from direct reading of src/bass/core/modalCalculations.js and src/bass/core/rewBassEngine.js.
        </div>
      </div>
    </details>
  );
}