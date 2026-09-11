// Pure helpers for LCR front-elevation height authority.
// Extracted from useElevationDragHandlers so the height-authority decision
// is testable without React hooks.
//
// Centre-only mode (soundbar FC + separate FL/FR):
//   FL/FR height authority → lcrLRHeightM
//   FC height authority    → lcrHeightM
//
// Standard / integrated_lcr mode:
//   All LCR height authority → lcrHeightM
//
// A deliberate vertical drag enters manual mode (lcrHeightManual: true) so
// the auto-height effect does not fight the user's drag.

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { resolveEffectiveViewableDimsM } from "@/components/models/screen/resolveEffectiveScreen";

function canonRole(role) {
  const r = String(role || "").toUpperCase();
  const map = { L: "FL", C: "FC", R: "FR", FL: "FL", FC: "FC", FR: "FR" };
  return map[r] || r;
}

/**
 * Detect the front-stage mode from the FC speaker model's frontStageType.
 * Returns 'center_only', 'integrated_lcr', or 'standard'.
 */
export function detectFrontStageMode(placedSpeakers) {
  const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const fcSpk = list.find((s) => canonRole(s?.role) === "FC");
  const fcMeta = fcSpk?.model ? getSpeakerModelMeta(fcSpk.model) : null;
  if (fcMeta?.frontStageType === "integrated_lcr") return "integrated_lcr";
  if (fcMeta?.frontStageType === "center_only") return "center_only";
  return "standard";
}

/**
 * Resolve the updateGlobalSpl patch for a vertical LCR drag.
 * Returns the patch object to merge into splConfig.
 *
 * centre_only + FL/FR → { lcrLRHeightM } (FC authority untouched)
 * centre_only + FC    → { lcrHeightM, lcrHeightManual: true }
 * standard/integrated → { lcrHeightM, lcrHeightManual: true }
 */
/**
 * Compute the TV vertical centre (acoustic-centre height) from the resolved
 * screen geometry. This is the canonical FL/FR auto-height target in
 * center_only mode — it NEVER derives from the centre/soundbar height.
 *
 * TV centre Y = screenBottom + (viewable height / 2)
 *
 * Returns null when screen geometry is unavailable.
 */
export function computeTvVerticalCentreM(screen, dimensions) {
  const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;
  const screenBottom = Number(screen?.heightFromFloorM);
  const viewable = resolveEffectiveViewableDimsM(screen);
  const viewableHeightM = Number(viewable?.heightM);
  if (Number.isFinite(screenBottom) && Number.isFinite(viewableHeightM) && viewableHeightM > 0) {
    return screenBottom + viewableHeightM / 2;
  }
  // Fallback to room mid-height when screen geometry is unavailable.
  return roomH * 0.5;
}

export function resolveLcrHeightAuthority({ role, newZ, frontStageMode }) {
  if (frontStageMode === "center_only") {
    if (role === "FL" || role === "FR") {
      // FL/FR drag enters manual mode so the TV-centre auto-follow does not
      // fight the user's drag.
      return { lcrLRHeightM: newZ, lcrLRHeightManual: true };
    }
    if (role === "FC") {
      return { lcrHeightM: newZ, lcrHeightManual: true };
    }
  }
  return { lcrHeightM: newZ, lcrHeightManual: true };
}