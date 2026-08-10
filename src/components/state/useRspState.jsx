/**
 * useRspState.js
 * Isolated state hook for RSP (Reference Seating Position) mode and manual position.
 * Designed to be composed into AppStateProvider without inflating it further.
 *
 * Stage B1: Promoted from Y-only to full {x, y} manual RSP position.
 *   manualRspY_m — legacy Y-only override (kept for compatibility)
 *   manualRspX_m — manual X override (null = use room centreline)
 */

import { useState, useCallback } from "react";

const RSP_MODE_VALUES = new Set([
  "auto_from_screen",
  "front_row_center",
  "middle_row_center",
  "back_row_center",
  "all_rows_average",
  "manual_position",
]);

const DEFAULT_RSP_MODE = "auto_from_screen";

/**
 * @param {object} [initialPayload]  - Optional autosave/project payload to seed state from.
 *   initialPayload.rsp_mode       — string, must be one of RSP_MODE_VALUES
 *   initialPayload.manual_rsp_y_m — number | null
 *   initialPayload.manual_rsp_x_m — number | null
 */
export function useRspState(initialPayload) {
  const [rspMode, _setRspMode] = useState(() => {
    const saved = initialPayload?.rsp_mode;
    return RSP_MODE_VALUES.has(saved) ? saved : DEFAULT_RSP_MODE;
  });

  const setRspMode = useCallback((mode) => {
    _setRspMode(RSP_MODE_VALUES.has(mode) ? mode : DEFAULT_RSP_MODE);
  }, []);

  const [manualRspY_m, _setManualRspY_m] = useState(() => {
    const saved = initialPayload?.manual_rsp_y_m;
    return typeof saved === "number" && Number.isFinite(saved) ? saved : null;
  });

  const setManualRspY_m = useCallback((y) => {
    _setManualRspY_m(typeof y === "number" && Number.isFinite(y) ? y : null);
  }, []);

  const [manualRspX_m, _setManualRspX_m] = useState(() => {
    const saved = initialPayload?.manual_rsp_x_m;
    return typeof saved === "number" && Number.isFinite(saved) ? saved : null;
  });

  const setManualRspX_m = useCallback((x) => {
    _setManualRspX_m(typeof x === "number" && Number.isFinite(x) ? x : null);
  }, []);

  const resetRspState = useCallback(() => {
    _setRspMode(DEFAULT_RSP_MODE);
    _setManualRspY_m(null);
    _setManualRspX_m(null);
  }, []);

  return {
    rspMode,
    setRspMode,
    manualRspY_m,
    setManualRspY_m,
    manualRspX_m,
    setManualRspX_m,
    resetRspState,
  };
}