// hooks/useLiveP14Level.jsx
// Lightweight, live RP22 P14 (LFE SPL capability at RSP) reader for UI pills.
// Reuses the exact same data source (useSeatResponses) and scoring function
// (computeParam14LfeCapability from rp22BassMetrics) as the RP22 analysis
// engine / report card — no duplicated threshold logic, no separate calculation.
//
// RP22 P14 is always post-EQ, regardless of the Bass Response graph's visual
// raw/EQ toggle — this hook always calls computeParam14LfeCapability with
// designEqEnabled=true.
import { useMemo } from 'react';
import { useAppState } from '@/components/AppStateProvider';
import { useSeatResponses } from '@/components/room/hooks/useSeatResponses';
import { computeParam14LfeCapability } from '@/components/utils/rp22BassMetrics';
import { MODELS, normaliseModelKey } from '@/components/models/speakers/registry';

export function useLiveP14Level() {
  const { seatingPositions, subwoofers } = useAppState() || {};
  const seatResponses = useSeatResponses();

  return useMemo(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    const primary = seats.find((s) => s.isPrimary) || seats[0] || null;
    const rspSeatId = primary ? (primary.id ?? `${primary.x}-${primary.y}`) : null;

    const rspEntry = rspSeatId != null
      ? seatResponses.find((r) => String(r?.seatId) === String(rspSeatId))
      : seatResponses[0];

    const rspResponse = rspEntry?.responseData;
    if (!Array.isArray(rspResponse) || rspResponse.length === 0) {
      return { hasData: false, level: null, valueDb: null, formatted: null };
    }

    const activeSubs = (Array.isArray(subwoofers) ? subwoofers : []).filter((sub) => sub?.enabled !== false);
    const models = activeSubs
      .map((sub) => MODELS.find((model) => model.key === normaliseModelKey(sub.model)))
      .filter(Boolean);
    const usableLfValues = models.map((model) => model.approvedUsableLfHzMinus6dB).filter(Number.isFinite);
    const usableLfHz = usableLfValues.length > 0 ? Math.max(...usableLfValues) : null;

    const result = computeParam14LfeCapability(
      rspResponse,
      true,
      [20, 120],
      usableLfHz,
      activeSubs
    );
    if (!result) {
      return { hasData: false, level: null, valueDb: null, formatted: null };
    }

    return {
      hasData: true,
      level: result.level, // "L4"/"L3"/"L2"/"L1" or null (below L1 → FAIL)
      valueDb: result.value,
      formatted: result.formatted,
    };
  }, [seatingPositions, seatResponses, subwoofers]);
}