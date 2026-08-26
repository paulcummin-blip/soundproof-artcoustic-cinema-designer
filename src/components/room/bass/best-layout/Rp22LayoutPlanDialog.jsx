import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { wallRelativeDimensions } from "@/components/room/bass/best-layout/applyRecommendationUtils";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";

// Breathing room around the room outline — 12.5% of room span on each side.
const PADDING_FRACTION = 0.125;

export default function Rp22LayoutPlanDialog({ open, onOpenChange, layout, roomDims, subModel, onApply, isApplied, applyError, applying, unsupported }) {
  if (!layout) return null;
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;

  // Real cabinet footprint from the product registry — same authority as the
  // main Room Designer plan view (getModelDimsM → SpeakerRect).
  const { widthM: cabW, depthM: cabD } = getModelDimsM(subModel);

  // Padded viewBox so the room sits with ~12.5% breathing room on every side.
  const padX = width * PADDING_FRACTION;
  const padY = length * PADDING_FRACTION;
  const vbW = width + padX * 2;
  const vbH = length + padY * 2;

  // Subtle stroke scaled to room size.
  const outlineStroke = Math.max(0.02, Math.min(width, length) * 0.008);
  const subStroke = Math.max(0.01, Math.min(width, length) * 0.004);
  const fontSizeLabel = Math.max(0.10, Math.min(width, length) * 0.045);
  const fontSizeFront = Math.max(0.12, Math.min(width, length) * 0.05);

  // Offset from room coordinate (0..width, 0..length) to viewBox coordinate.
  const ox = (x) => padX + Number(x);
  const oy = (y) => padY + Number(y);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{layout.name}</DialogTitle>
        <DialogDescription>Recommended subwoofer positions based on recognised placement patterns. Marker positions represent cabinet centres.</DialogDescription>
      </DialogHeader>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="max-h-[300px] w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]" role="img" aria-label={`Room plan showing ${layout.sources.length} recommended subwoofer positions`}>
        {/* Room outline */}
        <rect x={padX} y={padY} width={width} height={length} fill="none" stroke="#625143" strokeWidth={outlineStroke} />
        {/* Subtle FRONT label in the top padding band */}
        <text x={padX + width / 2} y={padY * 0.62} textAnchor="middle" fontSize={fontSizeFront} fill="#8A7B6A" letterSpacing="0.08em">FRONT</text>
        {/* Subwoofers — real cabinet footprints centred on the recommended coordinates */}
        {layout.sources.map((source, index) => {
          const cx = ox(source.x);
          const cy = oy(source.y);
          return <g key={source.id || index}>
            <rect
              x={cx - cabW / 2}
              y={cy - cabD / 2}
              width={cabW}
              height={cabD}
              rx={0}
              ry={0}
              fill="#1a1a1a"
              stroke="#0a0a0a"
              strokeWidth={subStroke}
            />
            <text
              x={cx}
              y={cy + fontSizeLabel * 0.35}
              textAnchor="middle"
              fontSize={fontSizeLabel}
              fontWeight="700"
              fill="#FFFFFF"
            >{index + 1}</text>
          </g>;
        })}
      </svg>
      <p className="text-[10px] leading-relaxed text-[#8A7B6A]">Apply this layout to recalculate the bass response.</p>
      <div className="rounded-md border border-[#E7E4DF] bg-white/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Exact coordinates (cabinet centres)</div>
        <div className="mt-2 space-y-1.5">
          {layout.sources.map((source, index) => {
            const walls = wallRelativeDimensions(source, roomDims);
            return <div key={source.id || index} className="text-xs text-[#1B1A1A]">
              <span className="font-semibold">Sub {index + 1}:</span>{" "}
              <span className="text-[#625143]">X {walls.fromLeftWall.toFixed(3)} m from left</span>{" · "}
              <span className="text-[#625143]">Y {walls.fromFrontWall.toFixed(3)} m from front</span>{" · "}
              <span className="text-[#625143]">{walls.fromRightWall.toFixed(3)} m from right</span>{" · "}
              <span className="text-[#625143]">{walls.fromRearWall.toFixed(3)} m from rear</span>
            </div>;
          })}
        </div>
      </div>
      {unsupported && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-medium text-amber-800">Exact application of this side-wall layout is not currently supported.</p>
          <p className="mt-1 text-[10px] text-amber-700">This layout uses side-wall positions (left/right) which the app cannot apply. View the coordinates for reference, or choose a front/rear layout to apply.</p>
        </div>
      )}
      {applyError && !unsupported && <p className="text-[11px] text-red-700">{applyError}</p>}
      <DialogFooter className="grid w-full grid-cols-2 gap-3 pt-3 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>Cancel</Button>
        <Button
          type="button"
          onClick={() => onApply(layout)}
          disabled={applying || isApplied || unsupported}
          style={{
            backgroundColor: "#213428",
            color: "#FFFFFF",
            borderColor: "#213428",
            opacity: 1,
            visibility: "visible",
            display: "inline-flex",
          }}
        >
          {applying ? "Applying…" : isApplied ? "Applied" : unsupported ? "Not supported" : "Apply recommended positions"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}