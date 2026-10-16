/**
 * DesignIntentGenerationAction.jsx
 * --------------------------------
 * THE optional action that asks the Astra writer for this report's Design Intent.
 *
 * It is one button and it is entirely optional: the report is complete and
 * correct without it, and the designer only ever sees it on screen — it is never
 * rendered in the printed document, so no page, no pagination and no figure of the
 * PDF is affected by whether it exists or what state it is in.
 *
 * Every ending is handled in place. A refused, failed or timed-out attempt leaves
 * the report exactly as it was, with its own deterministic Design Intent on the
 * page, and states the reason beside the button; nothing incomplete is ever shown.
 * While the writer is working the button reports that it is working, and the
 * report underneath stays fully readable throughout.
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const LABEL_COLOR = '#625143';
const BODY_FONT = 'Didact Gothic, sans-serif';

const REASON_COPY = {
  writer_flag_off: 'The Astra writer is not switched on for this login, so the report keeps its own Design Intent.',
  provider_failed: 'The writer could not be reached, so the report keeps its own Design Intent.',
  validation_failed: 'The draft was not accepted, so the report keeps its own Design Intent.',
  report_evidence_unavailable: 'The saved report evidence could not be read, so nothing was written.',
};

export default function DesignIntentGenerationAction({
  projectId = null,
  versionId = null,
  hasNarrative = false,
  onGenerated = null,
}) {
  const [state, setState] = useState({ busy: false, message: null, tone: 'muted' });

  if (!projectId || !versionId) return null;

  const generate = async () => {
    setState({ busy: true, message: 'Writing the Design Intent…', tone: 'muted' });
    try {
      const response = await base44.functions.invoke('generateReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
      });
      const data = response?.data || {};

      if (data.ok === true) {
        setState({ busy: false, message: 'The Design Intent has been written and saved with this report.', tone: 'ok' });
        if (typeof onGenerated === 'function') await onGenerated();
        return;
      }

      setState({
        busy: false,
        message: REASON_COPY[data.reason]
          || data.error
          || 'The narrative was not accepted, so the report keeps its own Design Intent.',
        tone: 'muted',
      });
    } catch (error) {
      setState({
        busy: false,
        message: REASON_COPY[error?.response?.data?.reason]
          || error?.response?.data?.error
          || 'The narrative could not be written, so the report keeps its own Design Intent.',
        tone: 'muted',
      });
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={generate}
        disabled={state.busy}
        style={{
          fontFamily: BODY_FONT,
          fontSize: 11,
          letterSpacing: '0.04em',
          color: LABEL_COLOR,
          background: 'transparent',
          border: '1px solid #DCDBD6',
          borderRadius: 6,
          padding: '5px 10px',
          cursor: state.busy ? 'default' : 'pointer',
          opacity: state.busy ? 0.6 : 1,
        }}
      >
        {state.busy
          ? 'Writing Design Intent…'
          : hasNarrative ? 'Rewrite Design Intent' : 'Write Design Intent'}
      </button>
      {state.message && (
        <div style={{ fontFamily: BODY_FONT, fontSize: 11, color: LABEL_COLOR, marginTop: 6 }}>
          {state.message}
        </div>
      )}
    </div>
  );
}