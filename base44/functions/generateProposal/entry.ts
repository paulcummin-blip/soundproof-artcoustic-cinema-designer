import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { readProposalReportEvidence } from '../../shared/proposalReportEvidenceReader.js';
import { prepareProposalEvidence, prepareProposalInterpretation } from '../../shared/proposalDraftPipeline.js';
import { resolveSections } from '../../shared/proposalGenerationPrompts.js';
// ── THE APPROVED WRITER IS THE GENERATION AUTHORITY ──
// The copy is written by the approved proposal writer (its own prompt, its own
// contract, its own validator) from the frozen evidence pack built from the
// canonical Project Report evidence below. The proposal it writes becomes the
// proposal record's own sections, so the editor and the PDF read the copy the
// validator passed rather than a second, separately written draft.
import { generationEntityPayload } from '../../shared/proposalGeneration/proposalGenerationEntity.js';
import { draftAttemptRecord } from '../../shared/proposalGeneration/proposalGenerationRecord.js';
import { runProposalCopyGeneration } from '../../shared/proposalGeneration/proposalGenerationRunner.js';
import { mergeHighlightRows, selectHighlightRows } from '../../shared/engineeringSnapshotEvidence.js';
import { composeWriterSectionBodies } from '../../shared/proposalWriter/writerSectionMapping.js';
import { readProjectOptionGuidance } from '../../shared/proposalWriter/readProjectOptionGuidance.js';
import { GPT_WRITER_FLAG_FIELD, normaliseGptWriterConfig } from '../../shared/proposalWriter/proposalWriterFlag.js';
import { HIGHLIGHTS_SECTION_TYPE, PRESENTED_OPTIONS_SECTION_TYPE, resolveSectionTitle } from '../../shared/systemDesignSummarySections.js';
import { comparisonSectionMetadata, verifyComparisonPersisted } from '../../shared/comparisonPersistence.js';
import { formatInterpretationForLog } from '../../shared/adiProjectInterpretation.js';
import { normaliseClarificationAnswers } from '../../shared/proposalClarification/clarificationAnswers.js';
import { loadCacheRecord, findPublication } from '../../shared/publishedEngineeringAuthority.js';
// The one presentation-only verdict, shared with the report-evidence reader: a
// publication that moved past a saved report without changing the physical design
// is not a design change, and must not read as one on any path of this gate.
import { engineeringMoveIsPresentationOnly } from '../../shared/designIdentityComparison.js';
import { selectCanonicalReportSnapshotsByKey } from '../../shared/reportSnapshotCanonical.js';

// ── ONE proposal readiness authority ──
// The gate below is decided by the SAME per-version rule the Step 5 table shows
// (src/components/proposal/sourceAuthority/proposalReadinessAuthority.js mirrors
// this module and a test asserts the two agree word for word). It states, per
// selected version, whether that version's canonical PROJECT REPORT is current
// and proposal-ready, and it names the version by the name the designer saved —
// never as "Level 1 version · V2". No other report is a proposal prerequisite:
// readiness is read from the Project Report alone.
import {
  resolveCalculationAuthority,
  resolveProposalReadinessGate,
  resolveVersionReadiness,
} from '../../shared/proposalReadinessAuthority.js';

// The generic blocking rule — the wording the client authority uses when a
// block cannot be attributed to a named version and source.
// (src/components/proposal/sourceAuthority/proposalSourceAuthority.js). The
// frontend cannot import from base44/ and vice versa, so the sentence lives in
// both places and a test asserts they match.
const PROPOSAL_SOURCE_REQUIRED_MESSAGE =
  'Create the Project Report for every selected version before creating a proposal. This ensures the proposal uses the current project data and RP22 results.';

// Section definitions and prompts are shared with the write-free preview pipeline.

