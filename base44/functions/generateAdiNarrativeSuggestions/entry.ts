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
import { buildComparisonAuthorityChips, resolveComparisonNarrativeChips } from '../../shared/adiComparisonNarrativeChips.js';
import { buildNarrativeFacts, buildNarrativeFactsBlock } from '../../shared/adiNarrativeFacts.js';
import { resolveReportLayout } from '../../shared/highChannelDensityRule.js';

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

function buildPrompt({ evidence, factsBlock, authorityChips, proposalType, versionCount, projectName, highDensity }) {
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
    highDensity
      ? '- This design already uses a high channel count (9.1.6, or 15 or more discrete channels), so never suggest more speakers, more channels, more overhead positions, additional surround positions or improved horizontal spacing, and never offer any of them as a future upgrade. Where the spacing result is limited, suggest explaining it as a room and layout constraint instead.'
      : '- Only suggest upgrades the designer could genuinely add: more overhead channels, more subwoofers, additional surround positions, pre-wiring for future channels, or acoustic treatment. Never suggest something the project facts contradict.',
    highDensity
      ? '- Never write "if greater precision in the side-to-side soundstage is required in the future", and never suggest closing the gaps between the surround channels.'
      : '',
    '- Mention cost only when the data shows a choice to make, or when the report compares versions. If a saving would reduce performance against the design target, present it as a compromise, never as a free win.',
    '- Where the data shows a weak or limiting area, prefer a chip that explains it honestly.',
    '- For bass, cover seat-to-seat consistency and control, not output alone, whenever P20 or the seat spread is present.',
    '- Plain, client-report useful language. No marketing language.',
    '- Never output generic labels or anything like: Dynamic impact, Dialogue clarity, Family friendly, Music performance, Future upgrade path, Interior design, Acoustic treatment benefits.',
  ].filter(Boolean).join('\n');
}

/**
 * The comparison brief: every selected version's own frozen evidence, and the
 * rule that a suggestion is about the versions together — never one version's
 * fact presented as though it applied to the whole comparison.
 */
function buildComparisonPrompt({ versions, authorityChips, projectName }) {
  const names = versions.map((entry, index) => entry.version_name || entry.version_id || `Version ${index + 1}`);
  const blocks = versions.map((entry, index) => [
    `=== VERSION: ${names[index]} ===`,
    buildEngineeringEvidence(entry.snapshot),
    '',
    buildNarrativeFactsBlock(entry.facts),
  ].join('\n'));

  const highDensityEverywhere = versions.every(
    (entry) => resolveReportLayout(entry.snapshot).highDensity,
  );

  return [
    blocks.join('\n\n'),
    '',
    '=== ALREADY INCLUDED (never repeat or reword these) ===',
    ...authorityChips.map((chip) => `- ${chip.label}`),
    '',
    '=== TASK ===',
    `You are the Artcoustic Design Intelligence (ADI) assistant inside Sound Proof, helping a cinema designer brief a System Design Comparison${projectName ? ` for ${projectName}` : ''} covering ${versions.length} design versions: ${names.join(', ')}.`,
    '',
    'Suggest narrative focus points for the Client Brief, and do not repeat the examples already listed above. The brief shapes the wording, emphasis and structure of the report only. It never changes an engineering result.',
    '',
    `Return up to ${MAX_AI_SUGGESTIONS} suggestions. Each suggestion is one short chip label (4 to 9 words, starting with Compare, Explain, Highlight, Emphasise, Mention, Show or Suggest) plus a short reason naming the calculated facts it relies on.`,
    '',
    'This is a comparison, so every suggestion must be about the selected versions together.',
    '',
    'RULES:',
    '- Every suggestion must compare the selected versions, or state a fact that is true of EVERY selected version. Never write a suggestion that states one version\'s fact as though it applied to the whole comparison.',
    '- Prefer the areas the comparison is built on: dynamic range, bass layout, spatial resolution, speaker layout, screen and seating experience, viewing experience, system scale, upgrade benefits, which system is stronger.',
    `- Name a version only by its exact saved name (${names.join(', ')}).`,
    '- State only values that appear in the version blocks above. Every number is checked against every selected version before the designer sees the chip.',
    '- A value belonging to one selected version may appear only in a comparison with another version\'s value. A suggestion that states one version\'s figure as the single fact of the report is discarded.',
    '- A fact stated without comparison wording must hold in every selected version, or it is discarded.',
    '- Never invent a difference between versions. Where the versions match on an area, say that they match instead of inventing a change.',
    '- Never suggest a screen size, level, layout, seat count, subwoofer count, dB or Hz figure that is not in the version blocks above.',
    '- Where the data shows a weak or limiting area in one version, prefer a chip that explains it honestly as a difference between the options.',
    highDensityEverywhere
      ? '- Every selected version already uses a high channel count (9.1.6, or 15 or more discrete channels), so never suggest more speakers, more channels, more overhead positions, additional surround positions or improved horizontal spacing, and never offer any of them as a future upgrade.'
      : '- Only suggest upgrades the designer could genuinely add. Never suggest something the version facts contradict.',
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

    // ── Comparison mode ──
    // Two or more selected versions arrive with their own frozen snapshot, so
    // every example is built and checked against all of them. One version's
    // facts are never offered as though they applied to the whole comparison.
    const versionEntries = (Array.isArray(body?.version_snapshots) ? body.version_snapshots : [])
      .filter((entry) => entry?.snapshot?.available === true)
      .map((entry) => ({
        version_id: entry?.version_id || null,
        version_name: entry?.version_name || null,
        snapshot: entry.snapshot,
        facts: buildNarrativeFacts(entry.snapshot),
      }))
      .filter((entry) => entry.facts.available);

    if (versionEntries.length >= 2) {
      const authorityChips = buildComparisonAuthorityChips(versionEntries);

      let comparisonAiChips = [];
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: buildComparisonPrompt({
            versions: versionEntries,
            authorityChips,
            projectName: versionEntries[0]?.snapshot?.project?.name || snapshot?.project?.name || null,
          }),
          response_json_schema: SUGGESTIONS_JSON_SCHEMA,
        });
        comparisonAiChips = normaliseSuggestions(result);
      } catch (error) {
        console.error('[generateAdiNarrativeSuggestions] ADI comparison suggestions unavailable, grounded examples only:', error?.message);
      }

      const { suggestions, diagnostics } = resolveComparisonNarrativeChips({
        aiChips: comparisonAiChips,
        versions: versionEntries,
      });
      if (suggestions.length === 0) return unavailable();

      for (const entry of diagnostics) {
        console.log('[ADI narrative chip]', JSON.stringify(entry));
      }

      return Response.json({ available: true, mode: 'comparison', suggestions, diagnostics });
    }

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
          highDensity: resolveReportLayout(snapshot).highDensity,
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