import React from 'react';
import ElevationArtworkIcon from '@/components/report/elevation/ElevationArtworkIcon';

// Shared stroke — matches COLORS.speaker in ScreenWallConstructionGraphic
const STROKE = '#111111';

// ─── Shared drawing primitives ────────────────────────────────────────────────

/** Woofer: 3 concentric circles (surround, cone, dust cap) */
function WooferCircles({ cx, cy, r1, r2, r3 }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <circle cx={cx} cy={cy} r={r3} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </>
  );
}

/** Tweeter: 2 concentric circles (flange, dome) */
function TweeterCircles({ cx, cy, r1, r2 }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </>
  );
}

/** 4 corner fixing bolts */
function CornerBolts({ x, y, w, h, inset, r }) {
  return (
    <>
      <circle cx={x + inset} cy={y + inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={x + w - inset} cy={y + inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={x + inset} cy={y + h - inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={x + w - inset} cy={y + h - inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
    </>
  );
}

/** 2 top/bottom centre fixing bolts (portrait cabinet style) */
function CentreBolts({ midX, topY, bottomY, r }) {
  return (
    <>
      <circle cx={midX} cy={topY} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={midX} cy={bottomY} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
    </>
  );
}

// ─── Q-Series face icons ──────────────────────────────────────────────────────

export function Q43FaceIcon({ x, y, width, height }) {
  // Q4-3 cabinet is 4:3 (280×210mm). The shared elevation renderer crops the
  // page away and draws the drawing's own measured bounds inside the cabinet's
  // footprint, so the artwork is never resized onto the cabinet's shape.
  return (
    <ElevationArtworkIcon
      artworkKey="q43"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/689388d97_Q4-3front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 75", width: 100, height: 75 }}
    />
  );
}

export function Q45FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: this icon used to declare a square box, but the drawing is not
  // square — letterboxed inside it, the speaker was drawn short with a band of
  // white canvas around it. The shared renderer draws the measured drawing bounds
  // instead of the declared box.
  return (
    <ElevationArtworkIcon
      artworkKey="q45"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/d1376c28d_Q4-5front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 100", width: 100, height: 100 }}
    />
  );
}

/**
 * Spitfire Q 8-5 — tall portrait cabinet
 * Uses product sheet image.
 */
export function Q85FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: this icon used to declare a square box for a portrait
  // drawing, so the speaker was letterboxed with white canvas above and below it.
  // The shared renderer draws the measured drawing bounds instead.
  return (
    <ElevationArtworkIcon
      artworkKey="q85"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/8eb64d06e_Q8-5Front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 100", width: 100, height: 100 }}
    />
  );
}

/**
 * Spitfire Q 6-3 — 280 × 280 mm square cabinet face.
 *
 * The source PNG is a page screenshot, not a bare drawing: it carries a dark
 * frame around the image edge, then a wide white page margin, and only then the
 * cabinet's own line drawing inset inside it. Drawn whole, that page presented
 * the cabinet as a small drawing inside an image tile, with the page's frame
 * and margin around it — not as the loudspeaker.
 *
 * The drawing is therefore cropped to the cabinet's own outline. The crop was
 * measured in the asset's own pixel space (1024 × 1021): the outline's outer
 * edge sits at x 54, y 52 and spans 916 × 916 px — square, matching the
 * cabinet's 280 × 280 mm face, so the crop fills the cabinet's box without
 * distorting the speaker. The crop lies inside the page's edge frame (which
 * runs out to ~0.8% of the frame) and inside its white margin, so neither the
 * frame nor the margin is drawn at all. The drawing itself is untouched: same
 * line art, same line weights, same proportions, drawn larger only because the
 * page around it is gone.
 *
 * The `size` form is kept for callers that pass a single dimension.
 */
const Q63_ARTWORK = { width: 1024, height: 1021, cropX: 54, cropY: 52, cropW: 916, cropH: 916 };

export function Q63FaceIcon({ x, y, size, width, height }) {
  const w = width ?? size;
  const h = height ?? size;
  // The crop this icon used to hold inline now lives in the ONE elevation crop
  // authority (measured, page frame and margin excluded, crop = the cabinet's own
  // square outline) and is applied by the shared elevation renderer, so the live
  // elevations and the exported pages crop identically.
  return (
    <ElevationArtworkIcon
      artworkKey="q63"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/9a1ad66a6_Q6-3front.png"
      x={x}
      y={y}
      width={w}
      height={h}
      declared={{ box: `${Q63_ARTWORK.cropX} ${Q63_ARTWORK.cropY} ${Q63_ARTWORK.cropW} ${Q63_ARTWORK.cropH}`, width: Q63_ARTWORK.width, height: Q63_ARTWORK.height }}
    />
  );
}

// ─── Evolve Series face icons ─────────────────────────────────────────────────

/**
 * EVOLVE 1-1 — dedicated vector-drawn face icon.
 *
 * Physical cabinet: 150 × 150 mm square face, 72 mm depth.
 * Transducers: 1 × 3" woofer (lower), 1 × 1.5" tweeter (upper).
 *
 * The viewBox matches the physical 150 × 150 mm dimensions so the icon
 * scales proportionally and is immediately distinguishable from:
 *   - EVOLVE 1   (120 × 120 mm — smaller square)
 *   - EVOLVE 2-1 (200 × 200 mm — larger square)
 *
 * Drawn in the same Artcoustic line-art style as the Q-series and
 * Multi Soundbar vector icons (concentric circle primitives).
 */
export function Evolve11FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* Cabinet outline — 150 × 150 mm square */}
      <rect x="1" y="1" width="148" height="148" rx="3" fill="none" stroke={STROKE} strokeWidth="1" />

      {/* Tweeter — 1.5" (upper centre) */}
      <TweeterCircles cx={75} cy={42} r1={16} r2={10} />

      {/* Woofer — 3" (lower centre) */}
      <WooferCircles cx={75} cy={103} r1={30} r2={22} r3={8} />

      {/* Corner fixing bolts */}
      <CornerBolts x={1} y={1} w={148} h={148} inset={9} r={1.5} />
    </svg>
  );
}

