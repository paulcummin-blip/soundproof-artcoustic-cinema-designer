"use client";

import * as React from "react";
import { useAppState } from "@/components/AppStateProvider";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
// If you already have a function that returns per-role SPL, import it here instead of duplicating math.

export function RoleSplCompact({ role }) {
  const { speakerSystem, seatingPositions, dimensions } = useAppState() || {};
  const spk = (speakerSystem?.placedSpeakers || []).find(
    (s) => String(s.role).toUpperCase() === String(role).toUpperCase()
  );

  const { mlp } = computeMLPAndPrimary(seatingPositions || [], Number(dimensions?.width)||0, Number(dimensions?.length)||0, "front");

  // Distance in meters (plan distance is fine for now; if you have 3D/hypotenuse in your SPL widget, call the same util here)
  const d = (spk?.position && mlp) ? Math.hypot((spk.position.x - mlp.x), (spk.position.y - mlp.y)) : null;

  // Placeholder SPL calc so we don’t break: shows “—” if we don’t have the pieces.
  // Replace with your real per-role SPL util when ready.
  const splText = d ? `${Math.round(20 * Math.log10(1 / Math.max(d, 0.01)) + 100)} dB` : "—";

  return (
    <div className="mt-2 rounded-md border border-[#E7E6E2] bg-[#F8F8F7] px-3 py-2 text-sm text-[#1B1A1A]">
      <div className="flex items-center justify-between">
        <span>Predicted SPL @ MLP</span>
        <strong>{splText}</strong>
      </div>
    </div>
  );
}