// candidateImport.js
// ---------------------------------------------------------------------------
// Creates Speaker Database records from admin-selected candidate models.
//
// Reuses the existing model-first persistence: the product identity and its
// first specification are created exactly as the Add Speaker workflow creates
// them, only fields the official source stated are written (with per-field
// authority), data-quality warnings are persisted by the existing validator,
// and the specification is left in Draft. Nothing is approved and nothing is
// published here — publication stays a separate, reviewed action.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import {
  createModelFirstDraft,
  mergeExtractionIntoSpec,
  persistModelFirstWarnings,
} from "./model-first/modelFirstPersistence.js";
import { candidateExtractionPayload, modelKey } from "./candidateReview.js";

const ROLE_VALUES = ["LCR", "Surround", "Wide", "Height", "Flexible", "Both"];

export async function loadExistingModelKeys(manufacturerId) {
  if (!manufacturerId) return new Set();
  const page = await base44.entities.SpeakerProduct.filter({ manufacturer_id: manufacturerId }, { limit: 500 });
  const rows = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [];
  return new Set(rows.map((row) => modelKey(row.model)).filter(Boolean));
}

/**
 * Create Draft products + specifications for the selected candidates.
 * @returns {object} { created: [{ id, model }], skipped: [{ model, reason }] }
 */
export async function createDraftProductsFromCandidates({ manufacturer, candidates, actorName }) {
  if (!manufacturer?.id) throw new Error("Manufacturer is required");

  const existingKeys = await loadExistingModelKeys(manufacturer.id);
  const today = new Date().toISOString().slice(0, 10);
  const created = [];
  const skipped = [];

  for (const candidate of candidates || []) {
    const key = modelKey(candidate?.model);
    if (!key) continue;
    if (existingKeys.has(key)) {
      skipped.push({ model: candidate.model, reason: "Already in the Speaker Database" });
      continue;
    }

    const { product, specification } = await createModelFirstDraft({
      manufacturer,
      model: candidate.model,
      notes: `Discovered from the official manufacturer domain — ${candidate.product_url || manufacturer.website || ""}`,
      actorName,
    });

    const productPatch = {
      category: candidate.product_category || "Other",
      official_product_url: candidate.product_url || "",
      official_pdf_url: candidate.datasheet_url || "",
      import_status: "Imported",
      status: "Current",
    };
    if (candidate.series) productPatch.series = candidate.series;
    if (ROLE_VALUES.includes(candidate.role_guess)) productPatch.role = candidate.role_guess;
    await base44.entities.SpeakerProduct.update(product.id, productPatch);

    const extraction = candidateExtractionPayload(candidate, today);
    const { patch, authority } = mergeExtractionIntoSpec(specification, extraction);
    const updatedSpec = await base44.entities.SpeakerSpecification.update(specification.id, {
      ...patch,
      field_authority: authority,
      primary_source: candidate.product_url || "",
      datasheet_url: candidate.datasheet_url || patch.datasheet_url || "",
    });

    await persistModelFirstWarnings(product.id, updatedSpec);

    existingKeys.add(key);
    created.push({ id: product.id, model: candidate.model });
  }

  return { created, skipped };
}