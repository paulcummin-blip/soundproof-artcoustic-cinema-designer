// Pure geometry helpers. All metres, degrees in/out.

export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
export function deg2rad(d){ return (d * Math.PI) / 180; }
export function rad2deg(r){ return (r * 180) / Math.PI; }

export function dirFromDeg(deg){
  const r = deg2rad(deg);
  return { dx: Math.sin(r), dy: -Math.cos(r) }; // 0° -> toward front wall (y-)
}

// Angle from "from" to "to", 0° = front, + right, - left
export function angleFromTo(from, to){
  const dx = to.x - from.x, dy = to.y - from.y;
  // atan2(x,y) yields 0 on +y, positive to the right
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; // 0..360
}

export function normalizeSigned(deg){
  // convert 0..360 -> signed -180..+180
  let d = ((deg + 540) % 360) - 180;
  return d;
}

// Ray → wall intersection (front y=0, back y=L, left x=0, right x=W)
export function intersectWall(x0, y0, dx, dy, wall, W, L){
  if (wall === "front") {
    if (Math.abs(dy) < 1e-9 || dy >= 0) return null;
    const t = (0 - y0) / dy; if (t <= 0) return null;
    const x = x0 + dx * t; if (x < 0 || x > W) return null;
    return { x, y: 0, t };
  }
  if (wall === "back") {
    if (Math.abs(dy) < 1e-9 || dy <= 0) return null;
    const t = (L - y0) / dy; if (t <= 0) return null;
    const x = x0 + dx * t; if (x < 0 || x > W) return null;
    return { x, y: L, t };
  }
  if (wall === "left") {
    if (Math.abs(dx) < 1e-9 || dx >= 0) return null;
    const t = (0 - x0) / dx; if (t <= 0) return null;
    const y = y0 + dy * t; if (y < 0 || y > L) return null;
    return { x: 0, y, t };
  }
  if (wall === "right") {
    if (Math.abs(dx) < 1e-9 || dx <= 0) return null;
    const t = (W - x0) / dx; if (t <= 0) return null;
    const y = y0 + dy * t; if (y < 0 || y > L) return null;
    return { x: W, y, t };
  }
  return null;
}

// Compute MLP from seats: primary > centre seat (odd) / midpoint (even) of front row > fallback
export function computeMLP(seats, W, L){
  const valid = Array.isArray(seats) ? seats.filter(s => Number.isFinite(s?.x) && Number.isFinite(s?.y)) : [];
  const primary = valid.find(s => s.isPrimary);
  if (primary) return { x: primary.x, y: primary.y };

  if (valid.length){
    const ys = valid.map(s => s.y);
    const yFront = Math.min(...ys);
    const row = valid.filter(s => Math.abs(s.y - yFront) < 1e-6).sort((a,b)=>a.x-b.x);
    if (row.length === 1) return { x: row[0].x, y: row[0].y };
    if (row.length > 1){
      const n = row.length;
      if (n % 2 === 1){
        const mid = row[(n-1)/2];
        return { x: mid.x, y: mid.y };
      }
      const a = row[n/2 - 1], b = row[n/2];
      return { x: (a.x + b.x)/2, y: a.y };
    }
  }
  return { x: W/2, y: Math.min(L*0.58, L-1.2) };
}

// Given a band [minDeg,maxDeg], return front-wall X range for a seat
export function frontBandXRange(mlp, band, W, L){
  const d1 = dirFromDeg(band.minDeg), d2 = dirFromDeg(band.maxDeg);
  const h1 = intersectWall(mlp.x, mlp.y, d1.dx, d1.dy, "front", W, L);
  const h2 = intersectWall(mlp.x, mlp.y, d2.dx, d2.dy, "front", W, L);
  if (!h1 || !h2) return null;
  return { xMin: Math.min(h1.x, h2.x), xMax: Math.max(h1.x, h2.x) };
}

// Given a signed band (e.g. left: negative, right: positive) return
// the allowed Y span on the requested side wall.
export function sideBandYRange(mlp, band, side, W, L){
  // DO NOT flip signs here. The band already carries handedness.
  const wall = (side === "left") ? "left" : "right";

  const d1 = dirFromDeg(band.minDeg); // use as-is
  const d2 = dirFromDeg(band.maxDeg);

  const h1 = intersectWall(mlp.x, mlp.y, d1.dx, d1.dy, wall, W, L);
  const h2 = intersectWall(mlp.x, mlp.y, d2.dx, d2.dy, wall, W, L);

  if (!h1 || !h2) return null;

  const yMin = Math.min(h1.y, h2.y);
  const yMax = Math.max(h1.y, h2.y);
  return { yMin, yMax };
}

// Angle at seat between two speakers (absolute difference)
export function seatAngleDiffDeg(seat, a, b){
  const A = angleFromTo(seat, a);
  const B = angleFromTo(seat, b);
  return Math.abs(normalizeSigned(B - A));
}