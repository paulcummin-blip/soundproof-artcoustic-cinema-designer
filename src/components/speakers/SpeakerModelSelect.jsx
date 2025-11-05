"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAppState } from "@/components/AppStateProvider";

/**
 * A robust, controlled selector for one speaker role (e.g. FL, FC, FR, SL, SR...)
 * - Uses a stable option 'id' for SelectItem.value.
 * - Persists to AppState.speakerSystem.placedSpeakers[].model
 * - Never falls out of sync on re-renders.
 */
export default function SpeakerModelSelect({
  role,
  title,
  options,
  disabled = false,
}) {
  const { speakerSystem, setSpeakerSystem, isFrozen } = useAppState() || {};
  const frozen = isFrozen?.("speakers");

  // current model (display string) from placedSpeakers for this role
  const currentModel = React.useMemo(() => {
    const list = speakerSystem?.placedSpeakers || [];
    const s = list.find((sp) => String(sp.role).toUpperCase() === String(role).toUpperCase());
    return s?.model ?? ""; // this is a human label in your codebase, so we map it to an option below
  }, [speakerSystem?.placedSpeakers, role]);

  // map current label -> option id (if possible)
  const currentValue = React.useMemo(() => {
    const o = options.find((o) => o.label === currentModel);
    return o?.id ?? ""; // empty shows placeholder
  }, [options, currentModel]);

  const handleChange = (nextId) => {
    const opt = options.find((o) => o.id === nextId);
    if (!opt) return;

    // persist into placedSpeakers.model (single source of truth the rest of the app already reads)
    setSpeakerSystem?.((prev) => {
      const list = Array.isArray(prev?.placedSpeakers) ? prev.placedSpeakers : [];
      const updated = list.map((sp) =>
        String(sp.role).toUpperCase() === String(role).toUpperCase()
          ? { ...sp, model: opt.label }
          : sp
      );
      return { ...(prev || {}), placedSpeakers: updated, lastUpdated: Date.now() };
    });
  };

  return (
    <div className="space-y-2">
      <Label className="text-[#3E4349] font-medium">{title}</Label>
      <Select value={currentValue} onValueChange={handleChange} disabled={disabled || frozen}>
        <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428]">
          <SelectValue placeholder="Select a model…" />
        </SelectTrigger>
        <SelectContent className="bg-white border-[#DCDBD6]">
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}