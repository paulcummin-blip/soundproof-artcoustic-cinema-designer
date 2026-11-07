// recommendationInputs.js
// ---------------------------------------------------------------------------
// Shared derivation of the cross-quantity recommendation inputs, used by both
// the always-mounted background runner and BassDesignAssistant so the two
// never diverge on RSP position or per-sub amplifier power.

import { DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W } from "@/components/utils/subwooferCapability";

/** RSP position for the placement advisor. Mirrors the previous inline
 *  derivation in BassDesignAssistant: prefer appState.mlp, then fall back to
 *  the room-centre X with the stored MLP Y. */
export function deriveRspPosition(appState, roomDims) {
  const appRsp = appState?.mlp;
  if (Number.isFinite(appRsp?.x) && Number.isFinite(appRsp?.y)) return appRsp;
  const widthM = Number(roomDims?.widthM ?? roomDims?.width);
  const y = Number(appState?.mlpY_m);
  return Number.isFinite(widthM) && Number.isFinite(y) ? { x: widthM / 2, y, z: 1.2 } : null;
}

/** Resolved per-sub amplifier power for the cross-quantity recommendation run,
 *  falling back to the same default the bass engine applies. */
export function deriveAmplifierPowerPerSubW(appState) {
  return Number.isFinite(Number(appState?.splConfig?.subwooferAmplifierPowerW))
    ? Number(appState.splConfig.subwooferAmplifierPowerW)
    : DEFAULT_SUB_AMPLIFIER_POWER_PER_SUB_W;
}