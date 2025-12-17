import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getSeatSplMetrics, getMlpSeat } from '@/components/utils/spl/centralSplEngine';
import { formatDb } from '@/components/utils/formatDb';

export default function LcrSplCard({ role, label, allSeatSplMetrics }) {
  const appState = useAppState();
  
  // Get MLP seat and its SPL data
  const mlpSeat = useMemo(() => {
    return getMlpSeat(appState?.seatingPositions || []);
  }, [appState?.seatingPositions]);

  const mlpSplData = useMemo(() => {
    if (!allSeatSplMetrics) return null;
    
    // Prefer synthetic "mlp" entry (green dot), fallback to mlpSeat
    const mlpMetrics = getSeatSplMetrics(allSeatSplMetrics, "mlp");
    if (mlpMetrics) return mlpMetrics;
    
    if (mlpSeat) {
      return getSeatSplMetrics(allSeatSplMetrics, mlpSeat.id);
    }
    
    return null;
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
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1">
          <Volume2 className="w-3 h-3" style={{ color: '#625143' }} />
          {label} SPL @ MLP
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="text-lg font-bold" style={{ color: '#1B1A1A' }}>
          {formatDb(finalSplDb)}
        </div>
        {!speaker?.position && (
          <div className="text-xs text-[#625143] mt-1">Not placed</div>
        )}
      </CardContent>
    </Card>
  );
}