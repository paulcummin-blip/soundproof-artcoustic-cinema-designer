/**
 * RoomDesignerPage — thin shell that mounts RoomDesignerWithState.
 * Extracted from RoomDesigner.jsx to keep that file under the line limit.
 */
import React, { Suspense } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { ErrorBoundary } from "@/components/dev/ErrorBoundary";
import { useActiveProjectId } from "@/components/state/project-session";
import { useUrlQuery } from "@/components/roomdesigner/RoomDesignerHelpers";
import RoomDesignerWithState from "./RoomDesigner";

export default function RoomDesignerPage() {
  const disabled = typeof window !== "undefined" && window.__DISABLE_ROOM_DESIGNER === true;

  // Calculate project ID at page level (used as a remount key by the inner component)
  const sessionActiveProjectId = useActiveProjectId();
  const { projectId: initialProjectIdFromUrl } = useUrlQuery();
  // Only use an explicit URL project param — not stale session state.
  const resolvedProjectId = initialProjectIdFromUrl || null;

  if (disabled) {
    return <div className="p-6 text-sm">Room Designer is temporarily disabled.</div>;
  }

  return (
    <SidebarInset>
      <div className="flex flex-col gap-4 px-4 md:px-6">
        <Suspense fallback={<div className="p-6">Loading…</div>}>
          <ErrorBoundary fallback={<div className="p-6">Failed to mount Room Designer.</div>}>
            <RoomDesignerWithState />
          </ErrorBoundary>
        </Suspense>
      </div>
    </SidebarInset>
  );
}