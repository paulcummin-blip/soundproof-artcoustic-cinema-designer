/**
 * AdiPreparingPopup
 * -----------------
 * One non-modal, Artcoustic-branded notice shown while ADI refines a new report.
 * Preparing -> subtle progress; on completion "Your report is ready" for a moment,
 * then it dismisses itself. Failure shows a single Retry. Screen only.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AUTO_INTENT } from '@/components/report/projectReport/useAutoDesignIntent';

const FONT = 'Didact Gothic, sans-serif';

export default function AdiPreparingPopup({ status, onRetry }) {
  const [showReady, setShowReady] = useState(false);
  const previous = useRef(status);

  useEffect(() => {
    let timer;
    if (previous.current === AUTO_INTENT.RUNNING && status === AUTO_INTENT.COMPLETE) {
      setShowReady(true);
      timer = setTimeout(() => setShowReady(false), 2500);
    }
    previous.current = status;
    return () => clearTimeout(timer);
  }, [status]);

  const running = status === AUTO_INTENT.RUNNING;
  const failed = status === AUTO_INTENT.FAILED;
  if (!running && !failed && !showReady) return null;

  return (
    <div
      role="status"
      className="client-report-screen-only"
      style={{
        position: 'fixed', right: 24, bottom: 24, zIndex: 50, width: 320,
        background: '#F1F0EE', border: '1px solid #C1B6AD', borderLeft: '4px solid #213428',
        borderRadius: 8, padding: '14px 16px', boxShadow: '0 6px 20px rgba(33,52,40,0.12)',
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: '#213428' }}>
        {failed ? 'ADI could not finish your report' : showReady && !running ? 'Your report is ready' : 'ADI is preparing your report'}
      </div>
      {!showReady && !failed && (
        <>
          <div style={{ fontSize: 12, color: '#625143', marginTop: 4, lineHeight: 1.4 }}>
            Refining the wording to present your design clearly and professionally.
          </div>
          <div style={{ height: 3, background: '#C1B6AD', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '40%', background: '#213428', animation: 'adiPrepSlide 1.6s ease-in-out infinite' }} />
          </div>
          <style>{'@keyframes adiPrepSlide{0%{margin-left:-40%}100%{margin-left:100%}}'}</style>
        </>
      )}
      {failed && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 10, fontFamily: FONT, fontSize: 12, color: '#FFFFFF', background: '#213428',
            border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}