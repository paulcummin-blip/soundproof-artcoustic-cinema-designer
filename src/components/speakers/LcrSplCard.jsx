import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getSeatSplMetrics, getMlpSeat } from '@/components/utils/spl/centralSplEngine';

export default function LcrSplCard({ role, label, allSeatSplMetrics }) {
  const appState = useAppState();
  
  // Get MLP seat and its SPL data
  const mlpSeat = useMemo(() => {
    return getMlpSeat(appState?.seatingPositions || []);
  }, [appState?.seatingPositions]);

  const mlpSplData = useMemo(() => {
    if (!mlpSeat || !allSeatSplMetrics) return null;
    return getSeatSplMetrics(allSeatSplMetrics, mlpSeat.id);
  }, [mlpSeat, allSeatSplMetrics]);

  // Find the placed speaker for this role
  const placedSpeakers = appState?.speakerSystem?.placedSpeakers || [];
  const speaker = useMemo(() => {
    const canonical = { 'L': 'FL', 'C': 'FC', 'R': 'FR' }[role] || role;
    return placedSpeakers.find(s => {
      const sRole = String(s?.role || '').toUpperCase();
      return sRole === canonical || sRole === role;
    });
  }, [placedSpeakers, role]);

  // Get SPL value from centralized data
  const canonicalRole = { 'L': 'FL', 'C': 'FC', 'R': 'FR' }[role] || role;
  const splValue = mlpSplData?.screen?.[canonicalRole]?.value;
  const finalSplDb = Number.isFinite(splValue) ? splValue : null;

  // Get speaker metadata for display
  const { distanceM, sensitivity, modelLabel } = useMemo(() => {
    if (!speaker?.position || !Number.isFinite(speaker.position.x) || !Number.isFinite(speaker.position.y)) {
      return { distanceM: null, sensitivity: null, modelLabel: null };
    }

    if (!mlpSeat) {
      return { distanceM: null, sensitivity: null, modelLabel: null };
    }

    const modelId = speaker.model;
    if (!modelId) {
      return { distanceM: null, sensitivity: null, modelLabel: 'No model' };
    }

    const meta = getSpeakerModelMeta(modelId);
    const sensitivity = meta?.sensitivity_dB_1w1m || meta?.sensitivity_dB_2p83;

    // Calculate distance
    const dx = speaker.position.x - (mlpSeat.x || mlpSeat.position?.x || 0);
    const dy = speaker.position.y - (mlpSeat.y || mlpSeat.position?.y || 0);
    const dz = (speaker.position.z || 1.2) - (mlpSeat.z || mlpSeat.position?.z || 1.2);
    const distanceM = Math.hypot(dx, dy, dz);

    return {
      distanceM,
      sensitivity,
      modelLabel: meta?.label || modelId
    };
  }, [speaker, mlpSeat]);

  // Get power and EQ settings for display
  const effectiveSplInputs = appState?.getEffectiveSplInputs?.(canonicalRole) || {};
  const powerW = effectiveSplInputs.powerW || 100;
  const eqHeadroomDb = effectiveSplInputs.eqHeadroomDb || 0;

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="w-4 h-4" style={{ color: '#625143' }} />
          {label} SPL @ MLP
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-2xl font-bold" style={{ color: '#1B1A1A' }}>
            {Number.isFinite(finalSplDb) ? `${finalSplDb.toFixed(1)} dB` : '—'}
          </div>
          
          <div className="text-xs" style={{ color: '#625143' }}>
            {speaker?.position && Number.isFinite(speaker.position.x) ? (
              <>
                <div>Model: {modelLabel || 'Unknown'}</div>
                {Number.isFinite(sensitivity) && (
                  <div>Sensitivity: {sensitivity.toFixed(1)} dB @ 1W/1m</div>
                )}
                <div>Power: {powerW}W</div>
                {eqHeadroomDb > 0 && (
                  <div>EQ Headroom: -{eqHeadroomDb} dB</div>
                )}
                {Number.isFinite(distanceM) && (
                  <div>Distance to MLP: {distanceM.toFixed(2)}m</div>
                )}
              </>
            ) : (
              <div>Not placed</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}