import { useMemo } from "react";
import { safeCanon } from "@/components/room/utils/speakerHelpers";
import { rolesForLayout } from "@/components/utils/surroundRoleMap";

/**
 * Derives the filtered list of speakers that are valid for RP22 analysis.
 * A speaker must have: finite position, a real model (not "off/none"), and be
 * allowed by the current Dolby layout + 7.x bed-type choice.
 *
 * Uses the same canonical sevenBedLayoutType resolution as AppStateProvider
 * and useSpeakerReconciliation so all three paths agree.
 */
export function useAnalysisSpeakers({
  placedSpeakers,
  speakerSystem,
  sevenBedLayoutType,
  getSpeakerVisibility,
  dolbyPreset,
}) {
  return useMemo(() => {
    const raw = Array.isArray(placedSpeakers) ? placedSpeakers : [];

    const isAnalysableSpeaker = (spk) => {
      if (!spk) return false;
      const pos = spk.position;
      if (
        !pos ||
        typeof pos.x !== "number" ||
        typeof pos.y !== "number" ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y)
      ) return false;
      const ms = String(spk?.model ?? "").trim().toLowerCase();
      if (!ms || ms === "off" || ms === "none") return false;
      return true;
    };

    const afterRenderable = raw.filter(isAnalysableSpeaker);

    const layoutRaw =
      speakerSystem?.dolbyLayout ??
      speakerSystem?.dolbyPreset ??
      dolbyPreset ??
      "5.1";

    const layoutKey =
      (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1")
        .toString()
        .trim()
        .split(" ")[0]
        .split("_")[0];

    // Canonical 7.x resolution — same priority used in AppStateProvider and
    // useSpeakerReconciliation so visibility / reconciliation / analysis all agree.
    const resolvedSevenBedLayoutType =
      (typeof sevenBedLayoutType === "string" && sevenBedLayoutType)
        ? sevenBedLayoutType
        : (typeof speakerSystem?.sevenBedLayoutType === "string" && speakerSystem.sevenBedLayoutType)
          ? speakerSystem.sevenBedLayoutType
          : "rears";

    const useWidesInsteadOfRears = resolvedSevenBedLayoutType === "wides";

    const allowedRoles = new Set(
      rolesForLayout({
        dolbyLayout: layoutKey,
        useWidesInsteadOfRears,
      })
    );

    return afterRenderable.filter((s) => {
      const canon = safeCanon(s?.role);

      // Always exclude LFE
      if (canon === "LFE") return false;

      // Bed surrounds: controlled strictly by layout role visibility
      if (["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) {
        return allowedRoles.has(canon);
      }

      // Everything else: defer to getSpeakerVisibility if available
      return getSpeakerVisibility
        ? getSpeakerVisibility(s.role, s.model) === true
        : true;
    });
  }, [
    placedSpeakers,
    speakerSystem,
    sevenBedLayoutType,
    getSpeakerVisibility,
    dolbyPreset,
  ]);
}