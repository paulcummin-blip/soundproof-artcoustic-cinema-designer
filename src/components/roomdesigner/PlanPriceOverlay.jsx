export default function PlanPriceOverlay({ show, finalTotal }) {
  if (!show || !(Number(finalTotal) > 0)) return null;
  return (
    <div className="absolute bottom-4 left-4 z-20 bg-white border border-[#DCDBD6] rounded-xl px-4 py-3 shadow-md pointer-events-none">
      <div className="text-xs text-gray-500 mb-0.5">System price, ex VAT</div>
      <div className="text-xl font-semibold text-[#213428]">
        £{Math.round(finalTotal).toLocaleString('en-GB')}
      </div>
    </div>
  );
}