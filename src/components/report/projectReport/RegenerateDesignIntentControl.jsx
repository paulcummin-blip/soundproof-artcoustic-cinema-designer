/**
 * RegenerateDesignIntentControl.jsx
 * --------------------------------
 * The deliberate Regenerate Design Intent action for a saved Project Report.
 *
 * Renders a small action beside the Design Intent heading (screen only — never
 * in the printed PDF), and a comparison dialog when a new narrative has been
 * generated. The designer reviews the new wording against the existing one and
 * chooses:
 *
 *   Use New Version  → commits the reviewed narrative to the snapshot (only the
 *                      Design Intent field is touched), then the report reloads.
 *   Keep Existing    → discards the new narrative; the report is unchanged.
 *
 * Available only when the Project Report already contains an accepted narrative.
 * A generation or validation failure retains the existing narrative and shows
 * the reason. Existing PDF assets are never touched by this control.
 */
import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
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

/** Render the narrative's paragraphs, exactly as the report's own opening does. */
function NarrativeParagraphs({ text }) {
  const paragraphs = String(text || '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  return paragraphs.map((paragraph, index) => (
    <p
      key={index}
      style={{
        margin: index === 0 ? 0 : '10px 0 0 0',
        fontSize: 13,
        lineHeight: 1.6,
        color: '#3E4349',
        fontFamily: FONT_BODY,
      }}
    >
      {paragraph}
    </p>
  ));
}

function Column({ label, children, highlighted = false }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      padding: 16,
      background: '#FFFFFF',
      border: `1px solid ${RULE}`,
      borderLeft: highlighted ? `4px solid ${BRAND}` : `1px solid ${RULE}`,
      borderRadius: 8,
    }}>
      <div style={{
        fontFamily: FONT_HEADING,
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: MUTED,
        marginBottom: 8,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function RegenerateDesignIntentControl({
  status,
  hasAcceptedNarrative = false,
  isBusy = false,
  isReviewing = false,
  newText = null,
  error = null,
  existingText = null,
  onGenerate = null,
  onKeepExisting = null,
  onCommit = null,
  onDismissError = null,
}) {
  if (!hasAcceptedNarrative) return null;

  const generating = status === 'generating';
  const committing = status === 'committing';

  return (
    <>
      <button
        type="button"
        onClick={onGenerate}
        disabled={isBusy}
        title="Regenerate the Design Intent using the improved writer"
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
        <RefreshCw
          className={generating ? 'animate-spin' : ''}
          style={{ width: 12, height: 12, color: BRAND }}
        />
        {generating ? 'Generating…' : 'Regenerate Design Intent'}
      </button>

      {error && !isReviewing && (
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
                Could not regenerate the Design Intent.
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

      <Dialog open={isReviewing} onOpenChange={(open) => { if (!open && !committing) onKeepExisting?.(); }}>
        <DialogContent style={{ maxWidth: 780, fontFamily: FONT_BODY }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: FONT_HEADING, color: BRAND, fontWeight: 300 }}>
              Regenerate Design Intent
            </DialogTitle>
            <DialogDescription style={{ fontFamily: FONT_BODY, color: MUTED }}>
              Review the newly generated wording against the existing Design Intent. The existing narrative stays in place until you choose to use the new version.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <Column label="Existing Design Intent">
              <NarrativeParagraphs text={existingText} />
            </Column>
            <Column label="New Version" highlighted>
              <NarrativeParagraphs text={newText} />
            </Column>
          </div>

          {error && isReviewing && (
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
              onClick={onKeepExisting}
              disabled={committing}
              style={{
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: BRAND,
                background: '#F8F8F7',
                border: `1px solid ${BRAND}`,
                borderRadius: 6,
                padding: '8px 18px',
                cursor: committing ? 'not-allowed' : 'pointer',
                opacity: committing ? 0.6 : 1,
              }}
            >
              Keep Existing
            </button>
            <button
              type="button"
              onClick={onCommit}
              disabled={committing}
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
                cursor: committing ? 'progress' : 'pointer',
                opacity: committing ? 0.7 : 1,
              }}
            >
              {committing && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
              {committing ? 'Saving…' : 'Use New Version'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}