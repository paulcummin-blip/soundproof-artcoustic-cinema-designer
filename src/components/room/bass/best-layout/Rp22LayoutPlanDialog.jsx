import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Rp22LayoutPlanDialog({ open, onOpenChange, layout, roomDims, onApply }) {
  if (!layout) return null;
  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{layout.name}</DialogTitle><DialogDescription>Recommended subwoofer positions based on RP22 placement guidance.</DialogDescription></DialogHeader>
      <svg viewBox={`0 0 ${width} ${length}`} className="max-h-[420px] w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]" role="img" aria-label={`Room plan showing ${layout.sources.length} recommended subwoofer positions`}>
        <rect x="0.03" y="0.03" width={Math.max(0, width - 0.06)} height={Math.max(0, length - 0.06)} fill="none" stroke="#625143" strokeWidth="0.06" />
        <text x={width / 2} y={Math.min(0.28, length * 0.08)} textAnchor="middle" fontSize="0.16" fill="#625143">FRONT</text>
        {layout.sources.map((source, index) => <g key={source.id || index}><circle cx={source.x} cy={source.y} r={Math.max(0.12, Math.min(width, length) * 0.035)} fill="#213428" stroke="#FFFFFF" strokeWidth="0.04" /><text x={source.x} y={source.y + 0.055} textAnchor="middle" fontSize="0.14" fontWeight="700" fill="#FFFFFF">{index + 1}</text></g>)}
      </svg>
      <div className="grid grid-cols-3 gap-3 rounded-md bg-[#F3F1EC] p-3 text-sm"><Result label="Grade" value={layout.metrics.placementGrade} /><Result label="P19" value={`L${layout.metrics.p19Level}`} /><Result label="P20" value={`L${layout.metrics.p20Level}`} /></div>
      <DialogFooter><Button type="button" onClick={() => { onApply(layout); onOpenChange(false); }} className="bg-[#213428] text-white hover:bg-[#3E4349]">Apply recommended layout</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Result({ label, value }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-[#8A7B6A]">{label}</div><div className="mt-1 font-semibold text-[#1B1A1A]">{value}</div></div>;
}