import { createContext, useContext } from "react";
import { createBassAnalysisResult } from "./bassAnalysisContract";

export const emptyBassResults = () => ({
  scopeId: null,
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
  canCalculate: false,
  calculationInProgress: false,
  calculationPhaseLabel: null,
  hasCurrentResult: false,
  authoritative: null,
  completedBassAuthority: null,
  p14FamilyProgress: null,
  seatingPositions: [],
});

export function createBassResultsScope(scopeId) {
  let snapshot = { ...emptyBassResults(), scopeId };
  return {
    getSnapshot: () => snapshot,
    replace: (next) => (snapshot = { ...next, scopeId }),
    clear: () => (snapshot = { ...emptyBassResults(), scopeId: null }),
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