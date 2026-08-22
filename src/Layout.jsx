import React, { useEffect, useSyncExternalStore } from "react";
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
  Settings,
  Tags,
  UserCog
} from "lucide-react";

import ApiBadge from "@/components/ui/ApiBadge";
import BrandIntroOverlay from "@/components/ui/BrandIntroOverlay";
import SafeBootErrorBoundary from "@/components/dev/SafeBootErrorBoundary";
import BookDemoBanner from "@/components/ui/BookDemoBanner";
import { useProjectActions, useActiveProjectId, setActiveProjectId } from "@/components/state/project-session";
import { readBassPendingIndicator, readAsdrUnavailableIndicator, readP14TargetUnselectedIndicator } from "@/components/state/designReviewHandoff";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import PageHeaderActions from "@/components/ui/PageHeaderActions";
import { SHOW_DEBUG_PANEL } from "@/components/utils/diagnostics";
import PriceSummary from "@/components/pricing/PriceSummary";
import DesignRatingSummary from "@/components/pricing/DesignRatingSummary";
import { subscribeAsdrVisibility, getAsdrVisibility } from "@/components/state/asdrVisibilityStore";
import { useAuth } from "@/lib/AuthContext";
import { hasCapability } from "@/lib/accountAccess";


const menuItems = [
  { title: "Projects", url: "/Projects", icon: Layers3, capability: "soundProof" },
  { title: "Room Designer", url: "/RoomDesigner", icon: Home, capability: "soundProof" },
  { title: "SPL Calculator", url: "/SPLCalculator", icon: Calculator, capability: "soundProof" },
  { title: "Price List", url: "/PriceList", icon: Tags, capability: "priceList" },
  { title: "Users & Permissions", url: "/account/users", icon: UserCog, capability: "manageUsers" },
];

