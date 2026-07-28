import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { wallRelativeDimensions } from "@/components/room/bass/best-layout/applyRecommendationUtils";

const levelText = (level) => Number.isFinite(level) ? (level > 0 ? `L${level}` : "FAIL") : "—";

export default function Rp22LayoutPlanDialog({ open, onOpenChange, layout, roomDims, onApply, isApplied, applyError, applying }) {
  if (!layout) return null;
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{layout.name}</DialogTitle>
        <DialogDescription>Recommended subwoofer positions based on RP22 placement guidance. Marker positions represent cabinet centres.</DialogDescription>
      </DialogHeader>
      <svg viewBox={`0 0 ${width} ${length}`} className="max-h-[300px] w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]" role="img" aria-label={`Room plan showing ${layout.sources.length} recommended subwoofer positions`}>
        <rect x="0.03" y="0.03" width={Math.max(0, width - 0.06)} height={Math.max(0, length - 0.06)} fill="none" stroke="#625143" strokeWidth="0.06" />
        <text x={width / 2} y={Math.min(0.28, length * 0.08)} textAnchor="middle" fontSize="0.16" fill="#625143">FRONT</text>
        {layout.sources.map((source, index) => <g key={source.id || index}><circle cx={source.x} cy={source.y} r={Math.max(0.12, Math.min(width, length) * 0.035)} fill="#213428" stroke="#FFFFFF" strokeWidth="0.04" /><text x={source.x} y={source.y + 0.055} textAnchor="middle" fontSize="0.14" fontWeight="700" fill="#FFFFFF">{index + 1}</text></g>)}
      </svg>
      <div className="grid grid-cols-3 gap-3 rounded-md bg-[#F3F1EC] p-3 text-sm">
        <Result label="Placement grade" value={layout.metrics.placementGrade} />
        <Result label="Predicted P19" value={levelText(layout.metrics.p19Level)} />
        <Result label="Predicted P20" value={levelText(layout.metrics.p20Level)} />
      </div>
      <p className="text-[10px] leading-relaxed text-[#8A7B6A]">Predicted from the placement model. Apply this layout to recalculate the bass response.</p>
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
      {applyError && <p className="text-[11px] text-red-700">{applyError}</p>}
      <DialogFooter className="gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>Cancel</Button>
        <Button type="button" onClick={() => onApply(layout)} className="bg-[#213428] text-white hover:bg-[#3E4349]" disabled={applying || isApplied}>
          {applying ? "Applying…" : isApplied ? "Applied" : "Apply recommended positions"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Result({ label, value }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-[#8A7B6A]">{label}</div><div className="mt-1 font-semibold text-[#1B1A1A]">{value}</div></div>;
}