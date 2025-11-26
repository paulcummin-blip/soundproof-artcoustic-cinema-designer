import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';
import { formatDb } from '@/components/utils/formatDb';

/**
 * Displays SPL @ MLP for overhead speakers.
 * Groups: Upper Front (TFL/TFR), Top Middle (TL/TR), Upper Rear (TBL/TBR)
 */
export default function OverheadSplStrip({ allSeatSplMetrics, mlpSeat, dolbyLayout }) {
  const mlpSplData = useMemo(() => {
    if (!mlpSeat || !allSeatSplMetrics) return null;
    const metrics = allSeatSplMetrics.get(mlpSeat.id);
    return metrics?.spl || null;
  }, [mlpSeat, allSeatSplMetrics]);

  // Determine which overhead groups to show based on layout
  const groups = useMemo(() => {
    if (!dolbyLayout) return [];
    
    const parts = String(dolbyLayout).split('.');
    const heights = parts.length >= 3 ? Number(parts[2]) || 0 : 0;
    
    if (heights === 0) return [];
    
    const result = [];
    
    if (heights === 2) {
      // .2 layout: only mid/top middle
      result.push({
        key: 'mid',
        label: 'Top Middle',
        roles: ['TL', 'TR', 'TML', 'TMR'],
      });
    }
    
    if (heights === 4) {
      // .4 layout: front and rear
      result.push({
        key: 'front',
        label: 'Upper Front',
        roles: ['TFL', 'TFR', 'TFC'],
      });
      result.push({
        key: 'rear',
        label: 'Upper Rear',
        roles: ['TBL', 'TBR', 'TBC'],
      });
    }
    
    if (heights === 6) {
      // .6 layout: all three groups
      result.push({
        key: 'front',
        label: 'Upper Front',
        roles: ['TFL', 'TFR', 'TFC'],
      });
      result.push({
        key: 'mid',
        label: 'Top Middle',
        roles: ['TL', 'TR', 'TML', 'TMR'],
      });
      result.push({
        key: 'rear',
        label: 'Upper Rear',
        roles: ['TBL', 'TBR', 'TBC'],
      });
    }
    
    return result;
  }, [dolbyLayout]);

  // Calculate representative SPL for each group (max value)
  const groupSplValues = useMemo(() => {
    if (!mlpSplData?.uppers) return {};
    
    const result = {};
    
    for (const group of groups) {
      const splValues = group.roles
        .map(role => mlpSplData.uppers[role]?.value)
        .filter(Number.isFinite);
      
      if (splValues.length > 0) {
        result[group.key] = Math.max(...splValues);
      }
    }
    
    return result;
  }, [mlpSplData, groups]);

  if (!mlpSeat || groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-[#625143] mb-2">SPL @ MLP</div>
      <div className="grid grid-cols-3 gap-2">
        {groups.map(group => {
          const splValue = groupSplValues[group.key];
          const hasValue = Number.isFinite(splValue);
          
          return (
            <Card key={group.key} className="bg-white">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-1">
                  <Volume2 className="w-3 h-3" style={{ color: '#625143' }} />
                  {group.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="text-lg font-bold" style={{ color: '#1B1A1A' }}>
                  {formatDb(splValue)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}