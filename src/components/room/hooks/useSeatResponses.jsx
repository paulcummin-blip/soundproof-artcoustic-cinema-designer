// hooks/useSeatResponses.jsx
import { useMemo } from 'react';
import { useAppState } from '../../AppStateProvider';
import { BassResponseEngine } from '../bass/BassResponseEngine'; // <-- adjust if the file lives elsewhere

const isNum = v => typeof v === 'number' && Number.isFinite(v);

export const useSeatResponses = () => {
  const appState = useAppState();
  const { subwoofers, seatingPositions, dimensions, roomDims } = appState || {};

  // Create the engine once
  const bassEngine = useMemo(() => new BassResponseEngine(), []);

  // Keep full sub objects, only validate position coordinates
  const simSubs = useMemo(() => {
    const subs = Array.isArray(subwoofers) ? subwoofers : [];
    return subs
      .map(s => {
        const x = s?.position?.x;
        const y = s?.position?.y;
        if (!isNum(x) || !isNum(y)) return null;
        return s;
      })
      .filter(Boolean);
  }, [subwoofers]);

  const seatsSafe = useMemo(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    return seats.filter(s => isNum(s?.x) && isNum(s?.y));
  }, [seatingPositions]);

  const dims = {
    width:  roomDims?.widthM  ?? dimensions?.width  ?? 4,
    length: roomDims?.lengthM ?? dimensions?.length ?? 6,
    height: roomDims?.heightM ?? dimensions?.height ?? 2.6,
  };

  const seatResponses = useMemo(() => {
    if (seatsSafe.length === 0 || simSubs.length === 0) return [];

    try {
      return seatsSafe.map(seat => {
        const { responseData, factors } =
          bassEngine.simulateResponseWithExtras(simSubs, seat, dims) || {};
        return {
          seatId: seat.id ?? `${seat.x.toFixed(2)}-${seat.y.toFixed(2)}`,
          isPrimary: !!seat.isPrimary,
          responseData: Array.isArray(responseData) ? responseData : [],
          factors: factors || null,
        };
      });
    } catch (e) {
      // Fail safe: never crash the UI
      return seatsSafe.map(seat => ({
        seatId: seat.id ?? `${seat.x}-${seat.y}`,
        isPrimary: !!seat.isPrimary,
        responseData: [],
        factors: null,
        error: 'bass-sim-error',
      }));
    }
  // stringify to avoid stale results when arrays mutate in place
  }, [JSON.stringify(seatsSafe), JSON.stringify(simSubs), dims.width, dims.length, dims.height, bassEngine]);

  return seatResponses;
};