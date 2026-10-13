/**
 * paginationFailureDiagnostics.js
 * -------------------------------
 * WHY one block stopped an export, recorded at the moment the export refuses it.
 *
 * The measured compositor already refuses to remove content: when a block cannot
 * be fragmented it stops the export. What it did not say was WHICH block — which
 * section, which editorial composition, which element, how tall it measured and
 * how much printable height it exceeded. This module answers exactly that, from
 * the live DOM, and carries it on the thrown error so a master admin can read the
 * record without opening the console.
 *
 * What it deliberately does NOT carry: any narrative. No body copy, no captions,
 * no client or project name, no file URL, no record id. Section identity, element
 * identity, content KIND flags and measured millimetres only — the same
 * discipline as the export trace it accompanies.
 *
 * Pure: DOM reads only. It never writes to, moves, re-measures-and-changes or
 * re-decides anything, and it changes no allocation.
 */

/** The longest identity label kept: a section or element name, never copy. */
const MAX_LABEL = 80;
/** How far up the container chain an element is named. */
const MAX_PATH = 6;

/** Why the paragraph fallback refused to divide the block. */
export const FRAGMENT_REFUSAL = Object.freeze({
  INDIVISIBLE_CONTENT: 'contains-indivisible-content',
  NO_FRAGMENTABLE_PARAGRAPH: 'no-fragmentable-paragraph',
  EMPTY_OVERSIZED_BLOCK: 'empty-oversized-block',
  NO_FITTING_FRAGMENT: 'no-fragment-fits-the-printable-area',
});

/**
 * The sentence each refusal is stopped with. These are the export's existing
 * safe failures, unchanged: the diagnostics are carried ALONGSIDE them.
 */
export const REFUSAL_MESSAGE = Object.freeze({
  [FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT]:
    'An indivisible proposal block exceeds printable A4 height. Export stopped without removing content.',
  [FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH]:
    'An indivisible proposal block exceeds printable A4 height. Export stopped without removing content.',
  [FRAGMENT_REFUSAL.EMPTY_OVERSIZED_BLOCK]:
    'An empty oversized proposal block cannot be paginated.',
  [FRAGMENT_REFUSAL.NO_FITTING_FRAGMENT]:
    'The proposal heading and its opening content cannot fit the printable A4 area without changing the design.',
});

const INDIVISIBLE_KINDS = Object.freeze([
  ['image', 'img'],
  ['video', 'video'],
  ['svg', 'svg'],
  ['table', 'table'],
]);

function element(node) {
  return node && node.nodeType === 1 ? node : null;
}

function clip(value, limit = MAX_LABEL) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** `figure.pp-media.pp-media--comparison` — the element as the document names it. */
export function elementLabel(node) {
  const el = element(node);
  if (!el) return '(text node)';
  const tag = String(el.tagName || '').toLowerCase() || 'element';
  const classes = [...(el.classList || [])].slice(0, 4).join('.');
  return classes ? `${tag}.${classes}` : tag;
}

/**
 * The stable identity the compositor stamped on the element (`frame:index`), or
 * its id when it has one. This is what identifies the SAME element after it has
 * been cloned into a temporary page container.
 */
export function elementIdentifier(node) {
  const el = element(node);
  if (!el) return null;
  return el.dataset?.paginationOrigin || el.id || null;
}

/** What the element contains — counts and kinds only, never the copy itself. */
export function unitContentFlags(node) {
  const el = element(node);
  const within = (selector) => (el && typeof el.querySelectorAll === 'function'
    ? el.querySelectorAll(selector).length
    : 0);
  const itself = (selector) => (el && typeof el.matches === 'function' && el.matches(selector) ? 1 : 0);
  const characters = el ? String(el.textContent || '').replace(/\s+/g, ' ').trim().length : 0;
  return {
    image: itself('img') + within('img'),
    video: itself('video') + within('video'),
    svg: itself('svg') + within('svg'),
    table: itself('table') + within('table'),
    paragraphs: within('p'),
    listItems: within('li'),
    captions: within('figcaption'),
    characters,
    text: characters > 0,
  };
}

