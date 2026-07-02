import React, { useEffect } from "react";
import { installConsolePolyfill } from "@/components/utils/consolePolyfill";

// Install console polyfill immediately
installConsolePolyfill();

import "./globals.css";
import log from "@/components/utils/logger";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { Project } from "@/api/entities/Project";
import { base44 } from "@/api/base44Client";
import { AppStateProvider } from "@/components/AppStateProvider";
import {
  Home,
  Calculator,
  Layers3,
  Database,
  Settings
} from "lucide-react";

import ApiBadge from "@/components/ui/ApiBadge";
import SafeBootErrorBoundary from "@/components/dev/SafeBootErrorBoundary";
import BookDemoBanner from "@/components/ui/BookDemoBanner";
import { useProjectActions, useActiveProjectId, setActiveProjectId } from "@/components/state/project-session";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import PageHeaderActions from "@/components/ui/PageHeaderActions";
import { SHOW_DEBUG_PANEL } from "@/components/utils/diagnostics";
import PriceSummary from "@/components/pricing/PriceSummary";
import { useAuth } from "@/lib/AuthContext";

const menuItems = [
  { title: "Projects", url: "/Projects", icon: Layers3 },
  { title: "Room Designer", url: "/RoomDesigner", icon: Home },
  { title: "SPL Calculator", url: "/SPLCalculator", icon: Calculator },
];

