// resolveActiveSpeakerLayout.js
// Canonical active speaker layout resolver — single source of truth for
// which speakers are currently active and should be rendered.
//
// Both Plan View (via useVisiblePlanSpeakers) and Side Elevation consume
// this same logic so removed/disabled speakers disappear immediately when
// the Dolby layout or front-wide / rear-surround configuration changes.

import { useMemo } from "react";
import { rolesForLayout, getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { isRenderableSpeaker } from "@/components/room/rv/RenderPrimitives";

/**
 * Pure function: resolve the active speaker layout from raw placed speakers
 * and the current app/speaker-system state.
 *
 * @param {Object} params
 * @param {Array}  params.placedSpeakers      - Raw placed speakers array
 * @param {Object} params.appState            - AppState object (speakerSystem, overheadGlobalModel, etc.)
 * @param {string} [params.dolbyLayout]        - Fallback Dolby layout key (e.g. "5.1", "7.1.4")
 * @param {Function} [params.getCanonicalRoleFn] - Override for getCanonicalRole (defaults to shared)
 * @param {Function} [params.getSpeakerVisibility] - Visibility predicate (role, model) => boolean
 * @returns {Array} Filtered array of currently-active, renderable speakers
 */
export function resolveActiveSpeakerLayout({
  placedSpeakers,
  appState,
  dolbyLayout,
  getCanonicalRoleFn,
  getSpeakerVisibility,
}) {
  const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const afterRenderable = rawSpeakers.filter(isRenderableSpeaker);

  const speakerSystem = appState?.speakerSystem;
  const sevenBedLayoutType = appState?.sevenBedLayoutType;

  const layoutRaw =
    speakerSystem?.dolbyLayout ??
    speakerSystem?.dolbyPreset ??
    dolbyLayout ??
    "5.1";
  const layoutKey = (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1")
    .toString()
    .trim()
    .split(" ")[0]
    .split("_")[0];
  const useWidesInsteadOfRears =
    !!speakerSystem?.useWidesInsteadOfRears ||
    speakerSystem?.sevenBedLayoutType === "wides" ||
    sevenBedLayoutType === "wides" ||
    false;

  const allowedRoles = new Set(
    rolesForLayout({ dolbyLayout: layoutKey, useWidesInsteadOfRears: !!useWidesInsteadOfRears })
  );

  const overheadGlobalModel =
    appState?.overheadGlobalModel ??
    appState?.overheadState?.globalModel ??
    speakerSystem?.overheadGlobalModel ??
    null;

  const overheadsAreOff = (() => {
    const ms = String(overheadGlobalModel ?? "").trim().toLowerCase();
    return !ms || ms === "off" || ms === "none";
  })();

  const canonFn = getCanonicalRoleFn || getCanonicalRole;
  const visFn = getSpeakerVisibility || (() => true);

  return afterRenderable.filter((s) => {
    const canon = canonFn(s?.role);

    // Always hide LFE
    if (canon === "LFE") return false;

    // Overheads: must be allowed by the layout (5.1 hides all "T*" roles)
    if (String(canon).toUpperCase().startsWith("T")) {
      if (!allowedRoles.has(canon)) return false;
      if (overheadsAreOff) return false;
      return true;
    }

    // LCR bed speakers: always visible
    if (canon === "FL" || canon === "FC" || canon === "FR") return true;

    // Bed surrounds: controlled by layout role visibility
    if (["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) {
      return allowedRoles.has(canon);
    }

    // Extra side surrounds (SL2/SR2, SL3/SR3…): visible when side surrounds are allowed
    if (/^(SL|SR)\d+$/.test(canon)) {
      return allowedRoles.has("SL");
    }

    // Everything else keeps existing behaviour
    return visFn(s.role, s.model);
  });
}

/**
 * React hook wrapper around resolveActiveSpeakerLayout.
 * Memoised on the same dependency surface as useVisiblePlanSpeakers.
 */
export function useResolvedSpeakerLayout({
  placedSpeakers,
  appState,
  dolbyLayout,
  getCanonicalRoleFn,
  getSpeakerVisibility,
}) {
  return useMemo(
    () =>
      resolveActiveSpeakerLayout({
        placedSpeakers,
        appState,
        dolbyLayout,
        getCanonicalRoleFn,
        getSpeakerVisibility,
      }),
    [
      placedSpeakers,
      appState?.speakerSystem,
      appState?.sevenBedLayoutType,
      appState?.overheadGlobalModel,
      dolbyLayout,
      getSpeakerVisibility,
      getCanonicalRoleFn,
    ]
  );
}