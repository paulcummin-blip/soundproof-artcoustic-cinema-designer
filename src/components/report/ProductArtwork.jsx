// ---------------------------------------------------------------------------
// ProductArtwork.jsx
// ---------------------------------------------------------------------------
// ONE shared renderer for every product graphic placed in a drawing.
//
// The catalogue artwork is line art supplied on an OPAQUE WHITE PAGE. That page
// is not part of the product: drawn inside a cabinet's footprint it reads as a
// large white rectangle around the loudspeaker, it paints over whatever sits
// behind it (the screen frame, the wall, another cabinet) and it makes the
// product's apparent cabinet size and its visual spacing wrong.
//
// This wrapper knocks the white page out of the artwork, so the graphic shows
// only the product's own line art. To stop the drawing's own surface reading
// through the cabinet, it also lays a TIGHT opaque white backing behind the
// artwork: the caller passes the cabinet's own scaled footprint, and nothing
// larger is ever drawn. Nothing else changes: the box it is given, the
// position, the rotation and the aspect handling all stay exactly as they were,
// and the artwork is never resized onto a different shape.
//
// It is applied at the DRAW SITE, so one solution covers every model and every
// drawing — wrap the face icon wherever it is placed:
//
//   <ProductArtwork backing={{ x, y, width: w, height: h }}>
//     <Q63FaceIcon x={x} y={y} width={w} height={h} />
//   </ProductArtwork>
//
// `backing` is optional: a call site that already paints its own opaque cabinet
// (or a drawing that has no cabinet to back) simply omits it and keeps the
// previous knock-out-only behaviour.
// ---------------------------------------------------------------------------
import React, { useId } from "react";

// Opacity becomes the source alpha times the pixel's distance from white:
// pure white pages disappear, the darker the ink the more opaque it is, and a
// region that is already transparent stays transparent. RGB is untouched, so
// the artwork keeps its own ink colour.
const WHITE_PAGE_KNOCKOUT = [
  "1 0 0 0 0",
  "0 1 0 0 0",
  "0 0 1 0 0",
  "-0.333 -0.333 -0.333 1 0",
].join("   ");

export default function ProductArtwork({ children, backing = null }) {
  // A per-instance id keeps the filter self-contained: the artwork is never
  // rendered with a reference to a filter that is not in the document.
  const rawId = useId();
  const filterId = `product-artwork-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <>
      {/* Tight opaque white backing — the cabinet's own scaled footprint, drawn
          BEFORE the knotted-out artwork and OUTSIDE its filter, so the technical
          symbol reads as printed on white paper and no drawing line shows
          through the cabinet. It carries no margin and no stroke, so it can
          never bleed beyond the cabinet, and it takes the caller's transform, so
          a cabinet rotated a quarter turn brings its backing round with it. */}
      {backing ? (
        <rect
          x={backing.x}
          y={backing.y}
          width={backing.width}
          height={backing.height}
          fill="#ffffff"
          shapeRendering="crispEdges"
          data-product-backing="true"
        />
      ) : null}
      <defs>
        <filter
          id={filterId}
          colorInterpolationFilters="sRGB"
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
        >
          <feColorMatrix type="matrix" values={WHITE_PAGE_KNOCKOUT} />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>{children}</g>
    </>
  );
}