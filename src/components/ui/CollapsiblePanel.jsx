import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CollapsiblePanel({ 
  title, 
  icon, 
  children, 
  defaultOpen = false, 
  className 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("bg-white border border-[#DCDBD6] rounded-lg overflow-visible", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#F8F8F7] transition-colors"
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
      
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}