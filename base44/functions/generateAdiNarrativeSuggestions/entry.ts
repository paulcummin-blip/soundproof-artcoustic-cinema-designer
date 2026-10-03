/**
 * generateAdiNarrativeSuggestions
 * --------------------------------
 * ADI narrative focus suggestions for the Client Brief step of the Proposal
 * Centre wizard.
 *
 * Every example is grounded in the frozen Engineering Snapshot — the same
 * calculated authority the report itself is generated from:
 *
 *   1. The deterministic examples are assembled in code from the snapshot
 *      (screen size, channel layout, channel count, calculated results).
 *   2. The model supplies only additional suggestions, and each one is checked
 *      against that same snapshot before it is returned. A chip whose number
 *      does not match this version — a screen size the project does not have, a
 *      level a result did not achieve, an invented channel count, dB or Hz —
 *      is rewritten without the number or dropped, and never reaches the
 *      designer.
 *
 * Suggestions guide narrative wording and emphasis ONLY. Nothing here
 * calculates, grades or re-interprets a result.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildEngineeringEvidence } from '../../shared/engineeringSnapshotEvidence.js';
import { buildAuthorityChips, resolveNarrativeChips } from '../../shared/adiNarrativeAuthority.js';
import { buildNarrativeFacts, buildNarrativeFactsBlock } from '../../shared/adiNarrativeFacts.js';

const FALLBACK_MESSAGE = 'Calculate the project to get examples powered by Artcoustic Design Intelligence.';

/** How many additional suggestions the model may contribute. */
const MAX_AI_SUGGESTIONS = 8;

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
  single: 'a client-facing report for one design version',
  comparison: 'a System Design Comparison covering two or more design versions',
  system_summary: 'a System Design Summary covering one design version',
};

function buildPrompt({ evidence, factsBlock, authorityChips, proposalType, versionCount, projectName }) {
  return [
    evidence,
    '',
    factsBlock,
    '',
    '=== ALREADY INCLUDED (never repeat or reword these) ===',
    ...authorityChips.map((chip) => `- ${chip.label}`),
    '',
    '=== TASK ===',
    `You are the Artcoustic Design Intelligence (ADI) assistant inside Sound Proof, helping a cinema designer brief ${REPORT_TYPE_LABELS[proposalType] || 'a client-facing design report'}${projectName ? ` for ${projectName}` : ''}.`,
    versionCount > 1
      ? `This report covers ${versionCount} design versions, so explain differences between versions where the data supports it.`
      : '',
    '',
    `Suggest narrative focus points for the Client Brief, and do not repeat the examples already listed above. The brief shapes the wording, emphasis and structure of the client report only. It never changes an engineering result.`,
    '',
    `Return up to ${MAX_AI_SUGGESTIONS} suggestions. Each suggestion is one short chip label (4 to 9 words, starting with a verb such as Highlight, Explain, Emphasise, Mention, Show or Suggest) plus a short reason naming the calculated fact it relies on.`,
    '',
    'Look at what the calculated data above actually shows: system layout, screen size and viewing angle, RP23, seats and rows, room size and compactness, channel count (P2), surround spacing (P5), front wides (P7), overhead spacing (P9), Dynamic Range (P12, P13, P14), timbre (P16, P17), bass (P18, P19, P20), the strongest and weakest parameters, and whether the design is simple, mid-level or high performance.',
    '',
    'RULES:',
    '- State only values that appear in THIS PROJECT VERSION above. Never write a number that is not in that block.',
    '- Every number is checked against the project data before the designer sees the chip: a screen size, level, channel count, subwoofer count, dB, Hz or angle figure that does not match this version is discarded.',
    '- If a fact is not in that block, write the point without a number (for example, the screen scale and viewing geometry) instead of guessing a value.',
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
    if (out.length >= MAX_AI_SUGGESTIONS) break;
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

    // The facts behind every example: read from the snapshot the report itself
    // is built from, for the selected version only.
    const facts = buildNarrativeFacts(snapshot);
    if (!facts.available) return unavailable();

    // The deterministic examples are assembled in code from those facts. They
    // are never written by the model.
    const authorityChips = buildAuthorityChips(facts);

    // ADI adds to them. A failure here never costs the designer the grounded
    // examples, so the model call is isolated.
    let aiChips = [];
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt({
          evidence: buildEngineeringEvidence(snapshot),
          factsBlock: buildNarrativeFactsBlock(facts),
          authorityChips,
          proposalType: body?.proposal_type,
          versionCount: Array.isArray(body?.selected_version_ids)
            ? body.selected_version_ids.length
            : 1,
          projectName: snapshot?.project?.name || null,
        }),
        response_json_schema: SUGGESTIONS_JSON_SCHEMA,
      });
      aiChips = normaliseSuggestions(result);
    } catch (error) {
      console.error('[generateAdiNarrativeSuggestions] ADI suggestions unavailable, grounded examples only:', error?.message);
    }

    // Validate every chip against the same snapshot before it is returned.
    const { suggestions, diagnostics } = resolveNarrativeChips({ aiChips, facts });
    if (suggestions.length === 0) return unavailable();

    // Diagnostics trail for every chip: text, source fields, source values and
    // whether it passed, was rewritten, or was rejected.
    for (const entry of diagnostics) {
      console.log('[ADI narrative chip]', JSON.stringify(entry));
    }

    return Response.json({ available: true, suggestions, diagnostics });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}