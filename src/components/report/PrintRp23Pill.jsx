/**
 * PrintRp23Pill.jsx — thin wrapper around the canonical RP22GradingPill.
 * Report / print-optimised variant.  Semantic colours come from the same
 * RP22_GRADE_TOKENS authority as the app pill — only the size context differs.
 */
import RP22GradingPill from "@/components/ui/RP22GradingPill";

export default function PrintRp23Pill({ level }) {
  return <RP22GradingPill level={level} variant="report" />;
}