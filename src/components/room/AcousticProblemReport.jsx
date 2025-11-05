import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";

export default function AcousticProblemReport({ modes, seatResponses, seatingPositions }) {
  if (!modes || !seatResponses || seatResponses.length === 0) {
    return null;
  }

  const calculateProblemScore = (mode) => {
    let totalScore = 0;
    let affectedSeats = [];

    const modeTypeWeight = mode.type === 'axial' ? 0.60 : mode.type === 'tangential' ? 0.25 : 0.15;
    
    seatResponses.forEach((seat, index) => {
      const responseAtFreq = seat.response.find(r => r.frequency >= mode.frequency);
      if (!responseAtFreq) return;

      const nullDepth = responseAtFreq.spl; // SPL is already normalized to median 0
      let nullWeight = 0;
      if (nullDepth < -10) nullWeight = 0.70;
      else if (nullDepth < -6) nullWeight = 0.25;
      else if (nullDepth < -3) nullWeight = 0.05;

      if (nullWeight > 0) {
        // Assuming the first seat is the MLP
        const isMLP = index === 0;
        const seatingWeight = isMLP ? 0.6 : 0.4;
        
        const problemScore = modeTypeWeight * nullWeight * seatingWeight;
        totalScore += problemScore;
        affectedSeats.push({ name: seat.name, depth: nullDepth.toFixed(1) });
      }
    });

    if (totalScore > 0) {
      return { ...mode, score: totalScore, affectedSeats };
    }
    return null;
  };

  const problems = modes
    .map(calculateProblemScore)
    .filter(p => p !== null)
    .sort((a, b) => b.score - a.score);

  const getSeverityIcon = (score) => {
    if (score > 0.2) return <AlertTriangle className="w-4 h-4 text-red-400" />;
    if (score > 0.1) return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    return <Info className="w-4 h-4 text-sky-400" />;
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          Acoustic Problem Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        {problems.length === 0 ? (
          <div className="text-center py-4 text-green-400 flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" />
            No significant modal nulls detected at seating positions.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {problems.slice(0, 10).map((p, index) => (
              <div key={index} className="p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(p.score)}
                    <div>
                      <p className="font-bold text-white">{p.frequency} Hz ({p.type})</p>
                      <p className="text-xs text-zinc-400">Problem Score: <span className="font-semibold">{p.score.toFixed(2)}</span></p>
                    </div>
                  </div>
                   <Badge variant="destructive">Top Problem #{index + 1}</Badge>
                </div>
                <div className="mt-2 pl-7">
                  <p className="text-sm text-zinc-300">Seats Affected:</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                  {p.affectedSeats.map(seat => (
                     <Badge key={seat.name} variant="secondary">
                       {seat.name}: <span className="font-bold ml-1">{seat.depth} dB</span>
                     </Badge>
                  ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}