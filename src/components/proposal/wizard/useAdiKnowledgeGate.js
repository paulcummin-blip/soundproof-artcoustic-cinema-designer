/**
 * useAdiKnowledgeGate
 * -------------------
 * WHAT ADI ALREADY UNDERSTANDS ABOUT THIS DESIGN, BEFORE THE DESIGNER IS ASKED.
 *
 * WHY IT EXISTS. ADI asks a designer why a decision was made. Where the same reason
 * has already been given for this kind of design — the same topic under the same
 * design condition — the question is answered, and asking it again wastes the
 * designer's time. This hook asks the learning authority what it understands and
 * returns:
 *
 *   questions      — what still has to be asked
 *   learned        — matters ADI understands: the question is not asked at all, and
 *                    the understanding is carried as this design's own intent
 *   confirmations  — matters ADI half knows: a lightweight confirmation with
 *                    "Use this" / "Explain differently" instead of the full form
 *
 * WHAT IT NEVER DOES. It decides nothing itself: the authority order (project
 * evidence, the designer's own answers, learned knowledge, then ask) and the design
 * condition test live in the gating authority, and the reading happens behind the
 * backend function — so no learning machinery, confidence score or knowledge record
 * ever reaches the browser. A failed read is not an error: it simply means ADI asks
 * exactly as it did before any of this existed.
 */

import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';

const EMPTY = Object.freeze({ questions: [], learned: [], confirmations: [] });

export default function useAdiKnowledgeGate({ questions = [], projectAnswers = {} } = {}) {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  const questionsKey = useMemo(
    () => JSON.stringify((Array.isArray(questions) ? questions : [])
      .map((question) => [question?.question_id || null, question?.area || null])),
    [questions],
  );
  const answersKey = useMemo(() => JSON.stringify(projectAnswers || {}), [projectAnswers]);

  useEffect(() => {
    const asked = JSON.parse(questionsKey);
    if (asked.length === 0) {
      setState(EMPTY);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const response = await base44.functions.invoke('manageAdiDesignKnowledge', {
          action: 'gate',
          questions,
          projectAnswers: JSON.parse(answersKey),
        });
        const data = response?.data || {};
        if (!cancelled) {
          setState({
            questions: Array.isArray(data.questions) ? data.questions : [],
            learned: Array.isArray(data.learned) ? data.learned : [],
            confirmations: Array.isArray(data.confirmations) ? data.confirmations : [],
          });
        }
      } catch {
        // Design knowledge is an assistant, never a dependency: if it cannot be read,
        // the designer is asked exactly as they were before it existed.
        if (!cancelled) setState({ ...EMPTY, questions });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [questionsKey, answersKey]);

  return { ...state, loading };
}