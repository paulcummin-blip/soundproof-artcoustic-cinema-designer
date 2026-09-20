/**
 * aiSummaryPromptBuilder.js (shared)
 * ---------------------------------
 * Builds the LLM prompt for AI Client Summary generation from the canonical
 * payload produced by buildAiSummaryPayload.js (frontend).
 *
 * Shared between the generateAiSummary backend function and tests.
 *
 * Writing rules enforced in the prompt:
 *   - Client-facing language
 *   - Three RP22 performance areas: Spatial Resolution, Dynamic Range, Timbre Matching
 *   - No parameter-by-parameter dump
 *   - Explain what the design does well, where performance varies by seat,
 *     trade-offs, Primary vs Secondary differences
 *   - No editorialising beyond evidence
 *   - Avoid: "poor", "bad", "needs improvement", "should upgrade",
 *     "further refinement recommended"
 *   - Factual language
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

const FORBIDDEN_WORDS = [
  "poor", "bad", "needs improvement", "should upgrade",
  "further refinement recommended",
];

function formatCategoryFloors(floors) {
  if (!Array.isArray(floors) || !floors.length) return "Not available";
  return floors
    .map((cat) => `${cat.name}: ${cat.floorLevel || "—"}`)
    .join("; ");
}

function formatBass(bass) {
  if (!bass) return "Not available";
  const parts = [];
  if (bass.p14) parts.push(`P14: ${bass.p14.level}`);
  if (bass.p18) parts.push(`P18: ${bass.p18.level}`);
  if (bass.p19) {
    parts.push(`P19 Primary floor: ${bass.p19.primaryFloor || "—"}`);
    parts.push(`P19 Secondary floor: ${bass.p19.secondaryFloor || "—"}`);
    const seatCount = Object.keys(bass.p19.perSeat || {}).length;
    if (seatCount) parts.push(`P19 per-seat results: ${seatCount} seats`);
  }
  if (bass.p20) {
    parts.push(`P20 Primary floor: ${bass.p20.primaryFloor || "—"}`);
    parts.push(`P20 Secondary floor: ${bass.p20.secondaryFloor || "—"}`);
    const seatCount = Object.keys(bass.p20.perSeat || {}).length;
    if (seatCount) parts.push(`P20 per-seat results: ${seatCount} seats`);
  }
  return parts.join("\n") || "Not available";
}

/**
 * Build the prompt for a single-design client summary.
 * @param {Object} payload - From buildAiSummaryPayload
 * @returns {string}
 */
export function buildSingleSummaryPrompt(payload) {
  const { identity, project, system, designRating, categoryFloors, parameters, bass, viewing } = payload || {};

  return `You are a professional home cinema design engineer writing a client-facing performance summary for a cinema design project. The summary must be factual, professional, and based ONLY on the engineering data provided below. Do not editorialise beyond the evidence.

WRITING RULES (strict):
- Use factual, professional language.
- Do NOT use these words: ${FORBIDDEN_WORDS.join(", ")}.
- Structure the summary around the three RP22 performance areas: Spatial Resolution, Dynamic Range, Timbre Matching.
- Do NOT produce a parameter-by-parameter dump. Explain what the design does well, where performance varies by seat, what trade-offs exist, and what is materially different between Primary and Secondary seats.
- Do not invent design constraints that are not in the project data.
- Do not invent missing values.

PROJECT DATA:
- Project: ${project?.name || "—"}
- Client: ${project?.clientName || "—"}
- Version: ${project?.versionName || "—"}
- Room: ${project?.roomDimensions?.widthM || "—"}m × ${project?.roomDimensions?.lengthM || "—"}m × ${project?.roomDimensions?.heightM || "—"}m

DESIGN RATING (Design Performance Index):
- Primary seats: ${designRating?.primary ?? "—"}
- Secondary seats: ${designRating?.secondary ?? "—"}
- All seats: ${designRating?.all ?? "—"}

RP22 CATEGORY FLOORS:
- Primary: ${formatCategoryFloors(categoryFloors?.primary)}
- Secondary: ${formatCategoryFloors(categoryFloors?.secondary)}

BASS (when authoritative):
${formatBass(bass)}

VIEWING:
${viewing ? `${viewing.summary || "Calculated"} (Primary: ${viewing.primaryFloor || "—"}, Secondary: ${viewing.secondaryFloor || "—"})` : "Not calculated"}

PRODUCE THE FOLLOWING STRUCTURE:
A. A short opening overview (2-3 sentences) describing the design and its overall performance level.
B. Spatial Resolution section (1-2 paragraphs) explaining spatial accuracy and how it varies by seat.
C. Dynamic Range section (1-2 paragraphs) explaining dynamic capability and headroom.
D. Timbre Matching section (1-2 paragraphs) explaining tonal consistency across seats.
E. A concise highlights table in this format:
| Area | Primary | Secondary | Key point |
Use the category floor levels and DPI scores. Keep key points factual.
F. If relevant, a brief factual considerations section noting any material differences between Primary and Secondary seats. Do not invent constraints.

Output the summary as clean text with markdown headings (## for sections, ### for the table title). Do not include internal parameter codes in the client-facing text — translate them to plain English descriptions.`;
}

