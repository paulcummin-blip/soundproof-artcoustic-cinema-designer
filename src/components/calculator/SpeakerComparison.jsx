
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitCompare, Volume2, Zap, Activity, DollarSign } from "lucide-react";

export default function SpeakerComparison({ primarySpeaker, comparisonSpeaker, distance, amplifierPower }) {
  const calculateSPL = (sensitivity, power, distance) => {
    const numSensitivity = parseFloat(sensitivity);
    const numPower = parseFloat(power);
    const numDistance = parseFloat(distance);
    if (!numSensitivity || !numPower || !numDistance) return 0;
    // SPL = Sensitivity + 10 * log10(Power) - 20 * log10(Distance)
    return numSensitivity + 10 * Math.log10(numPower) - 20 * Math.log10(numDistance);
  };

  const primarySPL = primarySpeaker ? calculateSPL(primarySpeaker.sensitivity, amplifierPower, distance) : 0;
  const comparisonSPL = comparisonSpeaker?.sensitivity ? calculateSPL(comparisonSpeaker.sensitivity, amplifierPower, distance) : 0;
  
  const hasComparisonData = comparisonSpeaker && comparisonSpeaker.brand && comparisonSpeaker.model && comparisonSpeaker.sensitivity && comparisonSpeaker.max_power;

  // Determine winner based on SPL
  const primaryIsWinner = primarySPL > comparisonSPL;
  const comparisonIsWinner = comparisonSPL > primarySPL;

  // Check for Artcoustic speakers to control watermark and badges
  const isPrimaryArtcoustic = primarySpeaker?.is_artcoustic;
  const isComparisonArtcoustic = comparisonSpeaker?.is_artcoustic;
  const showArtcousticWatermark = (primarySpeaker && isPrimaryArtcoustic) || (hasComparisonData && isComparisonArtcoustic);

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 relative overflow-hidden">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <GitCompare className="w-5 h-5" />
          Speaker Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        {primarySpeaker && hasComparisonData ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-4 bg-zinc-800/50 rounded-lg border-2 transition-colors ${
                primaryIsWinner ? 'border-green-500/60' : comparisonIsWinner ? 'border-red-500/60' : 'border-transparent'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-white">{primarySpeaker.brand}</span>
                  {isPrimaryArtcoustic && (
                    <Badge className="bg-blue-500/20 text-blue-300 text-xs">Artcoustic</Badge>
                  )}
                </div>
                <p className="text-sm text-zinc-300 mb-3">{primarySpeaker.model}</p>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Sensitivity:</span>
                    <span className="text-white">{primarySpeaker.sensitivity} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Max Power:</span>
                    <span className="text-white">{primarySpeaker.max_power}W</span>
                  </div>
                   <div className="flex justify-between">
                    <span className="text-zinc-400">Price:</span>
                    <span className="text-white">
                      {primarySpeaker.price ? `£${primarySpeaker.price.toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Current SPL:</span>
                    <span className={`font-bold ${primaryIsWinner ? 'text-green-400' : 'text-white'}`}>
                      {primarySPL.toFixed(1)} dB
                    </span>
                  </div>
                </div>
              </div>

              <div className={`p-4 bg-zinc-800/50 rounded-lg border-2 transition-colors ${
                comparisonIsWinner ? 'border-green-500/60' : primaryIsWinner ? 'border-red-500/60' : 'border-transparent'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-4 h-4 text-purple-400" />
                  <span className="font-medium text-white">{comparisonSpeaker.brand}</span>
                  {isComparisonArtcoustic && (
                    <Badge className="bg-blue-500/20 text-blue-300 text-xs">Artcoustic</Badge>
                  )}
                </div>
                <p className="text-sm text-zinc-300 mb-3">{comparisonSpeaker.model}</p>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Sensitivity:</span>
                    <span className="text-white">{comparisonSpeaker.sensitivity} dB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Max Power:</span>
                    <span className="text-white">{comparisonSpeaker.max_power}W</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Price:</span>
                     <span className="text-white">
                      {comparisonSpeaker.price ? `£${parseFloat(comparisonSpeaker.price).toLocaleString()}` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Current SPL:</span>
                    <span className={`font-bold ${comparisonIsWinner ? 'text-green-400' : 'text-white'}`}>
                      {comparisonSPL.toFixed(1)} dB
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-r from-zinc-800/30 to-zinc-800/50 rounded-lg border border-zinc-700">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-yellow-400" />
                <span className="font-medium text-white">Performance Analysis</span>
              </div>
              
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-zinc-400 mb-1">SPL Difference</p>
                  <p className={`font-bold text-xl ${Math.abs(primarySPL - comparisonSPL) <= 2 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {(primarySPL - comparisonSPL).toFixed(1)} dB
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-500 text-center mt-3">
                Note: 6dB is equivalent to double the volume.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <GitCompare className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">Select a primary speaker and enter comparison speaker details</p>
          </div>
        )}
      </CardContent>
      {showArtcousticWatermark && (
        <div 
          className="absolute bottom-3 right-3 w-16 h-16 opacity-[0.12] pointer-events-none z-0"
          style={{
            backgroundImage: `url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c0d2feeed_Artcoustic-logo_dark-grey-icon_TRANSPARENT_BACKGROUND.png')`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'contain',
            backgroundPosition: 'center'
          }}
        />
      )}
    </Card>
  );
}
