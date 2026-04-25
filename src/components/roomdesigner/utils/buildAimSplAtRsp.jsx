import { getMlpSeat, getSeatSplMetrics } from "@/components/utils/spl/centralSplEngine";

export default function buildAimSplAtRsp(seatingPositions = [], allSeatSplMetrics) {
  const rspSeat = getMlpSeat(seatingPositions);
  const rspSpl = getSeatSplMetrics(allSeatSplMetrics, rspSeat?.id) || getSeatSplMetrics(allSeatSplMetrics, 'mlp');

  const fmt = (value) => Number.isFinite(value) ? Math.round(value) : null;
  const pick = (group, role) => fmt(rspSpl?.[group]?.[role]?.value);

  return {
    leftRight: { L: pick('screen', 'FL'), R: pick('screen', 'FR') },
    frontWides: { LW: pick('surrounds', 'LW'), RW: pick('surrounds', 'RW') },
    sideSurrounds: { SL: pick('surrounds', 'SL'), SR: pick('surrounds', 'SR') },
    rearSurrounds: { SBL: pick('surrounds', 'SBL'), SBR: pick('surrounds', 'SBR') },
  };
}