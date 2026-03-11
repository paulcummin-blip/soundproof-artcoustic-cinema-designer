import React from "react";
import { useAppState } from "@/components/AppStateProvider";

export function useGuardedSetter(setter, tabName) {
  const { isFrozen } = useAppState();
  return React.useCallback((next) => {
    if (isFrozen?.(tabName)) return;
    setter?.(next);
  }, [setter, isFrozen, tabName]);
}