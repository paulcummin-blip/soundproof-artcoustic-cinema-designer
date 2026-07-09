// hooks/useSeatResponses.jsx
import { useMemo } from 'react';
import { useAppState } from '../../AppStateProvider';
import { simulateResponseWithExtrasWrapper } from '@/components/bass/bassSimulationEngine';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

export const useSeatResponses = () => {
  const appState = useAppState();
  const { subwoofers, seatingPositions, dimensions, roomDims } = appState || {};

  // Normalise + validate subs, but keep full object shape (wrapper expects .position)
  const simSubs = useMemo(() => {
    const subs = Array.isArray(subwoofers) ? subwoofers : [];
    return subs
      .map(s => {
        const p = s?.position || s; // accept either {position:{x,y,z}} or flat
        const x = p?.x, y = p?.y, z = p?.z ?? 0.1;

        if (!(isNum(x) && isNum(y) && isNum(z))) return null;

        // Preserve original fields, but guarantee .position exists
        return {
          ...(s && typeof s === 'object' ? s : {}),
          position: { x, y, z },
          enabled: s?.enabled ?? true,
          delay: s?.delay ?? 0,
          phaseAdjust: s?.phaseAdjust ?? 0,
          gainDb: s?.gainDb ?? 0,
          polarity: s?.polarity ?? 1,
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
        const { responseData, rp22Analysis } =
          simulateResponseWithExtrasWrapper(simSubs, seat, dims) || {};
        return {
          seatId: seat.id ?? `${seat.x.toFixed(2)}-${seat.y.toFixed(2)}`,
          isPrimary: !!seat.isPrimary,
          responseData: Array.isArray(responseData) ? responseData : [],
          factors: rp22Analysis?.factors || null,
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
  }, [JSON.stringify(seatsSafe), JSON.stringify(simSubs), dims.width, dims.length, dims.height]);

  return seatResponses;
};