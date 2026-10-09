/**
 * PillCompletenessOutline.jsx
 * ---------------------------
 * Marks a Design Rating result pill as belonging to a section that is not yet
 * fully calculated — OUTLINE ONLY.
 *
 * The pill's own fill colour and level colour are never changed: the outline
 * says "this section is not yet complete". It never says "this level is poor"
 * and never says "this parameter failed". A completed L1 section carries no
 * outline; an incomplete provisional L4 section does.
 *
 * Restrained muted red drawn from the existing Artcoustic / Sound Proof warm
 * palette: deliberately distinct from the RP22 FAIL burgundy (#4A230F, a
 * scored failure state) and from the L1 clay token, so incompleteness can never
 * be read as a grading result.
 *
 * No text, no icons, no flashing. Wrappers collapse to the child untouched when
 * the section is complete.
 *
 * Props:
 *   incomplete — true when the owning section is not yet complete
 *   children   — the pill element
 */

import React from "react";

/** Muted warning-red for the "not yet complete" outline. */
export const INCOMPLETE_SECTION_OUTLINE = "#9A5A52";

/** Matches the on-screen RP22GradingPill radius so the outline hugs the pill. */
const PILL_RADIUS = "6px";

export default function PillCompletenessOutline({ incomplete = false, children }) {
  if (!incomplete) return children;
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: PILL_RADIUS,
        outline: `2px solid ${INCOMPLETE_SECTION_OUTLINE}`,
        outlineOffset: "1px",
      }}
    >
      {children}
    </span>
  );
}