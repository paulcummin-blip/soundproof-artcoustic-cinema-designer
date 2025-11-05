export function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

export function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

export function getAngleBetweenPoints(origin, point) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

export function getDistance3D(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dz = point2.z - point1.z;
  return Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2);
}

export function getDistance2D(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx ** 2 + dy ** 2);
}

export function normalizeAngle(angle) {
  while (angle > 180) angle -= 360;
  while (angle <= -180) angle += 360;
  return angle;
}

export function degreesBetweenVectors(vec1, vec2) {
  const dot = vec1.x * vec2.x + vec1.y * vec2.y;
  const mag1 = Math.hypot(vec1.x, vec1.y) || 1;
  const mag2 = Math.hypot(vec2.x, vec2.y) || 1;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosTheta) * (180 / Math.PI);
}