/**
 * Build the prompt for a comparison client summary.
 * @param {Object} params
 * @param {Array} params.payloads - Array of payloads (one per version)
 * @param {Array} params.versionLabels - Array of version labels
 * @returns {string}
 */
export function buildComparisonSummaryPrompt({ payloads, versionLabels }) {
  const versionData = (payloads || []).map((payload, i) => {
    const label = (versionLabels || [])[i] || `Version ${i + 1}`;
    return `VERSION: ${label}
- Project: ${payload?.project?.name || "—"}
- DPI Primary: ${payload?.designRating?.primary ?? "—"} / Secondary: ${payload?.designRating?.secondary ?? "—"} / All: ${payload?.designRating?.all ?? "—"}
- Category Floors Primary: ${formatCategoryFloors(payload?.categoryFloors?.primary)}
- Category Floors Secondary: ${formatCategoryFloors(payload?.categoryFloors?.secondary)}
- Bass: ${formatBass(payload?.bass)}
- Subwoofers: ${payload?.system?.subwooferCount || 0} (${(payload?.system?.subwooferModels || []).join(", ") || "—"})
- Screen: ${payload?.system?.screen?.size || "—"}" ${payload?.system?.screen?.aspectRatio || ""}
- Viewing: ${payload?.viewing?.summary || "Not calculated"}`;
  }).join("\n\n");

  const labels = (versionLabels || []).join(" | ") || "Version A | Version B";

  return `You are a professional home cinema design engineer writing a client-facing comparison summary for multiple cinema design versions of the SAME project. The summary must be factual, professional, and based ONLY on the engineering data provided below.

WRITING RULES (strict):
- Use factual, professional language.
- Do NOT use these words: ${FORBIDDEN_WORDS.join(", ")}.
- Do NOT simply choose a "winner". Explain factual differences and the benefit/trade-off of the higher specified version where supported by the data.
- Structure the comparison around: Spatial Resolution, Dynamic Range, Timbre Matching.
- Also compare: speaker products, channel count, subwoofer configuration, screen/viewing result, authoritative bass result.
- Do not invent missing values.

VERSION DATA:
${versionData}

PRODUCE THE FOLLOWING STRUCTURE:
A. Project/version identification (1-2 sentences).
B. A prominent comparison table:
| Area | ${labels} | Difference |
Use the DPI scores, category floor levels, and bass results. Keep differences factual.
C. Spatial Resolution comparison section (1-2 paragraphs).
D. Dynamic Range comparison section (1-2 paragraphs).
E. Timbre Matching comparison section (1-2 paragraphs).
F. A concise conclusion describing the factual differences between versions without scoring or ranking them as "best".

Output the summary as clean text with markdown headings. Do not include internal parameter codes in the client-facing text.`;
}