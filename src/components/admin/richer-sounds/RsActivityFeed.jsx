import React from "react";
import { formatDateTime } from "@/lib/commercial/accountAccessOverview";

export default function RsActivityFeed({ activity }) {
  if (!activity || activity.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-white px-5 py-6 text-center text-[13px] text-[#3E4349]">
        No recent Richer Sounds activity.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[#DCDBD6] bg-white">
      <div className="divide-y divide-[#EDEBE7]">
        {activity.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
            <div className="min-w-0">
              <div className="font-semibold text-[#1B1A1A]">{a.action}</div>
              <div className="text-[11px] text-[#625143]">{a.account_name}{a.detail ? ` · ${a.detail}` : ""}</div>
            </div>
            <div className="whitespace-nowrap text-[11px] text-[#625143]">{formatDateTime(a.occurred_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}