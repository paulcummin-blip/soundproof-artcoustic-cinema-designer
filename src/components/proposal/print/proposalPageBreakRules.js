/**
 * proposalPageBreakRules.js
 * -------------------------
 * The ONE authority for how the printed proposal pack breaks across pages.
 *
 * The pack is flow paginated — unlike the fixed-height report pages, a section
 * is as tall as its copy — so every page break is a rule about what may not be
 * separated. Four guarantees, in the order they matter to a reader:
 *
 *   1. a heading always keeps the first block that belongs to it, so no page
 *      ends on a title with nothing under it;
 *   2. a designed block, a table, a card or a fact group is never split down the
 *      middle, so a page is never left carrying a heading and little else;
 *   3. a table header never prints without the rows it belongs to;
 *   4. prose never strands a single line at the foot or the head of a page.
 *
 * The rules live here rather than inline in the stylesheet so the printed
 * document and the pack's own tests read the same list: a heading the pack
 * renders with no keep-with-next rule is a test failure, not a surprise in a
 * client's PDF.
 *
 * Pure: no React, no runtime APIs.
 */

/** Every heading the pack renders, each with the block it must keep. */
export const PACK_HEADING_SELECTORS = Object.freeze([
  '.pp-header',
  '.pp-header__title',
  '.pp-header__lead',
  '.pp-block__title',
  '.pp-facts-group__title',
  '.pp-decision__title',
  '.pp-body > h1',
  '.pp-body > h2',
  '.pp-body > h3',
]);

/** A block that states one thing and is never split across two pages. */
export const PACK_KEEP_TOGETHER_SELECTORS = Object.freeze([
  '.pp-block',
  '.pp-table',
  '.pp-editorial',
  '.pp-card',
  '.pp-metric',
  '.pp-note',
  '.pp-structure',
  '.pp-decision',
]);

/** A group of cards or structures stays with its own heading. */
export const PACK_KEEP_WITH_HEADING_SELECTORS = Object.freeze([
  '.pp-facts-group',
  '.pp-cards',
  '.pp-metrics',
  '.pp-structures',
  '.pp-decision__choice',
  '.pp-comparison-options',
]);

/**
 * The one-page sections of the pack: the At a Glance page, the Key Performance
 * Highlights block and an imagery page are each read as one thing, and the
 * compact package table keeps the At a Glance page inside its own sheet.
 */
export const PACK_ONE_PAGE_SELECTORS = Object.freeze([
  '.pp-page--glance',
  '.pp-page--glance .pp-facts-group',
  '.pp-page--glance .pp-table',
  '.pp-table--compact',
  '.pp-page--highlights',
  '.pp-page--highlights .pp-body',
  '.proposal-print-section--highlights',
  '.kph-table',
  '.pp-page--images',
  '.pp-gallery',
  '.pp-gallery__figure',
  '.pp-gallery__support',
]);

/** A table never starts a page away from the header it belongs to. */
export const PACK_TABLE_FOLLOWS_HEADING_SELECTORS = Object.freeze([
  '.proposal-print-section--highlights .pp-header__rule',
  '.proposal-print-section--highlights .kph-table',
  '.pp-body + .pp-table',
]);

