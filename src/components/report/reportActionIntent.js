/**
 * reportActionIntent.js
 * ---------------------
 * The one place a report link states WHAT it wants the report page to do when it
 * opens, and the one hook that runs it.
 *
 *   autoPrint=1     export this report's PDF
 *   updateReport=1  create an updated report from the design as it stands
 *
 * The Technical Report has honoured autoPrint since the Design Review handoff;
 * the Project Library's report rows use the same two intents, so the Library
 * never grows a second export or update implementation.
 *
 * An intent is only a request: the report page runs it through its own existing
 * handler, gated on the same readiness its own buttons use, exactly once. Nothing
 * here writes a report's status — exporting a report, opening it, or using it in
 * a proposal never changes whether it is Current.
 */

import { useEffect, useRef } from 'react';

export const REPORT_AUTOPRINT_PARAM = 'autoPrint';
export const REPORT_UPDATE_PARAM = 'updateReport';

/** What a report URL asks the report page to do. */
export function readReportActionIntent(search) {
  const params = typeof search?.get === 'function'
    ? search
    : new URLSearchParams(search || '');
  return {
    exportPdf: params.get(REPORT_AUTOPRINT_PARAM) === '1',
    updateReport: params.get(REPORT_UPDATE_PARAM) === '1',
  };
}

/**
 * Run a requested action once, as soon as the caller says the report is ready.
 *
 * @param {Object} params
 * @param {boolean} params.requested — the report URL asked for this action
 * @param {boolean} params.ready — the caller's own readiness gate
 * @param {Function|null} params.onRun — the report's own handler
 */
export function useReportActionIntent({ requested = false, ready = false, onRun = null }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!requested || fired.current || !ready || typeof onRun !== 'function') return;
    fired.current = true;
    onRun();
  }, [requested, ready, onRun]);
}