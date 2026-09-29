import { useEffect, useState } from "react";

// Keep approved art visible while a dealer upload loads. A failed upload returns
// to the approved default, and stale loads cannot cross account/image changes.
export function useBrandImage(candidate, fallback) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!candidate || candidate === fallback) return undefined;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setLoaded({ candidate, url: candidate });
    };
    image.onerror = () => {
      if (!cancelled) setLoaded({ candidate, url: fallback });
    };
    image.src = candidate;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [candidate, fallback]);
  return candidate === fallback ? fallback : loaded?.candidate === candidate ? loaded.url : fallback;
}
