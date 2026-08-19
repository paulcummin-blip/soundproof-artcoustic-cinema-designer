/**
 * Artcoustic Product CAD Block Library
 * ------------------------------------
 * Reusable DXF R12 BLOCK definitions for Artcoustic products, built from the
 * canonical product registry (src/components/models/speakers/registry.jsx).
 *
 * Each block is defined in the product's NATIVE orientation:
 *   - Origin (0,0) = cabinet centre (the INSERT insertion point).
 *   +X = cabinet width axis (left/right).
 *   +Y = cabinet depth axis, FRONT FACE direction (fires toward +Y).
 *
 * When INSERTed, the CAD author applies a rotation to match the placement
 * orientation (e.g. side-wall surrounds rotate ±90°). The block geometry
 * itself never changes.
 *
 * Each block contains:
 *   1. Footprint geometry  — true-scale rectangle or circle (plan view, mm).
 *   2. Centre reference    — cross at the origin (insertion point).
 *   3. Front-face indicator — firing-axis arrow on the +Y edge.
 *   4. Product dimensions   — "W × D × H mm" text.
 *   5. Product label        — model name text.
 *
 * This module is a LIBRARY ONLY. It does not modify the project CAD overlay
 * export (cadExport.jsx). Integration is a separate stage.
 *
 * Units: millimetres. DXF R12.
 */

// ─── Block layer names (exported for layer-table registration by the consumer) ─
export const ARTCOUSTIC_CAD_LAYERS = [
  'ARTCOUSTIC_FOOTPRINT',
  'ARTCOUSTIC_GRILLE',
  'ARTCOUSTIC_DRIVERS',
  'ARTCOUSTIC_CENTRE',
  'ARTCOUSTIC_FRONT_FACE',
  'ARTCOUSTIC_ORIENTATION',
  'ARTCOUSTIC_DIMENSIONS',
  'ARTCOUSTIC_LABELS',
];

// ─── Product block definitions ───────────────────────────────────────────────
// Sourced from the canonical speaker registry. Plan-view footprint:
//   widthMm  → X axis (cabinet width)
//   depthMm  → Y axis (cabinet depth, front face = +Y)
//   heightMm → reported in dimension text (not drawn in plan view)
//   isRound  → overhead/in-ceiling: footprint is a circle of diameterMm
//
// blockName  → the stable DXF BLOCK name used in INSERT entities.

const ARTCOUSTIC_CAD_PRODUCTS = [
  {
    blockName: 'ARTCOUSTIC_ARCHITECT_2_1',
    modelKey: 'architect-2-1',
    label: 'ARCHITECT 2-1',
    productType: 'ceiling',
    isRound: true,
    diameterMm: 240,
    depthMm: 120,
    heightMm: 120,
    frontFaceY: 120, // radius = front-face distance from centre
  },
  {
    blockName: 'ARTCOUSTIC_EVOLVE_1_1',
    modelKey: 'evolve-1-1',
    label: 'EVOLVE 1-1',
    productType: 'speaker',
    isRound: false,
    widthMm: 150,
    depthMm: 72,
    heightMm: 150,
    frontFaceY: 36, // depth/2
  },
  {
    blockName: 'ARTCOUSTIC_EVOLVE_2_1',
    modelKey: 'evolve-2-1',
    label: 'EVOLVE 2-1',
    productType: 'speaker',
    isRound: false,
    widthMm: 200,
    depthMm: 82,
    heightMm: 200,
    frontFaceY: 41,
  },
  {
    blockName: 'ARTCOUSTIC_SUB2_12',
    modelKey: 'sub2-12',
    label: 'SUB2-12',
    productType: 'subwoofer',
    isRound: false,
    widthMm: 500,
    depthMm: 255,
    heightMm: 500,
    frontFaceY: 128, // depth/2 (driver face = +Y)
  },
  {
    blockName: 'ARTCOUSTIC_SUB3_12',
    modelKey: 'sub3-12',
    label: 'SUB3-12',
    productType: 'subwoofer',
    isRound: false,
    widthMm: 600,
    depthMm: 255,
    heightMm: 600,
    frontFaceY: 128,
  },
  {
    blockName: 'ARTCOUSTIC_SUB4_12',
    modelKey: 'sub4-12',
    label: 'SUB4-12 INFRA',
    productType: 'subwoofer',
    isRound: false,
    widthMm: 440,
    depthMm: 270,
    heightMm: 1700,
    frontFaceY: 135,
  },
];

