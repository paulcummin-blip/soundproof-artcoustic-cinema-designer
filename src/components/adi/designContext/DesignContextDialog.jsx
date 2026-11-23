/**
 * DesignContextDialog.jsx
 * ------------------------
 * The pre-generation context review dialog.
 *
 * Before generating or regenerating a Design Intent, ADI reviews the project
 * version and identifies up to three design decisions whose reasons are not
 * established by the engineering data. The designer may:
 *
 *   - Answer a question (the answer is saved and reused).
 *   - Edit a previously saved answer.
 *   - Confirm "No particular reason" (saved, not asked again unless the
 *     relevant design inputs change).
 *   - Skip a question for this generation only (never saved; may be asked
 *     again on a future generation).
 *   - Continue without answering any question.
 *
 * Previously saved answers are shown for review, not repeatedly requested.
 * The dialog is lightweight: a maximum of three questions, each with a short
 * text field, a no-reason toggle, and a skip option.
 */
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpCircle, Check, MinusCircle, Edit3 } from 'lucide-react';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const BRAND = '#213428';
const MUTED = '#625143';
const RULE = '#DCDBD6';

/** One question row with answer, no-reason, and skip controls. */
function ContextQuestionRow({ item, index, onChange, registerAnswerRef }) {
  const isSaved = item.status === 'answered' || item.status === 'no_reason';
  const isSkipped = item.status === 'skipped' && !isSaved;
  const needsReconfirmation = item.needs_reconfirmation === true;

  const handleSkip = () => {
    onChange(index, { status: 'skipped', answer: '' });
  };

  const handleUndoSkip = () => {
    onChange(index, { status: 'skipped', answer: '' });
    // Restore the textarea so the designer can type an answer.
  };

  return (
    <div style={{
      padding: 16,
      background: '#FFFFFF',
      border: `1px solid ${RULE}`,
      borderLeft: needsReconfirmation ? `4px solid #C77F0E` : `1px solid ${RULE}`,
      borderRadius: 8,
      opacity: isSkipped ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <HelpCircle style={{ width: 16, height: 16, color: BRAND, flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: '#213428',
            fontFamily: FONT_BODY,
            lineHeight: 1.5,
          }}>
            {item.question}
          </div>
          {isSaved && !needsReconfirmation && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 6,
              fontSize: 11,
              color: '#5A7A52',
              fontFamily: FONT_BODY,
            }}>
              <Check style={{ width: 12, height: 12 }} />
              {item.status === 'no_reason' ? 'Confirmed: no particular reason' : 'Saved'}
            </div>
          )}
          {needsReconfirmation && (
            <div style={{
              fontSize: 11,
              color: '#C77F0E',
              fontFamily: FONT_BODY,
              marginTop: 6,
            }}>
              The design has changed since this was last answered. Please review.
            </div>
          )}
        </div>
      </div>

      {isSkipped ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 10px',
          background: '#F8F8F7',
          border: `1px solid ${RULE}`,
          borderRadius: 6,
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontFamily: FONT_BODY,
            color: MUTED,
          }}>
            <MinusCircle style={{ width: 14, height: 14 }} />
            Skipped for this generation
          </span>
          <button
            type="button"
            onClick={handleUndoSkip}
            style={{
              fontSize: 12,
              fontFamily: FONT_BODY,
              color: BRAND,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Undo
          </button>
        </div>
      ) : (
        <>
          {item.status !== 'no_reason' && (
            <textarea
              ref={(el) => registerAnswerRef(index, el)}
              value={item.answer || ''}
              onChange={(e) => onChange(index, { answer: e.target.value, status: e.target.value.trim() ? 'answered' : 'skipped' })}
              placeholder="Type the designer's reason here, or skip for this generation..."
              style={{
                width: '100%',
                minHeight: 60,
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: FONT_BODY,
                color: '#3E4349',
                background: '#FAFAF8',
                border: `1px solid ${RULE}`,
                borderRadius: 6,
                resize: 'vertical',
                outline: 'none',
              }}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontFamily: FONT_BODY,
              color: MUTED,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={item.status === 'no_reason'}
                onChange={(e) => onChange(index, {
                  status: e.target.checked ? 'no_reason' : 'skipped',
                  answer: e.target.checked ? '' : (item.answer || ''),
                })}
                style={{ cursor: 'pointer' }}
              />
              No particular reason
            </label>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontFamily: FONT_BODY,
                color: MUTED,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              <MinusCircle style={{ width: 12, height: 12 }} />
              Skip for this generation
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function DesignContextDialog({
  open = false,
  isDiscovering = false,
  isSaving = false,
  questions = [],
  savedItems = [],
  draftRows = null,
  error = null,
  onProceed = null,
  onCancel = null,
}) {
  // Merge questions and saved items into the rows the dialog shows.
  // Saved items that are not in the current questions list are shown as
  // review-only rows (the designer can edit them).
  const [rows, setRows] = React.useState([]);

  React.useEffect(() => {
    if (!open) return;
    // Build the rows: current questions first, then saved items not in questions.
    const questionIds = new Set(questions.map((q) => q.question_id));
    const reviewOnly = savedItems.filter((item) => !questionIds.has(item.question_id));
    const merged = [
      ...questions.map((q) => {
        const saved = savedItems.find((s) => s.question_id === q.question_id);
        return {
          question_id: q.question_id,
          question: q.question,
          area: q.area,
          decision_fingerprint: q.decision_fingerprint,
          status: saved?.status || 'skipped',
          answer: saved?.answer || '',
          needs_reconfirmation: saved?.needs_reconfirmation || false,
          is_new: !saved,
        };
      }),
      ...reviewOnly.map((item) => ({
        question_id: item.question_id,
        question: item.question,
        area: item.area,
        decision_fingerprint: item.decision_fingerprint,
        status: item.status,
        answer: item.answer || '',
        needs_reconfirmation: item.needs_reconfirmation || false,
        is_review_only: true,
      })),
    ];
    setRows(merged.map(row => {
      const draft = Array.isArray(draftRows) ? draftRows.find(item => item.question_id === row.question_id
        && item.decision_fingerprint === row.decision_fingerprint) : null;
      return draft ? { ...row, status: draft.status, answer: draft.answer } : row;
    }));
  }, [open, questions, savedItems, draftRows]);

  const handleRowChange = React.useCallback((index, patch) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    // When a question is skipped, move focus to the next unanswered
    // question's textarea so the designer can continue without scrolling.
    if (patch.status === 'skipped' && !patch.answer) {
      setTimeout(() => focusNextUnanswered(index + 1), 0);
    }
  }, []);

  const answerRefs = React.useRef({});
  const registerAnswerRef = React.useCallback((index, el) => {
    if (el) answerRefs.current[index] = el;
    else delete answerRefs.current[index];
  }, []);

  const focusNextUnanswered = React.useCallback((fromIndex) => {
    const startIndex = Math.max(0, fromIndex);
    for (let i = startIndex; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row) continue;
      const isActive = row.status !== 'no_reason' && row.status !== 'skipped';
      if (isActive && answerRefs.current[i]) {
        answerRefs.current[i].focus();
        return;
      }
    }
  }, [rows]);

  const handleProceed = React.useCallback(() => {
    if (typeof onProceed === 'function') {
      onProceed(rows);
    }
  }, [rows, onProceed]);

  const hasQuestions = rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={(openState) => { if (!openState && !isSaving && typeof onCancel === 'function') onCancel(); }}>
      <DialogContent style={{ maxWidth: 620, fontFamily: FONT_BODY }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: FONT_HEADING, color: BRAND, fontWeight: 300 }}>
            Design Context
          </DialogTitle>
          <DialogDescription style={{ fontFamily: FONT_BODY, color: MUTED }}>
            ADI has reviewed this design and identified {hasQuestions ? `up to ${Math.min(rows.length, 3)} design ${rows.length === 1 ? 'decision' : 'decisions'} whose reason is not established by the engineering data` : 'no design decisions that need context'}. Your answers help ADI write accurate Design Intent and proposal copy without assuming a motivation.
          </DialogDescription>
        </DialogHeader>

        {isDiscovering ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: MUTED, fontFamily: FONT_BODY, fontSize: 13 }}>
            Reviewing the design...
          </div>
        ) : !hasQuestions ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: MUTED, fontFamily: FONT_BODY, fontSize: 13 }}>
            No context questions for this design. You can proceed directly.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8, maxHeight: 420, overflowY: 'auto' }}>
            {rows.map((row, index) => (
              <ContextQuestionRow
                key={row.question_id}
                item={row}
                index={index}
                onChange={handleRowChange}
                registerAnswerRef={registerAnswerRef}
              />
            ))}
          </div>
        )}

        {error && <p role="alert" style={{ color: '#8B4A2B', fontSize: 13 }}>{error}</p>}
        <DialogFooter style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: BRAND,
              background: '#F8F8F7',
              border: `1px solid ${BRAND}`,
              borderRadius: 6,
              padding: '8px 18px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProceed}
            disabled={isSaving || isDiscovering}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: '#FFFFFF',
              background: BRAND,
              border: `1px solid ${BRAND}`,
              borderRadius: 6,
              padding: '8px 18px',
              cursor: (isSaving || isDiscovering) ? 'progress' : 'pointer',
              opacity: (isSaving || isDiscovering) ? 0.7 : 1,
            }}
          >
            {isSaving ? 'Saving...' : error ? 'Retry Save' : 'Continue'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}