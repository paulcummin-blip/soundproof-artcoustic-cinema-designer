// rawExtraction.js
// ---------------------------------------------------------------------------
// AI-powered Raw Extraction for the Add Speaker wizard.
//
// PRINCIPLE: AI never writes directly to the database. This module reads
// documents (PDF + product page) and produces a structured "raw extraction"
// — a list of facts, each with a value, source, and confidence.
//
// The raw extraction is NOT a database record. It feeds into the Review
// step, where a human promotes values into the SpeakerSpecification.
//
// Output structure:
//   {
//     model_name: "MP-150",
//     series: "",
//     fields: [
//       { field: "sensitivity_db", value: "92", unit: "dB",
//         source: "PDF Page 3", confidence: "A",
//         raw_text: "Sensitivity: 92 dB (2.83V/1m)" },
//       ...
//     ]
//   }
//
// Confidence levels:
//   A = Manufacturer Published (directly stated in the document)
//   B = Calculated (derived from stated values)
//   C = Estimated (inferred from context)
//   D = Engineering Estimate (not found, guessed)
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import { ALL_SPEC_FIELDS } from "./specFieldDefinitions.js";

/**
 * Build the LLM prompt for raw extraction.
 * Lists all spec fields the LLM should look for.
 */
function buildExtractionPrompt(manufacturerName, productUrl, pdfUrl) {
  const fieldList = ALL_SPEC_FIELDS
    .filter((f) => f.key !== "primary_source" && f.key !== "confidence" && f.key !== "evidence_quality" && f.key !== "last_verified")
    .map((f) => `  - ${f.key}: ${f.label}`)
    .join("\n");

  return `You are a professional acoustic engineering data extraction assistant.

TASK: Read the provided documents for a ${manufacturerName || "loudspeaker"} product and extract specification values.

PRODUCT URL: ${productUrl || "(not provided)"}
PDF URL: ${pdfUrl || "(not provided)"}

Extract the following specification fields. For EACH field you find:
1. Record the value exactly as stated (include units in the "unit" field)
2. Record the source: "PDF Page N" (if from the PDF), "Product Page" (if from the product page), or "Not Found"
3. Record the confidence:
   - A = directly stated in the document (Manufacturer Published)
   - B = calculated or derived from stated values
   - C = estimated or inferred from context
   - D = not found in the documents
4. Record the raw text snippet from the source document

Fields to extract:
${fieldList}

ALSO extract:
- model_name: the product model name/number
- series: the product series name (if any)

RULES:
- Only extract values that are ACTUALLY in the documents. Do NOT invent or guess.
- If a field is not found, set value to "" and confidence to "D".
- For numeric fields, extract the number only (e.g. "92" not "92 dB").
- For frequency response, extract low and high separately.
- For dimensions, extract in the unit stated (convert to mm if in inches, noting the conversion).
- For sensitivity, note the reference (1W/1m or 2.83V/1m) in the raw_text.

Return the extracted data as a JSON object.`;
}

/**
 * Run raw extraction using InvokeLLM.
 *
 * @param {object} params
 *   manufacturerName — string
 *   productUrl       — string (official product page URL)
 *   pdfUrl           — string (official PDF URL, optional)
 * @returns {object} raw extraction: { model_name, series, fields: [...] }
 */
export async function runRawExtraction({ manufacturerName, productUrl, pdfUrl }) {
  if (!productUrl && !pdfUrl) {
    throw new Error("At least one document URL is required for extraction.");
  }

  const prompt = buildExtractionPrompt(manufacturerName, productUrl, pdfUrl);

  const fileUrls = [];
  if (pdfUrl) fileUrls.push(pdfUrl);

  const response = await base44.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    file_urls: fileUrls.length > 0 ? fileUrls : undefined,
    response_json_schema: {
      type: "object",
      properties: {
        model_name: { type: "string" },
        series: { type: "string" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              value: { type: "string" },
              unit: { type: "string" },
              source: { type: "string" },
              confidence: { type: "string", enum: ["A", "B", "C", "D"] },
              raw_text: { type: "string" },
            },
            required: ["field", "value", "source", "confidence"],
          },
        },
      },
      required: ["fields"],
    },
  });

  // Normalize the response
  const fields = (response?.fields || []).map((f) => ({
    field: f.field || "",
    value: f.value || "",
    unit: f.unit || "",
    source: f.source || "Not Found",
    confidence: ["A", "B", "C", "D"].includes(f.confidence) ? f.confidence : "D",
    raw_text: f.raw_text || "",
  }));

  return {
    model_name: response?.model_name || "",
    series: response?.series || "",
    fields,
    extracted_at: new Date().toISOString(),
    documents_read: [
      pdfUrl ? "PDF" : null,
      productUrl ? "Product Page" : null,
    ].filter(Boolean),
  };
}

/**
 * Convert a raw extraction value to the correct type for a spec field.
 * (number fields → Number, boolean fields → boolean, etc.)
 */
export function coerceRawValue(rawValue, fieldType) {
  if (!rawValue || rawValue === "") return null;
  if (fieldType === "number") {
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : null;
  }
  if (fieldType === "boolean") {
    return rawValue === "true" || rawValue === "yes" || rawValue === "1";
  }
  return String(rawValue);
}

/**
 * Map a raw extraction source string to a field_authority source type.
 * "PDF Page 3" → "Official PDF"
 * "Product Page" → "Official Product Page"
 * "Not Found" → ""
 */
export function mapRawSourceToAuthority(rawSource) {
  if (!rawSource || rawSource === "Not Found") return "";
  if (/pdf/i.test(rawSource)) return "Official PDF";
  if (/product page/i.test(rawSource)) return "Official Product Page";
  if (/engineering/i.test(rawSource)) return "Engineering Document";
  if (/support/i.test(rawSource)) return "Support Article";
  return "Official PDF";
}