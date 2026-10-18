/**
 * AdiEditorialNotice.jsx
 * ----------------------
 * The one line ADI states about an editorial action, wherever it was taken.
 *
 * ADI is Sound Proof's own intelligence identity, and the notice is deliberately
 * plain: what happened, in the designer's words, with the server's own sentence
 * where it sent one — a refusal reads as "ADI kept the original wording because
 * the revised version changed the supported meaning", and never as a rule name, a
 * code, a claim id or a validator detail.
 *
 * It is presentation only. It holds no state, decides nothing, and is never part
 * of the printed document.
 *
 * Props:
 * - message: the line to show, or null for nothing
 * - busy: an editorial pass is running; the working line is shown instead
 * - onDismiss: () => void — clears the line
 */
import React from 'react';

export const ADI_WORKING_LINE = 'ADI is improving the wording…';

export default function AdiEditorialNotice({ message = null, busy = false, onDismiss = null, style = null }) {
  if (!busy && !message) return null;

  return (
    <div
      className="flex items-start gap-2"
      style={{
        fontFamily: 'Didact Gothic, sans-serif',
        fontSize: 11,
        color: '#625143',
        marginTop: 6,
        ...(style || {}),
      }}
      data-adi-editorial-notice={busy ? 'working' : 'result'}
    >
      <span>{busy ? ADI_WORKING_LINE : message}</span>
      {!busy && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontFamily: 'Didact Gothic, sans-serif',
            fontSize: 11,
            color: '#625143',
            background: 'transparent',
            border: 'none',
            padding: 0,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}