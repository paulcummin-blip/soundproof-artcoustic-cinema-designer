/**
 * RoomDesignerPage — thin shell that mounts RoomDesignerWithState.
 * Extracted from RoomDesigner.jsx to keep that file under the line limit.
 *
 * A valid project identity is required before the Room Designer can open.
 * Direct navigation to /RoomDesigner with no project redirects to Projects.
 */
import React, { Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

  // A canonical project ID is required to open the Room Designer.
  // Session active project OR explicit URL param both qualify.
  const resolvedProjectId = initialProjectIdFromUrl || sessionActiveProjectId || null;

  // No valid project → redirect to the Projects flow. Never render an editable
  // designer without a confirmed project identity.
  useEffect(() => {
    if (!disabled && !resolvedProjectId) {
      navigate("/Projects", { replace: true });
    }
  }, [disabled, resolvedProjectId, navigate]);

  if (disabled) {
    return <div className="p-6 text-sm">Room Designer is temporarily disabled.</div>;
  }

  if (!resolvedProjectId) {
    return (
      <SidebarInset>
        <div className="flex flex-col gap-4 px-4 md:px-6">
          <div className="p-6 text-sm text-gray-500">
            A project is required to open the Room Designer. Redirecting to Projects…
          </div>
        </div>
      </SidebarInset>
    );
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