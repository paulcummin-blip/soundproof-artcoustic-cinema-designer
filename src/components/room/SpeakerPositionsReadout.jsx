import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { getSpeakerModelMeta, normaliseModelKey } from '@/components/models/speakers/registry';

export default function SpeakerPositionsReadout({ 
  placedSpeakers = [], 
  seatingPositions = [],
  roomWidth, 
  roomLength,
  screenFrontPlaneM = null,
  view = 'off' // 'off' | 'plan' | 'table' | 'both'
}) {
  const modelLabel = (modelId) => {
    if (!modelId) return '(none)';
    const key = normaliseModelKey(modelId);
    const meta = getSpeakerModelMeta(key) || getSpeakerModelMeta(modelId) || null;

    // Prefer a human display name if registry provides one
    const nice =
      meta?.displayName ||
      meta?.name ||
      meta?.title ||
      null;

    // Last fallback: clean up snake keys
    if (nice) return nice;
    return String(modelId).replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  };

  const mToCm = (m) => Math.round(Number(m) * 100);

  const recommendedBedHeightM = (speakerY, seats) => {
    const seatArray = Array.isArray(seats) ? seats : [];
    if (seatArray.length === 0) return 1.2;

    // Collect distinct row centres (Y) and sort front->rear
    const ys = seatArray
      .map(s => s?.y)
      .filter(v => typeof v === 'number' && Number.isFinite(v))
      .sort((a,b) => a-b);

    if (ys.length === 0) return 1.2;

    // crude but stable: group rows by proximity (20cm)
    const rows = [];
    for (const y of ys) {
      const last = rows[rows.length - 1];
      if (!last || Math.abs(y - last) > 0.20) rows.push(y);
    }

    // If fewer than 2 rows, always 1.2m
    if (rows.length < 2) return 1.2;

    const row2Y = rows[1];
    const row3Y = rows[2];

    // "behind row 3" means speaker is further back than row 3
    if (typeof row3Y === 'number' && speakerY > row3Y) return 1.8;

    // "behind row 2"
    if (speakerY > row2Y) return 1.5;

    return 1.2;
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
      
      // Skip overheads (treat separately later)
      if (canonRole.startsWith('T')) continue;
      
      const model = s?.model || null;
      const x = s?.position?.x;
      const y = s?.position?.y;

      if (!safeNum(x) || !safeNum(y) || !(W > 0 && L > 0)) continue;

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

      // Recommended bed height based on seat rows
      const height = recommendedBedHeightM(y, seatingPositions);

      out.push({
        role,
        model,
        wall,
        along,
        nearestEnd,
        height,
      });
    }

    return out;
  }, [placedSpeakers, roomWidth, roomLength, seatingPositions, recommendedBedHeightM]);
  
  const copyTable = () => {
    if (installerRows.length === 0) return;
    
    const header = `Role\tModel\tWall\tAlong wall (cm)\tNearest end (cm)\tHeight (cm)`;
    const lines = installerRows.map(r => 
      `${r.role}\t${modelLabel(r.model)}\t${r.wall}\t${mToCm(r.along)}\t${mToCm(r.nearestEnd)}\t${mToCm(r.height)}`
    );
    
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };
  
  const copyCSV = () => {
    if (installerRows.length === 0) return;
    
    const header = `Role,Model,Wall,Along wall (cm),Nearest end (cm),Height (cm)`;
    const lines = installerRows.map(r => 
      `${r.role},${modelLabel(r.model)},${r.wall},${mToCm(r.along)},${mToCm(r.nearestEnd)},${mToCm(r.height)}`
    );
    
    const text = [header, ...lines].join('\n');
    navigator.clipboard.writeText(text);
  };
  
  if (view === 'off' || (view !== 'table' && view !== 'both')) {
    return null;
  }

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
        <div className="text-sm font-medium text-gray-700">Speaker Positions</div>
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
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Along wall (cm)</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Nearest end (cm)</th>
              <th className="py-1 font-medium text-gray-600 text-right">Height (cm)</th>
            </tr>
          </thead>
          <tbody>
            {installerRows.map((r, i) => (
              <tr key={`${r.role}-${i}`} className="border-b border-gray-100">
                <td className="py-1 pr-2 text-gray-700">{r.role}</td>
                <td className="py-1 pr-2 text-gray-600 truncate max-w-[100px]" title={modelLabel(r.model)}>
                  {modelLabel(r.model)}
                </td>
                <td className="py-1 pr-2 text-gray-600" style={{ textTransform: 'capitalize' }}>{r.wall}</td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{mToCm(r.along)}</td>
                <td className="py-1 pr-2 text-right text-gray-700 font-mono">{mToCm(r.nearestEnd)}</td>
                <td className="py-1 text-right text-gray-700 font-mono">{mToCm(r.height)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-2 text-xs text-gray-500">
        All distances in centimetres (±1 cm). Along wall is the tape-measure distance along the wall run. Nearest end is the closest end of that wall. Height is cabinet centre height.
      </div>
    </div>
  );
}