// Handles the three SVG→PNG capture effects for RP22 report export.
import { useEffect } from 'react';

function captureOnePlan({ selector, isPrinting, imageDataUrl, setImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture, label }) {
    if (!isPrinting || imageDataUrl !== null) return () => {};

    setExportStatus(`Capturing ${label}: waiting for SVG…`);
    let attempts = 0;
    const maxAttempts = 20;
    let retryTimer = null;

    const drawDebugOverlay = (ctx, canvasW, canvasH, info, enabled) => {
        if (!enabled) return;
        const lines = [`PLAN: ${info.planLabel}`, `SRC: ${info.baseRectSource}`, `bbox: ${Math.round(info.contentBbox?.width||0)}x${Math.round(info.contentBbox?.height||0)}`];
        ctx.font = '12px monospace';
        const boxW = 260, boxH = lines.length * 16 + 20;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(20, canvasH - boxH - 20, boxW, boxH);
        ctx.fillStyle = '#FFF'; ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, 30, canvasH - boxH - 10 + i * 16));
    };

    const attemptCapture = async () => {
        attempts++;
        try {
            const planEl = document.querySelector(selector);
            if (!planEl) { if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; } setImageDataUrl('__SKIP__'); return; }
            const svgEl = planEl.querySelector('svg');
            if (!svgEl) { if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; } setImageDataUrl('__SKIP__'); return; }

            const anchor = svgEl.querySelector('#export-crop-bounds') || svgEl.querySelector('#export-bounds');
            if (!anchor) { if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; } setImageDataUrl('__SKIP__'); return; }

            try { const b = anchor.getBBox?.(); if (b && (b.width < 200 || b.height < 200)) { if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; } setImageDataUrl('__SKIP__'); return; } } catch(e) {}

            const svgClone = svgEl.cloneNode(true);
            svgClone.style.opacity = '1';
            // Strip viewport transforms
            try {
                let node = (svgClone.querySelector('#export-crop-bounds') || svgClone.querySelector('#export-bounds'))?.parentNode;
                while (node && node.nodeName?.toLowerCase() !== 'svg') {
                    if (node.nodeName?.toLowerCase() === 'g') { node.removeAttribute('transform'); node.removeAttribute('clip-path'); if (node.style) { node.style.transform = 'none'; node.style.clipPath = 'none'; } }
                    node = node.parentNode;
                }
            } catch(e) {}

            // Measure bbox
            let bbox = null;
            try {
                let host = document.createElement('div');
                host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0';
                document.body.appendChild(host); host.appendChild(svgClone);
                const el = svgClone.querySelector('#export-content-bounds');
                if (el) { const b = el.getBBox(); if (b && b.width > 0 && b.height > 0) bbox = { x: b.x, y: b.y, width: b.width, height: b.height }; }
                if (host.parentNode) host.parentNode.removeChild(host);
            } catch(e) {}

            const cropEl = svgClone.querySelector('#export-crop-bounds');
            const cropRect = cropEl ? { x: +cropEl.getAttribute('x'), y: +cropEl.getAttribute('y'), width: +cropEl.getAttribute('width'), height: +cropEl.getAttribute('height') } : null;
            const base = (bbox && bbox.width > 0) ? bbox : cropRect;
            if (!base || !Number.isFinite(base.width) || base.width <= 0) { if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); return; } setImageDataUrl('__SKIP__'); return; }

            const BUF = 80;
            const vbX = base.x - BUF, vbY = base.y - BUF, vbW = base.width + 2*BUF, vbH = base.height + 2*BUF;
            svgClone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
            svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgClone.removeAttribute('width'); svgClone.removeAttribute('height');

            const svgStr = new XMLSerializer().serializeToString(svgClone);
            const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
            const img = new Image(); img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 3000; canvas.height = Math.round(3000 * vbH / vbW);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                drawDebugOverlay(ctx, canvas.width, canvas.height, { planLabel: label, baseRectSource: (bbox && bbox.width > 0) ? 'bbox' : 'cropRect', contentBbox: bbox }, debugPlanCapture);
                setImageDataUrl(canvas.toDataURL('image/png'));
                setExportStatus(`${label} captured`);
                URL.revokeObjectURL(url);
            };
            img.onerror = () => { if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); } else { setImageDataUrl('__SKIP__'); } URL.revokeObjectURL(url); };
            img.src = url;
        } catch(err) {
            if (attempts < maxAttempts) { retryTimer = setTimeout(attemptCapture, 100); }
            else { setExportStatus(`${label} failed`); if (exportTimeoutRef?.current) { clearTimeout(exportTimeoutRef.current); exportTimeoutRef.current = null; } if (exportGuardRef?.current) exportGuardRef.current.active = false; setIsPrinting(false); setTimeout(() => window.print(), 250); }
        }
    };
    attemptCapture();
    return () => { if (retryTimer) clearTimeout(retryTimer); };
}

export function usePlanCapture({ isPrinting, planImageDataUrl, setPlanImageDataUrl, planDimsImageDataUrl, setPlanDimsImageDataUrl, planSpeakerDimsImageDataUrl, setPlanSpeakerDimsImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture }) {
    useEffect(() => captureOnePlan({ selector: '[data-plan-capture]', isPrinting, imageDataUrl: planImageDataUrl, setImageDataUrl: setPlanImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture, label: 'CLEAN' }), [isPrinting, planImageDataUrl]);
    useEffect(() => captureOnePlan({ selector: '[data-plan-capture-dims]', isPrinting, imageDataUrl: planDimsImageDataUrl, setImageDataUrl: setPlanDimsImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture, label: 'DIMS' }), [isPrinting, planDimsImageDataUrl]);
    useEffect(() => captureOnePlan({ selector: '[data-plan-capture-speaker-dims]', isPrinting, imageDataUrl: planSpeakerDimsImageDataUrl, setImageDataUrl: setPlanSpeakerDimsImageDataUrl, setExportStatus, exportTimeoutRef, exportGuardRef, setIsPrinting, debugPlanCapture, label: 'SPEAKER' }), [isPrinting, planSpeakerDimsImageDataUrl]);
}