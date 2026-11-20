import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { discoverDesignContextQuestions } from '../../shared/designContext/designContextDiscovery.js';
import { confirmedQuestionIds, partitionByCurrency, CONTEXT_STATUS } from '../../shared/designContext/designContextModel.js';

/**
 * Discover the design context questions for a project version.
 *
 * Reads the project and version, runs the hybrid discovery (deterministic checks
 * plus guarded AI discovery), and returns the questions that still need answers.
 * Questions that have been answered or confirmed as no-reason (with a matching
 * decision fingerprint) are not asked again; they are returned as saved_items
 * for the designer to review.
 *
 * The designer's answers are never read here: only the saved item metadata
 * (question_id, status, decision_fingerprint) is used to suppress re-asking.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id, version_id } = body || {};
    if (!project_id || !version_id) {
      return Response.json({ error: 'project_id and version_id are required.' }, { status: 400 });
    }

    const accessContext = await resolveAccountAccess(base44, user);
    if (accessContext?.allowed !== true || accessContext.capabilities?.soundProof !== true) {
      return Response.json({ error: 'Sound Proof access is required.' }, { status: 403 });
    }

    const project = await base44.entities.Project.get(project_id).catch(() => null);
    if (!project?.id) return Response.json({ error: 'That project was not found.' }, { status: 404 });

    const version = await base44.entities.ProjectVersion.get(version_id).catch(() => null);
    if (!version?.id || String(version.project_id || '') !== String(project_id)) {
      return Response.json({ error: 'That design version is not part of this project.' }, { status: 404 });
    }

    // Read the saved design context for this version.
    const contextPage = await base44.entities.DesignContext.filter(
      { project_id, version_id },
      { limit: 1 },
    );
    const savedRecord = (contextPage?.items || [])[0] || null;
    const savedItems = Array.isArray(savedRecord?.context_items) ? savedRecord.context_items : [];

    // Discover questions from the current design state.
    const allQuestions = await discoverDesignContextQuestions({
      version,
      project,
      invokeLLM: (request) => base44.integrations.Core.InvokeLLM(request),
    });

    // Build the current fingerprints map from the discovery.
    const currentFingerprints = new Map(
      allQuestions.map((q) => [q.question_id, q.decision_fingerprint || null]),
    );

    // Partition saved items into current and stale.
    const { current: currentSaved, stale: staleSaved } = partitionByCurrency(savedItems, currentFingerprints);

    // Suppress questions that have been answered or confirmed as no-reason with
    // a matching decision fingerprint.
    const suppress = confirmedQuestionIds(currentSaved);

    // The questions to ask: those not suppressed.
    const questionsToAsk = allQuestions.filter((q) => !suppress.has(q.question_id));

    // The saved items to show for review (both current and stale).
    const savedForReview = [...currentSaved, ...staleSaved].map((item) => ({
      question_id: item.question_id,
      question: item.question,
      area: item.area,
      status: item.status,
      answer: item.answer,
      decision_fingerprint: item.decision_fingerprint,
      answered_at: item.answered_at,
      answered_by: item.answered_by,
      needs_reconfirmation: staleSaved.some((s) => s.question_id === item.question_id),
    }));

    return Response.json({
      ok: true,
      questions: questionsToAsk,
      saved_items: savedForReview,
      has_questions: questionsToAsk.length > 0,
      has_saved: savedForReview.length > 0,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'The design context could not be discovered.' }, { status: 500 });
  }
}