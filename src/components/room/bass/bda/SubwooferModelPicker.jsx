// SubwooferModelPicker.jsx
// ---------------------------------------------------------------------------
// Compact subwoofer model selector rendered inside Subwoofer Design BEFORE
// the evaluated shortlist, so the designer can pick a model without first
// placing 1, 2 or 4 subwoofers. This removes the circular dependency where the
// model selector in the Speakers panel is disabled until a quantity is chosen.
//
// Reuses the existing compatibility action (compat.setFrontSubModel) and the
// existing product master options — no duplicate configuration state. The
// selected model writes to the same frontSubsCfg.model the recommendation hook
// and Stage 2 canonical evaluation already read.
//
// Only rendered when no subwoofers are placed. Once a layout exists the
// CurrentDesignBar owns model display and change access.

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductRoleOptions } from "@/components/products/useProductMaster";
import { PRODUCT_ROLES } from "@/components/products/productMaster";
import { subwooferDisplayLabel } from "@/components/utils/subwooferDisplayLabel";

export default function SubwooferModelPicker({ model, onChange, disabled }) {
  const { options: subModels } = useProductRoleOptions(PRODUCT_ROLES.SUBWOOFER);
  const safeModel = model || "";
  return (
    <div className="rounded-lg border border-[#D9D5CE] bg-white px-4 py-3" data-bda-stage="model-picker">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Subwoofer Model</div>
      <div className="mt-2">
        <Select
          value={safeModel}
          disabled={disabled}
          onValueChange={(val) => onChange?.(val)}
        >
          <SelectTrigger className="h-10 bg-white border-[#DCDBD6] text-sm font-semibold text-[#213428]">
            <SelectValue placeholder="Select subwoofer model" className="text-sm font-semibold" style={{ color: "#213428" }}>
              {safeModel ? subwooferDisplayLabel(safeModel) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {subModels.map((m) => (
              <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[10px] text-[#8A7B6A]">
          Selecting a model lets ADI evaluate layouts for this room.
        </p>
      </div>
    </div>
  );
}