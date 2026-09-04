# P19 Lower-Edge Failure Audit — Reference-Path Investigation

**Question:** Why does P19 still fail by roughly 6–8 dB at or immediately above the achieved P18 cutoff?

**Answer:** The production P19/P20 computation path (`useRP22AnalysisEngine.jsx`) is missing the `lowerHz` parameter, causing it to measure deviation across `[0 → transition]` instead of `[achieved P18 F3 → transition]`. This penalises the extension roll-off twice — P18 declares the -3 dB extension, then P19 measures the full roll-off below that point as a deviation. The canonical path does NOT have this bug.

---

## The Two P19 Computation Paths

### Path 1: Canonical Authority (CORRECT)

```
canonicalBassAuthorityEvaluation.js
  → computeInRoomF3FromResponseCurve()     [60–200 Hz median, METHOD A]
  → achievedP18FrequencyHz = F3
  → resolveBassAssessmentBand({ p14Pass, achievedP18Hz, transitionHz })
      → band = [achievedP18Hz → transitionHz]     ← bounded below by P18 F3
  → computeOfficialP19Assessment({
      rspPostEqCurve,
      canonicalTargetCurve: T(f),            ← practical calibration target (house curve)
      assessmentStartHz: P18 F3,              ← lower bound = P18 F3
      assessmentEndHz: transition
    })
```

The canonical path:
- Bounds P19 to `[P18 F3 → transition]` — **excludes the roll-off region below F3**
- Uses the practical calibration target T(f) as the reference — **T(f) rolls off at LF, matching the natural response shape**
- Uses the 60–200 Hz median for P18 (METHOD A)

### Path 2: Production Engine (BUGGY)

```
useRP22AnalysisEngine.jsx  (line 980)
  → computeParam18BassExtension()           [60–200 Hz median, METHOD A]
  → bassP18.value = F3
  → computeParam19Deviation(finalRspBassCurve, transitionHz)
                                                    ↑ lowerHz NOT PASSED ← BUG
  → computeParam20SeatConsistency({ rspResponse, perSeatResponses, transitionHz, rspSeatId })
                                                    ↑ lowerHz NOT PASSED ← BUG
```

The production path:
- Measures P19 across `[0 → transition]` — **INCLUDES the roll-off region below F3**
- Uses a flat 70–200 Hz median as the target — **does NOT roll off at LF**
- Uses the 60–200 Hz median for P18 (same as canonical)

---

## The Three Issues

### Issue 1 (PRIMARY): Missing `lowerHz` in production P19/P20 calls

**File:** `src/components/hooks/useRP22AnalysisEngine.jsx`, line 980 and 982

```js
// Line 980 — lowerHz (achieved P18 F3) is NOT passed
bassP19 = computeParam19Deviation(finalRspBassCurve, transitionHz);

// Line 982-987 — lowerHz is NOT passed
bassP20 = computeParam20SeatConsistency({
  rspResponse: rspBassResponse,
  perSeatResponses: usableSeatResponses,
  transitionHz,
  rspSeatId: rspSeatIdForBass,
});
```

Both functions accept a `lowerHz` parameter that filters the assessment band to `[lowerHz → transition]`. When `lowerHz` is null (as here), the assessment band is `[0 → transition]`.

**Impact:** P19 picks the maximum deviation across the full low-frequency range. Below the P18 F3, the response is naturally rolling off (that's what F3 means — it's the -3 dB point). At frequencies well below F3, the response could be -10 to -20 dB below the target. P19 picks this as the maximum deviation, producing a large deficit.

This is the "extension roll-off penalised twice" that was suspected:
- P18 says "extension is 28 Hz" (the -3 dB point)
- P19 measures deviation from target down to ~15 Hz, finding -15 dB there
- P19 fails by 12 dB even though P18 says the extension is 28 Hz

The canonical path correctly bounds P19 to `[P18 F3 → transition]`, excluding the roll-off region.

### Issue 2 (SECONDARY): Different reference baselines between P18 and P19

| Metric | Reference Band | Source |
|--------|----------------|--------|
| P18 F3 | 60–200 Hz median | `computeInRoomF3FromResponseCurve` (line 167) |
| P19 (production) | 70–200 Hz median | `computeParam19Deviation` (line 515) |
| P19 (canonical) | T(f) target curve | `computeOfficialP19Assessment` (line 62) |

The production P19 uses a **70–200 Hz** median, while P18 uses a **60–200 Hz** median. If there's a modal feature in 60–70 Hz, the references differ.

