import { useAppState } from "@/components/AppStateProvider";

// Bridge hook that maps a "dolbyPreset" to existing app state (dolbyLayout/dolbyConfig)
export function useDolbyPreset() {
  const {
    dolbyLayout,
    setDolbyLayout,
    dolbyConfig,
    setDolbyConfig,
  } = useAppState();

  const current = dolbyLayout || dolbyConfig || "5.1";

  const setPreset = (preset) => {
    const p = preset || "5.1";
    if (typeof setDolbyLayout === "function") setDolbyLayout(p);
    if (typeof setDolbyConfig === "function") setDolbyConfig(p);
  };

  return [current, setPreset];
}

export default useDolbyPreset;