export function Evolve21FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: the square box was the whole page, and the drawing sits inside
  // it with wide top and bottom margins. The shared renderer draws the measured
  // drawing bounds instead.
  return (
    <ElevationArtworkIcon
      artworkKey="evolve_2_1"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/bb66545fd_Evolve2-1front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 100", width: 100, height: 100 }}
    />
  );
}

/**
 * EVOLVE 3-1 — portrait cabinet (270 × 370 mm face), 751 × 1024 px artwork.
 *
 * The viewBox states the ARTWORK'S OWN box, and the image fills that box. The
 * drawing is portrait (aspect 0.73) while the square viewBox used by the other
 * PNG icons is not: the portrait drawing was letterboxed inside the square and
 * the square was letterboxed again inside the portrait cabinet box, so the
 * speaker was drawn short (0.845 of the cabinet box) and a band of white canvas
 * showed above and below it, reading as a white rectangle around the speaker.
 * Stating the artwork's own box maps the drawing straight onto the box it is
 * given, so the drawing fills the cabinet box exactly as every other face icon
 * does and no white canvas is introduced.
 *
 * The drawing is never stretched: it keeps its own proportions and is fitted
 * (never cropped) inside the box the caller supplies.
 *
 * Presentation only. Nothing about the cabinet's size, position, orientation or
 * acoustic centre is stated, inferred or changed here.
 */
export function Evolve31FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: the file's declared box is the PAGE, which carries wide side
  // margins, so the drawing appeared inset inside a band of white canvas. The
  // shared renderer draws the measured drawing bounds instead — cropped, never
  // resized, and fitted inside the cabinet's own footprint.
  return (
    <ElevationArtworkIcon
      artworkKey="evolve_3_1"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 751 1024", width: 751, height: 1024 }}
    />
  );
}

export function Evolve42FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: the square box was the whole page. The shared renderer draws
  // the measured drawing bounds instead.
  return (
    <ElevationArtworkIcon
      artworkKey="evolve_4_2"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/fa3b2393b_Evolve4-2front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 100", width: 100, height: 100 }}
    />
  );
}

export function Evolve63FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: the square box was the whole page. The shared renderer draws
  // the measured drawing bounds instead.
  return (
    <ElevationArtworkIcon
      artworkKey="evolve_6_3"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/3010c90e8_Evolve6-3front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 100", width: 100, height: 100 }}
    />
  );
}

export function Evolve84FaceIcon({ x, y, width, height }) {
  // STALE VIEWBOX: the square box was the whole page. The shared renderer draws
  // the measured drawing bounds instead.
  return (
    <ElevationArtworkIcon
      artworkKey="evolve_8_4"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/29826d0f4_Evolve8-4front.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 100 100", width: 100, height: 100 }}
    />
  );
}

// ─── Artcoustic C Series face icons ──────────────────────────────────────────

