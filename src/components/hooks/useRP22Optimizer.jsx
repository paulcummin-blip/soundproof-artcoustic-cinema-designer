// components/hooks/useRP22Optimizer.js
// Safe, no-external-import optimiser shim.
// Keeps the app functional even when RP22 spec files are removed/frozen.

export function optimiseSpeakerPositions({
  dimensions,
  seatingPositions,
  placedSpeakers,
  layoutRoles = [],
}) {
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  if (!speakers.length) return speakers;

  // TODO: replace with true RP22 optimiser once RP22Spec is reinstated.
  // For now, return the speakers unchanged (no-op) so UI remains stable.
  return speakers;
}

export default { optimiseSpeakerPositions };