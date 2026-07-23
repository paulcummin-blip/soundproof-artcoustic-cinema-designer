// components/room/P14LevelPill.jsx
// Live RP22 P14 level pill — reuses the standard RP22GradingPill styling and the
// shared useLiveP14Level hook (same source of truth / thresholds as the RP22
// report card). P14 is always post-EQ; this pill never reflects the Bass
// Response graph's visual raw/EQ toggle.
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import { useLiveP14Level } from '@/components/hooks/useLiveP14Level';

function LiveP14LevelPill({ showSpl }) {
  const p14 = useLiveP14Level();
  const tooltip = "This estimate uses simulated subwoofer output capability, approved continuous SPL data, and applied EQ headroom. It is intentionally conservative and does not include room gain.";
  if (!p14.hasData) return <span title={tooltip}><RP22GradingPill level="—">Estimated LFE Capability —</RP22GradingPill></span>;
  const levelForPill = p14.level ?? 'FAIL';
  const label = (showSpl && Number.isFinite(p14.valueDb)) ? `Estimated LFE Capability: ${p14.valueDb.toFixed(1)} dBC` : `Estimated LFE Capability ${levelForPill}`;
  return <span title={tooltip}><RP22GradingPill level={levelForPill}>{label}</RP22GradingPill></span>;
}

export default function P14LevelPill({ showSpl = false, optimiserResult = null }) {
  const validationP14 = optimiserResult?.achievedP14Level;
  if (validationP14) return <span title="This estimate uses simulated subwoofer output capability, approved continuous SPL data, and applied EQ headroom. It is intentionally conservative and does not include room gain."><RP22GradingPill level={validationP14}>Estimated LFE Capability {validationP14}</RP22GradingPill></span>;
  return <LiveP14LevelPill showSpl={showSpl} />;
}