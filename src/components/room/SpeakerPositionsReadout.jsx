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
    
    const raw = String(modelId || '');
    
    // Special case: evolve-2-1 variants always show as "Evolve 2-1"
    if (raw.toLowerCase().startsWith('evolve-2-1')) {
      return 'Evolve 2-1';
    }
    
    const key = normaliseModelKey(modelId);
    const meta = getSpeakerModelMeta(key) || getSpeakerModelMeta(modelId) || null;

    // Prefer a human display name if registry provides one
    const nice =
      meta?.displayName ||
      meta?.label ||
      meta?.name ||
      meta?.title ||
      null;

    // Last fallback: clean up snake keys
    if (nice) return nice;
    return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  };

  const mToCm = (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return "-";
    return Math.round(n * 100);
  };

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
      
      const model = s?.model || null;
      const x = s?.position?.x;
      const y = s?.position?.y;
      const z = s?.position?.z;

      if (!safeNum(x) || !safeNum(y) || !(W > 0 && L > 0)) continue;

      // OVERHEAD SPEAKERS (ceiling-mounted)
      if (canonRole.startsWith('T')) {
        // Wall = "Ceiling" or "Overhead"
        const wall = 'Ceiling';
        
        // Along wall = Y (front-to-back distance)
        const along = y;
        
        // Nearest end = min distance to front or back wall
        const fromFront = y;
        const fromBack = L - y;
        const nearestEnd = Math.min(fromFront, fromBack);
        
        // Height: not meaningful for ceiling speakers in this table (avoid fixed/incorrect 225cm)
        const height = null;
        
        out.push({
          role,
          model,
          wall,
          along,
          nearestEnd,
          height,
          x,
          y,
          W,
          L,
          fromFront,
          fromBack,
          fromLeft: x,
          fromRight: W - x,
        });
        continue;
      }

      // BED SPEAKERS (wall-mounted)
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
        x,
        y,
        W,
        L,
        fromFront: dFront,
        fromBack: dBack,
        fromLeft: dLeft,
        fromRight: dRight,
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
              <th className="py-1 pr-2 font-medium text-gray-600" style={{ textTransform: "capitalize" }}>Wall</th>

              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Front (cm)</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Back (cm)</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Left (cm)</th>
              <th className="py-1 pr-2 font-medium text-gray-600 text-right">Right (cm)</th>

              <th className="py-1 font-medium text-gray-600 text-right">Height (cm)</th>
            </tr>
          </thead>
          <tbody>
            {[...installerRows]
              .sort((a, b) => {
                const ra = String(a.role || "").toUpperCase();
                const rb = String(b.role || "").toUpperCase();

                const rank = (r) => {
                  if (r === "FL") return 0; // L
                  if (r === "FC") return 1; // C
                  if (r === "FR") return 2; // R
                  return 10;
                };

                const aRank = rank(ra);
                const bRank = rank(rb);

                if (aRank !== bRank) return aRank - bRank;

                // keep the rest stable + predictable (role alphabetical)
                return ra.localeCompare(rb);
              })
              .map((r, i) => (
              <tr key={`${r.role}-${i}`} className="border-b border-gray-100">
                <td className="py-1 pr-2 text-gray-700">
                  {(() => {
                    const role = String(r.role || "").toUpperCase();
                    if (role === "FL") return "L";
                    if (role === "FC") return "C";
                    if (role === "FR") return "R";
                    return r.role;
                  })()}
                </td>

                <td className="py-1 pr-2 text-gray-600 truncate max-w-[100px]" title={modelLabel(r.model)}>
                  {modelLabel(r.model)}
                </td>

                <td className="py-1 pr-2 text-gray-600" style={{ textTransform: "capitalize" }}>
                  {r.wall}
                </td>

                {(() => {
                  const role = String(r.role || "").toUpperCase();

                  const isOverhead = role.startsWith("T");
                  const isLCR = role === "FL" || role === "FC" || role === "FR";
                  const isRearSurround = role === "SBL" || role === "SBR";
                  const isFrontWideOrSideSurround =
                    role === "LW" || role === "RW" || role === "SL" || role === "SR" || role === "SL2" || role === "SR2";

                  // Defaults: show nothing unless allowed
                  let showFrontBack = false;
                  let showLeftRight = false;

                  if (isOverhead) {
                    // Keep overheads meaningful: show all four distances (they're ceiling, so wall distances still matter)
                    showFrontBack = true;
                    showLeftRight = true;
                  } else if (isLCR || isRearSurround) {
                    // LCR + rear surrounds: only left/right
                    showLeftRight = true;
                  } else if (isFrontWideOrSideSurround) {
                    // Front wides + side surrounds: only front/back
                    showFrontBack = true;
                  } else {
                    // Fallback (any other bed roles): keep existing behaviour (show all)
                    showFrontBack = true;
                    showLeftRight = true;
                  }

                  const cell = (enabled, value) => (
                    <td className="py-1 pr-2 text-right text-gray-700 font-mono">
                      {enabled ? mToCm(value) : "-"}
                    </td>
                  );

                  const heightCell = () => (
                    <td className="py-1 text-right text-gray-700 font-mono">
                      {isOverhead ? "-" : mToCm(r.height)}
                    </td>
                  );

                  return (
                    <>
                      {cell(showFrontBack, r.fromFront)}
                      {cell(showFrontBack, r.fromBack)}
                      {cell(showLeftRight, r.fromLeft)}
                      {cell(showLeftRight, r.fromRight)}
                      {heightCell()}
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      

    </div>
  );
}