import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { mergeProjectAndVersion } from "@/lib/versionAuthority";
import { normalizeStatusId, getStatusLabel } from "@/components/projects/statusDefaults";
import { buildCreditDetail, formatDate, formatDateTime } from "@/lib/commercial/accountAccessOverview";
import { aggregateTurnoverForYear } from "@/lib/commercial/commercialOverview";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import AccessPill from "@/components/admin/access/AccessPill";
import AccountDrawerCredits from "@/components/admin/access/AccountDrawerCredits";
import AccountStatusActions from "@/components/admin/commercial/AccountStatusActions";
import AccountPromotionNote from "@/components/admin/promotions/AccountPromotionNote";
import TargetedPromotionPanel from "@/components/admin/promotions/TargetedPromotionPanel";
import AccountUsersPanel from "@/components/account/AccountUsersPanel";
import AccountNameEditor from "@/components/admin/accounts/AccountNameEditor";
import { Coins, FolderOpen, Gift, Settings, Users } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
};

const DEALER_GROUP_LABELS = {
  PREMIUM_PARTNER: "Premium Partner",
  RICHER_SOUNDS: "Richer Sounds",
  OTHER_DEALER: "Trade Dealer",
  INTERNATIONAL: "International Distributor",
  INTERNAL: "Internal",
  PROFESSIONAL: "Professional",
};

const OCCUPIED_STATUSES = ["pending", "active"];

const PANEL_HEADER_BG = "#F4F3F1";

function ProjectStatusPill({ value }) {
  const colorMap = {
    live: "#213428",
    prospective: "#625143",
    lost: "#4A230F",
    completed: "#C1B6AD",
  };
  const id = normalizeStatusId(value);
  const color = colorMap[id] || BRAND.subtext;
  const label = getStatusLabel(value, []);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 11, fontWeight: 600, color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label || "—"}
    </span>
  );
}

function formatGBP(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency", currency: "GBP",
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return "—";
  }
}

function accessStatus(account, occupiedSeats) {
  if (account.status === "suspended") return { label: "Suspended", tone: "danger" };
  if (account.status === "inactive") return { label: "Not Activated", tone: "muted" };
  if (occupiedSeats === 0) return { label: "Not Activated", tone: "muted" };
  return { label: "Active", tone: "ok" };
}

