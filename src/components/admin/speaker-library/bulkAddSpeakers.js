// bulkAddSpeakers.js
// ---------------------------------------------------------------------------
// The bulk-add path for "+ Add Multiple". Creates competitor speaker rows from
// pasted CSV or JSON without requiring complete specifications. A row with only
// a brand and product is valid — it is created INCOMPLETE and stays in the
// library until the administrator researches the missing data.
//
// Reuses the existing manufacturer/product/specification persistence. Nothing
// is invented, nothing is overwritten: an existing product is skipped (never
// recreated), and a price is written only when one is supplied.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { sameCompetitorIdentity } from "@/components/utils/spl/manufacturerIdentity";
import { ensureManufacturer, createModelFirstDraft } from "@/components/admin/speaker-db/model-first/modelFirstPersistence";
import { parsePriceEntry } from "@/components/spl/CompetitorPriceManager";

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const numberOrNull = (value) => {
  if (!hasValue(value)) return null;
  const parsed = Number(String(value).replace(/[,£\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const REFERENCE_VALUES = new Set(["2.83V/1m", "1W/1m", "unknown"]);

// Normalise a few common header spellings so a paste from ChatGPT just works.
const HEADER_ALIASES = {
  brand: "manufacturer", manufacturer: "manufacturer", make: "manufacturer",
  product: "model", model: "model", name: "model", speaker: "model",
  sensitivity: "sensitivity_db", sensitivitydb: "sensitivity_db",
  sensitivitybasis: "sensitivity_reference", sensitivity_reference: "sensitivity_reference", basis: "sensitivity_reference",
  impedance: "impedance_ohm", impedanceohm: "impedance_ohm", nominalimpedance: "impedance_ohm",
  power: "power_w", continuouspower: "power_w", powerw: "power_w",
  maxspl: "max_spl_db", max_spl: "max_spl_db", maxspldb: "max_spl_db",
  price: "price", retailprice: "price", priceincvat: "price", ukretail: "price",
  url: "source_url", sourceurl: "source_url", source: "source_url", link: "source_url",
};

function normaliseHeader(raw) {
  const clean = String(raw || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return HEADER_ALIASES[clean] || HEADER_ALIASES[String(raw || "").trim().toLowerCase()] || clean;
}

/** Parse a CSV string into rows of objects. Tolerant: comma-separated, header row required. */
export function parseCsv(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => String(line).trim() !== "");
  if (lines.length < 2) return [];
  const splitLine = (line) => {
    // Simple CSV split — handles unquoted commas. Good enough for pasted GPT data.
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { out.push(current); current = ""; continue; }
      current += ch;
    }
    out.push(current);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]).map(normaliseHeader);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((header, i) => { row[header] = cells[i] ?? ""; });
    return row;
  });
}

/** Parse pasted text as JSON if it looks like JSON, otherwise as CSV. */
export function parsePasted(text) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  if (clean.startsWith("[") || clean.startsWith("{")) {
    try {
      const parsed = JSON.parse(clean);
      const array = Array.isArray(parsed) ? parsed : [parsed];
      return array.map((item) => {
        const row = {};
        for (const [key, value] of Object.entries(item)) {
          row[normaliseHeader(key)] = value;
        }
        return row;
      });
    } catch {
      // Fall through to CSV — maybe it was bracketed but not valid JSON.
    }
  }
  return parseCsv(clean);
}

/**
 * Add multiple speakers from parsed rows. Existing products are never
 * overwritten — they are skipped (and counted). Prices are written only when
 * supplied. Nothing is published; incomplete rows stay as drafts.
 *
 * @returns {object} { created, skipped, errors, duplicates }
 */
