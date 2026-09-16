// src/components/versions/SaveAsVersionDialog.jsx
//
// "Save As Version..." dialog — lets the user clone the current active
// version's design state into an empty slot (V2–V5) or overwrite an
// occupied slot (with confirmation).
//
// Creating a version never consumes Professional Project capacity.

import React, { useState, useEffect, useRef } from "react";
import { Copy, Check, AlertTriangle, X } from "lucide-react";
import { useProjectVersions } from "@/components/versions/useProjectVersions";
import {
  truncateVersionName,
  MAX_VERSION_SLOTS,
  VERSION_NAME_MAX_LENGTH,
  sanitiseVersionName,
} from "@/lib/versionAuthority";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  bg: "#FFFFFF",
  card: "#FBFAF8",
  green: "#213428",
  btnBg: "#1B1A1A",
  btnText: "#FFFFFF",
  danger: "#B23A3A",
};

export default function SaveAsVersionDialog({ projectId, open, onClose, onSave }) {
  const { versions, activeVersionId, slotGrid, createVersion, overwriteVersion } =
    useProjectVersions(projectId);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [versionName, setVersionName] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const nameInputRef = useRef(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedSlot(null);
      setVersionName("");
      setConfirmOverwrite(false);
      setError(null);
    }
  }, [open]);

  // Focus name input when a slot is selected
  useEffect(() => {
    if (selectedSlot && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [selectedSlot]);

  if (!open) return null;

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  const handleSlotClick = (slot, occupied, version) => {
    setSelectedSlot(slot);
    setConfirmOverwrite(false);
    if (occupied) {
      setVersionName(version.version_name || `V${slot}`);
    } else {
      setVersionName(`V${slot} Design`);
    }
  };

  const handleSave = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      const slotData = slotGrid.find((s) => s.slot === selectedSlot);
      if (slotData.occupied && !confirmOverwrite) {
        setConfirmOverwrite(true);
        setSaving(false);
        return;
      }

      if (slotData.occupied && confirmOverwrite) {
        await overwriteVersion(slotData.version.id);
      } else {
        await createVersion(selectedSlot, versionName);
      }

      if (onSave) onSave();
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || "Failed to save version");
    } finally {
      setSaving(false);
    }
  };

  const selectedSlotData = slotGrid.find((s) => s.slot === selectedSlot);
  const isOverwrite = selectedSlotData?.occupied;
  const canSave = selectedSlot && versionName.trim().length > 0 && (!isOverwrite || confirmOverwrite);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg shadow-xl"
        style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BRAND.border }}>
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4" style={{ color: BRAND.green }} />
            <h2 className="text-base font-semibold" style={{ color: BRAND.text, fontFamily: "Didact Gothic, sans-serif" }}>
              Save As Version
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" style={{ color: BRAND.subtext }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {activeVersion && (
            <p className="text-xs mb-3" style={{ color: BRAND.subtext }}>
              Cloning from <strong>V{activeVersion.version_number} {activeVersion.version_name}</strong> into a new slot.
              No capacity is consumed.
            </p>
          )}

          {/* Slot grid */}
          <div className="space-y-1.5 mb-4">
            {slotGrid.map(({ slot, occupied, version }) => {
              const isSelected = selectedSlot === slot;
              const isActiveVersion = version && version.id === activeVersionId;

              return (
                <button
                  key={slot}
                  onClick={() => handleSlotClick(slot, occupied, version)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 text-left"
                  style={{
                    background: isSelected ? "#E8E6E0" : occupied ? BRAND.card : "transparent",
                    border: `1px solid ${isSelected ? BRAND.green : occupied ? BRAND.border : "#E8E6E0"}`,
                    opacity: isActiveVersion ? 0.5 : 1,
                    cursor: isActiveVersion ? "not-allowed" : "pointer",
                  }}
                  disabled={isActiveVersion}
                >
                  <span
                    className="flex-shrink-0 w-7 text-center text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: occupied ? BRAND.green : "transparent",
                      color: occupied ? BRAND.btnText : BRAND.subtext,
                      border: occupied ? "none" : `1px solid ${BRAND.border}`,
                    }}
                  >
                    V{slot}
                  </span>
                  {occupied ? (
                    <>
                      <span className="flex-1 truncate" style={{ color: BRAND.text }}>
                        {truncateVersionName(version.version_name, 28)}
                      </span>
                      {isActiveVersion && (
                        <span className="text-xs italic" style={{ color: BRAND.subtext }}>
                          (current)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="flex-1 text-xs italic" style={{ color: BRAND.subtext }}>
                      Empty — create new
                    </span>
                  )}
                  {isSelected && <Check className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.green }} />}
                </button>
              );
            })}
          </div>

          {/* Name input */}
          {selectedSlot && (
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: BRAND.subtext }}>
                Version name (max {VERSION_NAME_MAX_LENGTH} characters)
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value.substring(0, VERSION_NAME_MAX_LENGTH))}
                maxLength={VERSION_NAME_MAX_LENGTH}
                className="w-full px-3 py-2 rounded-md text-sm outline-none transition-colors"
                style={{
                  border: `1px solid ${BRAND.border}`,
                  color: BRAND.text,
                  fontFamily: "Didact Gothic, sans-serif",
                }}
                placeholder="e.g. Dual SUB2-12 + Architect LCR"
              />
              <div className="text-right text-xs mt-1" style={{ color: BRAND.subtext, opacity: 0.6 }}>
                {versionName.length}/{VERSION_NAME_MAX_LENGTH}
              </div>
            </div>
          )}

          {/* Overwrite confirmation */}
          {isOverwrite && confirmOverwrite && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-md mb-4"
              style={{ background: "#FDF5F5", border: `1px solid ${BRAND.danger}33` }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
              <div>
                <p className="text-xs font-medium" style={{ color: BRAND.danger }}>
                  Overwrite this version?
                </p>
                <p className="text-xs mt-0.5" style={{ color: BRAND.subtext }}>
                  The existing design state will be replaced with the current version's design. This cannot be undone.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs mb-3" style={{ color: BRAND.danger }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: BRAND.border }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-gray-100"
            style={{ color: BRAND.subtext, fontFamily: "Didact Gothic, sans-serif" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-40"
            style={{
              background: isOverwrite && confirmOverwrite ? BRAND.danger : BRAND.btnBg,
              color: BRAND.btnText,
              fontFamily: "Didact Gothic, sans-serif",
            }}
          >
            {saving
              ? "Saving…"
              : isOverwrite
              ? confirmOverwrite
                ? "Overwrite"
                : "Overwrite?"
              : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}