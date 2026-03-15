// Wall projection helpers extracted from SpeakerPlacement
// No React dependencies

export function projectToWallFromMLP_xy(mlp, angleDeg, room) {
  const a = (angleDeg % 360 + 360) % 360;
  const rad = (a * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const EPS_LOCAL = 1e-6;
  const ts = [];

  if (Math.abs(dx) > EPS_LOCAL) {
    const tL = (room.left  - mlp.x) / dx;
    const tR = (room.right - mlp.x) / dx;
    if (tL > EPS_LOCAL) ts.push({ t: tL, wall: 'L' });
    if (tR > EPS_LOCAL) ts.push({ t: tR, wall: 'R' });
  }
  if (Math.abs(dy) > EPS_LOCAL) {
    const tF = (room.front - mlp.y) / dy;
    const tB = (room.back  - mlp.y) / dy;
    if (tF > EPS_LOCAL) ts.push({ t: tF, wall: 'F' });
    if (tB > EPS_LOCAL) ts.push({ t: tB, wall: 'B' });
  }

  if (!ts.length) {
    return { x: mlp.x, y: room.back, wall: 'B' };
  }

  ts.sort((a, b) => a.t - b.t);
  const hit = ts[0];
  const x = mlp.x + hit.t * dx;
  const y = mlp.y + hit.t * dy;
  return { x, y, wall: hit.wall };
}

export function projectToBackWallFromMLP_xy(mlp, angleDeg, room, speakerModel, getModelDimsM, WALL_BUFFER_M) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const rawDims = (() => {
    try { return getModelDimsM?.(speakerModel); }
    catch (e) { return null; }
  })();

  const widthM = Number.isFinite(rawDims?.widthM) ? rawDims.widthM : 0.20;
  const depthM = Number.isFinite(rawDims?.depthM) ? rawDims.depthM : 0.082;
  const halfShortEdge = Math.min(widthM, depthM) / 2;

  const backWallY = room.back - (WALL_BUFFER_M + halfShortEdge);

  const EPS = 1e-6;
  if (dy < EPS) {
    return projectToWallFromMLP_xy(mlp, angleDeg, room);
  }

  const t = (backWallY - mlp.y) / dy;
  if (t <= EPS) {
    return projectToWallFromMLP_xy(mlp, angleDeg, room);
  }

  let x = mlp.x + t * dx;
  const minX = WALL_BUFFER_M + halfShortEdge;
  const maxX = room.right - (WALL_BUFFER_M + halfShortEdge);
  x = Math.max(minX, Math.min(maxX, x));

  return { x, y: backWallY, wall: 'B' };
}

export function projectToWallFromMLP(mlpX, mlpY, angleDeg, room) {
  const degToRad = (deg) => (deg * Math.PI) / 180;
  const angle = degToRad(angleDeg);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const margin = 0.01;

  let t = Infinity;
  if (dx < 0) t = Math.min(t, (room.left + margin - mlpX) / dx);
  if (dx > 0) t = Math.min(t, (room.right - margin - mlpX) / dx);
  if (dy < 0) t = Math.min(t, (room.front + margin - mlpY) / dy);
  if (dy > 0) t = Math.min(t, (room.back - margin - mlpY) / dy);

  if (!isFinite(t) || t <= 0) {
    return { x: mlpX, y: mlpY };
  }

  return { x: mlpX + dx * t, y: mlpY + dy * t };
}