/**
 * Artcoustic C4-1 soundbar — physical 1711 × 120 mm
 * viewBox aspect ratio 1711:120 preserves exact proportions at all zoom levels.
 */
export function C41FaceIcon({ x, y, width, height }) {
  // The catalogue C4-1 drawing, used for the cabinet lengths that have no
  // illustrated artwork of their own. Its own box is the authority's fallback:
  // this one file serves several cabinet lengths, so there is no single face
  // proportion to check a crop against and it is drawn unchanged — never
  // over-cropped, never stretched — with the fallback reported.
  return (
    <ElevationArtworkIcon
      artworkKey="c41"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2adee2973_Screenshot2026-06-05at132314.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "0 0 1711 120", width: 1711, height: 120 }}
    >
      <defs>
        <filter id="c41-white-artwork" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.08" intercept="-0.02" />
            <feFuncG type="linear" slope="1.08" intercept="-0.02" />
            <feFuncB type="linear" slope="1.08" intercept="-0.02" />
          </feComponentTransfer>
        </filter>
      </defs>
    </ElevationArtworkIcon>
  );
}

// The approved C4-1 cabinet artwork (the 1222 mm and 1441 mm variants) now lives
// in C41ArtworkFaceIcons.jsx, one icon per illustrated cabinet length. The C4-1's
// other lengths keep the catalogue artwork below.

/**
 * Artcoustic C-1 centre cabinet — catalogue 400 × 120 mm.
 *
 * The supplied reference is a tightly cropped technical line drawing (1240 × 312
 * px of ink inside a 1250 × 322 px screenshot), and it is a FRONT-FACE
 * reference, not dimensional engineering data. The catalogue's own 400 × 120 mm
 * footprint therefore remains the dimension authority, so the drawing is mapped
 * onto exactly that footprint — the same treatment the Multi Soundbar artwork
 * icons give their source screenshots — and the visible cabinet fills its
 * boundary box edge to edge.
 *
 * The screenshot sits on a white page and the drawing itself is grey line art.
 * It takes the same treatment the Multi Soundbar artwork icons give their source
 * screenshots — a grayscale matrix followed by a threshold table — so the page
 * stays solid white (the cabinet's white face, matching the FL/FR product
 * artwork) and the grey lines resolve to solid black with a consistent weight.
 * The threshold sits inside the drawing's own line tone (measured 0.44–0.75
 * luma, minimum 0.44) so the line weights stay faithful to the reference rather
 * than thickening into blobs.
 */
export function C1FaceIcon({ x, y, width, height }) {
  // The C-1 crop is the approved, already-shipping box and now lives in the ONE
  // elevation crop authority, so every drawing that places C-1 crops it the same
  // way. Its own line-art treatment (the grayscale threshold filter, and the
  // long-standing full-width box it has always been drawn into) is unchanged.
  return (
    <ElevationArtworkIcon
      artworkKey="c1"
      href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/634ab2ddc_Screenshot2026-10-09at094937.png"
      x={x}
      y={y}
      width={width}
      height={height}
      declared={{ box: "6 4 1240 312", width: 1240, height: 312 }}
    >
      <defs>
        <filter id="c1-line-art" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0 0 0 0 0 0 1 1 1" />
            <feFuncG type="table" tableValues="0 0 0 0 0 0 0 1 1 1" />
            <feFuncB type="table" tableValues="0 0 0 0 0 0 0 1 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
    </ElevationArtworkIcon>
  );
}

/**
 * Multi Soundbar — wide integrated LCR/center soundbar.
 * Normalised black-and-white line art matching the WooferCircles/TweeterCircles
 * primitives used by other face icons. Three driver clusters (left, center,
 * right), each with two square-framed woofers flanking a central tweeter, with
 * small single drivers between clusters and at the ends.
 */
