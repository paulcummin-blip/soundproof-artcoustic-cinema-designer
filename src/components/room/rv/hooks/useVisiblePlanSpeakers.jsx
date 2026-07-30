"use client";

import { useMemo } from "react";
import { resolveActiveSpeakerLayout } from "@/components/room/rv/utils/resolveActiveSpeakerLayout";

export function useVisiblePlanSpeakers({ placedSpeakers, getCanonicalRole, getSpeakerVisibility, appState, dolbyLayout }) {
  return useMemo(
    () =>
      resolveActiveSpeakerLayout({
        placedSpeakers,
        appState,
        dolbyLayout,
        getCanonicalRoleFn: getCanonicalRole,
        getSpeakerVisibility,
      }),
    [
      placedSpeakers,
      dolbyLayout,
      appState?.speakerSystem,
      appState?.sevenBedLayoutType,
      appState?.overheadGlobalModel,
      getSpeakerVisibility,
      getCanonicalRole,
    ]
  );
}