import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Crosshair } from "lucide-react";
import { setMlpGrab } from "@/components/state/mlpGrabStore";
import { getSeatInfoMode, setSeatInfoMode as persistSeatInfoMode, subscribeSeatInfoMode } from "@/components/state/seatInfoModeStore";
import SeatInfoModeToggle from "@/components/roomdesigner/SeatInfoModeToggle";

export default function RoomDesignerPlanToolbar({
  allowExtraSurrounds,
  extraSurroundCount,
  dolbyPreset,
  frontSubsCfg,
  rearSubsCfg,
  overlayRelevance,
  overlays,
  setOverlays,
  enableFrontWides,
  setEnableFrontWides,
  liveImpactMode,
  setLiveImpactMode,
  seatingPositions = [],
  onMoveRsp,
}) {
  const seatInfoMode = useSyncExternalStore(subscribeSeatInfoMode, getSeatInfoMode, getSeatInfoMode);
  const [rspMenuOpen, setRspMenuOpen] = useState(false);
  const rspOptions = useMemo(() => {
    // Use the seats actually drawn, including any committed row moves.
    const byRow = new Map();
    seatingPositions.forEach((seat) => {
      if (!Number.isFinite(seat?.y)) return;
      const row = seat.rowNumber || 1;
      const values = byRow.get(row) || [];
      values.push(seat.y);
      byRow.set(row, values);
    });
    const rows = [...byRow.values()]
      .map((values) => values.reduce((sum, y) => sum + y, 0) / values.length)
      .sort((a, b) => a - b);
    const options = rows.map((y, index) => ({
      key: `row-${index}`,
      label: index === 0 ? 'Front row'
        : index === rows.length - 1 ? 'Back row'
        : rows.length === 3 ? 'Middle row' : `Row ${index + 1}`,
      detail: 'Row centre',
      y,
    }));
    if (rows.length > 1) {
      options.push({
        key: 'front-back-average',
        label: 'Average between rows',
        detail: '50% front row · 50% back row',
        y: (rows[0] + rows[rows.length - 1]) / 2,
      });
    }
    return options;
  }, [seatingPositions]);

  return (
    <div
      className="plan-toolbar"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        flexShrink: 0,
        gap: '8px 12px',
        padding: '6px 10px',
        borderBottom: '1px solid #DCDBD6',
        background: '#FFFFFF',
        zIndex: 1
      }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: "#213428",
            display: "flex",
            alignItems: "center",
            height: "100%",
            marginLeft: "12px"
          }}>

          {(() => {
           const extraN = allowExtraSurrounds ? Number(extraSurroundCount || 0) : 0;
           const parts = dolbyPreset.split('.');
           const displayMajor = (parseInt(parts[0], 10) || 0) + extraN;

           const frontCount = Number(frontSubsCfg?.count ?? 0);
           const rearCount = Number(rearSubsCfg?.count ?? 0);
           const totalSubs = frontCount + rearCount;

           const heights = parts[2] || ""; // may be missing for "5.1"

           // If there are heights, show displayMajor.sub.heights. If not, show displayMajor.sub.
           return heights ? `${displayMajor}.${totalSubs}.${heights}` : `${displayMajor}.${totalSubs}`;
          })()}
        </strong>

      </div>

      {/* PLAN TOOLS — dynamic list, only show relevant items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 12, alignItems: 'center' }}>
        {[
        { key: 'LCR', label: 'LCR' },
        { key: 'SIDE_SURROUND', label: 'Side Surrounds' },
        { key: 'REAR_SURROUND', label: 'Rear Surrounds' },
        { key: 'OVERHEADS_2', label: 'Overheads .2' },
        { key: 'OVERHEADS_4', label: 'Overheads .4' },
        { key: 'OVERHEADS_6', label: 'Overheads .6' },
        { key: 'enableDolbyZones', label: 'Dolby Zones' }].

        filter(({ key }) => overlayRelevance[key] !== false).
        map(({ key, label }) =>
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor={`overlay-top-${key}`} style={{ fontSize: 12, color: '#3E4349' }}>{label}</label>
              <Switch
            id={`overlay-top-${key}`}
            checked={!!overlays?.[key]}
            onCheckedChange={() => {
              setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
            }} />

            </div>
        )}

        {overlayRelevance.FRONT_WIDES &&
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="overlay-top-front-wides" style={{ fontSize: 12, color: '#3E4349' }}>Front Wides</label>
            <Switch
            id="overlay-top-front-wides"
            checked={!!enableFrontWides}
            onCheckedChange={(checked) => {
              setEnableFrontWides(checked);
            }} />

          </div>
        }
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
        {/* Seat click mode — what clicking a seat on the plan does */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderRight: '1px solid #DCDBD6',
            paddingRight: 12,
          }}
        >
          <span style={{ fontSize: 12, color: '#3E4349', fontWeight: 500 }}>Seat click</span>
          <SeatInfoModeToggle value={seatInfoMode} onChange={persistSeatInfoMode} />
        </div>

        <Popover open={rspMenuOpen} onOpenChange={setRspMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="RSP positioning"
              title="Move the reference seating position"
              disabled={!rspOptions.length || typeof onMoveRsp !== 'function'}
              className="inline-flex items-center gap-1.5 rounded border border-[#DCDBD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#213428] hover:bg-[#F4F3F0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Crosshair size={14} aria-hidden="true" />
              RSP
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-64 border-[#DCDBD6] bg-white p-2">
            <div className="px-2 pt-1 pb-2 text-xs font-semibold text-[#213428]">Move RSP to</div>
            {rspOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left hover:bg-[#F4F3F0] focus-visible:bg-[#F4F3F0] focus-visible:outline-none"
                onClick={() => {
                  // A shortcut is a one-off placement, not an automatic row binding.
                  setMlpGrab(false);
                  onMoveRsp(option.y);
                  setRspMenuOpen(false);
                }}
              >
                <span>
                  <span className="block text-xs font-semibold text-[#213428]">{option.label}</span>
                  <span className="block text-[10px] text-[#625143]">{option.detail}</span>
                </span>
                <span className="shrink-0 text-[10px] text-[#625143]">{option.y.toFixed(2)} m</span>
              </button>
            ))}
            <p className="mt-1 border-t border-[#DCDBD6] px-2 pt-2 pb-1 text-[10px] leading-relaxed text-[#625143]">
              Moves once; later seat changes leave RSP in place. Hold the green dot to position manually.
            </p>
          </PopoverContent>
        </Popover>

      {/* Live Impact dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid #DCDBD6', paddingLeft: 12 }}>
        <span style={{ fontSize: 12, color: '#3E4349', fontWeight: 500 }}>Live Impact</span>
        <select
          value={liveImpactMode || 'off'}
          onChange={(e) => setLiveImpactMode?.(e.target.value)}
          style={{ fontSize: 11, padding: '4px 6px', borderRadius: 4, border: '1px solid #DCDBD6', background: '#FFFFFF', color: '#3E4349', cursor: 'pointer', fontWeight: 500 }}
        >
          <option value="off">Off</option>
          <option value="summary">Summary</option>
          <option value="detailed">Detailed</option>
        </select>
      </div>
      </div>

      </div>
  );
}