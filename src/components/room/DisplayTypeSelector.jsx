/**
 * DisplayTypeSelector
 * -------------------
 * The DISPLAY TYPE control in the manual screen-size section: two exclusive
 * options, TV and Projector Screen, in the panel's own quiet style.
 *
 * Two-state segmented control (a radio group): the chosen option is stated once,
 * in the canonical value the design stores. Reusable anywhere the display type is
 * chosen; the value is always one of DISPLAY_TYPE_OPTIONS.
 */

import React from 'react';
import { DISPLAY_TYPE_OPTIONS } from '@/components/models/screen/displayTypeAuthority';

export default function DisplayTypeSelector({
  value,
  onChange,
  disabled = false,
  options = DISPLAY_TYPE_OPTIONS,
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Display type"
      className="inline-flex w-full rounded-md border border-[#DCDBD6] bg-white overflow-hidden"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(option.value)}
            className={`
              flex-1 px-3 h-10 text-sm transition-colors duration-150
              ${selected ? 'bg-[#213428] text-white font-medium' : 'bg-white text-[#3E4349]'}
              ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-[#F8F8F7]'}
            `}
            style={selected ? undefined : { color: '#3E4349' }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}