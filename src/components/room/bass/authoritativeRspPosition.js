// Pure authority for building the canonical RSP position object used by the
// bass engine and fingerprints. Extracted from useAuthoritativeBassResponse
// so cold-hydration regression tests can import it under bare Node (the
// parent module pulls in @/-aliased registry/integration deps).
//
// SEAT-BOUND RSP (designatedRspSeat provided):
//   The canonical RSP uses the designated seat's EXACT x/y/z. The RSP
//   listener and the designated seat listener are the same physical point,
//   so the bass simulation produces bit-identical curves for both and P20
//   for that seat evaluates to 0 dB naturally — no hardcoding.
//
// FREE-FLOATING RSP (designatedRspSeat null):
//   The RSP is an independent synthetic point (auto-from-screen, manual, or
//   row-derived). designatedRspSeatId is null; no real seat is forced to 0.

/**
 * Build the canonical RSP position used by the bass engine.
 * Returns null when room width or mlpY_m are missing/non-positive AND no
 * valid designated seat is provided.
 *
 * @param {{widthM:number}} roomDims
 * @param {number} mlpY_m
 * @param {number} [mlpX_m] - canonical green-dot X; falls back to room centreline.
 * @param {{id:string, x:number, y:number, z:number}|null} [designatedRspSeat]
 *   Resolved designated seat. When provided with finite x/y, the RSP uses its
 *   exact coordinates (seat-bound RSP).
 * @returns {{id:string,x:number,y:number,z:number,designatedRspSeatId:string|null,__isSyntheticRsp:boolean}|null}
 */
export function buildAuthoritativeRspPosition(roomDims, mlpY_m, mlpX_m, designatedRspSeat) {
  // SEAT-BOUND RSP — exact designated-seat coordinates win.
  if (designatedRspSeat && Number.isFinite(Number(designatedRspSeat.x)) && Number.isFinite(Number(designatedRspSeat.y))) {
    const z = Number.isFinite(Number(designatedRspSeat.z)) ? Number(designatedRspSeat.z) : 1.2;
    const seatId = typeof designatedRspSeat.id === "string" && designatedRspSeat.id.trim() ? designatedRspSeat.id : null;
    return { id: "rsp", x: Number(designatedRspSeat.x), y: Number(designatedRspSeat.y), z, designatedRspSeatId: seatId, __isSyntheticRsp: true };
  }

  // FREE-FLOATING RSP — synthetic point from mlpY_m / mlpX_m.
  const widthM = Number(roomDims?.widthM);
  const y = Number(mlpY_m);
  if (!Number.isFinite(widthM) || !Number.isFinite(y) || widthM <= 0 || y <= 0) return null;
  const x = Number.isFinite(Number(mlpX_m)) ? Number(mlpX_m) : widthM / 2;
  return { id: "rsp", x, y, z: 1.2, designatedRspSeatId: null, __isSyntheticRsp: true };
}