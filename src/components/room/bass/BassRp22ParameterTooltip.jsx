import React from "react";
import { rp22ByNumber } from "@/components/data/rp22Parameters";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PARAMETER_NUMBERS = Object.freeze({ p14: 14, p18: 18, p19: 19, p20: 20 });

export default function BassRp22ParameterTooltip({ parameterKey, children }) {
  const definition = rp22ByNumber[PARAMETER_NUMBERS[parameterKey]];
  if (!definition) return children;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[320px] rounded-lg border-2 border-[#E6E4DD] bg-white p-3 text-[11px] leading-[1.5] text-[#1B1A1A] shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        >
          <div className="mb-2 text-xs font-semibold">{definition.name}</div>
          <div>{definition.description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}