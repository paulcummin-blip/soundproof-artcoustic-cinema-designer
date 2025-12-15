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

  // Build full sub objects with all control fields
  const simSubs = useMemo(() => {
    const subs = Array.isArray(subwoofers) ? subwoofers : [];
    
    return subs
      .map((s) => {
        const pos = s?.position || s;
        const x = pos?.x;
        const y = pos?.y;
        const z = pos?.z ?? 0.1;

        if (!isNum(x) || !isNum(y)) return null;

        // IMPORTANT: keep the full object so enabled/model/delay/phaseAdjust/gainDb exist
        return {
          ...s,
          position: { x, y, z },
          enabled: typeof s?.enabled === "boolean" ? s.enabled : true,
          delay: isNum(s?.delay) ? s.delay : 0,
          phaseAdjust: isNum(s?.phaseAdjust) ? s.phaseAdjust : 0,
          gainDb: isNum(s?.gainDb) ? s.gainDb : 0,
          polarity: isNum(s?.polarity) ? s.polarity : 1,
        };
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