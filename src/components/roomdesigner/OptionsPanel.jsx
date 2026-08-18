import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppState } from "@/components/AppStateProvider";

const formatPrice = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value || 0));

const emptyManualItem = () => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  description: '',
  quantity: 1,
  unitPriceExVat: '',
});

// Reusable report-style section card. Warm-neutral surface, subtle border,
// restrained uppercase group label. Optional action slot sits in the header.
const SectionCard = ({ title, children, action }) => (
  <div className="rounded-lg border border-[#DCDBD6] bg-white">
    <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#625143]">{title}</div>
      {action}
    </div>
    <div className="px-4 pb-3">{children}</div>
  </div>
);

// Reusable toggle row — label left, toggle right, consistent row height.
const ToggleRow = ({ id, label, checked, onChange }) => (
  <div className="flex items-center justify-between py-2">
    <Label htmlFor={id} className="text-sm text-[#1B1A1A]">{label}</Label>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);

export default function OptionsPanel({
  showPrices,
  setShowPrices,
  showAsdr,
  setShowAsdr,
  difficultyMultiplier,
  setDifficultyMultiplier,
  priceData,
  priceMode = 'incVat',
  setPriceMode = () => {},
  manualExtras = [],
  setManualExtras = () => {},
  soundbarSelections = {},
  setSoundbarSelections = () => {},
  acousticTreatmentEnabled = false,
  setAcousticTreatmentEnabled = () => {},
  selectedAbfuserQty = 0,
  setSelectedAbfuserQty = () => {},
  recommendedAbfuserQty = 0,
}) {
  const [showDifficultyRating, setShowDifficultyRating] = React.useState(false);

  // Source authority from app state — distinguishes auto-seeded ("recommended")
  // from designer-manually-set ("user"). When "recommended", the selected
  // quantity auto-follows recommendation changes. When "user", the designer's
  // manual override is preserved.
  const { abfuserQtySource, setAbfuserQtySource } = useAppState() || {};

  const handleAcousticTreatmentToggle = (nextEnabled) => {
    setAcousticTreatmentEnabled(nextEnabled);
  };

  // Auto-follow: when source is "recommended" (or legacy/null) and the
  // recommendation changes, update selectedAbfuserQty to match. This covers
  // both initial seeding (qty 0 → recommended) and recommendation changes
  // (old recommended → new recommended). When source is "user", the
  // designer's manual override is preserved.
  React.useEffect(() => {
    if (!acousticTreatmentEnabled || recommendedAbfuserQty <= 0) return;
    if (abfuserQtySource === "user") return;
    if (selectedAbfuserQty !== recommendedAbfuserQty) {
      setSelectedAbfuserQty(recommendedAbfuserQty);
    }
  }, [acousticTreatmentEnabled, selectedAbfuserQty, recommendedAbfuserQty, abfuserQtySource]);

  // Pricing is calculated once in RoomDesigner and passed to every surface.
  // This panel only edits canonical pricing inputs; it never creates a second
  // calculation or publishes a competing partial snapshot.
  const activePriceData = priceData;
  const priceListAvailable = activePriceData?.priceListAvailable !== false;

  const updateManualItem = (id, patch) => {
    setManualExtras((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeManualItem = (id) => {
    setManualExtras((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-4 p-4">
      {/* 1. DISPLAY OPTIONS */}
      <SectionCard title="Display Options">
        <div className="divide-y divide-[#EEEDEA]">
          <ToggleRow id="show-prices" label="Show Prices" checked={showPrices} onChange={setShowPrices} />
          <ToggleRow id="show-asdr" label="Show Artcoustic System Design Rating" checked={showAsdr} onChange={setShowAsdr} />
        </div>
      </SectionCard>

      {/* 2. ACOUSTIC TREATMENT */}
      <SectionCard title="Acoustic Treatment">
        <div className="divide-y divide-[#EEEDEA]">
          <ToggleRow
            id="acoustic-treatment"
            label="Acoustic Treatment"
            checked={acousticTreatmentEnabled}
            onChange={handleAcousticTreatmentToggle}
          />
        </div>
        {acousticTreatmentEnabled ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-xs text-[#625143]">
              Recommended: {recommendedAbfuserQty} × Artcoustic Abfuser
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="abfuser-qty" className="text-xs font-medium text-[#3E4349] whitespace-nowrap">Quantity</Label>
              <input
                id="abfuser-qty"
                type="number"
                min="0"
                step="1"
                value={selectedAbfuserQty}
                onChange={(e) => {
                  setSelectedAbfuserQty(parseInt(e.target.value, 10) || 0);
                  setAbfuserQtySource("user");
                }}
                className="w-20 px-2 py-1 border border-[#DCDBD6] rounded text-xs bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-[#8B7F76]">Not included</div>
        )}
      </SectionCard>

      {showPrices && activePriceData && (
        <>
          {/* 3. PRICE SUMMARY */}
          <SectionCard
            title="Price Summary"
            action={
              <div className="flex items-center gap-2">
                <Label htmlFor="price-display" className="text-[11px] text-[#625143] whitespace-nowrap">Price display</Label>
                <select
                  id="price-display"
                  value={priceMode}
                  onChange={(e) => setPriceMode(e.target.value)}
                  className="text-xs px-2 py-1 border border-[#DCDBD6] rounded bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
                >
                  <option value="exVat">Ex VAT</option>
                  <option value="incVat">Inc VAT</option>
                </select>
              </div>
            }
          >
            {priceListAvailable ? (
              <div>
                <div className="text-xs text-[#625143]">
                  System Price{priceMode === 'incVat' ? ', inc VAT' : ', ex VAT'}
                </div>
                <div className="text-2xl font-bold text-[#213428] mt-1">
                  {formatPrice(activePriceData.displayTotal ?? activePriceData.finalTotal)}
                </div>
                {activePriceData.difficultyMultiplier !== 1.0 && (
                  <div className="text-xs text-[#625143] mt-1">
                    Base {formatPrice(activePriceData.baseTotal)} × {activePriceData.difficultyMultiplier.toFixed(2)}
                  </div>
                )}
                {priceMode === 'incVat' && (
                  <div className="text-xs text-[#625143] mt-1">
                    VAT {formatPrice(activePriceData.vatAmount)} included
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-[#625143] py-1">
                Price list not available for {activePriceData.territoryLabel}
              </div>
            )}
          </SectionCard>

          {/* 4. SELECTED PRODUCT BREAKDOWN */}
          <SectionCard title="Selected Product Breakdown">
            <div className="border border-[#EEEDEA] rounded-md overflow-hidden">
              <div className="grid grid-cols-[1fr_42px_76px_82px] gap-2 bg-[#F8F8F7] px-3 py-2 text-[10px] font-semibold tracking-[0.04em] uppercase text-[#625143]">
                <div>Description</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Unit</div>
                <div className="text-right">Total</div>
              </div>
              {(activePriceData.breakdown || []).length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#8B7F76]">No priced products selected.</div>
              ) : (
                (activePriceData.breakdown || []).map((line, index) => {
                  const soundbarOptions = (activePriceData?.soundbarOptions || {})[line.model] || null;
                  return (
                    <div key={`${line.model}-${line.sizeValue || 'fixed'}-${index}`} className="grid grid-cols-[1fr_42px_76px_82px] gap-2 px-3 py-2 border-t border-[#EEEDEA] text-xs items-start">
                      <div className="min-w-0">
                        <div className="font-medium text-[#213428] truncate">{line.description}</div>
                        {soundbarOptions && (
                          <select
                            value={soundbarSelections[line.model] || line.sizeValue || soundbarOptions[0]?.value}
                            onChange={(e) => setSoundbarSelections((prev) => ({ ...prev, [line.model]: e.target.value }))}
                            className="mt-1 w-full text-[11px] px-2 py-1 border border-[#DCDBD6] rounded bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
                          >
                            {soundbarOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        )}
                        {line.note && <div className="text-[11px] text-amber-700 mt-1">{line.note}</div>}
                      </div>
                      <div className="text-right text-[#3E4349]">{line.qty ?? line.count}</div>
                      <div className="text-right text-[#3E4349]">{priceListAvailable ? (line.displayUnitPrice != null ? formatPrice(line.displayUnitPrice) : '—') : '—'}</div>
                      <div className="text-right font-medium text-[#1B1A1A]">{priceListAvailable ? (line.displaySubtotal != null ? formatPrice(line.displaySubtotal) : '—') : '—'}</div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>

          {/* 5. MANUAL EXTRAS */}
          {priceListAvailable && (
            <SectionCard
              title="Manual Extras"
              action={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDifficultyRating((value) => !value)}
                    className="text-[10px] px-2 py-1 rounded border border-[#DCDBD6] bg-white text-[#625143] hover:bg-[#F8F8F7]"
                  >
                    DR
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualExtras((items) => [...items, emptyManualItem()])}
                    className="text-xs px-2 py-1 rounded border border-[#DCDBD6] bg-white text-[#213428] hover:bg-[#F8F8F7]"
                  >
                    Add manual item
                  </button>
                </div>
              }
            >
              {manualExtras.length > 0 ? (
                <div className="space-y-2">
                  {manualExtras.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_56px_92px_auto] gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Category / item"
                        value={item.description}
                        onChange={(e) => updateManualItem(item.id, { description: e.target.value })}
                        className="px-2 py-1 border border-[#DCDBD6] rounded text-xs bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
                      />
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => updateManualItem(item.id, { quantity: e.target.value })}
                        className="px-2 py-1 border border-[#DCDBD6] rounded text-xs bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit £"
                        value={item.unitPriceExVat}
                        onChange={(e) => updateManualItem(item.id, { unitPriceExVat: e.target.value })}
                        className="px-2 py-1 border border-[#DCDBD6] rounded text-xs bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
                      />
                      <button
                        type="button"
                        onClick={() => removeManualItem(item.id)}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 bg-white hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#8B7F76]">No manual extras added.</div>
              )}
            </SectionCard>
          )}
        </>
      )}

      {/* Difficulty Rating — secondary, revealed by DR */}
      {showDifficultyRating && priceListAvailable && (
        <SectionCard title="Difficulty Rating">
          <div className="text-xs text-[#625143] mb-2">
            Multiplies hardware prices to reflect installation difficulty (1.00 = baseline)
          </div>
          <input
            id="difficulty"
            type="number"
            step="0.01"
            value={difficultyMultiplier.toFixed(2)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (Number.isFinite(val) && val > 0) setDifficultyMultiplier(Math.round(val * 100) / 100);
            }}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isFinite(val) || val <= 0) setDifficultyMultiplier(1.0);
            }}
            className="w-full px-3 py-2 border border-[#DCDBD6] rounded-md text-sm bg-white text-[#1B1A1A] focus:outline-none focus:ring-1 focus:ring-[#213428]"
          />
        </SectionCard>
      )}

      {/* PROPOSAL & PRICE LIST — future integration placeholder (disabled) */}
      <div className="rounded-lg border border-dashed border-[#DCDBD6] bg-[#F8F8F7] px-4 py-3">
        <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#625143]">Proposal &amp; Price List</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="text-xs text-[#8B7F76]">Send this Sound Proof system to the dealer proposal tool.</div>
          <button
            type="button"
            disabled
            className="text-xs px-3 py-1.5 rounded border border-[#DCDBD6] bg-white text-[#8B7F76] cursor-not-allowed opacity-70"
          >
            Send to Proposal
          </button>
        </div>
      </div>
    </div>
  );
}