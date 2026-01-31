/**
 * Extra Surround Drag Handler
 * Clamps extra surrounds to nearest wall (left/right/rear) during drag
 */

export function clampExtraSurroundToWall(position, roomDims) {
  const W = Number(roomDims?.width ?? roomDims?.widthM) || 0;
  const L = Number(roomDims?.length ?? roomDims?.lengthM) || 0;
  
  if (W <= 0 || L <= 0) return { ...position, wall: 'left' };
  
  const INSET = 0.02; // Same inset as other wall speakers
  const { x, y, z } = position;
  
  // Calculate distances to each wall
  const distToLeft = Math.abs(x - 0);
  const distToRight = Math.abs(x - W);
  const distToRear = Math.abs(y - L);
  
  // Find nearest wall (exclude front wall)
  const distances = [
    { wall: 'left', dist: distToLeft, x: INSET, y },
    { wall: 'right', dist: distToRight, x: W - INSET, y },
    { wall: 'rear', dist: distToRear, x, y: L - INSET },
  ];
  
  distances.sort((a, b) => a.dist - b.dist);
  const nearest = distances[0];
  
  // Clamp to wall boundaries
  const clampedX = Math.max(INSET, Math.min(W - INSET, nearest.x));
  const clampedY = Math.max(INSET, Math.min(L - INSET, nearest.y));
  
  return {
    x: clampedX,
    y: clampedY,
    z: z || 1.1,
    wall: nearest.wall,
  };
}

export function getExtraSurroundLabel(extra, allExtras) {
  if (!extra?.wall) return 'Extra';
  
  // Count position in sequence (creation order)
  const sameWall = allExtras.filter(e => e.wall === extra.wall);
  const index = sameWall.findIndex(e => e.id === extra.id);
  const num = index + 1;
  
  if (extra.wall === 'rear') {
    return `Extra Rear ${num}`;
  } else {
    return `Extra Side ${num}`;
  }
}