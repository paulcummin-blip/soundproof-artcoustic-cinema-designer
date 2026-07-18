// components/room/P14LevelPill.jsx
// Live RP22 P14 level pill — reuses the standard RP22GradingPill styling and the
// shared useLiveP14Level hook (same source of truth / thresholds as the RP22
// report card). P14 is always post-EQ; this pill never reflects the Bass
// Response graph's visual raw/EQ toggle.
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import { useLiveP14Level } from '@/components/hooks/useLiveP14Level';

function LiveP14LevelPill({ showSpl }) {
  const p14 = useLiveP14Level();
  if (!p14.hasData) return <span title="P14 post-EQ LFE SPL capability at RSP"><RP22GradingPill level="—">P14 —</RP22GradingPill></span>;
  const levelForPill = p14.level ?? 'FAIL';
  const label = (showSpl && Number.isFinite(p14.valueDb)) ? `P14: ${p14.valueDb.toFixed(1)} dB post-EQ at RSP` : `P14 ${levelForPill}`;
  return <span title="P14 post-EQ LFE SPL capability at RSP"><RP22GradingPill level={levelForPill}>{label}</RP22GradingPill></span>;
}

export default function P14LevelPill({ showSpl = false, optimiserResult = null }) {
  const validationP14 = optimiserResult?.achievedP14Level;
  if (validationP14) return <span title="P14 from the active bass optimiser validation candidate"><RP22GradingPill level={validationP14}>P14 {validationP14}</RP22GradingPill></span>;
  return <LiveP14LevelPill showSpl={showSpl} />;
}