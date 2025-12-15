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
  
  // Practical installer dimensions (bed speakers assumed on walls)
  // Outputs: along wall run (m), nearest-end (m), height (m)
  const installerRows = useMemo(() => {
    const W = Number(roomWidth) || 0;
    const L = Number(roomLength) || 0;

    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const out = [];

    const safeNum = (v) => typeof v === 'number' && Number.isFinite(v);

    for (const s of list) {
      const role = (s?.role || '').toString();
      const canonRole = role.toUpperCase();
      
      // Skip LFE and subs for wall-mounted installer table
      if (canonRole === 'LFE' || canonRole === 'SUB') continue;
      
      const model = s?.model || null;
      const x = s?.position?.x;
      const y = s?.position?.y;
      const z = s?.position?.z;

      if (!safeNum(x) || !safeNum(y) || !safeNum(z) || !(W > 0 && L > 0)) continue;

      // Determine nearest wall (front/back/left/right) by distance
      const dFront = y;
      const dBack  = L - y;
      const dLeft  = x;
      const dRight = W - x;

      let wall = 'front';
      let wallDist = dFront;

      if (dBack < wallDist) { wall = 'back';  wallDist = dBack; }
      if (dLeft < wallDist) { wall = 'left';  wallDist = dLeft; }
      if (dRight < wallDist){ wall = 'right'; wallDist = dRight; }

      // Along-wall coordinate + nearest-end distance
      // front/back walls: along = x, length = W
      // left/right walls: along = y, length = L
      const along = (wall === 'front' || wall === 'back') ? x : y;
      const runLen = (wall === 'front' || wall === 'back') ? W : L;

      const fromEndA = along;          // from left (or front) end of that wall
      const fromEndB = runLen - along; // from right (or back) end of that wall
      const nearestEnd = Math.min(fromEndA, fromEndB);

      out.push({
        role,
        model,
        wall,
        along,
        nearestEnd,
        height: z,
      });
    }

    return out;
  }, [placedSpeakers, roomWidth, roomLength]);
  
  const fmt = (val) => {
    if (!Number.isFinite(val)) return '—';
    return val.toFixed(3);
  };
  
  const copyTable = () => {
    if (installerRows.length === 0) return;
    
    const header = `Role\tModel\tWall\tAlong wall (m)\tNearest end (m)\tHeight (m)`;
    const lines = installerRows.map(r => 
      `${r.role}\t${r.model}\t${r.wall}\t${fmt(r.along)}\t${fmt(r.nearestEnd)}\t${fmt(r.height)}`
    );
    
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };
  
  const copyCSV = () => {
    if (installerRows.length === 0) return;
    
    const header = `Role,Model,Wall,Along wall (m),Nearest end (m),Height (m)`;
    const lines = installerRows.map(r => 
      `${r.role},${r.model},${r.wall},${fmt(r.along)},${fmt(r.nearestEnd)},${fmt(r.height)}`
    );
    
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };
  
  if (installerRows.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-gray-500">
        No speakers placed yet.
      </div>
    );
  }
  
  return (
    <div className="px-4 py-3 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-700">Speaker Positions (Installer)</div>
        <div className="flex items-center gap-2">
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
              <th className="py-1 pr-2 font-medium text-gray-600">Wall</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Along wall (m)</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Nearest end (m)</th>
              <th className="py-1 font-medium text-gray-600 text-right">Height (m)</th>
            </tr>
          </thead>
          <tbody>
            {installerRows.map((r, i) => (
              <tr key={`${r.role}-${i}`} className="border-b border-gray-100">
                <td className="py-1 pr-2 text-gray-700">{r.role}</td>
                <td className="py-1 pr-2 text-gray-600 truncate max-w-[100px]" title={r.model}>
                  {r.model}
                </td>
                <td className="py-1 pr-2 text-gray-600" style={{ textTransform: 'capitalize' }}>{r.wall}</td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{fmt(r.along)}</td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{fmt(r.nearestEnd)}</td>
                <td className="py-1 text-right text-gray-700 font-mono">{fmt(r.height)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        All distances in metres (±1mm). Along wall is the tape-measure distance along the wall run. Nearest end is the closest end of that wall. Height is cabinet centre height.
      </div>
    </div>
  );
}