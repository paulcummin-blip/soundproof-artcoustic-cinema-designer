// utils/bedLayerAutoNudge.js
export const asArr = x => Array.isArray(x) ? x : [];
const isNum = v => typeof v === 'number' && Number.isFinite(v);

const KEEP_FROM_CORNER_M = 0.30;  // RP22 proximity
const SNAP_TO_WALL_EPS  = 0.05;   // treat "on wall" for plan view

// Which wall each role should live on (plan view)
// yMin = screen wall (front), yMax = rear, xMin/xMax = side walls
const targetWall = (role) => {
  switch (role) {
    case 'L': case 'C': case 'R':        return 'yMin';
    case 'LS': case 'LSS':               return 'xMin';
    case 'RS': case 'RSS':               return 'xMax';
    case 'LRS': case 'LBS':              return 'yMax';
    case 'RRS': case 'RBS':              return 'yMax';
    case 'LW':                           return 'xMin';
    case 'RW':                           return 'xMax';
    default: return null; // leave others alone here
  }
};

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

export function autoNudgeBedLayer({ speakers, room, rowsY=[] }) {
  const next = asArr(speakers).map(s => ({ ...s, position: { ...(s.position || {}) } }));
  const xMin = 0, xMax = room.width, yMin = 0, yMax = room.length;

  // pick a sensible Y band per row to place side surrounds close to that row
  // fallback to mid‑room if we don't know the rows
  const defaultRowY = rowsY.length ? rowsY[Math.floor(rowsY.length/2)] : (yMin + yMax)/2;

  for (const sp of next) {
    const wall = targetWall(sp.role);
    if (!wall || !sp.position) continue;

    // move to wall
    if (wall === 'yMin') sp.position.y = yMin + SNAP_TO_WALL_EPS;
    if (wall === 'yMax') sp.position.y = yMax - SNAP_TO_WALL_EPS;
    if (wall === 'xMin') {
      sp.position.x = xMin + SNAP_TO_WALL_EPS;
      sp.position.y = isNum(sp.position.y) ? sp.position.y : defaultRowY;
    }
    if (wall === 'xMax') {
      sp.position.x = xMax - SNAP_TO_WALL_EPS;
      sp.position.y = isNum(sp.position.y) ? sp.position.y : defaultRowY;
    }

    // corner clearance
    if (wall === 'yMin' || wall === 'yMax') {
      sp.position.x = clamp(sp.position.x, xMin + KEEP_FROM_CORNER_M, xMax - KEEP_FROM_CORNER_M);
    }
    if (wall === 'xMin' || wall === 'xMax') {
      sp.position.y = clamp(sp.position.y, yMin + KEEP_FROM_CORNER_M, yMax - KEEP_FROM_CORNER_M);
    }
  }
  return next;
}