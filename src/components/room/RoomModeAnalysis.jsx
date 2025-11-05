
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle, Info } from "lucide-react";

export default function RoomModeAnalysis({ dimensions, materialPreset, materialPresets }) {
  const roomModes = useMemo(() => {
    const { length, width, height } = dimensions;
    if (!length || !width || !height || !materialPresets || !materialPreset) return [];

    const modes = [];
    const speedOfSound = 343; // m/s at 20°C
    const freqLimit = 300; // Hz

    const maxN1 = Math.floor((2 * length * freqLimit) / speedOfSound);
    const maxN2 = Math.floor((2 * width * freqLimit) / speedOfSound);
    const maxN3 = Math.floor((2 * height * freqLimit) / speedOfSound);

    for (let n1 = 0; n1 <= maxN1; n1++) {
      for (let n2 = 0; n2 <= maxN2; n2++) {
        for (let n3 = 0; n3 <= maxN3; n3++) {
          if (n1 === 0 && n2 === 0 && n3 === 0) continue;

          const frequency = (speedOfSound / 2) * Math.sqrt(
            (n1 / length)**2 + (n2 / width)**2 + (n3 / height)**2
          );

          if (frequency <= freqLimit) {
            const nonZeroIndices = (n1 > 0 ? 1 : 0) + (n2 > 0 ? 1 : 0) + (n3 > 0 ? 1 : 0);
            let type = 'oblique';
            let strength = 0.25;
            if (nonZeroIndices === 1) {
              type = 'axial';
              strength = 1.0;
            } else if (nonZeroIndices === 2) {
              type = 'tangential';
              strength = 0.5;
            }

            modes.push({
              frequency: parseFloat(frequency.toFixed(1)),
              type: type,
              strength: strength,
              mode: `${n1},${n2},${n3}`,
              q: materialPresets[materialPreset]?.qFactor || 15
            });
          }
        }
      }
    }
    
    return modes.sort((a, b) => a.frequency - b.frequency);
  }, [dimensions, materialPreset, materialPresets]);

  const getSeverityColor = (type) => {
    switch (type) {
      case 'axial': return 'text-red-400';
      case 'tangential': return 'text-yellow-400';
      default: return 'text-sky-400';
    }
  };
  
  const getSeverityIcon = (type) => {
    switch (type) {
      case 'axial': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'tangential': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default: return <Info className="w-4 h-4 text-sky-400" />;
    }
  };

  const axialModes = roomModes.filter(m => m.type === 'axial').length;
  const tangentialModes = roomModes.filter(m => m.type === 'tangential').length;
  const obliqueModes = roomModes.filter(m => m.type === 'oblique').length;

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Room Mode Calculation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-zinc-800/50 rounded-lg">
            <div className="text-zinc-400 text-sm">Axial Modes</div>
            <div className="text-white font-bold text-lg">{axialModes}</div>
          </div>
           <div className="p-3 bg-zinc-800/50 rounded-lg">
            <div className="text-zinc-400 text-sm">Tangential Modes</div>
            <div className="text-white font-bold text-lg">{tangentialModes}</div>
          </div>
           <div className="p-3 bg-zinc-800/50 rounded-lg">
            <div className="text-zinc-400 text-sm">Oblique Modes</div>
            <div className="text-white font-bold text-lg">{obliqueModes}</div>
          </div>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          <h4 className="text-white font-medium">Calculated Modes (&lt;300 Hz)</h4>
          {roomModes.slice(0, 20).map((mode, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  {getSeverityIcon(mode.type)}
                  <span className="text-white font-medium">{mode.frequency} Hz</span>
                  <Badge variant="outline" className={`text-xs border-zinc-600 ${getSeverityColor(mode.type)}`}>
                    {mode.type}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500 ml-6">Mode: {mode.mode}</div>
              </div>
              <div className={`text-sm font-medium ${getSeverityColor(mode.type)}`}>
                Strength: {mode.strength.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
