
import React, { useMemo } from "react";
import { viewingDimsM, overallFrameDimsM } from "../utils/viewingAndScreenMetrics";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const SIZES = Array.from({ length: 16 }, (_, i) => 100 + i * 10); // 100..250

export default function ScreenSizePicker({
  screen, setScreen,
  roomHeightM = 2.7,
  mountBottomM,         // pass your screenHeight (mount) here if you track it separately
}) {
  const visibleWidthInches = screen?.visibleWidthInches ?? 100;
  const aspect = screen?.aspectRatio || "16:9";

  const { viewWm, viewHm } = useMemo(
    () => viewingDimsM(visibleWidthInches, aspect),
    [visibleWidthInches, aspect]
  );
  const { overallWm, overallHm } = useMemo(
    () => overallFrameDimsM(visibleWidthInches, aspect, 8),
    [visibleWidthInches, aspect]
  );

  const heightWarnings = useMemo(() => {
    const bottom = Number.isFinite(mountBottomM) ? mountBottomM : 0.5;
    const top = bottom + overallHm;
    const warnings = [];
    if (!Number.isFinite(roomHeightM)) {
        warnings.push("Room height unknown.");
    } else {
        if (top > roomHeightM) warnings.push("Screen too tall for room height.");
        if (bottom < 0) warnings.push("Screen bottom below floor (mount too low).");
    }
    return warnings;
  }, [overallHm, roomHeightM, mountBottomM]);

  const onSizeChange = (val) => {
    const inches = Number(val);
    if (!Number.isFinite(inches)) return;
    const { overallWm: newOverallWm, overallHm: newOverallHm } = overallFrameDimsM(inches, aspect, 8);
    setScreen?.(prev => ({
      ...(prev || {}),
      visibleWidthInches: inches,
      overallWidthCm: Math.round(newOverallWm * 100),
      overallHeightCm: Math.round(newOverallHm * 100),
    }));
  };

  const onAspectChange = (e) => {
    const value = e?.target?.value || "16:9";
    const { overallWm: newOverallWm, overallHm: newOverallHm } = overallFrameDimsM(visibleWidthInches, value, 8);
    setScreen?.(prev => ({
      ...(prev || {}),
      aspectRatio: value,
      overallWidthCm: Math.round(newOverallWm * 100),
      overallHeightCm: Math.round(newOverallHm * 100),
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Label className="text-xs text-[#3E4349]">Viewing Width (inches)</Label>
          <Select value={String(visibleWidthInches)} onValueChange={onSizeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select size…" />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map(sz => (
                <SelectItem key={sz} value={String(sz)}>{sz}"</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-36">
          <Label className="text-xs text-[#3E4349]">Aspect</Label>
          <Input value={aspect} onChange={onAspectChange} placeholder="16:9" />
        </div>
      </div>

      <div className="text-xs text-[#3E4349] space-y-1">
        <div>
          <span className="font-medium text-[#1B1A1A]">Viewing size:</span>{' '}
          {viewWm.toFixed(2)}m × {viewHm.toFixed(2)}m
        </div>
        <div>
          <span className="font-medium text-[#1B1A1A]">Approx. overall:</span>{' '}
          {overallWm.toFixed(2)}m × {overallHm.toFixed(2)}m
        </div>
      </div>

      {heightWarnings.length > 0 && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 space-y-1">
          {heightWarnings.map((warn, i) => <div key={i}>{warn}</div>)}
        </div>
      )}
    </div>
  );
}
