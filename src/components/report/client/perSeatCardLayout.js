/**
 * perSeatCardLayout.js
 * --------------------
 * The ONE sizing authority for the Visual Report's Per-Seat Performance cards.
 *
 * The cards must keep the seating plan's own shape — one line per physical row,
 * the widest row setting the card width — while scaling down as a system grows.
 * The card width is therefore a PERCENTAGE of the row it sits in rather than a
 * fixed pixel value: every card in the section shares one width, and that width
 * follows whatever the report page is (the preview at any viewport, and the A4
 * print page) without a measurement pass at export time.
 *
 *   card width = (100% - gap × (widest row - 1)) / widest row
 *
 * The type scale, padding and whether the metric values are shown come from a
 * TIER. The tier starts at what the widest row can carry and is then reduced
 * until the whole section fits one printed A4 page, so a layout is never
 * squeezed into a tier too small for it and never clipped.
 *
 * Print geometry: the report page is 186mm wide (A4 less the 12mm @page margins)
 * and 271mm tall, with no inner padding. CSS millimetres are absolute, so the
 * printed card width is derived from that geometry — 186mm is 703px inside the
 * browser, whatever the screen. The print page is the tightest medium, so it is
 * the authority for the tier: the preview can only ever be roomier.
 *
 * A system with more seating rows than one printed page can hold is split
 * BETWEEN physical rows (see planSeatRowPages) — never into a linear seat list,
 * and never by clipping the page.
 *
 * PRESENTATION ONLY: nothing here reads, grades or recomputes a level, a value
 * or a seat result. It only decides how large a card is.
 */

/** CSS millimetres are absolute: 1in = 25.4mm = 96px. */
export const MM_TO_PX = 96 / 25.4;

/** The report page: A4 portrait less the 12mm @page margins. */
export const PRINT_PAGE_WIDTH_MM = 186;
export const PRINT_PAGE_HEIGHT_MM = 271;

/** Breathing room kept at each printed page edge. */
export const PRINT_EDGE_INSET_MM = 2;

/** Usable printed width for the section. */
export const PRINT_SECTION_WIDTH_PX = (PRINT_PAGE_WIDTH_MM - 2 * PRINT_EDGE_INSET_MM) * MM_TO_PX;

/** A printed page reserves this much for the document heading, key and note. */
export const PRINT_PAGE_RESERVED_MM = 30;

/** How much vertical room the seating rows may use on one printed page. */
export const PRINT_ROW_BUDGET_PX = (PRINT_PAGE_HEIGHT_MM - PRINT_PAGE_RESERVED_MM) * MM_TO_PX;

/** Cards never grow past this, so a two-seat row does not become a billboard. */
export const MAX_CARD_WIDTH_PX = 240;

/** RP23 plus P1, P4, P5, P6, P9, P10, P16, P17 and P20 — the card's own rows. */
const PARAMETER_ROW_COUNT = 10;

const BADGE_BORDER_PX = 2;
const ROW_LABEL_LINE_HEIGHT = 1.4;

/**
 * The tiers, richest first. Each tier is a complete, self-consistent set of
 * card metrics — type, padding and row rhythm always move together, so a card
 * can never end up with comfortable type in compact padding.
 *
 * showValues is the one deliberate reduction: at the densest tier the level
 * pills stay (they ARE the result) while the numeric value beside them is
 * dropped, because a truncated number is worse than no number.
 */
export const CARD_TIERS = {
  comfortable: {
    name: "comfortable",
    gap: 12,
    showValues: true,
    showSpl: true,
    rowBlockGap: 16,
    rowLabelSize: 11,
    card: {
      paddingX: 11,
      paddingTop: 10,
      paddingBottom: 11,
      gap: 5,
      headerGap: 4,
      labelSize: 12,
      badgeSize: 9,
      badgePaddingY: 2,
      badgePaddingX: 5,
      parameterLabelSize: 11.5,
      parameterLabelWidth: 34,
      rowMinHeight: 21,
      rowGap: 3,
      valueSize: 10.5,
      splSize: 10,
      splPaddingTop: 5,
    },
  },
  standard: {
    name: "standard",
    gap: 10,
    showValues: true,
    showSpl: true,
    rowBlockGap: 12,
    rowLabelSize: 10,
    card: {
      paddingX: 9,
      paddingTop: 8,
      paddingBottom: 9,
      gap: 4,
      headerGap: 3.5,
      labelSize: 10.5,
      badgeSize: 8.5,
      badgePaddingY: 2,
      badgePaddingX: 5,
      parameterLabelSize: 10.5,
      parameterLabelWidth: 30,
      rowMinHeight: 18,
      rowGap: 3,
      valueSize: 9.5,
      splSize: 9.5,
      splPaddingTop: 4,
    },
  },
  compact: {
    name: "compact",
    gap: 8,
    showValues: true,
    showSpl: true,
    rowBlockGap: 9,
    rowLabelSize: 9.5,
    card: {
      paddingX: 8,
      paddingTop: 7,
      paddingBottom: 7,
      gap: 3,
      headerGap: 3,
      labelSize: 9.5,
      badgeSize: 8,
      badgePaddingY: 2,
      badgePaddingX: 4,
      parameterLabelSize: 9.5,
      parameterLabelWidth: 26,
      rowMinHeight: 15,
      rowGap: 2,
      valueSize: 8.5,
      splSize: 8.5,
      splPaddingTop: 3,
    },
  },
  dense: {
    name: "dense",
    gap: 6,
    showValues: false,
    showSpl: true,
    rowBlockGap: 7,
    rowLabelSize: 9,
    card: {
      paddingX: 6,
      paddingTop: 6,
      paddingBottom: 6,
      gap: 3,
      headerGap: 2.5,
      labelSize: 9,
      badgeSize: 7.5,
      badgePaddingY: 2,
      badgePaddingX: 4,
      parameterLabelSize: 9,
      parameterLabelWidth: 22,
      rowMinHeight: 13,
      rowGap: 1,
      valueSize: 8,
      splSize: 8,
      splPaddingTop: 3,
    },
  },
};

