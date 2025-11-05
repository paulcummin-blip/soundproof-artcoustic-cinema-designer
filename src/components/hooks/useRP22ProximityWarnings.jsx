// hooks/useRP22ProximityWarnings.js
import { useEffect } from 'react';
import { checkRP22ProximityWarnings } from '../utils/rp22ProximityChecker';

export function useRP22ProximityWarnings({
  room,
  speakers,
  proximityWarningsEnabled = true,
  onSpeakerStyleChange,
  onTooltipChange,
  onReportItemAdd,
  onClearCategory
}) {
  useEffect(() => {
    if (!room || !speakers) return;

    const ui = {
      setSpeakerStyle: onSpeakerStyleChange,
      setTooltip: onTooltipChange,
      addReportItem: onReportItemAdd,
      clearCategory: onClearCategory
    };

    checkRP22ProximityWarnings({
      room,
      speakers,
      ui,
      proximityWarningsEnabled
    });
  }, [room, speakers, proximityWarningsEnabled, onSpeakerStyleChange, onTooltipChange, onReportItemAdd, onClearCategory]);
}