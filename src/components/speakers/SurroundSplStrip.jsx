import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2 } from 'lucide-react';

/**
 * Displays SPL @ MLP for surround speakers.
 * Groups: Side Surrounds, Rear Surrounds (for 7.x+), Front Wides (for 9.x)
 */
export default function SurroundSplStrip({ allSeatSplMetrics, mlpSeat, dolbyLayout }) {
  const mlpSplData = useMemo(() => {
    if (!mlpSeat || !allSeatSplMetrics) return null;
    const metrics = allSeatSplMetrics.get(mlpSeat.id);
    return metrics?.spl || null;
  }, [mlpSeat, allSeatSplMetrics]);

  // Determine which groups to show based on layout
  const groups = useMemo(() => {
    if (!dolbyLayout) return [];
    
    const parts = String(dolbyLayout).split('.');
    const major = Number(parts[0]) || 5;
    
    const result = [];
    
    // All layouts have side surrounds
    if (major >= 5) {
      result.push({
        key: 'sides',
        label: 'Side Surrounds',
        roles: ['SL', 'SR'],
      });
    }
    
    // 7.x and above have rear surrounds (SBL/SBR)
    if (major >= 7) {
      result.push({
        key: 'rears',
        label: 'Rear Surrounds',
        roles: ['SBL', 'SBR'],
      });
    }
    
    // 9.x can have front wides
    if (major >= 9) {
      result.push({
        key: 'wides',
        label: 'Front Wides',
        roles: ['LW', 'RW'],
      });
    }
    
    return result;
  }, [dolbyLayout]);

  // Calculate representative SPL for each group (max value)
  const groupSplValues = useMemo(() => {
    if (!mlpSplData?.surrounds) return {};
    
    const result = {};
    
    for (const group of groups) {
      const splValues = group.roles
        .map(role => mlpSplData.surrounds[role]?.value)
        .filter(Number.isFinite);
      
      if (splValues.length > 0) {
        result[group.key] = Math.max(...splValues);
      }
    }
    
    return result;
  }, [mlpSplData, groups]);

  if (!mlpSeat) {
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
                  {hasValue ? `${splValue.toFixed(1)} dB` : '—'}
                </div>
                {!hasValue && (
                  <div className="text-xs text-[#625143] mt-1">Not placed</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}