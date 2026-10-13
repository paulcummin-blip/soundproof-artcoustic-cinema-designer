import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { buildProposalEvidence, proposalEvidenceFingerprint } from '../../shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildProjectInterpretation, formatInterpretationForPrompt } from '../../shared/adiProjectInterpretation.js';
import { buildEngineeringEvidence, selectHighlightRows } from '../../shared/engineeringSnapshotEvidence.js';
import { buildProposalWritingAuthority } from '../../shared/soundProofWritingAuthority.js';

// READ-ONLY model comparison harness for the Project Report narrative.
//
// It compares two explicitly named models writing from ONE identical frozen
// input: the same Genesis Project Report evidence, the same in-memory ADI
// interpretation, the same fixed highlight rows and the same instructions. It
// writes NOTHING — no report, no snapshot, no narrative, no library entry — and
// it changes no production model, no engineering value and no highlight
// selection. The only variable between the two runs is the model identifier.
//
// The two tasks are the two editorial surfaces under review:
//   A. the Design Intent paragraph (150-200 words)
//   B. the explanation only, for each frozen highlight row
const COMPARISON_MODELS = Object.freeze({
  astra: 'gpt_6_astra',
  claude: 'claude-sonnet-5',
});

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    design_intent: { type: 'string' },
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['key', 'explanation'],
      },
    },
  },
  required: ['design_intent', 'highlights'],
};

const MAX_DESIGN_INTENT_WORDS = 200;
const MIN_DESIGN_INTENT_WORDS = 150;

/** The saved physical arrangement, stated exactly as the frozen evidence holds it. */
function geometryBlock(snapshot) {
  const layers = snapshot.system?.products_selected_by_layer || {};
  const describe = (list) => (Array.isArray(list) ? list : []).map((entry) => {
    const count = Number(entry?.quantity) > 1 ? `${entry.quantity} x ` : '';
    const dual = entry?.structure === 'dual-centre'
      ? ` (dual-centre: ${entry.cabinet_count} physical cabinets reproducing ONE centre channel)`
      : '';
    const position = entry?.position ? ` (${entry.position})` : '';
    return `${count}${entry?.model}${dual}${position}`;
  }).join(', ');

  const cabinetCount = ['lcr', 'surrounds', 'overheads']
    .reduce((sum, key) => sum + (Array.isArray(layers[key]) ? layers[key].reduce((n, e) => n + (Number(e?.quantity) || 0), 0) : 0), 0);

  return [
    '=== FIXED PHYSICAL ARRANGEMENT (saved geometry, never contradict or embellish) ===',
    `Room: ${snapshot.room?.dimensions?.width_m} x ${snapshot.room?.dimensions?.length_m} x ${snapshot.room?.dimensions?.height_m} m`,
    `Display: ${snapshot.room?.screen?.display_label || snapshot.room?.screen?.screen_type || 'not stated'}`,
    `Seating: ${snapshot.room?.seating?.row_count} rows, ${snapshot.room?.seating?.seat_count} seats`,
    `Loudspeakers: ${describe(layers.lcr)}`,
    `Surrounds and wides: ${describe(layers.surrounds)}`,
    `Overheads: ${describe(layers.overheads)}`,
    `Subwoofers: ${describe(layers.subwoofers)}`,
    `Acoustic treatment: ${describe(layers.acoustic_treatment)}`,
    `Discrete audio channels: ${snapshot.system?.total_discrete} (nine bed channels and six overhead channels)`,
    `Physical loudspeaker cabinets: ${cabinetCount} (two screen left/right, two centre cabinets, six surround and wide, six overhead)`,
  ].join('\n');
}