export function MultiSoundbarFaceIcon({ x, y, width, height }) {
  const clusterCentres = [55, 150, 245];
  const tinyCircles = [18, 102, 198, 282];
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 300 24"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outer chassis */}
      <rect x="1" y="1" width="298" height="22" rx="1.5" fill="none" stroke={STROKE} strokeWidth="0.8" />

      {/* Three driver clusters */}
      {clusterCentres.map((cx, i) => (
        <g key={`cluster-${i}`}>
          {/* Left woofer — square frame + concentric circles */}
          <rect x={cx - 14} y="6" width="12" height="12" fill="none" stroke={STROKE} strokeWidth="0.7" />
          <WooferCircles cx={cx - 8} cy={12} r1={4.5} r2={3} r3={1} />

          {/* Right woofer — square frame + concentric circles */}
          <rect x={cx + 2} y="6" width="12" height="12" fill="none" stroke={STROKE} strokeWidth="0.7" />
          <WooferCircles cx={cx + 8} cy={12} r1={4.5} r2={3} r3={1} />

          {/* Central tweeter */}
          <TweeterCircles cx={cx} cy={12} r1={3} r2={1.8} />
        </g>
      ))}

      {/* Tiny single drivers between clusters and at the ends */}
      {tinyCircles.map((tx, i) => (
        <circle key={`tiny-${i}`} cx={tx} cy={12} r="1.8" fill="none" stroke={STROKE} strokeWidth="0.5" />
      ))}
    </svg>
  );
}

/**
 * Multi Soundbar — 77" TV variant.
 * Wider enclosure (1711mm vs 1411mm for 65"). Cluster layout matches the
 * reference: left cluster, center-right cluster (similar spacing), and a
 * right-most cluster positioned toward the end of the bar. Small single
 * drivers at the far left and in the two inter-cluster gaps.
 */
export function MultiSoundbar77FaceIcon({ x, y, width, height }) {
  // viewBox matches the 1711mm × 100mm physical aspect ratio (~17:1)
  const clusterCentres = [50, 150, 290];
  const tinyCircles = [15, 100, 220];
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 340 20"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outer chassis */}
      <rect x="1" y="1" width="338" height="18" rx="1" fill="none" stroke={STROKE} strokeWidth="0.8" />

      {/* Three driver clusters — left, center-right, far-right */}
      {clusterCentres.map((cx, i) => (
        <g key={`cluster77-${i}`}>
          {/* Left woofer */}
          <rect x={cx - 11} y="5" width="10" height="10" fill="none" stroke={STROKE} strokeWidth="0.7" />
          <WooferCircles cx={cx - 6} cy={10} r1={3.5} r2={2.2} r3={0.7} />

          {/* Right woofer */}
          <rect x={cx + 1} y="5" width="10" height="10" fill="none" stroke={STROKE} strokeWidth="0.7" />
          <WooferCircles cx={cx + 6} cy={10} r1={3.5} r2={2.2} r3={0.7} />

          {/* Central tweeter */}
          <TweeterCircles cx={cx} cy={10} r1={2.2} r2={1.3} />
        </g>
      ))}

      {/* Tiny single drivers — far left and between clusters */}
      {tinyCircles.map((tx, i) => (
        <circle key={`tiny77-${i}`} cx={tx} cy={10} r="1.5" fill="none" stroke={STROKE} strokeWidth="0.5" />
      ))}
    </svg>
  );
}

/**
 * Multi Soundbar — Full-width artwork rendering using the original technical
 * line drawing. The uploaded source image is rendered with CSS filters to
 * normalise grey-on-light-grey to clean black-and-white. The viewBox matches
 * the physical 1872×100mm aspect ratio so the drawing scales proportionally
 * with width changes. preserveAspectRatio="xMidYMid meet" guarantees the
 * native drawing geometry is never stretched, squashed, or distorted.
 *
 * Used only for:
 *   - 83" TV + Multi Soundbar
 *   - Manual screen size + Multi Soundbar
 *
 * The rendered width is controlled by the caller (set to match the screen
 * width); height follows automatically from the locked 18.72:1 aspect ratio.
 */
export function MultiSoundbarArtworkFaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 1558 90"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="multi-bw-83" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncG type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncB type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image
        x={0}
        y={0}
        width={1558}
        height={90}
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2e7972c70_Screenshot2026-09-11at171928.png"
        preserveAspectRatio="none"
        filter="url(#multi-bw-83)"
      />
    </svg>
  );
}

/**
 * Multi Soundbar — 77" TV dedicated artwork rendering using the original
 * technical line drawing for the 77" configuration. The uploaded source
 * image is rendered with CSS filters to normalise grey-on-light-grey to
 * clean black-and-white. The viewBox matches the physical 1711×100mm
 * aspect ratio so the drawing scales proportionally with width changes.
 * preserveAspectRatio="xMidYMid meet" guarantees the native drawing
 * geometry is never stretched, squashed, or distorted.
 *
 * Used ONLY for:
 *   - 77" TV + Multi Soundbar
 *
 * The 83"/Manual Multi asset (MultiSoundbarArtworkFaceIcon) remains
 * separate and unchanged. Each drawing retains its own original geometry.
 */
