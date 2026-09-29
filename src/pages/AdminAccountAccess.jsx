import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { RefreshCw } from "lucide-react";
import { buildTurnoverMap } from "@/lib/commercial/commercialOverview";
import {
  ACCESS_GROUPS,
  EMPTY_FILTERS,
  applyAccessFilters,
  bucketRowsByGroup,
  buildAccessRows,
  buildAdminGrantEntry,
  buildAuditsByAccount,
  buildLedgerByAccount,
  buildLinksByAccount,
  buildMembersByAccount,
  buildPortalIdentitiesByAccount,
  buildProjectsByAccount,
  buildUsersByAccount,
} from "@/lib/commercial/accountAccessOverview";
import AccountAccessFilters from "@/components/admin/access/AccountAccessFilters";
import AccountAccessTable from "@/components/admin/access/AccountAccessTable";
import AccountDetailDrawer from "@/components/admin/access/AccountDetailDrawer";
import AddCreditsDialog from "@/components/admin/access/AddCreditsDialog";
import RescindAccessDialog from "@/components/admin/access/RescindAccessDialog";

const GROUP_ACCENTS = {
  partners: "#213428",
  activeTrade: "#625143",
  richerSounds: "#2C5AA0",
  other: "#3E4349",
};

/**
 * Admin Account Access — a simple grouped view over the existing dealer,
 * membership, identity and credit authorities. Read-mostly: the only writes are
 * an append-only capacity-ledger grant and the existing Account.status field.
 */
