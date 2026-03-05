import { useCallback, useMemo } from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';

/**
 * useHudComputation — Extracts HUD-related memoized computations and callbacks.
 * Reduces inline code in RoomVisualisation.jsx
 */
export function useHudComputation({
  isHudPinned,
  hudPinnedOffsetPx,
  hudHiddenWhenPinned,
}) {
  // Helper to render level badge
  const renderLevelBadge = useCallback((level) => {
    const str = String(level || '—').toUpperCase();

    if (!level || str === 'N/A' || str === '—' || str === '-' || str === 'BELOW L1') {
      return <span style={{ fontSize: 10, color: '#999' }}>{level || '—'}</span>;
    }

    if (str === 'FAIL') return <RP22GradingPill level="FAIL" />;

    if (str === 'L1' || str === 'L2' || str === 'L3' || str === 'L4') {
      return <RP22GradingPill level={str} />;
    }

    const n = Number(level);
    if (Number.isFinite(n)) {
      if (n >= 1 && n <= 4) return <RP22GradingPill level={`L${n}`} />;
      return <span style={{ fontSize: 10, color: '#999' }}>—</span>;
    }

    return <span style={{ fontSize: 10, color: '#999' }}>—</span>;
  }, []);

  // Build HUD style safely
  const hudDynamicStyle = useMemo(() => {
    const s = {};
    if (isHudPinned && hudPinnedOffsetPx) {
      s.transform = `translate3d(${hudPinnedOffsetPx.x}px, ${hudPinnedOffsetPx.y}px, 0)`;
    }
    if (isHudPinned && hudHiddenWhenPinned) {
      s.visibility = 'hidden';
      s.pointerEvents = 'none';
    }
    return s;
  }, [isHudPinned, hudPinnedOffsetPx, hudHiddenWhenPinned]);

  return { renderLevelBadge, hudDynamicStyle };
}