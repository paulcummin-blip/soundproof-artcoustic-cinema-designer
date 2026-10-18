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
 *
 * A refusal is also READABLE afterwards, for a master admin: the diagnostic the
 * backend returned with it is held for the session and shown in the expandable
 * technical detail below the button, so the reason, the offending sentence, the
 * evidence it cited and the refused draft survive the notice being dismissed.
 * That detail is presentation only and master-admin only; a dealer keeps the
 * plain reason and the safe fallback, and a refused draft is never published.
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import DesignIntentDiagnosticsPanel from '@/components/report/projectReport/DesignIntentDiagnosticsPanel';
import { saveDesignIntentDiagnostics } from '@/components/report/projectReport/designIntentDiagnosticStore';
import { saveAdiEditorialRejection } from '@/components/adi/adiEditorialRejectionStore';
import AdiEditorialNotice from '@/components/adi/AdiEditorialNotice';

const LABEL_COLOR = '#625143';
const BODY_FONT = 'Didact Gothic, sans-serif';

/** The quiet action button the editorial pass is offered with. */
const ACTION_BUTTON = {
  fontFamily: BODY_FONT,
  fontSize: 11,
  letterSpacing: '0.04em',
  color: LABEL_COLOR,
  background: 'transparent',
  border: '1px solid #DCDBD6',
  borderRadius: 6,
  padding: '5px 10px',
};

const REASON_COPY = {
  writer_flag_off: 'The Astra writer is not switched on for this login, so the report keeps its own Design Intent.',
  provider_failed: 'The writer could not be reached, so the report keeps its own Design Intent.',
  validation_failed: 'The draft was not accepted, so the report keeps its own Design Intent.',
  accepted_text_missing: 'The draft passed validation but no text could be read from it, so the report keeps its own Design Intent.',
  report_evidence_unavailable: 'The saved report evidence could not be read, so nothing was written.',
};

export default function DesignIntentGenerationAction({
  projectId = null,
  versionId = null,
  hasNarrative = false,
  onGenerated = null,
}) {
  const [state, setState] = useState({ busy: false, message: null, tone: 'muted' });
  // ── THE EDITORIAL PASS ──
  // A separate action from writing the Design Intent: the narrative that is already
  // saved is improved where it stands, the writer is not asked again, and no figure,
  // level, product, scope or limitation changes. The wording it replaces is kept, so
  // Undo can put it back exactly.
  const [adi, setAdi] = useState({ busy: false, message: null, canUndo: false });

  if (!projectId || !versionId) return null;

  const runAdiAction = async (action) => {
    setAdi((previous) => ({ ...previous, busy: true, message: null }));
    try {
      const response = await base44.functions.invoke('improveAdiWording', {
        surface: 'report_design_intent',
        action,
        mode: 'section',
        project_id: projectId,
        version_id: versionId,
      });
      const data = response?.data || {};
      // A refused rewrite is written nowhere, so this response is the only copy of
      // what ADI proposed and why it was kept back. Held for the session for a
      // master admin to read; a dealer's response carries no diagnostic at all.
      saveAdiEditorialRejection(data.diagnostics || null);
      if (data.ok !== true) {
        setAdi((previous) => ({
          ...previous,
          busy: false,
          message: data.error || 'ADI could not change the wording, so it is unchanged.',
        }));
        return;
      }
      // The server's own line: on a refusal it is the one plain sentence that says
      // the original wording was kept because the revised version changed the
      // supported meaning.
      setAdi({ busy: false, message: data.message || null, canUndo: data.can_undo === true });
      if (data.applied === true && typeof onGenerated === 'function') await onGenerated();
    } catch (error) {
      setAdi((previous) => ({
        ...previous,
        busy: false,
        message: error?.response?.data?.error
          || error?.response?.data?.message
          || 'ADI could not be reached, so the wording is unchanged.',
      }));
    }
  };

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

      // The refused attempt's diagnostic is held for the session, so dismissing
      // the notice below does not take the reason, the offending sentence or the
      // refused draft with it. A response carrying no diagnostic — an ordinary
      // dealer's attempt — replaces nothing and shows nothing.
      saveDesignIntentDiagnostics(projectId, versionId, data.diagnostics || null);

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
      <div className="flex items-center gap-2" style={{ marginTop: 6, flexWrap: 'wrap' }}>
        {hasNarrative && (
          <button
            type="button"
            onClick={() => runAdiAction('improve')}
            disabled={adi.busy}
            title="Improve the wording of this Design Intent with ADI — the same facts, better said"
            data-adi-improve="section"
            style={{ ...ACTION_BUTTON, cursor: adi.busy ? 'default' : 'pointer', opacity: adi.busy ? 0.6 : 1 }}
          >
            Improve wording with ADI
          </button>
        )}
        {adi.canUndo && (
          <button
            type="button"
            onClick={() => runAdiAction('undo')}
            disabled={adi.busy}
            title="Put back the wording ADI replaced"
            data-adi-undo="section"
            style={{ ...ACTION_BUTTON, cursor: adi.busy ? 'default' : 'pointer', opacity: adi.busy ? 0.6 : 1 }}
          >
            Undo
          </button>
        )}
      </div>

      <AdiEditorialNotice
        message={adi.message}
        busy={adi.busy}
        onDismiss={() => setAdi((previous) => ({ ...previous, message: null }))}
      />

      {state.message && (
        <div
          className="flex items-center gap-2"
          style={{ fontFamily: BODY_FONT, fontSize: 11, color: LABEL_COLOR, marginTop: 6 }}
        >
          <span>{state.message}</span>
          <button
            type="button"
            onClick={() => setState((previous) => ({ ...previous, message: null }))}
            style={{
              fontFamily: BODY_FONT,
              fontSize: 11,
              color: LABEL_COLOR,
              background: 'transparent',
              border: 'none',
              padding: 0,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* The refused attempt read back in full, for a master admin only. It reads
          what this session holds for THIS report, so the technical detail stays
          available after the notice above is dismissed. It renders nothing for a
          dealer, and nothing when no attempt was refused. Screen only: it is
          never part of the printed document. */}
      <DesignIntentDiagnosticsPanel
        projectId={projectId}
        versionId={versionId}
        className="mt-1"
      />
    </div>
  );
}