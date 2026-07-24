import React from "react";
import { rp22ByNumber } from "@/components/data/rp22Parameters";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PARAMETER_NUMBERS = Object.freeze({ p14: 14, p18: 18, p19: 19, p20: 20 });
const BASS_TOOLTIP_TEXT = Object.freeze({
  p19: "Maximum deviation of the post-EQ Reference Seat Position bass response from the RP22 target curve.",
  p20: "Maximum deviation of any listening seat from the measured Reference Seat Position bass response.",
});

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
          <div className="mb-2 text-xs font-semibold">{parameterKey.toUpperCase()}</div>
          <div>{BASS_TOOLTIP_TEXT[parameterKey] || definition.description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}