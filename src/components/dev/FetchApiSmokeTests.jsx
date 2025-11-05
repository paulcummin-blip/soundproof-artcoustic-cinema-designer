import { fetchApi } from "@/components/net/api";

if (typeof window !== "undefined") {
  (async () => {
    try {
      // 1) Happy-ish path (structure or controlled error OK)
      const ok = await fetchApi("/entities/Project?limit=1");
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(`[Smoke] Happy path -> ok:${ok.ok} status:${ok.status}`);

      // 2) Timeout / network failure path (non-routable IP)
      const bad = await fetchApi("https://10.255.255.1/timeout-test", { method: "GET" });
      window.__APP_DEBUG.push(`[Smoke] Timeout path -> ok:${bad.ok} error:${bad.error}`);

      // 3) JSON parse error path (fetch text endpoint)
      const txt = await fetchApi("https://example.com/", { method: "GET" });
      window.__APP_DEBUG.push(`[Smoke] JSON parse path -> ok:${txt.ok} error:${txt.error}`);
    } catch (e) {
      window.__APP_DEBUG?.push(`[Smoke] Exception: ${e?.message || e}`);
    }
  })();
}