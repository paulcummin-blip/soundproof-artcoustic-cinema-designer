// Pure authority for building the canonical RSP position object used by the
// bass engine and fingerprints. Extracted from useAuthoritativeBassResponse
// so cold-hydration regression tests can import it under bare Node (the
// parent module pulls in @/-aliased registry/integration deps).
//
// Behaviour is identical to the previous inline definition — this is a pure
// relocation, not a maths change.

/**
 * Build the canonical synthetic RSP position used by the bass engine.
 * Returns null when room width or mlpY_m are missing/non-positive.
 *
 * @param {{widthM:number}} roomDims
 * @param {number} mlpY_m
 * @param {number} [mlpX_m] - canonical green-dot X; falls back to room centreline.
 * @returns {{id:string,x:number,y:number,z:number,__isSyntheticRsp:boolean}|null}
 */
export function buildAuthoritativeRspPosition(roomDims, mlpY_m, mlpX_m) {
  const widthM = Number(roomDims?.widthM);
  const y = Number(mlpY_m);
  if (!Number.isFinite(widthM) || !Number.isFinite(y) || widthM <= 0 || y <= 0) return null;
  // Stage B1: use canonical green-dot X (mlpX_m) when finite; else room centreline.
  const x = Number.isFinite(Number(mlpX_m)) ? Number(mlpX_m) : widthM / 2;
  return { id: "rsp", x, y, z: 1.2, __isSyntheticRsp: true };
}