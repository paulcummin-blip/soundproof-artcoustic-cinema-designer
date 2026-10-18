import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { improveReportDesignIntentWording } from '../../shared/reportDesignIntent/improveReportDesignIntentWording.js';
import { improveProposalSectionWording } from '../../shared/adiEditorial/proposalSectionWordingEditorial.js';
import { buildProductGrounding, isGroundingUsable } from '../../shared/proposalProductGrounding.js';
import {
  ADI_KEPT_ORIGINAL_MESSAGE,
  ADI_UNCHANGED_MESSAGE,
  ADI_UNAVAILABLE_MESSAGE,
  ADI_PROVIDER_UNAVAILABLE_MESSAGE,
  ADI_IMPROVED_MESSAGE,
} from '../../shared/adiEditorial/adiEditorialStandard.js';

/**
 * THE ADI EDITORIAL ACTION — one action, two surfaces.
 *
 * "IMPROVE WORDING WITH ADI" improves the wording of copy the app has already
 * written, and nothing else. It serves both surfaces through the same action so
 * the designer meets one behaviour wherever they use it:
 *
 *   report_design_intent  the Project Report's saved Design Intent narrative
 *   proposal_section      one generated narrative section of a report
 *
 * IT IS EDITORIAL, NOT ENGINEERING. No engineering value is recomputed, no evidence
 * is re-derived and no writer is asked to write the copy again: the copy as it
 * stands is read with the evidence and the contract it was written under, ADI
 * proposes improved wording, the meaning-conservation gate refuses anything that
 * would change what is supported, and the surface's own validator — the writer's
 * output validator for the report narrative, the narrative grounding rules for a
 * section — is run again on the improved copy. Only wording that passes every one
 * of them is saved.
 *
 * BOTH WAYS OF WORKING ARE THE SAME ACTION:
 *
 *   mode 'section'    the whole copy is improved and saved;
 *   mode 'selection'  the text the designer highlighted is improved on its own and
 *                     returned WITHOUT a write, so the editor can splice it in; the
 *                     action is then called again with the spliced copy and the
 *                     improved highlighted text, which is proven mechanically to
 *                     differ from the stored copy in that one place only, and saved
 *                     only then.
 *
 * A REFUSAL IS A RESULT, NOT A FAILURE. When the improved wording is refused the
 * original copy stands, nothing is written and the designer is told plainly, in one
 * line, that the revised version changed the supported meaning. Undo puts back the
 * exact copy the pass replaced, and with it the approval identity of that wording.
 *
 * The provider is the platform AI gateway, called with the server session: there is
 * no API key in this app, in the browser bundle or in any client payload.
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      surface,
      action = 'improve',
      mode = 'section',
      project_id = null,
      version_id = null,
      proposal_id = null,
      section_id = null,
      selection_text = '',
      improved_selection = null,
      body_text = null,
    } = body || {};

    if (surface !== 'report_design_intent' && surface !== 'proposal_section') {
      return Response.json({ error: 'That wording cannot be improved here.' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.allowed !== true || accessContext.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required to improve this wording.' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const common = {
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
      user,
      now,
      action,
      mode,
      selectionText: selection_text || '',
      improvedSelection: improved_selection || null,
    };

    // ── THE ONE EVIDENCE PATH, surface by surface ──
    // The report reads the frozen report evidence it was written under; a section
    // reads the version's own product grounding. Neither re-derives a value.
    const outcome = surface === 'report_design_intent'
      ? await improveReportDesignIntentWording({
        ...common,
        entities: base44.entities,
        authorityEntities: base44.asServiceRole.entities,
        projectId: project_id || null,
        versionId: version_id || null,
        accountIdFallback: accessContext.user?.account_id || accessContext.account?.id || null,
        isMasterAdmin: accessContext.isMasterAdmin === true,
        bodyText: body_text,
      })
      : await improveProposalSectionWording({
        ...common,
        entities: base44.entities,
        proposalId: proposal_id || null,
        sectionId: section_id || null,
        bodyHtml: body_text,
        grounding: await sectionGrounding(base44, proposal_id),
      });

    // A surface, a project, a report or a section that cannot be used is stated
    // plainly, and nothing is written.
    if (!outcome.ok) {
      return Response.json(
        { error: outcome.block.error, reason: outcome.block.reason, details: outcome.block.detail || null },
        { status: outcome.block.status },
      );
    }

    const applied = outcome.applied === true;
    const improvedSelectionOnly = outcome.action === 'propose';
    const keptOriginal = !applied && !improvedSelectionOnly
      && (outcome.kept_original === true || outcome.outcome !== 'improved');

    console.log(
      `[improveAdiWording] surface=${surface} action=${outcome.action} mode=${outcome.mode} `
      + `applied=${applied} outcome=${outcome.outcome || 'none'} by=${user.email || user.id}`,
    );

    return Response.json({
      ok: true,
      applied,
      // The designer's own wording was refused: the copy stands, and this is the
      // one line they are shown about it.
      surface,
      action: outcome.action,
      mode: outcome.mode,
      outcome: outcome.outcome || null,
      kept_original: outcome.kept_original === true,
      // Whole-copy and highlighted rewrites both return the wording to apply. On a
      // highlighted rewrite nothing is saved yet: the editor splices this in and
      // calls again.
      improved_text: outcome.improved_text || null,
      previous_text: outcome.previous_text || null,
      can_undo: outcome.can_undo === true,
      message: applied
        ? ADI_IMPROVED_MESSAGE
        : (keptOriginal
          ? refusalMessage(outcome)
          : improvedSelectionOnly ? null : messageFor(outcome.outcome)),
      // The reason the wording was kept, for a MASTER ADMIN alone: an ordinary
      // designer is given the plain line above and no rule, code or claim ID.
      diagnostics: accessContext.isMasterAdmin === true
        ? { outcome: outcome.outcome || null, reason: outcome.reason || null }
        : null,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The wording could not be improved.' }, { status: 500 });
  }
}

/** The plain line for a pass that ended without a change. */
function messageFor(outcome) {
  if (outcome === 'unchanged') return ADI_UNCHANGED_MESSAGE;
  if (outcome === 'nothing_to_improve') return ADI_UNCHANGED_MESSAGE;
  if (outcome === 'writer_flag_off') return ADI_UNAVAILABLE_MESSAGE;
  if (outcome === 'provider_failed') return ADI_PROVIDER_UNAVAILABLE_MESSAGE;
  return ADI_UNCHANGED_MESSAGE;
}

/**
 * The one line a refusal is shown with: the copy stands, and the reason is that the
 * revised version changed the supported meaning.
 */
function refusalMessage() {
  return ADI_KEPT_ORIGINAL_MESSAGE;
}

/**
 * The version's own product grounding, read from the proposal's frozen evidence
 * identity — the same authority a regenerated section is held to. It is optional:
 * where a comparison's table is not complete enough to ground names against, no
 * grounding is imposed rather than a wrong one.
 */
async function sectionGrounding(base44, proposalId) {
  if (!proposalId) return null;
  try {
    const proposals = await base44.entities.Proposal.filter({ id: proposalId });
    const proposal = proposals?.[0];
    if (!proposal) return null;
    const grounding = buildProductGrounding({
      snapshot: proposal.engineering_snapshot || null,
      resolvedType: proposal.proposal_type,
      comparisonTable: proposal.metadata?.comparison_table || null,
      versionEvidence: proposal.metadata?.selected_versions || [],
    });
    return isGroundingUsable(grounding) ? grounding : null;
  } catch {
    return null;
  }
}