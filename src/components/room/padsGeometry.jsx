/**
 * Compute bed-layer pad extents for FWL/FWR/SL/SR/LRS/RRS in meters.
 * Mirrors the overlay math (closed-form, front-row MLP).
 */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function deg2rad(d) { return (d * Math.PI) / 180; }

export function computeFrontRowCenter(seats, W, L) {
  const v = (Array.isArray(seats) ? seats : []).filter(s => Number.isFinite(s?.x) && Number.isFinite(s?.y));
  if (!v.length) return { x: W/2, y: Math.min(L*0.58, L-1.2) };
  const yFront = Math.min(...v.map(s => s.y));
  const EPS = Math.max(0.01, Math.min(0.12, L * 0.01));
  const row = v.filter(s => Math.abs(s.y - yFront) <= EPS).sort((a,b)=>a.x-b.x);
  if (!row.length) return { x: W/2, y: yFront };
  const xs = row.map(s => s.x);
  const xMid = (xs[0] + xs[xs.length - 1]) / 2;
  const yMid = row.reduce((acc,s)=>acc+s.y,0)/row.length;
  return { x: xMid, y: yMid };
}

function sideWallSpanFromAngles(mlp, band, side, W, L) {
  const xWall = side === "left" ? 0 : W;
  const cot = (ang) => 1 / Math.tan(deg2rad(ang));
  const y1 = mlp.y - (xWall - mlp.x) * cot(band.minDeg);
  const y2 = mlp.y - (xWall - mlp.x) * cot(band.maxDeg);
  return { yMin: clamp(Math.min(y1,y2), 0, L), yMax: clamp(Math.max(y1,y2), 0, L) };
}

/**
 * @param {{dimensions:{width:number;length:number}, seatingPositions:any[]}} opts
 * @returns {{ [k:string]: {axis:"x"|"y", min:number, max:number} }}
 */
export function getBedPads(opts) {
  const W = Number(opts?.dimensions?.width) || 4.5;
  const L = Number(opts?.dimensions?.length) || 6.0;
  const seats = Array.isArray(opts?.seatingPositions) ? opts.seatingPositions : [];
  const mlp = computeFrontRowCenter(seats, W, L);

  const WALL_INSET = 0.02, BAND_DEPTH = 0.06, SIDE_MARGIN = 0.15;

  // Wides: 50..60 deg
  const wideL = sideWallSpanFromAngles(mlp, { minDeg: -60, maxDeg: -50 }, "left", W, L);
  const wideR = sideWallSpanFromAngles(mlp, { minDeg:  50, maxDeg:  60 }, "right", W, L);
  const yClamp = (y) => clamp(y, WALL_INSET, L - WALL_INSET);

  const wides = {
    FWL: { axis: "y", min: yClamp(Math.min(wideL.yMin, wideL.yMax)), max: yClamp(Math.max(wideL.yMin, wideL.yMax)) },
    FWR: { axis: "y", min: yClamp(Math.min(wideR.yMin, wideR.yMax)), max: yClamp(Math.max(wideR.yMin, wideR.yMax)) },
  };

  // Side surrounds span the listening area with margin
  const valid = seats.filter(s => Number.isFinite(s?.x) && Number.isFinite(s?.y));
  const ys = valid.length ? valid.map(s => s.y) : [];
  const yMin = ys.length ? Math.min(...ys) : Math.max(0.6, L * 0.35);
  const yMax = ys.length ? Math.max(...ys) : Math.min(L - 0.6, L * 0.75);
  const sideTop = clamp(yMin - SIDE_MARGIN, WALL_INSET, L - WALL_INSET);
  const sideBot = clamp(yMax + SIDE_MARGIN, WALL_INSET, L - WALL_INSET);

  const sides = {
    SL: { axis: "y", min: sideTop, max: sideBot },
    SR: { axis: "y", min: sideTop, max: sideBot },
  };

  // Rear surrounds: use tails if available; otherwise use back band across X
  // Our overlay draws tails (vertical) from yTop to back, so axis is "y".
  const rearTop = clamp(yMax, WALL_INSET, L - WALL_INSET);
  const rearTailMin = rearTop;
  const rearTailMax = L - WALL_INSET;

  const rears = {
    LRS: { axis: "y", min: rearTailMin, max: rearTailMax },
    RRS: { axis: "y", min: rearTailMin, max: rearTailMax },
  };

  return { ...wides, ...sides, ...rears };
}

export default { getBedPads, computeFrontRowCenter };