// ─── DXF R12 primitive builders (local — no dependency on cadExport.jsx) ──────

function dxfLine(layer, x1, y1, x2, y2) {
  return `0\nLINE\n8\n${layer}\n10\n${Math.round(x1)}\n20\n${Math.round(y1)}\n11\n${Math.round(x2)}\n21\n${Math.round(y2)}`;
}

function dxfCircle(layer, cx, cy, r) {
  return `0\nCIRCLE\n8\n${layer}\n10\n${Math.round(cx)}\n20\n${Math.round(cy)}\n40\n${Math.round(r)}`;
}

function dxfText(layer, x, y, height, text) {
  return `0\nTEXT\n8\n${layer}\n10\n${Math.round(x)}\n20\n${Math.round(y)}\n40\n${height}\n1\n${text}`;
}

function dxfRect(layer, x, y, w, h) {
  return [
    dxfLine(layer, x, y, x + w, y),
    dxfLine(layer, x + w, y, x + w, y + h),
    dxfLine(layer, x + w, y + h, x, y + h),
    dxfLine(layer, x, y + h, x, y),
  ].join('\n');
}

// ─── DXF SOLID triangle (filled) ─────────────────────────────────────────────
// DXF R12 SOLID entity: 4-point filled solid. For a triangle, pts 3 = 4.
// Vertex order 1→2→3 traces the perimeter for correct fill rendering.

function dxfSolidTriangle(layer, x1, y1, x2, y2, x3, y3) {
  const r = Math.round;
  return `0\nSOLID\n8\n${layer}\n10\n${r(x1)}\n20\n${r(y1)}\n11\n${r(x2)}\n21\n${r(y2)}\n12\n${r(x3)}\n22\n${r(y3)}\n13\n${r(x3)}\n23\n${r(y3)}`;
}

// ─── Front-face arrow (firing-axis indicator) ───────────────────────────────
// Solid filled triangle arrowhead at the front-face edge + firing-axis line
// from the acoustic centre (insertion point) to the front face. "F" label
// beyond the tip. Points in the +Y direction (native front).

function dxfFrontFaceArrow(product) {
  const fy = product.frontFaceY;
  const arrowSize = Math.min(15, Math.max(8, fy * 0.15));
  const labelY = fy + 20;
  return [
    // Firing axis line: centre → front edge
    dxfLine('ARTCOUSTIC_FRONT_FACE', 0, 0, 0, fy),
    // Filled triangle arrowhead at the tip
    dxfSolidTriangle('ARTCOUSTIC_FRONT_FACE', -arrowSize, fy - arrowSize, arrowSize, fy - arrowSize, 0, fy),
    // "F" label just beyond the front edge
    dxfText('ARTCOUSTIC_FRONT_FACE', -6, labelY, 25, 'F'),
  ].join('\n');
}

// ─── Orientation indicator (speakers only) ──────────────────────────────────
// Small filled triangle on the +X edge (cabinet "top" in native orientation)
// pointing outward. Marks which side is UP when wall-mounted, disambiguating
// speaker handedness in plan view.

function dxfOrientationTriangle(product) {
  const hw = Math.round(product.widthMm / 2);
  const s = Math.max(8, Math.round(Math.min(product.widthMm, product.depthMm) * 0.10));
  return dxfSolidTriangle('ARTCOUSTIC_ORIENTATION', hw, -s, hw, s, hw + Math.round(s * 1.5), 0);
}

