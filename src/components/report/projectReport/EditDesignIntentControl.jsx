/**
 * EditDesignIntentControl.jsx
 * ---------------------------
 * The Edit Design Intent action for a saved Project Report.
 *
 * Renders a small action beside the Design Intent heading (screen only — never
 * in the printed PDF). Clicking it opens the currently accepted Design Intent
 * in an editable text field. The designer edits the wording and chooses:
 *
 *   Save   → persists the edited text against the correct Project Report and
 *            design version (only the Design Intent field is touched), then
 *            the report reloads. No provider is called.
 *   Cancel → discards the edits; the report is unchanged.
 *
 * Available only when the Project Report already contains an accepted
 * narrative. A save failure retains the designer's entries and shows the
 * reason. Existing PDF assets are never touched by this control.
 */
import React from 'react';
import { Edit3, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const BRAND = '#213428';
const MUTED = '#625143';
const RULE = '#DCDBD6';

export default function EditDesignIntentControl({
  status,
  hasAcceptedNarrative = false,
  isBusy = false,
  isEditing = false,
  draft = '',
  error = null,
  existingText = null,
  onOpen = null,
  onDraftChange = null,
  onSave = null,
  onCancel = null,
  onDismissError = null,
}) {
  if (!hasAcceptedNarrative) return null;

  const saving = status === 'saving';

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={isBusy}
        title="Edit the finished Design Intent text"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: FONT_BODY,
          fontSize: 11,
          color: BRAND,
          background: 'transparent',
          border: `1px solid ${RULE}`,
          borderRadius: 6,
          padding: '4px 10px',
          cursor: isBusy ? 'progress' : 'pointer',
          opacity: isBusy ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        <Edit3 style={{ width: 12, height: 12, color: BRAND }} />
        Edit Design Intent
      </button>

      {error && !isEditing && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 60,
            maxWidth: 360,
            padding: '12px 16px',
            background: '#FFFFFF',
            border: '1px solid #C1B6AD',
            borderLeft: '4px solid #8A1A1A',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            fontFamily: FONT_BODY,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertCircle style={{ width: 16, height: 16, color: '#8A1A1A', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8A1A1A' }}>
                Could not save the edited Design Intent.
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                {error}
              </div>
              <button
                type="button"
                onClick={onDismissError}
                style={{
                  marginTop: 8,
                  fontFamily: FONT_BODY,
                  fontSize: 11,
                  color: BRAND,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isEditing} onOpenChange={(open) => { if (!open && !saving) onCancel?.(); }}>
        <DialogContent style={{ maxWidth: 780, fontFamily: FONT_BODY }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: FONT_HEADING, color: BRAND, fontWeight: 300 }}>
              Edit Design Intent
            </DialogTitle>
            <DialogDescription style={{ fontFamily: FONT_BODY, color: MUTED }}>
              Edit the finished Design Intent text directly. Saving stores your wording against this report and design version; the engineering evidence, RP22 results, drawings and other report sections are all preserved. The original generated text is retained for recovery.
            </DialogDescription>
          </DialogHeader>

          <textarea
            value={draft}
            onChange={(e) => onDraftChange?.(e.target.value)}
            disabled={saving}
            style={{
              width: '100%',
              minHeight: 260,
              padding: 14,
              fontSize: 13.5,
              lineHeight: 1.6,
              fontFamily: FONT_BODY,
              color: '#1B1A1A',
              background: '#FAFAF8',
              border: `1px solid ${RULE}`,
              borderRadius: 8,
              resize: 'vertical',
              outline: 'none',
            }}
          />

          {error && isEditing && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              background: '#FBF7F7',
              border: '1px solid #C1B6AD',
              borderLeft: '4px solid #8A1A1A',
              borderRadius: 6,
              fontSize: 12,
              color: '#8A1A1A',
              fontFamily: FONT_BODY,
            }}>
              {error}
            </div>
          )}

          <DialogFooter style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: BRAND,
                background: '#F8F8F7',
                border: `1px solid ${BRAND}`,
                borderRadius: 6,
                padding: '8px 18px',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
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
                cursor: saving ? 'progress' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Edit3 className="animate-spin" style={{ width: 14, height: 14 }} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}