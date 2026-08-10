"use client";

import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Eye } from 'lucide-react';
import { normaliseViewingPriority } from '@/components/utils/viewingPriorityAuthority';

/**
 * ViewingPriorityControl
 *
 * Compact dropdown for multi-row viewing intent.
 *
 * - Hidden entirely when rowCount < 2 (no meaningless "Balanced" option).
 * - Options generated dynamically: "Balanced across rows" + one per row.
 * - Placed near existing RSP controls in SeatingLayout.
 *
 * Visual distinction:
 *   RSP          → where calculations reference
 *   Viewing Priority → how Sound Proof advises across multiple rows
 */
export default function ViewingPriorityControl({
  rowCount = 0,
  viewingPriority = "balanced",
  onViewingPriorityChange,
  disabled = false,
}) {
  // Normalise the incoming value against the current row count so the
  // control never shows a stale/invalid option (e.g. "row_3" in a 2-row room).
  const safeValue = useMemo(
    () => normaliseViewingPriority(viewingPriority, rowCount),
    [viewingPriority, rowCount]
  );

  const options = useMemo(() => {
    const opts = [{ value: "balanced", label: "Balanced across rows" }];
    for (let i = 1; i <= rowCount; i++) {
      opts.push({ value: `row_${i}`, label: `Prioritise Row ${i}` });
    }
    return opts;
  }, [rowCount]);

  // Hide entirely for single-row rooms — after all hooks have run.
  if (rowCount < 2) return null;

  return (
    <div className="space-y-1.5">
      <Label
        className="text-xs font-semibold flex items-center gap-1.5"
        style={{ color: '#3E4349', letterSpacing: '0.02em' }}
      >
        <Eye className="w-3 h-3" style={{ color: '#625143' }} />
        Viewing Priority
      </Label>
      <p className="text-[10px]" style={{ color: '#8A8580', lineHeight: '1.3' }}>
        How Sound Proof advises viewing balance across rows
      </p>
      <Select
        value={safeValue}
        onValueChange={onViewingPriorityChange}
        disabled={disabled}
      >
        <SelectTrigger
          className="w-full"
          style={{ border: '1px solid #C1B6AD', backgroundColor: '#ffffff', fontSize: 12 }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} style={{ fontSize: 12 }}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}