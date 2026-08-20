/**
 * Reusable annotation layout for Front Elevation drawings.
 * Computes positions for role labels and dimension text so they never clash
 * with speaker artwork, the screen, or each other.
 *
 * Priority: product drawing → role label → dimensions
 *
 * All coordinates are in SVG pixels. The caller converts from room metres.
 */

// ── Clearance constants (SVG px) ───────────────────────────────────────────
const CLEARANCE = {
  LABEL_ABOVE: 10,       // gap between role label baseline and speaker top edge
  LABEL_BELOW: 14,       // gap when label is forced below the speaker
  DIM_SIDE: 8,           // horizontal gap between dimension text and speaker side
  DIM_LINE_SPACING: 11,  // vertical spacing between the two dimension text baselines
  SCREEN: 6,             // extra clearance from screen bounding box
  ROOM_EDGE: 6,           // minimum inset from room drawing boundary
  SPEAKER_ARTWORK: 3,    // extra clearance from other speaker artwork
};

// Font sizes — must match the rendering in FrontElevation.jsx
const FONT = {
  LABEL: 9,
  DIM_HEIGHT: 6.5,
  DIM_SIZE: 6,
};

// ── Bounding box helpers ──────────────────────────────────────────────────
function makeBox(left, top, right, bottom) {
  return { left, top, right, bottom };
}

export function speakerBBox(cx, cy, sw, sh) {
  return makeBox(cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2);
}

function textBox(x, y, text, fontSize, anchor) {
  const w = text.length * fontSize * 0.55;
  let left, right;
  if (anchor === 'middle') { left = x - w / 2; right = x + w / 2; }
  else if (anchor === 'end') { left = x - w; right = x; }
  else { left = x; right = x + w; }
  return makeBox(left, y - fontSize, right, y + 2);
}

function boxesOverlap(a, b, pad = 0) {
  return (
    a.left - pad < b.right &&
    a.right + pad > b.left &&
    a.top - pad < b.bottom &&
    a.bottom + pad > b.top
  );
}

/**
 * Compute annotation positions for a single speaker.
 *
 * @param {object}  params
 * @param {object}  params.speaker       { cx, cy, sw, sh, role, label } in SVG px
 * @param {object|null} params.screen    screen bounding box { left, top, right, bottom } or null
 * @param {object}  params.roomBounds    { left, right, top, bottom } drawable area
 * @param {Array}   params.otherSpeakers bounding boxes of other speakers
 * @param {string}  params.heightLabel   e.g. "H133cm"
 * @param {string}  params.sizeLabel     e.g. "28×28cm"
 * @returns {object} { label: {x, y}, dim: { x, yHeight, ySize, anchor, side } }
 */
export function computeSpeakerAnnotation({
  speaker,
  screen,
  roomBounds,
  otherSpeakers,
  heightLabel,
  sizeLabel,
}) {
  const sbox = speakerBBox(speaker.cx, speaker.cy, speaker.sw, speaker.sh);
  const role = String(speaker.role || '').toUpperCase();

  // ── Role label: above the speaker, horizontally centred ──
  // If above would exit the room area, place below instead.
  let labelY = sbox.top - CLEARANCE.LABEL_ABOVE;
  const labelText = String(speaker.label || role);
  if (labelText) {
    const labelBox = textBox(sbox.cx, labelY, labelText, FONT.LABEL, 'middle');
    if (labelBox.top < roomBounds.top + CLEARANCE.ROOM_EDGE) {
      labelY = sbox.bottom + CLEARANCE.LABEL_BELOW;
    }
  }
  const label = { x: sbox.cx, y: labelY };

  // ── Dimensions: side depends on role ──
  // FL → left, FR → right, FC → right (fallback left), SUB → right (fallback left)
  const preferredSide = role === 'FL' ? 'left' : 'right';

  // Vertical position: two lines centred against the speaker
  const yHeight = sbox.cy - CLEARANCE.DIM_LINE_SPACING / 2;
  const ySize = sbox.cy + CLEARANCE.DIM_LINE_SPACING / 2 + 1;

  const trySide = (side) => {
    const anchor = side === 'left' ? 'end' : 'start';
    const dimX = side === 'left'
      ? sbox.left - CLEARANCE.DIM_SIDE
      : sbox.right + CLEARANCE.DIM_SIDE;

    const tbH = heightLabel ? textBox(dimX, yHeight, heightLabel, FONT.DIM_HEIGHT, anchor) : null;
    const tbS = sizeLabel ? textBox(dimX, ySize, sizeLabel, FONT.DIM_SIZE, anchor) : null;

    // Check room bounds
    if (side === 'left' && tbH && tbH.left < roomBounds.left + CLEARANCE.ROOM_EDGE) return null;
    if (side === 'right' && tbH && tbH.right > roomBounds.right - CLEARANCE.ROOM_EDGE) return null;

    // Check screen collision
    if (screen) {
      if (tbH && boxesOverlap(tbH, screen, CLEARANCE.SCREEN)) return null;
      if (tbS && boxesOverlap(tbS, screen, CLEARANCE.SCREEN)) return null;
    }

    // Check other speaker artwork collision
    for (const ob of otherSpeakers) {
      if (tbH && boxesOverlap(tbH, ob, CLEARANCE.SPEAKER_ARTWORK)) return null;
      if (tbS && boxesOverlap(tbS, ob, CLEARANCE.SPEAKER_ARTWORK)) return null;
    }

    return { dimX, anchor };
  };

  let result = trySide(preferredSide);
  let side = preferredSide;

  if (!result) {
    const altSide = preferredSide === 'left' ? 'right' : 'left';
    const altResult = trySide(altSide);
    if (altResult) {
      result = altResult;
      side = altSide;
    } else {
      // Both sides fail — use preferred side
      const anchor = preferredSide === 'left' ? 'end' : 'start';
      const dimX = preferredSide === 'left'
        ? sbox.left - CLEARANCE.DIM_SIDE
        : sbox.right + CLEARANCE.DIM_SIDE;
      result = { dimX, anchor };
    }
  }

  return {
    label,
    dim: {
      x: result.dimX,
      yHeight,
      ySize,
      anchor: result.anchor,
      side,
    },
  };
}