/**
 * Where a block came from, read from the LIVE document: the section, the editorial
 * composition, the block and the page frame it belongs to. Read from the element
 * itself rather than from the unit's copy, so the identity survives every
 * temporary container the block is measured in.
 */
export function unitIdentityOf(source) {
  const empty = { sectionType: null, sectionName: null, composition: null, block: null, page: null, frame: null };
  const el = element(source);
  if (!el || typeof el.closest !== 'function') return empty;
  const section = el.closest('[data-editorial-section]');
  const composition = el.closest('[data-editorial-composition]');
  const block = el.closest('[data-editorial-block]');
  const page = el.closest('.pp-page,.proposal-print-cover');
  return {
    sectionType: section?.dataset?.editorialSection || null,
    // The printed section heading — a section name, never body copy.
    sectionName: clip(section?.querySelector?.('.pp-header__title')?.textContent) || null,
    composition: composition?.dataset?.editorialComposition || null,
    block: block?.dataset?.editorialBlock || null,
    page: page?.className || null,
    frame: page?.dataset?.paginationFrame ?? null,
  };
}

/** The chain from the page frame down to the element, so its place is unambiguous. */
function containerPath(source, page) {
  const chain = [];
  let node = element(source);
  while (node && node !== page && chain.length < MAX_PATH) {
    chain.unshift(elementLabel(node));
    node = node.parentElement;
  }
  if (page && chain.length < MAX_PATH + 1) chain.unshift(elementLabel(page));
  return chain.join(' > ') || elementLabel(source);
}

/** Plain-English reason, from the refusal code and what the block actually holds. */
function refusalReason(refusal, content, target) {
  const kinds = INDIVISIBLE_KINDS
    .filter(([key]) => content[key] > 0)
    .map(([key]) => key)
    .join(', ');
  if (refusal === FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT) {
    return `The paragraph the fallback reached (${clip(target?.className || target?.tagName || 'target', 40)}) contains an indivisible ${kinds || 'element'}, and a photograph, table or drawing may never be cut in half.`;
  }
  if (refusal === FRAGMENT_REFUSAL.NO_FRAGMENTABLE_PARAGRAPH) {
    return `No paragraph, list item or caption exists inside this block to fragment at${kinds ? ` — it holds ${kinds}` : ''}.`;
  }
  if (refusal === FRAGMENT_REFUSAL.EMPTY_OVERSIZED_BLOCK) {
    return 'The block is oversized but carries no text, so there is no fragment boundary to divide it at.';
  }
  return 'Not even a single line of the opening copy fits the printable area that remains beside the heading and the content kept with it.';
}

/** How a block's contents are stated in the record: kinds and counts only. */
function contentSummary(content) {
  const kinds = INDIVISIBLE_KINDS
    .filter(([key]) => content[key] > 0)
    .map(([key]) => `${key} ×${content[key]}`);
  const copy = `${content.characters} character${content.characters === 1 ? '' : 's'}`
    + ` in ${content.paragraphs} paragraph${content.paragraphs === 1 ? '' : 's'}`
    + (content.listItems ? `, ${content.listItems} list item${content.listItems === 1 ? '' : 's'}` : '')
    + (content.captions ? `, ${content.captions} caption${content.captions === 1 ? '' : 's'}` : '');
  return [...kinds, copy].join(', ');
}

/**
 * The record of ONE pagination stop.
 *
 * @param {Object} options
 * @param {Object} options.unit — the block the compositor refused to fragment
 * @param {Array} [options.prefix] — the blocks already measured on this sheet
 * @param {Function} options.measureUnits — the compositor's OWN measurement
 * @param {Object|null} [options.allocation] — frame index, block index, block count
 * @param {string} options.refusal — one of FRAGMENT_REFUSAL
 * @param {Element|null} [options.target] — the paragraph the fallback reached
 * @returns {Object} a JSON-serializable record: identity, kind flags, millimetres
 */
