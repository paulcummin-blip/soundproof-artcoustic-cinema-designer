import React, { useEffect } from "react";
import { installConsolePolyfill } from "@/components/utils/consolePolyfill";

// Install console polyfill immediately
installConsolePolyfill();

import "./globals.css";
import log from "@/components/utils/logger";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { Project } from "@/api/entities/Project";
import { base44 } from "@/api/base44Client";
import {
  Home,
  Calculator,
  Layers3,
  Database,
  FileText,
  Settings
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import ApiBadge from "@/components/ui/ApiBadge";
import SafeBootErrorBoundary from "@/components/dev/SafeBootErrorBoundary";
import BookDemoBanner from "@/components/ui/BookDemoBanner";
import { useProjectActions, useActiveProjectId } from "@/components/state/project-session";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import PageHeaderActions from "@/components/ui/PageHeaderActions";
import { SHOW_DEBUG_PANEL } from "@/components/utils/diagnostics";
import PriceSummary from "@/components/pricing/PriceSummary";

const menuItems = [
  { title: "Room Designer", url: "/RoomDesigner", icon: Home },
  { title: "Projects", url: "/Projects", icon: Layers3 },
  // { title: "Calculator", url: "/Calculator", icon: Calculator },
  { title: "SPL Calculator", url: "/SPLCalculator", icon: Calculator },
  // { title: "SPL Calculator V2", url: "/SPLCalculatorV2", icon: Calculator },
  // { title: "Speaker Database", url: "/SpeakerDatabase", icon: Database },
  // { title: "Cinema Agent", url: "/CinemaAgent", icon: Settings },
  { title: "RP22 Report", url: "/RP22Report", icon: FileText },
  { title: "Printable Report", url: "/PrintableReport", icon: FileText },
];

export default function Layout({ children, currentPageName }) {
  const projectActions = useProjectActions();
  const activeProjectId = useActiveProjectId();
  
  // Price summary state (read from window.__ROOM_DESIGNER_PRICE__ set by RoomDesigner)
  const [priceSummary, setPriceSummary] = React.useState({
    showPrices: false,
    baseTotal: 0,
    finalTotal: 0,
    difficultyMultiplier: 1.0,
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
      const projectId = url.searchParams.get("project");

      if (!projectId) {
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
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-brand-background">
            <Sidebar className="border-r border-brand-border bg-brand-sidebar-bg">
              <SidebarHeader className="p-4">
                <div className="flex items-center gap-3">
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
              </SidebarHeader>

              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel className="text-brand-text-label font-medium">
                    Design Tools
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {menuItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            className={`
                              ${currentPageName === item.title.replace(/\s+/g, '') ? 
                                'bg-brand-menu-active text-brand-primary border-l-2 border-brand-primary' : 
                                'text-brand-text-muted hover:bg-brand-background hover:text-brand-text-label'
                              }
                            `}
                          >
                            <a href={item.url}>
                              <item.icon className="w-4 h-4" />
                              <span style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                                {item.title}
                              </span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                  <SidebarGroupLabel className="text-brand-text-label font-medium">
                    Active Project
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <div className="px-3 py-2 text-xs text-brand-text-muted">
                      {activeProjectSummary.id ? (
                        <>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1B1A1A" }}>
                            {activeProjectSummary.name}
                          </div>
                          {activeProjectSummary.client_name && (
                            <div style={{ fontSize: 12, color: "#3E4349", marginTop: 2 }}>
                              Client: {activeProjectSummary.client_name}
                            </div>
                          )}
                        </>
                      ) : (
                        "No active project"
                      )}
                    </div>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>

              <SidebarFooter className="p-4 border-t border-brand-border">
                <SegmentBoundary name="sidebar-footer">
                  {currentPageName === 'RoomDesigner' && (
                    <PriceSummary
                      showPrices={priceSummary.showPrices}
                      baseTotal={priceSummary.baseTotal}
                      finalTotal={priceSummary.finalTotal}
                      difficultyMultiplier={priceSummary.difficultyMultiplier}
                    />
                  )}
                  <ApiBadge />
                  <BookDemoBanner />
                </SegmentBoundary>
              </SidebarFooter>
            </Sidebar>

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
        </SidebarProvider>
      </ToastProvider>
    </SafeBootErrorBoundary>
  );
}