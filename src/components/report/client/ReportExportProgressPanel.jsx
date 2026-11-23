/**
 * ReportExportProgressPanel
 * -------------------------
 * The Technical Report generation progress screen, shown while the Project
 * Report PDF is captured, stored and verified in the Project Library.
 *
 * The visual treatment reuses the existing Proposal Centre generation screen
 * (GenerateStep.jsx): the same spinner, typography, spacing and ordered stage
 * list. Each stage is connected to the real export lifecycle through
 * resolveReportExportStage — there are no artificial percentages or timers.
 *
 *   preparing — report composition and required assets ready (readiness)
 *   creating  — capture and PDF assembly in progress (capture / assemble)
 *   saving    — upload and verification in progress (upload / reconcile /
 *               verify_file / record)
 *   ready     — verified PDF successfully stored (publication complete)
 *
 * "Report ready" appears only once publication.status === 'complete', which is
 * set AFTER the stored PDF is verified — so a browser print dialog opening
 * early can never produce a false completion state. A storage failure shows
 * the reason and the existing Retry storage action.
 *
 * The raw per-page "Capturing report page X of Y…" message never appears here:
 * the panel reads only the stage field, never the message. Page counts and
 * timing diagnostics remain in Admin System Health via the separate telemetry
 * pipeline.
 *
 * Screen only (never part of the printed PDF).
 */
import React from 'react';
import { useSyncExternalStore } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  resolveReportExportStage,
  REPORT_EXPORT_STEPS,
} from './reportExportStage';

const PRIMARY = '#213428';
const PRIMARY_DARK = '#1B1A1A';
const MUTED = '#8A8477';
const PENDING = '#C3BCA9';
const FAIL_BG = '#F6E7E1';
const FAIL_BORDER = '#E4C9BC';
const FAIL_TEXT = '#8B4A2B';

export default function ReportExportProgressPanel({ store, publication, onRetryMissing }) {
  const progress = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const { activeStep, status } = resolveReportExportStage({
    progress,
    publicationStatus: publication?.status || 'idle',
  });

  const failed = status === 'failed';
  const ready = status === 'ready';
  const working = !failed && !ready;

  const heading = failed
    ? 'Storage could not be completed'
    : ready
      ? 'Report ready'
      : 'Preparing your Technical Report';

  const subline = failed
    ? 'The PDF was created but could not be saved to the Project Library. You can retry storage without regenerating the report.'
    : ready
      ? 'Your Technical Report has been saved to Documents & Assets.'
      : 'Sound Proof is assembling your engineering analysis, diagrams and system details into a complete report.';

  return (
    <div
      className="client-report-screen-only"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '64px 24px',
        fontFamily: 'Didact Gothic, Century Gothic, sans-serif',
      }}
    >
      {failed ? (
        <AlertTriangle
          className="mb-6"
          style={{ width: 20, height: 20, color: FAIL_TEXT }}
        />
      ) : (
        <Loader2
          className="animate-spin mb-6"
          style={{ width: 20, height: 20, color: PRIMARY }}
        />
      )}

      <h3
        className="text-xl font-normal tracking-tight"
        style={{
          fontFamily: 'Didact Gothic, sans-serif',
          color: failed ? FAIL_TEXT : PRIMARY_DARK,
          margin: 0,
        }}
      >
        {heading}
      </h3>

      <p
        className="mt-3 max-w-md"
        style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: '12px 0 0 0' }}
      >
        {subline}
      </p>

      <ol className="mt-8 space-y-2 text-left" style={{ margin: '32px 0 0 0', listStyle: 'none', padding: 0 }}>
        {REPORT_EXPORT_STEPS.map((step, index) => {
          const reached = index <= activeStep;
          return (
            <li
              key={step}
              style={{
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: reached ? PRIMARY : PENDING,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ minWidth: 14, display: 'inline-flex', justifyContent: 'center' }}>
                {reached && !failed && index === activeStep && working ? (
                  <Loader2 className="animate-spin" style={{ width: 12, height: 12, color: PRIMARY }} />
                ) : reached ? (
                  <span style={{ color: PRIMARY, fontWeight: 600 }}>•</span>
                ) : (
                  <span style={{ color: PENDING }}>·</span>
                )}
              </span>
              {step}
            </li>
          );
        })}
      </ol>

      {failed && Array.isArray(publication?.failed) && publication.failed.length > 0 && (
        <div className="mt-8" style={{ marginTop: 32, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {publication.failed.map((failure) => (
            <div
              key={failure.key}
              style={{
                textAlign: 'left',
                padding: '12px 16px',
                background: FAIL_BG,
                border: `1px solid ${FAIL_BORDER}`,
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 13, color: FAIL_TEXT, lineHeight: 1.55, marginBottom: 10 }}>
                {failure.error || 'The Technical Report could not be stored.'}
              </div>
              {onRetryMissing && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onRetryMissing(failure.key)}
                  style={{
                    fontFamily: 'Didact Gothic, Century Gothic, sans-serif',
                    backgroundColor: PRIMARY,
                    border: `1px solid ${PRIMARY}`,
                    color: '#FFFFFF',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Retry storage
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}