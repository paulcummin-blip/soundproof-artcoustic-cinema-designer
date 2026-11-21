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
  UserCog,
  FileText,
  Presentation,
  Images,
  Palette,
  ArrowUpRight,
  Menu,
  X,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { readRoomDimsMissingIndicator } from "@/components/state/designReviewHandoff";

import ApiBadge from "@/components/ui/ApiBadge";
import SidebarResizeHandle from "@/components/ui/SidebarResizeHandle";
import BrandIntroOverlay from "@/components/ui/BrandIntroOverlay";
import SafeBootErrorBoundary from "@/components/dev/SafeBootErrorBoundary";
import BuildDiagnosticPanel from "@/components/dev/BuildDiagnosticPanel";
import AdiEditorialRejectionDiagnostics from "@/components/adi/AdiEditorialRejectionDiagnostics";
import BookDemoBanner from "@/components/ui/BookDemoBanner";
import { useProjectActions, useActiveProjectId, setActiveProjectId } from "@/components/state/project-session";
import { useCanonicalProject } from "@/components/state/projectHydrationStore";
import { readBassPendingIndicator, readAsdrUnavailableIndicator, readP14TargetUnselectedIndicator, readSeatPriorityFingerprint, readDesignReviewHandoff, subscribeDesignReviewHandoff, readPartialDesignRating, subscribePartialDesignRating, readLiveRp22Summary, subscribeLiveRp22Summary } from "@/components/state/designReviewHandoff";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import PageHeaderActions from "@/components/ui/PageHeaderActions";
import ProjectIdentityLine from "@/components/projects/ProjectIdentityLine";
import PriceSummary from "@/components/pricing/PriceSummary";
import DesignRatingSummary from "@/components/pricing/DesignRatingSummary";
import LiveRP22PerformanceSummary from "@/components/rp22/LiveRP22PerformanceSummary";
import { PartnerPortalIdentityProvider } from "@/components/providers/PartnerPortalIdentityProvider";
import DealerIdentityDiagnostic from "@/components/dev/DealerIdentityDiagnostic";
import DealerHero from "@/components/ui/HeroBanner";
import BrandBar from "@/components/ui/BrandBar";
import { subscribeAsdrVisibility, getAsdrVisibility } from "@/components/state/asdrVisibilityStore";
import { useAuth } from "@/lib/AuthContext";
import { hasCapability, isStrictMasterAdmin } from "@/lib/accountAccess";


// Content-driven sidebar width for the Live RP22 Performance Summary panel.
// The default is derived from the actual seat-pill, gap and padding sizes so
// four seat performance badges sit on a single row without clipping; the
// minimum is the same content fit, so dragging the divider narrower never
// drops a badge to a second row. No RP22 calculation is changed here — these
// are layout measurements only.
const SEAT_PILL_MIN_WIDTH = 44;     // RP22GradingPill app variant minWidth
const SEAT_PILL_OUTLINE = 4;        // 2px box-shadow ring, each side
const SEAT_GAP = 5;                 // SeatPillGrid SEAT_GAP
const TARGET_SEATS_PER_ROW = 4;
const PARAM_ROW_PADDING_X = 24;     // ParameterRow: 12px each side
const PILLAR_BORDER_X = 2;          // PillarSection: 1px each side
const RP22_PANEL_PADDING_X = 24;    // LiveRP22 inner grid: 12px each side
const RP22_PANEL_BORDER_X = 2;      // LiveRP22 outer container: 1px each side
const SIDEBAR_RP22_MARGIN_X = 32;   // Layout RP22 wrapper: 16px each side
const SIDEBAR_COMFORT_PADDING = 24;

const SEAT_ROW_MIN_WIDTH =
  TARGET_SEATS_PER_ROW * (SEAT_PILL_MIN_WIDTH + SEAT_PILL_OUTLINE) +
  (TARGET_SEATS_PER_ROW - 1) * SEAT_GAP;
const RP22_PANEL_MIN_WIDTH =
  SEAT_ROW_MIN_WIDTH +
  PARAM_ROW_PADDING_X +
  PILLAR_BORDER_X +
  RP22_PANEL_PADDING_X +
  RP22_PANEL_BORDER_X;
const SIDEBAR_MIN_WIDTH = RP22_PANEL_MIN_WIDTH + SIDEBAR_RP22_MARGIN_X;
const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_MIN_WIDTH + SIDEBAR_COMFORT_PADDING;
const SIDEBAR_MAX_WIDTH = 480;

