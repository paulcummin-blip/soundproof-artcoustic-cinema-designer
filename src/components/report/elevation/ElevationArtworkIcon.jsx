// ---------------------------------------------------------------------------
// ElevationArtworkIcon.jsx
// ---------------------------------------------------------------------------
// The ONE renderer for every ELEVATION artwork — used by the live front
// elevation, the live left/right elevations and the exported elevation pages
// alike, because they all draw the same face icons and the face icons all come
// through here. There is no separate export-only treatment.
//
// WHAT IT DOES
//
//   • Crop, never resize. The crop in the authority is the drawing's own bounds
//     inside the source file. The viewBox is set to that crop while the image is
//     drawn at its NATIVE pixel size, so the page around the drawing is cut away
//     and the drawing itself is untouched — not resized onto the crop, which
//     would squash one axis and turn driver circles into slivers.
//   • Preserve the drawing's own proportions. The crop is fitted into the
//     cabinet footprint the caller passes (x/y/width/height are the cabinet's
//     true scaled footprint) with a single scale for both axes, centred. The
//     drawing never fills the box by being stretched.
//   • Keep every white area INSIDE the drawing. Only the outer page margin is
//     trimmed, so an unprinted face, a white grille and the white between
//     drivers all stay exactly as drawn.
//   • Present on the drawing's own field. Nothing is painted behind the artwork:
//     the clean white field is the drawing surface itself, so there is no inset
//     tile, no card and no grey page box. (The caller's white backing, where a
//     cabinet face needs one, is the cabinet's own footprint and is drawn
//     outside this component.)
//
// UNCHANGED ARTWORK IS THE FALLBACK
//
// An artwork this app has no trustworthy crop for is drawn from the caller's own
// declared box, exactly as it was drawn before this renderer existed, fitted
// without distortion, and the fallback is logged (NORMALISATION_FALLBACK). A
// missing crop is never a reason to over-crop, and never a reason to stretch.
//
// Presentation only. Nothing here states, infers or changes a cabinet's size,
// position, orientation, model assignment, RP22 or RP23 value; the caller's box
// remains the physical footprint the caller already computed.
// ---------------------------------------------------------------------------
import React from "react";
import {
  ELEVATION_ART_MODE,
  resolveElevationArtwork,
} from "./elevationArtAuthority.js";

export default function ElevationArtworkIcon({
  artworkKey,
  href,
  x,
  y,
  width,
  height,
  /** The icon's own pre-existing box: { box: "0 0 100 75", width: 100, height: 75 }.
   *  Used unchanged whenever this artwork is not normalised. */
  declared,
  /** The artwork's own defs/filters, where it has any — passed through untouched. */
  children = null,
}) {
  const resolved = resolveElevationArtwork(artworkKey);
  const normalised = resolved.mode !== ELEVATION_ART_MODE.FALLBACK;

  const viewBox = normalised
    ? `${resolved.box.x} ${resolved.box.y} ${resolved.box.width} ${resolved.box.height}`
    : declared.box;

  const imageWidth = normalised ? resolved.native.width : declared.width;
  const imageHeight = normalised ? resolved.native.height : declared.height;

  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={viewBox}
      preserveAspectRatio={normalised ? resolved.preserveAspect : "xMidYMid meet"}
      xmlns="http://www.w3.org/2000/svg"
      data-elevation-art={artworkKey}
      data-elevation-art-mode={resolved.mode}
    >
      {children}
      <image
        x="0"
        y="0"
        width={imageWidth}
        height={imageHeight}
        href={href}
        preserveAspectRatio={normalised ? resolved.preserveAspect : "xMidYMid meet"}
      />
    </svg>
  );
}