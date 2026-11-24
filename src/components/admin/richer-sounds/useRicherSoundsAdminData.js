import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Data hook for the Richer Sounds admin page. Calls the
 * readRicherSoundsAdmin, transferRicherSoundsCredits and
 * manageRicherSoundsOnboarding backend functions. The backend enforces that
 * the caller is a Sound Proof master admin or an active member of the
 * verified Custom Install - 93 account.
 */
export function useRicherSoundsAdminData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("readRicherSoundsAdmin", {});
      setData(res?.data || null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Unable to load Richer Sounds administration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const transfer = useCallback(async ({ destinationAccountId, amount, note }) => {
    const res = await base44.functions.invoke("transferRicherSoundsCredits", {
      action: "transfer",
      destination_account_id: destinationAccountId,
      amount,
      note: note || null,
    });
    const result = res?.data;
    if (!result || (result.state !== "completed" && result.state !== "partial")) {
      const err = new Error(result?.message || "Transfer failed.");
      err.code = result?.error || "TRANSFER_FAILED";
      throw err;
    }
    await reload();
    return result;
  }, [reload]);

  const resend = useCallback(async ({ accountId, membershipId }) => {
    const res = await base44.functions.invoke("manageRicherSoundsOnboarding", {
      action: "resend",
      account_id: accountId,
      membership_id: membershipId,
    });
    const result = res?.data;
    if (!result || result.sent !== true) {
      const err = new Error(result?.message || "Resend failed.");
      err.code = result?.error || "RESEND_FAILED";
      throw err;
    }
    await reload();
    return result;
  }, [reload]);

  return { data, loading, error, reload, transfer, resend };
}