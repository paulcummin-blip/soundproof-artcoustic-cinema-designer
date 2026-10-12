import React, { useState } from 'react';
import { CheckCircle2, CircleHelp, MinusCircle, RefreshCw } from 'lucide-react';

/**
 * Step — Clarifications.
 *
 * ADI asks at most three questions about decisions the frozen evidence records no
 * reason for. Each question offers ANSWER or PASS, answers may be as short or as
 * detailed as the designer likes, and nothing is compulsory: the designer can
 * continue to the proposal at any point, answering none of them.
 *
 * An answer is collected here and kept SEPARATELY from the Client Brief — the
 * brief is never written into, and an answer is never published as its text. A
 * passed question is not an answer: it is recorded as passed, and no reason is
 * ever invented for it.
 *
 * The questions come from the proposal wizard, which reads them from the same
 * suggestion authority the Client Brief step uses (generateAdiNarrativeSuggestions).
 * Where the design context is complete, the list is empty and this step says so.
 */
export default function ClarificationStep({
  questions = [],
  answers = {},
  loading = false,
  onAnswer,
  onRefresh,
}) {
  const [draft, setDraft] = useState({});

  const draftFor = (id) => (draft[id] !== undefined ? draft[id] : (answers[id]?.answer || ''));

  const saveAnswer = (question) => {
    const value = String(draftFor(question.question_id) || '').trim();
    if (!value) return;
    onAnswer?.(question, { status: 'answered', answer: value });
    setDraft((current) => ({ ...current, [question.question_id]: undefined }));
  };

  const passQuestion = (question) => {
    onAnswer?.(question, { status: 'passed', answer: null });
  };

  const answerInstead = (question) => {
    onAnswer?.(question, { status: 'none', answer: null });
  };

  return (
    <div>
      <div className="mb-6">
        <h3
          className="text-lg font-semibold text-[#1B1A1A] mb-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Clarifications
        </h3>
        <p className="text-xs text-[#625143] leading-relaxed">
          ADI asks only where a design decision has no reason on record and the client would
          understand the design better for knowing it. Answer what you can, pass what you would
          rather not explain, and continue at any point. Nothing here is required.
        </p>
      </div>

      {loading && (
        <p className="text-[11px] text-[#8A8477] mb-3">Reading this design for anything left unexplained…</p>
      )}

      {!loading && questions.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[#E5E1D8] bg-[#F9F8F5] p-4">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-[#213428]" />
          <p className="text-xs text-[#625143] leading-relaxed">
            No clarifications needed for this design: every decision ADI would ask about is already
            explained by the design interpretation or your brief.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {questions.map((question) => {
          const state = answers[question.question_id] || {};
          const passed = state.status === 'passed';
          const answered = state.status === 'answered' && Boolean(state.answer);
          return (
            <div
              key={question.question_id}
              className="rounded-lg border border-[#E5E1D8] bg-white p-4"
            >
              <div className="flex items-start gap-2 mb-3">
                <CircleHelp className="w-4 h-4 mt-0.5 text-[#A79E8C]" />
                <p
                  className="text-sm text-[#1B1A1A] leading-relaxed"
                  style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                >
                  {question.question}
                </p>
              </div>

              {passed ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#625143]">
                    <MinusCircle className="w-3.5 h-3.5" />
                    Passed — the proposal will not explain this decision
                  </span>
                  <button
                    type="button"
                    onClick={() => answerInstead(question)}
                    className="text-[11px] text-[#213428] underline underline-offset-2 hover:no-underline"
                  >
                    Answer instead
                  </button>
                </div>
              ) : (
                <>
                  <textarea
                    value={draftFor(question.question_id)}
                    onChange={(e) => setDraft((current) => ({ ...current, [question.question_id]: e.target.value }))}
                    rows={3}
                    placeholder="Your reason, in your own words — as short or as detailed as you like."
                    className="w-full p-3 text-sm text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
                    style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => saveAnswer(question)}
                      disabled={!String(draftFor(question.question_id) || '').trim()}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#213428] rounded-md hover:bg-[#2C4436] disabled:opacity-40 transition-colors"
                    >
                      Answer
                    </button>
                    <button
                      type="button"
                      onClick={() => passQuestion(question)}
                      className="text-[11px] text-[#625143] underline underline-offset-2 hover:text-[#213428]"
                    >
                      Pass
                    </button>
                    {answered && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#213428]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Answer saved
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!loading && questions.length > 0 && onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 flex items-center gap-1.5 text-[11px] text-[#625143] hover:text-[#213428] transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh questions
        </button>
      )}
    </div>
  );
}