
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertCircle, CheckCircle, Info } from "lucide-react";

export default function PowerRecommendations({ speaker, targetSPL, distance }) {
  if (!speaker) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800 relative overflow-hidden">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Power Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Zap className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400">Select a speaker to see power recommendations</p>
        </CardContent>
      </Card>
    );
  }

  const calculateRequiredPower = (sensitivity, targetSPL, distance) => {
    return Math.pow(10, (targetSPL - sensitivity + 20 * Math.log10(distance)) / 10);
  };

  const referencePower = calculateRequiredPower(speaker.sensitivity, 85, distance);
  const peakPower = calculateRequiredPower(speaker.sensitivity, 105, distance);
  const customPower = calculateRequiredPower(speaker.sensitivity, targetSPL, distance);

  const recommendations = [
    {
      name: "Reference Level",
      power: referencePower,
      spl: 85,
      description: "CEDIA RP22 reference listening level",
      status: referencePower <= speaker.max_power ? "optimal" : "warning"
    },
    {
      name: "Peak Level",
      power: peakPower,
      spl: 105,
      description: "CEDIA RP22 peak transients (+20dB)",
      status: peakPower <= speaker.max_power ? "optimal" : "critical"
    },
    {
      name: "Custom Target",
      power: customPower,
      spl: targetSPL,
      description: "Your specified target level",
      status: customPower <= speaker.max_power ? "optimal" : "critical"
    }
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case "optimal": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "warning": return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case "critical": return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "optimal": return "text-green-400";
      case "warning": return "text-yellow-400";
      case "critical": return "text-red-400";
      default: return "text-blue-400";
    }
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 relative overflow-hidden">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Power Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-zinc-800/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-400">Speaker Maximum Power</span>
            <Badge className="bg-blue-500/20 text-blue-300">
              {speaker.max_power}W
            </Badge>
          </div>
          <p className="text-xs text-zinc-500">
            {speaker.brand} {speaker.model} power handling limit
          </p>
        </div>

        {recommendations.map((rec, index) => (
          <div key={index} className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getStatusIcon(rec.status)}
                <span className="font-medium text-white">{rec.name}</span>
              </div>
              <div className="text-right">
                <p className={`font-bold ${getStatusColor(rec.status)}`}>
                  {rec.power.toFixed(0)}W
                </p>
                <p className="text-xs text-zinc-400">{rec.spl} dB SPL</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400">{rec.description}</p>
            
            {rec.power > speaker.max_power && (
              <div className="mt-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                <p className="text-xs text-red-400">
                  ⚠️ Exceeds speaker power handling by {(rec.power - speaker.max_power).toFixed(0)}W
                </p>
              </div>
            )}
          </div>
        ))}

        <div className="mt-6 p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-lg border border-indigo-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-indigo-400" />
            <span className="font-medium text-white">Amplifier Sizing Guide</span>
          </div>
          <div className="text-sm text-zinc-300 space-y-1">
            <p>• Minimum: {Math.ceil(peakPower / 10) * 10}W (for peak transients)</p>
            <p>• Recommended: {Math.ceil(peakPower * 2 / 10) * 10}W (+3dB headroom)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
