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
  /** One option on a comparison group's own page. */
  COMPARISON_OPTION: 'comparison_option',
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

/**
 * ── Image presentation ──────────────────────────────────────────────────────
 * How ONE image is presented in the proposal, chosen by the designer on the
 * image's own card. It distinguishes the image that carries the document from
 * the image that supports it:
 *
 *   FULL WIDTH      the large editorial image: cinema photographs, interior
 *                   renders, hero images. The treatment the document has always
 *                   given a landscape feature.
 *   DETAIL          a smaller, UNGROUPED presentation at roughly 50 to 65 per
 *                   cent of the usable width: dimensioned floor plans, seating
 *                   arrangements, technical drawings, equipment details. A
 *                   detail image is NEVER cropped, so the whole drawing stays
 *                   visible and its dimensions, labels and annotations are
 *                   never cut off.
 *   CROPPED DETAIL  a smaller editorial presentation where cropping IS
 *                   permitted, framed on the image's own focal point.
 *
 * An image with NOTHING recorded keeps the behaviour it had before this choice
 * existed: the presentation is a preference, not a migration, and no stored
 * image is re-composed because a field was added. Cropping is only ever
 * permitted where the designer selected a crop-permitting mode.
 */
export const IMAGE_PRESENTATION = Object.freeze({
  FULL_WIDTH: 'full_width',
  DETAIL: 'detail',
  CROPPED_DETAIL: 'cropped_detail',
});

export const IMAGE_PRESENTATION_LABELS = Object.freeze({
  [IMAGE_PRESENTATION.FULL_WIDTH]: 'Full width',
  [IMAGE_PRESENTATION.DETAIL]: 'Detail',
  [IMAGE_PRESENTATION.CROPPED_DETAIL]: 'Cropped detail',
});

export const IMAGE_PRESENTATION_HELP = Object.freeze({
  [IMAGE_PRESENTATION.FULL_WIDTH]: 'The large editorial image and the prominent place in the document. Cinema photographs, interior renders and hero images.',
  [IMAGE_PRESENTATION.DETAIL]: 'Shown smaller and never cropped: the whole drawing stays visible, with its dimensions, labels and annotations, and the caption stays with it. Dimensioned plans, seating arrangements and technical drawings.',
  [IMAGE_PRESENTATION.CROPPED_DETAIL]: 'Shown smaller, with cropping allowed: the focal point below decides the part of the frame that is kept. Furniture details, materials, lighting and decorative photography.',
});

const PRESENTATION_VALUES = Object.values(IMAGE_PRESENTATION);

/** The share of the usable content width each presented image is composed at. */
export const PRESENTATION_WIDTH_PERCENT = Object.freeze({
  [IMAGE_PRESENTATION.FULL_WIDTH]: 100,
  [IMAGE_PRESENTATION.DETAIL]: 58,
  [IMAGE_PRESENTATION.CROPPED_DETAIL]: 58,
});

/**
 * The presentation the designer has chosen for this image, or null where none
 * is recorded. Only the three declared values are read: anything else is null,
 * which composes the image exactly as it was composed before this choice
 * existed, so a bad or unknown value can never crop or shrink an image.
 */
export function imagePresentationOf(asset) {
  const value = recorded(asset?.image_presentation);
  return PRESENTATION_VALUES.includes(value) ? value : null;
}

/**
 * Whether the chosen presentation permits cropping at all. FULL WIDTH and
 * CROPPED DETAIL crop; DETAIL never does, whatever the space on the page.
 * An image with no preference recorded reads as true, because that is the
 * behaviour it already had.
 */
export function presentationCropAllowed(presentation) {
  if (presentation === null || presentation === undefined || presentation === '') return true;
  return presentation !== IMAGE_PRESENTATION.DETAIL;
}

/** Whether the focal point controls apply to this presentation. */
export function presentationFocalApplies(presentation) {
  return presentationCropAllowed(presentation);
}

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

/**
 * ── Comparison images ───────────────────────────────────────────────────────
 * A comparison image is not a gallery image. It is one option in a deliberate
 * visual comparison the designer has marked: two (or more) images that answer
 * the same question — a seating style, a finish, a screen wall — shown together
 * on their own page, full width, each captioned with what it is, with the
 * designer's own message above them.
 *
 * The designer states what is being compared and what the client should
 * understand from it. Nothing here infers a comparison from a caption, a file
 * name or the image itself, and nothing here invents the message: where no note
 * exists anywhere, the page carries neutral text stating that the images are two
 * visual options for the same design.
 */
export const COMPARISON_SECTION_ID = 'comparison_options';

/** The group an image marked as a comparison belongs to when it names none. */
export const DEFAULT_COMPARISON_GROUP = 'Comparison options';

/** The neutral message, used only where no note exists anywhere for the group. */
export const NEUTRAL_COMPARISON_MESSAGE = 'These images show two visual options for the same design. Review the differences in style and layout before selecting the preferred direction.';

/** The question proposal creation asks when comparison images exist. */
export const COMPARISON_MESSAGE_QUESTION = 'What are we comparing, and what is the message?';