export async function bulkAddSpeakers({ rows, actorName }) {
  const created = [];
  const skipped = [];
  const errors = [];
  const duplicates = [];
  const manufacturers = [];

  const cleanStr = (s) => String(s || "").replace(/\u00a0/g, " ").trim();

  for (const entry of rows) {
    const manufacturerName = cleanStr(entry.manufacturer);
    const model = cleanStr(entry.model);
    // Blank rows (notes, separators) are skipped silently.
    if (!manufacturerName && !model) continue;
    if (!manufacturerName) {
      errors.push({ manufacturer: "", model, reason: "Brand is required." });
      continue;
    }
    // Brand-only rows create or preserve the manufacturer but never a dummy product.
    if (!model) {
      try {
        await ensureManufacturer({ name: manufacturerName, website: "" });
        manufacturers.push({ manufacturer: manufacturerName });
      } catch (e) {
        errors.push({ manufacturer: manufacturerName, model: "", reason: e?.message || "Could not add manufacturer." });
      }
      continue;
    }

    try {
      const manufacturer = await ensureManufacturer({ name: manufacturerName, website: "" });

      // Find an existing product by identity — never overwrite it.
      const filterResult = await base44.entities.SpeakerProduct.filter({ model }, { limit: 50 });
      const items = Array.isArray(filterResult) ? filterResult : filterResult?.items || [];
      const existing = items.find((product) => sameCompetitorIdentity(
        { manufacturer: product.manufacturer_name, model: product.model },
        { manufacturer: manufacturerName, model },
      ));

      if (existing) {
        duplicates.push({ manufacturer: manufacturerName, model });
        skipped.push({ manufacturer: manufacturerName, model, reason: "Already exists — not overwritten." });

        // Still write the price if one was supplied and a comparison record exists.
        const price = parsePriceEntry(entry.price);
        if (price.valid && price.value !== null) {
          const compResult = await base44.entities.CompetitorSpeaker.filter(
            { source_product_id: existing.id },
            { limit: 1 },
          );
          const comp = (Array.isArray(compResult) ? compResult : compResult?.items || [])[0];
          if (comp) {
            await base44.entities.CompetitorSpeaker.update(comp.id, {
              retail_price_inc_vat: price.value,
              currency: "GBP",
            });
          }
        }
        continue;
      }

      const draft = await createModelFirstDraft({ manufacturer, model, actorName });
      const { product, specification } = draft;

      // Write any supplied specification fields onto the draft — only non-blank
      // values, never overwriting (the draft is empty, so everything is new).
      const specPatch = {};
      const sensitivity = numberOrNull(entry.sensitivity_db);
      if (sensitivity !== null) specPatch.sensitivity_db = sensitivity;
      if (hasValue(entry.sensitivity_reference) && REFERENCE_VALUES.has(String(entry.sensitivity_reference))) {
        specPatch.sensitivity_basis = String(entry.sensitivity_reference);
      }
      const impedance = numberOrNull(entry.impedance_ohm);
      if (impedance !== null) specPatch.nominal_impedance_ohm = impedance;
      const power = numberOrNull(entry.power_w);
      if (power !== null) specPatch.recommended_amp_max_w = power;
      const maxSpl = numberOrNull(entry.max_spl_db);
      if (maxSpl !== null) specPatch.max_continuous_spl_db = maxSpl;
      if (hasValue(entry.source_url)) {
        specPatch.datasheet_url = String(entry.source_url);
        await base44.entities.SpeakerProduct.update(product.id, { official_product_url: String(entry.source_url) });
      }

      if (Object.keys(specPatch).length > 0) {
        await base44.entities.SpeakerSpecification.update(specification.id, specPatch);
      }

      // Write the price on a comparison record if one was supplied.
      const price = parsePriceEntry(entry.price);
      if (price.valid && price.value !== null) {
        await base44.entities.CompetitorSpeaker.create({
          manufacturer: manufacturer.name || manufacturerName,
          model,
          source_product_id: product.id,
          source_specification_id: specification.id,
          publish_source: "speaker_database",
          retail_price_inc_vat: price.value,
          currency: "GBP",
          active: true,
          published: false,
        });
      }

      created.push({ manufacturer: manufacturerName, model });
    } catch (e) {
      errors.push({ manufacturer: manufacturerName, model, reason: e?.message || "Could not be added." });
    }
  }

  return { created: created.length, skipped: skipped.length, manufacturers: manufacturers.length, errors, duplicates };
}