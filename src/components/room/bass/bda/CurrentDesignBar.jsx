// CurrentDesignBar.jsx
// ---------------------------------------------------------------------------
// Zone 1 — Current Design
//
// One compact bar answering: "What am I designing?"
//
// [thumbnail]  Current Design                    [Change Speakers] [Change Layout]
//              SUB3-12 ×2
//              2 Subwoofers · Pair Layout
//              ● Performance is current
//
// Lifecycle status is consumed from bassCalculationLifecycle — this component
// does NOT derive lifecycle state independently.
// ---------------------------------------------------------------------------

import React from "react";
import { Settings2, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { formatSubwooferSystemLabel } from "@/components/utils/subwooferDisplayLabel";
import { deriveBassDisplayStatus, BASS_DISPLAY_ICON, BASS_LIFECYCLE_STATE } from "../bassCalculationLifecycle";

function LayoutThumbnail({ subwooferInstances, roomDims }) {
  const enabled = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((s) => s?.enabled !== false);
  if (enabled.length === 0) return null;

  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const pad = Math.max(width, length) * 0.08;
  const radius = Math.max(0.1, Math.min(width, length) * 0.055);

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`}
      className="h-12 w-16 shrink-0 rounded-md border border-[#D9D5CE] bg-[#F8F7F4]"
      role="img"
      aria-label={`Plan showing ${enabled.length} subwoofer position${enabled.length > 1 ? "s" : ""}`}
    >
      <text x={width / 2} y={-pad * 0.25} textAnchor="middle" fontSize={Math.max(0.12, pad * 0.45)} fill="#8A7B6A">FRONT</text>
      <rect x="0" y="0" width={width} height={length} fill="white" stroke="#8A7B6A" strokeWidth={Math.max(0.02, radius * 0.12)} />
      {enabled.map((sub, index) => {
        const pos = sub?.position || sub;
        const x = Number(pos?.x);
        const y = Number(pos?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return (
          <g key={sub?.id || index}>
            <circle cx={x} cy={y} r={radius} fill="#213428" />
            <text x={x} y={y + radius * 0.34} textAnchor="middle" fontSize={radius} fontWeight="700" fill="white">{index + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function deriveLayoutLabel(subwooferInstances) {
  const enabled = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((s) => s?.enabled !== false);
  const count = enabled.length;
  if (count === 0) return null;

  const placements = enabled.map((s) => {
    const group = s?.group || s?.legacyGroup;
    if (group === "rear") return "rear";
    if (group === "left") return "left";
    if (group === "right") return "right";
    return "front";
  });
  const uniquePlacements = [...new Set(placements)].sort();

  let layoutName;
  if (count === 1) layoutName = "Single Layout";
  else if (count === 2) {
    if (uniquePlacements.includes("front") && uniquePlacements.includes("rear")) layoutName = "Front-Rear Layout";
    else if (uniquePlacements.includes("left") && uniquePlacements.includes("right")) layoutName = "Left-Right Layout";
    else layoutName = "Pair Layout";
  } else if (count === 4) {
    if (uniquePlacements.length >= 3) layoutName = "Quarter Layout";
    else if (uniquePlacements.includes("front") && uniquePlacements.includes("rear")) layoutName = "Front-Rear Layout";
    else layoutName = "Four-Point Layout";
  } else {
    layoutName = `${count}-Point Layout`;
  }

  return { count, layoutName };
}

function StatusIcon({ icon, isCalculating }) {
  if (icon === BASS_DISPLAY_ICON.LOADER) return <Loader2 className={`h-3 w-3 ${isCalculating ? "animate-spin" : ""}`} />;
  if (icon === BASS_DISPLAY_ICON.CHECK) return <CheckCircle2 className="h-3 w-3" />;
  if (icon === BASS_DISPLAY_ICON.ALERT) return <AlertCircle className="h-3 w-3" />;
  return null;
}

export default function CurrentDesignBar({
  frontModel, frontCount, rearModel, rearCount,
  subwooferInstances, roomDims,
  bassLifecycleState = BASS_LIFECYCLE_STATE.IDLE,
  onChangeSpeakers, onChangeLayout,
}) {
  const hasFront = frontCount > 0 && frontModel;
  const hasRear = rearCount > 0 && rearModel;

  if (!hasFront && !hasRear) {
    return (
      <div className="rounded-lg border border-dashed border-[#C9C2B8] bg-[#F8F7F4] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current Design</div>
        <div className="mt-0.5 text-[12px] text-[#625143]">No subwoofers configured.</div>
        <button
          type="button"
          onClick={onChangeSpeakers}
          className="mt-1 text-[11px] font-semibold text-[#213428] underline underline-offset-2 hover:no-underline"
        >
          Configure in Speakers
        </button>
      </div>
    );
  }

  const systemLabel = formatSubwooferSystemLabel(frontModel, frontCount, rearModel, rearCount);

  const layout = deriveLayoutLabel(subwooferInstances);

  // Lifecycle display from the sole authority — no independent derivation.
  const display = deriveBassDisplayStatus(bassLifecycleState);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#D9D5CE] bg-white px-4 py-3">
      <LayoutThumbnail subwooferInstances={subwooferInstances} roomDims={roomDims} />
      <div className="flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current Design</div>
        <div className="mt-0.5 text-[14px] font-semibold text-[#1B1A1A]" style={{ fontFamily: "Didact Gothic, sans-serif" }}>
          {systemLabel}
        </div>
        {layout && (
          <div className="text-[12px] text-[#625143]">
            {layout.count} Subwoofer{layout.count > 1 ? "s" : ""} · {layout.layoutName}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: display.color }}>
          <StatusIcon icon={display.icon} isCalculating={display.isCalculating} />
          {display.text}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onChangeSpeakers}
          className="flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#213428] transition-colors hover:bg-[#F5F5F0]"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Change Speakers
        </button>
        <button
          type="button"
          onClick={onChangeLayout}
          className="flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#213428] transition-colors hover:bg-[#F5F5F0]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Change Layout
        </button>
      </div>
    </div>
  );
}