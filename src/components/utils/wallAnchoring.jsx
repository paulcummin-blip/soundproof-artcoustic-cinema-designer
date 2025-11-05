// utils/wallAnchoring.jsx
const asArr = (x)=>Array.isArray(x)?x:[];
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

/**
 * Snap listener-level speakers to walls with keep-outs, without moving L/C/R depth.
 * - L/C/R: fixed at front wall (frontY)
 * - LS/RS rows: snap to side walls (leftX/rightX)
 * - Rears: snap to back wall (backY)
 */
export function anchorListenerLayerToWalls({
  speakers,
  room,                 // {xMin,xMax,yMin,yMax}
  frontY = 0.10,        // 10 cm off front wall
  sideKeep = 0.15,      // 15 cm off side walls
  backKeep = 0.15       // 15 cm off back wall
}) {
  const next = asArr(speakers).map(s=>({...s, position:{...(s.position||{})}}));
  const leftX  = room.xMin + sideKeep;
  const rightX = room.xMax - sideKeep;
  const backY  = room.yMax - backKeep;

  const setPos = (role, fn) => {
    const i = next.findIndex(s => s.role === role);
    if (i !== -1) next[i].position = fn(next[i].position||{});
  };

  // L/C/R at front line
  setPos('L',  p => ({...p, y: frontY}));
  setPos('C',  p => ({...p, y: frontY}));
  setPos('R',  p => ({...p, y: frontY}));

  // Wides also on front line (if present)
  setPos('LW', p => ({...p, y: frontY}));
  setPos('RW', p => ({...p, y: frontY}));

  const sideRolesLeft  = ['LS','LSS','LRS','LBS'];
  const sideRolesRight = ['RS','RSS','RRS','RBS'];
  const rearRoles      = ['LRS','RRS','LBS','RBS']; // rears/backs on back wall Y, but side‑snapped X

  for (const r of sideRolesLeft) {
    const i = next.findIndex(s => s.role === r);
    if (i !== -1) next[i].position.x = leftX;
  }
  for (const r of sideRolesRight) {
    const i = next.findIndex(s => s.role === r);
    if (i !== -1) next[i].position.x = rightX;
  }
  for (const r of rearRoles) {
    const i = next.findIndex(s => s.role === r);
    if (i !== -1) next[i].position.y = backY;
  }

  // guard bounds
  for (const s of next) {
    if (!s.position) continue;
    s.position.x = clamp(s.position.x, room.xMin + sideKeep, room.xMax - sideKeep);
    s.position.y = clamp(s.position.y, room.yMin + 0.10, room.yMax - 0.10);
  }

  return next;
}