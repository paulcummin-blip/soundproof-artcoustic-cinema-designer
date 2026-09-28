import { createContext, useContext } from "react";
import { createBassAnalysisResult } from "./bassAnalysisContract";

export const emptyBassResults = () => ({
  scopeId: null,
  versionId: null,
  contract: createBassAnalysisResult(),
  lifecycle: null,
  selectedPriorityMode: "balanced",
  optimisationResult: null,
  fingerprint: null,
  payload: null,
  inputsValid: false,
  detailedStatus: "IDLE",
  detailedError: null,
  onPriorityChange: null,
  onCalculate: null,
  onRetry: null,
  onCancel: null,
  onClearTerminal: null,
  canCalculate: false,
  calculationInProgress: false,
  calculationPhaseLabel: null,
  calculationOutcome: "idle",
  bassLifecycleState: "idle",
  terminalMessage: null,
  hasCurrentResult: false,
  authoritative: null,
  completedBassAuthority: null,
  p19SeatAuthority: null,
  p14FamilyProgress: null,
  seatingPositions: [],
  placementPreviewActive: false,
  placementPreviewResult: null,
});

export function createBassResultsScope(scopeId, versionId) {
  let snapshot = { ...emptyBassResults(), scopeId, versionId };
  return {
    getSnapshot: () => snapshot,
    replace: (next) => (snapshot = { ...next, scopeId, versionId }),
    clear: () => (snapshot = { ...emptyBassResults(), scopeId: null, versionId: null }),
  };
}

const BassResultsContext = createContext(null);
export const BassResultsProvider = BassResultsContext.Provider;

export function useSharedBassResults() {
  const value = useContext(BassResultsContext);
  if (!value) throw new Error("Bass results require the room-level analysis owner");
  return value;
}

export function useOptionalSharedBassResults() {
  return useContext(BassResultsContext);
}