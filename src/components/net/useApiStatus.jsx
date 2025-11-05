import { useEffect, useMemo, useState } from "react";
import { getApiKey, isApiEnabled } from "./api";

/**
 * Pure client-side API status (no network).
 * Returns { apiEnabled, apiKeyPresent, status, lastError, tick }
 * status: "ready" | "no_api_key" | "api_disabled"
 */
export function useApiStatus() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    const onStorage = (e) => {
      if (!e || !e.key || e.key === "BASE44_API_KEY") setTick((t) => t + 1);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return useMemo(() => {
    const apiEnabled = isApiEnabled();
    const apiKeyPresent = !!getApiKey();

    let status = "offline";
    if (!apiEnabled) status = "api_disabled";
    else if (apiEnabled && !apiKeyPresent) status = "no_api_key";
    else status = "ready";

    const lastError =
      (typeof window !== "undefined" && window.__LAST_API_ERROR) || null;

    return { apiEnabled, apiKeyPresent, status, lastError, tick };
  }, [tick]);
}

export default useApiStatus;