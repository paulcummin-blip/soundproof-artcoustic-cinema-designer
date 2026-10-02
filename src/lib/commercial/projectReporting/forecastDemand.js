/**
 * forecastDemand.js
 * -----------------
 * The Artcoustic forecast view of the catalogue demand pass.
 *
 * The demand pass aggregates every catalogue line of every counted version and
 * keeps, on each row, which project contributed which quantity and which retail
 * value. That per-project evidence is what lets this module answer two different
 * questions from ONE pass:
 *
 *   · the forecast view  — only the projects inside the forecast, only the
 *                          categories the admin has included
 *   · every project       — so the status and category controls can show what
 *                          each one is worth before it is included or excluded
 *
 * Nothing here recalculates demand: it narrows and re-reads the evidence the pass
 * already produced, so no total can disagree with Product Demand.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { classifyCatalogueLine } from './catalogueLineAuthority';
import { categoryKeyOf, sortCategoryRows, tradeValueOf } from './artcousticForecast';

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * The Product categories control: every Artcoustic catalogue category present in
 * the counted demand, with its value. All catalogue categories are included by
 * default; one the admin has unticked carries the stored choice.
 */
export function buildCategoryRows(categoryTotals = [], preferences = {}) {
  return sortCategoryRows((categoryTotals || []).map((entry) => {
    const key = categoryKeyOf(entry.key || entry.label);
    const override = preferences?.[key];
    return {
      key,
      label: entry.label || entry.key || 'Uncategorised',
      included: typeof override === 'boolean' ? override : true,
      overridden: typeof override === 'boolean',
      retail: entry.retail ?? null,
      trade: entry.retail === null || entry.retail === undefined ? null : tradeValueOf(entry.retail),
      units: number(entry.units),
      lineCount: number(entry.lineCount),
    };
  }));
}

/** The category keys the forecast counts. */
export function includedCategoryKeys(rows = []) {
  return new Set((rows || []).filter((row) => row.included).map((row) => row.key));
}

/** The category keys the forecast leaves out. */
export function excludedCategoryKeys(rows = []) {
  return new Set((rows || []).filter((row) => !row.included).map((row) => row.key));
}

const asSet = (value) => (
  value instanceof Set ? value : (value ? new Set(value) : null)
);

/**
 * Narrow the catalogue demand pass to a forecast.
 *
 * @param {Object} input
 * @param {Object} input.demand — buildCatalogueDemand output
 * @param {Set|Array|null} [input.projectIds] — projects inside the forecast; null = every project
 * @param {Set|Array} [input.excludedCategories] — category keys left out
 * @returns {Object} rows, per-project retail and units, and the headline totals
 */
export function buildForecastView({ demand = null, projectIds = null, excludedCategories = [] } = {}) {
  const excluded = excludedCategories instanceof Set ? excludedCategories : new Set(excludedCategories || []);
  const allowed = asSet(projectIds);

  const rows = [];
  const projectRetail = new Map();
  const projectUnits = new Map();

  for (const row of demand?.rows || []) {
    if (excluded.has(row.categoryKey)) continue;

    const qtyByProject = row.qtyByProjectId || {};
    const valueByProject = row.valueByProjectId || {};
    const contributing = [];
    let quantity = 0;
    let retail = 0;
    let valued = false;

    for (const [projectId, qty] of Object.entries(qtyByProject)) {
      if (allowed && !allowed.has(projectId)) continue;
      const units = number(qty);
      quantity += units;
      contributing.push(projectId);
      projectUnits.set(projectId, (projectUnits.get(projectId) || 0) + units);
    }

    for (const [projectId, value] of Object.entries(valueByProject)) {
      if (allowed && !allowed.has(projectId)) continue;
      retail += number(value);
      valued = true;
      projectRetail.set(projectId, (projectRetail.get(projectId) || 0) + number(value));
    }

    if (quantity === 0) continue;

    rows.push({
      ...row,
      quantity,
      projectIds: contributing,
      projectFamilies: contributing.length,
      retailValue: valued ? retail : null,
      tradeValue: valued ? tradeValueOf(retail) : null,
    });
  }

  rows.sort((a, b) => number(b.quantity) - number(a.quantity) || String(a.product).localeCompare(String(b.product)));

  const valuedRows = rows.filter((row) => row.retailValue !== null);
  const retail = valuedRows.length > 0
    ? valuedRows.reduce((sum, row) => sum + number(row.retailValue), 0)
    : null;

  return {
    rows,
    projectRetail,
    projectUnits,
    units: rows.reduce((sum, row) => sum + number(row.quantity), 0),
    retail,
    trade: retail === null ? null : tradeValueOf(retail),
    lineCount: rows.length,
    projectCount: new Set(rows.flatMap((row) => row.projectIds)).size,
    unpricedLineCount: rows.length - valuedRows.length,
    unpricedQuantity: rows
      .filter((row) => row.retailValue === null)
      .reduce((sum, row) => sum + number(row.quantity), 0),
  };
}

/** Retail, trade and units for one project, read from a forecast view. */
export function projectForecastOf(view, projectId) {
  const retail = view?.projectRetail?.get?.(projectId);
  return {
    retail: retail === undefined ? null : retail,
    trade: retail === undefined ? null : tradeValueOf(retail),
    units: view?.projectUnits?.get?.(projectId) || 0,
  };
}

/**
 * The Artcoustic retail value of one design version's priced lines: catalogue
 * lines only, resolved against the Product Master, with the same category rule
 * the forecast uses. The Abfuser reporting cutoff is not applied here — that
 * belongs to Product Demand — and the figure is a version-level reference, never
 * a forecast total.
 */
export function artcousticValueOfLines(lines = [], { priceMap = null, excludedCategories = [] } = {}) {
  const excluded = excludedCategories instanceof Set ? excludedCategories : new Set(excludedCategories || []);
  let retail = 0;
  let valued = false;
  let units = 0;
  let unpricedQuantity = 0;

  for (const line of lines || []) {
    const classification = classifyCatalogueLine(line, priceMap);
    if (!classification.eligible) continue;

    const category = classification.product?.category
      || classification.product?.product_type
      || 'Uncategorised';
    if (excluded.has(categoryKeyOf(category))) continue;

    const quantity = number(line?.count ?? line?.qty);
    units += quantity;

    const priced = line?.unitPriceExVat !== null
      && line?.unitPriceExVat !== undefined
      && line?.subtotalExVat !== null
      && line?.subtotalExVat !== undefined;
    if (!priced) {
      unpricedQuantity += quantity;
      continue;
    }
    retail += number(line.subtotalExVat);
    valued = true;
  }

  return {
    retail: valued ? retail : null,
    trade: valued ? tradeValueOf(retail) : null,
    units,
    unpricedQuantity,
  };
}