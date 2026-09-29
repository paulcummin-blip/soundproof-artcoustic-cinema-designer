import React from "react";
import { ShieldCheck, Users } from "lucide-react";
import AccessPill from "@/components/admin/access/AccessPill";
import { formatDate } from "@/lib/commercial/accountAccessOverview";

const STATUS_TONES = {
  active: "ok",
  pending: "warn",
  suspended: "danger",
  removed: "muted",
};

function memberStatusTone(member) {
  return STATUS_TONES[member?.status || "pending"] || "muted";
}

function identityFor(row, member) {
  if (!member?.user_id) return null;
  return (row.portalIdentities || []).find((identity) => identity.base44_user_id === member.user_id) || null;
}

function userFor(row, member) {
  if (!member?.user_id) return null;
  return (row.users || []).find((user) => user.id === member.user_id) || null;
}

/**
 * Users, membership state, Portal identity and dealer-field stamps for one account.
 * Props: row
 */
export default function AccountDrawerMembers({ row }) {
  const members = row?.members || [];

  return (
    <section className="rounded-xl border border-[#DCDBD6] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E7E5E1] px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#625143]" />
          <h3 className="m-0 text-sm font-bold text-[#1B1A1A]">Users &amp; membership</h3>
        </div>
        <span className="rounded-full border border-[#DCDBD6] px-2.5 py-0.5 text-[11px] font-semibold text-[#213428]">
          {row.seatsUsed} of {row.seatsMaximum} logins
        </span>
      </div>

      {members.length === 0 ? (
        <div className="px-4 py-5 text-[13px] text-[#3E4349]">
          No users on this account yet.
        </div>
      ) : (
        <div className="divide-y divide-[#EDEBE7]">
          {members.map((member) => {
            const identity = identityFor(row, member);
            const user = userFor(row, member);
            const dealerName = user?.dealer_name || null;
            const dealerId = user?.dealer_account_id || null;

            return (
              <div key={member.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#1B1A1A]">
                    {member.full_name || member.email || "Pending user"}
                  </span>
                  {member.is_account_admin && (
                    <span title="Account administrator" className="inline-flex">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#213428]" />
                    </span>
                  )}
                  <AccessPill label={member.status || "pending"} tone={memberStatusTone(member)} />
                  <span className="rounded-full border border-[#DCDBD6] bg-[#F7F7F5] px-2.5 py-0.5 text-[11px] font-semibold text-[#3E4349]">
                    {member.access_label || member.access_level || "—"}
                  </span>
                </div>

                {member.full_name && (
                  <div className="mt-0.5 truncate text-[11px] text-[#625143]">{member.email || "—"}</div>
                )}

                <div className="mt-2 grid gap-1 text-[11px] text-[#625143] sm:grid-cols-2">
                  <div>
                    Membership:{" "}
                    <span className="font-semibold text-[#3E4349]">
                      {member.status === "active" && member.accepted_at ? "claimed" : member.status || "pending"}
                    </span>
                    {member.accepted_at ? ` · ${formatDate(member.accepted_at)}` : ""}
                  </div>
                  <div>
                    Invited:{" "}
                    <span className="font-semibold text-[#3E4349]">{formatDate(member.invited_at)}</span>
                  </div>
                  <div>
                    Base44 user:{" "}
                    <span className={member.user_id ? "font-semibold text-[#3E4349]" : "font-semibold text-[#7A5B22]"}>
                      {member.user_id ? "associated" : "not associated"}
                    </span>
                  </div>
                  <div>
                    Portal identity:{" "}
                    <span className={identity ? "font-semibold text-[#3E4349]" : "font-semibold text-[#7A5B22]"}>
                      {identity ? identity.account_name || "linked" : "missing"}
                    </span>
                    {identity?.last_verified_at ? ` · ${formatDate(identity.last_verified_at)}` : ""}
                  </div>
                  <div className="sm:col-span-2">
                    Dealer fields:{" "}
                    <span className={(dealerName || dealerId) ? "font-semibold text-[#3E4349]" : "font-semibold text-[#7A5B22]"}>
                      {(dealerName || dealerId)
                        ? `${dealerName || "unnamed dealer"}${dealerId ? ` · ${dealerId}` : ""}`
                        : "missing"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="border-t border-[#EDEBE7] px-4 py-2.5 text-[11px] text-[#625143]">
        Per-user last login is not recorded by the platform; the account-level last login is shown above.
      </p>
    </section>
  );
}