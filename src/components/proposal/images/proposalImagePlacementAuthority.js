/**
 * proposalImagePlacementAuthority.js
 * ----------------------------------
 * The vocabulary and crop rules of the Proposal's editorial image placement.
 *
 * The Proposal is image-led. Two or three strong renders carry it: one dominant
 * full-width landscape, smaller portrait editorial crops beside the copy, and the
 * deliberate RETURN of a source in a different crop later in the document. A
 * source image is never duplicated to make a second crop — a placement points at
 * the one stored asset and states how that file is framed.
 *
 * Presentation only. Nothing here reads a result, writes copy or saves a record,
 * and the module has no imports at all, so it can be run from a plain node script.
 */

export const EDITORIAL_ROLE = Object.freeze({
  /** The one cover image: a dramatic portrait crop. */
  COVER: 'cover',
  /** The dominant treatment: full-width, image-first. */
  LANDSCAPE_FEATURE: 'landscape_feature',
  /** The smaller accent: a portrait crop used among the copy. */
  PORTRAIT_EDITORIAL: 'portrait_editorial',
  /** A large lifestyle image on the seating-style page. */
  SEATING_OPTION: 'seating_option',
  /** The closing full-width landscape. */
  CLOSING_FEATURE: 'closing_feature',
});

export const CROP_ORIENTATION = Object.freeze({
  /** The cover crop: a tight portrait framing. */
  COVER_PORTRAIT: 'cover_portrait',
  /** A portrait editorial accent. */
  PORTRAIT: 'portrait',
  /** The original landscape composition, close to as shot. */
  LANDSCAPE_FULL: 'landscape_full',
});

export const FOCAL_HORIZONTAL = Object.freeze({
  LEFT: 'left',
  CENTRE: 'centre',
  RIGHT: 'right',
});

export const FOCAL_VERTICAL = Object.freeze({
  TOP: 'top',
  MIDDLE: 'middle',
  BOTTOM: 'bottom',
});

/** Centre / middle: what an image with no focal point recorded is framed on. */
export const DEFAULT_FOCAL_POINT = Object.freeze({
  horizontal: FOCAL_HORIZONTAL.CENTRE,
  vertical: FOCAL_VERTICAL.MIDDLE,
});

/** The two seating styles a Library image may be grouped as. */
export const SEATING_STYLE = Object.freeze({
  LOUNGE: 'lounge',
  RECLINER: 'recliner',
});

export const SEATING_STYLE_LABELS = Object.freeze({
  [SEATING_STYLE.LOUNGE]: 'Lounge seating',
  [SEATING_STYLE.RECLINER]: 'Cinema recliners',
});

/** The section id the seating-style page carries: it is not a stored section. */
export const SEATING_STYLE_SECTION_ID = 'seating_style';

/** Mirrors ASSET_SLOT.COVER: the cover image's slot in the project gallery. */
export const PROPOSAL_COVER_SLOT = 'cover';

const HORIZONTAL_VALUES = Object.values(FOCAL_HORIZONTAL);
const VERTICAL_VALUES = Object.values(FOCAL_VERTICAL);
const SEATING_VALUES = Object.values(SEATING_STYLE);

/** The crop a role is framed in. */
export function cropOrientationForRole(role) {
  if (role === EDITORIAL_ROLE.COVER) return CROP_ORIENTATION.COVER_PORTRAIT;
  if (role === EDITORIAL_ROLE.PORTRAIT_EDITORIAL) return CROP_ORIENTATION.PORTRAIT;
  return CROP_ORIENTATION.LANDSCAPE_FULL;
}

/**
 * An image is available to the proposal unless the designer has hidden it.
 * An image with nothing recorded is available — that is what keeps every image
 * uploaded before these controls existed composed exactly as it was.
 */
export function isUsableInProposal(asset) {
  if (!asset || !asset.file_url) return false;
  if (asset.usage === 'do_not_use') return false;
  if (String(asset.proposal_importance || '').trim().toLowerCase() === 'do not use') return false;
  return true;
}

/** The seating style an image is grouped under, or null when it is not one. */
export function seatingStyleOf(asset) {
  const value = asset?.seating_style;
  return SEATING_VALUES.includes(value) ? value : null;
}

/**
 * The focal point an image is framed on. Only the two declared values are read:
 * anything else is the default, so a bad value can never crop an image oddly.
 */
export function assetFocalPoint(asset) {
  const horizontal = HORIZONTAL_VALUES.includes(asset?.focal_horizontal)
    ? asset.focal_horizontal
    : DEFAULT_FOCAL_POINT.horizontal;
  const vertical = VERTICAL_VALUES.includes(asset?.focal_vertical)
    ? asset.focal_vertical
    : DEFAULT_FOCAL_POINT.vertical;
  return { horizontal, vertical };
}

/** The CSS object-position a focal point frames an image on. */
export function objectPositionForFocalPoint(focalPoint) {
  const horizontal = focalPoint?.horizontal || DEFAULT_FOCAL_POINT.horizontal;
  const vertical = focalPoint?.vertical || DEFAULT_FOCAL_POINT.vertical;
  const x = { left: '0%', centre: '50%', right: '100%' }[horizontal] || '50%';
  const y = { top: '0%', middle: '50%', bottom: '100%' }[vertical] || '50%';
  return `${x} ${y}`;
}

/**
 * One placement of one stored source image.
 *
 * The placement carries the source's identity AND the framing decision, so the
 * same file can be composed twice in two different ways without a second copy of
 * the image ever existing.
 *
 * @param {Object} args
 * @param {Object} args.source      the stored Library image
 * @param {string} args.role        one of EDITORIAL_ROLE
 * @param {string} args.sectionId   the section the placement belongs to
 * @param {number} args.pagePosition the page in the document's narrative order (cover = 1)
 * @param {number} args.order        the placement's order in the document
 */
export function makePlacement({ source, role, sectionId, pagePosition, order }) {
  return {
    id: `${role}:${source?.id || 'unknown'}:${order}`,
    source_asset_id: source?.id || null,
    source_file_url: source?.file_url || null,
    // Carried so a page can caption its image without a second lookup.
    source_caption: source?.caption || null,
    editorial_role: role,
    crop_orientation: cropOrientationForRole(role),
    focal_point: assetFocalPoint(source),
    section_id: sectionId ?? null,
    page_position: pagePosition ?? null,
    placement_order: order ?? null,
  };
}