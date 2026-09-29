import React from "react";
import { RefreshCw, Search } from "lucide-react";
import { ACCESS_GROUPS, EMPTY_FILTERS } from "@/lib/commercial/accountAccessOverview";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "trial", label: "Trial" },
];

const GROUP_OPTIONS = [
  { value: "all", label: "All groups" },
  ...ACCESS_GROUPS.map((group) => ({ value: group.key, label: group.label })),
];

const CREDIT_OPTIONS = [
  { value: "all", label: "All credits" },
  { value: "available", label: "Credits available" },
  { value: "none", label: "No credits" },
  { value: "used", label: "Credits used" },
];

const USER_OPTIONS = [
  { value: "all", label: "Users: any" },
  { value: "has", label: "Has users" },
  { value: "none", label: "No users" },
];

const PROJECT_OPTIONS = [
  { value: "all", label: "Projects: any" },
  { value: "has", label: "Has projects" },
  { value: "none", label: "No projects" },
];

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-[#DCDBD6] bg-white px-2 text-sm text-[#1B1A1A] outline-none focus:border-[#213428]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Filter bar for the admin account-access page.
 * Props: filters, onChange(partialFilters), onReset, onRefresh, busy, shown, total
 */
export default function AccountAccessFilters({
  filters,
  onChange,
  onReset,
  onRefresh,
  busy = false,
  shown = 0,
  total = 0,
}) {
  const isDirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <section className="mb-6 rounded-xl border border-[#DCDBD6] bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#625143]">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#625143]" />
            <input
              value={filters.search}
              onChange={(event) => onChange({ search: event.target.value })}
              placeholder="Dealer or user email"
              className="h-9 w-full rounded-lg border border-[#DCDBD6] pl-9 pr-3 text-sm outline-none focus:border-[#213428]"
            />
          </span>
        </label>

        <FilterSelect
          label="Group"
          value={filters.group}
          options={GROUP_OPTIONS}
          onChange={(value) => onChange({ group: value })}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(value) => onChange({ status: value })}
        />
        <FilterSelect
          label="Credits"
          value={filters.credits}
          options={CREDIT_OPTIONS}
          onChange={(value) => onChange({ credits: value })}
        />
        <FilterSelect
          label="Users"
          value={filters.users}
          options={USER_OPTIONS}
          onChange={(value) => onChange({ users: value })}
        />
        <FilterSelect
          label="Projects"
          value={filters.projects}
          options={PROJECT_OPTIONS}
          onChange={(value) => onChange({ projects: value })}
        />

        <div className="flex items-center gap-2 pb-0.5">
          {isDirty && (
            <button
              type="button"
              onClick={onReset}
              className="h-9 rounded-lg border border-[#DCDBD6] px-3 text-xs font-semibold text-[#3E4349] hover:bg-slate-50"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            title="Reload accounts"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#DCDBD6] px-3 text-xs font-semibold text-[#3E4349] hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Reload
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-[#625143]">
        Showing {shown} of {total} account{total !== 1 ? "s" : ""}
      </div>
    </section>
  );
}