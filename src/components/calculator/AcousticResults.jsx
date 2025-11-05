
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

export default function AcousticResults({ currentSPL, requiredPower, targetSPL, selectedSpeaker }) {
  const getSPLStatus = (current, target) => {
    const diff = Math.abs(current - target);
    if (diff <= 2) return { status: "optimal", color: "text-green-600", icon: CheckCircle };
    if (diff <= 5) return { status: "acceptable", color: "text-yellow-600", icon: AlertTriangle };
    return { status: "poor", color: "text-red-600", icon: AlertTriangle };
  };

  const spl_status = getSPLStatus(currentSPL, targetSPL);
  const headroom = selectedSpeaker ? selectedSpeaker.max_power - requiredPower : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#DCDBD6] p-6 relative overflow-hidden">
      <h3 className="text-xl uppercase tracking-wider font-header mb-6 text-[#1B1A1A]">
        Acoustic Results
      </h3>
      {selectedSpeaker ? (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#3E4349] font-body">Current SPL</span>
              <div className="flex items-center gap-2">
                <spl_status.icon className={`w-4 h-4 ${spl_status.color}`} />
                <span className="text-[#1B1A1A] font-bold font-body">{currentSPL.toFixed(1)} dB</span>
              </div>
            </div>
            <Progress
              value={Math.min((currentSPL / 120) * 100, 100)}
              className="h-2 bg-[#F8F8F7]"
            />
            <div className="flex justify-between text-xs text-[#3E4349] font-body mt-1">
              <span>0 dB</span>
              <span className="text-red-600">120 dB (max)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#3E4349] font-body">Required Power</span>
              <span className="text-[#1B1A1A] font-bold font-body">{requiredPower.toFixed(0)}W</span>
            </div>
            <Progress
              value={selectedSpeaker.max_power ? (requiredPower / selectedSpeaker.max_power) * 100 : 0}
              className="h-2 bg-[#F8F8F7]"
            />
            <div className="flex justify-between text-xs text-[#3E4349] font-body mt-1">
              <span>0W</span>
              <span>{selectedSpeaker.max_power}W (max)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-[#F8F8F7] rounded-lg border border-[#DCDBD6]">
              <p className="text-xs text-[#3E4349] font-body">Headroom</p>
              <p className={`font-bold font-body ${headroom > 20 ? 'text-green-600' : headroom > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                {headroom.toFixed(0)}W
              </p>
            </div>
            <div className="p-3 bg-[#F8F8F7] rounded-lg border border-[#DCDBD6]">
              <p className="text-xs text-[#3E4349] font-body">SPL Difference</p>
              <p className={`font-bold font-body ${spl_status.color}`}>
                {(currentSPL - targetSPL).toFixed(1)} dB
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#C1B6AD]">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-blue-100 text-blue-800 font-body">CEDIA RP22</Badge>
            </div>
            <div className="text-sm text-[#3E4349] font-body space-y-1">
              <p>• Reference: 85 dB SPL</p>
              <p>• Peaks: 105 dB SPL (20 dB headroom)</p>
              <p>• Distance: {selectedSpeaker ? 'Measured at listening position' : 'N/A'}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <TrendingUp className="w-12 h-12 text-[#DCDBD6] mx-auto mb-4" />
          <p className="text-[#3E4349] font-body">Select a speaker to see acoustic calculations</p>
        </div>
      )}
    </div>
  );
}
