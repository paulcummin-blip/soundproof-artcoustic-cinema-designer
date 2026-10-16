/**
 * reportVisualContext.js (shared)
 * -------------------------------
 * THE PROJECT LIBRARY'S OWN IMAGES, read as VISUAL CONTEXT for the Astra writer.
 *
 * The designer has already uploaded the cinema's renders to the Project Library
 * before a Project Report or a proposal is written. Those pictures are the only
 * evidence of what the room is actually meant to look like, and until now the
 * writer never saw them: it read a frozen pack of engineering results and had to
 * describe a cinema it had never been shown. This module reuses what is already
 * there. Nothing is re-uploaded, nothing is re-selected, and no new image store or
 * second library is created.
 *
 * WHAT AN IMAGE MAY AND MAY NOT DO. An image is EDITORIAL CONTEXT ONLY: it tells
 * the writer about atmosphere, interior character, visual scale, seating style,
 * architectural appearance and the way the room is intended to be experienced. It
 * is NEVER engineering evidence. No figure, distance, loudspeaker position, output
 * capability, performance level or RP22 result may be read from a picture, and no
 * visual observation ever overrides the saved engineering. That rule is stated in
 * the block the writer receives, in the words it is meant to follow.
 *
 * WHICH IMAGES ARE CHOSEN, and why. The selection is deterministic and reads only
 * the designer's own recorded metadata — never the pixels, never a caption's
 * wording, never a filename. Whole-room renders come first, then interior detail,
 * then equipment detail, capped at four. An image the designer has hidden from the
 * document is never used. An alternative the client is being offered — a seating
 * or interior OPTION, or a comparison option — is never presented as the selected
 * design. Plans, elevations and dimensioned drawings are left out: this context is
 * about the character of the room, not its dimensions.
 *
 * IDENTITY, NOT ADDRESS. A picture is identified by its own record id and by the
 * file it holds — the uploaded file's name, which changes whenever the designer
 * replaces the image — together with the metadata that describes it. A storage URL
 * is a FETCH ADDRESS and is never part of the identity: it is never stored in a
 * fingerprint, so a narrative can never be tied to a link that expires or moves.
 *
 * Pure: no React, no SDK, no runtime-specific APIs, no network. Nothing here is
 * ever sent anywhere by itself; the caller decides what reaches the provider.
 */

/** The identity generation of this context. A context from another generation is not read. */
export const REPORT_VISUAL_CONTEXT_VERSION = 1;

/** Why a report has no visual context to offer. */
export const VISUAL_REFUSAL = Object.freeze({
  /** The Project Library holds no images for this project at all. */
  NO_IMAGES: 'no_library_images',
  /** Images exist, but none of them may represent the SELECTED design. */
  NO_ELIGIBLE_IMAGES: 'no_eligible_images',
});

/** The most images a writer is ever shown. Two to four read as a room; more read as a gallery. */
export const MAX_VISUAL_IMAGES = 4;

/** The designer's own reason for an image being unusable as visual context. */
export const VISUAL_EXCLUSION = Object.freeze({
  HIDDEN: 'hidden_by_designer',
  COMPARISON_OPTION: 'comparison_option',
  SEATING_OPTION: 'seating_option',
  TECHNICAL_DRAWING: 'technical_drawing',
  OTHER_VERSION: 'other_version',
  NO_FILE: 'no_file',
});

/** Purposes that are drawings rather than views of the room. */
const DRAWING_PURPOSES = Object.freeze(['layout_drawing']);

/**
 * Purposes that state an ALTERNATIVE the client is being offered rather than the
 * selected design. The seating option purpose is how the current gallery records
 * the same intent the legacy seating_style field records, and both are treated the
 * same way: never presented as the design this report documents.
 */
const ALTERNATIVE_PURPOSES = Object.freeze(['seating_option']);

/** Legacy asset types that are drawings or documents rather than views of the room. */
const DRAWING_ASSET_TYPES = Object.freeze(['plan', 'elevation', 'technical_drawings', 'documents']);

/** Legacy asset types that ARE views of a room, read as whole-room context. */
const ROOM_ASSET_TYPES = Object.freeze(['cover_image', 'front_view', 'rear_view']);

/** How the chosen images were ranked, stated in the block the writer reads. */
export const VISUAL_SELECTION_RULE = 'Whole-room views first, then interior detail, then equipment detail. '
  + 'Chosen only from the images this project already holds, and never an image the designer has hidden, '
  + 'an alternative the client is being offered, or a plan or dimensioned drawing.';

/** The rule the writer must follow when it is shown pictures. */
export const VISUAL_CONTEXT_RULE = 'The attached images are VISUAL CONTEXT ONLY. '
  + 'Use them to understand the intended atmosphere, the interior character, the visual scale of the cinema, '
  + 'the seating style, the architectural appearance and how the room is meant to be experienced.';

/** What the writer must never do with them. */
export const VISUAL_NEVER_RULE = 'Never read a figure, a distance, a loudspeaker position, a product or a '
  + 'performance result out of an image, and never let anything you can see override the saved engineering. '
  + 'Every dimension, capability, level and result comes from the frozen evidence alone.';

