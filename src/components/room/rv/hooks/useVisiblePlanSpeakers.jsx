"use client";

import { useMemo } from "react";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";
import { isRenderableSpeaker } from "@/components/room/rv/RenderPrimitives";

export function useVisiblePlanSpeakers({ placedSpeakers, getCanonicalRole, getSpeakerVisibility, appState, dolbyLayout }) {
  return useMemo(() => {
    const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const afterRenderable = rawSpeakers.filter(isRenderableSpeaker);

    const speakerSystem = appState?.speakerSystem;
    const sevenBedLayoutType = appState?.sevenBedLayoutType;

    const layoutRaw = speakerSystem?.dolbyLayout ?? speakerSystem?.dolbyPreset ?? dolbyLayout ?? "5.1";
    const layoutKey = (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1").toString().trim().split(" ")[0].split("_")[0];
    const useWidesInsteadOfRears = !!speakerSystem?.useWidesInsteadOfRears || speakerSystem?.sevenBedLayoutType === "wides" || sevenBedLayoutType === "wides" || false;

    const allowedRoles = new Set(rolesForLayout({ dolbyLayout: layoutKey, useWidesInsteadOfRears: !!useWidesInsteadOfRears }));

    // Overheads are OFF if the overhead global model is OFF/none/blank
    const overheadGlobalModel =
      appState?.overheadGlobalModel ??
      appState?.overheadState?.globalModel ??
      speakerSystem?.overheadGlobalModel ??
      null;

    const overheadsAreOff = (() => {
      const ms = String(overheadGlobalModel ?? "").trim().toLowerCase();
      return !ms || ms === "off" || ms === "none";
    })();

    return afterRenderable.filter((s) => {
      const canon = getCanonicalRole(s?.role);

      // Always hide LFE
      if (canon === "LFE") return false;

      // Overheads: must be allowed by the layout (5.1 must hide all "T*" roles)
      if (String(canon).toUpperCase().startsWith("T")) {
        if (!allowedRoles.has(canon)) return false;
        if (overheadsAreOff) return false;
        return true;
      }

      // LCR bed speakers: always visible using canonical runtime names (FL/FC/FR)
      if (canon === "FL" || canon === "FC" || canon === "FR") return true;

      // Bed surrounds: controlled by layout role visibility
      if (["SL","SR","SBL","SBR","LW","RW"].includes(canon)) {
        return allowedRoles.has(canon);
      }

      // Extra side surrounds (SL2/SR2, SL3/SR3…): visible when side surrounds are allowed
      if (/^(SL|SR)\d+$/.test(canon)) {
        return allowedRoles.has("SL");
      }

      // Everything else keeps existing behaviour
      return getSpeakerVisibility(s.role, s.model);
    });
  }, [placedSpeakers, dolbyLayout, appState?.speakerSystem, appState?.sevenBedLayoutType, getSpeakerVisibility, getCanonicalRole]);
}