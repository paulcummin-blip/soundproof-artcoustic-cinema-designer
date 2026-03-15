import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getLevelColors } from '@/components/utils/rp22Colors';
import { safeNum } from '@/components/utils/splMath';

const P12_THRESHOLDS_REC = { L1: 102, L2: 105, L3: 108, L4: 111 };
const P12_THRESHOLDS_MIN = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_REC = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_MIN = { L1: 96, L2: 99, L3: 102, L4: 105 };

export { P12_THRESHOLDS_REC, P12_THRESHOLDS_MIN, P13_THRESHOLDS_REC, P13_THRESHOLDS_MIN };

export function computeRP22Level(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return 'FAIL';
}

export function RP22LevelPill({ parameter, level, label }) {
  const colors = getLevelColors(level);
  return (
    <div style={{
      marginTop: 12, padding: '8px 16px', borderRadius: 8,
      border: `1px solid ${colors.border || '#E6E4DD'}`, background: colors.bg,
      display: 'inline-block', width: '100%',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
        {label}: {typeof level === 'number' && level >= 1 ? `Level ${level}` : 'FAIL'}
      </div>
    </div>
  );
}

export function useStickyDb(rawValue, opts = {}) {
  const windowSize = opts.windowSize ?? 9;
  const alpha = opts.alpha ?? 0.35;
  const upMargin = opts.upMargin ?? 0.40;
  const downMargin = opts.downMargin ?? 0.60;
  const upConsecutive = opts.upConsecutive ?? 2;
  const downConsecutive = opts.downConsecutive ?? 3;

  const bufRef = useRef([]);
  const smoothRef = useRef(0);
  const shownRef = useRef(0);
  const upCountRef = useRef(0);
  const downCountRef = useRef(0);
  const [currentMedian, setCurrentMedian] = useState(0);

  useEffect(() => {
    const b = bufRef.current;
    if (Number.isFinite(rawValue)) b.push(rawValue);
    if (b.length > windowSize) b.shift();
    const sortedBuffer = b.slice().sort((a, b) => a - b);
    const n = sortedBuffer.length;
    let newMedian = 0;
    if (n > 0) {
      const mid = Math.floor(n / 2);
      newMedian = n % 2 ? sortedBuffer[mid] : (sortedBuffer[mid - 1] + sortedBuffer[mid]) / 2;
    }
    setCurrentMedian(newMedian);
  }, [rawValue, windowSize]);

  const smoothed = useMemo(() => {
    if (!Number.isFinite(rawValue)) { smoothRef.current = 0; return 0; }
    const prev = smoothRef.current;
    const next = (prev === 0 && currentMedian === 0) ? 0 : (prev === 0 ? currentMedian : (alpha * currentMedian + (1 - alpha) * prev));
    smoothRef.current = next;
    return next;
  }, [currentMedian, alpha, rawValue]);

  const candidate = useMemo(() => Math.ceil(smoothed), [smoothed]);

  useEffect(() => {
    const currentShown = shownRef.current;
    if (!Number.isFinite(rawValue) || smoothed === 0) {
      if (shownRef.current !== 0) shownRef.current = 0;
      upCountRef.current = 0; downCountRef.current = 0; return;
    }
    if (smoothed >= (currentShown + 1) + upMargin) {
      upCountRef.current += 1;
      if (upCountRef.current >= upConsecutive) {
        shownRef.current = Math.max(currentShown + 1, candidate);
        upCountRef.current = 0; downCountRef.current = 0;
      }
    } else { upCountRef.current = 0; }
    if (smoothed <= (currentShown - 1) - downMargin) {
      downCountRef.current += 1;
      if (downCountRef.current >= downConsecutive) {
        shownRef.current = Math.min(currentShown - 1, candidate);
        downCountRef.current = 0; upCountRef.current = 0;
      }
    } else { downCountRef.current = 0; }
  }, [smoothed, candidate, upMargin, downMargin, upConsecutive, downConsecutive, rawValue]);

  return shownRef.current;
}

function rp22P12Level(db) {
  if (!db || db <= 102) return 1;
  if (db <= 105) return 2;
  if (db <= 108) return 3;
  return 4;
}

function rp22P13Level(db) {
  if (!db || db <= 99) return 1;
  if (db <= 102) return 2;
  if (db <= 105) return 3;
  if (db <= 108) return 4;
  return 4;
}

const splCardStyles = {
  card: { border: "1px solid #E6E4DD", borderRadius: 12, padding: 16, background: "#fff" },
  title: { fontSize: 16, lineHeight: "22px", color: "#3E4349", marginBottom: 6 },
  value: { fontSize: 40, lineHeight: "40px", fontWeight: 700, color: "#1B1A1A" },
  foot: { fontSize: 12, lineHeight: "16px", color: "#61656B", marginTop: 6 },
  boldFoot: { fontSize: 12, lineHeight: "16px", color: "#1B1A1A", marginTop: 6, fontWeight: 700 },
};

function prettyChannel(ch) {
  const m = {
    FL: "Front Left", FR: "Front Right", FC: "Front Center",
    SL: "Side Left", SR: "Side Right",
    SBL: "Rear Left", SBR: "Rear Right",
    LW: "Front Wide Left", RW: "Front Wide Right",
    TFL: "Top Front Left", TFR: "Top Front Right",
    TL: "Top Middle Left", TR: "Top Middle Right",
    TBL: "Top Back Left", TBR: "Top Back Right",
  };
  return m[String(ch).toUpperCase()] || ch;
}

export function SplBox({ channel, rawDb }) {
  const fullDb = useStickyDb(rawDb);
  const displayDb = Math.max(0, fullDb - 6);
  const level = rp22P12Level(displayDb);
  return (
    <div style={splCardStyles.card}>
      <div style={splCardStyles.title}>{prettyChannel(channel)}</div>
      <div style={splCardStyles.value}>{displayDb > 0 ? `${displayDb} dB` : '—'}</div>
      <div style={splCardStyles.foot}>Maximum SPL @ MLP: {fullDb > 0 ? `${fullDb} dB` : '—'}</div>
      <div style={splCardStyles.boldFoot}>RP22 P12 Level {level > 0 ? level : "—"}</div>
      <div style={splCardStyles.foot}>
        12. Screen speakers SPL capability at Reference Seating Position (RSP) (<span style={{ fontWeight: 700 }}>post calibration EQ</span>, within assigned bandwidth)
        without clipping — dB SPL (C). Thresholds: L1 102, L2 105, L3 108, L4 111
      </div>
    </div>
  );
}

export function SplBoxP13({ title, rawDbFull }) {
  const fullDb = useStickyDb(rawDbFull);
  const displayDb = Math.max(0, fullDb - 6);
  const level = rp22P13Level(displayDb);
  return (
    <div style={splCardStyles.card}>
      <div style={splCardStyles.title}>{title}</div>
      <div style={splCardStyles.value}>{displayDb > 0 ? `${displayDb} dB` : '—'}</div>
      <div style={splCardStyles.foot}>Maximum SPL @ RSP: {fullDb > 0 ? `${fullDb} dB` : '—'}</div>
      <div style={splCardStyles.boldFoot}>RP22 P13 Level {level > 0 ? level : "—"}</div>
    </div>
  );
}