export const TIER_ORDER = ["comfortable", "standard", "compact", "dense"];

function normaliseRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.seats?.length);
}

/** The richest tier the widest row can carry. */
export function tierForMaxSeats(maxSeatsInRow) {
  if (maxSeatsInRow <= 3) return "comfortable";
  if (maxSeatsInRow <= 5) return "standard";
  if (maxSeatsInRow <= 6) return "compact";
  return "dense";
}

/**
 * A card's own height at a tier, from that tier's own metrics — never a
 * hand-written guess, so the page budget below cannot drift from the card.
 */
export function estimateCardHeightPx(tierName, { hasSpl = true } = {}) {
  const tier = CARD_TIERS[tierName] || CARD_TIERS.standard;
  const card = tier.card;
  const header =
    card.labelSize * 1.25 +
    card.headerGap +
    (card.badgeSize * 1.4 + 2 * card.badgePaddingY + BADGE_BORDER_PX);
  const rows = PARAMETER_ROW_COUNT * card.rowMinHeight + (PARAMETER_ROW_COUNT - 1) * card.rowGap;
  const spl = hasSpl ? 1 + card.splPaddingTop + card.splSize * 1.4 : 0;
  return card.paddingTop + card.paddingBottom + header + card.gap + rows + spl;
}

/** One seating row's height at a tier: its row label, its cards and the gap below. */
export function estimateSeatRowHeightPx(tierName) {
  const tier = CARD_TIERS[tierName] || CARD_TIERS.standard;
  return estimateCardHeightPx(tierName) + tier.rowLabelSize * ROW_LABEL_LINE_HEIGHT + tier.rowBlockGap;
}

/** Does this many seating rows fit one printed page at this tier? */
export function fitsOnePrintedPage(tierName, rowCount) {
  return rowCount * estimateSeatRowHeightPx(tierName) <= PRINT_ROW_BUDGET_PX;
}

/** The whole section's height at a tier (for the page-fits assertions). */
export function estimateSectionHeightPx(layout) {
  if (!layout?.rowCount) return 0;
  return layout.rowCount * estimateSeatRowHeightPx(layout.tierName);
}

/**
 * Resolve the card layout for a set of seating rows.
 *
 * @param {Array} rows - [{ seats: [...] }] from selectClientPerSeatPerformance
 * @returns {{
 *   seatRows, rowCount, seatCount, maxSeatsInRow,
 *   tierName, tier, gap, cardWidth, maxCardWidth,
 *   fitsOnePage, splitsAcrossPages, availableWidthPx
 * }}
 */
export function resolveSeatRowLayout(rows) {
  const seatRows = normaliseRows(rows);
  const rowCount = seatRows.length;
  const seatCount = seatRows.reduce((total, row) => total + row.seats.length, 0);
  const maxSeatsInRow = Math.max(1, ...seatRows.map((row) => row.seats.length));

  const widthTier = tierForMaxSeats(maxSeatsInRow);
  const candidates = TIER_ORDER.slice(TIER_ORDER.indexOf(widthTier));
  const tierName = candidates.find((name) => fitsOnePrintedPage(name, rowCount)) || "dense";
  const tier = CARD_TIERS[tierName];

  return {
    seatRows,
    rowCount,
    seatCount,
    maxSeatsInRow,
    tierName,
    tier,
    gap: tier.gap,
    // Every card shares this width, so rows of different lengths still read as
    // one seating plan rather than as unrelated rows.
    cardWidth: `calc((100% - ${tier.gap * (maxSeatsInRow - 1)}px) / ${maxSeatsInRow})`,
    maxCardWidth: MAX_CARD_WIDTH_PX,
    fitsOnePage: fitsOnePrintedPage(tierName, rowCount),
    splitsAcrossPages: !fitsOnePrintedPage(tierName, rowCount),
    availableWidthPx: PRINT_SECTION_WIDTH_PX,
  };
}

/**
 * Split seating rows into printed pages.
 *
 * Rows are packed front-to-back until a page's budget is spent; a row is never
 * split and the seating order is never re-arranged. Normal systems return a
 * single page, so nothing changes for them.
 *
 * @returns {Array<Array>} one array of rows per printed page
 */
export function planSeatRowPages(rows, layout = resolveSeatRowLayout(rows)) {
  const { seatRows, tierName } = layout;
  if (seatRows.length === 0) return [];

  const rowHeight = estimateSeatRowHeightPx(tierName);
  const pages = [];
  let current = [];
  let used = 0;

  for (const row of seatRows) {
    if (current.length > 0 && used + rowHeight > PRINT_ROW_BUDGET_PX) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(row);
    used += rowHeight;
  }
  if (current.length > 0) pages.push(current);

  return pages;
}

export default resolveSeatRowLayout;