import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateProjectorThrowRatio } from "@/components/room/rv/utils/projectorThrowRatio";

/**
 * useProjectorThrowWarning
 *
 * Shows the generic "Check throw ratio" caution while the projector is dragged
 * outside the broad 1.30–2.80 range, keeps it on screen for 10 seconds after the
 * drag ends, then fades it away. Dragging again while still outside range brings
 * it back immediately. Nothing here blocks a drag or changes the design.
 *
 * Phase machine: hidden → hold (dragging, or within the 10 s after release) → fading → hidden
 */

export const THROW_RATIO_HOLD_MS = 10000;
export const THROW_RATIO_FADE_MS = 900;

export function useProjectorThrowWarning({ lensY, screenPlaneY, screenWidthM, dragging }) {
  const evaluation = useMemo(
    () => calculateProjectorThrowRatio({ lensY, screenPlaneY, screenWidthM }),
    [lensY, screenPlaneY, screenWidthM]
  );
  const outsideRange = evaluation.isOutsideGenericRange;

  const [phase, setPhase] = useState("hidden");
  const phaseRef = useRef("hidden");
  const holdTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);

  const apply = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = useCallback(() => {
    clearTimeout(holdTimerRef.current);
    clearTimeout(fadeTimerRef.current);
    holdTimerRef.current = null;
    fadeTimerRef.current = null;
  }, []);

  // Inside the broad range — never a caution, whatever the phase was.
  useEffect(() => {
    if (outsideRange) return;
    clearTimers();
    apply("hidden");
  }, [outsideRange, clearTimers, apply]);

  // Live while dragging: immediate on every drag tick.
  useEffect(() => {
    if (!dragging) return;
    clearTimers();
    apply(outsideRange ? "hold" : "hidden");
  }, [dragging, outsideRange, clearTimers, apply]);

  // After the drag ends outside range: hold it for 10 s, then fade away.
  useEffect(() => {
    if (dragging || !outsideRange) return;
    if (phaseRef.current === "hidden") return;
    clearTimers();
    holdTimerRef.current = setTimeout(() => {
      apply("fading");
      fadeTimerRef.current = setTimeout(() => apply("hidden"), THROW_RATIO_FADE_MS);
    }, THROW_RATIO_HOLD_MS);
    return clearTimers;
  }, [dragging, outsideRange, clearTimers, apply]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    visible: phase !== "hidden",
    fading: phase === "fading",
    throwRatio: evaluation.throwRatio,
    isOutsideGenericRange: outsideRange,
    reason: evaluation.reason,
  };
}