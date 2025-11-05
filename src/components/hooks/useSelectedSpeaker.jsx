import { useMemo } from "react";
import { useProjectSummary } from "@/components/state/project-session";

// Safely read a selected Artcoustic model from project session; fallback to a sensible default
export function useSelectedArtcousticModel() {
  let summary = null;
  try {
    summary = typeof useProjectSummary === "function" ? useProjectSummary() : null;
  } catch {
    summary = null;
  }

  const model = useMemo(() => {
    if (!summary || typeof summary !== "object") return null;

    // Try a few likely keys without breaking if absent
    const candidates = [
      summary.selected_speaker_model,
      summary.lcrModel,
      summary.lcr_model,
      summary.artcousticModel,
    ].filter(Boolean);

    return (candidates[0] && String(candidates[0])) || null;
  }, [summary]);

  return model || "Artcoustic Evolve 2-1";
}

export default useSelectedArtcousticModel;