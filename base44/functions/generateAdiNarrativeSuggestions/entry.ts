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
 *
 * A suggestion may ask the report to explain a design DECISION only where the
 * reasoning behind it is recorded — in the saved design interpretation, or in the
 * designer's own brief and notes. Where only the calculated result exists, the example
 * asks for the result and what it means for the room, and where an important decision
 * has no recorded reasoning at all ADI offers the designer a short optional question
 * about it instead of implying an answer.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildEngineeringEvidence } from '../../shared/engineeringSnapshotEvidence.js';
import { buildAuthorityChips, resolveNarrativeChips } from '../../shared/adiNarrativeAuthority.js';
import { buildComparisonAuthorityChips, resolveComparisonNarrativeChips } from '../../shared/adiComparisonNarrativeChips.js';
import { buildClarificationQuestions } from '../../shared/proposalClarification/adiClarificationQuestions.js';
import { verifiedInterpretation } from '../../shared/proposalClarification/verifiedInterpretation.js';
import { buildDisplayLanguageRule, buildNarrativeFacts, buildNarrativeFactsBlock } from '../../shared/adiNarrativeFacts.js';
import { resolveReportLayout } from '../../shared/highChannelDensityRule.js';
import {
  buildClientFacingParameterRule,
  buildExcludedParameterPolicy,
} from '../../shared/clientFacingParameterAuthority.js';

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

/**
 * The recorded design reasoning for these versions: the verified interpretation the
 * reports were written against, read from the saved proposals for this project. A
 * version with no saved interpretation has no documented reasoning, and ADI then
 * suggests only what the calculated results establish — never an explanation Sound
 * Proof does not hold.
 */
/**
 * The recorded design interpretations for these versions, read from the saved
 * proposals for this project. Each one is kept with the versions it was written
 * for, so it can only ever be verified against the frozen report it describes.
 */
async function readRecordedInterpretations(base44, projectId, versionIds = []) {
  if (!projectId) return [];
  try {
    const result = await base44.entities.Proposal.filter(
      { project_id: projectId },
      { sort: '-created_date', limit: 10 },
    );
    const proposals = Array.isArray(result) ? result : (result?.items || []);
    const wanted = new Set((versionIds || []).filter(Boolean));
    // An interpretation that cannot be attributed to a selected version is not
    // read at all: reasoning from another version or another design never reaches
    // a suggestion or a question.
    if (wanted.size === 0) return [];
    const out = [];
    for (const proposal of proposals) {
      const ids = [
        proposal?.version_id || null,
        ...(Array.isArray(proposal?.selected_version_ids) ? proposal.selected_version_ids : []),
      ].filter(Boolean);
      if (ids.length === 0 || !ids.some((id) => wanted.has(id))) continue;
      const interpretation = proposal?.metadata?.project_interpretation;
      if (!interpretation) continue;
      out.push({ proposal_id: proposal.id, version_ids: ids, interpretation });
    }
    return out;
  } catch (error) {
    console.error('[generateAdiNarrativeSuggestions] recorded design reasoning unavailable:', error?.message);
    return [];
  }
}

/**
 * The recorded reasoning as ADI may read it. Every saved interpretation is first
 * verified against the canonical frozen report for ITS OWN version, and the
 * statements that contradict it are removed. An interpretation that cannot be
 * matched to a frozen report is not read at all: a stale or foreign reading never
 * becomes a reason ADI states, and a design intention is never turned into a
 * measured result.
 */
function verifiedRationale({
  entries = [],
  snapshotByVersionId = new Map(),
  factsByVersionId = new Map(),
  fallbackVersionId = null,
} = {}) {
  const parts = [];
  const dropped = [];
  for (const entry of entries) {
    const versionId = (entry?.version_ids || []).find((id) => snapshotByVersionId.has(id))
      || (fallbackVersionId && snapshotByVersionId.has(fallbackVersionId) ? fallbackVersionId : null);
    if (!versionId) continue;
    const snapshot = snapshotByVersionId.get(versionId);
    const facts = factsByVersionId.get(versionId);
    if (!snapshot || !facts) continue;
    const verified = verifiedInterpretation({ snapshot, facts, interpretation: entry.interpretation });
    if (verified.text) parts.push(verified.text);
    for (const drop of verified.dropped) dropped.push({ proposal_id: entry.proposal_id, ...drop });
  }
  return { rationale: parts.join('\n\n').slice(0, 6000), dropped };
}

