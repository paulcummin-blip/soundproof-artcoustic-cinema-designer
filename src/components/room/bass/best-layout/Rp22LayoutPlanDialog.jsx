import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";
import { getModelsByCategoryOrdered } from "@/components/models/speakers/registry";
import { adjustSourceForCabinet } from "@/components/room/bass/best-layout/applyRecommendationUtils";

const PADDING_FRACTION = 0.125;
const SUBWOOFER_MODELS = getModelsByCategoryOrdered().SUBWOOFERS;
const DEFAULT_SUB_MODEL = SUBWOOFER_MODELS[0]?.key || "sub2-12";

export default function Rp22LayoutPlanDialog({ open, onOpenChange, layout, roomDims, subModel, onApply, isApplied, applying }) {
  const [selectedModel, setSelectedModel] = useState(subModel || DEFAULT_SUB_MODEL);

  useEffect(() => {
    if (open) setSelectedModel(subModel || DEFAULT_SUB_MODEL);
  }, [open, subModel]);

  const cabDims = getModelDimsM(selectedModel);
  const cabW = Number(cabDims.widthM) || 0.5;
  const cabD = Number(cabDims.depthM) || 0.3;

  const adjustedSources = useMemo(() => {
    if (!layout?.sources) return [];
    return layout.sources.map((s) => adjustSourceForCabinet(s, roomDims, cabW, cabD));
  }, [layout, roomDims, cabW, cabD]);

  if (!layout) return null;

  const width = Number(roomDims?.widthM) || 1;
  const length = Number(roomDims?.lengthM) || 1;
  const subCount = (layout.sources || []).length;

  // Padded viewBox
  const padX = width * PADDING_FRACTION;
  const padY = length * PADDING_FRACTION;
  const vbW = width + padX * 2;
  const vbH = length + padY * 2;
  const outlineStroke = Math.max(0.02, Math.min(width, length) * 0.008);
  const subStroke = Math.max(0.01, Math.min(width, length) * 0.004);
  const fontSizeLabel = Math.max(0.10, Math.min(width, length) * 0.045);
  const fontSizeFront = Math.max(0.12, Math.min(width, length) * 0.05);

  const ox = (x) => padX + Number(x);
  const oy = (y) => padY + Number(y);

  const handleApply = () => {
    const adjustedLayout = { ...layout, sources: adjustedSources };
    onApply(adjustedLayout, selectedModel);
  };

  const applyLabel = `Apply ${subCount}-Sub Layout`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{layout.name}</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] leading-relaxed text-[#625143]">
          Recommended {subCount}-sub starting layout for this room and seating area.
        </p>

        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="mt-3 max-h-[320px] w-full rounded-md border border-[#D9D5CE] bg-[#F8F7F4]"
          role="img"
          aria-label={`Room plan showing ${subCount} recommended subwoofer positions`}
        >
          <rect x={padX} y={padY} width={width} height={length} fill="none" stroke="#625143" strokeWidth={outlineStroke} />
          <text x={padX + width / 2} y={padY * 0.62} textAnchor="middle" fontSize={fontSizeFront} fill="#8A7B6A" letterSpacing="0.08em">FRONT</text>
          {adjustedSources.map((source, index) => {
            const cx = ox(source.x);
            const cy = oy(source.y);
            const isRotated = source.rotationDeg === 90 || source.rotationDeg === 270;
            const rectW = isRotated ? cabD : cabW;
            const rectH = isRotated ? cabW : cabD;
            return (
              <g key={source.id || index}>
                <rect
                  x={cx - rectW / 2}
                  y={cy - rectH / 2}
                  width={rectW}
                  height={rectH}
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
              </g>
            );
          })}
        </svg>

        <div className="mt-3">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[#625143]">Subwoofer model</label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="mt-1 w-full">
              <SelectValue placeholder="Select subwoofer" />
            </SelectTrigger>
            <SelectContent>
              {SUBWOOFER_MODELS.map((model) => (
                <SelectItem key={model.key} value={model.key}>{model.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-[#8A7B6A]">
          Applying this layout only moves the subwoofers. It does not start bass analysis.
        </p>

        <div className="mt-4 grid w-full grid-cols-2 gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={applying || isApplied}
            style={{
              backgroundColor: "#213428",
              color: "#FFFFFF",
              borderColor: "#213428",
              opacity: 1,
              visibility: "visible",
              display: "inline-flex",
            }}
          >
            {applying ? "Applying…" : isApplied ? "Applied" : applyLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}