/**
 * regressionEngine.js
 * Core computation for multi-room Q regression test.
 * Uses same modalCalculations primitives as production engine.
 * No production engine calls — all custom-Q variants use the
 * minimal pressure summation loop to isolate the Q formula effect.
 */
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';
import { BASE_Q_BY_TYPE, SA_TEST, VARIANTS } from './qFormulas';

// ── 20 representative test rooms ─────────────────────────────────────────────
export const TEST_ROOMS = [
  { w: 3.0,  l: 4.0,  h: 2.3  },
  { w: 3.5,  l: 4.5,  h: 2.4  },
  { w: 4.0,  l: 6.0,  h: 2.4  },
  { w: 4.3,  l: 6.0,  h: 2.4  },
  { w: 4.5,  l: 7.0,  h: 2.5  },
  { w: 5.0,  l: 5.0,  h: 2.4  },
  { w: 5.0,  l: 7.5,  h: 2.6  },
  { w: 6.0,  l: 8.0,  h: 2.7  },
  { w: 7.0,  l: 9.0,  h: 2.8  },
  { w: 4.0,  l: 4.0,  h: 2.4  },
  { w: 3.2,  l: 6.4,  h: 2.3  },
  { w: 4.8,  l: 4.8,  h: 2.6  },
  { w: 5.5,  l: 6.0,  h: 2.5  },
  { w: 6.5,  l: 6.5,  h: 2.8  },
  { w: 7.5,  l: 5.0,  h: 2.7  },
  { w: 8.0,  l: 4.0,  h: 2.5  },
  { w: 4.2,  l: 8.4,  h: 2.4  },
  { w: 3.8,  l: 5.2,  h: 2.2  },
  { w: 6.0,  l: 10.0, h: 3.0  },
  { w: 5.0,  l: 9.0,  h: 2.35 },
];

// ── Geometry from room ───────────────────────────────────────────────────────
export function roomGeometry(room) {
  const rd = { widthM: room.w, lengthM: room.l, heightM: room.h };
  const sub  = { x: room.w * 0.25, y: 0.3,           z: 0.55 };
  const seat = { x: room.w * 0.50, y: room.l * 0.55, z: 1.2  };
  return { rd, sub, seat };
}

// ── Build log-spaced frequency axis ─────────────────────────────────────────
function buildFreqAxis() {
  const freqs = [];
  const ppo = 48; // reduced for speed (still accurate for macro metrics)
  const n = Math.ceil(Math.log2(220 / 20) * ppo);
  for (let i = 0; i <= n; i++) {
    const hz = 20 * Math.pow(2, i / ppo);
    if (hz > 222) break;
    freqs.push(hz);
  }
  return freqs;
}

const FREQ_AXIS = buildFreqAxis();

// ── Minimal modal pressure summation ────────────────────────────────────────
function computeResponse(rd, seat, sub, modes) {
  const { widthM: W, lengthM: L, heightM: H } = rd;
  const modalAmp = Math.pow(10, 94 / 20);

  return FREQ_AXIS.map(f => {
    let re = 0, im = 0;
    for (const mode of modes) {
      const sc = modeShapeValueLocal(mode, sub.x,  sub.y,  sub.z,  { widthM: W, lengthM: L, heightM: H });
      const rc = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, { widthM: W, lengthM: L, heightM: H });
      const coupling = sc * rc;
      const { re: tfRe, im: tfIm } = resonantTransfer(f, mode.freq, mode.qValue);
      const order = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
      const axScale = (mode.type === 'axial' && order >= 2) ? 0.50 : 1.0;
      const gain = modalAmp * coupling * axScale;
      re += gain * tfRe;
      im += gain * tfIm;
    }
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });
}

// ── Analyse SPL array ────────────────────────────────────────────────────────
export function analyseResponse(splDb) {
  const band = FREQ_AXIS
    .map((f, i) => ({ f, db: splDb[i] }))
    .filter(p => Number.isFinite(p.db));
  if (!band.length) return null;

  const sorted = [...band].sort((a, b) => a.db - b.db);
  const medianDb = sorted[Math.floor(sorted.length / 2)].db;
  const minPt = sorted[0];
  const maxPt = sorted[sorted.length - 1];
  const swing = maxPt.db - minPt.db;

  // Count distinct peaks / deep nulls
  let peaks = 0, deepNulls = 0;
  let prevPeak = false, prevNull = false;
  for (const p of band) {
    const isPeak = p.db > medianDb + 4;
    const isNull = p.db < medianDb - 12; // deep null threshold
    if (isPeak && !prevPeak) peaks++;
    if (isNull && !prevNull) deepNulls++;
    prevPeak = isPeak;
    prevNull = isNull;
  }

  const nullDepth = minPt.db;
  const maxPeak   = maxPt.db;

  // Stability: swing > 55 dB or peak > median + 30 dB → flag
  const stable = swing <= 55 && (maxPeak - medianDb) <= 30;

  // Design story
  let story;
  if (swing < 8)       story = 'too smooth';
  else if (swing > 50 || !stable) story = 'too violent / unstable';
  else                 story = 'credible';

  return { swing, peaks, deepNulls, nullDepth, maxPeak, medianDb, stable, story };
}

// ── Run one room × all variants ──────────────────────────────────────────────
function runRoom(room) {
  const { rd, sub, seat } = roomGeometry(room);
  const rawModes = computeRoomModesLocal({ ...rd, fMax: 220 });

  return VARIANTS.map(variant => {
    const modes = rawModes.map(mode => {
      const absorptionQ = estimateModeQLocal({ roomDims: rd, surfaceAbsorption: SA_TEST, f0: mode.freq });
      const baseQ = BASE_Q_BY_TYPE[mode.type] ?? 4.0;
      const qValue = variant.fn(baseQ, absorptionQ);
      return { ...mode, qValue };
    });

    const splDb = computeResponse(rd, seat, sub, modes);
    const metrics = analyseResponse(splDb);
    return { variantId: variant.id, metrics };
  });
}

// ── Run all 20 rooms ─────────────────────────────────────────────────────────
export function runAllRooms() {
  return TEST_ROOMS.map((room, idx) => ({
    idx,
    room,
    label: `${idx + 1}. ${room.w}×${room.l}×${room.h}`,
    variantResults: runRoom(room),
  }));
}

// ── Aggregate summary across rooms ──────────────────────────────────────────
export function aggregateSummary(roomResults) {
  return VARIANTS.map(variant => {
    const vId = variant.id;
    const rows = roomResults.map(r => r.variantResults.find(v => v.variantId === vId)?.metrics).filter(Boolean);
    if (!rows.length) return { variantId: vId, variant };

    const avgSwing    = rows.reduce((s, m) => s + (m.swing    ?? 0), 0) / rows.length;
    const avgPeaks    = rows.reduce((s, m) => s + (m.peaks    ?? 0), 0) / rows.length;
    const avgNulls    = rows.reduce((s, m) => s + (m.deepNulls ?? 0), 0) / rows.length;
    const credible    = rows.filter(m => m.story === 'credible').length;
    const unstable    = rows.filter(m => m.story === 'too violent / unstable').length;
    const tooSmooth   = rows.filter(m => m.story === 'too smooth').length;

    return {
      variantId: vId, variant,
      avgSwing, avgPeaks, avgNulls,
      credible, unstable, tooSmooth,
      // Score: credible rooms earn 2pts, unstable −2, tooSmooth −1
      score: credible * 2 - unstable * 2 - tooSmooth,
    };
  });
}