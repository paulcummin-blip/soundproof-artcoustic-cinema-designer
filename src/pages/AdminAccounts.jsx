import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import {
  buildTurnoverMap,
  buildProjectActivityMap,
  buildCapacityBreakdownMap,
  groupAccountsByCommercialSection,
} from "@/lib/commercial/commercialOverview";
import AccountGroupSection from "@/components/admin/commercial/AccountGroupSection";
import DiagnosticsPanel from "@/components/admin/commercial/DiagnosticsPanel";
import GlobalAccountUsersOverview from "@/components/admin/accounts/GlobalAccountUsersOverview";

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

export default function AdminAccountsPage() {
  const { user, isLoadingAuth, checkAppState } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Commercial data
  const [turnoverMap, setTurnoverMap] = useState(new Map());
  const [capacityMap, setCapacityMap] = useState(new Map());
  const [projectMap, setProjectMap] = useState(new Map());

  // Promotions
  const [promotions, setPromotions] = useState([]);
  const [promotionUsage, setPromotionUsage] = useState([]);
  const [promoRefreshKey, setPromoRefreshKey] = useState(0);

  // Diagnostics state (retained, moved behind collapsible)
  const [diagProjects, setDiagProjects] = useState([]);
  const [diagTotalAccounts, setDiagTotalAccounts] = useState(null);
  const [diagLoading, setDiagLoading] = useState(true);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupMessage, setSetupMessage] = useState(null);
  const [localUser, setLocalUser] = useState(null);

  const isAdmin = user?.role === "admin";
  const effectiveUser = localUser || user;

  const showSetupButton = isAdmin
    && !diagLoading
    && !effectiveUser?.account_id
    && diagTotalAccounts === 0;

  const CALENDAR_YEAR = new Date().getFullYear();

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);

        // Fetch all data in parallel — 6 API calls
        const [accountData, projectData, ledgerData, turnoverData, promoData, promoUsageData] = await Promise.all([
          base44.entities.Account.list("-created_date", 500),
          base44.entities.Project.list("-created_date", 1000),
          base44.entities.CapacityLedger.list("-created_date", 2000),
          base44.entities.TurnoverRecord.list("-created_date", 500),
          base44.entities.Promotion.list("-created_date", 200),
          base44.entities.PromotionUsage.list("-created_date", 500),
        ]);

        if (mounted) {
          setAccounts(accountData || []);
          setDiagTotalAccounts((accountData || []).length);
          setDiagProjects(projectData || []);

          // Build derived maps
          setTurnoverMap(buildTurnoverMap(turnoverData, CALENDAR_YEAR));
          setProjectMap(buildProjectActivityMap(projectData));
          setCapacityMap(buildCapacityBreakdownMap(ledgerData));
          setPromotions(promoData || []);
          setPromotionUsage(promoUsageData || []);
        }
      } catch (err) {
        if (mounted) setLoadError(err?.message || "Failed to load accounts");
      } finally {
        if (mounted) {
          setLoading(false);
          setDiagLoading(false);
        }
      }
    }

    load();
    return () => { mounted = false; };
  }, [isAdmin, promoRefreshKey]);

  function handlePromotionsChanged() {
    setPromoRefreshKey(k => k + 1);
  }

  function handleAccountsChanged() {
    setPromoRefreshKey(k => k + 1);
  }

  async function handleCreateAdminAccount() {
    setSetupRunning(true);
    setSetupMessage(null);
    try {
      const newAccount = await base44.entities.Account.create({
        name: "Sound Proof Admin Account",
        status: "active",
        account_type: "admin",
        contact_email: effectiveUser?.email || "",
        notes: `Auto-created admin account for ${effectiveUser?.email || "unknown"} during initial system setup.`,
      });

      await base44.auth.updateMe({
        account_id: newAccount.id,
        account_role: "admin",
      });

      await checkAppState?.();

      const [accountData, projectData] = await Promise.all([
        base44.entities.Account.list("-created_date", 200),
        base44.entities.Project.list("-created_date", 500),
      ]);
      setAccounts(accountData || []);
      setDiagTotalAccounts((accountData || []).length);
      setDiagProjects(projectData || []);
      setLocalUser({ ...effectiveUser, account_id: newAccount.id, account_role: "admin" });

      setSetupMessage({ type: "success", text: `Account created (id: ${newAccount.id}). User account_id updated.` });
    } catch (err) {
      setSetupMessage({ type: "error", text: err?.message || "Setup failed." });
    } finally {
      setSetupRunning(false);
    }
  }

  if (isLoadingAuth) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>
        Checking access…
      </div>
    );
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
        }}>
          Go to Projects
        </a>
      </div>
    );
  }

  // Group accounts by commercial section
  const groups = groupAccountsByCommercialSection(accounts);
  const premiumCount = groups.premiumPartners.length;
  const totalAccounts = accounts.length;

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, color: BRAND.text }}>Commercial Control Centre</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Dealer accounts, Professional Projects, turnover and activity
          </div>
        </div>
        <div style={{
          padding: "6px 14px", borderRadius: 999,
          background: "#213428", color: "#fff",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
        }}>
          ADMIN
        </div>
      </div>

      {/* Headline count */}
      <div style={{
        marginBottom: 24, padding: "16px 20px",
        background: BRAND.card, border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap",
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
          }}>
            Premium Partners
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: BRAND.green }}>
            {premiumCount}
          </div>
        </div>
        <div style={{ height: 40, width: 1, background: BRAND.border }} />
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
          }}>
            Total Accounts
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: BRAND.text }}>
            {totalAccounts}
          </div>
        </div>
      </div>

      {/* Master view across every account and login */}
      <GlobalAccountUsersOverview refreshKey={promoRefreshKey} />

      {/* Collapsible diagnostics */}
      <DiagnosticsPanel
        effectiveUser={effectiveUser}
        diagTotalAccounts={diagTotalAccounts}
        diagProjects={diagProjects}
        diagLoading={diagLoading}
        showSetupButton={showSetupButton}
        setupRunning={setupRunning}
        onSetup={handleCreateAdminAccount}
        setupMessage={setupMessage}
      />

      {/* Commercial sections */}
      {loading ? (
        <div style={{
          padding: 32, textAlign: "center",
          border: `1px dashed ${BRAND.border}`, borderRadius: 12,
          background: BRAND.card, color: BRAND.subtext, fontSize: 15,
        }}>
          Loading commercial data…
        </div>
      ) : loadError ? (
        <div style={{
          padding: 32, textAlign: "center",
          border: `1px dashed ${BRAND.border}`, borderRadius: 12,
          background: BRAND.card, color: BRAND.red, fontSize: 15,
        }}>
          {loadError}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => window.location.reload()} style={{
              padding: "10px 16px", borderRadius: 10,
              border: `1px solid ${BRAND.border}`,
              background: BRAND.btn, color: BRAND.btnText,
              cursor: "pointer", fontSize: 14,
            }}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* UK ACCOUNTS */}
          <div style={{
            fontSize: 13, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 16, paddingBottom: 8,
            borderBottom: `2px solid ${BRAND.border}`,
          }}>
            UK Accounts
          </div>

          <AccountGroupSection
            title="Premium Partners"
            subtitle={`${premiumCount} account${premiumCount !== 1 ? "s" : ""}`}
            accounts={groups.premiumPartners}
            turnoverMap={turnoverMap}
            capacityMap={capacityMap}
            projectMap={projectMap}
            emptyMessage="No Premium Partner accounts found."
            accentColor="#213428"
            groupKey="premiumPartners"
            promotions={promotions}
            promotionUsage={promotionUsage}
            allAccounts={accounts}
            onPromotionsChanged={handlePromotionsChanged}
          />

          <AccountGroupSection
            title="Richer Sounds"
            subtitle="Partner Portal accounts — not yet imported"
            accounts={groups.richerSounds}
            turnoverMap={turnoverMap}
            capacityMap={capacityMap}
            projectMap={projectMap}
            emptyMessage="Not yet imported. Richer Sounds accounts will appear here when the Partner Portal import is configured."
            accentColor="#2C5AA0"
            groupKey="richerSounds"
            promotions={promotions}
            promotionUsage={promotionUsage}
            allAccounts={accounts}
            onPromotionsChanged={handlePromotionsChanged}
          />

          <AccountGroupSection
            title="Other Dealers"
            subtitle="UK dealers — purchase Professional Projects normally"
            accounts={groups.otherDealers}
            turnoverMap={turnoverMap}
            capacityMap={capacityMap}
            projectMap={projectMap}
            emptyMessage="No other dealer accounts yet."
            accentColor="#625143"
            groupKey="otherDealers"
            promotions={promotions}
            promotionUsage={promotionUsage}
            allAccounts={accounts}
            onPromotionsChanged={handlePromotionsChanged}
          />

          {/* INTERNATIONAL */}
          <div style={{
            fontSize: 13, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 16, marginTop: 8, paddingBottom: 8,
            borderBottom: `2px solid ${BRAND.border}`,
          }}>
            International
          </div>

          <AccountGroupSection
            title="Distributors"
            subtitle="International distributor accounts"
            accounts={groups.distributors}
            turnoverMap={turnoverMap}
            capacityMap={capacityMap}
            projectMap={projectMap}
            emptyMessage="No international distributor accounts yet."
            accentColor="#2C5AA0"
            showCommercialColumns={false}
            groupKey="distributors"
            promotions={promotions}
            promotionUsage={promotionUsage}
            allAccounts={accounts}
            onPromotionsChanged={handlePromotionsChanged}
          />

          {/* INTERNAL */}
          <div style={{
            fontSize: 13, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 16, marginTop: 8, paddingBottom: 8,
            borderBottom: `2px solid ${BRAND.border}`,
          }}>
            Internal
          </div>

          <AccountGroupSection
            title="Internal Accounts"
            subtitle="Sound Proof staff and development/test accounts"
            accounts={groups.internal}
            turnoverMap={turnoverMap}
            capacityMap={capacityMap}
            projectMap={projectMap}
            emptyMessage="No internal accounts."
            accentColor="#3E4349"
            showCommercialColumns={false}
            groupKey="internal"
            promotions={promotions}
            promotionUsage={promotionUsage}
            allAccounts={accounts}
            onPromotionsChanged={handlePromotionsChanged}
            onAccountsChanged={handleAccountsChanged}
          />

          {/* PROFESSIONAL */}
          <div style={{
            fontSize: 13, fontWeight: 700, color: BRAND.subtext,
            textTransform: "uppercase", letterSpacing: "0.08em",
            marginBottom: 16, marginTop: 8, paddingBottom: 8,
            borderBottom: `2px solid ${BRAND.border}`,
          }}>
            Professional
          </div>

          <AccountGroupSection
            title="Professional Accounts"
            subtitle="Non-dealer professional users — cinema designers and specifiers"
            accounts={groups.professional}
            turnoverMap={turnoverMap}
            capacityMap={capacityMap}
            projectMap={projectMap}
            emptyMessage="No professional accounts yet."
            accentColor="#625143"
            showCommercialColumns={false}
            groupKey="professional"
            promotions={promotions}
            promotionUsage={promotionUsage}
            allAccounts={accounts}
            onPromotionsChanged={handlePromotionsChanged}
            onAccountsChanged={handleAccountsChanged}
          />
        </>
      )}
    </div>
  );
}