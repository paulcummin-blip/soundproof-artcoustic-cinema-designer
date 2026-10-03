// optimisationTransitionAuthority.js
// ---------------------------------------------------------------------------
// The ONE definition of the optimiser's modal → statistical transition
// frequency (the Schroeder-style marker shown on the bass response graph).
//
// It is a display/analysis boundary derived from the room's own volume, not a
// design result: the same room always yields the same value. It is extracted
// here so the live graph (useAuthoritativeBassResponse) and the report graph
// read the SAME definition — the report never re-derives its own.
//
// PURE and READ-ONLY: no acoustics, no grading, no calculation result.
// ---------------------------------------------------------------------------

/** 2000 · √(0.4 / V) — the room's transition frequency in Hz, or 120 Hz with no room. */
export function resolveOptimisationTransitionHz(roomDims = null) {
  const volume = Number(roomDims?.widthM) * Number(roomDims?.lengthM) * Number(roomDims?.heightM);
  return volume > 0 ? 2000 * Math.sqrt(0.4 / volume) : 120;
}