export default async function(req) {
  let base44 = null;
  let proposal = null;
  let sectionRecords = [];

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { request_id, project_id, version_id, account_id, narrative_goal, proposal_type, selected_version_ids, client_brief, parent_proposal_id, clarification_answers } = body;
    let engineering_snapshot = null;

    if (!request_id) return Response.json({ error: 'request_id required' }, { status: 400 });
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const existing = await base44.entities.Proposal.filter({ creation_request_id: request_id });
    if (existing?.[0]) {
      const existingSections = await base44.entities.ProposalSection.filter({ proposal_id: existing[0].id });
      const expectedSectionCount = resolveSections(existing[0].proposal_type || 'single').length;
      if (existing[0].status === 'generated' && existingSections.length === expectedSectionCount) {
        return Response.json({
          proposal_id: existing[0].id,
          proposal: existing[0],
          section_count: existingSections.length,
          status: 'generated',
          idempotent_replay: true,
        });
      }
      return Response.json({
        error: 'This proposal request is already in progress or requires recovery.',
        proposal_id: existing[0].id,
      }, { status: 409 });
    }

    // ── Load project data ──
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects?.[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── The account this proposal belongs to ──
    // The draft is written from the frozen evidence pack alone, so no brand
    // asset and no live project field is loaded for the writer. The account is
    // still resolved and checked, because it is what the proposal, its sections
    // and its generation record are scoped to.
    const effectiveAccountId = project.account_id;
    if (!effectiveAccountId) {
      return Response.json({ error: 'Project account is missing.' }, { status: 409 });
    }
    if (account_id && account_id !== effectiveAccountId) {
      return Response.json({ error: 'Project account does not match the active account.' }, { status: 403 });
    }

    // ── Resolve version IDs ──
    // New proposals pass selected_version_ids[] and proposal_type.
    // Legacy calls pass a single version_id — treat as a single proposal.
    const resolvedType = proposal_type || 'single';
    const resolvedVersionIds = Array.isArray(selected_version_ids) && selected_version_ids.length > 0
      ? selected_version_ids
      : version_id
        ? [version_id]
        : [];
    if (!['single', 'comparison', 'system_summary'].includes(resolvedType)) {
      return Response.json({ error: 'Unsupported proposal_type.' }, { status: 400 });
    }
    const expectedVersionCountValid = resolvedType === 'comparison'
      ? resolvedVersionIds.length >= 2 && new Set(resolvedVersionIds).size === resolvedVersionIds.length
      : resolvedVersionIds.length === 1;
    if (!expectedVersionCountValid) {
      return Response.json({
        error: resolvedType === 'comparison'
          ? 'Comparison reports require at least two versions.'
          : 'This report type requires exactly one version.',
      }, { status: 400 });
    }

    const projectVersions = await base44.entities.ProjectVersion.filter({ project_id });
    const projectVersionIds = new Set((projectVersions || []).map((item) => item.id));
    const invalidVersionIds = resolvedVersionIds.filter((id) => !projectVersionIds.has(id));
    if (invalidVersionIds.length > 0) {
      return Response.json({ error: 'One or more selected versions do not belong to this project.' }, { status: 400 });
    }

    // For backward compatibility, version_id = first selected version.
    const legacyVersionId = resolvedVersionIds[0] || null;

    // ── Revision link ──
    // Regenerating a saved proposal creates a NEW proposal linked to the one it
    // revises. The original is never modified: not its sections, not its status,
    // and not its current-version flag, so a proposal that has already been sent
    // stays exactly as it was and stays visible.
    let parentProposal = null;
    let revisionNumber = 1;
    const parentProposalId = typeof parent_proposal_id === 'string' ? parent_proposal_id.trim() : '';
    if (parentProposalId) {
      const parents = await base44.entities.Proposal.filter({ id: parentProposalId });
      parentProposal = parents?.[0] || null;
      if (!parentProposal) {
        return Response.json({
          error: 'The proposal this regeneration was started from no longer exists.',
        }, { status: 404 });
      }
      if (String(parentProposal.project_id) !== String(project_id)) {
        return Response.json({
          error: 'The proposal this regeneration was started from belongs to another project.',
        }, { status: 400 });
      }
      const parentVersion = Number(parentProposal.version);
      revisionNumber = (Number.isFinite(parentVersion) && parentVersion > 0 ? parentVersion : 1) + 1;
    }

    // ── STAGE 1: ADI project interpretation ──
    // Before any client-facing text is written, ADI reads the selected version
    // data and states the design story: what this room is, what the design is
    // trying to achieve, where it is strongest, what limits it, and which
    // results are reliable enough to be used as evidence.
    //
    // STAGE 2 (the section writer below) then uses the results only as evidence
    // inside that story. Engineering data -> design interpretation -> narrative.
    //
    // The interpretation is saved with the report and logged, so the story a
    // report was written from can be audited later.
    let suppliedSnapshots;
    try {
      suppliedSnapshots = await readProposalReportEvidence(base44.entities, project_id,
        resolvedVersionIds.map((id) => projectVersions.find((version) => version.id === id)));
    } catch (error) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    engineering_snapshot = suppliedSnapshots[0].snapshot;
    // ── Evidence traceability ──
    // The exact evidence each version's facts were read from: the version's
    // Project Report evidence, the version, when the evidence was generated
    // and its content fingerprint. A proposal that later disagrees with a report
    // can therefore be traced back to the evidence it actually read.
    const reportEvidenceCitations = suppliedSnapshots.map((entry) => ({
      version_id: entry.version_id,
      ...(entry.evidence?.citation || {}),
    }));
    const versionLabelById = new Map(
      resolvedVersionIds.map((id, index) => {
        const record = (projectVersions || []).find((version) => version.id === id);
        return [id, `Version ${record?.version_number ?? index + 1} - ${record?.version_name || 'Untitled'}`];
      }),
    );

    // ── The per-version frozen evidence contract ──
    // A comparison report receives the frozen engineering evidence for EVERY
    // selected version, so neither the calculated comparison table nor the
    // narrative can ever fall back to a single version's results.
    const { versionEvidence, comparisonTable } = prepareProposalEvidence(suppliedSnapshots, projectVersions || [], resolvedType);

    // A comparison is only generated from calculated evidence for every
    // version: a missing version would force an invented comparison value.
    if (resolvedType === 'comparison') {
      const missingEvidence = resolvedVersionIds.filter((id) => {
        const evidence = versionEvidence.find((version) => String(version.version_id) === String(id));
        return !evidence || evidence.available !== true;
      });
      if (missingEvidence.length > 0) {
        return Response.json({
          error: 'Comparison evidence could not be built for both selected versions. Create a current Project Report for each version, then try again.',
          missing_version_ids: missingEvidence,
        }, { status: 409 });
      }

      // A comparison without a table is not a comparison. The Key Performance
      // Highlights section is a calculated table, never a prose page under a
      // table's heading, so a table that cannot be built fails visibly here with
      // the reason instead of producing an empty section.
      if (comparisonTable.rows.length === 0) {
        return Response.json({
          error: 'Comparison evidence could not be built for both selected versions. Create a current Project Report for each version, then try again.',
          comparison_versions: comparisonTable.versions,
        }, { status: 409 });
      }
    }

    // ── SOURCE AUTHORITY: no current Project Report, no proposal ──
    // A proposal is downstream of the version's Project Report, which is rendered
    // from the version's published engineering result. Every selected version is
    // judged on its own canonical Project Report by the one shared readiness
    // authority — the same verdict, for the same version, in the same words as
    // the Step 5 table. The engineering source is the PUBLISHED result alone: a
    // browser-session handoff is not visible here and so is never accepted as
    // readiness.
    // The CANONICAL saved report per version and report type — the same rule the
    // report pages and the Step 5 readiness table apply. Complete evidence comes
    // first, then the row frozen against the version's CURRENT published
    // authority, and only then the newest: a stale or incomplete duplicate never
    // displaces the valid Current report, so the gate judges the report the
    // designer actually generated.
    const savedReportPage = await base44.entities.ReportSnapshot.filter(
      { project_id, version_id: { $in: resolvedVersionIds }, report_type: 'project' },
      { sort: '-generated_at', limit: 50 });
    const savedReportRows = savedReportPage.items;
    const savedReportByKey = selectCanonicalReportSnapshotsByKey(
      Array.isArray(savedReportRows) ? savedReportRows : [],
      {
        currentFingerprintByVersion: new Map(
          (projectVersions || []).map((version) => [version.id, version.published_fingerprint || null]),
        ),
      },
    );

    const versionPublicationById = new Map();
    const cacheRecordByVersionId = new Map();
    for (const versionId of resolvedVersionIds) {
      const versionRecord = (projectVersions || []).find((version) => version.id === versionId);
      const pointer = String(versionRecord?.published_fingerprint || '').trim();
      // The cache row is read for EVERY selected version, not only for one that
      // has a publication pointer: it holds the version's completed calculation
      // authority, the calculated engineering result its Project Report renders.
      const cacheRecord = await loadCacheRecord(base44, project_id, versionId);
      if (cacheRecord) cacheRecordByVersionId.set(versionId, cacheRecord);
      const publication = pointer && cacheRecord ? findPublication(cacheRecord, pointer) : null;
      if (publication) versionPublicationById.set(versionId, publication);
    }

    const readinessRows = resolvedVersionIds.map((versionId) => {
      const versionRecord = (projectVersions || []).find((version) => version.id === versionId) || null;
      const publication = versionPublicationById.get(versionId) || null;
      // THE canonical saved Project Report — the only report source a proposal
      // is gated on. No other saved report is consulted.
      const savedProjectReport = savedReportByKey.get(`${versionId}::project`) || null;
      // The version's calculated engineering result: the publication when it has
      // one, otherwise the completed calculation authority of the SAME design its
      // Project Report was generated from — the rule the client applies too.
      const calculationAuthority = resolveCalculationAuthority({
        cacheRecord: cacheRecordByVersionId.get(versionId) || null,
        savedProjectReport,
      });
      // The SAME presentation-only verdict the report-evidence reader applies,
      // from the two publications' own frozen physical facts: one rule, asked
      // once, so this gate's rows and the reader that supplies the evidence can
      // never state two verdicts about one saved report. A bass or seating change
      // is never excused, and an absent comparison leaves the strict verdict.
      const presentationOnlyMove = engineeringMoveIsPresentationOnly(
        cacheRecordByVersionId.get(versionId) || null,
        {
          frozenFingerprint: savedProjectReport?.source_fingerprints?.engineeringFingerprint || null,
          currentFingerprint: publication?.engineering_fingerprint || null,
        },
      );
      return resolveVersionReadiness({
        version: versionRecord,
        savedProjectReport,
        presentationOnlyMove,
        currentFingerprints: {
          engineeringFingerprint: publication?.engineering_fingerprint || null,
          // When the version has no publication to speak for it, the completed
          // calculation authority supplies its bass fingerprint, so a saved report
          // is judged against the design the version actually holds. A version WITH
          // a publication keeps the publication's own values, exactly as before.
          calculationFingerprint: publication?.provenance?.bass_fingerprint
            || (publication ? null : calculationAuthority?.fingerprint)
            || null,
          seatPriorityFingerprint: publication?.engineering_summary?.seatPriorityFingerprint || null,
        },
      });
    });

    const readinessGate = resolveProposalReadinessGate({ rows: readinessRows, minVersions: 1 });
    // Saved-report reader above is the gate. A lagging publication pointer
    // must not override the report's captured source.
    if (!suppliedSnapshots.length) {
      // Name every blocked version and what it is ACTUALLY missing, from the same
      // authority the client's readiness table reads, so the panel and the gate
      // can never contradict one another.
      return Response.json({
        error: readinessGate.message || PROPOSAL_SOURCE_REQUIRED_MESSAGE,
        source_blockers: readinessGate.rows
          .filter((row) => !row.ready)
          .flatMap((row) => row.blockers.map((blocker) => ({
            version_id: row.versionId,
            version_name: row.versionName,
            source: blocker.source,
            state: blocker.state,
            label: blocker.label,
          }))),
      }, { status: 409 });
    }

    // The report identity carried into the prompt: the current publication for
    // the primary version. Proves every project fact came from a report.
    const primaryPublication = versionPublicationById.get(legacyVersionId) || null;
    const sourceIdentity = {
      project_id,
      version_id: legacyVersionId,
      version_label: versionLabelById.get(legacyVersionId) || null,
      engineering_fingerprint: primaryPublication?.engineering_fingerprint || null,
      published_at: primaryPublication?.published_at || null,
    };
    const { primaryInterpretation, comparisonReading } = prepareProposalInterpretation({
      suppliedSnapshots, project, client_brief, resolvedType, resolvedVersionIds, versionLabelById,
    });
    console.log(`[generateProposal] ADI stage 1 interpretation | ${formatInterpretationForLog(primaryInterpretation)}`);

    // ── The designer's clarifications ──
    // The answers to ADI's questions are project-specific context: the designer's own
    // explanation of a decision the frozen evidence records no reason for. They are
    // kept separately from the Client Brief — the brief is never written into — and a
    // passed question is stored as passed, never as an answer. Nothing is inferred,
    // nothing is shared, and no reusable design knowledge is created here.
    const clarificationRecords = normaliseClarificationAnswers(clarification_answers, {
      projectId: project_id,
      versionIds: resolvedVersionIds,
      user,
      now: new Date().toISOString(),
    });

    // ── Create Proposal record ──
    proposal = await base44.entities.Proposal.create({
      project_id,
      account_id: effectiveAccountId,
      creation_request_id: request_id,
      proposal_type: resolvedType,
      selected_version_ids: resolvedVersionIds,
      version_id: legacyVersionId,
      title: project.name || 'Untitled Proposal',
      status: 'generating',
      narrative_goal: narrative_goal || 'luxury_cinema',
      client_brief: client_brief || '',
      // A regeneration is a linked revision, never an overwrite: this record
      // points at the proposal it revises, and the original is left untouched.
      ...(parentProposal ? {
        parent_proposal_id: parentProposal.id,
        version: revisionNumber,
        version_label: `Revision ${revisionNumber}`,
      } : {}),
      // The frozen Engineering Snapshot assembled by the frontend. The snapshot
      // is frozen at generation time, so later Room Designer edits do NOT
      // silently change an existing proposal.
      engineering_snapshot: engineering_snapshot || null,
      // The Stage 1 ADI project interpretation is saved with the report, so the
      // design story a report was written from can be audited later.
      metadata: {
        project_interpretation: primaryInterpretation,
        // The report identity every project fact in this proposal came from: the
        // primary version and its published engineering fingerprint. Kept with
        // the proposal, so the report a draft was written from stays auditable.
        source_identity: sourceIdentity,
        // The designer's own answers to ADI's clarification questions, kept with the
        // proposal they were given for. Each record carries the question it answers,
        // where it came from, and the project and version identity it belongs to; a
        // passed question carries no answer. These answers stay inside this project
        // and are never shared as reusable design knowledge.
        ...(clarificationRecords.length > 0 ? { clarification_answers: clarificationRecords } : {}),
        // The evidence this proposal was generated from, per version.
        report_evidence: reportEvidenceCitations,
        ...(comparisonReading ? { comparison_reading: comparisonReading } : {}),
        // The comparison data contract: one frozen evidence entry per selected
        // version, plus the calculated table the report renders. Section
        // regeneration reuses this exactly.
        ...(resolvedType === 'comparison'
          ? { selected_versions: versionEvidence, comparison_table: comparisonTable }
          : {}),
      },
    });

    // Read the persisted record, not the create response, before any writing.
    if (resolvedType === 'comparison') {
      await verifyComparisonPersisted(base44, proposal.id, comparisonTable, versionEvidence);
    }

    // ── Create 10 ProposalSection records ──
    const sectionDefs = resolveSections(resolvedType);
    sectionRecords = await base44.entities.ProposalSection.bulkCreate(
      sectionDefs.map((s, i) => ({
        proposal_id: proposal.id,
        account_id: effectiveAccountId,
        section_type: s.type,
        section_key: s.key,
        // A comparison names its own sections: it presents system options and
        // compares them, so it is never titled as a single system design.
        title: resolveSectionTitle(s.type, s.title, resolvedType),
        body: '',
        ...(resolvedType === 'comparison' && s.type === HIGHLIGHTS_SECTION_TYPE
          ? { metadata: comparisonSectionMetadata(comparisonTable) } : {}),
        dealer_notes: '',
        order_index: i,
        is_enabled: true,
        locked: false,
      }))
    );

    // ── ONE ATTEMPT BY THE APPROVED WRITER ──
    // The writer is given the frozen evidence pack built from the canonical
    // Project Report evidence read above, and nothing else. The versions read for
    // the readiness gate ARE that evidence, so the pack is built from the same
    // frozen rows the gate judged rather than from a second read.
    //
    // Generating a proposal IS the writer's job, so this path is not gated on the
    // writer's controlled-test flag: only that flag's model override, where a
    // master admin has set one, is read. There is no second generator here and no
    // fallback to one — a refusal, a provider failure or a draft that fails the
    // contract is reported as a failed generation and nothing is saved.
    const generatedAt = new Date().toISOString();
    const writerConfig = await readWriterConfig(base44);
    const attempt = await runProposalCopyGeneration({
      proposal,
      projectId: project_id,
      accountId: effectiveAccountId,
      existingGenerations: [],
      flag: { enabled: true, model: writerConfig.model },
      user,
      now: generatedAt,
      readEvidence: async () => suppliedSnapshots,
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
      // The designer's own seating or layout alternatives, read from the images
      // they marked as options. They are a BRIEF for the writer, never published
      // copy: the writer's own prose is what the document prints.
      readOptionGuidance: () => readProjectOptionGuidance(base44.entities, project_id, resolvedVersionIds),
      // The ADI interpretation Stage 1 has just built for this proposal, handed to
      // the writer as the design story it writes from. It is the same object saved
      // with the proposal above, and the runner still verifies it before it is used.
      savedInterpretation: primaryInterpretation,
      // The designer's own answers to ADI's clarification questions, handed to the
      // writer as design intent for the section each one belongs to. They are never
      // printed as standalone text and never treated as engineering evidence.
      clarificationAnswers: clarificationRecords,
    });

    if (!attempt.ok) {
      // A refusal read nothing, sent nothing and wrote nothing: the reason is the
      // whole outcome and it is reported as it stands.
      console.error(`[generateProposal] approved writer refused | code=${attempt.code} | ${attempt.message}`);
      throw new Error(attempt.message);
    }

    // ── The attempt's audit record, filed BEFORE the draft is judged ──
    // A copy that arrived and broke the writer's own contract is the event a
    // designer most needs to be able to inspect, so the record is written before
    // the validity gate rather than after it: a record written only for a draft
    // that passed leaves the failure with nothing stored to diagnose.
    //
    // A generation that passed its contract is filed on the proposal that goes on
    // to carry its copy, and it is stored exactly once. Anything else — a rejected
    // draft, a draft awaiting review, a provider that returned nothing — is filed
    // on the DRAFT identity it was written under: the temporary proposal id, with
    // no proposal id. The proposal such an attempt belongs to is rolled back
    // below, so no record is left pointing at a proposal that no longer exists.
    //
    // Either way the record comes from the same builder, so its generation ID and
    // its record fingerprint follow the identity it is actually stored under. The
    // entity is append-only: nothing here updates or rewrites an earlier attempt,
    // and a completed record is never mutated to say something else.
    const auditRecord = attempt.valid === true
      ? attempt.record
      : draftAttemptRecord(attempt.record, { draftProposalId: proposal.id });
    await base44.entities.ProposalGeneration.create(
      generationEntityPayload({ record: auditRecord, accountId: effectiveAccountId }),
    );

    if (attempt.valid !== true) {
      // The draft arrived and broke the writer's own contract. It is never
      // published and never replaced by another generator — but it is retained in
      // full, under the draft identity written above, so the rejection is
      // diagnosable after the proposal itself has gone.
      const violations = Array.isArray(attempt.validation_errors) ? attempt.validation_errors : [];
      console.error(
        `[generateProposal] approved writer draft rejected | generation=${auditRecord.generation_id} `
        + `status=${attempt.status} provider=${attempt.provider || 'none'} violations=${violations.length} `
        + `first=${violations[0]?.code || 'none'} section=${violations[0]?.section || 'none'}`,
      );
      throw new Error(WRITER_DRAFT_REJECTED_MESSAGE);
    }

    // What the writer was given beyond the pack, logged so a live draft can always
    // be traced to the interpretation and the brief it was written from.
    const designContext = attempt.record.gpt_input?.design_interpretation || {};
    console.log(
      `[generateProposal] design context | interpretation=${designContext.available === true
        ? `${designContext.source} versions=${(designContext.provenance?.version_ids || []).length}`
        : `refused:${designContext.refusal || 'none'}`} `
      + `| brief=${attempt.record.gpt_input?.editorial_brief?.supplied === true ? 'supplied' : 'none'}`
      + `| clarifications=${attempt.clarification_answers_supplied === true
        ? `${attempt.record.gpt_input?.clarification_answers?.answers?.length || 0} answered`
        : 'none'}`,
    );

    // ── Publish the validated copy into the proposal's own sections ──
    // The editor, the image planner, the page-break rules and the printed pack
    // all read the report's own section set, so the validated copy is published
    // into it rather than into a structure of the writer's own. A writer section
    // this report type has no home for is a failure, never a silent omission.
    const { bodies, unmapped } = composeWriterSectionBodies({
      output: attempt.record.gpt_output,
      mode: attempt.record.evidence_pack?.mode || 'single',
      sectionTypes: sectionDefs.map((section) => section.type),
    });
    if (bodies.length === 0 || unmapped.length > 0) {
      console.error(
        `[generateProposal] validated copy could not be published | report_type=${resolvedType} `
        + `unmapped=${unmapped.join(', ') || 'none'} bodies=${bodies.length}`,
      );
      throw new Error(
        `The validated copy could not be published into a ${resolvedType} report, so no proposal was saved.`,
      );
    }

    const bodyByType = new Map(bodies.map((body) => [body.section_type, body.html]));
    // The calculated highlights rows are frozen engineering evidence, not copy:
    // they are read from the same frozen snapshot the report was generated from,
    // so the table the highlights page prints is unchanged by this pass. A
    // comparison keeps the calculated comparison table its section already
    // carries, and is therefore left alone here.
    const summaryHighlightRows = resolvedType === 'system_summary'
      ? mergeHighlightRows(selectHighlightRows(engineering_snapshot), null)
      : null;

    await Promise.all(sectionRecords.map((section) => {
      const html = bodyByType.get(section.section_type);
      // A section with no validated copy is not part of the document. Presented
      // Options exists only where the project states alternatives, so a project
      // of ordinary room images never gains an empty options page.
      if (!html) {
        if (section.section_type === PRESENTED_OPTIONS_SECTION_TYPE) {
          return base44.entities.ProposalSection.update(section.id, { is_enabled: false });
        }
        return null;
      }
      return base44.entities.ProposalSection.update(section.id, {
        body: html,
        ...(summaryHighlightRows && section.section_type === HIGHLIGHTS_SECTION_TYPE
          ? { metadata: { highlight_rows: summaryHighlightRows } }
          : {}),
        last_gpt_generated_at: generatedAt,
      });
    }));

    if (resolvedType === 'comparison') {
      const highlights = sectionRecords.find(s => s.section_type === HIGHLIGHTS_SECTION_TYPE);
      await verifyComparisonPersisted(base44, proposal.id, comparisonTable, versionEvidence, highlights?.id);
    }

    // ── Update Proposal status ──
    await base44.entities.Proposal.update(proposal.id, { status: 'generated' });

    const completedProposal = { ...proposal, status: 'generated' };
    return Response.json({
      proposal_id: proposal.id,
      proposal: completedProposal,
      section_count: sectionRecords.length,
      status: 'generated',
      idempotent_replay: false,
    });
  } catch (error) {
    const cleanupSucceeded = proposal?.id
      ? await rollbackCreatedProposal(base44, proposal.id, sectionRecords)
      : true;
    return Response.json({
      error: error?.message || 'Proposal generation failed.',
      cleanup_succeeded: cleanupSucceeded,
      proposal_id: cleanupSucceeded ? null : proposal?.id || null,
    }, { status: 500 });
  }
}