function SummaryFigure({ label, value, accent }) {
  return (
    <div style={{
      background: BRAND.card, border: `1px solid ${BRAND.border}`,
      borderRadius: 12, padding: "18px 22px",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: BRAND.subtext,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700,
        color: accent || BRAND.text, lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}

export default function AccountDashboard() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  // Extract accountId from URL path: /admin/accounts/:id
  const accountId = window.location.pathname.split("/").pop();

  const [account, setAccount] = useState(null);
  const [projects, setProjects] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [credits, setCredits] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [externalLinks, setExternalLinks] = useState([]);
  const [turnover, setTurnover] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [promotionUsage, setPromotionUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [promoRefreshKey, setPromoRefreshKey] = useState(0);

  const CALENDAR_YEAR = new Date().getFullYear();

  useEffect(() => {
    if (!isAdmin || !accountId) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);

        const [accountList, projectList, ledgerList, membershipList, linkList, turnoverRecords, promoList, promoUsageList] = await Promise.all([
          base44.entities.Account.filter({ id: accountId }),
          base44.entities.Project.filter({ account_id: accountId }),
          base44.entities.CapacityLedger.filter({ account_id: accountId }, "-created_date", 1000),
          base44.entities.AccountMembership.filter({ account_id: accountId }),
          base44.entities.ExternalAccountLink.filter({ account_id: accountId }),
          base44.entities.TurnoverRecord.filter({ account_id: accountId }),
          base44.entities.Promotion.list("-created_date", 200),
          base44.entities.PromotionUsage.filter({ account_id: accountId }),
        ]);

        if (!mounted) return;

        setAccount((accountList || [])[0] || null);

        // ── Version-aware merge ──────────────────────────────────────
        let mergedProjects = projectList || [];
        const versionIds = mergedProjects
          .filter((p) => p && p.active_version_id)
          .map((p) => p.active_version_id);
        const uniqueVersionIds = [...new Set(versionIds)];
        if (uniqueVersionIds.length > 0) {
          try {
            const versionMap = {};
            for (let i = 0; i < uniqueVersionIds.length; i += 50) {
              const batch = uniqueVersionIds.slice(i, i + 50);
              const versions = await base44.entities.ProjectVersion.filter({ id: batch });
              if (Array.isArray(versions)) {
                for (const v of versions) versionMap[v.id] = v;
              }
            }
            mergedProjects = mergedProjects.map((p) => {
              const v = p.active_version_id ? versionMap[p.active_version_id] : null;
              return v ? mergeProjectAndVersion(p, v) : p;
            });
          } catch (verErr) {
            console.warn('[AccountDashboard] Version batch fetch failed, using project-only:', verErr);
          }
        }
        setProjects(mergedProjects);

        setLedgerEntries(ledgerList || []);
        setCredits(buildCreditDetail(ledgerList || []));
        setMemberships(membershipList || []);
        setExternalLinks(linkList || []);
        setTurnover(aggregateTurnoverForYear(turnoverRecords, accountId, CALENDAR_YEAR));
        setPromotions(promoList || []);
        setPromotionUsage(promoUsageList || []);
      } catch (err) {
        if (mounted) setLoadError(err?.message || "Failed to load account");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [isAdmin, accountId, promoRefreshKey]);

  function handlePromotionsChanged() {
    setPromoRefreshKey(k => k + 1);
  }

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{
        padding: 48, textAlign: "center", color: BRAND.subtext,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14 }}>This page is restricted to admin users.</div>
        <a href="/Projects" style={{
          marginTop: 8, padding: "10px 20px", borderRadius: 10,
          background: BRAND.btn, color: BRAND.btnText,
          fontSize: 14, textDecoration: "none",
        }}>Go to Projects</a>
      </div>
    );
  }

  const occupiedSeats = memberships.filter(m => OCCUPIED_STATUSES.includes(m.status || "pending")).length;
  const creditRow = { credits: credits || {}, ledgerEntries };
  const dealerGroupLabel = DEALER_GROUP_LABELS[account?.dealer_group] || account?.account_type || "—";
  const dealerRef = externalLinks[0]?.external_account_number || null;
  const access = account ? accessStatus(account, occupiedSeats) : { label: "—", tone: "muted" };

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>

      {/* Back nav */}
      <div style={{ marginBottom: 20 }}>
        <a
          href="/admin/accounts"
          style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          ← Back to Accounts
        </a>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.red }}>{loadError}</div>
      ) : !account ? (
        <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>Account not found.</div>
      ) : (
        <>
          {/* ── Header ────────────────────────────────────────────────── */}
          <div style={{
            background: BRAND.card, border: `1px solid ${BRAND.border}`,
            borderRadius: 12, padding: "20px 24px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <AccountNameEditor account={account} onSaved={(updated) => setAccount(updated)} />
                <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.green, marginTop: 4 }}>
                  {dealerGroupLabel}
                </div>
                <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>
                  {account.territory ? `Territory: ${account.territory}` : ""}
                  {dealerRef ? ` · Ref: ${dealerRef}` : ""}
                </div>
              </div>
              <AccessPill label={access.label} tone={access.tone} />
            </div>
          </div>

          {/* ── Summary figures ──────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
            <SummaryFigure label="2026 Turnover" value={formatGBP(turnover)} accent={BRAND.green} />
            <SummaryFigure label="Available Credits" value={credits?.available ?? 0} accent={BRAND.green} />
            <SummaryFigure label="Projects" value={projects.length} />
          </div>

          {/* ── Compact access management ─────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <AccountStatusActions account={account} onStatusChanged={(updated) => setAccount(updated)} />
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 10,
              fontSize: 12, color: BRAND.subtext,
            }}>
              <Users style={{ width: 14, height: 14, color: BRAND.amber }} />
              <span>{occupiedSeats} of 5 logins occupied</span>
            </div>
          </div>

          {/* ── Collapsible panels ────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CollapsiblePanel
              title="Professional Project Credits & Ledger History"
              icon={<Coins className="h-4 w-4 text-[#625143]" />}
              headerBg={PANEL_HEADER_BG}
            >
              <AccountDrawerCredits row={creditRow} />
            </CollapsiblePanel>

            <CollapsiblePanel
              title="Users & Membership"
              icon={<Users className="h-4 w-4 text-[#625143]" />}
              headerBg={PANEL_HEADER_BG}
            >
              <AccountUsersPanel accountId={accountId} />
            </CollapsiblePanel>

            <CollapsiblePanel
              title={`Projects (${projects.length})`}
              icon={<FolderOpen className="h-4 w-4 text-[#625143]" />}
              headerBg={PANEL_HEADER_BG}
            >
              {projects.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: BRAND.subtext, fontSize: 14 }}>
                  No projects linked to this account yet.
                </div>
              ) : (
                <div style={{ overflow: "hidden", borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 90px",
                    padding: "10px 16px",
                    background: "rgb(244 243 241)",
                    borderBottom: `1px solid ${BRAND.border}`,
                    fontSize: 10, fontWeight: 700, color: BRAND.subtext,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>
                    <div>Project Name</div>
                    <div>Client</div>
                    <div>Status</div>
                    <div>Dolby Layout</div>
                    <div>Created</div>
                    <div>Updated</div>
                    <div style={{ textAlign: "right" }}>Open</div>
                  </div>
                  {projects.map((p, i) => (
                    <div
                      key={p.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr 90px",
                        padding: "14px 16px",
                        borderBottom: i < projects.length - 1 ? `1px solid ${BRAND.border}` : "none",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.text }}>
                        {p.name || "Untitled Project"}
                      </div>
                      <div style={{ fontSize: 13, color: BRAND.subtext }}>
                        {p.client_name || "—"}
                      </div>
                      <div>
                        <ProjectStatusPill value={p.project_status} />
                      </div>
                      <div style={{ fontSize: 12, color: BRAND.subtext }}>
                        {p.dolby_config || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: BRAND.subtext }}>
                        {formatDate(p.created_date)}
                      </div>
                      <div style={{ fontSize: 12, color: BRAND.subtext }}>
                        {formatDate(p.updated_date)}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <a
                          href={`/RoomDesigner?project=${encodeURIComponent(p.id)}`}
                          style={{
                            display: "inline-block",
                            padding: "6px 12px", borderRadius: 8,
                            background: BRAND.btn, color: BRAND.btnText,
                            fontSize: 12, fontWeight: 600, textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Open →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel
              title="Promotions & Promotional Usage"
              icon={<Gift className="h-4 w-4 text-[#625143]" />}
              headerBg={PANEL_HEADER_BG}
            >
              <AccountPromotionNote
                account={account}
                promotions={promotions}
                promotionUsage={promotionUsage}
              />
              <TargetedPromotionPanel
                account={account}
                promotions={promotions}
                promotionUsage={promotionUsage}
                allAccounts={account ? [account] : []}
                onPromotionsChanged={handlePromotionsChanged}
              />
              {promotionUsage.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", color: BRAND.subtext, fontSize: 13 }}>
                  No promotional usage recorded for this account.
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Promotional Usage Records ({promotionUsage.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {promotionUsage.map((u) => (
                      <div key={u.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "6px 12px", borderRadius: 8,
                        background: "#FAFAF9", border: `1px solid ${BRAND.border}`,
                        fontSize: 12,
                      }}>
                        <span style={{ color: BRAND.subtext }}>
                          {u.promotion_type || "—"} · {formatDate(u.used_at)}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: u.usage_status === "ACTIVE_PROJECT" ? BRAND.green : BRAND.amber,
                        }}>
                          {u.usage_status?.replaceAll("_", " ") || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel
              title="Technical Account Details"
              icon={<Settings className="h-4 w-4 text-[#625143]" />}
              headerBg={PANEL_HEADER_BG}
            >
              <div style={{ display: "grid", gap: 8, fontSize: 12, color: BRAND.subtext }}>
                <div>
                  <strong style={{ color: BRAND.text }}>Account ID:</strong>{" "}
                  <span style={{ fontFamily: "monospace", fontSize: 11 }}>{account.id}</span>
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Account type:</strong> {account.account_type || "—"}
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Dealer group:</strong> {account.dealer_group || "—"}
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Territory:</strong> {account.territory || "—"}
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Contact email:</strong> {account.contact_email || "—"}
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Last access:</strong> {formatDateTime(account.last_access_at)}
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Account.project_count (stale field):</strong> {account.project_count ?? "—"}
                </div>
                <div>
                  <strong style={{ color: BRAND.text }}>Account-linked projects (live count):</strong> {projects.length}
                </div>
                {externalLinks.length > 0 && (
                  <div>
                    <strong style={{ color: BRAND.text }}>Portal links:</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                      {externalLinks.map((link) => (
                        <li key={link.id} style={{ marginBottom: 4 }}>
                          {link.external_account_name || "linked"} ({link.external_account_number || "—"})
                          {link.partner_user_id ? ` · partner_user_id: ${link.partner_user_id}` : ""}
                          {link.active === false ? " · inactive" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsiblePanel>
          </div>
        </>
      )}
    </div>
  );
}