At the P18 F3 frequency, the response is at `refDb(60-200) − 3`. The production P19 deviation at F3 is:
```
|refDb(60-200) − 3 − refDb(70-200)|
```
If `refDb(70-200) > refDb(60-200)` (e.g. a 3 dB modal dip in 60–70 Hz), this gives:
```
refDb(70-200) − refDb(60-200) + 3 = 3 + 3 = 6 dB
```
This matches the observed "6–8 dB" deficit.

### Issue 3 (TERTIARY): Flat target vs. house-curve target

| Path | P19 Target | Behaviour at LF |
|------|-----------|-----------------|
| Canonical | T(f) — practical calibration target | Rolls off at LF, matching natural response |
| Production | 70–200 Hz median (flat) | Stays flat at LF, amplifying deviation |

The canonical path's T(f) target rolls off at low frequencies, so the deviation at the P18 F3 is smaller (the target is lower there). The production path's flat target doesn't roll off, so the deviation at F3 is the full -3 dB plus any reference-band difference.

---

## Verification: Does REW reproduce the same deficit?

**If REW measures P19 with a flat target across [0 → transition]:** Yes, REW would reproduce the same deficit. This is a measurement convention issue, not a modal engine issue. REW measures whatever band you tell it to.

**If REW measures P19 with a house-curve target across [F3 → transition]:** No, REW would NOT reproduce the deficit. The canonical path already uses this convention and does not have the deficit.

**Conclusion:** The deficit is a **reference-path bug in the production engine**, not a definitional/target alignment issue. The canonical path already has the correct convention. The fix is to align the production path with the canonical path.

---

## Recommended Fix (NOT YET APPLIED — per user instruction "Do not change P19 grading yet")

### Fix 1 (Primary): Pass `lowerHz` to production P19/P20

In `src/components/hooks/useRP22AnalysisEngine.jsx`, line 980:

```js
// BEFORE (buggy):
bassP19 = computeParam19Deviation(finalRspBassCurve, transitionHz);

// AFTER (fixed):
bassP19 = computeParam19Deviation(finalRspBassCurve, transitionHz, bassP18?.value ?? null);
```

And line 982-987:

```js
// BEFORE (buggy):
bassP20 = computeParam20SeatConsistency({
  rspResponse: rspBassResponse,
  perSeatResponses: usableSeatResponses,
  transitionHz,
  rspSeatId: rspSeatIdForBass,
});

// AFTER (fixed):
bassP20 = computeParam20SeatConsistency({
  rspResponse: rspBassResponse,
  perSeatResponses: usableSeatResponses,
  transitionHz,
  rspSeatId: rspSeatIdForBass,
  lowerHz: bassP18?.value ?? null,
});
```

### Fix 2 (Secondary): Align P19 reference band with P18

In `src/components/utils/rp22BassMetrics.jsx`, `computeParam19Deviation` line 515:

```js
// BEFORE:
const bandHigh = smoothed.filter((p) => p.frequency >= 70 && p.frequency <= 200);

// AFTER (align with P18's 60–200 Hz):
const bandHigh = smoothed.filter((p) => p.frequency >= 60 && p.frequency <= 200);
```

### Fix 3 (Tertiary): Use the practical calibration target T(f) instead of flat median

This is a larger change — the production P19 would need to use the same T(f) target curve as the canonical path, rather than a flat median. This would make the production path fully consistent with the canonical path.

---

## Summary

| Check | Finding |
|-------|---------|
| achieved P18 −3 dB point | Computed correctly (60–200 Hz median, METHOD A) |
| target-curve level at that frequency | Production: flat 70–200 Hz median (wrong); Canonical: T(f) house curve (correct) |
| final post-EQ RSP level | Same curve used by both paths |
| product roll-off/capability contribution | Not the issue — P18 F3 already accounts for product capability floor |
| normalization/anchor before P19 | Production: 70–200 Hz median; Canonical: T(f) target |
| same reference baseline for P18 and P19? | **NO** — P18 uses 60–200 Hz, P19 uses 70–200 Hz |
| extension roll-off penalised twice? | **YES** — production P19 measures below P18 F3; canonical does not |
| REW reproduces the deficit? | Only if REW uses a flat target across [0 → transition]; not if bounded to [F3 → transition] with T(f) |
| Sound Proof alone shows it? | **YES** — the production path has the bug; the canonical path does not |

**Root cause:** The production P19/P20 calls in `useRP22AnalysisEngine.jsx` do not pass `lowerHz` (the achieved P18 F3), causing P19 to measure deviation below the extension point where the response is naturally rolling off. This is a reference-path bug, not a modal engine or definitional issue.