/** The one prompt both models receive, byte for byte. */
function buildComparisonPrompt({ evidence, interpretation, geometry, stories }) {
  return [
    'You are the Sound Proof report writer.',
    '',
    buildProposalWritingAuthority(),
    '',
    '=== FROZEN ENGINEERING EVIDENCE (the only source of every figure, level and product) ===',
    evidence,
    '',
    interpretation,
    '',
    geometry,
    '',
    '=== THE FIVE SELECTED HIGHLIGHTS (fixed by Sound Proof: identity, order, level and scope are final) ===',
    ...stories.map((story, index) => [
      `${index + 1}. [${story.story_id}] ${story.title}`,
      `   category: ${story.category} | achieved level: ${story.level} | evidence scope: ${story.scope}`,
      `   evidence statement: ${story.statement}`,
    ].join('\n')),
    '',
    '=== TASK A: DESIGN INTENT ===',
    `Write the Design Intent in ${MIN_DESIGN_INTENT_WORDS} to ${MAX_DESIGN_INTENT_WORDS} words, in flowing British English, as an experienced cinema designer speaking directly to the client.`,
    'It must cover, woven together rather than listed: our overall recommendation, why it suits this room, how the picture, the seating and the sound system work together, the experience the design is built to deliver, and the important engineering strengths stated as supporting evidence.',
    'This is the professional judgement behind the recommendation: explain why this solution is right for this room, not what the parameters are called.',
    '',
    '=== TASK B: HIGHLIGHT EXPLANATIONS ===',
    'For EVERY highlight above, return its story_id in the key field exactly as given, and write only its explanatory paragraph: one or two sentences on what that result means for the client\'s cinema experience.',
    'Never change a highlight identity, its order, its level or its scope. Never add, remove or reorder one. You are writing explanation only.',
    'Where a result is a lower level, state plainly what it gives the room and what limits it. Never call a low level excellent, outstanding or a strength.',
    '',
    '=== WRITING STYLE ===',
    'Positive, engaging and authoritative. Human, confident and specific. Natural British English with varied sentence structure.',
    'Write so the client appreciates the design and understands the judgement behind it. Keep the client experience as the subject.',
    'Never use an em dash.',
    'Avoid: generic marketing language; repeating a parameter description; excessive qualification; calibration, commissioning or verification commentary; a reason the evidence does not record; any performance claim the evidence does not support.',
    '',
    '=== ENGINEERING SAFETY (absolute) ===',
    'Every figure, level and product must match the frozen evidence exactly: never round, convert, combine or restate one.',
    '- The saved physical arrangement above is final, and speaker placement must agree with it.',
    '- Distinguish the 15 discrete audio channels from the 16 physical loudspeaker cabinets: the centre position is two physical cabinets reproducing one centre channel.',
    '- The tonal results establish seat-to-seat response consistency WITHIN their own loudspeaker group. They are never a measured match between groups, and their figures are never attached to one.',
    '- Bass consistency across the seating must not be presented as excellent or as a strength on this design.',
    '- The reference-position bass result is stated only as the evidence states it, and is never embellished.',
    '- Name the display exactly as the evidence names it, and never describe a television as a screen, a projector, an aspect ratio or a viewable width.',
    '',
    'Return one JSON object only: design_intent, and highlights as an array of { key, explanation } covering all five highlights.',
  ].join('\n');
}

/** The returned draft as readable text: the two tasks, the model's own words. */
function renderText(output, part = null) {
  if (!output || typeof output !== 'object') return String(output ?? '');
  const intent = String(output.design_intent || '').trim();
  const rows = Array.isArray(output.highlights) ? output.highlights : [];
  if (part === 'intent') return intent;
  if (part === 'highlights') {
    return rows.map((row) => `[${String(row?.key || '')}] ${String(row?.explanation || '').trim()}`).join('\n\n');
  }
  return [
    'A. DESIGN INTENT',
    intent,
    '',
    'B. HIGHLIGHT EXPLANATIONS',
    ...rows.map((row) => `[${String(row?.key || '')}] ${String(row?.explanation || '').trim()}`),
  ].join('\n');
}

