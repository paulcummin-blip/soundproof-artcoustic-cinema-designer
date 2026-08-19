import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Search, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";

function statusStyle(status) {
  if (status === "active") return "bg-green-50 text-green-800 border-green-200";
  if (status === "pending") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function GlobalAccountUsersOverview({ refreshKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [maximumSeats, setMaximumSeats] = useState(5);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setError("");
    setRows(null);
    try {
      const response = await base44.functions.invoke("manageAccountUsers", { action: "list_all" });
      setRows(Array.isArray(response?.data?.accounts) ? response.data.accounts : []);
      setMaximumSeats(response?.data?.maximum_seats || 5);
    } catch (err) {
      setRows([]);
      setError(
        err?.response?.data?.message
        || err?.data?.message
        || err?.message
        || "Account users could not be loaded."
      );
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows || [];
    return (rows || []).filter((row) =>
      String(row.account?.name || "").toLowerCase().includes(query)
      || (row.members || []).some((member) =>
        String(member.email || "").toLowerCase().includes(query)
        || String(member.full_name || "").toLowerCase().includes(query)
      )
    );
  }, [rows, search]);

  const activeUsers = (rows || []).reduce(
    (sum, row) => sum + (row.members || []).filter((member) =>
      member.status === "active" || member.status === "pending"
    ).length,
    0,
  );

  return (
    <section className="mb-7 overflow-hidden rounded-xl border border-[#DCDBD6] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E5E1] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#EEF2EF] p-2 text-[#213428]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="m-0 text-base font-bold text-[#1B1A1A]">All account users</h2>
            <p className="m-0 mt-0.5 text-xs text-[#625143]">
              {activeUsers} occupied logins across {(rows || []).length} accounts
            </p>
          </div>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#625143]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search account or user"
            className="w-full rounded-lg border border-[#DCDBD6] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#213428]"
          />
        </label>
      </div>

      {rows === null ? (
        <div className="p-8 text-center text-sm text-[#3E4349]">
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading users…
        </div>
      ) : error ? (
        <div className="p-5 text-sm text-red-800">
          {error}
          <button onClick={load} className="ml-3 font-semibold underline">Try again</button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#3E4349]">No matching accounts or users.</div>
      ) : (
        <div className="max-h-[520px] divide-y divide-[#E7E5E1] overflow-y-auto">
          {filteredRows.map((row) => (
            <div key={row.account.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[260px_1fr_auto] lg:items-start">
              <div>
                <a
                  href={`/admin/accounts/${encodeURIComponent(row.account.id)}`}
                  className="inline-flex items-center gap-1 text-sm font-bold text-[#213428] no-underline hover:underline"
                >
                  {row.account.name || "Unnamed account"}
                  <ChevronRight className="h-4 w-4" />
                </a>
                <div className="mt-1 text-xs capitalize text-[#625143]">
                  {row.account.account_type || "account"} · {row.seats_used || 0}/{maximumSeats} logins
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(row.members || []).length === 0 ? (
                  <span className="text-xs text-[#625143]">No users</span>
                ) : (row.members || []).map((member) => (
                  <span
                    key={member.id}
                    title={member.access_label}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${statusStyle(member.status)}`}
                  >
                    <span className="truncate">{member.email || "Pending user"}</span>
                    <span className="font-semibold">· {member.is_platform_admin ? "Master Admin" : member.is_account_admin ? "Admin" : member.access_label}</span>
                  </span>
                ))}
              </div>

              <a
                href={`/admin/accounts/${encodeURIComponent(row.account.id)}`}
                className="rounded-lg border border-[#DCDBD6] px-3 py-1.5 text-xs font-semibold text-[#1B1A1A] no-underline hover:bg-slate-50"
              >
                Manage
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