export default function Layout({ children, currentPageName }) {
  const projectActions = useProjectActions();
  const activeProjectId = useActiveProjectId();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  
  // Price summary state (read from window.__ROOM_DESIGNER_PRICE__ set by RoomDesigner)
  const [priceSummary, setPriceSummary] = React.useState({
    showPrices: false,
    baseTotal: 0,
    finalTotal: 0,
    difficultyMultiplier: 1.0,
    priceMode: "incVat",
  });

  // Active project meta for sidebar (name + client)
  const [activeProjectSummary, setActiveProjectSummary] = React.useState({
    id: null,
    name: null,
    client_name: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    try {
      const url = new URL(window.location.href);
      // Extract project id from URL: ?projectId=, ?id=, or UUID in pathname
      let projectId = url.searchParams.get("projectId") || url.searchParams.get("project") || url.searchParams.get("id");
      if (!projectId) {
        const uuidMatch = url.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) projectId = uuidMatch[0];
      }
      if (projectId) {
        setActiveProjectId(projectId);
      } else {
        setActiveProjectSummary({ id: null, name: null, client_name: null });
        return;
      }

      (async () => {
        try {
          const projects = await base44.entities.Project.filter({ id: projectId });
          const project = Array.isArray(projects) && projects.length > 0 ? projects[0] : null;
          
          if (!cancelled) {
            setActiveProjectSummary({
              id: projectId,
              name: project?.name || "Untitled Project",
              client_name: project?.client_name || "",
            });
          }
        } catch (err) {
          console.error("[Layout] Failed to load active project:", err);
          if (!cancelled) {
            setActiveProjectSummary({ id: null, name: null, client_name: null });
          }
        }
      })();
    } catch (e) {
      console.error("[Layout] Failed to parse URL for active project:", e);
      setActiveProjectSummary({ id: null, name: null, client_name: null });
    }

    return () => {
      cancelled = true;
    };
  }, [currentPageName]);
  
  // Listen for price updates from Room Designer
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && window.__ROOM_DESIGNER_PRICE__) {
        setPriceSummary(window.__ROOM_DESIGNER_PRICE__);
      }
    }, 500); // Poll every 500ms for updates
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    log.debug(`[Layout] Page: ${currentPageName}`);
  }, [currentPageName]);

  return (
    <SafeBootErrorBoundary>
      <ToastProvider>
        <AppStateProvider>
        <div className="flex min-h-screen w-full bg-brand-background">
          <aside className="w-64 border-r border-brand-border bg-brand-sidebar-bg flex flex-col">
            <div className="p-4">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg"
                alt="Sound Proof"
                style={{
                  width: 300,
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
            </div>

            <nav className="flex-1 px-3 py-2">
              <div className="mb-4">
                <div className="text-xl font-bold text-[#1B1A1A] mb-4 px-3">
                  Design Tools
                </div>
                <div className="space-y-1">
                  {(() => {
                    const currentPath = typeof window !== "undefined" ? (window.location?.pathname || "") : "";

                    return menuItems.map((item) => {
                      const itemPath = String(item.url || "");
                      const isActive = itemPath && (currentPath === itemPath || currentPath.startsWith(itemPath + "/"));

                      return (
                        <a
                          key={item.title}
                          href={item.url}
                          className={`
                            group flex items-center gap-3 px-3 py-2 rounded-md text-sm
                            border transition-all duration-200 ease-out
                            cursor-pointer select-none
                            ${
                              isActive
                                ? 'bg-brand-menu-active text-brand-primary border-brand-primary shadow-md'
                                : 'text-brand-text-muted border-transparent bg-transparent'
                            }
                            hover:bg-white hover:border-[#D9D5CE] hover:text-brand-text-label
                            hover:shadow-md hover:-translate-y-[2px]
                            active:translate-y-0 active:shadow-sm
                          `}
                        >
                          <item.icon
                            className={`w-4 h-4 transition-all duration-200 ${
                              isActive
                                ? 'text-brand-primary'
                                : 'text-brand-text-muted group-hover:text-brand-text-label'
                            } group-hover:-translate-y-[1px]`}
                          />
                          <span style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                            {item.title}
                          </span>
                        </a>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Admin section — only visible to admin users */}
              {isAdmin && (() => {
                const currentPath = typeof window !== "undefined" ? (window.location?.pathname || "") : "";
                const isActive = currentPath.startsWith("/admin");
                return (
                  <div className="mb-4 mt-2">
                    <div className="text-xs font-medium text-brand-text-label mb-1 px-3" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#625143' }}>
                      Admin
                    </div>
                    <a
                      href="/admin"
                      className={`
                        group flex items-center gap-3 px-3 py-2 rounded-md text-sm
                        border transition-all duration-200 ease-out cursor-pointer select-none
                        ${isActive
                          ? 'bg-brand-menu-active text-brand-primary border-brand-primary shadow-md'
                          : 'text-brand-text-muted border-transparent bg-transparent'}
                        hover:bg-white hover:border-[#D9D5CE] hover:text-brand-text-label
                        hover:shadow-md hover:-translate-y-[2px] active:translate-y-0 active:shadow-sm
                      `}
                    >
                      <Database className={`w-4 h-4 transition-all duration-200 ${isActive ? 'text-brand-primary' : 'text-brand-text-muted group-hover:text-brand-text-label'} group-hover:-translate-y-[1px]`} />
                      <span style={{ fontFamily: 'Didact Gothic, sans-serif' }}>Admin Dashboard</span>
                    </a>
                  </div>
                );
              })()}

              <div className="mb-4" style={{ borderLeft: '4px solid #213428', paddingLeft: '12px', paddingTop: '6px', paddingBottom: '6px' }}>
                <div className="text-xs font-medium text-brand-text-label mb-2 px-3" style={{ fontSize: 12, letterSpacing: '0.4px' }}>
                  Active Project
                </div>
                <div className="px-3 py-2 text-xs text-brand-text-muted">
                  {activeProjectSummary.id ? (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 18, color: "#213428" }}>
                        {activeProjectSummary.name}
                      </div>
                      {activeProjectSummary.client_name && (
                        <div style={{ fontSize: 14, color: "#625143", marginTop: 4 }}>
                          Client: {activeProjectSummary.client_name}
                        </div>
                      )}
                    </>
                  ) : (
                    "No active project"
                  )}
                </div>
                </div>
                </nav>

                {(() => {
                const currentPath = typeof window !== "undefined" ? (window.location?.pathname || "") : "";
                return null;
                })()}

            {priceSummary.showPrices && (
              <div className="p-4 border-t border-brand-border">
                <PriceSummary
                  showPrices={priceSummary.showPrices}
                  baseTotal={priceSummary.baseTotal}
                  finalTotal={priceSummary.finalTotal}
                  difficultyMultiplier={priceSummary.difficultyMultiplier}
                  priceMode={priceSummary.priceMode}
                />
              </div>
            )}
          </aside>

          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <SafeBootErrorBoundary>
                <SegmentBoundary name="page-content">
                  <style>{`
                    /* full-bleed helper */
                    .full-bleed {
                      width: 100vw;
                      max-width: 100vw;
                      position: relative;
                      left: 50%;
                      right: 50%;
                      margin-left: -50vw;
                      margin-right: -50vw;
                    }
                    
                    /* Override any container max-widths for room designer */
                    .room-designer-wrapper {
                      width: 100% !important;
                      max-width: none !important;
                      padding: 0 !important;
                      min-width: 0 !important;
                    }

                    /* Kill preview-shell max-widths (Base44 wrapper) */
                    .group\\/sidebar-wrapper {
                      max-width: none !important;
                      width: 100% !important;
                    }

                    /* Any "container" utility inside the shell should not cap width */
                    .group\\/sidebar-wrapper [class*="container"] {
                      max-width: 100% !important;
                    }

                    /* Make sure flex/grid children can actually grow */
                    html, body, #__next, #root {
                      min-width: 0;
                    }
                  `}</style>
                  {children}
                </SegmentBoundary>
              </SafeBootErrorBoundary>
            </div>
          </main>
        </div>
        </AppStateProvider>
        </ToastProvider>
    </SafeBootErrorBoundary>
  );
}