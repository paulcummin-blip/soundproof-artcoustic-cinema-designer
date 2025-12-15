import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { getSpeakerModelMeta, normaliseModelKey } from '@/components/models/speakers/registry';

export default function SpeakerPositionsReadout({ 
  placedSpeakers = [], 
  roomWidth, 
  roomLength,
  screenFrontPlaneM = null 
}) {
  const [origin, setOrigin] = React.useState('front-left'); // 'front-left' | 'screen-plane'
  
  const modelLabel = (model) => {
    if (!model) return '(none)';
    const key = normaliseModelKey ? normaliseModelKey(model) : model;
    const meta = getSpeakerModelMeta ? getSpeakerModelMeta(key) : null;

    // Prefer a clean display name from meta if present
    const name =
      meta?.displayName ||
      meta?.name ||
      meta?.title ||
      null;

    // Final fallback: turn "evolve-2-1_s" -> "Evolve 2-1"
    if (!name) {
      return String(model)
        .replace(/[_-]s$/i, '')          // strip trailing "_s" or "-s"
        .replace(/[_-]/g, ' ')           // underscores/hyphens -> spaces
        .replace(/\b(\w)/g, (m) => m.toUpperCase()); // title case
    }

    return name;
  };
  
  const rows = useMemo(() => {
    if (!placedSpeakers || !Array.isArray(placedSpeakers)) return [];
    
    const W = Number(roomWidth) || 0;
    const L = Number(roomLength) || 0;
    
    return placedSpeakers
      .filter(spk => {
        const x = spk?.position?.x;
        const y = spk?.position?.y;
        return Number.isFinite(x) && Number.isFinite(y);
      })
      .map(spk => {
        const x = Number(spk.position.x);
        const y = Number(spk.position.y);
        const z = Number.isFinite(spk.position.z) ? Number(spk.position.z) : null;
        
        // Compute Y reference based on origin mode
        let yFromRef, yFromOpp;
        if (origin === 'screen-plane' && Number.isFinite(screenFrontPlaneM)) {
          // Y from screen plane
          yFromRef = y - screenFrontPlaneM;
          yFromOpp = L - y;
        } else {
          // Y from front wall (default)
          yFromRef = y;
          yFromOpp = L - y;
        }
        
        return {
          role: String(spk.role || '?'),
          model: modelLabel(spk.model),
          xFromLeft: x,
          yFromRef,
          z,
          xFromRight: W - x,
          yFromOpp,
        };
      })
      .sort((a, b) => {
        // Sort by role alphabetically
        return a.role.localeCompare(b.role);
      });
  }, [placedSpeakers, roomWidth, roomLength, origin, screenFrontPlaneM]);
  
  const fmt = (val) => {
    if (!Number.isFinite(val)) return '—';
    return val.toFixed(3);
  };
  
  const copyTable = () => {
    if (rows.length === 0) return;
    
    const yRefLabel = origin === 'screen-plane' ? 'Y from screen' : 'Y from front';
    const yOppLabel = origin === 'screen-plane' ? 'Y from rear' : 'Y from rear';
    
    const header = `Role\tModel\tX from left (m)\t${yRefLabel} (m)\tZ (m)\tX from right (m)\t${yOppLabel} (m)`;
    const lines = rows.map(r => 
      `${r.role}\t${r.model}\t${fmt(r.xFromLeft)}\t${fmt(r.yFromRef)}\t${fmt(r.z)}\t${fmt(r.xFromRight)}\t${fmt(r.yFromOpp)}`
    );
    
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };
  
  const copyCSV = () => {
    if (rows.length === 0) return;
    
    const yRefLabel = origin === 'screen-plane' ? 'Y from screen (m)' : 'Y from front (m)';
    const yOppLabel = origin === 'screen-plane' ? 'Y from rear (m)' : 'Y from rear (m)';
    
    const header = `Role,Model,X from left (m),${yRefLabel},Z (m),X from right (m),${yOppLabel}`;
    const lines = rows.map(r => 
      `${r.role},${r.model},${fmt(r.xFromLeft)},${fmt(r.yFromRef)},${fmt(r.z)},${fmt(r.xFromRight)},${fmt(r.yFromOpp)}`
    );
    
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };
  
  if (rows.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">
        No speakers placed yet.
      </div>
    );
  }
  
  const showScreenPlaneOption = Number.isFinite(screenFrontPlaneM);
  const yRefLabel = origin === 'screen-plane' ? 'Y from screen' : 'Y from front';
  const yOppLabel = 'Y from rear';
  
  return (
    <div className="px-4 py-3 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-700">Speaker Positions (Installer)</div>
        <div className="flex items-center gap-2">
          {showScreenPlaneOption && (
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-300 rounded"
            >
              <option value="front-left">Front-Left</option>
              <option value="screen-plane">Screen Plane</option>
            </select>
          )}
          <Button size="sm" variant="outline" onClick={copyTable} className="h-7 px-2 text-xs">
            <Copy className="w-3 h-3 mr-1" />
            Copy Table
          </Button>
          <Button size="sm" variant="outline" onClick={copyCSV} className="h-7 px-2 text-xs">
            <Copy className="w-3 h-3 mr-1" />
            Copy CSV
          </Button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-1 pr-2 font-medium text-gray-600">Role</th>
              <th className="py-1 pr-2 font-medium text-gray-600">Model</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">X from left</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">{yRefLabel}</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Z</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">X from right</th>
              <th className="py-1 font-medium text-gray-600 text-right">{yOppLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1 pr-2 text-gray-700">{r.role}</td>
                <td className="py-1 pr-2 text-gray-600 truncate max-w-[100px]" title={r.model}>
                  {r.model}
                </td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{fmt(r.xFromLeft)}</td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{fmt(r.yFromRef)}</td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{fmt(r.z)}</td>
                <td className="py-1 pr-2 text-right text-gray-600 font-mono">{fmt(r.xFromRight)}</td>
                <td className="py-1 text-right text-gray-600 font-mono">{fmt(r.yFromOpp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        All distances in metres (±1mm). Screen plane reference available when floating screen is configured.
      </div>
    </div>
  );
}