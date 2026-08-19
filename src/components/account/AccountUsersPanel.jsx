import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, MailPlus, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ACCESS_LABELS, ACCESS_LEVELS } from "@/lib/accountAccess";

const LEVELS = Object.values(ACCESS_LEVELS);

function apiMessage(error, fallback) {
  return error?.response?.data?.message
    || error?.data?.message
    || error?.message
    || fallback;
}

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status) {
  if (status === "active") return "border-green-200 bg-green-50 text-green-800";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function AccountUsersPanel({ accountId = null }) {
  const masterView = Boolean(accountId);
  const [data, setData] = useState(null);
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState(ACCESS_LEVELS.FULL_ACCESS);
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    setBusy("load");
    try {
      const response = await base44.functions.invoke("manageAccountUsers", {
        action: "list",
        ...(accountId ? { account_id: accountId } : {}),
      });
      setData(response?.data || null);
    } catch (err) {
      setError(apiMessage(err, "Users could not be loaded."));
    } finally {
      setBusy("");
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeAdmin = useMemo(
    () => data?.members?.find((member) =>
      member.is_account_admin && (member.status === "active" || member.status === "pending")
    ),
    [data],
  );

  async function run(action, payload, successMessage) {
    setError("");
    setNotice("");
    setBusy(payload?.membership_id || action);
    try {
      const response = await base44.functions.invoke("manageAccountUsers", {
        action,
        ...(accountId ? { account_id: accountId } : {}),
        ...payload,
      });
      setData(response?.data || null);
      setNotice(successMessage);
      return true;
    } catch (err) {
      setError(apiMessage(err, "The change could not be completed."));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function invite(event) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter an email address.");
      return;
    }

    const invited = await run("invite", {
      email: cleanEmail,
      access_level: makeAdmin ? ACCESS_LEVELS.FULL_ACCESS : accessLevel,
      is_account_admin: masterView && makeAdmin,
    }, `Invitation sent to ${cleanEmail}.`);

    if (invited) {
      setEmail("");
      setAccessLevel(ACCESS_LEVELS.FULL_ACCESS);
      setMakeAdmin(false);
    }
  }

  async function remove(member) {
    if (!window.confirm(`Remove ${member.email} from this account? They will lose access immediately.`)) return;
    await run("remove", { membership_id: member.id }, `${member.email} was removed.`);
  }

  if (busy === "load" && !data) {
    return (
      <div className="rounded-xl border border-[#DCDBD6] bg-white p-10 text-center text-sm text-[#3E4349]">
        <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Loading account users…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {error || "Users could not be loaded."}
        <button onClick={load} className="ml-3 font-semibold underline">Try again</button>
      </div>
    );
  }

  const members = data.members || [];
  const seats = data.seats || { used: 0, maximum: 5, remaining: 5 };
  const canInvite = seats.remaining > 0;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#DCDBD6] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-lg bg-[#EEF2EF] p-2.5 text-[#213428]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="m-0 text-lg font-bold">{data.account?.name || "Account users"}</h2>
              <p className="mt-1 text-sm text-[#3E4349]">
                One account administrator plus up to four additional users.
              </p>
            </div>
          </div>
          <div className="rounded-full border border-[#DCDBD6] px-3 py-1.5 text-sm font-semibold text-[#213428]">
            {seats.used} of {seats.maximum} logins used
          </div>
        </div>

        <form onSubmit={invite} className="mt-5 grid gap-3 border-t border-[#E7E5E1] pt-5 lg:grid-cols-[1.4fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#625143]">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@company.com"
              disabled={!canInvite || busy === "invite"}
              className="w-full rounded-lg border border-[#DCDBD6] px-3 py-2 text-sm outline-none focus:border-[#213428] disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#625143]">
              Permission
            </label>
            {masterView && !activeAdmin ? (
              <select
                value={makeAdmin ? "ADMIN" : accessLevel}
                onChange={(event) => {
                  const isAdmin = event.target.value === "ADMIN";
                  setMakeAdmin(isAdmin);
                  if (!isAdmin) setAccessLevel(event.target.value);
                }}
                className="w-full rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-sm outline-none focus:border-[#213428]"
              >
                <option value="ADMIN">Account Admin</option>
                {LEVELS.map((level) => <option key={level} value={level}>{ACCESS_LABELS[level]}</option>)}
              </select>
            ) : (
              <select
                value={accessLevel}
                onChange={(event) => setAccessLevel(event.target.value)}
                disabled={!canInvite}
                className="w-full rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-sm outline-none focus:border-[#213428] disabled:bg-slate-50"
              >
                {LEVELS.map((level) => <option key={level} value={level}>{ACCESS_LABELS[level]}</option>)}
              </select>
            )}
          </div>
          <button
            type="submit"
            disabled={!canInvite || busy === "invite"}
            className="self-end inline-flex items-center justify-center gap-2 rounded-lg bg-[#213428] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MailPlus className="h-4 w-4" />
            {busy === "invite" ? "Sending…" : "Invite user"}
          </button>
        </form>

        {!canInvite && (
          <p className="mt-3 text-sm font-medium text-amber-800">
            All five logins are in use. Remove an additional user before inviting another.
          </p>
        )}
        {masterView && !activeAdmin && (
          <p className="mt-3 text-sm text-amber-800">
            This account has no primary administrator yet. Add that person first.
          </p>
        )}
        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#DCDBD6] bg-white">
        <div className="border-b border-[#E7E5E1] px-5 py-4">
          <h2 className="m-0 text-base font-bold">Account logins</h2>
        </div>
        {members.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#3E4349]">No users have been added.</div>
        ) : (
          <div className="divide-y divide-[#E7E5E1]">
            {members.map((member) => {
              const rowBusy = busy === member.id;
              return (
                <div key={member.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.6fr_1fr_120px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{member.full_name || member.email}</span>
                      {member.is_account_admin && <ShieldCheck className="h-4 w-4 shrink-0 text-[#213428]" />}
                    </div>
                    {member.full_name && <div className="truncate text-xs text-[#625143]">{member.email}</div>}
                  </div>

                  <div>
                    {member.is_account_admin ? (
                      <span className="text-sm font-semibold text-[#213428]">Account Admin</span>
                    ) : member.status === "active" || member.status === "pending" ? (
                      <select
                        value={member.access_level}
                        disabled={rowBusy}
                        onChange={(event) => run(
                          "change_access",
                          { membership_id: member.id, access_level: event.target.value },
                          `${member.email} now has ${ACCESS_LABELS[event.target.value]}.`,
                        )}
                        className="w-full rounded-lg border border-[#DCDBD6] bg-white px-2 py-1.5 text-sm"
                      >
                        {LEVELS.map((level) => <option key={level} value={level}>{ACCESS_LABELS[level]}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm text-[#625143]">{member.access_label}</span>
                    )}
                  </div>

                  <div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(member.status)}`}>
                      {member.status}
                    </span>
                  </div>

                  <div className="flex justify-end gap-2">
                    {member.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => run("resend", { membership_id: member.id }, `Invitation resent to ${member.email}.`)}
                        disabled={rowBusy}
                        title="Resend invitation"
                        className="rounded-lg border border-[#DCDBD6] p-2 text-[#3E4349] hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-4 w-4 ${rowBusy ? "animate-spin" : ""}`} />
                      </button>
                    )}
                    {!member.is_account_admin && (member.status === "active" || member.status === "pending") && (
                      <button
                        type="button"
                        onClick={() => remove(member)}
                        disabled={rowBusy}
                        title="Remove user"
                        className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[#DCDBD6] bg-white">
        <div className="flex items-center gap-2 border-b border-[#E7E5E1] px-5 py-4">
          <Clock3 className="h-4 w-4 text-[#625143]" />
          <h2 className="m-0 text-base font-bold">Recent account-user activity</h2>
        </div>
        {(data.audits || []).length === 0 ? (
          <div className="p-6 text-sm text-[#3E4349]">No account-user changes recorded yet.</div>
        ) : (
          <div className="divide-y divide-[#E7E5E1]">
            {(data.audits || []).slice(0, 20).map((audit) => (
              <div key={audit.id} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <span className="font-semibold">{String(audit.action || "").replaceAll("_", " ")}</span>
                  <span className="text-[#3E4349]"> · {audit.target_email || "unknown user"}</span>
                  <div className="text-xs text-[#625143]">by {audit.actor_email || "system"}</div>
                </div>
                <div className="text-xs text-[#625143]">{displayDate(audit.occurred_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