/**
 * The sentence a draft that failed the approved writer's own contract is
 * reported with. The reasons themselves are logged server-side; the designer is
 * told what happened to the proposal and what to do about it.
 */
const WRITER_DRAFT_REJECTED_MESSAGE =
  'The proposal copy did not pass its evidence check, so no proposal was saved. '
  + 'Generate the proposal again, and if this repeats, contact support.';

/**
 * The approved writer's configuration, read for one value only: the model
 * override a master admin may have set through manageProposalWriterFlag.
 *
 * Generation is not gated on the writer's controlled-test flag — writing the
 * proposal IS the writer's job — so the flag's enablement is deliberately not
 * read here. When no override exists the writer's own default model is used.
 */
async function readWriterConfig(base44) {
  try {
    const result = await base44.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
    const record = (Array.isArray(result) ? result : (result?.items || []))[0] || null;
    return normaliseGptWriterConfig(record?.[GPT_WRITER_FLAG_FIELD] || null);
  } catch {
    // An unreadable configuration leaves the writer on its own default model, so
    // generation is never blocked by a settings read.
    return normaliseGptWriterConfig(null);
  }
}

async function rollbackCreatedProposal(base44, proposalId, knownSections = []) {
  if (!base44 || !proposalId) return true;
  try {
    const discovered = await base44.entities.ProposalSection.filter({ proposal_id: proposalId });
    const sectionIds = [...new Set([
      ...knownSections.map((section) => section?.id),
      ...(discovered || []).map((section) => section?.id),
    ].filter(Boolean))];

    const sectionDeletes = await Promise.allSettled(
      sectionIds.map((sectionId) => base44.entities.ProposalSection.delete(sectionId))
    );
    const sectionsRemoved = sectionDeletes.every((result) => result.status === 'fulfilled');
    if (!sectionsRemoved) {
      await base44.entities.Proposal.update(proposalId, { status: 'draft' });
      return false;
    }

    await base44.entities.Proposal.delete(proposalId);
    return true;
  } catch {
    try {
      await base44.entities.Proposal.update(proposalId, { status: 'draft' });
    } catch {
      // Best effort: a remaining Draft card is safer than a misleading Generated card.
    }
    return false;
  }
}