export default function Layout({ children, currentPageName }) {
  const projectActions = useProjectActions();
  const activeProjectId = useActiveProjectId();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canUseSoundProof = hasCapability(user, "soundProof");
  const canUsePriceList = hasCapability(user, "priceList");
  const canUseCommercial = hasCapability(user, "commercial");
  const availableMenuItems = menuItems.filter((item) => hasCapability(user, item.capability));
  const [dealerAccountUrl, setDealerAccountUrl] = React.useState(null);

  // Price summary state (read from window.__ROOM_DESIGNER_PRICE__ set by RoomDesigner)
  const [priceSummary, setPriceSummary] = React.useState({
    showPrices: false,
    baseTotal: 0,
    finalTotal: 0,
    difficultyMultiplier: 1.0,
    priceMode: "incVat",
    territoryLabel: '',
    territoryCode: 'UK',
    currency: 'GBP',
    priceListAvailable: true,
    incompletePriceCount: 0,
  });

  // ASDR visibility (shared between app and report) + rating data from RoomDesigner
  const showAsdr = useSyncExternalStore(subscribeAsdrVisibility, getAsdrVisibility);
  const [asdrRating, setAsdrRating] = React.useState(null);
  const [asdrRecommendations, setAsdrRecommendations] = React.useState(null);
  const [bassPending, setBassPending] = React.useState(false);
  const [asdrUnavailable, setAsdrUnavailable] = React.useState(false);
  const [p14TargetUnselected, setP14TargetUnselected] = React.useState(false);

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
      if (typeof window !== 'undefined') {
        const sharedPrice = window.__ROOM_DESIGNER_PRICE__;
        const sameProject =
          sharedPrice &&
          activeProjectId &&
          String(sharedPrice.projectId || '') === String(activeProjectId);
        if (sameProject) {
          setPriceSummary(sharedPrice);
        } else {
          setPriceSummary((previous) => previous.showPrices
            ? { ...previous, showPrices: false }
            : previous);
        }
      }
      if (typeof window !== 'undefined' && window.__ROOM_DESIGNER_ASDR__) {
        const sharedAsdr = window.__ROOM_DESIGNER_ASDR__;
        const sameProjectAsdr =
          sharedAsdr &&
          activeProjectId &&
          String(sharedAsdr.projectId || '') === String(activeProjectId);
        if (sameProjectAsdr) {
          setAsdrRating(sharedAsdr.rating || null);
          setAsdrRecommendations(sharedAsdr.recommendations || null);
        } else {
          setAsdrRating(null);
          setAsdrRecommendations(null);
        }
      } else {
        setAsdrRating(null);
        setAsdrRecommendations(null);
      }
      setBassPending(readBassPendingIndicator(activeProjectId));
      setP14TargetUnselected(readP14TargetUnselectedIndicator(activeProjectId));
      const unavailable = readAsdrUnavailableIndicator(activeProjectId);
      setAsdrUnavailable(unavailable);
      if (unavailable) {
        setAsdrRating(null);
        setAsdrRecommendations(null);
      }
    }, 500); // Poll every 500ms for updates
    
    return () => clearInterval(interval);
  }, [activeProjectId]);

  useEffect(() => {
    log.debug(`[Layout] Page: ${currentPageName}`);
  }, [currentPageName]);

  // Dealer navigation is resolved server-side from the authenticated user's
  // authoritative Sound Proof account. Central Admin never requests or sees it.
  React.useEffect(() => {
    let cancelled = false;

    if (!user || isAdmin || !canUseCommercial) {
      setDealerAccountUrl(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const response = await base44.functions.invoke('resolveDealerAccountNavigation', {});
        const data = response?.data || {};
        if (!cancelled) {
          setDealerAccountUrl(
            data.eligible === true && typeof data.url === 'string'
              ? data.url
              : null,
          );
        }
      } catch {
        // Optional navigation fails closed: ambiguity or backend failure hides it.
        if (!cancelled) setDealerAccountUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isAdmin, canUseCommercial]);

  return (
    <SafeBootErrorBoundary>
      <ToastProvider>
        <AppStateProvider>
        <BrandIntroOverlay />
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
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#1B1A1A',
                  }}
                >
                  Professional Home Cinema Engineering
                </div>
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#625143',
                    marginTop: 2,
                  }}
                >
                  Powered by Artcoustic Design Intelligence (ADI)
                </div>
              </div>
            </div>

            <nav className="flex-1 px-3 py-2">
              <div className="mb-4">
                <div className="text-xl font-bold text-[#1B1A1A] mb-4 px-3">
                  Navigation
                </div>
                <div className="space-y-1">
                  {(() => {
                    const currentPath = typeof window !== "undefined" ? (window.location?.pathname || "") : "";

                    return availableMenuItems.map((item) => {
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

              {canUseSoundProof && (
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

                {dealerAccountUrl && !isAdmin && (
                  <a
                    href={dealerAccountUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mx-3 mt-1 text-xs underline underline-offset-2 hover:no-underline"
                    style={{
                      color: '#213428',
                      fontFamily: 'Didact Gothic, sans-serif',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                    }}
                  >
                    Dealer Account →
                  </a>
                )}

                </div>
              )}

                {/* Book a Demo — all authenticated users, independent of commercial state */}
                <a
                  href="https://calendly.com/solutes-impish-0i/artcoustic-showroom"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mx-3 mb-4 px-3 py-2 rounded-md text-sm text-center transition-all duration-200 hover:shadow-md hover:-translate-y-[1px]"
                  style={{
                    background: '#213428',
                    color: '#FFFFFF',
                    fontFamily: 'Didact Gothic, sans-serif',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  Book a Demo
                </a>
                </nav>

                {(() => {
                const currentPath = typeof window !== "undefined" ? (window.location?.pathname || "") : "";
                return null;
                })()}

            {canUsePriceList && priceSummary.showPrices && (
              <div className="p-4 border-t border-brand-border">
                <PriceSummary
                  showPrices={priceSummary.showPrices}
                  baseTotal={priceSummary.baseTotal}
                  finalTotal={priceSummary.finalTotal}
                  difficultyMultiplier={priceSummary.difficultyMultiplier}
                  priceMode={priceSummary.priceMode}
                  territoryLabel={priceSummary.territoryLabel}
                  territoryCode={priceSummary.territoryCode}
                  currency={priceSummary.currency}
                  priceListAvailable={priceSummary.priceListAvailable}
                  incompletePriceCount={priceSummary.incompletePriceCount}
                />
              </div>
            )}

            {canUseSoundProof && showAsdr && (
              <div className="border-t border-brand-border">
                <DesignRatingSummary
                  showAsdr={showAsdr}
                  rating={asdrRating}
                  recommendations={asdrRecommendations}
                  bassPending={bassPending}
                  asdrUnavailable={asdrUnavailable}
                  p14TargetUnselected={p14TargetUnselected}
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