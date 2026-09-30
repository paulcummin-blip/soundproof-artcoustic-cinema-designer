/**
 * reportPricedQuantities
 * ----------------------
 * Resolves the product quantity a report is allowed to show: the same
 * canonical quantity the priced schedule uses. Reports never calculate or
 * infer their own quantities.
 *
 * Rules
 *   quantity > 0          → the priced quantity. Reports show this number.
 *   0 or unavailable      → no product quantity is shown; a clear warning is
 *                           returned instead of a contradictory value.
 *
 * The pricing summary is the same `window.__ROOM_DESIGNER_PRICE__` object the
 * app's price summary reads. When it is not present for this project (for
 * example a report opened in a fresh window), pricing is treated as unknown
 * rather than incomplete — the report does not invent a blocker.
 */

export const REPORT_QUANTITY_STATUS = {
  PRICED: "priced",
  SELECTED_UNPRICED: "selected-unpriced",
  UNAVAILABLE: "unavailable",
};

export function resolveReportQuantity({
  label = "product",
  selectedQuantity = 0,
  priceSummary = null,
  projectId = null,
} = {}) {
  const summaryMatchesProject = !!priceSummary
    && !!projectId
    && String(priceSummary.projectId || "") === String(projectId);

  const quantity = Math.max(0, Math.floor(Number(selectedQuantity) || 0));
  const priceListUnavailable = summaryMatchesProject && priceSummary.priceListAvailable === false;
  const incompletePriceCount = summaryMatchesProject
    ? Math.max(0, Number(priceSummary.incompletePriceCount) || 0)
    : 0;

  if (quantity <= 0) {
    return {
      status: REPORT_QUANTITY_STATUS.UNAVAILABLE,
      quantity: null,
      source: "none",
      warning: priceListUnavailable
        ? `No priced quantity is available for the ${label}: the price list is not available in this project's territory.`
        : `No ${label} quantity is included in the priced schedule, so the report shows no product quantity.`,
    };
  }

  if (priceListUnavailable || incompletePriceCount > 0) {
    return {
      status: REPORT_QUANTITY_STATUS.SELECTED_UNPRICED,
      quantity,
      source: "design-selection",
      warning: priceListUnavailable
        ? `This is the design selection — pricing is not available in this project's territory, so the quantity is not yet priced.`
        : `This is the design selection — ${incompletePriceCount} item${incompletePriceCount === 1 ? "" : "s"} in the priced schedule still have no price.`,
    };
  }

  return {
    status: REPORT_QUANTITY_STATUS.PRICED,
    quantity,
    source: "priced-schedule",
    warning: null,
  };
}