/** What the writer is being asked to write ABOUT, given the pictures. */
export const VISUAL_WRITING_RULE = 'Do not describe the photographs and do not list what is visible. '
  + 'Write about the cinema: what it is intended to feel like, why the important choices make sense, '
  + 'how picture and sound work together, and what will make films enjoyable in this room.';

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asItems(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.items) ? value.items : [];
}

/**
 * The uploaded file's own name, from a storage URL or URI — the part that changes
 * when the designer replaces the picture and stays the same when the URL is signed
 * differently. Never the URL itself.
 */
export function visualFileName(location) {
  const value = asText(location);
  if (!value) return null;
  const withoutQuery = value.split('?')[0].split('#')[0];
  const segment = withoutQuery.split('/').filter(Boolean).pop() || null;
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * How one image is DESCRIBED to the writer. Deliberately carries no address: the
 * writer reads what the picture is for, never where it is kept.
 */
function describeImage(asset) {
  return {
    id: asset?.id ?? null,
    role: visualRoleOf(asset),
    caption: asText(asset?.caption),
    slot: asset?.slot ?? null,
  };
}

/**
 * The image's identity: what the picture IS, never where it lives. A storage URL
 * never enters this object, so no fingerprint built from it can ever depend on a
 * link.
 */
export function visualImageIdentity(asset) {
  return {
    id: asset?.id ?? null,
    file: visualFileName(asset?.file_url ?? asset?.file_uri),
    scope: asset?.scope === 'version' ? 'version' : 'project',
    version_id: asset?.version_id ?? null,
    slot: asset?.slot ?? null,
    asset_type: asset?.asset_type ?? null,
    purpose: asset?.image_purpose ?? null,
    caption: asText(asset?.caption),
  };
}

/**
 * The role a chosen image plays in the visual context, from the designer's own
 * recorded purpose where one exists, and from the legacy asset type otherwise.
 */
export function visualRoleOf(asset) {
  const purpose = asText(asset?.image_purpose);
  if (purpose === 'whole_room') return 'whole_room';
  if (purpose === 'interior_detail') return 'interior_detail';
  if (purpose === 'product_detail') return 'product_detail';
  if (purpose === 'other') return 'other';
  // No purpose recorded: a legacy record, read by what it was uploaded as.
  if (ROOM_ASSET_TYPES.includes(asset?.asset_type)) return 'whole_room';
  return 'other';
}

/** Whole-room first, then interior detail, then equipment detail, then everything else. */
function roleRank(role) {
  if (role === 'whole_room') return 1;
  if (role === 'interior_detail') return 2;
  if (role === 'product_detail') return 3;
  return 4;
}

/** The cover leads, then the gallery slots in their own order; id breaks any tie. */
function slotRank(asset) {
  const slot = asText(asset?.slot);
  if (slot === 'cover') return 0;
  const match = /^image_(\d+)$/.exec(slot || '');
  if (match) return Number(match[1]);
  return 99;
}

/**
 * Whether one image may represent the SELECTED design, and if not, why.
 *
 * @param {Object} asset — one Project Library image record
 * @param {Object} [options]
 * @param {string|null} [options.versionId] — the version this report documents
 * @returns {{ eligible: boolean, reason: string|null, role: string }}
 */
export function visualEligibility(asset, { versionId = null } = {}) {
  const role = visualRoleOf(asset);
  const reject = (reason) => ({ eligible: false, reason, role });

  // The designer has hidden it from the document: never used, for any purpose.
  if (asset?.usage === 'do_not_use') return reject(VISUAL_EXCLUSION.HIDDEN);
  // An alternative the client is being offered is not the selected design.
  if (asset?.comparison_enabled === true) return reject(VISUAL_EXCLUSION.COMPARISON_OPTION);
  if (asText(asset?.seating_style)) return reject(VISUAL_EXCLUSION.SEATING_OPTION);
  if (ALTERNATIVE_PURPOSES.includes(asText(asset?.image_purpose))) return reject(VISUAL_EXCLUSION.SEATING_OPTION);
  // Character, not dimensions.
  if (DRAWING_PURPOSES.includes(asText(asset?.image_purpose))) return reject(VISUAL_EXCLUSION.TECHNICAL_DRAWING);
  if (DRAWING_ASSET_TYPES.includes(asset?.asset_type)) return reject(VISUAL_EXCLUSION.TECHNICAL_DRAWING);
  // An image belonging to another version describes another design.
  const scope = asset?.scope === 'version' ? 'version' : 'project';
  if (scope === 'version' && versionId && asset?.version_id && asset.version_id !== versionId) {
    return reject(VISUAL_EXCLUSION.OTHER_VERSION);
  }
  if (!asText(asset?.file_url ?? asset?.file_uri)) return reject(VISUAL_EXCLUSION.NO_FILE);

  return { eligible: true, reason: null, role };
}

/**
 * The images that will represent this design's visual character: at most four,
 * ranked by role and slot, each with the reason it was chosen or rejected so the
 * selection can always be read back.
 *
 * @param {Array|Object} assets — the project's Project Library images
 * @param {Object} [options]
 * @param {string|null} [options.versionId] — the version this report documents
 * @param {number} [options.limit]
 * @returns {{ images: Array, considered: Array, eligible_count: number }}
 */
export function selectVisualImages(assets, { versionId = null, limit = MAX_VISUAL_IMAGES } = {}) {
  const considered = asItems(assets).map((asset) => {
    const verdict = visualEligibility(asset, { versionId });
    return { asset, ...verdict };
  });

  const eligible = considered.filter((row) => row.eligible);
  const chosen = eligible
    .slice()
    .sort((a, b) => (
      roleRank(a.role) - roleRank(b.role)
      || slotRank(a.asset) - slotRank(b.asset)
      || String(a.asset?.id || '').localeCompare(String(b.asset?.id || ''))
    ))
    .slice(0, Math.max(1, limit));

  return {
    images: chosen.map((row) => row.asset),
    considered,
    eligible_count: eligible.length,
  };
}

/**
 * The frozen visual context for this report: the chosen images, what each one is,
 * and the fingerprint of that exact selection.
 *
 * @param {Object} input
 * @param {Array|Object} input.assets — the project's Project Library images
 * @param {string|null} [input.versionId] — the version this report documents
 * @param {number} [input.limit]
 * @returns {Object} { version, available, reason, images, fingerprint, selection_rule }
 */
export function buildReportVisualContext({ assets = [], versionId = null, limit = MAX_VISUAL_IMAGES } = {}) {
  const library = asItems(assets).filter((asset) => asset && typeof asset === 'object');
  const selection = selectVisualImages(library, { versionId, limit });

  const base = {
    version: REPORT_VISUAL_CONTEXT_VERSION,
    available: false,
    reason: null,
    version_id: versionId ?? null,
    images: [],
    rejected: [],
    fingerprint: null,
    selection_rule: VISUAL_SELECTION_RULE,
  };

  if (library.length === 0) {
    return { ...base, reason: VISUAL_REFUSAL.NO_IMAGES };
  }

  if (selection.images.length === 0) {
    return {
      ...base,
      reason: VISUAL_REFUSAL.NO_ELIGIBLE_IMAGES,
      rejected: selection.considered
        .map((row) => ({ id: row.asset?.id ?? null, reason: row.reason }))
        .filter((row) => row.reason),
    };
  }

  const images = selection.images.map((asset) => ({
    ...describeImage(asset),
    identity: visualImageIdentity(asset),
    // The address is carried for the CALL ONLY. It is not part of the identity
    // above, and no fingerprint is ever built from it.
    source: asText(asset.file_url ?? asset.file_uri),
  }));

  return {
    ...base,
    available: true,
    images,
    rejected: selection.considered
      .filter((row) => !row.eligible)
      .map((row) => ({ id: row.asset?.id ?? null, reason: row.reason })),
    fingerprint: visualContextFingerprint(images),
  };
}

/**
 * Deterministic key order, so the same selection always fingerprints identically.
 * Carried here rather than reached for from another authority, so this module stays
 * dependency-free and safely importable from a report component in the browser as
 * well as from a backend function.
 */
function canonicalise(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort().filter((key) => value[key] !== undefined);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The fingerprint of a chosen selection: every image's own identity, in order,
 * under this context's generation. Built from identities, so it survives a moved
 * or re-signed storage URL and changes the moment the picture itself is replaced,
 * a caption is rewritten, or a different image is chosen.
 */
export function visualContextFingerprint(images) {
  const identities = asItems(images).map((image) => image?.identity || visualImageIdentity(image));
  const text = canonicalise(identities);
  return `vc${REPORT_VISUAL_CONTEXT_VERSION}-${fnv1a(text)}-${text.length.toString(16)}`;
}

/** The fetch addresses for one call. Runtime only: never stored, never in a fingerprint. */
export function visualContextSources(context) {
  return asItems(context?.images)
    .map((image) => asText(image?.source))
    .filter(Boolean);
}

/**
 * The visual block the writer reads, or null when there is nothing to show. It
 * states what the images are for, what they may never be used for, and what the
 * writer is being asked to write about — and it carries no address, because the
 * images themselves are attached to the request.
 */
export function writerVisualBlock(context) {
  if (context?.available !== true) return null;
  const images = asItems(context.images);
  if (images.length === 0) return null;

  return {
    rule: VISUAL_CONTEXT_RULE,
    never: VISUAL_NEVER_RULE,
    writing: VISUAL_WRITING_RULE,
    available: true,
    fingerprint: context.fingerprint ?? null,
    image_count: images.length,
    images: images.map((image) => ({
      role: image.role ?? 'other',
      caption: image.caption ?? null,
    })),
    selection: context.selection_rule ?? VISUAL_SELECTION_RULE,
  };
}

export default buildReportVisualContext;