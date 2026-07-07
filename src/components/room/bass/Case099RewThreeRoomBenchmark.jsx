// Case 099 — Three-Room REW Marker Benchmark Panel (Temporary, Read-Only)
//
// READ-ONLY forensic benchmark panel. No engine modifications, no production
// changes, no graph modifications, no parameter writes, no live project state consumed.
//
// Runs the B44 engine (simulateBassResponseRewCore) in isolation against THREE
// fixed reference rooms and compares the output to manually captured REW markers.
//
// For each room we run TWO strategies:
//   A — Production (qStrategy 'production' — smooth soft-cap, legacy direct+modal)
//   B — A&B corrected (+ √V reconciliation + 70–120 Hz 1.5× Q boost) — automatically
//        applied inside the engine when qStrategy === 'ab_corrected'.
//
// Reports per-marker: REW SPL, Production SPL, Production delta, A&B SPL, A&B delta,
//         winner per marker.
// Reports per-room:   RMS error, max error, mean signed error, correlation, winner.
// Reports global:     total markers, average RMS, average max error, marker wins,
//                     room wins, and a single FINAL VERDICT.
//
// Temporary — removable once the A&B vs Production evidence is no longer needed.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";

// ── Flat source curve: 94 dB across the full benchmark range (10–200 Hz) ──
// Matches a flat REW Room Simulator reference output (no low-frequency roll-off).
const SOURCE_CURVE = [
  { hz: 10, db: 94 },
  { hz: 20, db: 94 },
  { hz: 50, db: 94 },
  { hz: 100, db: 94 },
  { hz: 200, db: 94 },
];

const SURFACE_ABSORPTION = {
  front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30,
};

// ── Three reference rooms ──
// widthM = left-right, lengthM = front-back (front wall at y=0), heightM = vertical.
// Seat z = 1.2 m (seated ear height). Sub z = 0 (floor).
const ROOMS = [
  {
    id: 1,
    label: "Room 1 — 5.0 × 5.0 × 2.4 m",
    dims: { widthM: 5.0, lengthM: 5.0, heightM: 2.4 },
    seat: { x: 2.5, y: 3.0, z: 1.2 },
    sub:  { x: 0.5, y: 0.5, z: 0.0 }, // front-left corner
    markers: [
      { hz: 20,   db: 94.0 },
      { hz: 30,   db: 99.7 },
      { hz: 40,   db: 78.3 },
      { hz: 50,   db: 80.7 },
      { hz: 60,   db: 92.4 },
      { hz: 70,   db: 104.9 },
      { hz: 80.1, db: 89.2 },
      { hz: 90,   db: 92.4 },
      { hz: 100.3, db: 92.4 },
    ],
  },
  {
    id: 2,
    label: "Room 2 — 6.0 × 4.0 × 2.6 m",
    dims: { widthM: 4.0, lengthM: 6.0, heightM: 2.6 },
    seat: { x: 2.0, y: 4.0, z: 1.2 },
    sub:  { x: 0.5, y: 0.5, z: 0.0 }, // front-left corner
    markers: [
      { hz: 20,   db: 94.0 },
      { hz: 30,   db: 99.7 },
      { hz: 40,   db: 78.3 },
      { hz: 50,   db: 80.7 },
      { hz: 60,   db: 92.4 },
      { hz: 70,   db: 82.8 },
      { hz: 80.1, db: 100.1 },
      { hz: 90,   db: 87.4 },
      { hz: 100.1, db: 90.4 },
      { hz: 110.1, db: 96.4 },
    ],
  },
  {
    id: 3,
    label: "Room 3 — 10.0 × 6.0 × 3.0 m",
    dims: { widthM: 6.0, lengthM: 10.0, heightM: 3.0 },
    seat: { x: 3.0, y: 6.51, z: 1.2 },
    sub:  { x: 0.5, y: 8.5, z: 0.0 }, // rear, 1.50 m from rear-left corner
    markers: [
      { hz: 10,   db: 75.9 },
      { hz: 20,   db: 97.2 },
      { hz: 30,   db: 95.2 },
      { hz: 40,   db: 72.7 },
      { hz: 50,   db: 98.1 },
      { hz: 60,   db: 90.6 },
      { hz: 69.9, db: 90.6 },
      { hz: 79.9, db: 92.8 },
      { hz: 90,   db: 82.8 },
    ],
  },
];

