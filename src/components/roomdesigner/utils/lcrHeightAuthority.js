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
export function resolveLcrHeightAuthority({ role, newZ, frontStageMode }) {
  if (frontStageMode === "center_only") {
    if (role === "FL" || role === "FR") {
      return { lcrLRHeightM: newZ };
    }
    if (role === "FC") {
      return { lcrHeightM: newZ, lcrHeightManual: true };
    }
  }
  return { lcrHeightM: newZ, lcrHeightManual: true };
}