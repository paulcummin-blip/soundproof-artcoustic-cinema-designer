// ---------------------------------------------------------------------------
// C41ArtworkFaceIcons.jsx
// ---------------------------------------------------------------------------
// The approved front-face artwork for the Artcoustic C4-1 soundbar — one icon per
// ILLUSTRATED cabinet length:
//
//   C4-1 1222 mm  C41_1222FaceIcon   (the variant the dual-centre arrangement uses)
//   C4-1 1441 mm  C41_1441FaceIcon
//   C4-1 1711 mm  C41_1711FaceIcon
//
// The three widths are ONE loudspeaker: they share every acoustic specification
// and differ only in cabinet width, so nothing here may be read as a separate
// acoustic model.
//
// Every other C4-1 cabinet length keeps the catalogue's own C4-1 artwork, which
// lives in SpeakerFaceIcons.jsx as C41FaceIcon.
//
// Each icon is the supplied technical line drawing (black on white) whose viewBox
// is the drawing's own MEASURED ink box, so the white page around it is cropped
// away and the drawing is drawn at the cabinet's catalogue footprint edge to edge.
// The catalogue's dimensions remain the authority: nothing here derives a
// physical size from the artwork, and nothing here touches SPL, RP22 or impedance.
// ---------------------------------------------------------------------------

/**
 * Artcoustic C4-1 soundbar — the 1222 mm cabinet variant.
 *
 * The approved front-face line artwork: black lines on a white page. The ink
 * occupies x 45–2127, y 257–464 of the 2172 × 724 px source (measured from the
 * file itself), so the viewBox is that ink box: the surrounding white page is
 * cropped away and the drawing fills the cabinet's own catalogue footprint edge
 * to edge. The drawing IS the 1222 × 120 mm cabinet — 10.18 : 1 against the ink
 * box's 10.01 : 1 — so filling that footprint adjusts it by under 2% and never
 * stretches it onto a different cabinet's shape. It is used only for the
 * 1222 mm variant; the other C4-1 lengths keep their own artwork.
 */
export function C41_1222FaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="45 257 2083 208"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <image
        x="45"
        y="257"
        width="2083"
        height="208"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png"
        preserveAspectRatio="none"
      />
    </svg>
  );
}

/**
 * Artcoustic C4-1 soundbar — the 1441 mm cabinet variant.
 *
 * The approved front-face line artwork for the longer cabinet: black lines on a
 * white page, six main drivers flanking the central tweeter with the cabinet
 * outline and mounting details retained. The ink occupies x 36–2130, y 275–444
 * of the 2167 × 726 px source, measured from the file itself on the SAME basis
 * as the 1222 mm artwork (any pixel below full white), so the viewBox is that
 * ink box and the surrounding white page is cropped away. The drawing is a
 * 1441 × 120 mm cabinet — 12.01 : 1 against the ink box's 12.32 : 1 — so filling
 * the catalogue footprint adjusts it by under 3% and never stretches it onto a
 * different cabinet's shape. It is used only for the 1441 mm variant; the
 * 1222 mm cabinet keeps its own artwork and the other lengths keep the catalogue
 * drawing.
 */
export function C41_1441FaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="36 275 2095 170"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <image
        x="36"
        y="275"
        width="2095"
        height="170"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/40ad34db7_ChatGPTImage9Oct202610_49_42.png"
        preserveAspectRatio="none"
      />
    </svg>
  );
}

/**
 * Artcoustic C4-1 soundbar — the 1711 mm cabinet variant.
 *
 * The approved front-face line artwork for the longer cabinet: the same drivers
 * in a longer enclosure, black lines on a white page. The ink occupies
 * x 35–2131, y 277–425 of the 2167 × 726 px source, measured from the file
 * itself on the SAME basis as the other C4-1 artworks (any pixel below full
 * white), so the viewBox is that ink box and the surrounding white page is
 * cropped away. The drawing is the 1711 × 120 mm cabinet — 14.26 : 1 against the
 * ink box's 14.07 : 1 — so filling the catalogue footprint adjusts it by under
 * 2% and never stretches it onto a different cabinet's shape. It is used only
 * for the 1711 mm variant; the 1222 mm and 1441 mm cabinets keep their own
 * artwork and the other lengths keep the catalogue drawing.
 */
export function C41_1711FaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="35 277 2097 149"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <image
        x="35"
        y="277"
        width="2097"
        height="149"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/7759b8f47_ChatGPTImage9Oct202610_54_00.png"
        preserveAspectRatio="none"
      />
    </svg>
  );
}