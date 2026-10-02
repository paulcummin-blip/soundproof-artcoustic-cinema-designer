/**
 * productDemand.js
 * ----------------
 * Product demand for Project Intelligence.
 *
 * Demand is aggregated from the SAME priced line output the pricing engine
 * produced for each project's active version — never from raw selected_speakers,
 * which are only a fallback quantity source and never a price source. Quoted
 * demand comes from the frozen proposal snapshot breakdown.
 *
 * Unpriced and inactive products stay visible and are never treated as zero.
 *
 * Abfuser quantity and value are left out of demand when the counted version is
 * dated before 1 Oct 2026 (see abfuserCutoffAuthority). That is a reporting
 * exclusion only: it changes Product Demand and nothing else.
 *
 * Pure: no React, no side effects.
 */

import { STATUS_BUCKETS } from './statusBuckets';
import { text } from './reportingUtils';
import { classifyCatalogueLine, isEngineDerivedLine } from './catalogueLineAuthority';
import { ABFUSER_REASON, classifyAbfuserCutoff, formatCutoffDate } from './abfuserCutoffAuthority';

/**
 * Whether a line is an Artcoustic line the pricing engine generated from the
 * design (the CPH-1000D subwoofer amplifier, the Abfuser acoustic treatment).
 * Manual extras are not demand lines at all, so they are no longer listed here.
 */
export const isDerivedLine = isEngineDerivedLine;

/** Where an excluded line was found: the design, or the quoted snapshot. */
const LIVE_BASIS = 'Live design';
const QUOTED_BASIS = 'Quoted snapshot';

/**
 * The variation whose priced lines count as demand for this project.
 *
 * A project's versions are design options and a client cannot buy every option,
 * so only the ONE counted version contributes. The counted version is chosen in
 * the selection layer; when a caller has not chosen one, the active version is
 * used exactly as before.
 */
function countedVariationOf(family) {
  const variations = family?.variations || [];
  if (family?.countedVariationId) {
    const chosen = variations.find((variation) => variation.id === family.countedVariationId);
    if (chosen) return chosen;
  }
  return variations.find((variation) => variation.isActive) || variations[0];
}

/**
 * The catalogue demand pass.
 *
 * ONLY Artcoustic catalogue lines reach the demand rows: a line is aggregated
 * only when it resolves to a real Product Master record. Manual extras and lines
 * the Product Master does not know are classified out with a reason and returned
 * separately, so they are visible for audit but never counted.
 *
 * Both outputs come from this ONE pass, so the demand and the excluded-line
 * audit can never disagree.
 *
 * @param {Object} input
 * @param {Array} input.families — included project families
 * @param {Map} input.priceMap — Product Master index (sku → product)
 * @returns {{ rows: Array<Object>, excludedLines: Array<Object>, abfuserExclusions: Array<Object>, abfuserWarnings: Array<string>, unitsByProjectId: Object }}
 *   unitsByProjectId carries the counted catalogue units per project, from this
 *   same pass, so the age and trend overviews measure units on exactly the
 *   lines Product Demand counts.
 */
