import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { resolveEditorLayer, EDITOR_MODE } from '../../shared/proposalEdit/proposalEditEditorModel.js';
import { resolveProposalReview } from '../../shared/proposalEdit/proposalReviewAuthority.js';
import { readCompleteDocument, readProposalRecords } from '../../shared/proposalEdit/readCompleteDocument.js';
import { resolveSectionApproval } from '../../shared/proposalApproval/sectionApprovalAuthority.js';
import { authorizeProposalExport } from '../../shared/proposalEdit/proposalExportAuthorization.js';
import { briefCoverageGate } from '../../shared/proposalWriter/proposalBriefCoverageGate.js';
import { resolvePublicationBodies } from '../../shared/proposalEdit/publicationCopyAuthority.js';
import {
  composeWriterSectionBodies,
  writerDraftsFromProposalSectionBody,
} from '../../shared/proposalWriter/writerSectionMapping.js';
import { GPT_WRITER_FLAG_FIELD, gptWriterClientState, resolveGptWriterFlag } from '../../shared/proposalWriter/proposalWriterFlag.js';

/**
 * Read the Proposal Editor's copy layer for one proposal.
 *
 * The editor renders what this returns and decides nothing of its own: which copy
 * there is to show (the latest valid edit, else the validated GPT output), whether
 * it may be issued, exported, completed or sent, the nine sections it may edit
 * with their word limits, the plain-language status and issues, and the copies a
 * revert can restore.
 *
 * The rules live in the shared Phase 3 and Phase 4 modules, so the browser holds
 * no second copy of them and a validation rule can never drift between the two.
 *
 * The audit block — the generation version, every edit, its validation status,
 * who saved it, when, and the fingerprints each record was filed under — is
 * returned to a MASTER ADMIN only, and it is the administrative diagnostics view
 * that asks for it. The Proposal Editor is never given it, so the model, provider,
 * prompt version, fingerprints, record IDs and report-snapshot counts cannot
 * appear in a dealer's editor, and a client login receives the model without any
 * audit detail at all. The records are untouched: the same history is read.
 *
 * The Phase 6 GPT writer flag is resolved here too, from SystemConfig and for
 * this login only, and returned as a resolved state: whether the action may be
 * shown, and its label. The browser is never given the scope lists, and it cannot
 * switch the writer on for itself.
 *
 * Which copy the document publishes is resolved by the publication copy authority:
 * the designer's own wording, where they have approved it as it stands, and the
 * validated generation or edit copy everywhere else. The history is read exactly
 * as it always was — it simply no longer overrides copy the designer has approved.
 *
 * The editor fields are seeded from the PUBLICATION bodies — the approved stored
 * body where the designer has approved one, and the validated generation/edit
 * copy everywhere else — so "Edit copy" opens the text the client actually reads.
 * The mapping from document section types (system_design_summary) to writer
 * contract IDs (decision_summary, what_stays_same, what_changes) is handled by
 * the shared section mapping module, which parses the structured <h2> headings
 * the validated copy was published under. Latest valid edits are never replaced
 * by stale raw ProposalSection bodies: only an APPROVED stored body overrides the
 * validated copy.
 *
 * The Steering Brief coverage check is a REVIEW SURFACE only. It reports
 * outstanding brief items with plain dealer-facing section labels, but it never
 * blocks issue/send or changes the readiness, gate, export-blocked reason or
 * status label. Hard enforcement is deferred behind an explicit, off-by-default
 * rollout setting until the coverage checker is reliable enough to gate without
 * false positives. The existing evidence and approval gates remain the sole
 * authorities.
 *
 * This function is PURE: it reads records and returns a model. It never writes,
 * updates, creates or deletes any record.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { proposal_id, draft_proposal_id } = body || {};

    if (!proposal_id && !draft_proposal_id) {
      return Response.json({ error: 'proposal_id or draft_proposal_id required' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    // Diagnostics are administrative, so only a master admin is given the audit
    // block — not an account with Sound Proof access, and not merely because a
    // login holds an administrator account. A dealer's editor is never sent the
    // generation's model, provider, prompt version, fingerprints or record IDs, so
    // it cannot show them even by accident.
    const canViewAudit = accessContext?.allowed === true && accessContext.isMasterAdmin === true;

    const query = proposal_id ? { proposal_id } : { draft_proposal_id };

    const [generationRecords, editRecords] = await Promise.all([
      readProposalRecords(base44.entities.ProposalGeneration, query),
      readProposalRecords(base44.entities.ProposalEdit, query),
    ]);

    const layer = resolveEditorLayer({
      generationRecords,
      editRecords,
      proposalId: proposal_id ?? null,
      draftProposalId: draft_proposal_id ?? null,
      canViewAudit,
    });

    layer.proposal_id = proposal_id || null;
    if (proposal_id) {
      const proposal = await base44.entities.Proposal.get(proposal_id);
      if (!proposal) return Response.json({ error: 'Proposal not found.' }, { status: 404 });
      const documentValidation = await readCompleteDocument(base44.entities, proposal, { generationRecords, editRecords });
      // The HUMAN approval state, resolved from the same document check: which
      // sections the client reads generated narrative in, and whether each one's
      // approval still matches the wording it was given for. It is a separate
      // answer from the evidence check on purpose — a document can pass every
      // check and still be unapproved — and the stored rows it was resolved from
      // are not sent to the editor: the editor is given the state, not a second
      // copy of every body.
      const approval = resolveSectionApproval({
        sections: documentValidation.sections || [],
        publishedSections: documentValidation.document_sections || [],
      });
      // Capture the raw stored section rows before they are removed from the
      // validation object. They are the single source of truth for the text the
      // designer saved (manual revisions included), used below to seed the
      // editor fields via the publication body mapping and to run the Steering
      // Brief coverage check.
      const storedSections: Array<{ section_type: string; body: string; is_enabled?: boolean }> =
        Array.isArray(documentValidation.sections) ? documentValidation.sections : [];
      delete documentValidation.sections;

      // ── Seed the editor fields from the PUBLICATION bodies ──
      // The editor fields use writer contract IDs (decision_summary,
      // what_stays_same, what_changes, etc.), but the stored sections use
      // document section types (system_design_summary, etc.). The mapping is
      // handled by the shared section mapping module: composeWriterSectionBodies
      // converts the validated copy (writer sections) into document section HTML,
      // resolvePublicationBodies selects the approved stored body where the
      // designer has approved one (and the validated copy everywhere else), and
      // writerDraftsFromProposalSectionBody parses the publication body back into
      // writer-section drafts using the structured <h2> headings the validated
      // copy was published under.
      //
      // Only an APPROVED stored body overrides the validated copy, so latest
      // valid edits are never replaced by stale raw ProposalSection bodies. The
      // editor opens the text the client actually reads.
      if (layer.mode === EDITOR_MODE.EDIT_LAYER && Array.isArray(layer.export_sections)) {
        const proposalMode = layer.proposal_mode || 'comparison';
        // Convert the validated copy (writer sections with plain text) to
        // document section HTML bodies, keyed by document section type.
        const composed = composeWriterSectionBodies({
          output: { sections: layer.export_sections },
          mode: proposalMode,
        });
        const copyBodies = new Map<string, string>();
        for (const entry of composed.bodies || []) {
          if (entry?.section_type && typeof entry.html === 'string' && entry.html.trim()) {
            copyBodies.set(entry.section_type, entry.html);
          }
        }
        // Resolve the publication bodies: approved stored body where the
        // designer has approved one, and the validated copy everywhere else.
        const { bodies: publicationBodies } = resolvePublicationBodies({
          sections: storedSections,
          copyBodies,
          proposalType: proposal.proposal_type || null,
        });
        // Recover writer-section drafts from each publication body. The
        // structured heading parser splits the opening section (which carries
        // three writer sections) back into its parts. Where the parser throws
        // (headings missing or reordered by a manual edit), fall back to the
        // validated copy for that section — the editor is never broken by a
        // stored body that no longer matches the expected structure.
        const writerDrafts = new Map<string, string>();
        for (const [sectionType, pubBody] of publicationBodies.entries()) {
          if (typeof pubBody !== 'string' || !pubBody.trim()) continue;
          try {
            const drafts = writerDraftsFromProposalSectionBody({
              sectionType,
              body: pubBody,
              mode: proposalMode,
            });
            for (const [writerSectionId, text] of Object.entries(drafts)) {
              if (typeof text === 'string' && text.trim()) {
                writerDrafts.set(writerSectionId, text);
              }
            }
          } catch {
            layer.editor_source_error = 'The saved wording has a different heading structure. Edit the current section in the document below; the copy editor cannot safely split it into fields.';
          }
        }
        // Seed the editor fields, export_sections and copy.sections from the
        // recovered writer drafts. Where no publication body was recovered for
        // a writer section, the existing validated copy is kept unchanged.
        if (writerDrafts.size > 0) {
          const reseed = (entry: { section: string; text: string; [k: string]: unknown }) => {
            const text = writerDrafts.get(entry.section);
            return typeof text === 'string' && text.trim()
              ? { ...entry, text }
              : entry;
          };
          if (Array.isArray(layer.fields)) {
            layer.fields = layer.fields.map((field: { section: string; text: string; present?: boolean }) => {
              const text = writerDrafts.get(field.section);
              return typeof text === 'string' && text.trim()
                ? { ...field, text, present: true }
                : field;
            });
          }
          if (Array.isArray(layer.export_sections)) {
            layer.export_sections = layer.export_sections.map(reseed);
          }
          if (layer.copy?.sections && Array.isArray(layer.copy.sections)) {
            layer.copy.sections = layer.copy.sections.map(reseed);
          }
        }
      }

      layer.approval = approval;
      layer.document_validation = documentValidation;
      // What still needs a human, classified for the editor: the document's own
      // integrity (the evidence check) apart from the generated copy awaiting
      // approval (the copy review), with each section named the way the client
      // reads it. Presentation of the check above, which is unchanged — every
      // sentence is the one the plain-language authority already states for that
      // rejection, and no validation outcome is decided here.
      layer.review = resolveProposalReview({ validation: documentValidation, fields: layer.fields });

      // ── Steering Brief coverage: REVIEW SURFACE ONLY ──
      // The check runs against the proposal's own brief and its current section
      // text, so a designer who edits the copy to address a gap sees the review
      // update without having to regenerate. It is carried as a review signal
      // (layer.brief_coverage) with plain dealer-facing section labels, but it
      // NEVER changes layer.ready, layer.gate.issuable,
      // layer.export_blocked_reason or layer.status_label. Hard enforcement is
      // deferred behind an explicit, off-by-default rollout setting until the
      // coverage checker is reliable. The existing evidence and approval gates
      // remain the sole authorities for issue/send.
      const briefSections = storedSections
        .filter((s) => s && typeof s === 'object' && s.body && s.is_enabled !== false)
        .map((s) => ({ section: s.section_type, text: s.body || '' }));
      layer.brief_coverage = briefCoverageGate(proposal, briefSections, { hard_enforcement: false });
      layer.ready = documentValidation.valid && !layer.brief_coverage.outstanding.length;
      layer.status_label = layer.brief_coverage.outstanding.length
        ? 'Steering Brief needs review'
        : (documentValidation.valid ? 'Ready to issue' : 'Needs review');
      layer.export_blocked_reason = documentValidation.blocked_reason;
      if (layer.editor_source_error) layer.fields = [];

      if (body.action === 'export') {
        // Enforcement of the approval rule, server-side, where no client can skip
        // it: nothing carrying the generated copy is issued before a person has
        // approved every section that carries it.
        const authorization = authorizeProposalExport({ validation: documentValidation, proposal, request: body, copy: layer.export_sections, approval });
        if (!authorization.allowed) return Response.json({ error: authorization.reason }, { status: 409 });
      }
    }

    // The writer flag, resolved server-side for this login only. It defaults OFF:
    // while it is off the editor simply shows no writer action.
    let writer = gptWriterClientState(null);
    try {
      const configResult = await base44.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
      const configRecord = (Array.isArray(configResult) ? configResult : (configResult?.items || []))[0] || null;
      writer = gptWriterClientState(resolveGptWriterFlag({
        config: configRecord?.[GPT_WRITER_FLAG_FIELD] || null,
        accountId: accessContext.user?.account_id || accessContext.account?.id || null,
        email: user.email || null,
        isMasterAdmin: accessContext.isMasterAdmin === true,
      }));
    } catch (flagError) {
      // A flag that cannot be read is a flag that is off.
      writer = gptWriterClientState(null);
    }

    return Response.json({ ok: true, layer, can_view_audit: canViewAudit, writer });
  } catch (error) {
    return Response.json({ error: error?.message || 'The proposal copy history could not be read.' }, { status: 500 });
  }
}