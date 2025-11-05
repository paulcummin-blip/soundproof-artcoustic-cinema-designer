import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function FrontWideHUD({ zones, enabled, onToggle }) {
  const toCm = (m) => {
    if (typeof m !== 'number' || !Number.isFinite(m)) return '—';
    return Math.round(m * 100);
  };

  const formatSide = (side) => {
    if (!side || side.status !== 'ok') return '—';
    const { yMin, yMax, medianY } = side;
    return `${toCm(yMin)}–${toCm(yMax)} (${toCm(medianY)})`;
  };

  const statusText = !enabled ? 'off' : 
    zones?.status === 'no-mlp' ? 'no-mlp' :
    zones?.status === 'no-sides' ? 'no-sides' :
    zones?.status === 'ok' ? 'ok' : 
    zones?.status || '—';

  return (
    <div className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 text-xs font-mono">
      <div className="flex items-center gap-2 mb-1">
        <Label htmlFor="fw-hud-toggle" className="text-gray-700 font-semibold">FW:</Label>
        <Switch
          id="fw-hud-toggle"
          checked={enabled}
          onCheckedChange={onToggle}
          className="scale-75"
        />
        <span className={`${enabled && zones?.status === 'ok' ? 'text-green-600' : 'text-gray-500'}`}>
          {statusText}
        </span>
      </div>
      {enabled && zones?.status === 'ok' && (
        <div className="text-gray-600 space-y-0.5">
          <div>L {formatSide(zones.left)}</div>
          <div>R {formatSide(zones.right)}</div>
        </div>
      )}
    </div>
  );
}