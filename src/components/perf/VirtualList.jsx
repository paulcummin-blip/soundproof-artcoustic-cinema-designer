import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * VirtualList
 * - Dependency-free windowing for tall lists
 * - Supports variable row heights via ResizeObserver (if available)
 * - Props:
 *    items: any[]
 *    estimateHeight: number (px)
 *    overscan: number (rows above/below viewport)
 *    renderRow: ({ item, index, style }) => ReactNode
 *    className?: string
 *    keyExtractor?: (item, index) => string
 */
export default function VirtualList({
  items,
  estimateHeight = 260,
  overscan = 6,
  renderRow,
  className = "",
  keyExtractor,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  // height map + running offsets
  const heightsRef = useRef(new Map());   // index -> height
  const totalHeight = useMemo(() => {
    let h = 0;
    const n = items.length;
    for (let i = 0; i < n; i++) {
      h += heightsRef.current.get(i) ?? estimateHeight;
    }
    return h;
  }, [items.length, estimateHeight]);

  // index <-> offset helpers
  const offsetsRef = useRef([]);
  const recomputeOffsets = useCallback(() => {
    const n = items.length;
    const arr = new Array(n + 1);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      arr[i] = acc;
      acc += heightsRef.current.get(i) ?? estimateHeight;
    }
    arr[n] = acc;
    offsetsRef.current = arr;
  }, [items.length, estimateHeight]);

  useLayoutEffect(() => {
    recomputeOffsets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalHeight]);

  // viewport size + scroll tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // binary search for start index by scrollTop
  const findStart = useCallback((y) => {
    const arr = offsetsRef.current;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - 1);
  }, []);

  const startIndex = useMemo(() => findStart(scrollTop), [scrollTop, findStart]);
  const endIndex = useMemo(() => {
    const arr = offsetsRef.current;
    const maxY = scrollTop + viewportH;
    let i = startIndex;
    while (i < items.length && arr[i] < maxY) i++;
    return Math.min(items.length - 1, i + overscan);
  }, [items.length, startIndex, scrollTop, viewportH, overscan]);

  const first = Math.max(0, startIndex - overscan);
  const visible = useMemo(() => {
    const out = [];
    for (let i = first; i <= endIndex; i++) out.push(i);
    return out;
  }, [first, endIndex]);

  // row measurer (ResizeObserver per row)
  const rowRefs = useRef(new Map());
  const setRowRef = (index) => (node) => {
    if (!node) {
      rowRefs.current.delete(index);
      return;
    }
    rowRefs.current.set(index, node);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const h = Math.ceil(e.contentRect.height);
          if (heightsRef.current.get(index) !== h) {
            heightsRef.current.set(index, h);
          }
        }
      });
      ro.observe(node);
      // Cleanup on unmount or index change
      node.__ro = ro;
    } else {
      // Fallback: single read
      const h = Math.ceil(node.getBoundingClientRect().height);
      if (h > 0) heightsRef.current.set(index, h);
    }
  };

  useEffect(() => {
    // Cleanup observers
    return () => {
      rowRefs.current.forEach((node) => node.__ro && node.__ro.disconnect());
      rowRefs.current.clear();
    };
  }, []);

  // top spacer height = sum of rows before 'first'
  const topPad = useMemo(() => (offsetsRef.current[first] ?? 0), [first]);
  // bottom spacer height = total - (topPad + rendered block)
  const renderedBlockHeight = useMemo(() => {
    const arr = offsetsRef.current;
    const lastOffset = arr[endIndex + 1] ?? totalHeight;
    const firstOffset = arr[first] ?? 0;
    return Math.max(0, lastOffset - firstOffset);
  }, [first, endIndex, totalHeight]);

  const keyOf = keyExtractor || ((_, i) => String(i));

  return (
    <div
      ref={containerRef}
      className={className || "overflow-auto"}
      style={{ willChange: "transform" }}
    >
      <div style={{ height: topPad }} />
      <div style={{ position: "relative" }}>
        {visible.map((i) => {
          const top = (offsetsRef.current[i] ?? 0) - topPad;
          const style = { position: "absolute", top, left: 0, right: 0 };
          return (
            <div key={keyOf(items[i], i)} ref={setRowRef(i)} style={style}>
              {renderRow({ item: items[i], index: i, style: {} })}
            </div>
          );
        })}
      </div>
      <div style={{ height: Math.max(0, totalHeight - topPad - renderedBlockHeight) }} />
    </div>
  );
}