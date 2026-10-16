// planCanonicalImport.js
// ---------------------------------------------------------------------------
// The dry run behind a canonical Speaker Database import.
//
// This is a pure function: it reads the current canonical records, reads the
// workbook rows, and reports exactly what would change. It writes nothing, so
// the admin can look at the whole diff before any record is touched, and the
// apply step can never do something the preview did not show.
//
// Identity rules, in order:
//   1. A supplied manufacturer_id / product_id / specification_id identifies
//      exactly that record. An unknown ID is an ERROR — it is never quietly
//      turned into a name match.
//   2. A blank product_id is matched on manufacturer + model, and every such
//      match is reported as a warning, because it is a name match.
//   3. A blank ID with no match is a new manufacturer / product.
//
// Nothing here calculates an engineering value, and nothing here publishes.
// ---------------------------------------------------------------------------

import { normaliseManufacturerIdentity, normaliseModelIdentity } from "@/components/utils/spl/manufacturerIdentity.js";
import { EDITABLE_COLUMNS } from "./canonicalSchema.js";
import { currentValueFor, resolveRowChanges, isBlankValue } from "./canonicalFieldMerge.js";

const asArray = (value) => (Array.isArray(value) ? value : value?.items || []);

export const ENTRY_KINDS = {
  newProduct: "new_product",
  updateProduct: "update_product",
  updateSpecification: "update_specification",
  newSpecification: "new_specification",
  unchanged: "unchanged",
  error: "error",
};

export const ENTRY_KIND_LABELS = {
  new_product: "New product",
  update_product: "Update product",
  update_specification: "Update specification",
  new_specification: "New specification version",
  unchanged: "No change",
  error: "Cannot import",
};

function pick(source, keys) {
  const out = {};
  if (!source) return out;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") out[key] = source[key];
  }
  return out;
}

function currentSpecificationFor(product, specs) {
  if (!product) return null;
  if (product.current_specification_id) {
    const pointed = specs.find((spec) => spec.id === product.current_specification_id);
    if (pointed) return pointed;
  }
  return specs.find((spec) => spec.is_current === true) || specs[0] || null;
}

function contextFor(manufacturer, product, spec) {
  return {
    manufacturer: manufacturer || { name: "" },
    product: product || {},
    spec: spec || {},
  };
}

// A specification that has been approved or published is real history: it is
// never rewritten in place. A draft is safe to update in place.
function isProtectedSpecification(spec) {
  if (!spec) return false;
  return spec.approval_status === "Approved" || Boolean(spec.rp22_published_competitor_id);
}

/**
 * @param {object} params { rows, data: { manufacturers, products, specifications }, changeLog }
 * @returns {object} the dry-run plan
 */
