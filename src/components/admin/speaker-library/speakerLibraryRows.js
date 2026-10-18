// speakerLibraryRows.js
// ---------------------------------------------------------------------------
// The ONE read path behind the Speaker Comparison Library.
//
// A row is a competitor loudspeaker as the designer will see it: identity from
// the Speaker Database product (when one exists), technical values from that
// product's current specification, and the retail price from the comparison
// record. A model with no comparison record yet is still listed, so nothing in
// the database is invisible to the administrator who maintains it.
//
// Nothing is invented and nothing is merged blindly: where no canonical record
// exists the stored comparison values are shown as they are, and where a value
// was never published it stays blank.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { sameCompetitorIdentity } from "@/components/utils/spl/manufacturerIdentity";
import { comparisonReadiness } from "@/components/admin/speaker-db/comparisonReadiness";

export const PAGE_SIZE = 50;

function itemsOf(result) {
  return Array.isArray(result) ? result : result?.items || [];
}

function searchFilter(term, fields) {
  const clean = String(term || "").trim();
  if (!clean) return {};
  return { $or: fields.map((field) => ({ [field]: { $regex: clean, $options: "i" } })) };
}

function byManufacturerThenModel(a, b) {
  const compare = (x, y) => String(x || "").localeCompare(String(y || ""), "en", { sensitivity: "base" });
  return compare(a.manufacturer, b.manufacturer) || compare(a.model, b.model);
}

async function specificationsById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const result = await base44.entities.SpeakerSpecification.filter({ id: { $in: unique } });
  return new Map(itemsOf(result).map((spec) => [spec.id, spec]));
}

/**
 * One library row from a comparison record and, where one exists, the canonical
 * product + specification behind it. Readiness is the same classification the
 * Products list and the dealer's comparison page report.
 */
function buildRow({ record, product, specification }) {
  return {
    key: record?.id || `speakerdb:${product?.id}`,
    rowId: record?.id || null,
    productId: product?.id || null,
    specificationId: specification?.id || null,
    manufacturer: record?.manufacturer || product?.manufacturer_name || "",
    model: record?.model || product?.model || "",
    price: record?.retail_price_inc_vat ?? null,
    inComparison: Boolean(record) && record.active !== false,
    fromDatabase: record?.publish_source === "speaker_database",
    product: product || null,
    specification: specification || null,
    record: record || null,
    readiness: product && specification
      ? comparisonReadiness({ product, specification })
      : null,
  };
}

/**
 * The library page: comparison records matched with their canonical records, plus
 * every canonical product that is not in the comparison yet.
 *
 * Every search term is a fresh server query — the table shows what the database
 * matched, not a subset of whatever happened to be loaded. Canonical products
 * have no paging of their own, so they are added on the first page only.
 */
export async function loadSpeakerLibrary({ search = "", manufacturer = "", cursor = null } = {}) {
  const firstPage = !cursor;
  const recordQuery = searchFilter(search, ["manufacturer", "model"]);
  if (manufacturer) recordQuery.manufacturer = manufacturer;
  const productQuery = searchFilter(search, ["manufacturer_name", "model"]);
  if (manufacturer) productQuery.manufacturer_name = manufacturer;

  const [recordResult, productResult] = await Promise.all([
    base44.entities.CompetitorSpeaker.filter(recordQuery, {
      sort: "manufacturer",
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    }),
    firstPage
      ? base44.entities.SpeakerProduct.filter(productQuery, { sort: "model", limit: PAGE_SIZE })
      : Promise.resolve([]),
  ]);

  const records = itemsOf(recordResult);
  const products = itemsOf(productResult);
  const specById = await specificationsById([
    ...records.map((record) => record.source_specification_id),
    ...products.map((product) => product.current_specification_id),
  ]);

  const rows = [];
  const claimed = new Set();
  for (const record of records) {
    const product = products.find((item) => item.id === record.source_product_id)
      || products.find((item) => sameCompetitorIdentity(
        { manufacturer: item.manufacturer_name, model: item.model },
        { manufacturer: record.manufacturer, model: record.model },
      ))
      || null;
    if (product) claimed.add(product.id);
    rows.push(buildRow({
      record,
      product,
      specification: (product && specById.get(product.current_specification_id))
        || specById.get(record.source_specification_id)
        || null,
    }));
  }
  for (const product of products) {
    if (claimed.has(product.id)) continue;
    rows.push(buildRow({ record: null, product, specification: specById.get(product.current_specification_id) || null }));
  }

  rows.sort(byManufacturerThenModel);

  return {
    rows,
    nextCursor: recordResult?.next_cursor || null,
    hasMore: recordResult?.has_more === true,
  };
}

/** Manufacturer names for the filter and the form's suggestions. */
export async function loadLibraryManufacturers() {
  const [fromLibrary, fromDatabase] = await Promise.all([
    base44.entities.CompetitorSpeaker.filter({}, { distinct: "manufacturer" }),
    base44.entities.SpeakerProduct.filter({}, { distinct: "manufacturer_name" }),
  ]);
  const merged = [...itemsOf(fromLibrary), ...itemsOf(fromDatabase)]
    .filter((name) => String(name || "").trim() !== "");
  return [...new Set(merged)].sort((a, b) => String(a).localeCompare(String(b)));
}