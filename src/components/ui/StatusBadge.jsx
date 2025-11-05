import React from "react";
import { Badge } from "@/components/ui/badge";

// Brand-colored status styles
const STATUS_STYLES = {
  "Prospective":            "bg-[#C1B6AD] text-[#213428] border-transparent",
  "In Progress":            "bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]",
  "On Hold":                "bg-[#DCDBD6] text-[#1B1A1A] border-transparent",
  "Won – Completed":        "bg-[#213428] text-[#C1B6AD] border-transparent",
  "Lost – Completed":       "bg-[#4A230F] text-[#C1B6AD] border-transparent",
  default:                  "bg-[#3E4349] text-[#C1B6AD] border-transparent",
};

export default function StatusBadge({ value }) {
  const label = value || "Unspecified";
  const cls = STATUS_STYLES[label] || STATUS_STYLES.default;
  return (
    <Badge variant="outline" className={`font-body text-xs ${cls}`}>
      {label}
    </Badge>
  );
}