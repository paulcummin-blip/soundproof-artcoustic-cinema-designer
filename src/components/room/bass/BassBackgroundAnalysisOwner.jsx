import React, { createContext, useCallback, useContext, useEffect } from "react";
import { bassBackgroundAnalysisStore } from "./bassBackgroundAnalysisStore";

const InputPublisherContext = createContext(null);

export default function BassBackgroundAnalysisOwner({ children }) {
  const publishInputs = useCallback((inputs) => (
    bassBackgroundAnalysisStore.updateInputs(inputs)
  ), []);

  useEffect(() => () => bassBackgroundAnalysisStore.dispose(), []);

  return (
    <InputPublisherContext.Provider value={publishInputs}>
      {children}
    </InputPublisherContext.Provider>
  );
}

export function useBassBackgroundInputPublisher() {
  const publishInputs = useContext(InputPublisherContext);
  if (!publishInputs) throw new Error("Bass background analysis requires its room-level owner");
  return publishInputs;
}