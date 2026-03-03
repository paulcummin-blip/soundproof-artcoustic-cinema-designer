// Extracted verbatim from src/pages/RoomDesigner.jsx (lines 1183–1309)
import React from "react";
import { useAppState } from "@/components/AppStateProvider";
import { ensureAtmosOverheads, DOLBY_PRESETS, seedSpeakersFromPreset } from "@/components/room/utils/dolbyHelpers";

// Thin store wrapper over AppStateProvider so the page can read/write speakers
export function useSpeakerSystemStore() {
  const {
    speakerSystem, setSpeakerSystem,
    roomDims, setRoomDims, // Use roomDims from AppState
    screen, setScreen,
    seatingPositions, setSeatingPositions,
    dolbyLayout, // Access current Dolby layout for seeding
    overheadGlobalModel,
    overheadFrontOverride,
    overheadMidOverride,
    overheadRearOverride,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal
  } = useAppState() || {};

  const placedSpeakers = React.useMemo(
    () => Array.isArray(speakerSystem?.placedSpeakers) ? speakerSystem.placedSpeakers : [],
    [speakerSystem?.placedSpeakers]
  );

  const setSpeakers = React.useCallback(
    (listOrUpdater) => {
      if (typeof setSpeakerSystem !== "function") return;

      // Resolve the final list immediately without re-merging with prev
      let finalList = typeof listOrUpdater === "function" ?
      listOrUpdater(Array.isArray(placedSpeakers) ? placedSpeakers : []) :
      Array.isArray(listOrUpdater) ? listOrUpdater : [];

      // NEW: ensure Atmos overheads are present before we hand off to AppState
      finalList = ensureAtmosOverheads({
        placedSpeakers: finalList,
        dolbyPreset: dolbyLayout,
        roomDimensions: roomDims ? {
          width: roomDims.widthM,
          length: roomDims.lengthM,
          height: roomDims.heightM
        } : { width: 4.5, length: 6.0, height: 2.8 },
        overheadGlobalModel,
        overheadFrontOverride,
        overheadMidOverride,
        overheadRearOverride,
        useFrontGlobal,
        useMidGlobal,
        useRearGlobal
      });

      // DEBUG: log what we're actually sending into AppStateProvider
      // (keep this for now while we verify overhead behaviour)
      // eslint-disable-next-line no-console
      if (globalThis.__B44_LOGS) console.log("[RD] setSpeakers sending to AppStateProvider:", {
        count: finalList.length,
        roles: finalList.map((s) => s.role)
      });

      // Push the finished list into AppStateProvider in one shot
      setSpeakerSystem({
        placedSpeakers: finalList
      });
    },
    [setSpeakerSystem, placedSpeakers, dolbyLayout, roomDims, overheadGlobalModel, overheadFrontOverride, overheadMidOverride, overheadRearOverride, useFrontGlobal, useMidGlobal, useRearGlobal]
  );

  const initWithDefaultsAndRules = React.useCallback(() => {
    // This function now relies on `roomDims` from `useAppState`
    const room = {
      width: typeof roomDims?.widthM === "number" ? roomDims.widthM : 4.5,
      length: typeof roomDims?.lengthM === "number" ? roomDims.lengthM : 6.0,
      height: typeof roomDims?.heightM === "number" ? roomDims.heightM : 2.8
    };
    if (typeof setRoomDims === "function") {// Update appState.roomDims
      setRoomDims(room); // Simplified as roomDims stores {widthM, lengthM, heightM}
    }

    if (typeof setScreen === "function") {
      setScreen((prev) => ({
        ...prev,
        visibleWidthInches: prev?.visibleWidthInches || 100,
        aspectRatio: prev?.aspectRatio || "16:9",
        mountMode: "floating", // Enforce floating as default on init
        floatDepthM: typeof prev?.floatDepthM === "number" ? prev.floatDepthM : 0.2, // Default to 0.2 for floating
        heightFromFloorM: typeof prev?.heightFromFloorM === "number" ? prev.heightFromFloorM : 0.5
      }));
    }

    if (typeof setSeatingPositions === "function" && (!Array.isArray(seatingPositions) || seatingPositions.length === 0)) {
      const cx = room.width / 2;
      const THETA = 57.5 * Math.PI / 180;
      const viewWidthM = 100 * 0.0254;
      const d = viewWidthM / 2 / Math.tan(THETA / 2);
      const y = Math.max(0.10, Math.min(room.length - 1.2, d));
      const spacing = 0.6;
      setSeatingPositions([
      { id: "seat-left", x: cx - spacing, y, z: 1.2, rowNumber: 1, seatNumber: 1 },
      { id: "seat-center", x: cx, y, z: 1.2, rowNumber: 1, isPrimary: true },
      { id: "seat-right", x: cx + spacing, y, z: 1.2, rowNumber: 1, seatNumber: 3 }]
      );
    }

    if (typeof setSpeakerSystem === "function") {
      // Determine which preset to seed from based on the current Dolby layout
      const rawPreset = typeof dolbyLayout === "string" ? dolbyLayout : "5.1";
      const normalizedPreset = String(rawPreset).
      split(" ")[0] // "5.1.2 Dolby Atmos" -> "5.1.2"
      .split("_")[0]; // "5.1.2_atmos" -> "5.1.2"

      const presetKey = DOLBY_PRESETS[normalizedPreset] ? normalizedPreset : "5.1";

      const seeded = seedSpeakersFromPreset({
        preset: presetKey,
        roomDimensions: room,
        listeningArea: null
      });
      if (globalThis.__B44_LOGS) console.log("[RD] SEED RESULT:", seeded.map((s) => s.role));
      setSpeakerSystem((prev) => ({ ...(prev || {}), placedSpeakers: seeded }));
    }
  }, [roomDims, seatingPositions, dolbyLayout, setRoomDims, setScreen, setSeatingPositions, setSpeakerSystem]);

  return {
    placedSpeakers,
    setSpeakers,
    initWithDefaultsAndRules,
    setSpeakerSystem // Expose for useProjectLoader
  };
}