export default function AdminAccountAccess() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [creditsRow, setCreditsRow] = useState(null);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState(null);
  const [accessChange, setAccessChange] = useState(null); // { row, mode }
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState(null);

  const CALENDAR_YEAR = new Date().getFullYear();

  useEffect(() => {
    if (!isAdmin) return undefined;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);

        const [
          accounts,
          projects,
          ledgerEntries,
          turnoverRecords,
          memberships,
          portalIdentities,
          users,
          links,
          audits,
          promotions,
          promotionUsage,
        ] = await Promise.all([
          base44.entities.Account.list("-created_date", 500),
          base44.entities.Project.list("-created_date", 1000),
          base44.entities.CapacityLedger.list("-created_date", 2000),
          base44.entities.TurnoverRecord.list("-created_date", 500),
          base44.entities.AccountMembership.list("-created_date", 1000),
          base44.entities.PortalIdentity.list("-created_date", 500),
          base44.entities.User.list("-created_date", 500),
          base44.entities.ExternalAccountLink.list("-created_date", 500),
          base44.entities.AccountUserAudit.list("-occurred_at", 500),
          base44.entities.Promotion.list("-created_date", 200),
          base44.entities.PromotionUsage.list("-created_date", 500),
        ]);

        if (!mounted) return;

        // Promotional projects — usage records of currently effective promotions.
        const now = Date.now();
        const effectivePromotionIds = new Set(
          (promotions || [])
            .filter((promotion) => {
              if (promotion?.status && promotion.status !== "ACTIVE") return false;
              const endsAt = promotion?.ends_at ? new Date(promotion.ends_at).getTime() : null;
              return !Number.isFinite(endsAt) || endsAt === null || endsAt >= now;
            })
            .map((promotion) => promotion.id)
        );
        const promoByAccount = new Map();
        for (const usage of promotionUsage || []) {
          if (!effectivePromotionIds.has(usage?.promotion_id)) continue;
          const accountId = usage?.account_id;
          if (!accountId) continue;
          promoByAccount.set(accountId, (promoByAccount.get(accountId) || 0) + 1);
        }

        setRows(buildAccessRows({
          accounts: accounts || [],
          membersByAccount: buildMembersByAccount(memberships),
          usersByAccount: buildUsersByAccount(users),
          portalIdentitiesByAccount: buildPortalIdentitiesByAccount(portalIdentities),
          linksByAccount: buildLinksByAccount(links),
          projectsByAccount: buildProjectsByAccount(projects),
          ledgerByAccount: buildLedgerByAccount(ledgerEntries),
          auditsByAccount: buildAuditsByAccount(audits),
          turnoverMap: buildTurnoverMap(turnoverRecords, CALENDAR_YEAR),
          promoByAccount,
        }));
      } catch (err) {
        if (mounted) setLoadError(err?.message || "Accounts could not be loaded.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [isAdmin, refreshKey, CALENDAR_YEAR]);

  const visibleRows = useMemo(() => applyAccessFilters(rows, filters), [rows, filters]);
  const buckets = useMemo(() => bucketRowsByGroup(visibleRows), [visibleRows]);
  const selectedRow = useMemo(
    () => rows.find((row) => row.account.id === selectedAccountId) || null,
    [rows, selectedAccountId]
  );
  const availableCredits = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.credits.available) || 0), 0),
    [rows]
  );

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  function updateFilters(partial) {
    setFilters((previous) => ({ ...previous, ...partial }));
  }

  async function handleAddCredits({ credits, reason }) {
    if (!creditsRow?.account?.id) return;
    setCreditBusy(true);
    setCreditError(null);
    try {
      await base44.entities.CapacityLedger.create(
        buildAdminGrantEntry({
          accountId: creditsRow.account.id,
          credits,
          reason,
          actor: user,
        })
      );
      setCreditsRow(null);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setCreditError(err?.message || "The credits could not be added.");
    } finally {
      setCreditBusy(false);
    }
  }

  async function handleAccessChange() {
    if (!accessChange?.row?.account?.id) return;
    setAccessBusy(true);
    setAccessError(null);
    try {
      await base44.entities.Account.update(accessChange.row.account.id, {
        status: accessChange.mode === "rescind" ? "suspended" : "active",
      });
      setAccessChange(null);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setAccessError(err?.message || "The access change could not be completed.");
    } finally {
      setAccessBusy(false);
    }
  }

  if (isLoadingAuth) {
    return <div className="p-12 text-center text-sm text-[#3E4349]">Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-center">
        <div className="text-lg font-bold text-[#1B1A1A]">Access Denied</div>
        <div className="text-sm text-[#3E4349]">This page is restricted to admin users.</div>
        <a href="/Projects" className="mt-2 rounded-lg bg-[#1B1A1A] px-5 py-2.5 text-sm text-white no-underline">
          Go to Projects
        </a>
      </div>
    );
  }

  const visibleGroups = ACCESS_GROUPS.filter(
    (group) => filters.group === "all" || filters.group === group.key
  );

  return (
    <div className="min-h-screen bg-[#F8F8F7] p-6 text-[#1B1A1A]">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold text-[#1B1A1A]">Account Access &amp; Credits</h1>
          <p className="m-0 mt-1 text-[13px] text-[#3E4349]">
            Who has access, how much they use it, and how many Professional Project credits they hold.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[#213428] px-3.5 py-1 text-[12px] font-bold tracking-wider text-white">
            ADMIN
          </span>
        </div>
      </div>

      {/* Compact summary */}
      <div className="mb-5 flex flex-wrap gap-2">
        <span className="rounded-lg border border-[#DCDBD6] bg-white px-3 py-1.5 text-[12px] text-[#3E4349]">
          <span className="font-bold text-[#1B1A1A]">{rows.length}</span> accounts
        </span>
        {ACCESS_GROUPS.map((group) => (
          <span
            key={group.key}
            className="rounded-lg border border-[#DCDBD6] bg-white px-3 py-1.5 text-[12px] text-[#3E4349]"
          >
            {group.label}: <span className="font-bold text-[#1B1A1A]">{buckets[group.key]?.length || 0}</span>
          </span>
        ))}
        <span className="rounded-lg border border-[#BBD3C4] bg-[#EEF4F0] px-3 py-1.5 text-[12px] text-[#213428]">
          Available credits: <span className="font-bold">{availableCredits}</span>
        </span>
      </div>

      <AccountAccessFilters
        filters={filters}
        onChange={updateFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onRefresh={() => setRefreshKey((key) => key + 1)}
        busy={loading}
        shown={visibleRows.length}
        total={rows.length}
      />

      {loading ? (
        <div className="rounded-xl border border-dashed border-[#DCDBD6] bg-white p-10 text-center text-sm text-[#3E4349]">
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading accounts…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-dashed border-[#DCDBD6] bg-white p-10 text-center text-sm text-red-800">
          {loadError}
          <button
            onClick={() => setRefreshKey((key) => key + 1)}
            className="ml-3 font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : (
        visibleGroups.map((group) => {
          const groupRows = buckets[group.key] || [];
          return (
            <section key={group.key} className="mb-7">
              <div
                className="mb-3 border-l-4 pl-3"
                style={{ borderLeftColor: GROUP_ACCENTS[group.key] || "#3E4349" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 text-[16px] font-bold text-[#1B1A1A]">{group.label}</h2>
                  <span className="rounded-full border border-[#DCDBD6] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#3E4349]">
                    {groupRows.length}
                  </span>
                </div>
                <p className="m-0 mt-0.5 text-[12px] text-[#625143]">
                  {group.description} · Professional Project credits: rewarded · purchased · used · available
                </p>
              </div>

              <AccountAccessTable
                rows={groupRows}
                onOpen={(row) => setSelectedAccountId(row.account.id)}
                onAddCredits={(row) => { setCreditError(null); setCreditsRow(row); }}
                emptyMessage={
                  hasActiveFilters
                    ? "No accounts in this group match the current filters."
                    : "No accounts in this group."
                }
              />
            </section>
          );
        })
      )}

      {!loading && !loadError && visibleRows.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#DCDBD6] bg-white p-10 text-center text-sm text-[#3E4349]">
          No accounts match the current filters.
        </div>
      )}

      <AccountDetailDrawer
        open={Boolean(selectedRow)}
        onOpenChange={(open) => { if (!open) setSelectedAccountId(null); }}
        row={selectedRow}
        onAddCredits={(row) => { setCreditError(null); setCreditsRow(row); }}
        onRescind={(row) => { setAccessError(null); setAccessChange({ row, mode: "rescind" }); }}
        onReinstate={(row) => { setAccessError(null); setAccessChange({ row, mode: "reinstate" }); }}
      />

      <AddCreditsDialog
        open={Boolean(creditsRow)}
        onOpenChange={(open) => { if (!open) { setCreditsRow(null); setCreditError(null); } }}
        row={creditsRow}
        onSubmit={handleAddCredits}
        busy={creditBusy}
        error={creditError}
      />

      <RescindAccessDialog
        open={Boolean(accessChange)}
        onOpenChange={(open) => { if (!open) { setAccessChange(null); setAccessError(null); } }}
        row={accessChange?.row || null}
        mode={accessChange?.mode || "rescind"}
        onConfirm={handleAccessChange}
        busy={accessBusy}
        error={accessError}
      />
    </div>
  );
}