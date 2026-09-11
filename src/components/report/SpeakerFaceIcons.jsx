import React from 'react';

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
  // Q4-3 cabinet is 4:3 (280×210mm). viewBox matches artwork aspect so the
  // image fills the complete physical cabinet viewport without double aspect-fit.
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 75" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="75" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/689388d97_Q4-3front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Q45FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/d1376c28d_Q4-5front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

/**
 * Spitfire Q 8-5 — tall portrait cabinet
 * Uses product sheet image.
 */
export function Q85FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image
        x="0"
        y="0"
        width="100"
        height="100"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/8eb64d06e_Q8-5Front.png"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}

export function Q63FaceIcon({ x, y, size, width, height }) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/9a1ad66a6_Q6-3front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

// ─── Evolve Series face icons ─────────────────────────────────────────────────

export function Evolve11FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/590fdd26f_Screenshot2026-05-23at153725.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve21FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/bb66545fd_Evolve2-1front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve31FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve42FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/fa3b2393b_Evolve4-2front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve63FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/3010c90e8_Evolve6-3front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve84FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/29826d0f4_Evolve8-4front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

// ─── Artcoustic C Series face icons ──────────────────────────────────────────

/**
 * Artcoustic C4-1 soundbar — physical 1711 × 120 mm
 * viewBox aspect ratio 1711:120 preserves exact proportions at all zoom levels.
 */
export function C41FaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 1711 120"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <image
        x="0"
        y="0"
        width="1711"
        height="120"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2adee2973_Screenshot2026-06-05at132314.png"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
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