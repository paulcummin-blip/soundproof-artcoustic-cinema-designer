// ProjectOpeningResolver.jsx
// --------------------------
// The project-open resolver owns only the minimum authority needed to enter the
// Room Designer safely: the project identity, active version, room/seating,
// speaker layout and seat priorities.
//
// Reports, published engineering, completed bass, the P14 target bank, proposal
// source data and pricing are deliberately not read here. Their owning routes or
// explicit user actions restore those authorities when they are actually needed.

import { useEffect } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useProjectHydration } from "@/components/state/projectHydrationStore";
import {
  beginProjectOpening,
  isProjectOpeningSatisfied,
  markProjectOpeningSatisfied,
  OPENING_CHECKPOINT_OUTCOME as OUTCOME,
  OPENING_CHECKPOINT_STATE as CHECKPOINT,
  resolveProjectOpeningCheckpoints,
  useProjectOpening,
} from "@/components/state/projectOpeningAuthority";

const ready = (detail) => ({
  state: CHECKPOINT.READY,
  outcome: OUTCOME.READY,
  detail,
});

const notGenerated = (detail) => ({
  state: CHECKPOINT.UNAVAILABLE,
  outcome: OUTCOME.NOT_GENERATED,
  detail,
});

const notApplicable = (detail) => ({
  state: CHECKPOINT.UNAVAILABLE,
  outcome: OUTCOME.NOT_APPLICABLE,
  detail,
});

export default function ProjectOpeningResolver({ projectId }) {
  const hydration = useProjectHydration();
  const app = useAppState();
  const opening = useProjectOpening(projectId || null);

  const isActiveProject = !!projectId && hydration.projectId === projectId;
  const identity = isActiveProject ? hydration.identity : null;
  const versionId = identity?.activeVersionId || null;
  const designReady = isActiveProject && hydration.design === "loaded";

  useEffect(() => {
    if (!projectId) return;
    if (isProjectOpeningSatisfied(projectId)) {
      markProjectOpeningSatisfied(projectId);
      return;
    }
    beginProjectOpening(projectId, { versionId });
  }, [projectId, versionId]);

  useEffect(() => {
    if (!designReady || !identity) return;

    const seats = Array.isArray(app?.seatingPositions)
      ? app.seatingPositions.length
      : 0;
    const speakers = Array.isArray(app?.speakerSystem?.placedSpeakers)
      ? app.speakerSystem.placedSpeakers.length
      : 0;
    const subs = Array.isArray(app?.subwooferInstances)
      ? app.subwooferInstances.filter((instance) => instance?.enabled !== false).length
      : 0;
    const dims = app?.roomDims || {};

    resolveProjectOpeningCheckpoints({
      metadata: ready(
        [identity.name, identity.clientName].filter(Boolean).join(" · ")
          || "Project record loaded.",
      ),
      activeVersion: versionId
        ? ready("Active design version resolved.")
        : notApplicable("This project has no saved design version yet."),
      roomSeating: dims.widthM && dims.lengthM
        ? ready(
          seats > 0
            ? `Room dimensions and ${seats} seating position${seats === 1 ? "" : "s"} restored.`
            : "Room dimensions restored — no seating positions saved yet.",
        )
        : notGenerated(
          "This saved version has no room dimensions yet — continue in the Room Designer.",
        ),
      speakerLayout: speakers > 0
        ? ready(
          `${speakers} loudspeaker${speakers === 1 ? "" : "s"}${subs > 0
            ? ` and ${subs} subwoofer${subs === 1 ? "" : "s"}`
            : ""} restored.`,
        )
        : ready("No loudspeaker layout is saved for this project."),
      seatPriorities: ready("Seat priorities restored from the saved design."),
    });
  }, [
    projectId,
    designReady,
    identity,
    versionId,
    opening.attempt,
    app?.seatingPositions,
    app?.speakerSystem?.placedSpeakers,
    app?.subwooferInstances,
    app?.roomDims,
  ]);

  return null;
}
