
"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const SUB_MODELS = ["SUB2-12", "SUB3-12", "SUB4-12"];

/**
 * cfg: { count?: number, items?: Array<{ model: string }> }
 * - Defaults to none selected (count:0)
 * - Max 4 positions
 */
export default function SubwooferSelector({ title, cfg, onChange, disabled = false }) {
  const safeCount = Math.max(0, Math.min(4, Number(cfg?.count ?? 0)));
  const safeItems = React.useMemo(() =>
    (Array.isArray(cfg?.items) ? cfg.items.slice(0, 4) : []),
    [cfg?.items]
  );

  // Ensure items array matches count, fill new slots with a sensible default
  const items = React.useMemo(() => {
    const next = [...safeItems];
    while (next.length < safeCount) next.push({ model: "SUB2-12" });
    return next.slice(0, safeCount);
  }, [safeItems, safeCount]);

  const commit = (next) => {
    if (typeof onChange !== "function") return;
    const count = Math.max(0, Math.min(4, Number(next?.count ?? safeCount)));
    const baseItems = Array.isArray(next?.items) ? next.items : items;
    onChange({ count, items: baseItems.slice(0, 4) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Quantity</Label>
          <Select
            value={String(safeCount)}
            disabled={disabled}
            onValueChange={(val) => commit({ count: Number(val) })}
          >
            <SelectTrigger className="h-8 w-[90px] bg-white border-[#DCDBD6]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0,1,2,3,4].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {items.map((it, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Position {idx + 1} — Model</Label>
            <Select
              value={it?.model ?? "SUB2-12"}
              disabled={disabled}
              onValueChange={(val) => {
                const nextItems = items.map((s, i) => (i === idx ? { model: val } : s));
                commit({ items: nextItems });
              }}
            >
              <SelectTrigger className="h-8 bg-white border-[#DCDBD6]">
                <SelectValue placeholder="Choose model" />
              </SelectTrigger>
              <SelectContent>
                {SUB_MODELS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}

      {safeCount === 0 && (
        <div className="text-xs text-muted-foreground">
          None selected. Choose a quantity to configure models.
        </div>
      )}
    </div>
  );
}