export function MultiSoundbar77ArtworkFaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 1588 106"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="multi-bw-77" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncG type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncB type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image
        x={0}
        y={0}
        width={1588}
        height={106}
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0916b89aa_Screenshot2026-09-11at172124.png"
        preserveAspectRatio="none"
        filter="url(#multi-bw-77)"
      />
    </svg>
  );
}

/**
 * Multi Soundbar — 65" TV dedicated artwork rendering using the original
 * technical line drawing for the 65" configuration. The uploaded source
 * image is rendered with CSS filters to normalise grey-on-light-grey to
 * clean black-and-white. The viewBox matches the physical 1411×100mm
 * aspect ratio so the drawing scales proportionally with width changes.
 * preserveAspectRatio="xMidYMid meet" guarantees the native drawing
 * geometry is never stretched, squashed, or distorted.
 *
 * Used ONLY for:
 *   - 65" TV + Multi Soundbar
 *
 * The 77" and 83"/Manual Multi assets remain separate and unchanged.
 * Each drawing retains its own original geometry.
 */
export function MultiSoundbar65ArtworkFaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 1544 118"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="multi-bw-65" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncG type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncB type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image
        x={0}
        y={0}
        width={1544}
        height={118}
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/59627c502_Screenshot2026-09-11at172257.png"
        preserveAspectRatio="none"
        filter="url(#multi-bw-65)"
      />
    </svg>
  );
}

/**
 * Multi Soundbar — 100" TV dedicated artwork rendering using the original
 * technical line drawing for the 100" configuration. The uploaded source
 * image is rendered with CSS filters to normalise grey-on-light-grey to
 * clean black-and-white. The viewBox matches the physical 2230×100mm
 * aspect ratio so the drawing scales proportionally with width changes.
 * preserveAspectRatio="xMidYMid meet" guarantees the native drawing
 * geometry is never stretched, squashed, or distorted.
 *
 * Used ONLY for:
 *   - 100" TV + Multi Soundbar
 *
 * The 65", 77", and 83"/Manual Multi assets remain separate and unchanged.
 * Each drawing retains its own original geometry.
 */
export function MultiSoundbar100ArtworkFaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 1722 90"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="multi-bw-100" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncG type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
            <feFuncB type="table" tableValues="0 0 0 0 0 0 0 0 1 1"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image
        x={0}
        y={0}
        width={1722}
        height={90}
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/63cbb5139_Screenshot2026-09-11at172359.png"
        preserveAspectRatio="none"
        filter="url(#multi-bw-100)"
      />
    </svg>
  );
}

export function MultiSoundbar83FaceIcon({ x, y, width, height }) {
  // viewBox matches the 1872mm × 100mm physical aspect ratio (~18.7:1)
  const clusterCentres = [65, 295];
  const tinyCircles = [20, 120, 240, 340];
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 360 20"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outer chassis */}
      <rect x="1" y="1" width="358" height="18" rx="1" fill="none" stroke={STROKE} strokeWidth="0.8" />

      {/* Two driver clusters — left and right */}
      {clusterCentres.map((cx, i) => (
        <g key={`cluster83-${i}`}>
          {/* Left woofer with corner bolts */}
          <rect x={cx - 11} y="5" width="10" height="10" fill="none" stroke={STROKE} strokeWidth="0.7" />
          <CornerBolts x={cx - 11} y={5} w={10} h={10} inset={1.5} r={0.5} />
          <WooferCircles cx={cx - 6} cy={10} r1={3.5} r2={2.2} r3={0.7} />

          {/* Right woofer with corner bolts */}
          <rect x={cx + 1} y="5" width="10" height="10" fill="none" stroke={STROKE} strokeWidth="0.7" />
          <CornerBolts x={cx + 1} y={5} w={10} h={10} inset={1.5} r={0.5} />
          <WooferCircles cx={cx + 6} cy={10} r1={3.5} r2={2.2} r3={0.7} />

          {/* Central tweeter */}
          <TweeterCircles cx={cx} cy={10} r1={2.2} r2={1.3} />
        </g>
      ))}

      {/* Tiny dots — far ends and two in the centre gap at ~1/3 and ~2/3 */}
      {tinyCircles.map((tx, i) => (
        <circle key={`tiny83-${i}`} cx={tx} cy={10} r="1.5" fill="none" stroke={STROKE} strokeWidth="0.5" />
      ))}
    </svg>
  );
}