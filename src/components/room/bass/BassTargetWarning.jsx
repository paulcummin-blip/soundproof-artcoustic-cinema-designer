import React from "react";
import { AlertTriangle } from "lucide-react";

export default function BassTargetWarning({ warning }) {
  if (!warning) return null;
  return (
    <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-destructive">{warning.message}</div>
          {warning.details?.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {warning.details.map((detail) => (
                <li key={detail.parameter}>
                  <span className="font-medium text-foreground">{detail.parameter}:</span> {detail.message}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <div className="font-medium text-foreground">Recommended actions:</div>
            <ul className="mt-0.5 space-y-0.5 text-muted-foreground list-disc list-inside">
              {warning.actions?.map((action) => <li key={action}>{action}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}