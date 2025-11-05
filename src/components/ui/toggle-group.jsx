import React, { createContext, useContext, useMemo } from "react";

// Minimal, shadcn-compatible ToggleGroup (single-select) to satisfy existing imports

const Ctx = createContext(null);

export function ToggleGroup({
  type = "single",
  value,
  defaultValue,
  onValueChange,
  className = "",
  children,
  ...rest
}) {
  const isSingle = type === "single";
  const [internal, setInternal] = React.useState(defaultValue ?? null);

  const current = value !== undefined ? value : internal;

  const setValue = (v) => {
    if (!isSingle) return; // only single supported here
    if (onValueChange) onValueChange(v);
    if (value === undefined) setInternal(v);
  };

  const ctx = useMemo(() => ({ value: current, setValue }), [current]);

  return (
    <Ctx.Provider value={ctx}>
      <div role="group" className={className} {...rest}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function ToggleGroupItem({
  value,
  disabled = false,
  className = "",
  children,
  ...rest
}) {
  const ctx = useContext(Ctx);
  const isOn = ctx?.value === value;

  const handleClick = (e) => {
    e.preventDefault();
    if (disabled) return;
    if (ctx?.setValue) ctx.setValue(value);
  };

  return (
    <button
      type="button"
      role="button"
      aria-pressed={isOn}
      data-state={isOn ? "on" : "off"}
      disabled={disabled}
      onClick={handleClick}
      className={[
        "inline-flex items-center justify-center px-2 py-1 rounded-md text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}