// ─── Speaker grille + driver detail ──────────────────────────────────────────
// Representational — driver sizes derived proportionally from cabinet footprint.
// Woofer: large circle near the front face (+Y). Tweeter: small circle offset
// toward +X (cabinet top), showing vertical driver layout + orientation.

function dxfSpeakerDriverDetail(product) {
  const hw = Math.round(product.widthMm / 2);
  const hd = Math.round(product.depthMm / 2);
  const minDim = Math.min(product.widthMm, product.depthMm);
  const inset = Math.max(6, Math.round(minDim * 0.10));
  const out = [];
  // Grille outline (inset rect)
  out.push(dxfRect('ARTCOUSTIC_GRILLE', -hw + inset, -hd + inset,
    product.widthMm - 2 * inset, product.depthMm - 2 * inset));
  // Woofer circle — centred, 40% of min dim, forward of centre
  const wooferR = Math.round(minDim * 0.20);
  const wooferY = Math.round(hd * 0.25);
  out.push(dxfCircle('ARTCOUSTIC_DRIVERS', 0, wooferY, wooferR));
  // Tweeter circle — offset toward +X (top), 14% of width
  const tweeterR = Math.max(6, Math.round(product.widthMm * 0.07));
  const tweeterX = Math.round(hw * 0.45);
  out.push(dxfCircle('ARTCOUSTIC_DRIVERS', tweeterX, wooferY, tweeterR));
  return out.join('\n');
}

// ─── Subwoofer driver detail ─────────────────────────────────────────────────
// Large driver circle + outer surround ring, centred on the cabinet.
// Representational — makes the block instantly recognisable as a subwoofer.

function dxfSubwooferDriverDetail(product) {
  const minDim = Math.min(product.widthMm, product.depthMm);
  const driverR = Math.round(minDim * 0.28);
  const surroundR = Math.round(driverR * 1.15);
  return [
    dxfCircle('ARTCOUSTIC_DRIVERS', 0, 0, surroundR),
    dxfCircle('ARTCOUSTIC_DRIVERS', 0, 0, driverR),
  ].join('\n');
}

// ─── Ceiling speaker grille detail ───────────────────────────────────────────
// Concentric grille ring + centre tweeter dot. No front-face arrow (fires down).

function dxfCeilingGrilleDetail(product) {
  const r = Math.round(product.diameterMm / 2);
  const grilleR = Math.round(r * 0.80);
  const tweeterR = Math.max(8, Math.round(r * 0.12));
  return [
    dxfCircle('ARTCOUSTIC_GRILLE', 0, 0, grilleR),
    dxfCircle('ARTCOUSTIC_DRIVERS', 0, 0, tweeterR),
  ].join('\n');
}

// ─── Centre reference cross ─────────────────────────────────────────────────
// Scaled to product size so it's visible but never larger than the footprint.

function dxfCentreCross(product) {
  const span = product.isRound
    ? Math.round(product.diameterMm * 0.18)
    : Math.round(Math.min(product.widthMm, product.depthMm) * 0.18);
  const arm = Math.max(8, span);
  return [
    dxfLine('ARTCOUSTIC_CENTRE', -arm, 0, arm, 0),
    dxfLine('ARTCOUSTIC_CENTRE', 0, -arm, 0, arm),
  ].join('\n');
}

// ─── Dimension + label text ──────────────────────────────────────────────────

function dxfDimensionText(product) {
  const dimText = product.isRound
    ? `\u00D8${product.diameterMm} \u00D7 D${product.depthMm} \u00D7 H${product.heightMm} mm`
    : `${product.widthMm} \u00D7 ${product.depthMm} \u00D7 ${product.heightMm} mm`;
  // Place dimension text below the footprint (−Y side, rear of cabinet)
  const textY = product.isRound
    ? -Math.round(product.diameterMm / 2) - 30
    : -Math.round(product.depthMm / 2) - 30;
  return dxfText('ARTCOUSTIC_DIMENSIONS', 0, textY, 28, dimText);
}

