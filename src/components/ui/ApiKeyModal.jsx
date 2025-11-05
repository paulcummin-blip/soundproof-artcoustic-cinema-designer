import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setApiKey } from "@/components/net/api";

export default function ApiKeyModal({ open, onClose }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-[#DCDBD6] w-full max-w-md p-6 shadow-xl">
        <h3 className="text-lg font-header text-[#1B1A1A] mb-2">Set API Key</h3>
        <p className="text-sm text-[#3E4349] mb-4">
          Paste your Base44 API key. It will be saved to this browser.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="Enter API Key..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-white"
          />
          <Button
            onClick={() => {
              if (value.trim()) {
                setApiKey(value.trim());
                onClose?.();
                window.location.reload();
              }
            }}
            className="bg-[#1B1A1A] hover:bg-[#3E4349] text-white"
          >
            Save
          </Button>
        </div>
        <div className="mt-4 text-right">
          <Button variant="outline" onClick={onClose} className="border-[#DCDBD6] text-[#3E4349]">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}