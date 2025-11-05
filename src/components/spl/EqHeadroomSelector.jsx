import React from 'react';
import { EQ_HEADROOM_OPTIONS } from '@/components/utils/spl/engine';

export default function EqHeadroomSelector({ 
  value, 
  onChange, 
  disabled = false,
  className = '' 
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {EQ_HEADROOM_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange?.(option.value)}
          disabled={disabled}
          className={`
            px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${value === option.value 
              ? 'bg-[#213428] text-white' 
              : 'bg-white text-[#3E4349] border border-[#C1B6AD] hover:bg-[#F8F8F7]'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}