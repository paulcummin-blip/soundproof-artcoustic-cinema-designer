/**
 * Speaker catalog adapter.
 * Prefers Base44 SDK (window.Base44.speakers.list()) if available,
 * otherwise falls back to a tiny static subset so the UI always works.
 *
 * Shape: [{ id: string, name: string }]
 */

function hasSDK() {
  try {
    return typeof window !== "undefined" &&
      window.Base44 &&
      window.Base44.speakers &&
      typeof window.Base44.speakers.list === "function";
  } catch {
    return false;
  }
}

const FALLBACK = [
  { id: "evolve-3-1", name: "Artcoustic Evolve 3-1" },
  { id: "evolve-2-1", name: "Artcoustic Evolve 2-1" },
  { id: "spitfire-q4-3", name: "Artcoustic Spitfire Q4-3" },
  { id: "cph-soundbar", name: "Artcoustic CPH Soundbar (LCR variants)" },
];

export function getSpeakers() {
  if (hasSDK()) {
    const arr = window.Base44.speakers.list() || [];
    return Array.isArray(arr) ? arr : FALLBACK;
  }
  return FALLBACK;
}