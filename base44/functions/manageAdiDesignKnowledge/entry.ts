/**
 * manageAdiDesignKnowledge (backend function)
 * -------------------------------------------
 * THE ONE PLACE LEARNED DESIGN KNOWLEDGE IS WRITTEN, AND THE ONLY PLACE IT IS CURATED.
 *
 * WHY IT EXISTS. A designer answering a clarification in the proposal wizard teaches
 * ADI a reason. That reason is stored as a structured record — topic, design
 * condition, canonical meaning, internal source references, confidence — and, when
 * the same reason arrives from three separate projects, it becomes learned knowledge
 * so the question is not asked again.
 *
 * TWO DOORS, ONE RULE EACH:
 *
 *   capture (any signed-in user) — the designer's own answer is turned into a learning
 *   candidate and reconciled with the records that exist. Passing a question, a blank
 *   answer, a project result, a project-specific constraint, a budget, a price, an
 *   address or a personal detail is refused here with a stated reason: none of those
 *   is design knowledge, and the answer stays with the project it was given for.
 *   This door can only ever create or strengthen a record through the promotion rule;
 *   it can never invent agreement, and it never touches an engineering value.
 *
 *   curation (master admin only) — approve, edit, disable, enable, merge duplicates or
 *   reset confidence. A non-admin caller is refused before anything is read or written.
 *
 * WRITES RUN UNDER THE SERVICE ROLE, so the knowledge table itself stays closed to
 * ordinary users: a dealer's browser can READ what ADI has learned (that is how a
 * question stops being asked) but can never write it. Reading is never a change:
 * knowledge is a design assistant, and everything here is subordinate to project
 * evidence, the designer's own answers and the published RP22/RP23 results.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  learningCandidateFromAnswer,
  reconcileKnowledge,
} from '../../shared/adiDesignKnowledge/adiDesignKnowledgeLearning.js';
import {
  CURATION_ACTION,
  applyAdminAction,
} from '../../shared/adiDesignKnowledge/adiDesignKnowledgeCuration.js';
import {
  applyKnowledgeToQuestions,
  designIntentFor,
} from '../../shared/adiDesignKnowledge/adiDesignKnowledgeGating.js';

const KNOWLEDGE_LIMIT = 500;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || 'capture');
    const isAdmin = user.role === 'admin';
    const isCuration = Object.values(CURATION_ACTION).includes(action);

    if (isCuration && !isAdmin) {
      return Response.json({ error: 'Forbidden', reason: 'curation_is_master_admin_only' }, { status: 403 });
    }

    const now = new Date().toISOString();

    if (action === 'capture') {
      const built = learningCandidateFromAnswer({
        question: payload?.question || null,
        answer: payload?.answer ?? null,
        identity: { projectId: payload?.projectId || null, userId: user.id },
        condition: payload?.condition || null,
        now,
      });
      // A refused answer is a normal outcome, not an error: nothing is learned from it
      // and the answer itself stays with the project, exactly as before.
      if (!built.learnable) {
        return Response.json({ learned: false, reason: built.reason, outcome: 'not_learnable' });
      }

      const existing = await base44.asServiceRole.entities.AdiDesignKnowledge
        .filter({ knowledge_key: built.candidate.knowledge_key }, { limit: 5 });
      const items = Array.isArray(existing) ? existing : (existing?.items || []);
      const result = reconcileKnowledge({ items, candidate: built.candidate, now });
      const held = items.find((item) => String(item?.knowledge_key || '') === built.candidate.knowledge_key) || null;

      const { id, created_date, updated_date, created_by_id, ...record } = result.record || {};
      const saved = held
        ? await base44.asServiceRole.entities.AdiDesignKnowledge.update(held.id, record)
        : await base44.asServiceRole.entities.AdiDesignKnowledge.create(record);

      return Response.json({
        learned: true,
        outcome: result.outcome,
        status: saved?.status || record.status,
        confidence: saved?.confidence ?? record.confidence,
        knowledge_key: record.knowledge_key,
      });
    }

    // READ-ONLY: what ADI already understands about THIS design. The questions are
    // handed through the gating authority, which holds the authority order (project
    // evidence, this project's own answers, learned knowledge, then ask) and the
    // design-condition test. Nothing is written, and no knowledge record, confidence
    // score or source project is returned to the caller — only what to ask, what is
    // understood, and the design intent that may be carried as this design's own.
    if (action === 'gate') {
      const questions = Array.isArray(payload?.questions) ? payload.questions : [];
      if (questions.length === 0) {
        return Response.json({ questions: [], learned: [], confirmations: [] });
      }
      const listedKnowledge = await base44.asServiceRole.entities.AdiDesignKnowledge.list({ limit: KNOWLEDGE_LIMIT });
      const knowledge = Array.isArray(listedKnowledge) ? listedKnowledge : (listedKnowledge?.items || []);
      const gated = applyKnowledgeToQuestions({
        questions,
        items: knowledge,
        projectAnswers: payload?.projectAnswers || {},
        projectEvidence: payload?.projectEvidence || {},
      });
      const withIntent = (matter) => ({
        question_id: matter.question_id,
        topic: matter.topic,
        condition: matter.condition,
        rationale: matter.rationale,
        intent: designIntentFor({
          topic: matter.topic,
          condition: matter.condition,
          rationale: matter.rationale,
        }),
        confirmation: matter.confirmation || null,
        question: matter.question || null,
      });
      return Response.json({
        questions: gated.questions,
        learned: gated.learned.map(withIntent),
        confirmations: gated.confirmations.map(withIntent),
      });
    }

    if (isCuration) {
      const listed = await base44.asServiceRole.entities.AdiDesignKnowledge.list({ limit: KNOWLEDGE_LIMIT });
      const items = Array.isArray(listed) ? listed : (listed?.items || []);
      const result = applyAdminAction({
        items,
        id: payload?.id || payload?.knowledge_key || null,
        action,
        value: payload?.value ?? null,
        intoId: payload?.intoId || null,
        admin: { name: user.full_name || user.email },
        now,
      });
      if (result.reason) {
        return Response.json({ error: 'Curation refused', reason: result.reason }, { status: 400 });
      }

      const changed = result.record;
      const { id, created_date, updated_date, created_by_id, ...record } = changed || {};
      const saved = id
        ? await base44.asServiceRole.entities.AdiDesignKnowledge.update(id, record)
        : null;
      if (result.removedId) {
        await base44.asServiceRole.entities.AdiDesignKnowledge.delete(result.removedId);
      }

      return Response.json({ outcome: result.outcome, record: saved || changed, removedId: result.removedId || null });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}