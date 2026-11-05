/**
 * AdiSummaryOverlay
 * ------------------
 * A centred, blocking overlay shown on the Project Report page while ADI writes
 * the Project Summary. It covers the report body, so no interaction is possible
 * until the accepted summary is ready, at which point it disappears on its own.
 *
 * Shown ONLY while the generation is running. On completion the overlay is gone
 * and the finished summary is rendered on the page; on failure the overlay is
 * also gone and the summary page states the failure with its own Retry action.
 *
 * Screen only (never part of the printed PDF).
 */
import React from 'react';
import { AUTO_INTENT } from '@/components/report/projectReport/useAutoDesignIntent';

const FONT = 'Didact Gothic, sans-serif';
const MESSAGE = 'ADI is writing the project summary. Please wait.';

export default function AdiSummaryOverlay({ status }) {
  if (status !== AUTO_INTENT.RUNNING) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="client-report-screen-only"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(241, 240, 238, 0.92)',
        backdropFilter: 'blur(2px)',
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: 'calc(100vw - 48px)',
          background: '#FFFFFF',
          border: '1px solid #C1B6AD',
          borderLeft: '4px solid #213428',
          borderRadius: 12,
          padding: '28px 32px',
          boxShadow: '0 12px 40px rgba(33,52,40,0.18)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: '#213428', lineHeight: 1.4 }}>
          {MESSAGE}
        </div>
        <div style={{ height: 3, background: '#E6E4DD', borderRadius: 2, marginTop: 18, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: '40%',
              background: '#213428',
              animation: 'adiSummarySlide 1.6s ease-in-out infinite',
            }}
          />
        </div>
        <style>{'@keyframes adiSummarySlide{0%{margin-left:-40%}100%{margin-left:100%}}'}</style>
      </div>
    </div>
  );
}