export function buildCatalogueDemand({ families = [], priceMap = null } = {}) {
  const rows = new Map();
  const excluded = new Map();
  const abfuserExcluded = new Map();
  const abfuserWarnings = new Set();
  // Counted catalogue units per project, accumulated in the live design pass
  // below — the same lines, and the same rules, as the demand rows.
  const unitsByProject = new Map();

  const ensureRow = (sku, label, classification) => {
    const key = text(sku).toLowerCase() || text(label).toLowerCase();
    if (!key) return null;
    if (!rows.has(key)) {
      const product = classification?.product || priceMap?.get?.(text(sku)) || null;
      rows.set(key, {
        sku: text(sku) || null,
        product: product?.label || label || text(sku) || 'Unknown product',
        category: product?.category || product?.product_type || '—',
        quantity: 0,
        projectIds: new Set(),
        qtyByBucket: Object.fromEntries(STATUS_BUCKETS.map((bucket) => [bucket.key, 0])),
        liveValue: 0,
        quotedValue: 0,
        quotedQuantity: 0,
        derived: classification?.derived === true,
        priced: true,
        inactive: false,
        unpricedQuantity: 0,
        priceKnown: false,
      });
    }
    return rows.get(key);
  };

  // One audit row per excluded line, whichever basis it appeared in. The same
  // line normally appears in both the live design and the frozen quoted snapshot;
  // showing it twice would read as a duplicate, so the two bases accumulate onto
  // one row and the live design line is the quantity and value shown.
  const excludeLine = ({ family, counted, sku, description, quantity, value, reason, basis }) => {
    const key = [family?.id, counted?.id, sku, description, reason].join('|');
    const entry = excluded.get(key) || {
      projectId: family?.id || null,
      project: family?.name || null,
      countedVersion: counted?.versionName || 'Legacy design',
      sku: sku || null,
      description: description || sku || 'Manual item',
      reason,
      liveQuantity: 0,
      liveValue: 0,
      quotedQuantity: 0,
      quotedValue: 0,
    };
    if (basis === QUOTED_BASIS) {
      entry.quotedQuantity += quantity;
      entry.quotedValue += value;
    } else {
      entry.liveQuantity += quantity;
      entry.liveValue += value;
    }
    excluded.set(key, entry);
  };

  // One audit row per counted version whose Abfuser was left out by the cutoff,
  // carrying the date the version was judged on. Like the other audit, the two
  // bases accumulate onto one row and the live design line is what is shown.
  const recordAbfuserExclusion = ({ family, counted, sku, quantity, value, verdict, basis }) => {
    const key = [family?.id, counted?.id].join('|');
    const entry = abfuserExcluded.get(key) || {
      projectId: family?.id || null,
      project: family?.name || null,
      countedVersion: counted?.versionName || 'Legacy design',
      sku: sku || null,
      dateUsed: verdict?.dateUsed || null,
      dateBasis: verdict?.dateBasis || '',
      reason: ABFUSER_REASON,
      liveQuantity: 0,
      liveValue: 0,
      quotedQuantity: 0,
      quotedValue: 0,
    };
    if (basis === QUOTED_BASIS) {
      entry.quotedQuantity += quantity;
      entry.quotedValue += value;
    } else {
      entry.liveQuantity += quantity;
      entry.liveValue += value;
    }
    abfuserExcluded.set(key, entry);
    if (verdict?.warning) abfuserWarnings.add(verdict.warning);
  };

  // Live design demand, from the priced schedule of the counted version only.
  for (const family of families) {
    const counted = countedVariationOf(family);
    for (const line of counted?.lines || []) {
      const classification = classifyCatalogueLine(line, priceMap);
      const quantity = Number(line.count ?? line.qty) || 0;

      if (!classification.eligible) {
        excludeLine({
          family,
          counted,
          sku: classification.sku,
          description: line.description,
          quantity,
          value: Number(line.subtotalExVat) || 0,
          reason: classification.reason,
          basis: LIVE_BASIS,
        });
        continue;
      }

      // The Abfuser cutoff: a counted version dated before 1 Oct 2026 gives no
      // Abfuser quantity or value to demand, while every other line of that
      // project still counts normally.
      const cutoff = classifyAbfuserCutoff(line, { classification, variation: counted, family });
      if (cutoff.excluded) {
        recordAbfuserExclusion({
          family,
          counted,
          sku: classification.sku,
          quantity,
          value: Number(line.subtotalExVat) || 0,
          verdict: cutoff,
          basis: LIVE_BASIS,
        });
        continue;
      }

      const row = ensureRow(classification.sku, line.description, classification);
      if (!row) continue;
      row.quantity += quantity;
      row.projectIds.add(family.id);
      row.qtyByBucket[family.bucket] = (row.qtyByBucket[family.bucket] || 0) + quantity;
      unitsByProject.set(family.id, (unitsByProject.get(family.id) || 0) + quantity);

      if (line.unitPriceExVat === null || line.unitPriceExVat === undefined) {
        // No price is known for this line: the quantity is still reported, the
        // value is not, and the row is marked Unpriced.
        row.unpricedQuantity += quantity;
        row.priced = false;
        row.inactive = row.inactive || line.inactive === true;
      } else {
        row.priceKnown = true;
        row.liveValue += Number(line.subtotalExVat) || 0;
      }
    }
  }

  // Quoted demand, from the frozen snapshot the quoted value is read from, held
  // to exactly the same catalogue rule.
  for (const family of families) {
    const counted = countedVariationOf(family);
    for (const line of family.quotedSnapshotBreakdown || []) {
      const classification = classifyCatalogueLine(line, priceMap);
      const quantity = Number(line.quantity) || 0;

      if (!classification.eligible) {
        excludeLine({
          family,
          counted,
          sku: classification.sku,
          description: line.description,
          quantity,
          value: Number(line.subtotal_ex_vat) || 0,
          reason: classification.reason,
          basis: QUOTED_BASIS,
        });
        continue;
      }

      const cutoff = classifyAbfuserCutoff(line, { classification, variation: counted, family });
      if (cutoff.excluded) {
        recordAbfuserExclusion({
          family,
          counted,
          sku: classification.sku,
          quantity,
          value: Number(line.subtotal_ex_vat) || 0,
          verdict: cutoff,
          basis: QUOTED_BASIS,
        });
        continue;
      }

      const row = ensureRow(classification.sku, line.description, classification);
      if (!row) continue;
      row.quotedQuantity += quantity;
      row.projectIds.add(family.id);
      row.quotedValue += Number(line.subtotal_ex_vat) || 0;
      if (line.unit_price_ex_vat === null || line.unit_price_ex_vat === undefined) row.priced = false;
    }
  }

  const sorted = [...rows.values()]
    .map((row) => ({
      ...row,
      projectFamilies: row.projectIds.size,
      // The contributing project ids are kept so the demand table can show which
      // included projects produced each quantity.
      projectIds: [...row.projectIds],
      liveValue: row.priceKnown || row.liveValue > 0 ? row.liveValue : null,
      quotedValue: row.quotedQuantity > 0 ? row.quotedValue : null,
      status: row.inactive ? 'Inactive' : (row.priced ? 'Priced' : 'Unpriced'),
    }))
    .sort((a, b) => (b.quantity + b.quotedQuantity) - (a.quantity + a.quotedQuantity));

  const excludedLines = [...excluded.values()].map((entry) => ({
    projectId: entry.projectId,
    project: entry.project,
    countedVersion: entry.countedVersion,
    sku: entry.sku,
    description: entry.description,
    reason: entry.reason,
    quantity: entry.liveQuantity || entry.quotedQuantity,
    value: entry.liveQuantity > 0 ? entry.liveValue : entry.quotedValue,
    basis: entry.liveQuantity > 0 && entry.quotedQuantity > 0
      ? `${LIVE_BASIS} and ${QUOTED_BASIS}`
      : (entry.quotedQuantity > 0 ? QUOTED_BASIS : LIVE_BASIS),
  })).sort((a, b) => {
    const byProject = String(a.project || '').localeCompare(String(b.project || ''));
    if (byProject !== 0) return byProject;
    return String(a.description || '').localeCompare(String(b.description || ''));
  });

  const abfuserExclusions = [...abfuserExcluded.values()].map((entry) => ({
    projectId: entry.projectId,
    project: entry.project,
    countedVersion: entry.countedVersion,
    sku: entry.sku,
    dateUsed: entry.dateUsed,
    dateBasis: entry.dateBasis,
    dateLabel: formatCutoffDate({ dateUsed: entry.dateUsed, dateBasis: entry.dateBasis }),
    quantity: entry.liveQuantity || entry.quotedQuantity,
    value: entry.liveQuantity > 0 ? entry.liveValue : entry.quotedValue,
    reason: entry.reason,
  })).sort((a, b) => {
    const byProject = String(a.project || '').localeCompare(String(b.project || ''));
    if (byProject !== 0) return byProject;
    return String(a.countedVersion || '').localeCompare(String(b.countedVersion || ''));
  });

  return {
    rows: sorted,
    excludedLines,
    abfuserExclusions,
    abfuserWarnings: [...abfuserWarnings],
    unitsByProjectId: Object.fromEntries(unitsByProject),
  };
}

/**
 * Product Demand: the Artcoustic catalogue rows only.
 *
 * @param {Object} input
 * @param {Array} input.families — filtered project families
 * @param {Map} input.priceMap — Product Master index (sku → product)
 * @returns {Array<Object>} demand rows
 */
export function buildProductDemand({ families = [], priceMap = null } = {}) {
  return buildCatalogueDemand({ families, priceMap }).rows;
}