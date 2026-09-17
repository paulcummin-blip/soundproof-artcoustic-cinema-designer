// addSpeakerExtraction.js
// ---------------------------------------------------------------------------
// Extraction engine for the Add Speaker wizard.
//
// This is NOT AI. It does NOT extract specification values from web pages or
// PDFs. It creates an empty Draft populated from available data:
//   - Manufacturer identity (from Step 1)
//   - Official product URL (from Step 2)
//   - Official PDF URL (from Step 3)
//   - Document references (from Step 3)
//
// The output is a scaffolding object:
//   { product, specification, documents, sources }
//
// All specification fields remain blank. field_authority is empty.
// confidence defaults to "D" (Engineering Estimate) — nothing has been
// verified yet. evidence_quality defaults to "Unknown".
//
// Never invents values. Blank is preferable to incorrect.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";

/**
 * Create the full draft scaffolding for a new speaker product.
 * Creates: SpeakerProduct, SpeakerSpecification (Draft), SpeakerDocument(s),
 * SpeakerSource(s), and a SpeakerChangeHistory "Created" record.
 *
 * @param {object} params
 *   manufacturer  — SpeakerManufacturer record
 *   productUrl    — official product page URL
 *   pdfUrl        — official specification PDF URL (optional)
 *   additionalDocs — [{ document_type, url, title }] extra documents
 * @returns {object} { productId, specId, product, spec }
 */
export async function createDraftScaffolding({ manufacturer, productUrl, pdfUrl, additionalDocs = [] }) {
  if (!manufacturer?.id) throw new Error("Manufacturer is required");
  if (!productUrl) throw new Error("Product URL is required");

  // ── 1. Create the SpeakerProduct ────────────────────────────────────
  const product = await base44.entities.SpeakerProduct.create({
    manufacturer_id: manufacturer.id,
    manufacturer_name: manufacturer.name,
    model: "",
    series: "",
    full_product_name: "",
    category: "Other",
    role: "Flexible",
    status: "Unknown",
    import_status: "Manual",
    official_product_url: productUrl,
    official_pdf_url: pdfUrl || "",
    notes: "",
  });

  // ── 2. Create the Draft SpeakerSpecification ────────────────────────
  const spec = await base44.entities.SpeakerSpecification.create({
    product_id: product.id,
    version_label: "Current",
    is_current: true,
    approval_status: "Draft",
    confidence: "D",
    evidence_quality: "Unknown",
    field_authority: {},
    primary_source: productUrl ? "Official Product Page" : "",
  });

  // ── 3. Link the spec to the product ────────────────────────────────
  await base44.entities.SpeakerProduct.update(product.id, {
    current_specification_id: spec.id,
  });

  // ── 4. Create SpeakerDocument records ──────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const documentsToCreate = [];

  if (productUrl) {
    documentsToCreate.push({
      product_id: product.id,
      document_type: "Product Page",
      url: productUrl,
      title: `${manufacturer.name} Product Page`,
      date_checked: today,
      notes: "Official manufacturer product page",
    });
  }
  if (pdfUrl) {
    documentsToCreate.push({
      product_id: product.id,
      document_type: "PDF",
      url: pdfUrl,
      title: `${manufacturer.name} Specification PDF`,
      date_checked: today,
      notes: "Official manufacturer specification PDF",
    });
  }
  for (const doc of additionalDocs) {
    if (doc.url) {
      documentsToCreate.push({
        product_id: product.id,
        document_type: doc.document_type || "PDF",
        url: doc.url,
        title: doc.title || "",
        date_checked: today,
        notes: "",
      });
    }
  }

  if (documentsToCreate.length > 0) {
    await base44.entities.SpeakerDocument.bulkCreate(documentsToCreate);
  }

  // ── 5. Create SpeakerSource records ────────────────────────────────
  const sourcesToCreate = [];
  if (productUrl) {
    sourcesToCreate.push({
      product_id: product.id,
      source_type: "Official Product Page",
      url: productUrl,
      date_checked: today,
      notes: "Primary product page source",
    });
  }
  if (pdfUrl) {
    sourcesToCreate.push({
      product_id: product.id,
      source_type: "Official PDF",
      url: pdfUrl,
      date_checked: today,
      notes: "Primary specification PDF source",
    });
  }
  if (sourcesToCreate.length > 0) {
    await base44.entities.SpeakerSource.bulkCreate(sourcesToCreate);
  }

  // ── 6. Log creation in Change History ──────────────────────────────
  await base44.entities.SpeakerChangeHistory.create({
    product_id: product.id,
    field_changed: "product",
    old_value: "",
    new_value: `Created from ${productUrl}`,
    source: "Manual Edit",
    change_type: "Created",
    change_reason: "Manual Correction",
  });

  return { productId: product.id, specId: spec.id, product, spec };
}

/**
 * Check whether a product URL is already imported.
 * Returns the existing product if found, null otherwise.
 */
export async function checkExistingProduct(productUrl) {
  if (!productUrl) return null;
  try {
    const existing = await base44.entities.SpeakerProduct.filter({
      official_product_url: productUrl,
    });
    return Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
  } catch {
    return null;
  }
}