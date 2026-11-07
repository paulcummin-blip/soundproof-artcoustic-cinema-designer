// recommendationInputs.js
// ---------------------------------------------------------------------------
// Shared derivation of the cross-quantity recommendation inputs, used by both
// the always-mounted background runner and BassDesignAssistant so the two
// never diverge on RSP position or per-sub amplifier power.

import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";

/** Use the effective RSP coordinates consumed by RoomDesigner. appState.mlp
 * is row-derived and can differ from a manually positioned RSP. */
export function deriveRspPosition(appState, roomDims) {
  const widthM = Number(roomDims?.widthM ?? roomDims?.width);
  const x = appState?.mlpX_m == null ? widthM / 2 : Number(appState.mlpX_m);
  const y = appState?.mlpY_m == null ? NaN : Number(appState.mlpY_m);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    const seat = appState?.rspMode === "seat_bound"
      ? appState?.seatingPositions?.find(s => s.id === appState?.designatedRspSeatId)
      : null;
    const z = seat?.z == null ? 1.2 : Number(seat.z);
    return { x, y, z: Number.isFinite(z) ? z : 1.2 };
  }
  const appRsp = appState?.mlp;
  return Number.isFinite(appRsp?.x) && Number.isFinite(appRsp?.y) ? appRsp : null;
}

/** Resolved per-sub amplifier power for the cross-quantity recommendation run,
 *  falling back to the same default the bass engine applies. */
export function deriveAmplifierPowerPerSubW(appState) {
  return Number.isFinite(Number(appState?.splConfig?.subwooferAmplifierPowerW))
    ? Number(appState.splConfig.subwooferAmplifierPowerW)
    : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
}