async function runModel({ base44, model, prompt, fingerprint, part = null }) {
  const startedAt = Date.now();
  try {
    const output = await base44.integrations.Core.InvokeLLM({
      prompt,
      model,
      response_json_schema: NARRATIVE_SCHEMA,
    });
    return {
      model,
      ok: true,
      duration_ms: Date.now() - startedAt,
      input_fingerprint: fingerprint,
      // The model's own words, rendered so both outputs read in full.
      text: renderText(output, part),
    };
  } catch (error) {
    return {
      model,
      ok: false,
      duration_ms: Date.now() - startedAt,
      input_fingerprint: fingerprint,
      error: String(error?.message || error || 'The provider call failed.').slice(0, 400),
    };
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin-only read-only preview' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const projectId = body.project_id;
    const versionId = body.version_id;
    if (!projectId || !versionId) {
      return Response.json({ error: 'project_id and version_id are required' }, { status: 400 });
    }

    const project = await base44.entities.Project.get(projectId);
    const version = await base44.entities.ProjectVersion.get(versionId);
    if (!project || !version || version.project_id !== projectId) {
      return Response.json({ error: 'Project/version not found' }, { status: 404 });
    }

    // The canonical Project Report evidence, read exactly as a proposal reads it.
    const supplied = await readProposalReportEvidence(base44.entities, projectId, [version]);
    if (!supplied.length) return Response.json({ error: 'No Project Report evidence for this version' }, { status: 409 });
    const entry = supplied[0];
    const snapshot = entry.snapshot;

    // The one frozen evidence pack, and the existing ADI interpretation derived
    // in memory. Neither is written anywhere.
    const pack = buildProposalEvidence({ versions: supplied, requestContext: {} });
    const interpretation = buildProjectInterpretation({
      snapshot,
      project,
      reportType: 'single',
      versions: [{ id: versionId, label: entry.version_name || version.version_name || null }],
      reportLabel: entry.version_name || version.version_name || null,
    });

    const rows = selectHighlightRows(snapshot);
    const evidence = buildEngineeringEvidence(snapshot);
    const geometry = geometryBlock(snapshot);
    const stories = pack.options?.[0]?.strength_stories || [];
    const prompt = buildComparisonPrompt({
      evidence,
      interpretation: formatInterpretationForPrompt(interpretation),
      geometry,
      stories,
    });
    // The identical-input proof: one fingerprint over the exact prompt and schema.
    const inputFingerprint = proposalEvidenceFingerprint({ prompt, schema: NARRATIVE_SCHEMA });

    const outputsOnly = body.outputs_only === true;
    // A read-only, model-free read of the fixed highlight rows.
    if (body.rows_only === true) {
      return Response.json({
        dry_run: true,
        persisted: false,
        notice: 'READ-ONLY. Highlight rows read from the frozen evidence; no model was called.',
        evidence_fingerprints: { pack_fingerprint: pack.pack_fingerprint, shared_input_fingerprint: inputFingerprint },
        ...(outputsOnly ? {} : { highlight_rows: rows }),
        // Whether a submitted figure actually came from the frozen input.
        prompt_probe: ['57.3', '57\u00b0', '34\u00b0'].map((term) => {
          const at = prompt.indexOf(term);
          return at < 0 ? `${term}: absent` : `${term}: ${prompt.slice(Math.max(0, at - 90), at + 30).replace(/\n/g, ' ')}`;
        }),
        story_count: (pack.options?.[0]?.strength_stories || []).length,
        strength_stories: (pack.options?.[0]?.strength_stories || []).map((story) => ({
          story_id: story.story_id,
          title: story.title,
          category: story.category,
          level: story.level,
          scope: story.scope,
        })),
        omitted_stories: (pack.options?.[0]?.omitted_stories || []).map((story) => story.title || story.story_id),
        interpretation: {
          room_type: interpretation.room_type,
          presentation: interpretation.presentation,
          primary_design_intent: interpretation.primary_design_intent,
          strongest_areas: interpretation.strongest_areas,
          main_constraints: interpretation.main_constraints,
          confirmed_designer_intent: interpretation.important_design_decisions,
        },
      });
    }

    // One model per call unless both are requested, so each output reads in full.
    const requested = typeof body.model === 'string' ? body.model.trim().toLowerCase() : null;
    const selectedModels = requested === 'astra' ? [COMPARISON_MODELS.astra]
      : requested === 'claude' ? [COMPARISON_MODELS.claude]
        : [COMPARISON_MODELS.astra, COMPARISON_MODELS.claude];

    const results = await Promise.allSettled(
      selectedModels.map((model) => runModel({
        base44, model, prompt, fingerprint: inputFingerprint,
        part: typeof body.part === 'string' ? body.part : null,
      })),
    );

    return Response.json({
      dry_run: true,
      persisted: false,
      notice: 'READ-ONLY comparison. No report, snapshot, narrative, proposal or library record was created or modified.',
      model_routes: { ...COMPARISON_MODELS },
      // The two outputs lead the response so they are always readable in full.
      results: results.map((settled, index) => (
        settled.status === 'fulfilled'
          ? settled.value
          : { model: selectedModels[index], ok: false, error: String(settled.reason) }
      )),
      project_id: projectId,
      version_id: versionId,
      project_name: project.name || null,
      version_name: version.version_name || null,
      evidence_fingerprints: {
        project_report_snapshot_id: entry.evidence?.citation?.project_report_snapshot_id || null,
        engineering_fingerprint: snapshot?.identity?.engineeringFingerprint || null,
        report_evidence_fingerprint: snapshot?.identity?.technicalEvidenceFingerprint || null,
        pack_fingerprint: pack.pack_fingerprint,
        pack_schema_version: pack.schema_version,
        shared_input_fingerprint: inputFingerprint,
      },
      ...(outputsOnly ? {} : {
      interpretation: {
        version: interpretation.version,
        room_type: interpretation.room_type,
        presentation: interpretation.presentation,
        primary_design_intent: interpretation.primary_design_intent,
        defining_feature: interpretation.defining_feature,
        strongest_areas: interpretation.strongest_areas,
        main_constraints: interpretation.main_constraints,
        confirmed_designer_intent: interpretation.important_design_decisions,
        design_philosophy_version: interpretation.design_philosophy?.version || null,
      },
      highlight_rows: rows,
      }),
    });
  } catch (error) {
    return Response.json({ dry_run: true, persisted: false, error: error?.message || 'Comparison preview failed; nothing was saved' }, { status: 500 });
  }
}