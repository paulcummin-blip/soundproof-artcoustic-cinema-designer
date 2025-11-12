// [B44] NOTE:
// These utilities are now **analysis-only** for RP22 (angles, gaps, etc.).
// Bed-layer geometry (SL/SR/SBL/SBR/LW/RW) is driven exclusively by
// SpeakerPlacement / resetSurroundPositions in SpeakerPlacement.jsx.
// DO NOT use these functions to mutate placedSpeakers directly.

// utils/bedOptimiser.jsx
const asArr = (x)=>Array.isArray(x)?x:[];
const toDeg = (r)=>r*180/Math.PI;

function azimuthAtSeat(sp, seat) {
  const dx = (sp.position?.x ?? 0) - (seat.x ?? 0);
  const dy = (sp.position?.y ?? 0) - (seat.y ?? 0);
  return Math.abs(toDeg(Math.atan2(dy, dx)));
}

/**
 * [B44 NOTE] ANALYSIS ONLY: safe to keep for RP22 reporting
 */
export function computeP5Angles({ speakers, seat }) {
  // Surround order (listener-level only; skip L/C/R, subs, wides, heights)
  const order = ['LS','LSS','LRS','LBS','RBS','RRS','RSS','RS'];
  const sur = asArr(speakers).filter(
    s => order.includes(s.role) && s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y)
  );
  if (sur.length < 2) return [];

  // sort by azimuth around the seat (monotonic)
  sur.sort((a,b)=>azimuthAtSeat(a,seat)-azimuthAtSeat(b,seat));

  const spans = [];
  for (let i=0;i<sur.length-1;i++) {
    const a = azimuthAtSeat(sur[i], seat);
    const b = azimuthAtSeat(sur[i+1], seat);
    spans.push({ aDeg: a, bDeg: b, spanDeg: Math.abs(b-a), A: sur[i], B: sur[i+1] });
  }
  return spans;
}

/**
 * [B44 NOTE] ANALYSIS ONLY: safe to keep
 */
export function levelForP5MaxSpan(maxSpanDeg){
  if (maxSpanDeg <= 50) return 4;
  if (maxSpanDeg <= 60) return 3;
  if (maxSpanDeg <= 80) return 2;
  return 1;
}

/**
 * [B44 NOTE] ANALYSIS ONLY: safe to keep
 */
export function estimateP6SpanDb({ speakers, seat }) {
  const isBed = (r)=>!/^T/.test(r) && !['L','C','R','LW','RW','SUB','SUB1','SUB2'].includes(r);
  const beds = asArr(speakers).filter(s => isBed(s.role) && s.position);
  if (beds.length < 2) return 0;

  const estAt = (sp)=>{
    const dx = sp.position.x - seat.x;
    const dy = sp.position.y - seat.y;
    const d = Math.max(0.5, Math.hypot(dx,dy));
    return -20*Math.log10(d); // relative
  };
  const vals = beds.map(estAt);
  return Math.max(...vals) - Math.min(...vals);
}
/**
 * [B44 NOTE] ANALYSIS ONLY: safe to keep
 */
export function levelForP6SpanDb(span){
  if (span <= 2) return 4;
  if (span <= 4) return 3;
  if (span <= 6) return 2;
  return 1;
}

// ---------------- Bed-layer auto-nudge optimiser ----------------

/**
 * Optimises bed-layer (listener-level) surrounds with tiny fore/aft nudges
 * to minimise worst P5 span (and secondarily P6 span) on target rows.
 * It never moves L/C/R, Wides or Heights. Respects wall/corner keep-outs.
 * [B44 NOTE] DISABLED FOR BED SURROUNDS: Do not call this to mutate placedSpeakers.
 * Bed-layer geometry is now driven by SpeakerPlacement / resetSurroundPositions.
 */
export function optimiseBedLayer({
  speakers,
  seats,
  room,                // {xMin, xMax, yMin, yMax}
  targetSeatRows,      // array of row y's (eg from pickTargetRows)
  iterations = 80,
  stepM = 0.05,        // 5 cm per probe
  keepOffWallM = 0.10, // 10 cm from walls
  cornerKeepM = 0.30   // 30 cm from corners along wall
}) {
  const next = asArr(speakers).map(s=>({...s, position: {...(s.position||{})}}));

  const isMovableBed = (r)=>
    !/^T/.test(r) &&                      // not heights
    !['L','C','R','LW','RW','SUB','SUB1','SUB2'].includes(r);

  const clampY = (y) => Math.max(room.yMin + keepOffWallM, Math.min(room.yMax - keepOffWallM, y));

  // Pre-split seats by row (5 cm tolerance)
  const eps = 0.05;
  const rowSeats = [];
  const Y = [];
  for (const s of asArr(seats)) {
    if (!Number.isFinite(s?.y)) continue;
    let bucket = rowSeats.find(r => Math.abs(r.y - s.y) <= eps);
    if (!bucket) { bucket = { y: s.y, seats: [] }; rowSeats.push(bucket); Y.push(s.y); }
    bucket.seats.push(s);
  }
  const targets = (targetSeatRows && targetSeatRows.length)
    ? rowSeats.filter(r => targetSeatRows.some(ty => Math.abs(ty - r.y) <= eps))
    : rowSeats;

  function worstOnTargets(spkArray){
    let worstP5 = 0;
    let worstP6 = 0;
    for (const row of targets) {
      for (const seat of row.seats) {
        const spans = computeP5Angles({ speakers: spkArray, seat });
        if (spans.length) {
          worstP5 = Math.max(worstP5, Math.max(...spans.map(s=>s.spanDeg)));
        }
        const p6 = estimateP6SpanDb({ speakers: spkArray, seat });
        worstP6 = Math.max(worstP6, p6);
      }
    }
    return { worstP5, worstP6 };
  }

  const startScore = worstOnTargets(next);

  // Build index of movable surrounds
  const movIdx = next
    .map((s,idx)=>({s,idx}))
    .filter(({s})=> isMovableBed(s.role) && Number.isFinite(s.position?.y))
    .map(({idx})=>idx);

  if (!movIdx.length) return next;

  let best = next.map(s=>({...s, position:{...s.position}}));
  let bestScore = startScore;

  for (let it=0; it<iterations; it++) {
    let improved = false;

    for (const i of movIdx) {
      const probe = best.map(s=>({...s, position:{...s.position}}));
      // try +step
      probe[i].position.y = clampY(probe[i].position.y + stepM);
      let scorePlus = worstOnTargets(probe);

      // try -step
      const probe2 = best.map(s=>({...s, position:{...s.position}}));
      probe2[i].position.y = clampY(probe2[i].position.y - stepM);
      let scoreMinus = worstOnTargets(probe2);

      // choose better (primary key: P5 span; tie-break: P6 span)
      const pick = (a,b)=> (a.worstP5 < b.worstP5 || (a.worstP5 === b.worstP5 && a.worstP6 < b.worstP6)) ? 'a' : 'b';
      const which = pick(scorePlus, scoreMinus);
      const cand = which === 'a' ? probe : probe2;
      const candScore = which === 'a' ? scorePlus : scoreMinus;

      if (candScore.worstP5 < bestScore.worstP5 || (candScore.worstP5 === bestScore.worstP5 && candScore.worstP6 < bestScore.worstP6)) {
        best = cand;
        bestScore = candScore;
        improved = true;
      }
    }

    if (!improved) break; // converged
  }

  return best;
}