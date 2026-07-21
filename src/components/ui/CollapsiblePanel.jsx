import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const HEADER_BG_MAP = {
  "Room Dimensions":   "#FFFFFF",
  "Room Elements":     "rgba(74,35,15,0.14)",
  "Screen Size":       "#F1F0EE",
  "Seating Layout":    "#DCDBD6",
  "Speakers":          "rgba(33,52,40,0.16)",
  "Bass Simulation":   "#C1B6AD",
  "Compliance Report": "#F1F0EE",
  "Options":           "rgba(62,67,73,0.16)",
};

export function CollapsiblePanel({ 
  title, 
  icon, 
  children, 
  defaultOpen = false, 
  className,
  headerBg,
  keepMounted = false,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);

  const resolvedBg = headerBg ?? HEADER_BG_MAP[title] ?? "#FFFFFF";

  return (
    <div className={cn("bg-white border border-[#DCDBD6] rounded-lg overflow-visible", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-full px-4 py-3 flex items-center justify-between text-left transition-colors"
        style={{
          backgroundColor: resolvedBg,
          filter: hovered ? "brightness(0.96)" : "none",
        }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-bold text-[#1B1A1A]">{title}</span>
        </div>
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-[#625143] transition-transform",
            isOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </button>
      
      {(isOpen || keepMounted) && (
        <div className="px-4 pb-4" style={isOpen ? undefined : { display: "none" }}>
          {children}
        </div>
      )}
    </div>
  );
}