export function describePaginationFailure({
  unit,
  prefix = [],
  measureUnits,
  allocation = null,
  refusal,
  target = null,
}) {
  const source = unit?.source || null;
  const identity = unit?.identity || unitIdentityOf(source);
  const page = element(source)?.closest?.('.pp-page,.proposal-print-cover') || null;
  const content = unitContentFlags(source);
  const sheet = typeof measureUnits === 'function' ? measureUnits([...(prefix || []), unit]) : null;
  const alone = typeof measureUnits === 'function' ? measureUnits([unit]) : null;
  const round = (value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : null);
  const deliveredBy = unit?.via || 'unknown';
  const overflowMm = sheet && typeof sheet.usedMm === 'number' && typeof sheet.availableMm === 'number'
    ? round(sheet.usedMm - sheet.availableMm)
    : null;

  return {
    scope: 'proposal-pagination',
    stage: 'block-fragmentation-fallback',
    section: identity.sectionType ? { type: identity.sectionType, name: identity.sectionName } : null,
    composition: identity.composition,
    block: identity.block,
    page: identity.page,
    element: {
      label: elementLabel(source),
      identifier: elementIdentifier(source),
      containerPath: containerPath(source, page),
    },
    fragmentTarget: target ? elementLabel(target) : null,
    measurements: {
      elementMm: round(alone?.usedMm),
      sheetUsedMm: round(sheet?.usedMm),
      printableMm: round(sheet?.availableMm),
      overflowMm,
      precedingBlocks: (prefix || []).length,
    },
    allocation: {
      frame: allocation?.frame ?? identity.frame ?? null,
      unitIndex: allocation?.index ?? null,
      unitCount: allocation?.total ?? null,
    },
    content,
    deliveredBy,
    // Which stages of the fallback delivered this block: the section, the
    // editorial composition, the block and the stage that produced it.
    fallbackPath: [
      identity.sectionType ? `section:${identity.sectionType}` : null,
      identity.composition ? `composition:${identity.composition}` : null,
      identity.block ? `block:${identity.block}` : null,
      `delivered-by:${deliveredBy}`,
    ].filter(Boolean),
    refusal,
    refusedBecause: refusalReason(refusal, content, target),
  };
}

/**
 * The export's existing failure, carrying its diagnostics. The message is
 * unchanged: this only adds the record of what stopped it.
 */
export function paginationFailureError(options) {
  const error = new Error(
    REFUSAL_MESSAGE[options?.refusal] || REFUSAL_MESSAGE[FRAGMENT_REFUSAL.INDIVISIBLE_CONTENT]
  );
  error.paginationDiagnostics = describePaginationFailure(options);
  return error;
}

/** The record as plain text, for COPY DIAGNOSTICS. */
export function formatPaginationFailureDiagnostics(diagnostics) {
  if (!diagnostics) return '';
  const d = diagnostics;
  const mm = (value) => (typeof value === 'number' ? `${value.toFixed(1)} mm` : 'not measured');
  const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value);
  return [
    'PROPOSAL EXPORT — PAGINATION STOPPED',
    `Stage: ${dash(d.stage)}`,
    `Section: ${d.section ? `${dash(d.section.name)} [${d.section.type}]` : 'not an editorial section'}`,
    `Editorial composition: ${dash(d.composition)}`,
    `Block: ${dash(d.block)}`,
    `Page frame: ${dash(d.allocation?.frame)}  (${dash(d.page)})`,
    `Allocation position: ${dash(d.allocation?.unitIndex)} of ${dash(d.allocation?.unitCount)}`,
    `Delivered by: ${dash(d.deliveredBy)}`,
    `Fallback path: ${(d.fallbackPath || []).join(' → ') || '—'}`,
    `Element: ${dash(d.element?.label)}  [origin ${dash(d.element?.identifier)}]`,
    `Container path: ${dash(d.element?.containerPath)}`,
    `Fragment target: ${dash(d.fragmentTarget)}`,
    `Element height: ${mm(d.measurements?.elementMm)}`,
    `Sheet measurement: ${mm(d.measurements?.sheetUsedMm)} used of ${mm(d.measurements?.printableMm)} printable`
      + ` (over ${mm(d.measurements?.overflowMm)})`,
    `Blocks measured on the sheet before it: ${dash(d.measurements?.precedingBlocks)}`,
    `Content: ${contentSummary(d.content || unitContentFlags(null))}`,
    `Refusal: ${dash(d.refusal)}`,
    `Refused because: ${dash(d.refusedBecause)}`,
  ].join('\n');
}

export default describePaginationFailure;