const menuItems = [
  { title: "Projects", url: "/Projects", icon: Layers3, capability: "soundProof" },
  { title: "System Designer", url: "/RoomDesigner", icon: Home, capability: "soundProof" },
  { title: "RP22 Speaker Capability", url: "/SPLCalculator", icon: Calculator, capability: "soundProof", adminOnly: true },
  { title: "Project Library", url: "/ProjectProposalAssets", icon: Images, capability: "soundProof" },
  { title: "Proposal Centre", url: "/ProposalCentre", icon: Presentation, capability: "soundProof" },
  { title: "Price List", url: "/PriceList", icon: Tags, capability: "priceList" },
  { title: "About Sound Proof", url: "/AboutSoundProof", icon: FileText, alwaysVisible: true },
  { title: "Dealer Branding", url: "/DealerBranding", icon: Palette, capability: "soundProof" },
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
  const accountName = user?.access_context?.account?.name || null;
  const availableMenuItems = menuItems.filter((item) =>
  (item.alwaysVisible || hasCapability(user, item.capability)) && (!item.adminOnly || isStrictMasterAdmin(user))
  );
  const isReportAutoPrint = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("autoPrint") === "1"
    && /\/RP22(?:Client)?Report\/?$/.test(window.location.pathname);
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

  // ASDR visibility plus the one canonical published engineering summary.
  // The sidebar reads this object directly; it never depends on a nested live-only rating.
  const showAsdr = useSyncExternalStore(subscribeAsdrVisibility, getAsdrVisibility);
  const [engineeringSummary, setEngineeringSummary] = React.useState(null);
  const [bassPending, setBassPending] = React.useState(false);
  const [asdrUnavailable, setAsdrUnavailable] = React.useState(false);
  const [p14TargetUnselected, setP14TargetUnselected] = React.useState(false);
  const [staleScope, setStaleScope] = React.useState(false);
  const [roomDimsMissing, setRoomDimsMissing] = React.useState(false);
  // Live Partial Design Rating — version-scoped, read from the same handoff
  // store as the completed engineering summary. Shown only when the completed
  // rating is unavailable but current valid RP22 evidence exists.
  const [partialDesignRating, setPartialDesignRating] = React.useState(null);

  // Live RP22 Performance Summary — version-scoped, read from the same handoff
  // store as the completed engineering summary. Shown below the Artcoustic
  // System Design Rating so the sidebar's compact pillar-grouped RP22 summary
  // updates live as the design changes, including with an incomplete system.
  const [liveRp22Summary, setLiveRp22Summary] = React.useState(null);

  // Only the Workspace navigation links are collapsible (the rest of the sidebar
  // keeps its full width and content). The mobile overlay drawer is separate.
  const [workspaceNavOpen, setWorkspaceNavOpen] = React.useState(() => {
    try { return localStorage.getItem('b44_workspace_nav_open') !== '0'; } catch { return true; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('b44_workspace_nav_open', workspaceNavOpen ? '1' : '0'); } catch {}
  }, [workspaceNavOpen]);

  // Resizable sidebar width — drives the Live RP22 Performance Summary panel
  // width. Persisted to localStorage (same approach as the workspace-nav
  // toggle above) so the chosen width survives workspace-view switches and
  // page reloads. Clamped to the content-derived min/max on read.
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    try {
      const stored = localStorage.getItem('b44_sidebar_width');
      const value = stored ? Number(stored) : NaN;
      if (
        Number.isFinite(value) &&
        value >= SIDEBAR_MIN_WIDTH &&
        value <= SIDEBAR_MAX_WIDTH
      ) {
        return value;
      }
    } catch {}
    return SIDEBAR_DEFAULT_WIDTH;
  });
  React.useEffect(() => {
    try { localStorage.setItem('b44_sidebar_width', String(sidebarWidth)); } catch {}
  }, [sidebarWidth]);
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  React.useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setMobileNavOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Active project identity comes from the canonical hydration source — the same
  // source Project Images, reports and every global page read. The sidebar keeps
  // no project fetch of its own, so it cannot disagree with the rest of the app.
  const projectHydration = useCanonicalProject();
  const activeProjectSummary = React.useMemo(() => {
    const identity = projectHydration.identity;
    return {
      id: projectHydration.projectId,
      name: identity?.name || null,
      client_name: identity?.clientName || null,
      active_version_id: identity?.activeVersionId || null,
      project_reference: identity?.projectReference || null,
      dealer_name: identity?.dealerName || null,
      // The owning account supplies a dealer name only when the project itself
      // carries no stamped dealer name.
      dealer_account: identity?.accountType
        ? { name: identity?.accountName || null, account_type: identity.accountType }
        : null,
    };
  }, [projectHydration.projectId, projectHydration.identity]);

  // The URL is only an entry point for "open this project": it sets the active
  // project id, which the shared provider then hydrates for the whole app.
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      // Extract project id from URL: ?projectId=, ?id=, or UUID in pathname
      let projectId = url.searchParams.get("projectId") || url.searchParams.get("project") || url.searchParams.get("id");
      if (!projectId) {
        const uuidMatch = url.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) projectId = uuidMatch[0];
      }
      if (projectId) setActiveProjectId(projectId);
    } catch (e) {
      console.error("[Layout] Failed to parse URL for active project:", e);
    }
  }, [currentPageName]);
  
  // The sidebar is a direct subscriber to the same published engineering
  // authority as every report. It never rebuilds or polls a separate rating.
  const activeVersionId = activeProjectSummary?.active_version_id || null;

  // The global shell observes only the same-window report handoff. Durable
  // engineering authority is route-owned and is not restored merely to draw the
  // sidebar while a project opens.
  React.useEffect(() => {
    if (!activeProjectId || !activeVersionId) {
      setEngineeringSummary(null);
      return undefined;
    }
    const applyPublication = (snapshot) => {
      const published = snapshot
        || readDesignReviewHandoff(activeProjectId, activeVersionId);
      setEngineeringSummary(
        published?.engineeringSummary
          ?? published?.rating?.engineeringSummary
          ?? null
      );
    };
    applyPublication(readDesignReviewHandoff(activeProjectId, activeVersionId));
    return subscribeDesignReviewHandoff(activeProjectId, activeVersionId, (snapshot, fromStorage) => {
      applyPublication(snapshot || (fromStorage
        ? readDesignReviewHandoff(activeProjectId, activeVersionId, { preferStored: true })
        : null));
    });
  }, [activeProjectId, activeVersionId]);

  // Subscribe to the version-scoped Live Partial Design Rating. Cleared when
  // the completed rating is publishable, so the sidebar shows the completed
  // card whenever it is available.
  React.useEffect(() => {
    if (!activeProjectId || !activeVersionId) {
      setPartialDesignRating(null);
      return undefined;
    }
    setPartialDesignRating(readPartialDesignRating(activeProjectId, activeVersionId));
    return subscribePartialDesignRating(activeProjectId, activeVersionId, (partial) => {
      setPartialDesignRating(partial || null);
    });
  }, [activeProjectId, activeVersionId]);

  // Subscribe to the version-scoped Live RP22 Performance Summary so the
  // sidebar's compact pillar-grouped RP22 summary tracks the live RP22
  // calculations as the design changes. Cleared when no project/version is
  // active so a stale summary never persists in the sidebar.
  React.useEffect(() => {
    if (!activeProjectId || !activeVersionId) {
      setLiveRp22Summary(null);
      return undefined;
    }
    setLiveRp22Summary(readLiveRp22Summary(activeProjectId, activeVersionId));
    return subscribeLiveRp22Summary(activeProjectId, activeVersionId, (summary) => {
      setLiveRp22Summary(summary || null);
    });
  }, [activeProjectId, activeVersionId]);

  // Listen for price and lightweight pending-indicator updates.
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
      setBassPending(readBassPendingIndicator(activeProjectId));
      setP14TargetUnselected(readP14TargetUnselectedIndicator(activeProjectId));
      setRoomDimsMissing(readRoomDimsMissingIndicator(activeProjectId));
      const unavailable = readAsdrUnavailableIndicator(activeProjectId);
      setAsdrUnavailable(unavailable);
      if (unavailable) {
        setEngineeringSummary(null);
      }

      // Stale-scope detection: compare the published rating's seat-priority
      // fingerprint against the current live fingerprint. If they differ, the
      // published scoped rating was calculated from a different priority set
      // than the current one — do not display its Primary/Secondary floors as
      // current.
      const liveFp = readSeatPriorityFingerprint(activeProjectId);
      const publishedFp = window.__ROOM_DESIGNER_ASDR__?.rating?.seatPriorityFingerprint ?? null;
      if (liveFp && publishedFp && liveFp !== publishedFp) {
        setStaleScope(true);
      } else {
        setStaleScope(false);
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
        <PartnerPortalIdentityProvider>
        {!isReportAutoPrint && <BrandIntroOverlay />}
        <div className="flex min-h-screen w-full bg-brand-background">
          {/* Mobile navigation open button */}
          {!isReportAutoPrint && isMobile && !mobileNavOpen && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="fixed top-3 left-3 z-40 inline-flex items-center justify-center w-10 h-10 rounded-md border border-[#DCDBD6] bg-white text-[#213428] shadow-sm hover:shadow-md"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {/* Mobile backdrop */}
          {!isReportAutoPrint && isMobile && mobileNavOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
          )}
          {!isReportAutoPrint && (
          <aside
            className={`app-shell-sidebar border-r border-brand-border bg-brand-sidebar-bg flex flex-col transition-transform duration-200 ${
              isMobile
                ? `fixed top-0 left-0 h-full w-64 z-50 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`
                : ''
            }`}
            data-app-shell-sidebar="true"
            style={isMobile ? undefined : { width: sidebarWidth, flexShrink: 0, position: 'relative' }}
          >
            {/* Brand */}
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

            {/* Mobile close button */}
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="flex items-center justify-center w-full py-2 border-b border-[#ECEAE5] text-[#625143] hover:bg-[#F6F3EE] hover:text-[#213428] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {accountName && (
              <div style={{
                padding: '10px 16px 12px',
                borderTop: '1px solid #DCDBD6',
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#625143',
                  marginBottom: 4,
                }}>
                  Account
                </div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#213428',
                  fontFamily: 'Didact Gothic, sans-serif',
                  lineHeight: 1.2,
                }}>
                  {accountName}
                </div>
              </div>
            )}

            <nav className="flex-1 px-3 py-2">
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setWorkspaceNavOpen((v) => !v)}
                  aria-label={workspaceNavOpen ? 'Collapse workspace navigation' : 'Expand workspace navigation'}
                  className="w-full flex items-center justify-between px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#625143] hover:text-[#213428] transition-colors"
                >
                  <span>Workspace</span>
                  {workspaceNavOpen
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />}
                </button>
                {workspaceNavOpen && (
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
                )}
              </div>

              {/* Admin section — only visible to admin users */}
              {isAdmin && workspaceNavOpen && (() => {
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
                        {activeProjectSummary.name || "Loading project…"}
                      </div>
                      <ProjectIdentityLine
                        orientation="stacked"
                        fontSize={14}
                        color="#3E4349"
                        style={{ marginTop: 6 }}
                        client={activeProjectSummary.client_name}
                        reference={activeProjectSummary.project_reference}
                      />
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

                {/* Visit our showroom — all authenticated users, independent of commercial state */}
                <a
                  href="https://calendly.com/solutes-impish-0i/artcoustic-showroom"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block mx-3 mb-4 rounded-md transition-all duration-200 hover:shadow-md hover:-translate-y-[1px] hover:bg-[#2A4434]"
                  style={{
                    background: '#213428',
                    color: '#FFFFFF',
                    fontFamily: 'Didact Gothic, sans-serif',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-3">
                    <div className="flex flex-col">
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: '#C1B6AD',
                          lineHeight: 1.2,
                        }}
                      >
                        Visit our showroom
                      </span>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: '#FFFFFF',
                          letterSpacing: '0.02em',
                          lineHeight: 1.3,
                          marginTop: 2,
                        }}
                      >
                        Experience Artcoustic
                      </span>
                    </div>
                    <ArrowUpRight
                      className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
                      strokeWidth={1.75}
                    />
                  </div>
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
                  breakdown={priceSummary.breakdown}
                />
              </div>
            )}

            {canUseSoundProof && showAsdr && (
              <div className="border-t border-brand-border">
                <DesignRatingSummary
                  showAsdr={showAsdr}
                  engineeringSummary={engineeringSummary}
                  bassPending={bassPending}
                  asdrUnavailable={asdrUnavailable}
                  p14TargetUnselected={p14TargetUnselected}
                  staleScope={staleScope}
                  roomDimsMissing={roomDimsMissing}
                  partialDesignRating={partialDesignRating}
                />
                <div style={{ margin: '0 16px 12px 16px' }}>
                  <LiveRP22PerformanceSummary liveSummary={liveRp22Summary} />
                </div>
              </div>
            )}
            {!isMobile && (
              <SidebarResizeHandle
                width={sidebarWidth}
                minWidth={SIDEBAR_MIN_WIDTH}
                maxWidth={SIDEBAR_MAX_WIDTH}
                onWidthChange={setSidebarWidth}
              />
            )}
          </aside>
          )}

          <main className="app-shell-main flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
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
                  {!isReportAutoPrint && (
                    <>
                      <DealerHero />
                      <BrandBar />
                    </>
                  )}
                  {children}
                </SegmentBoundary>
              </SafeBootErrorBoundary>
            </div>
          </main>
        </div>
        <BuildDiagnosticPanel />
        {/* The refused ADI editorial rewrite, in ENGINEERING MODE alone: a refusal
            writes nothing, so this is the only place its proposed copy, its stage
            and its violations can be read. Normal use never shows it. */}
        <AdiEditorialRejectionDiagnostics />
        <DealerIdentityDiagnostic />
        </PartnerPortalIdentityProvider>
        </AppStateProvider>
        </ToastProvider>
    </SafeBootErrorBoundary>
  );
}