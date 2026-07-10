// hooks/useSeatResponses.jsx
import { useMemo } from 'react';
import { useAppState } from '../../AppStateProvider';
import { simulateResponseWithExtrasWrapper } from '@/components/bass/bassSimulationEngine';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

export const useSeatResponses = () => {
  const appState = useAppState();
  const { subwoofers, seatingPositions, dimensions, roomDims, mlpY_m } = appState || {};

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

  // Green RSP / MLP marker coordinate — same source as the visual marker
  // (mlpAnchorEffective in RoomDesigner.jsx): x = room width / 2, y = mlpY_m, z = 1.2.
  const rspCoord = useMemo(() => {
    const y = mlpY_m;
    const w = dims.width;
    if (!isNum(y) || !isNum(w) || w <= 0) return null;
    return { x: w / 2, y, z: 1.2 };
  }, [mlpY_m, dims.width]);

  const seatResponses = useMemo(() => {
    if (simSubs.length === 0) return [];
    const hasRsp = rspCoord && isNum(rspCoord.x) && isNum(rspCoord.y);
    if (seatsSafe.length === 0 && !hasRsp) return [];

    try {
      const real = seatsSafe.map(seat => {
        const { responseData, capabilityResponseData, rp22Analysis } =
          simulateResponseWithExtrasWrapper(simSubs, seat, dims) || {};
        return {
          seatId: seat.id ?? `${seat.x.toFixed(2)}-${seat.y.toFixed(2)}`,
          isPrimary: !!seat.isPrimary,
          responseData: Array.isArray(responseData) ? responseData : [],
          capabilityResponseData: Array.isArray(capabilityResponseData) ? capabilityResponseData : [],
          factors: rp22Analysis?.factors || null,
        };
      });

      // Synthetic RSP response at the green RSP / MLP marker coordinate so
      // P14/P18/P19 measure at the actual RSP, not the first seat.
      if (hasRsp) {
        const { responseData, capabilityResponseData, rp22Analysis } =
          simulateResponseWithExtrasWrapper(simSubs, rspCoord, dims) || {};
        if (Array.isArray(responseData) && responseData.length > 0) {
          real.push({
            seatId: "rsp",
            isPrimary: true,
            __isSyntheticRsp: true,
            responseData,
            capabilityResponseData: Array.isArray(capabilityResponseData) ? capabilityResponseData : [],
            factors: rp22Analysis?.factors || null,
          });
        }
      }
      return real;
    } catch (e) {
      // Fail safe: never crash the UI
      return seatsSafe.map(seat => ({
        seatId: seat.id ?? `${seat.x}-${seat.y}`,
        isPrimary: !!seat.isPrimary,
        responseData: [],
        capabilityResponseData: [],
        factors: null,
        error: 'bass-sim-error',
      }));
    }
  // stringify to avoid stale results when arrays mutate in place
  }, [JSON.stringify(seatsSafe), JSON.stringify(simSubs), dims.width, dims.length, dims.height, rspCoord]);

  return seatResponses;
};