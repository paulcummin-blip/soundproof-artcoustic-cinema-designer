import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Crosshair, Layers, Ruler } from "lucide-react";

/**
 * OverlaysPopover
 * ---------------
 * A compact popover that groups the less frequently used Plan View display
 * toggles (LCR, Side/Rear Surrounds, Overheads, Dolby Zones, Front Wides)
 * behind a single button, keeping the main toolbar uncluttered.
 *
 * The overlay switches and their relevance filtering are identical to the
 * previous inline grid — only the presentation changes.
 */
function OverlaysPopover({
  overlayRelevance,
  overlays,
  setOverlays,
  enableFrontWides,
  setEnableFrontWides,
}) {
  const [open, setOpen] = useState(false);

  const overlayItems = [
    { key: 'LCR', label: 'LCR' },
    { key: 'SIDE_SURROUND', label: 'Side Surrounds' },
    { key: 'REAR_SURROUND', label: 'Rear Surrounds' },
    { key: 'OVERHEADS_2', label: 'Overheads .2' },
    { key: 'OVERHEADS_4', label: 'Overheads .4' },
    { key: 'OVERHEADS_6', label: 'Overheads .6' },
    { key: 'enableDolbyZones', label: 'Dolby Zones' },
  ].filter(({ key }) => overlayRelevance?.[key] !== false);

  const activeCount = overlayItems.filter(({ key }) => !!overlays?.[key]).length
    + (overlayRelevance?.FRONT_WIDES && enableFrontWides ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-[#DCDBD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#213428] hover:bg-[#F4F3F0] whitespace-nowrap"
        >
          <Layers size={14} aria-hidden="true" />
          Overlays
          {activeCount > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                fontSize: 9,
                fontWeight: 700,
                background: '#213428',
                color: '#FFFFFF',
              }}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-56 p-3 border-[#DCDBD6]">
        <div className="space-y-2.5">
          {overlayItems.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <label htmlFor={`overlay-pop-${key}`} style={{ fontSize: 12, color: '#3E4349', cursor: 'pointer' }}>
                {label}
              </label>
              <Switch
                id={`overlay-pop-${key}`}
                checked={!!overlays?.[key]}
                onCheckedChange={() => {
                  setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
                }}
              />
            </div>
          ))}
          {overlayRelevance?.FRONT_WIDES && (
            <div className="flex items-center justify-between gap-3 border-t border-[#E2DED7] pt-2.5">
              <label htmlFor="overlay-pop-front-wides" style={{ fontSize: 12, color: '#3E4349', cursor: 'pointer' }}>
                Front Wides
              </label>
              <Switch
                id="overlay-pop-front-wides"
                checked={!!enableFrontWides}
                onCheckedChange={(checked) => {
                  setEnableFrontWides(checked);
                }}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
import { setMlpGrab } from "@/components/state/mlpGrabStore";
import { getSeatInfoMode, setSeatInfoMode as persistSeatInfoMode, subscribeSeatInfoMode } from "@/components/state/seatInfoModeStore";
import SeatInfoModeToggle from "@/components/roomdesigner/SeatInfoModeToggle";
import { systemFormat } from "@/shared/systemFormat";

export default function RoomDesignerPlanToolbar({
  allowExtraSurrounds,
  extraSurroundCount,
  dolbyPreset,
  frontSubsCfg,
  rearSubsCfg,
  subwooferInstances = [],
  overlayRelevance,
  overlays,
  setOverlays,
  enableFrontWides,
  setEnableFrontWides,
  liveImpactMode,
  setLiveImpactMode,
  seatingPositions = [],
  onMoveRsp,
  measureMode = false,
  setMeasureMode,
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
            fontSize: 22,
            fontWeight: 700,
            color: "#213428",
            display: "flex",
            alignItems: "center",
            height: "100%",
            marginLeft: "4px"
          }}>

          {/* The design's system format, from the one client-facing format
              authority: bed channels . ACTIVE subwoofers . overhead channels.
              The codec's own .1 LFE identity is untouched. */}
          {systemFormat({
            layout: dolbyPreset,
            extraBedChannels: allowExtraSurrounds ? Number(extraSurroundCount || 0) : 0,
            subwooferInstances,
            frontSubsCfg,
            rearSubsCfg,
          }) || ""}
        </strong>

      </div>

      {/* Overlays popover — compact control for less frequently used display toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
        <OverlaysPopover
          overlayRelevance={overlayRelevance}
          overlays={overlays}
          setOverlays={setOverlays}
          enableFrontWides={enableFrontWides}
          setEnableFrontWides={setEnableFrontWides}
        />

        {/* Seat click mode — what clicking a seat on the plan does */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            borderLeft: '1px solid #DCDBD6',
            paddingLeft: 12,
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

        <button
          type="button"
          aria-label="Measure"
          aria-pressed={measureMode}
          title={measureMode ? 'Turn off Measure and clear the tape' : 'Measure between two points on the plan'}
          onClick={() => {
            setMlpGrab(false);
            setRspMenuOpen(false);
            setMeasureMode?.(!measureMode);
          }}
          className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold"
          style={{
            borderColor: measureMode ? '#3E6B4F' : '#DCDBD6',
            background: measureMode ? '#213428' : '#FFFFFF',
            color: measureMode ? '#FFFFFF' : '#213428',
          }}
        >
          <Ruler size={14} aria-hidden="true" />
          Measure
        </button>

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