export function planCanonicalImport({ rows, data, changeLog = [] }) {
  const manufacturers = asArray(data?.manufacturers);
  const products = asArray(data?.products);
  const specifications = asArray(data?.specifications);

  const manufacturerById = new Map(manufacturers.map((record) => [record.id, record]));
  const manufacturerByNameKey = new Map();
  for (const record of manufacturers) {
    manufacturerByNameKey.set(normaliseManufacturerIdentity(record.name), record);
  }

  const productById = new Map(products.map((record) => [record.id, record]));
  const productByKey = new Map();
  for (const record of products) {
    if (!record.manufacturer_id) continue;
    productByKey.set(`${record.manufacturer_id}::${normaliseModelIdentity(record.model)}`, record);
  }

  const specById = new Map(specifications.map((record) => [record.id, record]));
  const specsByProduct = new Map();
  for (const spec of specifications) {
    if (!spec.product_id) continue;
    const list = specsByProduct.get(spec.product_id) || [];
    list.push(spec);
    specsByProduct.set(spec.product_id, list);
  }

  const entries = [];
  const errors = [];
  const warnings = [];
  const newManufacturerKeys = new Map();
  const seenSheetIdentities = new Map();
  const touchedProductIds = new Set();

  const noteFor = (productId, model) => {
    const match = changeLog.find((note) => (productId && note.product_id === productId)
      || (model && normaliseModelIdentity(note.model) === normaliseModelIdentity(model)));
    if (!match) return "";
    return [match.change_type, match.note].filter(Boolean).join(" — ");
  };

  for (const row of rows) {
    const cells = row.cells || {};
    const manufacturerId = String(cells.manufacturer_id ?? "").trim();
    const productId = String(cells.product_id ?? "").trim();
    const specificationId = String(cells.specification_id ?? "").trim();
    const manufacturerNameCell = String(cells.manufacturer ?? "").trim();
    const modelCell = String(cells.model ?? "").trim();

    // --- resolve the manufacturer -----------------------------------------
    let manufacturer = null;
    let createsManufacturer = false;
    if (manufacturerId) {
      manufacturer = manufacturerById.get(manufacturerId) || null;
      if (!manufacturer) {
        errors.push({ rowNumber: row.rowNumber, message: `manufacturer_id ${manufacturerId} does not exist. Correct it or clear it to add a new manufacturer.` });
      }
    } else if (manufacturerNameCell) {
      manufacturer = manufacturerByNameKey.get(normaliseManufacturerIdentity(manufacturerNameCell)) || null;
      createsManufacturer = !manufacturer;
    }

    // --- resolve the product ----------------------------------------------
    let product = null;
    let createsProduct = false;
    let matchedByName = false;
    if (productId) {
      product = productById.get(productId) || null;
      if (!product) {
        errors.push({ rowNumber: row.rowNumber, message: `product_id ${productId} does not exist. A supplied product_id is never matched by name — correct it or clear it to add a new product.` });
      }
    } else if (manufacturer || createsManufacturer) {
      // A manufacturer that does not exist yet cannot already hold this product.
      if (manufacturer) product = productByKey.get(`${manufacturer.id}::${normaliseModelIdentity(modelCell)}`) || null;
      matchedByName = Boolean(product);
      createsProduct = !product;
      if (!product) {
        const key = `${normaliseManufacturerIdentity(manufacturerNameCell)}::${normaliseModelIdentity(modelCell)}`;
        if (seenSheetIdentities.has(key)) {
          errors.push({ rowNumber: row.rowNumber, message: `${manufacturerNameCell} ${modelCell} appears twice in this workbook with no product_id. Clear one of them or supply the product_id.` });
        }
      }
    }
    if (modelCell) {
      seenSheetIdentities.set(`${normaliseManufacturerIdentity(manufacturerNameCell)}::${normaliseModelIdentity(modelCell)}`, true);
    }

    if (errors.some((error) => error.rowNumber === row.rowNumber)) {
      entries.push({
        rowNumber: row.rowNumber,
        kind: ENTRY_KINDS.error,
        manufacturerName: manufacturer?.name || manufacturerNameCell,
        model: modelCell,
        messages: errors.filter((error) => error.rowNumber === row.rowNumber).map((error) => error.message),
        changes: [],
      });
      continue;
    }

    if (!manufacturer || !modelCell) {
      const message = !manufacturer
        ? "No manufacturer could be identified for this row."
        : "The model is blank, so no product can be identified.";
      errors.push({ rowNumber: row.rowNumber, message });
      entries.push({
        rowNumber: row.rowNumber,
        kind: ENTRY_KINDS.error,
        manufacturerName: manufacturer?.name || manufacturerNameCell,
        model: modelCell,
        messages: [message],
        changes: [],
      });
      continue;
    }

    // --- resolve the specification ----------------------------------------
    const productSpecs = product ? specsByProduct.get(product.id) || [] : [];
    let spec = null;
    if (specificationId) {
      spec = specById.get(specificationId) || null;
      if (!spec) {
        errors.push({ rowNumber: row.rowNumber, message: `specification_id ${specificationId} does not exist. Clear it to write to the current specification, or correct it.` });
        entries.push({ rowNumber: row.rowNumber, kind: ENTRY_KINDS.error, manufacturerName: manufacturer.name, model: modelCell, messages: [`specification_id ${specificationId} does not exist.`], changes: [] });
        continue;
      }
      if (product && spec.product_id !== product.id) {
        errors.push({ rowNumber: row.rowNumber, message: `specification_id ${specificationId} belongs to a different product.` });
        entries.push({ rowNumber: row.rowNumber, kind: ENTRY_KINDS.error, manufacturerName: manufacturer.name, model: modelCell, messages: ["That specification belongs to a different product."], changes: [] });
        continue;
      }
    } else if (product) {
      spec = currentSpecificationFor(product, productSpecs);
    }

    // --- the diff ---------------------------------------------------------
    // A manufacturer that would be created has nothing to compare against, so
    // the name it is being created under is its current value — there is no
    // rename to propose.
    const context = contextFor(
      manufacturer || { id: null, name: manufacturerNameCell },
      product,
      spec,
    );
    const resolved = resolveRowChanges(EDITABLE_COLUMNS, context, cells, row.rowNumber);
    if (resolved.errors.length) {
      for (const cellError of resolved.errors) {
        errors.push({ rowNumber: row.rowNumber, message: `${cellError.label}: ${cellError.message}` });
      }
      entries.push({
        rowNumber: row.rowNumber,
        kind: ENTRY_KINDS.error,
        manufacturerName: manufacturer.name,
        model: modelCell,
        messages: resolved.errors.map((cellError) => `${cellError.label}: ${cellError.message}`),
        changes: [],
      });
      continue;
    }

    const productChanges = resolved.changes.filter((change) => change.target === "product");
    const specChanges = resolved.changes.filter((change) => change.target === "spec");
    const manufacturerChanges = resolved.changes.filter((change) => change.target === "manufacturer");
    const proposedProduct = { ...resolved.proposed.product };
    const proposedSpec = { ...resolved.proposed.spec };

    const protectedSpecification = isProtectedSpecification(spec);
    const createsNewVersion = specChanges.length > 0 && (!spec || protectedSpecification);
    const createsSpecification = !spec && (specChanges.length > 0 || createsProduct);
    const createsNewSpecificationVersion = createsSpecification || createsNewVersion;

    let kind = ENTRY_KINDS.unchanged;
    if (createsProduct) kind = ENTRY_KINDS.newProduct;
    else if (createsNewSpecificationVersion) kind = ENTRY_KINDS.newSpecification;
    else if (specChanges.length > 0) kind = ENTRY_KINDS.updateSpecification;
    else if (productChanges.length > 0 || manufacturerChanges.length > 0) kind = ENTRY_KINDS.updateProduct;

    if (createsManufacturer && !newManufacturerKeys.has(normaliseManufacturerIdentity(manufacturerNameCell || manufacturer.name))) {
      newManufacturerKeys.set(normaliseManufacturerIdentity(manufacturerNameCell || manufacturer.name), manufacturerNameCell || manufacturer.name);
    }

    if (matchedByName) {
      warnings.push({ rowNumber: row.rowNumber, message: `${manufacturer.name} ${modelCell} has no product_id — it was matched on manufacturer and model. Verify the preview is updating the product you intend.` });
    }
    if (createsManufacturer && !manufacturerId) {
      warnings.push({ rowNumber: row.rowNumber, message: `“${manufacturerNameCell}” is not in the Speaker Database yet — this row would create it.` });
    }
    if (createsNewSpecificationVersion && protectedSpecification) {
      warnings.push({ rowNumber: row.rowNumber, message: `${manufacturer.name} ${modelCell} has an approved or published specification — its changes create a new version and the approved version is kept as history.` });
    }

    const manufacturerNameProposed = String(cells.manufacturer ?? "").trim();
    const manufacturerRename = manufacturer.id && manufacturerChanges.length > 0 && manufacturerNameProposed
      ? { id: manufacturer.id, from: manufacturer.name, to: manufacturerNameProposed }
      : null;
    if (manufacturerRename) {
      warnings.push({ rowNumber: row.rowNumber, message: `“${manufacturerRename.from}” would be renamed to “${manufacturerRename.to}” for every one of its products. Leave the manufacturer cell blank if you did not mean to rename it.` });
    }

    const beforeProductFields = productChanges.map((change) => change.field);
    const beforeSpecFields = specChanges.map((change) => change.field);

    // The product's manufacturer name is denormalized for display, so a renamed
    // manufacturer carries the new name onto its own products.
    const productNameForManufacturerPatch = manufacturerRename && manufacturerNameProposed !== product?.manufacturer_name
      ? { manufacturer_name: manufacturerNameProposed }
      : {};

    const entry = {
      rowNumber: row.rowNumber,
      kind,
      manufacturerKey: normaliseManufacturerIdentity(manufacturerNameCell || manufacturer.name),
      manufacturerName: String(cells.manufacturer ?? "").trim() || manufacturer.name,
      manufacturerIdResolved: manufacturer.id,
      model: modelCell || product?.model || "",
      adminNote: noteFor(product?.id || "", modelCell),
      matchedByName,
      createsManufacturer,
      createsProduct: createsProduct,
      createsSpecification,
      createsNewSpecificationVersion,
      identities: {
        manufacturer_id: manufacturer.id,
        product_id: product?.id || null,
        specification_id: spec?.id || null,
      },
      previousSpecificationId: createsNewVersion ? spec.id : null,
      productChanges,
      specChanges,
      manufacturerChanges,
      proposedProduct: { ...proposedProduct, ...productNameForManufacturerPatch },
      proposedSpec,
      manufacturerRename,
      // exactly what rollback needs to put back
      before: {
        manufacturer: manufacturerChanges.length ? { name: manufacturer.name } : null,
        product: pick(product, beforeProductFields),
        specification: spec
          ? { ...pick(spec, beforeSpecFields), ...(specChanges.length && !createsNewVersion ? { approval_status: spec.approval_status } : {}) }
          : {},
        previousSpecification: createsNewVersion && spec
          ? { is_current: spec.is_current === true, approval_status: spec.approval_status ?? null }
          : null,
      },
      after: {
        product: pick(proposedProduct, beforeProductFields),
        specification: pick(proposedSpec, beforeSpecFields),
      },
      messages: [],
      changes: resolved.changes,
    };

    if (product?.id) touchedProductIds.add(product.id);
    entries.push(entry);
  }

  const countable = entries.filter((entry) => entry.kind !== ENTRY_KINDS.error);
  const counts = {
    newManufacturers: newManufacturerKeys.size,
    newProducts: countable.filter((entry) => entry.kind === ENTRY_KINDS.newProduct).length,
    updatedProducts: countable.filter((entry) => [
      ENTRY_KINDS.updateProduct,
      ENTRY_KINDS.updateSpecification,
      ENTRY_KINDS.newSpecification,
    ].includes(entry.kind)).length,
    newSpecifications: countable.filter((entry) => entry.createsNewSpecificationVersion).length,
    unchanged: countable.filter((entry) => entry.kind === ENTRY_KINDS.unchanged).length,
    warnings: warnings.length,
    errors: errors.length,
  };

  const notInWorkbook = Math.max(0, products.length - touchedProductIds.size);
  const nothingToApply = counts.newProducts + counts.updatedProducts === 0;

  return {
    entries,
    counts,
    warnings,
    errors,
    notInWorkbook,
    nothingToApply,
    changeLogNotes: changeLog.length,
    canApply: counts.errors === 0 && !nothingToApply,
  };
}

export { currentValueFor, isBlankValue };