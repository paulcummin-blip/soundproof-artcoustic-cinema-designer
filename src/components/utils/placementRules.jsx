
// --- Defensive helpers ---
const A = (x) => (Array.isArray(x) ? x : []);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function angleDeg(ax, ay) { return Math.atan2(ay, ax) * 180 / Math.PI; }
function vec(a, b) { return { x: (b.x - a.x), y: (b.y - a.y) }; }
function polarAngle(from, to) {
  if (!from || !to) return null;
  // Adjusted for plan view: 0 deg is up (-Y), 90 deg is right (+X)
  return (Math.atan2(to.x - from.x, from.y - to.y) * 180 / Math.PI + 360) % 360;
}
function midAngle(a, b) {
  // robust average on a circle
  const r = (a * Math.PI/180), s = (b * Math.PI/180);
  const x = Math.cos(r) + Math.cos(s);
  const y = Math.sin(r) + Math.sin(s);
  return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
}
function pointFrom(mlp, angleDeg, radius) {
  const r = (angleDeg * Math.PI)/180;
  // Adjusted for plan view
  return { x: mlp.x + Math.sin(r) * radius, y: mlp.y - Math.cos(r) * radius };
}

/**
 * Auto place LW/RW at the median azimuth between (L,LS) and (R,RS) from MLP.
 * Only runs for 7+ channel bed configurations.
 * Keeps radius roughly between L and LS distances (averaged).
 * Returns a new array (does not mutate).
 */
export function autoAlignWidesMedian(speakers, mlp) {
  const list = A(speakers).map(s => ({ ...s, position: s?.position ? { ...s.position } : undefined }));
  if (!mlp) return list;

  // 1) Guard for bed channel count
  const roles = A(speakers).map(s => s.role);
  const bedRoles = roles.filter(r =>
    ['L','C','R','LS','RS','LR','RR','LW','RW'].includes(r)
  );

  // count distinct bed roles
  const bedCount = new Set(bedRoles).size;

  // Only run wides placement if >= 7 bed channels
  if (bedCount < 7) return list;

  // 2) Still guard for LW/RW presence before trying to place
  const LWexists = roles.includes('LW');
  const RWexists = roles.includes('RW');
  if (!LWexists && !RWexists) return list;

  const byRole = new Map(list.map(s => [s.role, s]));
  const L  = byRole.get('L')?.position;
  const R  = byRole.get('R')?.position;
  const LS = byRole.get('LS')?.position;
  const RS = byRole.get('RS')?.position;

  // If we can’t compute for a side, skip that side
  const leftTargetAngle  = (L && LS) ? midAngle(polarAngle(mlp, L),  polarAngle(mlp, LS)) : null;
  const rightTargetAngle = (R && RS)? midAngle(polarAngle(mlp, R),  polarAngle(mlp, RS)) : null;

  const dist = (p) => Math.hypot((p?.x ?? mlp.x) - mlp.x, (p?.y ?? mlp.y) - mlp.y);
  const leftRadius  = (isNum(dist(L)) && isNum(dist(LS))) ? (dist(L)+dist(LS))/2 : 2.0;
  const rightRadius = (isNum(dist(R)) && isNum(dist(RS))) ? (dist(R)+dist(RS))/2 : 2.0;

  const LW = byRole.get('LW'); const RW = byRole.get('RW');
  if (LW && leftTargetAngle !== null) {
    LW.position = LW.position ?? {};
    const p = pointFrom(mlp, leftTargetAngle, leftRadius);
    LW.position.x = p.x; LW.position.y = p.y; LW.position.z = LW.position.z ?? 1.2;
  }
  if (RW && rightTargetAngle !== null) {
    RW.position = RW.position ?? {};
    const p = pointFrom(mlp, rightTargetAngle, rightRadius);
    RW.position.x = p.x; RW.position.y = p.y; RW.position.z = RW.position.z ?? 1.2;
  }
  return list;
}

/** Compute P7 levels for a single side (left or right). */
export function gradeWideDeviation({ mlp, wide, anchorA, anchorB }) {
  if (!mlp || !wide || !anchorA || !anchorB) return null;
  const a1 = polarAngle(mlp, anchorA);
  const a2 = polarAngle(mlp, anchorB);
  if (a1 === null || a2 === null) return null;
  const target = midAngle(a1, a2);
  const actual = polarAngle(mlp, wide);
  if (actual === null) return null;
  const delta = Math.abs((((actual - target) + 540) % 360) - 180); // shortest angular diff

  let level = 1;
  if (delta <= 5) level = 4;
  else if (delta <= 10) level = 3;
  else if (delta <= 15) level = 2;

  return { level, deviation: delta, targetAngle: target, actualAngle: actual };
}

// Dummy export for autoNudgeBedLayer to prevent import errors elsewhere
export const autoNudgeBedLayer = ({ speakers }) => speakers;
