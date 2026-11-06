// Display admission only. This never grants RP22/publication authority.
export function classifyRoomPreviewResponse({
  message, active, generation, fingerprint, epoch, interactionActive,
  displayedGeneration,
}) {
  // A duplicate/foreign response must not settle a different in-flight request.
  if (!active || message.generation !== active.generation ||
      message.fingerprint !== active.fingerprint || message.quality !== "preview") return "foreign";
  if (active.epoch !== epoch || active.generation > generation) return "discard";
  if (active.dragging && !interactionActive) return "discard";
  const exact = active.generation === generation && active.fingerprint === fingerprint;
  if (message.type !== "complete") return exact ? "current" : "discard";
  // Never go backwards, including after a refined or cached result was shown.
  if (active.generation <= displayedGeneration) return "discard";
  if (exact) return "current";
  return interactionActive && active.dragging ? "intermediate" : "discard";
}
