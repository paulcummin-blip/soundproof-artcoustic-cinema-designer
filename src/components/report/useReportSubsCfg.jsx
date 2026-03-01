// Derives frontSubsCfg / rearSubsCfg for the RP22 Report.
// Falls back to app.subwoofers when cfg is missing/empty (cross-page navigation case).

export function useReportSubsCfg(app) {
    const safeArray = (v) => (Array.isArray(v) ? v : []);
    const safeObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

    const rawFront = safeObj(app?.frontSubsCfg);
    const rawRear = safeObj(app?.rearSubsCfg);

    const isUsable = (cfg) =>
        cfg && (Number(cfg.count) > 0 || (typeof cfg.model === "string" && cfg.model.trim().length > 0));

    const deriveFromSubs = (group) => {
        const subs = safeArray(app?.subwoofers).filter((s) => s?.group === group);
        if (!subs.length) return null;
        const model = String(subs[0]?.model || "").trim() || null;
        const positions = subs
            .map((s) => ({ x: Number(s?.position?.x ?? s?.x), y: Number(s?.position?.y ?? s?.y) }))
            .filter((p) => Number.isFinite(p.x));
        return { model, count: subs.length, positions };
    };

    const frontSubsCfg = isUsable(rawFront) ? rawFront : (deriveFromSubs("front") || rawFront);
    const rearSubsCfg = isUsable(rawRear) ? rawRear : (deriveFromSubs("rear") || rawRear);

    return { frontSubsCfg, rearSubsCfg };
}