/** The helper text that question carries. */
export const COMPARISON_MESSAGE_HELPER = 'These images are marked as comparison images. Add a short note explaining what the client should understand from the comparison.';

const recorded = (value) => String(value ?? '').trim();

/**
 * Whether the designer has marked an image as part of a comparison set.
 * The flag is the statement of intent; an image whose flag is unset but which
 * carries a group name or an option label is read as marked, so a value written
 * elsewhere is never silently lost.
 */
export function isComparisonImage(asset) {
  if (!asset) return false;
  if (asset.comparison_enabled === true) return true;
  if (asset.comparison_enabled === false) return false;
  return recorded(asset.comparison_group).length > 0
    || recorded(asset.comparison_option_label).length > 0;
}

/** The comparison set an image belongs to, by name, or null when it is not one. */
export function comparisonGroupNameOf(asset) {
  if (!isComparisonImage(asset)) return null;
  return recorded(asset.comparison_group) || DEFAULT_COMPARISON_GROUP;
}

/** What the option this image stands for is called, or null when none is stated. */
export function comparisonOptionLabelOf(asset) {
  if (!isComparisonImage(asset)) return null;
  return recorded(asset.comparison_option_label) || null;
}

/** The designer's own message recorded on this image, or null. */
export function comparisonNoteOf(asset) {
  return recorded(asset?.comparison_note) || null;
}

/** The display order this image states inside its group, or null when unstated. */
export function comparisonOrderOf(asset) {
  const value = Number(asset?.comparison_order);
  return Number.isFinite(value) ? value : null;
}

/**
 * The images of one comparison set in the order the page shows them: a stated
 * display order leads (lowest number first), then the gallery order, so an
 * unstated order is never guessed at.
 */
export function orderedComparisonImages(assets = []) {
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => comparisonGroupNameOf(asset))
    .map((asset, index) => ({ asset, index, order: comparisonOrderOf(asset) }))
    .sort((a, b) => {
      if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
      if (a.order !== null && b.order === null) return -1;
      if (a.order === null && b.order !== null) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.asset);
}

/**
 * The comparison sets a project's images state, in the order the groups are first
 * named, each with the message its page carries.
 *
 * The message is the designer's own note, read from the group's images in
 * display order; where the group states no note, the message supplied for the
 * proposal is used; where neither exists, the neutral message is used. The source
 * travels with the message, so a surface can state which one it is reading.
 *
 * @param {Array} assets — the project's images (any mix of scopes and slots)
 * @param {{proposalMessage?: string|null}} [options]
 * @returns {Array<{id: string, name: string, images: Array, message: string,
 *   message_source: 'image_note'|'proposal'|'neutral'}>}
 */
export function comparisonGroupsOf(assets = [], { proposalMessage = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const names = [];
  list.forEach((asset) => {
    const name = comparisonGroupNameOf(asset);
    if (name && !names.includes(name)) names.push(name);
  });

  return names.map((name) => {
    const images = orderedComparisonImages(list.filter((asset) => comparisonGroupNameOf(asset) === name));
    const note = images.map((image) => comparisonNoteOf(image)).find(Boolean) || null;
    const stated = recorded(proposalMessage) || null;
    return {
      id: name,
      name,
      images,
      message: note || stated || NEUTRAL_COMPARISON_MESSAGE,
      message_source: note ? 'image_note' : (stated ? 'proposal' : 'neutral'),
    };
  });
}

/** The title a comparison group's page carries: the group's own name. */
export function comparisonPageTitle(group) {
  return recorded(group?.name) || DEFAULT_COMPARISON_GROUP;
}

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
export function makePlacement({ source, role, sectionId, pagePosition, order, comparison_group = null, comparison_option_label = null }) {
  const presentation = imagePresentationOf(source);
  return {
    id: `${role}:${source?.id || 'unknown'}:${order}`,
    source_asset_id: source?.id || null,
    source_file_url: source?.file_url || null,
    // Carried so a page can caption its image without a second lookup.
    source_caption: source?.caption || null,
    editorial_role: role,
    crop_orientation: cropOrientationForRole(role),
    focal_point: assetFocalPoint(source),
    // THE DESIGNER'S PRESENTATION CHOICE, carried on the placement so the
    // composer and the renderer honour it without a second lookup. Null where
    // none is recorded, which is composed exactly as the document always
    // composed it. crop_allowed is the permission itself: where it is false the
    // image is shown whole, whatever the page has room for.
    image_presentation: presentation,
    crop_allowed: presentationCropAllowed(presentation),
    presentation_width_percent: presentation ? PRESENTATION_WIDTH_PERCENT[presentation] : null,
    section_id: sectionId ?? null,
    page_position: pagePosition ?? null,
    placement_order: order ?? null,
    // A comparison option carries its own group and what it stands for, so its
    // page states the option under the image without a second lookup. Null on
    // every other placement.
    comparison_group: comparison_group || null,
    comparison_option_label: comparison_option_label || null,
  };
}