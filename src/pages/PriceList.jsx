import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";

const VAT_RATE = 0.2;
const CATEGORIES = ["All", "Loudspeaker", "Subwoofer", "Amplifier", "Acoustic Treatment", "Accessory"];

function money(value) {
  if (value === null || value === undefined || value === "") return "Price on request";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price on request";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function PriceList() {
  const [records, setRecords] = useState(null);
  const [territory, setTerritory] = useState("UK");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      const response = await base44.functions.invoke("getAuthorizedProductPrices", {});
      setRecords(Array.isArray(response?.data?.prices) ? response.data.prices : []);
      setTerritory(response?.data?.territory || "UK");
    } catch (err) {
      setRecords([]);
      setError(
        err?.response?.data?.error
        || err?.data?.error
        || err?.message
        || "The price list could not be loaded."
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = (records || [])
      .filter((item) => item.active !== false)
      .filter((item) => category === "All" || item.category === category)
      // Suppress internal "(Surround)" display variants — same physical
      // product as the base row. Internal SKUs remain available to Sound
      // Proof for speaker-role logic, CAD mapping, and product matching.
      .filter((item) => !/\s\(Surround\)\s*$/.test(String(item.label || "")))
      .filter((item) => !query
        || String(item.label || "").toLowerCase().includes(query)
        || String(item.sku || "").toLowerCase().includes(query))
      .sort((a, b) => {
        const categoryDifference = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
        return categoryDifference || String(a.label || "").localeCompare(String(b.label || ""));
      });
    return visible;
  }, [records, search, category]);

  return (
    <div className="min-h-screen bg-[rgb(248,248,247)] p-6 text-[#1B1A1A]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-bold">Price List</h1>
            <p className="mt-1 text-sm text-[#3E4349]">
              Current {territory} retail pricing.
            </p>
          </div>
          {records && <div className="text-sm text-[#625143]">{filtered.length} products</div>}
        </div>

        <div className="mb-5 grid gap-3 rounded-xl border border-[#DCDBD6] bg-white p-4 sm:grid-cols-[1fr_240px]">
          <label className="relative block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#625143]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product"
              className="w-full rounded-lg border border-[#DCDBD6] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#213428]"
            />
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-[#DCDBD6] bg-white px-3 py-2 text-sm outline-none focus:border-[#213428]"
          >
            {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            {error}
            <button onClick={load} className="ml-3 font-semibold underline">Try again</button>
          </div>
        ) : records === null ? (
          <div className="py-16 text-center text-sm text-[#3E4349]">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Loading prices…
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#DCDBD6] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-[rgb(244,243,241)] text-left text-[11px] uppercase tracking-wider text-[#625143]">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Ex VAT</th>
                    <th className="px-4 py-3 text-right">Inc VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id || item.sku} className="border-t border-[#E7E5E1]">
                      <td className="px-4 py-3 text-sm font-semibold">{item.label || "Unnamed product"}</td>
                      <td className="px-4 py-3 text-sm text-[#3E4349]">{item.category || "—"}</td>
                      <td className="px-4 py-3 text-right text-sm">{money(item.price_ex_vat)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">
                        {item.price_ex_vat == null ? "Price on request" : money(Number(item.price_ex_vat) * (1 + VAT_RATE))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-[#3E4349]">No matching products.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}