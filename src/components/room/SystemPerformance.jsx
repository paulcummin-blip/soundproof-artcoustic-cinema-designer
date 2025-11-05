import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RP22_CALIBRATION_HEADROOM_DB } from "@/components/constants/calibration";
import { applyCalibrationHeadroom } from "@/components/utils/splUtils";
import { roleSplData } from '@/components/speakers/RoleSplCompact';
import { getSpeakerModelMeta } from '@/components/models/speakers';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';

const toneMapping = {
  green: {
    icon: CheckCircle,
    className: "text-green-700 bg-green-50 border-green-200"
  },
  amber: {
    icon: AlertTriangle,
    className: "text-amber-700 bg-amber-50 border-amber-200"
  },
  red: {
    icon: XCircle,
    className: "text-red-700 bg-red-50 border-red-200"
  },
  default: {
    icon: CheckCircle,
    className: "text-gray-700 bg-gray-50 border-gray-200"
  }
};

const CompactSplDisplay = ({ role, spl, target, peak, tone }) => {
  if (spl == null) return null;

  const toneInfo = toneMapping[tone] || toneMapping.default;
  const Icon = toneInfo.icon;
  const displayedSpl = applyCalibrationHeadroom(spl);
  const displayedPeak = applyCalibrationHeadroom(peak);

  return (
    <div className={`p-2 border rounded-md ${toneInfo.className} flex items-start gap-2`}>
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-grow">
        <div className="font-bold text-sm">{role}</div>
        <div className="text-lg font-mono">
          {displayedSpl.toFixed(1)} dB
          <span className="text-xs font-sans"> (Peak: {displayedPeak.toFixed(1)} dB)</span>
        </div>
        <div className="text-xs opacity-80">Target: {target} dB</div>
      </div>
    </div>
  );
};


export function SystemPerformance({ placedSpeakers, appState }) {
  if (!appState) return null;

  const { targetSPL, ampPower, distanceToMLP, dolbyLayout, speakerSelections } = appState;
  
  const splData = roleSplData({
    placedSpeakers,
    speakerSelections,
    getSpeakerModel: getSpeakerModelMeta,
    ampPower,
    distanceToMLP,
    targetSPL,
    dolbyLayout,
  });

  return (
    <Panel title="System Performance at MLP">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {splData.map(({ role, spl, peak, target, tone }) => (
          <CompactSplDisplay
            key={role}
            role={role}
            spl={spl}
            peak={peak}
            target={target}
            tone={tone}
          />
        ))}
      </div>
       <div className="text-xs text-gray-500 mt-3">
        * All SPL values include −{RP22_CALIBRATION_HEADROOM_DB} dB post-calibration headroom (RP22). Continuous & Peak shown.
      </div>
    </Panel>
  );
}