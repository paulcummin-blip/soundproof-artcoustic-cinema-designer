/**
 * writerOptionGuidance.js (shared)
 * --------------------------------
 * THE designer's own option guidance, as the approved writer receives it.
 *
 * A designer explains seating and layout options on the project's images: what
 * each arrangement is, and what the choice rests on. Those notes are a BRIEF,
 * never copy — they are written for the designer, in the designer's own words,
 * and they are not what a client reads. The writer turns them into its own
 * client-facing prose, and the approved validator checks that prose.
 *
 * This module turns the project's comparison images into the one normalised
 * shape the writer input carries: one entry per comparison set, each with the
 * option labels the designer stated and the guidance note itself. The note
 * travels as an instruction. Nothing here writes prose and nothing here
 * calculates.
 *
 * The frontend groups the same images for its comparison pages in
 * src/components/proposal/images/proposalImagePlacementAuthority.js. The two
 * cannot import from each other, so both apply the same rule: the group name
 * leads, the option label identifies the option, and the first note in display
 * order is the set's guidance.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The set name an image is read under when the designer named none. */
export const DEFAULT_OPTION_GROUP = 'Comparison options';

const recorded = (value) => String(value ?? '').trim();

/** An image the designer marked as one option in a deliberate comparison. */
export function isOptionImage(asset) {
  if (!asset) return false;
  if (asset.comparison_enabled === true) return true;
  if (asset.comparison_enabled === false) return false;
  return recorded(asset.comparison_group).length > 0
    || recorded(asset.comparison_option_label).length > 0;
}

/** An image the proposal may print: a hidden image carries no guidance. */
function isUsable(asset) {
  if (!asset || !asset.file_url) return false;
  if (asset.usage === 'do_not_use') return false;
  if (recorded(asset.proposal_importance).toLowerCase() === 'do not use') return false;
  return true;
}

const groupNameOf = (asset) => ['lounge', 'recliner'].includes(asset?.seating_style) && !isOptionImage(asset)
  ? 'Seating style' : (recorded(asset?.comparison_group) || DEFAULT_OPTION_GROUP);

function orderOf(asset) {
  const value = Number(asset?.comparison_order);
  return Number.isFinite(value) ? value : null;
}

/** The images of one set in display order: a stated order leads, else gallery order. */
function orderedImages(images, name) {
  return images
    .map((asset, index) => ({ asset, index, order: orderOf(asset) }))
    .filter((entry) => groupNameOf(entry.asset) === name)
    .sort((a, b) => {
      if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
      if (a.order !== null && b.order === null) return -1;
      if (a.order === null && b.order !== null) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.asset);
}

/**
 * The option guidance a project's images state, or null when they state none.
 *
 * @param {Array} assets — the project's images
 * @returns {{groups: Array<{group: string, options: Array<string>, note: string|null}>}|null}
 */
export function buildOptionGuidance(assets = []) {
  const images = (Array.isArray(assets) ? assets : []).filter((asset) => isUsable(asset) && (isOptionImage(asset) || ['lounge', 'recliner'].includes(asset.seating_style)));
  if (images.length === 0) return null;

  const names = [];
  images.forEach((asset) => {
    const name = groupNameOf(asset);
    if (!names.includes(name)) names.push(name);
  });

  const groups = names.map((name) => {
    const ordered = orderedImages(images, name);
    const options = ordered
      .map((asset) => recorded(asset.comparison_option_label) || recorded(asset.caption) || (asset.seating_style === 'lounge' ? 'Lounge seating' : asset.seating_style === 'recliner' ? 'Cinema recliners' : null))
      .filter(Boolean);
    const note = ordered.map((asset) => recorded(asset.comparison_note)).find(Boolean) || null;
    return { group: name, options, note, image_count: ordered.length };
  }).filter((group) => group.image_count >= 2 && group.options.length >= 2)
    .map(({ image_count, ...group }) => group);

  return groups.length > 0 ? { groups } : null;
}

/**
 * The guidance as the writer input carries it: the same shape, with every value
 * a trimmed string and every empty group dropped, so an input is deterministic
 * for a given project.
 */
export function normaliseOptionGuidance(guidance) {
  const groups = (Array.isArray(guidance?.groups) ? guidance.groups : [])
    .map((group) => ({
      group: recorded(group?.group),
      options: (Array.isArray(group?.options) ? group.options : []).map(recorded).filter(Boolean),
      note: recorded(group?.note) || null,
    }))
    .filter((group) => group.group && (group.note || group.options.length > 0));
  return { groups };
}

/** Whether the guidance asks the writer for any copy at all. */
export function guidanceAsksForCopy(guidance) {
  return normaliseOptionGuidance(guidance).groups.length > 0;
}