function dxfLabelText(product) {
  // Place label above the footprint (+Y side, beyond the front-face arrow)
  const textY = product.isRound
    ? Math.round(product.diameterMm / 2) + 45
    : Math.round(product.depthMm / 2) + 45;
  return dxfText('ARTCOUSTIC_LABELS', 0, textY, 32, product.label);
}

// ─── Single block emission ──────────────────────────────────────────────────

function emitProductBlock(product) {
  const out = [];
  // BLOCK header — 70 = 0 (normal named block, not an xref)
  out.push(`0\nBLOCK\n8\n0\n2\n${product.blockName}\n70\n0\n10\n0\n20\n0\n30\n0`);

  const type = product.productType || (product.isRound ? 'ceiling' : 'speaker');

  if (product.isRound) {
    const r = Math.round(product.diameterMm / 2);
    out.push(dxfCircle('ARTCOUSTIC_FOOTPRINT', 0, 0, r));
    out.push(dxfCeilingGrilleDetail(product));
  } else {
    const hw = Math.round(product.widthMm / 2);
    const hd = Math.round(product.depthMm / 2);
    out.push(dxfRect('ARTCOUSTIC_FOOTPRINT', -hw, -hd, product.widthMm, product.depthMm));
    if (type === 'speaker') {
      out.push(dxfSpeakerDriverDetail(product));
      out.push(dxfOrientationTriangle(product));
    } else if (type === 'subwoofer') {
      out.push(dxfSubwooferDriverDetail(product));
    }
  }

  out.push(dxfCentreCross(product));

  // Front-face arrow: speakers and subwoofers only (ceiling fires downward)
  if (type !== 'ceiling') {
    out.push(dxfFrontFaceArrow(product));
  }

  out.push(dxfDimensionText(product));
  out.push(dxfLabelText(product));

  out.push('0\nENDBLK\n8\n0');
  return out.join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Emit the full DXF BLOCKS section containing all Artcoustic product blocks.
 * Returns a complete `0\nSECTION\n2\nBLOCKS … 0\nENDSEC` string, or '' if empty.
 */
export function emitArtcousticCadBlocks() {
  if (!ARTCOUSTIC_CAD_PRODUCTS.length) return '';
  const out = ['0\nSECTION\n2\nBLOCKS'];
  ARTCOUSTIC_CAD_PRODUCTS.forEach((product) => {
    out.push(emitProductBlock(product));
  });
  out.push('0\nENDSEC');
  return out.join('\n');
}

/**
 * Look up a CAD block name by speaker model key.
 * Returns the block name (e.g. 'ARTCOUSTIC_EVOLVE_2_1') or null if not in the library.
 */
export function getArtcousticCadBlockName(modelKey) {
  if (!modelKey) return null;
  // Normalise: lowercase, strip a trailing surround suffix ('_s') so that both
  // LCR keys (e.g. 'evolve-2-1') and surround keys (e.g. 'evolve-2-1_s') resolve
  // to the same Artcoustic product block.
  let k = String(modelKey).toLowerCase();
  if (k.endsWith('_s')) k = k.slice(0, -2);
  const product = ARTCOUSTIC_CAD_PRODUCTS.find((p) => p.modelKey === k);
  return product ? product.blockName : null;
}

/**
 * Return the full product definition (for validation / inspection).
 */
export function getArtcousticCadProduct(blockName) {
  return ARTCOUSTIC_CAD_PRODUCTS.find((p) => p.blockName === blockName) || null;
}

/**
 * Return all product definitions (for validation / inspection).
 */
export function listArtcousticCadProducts() {
  return ARTCOUSTIC_CAD_PRODUCTS.map((p) => ({ ...p }));
}