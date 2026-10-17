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
 * WHAT AN IMAGE MAY AND MAY NOT DO. A library image is a CONCEPT VISUAL of the
 * finished room: something to give the client a tangible sense of the space, to help
 * them picture spending time in it, and to make the design feel like a complete room
 * rather than a list of equipment. It is NOT approved interior design, not a
 * construction or interiors specification, and never engineering evidence.
 *
 * NO TECHNICAL FACT IS EVER TAKEN FROM A PICTURE. Nothing this project already holds
 * may be established or overridden by a render: not the room type, not the display,
 * not the seating, not a loudspeaker count or position, not a dimension and not an
 * architectural constraint. Sound Proof already knows those, and a second visual
 * authority for them is exactly what must not be created. No colour, finish,
 * material, furniture choice, lighting choice or interior style is read from one
 * either, and nothing seen in a picture may suggest that an interior has been
 * approved, specified or built. CANONICAL PROJECT AND ENGINEERING DATA ALWAYS WINS;
 * the client brief defines the room's intended use; the render sits beneath both as
 * soft experiential context. Those rules are stated in the block the writer receives,
 * in the words it is meant to follow.
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

/** What these images ARE. Every use of them states this, so their status cannot drift. */
export const CONCEPT_RENDER_PURPOSE = 'concept_render';

/** The authority a concept visual carries of its own: none. */
export const NON_AUTHORITATIVE_AUTHORITY = 'non_authoritative';

/** What they are for. */
export const CLIENT_EXPERIENCE_CONTEXT_USE = 'client_experience_context';

/**
 * The small label a client-facing render carries, so its status is clear on the page
 * without the narrative carrying a disclaimer. Held here, beside the rules the writer
 * follows, so the words printed with the picture and the words the writer reads can
 * never drift apart.
 */
export const CONCEPT_RENDER_LABEL = 'Concept visual — shown to illustrate the room experience.';

/** The same statement for a render offered as an interior or seating alternative. */
export const CONCEPT_RENDER_FINISHES_LABEL = 'Concept visual — interior finishes shown for illustration.';

/**
 * The rule the writer must follow when it is shown the room's concept visuals: soft
 * context only, and not any of the things a picture is easily mistaken for.
 */
export const VISUAL_CONTEXT_RULE = 'The attached images are CONCEPT VISUALS of this room, given to you as soft '
  + 'experiential context: they are there so the client can picture the finished cinema as a complete space. '
  + 'They are not approved interior design, not a construction or an interiors specification, not a furniture, '
  + 'lighting or finishes schedule, and not engineering authority.';

/** Canonical data always wins, and the brief says why the room exists. */
export const VISUAL_AUTHORITY_RULE = 'CANONICAL PROJECT AND ENGINEERING DATA ALWAYS WINS. This project\'s own room '
  + 'geometry, seating, display, loudspeaker and subwoofer assignments, RP22 results, bass results and recorded '
  + 'brief are the authority for every fact in this copy. The brief defines the room\'s intended use. The renders '
  + 'sit beneath both as soft experiential context, and nothing visible in a picture may ever override or '
  + 'establish a technical fact this project already holds.';

/**
 * What the writer must never do with them. The first sentence is the deliberate
 * prohibition on a second visual authority: the facts it names are the ones Sound
 * Proof already holds, and none of them is ever derived from a picture.
 */
export const VISUAL_NEVER_RULE = 'Never read a technical fact out of a picture: not the room type, not the '
  + 'display, not a seating count or arrangement, not a loudspeaker count or position, not a dimension, and not '
  + 'an architectural constraint. Sound Proof already holds those, and no second visual authority is created for '
  + 'them. Never describe colours, fabrics, timber, stone, wall finishes, furniture, lighting, a luxury aesthetic '
  + 'or a contemporary or traditional style, and never present an interior shown in a render as approved, final, '
  + 'specified or built. No figure, distance, product or performance result comes from an image either.';

/** What the writer is asked to do with them, given they are experience context. */
export const VISUAL_WRITING_RULE = 'The renders may gently help you remember that the client is buying a ROOM and '
  + 'an EXPERIENCE, not only technical performance. Where this project\'s own brief supports it, acknowledge at '
  + 'most one of these, subtly: time spent with family and friends; films, sport, games or music as a shared '
  + 'experience; the room as a comfortable place to spend time; the scale and physical presence of the finished '
  + 'cinema; the design as a complete environment. Keep it to at most one restrained idea, only where it '
  + 'genuinely improves the sentence, and keep the copy an experienced cinema designer explaining the design. '
  + 'Do not describe a picture, do not list what is visible, and never let this idea carry a claim the '
  + 'engineering does not support.';

