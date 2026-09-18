// useEngineeringMode.jsx
// React binding for the global Engineering Mode store.

import { useSyncExternalStore } from "react";
import {
  subscribeEngineeringMode,
  getEngineeringMode,
  setEngineeringMode,
  toggleEngineeringMode,
} from "@/components/state/engineeringModeStore";

export function useEngineeringMode() {
  const enabled = useSyncExternalStore(subscribeEngineeringMode, getEngineeringMode, getEngineeringMode);
  return {
    engineeringMode: enabled,
    setEngineeringMode,
    toggleEngineeringMode,
  };
}