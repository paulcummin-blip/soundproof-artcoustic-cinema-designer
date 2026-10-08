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

import { NEUTRAL_VOICE_RULES } from './reportWritingStyleContract.js';
import { buildExcludedParameterPolicy, buildClientFacingParameterRule } from './clientFacingParameterAuthority.js';
import { isHighChannelDensityLayout } from './highChannelDensityRule.js';
import { SOUND_PROOF_WRITING_AUTHORITY } from './soundProofWritingAuthority.js';
import { summariseSubwooferConfiguration } from './subwooferConfigurationSummary.js';

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

function formatBassSeatResults(perSeat) {
  return Object.entries(perSeat || {})
    .map(([seatId, seat]) => {
      // P19/P20 deviation handed to the writer is a whole number, rounded down,
      // so a decimal can never reappear in the client-facing summary.
      const raw = Number.isFinite(Number(seat?.value))
        ? `, ±${Math.floor(Math.abs(Number(seat.value)))} dB`
        : "";
      return `${seatId}: ${seat?.level || "—"}${raw}`;
    })
    .join("; ");
}

/**
 * The supplied assumptions, or '' when the policy excludes them.
 *
 * Assumed / administrative parameters (P15, P21) add noise to a client-facing
 * summary and are not decision points, so they are reported only when the
 * designer explicitly asked about one of them, and always labelled as assumed.
 */
function formatAssumptions(assumptions, policy) {
  const resolved = policy || buildExcludedParameterPolicy();
  if (!resolved.allows('P15') && !resolved.allows('P21')) return '';
  const p15 = assumptions?.p15 || {};
  const p21 = assumptions.p21 || {};
  const p15Status = p15.status || "Assumed";
  const p21Status = p21.status || "Assumed";
  const p15Detail = p15.value ? `, ${p15.value}` : "";
  const p21Detail = p21Status === "Measured"
    ? (p21.value ? `, ${p21.value}` : "")
    : `; ${p21.note || "early reflections have not been measured."}`;
  return [
    `P15 Background noise floor: ${p15Status} ${p15.level || "L2"}${p15Detail}`,
    `P21 Early reflections: ${p21Status} ${p21.level || "L2"}${p21Detail}`,
  ].join("\n");
}

function formatBass(bass) {
  if (!bass) return "Not available";
  const parts = [];
  if (bass.p14) parts.push(`P14 LFE capability (Dynamic Range): ${bass.p14.level}`);
  if (bass.p18) parts.push(`P18 bass extension (Timbre Matching): ${bass.p18.level}`);
  if (bass.p19) {
    parts.push(`P19 response vs target at the reference seating position (Timbre Matching): ${bass.p19.level}`);
  }
  if (bass.p20) {
    parts.push(`P20 seat-to-seat consistency (Timbre Matching) — Primary floor: ${bass.p20.primaryFloor || "—"}; Secondary floor: ${bass.p20.secondaryFloor || "—"}`);
    const seats = formatBassSeatResults(bass.p20.perSeat);
    if (seats) parts.push(`P20 canonical per-seat results: ${seats}`);
  }
  return parts.join("\n") || "Not available";
}

/**
 * Build the prompt for a single-design client summary.
 * @param {Object} payload - From buildAiSummaryPayload
 * @returns {string}
 */
/**
 * The subwoofer configuration as one statement: "2 × SUB4-12 · 1 front / 1 rear
 * layout". Read from the payload's own subwoofer instances, so the prompt states
 * the same count and layout the example chips state.
 */
function formatSubwoofers(system) {
  const summary = summariseSubwooferConfiguration(system);
  if (summary.humanReadableSummary) return summary.humanReadableSummary;
  const count = system?.subwooferCount || 0;
  return `${count} (${(system?.subwooferModels || []).join(", ") || "—"})`;
}

/**
 * The Parameter 2 / spacing rule for a high-channel-count design, or '' when the
 * rule does not apply.
 *
 * A 9.x.6 design is already at the top RP22 level for P2, so the summary states
 * that and moves on: it never presents the layout as a room-geometry limitation,
 * never offers more channels, and never raises processor or AV amplifier channel
 * capability or cost. Every payload in the set must be high density.
 */
