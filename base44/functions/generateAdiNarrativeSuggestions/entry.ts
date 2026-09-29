/**
 * generateAdiNarrativeSuggestions
 * --------------------------------
 * ADI narrative focus suggestions for the Client Brief step of the Proposal
 * Centre wizard.
 *
 * Reads the frozen Engineering Snapshot — the same calculated authority the
 * report itself is generated from — and returns 6 to 12 short, project-specific
 * chip labels the designer can click to append to the Client Brief.
 *
 * Suggestions guide narrative wording and emphasis ONLY. They never change an
 * engineering result, RP22 value, Design Index, table value or recommendation.
 * Nothing here calculates, grades or re-interprets a result.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildEngineeringEvidence } from '../../shared/engineeringSnapshotEvidence.js';

const FALLBACK_MESSAGE = 'Calculate the project to get ADI suggestions based on the design.';

const SUGGESTIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['label', 'reason'],
      },
    },
  },
  required: ['suggestions'],
};

const REPORT_TYPE_LABELS = {
  single: 'a proposal for one design version',
  comparison: 'a comparison report covering more than one design version',
  system_summary: 'a System Design Summary',
};

function buildPrompt({ evidence, proposalType, versionCount, projectName }) {
  return [
    evidence,
    '',
    '=== TASK ===',
    `You are the Artcoustic Design Intelligence (ADI) assistant inside Sound Proof, helping a cinema designer brief ${REPORT_TYPE_LABELS[proposalType] || 'a client-facing design report'}${projectName ? ` for ${projectName}` : ''}.`,
    versionCount > 1
      ? `This report covers ${versionCount} design versions, so explain differences between versions where the data supports it.`
      : '',
    '',
    'Suggest narrative focus points for the Client Brief. The brief shapes the wording, emphasis and structure of the client report only. It never changes an engineering result.',
    '',
    'Return 6 to 12 suggestions. Each suggestion is one short chip label (4 to 9 words, starting with a verb such as Highlight, Explain, Emphasise, Mention, Show or Suggest) plus a short reason naming the calculated fact it relies on.',
    '',
    'Look at what the calculated data above actually shows: system layout, screen size and viewing angle, RP23, seats and rows, room size and compactness, channel count (P2), surround spacing (P5), front wides (P7), overhead spacing (P9), Dynamic Range (P12, P13, P14), timbre (P16, P17), bass (P18, P19, P20), the primary, secondary and all-seat Design Index, the strongest and weakest parameters, and whether the design is simple, mid-level or high performance.',
    '',
    'RULES:',
    '- Every chip must be supported by a fact in the calculated data above. Never invent a result, value, level or seat count.',
    '- Only name a level (for example Level 4) when that exact level appears in the data for that parameter. Never suggest a level the design cannot reach.',
    '- Never describe the design as state-of-the-art, reference or flawless unless the data shows the top levels across the pillars.',
    '- Only suggest upgrades the designer could genuinely add: more overhead channels, more subwoofers, additional surround positions, pre-wiring for future channels, or acoustic treatment. Never suggest something the project facts contradict.',
    '- Mention cost only when the data shows a choice to make, or when the report compares versions. If a saving would reduce performance against the design target, present it as a compromise, never as a free win.',
    '- Where the data shows a weak or limiting area, prefer a chip that explains it honestly.',
    '- For bass, cover seat-to-seat consistency and control, not output alone, whenever P20 or the seat spread is present.',
    '- Plain, client-report useful language. No marketing language.',
    '- Never output generic labels or anything like: Dynamic impact, Dialogue clarity, Family friendly, Music performance, Future upgrade path, Interior design, Acoustic treatment benefits.',
  ].filter(Boolean).join('\n');
}

function normaliseSuggestions(raw) {
  const list = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const label = String(item?.label || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, reason: String(item?.reason || '').trim() });
    if (out.length >= 12) break;
  }
  return out;
}

function unavailable() {
  return Response.json({ available: false, suggestions: [], message: FALLBACK_MESSAGE });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const snapshot = body?.engineering_snapshot || null;

    // No calculated result for the selected version — the wizard shows its
    // generic examples instead, so there is nothing to generate.
    if (!snapshot || snapshot.available !== true) return unavailable();

    const evidence = buildEngineeringEvidence(snapshot);
    if (!evidence) return unavailable();

    const prompt = buildPrompt({
      evidence,
      proposalType: body?.proposal_type,
      versionCount: Array.isArray(body?.selected_version_ids)
        ? body.selected_version_ids.length
        : 1,
      projectName: snapshot?.project?.name || null,
    });

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: SUGGESTIONS_JSON_SCHEMA,
    });

    const suggestions = normaliseSuggestions(result);
    if (suggestions.length === 0) return unavailable();

    return Response.json({ available: true, suggestions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}