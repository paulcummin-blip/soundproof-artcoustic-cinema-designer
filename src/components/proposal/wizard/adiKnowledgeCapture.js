/**
 * adiKnowledgeCapture.js
 * ----------------------
 * HANDING ONE CLARIFICATION ANSWER TO ADI'S LEARNING AUTHORITY.
 *
 * WHY IT EXISTS. When a designer explains a decision, that explanation is worth
 * keeping as a structured learning candidate. The wizard sends the answer, the
 * question it answered and the project it was given for; the backend decides what
 * may be learned, reconciles it with what is already known, and applies the
 * promotion rule. Nothing about that decision is made here.
 *
 * WHAT IT NEVER DOES. It never blocks, delays or interrupts the designer: learning
 * is an assistant, so a failure to record it is silent and the answer continues to
 * be used exactly as before. It never sends anything the designer did not type, and
 * it never sends the design's own figures — a project result is not knowledge.
 */

import { base44 } from '@/api/base44Client';

/**
 * Capture one clarification answer as a learning candidate.
 *
 * @param {Object} input
 * @param {Object} input.question — the clarification that was answered
 * @param {string} input.answer — the designer's own words
 * @param {string} [input.projectId]
 * @param {Object} [input.condition] — the design condition, where the caller has it
 * @returns {Promise<Object|null>} the learning outcome, or null when nothing was recorded
 */
export async function captureAdiClarificationLearning({
  question = null,
  answer = null,
  projectId = null,
  condition = null,
} = {}) {
  const text = typeof answer === 'string' ? answer.trim() : '';
  if (!question || !text) return null;
  try {
    const response = await base44.functions.invoke('manageAdiDesignKnowledge', {
      action: 'capture',
      question: {
        question_id: question.question_id || null,
        area: question.area || null,
        question: question.question || null,
      },
      answer: text,
      projectId: projectId || null,
      condition: condition || null,
    });
    return response?.data || null;
  } catch {
    // Design knowledge is an assistant, never a dependency: if it cannot be recorded
    // the designer carries on and the answer is used for this project as before.
    return null;
  }
}

export default captureAdiClarificationLearning;