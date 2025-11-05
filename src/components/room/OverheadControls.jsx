import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, Info, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function OverheadControls({
    overheadOffsetM,
    setOverheadOffsetM,
    rowTarget,
    setRowTarget,
    compliance,
    isTwoOverheads,
    onOptimise,
    rp22Assessment
}) {
    const sliderValue = Array.isArray(overheadOffsetM)
      ? overheadOffsetM
      : [Number(overheadOffsetM) || 0];
      
    const offsetDisplay = (sliderValue[0] || 0).toFixed(2);
    const offsetLabel = isTwoOverheads ? 'Fore/Aft Offset' : 'Mirrored Fore/Aft Offset';
    const offsetDescription = isTwoOverheads
        ? 'Moves TML/TMR speakers relative to the MLP.'
        : 'Moves TF speakers forward and TR speakers back symmetrically.';

    return (
        <div className="mt-4 p-4 bg-[#F8F8F7] rounded-lg border border-[#DCDBD6]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                {/* Row Target Selector */}
                <div className="space-y-2">
                    <Label className="font-medium text-[#3E4349]">Optimisation Target</Label>
                    <Select value={rowTarget} onValueChange={setRowTarget}>
                        <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Select target row(s)" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                            <SelectItem value="front">Front Row</SelectItem>
                            <SelectItem value="back">Back Row</SelectItem>
                            <SelectItem value="both">Front & Back Rows</SelectItem>
                            <SelectItem value="all">All Rows</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-[#625143]">Select which seating row(s) to optimize for.</p>
                </div>

                {/* Manual Offset Slider */}
                <div className="space-y-2">
                     <Label className="font-medium text-[#3E4349]">
                        {offsetLabel}: <span className="font-mono text-[#1B1A1A]">{offsetDisplay}m</span>
                     </Label>
                    <Slider
                      value={sliderValue}
                      onValueChange={(vals) => setOverheadOffsetM(vals)}
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      className="[&>span:first-child]:h-full [&>span:first-child]:bg-[#C1B6AD]"
                    />
                    <p className="text-xs text-[#625143]">{offsetDescription}</p>
                </div>

                {/* Compliance & Reset */}
                <div className="flex flex-col items-center justify-center gap-3">
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                 <Button variant="outline" size="sm" onClick={onOptimise} className="w-full">
                                    <RefreshCcw className="w-4 h-4 mr-2"/>
                                    Return to Optimiser
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Reset to the best calculated positions for the current layout.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {compliance && (
                        <Badge className={`${compliance.color === 'green' ? 'bg-green-100 text-green-800' : compliance.color === 'amber' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'} border-transparent`}>
                            {compliance.text} (E:{compliance.elev}°, A:{compliance.az}°)
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
}