/**
 * The recorded reasoning as the suggestion writer sees it. Where none is on file that
 * is stated plainly, so no suggestion implies a reason Sound Proof does not hold.
 */
function buildRationaleBlock(rationale) {
  if (!rationale) {
    return [
      '=== RECORDED DESIGN REASONING ===',
      'Nothing is recorded for this version: no decision rationale is on file. Never suggest explaining why a speaker, seat, subwoofer position or spacing was chosen.',
      '=== END RECORDED DESIGN REASONING ===',
    ].join('\n');
  }
  return [
    '=== RECORDED DESIGN REASONING (the only decisions a suggestion may ask the report to explain) ===',
    "This includes the designer's own Client Brief and notes: a decision they explain there is recorded reasoning. Never repeat their requests back as suggestions.",
    rationale,
    '=== END RECORDED DESIGN REASONING ===',
  ].join('\n');
}

function buildPrompt({ evidence, factsBlock, rationale, authorityChips, proposalType, versionCount, projectName, highDensity, parameterRule, displayRule }) {
  return [
    evidence,
    '',
    factsBlock,
    '',
    rationale,
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
    parameterRule,
    displayRule,
    '- State only values that appear in THIS PROJECT VERSION above. Never write a number that is not in that block.',
    '- Every number is checked against the project data before the designer sees the chip: a screen size, level, channel count, subwoofer count, dB, Hz or angle figure that does not match this version is discarded.',
    '- If a fact is not in that block, write the point without a number (for example, the screen scale and viewing geometry) instead of guessing a value.',
    '- Every chip must be supported by a fact in the calculated data above. Never invent a result, value, level or seat count.',
    '- Suggest explaining a design DECISION — why a speaker, seat, subwoofer position or spacing was chosen — only where that reasoning appears in the recorded design reasoning block above. Where it is not recorded, suggest explaining the calculated result and what it means for the room instead.',
    '- Never imply Sound Proof knows why a decision was made when that reasoning is not on record.',
    '- Only name a level (for example Level 4) when that exact level appears in the data for that parameter. Never suggest a level the design cannot reach.',
    '- Never describe the design as state-of-the-art, reference or flawless unless the data shows the top levels across the pillars.',
    highDensity
      ? '- This design already uses a high channel count (9.1.6, or 15 or more discrete channels), so never suggest more speakers, more channels, more overhead positions, additional surround positions or improved horizontal spacing, and never offer any of them as a future upgrade. Parameter 2 is already achieved at the highest level for this layout, so never present the channel count as limited or as something to improve. Where a spacing result (P5, P7, P9 or P10) is limited, suggest explaining it as the practical speaker positions and the seat geometry setting the result — never as a room-geometry constraint and never as a channel-count problem. Never mention processor or AV amplifier channel capability, and never mention what more channels would cost.'
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
function buildComparisonPrompt({ versions, authorityChips, rationale, projectName, parameterRule, displayRule }) {
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
    rationale,
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
    parameterRule,
    displayRule,
    '- Every suggestion must compare the selected versions, or state a fact that is true of EVERY selected version. Never write a suggestion that states one version\'s fact as though it applied to the whole comparison.',
    '- Prefer the areas the comparison is built on: dynamic range, bass layout, spatial resolution, speaker layout, screen and seating experience, viewing experience, system scale, upgrade benefits, which system is stronger.',
    `- Name a version only by its exact saved name (${names.join(', ')}).`,
    '- State only values that appear in the version blocks above. Every number is checked against every selected version before the designer sees the chip.',
    '- A value belonging to one selected version may appear only in a comparison with another version\'s value. A suggestion that states one version\'s figure as the single fact of the report is discarded.',
    '- A fact stated without comparison wording must hold in every selected version, or it is discarded.',
    '- Never invent a difference between versions. Where the versions match on an area, say that they match instead of inventing a change.',
    '- Suggest explaining a design DECISION only where that reasoning appears in the recorded design reasoning block above: where it is not recorded, suggest explaining the calculated result and what it means instead, and never imply Sound Proof knows why it was chosen.',
    '- Never suggest a screen size, level, layout, seat count, subwoofer count, dB or Hz figure that is not in the version blocks above.',
    '- Where the data shows a weak or limiting area in one version, prefer a chip that explains it honestly as a difference between the options.',
    highDensityEverywhere
      ? '- Every selected version already uses a high channel count (9.1.6, or 15 or more discrete channels), so never suggest more speakers, more channels, more overhead positions, additional surround positions or improved horizontal spacing, and never offer any of them as a future upgrade. Where every version shares the same channel layout, treat that as a shared strength of the options and state Parameter 2 as already achieved, not as a limitation of any version. Never present the layout as a room-geometry constraint, and never mention processor or AV amplifier channel capability or cost.'
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
    // Stage timings, measured separately so a slow suggestion area can be judged
    // on numbers instead of assumed to be the model. Reported in the response and
    // logged with the chips; measuring changes no suggestion.
    const requestStartedAt = Date.now();
    const timings = {
      interpretationReadMs: null,
      deterministicMs: null,
      llmMs: null,
      totalMs: null,
    };
    const snapshot = body?.engineering_snapshot || null;
    const selectedVersionIds = (Array.isArray(body?.selected_version_ids) ? body.selected_version_ids : [])
      .filter(Boolean);
    // The version the frozen snapshot belongs to. Every saved interpretation is
    // verified against the canonical frozen report for its OWN version, so the
    // version this snapshot states is what makes that possible.
    const primaryVersionId = selectedVersionIds[0]
      || snapshot?.identity?.versionId
      || snapshot?.version?.id
      || null;
    // A question already answered or passed in this preparation is never asked
    // again. A passed question is excluded here without ever being read as an
    // answer.
    const askedQuestionIds = (Array.isArray(body?.existing_clarifications) ? body.existing_clarifications : [])
      .map((entry) => entry?.question_id)
      .filter(Boolean);

    // The designer's explicit requests. An assumed or administrative parameter
    // (P8, P15, P21) is only ever offered as an example when the brief asks for
    // it, and then only labelled as an assumption.
    const parameterPolicy = buildExcludedParameterPolicy({
      clientBrief: body?.client_brief || '',
      dealerNotes: body?.dealer_notes || '',
    });
    const parameterRule = buildClientFacingParameterRule(parameterPolicy);

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

    // ── The canonical frozen evidence, by version ──
    // A saved interpretation is verified against the frozen report for its own
    // version, so the two are read together and never mixed across versions.
    const snapshotByVersionId = new Map(
      versionEntries.map((entry) => [entry.version_id, entry.snapshot]),
    );
    const singleFacts = snapshot?.available === true ? buildNarrativeFacts(snapshot) : null;
    const factsByVersionId = new Map(versionEntries.map((entry) => [entry.version_id, entry.facts]));
    if (primaryVersionId && singleFacts) {
      if (!snapshotByVersionId.has(primaryVersionId)) snapshotByVersionId.set(primaryVersionId, snapshot);
      factsByVersionId.set(primaryVersionId, singleFacts);
    }

    // The recorded design reasoning for these versions, VERIFIED: every saved
    // interpretation is read against the canonical frozen report for its own
    // version, and a statement that contradicts it is removed. A stale or foreign
    // interpretation is not read at all, and a design intention is never read as a
    // measured result.
    const interpretationStartedAt = Date.now();
    const recordedInterpretations = await readRecordedInterpretations(
      base44,
      body?.project_id,
      versionEntries.length >= 2
        ? versionEntries.map((entry) => entry.version_id)
        : selectedVersionIds,
    );
    timings.interpretationReadMs = Date.now() - interpretationStartedAt;
    const { rationale, dropped: droppedInterpretationStatements } = verifiedRationale({
      entries: recordedInterpretations,
      snapshotByVersionId,
      factsByVersionId,
      fallbackVersionId: primaryVersionId,
    });
    for (const drop of droppedInterpretationStatements) {
      console.log('[ADI interpretation check] unsupported statement removed', JSON.stringify(drop));
    }

    // The material a suggestion's reasoning is read from, exactly as the Client Brief
    // audit reads it: the recorded interpretation, and the designer's own words in the
    // brief and notes. A decision recorded nowhere here is not established, so ADI never
    // suggests explaining it.
    const reasoningMaterial = [rationale, body?.client_brief || '', body?.dealer_notes || '']
      .filter((part) => String(part).trim().length > 0)
      .join('\n\n');

    if (versionEntries.length >= 2) {
      const authorityChips = buildComparisonAuthorityChips(versionEntries);

      let comparisonAiChips = [];
      const comparisonLlmStartedAt = Date.now();
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: buildComparisonPrompt({
            versions: versionEntries,
            authorityChips,
            rationale: reasoningMaterial,
            projectName: versionEntries[0]?.snapshot?.project?.name || snapshot?.project?.name || null,
            parameterRule,
            // Every selected version being a television is what makes the TV
            // display rule safe to state for the comparison as a whole.
            displayRule: versionEntries.every((entry) => entry.facts.screen.isTv)
              ? buildDisplayLanguageRule(versionEntries[0].facts)
              : '',
          }),
          response_json_schema: SUGGESTIONS_JSON_SCHEMA,
        });
        comparisonAiChips = normaliseSuggestions(result);
      } catch (error) {
        console.error('[generateAdiNarrativeSuggestions] ADI comparison suggestions unavailable, grounded examples only:', error?.message);
      }
      timings.llmMs = Date.now() - comparisonLlmStartedAt;

      const { suggestions, diagnostics } = resolveComparisonNarrativeChips({
        aiChips: comparisonAiChips,
        versions: versionEntries,
        policy: parameterPolicy,
        material: reasoningMaterial,
      });
      if (suggestions.length === 0) return unavailable();

      // The questions ADI asks about a decision the frozen evidence records no
      // reason for. In a comparison a question is asked only where every selected
      // version shares the same design and the same figure, so it can never
      // misdescribe one of the options. Never more than three.
      const clarifications = buildClarificationQuestions({
        versions: versionEntries.map((entry) => ({
          version_id: entry.version_id,
          facts: entry.facts,
          snapshot: entry.snapshot,
        })),
        material: reasoningMaterial,
        askedQuestionIds,
      });

      for (const entry of diagnostics) {
        console.log('[ADI narrative chip]', JSON.stringify(entry));
      }

      return Response.json({
        available: true,
        mode: 'comparison',
        suggestions,
        diagnostics,
        clarifications,
      });
    }

    // No calculated result for the selected version — the wizard shows its
    // generic examples instead, so there is nothing to generate.
    if (!snapshot || snapshot.available !== true) return unavailable();

    // The facts behind every example: read from the snapshot the report itself
    // is built from, for the selected version only.
    const facts = singleFacts;
    if (!facts.available) return unavailable();

    // The deterministic examples are assembled in code from those facts. They
    // are never written by the model.
    const authorityChips = buildAuthorityChips(facts);

    // ADI adds to them. A failure here never costs the designer the grounded
    // examples, so the model call is isolated.
    let aiChips = [];
    const llmStartedAt = Date.now();
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt({
          evidence: buildEngineeringEvidence(snapshot),
          factsBlock: buildNarrativeFactsBlock(facts),
          authorityChips,
          rationale: reasoningMaterial,
          proposalType: body?.proposal_type,
          versionCount: Array.isArray(body?.selected_version_ids)
            ? body.selected_version_ids.length
            : 1,
          projectName: snapshot?.project?.name || null,
          highDensity: resolveReportLayout(snapshot).highDensity,
          parameterRule,
          displayRule: buildDisplayLanguageRule(facts),
        }),
        response_json_schema: SUGGESTIONS_JSON_SCHEMA,
      });
      aiChips = normaliseSuggestions(result);
    } catch (error) {
      console.error('[generateAdiNarrativeSuggestions] ADI suggestions unavailable, grounded examples only:', error?.message);
    }
    timings.llmMs = Date.now() - llmStartedAt;

    // Validate every chip against the same snapshot before it is returned. The
    // recorded reasoning decides which decisions a suggestion may ask the report to
    // explain.
    const { suggestions, diagnostics } = resolveNarrativeChips({
      aiChips,
      facts,
      policy: parameterPolicy,
      material: reasoningMaterial,
    });
    if (suggestions.length === 0) return unavailable();

    // The optional questions ADI may put to the designer: an important decision whose
    // reasoning is not recorded. They are offers, and never block generating. At most
    // three, never one already answered or passed, and never one the design's own
    // recorded reasoning already answers.
    const clarifications = buildClarificationQuestions({
      versions: [{ version_id: primaryVersionId, facts, snapshot }],
      material: reasoningMaterial,
      askedQuestionIds,
    });

    // Diagnostics trail for every chip: text, source fields, source values and
    // whether it passed, was rewritten, or was rejected.
    for (const entry of diagnostics) {
      console.log('[ADI narrative chip]', JSON.stringify(entry));
    }

    return Response.json({ available: true, suggestions, diagnostics, clarifications });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}