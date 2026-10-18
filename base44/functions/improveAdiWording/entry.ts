import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readOnlyAccountEntities, resolveAccountAccessReadOnly } from '../../shared/accountAccessReadOnly.js';
import { improveReportDesignIntentWording } from '../../shared/reportDesignIntent/improveReportDesignIntentWording.js';
import { improveProposalSectionWording } from '../../shared/adiEditorial/proposalSectionWordingEditorial.js';
import { persistAdiProposalSectionRevision } from '../../shared/proposalEdit/persistAdiProposalSectionRevision.js';
import { readOnlyEntities } from '../../shared/reportDesignIntent/readOnlyEntities.js';
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
 * WHAT IT MAY TOUCH. It reads the project, its versions, the report the narrative
 * lives on and the proposal's own images, and it writes the one record whose wording
 * it improves. Its entity surface is narrowed to exactly that, so no create and no
 * delete exists anywhere in its path.
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

    // ── AUTHORISATION, BY READS ALONE ──
    // The identical account-access decision the shared resolver reaches, resolved
    // through a door that carries reads and no write at all: authorising this action
    // performs no account maintenance, keeps no books and cannot change a record.
    const accessContext = await resolveAccountAccessReadOnly({
      base44,
      entities: readOnlyAccountEntities(base44.asServiceRole.entities),
      sessionUser: user,
    });
    if (accessContext?.allowed !== true || accessContext.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required to improve this wording.' }, { status: 403 });
    }

    // ── WHAT THIS ACTION MAY TOUCH ──
    // The editorial client is the action's own entity surface, narrowed to the reads
    // it makes and the one write it performs, and the writer switch is read through a
    // read-only authority door. Nothing below is handed a client that can create or
    // delete a record.
    const editorial = editorialEntities(base44.entities);
    const authority = readOnlyEntities(base44.asServiceRole.entities).entities;

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
        entities: editorial,
        authorityEntities: authority,
        projectId: project_id || null,
        versionId: version_id || null,
        accountIdFallback: accessContext.user?.account_id || accessContext.account?.id || null,
        isMasterAdmin: accessContext.isMasterAdmin === true,
        bodyText: body_text,
      })
      : await improveProposalSectionWording({
        ...common,
        entities: editorial,
        proposalId: proposal_id || null,
        sectionId: section_id || null,
        bodyHtml: body_text,
        grounding: await sectionGrounding(editorial, proposal_id),
        persistRevision: persistAdiProposalSectionRevision,
      });

    // A surface, a project, a report or a section that cannot be used is stated
    // plainly, and nothing is written.
    if (!outcome.ok) {
      return Response.json(
        {
          error: outcome.block.error,
          reason: outcome.block.reason,
          details: outcome.block.detail || null,
          // A block writes nothing either, so its diagnostic is returned the same
          // way — and to a master admin alone.
          diagnostics: accessContext.isMasterAdmin === true
            ? (outcome.block.diagnostics || null)
            : null,
        },
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

    const message = applied
      ? ADI_IMPROVED_MESSAGE
      : (keptOriginal
        ? refusalMessage(outcome)
        : improvedSelectionOnly ? null : messageFor(outcome.outcome));

    return Response.json({
      ok: true,
      applied,
      // The outcome stated in the response's own words, so a caller reads it rather
      // than inferring it from ok and applied.
      accepted: applied,
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
      message,
      // The same line, under the name a caller reads the refusal with.
      userMessage: message,
      // ── DIAGNOSIS, FOR A MASTER ADMIN ALONE ──
      // A refused rewrite is a ZERO-WRITE outcome: the copy stands, and nothing
      // about the refusal is stored on the section, the snapshot or anywhere else in
      // the project. Its evidence therefore exists only here, in the response to the
      // button that asked for it — the copy as it stood, the copy that was refused,
      // the stage that refused it and every violation it was refused for.
      //
      // An ordinary designer is given the plain line above and nothing else: no
      // rule, no code, no extracted value and no candidate copy ever reaches a
      // dealer's browser.
      diagnostics: accessContext.isMasterAdmin === true
        ? {
          outcome: outcome.outcome || null,
          reason: outcome.reason || null,
          ...(outcome.diagnostics || {}),
        }
        : null,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The wording could not be improved.' }, { status: 500 });
  }
}

/**
 * THE ACTION'S ENTITY SURFACE, NARROWED TO WHAT IT ACTUALLY DOES.
 *
 * The editorial action reads the project, its versions, the report the narrative
 * lives on and the proposal's own images, and writes the one record whose wording it
 * improves. Everything else is out of reach, so the action is never handed a client
 * that can create or delete: the capability it needs is the capability it holds.
 *
 * The authority door is read-only for the same reason — the writer switch is the only
 * thing read through it.
 */
const EDITORIAL_READ = Object.freeze(['get', 'list', 'filter', 'count', 'aggregate']);
const EDITORIAL_SURFACE = Object.freeze({
  Project: EDITORIAL_READ,
  ProjectVersion: EDITORIAL_READ,
  ReportSnapshot: Object.freeze([...EDITORIAL_READ, 'update']),
  ProposalAsset: EDITORIAL_READ,
  Proposal: EDITORIAL_READ,
  ProposalGeneration: EDITORIAL_READ,
  ProposalEdit: Object.freeze([...EDITORIAL_READ, 'create']),
  ProposalSection: Object.freeze([...EDITORIAL_READ, 'update']),
});

function editorialEntities(entities) {
  const surface = {};
  for (const [name, methods] of Object.entries(EDITORIAL_SURFACE)) {
    const entity = entities?.[name];
    if (!entity) continue;
    surface[name] = methods.reduce((allowed, method) => {
      if (typeof entity[method] === 'function') {
        allowed[method] = (...args) => entity[method](...args);
      }
      return allowed;
    }, {});
  }
  return surface;
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
async function sectionGrounding(entities, proposalId) {
  if (!proposalId) return null;
  try {
    const proposals = await entities.Proposal.filter({ id: proposalId });
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