/** Where the visuals' status reaches the client, and where it never does. */
export const VISUAL_DISCLAIMER_RULE = 'The status of these visuals is carried by the label printed with the '
  + 'images in the document, not by your copy: "' + CONCEPT_RENDER_LABEL + '". Never write a disclaimer about '
  + 'them into the narrative and never repeat their status in prose.';

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
 * @param {boolean} [input.briefSupplied] — whether this project records its own
 *   brief. It gates ONE thing and nothing else: whether the writer may acknowledge
 *   the room's intended use and the shared experience it is for. It changes no fact,
 *   no image and no fingerprint.
 * @returns {Object} { version, available, reason, images, fingerprint, selection_rule }
 */
export function buildReportVisualContext({
  assets = [],
  versionId = null,
  limit = MAX_VISUAL_IMAGES,
  briefSupplied = false,
} = {}) {
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
    // The project's own brief, which decides whether an intended use is stated at
    // all. Deliberately outside the fingerprint: the images a narrative was written
    // from are what it is pinned to, and a brief edited later does not rewrite them.
    brief_supplied: briefSupplied === true,
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
 * The compact identity of a selection, for the record saved beside a narrative:
 * WHICH pictures the words were written from, each with the revision of its own
 * file and the designer's own metadata describing it. No address appears here, so
 * a saved record can never depend on a link and never carries where a file is
 * kept. Null when the selection states nothing usable.
 */
export function visualContextIdentity(context) {
  if (context?.available !== true) return null;
  const images = asItems(context.images);
  if (images.length === 0) return null;

  return {
    version: context.version ?? REPORT_VISUAL_CONTEXT_VERSION,
    fingerprint: context.fingerprint ?? null,
    image_count: images.length,
    images: images.map((image) => ({
      id: image?.id ?? null,
      file: image?.identity?.file ?? null,
      role: image?.role ?? 'other',
      purpose: image?.identity?.purpose ?? null,
      caption: image?.caption ?? null,
      slot: image?.slot ?? null,
    })),
  };
}

/**
 * The notes the writer reads beside the two flags: what these images are, what they
 * are not, and — from the project's own brief — whether an intended use may be
 * acknowledged at all. Every line is a statement about the RENDER, never a
 * description of one, so nothing here is derived from a picture.
 */
function visualNotes({ wholeRoom, socialAllowed }) {
  return [
    'These are concept visuals of the finished room, to help the client picture spending time in it.',
    'They are not approved interior design, not a construction or an interiors specification, and not evidence.',
    wholeRoom
      ? 'Views of the room as a whole are attached.'
      : 'What is attached shows details of the room rather than views of it as a whole.',
    socialAllowed
      ? 'This project records its own brief, so the room\'s intended use and the shared experience it is for may be acknowledged where the brief supports it.'
      : 'This project records no client brief, so write about the room and the design only: no intended use is stated and none is ever invented.',
  ];
}

/**
 * The visual block the writer reads, or null when there is nothing to show.
 *
 * It states WHAT the images are for, never what they contain: purpose, authority and
 * intended use are named for what they are, the whole-room and social-experience
 * flags are read from the designer's own recorded metadata and from the project's own
 * brief, and nothing here describes a colour, a finish, a material or a technical
 * fact. It carries no address either, because the images themselves are attached to
 * the request.
 */
export function writerVisualBlock(context) {
  if (context?.available !== true) return null;
  const images = asItems(context.images);
  if (images.length === 0) return null;

  const wholeRoom = images.some((image) => (image.role ?? 'other') === 'whole_room');
  const socialAllowed = context.brief_supplied === true;

  return {
    purpose: CONCEPT_RENDER_PURPOSE,
    authority: NON_AUTHORITATIVE_AUTHORITY,
    intended_use: CLIENT_EXPERIENCE_CONTEXT_USE,
    // Read from the designer's own recorded role for each picture, never from the
    // pixels: it says what kind of view is available, not what the room contains.
    whole_room_context_available: wholeRoom,
    // Allowed only where this project records its own brief, because a shared
    // experience is the brief's to state and never the writer's to assume.
    social_experience_allowed: socialAllowed,
    client_label: CONCEPT_RENDER_LABEL,
    notes: visualNotes({ wholeRoom, socialAllowed }),
    rule: VISUAL_CONTEXT_RULE,
    authority_rule: VISUAL_AUTHORITY_RULE,
    never: VISUAL_NEVER_RULE,
    writing: VISUAL_WRITING_RULE,
    disclaimer_rule: VISUAL_DISCLAIMER_RULE,
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