import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useApiStatus } from "@/components/net/useApiStatus";
import ApiKeyModal from "@/components/ui/ApiKeyModal";

export default function ApiBadge({ className = "" }) {
  const { status, lastError } = useApiStatus();
  const [open, setOpen] = useState(false);

  const map = {
    ready:       { text: "API: READY",   className: "bg-emerald-600 text-white" },
    no_api_key:  { text: "API: NO KEY",  className: "bg-amber-500 text-white" },
    api_disabled:{ text: "API: OFFLINE", className: "bg-gray-500 text-white" },
    error:       { text: "API: ERROR",   className: "bg-red-600 text-white" },
  };
  const cfg = map[status] || map.error;

  const handleClick = () => {
    if (status === "no_api_key") setOpen(true);
  };

  return (
    <>
      <Badge
        className={`${cfg.className} font-body ${className} ${status === "no_api_key" ? "cursor-pointer" : "cursor-default"}`}
        variant="outline"
        onClick={handleClick}
        title={lastError ? `Last error: ${lastError}` : undefined}
      >
        {cfg.text}
      </Badge>
      <ApiKeyModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}