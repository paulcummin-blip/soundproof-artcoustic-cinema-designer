import React from "react";
import { RP22_PARAMS } from "./parameters";
import { Info, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { computeScreenMetrics } from "@/components/utils/screenMetrics";

function levelFor(value, t) {
  if (value == null || !t) return 0;

  if (t.direction === '=') {
    if (String(value).toLowerCase() === String(t.L4).toLowerCase()) return 4;
    if (String(value).toLowerCase() === String(t.L3).toLowerCase()) return 3;
    if (String(value).toLowerCase() === String(t.L2).toLowerCase()) return 2;
    if (String(value).toLowerCase() === String(t.L1).toLowerCase()) return 1;
    return 0;
  }
  
  const dir = t.direction;
  const pass = (lvlKey) => {
      const target = t[lvlKey];
      if (target === null) return false;
      return dir === ">=" || dir === ">" ? value >= target : value <= target;
  }
  if (pass("L4")) return 4;
  if (pass("L3")) return 3;
  if (pass("L2")) return 2;
  if (pass("L1")) return 1;
  return 0;
}

const levelClass = {
  0: "bg-[#4A230F]/10 text-[#4A230F] border-[#4A230F]/20", // Fail - Brand Red
  1: "bg-[#4A230F]/10 text-[#4A230F] border-[#4A230F]/20", // Level 1 - Brand Red
  2: "bg-[#C1B6AD]/30 text-[#625143] border-[#C1B6AD]/40", // Level 2 - Amber/Sand
  3: "bg-[#3E4349]/10 text-[#3E4349] border-[#3E4349]/20", // Level 3 - Deep Blue/Grey
  4: "bg-[#213428]/10 text-[#213428] border-[#213428]/20", // Level 4 - Brand Green
};

const levelText = { 0: "Fail", 1: "L1", 2: "L2", 3: "L3", 4: "L4" };

export default function Rp22ReferencePanel({ analysisResult, screen }) {
  const metrics = React.useMemo(() => {
    if (!screen) return { distance57: 0, viewWm: 0 };
    return computeScreenMetrics(screen.visibleWidthInches, screen.aspectRatio);
  }, [screen]);

  return (
    <aside className="sticky top-16 h-[calc(100vh-4rem)] overflow-auto pr-3 font-body">
      <h2 className="px-1 pb-2 text-sm font-semibold tracking-wide text-[#213428] font-header">RP22 Reference</h2>

      {/* RP23 helper */}
      <Card className="mb-3 border-[#DCDBD6] bg-white">
        <CardHeader className="py-3">
          <div className="text-sm font-medium text-[#1B1A1A] font-header flex items-center gap-2">
             <Monitor className="w-4 h-4 text-[#625143]" />
             RP23 Screen Size Guide
          </div>
          <div className="text-xs text-[#625143]">
            {screen?.visibleWidthInches || "N/A"}" {screen?.aspectRatio || "N/A"} — targeting 57.5° FOV
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-[#3E4349]">Recommended distance</span>
            <span className="font-mono text-[#1B1A1A]">{metrics.distance57.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#3E4349]">Screen width</span>
            <span className="font-mono text-[#1B1A1A]">{metrics.viewWm.toFixed(2)} m</span>
          </div>
        </CardContent>
      </Card>
      
      {/* RP22 Parameters List */}
      <div className="space-y-3">
        {RP22_PARAMS.map((param) => {
          const value = param.valueFromAnalysis?.(analysisResult) ?? null;
          const level = levelFor(value, param.thresholds);
          
          return (
            <Card key={param.id} className="border-[#DCDBD6] bg-white hover:shadow-sm transition-shadow">
              <CardHeader className="py-3">
                <div className="text-sm font-medium text-[#1B1A1A] font-header">{param.title}</div>
                <p className="text-xs text-[#625143] leading-tight mt-1">{param.short}</p>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-[#625143]">Achieved</span>
                    <span className="font-mono text-[#3E4349]">
                      {value === null ? "n/a" : `${typeof value === 'number' ? value.toFixed(1) : value}${param.unit && !['Yes/No', 'speakers', '°'].includes(param.unit) ? param.unit : ''}${param.unit === '°' ? '°' : ''}`}
                    </span>
                  </div>
                  <Badge variant="outline" className={`border ${levelClass[level]}`}>
                    {levelText[level]}
                  </Badge>
                </div>
                
                {param.thresholds && (
                  <div className="mt-2 pt-2 border-t border-[#F8F8F7]">
                    <div className="grid grid-cols-4 gap-x-2 text-center text-[10px]">
                      {['L4', 'L3', 'L2', 'L1'].map(lvlKey => {
                        const targetValue = param.thresholds[lvlKey];
                        const isYesNo = param.thresholds.direction === '=';
                        return (
                          <div key={lvlKey}>
                            <div className="font-semibold text-[#3E4349]">{lvlKey}</div>
                            <div className="text-[#625143] font-mono">
                              {targetValue !== null ? 
                                (isYesNo ? targetValue : `${param.thresholds.direction} ${targetValue}`)
                                : '–'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </aside>
  );
}