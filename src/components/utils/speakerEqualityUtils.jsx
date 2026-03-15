export const __b44SigFor = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export function __b44SameSpeakers(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const A = a[i] || {};
    const B = b[i] || {};

    if ((A.id ?? null) !== (B.id ?? null)) return false;
    if ((A.role ?? null) !== (B.role ?? null)) return false;
    if ((A.model ?? null) !== (B.model ?? null)) return false;

    const Ap = A.position || {};
    const Bp = B.position || {};
    if (!Number.isFinite(Ap.x) || !Number.isFinite(Ap.y) || !Number.isFinite(Bp.x) || !Number.isFinite(Bp.y)) {
      if (A.position || B.position) return false;
    } else {
      if (Math.abs(Ap.x - Bp.x) > 1e-4) return false;
      if (Math.abs(Ap.y - Bp.y) > 1e-4) return false;
      if (Number.isFinite(Ap.z) || Number.isFinite(Bp.z)) {
        if (Math.abs((Ap.z ?? 0) - (Bp.z ?? 0)) > 1e-4) return false;
      }
    }
  }

  return true;
}