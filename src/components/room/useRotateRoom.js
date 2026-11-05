// useRotateRoom.js
//
// Hook that performs the two-state Rotate Room action for Sound Proof.
//
// On rotate:
//   - toggles the per-version room orientation (length_front ↔ width_front)
//   - swaps the effective Width and Length in appState
//   - clears every design-specific object (screen, speakers, subwoofers,
//     seating, projector, manual RSP, per-seat metrics, screen plane)
//   - transforms architectural room elements (doors/windows) to the new
//     orientation, keeping them on their original physical walls
//   - clears stale engineering / bass / ADI results so nothing from the
//     previous orientation is presented as valid
//
// The physical room dimensions on the Project entity are never changed by
// rotation — only the per-version orientation and the derived effective dims.

import { useCallback } from "react";
import { useAppState } from "@/components/AppStateProvider";
import {
  ORIENTATION_LENGTH_FRONT,
  toggleOrientation,
  resolvePhysicalRoomDims,
  transformRoomElementsForRotation,
} from "@/components/utils/roomOrientationAuthority";
import { clearDesignReviewHandoff } from "@/components/state/designReviewHandoff";
import { resetAppliedCalibrationAuthority } from "@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore";
import { resetOptimiserPlanAuthority } from "@/components/room/bass/optimiserPlan/optimiserPlanStore";
import { INSTANCE_STATUS, MIGRATION_STATE } from "@/components/utils/subwooferInstanceCompatibility";

function getActiveProjectId() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("projectId") || url.searchParams.get("project") || url.searchParams.get("id") || null;
  } catch {
    return null;
  }
}

export function useRotateRoom() {
  const appState = useAppState();

  const rotateRoom = useCallback(() => {
    const currentOrientation = appState?.roomOrientation || ORIENTATION_LENGTH_FRONT;
    const targetOrientation = toggleOrientation(currentOrientation);
    const effectiveDims = appState?.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };

    // Swap effective Width and Length (height unchanged).
    const nextDims = {
      widthM: Number(effectiveDims.lengthM) || 0,
      lengthM: Number(effectiveDims.widthM) || 0,
      heightM: Number(effectiveDims.heightM) || 2.4,
    };
    nextDims.width = nextDims.widthM;
    nextDims.length = nextDims.lengthM;
    nextDims.height = nextDims.heightM;

    // Transform architectural elements (doors/windows) to the new orientation,
    // removing projectors. Physical wall assignments are preserved.
    const transformedElements = transformRoomElementsForRotation(
      appState?.roomElements || [],
      currentOrientation,
      targetOrientation,
      effectiveDims,
    );

    // 1. Effective dimensions + orientation
    appState?.setRoomDims?.(nextDims);
    appState?.setRoomOrientation?.(targetOrientation);

    // 2. Clear screen / TV
    appState?.setScreen?.({
      visibleWidthInches: 100,
      aspectRatio: "16:9",
      mountMode: "floating",
      floatDepthM: 0.2,
      showScreenPlane: false,
      showCavity: false,
      speakerClearanceM: 0.02,
      heightFromFloorM: 0.5,
      tvPresetKey: null,
      tvWidthMm: null,
      borderThicknessM: 0.08,
    });
    appState?.setScreenHeight?.(0.5);
    appState?.setScreenFrontPlaneM?.(null);
    appState?.setScreenCentreDepthM?.(null);

    // 3. Clear loudspeakers
    appState?.setSpeakerSystem?.({ placedSpeakers: [], lastUpdated: Date.now() });
    appState?.setSelectedSpeakersByRole?.({});
    appState?.setSpeakerNodes?.([]);
    appState?.setGlobalSurroundModel?.(null);
    appState?.setExtraSurroundCount?.(0);

    // 4. Clear subwoofers
    appState?.setSubwooferInstances?.([]);
    appState?.setSubwoofers?.([]);
    appState?.setSubwooferInstancesStatus?.(INSTANCE_STATUS.VALID);
    appState?.setSubwooferInstanceMigrationState?.(MIGRATION_STATE.NONE);
    appState?.setFrontSubsCfg?.({
      model: "SUB2-12", count: 0, positions: [], tuning: [],
      orientation: "vertical", placementMode: "default",
    });
    appState?.setRearSubsCfg?.({
      model: "SUB2-12", count: 0, positions: [], tuning: [],
      orientation: "vertical", placementMode: "default",
    });

    // 5. Clear seating
    appState?.setSeatingPositions?.([]);
    appState?.setSeatsPerRowByRow?.([]);
    appState?.setSeatingRows?.(1);
    appState?.setSeatsPerRow?.(3);
    appState?.setAppliedSeatingProvenance?.(null);
    appState?.setMlpOverride?.(null);
    appState?.setMlpY_m?.(null);
    appState?.setMlpX_m?.(null);
    appState?.setRowCentersM?.([]);

    // 6. Manual RSP
    appState?.resetRspState?.();

    // 7. Room elements: transformed architectural elements only (projectors removed)
    appState?.setRoomElements?.(transformedElements);

    // 8. Clear per-seat RP22 metrics (geometry-dependent, now stale)
    appState?.setPerSeatMetrics?.({});

    // 9. Clear overhead selections (design-specific)
    appState?.setOverheadGlobalModel?.(null);
    appState?.setOverheadFrontOverride?.(null);
    appState?.setOverheadMidOverride?.(null);
    appState?.setOverheadRearOverride?.(null);

    // 10. Clear stale engineering / bass / ADI results
    const projectId = getActiveProjectId();
    const versionId = appState?.activeVersionId || null;
    if (projectId && versionId) {
      clearDesignReviewHandoff(projectId, versionId);
      resetAppliedCalibrationAuthority(projectId, versionId);
      resetOptimiserPlanAuthority(projectId, versionId);
    }
    if (typeof window !== "undefined") {
      window.__ROOM_DESIGNER_ASDR__ = null;
    }

    // Force a rebuild of derived geometry.
    appState?.setRoomResetEpoch?.((prev) => (typeof prev === "number" ? prev + 1 : 1));
  }, [appState]);

  return rotateRoom;
}

export default useRotateRoom;