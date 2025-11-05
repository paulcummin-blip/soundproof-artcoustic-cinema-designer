
// utils/frontWides.jsx
const asArr = (x)=>Array.isArray(x)?x:[];
const isNum = (v)=>typeof v==="number" && Number.isFinite(v);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const toRad = d => d*Math.PI/180;
const norm = (x,y)=> {
  const m = Math.hypot(x,y) || 1;
  return { x: x/m, y: y/m };
};

function wallIntersections({ mlp, dir, room, frontKeep, sideKeep }) {
  const pts = [];

  // y = front line
  if (Math.abs(dir.y) > 1e-6) {
    const yF = room.yMin + frontKeep;
    const tF = (yF - mlp.y) / dir.y;
    if (tF > 0) {
      const xF = mlp.x + tF * dir.x;
      if (xF >= room.xMin + sideKeep && xF <= room.xMax - sideKeep) {
        pts.push({ t: tF, x: xF, y: yF, wall: 'front' });
      }
    }
  }

  // x = left line
  if (Math.abs(dir.x) > 1e-6) {
    const xL = room.xMin + sideKeep;
    const tL = (xL - mlp.x) / dir.x;
    if (tL > 0) {
      const yL = mlp.y + tL * dir.y;
      if (yL >= room.yMin + frontKeep && yL <= room.yMax - frontKeep) {
        pts.push({ t: tL, x: xL, y: yL, wall: 'left' });
      }
    }
  }

  // x = right line
  if (Math.abs(dir.x) > 1e-6) {
    const xR = room.xMax - sideKeep;
    const tR = (xR - mlp.x) / dir.x;
    if (tR > 0) {
      const yR = mlp.y + tR * dir.y;
      if (yR >= room.yMin + frontKeep && yR <= room.yMax - frontKeep) {
        pts.push({ t: tR, x: xR, y: yR, wall: 'right' });
      }
    }
  }

  // pick nearest valid
  pts.sort((a,b)=>a.t-b.t);
  return pts;
}

function pick(spkrs, role) {
  return spkrs.find(s => s.role === role && s.position && isNum(s.position.x) && isNum(s.position.y)) || null;
}

/**
 * Place WL/WR at the angular bisector between (L,LS) and (R,RS) from the MLP.
 * Intersects the bisector ray with the front/side keep-out lines and chooses the nearest.
 * If any channel is missing, falls back to a nominal 58° target ray.
 */
export function placeFrontWidesMedian({
  speakers,
  mlp,
  room,                      // {xMin,xMax,yMin,yMax}
  frontKeep = 0.10,          // 10 cm off front wall
  sideKeep   = 0.15,          // 15 cm off side walls
  zWide     = 1.2            // bed-layer height unless you store per-model
}) {
  const next = asArr(speakers).map(s => ({ ...s, position: { ...(s.position || {}) } }));

  const L  = pick(next,'L');
  const R  = pick(next,'R');
  const LS = pick(next,'LS');
  const RS = pick(next,'RS');

  // helper: ensure a WL/WR container exists (create if missing)
  const ensureRole = (role) => {
    let i = next.findIndex(s => s.role === role);
    if (i === -1) {
      next.push({ id: role, role, label: role, position: { x: mlp.x, y: mlp.y, z: zWide } });
      i = next.length - 1;
    }
    return i;
  };

  const placeSide = (frontSpk, sideSpk, side /* 'left' | 'right' */) => {
    const idx = ensureRole(side === 'left' ? 'LW' : 'RW'); // Use LW/RW for consistency
    if (!mlp) return;

    // direction via angular bisector if both anchors exist
    let dir;
    if (frontSpk && sideSpk) {
      const uF = norm(frontSpk.position.x - mlp.x, frontSpk.position.y - mlp.y);
      const uS = norm(sideSpk.position.x  - mlp.x, sideSpk.position.y  - mlp.y);
      const uB = norm(uF.x + uS.x, uF.y + uS.y); // bisector
      dir = uB;
    } else {
      // fallback: nominal 58° target from front axis
      const sgn = side === 'left' ? -1 : +1; // left negative x, right positive x
      const ang = toRad(58);
      dir = { x:  sgn * Math.sin(ang), y: -Math.cos(ang) }; // -cos(ang): towards front (yMin)
    }

    // intersect ray with keep-out boundaries
    const hits = wallIntersections({ mlp, dir, room, frontKeep, sideKeep });

    // prefer the boundary that matches the side (front or that side wall), else nearest
    let pickPt = null;
    if (side === 'left') {
      pickPt = hits.find(h => h.wall === 'left') || hits.find(h => h.wall === 'front') || hits[0];
    } else {
      pickPt = hits.find(h => h.wall === 'right') || hits.find(h => h.wall === 'front') || hits[0];
    }
    if (!pickPt) return; // nothing valid; leave as-is

    next[idx].position.x = clamp(pickPt.x, room.xMin + sideKeep, room.xMax - sideKeep);
    next[idx].position.y = clamp(pickPt.y, room.yMin + frontKeep, room.yMax - frontKeep);
    next[idx].position.z = isNum(next[idx].position.z) ? next[idx].position.z : zWide;
  };

  placeSide(L,  LS, 'left');
  placeSide(R,  RS, 'right');

  return next;
}
