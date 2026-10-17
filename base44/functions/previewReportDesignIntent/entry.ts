import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runProductionDesignIntentAttempt } from '../../shared/reportDesignIntent/designIntentProductionAttempt.js';
import { readOnlyEntities } from '../../shared/reportDesignIntent/readOnlyEntities.js';
import { buildWriterPrompt } from '../../shared/proposalWriter/writerPromptBuilder.js';
import { WRITER_PROMPT_VERSION } from '../../shared/proposalWriter/writerContractSchema.js';
import { proposalEvidenceFingerprint } from '../../shared/proposalEvidence/proposalEvidenceBuilder.js';

/**
 * PREVIEW the Project Report's Design Intent — ADMIN ONLY, READ-ONLY.
 *
 * It runs the REAL production writer, not a copy of it: the attempt is executed by
 * runProductionDesignIntentAttempt, the same shared path generateReportDesignIntent
 * calls, against the same saved project, the same saved design version, the same
 * frozen Project Report evidence, the same evidence pack, the same interpretation
 * input, the same scoping to the one Design Intent section, the same writing
 * contract, the same prompt version and the same Astra model the flag resolves to.
 * The only difference is what happens at the end: this function writes nothing.
 *
 * IT IS PROVEN UNABLE TO WRITE. Both entity clients — the login's own and the
 * service role it uses only for the writer's switch and the engineering authority —
 * are wrapped so that every method which is not a named read throws before it
 * reaches the platform, and every attempt is counted. The response states the count,
 * so a preview cannot quietly become a write. This function contains no update, no
 * create, no delete, no publish and no approval call at all.
 *
 * Because nothing is saved, the report, the version, the snapshot, the approval
 * state, the readiness state, the published engineering and the prompt fingerprint
 * of any saved content are all left exactly as they were. A refusal here is a result
 * to read, never a record to keep.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'The Design Intent preview is admin-only.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = body?.project_id || null;
    const versionId = body?.version_id || null;

    const guarded = readOnlyEntities(base44.entities);
    const guardedService = readOnlyEntities(base44.asServiceRole.entities);

    // The exact pack and writer input the writer was given, captured through the
    // runner's own observability hook so the report below states what the attempt
    // actually read rather than guessing it from a second evidence path.
    let captured = null;

    const outcome = await runProductionDesignIntentAttempt({
      entities: guarded.entities,
      authorityEntities: guardedService.entities,
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
      projectId,
      versionId,
      user,
      accountIdFallback: null,
      // The page is reachable by a master admin alone, so the writer's own switch is
      // resolved exactly as production resolves it for this login.
      isMasterAdmin: true,
      now: new Date().toISOString(),
      onEvidencePack: ({ pack, writerInput }) => {
        captured = { pack, writerInput };
      },
    });

    const boundary = {
      write_attempts: [...guarded.attempts, ...guardedService.attempts],
      write_attempt_count: guarded.attempts.length + guardedService.attempts.length,
      reads: guarded.reads.length + guardedService.reads.length,
      persisted: false,
    };

    if (!outcome.ok) {
      return Response.json({
        ok: false,
        dry_run: true,
        code: outcome.block.code,
        error: outcome.block.error,
        reason: outcome.block.reason,
        boundary,
      }, { status: outcome.block.status });
    }

    const { project, version, snapshot, flag, attempt } = outcome;

    return Response.json({
      ok: attempt.ok === true,
      dry_run: true,
      // Stated explicitly so a reader never has to infer it: nothing was saved.
      persisted: false,
      notice: 'READ-ONLY PREVIEW. The production Design Intent writer was run once against the current project, '
        + 'version and authoritative evidence. No report, snapshot, approval, readiness or published value was '
        + 'created, modified or deleted, and no saved Design Intent was touched.',

      project: {
        id: project.id,
        name: project.name || null,
        client_name: project.client_name || null,
        project_reference: project.project_reference || null,
      },
      version: {
        id: version.id,
        version_name: version.version_name || null,
        version_number: version.version_number ?? null,
      },
      report: {
        snapshot_id: snapshot.id,
        generated_at: snapshot.generated_at || null,
        status: snapshot.status || null,
        source_fingerprints: snapshot.source_fingerprints || null,
      },

      // WHAT THE ATTEMPT ACTUALLY RAN AS. Every identifier here was read or built
      // during this call, so the prompt fingerprint below is by construction the
      // current one: it is a fingerprint of the prompt built NOW from the current
      // contract and the current Design Intent brief.
      writer: buildWriterAudit({ writerInput: captured?.writerInput || null, pack: captured?.pack || null, attempt, flag }),

      // The generated narrative itself, in the writer's own words.
      result: {
        status: attempt.ok === true ? 'accepted' : 'refused',
        reason: attempt.reason ?? null,
        detail: attempt.detail ?? null,
        text: attempt.ok === true ? attempt.text : null,
        word_count: attempt.ok === true ? wordCount(attempt.text) : 0,
        validation_errors: attempt.validation_errors || [],
        // The draft the validator refused, for an admin to read: evidence of what
        // happened, never copy, and never saved anywhere by this function.
        refused_draft: attempt.ok === true ? null : (attempt.draft ?? null),
      },

      evidence: buildEvidenceReport({
        pack: captured?.pack || null,
        writerInput: captured?.writerInput || null,
        snapshot,
      }),

      boundary,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      dry_run: true,
      persisted: false,
      error: error?.message || 'The Design Intent preview failed; nothing was saved.',
    }, { status: 500 });
  }
}

/** Whole words in a passage. */
function wordCount(text) {
  return typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

/** At most this many entries of any one evidence list are returned. */
const LIST_CAP = 60;

/**
 * WHAT THE ATTEMPT RAN AS: the writer's own switch, the model, and the identity of
 * the prompt, the contract and the input. Nothing here is chosen by this function —
 * each value is read from the attempt or from the writer input the writer was given.
 */
function buildWriterAudit({ writerInput = null, pack = null, attempt = null, flag = null }) {
  const promptVersion = writerInput?.prompt_version || null;

  // The prompt itself, built from the exact writer input the provider received, and
  // fingerprinted with the same content authority the pack and the input use.
  let promptFingerprint = null;
  try {
    if (writerInput) promptFingerprint = proposalEvidenceFingerprint({ prompt: buildWriterPrompt({ input: writerInput }) });
  } catch (error) {
    promptFingerprint = null;
  }

  const identity = attempt?.provider_identity || null;

  return {
    enabled: flag?.enabled === true,
    mode: flag?.mode ?? null,
    model_requested: flag?.model || null,
    provider: attempt?.provider ?? identity?.provider ?? null,
    model: attempt?.model ?? identity?.model ?? null,
    duration_ms: attempt?.duration_ms ?? identity?.durationMs ?? null,

    prompt_version: promptVersion,
    prompt_version_current: WRITER_PROMPT_VERSION,
    // A match means the input the writer was given carries the prompt version this
    // build of the app defines, so the attempt ran under the current prompt.
    prompt_fingerprint_matches_current: promptVersion !== null && promptVersion === WRITER_PROMPT_VERSION,
    prompt_fingerprint: promptFingerprint,
    contract_version: writerInput?.contract_version ?? attempt?.contract_version ?? null,
    input_fingerprint: writerInput?.input_fingerprint
      ?? attempt?.input_fingerprint
      ?? attempt?.record?.input_fingerprint
      ?? null,
    evidence_pack_fingerprint: pack?.pack_fingerprint ?? attempt?.evidence_pack_fingerprint ?? null,
    geometry_fingerprint: attempt?.geometry_fingerprint ?? null,
    visual_fingerprint: attempt?.visual_fingerprint ?? null,

    // Whether the reuse-interpretation block was carried on this path, and the
    // designer's own recorded intent the writer was given. Reported, never changed:
    // the preview states the input it actually used.
    adi_interpretation_supplied: writerInput?.design_interpretation?.available === true,
    design_scope: writerInput?.design_intent_scope?.section ?? null,
    word_limit: writerInput?.word_limits?.decision_summary ?? null,
  };
}

/**
 * THE EVIDENCE THE ATTEMPT USED, AND THE EVIDENCE IT WAS KEPT FROM. Used is read
 * from the pack the writer was given and the frozen Project Report it was built
 * from; excluded is the pack's own deterministic record of what it deliberately
 * left out. Neither list is computed here, so the preview reports the production
 * evidence selection rather than a second opinion about it.
 */
function buildEvidenceReport({ pack = null, writerInput = null, snapshot = null }) {
  const option = (pack?.options || [])[0] || null;
  const basis = pack?.evidence_basis || {};

  const stories = (option?.strength_stories || []).map((story) => ({
    story_id: story?.story_id ?? null,
    title: story?.title ?? null,
    category: story?.category ?? null,
    level: story?.level ?? null,
    scope: story?.scope ?? null,
  }));

  const omitted = (option?.omitted_stories || []).slice(0, LIST_CAP).map((story) => ({
    story_id: story?.story_id ?? null,
    title: story?.title ?? null,
    level: story?.level ?? null,
    reason: story?.reason ?? story?.omitted_reason ?? null,
  }));

  const blocked = (pack?.blocked_claims || []).slice(0, LIST_CAP).map((block) => ({
    block_id: block?.block_id ?? null,
    area: block?.area ?? null,
    reason: block?.reason ?? null,
    prohibited: block?.prohibited ?? null,
  }));

  const pillars = (option?.client_story_pillars || []).map((pillar) => ({
    pillar: pillar?.pillar ?? null,
    label: pillar?.label ?? null,
  }));

  return {
    source: 'saved Project Report evidence',
    snapshot_id: snapshot?.id || null,
    mode: pack?.mode ?? null,
    pack_schema_version: pack?.schema_version ?? null,
    pack_fingerprint: pack?.pack_fingerprint ?? null,
    report_snapshot_ids: basis.report_snapshot_ids || [],
    report_fingerprints: basis.fingerprints || [],
    selected_stories: stories,
    selected_story_count: stories.length,
    pillars,
    design_rationale: option?.design_rationale ?? null,
    allowed_claim_count: (pack?.allowed_claims || []).length,
    // The scoping the writer was given, so a reader can see the attempt wrote the one
    // section it was asked for.
    sections_in_scope: (writerInput?.section_requirements || []).map((section) => section?.section ?? null),

    excluded: {
      omitted_stories: omitted,
      omitted_story_count: (option?.omitted_stories || []).length,
      blocked_claims: blocked,
      blocked_claim_count: (pack?.blocked_claims || []).length,
      supporting_results: pack?.supporting_results ?? null,
      truncated: (option?.omitted_stories || []).length > LIST_CAP
        || (pack?.blocked_claims || []).length > LIST_CAP,
    },
  };
}