// ── Engine option presets ──
// Both strategies use IDENTICAL options except qStrategy. The ab_corrected path
// automatically applies √V reconciliation and the 70–120 Hz 1.5× Q boost inside
// the engine — no external mutation required.
const BASE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: SURFACE_ABSORPTION,
  freqMinHz: 10,
  freqMaxHz: 200,
  smoothing: "none",
  modalSourceReferenceMode: "existing",
  modalGainScalar: 1.0,
  axialQ: 8.0,
  modalStorageMode: "none",
  propagationPhaseScale: 0,
  debugMode200Multiplier: 1.0,
  debugReflectionOrder: 1,
  reflectionGainScale: 1.0,
  modalCoherenceMode: "coherent",
  highOrderAxialScale: 1.0,
  pureDeterministicModalSum: true,
  disableModalPropagationPhase: true,
  disableLateField: true,
};

const OPTIONS_PRODUCTION = { ...BASE_OPTIONS, qStrategy: "production" };
const OPTIONS_AB         = { ...BASE_OPTIONS, qStrategy: "ab_corrected" };

// ── Sampling helpers ──
function sampleDbAt(splDbRaw, freqsHz, targetHz) {
  if (!Array.isArray(splDbRaw) || splDbRaw.length === 0) return null;
  // Find the nearest frequency bin to targetHz in the engine's log-spaced axis.
  let bestIdx = 0;
  let bestDist = Math.abs(freqsHz[0] - targetHz);
  for (let i = 1; i < freqsHz.length; i++) {
    const d = Math.abs(freqsHz[i] - targetHz);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  // If the nearest bin is more than 1.5 Hz away, do a small linear interpolation
  // between the two bracketing bins.
  if (bestDist < 0.6) return splDbRaw[bestIdx];
  // Bracket
  let lo = bestIdx, hi = bestIdx;
  if (freqsHz[bestIdx] <= targetHz) {
    while (lo < freqsHz.length - 1 && freqsHz[lo] < targetHz) lo++;
    lo = Math.max(0, lo - 1);
    hi = Math.min(freqsHz.length - 1, lo + 1);
  } else {
    while (hi > 0 && freqsHz[hi] > targetHz) hi--;
    hi = Math.min(freqsHz.length - 1, hi + 1);
    lo = Math.max(0, hi - 1);
  }
  if (lo === hi || freqsHz[hi] === freqsHz[lo]) return splDbRaw[lo];
  const ratio = (targetHz - freqsHz[lo]) / (freqsHz[hi] - freqsHz[lo]);
  return splDbRaw[lo] + (splDbRaw[hi] - splDbRaw[lo]) * ratio;
}

function runEngineForRoom(room, options) {
  try {
    const r = simulateBassResponseRewCore(room.dims, room.seat, room.sub, SOURCE_CURVE, options);
    return { freqsHz: r.freqsHz, splDbRaw: r.splDbRaw };
  } catch (e) {
    return { freqsHz: [], splDbRaw: [] };
  }
}

// ── Per-marker rows & room aggregate metrics ──
function computeRoomReport(room) {
  const prod = runEngineForRoom(room, OPTIONS_PRODUCTION);
  const ab   = runEngineForRoom(room, OPTIONS_AB);

  const rows = room.markers.map((m) => {
    const pDb = sampleDbAt(prod.splDbRaw, prod.freqsHz, m.hz);
    const aDb = sampleDbAt(ab.splDbRaw,   ab.freqsHz,   m.hz);
    const pDelta = pDb != null ? pDb - m.db : null;
    const aDelta = aDb != null ? aDb - m.db : null;
    let winner = "—";
    if (pDelta != null && aDelta != null) {
      const pErr = Math.abs(pDelta);
      const aErr = Math.abs(aDelta);
      if (Math.abs(pErr - aErr) < 0.05) winner = "TIE";
      else winner = pErr < aErr ? "Production" : "A&B";
    }
    return { hz: m.hz, rew: m.db, prod: pDb, prodDelta: pDelta, ab: aDb, abDelta: aDelta, winner };
  });

  const valid = rows.filter((r) => r.prodDelta != null && r.abDelta != null);
  const n = valid.length;

  function statsFor(getterDelta, getterSpl) {
    if (!n) return { rms: null, max: null, mean: null, corr: null };
    let sumSq = 0, sumDelta = 0, maxAbs = 0;
    let sumB44 = 0, sumREW = 0, sumBB = 0, sumRR = 0, sumBR = 0;
    valid.forEach((r) => {
      const d = getterDelta(r);
      const b = getterSpl(r);
      sumSq += d * d;
      sumDelta += d;
      if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
      sumB44 += b; sumREW += r.rew;
      sumBB += b * b; sumRR += r.rew * r.rew; sumBR += b * r.rew;
    });
    const rms = Math.sqrt(sumSq / n);
    const max = maxAbs;
    const mean = sumDelta / n;
    const num = n * sumBR - sumB44 * sumREW;
    const den = Math.sqrt((n * sumBB - sumB44 * sumB44) * (n * sumRR - sumREW * sumREW));
    const corr = den === 0 ? null : num / den;
    return { rms, max, mean, corr };
  }

  const prodStats = statsFor((r) => r.prodDelta, (r) => r.prod);
  const abStats   = statsFor((r) => r.abDelta,   (r) => r.ab);

  // Room winner: lower RMS wins. Tie-break by max error, then |mean|.
  let roomWinner = "TIE";
  if (prodStats.rms != null && abStats.rms != null) {
    if (Math.abs(prodStats.rms - abStats.rms) < 0.1) {
      if (prodStats.max < abStats.max) roomWinner = "Production";
      else if (abStats.max < prodStats.max) roomWinner = "A&B";
      else roomWinner = "TIE";
    } else {
      roomWinner = prodStats.rms < abStats.rms ? "Production" : "A&B";
    }
  }

  const markersProdWon = valid.filter((r) => r.winner === "Production").length;
  const markersAbWon   = valid.filter((r) => r.winner === "A&B").length;

  return { rows, prodStats, abStats, roomWinner, n, markersProdWon, markersAbWon };
}

// ── Verdict logic ──
function computeVerdict(global) {
  const { totalMarkers, avgRmsProd, avgRmsAb, markersProdWon, markersAbWon, roomsProdWon, roomsAbWon } = global;

  const gap = avgRmsProd - avgRmsAb; // positive = A&B better
  const worstAvgRms = Math.max(avgRmsProd, avgRmsAb);
  const bestAvgRms = Math.min(avgRmsProd, avgRmsAb);

  // 4. MODEL STILL NOT CLOSE ENOUGH — even the best strategy is far from REW.
  if (bestAvgRms >= 5.0 && worstAvgRms >= 5.0) {
    return {
      code: 4,
      label: "4. MODEL STILL NOT CLOSE ENOUGH",
      rationale: `Even the best strategy (avg RMS ${Math.min(avgRmsProd, avgRmsAb).toFixed(2)} dB) remains well above the <3 dB parity target. The room-acoustic model needs structural correction, not strategy tuning.`,
    };
  }

  const abWinsRooms   = roomsAbWon > roomsProdWon;
  const abWinsMarkers = markersAbWon > markersProdWon;
  const abWinsRms     = gap > 0;

  // 1. A&B IS CLEARLY BETTER
  if (gap >= 1.0 && abWinsRooms && abWinsMarkers) {
    return {
      code: 1,
      label: "1. A&B IS CLEARLY BETTER",
      rationale: `A&B corrected wins on RMS error (Δ${gap.toFixed(2)} dB), room wins (${roomsAbWon}/${ROOMS.length}), and marker wins (${markersAbWon}/${totalMarkers}). The √V + 70–120 Hz Q boost is a genuine improvement across multiple rooms.`,
    };
  }

  // 2. PRODUCTION IS STILL BETTER
  if (gap <= -1.0 && !abWinsRooms && !abWinsMarkers) {
    return {
      code: 2,
      label: "2. PRODUCTION IS STILL BETTER",
      rationale: `Production wins on RMS error (Δ${(-gap).toFixed(2)} dB), room wins (${roomsProdWon}/${ROOMS.length}), and marker wins (${markersProdWon}/${totalMarkers}). The A&B + √V + Q boost does not outperform production across multiple rooms.`,
    };
  }

  // 3. MIXED — NEED MORE ROOMS
  return {
    code: 3,
    label: "3. MIXED — NEED MORE ROOMS",
    rationale: `Results split: RMS gap ${gap.toFixed(2)} dB, rooms A&B ${roomsAbWon}/${ROOMS.length} / Production ${roomsProdWon}/${ROOMS.length}, markers A&B ${markersAbWon}/${totalMarkers} / Production ${markersProdWon}/${totalMarkers}. Three rooms are insufficient to declare a clear winner.`,
  };
}

// ── Styling ──
const S = {
  card:    { border: "2px solid #1e3a8a", borderRadius: 14, padding: 14, background: "#f8fafc", marginTop: 8 },
  title:   { fontSize: 14, fontWeight: 800, color: "#1e3a8a", fontFamily: "monospace", marginBottom: 6 },
  subtitle:{ fontSize: 11, fontWeight: 700, color: "#334155", fontFamily: "monospace", marginTop: 10, marginBottom: 4 },
  desc:    { fontSize: 10, color: "#64748b", fontFamily: "monospace", marginBottom: 8, lineHeight: 1.4 },
  table:   { width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" },
  th:      { padding: "4px 6px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" },
  thLeft:  { padding: "4px 6px", borderBottom: "1px solid #cbd5e1", color: "#475569", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left" },
  td:      { padding: "4px 6px", textAlign: "center", color: "#0f172a" },
  tdLeft:  { padding: "4px 6px", textAlign: "left", color: "#0f172a" },
  tdBold:  { padding: "4px 6px", textAlign: "center", color: "#0f172a", fontWeight: 700 },
  verdict: { marginTop: 12, border: "2px solid #1e3a8a", borderRadius: 10, padding: 12, background: "#eff6ff" },
};

function fmt(v, digits = 2, fallback = "—") {
  if (v === null || v === undefined || !Number.isFinite(v)) return fallback;
  return v.toFixed(digits);
}

function deltaColor(v) {
  if (v == null || !Number.isFinite(v)) return "#64748b";
  const a = Math.abs(v);
  if (a < 1.0) return "#15803d";
  if (a < 3.0) return "#b45309";
  return "#dc2626";
}

function winnerColor(w) {
  if (w === "A&B") return "#1d4ed8";
  if (w === "Production") return "#15803d";
  return "#64748b";
}

// ── Main Panel ──
export default function Case099RewThreeRoomBenchmark() {
  const reports = useMemo(() => ROOMS.map((r) => ({ room: r, report: computeRoomReport(r) })), []);

  const global = useMemo(() => {
    const totalMarkers = reports.reduce((s, { report }) => s + report.n, 0);
    const avgRmsProd   = reports.reduce((s, { report }) => s + (report.prodStats.rms || 0), 0) / reports.length;
    const avgRmsAb     = reports.reduce((s, { report }) => s + (report.abStats.rms   || 0), 0) / reports.length;
    const avgMaxProd   = reports.reduce((s, { report }) => s + (report.prodStats.max || 0), 0) / reports.length;
    const avgMaxAb     = reports.reduce((s, { report }) => s + (report.abStats.max   || 0), 0) / reports.length;
    const markersProdWon = reports.reduce((s, { report }) => s + report.markersProdWon, 0);
    const markersAbWon   = reports.reduce((s, { report }) => s + report.markersAbWon,   0);
    const roomsProdWon   = reports.filter(({ report }) => report.roomWinner === "Production").length;
    const roomsAbWon     = reports.filter(({ report }) => report.roomWinner === "A&B").length;
    return { totalMarkers, avgRmsProd, avgRmsAb, avgMaxProd, avgMaxAb, markersProdWon, markersAbWon, roomsProdWon, roomsAbWon };
  }, [reports]);

  const verdict = useMemo(() => computeVerdict(global), [global]);

  return (
    <div style={S.card}>
      <div style={S.title}>CASE 099 — Three-Room REW Marker Benchmark (Temporary · Read-Only)</div>
      <div style={S.desc}>
        Three fixed reference rooms · flat 94 dB source curve · 0.30 absorption all surfaces · 1 sub · floor-level.
        Strategy A = Production (smooth soft-cap Q). Strategy B = A&B corrected + √V + 70–120 Hz 1.5× Q boost (applied inside the engine).
        No engine / graph / production logic modified.
      </div>

      {/* Per-room sections */}
      {reports.map(({ room, report }) => (
        <div key={room.id} style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, background: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a", fontFamily: "monospace", marginBottom: 4 }}>
            {room.label}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", marginBottom: 6 }}>
            seat ({room.seat.x}, {room.seat.y}, {room.seat.z}) · sub ({room.sub.x}, {room.sub.y}, {room.sub.z}) · {report.n} markers
          </div>

          {/* Per-marker table */}
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Freq</th>
                <th style={S.th}>REW SPL</th>
                <th style={S.th}>Prod SPL</th>
                <th style={S.th}>Prod Δ</th>
                <th style={S.th}>A&B SPL</th>
                <th style={S.th}>A&B Δ</th>
                <th style={S.th}>Winner</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={r.hz} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                  <td style={S.tdLeft}>{r.hz.toFixed(1)} Hz</td>
                  <td style={S.td}>{fmt(r.rew, 1)}</td>
                  <td style={S.td}>{fmt(r.prod, 1)}</td>
                  <td style={{ ...S.td, color: deltaColor(r.prodDelta), fontWeight: 700 }}>{fmt(r.prodDelta, 2, "")}</td>
                  <td style={S.td}>{fmt(r.ab, 1)}</td>
                  <td style={{ ...S.td, color: deltaColor(r.abDelta), fontWeight: 700 }}>{fmt(r.abDelta, 2, "")}</td>
                  <td style={{ ...S.tdBold, color: winnerColor(r.winner) }}>{r.winner}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Per-room aggregates */}
          <div style={S.subtitle}>Room {room.id} Aggregate</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.thLeft}>Metric</th>
                <th style={S.th}>Production</th>
                <th style={S.th}>A&B</th>
                <th style={S.th}>Better</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "RMS Error (dB)",   prod: report.prodStats.rms,  ab: report.abStats.rms,  lower: true },
                { label: "Max Error (dB)",  prod: report.prodStats.max,  ab: report.abStats.max,  lower: true },
                { label: "Mean Signed (dB)",prod: report.prodStats.mean, ab: report.abStats.mean, lower: true },
                { label: "Correlation",     prod: report.prodStats.corr, ab: report.abStats.corr, lower: false },
              ].map((row, i) => {
                const prodBetter = row.lower ? row.prod < row.ab : row.prod > row.ab;
                return (
                  <tr key={row.label} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                    <td style={S.tdLeft}>{row.label}</td>
                    <td style={S.td}>{fmt(row.prod, 3)}</td>
                    <td style={S.td}>{fmt(row.ab, 3)}</td>
                    <td style={{ ...S.tdBold, color: prodBetter ? "#15803d" : "#1d4ed8" }}>{prodBetter ? "Prod" : "A&B"}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "#fff7ed" }}>
                <td style={S.tdLeft}>Markers Won</td>
                <td style={stylesWinCell(report.markersProdWon, true)}>{report.markersProdWon}</td>
                <td style={stylesWinCell(report.markersAbWon, false)}>{report.markersAbWon}</td>
                <td style={{ ...S.tdBold, color: winnerColor(report.roomWinner) }}>Room: {report.roomWinner}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {/* Global totals */}
      <div style={S.subtitle}>Global Totals — All Rooms</div>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.thLeft}>Metric</th>
            <th style={S.th}>Production</th>
            <th style={S.th}>A&B</th>
          </tr>
        </thead>
        <tbody>
          <GRow label="Total Markers Tested" prod={global.totalMarkers} ab={global.totalMarkers} />
          <GRow label="Average RMS Error (dB)" prod={global.avgRmsProd} ab={global.avgRmsAb} />
          <GRow label="Average Max Error (dB)" prod={global.avgMaxProd} ab={global.avgMaxAb} />
          <GRow label="Markers Won" prod={global.markersProdWon} ab={global.markersAbWon} />
          <GRow label="Rooms Won"   prod={global.roomsProdWon}   ab={global.roomsAbWon} />
        </tbody>
      </table>

      {/* Final verdict */}
      <div style={S.verdict}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e3a8a", fontFamily: "monospace", marginBottom: 6 }}>
          FINAL VERDICT → {verdict.label}
        </div>
        <div style={{ fontSize: 11, color: "#1e40af", fontFamily: "monospace", lineHeight: 1.5 }}>
          {verdict.rationale}
        </div>
        <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginTop: 8 }}>
          Gap (Prod RMS − A&B RMS): {fmt(global.avgRmsProd - global.avgRmsAb, 2)} dB ·
          Best avg RMS: {fmt(Math.min(global.avgRmsProd, global.avgRmsAb), 2)} dB ·
          Worst avg RMS: {fmt(Math.max(global.avgRmsProd, global.avgRmsAb), 2)} dB
        </div>
      </div>
    </div>
  );
}

// Small helpers to keep render compact
function GRow({ label, prod, ab }) {
  return (
    <tr style={{ background: "#fff" }}>
      <td style={S.tdLeft}>{label}</td>
      <td style={S.td}>{typeof prod === "number" ? fmt(prod, 2) : prod}</td>
      <td style={S.td}>{typeof ab === "number" ? fmt(ab, 2) : ab}</td>
    </tr>
  );
}

function stylesWinCell(v, isProd) {
  return { padding: "4px 6px", textAlign: "center", color: isProd ? "#15803d" : "#1d4ed8", fontWeight: 700 };
}