"use client";

import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState, forwardRef, useCallback
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Ctx = createContext(null);
const useSelect = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("Select parts must be used inside <Select>");
  return v;
};

export function Select({ value: valueProp, defaultValue, onValueChange, open: openProp, onOpenChange, children, className }) {
  const [value, setValueState] = useState(valueProp ?? defaultValue ?? "");
  const [open, setOpenState] = useState(!!openProp);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const triggerRef = useRef(null);
  const wrapperRef = useRef(null);
  const itemsRef = useRef(new Map()); // value -> label

  // controlled sync
  useEffect(() => {
    if (valueProp !== undefined) setValueState(valueProp);
    // also refresh selectedLabel when controlled value changes
    if (valueProp !== undefined) {
      const lbl = itemsRef.current.get(valueProp) ?? (valueProp || null);
      setSelectedLabel(lbl);
    }
  }, [valueProp]);
  
  useEffect(() => { if (openProp !== undefined) setOpenState(!!openProp); }, [openProp]);

  const setOpen = useCallback((next) => { setOpenState(next); onOpenChange?.(next); }, [onOpenChange]);
  const setValue = useCallback((next) => {
    if (valueProp === undefined) setValueState(next);
    // capture a stable label so it persists after the menu unmounts
    const lbl = itemsRef.current.get(next) ?? (next || null);
    setSelectedLabel(lbl);
    onValueChange?.(next);
  }, [valueProp, onValueChange]);

  // close on outside click / Escape
  useEffect(() => {
    const onDoc = (e) => { if (open && wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (open && e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, setOpen]);

  const registerItem = useCallback((val, label) => {
    itemsRef.current.set(val, label);
    // if this item matches current value but label was unknown, hydrate it
    if (val === (valueProp ?? value)) {
      setSelectedLabel(label ?? val ?? null);
    }
  }, [valueProp, value]);
  
  const unregisterItem = useCallback((val) => {
    // optional: keep it registered to avoid losing the label
    // itemsRef.current.delete(val);
  }, []);

  const ctx = useMemo(() => ({
    open, setOpen, value, setValue, triggerRef, wrapperRef,
    registerItem, unregisterItem, selectedLabel,
  }), [open, value, selectedLabel, setOpen, setValue, registerItem, unregisterItem]);

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
    </div>
  );
}

export const SelectTrigger = forwardRef(function SelectTrigger({ className, children, ...props }, ref) {
  const { open, setOpen, triggerRef } = useSelect();
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      ref={(node) => { triggerRef.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-[#DCDBD6] bg-white px-3 py-2 text-sm",
        "focus:outline-none focus:ring-1 focus:ring-[#213428] hover:border-[#213428]",
        className
      )}
      {...props}
    >
      <span className="flex-1 truncate text-left">{children}</span>
      <ChevronDown className={cn("ml-2 h-4 w-4 text-[#625143] transition-transform", open ? "rotate-180" : "rotate-0")} />
    </button>
  );
});

export function SelectValue({ placeholder, className }) {
  const { selectedLabel, value } = useSelect?.() ?? {};
  return (
    <span className={cn("text-[#1B1A1A]", className)}>
      {selectedLabel ?? value ?? placeholder ?? ""}
    </span>
  );
}

export const SelectContent = forwardRef(function SelectContent({ className, children, ...props }, ref) {
  const { open } = useSelect();
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="listbox"
      className={cn(
        "absolute z-50 mt-1 w-full rounded-md border border-[#DCDBD6] bg-white shadow-md",
        className
      )}
      style={{ left: 0, top: "100%" }}
      {...props}
    >
      {/* This ensures the menu always opens fully and scrolls */}
      <div className="p-1 max-h-[70vh] overflow-auto">
        {children}
      </div>
    </div>
  );
});

export const SelectItem = forwardRef(function SelectItem({ className, children, value, ...props }, ref) {
  const { setValue, setOpen, registerItem, unregisterItem } = useSelect();
  useEffect(() => {
    const label = typeof children === "string" ? children : children?.props?.children ?? String(value);
    registerItem?.(value, label);
    // Optional: keep registered to preserve label after unmount
    return () => { /* no-op or unregisterItem?.(value) */ };
  }, [value, children, registerItem, unregisterItem]);

  return (
    <div
      ref={ref}
      role="option"
      tabIndex={0}
      data-value={value}
      onClick={() => { setValue(value); setOpen(false); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setValue(value); setOpen(false); } }}
      className={cn("cursor-pointer select-none px-3 py-2 text-sm text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]", className)}
      {...props}
    >
      {children}
    </div>
  );
});

// Optional API-compat stubs
export const SelectGroup = ({ children, className }) => <div className={className}>{children}</div>;
export const SelectLabel = ({ children, className }) => <div className={cn("px-3 py-1.5 text-xs font-semibold text-[#3E4349]", className)}>{children}</div>;
export const SelectSeparator = ({ className }) => <div className={cn("-mx-1 my-1 h-px bg-[#DCDBD6]", className)} />;
export const SelectScrollUpButton = () => null;
export const SelectScrollDownButton = () => null;

export default Select;