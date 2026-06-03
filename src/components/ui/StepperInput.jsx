"use client";

import React from 'react';

/**
 * StepperInput — engineering-style numeric input with ▲▼ stepper arrows.
 * Matches the style used for Lens X / Y / Z, Ear Height, Platform Height.
 *
 * Props:
 *   value       — current numeric value (number)
 *   onChange    — called with new numeric value on every change
 *   step        — increment/decrement step (default 0.01)
 *   min         — minimum allowed value (optional)
 *   max         — maximum allowed value (optional)
 *   readOnly    — if true, input is read-only (steppers still work)
 *   decimals    — display decimal places (default 2)
 *   className   — extra classes for the input
 *   disabled    — disables both steppers and input
 */
export default function StepperInput({
  value,
  onChange,
  step = 0.01,
  min = -Infinity,
  max = Infinity,
  readOnly = false,
  decimals = 2,
  className = '',
  disabled = false,
  placeholder = '',
}) {
  const [draft, setDraft] = React.useState(null); // null = use value prop

  const clamp = (v) => Math.max(min, Math.min(max, v));
  const round = (v) => Math.round(v / step) * step; // avoid float drift

  const displayValue = draft !== null ? draft : (Number.isFinite(value) ? value.toFixed(decimals) : '');

  const handleChange = (e) => {
    if (readOnly) return;
    const raw = e.target.value;
    // Allow partial typing
    if (/^-?\d*\.?\d*$/.test(raw) || raw === '') {
      setDraft(raw);
    }
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      onChange(clamp(round(parsed)));
    } else {
      // Revert to current value
    }
    setDraft(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitDraft();
    if (e.key === 'ArrowUp') { e.preventDefault(); step_(1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); step_(-1); }
  };

  const step_ = (dir) => {
    if (disabled) return;
    const current = Number.isFinite(value) ? value : 0;
    const next = clamp(round(current + dir * step));
    setDraft(null);
    onChange(next);
  };

  return (
    <div className={`relative flex items-stretch ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        className={[
          'w-full rounded-md border px-3 py-1.5 text-sm',
          'border-[#DCDBD6] text-[#1B1A1A]',
          readOnly ? 'bg-[#F8F8F7]' : 'bg-white',
          'focus:outline-none focus:ring-1 focus:ring-[#213428]',
          'pr-7', // leave room for stepper buttons
          className,
        ].filter(Boolean).join(' ')}
        style={{ cursor: readOnly ? 'default' : undefined }}
      />
      {/* Stepper buttons — stacked vertically on right edge */}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#DCDBD6]" style={{ width: 22 }}>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(e) => { e.preventDefault(); step_(1); }}
          className="flex-1 flex items-center justify-center hover:bg-[#F0EFEA] active:bg-[#E8E6DF] transition-colors"
          style={{ fontSize: 8, color: '#625143', borderBottom: '1px solid #DCDBD6', borderRadius: '0 6px 0 0' }}
          aria-label="Increase"
        >
          ▲
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(e) => { e.preventDefault(); step_(-1); }}
          className="flex-1 flex items-center justify-center hover:bg-[#F0EFEA] active:bg-[#E8E6DF] transition-colors"
          style={{ fontSize: 8, color: '#625143', borderRadius: '0 0 6px 0' }}
          aria-label="Decrease"
        >
          ▼
        </button>
      </div>
    </div>
  );
}