// useProjectCrossover.js
// ---------------------------------------------------------------------------
// THE single read/write surface for the project's crossover settings.
//
// There is exactly one stored authority — appState.splConfig.crossover — and
// every surface reads it and writes it through here:
//   * Speakers -> LCR            (speaker high-pass)
//   * Speakers -> Subwoofers     (subwoofer low-pass)
//   * Bass Response              (both, together)
//
// Because all three read the same stored value, a change made in one place is
// visible everywhere on the next render. The permitted range is derived from the
// selected LCR models, so a model's mandatory minimum can never be undercut by
// any surface. No acoustic work happens here: this hook only resolves limits and
// normalises the stored configuration.
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from "react";
import { useAppState } from "@/components/AppStateProvider";
import {
  normaliseCrossoverConfig,
  resolveSharedCrossoverLimits,
} from "@/components/room/bass/crossoverAuthority";
import { lcrCrossoverModelKeys } from "@/components/room/bass/lcrIntegrationSources";

export function useProjectCrossover() {
  const appState = useAppState();
  const storedCrossover = appState?.splConfig?.crossover;
  const updateGlobalSpl = appState?.updateGlobalSpl;
  const placedSpeakers = appState?.speakerSystem?.placedSpeakers;

  const modelKeys = useMemo(
    () => lcrCrossoverModelKeys(placedSpeakers),
    [placedSpeakers],
  );

  // The shared LCR range: the highest mandatory minimum across the trio.
  const limits = useMemo(
    () => resolveSharedCrossoverLimits(modelKeys),
    [modelKeys],
  );

  const crossover = useMemo(
    () => normaliseCrossoverConfig(storedCrossover, limits),
    [storedCrossover, limits],
  );

  // Every write goes through the same normalisation, so an illegal frequency
  // can never be stored regardless of which control produced it.
  const setCrossover = useCallback(
    (changes) => {
      if (typeof updateGlobalSpl !== "function") return;
      const committed = normaliseCrossoverConfig(storedCrossover, limits);
      const merged = { ...committed, ...(changes || {}) };
      updateGlobalSpl({ crossover: normaliseCrossoverConfig(merged, limits) });
    },
    [updateGlobalSpl, storedCrossover, limits],
  );

  return {
    crossover,
    limits,
    setCrossover,
    hasSpeakerModels: modelKeys.length > 0,
  };
}

export default useProjectCrossover;