export function buildHighChannelSummaryRule(payloads) {
  const list = (Array.isArray(payloads) ? payloads : [payloads]).filter(Boolean);
  if (list.length === 0) return '';
  const allHighDensity = list.every((payload) => isHighChannelDensityLayout({
    configuration: payload?.system?.dolbyLayout || null,
    channelCount: payload?.system?.totalDiscreteChannels ?? payload?.system?.channelCount ?? null,
  }));
  if (!allHighDensity) return '';
  return [
    'HIGH-CHANNEL-DENSITY RULE (applies to this summary):',
    '- Parameter 2 (decoder/renderer capability and the number of discretely rendered speakers, excluding subwoofers) is already at the top RP22 level for this layout: state it as achieved and move on. Never present it as limited or as a constraint.',
    '- P5, P7, P9 and P10 are speaker-position and seat-geometry results. Where one of those is limited, say that the practical speaker positions and the seat geometry set the result. Never attribute it to the channel count.',
    '- Never present this layout as constrained by the room geometry, never suggest adding speakers or channels, and never mention AV processor or amplifier channel capability or cost.',
  ].join('\n');
}

export function buildSingleSummaryPrompt(payload) {
  const { identity, project, system, categoryFloors, parameters, bass, assumptions, viewing } = payload || {};
  const parameterPolicy = buildExcludedParameterPolicy({ clientBrief: payload?.clientBrief || payload?.project?.clientBrief || '' });
  const assumptionsBlock = formatAssumptions(assumptions, parameterPolicy);

  return `You are a professional home cinema design engineer writing a client-facing performance summary for a cinema design project. The summary must be factual, professional, and based ONLY on the engineering data provided below. Do not editorialise beyond the evidence.

WRITING RULES (strict):
- Use factual, professional language.
${SOUND_PROOF_WRITING_AUTHORITY}
${NEUTRAL_VOICE_RULES}
- Do NOT use these words: ${FORBIDDEN_WORDS.join(", ")}.
- Structure the summary around the three RP22 performance areas: Spatial Resolution, Dynamic Range, Timbre Matching.
${buildHighChannelSummaryRule(payload)}
- Do NOT produce a parameter-by-parameter dump. Explain what the design does well, where performance varies by seat, what trade-offs exist, and what is materially different between Primary and Secondary seats.
- Do not invent design constraints that are not in the project data.
- Do not invent missing values.
- Copy every L1/L2/L3/L4/FAIL result exactly. Never regrade, round, reinterpret, or replace a category floor with a parameter floor.
- Never state an internal score, index or percentage. Sound Proof scores and the Design Index are internal only, they are not a percentage, and they never appear in client-facing text.
- RP22 category floors are the sole authority for the Spatial Resolution, Dynamic Range, and Timbre Matching section headings and highlights table.
- P14 is Dynamic Range. P18, P19, and P20 are Timbre Matching. Never describe P19 or P20 as Dynamic Range.
- P20 is seat-to-seat bass consistency. If P20 is L1 or FAIL, state that consistency varies materially across seats; never call the bass response consistent, stable, uniform, or standardized across the room.
- Keep engineering claims tied to a supplied value. If evidence is unavailable, omit the claim.
- ${buildClientFacingParameterRule(parameterPolicy)}

PROJECT DATA:
- Project: ${project?.name || "—"}
- Client: ${project?.clientName || "—"}
- Version: ${project?.versionName || "—"}
- Room: ${project?.roomDimensions?.widthM || "—"}m × ${project?.roomDimensions?.lengthM || "—"}m × ${project?.roomDimensions?.heightM || "—"}m

RP22 CATEGORY FLOORS:
- Primary: ${formatCategoryFloors(categoryFloors?.primary)}
- Secondary: ${formatCategoryFloors(categoryFloors?.secondary)}

BASS (when authoritative):
${formatBass(bass)}

${assumptionsBlock ? `DESIGN ASSUMPTIONS (designer-requested only):\n${assumptionsBlock}` : ''}

VIEWING:
${viewing ? `${viewing.summary || "Calculated"} (Primary: ${viewing.primaryFloor || "—"}, Secondary: ${viewing.secondaryFloor || "—"})` : "Not calculated"}

PRODUCE THE FOLLOWING STRUCTURE:
A. A short opening overview (2-3 sentences) describing the design and its overall performance level.
B. Spatial Resolution section (1-2 paragraphs) explaining spatial accuracy and how it varies by seat.
C. Dynamic Range section (1-2 paragraphs) explaining dynamic capability and headroom.
D. Timbre Matching section (1-2 paragraphs) explaining tonal consistency across seats.
E. A concise highlights table in this format:
| Area | Primary | Secondary | Key point |
Use the category floor levels. Keep key points factual.
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
  const parameterPolicy = buildExcludedParameterPolicy({
    clientBrief: [payloads?.[0]?.clientBrief, payloads?.[0]?.project?.clientBrief].filter(Boolean).join('\n'),
  });
  const versionData = (payloads || []).map((payload, i) => {
    const label = (versionLabels || [])[i] || `Version ${i + 1}`;
    const assumptionsText = formatAssumptions(payload?.assumptions, parameterPolicy);
    return `VERSION: ${label}
- Project: ${payload?.project?.name || "—"}
- Category Floors Primary: ${formatCategoryFloors(payload?.categoryFloors?.primary)}
- Category Floors Secondary: ${formatCategoryFloors(payload?.categoryFloors?.secondary)}
- Bass: ${formatBass(payload?.bass)}
    ${assumptionsText ? `- Design assumptions (designer-requested only): ${assumptionsText}\n` : ''}- Subwoofers: ${formatSubwoofers(payload?.system)}
- Screen: ${payload?.system?.screen?.size || "—"}" ${payload?.system?.screen?.aspectRatio || ""}
- Viewing: ${payload?.viewing?.summary || "Not calculated"}`;
  }).join("\n\n");

  const labels = (versionLabels || []).join(" | ") || "Version A | Version B";

  return `You are a professional home cinema design engineer writing a client-facing comparison summary for multiple cinema design versions of the SAME project. The summary must be factual, professional, and based ONLY on the engineering data provided below.

WRITING RULES (strict):
- Use factual, professional language.
${SOUND_PROOF_WRITING_AUTHORITY}
${NEUTRAL_VOICE_RULES}
- Do NOT use these words: ${FORBIDDEN_WORDS.join(", ")}.
- Do NOT simply choose a "winner". Explain factual differences and the benefit/trade-off of the higher specified version where supported by the data.
- Structure the comparison around: Spatial Resolution, Dynamic Range, Timbre Matching.
- Also compare: speaker products, subwoofer configuration, screen/viewing result, authoritative bass result. Where every version shares the same channel layout, state that layout as a shared strength rather than as a difference.
${buildHighChannelSummaryRule(payloads)}
- Do not invent missing values.
- Copy every L1/L2/L3/L4/FAIL result exactly. Never regrade, round, reinterpret, or replace a category floor with a parameter floor.
- Never state an internal score, index or percentage. Sound Proof scores and the Design Index are internal only, they are not a percentage, and they never appear in client-facing text.
- RP22 category floors are the sole authority for the Spatial Resolution, Dynamic Range, and Timbre Matching comparison rows.
- P14 is Dynamic Range. P18, P19, and P20 are Timbre Matching. Never describe P19 or P20 as Dynamic Range.
- If P20 is L1 or FAIL, describe material seat-to-seat bass variation; never call the bass response consistent, stable, uniform, or standardized across the room.
- ${buildClientFacingParameterRule(parameterPolicy)}

VERSION DATA:
${versionData}

PRODUCE THE FOLLOWING STRUCTURE:
A. Project/version identification (1-2 sentences).
B. A prominent comparison table:
| Area | ${labels} | Difference |
Use the category floor levels and bass results. Keep differences factual.
C. Spatial Resolution comparison section (1-2 paragraphs).
D. Dynamic Range comparison section (1-2 paragraphs).
E. Timbre Matching comparison section (1-2 paragraphs).
F. A concise conclusion describing the factual differences between versions without scoring or ranking them as "best".

Output the summary as clean text with markdown headings. Do not include internal parameter codes in the client-facing text.`;
}