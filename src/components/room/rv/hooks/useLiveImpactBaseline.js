import { useCallback, useEffect, useRef, useState } from "react";

const copyP20 = (results) => (Array.isArray(results) ? results.map((result) => ({ ...result })) : []);

export function useLiveImpactBaseline({ dragging, liveRp22, currentP20Results }) {
  const [baselineRp22, setBaselineRp22] = useState(null);
  const [baselineP20Results, setBaselineP20Results] = useState([]);
  const [showLiveImpactCard, setShowLiveImpactCard] = useState(false);
  const baselineCapturedRef = useRef(false);
  const postDragTimerRef = useRef(null);

  const acceptBaseline = useCallback(() => {
    setBaselineRp22(liveRp22);
    setBaselineP20Results(copyP20(currentP20Results));
    setShowLiveImpactCard(false);
    if (postDragTimerRef.current) clearTimeout(postDragTimerRef.current);
    postDragTimerRef.current = null;
  }, [liveRp22, currentP20Results]);

  const dismissCard = useCallback(() => {
    setShowLiveImpactCard(false);
    if (postDragTimerRef.current) clearTimeout(postDragTimerRef.current);
    postDragTimerRef.current = null;
  }, []);

  const rebaseline = useCallback(() => {
    setBaselineRp22(liveRp22);
    setBaselineP20Results(copyP20(currentP20Results));
    setShowLiveImpactCard(true);
  }, [liveRp22, currentP20Results]);

  useEffect(() => {
    if (dragging) {
      if (!baselineCapturedRef.current) {
        baselineCapturedRef.current = true;
        if (!baselineRp22) {
          setBaselineRp22(liveRp22);
          setBaselineP20Results(copyP20(currentP20Results));
        }
        setShowLiveImpactCard(true);
      }
      return;
    }
    baselineCapturedRef.current = false;
    if (postDragTimerRef.current) clearTimeout(postDragTimerRef.current);
    postDragTimerRef.current = setTimeout(() => {
      setShowLiveImpactCard(false);
      postDragTimerRef.current = null;
    }, 10000);
  }, [dragging]); // Baseline is intentionally a drag-start snapshot.

  useEffect(() => () => {
    if (postDragTimerRef.current) clearTimeout(postDragTimerRef.current);
  }, []);

  return { baselineRp22, baselineP20Results, showLiveImpactCard, acceptBaseline, dismissCard, rebaseline };
}