/** Every rule, in print output order. */
export const PACK_PAGE_BREAK_RULES = Object.freeze([
  {
    id: 'page-starts-on-its-own-sheet',
    note: 'Each designed page begins on a new sheet.',
    selectors: Object.freeze(['.pp-page']),
    declarations: Object.freeze({ breakBefore: 'page' }),
  },
  {
    id: 'first-content-page-follows-the-cover',
    note: 'The first content page follows the cover, which breaks the page itself.',
    selectors: Object.freeze(['.proposal-print-cover + .pp-page']),
    declarations: Object.freeze({ breakBefore: 'auto' }),
  },
  {
    id: 'heading-keeps-its-first-block',
    note: 'No orphaned headings: a title always keeps the block that follows it.',
    selectors: PACK_HEADING_SELECTORS,
    declarations: Object.freeze({ breakAfter: 'avoid' }),
  },
  {
    id: 'prose-never-strands-a-line',
    note: 'A paragraph keeps at least three lines on either side of a break.',
    selectors: Object.freeze(['.pp-body', '.pp-body p']),
    declarations: Object.freeze({ orphans: 3, widows: 3 }),
  },
  {
    id: 'group-stays-with-its-heading',
    note: 'A fact group, card grid or structure row is never split from its heading.',
    selectors: PACK_KEEP_WITH_HEADING_SELECTORS,
    declarations: Object.freeze({ breakInside: 'avoid' }),
  },
  {
    id: 'block-is-never-split',
    note: 'A designed block is never split down the middle of a page.',
    selectors: PACK_KEEP_TOGETHER_SELECTORS,
    declarations: Object.freeze({ breakInside: 'avoid' }),
  },
  {
    id: 'table-header-keeps-its-rows',
    note: 'A table header never prints without the rows it belongs to.',
    selectors: Object.freeze(['.pp-table thead', '.kph-table thead']),
    declarations: Object.freeze({ breakAfter: 'avoid', headerGroup: true }),
  },
  {
    id: 'table-row-is-never-split',
    note: 'A row is one statement and is never cut in half.',
    selectors: Object.freeze(['.pp-table tr', '.kph-table tr']),
    declarations: Object.freeze({ breakInside: 'avoid' }),
  },
  {
    id: 'table-follows-its-heading',
    note: 'A table may not begin a page while its own heading sits on the previous one.',
    selectors: PACK_TABLE_FOLLOWS_HEADING_SELECTORS,
    declarations: Object.freeze({ breakBefore: 'avoid', breakInside: 'avoid' }),
  },
  {
    id: 'one-page-sections-are-read-as-one-thing',
    note: 'At a Glance, Key Performance Highlights and an imagery page are each kept whole.',
    selectors: PACK_ONE_PAGE_SELECTORS,
    declarations: Object.freeze({ breakInside: 'avoid' }),
  },
  {
    id: 'compact-table-keeps-the-glance-page-whole',
    note: 'The At a Glance package table is set compactly, so its page is never pushed over.',
    selectors: Object.freeze(['.pp-page--glance .pp-table--compact']),
    declarations: Object.freeze({ breakInside: 'avoid' }),
  },
]);

/** The modern and legacy property a break declaration prints as. */
function breakDeclaration(kind, value) {
  const modern = { before: 'break-before', after: 'break-after', inside: 'break-inside' }[kind];
  const legacy = { before: 'page-break-before', after: 'page-break-after', inside: 'page-break-inside' }[kind];
  const legacyValue = value === 'page' ? (kind === 'inside' ? 'avoid' : 'always') : value;
  return [`${modern}: ${value};`, `${legacy}: ${legacyValue};`];
}

/** Every declaration of one rule, in the shape both print engines read. */
function declarationsOf(rule) {
  const lines = [];
  const { declarations } = rule;
  if (declarations.breakBefore) lines.push(...breakDeclaration('before', declarations.breakBefore));
  if (declarations.breakAfter) lines.push(...breakDeclaration('after', declarations.breakAfter));
  if (declarations.breakInside) lines.push(...breakDeclaration('inside', declarations.breakInside));
  if (declarations.headerGroup) lines.push('display: table-header-group;');
  if (declarations.orphans) lines.push(`orphans: ${declarations.orphans};`);
  if (declarations.widows) lines.push(`widows: ${declarations.widows};`);
  return lines;
}

/**
 * The pack's page-break rules as print CSS.
 *
 * @param {string} [prefix] — the selector prefix the print document is scoped by
 * @returns {string}
 */
export function proposalPackPageBreakCss(prefix = 'body.proposal-export-mode .proposal-print-portal ') {
  const blocks = PACK_PAGE_BREAK_RULES.map((rule) => {
    const selectors = rule.selectors.map((selector) => `${prefix}${selector}`).join(',\n        ');
    const declarations = declarationsOf(rule).map((line) => `          ${line}`).join('\n');
    return `        /* ${rule.note} */\n        ${selectors} {\n${declarations}\n        }`;
  });
  return blocks.join('\n\n');
}

export default proposalPackPageBreakCss;